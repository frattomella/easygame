import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Lo stesso incasso registrato due volte dallo stesso clic** (`AUD-F1`).
 *
 * Il blocco di riga sulla rata chiude il **sovraincasso** — tre clic su una
 * rata da 130 non incassano 150 — e non chiudeva la **duplicazione dentro la
 * capienza**: rata da 130, la segreteria registra 50, il clic parte due volte
 * per rete lenta, e restano due righe da 50. Cento euro accreditati per un
 * versamento da cinquanta, e nessuna delle due righe distinguibile da un
 * incasso vero.
 *
 * Misurato contro PostgreSQL da `scripts/audit-finale-concorrenza-probe.mjs`
 * (`B-01`): due `POST` identici, **201 tutti e due**, due righe, cento euro.
 *
 * **Perche una chiave e non un confronto dei campi.** Due versamenti in
 * contanti da 50 lo stesso giorno esistono, e riconoscerli identici li
 * rifiuterebbe. Solo chi chiama sa se il secondo invio e lo stesso gesto: la
 * chiave la conia la finestra, una per apertura, e sopravvive al ritentativo
 * della rete.
 *
 * **Perche dentro il blocco.** La voce `E8` del debito ha lasciato scritta la
 * lezione: «un controllo applicativo di unicita non e un vincolo di unicita: e
 * un suggerimento che regge finche non c'e concorrenza». Qui il controllo non
 * e applicativo nel senso che quella voce condanna — sta **dopo**
 * `lockInstallmentAndTransaction`, cioe dopo il punto in cui le due richieste
 * sono state messe in fila, e la seconda legge cio che la prima ha scritto.
 * E lo stesso posto in cui si rilegge il residuo.
 *
 * Il canale online la sua unicita ce l'ha nel database
 * (`payment_transactions_incasso_unico`), ed e parziale su
 * `external_payment_id`: un incasso manuale ha quella colonna vuota, quindi
 * l'indice non lo tocca. Erano due canali sullo stesso denaro, e uno solo
 * difeso.
 */

const CLUB = "aaaaaaaa-f100-4000-8000-000000000001";
const RATA = "11111111-f100-4000-8000-00000000000a";
const ALTRA_RATA = "11111111-f100-4000-8000-00000000000b";

const scope = () => ({
  userId: "user-f1",
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

let service;
let setPrismaClientForTests;
let fake;

const rata = (id, amount) => ({
  id,
  organization_id: CLUB,
  athlete_id: "atleta-1",
  description: "Quota annuale",
  amount,
  due_date: new Date("2027-01-15T00:00:00Z"),
  paid_at: null,
  status: "pending",
  method: null,
  reference: null,
  notes: null,
  data: {},
  created_at: new Date("2026-08-01T10:00:00Z"),
  updated_at: new Date("2026-08-01T10:00:00Z"),
});

const seed = () => ({
  athletePayment: [rata(RATA, 130), rata(ALTRA_RATA, 130)],
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

const registra = (extra = {}) =>
  service.createPaymentTransaction(
    {
      paymentId: RATA,
      amount: 50,
      paymentMethod: "Contanti",
      paidAt: "2026-08-28T10:00:00.000Z",
      ...extra,
    },
    scope(),
  );

const righe = (paymentId = RATA) =>
  fake.rows("paymentTransaction").filter((row) => row.payment_id === paymentId);

const incassato = (paymentId = RATA) =>
  righe(paymentId).reduce((somma, row) => somma + Number(row.amount || 0), 0);

/* ============================ la chiave riconosce ======================== */

test("lo stesso invio, due volte, lascia una riga sola", async () => {
  const chiave = "manual:gesto-1";

  await registra({ idempotencyKey: chiave });
  await registra({ idempotencyKey: chiave });

  assert.equal(righe().length, 1);
  assert.equal(incassato(), 50, "cento euro per un versamento da cinquanta");
});

test("e la seconda risposta dichiara di essere la stessa riga", async () => {
  const chiave = "manual:gesto-2";

  const primo = await registra({ idempotencyKey: chiave });
  const secondo = await registra({ idempotencyKey: chiave });

  assert.equal(primo.duplicate, false);
  assert.equal(secondo.duplicate, true);
  assert.equal(
    secondo.transaction.id,
    primo.transaction.id,
    "chi ha chiamato non deve dedurre da un 201 che ne sia nata una seconda",
  );
});

test("la risposta duplicata porta comunque la rata e il registro aggiornati", async () => {
  const chiave = "manual:gesto-3";

  await registra({ idempotencyKey: chiave });
  const secondo = await registra({ idempotencyKey: chiave });

  assert.ok(secondo.charge, "la scheda deve poter ridisegnare la rata");
  assert.equal(secondo.transactions.length, 1);
});

/* ======================= e cio che deve restare possibile ================ */

/**
 * **Il controspecchio, e conta.** Due versamenti in contanti da 50 lo stesso
 * giorno sulla stessa rata esistono, e sono due incassi: una chiave che li
 * fondesse sarebbe peggio del difetto che chiude.
 */
test("due gesti diversi sulla stessa rata restano due incassi", async () => {
  await registra({ idempotencyKey: "manual:gesto-4a" });
  await registra({ idempotencyKey: "manual:gesto-4b" });

  assert.equal(righe().length, 2);
  assert.equal(incassato(), 100);
});

test("senza chiave il comportamento e quello di prima", async () => {
  await registra();
  await registra();

  assert.equal(
    righe().length,
    2,
    "la chiave e una facolta di chi chiama, non un requisito nuovo dell'API",
  );
});

/**
 * La chiave vale dentro il perimetro della rata: e li che il blocco la
 * serializza. Riusarla su una rata diversa non deve far sparire un incasso.
 */
test("la stessa chiave su una rata diversa non nasconde l'incasso", async () => {
  const chiave = "manual:gesto-5";

  await registra({ idempotencyKey: chiave });
  await service.createPaymentTransaction(
    {
      paymentId: ALTRA_RATA,
      amount: 50,
      paymentMethod: "Contanti",
      paidAt: "2026-08-28T10:00:00.000Z",
      idempotencyKey: chiave,
    },
    scope(),
  );

  assert.equal(righe(RATA).length, 1);
  assert.equal(righe(ALTRA_RATA).length, 1);
});

/* ========================= dove sta il controllo ======================== */

/**
 * **Dopo il blocco, non prima.** Un controllo fatto prima di
 * `lockInstallmentAndTransaction` sarebbe di nuovo una lettura seguita da una
 * scrittura: la finestra che `E8` ha gia pagato una volta.
 *
 * Si misura riproducendo cio che la corsa **fa** — il doppio di Prisma non ha
 * concorrenza: la riga gemella compare fra la decisione di registrare e la
 * scrittura, cioe all'apertura della transazione. Con il controllo dentro il
 * blocco, la seconda richiesta la vede.
 */
test("la riga gemella comparsa a transazione aperta viene riconosciuta", async () => {
  const chiave = "manual:gesto-6";
  const originale = fake.client.$transaction.bind(fake.client);
  let gia = false;

  fake.client.$transaction = async (input) => {
    if (!gia && typeof input === "function") {
      gia = true;
      fake.rows("paymentTransaction").push({
        id: "gemella",
        organization_id: CLUB,
        athlete_id: "atleta-1",
        payment_id: RATA,
        amount: 50,
        paid_at: new Date("2026-08-28T09:59:59.000Z"),
        payment_method: "Contanti",
        notes: null,
        source: "MANUAL",
        external_reference: null,
        created_by: null,
        reversed_at: null,
        data: { idempotencyKey: chiave },
        created_at: new Date("2026-08-28T09:59:59.000Z"),
        updated_at: new Date("2026-08-28T09:59:59.000Z"),
      });
    }
    return originale(input);
  };

  const esito = await registra({ idempotencyKey: chiave });

  assert.equal(esito.duplicate, true);
  assert.equal(esito.transaction.id, "gemella");
  assert.equal(righe().length, 1);
  assert.equal(incassato(), 50);
});
