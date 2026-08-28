import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Il servizio del lavoro sportivo, a runtime.
 *
 * Quattro cose vanno dimostrate.
 *
 * 1. **L'isolamento multi-tenant.** Un rapporto di lavoro dice quanto guadagna
 *    una persona: se il confine perde, un club legge i compensi di un altro.
 *    Ogni operazione viene provata dal club sbagliato e deve fallire con
 *    «Accesso negato».
 * 2. **Lo stato non si scrive.** Un rapporto nasce in bozza, si attiva solo se
 *    non manca niente, e le transizioni impossibili non passano.
 * 3. **Un piano gia pagato non si rifa'.** Rigenerare le scadenze
 *    spezzerebbe il legame fra un'uscita e cio che pagava.
 * 4. **L'autocertificazione si sostituisce, non si sovrascrive.** Quello che
 *    il club sapeva a marzo resta quello che sapeva a marzo.
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";
const PERSON_A = "11111111-0000-4000-8000-00000000000a";
const PERSON_B = "22222222-0000-4000-8000-00000000000b";
const REL_A = "33333333-0000-4000-8000-00000000000c";
const REL_B = "44444444-0000-4000-8000-00000000000d";

const scopeA = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB_A,
  activeRole: "owner",
  actorEmail: "a@example.test",
  allowedOrganizationIds: [CLUB_A],
});

const scopeB = () => ({
  userId: "user-b",
  activeOrganizationId: CLUB_B,
  activeRole: "owner",
  actorEmail: "b@example.test",
  allowedOrganizationIds: [CLUB_B],
});

let service;
let setPrismaClientForTests;
let fake;

const persona = (id, organizationId, overrides = {}) => ({
  id,
  organization_id: organizationId,
  origin_type: "trainer",
  origin_id: "trainer-1",
  first_name: "Marco",
  last_name: "Rossi",
  fiscal_code: "RSSMRC90A01H501A",
  birth_date: new Date("1990-01-01T00:00:00Z"),
  birth_place: "Roma",
  gender: "M",
  email: "marco@example.test",
  phone: "3331112222",
  address: null,
  fiscal_profile: "NONE",
  vat_number: null,
  pension_fund: null,
  social_coverage: "NONE",
  iban: "IT60X0542811101000000123456",
  notes: null,
  data: {},
  created_at: new Date("2026-08-01T00:00:00Z"),
  updated_at: new Date("2026-08-01T00:00:00Z"),
  ...overrides,
});

const rapporto = (id, organizationId, personId, overrides = {}) => ({
  id,
  organization_id: organizationId,
  person_id: personId,
  season_id: "2026-27",
  role: "COACH",
  relationship_type: "SPORT_COCOCO",
  start_date: new Date("2026-09-01T00:00:00Z"),
  end_date: new Date("2027-06-30T00:00:00Z"),
  status: "ACTIVE",
  contract_amount: 12000,
  currency: "EUR",
  compensation_frequency: "SEASONAL",
  weekly_hours: 10,
  contract_attachment_id: "cccccccc-0000-4000-8000-00000000000e",
  signature_state: "SIGNED",
  rasd_status: "TO_PREPARE",
  rasd_reference: null,
  rasd_communicated_at: null,
  rasd_notes: null,
  terminated_at: null,
  termination_reason: null,
  notes: null,
  data: {},
  created_at: new Date("2026-08-01T00:00:00Z"),
  updated_at: new Date("2026-08-01T00:00:00Z"),
  ...overrides,
});

const seed = () => ({
  sportWorkPerson: [persona(PERSON_A, CLUB_A), persona(PERSON_B, CLUB_B)],
  sportWorkRelationship: [
    rapporto(REL_A, CLUB_A, PERSON_A),
    rapporto(REL_B, CLUB_B, PERSON_B),
  ],
  sportWorkCompensationPlan: [],
  sportWorkInstallment: [],
  sportWorkOutboundTransaction: [],
  sportWorkExternalDeclaration: [],
  sportWorkYearPosition: [],
  auditLog: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  service = await import("../../src/lib/server/sport-work.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const rejects = (promise, pattern) =>
  assert.rejects(promise, (error) => {
    assert.match(String(error.message), pattern);
    return true;
  });

const auditActions = () => fake.rows("auditLog").map((row) => row.action);

// --- isolamento multi-tenant --------------------------------------------------

test("non si legge la persona di un altro club", async () => {
  await rejects(
    service.getSportWorkPersonById(PERSON_B, scopeA()),
    /Accesso negato/,
  );
});

test("non si legge il rapporto di un altro club", async () => {
  await rejects(service.getRelationshipById(REL_B, scopeA()), /Accesso negato/);
});

test("non si elencano le persone di un altro club", async () => {
  await rejects(
    service.listSportWorkPeople({ organizationId: CLUB_B }, scopeA()),
    /Accesso negato/,
  );
});

test("non si crea un rapporto su una persona di un altro club", async () => {
  await rejects(
    service.createRelationship(
      { personId: PERSON_B, startDate: "2026-09-01" },
      scopeA(),
    ),
    /Accesso negato/,
  );
  assert.equal(fake.rows("sportWorkRelationship").length, 2);
});

test("non si crea un piano su un rapporto di un altro club", async () => {
  await rejects(
    service.saveCompensationPlan(
      {
        relationshipId: REL_B,
        kind: "EQUAL_INSTALMENTS",
        totalAmount: 1000,
        installmentCount: 2,
        firstDueDate: "2026-09-30",
      },
      scopeA(),
    ),
    /Accesso negato/,
  );
  assert.equal(fake.rows("sportWorkCompensationPlan").length, 0);
});

test("non si registra un'autocertificazione per una persona di un altro club", async () => {
  await rejects(
    service.createDeclaration(
      { personId: PERSON_B, fiscalYear: 2026, externalAmount: 1000 },
      scopeA(),
    ),
    /Accesso negato/,
  );
  assert.equal(fake.rows("sportWorkExternalDeclaration").length, 0);
});

test("non si cambia lo stato di un rapporto di un altro club", async () => {
  await rejects(
    service.changeRelationshipStatus(REL_B, "SUSPENDED", {}, scopeA()),
    /Accesso negato/,
  );
});

test("ogni lettura filtra per organization_id, sempre", async () => {
  await service.listSportWorkPeople({}, scopeA());
  assert.equal(
    fake.lastCall("sportWorkPerson", "findMany").args.where.organization_id,
    CLUB_A,
  );

  await service.listRelationships({}, scopeA());
  assert.equal(
    fake.lastCall("sportWorkRelationship", "findMany").args.where.organization_id,
    CLUB_A,
  );

  await service.listInstallments({}, scopeA());
  assert.equal(
    fake.lastCall("sportWorkInstallment", "findMany").args.where.organization_id,
    CLUB_A,
  );

  await service.listYearPositions({}, scopeA());
  assert.equal(
    fake.lastCall("sportWorkYearPosition", "findMany").args.where.organization_id,
    CLUB_A,
  );
});

// --- persone --------------------------------------------------------------------

test("l'elenco delle persone non porta con se l'IBAN", async () => {
  const [row] = await service.listSportWorkPeople({}, scopeA());

  assert.equal(row.has_iban, true);
  assert.equal("iban" in row, false);
  assert.equal(row.full_name, "Marco Rossi");
});

test("nome e cognome sono obbligatori", async () => {
  await rejects(
    service.createSportWorkPerson({ firstName: "  ", lastName: "Rossi" }, scopeA()),
    /Nome e cognome/,
  );
});

test("un codice fiscale malformato non entra", async () => {
  await rejects(
    service.createSportWorkPerson(
      { firstName: "Anna", lastName: "Bianchi", fiscalCode: "XX" },
      scopeA(),
    ),
    /Codice fiscale non valido/,
  );
});

test("creare una persona lascia una traccia", async () => {
  await service.createSportWorkPerson(
    { firstName: "Anna", lastName: "Bianchi", originType: "staff_member" },
    scopeA(),
  );
  assert.ok(auditActions().includes("sport_work.person.created"));
});

// --- rapporti ---------------------------------------------------------------------

test("un rapporto nasce sempre in bozza, anche se qualcuno chiede altro", async () => {
  const created = await service.createRelationship(
    {
      personId: PERSON_A,
      startDate: "2026-09-01",
      endDate: "2027-06-30",
      status: "ACTIVE",
      relationshipType: "SPORT_COCOCO",
    },
    scopeA(),
  );

  assert.equal(created.status, "DRAFT");
  assert.ok(auditActions().includes("sport_work.relationship.created"));
});

test("una data di fine che precede l'inizio non passa", async () => {
  await rejects(
    service.createRelationship(
      { personId: PERSON_A, startDate: "2026-09-01", endDate: "2026-08-01" },
      scopeA(),
    ),
    /non puo precedere/,
  );
});

test("ore settimanali implausibili non passano", async () => {
  await rejects(
    service.createRelationship(
      { personId: PERSON_A, startDate: "2026-09-01", weeklyHours: 900 },
      scopeA(),
    ),
    /non sono plausibili/,
  );
});

test("attivare un rapporto senza contratto allegato dice cosa manca", async () => {
  const created = await service.createRelationship(
    { personId: PERSON_A, startDate: "2026-09-01" },
    scopeA(),
  );

  await rejects(
    service.changeRelationshipStatus(created.id, "ACTIVE", {}, scopeA()),
    /contratto firmato non e stato allegato/,
  );
});

test("con il contratto allegato il rapporto si attiva", async () => {
  const created = await service.createRelationship(
    {
      personId: PERSON_A,
      startDate: "2026-09-01",
      contractAttachmentId: "cccccccc-0000-4000-8000-00000000000e",
    },
    scopeA(),
  );

  const attivo = await service.changeRelationshipStatus(
    created.id,
    "ACTIVE",
    {},
    scopeA(),
  );
  assert.equal(attivo.status, "ACTIVE");
});

test("un rapporto con P.IVA senza partita IVA non si attiva", async () => {
  const created = await service.createRelationship(
    {
      personId: PERSON_A,
      startDate: "2026-09-01",
      relationshipType: "SELF_EMPLOYED_VAT",
      contractAttachmentId: "cccccccc-0000-4000-8000-00000000000e",
    },
    scopeA(),
  );

  await rejects(
    service.changeRelationshipStatus(created.id, "ACTIVE", {}, scopeA()),
    /partita IVA non e indicata/,
  );
});

test("le transizioni impossibili non passano", async () => {
  await service.changeRelationshipStatus(REL_A, "TERMINATED", { reason: "fine" }, scopeA());
  await rejects(
    service.changeRelationshipStatus(REL_A, "ACTIVE", {}, scopeA()),
    /Transizione non ammessa/,
  );
});

test("un rapporto cessato non si modifica", async () => {
  await service.changeRelationshipStatus(REL_A, "TERMINATED", { reason: "fine" }, scopeA());
  await rejects(
    service.updateRelationship(REL_A, { notes: "nuova nota" }, scopeA()),
    /cessato non si modifica/,
  );
});

test("la cessazione registra data e motivo", async () => {
  const cessato = await service.changeRelationshipStatus(
    REL_A,
    "TERMINATED",
    { reason: "Trasferimento" },
    scopeA(),
  );

  assert.ok(cessato.terminated_at);
  assert.equal(cessato.termination_reason, "Trasferimento");
});

test("un contratto finito passa a scaduto, e rifarlo non cambia nulla", async () => {
  const first = await service.refreshExpiredRelationships(
    CLUB_A,
    new Date("2027-08-01T00:00:00Z"),
  );
  const second = await service.refreshExpiredRelationships(
    CLUB_A,
    new Date("2027-08-01T00:00:00Z"),
  );

  assert.equal(first, 1);
  assert.equal(second, 0);
  assert.equal(
    fake.rows("sportWorkRelationship").find((row) => row.id === REL_A).status,
    "EXPIRED",
  );
});

// --- piani ---------------------------------------------------------------------------

const creaPiano = (overrides = {}, scope = scopeA()) =>
  service.saveCompensationPlan(
    {
      relationshipId: REL_A,
      kind: "EQUAL_INSTALMENTS",
      totalAmount: 12000,
      installmentCount: 10,
      firstDueDate: "2026-09-30",
      ...overrides,
    },
    scope,
  );

test("il piano genera le sue scadenze, e tornano al pattuito", async () => {
  const plan = await creaPiano();
  const rate = fake.rows("sportWorkInstallment");

  assert.equal(plan.total_amount, 12000);
  assert.equal(rate.length, 10);
  assert.equal(
    Math.round(rate.reduce((total, row) => total + row.gross_amount, 0) * 100) / 100,
    12000,
  );
  assert.ok(rate.every((row) => row.status === "SCHEDULED"));
  assert.ok(rate.every((row) => row.remaining_amount === row.gross_amount));
  assert.ok(auditActions().includes("sport_work.plan.created"));
});

test("le rate di una stagione ricadono su due anni solari", async () => {
  await creaPiano();
  const anni = new Set(fake.rows("sportWorkInstallment").map((row) => row.fiscal_year));
  assert.deepEqual([...anni].sort(), [2026, 2027]);
});

test("rifare il piano sostituisce le scadenze, non le somma", async () => {
  await creaPiano();
  await creaPiano({ installmentCount: 4, totalAmount: 8000 });

  const rate = fake.rows("sportWorkInstallment");
  assert.equal(rate.length, 4);
  assert.equal(fake.rows("sportWorkCompensationPlan").length, 1);
});

test("un piano con rate gia erogate non si rifa'", async () => {
  await creaPiano();
  const [prima] = fake.rows("sportWorkInstallment");
  prima.paid_amount = 1200;

  await rejects(creaPiano({ installmentCount: 4 }), /hanno gia ricevuto denaro/);
  assert.equal(fake.rows("sportWorkInstallment").length, 10);
});

test("una scadenza gia erogata non si annulla", async () => {
  await creaPiano();
  const [prima] = fake.rows("sportWorkInstallment");
  prima.paid_amount = 600;

  await rejects(service.cancelInstallment(prima.id, scopeA()), /si storna/);
});

test("una scadenza annullata smette di maturare", async () => {
  await creaPiano();
  const [prima] = fake.rows("sportWorkInstallment");

  const annullata = await service.cancelInstallment(prima.id, scopeA());
  assert.equal(annullata.status, "CANCELLED");
  assert.equal(annullata.accrued_amount, 0);
  assert.ok(auditActions().includes("sport_work.installment.changed"));
});

// --- maturazione ---------------------------------------------------------------------

test("il maturato si ricalcola dalle date, ed e idempotente", async () => {
  await creaPiano();

  const first = await service.recomputeInstallmentAccruals(
    REL_A,
    scopeA(),
    new Date("2026-11-15T00:00:00Z"),
  );
  const second = await service.recomputeInstallmentAccruals(
    REL_A,
    scopeA(),
    new Date("2026-11-15T00:00:00Z"),
  );

  assert.ok(first > 0);
  assert.equal(second, 0);

  const rate = fake.rows("sportWorkInstallment").sort((l, r) => l.sequence - r.sequence);
  // Settembre e ottobre sono trascorsi: maturati e scaduti.
  assert.equal(rate[0].accrued_amount, 1200);
  assert.equal(rate[0].status, "OVERDUE");
  // Novembre non e ancora chiuso.
  assert.equal(rate[2].accrued_amount, 0);
  assert.equal(rate[2].status, "SCHEDULED");
});

test("un rapporto in bozza non fa maturare niente", async () => {
  const created = await service.createRelationship(
    { personId: PERSON_A, startDate: "2026-09-01" },
    scopeA(),
  );
  await service.saveCompensationPlan(
    {
      relationshipId: created.id,
      kind: "MONTHLY",
      monthlyAmount: 900,
      startMonth: "2026-09",
      endMonth: "2026-10",
    },
    scopeA(),
  );

  await service.recomputeInstallmentAccruals(
    created.id,
    scopeA(),
    new Date("2026-11-15T00:00:00Z"),
  );

  const rate = fake
    .rows("sportWorkInstallment")
    .filter((row) => row.relationship_id === created.id);
  assert.ok(rate.every((row) => row.accrued_amount === 0));
});

// --- autocertificazioni -----------------------------------------------------------------

test("un'autocertificazione nuova sostituisce la precedente, che resta", async () => {
  const prima = await service.createDeclaration(
    {
      personId: PERSON_A,
      fiscalYear: 2026,
      externalAmount: 2000,
      declarationDate: "2026-03-01",
    },
    scopeA(),
  );

  const seconda = await service.createDeclaration(
    {
      personId: PERSON_A,
      fiscalYear: 2026,
      externalAmount: 4000,
      declarationDate: "2026-05-20",
    },
    scopeA(),
  );

  const righe = fake.rows("sportWorkExternalDeclaration");
  assert.equal(righe.length, 2, "la vecchia dichiarazione resta");
  assert.equal(
    righe.find((row) => row.id === prima.id).status,
    "SUPERSEDED",
  );
  assert.equal(seconda.status, "ACTIVE");
  assert.equal(seconda.supersedes_id, prima.id);
  assert.equal(
    righe.filter((row) => row.status === "ACTIVE").length,
    1,
    "una sola dichiarazione valida per anno",
  );
});

test("dichiarazioni di anni diversi convivono", async () => {
  await service.createDeclaration(
    { personId: PERSON_A, fiscalYear: 2026, externalAmount: 2000 },
    scopeA(),
  );
  await service.createDeclaration(
    { personId: PERSON_A, fiscalYear: 2027, externalAmount: 3000 },
    scopeA(),
  );

  assert.equal(
    fake.rows("sportWorkExternalDeclaration").filter((row) => row.status === "ACTIVE")
      .length,
    2,
  );
});

test("un importo dichiarato negativo non passa", async () => {
  await rejects(
    service.createDeclaration(
      { personId: PERSON_A, fiscalYear: 2026, externalAmount: -100 },
      scopeA(),
    ),
    /non puo essere negativo/,
  );
});

test("un anno fiscale fuori scala non passa", async () => {
  await rejects(
    service.createDeclaration(
      { personId: PERSON_A, fiscalYear: 202, externalAmount: 100 },
      scopeA(),
    ),
    /Anno fiscale non valido/,
  );
});

test("registrare una dichiarazione lascia una traccia e aggiorna la posizione", async () => {
  await service.createDeclaration(
    { personId: PERSON_A, fiscalYear: 2026, externalAmount: 2000 },
    scopeA(),
  );

  assert.ok(auditActions().includes("sport_work.self_declaration.created"));

  const posizione = fake.rows("sportWorkYearPosition")[0];
  assert.equal(posizione.external_declared, 2000);
  assert.equal(posizione.progressive, 2000);
  assert.equal(posizione.has_current_declaration, true);
});

// --- posizione annua ---------------------------------------------------------------------

test("la posizione annua e per club, persona e anno", async () => {
  await service.recomputeYearPosition(PERSON_A, 2026, scopeA());
  await service.recomputeYearPosition(PERSON_A, 2027, scopeA());
  await service.recomputeYearPosition(PERSON_A, 2026, scopeA());

  const righe = fake.rows("sportWorkYearPosition");
  assert.equal(righe.length, 2, "ricalcolare non crea una seconda riga");
});

test("non si ricalcola la posizione di una persona di un altro club", async () => {
  await rejects(
    service.recomputeYearPosition(PERSON_B, 2026, scopeA()),
    /Accesso negato/,
  );
});
