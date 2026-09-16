import { NextResponse } from "next/server";
import { readRequestId, reportServerError } from "@/lib/server/observability";
import { findPublicFormBySlug } from "@/lib/server/forms";
import { FormDraftError, readFormDraft } from "@/lib/server/form-drafts";
import {
  AUTH_RATE_LIMITS,
  consumeAuthRateLimit,
  getRequestIp,
  rateLimitHeaders,
} from "@/lib/server/auth-rate-limit";

/**
 * Riprendere una bozza (ADR-0189 §3, ADR-0191 §1).
 *
 *   GET /api/public/forms/:slug/draft/:token
 *
 * Il gettone e nel percorso e non in una query string, cosi non finisce nei
 * referrer; il server non lo scrive nei log (la rotta non lo riporta
 * nell'errore). Ogni esito negativo e 404.
 */

export const runtime = "nodejs";

type Context = { params: { publicSlug: string; token: string } };

const notFound = () =>
  NextResponse.json({ data: null, error: { message: "Bozza non trovata o scaduta" } }, { status: 404 });

export async function GET(request: Request, context: Context) {
  try {
    const limit = await consumeAuthRateLimit(AUTH_RATE_LIMITS.publicFormDraftRead, getRequestIp(request));
    if (!limit.allowed) {
      return NextResponse.json(
        { data: null, error: { message: "Troppe richieste. Riprova fra qualche minuto.", code: "RATE_LIMITED" } },
        { status: 429, headers: rateLimitHeaders(limit as any) },
      );
    }
    const match = await findPublicFormBySlug(context.params.publicSlug);
    if (!match) return notFound();
    const draft = await readFormDraft(match, context.params.token);
    return NextResponse.json({ data: draft, error: null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    if (error instanceof FormDraftError) return notFound();
    reportServerError(error, {
      requestId: readRequestId(request),
      route: "/api/public/forms/[publicSlug]/draft/[token]",
      method: "GET",
      metadata: { slug: context.params.publicSlug },
    });
    return NextResponse.json({ data: null, error: { message: "Errore nel caricamento della bozza" } }, { status: 500 });
  }
}
