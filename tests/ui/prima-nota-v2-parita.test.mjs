import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Parita della pagina Prima nota V2 con l'audit V1
 * (`docs/redesign/audit/wave-c-administration.md`, sezioni A e D).
 *
 * Il redesign cambia forma, non capacita: ogni etichetta, azione, campo ed
 * endpoint che l'audit elenca deve restare nel sorgente V2. Un test statico
 * non prova che funzioni — lo fa il lead a schermo — ma impedisce che una
 * capacita sparisca per distrazione.
 */
const read = (relative) => readFileSync(path.join(process.cwd(), relative), "utf8");
const readCode = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");

const V2 = "src/components/accounting/v2";
const SOURCE_PATHS = {
  page: "src/app/movements/page.tsx",
  redirect: "src/app/payments/page.tsx",
  summary: "src/components/accounting/AccountingSummary.tsx",
  dialogs: "src/components/accounting/AccountingEntryDialogs.tsx",
  expected: "src/components/accounting/ExpectedEntries.tsx",
  view: "src/components/accounting/accounting-view.ts",
  grid: `${V2}/prima-nota-grid.tsx`,
  rate: `${V2}/rate-grid.tsx`,
  context: `${V2}/context-controls.tsx`,
  reminder: "src/components/payments/PaymentReminderDialog.tsx",
};
const sources = Object.fromEntries(Object.entries(SOURCE_PATHS).map(([key, file]) => [key, read(file)]));
const everything = Object.values(sources).join("\n");
/** Il codice senza i commenti: i moduli raccontano i difetti che chiudono. */
const everythingCode = Object.values(SOURCE_PATHS).map(readCode).join("\n");

/* ------------------------------------------------------------ /payments */

test("/payments resta un redirect verso /movements", () => {
  assert.match(sources.redirect, /redirect\("\/movements"\)/);
});

/* ------------------------------------------------------------ intestazione */

test("/movements: intestazione di pagina, una sola primaria, giroconto secondario, tre schede", () => {
  assert.match(sources.page, /<PageHeader/);
  assert.match(sources.page, /eyebrow="Cassa e amministrazione"/);
  assert.match(sources.page, /title="Prima nota"/);
  assert.match(sources.page, /Entrate, uscite e giroconti della societa, con la loro causale e il conto su cui il denaro si e mosso/);
  assert.match(sources.page, /<Button variant="primary" icon=\{<Plus \/>\} onClick=\{\(\) => setShowRecord\(true\)\}>\s*Registra movimento/);
  assert.match(sources.page, /<Button variant="secondary" icon=\{<ArrowLeftRight \/>\} onClick=\{\(\) => setShowTransfer\(true\)\}>\s*Giroconto/);
  assert.equal((sources.page.match(/variant="primary"/g) || []).length, 1, "un solo gradiente d'azione nella pagina");
  assert.match(sources.page, /canManage && tab === "prima-nota"/, "le due azioni compaiono solo a chi puo registrare, sulla scheda Prima nota");
  assert.match(sources.page, /<SegmentedControl<MovementsTab>/);
  for (const tab of ['{ value: "prima-nota", label: "Prima nota" }', '{ value: "rate", label: "Rate e solleciti" }', '{ value: "previsti", label: "Previsti" }']) {
    assert.ok(sources.page.includes(tab), `manca la scheda ${tab}`);
  }
  assert.match(sources.page, /searchParams\.get\("tab"\)/, "la scheda si riflette nell'URL (?tab=)");
  // controlli di contesto: anno fiscale e stagione
  assert.match(sources.page, /<FiscalYearContextControl/);
  assert.match(sources.page, /<SeasonContextControl/);
  assert.match(sources.context, /Tutti gli anni/);
  assert.match(sources.context, /Tutte le stagioni/);
  assert.match(sources.context, /fiscalYearChoices\(\)/);
});

test("/movements: il diniego di pagina e lo stesso della V1", () => {
  assert.match(sources.page, /canOpenAccounting\(activeRole\)/);
  assert.match(sources.page, /hasAccountingPermission\(activeRole, "accounting\.manage"\)/);
  assert.match(sources.page, /La prima nota non e accessibile/);
  assert.match(sources.page, /Il ruolo attivo su questo club non puo vedere la prima nota e il\s+riepilogo gestionale/);
  assert.match(sources.page, /Registro dei movimenti finanziari della societa\./);
});

/* ------------------------------------------------------------ riepilogo */

test("/movements: situazione finanziaria e situazione economica restano due blocchi separati", () => {
  assert.match(sources.summary, /Situazione finanziaria/);
  assert.match(sources.summary, /denaro davvero movimentato, per cassa/);
  assert.match(sources.summary, /<KpiBar>/);
  assert.match(sources.summary, /label="Liquidità totale"/);
  assert.match(sources.summary, /saldo derivato dai movimenti, mai digitato/);
  assert.match(sources.summary, /Nessun conto finanziario configurato/);
  assert.match(sources.summary, /Senza un conto un movimento non puo dire dove il denaro si e mosso/);
  assert.match(sources.summary, /I saldi dei conti non sono visibili/);
  assert.match(sources.summary, /Vedere i conti correnti e i loro saldi e riservato a\s+proprietario e\s+gestore/);
  for (const kpi of ["Entrate del periodo", "Uscite del periodo", "Differenza di cassa"]) {
    assert.ok(sources.summary.includes(`label="${kpi}"`), `manca il KPI ${kpi}`);
  }
  assert.match(sources.summary, /gambe di giroconto escluse: cambiano conto, non cassa\./);
  assert.match(sources.summary, /Giroconti e storni esclusi\./);
  // la parte economica e tratteggiata: mai leggibile come cassa
  assert.match(sources.summary, /<SummaryCard\s+dashed\s+eyebrow="Situazione economica"/);
  for (const row of ["Crediti verso le famiglie", "Contributi da ricevere", "Compensi da pagare"]) {
    assert.ok(sources.summary.includes(`label="${row}"`), `manca la riga ${row}`);
  }
  assert.match(sources.summary, /Fonte: il registro delle rate\./);
  assert.match(sources.summary, /Fonte: i bandi\./);
  assert.match(sources.summary, /Fonte: il lavoro sportivo\./);
  assert.match(sources.summary, /href="\/reports">Riepilogo gestionale completo/);
  assert.match(sources.summary, /href="\/sport-work\/compensations">Compensi/);
  assert.match(sources.summary, /\{report\.disclaimer\}/, "la riga che qualifica i numeri resta");
  assert.match(sources.summary, /Riepilogo non disponibile: la lettura non e riuscita\./);
  assert.match(sources.summary, /Calcolo del riepilogo\.\.\./);
  // le due note ambra condizionali
  assert.match(sources.summary, /i totali qui sopra seguono solo il\s+periodo, il conto, la\s+causale, la sede e il verso/);
  assert.match(sources.summary, /report\.truncated \?/);
  assert.match(sources.summary, /Restringi il periodo perche i totali lo coprano tutto/);
  // nessuna somma oltre ai saldi gia calcolati
  assert.equal((readCode("src/components/accounting/AccountingSummary.tsx").match(/\.reduce\(/g) || []).length, 1, "l'unica addizione e quella dei saldi consegnati dal server");
});

/* ------------------------------------------------------------ filtri e griglia */

test("/movements: i dieci filtri della V1 vivono fra griglia e controlli di contesto, e guidano il server", () => {
  for (const id of ["period", "financialAccountId", "operationTypeCode", "direction", "sourceDomain", "reconciliationStatus", "siteId"]) {
    assert.ok(sources.grid.includes(`${id}: "${id}"`), `manca il filtro ${id}`);
  }
  for (const label of ['label: "Periodo"', 'label: "Conto"', 'label: "Causale"', 'label: "Verso"', 'label: "Origine"', 'label: "Riconciliazione"', 'label: "Sede"']) {
    assert.ok(sources.grid.includes(label), `manca l'etichetta ${label}`);
  }
  for (const option of ["Solo entrate", "Solo uscite"]) {
    assert.ok(sources.grid.includes(option), `manca l'opzione ${option}`);
  }
  assert.match(sources.grid, /SOURCE_DOMAIN_LABELS\[domain\]/);
  assert.match(sources.grid, /RECONCILIATION_STATUS_LABELS\[status\]/);
  // il predicato non filtra: filtra il servizio
  assert.match(sources.grid, /const serverSide = \(\) => true;/);
  assert.equal(/apply: \(row/.test(sources.grid), false, "nessun filtro client-side su una pagina di cento righe");
  assert.match(sources.page, /onFiltersChange=\{handleGridFilters\}/);
  assert.match(sources.page, /onQueryChange=\{setSearchDraft\}/);
  assert.match(sources.page, /gridFiltersToAccounting\(state\)/);
  assert.match(sources.page, /applyFilters\(\{ search: searchDraft\.trim\(\) \}\)/);
  assert.match(sources.page, /placeholder: "Descrizione, controparte, causale, riferimento bancario"/);
  assert.match(sources.page, /buildEntriesQuery\(filters, \{ limit: PAGE_SIZE, offset \}\)/);
  assert.match(sources.page, /const PAGE_SIZE = 100;/);
  assert.match(sources.view, /put\("q", filters\.search\)/);
  assert.match(sources.view, /put\("season_id", filters\.seasonId\)/);
  // ogni cambio di filtro riporta alla prima pagina
  assert.match(sources.page, /setOffset\(0\);\s*setFilters\(merged\);/);
  // la nota ambra quando l'elenco e ristretto da filtri che il riepilogo non applica
  assert.match(sources.page, /filtersBeyondSummary=\{hasReportUnawareFilter\(filters\)\}/);
});

test("/movements: il registro porta le colonne della V1 e lo stato come pillola", () => {
  assert.match(sources.page, /module="prima-nota"/);
  for (const column of ['id: "date"', 'id: "description"', 'id: "operationType"', 'id: "account"', 'id: "amount"', 'id: "state"']) {
    assert.ok(sources.grid.includes(column), `manca la colonna ${column}`);
  }
  assert.match(sources.grid, /Da classificare/, "la causale mancante resta visibile in ambra");
  assert.match(sources.grid, /MONEY_STATUS\.reversed/, "STORNATO e una pillola del sistema");
  assert.match(sources.grid, /line-through/, "l'importo stornato resta barrato");
  assert.match(sources.grid, /reconciliationStatus !== "unreconciled"/);
  assert.match(sources.grid, /sourceLabel\(line\)/);
  // le azioni di riga vengono dal servizio
  assert.match(sources.grid, /label: "Riconcilia"/);
  assert.match(sources.grid, /label: "Storna"/);
  assert.match(sources.grid, /hidden: \(line\) => !line\.canReconcile \|\| !ownEntryId\(line\)/);
  assert.match(sources.grid, /hidden: \(line\) => !line\.canReverse \|\| !ownEntryId\(line\)/);
  assert.equal(/Elimina|Trash2|canDelete/.test(readCode(`${V2}/prima-nota-grid.tsx`)), false, "il denaro non si cancella: nessuna azione di eliminazione");
  // paginazione del server con le parole della V1 («Movimenti da», «Precedenti», «Successivi»)
  const pager = readCode("src/components/web/datagrid/ServerPager.tsx");
  assert.match(pager, /\{label\} da <strong/);
  assert.match(pager, />\s*Precedenti\s*</);
  assert.match(pager, /agree\(noun, 2, "Successiv"\)/);
  assert.match(sources.page, /<ServerPager noun=\{\{ singular: "movimento", plural: "movimenti" \}\}/);
  assert.match(sources.page, /hideFooter/, "il piede della griglia paginerebbe la pagina del server, non l'elenco");
  // stati
  assert.match(sources.page, /Nessun movimento con questi filtri\./);
  assert.match(sources.page, /La prima nota non e stata letta/);
  assert.match(sources.page, /onRetry=/);
});

/* ------------------------------------------------------------ i quattro dialoghi */

test("/movements: registra movimento e giroconto sono cassetti con ogni campo della V1", () => {
  assert.match(sources.page, /<RecordEntryDialog/);
  assert.match(sources.page, /<TransferDialog/);
  assert.match(sources.dialogs, /title="Registra un movimento"/);
  assert.match(sources.dialogs, /Un fatto di cassa che nessun altro evento ha generato/);
  for (const id of ["movimento-data", "movimento-verso", "movimento-importo", "movimento-conto", "movimento-causale", "movimento-descrizione", "movimento-controparte", "movimento-metodo", "movimento-sede", "movimento-note"]) {
    assert.ok(sources.dialogs.includes(`id="${id}"`), `manca il campo ${id}`);
  }
  for (const placeholder of ["Dove si e mosso il denaro", "Scegli una causale", "Cosa e successo", "Chi sta dall'altra parte", "Contanti, bonifico, POS"]) {
    assert.ok(sources.dialogs.includes(placeholder), `manca il segnaposto «${placeholder}»`);
  }
  assert.match(sources.dialogs, /Le causali si configurano nel profilo fiscale del club/);
  assert.match(sources.dialogs, /Salva e aggiungi un altro/, "guideline 08 §8.8");
  assert.match(sources.dialogs, /Registrazione\.\.\./);
  assert.match(sources.dialogs, /accounts\.length === 1 \? accounts\[0\]\.id : ""/, "un solo conto si preseleziona");
  assert.match(sources.page, /"Movimento registrato"/);
  assert.match(sources.page, /if \(!keepOpen\) setShowRecord\(false\)/);
  // giroconto
  assert.match(sources.dialogs, /title="Registra un giroconto"/);
  assert.match(sources.dialogs, /Denaro che cambia conto senza entrare ne uscire dal club/);
  for (const id of ["giroconto-data", "giroconto-importo", "giroconto-da", "giroconto-a", "giroconto-descrizione", "giroconto-sede", "giroconto-note"]) {
    assert.ok(sources.dialogs.includes(`id="${id}"`), `manca il campo ${id}`);
  }
  assert.match(sources.dialogs, /accounts\.filter\(\(account\) => account\.id !== fromAccountId\)/, "il conto di arrivo esclude quello di partenza");
  assert.match(sources.dialogs, /fromAccountId === toAccountId/, "un giroconto fra lo stesso conto non parte");
  assert.match(sources.dialogs, /Registra giroconto/);
  assert.match(sources.page, /\/api\/v1\/accounting\/entries\?kind=transfer/);
  assert.match(sources.page, /"Giroconto registrato"/);
  // cassetti con la guardia sulle modifiche
  assert.equal((sources.dialogs.match(/dirty=\{dirty\}/g) || []).length, 3, "registra, giroconto e riconciliazione portano la guardia");
});

test("/movements: storno con motivo obbligatorio e riconciliazione, con le parole della V1", () => {
  assert.match(sources.page, /<ReverseEntryDialog/);
  assert.match(sources.page, /<ReconcileEntryDialog/);
  assert.match(sources.dialogs, /title="Storna il movimento"/);
  assert.match(sources.dialogs, /Il denaro non si cancella\. Lo storno lascia visibili entrambe le righe/);
  assert.match(sources.dialogs, /E la gamba di un giroconto: lo storno riguarda entrambe le\s+gambe/);
  assert.match(sources.dialogs, /id="storno-motivo"/);
  assert.match(sources.dialogs, /placeholder="Perche questo movimento va corretto"/);
  assert.match(sources.dialogs, /id="storno-data"/);
  assert.match(sources.dialogs, /disabled=\{!reason\.trim\(\) \|\| saving\}/);
  assert.match(sources.dialogs, /variant="danger"/, "lo storno e un contorno rosso, mai un riempimento");
  assert.match(sources.dialogs, /Storno\.\.\./);
  assert.match(sources.page, /\/reverse`/);
  assert.match(sources.page, /"Movimento stornato"/);
  // riconciliazione
  assert.match(sources.dialogs, /title="Spunta contro l'estratto conto"/);
  assert.match(sources.dialogs, /Riconciliare non cambia nessun numero/);
  for (const id of ["riconcilia-stato", "riconcilia-valuta", "riconcilia-riferimento"]) {
    assert.ok(sources.dialogs.includes(`id="${id}"`), `manca il campo ${id}`);
  }
  assert.match(sources.dialogs, /placeholder="CRO, numero distinta"/);
  assert.match(sources.dialogs, /line\.reconciliationStatus === "unreconciled"\s*\?\s*"reconciled"/);
  assert.match(sources.dialogs, /Salvataggio\.\.\./);
  assert.match(sources.page, /\/reconcile`/);
  assert.match(sources.page, /"Riconciliazione aggiornata"/);
  assert.equal(/window\.confirm|[^.\w]confirm\(/.test(everythingCode), false, "nessuna conferma nativa");
});

/* ------------------------------------------------------------ rate e solleciti */

test("/movements: la scheda Rate e solleciti e una griglia con sollecito di massa e registro in pagina", () => {
  assert.match(sources.page, /module="rate"/);
  assert.match(sources.page, /Le rate dovute dalle famiglie\. Non sono denaro\s+incassato/);
  for (const column of ['id: "dueDate"', 'id: "athlete"', 'id: "description"', 'id: "due"', 'id: "paid"', 'id: "state"']) {
    assert.ok(sources.rate.includes(column), `manca la colonna ${column}`);
  }
  for (const header of ['header: "Scadenza"', 'header: "Atleta"', 'header: "Descrizione"', 'header: "Dovuto"', 'header: "Incassato"', 'header: "Stato"']) {
    assert.ok(sources.rate.includes(header), `manca l'intestazione ${header}`);
  }
  assert.match(sources.rate, /MONEY_STATUS\.paid/);
  assert.match(sources.rate, /MONEY_STATUS\.partial/);
  assert.match(sources.rate, /MONEY_STATUS\.pending/);
  assert.match(sources.rate, /MONEY_STATUS\.overdue/);
  // lo stato si deriva, non si legge
  assert.match(sources.rate, /resolveLedgerState\(\{ dueAmount, paidAmount \}\)/);
  assert.match(sources.rate, /readChargeCollectedAmount\(charge\)/);
  assert.match(sources.rate, /row\.state !== "paid"/, "solo le rate non saldate si sollecitano");
  // sollecito di massa
  assert.match(sources.page, /label: "Sollecita"/);
  assert.match(sources.page, /canSendReminders = canManageClubConfigurationAsActor\(activeClub\?\.role\)/);
  assert.match(sources.page, /rows\.filter\(isRemindable\)\.map\(\(row\) => row\.id\)/);
  assert.match(sources.page, /<PaymentReminderDialog/);
  assert.match(sources.reminder, /<Drawer/);
  assert.match(sources.reminder, /title="Sollecita le quote non pagate"/);
  assert.match(sources.reminder, /Invia sollecito \(/);
  assert.match(sources.reminder, /Configura SMTP in Impostazioni/);
  // registro incassi in pagina, dal componente condiviso
  assert.match(sources.page, /<AthletePaymentLedger/);
  assert.match(sources.page, /methodChoices=\{clubPaymentMethodChoices\}/);
  assert.match(sources.page, /showTotals=\{false\}/);
  assert.match(sources.page, /label: "Apri il registro incassi"/);
  assert.match(sources.page, /sortByDateDesc\(/);
  // stati
  assert.match(sources.page, /Nessuna rata registrata per questo club\./);
});

/* ------------------------------------------------------------ previsti */

test("/movements: la scheda Previsti resta separata dalla cassa, con creazione e rimozione", () => {
  assert.match(sources.page, /<ExpectedEntries clubId=\{activeClubId\} \/>/);
  assert.match(sources.expected, /module="previsti"/);
  assert.match(sources.expected, /Situazione previsionale/);
  assert.match(sources.expected, /border-dashed/, "il riquadro previsionale e tratteggiato come la fascia economica");
  assert.match(sources.expected, /title="Nuova previsione"/);
  for (const id of ["previsione-verso", "previsione-data", "previsione-descrizione", "previsione-importo", "previsione-categoria", "previsione-riferimento"]) {
    assert.ok(sources.expected.includes(`id="${id}"`), `manca il campo ${id}`);
  }
  assert.match(sources.expected, /Registra previsione/);
  assert.match(sources.expected, /"Previsione registrata"/);
  assert.match(sources.expected, /Togliere questa previsione\?/);
  assert.match(sources.expected, /Togli la previsione/);
  assert.match(sources.expected, /Non sparisce nessun movimento e nessun saldo cambia/);
  assert.match(sources.expected, /"Previsione rimossa"/);
  assert.match(sources.expected, /<ConfirmDialog/);
  assert.match(sources.expected, /label: "Togli"/);
  assert.match(sources.expected, /canManage\s*\?\s*\[/, "senza permesso l'azione e assente");
  assert.match(sources.expected, /Nessuna previsione registrata per questo club\./);
  assert.match(sources.expected, /Le previsioni non sono state lette/);
});

/* ------------------------------------------------------------ i gap dichiarati */

test("/movements: i gap dell'audit restano gap, non invenzioni", () => {
  assert.equal(/accounting\/export|Esporta in CSV|apiDownload/.test(everythingCode), false, "nessun pulsante di export su questa rotta (vive su /reports)");
  assert.equal(/accounting\/accounts\/|accounts_manage|Nuovo conto/.test(everythingCode), false, "nessuna gestione dei conti finanziari inventata");
  assert.equal(/window\.confirm|window\.prompt/.test(everythingCode), false);
  assert.equal(existsSync(path.join(process.cwd(), "src/components/accounting/AccountingFilters.tsx")), false, "la barra filtri V1 e stata rimossa");
  assert.equal(existsSync(path.join(process.cwd(), "src/components/accounting/AccountingEntries.tsx")), false, "la tabella V1 e stata rimossa");
});

/* ------------------------------------------------------------ vincoli visivi */

test("/movements: nessun linguaggio visivo nuovo", () => {
  assert.equal(/bg-gradient-to|from-blue-600|backdrop-blur|slate-|gray-50/.test(everythingCode), false, "solo classi egw-*");
  assert.equal(/@\/components\/ui\/(table|dialog|badge|card|tabs|select|input|label|textarea|button)"/.test(everything), false, "le primitive V1 non tornano");
  assert.equal(/toLocaleDateString|Intl\.NumberFormat/.test(everythingCode), false, "date e importi passano da @/lib/web/format");
  assert.match(sources.view, /import \{ formatDateShort, formatMoney \} from "@\/lib\/web\/format"/);
});
