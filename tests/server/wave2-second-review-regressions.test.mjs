import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Cio che la **seconda** tornata di revisioni ha trovato, scritto nel verso
 * giusto.
 *
 * La prima correzione aveva chiuso due CRITICAL e sette HIGH; la seconda
 * revisione ha trovato che tre di quelle chiusure lasciavano una porta accanto
 * aperta, e che due correzioni ne avevano introdotto altrettanti difetti. E la
 * ragione per cui una seconda revisione indipendente esiste: il posto piu
 * probabile in cui nasce un difetto e una correzione fatta in fretta.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "aaaaaaaa-0000-4000-8000-000000000002";
const PROPRIETARIO = "cccccccc-0000-4000-8000-00000000000a";
const ALLENATORE = "cccccccc-0000-4000-8000-00000000000b";
const GENITORE = "cccccccc-0000-4000-8000-00000000000c";
const NOW = new Date("2026-10-05T10:00:00Z");

let risorse;
let registro;
let bacheca;
let automazioni;
let comunicazioni;
let link;
let setPrismaClientForTests;
let fake;

const scope = (userId, activeRole, organizationId = CLUB) => ({
  userId,
  activeOrganizationId: organizationId,
  allowedOrganizationIds: [organizationId],
  activeRole,
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  risorse = await import("../../src/lib/server/resources.ts");
  registro = await import("../../src/lib/server/communication-deliveries.ts");
  bacheca = await import("../../src/lib/server/announcements.ts");
  automazioni = await import("../../src/lib/server/automations.ts");
  comunicazioni = await import("../../src/lib/server/communications.ts");
  link = await import("../../src/lib/server/payment-links.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const seed = () => ({
  club: [
    { id: CLUB, name: "ASD Alfa", club_sites: [], creator_id: PROPRIETARIO },
    { id: ALTRO_CLUB, name: "ASD Beta", club_sites: [] },
  ],
  athlete: [
    {
      id: "a1",
      organization_id: CLUB,
      first_name: "Luca",
      last_name: "Bianchi",
      status: "active",
      category_memberships: [],
      medical_certificates: [],
      data: {
        guardians: [
          {
            name: "Maria",
            surname: "Bianchi",
            email: "maria@example.com",
            linkedUserId: GENITORE,
          },
        ],
      },
    },
  ],
  organizationUser: [
    { id: "ou1", organization_id: CLUB, user_id: GENITORE, role: "parent" },
  ],
  user: [{ id: GENITORE, email: "maria@example.com" }],
  clubResourceItem: [],
  communicationDelivery: [],
  notification: [],
  athletePayment: [],
  paymentTransaction: [],
  attachment: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

/* ============================ il registro generico non e una porta di servizio */

test("le notifiche si leggono per destinatario, non per club", async () => {
  /*
    La falla: la prima correzione aveva **indirizzato** le notifiche economiche
    a chi puo vederle, togliendo il `user_id: null` che il prodotto interpreta
    come «di tutti». Ma `notifications` e una risorsa di modello che un
    allenatore puo elencare, e il registro generico non filtrava per
    destinatario: `GET /api/v1/notifications` restituiva comunque la notifica
    indirizzata al proprietario, riepilogo delle famiglie in arretrato compreso.
    Il permesso era stato spostato dal canale al criterio, e la porta accanto
    era rimasta aperta.
  */
  fake.rows("notification").push(
    {
      id: "n-owner",
      organization_id: CLUB,
      user_id: PROPRIETARIO,
      title: "Rata scaduta: Bianchi Luca",
      message: "130,00 euro da versare",
      type: "automation_installment_overdue",
      read: false,
      data: {},
      created_at: NOW,
      updated_at: NOW,
    },
    {
      id: "n-club",
      organization_id: CLUB,
      user_id: null,
      title: "Avviso di club",
      message: "visibile a tutti",
      type: "system",
      read: false,
      data: {},
      created_at: NOW,
      updated_at: NOW,
    },
  );

  const esito = await risorse.listResourcePage(
    "notifications",
    new URLSearchParams(),
    scope(ALLENATORE, "trainer"),
  );

  const titoli = esito.records.map((riga) => riga.title);
  assert.equal(
    titoli.includes("Rata scaduta: Bianchi Luca"),
    false,
    "la notifica indirizzata a un altro non compare",
  );
  assert.equal(
    titoli.includes("Avviso di club"),
    true,
    "quella davvero di club si",
  );
});

test("chiedere le notifiche di un altro utente e Accesso negato", async () => {
  await assert.rejects(
    () =>
      risorse.listResourcePage(
        "notifications",
        new URLSearchParams({ user_id: PROPRIETARIO }),
        scope(ALLENATORE, "trainer"),
      ),
    /Accesso negato/,
  );
});

test("annunci e regole non si scrivono dal registro generico", async () => {
  /*
    La prima correzione aveva chiuso l'elenco e il dettaglio e lasciato scoperti
    creazione, modifica e cancellazione — i tre verbi che contano di piu, e che
    `canAccessClubResource` concede a collaboratori e segreteria su
    `club_resource_items`. Da li si pubblicava un annuncio senza
    `board.publish` e si accendeva un'automazione senza `automations.manage`.
  */
  const attore = scope(ALLENATORE, "owner");

  await assert.rejects(
    () =>
      risorse.createResource(
        "club_resource_items",
        { organization_id: CLUB, resource_type: "announcements", payload: {} },
        "create",
        attore,
      ),
    /Accesso negato/,
  );

  fake.rows("clubResourceItem").push({
    id: "regola-1",
    organization_id: CLUB,
    resource_type: "automation_rules",
    name: "installment_due",
    status: "disabled",
    payload: { trigger: "installment_due", enabled: false },
  });

  await assert.rejects(
    () =>
      risorse.updateResource(
        "club_resource_items",
        "regola-1",
        { payload: { trigger: "installment_due", enabled: true } },
        attore,
      ),
    /Accesso negato/,
  );

  await assert.rejects(
    () => risorse.deleteResource("club_resource_items", "regola-1", attore),
    /Accesso negato/,
  );
});

/* ================================================== le notifiche di societa */

test("il proprietario dichiarato solo su `creator_id` resta un destinatario", async () => {
  /*
    `resolveOrganizationScopeForUser` riconosce l'`owner` anche da
    `clubs.creator_id`, e creare un club valorizza quel campo **senza** scrivere
    una riga di appartenenza. Senza ripiego la notifica di societa non arrivava
    a nessuno e il giro la chiudeva `no_club_recipient` ogni notte, in silenzio:
    prima della correzione almeno compariva.
  */
  fake.rows("athletePayment").push({
    id: "rata-1",
    organization_id: CLUB,
    athlete_id: "a1",
    description: "Rata di novembre",
    amount: 130,
    due_date: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
    status: "pending",
    data: {},
  });
  fake.rows("clubResourceItem").push({
    id: "regola-1",
    organization_id: CLUB,
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
    organizationId: CLUB,
    now: NOW,
    mailer: {
      isConfigured: async () => false,
      send: async () => ({ status: "skipped" }),
    },
  });

  const notifiche = fake.rows("notification");
  assert.equal(notifiche.length > 0, true, "la societa deve essere avvisata");
  for (const riga of notifiche) {
    assert.equal(riga.user_id, PROPRIETARIO);
  }
});

/* ============================================================== la bacheca */

test("la bacheca del destinatario non porta i criteri con cui e stato scelto", async () => {
  /*
    `listAnnouncements` chiede `board.publish` proprio perche restituisce «il
    corpo, **i criteri** e i conteggi». La lettura del destinatario restituiva
    lo stesso oggetto per intero: un annuncio con criterio `athlete_ids`
    consegnava a ogni famiglia gli identificativi interni di tutti gli altri
    atleti, e uno con `overdue_payments` le diceva che era stata scelta perche
    in arretrato.
  */
  const annuncio = await bacheca.createAnnouncement({
    draft: {
      title: "Solo per alcuni",
      body: "Vi aspettiamo.",
      criteria: [{ kind: "athlete_ids", values: ["a1", "a2", "a3"] }],
    },
    scope: scope(PROPRIETARIO, "owner"),
    actorUserId: PROPRIETARIO,
  });

  await bacheca.publishAnnouncement({
    announcementId: annuncio.id,
    scope: scope(PROPRIETARIO, "owner"),
    now: NOW,
  });

  const vista = await bacheca.readAnnouncementsForUser({
    organizationId: CLUB,
    userId: GENITORE,
    now: NOW,
  });

  assert.equal(vista.length, 1, "l'avviso arriva");
  assert.equal(vista[0].criteria, undefined, "i criteri no");
  assert.equal(
    JSON.stringify(vista[0]).includes("a3"),
    false,
    "e nemmeno gli identificativi degli altri atleti",
  );
});

/* ================================================= il link di pagamento */

test("senza origine configurata non si costruisce nessun URL di ritorno", () => {
  /*
    Un'origine vuota produceva `"/pay/<token>?esito=inviato"`, che **supera** la
    guardia `if (!successUrl || !cancelUrl)` e arriva al gateway come percorso
    relativo. Un URL di ritorno relativo mandato a un PSP non riporta da nessuna
    parte.
  */
  const vuoti = link.buildPaymentLinkReturnUrls("", "token-qualunque");
  assert.equal(vuoti.successUrl, "");
  assert.equal(vuoti.cancelUrl, "");

  const buoni = link.buildPaymentLinkReturnUrls(
    "https://app.easygame.test/",
    "token-qualunque",
  );
  assert.match(buoni.successUrl, /^https:\/\/app\.easygame\.test\/pay\//);
});

/* ============================================ la rivendicazione nel tempo */

test("un giro lungo non viene scavalcato da uno partito dopo", async () => {
  /*
    `now` e il tempo **di dominio** e attraversa congelato tutti i club di un
    giro. Timbrare `updated_at` con quel valore faceva risultare ogni riga
    scritta a T0: una seconda esecuzione partita al minuto sedici le trovava
    tutte «abbandonate» e le riprendeva, mandando due volte proprio mentre la
    prima stava ancora mandando.
  */
  const adesso = new Date();

  const primo = await registro.claimDelivery({
    organizationId: CLUB,
    sourceKind: "automation",
    sourceId: "AUT-01",
    dedupKey: "automation:AUT-01:a1:rata-1:7",
    channel: "email",
    recipientKey: "maria@example.com",
    retryAfterMs: null,
    /* Il giro e cominciato venti minuti fa, ma la riga si scrive **adesso**. */
    now: new Date(adesso.getTime() - 20 * 60 * 1000),
  });
  assert.equal(primo.claimed, true);

  const secondo = await registro.claimDelivery({
    organizationId: CLUB,
    sourceKind: "automation",
    sourceId: "AUT-01",
    dedupKey: "automation:AUT-01:a1:rata-1:7",
    channel: "email",
    recipientKey: "maria@example.com",
    retryAfterMs: null,
    now: adesso,
  });

  assert.equal(
    secondo.claimed,
    false,
    "la riga e stata scritta un istante fa: e in volo, non abbandonata",
  );
  assert.equal(secondo.reason, "in_flight");
});

/* ================================================ il ciclo a lotti */

test("un invio a piu lotti senza identificativo dichiarato viene rifiutato", async () => {
  /*
    Un identificativo derivato dal contenuto vale per una finestra scorrevole:
    passata quella, chi e gia stato servito torna fra i raggiungibili, rientra
    **in testa** al lotto successivo e riceve una seconda volta — e il ciclo non
    arriva mai a chi resta. Invece di stringere la finestra si chiede quello che
    serve: chi manda a piu di un lotto deve dire quale invio e.
  */
  for (let indice = 0; indice < 3; indice += 1) {
    fake.rows("athlete").push({
      id: `m${indice}`,
      organization_id: CLUB,
      first_name: "Massa",
      last_name: String(indice),
      status: "active",
      category_memberships: [],
      data: {
        guardians: [
          { name: "Tutore", surname: String(indice), email: `m${indice}@example.com` },
        ],
      },
    });
  }

  await assert.rejects(
    () =>
      comunicazioni.sendCommunication({
        criteria: [{ kind: "all_families" }],
        template: { subject: "Avviso", body: "Testo" },
        scope: scope(PROPRIETARIO, "owner"),
        now: NOW,
        batchSize: 1,
        mailer: {
          isConfigured: async () => true,
          send: async () => ({ status: "sent" }),
        },
      }),
    /communication_id/,
  );
});
