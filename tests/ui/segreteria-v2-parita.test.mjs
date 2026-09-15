import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  APPOINTMENT_STATUS_SPEC,
  NOTE_TARGET_OPTIONS,
  OPENING_DAYS,
  SECRETARIAT_AREAS,
  appointmentPersonName,
  appointmentStatusSpec,
  buildAppointmentSlots,
  buildSecretariatPeople,
  buildTimeRange,
  deskSlotsForDate,
  emptyOpeningHours,
  isNoteExpired,
  isSecretariatArea,
  noteExpiryFromInput,
  noteExpiryInputValue,
  noteNeedsRecipient,
  noteNotificationSummary,
  normalizeNote,
  normalizeOpeningHours,
  parseTimeRange,
  reminderTargetOptions,
  startOfWeekMonday,
  weekDaysOf,
} from "@/components/secretariat/v2/secretariat-model";
import { APPOINTMENT_STATUSES } from "@/lib/appointments/model";

/**
 * Parita della Segreteria V2 con l'audit V1
 * (`docs/redesign/audit/wave-e-segreteria.md`).
 *
 * Il redesign cambia forma, non capacita: ogni etichetta, azione, campo ed
 * endpoint che l'audit elenca deve restare nel sorgente V2. Un test statico
 * non prova che funzioni — lo fa il lead a schermo — ma impedisce che una
 * capacita sparisca per distrazione.
 */
const read = (relative) => readFileSync(path.join(process.cwd(), relative), "utf8");
const V2 = "src/components/secretariat/v2";
const sources = {
  page: read("src/app/secretariat/page.tsx"),
  model: read(`${V2}/secretariat-model.ts`),
  grids: read(`${V2}/secretariat-grids.tsx`),
  rail: read(`${V2}/agenda-rail.tsx`),
  inspector: read(`${V2}/appointment-inspector.tsx`),
  newAppointment: read(`${V2}/new-appointment-drawer.tsx`),
  noteDrawer: read(`${V2}/note-drawer.tsx`),
  hours: read(`${V2}/opening-hours-panel.tsx`),
  suggest: read(`${V2}/suggest-input.tsx`),
};
const everything = Object.values(sources).join("\n");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ------------------------------------------------------------ la pagina */

test("segreteria: intestazione V2, tre aree, un primario per area e l'ingresso alla disponibilita", () => {
  assert.match(sources.page, /<PageHeader/);
  assert.match(sources.page, /title="Segreteria"/);
  assert.match(sources.page, /<HeaderStat/);
  assert.match(sources.page, /<SegmentedControl<SecretariatArea>/);
  assert.deepEqual(
    SECRETARIAT_AREAS.map((a) => a.label),
    ["Appuntamenti", "Note e promemoria", "Orari di apertura"],
    "le tre schede della V1 sono le tre aree",
  );
  assert.match(sources.page, /searchParams\.get\("area"\)/, "l'area vive nell'indirizzo");
  assert.match(sources.page, /searchParams\.get\("action"\) !== "new"/, "?action=new apre il modulo dell'area");
  assert.match(sources.page, /Nuovo appuntamento/);
  assert.match(sources.page, /Nuova nota/);
  assert.match(sources.page, /href="\/appuntamenti"/, "W6-53: senza un ingresso la disponibilita torna irraggiungibile");
  assert.match(sources.page, /Configura la disponibilita/);
  assert.equal(sources.page.includes("bg-gradient-to-r"), false, "niente titoli in gradiente");
  assert.equal(everything.includes("window.confirm"), false);
  assert.equal(/\balert\(/.test(everything), false);
  assert.equal(/[!]["»]/.test(everything), false, "niente punti esclamativi nelle frasi");
});

test("segreteria: le sette letture e i sette verbi della V1 restano gli stessi", () => {
  for (const lettura of [
    'getClubData(clubId, "secretariat_notes")',
    'getClubData(clubId, "opening_hours")',
    "getClubStaff(clubId)",
    "getClubAthletes(clubId)",
    "getClubTrainers(clubId)",
    'getClubData(clubId, "members")',
    "listClubAppointments(intestazioniClub(clubId))",
  ]) {
    assert.ok(sources.page.includes(lettura), `manca la lettura ${lettura}`);
  }
  for (const verbo of [
    "createClubAppointment(",
    "confirmClubAppointment(",
    "rejectClubAppointment(",
    "rescheduleClubAppointment(",
    "cancelClubAppointment(",
    "closeClubAppointment(",
    'addClubData(activeClub.id, "secretariat_notes", note)',
    'updateClubDataArray(activeClub.id, "secretariat_notes", updatedNotes)',
    'deleteClubDataItem(activeClub.id, "secretariat_notes", note.id)',
    'updateClubDataArray(activeClub.id, "opening_hours", [openingHours])',
  ]) {
    assert.ok(sources.page.includes(verbo), `manca la scrittura ${verbo}`);
  }
  assert.equal(/fetch\(/.test(everything), false, "nessun fetch diretto: si passa dal trasporto");
  assert.equal(/from "@\/lib\/server\//.test(everything), false, "niente server nel browser");
});

test("segreteria: ogni scrittura porta il club nell'intestazione e la versione nella decisione", () => {
  assert.match(sources.model, /"x-active-club-id"/);
  const decisioni = sources.page.match(/version: appuntamento\.version \?\? null/g) || [];
  assert.ok(decisioni.length >= 4, "conferma/rifiuto, spostamento, annullo e chiusura mandano la versione (controllo ottimistico)");
  assert.match(sources.page, /outsideAvailability: true/, "il desk inserisce fuori dagli slot con il permesso di farlo");
  assert.match(sources.page, /idempotencyKey: `desk-\$\{activeClub\.id\}/, "il doppio clic non crea due appuntamenti");
  assert.match(sources.page, /internalNotes: values\.person \? `Nominativo: \$\{values\.person\}` : null/);
});

test("segreteria: lo spostamento rilegge tutto (ADR-0101) e le mosse vengono dal dominio", () => {
  const inizio = sources.page.indexOf("const riprogrammaAppuntamento");
  const fine = sources.page.indexOf("const chiudiAppuntamento");
  assert.ok(inizio > 0 && fine > inizio);
  const corpo = sources.page.slice(inizio, fine);
  assert.ok(corpo.includes("listClubAppointments"), "una riga chiusa e una nuova: non si aggiorna in luogo");
  assert.ok(corpo.includes("setInspecting(null)"), "l'ispettore lascia la riga chiusa");
  for (const azione of ["confirm", "reject", "reschedule", "complete", "no-show", "cancel"]) {
    assert.ok(sources.page.includes(`.actions || []).includes("${azione}")`), `l'azione di riga ${azione} compare solo quando il dominio la ammette`);
    assert.ok(sources.inspector.includes(`can(appointment, "${azione}")`), `l'ispettore disegna ${azione} sulle azioni del dominio`);
  }
  assert.equal(/transitions \|\| \[\]\)\.includes/.test(everything), false, "W6-51: `transitions` porta stati, non azioni");
  assert.equal(senzaCommenti(everything).includes("AZIONE_PER_ARRIVO"), false, "la traduzione stato -> azione vive nel dominio");
});

test("segreteria: rifiuto e annullo chiedono conferma, il rifiuto vuole il motivo, l'eliminazione di una nota e distruttiva", () => {
  assert.match(sources.page, /useConfirm\(\)/);
  assert.match(sources.page, /Rifiutare la richiesta di/);
  assert.match(sources.page, /confirmLabel: "Rifiuta"/);
  assert.match(sources.page, /confirmLabel: "Annulla l'appuntamento"/);
  assert.match(sources.page, /Eliminare questa nota\?/);
  assert.match(sources.page, /irreversible: true/);
  assert.match(sources.inspector, /Il motivo del rifiuto e obbligatorio/, "il server lo pretende: si dice prima");
  assert.match(sources.inspector, /Su «Concluso» e «Assente» la nota resta interna/, "chi scrive deve sapere chi legge");
  assert.match(sources.inspector, /Conferma lo spostamento/);
  assert.match(sources.inspector, /Indica il nuovo giorno e il nuovo orario/);
  assert.match(sources.inspector, /href="\/appuntamenti"/, "lo spostamento rimanda alla disponibilita");
  assert.match(sources.inspector, /<Drawer/, "l'ispettore e un cassetto, non un modale");
  assert.equal(sources.inspector.includes("<Modal"), false);
});

test("segreteria: i messaggi della V1 restano parola per parola", () => {
  for (const messaggio of [
    "Appuntamento aggiunto con successo",
    "Errore nel salvare l'appuntamento",
    "Appuntamento annullato: la famiglia lo vedra",
    "Errore nell'annullare l'appuntamento",
    "Appuntamento confermato: la famiglia riceve la notifica",
    "Richiesta rifiutata: alla famiglia arriva il motivo",
    "Non riesco a rispondere adesso",
    "Appuntamento spostato: la famiglia riceve il nuovo orario",
    "Non riesco a spostarlo adesso",
    "Appuntamento concluso",
    "Assenza registrata: resta una nota interna",
    "Non riesco a chiuderlo adesso",
    "Nota aggiunta con successo",
    "Errore nel salvare la nota",
    "Nota aggiornata con successo",
    "Errore nell'aggiornare la nota",
    "Nota eliminata con successo",
    "Errore nell'eliminare la nota",
    "Orari di apertura salvati con successo",
    "Errore nel salvare gli orari di apertura",
    "Errore nel caricamento dei dati della segreteria",
    "Nessun club attivo trovato. Ricarica la pagina.",
  ]) {
    assert.ok(sources.page.includes(messaggio), `manca il messaggio «${messaggio}»`);
  }
  for (const testo of ["Inserisci il contenuto della nota", "Seleziona il destinatario del promemoria", "Scrivi una nota o un promemoria...", "Ricevi notifica alla scadenza"]) {
    assert.ok(sources.noteDrawer.includes(testo), `manca «${testo}» nel cassetto della nota`);
  }
  for (const testo of ["Titolo appuntamento", "Seleziona orario", "Cerca atleta, genitore, tutore, staff o allenatore", "La ricerca include atleti, tutori, genitori, staff e allenatori registrati nel club.", "Dettagli appuntamento", "Seleziona prima una data per vedere gli orari disponibili", "Nessun orario di apertura configurato per"]) {
    assert.ok(sources.newAppointment.includes(testo), `manca «${testo}» nel cassetto del nuovo appuntamento`);
  }
  for (const testo of ["Nessun appuntamento per questa data", "Nessuna nota presente"]) {
    assert.ok(sources.page.includes(testo), `manca lo stato vuoto «${testo}»`);
  }
});

/* ------------------------------------------------------------ la coda */

test("appuntamenti: griglia unica con viste, filtri, ricerca, ispettore e rail della settimana", () => {
  assert.match(sources.page, /module="segreteria-appuntamenti"/);
  assert.match(sources.page, /<AgendaRail/);
  for (const column of ['id: "identity"', 'id: "date"', 'id: "time"', 'id: "status"', 'id: "person"', 'id: "notes"', 'id: "decision"']) {
    assert.ok(sources.grids.includes(column), `manca la colonna ${column}`);
  }
  assert.match(sources.grids, /id: "requested", label: "In attesa"/);
  assert.match(sources.grids, /id: "confirmed", label: "Confermati"/);
  assert.match(sources.grids, /id: "closed", label: "Chiusi"/);
  assert.match(sources.grids, /id: "status",\s*label: "Stato",\s*type: "select",\s*pinned: true/);
  assert.match(sources.rail, /Settimana precedente/);
  assert.match(sources.rail, /Settimana successiva/);
  assert.match(sources.rail, /Vai a oggi/);
  assert.match(sources.rail, /label: "Giorno"/);
  assert.match(sources.rail, /label: "Settimana"/);
  assert.match(sources.rail, /label: "Tutti"/);
  assert.equal(sources.rail.includes('showToast("info"'), false, "niente toast a ogni cambio settimana");
  assert.match(sources.page, /onOpenRow=\{openInspector\}/);
  assert.match(sources.page, /canSelect=\{false\}/, "la V1 non aveva selezione ne azioni di massa");
});

test("appuntamenti: gli otto stati hanno una parola nella forma del sistema", () => {
  for (const status of APPOINTMENT_STATUSES) {
    const spec = APPOINTMENT_STATUS_SPEC[status];
    assert.ok(spec, `manca lo stato ${status}`);
    assert.match(spec.label, /^[A-ZÀ-Ü ]+$/, `l'etichetta di ${status} e maiuscola`);
    assert.ok(["quiet", "outline", "solid", "urgent"].includes(spec.weight));
  }
  assert.equal(appointmentStatusSpec("requested").label, "IN ATTESA");
  assert.equal(appointmentStatusSpec("confirmed").label, "CONFERMATO");
  assert.equal(appointmentStatusSpec("no_show").label, "ASSENTE");
  assert.equal(appointmentStatusSpec("cancelled_by_club").label, "ANNULLATO DALLA SEGRETERIA");
  assert.equal(appointmentStatusSpec("boh").label, "BOZZA", "uno stato sconosciuto ha comunque una parola");
  assert.match(sources.grids, /<StatusPill status=\{appointmentStatusSpec\(row\.status\)\} title=\{row\.status_label\}/);
});

test("appuntamenti: il nominativo del desk torna leggibile", () => {
  assert.equal(appointmentPersonName({ internal_notes: "Nominativo: Maria Rossi" }), "Maria Rossi");
  assert.equal(appointmentPersonName({ internal_notes: "" }), "");
  assert.match(sources.inspector, /label="Nominativo"/);
  assert.match(sources.inspector, /label="Note interne"/);
  assert.match(sources.inspector, /label="Nota della decisione"/);
});

test("nuovo appuntamento: gli slot di trenta minuti degli orari di apertura, come la V1", () => {
  assert.deepEqual(buildAppointmentSlots("09:00-10:30"), ["09:00", "09:30", "10:00"]);
  assert.deepEqual(buildAppointmentSlots(""), []);
  assert.deepEqual(parseTimeRange("09:00-12:00"), { start: "09:00", end: "12:00" });
  assert.equal(buildTimeRange("09:00", ""), "09:00-");
  assert.equal(buildTimeRange("", ""), "");
  const hours = emptyOpeningHours();
  hours.monday.morning = "09:00-10:00";
  hours.monday.afternoon = "15:00-15:30";
  // il 14 settembre 2026 e un lunedi
  assert.deepEqual(deskSlotsForDate(hours, "2026-09-14"), { morning: ["09:00", "09:30"], afternoon: ["15:00"], dayLabel: "lunedì" });
  assert.deepEqual(deskSlotsForDate(hours, "2026-09-15").morning, []);
  assert.match(sources.newAppointment, /description: "Mattina"/);
  assert.match(sources.newAppointment, /description: "Pomeriggio"/);
  assert.match(sources.newAppointment, /min=\{todayLocalDateOnly\(\)\}/);
  assert.match(sources.newAppointment, /<SuggestInput/, "il nominativo resta testo libero con i suggerimenti");
  assert.equal(senzaCommenti(sources.newAppointment).includes("Atleta collegato"), false, "GAP dichiarato: il campo raccoglieva un nome che nessuna scrittura inviava");
});

/* ------------------------------------------------------------ le note */

test("note: griglia, cassetto con i sette campi e il record nella forma che la bacheca legge", () => {
  assert.match(sources.page, /module="segreteria-note"/);
  for (const column of ['id: "identity"', 'id: "target"', 'id: "expiry"', 'id: "notification"', 'id: "created"']) {
    assert.ok(sources.grids.includes(column), `manca la colonna ${column}`);
  }
  assert.match(sources.page, /const note = \{\s*id: `note-\$\{Date\.now\(\)\}`,\s*content:/, "PP-03: la bacheca dell'allenatore legge `content`");
  assert.match(sources.page, /notificationTime = values\.isAllDay \? "08:00" : values\.notificationTime/);
  assert.deepEqual(
    NOTE_TARGET_OPTIONS.map((o) => o.value),
    ["club_dashboard", "all_trainers", "trainer", "staff_member", "member"],
  );
  assert.deepEqual(NOTE_TARGET_OPTIONS.map((o) => o.label), ["Interno dashboard club", "Tutti gli allenatori", "Allenatore specifico", "Membro staff specifico", "Socio specifico"]);
  assert.equal(noteNeedsRecipient("trainer"), true);
  assert.equal(noteNeedsRecipient("club_dashboard"), false);
  assert.match(sources.noteDrawer, /Intera giornata \(08:00\)/);
  assert.match(sources.noteDrawer, /Orario specifico/);
  assert.match(sources.noteDrawer, /La notifica arriva 30 minuti prima/);
  assert.match(sources.noteDrawer, /<Toggle/);
  assert.match(sources.noteDrawer, /<SearchableSelect/, "il destinatario si cerca: oltre otto persone");
  assert.match(sources.noteDrawer, /dirty=\{dirty && !busy\}/, "guardia sulle modifiche non salvate");
  assert.match(sources.grids, /getReminderTargetSummary/, "il riassunto del destinatario e quello condiviso con la bacheca");
});

test("note: la scadenza si legge e si scrive come la V1 (mezzanotte UTC, giorno civile)", () => {
  const expiry = noteExpiryFromInput("2026-09-20");
  assert.equal(noteExpiryInputValue(expiry), "2026-09-20");
  assert.equal(noteExpiryInputValue(undefined), "");
  const note = normalizeNote({ id: 1, content: "x", date: "2026-09-01T10:00:00.000Z", expiryDate: "2026-09-02T00:00:00.000Z", trainerId: "t1", trainerName: "Mister", target_type: "trainer" });
  assert.equal(note.id, "1");
  assert.equal(note.targetType, "trainer");
  assert.equal(note.targetId, "t1");
  assert.equal(note.targetLabel, "Mister");
  assert.equal(note.isAllDay, true);
  assert.equal(isNoteExpired(note, "2026-09-03"), true);
  assert.equal(isNoteExpired(note, "2026-09-02"), false);
  assert.equal(noteNotificationSummary({ ...note, notificationEnabled: true }), "Notifica alle 08:00");
  assert.equal(noteNotificationSummary({ ...note, notificationEnabled: true, isAllDay: false, notificationTime: "17:30" }), "Notifica 30 min prima delle 17:30");
  assert.equal(noteNotificationSummary(note), null);
});

/* ------------------------------------------------------------ gli orari */

test("orari di apertura: sette giorni, mattina e pomeriggio, staff per nome, un salvataggio", () => {
  assert.deepEqual(
    OPENING_DAYS.map((d) => d.key),
    ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
  );
  assert.match(sources.hours, /eyebrow="Mattina"/);
  assert.match(sources.hours, /eyebrow="Pomeriggio"/);
  assert.match(sources.hours, /Salva orari/);
  assert.match(sources.hours, /Modifiche non salvate/);
  assert.match(sources.hours, /Seleziona staff/);
  assert.match(sources.hours, /Nessun membro dello staff trovato/);
  assert.match(sources.hours, /value: person\.label, label: person\.label/, "lo staff si salva per nome, come la V1");
  const hours = normalizeOpeningHours({ monday: { morning: "09:00-12:00" } });
  assert.equal(hours.monday.morning, "09:00-12:00");
  assert.equal(hours.monday.afternoonStaff, "");
  assert.equal(hours.sunday.morning, "");
  assert.equal(sources.hours.includes("grid-cols-3 "), false, "niente tre colonne senza breakpoint a 375 px");
});

/* ------------------------------------------------------------ le persone */

test("persone: nominativi e destinatari con le stesse normalizzazioni della V1", () => {
  const people = buildSecretariatPeople({
    staff: [{ id: "s1", name: "Anna Bianchi" }],
    athletes: [{ id: "a1", first_name: "Luca", last_name: "Verdi", data: { guardians: [{ id: "g1", name: "Paola", surname: "Verdi" }] } }, { id: "a2", first_name: "" }],
    trainers: [{ id: "t1", name: "Mister Rossi" }, { id: "t2", firstName: "anna", lastName: "bianchi" }],
    members: [{ id: "m1", fullName: "Socio Uno" }],
  });
  assert.deepEqual(people.athletes, [{ id: "a1", label: "Luca Verdi" }]);
  assert.deepEqual(people.members, [{ id: "m1", label: "Socio Uno" }]);
  assert.equal(people.trainers.length, 2);
  assert.deepEqual(
    people.nominativi.map((p) => p.id),
    ["athlete-a1", "guardian-a1-g1", "staff-s1", "trainer-t1"],
    "atleti, tutori, staff, allenatori; i doppioni per etichetta cadono (anna bianchi = Anna Bianchi)",
  );
  assert.equal(people.nominativi[1].athleteLabel, "Luca Verdi");
  assert.deepEqual(reminderTargetOptions(people, "staff_member"), [{ id: "s1", label: "Anna Bianchi" }]);
  assert.deepEqual(reminderTargetOptions(people, "all_trainers"), []);
});

/* ------------------------------------------------------------ le settimane */

test("settimana: lun → dom, la domenica resta nella sua settimana", () => {
  const sunday = new Date(2026, 8, 20); // domenica 20 settembre 2026
  assert.equal(startOfWeekMonday(sunday).getDate(), 14);
  const days = weekDaysOf(sunday);
  assert.equal(days.length, 7);
  assert.equal(days[0].getDay(), 1);
  assert.equal(days[6].getDay(), 0);
  assert.equal(isSecretariatArea("note"), true);
  assert.equal(isSecretariatArea("boh"), false);
});

/* ------------------------------------------------------------ responsive */

test("segreteria: usabile a 375, 768 e 1280 px", () => {
  for (const [name, source] of Object.entries(sources)) {
    const offending = source.split(/\r?\n/).filter((line) => /(?<![a-z:])grid-cols-[23]\b/.test(line));
    assert.deepEqual(offending, [], `${name}: griglia a due o tre colonne senza breakpoint`);
  }
  assert.match(sources.page, /lg:grid-cols-\[minmax\(0,1fr\)_300px\]/, "griglia + rail solo dai 1024 px");
  assert.match(sources.rail, /overflow-x-auto/, "i sette giorni scorrono in riga sotto i 1024 px");
  assert.match(sources.page, /max-w-full overflow-x-auto/, "le aree scorrono a 375 px");
});
