import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCRUAL_ZERO,
  DASHBOARD_KPIS,
  MANAGEMENT_REPORT_DISCLAIMER,
  MANAGEMENT_REPORT_TITLE,
  PAROLE_VIETATE,
  assertNoOfficialClaim,
  buildManagementReport,
  compareCashPeriods,
  filterLinesForReport,
  groupByActivityScope,
  groupByMonth,
  groupByOperationType,
  groupByReportingBucket,
  groupFlowsByAccount,
  kpisByQuantity,
  normalizeReportingFilters,
  summarizeCash,
} from "../../src/lib/accounting/reporting.ts";
import {
  ACTIVITY_SCOPE_LABELS,
  FINANCIAL_ACCOUNT_KIND_LABELS,
  RECONCILIATION_STATUS_LABELS,
  SOURCE_DOMAIN_LABELS,
} from "../../src/lib/accounting/model.ts";

/**
 * **W4-D — il riepilogo gestionale.**
 *
 * Le cose che questi test difendono sono cinque, e nessuna e cosmetica:
 *
 * 1. **incassato e crediti non si sommano mai.** E il difetto D-2, e il modo di
 *    non ripeterlo e non offrire il campo che lo produce;
 * 2. **un giroconto non e ne un'entrata ne un'uscita**, e si spiega lo stesso:
 *    sul singolo conto il denaro si e mosso davvero;
 * 3. **le righe non classificate si dichiarano.** Un club che vede solo
 *    istituzionale e commerciale crede di avere un rendiconto;
 * 4. **anno fiscale e stagione sono due assi**, e la stessa societa risponde
 *    numeri diversi alle due domande;
 * 5. **il filtro senza anno non risponde elenco vuoto.** `Number(null)` vale
 *    `0` ed e un intero: il difetto trovato a runtime con duemila test verdi.
 */

const CLUB = "club-riepilogo";

const riga = (over = {}) => ({
  id: `riga-${Math.random().toString(16).slice(2)}`,
  organizationId: CLUB,
  entryDate: "2026-09-15T10:00:00.000Z",
  fiscalYear: 2026,
  seasonId: "s-2026-27",
  direction: "IN",
  amountCents: 10_000,
  currency: "EUR",
  financialAccountId: "conto-cassa",
  financialAccountName: "Cassa",
  operationTypeCode: "quota_attivita",
  operationTypeLabel: "Quota attivita",
  activityScope: "institutional",
  description: "Quota",
  sourceDomain: "MANUAL",
  reconciliationStatus: "unreconciled",
  siteId: null,
  reversedAt: null,
  reversalOfId: null,
  canEdit: false,
  canDelete: false,
  canReverse: false,
  canReconcile: false,
  ...over,
});

/* ================================= 1. cassa e competenza non si sommano === */

test("incassato e crediti restano in due campi distinti, e nessun campo li somma", () => {
  const report = buildManagementReport({
    lines: [riga({ amountCents: 100_00 })],
    accrual: { ...ACCRUAL_ZERO, familyReceivablesCents: 500_00 },
  });

  assert.equal(report.cash.collectedCents, 100_00);
  assert.equal(report.accrual.familyReceivablesCents, 500_00);

  /*
    La prova non e «i due numeri sono giusti» — lo sarebbero anche accanto a un
    totale sbagliato. E che **il totale non esiste**: nessun numero del
    riepilogo vale 600,00, e nessuna chiave si chiama `total`.
  */
  const somma = 600_00;
  const numeri = [];
  const raccogli = (valore) => {
    if (typeof valore === "number") numeri.push(valore);
    else if (valore && typeof valore === "object") {
      for (const interno of Object.values(valore)) raccogli(interno);
    }
  };
  raccogli(report);

  assert.ok(
    !numeri.includes(somma),
    "esiste un numero che somma cassa e crediti: e il difetto D-2",
  );
  assert.ok(!("total" in report), "il riepilogo non deve avere un totale unico");
});

test("i crediti non entrano in nessun raggruppamento delle righe", () => {
  const report = buildManagementReport({
    lines: [riga({ amountCents: 100_00 })],
    accrual: { ...ACCRUAL_ZERO, familyReceivablesCents: 900_00 },
  });

  const totaleGruppi = report.breakdown.byOperationType.reduce(
    (somma, gruppo) => somma + gruppo.inCents,
    0,
  );
  assert.equal(totaleGruppi, 100_00);
});

test("il confronto fra periodi tocca solo grandezze omogenee", () => {
  const corrente = summarizeCash([riga({ amountCents: 300_00 })]);
  const precedente = summarizeCash([riga({ amountCents: 200_00 })]);
  const confronto = compareCashPeriods(corrente, precedente);

  assert.deepEqual(Object.keys(confronto), ["collected", "paid", "net"]);
  assert.equal(confronto.collected.deltaCents, 100_00);
  assert.equal(confronto.collected.share, 0.5);
});

test("una variazione su un periodo a zero non e una percentuale: e null", () => {
  const confronto = compareCashPeriods(
    summarizeCash([riga({ amountCents: 100_00 })]),
    summarizeCash([]),
  );
  assert.equal(confronto.collected.share, null);
});

/* ============================================== 2. il giroconto si spiega === */

const giroconto = () => [
  riga({
    id: "g-out",
    direction: "OUT",
    amountCents: 250_00,
    sourceDomain: "INTERNAL_TRANSFER",
    operationTypeCode: null,
    operationTypeLabel: null,
    activityScope: "unspecified",
    financialAccountId: "conto-cassa",
    financialAccountName: "Cassa",
    transferGroupId: "gruppo-1",
  }),
  riga({
    id: "g-in",
    direction: "IN",
    amountCents: 250_00,
    sourceDomain: "INTERNAL_TRANSFER",
    operationTypeCode: null,
    operationTypeLabel: null,
    activityScope: "unspecified",
    financialAccountId: "conto-banca",
    financialAccountName: "Banca",
    transferGroupId: "gruppo-1",
  }),
];

test("un giroconto non produce ne entrata ne uscita nel rendiconto economico", () => {
  const cassa = summarizeCash(giroconto());

  assert.equal(cassa.collectedCents, 0);
  assert.equal(cassa.paidCents, 0);
  assert.equal(cassa.netCents, 0, "la liquidita totale non cambia");
  assert.equal(cassa.transferInCents, 250_00);
  assert.equal(cassa.transferOutCents, 250_00);
  assert.equal(cassa.transferCount, 2);
});

test("il giroconto resta fuori dalle causali e dentro il flusso dei conti", () => {
  const righe = giroconto();

  assert.deepEqual(
    groupByOperationType(righe),
    [],
    "un giroconto non ha causale: non deve comparire in una voce di rendiconto",
  );

  const perConto = groupFlowsByAccount(righe);
  const cassa = perConto.find((gruppo) => gruppo.key === "conto-cassa");
  const banca = perConto.find((gruppo) => gruppo.key === "conto-banca");

  assert.equal(cassa.outCents, 250_00, "dalla cassa il denaro e uscito davvero");
  assert.equal(banca.inCents, 250_00, "in banca il denaro e arrivato davvero");
});

test("un giroconto non sposta l'incassato quando convive con un incasso vero", () => {
  const cassa = summarizeCash([riga({ amountCents: 80_00 }), ...giroconto()]);
  assert.equal(cassa.collectedCents, 80_00);
  assert.equal(cassa.paidCents, 0);
});

/* ===================================== 3. il non classificato si dichiara === */

test("il conteggio delle righe non classificate e esposto, non nascosto", () => {
  const ripartizione = groupByActivityScope([
    riga({ activityScope: "institutional", amountCents: 124_00 }),
    riga({ activityScope: "commercial", amountCents: 31_00 }),
    riga({ activityScope: "unspecified", amountCents: 227_00 }),
    riga({ activityScope: "unspecified", amountCents: 1_00 }),
  ]);

  assert.equal(ripartizione.unspecifiedLineCount, 2);
  assert.equal(ripartizione.unspecifiedInCents, 228_00);
  assert.equal(ripartizione.classifiedLineCount, 2);
  assert.equal(ripartizione.hasUnclassified, true);

  /*
    **La quota si misura in denaro, non in righe.**

    Le due meta sono due righe su quattro e 228,00 euro su 383,00: contarle
    sulle righe dice 50%, contarle sul denaro dice 59,5%. Su una stagione vera
    lo scarto era molto peggio — 3,1% dichiarato contro il 67% delle uscite
    davvero non attribuito — perche quelle uscite erano poche righe grosse.
  */
  assert.equal(ripartizione.unspecifiedLineShare, 0.5);
  assert.equal(
    Math.round(ripartizione.unspecifiedShare * 1000) / 1000,
    0.595,
    "quanto **denaro** non e attribuito, che e la domanda vera",
  );
});

test("i tre scope ci sono sempre, anche a zero, e sempre nello stesso ordine", () => {
  const ripartizione = groupByActivityScope([
    riga({ activityScope: "institutional" }),
  ]);

  assert.deepEqual(
    ripartizione.groups.map((gruppo) => gruppo.scope),
    ["institutional", "commercial", "unspecified"],
  );
  assert.equal(ripartizione.hasUnclassified, false);
  assert.equal(
    ripartizione.groups[2].lineCount,
    0,
    "«non classificato» non sparisce dall'elenco solo perche vale zero",
  );
});

test("il riepilogo completo porta la ripartizione con il non classificato", () => {
  const report = buildManagementReport({
    lines: [
      riga({ activityScope: "institutional", amountCents: 100_00 }),
      riga({ activityScope: "unspecified", amountCents: 900_00 }),
    ],
  });

  assert.equal(report.breakdown.byActivityScope.unspecifiedLineCount, 1);
  assert.equal(report.breakdown.byActivityScope.unspecifiedInCents, 900_00);
});

/* ================================ 4. anno fiscale e stagione, due domande === */

const scenarioDueAssi = () => [
  riga({
    id: "settembre-2026",
    entryDate: "2026-09-15T10:00:00.000Z",
    fiscalYear: 2026,
    seasonId: "s-2026-27",
    amountCents: 500_00,
  }),
  riga({
    id: "gennaio-2027",
    entryDate: "2027-01-20T10:00:00.000Z",
    fiscalYear: 2027,
    seasonId: "s-2026-27",
    amountCents: 300_00,
  }),
];

test("anno fiscale 2026 e stagione 2026/27 danno risultati diversi sugli stessi movimenti", () => {
  const righe = scenarioDueAssi();

  const perAnno = filterLinesForReport(righe, { fiscalYear: 2026 });
  const perStagione = filterLinesForReport(righe, { seasonId: "s-2026-27" });

  assert.equal(perAnno.length, 1);
  assert.equal(summarizeCash(perAnno).collectedCents, 500_00);

  assert.equal(perStagione.length, 2);
  assert.equal(summarizeCash(perStagione).collectedCents, 800_00);

  assert.equal(
    filterLinesForReport(righe, { fiscalYear: 2027 }).length,
    1,
    "il 2027 esiste come anno a se, dentro la stessa stagione",
  );
});

test("i due assi si combinano senza annullarsi", () => {
  const righe = scenarioDueAssi();
  const combinato = filterLinesForReport(righe, {
    fiscalYear: 2027,
    seasonId: "s-2026-27",
  });

  assert.equal(combinato.length, 1);
  assert.equal(combinato[0].id, "gennaio-2027");
});

/* =========================== 5. il filtro senza anno non svuota l'elenco === */

test("nessun anno richiesto significa nessun filtro, non fiscal_year = 0", () => {
  /*
    `searchParams.get()` restituisce `null` quando il parametro manca, e
    `Number(null)` vale `0` ed e un intero. Un filtro scritto a mano
    risponderebbe elenco vuoto a chiunque non chieda un anno.
  */
  assert.equal(normalizeReportingFilters({}).fiscalYear, null);
  assert.equal(normalizeReportingFilters({ fiscalYear: null }).fiscalYear, null);
  assert.equal(normalizeReportingFilters({ fiscalYear: "" }).fiscalYear, null);
  assert.equal(normalizeReportingFilters({ fiscalYear: "  " }).fiscalYear, null);

  const righe = scenarioDueAssi();
  assert.equal(
    filterLinesForReport(righe, normalizeReportingFilters({})).length,
    2,
    "senza anno si vede tutto, non niente",
  );
  assert.equal(
    filterLinesForReport(
      righe,
      normalizeReportingFilters({ fiscalYear: null }),
    ).length,
    2,
  );
});

test("un anno fuori scala non diventa un filtro silenzioso", () => {
  assert.equal(normalizeReportingFilters({ fiscalYear: "0" }).fiscalYear, null);
  assert.equal(normalizeReportingFilters({ fiscalYear: "1999" }).fiscalYear, null);
  assert.equal(normalizeReportingFilters({ fiscalYear: "abc" }).fiscalYear, null);
  assert.equal(normalizeReportingFilters({ fiscalYear: "2026" }).fiscalYear, 2026);
});

/* ================================== le parole che il prodotto non puo dire === */

const contieneParolaVietata = (testo) =>
  PAROLE_VIETATE.some((parola) => String(testo).toLowerCase().includes(parola));

test("nessuna etichetta del riepilogo usa «ufficiale», «conforme» o «a norma»", () => {
  const testi = [
    MANAGEMENT_REPORT_TITLE,
    MANAGEMENT_REPORT_DISCLAIMER,
    ...DASHBOARD_KPIS.flatMap((kpi) => [kpi.label, kpi.definition, kpi.owner]),
    ...Object.values(ACTIVITY_SCOPE_LABELS),
    ...Object.values(SOURCE_DOMAIN_LABELS),
    ...Object.values(FINANCIAL_ACCOUNT_KIND_LABELS),
    ...Object.values(RECONCILIATION_STATUS_LABELS),
    ...groupByOperationType([riga()]).map((gruppo) => gruppo.label),
    ...groupByActivityScope([riga()]).groups.map((gruppo) => gruppo.label),
  ];

  const colpevoli = testi.filter(contieneParolaVietata);
  assert.deepEqual(
    colpevoli,
    [],
    `etichette che rivendicano una validita che nessuno ha dato: ${colpevoli.join(" | ")}`,
  );
});

test("il titolo e «Riepilogo gestionale», e la riga che lo qualifica c'e", () => {
  assert.equal(MANAGEMENT_REPORT_TITLE, "Riepilogo gestionale");
  assert.match(MANAGEMENT_REPORT_DISCLAIMER, /non sostituisce il rendiconto/i);
  assert.match(MANAGEMENT_REPORT_DISCLAIMER, /non e un bilancio/i);
});

test("un'intestazione che rivendica una validita viene rifiutata", () => {
  for (const parola of PAROLE_VIETATE) {
    assert.throws(
      () => assertNoOfficialClaim(`Rendiconto ${parola} 2026`),
      /non e un documento validato/i,
    );
  }
  assert.equal(
    assertNoOfficialClaim("Riepilogo gestionale 2026"),
    "Riepilogo gestionale 2026",
  );
});

test("il rifiuto di un'etichetta non e un errore di permessi", () => {
  assert.throws(
    () => assertNoOfficialClaim("Rendiconto ufficiale"),
    (errore) => {
      assert.ok(
        !String(errore.message).includes("Accesso negato"),
        "un'etichetta sbagliata non deve diventare un 403",
      );
      return true;
    },
  );
});

/* ============================================== gli storni non si contano === */

test("una coppia originale/storno esce dal riepilogo, e il conteggio lo dice", () => {
  const cassa = summarizeCash([
    riga({ amountCents: 100_00 }),
    riga({
      id: "stornata",
      amountCents: 333_00,
      reversedAt: "2026-10-01T00:00:00.000Z",
    }),
    riga({
      id: "storno",
      direction: "OUT",
      amountCents: 333_00,
      sourceDomain: "REVERSAL",
      reversalOfId: "stornata",
    }),
  ]);

  assert.equal(cassa.collectedCents, 100_00);
  assert.equal(cassa.paidCents, 0);
  assert.equal(cassa.lineCount, 1);
  assert.equal(cassa.neutralizedCount, 2, "le righe escluse si dichiarano");
});

/* ===================================================== i raggruppamenti === */

test("il raggruppamento per voce di rendiconto legge la mappa delle causali", () => {
  const gruppi = groupByReportingBucket(
    [
      riga({ operationTypeCode: "quota_attivita", amountCents: 100_00 }),
      riga({ operationTypeCode: "sponsorizzazione", amountCents: 400_00 }),
      riga({ operationTypeCode: "senza_voce", amountCents: 50_00 }),
    ],
    { quota_attivita: "Attivita sportiva", sponsorizzazione: "Attivita sportiva" },
  );

  const attivita = gruppi.find((gruppo) => gruppo.key === "Attivita sportiva");
  assert.equal(attivita.inCents, 500_00);
  assert.equal(attivita.lineCount, 2);

  const senzaVoce = gruppi.find((gruppo) => gruppo.key === "");
  assert.equal(senzaVoce.label, "Senza voce di rendiconto");
  assert.equal(senzaVoce.inCents, 50_00);
});

test("il raggruppamento per mese e cronologico", () => {
  const gruppi = groupByMonth([
    riga({ entryDate: "2027-01-20T00:00:00.000Z", amountCents: 10_00 }),
    riga({ entryDate: "2026-09-15T00:00:00.000Z", amountCents: 20_00 }),
    riga({ entryDate: "2026-11-02T00:00:00.000Z", amountCents: 30_00 }),
  ]);

  assert.deepEqual(
    gruppi.map((gruppo) => gruppo.key),
    ["2026-09", "2026-11", "2027-01"],
  );
});

test("un gruppo porta sempre entrambi i versi, non solo il netto", () => {
  const [gruppo] = groupByOperationType([
    riga({ direction: "IN", amountCents: 1_000_00 }),
    riga({ direction: "OUT", amountCents: 1_000_00 }),
  ]);

  assert.equal(gruppo.inCents, 1_000_00);
  assert.equal(gruppo.outCents, 1_000_00);
  assert.equal(gruppo.netCents, 0);
  assert.equal(gruppo.lineCount, 2);
});

/* ========================================== i riquadri della dashboard === */

test("ogni riquadro dichiara proprietario, grandezza e definizione", () => {
  for (const kpi of DASHBOARD_KPIS) {
    assert.ok(kpi.key, "un riquadro senza chiave non e riferibile");
    assert.ok(kpi.label.length > 2, `${kpi.key} senza etichetta`);
    assert.ok(
      kpi.definition.length > 40,
      `${kpi.key} senza una definizione che spieghi cosa misura`,
    );
    assert.match(
      kpi.owner,
      /^src\/lib\//,
      `${kpi.key} non dichiara il modulo che possiede il numero`,
    );
    assert.ok(
      ["finanziaria", "economica"].includes(kpi.quantity),
      `${kpi.key} non dichiara la sua grandezza`,
    );
  }
});

test("cassa e competenza sono due insiemi separati di riquadri", () => {
  const finanziarie = kpisByQuantity("finanziaria").map((kpi) => kpi.key);
  const economiche = kpisByQuantity("economica").map((kpi) => kpi.key);

  assert.deepEqual(
    finanziarie.filter((chiave) => economiche.includes(chiave)),
    [],
    "nessun riquadro puo stare in entrambe le righe di totali",
  );
  assert.ok(finanziarie.includes("accountBalances"));
  assert.ok(economiche.includes("familyReceivables"));
  assert.equal(
    finanziarie.length + economiche.length,
    DASHBOARD_KPIS.length,
    "ogni riquadro ha una grandezza e una sola",
  );
});

test("«debiti verso fornitori» non esiste, e non lo inventiamo", () => {
  const inventati = DASHBOARD_KPIS.filter((kpi) =>
    /fornitor/i.test(`${kpi.key} ${kpi.label}`),
  );
  assert.deepEqual(
    inventati,
    [],
    "il prodotto non ha un ciclo passivo: un riquadro sempre a zero direbbe che il club non ha debiti",
  );
});

test("il saldo dei conti dichiara che il suo proprietario e financial-accounts", () => {
  const saldo = DASHBOARD_KPIS.find((kpi) => kpi.key === "accountBalances");
  assert.equal(saldo.owner, "src/lib/server/financial-accounts.ts");
  assert.equal(saldo.quantity, "finanziaria");
});

/* ============================ W4-B2: i tre filtri che mancavano */

test("il riepilogo conosce origine, riconciliazione e ricerca", async () => {
  /*
    **Il difetto.** L'elenco della prima nota offriva questi tre filtri e il
    riepilogo no: chi filtrava per «da riconciliare» leggeva un elenco di poche
    righe sotto **totali che coprivano ancora tutto il periodo**. Due numeri
    sulla stessa schermata che parlavano di due insiemi diversi.
  */
  const filtri = normalizeReportingFilters({
    sourceDomain: "manual",
    reconciliationStatus: "UNRECONCILED",
    search: "  Affitto  ",
  });

  assert.equal(filtri.sourceDomain, "MANUAL");
  assert.equal(filtri.reconciliationStatus, "unreconciled");
  /*
    **Il testo si ripulisce, ma non si abbassa qui.**

    Da quando l elenco filtra con `ILIKE`, abbassare prima in JavaScript
    rimetteva in mezzo la differenza fra `toLowerCase()` e `lower()` di
    Postgres: cercando `ΟΔΟΣ` l elenco trovava la riga e il rendiconto no.
    Il confronto in memoria abbassa entrambi i lati al momento del confronto.
  */
  assert.equal(filtri.search, "Affitto", "ripulita una volta sola, non abbassata");
});

test("un valore fuori catalogo non filtra niente invece di filtrare tutto", async () => {
  const filtri = normalizeReportingFilters({
    sourceDomain: "QUALCOSA",
    reconciliationStatus: "forse",
  });

  assert.equal(filtri.sourceDomain, null);
  assert.equal(filtri.reconciliationStatus, null);
});
