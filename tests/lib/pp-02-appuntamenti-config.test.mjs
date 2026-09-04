import assert from "node:assert/strict";
import test from "node:test";

import {
  bookableAppointmentTypes,
  DEFAULT_APPOINTMENTS_CONFIG,
  findAppointmentType,
  normalizeAppointmentsConfig,
} from "../../src/lib/appointments/config.ts";

/**
 * **PP-02 §K — come riceve un club.**
 *
 * Il dominio degli appuntamenti rispondeva a cinque delle sei domande che una
 * segreteria si fa: chi riceve, dove, per quanto, quando, e se la fascia e
 * attiva. Le due che mancavano:
 *
 * 1. **se** le famiglie possono chiedere. Esisteva `active` sulla singola
 *    fascia, che e un'altra domanda: un club che voleva chiudere le richieste
 *    doveva spegnere le fasce a una a una, e riaprirle a una a una;
 * 2. **per cosa**. Il motivo era testo libero, e in coda arrivavano «info»,
 *    «parlare col mister», «pagamento?»: chi riceveva doveva interpretare la
 *    richiesta prima di poterla assegnare.
 */

test("un club che non ha configurato niente riceve comunque", () => {
  /*
    La lezione di W6-D03, che qui vale identica: chi non ha mai avuto un
    interruttore non puo aver espresso una scelta. Spegnere le richieste a ogni
    club che non ha ancora aperto questa schermata sarebbe togliere una
    funzione per farne rispettare una che nessuno ha impostato.
  */
  assert.equal(normalizeAppointmentsConfig(undefined).familyBookingEnabled, true);
  assert.equal(normalizeAppointmentsConfig({}).familyBookingEnabled, true);
  assert.deepEqual(normalizeAppointmentsConfig(null).types, []);
  assert.equal(DEFAULT_APPOINTMENTS_CONFIG.familyBookingEnabled, true);
});

test("solo un `false` esplicito chiude le richieste", () => {
  assert.equal(
    normalizeAppointmentsConfig({ familyBookingEnabled: false })
      .familyBookingEnabled,
    false,
  );
});

test("un motivo senza nome non e un motivo", () => {
  const config = normalizeAppointmentsConfig({
    types: [{ name: "  " }, { durationMinutes: 30 }, { name: "Colloquio" }],
  });
  assert.deepEqual(
    config.types.map((tipo) => tipo.name),
    ["Colloquio"],
  );
});

test("l'identificativo si ricava dal nome quando non c'e", () => {
  const [tipo] = normalizeAppointmentsConfig({
    types: [{ name: "Colloquio con la segreteria" }],
  }).types;
  assert.equal(tipo.id, "colloquio-con-la-segreteria");
});

test("due voci con lo stesso identificativo diventano una", () => {
  /*
    Due nomi per la stessa scelta: la seconda vincerebbe a caso a seconda di
    chi cerca, e la famiglia vedrebbe due voci identiche.
  */
  const config = normalizeAppointmentsConfig({
    types: [
      { id: "colloquio", name: "Colloquio" },
      { id: "colloquio", name: "Colloquio (nuovo)" },
    ],
  });
  assert.equal(config.types.length, 1);
  assert.equal(config.types[0].name, "Colloquio");
});

test("un motivo e prenotabile finche il club non dice il contrario", () => {
  const config = normalizeAppointmentsConfig({
    types: [
      { name: "Colloquio" },
      { name: "Convocazione", bookable: false },
    ],
  });

  assert.deepEqual(
    bookableAppointmentTypes(config).map((tipo) => tipo.name),
    ["Colloquio"],
  );
});

test("una durata assurda non passa", () => {
  const config = normalizeAppointmentsConfig({
    types: [
      { name: "Lungo", durationMinutes: 100000 },
      { name: "Negativo", durationMinutes: -30 },
      { name: "Testo", durationMinutes: "trenta" },
    ],
  });

  assert.deepEqual(
    config.types.map((tipo) => tipo.durationMinutes),
    [480, 0, 0],
  );
});

test("si ritrova un motivo senza badare alle maiuscole", () => {
  const config = normalizeAppointmentsConfig({
    types: [{ id: "Colloquio", name: "Colloquio" }],
  });

  assert.equal(findAppointmentType(config, "colloquio")?.name, "Colloquio");
  /* Spazi e maiuscole non contano: l'identificativo lo scrive una persona. */
  assert.equal(findAppointmentType(config, "  COLLOQUIO ")?.name, "Colloquio");
  assert.equal(findAppointmentType(config, ""), null);
  assert.equal(findAppointmentType(config, "altro"), null);
});
