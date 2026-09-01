import assert from "node:assert/strict";
import test from "node:test";

import {
  AUDIENCE_CRITERION_KINDS,
  AUDIENCE_CRITERION_LABELS,
  describeAudienceCriteria,
  normalizeAudienceCriteria,
} from "../../src/lib/audience/criteria.ts";
import {
  EMPTY_EVENT_RSVP,
  fromEventRsvpPayload,
  isWithinFieldAvailability,
  toEventRsvpPayload,
  weekdayKeyOf,
} from "../../src/lib/events/model.ts";
import { calculateCategoryAthleteStats } from "../../src/lib/category-athlete-stats.ts";

/**
 * **Cio che l'evento come riga rende esprimibile** (lane 5F).
 *
 * Tre cose che prima non erano «mancanti»: erano **inesprimibili**.
 *
 * 1. «Scrivi ai convocati» e «scrivi a chi non ha risposto»: la convocazione
 *    era un campo dentro il payload della gara, in dieci grafie;
 * 2. la conferma della famiglia: il dominio RSVP esisteva da due Wave e nessun
 *    evento lo richiedeva mai, perche il campo non compariva in nessun form;
 * 3. «senza risposta» nel rendiconto: non c'era niente da contare.
 */

/* =============================== i due criteri nuovi di pubblico ========= */

test("i due criteri di evento entrano nell'enum chiusa, con la loro etichetta", () => {
  assert.ok(AUDIENCE_CRITERION_KINDS.includes("event_convocated"));
  assert.ok(AUDIENCE_CRITERION_KINDS.includes("event_no_rsvp"));
  assert.equal(
    AUDIENCE_CRITERION_LABELS.event_convocated,
    "Convocati a un evento",
  );
  assert.equal(
    AUDIENCE_CRITERION_LABELS.event_no_rsvp,
    "Senza risposta a un evento",
  );
});

test("un criterio di evento senza eventi selezionati fa fallire", () => {
  /*
    «Convocati a un evento, nessun evento» non e un pubblico vuoto: e una
    selezione che qualcuno credeva di aver fatto.
  */
  assert.throws(
    () => normalizeAudienceCriteria([{ kind: "event_convocated", values: [] }]),
    /nessun elemento selezionato/,
  );
});

test("i criteri di evento si normalizzano e si raccontano", () => {
  const criteri = normalizeAudienceCriteria([
    { kind: "event_no_rsvp", values: ["evento-1", "evento-2", "evento-1"] },
  ]);

  assert.deepEqual(criteri, [
    { kind: "event_no_rsvp", values: ["evento-1", "evento-2"] },
  ]);
  assert.equal(
    describeAudienceCriteria(criteri),
    "Senza risposta a un evento (2)",
  );
});

test("un criterio di evento non si combina con «tutte le famiglie»", () => {
  assert.throws(
    () =>
      normalizeAudienceCriteria([
        { kind: "all_families" },
        { kind: "event_convocated", values: ["evento-1"] },
      ]),
    /non si combina/,
  );
});

/* ======================== l'RSVP che finalmente si puo accendere ========= */

test("il toggle vuoto non scrive ne scadenza ne capienza", () => {
  assert.deepEqual(toEventRsvpPayload(EMPTY_EVENT_RSVP), {
    rsvpRequired: false,
    rsvpDeadline: null,
    capacity: null,
  });
});

test("la scadenza senza la richiesta di conferma non viene scritta", () => {
  /*
    Un evento che non chiede conferma con una scadenza dichiarata e uno stato
    in cui nessuno sa cosa succede al passaggio della data.
  */
  const payload = toEventRsvpPayload({
    rsvpRequired: false,
    rsvpDeadline: "2026-09-04T18:00",
    capacity: "20",
  });
  assert.equal(payload.rsvpRequired, false);
  assert.equal(payload.rsvpDeadline, null);
  assert.equal(payload.capacity, 20);
});

test("la conferma richiesta porta con se la scadenza", () => {
  const payload = toEventRsvpPayload({
    rsvpRequired: true,
    rsvpDeadline: "2026-09-04T18:00",
    capacity: "",
  });
  assert.equal(payload.rsvpRequired, true);
  assert.ok(String(payload.rsvpDeadline).startsWith("2026-09-04T"));
  assert.equal(payload.capacity, null);
});

test("un evento gia salvato si rilegge nei tre campi", () => {
  assert.deepEqual(
    fromEventRsvpPayload({
      rsvpRequired: true,
      rsvpDeadline: "2026-09-04T18:00:00.000Z",
      capacity: 18,
    }),
    {
      rsvpRequired: true,
      rsvpDeadline: "2026-09-04T18:00",
      capacity: "18",
    },
  );
  assert.deepEqual(fromEventRsvpPayload({}), EMPTY_EVENT_RSVP);
});

/* ============================ il campo aperto a quell'ora (W5-11) ======== */

test("il giorno della settimana usa le chiavi delle strutture", () => {
  assert.equal(weekdayKeyOf("2026-09-05T17:30:00.000Z"), "Sab");
  assert.equal(weekdayKeyOf("2026-09-07T17:30:00.000Z"), "Lun");
  assert.equal(weekdayKeyOf("non-una-data"), "");
});

test("un campo che non dichiara niente non e un campo chiuso", () => {
  assert.equal(
    isWithinFieldAvailability({}, "2026-09-05T23:00:00.000Z"),
    true,
    "restringere a zero un dato assente rende inutilizzabile la funzione",
  );
  assert.equal(
    isWithinFieldAvailability(null, "2026-09-05T23:00:00.000Z"),
    true,
  );
});

test("un allenamento fuori dalla fascia del campo viene visto", () => {
  const disponibilita = {
    Sab: [{ start: "09:00", end: "20:00" }],
    Lun: [{ start: "17:00", end: "22:00" }],
  };

  assert.equal(
    isWithinFieldAvailability(
      disponibilita,
      "2026-09-05T18:00:00.000Z",
      "2026-09-05T19:30:00.000Z",
    ),
    true,
  );
  assert.equal(
    isWithinFieldAvailability(
      disponibilita,
      "2026-09-05T23:00:00.000Z",
      "2026-09-06T00:30:00.000Z",
    ),
    false,
    "un allenamento delle 23:00 su un campo che chiude alle 20:00",
  );
  assert.equal(
    isWithinFieldAvailability(
      disponibilita,
      "2026-09-05T19:00:00.000Z",
      "2026-09-05T21:00:00.000Z",
    ),
    false,
    "finire dopo la chiusura conta quanto cominciare dopo",
  );
});

test("un giorno senza fasce, quando gli altri ne hanno, e chiuso", () => {
  assert.equal(
    isWithinFieldAvailability(
      { Lun: [{ start: "17:00", end: "22:00" }] },
      "2026-09-06T18:00:00.000Z",
    ),
    false,
    "la domenica quel campo non apre, e il club lo ha dichiarato",
  );
});

/* ==================== «senza risposta» nel rendiconto (W5-09) ============ */

const atleta = (id, nome) => ({
  id,
  first_name: nome,
  last_name: "Rossi",
  category_id: "u12",
});

test("il silenzio si conta sugli eventi che una conferma l'hanno chiesta", () => {
  const righe = calculateCategoryAthleteStats(
    "u12",
    [atleta("a1", "Marco"), atleta("a2", "Luca")],
    [
      {
        id: "t1",
        categoryId: "u12",
        rsvpRequired: true,
        attendance: [{ athleteId: "a1", rsvp_status: "yes", status: "present" }],
      },
      {
        id: "t2",
        categoryId: "u12",
        rsvpRequired: true,
        attendance: [],
      },
      {
        /* Non chiede niente a nessuno: non entra nel conto del silenzio. */
        id: "t3",
        categoryId: "u12",
        attendance: [],
      },
    ],
    [],
    [],
    [{ id: "u12", name: "Under 12" }],
  );

  const marco = righe.find((riga) => riga.athleteId === "a1");
  const luca = righe.find((riga) => riga.athleteId === "a2");

  assert.equal(marco.rsvpRequested, 2, "due eventi chiedevano una conferma");
  assert.equal(marco.noResponse, 1, "Marco ha risposto a uno solo");
  assert.equal(luca.noResponse, 2, "Luca non ha risposto a nessuno dei due");
});

test("senza eventi che chiedono conferma il silenzio non si conta", () => {
  const righe = calculateCategoryAthleteStats(
    "u12",
    [atleta("a1", "Marco")],
    [{ id: "t1", categoryId: "u12", attendance: [] }],
    [],
    [],
    [{ id: "u12", name: "Under 12" }],
  );

  assert.equal(righe[0].rsvpRequested, 0);
  assert.equal(
    righe[0].noResponse,
    0,
    "dire che ogni famiglia tace su ogni allenamento e vero e non serve a nessuno",
  );
});
