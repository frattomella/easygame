import assert from "node:assert/strict";
import test, { after } from "node:test";

import {
  toEventRsvpPayload,
  fromEventRsvpPayload,
} from "../../src/lib/events/model.ts";
import { readEventRsvpConfig, canAnswerRsvp } from "../../src/lib/rsvp/model.ts";

/**
 * **`rsvp_deadline` e un istante vero, non le cifre letterali di
 * `club_events`** — l'audit semantico post-UAT del ticket "date-only
 * timezone shift" ha trovato che la correzione originaria di
 * `toEventRsvpPayload` era andata nella direzione sbagliata: aveva
 * adottato la convenzione a cifre letterali di `starts_at`/`ends_at`
 * (ADR-0098) per un campo che invece **e** confrontato con un istante
 * reale (`src/lib/rsvp/model.ts`, `deadline.getTime() < now.getTime()`).
 *
 * Questi test provano il giro completo — scelta nel form, scrittura,
 * confronto con "adesso", rilettura per riaprire il form — nel fuso in cui
 * gli amministratori di club lo usano davvero (`Europe/Rome`), in CET e in
 * CEST, cosi un domani nessuno riporti qui la convenzione letterale
 * pensando che sia la stessa correzione del giorno civile.
 */

const TZ_ORIGINALE = process.env.TZ;

after(() => {
  if (TZ_ORIGINALE === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = TZ_ORIGINALE;
  }
});

test("CEST (Roma, settembre, UTC+2): una scadenza scritta per le 21:00 chiude l'RSVP alle 21:00 vere, non alle 23:00", () => {
  process.env.TZ = "Europe/Rome";

  // Esattamente quello che un <input type="datetime-local"> manda quando
  // l'amministratore sceglie "17/09/2026 21:00".
  const payload = toEventRsvpPayload({
    rsvpRequired: true,
    rsvpDeadline: "2026-09-17T21:00",
    capacity: "",
  });

  // L'istante scritto DEVE essere l'istante UTC vero di "21:00 a Roma in
  // CEST" — le 19:00 UTC, non le cifre letterali "21:00Z".
  assert.equal(payload.rsvpDeadline, "2026-09-17T19:00:00.000Z");

  const evento = { rsvpRequired: true, rsvpDeadline: payload.rsvpDeadline };

  // Un minuto prima delle 21:00 locali: la porta e ancora aperta.
  const unMinutoPrima = new Date("2026-09-17T18:59:00.000Z");
  const configPrima = readEventRsvpConfig(evento, unMinutoPrima);
  assert.equal(
    canAnswerRsvp({ config: configPrima, now: unMinutoPrima }).allowed,
    true,
  );

  // Un minuto dopo le 21:00 locali: la porta e chiusa.
  const unMinutoDopo = new Date("2026-09-17T19:01:00.000Z");
  const configDopo = readEventRsvpConfig(evento, unMinutoDopo);
  const rispostaDopo = canAnswerRsvp({ config: configDopo, now: unMinutoDopo });
  assert.equal(rispostaDopo.allowed, false);
  assert.equal(rispostaDopo.reason, "deadline_passed");

  // Riaprendo il form, l'ora mostrata e ancora "21:00" — non "19:00" (il
  // difetto che l'audit ha trovato: fromEventRsvpPayload leggeva le cifre
  // UTC gia convertite come se fossero ancora locali).
  const riletto = fromEventRsvpPayload(evento);
  assert.equal(riletto.rsvpDeadline, "2026-09-17T21:00");
});

test("CET (Roma, gennaio, UTC+1): stesso giro, stesso esito — non e un caso che valga solo per CEST", () => {
  process.env.TZ = "Europe/Rome";

  const payload = toEventRsvpPayload({
    rsvpRequired: true,
    rsvpDeadline: "2026-01-15T18:30",
    capacity: "",
  });

  assert.equal(payload.rsvpDeadline, "2026-01-15T17:30:00.000Z");

  const evento = { rsvpRequired: true, rsvpDeadline: payload.rsvpDeadline };
  const riletto = fromEventRsvpPayload(evento);
  assert.equal(riletto.rsvpDeadline, "2026-01-15T18:30");

  const unMinutoDopo = new Date("2026-01-15T17:31:00.000Z");
  const config = readEventRsvpConfig(evento, unMinutoDopo);
  assert.equal(
    canAnswerRsvp({ config, now: unMinutoDopo }).allowed,
    false,
  );
});

test("nessuna scadenza dichiarata: non si scrive e non si legge nulla", () => {
  const payload = toEventRsvpPayload({
    rsvpRequired: true,
    rsvpDeadline: "",
    capacity: "",
  });
  assert.equal(payload.rsvpDeadline, null);

  const riletto = fromEventRsvpPayload({ rsvpRequired: true, rsvpDeadline: null });
  assert.equal(riletto.rsvpDeadline, "");
});
