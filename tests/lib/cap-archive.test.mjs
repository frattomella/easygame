import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildCapIndex,
  lookupCap,
  suggestCap,
} from "../../src/lib/cap-model.ts";

/**
 * Il CAP di un comune (Blocco A, punto 9).
 *
 * **La storia, perche conta.** ADR-0035 aveva dichiarato la funzione
 * impossibile: nel repository non c'era nessuna fonte del CAP e ISTAT non lo
 * pubblica. La verifica era giusta e la conclusione prudente — un mapping
 * CAP → comune scritto a memoria produce indirizzi plausibili e falsi, che
 * finiscono su una ricevuta. Quello che mancava era una fonte, non un
 * permesso di inventarne una.
 *
 * La fonte e IPA (AgID): l'anagrafe delle pubbliche amministrazioni, CC BY
 * 4.0, aggiornata ogni giorno, con il CAP della sede di ciascuna.
 *
 * **La proprieta che questi test difendono.** IPA non dice «i CAP del comune
 * X»: dice il CAP di ogni amministrazione. Raggruppati per comune, sono i CAP
 * *osservati*. Per un comune con un solo CAP l'osservazione e il CAP; per
 * Roma e un sottoinsieme dei suoi duecento. Quindi il dataset propone solo
 * dove l'osservazione e unica, e per gli altri dice che sono piu d'uno senza
 * dire quali. Un test che lasciasse passare un CAP proposto per Roma sarebbe
 * il test di un difetto.
 */

// --- il modello puro --------------------------------------------------------

const index = buildCapIndex(
  [
    ["A001", "35031"],
    ["L219", "10121"],
  ],
  ["H501", "F205"],
);

test("un comune con un solo CAP osservato lo propone", () => {
  assert.deepEqual(lookupCap(index, "A001"), {
    status: "unique",
    cap: "35031",
  });
  assert.equal(suggestCap(index, "A001"), "35031");
});

test("un comune con piu CAP non ne propone nessuno, e dice perche", () => {
  assert.deepEqual(lookupCap(index, "H501"), { status: "ambiguous" });
  assert.equal(suggestCap(index, "H501"), "");
});

test("un comune di cui non si sa niente lo dice in modo diverso", () => {
  assert.deepEqual(lookupCap(index, "Z999"), { status: "unknown" });
  assert.equal(suggestCap(index, "Z999"), "");
});

test("i due modi di non sapere non si confondono", () => {
  /*
    E la ragione per cui `lookupCap` restituisce uno stato e non una stringa
    vuota: al form servono due messaggi diversi, «questo comune ha piu CAP» e
    «di questo comune non so niente», e con una stringa vuota sola non li
    potrebbe distinguere.
  */
  assert.notDeepEqual(lookupCap(index, "H501"), lookupCap(index, "Z999"));
});

test("il codice catastale si confronta senza badare a spazi e minuscole", () => {
  assert.deepEqual(lookupCap(index, " a001 "), {
    status: "unique",
    cap: "35031",
  });
});

test("un CAP malformato non entra nell'indice", () => {
  const dirty = buildCapIndex(
    [
      ["A001", "3503"],
      ["A004", "abcde"],
      ["ZZZZ", "20121"],
      ["A005", "23821"],
    ],
    [],
  );

  assert.deepEqual(lookupCap(dirty, "A001"), { status: "unknown" });
  assert.deepEqual(lookupCap(dirty, "A004"), { status: "unknown" });
  assert.deepEqual(lookupCap(dirty, "A005"), {
    status: "unique",
    cap: "23821",
  });
});

// --- il dataset vero --------------------------------------------------------

const dataset = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "src", "data", "cap-ipa.json"),
    "utf8",
  ),
);

const comuni = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "src", "data", "comuni-istat.json"),
    "utf8",
  ),
).comuni;

test("il dataset dichiara la sua fonte e la sua licenza", () => {
  assert.match(dataset.source.name, /IPA/);
  assert.equal(dataset.source.license, "CC BY 4.0");
  assert.match(dataset.source.url, /^https:\/\/indicepa\.gov\.it\//);
  assert.match(dataset.source.sha256, /^[0-9a-f]{64}$/);
});

/**
 * Un file di dati che non spiega cosa contiene diventa sbagliato da solo: chi
 * lo apre fra un anno lo userebbe come «i CAP dei comuni», che non e.
 */
test("il dataset spiega dentro di se che cosa e", () => {
  assert.match(dataset.meaning, /osservat/i);
  assert.match(dataset.joinedWith.dataset, /comuni-istat\.json/);
});

test("ogni riga e un codice catastale e un CAP, entrambi ben formati", () => {
  for (const [belfiore, cap] of dataset.unique) {
    assert.match(belfiore, /^[A-Z]\d{3}$/);
    assert.match(cap, /^\d{5}$/);
  }
  for (const belfiore of dataset.ambiguous) {
    assert.match(belfiore, /^[A-Z]\d{3}$/);
  }
});

test("nessun codice catastale sta in tutte e due le liste", () => {
  const ambiguous = new Set(dataset.ambiguous);
  const overlap = dataset.unique
    .map(([belfiore]) => belfiore)
    .filter((belfiore) => ambiguous.has(belfiore));

  assert.deepEqual(overlap, []);
});

/**
 * Ogni codice catastale del dataset CAP deve esistere nell'archivio ISTAT.
 *
 * E la verifica che l'unione fra le due tabelle non abbia prodotto righe
 * inventate: un codice che ISTAT non conosce sarebbe un comune costruito dal
 * join, non trovato.
 */
test("ogni comune del dataset CAP esiste nell'archivio ISTAT", () => {
  const known = new Set(comuni.map(([, , belfiore]) => belfiore));

  const unknown = [
    ...dataset.unique.map(([belfiore]) => belfiore),
    ...dataset.ambiguous,
  ].filter((belfiore) => !known.has(belfiore));

  assert.deepEqual(unknown, [], "il join ha prodotto comuni che ISTAT non ha");
});

test("la copertura resta quella dichiarata e non si degrada in silenzio", () => {
  const covered = dataset.unique.length + dataset.ambiguous.length;

  assert.ok(
    dataset.unique.length > 7500,
    `solo ${dataset.unique.length} comuni con CAP univoco`,
  );
  assert.ok(
    covered / comuni.length > 0.98,
    `copertura ${(covered / comuni.length) * 100}%: qualcosa si e rotto nel join`,
  );
});

/**
 * Le citta grandi devono stare fra gli ambigui.
 *
 * E il controllo che vale piu di tutti gli altri: sono i comuni in cui
 * proporre un CAP sarebbe *sbagliato*, non solo incompleto. Se un giorno Roma
 * finisse fra gli univoci, il campo si riempirebbe con il CAP di un ufficio
 * pubblico qualsiasi e nessuno se ne accorgerebbe.
 */
test("le citta con piu CAP non ne propongono nessuno", () => {
  const built = buildCapIndex(dataset.unique, dataset.ambiguous);

  /** Roma, Milano, Napoli, Torino, Genova, Bologna, Firenze. */
  for (const belfiore of [
    "H501",
    "F205",
    "F839",
    "L219",
    "D969",
    "A944",
    "D612",
  ]) {
    assert.deepEqual(
      lookupCap(built, belfiore),
      { status: "ambiguous" },
      `${belfiore} non deve proporre un CAP: ne ha piu d'uno`,
    );
  }
});

test("un comune piccolo propone il suo CAP", () => {
  const built = buildCapIndex(dataset.unique, dataset.ambiguous);

  // Abano Terme (PD), primo comune dell'archivio ISTAT.
  assert.deepEqual(lookupCap(built, "A001"), {
    status: "unique",
    cap: "35031",
  });
});
