import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { canManageClubConfiguration } from "@/lib/access-roles";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";
import { buildStoredFileResponse } from "@/lib/server/stored-file-response";
import {
  deleteClubSignature,
  getClubSignature,
  readClubSignatureImage,
  saveClubSignature,
  type ClubSignature,
} from "@/lib/server/club-signature";
import {
  CLUB_SIGNATURE_KINDS,
  MAX_CLUB_SIGNATURE_BYTES,
} from "@/lib/club-signature";

/**
 * Firma e timbro del presidente.
 *
 *   GET    /api/v1/clubs/:id/signature            metadati di entrambi (JSON)
 *   GET    /api/v1/clubs/:id/signature?kind=…     i byte dell'immagine
 *   PUT    /api/v1/clubs/:id/signature            carica o sostituisce (multipart)
 *   DELETE /api/v1/clubs/:id/signature?kind=…     rimuove
 *
 * **Perche una rotta dedicata e non quella generica degli allegati.** Le rotte
 * allegati autorizzano su sessione e appartenenza al club, e nient'altro: chi
 * fa parte della societa puo caricarci quello che vuole. Per una firma non
 * basta. La firma del presidente e cio con cui una ricevuta diventa un
 * documento della societa: caricarla, sostituirla o toglierla e un atto di
 * configurazione, e lo compie chi ha il diritto di configurare il club —
 * `canManageClubConfiguration`, cioe proprietario e gestore.
 *
 * **La lettura invece e di tutto il club.** Serve all'anteprima nella scheda
 * e serve al generatore documentale, che gira per conto di chi sta stampando
 * una ricevuta: restringerla ai gestori significherebbe che una ricevuta
 * emessa dalla segreteria esce senza firma. Non e comunque un file pubblico:
 * niente cache condivisa, `nosniff`, e i byte escono solo verso chi appartiene
 * a **quel** club.
 */

export const runtime = "nodejs";

type Context = { params: { id: string } };

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

const notFound = (message = "Firma non trovata") =>
  NextResponse.json({ data: null, error: { message } }, { status: 404 });

/**
 * Vero se il messaggio viene dall'ORM o dal driver, non dal dominio.
 *
 * Un identificativo di club malformato — un link vecchio, un copia-incolla
 * monco — arriva fino a `findUnique` e ne farebbe uscire il testo intero:
 * nome dei modelli, query, codice d'errore di Postgres. E un difetto gia
 * corretto nel lavoro sportivo, e non va reintrodotto qui.
 */
const isInfrastructureError = (message: string) =>
  /Invalid `prisma\.|ConnectorError|PostgresError|invalid input syntax for type uuid|\bat .*node_modules/i.test(
    message,
  );

const failure = (error: any, fallback: string) => {
  const raw = String(error?.message || fallback);

  if (/invalid input syntax for type uuid/i.test(raw)) {
    return notFound("Club non trovato");
  }

  if (isInfrastructureError(raw)) {
    console.error("[club-signature] errore non gestito:", error);
    return NextResponse.json(
      { data: null, error: { message: fallback } },
      { status: 400 },
    );
  }

  const status = raw.includes("Accesso negato")
    ? 403
    : /non trovat[ao]/i.test(raw)
      ? 404
      : 400;

  return NextResponse.json({ data: null, error: { message: raw } }, { status });
};

/**
 * Sessione, club della rotta e ruolo attivo **in quel club**.
 *
 * L'identificativo del club arriva dal percorso e non dall'header: passarlo a
 * `resolveOrganizationScopeForUser` fa risolvere il ruolo sulla societa che si
 * sta modificando, non su quella che il browser aveva aperta.
 */
const resolveContext = async (request: Request, organizationId: string) => {
  const session = await requireAuthenticatedUser(request);
  if (!session) return null;

  const scope = await resolveOrganizationScopeForUser(
    session.db.user_id,
    organizationId || request.headers.get("x-active-club-id"),
    request.headers.get("x-active-access-role"),
  );

  if (!scope.allowedOrganizationIds.includes(organizationId)) {
    throw new Error("Accesso negato: il club non e fra quelli accessibili");
  }

  return { session, scope };
};

/** Il gate di scrittura, con il diniego tracciato come evento di sicurezza. */
const assertCanManage = async (
  request: Request,
  actor: { userId: string; email: string; role: string | null },
  organizationId: string,
) => {
  if (canManageClubConfiguration(actor.role)) return;

  await recordAuditEvent({
    action: AUDIT_ACTIONS.resourceAccessDenied,
    outcome: "denied",
    actorUserId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    organizationId,
    resource: "club_signature",
    resourceId: organizationId,
    request,
    metadata: { method: request.method },
  });

  throw new Error(
    "Accesso negato: firma e timbro li gestiscono il proprietario e il gestore del club",
  );
};

export async function GET(request: Request, context: Context) {
  const organizationId = String(context.params.id || "").trim();

  try {
    const resolved = await resolveContext(request, organizationId);
    if (!resolved) return unauthorized();

    const url = new URL(request.url);
    const kind = String(url.searchParams.get("kind") || "").trim();

    /*
      Senza `kind` la domanda e «che cosa c'e?», e la risposta e JSON: la
      scheda del club deve poter disegnare due riquadri vuoti senza scaricare
      due immagini che non esistono.
    */
    if (!kind) {
      const entries = await Promise.all(
        CLUB_SIGNATURE_KINDS.map(
          async (value): Promise<[string, ClubSignature | null]> => [
            value,
            await getClubSignature(organizationId, value, resolved.scope),
          ],
        ),
      );

      return NextResponse.json({
        data: {
          organizationId,
          signatures: Object.fromEntries(entries),
          canManage: canManageClubConfiguration(resolved.scope.activeRole),
        },
        error: null,
      });
    }

    const image = await readClubSignatureImage(
      organizationId,
      kind,
      resolved.scope,
    );
    if (!image) return notFound();

    /*
      Una firma non cambia quasi mai e compare su ogni documento: l'ETag e
      l'impronta del contenuto, che il servizio allegati calcola gia.
    */
    const etag = `"${image.metadata.checksum}"`;
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag } });
    }

    const response = buildStoredFileResponse({
      content: image.content,
      mimeType: image.metadata.mimeType,
      fileName: image.metadata.fileName,
    });
    response.headers.set("ETag", etag);

    return response;
  } catch (error: any) {
    return failure(error, "Errore nella lettura della firma");
  }
}

export async function PUT(request: Request, context: Context) {
  const organizationId = String(context.params.id || "").trim();

  try {
    const resolved = await resolveContext(request, organizationId);
    if (!resolved) return unauthorized();

    await assertCanManage(
      request,
      {
        userId: resolved.session.db.user_id,
        email: resolved.session.db.user.email,
        role: resolved.scope.activeRole,
      },
      organizationId,
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
      La dimensione si controlla prima di leggere i byte: `arrayBuffer()` su un
      file da 200 MB li porta tutti in memoria prima che qualcuno li rifiuti.
    */
    if (Number(file.size || 0) > MAX_CLUB_SIGNATURE_BYTES) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: `L'immagine supera il limite di ${Math.round(MAX_CLUB_SIGNATURE_BYTES / (1024 * 1024))} MB.`,
          },
        },
        { status: 413 },
      );
    }

    const saved = await saveClubSignature(
      {
        organizationId,
        kind: String(form.get("kind") || ""),
        fileName: String(form.get("file_name") || file.name || ""),
        mimeType: String(form.get("mime_type") || file.type || ""),
        content: Buffer.from(await file.arrayBuffer()),
      },
      resolved.scope,
    );

    await recordAuditEvent({
      action: AUDIT_ACTIONS.resourceUpdated,
      actorUserId: resolved.session.db.user_id,
      actorEmail: resolved.session.db.user.email,
      actorRole: resolved.scope.activeRole,
      organizationId,
      resource: "club_signature",
      resourceId: organizationId,
      request,
      metadata: {
        kind: saved.kind,
        category: saved.category,
        attachmentId: saved.metadata.id,
        mimeType: saved.metadata.mimeType,
        sizeBytes: saved.metadata.sizeBytes,
      },
    });

    return NextResponse.json({ data: saved, error: null });
  } catch (error: any) {
    return failure(error, "Caricamento della firma non riuscito");
  }
}

export async function DELETE(request: Request, context: Context) {
  const organizationId = String(context.params.id || "").trim();

  try {
    const resolved = await resolveContext(request, organizationId);
    if (!resolved) return unauthorized();

    await assertCanManage(
      request,
      {
        userId: resolved.session.db.user_id,
        email: resolved.session.db.user.email,
        role: resolved.scope.activeRole,
      },
      organizationId,
    );

    const url = new URL(request.url);
    const kind = String(url.searchParams.get("kind") || "");

    const removed = await deleteClubSignature(
      organizationId,
      kind,
      resolved.scope,
    );
    if (!removed) return notFound();

    await recordAuditEvent({
      action: AUDIT_ACTIONS.resourceUpdated,
      actorUserId: resolved.session.db.user_id,
      actorEmail: resolved.session.db.user.email,
      actorRole: resolved.scope.activeRole,
      organizationId,
      resource: "club_signature",
      resourceId: organizationId,
      request,
      metadata: { kind: kind.trim().toLowerCase(), removed: true },
    });

    return NextResponse.json({ data: { removed: true }, error: null });
  } catch (error: any) {
    return failure(error, "Rimozione della firma non riuscita");
  }
}
