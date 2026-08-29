import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Le falle che le revisioni indipendenti di fine Wave 2 hanno trovato.
 *
 * **Perche questi test esistono in questa forma.** Le tre revisioni le avevano
 * dimostrate con dei test scritti al contrario — che passavano **perche** la
 * falla c'era. Quei file erano prove, non una suite: qui le stesse condizioni
 * sono scritte nel verso giusto, cosi diventano rosse il giorno in cui una
 * delle correzioni viene disfatta.
 *
 * Ogni blocco cita la falla per come e stata descritta, perche fra un anno
 * conta piu il **perche** era grave del cosa e stato cambiato.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "aaaaaaaa-0000-4000-8000-000000000002";
const UTENTE = "cccccccc-0000-4000-8000-00000000000a";
const NOW = new Date("2026-10-05T10:00:00Z");
const UN_ANNO_DOPO = new Date("2027-10-05T10:00:00Z");

let registro;
let bacheca;
let setPrismaClientForTests;
let fake;

const scope = (organizationId = CLUB, activeRole = "owner") => ({
  userId: "dddddddd-0000-4000-8000-00000000000a",
  activeOrganizationId: organizationId,
  allowedOrganizationIds: [organizationId],
  activeRole,
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  registro = await import("../../src/lib/server/communication-deliveries.ts");
  bacheca = await import("../../src/lib/server/announcements.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
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
          {
            name: "Maria",
            surname: "Bianchi",
            email: "maria@example.com",
            linkedUserId: UTENTE,
          },
        ],
      },
    },
  ],
  organizationUser: [{ id: "ou1", organization_id: CLUB, user_id: UTENTE }],
  user: [{ id: UTENTE, email: "maria@example.com" }],
  clubResourceItem: [],
  communicationDelivery: [],
  athletePayment: [],
  paymentTransaction: [],
  notification: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const rivendica = (overrides = {}) =>
  registro.claimDelivery({
    organizationId: CLUB,
    sourceKind: "automation",
    sourceId: "AUT-01",
    dedupKey: "automation:AUT-01:installment_due:a1:rata-1:7",
    channel: "email",
    recipientKey: "maria@example.com",
    recipientEmail: "maria@example.com",
    retryAfterMs: null,
    now: NOW,
    ...overrides,
  });

/* ============================================ il registro delle consegne === */

test("una rivendicazione abbandonata si riprende, invece di bloccare per sempre", async () => {
  /*
    La falla: la riga si scrive `pending`, poi parte l'invio, poi si chiude. Se
    il processo muore nel mezzo — e su un giro che attraversa tutti i club
    dentro una richiesta HTTP il timeout e l'esito atteso — la riga restava
    `pending`, e con `retryAfterMs: null` l'unico ramo riprendibile era
    `failed`. Quel destinatario non era piu raggiungibile da nessun percorso, e
    non esisteva nessuno spazzino.
  */
  const primo = await rivendica();
  assert.equal(primo.claimed, true);
  assert.equal(fake.rows("communicationDelivery")[0].status, "pending");

  const subito = await rivendica({
    now: new Date(NOW.getTime() + 60 * 1000),
  });
  assert.equal(
    subito.claimed,
    false,
    "un invio davvero in volo non si scavalca: un minuto dopo e ancora il doppio clic",
  );

  const dopoLaSoglia = await rivendica({
    now: new Date(NOW.getTime() + registro.PENDING_STALE_MS + 1000),
  });
  assert.equal(
    dopoLaSoglia.claimed,
    true,
    "oltre la soglia la rivendicazione e abbandonata e si riprende",
  );

  const dopoUnAnno = await rivendica({ now: UN_ANNO_DOPO });
  assert.equal(dopoUnAnno.claimed, true);
  assert.equal(
    fake.rows("communicationDelivery").length,
    1,
    "riprendere non crea una seconda riga",
  );
});

test("l'anteprima non dichiara «gia raggiunto» un messaggio mai partito", async () => {
  /*
    La falla: `readAlreadyReached` escludeva `failed` e includeva quindi
    `pending`. Una rivendicazione rimasta in volo dal giro morto della settimana
    prima faceva dire all'anteprima «questa famiglia l'hai gia avvisata», con un
    motivo che invita a non riprovare, per un messaggio che nessun server ha mai
    accettato.
  */
  const claim = await rivendica();

  const inVolo = await registro.readAlreadyReached({
    organizationId: CLUB,
    dedupKeys: ["automation:AUT-01:installment_due:a1:rata-1:7"],
    channel: "email",
    now: NOW,
  });
  assert.equal(inVolo.size, 0, "in volo non significa arrivato");

  await registro.settleDelivery({
    id: claim.id,
    organizationId: CLUB,
    status: "sent",
    now: NOW,
  });

  const consegnato = await registro.readAlreadyReached({
    organizationId: CLUB,
    dedupKeys: ["automation:AUT-01:installment_due:a1:rata-1:7"],
    channel: "email",
    now: NOW,
  });
  assert.equal(consegnato.size, 1, "consegnato si");
});

test("chiudere una consegna porta il club nel `where`", async () => {
  /*
    CLAUDE.md §8: mai una query club-scoped senza `organization_id`. Era l'unica
    scrittura del registro che aggiornava per sola chiave primaria.
  */
  const claim = await rivendica();

  await registro.settleDelivery({
    id: claim.id,
    organizationId: CLUB,
    status: "sent",
    now: NOW,
  });

  const scritture = fake.calls.filter(
    (call) =>
      call.delegate === "communicationDelivery" &&
      (call.method === "update" || call.method === "updateMany"),
  );
  const ultima = scritture[scritture.length - 1];

  assert.ok(ultima, "settleDelivery scrive");
  assert.ok(
    "organization_id" in (ultima.args?.where || {}),
    "il perimetro del club deve stare nel where",
  );

  /* E la scrittura non tocca la riga di un altro club. */
  await registro.settleDelivery({
    id: claim.id,
    organizationId: ALTRO_CLUB,
    status: "failed",
    now: NOW,
  });
  assert.equal(
    fake.rows("communicationDelivery")[0].status,
    "sent",
    "il club sbagliato non aggiorna niente",
  );
});

/* ============================================================ la bacheca === */

const creaEPubblica = async () => {
  const annuncio = await bacheca.createAnnouncement({
    draft: {
      title: "Campo chiuso",
      body: "Domenica il campo restera chiuso.",
      criteria: [{ kind: "all_families" }],
    },
    scope: scope(),
    actorUserId: "dddddddd-0000-4000-8000-00000000000a",
  });

  return annuncio;
};

test("una pubblicazione interrotta si ripara alla ripubblicazione", async () => {
  /*
    La falla: `publishAnnouncement` rivendica e poi chiude, senza transazione.
    Un processo ucciso in mezzo lasciava la consegna `pending`; la lettura della
    famiglia filtra su `sent`, quindi l'annuncio non compariva — e ripubblicare
    non rimediava, perche la riga `pending` non era riprendibile e finiva fra
    gli `alreadyDelivered`. La segreteria leggeva «gia consegnato», la famiglia
    non vedeva niente, e nessun gesto sbloccava.
  */
  const annuncio = await creaEPubblica();

  /* Il processo muore fra la rivendicazione e la chiusura. */
  const inVolo = await registro.claimDelivery({
    organizationId: CLUB,
    sourceKind: "board",
    sourceId: annuncio.id,
    dedupKey: registro.buildDedupKey("board", annuncio.id),
    channel: "board",
    recipientKey: "maria@example.com",
    recipientUserId: UTENTE,
    recipientEmail: "maria@example.com",
    retryAfterMs: null,
    now: NOW,
  });
  assert.equal(inVolo.claimed, true);

  const domani = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
  const esito = await bacheca.publishAnnouncement({
    announcementId: annuncio.id,
    scope: scope(),
    now: domani,
  });

  assert.equal(
    esito.delivered,
    1,
    "la ripubblicazione riprende la consegna abbandonata",
  );

  const vista = await bacheca.readAnnouncementsForUser({
    organizationId: CLUB,
    userId: UTENTE,
    now: domani,
  });
  assert.equal(vista.length, 1, "e la famiglia finalmente lo vede");
});

test("la vista di governo della bacheca non e per tutti", async () => {
  /*
    La falla: `listAnnouncements` e `readAnnouncementById` chiedevano
    `board.read`, che **tutti** i ruoli possiedono e che il contratto definisce
    «leggere gli avvisi destinati a se». Restituiscono invece ogni annuncio del
    club — bozze comprese, con il corpo intero e i criteri scelti: un genitore
    che chiamava la rotta senza `?mine=1` leggeva la bacheca intera, e con il
    criterio «chi non ha pagato» sapeva anche che la segreteria aveva scritto
    alle famiglie in arretrato, e quante fossero.
  */
  const annuncio = await creaEPubblica();

  for (const ruolo of ["parent", "athlete", "trainer", "staff", "collaborator"]) {
    await assert.rejects(
      () => bacheca.listAnnouncements({ scope: scope(CLUB, ruolo), now: NOW }),
      /Accesso negato/,
      `${ruolo} non deve vedere la bacheca di governo`,
    );
    await assert.rejects(
      () =>
        bacheca.readAnnouncementById({
          announcementId: annuncio.id,
          scope: scope(CLUB, ruolo),
        }),
      /Accesso negato/,
      `${ruolo} non deve leggere un annuncio per identificativo`,
    );
  }
});

test("l'allegato di un annuncio segue il pubblico dell'annuncio", async () => {
  /*
    La falla: gli allegati vivono su Attachment Core, che autorizza
    sull'appartenenza al club. Senza una domanda sul pubblico, un genitore di
    un'altra categoria scaricava il modulo allegato a un avviso che non gli era
    destinato.
  */
  const annuncio = await creaEPubblica();

  assert.equal(
    await bacheca.canReadAnnouncementAttachment({
      organizationId: CLUB,
      announcementId: annuncio.id,
      userId: UTENTE,
      activeRole: "parent",
    }),
    false,
    "senza consegna non si legge",
  );

  assert.equal(
    await bacheca.canReadAnnouncementAttachment({
      organizationId: CLUB,
      announcementId: annuncio.id,
      userId: UTENTE,
      activeRole: "owner",
    }),
    true,
    "chi governa la bacheca legge sempre",
  );

  await bacheca.publishAnnouncement({
    announcementId: annuncio.id,
    scope: scope(),
    now: NOW,
  });

  assert.equal(
    await bacheca.canReadAnnouncementAttachment({
      organizationId: CLUB,
      announcementId: annuncio.id,
      userId: UTENTE,
      activeRole: "parent",
    }),
    true,
    "con la consegna, il destinatario legge",
  );
});
