import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { buildStoredFileResponse } from "@/lib/server/stored-file-response";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { getParentDashboardData } from "@/lib/server/parent-dashboard";
import { getSharedDocumentsFromAthlete } from "@/lib/shared-documents";

type Context = {
  params: {
    athleteId: string;
    assetId: string;
  };
};

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Sessione non valida" },
        },
        { status: 401 },
      );
    }

    const dashboard = await getParentDashboardData(
      session.db.user_id,
      context.params.athleteId,
    );
    if (!dashboard) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Atleta non collegato a questo account" },
        },
        { status: 403 },
      );
    }

    const document = getSharedDocumentsFromAthlete({
      id: dashboard.athlete.id,
      organization_id: dashboard.club.id,
      data: dashboard.athlete.data,
    }).find((item) => item.assetId === context.params.assetId);

    if (!document?.visibleToParent) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Documento non visibile" },
        },
        { status: 403 },
      );
    }

    const asset = await prisma.asset.findFirst({
      where: {
        id: context.params.assetId,
        bucket: { in: ["parent-documents", "shared-documents"] },
        path: {
          startsWith: `${dashboard.club.id}/${dashboard.athlete.id}/`,
        },
      },
    });

    if (!asset?.data_base64) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Documento non trovato" },
        },
        { status: 404 },
      );
    }

    const base64 = asset.data_base64.includes(",")
      ? asset.data_base64.split(",").pop() || ""
      : asset.data_base64;
    const body = Buffer.from(base64, "base64");

    /*
      Anche il genitore deve poter **guardare** un documento, non solo
      scaricarlo: la risposta era sempre `attachment` e senza `nosniff`
      (RC Fix 1, punto 8).
    */
    return buildStoredFileResponse({
      content: body,
      mimeType: asset.mime_type,
      fileName: asset.file_name || "documento",
      download: new URL(request.url).searchParams.has("download"),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error?.message || "Errore download documento",
        },
      },
      { status: 500 },
    );
  }
}
