import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { normalizeImportedAthletes } from "../../src/lib/athlete-import.ts";

/**
 * Cosa l'import accettava senza dire niente.
 *
 * Trovati caricando un file volutamente ostile di venti righe: il riepilogo
 * era matematicamente giusto — 19 lette, 11 importabili, 8 scartate — e ogni
 * scarto era motivato con precisione, comprese le due date di febbraio (29
 * febbraio 2016 esiste, il 2015 no). Ma tre righe passavano come «Pronta»
 * mentre non lo erano, e per due di quelle il dato inventato e la data di
 * nascita: cioe cio da cui discendono eta, categoria per anno e codice fiscale.
 */

const MAPPING = {
  firstName: "Nome",
  lastName: "Cognome",
  birthDate: "Data di nascita",
  fullName: null,
  birthYear: null,
  category: null,
  gender: null,
  fiscalCode: null,
  email: null,
  phone: null,
};

const CATEGORIES = [{ id: "category-pulcini", name: "Pulcini" }];

const normalize = (rows, mapping = MAPPING) =>
  normalizeImportedAthletes(rows, mapping, CATEGORIES, {
    today: "2026-08-28",
  });

const row = (birth) => ({
  Nome: "Marco",
  Cognome: "Rossi",
  "Data di nascita": birth,
});

test("una data di nascita nel futuro non e una riga pronta", () => {
  const [result] = normalize([row("05/05/2030")]);

  assert.equal(result.status, "error");
  assert.deepEqual(result.errors, ["Data di nascita nel futuro (2030-05-05)"]);
});

test("il confine e oggi, non l'anno", () => {
  assert.equal(normalize([row("2026-08-28")])[0].status, "ready");
  assert.equal(normalize([row("2026-08-29")])[0].status, "error");
});

/**
 * `toIsoDate` rifiuta gia da sempre un anno **numerico** minore di 1900. La
 * stessa cifra scritta come testo passava: `05/05/1890` dava una riga «Pronta».
 */
test("un anno di nascita impossibile viene scartato come se fosse un numero", () => {
  const [result] = normalize([row("05/05/1890")]);

  assert.equal(result.status, "error");
  assert.deepEqual(result.errors, [
    "Data di nascita non plausibile (1890-05-05)",
  ]);
  assert.equal(normalize([row("05/05/1900")])[0].status, "ready");
});

/**
 * L'anno secco resta importabile — meglio un atleta con una data approssimata
 * che nessun atleta — ma smette di essere silenzioso.
 */
test("un anno secco nella colonna data si importa dicendolo", () => {
  const [result] = normalize([row("2016")]);

  assert.equal(result.status, "ready");
  assert.equal(result.birthDate, "2016-01-01");
  assert.deepEqual(result.warnings.slice(0, 1), [
    "Solo l'anno (2016): data impostata al 1 gennaio",
  ]);
});

/**
 * Nella colonna «Anno di nascita» l'anno secco e il dato atteso: dirlo li
 * sarebbe rumore.
 */
test("nella colonna anno di nascita l'anno secco non produce avvisi", () => {
  const [result] = normalizeImportedAthletes(
    [{ Nome: "Marco", Cognome: "Rossi", "Anno di nascita": "2016" }],
    { ...MAPPING, birthDate: null, birthYear: "Anno di nascita" },
    CATEGORIES,
    { today: "2026-08-28" },
  );

  assert.equal(result.status, "ready");
  assert.equal(result.birthDate, "2016-01-01");
  assert.equal(
    result.warnings.some((warning) => warning.includes("Solo l'anno")),
    false,
  );
});

/**
 * Le righe corrette del file ostile devono restare corrette: la stretta non
 * deve trasformarsi in un rifiuto di dati validi.
 */
test("le date valide del collaudo continuano a passare", () => {
  for (const value of ["12/05/2016", "2015-07-03", "29/02/2016", "1/6/2017"]) {
    assert.equal(
      normalize([row(value)])[0].status,
      "ready",
      `${value} deve restare importabile`,
    );
  }

  // E il 29 febbraio di un anno non bisestile resta uno scarto.
  assert.equal(normalize([row("29/02/2015")])[0].status, "error");
});

/**
 * Nell'anteprima, la differenza fra le due righe con un problema non e il
 * problema: e la conseguenza. Prima la diceva solo il colore.
 */
test("l'anteprima dichiara a parole se una riga viene scartata", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/forms/AthleteImportDialog.tsx"),
    "utf8",
  );

  assert.match(source, /<span className="font-medium">Scartata:<\/span>/);
  assert.match(source, /Importata con avviso:/);
});
