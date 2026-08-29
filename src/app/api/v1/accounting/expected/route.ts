import { accountingRoute, ok, readBody } from "../accounts/route-context";
import {
  createExpectedEntry,
  listExpectedEntries,
} from "@/lib/server/expected-entries";

/**
 * Le **previsioni** del club (W4-B1).
 *
 *   GET  /api/v1/accounting/expected
 *   POST /api/v1/accounting/expected
 *
 * **Perche sotto `accounting/` e non fra le entries.** Il perimetro di chi puo
 * vederle e scriverle e quello della contabilita — la stessa matrice, lo stesso
 * involucro, gli stessi 403 con il motivo — ma le righe **non** sono prima nota:
 * vivono in `expected_income` e `expected_expenses`, e nessuna di loro entra mai
 * in `accounting_entries`. Una previsione e un impegno futuro; quella tabella
 * ospita fatti avvenuti.
 *
 * **Il difetto che chiude.** La scheda «Previsti» scriveva dal browser
 * riscrivendo l'intera colonna JSON: due segreterie nello stesso minuto e la
 * seconda scrittura cancellava la prima. Qui la scrittura e del server e passa
 * dal lock sul club.
 *
 * **Nessun totale di cassa esce da qui.** I due totali si chiamano
 * `expectedIncomeCents` e `expectedExpenseCents`, e il nome e la garanzia: chi
 * li legge non puo confonderli con un saldo.
 */

export const runtime = "nodejs";

export const GET = accountingRoute(
  "accounting.read",
  async ({ url, request, scope }) => {
    const result = await listExpectedEntries(scope, {
      organizationId: url.searchParams.get("organization_id"),
      /*
        La stagione arriva dall'header come per ogni altra collezione stagionale:
        e la stessa fonte che il CRUD generico usa, e leggerla da un secondo
        posto sarebbe il modo di mostrare due perimetri diversi nella stessa
        pagina.
      */
      seasonId:
        url.searchParams.get("season_id") ||
        request.headers.get("x-active-season-id"),
    });

    return ok(result);
  },
  "Errore nella lettura delle previsioni",
);

export const POST = accountingRoute(
  /*
    Registrare una previsione e lavoro di segreteria, come registrare un
    movimento: e `accounting.manage`, non la configurazione societaria.
  */
  "accounting.manage",
  async ({ request, scope }) => {
    const body = await readBody(request);

    const entry = await createExpectedEntry(scope, {
      organizationId: (body as any).organization_id ?? (body as any).organizationId,
      direction: (body as any).direction,
      date: (body as any).date,
      description: (body as any).description,
      category: (body as any).category,
      reference: (body as any).reference,
      amountCents: (body as any).amount_cents ?? (body as any).amountCents,
      seasonId:
        (body as any).season_id ??
        (body as any).seasonId ??
        request.headers.get("x-active-season-id"),
    });

    return ok({ entry }, 201);
  },
  "Registrazione della previsione non riuscita",
);
