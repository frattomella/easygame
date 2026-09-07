import assert from "node:assert/strict";
import test from "node:test";

import { buildEmailPreviewCatalog } from "../../src/lib/server/email/preview-catalog.ts";
import {
  __setEmailProviderForTests,
  sendTransactionalEmail,
} from "../../src/lib/server/email/email-service.ts";
import {
  __setSmsProviderForTests,
  sendSms,
} from "../../src/lib/server/sms/sms-service.ts";

/**
 * **L'anteprima non spedisce niente** (PP-05B).
 *
 * E la proprieta che un'anteprima di email deve avere e che nessuno prova mai,
 * perche sembra ovvia. Non lo e: le funzioni che compongono il contenuto e
 * quelle che lo mandano vivono nello stesso modulo, e la distanza fra
 * `buildPaymentReminderEmail` e `sendPaymentReminderEmail` e una lettera.
 * Basta che un giorno il catalogo chiami la seconda credendo di chiamare la
 * prima, e aprire una pagina di manutenzione manda posta vera.
 *
 * Qui il trasporto e un doppio che **conta** invece di spedire. Il catalogo si
 * costruisce per intero, e il conto deve restare zero.
 *
 * ## Verifica della mutazione
 *
 * Il test non e vacuo: la seconda parte manda deliberatamente un messaggio con
 * lo stesso doppio e verifica che il contatore salga. Se il seme del trasporto
 * non funzionasse — cioe se il doppio non fosse mai interrogato — il conteggio
 * resterebbe zero anche li, e il primo `assert` sarebbe vero per la ragione
 * sbagliata.
 */

const montaDoppi = () => {
  const inviateEmail = [];
  const inviatiSms = [];

  __setEmailProviderForTests({
    id: "test",
    async verify() {},
    async send(message) {
      inviateEmail.push(message);
    },
  });
  __setSmsProviderForTests({
    id: "test",
    async send(message) {
      inviatiSms.push(message);
    },
  });

  return { inviateEmail, inviatiSms };
};

const smontaDoppi = () => {
  __setEmailProviderForTests(undefined);
  __setSmsProviderForTests(undefined);
};

test("costruire l'intero catalogo dell'anteprima non manda nessuna email e nessun SMS", () => {
  const { inviateEmail, inviatiSms } = montaDoppi();
  try {
    const catalogo = buildEmailPreviewCatalog();

    assert.ok(catalogo.length >= 6, "il catalogo non deve essere vuoto");
    assert.equal(inviateEmail.length, 0, "nessuna email deve essere partita");
    assert.equal(inviatiSms.length, 0, "nessun SMS deve essere partito");
  } finally {
    smontaDoppi();
  }
});

test("il doppio del trasporto e davvero interrogato: la prova non e vacua", async () => {
  const { inviateEmail, inviatiSms } = montaDoppi();
  try {
    await sendTransactionalEmail({
      to: "controllo@esempio.test",
      subject: "Controllo",
      html: "<p>x</p>",
      text: "x",
    });
    await sendSms({ to: "+393401234567", text: "x" });

    assert.equal(inviateEmail.length, 1, "il doppio email conta");
    assert.equal(inviatiSms.length, 1, "il doppio SMS conta");
  } finally {
    smontaDoppi();
  }
});

test("il catalogo non porta dentro nessun indirizzo o dominio reale", () => {
  const catalogo = buildEmailPreviewCatalog();
  const tutto = JSON.stringify(catalogo);

  /*
    Gli esempi vivono su `esempio.test`, che per RFC 2606 non si registra e
    non risolve. Il controllo e su cio che si potrebbe pescare per sbaglio
    dall'archivio o dalla configurazione reale.
  */
  for (const vietato of ["@gmail.", "@libero.", "@hotmail.", "cedisoft"]) {
    assert.ok(
      !tutto.toLowerCase().includes(vietato),
      `l'anteprima non deve contenere «${vietato}»`,
    );
  }
});

test("il catalogo copre entrambi i marchi, e quello del club porta sempre il piede EasyGame", () => {
  const catalogo = buildEmailPreviewCatalog();
  const club = catalogo.filter((voce) => voce.brandMode === "club");
  const easygame = catalogo.filter((voce) => voce.brandMode === "easygame");

  assert.ok(club.length > 0, "serve almeno un esempio a marchio club");
  assert.ok(easygame.length > 0, "e almeno uno a marchio EasyGame");

  for (const voce of club) {
    assert.ok(
      voce.html.includes("Powered by"),
      `«${voce.title}» deve portare il riferimento non rimovibile`,
    );
  }
});

test("l'esempio con il nome di club ostile mostra l'escaping che regge", () => {
  const voce = buildEmailPreviewCatalog().find(
    (item) => item.id === "nome-club-ostile",
  );
  assert.ok(voce, "l'esempio ostile deve restare nel catalogo");
  assert.ok(!voce.html.includes("<img src=x"), "il markup non sopravvive");
  assert.ok(
    !voce.html.includes("tracciatore-esterno.test"),
    "il logo su host esterno non deve nemmeno comparire nel markup",
  );
  assert.ok(voce.html.includes("&lt;img"), "compare sfuggito");
});
