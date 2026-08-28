import { ok, sportWorkRoute } from "@/lib/server/sport-work-route";
import { getCuDataset, getF24Dataset } from "@/lib/server/sport-work-agenda";

/**
 * I dati strutturati che il consulente si porta via.
 *
 *   GET /api/v1/sport-work/datasets?kind=f24&year=2026
 *   GET /api/v1/sport-work/datasets?kind=cu&year=2026
 *
 * **Non sono un F24 e non sono una CU.** Sono le tabelle che una segreteria
 * copia, esporta e consegna a chi quegli adempimenti li fa davvero. EasyGame
 * non e un intermediario fiscale e non trasmette niente all'Agenzia delle
 * Entrate ne all'INPS.
 *
 * Richiedono `sport_work.fiscal`.
 */
export const runtime = "nodejs";

export const GET = sportWorkRoute(
  "sport_work.fiscal",
  async ({ url, scope }) => {
    const organizationId = String(scope.activeOrganizationId || "");
    const year =
      Number(url.searchParams.get("year")) || new Date().getUTCFullYear();
    const kind = String(url.searchParams.get("kind") || "f24").toLowerCase();

    if (kind === "cu") {
      return ok({
        kind: "cu",
        year,
        rows: await getCuDataset(organizationId, year, scope),
        disclaimer:
          "Dataset di appoggio alla Certificazione Unica. EasyGame non predispone e non trasmette la CU.",
      });
    }

    return ok({
      kind: "f24",
      year,
      rows: await getF24Dataset(organizationId, year, scope),
      disclaimer:
        "Importi e causali calcolati sulle erogazioni registrate. EasyGame non compila e non invia l'F24.",
    });
  },
  "Lettura del dataset non riuscita",
);
