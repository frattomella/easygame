import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import { readFileSync } from "node:fs";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **I reperti della revisione ostile sul dominio della copertura.**
 *
 * Ognuno era una porta aperta o un numero sbagliato che le trentasei prove
 * scritte insieme alla correzione non vedevano. La ragione ricorre: le prove
 * di chi corregge misurano cio che aveva in mente.
 */

const CLUB = "aaaaaaaa-d800-4000-8000-00000000000a";
const ALTRO_CLUB = "aaaaaaaa-d800-4000-8000-00000000000b";
const GESTORE = "11111111-d800-4000-8000-00000000000a";
const MISTER = "11111111-d800-4000-8000-00000000000b";
const ATLETA = "bbbbbbbb-d800-4000-8000-00000000000a";
const RATA = "dddddddd-d800-4000-8000-00000000000a";
const RATA_ANNULLATA = "dddddddd-d800-4000-8000-00000000000c";
const PROG = "cccccccc-d800-4000-8000-00000000000a";
const ADESIONE = "eeeeeeee-d800-4000-8000-00000000000a";

let coverage;
let setPrismaClientForTests;
let fake;

const scope = (overrides = {}) => ({
  userId: GESTORE,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB, ALTRO_CLUB],
  accessScopes: [],
  ...overrides,
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  coverage = await import("../../src/lib/server/payment-coverage.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const rata = (id, amount, overrides = {}) => ({
  id,
  organization_id: CLUB,
  athlete_id: ATLETA,
  description: "Rata",
  amount,
  status: "pending",
  data: {},
  ...overrides,
});

const seed = () => ({
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
  ],
  athletePayment: [
    rata(RATA, 600),
    /* Una rata rigenerata dal piano: annullata ed esclusa dai totali. */
    rata(RATA_ANNULLATA, 600, {
      status: "cancelled",
      data: { excludedFromTotals: true },
    }),
  ],
  paymentTransaction: [],
  fundingProgram: [
    {
      id: PROG,
      organization_id: CLUB,
      name: "Voucher",
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
      data: {},
    },
  ],
  fundingAccrual: [],
  fundingSettlement: [],
  fundingSettlementLine: [],
  paymentCoverageAllocation: [],
  auditLog: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

/* ------------------------------------------------------------------ */
/* C2 — una copertura su una rata annullata non impegna piu il voucher */
/* ------------------------------------------------------------------ */

test("C2 · rigenerato il piano, il voucher torna disponibile", async () => {
  /*
    `syncAthleteEnrollmentInstallmentPayments` non cancella le rate: le marca
    `cancelled` con `excludedFromTotals` e ne crea di nuove. Le coperture
    restavano agganciate alle vecchie e continuavano a **consumare il
    plafond**: su un voucher gia impegnato per intero la segreteria non poteva
    piu coprire le rate nuove, e l'unica riga da stornare stava su una rata che
    la scheda non mostra piu.
  */
  await coverage.allocateCoverage(
    { paymentId: RATA_ANNULLATA, enrollmentId: ADESIONE, amount: 500 },
    scope(),
  );

  /* La rata nuova si copre lo stesso: il voucher non e piu bloccato. */
  const { allocation } = await coverage.allocateCoverage(
    { paymentId: RATA, enrollmentId: ADESIONE, amount: 500 },
    scope(),
  );

  assert.equal(Number(allocation.amount), 500);
});

test("C2 · il controspecchio: su rate vive il tetto tiene", async () => {
  await coverage.allocateCoverage(
    { paymentId: RATA, enrollmentId: ADESIONE, amount: 500 },
    scope(),
  );

  fake.rows("athletePayment").push(rata("rata-nuova", 300));

  await assert.rejects(
    () =>
      coverage.allocateCoverage(
        { paymentId: "rata-nuova", enrollmentId: ADESIONE, amount: 100 },
        scope(),
      ),
    /non ancora impegnati/,
  );
});

/* ------------------------------------------------------------------ */
/* H5 / M6 — leggere le coperture e un permesso, e vuole un club        */
/* ------------------------------------------------------------------ */

test("H5 · l'allenatore non legge le coperture di una famiglia", async () => {
  /*
    Sapere quali rate un voucher alleggerisce, e per quanto, e un'affermazione
    sulla situazione economica di una famiglia. `funding.ts` protegge la stessa
    lettura da quando una revisione ha trovato ogni `GET` sotto
    `/api/v1/funding` aperta a chiunque appartenesse al club; qui la porta era
    di nuovo assente.
  */
  await assert.rejects(
    () =>
      coverage.listCoverageForAthlete(
        ATLETA,
        scope({ activeRole: "trainer", userId: MISTER }),
      ),
    /Accesso negato/,
  );
});

test("M6 · senza club attivo la lettura fallisce chiusa, non aperta", async () => {
  /*
    Il filtro per club spariva quando lo scope non ne portava uno — e
    `resolveOrganizationScopeForUser` lo risolve a `null` per un utente
    autenticato senza tessere. Per lui uscivano le righe di **tutti** i club.
  */
  await assert.rejects(
    () =>
      coverage.listCoverageForAthlete(
        ATLETA,
        scope({ activeOrganizationId: null }),
      ),
    /Accesso negato/,
  );
});

test("M5 · la capienza non si legge su un club che non e il proprio", async () => {
  await assert.rejects(
    () =>
      coverage.readCoverageCapacity(
        RATA,
        ADESIONE,
        scope({ activeOrganizationId: ALTRO_CLUB }),
      ),
    /Accesso negato/,
  );
});

test("il controspecchio: chi tiene i conti legge", async () => {
  await coverage.allocateCoverage(
    { paymentId: RATA, enrollmentId: ADESIONE, amount: 100 },
    scope(),
  );

  const righe = await coverage.listCoverageForAthlete(ATLETA, scope());
  assert.equal(righe.length, 1);
});

/* ------------------------------------------------------------------ */
/* H3 — il tetto per adesione si serializza sull'adesione              */
/* ------------------------------------------------------------------ */

test("H3 · l'adesione si blocca prima della rata", () => {
  /*
    Due coperture su **rate diverse** della stessa adesione prendevano due
    blocchi disgiunti, leggevano entrambe zero impegnato su un voucher da 500 e
    scrivevano entrambe: ottocento allocati su cinquecento, senza nessun
    vincolo d'archivio dietro, perche il tetto e una somma.

    La correttezza sotto concorrenza vera la misura una sonda su Postgres; qui
    si blocca la **forma**: il blocco sull'adesione esiste, e viene preso per
    primo.
  */
  const sorgente = readFileSync("src/lib/server/payment-coverage.ts", "utf8");

  const bloccoAdesione = sorgente.indexOf("FROM funding_enrollments");
  const bloccoRata = sorgente.indexOf("lockInstallmentAndTransaction(client, paymentId)");

  assert.ok(bloccoAdesione > 0, "l'adesione si deve bloccare");
  assert.ok(
    bloccoAdesione < bloccoRata,
    "e prima della rata: due ordini diversi sugli stessi blocchi sono un abbraccio mortale (ADR-0138)",
  );
});

test("H3 · rata e adesione si rileggono dentro la transazione", () => {
  const sorgente = readFileSync("src/lib/server/payment-coverage.ts", "utf8");

  assert.match(sorgente, /const chargeFresca = await client\.athletePayment\.findUnique/);
  assert.match(
    sorgente,
    /assignedAmount: enrollmentFresca\.assigned_amount/,
    "una riduzione concorrente dell'assegnato non deve passare inosservata",
  );
});

/* ------------------------------------------------------------------ */
/* H4 — la chiave di idempotenza non inghiotte un secondo gesto         */
/* ------------------------------------------------------------------ */

test("H4 · due gesti distinti sono due promesse", async () => {
  /*
    La chiave era `rata:adesione:importo`, senza nonce: allocare 50 e poi altri
    50 dava la stessa chiave, e il secondo invio tornava indietro come
    duplicato — con l'avviso di successo e la copertura ferma a 50.
  */
  await coverage.allocateCoverage(
    { paymentId: RATA, enrollmentId: ADESIONE, amount: 50, idempotencyKey: "gesto-1" },
    scope(),
  );
  await coverage.allocateCoverage(
    { paymentId: RATA, enrollmentId: ADESIONE, amount: 50, idempotencyKey: "gesto-2" },
    scope(),
  );

  const { sumLiveCoverage, normalizeCoverageAllocations } = await import(
    "../../src/lib/payments/coverage-ledger.ts"
  );

  assert.equal(
    sumLiveCoverage(
      normalizeCoverageAllocations(fake.rows("paymentCoverageAllocation")),
    ),
    100,
  );
});

test("H4 · e lo stesso gesto, due volte, resta una promessa sola", async () => {
  const invio = () =>
    coverage.allocateCoverage(
      {
        paymentId: RATA,
        enrollmentId: ADESIONE,
        amount: 50,
        idempotencyKey: "stesso-gesto",
      },
      scope(),
    );

  await invio();
  await invio();

  assert.equal(fake.rows("paymentCoverageAllocation").length, 1);
});

test("H4 · la finestra genera una chiave per tentativo", () => {
  const finestra = readFileSync(
    "src/components/payments/CoverageDialog.tsx",
    "utf8",
  );

  assert.match(finestra, /chiaveTentativo\.current/);
  assert.match(
    finestra,
    /crypto\.randomUUID/,
    "la chiave nasce dal gesto, non dall'importo",
  );
});

/* ------------------------------------------------------------------ */
/* H2 — online si paga la quota della famiglia                          */
/* ------------------------------------------------------------------ */

test("H2 · il residuo mostrato e quello della famiglia, e il checkout lo segue", () => {
  const lista = readFileSync(
    "src/components/payments/InstallmentLedgerList.tsx",
    "utf8",
  );

  /*
    **La riduzione alla quota della famiglia si e spostata nel dominio** (N14).

    Qui la lista sostituiva a mano il solo residuo, e stato, etichette e barra
    restavano quelli lordi: una rata coperta e saldata per la sua parte diceva
    «Residuo 0,00» accanto a «PARZIALMENTE PAGATA · SCADUTA». Adesso la riga la
    riduce `withFamilyShare`, che ricalcola **tutto** cio che dipende dai due
    importi con le funzioni che gia lo calcolano.

    Cio che questo test difende non cambia: il residuo mostrato, e quello su cui
    si apre il checkout, sono quelli della famiglia.
  */
  assert.match(
    lista,
    /const ledger = withFamilyShare\(lordo, coverage\);\s*\n\s*const residuoFamiglia = ledger\.residualAmount;/,
  );
  assert.match(
    lista,
    /onPayOnline && residuoFamiglia > 0/,
    "su una rata coperta e saldata dalla famiglia il pulsante non deve comparire",
  );

  const scheda = readFileSync(
    "src/components/payments/AthletePaymentLedger.tsx",
    "utf8",
  );
  assert.match(
    scheda,
    /ledger\.withFamilyShare\(installment\)/,
    "il checkout limita all'importo della rata che riceve: deve ricevere la quota della famiglia",
  );
});

/* ------------------------------------------------------------------ */
/* H6 — il rendiconto non conta due volte lo stesso denaro              */
/* ------------------------------------------------------------------ */

test("H6 · il credito verso le famiglie non comprende cio che porta un ente", () => {
  const report = readFileSync("src/lib/server/accounting-reports.ts", "utf8");

  assert.match(report, /coperturaSuiCrediti/);
  assert.match(
    report,
    /familyReceivablesCents: toCents\(\s*Math\.max\(0, Number\(rateTotali\.residualAmount\) - coperturaSuiCrediti\)/,
  );
  assert.match(
    report,
    /coveredReceivablesCents/,
    "e cio che si toglie va dichiarato, non fatto sparire",
  );
});
