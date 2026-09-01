import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **Due capability dichiarate complete che la famiglia non poteva usare.**
 *
 * Sono test sul sorgente perche il progetto non ha un renderer di componenti
 * (vedi 15 — Testing). Non sostituiscono l'apertura della pagina; presidiano
 * le righe che, se tornano come prima, riportano il difetto identico. Ed erano
 * difetti della stessa famiglia — CLAUDE.md §11.8: non codice mancante, codice
 * **irraggiungibile**.
 *
 * 1. **L'appuntamento.** Il server accetta solo un istante che cada
 *    esattamente su uno slot libero (`findFreeSlotAt` confronta `getTime()` su
 *    una griglia di trenta minuti) e calcolava gia gli slot in
 *    `availableSlots`. La schermata offriva invece un `<input type="date">` e
 *    un `<input type="time">` liberi: chi scriveva 09:15 riceveva «scegli uno
 *    slot fra quelli liberi» da un elenco che nessuna schermata gli aveva mai
 *    mostrato.
 *
 * 2. **La gara fra gli inviti RSVP.** Il servizio rispondeva a entrambi i tipi
 *    di evento, ma l'elenco della famiglia leggeva la proiezione dei soli
 *    allenamenti e la pagina Gare era in sola lettura: nessun ruolo poteva
 *    arrivare alla riga scritta.
 */

const read = (relative) =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

const PAGES = read("src/components/parent-dashboard/parent-dashboard-pages.tsx");
const CONTEXT = read(
  "src/components/parent-dashboard/parent-dashboard-context.tsx",
);
const RSVP_SECTION = read("src/components/parent/ParentRsvpSection.tsx");
const ROUTE = read(
  "src/app/api/parent-dashboard/[athleteId]/appointments/route.ts",
);

/**
 * La sola pagina Segreteria.
 *
 * Il file ne contiene nove, e quella delle Strutture ha legittimamente i suoi
 * campi data e ora: prenotare un campo non e chiedere un appuntamento, e li
 * non esiste nessuna griglia di slot. Un'asserzione su tutto il file
 * fallirebbe per la pagina sbagliata.
 */
const secretariat = (() => {
  const start = PAGES.indexOf("export function ParentSecretariatPage()");
  const end = PAGES.indexOf("export function ParentStructuresPage()");
  assert.ok(
    start > 0 && end > start,
    "le due pagine devono esistere e restare in quest'ordine",
  );
  return PAGES.slice(start, end);
})();

/* ---------------------------------------- 1. la famiglia sceglie uno slot */

test("la segreteria non offre piu un giorno e un'ora liberi", () => {
  assert.equal(
    /type="date"/.test(secretariat),
    false,
    "un giorno libero produce quasi sempre un istante fuori dalla griglia",
  );
  assert.equal(
    /type="time"/.test(secretariat),
    false,
    "un'ora libera produce quasi sempre un istante fuori dalla griglia",
  );
});

test("la segreteria legge gli slot che il server calcola", () => {
  assert.match(secretariat, /loadAppointmentSlots/);
  assert.match(
    secretariat,
    /startsAt: selectedSlot\.startsAt/,
    "si invia l'istante dello slot scelto, non un orario ricomposto",
  );
  assert.match(
    secretariat,
    /slotId: selectedSlot\.slotId/,
    "lo slot scelto viaggia con il suo identificativo",
  );
});

test("il pulsante di invio resta spento finche non c'e uno slot scelto", () => {
  assert.match(secretariat, /disabled=\{saving \|\| !selectedSlot\}/);
});

/**
 * Tre stati, non due (10 — UI/UX): un errore di rete raccontato come «nessun
 * orario disponibile» fa credere che la segreteria non riceva nessuno.
 */
test("caricamento, assenza di slot ed errore sono tre casi distinti", () => {
  assert.match(secretariat, /slotsState === "loading"/);
  assert.match(secretariat, /slotsState === "error"/);
  assert.match(secretariat, /days\.length === 0/);
  assert.match(
    secretariat,
    /Nessun orario disponibile per un appuntamento\./,
    "senza slot si dice cosa manca, non si mostra un modulo che fallira",
  );
  assert.match(secretariat, /role="alert"/);
});

/**
 * A 375 px gli orari di un giorno sono una decina: su una riga sola
 * sfonderebbero la colonna, e gli ultimi non si potrebbero premere.
 */
test("gli orari liberi vanno a capo", () => {
  assert.match(secretariat, /className="flex flex-wrap gap-2"/);
});

test("il contesto espone la lettura degli slot e chiede il campo giusto", () => {
  assert.match(CONTEXT, /loadAppointmentSlots: \(\) => Promise<AppointmentSlot\[\]>/);
  assert.match(CONTEXT, /availableSlots/);
  assert.match(
    CONTEXT,
    /startsAt: string;/,
    "l'input di prenotazione porta l'istante, non un giorno e un'ora",
  );
});

/**
 * Il produttore degli slot: se qualcuno lo togliesse dalla risposta, la
 * schermata tornerebbe muta senza nessun errore.
 */
test("la rotta continua a servire gli slot liberi", () => {
  assert.match(ROUTE, /availableSlots:/);
  assert.match(ROUTE, /listFamilyFreeSlots/);
});

/* --------------------------------------- 2. gli inviti sono di due tipi */

test("la pagina Gare monta il controllo di risposta", () => {
  assert.match(
    PAGES,
    /<ParentRsvpSection kind="match" \/>/,
    "senza questo la famiglia non ha nessun modo di confermare una gara",
  );
});

test("la sezione inviti separa allenamenti e gare", () => {
  assert.match(RSVP_SECTION, /kind = "training"/);
  assert.match(
    RSVP_SECTION,
    /invitation\.kind \|\| "training"\) === kind/,
    "ogni invito si mostra sulla pagina del tipo a cui appartiene",
  );
  assert.match(
    RSVP_SECTION,
    /kind === "match" \? "Gara" : "Allenamento"/,
    "il ripiego del titolo segue il tipo: chiamare «Allenamento» una gara era il difetto",
  );
});
