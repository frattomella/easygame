import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **Tre capability degli appuntamenti che nessuno poteva raggiungere.**
 *
 * Sono test sul sorgente perche il progetto non ha un renderer di componenti
 * (vedi 15 — Testing). Non sostituiscono l'apertura della pagina; presidiano
 * le righe che, se tornano come prima, riportano il difetto identico. Ed e
 * sempre la stessa forma — CLAUDE.md §11.8: non codice mancante, codice
 * **irraggiungibile**.
 *
 * 1. **W6-53.** Quattro rotte `/api/v1/appointment-slots` e quattro funzioni di
 *    dominio, e `grep -l appointment-slots src/**\/*.tsx` non trovava un solo
 *    file: ogni club del prodotto stava percio nella configurazione di ripiego
 *    sugli orari di apertura.
 * 2. **W6-52a.** `rescheduleClubAppointment` esisteva nel trasporto ed era
 *    importata solo dalla dashboard dell'allenatore: dalla segreteria non si
 *    poteva spostare un appuntamento.
 * 3. **W6-52b.** «Concluso» e «assente»: la rotta le accettava, il trasporto
 *    non aveva la funzione.
 */

const read = (relative) =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

const CLIENT = read("src/lib/api/appointments-client.ts");
const SEGRETERIA = read("src/app/secretariat/page.tsx");
const DISPONIBILITA = read("src/app/appuntamenti/page.tsx");

/* ============================ W6-53: la configurazione ha una schermata === */

test("la pagina della disponibilita chiama tutte e quattro le rotte degli slot", () => {
  for (const funzione of [
    "listAppointmentSlots",
    "createAppointmentSlot",
    "updateAppointmentSlot",
    "deleteAppointmentSlot",
  ]) {
    assert.ok(
      CLIENT.includes(`export const ${funzione} =`),
      `il trasporto deve esporre ${funzione}`,
    );
    assert.ok(
      DISPONIBILITA.includes(funzione),
      `la schermata deve usare ${funzione}: una rotta senza consumatori e una funzione che non esiste`,
    );
  }
});

test("la schermata offre tutti i campi che il dominio accetta", () => {
  for (const campo of [
    "siteId",
    "assignedToUserId",
    "weekday",
    "specificDate",
    "startTime",
    "endTime",
    "durationMinutes",
    "validFrom",
    "validUntil",
    "active",
    "notes",
  ]) {
    assert.ok(
      DISPONIBILITA.includes(campo),
      `${campo} e nel contratto di AppointmentSlotInput: se non si puo dichiarare, e come se non ci fosse`,
    );
  }
});

test("il gate della schermata e lo stesso del dominio", () => {
  /*
    `assertPuoConfigurareLaDisponibilita` chiede `isManagementAccessRole`: un
    allenatore lavora i propri appuntamenti ma non configura l'agenda del club.
    Una schermata con un gate piu largo si aprirebbe e risponderebbe 403 su
    ogni gesto — la «superficie finta» che il piano della Wave 6 elenca fra i
    difetti peggiori di un'assenza.
  */
  assert.ok(DISPONIBILITA.includes("isManagementAccessRole"));
});

test("alla pagina si arriva da qualche parte", () => {
  assert.ok(
    SEGRETERIA.includes('href="/appuntamenti"'),
    "senza un ingresso sarebbe di nuovo codice raggiungibile solo da chi ne conosce l'indirizzo",
  );
});

test("la capienza non e piu dichiarabile da nessuna parte", () => {
  const ROTTA = read("src/app/api/v1/appointment-slots/route.ts");
  const ROTTA_ID = read("src/app/api/v1/appointment-slots/[id]/route.ts");

  for (const [nome, sorgente] of [
    ["il trasporto", CLIENT],
    ["la schermata", DISPONIBILITA],
    ["la rotta di elenco", ROTTA],
    ["la rotta di riga", ROTTA_ID],
  ]) {
    /*
      Si cerca la **scrittura** del campo — `capacity:` o `capacity =` — e non
      la parola: nominarla in un commento che spiega perche non c'e piu e
      esattamente cio che si vuole conservare.
    */
    assert.equal(
      /capacity\s*[:=]/.test(sorgente),
      false,
      `${nome} non deve piu scrivere la capienza (W6-56)`,
    );
  }
});

/* ==================== W6-52: la segreteria puo spostare e chiudere ======== */

test("la segreteria importa lo spostamento e la chiusura", () => {
  assert.ok(SEGRETERIA.includes("rescheduleClubAppointment"));
  assert.ok(SEGRETERIA.includes("closeClubAppointment"));
  assert.ok(
    CLIENT.includes("export const closeClubAppointment ="),
    "la rotta accettava complete e no-show da sempre: mancava la funzione",
  );
});

test("i comandi si disegnano sulle azioni del dominio, non su nomi scritti a mano", () => {
  /*
    W6-51 in eredita dalla lane 6A: `transitions` porta gli **stati** di
    arrivo, `actions` i nomi che la rotta accetta. Confondere i due elenchi e
    cio che ha tenuto la segreteria senza un pulsante Conferma per tutta la
    Wave 5, e i comandi nuovi devono nascere dalla parte giusta.
  */
  for (const azione of ["reschedule", "complete", "no-show"]) {
    assert.ok(
      SEGRETERIA.includes(`.includes("${azione}")`),
      `il comando ${azione} deve comparire solo quando il dominio lo ammette`,
    );
  }
});

test("lo spostamento ricarica invece di aggiornare la riga che si aveva davanti", () => {
  /*
    ADR-0101: riprogrammare **chiude una riga e ne crea un'altra**. Una
    schermata che aggiornasse in luogo mostrerebbe una riga chiusa al posto di
    quella nuova, e la nuova non comparirebbe affatto.
  */
  const inizio = SEGRETERIA.indexOf("const riprogrammaAppuntamento");
  const fine = SEGRETERIA.indexOf("const chiudiAppuntamento");
  assert.ok(inizio > 0 && fine > inizio);

  const corpo = SEGRETERIA.slice(inizio, fine);
  assert.ok(corpo.includes("listClubAppointments"));
  assert.ok(corpo.includes("version: appuntamento.version"));
});
