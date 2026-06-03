import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";

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

    return new Response(buffer, {
      headers: {
        "Content-Type": asset.mime_type || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(
          asset.file_name || "file",
        )}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error: any) {
    return jsonError(error?.message || "Errore recupero file", 500);
  }
}
