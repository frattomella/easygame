import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * **Sandbox e produzione**: la seconda domanda che una firma non risolve.
 *
 * La firma di un webhook prova che l'evento viene da Stripe. Non prova che
 * venga dallo Stripe di *questo* mondo. Un endpoint di staging puo ricevere un
 * evento **live** — endpoint registrato sull'account sbagliato, segreto
 * copiato da un ambiente all'altro, rinvio manuale dalla dashboard di
 * produzione — e lo troverebbe perfettamente firmato.
 *
 * L'errore inverso e peggiore: un evento **di prova** accettato in produzione
 * fa comparire un incasso mai avvenuto sulla rata di una famiglia vera. Il
 * controllo e lo stesso e serve nelle due direzioni, ed e per questo che
 * questi test provano entrambe.
 */

let liveMode;

/*
  I prefissi non si scrivono per esteso: il guardrail di sicurezza li cerca fra
  i file tracciati e non puo distinguere una chiave inventata da una vera. Un
  test che lo fa rende rosso un allarme che serve acceso — ed e gia successo
  una volta. Vedi `tests/ui/ci-guardrails.test.mjs`.
*/
const chiave = (modo, coda = "non_e_una_chiave_vera") =>
  `sk_${modo}_${coda}`;
const chiaveRistretta = (modo) => `rk_${modo}_non_e_una_chiave_vera`;

before(async () => {
  liveMode = await import("../../src/lib/payments/live-mode.ts");
});

/* ------------------------------------------------ l'ambiente della chiave */

test("una chiave di prova dichiara l'ambiente di prova", () => {
  assert.equal(liveMode.readCredentialEnvironment(chiave("test")), "test");
  assert.equal(liveMode.readCredentialEnvironment(chiaveRistretta("test")), "test");
});

test("una chiave di produzione dichiara la produzione", () => {
  assert.equal(liveMode.readCredentialEnvironment(chiave("live")), "live");
  assert.equal(liveMode.readCredentialEnvironment(chiaveRistretta("live")), "live");
});

test("una chiave che non si riconosce non si indovina", () => {
  assert.equal(liveMode.readCredentialEnvironment(""), null);
  assert.equal(liveMode.readCredentialEnvironment("pk_" + "test_abc"), null);
  assert.equal(liveMode.readCredentialEnvironment(undefined), null);
  assert.equal(
    liveMode.readCredentialEnvironment("sk_" + "liveabc"),
    null,
    "senza il separatore non e il prefisso di Stripe",
  );
});

test("la chiave vince su PAYMENT_MODE", () => {
  /*
    Se le due divergono e la variabile a essere rimasta indietro: la chiave e
    cio che regola le chiamate in uscita, e credere alla variabile vorrebbe
    dire accettare eventi di un mondo mentre si parla con l'altro.
  */
  assert.equal(
    liveMode.resolveExpectedEnvironment({
      secretKey: chiave("live"),
      declaredMode: "test",
    }),
    "live",
  );

  assert.equal(
    liveMode.resolveExpectedEnvironment({
      secretKey: chiave("test"),
      declaredMode: "live",
    }),
    "test",
  );
});

test("senza una chiave riconoscibile decide PAYMENT_MODE, e in mancanza si assume prova", () => {
  assert.equal(
    liveMode.resolveExpectedEnvironment({ secretKey: "", declaredMode: "live" }),
    "live",
  );
  assert.equal(liveMode.resolveExpectedEnvironment({}), "test");
});

/* ------------------------------------------------- l'ambiente dell'evento */

test("l'ambiente dell'evento si legge solo da un booleano", () => {
  assert.equal(liveMode.readEventEnvironment(true), "live");
  assert.equal(liveMode.readEventEnvironment(false), "test");
  assert.equal(
    liveMode.readEventEnvironment("false"),
    null,
    "una stringa non e una dichiarazione, e la stringa «false» e perfino vera",
  );
  assert.equal(liveMode.readEventEnvironment(undefined), null);
});

/* ------------------------------------------------------------ il verdetto */

test("un evento di prova passa su un endpoint di prova", () => {
  const verdetto = liveMode.checkEventEnvironment({
    liveMode: false,
    expected: "test",
  });

  assert.equal(verdetto.accepted, true);
  assert.equal(verdetto.eventEnvironment, "test");
});

test("un evento live non passa su un endpoint di sandbox", () => {
  const verdetto = liveMode.checkEventEnvironment({
    liveMode: true,
    expected: "test",
  });

  assert.equal(verdetto.accepted, false);
  assert.equal(verdetto.eventEnvironment, "live");
  assert.match(verdetto.reason, /live/);
});

test("un evento di prova non passa in produzione", () => {
  /*
    E il verso che conta di piu: un incasso mai avvenuto sulla rata di una
    famiglia vera.
  */
  const verdetto = liveMode.checkEventEnvironment({
    liveMode: false,
    expected: "live",
  });

  assert.equal(verdetto.accepted, false);
  assert.equal(verdetto.eventEnvironment, "test");
});

test("un evento che non dichiara l'ambiente viene rifiutato, non assunto di prova", () => {
  /*
    `Boolean(undefined)` e falso, ed e esattamente il ripiego silenzioso che
    questo controllo esiste per togliere: un corpo senza `livemode` non e un
    evento Stripe completo e non si puo dimostrare che appartenga a qui.
  */
  for (const expected of ["test", "live"]) {
    const verdetto = liveMode.checkEventEnvironment({
      liveMode: undefined,
      expected,
    });

    assert.equal(verdetto.accepted, false);
    assert.equal(verdetto.eventEnvironment, null);
    assert.match(verdetto.reason, /livemode/);
  }
});
