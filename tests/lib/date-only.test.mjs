import assert from "node:assert/strict";
import test, { after } from "node:test";

import { formatLocalDateOnly, todayLocalDateOnly } from "../../src/lib/date-only.ts";
import { formatLocalDateKey } from "../../src/lib/training-utils.ts";

/**
 * **La data civile, senza fuso** (bug UAT "date-only timezone shift":
 * selezionare giovedi 17 settembre in `AddMatchForm` produceva una gara
 * salvata il 16).
 *
 * `formatLocalDateOnly` legge un `Date` dagli accessori **locali**
 * (`getFullYear`/`getMonth`/`getDate`), mai da quelli UTC —
 * `.toISOString()` su un `Date` costruito a mezzanotte locale lo
 * riconverte in un istante UTC vero, e per ogni fuso avanti su UTC (tutta
 * l'Italia, tutto l'anno) quella conversione sposta la data indietro di
 * un giorno.
 *
 * Questi test cambiano `process.env.TZ` per provare che la funzione
 * rispetta **qualunque** fuso locale attivo — la garanzia che conta non e
 * "la stessa risposta ovunque" (sarebbe sbagliata: un `Date` costruito a
 * mezzanotte locale a New York e a Roma sono istanti diversi), ma che il
 * giro andata-ritorno (mezzanotte locale -> `formatLocalDateOnly`) non
 * perde mai il giorno civile con cui e cominciato, in nessun fuso.
 */

const TZ_ORIGINALE = process.env.TZ;

after(() => {
  if (TZ_ORIGINALE === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = TZ_ORIGINALE;
  }
});

/** Un giorno scelto da calendario, come lo costruisce `react-day-picker`: mezzanotte locale. */
const mezzanotteLocale = (anno, meseUnoIndicizzato, giorno) =>
  new Date(anno, meseUnoIndicizzato - 1, giorno);

test("formatLocalDateOnly legge anno/mese/giorno locali, con lo zero davanti", () => {
  process.env.TZ = "Europe/Rome";
  assert.equal(formatLocalDateOnly(mezzanotteLocale(2026, 9, 17)), "2026-09-17");
  assert.equal(formatLocalDateOnly(mezzanotteLocale(2026, 1, 5)), "2026-01-05");
});

test("todayLocalDateOnly torna una stringa YYYY-MM-DD ben formata", () => {
  const oggi = todayLocalDateOnly();
  assert.match(oggi, /^\d{4}-\d{2}-\d{2}$/);
});

test("17 settembre selezionato a Roma (CEST, UTC+2) resta il 17 settembre — non il 16", () => {
  process.env.TZ = "Europe/Rome";
  const scelto = mezzanotteLocale(2026, 9, 17);
  // La prova diretta del bug: l'istante UTC di mezzanotte locale a Roma in
  // CEST e gia il giorno prima. formatLocalDateOnly non deve vederlo.
  assert.equal(scelto.toISOString().slice(0, 10), "2026-09-16");
  assert.equal(formatLocalDateOnly(scelto), "2026-09-17");
});

test("CET (Roma, gennaio, UTC+1): la data scelta resta quella scelta", () => {
  process.env.TZ = "Europe/Rome";
  const scelto = mezzanotteLocale(2026, 1, 15);
  assert.equal(formatLocalDateOnly(scelto), "2026-01-15");
});

test("CEST (Roma, luglio, UTC+2): la data scelta resta quella scelta", () => {
  process.env.TZ = "Europe/Rome";
  const scelto = mezzanotteLocale(2026, 7, 15);
  assert.equal(formatLocalDateOnly(scelto), "2026-07-15");
});

test("fuso UTC: la data scelta resta quella scelta (qui non c'e nessuno spostamento da vedere)", () => {
  process.env.TZ = "UTC";
  const scelto = mezzanotteLocale(2026, 9, 17);
  assert.equal(formatLocalDateOnly(scelto), "2026-09-17");
});

test("fuso a ovest di Greenwich (New York, UTC-4/-5): la data scelta resta quella scelta", () => {
  // Un fuso negativo sposterebbe nella direzione OPPOSTA se qualcuno
  // introducesse per errore un .toISOString() da un'altra parte: la
  // mezzanotte locale di New York e un istante UTC del giorno DOPO, non
  // prima. Qui si prova che formatLocalDateOnly non ha questo problema in
  // nessuno dei due versi, perche non passa mai da un istante UTC.
  process.env.TZ = "America/New_York";
  const scelto = mezzanotteLocale(2026, 9, 17);
  assert.equal(scelto.toISOString().slice(0, 10), "2026-09-17"); // qui .toISOString() avrebbe "funzionato" per caso
  assert.equal(formatLocalDateOnly(scelto), "2026-09-17");

  process.env.TZ = "Pacific/Kiritimati"; // UTC+14, il fuso piu avanti che esiste
  const scelto2 = mezzanotteLocale(2026, 9, 17);
  assert.equal(formatLocalDateOnly(scelto2), "2026-09-17");
});

test("fine mese: 31 gennaio, 30 aprile, 28 e 29 febbraio restano quello che sono", () => {
  process.env.TZ = "Europe/Rome";
  assert.equal(formatLocalDateOnly(mezzanotteLocale(2026, 1, 31)), "2026-01-31");
  assert.equal(formatLocalDateOnly(mezzanotteLocale(2026, 4, 30)), "2026-04-30");
  assert.equal(formatLocalDateOnly(mezzanotteLocale(2026, 2, 28)), "2026-02-28");
  // 2028 e bisestile: il 29 febbraio esiste davvero.
  assert.equal(formatLocalDateOnly(mezzanotteLocale(2028, 2, 29)), "2028-02-29");
});

test("fine anno: 31 dicembre e 1 gennaio non si scavalcano", () => {
  process.env.TZ = "Europe/Rome";
  assert.equal(formatLocalDateOnly(mezzanotteLocale(2026, 12, 31)), "2026-12-31");
  assert.equal(formatLocalDateOnly(mezzanotteLocale(2027, 1, 1)), "2027-01-01");
});

test("cambio dell'ora: il weekend in cui Roma passa da CEST a CET (25 ottobre 2026) non sposta la data", () => {
  process.env.TZ = "Europe/Rome";
  assert.equal(formatLocalDateOnly(mezzanotteLocale(2026, 10, 24)), "2026-10-24");
  assert.equal(formatLocalDateOnly(mezzanotteLocale(2026, 10, 25)), "2026-10-25");
  assert.equal(formatLocalDateOnly(mezzanotteLocale(2026, 10, 26)), "2026-10-26");
});

test("cambio dell'ora: il weekend in cui Roma passa da CET a CEST (29 marzo 2026) non sposta la data", () => {
  process.env.TZ = "Europe/Rome";
  assert.equal(formatLocalDateOnly(mezzanotteLocale(2026, 3, 28)), "2026-03-28");
  assert.equal(formatLocalDateOnly(mezzanotteLocale(2026, 3, 29)), "2026-03-29");
  assert.equal(formatLocalDateOnly(mezzanotteLocale(2026, 3, 30)), "2026-03-30");
});

test("formatLocalDateKey (Weekly Program, src/lib/training-utils.ts) e lo stesso formatLocalDateOnly — non una seconda implementazione", () => {
  assert.equal(formatLocalDateKey, formatLocalDateOnly);
});
