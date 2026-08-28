import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { readFileSync } from "node:fs";
import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Due incassi sulla stessa rata, nello stesso istante.
 *
 * **Il difetto, misurato sullo staging.** Sei richieste concorrenti da 50 €
 * su una rata con 99,80 € di residuo: **quattro** sono state accettate. Alla
 * fine il club aveva incassato 300,00 € su una rata da 199,80 €, e su un'altra
 * 150,00 € su 130,00 €. Nessuno aveva sbagliato a digitare: il controllo di
 * capienza leggeva il registro **prima** di aprire la transazione, quindi
 * ogni richiesta vedeva la rata com'era prima che le altre scrivessero.
 *
 * Due segretarie sullo stesso incasso, un telefono e un computer, una
 * richiesta ritentata dalla rete: bastava questo.
 *
 * Un secondo sintomo dello stesso difetto: la prima rata restava
 * `partially_paid` in archivio pur avendo incassato 150 su 130, perche il
 * ricalcolo dello stato girava anch'esso su una lettura vecchia.
 *
 * Qui la corsa vera non si puo riprodurre — il doppio di Prisma non ha
 * concorrenza. Si riproduce cio che la corsa **fa**: fra il controllo e la
 * scrittura, il registro cambia. Con il controllo fuori dalla transazione
 * l'incasso passava; con il controllo dentro, dopo il blocco della riga, no.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const RATA = "11111111-0000-4000-8000-00000000000a";

const scope = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB,
  allowedOrganizationIds: [CLUB],
});

let service;
let setPrismaClientForTests;
let fake;

const seed = () => ({
  athletePayment: [
    {
      id: RATA,
      organization_id: CLUB,
      athlete_id: "atleta-1",
      description: "Quota annuale - Rata 1",
      amount: 130,
      due_date: new Date("2027-01-15T00:00:00Z"),
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

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  service = await import("../../src/lib/server/payment-transactions.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const registra = (amount) =>
  service.createPaymentTransaction(
    {
      paymentId: RATA,
      amount,
      paymentMethod: "Contanti",
      paidAt: "2026-08-28T10:00:00.000Z",
    },
    scope(),
  );

/**
 * L'incasso concorrente arriva **dopo** che il chiamante ha deciso di
 * registrare, e **prima** che scriva: e esattamente la finestra che la
 * transazione deve chiudere.
 */
const conIncassoConcorrente = (amount) => {
  const originale = fake.client.$transaction.bind(fake.client);
  let gia = false;
  fake.client.$transaction = async (input) => {
    if (!gia && typeof input === "function") {
      gia = true;
      fake.rows("paymentTransaction").push({
        id: "concorrente",
        organization_id: CLUB,
        athlete_id: "atleta-1",
        payment_id: RATA,
        amount,
        paid_at: new Date("2026-08-28T09:59:59.000Z"),
        payment_method: "Contanti",
        notes: null,
        source: "MANUAL",
        external_reference: null,
        created_by: null,
        reversed_at: null,
        data: {},
        created_at: new Date("2026-08-28T09:59:59.000Z"),
        updated_at: new Date("2026-08-28T09:59:59.000Z"),
      });
    }
    return originale(input);
  };
};

test("un incasso scritto nel frattempo toglie capienza a quello in corso", async () => {
  conIncassoConcorrente(100);

  await assert.rejects(registra(50), (error) => {
    assert.match(String(error.message), /supera il residuo della rata/);
    return true;
  });

  const scritti = fake
    .rows("paymentTransaction")
    .filter((row) => row.payment_id === RATA);

  assert.equal(scritti.length, 1, "resta solo l'incasso concorrente");
  assert.equal(
    scritti.reduce((total, row) => total + row.amount, 0),
    100,
    "sulla rata da 130 non si incassano 150",
  );
});

test("finche c'e capienza l'incasso passa", async () => {
  conIncassoConcorrente(50);

  const result = await registra(50);

  assert.equal(result.transaction.amount, 50);
  assert.equal(
    fake
      .rows("paymentTransaction")
      .filter((row) => row.payment_id === RATA)
      .reduce((total, row) => total + row.amount, 0),
    100,
  );
});

/**
 * Il blocco di riga e cio che rende serio il controllo: senza, due
 * transazioni in `READ COMMITTED` leggono entrambe il registro pre-inserimento
 * e passano entrambe. Con `FOR UPDATE` sulla rata, la seconda aspetta la
 * prima. E il blocco e **sulla riga**, non sulla tabella: rate diverse non si
 * ostacolano.
 */
test("la rata viene bloccata prima di leggere il registro", async () => {
  const eseguiti = [];
  fake.client.$queryRaw = async (strings, ...values) => {
    eseguiti.push({ sql: strings.join("?"), values });
    return [];
  };

  await registra(50);

  assert.equal(eseguiti.length, 1, "un blocco di riga, uno solo");
  assert.match(eseguiti[0].sql, /SELECT id FROM payments WHERE id = /);
  assert.match(eseguiti[0].sql, /FOR UPDATE/);
  assert.deepEqual(
    eseguiti[0].values,
    [RATA],
    "il blocco e sulla riga della rata, non sulla tabella",
  );
});

/**
 * Un errore di forma — importo a zero, metodo mancante — non deve nemmeno
 * aprire una transazione: si vede senza guardare l'archivio.
 */
test("un importo non valido si ferma prima della transazione", async () => {
  await assert.rejects(registra(0), (error) => {
    assert.match(String(error.message), /maggiore di zero/);
    return true;
  });

  assert.equal(fake.rows("paymentTransaction").length, 0);
  assert.equal(
    fake.calls.filter((call) => call.method === "create").length,
    0,
    "nessuna scrittura per un importo che non e un importo",
  );
});

/**
 * Lo stesso difetto, sugli altri due modi di muovere denaro.
 *
 * Uno **storno** leggeva `reversed_at` prima di aprire la transazione: due
 * storni simultanei dello stesso incasso lo vedevano entrambi vuoto e
 * scrivevano entrambi il movimento di compensazione — la rata tornava
 * indietro due volte.
 */
test("un incasso stornato nel frattempo non si storna una seconda volta", async () => {
  const incasso = await registra(50);
  const id = incasso.transaction.id;

  const originale = fake.client.$transaction.bind(fake.client);
  let gia = false;
  fake.client.$transaction = async (input) => {
    if (!gia && typeof input === "function") {
      gia = true;
      const row = fake
        .rows("paymentTransaction")
        .find((candidate) => candidate.id === id);
      row.reversed_at = new Date("2026-08-28T10:00:01.000Z");
    }
    return originale(input);
  };

  await assert.rejects(
    service.reversePaymentTransaction({ transactionId: id }, scope()),
    (error) => {
      assert.match(String(error.message), /gia stato stornato/);
      return true;
    },
  );

  assert.equal(
    fake.rows("paymentTransaction").filter((row) => row.amount < 0).length,
    0,
    "nessun movimento di compensazione doppio",
  );
});

/**
 * E il rimborso: Stripe consegna lo stesso rimborso piu volte, e due consegne
 * simultanee vedevano entrambe «non l'ho ancora registrato».
 */
test("la deduplica del rimborso si rifa dentro la transazione", () => {
  const source = readFileSync(
    new URL("../../src/lib/server/payment-transactions.ts", import.meta.url),
    "utf8",
  );

  // Le tre operazioni che muovono denaro bloccano la riga su cui decidono.
  assert.equal(
    (source.match(/FOR UPDATE`/g) || []).length,
    3,
    "incasso, storno e rimborso devono bloccare la riga prima di decidere",
  );

  const refund = source.slice(source.indexOf("export const recordRefundTransaction"));
  const body = refund.slice(0, refund.indexOf("export type MarkRefundRequestedInput"));
  const lock = body.indexOf("FOR UPDATE`");
  const dedup = body.indexOf("const alreadyWritten =");
  const capienza = body.indexOf("const refundedSoFar =");
  const create = body.indexOf("client.paymentTransaction.create");

  assert.ok(lock > 0 && dedup > lock, "la deduplica viene dopo il blocco");
  assert.ok(capienza > dedup, "la capienza viene dopo la deduplica");
  assert.ok(create > capienza, "si scrive per ultimo");
});
