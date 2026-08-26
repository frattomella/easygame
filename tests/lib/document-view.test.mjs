import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * Il documento stampabile.
 *
 * Due cose vanno presidiate, e la seconda vale piu della prima. Che il
 * documento contenga cio che una ricevuta deve contenere — numero, data,
 * intestatario, importo, causale, riferimento all'incasso. E che **nessun
 * valore ci entri senza essere sfuggito**: la causale di una rata e la
 * ragione sociale di una societa sono testo scritto da una persona, e un
 * apostrofo che rompe la pagina e il caso fortunato.
 */

let view;

before(async () => {
  view = await import("../../src/lib/documents/document-view.ts");
});

const render = (overrides = {}) =>
  view.renderDocumentHtml({
    document: {
      kind: "receipt",
      number: "R-2026-0007",
      issueDate: "2026-08-26T10:00:00.000Z",
      amount: 40,
      description: "Prima rata stagione 2026/27",
      method: "Bonifico",
      transactionReference: "incasso-1",
      athleteName: "Mario Rossi",
      ...(overrides.document || {}),
    },
    issuer: {
      name: "ASD Alfa",
      fiscalCode: "12345678901",
      city: "Roma",
      contactEmail: "info@alfa.it",
      ...(overrides.issuer || {}),
    },
    recipient: {
      name: "Anna Rossi",
      fiscalCode: "RSSNNA80A41H501K",
      city: "Roma",
      ...(overrides.recipient || {}),
    },
  });

/* ------------------------------------------------------- il contenuto */

test("il documento contiene cio che serve a ritrovarlo e a usarlo", () => {
  const html = render();

  for (const atteso of [
    "R-2026-0007",
    "26/08/2026",
    "ASD Alfa",
    "Anna Rossi",
    "RSSNNA80A41H501K",
    "Prima rata stagione 2026/27",
    "Bonifico",
    "incasso-1",
    "Mario Rossi",
  ]) {
    assert.ok(html.includes(atteso), `manca «${atteso}» nel documento`);
  }
});

test("l'importo e in euro, con la formattazione italiana", () => {
  const html = render({ document: { amount: 1234.5 } });

  assert.match(html, /1\.234,50/);
});

test("importo e data non dipendono dai dati di localizzazione dell'ambiente", () => {
  /*
    `Intl` ripiega sull'inglese quando l'ambiente non ha i dati italiani: un
    Node con ICU ridotto stamperebbe 1234,50 e 08/26/2026. Sarebbe lo stesso
    documento, diverso a seconda di dove e stato generato — e per undici
    giorni al mese la data sarebbe semplicemente un'altra.
  */
  const html = render({
    document: { amount: 1234.5, issueDate: "2026-08-26T10:00:00.000Z" },
  });

  assert.ok(html.includes("1.234,50 €"));
  assert.ok(html.includes("26/08/2026"));
});

test("una fattura dichiara di non essere stata trasmessa", () => {
  const html = render({ document: { kind: "invoice", number: "FT-2026-0001" } });

  assert.match(
    html,
    /Sistema di Interscambio non e effettuata/,
    "far credere a una societa di aver adempiuto sarebbe il modo peggiore di sbagliare",
  );
});

test("una ricevuta non parla di Sistema di Interscambio", () => {
  assert.equal(render().includes("Sistema di Interscambio"), false);
});

test("i campi vuoti non lasciano righe vuote", () => {
  const html = render({
    document: { method: "", transactionReference: "", athleteName: "" },
  });

  assert.equal(html.includes("Modalita di pagamento"), false);
  assert.equal(html.includes("Riferimento incasso"), false);
});

/* -------------------------------------------------------- la sicurezza */

test("una causale con dei tag non riscrive la pagina", () => {
  const html = render({
    document: { description: '<script>alert("ciao")</script>' },
  });

  assert.equal(html.includes("<script>alert"), false);
  assert.ok(html.includes("&lt;script&gt;"));
});

test("un apostrofo in una ragione sociale non rompe niente", () => {
  const html = render({ issuer: { name: "ASD L'Aquila" } });

  assert.ok(html.includes("ASD L&#039;Aquila"));
});

test("un logo con un indirizzo manipolato non esce dall'attributo", () => {
  const html = render({
    issuer: { logoUrl: '" onerror="alert(1)' },
  });

  assert.equal(html.includes('onerror="alert(1)"'), false);
});

test("l'aiuto per sfuggire il testo e esportato e copre le cinque entita", () => {
  assert.equal(
    view.escapeHtml(`<>&"'`),
    "&lt;&gt;&amp;&quot;&#039;",
  );
});

/* ------------------------------------------------------------ la forma */

test("la pagina e autonoma: nessuna richiesta verso l'esterno", () => {
  const html = render();

  assert.equal(
    /<link[^>]+href="http/.test(html),
    false,
    "una pagina che dipende da un foglio remoto si stampa nuda senza rete",
  );
  assert.equal(/<script/.test(html), false);
});

test("la pagina si adatta e si stampa", () => {
  const html = render();

  assert.match(html, /@media print/);
  assert.match(html, /@media \(min-width: 640px\)/);
  assert.match(html, /viewport/);
});
