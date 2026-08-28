import { ok, sportWorkRoute } from "@/lib/server/sport-work-route";
import { getSportWorkDashboard } from "@/lib/server/sport-work-agenda";

/**
 * I numeri del cruscotto «Lavoro sportivo».
 *
 *   GET /api/v1/sport-work/dashboard
 *
 * Programmato, maturato e pagato restano **tre colonne**. Un cruscotto che ne
 * mostrasse una sola costringerebbe chi legge a indovinare quale dei tre sta
 * guardando.
 */
export const runtime = "nodejs";

export const GET = sportWorkRoute("sport_work.read", async ({ scope }) =>
  ok(
    await getSportWorkDashboard(String(scope.activeOrganizationId || ""), scope),
  ),
);
