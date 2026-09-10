import { test } from "node:test";
import assert from "node:assert/strict";

import { summarizeParentHome } from "../client/lib/parent-home-summary";
import type { ParentDashboardData } from "../client/services/api";

const baseDashboard = (
  overrides: Partial<ParentDashboardData> = {},
): ParentDashboardData =>
  ({
    user: { id: "u1", email: "a@b.it", name: "Anna" },
    club: { id: "c1", name: "ASD Uno" },
    athlete: { id: "a1", name: "Marco", guardians: [], linkedAthletes: [] },
    health: {
      status: "valid",
      statusLabel: "Valido",
      expiryDate: null,
      allergies: [],
      notes: null,
    },
    payments: {},
    enrollment: {},
    documents: {},
    trainings: { upcoming: [], history: [], all: [] },
    matches: { upcoming: [], history: [], all: [] },
    attendance: { present: 0, absent: 0, total: 0, rate: 0 },
    appointments: {},
    structures: {},
    notifications: [],
    notificationsUnread: 0,
    analytics: {
      attendanceRate: 0,
      lastAttendance: [],
      nextTraining: null,
      nextMatch: null,
    },
    ...overrides,
  }) as ParentDashboardData;

test("dati caricati: la Home riflette i numeri reali del payload", () => {
  const summary = summarizeParentHome(
    baseDashboard({
      attendance: { present: 8, absent: 2, total: 10, rate: 82 },
      notificationsUnread: 3,
      health: {
        status: "expiring",
        statusLabel: "In scadenza",
        expiryDate: null,
        allergies: [],
        notes: null,
      },
      analytics: {
        attendanceRate: 82,
        lastAttendance: [],
        nextTraining: { id: "t1", date: "2026-09-12", time: "18:00" },
        nextMatch: null,
      },
    }),
  );

  assert.equal(summary.attendanceRateLabel, "82%");
  assert.equal(summary.notificationsUnread, 3);
  assert.equal(summary.certificateStatus, "expiring");
  assert.equal(summary.certificateStatusLabel, "In scadenza");
  assert.notEqual(summary.nextTrainingLabel, "Da definire");
  assert.equal(summary.nextMatchLabel, "Da definire");
});

test("empty: nessun prossimo impegno, nessuna notifica -> etichette oneste, non card nascoste", () => {
  const summary = summarizeParentHome(baseDashboard());
  assert.equal(summary.nextTrainingLabel, "Da definire");
  assert.equal(summary.nextMatchLabel, "Da definire");
  assert.equal(summary.attendanceRateLabel, "0%");
  assert.equal(summary.notificationsUnread, 0);
  assert.deepEqual(summary.upcomingTrainings, []);
  assert.deepEqual(summary.upcomingMatches, []);
});

test("le anteprime si fermano a 2 elementi, come da spec HighlightCard", () => {
  const summary = summarizeParentHome(
    baseDashboard({
      trainings: {
        upcoming: [
          { id: "t1", date: "2026-09-10", time: "18:00" },
          { id: "t2", date: "2026-09-12", time: "18:00" },
          { id: "t3", date: "2026-09-14", time: "18:00" },
        ],
        history: [],
        all: [],
      },
    }),
  );
  assert.equal(summary.upcomingTrainings.length, 2);
});
