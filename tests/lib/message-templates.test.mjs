import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MESSAGE_TEMPLATES,
  DEFAULT_MESSAGE_TEMPLATE_KEYS,
} from "../../src/lib/messages/defaults.ts";
import {
  economicPlaceholdersUsed,
  renderMessageTemplate,
  validateMessageTemplate,
} from "../../src/lib/messages/templates.ts";
import {
  ECONOMIC_PLACEHOLDER_KEYS,
  isKnownPlaceholderKey,
} from "../../src/lib/documents/placeholders.ts";

/**
 * Il contenuto di un messaggio, scritto dal club (W2-F, G-05).
 *
 * **Cosa prova davvero questo file.** Non che la sostituzione funzioni — quella
 * e la parte facile — ma le quattro promesse che rendono sicuro mandare
 * trecento email con un testo che ha scritto qualcun altro:
 *
 *   1. un dato che manca resta vuoto **ed e dichiarato**, mai inventato;
 *   2. una chiave fuori catalogo non si risolve **mai**, e si vede in anteprima;
 *   3. un valore che contiene marcatura resta un valore, anche in HTML;
 *   4. un importo non esce verso chi non lo puo vedere, e il diniego si
 *      distingue dal dato mancante.
 *
 * Piu una quinta che le sostiene tutte: il render e **deterministico**, cioe
 * l'anteprima mostra esattamente cio che partira.
 */

const template = (subject, body) => ({ subject, body });

/* ------------------------------------------------ il segnaposto che risolve */

test("un segnaposto del catalogo con un valore viene scritto", () => {
  const result = renderMessageTemplate({
    template: template(
      "{{club.name}}: promemoria",
      "Gentile {{recipient.name}},\n\nriguarda {{athlete.first_name}}.",
    ),
    values: {
      "club.name": "ASD Vallesina",
      "recipient.name": "Laura Rossi",
      "athlete.first_name": "Mario",
    },
  });

  assert.equal(result.subject, "ASD Vallesina: promemoria");
  assert.equal(result.text, "Gentile Laura Rossi,\n\nriguarda Mario.");
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(result.denied, []);
});

test("un segnaposto senza valore resta vuoto e viene dichiarato", () => {
  const result = renderMessageTemplate({
    template: template("Promemoria", "Gentile {{recipient.name}}, per {{athlete.first_name}}."),
    values: { "recipient.name": "Laura" },
  });

  assert.equal(result.text, "Gentile Laura, per .");
  assert.deepEqual(result.unresolved, ["athlete.first_name"]);
  assert.deepEqual(result.denied, []);
});

test("una chiave presente ma vuota vale come dato mancante", () => {
  const result = renderMessageTemplate({
    template: template("x", "{{athlete.first_name}}"),
    values: { "athlete.first_name": "" },
  });

  assert.equal(result.text, "");
  assert.deepEqual(result.unresolved, ["athlete.first_name"]);
});

/* ------------------------------------------------------- il catalogo chiuso */

test("un segnaposto fuori catalogo non si risolve mai, nemmeno con un valore", () => {
  const result = renderMessageTemplate({
    /*
      Il valore c'e ed e giusto: se il modulo lo scrivesse, il catalogo non
      sarebbe piu chiuso e chiunque potrebbe far comparire un dato nuovo senza
      passare dall'elenco che l'editor mostra.
    */
    template: template("{{importo}}", "Totale {{importo}} euro."),
    values: { importo: "130,00" },
  });

  assert.equal(result.subject, "");
  assert.equal(result.text, "Totale  euro.");
  assert.deepEqual(result.unresolved, ["importo"]);
});

test("validateMessageTemplate elenca i segnaposto sconosciuti, oggetto compreso", () => {
  assert.deepEqual(
    validateMessageTemplate(
      template("{{pippo}} e {{club.name}}", "{{importo}} e {{athlete.first_name}}"),
    ),
    ["importo", "pippo"],
  );

  assert.deepEqual(
    validateMessageTemplate(template("{{club.name}}", "{{athlete.first_name}}")),
    [],
  );
});

/* ------------------------------------------------------------------ Unicode */

test("accenti, apostrofo tipografico ed emoji passano intatti nel testo", () => {
  const nome = "Niccolò D’Angelò ⚽️";
  const result = renderMessageTemplate({
    template: template("Ciao {{recipient.name}}", "Benvenuto {{recipient.name}}! 🎉"),
    values: { "recipient.name": nome },
  });

  assert.equal(result.subject, `Ciao ${nome}`);
  assert.equal(result.text, `Benvenuto ${nome}! 🎉`);
  /*
    L'apostrofo tipografico non e l'apostrofo dritto: non e un carattere di
    marcatura e non va toccato. Se qui comparisse `&#039;` vorrebbe dire che
    qualcuno normalizza i nomi delle persone, che non e compito di questo
    modulo.
  */
  assert.match(result.html, /Niccolò D’Angelò ⚽️/);
  assert.match(result.html, /🎉/);
});

/* ----------------------------------------------------------- testo vs html */

test("un valore con marcatura resta un valore: nel testo com'e, in HTML neutralizzato", () => {
  const result = renderMessageTemplate({
    template: template("x", "Gentile {{recipient.name}}, saluti."),
    values: { "recipient.name": '<script>alert("x")</script>' },
  });

  assert.equal(result.text, 'Gentile <script>alert("x")</script>, saluti.');
  assert.ok(
    !result.html.includes("<script>"),
    "un cognome scritto come un tag e un cognome, non codice",
  );
  assert.match(result.html, /&lt;script&gt;/);
  assert.match(result.html, /&quot;x&quot;/);
});

test("anche il testo del modello finisce neutralizzato: il corpo e testo, non HTML", () => {
  const result = renderMessageTemplate({
    template: template("x", "Quota < 100 & saldo > 0"),
    values: {},
  });

  assert.equal(result.text, "Quota < 100 & saldo > 0");
  assert.equal(result.html, "<p>Quota &lt; 100 &amp; saldo &gt; 0</p>");
});

test("le righe vuote diventano paragrafi e gli a capo singoli un'interruzione", () => {
  const result = renderMessageTemplate({
    template: template("x", "Prima riga\nseconda riga\n\nSecondo paragrafo"),
    values: {},
  });

  assert.equal(
    result.html,
    "<p>Prima riga<br />seconda riga</p><p>Secondo paragrafo</p>",
  );
});

/* ------------------------------------------------------------ determinismo */

test("due render dello stesso ingresso danno lo stesso messaggio", () => {
  const input = {
    template: DEFAULT_MESSAGE_TEMPLATES.installment_overdue,
    values: {
      "club.name": "ASD Vallesina",
      "recipient.name": "Laura Rossi",
      "athlete.first_name": "Mario",
      "athlete.last_name": "Rossi",
      "installment.residual_amount": "130,00 €",
      "installment.overdue_count": "2",
      "payment.next_due_date": "31/10/2026",
      "payment.link": "https://easygame.example/pay/abc",
    },
    allowEconomic: true,
  };

  assert.deepEqual(renderMessageTemplate(input), renderMessageTemplate(input));
});

/* --------------------------------------------------------- dati economici */

test("senza autorizzazione un importo non esce, e il diniego non e un dato mancante", () => {
  const result = renderMessageTemplate({
    template: template(
      "{{club.name}}: quote",
      "Residuo {{installment.residual_amount}}, rate scadute {{installment.overdue_count}}, link {{payment.link}}, scadenza {{installment.due_date}}, atleta {{athlete.first_name}}.",
    ),
    values: {
      "club.name": "ASD Vallesina",
      "installment.residual_amount": "130,00 €",
      "installment.overdue_count": "2",
      "payment.link": "https://easygame.example/pay/abc",
      "installment.due_date": "31/10/2026",
      "athlete.first_name": "Mario",
    },
  });

  assert.deepEqual(result.denied, [
    "installment.overdue_count",
    "installment.residual_amount",
    "payment.link",
  ]);
  assert.deepEqual(
    result.unresolved,
    [],
    "un segnaposto negato non e un segnaposto mancante: i due errori hanno due rimedi",
  );
  assert.ok(!result.text.includes("130,00"));
  assert.ok(!result.text.includes("easygame.example"));
  /*
    La data di scadenza dice **quando**, non **quanto**: non e un dato
    economico e resta leggibile anche a chi non governa la configurazione.
  */
  assert.match(result.text, /scadenza 31\/10\/2026/);
  assert.match(result.text, /atleta Mario/);
});

test("con autorizzazione gli stessi segnaposto si risolvono", () => {
  const result = renderMessageTemplate({
    template: template("x", "Residuo {{installment.residual_amount}}, link {{payment.link}}."),
    values: {
      "installment.residual_amount": "130,00 €",
      "payment.link": "https://easygame.example/pay/abc",
    },
    allowEconomic: true,
  });

  assert.equal(
    result.text,
    "Residuo 130,00 €, link https://easygame.example/pay/abc.",
  );
  assert.deepEqual(result.denied, []);
  assert.deepEqual(result.unresolved, []);
});

test("il default e negato: chi non dichiara nulla non manda importi", () => {
  const result = renderMessageTemplate({
    template: template("x", "{{payment.remaining}}"),
    values: { "payment.remaining": "130,00" },
  });

  assert.deepEqual(result.denied, ["payment.remaining"]);
  assert.equal(result.text, "");
});

test("ogni chiave economica appartiene al catalogo condiviso", () => {
  for (const key of ECONOMIC_PLACEHOLDER_KEYS) {
    assert.ok(
      isKnownPlaceholderKey(key),
      `${key} e dichiarata economica ma non e nel catalogo`,
    );
  }
});

/* ------------------------------------------------ i modelli predefiniti */

test("nessun modello predefinito usa un segnaposto fuori catalogo", () => {
  for (const key of DEFAULT_MESSAGE_TEMPLATE_KEYS) {
    assert.deepEqual(
      validateMessageTemplate(DEFAULT_MESSAGE_TEMPLATES[key]),
      [],
      `il modello ${key} nomina un segnaposto che nessuno sapra risolvere`,
    );
  }
});

test("i modelli predefiniti sono quattro, e sono dati", () => {
  assert.deepEqual(DEFAULT_MESSAGE_TEMPLATE_KEYS, [
    "installment_due",
    "installment_overdue",
    "certificate_expiring",
    "event_invitation",
  ]);

  for (const key of DEFAULT_MESSAGE_TEMPLATE_KEYS) {
    const model = DEFAULT_MESSAGE_TEMPLATES[key];
    assert.equal(typeof model.subject, "string");
    assert.equal(typeof model.body, "string");
    assert.ok(model.subject.length > 0);
    assert.ok(model.body.length > 0);
  }
});

test("i due modelli di pagamento dichiarano di contenere dati economici", () => {
  /*
    §11 del planning: inviare un modello con importi richiede il permesso, non
    solo scriverlo. Chi decide deve poterlo sapere prima di comporre.
  */
  assert.ok(
    economicPlaceholdersUsed(DEFAULT_MESSAGE_TEMPLATES.installment_due).length > 0,
  );
  assert.ok(
    economicPlaceholdersUsed(DEFAULT_MESSAGE_TEMPLATES.installment_overdue).length >
      0,
  );
  assert.deepEqual(
    economicPlaceholdersUsed(DEFAULT_MESSAGE_TEMPLATES.certificate_expiring),
    [],
    "un promemoria di certificato non parla di soldi: non deve chiedere quel permesso",
  );
  assert.deepEqual(
    economicPlaceholdersUsed(DEFAULT_MESSAGE_TEMPLATES.event_invitation),
    [],
  );
});

/* ------------------------------------------------------------ robustezza */

test("un modello vuoto non esplode", () => {
  const result = renderMessageTemplate({
    template: template("", ""),
    values: {},
  });

  assert.equal(result.subject, "");
  assert.equal(result.text, "");
  assert.equal(result.html, "");
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(result.denied, []);
});

test("lo stesso segnaposto ripetuto compare una volta sola negli elenchi", () => {
  const result = renderMessageTemplate({
    template: template("{{pippo}}", "{{pippo}} e ancora {{pippo}}"),
    values: {},
  });

  assert.deepEqual(result.unresolved, ["pippo"]);
});
