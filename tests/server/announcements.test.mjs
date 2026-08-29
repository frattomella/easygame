import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * La bacheca: il servizio (W2-D, G-08).
 *
 * **Le tre cose che contano.** Che un annuncio raggiunga **solo** il suo
 * pubblico — targeting sbagliato significa mostrare a una famiglia gli avvisi
 * di un'altra categoria; che pubblicarlo due volte non suoni due volte; e che
 * il letto/non letto passi dal registro delle consegne invece di essere il
 * quarto meccanismo di questo prodotto a rispondere alla stessa domanda.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "aaaaaaaa-0000-4000-8000-000000000002";
const UTENTE_U14 = "cccccccc-0000-4000-8000-00000000000a";
const UTENTE_U16 = "cccccccc-0000-4000-8000-00000000000b";
const NOW = new Date("2026-10-05T10:00:00Z");

let modulo;
let setPrismaClientForTests;
let fake;

const scope = (organizationId = CLUB, activeRole = "owner") => ({
  userId: "dddddddd-0000-4000-8000-00000000000a",
  activeOrganizationId: organizationId,
  allowedOrganizationIds: [organizationId],
  activeRole,
});

const seed = () => ({
  club: [
    { id: CLUB, name: "ASD Alfa", club_sites: [] },
    { id: ALTRO_CLUB, name: "ASD Beta", club_sites: [] },
  ],
  athlete: [
    {
      id: "a1",
      organization_id: CLUB,
      first_name: "Luca",
      last_name: "Bianchi",
      status: "active",
      category_id: "u14",
      category_memberships: [{ category_id: "u14", categoryId: "u14" }],
      data: {
        guardians: [
          { name: "Maria", surname: "B", email: "u14@example.com", linkedUserId: UTENTE_U14 },
        ],
      },
    },
    {
      id: "a2",
      organization_id: CLUB,
      first_name: "Marco",
      last_name: "Verdi",
      status: "active",
      category_id: "u16",
      category_memberships: [{ category_id: "u16", categoryId: "u16" }],
      data: {
        guardians: [
          { name: "Paolo", surname: "V", email: "u16@example.com", linkedUserId: UTENTE_U16 },
        ],
      },
    },
    {
      id: "a3",
      organization_id: CLUB,
      first_name: "Anna",
      last_name: "Neri",
      status: "active",
      category_id: "u14",
      category_memberships: [{ category_id: "u14", categoryId: "u14" }],
      data: { guardians: [{ name: "Sara", surname: "N", email: "senzaccount@example.com" }] },
    },
  ],
  organizationUser: [
    { id: "ou1", organization_id: CLUB, user_id: UTENTE_U14 },
    { id: "ou2", organization_id: CLUB, user_id: UTENTE_U16 },
  ],
  user: [
    { id: UTENTE_U14, email: "u14@example.com" },
    { id: UTENTE_U16, email: "u16@example.com" },
  ],
  clubResourceItem: [],
  communicationDelivery: [],
  athletePayment: [],
  paymentTransaction: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  modulo = await import("../../src/lib/server/announcements.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const crea = (overrides = {}, ruolo = "owner") =>
  modulo.createAnnouncement({
    draft: {
      title: "Campo chiuso",
      body: "Domenica il campo restera chiuso.",
      criteria: [{ kind: "all_families" }],
      ...overrides,
    },
    scope: scope(CLUB, ruolo),
    actorUserId: "dddddddd-0000-4000-8000-00000000000a",
  });

// --- creazione e stato -----------------------------------------------------

test("un annuncio nasce bozza e non raggiunge nessuno", async () => {
  const annuncio = await crea();

  assert.equal(annuncio.status, "draft");
  assert.equal(fake.rows("communicationDelivery").length, 0);
});

test("la riga di archivio porta il tipo giusto e il club", async () => {
  const annuncio = await crea();
  const riga = fake.rows("clubResourceItem")[0];

  assert.equal(riga.resource_type, "announcements");
  assert.equal(riga.organization_id, CLUB);
  assert.equal(riga.id, annuncio.id);
});

// --- il pubblico -----------------------------------------------------------

test("pubblicare raggiunge solo il pubblico scelto", async () => {
  const annuncio = await crea({
    criteria: [{ kind: "category_ids", values: ["u14"] }],
  });

  const esito = await modulo.publishAnnouncement({
    announcementId: annuncio.id,
    scope: scope(),
    now: NOW,
  });

  assert.equal(esito.delivered, 1, "solo la famiglia dell'Under 14");
  const consegne = fake.rows("communicationDelivery");
  assert.equal(consegne[0].recipient_user_id, UTENTE_U14);
});

test("chi non ha un account non riceve, e lo si dichiara invece di contarlo", async () => {
  const annuncio = await crea({
    criteria: [{ kind: "category_ids", values: ["u14"] }],
  });

  const esito = await modulo.publishAnnouncement({
    announcementId: annuncio.id,
    scope: scope(),
    now: NOW,
  });

  assert.equal(esito.delivered, 1);
  assert.equal(
    esito.withoutAccount,
    1,
    "la famiglia senza account non ha un posto dove leggere",
  );
});

// --- idempotenza -----------------------------------------------------------

test("pubblicare due volte non suona due volte", async () => {
  const annuncio = await crea();

  const primo = await modulo.publishAnnouncement({
    announcementId: annuncio.id,
    scope: scope(),
    now: NOW,
  });
  const secondo = await modulo.publishAnnouncement({
    announcementId: annuncio.id,
    scope: scope(),
    now: NOW,
  });

  assert.equal(primo.delivered, 2);
  assert.equal(secondo.delivered, 0);
  assert.equal(secondo.alreadyDelivered, 2);
  assert.equal(fake.rows("communicationDelivery").length, 2);
});

test("modificare un annuncio pubblicato non lo ripubblica", async () => {
  const annuncio = await crea();
  await modulo.publishAnnouncement({
    announcementId: annuncio.id,
    scope: scope(),
    now: NOW,
  });

  const modificato = await modulo.updateAnnouncement({
    announcementId: annuncio.id,
    draft: {
      title: "Campo chiuso (corretto)",
      body: "Domenica il campo restera chiuso tutto il giorno.",
      criteria: [{ kind: "all_families" }],
    },
    scope: scope(),
  });

  assert.equal(modificato.status, "published");
  assert.equal(
    fake.rows("communicationDelivery").length,
    2,
    "nessuna consegna nuova per una virgola",
  );
});

// --- la pubblicazione programmata -----------------------------------------

test("il giro notturno pubblica cio che era programmato, e solo una volta", async () => {
  const annuncio = await crea({ publishAt: "2026-10-05T08:00:00Z" });

  const primo = await modulo.publishScheduledAnnouncements({
    organizationId: CLUB,
    now: NOW,
  });
  const secondo = await modulo.publishScheduledAnnouncements({
    organizationId: CLUB,
    now: NOW,
  });

  assert.equal(primo.length, 1);
  assert.equal(primo[0].announcementId, annuncio.id);
  assert.equal(secondo.length, 0, "il secondo giro non ripubblica niente");
});

test("un annuncio programmato per domani il giro di oggi non lo tocca", async () => {
  await crea({ publishAt: "2026-10-06T08:00:00Z" });

  const esiti = await modulo.publishScheduledAnnouncements({
    organizationId: CLUB,
    now: NOW,
  });

  assert.equal(esiti.length, 0);
});

// --- la lettura ------------------------------------------------------------

test("il destinatario vede solo cio che gli e stato consegnato", async () => {
  const perU14 = await crea({
    title: "Solo Under 14",
    criteria: [{ kind: "category_ids", values: ["u14"] }],
  });
  await modulo.publishAnnouncement({
    announcementId: perU14.id,
    scope: scope(),
    now: NOW,
  });

  const bachecaU14 = await modulo.readAnnouncementsForUser({
    organizationId: CLUB,
    userId: UTENTE_U14,
    now: NOW,
  });
  const bachecaU16 = await modulo.readAnnouncementsForUser({
    organizationId: CLUB,
    userId: UTENTE_U16,
    now: NOW,
  });

  assert.equal(bachecaU14.length, 1);
  assert.equal(bachecaU16.length, 0);
});

test("un annuncio scaduto esce dalla bacheca ma resta in archivio", async () => {
  const annuncio = await crea({ expiresAt: "2026-10-04T00:00:00Z" });
  await modulo.publishAnnouncement({
    announcementId: annuncio.id,
    scope: scope(),
    now: new Date("2026-10-01T00:00:00Z"),
  });

  const bacheca = await modulo.readAnnouncementsForUser({
    organizationId: CLUB,
    userId: UTENTE_U14,
    now: NOW,
  });

  assert.equal(bacheca.length, 0);
  assert.equal(fake.rows("clubResourceItem").length, 1);
  assert.equal(fake.rows("communicationDelivery").length, 2);
});

test("segnare letto funziona una volta sola e conta nell'elenco della societa", async () => {
  const annuncio = await crea();
  await modulo.publishAnnouncement({
    announcementId: annuncio.id,
    scope: scope(),
    now: NOW,
  });

  const bacheca = await modulo.readAnnouncementsForUser({
    organizationId: CLUB,
    userId: UTENTE_U14,
    now: NOW,
  });
  assert.equal(bacheca[0].readAt, null);

  const primo = await modulo.markAnnouncementRead({
    organizationId: CLUB,
    deliveryId: bacheca[0].deliveryId,
    userId: UTENTE_U14,
    now: NOW,
  });
  const secondo = await modulo.markAnnouncementRead({
    organizationId: CLUB,
    deliveryId: bacheca[0].deliveryId,
    userId: UTENTE_U14,
    now: new Date(NOW.getTime() + 60000),
  });

  assert.equal(primo, true);
  assert.equal(secondo, false);

  const elenco = await modulo.listAnnouncements({ scope: scope(), now: NOW });
  assert.equal(elenco[0].audienceCount, 2);
  assert.equal(elenco[0].readCount, 1);
});

// --- il confine ------------------------------------------------------------

test("un annuncio di un altro club non si legge e non si pubblica", async () => {
  const annuncio = await crea();

  await assert.rejects(
    () =>
      modulo.readAnnouncementById({
        announcementId: annuncio.id,
        scope: scope(ALTRO_CLUB),
      }),
    /non trovato/,
  );

  await assert.rejects(
    () =>
      modulo.publishAnnouncement({
        announcementId: annuncio.id,
        scope: scope(ALTRO_CLUB),
        now: NOW,
      }),
    /non trovato/,
  );
});

test("l'allenatore non pubblica e non legge la bacheca della societa", async () => {
  await assert.rejects(() => crea({}, "trainer"), /Accesso negato/);

  await crea();

  /*
    La revisione di sicurezza ha trovato che `listAnnouncements` chiedeva
    `board.read`, che **tutti** i ruoli possiedono, mentre restituisce ogni
    annuncio del club — bozze comprese, con il corpo intero e i criteri scelti.
    Un genitore che chiamava la rotta senza `?mine=1` leggeva la bacheca intera
    della societa, e quando il criterio era «chi non ha pagato» sapeva anche
    che la segreteria aveva scritto alle famiglie in arretrato.

    La vista di governo chiede ora `board.publish`; chi ha solo `board.read`
    legge la **sua** bacheca, che filtra sulle consegne.
  */
  await assert.rejects(
    () => modulo.listAnnouncements({ scope: scope(CLUB, "trainer"), now: NOW }),
    /Accesso negato/,
  );

  for (const ruolo of ["parent", "athlete", "staff", "collaborator"]) {
    await assert.rejects(
      () => modulo.listAnnouncements({ scope: scope(CLUB, ruolo), now: NOW }),
      /Accesso negato/,
      `${ruolo} non deve leggere la bacheca di governo`,
    );
  }
});

test("un genitore non legge per identificativo un annuncio che non e suo", async () => {
  const perU16 = await crea({
    title: "Solo Under 16",
    criteria: [{ kind: "category_ids", values: ["u16"] }],
  });
  await modulo.publishAnnouncement({
    announcementId: perU16.id,
    scope: scope(),
    now: NOW,
  });

  await assert.rejects(
    () =>
      modulo.readAnnouncementById({
        announcementId: perU16.id,
        scope: scope(CLUB, "parent"),
      }),
    /Accesso negato/,
  );

  const bachecaU14 = await modulo.readAnnouncementsForUser({
    organizationId: CLUB,
    userId: UTENTE_U14,
    now: NOW,
  });
  assert.equal(
    bachecaU14.length,
    0,
    "e nemmeno dalla sua bacheca, che filtra sulle consegne",
  );
});

test("solo chi puo vedere i destinatari legge chi ha ricevuto cosa", async () => {
  const annuncio = await crea();
  await modulo.publishAnnouncement({
    announcementId: annuncio.id,
    scope: scope(),
    now: NOW,
  });

  await assert.rejects(
    () =>
      modulo.readAnnouncementDeliveries({
        announcementId: annuncio.id,
        scope: scope(CLUB, "trainer"),
      }),
    /Accesso negato/,
  );

  const consegne = await modulo.readAnnouncementDeliveries({
    announcementId: annuncio.id,
    scope: scope(),
  });
  assert.equal(consegne.length, 2);
});

// --- il ritiro -------------------------------------------------------------

test("ritirare toglie dalla bacheca senza cancellare le consegne", async () => {
  const annuncio = await crea();
  await modulo.publishAnnouncement({
    announcementId: annuncio.id,
    scope: scope(),
    now: NOW,
  });

  await modulo.withdrawAnnouncement({
    announcementId: annuncio.id,
    scope: scope(),
    now: NOW,
  });

  const bacheca = await modulo.readAnnouncementsForUser({
    organizationId: CLUB,
    userId: UTENTE_U14,
    now: new Date(NOW.getTime() + 1000),
  });

  assert.equal(bacheca.length, 0);
  assert.equal(
    fake.rows("communicationDelivery").length,
    2,
    "chi lo ha letto lo ha letto: il passato non si riscrive",
  );
});
