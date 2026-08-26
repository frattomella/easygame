import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * La conferma di maturazione, a runtime (ADR-0054).
 *
 * **Cosa deve restare vero.** Su un programma la cui frequenza ufficiale si
 * registra fuori da EasyGame, un appello salvato qui non puo produrre un
 * credito verso l'ente. Il ricalcolo aggiorna la previsione; il credito nasce
 * quando qualcuno dichiara cosa l'ente ha riconosciuto, e quella dichiarazione
 * porta con se data, autore e riferimento.
 *
 * **Cosa non deve poter succedere.** Confermare piu dell'importo assegnato al
 * club. Rendicontare una previsione. Vedersi riscrivere una conferma da un
 * ricalcolo. Perdere lo storico di una correzione.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "bbbbbbbb-0000-4000-8000-000000000002";
const PROG_ESTERNO = "11111111-0000-4000-8000-00000000000a";
const PROG_EASYGAME = "22222222-0000-4000-8000-00000000000b";
const ATLETA = "33333333-0000-4000-8000-00000000000c";

const scope = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB,
  allowedOrganizationIds: [CLUB],
});

const scopeAltro = () => ({
  userId: "user-b",
  activeOrganizationId: ALTRO_CLUB,
  allowedOrganizationIds: [ALTRO_CLUB],
});

let service;
let setPrismaClientForTests;
let fake;

const programma = (id, overrides = {}) => ({
  id,
  organization_id: CLUB,
  name: "Contributo frequenza",
  funder_name: "Ente",
  status: "active",
  valid_from: new Date("2026-09-01T00:00:00Z"),
  valid_to: new Date("2026-11-30T00:00:00Z"),
  athlete_plafond: 500,
  accrual_source: "external_confirmation",
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
  created_at: new Date("2026-08-01T00:00:00Z"),
  updated_at: new Date("2026-08-01T00:00:00Z"),
  ...overrides,
});

const allenamento = (id, date, start, end) => ({
  id: `row-${id}`,
  organization_id: CLUB,
  resource_type: "trainings",
  payload: { id, date, startTime: start, endTime: end },
  date,
});

const presenza = (trainingId) => ({
  id: `att-${trainingId}`,
  organization_id: CLUB,
  training_id: trainingId,
  athlete_id: ATLETA,
  status: "present",
});

/** Settembre: 8 ore, cioe soglia raggiunta secondo EasyGame. */
const seed = () => ({
  fundingProgram: [
    programma(PROG_ESTERNO),
    programma(PROG_EASYGAME, { accrual_source: "easygame_attendance" }),
  ],
  fundingEnrollment: [],
  fundingAccrual: [],
  fundingSettlement: [],
  fundingSettlementLine: [],
  clubResourceItem: [
    allenamento("s1", "2026-09-02", "17:00", "19:00"),
    allenamento("s2", "2026-09-09", "17:00", "19:00"),
    allenamento("s3", "2026-09-16", "17:00", "19:00"),
    allenamento("s4", "2026-09-23", "17:00", "19:00"),
  ],
  trainingAttendance: [
    presenza("s1"),
    presenza("s2"),
    presenza("s3"),
    presenza("s4"),
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

const iscrivi = (programId = PROG_ESTERNO, assignedAmount = 300) =>
  service.createFundingEnrollment(
    { programId, athleteId: ATLETA, assignedAmount },
    scope(),
  );

const ricalcola = (enrollmentId) =>
  service.recomputeEnrollmentAccruals(enrollmentId, scope(), {
    until: "2026-11-30",
  });

const periodiDi = (enrollmentId) =>
  fake
    .rows("fundingAccrual")
    .filter((row) => row.enrollment_id === enrollmentId)
    .sort((left, right) => left.period_index - right.period_index);

/* ------------------------------------ l'assegnato entro il massimale */

test("l'importo assegnato al club puo essere meno del massimale", async () => {
  const iscrizione = await iscrivi(PROG_ESTERNO, 300);

  assert.equal(iscrizione.assigned_amount, 300);
  assert.equal(
    fake.rows("fundingProgram")[0].athlete_plafond,
    500,
    "il massimale resta sul programma",
  );
});

test("l'importo assegnato non supera il massimale del programma", async () => {
  await assert.rejects(
    iscrivi(PROG_ESTERNO, 600),
    /supera il massimale del programma/i,
  );
});

/* ------------------------------------ previsione, non maturazione */

test("con la fonte esterna il ricalcolo non fa maturare niente", async () => {
  const iscrizione = await iscrivi();
  await ricalcola(iscrizione.id);

  const periodi = periodiDi(iscrizione.id);
  const settembre = periodi[0];

  assert.equal(settembre.requirement_met, true, "8 ore su 8: previsione vera");
  assert.equal(settembre.estimated_amount, 60, "la previsione vale 60");
  assert.equal(settembre.accrued_amount, 0, "ma non e un credito");
  assert.equal(settembre.status, "pending_confirmation");
  assert.equal(settembre.accrual_origin, null);
});

test("con la fonte EasyGame lo stesso appello matura subito", async () => {
  const iscrizione = await iscrivi(PROG_EASYGAME, 300);
  await ricalcola(iscrizione.id);

  const settembre = periodiDi(iscrizione.id)[0];

  assert.equal(settembre.accrued_amount, 60);
  assert.equal(settembre.status, "accrued");
  assert.equal(settembre.accrual_origin, "easygame_attendance");
});

/* ------------------------------------------------- la conferma */

test("la conferma trasforma la previsione in maturato", async () => {
  const iscrizione = await iscrivi();
  await ricalcola(iscrizione.id);

  const settembre = periodiDi(iscrizione.id)[0];
  await service.confirmAccrualPeriods(
    {
      enrollmentId: iscrizione.id,
      confirmations: [
        {
          accrualId: settembre.id,
          amount: 60,
          externalReference: "PROT-114",
          notes: "prospetto di ottobre",
        },
      ],
    },
    scope(),
  );

  const confermato = periodiDi(iscrizione.id)[0];

  assert.equal(confermato.accrued_amount, 60);
  assert.equal(confermato.status, "accrued");
  assert.equal(confermato.accrual_origin, "manual_confirmation");
  assert.equal(confermato.external_reference, "PROT-114");
  assert.equal(confermato.confirmation_notes, "prospetto di ottobre");
  assert.equal(confermato.confirmed_by, "user-a");
  assert.ok(confermato.confirmed_at instanceof Date);
});

test("l'ente puo riconoscere meno della previsione", async () => {
  const iscrizione = await iscrivi();
  await ricalcola(iscrizione.id);

  await service.confirmAccrualPeriods(
    {
      enrollmentId: iscrizione.id,
      confirmations: [{ periodIndex: 0, amount: 45 }],
    },
    scope(),
  );

  const confermato = periodiDi(iscrizione.id)[0];

  assert.equal(confermato.estimated_amount, 60, "la previsione resta leggibile");
  assert.equal(confermato.accrued_amount, 45);
});

test("una conferma non supera l'importo assegnato al club", async () => {
  const iscrizione = await iscrivi(PROG_ESTERNO, 100);
  await ricalcola(iscrizione.id);

  await assert.rejects(
    service.confirmAccrualPeriods(
      {
        enrollmentId: iscrizione.id,
        confirmations: [
          { periodIndex: 0, amount: 60 },
          { periodIndex: 1, amount: 60 },
        ],
      },
      scope(),
    ),
    /oltre l'importo assegnato al club/i,
  );
});

test("il tetto guarda il totale, non la singola riga", async () => {
  const iscrizione = await iscrivi(PROG_ESTERNO, 100);
  await ricalcola(iscrizione.id);

  await service.confirmAccrualPeriods(
    {
      enrollmentId: iscrizione.id,
      confirmations: [{ periodIndex: 0, amount: 60 }],
    },
    scope(),
  );

  // 60 gia confermati piu 60 sarebbero 120 su 100 assegnati.
  await assert.rejects(
    service.confirmAccrualPeriods(
      {
        enrollmentId: iscrizione.id,
        confirmations: [{ periodIndex: 1, amount: 60 }],
      },
      scope(),
    ),
    /oltre l'importo assegnato al club/i,
  );
});

test("non si conferma a mano su un programma a presenze EasyGame", async () => {
  const iscrizione = await iscrivi(PROG_EASYGAME, 300);
  await ricalcola(iscrizione.id);

  await assert.rejects(
    service.confirmAccrualPeriods(
      {
        enrollmentId: iscrizione.id,
        confirmations: [{ periodIndex: 0, amount: 60 }],
      },
      scope(),
    ),
    /si ricalcola, non si conferma a mano/i,
  );
});

test("non si conferma un periodo di un altro club", async () => {
  const iscrizione = await iscrivi();
  await ricalcola(iscrizione.id);

  await assert.rejects(
    service.confirmAccrualPeriods(
      {
        enrollmentId: iscrizione.id,
        confirmations: [{ periodIndex: 0, amount: 60 }],
      },
      scopeAltro(),
    ),
    /Accesso negato/i,
  );
});

test("una conferma senza periodi non e una conferma", async () => {
  const iscrizione = await iscrivi();

  await assert.rejects(
    service.confirmAccrualPeriods(
      { enrollmentId: iscrizione.id, confirmations: [] },
      scope(),
    ),
    /Indica quali periodi/i,
  );
});

/* ---------------------------------------- il ricalcolo rispetta la conferma */

test("un ricalcolo non riscrive una conferma gia registrata", async () => {
  const iscrizione = await iscrivi();
  await ricalcola(iscrizione.id);

  await service.confirmAccrualPeriods(
    {
      enrollmentId: iscrizione.id,
      confirmations: [{ periodIndex: 0, amount: 45 }],
    },
    scope(),
  );

  await ricalcola(iscrizione.id);

  const settembre = periodiDi(iscrizione.id)[0];

  assert.equal(settembre.accrued_amount, 45, "il numero dichiarato resta");
  assert.equal(settembre.status, "accrued");
  assert.equal(settembre.accrual_origin, "manual_confirmation");
  assert.equal(
    settembre.estimated_amount,
    60,
    "ma la previsione si aggiorna comunque",
  );
});

test("una correzione conserva la conferma precedente nello storico", async () => {
  const iscrizione = await iscrivi();
  await ricalcola(iscrizione.id);

  await service.confirmAccrualPeriods(
    {
      enrollmentId: iscrizione.id,
      confirmations: [{ periodIndex: 0, amount: 60, externalReference: "P-1" }],
    },
    scope(),
  );
  await service.confirmAccrualPeriods(
    {
      enrollmentId: iscrizione.id,
      confirmations: [{ periodIndex: 0, amount: 45, externalReference: "P-2" }],
    },
    scope(),
  );

  const settembre = periodiDi(iscrizione.id)[0];

  assert.equal(settembre.accrued_amount, 45);
  assert.equal(settembre.data.previousConfirmations.length, 1);
  assert.equal(settembre.data.previousConfirmations[0].amount, 60);
  assert.equal(settembre.data.previousConfirmations[0].externalReference, "P-1");
});

/* ------------------------------------------------ rendicontazione */

test("una previsione non si rendiconta", async () => {
  const iscrizione = await iscrivi();
  await ricalcola(iscrizione.id);

  const settembre = periodiDi(iscrizione.id)[0];

  await assert.rejects(
    service.markAccrualsReported([settembre.id], scope()),
    /conferma la maturazione prima di rendicontarlo/i,
  );
});

test("dopo la conferma il periodo si rendiconta", async () => {
  const iscrizione = await iscrivi();
  await ricalcola(iscrizione.id);

  await service.confirmAccrualPeriods(
    {
      enrollmentId: iscrizione.id,
      confirmations: [{ periodIndex: 0, amount: 60 }],
    },
    scope(),
  );

  const settembre = periodiDi(iscrizione.id)[0];
  const rendicontati = await service.markAccrualsReported(
    [settembre.id],
    scope(),
  );

  assert.equal(rendicontati[0].status, "reported");
});

test("correggere una conferma riapre la rendicontazione", async () => {
  const iscrizione = await iscrivi();
  await ricalcola(iscrizione.id);

  await service.confirmAccrualPeriods(
    {
      enrollmentId: iscrizione.id,
      confirmations: [{ periodIndex: 0, amount: 60 }],
    },
    scope(),
  );
  await service.markAccrualsReported([periodiDi(iscrizione.id)[0].id], scope());

  await service.confirmAccrualPeriods(
    {
      enrollmentId: iscrizione.id,
      confirmations: [{ periodIndex: 0, amount: 30 }],
    },
    scope(),
  );

  const settembre = periodiDi(iscrizione.id)[0];

  assert.equal(settembre.status, "accrued");
  assert.equal(settembre.reported_at, null, "cio che era dichiarato non vale piu");
});

/* ------------------------------------------------------- import */

test("l'import scrive le conferme con la provenienza giusta", async () => {
  const iscrizione = await iscrivi();
  await ricalcola(iscrizione.id);

  const esito = await service.importAccrualConfirmations(
    {
      enrollmentId: iscrizione.id,
      text: ["periodo;importo;riferimento", "settembre 2026;60,00;PROT-9"].join(
        "\n",
      ),
    },
    scope(),
  );

  assert.equal(esito.accruals.length, 1);
  assert.deepEqual(esito.rejected, []);

  const settembre = periodiDi(iscrizione.id)[0];
  assert.equal(settembre.accrued_amount, 60);
  assert.equal(settembre.accrual_origin, "external_import");
  assert.equal(settembre.external_reference, "PROT-9");
});

test("le righe non importabili tornano indietro elencate", async () => {
  const iscrizione = await iscrivi();
  await ricalcola(iscrizione.id);

  const esito = await service.importAccrualConfirmations(
    {
      enrollmentId: iscrizione.id,
      text: ["settembre 2026;60,00", "marzo 2030;60,00", "ottobre 2026;boh"].join(
        "\n",
      ),
    },
    scope(),
  );

  assert.equal(esito.accruals.length, 1);
  assert.equal(esito.rejected.length, 2);
});

test("non si importa su un programma a presenze EasyGame", async () => {
  const iscrizione = await iscrivi(PROG_EASYGAME, 300);
  await ricalcola(iscrizione.id);

  await assert.rejects(
    service.importAccrualConfirmations(
      { enrollmentId: iscrizione.id, text: "settembre 2026;60,00" },
      scope(),
    ),
    /non si importano conferme/i,
  );
});

/* --------------------------------------------- il riepilogo dell'atleta */

test("il riepilogo dell'atleta mostra previsione e maturato separati", async () => {
  const iscrizione = await iscrivi();
  await ricalcola(iscrizione.id);

  await service.confirmAccrualPeriods(
    {
      enrollmentId: iscrizione.id,
      confirmations: [{ periodIndex: 0, amount: 60 }],
    },
    scope(),
  );

  const [panoramica] = await service.getAthleteFundingOverview(
    ATLETA,
    scope(),
    CLUB,
  );

  assert.equal(panoramica.summary.assignedAmount, 300);
  assert.equal(panoramica.summary.accruedAmount, 60);
  assert.equal(
    panoramica.summary.pendingConfirmationPeriodCount,
    2,
    "ottobre e novembre restano da confermare",
  );
  assert.equal(panoramica.summary.residualAmount, 240);
});
