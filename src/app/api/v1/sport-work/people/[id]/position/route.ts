import { ok, sportWorkRoute } from "@/lib/server/sport-work-route";
import { getYearPositionDetail } from "@/lib/server/sport-work";

/**
 * La posizione annua di una persona verso le soglie.
 *
 *   GET /api/v1/sport-work/people/:id/position?year=2026
 *
 * Restituisce anche lo **scostamento**: quanto il conto cambierebbe se lo si
 * rifacesse oggi con la dichiarazione attuale. Non e un errore da correggere in
 * automatico, e una differenza che qualcuno deve vedere e sanare.
 */
export const runtime = "nodejs";

export const GET = sportWorkRoute(
  "sport_work.read",
  async ({ params, url, scope }) => {
    const year =
      Number(url.searchParams.get("year")) || new Date().getUTCFullYear();
    return ok(await getYearPositionDetail(params.id, year, scope));
  },
);
