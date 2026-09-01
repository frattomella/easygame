import assert from "node:assert/strict";
import test, { before, beforeEach, after } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Il motore di automazioni (W2-A, G-03/G-04/G-58).
 *
 * **Perche questi test contano piu della media.** E l'unica funzione del
 * prodotto che manda email a nome di una societa senza che nessuno prema un
 * pulsante. Un difetto qui non produce una schermata sbagliata: produce
 * trecento email sbagliate a famiglie reali, e non si richiamano.
 *
 * Gli scenari sono quelli decisi **prima** dello sviluppo nel §15.1 del
 * planning di Wave 2 — da A1 a A11 — piu l'invariante che li governa tutti:
 * un'automazione legge il dominio e **non lo scrive**.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "aaaaaaaa-0000-4000-8000-000000000002";
const UTENTE = "dddddddd-0000-4000-8000-00000000000a";

/* Giovedi. La rata di riferimento scade il 30, cioe fra sette giorni. */
const OGGI = new Date("2026-11-23T10:00:00");
const SCADENZA = new Date("2026-11-30T12:00:00.000Z");

let motore;
let registro;
let setPrismaClientForTests;
let fake;
let inviate;

const scope = (activeRole = "owner", organizationId = CLUB) => ({
  userId: UTENTE,
  activeOrganizationId: organizationId,
  allowedOrganizationIds: [organizationId],
  activeRole,
});

const postino = ({ configured = true, fallisce = false } = {}) => ({
  isConfigured: async () => configured,
  send: async (message) => {
    if (fallisce) throw new Error("SMTP_DELIVERY_FAILED");
    inviate.push(message);
    return { status: "sent" };
  },
});

/** Il link di pagamento non si emette nei test se nessuno lo chiede. */
const nessunLink = async () => ({
  outcome: "entitlement_missing",
  message: "no",
});

const MODELLO = {
  subject: "{{club.name}}: rata di {{athlete.first_name}}",
  body: [
    "Gentile {{recipient.name}},",
    "la rata {{installment.description}} scade il {{installment.due_date}}.",
    "Residuo: {{installment.residual_amount}}",
  ].join("\n"),
};

const atleta = (id, email, overrides = {}) => ({
  id,
  organization_id: CLUB,
  first_name: "Luca",
  last_name: "Bianchi",
  status: "active",
  data: { guardians: [{ name: "Maria", surname: "Bianchi", email }] },
  category_memberships: [],
  medical_certificates: [],
  ...overrides,
});

const rata = (id, athleteId, overrides = {}) => ({
  id,
  organization_id: CLUB,
  athlete_id: athleteId,
  amount: 130,
  due_date: SCADENZA,
  description: "Rata di novembre",
  status: "pending",
  data: {},
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

const seed = (overrides = {}) => ({
  club: [
    {
      id: CLUB,
      name: "ASD Alfa",
      contact_email: "segreteria@alfa.example",
      club_sites: [],
      trainings: [],
      settings: {},
    },
  ],
  athlete: [atleta("a1", "maria@example.com")],
  athletePayment: [rata("p1", "a1")],
  paymentTransaction: [],
  organizationUser: [],
  user: [],
  clubResourceItem: [
    regolaInArchivio(CLUB, "installment_due", {
      enabled: true,
      offsetDays: [7, 3],
      audience: "family",
      delivery: "immediate",
      template: MODELLO,
    }),
  ],
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
  registro = await import("../../src/lib/server/communication-deliveries.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
  inviate = [];
});

const gira = (options = {}) =>
  motore.runAutomationsForClub({
    organizationId: options.organizationId || CLUB,
    now: options.now || OGGI,
    scope: options.scope,
    mailer: options.mailer || postino(options),
    issueLink: options.issueLink || nessunLink,
  });

/* ------------------------------------------------- A1 - il messaggio parte */

test("A1: una rata che scade fra sette giorni produce un messaggio", async () => {
  const esito = await gira();

  assert.equal(esito.occurrences, 1);
  assert.equal(esito.totals.sent, 1);
  assert.equal(inviate.length, 1);
  assert.equal(inviate[0].to, "maria@example.com");
  assert.equal(inviate[0].subject, "ASD Alfa: rata di Luca");
  assert.match(inviate[0].text, /Rata di novembre scade il 30\/11\/2026/);
  assert.match(inviate[0].text, /Residuo: 130,00 euro/);

  const righe = fake.rows("communicationDelivery");
  assert.equal(righe.length, 1);
  assert.equal(righe[0].source_kind, "automation");
  assert.equal(righe[0].status, "sent");
  assert.equal(
    righe[0].dedup_key,
    "automation:AUT-01:installment_due:a1:p1:7",
    "la chiave dice regola, fatto, persona, occorrenza e anticipo",
  );
});

test("A1b: chi ha un account riceve anche la notifica in applicazione", async () => {
  fake = createFakePrisma(
    seed({
      athlete: [
        atleta("a1", "maria@example.com", {
          data: {
            guardians: [
              {
                name: "Maria",
                surname: "Bianchi",
                email: "maria@example.com",
                userId: UTENTE,
              },
            ],
          },
        }),
      ],
      organizationUser: [{ organization_id: CLUB, user_id: UTENTE }],
      user: [{ id: UTENTE, email: "maria@example.com" }],
    }),
  );
  setPrismaClientForTests(fake.client);

  await gira();

  const notifiche = fake.rows("notification");
  assert.equal(notifiche.length, 1);
  assert.equal(notifiche[0].user_id, UTENTE);
  assert.equal(notifiche[0].type, "automation_installment_due");

  assert.equal(
    fake.rows("communicationDelivery").filter((row) => row.channel === "in_app")
      .length,
    1,
    "anche la copia in applicazione passa dal registro, o la seconda notte ne scriverebbe un'altra",
  );
});

/* ---------------------------------------------------- A2 - l'idempotenza */

test("A2: un secondo giro nello stesso giorno non manda niente", async () => {
  await gira();
  const secondo = await gira();

  assert.equal(inviate.length, 1, "la seconda esecuzione ha riscritto");
  assert.equal(secondo.totals.sent, 0);
  assert.equal(secondo.totals.skipped, 1);
  assert.equal(secondo.deliveries[0].reason, "already_sent");
  assert.equal(fake.rows("communicationDelivery").length, 1);
});

test("A3: due esecuzioni in parallelo non producono doppioni", async () => {
  await Promise.all([gira(), gira()]);

  assert.equal(
    inviate.length,
    1,
    "la difesa e l'indice unico, non un controllo in memoria",
  );
  assert.equal(fake.rows("communicationDelivery").length, 1);
});

/* ------------------------------------------------------- A4/A5 - gli anticipi */

test("A4: due anticipi producono due messaggi, uno per anticipo", async () => {
  await gira();
  await gira({ now: new Date("2026-11-27T10:00:00") });

  assert.equal(inviate.length, 2);
  assert.deepEqual(
    fake.rows("communicationDelivery").map((row) => row.dedup_key).sort(),
    [
      "automation:AUT-01:installment_due:a1:p1:3",
      "automation:AUT-01:installment_due:a1:p1:7",
    ],
  );
});

test("A5: un anticipo gia trascorso non recupera all'indietro", async () => {
  /* La regola viene accesa quando alla scadenza mancano cinque giorni. */
  const esito = await gira({ now: new Date("2026-11-25T10:00:00") });

  assert.equal(esito.occurrences, 0);
  assert.equal(inviate.length, 0);
  assert.equal(fake.rows("communicationDelivery").length, 0);
});

/* ------------------------------------------------------- A6 - regola spenta */

test("A6: una regola spenta non manda niente, e il rapporto lo dice", async () => {
  fake = createFakePrisma(
    seed({
      clubResourceItem: [
        regolaInArchivio(CLUB, "installment_due", {
          enabled: false,
          offsetDays: [7, 3],
          audience: "family",
          delivery: "immediate",
          template: MODELLO,
        }),
      ],
    }),
  );
  setPrismaClientForTests(fake.client);

  const esito = await gira();

  assert.equal(inviate.length, 0);
  assert.equal(esito.occurrences, 0);
  assert.equal(
    esito.rules.find((rule) => rule.trigger === "installment_due").enabled,
    false,
  );
  assert.equal(esito.rules.length, 5, "le regole si dichiarano sempre tutte");
});

/* --------------------------------------------- A7 - un club rotto, uno sano */

test("A7: il club sano riceve, il rotto compare nel rapporto con il suo nome", async () => {
  fake = createFakePrisma(
    seed({
      club: [
        {
          id: CLUB,
          name: "ASD Alfa",
          contact_email: "segreteria@alfa.example",
          club_sites: [],
          trainings: [],
          settings: {},
        },
        {
          id: CLUB_B,
          name: "ASD Beta",
          club_sites: [],
          trainings: [],
          settings: {},
        },
      ],
      clubResourceItem: [
        regolaInArchivio(CLUB, "installment_due", {
          enabled: true,
          offsetDays: [7, 3],
          audience: "family",
          delivery: "immediate",
          template: MODELLO,
        }),
        /* Anticipo negativo: una configurazione che il dominio rifiuta. */
        regolaInArchivio(CLUB_B, "installment_due", {
          enabled: true,
          offsetDays: [-5],
          audience: "family",
          delivery: "immediate",
          template: MODELLO,
        }),
      ],
    }),
  );
  setPrismaClientForTests(fake.client);

  const risultati = await motore.runAutomationsForAllClubs(OGGI, {
    mailer: postino(),
    issueLink: nessunLink,
  });

  assert.equal(risultati.length, 2);

  const sano = risultati.find((row) => row.organizationId === CLUB);
  assert.equal(sano.ok, true);
  assert.equal(sano.totals.sent, 1);

  const rotto = risultati.find((row) => row.organizationId === CLUB_B);
  assert.equal(rotto.ok, false);
  assert.equal(
    rotto.clubName,
    "ASD Beta",
    "chi legge il log deve sapere quale societa e rimasta senza promemoria",
  );
  assert.match(rotto.error, /negativi/);
});

/* ------------------------------------------- A8 - la stessa email in due club */

test("A8: la stessa email di tutore in due club riceve due messaggi distinti", async () => {
  fake = createFakePrisma(
    seed({
      club: [
        {
          id: CLUB,
          name: "ASD Alfa",
          club_sites: [],
          trainings: [],
          settings: {},
        },
        {
          id: CLUB_B,
          name: "ASD Beta",
          club_sites: [],
          trainings: [],
          settings: {},
        },
      ],
      athlete: [
        atleta("a1", "maria@example.com"),
        atleta("b1", "maria@example.com", {
          organization_id: CLUB_B,
          first_name: "Sara",
          last_name: "Verdi",
        }),
      ],
      athletePayment: [
        rata("p1", "a1"),
        rata("pb1", "b1", { organization_id: CLUB_B, amount: 90 }),
      ],
      clubResourceItem: [
        regolaInArchivio(CLUB, "installment_due", {
          enabled: true,
          offsetDays: [7],
          audience: "family",
          delivery: "immediate",
          template: MODELLO,
        }),
        regolaInArchivio(CLUB_B, "installment_due", {
          enabled: true,
          offsetDays: [7],
          audience: "family",
          delivery: "immediate",
          template: MODELLO,
        }),
      ],
    }),
  );
  setPrismaClientForTests(fake.client);

  await motore.runAutomationsForAllClubs(OGGI, {
    mailer: postino(),
    issueLink: nessunLink,
  });

  assert.equal(inviate.length, 2);

  const alfa = inviate.find((message) => message.subject.includes("Alfa"));
  const beta = inviate.find((message) => message.subject.includes("Beta"));

  assert.ok(alfa && beta, "ogni club scrive con il proprio nome");
  assert.match(alfa.subject, /rata di Luca/);
  assert.match(beta.subject, /rata di Sara/);
  assert.equal(
    alfa.text.includes("Sara"),
    false,
    "nessun dato del club B nel messaggio del club A",
  );
  assert.match(alfa.text, /130,00 euro/);
  assert.match(beta.text, /90,00 euro/);

  const righe = fake.rows("communicationDelivery");
  assert.equal(righe.length, 2);
  assert.deepEqual(
    righe.map((row) => row.organization_id).sort(),
    [CLUB, CLUB_B].sort(),
  );
});

/* ------------------------------------------------- A9 - SMTP non configurato */

test("A9: senza SMTP nessuno risulta inviato, e il motivo e esplicito", async () => {
  const esito = await gira({ mailer: postino({ configured: false }) });

  assert.equal(esito.emailConfigured, false);
  assert.equal(esito.totals.sent, 0);
  assert.equal(esito.totals.failed, 1);
  assert.equal(esito.deliveries[0].reason, "email_not_configured");
  assert.equal(
    fake.rows("communicationDelivery").length,
    0,
    "senza invio non si scrive niente nel registro: la famiglia non e stata raggiunta",
  );
});

test("una consegna che fallisce resta ripetibile", async () => {
  await gira({ mailer: postino({ fallisce: true }) });

  const righe = fake.rows("communicationDelivery");
  assert.equal(righe.length, 1);
  assert.equal(righe[0].status, "failed");
  assert.equal(righe[0].reason, "delivery_failed");

  await gira();
  assert.equal(
    inviate.length,
    1,
    "un guasto SMTP non deve rendere una famiglia irraggiungibile per sempre",
  );
});

/* --------------------------------------------- A10 - il riepilogo giornaliero */

test("A10: dodici scadenze producono una sola email alla societa", async () => {
  const atleti = [];
  const rate = [];
  for (let index = 0; index < 12; index += 1) {
    atleti.push(
      atleta(`a${index}`, `tutore${index}@example.com`, {
        first_name: `Nome${index}`,
      }),
    );
    rate.push(rata(`p${index}`, `a${index}`));
  }

  fake = createFakePrisma(
    seed({
      athlete: atleti,
      athletePayment: rate,
      clubResourceItem: [
        regolaInArchivio(CLUB, "installment_due", {
          enabled: true,
          offsetDays: [7],
          audience: "club",
          delivery: "digest",
          template: MODELLO,
        }),
      ],
    }),
  );
  setPrismaClientForTests(fake.client);

  const esito = await gira();

  assert.equal(esito.occurrences, 12);
  assert.equal(esito.digest.entries, 12);
  assert.equal(inviate.length, 1, "una email al giorno, non dodici");
  assert.equal(inviate[0].to, "segreteria@alfa.example");
  assert.match(inviate[0].subject, /12 avvisi/);

  for (let index = 0; index < 12; index += 1) {
    assert.match(inviate[0].text, new RegExp(`Nome${index}`));
  }

  const secondo = await gira();
  assert.equal(inviate.length, 1, "il secondo giro non rimanda il riepilogo");
  assert.equal(secondo.digest.sent, false);
});

/* --------------------------------------------------------- A11 - la porta cron */

test("A11: la porta del cron risponde 503 senza segreto e 401 con Bearer sbagliato", async () => {
  const precedente = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;

  const { GET } = await import("../../src/app/api/v1/automations/run/route.ts");

  const senzaSegreto = await GET(
    new Request("http://127.0.0.1/api/v1/automations/run", {
      headers: { authorization: "Bearer qualunque" },
    }),
  );
  assert.equal(senzaSegreto.status, 503);

  process.env.CRON_SECRET = "un-segreto-lungo-abbastanza";

  const sbagliato = await GET(
    new Request("http://127.0.0.1/api/v1/automations/run", {
      headers: { authorization: "Bearer un-altro-segreto-diverso" },
    }),
  );
  assert.equal(sbagliato.status, 401);
  const body = await sbagliato.json();
  assert.match(body.error.message, /Accesso negato/);

  if (precedente === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = precedente;
});

/* ------------------------------------- l'invariante: il dominio non si tocca */

test("dopo un giro il dominio e byte per byte quello di prima", async () => {
  const fotografia = () =>
    JSON.stringify({
      rate: fake.rows("athletePayment"),
      incassi: fake.rows("paymentTransaction"),
      presenze: fake.rows("clubEventParticipant"),
      atleti: fake.rows("athlete"),
    });

  const prima = fotografia();
  await gira();
  const dopo = fotografia();

  assert.equal(
    prima,
    dopo,
    "un'automazione legge stato e produce comunicazioni: non scrive il dominio",
  );

  /* E cio che ha scritto e solo cio che deve: consegne, notifiche, audit. */
  assert.equal(fake.rows("communicationDelivery").length, 1);
  assert.equal(
    fake.rows("auditLog").filter((row) => row.action === "automation.run")
      .length,
    1,
  );
});

/* ------------------------------------------------------ gli altri trigger */

test("AUT-03: il certificato in scadenza scatta a trenta giorni", async () => {
  fake = createFakePrisma(
    seed({
      athlete: [
        atleta("a1", "maria@example.com", {
          medical_certificates: [
            { expiry_date: new Date("2026-12-23T12:00:00.000Z") },
          ],
        }),
      ],
      clubResourceItem: [
        regolaInArchivio(CLUB, "certificate", {
          enabled: true,
          offsetDays: [30, 7, 0],
          audience: "family",
          delivery: "immediate",
          template: {
            subject: "{{club.name}}: certificato",
            body: "Stato: {{medical_certificate.status}}, scadenza {{medical_certificate.expiry_date}}.",
          },
        }),
      ],
    }),
  );
  setPrismaClientForTests(fake.client);

  const esito = await gira();

  assert.equal(esito.occurrences, 1);
  assert.match(inviate[0].text, /scadenza 23\/12\/2026/);
  assert.equal(
    fake.rows("communicationDelivery")[0].dedup_key,
    "automation:AUT-03:certificate:a1:23/12/2026:30",
  );
});

test("AUT-03: un certificato mancante e una occorrenza sola", async () => {
  fake = createFakePrisma(
    seed({
      clubResourceItem: [
        regolaInArchivio(CLUB, "certificate", {
          enabled: true,
          offsetDays: [30, 7, 0],
          audience: "family",
          delivery: "immediate",
          template: {
            subject: "{{club.name}}: certificato",
            body: "Stato: {{medical_certificate.status}}, scadenza {{medical_certificate.expiry_date}}.",
          },
        }),
      ],
    }),
  );
  setPrismaClientForTests(fake.client);

  await gira();
  assert.equal(inviate.length, 1);
  assert.match(inviate[0].text, /Certificato mancante, scadenza non presente/);

  await gira({ now: new Date("2026-12-01T10:00:00") });
  assert.equal(
    inviate.length,
    1,
    "un promemoria ogni notte e il rumore che fa smettere di leggere",
  );
});

test("AUT-04: l'invito parte due giorni prima dell'evento", async () => {
  fake = createFakePrisma(
    seed({
      club: [
        {
          id: CLUB,
          name: "ASD Alfa",
          contact_email: "segreteria@alfa.example",
          club_sites: [],
          categories: [],
          category_groups: [],
          trainers: [],
          settings: {},
          /*
            La colonna resta perche il club di collaudo la dichiara, ma **non e
            piu la fonte**: da ADR-0098 l'evento e una riga, e sia gli inviti
            sia il pre-controllo dell'automazione leggono `club_events`. Senza
            la riga qui sotto questo test misurerebbe la proiezione, cioe
            esattamente cio che non decide piu niente.
          */
          trainings: [
            {
              id: "t1",
              title: "Allenamento Under 14",
              date: "2026-11-25",
              startTime: "18:30",
              rsvpRequired: true,
            },
          ],
        },
      ],
      clubEvent: [
        {
          id: "t1",
          organization_id: CLUB,
          kind: "training",
          status: "scheduled",
          title: "Allenamento Under 14",
          starts_at: new Date("2026-11-25T18:30:00.000Z"),
          ends_at: new Date("2026-11-25T20:00:00.000Z"),
          rsvp_required: true,
          rsvp_deadline: null,
          group_ids: [],
          category_id: null,
          site_id: null,
        },
      ],
      clubResourceItem: [
        regolaInArchivio(CLUB, "event_rsvp", {
          enabled: true,
          offsetDays: [2],
          audience: "family",
          delivery: "immediate",
          template: {
            subject: "{{club.name}}: confermi {{event.title}}?",
            body: "Quando: {{event.date}} alle {{event.time}}.",
          },
        }),
      ],
    }),
  );
  setPrismaClientForTests(fake.client);

  const esito = await gira();

  assert.equal(esito.occurrences, 1);
  assert.equal(inviate[0].subject, "ASD Alfa: confermi Allenamento Under 14?");
  assert.match(inviate[0].text, /25\/11\/2026 alle 18:30/);
});

/* ---------------------------------------------------------- il link di pagamento */

test("il link di pagamento entra nel sollecito solo se il club puo incassare", async () => {
  const precedente = process.env.AUTH_BASE_URL;
  process.env.AUTH_BASE_URL = "https://easygame.example";

  fake = createFakePrisma(
    seed({
      clubResourceItem: [
        regolaInArchivio(CLUB, "installment_due", {
          enabled: true,
          offsetDays: [7],
          audience: "family",
          delivery: "immediate",
          template: {
            subject: "{{club.name}}: rata",
            body: "Si puo pagare da qui: {{payment.link}}",
          },
        }),
      ],
    }),
  );
  setPrismaClientForTests(fake.client);

  await gira({
    issueLink: async () => ({
      outcome: "issued",
      linkId: "l1",
      token: "abc",
      path: "/pay/abc",
      expiresAt: "2026-12-30T00:00:00.000Z",
      paymentId: "p1",
      athleteId: "a1",
    }),
  });

  assert.match(inviate[0].text, /https:\/\/easygame\.example\/pay\/abc/);

  inviate = [];
  fake = createFakePrisma(
    seed({
      clubResourceItem: [
        regolaInArchivio(CLUB, "installment_due", {
          enabled: true,
          offsetDays: [7],
          audience: "family",
          delivery: "immediate",
          template: {
            subject: "{{club.name}}: rata",
            body: "Si puo pagare da qui: {{payment.link}}",
          },
        }),
      ],
    }),
  );
  setPrismaClientForTests(fake.client);

  await gira();

  assert.equal(
    inviate.length,
    1,
    "senza entitlement il sollecito parte lo stesso: meglio senza link che senza sollecito",
  );
  assert.equal(inviate[0].text.includes("http"), false);

  if (precedente === undefined) delete process.env.AUTH_BASE_URL;
  else process.env.AUTH_BASE_URL = precedente;
});

/* ------------------------------------------------------------- i permessi */

test("un allenatore non configura le automazioni", async () => {
  await assert.rejects(
    () =>
      motore.saveAutomationRule({
        organizationId: CLUB,
        rule: { trigger: "installment_due", enabled: true },
        scope: scope("trainer"),
        actorRole: "trainer",
      }),
    /Accesso negato/,
  );

  await assert.rejects(
    () =>
      motore.listAutomationRulesForClub({
        scope: scope("trainer"),
        actorRole: "trainer",
      }),
    /Accesso negato/,
  );
});

test("non si configurano le automazioni di un altro club", async () => {
  await assert.rejects(
    () =>
      motore.saveAutomationRule({
        organizationId: CLUB_B,
        rule: { trigger: "installment_due", enabled: true },
        scope: scope("owner"),
        actorRole: "owner",
      }),
    /Accesso negato/,
  );
});

test("salvare una regola la scrive con il club nel where, e lascia una riga di audit", async () => {
  const salvata = await motore.saveAutomationRule({
    organizationId: CLUB,
    rule: {
      trigger: "certificate",
      enabled: true,
      offsetDays: [3, 30],
      audience: "both",
      delivery: "digest",
      template: MODELLO,
    },
    scope: scope("owner"),
    actorRole: "owner",
  });

  assert.deepEqual(salvata.offsetDays, [30, 3]);

  const lettura = fake.lastCall("clubResourceItem", "findFirst");
  assert.equal(lettura.args.where.organization_id, CLUB);
  assert.equal(lettura.args.where.resource_type, "automation_rules");

  const riga = fake
    .rows("clubResourceItem")
    .find((row) => row.name === "certificate");
  assert.equal(riga.organization_id, CLUB);
  assert.equal(riga.payload.enabled, true);

  assert.equal(
    fake
      .rows("auditLog")
      .filter((row) => row.action === "automation.rule.changed").length,
    1,
  );
});

test("un modello con un segnaposto inventato non si salva", async () => {
  await assert.rejects(
    () =>
      motore.saveAutomationRule({
        organizationId: CLUB,
        rule: {
          trigger: "installment_due",
          enabled: true,
          template: { subject: "x", body: "Importo: {{importo}}" },
        },
        scope: scope("owner"),
        actorRole: "owner",
      }),
    /segnaposto che non esistono/,
  );
});

/* --------------------------------------------- la forma della chiave e una sola */

test("la chiave dell'automazione ha la forma del registro delle consegne", () => {
  const parti = ["automation", "AUT-01", "installment_due", "a1", "p1", 7];

  assert.equal(
    registro.buildDedupKey(...parti),
    "automation:AUT-01:installment_due:a1:p1:7",
    "se la forma del registro cambiasse, la chiave dell'automazione andrebbe cambiata con lei",
  );
});

after(() => {
  setPrismaClientForTests(null);
});
