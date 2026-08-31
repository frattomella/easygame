import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * ===========================================================================
 * Dodicesima tornata — chi riceve una notifica
 * ===========================================================================
 *
 * Nel modello `Notification`, `user_id: null` vuol dire «di club». Il prodotto
 * pero lo interpreta come **«di tutti»**: `getParentDashboardData` legge
 * `OR: [{ user_id: userId }, { user_id: null }]` e restituisce la riga
 * **intera**, campo `data` compreso, a qualunque genitore apra la propria area
 * famiglia.
 *
 * La stessa forma era gia stata trovata e chiusa **due volte** — nel giro
 * delle automazioni e nello scheduler del lavoro sportivo — ma le due
 * correzioni erano rimaste private ai loro moduli, e i due scrittori dell'area
 * genitore non erano mai stati toccati: la richiesta di appuntamento di una
 * famiglia, con nome del genitore, indirizzo, telefono, nome del minore e il
 * motivo scritto a mano, finiva nella bacheca di ogni altra famiglia.
 *
 * Tre implementazioni della stessa regola sono il modo in cui la quarta nasce
 * gia sbagliata. Adesso la regola ha un proprietario, e questi test presidiano
 * lui.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const PROPRIETARIO = "cccccccc-0000-4000-8000-00000000000a";
const SEGRETERIA = "cccccccc-0000-4000-8000-00000000000b";
const GENITORE = "cccccccc-0000-4000-8000-00000000000c";
const ALLENATORE = "cccccccc-0000-4000-8000-00000000000d";

let notifiche;
let ruoli;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  notifiche = await import("../../src/lib/server/club-notifications.ts");
  ruoli = await import("../../src/lib/access-roles.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const seed = () => ({
  club: [{ id: CLUB, name: "ASD Prova", creator_id: PROPRIETARIO }],
  organizationUser: [
    { id: "ou-1", organization_id: CLUB, user_id: PROPRIETARIO, role: "owner" },
    { id: "ou-2", organization_id: CLUB, user_id: SEGRETERIA, role: "staff" },
    { id: "ou-3", organization_id: CLUB, user_id: GENITORE, role: "parent" },
    { id: "ou-4", organization_id: CLUB, user_id: ALLENATORE, role: "trainer" },
  ],
  notification: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const righe = () => fake.rows("notification");

const gestione = (role) => ruoli.isManagementAccessRole(role);

test("una notifica di societa non nasce mai «di tutti»", async () => {
  await notifiche.createClubNotifications({
    clubId: CLUB,
    title: "Nuova richiesta appuntamento",
    message: "Anna Rossi ha richiesto un appuntamento per Mario Rossi.",
    type: "appointment_request",
    data: { requested_by_email: "anna@example.it", notes: "questione privata" },
    audience: gestione,
  });

  assert.ok(righe().length > 0, "qualcuno la deve ricevere");
  for (const riga of righe()) {
    assert.notEqual(
      riga.user_id,
      null,
      "`user_id: null` e la forma che l'area genitore mostra a tutte le famiglie",
    );
    assert.ok(riga.user_id, "ogni riga ha un destinatario");
  }
});

test("la ricevono solo i ruoli del perimetro dichiarato", async () => {
  await notifiche.createClubNotifications({
    clubId: CLUB,
    title: "Documento parent caricato",
    message: "Mario Rossi ha caricato: certificato",
    type: "document_uploaded",
    audience: gestione,
  });

  const destinatari = new Set(righe().map((riga) => riga.user_id));

  assert.ok(destinatari.has(PROPRIETARIO), "il proprietario la riceve");
  assert.ok(destinatari.has(SEGRETERIA), "la segreteria la riceve: e il suo lavoro");
  assert.equal(
    destinatari.has(GENITORE),
    false,
    "**nessun** genitore deve leggere la richiesta di un'altra famiglia",
  );
  assert.equal(
    destinatari.has(ALLENATORE),
    false,
    "un allenatore non gestisce gli appuntamenti della segreteria",
  );
});

/**
 * Un club il cui proprietario esiste solo in `clubs.creator_id`: la creazione
 * valorizza quella colonna **senza** scrivere una riga di appartenenza, e
 * `resolveOrganizationScopeForUser` lo riconosce da li. Senza il ripiego la
 * notifica non arriverebbe a nessuno, in silenzio.
 */
test("un club senza righe di appartenenza avvisa comunque il proprietario", async () => {
  fake.rows("organizationUser").length = 0;

  const raggiunti = await notifiche.createClubNotifications({
    clubId: CLUB,
    title: "Nuova richiesta appuntamento",
    message: "…",
    type: "appointment_request",
    audience: gestione,
  });

  assert.equal(raggiunti, 1);
  assert.equal(righe()[0].user_id, PROPRIETARIO);
});

test("zero destinatari si dichiara, non si finge un successo", async () => {
  fake.rows("organizationUser").length = 0;
  fake.rows("club")[0].creator_id = null;

  const raggiunti = await notifiche.createClubNotifications({
    clubId: CLUB,
    title: "…",
    message: "…",
    type: "appointment_request",
    audience: gestione,
  });

  assert.equal(raggiunti, 0);
  assert.equal(righe().length, 0);
});

/**
 * Il perimetro lo dichiara chi chiama, e non e lo stesso per tutti i
 * contenuti: un arretrato economico e una richiesta di appuntamento non si
 * mostrano alle stesse persone.
 */
test("il perimetro e un parametro, non una costante del modulo", async () => {
  await notifiche.createClubNotifications({
    clubId: CLUB,
    title: "Solo al proprietario",
    message: "…",
    type: "test",
    audience: (role) => ruoli.normalizeAccessRole(role) === "owner",
  });

  assert.equal(righe().length, 1);
  assert.equal(righe()[0].user_id, PROPRIETARIO);
});

/*
 * Il destinatario scelto da chi scrive — la rotta generica che accettava
 * qualunque `user_id`, o nessuno — e presidiato da
 * `tests/server/guardie-di-scrittura-e-cancellazione.test.mjs`, che esercita
 * `createResource` davvero.
 *
 * Qui c'era invece un test **statico** che leggeva `resources.ts` come stringa
 * e contava le chiamate alla guardia: passava con la guardia vuota, e infatti
 * ha continuato a passare mentre la guardia si scavalcava omettendo un campo.
 * Un test che non puo fallire per la ragione che dichiara e peggio di nessun
 * test, perche occupa il posto di quello vero.
 */
