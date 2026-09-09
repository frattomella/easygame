import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **N7 / N9 — le scritture della copertura, e cio che non scrivono.**
 *
 * La proprieta che tiene insieme tutta la lane e negativa, e per questo va
 * misurata esplicitamente: **allocare una copertura non tocca la cassa.**
 * Nessun `payment_transaction`, nessuno `status` sulla rata, nessuna riga di
 * prima nota. ADR-0037 resta letterale.
 */

const CLUB = "aaaaaaaa-c700-4000-8000-00000000000a";
const ALTRO_CLUB = "aaaaaaaa-c700-4000-8000-00000000000b";
const GESTORE = "11111111-c700-4000-8000-00000000000a";
const MISTER = "11111111-c700-4000-8000-00000000000b";
const ATLETA = "bbbbbbbb-c700-4000-8000-00000000000a";
const ALTRO_ATLETA = "bbbbbbbb-c700-4000-8000-00000000000b";
const RATA = "dddddddd-c700-4000-8000-00000000000a";
const RATA_ALTRUI = "dddddddd-c700-4000-8000-00000000000b";
const PROG = "cccccccc-c700-4000-8000-00000000000a";
const ADESIONE = "eeeeeeee-c700-4000-8000-00000000000a";

let coverage;
let funding;
let setPrismaClientForTests;
let fake;

const scope = (organizationId = CLUB, role = "owner", userId = GESTORE) => ({
  userId,
  activeOrganizationId: organizationId,
  activeRole: role,
  allowedOrganizationIds: [CLUB, ALTRO_CLUB],
  accessScopes: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  coverage = await import("../../src/lib/server/payment-coverage.ts");
  funding = await import("../../src/lib/server/funding.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const seed = (overrides = {}) => ({
  user: [
    { id: GESTORE, email: "gestore@club.it" },
    { id: MISTER, email: "mister@club.it" },
  ],
  club: [
    { id: CLUB, slug: "club", name: "Club", categories: [] },
    { id: ALTRO_CLUB, slug: "altro", name: "Altro", categories: [] },
  ],
  athlete: [
    {
      id: ATLETA,
      organization_id: CLUB,
      first_name: "Sara",
      last_name: "Bianchi",
      status: "active",
      data: {},
    },
    {
      id: ALTRO_ATLETA,
      organization_id: CLUB,
      first_name: "Luca",
      last_name: "Verdi",
      status: "active",
      data: {},
    },
  ],
  athletePayment: [
    {
      id: RATA,
      organization_id: CLUB,
      athlete_id: ATLETA,
      description: "Iscrizione 2026/27",
      amount: 600,
      due_date: new Date("2026-10-31T00:00:00Z"),
      status: "pending",
      paid_at: null,
      method: null,
      data: {},
    },
    {
      id: RATA_ALTRUI,
      organization_id: CLUB,
      athlete_id: ALTRO_ATLETA,
      description: "Iscrizione 2026/27",
      amount: 400,
      due_date: new Date("2026-10-31T00:00:00Z"),
      status: "pending",
      paid_at: null,
      method: null,
      data: {},
    },
  ],
  paymentTransaction: [],
  fundingProgram: [
    {
      id: PROG,
      organization_id: CLUB,
      name: "Voucher Lazio",
      funder_name: "Regione",
      status: "active",
      valid_from: new Date("2026-09-01T00:00:00Z"),
      valid_to: new Date("2027-06-30T00:00:00Z"),
      athlete_plafond: 500,
      period_amount: 60,
      period_frequency: "monthly",
      requirement_unit: "hours",
      requirement_min: 8,
      unmet_behavior: "none",
      accrual_source: "easygame_attendance",
      data: {},
    },
  ],
  fundingEnrollment: [
    {
      id: ADESIONE,
      organization_id: CLUB,
      program_id: PROG,
      athlete_id: ATLETA,
      assigned_amount: 500,
      status: "active",
      enrolled_at: new Date("2026-09-01T00:00:00Z"),
      ends_at: null,
      notes: null,
      data: {},
    },
  ],
  fundingAccrual: [],
  fundingSettlement: [],
  fundingSettlementLine: [],
  paymentCoverageAllocation: [],
  auditLog: [],
  ...overrides,
});

const monta = (overrides) => {
  fake = createFakePrisma(seed(overrides));
  setPrismaClientForTests(fake.client);
};

beforeEach(() => monta());

/* ------------------------------------------------------------------ */
/* La proprieta negativa: la cassa non si tocca                        */
/* ------------------------------------------------------------------ */

test("allocare una copertura non scrive nessun incasso", async () => {
  await coverage.allocateCoverage(
    { paymentId: RATA, enrollmentId: ADESIONE, amount: 500 },
    scope(),
  );

  assert.equal(
    fake.rows("paymentTransaction").length,
    0,
    "e il divieto di ADR-0037, ed e la ragione per cui questa lane esiste",
  );
});

test("allocare una copertura non tocca lo stato della rata", async () => {
  await coverage.allocateCoverage(
    { paymentId: RATA, enrollmentId: ADESIONE, amount: 500 },
    scope(),
  );

  const rata = fake.rows("athletePayment").find((riga) => riga.id === RATA);
  assert.equal(rata.status, "pending");
  assert.equal(rata.paid_at, null);
  assert.equal(rata.method, null);
});

test("il dominio dei pagamenti non importa quello dei bandi, e viceversa", async () => {
  const { readFileSync } = await import("node:fs");
  const senzaCommenti = (testo) =>
    testo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

  const ledger = senzaCommenti(
    readFileSync("src/lib/payments/installment-ledger.ts", "utf8"),
  );
  assert.doesNotMatch(
    ledger,
    /from "@\/lib\/(server\/)?funding/,
    "il registro delle rate non deve sapere cosa sia un contributo (ADR-0037 §5)",
  );

  const coverageLedger = senzaCommenti(
    readFileSync("src/lib/payments/coverage-ledger.ts", "utf8"),
  );
  assert.doesNotMatch(
    coverageLedger,
    /from "@\/lib\/(server\/)?funding/,
    "la composizione legge i due domini, non li importa",
  );
});

/* ------------------------------------------------------------------ */
/* I due tetti, sotto scrittura                                        */
/* ------------------------------------------------------------------ */

test("non si copre la rata oltre il suo importo", async () => {
  await coverage.allocateCoverage(
    { paymentId: RATA, enrollmentId: ADESIONE, amount: 500 },
    scope(),
  );

  await assert.rejects(
    () =>
      coverage.allocateCoverage(
        { paymentId: RATA, enrollmentId: ADESIONE, amount: 200 },
        scope(),
      ),
    /puo ancora essere coperta/,
  );
});

test("non si copre oltre l'importo assegnato dal bando", async () => {
  /*
    Il tetto piu importante: senza, un voucher da 500 coprirebbe 5.000 di rate.
  */
  await coverage.allocateCoverage(
    { paymentId: RATA, enrollmentId: ADESIONE, amount: 500 },
    scope(),
  );

  monta({
    paymentCoverageAllocation: fake.rows("paymentCoverageAllocation"),
    athletePayment: [
      ...seed().athletePayment,
      {
        id: "rata-2",
        organization_id: CLUB,
        athlete_id: ATLETA,
        description: "Seconda rata",
        amount: 300,
        status: "pending",
        data: {},
      },
    ],
  });

  await assert.rejects(
    () =>
      coverage.allocateCoverage(
        { paymentId: "rata-2", enrollmentId: ADESIONE, amount: 100 },
        scope(),
      ),
    /non ancora impegnati/,
  );
});

/* ------------------------------------------------------------------ */
/* Idempotenza                                                         */
/* ------------------------------------------------------------------ */

test("lo stesso invio, due volte, lascia una copertura sola", async () => {
  const invio = () =>
    coverage.allocateCoverage(
      {
        paymentId: RATA,
        enrollmentId: ADESIONE,
        amount: 300,
        idempotencyKey: "clic-1",
      },
      scope(),
    );

  await invio();
  await invio();

  const vive = fake
    .rows("paymentCoverageAllocation")
    .filter((riga) => !riga.reverses_allocation_id);

  assert.equal(vive.length, 1, "il doppio clic non promette due volte");
});

test("due gesti diversi sulla stessa rata restano due coperture", async () => {
  await coverage.allocateCoverage(
    { paymentId: RATA, enrollmentId: ADESIONE, amount: 200, idempotencyKey: "a" },
    scope(),
  );
  await coverage.allocateCoverage(
    { paymentId: RATA, enrollmentId: ADESIONE, amount: 100, idempotencyKey: "b" },
    scope(),
  );

  assert.equal(fake.rows("paymentCoverageAllocation").length, 2);
});

/* ------------------------------------------------------------------ */
/* Perimetro e IDOR                                                    */
/* ------------------------------------------------------------------ */

test("il voucher di un atleta non copre la rata di un altro", async () => {
  await assert.rejects(
    () =>
      coverage.allocateCoverage(
        { paymentId: RATA_ALTRUI, enrollmentId: ADESIONE, amount: 100 },
        scope(),
      ),
    /Accesso negato/,
    "attribuirebbe a una famiglia il contributo di un'altra",
  );
});

test("una rata di un altro club non si copre", async () => {
  await assert.rejects(
    () =>
      coverage.allocateCoverage(
        { paymentId: RATA, enrollmentId: ADESIONE, amount: 100 },
        scope(ALTRO_CLUB),
      ),
    /Accesso negato/,
  );
});

test("l'allenatore non alloca coperture", async () => {
  await assert.rejects(
    () =>
      coverage.allocateCoverage(
        { paymentId: RATA, enrollmentId: ADESIONE, amount: 100 },
        scope(CLUB, "trainer", MISTER),
      ),
    /Accesso negato/,
    "la copertura di una rata la decide chi tiene i conti",
  );
});

test("su un'adesione revocata non si promette copertura", async () => {
  monta();
  fake.rows("fundingEnrollment")[0].status = "closed";

  await assert.rejects(
    () =>
      coverage.allocateCoverage(
        { paymentId: RATA, enrollmentId: ADESIONE, amount: 100 },
        scope(),
      ),
    /non e attiva/,
  );
});

/* ------------------------------------------------------------------ */
/* Storno                                                              */
/* ------------------------------------------------------------------ */

test("stornare non cancella: marca l'originale e scrive la riga opposta", async () => {
  const { allocation } = await coverage.allocateCoverage(
    { paymentId: RATA, enrollmentId: ADESIONE, amount: 500 },
    scope(),
  );

  await coverage.reverseCoverage(
    { allocationId: allocation.id, reason: "Voucher rifiutato dall'ente" },
    scope(),
  );

  const righe = fake.rows("paymentCoverageAllocation");
  assert.equal(righe.length, 2, "lo storico resta");

  const originale = righe.find((riga) => riga.id === allocation.id);
  assert.ok(originale.reversed_at, "l'originale e marcato");

  const storno = righe.find((riga) => riga.reverses_allocation_id === allocation.id);
  assert.equal(storno.amount, -500, "la riga opposta elide la prima");
});

test("uno storno non si storna, e non si storna due volte", async () => {
  const { allocation } = await coverage.allocateCoverage(
    { paymentId: RATA, enrollmentId: ADESIONE, amount: 500 },
    scope(),
  );
  const { allocation: storno } = await coverage.reverseCoverage(
    { allocationId: allocation.id },
    scope(),
  );

  await assert.rejects(
    () => coverage.reverseCoverage({ allocationId: allocation.id }, scope()),
    /gia stata stornata/,
  );
  await assert.rejects(
    () => coverage.reverseCoverage({ allocationId: storno.id }, scope()),
    /Uno storno non si storna/,
  );
});

test("dopo lo storno la rata torna a essere coperta per zero", async () => {
  const { allocation } = await coverage.allocateCoverage(
    { paymentId: RATA, enrollmentId: ADESIONE, amount: 500 },
    scope(),
  );
  await coverage.reverseCoverage({ allocationId: allocation.id }, scope());

  const { sumLiveCoverage, normalizeCoverageAllocations } = await import(
    "../../src/lib/payments/coverage-ledger.ts"
  );

  assert.equal(
    sumLiveCoverage(
      normalizeCoverageAllocations(
        await coverage.listCoverageForPayment(RATA, scope()),
      ),
    ),
    0,
  );
});

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

test("allocare e stornare lasciano due righe di audit distinte", async () => {
  const { allocation } = await coverage.allocateCoverage(
    { paymentId: RATA, enrollmentId: ADESIONE, amount: 500 },
    scope(),
  );
  await coverage.reverseCoverage({ allocationId: allocation.id }, scope());

  const azioni = fake.rows("auditLog").map((riga) => riga.action);
  assert.ok(azioni.includes("payment.coverage.allocated"));
  assert.ok(azioni.includes("payment.coverage.reversed"));
});

/* ------------------------------------------------------------------ */
/* N9 — togliere l'atleta dal programma                                */
/* ------------------------------------------------------------------ */

test("N9 · togliere l'atleta storna le coperture, e la famiglia torna a dovere tutto", async () => {
  /*
    E il difetto che senza questa lane sarebbe stato il piu costoso del blocco:
    un atleta tolto dal programma lasciava dietro di se le allocazioni, e quelle
    continuano a ridurre la quota a carico della famiglia. Il club avrebbe
    smesso di chiedere denaro che nessun ente stava piu portando.
  */
  await coverage.allocateCoverage(
    { paymentId: RATA, enrollmentId: ADESIONE, amount: 500 },
    scope(),
  );

  const esito = await funding.removeFundingEnrollment(
    ADESIONE,
    { reason: "Atleta ritirato" },
    scope(),
  );

  /*
    **Corretta dopo la revisione ostile (C1).**

    Qui si pretendeva `deleted`, e passava solo perche il doppio di Prisma non
    fa valere le chiavi esterne. Su Postgres vero la cancellazione **viola**
    `payment_coverage_allocations_enrollment_id_fkey`, che e `RESTRICT`: le
    righe di storno continuano a nominare l'adesione. Il risultato reale era un
    500, con le coperture gia stornate e committate e l'iscrizione ancora viva
    — e irremovibile per sempre, perche al secondo tentativo di coperture vive
    non ce n'erano piu.

    Aver **promesso** una copertura a una famiglia e storico quanto aver
    rendicontato un maturato: un'adesione che ha coperto delle rate si revoca.
  */
  assert.equal(
    esito.outcome,
    "revoked",
    "una copertura promessa e storico: non si cancella",
  );
  assert.equal(esito.coverageReversed, 1, "una copertura stornata");
  assert.equal(
    fake.rows("fundingEnrollment").length,
    1,
    "l'adesione resta, revocata: nessuna violazione di chiave esterna",
  );
  assert.equal(fake.rows("fundingEnrollment")[0].status, "closed");

  const { sumLiveCoverage, normalizeCoverageAllocations } = await import(
    "../../src/lib/payments/coverage-ledger.ts"
  );
  assert.equal(
    sumLiveCoverage(
      normalizeCoverageAllocations(fake.rows("paymentCoverageAllocation")),
    ),
    0,
    "la quota famiglia risale",
  );
});

test("N9 · con storico l'adesione si revoca, e le coperture si stornano lo stesso", async () => {
  monta({
    fundingAccrual: [
      {
        id: "acc-1",
        organization_id: CLUB,
        enrollment_id: ADESIONE,
        period_index: 0,
        period_start: new Date("2026-09-01T00:00:00Z"),
        period_end: new Date("2026-09-30T00:00:00Z"),
        period_label: "Settembre",
        accrued_amount: 60,
        status: "reported",
        data: {},
      },
    ],
  });

  await coverage.allocateCoverage(
    { paymentId: RATA, enrollmentId: ADESIONE, amount: 300 },
    scope(),
  );

  const esito = await funding.removeFundingEnrollment(
    ADESIONE,
    { reason: "Atleta ritirato a stagione iniziata" },
    scope(),
  );

  assert.equal(esito.outcome, "revoked", "lo storico del bando non si cancella");
  assert.equal(esito.coverageReversed, 1);

  assert.equal(
    fake.rows("fundingAccrual").length,
    1,
    "cio che l'atleta ha maturato resta un fatto verso l'ente",
  );
});

test("N9 · togliere un atleta senza coperture non storna niente", async () => {
  const esito = await funding.removeFundingEnrollment(ADESIONE, {}, scope());

  assert.equal(esito.outcome, "deleted");
  assert.equal(esito.coverageReversed, 0);
});
