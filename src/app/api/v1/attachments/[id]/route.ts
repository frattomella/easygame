import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  deleteAttachment,
  readAttachment,
  replaceAttachmentContent,
} from "@/lib/server/attachments";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";
import { MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import {
  extensionForMime,
  extensionFromFileName,
  sanitizeFileNamePart,
} from "@/lib/attachment-names";

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

    const url = new URL(request.url);
    const wantsDownload = url.searchParams.has("download");
    const fileName = safeDownloadName(
      url.searchParams.get("download"),
      attachment.metadata.fileName,
      attachment.metadata.mimeType,
    );

    /*
      `inline` per la visualizzazione, `attachment` per il download. E la
      differenza fra «il PDF si apre nel visualizzatore» e «il PDF finisce in
      Download»: entrambe servono, e finora nessuna delle due funzionava
      perche il file era un data URL che il browser rifiutava di navigare.
    */
    return new NextResponse(new Uint8Array(attachment.content), {
      status: 200,
      headers: {
        "Content-Type": attachment.metadata.mimeType,
        "Content-Length": String(attachment.content.length),
        "Content-Disposition": `${wantsDownload ? "attachment" : "inline"}; filename="${fileName}"`,
        // Un allegato e un dato di club: non deve finire in nessuna cache
        // condivisa. `private` permette comunque la cache del browser.
        "Cache-Control": "private, max-age=0, must-revalidate",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
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
