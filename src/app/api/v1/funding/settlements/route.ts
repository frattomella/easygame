import { NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/server/api-errors";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  createFundingSettlement,
  settleFundingPeriod,
  listFundingSettlements,
} from "@/lib/server/funding";
import { assertFundingSettlementPermission } from "@/lib/funding/settlement-permissions";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

/**
 * Liquidazioni dell'ente: quando il finanziatore versa davvero.
 *
 *   GET  /api/v1/funding/settlements?program_id=…
 *   POST /api/v1/funding/settlements
 *
 * E l'unico momento in cui un contributo diventa denaro. Fino a qui il
 * maturato e un credito, e il Riepilogo Incassi lo tiene separato da cio che
 * e stato incassato davvero (ADR-0037).
 *
 * **Le righe di riconciliazione sono obbligatorie.** Un ente liquida in
 * blocco — un bonifico solo per venti atleti e tre mesi — e senza la
 * ripartizione «liquidato» sarebbe un totale che non si puo attribuire a
 * nessuno.
 *
 * **Non nasce nessun incasso della famiglia.** Un contributo pubblico non e un
 * pagamento dell'atleta: confonderli farebbe risultare saldate rate che
 * nessuno ha pagato.
 */

export const runtime = "nodejs";

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

const failure = (error: any, fallback: string) => {
  /*
    **Il messaggio non esce grezzo.** Queste sette rotte costruivano la
    risposta da `error.message`, quindi un identificativo malformato faceva
    uscire il nome del modello, l operazione, lo SQLSTATE e le interiora del
    driver — l incidente I-03, che era stato chiuso altrove e non qui.
  */
  const message = publicErrorMessage(error, fallback);
  /*
    N15. «non trovata» e femminile, e la condizione guardava il solo maschile:
    un'adesione mancante usciva con 400 invece di 404. Due generi, una regola.
  */
  const status = message.includes("Accesso negato")
    ? 403
    : /non trovat[oa]/.test(message)
      ? 404
      : 400;
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

    const settlements = await listFundingSettlements(
      {
        organizationId: url.searchParams.get("organization_id"),
        programId: url.searchParams.get("program_id"),
      },
      scope,
    );

    return NextResponse.json({ data: settlements, error: null });
  } catch (error: any) {
    return failure(error, "Errore nella lettura delle liquidazioni");
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

    /*
      **La porta ha due chiavi** (N15). Registrare il bonifico di un ente e
      insieme un atto sui contributi e un movimento di cassa: `funding.manage`
      e `accounting.manage`. Il perimetro dei ruoli canonici non cambia — la
      loro intersezione e proprietario e gestore, gli stessi di prima — e un
      ruolo personalizzato che porti tutte e due adesso passa, dove
      `canManageClubConfigurationAsActor` lo rifiutava per costruzione.
    */
    assertFundingSettlementPermission(scope.activeRole, "record");

    const body = await request.json().catch(() => ({}));

    /*
      **La liquidazione di un singolo periodo** (N15).

      Il corpo con `accrual_id` e la forma che una segreteria produce davvero:
      «l'ente mi ha accreditato i 100 euro di ottobre di Mario». Quello con
      `program_id` e `lines` resta, ed e la forma del bonifico che arriva in
      blocco per venti atleti: sono due modi di dire la stessa cosa, e il
      secondo non si puo comporre a mano senza conoscere gli identificativi dei
      periodi — che e la ragione per cui questa rotta non aveva **nessun**
      chiamante nell'interfaccia.

      Lo scrittore resta uno: `settleFundingPeriod` compone l'ingresso e delega.
    */
    const accrualId = body?.accrual_id ?? body?.accrualId;

    const settlement = accrualId
      ? await settleFundingPeriod(
          {
            accrualId,
            amount: body?.amount,
            settledAt: body?.settled_at ?? body?.settledAt,
            financialAccountId:
              body?.financial_account_id ?? body?.financialAccountId,
            reference: body?.reference,
            method: body?.method,
            notes: body?.notes,
            operationTypeCode:
              body?.operation_type_code ?? body?.operationTypeCode,
            idempotencyKey: body?.idempotency_key ?? body?.idempotencyKey,
          },
          scope,
        )
      : await createFundingSettlement(
      {
        programId: body?.program_id ?? body?.programId,
        amount: body?.amount,
        settledAt: body?.settled_at ?? body?.settledAt,
        reference: body?.reference,
        method: body?.method,
        notes: body?.notes,
        /*
          Il conto su cui il bonifico dell'ente e arrivato. Senza, la
          liquidazione restava invisibile nel saldo: il credito si chiudeva e il
          denaro non compariva da nessuna parte.
        */
        financialAccountId: body?.financial_account_id ?? body?.financialAccountId,
        /*
          W4-R7. La voce di rendiconto. Se il corpo tace, il dominio ripiega su
          `liquidazione_contributo`: e cio che una liquidazione e sempre, e un
          campo facoltativo che nessuno compila sarebbe il buco di prima con un
          nome nuovo.
        */
        operationTypeCode:
          body?.operation_type_code ?? body?.operationTypeCode,
        idempotencyKey: body?.idempotency_key ?? body?.idempotencyKey,
        lines: (Array.isArray(body?.lines) ? body.lines : []).map(
          (line: any) => ({
            accrualId: line?.accrual_id ?? line?.accrualId,
            amount: line?.amount,
          }),
        ),
      },
      scope,
    );

    /*
      **Una replica non e un fatto nuovo** (revisione ostile, F10).

      L'audit si scriveva anche quando la transazione aveva restituito una riga
      che esisteva gia: ripetere l'invio fabbricava eventi «liquidazione
      registrata» a volonta per un accredito avvenuto una volta sola,
      degradando proprio il registro che serve a ricostruire chi ha fatto cosa.
      E la risposta torna `200` invece di `201`: chi chiama deve poter
      distinguere «scritto» da «era gia scritto».
    */
    const replica = Boolean((settlement as any).__replayed);

    if (replica) {
      return NextResponse.json({ data: settlement, error: null });
    }

    await recordAuditEvent({
      action: AUDIT_ACTIONS.fundingSettled,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: scope.activeRole,
      organizationId: settlement.organization_id,
      resource: "funding_settlements",
      resourceId: settlement.id,
      request,
      metadata: {
        programId: settlement.program_id,
        amount: settlement.amount,
        reference: settlement.reference,
        lines: settlement.lines?.length ?? 0,
        /*
          N15. Le dimensioni che rendono la riga rileggibile senza aprire
          altre tabelle: chi ne e il beneficiario, su quale conto e entrato il
          denaro, quali periodi ha chiuso, e con quale chiave e stata scritta —
          cosi un doppio invio si riconosce nel registro invece di doversi
          dedurre da due importi uguali a un minuto di distanza.
        */
        beneficiaryAthleteId: settlement.beneficiary_athlete_id ?? null,
        financialAccountId: settlement.financial_account_id ?? null,
        accrualIds: (settlement.lines || []).map((riga: any) =>
          String(riga.accrual_id),
        ),
        idempotencyKey: settlement.idempotency_key ?? null,
        description: settlement.description_snapshot ?? null,
      },
    });

    return NextResponse.json({ data: settlement, error: null }, { status: 201 });
  } catch (error: any) {
    return failure(error, "Registrazione della liquidazione non riuscita");
  }
}
