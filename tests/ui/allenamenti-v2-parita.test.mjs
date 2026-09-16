import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **Allenamenti — parita fra la V1 e il Web V2.**
 *
 * L'audit (`docs/redesign/audit/wave-b-sport-operations.md` §3) elenca cio
 * che `/training` faceva. Questa prova statica cerca ognuna di quelle
 * capacita nel sorgente V2 — etichette, azioni, endpoint, meccaniche — cosi
 * che una capacita non sparisca senza che nessuno se ne accorga. Non
 * sostituisce l'apertura della pagina.
 */
const SRC = path.join(process.cwd(), "src");
const read = (relative) => readFileSync(path.join(SRC, ...relative.split("/")), "utf8");
const senzaCommenti = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const page = read("app/training/page.tsx");
const model = read("components/training/v2/training-page-model.ts");
const rail = read("components/training/v2/WeekRail.tsx");
const day = read("components/training/v2/DaySessions.tsx");
const grid = read("components/training/v2/training-grid.tsx");
const attendance = read("components/training/v2/AttendanceDrawer.tsx");
const addForm = read("components/forms/AddTrainingForm.tsx");
const editForm = read("components/forms/EditTrainingForm.tsx");

test("la pagina e la «giornata sportiva» del Web V2: intestazione, rail, sedute, cassetti", () => {
  assert.match(page, /<PageHeader/);
  assert.match(page, /eyebrow="Attività sportiva"/);
  assert.match(page, /`Allenamenti · \$\{formatDayTitle\(selectedDate\)\}`/);
  assert.match(page, /senza presenze registrate/);
  assert.match(page, /<SiteContextControl/, "la sede e un controllo di contesto, come nella V1 era il SiteFilter");
  assert.match(page, /id="trainings-site-filter"/);
  assert.match(page, /Nuovo allenamento/, "un solo primario di pagina");
  assert.match(page, /label: "Vista giorno"/);
  assert.match(page, /label: "Vista settimana"/);
  assert.match(page, /<WeekRail/);
  assert.match(page, /<DaySessions/);
  assert.match(page, /<DataGrid<TrainingSession>/);
  assert.match(grid, /TRAINING_GRID_MODULE = "allenamenti"/);
  assert.match(page, /<AttendanceDrawer/);
  assert.match(page, /<CollapsedSection[\s\S]{0,200}title="Programma settimanale"/);
  assert.match(page, /<WeeklyTrainingSchedule/, "il programma settimanale e la sua automazione restano raggiungibili");
  assert.doesNotMatch(senzaCommenti(page), /window\.confirm/);
  assert.doesNotMatch(page, /bg-gradient-to-r|from-blue-600/);
  assert.doesNotMatch(page, /AlertDialog|SharedPageHeader|@\/components\/ui\/card|@\/components\/ui\/tabs/, "niente chrome V1 in pagina");
});

test("la navigazione della V1 vive nel rail: giorno prima/dopo, oggi, settimana lun→dom, calendario del mese", () => {
  assert.match(rail, /Settimana precedente/);
  assert.match(rail, /Settimana successiva/);
  assert.match(rail, /Vai a oggi/);
  assert.match(rail, /weekDaysOf\(selectedDate\)/);
  assert.match(rail, /countMatches\(day\)/, "la nota «n gara» del mockup");
  assert.match(rail, /monthGridOf\(anchor\)/, "il «Calendario Storico» e il calendario del mese nel popover");
  assert.match(rail, /Mese precedente/);
  assert.match(rail, /Mese successivo/);
  assert.match(model, /export const monthGridOf/);
  assert.match(model, /export const startOfWeekMonday/);
});

test("ogni seduta porta cio che la card V1 mostrava, con le parole del sistema di stato", () => {
  assert.match(day, /<TimelineRow/);
  assert.match(day, /sessionDurationMinutes\(training\)/);
  assert.match(day, /training\.category/);
  assert.match(day, /training\.location/);
  assert.match(day, /training\.trainer/);
  assert.match(day, /presenti/, "il riepilogo n/m presenti");
  assert.match(model, /ACTIVITY_STATUS\.cancelled/);
  assert.match(model, /ACTIVITY_STATUS\.in_progress/);
  assert.match(model, /ACTIVITY_STATUS\.completed/);
  assert.match(model, /ACTIVITY_STATUS\.scheduled/);
  assert.match(model, /ACTIVITY_STATUS\.recorded/, "«Presenze salvate» → REGISTRATO");
  assert.match(model, /STATUS_UNKNOWN/, "«Presenze mancanti» → NON REGISTRATO");
  assert.match(model, /readRecordedAttendance\(training\)\.recorded > 0/, "«l'appello e stato fatto?» ha un lettore solo");
  assert.match(model, /canRecordTrainingAttendance\(training/);
  assert.match(model, /getTrainingPhase\(/, "lo stato si deriva da data/ora, non solo dal salvato");
  for (const verb of ["Registra presenze", "Apri presenze", "Rivedi presenze"]) {
    assert.match(model, new RegExp(verb), `manca il verbo ${verb}`);
  }
  for (const action of ["Modifica", "Annulla allenamento", "Ripristina", "Elimina"]) {
    assert.match(day, new RegExp(action), `manca l'azione ${action} nel ···`);
  }
  assert.match(day, /Nessun allenamento programmato per questa data/);
});

test("la vista settimana e una griglia con filtri, viste e le stesse azioni di riga", () => {
  for (const id of ["categoria", "allenatore", "presenze", "stato", "sede"]) {
    assert.match(grid, new RegExp(`id: "${id}"`), `manca il filtro ${id}`);
  }
  assert.match(grid, /id: "da-registrare"/);
  assert.match(grid, /id: "annullati"/);
  for (const header of ["Data", "Ora", "Allenamento", "Categoria", "Sede · struttura", "Presenze", "Stato"]) {
    assert.match(grid, new RegExp(`header: "${header}"`), `manca la colonna ${header}`);
  }
  assert.match(grid, /return !siteId \|\| siteId === value/, "una sede non dichiarata resta visibile con qualunque filtro");
  assert.doesNotMatch(page, /export=\{/, "la V1 non aveva esportazione");
});

test("le presenze si registrano in un cassetto da 480 con la logica della V1", () => {
  assert.match(attendance, /<Drawer[\s\S]{0,200}width="default"/);
  assert.match(attendance, /Segna tutti presenti/);
  assert.match(attendance, /Salva presenze/);
  assert.match(attendance, /<TrainingRsvpSummary trainingId=\{training\.id\}/, "le risposte delle famiglie sopra l'appello");
  assert.match(attendance, /Aggiungi atleta extra/);
  assert.match(attendance, /Cerca tra tutti gli atleti del club ed evita duplicati nella lista presenze\./);
  assert.match(attendance, /Categoria primaria: \$\{athlete\.primaryCategoryName\}/);
  assert.match(attendance, /getMedicalCertificateAvailabilityLabel/);
  assert.match(attendance, /Note per questo atleta/);
  /* La casella a tre stati e una sola, condivisa con le persone in prova (`MarkControl.tsx`). */
  const casella = readFileSync(path.join(process.cwd(), "src/components/training/v2/MarkControl.tsx"), "utf8");
  assert.match(casella, /aria-label=\{`\$\{label\}: \$\{name\}`\}/, "la casella dice di chi e");
  assert.match(attendance, /import \{ MarkControl, nextMark, type Mark \} from "@\/components\/training\/v2\/MarkControl"/, "il cassetto la importa, non la riscrive");
  assert.match(casella, /"present" \| "absent" \| null/, "tre stati: da segnare → presente → assente");
  assert.match(attendance, /present: row\.mark === "present"/, "chi non e segnato si salva assente, come la V1");
  assert.match(attendance, /<ProgressBar/);
  /* La pagina: roster dai gruppi, rilettura dell'appello, scrittore canonico. */
  assert.match(page, /const trainingGroupIds = readTrainingGroupIds\(training\)/);
  assert.match(page, /listEventParticipants\(/);
  assert.match(page, /saveTrainingAttendance\(activeClub\.id, data\.trainingId, data\.attendance\)/);
  assert.match(page, /requestedFocus !== "attendance"/, "il deep link ?focus=attendance&trainingId= apre il cassetto");
  assert.match(page, /autoOpenedAttendanceId === requestedTrainingId/, "una volta sola");
  assert.match(page, /if \(action === "new"\)/, "?action=new apre il modulo di creazione");
});

test("crea/modifica: cassetti con tutti i campi, le regole e i payload della V1", () => {
  assert.match(addForm, /<Drawer[\s\S]{0,300}width="wide"/);
  for (const field of ["Titolo", "Data", "Ora inizio", "Ora fine", "Allenatori", "Struttura", "Campo della struttura"]) {
    assert.match(addForm, new RegExp(`label="${field}"`), `manca il campo ${field} in creazione`);
  }
  assert.match(addForm, /<EventRsvpFields/, "conferma alle famiglie, scadenza, capienza");
  assert.match(addForm, /<TrainingGroupSelector/);
  assert.match(addForm, /categories: categoryIdsFromGroups\(groupOptions, groupIds\)/);
  assert.match(addForm, /getAssociatedTrainerIdsForGroups\(/);
  assert.match(addForm, /Associato/);
  assert.match(addForm, /Consigliata \(stessa sede\)/);
  assert.match(addForm, /Seleziona almeno un gruppo/);
  assert.match(addForm, /Seleziona almeno un allenatore/);
  assert.match(addForm, /L'orario di fine deve essere successivo all'orario di inizio/);
  assert.match(addForm, /<ValidationSummary/, "gli errori sono in linea, non un toast");
  assert.match(addForm, /toEventRsvpPayload\(rsvp\)/);
  assert.doesNotMatch(addForm, /isAppointment/, "il ramo appuntamento era codice morto su questa rotta");

  assert.match(editForm, /<Drawer[\s\S]{0,300}width="wide"/);
  for (const field of ["Titolo", "Data", "Orario inizio", "Orario fine", "Campo", "Allenatori"]) {
    assert.match(editForm, new RegExp(`label="${field}"`), `manca il campo ${field} in modifica`);
  }
  assert.match(editForm, /<TrainingGroupSelector/);
  assert.match(editForm, /toggleId\("trainerIds"/);
  assert.match(editForm, /Questo allenamento ha già una storia/, "il banner del consolidato");
  assert.match(editForm, /readOnly=\{consolidato\}/, "giorno e ora congelati quando c'e una storia");
  assert.match(editForm, /Modifiche rilevate/);
  assert.match(editForm, /Invia notifiche delle modifiche ad atleti, genitori e allenatori/);
  assert.match(editForm, /Salva modifiche/);

  /* La pagina: sovrapposizione, sede diversa, versione, conflitto. */
  assert.match(page, /findTrainingCollisions\(/);
  assert.match(page, /Il campo risulta gia occupato/);
  assert.match(page, /Inseriscilo comunque/);
  assert.match(page, /Salva comunque/);
  assert.match(page, /isCrossSiteEvent\(/);
  assert.match(page, /La struttura appartiene a un'altra sede/);
  assert.match(page, /createEvent\("training", newTraining\)/);
  assert.match(page, /updateEvent\(\s*updatedTraining\.id,\s*updateData,\s*editingTraining\.version \?\? null,?\s*\)/);
  assert.match(page, /allowOverlap: sovrapposizioneConfermata/);
  assert.match(page, /\/modificato da qualcun altro\/i\.test\(messaggio\)/);
});

test("annulla, ripristina, elimina e pulizia: conferme proporzionate con le parole della V1", () => {
  assert.match(page, /title="Vuoi davvero annullare questo allenamento\?"/);
  assert.match(page, /title="Vuoi ripristinare questo allenamento annullato\?"/);
  assert.match(page, /cancelEvent\(training\.id, training\.version \?\? null\)/);
  assert.match(page, /restoreEvent\(training\.id, training\.version \?\? null\)/);
  assert.match(page, /<DangerConfirmDialog[\s\S]{0,400}title="Eliminare l'allenamento\?"/);
  assert.match(page, /deleteEventIfEmpty\(trainingToDelete\.id\)/);
  assert.match(page, /Allenamento eliminato con successo/);
  assert.match(page, /Categorie non rilevate nel programma allenamenti/);
  assert.match(page, /Rimuovi allenamenti in programma/);
  assert.match(page, /Pulizia in corso\.\.\./);
  assert.match(page, /Rimuovere gli allenamenti in programma\?/);
  assert.match(page, /cleanupOrphanScheduledTrainings\(/);
  assert.match(page, /keptWithHistory/);
  assert.match(page, /Nessun allenamento programmato da ripulire/);
});

test("stati: scheletro, vuoto, errore con Riprova", () => {
  assert.match(day, /<Skeleton/);
  assert.match(day, /<EmptyStateCard/);
  assert.match(page, /Alcune sezioni non sono state caricate correttamente/);
  assert.match(page, /Non è stato possibile caricare tutti i dati degli allenamenti/);
  assert.match(page, /<AlertBlock[\s\S]{0,300}Riprova/);
  assert.match(page, /state=\{loading \? "loading" : "ready"\}/);
});

test("nessuna superficie V2 importa src/lib/server (CLAUDE.md §8) e la pagina non ha griglie fisse a due colonne", () => {
  for (const [name, source] of [
    ["page", page],
    ["model", model],
    ["rail", rail],
    ["day", day],
    ["grid", grid],
    ["attendance", attendance],
    ["addForm", addForm],
    ["editForm", editForm],
  ]) {
    assert.doesNotMatch(source, /from ["']@\/lib\/server\//, `${name} importa il server`);
  }
  for (const [name, source] of [["page", page], ["day", day], ["rail", rail], ["attendance", attendance], ["addForm", addForm], ["editForm", editForm]]) {
    const offending = source
      .split(/\r?\n/)
      .filter((line) => /(?<![a-z:-])grid-cols-[23]\b/.test(line));
    assert.deepEqual(offending, [], `${name}: grid-cols-2/3 senza breakpoint`);
  }
});
