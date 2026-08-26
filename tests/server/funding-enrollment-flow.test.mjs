import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Il **flusso di iscrizione** a un programma di contributo, nei due sensi.
 *
 * Il buco che questi test presidiano era funzionale, non di modello:
 * `funding_enrollments` esisteva da ADR-0037 e **nessuna schermata lo sapeva
 * scrivere**. Un bando caricato restava senza beneficiari, e il maturato — che
 * si calcola per beneficiario — non aveva su cosa girare.
 *
 * La regola che non deve rompersi: **il maturato viene dalle presenze**.
 * L'iscrizione assegna un tetto, non un importo riconosciuto. Un'operatrice
 * che potesse scrivere il maturato trasformerebbe un calcolo verificabile in
 * una dichiarazione.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "bbbbbbbb-0000-4000-8000-000000000002";
const PROGRAMMA = "cccccccc-0000-4000-8000-000000000003";
const CHIUSO = "cccccccc-0000-4000-8000-000000000009";
const ANNA = "dddddddd-0000-4000-8000-000000000004";
const LUIGI = "dddddddd-0000-4000-8000-000000000005";
const MARIO = "dddddddd-0000-4000-8000-000000000006";

let funding;
let setPrismaClientForTests;
let fake;

before(async () => {
  funding = await import("../../src/lib/server/funding.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const scope = (organizationId = CLUB) => ({
  userId: "utente-1",
  activeOrganizationId: organizationId,
  allowedOrganizationIds: [organizationId],
  activeRole: "owner",
});

const seed = () => ({
  club: [
    { id: CLUB, name: "ASD Alfa" },
    { id: ALTRO_CLUB, name: "ASD Beta" },
  ],
  athlete: [
    { id: ANNA, organization_id: CLUB, first_name: "Anna", last_name: "Rossi" },
    { id: LUIGI, organization_id: CLUB, first_name: "Luigi", last_name: "Bianchi" },
    { id: MARIO, organization_id: CLUB, first_name: "Mario", last_name: "Verdi" },
  ],
  fundingProgram: [
    {
      id: PROGRAMMA,
      organization_id: CLUB,
      name: "Voucher Sport 2026",
      funder_name: "Regione",
      status: "active",
      valid_from: new Date("2026-01-01T00:00:00.000Z"),
      valid_to: new Date("2026-12-31T00:00:00.000Z"),
      athlete_plafond: 300,
      period_amount: 50,
      period_frequency: "monthly",
      requirement_unit: "hours",
      requirement_min: 8,
      unmet_behavior: "none",
    },
    {
      id: CHIUSO,
      organization_id: CLUB,
      name: "Bando 2025",
      funder_name: "Comune",
      status: "closed",
      valid_from: new Date("2025-01-01T00:00:00.000Z"),
      valid_to: new Date("2025-12-31T00:00:00.000Z"),
      athlete_plafond: 200,
      period_amount: 40,
      period_frequency: "monthly",
      requirement_unit: "hours",
      requirement_min: 8,
      unmet_behavior: "none",
    },
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const iscrivi = (athleteIds, extra = {}) =>
  funding.createFundingEnrollments(
    { programId: PROGRAMMA, athleteIds, ...extra },
    scope(),
  );

/* ---------------------------------------------------- iscrizione singola */

test("iscrivere un atleta crea la funding_enrollment canonica", async () => {
  const esito = await iscrivi([ANNA]);

  assert.equal(esito.created.length, 1);
  assert.deepEqual(esito.skipped, []);

  const righe = fake.rows("fundingEnrollment");
  assert.equal(righe.length, 1);
  assert.equal(righe[0].program_id, PROGRAMMA);
  assert.equal(righe[0].athlete_id, ANNA);
  assert.equal(righe[0].organization_id, CLUB);
  assert.equal(righe[0].status, "active");
  assert.equal(
    righe[0].assigned_amount,
    300,
    "senza importo individuale vale il plafond del programma",
  );
});

test("il plafond individuale vince su quello del programma", async () => {
  await iscrivi([ANNA], {
    perAthlete: { [ANNA]: { assignedAmount: 150 } },
  });

  assert.equal(fake.rows("fundingEnrollment")[0].assigned_amount, 150);
});

test("il codice voucher individuale si conserva", async () => {
  await iscrivi([ANNA], {
    perAthlete: { [ANNA]: { voucherCode: "LZ-2026-0042" } },
  });

  assert.equal(fake.rows("fundingEnrollment")[0].voucher_code, "LZ-2026-0042");
});

test("un plafond non positivo viene rifiutato", async () => {
  const esito = await iscrivi([ANNA], {
    perAthlete: { [ANNA]: { assignedAmount: 0 } },
  });

  assert.equal(esito.created.length, 0);
  assert.match(esito.skipped[0].reason, /maggiore di zero/i);
});

/* --------------------------------------------------- iscrizione multipla */

test("si iscrivono piu atleti in una sola operazione", async () => {
  const esito = await iscrivi([ANNA, LUIGI, MARIO]);

  assert.equal(esito.created.length, 3);
  assert.equal(fake.rows("fundingEnrollment").length, 3);
});

test("ogni atleta puo avere il proprio importo e il proprio codice", async () => {
  await iscrivi([ANNA, LUIGI], {
    perAthlete: {
      [ANNA]: { assignedAmount: 300, voucherCode: "A-1" },
      [LUIGI]: { assignedAmount: 120, voucherCode: "B-2" },
    },
  });

  const righe = fake.rows("fundingEnrollment");
  const anna = righe.find((row) => row.athlete_id === ANNA);
  const luigi = righe.find((row) => row.athlete_id === LUIGI);

  assert.equal(anna.assigned_amount, 300);
  assert.equal(anna.voucher_code, "A-1");
  assert.equal(luigi.assigned_amount, 120);
  assert.equal(luigi.voucher_code, "B-2");
});

test("un lotto non fallisce tutto per un atleta gia iscritto", async () => {
  /*
    Iscrivere trenta atleti e un'azione di segreteria: se il ventitreesimo
    risulta gia dentro, rifiutare l'intero lotto costringerebbe a rifare la
    selezione a mano per capire quale.
  */
  await iscrivi([LUIGI]);

  const esito = await iscrivi([ANNA, LUIGI, MARIO]);

  assert.equal(esito.created.length, 2);
  assert.equal(esito.skipped.length, 1);
  assert.equal(esito.skipped[0].athleteId, LUIGI);
  assert.match(esito.skipped[0].reason, /gia beneficiario/i);
});

test("un elenco vuoto non e un'iscrizione", async () => {
  await assert.rejects(() => iscrivi([]), /almeno un atleta/i);
});

/* ---------------------------------------------------------- il duplicato */

test("lo stesso atleta non si iscrive due volte allo stesso programma", async () => {
  await iscrivi([ANNA]);
  const esito = await iscrivi([ANNA]);

  assert.equal(esito.created.length, 0);
  assert.equal(
    fake.rows("fundingEnrollment").length,
    1,
    "due iscrizioni allo stesso programma vorrebbero dire due plafond",
  );
});

test("lo stesso atleta si iscrive a programmi diversi", async () => {
  fake.rows("fundingProgram").push({
    ...seed().fundingProgram[0],
    id: "programma-2",
    name: "Contributo comunale",
  });

  await iscrivi([ANNA]);
  await funding.createFundingEnrollments(
    { programId: "programma-2", athleteIds: [ANNA] },
    scope(),
  );

  assert.equal(fake.rows("fundingEnrollment").length, 2);
});

/* ------------------------------------------------------ programma chiuso */

test("un programma chiuso non ammette nuovi beneficiari", async () => {
  const esito = await funding.createFundingEnrollments(
    { programId: CHIUSO, athleteIds: [ANNA] },
    scope(),
  );

  assert.equal(esito.created.length, 0);
  assert.match(esito.skipped[0].reason, /chiuso/i);
});

test("un programma chiuso non compare fra quelli iscrivibili", async () => {
  const programmi = await funding.listEnrollableProgramsForAthlete(
    ANNA,
    scope(),
  );

  assert.deepEqual(
    programmi.map((program) => program.id),
    [PROGRAMMA],
    "offrire un programma che verrebbe rifiutato e peggio che non offrirlo",
  );
});

/* --------------------------------------------------------- multi-tenant */

test("un atleta di un altro club non si iscrive a questo programma", async () => {
  await assert.rejects(
    () =>
      funding.createFundingEnrollments(
        { programId: PROGRAMMA, athleteIds: [ANNA] },
        scope(ALTRO_CLUB),
      ),
    /Accesso negato/,
  );

  assert.equal(fake.rows("fundingEnrollment").length, 0);
});

test("il programma di un club non si legge da un altro club", async () => {
  await assert.rejects(
    () => funding.getFundingProgramDetail(PROGRAMMA, scope(ALTRO_CLUB)),
    /Accesso negato/,
  );
});

test("un'iscrizione di un club non si toglie da un altro club", async () => {
  const esito = await iscrivi([ANNA]);

  await assert.rejects(
    () =>
      funding.removeFundingEnrollment(
        esito.created[0].id,
        {},
        scope(ALTRO_CLUB),
      ),
    /Accesso negato/,
  );

  assert.equal(fake.rows("fundingEnrollment").length, 1);
});

/* --------------------------------------------------- rimozione e revoca */

test("senza storico l'iscrizione si toglie davvero", async () => {
  const esito = await iscrivi([ANNA]);

  const rimossa = await funding.removeFundingEnrollment(
    esito.created[0].id,
    {},
    scope(),
  );

  assert.equal(rimossa.outcome, "deleted");
  assert.equal(fake.rows("fundingEnrollment").length, 0);
});

test("con maturati gia rendicontati l'iscrizione si revoca, non si cancella", async () => {
  const esito = await iscrivi([ANNA]);

  fake.rows("fundingAccrual").push({
    id: "maturato-1",
    organization_id: CLUB,
    enrollment_id: esito.created[0].id,
    period_index: 0,
    accrued_amount: 50,
    status: "reported",
  });

  const risultato = await funding.removeFundingEnrollment(
    esito.created[0].id,
    { reason: "Uscita dal bando" },
    scope(),
  );

  assert.equal(risultato.outcome, "revoked");
  assert.equal(
    fake.rows("fundingEnrollment").length,
    1,
    "quei numeri sono stati comunicati a un ente: non si portano via",
  );
  assert.equal(fake.rows("fundingEnrollment")[0].status, "closed");
  assert.equal(fake.rows("fundingAccrual").length, 1);
});

test("con importi gia liquidati l'iscrizione si revoca", async () => {
  const esito = await iscrivi([ANNA]);

  fake.rows("fundingAccrual").push({
    id: "maturato-1",
    organization_id: CLUB,
    enrollment_id: esito.created[0].id,
    period_index: 0,
    accrued_amount: 50,
    status: "accrued",
  });
  fake.rows("fundingSettlementLine").push({
    id: "riga-1",
    organization_id: CLUB,
    accrual_id: "maturato-1",
    amount: 50,
  });

  const risultato = await funding.removeFundingEnrollment(
    esito.created[0].id,
    {},
    scope(),
  );

  assert.equal(risultato.outcome, "revoked");
  assert.equal(
    fake.rows("fundingSettlementLine").length,
    1,
    "e la traccia di denaro versato davvero",
  );
});

test("i maturati non ancora rendicontati se ne vanno con l'iscrizione", async () => {
  const esito = await iscrivi([ANNA]);

  fake.rows("fundingAccrual").push({
    id: "maturato-1",
    organization_id: CLUB,
    enrollment_id: esito.created[0].id,
    period_index: 0,
    accrued_amount: 50,
    status: "accrued",
  });

  await funding.removeFundingEnrollment(esito.created[0].id, {}, scope());

  assert.equal(
    fake.rows("fundingAccrual").length,
    0,
    "sono un risultato derivato dalle presenze: lasciarli orfani riempirebbe la riconciliazione",
  );
});

/* --------------------------------------------------- modifica di un'iscrizione */

test("il plafond individuale si puo cambiare", async () => {
  const esito = await iscrivi([ANNA]);

  const aggiornata = await funding.updateFundingEnrollment(
    esito.created[0].id,
    { assignedAmount: 400, voucherCode: "LZ-9" },
    scope(),
  );

  assert.equal(aggiornata.assigned_amount, 400);
  assert.equal(aggiornata.voucher_code, "LZ-9");
});

test("il plafond non scende sotto il gia maturato", async () => {
  const esito = await iscrivi([ANNA]);

  fake.rows("fundingAccrual").push({
    id: "maturato-1",
    organization_id: CLUB,
    enrollment_id: esito.created[0].id,
    period_index: 0,
    accrued_amount: 150,
    status: "accrued",
  });

  await assert.rejects(
    () =>
      funding.updateFundingEnrollment(
        esito.created[0].id,
        { assignedAmount: 100 },
        scope(),
      ),
    /non puo scendere sotto il gia maturato/i,
  );
});

test("uno stato inventato viene rifiutato", async () => {
  const esito = await iscrivi([ANNA]);

  await assert.rejects(
    () =>
      funding.updateFundingEnrollment(
        esito.created[0].id,
        { status: "quasi_attiva" },
        scope(),
      ),
    /non riconosciuto/i,
  );
});

/* ----------------------------------------- l'atleta si vede nel programma */

test("l'atleta iscritto compare nella scheda del programma, con i cinque importi", async () => {
  await iscrivi([ANNA], { perAthlete: { [ANNA]: { voucherCode: "LZ-1" } } });

  const dettaglio = await funding.getFundingProgramDetail(PROGRAMMA, scope());

  assert.equal(dettaglio.enrollments.length, 1);
  assert.equal(dettaglio.enrollments[0].athlete.lastName, "Rossi");
  assert.equal(dettaglio.enrollments[0].enrollment.voucher_code, "LZ-1");
  assert.equal(dettaglio.enrollments[0].summary.assignedAmount, 300);
  assert.equal(dettaglio.enrollments[0].summary.accruedAmount, 0);
  assert.equal(dettaglio.enrollments[0].summary.residualAmount, 300);
  assert.equal(dettaglio.totals.enrolledCount, 1);
  assert.equal(dettaglio.totals.activeCount, 1);
});

test("un atleta gia iscritto non compare fra quelli iscrivibili", async () => {
  await iscrivi([ANNA]);

  const iscrivibili = await funding.listEnrollableAthletes(PROGRAMMA, scope());

  assert.deepEqual(
    iscrivibili.map((athlete) => athlete.id).sort(),
    [LUIGI, MARIO].sort(),
  );
});

/* ------------------------------------- il programma si vede nella scheda atleta */

test("il programma compare nella scheda atleta dopo l'iscrizione", async () => {
  await iscrivi([ANNA]);

  const overview = await funding.getAthleteFundingOverview(ANNA, scope());

  assert.equal(overview.length, 1);
  assert.equal(overview[0].program.id, PROGRAMMA);
  assert.equal(overview[0].summary.assignedAmount, 300);
});

test("prima dell'iscrizione la scheda atleta non mostra niente", async () => {
  const overview = await funding.getAthleteFundingOverview(ANNA, scope());
  assert.deepEqual(overview, []);
});

/* ----------------------------------------- il maturato viene dalle presenze */

test("l'iscrizione non porta con se nessun maturato", async () => {
  await iscrivi([ANNA]);

  assert.equal(
    fake.rows("fundingAccrual").length,
    0,
    "il maturato si ricava dalle presenze, non si assegna",
  );

  const dettaglio = await funding.getFundingProgramDetail(PROGRAMMA, scope());
  assert.equal(dettaglio.enrollments[0].summary.accruedAmount, 0);
});

test("senza iscrizione non si puo maturare niente", async () => {
  /*
    Il maturato si calcola **per beneficiario**: senza iscrizione non esiste il
    soggetto su cui calcolarlo, ed e la ragione per cui questo blocco esisteva.
  */
  const overview = await funding.getAthleteFundingOverview(ANNA, scope());
  assert.equal(overview.length, 0);
  assert.equal(fake.rows("fundingAccrual").length, 0);
});

test("dopo l'iscrizione il ricalcolo trova il beneficiario su cui girare", async () => {
  const esito = await iscrivi([ANNA]);

  const risultato = await funding.recomputeEnrollmentAccruals(
    esito.created[0].id,
    scope(),
  );

  /*
    Senza presenze registrate il maturato e zero, ed e il risultato giusto: il
    calcolo ha girato e non ha trovato frequenza. Cio che conta e che **abbia
    potuto girare**, che prima dell'iscrizione non era possibile.
  */
  assert.ok(risultato);
  assert.equal(
    fake.rows("fundingAccrual").every((row) => Number(row.accrued_amount) === 0),
    true,
  );
});
