import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Le altre falle trovate dalle revisioni indipendenti di fine Wave 2, scritte
 * nel verso giusto: il perimetro dell'RSVP, il destinatario delle notifiche di
 * societa, la deduplica della comunicazione massiva e il certificato gia
 * scaduto.
 *
 * Sono qui e non nelle suite di lane perche nascono tutte dalla stessa
 * domanda — «chi legge davvero questo dato, e chi lo riceve» — e perche il
 * commento che le accompagna vale piu dell'asserzione: fra un anno conta
 * sapere **perche** erano gravi.
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "aaaaaaaa-0000-4000-8000-000000000002";
const PROPRIETARIO_A = "cccccccc-0000-4000-8000-00000000000a";
const GENITORE = "cccccccc-0000-4000-8000-00000000000b";
const NOW = new Date("2026-10-05T10:00:00Z");

let rsvp;
let automazioni;
let comunicazioni;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  rsvp = await import("../../src/lib/server/rsvp.ts");
  automazioni = await import("../../src/lib/server/automations.ts");
  comunicazioni = await import("../../src/lib/server/communications.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const allenamentoB = {
  id: "training-b",
  title: "Allenamento del club B",
  date: "2026-10-06",
  startsAt: "2026-10-06T18:00:00.000Z",
  rsvpRequired: true,
  status: "scheduled",
};

const seed = () => ({
  club: [
    { id: CLUB_A, name: "ASD Alfa", club_sites: [], trainings: [] },
    { id: CLUB_B, name: "ASD Beta", club_sites: [], trainings: [allenamentoB] },
  ],
  athlete: [
    {
      id: "b1",
      organization_id: CLUB_B,
      first_name: "Sofia",
      last_name: "Rossi",
      status: "active",
      category_memberships: [],
      data: { guardians: [] },
    },
  ],
  organizationUser: [
    { id: "ou1", organization_id: CLUB_A, user_id: PROPRIETARIO_A, role: "owner" },
    { id: "ou2", organization_id: CLUB_B, user_id: PROPRIETARIO_A, role: "parent" },
    { id: "ou3", organization_id: CLUB_A, user_id: GENITORE, role: "parent" },
  ],
  user: [
    { id: PROPRIETARIO_A, email: "anna@example.com" },
    { id: GENITORE, email: "genitore@example.com" },
  ],
  trainingAttendance: [
    {
      id: "ta1",
      organization_id: CLUB_B,
      training_id: "training-b",
      athlete_id: "b1",
      status: "pending",
      rsvp_status: "no",
      rsvp_note: "in vacanza dal 3 al 12, non dirlo a nessuno",
    },
  ],
  communicationDelivery: [],
  clubResourceItem: [],
  notification: [],
  athletePayment: [],
  paymentTransaction: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

/* ================================================================== RSVP === */

test("il riepilogo RSVP si legge sul club attivo, non su uno dichiarato", async () => {
  /*
    La falla: il permesso veniva valutato su `activeRole`, cioe sul club
    dell'intestazione, e le righe si sceglievano su un `organization_id`
    arrivato dalla **query string**, verificato solo contro «e fra quelli a cui
    hai accesso». Fra i due c'era un buco che una persona qualunque
    attraversava: chi e proprietario del proprio club **e genitore nel club del
    figlio** — la situazione piu ordinaria che ci sia — passava il permesso come
    proprietario del primo e leggeva il riepilogo del secondo, con i nomi di
    tutti gli atleti attesi e le **note libere delle famiglie**. Come genitore,
    in quel club, non avrebbe `rsvp.read` affatto.
  */
  const scopeMisto = {
    userId: PROPRIETARIO_A,
    activeOrganizationId: CLUB_A,
    allowedOrganizationIds: [CLUB_A, CLUB_B],
    activeRole: "owner",
  };

  await assert.rejects(
    () =>
      rsvp.readEventRsvpSummary({
        organizationId: CLUB_B,
        trainingId: "training-b",
        scope: scopeMisto,
        now: NOW,
      }),
    /Accesso negato/,
    "il ruolo e il club su cui si opera devono parlare dello stesso club",
  );
});

test("la nota privata di una famiglia non esce dal suo club", async () => {
  const scopeMisto = {
    userId: PROPRIETARIO_A,
    activeOrganizationId: CLUB_A,
    allowedOrganizationIds: [CLUB_A, CLUB_B],
    activeRole: "owner",
  };

  let uscita = "";
  try {
    const riepilogo = await rsvp.readEventRsvpSummary({
      organizationId: CLUB_B,
      trainingId: "training-b",
      scope: scopeMisto,
      now: NOW,
    });
    uscita = JSON.stringify(riepilogo);
  } catch {
    uscita = "";
  }

  assert.equal(
    uscita.includes("non dirlo a nessuno"),
    false,
    "la nota della famiglia del club B non deve comparire da nessuna parte",
  );
});

/* ============================================ le notifiche di societa === */

test("una notifica di societa e indirizzata, non di club", async () => {
  /*
    La falla: le notifiche verso la societa nascevano con `user_id: null`, che
    nel modello significa «di club» e che il prodotto interpreta come «di
    tutti»: `parent-dashboard.ts` legge `OR: [{ user_id }, { user_id: null }]`,
    e `notifications` sta fra le risorse che un allenatore puo elencare. Il
    contenuto pero e economico e **nominativo** — «Rata scaduta: Mario Rossi,
    130,00 € da versare» — e il riepilogo giornaliero e l'elenco completo delle
    famiglie in arretrato, ordinato per cognome. Il permesso
    `communications.audience_economic` veniva aggirato dal **canale di uscita**
    invece che dal criterio: il giorno dopo ogni genitore lo leggeva nella
    propria area famiglia.
  */
  fake.rows("athlete").push({
    id: "a1",
    organization_id: CLUB_A,
    first_name: "Mario",
    last_name: "Rossi",
    status: "active",
    category_memberships: [],
    medical_certificates: [],
    data: { guardians: [{ name: "Anna", surname: "Rossi", email: "anna@example.com" }] },
  });
  fake.rows("athletePayment").push({
    id: "rata-1",
    organization_id: CLUB_A,
    athlete_id: "a1",
    description: "Rata di novembre",
    amount: 130,
    due_date: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
    status: "pending",
    data: {},
  });
  fake.rows("clubResourceItem").push({
    id: "regola-1",
    organization_id: CLUB_A,
    resource_type: "automation_rules",
    name: "installment_overdue",
    status: "enabled",
    payload: {
      trigger: "installment_overdue",
      enabled: true,
      offsetDays: [1],
      audience: "club",
      delivery: "immediate",
    },
  });

  await automazioni.runAutomationsForClub({
    organizationId: CLUB_A,
    now: NOW,
    mailer: { isConfigured: async () => false, send: async () => ({ status: "skipped" }) },
  });

  const notifiche = fake.rows("notification");

  assert.equal(
    notifiche.some((riga) => riga.user_id === null || riga.user_id === undefined),
    false,
    "nessuna notifica economica deve essere «di club»: la leggerebbe ogni genitore",
  );

  for (const riga of notifiche) {
    assert.equal(
      riga.user_id,
      PROPRIETARIO_A,
      "il solo destinatario e chi puo gia vedere quel dato",
    );
  }

  assert.equal(
    notifiche.some((riga) => riga.user_id === GENITORE),
    false,
    "il genitore non riceve la posizione economica di un'altra famiglia",
  );
});

/* ============================== la deduplica della comunicazione massiva === */

test("senza identificativo dichiarato, la deduplica non si azzera al cambio d'ora", () => {
  /*
    La falla: il ripiego metteva nella chiave il **numero d'ora**, quindi due
    invii a un secondo di distanza a cavallo delle 11:00 producevano due chiavi
    diverse — nessuna esclusione, e tutti ricevevano una seconda volta. Ci
    passava il ciclo «Continua: restano N» e ogni client dell'API che non
    dichiara un identificativo.
  */
  const criteria = [{ kind: "all_families" }];
  const template = { subject: "Convocazione", body: "Domenica alle 9." };

  const prima = comunicazioni.resolveCommunicationId({ criteria, template });
  const dopo = comunicazioni.resolveCommunicationId({ criteria, template });

  assert.equal(prima.id, dopo.id, "lo stesso contenuto e lo stesso invio");
  assert.equal(prima.derived, true, "e dichiarato derivato");

  const dichiarato = comunicazioni.resolveCommunicationId({
    declared: "com-42",
    criteria,
    template,
  });
  assert.equal(dichiarato.id, "com-42");
  assert.equal(
    dichiarato.derived,
    false,
    "un identificativo dichiarato descrive un gesto e non scade",
  );

  const altroTesto = comunicazioni.resolveCommunicationId({
    criteria,
    template: { subject: "Convocazione", body: "Domenica alle 10." },
  });
  assert.notEqual(
    prima.id,
    altroTesto.id,
    "un messaggio diverso resta un invio diverso",
  );
});

/* ================================================ il certificato scaduto === */

const accendiCertificato = () => {
  fake.rows("clubResourceItem").push({
    id: "regola-cert",
    organization_id: CLUB_A,
    resource_type: "automation_rules",
    name: "certificate",
    status: "enabled",
    payload: {
      trigger: "certificate",
      enabled: true,
      offsetDays: [30, 7, 0],
      audience: "family",
      delivery: "immediate",
    },
  });
};

const atletaConCertificato = (scadenza) => ({
  id: "a-cert",
  organization_id: CLUB_A,
  first_name: "Giulia",
  last_name: "Neri",
  status: "active",
  category_memberships: [],
  medical_certificates: [{ id: "cert-1", expiry_date: scadenza }],
  data: {
    guardians: [{ name: "Anna", surname: "Neri", email: "anna.neri@example.com" }],
  },
});

const raccogliMessaggi = async () => {
  const inviate = [];
  await automazioni.runAutomationsForClub({
    organizationId: CLUB_A,
    now: NOW,
    mailer: {
      isConfigured: async () => true,
      send: async (messaggio) => {
        inviate.push(messaggio);
        return { status: "sent" };
      },
    },
  });
  return inviate;
};

test("un certificato gia scaduto produce un messaggio, una volta sola", async () => {
  /*
    La falla: il catalogo promette a chi configura la regola «manca, sta per
    scadere o **e scaduto**», ma gli anticipi guardano avanti e scartavano ogni
    distanza negativa. Bastava che il giro notturno saltasse il giorno esatto
    della scadenza — una notte sola, un guasto, un deploy — perche quel
    certificato non producesse mai piu niente. Ed e il caso che conta di piu:
    un atleta con il certificato scaduto **non puo scendere in campo**.
  */
  accendiCertificato();
  fake.rows("athlete").push(
    atletaConCertificato(new Date(NOW.getTime() - 40 * 24 * 60 * 60 * 1000)),
  );

  const primo = await raccogliMessaggi();
  assert.equal(primo.length, 1, "il certificato scaduto avvisa la famiglia");

  const secondo = await raccogliMessaggi();
  assert.equal(
    secondo.length,
    0,
    "e non ricomincia ogni notte: l'occorrenza e una sola",
  );
});

test("un certificato ancora valido e lontano non avvisa nessuno", async () => {
  accendiCertificato();
  fake.rows("athlete").push(
    atletaConCertificato(new Date(NOW.getTime() + 120 * 24 * 60 * 60 * 1000)),
  );

  assert.deepEqual(
    await raccogliMessaggi(),
    [],
    "nessun anticipo corrisponde, quindi nessun messaggio",
  );
});
