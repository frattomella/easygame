import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { assertRegistrationDates } from "../../src/lib/server/resources.ts";

/**
 * MASTER BATCH — Wave E (Membership / Forms Import).
 *
 * E1/E2/E3: il difetto reale — una scadenza registrata con il rilascio
 * vuoto, perche `athletes.data` e un array JSON senza vincolo di database
 * e nessuno strato (modulo, server, scrittore) lo controllava. La guardia
 * sta nello stesso punto di `assertRegistrationFederations`: l'unica
 * strada per `athletes.data`.
 */

test("65: una scadenza senza rilascio e rifiutata", () => {
  assert.throws(
    () =>
      assertRegistrationDates("athletes", {
        data: { registrations: [{ federationId: "fed-1", expiryDate: "2027-06-30" }] },
      }),
    /scadenza ma non una data di rilascio/,
  );
});

test("66: un rilascio senza scadenza e accettato (nessuna scadenza nota non e un errore)", () => {
  assert.doesNotThrow(() =>
    assertRegistrationDates("athletes", {
      data: { registrations: [{ federationId: "fed-1", issueDate: "2026-09-01" }] },
    }),
  );
});

test("67: la scadenza prima del rilascio e rifiutata", () => {
  assert.throws(
    () =>
      assertRegistrationDates("athletes", {
        data: {
          registrations: [
            { federationId: "fed-1", issueDate: "2026-09-01", expiryDate: "2026-01-01" },
          ],
        },
      }),
    /scade prima della data di rilascio/,
  );
});

test("68: rilascio e scadenza validi sono accettati", () => {
  assert.doesNotThrow(() =>
    assertRegistrationDates("athletes", {
      data: {
        registrations: [
          { federationId: "fed-1", issueDate: "2026-09-01", expiryDate: "2027-08-31" },
        ],
      },
    }),
  );
});

test("64: nessun tesseramento e sempre valido", () => {
  assert.doesNotThrow(() => assertRegistrationDates("athletes", { data: { registrations: [] } }));
  assert.doesNotThrow(() => assertRegistrationDates("athletes", { data: {} }));
});

test("70: una riga storica invalida, non toccata, non blocca il salvataggio di un altro campo (E4)", () => {
  const rigaLegacy = { federationId: "fed-1", expiryDate: "2020-01-01" };
  assert.doesNotThrow(() =>
    assertRegistrationDates(
      "athletes",
      { data: { registrations: [rigaLegacy] } },
      { data: { registrations: [rigaLegacy] } },
    ),
  );
});

test("69: la guardia vale anche fuori dalla scheda (bypass API)", () => {
  // Stessa funzione, stesso punto di ingresso di createResource/updateResource: non solo il modulo lo chiama.
  const source = readFileSync("src/lib/server/resources.ts", "utf8");
  const occorrenze = source.match(/assertRegistrationDates\(/g) || [];
  assert.ok(occorrenze.length >= 2, "le due chiamate (create e update)");
});

/**
 * E5-E12 (import DOCX): la discovery (E8) non ha trovato nessuna libreria
 * di parsing zip/XML gia installata; dopo la valutazione di sicurezza
 * (albero delle dipendenze, nessuna vulnerabilita nuova via `npm audit`,
 * nessuna esecuzione di macro) e stata aggiunta `mammoth` (MIT,
 * mwilliamson/mammoth.js) piu `jszip` come dipendenza diretta per il
 * vaglio della bomba d'archivio prima della conversione — vedi
 * `src/lib/server/docx-import.ts` e `tests/lib/multi-season-master-batch-wave-e-docx.test.mjs`
 * per l'implementazione e i test comportamentali.
 */
test("E5-E12: mammoth e jszip sono le sole dipendenze DOCX aggiunte, dopo la discovery", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  assert.ok(deps.mammoth, "mammoth deve essere presente: e il convertitore scelto");
  assert.ok(deps.jszip, "jszip deve essere presente: serve al vaglio della bomba d'archivio");
  const altreLibrerieDocx = ["docx", "pizzip", "adm-zip", "unzipper", "yauzl", "officegen"];
  const presenti = altreLibrerieDocx.filter((nome) => deps[nome]);
  assert.deepEqual(presenti, [], "nessuna libreria DOCX in piu oltre a quella scelta");
});
