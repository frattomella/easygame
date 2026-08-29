import assert from "node:assert/strict";
import test from "node:test";

import {
  canAnswerRsvp,
  isCancelledEventStatus,
  normalizeRsvpStatus,
  readEventRsvpConfig,
  summarizeRsvp,
} from "../../src/lib/rsvp/model.ts";

/**
 * Il dominio RSVP, senza database.
 *
 * Le prove qui riguardano cio che il modulo **decide**: cosa e una risposta,
 * quanti sono i silenzi, e quando una porta si e chiusa. La prova che una
 * risposta non diventa mai una presenza sta in
 * `tests/server/rsvp-service.test.mjs`, dove c'e la riga vera.
 */

const NOW = new Date("2026-09-01T10:00:00Z");

test("una risposta e solo si o no: tutto il resto e nessuna risposta", () => {
  assert.equal(normalizeRsvpStatus("yes"), "yes");
  assert.equal(normalizeRsvpStatus("Si"), "yes");
  assert.equal(normalizeRsvpStatus(" NO "), "no");
  assert.equal(normalizeRsvpStatus("assente"), "no");

  assert.equal(normalizeRsvpStatus(""), null);
  assert.equal(normalizeRsvpStatus(null), null);
  assert.equal(normalizeRsvpStatus("present"), null);
});

/**
 * `maybe` non e uno stato: il modello dati non lo distingue e nessuna
 * schermata lo sa mostrare. Accettarlo significherebbe archiviare una risposta
 * che nessuno puo leggere.
 */
test("il forse non e una risposta valida", () => {
  assert.equal(normalizeRsvpStatus("maybe"), null);
  assert.equal(normalizeRsvpStatus("forse"), null);
});

test("il silenzio si deriva, non si scrive", () => {
  const summary = summarizeRsvp({
    expectedAthleteIds: ["a1", "a2", "a3"],
    rows: [
      { athlete_id: "a1", rsvp_status: "yes", rsvp_note: "arriva tardi" },
      // Riga creata dall'appello: ha uno `status` ma nessuna risposta.
      { athlete_id: "a2", status: "present", rsvp_status: null },
    ],
  });

  assert.equal(summary.yes, 1);
  assert.equal(summary.no, 0);
  assert.equal(summary.noResponse, 2);
  assert.equal(
    summary.byAthlete.find((entry) => entry.athleteId === "a2").state,
    "no_response",
  );
  assert.equal(
    summary.byAthlete.find((entry) => entry.athleteId === "a1").note,
    "arriva tardi",
  );
});

/**
 * Chi ha risposto non sparisce dal riepilogo se cambia categoria dopo
 * l'invito: sparire vorrebbe dire far chiamare un rimpiazzo per qualcuno che
 * aveva confermato.
 */
test("chi ha risposto resta nel riepilogo anche se non e piu atteso", () => {
  const summary = summarizeRsvp({
    expectedAthleteIds: ["a1"],
    rows: [
      { athlete_id: "a1", rsvp_status: "no" },
      { athlete_id: "fuori-elenco", rsvp_status: "yes" },
    ],
  });

  assert.equal(summary.yes, 1);
  assert.equal(summary.no, 1);
  assert.equal(summary.byAthlete.length, 2);
});

test("la configurazione RSVP si legge in piu grafie", () => {
  const camel = readEventRsvpConfig(
    { rsvpRequired: true, rsvpDeadline: "2026-09-02T18:00:00Z" },
    NOW,
  );
  assert.equal(camel.required, true);
  assert.equal(camel.closed, false);

  const snake = readEventRsvpConfig(
    { rsvp_required: "true", rsvp_deadline: "2026-08-30T18:00:00Z" },
    NOW,
  );
  assert.equal(snake.required, true);
  assert.equal(snake.closed, true);

  const nested = readEventRsvpConfig({ rsvp: { required: true } }, NOW);
  assert.equal(nested.required, true);
  assert.equal(nested.deadline, null);
  assert.equal(nested.closed, false);

  assert.equal(readEventRsvpConfig({}, NOW).required, false);
  assert.equal(readEventRsvpConfig({ rsvpRequired: false }, NOW).required, false);
});

test("si puo rispondere finche la scadenza non passa", () => {
  const config = readEventRsvpConfig(
    { rsvpRequired: true, rsvpDeadline: "2026-09-02T18:00:00Z" },
    NOW,
  );

  const aperto = canAnswerRsvp({ config, now: NOW, eventStatus: "upcoming" });
  assert.equal(aperto.allowed, true);
  assert.equal(aperto.reason, null);

  const tardi = canAnswerRsvp({
    config,
    now: new Date("2026-09-03T09:00:00Z"),
    eventStatus: "upcoming",
  });
  assert.equal(tardi.allowed, false);
  assert.equal(tardi.reason, "deadline_passed");
  assert.ok(tardi.message.length > 0);
});

test("un evento annullato non chiede piu niente alla famiglia", () => {
  const config = readEventRsvpConfig({ rsvpRequired: true }, NOW);

  for (const status of ["cancelled", "annullato", "Annullata"]) {
    assert.equal(isCancelledEventStatus(status), true);
    const esito = canAnswerRsvp({ config, now: NOW, eventStatus: status });
    assert.equal(esito.allowed, false);
    assert.equal(esito.reason, "event_cancelled");
  }
});

test("un evento che non chiede conferma non si puo confermare", () => {
  const esito = canAnswerRsvp({
    config: readEventRsvpConfig({}, NOW),
    now: NOW,
    eventStatus: "upcoming",
  });

  assert.equal(esito.allowed, false);
  assert.equal(esito.reason, "not_required");
});

/**
 * La scadenza si rivaluta su `now` e non sulla configurazione letta prima: fra
 * l'apertura della pagina e l'invio possono passare venti minuti.
 */
test("la scadenza si rivaluta al momento della risposta", () => {
  const config = readEventRsvpConfig(
    { rsvpRequired: true, rsvpDeadline: "2026-09-01T10:05:00Z" },
    NOW,
  );
  assert.equal(config.closed, false);

  const esito = canAnswerRsvp({
    config,
    now: new Date("2026-09-01T10:06:00Z"),
    eventStatus: "upcoming",
  });
  assert.equal(esito.allowed, false);
  assert.equal(esito.reason, "deadline_passed");
});
