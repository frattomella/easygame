import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { readFileSync } from "node:fs";
import path from "node:path";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Lo stato di una rata non si scrive: si ricava.**
 *
 * ADR-0036 dice che una rata e un debito e un incasso e un movimento, e che
 * lo stato della rata e una **copia** del registro degli incassi. Il servizio
 * `payment-transactions.ts` lo rispettava, ed era coperto. Restavano aperte
 * due porte laterali, trovate nel Blocco E provandole davvero:
 *
 * 1. la **risorsa generica**. `PATCH /api/v1/payments/:id {"status":"paid"}`
 *    scriveva la colonna come qualunque altra: la rata risultava saldata
 *    senza un euro incassato, e accanto `data.ledger` continuava a dire
 *    «parziale, residuo 30». Il record si contraddiceva da solo, e il campo
 *    sbagliato e quello che riepiloghi, Movimenti, report e area genitore
 *    leggono;
 * 2. la **rotta dedicata** `PATCH /api/athlete-payments/:id` con
 *    `action: "update"`, che accettava `updates.status` e in piu metteva una
 *    data di pagamento quando il valore era «paid».
 *
 * `cancelled` resta scrivibile, e non e un'eccezione di comodo: annullare una
 * rata non e dire che e stata incassata, e dire che quel debito non esiste
 * piu. Lo fa la sostituzione del piano di pagamento, ed e la stessa
 * distinzione che il ricalcolo gia rispetta quando si rifiuta di sovrascrivere
 * una rata annullata.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const RATA = "11111111-0000-4000-8000-00000000000a";
const ATLETA = "99999999-0000-4000-8000-000000000009";

const scope = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB,
  allowedOrganizationIds: [CLUB],
});

let resources;
let setPrismaClientForTests;
let fake;

const seed = () => ({
  club: [{ id: CLUB, slug: "club-a", name: "Club A" }],
  athlete: [{ id: ATLETA, organization_id: CLUB, first_name: "Anna", last_name: "Rossi" }],
  athletePayment: [
    {
      id: RATA,
      organization_id: CLUB,
      athlete_id: ATLETA,
      description: "Quota annuale - Rata 1",
      amount: 130,
      due_date: new Date("2026-09-30T00:00:00Z"),
      paid_at: null,
      status: "partially_paid",
      method: "Contanti",
      notes: null,
      data: {
        ledger: {
          dueAmount: 130,
          paidAmount: 100,
          residualAmount: 30,
          state: "partial",
          transactionCount: 2,
        },
      },
    },
  ],
  paymentTransaction: [],
  auditLog: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  resources = await import("../../src/lib/server/resources.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const rata = () => fake.rows("athletePayment").find((row) => row.id === RATA);

/* ------------------------------------------- la risorsa generica non scrive */

test("un PATCH generico non puo dichiarare pagata una rata scoperta", async () => {
  await resources.updateResource("payments", RATA, { status: "paid" }, scope());

  assert.equal(
    rata().status,
    "partially_paid",
    "lo stato deve restare quello ricavato dagli incassi",
  );
});

test("nemmeno all'indietro: una rata pagata non torna scoperta da un PATCH", async () => {
  fake.rows("athletePayment")[0].status = "paid";

  await resources.updateResource("payments", RATA, { status: "pending" }, scope());

  assert.equal(rata().status, "paid");
});

test("il tentativo lascia una riga di audit negata", async () => {
  await resources.updateResource("payments", RATA, { status: "paid" }, scope());

  const negati = fake
    .rows("auditLog")
    .filter((row) => row.outcome === "denied" && row.resource === "payment_state");

  assert.equal(negati.length, 1, "un tentativo vero va registrato");
  assert.deepEqual(negati[0].metadata?.rejectedFields, ["status"]);
});

test("un salvataggio che rimanda lo stato invariato non e un tentativo", async () => {
  await resources.updateResource(
    "payments",
    RATA,
    { status: "partially_paid", notes: "richiamata la famiglia" },
    scope(),
  );

  assert.equal(rata().status, "partially_paid");
  assert.equal(rata().notes, "richiamata la famiglia", "il resto del salvataggio passa");
  assert.equal(
    fake.rows("auditLog").filter((row) => row.resource === "payment_state").length,
    0,
    "chi non stava cambiando lo stato non va accusato di averci provato",
  );
});

test("annullare una rata resta possibile: non e dire che e stata incassata", async () => {
  await resources.updateResource("payments", RATA, { status: "cancelled" }, scope());

  assert.equal(rata().status, "cancelled");
});

/* ------------------------------------------------ e non nasce gia pagata */

test("una rata non puo nascere gia pagata", async () => {
  const creata = await resources.createResource(
    "payments",
    {
      id: "22222222-0000-4000-8000-00000000000b",
      organization_id: CLUB,
      athlete_id: ATLETA,
      description: "Rata che vorrebbe nascere saldata",
      amount: 99,
      status: "paid",
    },
    scope(),
  );

  assert.equal(creata.status, "pending", "il registro non ha ancora nulla da dire");
});

test("una rata nuova puo nascere scoperta senza far rumore", async () => {
  await resources.createResource(
    "payments",
    {
      id: "33333333-0000-4000-8000-00000000000c",
      organization_id: CLUB,
      athlete_id: ATLETA,
      description: "Rata normale",
      amount: 50,
      status: "pending",
    },
    scope(),
  );

  assert.equal(
    fake.rows("auditLog").filter((row) => row.resource === "payment_state").length,
    0,
  );
});

/* ------------------------------------- la rotta dedicata non accetta lo stato */

test("la rotta delle rate non legge piu lo stato dal client", () => {
  /*
    Invariante sul codice e non sul comportamento: la rotta scrive con Prisma
    dentro un handler HTTP, e cio che va impedito e che `updates.status`
    torni a essere una fonte. Il ricalcolo dal registro, invece, deve
    restarci: cambiare l'importo di una rata cambia il debito, quindi puo
    cambiarne lo stato.
  */
  const source = readFileSync(
    path.join(process.cwd(), "src/app/api/athlete-payments/[paymentId]/route.ts"),
    "utf8",
  );

  assert.doesNotMatch(
    source,
    /updates.status/,
    "lo stato di una rata non arriva dal client, nemmeno da questa rotta",
  );
  assert.match(
    source,
    /recomputeChargeFromLedger/,
    "dopo una modifica dell'importo lo stato va ricavato di nuovo dagli incassi",
  );
});
