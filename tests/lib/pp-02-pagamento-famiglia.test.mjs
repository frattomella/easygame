import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveFamilyCheckoutChannel,
  withPayableInstalment,
} from "../../src/lib/payments/family-checkout.ts";

/**
 * **PP-02 §D — perche il pulsante «Paga ora» e spento, detto prima del clic.**
 *
 * Il pulsante era vero: chiama il checkout, che emette un link e lo apre. Cio
 * che mancava era la **ragione**, e mancava in due modi opposti.
 *
 * * Senza rate aperte si spegneva, con il motivo dentro un `title` del
 *   browser. Su un telefono un `title` non esiste: il pulsante era spento e
 *   basta.
 * * Con la societa che non ha configurato gli incassi online restava
 *   **acceso**, e il motivo arrivava dopo il clic, come errore rosso. E il
 *   pulsante che promette e poi spiega di non funzionare.
 *
 * Questi test presidiano due proprieta, e la seconda vale quanto la prima:
 *
 * 1. che una ragione ci sia **sempre**, in tutti i modi di non poter pagare;
 * 2. che quella ragione **non sia quella del club**. I messaggi del dominio
 *    sono scritti per chi puo rimediare — «La societa non ha ancora completato
 *    il collegamento del proprio conto di incasso», «L'abbonamento della
 *    societa non comprende i pagamenti online» — e a una famiglia dicono lo
 *    stato commerciale del club con EasyGame, che non e affar suo.
 */

const acceso = { canCheckout: true, blocker: null };

/* ------------------------------------------------------------ il canale */

test("con il canale acceso non c'e niente da spiegare", () => {
  const stato = resolveFamilyCheckoutChannel(acceso);
  assert.equal(stato.available, true);
  assert.equal(stato.message, "");
});

test("i cinque ostacoli che la famiglia non puo rimuovere dicono la stessa cosa", () => {
  /*
    Cinque ostacoli diversi, un solo fatto utile: online non si paga, si salda
    in segreteria. Distinguerli davanti alla famiglia vorrebbe dire spiegarle
    la differenza fra un conto non collegato e un abbonamento scaduto.
  */
  for (const blocker of [
    "provider_not_configured",
    "platform_disabled",
    "subscription_inactive",
    "no_account",
    "club_disabled",
  ]) {
    const stato = resolveFamilyCheckoutChannel({ canCheckout: false, blocker });
    assert.equal(stato.available, false, blocker);
    assert.equal(stato.blocker, "not_configured", blocker);
    assert.match(stato.message, /segreteria/, blocker);
  }
});

test("il conto in verifica e l'unico caso in cui ha senso riprovare", () => {
  const stato = resolveFamilyCheckoutChannel({
    canCheckout: false,
    blocker: "account_not_ready",
  });
  assert.equal(stato.blocker, "temporarily_unavailable");
  assert.match(stato.message, /Riprova/);
});

test("nessun messaggio nomina l'abbonamento o il conto della societa", () => {
  /*
    E il presidio che tiene separati i due vocabolari. Se un giorno qualcuno
    facesse passare il messaggio del dominio cosi com'e — che e la scorciatoia
    ovvia — questo test diventerebbe rosso.
  */
  const messaggi = [
    "provider_not_configured",
    "platform_disabled",
    "subscription_inactive",
    "no_account",
    "account_not_ready",
    "club_disabled",
  ].map(
    (blocker) =>
      resolveFamilyCheckoutChannel({ canCheckout: false, blocker }).message,
  );

  for (const messaggio of messaggi) {
    assert.doesNotMatch(messaggio, /abbonamento|piano Plus|conto di incasso/i);
    assert.ok(messaggio.length > 20, "un motivo utile e una frase, non un codice");
  }
});

test("un verdetto assente vale come «non configurato», non come «acceso»", () => {
  const stato = resolveFamilyCheckoutChannel(null);
  assert.equal(stato.available, false);
  assert.equal(stato.blocker, "not_configured");
});

/* ----------------------------------------------------------- il pulsante */

test("senza rate da saldare lo si dice, anche se il canale sarebbe spento", () => {
  /*
    L'ordine conta: a chi non deve niente «hai pagato tutto» e una risposta
    migliore di «questa societa non incassa online», che suona come un
    problema.
  */
  const stato = withPayableInstalment(
    resolveFamilyCheckoutChannel({
      canCheckout: false,
      blocker: "no_account",
    }),
    false,
  );
  assert.equal(stato.blocker, "nothing_due");
  assert.match(stato.message, /Non ci sono rate/);
});

test("con una rata aperta e il canale acceso il pulsante si preme", () => {
  const stato = withPayableInstalment(
    resolveFamilyCheckoutChannel(acceso),
    true,
  );
  assert.equal(stato.available, true);
  assert.equal(stato.message, "");
});

test("un payload senza il canale non spegne il pulsante", () => {
  /*
    La cache di una sessione aperta prima del rilascio non porta
    `payments.online`. Spegnere il pulsante li vorrebbe dire togliere una
    funzione a chi ce l'aveva: il caso peggiore torna a essere l'errore dopo il
    clic, che e cio che succedeva prima.
  */
  const stato = withPayableInstalment(undefined, true);
  assert.equal(stato.available, true);
});
