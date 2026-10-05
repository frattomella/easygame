import { NextResponse } from "next/server";
import { resolvePublicHost } from "@/lib/server/website/public-site";
import { InquiryRejected, submitInquiry } from "@/lib/server/website/inquiries";
import { AUTH_RATE_LIMITS, consumeAuthRateLimit, getRequestIp, rateLimitHeaders } from "@/lib/server/auth-rate-limit";
import { readRequestId, reportServerError } from "@/lib/server/observability";

/**
 * **Il modulo contatti del sito di un club** (ADR-0200 §9).
 *
 * Il sito destinatario lo dice l'**host** della richiesta — il dominio del
 * club su cui il modulo e stato compilato — mai il corpo: un client non puo
 * scegliere in quale casella scrivere. Due limiti di frequenza (indirizzo e
 * sito), campo esca e tempo minimo li applica `submitInquiry`.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    /* Solo l'host scritto dal middleware sul dominio del club: mai quello che dichiara il visitatore. */
    const host = request.headers.get("x-easygame-site-host") || "";
    const site = await resolvePublicHost(host);
    if (site.status !== "ok") {
      return NextResponse.json({ data: null, error: { message: "Sito non disponibile" } }, { status: 404 });
    }
    for (const [policy, identifier] of [
      [AUTH_RATE_LIMITS.websiteInquiryIp, getRequestIp(request)],
      [AUTH_RATE_LIMITS.websiteInquirySite, site.siteId],
    ] as const) {
      const limit = await consumeAuthRateLimit(policy, identifier);
      if (!limit.allowed) {
        return NextResponse.json(
          { data: null, error: { message: "Troppe richieste. Riprova fra qualche minuto.", code: "RATE_LIMITED" } },
          { status: 429, headers: rateLimitHeaders(limit) },
        );
      }
    }
    const contentType = request.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await request.json().catch(() => ({}))
      : Object.fromEntries((await request.formData()).entries());
    const result = await submitInquiry({ siteId: site.siteId, organizationId: site.organizationId }, body || {});
    return NextResponse.json({ data: { accepted: result.accepted }, error: null });
  } catch (error: any) {
    if (error instanceof InquiryRejected) {
      return NextResponse.json({ data: null, error: { message: error.message } }, { status: error.status });
    }
    reportServerError(error, { requestId: readRequestId(request), route: "/api/public/website/inquiries", method: "POST" });
    return NextResponse.json({ data: null, error: { message: "Non e stato possibile inviare il messaggio" } }, { status: 500 });
  }
}
