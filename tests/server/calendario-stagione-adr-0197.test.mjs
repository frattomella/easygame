import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Bug B del lotto ADR-0197: il calendario della stagione B mostrava la A.**
 *
 * Sul pilota (sola lettura, 2026-09-17): 21 allenamenti generati e 2 gare
 * con \`season_id\` della stagione A, 3 allenamenti e 1 gara **senza**
 * stagione (creati a mano: nessuna rotta la scriveva), e la stagione B
 * attiva. \`GET /api/v1/events\` filtrava per stagione solo con un parametro
 * che nessuna schermata passava, e \`x-active-season-id\` non lo leggeva.
 *
 * Le due stagioni del pilota si **sovrappongono** (A: 1 lug → 30 giu; B: 1
 * set → 31 ago): un evento del 20 settembre sta in tutte e due le finestre.
 * Il perimetro e quindi per identita (\`season_id\`), non per data.
 */

const CLUB = "aaaaaaaa-9800-4000-8000-0000000001a7";
const SEGRETERIA = "11111111-9800-4000-8000-000000000aaa";
const A = "season-2026-2027";
const B = "season-2026-09-01-2027-08-31-ru1uu";

const scope = () => ({
  userId: SEGRETERIA,
  activeOrganizationId: CLUB,
  activeRole: "club_manager",
  allowedOrganizationIds: [CLUB],
});

let eventi;
let contesto;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  eventi = await import("../../src/lib/server/events.ts");
  contesto = await import("../../src/lib/server/season-context.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const evento = (id, kind, seasonId, startsAt, extra = {}) => ({
  id,
  organization_id: CLUB,
  kind,
  legacy_id: id,
  title: `${kind} ${id}`,
  status: "scheduled",
  season_id: seasonId,
  category_id: "u15",
  category_name: "Under 15",
  starts_at: new Date(startsAt),
  ends_at: new Date(new Date(startsAt).getTime() + 60 * 60 * 1000),
  version: 1,
  payload: { id },
  ...extra,
});

const seed = () => ({
  user: [{ id: SEGRETERIA, email: "segreteria@club.it" }],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      categories: [{ id: "u15", name: "Under 15" }],
      trainers: [],
      staff_members: [],
      structures: [],
      trainings: [],
      matches: [],
      settings: {
        seasons: [
          { id: A, label: "2026/2027", startDate: "2026-07-01", endDate: "2027-06-30", status: "archived", createdAt: "2026-08-21T00:00:00.000Z" },
          { id: B, label: "2026/27", startDate: "2026-09-01", endDate: "2027-08-31", status: "active", createdAt: "2026-09-16T00:00:00.000Z" },
        ],
        activeSeasonId: B,
      },
    },
  ],
  clubEvent: [
    // §41: stessa data, due stagioni — il 20 settembre alle 18 e A, alle 19 e B.
    evento("ev-a-18", "training", A, "2026-09-20T18:00:00.000Z"),
    evento("ev-b-19", "training", B, "2026-09-20T19:00:00.000Z"),
    evento("gara-a", "match", A, "2026-09-04T18:00:00.000Z"),
    evento("gara-b", "match", B, "2026-09-27T18:00:00.000Z"),
    // Senza stagione: creato a mano prima della correzione. Appartiene alla piu vecchia (A).
    evento("ev-senza", "training", null, "2026-09-03T18:00:00.000Z"),
    // Orfano: nomina una stagione che il club non ha. Vale come «senza».
    evento("ev-orfano", "training", "season-mai-esistita", "2026-09-10T18:00:00.000Z"),
  ],
  clubEventParticipant: [],
  auditLog: [],
  notification: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const ids = (rows) => rows.map((r) => r.id).sort();

test("B attiva, nessuna dichiarazione (cron o header assente): solo gli eventi di B", async () => {
  const stagione = await contesto.resolveSeasonContext(CLUB);
  assert.equal(stagione.kind, "active");
  assert.equal(stagione.seasonId, B);
  const righe = await eventi.listClubEvents(scope(), { season: stagione });
  assert.deepEqual(ids(righe), ["ev-b-19", "gara-b"]);
});

test("header con la A (stagione dichiarata): solo la A, compresi i record senza annata e gli orfani", async () => {
  const stagione = await contesto.resolveSeasonContext(CLUB, A);
  assert.equal(stagione.kind, "selected");
  const righe = await eventi.listClubEvents(scope(), { season: stagione });
  assert.deepEqual(ids(righe), ["ev-a-18", "ev-orfano", "ev-senza", "gara-a"]);
});

test("§41 · stessa giornata, due stagioni: il perimetro e per identita, non per data", async () => {
  const stessaGiornata = { from: "2026-09-20T00:00:00.000Z", to: "2026-09-20T23:59:59.999Z" };
  const inA = await eventi.listClubEvents(scope(), { ...stessaGiornata, season: await contesto.resolveSeasonContext(CLUB, A) });
  const inB = await eventi.listClubEvents(scope(), { ...stessaGiornata, season: await contesto.resolveSeasonContext(CLUB, B) });
  assert.deepEqual(ids(inA), ["ev-a-18"], "alle 18 e della A");
  assert.deepEqual(ids(inB), ["ev-b-19"], "alle 19 e della B");
});

test("per tipo: allenamenti e gare rispettano lo stesso perimetro", async () => {
  const stagione = await contesto.resolveSeasonContext(CLUB, B);
  assert.deepEqual(ids(await eventi.listClubEvents(scope(), { kind: "training", season: stagione })), ["ev-b-19"]);
  assert.deepEqual(ids(await eventi.listClubEvents(scope(), { kind: "match", season: stagione })), ["gara-b"]);
});

test("header stale (stagione che il club non ha): vale l'attiva, non «tutto»", async () => {
  const stagione = await contesto.resolveSeasonContext(CLUB, "season-di-un-altro-club");
  assert.equal(stagione.requestedUnknown, true);
  assert.equal(stagione.seasonId, B);
  const righe = await eventi.listClubEvents(scope(), { season: stagione });
  assert.deepEqual(ids(righe), ["ev-b-19", "gara-b"]);
});

test("header vuoto per scelta, o all_seasons: nessun perimetro, per chi lo chiede sapendolo", async () => {
  const senza = await contesto.resolveSeasonContext(CLUB, "");
  assert.equal(senza.perimeterDisabled, true);
  assert.equal((await eventi.listClubEvents(scope(), { season: senza })).length, 6);
  assert.equal((await eventi.listClubEvents(scope(), { season: await contesto.resolveSeasonContext(CLUB), allSeasons: true })).length, 6);
});

test("season_id esplicito vince sul contesto", async () => {
  const stagione = await contesto.resolveSeasonContext(CLUB, B);
  const righe = await eventi.listClubEvents(scope(), { season: stagione, seasonId: A });
  assert.deepEqual(ids(righe), ["ev-a-18", "ev-orfano", "ev-senza", "gara-a"]);
});

test("un evento creato a mano nasce nella stagione che il browser mostra", async () => {
  const stagione = await contesto.resolveSeasonContext(CLUB, B);
  const row = await eventi.createClubEvent(
    scope(),
    "training",
    { id: "nuovo-b", title: "Nuovo", date: "2026-10-05", time: "18:00", endTime: "19:00", categoryId: "u15", category: "Under 15" },
    { userId: SEGRETERIA },
    { season: stagione },
  );
  assert.equal(row.season_id, B);

  // Senza contesto (un chiamante interno): la stagione attiva del club.
  const row2 = await eventi.createClubEvent(
    scope(),
    "match",
    { id: "gara-nuova", title: "Gara", date: "2026-10-06", time: "18:00", endTime: "19:00", categoryId: "u15", category: "Under 15" },
    { userId: SEGRETERIA },
  );
  assert.equal(row2.season_id, B);

  // Chi guarda la A scrive nella A: cio che si vede e dove si scrive.
  const row3 = await eventi.createClubEvent(
    scope(),
    "training",
    { id: "recupero-a", title: "Recupero", date: "2026-10-07", time: "18:00", endTime: "19:00", categoryId: "u15", category: "Under 15" },
    { userId: SEGRETERIA },
    { season: await contesto.resolveSeasonContext(CLUB, A) },
  );
  assert.equal(row3.season_id, A);
});

test("una PATCH non sposta un evento di stagione: la riga tiene la sua", async () => {
  const aggiornato = await eventi.updateClubEvent(
    scope(),
    "ev-a-18",
    { title: "Rinominato", seasonId: B, version: 1 },
    { userId: SEGRETERIA },
  );
  assert.equal(aggiornato.season_id, A);
  assert.equal(aggiornato.title, "Rinominato");
});

test("un deep link legge un evento di un'altra stagione: lo storico non fa 404", async () => {
  const riga = await eventi.readClubEvent(scope(), "ev-a-18");
  assert.equal(riga?.season_id, A);
});

test("il club senza stagioni salvate non ha perimetro e non marca", async () => {
  fake = createFakePrisma({
    ...seed(),
    club: [{ ...seed().club[0], settings: {} }],
  });
  setPrismaClientForTests(fake.client);
  const stagione = await contesto.resolveSeasonContext(CLUB, "qualunque");
  assert.equal(stagione.kind, "none");
  assert.equal((await eventi.listClubEvents(scope(), { season: stagione })).length, 6);
  const row = await eventi.createClubEvent(
    scope(),
    "training",
    { id: "nuovo-senza", title: "Nuovo", date: "2026-10-05", time: "18:00", endTime: "19:00", categoryId: "u15", category: "Under 15" },
    { userId: SEGRETERIA },
    { season: stagione },
  );
  assert.equal(row.season_id, null);
});
