import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { assertCommunicationPermission } from "@/lib/communications/permissions";
import {
  buildPaymentLinkPath,
  issuePaymentLink,
  resolvePaymentLinkOrigin,
} from "@/lib/server/payment-links";
import { publicErrorMessage } from "@/lib/server/api-errors";

/**
 * L'emissione di un link di pagamento (G-06, W2-B).
 *
 *   POST /api/v1/payment-links   { payment_id, ttl_days? }
 *
 * **Chi puo emettere, e perche questo permesso.** Si usa
 * `assertCommunicationPermission(role, "communications.send")` e non
 * `canManageClubConfiguration` **direttamente**, pur essendo oggi lo stesso
 * perimetro: la matrice di `src/lib/communications/permissions.ts` delega a
 * `canManageClubConfiguration` al proprio interno, quindi chi puo emettere un
 * link e per costruzione esattamente chi poteva gia sollecitare un insoluto in
 * Wave 1 — il perimetro **coincide**, non e stato riscritto. Il guadagno e che
 * la decisione diventa esplicita e spostabile: il giorno in cui una segreteria
 * potra mandare comunicazioni senza gestire la configurazione del club, il
 * link di pagamento la seguira senza che nessuno debba ricordarsi di questa
 * riga. Un link di pagamento **e** una comunicazione: nasce per stare dentro
 * un sollecito, e fuori da un messaggio non serve a niente.
 *
 * **L'entitlement mancante non e un errore del chiamante.** Se il club non ha
 * `online_payments` il dominio non emette e lo dichiara con un esito
 * tipizzato: la rotta lo traduce in un `409` con un codice riconoscibile,
 * perche il sollecito possa dire «questo club non puo incassare online» e
 * mandare comunque il messaggio senza il link.
 *
 * **Il token esce di qui una volta sola.** In archivio c'e solo la sua
 * impronta: se chi lo ha chiesto lo perde, non lo recupera nessuno e se ne
 * emette un altro.
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

    assertCommunicationPermission(scope.activeRole, "communications.send");

    const body = await request.json().catch(() => ({}));
    const paymentId = String(
      body?.payment_id ?? body?.paymentId ?? "",
    ).trim();

    if (!paymentId) {
      return NextResponse.json(
        { data: null, error: { message: "Nessuna rata indicata" } },
        { status: 400 },
      );
    }

    const result = await issuePaymentLink({
      /*
        Il club **non** arriva dal corpo: lo dice la sessione, ed e la stessa
        regola del sollecito di Wave 1. Il dominio rifiuta comunque un club
        diverso da quello attivo.
      */
      organizationId: null,
      paymentId,
      ttlDays: body?.ttl_days ?? body?.ttlDays ?? null,
      scope,
      actorUserId: session.db.user_id,
      request,
    });

    if (result.outcome === "entitlement_missing") {
      return NextResponse.json(
        {
          data: null,
          error: { message: result.message, code: "ENTITLEMENT_MISSING" },
        },
        { status: 409 },
      );
    }

    const origin = resolvePaymentLinkOrigin(request);

    return NextResponse.json({
      data: {
        linkId: result.linkId,
        /* L'indirizzo da incollare nel messaggio. */
        url: `${origin}${buildPaymentLinkPath(result.token)}`,
        path: result.path,
        expiresAt: result.expiresAt,
        paymentId: result.paymentId,
      },
      error: null,
    });
  } catch (error: any) {
    return failure(error, "Emissione del link di pagamento non riuscita");
  }
}
