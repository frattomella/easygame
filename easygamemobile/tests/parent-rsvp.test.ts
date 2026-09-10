import { test } from "node:test";
import assert from "node:assert/strict";

import {
  findInvitationForEvent,
  resolveRsvpControlView,
} from "../client/lib/parent-rsvp";
import type { RsvpInvitation } from "../client/services/api";

const invitation = (
  overrides: Partial<RsvpInvitation> = {},
): RsvpInvitation => ({
  organizationId: "org1",
  trainingId: "t1",
  athleteId: "a1",
  kind: "training",
  startsAt: "2026-09-12T18:00:00.000Z",
  deadline: "2026-09-12T12:00:00.000Z",
  state: "no_response",
  answeredAt: null,
  canAnswer: true,
  ...overrides,
});

test("nessun invito per l'evento -> stato 'none' (l'evento non richiede RSVP)", () => {
  assert.deepEqual(resolveRsvpControlView(null), { kind: "none" });
});

test("trova l'invito giusto per un evento fra piu inviti", () => {
  const invitations = [
    invitation({ trainingId: "t1" }),
    invitation({ trainingId: "t2" }),
  ];
  assert.equal(findInvitationForEvent(invitations, "t2")?.trainingId, "t2");
  assert.equal(findInvitationForEvent(invitations, "assente"), null);
});

test("invito in attesa di risposta -> pending con la scadenza", () => {
  const view = resolveRsvpControlView(invitation({ state: "no_response" }));
  assert.equal(view.kind, "pending");
});

test("presente confermato", () => {
  const view = resolveRsvpControlView(
    invitation({ state: "yes", note: "In orario" }),
  );
  assert.deepEqual(view, { kind: "attending", note: "In orario" });
});

test("assenza comunicata", () => {
  const view = resolveRsvpControlView(invitation({ state: "no" }));
  assert.deepEqual(view, { kind: "not_attending", note: null });
});

test("risposta non disponibile (termine scaduto) -> disabled con il motivo del server, non inventato", () => {
  const view = resolveRsvpControlView(
    invitation({
      canAnswer: false,
      blockedMessage: "Termine scaduto",
      state: "no_response",
    }),
  );
  assert.deepEqual(view, {
    kind: "disabled",
    reason: "Termine scaduto",
    lastState: null,
  });
});

test("risposta non disponibile ma una risposta precedente resta visibile", () => {
  const view = resolveRsvpControlView(
    invitation({
      canAnswer: false,
      blockedMessage: "Risposte chiuse dal club",
      state: "yes",
    }),
  );
  assert.deepEqual(view, {
    kind: "disabled",
    reason: "Risposte chiuse dal club",
    lastState: "yes",
  });
});
