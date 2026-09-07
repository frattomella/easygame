/**
 * **Cambiare la sede di una categoria: si fa vedere, non si fa di nascosto**
 * (P0-8).
 *
 * ---
 *
 * ## La decisione
 *
 * Il cambio **non sposta** gli atleti e **non si rifiuta**. L'assegnazione di
 * un atleta a una squadra in una sede e un'entita sua: non e un attributo
 * della categoria, e non la segue quando questa si muove.
 *
 * Le tre risposte piu comode erano tutte sbagliate — spostarli fa diventare
 * un atleta di Scauri un atleta di Formia senza dirglielo; rifiutare il cambio
 * blocca una configurazione legittima; lasciar correre in silenzio e il
 * difetto di partenza, dove quegli atleti uscivano da appello, convocazioni e
 * avvisi e nessuno lo sapeva.
 *
 * Resta la quarta: **si conta e si dice**, prima della conferma, e il
 * riallineamento e un gesto esplicito di chi salva.
 *
 * ## Cosa misurano queste prove
 *
 * Il rilevamento — chi e incoerente e chi no — e i suoi confini, che sono la
 * parte in cui e facile sbagliare in tutti e due i versi.
 */

import test from "node:test";
import assert from "node:assert/strict";

const sedi = await import("../../src/lib/club-sites.ts");

const SCAURI = "sede-scauri";
const FORMIA = "sede-formia";
const GAETA = "sede-gaeta";
const CAT = "cat-under15";
const ALTRA = "cat-under17";

const SEDI = [
  { id: SCAURI, name: "Scauri", active: true },
  { id: FORMIA, name: "Formia", active: true },
  { id: GAETA, name: "Gaeta", active: true },
];

const atleta = (id, memberships) => ({ id, category_memberships: memberships });

const rileva = (siteIds, athletes) =>
  sedi.rilevaDisallineamentiDiSede({
    categoryId: CAT,
    siteIds,
    athletes,
    sites: SEDI,
  });

/* ==================================================================== *
 *  1. Chi resta indietro
 * ==================================================================== */

test("A -> B: gli atleti della sede tolta risultano disallineati", () => {
  const squadra = [
    atleta("a1", [{ category_id: CAT, site_id: SCAURI }]),
    atleta("a2", [{ category_id: CAT, site_id: SCAURI }]),
  ];

  const esito = rileva([FORMIA], squadra);

  assert.equal(esito.length, 1);
  assert.equal(esito[0].siteId, SCAURI);
  assert.equal(esito[0].siteName, "Scauri");
  assert.deepEqual(esito[0].athleteIds.sort(), ["a1", "a2"]);
  assert.equal(sedi.contaAtletiDisallineati(esito), 2);
});

test("A+B -> B: resta indietro solo chi era sulla sede tolta", () => {
  const squadra = [
    atleta("a1", [{ category_id: CAT, site_id: SCAURI }]),
    atleta("a2", [{ category_id: CAT, site_id: FORMIA }]),
  ];

  const esito = rileva([FORMIA], squadra);

  assert.deepEqual(
    esito.map((voce) => voce.siteId),
    [SCAURI],
  );
  assert.deepEqual(esito[0].athleteIds, ["a1"]);
});

test("due sedi tolte producono due voci, ordinate per nome", () => {
  const squadra = [
    atleta("a1", [{ category_id: CAT, site_id: SCAURI }]),
    atleta("a2", [{ category_id: CAT, site_id: GAETA }]),
  ];

  const esito = rileva([FORMIA], squadra);

  assert.deepEqual(
    esito.map((voce) => voce.siteName),
    ["Gaeta", "Scauri"],
    "l'ordine e quello che una segreteria legge, non quello dell'archivio",
  );
});

test("un atleta si conta una volta sola, anche fra piu sedi", () => {
  /*
    **Un limite del modello, misurato invece che scoperto.**

    Due atleti diversi sulle due sedi tolte danno due voci e due persone. Un
    **solo** atleta che stia nella stessa categoria su due sedi — succede con
    i prestiti fra squadre della stessa societa — collassa invece a una
    appartenenza sola: `dedupeMemberships` tiene una riga per categoria, non
    per coppia (categoria, sede).

    Quel limite non e di questa funzione ed e sbagliato correggerlo qui: il
    rilevamento passa dalla primitiva canonica delle appartenenze, e leggere
    le righe grezze per conto proprio darebbe **due risposte** alla stessa
    domanda — che e il difetto che questo pacchetto ha appena finito di
    togliere altrove. Registrato come `D-INT-13`.

    Cio che conta per P0-8 regge comunque: la persona compare una volta sola, e
    il numero che l operatore legge non e gonfiato.
  */
  const squadra = [
    atleta("a1", [{ category_id: CAT, site_id: SCAURI }]),
    atleta("a2", [{ category_id: CAT, site_id: GAETA }]),
    atleta("a3", [
      { category_id: CAT, site_id: SCAURI },
      { category_id: CAT, site_id: GAETA },
    ]),
  ];

  const esito = rileva([FORMIA], squadra);

  assert.equal(esito.length, 2, "Scauri e Gaeta");
  assert.equal(
    sedi.contaAtletiDisallineati(esito),
    3,
    "tre persone, ognuna contata una volta",
  );
});

/* ==================================================================== *
 *  2. Chi non e disallineato, ed e la meta che conta
 * ==================================================================== */

test("chi resta su una sede ancora servita non e disallineato", () => {
  const squadra = [atleta("a1", [{ category_id: CAT, site_id: FORMIA }])];
  assert.deepEqual(rileva([FORMIA, GAETA], squadra), []);
});

test("un'appartenenza senza sede non e disallineata", () => {
  /*
    **Il controspecchio piu importante.** E il caso di ogni club mono-sede e
    di ogni dato precedente alle sedi: contarli sarebbe dire a una societa che
    ha duecento atleti «incoerenti» il giorno in cui apre la seconda palestra.
  */
  const squadra = [
    atleta("a1", [{ category_id: CAT, site_id: null }]),
    atleta("a2", [{ category_id: CAT }]),
  ];

  assert.deepEqual(rileva([FORMIA], squadra), []);
});

test("un'appartenenza a un'altra categoria non c'entra", () => {
  const squadra = [atleta("a1", [{ category_id: ALTRA, site_id: SCAURI }])];
  assert.deepEqual(rileva([FORMIA], squadra), []);
});

test("togliere tutte le sedi disallinea chi ne aveva una", () => {
  const squadra = [
    atleta("a1", [{ category_id: CAT, site_id: SCAURI }]),
    atleta("a2", [{ category_id: CAT, site_id: null }]),
  ];

  const esito = rileva([], squadra);

  assert.equal(sedi.contaAtletiDisallineati(esito), 1, "solo chi aveva una sede");
});

test("e se non cambia niente, non c'e niente da dire", () => {
  const squadra = [
    atleta("a1", [{ category_id: CAT, site_id: SCAURI }]),
    atleta("a2", [{ category_id: CAT, site_id: FORMIA }]),
  ];

  assert.deepEqual(rileva([SCAURI, FORMIA], squadra), []);
});

/* ==================================================================== *
 *  3. Il rilevamento non e una migrazione
 * ==================================================================== */

test("rilevare non modifica gli atleti", () => {
  /*
    La funzione **legge**. Se un giorno qualcuno le facesse spostare qualcosa,
    la decisione di P0-8 sarebbe stata cambiata di nascosto: e la ragione per
    cui questa prova esiste anche se sembra ovvia.
  */
  const squadra = [atleta("a1", [{ category_id: CAT, site_id: SCAURI }])];
  const prima = JSON.stringify(squadra);

  rileva([FORMIA], squadra);

  assert.equal(JSON.stringify(squadra), prima);
});
