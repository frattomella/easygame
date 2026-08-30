import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Lo scenario della richiesta, dall'inizio alla fine (Blocco Finale C, punto 14).
 *
 * Una rata da 130 euro, incassata in tre volte con tre metodi diversi, e poi
 * uno storno in mezzo. E il caso che la segreteria vive davvero, ed e il caso
 * in cui i difetti chiusi da [ADR-0036](../../docs/knowledge-base/18-decision-log.md)
 * si vedevano: lo stato della rata **dichiarato** invece che ricavato, e il
 * metodo di pagamento scritto a mano su un campo di testo.
 *
 * **Perche un test solo e non nove.** I singoli passaggi sono gia coperti da
 * `installment-ledger` e `payment-transactions`. Quello che qui si prova e la
 * **catena**: che il residuo dopo il terzo incasso sia zero *e* che lo storno
 * del secondo riporti la rata a parzialmente pagata con il residuo giusto.
 * Sono i due punti in cui un errore di arrotondamento o un ordinamento
 * sbagliato si accumulano invece di annullarsi.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const RATA = "11111111-0000-4000-8000-00000000000a";

const scope = () => ({
  userId: "segreteria",
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

let service;
let documents;
let ledger;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  service = await import("../../src/lib/server/payment-transactions.ts");
  documents = await import("../../src/lib/server/fiscal-documents.ts");
  ledger = await import("../../src/lib/payments/installment-ledger.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma({
    athletePayment: [
      {
        id: RATA,
        organization_id: CLUB,
        athlete_id: "atleta-1",
        description: "Quota annuale - Rata 1",
        amount: 130,
        due_date: new Date("2026-09-30T00:00:00Z"),
        paid_at: null,
        status: "pending",
        method: null,
        reference: null,
        notes: null,
        data: { installmentId: "plan-rata-1", installmentLabel: "Rata 1" },
        created_at: new Date("2026-08-01T10:00:00Z"),
        updated_at: new Date("2026-08-01T10:00:00Z"),
      },
    ],
    paymentTransaction: [],
  });
  setPrismaClientForTests(fake.client);
});

const incassa = (amount, paymentMethod, paidAt, notes) =>
  service.createPaymentTransaction(
    { paymentId: RATA, amount, paymentMethod, paidAt, notes },
    scope(),
  );

const statoDellaRata = async () => {
  const transactions = await service.listPaymentTransactions(
    { paymentId: RATA },
    scope(),
  );
  const charge = fake.rows("athletePayment").find((row) => row.id === RATA);

  return {
    charge,
    ledger: ledger.resolveInstallmentLedger({ charge, transactions }),
    transactions,
  };
};

test("130 euro in tre incassi, poi uno storno: il residuo torna indietro", async () => {
  /* ---------------------------------------- 1. cinquanta in contanti */

  await incassa(50, "Contanti", "2026-09-01T09:00:00.000Z", "Acconto in sede");

  let stato = await statoDellaRata();
  assert.equal(stato.ledger.state, "partial", "50 su 130 non e «pagata»");
  assert.equal(stato.ledger.paidAmount, 50);
  assert.equal(stato.ledger.residualAmount, 80);

  /* ------------------------------------------- 2. trenta con carta */

  const conCarta = await incassa(
    30,
    "Carta",
    "2026-09-10T09:00:00.000Z",
    "Pagamento POS",
  );

  stato = await statoDellaRata();
  assert.equal(stato.ledger.state, "partial");
  assert.equal(stato.ledger.residualAmount, 50);

  /* ----------------------------------------- 3. cinquanta con bonifico */

  await incassa(50, "Bonifico", "2026-09-20T09:00:00.000Z", "Bonifico 20/09");

  stato = await statoDellaRata();
  assert.equal(stato.ledger.state, "paid", "130 su 130 e saldata");
  assert.equal(stato.ledger.residualAmount, 0);
  assert.ok(
    stato.charge.paid_at,
    "una rata saldata porta la data in cui lo e diventata",
  );

  /* -------------------------------- lo storico, prima dello storno */

  assert.deepEqual(
    stato.ledger.transactions.map((movimento) => [
      movimento.amount,
      movimento.paymentMethod,
    ]),
    [
      [50, "Contanti"],
      [30, "Carta"],
      [50, "Bonifico"],
    ],
    "tre metodi diversi, nell'ordine in cui il denaro e arrivato",
  );
  assert.deepEqual(
    stato.ledger.transactions.map((movimento) => movimento.notes),
    ["Acconto in sede", "Pagamento POS", "Bonifico 20/09"],
    "le note restano attaccate al loro movimento",
  );

  /* ------------------------------------- 4. storno dell'incasso da 30 */

  await service.reversePaymentTransaction(
    { transactionId: conCarta.transaction.id, reason: "Carta rifiutata" },
    scope(),
  );

  stato = await statoDellaRata();
  assert.equal(
    stato.ledger.state,
    "partial",
    "stornare 30 su una rata saldata la riporta a parzialmente pagata",
  );
  assert.equal(stato.ledger.paidAmount, 100);
  assert.equal(stato.ledger.residualAmount, 30);
  assert.equal(
    stato.charge.paid_at,
    null,
    "una rata che non e piu saldata non puo conservare la data in cui lo era",
  );
});

test("lo storno non cancella niente: aggiunge il movimento che compensa", async () => {
  await incassa(50, "Contanti", "2026-09-01T09:00:00.000Z");
  const conCarta = await incassa(30, "Carta", "2026-09-10T09:00:00.000Z");
  await incassa(50, "Bonifico", "2026-09-20T09:00:00.000Z");

  await service.reversePaymentTransaction(
    { transactionId: conCarta.transaction.id, reason: "Carta rifiutata" },
    scope(),
  );

  const stato = await statoDellaRata();

  assert.equal(
    stato.transactions.length,
    4,
    "tre incassi piu lo storno: la storia non si riscrive, si allunga",
  );

  const originale = stato.transactions.find(
    (movimento) => movimento.id === conCarta.transaction.id,
  );
  assert.ok(originale, "l'incasso stornato resta nello storico");
  assert.ok(originale.reversedAt, "e porta scritto quando e stato stornato");

  const storno = stato.transactions.find(
    (movimento) => movimento.reversesTransactionId === conCarta.transaction.id,
  );
  assert.ok(storno, "esiste il movimento di compensazione");
  assert.equal(storno.amount, -30, "e vale meno trenta, non trenta");
});

test("gli incassi restano in ordine cronologico anche registrandoli a ritroso", async () => {
  await incassa(50, "Bonifico", "2026-09-20T09:00:00.000Z");
  await incassa(50, "Contanti", "2026-09-01T09:00:00.000Z");
  await incassa(30, "Carta", "2026-09-10T09:00:00.000Z");

  const stato = await statoDellaRata();

  assert.deepEqual(
    stato.ledger.transactions.map((movimento) => movimento.paymentMethod),
    ["Contanti", "Carta", "Bonifico"],
    "un estratto conto in ordine di inserimento non e un estratto conto",
  );
  assert.equal(stato.ledger.state, "paid");
});

test("una ricevuta si emette per incasso, ed e idempotente", async () => {
  const primo = await incassa(50, "Contanti", "2026-09-01T09:00:00.000Z");

  const ricevuta = await documents.issueReceiptForTransaction(
    { transactionId: primo.transaction.id },
    scope(),
  );
  const ristampa = await documents.issueReceiptForTransaction(
    { transactionId: primo.transaction.id },
    scope(),
  );

  assert.equal(
    ricevuta.id,
    ristampa.id,
    "chiederla due volte non deve consumare un secondo numero",
  );
  assert.equal(
    fake.rows("receipt").length,
    1,
    "una ricevuta per incasso, non una per richiesta",
  );
});
