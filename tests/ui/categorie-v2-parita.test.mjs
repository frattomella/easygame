import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * **Categorie — parita fra la V1 e il Web V2.**
 *
 * L'audit (`docs/redesign/audit/wave-b-sport-operations.md` §4) elenca cio
 * che la pagina V1 faceva. Questa prova statica cerca ognuna di quelle
 * capacita nel sorgente V2: etichette, azioni, endpoint, meccaniche. Non
 * sostituisce l'apertura della pagina; impedisce che una capacita sparisca
 * senza che nessuno se ne accorga.
 */
const SRC = path.join(process.cwd(), "src");
const read = (relative) => readFileSync(path.join(SRC, ...relative.split("/")), "utf8");

const page = read("app/categories/page.tsx");
const drawer = read("components/categories/v2/category-editor-drawer.tsx");
const inspector = read("components/categories/v2/category-inspector-drawer.tsx");
const columns = read("components/categories/v2/category-grid-columns.tsx");
const model = read("components/categories/v2/category-grid-model.ts");

test("la pagina e un elenco operativo del Web V2: intestazione, contesto di sede, griglia", () => {
  assert.match(page, /<PageHeader/);
  assert.match(page, /title="Categorie"/);
  assert.match(page, /Organizza le categorie e i gruppi sportivi del club\./);
  assert.match(page, /<HeaderStat[\s\S]{0,80}label="categorie"/);
  assert.match(page, /label="atleti assegnati"/);
  assert.match(page, /<SiteContextControl/, "la sede e un controllo di contesto, non un filtro della griglia");
  assert.match(page, /id="categories-site-filter"/);
  assert.match(page, /<DataGrid<CategoryRow>/);
  assert.match(page, /module=\{CATEGORY_GRID_MODULE\}/);
  assert.match(model, /CATEGORY_GRID_MODULE = "categorie"/);
  assert.match(page, /Nuova categoria/, "un solo primario di pagina");
  assert.doesNotMatch(page, /window\.confirm/);
  assert.doesNotMatch(page, /bg-gradient-to-r/);
});

test("il contesto di sede tiene la regola della V1: i gruppi impliciti restano visibili", () => {
  assert.match(page, /\(group\) => !group\.siteId \|\| group\.siteId === siteFilter/);
  assert.match(page, /isMultiSiteClub\(sites\)/);
});

test("le colonne portano cio che la card V1 mostrava", () => {
  for (const header of ["Categoria", "Anni di nascita", "Sedi", "Atleti", "Allenatori", "Allenamenti a settimana", "Ordine"]) {
    assert.match(columns, new RegExp(`header: "${header}"`), `manca la colonna ${header}`);
  }
  assert.match(columns, /CategoryColorDot/, "il punto nel colore della categoria");
  assert.match(columns, /row\.birthYearsLabel/);
  assert.match(columns, /row\.trainingsPerWeek/);
  assert.match(columns, /id: "compatibili"[\s\S]{0,120}hidden: true/, "le compatibili fra le colonne nascoste");
  assert.match(columns, /if \(multiSite\)/, "la colonna Sedi solo per il club multi-sede");
});

test("ricerca, viste e filtri: nome o sport come la V1, piu le viste che servono ogni giorno", () => {
  assert.match(model, /row\.name\.toLowerCase\(\)\.includes\(q\) \|\| row\.sport\.toLowerCase\(\)\.includes\(q\)/);
  assert.match(page, /placeholder: "Cerca categorie"/);
  for (const view of ["con-atleti", "senza-atleti", "senza-allenatore"]) {
    assert.match(model, new RegExp(`id: "${view}"`));
  }
  for (const filter of ["anno", "atleti", "copertura", "allenatore"]) {
    assert.match(model, new RegExp(`id: "${filter}"`));
  }
});

test("l'ordine e quello del club (D-INT-9): frecce, solo a elenco non filtrato, stesso PATCH", () => {
  assert.match(page, /defaultSort=\{\{ columnId: "ordine", direction: "asc" \}\}/);
  assert.match(page, /readCategorySortOrder/);
  assert.match(page, /const spostaCategoria = async \(categoryId: string, verso: -1 \| 1\)/);
  assert.match(page, /`\/api\/v1\/categories\/\$\{String\(\(voce as any\)\.id\)\}`/);
  assert.match(page, /body: \{ sortOrder: indice \}/);
  assert.match(page, /const canReorder = !gridQuery && !gridFiltered && !siteFilter;/);
  assert.match(page, /label: "Sposta in su"/);
  assert.match(page, /label: "Sposta in giù"/);
  assert.match(page, /Non e stato possibile salvare l'ordine/);
});

test("le azioni di riga: apri, modifica, sedi, atleti, report, elimina", () => {
  for (const label of ["Apri", "Modifica", "Cambia sedi", "Assegna sedi", "Vedi atleti", "Report", "Elimina"]) {
    assert.match(page, new RegExp(`label: "${label}"`), `manca l'azione ${label}`);
  }
  assert.match(page, /hidden: \(row\) => !multiSite \|\| row\.siteNames\.length === 0/, "«Cambia sedi» solo multi-sede e solo con sedi");
  assert.match(page, /\/athletes\?category=/);
  assert.match(page, /\/reports\?report=categories&categoryId=/);
  assert.match(page, /id: "elimina",\s*label: "Elimina",\s*tone: "danger"/);
});

test("l'ispettore sostituisce la modale «Info» con le stesse informazioni", () => {
  assert.match(page, /<CategoryInspectorDrawer/);
  assert.match(inspector, /width="narrow"/);
  for (const label of ["Sport", "Anni di nascita", "Atleti iscritti", "Allenatori", "Allenamenti settimanali", "Categorie compatibili"]) {
    assert.match(inspector, new RegExp(`label="${label}"`), `manca la riga ${label}`);
  }
  assert.match(inspector, /allenamento settimanale/);
  assert.match(inspector, /allenamenti settimanali/);
  assert.match(inspector, /collegata agli atleti nati in questo intervallo/);
  assert.match(inspector, /utilizza le sezioni dedicate del sistema/);
  assert.match(inspector, /Vedi atleti/);
  assert.match(inspector, /Gruppi archiviati/, "i gruppi archiviati restano leggibili");
});

test("il cassetto crea/modifica porta tutti i campi della V1, a sezioni, nel 720", () => {
  assert.match(page, /<CategoryEditorDrawer/);
  assert.match(drawer, /width="wide"/);
  assert.match(drawer, /Nuova categoria/);
  assert.match(drawer, /Modifica categoria/);
  assert.match(drawer, /Inserisci i dettagli della nuova categoria/);
  assert.match(drawer, /Modifica i dettagli della categoria/);
  for (const eyebrow of ["Identità", "Sedi e gruppi operativi", "Categorie compatibili", "Allenatori"]) {
    assert.match(drawer, new RegExp(`eyebrow="${eyebrow}"`), `manca la sezione ${eyebrow}`);
  }
  assert.match(drawer, /label="Nome categoria"/);
  assert.match(drawer, /placeholder="Es\. Under 14"/);
  assert.match(drawer, /label="Descrizione"/);
  assert.match(drawer, /placeholder="Es\. Calcio a 5"/);
  assert.match(drawer, /CATEGORY_DESCRIPTION_MAX_LENGTH = 25/);
  assert.match(drawer, /maxLength=\{CATEGORY_DESCRIPTION_MAX_LENGTH\}/);
  assert.match(drawer, /label="Anno di nascita dal"/);
  assert.match(drawer, /label="Anno di nascita al"/);
  assert.match(drawer, /placeholder="Solo l'anno iniziale"/);
  assert.match(drawer, /Array\.from\(\{ length: 80 \}/, "gli ultimi 80 anni");
  assert.match(drawer, /<SearchableSelect/, "sopra otto opzioni il select e con ricerca");
  assert.match(drawer, /collegati automaticamente a questa\s+categoria in base al loro anno di nascita/);
  assert.match(drawer, /label="Colore"/);
  for (const colour of ["Blu", "Verde", "Rosso", "Giallo", "Viola", "Rosa", "Indaco", "Arancione"]) {
    assert.match(drawer, new RegExp(`label: "${colour}"`), `manca il colore ${colour}`);
  }
  assert.match(drawer, /const showSites = availableSites\.length >= 2;/);
  assert.match(drawer, /Nessuna sede indicata: la categoria resta una squadra sola/);
  assert.match(drawer, /Nessun&apos;altra categoria configurata nel club\./);
  assert.match(drawer, /Un allenatore può essere assegnato a più categorie\./);
  assert.match(drawer, /Nessun allenatore disponibile nel club\./);
  assert.match(drawer, /\{isEditing \? "Aggiorna" : "Salva"\}/);
  assert.match(drawer, /Annulla/);
  assert.match(drawer, /dirty=\{dirty\}/, "la guardia sulle modifiche non salvate");
  assert.match(drawer, /<FieldSizeProvider size="sm">/);
});

test("la validazione del cassetto e quella della V1, in un riepilogo invece che in un toast", () => {
  assert.match(drawer, /<ValidationSummary errors=\{errors\} \/>/);
  assert.match(drawer, /Il nome categoria è obbligatorio/);
  assert.match(drawer, /Inserisci un anno di nascita valido/);
  assert.match(drawer, /L'anno di nascita finale non è valido/);
  assert.match(drawer, /L'anno di nascita iniziale non può essere maggiore di quello finale/);
  assert.match(drawer, /La descrizione categoria deve essere al massimo \$\{CATEGORY_DESCRIPTION_MAX_LENGTH\} caratteri/);
  assert.match(page, /Nome categoria e anno di nascita iniziale sono obbligatori/, "la pagina rivalida come prima");
});

test("il cambio di sede: impatto live, riallineamento esplicito, gruppi archiviati non cancellati", () => {
  assert.match(drawer, /rilevaDisallineamentiDiSede\(\{/);
  assert.match(drawer, /contaAtletiDisallineati\(disallineamenti\)/);
  assert.match(drawer, /data-testid="impatto-cambio-sede"/);
  assert.match(drawer, /resta assegnato a una sede che questa categoria non servirà più/);
  assert.match(drawer, /id="riallineamento-sede"/);
  assert.match(drawer, /Lascia come sono/);
  assert.match(drawer, /Sposta su \$\{sede\?\.name \|\| siteId\}/);
  assert.match(drawer, /Togli la sede \(restano nella categoria, senza sede\)/);
  assert.match(drawer, /"__senza_sede__"/);
  assert.match(drawer, /riallineamento:\s*\n?\s*atletiDisallineati > 0 && sedeDiRiallineamento/);
  assert.match(page, /buildCategoryGroupsForSites\(\{/);
  assert.match(page, /`\/api\/v1\/athlete_category_memberships\/\$\{String\(membership\.id\)\}`/);
  assert.match(page, /body: \{ site_id: riallineamento\.siteId \}/);
  assert.match(page, /updateClubData\(activeClub\.id, "category_groups", next\)/);
  assert.match(page, /Gruppi operativi aggiornati/);
  assert.match(page, /Salvataggio dei gruppi operativi fallito/);
  assert.match(page, /assegnazione riallineata/);
  assert.match(page, /le altre vanno sistemate dalla scheda dell'atleta/);
});

test("il salvataggio e l'eliminazione passano dagli stessi scrittori della V1", () => {
  assert.match(page, /supabase\.from\("categories"\)\.upsert\(payload\)/);
  assert.match(page, /supabase\s*\.from\("clubs"\)\s*\.update\(\{\s*trainers: updatedTrainers,/);
  assert.match(page, /supabase\s*\.from\("categories"\)\s*\.delete\(\)\s*\.eq\("id", categoryToDelete\.id\)\s*\.eq\("club_id", activeClub\.id\)/);
  assert.match(page, /updateClubAthlete\(clubId, athleteId, payload\)/);
  assert.match(page, /const detachAthletesFromCategory = async/);
  assert.match(page, /Categoria non eliminata: non è stato possibile aggiornare gli atleti collegati\./);
  assert.match(page, /atleti spostati in Senza categoria\./);
  assert.match(page, /modificata con successo/);
  assert.match(page, /aggiunta con successo/);
  assert.match(page, /Errore durante il caricamento delle categorie/);
  for (const msg of [
    "Problema di connessione al database",
    "Server sovraccarico",
    "Errore di connessione. Verifica la tua connessione internet e riprova.",
    "Risorse insufficienti. Riprova tra qualche secondo.",
    "Errore imprevisto durante il salvataggio",
  ]) {
    assert.match(page, new RegExp(msg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `manca il messaggio: ${msg}`);
  }
});

test("eliminare e distruttivo: cosa se ne va, nome scritto se ci sono atleti, niente ripulitura promessa", () => {
  assert.match(page, /<DangerConfirmDialog/);
  assert.match(page, /Eliminare \$\{categoryToDelete\?\.name/);
  assert.match(page, /gli atleti verranno spostati in Senza categoria/);
  assert.match(page, /Puoi eliminarla senza spostare tesserati/);
  assert.match(page, /confirmLabel="Elimina categoria"/);
  assert.match(page, /typedConfirmation=\{\s*categoryToDeleteAthletes\.length > 0 \? categoryToDelete\?\.name/);
  assert.match(
    page,
    /Gli allenatori, i gruppi operativi e gli slot del programma settimanale che la citano non vengono ripuliti\./,
    "il comportamento V1 resta e la conferma lo dice",
  );
});

test("gli stati: club assente, modulo vuoto, caricamento a scheletro, vuoto per sede", () => {
  assert.match(page, /Club non selezionato/);
  assert.match(page, /Seleziona un club per visualizzare e gestire le categorie/);
  assert.match(page, /Vai alla Dashboard/);
  assert.match(page, /Nessuna categoria presente/);
  assert.match(page, /Inizia creando la prima categoria per il tuo club/);
  assert.match(page, /Crea la prima categoria/);
  assert.match(page, /state=\{ready \? "ready" : "loading"\}/);
  assert.match(page, /Nessuna categoria in questa sede/);
  assert.doesNotMatch(page, /animate-spin/, "niente spinner a pagina intera");
  assert.doesNotMatch(page, /window\.location\.href/, "si naviga con il router");
});

test("nessuna azione di massa e nessuna esportazione: la V1 non le aveva", () => {
  assert.doesNotMatch(page, /bulkActions=/);
  assert.doesNotMatch(page, /export=\{\{/);
  assert.match(page, /canSelect=\{false\}/);
});

test("il codice morto della V1 e sparito, non tradotto", () => {
  assert.doesNotMatch(page, /\{false \? \(/, "il menu Filtri dietro un ramo morto");
  assert.doesNotMatch(page, /Per Numero Atleti/);
  assert.doesNotMatch(page, /showAthletesDialog/);
  assert.equal(existsSync(path.join(SRC, "components", "dialogs", "CategoryAthletesDialog.tsx")), false);
  assert.equal(existsSync(path.join(SRC, "components", "forms", "CategoryEditorDialog.tsx")), false);
  assert.equal(existsSync(path.join(SRC, "components", "categories", "CategoryDetailsDialog.tsx")), false);
  for (const file of ["app/categories/page.tsx", "components/categories/v2/category-editor-drawer.tsx", "components/categories/v2/category-inspector-drawer.tsx", "components/categories/v2/category-grid-columns.tsx"]) {
    const source = read(file);
    assert.doesNotMatch(source, /from "@\/components\/ui\/(card|dialog|dropdown-menu|badge|modal|input|label|button)"/, `${file} non usa piu la libreria V1`);
    assert.doesNotMatch(source, /@\/lib\/server/, `${file} non importa il server`);
  }
});
