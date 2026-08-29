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
import { canManageClubConfiguration } from "@/lib/access-roles";
import { hasCommunicationPermission } from "@/lib/communications/permissions";

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

    const ownerType = String(url.searchParams.get("owner_type") || "")
      .trim()
      .toLowerCase();

    /*
      Gli allegati di un annuncio seguono il **pubblico dell'annuncio**, non la
      sola appartenenza al club. Senza questa riga
      `?owner_type=announcement` — anche **senza** `owner_id` — restituiva a
      qualunque membro i metadati di ogni allegato di ogni annuncio, bozze
      comprese, e da li si scaricava per identificativo.

      L'elenco si concede solo a chi governa la bacheca; un destinatario chiede
      il singolo allegato, e li il pubblico viene verificato.
    */
    if (
      ownerType === "announcement" &&
      !hasCommunicationPermission(scope.activeRole, "board.publish")
    ) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Accesso negato: gli allegati della bacheca si elencano da chi la pubblica",
          },
        },
        { status: 403 },
      );
    }

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

    /*
      Un allegato con `owner_type: "club"` **e** configurazione del club — la
      firma del presidente e il timbro sono i primi, e finiscono dentro i
      documenti che la societa emette. Lo governa il permesso che gia governa
      la configurazione, non un permesso nuovo (FIRMA-01). Gli allegati delle
      persone non cambiano perimetro.
    */
    // `createAttachment` normalizza il proprietario in minuscolo: se la
    // guardia confrontasse la stringa cosi com'e, `owner_type=CLUB`
    // supererebbe il controllo e verrebbe salvato come `club`.
    /*
      L'allegato di un **annuncio** segue la stessa regola: lo carica chi puo
      pubblicare in bacheca, che oggi e lo stesso perimetro di
      `canManageClubConfiguration` (`src/lib/communications/permissions.ts`).
      Senza questa riga un allenatore potrebbe caricare un file e poi
      allegarlo a un annuncio che non puo pubblicare — un file orfano dentro
      l'archivio del club, senza nessuno che risponda di averlo messo li.
    */
    const ownerTypeCaricato = String(form.get("owner_type") || "other")
      .trim()
      .toLowerCase();

    if (
      (ownerTypeCaricato === "club" || ownerTypeCaricato === "announcement") &&
      !canManageClubConfiguration(scope.activeRole)
    ) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Accesso negato: gli allegati del club li gestisce chi ne gestisce la configurazione",
          },
        },
        { status: 403 },
      );
    }

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
