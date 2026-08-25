import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * La forma del numero di un documento.
 *
 * Un numero di ricevuta non e una stringa qualunque: e cio con cui una
 * segreteria ritrova un incasso due anni dopo, e cio che un commercialista
 * legge in colonna. Quello che va presidiato qui e che si scriva sempre nello
 * stesso modo e che si riesca a rileggere quello gia emesso — inclusi i
 * numeri di fattura che fino a oggi arrivavano dal client in forme che
 * nessuno ha progettato.
 */

let numbering;

before(async () => {
  numbering = await import("../../src/lib/documents/numbering.ts");
});

test("una ricevuta e una fattura si distinguono dal numero", () => {
  assert.equal(numbering.formatDocumentNumber("receipt", 2026, 1), "R-2026-0001");
  assert.equal(numbering.formatDocumentNumber("invoice", 2026, 1), "FT-2026-0001");
});

test("il progressivo e allineato a quattro cifre e non tronca oltre", () => {
  assert.equal(numbering.formatDocumentNumber("receipt", 2026, 7), "R-2026-0007");
  assert.equal(numbering.formatDocumentNumber("receipt", 2026, 12345), "R-2026-12345");
});

test("l'anno sta dentro il numero", () => {
  assert.equal(
    numbering.formatDocumentNumber("receipt", 2027, 1),
    "R-2027-0001",
    "«la 7» senza anno non identifica niente al secondo esercizio",
  );
});

test("un numero gia emesso si rilegge", () => {
  assert.deepEqual(numbering.parseDocumentNumber("R-2026-0042"), {
    kind: "receipt",
    year: 2026,
    sequence: 42,
  });
  assert.deepEqual(numbering.parseDocumentNumber("FT-2025-0003"), {
    kind: "invoice",
    year: 2025,
    sequence: 3,
  });
});

test("un numero scritto a mano non fa esplodere la rilettura", () => {
  assert.equal(numbering.parseDocumentNumber("fattura del 3 marzo"), null);
  assert.equal(numbering.parseDocumentNumber(""), null);
  assert.equal(numbering.parseDocumentNumber(null), null);
});

test("un prefisso sconosciuto si legge lo stesso, senza inventare il tipo", () => {
  const parsed = numbering.parseDocumentNumber("XX-2026-0009");

  assert.equal(parsed.kind, null);
  assert.equal(parsed.year, 2026);
  assert.equal(parsed.sequence, 9);
});

test("l'anno di esercizio di una data lo decide una funzione sola", () => {
  assert.equal(numbering.documentYearOf(new Date("2026-01-01T00:00:00Z")), 2026);
  assert.equal(numbering.documentYearOf("2025-12-31"), 2025);
  assert.equal(
    numbering.documentYearOf("non e una data"),
    new Date().getFullYear(),
    "una data illeggibile non deve produrre un anno zero",
  );
});
