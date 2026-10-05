import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * **Le gare sul sito pubblico: orario e casa/trasferta** (collaudo a browser
 * del 2026-10-05).
 *
 * Due difetti visti sul sito del club di prova:
 *
 * - una gara delle 18:00 compariva alle 20:00: `club_events.starts_at` porta
 *   le cifre digitate come UTC (ADR-0098) e il sito le formattava come un
 *   istante in Europe/Rome;
 * - una gara in trasferta vinta 78-70 compariva come «70-78 · Sconfitta», con
 *   i parziali scambiati: `home_away` era vuota (i moduli dichiarano
 *   `isHome`) e vuota diventava «in casa».
 */

let matches;
let model;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  matches = await import("../../src/lib/server/website/public-data/matches.ts");
  model = await import("../../src/lib/events/model.ts");
});

test("le cifre dell'archivio diventano l'istante vero nel fuso del club, e ritorno", () => {
  /* 18:00 digitate il 27 settembre (ora legale, UTC+2) sono le 16:00 UTC. */
  const vero = matches.archiveDigitsToInstant(new Date("2026-09-27T18:00:00.000Z"), "Europe/Rome");
  assert.equal(vero.toISOString(), "2026-09-27T16:00:00.000Z");
  /* D'inverno (UTC+1). */
  assert.equal(matches.archiveDigitsToInstant(new Date("2027-01-10T18:00:00.000Z")).toISOString(), "2027-01-10T17:00:00.000Z");
  /* Il viaggio inverso, per i limiti delle query. */
  assert.equal(matches.instantToArchiveDigits(vero, "Europe/Rome").toISOString(), "2026-09-27T18:00:00.000Z");
  /* Mostrata nel fuso del club, l'ora e quella digitata. */
  const ora = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(vero);
  assert.equal(ora, "18:00");
});

test("casa o trasferta: la colonna, poi isHome del modulo; vuota non vuol dire in casa", () => {
  assert.equal(matches.homeAwayOfRow({ home_away: "away" }), "away");
  assert.equal(matches.homeAwayOfRow({ home_away: null, payload: { isHome: false } }), "away");
  assert.equal(matches.homeAwayOfRow({ home_away: null, payload: { homeAway: "trasferta" } }), "away");
  assert.equal(matches.homeAwayOfRow({ home_away: null, payload: { isHome: true } }), "home");
  assert.equal(matches.homeAwayOfRow({ home_away: null }), "home");
  assert.equal(matches.homeAwayOfRow({ home_away: "neutral", payload: { isHome: false } }), "neutral");
});

test("lo scrittore degli eventi ricava home_away da isHome", () => {
  const away = model.toEventColumns("match", { date: "2026-09-27", time: "18:00", opponent: "Basket Gaeta", isHome: false });
  assert.equal(away.home_away, "away");
  const home = model.toEventColumns("match", { date: "2026-09-27", time: "18:00", opponent: "Basket Gaeta", isHome: true });
  assert.equal(home.home_away, "home");
  const declared = model.toEventColumns("match", { date: "2026-09-27", time: "18:00", homeAway: "neutral", isHome: false });
  assert.equal(declared.home_away, "neutral");
  const nothing = model.toEventColumns("training", { date: "2026-09-27", time: "18:00" });
  assert.equal(nothing.home_away, null);
});

test("una trasferta: il risultato e i parziali stanno dalla parte giusta", () => {
  const context = {
    organizationId: "club",
    sport: "basketball",
    seasons: { seasons: [], legacySeasonId: null, activeSeasonId: null },
    teams: [],
    teamById: new Map(),
    opponents: new Map(),
    competitions: new Map(),
    structures: [],
  };
  const row = {
    id: "02d630fd-2fff-4298-942c-55d45e43faef",
    kind: "match",
    title: null,
    status: "completed",
    season_id: null,
    category_id: null,
    category_name: null,
    starts_at: new Date("2026-09-27T16:00:00.000Z"),
    ends_at: null,
    timezone: "Europe/Rome",
    location: "PalaGaeta",
    structure_id: null,
    opponent: "Basket Gaeta",
    home_away: matches.homeAwayOfRow({ home_away: null, payload: { isHome: false } }),
    team_id: null,
    competition_id: null,
    opponent_id: null,
    round_label: null,
    home_score: 70,
    away_score: 78,
    result_status: "final",
    period_scores: null,
  };
  const match = matches.toPublicMatch(context, row, {
    now: new Date("2026-10-05T12:00:00.000Z"),
    bases: {},
    meta: new Map(),
    clubSide: { name: "Fortitudo", shortName: "Fortitudo", logo: null },
  });
  assert.equal(match.homeAway, "away");
  assert.equal(match.home.name, "Basket Gaeta");
  assert.equal(match.away.isClub, true);
  assert.equal(match.result.outcome, "win");
});
