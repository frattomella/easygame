import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * **Parità della migrazione Web V2 di `/matches` e `/calendar`** (Wave D,
 * `docs/redesign/audit/wave-d-gare-calendario.md`).
 *
 * Prove statiche sulla sorgente, come le altre di `tests/ui/`: ogni capacità
 * dell'audit — etichette, azioni, endpoint, predicati — deve vivere da
 * qualche parte nella V2. Non prova l'aspetto: prova che **niente sia
 * sparito** e che ciò che scrive passi ancora dagli stessi scrittori.
 */
const SRC = path.join(process.cwd(), "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8").replace(/\r\n/g, "\n");

/** La sorgente senza i commenti: le parole di un commento non sono un cablaggio. */
const senzaCommenti = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PAGE = "app/matches/page.tsx";
const MODEL = "components/matches/v2/match-page-model.ts";
const DAY = "components/matches/v2/DayMatches.tsx";
const GRID = "components/matches/v2/match-grid.tsx";
const RAIL = "components/matches/v2/MatchWeekRail.tsx";
const CONVOCATIONS = "components/matches/v2/ConvocationsDrawer.tsx";
const FORM = "components/matches/v2/MatchFormDrawer.tsx";
const MULTI = "components/matches/v2/MultipleMatchesDrawer.tsx";
const CALENDAR = "app/calendar/page.tsx";
const CALENDAR_MODEL = "components/calendar/v2/calendar-model.ts";
const MONTH = "components/calendar/v2/MonthGrid.tsx";

const V2_FILES = [PAGE, MODEL, DAY, GRID, RAIL, CONVOCATIONS, FORM, MULTI, CALENDAR, CALENDAR_MODEL, MONTH];

test("le superfici V2 esistono e la V1 specifica della pagina non c'è più", () => {
  for (const file of V2_FILES) {
    assert.ok(existsSync(path.join(SRC, file)), `${file} manca`);
  }
  for (const orfano of [
    "components/forms/AddMatchForm.tsx",
    "components/forms/MultipleAddMatchForm.tsx",
    "components/matches/MatchConvocationsList.tsx",
  ]) {
    assert.equal(existsSync(path.join(SRC, orfano)), false, `${orfano}: V1 e V2 non convivono`);
  }
  /* I componenti condivisi con l'area allenatore restano al loro posto. */
  assert.ok(existsSync(path.join(SRC, "components/trainer/MatchConvocations.tsx")));
  assert.ok(existsSync(path.join(SRC, "components/matches/MatchCertificateWarningBadge.tsx")));
});

test("/matches: la lettura è quella della V1 (proiezione + conteggio canonico), gli scrittori sono quelli del dominio eventi", () => {
  const page = read(PAGE);
  assert.match(page, /getClubData\(activeClub\.id, "matches"\)/, "le gare si leggono dalla proiezione storica");
  assert.match(page, /listEvents\(\{ kind: "match", include_cancelled: "1" \}\)/, "il conteggio dei convocati arriva dalla rotta canonica (P0-6)");
  assert.match(page, /convocated_count/);
  for (const writer of ["createEvent(", "updateEvent(", "cancelEvent(", "restoreEvent(", "deleteEventIfEmpty(", "saveEventConvocations(", "listEventParticipants("]) {
    assert.ok(page.includes(writer), `${writer} è lo scrittore/lettore del dominio`);
  }
  assert.doesNotMatch(page, /updateClubData/, "nessuna scrittura della proiezione in sola lettura (ADR-0098)");
  assert.doesNotMatch(senzaCommenti(page), /window\.confirm|\bconfirm\(|\balert\(/, "niente finestre di sistema");
  assert.match(page, /from "@\/lib\/api\/client"/, "le risposte RSVP passano da apiRequest, non da un fetch diretto");
  assert.doesNotMatch(page, /\bfetch\(/);
});

test("/matches: le capacità dell'audit §1.2 hanno un posto", () => {
  const page = read(PAGE);
  const day = read(DAY);
  const grid = read(GRID);

  /* Le azioni per gara, con gli stessi predicati (stato derivato «in programma»). */
  for (const label of ["Convocazioni", "Apri convocazioni", "Modifica", "Duplica", "Annulla gara", "Ripristina", "Elimina"]) {
    assert.ok(day.includes(label) || grid.includes(label) || read(MODEL).includes(label), `azione «${label}» assente`);
  }
  assert.match(day, /canManageMatch|convocationVerb\(match\)/);
  assert.match(grid, /hidden: \(row\) => !canManageMatch\(row\)/, "Convocazioni e Annulla solo in programma, come la V1");

  /* Testata: contesto categoria e sede, viste, azioni, `?action=new`, `?date=`. */
  assert.match(page, /CategoryContextControl/);
  assert.match(page, /SiteContextControl/);
  assert.match(page, /label: "Vista giorno"/);
  assert.match(page, /label: "Vista elenco"/);
  assert.match(page, /Nuova gara/);
  assert.match(page, /Aggiungi più gare/);
  assert.match(page, /action === "new"/);
  assert.match(page, /searchParams\?\.get\("date"\)/);

  /* Il rail della settimana e il calendario del mese. */
  const rail = read(RAIL);
  assert.match(rail, /Settimana precedente/);
  assert.match(rail, /Settimana successiva/);
  assert.match(rail, /Vai a oggi/);
  assert.match(rail, /monthGridOf/);

  /*
    La scadenza convocazioni si imposta in Impostazioni → Gare e convocazioni
    (redesign): la pagina Gare la legge con la stessa autorita e rimanda li.
  */
  assert.match(page, /getMatchConvocationDeadlineDays\(clubSettings\)/);
  assert.match(page, /router\.push\("\/settings\?tab=gare"\)/);
  assert.doesNotMatch(page, /saveClubSettings/, "la pagina Gare non scrive piu la regola del club");
  const settings = readFileSync(path.join(process.cwd(), "src/app/settings/page.tsx"), "utf8");
  assert.match(settings, /saveClubSettings\(clubId, matchSettingsPayload\(preferences\.matches\)\)/);
  assert.match(settings, /Impostazioni convocazioni salvate/);
  assert.match(page, /Rosa convocabile per categoria/);
  assert.match(page, /ROSTER_COLUMNS/);
  assert.match(grid, /Solo attivi/);
  assert.match(grid, /Solo sospesi/);
  assert.match(grid, /Solo in prestito/);
});

test("/matches: la griglia ha viste, filtri e colonne dell'audit", () => {
  const grid = read(GRID);
  for (const view of ["Prossime", "Senza convocazioni", "Concluse", "Annullate"]) {
    assert.ok(grid.includes(`label: "${view}"`), `vista «${view}» assente`);
  }
  for (const filter of ['id: "categoria"', 'id: "sede"', 'id: "sede-gara"', 'id: "stato"', 'id: "convocazioni"', 'id: "periodo"']) {
    assert.ok(grid.includes(filter), `filtro ${filter} assente`);
  }
  for (const column of ['header: "Data"', 'header: "Ora"', 'header: "Avversario"', 'header: "Categoria"', 'header: "Sede · campo"', 'header: "Convocazioni"', 'header: "Certificati"', 'header: "Stato"']) {
    assert.ok(grid.includes(column), `colonna ${column} assente`);
  }
  assert.match(grid, /MatchCertificateWarningBadge/, "l'avviso sui certificati resta il componente condiviso");
  assert.match(grid, /StatusPill status=\{matchStatusSpec/);
  assert.doesNotMatch(grid, /export:/, "nessuna esportazione: la V1 non la aveva");
});

test("/matches: lo stato è una parola del sistema, mai una riga colorata", () => {
  const model = read(MODEL);
  assert.match(model, /ACTIVITY_STATUS\.cancelled/);
  assert.match(model, /ACTIVITY_STATUS\.completed/);
  assert.match(model, /ACTIVITY_STATUS\.scheduled/);
  assert.match(model, /CALLUP_STATUS\.called/);
  assert.match(model, /CALLUP_STATUS\.not_called/);
  assert.match(model, /CALLUP_STATUS\.no_answer/);
  for (const file of [PAGE, DAY, GRID, RAIL, CONVOCATIONS, FORM, MULTI, CALENDAR, MONTH]) {
    const source = read(file);
    assert.doesNotMatch(source, /#[0-9a-fA-F]{6}\b/, `${file}: nessun esadecimale nuovo`);
    /* Il payload storico porta ancora `categoryColor` come dato (la V1 lo scriveva): qui si guarda solo ciò che si disegna. */
    assert.doesNotMatch(source, /className=[^\n]*bg-(blue|green|red|amber|gray|slate)-\d{2,3}\b/, `${file}: solo i colori egw-*`);
    assert.doesNotMatch(source, /from "@\/components\/ui\/(card|badge|tabs|dialog|select|dropdown-menu|switch|checkbox|input|calendar)"/, `${file}: niente chrome V1`);
    assert.doesNotMatch(source, /from ["']@\/lib\/server\//, `${file}: nessun import del server (CLAUDE.md §8)`);
  }
});

test("il cassetto delle convocazioni conserva il contratto e le capacità di MatchConvocations", () => {
  const drawer = read(CONVOCATIONS);
  assert.match(drawer, /aria-label=\{`Convoca: \$\{athlete\.name\}`\}/, "la casella ha il nome dell'atleta (P0-6)");
  assert.match(drawer, /Convoca tutti/);
  assert.match(drawer, /Aggiungi atleta extra/);
  assert.match(drawer, /Cerca atleta del club/);
  assert.match(drawer, /Nessun atleta disponibile con questo filtro\./);
  assert.match(drawer, /getMedicalCertificateAvailabilityLabel/, "l'avviso sul certificato resta");
  assert.match(drawer, /Attenzione: \$\{getMedicalCertificateAvailabilityLabel/, "il toast alla spunta di chi non è in regola resta");
  assert.match(drawer, /Categoria primaria:/);
  assert.match(drawer, /convocatedAthletes, convocationEntries \}\)/, "stesso onSave di MatchConvocations");
  assert.match(drawer, /medicalCertificateAvailability: availability/);
  assert.match(drawer, /\/api\/v1\/rsvp\?training_id=/, "le risposte delle famiglie dalla rotta RSVP");
  assert.match(drawer, /Risposte delle famiglie/);
  assert.match(drawer, /rsvpAnswerSpec/, "«senza risposta» è una pillola del sistema");
  assert.match(drawer, /dirty=\{dirty\}/, "guardia sulle modifiche non salvate");
  assert.match(drawer, /width="default"/, "il cassetto da 480");
});

test("il modulo della gara tiene ogni campo di AddMatchForm, con la fine esplicita e le conferme del sistema", () => {
  const form = read(FORM);
  for (const label of ['label="Titolo"', 'label="Data"', 'label="Ora inizio"', 'label="Ora fine"', 'label="Avversario"', 'label="Sede gara"', 'label="Struttura"', 'label="Campo"', 'label="Campo / luogo trasferta"', 'label="Numero di gara"', 'label="Note"']) {
    assert.ok(form.includes(label), `campo ${label} assente`);
  }
  assert.match(form, /TrainingGroupSelector/, "i gruppi con il selettore condiviso (ADR-0055)");
  assert.match(form, /EventRsvpFields/, "l'RSVP con il componente condiviso (W5-05)");
  assert.match(form, /Associato/);
  assert.match(form, /Consigliata \(stessa sede\)/);
  assert.match(form, /In casa/);
  assert.match(form, /Trasferta/);
  assert.match(form, /width="wide"/, "il cassetto da 720 (9–20 campi)");
  assert.match(form, /ValidationSummary/, "la validazione è in linea, non un alert");
  assert.doesNotMatch(form, /\balert\(/);
  assert.match(form, /Seleziona struttura e campo per la gara in casa/);
  assert.match(form, /Nessuna categoria registrata/);
  assert.match(form, /formatLocalDateOnly/);
  assert.match(form, /if \(esito === false\) return;/, "un false esplicito lascia il cassetto aperto e compilato");

  const page = read(PAGE);
  assert.match(page, /La struttura appartiene a un'altra sede/);
  assert.match(page, /Conferma comunque/);
  assert.match(page, /Conflitto di programmazione/);
  assert.match(page, /useConfirm\(\)/, "le conferme a promessa del sistema");
  assert.match(page, /Sei sicuro di voler annullare questa gara\?/);
  assert.match(page, /Sei sicuro di voler eliminare questa gara\?/);
  assert.match(page, /DangerConfirmDialog/);
  assert.match(page, /rsvpRequired: matchData\.rsvpRequired \?\? false/, "l'RSVP viaggia in creazione e in modifica");
});

test("più gare in una volta: la forma V2 di MultipleAddMatchForm", () => {
  const multi = read(MULTI);
  assert.match(multi, /Aggiungi più gare/);
  assert.match(multi, /Note \(comuni a tutte le gare\)/);
  assert.match(multi, /Aggiungi partita/);
  assert.match(multi, /Compila tutti i campi obbligatori per la partita/);
  assert.match(multi, /suggerisciIntervalloGara/, "anche qui la fine è sempre esplicita");
  const page = read(PAGE);
  assert.match(page, /MultipleMatchesDrawer/);
  assert.match(page, /if \(await handleAddMatch\(matchData\)\) salvate \+= 1;/, "ogni riga passa dallo stesso handleAddMatch (cross-site, conflitti, una riga per categoria)");
});

test("/calendar: stessa lettura, stessi filtri, un mese in più e il collegamento al giorno", () => {
  const page = read(CALENDAR);
  const model = read(CALENDAR_MODEL);
  assert.match(page, /listEvents\(\{/);
  assert.match(page, /include_cancelled: "1"/);
  assert.match(page, /kind: tipo/);
  for (const label of ['label="Tipo"', 'label="Sede"', 'label="Categoria"', 'label="Gruppo"', 'label="Dal"', 'label="Al"']) {
    assert.ok(page.includes(label), `filtro ${label} assente`);
  }
  for (const option of ['label: "Tutto"', 'label: "Allenamenti"', 'label: "Gare"', 'label: "Tutte le sedi"']) {
    assert.ok(page.includes(option), `opzione ${option} assente`);
  }
  assert.match(page, /todayLocalDateOnly\(\)/);
  assert.match(page, /MonthGrid/);
  assert.match(page, /label: "Mese"/);
  assert.match(page, /label: "Elenco"/);
  assert.match(page, /leggiDataRichiesta\(searchParams\?\.get\("date"\)/, "`?date=` apre il mese e il giorno");
  assert.match(page, /Conferma richiesta/);
  assert.match(page, /Capienza \{evento\.capacity\}/);
  assert.match(page, /Nessun evento nell'intervallo scelto con questi filtri\./);
  assert.match(page, /Vai agli allenamenti/);
  assert.match(page, /Vai alle gare/);
  assert.match(model, /\/matches\?date=|\$\{base\}\?date=\$\{giorno\}/, "«Apri» porta alla pagina del tipo, sul giorno");
  assert.match(model, /PERSON_STATUS\.archived/, "«Archiviato» resta una parola");
  assert.match(read(MONTH), /stripe|bg-egw-match/, "la gara porta il filo arancio del modulo");
  assert.match(read(MONTH), /overflow-x-auto/, "la griglia scorre dentro il suo contenitore a 375 px");
});
