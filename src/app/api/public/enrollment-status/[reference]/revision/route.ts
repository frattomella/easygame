import { NextResponse } from "next/server";
import { readRequestId, reportServerError } from "@/lib/server/observability";
import {
  AUTH_RATE_LIMITS,
  consumeAuthRateLimit,
  consumeRequestRateLimits,
  getRequestIp,
  rateLimitHeaders,
} from "@/lib/server/auth-rate-limit";
import {
  FormSubmissionError,
  readPublicRevisionContext,
  resubmitPublicSubmission,
} from "@/lib/server/form-submissions";
import { readSubmissionPayload } from "@/lib/server/form-request";
import {
  ENROLLMENT_NOT_AVAILABLE_MESSAGE,
  hashEnrollmentReceiptReference,
} from "@/lib/forms/enrollment-receipt";

/**
 * **L'integrazione di una pratica** (ADR-0189 §4, ADR-0191 §1).
 *
 *   GET  /api/public/enrollment-status/:reference/revision   cosa correggere
 *   POST /api/public/enrollment-status/:reference/revision   il reinvio
 *
 * La ricevuta — che la famiglia gia possiede e che gia apre lo stato — e la
 * credenziale. La rotta risponde solo a una pratica in «integrazione
 * richiesta»; tutto il resto e lo stesso 404 della ricevuta. Il reinvio
 * cambia **solo** i campi che il club ha elencato: gli altri li rifiuta il
 * server, qualunque cosa arrivi.
 */

export const runtime = "nodejs";

type Context = { params: { reference: string } };

const notAvailable = () =>
  NextResponse.json({ data: null, error: { message: ENROLLMENT_NOT_AVAILABLE_MESSAGE } }, { status: 404 });

const tooMany = (result: { limit: number; remaining: number; retryAfterSeconds: number }) =>
  NextResponse.json(
    { data: null, error: { message: "Troppe richieste. Riprova fra qualche minuto.", code: "RATE_LIMITED" } },
    { status: 429, headers: rateLimitHeaders(result as any) },
  );

export async function GET(request: Request, context: Context) {
  try {
    const reference = String(context.params.reference || "");
    const limited = await consumeRequestRateLimits([
      { policy: AUTH_RATE_LIMITS.enrollmentStatusIp, identifier: getRequestIp(request) },
      { policy: AUTH_RATE_LIMITS.enrollmentStatusReference, identifier: hashEnrollmentReceiptReference(reference) || "vuoto" },
    ]);
    if (limited && !limited.allowed) return tooMany(limited);

    const contesto = await readPublicRevisionContext(reference);
    if (!contesto) return notAvailable();
    return NextResponse.json({ data: contesto, error: null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    reportServerError(error, {
      requestId: readRequestId(request),
      route: "/api/public/enrollment-status/[reference]/revision",
      method: "GET",
    });
    return NextResponse.json({ data: null, error: { message: "Errore nel caricamento" } }, { status: 500 });
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const reference = String(context.params.reference || "");
    const limit = await consumeAuthRateLimit(AUTH_RATE_LIMITS.publicFormResubmit, getRequestIp(request));
    if (!limit.allowed) return tooMany(limit);

    const payload = await readSubmissionPayload(request);
    const esito = await resubmitPublicSubmission(reference, {
      answers: payload.answers,
      files: payload.files,
    });
    return NextResponse.json({ data: esito, error: null });
  } catch (error: any) {
    if (error instanceof FormSubmissionError) {
      if (error.status === 404) return notAvailable();
      return NextResponse.json(
        { data: { errors: error.fieldErrors }, error: { message: error.message } },
        { status: error.status },
      );
    }
    reportServerError(error, {
      requestId: readRequestId(request),
      route: "/api/public/enrollment-status/[reference]/revision",
      method: "POST",
    });
    return NextResponse.json({ data: null, error: { message: "Errore nel reinvio" } }, { status: 500 });
  }
}
