import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import { readFileSync } from "node:fs";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Il perimetro dell'allenatore: una domanda, una risposta, nove porte**
 * (W6-22, W6-23, W6-24).
 *
 * Tre difetti della stessa famiglia, e tre classi da difendere qui:
 *
 * 1. il perimetro lo applicava **una funzione su nove**. Un allenatore che
 *    conoscesse un `eventId` fuori dal proprio gruppo poteva farci appello e
 *    convocazioni, perche `events.convoke` e una chiave del suo **ruolo** e il
 *    ruolo non sa niente delle righe;
 * 2. la stessa domanda aveva **quattro** implementazioni e due divergevano:
 *    l'allenatore registrato come *staff* passava il filtro degli eventi e si
 *    sentiva rispondere «non risulti fra gli allenatori di questo club»
 *    sull'RSVP dello stesso allenamento;
 * 3. il diniego non lasciava traccia.
 *
 * Il primo test e un'**enumerazione**: non prova le nove funzioni di oggi,
 * pretende che la decima nasca chiusa.
 */

const CLUB = "aaaaaaaa-6c00-4000-8000-00000000000a";
const ALTRO_CLUB = "bbbbbbbb-6c00-4000-8000-00000000000b";
const DIREZIONE = "11111111-6c00-4000-8000-000000000aaa";
/** Registrato in `clubs.staff_members`, non in `clubs.trainers`. */
const MISTER_STAFF = "22222222-6c00-4000-8000-000000000bbb";
/** Ruolo `trainer` assegnato, scheda del club mai compilata. */
const MISTER_SENZA_SCHEDA = "33333333-6c00-4000-8000-000000000ccc";

const SUO = "eeeeeeee-6c00-4000-8000-000000000001";
const ALTRUI = "eeeeeeee-6c00-4000-8000-000000000002";

const ATLETA = "dddddddd-6c00-4000-8000-000000000001";

let eventi;
let rsvp;
let setPrismaClientForTests;
let fake;

const scope = (activeRole, userId = DIREZIONE) => ({
  userId,
  activeOrganizationId: CLUB,
  activeRole,
  activeMembershipId: null,
  allowedOrganizationIds: [CLUB, ALTRO_CLUB],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  eventi = await import("../../src/lib/server/events.ts");
  rsvp = await import("../../src/lib/server/rsvp.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const allenamento = (id, legacyId, categoryId, titolo) => ({
  id,
  organization_id: CLUB,
  kind: "training",
  legacy_id: legacyId,
  title: titolo,
  status: "scheduled",
  category_id: categoryId,
  category_name: categoryId === "u15" ? "Under 15" : "Prima squadra",
  group_ids: [],
  rsvp_required: true,
  starts_at: new Date("2026-09-05T17:30:00.000Z"),
  ends_at: new Date("2026-09-05T19:00:00.000Z"),
  version: 1,
  payload: { id: legacyId },
});

const seed = () => ({
  user: [
    { id: DIREZIONE, email: "direzione@club.it" },
    { id: MISTER_STAFF, email: "staff@club.it" },
    { id: MISTER_SENZA_SCHEDA, email: "nuovo@club.it" },
  ],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      creator_id: DIREZIONE,
      categories: [
        { id: "u15", name: "Under 15" },
        { id: "prima", name: "Prima squadra" },
      ],
      club_sites: [],
      category_groups: [],
      /*
        **Nessuna riga in `clubs.trainers`.** E il caso che divergeva: il club
        registra i suoi allenatori come staff, e la guardia dell'RSVP guardava
        solo l'altro elenco.
      */
      trainers: [],
      staff_members: [
        {
          id: "s1",
          name: "Mister Staff",
          role: "trainer",
          email: "staff@club.it",
          linkedUserId: MISTER_STAFF,
          categories: ["u15"],
        },
      ],
      trainings: [],
      matches: [],
    },
    {
      id: ALTRO_CLUB,
      slug: "altro",
      name: "Altro",
      trainings: [],
      matches: [],
    },
  ],
  athlete: [
    {
      id: ATLETA,
      organization_id: CLUB,
      first_name: "Mario",
      last_name: "Rossi",
      category_id: "prima",
      category_name: "Prima squadra",
      data: {},
      category_memberships: [],
    },
  ],
  athleteCategoryMembership: [],
  clubEvent: [
    allenamento(SUO, "training-u15", "u15", "Under 15"),
    allenamento(ALTRUI, "training-prima", "prima", "Prima squadra"),
  ],
  clubEventParticipant: [],
  auditLog: [],
  notification: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const negato = /Accesso negato/;

const dinieghi = () =>
  fake.rows("auditLog").filter((riga) => riga.action === "permission.denied");

/* ============================================ 1 · l'enumerazione ========= */

/**
 * **Nove porte, non otto.**
 *
 * L'elenco del debito W5-D03 ne ometteva una — `createClubEvent` — e questo e
 * esattamente il motivo per cui il presidio non puo essere un elenco scritto a
 * mano: si legge il sorgente, si trovano **tutte** le funzioni esportate che
 * accettano uno `scope`, e si pretende che ognuna interroghi il perimetro.
 *
 * Cosi la decima funzione, quella che qualcuno scrivera fra sei mesi, non
 * nasce sfondata: nasce con un test rosso.
 */
test("W6-22 · ogni funzione esportata con scope interroga il perimetro", () => {
  const sorgente = readFileSync(
    new URL("../../src/lib/server/events.ts", import.meta.url),
    "utf8",
  );

  const blocchi = sorgente.split("\nexport const ").slice(1);
  const conScope = blocchi
    .map((blocco) => {
      const nome = blocco.slice(0, blocco.indexOf(" ")).trim();
      const fine = blocco.indexOf("\n};");
      return { nome, corpo: blocco.slice(0, fine === -1 ? undefined : fine) };
    })
    .filter(({ corpo }) => /scope:\s*EventsScope/.test(corpo));

  assert.ok(
    conScope.length >= 9,
    `attese almeno nove funzioni pubbliche con scope, trovate ${conScope.length}`,
  );

  const sfondate = conScope
    .filter(
      ({ corpo }) =>
        !/assertTrainerEventPerimeter\(|readTrainerEventPerimeter\(/.test(corpo),
    )
    .map(({ nome }) => nome);

  assert.deepEqual(
    sfondate,
    [],
    `queste funzioni non chiedono il perimetro dell'allenatore: un permesso concesso al ruolo non e un permesso su ogni riga`,
  );
});

/* ================================ 2 · l'atto fuori perimetro ============= */

/**
 * La forma del difetto W6-23: la chiave di ruolo c'e, la riga non e sua.
 *
 * Si provano **tutti** gli atti, non uno: il difetto non era in una funzione,
 * era nell'idea che il permesso di ruolo bastasse.
 */
const ATTI_FUORI_PERIMETRO = [
  ["readClubEvent", (s) => eventi.readClubEvent(s, ALTRUI)],
  [
    "updateClubEvent",
    (s) =>
      eventi.updateClubEvent(s, ALTRUI, {
        date: "2026-09-05",
        time: "18:00",
        title: "Spostato",
      }),
  ],
  [
    "saveEventConvocations",
    (s) => eventi.saveEventConvocations(s, ALTRUI, [{ athleteId: ATLETA }]),
  ],
  [
    "saveEventAttendance",
    (s) =>
      eventi.saveEventAttendance(s, ALTRUI, [
        { athleteId: ATLETA, status: "present" },
      ]),
  ],
  ["listEventParticipants", (s) => eventi.listEventParticipants(s, ALTRUI)],
  ["deleteClubEvent", (s) => eventi.deleteClubEvent(s, ALTRUI)],
  [
    "createClubEvent",
    (s) =>
      eventi.createClubEvent(s, "training", {
        id: "nuovo-prima",
        date: "2026-09-12",
        time: "18:00",
        categoryId: "prima",
        title: "Prima squadra, non sua",
      }),
  ],
  [
    "createClubEventsBatch",
    (s) =>
      eventi.createClubEventsBatch(s, "training", [
        {
          id: "batch-prima",
          date: "2026-09-19",
          time: "18:00",
          categoryId: "prima",
          title: "Prima squadra, non sua",
        },
      ]),
  ],
];

for (const [nome, atto] of ATTI_FUORI_PERIMETRO) {
  test(`W6-23 · ${nome} su un evento fuori perimetro e negato`, async () => {
    await assert.rejects(
      () => atto(scope("trainer", MISTER_STAFF)),
      negato,
      "un atto fuori perimetro e un atto su atleti che non sono suoi",
    );
  });
}

test("W6-23 · l'appello fuori perimetro non lascia nessuna riga di presenza", async () => {
  await assert.rejects(
    () =>
      eventi.saveEventAttendance(scope("trainer", MISTER_STAFF), ALTRUI, [
        { athleteId: ATLETA, status: "present" },
      ]),
    negato,
  );

  assert.equal(
    fake.rows("clubEventParticipant").length,
    0,
    "il rifiuto deve arrivare prima della scrittura, non dopo",
  );
});

/* =================================== 3 · il diniego lascia una riga ====== */

test("W6-23 · un atto fuori perimetro scrive un diniego in audit", async () => {
  await assert.rejects(
    () =>
      eventi.saveEventConvocations(scope("trainer", MISTER_STAFF), ALTRUI, [
        { athleteId: ATLETA },
      ]),
    negato,
  );

  const righe = dinieghi();
  assert.equal(righe.length, 1, "un rifiuto che non lascia traccia non si vede");
  assert.equal(righe[0].actor_user_id, MISTER_STAFF);
  assert.equal(righe[0].resource, "club_events");
  assert.equal(righe[0].resource_id, ALTRUI);
  assert.equal(righe[0].metadata.permission, "events.convoke");
});

/* ============================== 4 · la divergenza fra le due guardie ===== */

/**
 * **W6-24, nella sua forma osservabile.**
 *
 * L'allenatore registrato come staff passava il filtro degli eventi e veniva
 * respinto sull'RSVP dello **stesso** allenamento. Non era un caso di
 * frontiera: e la configurazione di un club su tre.
 */
test("W6-24 · l'allenatore-staff che vede l'evento ne legge anche l'RSVP", async () => {
  const righe = await eventi.listClubEvents(scope("trainer", MISTER_STAFF));
  assert.deepEqual(
    righe.map((riga) => riga.legacy_id),
    ["training-u15"],
    "la scheda staff con ruolo allenatore e un perimetro come un altro",
  );

  const riepilogo = await rsvp.readEventRsvpSummary({
    trainingId: SUO,
    scope: scope("trainer", MISTER_STAFF),
    now: new Date("2026-09-01T10:00:00.000Z"),
  });

  assert.equal(riepilogo.trainingId, SUO);
});

test("W6-24 · e sull'RSVP di un evento che non e suo riceve un rifiuto", async () => {
  await assert.rejects(
    () =>
      rsvp.readEventRsvpSummary({
        trainingId: ALTRUI,
        scope: scope("trainer", MISTER_STAFF),
        now: new Date("2026-09-01T10:00:00.000Z"),
      }),
    negato,
    "un elenco vuoto si confonde con «nessuno ha risposto»: qui serve un no",
  );

  assert.equal(dinieghi().length, 1, "anche il no dell'RSVP lascia una riga");
});

/* ======================== 5 · il perimetro vuoto fallisce chiuso ========= */

test("un allenatore senza scheda non legge e non agisce", async () => {
  const righe = await eventi.listClubEvents(
    scope("trainer", MISTER_SENZA_SCHEDA),
  );
  assert.deepEqual(righe, [], "un perimetro che non si sa e nessun evento");

  await assert.rejects(
    () => eventi.readClubEvent(scope("trainer", MISTER_SENZA_SCHEDA), SUO),
    negato,
  );
});

/* ============================= 6 · il caso legittimo resta legittimo ===== */

test("l'allenatore crea l'allenamento del proprio gruppo", async () => {
  const riga = await eventi.createClubEvent(
    scope("trainer", MISTER_STAFF),
    "training",
    {
      id: "nuovo-u15",
      date: "2026-09-12",
      time: "18:00",
      categoryId: "u15",
      title: "Under 15, il suo",
    },
  );

  assert.equal(riga.legacy_id, "nuovo-u15");
  assert.equal(dinieghi().length, 0);
});

test("l'allenatore fa l'appello sul proprio allenamento", async () => {
  const righe = await eventi.saveEventAttendance(
    scope("trainer", MISTER_STAFF),
    SUO,
    [{ athleteId: ATLETA, status: "present" }],
  );

  assert.equal(righe.length, 1);
  assert.equal(righe[0].status, "present");
});

/* ============================= 7 · la direzione non passa di qui ========= */

test("chi gestisce il club vede tutto il club", async () => {
  const righe = await eventi.listClubEvents(scope("owner"));
  assert.equal(righe.length, 2);

  const riga = await eventi.readClubEvent(scope("owner"), ALTRUI);
  assert.equal(riga.id, ALTRUI);
});

/* ================== 8 · il gruppo vince sulla categoria, e una volta sola  */

/**
 * La regola che le quattro implementazioni non condividevano: se **entrambi**
 * dichiarano gruppi decide il gruppo, altrimenti si ricade sulla categoria.
 * Provata sulla funzione pura, perche e li che vive.
 */
test("il gruppo e il confine quando l'evento e l'allenatore lo dichiarano", () => {
  const conGruppi = { categoryIds: ["u15"], groupIds: ["group:u15:scauri"] };

  assert.equal(
    eventi.eventWithinTrainerPerimeter(conGruppi, {
      category_id: "u15",
      group_ids: ["group:u15:santi"],
    }),
    false,
    "stessa fascia, altra squadra, altre famiglie",
  );

  assert.equal(
    eventi.eventWithinTrainerPerimeter(conGruppi, {
      category_id: "u15",
      group_ids: ["group:u15:scauri"],
    }),
    true,
  );

  assert.equal(
    eventi.eventWithinTrainerPerimeter(conGruppi, {
      category_id: "u15",
      group_ids: [],
    }),
    true,
    "il dato precedente ai gruppi ricade sulla categoria",
  );

  assert.equal(
    eventi.eventWithinTrainerPerimeter(conGruppi, {
      category_id: null,
      group_ids: [],
    }),
    false,
    "un evento senza categoria e senza gruppi non e di tutti: e di nessuno",
  );

  assert.equal(
    eventi.eventWithinTrainerPerimeter(null, { category_id: "u15" }),
    false,
    "«non lo so» vale «nessun evento»",
  );
});
