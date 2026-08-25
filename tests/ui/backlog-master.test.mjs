import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Blocco 7, punto 18 — la backlog master.
 *
 * Una backlog serve a rispondere a «quella cosa che avevo chiesto, a che punto
 * e?». Smette di servire nel momento in cui il riepilogo non corrisponde alle
 * righe, o una voce dichiara `IN PROGRESS` senza dire cosa manca.
 *
 * Questi test non giudicano il contenuto: verificano che il documento resti
 * verificabile.
 */

const BACKLOG = path.join(process.cwd(), "docs/knowledge-base/21-backlog.md");
const source = readFileSync(BACKLOG, "utf8");
const lines = source.split(/\r?\n/);

const STATES = ["DONE", "IN PROGRESS", "OPEN", "DEFERRED", "SUPERSEDED"];

/** Righe di voce: quelle che cominciano con un identificativo. */
const entryLines = lines.filter((line) =>
  // `B\d+` e non `B[1-7]`: il prefisso di blocco cresce a ogni blocco, e un
  // elenco chiuso avrebbe smesso di contare le voci del Blocco 8 in silenzio.
  // `WB-` e il prefisso dei workstream, che non sono numerati come i blocchi:
  // senza, le loro voci sarebbero finite fuori dal conteggio senza un errore.
  /^\|\s*(B\d+-\d+|WB-\d+|F[1-5]-\d+|P-\d+|S-\d+)\s*\|/.test(line),
);

const statusOf = (line) => {
  const match = /\|\s*`(DONE|IN PROGRESS|OPEN|DEFERRED|SUPERSEDED)`\s*\|/.exec(line);
  return match ? match[1] : null;
};

test("ogni voce ha un identificativo unico", () => {
  const ids = entryLines.map(
    (line) => /^\|\s*([A-Z0-9-]+)\s*\|/.exec(line)[1],
  );

  assert.ok(ids.length > 80, `voci trovate: ${ids.length}`);
  assert.equal(
    new Set(ids).size,
    ids.length,
    "due voci con lo stesso identificativo rendono impossibile citarne una",
  );
});

test("ogni voce ha uno degli stati previsti", () => {
  const senzaStato = entryLines.filter((line) => !statusOf(line));

  assert.deepEqual(
    senzaStato.map((line) => line.slice(0, 50)),
    [],
    "una voce senza stato non risponde alla domanda per cui la backlog esiste",
  );
});

/**
 * Il motivo per cui questo test esiste: un riepilogo scritto a mano invecchia
 * al primo aggiornamento, e un riepilogo sbagliato e peggio di nessun
 * riepilogo — perche viene creduto.
 */
test("il riepilogo corrisponde alle righe", () => {
  const counted = {};
  for (const state of STATES) counted[state] = 0;
  for (const line of entryLines) counted[statusOf(line)] += 1;

  for (const state of STATES) {
    const declared = new RegExp(`\\|\\s*\`${state}\`\\s*\\|\\s*(\\d+)\\s*\\|`).exec(
      source,
    );
    assert.ok(declared, `il riepilogo non dichiara ${state}`);
    assert.equal(
      Number(declared[1]),
      counted[state],
      `${state}: il riepilogo dice ${declared[1]}, le righe sono ${counted[state]}`,
    );
  }

  const total = /\|\s*\*\*Totale\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|/.exec(source);
  assert.ok(total, "manca il totale");
  assert.equal(Number(total[1]), entryLines.length);
});

/**
 * «Chiusa a meta» e lo stato piu utile della backlog e anche il piu facile da
 * rendere inutile: senza dire cosa manca, `IN PROGRESS` non e piu informativo
 * di `OPEN`.
 */
test("ogni voce IN PROGRESS dice cosa manca", () => {
  const senzaSpiegazione = entryLines
    .filter((line) => statusOf(line) === "IN PROGRESS")
    .filter((line) => !/manca|Mancano|restano|Restano|manca[no]?/i.test(line));

  assert.deepEqual(
    senzaSpiegazione.map((line) => line.slice(0, 60)),
    [],
    "IN PROGRESS senza «cosa manca» non e piu informativo di OPEN",
  );
});

/** Una voce differita senza la decisione che la differisce e solo dimenticata. */
test("ogni voce DEFERRED cita la decisione che la sospende", () => {
  const senzaAdr = entryLines
    .filter((line) => statusOf(line) === "DEFERRED")
    .filter((line) => !/ADR-\d+|WP-\d+/.test(line));

  assert.deepEqual(
    senzaAdr.map((line) => line.slice(0, 60)),
    [],
  );
});

/** Idem per «superata»: senza dire da cosa, e una voce cancellata. */
test("ogni voce SUPERSEDED dice cosa l'ha superata", () => {
  const senzaCausa = entryLines
    .filter((line) => statusOf(line) === "SUPERSEDED")
    .filter((line) => !/ADR-\d+|Blocco \d+|WP-\d+/.test(line));

  assert.deepEqual(
    senzaCausa.map((line) => line.slice(0, 60)),
    [],
  );
});

/**
 * Le proposte grandi sono la parte piu facile da perdere: non hanno un WP, non
 * hanno un file, e nessun test le tocca. Se spariscono da qui spariscono.
 */
test("le proposte grandi ci sono tutte", () => {
  for (const proposta of [
    "Multi-sede",
    "Abbigliamento e consegne V2",
    "Modulistica V2",
    "Moduli online",
    "Scanner documenti",
    "Stripe",
    "CediPay",
    "SaaS ed entitlements",
    "Bonus Sport e Salute",
    "AI per gli allenamenti",
    "OAuth Google e Microsoft",
  ]) {
    assert.ok(
      source.includes(proposta),
      `la proposta «${proposta}» non deve sparire dalla backlog`,
    );
  }
});

test("la backlog e raggiungibile dall'indice della KB", () => {
  const readme = readFileSync(
    path.join(process.cwd(), "docs/knowledge-base/README.md"),
    "utf8",
  );

  assert.match(readme, /21-backlog\.md/, "un documento non linkato non si trova");
});

/**
 * «Remaining Web V1 before release» — Blocco 8.
 *
 * E la sezione che risponde alla domanda che viene dopo «a che punto e?»:
 * **cosa manca per rilasciare**. Senza, la backlog dice lo stato di ogni voce
 * e non dice mai quando si e finito. Ogni riga deve puntare alla voce che la
 * spiega, altrimenti torna a essere un elenco di buoni propositi.
 */
test("la sezione «Remaining Web V1 before release» esiste ed e collegata", () => {
  assert.match(
    source,
    /^## Remaining Web V1 before release$/m,
    "senza questa sezione la backlog non dice mai quando si e finito",
  );

  const remainingLines = lines.filter((line) => /^\|\s*R-\d+\s*\|/.test(line));

  assert.ok(
    remainingLines.length >= 5,
    `le voci residue sono ${remainingLines.length}: e un elenco troppo corto per essere onesto`,
  );

  for (const line of remainingLines) {
    const id = /^\|\s*(R-\d+)\s*\|/.exec(line)[1];

    assert.match(
      line,
      /\|\s*[^|]+\|\s*[^|]+\|\s*[^|]+\|/,
      `${id}: servono cosa manca, perche blocca e dove sta`,
    );
    assert.match(
      line,
      /(B\d+-\d+|F[1-5]-\d+|WP-\d+|ADR-\d+)/,
      `${id}: senza un riferimento e un buon proposito, non una voce`,
    );
  }
});
