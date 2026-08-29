import { accountingRoute, ok, readBody } from "../../accounts/route-context";
import { updateAccountingEntry } from "@/lib/server/accounting";

/**
 * La **correzione** di un movimento di prima nota.
 *
 *   PATCH /api/v1/accounting/entries/:id
 *
 * **Non esiste il `DELETE`, e non e una dimenticanza.** Il denaro non si
 * cancella: si storna, e restano visibili l'originale e la riga opposta con il
 * motivo.
 *
 * **Cosa questa rotta non permette di cambiare.** Data, verso, importo e conto:
 * sono **il fatto finanziario**. Se uno di essi e sbagliato, il movimento
 * registrato non e mai avvenuto cosi, e la risposta e uno storno. Poterli
 * riscrivere vorrebbe dire poter far diventare un movimento da 10.000 EUR uno
 * da 10, senza che nessuno se ne accorga — cioe il difetto D-3 con un altro
 * nome, rientrato dalla finestra.
 *
 * **Cosa permette**: descrizione, note, metodo, controparte, riferimento
 * bancario, sede, e la **causale**. Quest'ultima merita una parola: la Wave
 * insiste sul congelamento della classificazione, e non e in contraddizione.
 * Il congelamento impedisce che modificare una causale **nel catalogo**
 * riscriva la natura di mille movimenti passati, in silenzio e senza un autore.
 * Riclassificare **una** riga e l'opposto — una decisione di una persona, su un
 * movimento solo, che lascia in audit il valore di prima e quello di dopo.
 * Senza, un errore di classificazione non avrebbe rimedio, e stornare per
 * correggerlo farebbe sparire denaro vero dai totali di cassa.
 *
 * **Il permesso e `accounting.manage`**: correggere una descrizione e lavoro di
 * segreteria. Cio che tocca il denaro chiede `accounting.reverse`, ed e
 * l'altra rotta.
 */

export const runtime = "nodejs";

export const PATCH = accountingRoute(
  "accounting.manage",
  async ({ request, params, scope }) => {
    const body = await readBody(request);

    /*
      I campi si prendono uno per uno e non con uno spread del corpo: uno
      spread lascerebbe passare domani un campo aggiunto allo schema senza che
      nessuno abbia deciso che si puo correggere. E la stessa ragione per cui
      le rotte degli incassi costruiscono il loro input campo per campo.
    */
    const entry = await updateAccountingEntry(
      {
        entryId: params.id,
        description: body.description,
        notes: body.notes,
        paymentMethod: body.payment_method ?? body.paymentMethod,
        counterpartyKind: body.counterparty_kind ?? body.counterpartyKind,
        counterpartyId: body.counterparty_id ?? body.counterpartyId,
        counterpartyLabel: body.counterparty_label ?? body.counterpartyLabel,
        bankReference: body.bank_reference ?? body.bankReference,
        valueDate: body.value_date ?? body.valueDate,
        siteId: body.site_id ?? body.siteId,
        operationTypeCode: body.operation_type_code ?? body.operationTypeCode,
      },
      scope,
    );

    return ok(entry);
  },
  "Correzione del movimento non riuscita",
);
