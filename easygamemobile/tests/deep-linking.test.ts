import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseDeepLink,
  resolvePasswordResetTarget,
  resolveRoleGatedDeepLinkTarget,
} from "../client/lib/deep-linking";

// --- parseDeepLink --------------------------------------------------------

test("parseDeepLink legge percorso e query da uno schema di produzione", () => {
  const link = parseDeepLink("easygame://training/abc123?utm=push");
  assert.deepEqual(link.path, ["training", "abc123"]);
  assert.deepEqual(link.query, { utm: "push" });
});

test("parseDeepLink riconosce la forma di sviluppo Expo Go con --/", () => {
  const link = parseDeepLink(
    "exp://192.168.1.10:8081/--/reset-password?uid=u1&token=t1",
  );
  assert.deepEqual(link.path, ["reset-password"]);
  assert.deepEqual(link.query, { uid: "u1", token: "t1" });
});

test("parseDeepLink su un URL malformato non lancia, restituisce percorso vuoto", () => {
  const link = parseDeepLink("non e un url");
  assert.deepEqual(link.path, []);
});

test("parseDeepLink su vuoto o assente restituisce percorso vuoto", () => {
  assert.deepEqual(parseDeepLink("").path, []);
  assert.deepEqual(parseDeepLink(undefined).path, []);
  assert.deepEqual(parseDeepLink(null).path, []);
});

// --- resolvePasswordResetTarget -------------------------------------------

test("resolvePasswordResetTarget riconosce uid e token dal reset-password", () => {
  const target = resolvePasswordResetTarget(
    parseDeepLink("easygame://reset-password?uid=u1&token=t1"),
  );
  assert.deepEqual(target, { userId: "u1", token: "t1" });
});

test("resolvePasswordResetTarget rifiuta un link senza uid o senza token", () => {
  assert.equal(
    resolvePasswordResetTarget(
      parseDeepLink("easygame://reset-password?uid=u1"),
    ),
    null,
  );
  assert.equal(
    resolvePasswordResetTarget(
      parseDeepLink("easygame://reset-password?token=t1"),
    ),
    null,
  );
});

test("resolvePasswordResetTarget non risponde a un percorso diverso", () => {
  assert.equal(
    resolvePasswordResetTarget(parseDeepLink("easygame://training/abc")),
    null,
  );
});

// --- resolveRoleGatedDeepLinkTarget: Trainer -------------------------------

test("Trainer: allenamento e gara aprono la tab giusta con il parametro esistente", () => {
  assert.deepEqual(
    resolveRoleGatedDeepLinkTarget(
      parseDeepLink("easygame://training/tr1"),
      "trainer",
    ),
    {
      tab: "TrainingsTab",
      screen: "Trainings",
      params: { focusTrainingId: "tr1" },
    },
  );
  assert.deepEqual(
    resolveRoleGatedDeepLinkTarget(
      parseDeepLink("easygame://match/m1"),
      "trainer",
    ),
    { tab: "MatchesTab", screen: "Matches", params: { focusMatchId: "m1" } },
  );
});

test("Trainer: notifiche e appuntamenti aprono la schermata di lista, senza id", () => {
  assert.deepEqual(
    resolveRoleGatedDeepLinkTarget(
      parseDeepLink("easygame://notification"),
      "trainer",
    ),
    { tab: "HomeTab", screen: "Notifications" },
  );
  assert.deepEqual(
    resolveRoleGatedDeepLinkTarget(
      parseDeepLink("easygame://appointment"),
      "trainer",
    ),
    { tab: "ProfileTab", screen: "Appointments" },
  );
});

test("Trainer: un allenamento senza identificativo non naviga da nessuna parte", () => {
  assert.equal(
    resolveRoleGatedDeepLinkTarget(
      parseDeepLink("easygame://training"),
      "trainer",
    ),
    null,
  );
});

test("Trainer: un percorso Parent (payment) non risolve nulla sotto il ruolo Trainer", () => {
  assert.equal(
    resolveRoleGatedDeepLinkTarget(
      parseDeepLink("easygame://payment"),
      "trainer",
    ),
    null,
  );
});

// --- resolveRoleGatedDeepLinkTarget: Parent --------------------------------

test("Parent: allenamento e gara aprono il dettaglio evento con eventId e kind", () => {
  assert.deepEqual(
    resolveRoleGatedDeepLinkTarget(
      parseDeepLink("easygame://training/ev1"),
      "parent",
    ),
    {
      tab: "ParentCalendarTab",
      screen: "ParentEventDetail",
      params: { eventId: "ev1", kind: "training" },
    },
  );
  assert.deepEqual(
    resolveRoleGatedDeepLinkTarget(
      parseDeepLink("easygame://match/ev2"),
      "parent",
    ),
    {
      tab: "ParentCalendarTab",
      screen: "ParentEventDetail",
      params: { eventId: "ev2", kind: "match" },
    },
  );
});

test("Parent: rsvp/:id assume kind 'training', event/:kind/:id lo prende esplicito", () => {
  assert.deepEqual(
    resolveRoleGatedDeepLinkTarget(
      parseDeepLink("easygame://rsvp/ev3"),
      "parent",
    ),
    {
      tab: "ParentCalendarTab",
      screen: "ParentEventDetail",
      params: { eventId: "ev3", kind: "training" },
    },
  );
  assert.deepEqual(
    resolveRoleGatedDeepLinkTarget(
      parseDeepLink("easygame://event/match/ev4"),
      "parent",
    ),
    {
      tab: "ParentCalendarTab",
      screen: "ParentEventDetail",
      params: { eventId: "ev4", kind: "match" },
    },
  );
});

test("Parent: pagamenti e documenti aprono la lista (nessun dettaglio per id oggi)", () => {
  assert.deepEqual(
    resolveRoleGatedDeepLinkTarget(
      parseDeepLink("easygame://payment/x"),
      "parent",
    ),
    { tab: "ParentPaymentsTab", screen: "ParentPayments" },
  );
  assert.deepEqual(
    resolveRoleGatedDeepLinkTarget(
      parseDeepLink("easygame://document"),
      "parent",
    ),
    { tab: "ParentServicesTab", screen: "ParentDocuments" },
  );
});

test("Parent: notifiche aprono la bacheca sulla sezione notifiche, come già fa la Home", () => {
  assert.deepEqual(
    resolveRoleGatedDeepLinkTarget(
      parseDeepLink("easygame://notification"),
      "parent",
    ),
    {
      tab: "ParentServicesTab",
      screen: "ParentBoard",
      params: { initialSection: "notifications" },
    },
  );
});

test("nessun ruolo risolto (null) non naviga mai, qualunque sia il percorso", () => {
  assert.equal(
    resolveRoleGatedDeepLinkTarget(
      parseDeepLink("easygame://training/x"),
      null,
    ),
    null,
  );
});

test("un percorso sconosciuto non naviga, per nessuno dei due ruoli", () => {
  assert.equal(
    resolveRoleGatedDeepLinkTarget(parseDeepLink("easygame://boh"), "trainer"),
    null,
  );
  assert.equal(
    resolveRoleGatedDeepLinkTarget(parseDeepLink("easygame://boh"), "parent"),
    null,
  );
});
