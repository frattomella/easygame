import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/server/cron-auth";
import { refreshDomainsInBackground } from "@/lib/server/website/domains";
import { purgeOldInquiries } from "@/lib/server/website/inquiries";
import { pruneOldRevisions } from "@/lib/server/website/publishing";
import { readRequestId, reportServerError } from "@/lib/server/observability";

/**
 * **Il giro periodico del sito** (Vercel Cron, `CRON_SECRET`).
 *
 * 1. rilegge lo stato dei domini in attesa e di quelli attivi non controllati
 *    da un giorno: un certificato emesso nella notte o un DNS cambiato si
 *    vedono senza che il club prema «verifica»;
 * 2. cancella le richieste del modulo contatti oltre i 24 mesi di
 *    conservazione;
 * 3. pota le revisioni pubblicate: per sito restano le ultime 50 e la
 *    corrente (D-WS-11).
 *
 * Il trigger e esterno (ADR-0007): un cron dell'hosting o qualunque altro
 * scheduler che porti il segreto.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request, "il giro periodico del sito");
  if (denied) return denied.response;
  try {
    const [domains, inquiries, revisions] = await Promise.all([refreshDomainsInBackground(), purgeOldInquiries(), pruneOldRevisions()]);
    return NextResponse.json({ data: { domains, inquiries, revisions }, error: null });
  } catch (error) {
    reportServerError(error, { requestId: readRequestId(request), route: "/api/v1/website/maintenance", method: "GET" });
    return NextResponse.json({ data: null, error: { message: "Giro periodico del sito non riuscito" } }, { status: 500 });
  }
}
