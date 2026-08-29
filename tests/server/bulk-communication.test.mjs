import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * La comunicazione massiva (W2-C, G-07).
 *
 * Le tre regole ereditate dal sollecito di Wave 1, provate qui su un pubblico
 * scelto per criteri invece che per selezione di rate:
 *
 * 1. anteprima e invio vedono **la stessa cosa**;
 * 2. **«inviato» significa inviato** — con SMTP spento nessuno risulta `sent`;
 * 3. un fallimento **non annulla il resto**.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const NOW = new Date("2026-10-05T10:00:00Z");

let modulo;
let setPrismaClientForTests;
let fake;
let inviate;

const scope = (activeRole = "owner") => ({
  userId: "dddddddd-0000-4000-8000-00000000000a",
  activeOrganizationId: CLUB,
  allowedOrganizationIds: [CLUB],
  activeRole,
});

const postino = ({ configured = true, fallisce = () => false } = {}) => ({
  isConfigured: async () => configured,
  send: async (message) => {
    if (fallisce(message)) throw new Error("SMTP_DELIVERY_FAILED");
    inviate.push(message);
    return { status: "sent" };
  },
});

const atleta = (id, email, overrides = {}) => ({
  id,
  organization_id: CLUB,
  first_name: "Luca",
  last_name: id.toUpperCase(),
  status: "active",
  category_id: "under-14",
  data: { guardians: [{ name: "Maria", surname: "Bianchi", email }] },
  category_memberships: [{ category_id: "under-14", categoryId: "under-14" }],
  ...overrides,
});

const seed = () => ({
  club: [{ id: CLUB, name: "ASD Alfa", club_sites: [] }],
  athlete: [
    atleta("a1", "a1@example.com"),
    atleta("a2", "a2@example.com"),
  ],
  organizationUser: [],
  user: [],
  athletePayment: [],
  paymentTransaction: [],
  communicationDelivery: [],
  notification: [],
});

const MODELLO = {
  subject: "Comunicazione da {{club.name}}",
  body: "Gentile {{recipient.name}}, riguarda {{athlete.first_name}}.",
};

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  modulo = await import("../../src/lib/server/communications.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
  inviate = [];
});

const anteprima = (options = {}) =>
  modulo.buildCommunicationPreview({
    criteria: options.criteria || [{ kind: "all_families" }],
    template: options.template || MODELLO,
    communicationId: options.communicationId || "com-1",
    scope: options.scope || scope(),
    now: NOW,
    mailer: postino(options),
  });

const invia = (options = {}) =>
  modulo.sendCommunication({
    criteria: options.criteria || [{ kind: "all_families" }],
    template: options.template || MODELLO,
    communicationId: options.communicationId || "com-1",
    scope: options.scope || scope(),
    now: NOW,
    mailer: postino(options),
    ...(options.batchSize ? { batchSize: options.batchSize } : {}),
  });

// --- anteprima e invio vedono la stessa cosa -------------------------------

test("l'anteprima elenca i raggiungibili e mostra il messaggio vero", async () => {
  const preview = await anteprima();

  assert.equal(preview.counts.recipients, 2);
  assert.equal(preview.canSend, true);
  assert.equal(preview.sample.to, "a1@example.com");
  assert.equal(preview.sample.subject, "Comunicazione da ASD Alfa");
  assert.match(preview.sample.text, /Gentile Maria Bianchi/);
});

test("l'anteprima non manda niente e non scrive niente", async () => {
  await anteprima();

  assert.equal(inviate.length, 0);
  assert.equal(fake.rows("communicationDelivery").length, 0);
});

test("i destinatari dell'anteprima sono quelli dell'invio", async () => {
  const preview = await anteprima();
  const esito = await invia();

  assert.deepEqual(
    preview.reachable.map((row) => row.email),
    esito.deliveries.map((row) => row.email),
  );
});

// --- «inviato» significa inviato ------------------------------------------

test("con SMTP non configurato nessuno risulta inviato e non si scrive nel registro", async () => {
  const esito = await invia({ configured: false });

  assert.equal(esito.totals.sent, 0);
  assert.equal(esito.totals.failed, 2);
  assert.equal(inviate.length, 0);
  assert.equal(fake.rows("communicationDelivery").length, 0);
});

test("con SMTP non configurato l'anteprima lo dice invece di far premere", async () => {
  const preview = await anteprima({ configured: false });

  assert.equal(preview.canSend, false);
  assert.match(preview.blockedReason, /non e configurato/);
});

test("un fallimento parziale non annulla chi e gia partito", async () => {
  const esito = await invia({
    fallisce: (message) => message.to === "a2@example.com",
  });

  assert.equal(esito.totals.sent, 1);
  assert.equal(esito.totals.failed, 1);
  assert.equal(inviate.length, 1);
  assert.equal(inviate[0].to, "a1@example.com");
});

test("chi ha fallito e riprovabile subito: la riga resta e dice il motivo", async () => {
  await invia({ fallisce: (message) => message.to === "a2@example.com" });

  const riga = fake
    .rows("communicationDelivery")
    .find((row) => row.recipient_key === "a2@example.com");

  assert.equal(riga.status, "failed");
  assert.equal(riga.reason, "delivery_failed");

  const secondo = await invia();
  assert.equal(secondo.totals.sent, 1, "il fallito riparte, il riuscito no");
});

// --- doppio clic -----------------------------------------------------------

test("due invii con lo stesso identificativo producono un messaggio per destinatario", async () => {
  const primo = await invia();
  assert.equal(primo.totals.sent, 2);

  const secondo = await invia();
  assert.equal(secondo.totals.sent, 0);
  assert.equal(secondo.totals.skipped, 2);
  assert.equal(inviate.length, 2);
});

test("un identificativo nuovo e una comunicazione nuova", async () => {
  await invia();
  const secondo = await invia({ communicationId: "com-2" });

  assert.equal(secondo.totals.sent, 2);
  assert.equal(inviate.length, 4);
});

test("senza identificativo dichiarato, due invii ravvicinati restano uno", async () => {
  const primo = await modulo.sendCommunication({
    criteria: [{ kind: "all_families" }],
    template: MODELLO,
    scope: scope(),
    now: NOW,
    mailer: postino(),
  });
  const secondo = await modulo.sendCommunication({
    criteria: [{ kind: "all_families" }],
    template: MODELLO,
    scope: scope(),
    now: new Date(NOW.getTime() + 30 * 1000),
    mailer: postino(),
  });

  assert.equal(primo.totals.sent, 2);
  assert.equal(secondo.totals.sent, 0);
});

// --- il registro -----------------------------------------------------------

test("il registro dice chi ha ricevuto cosa, con le persone rappresentate", async () => {
  await invia();

  const righe = await modulo
    .sendCommunication({
      criteria: [{ kind: "all_families" }],
      template: MODELLO,
      communicationId: "com-1",
      scope: scope(),
      now: NOW,
      mailer: postino(),
    })
    .then(() => fake.rows("communicationDelivery"));

  const perA1 = righe.find((row) => row.recipient_key === "a1@example.com");
  assert.equal(perA1.status, "sent");
  assert.equal(perA1.source_kind, "bulk");
  assert.equal(perA1.source_id, "com-1");
  assert.deepEqual(perA1.athlete_ids, ["a1"]);
  assert.equal(perA1.subject, "Comunicazione da ASD Alfa");
});

// --- il contenuto ----------------------------------------------------------

test("un segnaposto inventato blocca l'invio invece di partire con un buco", async () => {
  const modelloRotto = {
    subject: "Ciao",
    body: "Ciao {{questo.non.esiste}}",
  };

  const preview = await anteprima({ template: modelloRotto });
  assert.equal(preview.canSend, false);
  assert.deepEqual(preview.invalidPlaceholders, ["questo.non.esiste"]);

  await assert.rejects(() => invia({ template: modelloRotto }), /non esistono/);
});

test("i segnaposto economici non si risolvono in una comunicazione massiva", async () => {
  const preview = await anteprima({
    template: {
      subject: "Quote",
      body: "Residuo: {{installment.residual_amount}}",
    },
  });

  assert.equal(
    preview.sample.unresolved.includes("installment.residual_amount"),
    true,
    "il residuo e un dato per atleta: in un messaggio a una famiglia con due figli sarebbe falso",
  );
});

test("una famiglia con due figli riceve un messaggio solo, che li nomina entrambi", async () => {
  fake.rows("athlete").find((row) => row.id === "a2").data = {
    guardians: [{ name: "Maria", surname: "Bianchi", email: "a1@example.com" }],
  };

  const esito = await invia();

  assert.equal(esito.totals.sent, 1);
  assert.equal(inviate.length, 1);
  assert.match(inviate[0].text, /Luca e Luca/);
});

// --- il permesso -----------------------------------------------------------

test("l'allenatore non puo mandare una comunicazione", async () => {
  await assert.rejects(
    () => invia({ scope: scope("trainer") }),
    /Accesso negato/,
  );
});

// --- i lotti ---------------------------------------------------------------

test("oltre il lotto si dichiara quanto resta, e la ripresa non duplica", async () => {
  const primo = await invia({ batchSize: 1 });

  assert.equal(primo.totals.sent, 1);
  assert.equal(primo.remaining, 1);

  const secondo = await invia({ batchSize: 1 });

  assert.equal(secondo.totals.sent, 1, "il secondo lotto serve chi resta");
  assert.equal(inviate.length, 2);
  assert.equal(
    new Set(inviate.map((message) => message.to)).size,
    2,
    "nessuno viene servito due volte",
  );
});
