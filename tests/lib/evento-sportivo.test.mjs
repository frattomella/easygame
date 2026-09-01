import assert from "node:assert/strict";
import test from "node:test";

import {
  EVENT_KINDS,
  EVENT_STATUSES,
  assertEventHasRoom,
  assertEventTransition,
  canTransitionEvent,
  findEventOverlaps,
  isEventFull,
  normalizeConvocationStatus,
  normalizeEventKind,
  normalizeEventStatus,
  toEventColumns,
  toEventDay,
  toEventInstant,
  toEventLegacyShape,
  toEventTime,
} from "../../src/lib/events/model.ts";

/**
 * **Il dominio dell'evento sportivo** (ADR-0098).
 *
 * Prima allenamenti e gare erano due array JSON: nessuna di queste regole
 * poteva esistere, perche non c'era una riga su cui appoggiarle. Questi test
 * provano le quattro cose che una colonna JSON non sapeva fare — l'istante, la
 * transizione, la sovrapposizione sul campo, la capienza — piu la traduzione da
 * e verso la forma storica, che e cio che tiene in piedi le novantadue
 * schermate che non sono ancora passate.
 */

/* ============================================ l'istante, non due stringhe = */

test("giorno e ora diventano un istante solo", () => {
  const istante = toEventInstant("2026-09-05", "17:30");
  assert.equal(istante.toISOString(), "2026-09-05T17:30:00.000Z");
  assert.equal(toEventDay(istante), "2026-09-05");
  assert.equal(toEventTime(istante), "17:30");
});

test("una data ISO completa con l'ora a parte non perde l'ora", () => {
  /*
    E la forma con cui il prodotto ha salvato per anni: `date` con il fuso
    dentro, e `time` accanto. L'ora che conta e la seconda.
  */
  const istante = toEventInstant("2026-08-27T16:48:16.437Z", "18:00");
  assert.equal(istante.toISOString(), "2026-08-27T18:00:00.000Z");
});

test("senza ora l'evento comincia a mezzanotte, non a un'ora inventata", () => {
  assert.equal(
    toEventInstant("2026-09-05").toISOString(),
    "2026-09-05T00:00:00.000Z",
  );
});

test("una data che non e una data non diventa un istante", () => {
  assert.equal(toEventInstant("non-una-data", "17:30"), null);
  assert.equal(toEventInstant("", "17:30"), null);
  assert.equal(toEventInstant("2026-09-05", "99:99"), null);
});

test("un evento nuovo senza giorno leggibile viene rifiutato", () => {
  /*
    La migrazione poteva permettersi di conservare un dato rotto rendendolo
    visibile; una scrittura nuova no. Un evento senza un istante non e un
    evento.
  */
  assert.throws(
    () => toEventColumns("training", { title: "Senza data" }),
    /obbligatori/,
  );
});

/* ============================================= tipi, stati, transizioni === */

test("i due tipi e i quattro stati sono un elenco chiuso", () => {
  assert.deepEqual([...EVENT_KINDS], ["training", "match"]);
  assert.deepEqual(
    [...EVENT_STATUSES],
    ["scheduled", "cancelled", "completed", "archived"],
  );
  assert.equal(normalizeEventKind("MATCH"), "match");
  assert.equal(normalizeEventKind("qualunque-cosa"), "training");
});

test("le grafie italiane e inglesi dello stato confluiscono", () => {
  for (const grafia of ["cancelled", "canceled", "annullato", "annullata"]) {
    assert.equal(normalizeEventStatus(grafia), "cancelled");
  }
  for (const grafia of ["completed", "concluso", "conclusa", "concluded"]) {
    assert.equal(normalizeEventStatus(grafia), "completed");
  }
  assert.equal(normalizeEventStatus("upcoming"), "scheduled");
  assert.equal(normalizeEventStatus(undefined), "scheduled");
});

test("un evento annullato si ripristina, uno archiviato no", () => {
  assert.equal(canTransitionEvent("scheduled", "cancelled"), true);
  assert.equal(canTransitionEvent("cancelled", "scheduled"), true);
  assert.equal(canTransitionEvent("completed", "scheduled"), true);
  assert.equal(
    canTransitionEvent("archived", "scheduled"),
    false,
    "un evento ricostruito da una presenza orfana non ha un originale a cui tornare",
  );
  assert.equal(canTransitionEvent("scheduled", "scheduled"), true);
  assert.throws(
    () => assertEventTransition("archived", "cancelled"),
    /non ammessa/,
  );
});

/* ======================================= la sovrapposizione sul campo ===== */

const evento = (id, start, end, luogo = {}) => ({
  id,
  starts_at: start,
  ends_at: end,
  status: "scheduled",
  structure_id: luogo.structure_id ?? null,
  field_id: luogo.field_id ?? null,
  site_id: luogo.site_id ?? null,
});

test("due eventi sullo stesso campo alla stessa ora si vedono", () => {
  const candidato = evento(
    "nuovo",
    "2026-09-05T17:00:00.000Z",
    "2026-09-05T18:30:00.000Z",
    { structure_id: "palestra", field_id: "campo-1" },
  );
  const altri = [
    evento(
      "esistente",
      "2026-09-05T18:00:00.000Z",
      "2026-09-05T19:30:00.000Z",
      { structure_id: "palestra", field_id: "campo-1" },
    ),
  ];

  assert.equal(findEventOverlaps(candidato, altri).length, 1);
});

test("lo stesso orario su un campo diverso non e una sovrapposizione", () => {
  const candidato = evento(
    "nuovo",
    "2026-09-05T17:00:00.000Z",
    "2026-09-05T18:30:00.000Z",
    { structure_id: "palestra", field_id: "campo-1" },
  );
  const altri = [
    evento(
      "esistente",
      "2026-09-05T17:00:00.000Z",
      "2026-09-05T18:30:00.000Z",
      { structure_id: "palestra", field_id: "campo-2" },
    ),
  ];

  assert.deepEqual(findEventOverlaps(candidato, altri), []);
});

test("un evento annullato non occupa il campo", () => {
  const candidato = evento(
    "nuovo",
    "2026-09-05T17:00:00.000Z",
    "2026-09-05T18:30:00.000Z",
    { structure_id: "palestra" },
  );
  const altri = [
    {
      ...evento(
        "annullato",
        "2026-09-05T17:00:00.000Z",
        "2026-09-05T18:30:00.000Z",
        { structure_id: "palestra" },
      ),
      status: "cancelled",
    },
  ];

  assert.deepEqual(findEventOverlaps(candidato, altri), []);
});

test("un evento senza luogo dichiarato non entra in conflitto con nessuno", () => {
  /*
    Un vincolo che rifiutasse un salvataggio per un campo scritto in due grafie
    sarebbe peggio del problema: senza un luogo dichiarato non c'e niente da
    confrontare.
  */
  const candidato = evento(
    "nuovo",
    "2026-09-05T17:00:00.000Z",
    "2026-09-05T18:30:00.000Z",
  );
  assert.deepEqual(
    findEventOverlaps(candidato, [
      evento("altro", "2026-09-05T17:00:00.000Z", "2026-09-05T18:30:00.000Z"),
    ]),
    [],
  );
});

test("un evento non e in conflitto con se stesso", () => {
  const esistente = evento(
    "stesso",
    "2026-09-05T17:00:00.000Z",
    "2026-09-05T18:30:00.000Z",
    { structure_id: "palestra" },
  );
  assert.deepEqual(findEventOverlaps(esistente, [esistente]), []);
});

/* ================================================== la capienza =========== */

test("la capienza conta, e non inventa una coda", () => {
  assert.equal(isEventFull(null, 100), false, "senza capienza non c'e limite");
  assert.equal(isEventFull(0, 100), false);
  assert.equal(isEventFull(20, 19), false);
  assert.equal(isEventFull(20, 20), true);

  assert.doesNotThrow(() => assertEventHasRoom(20, 0, 20));
  assert.throws(() => assertEventHasRoom(20, 0, 21), /Capienza superata/);
  assert.throws(() => assertEventHasRoom(20, 18, 3), /Capienza superata/);
  assert.doesNotThrow(() => assertEventHasRoom(null, 0, 500));
});

/* ============================================== la convocazione =========== */

test("le grafie della convocazione confluiscono in due stati", () => {
  for (const grafia of ["convocated", "convocato", "called", "yes", "true"]) {
    assert.equal(normalizeConvocationStatus(grafia), "convocated");
  }
  for (const grafia of ["excluded", "escluso", "not_called", "no", "false"]) {
    assert.equal(normalizeConvocationStatus(grafia), "excluded");
  }
  assert.equal(
    normalizeConvocationStatus(""),
    null,
    "nessuna decisione non e «non convocato», che e una decisione presa",
  );
});

/* ====================================== dalla riga alla forma storica ===== */

test("la forma storica si ricostruisce dalle colonne, e le colonne vincono", () => {
  const riga = {
    id: "11111111-2222-4000-8000-000000000001",
    organization_id: "club",
    kind: "training",
    legacy_id: "training-demo-1",
    title: "Allenamento Under 15",
    status: "scheduled",
    starts_at: new Date("2026-09-05T17:30:00.000Z"),
    ends_at: new Date("2026-09-05T19:00:00.000Z"),
    category_name: "Under 15",
    site_id: "sede-scauri",
    group_ids: ["group:u15:sede-scauri"],
    capacity: 18,
    rsvp_required: true,
    version: 3,
    payload: {
      id: "training-demo-1",
      title: "Titolo vecchio",
      note_del_mister: "cio che nessuno ha ancora mappato",
    },
  };

  const storico = toEventLegacyShape(riga);

  assert.equal(storico.id, "training-demo-1", "l'identificativo storico resta");
  assert.equal(storico.eventId, riga.id, "e la riga resta raggiungibile");
  assert.equal(storico.date, "2026-09-05");
  assert.equal(storico.time, "17:30");
  assert.equal(storico.end_time, "19:00");
  assert.equal(
    storico.title,
    "Allenamento Under 15",
    "la colonna vince sul payload: la riga e la verita",
  );
  assert.equal(
    storico.note_del_mister,
    "cio che nessuno ha ancora mappato",
    "cio che non ha una colonna non si perde",
  );
  assert.equal(storico.capacity, 18);
  assert.equal(storico.rsvpRequired, true);
  assert.deepEqual(storico.groupIds, ["group:u15:sede-scauri"]);
});

test("la traduzione va e torna senza perdere il giorno", () => {
  const colonne = toEventColumns("match", {
    id: "match-1",
    date: "2026-09-13",
    time: "15:00",
    endTime: "17:00",
    opponent: "Rivali",
    category: "Under 15",
    rsvpRequired: true,
  });

  assert.equal(colonne.kind, "match");
  assert.equal(colonne.legacy_id, "match-1");
  assert.equal(colonne.starts_at.toISOString(), "2026-09-13T15:00:00.000Z");
  assert.equal(colonne.ends_at.toISOString(), "2026-09-13T17:00:00.000Z");
  assert.equal(colonne.opponent, "Rivali");
  assert.equal(colonne.category_name, "Under 15");
  assert.equal(colonne.rsvp_required, true);

  const storico = toEventLegacyShape({
    id: "riga",
    organization_id: "club",
    ...colonne,
    status: colonne.status,
  });
  assert.equal(storico.date, "2026-09-13");
  assert.equal(storico.time, "15:00");
});

test("una fine prima dell'inizio non diventa una fine", () => {
  const colonne = toEventColumns("training", {
    id: "t",
    date: "2026-09-05",
    time: "18:00",
    endTime: "17:00",
  });
  assert.equal(colonne.ends_at, null);
});
