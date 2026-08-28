import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Il giro automatico dei promemoria sui certificati medici.
 *
 * Una cosa conta piu di tutte le altre: **rieseguirlo non deve produrre niente
 * di nuovo**. Un promemoria al giorno per la stessa scadenza non fa arrivare
 * prima il certificato: fa smettere di leggere, e la volta che il promemoria
 * conta davvero non lo vede nessuno. La finestra di riguardo vale **anche se
 * il promemoria e stato letto**: per una persona in segreteria un promemoria
 * letto e ignorato merita un sollecito, per un cron e un doppione.
 *
 * Le altre tre:
 *
 * - un certificato valido non genera niente;
 * - un club che fallisce non ferma gli altri;
 * - il promemoria di un club non raggiunge l'account di un altro club, anche
 *   quando i due account hanno la stessa email in anagrafica.
 */

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";

const ATLETA_A = "11111111-0000-4000-8000-00000000000a";
const ATLETA_VALIDO = "11111111-0000-4000-8000-00000000000b";
const ATLETA_SOLO = "11111111-0000-4000-8000-00000000000c";
const ATLETA_B = "11111111-0000-4000-8000-00000000000d";

const GENITORE_A = "22222222-0000-4000-8000-00000000000a";
const GENITORE_B = "22222222-0000-4000-8000-00000000000b";

const EMAIL_CONDIVISA = "genitore@example.com";

const NOW = new Date("2026-09-10T07:00:00Z");

let reminders;
let setPrismaClientForTests;
let fake;

const certificato = (id, organizationId, athleteId, expiry) => ({
  id,
  organization_id: organizationId,
  athlete_id: athleteId,
  type: "Agonistico",
  expiry_date: expiry,
});

const atleta = (id, organizationId, overrides = {}) => ({
  id,
  organization_id: organizationId,
  first_name: "Luca",
  last_name: "Bianchi",
  status: "active",
  data: { guardians: [{ email: EMAIL_CONDIVISA }] },
  medical_certificates: [],
  ...overrides,
});

const seed = () => ({
  club: [
    { id: CLUB_A, name: "ASD Alfa" },
    { id: CLUB_B, name: "ASD Beta" },
  ],
  user: [
    { id: GENITORE_A, email: EMAIL_CONDIVISA },
    { id: GENITORE_B, email: EMAIL_CONDIVISA },
  ],
  organizationUser: [
    { organization_id: CLUB_A, user_id: GENITORE_A, role: "parent" },
    { organization_id: CLUB_B, user_id: GENITORE_B, role: "parent" },
  ],
  athlete: [
    atleta(ATLETA_A, CLUB_A, {
      medical_certificates: [
        certificato(
          "cert-scaduto",
          CLUB_A,
          ATLETA_A,
          new Date("2026-06-30T00:00:00Z"),
        ),
      ],
    }),
    atleta(ATLETA_VALIDO, CLUB_A, {
      first_name: "Sara",
      medical_certificates: [
        certificato(
          "cert-valido",
          CLUB_A,
          ATLETA_VALIDO,
          new Date("2027-06-30T00:00:00Z"),
        ),
      ],
    }),
    atleta(ATLETA_B, CLUB_B, {
      first_name: "Marco",
      medical_certificates: [
        certificato(
          "cert-scaduto-b",
          CLUB_B,
          ATLETA_B,
          new Date("2026-06-30T00:00:00Z"),
        ),
      ],
    }),
  ],
});

/**
 * Il doppio non applica i valori predefiniti delle colonne: `created_at` lo
 * scrive il database. Senza questo, la finestra di riguardo non troverebbe mai
 * le notifiche appena create e l'idempotenza risulterebbe provata per il
 * motivo sbagliato.
 */
const timbraNotifiche = (istante) => {
  for (const row of fake.rows("notification")) {
    if (!row.created_at) row.created_at = istante;
  }
};

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  reminders = await import(
    "../../src/lib/server/medical-certificate-reminders.ts"
  );
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const notifiche = () =>
  fake.rows("notification").filter((row) => row.organization_id === CLUB_A);

test("un certificato scaduto genera un promemoria al tutore", async () => {
  const esito = await reminders.runMedicalCertificateRemindersForClub(
    CLUB_A,
    NOW,
  );

  assert.equal(esito.ok, true);
  assert.equal(esito.athletes, 1, "solo l'atleta con il certificato scaduto");
  assert.equal(esito.created, 1);
  assert.equal(esito.recipients, 1);

  const [notifica] = notifiche();
  assert.equal(notifica.user_id, GENITORE_A);
  assert.equal(notifica.type, "medical_certificate_reminder");
  assert.equal(
    notifica.data.key,
    `medical_certificate_reminder:${ATLETA_A}:cert-scaduto`,
    "la chiave e deterministica: e cio su cui si regge l'idempotenza",
  );
});

test("rieseguire il giro non manda un secondo promemoria", async () => {
  await reminders.runMedicalCertificateRemindersForClub(CLUB_A, NOW);
  timbraNotifiche(NOW);

  const secondo = await reminders.runMedicalCertificateRemindersForClub(
    CLUB_A,
    new Date("2026-09-11T07:00:00Z"),
  );

  assert.equal(secondo.created, 0);
  assert.equal(secondo.skipped, 1);
  assert.equal(
    notifiche().length,
    1,
    "sette notti di fila con lo stesso promemoria e il modo in cui un avviso smette di essere letto",
  );
});

test("la finestra di riguardo non guarda se il promemoria e stato letto", async () => {
  await reminders.runMedicalCertificateRemindersForClub(CLUB_A, NOW);
  timbraNotifiche(NOW);
  for (const row of fake.rows("notification")) row.read = true;

  const secondo = await reminders.runMedicalCertificateRemindersForClub(
    CLUB_A,
    new Date("2026-09-12T07:00:00Z"),
  );

  assert.equal(
    secondo.created,
    0,
    "per un cron un promemoria gia letto e un doppione, non un sollecito",
  );
  assert.equal(notifiche().length, 1);
});

test("passata la finestra il promemoria torna", async () => {
  await reminders.runMedicalCertificateRemindersForClub(CLUB_A, NOW);
  timbraNotifiche(NOW);

  const dopo = await reminders.runMedicalCertificateRemindersForClub(
    CLUB_A,
    new Date("2026-09-20T07:00:00Z"),
  );

  assert.equal(
    dopo.created,
    1,
    "sette giorni sono il tempo per prendere un appuntamento, non un silenzio definitivo",
  );
});

test("un certificato valido non genera niente", async () => {
  fake.rows("athlete").splice(0, 1);

  const esito = await reminders.runMedicalCertificateRemindersForClub(
    CLUB_A,
    NOW,
  );

  assert.equal(esito.athletes, 0);
  assert.equal(esito.created, 0);
  assert.equal(notifiche().length, 0);
});

test("un certificato vecchio non conta se ce n'e uno nuovo valido", async () => {
  fake.rows("athlete")[0].medical_certificates.push(
    certificato("cert-nuovo", CLUB_A, ATLETA_A, new Date("2027-06-30T00:00:00Z")),
  );

  const esito = await reminders.runMedicalCertificateRemindersForClub(
    CLUB_A,
    NOW,
  );

  assert.equal(
    esito.athletes,
    0,
    "conta la scadenza piu lontana: un atleta in regola non va avvisato del contrario",
  );
});

test("un atleta senza tutori raggiungibili finisce in skipped, non in errore", async () => {
  fake.rows("athlete").push(
    atleta(ATLETA_SOLO, CLUB_A, {
      first_name: "Nadia",
      data: {},
      medical_certificates: [],
    }),
  );

  const esito = await reminders.runMedicalCertificateRemindersForClub(
    CLUB_A,
    NOW,
  );

  assert.equal(esito.ok, true);
  assert.equal(esito.athletes, 2, "certificato mancante e un motivo di avviso");
  assert.equal(esito.created, 1);
  assert.equal(
    esito.skipped,
    1,
    "un tutore non collegato e un dato mancante in anagrafica, non un guasto del giro",
  );
});

test("il promemoria di un club non raggiunge l'account di un altro club", async () => {
  await reminders.runMedicalCertificateRemindersForClub(CLUB_A, NOW);

  const destinatari = fake.rows("notification").map((row) => row.user_id);

  assert.deepEqual(destinatari, [GENITORE_A]);
  assert.ok(
    !destinatari.includes(GENITORE_B),
    "la stessa email puo esistere in due societa: senza il vincolo di iscrizione il promemoria passa il confine",
  );
});

test("ogni lettura del giro filtra per club", async () => {
  await reminders.runMedicalCertificateRemindersForClub(CLUB_A, NOW);

  const letture = fake.calls.filter(
    (chiamata) =>
      chiamata.delegate === "athlete" && chiamata.method === "findMany",
  );

  assert.ok(letture.length > 0);
  for (const lettura of letture) {
    assert.equal(lettura.args.where.organization_id, CLUB_A);
  }

  const notificheLette = fake.calls.filter(
    (chiamata) =>
      chiamata.delegate === "notification" && chiamata.method === "findMany",
  );
  for (const lettura of notificheLette) {
    assert.equal(lettura.args.where.organization_id, CLUB_A);
  }
});

test("il giro su tutti i club non si ferma al primo che fallisce", async () => {
  const originale = fake.client.athlete.findMany;
  fake.client.athlete.findMany = async (args = {}) => {
    if (args.where?.organization_id === CLUB_A) {
      throw new Error("database non raggiungibile");
    }
    return originale(args);
  };

  const esito = await reminders.runMedicalCertificateRemindersForAllClubs(NOW);

  assert.equal(esito.processedClubs, 2);
  assert.equal(esito.failed, 1);

  const alfa = esito.results.find((row) => row.organizationId === CLUB_A);
  const beta = esito.results.find((row) => row.organizationId === CLUB_B);

  assert.equal(alfa.ok, false);
  assert.match(alfa.error, /non raggiungibile/);
  assert.equal(alfa.clubName, "ASD Alfa");
  assert.equal(
    beta.ok,
    true,
    "il rapporto deve dire quale club e rimasto indietro, non solo che qualcosa non ha funzionato",
  );
  assert.equal(beta.created, 1);
});

test("il giro lascia una riga di audit per club", async () => {
  await reminders.runMedicalCertificateRemindersForClub(CLUB_A, NOW);

  const riga = fake
    .rows("auditLog")
    .find((row) => row.action === "medical_certificate_reminder.run");

  assert.ok(riga, "«il promemoria e partito?» non ha risposta senza una traccia");
  assert.equal(riga.organization_id, CLUB_A);
  assert.equal(riga.resource, "medical_certificates");
  assert.equal(riga.metadata.created, 1);
  assert.equal(riga.metadata.athletes, 1);
});

/* ------------------------------------------------------- le porte del cron */

const sourceOf = (relativePath) =>
  fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8");

test("la porta del cron dei promemoria non risponde a un Bearer sbagliato", () => {
  const source = sourceOf("src/app/api/medical-certificate-reminders/route.ts");
  const get = source.slice(source.indexOf("export async function GET"));

  /*
    La porta delega al gate condiviso (`src/lib/server/cron-auth.ts`), che
    pretende `CRON_SECRET` in **ogni** ambiente e confronta il Bearer a tempo
    costante. Prima questa rotta aveva la sua copia della regola, con la
    scorciatoia «fuori da produzione passa comunque»: una `GET` anonima
    mandava email a tutte le famiglie di tutti i club. Il comportamento e
    provato in `tests/server/cron-auth.test.mjs`.
  */
  assert.match(get, /authorizeCronRequest\(/);
  assert.doesNotMatch(
    get,
    /NODE_ENV/,
    "qui mandava email: nessuna scorciatoia fuori da produzione",
  );
  assert.doesNotMatch(get, /!==\s*`Bearer/);
  assert.match(get, /runMedicalCertificateRemindersForAllClubs/);
});

test("le quattro porte periodiche hanno uno scheduler", () => {
  const vercel = JSON.parse(sourceOf("vercel.json"));
  const percorsi = vercel.crons.map((cron) => cron.path);

  assert.deepEqual(percorsi, [
    "/api/v1/sport-work/scheduler",
    "/api/v1/training-automation",
    "/api/v1/maintenance",
    "/api/medical-certificate-reminders",
  ]);

  const orari = vercel.crons.map((cron) => cron.schedule);
  assert.equal(
    new Set(orari).size,
    orari.length,
    "quattro giri alla stessa ora si contendono le stesse connessioni al database",
  );
});

// --- il validatore dell'identificativo ----------------------------------------

test("l'identificativo dell'atleta si valida con la forma giusta di UUID", async () => {
  const { UUID_PATTERN } = await import(
    "../../src/lib/server/medical-certificate-reminders.ts"
  );

  /*
    Il difetto: la rotta a mano portava una forma a **quattro** gruppi
    (`...-[89ab][0-9a-f]{12}$`, senza il penultimo). Non corrisponde a nessun
    UUID reale, quindi `POST /api/medical-certificate-reminders` rispondeva
    «Atleta non valido» a qualunque atleta e il pulsante «Sollecita» della
    segreteria non ha mai mandato niente.
  */
  const TRONCATA = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
  const uuidVero = "11111111-2222-4333-8444-555555555555";

  assert.equal(TRONCATA.test(uuidVero), false, "la forma vecchia non riconosceva niente");
  assert.equal(UUID_PATTERN.test(uuidVero), true);
  assert.equal(UUID_PATTERN.test("11111111-2222-4333-8444-55555555555"), false);
  assert.equal(UUID_PATTERN.test("non-un-uuid"), false);
  assert.equal(UUID_PATTERN.test(""), false);
});

test("la rotta non tiene una copia propria del validatore", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src", "app", "api", "medical-certificate-reminders", "route.ts"),
    "utf8",
  );

  assert.doesNotMatch(
    source,
    /const UUID_PATTERN\s*=/,
    "il validatore ha un proprietario solo: due copie sono due occasioni di sbagliarne una",
  );
  assert.match(source, /UUID_PATTERN,\n\} from "@\/lib\/server\/medical-certificate-reminders"/);
});
