import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * **Il dominio degli appuntamenti: stati, disponibilita, istante.**
 *
 * Le tre cose che prima non esistevano da nessuna parte, e che qui si provano
 * senza database:
 *
 * - la **macchina a stati**, e soprattutto le transizioni **negate**: nessun
 *   codice scriveva `confirmed`, quindi non c'era niente da vietare — adesso
 *   c'e, e cio che una macchina a stati vale lo si misura su cio che rifiuta;
 * - il calcolo della **disponibilita**, con il ripiego sugli orari di apertura
 *   per i club che non configurano slot;
 * - l'**istante assoluto** nel fuso dichiarato, che chiude le due stringhe
 *   separate interpretate nel fuso del server.
 */

let dominio;

before(async () => {
  dominio = await import("../../src/lib/appointments/model.ts");
});

/* ================================================== la macchina a stati == */

test("le grafie storiche confluiscono negli otto stati", () => {
  assert.equal(dominio.normalizeAppointmentStatus("pending"), "requested");
  assert.equal(dominio.normalizeAppointmentStatus(""), "requested");
  assert.equal(dominio.normalizeAppointmentStatus(undefined), "requested");
  assert.equal(
    dominio.normalizeAppointmentStatus("cancelled"),
    "cancelled_by_club",
    "la sola cancellazione che il prodotto sapeva fare la faceva la segreteria",
  );
  assert.equal(dominio.normalizeAppointmentStatus("confermato"), "confirmed");
});

test("la segreteria conferma, la famiglia no", () => {
  assert.equal(
    dominio.canTransitionAppointment("requested", "confirmed", "club"),
    true,
  );
  assert.equal(
    dominio.canTransitionAppointment("requested", "confirmed", "family"),
    false,
    "chi chiede non si da la risposta da solo",
  );
});

test("un appuntamento confermato non si rifiuta: si annulla", () => {
  assert.equal(
    dominio.canTransitionAppointment("confirmed", "rejected", "club"),
    false,
  );
  assert.equal(
    dominio.canTransitionAppointment("confirmed", "cancelled_by_club", "club"),
    true,
  );
});

test("la famiglia riprograma solo finche e in richiesta", () => {
  assert.equal(
    dominio.canTransitionAppointment("requested", "rescheduled", "family"),
    true,
  );
  assert.equal(
    dominio.canTransitionAppointment("confirmed", "rescheduled", "family"),
    false,
    "spostare un impegno gia in agenda non si fa senza dirlo",
  );
  assert.equal(
    dominio.canTransitionAppointment("confirmed", "rescheduled", "club"),
    true,
  );
});

test("da una richiesta mai confermata non si passa a concluso ne ad assente", () => {
  assert.equal(
    dominio.canTransitionAppointment("requested", "completed", "club"),
    false,
  );
  assert.equal(
    dominio.canTransitionAppointment("requested", "no_show", "club"),
    false,
  );
  assert.equal(
    dominio.canTransitionAppointment("confirmed", "no_show", "club"),
    true,
  );
  assert.equal(
    dominio.canTransitionAppointment("confirmed", "completed", "family"),
    false,
  );
});

test("gli stati terminali non si riaprono", () => {
  for (const terminale of [
    "rejected",
    "rescheduled",
    "cancelled_by_family",
    "cancelled_by_club",
    "completed",
    "no_show",
  ]) {
    for (const arrivo of dominio.APPOINTMENT_STATUSES) {
      assert.equal(
        dominio.canTransitionAppointment(terminale, arrivo, "club"),
        false,
        `${terminale} non deve poter diventare ${arrivo}`,
      );
      assert.equal(
        dominio.canTransitionAppointment(terminale, arrivo, "family"),
        false,
      );
    }
  }
});

test("una transizione negata lancia, e dice per mano di chi", () => {
  assert.throws(
    () => dominio.assertAppointmentTransition("requested", "confirmed", "family"),
    /Transizione non ammessa.*per mano della famiglia/s,
  );
  dominio.assertAppointmentTransition("requested", "confirmed", "club");
});

test("le mosse della famiglia su una richiesta sono due", () => {
  assert.deepEqual(
    dominio.listAppointmentTransitions("requested", "family").sort(),
    ["cancelled_by_family", "rescheduled"],
  );
  assert.deepEqual(
    dominio.listAppointmentTransitions("confirmed", "family"),
    ["cancelled_by_family"],
  );
});

test("gli stati vivi sono i due che occupano un posto", () => {
  assert.equal(dominio.isLiveAppointmentStatus("requested"), true);
  assert.equal(dominio.isLiveAppointmentStatus("confirmed"), true);
  assert.equal(dominio.isLiveAppointmentStatus("rejected"), false);
  assert.equal(dominio.isLiveAppointmentStatus("rescheduled"), false);
});

/* ================================================== l'istante assoluto === */

test("giorno e ora diventano un istante nel fuso dichiarato", () => {
  assert.equal(
    dominio.toAppointmentInstant("2026-07-15", "09:00", "Europe/Rome").toISOString(),
    "2026-07-15T07:00:00.000Z",
    "a luglio l'Italia e a +2",
  );
  assert.equal(
    dominio.toAppointmentInstant("2026-01-15", "09:00", "Europe/Rome").toISOString(),
    "2026-01-15T08:00:00.000Z",
    "a gennaio e a +1: lo scarto non e una costante del fuso",
  );
});

test("lo stesso orario in due fusi diversi non e lo stesso istante", () => {
  const roma = dominio.toAppointmentInstant("2026-07-15", "09:00", "Europe/Rome");
  const londra = dominio.toAppointmentInstant("2026-07-15", "09:00", "Europe/London");
  assert.notEqual(roma.getTime(), londra.getTime());
  assert.equal(londra.toISOString(), "2026-07-15T08:00:00.000Z");
});

test("l'istante torna giorno e ora, e il giro chiude", () => {
  const istante = dominio.toAppointmentInstant("2026-07-15", "18:30", "Europe/Rome");
  assert.equal(dominio.toZonedDay(istante, "Europe/Rome"), "2026-07-15");
  assert.equal(dominio.toZonedTime(istante, "Europe/Rome"), "18:30");
});

test("il giorno della settimana si calcola nel fuso, non in quello del server", () => {
  const istante = new Date("2026-09-07T23:30:00.000Z");
  assert.equal(
    dominio.toZonedWeekday(istante, "Europe/Rome"),
    2,
    "in Italia sono gia le 01:30 di martedi",
  );
  assert.equal(
    dominio.toZonedWeekday(istante, "UTC"),
    1,
    "e in UTC e ancora lunedi: e la differenza che prima nessuno vedeva",
  );
});

test("un fuso che non esiste fallisce, non ricade su quello del server", () => {
  assert.throws(
    () => dominio.toAppointmentInstant("2026-07-15", "09:00", "Europe/Atlantide"),
    /Fuso orario non riconosciuto/,
  );
});

test("un giorno o un orario illeggibili non producono un istante", () => {
  assert.equal(dominio.toAppointmentInstant("", "09:00", "Europe/Rome"), null);
  assert.equal(
    dominio.toAppointmentInstant("2026-07-15", "29:00", "Europe/Rome"),
    null,
  );
});

/* ================================================= la disponibilita ====== */

const LUNEDI = 1;

const regola = (extra = {}) => ({
  id: "slot-1",
  site_id: null,
  assigned_to_user_id: null,
  weekday: LUNEDI,
  specific_date: null,
  start_time: "09:00",
  end_time: "11:00",
  duration_minutes: 30,
  capacity: 1,
  active: true,
  ...extra,
});

const finestra = {
  from: "2026-09-07T00:00:00.000Z",
  to: "2026-09-08T00:00:00.000Z",
  timeZone: "Europe/Rome",
};

test("uno slot di due ore da mezz'ora produce quattro appuntamenti", () => {
  const liberi = dominio.computeFreeAppointmentSlots({
    rules: [regola()],
    ...finestra,
  });

  assert.deepEqual(
    liberi.map((slot) => slot.time),
    ["09:00", "09:30", "10:00", "10:30"],
    "l'ultimo slot deve stare dentro la fascia, non sforarla",
  );
  assert.equal(liberi[0].source, "slot");
  assert.equal(liberi[0].startsAt.toISOString(), "2026-09-07T07:00:00.000Z");
});

test("un appuntamento vivo toglie il posto, uno rifiutato lo restituisce", () => {
  const liberi = dominio.computeFreeAppointmentSlots({
    rules: [regola()],
    busy: [
      { starts_at: new Date("2026-09-07T07:00:00.000Z"), status: "confirmed" },
      { starts_at: new Date("2026-09-07T07:30:00.000Z"), status: "rejected" },
      { starts_at: new Date("2026-09-07T08:00:00.000Z"), status: "cancelled_by_family" },
    ],
    ...finestra,
  });

  assert.deepEqual(
    liberi.map((slot) => slot.time),
    ["09:30", "10:00", "10:30"],
    "solo lo stato vivo occupa: e la ragione per cui l'indice in base dati e parziale",
  );
});

/**
 * **La capienza non c'e piu, e questo test dice perche.**
 *
 * Diceva «la capienza e un conteggio, non un interruttore», e provava che con
 * `capacity: 2` un istante gia occupato veniva proposto una seconda volta. Era
 * vero, ed era il difetto: l'indice unico parziale `appointments_slot_vivo_unico`
 * sta su (club, operatore, inizio) e **non conosce la capienza**, quindi la
 * seconda prenotazione — legittima secondo questo calcolo — veniva rifiutata
 * dal database e tradotta in «quell'orario e appena stato preso». Il conteggio
 * non era una funzione: era una promessa che il presidio non manteneva (W6-56).
 *
 * La prova che la rimozione e sicura — nessun risultato osservabile cambia con
 * capienza 1 — sta in `tests/lib/appuntamenti-capienza-e-privacy.test.mjs`.
 */
test("un istante occupato non si propone, qualunque cosa dichiari la regola", () => {
  const liberi = dominio.computeFreeAppointmentSlots({
    rules: [regola({ capacity: 2 })],
    busy: [{ starts_at: new Date("2026-09-07T07:00:00.000Z"), status: "requested" }],
    ...finestra,
  });

  assert.equal(
    liberi.some((slot) => slot.time === "09:00"),
    false,
    "prima quel posto veniva offerto, e il database lo rifiutava",
  );
  for (const slot of liberi) {
    assert.equal(slot.taken, false);
    assert.equal("capacity" in slot, false);
  }
});

test("gli occupati di un altro operatore non tolgono il posto a questo", () => {
  const liberi = dominio.computeFreeAppointmentSlots({
    rules: [regola({ assigned_to_user_id: "operatore-1" })],
    busy: [
      {
        starts_at: new Date("2026-09-07T07:00:00.000Z"),
        status: "confirmed",
        assigned_to_user_id: "operatore-2",
      },
    ],
    ...finestra,
  });

  assert.equal(
    liberi.some((slot) => slot.time === "09:00"),
    true,
    "due operatori ricevono in parallelo: e il senso di avere un'agenda per persona",
  );
});

test("una chiusura straordinaria toglie il giorno", () => {
  const liberi = dominio.computeFreeAppointmentSlots({
    rules: [
      regola(),
      regola({
        id: "chiusura",
        weekday: null,
        specific_date: "2026-09-07",
        active: false,
      }),
    ],
    ...finestra,
  });

  assert.deepEqual(liberi, [], "una festivita dichiarata non e una riga cancellata");
});

test("la validita di una regola ha due estremi, e valgono entrambi", () => {
  const scaduta = dominio.computeFreeAppointmentSlots({
    rules: [regola({ valid_until: "2026-09-01" })],
    ...finestra,
  });
  assert.deepEqual(scaduta, []);

  const nonAncora = dominio.computeFreeAppointmentSlots({
    rules: [regola({ valid_from: "2026-10-01" })],
    ...finestra,
  });
  assert.deepEqual(nonAncora, []);
});

test("gli slot gia passati non si propongono", () => {
  const liberi = dominio.computeFreeAppointmentSlots({
    rules: [regola()],
    now: new Date("2026-09-07T07:45:00.000Z"),
    ...finestra,
  });

  assert.deepEqual(liberi.map((slot) => slot.time), ["10:00", "10:30"]);
});

/* ============================== il ripiego sugli orari di apertura ======= */

test("senza slot configurati si ricade sugli orari di apertura", () => {
  const liberi = dominio.computeFreeAppointmentSlots({
    rules: [],
    openingHours: {
      monday: { morning: "09:00-10:00" },
      tuesday: "chiuso",
    },
    ...finestra,
  });

  assert.deepEqual(liberi.map((slot) => slot.time), ["09:00", "09:30"]);
  assert.equal(
    liberi[0].source,
    "opening_hours",
    "chi legge deve sapere che nessuno ha dichiarato quanto dura un colloquio",
  );
  assert.equal(liberi[0].slotId, null);
});

test("una regola configurata vince sugli orari di apertura, non ci si somma", () => {
  const liberi = dominio.computeFreeAppointmentSlots({
    rules: [regola({ start_time: "15:00", end_time: "16:00" })],
    openingHours: { monday: { morning: "09:00-12:00" } },
    ...finestra,
  });

  assert.deepEqual(liberi.map((slot) => slot.time), ["15:00", "15:30"]);
  assert.equal(liberi[0].source, "slot");
});

test("un club che non ha ne slot ne orari non riceve nessuno", () => {
  assert.deepEqual(
    dominio.computeFreeAppointmentSlots({ rules: [], openingHours: null, ...finestra }),
    [],
    "e la regola giusta, ed e quella che il prodotto gia applicava",
  );
});

/* ============================ l'orario chiesto deve essere uno di quelli = */

test("un istante fuori dagli slot non si trova fra i liberi", () => {
  const liberi = dominio.computeFreeAppointmentSlots({
    rules: [regola()],
    ...finestra,
  });

  assert.ok(
    dominio.findFreeSlotAt(liberi, new Date("2026-09-07T07:30:00.000Z")),
    "le 09:30 italiane sono uno slot",
  );
  assert.equal(
    dominio.findFreeSlotAt(liberi, new Date("2026-09-07T07:20:00.000Z")),
    null,
    "le 09:20 no: la famiglia sceglie uno slot, non una data qualunque",
  );
});
