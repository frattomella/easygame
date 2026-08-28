import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Il sollecito degli insoluti verso le famiglie (W1-F, PP-4).
 *
 * Quattro cose contano piu di tutte, e sono le quattro che il meccanismo di
 * sollecito gia esistente — quello sui documenti — non garantiva:
 *
 * 1. **il residuo e quello della cassa**, non l'importo dovuto: una rata da
 *    130 con 80 incassati vale 50;
 * 2. **chi non e raggiungibile si vede**, con il motivo, e non fa fallire il
 *    resto;
 * 3. **«inviato» significa inviato**: con SMTP non configurato, o con una
 *    consegna fallita, nessuno risulta `sent`;
 * 4. **un gesto, un invio**: due richieste ravvicinate producono un solo
 *    messaggio per destinatario.
 *
 * E la quinta, che non e negoziabile in nessun dominio di questo prodotto: il
 * sollecito di un club non raggiunge il tutore di un altro.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "aaaaaaaa-0000-4000-8000-000000000002";
const ATLETA = "bbbbbbbb-0000-4000-8000-00000000000a";
const ATLETA_SENZA_TUTORI = "bbbbbbbb-0000-4000-8000-00000000000b";
const ATLETA_ALTRO_CLUB = "bbbbbbbb-0000-4000-8000-00000000000c";
const UTENTE_TUTORE = "cccccccc-0000-4000-8000-00000000000a";

const NOW = new Date("2026-10-05T10:00:00Z");

let moduloSolleciti;
let setPrismaClientForTests;
let fake;
let inviate;

const scope = (organizationId = CLUB) => ({
  userId: "dddddddd-0000-4000-8000-00000000000a",
  activeOrganizationId: organizationId,
  allowedOrganizationIds: [organizationId],
});

/** Un postino finto: registra cosa gli viene passato e non parla con nessuno. */
const postino = ({ configured = true, fallisce = () => false } = {}) => ({
  isConfigured: async () => configured,
  send: async (content) => {
    if (fallisce(content)) {
      const error = new Error("SMTP_DELIVERY_FAILED");
      error.code = "SMTP_DELIVERY_FAILED";
      throw error;
    }
    inviate.push(content);
    return { status: "sent" };
  },
});

const rata = (id, overrides = {}) => ({
  id,
  organization_id: CLUB,
  athlete_id: ATLETA,
  description: "Quota annuale - Rata 1",
  amount: 130,
  due_date: new Date("2026-09-30T00:00:00Z"),
  paid_at: null,
  status: "pending",
  method: null,
  data: {},
  ...overrides,
});

const seed = () => ({
  club: [
    { id: CLUB, name: "ASD Alfa" },
    { id: ALTRO_CLUB, name: "ASD Beta" },
  ],
  athlete: [
    {
      id: ATLETA,
      organization_id: CLUB,
      first_name: "Luca",
      last_name: "Bianchi",
      data: {
        guardians: [
          {
            name: "Maria",
            surname: "Bianchi",
            email: "Maria.Bianchi@example.com",
          },
        ],
      },
    },
    {
      id: ATLETA_SENZA_TUTORI,
      organization_id: CLUB,
      first_name: "Sara",
      last_name: "Verdi",
      data: {},
    },
    {
      id: ATLETA_ALTRO_CLUB,
      organization_id: ALTRO_CLUB,
      first_name: "Nina",
      last_name: "Gialli",
      data: {
        guardians: [{ name: "Ivan", surname: "Gialli", email: "ivan@beta.example" }],
      },
    },
  ],
  athletePayment: [
    // 130 dovuti, 80 incassati: il residuo e 50.
    rata("rata-1"),
    rata("rata-2", {
      athlete_id: ATLETA_SENZA_TUTORI,
      description: "Quota annuale - Rata 1",
      amount: 100,
    }),
    rata("rata-altro-club", {
      organization_id: ALTRO_CLUB,
      athlete_id: ATLETA_ALTRO_CLUB,
      amount: 200,
    }),
  ],
  paymentTransaction: [
    {
      id: "incasso-1",
      organization_id: CLUB,
      athlete_id: ATLETA,
      payment_id: "rata-1",
      amount: 80,
      paid_at: new Date("2026-09-10T00:00:00Z"),
      payment_method: "cash",
      source: "MANUAL",
      data: {},
    },
  ],
  organizationUser: [],
  user: [],
  notification: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  moduloSolleciti = await import("../../src/lib/server/payment-reminders.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
  inviate = [];
});

const anteprima = (chargeIds, options = {}) =>
  moduloSolleciti.buildPaymentReminderPreview({
    organizationId: CLUB,
    chargeIds,
    scope: scope(),
    now: NOW,
    mailer: postino(options),
  });

const invia = (chargeIds, options = {}) =>
  moduloSolleciti.sendPaymentReminders({
    organizationId: CLUB,
    chargeIds,
    scope: scope(),
    now: options.now || NOW,
    mailer: postino(options),
  });

/** Aggiunge un tutore all'atleta, sostituendo quelli che ci sono. */
const conTutori = (guardians, athleteId = ATLETA) => {
  const athlete = fake.rows("athlete").find((row) => row.id === athleteId);
  athlete.data = { ...athlete.data, guardians };
};

// --- il denaro ------------------------------------------------------------

test("il residuo nell'anteprima e quello della cassa, non l'importo dovuto", async () => {
  const preview = await anteprima(["rata-1"]);

  assert.equal(preview.positions.length, 1);
  assert.equal(preview.positions[0].residualAmount, 50);
  assert.notEqual(
    preview.positions[0].residualAmount,
    130,
    "sommare il dovuto invece dell'incassato e il difetto che ADR-0068 chiude",
  );
});

test("una rata scaduta conta fra le scadute e la prossima scadenza resta vuota", async () => {
  const preview = await anteprima(["rata-1"]);

  assert.equal(preview.positions[0].overdueCount, 1);
  assert.equal(
    preview.positions[0].nextDueDate,
    null,
    "una data del mese scorso non si chiama «prossima scadenza»",
  );
});

test("una rata gia saldata non si sollecita e lo dice", async () => {
  fake.rows("paymentTransaction").push({
    id: "incasso-2",
    organization_id: CLUB,
    athlete_id: ATLETA,
    payment_id: "rata-1",
    amount: 50,
    paid_at: new Date("2026-09-20T00:00:00Z"),
    payment_method: "cash",
    source: "MANUAL",
    data: {},
  });

  const preview = await anteprima(["rata-1"]);

  assert.equal(preview.positions.length, 0);
  assert.deepEqual(preview.excludedCharges, [
    { chargeId: "rata-1", reason: "nothing_due" },
  ]);
  assert.equal(preview.canSend, false);
});

// --- chi si raggiunge, e chi no -------------------------------------------

test("un tutore senza account collegato ma con email e raggiungibile", async () => {
  const preview = await anteprima(["rata-1"]);

  assert.equal(preview.reachable.length, 1);
  assert.equal(preview.reachable[0].email, "maria.bianchi@example.com");
  assert.equal(preview.reachable[0].hasAccount, false);
  assert.deepEqual(preview.unreachable, []);
});

test("un atleta senza tutori e non raggiungibile, e non fa fallire il resto", async () => {
  const preview = await anteprima(["rata-1", "rata-2"]);

  assert.equal(preview.reachable.length, 1, "l'altro atleta resta raggiungibile");
  assert.equal(preview.unreachable.length, 1);
  assert.equal(preview.unreachable[0].athleteId, ATLETA_SENZA_TUTORI);
  assert.equal(preview.unreachable[0].reason, "no_guardian");
  assert.equal(preview.canSend, true);
});

test("la coppia storica parent1/parent2 vale quanto l'elenco guardians", async () => {
  const athlete = fake.rows("athlete").find((row) => row.id === ATLETA);
  athlete.data = {
    parent1: { name: "Maria", surname: "Bianchi", email: "maria@example.com" },
    parent2: { name: "Paolo", surname: "Bianchi", email: "paolo@example.com" },
  };

  const preview = await anteprima(["rata-1"]);

  assert.deepEqual(
    preview.reachable.map((row) => row.email).sort(),
    ["maria@example.com", "paolo@example.com"],
  );
});

test("lo stesso indirizzo su due righe di tutore e un destinatario solo", async () => {
  conTutori([
    { name: "Maria", surname: "Bianchi", email: "maria@example.com" },
    { name: "Maria", surname: "Bianchi", email: "MARIA@example.com" },
  ]);

  const esito = await invia(["rata-1"]);

  assert.equal(esito.totals.sent, 1);
  assert.equal(inviate.length, 1);
});

test("un tutore senza email non e raggiungibile, con il motivo giusto", async () => {
  conTutori([{ name: "Maria", surname: "Bianchi", phone: "3331112222" }]);

  const preview = await anteprima(["rata-1"]);

  assert.deepEqual(
    preview.unreachable.map((row) => row.reason),
    ["no_email"],
  );
  assert.equal(preview.canSend, false);
});

test("un account collegato che questo club non conosce e «no_account»", async () => {
  conTutori([
    { name: "Maria", surname: "Bianchi", linkedUserId: UTENTE_TUTORE },
  ]);

  const preview = await anteprima(["rata-1"]);

  assert.deepEqual(
    preview.unreachable.map((row) => row.reason),
    ["no_account"],
    "un identificativo dichiarato in anagrafica non e un lasciapassare",
  );
});

test("un tutore con account collegato riceve anche la notifica in-app", async () => {
  fake.rows("user").push({ id: UTENTE_TUTORE, email: "maria@example.com" });
  fake.rows("organizationUser").push({
    id: "membership-1",
    organization_id: CLUB,
    user_id: UTENTE_TUTORE,
    role: "parent",
  });
  conTutori([
    { name: "Maria", surname: "Bianchi", linkedUserId: UTENTE_TUTORE },
  ]);

  const esito = await invia(["rata-1"]);

  assert.equal(esito.totals.sent, 1);
  assert.equal(inviate[0].to, "maria@example.com");

  const notifiche = fake.rows("notification");
  assert.equal(notifiche.length, 1);
  assert.equal(notifiche[0].user_id, UTENTE_TUTORE);
  assert.equal(notifiche[0].type, "payment_reminder");
});

// --- il messaggio ---------------------------------------------------------

test("il messaggio porta residuo, rate scadute e prossima scadenza", async () => {
  fake.rows("athletePayment").push(
    rata("rata-3", {
      description: "Quota annuale - Rata 2",
      amount: 70,
      due_date: new Date("2026-11-30T00:00:00Z"),
    }),
  );

  await invia(["rata-1", "rata-3"]);

  assert.equal(inviate.length, 1);
  assert.equal(inviate[0].residualAmount, 120, "50 di residuo piu 70 ancora dovuti");
  assert.equal(inviate[0].overdueCount, 1);
  assert.equal(inviate[0].nextDueDate, "2026-11-30T00:00:00.000Z");
  assert.equal(inviate[0].athleteName, "Luca Bianchi");
});

// --- doppio clic ----------------------------------------------------------

test("due invii consecutivi producono un solo messaggio per destinatario", async () => {
  const primo = await invia(["rata-1"]);
  assert.equal(primo.totals.sent, 1);

  const secondo = await invia(["rata-1"]);

  assert.equal(secondo.totals.sent, 0);
  assert.equal(inviate.length, 1, "il secondo gesto non deve far partire nulla");
  assert.deepEqual(
    secondo.deliveries.map((row) => [row.status, row.reason]),
    [["skipped", "already_reminded"]],
  );
});

test("passata la finestra di riguardo il sollecito riparte", async () => {
  await invia(["rata-1"]);

  const dopo = new Date(NOW.getTime() + 7 * 60 * 60 * 1000);
  const secondo = await invia(["rata-1"], { now: dopo });

  assert.equal(secondo.totals.sent, 1);
  assert.equal(inviate.length, 2);
});

test("la data dell'ultimo sollecito resta sulla rata", async () => {
  await invia(["rata-1"]);

  const riga = fake.rows("athletePayment").find((row) => row.id === "rata-1");
  assert.equal(riga.data.lastReminderAt, NOW.toISOString());
});

// --- «inviato» significa inviato ------------------------------------------

test("con SMTP non configurato nessuno risulta inviato, e l'esito lo dice", async () => {
  const esito = await invia(["rata-1"], { configured: false });

  assert.equal(esito.emailConfigured, false);
  assert.equal(esito.totals.sent, 0);
  assert.equal(esito.totals.failed, 1);
  assert.deepEqual(
    esito.deliveries.map((row) => row.reason),
    ["email_not_configured"],
  );
  assert.equal(inviate.length, 0);

  const riga = fake.rows("athletePayment").find((row) => row.id === "rata-1");
  assert.equal(
    riga.data.lastReminderAt,
    undefined,
    "una traccia scritta senza invio direbbe che la famiglia e stata avvisata",
  );
});

test("un invio fallito non impedisce gli altri, ed e riportato come failed", async () => {
  conTutori([
    { name: "Maria", surname: "Bianchi", email: "maria@example.com" },
    { name: "Paolo", surname: "Bianchi", email: "paolo@example.com" },
  ]);

  const esito = await invia(["rata-1"], {
    fallisce: (content) => content.to === "maria@example.com",
  });

  assert.equal(esito.totals.sent, 1);
  assert.equal(esito.totals.failed, 1);
  assert.equal(inviate.length, 1);
  assert.equal(inviate[0].to, "paolo@example.com");

  const fallito = esito.deliveries.find((row) => row.status === "failed");
  assert.equal(fallito.email, "maria@example.com");
  assert.equal(fallito.reason, "delivery_failed");
});

test("un invio fallito si puo ritentare subito: la rivendicazione viene tolta", async () => {
  await invia(["rata-1"], { fallisce: () => true });

  const secondo = await invia(["rata-1"]);

  assert.equal(secondo.totals.sent, 1, "la finestra non deve punire un guasto");
});

// --- validazione ----------------------------------------------------------

test("senza nessun raggiungibile l'azione non parte e lo dice", async () => {
  await assert.rejects(
    () => invia(["rata-2"]),
    /Nessun destinatario raggiungibile/,
  );
  assert.equal(inviate.length, 0);
});

test("senza rate selezionate l'azione non parte", async () => {
  await assert.rejects(() => anteprima([]), /Nessuna rata selezionata/);
});

// --- isolamento fra club --------------------------------------------------

test("una rata di un altro club viene respinta con «Accesso negato»", async () => {
  await assert.rejects(
    () => anteprima(["rata-1", "rata-altro-club"]),
    /Accesso negato/,
  );
});

test("il tutore dell'altro club non riceve niente", async () => {
  await assert.rejects(() => invia(["rata-altro-club"]), /Accesso negato/);

  assert.equal(inviate.length, 0);
  assert.equal(fake.rows("notification").length, 0);
});

test("un club fuori dallo scope viene respinto prima di leggere le rate", async () => {
  await assert.rejects(
    () =>
      moduloSolleciti.buildPaymentReminderPreview({
        organizationId: ALTRO_CLUB,
        chargeIds: ["rata-altro-club"],
        scope: scope(CLUB),
        now: NOW,
        mailer: postino(),
      }),
    /Accesso negato/,
  );
});

test("ogni lettura di rate porta il filtro sul club", async () => {
  await anteprima(["rata-1"]);

  const letture = fake.calls.filter(
    (call) => call.delegate === "athletePayment" && call.method === "findMany",
  );

  assert.ok(letture.length > 0);
  for (const lettura of letture) {
    assert.equal(
      lettura.args.where.organization_id,
      CLUB,
      "una rata non si cerca mai senza il club",
    );
  }
});
