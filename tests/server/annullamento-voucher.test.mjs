import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Annullare l'assegnazione di un voucher** (N13).
 *
 * ---
 *
 * ## Il fatto, dal collaudo reale
 *
 * Un voucher assegnato, zero periodi maturati, zero liquidazioni — e **nessun
 * modo di annullarlo**. Il servizio sapeva farlo da sempre
 * (`removeFundingEnrollment`), e la sola porta che ci arrivava stava nella
 * scheda del **programma**: chi apriva la scheda dell'**atleta** non aveva
 * niente da premere. E la forma che CLAUDE.md §11.8 chiama per nome — codice
 * completo e irraggiungibile — e questa volta costava il diritto di correggere
 * un errore di assegnazione.
 *
 * ## I tre casi, e perche sono tre
 *
 * | Caso | Cosa e successo | Cosa succede |
 * |---|---|---|
 * | A | niente | l'adesione si **cancella** |
 * | B | maturati dichiarati, o coperture promesse | si **revoca**: `closed`, e lo storico resta |
 * | C | l'ente ha gia **versato** | non si annulla: si storna prima la liquidazione |
 *
 * Il caso C non e una gentilezza. Stornare le coperture mentre il club tiene il
 * denaro dell'ente rimette a carico della famiglia una quota **gia incassata**:
 * lo stesso importo, chiesto due volte.
 *
 * ## La regola sta in una funzione sola
 *
 * `describeEnrollmentRemoval` la applicano il servizio — che decide — e la
 * proiezione della scheda — che lo dice **prima** che qualcuno prema. Due
 * stesure divergerebbero, e chi le scopre e la segreteria davanti a un pulsante
 * che promette una cosa e ne fa un'altra (ADR-0153).
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const PROGRAMMA = "cccccccc-0000-4000-8000-000000000003";
const ANNA = "dddddddd-0000-4000-8000-000000000004";
const BRUNO = "dddddddd-0000-4000-8000-000000000005";
const ADESIONE = "eeeeeeee-0000-4000-8000-000000000001";
const RATA = "ffffffff-0000-4000-8000-000000000001";

let funding;
let model;
let setPrismaClientForTests;
let fake;

before(async () => {
  funding = await import("../../src/lib/server/funding.ts");
  model = await import("../../src/lib/funding/funding-model.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const scope = (overrides = {}) => ({
  userId: "utente-1",
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
  ...overrides,
});

const seed = () => ({
  club: [{ id: CLUB, name: "ASD Alfa" }],
  athlete: [
    { id: ANNA, organization_id: CLUB, first_name: "Anna" },
    /* Un atleta senza adesioni: serve a misurare l'elenco dei bandi assegnabili. */
    { id: BRUNO, organization_id: CLUB, first_name: "Bruno" },
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
      athlete_plafond: 600,
      period_amount: 50,
      period_frequency: "monthly",
      requirement_unit: "hours",
      requirement_min: 8,
      unmet_behavior: "none",
    },
  ],
  fundingEnrollment: [
    {
      id: ADESIONE,
      organization_id: CLUB,
      program_id: PROGRAMMA,
      athlete_id: ANNA,
      assigned_amount: 500,
      status: "active",
      enrolled_at: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  /* La rata da 600 dello scenario del mandato. */
  athletePayment: [
    {
      id: RATA,
      organization_id: CLUB,
      athlete_id: ANNA,
      amount: 600,
      status: "pending",
      data: {},
    },
  ],
  fundingAccrual: [],
  fundingSettlement: [],
  fundingSettlementLine: [],
  paymentCoverageAllocation: [],
  paymentTransaction: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const copri = (amount) =>
  fake.rows("paymentCoverageAllocation").push({
    id: `copertura-${amount}`,
    organization_id: CLUB,
    payment_id: RATA,
    enrollment_id: ADESIONE,
    athlete_id: ANNA,
    amount,
    created_at: new Date("2026-01-05T00:00:00.000Z"),
  });

const maturato = (extra = {}) =>
  fake.rows("fundingAccrual").push({
    id: "maturato-1",
    organization_id: CLUB,
    enrollment_id: ADESIONE,
    period_index: 0,
    period_label: "gennaio 2026",
    accrued_amount: 50,
    eligible_amount: 50,
    status: "accrued",
    data: {},
    ...extra,
  });

/* ------------------------------------------------------- il piano, prima */

test("il dominio dice cosa succedera, e lo dice prima", () => {
  assert.equal(
    model.describeEnrollmentRemoval({}).outcome,
    "delete",
    "niente e successo: si cancella",
  );

  assert.equal(
    model.describeEnrollmentRemoval({
      coverageAllocations: [{ id: "c1", amount: 500 }],
    }).outcome,
    "revoke",
    "una promessa a una famiglia e storico",
  );

  assert.equal(
    model.describeEnrollmentRemoval({
      accruals: [{ status: "reported", accrued_amount: 50 }],
    }).outcome,
    "revoke",
    "cio che e stato dichiarato all'ente e storico",
  );

  assert.equal(
    model.describeEnrollmentRemoval({
      settlementLines: [{ amount: 50 }],
    }).outcome,
    "settled",
    "denaro versato e un'altra cosa ancora",
  );
});

test("una copertura gia stornata resta storico", () => {
  /*
    La chiave esterna dell'adesione sulle coperture e `ON DELETE RESTRICT`:
    cancellarla con delle righe agganciate fallirebbe in archivio, e le
    coperture sarebbero gia state stornate e committate. E il difetto C1 della
    revisione ostile, e la sonda su Postgres e cio che l'ha trovato.
  */
  const piano = model.describeEnrollmentRemoval({
    coverageAllocations: [
      { id: "c1", amount: 500, reversed_at: "2026-02-01T00:00:00.000Z" },
      { id: "c2", amount: -500, reverses_allocation_id: "c1" },
    ],
  });

  assert.equal(piano.outcome, "revoke");
  assert.equal(piano.coverageRowCount, 2);
  assert.equal(piano.liveCoverageCount, 0, "ma nessuna e ancora viva");
});

test("una liquidazione stornata resta storico anche se la somma e zero", () => {
  /*
    **Il reperto F1 della revisione ostile.**

    Lo storno di una liquidazione scrive una riga di segno opposto: la somma
    torna a zero, ma le righe restano — e la chiave esterna che le lega al
    maturato e `ON DELETE RESTRICT`. Decidere sull'**importo** invece che
    sull'**esistenza** faceva rispondere «cancella», il servizio provava a
    cancellare i maturati, l'archivio rifiutava, e a quel punto le coperture
    erano gia state stornate: adesione viva, famiglia tornata a pagare tutto, e
    nessun modo di ritentare.

    E la forma esatta del difetto C1, un vincolo piu in la.
  */
  const piano = model.describeEnrollmentRemoval({
    accruals: [{ status: "accrued", accrued_amount: 50 }],
    settlementLines: [{ amount: 50 }, { amount: -50 }],
  });

  assert.equal(piano.settledAmount, 0, "l'ente non tiene piu niente");
  assert.equal(piano.settlementLineCount, 2, "ma le righe ci sono");
  assert.equal(
    piano.outcome,
    "revoke",
    "e finche ci sono, i maturati non si cancellano",
  );
  assert.match(piano.reasons.join(" "), /registrata e poi stornata/);
});

test("il piano conta quante rate tornerebbero a carico della famiglia", () => {
  const piano = model.describeEnrollmentRemoval({
    coverageAllocations: [
      { id: "c1", amount: 150 },
      { id: "c2", amount: 200 },
    ],
  });

  assert.equal(piano.liveCoverageCount, 2);
  assert.match(piano.reasons.join(" "), /coperture sono state promesse/);
});

/* ------------------------------------------------------------- il caso A */

test("scenario 2 · voucher assegnato, niente maturato: si annulla", async () => {
  const esito = await funding.removeFundingEnrollment(ADESIONE, {}, scope());

  assert.equal(esito.outcome, "deleted");
  assert.equal(esito.plan.outcome, "delete");
  assert.equal(fake.rows("fundingEnrollment").length, 0);
});

test("scenario 8 · con una copertura viva si revoca, e la quota famiglia risale", async () => {
  copri(500);

  const esito = await funding.removeFundingEnrollment(ADESIONE, {}, scope());

  assert.equal(
    esito.outcome,
    "revoked",
    "una promessa fatta a una famiglia non si cancella",
  );
  assert.equal(esito.coverageReversed, 1);
  assert.equal(fake.rows("fundingEnrollment")[0].status, "closed");

  const coperture = fake.rows("paymentCoverageAllocation");
  assert.equal(coperture.length, 2, "l'originale piu il suo storno");
  assert.ok(coperture[0].reversed_at, "l'originale resta, marcata");
  assert.equal(coperture[1].amount, -500);
  assert.equal(coperture[1].reverses_allocation_id, coperture[0].id);
});

test("dopo l'annullamento la famiglia torna a dovere l'intera quota", async () => {
  copri(500);
  await funding.removeFundingEnrollment(ADESIONE, {}, scope());

  const coverage = await import("../../src/lib/payments/coverage-ledger.ts");
  const quadro = coverage.resolveInstallmentCoverage({
    dueAmount: 600,
    allocations: fake.rows("paymentCoverageAllocation"),
    enrollmentCoverage: { [ADESIONE]: 0 },
    enrollmentFunding: { [ADESIONE]: { accruedAmount: 0, settledAmount: 0 } },
  });

  assert.equal(quadro.plannedCoverage, 0);
  assert.equal(quadro.familyDueAmount, 600, "600, come prima del voucher");
});

test("nessun incasso viene toccato dall'annullamento", async () => {
  copri(500);
  fake.rows("paymentTransaction").push({
    id: "movimento-1",
    organization_id: CLUB,
    payment_id: RATA,
    athlete_id: ANNA,
    amount: 50,
    status: "completed",
  });

  await funding.removeFundingEnrollment(ADESIONE, {}, scope());

  assert.equal(fake.rows("paymentTransaction").length, 1);
  assert.equal(
    fake.rows("paymentTransaction")[0].amount,
    50,
    "cio che la famiglia ha gia versato resta dov'e",
  );
});

/* ------------------------------------------------------------- il caso B */

test("scenario 9 · con periodi maturati si revoca, e i maturati restano", async () => {
  maturato({ status: "reported" });

  const esito = await funding.removeFundingEnrollment(ADESIONE, {}, scope());

  assert.equal(esito.outcome, "revoked");
  assert.equal(esito.plan.outcome, "revoke");
  assert.equal(
    fake.rows("fundingAccrual").length,
    1,
    "quei numeri sono stati comunicati a un ente: non si portano via",
  );
  assert.match(esito.plan.reasons.join(" "), /dichiarat/);
});

test("un maturato non ancora dichiarato se ne va con l'assegnazione", async () => {
  maturato();

  const esito = await funding.removeFundingEnrollment(ADESIONE, {}, scope());

  assert.equal(esito.outcome, "deleted");
  assert.equal(
    fake.rows("fundingAccrual").length,
    0,
    "e un risultato derivato dalle presenze: si ricalcola da solo",
  );
});

/* ------------------------------------------------------------- il caso C */

test("scenario 10 · con importi liquidati l'annullamento semplice fallisce", async () => {
  maturato({ status: "settled" });
  fake.rows("fundingSettlementLine").push({
    id: "riga-1",
    organization_id: CLUB,
    accrual_id: "maturato-1",
    amount: 50,
  });
  copri(500);

  await assert.rejects(
    () => funding.removeFundingEnrollment(ADESIONE, {}, scope()),
    /gia liquidato .*non si annulla/s,
    "e il messaggio instrada sullo storno della liquidazione",
  );

  assert.equal(
    fake.rows("fundingEnrollment")[0].status,
    "active",
    "e non lascia l'adesione a meta strada",
  );
  assert.equal(
    fake.rows("paymentCoverageAllocation").length,
    1,
    "ne storna le coperture: il rifiuto arriva prima",
  );
});

test("con il consenso esplicito si chiude comunque, e resta a registro", async () => {
  maturato({ status: "settled" });
  fake.rows("fundingSettlementLine").push({
    id: "riga-1",
    organization_id: CLUB,
    accrual_id: "maturato-1",
    amount: 50,
  });

  const esito = await funding.removeFundingEnrollment(
    ADESIONE,
    { acknowledgeSettled: true, reason: "Atleta uscito dalla societa" },
    scope(),
  );

  assert.equal(esito.outcome, "revoked");
  assert.equal(esito.plan.outcome, "settled");
  assert.equal(esito.plan.settledAmount, 50);
  assert.equal(fake.rows("fundingSettlementLine").length, 1);
});

test("F1 · dopo lo storno di una liquidazione l'adesione si revoca, non si cancella", async () => {
  maturato({ status: "accrued" });
  fake.rows("fundingSettlementLine").push(
    {
      id: "riga-1",
      organization_id: CLUB,
      accrual_id: "maturato-1",
      amount: 50,
    },
    {
      id: "riga-storno",
      organization_id: CLUB,
      accrual_id: "maturato-1",
      amount: -50,
    },
  );

  const esito = await funding.removeFundingEnrollment(ADESIONE, {}, scope());

  assert.equal(
    esito.outcome,
    "revoked",
    "le righe di liquidazione sono agganciate ai maturati con RESTRICT",
  );
  assert.equal(
    fake.rows("fundingAccrual").length,
    1,
    "e i maturati non si cancellano: la cancellazione fallirebbe in archivio",
  );
  assert.equal(fake.rows("fundingSettlementLine").length, 2);
});

test("F1 · e nessun consenso esplicito serve: l'ente non tiene piu niente", async () => {
  maturato({ status: "accrued" });
  fake.rows("fundingSettlementLine").push(
    { id: "r1", organization_id: CLUB, accrual_id: "maturato-1", amount: 50 },
    { id: "r2", organization_id: CLUB, accrual_id: "maturato-1", amount: -50 },
  );

  const esito = await funding.removeFundingEnrollment(ADESIONE, {}, scope());
  assert.equal(esito.plan.outcome, "revoke");
});

/* ------------------------------------------------------------ perimetro */

test("l'allenatore non revoca un voucher", async () => {
  await assert.rejects(
    () =>
      funding.removeFundingEnrollment(ADESIONE, {}, scope({ activeRole: "trainer" })),
    /Accesso negato/,
  );
  assert.equal(fake.rows("fundingEnrollment").length, 1);
});

test("un ruolo personalizzato con la chiave revoca, uno senza no", async () => {
  const { encodeCustomRoleToken } = await import("../../src/lib/access-roles.ts");

  const senzaChiave = encodeCustomRoleToken("custom:club_manager:segreteria", [
    "accounting.read",
  ]);

  await assert.rejects(
    () =>
      funding.removeFundingEnrollment(ADESIONE, {}, scope({ activeRole: senzaChiave })),
    /Accesso negato/,
  );

  const conChiave = encodeCustomRoleToken("custom:club_manager:contributi", [
    "accounting.read",
    "funding.manage",
  ]);

  const esito = await funding.removeFundingEnrollment(
    ADESIONE,
    {},
    scope({ activeRole: conChiave }),
  );
  assert.equal(esito.outcome, "deleted");
});

/* --------------------------------------------- la proiezione lo annuncia */

test("F4 · la proiezione dice al browser se puo decidere", async () => {
  /*
    Il gettone conservato nel browser porta lo slug del ruolo e **non** le sue
    chiavi: un predicato di permesso valutato a schermo risponde `false` a ogni
    ruolo personalizzato, cioe proprio a quelli che questa lane ha reso capaci
    di decidere. La risposta la porta percio il server.
  */
  const { encodeCustomRoleToken } = await import("../../src/lib/access-roles.ts");

  const [comeProprietario] = await funding.getAthleteFundingOverview(
    ANNA,
    scope(),
  );
  assert.equal(comeProprietario.canManage, true);

  const senzaChiave = encodeCustomRoleToken("custom:club_manager:segreteria", [
    "accounting.read",
  ]);
  const [conRuoloRistretto] = await funding.getAthleteFundingOverview(
    ANNA,
    scope({ activeRole: senzaChiave }),
  );
  assert.equal(
    conRuoloRistretto.canManage,
    false,
    "legge i numeri, non decide",
  );

  const conChiave = encodeCustomRoleToken("custom:club_manager:contributi", [
    "accounting.read",
    "funding.manage",
  ]);
  const [conRuoloPieno] = await funding.getAthleteFundingOverview(
    ANNA,
    scope({ activeRole: conChiave }),
  );
  assert.equal(conRuoloPieno.canManage, true);
});

test("F4 · chi non puo iscrivere non riceve programmi a cui iscrivere", async () => {
  const { encodeCustomRoleToken } = await import("../../src/lib/access-roles.ts");

  const conChiave = encodeCustomRoleToken("custom:club_manager:contributi", [
    "accounting.read",
    "funding.manage",
  ]);
  const senzaChiave = encodeCustomRoleToken("custom:club_manager:segreteria", [
    "accounting.read",
  ]);

  const perProprietario = await funding.listEnrollableProgramsForAthlete(
    BRUNO,
    scope(),
  );
  assert.ok(
    perProprietario.length > 0,
    "il proprietario vede il programma a cui Bruno non e iscritto",
  );

  assert.deepEqual(
    await funding.listEnrollableProgramsForAthlete(
      BRUNO,
      scope({ activeRole: senzaChiave }),
    ),
    [],
    "un elenco pieno a chi ricevera 403 al primo clic e un pulsante che promette",
  );

  assert.ok(
    (
      await funding.listEnrollableProgramsForAthlete(
        BRUNO,
        scope({ activeRole: conChiave }),
      )
    ).length > 0,
    "e con la casella spuntata l'elenco torna: e cosi che la schermata lo scopre",
  );
});

test("la scheda dell'atleta riceve il piano insieme ai numeri", async () => {
  copri(500);

  const [overview] = await funding.getAthleteFundingOverview(ANNA, scope());

  assert.ok(overview.removal, "la proiezione porta il piano");
  assert.equal(overview.removal.outcome, "revoke");
  assert.equal(overview.removal.liveCoverageCount, 1);
  assert.equal(
    overview.removal.coverageRowCount,
    1,
    "e lo stesso conteggio che il servizio usera",
  );
});

test("il piano annunciato e quello che il servizio applica", async () => {
  /*
    **La prova che vale piu delle altre**: le due strade devono dare la stessa
    risposta, altrimenti il pulsante promette una cosa e ne fa un'altra.
  */
  for (const preparazione of [
    () => {},
    () => copri(500),
    () => maturato({ status: "reported" }),
  ]) {
    fake = createFakePrisma(seed());
    setPrismaClientForTests(fake.client);
    preparazione();

    const [overview] = await funding.getAthleteFundingOverview(ANNA, scope());
    const annunciato = overview.removal.outcome;

    const esito = await funding.removeFundingEnrollment(ADESIONE, {}, scope());

    assert.equal(
      esito.plan.outcome,
      annunciato,
      "il piano annunciato dalla scheda e quello applicato dal servizio",
    );
    assert.equal(
      esito.outcome,
      annunciato === "delete" ? "deleted" : "revoked",
    );
  }
});
