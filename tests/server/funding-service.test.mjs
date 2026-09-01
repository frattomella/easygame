import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Il servizio dei contributi, a runtime (Workstream A, ADR-0037).
 *
 * Tre cose vanno dimostrate:
 *
 * 1. **l'isolamento multi-tenant**. Un contributo e denaro pubblico
 *    attribuito a un minore: se il confine perde, un club vede i voucher di
 *    un altro. Ogni operazione viene provata dal club sbagliato e deve
 *    fallire con «Accesso negato»;
 * 2. **la segreteria non fa calcoli**. Il maturato lo scrive il servizio,
 *    leggendo le presenze; ricalcolare due volte non raddoppia niente;
 * 3. **maturato e liquidato restano due numeri**. Un periodo maturato non e
 *    denaro finche l'ente non versa, e non si puo liquidare piu di quanto e
 *    maturato.
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";
const PROG_A = "11111111-0000-4000-8000-00000000000a";
const PROG_B = "22222222-0000-4000-8000-00000000000b";
const ATLETA_A = "33333333-0000-4000-8000-00000000000c";

const scopeA = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB_A,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB_A],
});

const scopeB = () => ({
  userId: "user-b",
  activeOrganizationId: CLUB_B,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB_B],
});

let service;
let setPrismaClientForTests;
let fake;

/** Il caso di riferimento, espresso solo come dati. */
const programma = (id, organizationId, overrides = {}) => ({
  id,
  organization_id: organizationId,
  name: "Voucher per lo Sport 2025",
  funder_name: "Regione Lazio / Sport e Salute",
  status: "active",
  valid_from: new Date("2025-09-01T00:00:00Z"),
  valid_to: new Date("2025-11-30T00:00:00Z"),
  athlete_plafond: 500,
  period_amount: 60,
  period_frequency: "monthly",
  period_length_days: null,
  requirement_unit: "hours",
  requirement_min: 8,
  unmet_behavior: "none",
  max_periods: null,
  max_total_amount: null,
  notes: null,
  data: {},
  created_at: new Date("2025-08-01T00:00:00Z"),
  updated_at: new Date("2025-08-01T00:00:00Z"),
  ...overrides,
});

/* L'allenamento e una **riga** (ADR-0098). */
const allenamento = (id, organizationId, date, start, end) => ({
  id: `row-${id}`,
  organization_id: organizationId,
  kind: "training",
  legacy_id: id,
  status: "scheduled",
  starts_at: new Date(`${date}T${start}:00.000Z`),
  ends_at: new Date(`${date}T${end}:00.000Z`),
  payload: { id, date, startTime: start, endTime: end },
});

const presenza = (trainingId, organizationId, athleteId = ATLETA_A) => ({
  id: `att-${trainingId}-${athleteId}`,
  organization_id: organizationId,
  event_id: `row-${trainingId}`,
  legacy_training_id: trainingId,
  athlete_id: athleteId,
  status: "present",
});

/** Settembre: 8 ore (soglia raggiunta). Ottobre: 4 ore (sotto soglia). */
const seed = () => ({
  fundingProgram: [programma(PROG_A, CLUB_A), programma(PROG_B, CLUB_B)],
  fundingEnrollment: [],
  fundingAccrual: [],
  fundingSettlement: [],
  fundingSettlementLine: [],
  clubEvent: [
    allenamento("s1", CLUB_A, "2025-09-02", "17:00", "19:00"),
    allenamento("s2", CLUB_A, "2025-09-09", "17:00", "19:00"),
    allenamento("s3", CLUB_A, "2025-09-16", "17:00", "19:00"),
    allenamento("s4", CLUB_A, "2025-09-23", "17:00", "19:00"),
    allenamento("o1", CLUB_A, "2025-10-07", "17:00", "19:00"),
    allenamento("o2", CLUB_A, "2025-10-14", "17:00", "19:00"),
  ],
  clubEventParticipant: [
    presenza("s1", CLUB_A),
    presenza("s2", CLUB_A),
    presenza("s3", CLUB_A),
    presenza("s4", CLUB_A),
    presenza("o1", CLUB_A),
    presenza("o2", CLUB_A),
  ],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  service = await import("../../src/lib/server/funding.ts");
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

const iscrivi = (overrides = {}, scope = scopeA()) =>
  service.createFundingEnrollment(
    { programId: PROG_A, athleteId: ATLETA_A, ...overrides },
    scope,
  );

const accrualsOf = (enrollmentId) =>
  fake
    .rows("fundingAccrual")
    .filter((row) => row.enrollment_id === enrollmentId)
    .sort((left, right) => left.period_index - right.period_index);

// --- isolamento multi-tenant -------------------------------------------------

test("non si legge un programma di un altro club", async () => {
  await rejects(
    service.getFundingProgramById(PROG_B, scopeA()),
    /Accesso negato/,
  );
});

test("non si elencano i programmi di un altro club", async () => {
  await rejects(
    service.listFundingPrograms({ organizationId: CLUB_B }, scopeA()),
    /Accesso negato/,
  );
});

test("non si ammette un atleta a un programma di un altro club", async () => {
  await rejects(
    service.createFundingEnrollment(
      { programId: PROG_B, athleteId: ATLETA_A },
      scopeA(),
    ),
    /Accesso negato/,
  );
  assert.equal(fake.rows("fundingEnrollment").length, 0);
});

test("non si ricalcola il maturato di un beneficiario di un altro club", async () => {
  const enrollment = await iscrivi();

  await rejects(
    service.recomputeEnrollmentAccruals(enrollment.id, scopeB()),
    /Accesso negato/,
  );
});

test("ogni lettura filtra per organization_id, sempre", async () => {
  await service.listFundingPrograms({}, scopeA());
  assert.equal(
    fake.lastCall("fundingProgram", "findMany").args.where.organization_id,
    CLUB_A,
  );

  await service.listFundingAccruals({}, scopeA());
  assert.equal(
    fake.lastCall("fundingAccrual", "findMany").args.where.organization_id,
    CLUB_A,
  );
});

// --- ammissione --------------------------------------------------------------

test("il plafond assegnato eredita dal programma, ma puo essere diverso", async () => {
  const predefinito = await iscrivi();
  assert.equal(predefinito.assigned_amount, 500);

  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);

  const ridotto = await iscrivi({ assignedAmount: 300, voucherCode: "LAZ-001" });
  assert.equal(ridotto.assigned_amount, 300);
  assert.equal(ridotto.voucher_code, "LAZ-001");
});

test("lo stesso atleta non si iscrive due volte allo stesso programma", async () => {
  await iscrivi();
  await rejects(iscrivi(), /gia beneficiario/i);
});

test("un programma chiuso non ammette nuovi beneficiari", async () => {
  fake.rows("fundingProgram")[0].status = "closed";
  await rejects(iscrivi(), /programma e chiuso/i);
});

test("un plafond nullo non e un plafond", async () => {
  await rejects(iscrivi({ assignedAmount: 0 }), /maggiore di zero/i);
});

// --- il maturato lo calcola il servizio --------------------------------------

test("il maturato si ricava dalle presenze, senza che nessuno digiti un numero", async () => {
  const enrollment = await iscrivi();
  await service.recomputeEnrollmentAccruals(enrollment.id, scopeA(), {
    until: "2025-11-30",
  });

  const righe = accrualsOf(enrollment.id);

  assert.equal(righe.length, 3, "settembre, ottobre, novembre");

  assert.equal(righe[0].measured_value, 8, "quattro allenamenti da due ore");
  assert.equal(righe[0].requirement_met, true);
  assert.equal(righe[0].accrued_amount, 60);
  assert.equal(righe[0].status, "accrued");

  assert.equal(righe[1].measured_value, 4, "ottobre: due allenamenti");
  assert.equal(righe[1].requirement_met, false);
  assert.equal(righe[1].accrued_amount, 0, "sotto la soglia non matura");
  assert.equal(righe[1].unaccrued_amount, 60, "quanto si e perso resta scritto");
  assert.equal(righe[1].status, "not_accrued");

  assert.equal(righe[2].measured_value, 0, "novembre: nessun allenamento");
  assert.equal(righe[2].accrued_amount, 0);
});

test("il maturato spiega perche vale quello che vale", async () => {
  const enrollment = await iscrivi();
  await service.recomputeEnrollmentAccruals(enrollment.id, scopeA(), {
    until: "2025-11-30",
  });

  const righe = accrualsOf(enrollment.id);

  assert.match(righe[0].data.reason, /Requisito raggiunto/);
  assert.match(righe[1].data.reason, /soglia di 8 ore/);
  assert.equal(righe[0].data.sessions, 4);
  assert.equal(righe[0].data.hours, 8);
});

test("ricalcolare due volte non raddoppia il maturato", async () => {
  const enrollment = await iscrivi();
  await service.recomputeEnrollmentAccruals(enrollment.id, scopeA(), {
    until: "2025-11-30",
  });
  await service.recomputeEnrollmentAccruals(enrollment.id, scopeA(), {
    until: "2025-11-30",
  });

  const righe = accrualsOf(enrollment.id);

  assert.equal(righe.length, 3, "aggiorna le righe, non ne aggiunge altre tre");
  assert.equal(righe[0].accrued_amount, 60);
});

test("correggere un appello cambia il maturato al ricalcolo successivo", async () => {
  const enrollment = await iscrivi();
  await service.recomputeEnrollmentAccruals(enrollment.id, scopeA(), {
    until: "2025-11-30",
  });
  assert.equal(accrualsOf(enrollment.id)[1].accrued_amount, 0);

  // La segreteria registra due allenamenti di ottobre dimenticati.
  fake.rows("clubEvent").push(
    allenamento("o3", CLUB_A, "2025-10-21", "17:00", "19:00"),
    allenamento("o4", CLUB_A, "2025-10-28", "17:00", "19:00"),
  );
  fake
    .rows("clubEventParticipant")
    .push(presenza("o3", CLUB_A), presenza("o4", CLUB_A));

  await service.recomputeEnrollmentAccruals(enrollment.id, scopeA(), {
    until: "2025-11-30",
  });

  const righe = accrualsOf(enrollment.id);
  assert.equal(righe[1].measured_value, 8);
  assert.equal(righe[1].accrued_amount, 60, "ora ottobre matura");
});

test("le presenze di un altro atleta non fanno maturare questo", async () => {
  fake
    .rows("clubEventParticipant")
    .push(presenza("o1", CLUB_A, "altro-atleta"), presenza("o2", CLUB_A, "altro-atleta"));

  const enrollment = await iscrivi();
  await service.recomputeEnrollmentAccruals(enrollment.id, scopeA(), {
    until: "2025-11-30",
  });

  assert.equal(accrualsOf(enrollment.id)[0].measured_value, 8);
  assert.equal(
    fake.lastCall("clubEventParticipant", "findMany").args.where.athlete_id,
    ATLETA_A,
  );
});

// --- rendicontazione ---------------------------------------------------------

test("si rendicontano solo i periodi che hanno maturato qualcosa", async () => {
  const enrollment = await iscrivi();
  await service.recomputeEnrollmentAccruals(enrollment.id, scopeA(), {
    until: "2025-11-30",
  });
  const righe = accrualsOf(enrollment.id);

  await rejects(
    service.markAccrualsReported([righe[1].id], scopeA()),
    /non ha maturato niente/i,
  );

  await service.markAccrualsReported([righe[0].id], scopeA());
  assert.equal(accrualsOf(enrollment.id)[0].status, "reported");
});

test("non si rendicontano periodi di un altro club", async () => {
  const enrollment = await iscrivi();
  await service.recomputeEnrollmentAccruals(enrollment.id, scopeA(), {
    until: "2025-11-30",
  });
  const righe = accrualsOf(enrollment.id);

  await rejects(
    service.markAccrualsReported([righe[0].id], scopeB()),
    /Accesso negato/,
  );
});

test("un periodo rendicontato torna «maturato» se il ricalcolo ne cambia l'importo", async () => {
  const enrollment = await iscrivi();
  await service.recomputeEnrollmentAccruals(enrollment.id, scopeA(), {
    until: "2025-11-30",
  });
  const righe = accrualsOf(enrollment.id);
  await service.markAccrualsReported([righe[0].id], scopeA());

  // Un appello di settembre viene corretto: l'atleta non c'era.
  fake.rows("clubEventParticipant").splice(0, 1);

  await service.recomputeEnrollmentAccruals(enrollment.id, scopeA(), {
    until: "2025-11-30",
  });

  const dopo = accrualsOf(enrollment.id)[0];
  assert.equal(dopo.measured_value, 6);
  assert.equal(dopo.accrued_amount, 0);
  assert.equal(
    dopo.status,
    "not_accrued",
    "cio che era stato dichiarato all'ente non corrisponde piu",
  );
});

// --- liquidazioni ------------------------------------------------------------

const maturaSettembre = async () => {
  const enrollment = await iscrivi();
  await service.recomputeEnrollmentAccruals(enrollment.id, scopeA(), {
    until: "2025-11-30",
  });
  const righe = accrualsOf(enrollment.id);
  await service.markAccrualsReported([righe[0].id], scopeA());
  return { enrollment, accrual: accrualsOf(enrollment.id)[0] };
};

test("una liquidazione si riconcilia con i periodi e li porta a «liquidato»", async () => {
  const { accrual } = await maturaSettembre();

  const settlement = await service.createFundingSettlement(
    {
      programId: PROG_A,
      amount: 60,
      settledAt: "2025-12-15",
      reference: "MANDATO-2025-77",
      lines: [{ accrualId: accrual.id, amount: 60 }],
    },
    scopeA(),
  );

  assert.equal(settlement.amount, 60);
  assert.equal(settlement.reference, "MANDATO-2025-77");
  /*
    Le righe si leggono dalla tabella e non da `settlement.lines`: il doppio di
    Prisma non risolve `include`, e un test che ci si appoggiasse verificherebbe
    il doppio invece del servizio.
  */
  const righeLiquidazione = fake
    .rows("fundingSettlementLine")
    .filter((row) => row.settlement_id === settlement.id);
  assert.equal(righeLiquidazione.length, 1);
  assert.equal(righeLiquidazione[0].amount, 60);
  assert.equal(
    fake.rows("fundingAccrual").find((row) => row.id === accrual.id).status,
    "settled",
  );
});

test("una liquidazione parziale lascia il periodo fra i crediti", async () => {
  const { accrual } = await maturaSettembre();

  await service.createFundingSettlement(
    {
      programId: PROG_A,
      amount: 30,
      lines: [{ accrualId: accrual.id, amount: 30 }],
    },
    scopeA(),
  );

  assert.equal(
    fake.rows("fundingAccrual").find((row) => row.id === accrual.id).status,
    "reported",
    "meta versata non e versata",
  );
});

test("non si liquida piu di quanto e maturato, nemmeno in due volte", async () => {
  const { accrual } = await maturaSettembre();

  await rejects(
    service.createFundingSettlement(
      {
        programId: PROG_A,
        amount: 100,
        lines: [{ accrualId: accrual.id, amount: 100 }],
      },
      scopeA(),
    ),
    /piu di quanto e maturato/i,
  );

  await service.createFundingSettlement(
    {
      programId: PROG_A,
      amount: 40,
      lines: [{ accrualId: accrual.id, amount: 40 }],
    },
    scopeA(),
  );

  await rejects(
    service.createFundingSettlement(
      {
        programId: PROG_A,
        amount: 30,
        lines: [{ accrualId: accrual.id, amount: 30 }],
      },
      scopeA(),
    ),
    /restano 20\.00 EUR/,
  );
});

test("la ripartizione deve corrispondere all'importo versato", async () => {
  const { accrual } = await maturaSettembre();

  await rejects(
    service.createFundingSettlement(
      {
        programId: PROG_A,
        amount: 100,
        lines: [{ accrualId: accrual.id, amount: 60 }],
      },
      scopeA(),
    ),
    /non corrisponde/i,
  );
});

test("una liquidazione senza righe non si registra", async () => {
  await maturaSettembre();

  await rejects(
    service.createFundingSettlement(
      { programId: PROG_A, amount: 60, lines: [] },
      scopeA(),
    ),
    /a quali periodi/i,
  );
});

test("non si registra una liquidazione su un programma di un altro club", async () => {
  await rejects(
    service.createFundingSettlement(
      { programId: PROG_B, amount: 60, lines: [] },
      scopeA(),
    ),
    /Accesso negato/,
  );
});

test("una liquidazione non crea nessun incasso della famiglia", async () => {
  const { accrual } = await maturaSettembre();

  await service.createFundingSettlement(
    {
      programId: PROG_A,
      amount: 60,
      lines: [{ accrualId: accrual.id, amount: 60 }],
    },
    scopeA(),
  );

  assert.equal(
    fake.rows("paymentTransaction").length,
    0,
    "un contributo pubblico non e un pagamento dell'atleta: confonderli farebbe risultare saldate rate che nessuno ha pagato",
  );
  assert.equal(fake.rows("athletePayment").length, 0);
});

// --- un periodo liquidato non si riscrive ------------------------------------

test("il ricalcolo non tocca un periodo gia liquidato, ma ne conta il plafond", async () => {
  const { enrollment, accrual } = await maturaSettembre();
  await service.createFundingSettlement(
    {
      programId: PROG_A,
      amount: 60,
      lines: [{ accrualId: accrual.id, amount: 60 }],
    },
    scopeA(),
  );

  // Settembre viene svuotato: senza la protezione il maturato tornerebbe a 0.
  fake.rows("clubEventParticipant").splice(0, 4);

  const risultato = await service.recomputeEnrollmentAccruals(
    enrollment.id,
    scopeA(),
    { until: "2025-11-30" },
  );

  const dopo = fake.rows("fundingAccrual").find((row) => row.id === accrual.id);
  assert.equal(dopo.accrued_amount, 60, "l'ente ha versato su questo numero");
  assert.equal(dopo.status, "settled");
  assert.equal(risultato.skippedSettledPeriods, 1);
});

// --- riepilogo per la scheda atleta ------------------------------------------

test("il riepilogo dell'atleta tiene separati i cinque importi", async () => {
  const { enrollment, accrual } = await maturaSettembre();
  await service.createFundingSettlement(
    {
      programId: PROG_A,
      amount: 30,
      lines: [{ accrualId: accrual.id, amount: 30 }],
    },
    scopeA(),
  );

  const overview = await service.getAthleteFundingOverview(
    ATLETA_A,
    scopeA(),
    CLUB_A,
  );

  assert.equal(overview.length, 1);
  assert.equal(overview[0].enrollment.id, enrollment.id);
  assert.equal(overview[0].summary.assignedAmount, 500);
  assert.equal(overview[0].summary.accruedAmount, 60);
  assert.equal(overview[0].summary.settledAmount, 30, "solo questo e cassa");
  assert.equal(overview[0].summary.pendingSettlementAmount, 30);
  assert.equal(overview[0].summary.residualAmount, 440);
  assert.equal(overview[0].summary.unaccruedAmount, 120, "ottobre e novembre");
});

test("il riepilogo di un atleta non si legge dal club sbagliato", async () => {
  await rejects(
    service.getAthleteFundingOverview(ATLETA_A, scopeA(), CLUB_B),
    /Accesso negato/,
  );
});
