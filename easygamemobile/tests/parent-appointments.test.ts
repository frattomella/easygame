import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canSubmitAppointmentRequest,
  isOpenAppointment,
  splitParentAppointments,
} from "../client/lib/parent-appointments";
import type { ParentAppointment } from "../client/services/api";

const appointment = (
  overrides: Partial<ParentAppointment> = {},
): ParentAppointment => ({
  id: "a1",
  title: "Colloquio",
  reason: "Colloquio",
  starts_at: "2026-09-20T17:00:00.000Z",
  ends_at: "2026-09-20T17:30:00.000Z",
  timezone: "Europe/Rome",
  date: "2026-09-20",
  time: "17:00",
  status: "requested",
  status_label: "In attesa di risposta",
  notes: "",
  decision_note: "",
  person: "Mario Rossi",
  athlete_id: "ath1",
  athlete_name: "Marco Rossi",
  slot_id: null,
  site_id: null,
  version: 1,
  can_reschedule: true,
  can_cancel: true,
  created_at: null,
  updated_at: null,
  ...overrides,
});

test("requested/confirmed/rescheduled sono aperti", () => {
  assert.equal(isOpenAppointment("requested"), true);
  assert.equal(isOpenAppointment("confirmed"), true);
  assert.equal(isOpenAppointment("rescheduled"), true);
});

test("completed/rejected/cancelled/no_show sono storico", () => {
  assert.equal(isOpenAppointment("completed"), false);
  assert.equal(isOpenAppointment("rejected"), false);
  assert.equal(isOpenAppointment("cancelled_by_family"), false);
  assert.equal(isOpenAppointment("cancelled_by_club"), false);
  assert.equal(isOpenAppointment("no_show"), false);
});

test("divide correttamente aperti e storico", () => {
  const items = [
    appointment({ id: "open", status: "requested" }),
    appointment({ id: "done", status: "completed" }),
  ];
  const { open, history } = splitParentAppointments(items);
  assert.deepEqual(
    open.map((i) => i.id),
    ["open"],
  );
  assert.deepEqual(
    history.map((i) => i.id),
    ["done"],
  );
});

test("l'invio e abilitato solo con un motivo/tipo E uno slot o data+ora", () => {
  assert.equal(
    canSubmitAppointmentRequest({
      reason: "",
      typeId: "",
      slotId: "",
      date: "",
      time: "",
    }),
    false,
  );
  assert.equal(
    canSubmitAppointmentRequest({
      reason: "Colloquio",
      typeId: "",
      slotId: "slot1",
      date: "",
      time: "",
    }),
    true,
  );
  assert.equal(
    canSubmitAppointmentRequest({
      reason: "",
      typeId: "type1",
      slotId: "",
      date: "2026-10-01",
      time: "18:00",
    }),
    true,
  );
  assert.equal(
    canSubmitAppointmentRequest({
      reason: "Colloquio",
      typeId: "",
      slotId: "",
      date: "2026-10-01",
      time: "",
    }),
    false,
  );
});
