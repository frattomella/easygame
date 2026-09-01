import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  ATHLETE_BULK_STATUS_ACTIONS,
  ATHLETE_STATUSES,
  ATHLETE_STATUS_HEADINGS,
  ATHLETE_STATUS_LABELS,
  ATHLETE_STATUS_PLURAL_LABELS,
  DEFAULT_ATHLETE_STATUS,
  athleteStatusQueryValues,
  isAthleteStatus,
  normalizeAthleteStatus,
  normalizeAthleteStatusFilter,
  parseAthleteStatus,
} from "../../src/lib/athletes/status.ts";

/**
 * **W6-01 · W6-03 · W6-04 — lo stato di un atleta.**
 *
 * Tre difetti che sembravano tre e sono uno solo: lo stato non aveva un
 * vocabolario, quindi nessuno poteva sbagliarlo *visibilmente*.
 *
 * - **W6-04**: gli stati erano tre e le etichette quattro. `inactive` era «In
 *   Prestito» sulla riga dell'elenco e «Disattivati» sul filtro: due bottoni
 *   diversi mostravano necessariamente lo stesso insieme, e il cliente vedeva
 *   quattro stati che il database non conosceva.
 * - **W6-03**: un'azione di massa scriveva `"activate"` — il nome dell'azione —
 *   dentro la colonna dello stato. Nessun filtro poteva riconoscerlo, quindi
 *   quegli atleti sparivano da **tutti**, «Attivi» compreso.
 * - **W6-01**: il filtro dell'elenco si spegneva da solo, e i test di questa
 *   parte stanno in `tests/ui/elenco-atleti-filtro.test.mjs`.
 *
 * Qui si prova il vocabolario, che e la fondazione degli altri due.
 */

test("i quattro stati sono esattamente quelli che il prodotto promette", () => {
  assert.deepEqual([...ATHLETE_STATUSES], [
    "active",
    "suspended",
    "loan",
    "inactive",
  ]);

  for (const stato of ATHLETE_STATUSES) {
    assert.ok(isAthleteStatus(stato), `${stato} deve essere uno stato`);
    assert.ok(ATHLETE_STATUS_LABELS[stato], `${stato} senza etichetta`);
    assert.ok(ATHLETE_STATUS_PLURAL_LABELS[stato], `${stato} senza plurale`);
    assert.ok(ATHLETE_STATUS_HEADINGS[stato], `${stato} senza intestazione`);
  }

  assert.ok(ATHLETE_STATUS_HEADINGS.all);
});

test("W6-04 · in prestito e disattivato sono due stati distinti", () => {
  assert.notEqual(normalizeAthleteStatus("loan"), normalizeAthleteStatus("inactive"));
  assert.notEqual(
    ATHLETE_STATUS_LABELS.loan,
    ATHLETE_STATUS_LABELS.inactive,
  );
  assert.notEqual(
    ATHLETE_STATUS_PLURAL_LABELS.loan,
    ATHLETE_STATUS_PLURAL_LABELS.inactive,
  );

  /*
    Il difetto originale era proprio questo: due etichette diverse per lo stesso
    valore. Nessuna etichetta puo ripetersi, altrimenti due filtri tornano a
    mostrare lo stesso insieme.
  */
  const etichette = ATHLETE_STATUSES.map((s) => ATHLETE_STATUS_PLURAL_LABELS[s]);
  assert.equal(new Set(etichette).size, etichette.length);

  const intestazioni = ATHLETE_STATUSES.map((s) => ATHLETE_STATUS_HEADINGS[s]);
  assert.equal(new Set(intestazioni).size, intestazioni.length);
});

test("W6-03 · «activate» non e uno stato, ed e proprio per questo che si riconosce", () => {
  // Il valore che l'azione di massa ha davvero scritto in archivio.
  assert.equal(normalizeAthleteStatus("activate"), "active");
  assert.equal(normalizeAthleteStatus("deactivate"), "inactive");

  // `parse` distingue: e una grafia nota, non uno stato canonico.
  assert.equal(parseAthleteStatus("activate"), "active");
  assert.equal(isAthleteStatus("activate"), false);
});

test("W6-03 · le azioni di massa hanno un vocabolario proprio, e la traduzione e esplicita", () => {
  assert.deepEqual(ATHLETE_BULK_STATUS_ACTIONS, {
    activate: "active",
    suspend: "suspended",
    loan: "loan",
    deactivate: "inactive",
  });

  for (const [azione, stato] of Object.entries(ATHLETE_BULK_STATUS_ACTIONS)) {
    assert.ok(
      isAthleteStatus(stato),
      `l'azione ${azione} deve tradursi in uno stato vero`,
    );
  }

  /*
    Il presidio che chiude la classe: nessun nome di azione puo essere anche uno
    stato, altrimenti scriverlo tale e quale tornerebbe a sembrare corretto.
    L'unica eccezione e `loan`, dove azione e stato coincidono davvero.
  */
  for (const azione of Object.keys(ATHLETE_BULK_STATUS_ACTIONS)) {
    if (azione === "loan") continue;
    assert.equal(
      isAthleteStatus(azione),
      false,
      `il nome di azione "${azione}" non deve essere anche uno stato`,
    );
  }
});

test("in lettura non si rifiuta mai: un valore sconosciuto non fa sparire un atleta", () => {
  for (const rumore of [null, undefined, "", "   ", "boh", "42", {}, []]) {
    assert.equal(normalizeAthleteStatus(rumore), DEFAULT_ATHLETE_STATUS);
  }

  // Le grafie che l'archivio contiene davvero.
  assert.equal(normalizeAthleteStatus("ACTIVE"), "active");
  assert.equal(normalizeAthleteStatus("  Sospeso "), "suspended");
  assert.equal(normalizeAthleteStatus("In Prestito"), "loan");
  assert.equal(normalizeAthleteStatus("in  prestito"), "loan");
  assert.equal(normalizeAthleteStatus("Disattivato"), "inactive");
});

test("il filtro di un elenco ripiega su «tutti», che non nasconde niente", () => {
  assert.equal(normalizeAthleteStatusFilter("all"), "all");
  assert.equal(normalizeAthleteStatusFilter(""), "all");
  assert.equal(normalizeAthleteStatusFilter("qualcosa"), "all");
  assert.equal(normalizeAthleteStatusFilter("prestito"), "loan");

  /*
    La differenza con `normalizeAthleteStatus` e voluta: un valore di riga
    sconosciuto diventa `active` (l'atleta resta visibile), un filtro
    sconosciuto diventa `all` (non nasconde nessuno). In entrambi i casi il
    ripiego e quello che mostra di piu.
  */
});

test("la query cerca tutte le grafie di uno stato, non solo quella canonica", () => {
  const perAttivo = athleteStatusQueryValues("active");
  assert.ok(perAttivo.includes("active"));
  assert.ok(
    perAttivo.includes("activate"),
    "senza questa grafia le righe gia scritte resterebbero invisibili",
  );

  // Nessuna grafia puo valere per due stati: sarebbe un elenco ambiguo.
  const viste = new Map();
  for (const stato of ATHLETE_STATUSES) {
    for (const grafia of athleteStatusQueryValues(stato)) {
      assert.equal(
        viste.has(grafia),
        false,
        `la grafia "${grafia}" vale sia per ${viste.get(grafia)} sia per ${stato}`,
      );
      viste.set(grafia, stato);
    }
  }
});

test("la migrazione dei dati copre ogni grafia che il vocabolario riconosce", () => {
  /*
    Il presidio che tiene insieme codice e archivio. Se qualcuno aggiunge una
    grafia al vocabolario e non alla migrazione, le righe gia scritte con quella
    grafia continuerebbero a essere trovate solo per via del filtro `IN` — che
    funziona, ma lascia in archivio un valore che il resto del prodotto non si
    aspetta.
  */
  const sql = readFileSync(
    "prisma/migrations/20260901160000_wave6_stato_atleta/migration.sql",
    "utf8",
  ).toLowerCase();

  for (const stato of ATHLETE_STATUSES) {
    for (const grafia of athleteStatusQueryValues(stato)) {
      assert.ok(
        sql.includes(`'${grafia}'`),
        `la grafia "${grafia}" (${stato}) non compare nella migrazione`,
      );
    }
  }
});

test("il vocabolario e puro: nessuna schermata e nessun server dentro", () => {
  /*
    Non e una preferenza di stile: e la proprieta che permette al browser e al
    server di dare lo stesso significato allo stesso valore. Un import di
    Prisma qui renderebbe il modulo non caricabile da un componente client, e
    la pagina Atleti tornerebbe a tenere una copia propria del vocabolario —
    che e esattamente il difetto da cui la Wave 6 e partita.
  */
  const sorgente = readFileSync("src/lib/athletes/status.ts", "utf8");

  for (const riga of sorgente.split(String.fromCharCode(10))) {
    const importa = /^[ ]*import[ ]/.test(riga);
    const richiede = riga.includes("require(");
    assert.equal(
      importa || richiede,
      false,
      `il vocabolario non importa niente, e questa riga lo fa: ${riga.trim()}`,
    );
  }
});
