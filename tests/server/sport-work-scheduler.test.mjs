import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Il giro notturno del lavoro sportivo.
 *
 * Una cosa sola conta piu di tutte le altre: **rieseguirlo non deve produrre
 * niente di nuovo**. Un job che gira ogni notte e non e idempotente, dopo una
 * settimana, ha mandato sette promemoria identici per la stessa scadenza. Chi
 * li riceve smette di leggerli, e la volta che il promemoria conta davvero non
 * lo vede nessuno.
 *
 * Le altre tre:
 *
 * - i contratti finiti passano a scaduti;
 * - il maturato si ricalcola dalle date;
 * - cio che scade presto, o e gia scaduto, produce una notifica — e cio che
 *   scade fra sei mesi no.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const PERSONA = "11111111-0000-4000-8000-00000000000a";
const RAPPORTO = "22222222-0000-4000-8000-00000000000b";
const PIANO = "33333333-0000-4000-8000-00000000000c";

const NOW = new Date("2026-10-05T03:30:00Z");

const scope = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

let scheduler;
let setPrismaClientForTests;
let fake;

const rata = (id, overrides = {}) => ({
  id,
  organization_id: CLUB,
  plan_id: PIANO,
  relationship_id: RAPPORTO,
  sequence: 1,
  label: "Rata 1 di 10",
  accrual_period_start: new Date("2026-09-01T00:00:00Z"),
  accrual_period_end: new Date("2026-09-30T00:00:00Z"),
  due_date: new Date("2026-09-30T00:00:00Z"),
  gross_amount: 1200,
  accrued_amount: 0,
  paid_amount: 0,
  remaining_amount: 1200,
  status: "SCHEDULED",
  fiscal_year: 2026,
  cancelled: false,
  ...overrides,
});

const PROPRIETARIO = "eeeeeeee-0000-4000-8000-00000000000a";
const GENITORE = "eeeeeeee-0000-4000-8000-00000000000b";

const seed = () => ({
  club: [{ id: CLUB, name: "ASD Alfa", creator_id: PROPRIETARIO }],
  /*
    Il club ha un proprietario e un genitore, e non e un dettaglio del banco di
    prova: le notifiche di questo giro parlano di **compensi**, e dalla Wave 2
    sono indirizzate a chi ha `sport_work.read` invece di essere «di club».
    Prima erano `user_id: null`, che il prodotto interpreta come «di tutti»:
    `parent-dashboard.ts` legge `user_id: null`, quindi ogni genitore leggeva
    quanto la societa deve erogare ai suoi collaboratori.
  */
  organizationUser: [
    { id: "ou-owner", organization_id: CLUB, user_id: PROPRIETARIO, role: "owner" },
    { id: "ou-parent", organization_id: CLUB, user_id: GENITORE, role: "parent" },
  ],
  sportWorkPerson: [
    {
      id: PERSONA,
      organization_id: CLUB,
      first_name: "Marco",
      last_name: "Rossi",
      fiscal_code: "RSSMRC90A01H501A",
      social_coverage: "NONE",
    },
  ],
  sportWorkRelationship: [
    {
      id: RAPPORTO,
      organization_id: CLUB,
      person_id: PERSONA,
      relationship_type: "SPORT_COCOCO",
      role: "COACH",
      status: "ACTIVE",
      start_date: new Date("2026-09-01T00:00:00Z"),
      end_date: new Date("2027-06-30T00:00:00Z"),
      currency: "EUR",
      rasd_status: "TO_PREPARE",
    },
  ],
  sportWorkCompensationPlan: [
    {
      id: PIANO,
      organization_id: CLUB,
      relationship_id: RAPPORTO,
      kind: "EQUAL_INSTALMENTS",
      total_amount: 12000,
    },
  ],
  sportWorkInstallment: [
    // Settembre: scaduta e non erogata.
    rata("rata-1"),
    // Ottobre: in scadenza fra sei giorni.
    rata("rata-2", {
      sequence: 2,
      label: "Rata 2 di 10",
      accrual_period_end: new Date("2026-10-31T00:00:00Z"),
      due_date: new Date("2026-10-11T00:00:00Z"),
    }),
    // Giugno: lontana.
    rata("rata-3", {
      sequence: 3,
      label: "Rata 3 di 10",
      accrual_period_end: new Date("2027-06-30T00:00:00Z"),
      due_date: new Date("2027-06-30T00:00:00Z"),
      fiscal_year: 2027,
    }),
  ],
  sportWorkOutboundTransaction: [],
  sportWorkExternalDeclaration: [],
  sportWorkYearPosition: [],
  sportWorkObligation: [],
  notification: [],
  auditLog: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  scheduler = await import("../../src/lib/server/sport-work-scheduler.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const gira = (now = NOW) =>
  scheduler.runSportWorkSchedulerForClub(CLUB, { now, scope: scope() });

const notificheDi = (tipo) =>
  fake.rows("notification").filter((row) => row.type === tipo);

// --- idempotenza ---------------------------------------------------------------

test("rieseguire il giro non produce una seconda notifica", async () => {
  const primo = await gira();
  const secondo = await gira();
  const terzo = await gira();

  assert.ok(primo.notifications > 0, "il primo giro qualcosa deve notificarlo");
  assert.equal(secondo.notifications, 0);
  assert.equal(terzo.notifications, 0);

  const chiavi = fake.rows("notification").map((row) => row.data.sportWorkKey);
  assert.equal(new Set(chiavi).size, chiavi.length, "nessuna chiave ripetuta");
});

test("rieseguire il giro non duplica l'agenda", async () => {
  await gira();
  const prima = fake.rows("sportWorkObligation").length;
  const secondo = await gira();

  assert.equal(secondo.obligations.created, 0);
  assert.equal(fake.rows("sportWorkObligation").length, prima);
});

test("il maturato si ricalcola una volta e poi resta fermo", async () => {
  const primo = await gira();
  const secondo = await gira();

  assert.ok(primo.accrualsUpdated > 0);
  assert.equal(secondo.accrualsUpdated, 0);
});

// --- cosa notifica ---------------------------------------------------------------

test("una rata scaduta e non erogata produce un avviso", async () => {
  await gira();

  const avvisi = notificheDi("sport_work_payout_overdue");
  assert.equal(avvisi.length, 1);
  assert.equal(avvisi[0].title, "Compenso scaduto");
  assert.match(avvisi[0].message, /Rata 1 di 10/);
  assert.match(avvisi[0].message, /1200,00 euro/);
  assert.equal(avvisi[0].data.sportWorkKey, "installment-overdue:rata-1");

  /*
    **E arriva a chi puo vederlo, non a tutto il club.** Le notifiche di questo
    giro nascevano con `user_id: null`, che il prodotto interpreta come «di
    tutti»: `parent-dashboard.ts` legge `OR: [{ user_id }, { user_id: null }]`,
    quindi ogni genitore leggeva nella propria area quanto la societa deve
    erogare ai suoi collaboratori. La stessa falla e stata trovata sulle
    automazioni della Wave 2; correggerne una e lasciare l'altra sarebbe stato
    peggio che non accorgersene.
  */
  assert.equal(avvisi[0].user_id, PROPRIETARIO);
  assert.equal(
    notificheDi("sport_work_payout_overdue").some(
      (riga) => riga.user_id === null || riga.user_id === GENITORE,
    ),
    false,
    "nessuna notifica di compenso e «di club», e nessuna arriva a un genitore",
  );
});

test("una rata che scade entro sette giorni produce un preavviso", async () => {
  await gira();

  const avvisi = notificheDi("sport_work_payout_due");
  assert.equal(avvisi.length, 1);
  assert.equal(avvisi[0].data.sportWorkKey, "installment-due:rata-2");
});

test("una rata che scade fra otto mesi non produce niente", async () => {
  await gira();

  const chiavi = fake.rows("notification").map((row) => row.data.sportWorkKey);
  assert.ok(!chiavi.includes("installment-due:rata-3"));
  assert.ok(!chiavi.includes("installment-overdue:rata-3"));
});

test("una rata gia erogata non produce avvisi", async () => {
  const rata1 = fake.rows("sportWorkInstallment").find((row) => row.id === "rata-1");
  rata1.paid_amount = 1200;
  rata1.remaining_amount = 0;
  rata1.status = "PAID";

  await gira();

  const chiavi = fake.rows("notification").map((row) => row.data.sportWorkKey);
  assert.ok(!chiavi.includes("installment-overdue:rata-1"));
});

test("una rata annullata non produce avvisi", async () => {
  const rata1 = fake.rows("sportWorkInstallment").find((row) => row.id === "rata-1");
  rata1.cancelled = true;
  rata1.remaining_amount = 0;

  await gira();

  const chiavi = fake.rows("notification").map((row) => row.data.sportWorkKey);
  assert.ok(!chiavi.includes("installment-overdue:rata-1"));
});

test("gli adempimenti vicini producono un avviso e restano marcati", async () => {
  await gira();

  const adempimenti = fake
    .rows("sportWorkObligation")
    .filter((row) => row.notified_at);

  assert.ok(adempimenti.length > 0);

  const avvisi = fake
    .rows("notification")
    .filter((row) => String(row.type).startsWith("sport_work_obligation_"));
  assert.ok(avvisi.length > 0);
  assert.ok(
    avvisi.every((row) => String(row.data.sportWorkKey).startsWith("obligation:")),
  );
});

test("l'autocertificazione mancante arriva fra gli avvisi", async () => {
  await gira();

  const avviso = fake
    .rows("notification")
    .find((row) => row.type === "sport_work_obligation_self_declaration");

  assert.ok(avviso, "senza autocertificazione il club deve saperlo");
  assert.match(avviso.title, /Autocertificazione compensi esterni 2026/);
});

// --- stati che maturano -----------------------------------------------------------

test("un contratto finito passa a scaduto", async () => {
  const esito = await scheduler.runSportWorkSchedulerForClub(CLUB, {
    now: new Date("2027-08-01T03:30:00Z"),
    scope: scope(),
  });

  assert.equal(esito.expiredRelationships, 1);
  assert.equal(fake.rows("sportWorkRelationship")[0].status, "EXPIRED");
});

test("il giro lascia una traccia di cosa ha fatto", async () => {
  await gira();

  const traccia = fake
    .rows("auditLog")
    .find((row) => row.action === "sport_work.scheduler.run");

  assert.ok(traccia);
  assert.ok(traccia.metadata.notifications > 0);
});

// --- tutti i club --------------------------------------------------------------------

test("il giro su tutti i club non si ferma al primo che fallisce", async () => {
  fake.rows("club").push({ id: "club-rotto", name: "ASD Rotta" });

  const originale = fake.client.sportWorkRelationship.findMany;
  fake.client.sportWorkRelationship.findMany = async (args = {}) => {
    if (args?.where?.organization_id === "club-rotto") {
      throw new Error("archivio non raggiungibile");
    }
    return originale(args);
  };

  const risultati = await scheduler.runSportWorkSchedulerForAllClubs(NOW);

  assert.equal(risultati.length, 2);
  const rotto = risultati.find((row) => row.organizationId === "club-rotto");
  assert.equal(rotto.ok, false);
  assert.match(rotto.error, /archivio non raggiungibile/);

  const sano = risultati.find((row) => row.organizationId === CLUB);
  assert.equal(sano.ok, true);
});
