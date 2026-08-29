import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  deleteAttachment,
  getAttachmentMetadata,
  readAttachment,
  replaceAttachmentContent,
} from "@/lib/server/attachments";
import { canManageClubConfiguration } from "@/lib/access-roles";
import { canReadAnnouncementAttachment } from "@/lib/server/announcements";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";
import { MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import {
  extensionForMime,
  extensionFromFileName,
  sanitizeFileNamePart,
} from "@/lib/attachment-names";
import { buildStoredFileResponse } from "@/lib/server/stored-file-response";

/**
 * Un allegato: guardalo, scaricalo, sostituiscilo, eliminalo.
 *
 *   GET    /api/v1/attachments/:id              i byte, con il MIME giusto
 *   GET    /api/v1/attachments/:id?download=…   gli stessi byte, come download
 *   PUT    /api/v1/attachments/:id              sostituzione (multipart)
 *   DELETE /api/v1/attachments/:id
 *
 * **Perche `GET` restituisce il file e non un URL firmato.** Un URL firmato
 * sposterebbe l'autorizzazione fuori dall'applicazione, dentro il provider di
 * storage — cioe esattamente il lock-in che ADR-0007 vieta. Qui la richiesta
 * passa dalla sessione EasyGame come ogni altra, e cambiare provider non
 * cambia il contratto.
 *
 * **Perche il nome del download arriva in query.** Il nome leggibile
 * (`BLSD_Rossi_Mario_2026-08-25.pdf`) si costruisce dai dati della persona,
 * che vivono nel record di dominio e non nell'allegato. Il server non lo
 * inventa: lo riceve, lo ripulisce e lo mette nell'header — cosi il file
 * arriva con il nome giusto anche quando l'utente fa «Salva con nome» da una
 * scheda aperta.
 */

export const runtime = "nodejs";

type Context = { params: { id: string } };

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

const notFound = () =>
  NextResponse.json(
    { data: null, error: { message: "Allegato non trovato" } },
    { status: 404 },
  );

const failure = (error: any, fallback: string) => {
  const message = String(error?.message || fallback);
  const status = message.includes("Accesso negato") ? 403 : 400;
  return NextResponse.json({ data: null, error: { message } }, { status });
};

const scopeFor = async (request: Request, session: any) =>
  resolveOrganizationScopeForUser(
    session.db.user_id,
    request.headers.get("x-active-club-id"),
    request.headers.get("x-active-access-role"),
  );

/**
 * Gli allegati **del club** sono configurazione del club.
 *
 * **Il difetto che questa guardia chiude (FIRMA-01).** Fino alla Wave 1 queste
 * rotte autorizzavano solo su sessione e appartenenza al club: qualunque
 * membro — un collaboratore, un allenatore — poteva elencare gli allegati del
 * club, trovare la firma del presidente e **sostituirla o cancellarla**,
 * scavalcando il gate che la sua schermata applica. Su una firma che finisce
 * dentro i documenti che la societa emette non e un dettaglio.
 *
 * La regola e minima di proposito: non un permesso nuovo per la firma — che e
 * cio che il planning ha deciso di non copiare da Golee — ma il permesso che
 * gia governa la configurazione del club esteso a cio che, per `owner_type`,
 * **e** configurazione del club. Gli allegati delle persone non cambiano
 * perimetro.
 *
 * La **lettura** resta a chi appartiene al club: serve all'anteprima e ai
 * documenti che stampa anche la segreteria.
 */
/**
 * I proprietari il cui allegato **e** configurazione del club.
 *
 * `announcement` e stato aggiunto dalla Wave 2 e all'inizio la guardia lo
 * copriva **solo in caricamento**: sostituzione e cancellazione uscivano al
 * primo `if` perche confrontavano con la sola stringa `"club"`. Il risultato
 * era che un membro qualunque del club poteva sostituire il PDF allegato a un
 * annuncio pubblicato dalla societa — stesso identificativo, stesso
 * riferimento, contenuto suo — o cancellarlo.
 */
const CLUB_OWNED_ATTACHMENT_TYPES = new Set(["club", "announcement"]);

/**
 * La lettura dell'allegato di un annuncio passa dal pubblico dell'annuncio.
 *
 * Solleva un errore che la rotta mappa su **404** e non su 403: chi non e
 * destinatario non deve nemmeno sapere che quell'allegato esiste.
 */
const assertAnnouncementAttachmentReadable = async (
  metadata: any,
  scope: any,
  userId: string,
) => {
  const ownerType = String(metadata?.ownerType || metadata?.owner_type || "")
    .trim()
    .toLowerCase();
  if (ownerType !== "announcement") return;

  const consentito = await canReadAnnouncementAttachment({
    organizationId: String(metadata?.organizationId || ""),
    activeOrganizationId: scope?.activeOrganizationId,
    announcementId: String(metadata?.ownerId || ""),
    userId,
    activeRole: scope?.activeRole,
  });

  if (!consentito) {
    throw new Error("Allegato non trovato");
  }
};

const assertClubAttachmentWritable = (metadata: any, scope: any) => {
  const ownerType = String(metadata?.ownerType || metadata?.owner_type || "")
    .trim()
    .toLowerCase();

  if (!CLUB_OWNED_ATTACHMENT_TYPES.has(ownerType)) {
    return;
  }

  /*
    Il ruolo vale per il club **attivo**. Se l'allegato appartiene a un altro
    club fra quelli a cui l'utente ha accesso, quel ruolo non dice niente su
    questo allegato: chi e collaboratore nel club B e proprietario del proprio
    club A passerebbe il controllo con il cappello di A e riscriverebbe la
    firma di B. Il ruolo e la cosa su cui decide devono parlare dello stesso
    club.
  */
  const owner = String(metadata?.organizationId || "");
  if (!owner || owner !== String(scope?.activeOrganizationId || "")) {
    throw new Error(
      "Accesso negato: gli allegati del club si gestiscono dal club attivo",
    );
  }

  if (!canManageClubConfiguration(scope?.activeRole)) {
    throw new Error(
      "Accesso negato: gli allegati del club li gestisce chi ne gestisce la configurazione",
    );
  }
};

/**
 * Il nome che finisce nell'header.
 *
 * Si accetta solo cio che si e ripulito: un nome che arrivasse con un ritorno
 * a capo permetterebbe di aggiungere header alla risposta.
 */
const safeDownloadName = (
  requested: string | null,
  fallbackName: string,
  mimeType: string,
) => {
  const raw = String(requested || "").trim() || fallbackName;

  const stem = sanitizeFileNamePart(raw.replace(/\.[A-Za-z0-9]{1,5}$/, ""));
  if (!stem) return "documento";

  /*
    L'estensione la sa il server, non chi chiede il download: il client
    conosce il riferimento (`attachment:<id>`) ma non il tipo del file, e
    tirare a indovinare produceva i `BLSD_Rossi_Mario` senza estensione che
    il sistema operativo non sapeva aprire.
  */
  const extension =
    extensionFromFileName(raw) ||
    extensionForMime(mimeType) ||
    extensionFromFileName(fallbackName);

  return extension ? `${stem}.${extension}` : stem;
};

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const scope = await scopeFor(request, session);
    const attachment = await readAttachment(context.params.id, scope);
    if (!attachment) return notFound();

    /*
      L'allegato di un annuncio segue il **pubblico dell'annuncio**, non la sola
      appartenenza al club: senza questa riga un genitore dell'Under 16 che
      conoscesse l'identificativo scaricava il modulo allegato all'avviso
      dell'Under 14. Chi non ha diritto riceve **404**, come per un allegato
      che non esiste: un 403 direbbe che esiste.
    */
    await assertAnnouncementAttachmentReadable(
      attachment.metadata,
      scope,
      session.db.user_id,
    );

    const url = new URL(request.url);
    const wantsDownload = url.searchParams.has("download");
    const fileName = safeDownloadName(
      url.searchParams.get("download"),
      attachment.metadata.fileName,
      attachment.metadata.mimeType,
    );

    /*
      `inline` per la visualizzazione, `attachment` per il download. Gli
      header li costruisce `buildStoredFileResponse`, uno per tutte e tre le
      rotte che servono un file: qui la CSP conteneva `sandbox` e
      `default-src 'none'`, che insieme impedivano al browser di **disegnare
      un PDF** (RC Fix 1, punto 8).
    */
    return buildStoredFileResponse({
      content: attachment.content,
      mimeType: attachment.metadata.mimeType,
      fileName,
      download: wantsDownload,
    });
  } catch (error: any) {
    return failure(error, "Errore nella lettura dell'allegato");
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const scope = await scopeFor(request, session);

    const existing = await getAttachmentMetadata(context.params.id, scope);
    if (!existing) return notFound();
    assertClubAttachmentWritable(existing, scope);

    const form = await request.formData();
    const file = form.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { data: null, error: { message: "Nessun file ricevuto." } },
        { status: 400 },
      );
    }

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

    const metadata = await replaceAttachmentContent(
      context.params.id,
      {
        fileName: String(form.get("file_name") || file.name || "documento"),
        mimeType: String(form.get("mime_type") || file.type || ""),
        content: Buffer.from(await file.arrayBuffer()),
      },
      scope,
    );

    await recordAuditEvent({
      action: AUDIT_ACTIONS.resourceUpdated,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: scope.activeRole,
      organizationId: metadata.organizationId,
      resource: "attachments",
      resourceId: metadata.id,
      request,
      metadata: { sizeBytes: metadata.sizeBytes, mimeType: metadata.mimeType },
    });

    return NextResponse.json({ data: metadata, error: null });
  } catch (error: any) {
    if (String(error?.message || "").includes("non trovato")) return notFound();
    return failure(error, "Sostituzione dell'allegato non riuscita");
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const scope = await scopeFor(request, session);

    const existing = await getAttachmentMetadata(context.params.id, scope);
    if (!existing) return notFound();
    assertClubAttachmentWritable(existing, scope);

    const removed = await deleteAttachment(context.params.id, scope);
    if (!removed) return notFound();

    await recordAuditEvent({
      action: AUDIT_ACTIONS.resourceDeleted,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: scope.activeRole,
      organizationId: scope.activeOrganizationId,
      resource: "attachments",
      resourceId: context.params.id,
      request,
    });

    return NextResponse.json({ data: { id: context.params.id }, error: null });
  } catch (error: any) {
    return failure(error, "Eliminazione dell'allegato non riuscita");
  }
}
