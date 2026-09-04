import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  describeFieldAvailability,
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
