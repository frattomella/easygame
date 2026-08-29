import { accountingRoute, ok, readBody } from "../../../accounts/route-context";
import { reverseAccountingEntry } from "@/lib/server/accounting";

/**
 * Lo **storno** di un movimento di prima nota.
 *
 *   POST /api/v1/accounting/entries/:id/reverse
 *
 * **Non esiste un `DELETE` su questa rotta, ed e la scelta della Wave.** Un
 * incasso di 100 EUR su una rata non si poteva gia cancellare: si stornava, e
 * restavano visibili entrambe le righe con il motivo. Un movimento manuale di
 * 10.000 EUR in cassa si cancellava con un `confirm()` del browser, spariva
 * dall'array e dalla tabella gemella, e nell'audit restava «qualcuno ha
 * modificato il club» — con l'id **del club**. Era la contraddizione piu netta
 * del dominio: la regola valeva dove il denaro era una riga di tabella e non
 * valeva dove era un oggetto in un JSON.
 *
 * **Il permesso e `accounting.reverse`, non `accounting.manage`.** Chi tiene la
 * cassa registra; chi corregge un errore di denaro e la direzione. E la stessa
 * separazione che il lavoro sportivo fa fra `manage` e `pay`, e sostituisce il
 * ruolo tesoriere che il brief vieta.
 */

export const runtime = "nodejs";

export const POST = accountingRoute(
  "accounting.reverse",
  async ({ request, params, scope }) => {
    const body = await readBody(request);

    const storni = await reverseAccountingEntry(
      {
        entryId: params.id,
        reason: body.reason,
        entryDate: body.entry_date ?? body.entryDate,
      },
      scope,
    );

    return ok(storni, 201);
  },
  "Storno del movimento non riuscito",
);
