import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  createPaymentTransaction,
  listPaymentTransactions,
} from "@/lib/server/payment-transactions";
import { canManageClubConfiguration } from "@/lib/access-roles";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

/**
 * Il registro degli incassi.
 *
 *   GET  /api/v1/payment-transactions?athlete_id=…&payment_id=…
 *   POST /api/v1/payment-transactions      registra un incasso su una rata
 *
 * **Perche una rotta dedicata e non la risorsa generica.** Registrare un
 * incasso non e scrivere una riga: e scrivere una riga *e* ricalcolare lo
 * stato della rata, nella stessa transazione. La risorsa generica
 * (`/api/v1/<resource>`) sa fare la prima cosa e non la seconda, e con la
 * seconda a carico del client si tornerebbe al difetto che ADR-0036 chiude —
 * lo stato dichiarato dall'interfaccia invece che ricavato dagli importi.
 *
 * **Chi puo registrare un incasso.** Un incasso muove denaro del club:
 * richiede il ruolo che governa la configurazione del club, lo stesso che
 * gia protegge `/api/athlete-payments/:id`. La lettura resta aperta a chi ha
 * accesso al club, perche i riepiloghi la usano ovunque.
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

    const transactions = await listPaymentTransactions(
      {
        organizationId: url.searchParams.get("organization_id"),
        athleteId: url.searchParams.get("athlete_id"),
        paymentId: url.searchParams.get("payment_id"),
      },
      scope,
    );

    return NextResponse.json({ data: transactions, error: null });
  } catch (error: any) {
    return failure(error, "Errore nella lettura degli incassi");
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

    if (!canManageClubConfiguration(scope.activeRole)) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Accesso negato: solo il proprietario o un gestore del club puo registrare un incasso",
          },
        },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));

    const result = await createPaymentTransaction(
      {
        organizationId: body?.organization_id ?? body?.organizationId,
        athleteId: body?.athlete_id ?? body?.athleteId,
        paymentId: body?.payment_id ?? body?.paymentId,
        amount: body?.amount,
        paidAt: body?.paid_at ?? body?.paidAt,
        paymentMethod: body?.payment_method ?? body?.paymentMethod,
        notes: body?.notes,
        source: body?.source,
        externalReference:
          body?.external_reference ?? body?.externalReference,
        allowOverpayment: Boolean(
          body?.allow_overpayment ?? body?.allowOverpayment,
        ),
      },
      scope,
    );

    await recordAuditEvent({
      action: AUDIT_ACTIONS.resourceCreated,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: scope.activeRole,
      organizationId: result.transaction.organizationId,
      resource: "payment_transactions",
      resourceId: result.transaction.id,
      request,
      metadata: {
        paymentId: result.transaction.installmentId,
        athleteId: result.transaction.athleteId,
        amount: result.transaction.amount,
        paymentMethod: result.transaction.paymentMethod,
        source: result.transaction.source,
      },
    });

    return NextResponse.json({ data: result, error: null }, { status: 201 });
  } catch (error: any) {
    return failure(error, "Registrazione dell'incasso non riuscita");
  }
}
