import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **W4-C — la liquidazione di un bando si puo finalmente stornare.**
 *
 * Il dominio dei bandi era l'unico dei cinque senza alcun rimedio a un errore:
 * non un `update`, non un `delete`, non una rotta. Una liquidazione registrata
 * per sbaglio restava — e non restava ferma, **propagava**: il periodo passava
 * a `settled`, e da li non si riscriveva piu, non si confermava piu, e
 * l'iscrizione non si cancellava piu. Un bonifico digitato con uno zero di
 * troppo bloccava un periodo per sempre.
 *
 * La forma dello storno non e stata inventata qui: e quella che gli altri tre
 * domini usano gia. Una riga opposta che cita l'originale, l'originale che
 * resta e porta il motivo, e un indice unico parziale che vieta il doppio
 * storno.
 *
 * La cosa che questi test difendono con piu attenzione e la piu facile da
 * sbagliare: **lo stato del periodo si ricalcola, non si indovina.** Rimetterlo
 * a `reported` per decreto sarebbe sbagliato quando un'altra liquidazione lo
 * copre ancora.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "bbbbbbbb-0000-4000-8000-000000000002";
const PROGRAMMA = "pppppppp-0000-4000-8000-00000000p001";
const ACCRUAL_1 = "eeeeeeee-0000-4000-8000-00000000e001";
const ACCRUAL_2 = "eeeeeeee-0000-4000-8000-00000000e002";
const LIQ = "ssssssss-0000-4000-8000-00000000s001";
const CONTO = "cccccccc-0000-4000-8000-00000000c002";

const scope = () => ({
  userId: "11111111-0000-4000-8000-000000000aaa",
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

let funding;
let setPrismaClientForTests;
let fake;

const seed = () => ({
  club: [{ id: CLUB, slug: "club-a", name: "Club A" }],
  financialAccount: [{ id: CONTO, organization_id: CLUB, name: "Banca", kind: "BANK" }],
  fundingProgram: [
    { id: PROGRAMMA, organization_id: CLUB, name: "Voucher Sport 2026", status: "active" },
  ],
  fundingAccrual: [
    {
      id: ACCRUAL_1,
      organization_id: CLUB,
      program_id: PROGRAMMA,
      accrued_amount: 500,
      status: "settled",
    },
    {
      id: ACCRUAL_2,
      organization_id: CLUB,
      program_id: PROGRAMMA,
      accrued_amount: 300,
      status: "settled",
    },
  ],
  fundingSettlement: [
    {
      id: LIQ,
      organization_id: CLUB,
      program_id: PROGRAMMA,
      settled_at: new Date("2026-11-15T00:00:00Z"),
      amount: 800,
      method: "Bonifico",
      reference: "CRO 12345",
      financial_account_id: CONTO,
      reversal_of_id: null,
      reversed_at: null,
      created_by: "11111111-0000-4000-8000-000000000aaa",
    },
  ],
  fundingSettlementLine: [
    {
      id: "l1",
      organization_id: CLUB,
      settlement_id: LIQ,
      accrual_id: ACCRUAL_1,
      amount: 500,
    },
    {
      id: "l2",
      organization_id: CLUB,
      settlement_id: LIQ,
      accrual_id: ACCRUAL_2,
      amount: 300,
    },
  ],
  auditLog: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  funding = await import("../../src/lib/server/funding.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const liquidazioni = () => fake.rows("fundingSettlement");
const righe = () => fake.rows("fundingSettlementLine");
const accrual = (id) => fake.rows("fundingAccrual").find((r) => r.id === id);

/* ==================================================== lo storno funziona */

test("lo storno nasce come riga opposta che cita l'originale", async () => {
  const storno = await funding.reverseFundingSettlement(
    { settlementId: LIQ, reason: "Bonifico attribuito al bando sbagliato" },
    scope(),
  );

  assert.equal(storno.amount, -800);
  assert.equal(storno.reversal_of_id, LIQ);
  assert.equal(storno.notes, "Bonifico attribuito al bando sbagliato");
});

test("l'originale resta, e porta il motivo", async () => {
  await funding.reverseFundingSettlement(
    { settlementId: LIQ, reason: "Errore di digitazione" },
    scope(),
  );

  const originale = liquidazioni().find((r) => r.id === LIQ);
  assert.ok(originale, "il denaro non si cancella");
  assert.ok(originale.reversed_at);
  assert.equal(originale.reversal_reason, "Errore di digitazione");
  assert.equal(originale.amount, 800, "l'importo dell'originale non si riscrive");
});

test("lo storno torna sul conto da cui il denaro era entrato", async () => {
  const storno = await funding.reverseFundingSettlement(
    { settlementId: LIQ, reason: "Errore" },
    scope(),
  );

  assert.equal(storno.financial_account_id, CONTO);
});

test("le righe di ripartizione dello storno rimettono indietro cio che coprivano", async () => {
  const storno = await funding.reverseFundingSettlement(
    { settlementId: LIQ, reason: "Errore" },
    scope(),
  );

  const righeStorno = righe().filter((r) => r.settlement_id === storno.id);
  assert.equal(righeStorno.length, 2);
  assert.deepEqual(
    righeStorno.map((r) => r.amount).sort((a, b) => a - b),
    [-500, -300].sort((a, b) => a - b),
  );
});

/* ============================== lo stato del periodo si ricalcola */

test("il credito torna aperto: i periodi tornano rendicontati", async () => {
  /*
    E il difetto che propagava. Prima dello storno il periodo era `settled` e
    non si toccava piu: ne riscrivere, ne confermare, ne cancellare
    l'iscrizione.
  */
  await funding.reverseFundingSettlement({ settlementId: LIQ, reason: "Errore" }, scope());

  assert.equal(accrual(ACCRUAL_1).status, "reported");
  assert.equal(accrual(ACCRUAL_2).status, "reported");
});

test("un periodo coperto anche da un'altra liquidazione resta liquidato", async () => {
  /*
    Rimetterlo a `reported` per decreto sarebbe sbagliato: quel periodo il
    denaro ce l'ha ancora. Lo stato si **ricalcola** dalla somma di tutte le
    righe che lo riguardano, storno compreso.
  */
  fake.rows("fundingSettlement").push({
    id: "seconda",
    organization_id: CLUB,
    program_id: PROGRAMMA,
    settled_at: new Date("2026-12-01T00:00:00Z"),
    amount: 500,
    reversal_of_id: null,
    reversed_at: null,
  });
  righe().push({
    id: "l3",
    organization_id: CLUB,
    settlement_id: "seconda",
    accrual_id: ACCRUAL_1,
    amount: 500,
  });

  await funding.reverseFundingSettlement({ settlementId: LIQ, reason: "Doppione" }, scope());

  assert.equal(
    accrual(ACCRUAL_1).status,
    "settled",
    "il denaro di questo periodo e arrivato davvero, da un altro bonifico",
  );
  assert.equal(accrual(ACCRUAL_2).status, "reported");
});

/* ================================================ cio che si rifiuta */

test("uno storno non si storna", async () => {
  const storno = await funding.reverseFundingSettlement(
    { settlementId: LIQ, reason: "Errore" },
    scope(),
  );

  await assert.rejects(
    () => funding.reverseFundingSettlement({ settlementId: storno.id, reason: "Ancora" }, scope()),
    /storno non si storna/i,
  );
});

test("niente doppio storno della stessa liquidazione", async () => {
  /*
    Stornare due volte produrrebbe un credito verso l'ente che nessuno ha mai
    riaperto: il registro tornerebbe in attivo di una liquidazione intera. In
    produzione lo vieta anche un indice unico parziale; qui il servizio lo dice
    prima, con un messaggio leggibile.
  */
  await funding.reverseFundingSettlement({ settlementId: LIQ, reason: "Errore" }, scope());

  await assert.rejects(
    () => funding.reverseFundingSettlement({ settlementId: LIQ, reason: "Di nuovo" }, scope()),
    /gia stata stornata/i,
  );

  assert.equal(
    liquidazioni().filter((r) => r.reversal_of_id === LIQ).length,
    1,
  );
});

test("uno storno senza motivo si rifiuta: la riga non spiegherebbe niente", async () => {
  await assert.rejects(
    () => funding.reverseFundingSettlement({ settlementId: LIQ, reason: "  " }, scope()),
    /deve dire perche/i,
  );
});

test("una liquidazione inesistente non si storna", async () => {
  await assert.rejects(
    () => funding.reverseFundingSettlement({ settlementId: "non-esiste", reason: "x" }, scope()),
    /non trovata/i,
  );
});

/* ==================================================== multi-tenant */

test("la liquidazione di un altro club non si storna, e non si legge", async () => {
  const altro = {
    userId: "22222222-0000-4000-8000-000000000bbb",
    activeOrganizationId: ALTRO_CLUB,
    activeRole: "owner",
    allowedOrganizationIds: [ALTRO_CLUB],
  };

  await assert.rejects(
    () => funding.reverseFundingSettlement({ settlementId: LIQ, reason: "x" }, altro),
    /Accesso negato/,
  );

  assert.equal(liquidazioni().find((r) => r.id === LIQ).reversed_at, null);
});

/* ========================================================= l'audit */

test("lo storno lascia una traccia scritta dal servizio, non dalla rotta", async () => {
  /*
    Il resto del dominio bandi scrive l'audit nella rotta, e chiamare il
    servizio da altrove non lascerebbe segno. Il codice nuovo segue il modello
    del lavoro sportivo, che e quello giusto.
  */
  await funding.reverseFundingSettlement({ settlementId: LIQ, reason: "Errore" }, scope());

  const traccia = fake
    .rows("auditLog")
    .find((r) => r.action === "funding.settlement.reversed");

  assert.ok(traccia, "uno storno di denaro senza traccia non e accettabile");
  assert.equal(traccia.resource_id, LIQ);
  assert.equal(traccia.actor_user_id, "11111111-0000-4000-8000-000000000aaa");
});

/* =============================================== il conto in scrittura */

test("una liquidazione nuova dichiara su quale conto e arrivato il bonifico", async () => {
  /* Un periodo ancora scoperto: gli altri due sono gia coperti dalla liquidazione del seme. */
  fake.rows("fundingAccrual").push({
    id: "eeeeeeee-0000-4000-8000-00000000e003",
    organization_id: CLUB,
    program_id: PROGRAMMA,
    accrued_amount: 500,
    status: "reported",
  });

  const creata = await funding.createFundingSettlement(
    {
      programId: PROGRAMMA,
      amount: 500,
      settledAt: "2026-12-10T00:00:00.000Z",
      financialAccountId: CONTO,
      lines: [{ accrualId: "eeeeeeee-0000-4000-8000-00000000e003", amount: 500 }],
    },
    scope(),
  );

  assert.equal(creata.financial_account_id, CONTO);
});
