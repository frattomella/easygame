import assert from "node:assert/strict";
import test from "node:test";

import {
  findFirstPayableAthletePayment,
  isPayableAthletePayment,
  resolveAthletePaymentStatus,
} from "../../src/lib/athlete-payment-utils.ts";

/**
 * **W6-08 — «Paga ora» era disabilitato, sempre.**
 *
 * Il difetto stava fra il clic e la rete, dove nessun test che sostituisce il
 * trasporto guarda. La schermata della famiglia cercava la rata da saldare
 * cosi:
 *
 * ```js
 * items.find((rata) =>
 *   ["pending", "overdue", "partial", "unpaid"].includes(
 *     String(rata?.status || "").toLowerCase(),
 *   ),
 * )
 * ```
 *
 * Ma `status` non e un campo macchina: e l'**etichetta italiana** che il
 * dominio produce — «Da incassare», «Scaduto», «Parzialmente pagato»,
 * «Pagato», «Annullato». Nessuno dei quattro token inglesi poteva
 * corrispondere: la ricerca restituiva sempre `null`, il pulsante era sempre
 * spento, e il testo d'aiuto diceva «Nessuna rata da saldare» a una famiglia
 * che ne aveva tre aperte.
 *
 * Tutto il resto funzionava: il dominio, il checkout, la rotta della famiglia
 * con il gate sul legame, e il client che quella rotta la chiamava gia.
 * Mancava solo che qualcuno gli desse una rata da passare.
 *
 * Il presidio non e «il pulsante e acceso»: e che la domanda «questa rata si
 * puo pagare?» abbia **una risposta sola**, prodotta dallo stesso modulo che
 * produce le due forme dello stato.
 */

const rata = (extra) => ({
  id: "r-1",
  amount: 120,
  ...extra,
});

test("le due forme dello stato convivono, e la macchina e `statusKey`", () => {
  /*
    E il fatto da cui il difetto nasceva: `status` e per gli occhi, `statusKey`
    per il codice. Se un giorno le due smettessero di essere prodotte insieme,
    questo test se ne accorgerebbe prima di una famiglia.
  */
  const aperta = resolveAthletePaymentStatus("pending", null, {});
  assert.equal(aperta.statusKey, "pending");
  assert.equal(aperta.status, "Da incassare");

  const scaduta = resolveAthletePaymentStatus("overdue", null, {});
  assert.equal(scaduta.statusKey, "pending");
  assert.equal(scaduta.status, "Scaduto");

  const parziale = resolveAthletePaymentStatus("partially_paid", null, {});
  assert.equal(parziale.statusKey, "pending");
  assert.equal(parziale.status, "Parzialmente pagato");

  /*
    La prova che il vecchio confronto non poteva funzionare: nessuna delle
    etichette e uno dei token che la schermata cercava.
  */
  for (const etichetta of [aperta.status, scaduta.status, parziale.status]) {
    assert.equal(
      ["pending", "overdue", "partial", "unpaid"].includes(
        etichetta.toLowerCase(),
      ),
      false,
      `«${etichetta}» non e un token macchina, ed e su questo che il pulsante si spegneva`,
    );
  }
});

test("una rata aperta si paga, comunque sia scritta la sua etichetta", () => {
  for (const stato of ["Da incassare", "Scaduto", "Parzialmente pagato"]) {
    assert.equal(
      isPayableAthletePayment(rata({ statusKey: "pending", status: stato })),
      true,
      `«${stato}» deve restare pagabile`,
    );
  }
});

test("una rata saldata, annullata o esclusa non si paga", () => {
  assert.equal(
    isPayableAthletePayment(rata({ statusKey: "paid", status: "Pagato" })),
    false,
  );
  assert.equal(
    isPayableAthletePayment(
      rata({ statusKey: "cancelled", status: "Annullato" }),
    ),
    false,
  );
  assert.equal(
    isPayableAthletePayment(
      rata({ statusKey: "pending", data: { excludedFromTotals: true } }),
    ),
    false,
    "una riga esclusa dai totali non e denaro che qualcuno deve",
  );
});

test("una rata di importo nullo non apre un checkout da zero euro", () => {
  assert.equal(
    isPayableAthletePayment(rata({ statusKey: "pending", amount: 0 })),
    false,
  );
  assert.equal(
    isPayableAthletePayment(rata({ statusKey: "pending", amount: -10 })),
    false,
  );
});

test("senza `statusKey` si legge l'etichetta: e il ripiego, non la strada", () => {
  /*
    I payload gia in mano a un browser aperto da ieri non hanno il campo
    macchina. Ripiegare sull'etichetta e cio che evita che il pulsante torni a
    spegnersi per un motivo diverso dal primo.
  */
  assert.equal(
    isPayableAthletePayment({ amount: 50, status: "Da incassare" }),
    true,
  );
  assert.equal(isPayableAthletePayment({ amount: 50, status: "Pagato" }), false);
  assert.equal(
    isPayableAthletePayment({ amount: 50, status: "Annullato" }),
    false,
  );
});

test("niente e pagabile quando non c'e niente", () => {
  for (const nulla of [null, undefined, {}, { amount: 120 }]) {
    assert.equal(isPayableAthletePayment(nulla), false);
  }
  assert.equal(findFirstPayableAthletePayment(null), null);
  assert.equal(findFirstPayableAthletePayment([]), null);
});

test("si propone la prima rata aperta, non la prima riga", () => {
  const elenco = [
    rata({ id: "saldata", statusKey: "paid", status: "Pagato" }),
    rata({ id: "annullata", statusKey: "cancelled", status: "Annullato" }),
    rata({ id: "aperta", statusKey: "pending", status: "Scaduto" }),
    rata({ id: "seconda-aperta", statusKey: "pending" }),
  ];

  assert.equal(findFirstPayableAthletePayment(elenco)?.id, "aperta");
});
