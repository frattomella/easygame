import { accountingRoute, ok, readBody } from "../../../accounts/route-context";
import { reconcileAccountingEntry } from "@/lib/server/accounting";

/**
 * La **riconciliazione** di un movimento: «questo l'ho visto in banca».
 *
 *   POST /api/v1/accounting/entries/:id/reconcile
 *
 * **In V1 e un atto umano su un dato che il sistema gia conosce.** Nessun
 * import di tracciati bancari, nessun matching automatico: i formati sono tre,
 * le banche li interpretano diversamente, e il matching su causale libera
 * sbaglia abbastanza da farsi disattivare — e nel frattempo ha marcato come
 * riconciliate righe che non lo erano, che e peggio di non riconciliare
 * affatto, perche toglie la domanda invece di rispondere.
 *
 * Il valore che produce subito, e che oggi manca: «cosa non ho ancora visto
 * arrivare in banca» diventa una domanda con una risposta.
 *
 * **Il permesso e `accounting.reconcile`, che la segreteria ha**: spuntare non
 * cambia nessun numero, dice solo che l'estratto conto conferma.
 */

export const runtime = "nodejs";

export const POST = accountingRoute(
  "accounting.reconcile",
  async ({ request, params, scope }) => {
    const body = await readBody(request);

    const entry = await reconcileAccountingEntry(
      {
        entryId: params.id,
        status: body.status ?? body.reconciliation_status,
        valueDate: body.value_date ?? body.valueDate,
        bankReference: body.bank_reference ?? body.bankReference,
      },
      scope,
    );

    return ok(entry);
  },
  "Riconciliazione non riuscita",
);
