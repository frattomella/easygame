import { NextResponse } from "next/server";
import { assertAccountingPermission } from "@/lib/accounting/permissions";
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
import {
  isValidationError,
  parseInput,
  validationErrorPayload,
} from "@/lib/validation";
import { paymentTransactionInputSchema } from "@/lib/validation/schemas";
import { publicErrorMessage } from "@/lib/server/api-errors";

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
  /*
    Un corpo malformato non e un errore di dominio: risponde 400 con
    `VALIDATION_ERROR` nell'envelope, cosi un client puo distinguerlo da «non
    hai il permesso» senza leggere del testo italiano.
  */
  if (isValidationError(error)) {
    return NextResponse.json(validationErrorPayload(error), { status: 400 });
  }

  /*
    Il messaggio del driver non esce da qui. Lo schema del corpo non impone la
    forma di un UUID a `payment_id` — non e compito suo — quindi un
    identificativo arbitrario arrivava fino a `findUnique`, e l'invocazione
    Prisma per intero tornava indietro nell'envelope: nome del modello,
    operazione, codice Postgres. `publicErrorMessage` lascia passare i
    messaggi di dominio, «Accesso negato» compreso perche e la stringa su cui
    la riga qui sotto decide il 403.
  */
  const message = publicErrorMessage(error, fallback);
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

    /*
      **Il permesso, che qui non c'era.**

      La `POST` di questo stesso file verifica
      `canManageClubConfiguration(scope.activeRole)`; la `GET` non verificava
      niente, e restituisce il **libro cassa del club**: ogni incasso di ogni
      famiglia, con importi, date, metodi, controparti e storni. Un genitore,
      un atleta o un allenatore lo leggevano per intero.
      La matrice esiste gia — `parent`, `athlete` e `trainer` non hanno
      `accounting.read` — e questa rotta non gliela chiedeva.
    */
    assertAccountingPermission(scope.activeRole, "accounting.read");

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

    /*
      Lo schema stabilisce che il corpo e della forma dichiarata — un importo
      e un numero positivo, una data e una data. **Non** decide se l'incasso
      ha senso: «supera il residuo della rata» resta una regola del registro,
      dove il residuo esiste.
    */
    const input = parseInput(paymentTransactionInputSchema, body);

    const result = await createPaymentTransaction(input, scope);

    await recordAuditEvent({
      /*
        Un'azione propria e non `resource.created`: «chi ha incassato questi
        cinquanta euro, e quando» e una domanda che una segreteria pone mesi
        dopo, e cercarla fra tutte le creazioni di risorsa non la trova.
      */
      action: AUDIT_ACTIONS.paymentTransactionRecorded,
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
