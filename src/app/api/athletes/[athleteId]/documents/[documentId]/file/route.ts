import { NextResponse } from "next/server";
import {
  firstText,
  getSharedDocumentsFromAthlete,
} from "@/lib/shared-documents";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";

type Context = {
  params: {
    athleteId: string;
    documentId: string;
  };
};

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ data: null, error: { message } }, { status });

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return jsonError("Sessione non valida", 401);

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
    );
    const athlete = await prisma.athlete.findFirst({
      where: {
        id: context.params.athleteId,
        organization_id: { in: scope.allowedOrganizationIds },
      },
    });

    if (!athlete) return jsonError("Atleta non appartenente al club", 403);

    const document = getSharedDocumentsFromAthlete(athlete, {
      includeArchived: true,
    }).find(
      (item) =>
        item.id === context.params.documentId ||
        item.assetId === context.params.documentId,
    );

    if (!document?.assetId || document.archived) {
      return jsonError("Documento non trovato", 404);
    }

    const asset = await prisma.asset.findFirst({
      where: {
        id: document.assetId,
        bucket: { in: ["shared-documents", "parent-documents"] },
        path: {
          startsWith: `${athlete.organization_id}/${athlete.id}/`,
        },
      },
    });

    if (!asset?.data_base64) {
      return jsonError("File non disponibile", 404);
    }

    const base64 = asset.data_base64.includes(",")
      ? asset.data_base64.split(",").pop() || ""
      : asset.data_base64;

    return new Response(Buffer.from(base64, "base64"), {
      headers: {
        "content-type": asset.mime_type || "application/octet-stream",
        "content-disposition": `attachment; filename="${firstText(
          asset.file_name,
          document.fileName,
          "documento",
        )}"`,
      },
    });
  } catch (error: any) {
    return jsonError(error?.message || "Errore download documento", 500);
  }
}

