import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { getParentDashboardData } from "@/lib/server/parent-dashboard";

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

    const asset = await prisma.asset.findFirst({
      where: {
        id: context.params.assetId,
        bucket: "parent-documents",
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

    return new Response(body, {
      headers: {
        "content-type": asset.mime_type || "application/octet-stream",
        "content-disposition": `attachment; filename="${asset.file_name || "documento"}"`,
      },
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
