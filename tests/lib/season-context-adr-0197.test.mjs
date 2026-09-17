import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSeasonContext,
  readRequestedSeason,
  recordBelongsToSeason,
  seasonIdForNewRecord,
  seasonLabelOf,
  seasonWhere,
} from "../../src/lib/seasons/context.ts";

/**
 * **Il risolutore canonico della stagione** (ADR-0197 §2): cinque modi di
 * rispondere che non si mescolano, provati uno per uno.
 */

const settings = {
  activeSeasonId: "s-b",
  seasons: [
    { id: "s-a", label: "2025/26", startDate: "2025-07-01", endDate: "2026-06-30", status: "archived", createdAt: "2025-01-01T00:00:00.000Z" },
    { id: "s-b", label: "2026/27", startDate: "2026-09-01", endDate: "2027-08-31", status: "active", createdAt: "2026-09-01T00:00:00.000Z" },
  ],
};

test("readRequestedSeason distingue assente, vuoto e dichiarato", () => {
  assert.deepEqual(readRequestedSeason(undefined), { value: null, declared: false });
  assert.deepEqual(readRequestedSeason(null), { value: null, declared: false });
  assert.deepEqual(readRequestedSeason(""), { value: null, declared: true });
  assert.deepEqual(readRequestedSeason(" s-a "), { value: "s-a", declared: true });
  const conHeader = new Request("https://local/x", { headers: { "x-active-season-id": "s-b" } });
  assert.deepEqual(readRequestedSeason(conHeader), { value: "s-b", declared: true });
  const senzaHeader = new Request("https://local/x");
  assert.deepEqual(readRequestedSeason(senzaHeader), { value: null, declared: false });
});

test("nessuna dichiarazione → attiva; dichiarata del club → selected/active; vuota → none; stale → attiva", () => {
  assert.equal(buildSeasonContext(settings).kind, "active");
  assert.equal(buildSeasonContext(settings).seasonId, "s-b");

  const a = buildSeasonContext(settings, readRequestedSeason("s-a"));
  assert.equal(a.kind, "selected");
  assert.equal(a.seasonId, "s-a");

  const b = buildSeasonContext(settings, readRequestedSeason("s-b"));
  assert.equal(b.kind, "active");

  const vuota = buildSeasonContext(settings, readRequestedSeason(""));
  assert.equal(vuota.kind, "none");
  assert.equal(vuota.seasonId, null);
  assert.equal(vuota.perimeterDisabled, true);

  const stale = buildSeasonContext(settings, readRequestedSeason("s-di-un-altro-club"));
  assert.equal(stale.kind, "active");
  assert.equal(stale.seasonId, "s-b");
  assert.equal(stale.requestedUnknown, true);
});

test("un club senza stagioni salvate non ha perimetro, qualunque cosa dichiari", () => {
  const ctx = buildSeasonContext({}, readRequestedSeason("season-2026-2027"));
  assert.equal(ctx.kind, "none");
  assert.equal(ctx.isFallback, true);
  assert.equal(ctx.seasonId, null);
  assert.deepEqual(ctx.knownSeasonIds, []);
  assert.equal(seasonIdForNewRecord(ctx), null, "non si marca");
});

test("recordBelongsToSeason: la riga senza annata e l'orfana sono della stagione piu vecchia", () => {
  const inA = buildSeasonContext(settings, readRequestedSeason("s-a"));
  const inB = buildSeasonContext(settings, readRequestedSeason("s-b"));
  assert.equal(recordBelongsToSeason("s-a", inA), true);
  assert.equal(recordBelongsToSeason("s-b", inA), false);
  assert.equal(recordBelongsToSeason(null, inA), true);
  assert.equal(recordBelongsToSeason("", inA), true);
  assert.equal(recordBelongsToSeason("s-sconosciuta", inA), true);
  assert.equal(recordBelongsToSeason(null, inB), false);
  assert.equal(recordBelongsToSeason("s-sconosciuta", inB), false);
  assert.equal(recordBelongsToSeason("s-a", buildSeasonContext(settings, readRequestedSeason(""))), true, "senza perimetro passa tutto");
});

test("seasonWhere: identita esatta per una stagione non baseline, OR con i senza annata per la piu vecchia", () => {
  const inB = buildSeasonContext(settings, readRequestedSeason("s-b"));
  assert.deepEqual(seasonWhere(inB), { season_id: "s-b" });
  const inA = buildSeasonContext(settings, readRequestedSeason("s-a"));
  assert.deepEqual(seasonWhere(inA), {
    OR: [{ season_id: "s-a" }, { season_id: null }, { season_id: "" }, { season_id: { notIn: ["s-b", "s-a"] } }],
  });
  assert.equal(seasonWhere(buildSeasonContext(settings, readRequestedSeason(""))), null);
});

test("seasonIdForNewRecord: la riga tiene la sua; altrimenti la dichiarata; senza dichiarazione l'attiva", () => {
  const inA = buildSeasonContext(settings, readRequestedSeason("s-a"));
  assert.equal(seasonIdForNewRecord(inA, "s-b"), "s-b", "una riga che porta gia la sua stagione la tiene");
  assert.equal(seasonIdForNewRecord(inA), "s-a");
  assert.equal(seasonIdForNewRecord(buildSeasonContext(settings)), "s-b");
  assert.equal(seasonIdForNewRecord(buildSeasonContext(settings, readRequestedSeason(""))), null, "header vuoto: nessun perimetro e nessuna marcatura, come il registro generico");
});

test("seasonLabelOf: etichetta del club, «altra stagione» per un id sparito, baseline per il vuoto", () => {
  const seasons = buildSeasonContext(settings).seasons;
  assert.equal(seasonLabelOf(seasons, "s-a"), "2025/26");
  assert.equal(seasonLabelOf(seasons, "s-mai"), "altra stagione");
  assert.equal(seasonLabelOf(seasons, null, "s-a"), "2025/26");
  assert.equal(seasonLabelOf(seasons, null, null), null);
});
