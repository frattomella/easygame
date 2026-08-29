import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Il registro delle consegne (W2-C, ADR-0084).
 *
 * **Cosa si prova qui, e perche e la cosa piu importante della Wave.** La
 * deduplica non e un controllo in memoria: e l'indice unico. Un test che
 * chiamasse la rivendicazione una volta per volta proverebbe il caso facile —
 * quello in cui anche un `if` funzionerebbe. Qui si provano i due casi veri:
 * due rivendicazioni **in parallelo** sulla stessa chiave, e la ripetizione a
 * distanza di tempo, che deve comportarsi in modo **diverso** per
 * un'automazione e per un sollecito a mano.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "aaaaaaaa-0000-4000-8000-000000000002";
const NOW = new Date("2026-10-05T10:00:00Z");

let modulo;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  modulo = await import("../../src/lib/server/communication-deliveries.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma({ communicationDelivery: [] });
  setPrismaClientForTests(fake.client);
});

const rivendica = (overrides = {}) =>
  modulo.claimDelivery({
    organizationId: CLUB,
    sourceKind: "automation",
    sourceId: "AUT-01",
    dedupKey: "automation:AUT-01:rata-1:7",
    channel: "email",
    recipientKey: "maria@example.com",
    recipientEmail: "maria@example.com",
    athleteIds: ["atleta-1"],
    retryAfterMs: null,
    now: NOW,
    ...overrides,
  });

// --- la chiave -------------------------------------------------------------

test("la chiave di deduplica e deterministica e leggibile", () => {
  assert.equal(
    modulo.buildDedupKey("automation", "AUT-01", "rata-1", 7),
    "automation:AUT-01:rata-1:7",
  );
});

test("i segmenti vuoti si scartano: la stessa occorrenza non produce due chiavi", () => {
  assert.equal(
    modulo.buildDedupKey("reminder", "", "atleta-1", null, undefined),
    "reminder:atleta-1",
  );
});

// --- la corsa --------------------------------------------------------------

test("la prima rivendicazione vince, la seconda scopre di aver perso", async () => {
  const prima = await rivendica();
  assert.equal(prima.claimed, true);

  const seconda = await rivendica();
  assert.equal(seconda.claimed, false);
  assert.equal(seconda.reason, "in_flight");

  assert.equal(fake.rows("communicationDelivery").length, 1);
});

test("due rivendicazioni in parallelo producono una riga sola", async () => {
  const esiti = await Promise.all([rivendica(), rivendica(), rivendica()]);

  assert.equal(
    esiti.filter((esito) => esito.claimed).length,
    1,
    "una sola deve vincere la corsa",
  );
  assert.equal(fake.rows("communicationDelivery").length, 1);
});

test("un'occorrenza gia consegnata non si ripete mai", async () => {
  const claim = await rivendica();
  await modulo.settleDelivery({ id: claim.id, status: "sent", now: NOW });

  const unAnnoDopo = new Date(NOW.getTime() + 365 * 24 * 60 * 60 * 1000);
  const seconda = await rivendica({ now: unAnnoDopo });

  assert.equal(seconda.claimed, false);
  assert.equal(seconda.reason, "already_sent");
});

test("una consegna fallita e riprendibile subito: un guasto non punisce la famiglia", async () => {
  const claim = await rivendica();
  await modulo.settleDelivery({
    id: claim.id,
    status: "failed",
    reason: "delivery_failed",
    now: NOW,
  });

  const seconda = await rivendica();
  assert.equal(seconda.claimed, true);
  assert.equal(
    fake.rows("communicationDelivery").length,
    1,
    "si riprende la riga, non se ne aggiunge una seconda",
  );
});

// --- le due politiche di ripetizione ---------------------------------------

test("il sollecito a mano si puo rifare passata la finestra di riguardo", async () => {
  const claim = await rivendica({
    sourceKind: "reminder",
    dedupKey: "reminder:atleta-1",
    retryAfterMs: modulo.MANUAL_REMINDER_WINDOW_MS,
  });
  await modulo.settleDelivery({ id: claim.id, status: "sent", now: NOW });

  const dentroLaFinestra = await rivendica({
    sourceKind: "reminder",
    dedupKey: "reminder:atleta-1",
    retryAfterMs: modulo.MANUAL_REMINDER_WINDOW_MS,
    now: new Date(NOW.getTime() + 60 * 60 * 1000),
  });
  assert.equal(dentroLaFinestra.claimed, false, "un'ora dopo e ancora lo stesso gesto");

  const dopo = await rivendica({
    sourceKind: "reminder",
    dedupKey: "reminder:atleta-1",
    retryAfterMs: modulo.MANUAL_REMINDER_WINDOW_MS,
    now: new Date(NOW.getTime() + 7 * 60 * 60 * 1000),
  });
  assert.equal(dopo.claimed, true, "sette ore dopo e una decisione nuova");
});

test("un'automazione non si ripete nemmeno dopo un anno: l'occorrenza e una sola", async () => {
  const claim = await rivendica({ retryAfterMs: null });
  await modulo.settleDelivery({ id: claim.id, status: "sent", now: NOW });

  const dopo = await rivendica({
    retryAfterMs: null,
    now: new Date(NOW.getTime() + 365 * 24 * 60 * 60 * 1000),
  });

  assert.equal(dopo.claimed, false);
});

// --- multi-tenant ----------------------------------------------------------

test("la stessa chiave in due club sono due consegne diverse", async () => {
  const primo = await rivendica();
  const secondo = await rivendica({ organizationId: ALTRO_CLUB });

  assert.equal(primo.claimed, true);
  assert.equal(secondo.claimed, true);
  assert.equal(fake.rows("communicationDelivery").length, 2);
});

test("la lettura di chi e gia stato raggiunto e filtrata per club", async () => {
  const claim = await rivendica();
  await modulo.settleDelivery({ id: claim.id, status: "sent", now: NOW });

  const nelClub = await modulo.readAlreadyReached({
    organizationId: CLUB,
    dedupKeys: ["automation:AUT-01:rata-1:7"],
    channel: "email",
    now: NOW,
  });
  const nellAltro = await modulo.readAlreadyReached({
    organizationId: ALTRO_CLUB,
    dedupKeys: ["automation:AUT-01:rata-1:7"],
    channel: "email",
    now: NOW,
  });

  assert.equal(nelClub.size, 1);
  assert.equal(nellAltro.size, 0);
});

// --- la lettura per l'anteprima -------------------------------------------

test("la chiave composta distingue due occorrenze diverse dello stesso indirizzo", async () => {
  const perLuca = await rivendica({ dedupKey: "reminder:luca" });
  await modulo.settleDelivery({ id: perLuca.id, status: "sent", now: NOW });

  const raggiunti = await modulo.readAlreadyReached({
    organizationId: CLUB,
    dedupKeys: ["reminder:luca", "reminder:marco"],
    channel: "email",
    now: NOW,
  });

  assert.equal(
    raggiunti.has(modulo.reachedKey("reminder:luca", "maria@example.com")),
    true,
  );
  assert.equal(
    raggiunti.has(modulo.reachedKey("reminder:marco", "maria@example.com")),
    false,
    "la famiglia con due figli deve poter essere avvisata per il secondo",
  );
});

test("una consegna fallita non conta come «gia raggiunto»", async () => {
  const claim = await rivendica();
  await modulo.settleDelivery({
    id: claim.id,
    status: "failed",
    reason: "delivery_failed",
    now: NOW,
  });

  const raggiunti = await modulo.readAlreadyReached({
    organizationId: CLUB,
    dedupKeys: ["automation:AUT-01:rata-1:7"],
    channel: "email",
    now: NOW,
  });

  assert.equal(raggiunti.size, 0);
});

// --- letto / non letto -----------------------------------------------------

test("segnare letto funziona una volta sola, e solo per il destinatario", async () => {
  const claim = await rivendica({
    channel: "board",
    recipientUserId: "utente-1",
  });
  await modulo.settleDelivery({ id: claim.id, status: "sent", now: NOW });

  const primo = await modulo.markDeliveryRead({
    organizationId: CLUB,
    deliveryId: claim.id,
    userId: "utente-1",
    now: NOW,
  });
  assert.equal(primo, true);

  const secondo = await modulo.markDeliveryRead({
    organizationId: CLUB,
    deliveryId: claim.id,
    userId: "utente-1",
    now: new Date(NOW.getTime() + 60000),
  });
  assert.equal(secondo, false, "una seconda apertura non sposta la data");

  const riga = fake.rows("communicationDelivery")[0];
  assert.equal(riga.read_at.toISOString(), NOW.toISOString());
});

test("un altro utente non puo segnare letto la consegna di qualcun altro", async () => {
  const claim = await rivendica({
    channel: "board",
    recipientUserId: "utente-1",
  });

  const esito = await modulo.markDeliveryRead({
    organizationId: CLUB,
    deliveryId: claim.id,
    userId: "utente-2",
    now: NOW,
  });

  assert.equal(esito, false);
});
