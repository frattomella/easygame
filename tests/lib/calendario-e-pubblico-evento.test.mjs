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
import {
  instantFromLocalTime,
  isWithinFieldAvailability as isWithinFieldAvailabilityDaStrutture,
} from "../../src/lib/structures-utils.ts";

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

test("un evento gia salvato si rilegge nei tre campi, riconvertendo l'ora nel fuso locale", () => {
  /*
    **Correzione della correzione** (audit semantico post-UAT, ticket
    "date-only timezone shift"): questo test si aspettava, dall'istante
    UTC vero "2026-09-04T18:00:00.000Z", di rileggere "18:00" — le cifre
    letterali, senza riconversione. Era proprio il difetto che l'audit ha
    trovato: `fromEventRsvpPayload` deve leggere nel fuso di chi guarda
    (Europe/Rome per il client Web, l'unico chiamante), e le 18:00 UTC del
    4 settembre (CEST, UTC+2) sono le 20:00 locali — non le 18:00.
  */
  const TZ_ORIGINALE = process.env.TZ;
  try {
    process.env.TZ = "Europe/Rome";
    assert.deepEqual(
      fromEventRsvpPayload({
        rsvpRequired: true,
        rsvpDeadline: "2026-09-04T18:00:00.000Z",
        capacity: 18,
      }),
      {
        rsvpRequired: true,
        rsvpDeadline: "2026-09-04T20:00",
        capacity: "18",
      },
    );
  } finally {
    if (TZ_ORIGINALE === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = TZ_ORIGINALE;
    }
  }
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
  /*
    **`club_events` non ha un fuso orario: le sue cifre UTC SONO l'ora
    locale** (ADR-0183). Questa `isWithinFieldAvailability` e quella di
    `src/lib/events/model.ts`, che ha un solo chiamante — `club_events`
    (`src/lib/server/events.ts`) — il cui istante nasce da `toEventInstant`
    con `setUTCHours`: le cifre digitate diventano letteralmente le cifre
    UTC in colonna, mai un vero istante da riconvertire. Le prove qui
    scrivono quindi gli orari come stringhe ISO **UTC dirette**, la stessa
    forma che `toEventInstant`/`toEventDay`/`toEventTime` gia usano in tutto
    il dominio degli eventi — non con `instantFromLocalTime`, che calcola un
    vero UTC ed e la primitiva dell'area famiglia (vedi il test successivo
    per il contrasto).
  */
  const disponibilita = {
    Sab: [{ start: "09:00", end: "20:00" }],
    Lun: [{ start: "17:00", end: "22:00" }],
  };

  const cifre = (giorno, ora) => new Date(`${giorno}T${ora}:00.000Z`);

  assert.equal(
    isWithinFieldAvailability(
      disponibilita,
      cifre("2026-09-05", "18:00"),
      cifre("2026-09-05", "19:30"),
    ),
    true,
  );
  assert.equal(
    isWithinFieldAvailability(
      disponibilita,
      cifre("2026-09-05", "23:00"),
      cifre("2026-09-06", "00:30"),
    ),
    false,
    "un allenamento delle 23:00 su un campo che chiude alle 20:00",
  );
  assert.equal(
    isWithinFieldAvailability(
      disponibilita,
      cifre("2026-09-05", "19:00"),
      cifre("2026-09-05", "21:00"),
    ),
    false,
    "finire dopo la chiusura conta quanto cominciare dopo",
  );

  /*
    **Le due `isWithinFieldAvailability` rispondono deliberatamente cose
    diverse sullo stesso dato scritto in due modi** (ADR-0183): questa (le
    cifre UTC sono l'ora locale) e quella di `structures-utils.ts` (un vero
    UTC va riconvertito in Europe/Rome) non sono la stessa funzione con due
    nomi — sono la risposta giusta per due domini che costruiscono il loro
    istante in due modi diversi. Non e piu un invariante da difendere che
    "rispondano la stessa cosa": lo era quando entrambe ricevevano lo stesso
    genere di istante, e non e piu cosi.
  */
  assert.equal(
    isWithinFieldAvailability(
      { Lun: [{ start: "18:00", end: "20:00" }] },
      cifre("2026-09-07", "18:00"),
      cifre("2026-09-07", "19:00"),
    ),
    true,
    "il lunedi alle 18:00, cifre digitate, il campo e aperto",
  );
});

test("l'area famiglia continua a leggere un vero UTC in Europe/Rome, senza passare da events/model.ts", () => {
  /*
    Contrasto esplicito con il test sopra: `structures-utils.ts` e la
    funzione che l'area famiglia chiama **direttamente**
    (`parent-dashboard-pages.tsx`,
    `app/api/parent-dashboard/[athleteId]/structures/route.ts`), mai
    passando da qui. Il suo istante e un vero UTC (`instantFromLocalTime`),
    e la conversione in Europe/Rome resta corretta e invariata.
  */
  const disponibilita = { Lun: [{ start: "18:00", end: "20:00" }] };

  assert.equal(
    isWithinFieldAvailabilityDaStrutture(
      { availability: disponibilita },
      instantFromLocalTime("2026-09-07", "18:00"),
      instantFromLocalTime("2026-09-07", "19:00"),
    ),
    true,
    "il lunedi alle 18:00 di Roma, vero UTC, il campo e aperto per la famiglia",
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
