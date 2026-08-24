import assert from "node:assert/strict";
import test from "node:test";

import {
  applySeasonStatuses,
  buildSeasonFromInput,
  normalizeClubSeasons,
  normalizeSeasonStatus,
  SEASON_STATUS_LABELS,
} from "../../src/lib/club-seasons.ts";

/**
 * Blocco 6 — modello delle stagioni.
 *
 * Tre stati (futura, attiva, archiviata) e una sola invariante che li tiene
 * insieme: la stagione attiva e una e una sola, ed e quella puntata da
 * `activeSeasonId`. Tutto il resto del prodotto legge da li il perimetro dei
 * dati, quindi uno stato incoerente non e un dettaglio estetico.
 */

const settings = (overrides = {}) => ({
  activeSeasonId: "s-2026",
  seasons: [
    {
      id: "s-2027",
      label: "2027/2028",
      startDate: "2027-07-01",
      endDate: "2028-06-30",
      status: "draft",
    },
    {
      id: "s-2026",
      label: "2026/2027",
      startDate: "2026-07-01",
      endDate: "2027-06-30",
      status: "active",
    },
    {
      id: "s-2025",
      label: "2025/2026",
      startDate: "2025-07-01",
      endDate: "2026-06-30",
      status: "active",
    },
  ],
  ...overrides,
});

test("i tre stati hanno un'etichetta e `draft` resta leggibile come futura", () => {
  assert.equal(SEASON_STATUS_LABELS.upcoming, "Futura");
  assert.equal(SEASON_STATUS_LABELS.active, "Attiva");
  assert.equal(SEASON_STATUS_LABELS.archived, "Archiviata");

  assert.equal(normalizeSeasonStatus("draft"), "upcoming");
  assert.equal(normalizeSeasonStatus("archiviata"), "archived");
  assert.equal(normalizeSeasonStatus("qualcosa-di-ignoto"), "upcoming");
});

test("due stagioni dichiarate attive non possono restare entrambe attive", () => {
  const state = normalizeClubSeasons(settings());
  const attive = state.seasons.filter((season) => season.status === "active");

  assert.equal(attive.length, 1);
  assert.equal(attive[0].id, "s-2026");
  assert.equal(state.activeSeasonId, "s-2026");
});

test("lo stato non dichiarato si deduce dal periodo, non si inventa", () => {
  const state = normalizeClubSeasons(settings());
  const byId = Object.fromEntries(
    state.seasons.map((season) => [season.id, season.status]),
  );

  assert.equal(byId["s-2027"], "upcoming", "comincia dopo quella attiva");
  assert.equal(byId["s-2025"], "archived", "comincia prima di quella attiva");
});

test("attivare una stagione futura archivia quella che era attiva", () => {
  const state = normalizeClubSeasons(settings());
  const next = applySeasonStatuses(state.seasons, "s-2027");
  const byId = Object.fromEntries(
    next.map((season) => [season.id, season.status]),
  );

  assert.equal(byId["s-2027"], "active");
  assert.equal(byId["s-2026"], "archived");
  assert.equal(byId["s-2025"], "archived");
  assert.equal(
    next.filter((season) => season.status === "active").length,
    1,
    "non deve mai esistere piu di una stagione attiva",
  );
});

test("una stagione archiviata resta archiviata anche se cambia l'attiva", () => {
  const archiviata = settings({
    activeSeasonId: "s-2025",
    seasons: [
      {
        id: "s-2026",
        label: "2026/2027",
        startDate: "2026-07-01",
        endDate: "2027-06-30",
        status: "archived",
        archivedAt: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "s-2025",
        label: "2025/2026",
        startDate: "2025-07-01",
        endDate: "2026-06-30",
        status: "active",
      },
    ],
  });

  const state = normalizeClubSeasons(archiviata);
  const archived = state.seasons.find((season) => season.id === "s-2026");

  assert.equal(
    archived.status,
    "archived",
    "una scelta esplicita dell'utente non viene riscritta dalle date",
  );
  assert.equal(archived.archivedAt, "2026-08-01T00:00:00.000Z");
});

test("la stagione attiva non porta mai una data di archiviazione", () => {
  const [attiva] = applySeasonStatuses(
    [
      {
        id: "s-2026",
        label: "2026/2027",
        startDate: "2026-07-01",
        endDate: "2027-06-30",
        status: "archived",
        archivedAt: "2026-08-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    "s-2026",
  );

  assert.equal(attiva.status, "active");
  assert.equal(attiva.archivedAt, null);
});

test("una stagione nuova nasce futura e valida il periodo", () => {
  const esistenti = normalizeClubSeasons(settings()).seasons;

  const season = buildSeasonFromInput(
    { startDate: "2028-07-01", endDate: "2029-06-30" },
    esistenti,
    { id: "s-2028", now: "2026-08-24T00:00:00.000Z" },
  );

  assert.equal(season.status, "upcoming");
  assert.equal(season.label, "2028/2029", "l'etichetta si deduce dalle date");
  assert.equal(season.archivedAt, null);

  assert.throws(
    () => buildSeasonFromInput({ startDate: "2028-07-01" }, esistenti),
    /data di inizio e la data di fine/,
  );
  assert.throws(
    () =>
      buildSeasonFromInput(
        { startDate: "2029-07-01", endDate: "2028-06-30" },
        esistenti,
      ),
    /successiva alla data di inizio/,
  );
  assert.throws(
    () =>
      buildSeasonFromInput(
        { startDate: "2027-07-01", endDate: "2028-06-30" },
        esistenti,
      ),
    /stesso periodo|stesso nome|Esiste gia/,
  );
  assert.throws(
    () =>
      buildSeasonFromInput(
        { startDate: "2030-07-01", endDate: "2031-06-30", status: "archived" },
        esistenti,
      ),
    /non puo nascere archiviata/,
  );
});
