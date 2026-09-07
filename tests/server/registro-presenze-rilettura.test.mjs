import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import { readFileSync } from "node:fs";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Il registro presenze si scriveva e non lo rileggeva nessuno** (P0-5).
 *
 * L'appello vive in `club_event_participants` — la tabella giusta, con il suo
 * scrittore unico (ADR-0099) — e da li **non tornava indietro niente**: la
 * rotta del calendario serviva le sole colonne dell'evento, e ogni schermata
 * che chiede «l'appello e stato fatto?» leggeva `training.attendance`, un
 * array che nessuna rotta ha mai restituito.
 *
 * Misurato a schermo: si segnano tre presenti su sedici, si salva, e la scheda
 * continua a dire «0/16 · Presenze mancanti» — anche dopo un ricaricamento. La
 * bacheca continua a chiedere di completare un appello gia completato, e
 * riaprendo il registro sono di nuovo tutti assenti: la seconda passata
 * cancella la prima, ed e la forma peggiore in cui puo rompersi un registro,
 * perche non lo dice.
 *
 * Un dato scritto che nessuno rilegge non e un dato salvato: e un modulo che
 * finge.
 */

const CLUB = "aaaaaaaa-b500-4000-8000-00000000000a";
const DIREZIONE = "11111111-b500-4000-8000-00000000000b";

const CON_APPELLO = "eeeeeeee-b500-4000-8000-000000000001";
const SENZA_APPELLO = "eeeeeeee-b500-4000-8000-000000000002";
const SOLO_RISPOSTE = "eeeeeeee-b500-4000-8000-000000000003";

let route;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  route = await import("../../src/app/api/v1/events/route.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const evento = (id, titolo) => ({
  id,
  organization_id: CLUB,
  kind: "training",
  legacy_id: `legacy-${id.slice(-1)}`,
  title: titolo,
  status: "scheduled",
  category_id: "u15",
  category_ids: ["u15"],
  category_name: "Under 15",
  group_ids: [],
  starts_at: new Date("2026-09-01T18:00:00.000Z"),
  ends_at: new Date("2026-09-01T19:30:00.000Z"),
  version: 1,
  payload: { id },
});

const partecipante = (id, eventId, athleteId, status) => ({
  id,
  organization_id: CLUB,
  event_id: eventId,
  athlete_id: athleteId,
  status,
  notes: null,
});

const seme = () => ({
  session: [
    {
      id: "sess-appello",
      token: "token-appello",
      user_id: DIREZIONE,
      expires_at: new Date(Date.now() + 3600_000),
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      user: {
        id: DIREZIONE,
        email: "direzione@club.it",
        role: "owner",
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        updated_at: new Date("2026-01-01T00:00:00.000Z"),
        email_verified_at: new Date(),
      },
    },
  ],
  user: [
    {
      id: DIREZIONE,
      email: "direzione@club.it",
      role: "owner",
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      creator_id: DIREZIONE,
      categories: [{ id: "u15", name: "Under 15" }],
      club_sites: [],
      category_groups: [],
      trainers: [],
      staff_members: [],
      settings: { seasons: [] },
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  organizationUser: [
    {
      id: "ou-direzione",
      organization_id: CLUB,
      user_id: DIREZIONE,
      role: "owner",
      custom_role_id: null,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  clubEvent: [
    evento(CON_APPELLO, "Con appello"),
    evento(SENZA_APPELLO, "Senza appello"),
    evento(SOLO_RISPOSTE, "Solo risposte"),
  ],
  clubEventParticipant: [
    partecipante("p1", CON_APPELLO, "atleta-1", "present"),
    partecipante("p2", CON_APPELLO, "atleta-2", "present"),
    partecipante("p3", CON_APPELLO, "atleta-3", "absent"),
    /*
      **`pending` non e un appello**: la riga nasce da una risposta della
      famiglia e dal registro non e mai passata
      (`RSVP_NEUTRAL_ATTENDANCE_STATUS`). Contarla direbbe fatto un appello che
      nessuno ha preso.
    */
    partecipante("p4", SOLO_RISPOSTE, "atleta-4", "pending"),
    partecipante("p5", SOLO_RISPOSTE, "atleta-5", "pending"),
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seme());
  setPrismaClientForTests(fake.client);
});

const eventi = async () => {
  const risposta = await route.GET(
    new Request("https://easygame.test/api/v1/events?kind=training", {
      headers: {
        authorization: "Bearer token-appello",
        "x-active-club-id": CLUB,
      },
    }),
  );
  const payload = await risposta.json();
  assert.equal(risposta.status, 200, JSON.stringify(payload));
  return payload.data || [];
};

const per = (righe, eventId) =>
  righe.find((riga) => String(riga.eventId || riga.id) === eventId);

test("il calendario dice quanti sono stati registrati e quanti presenti", async () => {
  const righe = await eventi();
  const voce = per(righe, CON_APPELLO);

  assert.equal(voce?.attendance_recorded, 3, "tre righe di appello");
  assert.equal(voce?.attendance_present, 2, "due di loro presenti");
});

test("un evento senza appello risponde zero, non l'assenza della chiave", async () => {
  /*
    Chi legge fa `> 0`: una chiave che a volte c'e e a volte no e il modo in
    cui una scheda finisce per dire «Presenze salvate» perche `undefined` non
    e `0`.
  */
  const righe = await eventi();
  const voce = per(righe, SENZA_APPELLO);

  assert.equal(voce?.attendance_recorded, 0);
  assert.equal(voce?.attendance_present, 0);
});

test("le risposte della famiglia non contano come appello", async () => {
  const righe = await eventi();
  const voce = per(righe, SOLO_RISPOSTE);

  assert.equal(
    voce?.attendance_recorded,
    0,
    "due righe `pending` sono due promesse, non due presenze registrate",
  );
});

test("le due schermate che aprono il registro leggono lo stesso archivio", () => {
  /*
    **La superficie, non solo il contratto** (CLAUDE.md §11.8).

    Le schermate sono due — la pagina Allenamenti del club e la bacheca
    dell'allenatore — e correggerne una sola sarebbe stato il difetto di prima
    con meta della sua superficie. Il lettore e uno.
  */
  for (const file of [
    "src/app/training/page.tsx",
    "src/components/trainer/trainer-trainings-dashboard-page.tsx",
  ]) {
    const sorgente = readFileSync(file, "utf8");
    assert.match(
      sorgente,
      /from "@\/lib\/api\/attendance-roll"/,
      `${file}: deve rileggere l'appello dall'archivio prima di riaprire il registro`,
    );
  }
});

test("«l'appello e stato fatto?» ha un lettore solo", () => {
  /*
    La pagina Allenamenti aveva la propria risposta — `training.attendance` non
    vuoto — accanto a quella canonica di `trainer-operational-alerts`. Due
    risposte alla stessa domanda sono il modo in cui una schermata dice
    «Presenze salvate» e quella accanto «Presenze mancanti» sullo stesso
    allenamento.
  */
  const sorgente = readFileSync("src/app/training/page.tsx", "utf8");

  assert.match(
    sorgente,
    /readRecordedAttendance/,
    "il vaglio deve passare dalla primitiva condivisa",
  );
  assert.ok(
    !/const hasAttendance =\s*\n?\s*Array\.isArray\(training\.attendance\)/.test(
      sorgente,
    ),
    "la copia privata che guardava solo l'array non deve tornare",
  );
});
