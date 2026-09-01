import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * **Due difetti del dominio degli appuntamenti, e i loro presidi.**
 *
 * 1. **W6-56 — la capienza.** `computeFreeAppointmentSlots` calcolava
 *    `residui = capienza - presi`, ma il presidio che impedisce davvero la
 *    doppia prenotazione e l'indice unico parziale
 *    `appointments_slot_vivo_unico`, che sta su (club, operatore, inizio) e
 *    **non conosce la capienza**. Con `capacity: 2` il dominio proponeva due
 *    prenotazioni sullo stesso istante e la seconda, legittima, veniva
 *    rifiutata dal database con un messaggio falso. Qui si prova la cosa che
 *    rende sicura la rimozione: **con capienza 1 non cambia nessun risultato
 *    osservabile**.
 *
 * 2. **W6-57 — l'elenco chiuso verso la famiglia.** Gli slot liberi
 *    arrivavano al genitore con lo spread, e con loro l'identificativo interno
 *    degli operatori del club. Il presidio non e «togliere quel campo»: e che
 *    la proiezione **dichiari cosa puo uscire**, cosi un campo aggiunto domani
 *    al modello non esce da solo. E la sola forma che dura piu della riga che
 *    la scrive.
 */

let dominio;
let proiezione;

before(async () => {
  dominio = await import("../../src/lib/appointments/model.ts");
  proiezione = await import("../../src/lib/appointments/projection.ts");
});

/** Lunedi 7 settembre 2026 in ora italiana: le 09:00 sono le 07:00 UTC. */
const LUNEDI = "2026-09-07";
const DALLE = new Date("2026-09-07T00:00:00.000Z");
const ALLE = new Date("2026-09-07T23:00:00.000Z");

const regola = (extra = {}) => ({
  id: "slot-1",
  site_id: null,
  assigned_to_user_id: null,
  weekday: 1,
  specific_date: null,
  start_time: "09:00",
  end_time: "10:00",
  duration_minutes: 30,
  active: true,
  ...extra,
});

const liberi = (input = {}) =>
  dominio.computeFreeAppointmentSlots({
    rules: [regola()],
    from: DALLE,
    to: ALLE,
    ...input,
  });

/* ============================================== W6-56: la capienza ======= */

test("con capienza 1 la rimozione non cambia nessun risultato osservabile", () => {
  /*
    La regola «di prima» porta la colonna che non esiste piu, con il valore che
    in archivio hanno tutte le righe: e il default, e nessuna schermata ne ha
    mai scritto un altro. Se il calcolo dipendesse ancora da quel campo, le due
    liste sarebbero diverse.
  */
  const conColonna = dominio.computeFreeAppointmentSlots({
    rules: [regola({ capacity: 1 })],
    from: DALLE,
    to: ALLE,
  });
  const senzaColonna = liberi();

  assert.deepEqual(
    conColonna.map((slot) => slot.startsAt.toISOString()),
    senzaColonna.map((slot) => slot.startsAt.toISOString()),
  );
  assert.deepEqual(
    conColonna.map((slot) => slot.time),
    ["09:00", "09:30"],
  );
});

test("un istante gia preso non si propone, nemmeno se la riga dichiarava capienza 2", () => {
  const occupato = [
    {
      id: "app-1",
      starts_at: dominio.toAppointmentInstant(LUNEDI, "09:00"),
      status: "confirmed",
      assigned_to_user_id: null,
    },
  ];

  const conCapienzaDue = dominio.computeFreeAppointmentSlots({
    rules: [regola({ capacity: 2 })],
    busy: occupato,
    from: DALLE,
    to: ALLE,
  });

  assert.deepEqual(
    conCapienzaDue.map((slot) => slot.time),
    ["09:30"],
    "prima le 09:00 venivano offerte una seconda volta, e il database le rifiutava",
  );
});

test("preso o libero: `taken` e un booleano, e `includeFull` mostra anche i presi", () => {
  const occupato = [
    {
      id: "app-1",
      starts_at: dominio.toAppointmentInstant(LUNEDI, "09:00"),
      status: "requested",
      assigned_to_user_id: null,
    },
  ];

  const tutti = liberi({ busy: occupato, includeFull: true });

  assert.deepEqual(
    tutti.map((slot) => [slot.time, slot.taken]),
    [
      ["09:00", true],
      ["09:30", false],
    ],
  );
  for (const slot of tutti) {
    assert.equal(typeof slot.taken, "boolean");
    assert.equal("capacity" in slot, false, "la capienza non esiste piu");
    assert.equal("remaining" in slot, false);
  }
});

test("il ripiego sugli orari di apertura non dichiara nessuna capienza", () => {
  const regole = dominio.openingHoursToSlotRules("09:00-10:00");

  assert.equal(regole.length > 0, true);
  for (const riga of regole) {
    assert.equal("capacity" in riga, false);
  }
});

/* ================================ W6-57: l'elenco chiuso verso la famiglia */

const SLOT_DEL_DOMINIO = {
  slotId: "slot-1",
  source: "slot",
  siteId: "sede-1",
  assignedToUserId: "11111111-2222-3333-4444-555555555555",
  startsAt: new Date("2026-09-07T07:00:00.000Z"),
  endsAt: new Date("2026-09-07T07:30:00.000Z"),
  day: LUNEDI,
  time: "09:00",
  durationMinutes: 30,
  taken: false,
};

test("alla famiglia non arriva l'identificativo interno dell'operatore", () => {
  const visto = proiezione.toFamilyFreeSlot(SLOT_DEL_DOMINIO);

  assert.equal("assignedToUserId" in visto, false);
  assert.equal("taken" in visto, false);
  assert.equal(
    JSON.stringify(visto).includes(SLOT_DEL_DOMINIO.assignedToUserId),
    false,
    "l'elenco di chi riceve quel giorno non e un dato della famiglia",
  );
});

test("la proiezione e un elenco chiuso: un campo nuovo sul modello non esce da solo", () => {
  /*
    E il presidio vero, e non e lo stesso del test qui sopra. Togliere un campo
    protegge i campi di oggi; dichiarare quali possono uscire protegge anche
    quelli che qualcuno aggiungera domani senza sapere che questa risposta
    arriva a un genitore.
  */
  const visto = proiezione.toFamilyFreeSlot({
    ...SLOT_DEL_DOMINIO,
    notaInterna: "la famiglia e in ritardo con la quota",
    operatorePreferito: "Rossi",
  });

  assert.deepEqual(Object.keys(visto).sort(), [
    "day",
    "durationMinutes",
    "endsAt",
    "siteId",
    "slotId",
    "source",
    "startsAt",
    "time",
  ]);
});

test("l'istante resta, perche e il solo campo che il server confronta", () => {
  const visto = proiezione.toFamilyFreeSlot(SLOT_DEL_DOMINIO);

  assert.equal(visto.startsAt, "2026-09-07T07:00:00.000Z");
  assert.equal(visto.endsAt, "2026-09-07T07:30:00.000Z");
  assert.equal(visto.time, "09:00");
  assert.equal(visto.day, LUNEDI);
});
