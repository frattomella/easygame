import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **W4-D — il riepilogo gestionale, dal database alla risposta.**
 *
 * Il modulo puro e provato altrove (`tests/lib/accounting-reporting.test.mjs`).
 * Qui si prova cio che solo il servizio puo sbagliare:
 *
 * 1. **i numeri arrivano dai loro proprietari.** Crediti dal ledger delle rate,
 *    contributi attesi dai bandi, compensi dal lavoro sportivo. Nessuno di essi
 *    viene ricalcolato qui, e il test lo verifica sui valori;
 * 2. **cassa e competenza restano separate** anche dopo essere passate per il
 *    database;
 * 3. **anno fiscale e stagione** rispondono numeri diversi sugli stessi
 *    movimenti — settembre 2026 e gennaio 2027, stagione 2026/27;
 * 4. **il filtro senza anno non risponde elenco vuoto.** `Number(null)` vale
 *    `0`: e il difetto che ha attraversato duemila test verdi;
 * 5. **i permessi e il confine multi-tenant.** L'allenatore non vede il
 *    riepilogo; la segreteria lo vede senza i saldi, e riceve `null` — non zero;
 *    il club di un altro non si legge.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-00000000d001";
const ALTRO = "bbbbbbbb-0000-4000-8000-00000000d002";
const CASSA = "cccccccc-0000-4000-8000-00000000d0c1";
const BANCA = "cccccccc-0000-4000-8000-00000000d0c2";
const STAGIONE = "s-2026-27";
const UTENTE = "11111111-0000-4000-8000-00000000daaa";

/** Fissa: i crediti scaduti dipendono da «oggi», e un test non puo dipenderne. */
const ADESSO = new Date("2027-02-01T00:00:00.000Z");

const scope = (organizationId, role, userId = UTENTE) => ({
  userId,
  activeOrganizationId: organizationId,
  activeRole: role,
  allowedOrganizationIds: [organizationId],
});

const owner = () => scope(CLUB, "owner");
const segreteria = () => scope(CLUB, "collaborator");
const allenatore = () => scope(CLUB, "trainer");
const ownerAltrui = () => scope(ALTRO, "owner", "22222222-0000-4000-8000-00000000dbbb");

let service;
let setPrismaClientForTests;
let fake;

const movimento = (id, over = {}) => ({
  id,
  organization_id: CLUB,
  entry_date: new Date("2026-09-15T10:00:00.000Z"),
  fiscal_year: 2026,
  season_id: STAGIONE,
  direction: "IN",
  amount_cents: 100_000,
  currency: "EUR",
  financial_account_id: CASSA,
  operation_type_code: "quota_attivita",
  operation_type_label_snapshot: "Quota attivita",
  activity_scope_snapshot: "institutional",
  description: "Quota di settembre",
  source_domain: "MANUAL",
  transfer_group_id: null,
  reversal_of_id: null,
  reversed_at: null,
  reconciliation_status: "unreconciled",
  site_id: null,
  created_at: new Date("2026-09-15T10:00:00.000Z"),
  ...over,
});

const seed = () => ({
  club: [
    { id: CLUB, slug: "club-a", name: "Club A", transactions: [], transfers: [] },
    { id: ALTRO, slug: "club-b", name: "Club B", transactions: [], transfers: [] },
  ],

  financialAccount: [
    {
      id: CASSA,
      organization_id: CLUB,
      name: "Cassa",
      kind: "CASH",
      is_archived: false,
      opening_balance_cents: 50_000,
      opening_balance_at: new Date("2026-07-01T00:00:00.000Z"),
    },
    {
      id: BANCA,
      organization_id: CLUB,
      name: "Banca",
      kind: "BANK",
      is_archived: false,
      opening_balance_cents: 0,
      opening_balance_at: null,
    },
  ],

  fiscalOperationType: [
    {
      id: "ft-quota",
      organization_id: CLUB,
      code: "quota_attivita",
      label: "Quota attivita",
      activity_scope: "institutional",
      reporting_bucket: "Attivita sportiva",
      is_active: true,
      is_system: true,
    },
    {
      id: "ft-affitto",
      organization_id: CLUB,
      code: "affitto_impianto",
      label: "Affitto impianto",
      activity_scope: "unspecified",
      reporting_bucket: null,
      is_active: true,
      is_system: true,
    },
  ],

  accountingEntry: [
    /* Settembre 2026: dentro l'anno fiscale 2026 e dentro la stagione 2026/27. */
    movimento("m-settembre"),
    /* Gennaio 2027: **stessa stagione**, altro anno fiscale. */
    movimento("m-gennaio", {
      entry_date: new Date("2027-01-20T10:00:00.000Z"),
      fiscal_year: 2027,
      direction: "OUT",
      amount_cents: 30_000,
      financial_account_id: BANCA,
      operation_type_code: "affitto_impianto",
      operation_type_label_snapshot: "Affitto impianto",
      activity_scope_snapshot: "unspecified",
      description: "Affitto di gennaio",
    }),
    /* Le due gambe di un giroconto: la liquidita totale non cambia. */
    movimento("m-giro-out", {
      entry_date: new Date("2026-09-20T10:00:00.000Z"),
      direction: "OUT",
      amount_cents: 25_000,
      financial_account_id: CASSA,
      source_domain: "INTERNAL_TRANSFER",
      transfer_group_id: "gruppo-1",
      operation_type_code: null,
      operation_type_label_snapshot: null,
      activity_scope_snapshot: "unspecified",
      description: "Versamento in banca",
    }),
    movimento("m-giro-in", {
      entry_date: new Date("2026-09-20T10:00:00.000Z"),
      direction: "IN",
      amount_cents: 25_000,
      financial_account_id: BANCA,
      source_domain: "INTERNAL_TRANSFER",
      transfer_group_id: "gruppo-1",
      operation_type_code: null,
      operation_type_label_snapshot: null,
      activity_scope_snapshot: "unspecified",
      description: "Versamento in banca",
    }),
    /* Un movimento di un altro club: non deve comparire da nessuna parte. */
    movimento("m-altrui", {
      organization_id: ALTRO,
      amount_cents: 999_999,
      financial_account_id: null,
    }),
  ],

  /* Una rata da 300 incassata per 200: residuo 100, e scaduta al 2027-02-01. */
  athletePayment: [
    {
      id: "rata-1",
      organization_id: CLUB,
      athlete_id: "atleta-1",
      description: "Quota annuale",
      amount: 300,
      due_date: new Date("2026-09-30T00:00:00.000Z"),
      paid_at: null,
      status: "pending",
      data: {},
    },
  ],
  paymentTransaction: [
    {
      id: "incasso-1",
      organization_id: CLUB,
      athlete_id: "atleta-1",
      payment_id: "rata-1",
      amount: 200,
      paid_at: new Date("2026-09-10T00:00:00.000Z"),
      payment_method: "cash",
      financial_account_id: CASSA,
      operation_type_code: "quota_attivita",
      reversed_at: null,
      reverses_transaction_id: null,
    },
  ],

  /* Un bando: maturati 500, liquidati 200. Attesi: 300. */
  fundingAccrual: [
    {
      id: "acc-1",
      organization_id: CLUB,
      enrollment_id: "iscr-1",
      period_index: 1,
      accrued_amount: 500,
      unaccrued_amount: 0,
      estimated_amount: 0,
      status: "accrued",
    },
  ],
  fundingSettlementLine: [
    {
      id: "riga-liq-1",
      organization_id: CLUB,
      settlement_id: "liq-1",
      accrual_id: "acc-1",
      amount: 200,
    },
  ],
  fundingSettlement: [],

  /* Lavoro sportivo: maturati 800, pagati 300. Debito: 500. */
  sportWorkInstallment: [
    {
      id: "scadenza-1",
      organization_id: CLUB,
      plan_id: "piano-1",
      relationship_id: "rapporto-1",
      gross_amount: 1000,
      accrued_amount: 800,
      paid_amount: 300,
      status: "PARTIALLY_PAID",
      cancelled: false,
    },
  ],
  sportWorkOutboundTransaction: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  service = await import("../../src/lib/server/accounting-reports.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const riepilogo = (input = {}, chi = owner()) =>
  service.buildAccountingReport({ now: ADESSO, ...input }, chi);

const rejects = (promise, pattern) =>
  assert.rejects(promise, (error) => {
    assert.match(String(error.message), pattern);
    return true;
  });

/* ============================================ il nome, e cio che non e === */

test("il riepilogo si chiama «Riepilogo gestionale» e porta con se cio che non e", async () => {
  const report = await riepilogo();

  assert.equal(report.title, "Riepilogo gestionale");
  assert.match(report.disclaimer, /non sostituisce il rendiconto/i);
  for (const parola of ["ufficiale", "conforme", "a norma", "per il deposito"]) {
    assert.ok(
      !report.title.toLowerCase().includes(parola),
      `il titolo rivendica «${parola}»`,
    );
  }
});

/* ================================== cassa e competenza non si sommano === */

test("incassato e crediti arrivano in due campi distinti", async () => {
  const report = await riepilogo();

  /*
    Cassa del club: il movimento manuale di settembre (1.000,00) piu l'incasso
    proiettato dal dominio delle rate (200,00). Le due gambe del giroconto
    restano fuori, e l'uscita di gennaio e un pagamento.
  */
  assert.equal(report.cash.collectedCents, 100_000 + 20_000);
  assert.equal(report.cash.paidCents, 30_000);

  /* Competenza: residuo delle rate, contributi attesi, compensi maturati. */
  assert.equal(report.accrual.familyReceivablesCents, 10_000);
  assert.equal(report.accrual.fundingPendingCents, 30_000);
  assert.equal(report.accrual.sportWorkAccruedUnpaidCents, 50_000);

  assert.equal(report.accrualScope, "club");
  assert.ok(!("total" in report), "non esiste un totale che unisca le due");
});

test("gli insoluti sono un sottoinsieme dei crediti, non una voce che vi si aggiunge", async () => {
  const report = await riepilogo();

  assert.equal(report.accrual.overdueReceivablesCents, 10_000);
  assert.equal(report.accrual.overdueCount, 1);
  assert.ok(
    report.accrual.overdueReceivablesCents <=
      report.accrual.familyReceivablesCents,
    "lo scaduto non puo superare il credito di cui fa parte",
  );
});

test("i crediti non cambiano quando cambia il periodo dei movimenti", async () => {
  const tutto = await riepilogo();
  const soloGennaio = await riepilogo({ fiscalYear: "2027" });

  assert.notEqual(tutto.cash.collectedCents, soloGennaio.cash.collectedCents);
  assert.equal(
    tutto.accrual.familyReceivablesCents,
    soloGennaio.accrual.familyReceivablesCents,
    "un credito aperto e cio che resta dovuto oggi, non cio che e successo in un intervallo",
  );
});

/* ==================================================== il giroconto === */

test("un giroconto non produce ne entrata ne uscita, e si spiega nel flusso dei conti", async () => {
  const report = await riepilogo({ fiscalYear: "2026" });

  assert.equal(report.cash.transferInCents, 25_000);
  assert.equal(report.cash.transferOutCents, 25_000);
  assert.equal(report.cash.transferCount, 2);

  const perCausale = report.breakdown.byOperationType.map((g) => g.key);
  assert.ok(
    !perCausale.includes(""),
    "il giroconto non deve comparire come causale vuota nel rendiconto",
  );

  const cassa = report.breakdown.byAccount.find((g) => g.key === CASSA);
  const banca = report.breakdown.byAccount.find((g) => g.key === BANCA);
  assert.equal(cassa.outCents, 25_000, "dalla cassa il denaro e uscito davvero");
  assert.equal(banca.inCents, 25_000, "in banca il denaro e arrivato davvero");
});

/* ================================= anno fiscale contro stagione (§14) === */

test("anno fiscale 2026 e stagione 2026/27 danno risultati diversi sugli stessi movimenti", async () => {
  const anno2026 = await riepilogo({ fiscalYear: "2026" });
  const anno2027 = await riepilogo({ fiscalYear: "2027" });
  const stagione = await riepilogo({ seasonId: STAGIONE });

  assert.equal(anno2026.cash.collectedCents, 100_000 + 20_000);
  assert.equal(anno2026.cash.paidCents, 0, "l'affitto di gennaio e del 2027");

  assert.equal(anno2027.cash.paidCents, 30_000);
  assert.equal(anno2027.cash.collectedCents, 0);

  const mesiDiStagione = stagione.breakdown.byMonth.map((gruppo) => gruppo.key);
  assert.ok(mesiDiStagione.includes("2026-09"));
  assert.ok(
    mesiDiStagione.includes("2027-01"),
    "la stagione 2026/27 contiene anche gennaio 2027: e la domanda diversa dal §14",
  );
});

test("il filtro senza anno non risponde elenco vuoto", async () => {
  /*
    `Number(null)` vale `0` ed e un intero: un filtro scritto a mano avrebbe
    interrogato `fiscal_year = 0` e risposto niente a chi non chiede un anno.
  */
  const senzaAnno = await riepilogo({ fiscalYear: null });
  assert.ok(senzaAnno.lineCount > 0, "senza anno si vede tutto, non niente");
  assert.equal(senzaAnno.cash.collectedCents, 100_000 + 20_000);
  assert.equal(senzaAnno.cash.paidCents, 30_000);

  const parametroAssente = await riepilogo({});
  assert.equal(parametroAssente.lineCount, senzaAnno.lineCount);

  const stringaVuota = await riepilogo({ fiscalYear: "" });
  assert.equal(stringaVuota.lineCount, senzaAnno.lineCount);
});

/* ================================== la classificazione si dichiara === */

test("le righe non classificate sono contate, non nascoste", async () => {
  const scope = (await riepilogo()).breakdown.byActivityScope;

  assert.ok(scope.hasUnclassified);
  assert.ok(
    scope.unspecifiedLineCount > 0,
    "il giroconto e l'affitto nascono senza classificazione: si vedono",
  );
  assert.deepEqual(
    scope.groups.map((gruppo) => gruppo.scope),
    ["institutional", "commercial", "unspecified"],
  );
});

test("la voce di rendiconto arriva dalla causale configurata dal club", async () => {
  const report = await riepilogo({ fiscalYear: "2026" });
  const attivita = report.breakdown.byReportingBucket.find(
    (gruppo) => gruppo.key === "Attivita sportiva",
  );

  assert.ok(attivita, "la voce configurata sulla causale non e arrivata");
  assert.equal(attivita.inCents, 100_000 + 20_000);
});

/* =========================================== il confronto fra periodi === */

test("il confronto fra due anni tocca solo grandezze di cassa", async () => {
  const report = await riepilogo({
    fiscalYear: "2027",
    compareWith: { fiscalYear: "2026" },
  });

  assert.ok(report.comparison);
  assert.deepEqual(Object.keys(report.comparison), ["collected", "paid", "net"]);
  assert.equal(report.comparison.paid.currentCents, 30_000);
  assert.equal(report.comparison.paid.previousCents, 0);
  assert.equal(report.comparison.collected.previousCents, 100_000 + 20_000);
});

test("senza confronto richiesto non nasce un confronto dedotto", async () => {
  const report = await riepilogo({ fiscalYear: "2027" });
  assert.equal(report.comparison, null);
});

/* ================================================ permessi e confini === */

test("l'allenatore non vede il riepilogo gestionale", async () => {
  await rejects(riepilogo({}, allenatore()), /Accesso negato/);
});

test("la segreteria vede il riepilogo, e i saldi le restano null — non zero", async () => {
  const report = await riepilogo({}, segreteria());

  assert.equal(report.cash.collectedCents, 100_000 + 20_000);
  assert.equal(
    report.accountBalances,
    null,
    "un saldo a zero al posto di un diniego e un numero sbagliato",
  );
});

test("chi ha il permesso dei saldi li riceve, derivati", async () => {
  const report = await riepilogo();

  assert.ok(Array.isArray(report.accountBalances));
  const cassa = report.accountBalances.find((saldo) => saldo.accountId === CASSA);
  /* apertura 50.000 + entrata 100.000 - giroconto 25.000 + incasso 20.000 */
  assert.equal(cassa.balanceCents, 50_000 + 100_000 - 25_000 + 20_000);
});

test("il riepilogo di un altro club non si legge", async () => {
  await rejects(
    riepilogo({ organizationId: CLUB }, ownerAltrui()),
    /Accesso negato/,
  );
});

test("nessun movimento di un altro club entra nei totali", async () => {
  const report = await riepilogo();

  assert.ok(
    report.cash.collectedCents < 999_999,
    "il movimento del club B e finito nei totali del club A",
  );
  assert.equal(report.organizationId, CLUB);
});

test("senza club attivo e senza club richiesto la risposta e un diniego", async () => {
  await rejects(
    service.buildAccountingReport(
      { now: ADESSO },
      {
        userId: UTENTE,
        activeOrganizationId: null,
        activeRole: "owner",
        allowedOrganizationIds: [CLUB],
      },
    ),
    /Accesso negato/,
  );
});

/* =============================================== le righe neutralizzate === */

test("una coppia originale/storno non entra nel riepilogo, e il conteggio lo dice", async () => {
  fake.rows("accountingEntry").push(
    movimento("m-stornato", {
      amount_cents: 77_000,
      reversed_at: new Date("2026-10-01T00:00:00.000Z"),
    }),
    movimento("m-storno", {
      entry_date: new Date("2026-10-01T10:00:00.000Z"),
      direction: "OUT",
      amount_cents: 77_000,
      source_domain: "REVERSAL",
      reversal_of_id: "m-stornato",
    }),
  );

  const report = await riepilogo({ fiscalYear: "2026" });

  assert.equal(report.cash.collectedCents, 100_000 + 20_000);
  assert.equal(report.cash.paidCents, 0);
  assert.equal(report.cash.neutralizedCount, 2);
});

/* ============= il denaro incassato prima che il registro esistesse */

test("il rendiconto chiude: dovuto = incassato + storico + residuo", async () => {
  /*
    **Trovato dall'audit, e misurato.** Il lato cassa proietta solo incassi
    veri; il lato competenza usa il ledger, che per compatibilita conta come
    saldata una rata `paid` **senza nessun incasso** — righe anteriori al
    registro (RC FIX 3), e toglierle cancellerebbe denaro davvero ricevuto.

    Su due rate — 100 con 50 incassati davvero, 200 saldate senza registro — la
    risposta diceva incassato 50 e crediti 50 su un dovuto di 300. **I 200
    mancanti non li nominava nessuno.** Su un club appena migrato quella
    differenza e l'intero storico.

    Ora si dichiarano. Non si sommano alla cassa: sono denaro senza data, senza
    conto e senza prova, e la cassa di un periodo non li puo contenere.
  */
  const atleta = "99999999-0000-4000-8000-000000000009";
  fake.rows("athlete").push({
    id: atleta,
    organization_id: CLUB,
    first_name: "Anna",
    last_name: "Rossi",
  });
  fake.rows("athletePayment").push(
    {
      id: "rata-con-registro",
      organization_id: CLUB,
      athlete_id: atleta,
      description: "Quota A",
      amount: 100,
      status: "partially_paid",
    },
    {
      id: "rata-storica",
      organization_id: CLUB,
      athlete_id: atleta,
      description: "Quota B",
      amount: 200,
      status: "paid",
    },
  );
  fake.rows("paymentTransaction").push({
    id: "inc-vero",
    organization_id: CLUB,
    athlete_id: atleta,
    payment_id: "rata-con-registro",
    amount: 50,
    paid_at: new Date("2026-09-10T00:00:00Z"),
    payment_method: "Contanti",
  });

  const report = await riepilogo({ organizationId: CLUB });

  /*
    Il dovuto si somma dalle righe vere del club invece di scriverlo a mano: il
    seme di questo file porta gia altre rate, e un numero fisso proverebbe
    l'aritmetica del test invece di quella del rendiconto.
  */
  const dovuto = fake
    .rows("athletePayment")
    .filter((r) => r.organization_id === CLUB && r.status !== "cancelled")
    .reduce((somma, r) => somma + Math.round(Number(r.amount) * 100), 0);
  /*
    **La cassa delle famiglie, non tutta la cassa.** `cash.collectedCents`
    comprende sponsor, contributi e movimenti manuali: e il totale del club, e
    confrontarlo con il dovuto delle rate sarebbe confrontare due perimetri
    diversi. L'identita che deve chiudere riguarda un dominio solo.
  */
  const incassato =
    report.breakdown.bySourceDomain.find((riga) => riga.key === "ATHLETE_PAYMENT")
      ?.inCents ?? 0;
  const storico = report.accrual.legacyCollectedCents;
  const residuo = report.accrual.familyReceivablesCents;

  assert.equal(storico, 20000, "la rata saldata senza registro si dichiara");
  assert.equal(
    incassato + storico + residuo,
    dovuto,
    `il rendiconto deve chiudere: ${incassato} + ${storico} + ${residuo} != ${dovuto}`,
  );
});

test("una rata con incassi veri non finisce fra lo storico", async () => {
  const atleta = "99999999-0000-4000-8000-00000000000a";
  fake.rows("athlete").push({
    id: atleta,
    organization_id: CLUB,
    first_name: "Bruno",
    last_name: "Verdi",
  });
  fake.rows("athletePayment").push({
    id: "rata-saldata",
    organization_id: CLUB,
    athlete_id: atleta,
    description: "Quota C",
    amount: 100,
    status: "paid",
  });
  fake.rows("paymentTransaction").push({
    id: "inc-pieno",
    organization_id: CLUB,
    athlete_id: atleta,
    payment_id: "rata-saldata",
    amount: 100,
    paid_at: new Date("2026-09-10T00:00:00Z"),
    payment_method: "Contanti",
  });

  const report = await riepilogo({ organizationId: CLUB });

  assert.equal(
    report.accrual.legacyCollectedCents,
    0,
    "questa rata ha la sua prova: sta nella cassa, non nello storico",
  );
});

/* ------------------------------------------ il troncamento del confronto */

/**
 * **Il rendiconto mostra due letture, e ne dichiarava una sola.**
 *
 * `truncated` veniva preso dalla lettura principale e basta. Ma il rendiconto
 * mostra anche il **confronto** con il periodo precedente, che e una seconda
 * lettura con lo stesso tetto: se si ferma, le variazioni sono calcolate su
 * una parte del periodo di prima e su tutto quello di adesso. Il numero che ne
 * esce non e piccolo per caso — e sbagliato, e si presentava senza avvisi.
 */
test("se il periodo di confronto si tronca, il rendiconto lo dichiara", async () => {
  const registro = await import("../../src/lib/server/accounting.ts");
  const tetto = registro.TETTO_RIGHE_REGISTRO;

  /*
    Il periodo di adesso resta corto; quello di confronto no. E la disposizione
    che il difetto rendeva invisibile: il rendiconto non aveva niente da dire
    sulla lettura che stava presentando accanto.
  */
  const righe = fake.rows("accountingEntry");
  const modello = righe[0];
  for (let i = righe.length; i <= tetto + 1; i += 1) {
    righe.push({
      ...modello,
      id: `confronto-${i}`,
      entry_date: new Date("2025-03-01T00:00:00.000Z"),
      fiscal_year: 2025,
    });
  }

  const esito = await riepilogo({
    from: "2026-01-01",
    to: "2026-12-31",
    compareWith: { from: "2025-01-01", to: "2025-12-31" },
  });

  assert.equal(
    esito.truncated,
    true,
    "il troncamento del confronto e comunque un troncamento del rendiconto",
  );
});

/**
 * E il numero che l'avviso stampa e quello della **lettura**, non quello dei
 * soli movimenti di cassa: `lineCount` esclude le righe neutralizzate, quindi
 * dichiarava un limite piu basso di quello vero.
 */
test("il rendiconto dice quante righe ha letto, non quante ne ha contate", async () => {
  const esito = await riepilogo();
  assert.equal(typeof esito.lineCountRaw, "number");
  assert.ok(
    esito.lineCountRaw >= esito.lineCount,
    "le righe lette non sono meno di quelle contate",
  );
});
