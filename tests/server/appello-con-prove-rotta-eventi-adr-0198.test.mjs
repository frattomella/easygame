import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";
import { MS_CLUB, MS_DIREZIONE, MS_SEASON_A, MS_SEASON_B, seedMultiSeasonClub } from "../helpers/multi-season-club.mjs";

/**
 * **Issue 6 del lotto ADR-0198 sulla rotta vera**: `GET /api/v1/events`
 * conta nel numeratore la rosa, chi e stato aggiunto fuori categoria e le
 * persone in prova (`trial_attendances`), la stessa persona una volta sola.
 * Club a due stagioni: l'evento di A con il suo appello non entra nei numeri
 * di B (test 14).
 */

const EV_B = "eeeeeeee-0198-4000-8000-000000000001";
const EV_A = "eeeeeeee-0198-4000-8000-000000000002";
const PROVA_1 = "77777777-0198-4000-8000-000000000001";
const PROVA_2 = "77777777-0198-4000-8000-000000000002";
const PROVA_CONVERTITA = "77777777-0198-4000-8000-000000000003";

let route;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  route = await import("../../src/app/api/v1/events/route.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import("../../src/lib/server/prisma.ts"));
});

const evento = (id, seasonId, categoryId) => ({
  id,
  organization_id: MS_CLUB,
  kind: "training",
  legacy_id: `legacy-${id.slice(-1)}`,
  title: "Allenamento",
  status: "scheduled",
  season_id: seasonId,
  category_id: categoryId,
  category_ids: [categoryId],
  category_name: "Under 15 Eccellenza",
  group_ids: [],
  starts_at: new Date("2026-09-17T16:00:00.000Z"),
  ends_at: new Date("2026-09-17T17:30:00.000Z"),
  version: 1,
  payload: { id },
});

const partecipante = (id, eventId, athleteId, status, extra = false) => ({
  id,
  organization_id: MS_CLUB,
  event_id: eventId,
  athlete_id: athleteId,
  status,
  is_extra_category: extra,
  notes: null,
});

const prova = (id, firstName, athleteId = null) => ({
  id,
  organization_id: MS_CLUB,
  first_name: firstName,
  last_name: "Prova",
  birth_date: null,
  status: athleteId ? "enrolled" : "in_trial",
  athlete_id: athleteId,
  category_id: "cat-b-u15",
  category_name: "Under 15 Eccellenza",
  group_id: null,
  site_id: null,
  created_by: MS_DIREZIONE,
});

const presenzaDiProva = (id, eventId, trialId, status = "present") => ({
  id,
  organization_id: MS_CLUB,
  event_id: eventId,
  trial_athlete_id: trialId,
  status,
});

const seme = () =>
  seedMultiSeasonClub(
    {},
    {
      session: [
        {
          id: "sess-0198",
          token: "token-0198",
          user_id: MS_DIREZIONE,
          expires_at: new Date(Date.now() + 3600_000),
          created_at: new Date("2026-01-01T00:00:00.000Z"),
          user: { id: MS_DIREZIONE, email: "direzione@club.it", role: "owner", created_at: new Date("2026-01-01T00:00:00.000Z"), updated_at: new Date("2026-01-01T00:00:00.000Z"), email_verified_at: new Date() },
        },
      ],
      user: [{ id: MS_DIREZIONE, email: "direzione@club.it", role: "owner", created_at: new Date("2026-01-01T00:00:00.000Z"), updated_at: new Date("2026-01-01T00:00:00.000Z") }],
      organizationUser: [{ id: "ou-1", organization_id: MS_CLUB, user_id: MS_DIREZIONE, role: "owner", custom_role_id: null, created_at: new Date("2026-01-01T00:00:00.000Z") }],
      clubEvent: [evento(EV_B, MS_SEASON_B, "cat-b-u15"), evento(EV_A, MS_SEASON_A, "cat-a-u15")],
      clubEventParticipant: [
        /* 12 di rosa presenti + 1 fuori rosa presente = 13 presenti, 15 registrati con 2 assenti */
        ...Array.from({ length: 12 }, (_, i) => partecipante(`p-${i}`, EV_B, `atleta-${i}`, "present")),
        partecipante("p-extra", EV_B, "atleta-extra", "present", true),
        partecipante("p-abs-1", EV_B, "atleta-abs-1", "absent"),
        partecipante("p-abs-2", EV_B, "atleta-abs-2", "absent"),
        /* la prova convertita ha anche la riga da atleta sullo stesso evento: una persona */
        partecipante("p-conv", EV_B, "atleta-convertito", "present"),
        /* l'evento di A: il suo appello, 3 righe */
        partecipante("pa-1", EV_A, "atleta-1", "present"),
        partecipante("pa-2", EV_A, "atleta-2", "absent"),
        partecipante("pa-3", EV_A, "atleta-3", "absent"),
      ],
      trialAthlete: [prova(PROVA_1, "Uno"), prova(PROVA_2, "Due"), prova(PROVA_CONVERTITA, "Tre", "atleta-convertito")],
      trialAttendance: [
        presenzaDiProva("t-1", EV_B, PROVA_1),
        presenzaDiProva("t-2", EV_B, PROVA_2),
        presenzaDiProva("t-3", EV_B, PROVA_CONVERTITA),
      ],
    },
  );

beforeEach(() => {
  fake = createFakePrisma(seme());
  setPrismaClientForTests(fake.client);
});

const eventi = async (seasonId) => {
  const risposta = await route.GET(
    new Request("https://easygame.test/api/v1/events?kind=training", {
      headers: { authorization: "Bearer token-0198", "x-active-club-id": MS_CLUB, "x-active-season-id": seasonId },
    }),
  );
  const payload = await risposta.json();
  assert.equal(risposta.status, 200, JSON.stringify(payload));
  return payload.data || [];
};

test("34-35-36 · 12 di rosa + 1 fuori rosa + 2 in prova + 1 convertita (una persona): 16 presenti, 18 registrati", async () => {
  const righe = await eventi(MS_SEASON_B);
  assert.equal(righe.length, 1, "solo l'evento di B");
  const voce = righe[0];
  assert.equal(voce.attendance_present, 16);
  assert.equal(voce.attendance_recorded, 18);
  assert.equal(voce.attendance_present_extra, 1);
  assert.equal(voce.attendance_present_trial, 2, "la prova convertita conta come l'atleta che e diventata");
});

test("14 · l'appello dell'evento di A non entra nei numeri di B, e viceversa", async () => {
  const righeA = await eventi(MS_SEASON_A);
  assert.equal(righeA.length, 1);
  assert.equal(righeA[0].attendance_recorded, 3);
  assert.equal(righeA[0].attendance_present, 1);
});

test("12 · un evento con sole assenze registrate e comunque «registrato»: recorded > 0", async () => {
  fake = createFakePrisma({
    ...seme(),
    clubEventParticipant: [partecipante("p-1", EV_B, "a-1", "absent"), partecipante("p-2", EV_B, "a-2", "absent")],
    trialAttendance: [],
  });
  setPrismaClientForTests(fake.client);
  const [voce] = await eventi(MS_SEASON_B);
  assert.equal(voce.attendance_recorded, 2);
  assert.equal(voce.attendance_present, 0);
});
