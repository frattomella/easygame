import { NextResponse } from "next/server";
import { readRequestId, reportServerError } from "@/lib/server/observability";
import { findPublicFormBySlug } from "@/lib/server/forms";
import { FormDraftError, saveFormDraft } from "@/lib/server/form-drafts";
import {
  AUTH_RATE_LIMITS,
  consumeAuthRateLimit,
  getRequestIp,
  rateLimitHeaders,
} from "@/lib/server/auth-rate-limit";

/**
 * «Salva e continua dopo» (ADR-0189 §3, ADR-0191).
 *
 *   POST /api/public/forms/:slug/draft   { token?, answers, respondentEmail? }
 *
 * Senza gettone crea una bozza e restituisce il gettone **una volta sola**;
 * con un gettone valido la aggiorna. Ogni esito negativo — modulo assente,
 * gettone sconosciuto, scaduto, di un altro modulo — e lo stesso 404.
 */

export const runtime = "nodejs";

type Context = { params: { publicSlug: string } };

const notFound = () =>
  NextResponse.json({ data: null, error: { message: "Modulo non disponibile" } }, { status: 404 });

export async function POST(request: Request, context: Context) {
  try {
    const limit = await consumeAuthRateLimit(AUTH_RATE_LIMITS.publicFormDraftWrite, getRequestIp(request));
    if (!limit.allowed) {
      return NextResponse.json(
        { data: null, error: { message: "Troppe richieste. Riprova fra qualche minuto.", code: "RATE_LIMITED" } },
        { status: 429, headers: rateLimitHeaders(limit as any) },
      );
    }

    const match = await findPublicFormBySlug(context.params.publicSlug);
    if (!match) return notFound();

    const raw = await request.text();
    if (raw.length > 300 * 1024) {
      return NextResponse.json({ data: null, error: { message: "La bozza e troppo grande." } }, { status: 413 });
    }
    let body: any = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return NextResponse.json({ data: null, error: { message: "Corpo non valido." } }, { status: 400 });
    }

    const result = await saveFormDraft(match, {
      token: typeof body?.token === "string" ? body.token : null,
      answers: body?.answers,
      respondentEmail: typeof body?.respondentEmail === "string" ? body.respondentEmail : null,
    });

    return NextResponse.json({ data: result, error: null });
  } catch (error: any) {
    if (error instanceof FormDraftError) {
      if (error.status === 404) return notFound();
      return NextResponse.json({ data: null, error: { message: error.message } }, { status: error.status });
    }
    reportServerError(error, {
      requestId: readRequestId(request),
      route: "/api/public/forms/[publicSlug]/draft",
      method: "POST",
      metadata: { slug: context.params.publicSlug },
    });
    return NextResponse.json({ data: null, error: { message: "Errore nel salvataggio della bozza" } }, { status: 500 });
  }
}
