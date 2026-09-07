import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  describeFieldAvailability,
  describeInstantForAvailability,
  instantFromLocalTime,
  isWithinFieldAvailability,
} from "../../src/lib/structures-utils.ts";

/**
 * **PP-02 §L — la fascia dichiarata vale anche sulla rotta.**
 *
 * Il divieto sulla **prenotabilita** era gia sulla rotta da W6-54. La
 * **disponibilita** no: la schermata mostrava le fasce del campo e poi lasciava
 * scegliere data e ora con due campi liberi. Una famiglia poteva chiedere il
 * campo alle tre di notte, e la richiesta arrivava in segreteria, dove qualcuno
 * avrebbe dovuto rifiutare a mano una cosa che non doveva potersi chiedere.
 */

const CAMPO = {
  availability: {
    Lun: [{ start: "18:00", end: "20:00" }],
    Mar: [
      { start: "09:00", end: "11:00" },
      { start: "18:00", end: "22:00" },
    ],
  },
};

/** Lunedi 1 marzo 2027, ora italiana (UTC+1 in marzo prima dell'ora legale). */
const lun = (ora, minuti = 0) =>
  new Date(Date.UTC(2027, 2, 1, ora - 1, minuti));
const mar = (ora, minuti = 0) =>
  new Date(Date.UTC(2027, 2, 2, ora - 1, minuti));

test("dentro la fascia dichiarata si passa", () => {
  assert.equal(isWithinFieldAvailability(CAMPO, lun(18), lun(19)), true);
  assert.equal(isWithinFieldAvailability(CAMPO, lun(18), lun(20)), true);
});

test("fuori dalla fascia no, anche se e lo stesso giorno", () => {
  assert.equal(isWithinFieldAvailability(CAMPO, lun(3), lun(4)), false);
  assert.equal(isWithinFieldAvailability(CAMPO, lun(19), lun(21)), false);
  assert.equal(isWithinFieldAvailability(CAMPO, lun(17), lun(19)), false);
});

test("un giorno senza fasce e chiuso, anche se altri giorni ne hanno", () => {
  /* Mercoledi 3 marzo 2027: il campo non dichiara niente. */
  const mer = new Date(Date.UTC(2027, 2, 3, 17));
  const mercoledi = new Date(Date.UTC(2027, 2, 3, 18));
  assert.equal(isWithinFieldAvailability(CAMPO, mer, mercoledi), false);
});

test("due fasce nello stesso giorno valgono tutte e due", () => {
  assert.equal(isWithinFieldAvailability(CAMPO, mar(9, 30), mar(10)), true);
  assert.equal(isWithinFieldAvailability(CAMPO, mar(19), mar(20)), true);
  assert.equal(isWithinFieldAvailability(CAMPO, mar(12), mar(13)), false);
});

test("un campo che non dichiara nessuna fascia non e vincolato", () => {
  /*
    E la lezione di W6-D03, e va detta: chi non ha mai compilato quel riquadro
    non ha espresso una scelta. Trasformare il silenzio in «chiuso sempre»
    spegnerebbe le prenotazioni di ogni club che non lo ha configurato — cioe
    romperebbe una funzione per farne rispettare una che nessuno ha impostato.
  */
  assert.equal(isWithinFieldAvailability({ availability: {} }, lun(3), lun(4)), true);
  assert.equal(
    isWithinFieldAvailability({ availability: undefined }, lun(3), lun(4)),
    true,
  );
});

test("una prenotazione che scavalca la mezzanotte e fuori", () => {
  const inizio = new Date(Date.UTC(2027, 2, 1, 22));
  const fine = new Date(Date.UTC(2027, 2, 2, 1));
  assert.equal(isWithinFieldAvailability(CAMPO, inizio, fine), false);
});

test("le fasce si sanno scrivere, perche il rifiuto le nomina", () => {
  /*
    «Fuori dagli orari» senza dire **quali** e un rifiuto che non si puo
    correggere: la famiglia riproverebbe a caso.
  */
  assert.equal(
    describeFieldAvailability(CAMPO),
    "Lun 18:00-20:00 · Mar 09:00-11:00, 18:00-22:00",
  );
  assert.equal(describeFieldAvailability({ availability: {} }), "");
});


/* ==================================================================== */
/*  Cio che la revisione indipendente ha trovato, e che non deve tornare */
/* ==================================================================== */

test("la fascia storica senza orari non vincola niente", () => {
  /*
    **R4.** `normalizeAvailability` inventava `18:00`-`22:00` per la forma
    storica `{ days: [...] }`. Finche nessuno confrontava la fascia con una
    richiesta era innocuo: serviva a disegnare qualcosa. Da quando la fascia
    **vincola**, un campo con quella forma e senza orari sarebbe diventato
    aperto solo dalle diciotto alle ventidue — e la famiglia avrebbe letto un
    rifiuto che nomina orari che il club non ha mai scritto.

    E la lezione di W6-D03: il silenzio non e una scelta, e riempirlo con un
    valore plausibile lo trasforma in una scelta che nessuno ha fatto.
  */
  const storico = { availability: { days: ["Lun", "Mer"] } };

  assert.equal(describeFieldAvailability(storico), "");
  assert.equal(isWithinFieldAvailability(storico, lun(3), lun(4)), true);
  assert.equal(isWithinFieldAvailability(storico, lun(18), lun(19)), true);
});

test("la forma storica con gli orari continua a valere", () => {
  const storico = {
    availability: { days: ["Lun"], startTime: "19:00", endTime: "21:00" },
  };

  assert.equal(describeFieldAvailability(storico), "Lun 19:00-21:00");
  assert.equal(isWithinFieldAvailability(storico, lun(19), lun(20)), true);
  assert.equal(isWithinFieldAvailability(storico, lun(18), lun(19)), false);
});

test("una prenotazione che finisce a mezzanotte non e il giorno dopo", () => {
  /*
    **R6.** Non scavalca niente: e l'ultimo istante della sera. Ma il calendario
    la scrive gia sul giorno successivo, e il confronto fra i due giorni la
    rifiutava — su un campo aperto «fino a mezzanotte» l'ultima ora non era mai
    prenotabile.
  */
  const campo = { availability: { Lun: [{ start: "22:00", end: "00:00" }] } };
  const inizio = lun(22);
  const mezzanotte = new Date(Date.UTC(2027, 2, 1, 23));

  assert.equal(isWithinFieldAvailability(campo, inizio, mezzanotte), true);
});

test("l'ora digitata si legge nel fuso del club, non del dispositivo", () => {
  /*
    **R5.** `new Date("2027-03-01T18:00")` senza suffisso lo interpreta nel fuso
    del dispositivo, e la fascia si valida in quello del club: per un genitore
    con il telefono su un altro fuso le due cose non erano lo stesso orario. La
    schermata mostrava «Lun 18:00-22:00» e poi rifiutava le 21:30; nel verso
    opposto le 17:30 passavano e il club si trovava in agenda le 18:30.
  */
  const inverno = instantFromLocalTime("2027-03-01", "18:00");
  assert.equal(inverno.toISOString(), "2027-03-01T17:00:00.000Z");

  /* E l'ora legale non si dichiara: la conosce il fuso. */
  const estate = instantFromLocalTime("2027-07-01", "18:00");
  assert.equal(estate.toISOString(), "2027-07-01T16:00:00.000Z");

  /* Cio che rende e quello che la fascia poi legge. */
  const descritto = describeInstantForAvailability(inverno);
  assert.equal(descritto.dayKey, "Lun");
  assert.equal(descritto.minutes, 18 * 60);
  assert.equal(descritto.date, "2027-03-01");

  assert.equal(instantFromLocalTime("", "18:00"), null);
  assert.equal(instantFromLocalTime("2027-03-01", "diciotto"), null);
});

test("il salto dell'ora legale non sposta l'orario di un'ora", () => {
  /*
    **Misurato**: con una sola passata di correzione, il 28 marzo 2027 alle
    01:30 a Roma tornava 00:30. La prima stima cade oltre il salto, prende
    l'offset di **dopo** e sbaglia di un'ora; la seconda passata ricalcola
    sull'istante corretto e chiude.

    E il caso non e teorico: il 28 marzo e dentro la stagione sportiva.
  */
  const rendi = (istante, tz) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      dateStyle: "short",
      timeStyle: "short",
      hour12: false,
    }).format(istante);

  const casi = [
    ["2027-03-28", "01:30", "Europe/Rome"],
    ["2027-03-28", "03:30", "Europe/Rome"],
    ["2027-10-31", "02:30", "Europe/Rome"],
    /* Fusi a mezz'ora e a quarto d'ora, e un fuso negativo. */
    ["2027-01-15", "09:30", "Asia/Kolkata"],
    ["2027-09-24", "12:00", "Pacific/Chatham"],
    ["2027-06-15", "20:00", "America/New_York"],
  ];

  for (const [giorno, ora, tz] of casi) {
    const istante = instantFromLocalTime(giorno, ora, tz);
    assert.ok(
      rendi(istante, tz).includes(ora),
      `${giorno} ${ora} ${tz} -> ${rendi(istante, tz)}`,
    );
  }
});

/* ==================================================================== */
/*  Il difetto vero: il dominio del browser dentro un route handler     */
/* ==================================================================== */

/**
 * **La rotta della prenotazione leggeva le strutture con il dominio del
 * browser**, e per questo non funzionava mai.
 *
 * `getClubStructures` sta in `src/lib/simplified-db.ts` e fa
 * `fetch("/api/v1/clubs?…")` — un percorso **relativo**. Dentro un route
 * handler non c'e nessuna pagina da cui risolverlo: Node risponde
 * `Failed to parse URL`, e la funzione ha un `catch` che restituisce `[]`.
 *
 * Il risultato: **ogni** richiesta di prenotazione riceveva
 * «Struttura non prenotabile», su qualunque struttura di qualunque club. Il
 * vaglio a monte funzionava ed era coperto da test — ma girava su un elenco
 * vuoto, e un elenco vuoto supera qualunque vaglio.
 *
 * Questo presidio non guarda quella rotta: guarda **la classe**. Nessun file
 * che gira sul server puo importare il dominio del browser.
 */

const raccogli = (dir, acc = []) => {
  for (const voce of readdirSync(dir)) {
    const completo = path.join(dir, voce);
    if (statSync(completo).isDirectory()) {
      raccogli(completo, acc);
      continue;
    }
    if (/\.(ts|tsx)$/.test(voce)) acc.push(completo);
  }
  return acc;
};

test("nessun file del server importa il dominio del browser", () => {
  const radici = [
    path.join(process.cwd(), "src", "app", "api"),
    path.join(process.cwd(), "src", "lib", "server"),
  ];

  const colpevoli = [];
  for (const radice of radici) {
    for (const file of raccogli(radice)) {
      const sorgente = readFileSync(file, "utf8");
      const senzaCommenti = sorgente
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

      if (
        /from\s+["']@\/lib\/simplified-db["']/.test(senzaCommenti) ||
        /from\s+["']@\/lib\/supabase["']/.test(senzaCommenti) ||
        /import\(\s*["']@\/lib\/simplified-db["']\s*\)/.test(senzaCommenti)
      ) {
        colpevoli.push(path.relative(process.cwd(), file));
      }
    }
  }

  assert.deepEqual(
    colpevoli,
    [],
    "il dominio del browser fa fetch su percorsi relativi: sul server restituisce sempre l'elenco vuoto, in silenzio",
  );
});

/* ==================================================================== */
/*  Cio che il secondo round di revisione ha trovato                     */
/* ==================================================================== */

test("una prenotazione di trenta ore non passa perche finisce a mezzanotte", () => {
  /*
    **F4, e l'ha introdotta la correzione della mezzanotte.** La finestra
    chiedeva soltanto «un giorno diverso, e mezzanotte»: su quel «diverso»
    passava lunedi 18:00 → **mercoledi** 00:00. La rotta non ha nessun tetto di
    durata, quindi in segreteria sarebbe arrivata una prenotazione di trenta
    ore — e `hasBookingConflict` l'avrebbe poi usata per bloccare tutti gli
    altri.
  */
  const campo = { availability: { Lun: [{ start: "18:00", end: "00:00" }] } };

  const lunediSera = lun(18);
  const martedi0 = new Date(Date.UTC(2027, 2, 1, 23));
  const mercoledi0 = new Date(Date.UTC(2027, 2, 2, 23));

  assert.equal(isWithinFieldAvailability(campo, lunediSera, martedi0), true);
  assert.equal(isWithinFieldAvailability(campo, lunediSera, mercoledi0), false);
});

test("la prenotazione da un lunedi al lunedi dopo non passa", () => {
  /*
    **F5**, preesistente e non vista al primo giro: il confronto guardava il
    **nome** del giorno, che si ripete ogni sette. Adesso guarda la data.
  */
  const campo = { availability: { Lun: [{ start: "18:00", end: "22:00" }] } };
  const traUnaSettimana = new Date(Date.UTC(2027, 2, 8, 19));

  assert.equal(isWithinFieldAvailability(campo, lun(18), traUnaSettimana), false);
  assert.equal(isWithinFieldAvailability(campo, lun(18), lun(20)), true);
});

test("una fascia lasciata a zero non e «aperto tutto il giorno»", () => {
  /*
    **F6.** `00:00`-`00:00` e come si scrive una fascia che nessuno ha
    compilato: leggerla come 00:00-24:00 aprirebbe il campo alle tre di notte
    a un club che non ha configurato niente.
  */
  const campo = { availability: { Lun: [{ start: "00:00", end: "00:00" }] } };

  assert.equal(isWithinFieldAvailability(campo, lun(3), lun(4)), false);
  assert.equal(isWithinFieldAvailability(campo, lun(18), lun(19)), false);
});

test("l'ora che non esiste cade dopo il salto, e non prima", () => {
  /*
    **F10.** Il commento lo dichiarava e a Roma era vero per fortuna: la
    seconda passata capitava dalla parte giusta. Misurato altrove no. Le 02:30
    del 14 marzo 2027 a New York — l'ora che l'orologio salta — tornavano
    **01:30**, prima del buco invece che dopo; e le 00:30 del 5 settembre a
    Santiago tornavano le 23:30 del **giorno precedente**: una prenotazione
    chiesta per un giorno finiva in agenda su quello prima.

    Il fuso del club oggi e uno solo (`Europe/Rome`), quindi il difetto era
    latente. Ma il commento prometteva un comportamento che il codice non
    aveva, ed e la forma di debito che questo pacchetto ha gia incontrato tre
    volte: la promessa scritta accanto al codice che nessuno ha verificato.
  */
  const reso = (istante, timeZone) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(istante);

  assert.equal(
    reso(instantFromLocalTime("2027-03-28", "02:30", "Europe/Rome"), "Europe/Rome"),
    "28/03/2027, 03:30",
  );
  assert.equal(
    reso(
      instantFromLocalTime("2027-03-14", "02:30", "America/New_York"),
      "America/New_York",
    ),
    "14/03/2027, 03:30",
  );
  assert.equal(
    reso(
      instantFromLocalTime("2027-09-05", "00:30", "America/Santiago"),
      "America/Santiago",
    ),
    "05/09/2027, 01:30",
  );
});

test("ogni ora che esiste torna identica, in otto fusi", () => {
  /*
    La correzione dell'ora inesistente tocca il ramo comune, quindi va tenuto
    fermo che non abbia spostato niente di cio che esiste.
  */
  const zone = [
    "Europe/Rome",
    "America/New_York",
    "Pacific/Auckland",
    "America/Santiago",
    "Asia/Kolkata",
    "UTC",
    "Australia/Lord_Howe",
    "Pacific/Chatham",
  ];

  for (const timeZone of zone) {
    for (const giorno of ["2027-01-15", "2027-06-10", "2027-11-07"]) {
      for (const ora of ["00:00", "09:30", "18:00", "23:30"]) {
        const istante = instantFromLocalTime(giorno, ora, timeZone);
        const reso = new Intl.DateTimeFormat("en-GB", {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(istante);

        assert.equal(
          reso,
          `${giorno.slice(8)}/${giorno.slice(5, 7)}/${giorno.slice(0, 4)}, ${ora}`,
          `${timeZone} ${giorno} ${ora}`,
        );
      }
    }
  }
});
