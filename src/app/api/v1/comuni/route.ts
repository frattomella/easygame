import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import {
  getCapSource,
  getComuniSource,
  lookupComuneByBelfiore,
  lookupComuniByName,
  searchComuniByQuery,
} from "@/lib/server/comuni";
import { DEFAULT_COMUNE_SEARCH_LIMIT } from "@/lib/comuni-model";

/**
 * Archivio dei comuni italiani: sola lettura.
 *
 * Non e un dato di club e non ha un `organization_id`: e una tabella di
 * riferimento pubblica (ISTAT). Richiede comunque una sessione, perche
 * un'anagrafica assistita e una funzione dell'applicazione e non c'e ragione
 * di offrirne il motore di ricerca a chi non e entrato.
 *
 * Tre modi di interrogarla, gli stessi tre da cui si arriva a un comune in
 * segreteria:
 *
 *   GET /api/v1/comuni?q=abano          — per nome (o per codice catastale)
 *   GET /api/v1/comuni?belfiore=A001    — dal codice dentro un codice fiscale
 *   GET /api/v1/comuni?name=Castro      — tutti gli omonimi, per disambiguare
 *
 * Ogni comune porta con se `postalCode` e `postalCodeStatus`. Sono due
 * campi e non uno perche il CAP vuoto ha due significati diversi:
 * `ambiguous` (il comune ne ha piu d'uno) e `unknown` (non c'e
 * osservazione), e il form dice all'operatore quale dei due. La fonte del CAP
 * e diversa da quella dei comuni — IPA di AgID, non ISTAT — e viene dichiarata
 * a parte in `capSource`.
 */
export async function GET(request: Request) {
  const session = await requireAuthenticatedUser(request);
  if (!session) {
    return NextResponse.json(
      { data: null, error: { message: "Accesso negato: sessione assente" } },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const belfiore = url.searchParams.get("belfiore");
  const exactName = url.searchParams.get("name");
  const query = url.searchParams.get("q");
  const province = url.searchParams.get("province");
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? limitParam
    : DEFAULT_COMUNE_SEARCH_LIMIT;

  if (belfiore) {
    const comune = lookupComuneByBelfiore(belfiore);
    return NextResponse.json({
      data: {
        comuni: comune ? [comune] : [],
        source: getComuniSource(),
        capSource: getCapSource(),
      },
      error: null,
    });
  }

  if (exactName) {
    return NextResponse.json({
      data: {
        comuni: lookupComuniByName(exactName),
        source: getComuniSource(),
        capSource: getCapSource(),
      },
      error: null,
    });
  }

  return NextResponse.json({
    data: {
      comuni: searchComuniByQuery(query, { limit, province }),
      source: getComuniSource(),
      capSource: getCapSource(),
    },
    error: null,
  });
}
