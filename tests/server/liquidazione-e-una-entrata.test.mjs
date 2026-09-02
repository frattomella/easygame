import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Il bonifico dell'ente e un'entrata, e il percorso di scrittura lo negava.**
 *
 * `createFundingSettlement` faceva passare la causale da
 * `resolveOutboundClassification`, che rifiuta ogni causale dichiarata in
 * entrata. Il seme, dal canto suo, dichiarava `liquidazione_contributo` in
 * uscita. I due errori si tenevano in piedi a vicenda, e insieme producevano
 * due danni:
 *
 * 1. il rendiconto per voce sommava un **incasso** dentro un capitolo di
 *    uscita («Contributi liquidati»);
 * 2. la guardia era invertita: un club che avesse voluto classificare
 *    correttamente il bonifico con una causale in entrata riceveva un errore.
 *    L'unica classificazione ammessa era quella sbagliata.
 *
 * Che il denaro entri lo dicono tre punti indipendenti del prodotto — lo
 * schema («su quale conto e ARRIVATO il bonifico dell'ente»), la proiezione
 * del registro e la vista SQL, che sul verso leggono entrambe il segno
 * dell'importo — e nessuno dei tre e mai passato da `direction_hint`.
 *
 * Qui si prova il percorso di scrittura: che la causale corretta sia accettata
 * e congelata sulla riga, che quella del verso opposto sia rifiutata, e che lo
 * **storno** — che ha segno opposto e quindi verso opposto — continui a
 * ereditare la fotografia invece di ricalcolarla.
 */

const CLUB = "aaaaaaaa-fs01-4000-8000-000000000001";
const PROGRAMMA = "11111111-fs01-4000-8000-00000000000a";
const MATURATO = "22222222-fs01-4000-8000-00000000000b";

const scope = () => ({
  userId: "33333333-fs01-4000-8000-00000000000c",
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

let funding;
let fiscal;
let setPrismaClientForTests;
let fake;

const seed = () => ({
  fundingProgram: [
    {
      id: PROGRAMMA,
      organization_id: CLUB,
      name: "Voucher per lo Sport 2026",
      funder_name: "Regione",
      status: "active",
      valid_from: new Date("2025-09-01T00:00:00Z"),
      valid_to: new Date("2026-06-30T00:00:00Z"),
      athlete_plafond: 500,
      period_amount: 60,
      period_frequency: "monthly",
      requirement_unit: "hours",
      requirement_min: 8,
      unmet_behavior: "none",
      data: {},
    },
  ],
  /* Il maturato appartiene al bando attraverso la sua iscrizione. */
  fundingEnrollment: [
    { id: "iscrizione-1", organization_id: CLUB, program_id: PROGRAMMA },
  ],
  fundingAccrual: [
    {
      id: MATURATO,
      organization_id: CLUB,
      program_id: PROGRAMMA,
      enrollment_id: "iscrizione-1",
      period_index: 0,
      accrued_amount: 100,
      status: "reported",
    },
  ],
  fundingSettlement: [],
  fundingSettlementLine: [],
  fiscalOperationType: [],
  accountingEntry: [],
  paymentTransaction: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  funding = await import("../../src/lib/server/funding.ts");
  fiscal = await import("../../src/lib/server/fiscal-config.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(async () => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
  /* Il catalogo del club, seminato come lo semina il prodotto. */
  await fiscal.listOperationTypes(CLUB);
});

const liquida = (extra = {}) =>
  funding.createFundingSettlement(
    {
      programId: PROGRAMMA,
      amount: 100,
      settledAt: "2026-05-10",
      reference: "MANDATO-2026-1",
      lines: [{ accrualId: MATURATO, amount: 100 }],
      ...extra,
    },
    scope(),
  );

test("il ripiego classifica la liquidazione, e non viene piu rifiutato", async () => {
  const settlement = await liquida();

  const riga = fake.rows("fundingSettlement").find((row) => row.id === settlement.id);

  assert.equal(riga.operation_type_code, "liquidazione_contributo");
  assert.equal(
    riga.operation_type_label_snapshot,
    "Liquidazione di contributo o voucher",
  );
  assert.equal(riga.activity_scope_snapshot, "unspecified");
  assert.ok(riga.amount > 0, "una liquidazione ha importo positivo: e un incasso");
});

test("la causale della liquidazione e dichiarata in entrata nel catalogo del club", async () => {
  const elenco = await fiscal.listOperationTypes(CLUB);
  const voce = elenco.find((riga) => riga.code === "liquidazione_contributo");

  assert.equal(voce.directionHint, "IN");
  assert.ok(voce.reportingBucket);
  assert.equal(
    /liquidat/i.test(voce.reportingBucket),
    false,
    "la voce di rendiconto leggeva come un capitolo di spesa",
  );
});

test("una causale in uscita su un incasso da ente e un errore, non un avviso", async () => {
  await assert.rejects(
    () => liquida({ operationTypeCode: "compenso_sportivo" }),
    /prevista per le uscite/,
  );

  assert.equal(
    fake.rows("fundingSettlement").length,
    0,
    "il rifiuto deve avvenire prima di scrivere: una riga mal classificata falsa il rendiconto",
  );
});

test("una causale scelta dal club, purche non contraddica il verso, vince sul ripiego", async () => {
  await fiscal.saveOperationType({
    organizationId: CLUB,
    code: "contributo_regione",
    updates: {
      label: "Contributo Regione",
      directionHint: "IN",
      reportingBucket: "Contributi regionali",
      activityScope: "institutional",
    },
    actorUserId: scope().userId,
  });

  const settlement = await liquida({ operationTypeCode: "contributo_regione" });
  const riga = fake.rows("fundingSettlement").find((row) => row.id === settlement.id);

  assert.equal(riga.operation_type_code, "contributo_regione");
  assert.equal(riga.operation_type_label_snapshot, "Contributo Regione");
  assert.equal(riga.activity_scope_snapshot, "institutional");
});

/**
 * **Lo storno regge il verso opposto sulla stessa tabella.**
 *
 * Ha importo negativo, quindi il registro lo conta fra le uscite, e resta
 * sulla stessa causale dichiarata in entrata. Non e una contraddizione: il
 * verso suggerito appartiene al **fatto** — «l'ente ha liquidato» — non alla
 * singola riga, e lo storno non risolve niente. Eredita la fotografia della
 * riga che annulla, cosi le due si elidono sotto la stessa voce.
 *
 * Se la guardia fosse agganciata al segno della riga, lo storno avrebbe avuto
 * bisogno di una causale diversa e la voce di rendiconto non sarebbe piu
 * tornata a zero.
 */
test("lo storno eredita la fotografia, non la ricalcola", async () => {
  const settlement = await liquida();

  /* La causale viene rinominata e riclassificata DOPO la liquidazione. */
  await fiscal.saveOperationType({
    organizationId: CLUB,
    code: "liquidazione_contributo",
    updates: {
      label: "Contributi da enti pubblici",
      activityScope: "commercial",
    },
    actorUserId: scope().userId,
  });

  await funding.reverseFundingSettlement(
    { settlementId: settlement.id, reason: "Mandato revocato dall'ente" },
    scope(),
  );

  const storno = fake
    .rows("fundingSettlement")
    .find((row) => row.reversal_of_id === settlement.id);
  const originale = fake
    .rows("fundingSettlement")
    .find((row) => row.id === settlement.id);

  assert.ok(storno, "lo storno non e stato scritto");
  assert.ok(storno.amount < 0, "lo storno ha segno opposto: il registro lo conta in uscita");

  assert.equal(storno.operation_type_code, originale.operation_type_code);
  assert.equal(
    storno.operation_type_label_snapshot,
    "Liquidazione di contributo o voucher",
    "la fotografia e quella del momento della liquidazione, non l'etichetta corrente",
  );
  assert.equal(storno.activity_scope_snapshot, originale.activity_scope_snapshot);
  assert.equal(storno.activity_scope_snapshot, "unspecified");
});
