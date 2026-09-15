import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

/**
 * La parita funzionale di `/reports` nel Web V2.
 *
 * L'audit della Wave C (`docs/redesign/audit/wave-c-administration.md`, §B)
 * elenca cio che la V1 mostrava, filtrava, esportava e negava. Un test
 * statico non dice se la pagina e bella: dice se, migrandola alle primitive
 * del sistema, qualcosa e **sparito** — un'etichetta, un vuoto, un permesso,
 * un endpoint — e lo dice prima di aprire un browser.
 */

const read = (relative) =>
  fs.readFileSync(path.join(process.cwd(), relative), "utf8");

/** Il file senza i commenti: e il **codice** che deve portare le parole. */
const readCode = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");

const PAGINA = "src/app/reports/page.tsx";
const RIEPILOGO = "src/app/reports/management-summary.tsx";
const BOTTONE = "src/app/reports/accounting-export-button.tsx";
const PANNELLI = "src/components/reports/v2/activity-report-panels.tsx";
const GRIGLIA_GRUPPI = "src/components/reports/v2/management-group-grid.tsx";
const CONTESTO = "src/components/reports/v2/report-context-controls.tsx";
const TESSERA = "src/components/reports/v2/report-stat-tile.tsx";

const tutto = () =>
  [PAGINA, RIEPILOGO, BOTTONE, PANNELLI, GRIGLIA_GRUPPI, CONTESTO, TESSERA]
    .map(readCode)
    .join("\n");

const contiene = (sorgente, testo, motivo) =>
  assert.ok(sorgente.includes(testo), motivo || `manca «${testo}»`);

/* ------------------------------------------------------------ B.1 dati */

test("la pagina e il pattern 4: intestazione, controlli di contesto, riga KPI, pannelli", () => {
  const pagina = readCode(PAGINA);
  assert.match(pagina, /<PageHeader[\s\S]{0,400}title="Report"/);
  assert.match(pagina, /<CategoryContextControl/);
  assert.match(pagina, /<PeriodContextControl/);
  assert.match(pagina, /<KpiBar/);
  assert.match(pagina, /<CategoryAthleteGrid/);
  assert.match(pagina, /<AttendancePanel/);
  assert.match(pagina, /<MatchPanel/);
  assert.match(pagina, /<PaymentPanel/);
  assert.match(pagina, /<ManagementSummary/);
  /* Un report non ha un'azione primaria di pagina. */
  assert.doesNotMatch(pagina, /variant="primary"/);
  /* Nessun elenco disegnato a mano: ogni tabella e il DataGrid. */
  assert.doesNotMatch(tutto(), /<table/);
});

test("i quattro KPI in testa portano le etichette e le descrizioni della V1", () => {
  const pagina = readCode(PAGINA);
  for (const testo of [
    "Atleti nel filtro",
    "Tutte le categorie reali del club",
    'label="Allenamenti"',
    "Allenamenti nel filtro",
    'label="Gare"',
    "Gare nel filtro",
    "Pagato atleti",
    "Denaro incassato, annullati esclusi",
  ]) {
    contiene(pagina, testo);
  }
});

test("il report categoria per atleta e un DataGrid con le sette colonne della V1, in ordine", () => {
  const pannelli = readCode(PANNELLI);
  assert.match(pannelli, /module="report-categorie"/);
  assert.match(pannelli, /hideViews/);
  const intestazioni = [
    "Atleta",
    "Categoria",
    "Convocazioni / gare",
    "Presenze / allenamenti",
    "Senza risposta",
    "% convocazione",
    "% presenza",
  ];
  let cursore = 0;
  for (const intestazione of intestazioni) {
    const posizione = pannelli.indexOf(`header: "${intestazione}"`, cursore);
    assert.ok(posizione >= 0, `manca la colonna «${intestazione}»`);
    cursore = posizione;
  }
  /* «Senza risposta» resta «—» quando nessuna richiesta e stata fatta. */
  assert.match(pannelli, /row\.rsvpRequested \? ratio\(row\.noResponse, row\.rsvpRequested\) : MISSING/);
  /* Cognome Nome, come la V1. */
  assert.match(pannelli, /formatAthleteLastFirst/);
  /* L'export CSV della griglia passa dal proprietario del tracciato. */
  assert.match(pannelli, /from "@\/lib\/csv"/);
  assert.match(pannelli, /export=\{\{ onExport: handleExport, kinds: \["csv"\] \}\}/);
});

test("i tre report di attivita mostrano i numeri e i vuoti della V1", () => {
  const pannelli = readCode(PANNELLI);
  for (const testo of [
    "Report categoria per atleta",
    "Nessun dato categoria",
    "Il report si popola quando esistono categorie salvate nel club e atleti associati.",
    "Report presenze",
    "Presenze registrate",
    "Presenze mancanti",
    "assenze registrate",
    "Nessuna presenza reale da mostrare",
    "Quando verranno salvati allenamenti e presenze, questa sezione mostrerà totali e percentuali reali.",
    "Report gare e convocazioni",
    'label="Convocazioni"',
    "atleti convocati",
    "Gare senza convocazioni",
    "gare compilate",
    "Nessuna gara reale nel filtro",
    "Le convocazioni appariranno qui quando saranno salvate gare associate alle categorie.",
    "Report pagamenti atleti",
    "Totale dovuto",
    "Pagamenti atleti non annullati",
    'label="Pagato"',
    "rate saldate",
    "in parte",
    'label="In attesa"',
    'label="Scaduto"',
    "Residuo su",
    "Nessun pagamento atleta reale",
    "Questa sezione rimane vuota finché non esistono pagamenti salvati nel database.",
  ]) {
    contiene(pannelli, testo);
  }
  /* Gli stati vuoti sono la card del sistema, dentro il pannello. */
  assert.ok((pannelli.match(/<EmptyStateCard\s+flat/g) || []).length >= 3);

  contiene(readCode(PAGINA), "Nessuna categoria salvata");
  contiene(
    readCode(PAGINA),
    "Il filtro categorie mostrerà le categorie reali appena saranno presenti in Club.categories o nelle associazioni atleta-categoria.",
  );
});

/* ------------------------------------------------- B.2–B.4 filtri e azioni */

test("i controlli di contesto hanno le stesse opzioni e gli stessi valori della V1", () => {
  const contesto = readCode(CONTESTO);
  assert.match(contesto, /ALL_CATEGORIES_VALUE = "all"/);
  contiene(contesto, "Tutte le categorie");
  assert.match(contesto, /\{ value: "all", label: "Intero periodo" \}/);
  assert.match(contesto, /\{ value: "last30", label: "Ultimo mese" \}/);
  assert.match(contesto, /\{ value: "last90", label: "Ultimi 3 mesi" \}/);
  assert.match(contesto, /<ContextControl/);

  const pagina = readCode(PAGINA);
  /* `?categoryId=` preseleziona la categoria; `?clubId=` sceglie il club. */
  assert.match(pagina, /params\.get\("categoryId"\)/);
  assert.match(pagina, /params\.get\("clubId"\)/);
  /* `?report=categories` da Atleti porta al report categoria. */
  assert.match(pagina, /params\.get\("report"\)/);
  assert.match(pagina, /requestedReport !== "categories"/);
  /* Una categoria sparita si azzera in silenzio. */
  assert.match(pagina, /setSelectedCategoryId\(ALL_CATEGORIES_VALUE\)/);
});

test("il riepilogo gestionale ha i dieci filtri della V1 con i loro segnaposto", () => {
  const riepilogo = readCode(RIEPILOGO);
  for (const [etichetta, segnaposto] of [
    ['label="Dal"', null],
    ['label="Al"', null],
    ['label="Anno fiscale"', 'placeholder="Tutti gli anni"'],
    ['label="Stagione sportiva"', 'placeholder="Tutte le stagioni"'],
    ['label="Conto"', 'placeholder="Tutti i conti"'],
    ['label="Causale"', 'placeholder="Tutte le causali"'],
    ['label="Sede"', 'placeholder="Tutte le sedi"'],
    ['label="Verso"', 'placeholder="Entrate e uscite"'],
    ['label="Classificazione"', 'placeholder="Tutte"'],
    ['label="Confronta con l\'anno"', 'placeholder="Nessun confronto"'],
  ]) {
    contiene(riepilogo, etichetta);
    if (segnaposto) contiene(riepilogo, segnaposto);
  }
  contiene(riepilogo, "Solo entrate");
  contiene(riepilogo, "Solo uscite");
  /* La sede compare solo nel club multi-sede (ADR-0038). */
  assert.match(riepilogo, /\{multiSede \? \([\s\S]{0,200}label="Sede"/);
  assert.match(riepilogo, /isMultiSiteClub\(sites\)/);
  /* I campi sono quelli del sistema. */
  assert.match(riepilogo, /<DateInput/);
  assert.match(riepilogo, /<FieldSizeProvider size="sm">/);
  assert.match(riepilogo, /from "@\/components\/web\/forms\/Field"/);
  /* Azzera i filtri riporta tutto a vuoto. */
  assert.match(riepilogo, /onClick=\{\(\) => setFiltri\(FILTRI_VUOTI\)\}[\s\S]{0,80}Azzera i filtri/);
});

test("un filtro non scelto non viaggia: la query omette i valori vuoti", () => {
  const riepilogo = readCode(RIEPILOGO);
  for (const chiave of [
    "from",
    "to",
    "fiscal_year",
    "season_id",
    "financial_account_id",
    "operation_type_code",
    "site_id",
    "direction",
    "activity_scope",
    "compare_fiscal_year",
  ]) {
    assert.match(
      riepilogo,
      new RegExp(`if \\(filtri\\.\\w+\\)[\\s\\S]{0,40}query\\.set\\("${chiave}"`),
      `«${chiave}» va scritto solo se scelto`,
    );
  }
  assert.doesNotMatch(riepilogo, /localStorage|sessionStorage/, "i filtri del riepilogo non persistono");
});

/* ---------------------------------------------------------- B.6 export */

test("l'export resta dentro il riepilogo, con la stessa query meno il confronto", () => {
  const riepilogo = readCode(RIEPILOGO);
  assert.match(
    riepilogo,
    /<AccountingExportButton[\s\S]{0,200}costruisciQuery\(\{ \.\.\.filtri, compareFiscalYear: "" \}, clubId\)/,
  );
  const bottone = readCode(BOTTONE);
  contiene(bottone, "Esporta in CSV");
  contiene(bottone, "Preparazione del file...");
  contiene(bottone, "Export non riuscito");
  contiene(bottone, '"prima-nota.csv"');
  assert.match(bottone, /\/api\/v1\/accounting\/export/);
  assert.match(bottone, /from "@\/components\/web\/primitives\/Button"/);
});

/* --------------------------------------------------------- B.7 permessi */

test("gli stessi predicati della V1: accounting.read, accounting.export, saldi null", () => {
  const riepilogo = readCode(RIEPILOGO);
  assert.match(riepilogo, /canOpenAccounting\(role\)/);
  assert.match(riepilogo, /if \(!puoLeggere\)[\s\S]{0,40}return null/);
  const bottone = readCode(BOTTONE);
  assert.match(bottone, /hasAccountingPermission\(\s*role,\s*"accounting\.export"\s*\)/);
  /* Saldi negati: «Non visibile», mai uno zero. */
  contiene(riepilogo, '"Non visibile"');
  contiene(
    riepilogo,
    "I saldi dei conti richiedono un permesso che il ruolo attivo non ha. Nessun numero al posto del diniego.",
  );
  assert.match(riepilogo, /saldoTotale === null \? "Non visibile"/);
});

/* ------------------------------------------------------- B.1 riepilogo */

test("il riepilogo gestionale porta titolo, disclaimer e le sezioni della V1", () => {
  const riepilogo = readCode(RIEPILOGO);
  assert.match(riepilogo, /\{MANAGEMENT_REPORT_TITLE\}/);
  /* Il disclaimer sta sopra i numeri e in fondo: due volte, dalla costante. */
  assert.ok((riepilogo.match(/\{MANAGEMENT_REPORT_DISCLAIMER\}/g) || []).length >= 2);
  assert.match(riepilogo, /<InfoCard>\{MANAGEMENT_REPORT_DISCLAIMER\}<\/InfoCard>/);
  assert.match(riepilogo, /<InfoCard eyebrow="Promemoria">\{MANAGEMENT_REPORT_DISCLAIMER\}<\/InfoCard>/);

  for (const testo of [
    "Grandezze finanziarie",
    "Cassa e banca",
    'kpi("accountBalances")',
    'kpi("collected")',
    'kpi("paid")',
    "Giroconti nel periodo",
    "Denaro spostato fra conti della societa",
    "Grandezze economiche",
    "Crediti e debiti",
    "Non si sommano ai numeri di cassa e non dipendono dal periodo",
    'kpi("familyReceivables")',
    "Versato in piu dalle famiglie",
    "Denaro che il club tiene per conto delle famiglie",
    'kpi("overdueReceivables")',
    "rate scadute e non saldate. Sono un sottoinsieme dei crediti, non una voce che vi si aggiunge.",
    'kpi("fundingPending")',
    'kpi("sportWorkAccruedUnpaid")',
    "Istituzionale e commerciale",
    "La classificazione arriva dalla causale ed e congelata sul movimento.",
    "non hanno una",
    "del denaro",
    "Tutti i movimenti del filtro hanno una classificazione.",
    "Confronto con l&apos;anno",
    "Cassa contro cassa. Crediti e debiti non entrano in questo confronto",
    '["Incassato", report.comparison.collected]',
    '["Pagato", report.comparison.paid]',
    '["Saldo dei movimenti", report.comparison.net]',
    "nel periodo di confronto",
    "(nessuna base di confronto)",
    "movimenti considerati",
    "esclusi perche stornati",
    "Ricalcolo del riepilogo...",
    "Riepilogo non disponibile",
    "Questi totali non coprono tutto il periodo.",
    "Il confronto non copre tutto il periodo precedente.",
  ]) {
    contiene(riepilogo, testo);
  }

  /* Cassa a piano 1 in una barra KPI; crediti e debiti nel contenitore tratteggiato. */
  assert.match(riepilogo, /<KpiBar[\s\S]{0,300}kpi\("accountBalances"\)/);
  assert.match(riepilogo, /<SummaryCard dashed rows=\{righeEconomiche\}/);
  assert.doesNotMatch(
    riepilogo,
    /<KpiBar[\s\S]{0,2000}kpi\("familyReceivables"\)[\s\S]{0,2000}<\/KpiBar>/,
    "un credito non sta nella barra della cassa",
  );
  /* Il proprietario di ogni numero resta scritto accanto al numero. */
  assert.match(riepilogo, /definition\.owner/);
  /* Gli avvisi ambra sono i blocchi del sistema. */
  assert.match(riepilogo, /<AlertBlock[\s\S]{0,60}severity="warning"[\s\S]{0,120}title="Questi totali non coprono tutto il periodo\."/);
  assert.match(riepilogo, /<AlertBlock[\s\S]{0,60}severity="warning"[\s\S]{0,120}title="Il confronto non copre tutto il periodo precedente\."/);
  assert.match(riepilogo, /<AlertBlock[\s\S]{0,60}severity="success"/);
  /* Gli endpoint sono gli stessi. */
  assert.match(riepilogo, /\/api\/v1\/accounting\/accounts\?organization_id=/);
  assert.match(riepilogo, /\/api\/v1\/fiscal\/operation-types\?organization_id=/);
  assert.match(riepilogo, /\/api\/v1\/accounting\/reports\?\$\{costruisciQuery\(filtri, clubId\)\}/);
  assert.doesNotMatch(riepilogo, /\bfetch\(/);
});

test("le cinque tabelle di raggruppamento sono DataGrid compatti con le colonne della V1", () => {
  const riepilogo = readCode(RIEPILOGO);
  for (const [modulo, titolo, intestazione] of [
    ["riepilogo-causale", "Per causale", "Causale"],
    ["riepilogo-voce", "Per voce di rendiconto", "Voce"],
    ["riepilogo-conto", "Per conto — movimento del periodo", "Conto"],
    ["riepilogo-mese", "Per mese", "Mese"],
    ["riepilogo-origine", "Per origine", "Origine"],
  ]) {
    assert.match(
      riepilogo,
      new RegExp(`module="${modulo}"[\\s\\S]{0,80}title="${titolo.replace(/[—()]/g, (m) => `\\${m}`)}"[\\s\\S]{0,400}labelHeader="${intestazione}"`),
      `manca la tabella «${titolo}»`,
    );
  }
  assert.match(riepilogo, /formatLabel=\{meseDelGruppo\}/, "«Per mese» stampa i nomi dei mesi");
  contiene(riepilogo, '"Senza data"');

  const griglia = readCode(GRIGLIA_GRUPPI);
  assert.match(griglia, /<DataGrid<ReportGroup>/);
  assert.match(griglia, /hideViews/);
  assert.match(griglia, /hideFooter=\{groups\.length <= 25\}/);
  for (const intestazione of ["Entrate", "Uscite", "Saldo", "Righe"]) {
    contiene(griglia, `header: "${intestazione}"`);
  }
  assert.ok((griglia.match(/kind: "amount"/g) || []).length === 3, "tre importi tabellari a destra");
  contiene(griglia, "Nessun movimento nel filtro selezionato.");
  /* I centesimi si convertono solo alla stampa. */
  assert.match(griglia, /formatMoney\(\(Number\(cents\) \|\| 0\) \/ 100\)/);
});

/* ----------------------------------------------------- vincoli di sistema */

test("nessuna etichetta della pagina promette un documento", () => {
  const testo = tutto().toLowerCase();
  for (const parola of ["ufficiale", "conforme", "a norma", "per il deposito"]) {
    assert.ok(!testo.includes(parola), `la pagina rivendica «${parola}»`);
  }
});

test("la V1 e stata rimossa: nessuna card, badge o select del vecchio sistema", () => {
  const sorgente = tutto();
  for (const vecchio of [
    '@/components/ui/card"',
    '@/components/ui/badge"',
    '@/components/ui/select"',
    '@/components/ui/input"',
    '@/components/ui/button"',
    "AppLoadingScreen",
    "SharedPageHeader",
    "function MetricCard",
    "function EmptyState(",
    "function CategoryAthleteTable",
    "function GroupTable",
  ]) {
    assert.ok(!sorgente.includes(vecchio), `resta un residuo V1: ${vecchio}`);
  }
  assert.doesNotMatch(sorgente, /text-slate-|bg-slate-|border-slate-|bg-amber-50|bg-emerald-50/);
  assert.doesNotMatch(sorgente, /window\.confirm|!\s*<\/|[\u{1F300}-\u{1FAFF}]/u);
});

test("nessuna griglia a due colonne fisse e nessun fetch diretto", () => {
  const sorgente = tutto();
  assert.doesNotMatch(sorgente, /(?<![a-z:])grid-cols-[234]\b/);
  assert.doesNotMatch(sorgente, /\bfetch\(/);
  assert.match(readCode(PAGINA), /from "@\/lib\/simplified-db"/);
  assert.match(readCode(RIEPILOGO), /from "@\/lib\/api\/client"/);
});
