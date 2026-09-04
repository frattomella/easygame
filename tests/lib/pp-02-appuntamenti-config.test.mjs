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

test("due voci con lo stesso identificativo restano due voci", () => {
  /*
    **La prima stesura ne scartava una**, e la revisione indipendente ha
    misurato cosa succedeva: il pulsante «Aggiungi» rispondeva con successo e la
    voce non compariva. Due nomi diversi possono ridursi allo stesso
    identificativo — «Colloquio!» e «Colloquio?» — e chi li ha scritti li vuole
    tutti e due.

    Non e la stessa cosa che due voci **identiche**: quelle restano una, perche
    la seconda non aggiunge niente.
  */
  const config = normalizeAppointmentsConfig({
    types: [
      { id: "colloquio", name: "Colloquio" },
      { id: "colloquio", name: "Colloquio (nuovo)" },
    ],
  });
  assert.deepEqual(
    config.types.map((tipo) => tipo.id),
    ["colloquio", "colloquio-2"],
  );

  const daiNomi = normalizeAppointmentsConfig({
    types: [{ name: "Colloquio!" }, { name: "Colloquio?" }],
  });
  assert.deepEqual(
    daiNomi.types.map((tipo) => tipo.name),
    ["Colloquio!", "Colloquio?"],
  );
});

test("solo un booleano spegne le prenotazioni", () => {
  /*
    `=== false` accettava `"false"`, `0` e `null` come «acceso»: un client che
    non sia il browser mandava `{"familyBookingEnabled":"false"}` e riaccendeva
    le prenotazioni credendo di spegnerle. Cio che non e un booleano non e una
    scelta, ed e assenza — che vale «acceso».
  */
  for (const valore of ["false", 0, null, "", "no"]) {
    assert.equal(
      normalizeAppointmentsConfig({ familyBookingEnabled: valore })
        .familyBookingEnabled,
      true,
      String(valore),
    );
  }
  assert.equal(
    normalizeAppointmentsConfig({ familyBookingEnabled: false })
      .familyBookingEnabled,
    false,
  );
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

test("un tipo e un nome, e i campi che non governano niente non ci sono", () => {
  /*
    La prima stesura portava anche durata, sede e operatore. Nessuno li
    leggeva: chi riceve, dove e per quanto lo dice la **fascia**, che e dove
    quei tre valori sono gia onorati. Mostrarli al club voleva dire far credere
    che decidessero qualcosa — «30 min» accanto al motivo, nella tendina della
    famiglia — mentre la durata reale resta quella della fascia scelta.

    E la revisione indipendente ha aggiunto la ragione che vale di piu:
    `assignedToUserId` era l'unico dato di persona che la rotta di lettura
    faceva uscire a chiunque avesse una tessera.
  */
  const [tipo] = normalizeAppointmentsConfig({
    types: [
      {
        name: "Colloquio",
        durationMinutes: 30,
        siteId: "sede-nord",
        assignedToUserId: "un-operatore",
      },
    ],
  }).types;

  assert.deepEqual(Object.keys(tipo).sort(), ["bookable", "id", "name"]);
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
