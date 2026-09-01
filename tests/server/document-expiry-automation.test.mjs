import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * L'innesco documentale: **AUT-05** (Wave 3, W3-G).
 *
 * **Perche non ci sono test «nuovi» sul motore.** Non c'e un motore nuovo: la
 * finestra, la corrispondenza esatta dell'anticipo, la deduplica per
 * occorrenza, il registro delle consegne e il riepilogo sono quelli di Wave 2,
 * gia provati da `automations-engine.test.mjs`. Qui si prova che il quinto
 * innesco **ci passa dentro** senza portarsi dietro un percorso proprio, e
 * l'unica cosa davvero nuova: che il certificato medico non produca **mai** due
 * promemoria per la stessa scadenza.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "aaaaaaaa-0000-4000-8000-000000000002";
const UTENTE = "dddddddd-0000-4000-8000-00000000000a";

/* Lunedi. Il BLSD di riferimento scade il 23 dicembre, cioe fra trenta giorni. */
const OGGI = new Date("2026-11-23T06:00:00.000Z");
const SCADENZA = new Date("2026-12-23T00:00:00.000Z");

let motore;
let setPrismaClientForTests;
let fake;
let inviate;

const postino = ({ configured = true } = {}) => ({
  isConfigured: async () => configured,
  send: async (message) => {
    inviate.push(message);
    return { status: "sent" };
  },
});

const nessunLink = async () => ({
  outcome: "entitlement_missing",
  message: "no",
});

const MODELLO = {
  subject: "{{club.name}}: {{document.title}} di {{athlete.first_name}}",
  body: [
    "Gentile {{recipient.name}},",
    "«{{document.title}}» scade il {{document.date}}.",
  ].join("\n"),
};

const atleta = (id, email, organizationId = CLUB, overrides = {}) => ({
  id,
  organization_id: organizationId,
  first_name: "Luca",
  last_name: "Bianchi",
  status: "active",
  data: { guardians: [{ name: "Maria", surname: "Bianchi", email }] },
  category_memberships: [],
  medical_certificates: [],
  ...overrides,
});

const allegato = (id, overrides = {}) => ({
  id,
  organization_id: CLUB,
  owner_type: "athlete",
  owner_id: "a1",
  category: "blsd",
  file_name: "blsd.pdf",
  mime_type: "application/pdf",
  size_bytes: 1024,
  checksum: "abc",
  storage_driver: "database",
  storage_key: null,
  valid_from: new Date("2024-12-23T00:00:00.000Z"),
  valid_until: SCADENZA,
  created_by: null,
  created_at: new Date("2024-12-23T00:00:00.000Z"),
  updated_at: new Date("2024-12-23T00:00:00.000Z"),
  ...overrides,
});

const regolaInArchivio = (organizationId, trigger, payload) => ({
  id: `res-${organizationId}-${trigger}`,
  organization_id: organizationId,
  resource_type: "automation_rules",
  name: trigger,
  status: payload.enabled ? "enabled" : "disabled",
  payload: { trigger, ...payload },
  updated_at: new Date("2026-11-01T00:00:00.000Z"),
});

const regolaDocumenti = (organizationId = CLUB, overrides = {}) =>
  regolaInArchivio(organizationId, "document_expiry", {
    enabled: true,
    offsetDays: [30, 7],
    audience: "family",
    delivery: "immediate",
    template: MODELLO,
    ...overrides,
  });

const club = (id, name, contactEmail) => ({
  id,
  name,
  contact_email: contactEmail,
  club_sites: [],
  trainings: [],
  settings: {},
});

const seed = (overrides = {}) => ({
  club: [club(CLUB, "ASD Alfa", "segreteria@alfa.example")],
  athlete: [atleta("a1", "maria@example.com")],
  attachment: [allegato("att-1")],
  athletePayment: [],
  paymentTransaction: [],
  organizationUser: [],
  user: [],
  clubResourceItem: [regolaDocumenti()],
  communicationDelivery: [],
  notification: [],
  auditLog: [],
  clubEvent: [],
  clubEventParticipant: [],
  paymentLink: [],
  ...overrides,
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  motore = await import("../../src/lib/server/automations.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
  inviate = [];
});

const monta = (overrides) => {
  fake = createFakePrisma(seed(overrides));
  setPrismaClientForTests(fake.client);
};

const gira = (options = {}) =>
  motore.runAutomationsForClub({
    organizationId: options.organizationId || CLUB,
    now: options.now || OGGI,
    scope: options.scope,
    mailer: options.mailer || postino(options),
    issueLink: nessunLink,
  });

/* ------------------------------------------------ D1 - il messaggio parte */

test("D1: un documento che scade fra trenta giorni produce un messaggio", async () => {
  const esito = await gira();

  assert.equal(esito.occurrences, 1);
  assert.equal(esito.totals.sent, 1);
  assert.equal(inviate.length, 1);
  assert.equal(inviate[0].to, "maria@example.com");
  assert.equal(
    inviate[0].subject,
    "ASD Alfa: BLSD di Luca",
    "la sigla resta una sigla: «Blsd» sarebbe una parola che non esiste",
  );
  assert.match(inviate[0].text, /«BLSD» scade il 23\/12\/2026/);

  const righe = fake.rows("communicationDelivery");
  assert.equal(righe.length, 1);
  assert.equal(righe[0].status, "sent");
  assert.equal(
    righe[0].dedup_key,
    "automation:AUT-05:document_expiry:a1:att-1:2026-12-23:30",
    "la chiave porta l'allegato **e** la sua scadenza: un rinnovo e un'occorrenza nuova",
  );
});

test("D1b: il rinnovo dell'anno dopo e un'occorrenza nuova, non un doppione", async () => {
  await gira();
  assert.equal(inviate.length, 1);

  /* Stesso allegato — il riferimento nel record non cambia — scadenza nuova. */
  fake.rows("attachment")[0].valid_until = new Date("2027-12-23T00:00:00.000Z");

  await gira({ now: new Date("2027-11-23T06:00:00.000Z") });

  assert.equal(inviate.length, 2, "senza la data in chiave il rinnovo non partirebbe mai piu");
  assert.deepEqual(
    fake.rows("communicationDelivery").map((row) => row.dedup_key).sort(),
    [
      "automation:AUT-05:document_expiry:a1:att-1:2026-12-23:30",
      "automation:AUT-05:document_expiry:a1:att-1:2027-12-23:30",
    ],
  );
});

/* ---------------------------------------------------- D2/D3 - idempotenza */

test("D2: un secondo giro nello stesso giorno non manda niente", async () => {
  await gira();
  const secondo = await gira();

  assert.equal(inviate.length, 1);
  assert.equal(secondo.totals.sent, 0);
  assert.equal(secondo.totals.skipped, 1);
  assert.equal(secondo.deliveries[0].reason, "already_sent");
  assert.equal(fake.rows("communicationDelivery").length, 1);
});

test("D3: due esecuzioni in parallelo non producono doppioni", async () => {
  await Promise.all([gira(), gira()]);

  assert.equal(
    inviate.length,
    1,
    "la difesa e l'indice unico del registro, non un controllo in memoria",
  );
  assert.equal(fake.rows("communicationDelivery").length, 1);
});

/* ------------------------------------------------------- D4/D5 - anticipi */

test("D4: i due anticipi producono due messaggi, uno per anticipo", async () => {
  await gira();
  await gira({ now: new Date("2026-12-16T06:00:00.000Z") });

  assert.equal(inviate.length, 2);
  assert.deepEqual(
    fake.rows("communicationDelivery").map((row) => row.dedup_key).sort(),
    [
      "automation:AUT-05:document_expiry:a1:att-1:2026-12-23:30",
      "automation:AUT-05:document_expiry:a1:att-1:2026-12-23:7",
    ],
  );
});

test("D5: un anticipo gia trascorso non recupera all'indietro", async () => {
  /* La regola viene accesa quando alla scadenza mancano venti giorni. */
  const esito = await gira({ now: new Date("2026-12-03T06:00:00.000Z") });

  assert.equal(esito.occurrences, 0);
  assert.equal(inviate.length, 0);
  assert.equal(fake.rows("communicationDelivery").length, 0);
});

test("D5b: un documento gia scaduto non produce niente", async () => {
  const esito = await gira({ now: new Date("2027-01-15T06:00:00.000Z") });

  assert.equal(
    esito.occurrences,
    0,
    "AUT-05 guarda avanti: un promemoria «rinnova entro trenta giorni» su una scadenza di tre settimane fa direbbe il falso",
  );
});

test("D5c: un allegato senza scadenza non riguarda nessuno", async () => {
  monta({ attachment: [allegato("att-1", { valid_until: null })] });

  const esito = await gira();

  assert.equal(esito.occurrences, 0);
  assert.equal(inviate.length, 0);
});

/* --------------------------------------------------------- D6 - spenta */

test("D6: una regola spenta non manda niente, e il rapporto lo dice", async () => {
  monta({ clubResourceItem: [regolaDocumenti(CLUB, { enabled: false })] });

  const esito = await gira();

  assert.equal(inviate.length, 0);
  assert.equal(esito.occurrences, 0);
  assert.equal(
    esito.rules.find((rule) => rule.trigger === "document_expiry").enabled,
    false,
  );

  assert.equal(
    fake.calls.filter((call) => call.delegate === "attachment").length,
    0,
    "una regola spenta non deve nemmeno interrogare gli allegati",
  );
});

/* ----------------------------------------- D7 - il certificato medico */

test("D7: il certificato medico non produce due promemoria", async () => {
  /*
    Lo scenario che la lane esiste per rendere impossibile: la stessa scadenza
    conosciuta da due parti — `medical_certificates.expiry_date`, che governa
    AUT-03, e l'allegato del certificato, che sarebbe governato da AUT-05.
    Entrambe le regole accese, entrambe con l'anticipo di trenta giorni.
  */
  monta({
    athlete: [
      atleta("a1", "maria@example.com", CLUB, {
        medical_certificates: [{ expiry_date: SCADENZA }],
      }),
    ],
    attachment: [
      allegato("att-medico", {
        category: "certificato-medico",
        file_name: "certificato.pdf",
      }),
    ],
    clubResourceItem: [
      regolaDocumenti(),
      regolaInArchivio(CLUB, "certificate", {
        enabled: true,
        offsetDays: [30, 7, 0],
        audience: "family",
        delivery: "immediate",
        template: {
          subject: "Certificato di {{athlete.first_name}}",
          body: "Scadenza {{medical_certificate.expiry_date}}",
        },
      }),
    ],
  });

  const esito = await gira();

  assert.equal(
    inviate.length,
    1,
    "una scadenza, un promemoria: l'allegato del certificato non ne aggiunge un secondo",
  );
  assert.equal(inviate[0].subject, "Certificato di Luca");

  const chiavi = fake.rows("communicationDelivery").map((row) => row.dedup_key);
  assert.equal(chiavi.length, 1);
  assert.match(chiavi[0], /^automation:AUT-03:certificate:/);
  assert.equal(
    chiavi.some((chiave) => chiave.includes("AUT-05")),
    false,
    "il certificato medico resta su AUT-03 e non viene migrato",
  );
});

test("D7b: chiedere le categorie mediche nel filtro non le riporta dentro", async () => {
  monta({
    attachment: [allegato("att-medico", { category: "visita-medica" })],
    clubResourceItem: [
      regolaDocumenti(CLUB, { categories: ["visita-medica", "blsd"] }),
    ],
  });

  const esito = await gira();

  assert.equal(esito.occurrences, 0);
  assert.equal(inviate.length, 0);

  const regola = esito.rules.find((rule) => rule.trigger === "document_expiry");
  assert.equal(regola.enabled, true, "la regola resta accesa: cade la categoria, non la regola");
});

/* ------------------------------------------------- D8 - il filtro */

test("D8: il filtro per categoria esclude cio che non e stato scelto", async () => {
  monta({
    attachment: [
      allegato("att-blsd", { category: "blsd" }),
      allegato("att-identita", {
        category: "documento-identita",
        file_name: "carta.pdf",
      }),
    ],
    clubResourceItem: [regolaDocumenti(CLUB, { categories: ["blsd"] })],
  });

  const esito = await gira();

  assert.equal(esito.occurrences, 1);
  assert.equal(inviate.length, 1);
  assert.match(inviate[0].subject, /BLSD/);
});

test("D8b: nessuna categoria scelta significa tutte", async () => {
  monta({
    attachment: [
      allegato("att-blsd", { category: "blsd" }),
      allegato("att-identita", {
        category: "documento-identita",
        file_name: "carta.pdf",
      }),
    ],
  });

  const esito = await gira();

  assert.equal(esito.occurrences, 2);
  assert.equal(inviate.length, 2);
});

test("D8c: il filtro si scrive come si legge, non come e salvato", async () => {
  monta({
    attachment: [allegato("att-soccorso", { category: "primo-soccorso" })],
    clubResourceItem: [
      regolaDocumenti(CLUB, { categories: ["Primo soccorso"] }),
    ],
  });

  const esito = await gira();

  assert.equal(
    esito.occurrences,
    1,
    "chi configura non deve indovinare come e scritto il trattino",
  );
});

/* ------------------------------------------------- D9 - multi-tenant */

test("D9: due club, nessuna contaminazione", async () => {
  monta({
    club: [
      club(CLUB, "ASD Alfa", "segreteria@alfa.example"),
      club(CLUB_B, "ASD Beta", "segreteria@beta.example"),
    ],
    athlete: [
      atleta("a1", "maria@example.com"),
      atleta("b1", "giulia@example.com", CLUB_B),
    ],
    attachment: [
      allegato("att-1"),
      allegato("att-b", {
        organization_id: CLUB_B,
        owner_id: "b1",
        category: "documento-identita",
      }),
    ],
    clubResourceItem: [regolaDocumenti(CLUB)],
  });

  const esito = await gira();

  assert.equal(esito.occurrences, 1, "l'allegato dell'altro club non entra nel giro");
  assert.equal(inviate.length, 1);
  assert.equal(inviate[0].to, "maria@example.com");

  const query = fake
    .calls.filter((call) => call.delegate === "attachment" && call.method === "findMany")
    .at(-1);
  assert.equal(
    query.args.where.organization_id,
    CLUB,
    "il club sta nel where, non in un filtro applicato dopo",
  );
});

test("D9b: un allegato di un atleta di un altro club non si aggancia per identificativo", async () => {
  monta({
    athlete: [atleta("a1", "maria@example.com")],
    attachment: [
      allegato("att-altrove", { organization_id: CLUB_B, owner_id: "a1" }),
    ],
  });

  const esito = await gira();

  assert.equal(esito.occurrences, 0);
  assert.equal(inviate.length, 0);
});

/* ------------------------------------------------- D10 - il perimetro */

test("D10: il documento di chi non e un atleta non produce occorrenze", async () => {
  monta({
    attachment: [
      allegato("att-allenatore", {
        owner_type: "trainer",
        owner_id: "t1",
        category: "documento-identita",
      }),
    ],
  });

  const esito = await gira();

  assert.equal(
    esito.occurrences,
    0,
    "il pubblico si risolve per atleta: un documento di un allenatore non ha una famiglia a cui scrivere",
  );
});

/* ------------------------------------------------- D11 - la societa */

test("D11: alla societa arriva il riepilogo giornaliero, uno per giorno", async () => {
  monta({
    attachment: [
      allegato("att-blsd", { category: "blsd" }),
      allegato("att-identita", {
        category: "documento-identita",
        file_name: "carta.pdf",
      }),
    ],
    clubResourceItem: [
      regolaDocumenti(CLUB, { audience: "club", delivery: "digest" }),
    ],
  });

  const esito = await gira();

  assert.equal(esito.digest.entries, 2);
  assert.equal(
    inviate.length,
    1,
    "due scadenze, una sola email alla societa: e il rimedio a trenta email al giorno",
  );
  assert.match(inviate[0].text, /BLSD/);
  assert.match(inviate[0].text, /Documento identita/);

  const secondo = await gira();
  assert.equal(inviate.length, 1, "un secondo giro non riscrive il riepilogo");
  assert.equal(secondo.digest.sent, false);
});
