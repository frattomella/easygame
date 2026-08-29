import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

/**
 * La superficie della **prima nota**, e cio che non deve ricomparirci.
 *
 * `/movements` era un aggregatore di lettura nel browser: circa diciassette
 * viaggi HTTP per disegnarsi — di cui quattordici sulla stessa singola riga
 * `clubs`, una per colonna — ventidue sorgenti normalizzate in memoria,
 * nessun filtro di data, nessuna paginazione, e **due letture morte** che
 * cercavano `suppliers` e `supplier_payments`, che non esistono ne come
 * colonna ne come risorsa.
 *
 * Aveva anche un difetto di permessi: la pagina non era riservata, leggeva via
 * `clubs` — che **e** admin-only — e la lettura **inghiottiva il 403
 * restituendo un array vuoto**. Un collaboratore la apriva, si caricava senza
 * errori e mostrava tutto a zero.
 *
 * Questi test non sostituiscono l'apertura della pagina: nessun test statico
 * dice se un numero e giusto. Difendono la classe di difetti che si
 * reintroduce **senza accorgersene** — una lettura in piu, un pulsante che
 * cancella, un permesso ricalcolato in un secondo posto.
 */

const read = (relative) =>
  fs.readFileSync(path.join(process.cwd(), relative), "utf8");

/**
 * Il file **senza i commenti**.
 *
 * I moduli di questa Wave spiegano nei commenti i difetti che chiudono, e
 * quindi nominano `suppliers`, `supplier_payments` e il `confirm()` del
 * browser. Un test che cercasse quelle parole nel testo integrale
 * fallirebbe sulla documentazione e passerebbe su una riga di codice
 * infilata sotto: e la ricerca del **codice** che deve essere pulita.
 */
const readCode = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");

const PAGE = "src/app/movements/page.tsx";

const SURFACE = [
  PAGE,
  "src/components/accounting/accounting-view.ts",
  "src/components/accounting/AccountingSummary.tsx",
  "src/components/accounting/AccountingFilters.tsx",
  "src/components/accounting/AccountingEntries.tsx",
  "src/components/accounting/AccountingEntryDialogs.tsx",
];

/* ========================================================================== */
/* Le letture morte                                                            */
/* ========================================================================== */

test("le due letture morte non esistono piu sulla prima nota", () => {
  for (const file of SURFACE) {
    const source = readCode(file);

    assert.equal(
      /supplier_payments|["'`]suppliers["'`]/.test(source),
      false,
      `${file}: \`suppliers\` e \`supplier_payments\` tornavano vuote a ogni apertura, e nessuno se ne accorgeva`,
    );
  }
});

test("la prima nota non passa piu dall'aggregatore nel browser", () => {
  const source = readCode(PAGE);

  assert.equal(
    source.includes("club-financial-summary"),
    false,
    "l'aggregazione delle sorgenti la fa il servizio, che sa cosa e una proiezione e cosa una riga propria",
  );
  assert.equal(
    /loadClubFinancialSources|aggregateClubPayments|summarizeClubMovements/.test(
      source,
    ),
    false,
    "normalizzare ventidue sorgenti nel browser era il difetto, non la soluzione",
  );
});

/* ========================================================================== */
/* Una lettura, non diciassette                                                */
/* ========================================================================== */

test("la prima nota legge dal registro canonico, con i filtri e la pagina", () => {
  const source = read(PAGE);

  assert.match(
    source,
    /\/api\/v1\/accounting\/entries\?/,
    "l'elenco viene dalla rotta della prima nota",
  );
  assert.match(
    source,
    /\/api\/v1\/accounting\/accounts/,
    "i conti e i loro saldi vengono dalla rotta dei conti",
  );
  assert.match(
    source,
    /buildEntriesQuery\(filters, \{ limit: PAGE_SIZE, offset \}\)/,
    "i filtri e la pagina scendono nella query: e il server che filtra, sugli indici",
  );
});

test("nessuna schermata della prima nota chiama `fetch` diretto su /api", () => {
  for (const file of SURFACE) {
    const source = readCode(file);

    assert.equal(
      /fetch\(\s*[`"']\/api/.test(source),
      false,
      `${file}: il trasporto HTTP client e \`src/lib/api/client.ts\`, e passa gli header di club e ruolo`,
    );
  }
});

test("i filtri offerti sono quelli che il servizio sa applicare", () => {
  const source = read("src/components/accounting/accounting-view.ts");

  for (const parametro of [
    "from",
    "to",
    "fiscal_year",
    "financial_account_id",
    "operation_type_code",
    "direction",
    "source_domain",
    "reconciliation_status",
    "site_id",
  ]) {
    assert.match(
      source,
      new RegExp(`put\\("${parametro}"`),
      `manca il filtro ${parametro}: offrirne uno che il server ignora e peggio che non offrirlo`,
    );
  }

  assert.match(
    source,
    /query\.set\("limit"[\s\S]*query\.set\("offset"/,
    "senza paginazione la pagina rendeva tutte le righe dello storico",
  );
});

test("un filtro vuoto non finisce in querystring", () => {
  const source = read("src/components/accounting/accounting-view.ts");

  assert.match(
    source,
    /const text = String\(value \|\| ""\)\.trim\(\);\s*if \(text\) query\.set\(key, text\);/,
    "un parametro che c'e ma non dice niente e il gemello della trappola di `toFiscalYearFilter`",
  );
});

/* ========================================================================== */
/* Il denaro non si cancella                                                   */
/* ========================================================================== */

test("dalla prima nota non si cancella nessun movimento", () => {
  for (const file of SURFACE) {
    const source = readCode(file);

    assert.equal(
      /method:\s*["'`]DELETE["'`]/.test(source),
      false,
      `${file}: il denaro non si cancella, si storna`,
    );
    assert.equal(
      /deleteClubDataItem|Trash2|>\s*Elimina|Cancella movimento/.test(source),
      false,
      `${file}: il pulsante «Elimina» non deve esistere (difetto D-3)`,
    );
    assert.equal(
      /confirm\(/.test(source),
      false,
      `${file}: un movimento di 10.000 EUR spariva con un \`confirm()\` del browser`,
    );
  }
});

test("lo storno esiste, e chiede un motivo", () => {
  const dialoghi = read("src/components/accounting/AccountingEntryDialogs.tsx");

  assert.match(dialoghi, /export function ReverseEntryDialog/);
  assert.match(
    dialoghi,
    /disabled=\{!reason\.trim\(\) \|\| saving\}/,
    "senza motivo la riga non spiega niente: il pulsante resta spento",
  );

  const page = read(PAGE);
  assert.match(
    page,
    /\/reverse`/,
    "lo storno passa da POST /api/v1/accounting/entries/:id/reverse",
  );
});

/* ========================================================================== */
/* I permessi arrivano con la riga                                             */
/* ========================================================================== */

test("le azioni di riga nascono dai flag del servizio, non da un ricalcolo locale", () => {
  const lista = readCode("src/components/accounting/AccountingEntries.tsx");

  assert.match(
    lista,
    /line\.canReconcile \?/,
    "«Riconcilia» compare solo se la riga lo consente",
  );
  assert.match(
    lista,
    /line\.canReverse \?/,
    "«Storna» compare solo se la riga lo consente",
  );

  /*
    Il difetto da impedire e preciso: che il componente della lista torni a
    decidere da se guardando il ruolo. E la lezione W3-14 — due porte che
    decidono la stessa cosa in due posti finiscono per rispondere diversamente.
  */
  assert.equal(
    /useAuth|activeRole|userRole|hasAccountingPermission|normalizeAccessRole/.test(
      lista,
    ),
    false,
    "la lista non conosce il ruolo di chi guarda, e non deve conoscerlo",
  );
});

test("una riga proiettata non puo essere spedita alle rotte di scrittura", () => {
  const view = read("src/components/accounting/accounting-view.ts");

  assert.match(
    view,
    /raw\.startsWith\("accounting-entry:"\)/,
    "solo una riga propria ha un id che le rotte di storno e riconciliazione riconoscono",
  );

  const page = read(PAGE);
  assert.match(
    page,
    /const id = ownEntryId\(line\);\s*if \(!id\) return;/,
    "un compenso si corregge dove i compensi si erogano, non dalla prima nota",
  );
});

test("la pagina e il menu usano la matrice condivisa dei permessi", () => {
  const page = read(PAGE);

  assert.match(
    page,
    /from "@\/lib\/accounting\/permissions"/,
    "i permessi contabili stanno in un modulo solo",
  );
  assert.match(page, /canOpenAccounting\(activeRole\)/);

  /*
    Il permesso sui **saldi** non si valuta nella pagina: il riepilogo risponde
    `accountBalances: null` a chi non ce l'ha, e la scheda mostra il diniego
    perche il numero manca. Valutarlo anche qui sarebbe la seconda copia della
    stessa decisione — la lezione W3-14.
  */
  assert.equal(
    /accounting\.accounts_read/.test(readCode(PAGE)),
    false,
    "il permesso sui saldi lo applica il servizio, e la pagina legge il risultato",
  );

  const sidebar = read("src/components/dashboard/Sidebar.tsx");
  assert.match(
    sidebar,
    /canOpenAccounting/,
    "la voce di menu segue la stessa matrice della pagina e delle rotte",
  );
});

test("chi non puo vedere i saldi legge perche, e non degli zeri", () => {
  const riepilogo = read("src/components/accounting/AccountingSummary.tsx");

  assert.match(
    riepilogo,
    /const saldi = report\.accountBalances;/,
    "i saldi si mostrano solo se il server li ha davvero consegnati: `null` non e zero",
  );
  assert.match(
    riepilogo,
    /I saldi dei conti non sono visibili/,
    "un numero sbagliato al posto di un diniego e il difetto misurato al §30",
  );

  const page = read(PAGE);
  assert.match(
    page,
    /La prima nota non e accessibile/,
    "chi non puo aprirla legge il motivo, non una pagina di zeri",
  );
  assert.match(
    page,
    /setError\(response\.error\.message\)/,
    "l'errore si mostra: inghiottirlo e disegnare zeri era il difetto",
  );
});

/* ========================================================================== */
/* Multi-sede                                                                  */
/* ========================================================================== */

test("il filtro sede passa dal componente che conosce ADR-0038", () => {
  const filtri = read("src/components/accounting/AccountingFilters.tsx");

  assert.match(
    filtri,
    /<SiteFilter/,
    "il club mono-sede non paga niente: la regola vive in SiteFilter, non qui",
  );
  assert.equal(
    /isMultiSiteClub/.test(filtri),
    false,
    "riscrivere la condizione qui sarebbe la seconda copia della stessa regola",
  );
});

test("la sede di un movimento e facoltativa e si chiede solo ai club multi-sede", () => {
  const dialoghi = read("src/components/accounting/AccountingEntryDialogs.tsx");

  assert.match(
    dialoghi,
    /isMultiSiteClub\(sites\) \? \(/,
    "un club con una sede sola non deve vedere il campo",
  );
  assert.match(
    dialoghi,
    /Sede \(facoltativa\)/,
    "il brief vieta di obbligare la sede su ogni movimento",
  );
});

/* ========================================================================== */
/* La causale                                                                  */
/* ========================================================================== */

test("la causale si sceglie da un elenco, e non e testo libero", () => {
  const dialoghi = read("src/components/accounting/AccountingEntryDialogs.tsx");

  assert.match(
    dialoghi,
    /operationTypesForDirection\(operationTypes, direction\)/,
    "l'elenco viene dal catalogo delle causali del club",
  );
  assert.match(
    dialoghi,
    /Boolean\(operationTypeCode\)/,
    "la causale e obbligatoria: un movimento senza causale nasce gia sbagliato",
  );
  assert.equal(
    /placeholder="Categoria"|newTransaction\.category/.test(dialoghi),
    false,
    "la categoria sportiva dell'atleta non e una causale contabile",
  );
});

test("il giroconto e una chiamata sola", () => {
  const page = read(PAGE);

  assert.match(
    page,
    /\/api\/v1\/accounting\/entries\?kind=transfer/,
    "due chiamate HTTP separate lasciavano denaro sparito fra due conti",
  );

  const chiamate = page.match(/kind=transfer/g) || [];
  assert.equal(chiamate.length, 1, "una sola gamba non e un giroconto");
});

/* ========================================================================== */
/* Cassa e crediti non stanno nella stessa riga di totali                       */
/* ========================================================================== */

test("i riquadri separano la grandezza finanziaria da quella economica", () => {
  const riepilogo = read("src/components/accounting/AccountingSummary.tsx");

  assert.match(riepilogo, /Situazione finanziaria/);
  assert.match(riepilogo, /Situazione economica/);
  assert.equal(
    /Previste:|totalPendingIncome|totalPendingExpense/.test(riepilogo),
    false,
    "«Entrate» con sotto «Previste» mescolava cassa e crediti nella stessa scheda",
  );
});

test("crediti e debiti arrivano dai loro proprietari, non da un ricalcolo", () => {
  const riepilogo = readCode("src/components/accounting/AccountingSummary.tsx");

  assert.equal(
    /installment-ledger|resolveLedgerState|summarizeLedgers/.test(riepilogo),
    false,
    "il residuo delle rate lo calcola il registro degli incassi, e il servizio lo consegna gia fatto",
  );
  assert.match(
    riepilogo,
    /Fonte: il registro delle rate/,
    "ogni riquadro dichiara il proprietario del suo numero (§28)",
  );
});

test("i totali del periodo li somma il server, non il componente", () => {
  const page = readCode(PAGE);

  assert.match(
    page,
    /\/api\/v1\/accounting\/reports\?/,
    "il riepilogo gestionale e la fonte dei totali: la pagina dell'elenco ne contiene cento righe",
  );

  const riepilogo = readCode("src/components/accounting/AccountingSummary.tsx");

  assert.match(riepilogo, /report\.cash\.collectedCents/);
  assert.match(riepilogo, /report\.cash\.paidCents/);
  assert.match(riepilogo, /report\.accrual\.familyReceivablesCents/);

  /*
    Il difetto da impedire e che una somma ricompaia qui: `reduce` sulle righe,
    `+=` su un totale, un `filter` per verso. L'unica addizione ammessa e
    quella dei saldi gia calcolati dal server, e si vede perche e sola.
  */
  assert.equal(
    /entries\.|\.filter\(\(line\)/.test(riepilogo),
    false,
    "la scheda non tocca le righe dell'elenco: i numeri arrivano gia sommati",
  );
});

test("i totali dichiarano quando l'elenco e ristretto da un filtro che non applicano", () => {
  const view = readCode("src/components/accounting/accounting-view.ts");

  assert.match(
    view,
    /REPORT_UNAWARE_FILTERS/,
    "origine, riconciliazione e ricerca restringono l'elenco, non il periodo",
  );

  const riepilogo = read("src/components/accounting/AccountingSummary.tsx");
  assert.match(
    riepilogo,
    /filtersBeyondSummary \?/,
    "un totale che ignora silenziosamente una restrizione e un numero sbagliato",
  );
});

test("il riepilogo mostra la riga che qualifica i numeri", () => {
  const riepilogo = readCode("src/components/accounting/AccountingSummary.tsx");

  assert.match(
    riepilogo,
    /report\.disclaimer/,
    "senza la riga che li qualifica un promemoria interno sembra un documento ufficiale (§13)",
  );
});

/* ========================================================================== */
/* Responsivita                                                                */
/* ========================================================================== */

test("a 375 px la tabella dei movimenti non allarga la pagina", () => {
  const lista = read("src/components/accounting/AccountingEntries.tsx");

  assert.match(
    lista,
    /md:hidden/,
    "sotto md i movimenti sono schede: nove colonne restano illeggibili anche scorrendo",
  );
  assert.match(
    lista,
    /hidden overflow-x-auto[^"]*md:block/,
    "la tabella scorre nel proprio contenitore, non nel documento",
  );
});

test("nessuna griglia della prima nota resta a due colonne a 375 px", () => {
  const offenders = [];

  for (const file of SURFACE) {
    const offending = read(file)
      .split(/\r?\n/)
      .filter((line) => /(?<![a-z:])grid-cols-[23]\b/.test(line))
      .filter((line) => !line.includes("TabsList"));

    if (offending.length) {
      offenders.push(`${file}: ${offending[0].trim().slice(0, 80)}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "usare grid-cols-1 sm:grid-cols-2: a 375 px due colonne non ci stanno",
  );
});

/* ========================================================================== */
/* Nessun import di dominio server dal browser                                 */
/* ========================================================================== */

test("la superficie non importa niente da src/lib/server", () => {
  for (const file of SURFACE) {
    const source = readCode(file);

    assert.equal(
      /from "@\/lib\/server\//.test(source),
      false,
      `${file}: un componente client non importa mai il servizio, trascinerebbe Prisma nel bundle`,
    );
  }
});
