import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * L'intestatario di un documento, nella **seconda** forma.
 *
 * Finche questo modulo sapeva partire solo da un atleta, la sponsorizzazione —
 * l'unica entrata dichiaratamente commerciale del catalogo, l'unica che una
 * fattura la **richiede** — era l'unica che non poteva averne una. Qui si
 * verifica che la controparte non-atleta sia un intestatario di prima classe, e
 * che la forma storica non si sia mossa di un millimetro.
 */

let recipients;
let sponsors;

before(async () => {
  recipients = await import("../../src/lib/documents/fiscal-recipient.ts");
  sponsors = await import("../../src/lib/sponsors/model.ts");
});

const SPONSOR = {
  id: "sponsor-1",
  name: "Rossi Impianti SRL",
  type: "sponsor",
  vatNumber: "12345678903",
  sdi: "ABC1234",
  pec: "rossi@pec.it",
  address: "Via Torino 10",
  city: "Torino",
  postalCode: "10121",
  province: "TO",
};

const ATLETA = {
  first_name: "Mario",
  last_name: "Rossi",
  data: {
    guardians: [
      { name: "Anna", surname: "Rossi", fiscalCode: "RSSNNA80A41H501K" },
    ],
  },
};

test("l'intestatario di un documento a uno sponsor e lo sponsor", () => {
  const intestatario = recipients.resolveFiscalRecipient({
    counterparty: sponsors.sponsorFiscalCounterparty(
      sponsors.normalizeSponsor(SPONSOR),
    ),
  });

  assert.equal(intestatario.name, "Rossi Impianti SRL");
  assert.equal(intestatario.vatNumber, "12345678903");
  assert.equal(intestatario.recipientCode, "ABC1234");
  assert.equal(intestatario.city, "Torino");
  assert.equal(intestatario.source, "counterparty");
  assert.equal(intestatario.counterpartyKind, "SPONSOR");
  assert.equal(intestatario.counterpartyId, "sponsor-1");
});

test("la forma storica non e cambiata: dato un atleta, intesta il tutore", () => {
  const intestatario = recipients.resolveFiscalRecipient(ATLETA);

  assert.equal(intestatario.name, "Anna Rossi");
  assert.equal(intestatario.source, "guardian");
  assert.equal(intestatario.counterpartyKind, undefined);
});

test("una controparte senza nome non e un intestatario", () => {
  const intestatario = recipients.resolveFiscalRecipient({
    counterparty: { kind: "SPONSOR", name: "   " },
  });

  assert.equal(intestatario.source, "unknown");
  assert.deepEqual(recipients.missingInvoiceFields(intestatario), [
    "intestatario",
    "codice fiscale o partita IVA",
  ]);
});

test("uno sponsor con la sola partita IVA puo ricevere una fattura", () => {
  const intestatario = recipients.resolveFiscalRecipient({
    counterparty: sponsors.sponsorFiscalCounterparty(
      sponsors.normalizeSponsor(SPONSOR),
    ),
  });

  assert.deepEqual(recipients.missingInvoiceFields(intestatario), []);
});

test("un ente senza partita IVA passa con il solo codice fiscale", () => {
  const intestatario = recipients.resolveFiscalRecipient({
    counterparty: sponsors.sponsorFiscalCounterparty(
      sponsors.normalizeSponsor({
        id: "sponsor-2",
        name: "Comune di Rivoli",
        fiscalCode: "00529840019",
      }),
    ),
  });

  assert.equal(intestatario.fiscalCode, "00529840019");
  assert.deepEqual(recipients.missingInvoiceFields(intestatario), []);
});
