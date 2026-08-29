import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  buildCommunicationPreview,
  sendCommunication,
} from "@/lib/server/communications";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";
import { publicErrorMessage } from "@/lib/server/api-errors";

/**
 * La comunicazione massiva alle famiglie (W2-C, G-07).
 *
 *   POST /api/v1/communications  { criteria, template, preview: true }  anteprima
 *   POST /api/v1/communications  { criteria, template, communication_id }  invio
 *
 * **Perche una rotta sola e non due.** Anteprima e invio partono dallo stesso
 * input e devono vedere **la stessa cosa**: due rotte sarebbero due porte
 * sullo stesso calcolo, e la prima volta che una delle due cambia la schermata
 * mostrerebbe un elenco di destinatari diverso da quello che riceve il
 * messaggio. E la stessa scelta gia fatta dal sollecito di Wave 1.
 *
 * **Perche `POST` anche per l'anteprima.** L'input contiene il corpo del
 * messaggio: una `GET` lo porterebbe nella query string, cioe negli access log
 * e nella cronologia del browser. E una simulazione, non una lettura da
 * mettere in cache.
 *
 * **Chi puo mandare.** Il permesso lo verifica il dominio
 * (`communications.send`, e `communications.audience_economic` quando la
 * selezione riguarda chi non ha pagato): qui non si duplica la matrice.
 */

export const runtime = "nodejs";

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

const failure = (error: any, fallback: string) => {
  const message = publicErrorMessage(error, fallback);
  const status = message.includes("Accesso negato") ? 403 : 400;
  return NextResponse.json({ data: null, error: { message } }, { status });
};

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    const body = await request.json().catch(() => ({}));

    const template = {
      subject: String(body?.template?.subject ?? ""),
      body: String(body?.template?.body ?? ""),
    };
    const criteria = body?.criteria;
    const communicationId = body?.communication_id ?? body?.communicationId;

    if (body?.preview === true) {
      const preview = await buildCommunicationPreview({
        criteria,
        template,
        communicationId,
        scope,
        actorRole: scope.activeRole,
      });
      return NextResponse.json({ data: preview, error: null });
    }

    const outcome = await sendCommunication({
      criteria,
      template,
      communicationId,
      scope,
      actorRole: scope.activeRole,
    });

    await recordAuditEvent({
      action: AUDIT_ACTIONS.communicationSent,
      /*
        Un invio in cui nessun messaggio e partito non e un successo: il log
        deve poterlo distinguere senza leggere i metadati.
      */
      outcome: outcome.totals.sent > 0 ? "success" : "failure",
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: scope.activeRole,
      organizationId: outcome.organizationId,
      resource: "communications",
      metadata: {
        communicationId: outcome.communicationId,
        sent: outcome.totals.sent,
        skipped: outcome.totals.skipped,
        failed: outcome.totals.failed,
        remaining: outcome.remaining,
        emailConfigured: outcome.emailConfigured,
      },
    });

    return NextResponse.json({ data: outcome, error: null });
  } catch (error: any) {
    return failure(error, "Invio della comunicazione non riuscito");
  }
}
