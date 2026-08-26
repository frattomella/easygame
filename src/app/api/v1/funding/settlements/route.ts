import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  createFundingSettlement,
  listFundingSettlements,
} from "@/lib/server/funding";
import { canManageClubConfiguration } from "@/lib/access-roles";
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
  const message = String(error?.message || fallback);
  const status = message.includes("Accesso negato")
    ? 403
    : message.includes("non trovato")
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

    if (!canManageClubConfiguration(scope.activeRole)) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Accesso negato: solo il proprietario o un gestore del club puo registrare una liquidazione",
          },
        },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));

    const settlement = await createFundingSettlement(
      {
        programId: body?.program_id ?? body?.programId,
        amount: body?.amount,
        settledAt: body?.settled_at ?? body?.settledAt,
        reference: body?.reference,
        method: body?.method,
        notes: body?.notes,
        lines: (Array.isArray(body?.lines) ? body.lines : []).map(
          (line: any) => ({
            accrualId: line?.accrual_id ?? line?.accrualId,
            amount: line?.amount,
          }),
        ),
      },
      scope,
    );

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
      },
    });

    return NextResponse.json({ data: settlement, error: null }, { status: 201 });
  } catch (error: any) {
    return failure(error, "Registrazione della liquidazione non riuscita");
  }
}
