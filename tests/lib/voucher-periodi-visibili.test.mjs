import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  FUNDING_PERIOD_STATUS_LABELS,
  buildFundingPeriodRows,
} from "../../src/lib/funding/funding-model.ts";

/**
 * **N8 — tutti i periodi del bando si vedono, e ognuno dice a che punto e.**
 *
 * La scheda mostrava le sole righe di **maturato**, e il ricalcolo si ferma a
 * oggi (`until: new Date()`): i mesi futuri del bando non comparivano affatto.
 * Una segreteria che voleva sapere «quanto puo ancora arrivare» non aveva dove
 * leggerlo, e l'unico modo di far comparire un periodo era ricalcolare — cioe
 * aspettare che fosse passato.
 *
 * Il periodo pero **non e una tabella** (ADR-0037 §4): si deriva dalla
 * configurazione. La correzione non e quindi «salvare le righe mancanti» —
 * scriverne a zero per mesi non ancora cominciati vorrebbe dire inventare un
 * dato per far quadrare una schermata — ma **derivare** i periodi e fondere le
 * righe che ci sono.
 */

const programma = (overrides = {}) => ({
  id: "prog-1",
  organization_id: "club-1",
  name: "Voucher Lazio",
  funder_name: "Regione",
  status: "active",
  valid_from: "2026-09-01",
  valid_to: "2026-12-31",
  athlete_plafond: 500,
  period_amount: 60,
  period_frequency: "monthly",
  requirement_unit: "hours",
  requirement_min: 8,
  unmet_behavior: "none",
  accrual_source: "easygame_attendance",
  ...overrides,
});

const maturato = (periodIndex, status, overrides = {}) => ({
  id: `acc-${periodIndex}`,
  period_index: periodIndex,
  period_label: `Periodo ${periodIndex}`,
  period_start: "2026-09-01",
  period_end: "2026-09-30",
  status,
  accrued_amount: 60,
  ...overrides,
});

/* ------------------------------------------------------------------ */
/* Tutti i periodi, non solo quelli calcolati                          */
/* ------------------------------------------------------------------ */

test("un bando di quattro mesi mostra quattro periodi, anche se nessuno e stato calcolato", () => {
  const righe = buildFundingPeriodRows(programma(), []);

  assert.equal(righe.length, 4, "settembre, ottobre, novembre, dicembre");
  assert.ok(
    righe.every((riga) => riga.status === "planned"),
    "senza righe sono tutti previsti",
  );
  assert.ok(
    righe.every((riga) => riga.accrual === null),
    "nessuna riga viene inventata",
  );
});

test("i periodi calcolati portano il proprio stato, gli altri restano previsti", () => {
  const righe = buildFundingPeriodRows(programma(), [
    maturato(0, "accrued"),
    maturato(1, "not_accrued", { accrued_amount: 0 }),
  ]);

  assert.equal(righe.length, 4);
  assert.equal(righe[0].status, "accrued");
  assert.equal(righe[1].status, "not_accrued");
  assert.equal(righe[2].status, "planned");
  assert.equal(righe[3].status, "planned");
});

test("«previsto» e «non maturato» sono due cose diverse", () => {
  /*
    E la distinzione che rende utile lo stato nuovo. «Non maturato» dice che
    l'atleta non ha frequentato abbastanza; «previsto» dice che **nessuno ha
    ancora guardato**. Confonderli e il modo in cui si rendiconta all'ente un
    mese che nessuno ha verificato.
  */
  assert.equal(FUNDING_PERIOD_STATUS_LABELS.planned, "Previsto");
  assert.equal(FUNDING_PERIOD_STATUS_LABELS.not_accrued, "Non maturato");
  assert.notEqual(
    FUNDING_PERIOD_STATUS_LABELS.planned,
    FUNDING_PERIOD_STATUS_LABELS.not_accrued,
  );
});

test("ogni stato del dominio ha la sua etichetta, e nessuna manca", () => {
  for (const stato of [
    "planned",
    "not_accrued",
    "pending_confirmation",
    "accrued",
    "reported",
    "settled",
  ]) {
    assert.ok(
      FUNDING_PERIOD_STATUS_LABELS[stato],
      `«${stato}» deve avere un'etichetta: uno stato senza nome a schermo e uno stato che non si vede`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* Le righe orfane non si buttano                                      */
/* ------------------------------------------------------------------ */

test("una riga il cui periodo la configurazione non genera piu resta visibile", () => {
  /*
    Le date del bando accorciate dopo un ricalcolo lasciano righe fuori
    dall'intervallo. Buttarle vorrebbe dire far sparire un importo che forse e
    stato **rendicontato** all'ente.
  */
  const righe = buildFundingPeriodRows(programma({ valid_to: "2026-10-31" }), [
    maturato(0, "accrued"),
    maturato(5, "reported", { period_label: "Febbraio (fuori periodo)" }),
  ]);

  const orfana = righe.find((riga) => riga.periodIndex === 5);
  assert.ok(orfana, "la riga fuori intervallo non sparisce");
  assert.equal(orfana.status, "reported");
  assert.equal(orfana.label, "Febbraio (fuori periodo)");
});

test("i periodi escono in ordine", () => {
  const righe = buildFundingPeriodRows(programma(), [
    maturato(2, "accrued"),
    maturato(0, "accrued"),
  ]);

  const indici = righe.map((riga) => riga.periodIndex);
  assert.deepEqual(indici, [...indici].sort((a, b) => a - b));
});

/* ------------------------------------------------------------------ */
/* La maturazione resta un atto, non un effetto                        */
/* ------------------------------------------------------------------ */

test("nessun periodo diventa maturato per il solo fatto di essere elencato", () => {
  const righe = buildFundingPeriodRows(programma(), []);

  assert.equal(
    righe.filter((riga) => riga.status === "accrued").length,
    0,
    "elencare non e maturare: la maturazione resta un atto esplicito",
  );
});

test("il dominio non ha imparato a maturare da solo", () => {
  /*
    Il mandato lo chiede espressamente: «la maturazione NON deve diventare
    automaticamente un fatto economico». `recomputeEnrollmentAccruals` ha un
    solo chiamante — la rotta — e nessun cron.
  */
  const catalogo = readFileSync("src/lib/automations/catalog.ts", "utf8");
  assert.match(
    catalogo,
    /request-driven/,
    "voucher e presenze restano request-driven per scelta motivata",
  );

  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  const cron = JSON.stringify(vercel.crons || []);
  assert.doesNotMatch(
    cron,
    /funding|accrual/i,
    "nessun cron tocca i contributi: una maturazione silenziosa e un credito verso un ente che nessuno ha verificato",
  );
});

/* ------------------------------------------------------------------ */
/* La schermata li mostra davvero                                      */
/* ------------------------------------------------------------------ */

test("la tabella dei periodi riceve i periodi, non le sole righe di maturato", () => {
  const tabella = readFileSync(
    "src/components/funding/FundingPeriodsTable.tsx",
    "utf8",
  );

  assert.match(tabella, /periods\?:/, "il componente accetta i periodi");
  assert.match(
    tabella,
    /planned: \{/,
    "e sa disegnare lo stato di un periodo mai calcolato",
  );
  assert.match(tabella, /PREVISTO/);

  const scheda = readFileSync(
    "src/components/funding/AthleteFundingSummary.tsx",
    "utf8",
  );
  /*
    **La proiezione ha un tipo, e il cast e sparito** (N10/N14): `periods` non e
    piu una proprieta clandestina letta con `as any`, e `FundingPeriodRow` porta
    anche misura e requisito gia risolti. Cio che questo test difende resta cio
    che difendeva: il chiamante glieli passa davvero.
  */
  assert.match(
    scheda,
    /const periods = \(overview\.periods \|\| \[\]\)/,
    "i periodi arrivano dalla proiezione del server",
  );
  assert.match(
    scheda,
    /periods=\{periods\}/,
    "un componente che sa mostrarli e un chiamante che non glieli passa e codice irraggiungibile",
  );
});

test("il server manda i periodi insieme al riepilogo", () => {
  const servizio = readFileSync("src/lib/server/funding.ts", "utf8");

  assert.match(servizio, /periods: buildFundingPeriodRows\(program, accrualiConLiquidato\)/);
  assert.match(
    servizio,
    /periods: ReturnType<typeof buildFundingPeriodRows>;/,
    "il tipo lo dichiara, cosi chi legge la rotta lo sa",
  );
});
