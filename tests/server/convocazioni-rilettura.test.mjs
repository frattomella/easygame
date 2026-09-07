import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import { readFileSync } from "node:fs";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Le convocazioni si contavano su un payload che nessuno scrive piu**
 * (P0-6, `D-AUD-9`).
 *
 * La convocazione e una colonna di `club_event_participants` con il suo
 * scrittore, `saveEventConvocations` (ADR-0099). Le due schermate che la
 * mostrano leggevano invece `getConvocatedAthleteIdsFromMatch`, che cerca
 * **dieci grafie diverse dentro il payload della gara** —
 * `convocatedAthletes`, `calledAthletes`, `selectedAthleteIds`… — e nessuna di
 * quelle la scrive piu nessuno.
 *
 * Misurato a schermo su un club vero:
 *
 *   * si convocano undici atleti su sedici dalla bacheca, si salva, e la
 *     scheda continua a dire «0/16»;
 *   * riaprendo la finestra non risulta convocato nessuno, quindi salvare una
 *     seconda volta **cancella la rosa** senza dirlo;
 *   * la tabella della pagina Gare mostrava «0 convocati» accanto a
 *     «Completate», sulla stessa riga;
 *   * e da quella pagina la convocazione **non si salvava affatto**: scriveva
 *     `clubs.matches` con `updateClubData`, cioe la proiezione in sola
 *     lettura, che il server rifiuta.
 */

const CLUB = "aaaaaaaa-c600-4000-8000-00000000000a";
const DIREZIONE = "11111111-c600-4000-8000-00000000000b";

const CON_ROSA = "eeeeeeee-c600-4000-8000-000000000001";
const SENZA_ROSA = "eeeeeeee-c600-4000-8000-000000000002";

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

const gara = (id, titolo) => ({
  id,
  organization_id: CLUB,
  kind: "match",
  legacy_id: `legacy-${id.slice(-1)}`,
  title: titolo,
  status: "scheduled",
  category_id: "u15",
  category_ids: ["u15"],
  category_name: "Under 15",
  group_ids: [],
  starts_at: new Date("2026-09-20T15:30:00.000Z"),
  ends_at: new Date("2026-09-20T17:00:00.000Z"),
  version: 1,
  payload: { id },
});

const riga = (id, eventId, athleteId, convocation, status = "pending") => ({
  id,
  organization_id: CLUB,
  event_id: eventId,
  athlete_id: athleteId,
  status,
  convocation_status: convocation,
  notes: null,
});

const seme = () => ({
  session: [
    {
      id: "sess-convocazioni",
      token: "token-convocazioni",
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
  clubEvent: [gara(CON_ROSA, "Con rosa"), gara(SENZA_ROSA, "Senza rosa")],
  clubEventParticipant: [
    riga("c1", CON_ROSA, "atleta-1", "convocated"),
    riga("c2", CON_ROSA, "atleta-2", "convocated"),
    /*
      **Escludere non e convocare**, e nemmeno `null`: `null` significa che
      nessuno ha ancora deciso, non «non convocato», che e una decisione presa.
    */
    riga("c3", CON_ROSA, "atleta-3", "excluded"),
    riga("c4", CON_ROSA, "atleta-4", null),
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seme());
  setPrismaClientForTests(fake.client);
});

const gare = async () => {
  const risposta = await route.GET(
    new Request("https://easygame.test/api/v1/events?kind=match", {
      headers: {
        authorization: "Bearer token-convocazioni",
        "x-active-club-id": CLUB,
      },
    }),
  );
  const payload = await risposta.json();
  assert.equal(risposta.status, 200, JSON.stringify(payload));
  return payload.data || [];
};

const per = (righe, eventId) =>
  righe.find((voce) => String(voce.eventId || voce.id) === eventId);

test("il calendario dice quante convocazioni ha una gara", async () => {
  const righe = await gare();

  assert.equal(per(righe, CON_ROSA)?.convocated_count, 2);
});

test("gli esclusi e gli indecisi non sono convocati", async () => {
  const righe = await gare();

  assert.equal(
    per(righe, CON_ROSA)?.convocated_count,
    2,
    "quattro righe, due convocate: `excluded` e `null` non contano",
  );
});

test("una gara senza rosa risponde zero, non l'assenza della chiave", async () => {
  const righe = await gare();

  assert.equal(per(righe, SENZA_ROSA)?.convocated_count, 0);
});

test("le due schermate leggono la rosa dalle righe", () => {
  /*
    **La superficie, non solo il contratto** (CLAUDE.md §11.8). Le schermate
    sono due — la pagina Gare del club e la bacheca dell'allenatore — e
    correggerne una sola avrebbe lasciato l'altra a cancellare la rosa.
  */
  for (const file of [
    "src/app/matches/page.tsx",
    "src/components/trainer/trainer-matches-dashboard-page.tsx",
  ]) {
    const sorgente = readFileSync(file, "utf8");

    assert.match(
      sorgente,
      /listEventParticipants\(/,
      `${file}: la rosa gia convocata si rilegge dalle righe`,
    );
    assert.match(
      sorgente,
      /rosaConvocata/,
      `${file}: e la finestra si apre su quella, non sul payload`,
    );
  }
});

test("la pagina Gare salva dallo scrittore del dominio, non sulla proiezione", () => {
  /*
    Scriveva `clubs.matches` con `updateClubData`: il server la rifiuta —
    «`matches` e una proiezione degli eventi e si scrive da /api/v1/events» —
    quindi da quella schermata la convocazione non si salvava **da nessuna
    parte**, e usciva solo un errore generico.
  */
  const sorgente = readFileSync("src/app/matches/page.tsx", "utf8");
  const inizio = sorgente.indexOf("const handleSaveConvocations");
  assert.ok(inizio > 0, "la funzione deve esistere");

  const corpo = sorgente.slice(inizio, inizio + 2600);

  assert.match(
    corpo,
    /saveEventConvocations\(/,
    "la convocazione passa dallo scrittore del dominio",
  );
  assert.ok(
    !/updateClubData\(\s*activeClub\.id,\s*"matches"/.test(corpo),
    "e non riscrive la proiezione in sola lettura",
  );
});
