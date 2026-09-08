import { NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/server/api-errors";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  allocateCoverage,
  listCoverageForAthlete,
  listCoverageForPayment,
  reverseCoverage,
} from "@/lib/server/payment-coverage";

/**
 * **La copertura di una rata con un voucher** (N7 / ADR-0158).
 *
 *   GET  /api/v1/payment-coverage?payment_id=…
 *   GET  /api/v1/payment-coverage?athlete_id=…
 *   POST /api/v1/payment-coverage            { payment_id, enrollment_id, amount }
 *   POST /api/v1/payment-coverage            { action: "reverse", allocation_id, reason }
 *
 * Una rotta propria, e non un campo dentro la rata, perche una copertura ha una
 * vita sua: si alloca, si storna, e una rata puo averne piu di una. Metterla
 * dentro `PATCH /api/v1/payments/:id` avrebbe voluto dire che chi corregge una
 * scadenza puo cambiare quanto un ente promette.
 *
 * **Non e una rotta di incasso.** Niente di cio che passa di qui scrive un
 * `payment_transaction`, tocca `payments.status` o entra in prima nota: una
 * copertura e una previsione, e ADR-0037 resta letterale.
 *
 * L'audit lo scrive il **servizio** — `payment-coverage.ts` e la sola strada
 * che scrive quella tabella, e chiamarla da altrove non lascerebbe segno.
 */

export const runtime = "nodejs";

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

const failure = (error: any, fallback: string) => {
  const message = publicErrorMessage(error, fallback);
  const status = message.includes("Accesso negato")
    ? 403
    : message.includes("non trovat")
      ? 404
      : 400;
  return NextResponse.json({ data: null, error: { message } }, { status });
};

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    const url = new URL(request.url);
    const paymentId = String(url.searchParams.get("payment_id") || "").trim();
    const athleteId = String(url.searchParams.get("athlete_id") || "").trim();

    if (!paymentId && !athleteId) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Indica la rata o l'atleta di cui leggere le coperture" },
        },
        { status: 400 },
      );
    }

    const data = paymentId
      ? await listCoverageForPayment(paymentId, scope)
      : await listCoverageForAthlete(athleteId, scope);

    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    return failure(error, "Lettura delle coperture non riuscita");
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

    const body = await request.json().catch(() => ({}));

    if (String(body?.action || "") === "reverse") {
      const risultato = await reverseCoverage(
        {
          allocationId: body?.allocation_id ?? body?.allocationId,
          reason: body?.reason,
        },
        scope,
      );
      return NextResponse.json({ data: risultato, error: null });
    }

    const risultato = await allocateCoverage(
      {
        paymentId: body?.payment_id ?? body?.paymentId,
        enrollmentId: body?.enrollment_id ?? body?.enrollmentId,
        amount: body?.amount,
        notes: body?.notes,
        idempotencyKey: body?.idempotency_key ?? body?.idempotencyKey,
      },
      scope,
    );

    return NextResponse.json({ data: risultato, error: null }, { status: 201 });
  } catch (error: any) {
    return failure(error, "Scrittura della copertura non riuscita");
  }
}
