import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Il confine e il club attivo — anche fuori dalla contabilita.**
 *
 * `accounting-active-club-boundary.test.mjs` presidia i sei moduli che il
 * primo audit aveva bucato. Questo file esiste perche la seconda lettura ha
 * mostrato che **quei sei erano un campione, non l'insieme**: la stessa forma
 * — confrontare l'`organization_id` della riga con `allowedOrganizationIds`
 * mentre il permesso si verifica con `activeRole`, che e il ruolo del club
 * **attivo** — viveva in altri dodici moduli. Fra questi il registro del
 * lavoro sportivo (da cui esce denaro verso le persone), gli incassi delle
 * famiglie, l'annullamento di un documento fiscale, la fattura elettronica e
 * il **motore CRUD generico**, che da solo serve una cinquantina di risorse.
 *
 * La correzione non e stata fatta dodici volte. E stata fatta una volta sola,
 * in `src/lib/auth/active-club-boundary.ts`, e i moduli la importano: e
 * l'unico modo perche il tredicesimo non nasca.
 *
 * Questo file esiste perche fallisca.
 */

const MIO = "aaaaaaaa-1111-4000-8000-00000000000a";
const ALTRUI = "bbbbbbbb-1111-4000-8000-00000000000b";
const ATTACCANTE = "11111111-1111-4000-8000-000000000aaa";

const INCASSO_ALTRUI = "dddddddd-1111-4000-8000-0000000000dd";
const RICEVUTA_ALTRUI = "eeeeeeee-1111-4000-8000-0000000000ee";
const USCITA_ALTRUI = "ffffffff-1111-4000-8000-0000000000ff";
const ATLETA_ALTRUI = "cccccccc-1111-4000-8000-0000000000cc";
const PERSONA_ALTRUI = "99999999-1111-4000-8000-000000000099";

/**
 * Lo scope di chi attacca: proprietario nel **proprio** club, e appartenente
 * anche all'altro. E la configurazione — banale da ottenere, perche chiunque
 * puo creare una societa — che il difetto sfruttava.
 */
const scopeAttaccante = () => ({
  userId: ATTACCANTE,
  activeOrganizationId: MIO,
  activeRole: "owner",
  allowedOrganizationIds: [MIO, ALTRUI],
});

/** Lo stesso utente, ma con il club giusto attivo: qui deve funzionare. */
const scopeLegittimo = () => ({
  userId: ATTACCANTE,
  activeOrganizationId: ALTRUI,
  activeRole: "owner",
  allowedOrganizationIds: [MIO, ALTRUI],
});

let incassi;
let documenti;
let registro;
let risorse;
let setPrismaClientForTests;
let fake;

const seed = () => ({
  club: [
    { id: MIO, slug: "mio", name: "Il mio club", transactions: [], transfers: [] },
    {
      id: ALTRUI,
      slug: "altrui",
      name: "Club altrui",
      transactions: [],
      transfers: [],
    },
  ],
  athlete: [
    {
      id: ATLETA_ALTRUI,
      organization_id: ALTRUI,
      first_name: "Anna",
      last_name: "Rossi",
    },
  ],
  paymentTransaction: [
    {
      id: INCASSO_ALTRUI,
      organization_id: ALTRUI,
      athlete_id: ATLETA_ALTRUI,
      amount: 200,
      paid_at: new Date("2026-09-10T00:00:00Z"),
      payment_method: "Contanti",
      reversed_at: null,
      reverses_transaction_id: null,
    },
  ],
  receipt: [
    {
      id: RICEVUTA_ALTRUI,
      organization_id: ALTRUI,
      athlete_id: ATLETA_ALTRUI,
      receipt_number: "R-2026-0001",
      issue_date: new Date("2026-09-10T00:00:00Z"),
      amount: 200,
      status: "issued",
      cancelled_at: null,
    },
  ],
  sportWorkPerson: [
    {
      id: PERSONA_ALTRUI,
      organization_id: ALTRUI,
      first_name: "Luca",
      last_name: "Bianchi",
    },
  ],
  sportWorkOutboundTransaction: [
    {
      id: USCITA_ALTRUI,
      organization_id: ALTRUI,
      person_id: PERSONA_ALTRUI,
      transaction_type: "COMPENSATION_PAYMENT",
      paid_at: new Date("2026-09-12T00:00:00Z"),
      fiscal_year: 2026,
      gross_amount: 1000,
      net_amount: 760,
      club_cost: 1000,
      reversed_at: null,
      reversal_of_id: null,
    },
  ],
  invoice: [],
  auditLog: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  incassi = await import("../../src/lib/server/payment-transactions.ts");
  documenti = await import("../../src/lib/server/fiscal-documents.ts");
  registro = await import("../../src/lib/server/sport-work-ledger.ts");
  risorse = await import("../../src/lib/server/resources.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const negato = /Accesso negato/;

/* ============================================ gli incassi delle famiglie */

test("un incasso di un altro club non si legge, non si elenca, non si storna", async () => {
  for (const azione of [
    () => incassi.getPaymentTransactionById(INCASSO_ALTRUI, scopeAttaccante()),
    () => incassi.listPaymentTransactions({ organizationId: ALTRUI }, scopeAttaccante()),
    () =>
      incassi.reversePaymentTransaction(
        { transactionId: INCASSO_ALTRUI, reason: "preso" },
        scopeAttaccante(),
      ),
  ]) {
    await assert.rejects(azione, negato);
  }

  const riga = fake.rows("paymentTransaction").find((r) => r.id === INCASSO_ALTRUI);
  assert.equal(riga.reversed_at, null, "nessuno storno deve essere nato");
  assert.equal(
    fake.rows("paymentTransaction").length,
    1,
    "nessuna riga nuova nel club altrui",
  );
});

test("un incasso non si registra in casa d'altri dichiarandone il club", async () => {
  await assert.rejects(
    () =>
      incassi.createPaymentTransaction(
        {
          organizationId: ALTRUI,
          athleteId: ATLETA_ALTRUI,
          amount: 70000,
          paidAt: "2026-09-20T00:00:00Z",
          paymentMethod: "Contanti",
        },
        scopeAttaccante(),
      ),
    negato,
  );

  assert.equal(fake.rows("paymentTransaction").length, 1);
});

/* ================================================== i documenti fiscali */

test("un documento fiscale di un altro club non si annulla", async () => {
  await assert.rejects(
    () =>
      documenti.cancelDocument(
        { kind: "receipt", documentId: RICEVUTA_ALTRUI, reason: "preso" },
        scopeAttaccante(),
      ),
    negato,
  );

  const riga = fake.rows("receipt").find((r) => r.id === RICEVUTA_ALTRUI);
  assert.equal(riga.cancelled_at, null, "il documento deve restare valido");
  assert.equal(riga.status, "issued");
});

/* ======================================== il registro del lavoro sportivo */

test("il denaro in uscita di un altro club non si legge e non si elenca", async () => {
  for (const azione of [
    () => registro.getOutboundTransactionById(USCITA_ALTRUI, scopeAttaccante()),
    () => registro.listOutboundTransactions({ organizationId: ALTRUI }, scopeAttaccante()),
  ]) {
    await assert.rejects(azione, negato);
  }

  assert.equal(fake.rows("sportWorkOutboundTransaction").length, 1);
});

/* ================================================ il motore CRUD generico */

test("il CRUD generico non scrive in casa d'altri dichiarandone il club", async () => {
  /*
    E la superficie piu ampia dell'intera classe: una cinquantina di risorse
    passano di qui, e il club arrivava dal **corpo** della richiesta con il
    solo vincolo di essere fra quelli dell'utente.
  */
  await assert.rejects(
    () =>
      risorse.createResource(
        "athletes",
        {
          organization_id: ALTRUI,
          first_name: "Intruso",
          last_name: "Inserito",
        },
        "create",
        scopeAttaccante(),
      ),
    negato,
  );

  assert.equal(fake.rows("athlete").length, 1, "nessun atleta nuovo nel club altrui");
});

test("il CRUD generico non legge, non modifica e non cancella una riga altrui", async () => {
  for (const azione of [
    () => risorse.getResourceById("athletes", ATLETA_ALTRUI, scopeAttaccante()),
    () =>
      risorse.updateResource(
        "athletes",
        ATLETA_ALTRUI,
        { last_name: "Presa" },
        scopeAttaccante(),
      ),
    () => risorse.deleteResource("athletes", ATLETA_ALTRUI, scopeAttaccante()),
  ]) {
    await assert.rejects(azione, negato);
  }

  const riga = fake.rows("athlete").find((r) => r.id === ATLETA_ALTRUI);
  assert.ok(riga, "l'atleta deve esistere ancora");
  assert.equal(riga.last_name, "Rossi", "il cognome non deve essere cambiato");
});

/* ==================================================== il controllo inverso */

/*
  Un confine che nega tutto non e un confine, e un muro. Questi due casi
  esistono perche i precedenti provino qualcosa: con il club **giusto** attivo,
  lo stesso utente con lo stesso ruolo lavora normalmente.
*/

test("con il club giusto attivo, lo stesso utente lavora normalmente", async () => {
  const elenco = await incassi.listPaymentTransactions(
    { organizationId: ALTRUI },
    scopeLegittimo(),
  );
  assert.equal(elenco.length, 1);

  const atleta = await risorse.getResourceById(
    "athletes",
    ATLETA_ALTRUI,
    scopeLegittimo(),
  );
  assert.equal(atleta.last_name, "Rossi");
});

test("lo storno riesce quando il club attivo e quello dell'incasso", async () => {
  await incassi.reversePaymentTransaction(
    { transactionId: INCASSO_ALTRUI, reason: "incasso doppio" },
    scopeLegittimo(),
  );

  const righe = fake.rows("paymentTransaction");
  assert.equal(righe.length, 2, "lo storno e una riga nuova, non una cancellazione");
  const originale = righe.find((r) => r.id === INCASSO_ALTRUI);
  assert.ok(originale.reversed_at, "l'originale resta, marcato");
});
