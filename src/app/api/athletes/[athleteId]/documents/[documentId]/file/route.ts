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
import { buildStoredFileResponse } from "@/lib/server/stored-file-response";

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

    /*
      `?download` distingue le due cose. Prima la risposta era **sempre**
      `attachment`: «Visualizza» su un documento dell'atleta scaricava il file
      invece di mostrarlo, e mancava `nosniff` (RC Fix 1, punto 8).
    */
    return buildStoredFileResponse({
      content: Buffer.from(base64, "base64"),
      mimeType: asset.mime_type,
      fileName: firstText(asset.file_name, document.fileName, "documento"),
      download: new URL(request.url).searchParams.has("download"),
    });
  } catch (error: any) {
    return jsonError(error?.message || "Errore download documento", 500);
  }
}

