import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import { buildStoredFileResponse } from "@/lib/server/stored-file-response";

type Context = {
  params: {
    assetId: string;
  };
};

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ data: null, error: { message } }, { status });

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return jsonError("Sessione non valida", 401);

    const asset = await prisma.asset.findUnique({
      where: { id: context.params.assetId },
    });
    if (!asset || asset.bucket !== "online-form-submissions") {
      return jsonError("File non trovato", 404);
    }

    const organizationId = String(asset.path || "").split("/")[0] || "";
    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      organizationId,
    );
    if (!organizationId || !scope.allowedOrganizationIds.includes(organizationId)) {
      return jsonError("Accesso negato", 403);
    }

    const raw = String(asset.data_base64 || "");
    const base64 = raw.includes(",") ? raw.split(",").pop() || "" : raw;
    const buffer = Buffer.from(base64, "base64");

    /*
      Prima: `inline` per **qualunque** tipo e senza `nosniff`, con il nome
      percent-encoded a schermo. Un file registrato con un tipo sbagliato
      poteva essere interpretato come pagina dentro l'origine di EasyGame
      (RC Fix 1, punto 8).
    */
    return buildStoredFileResponse({
      content: buffer,
      mimeType: asset.mime_type,
      fileName: asset.file_name || "file",
      download: new URL(request.url).searchParams.has("download"),
    });
  } catch (error: any) {
    return jsonError(error?.message || "Errore recupero file", 500);
  }
}
