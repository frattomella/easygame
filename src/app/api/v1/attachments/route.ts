import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  createAttachment,
  listAttachments,
} from "@/lib/server/attachments";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";
import { MAX_ATTACHMENT_BYTES } from "@/lib/attachments";

/**
 * Allegati: elenco e caricamento.
 *
 *   GET  /api/v1/attachments?owner_type=athlete&owner_id=…   metadati, mai byte
 *   POST /api/v1/attachments                                 multipart/form-data
 *
 * **Perche multipart e non JSON con base64.** Base64 costa il 33% in piu, e
 * caricare un PDF da 8 MB come stringa JSON vuol dire tenerne in memoria tre
 * copie fra parsing e decodifica. Il browser sa gia inviare un file: qui lo si
 * lascia fare.
 *
 * L'autorizzazione e quella di sempre: sessione valida, poi
 * `organization_id` risolto dallo scope. Un allegato non e mai «pubblico».
 */

export const runtime = "nodejs";

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

const failure = (error: any, fallback: string) => {
  const message = String(error?.message || fallback);
  const status = message.includes("Accesso negato") ? 403 : 400;
  return NextResponse.json({ data: null, error: { message } }, { status });
};

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const url = new URL(request.url);
    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      url.searchParams.get("organization_id") ||
        request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    const attachments = await listAttachments(
      {
        organizationId: url.searchParams.get("organization_id"),
        ownerType: url.searchParams.get("owner_type"),
        ownerId: url.searchParams.get("owner_id"),
        category: url.searchParams.get("category"),
      },
      scope,
    );

    return NextResponse.json({ data: attachments, error: null });
  } catch (error: any) {
    return failure(error, "Errore nella lettura degli allegati");
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    const form = await request.formData();
    const file = form.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { data: null, error: { message: "Nessun file ricevuto." } },
        { status: 400 },
      );
    }

    /*
      Il controllo di dimensione si fa prima di leggere i byte: `arrayBuffer()`
      su un file da 200 MB li porta tutti in memoria prima che qualcuno possa
      rifiutarli.
    */
    if (Number(file.size || 0) > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: `Il file supera il limite di ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB.`,
          },
        },
        { status: 413 },
      );
    }

    const content = Buffer.from(await file.arrayBuffer());

    const metadata = await createAttachment(
      {
        organizationId: String(form.get("organization_id") || "") || null,
        ownerType: String(form.get("owner_type") || "other"),
        ownerId: String(form.get("owner_id") || ""),
        category: String(form.get("category") || "documento"),
        fileName: String(form.get("file_name") || file.name || "documento"),
        mimeType: String(form.get("mime_type") || file.type || ""),
        content,
      },
      scope,
    );

    await recordAuditEvent({
      action: AUDIT_ACTIONS.resourceCreated,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: scope.activeRole,
      organizationId: metadata.organizationId,
      resource: "attachments",
      resourceId: metadata.id,
      request,
      metadata: {
        ownerType: metadata.ownerType,
        ownerId: metadata.ownerId,
        category: metadata.category,
        sizeBytes: metadata.sizeBytes,
        mimeType: metadata.mimeType,
      },
    });

    return NextResponse.json({ data: metadata, error: null }, { status: 201 });
  } catch (error: any) {
    return failure(error, "Caricamento dell'allegato non riuscito");
  }
}
