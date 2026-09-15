import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Invarianti di responsivita sulle pagine toccate dal Blocco 8.
 *
 * **Cosa questi test sono, e cosa non sono.** Non sostituiscono l'apertura di
 * una pagina a 375 px: nessun test statico puo dire se qualcosa e leggibile.
 * Verificano la classe di difetti che si introduce **senza accorgersene**
 * scrivendo markup — una griglia a due colonne senza punto di rottura, una
 * tabella che allarga il documento invece del proprio contenitore — e che poi
 * si scopre da uno smartphone in palestra.
 *
 * Il difetto vero trovato dal Blocco 8: le finestre di modifica di
 * allenatore, staff, socio e atleta usavano `grid-cols-2` **senza
 * breakpoint**, quindi erano a due colonne anche a 375 px. Con i campi corti
 * si notava poco; portandoci dentro il campo telefono condiviso — che ha una
 * tendina da 136 px — al numero non restava spazio.
 */

const SRC = path.join(process.cwd(), "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8");

/** Le pagine e i componenti che il Blocco 8 ha toccato. */
const TOUCHED = [
  "app/athletes/[id]/page.tsx",
  "app/trainers/[id]/page.tsx",
  "app/trainers/page.tsx",
  "app/trainers/new/page.tsx",
  "components/trainer/v2/trainer-section-drawer.tsx",
  "components/trainer/v2/trainer-access-panel.tsx",
  "components/trainer/v2/trainer-payments-panel.tsx",
  "components/trainer/trainer-documents-panel.tsx",
  "app/staff/[id]/page.tsx",
  "app/soci/[id]/page.tsx",
  "app/organization/page.tsx",
  "components/forms/AthleteCreateForm.tsx",
  "components/forms/phone-field.tsx",
  "components/forms/certificate-attachment-field.tsx",
  "components/forms/document-extraction-field.tsx",
  /*
    Dal Web V2 la scheda atleta e composta dai blocchi in
    `components/athletes/profile/v2/`: valgono le stesse regole.
  */
  "components/athletes/profile/v2/AthleteRecordHeader.tsx",
  "components/athletes/profile/v2/AthleteProfileSections.tsx",
  "components/athletes/profile/v2/AthleteActivitySections.tsx",
  "components/athletes/profile/v2/AthleteHealthSections.tsx",
  "components/athletes/profile/v2/AthleteDocumentSections.tsx",
  "components/athletes/profile/v2/AthleteProfileDrawers.tsx",
  "components/athletes/profile/v2/AthleteDocumentDrawers.tsx",
  "components/athletes/profile/v2/AthleteActivityDrawers.tsx",
  "components/athletes/profile/v2/AthleteAdministrationParts.tsx",
  "components/athletes/profile/v2/record-primitives.tsx",
  "components/athletes/profile/athlete-certificates-panel.tsx",
  "components/athletes/profile/athlete-registrations-panel.tsx",
  "components/athletes/profile/athlete-data-subject-section.tsx",
  "components/athletes/profile/athlete-account-section.tsx",
  /*
    Le superfici nuove della Wave 1. Valgono le stesse regole: l'elenco di
    riconferma puo avere duecento righe, e va deciso da uno smartphone il
    1o luglio, non da una scrivania.
  */
  "components/organization/v2/season-manager.tsx",
  "components/organization/v2/club-signature-panel.tsx",
  "components/organization/v2/club-profile-sections.tsx",
  "components/organization/v2/club-federations-section.tsx",
  "components/organization/v2/fiscal-profile-panel.tsx",
  "components/organization/v2/operation-types-panel.tsx",
  "app/settings/page.tsx",
  "components/settings/v2/settings-sections.tsx",
  "app/reports/page.tsx",
  /*
    Dal Web V2 `/reports` e composta dai pannelli in `components/reports/v2/`
    e dal riepilogo gestionale: dieci filtri, quattro riquadri di cassa e
    cinque griglie che a 375 px devono restare una colonna e scorrere in se.
  */
  "app/reports/management-summary.tsx",
  "app/reports/accounting-export-button.tsx",
  "components/reports/v2/activity-report-panels.tsx",
  "components/reports/v2/management-group-grid.tsx",
  "components/reports/v2/report-stat-tile.tsx",
  "components/reports/v2/report-context-controls.tsx",
  /*
    Wave 2: la configurazione delle automazioni. Quattro schede con anticipi,
    pubblico e testo del messaggio — cioe la superficie che una segreteria
    apre per spegnere una regola, spesso di corsa e spesso dal telefono.
  */
  "app/communications/automazioni/page.tsx",
  /*
    **PP-02 §N: le superfici dell'area famiglia.** E la parte del prodotto che
    si apre piu spesso da un telefono — in palestra, in macchina, la sera — e
    quella su cui PP-02 ha spostato di piu: la scelta del figlio, l'identita
    nel guscio, la riga delle ricevute, l'elenco dei moduli online e la scelta
    del motivo di un appuntamento.
  */
  "app/parent-view/page.tsx",
  "components/parent-dashboard/parent-dashboard-pages.tsx",
  "components/parent-dashboard/parent-family-pages.tsx",
  "components/parent-dashboard/parent-dashboard-shell.tsx",
  "components/parent-dashboard/ParentSidebar.tsx",
  "app/appuntamenti/page.tsx",
];

test("nessuna griglia resta a due colonne a 375 px", () => {
  const offenders = [];

  for (const file of TOUCHED) {
    const source = read(file);

    /*
      `grid-cols-2` o `grid-cols-3` senza un prefisso di breakpoint davanti:
      a 375 px valgono, e due o tre colonne su 375 px non ci stanno.
      `sm:grid-cols-2` va benissimo, ed e infatti la forma corretta.
    */
    const offending = source
      .split(/\r?\n/)
      .filter((line) => /(?<![a-z:])grid-cols-[23]\b/.test(line))
      /*
        Una barra di schede a due colonne a 375 px va benissimo: sono due
        etichette affiancate, non due campi di un modulo. E la forma che
        l'applicazione usa gia su allenatore, staff e socio.
      */
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

test("il campo telefono non si comprime fino a sparire", () => {
  const source = read("components/forms/phone-field.tsx");

  assert.match(
    source,
    /flex flex-wrap gap-2/,
    "senza flex-wrap la tendina del prefisso mangia tutto lo spazio del numero",
  );
  assert.match(
    source,
    /min-w-\[8rem\]/,
    "il campo del numero deve dichiarare una larghezza minima",
  );
});

test("le tabelle scrollano nel proprio contenitore, non nel documento", () => {
  for (const file of TOUCHED) {
    const source = read(file);
    const tables = source.match(/<table[\s\S]{0,400}?>/g) || [];
    if (!tables.length) continue;

    /*
      Una `<table>` non si restringe: se il contenitore non scrolla, allarga
      il documento e tutta la pagina scorre in orizzontale.
    */
    assert.match(
      source,
      /overflow-x-auto/,
      `${file}: una tabella senza contenitore scrollabile allarga il documento`,
    );
  }
});

test("l'intestazione della scheda atleta e quella del sistema, che va a capo da sola", () => {
  /*
    Dal Web V2 l'intestazione e il `RecordHeader` (09 §9.8): identita, nome
    e azioni stanno in un `flex-wrap`, e le azioni oltre le due inline vanno
    nel `···`. La scheda non ridisegna niente: lo monta.
  */
  const source = read("components/athletes/profile/v2/AthleteRecordHeader.tsx");
  assert.match(source, /<RecordHeader/);
  assert.match(
    read("components/web/record/Record.tsx"),
    /flex flex-wrap items-start gap-5/,
    "identita, nome e azioni vanno a capo a 375 px",
  );
});

test("le quattro aree della scheda atleta scorrono invece di andare a capo", () => {
  const source = read("components/athletes/profile/v2/AthleteRecordHeader.tsx");
  assert.match(source, /<RecordAreaSwitcher/);

  /* La riga delle aree scorre dentro il RecordHeader del sistema. */
  const record = read("components/web/record/Record.tsx");
  assert.match(
    record,
    /overflow-x-auto[^>]*>\s*\{areas\}/,
    "quattro aree su due righe spingono il contenuto sotto la piega",
  );
});

test("i dialoghi non superano l'altezza dello schermo", () => {
  /*
    Un dialogo piu alto della finestra e un dialogo il cui pulsante «Salva»
    non si raggiunge. `max-h-[90vh]` con contenuto scrollabile e la forma che
    l'applicazione usa gia.
  */
  for (const file of [
    "app/trainers/[id]/page.tsx",
    "app/staff/[id]/page.tsx",
    "app/soci/[id]/page.tsx",
  ]) {
    const source = read(file);
    if (!source.includes("max-h-[90vh]")) continue;

    assert.match(
      source,
      /overflow-auto max-h-\[calc\(90vh-140px\)\]/,
      `${file}: senza contenuto scrollabile il pulsante di salvataggio resta fuori schermo`,
    );
  }
});

/* -------------------------------------------- Blocco A: verifica su schermo */

/**
 * Il guscio del club deve poter restringersi.
 *
 * **Il difetto, e perche era invisibile ai test statici.** Il contenitore
 * principale del club e un elemento flex dentro una riga. Un elemento flex ha
 * Il guscio che porta il contenuto deve avere **sia** un taglio dello
 * scorrimento **sia** `min-width: 0`.
 *
 * A 768 px su `/organization` l'effetto della sola mancanza di `min-w-0` era
 * che la barra delle nove schede — che ha gia `overflow-x-auto` e dovrebbe
 * scorrere da sola — allargava il guscio a 1022 px invece di scorrere, e con
 * lui **tutta la pagina**. Nessuna invariante statica poteva vederlo, perche
 * ogni singola classe era corretta; sbagliato era cio che mancava, e si e
 * visto solo misurando la pagina a 768 px.
 *
 * In RC Fix 1 queste quattro schermate hanno perso il doppio ramo
 * desktop/mobile — montava il contenuto due volte — e sono passate al guscio
 * unico che usano le altre ~40. L'invariante non cambia: il guscio resta
 * quello che non deve crescere.
 */
test("il guscio del club non cresce con il proprio contenuto", () => {
  const shells = [
    "app/dashboard/layout.tsx",
    "app/organization/page.tsx",
    "app/sponsors/page.tsx",
    "app/staff/page.tsx",
  ];

  for (const file of shells) {
    const source = read(file);

    assert.match(
      source,
      /className="flex min-w-0 flex-1 flex-col overflow-hidden"/,
      `${file}: il guscio deve avere min-w-0 e overflow-hidden`,
    );
    assert.equal(
      /className="flex flex-1 flex-col lg:hidden"/.test(source),
      false,
      `${file}: il guscio senza min-w-0 si allarga con il contenuto`,
    );
  }
});

/**
 * Due elenchi gemelli, due comportamenti a schermo stretto.
 *
 * A 375 px la riga di comandi dell'elenco Soci sforava di sei pixel e
 * «Aggiungi Socio» usciva dalla viewport. L'elenco Allenatori, che ha la
 * stessa riga, era gia a capo automatico: la differenza era una classe.
 */
test("le righe di comandi degli elenchi vanno a capo su schermo stretto", () => {
  /*
    Allenatori e soci sono passati alla `PageHeader` del Web V2: la riga di
    titolo e azioni va a capo dentro il componente condiviso, non nella pagina.
  */
  assert.match(read("app/trainers/page.tsx"), /<PageHeader/);
  assert.match(read("app/soci/page.tsx"), /<PageHeader/);
  assert.match(
    read("components/web/page/PageHeader.tsx"),
    /flex flex-wrap items-end justify-between/,
    "l'intestazione condivisa deve andare a capo su schermo stretto",
  );
});

/**
 * Sulla scheda allenatore l'intestazione dei documenti sta in colonna.
 *
 * A 375 px i comandi in riga arrivavano a x=402: il secondo era fuori dallo
 * schermo e non si poteva premere. Dopo RC Fix 1 il riquadro e uno solo — la
 * griglia dei documenti — ma la regola resta la stessa.
 */
test("i comandi dei documenti dell'allenatore stanno nello schermo", () => {
  const source = read("components/trainer/trainer-documents-panel.tsx");

  assert.match(
    source,
    /flex flex-col items-start justify-between gap-3 border-b border-egw-hairline px-4 py-3 sm:flex-row sm:items-center/,
    "l'intestazione va a colonna sotto i 640 px",
  );
  assert.match(
    source,
    /w-full justify-center sm:w-auto/,
    "il comando occupa la riga finche c'e poco spazio",
  );
  /*
    Dal Web V2 le righe stanno nel `DataGrid`, che scorre dentro il proprio
    pannello (`overflow-auto` sul corpo) invece di allargare la pagina.
  */
  assert.match(source, /<DataGrid/);
  assert.match(
    read("components/web/datagrid/DataGrid.tsx"),
    /overflow-auto/,
    "la griglia scorre da sola invece di allargare la pagina",
  );
});

/* ------------------------------------- superfici del Blocco Finale B */

/**
 * Le schermate nate o cambiate nel Blocco Finale B.
 *
 * Vale la stessa avvertenza di tutto il file: questi test **non**
 * sostituiscono l'apertura a 375 px, che resta in R-01 e richiede una
 * sessione autenticata su un database. Coprono la classe di difetti che si
 * scrive senza accorgersene, e che poi si scopre da uno smartphone in
 * palestra.
 */
const BLOCCO_B = [
  "components/platform-admin/club-services-section.tsx",
  "components/payments/InstallmentLedgerList.tsx",
  "components/forms/form-field-card.tsx",
  "components/forms/form-builder.tsx",
];

test("le superfici del Blocco Finale B non restano a due colonne a 375 px", () => {
  const offenders = [];

  for (const file of BLOCCO_B) {
    const source = read(file);
    const offending = source
      .split(/\r?\n/)
      .filter((line) => /(?<![a-z:])grid-cols-[234]\b/.test(line));

    if (offending.length) offenders.push({ file, lines: offending });
  }

  assert.deepEqual(
    offenders,
    [],
    "una griglia senza breakpoint vale anche a 375 px",
  );
});

test("le righe di «Servizi e piani» impilano i comandi su schermo stretto", () => {
  const source = read("components/platform-admin/club-services-section.tsx");

  assert.match(
    source,
    /flex-col[^"]*sm:flex-row/,
    "nome della funzione e i tre pulsanti su una riga sola a 375 px non ci stanno",
  );
  assert.match(
    source,
    /grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4/,
    "il riepilogo del club deve partire da una colonna",
  );
});

test("i pulsanti dei documenti vanno a capo invece di uscire dallo schermo", () => {
  const source = read("components/payments/InstallmentLedgerList.tsx");

  /*
    Su una riga di incasso convivono «Ricevuta», «Fattura» e «Storna». A 375
    px sono tre pulsanti con icona: senza `flex-wrap` l'ultimo esce dal
    contenitore invece di andare sotto.
  */
  assert.match(source, /flex-wrap/);
});

test("il documento stampabile parte da una colonna e sa stamparsi", () => {
  const source = read("lib/documents/document-view.ts");

  assert.match(
    source,
    /\.grid \{ display: grid; grid-template-columns: 1fr;/,
    "emittente e intestatario affiancati a 375 px non ci stanno",
  );
  assert.match(source, /@media \(min-width: 640px\)/);
  assert.match(source, /@media print/);
  assert.match(
    source,
    /max-width: 720px/,
    "a 1280 px un documento a piena larghezza e illeggibile",
  );
});

test("l'anteprima del builder usa lo stesso renderer della compilazione", () => {
  const source = read("components/forms/form-builder.tsx");

  assert.match(source, /<FormRenderer/);
  assert.match(
    source,
    /previewSchema/,
    "l'anteprima deve vedere le stesse opzioni che vedra chi compila",
  );
});

/* ------------ Blocco Finale C — cio che la verifica su schermo ha trovato -- */

/**
 * **Cinque difetti che nessuna invariante statica poteva vedere.** Sono usciti
 * caricando le pagine a 375 px in un browser vero, e hanno tutti la stessa
 * forma: un elemento di griglia o di flex con larghezza minima pari al
 * **contenuto**. Il contenitore non si restringe, la riga diventa piu larga
 * dello schermo, e `overflow-x-hidden` della main la **taglia** — non la
 * nasconde dietro uno scorrimento: la taglia.
 *
 * Non e un difetto estetico. A 375 px la dashboard perdeva cinquanta pixel
 * di larghezza, l'onboarding scorreva di 347, e su tre pagine intere schede
 * — «Sconti e Promozioni», «Voucher e Contributi», «Mancanti» — erano
 * irraggiungibili da un telefono.
 *
 * Questi test sono statici e non rifanno la misura: presidiano la **forma
 * della correzione**, cosi che una modifica futura non la tolga per
 * distrazione.
 */

test("le griglie a una colonna dichiarano una traccia che puo restringersi", () => {
  const casi = [
    [
      "components/dashboard/v2/ClubDashboard.tsx",
      /grid-cols-\[minmax\(0,1fr\)\][\s\S]{0,80}laptop:grid-cols-\[minmax\(0,2fr\)_minmax\(0,1fr\)\]/,
    ],
    ["app/onboarding/page.tsx", /grid-cols-\[minmax\(0,1fr\)\][\s\S]{0,120}lg:grid-cols-\[240px,minmax\(0,1fr\)\]/],
  ];

  for (const [file, pattern] of casi) {
    assert.match(
      read(file),
      pattern,
      `${file}: una traccia \`auto\` rispetta la larghezza minima del contenuto, e a 375 px il contenuto e piu largo dello schermo`,
    );
  }
});

test("le colonne che contengono elenchi scorrevoli possono restringersi", () => {
  assert.match(
    read("app/onboarding/page.tsx"),
    /aria-label="Passi della configurazione"[\s\S]{0,120}min-w-0/,
    "l'elenco dei passi scorre gia; era la colonna a non potersi stringere",
  );
  assert.match(
    read("components/dashboard/v2/ClubDashboard.tsx"),
    /<aside className="grid min-w-0/,
    "le schede laterali uscivano di cinquanta pixel dallo schermo",
  );
});

test("il nome del club puo troncare, cosi la stagione resta visibile", () => {
  assert.match(
    read("components/brand/club-identity.tsx"),
    /min-w-0 truncate font-display/,
    "senza `min-w-0` un `truncate` non tronca: la targhetta stagione finiva fuori",
  );
});

test("le barre di schede non escono dallo schermo stretto", () => {
  const casi = [
    /*
      Dal Web V2 le quattro schede di «Iscrizioni» sono un `SegmentedControl`
      dentro l'intestazione, e la regola e la stessa: la barra scorre nel
      proprio contenitore invece di allargare la pagina, cosi «Contributi e
      bandi» resta raggiungibile da un telefono.
    */
    ["app/registration-management/page.tsx", /<SegmentedControl<RegistrationTab>[\s\S]{0,400}?className="max-w-full overflow-x-auto"/],
    ["app/modulistica/page.tsx", /<SegmentedControl<ModulisticaTab>[\s\S]{0,400}?className="max-w-full overflow-x-auto"/],
  ];

  for (const [file, pattern] of casi) {
    assert.match(
      read(file),
      pattern,
      `${file}: le schede oltre la terza erano tagliate via, cioe irraggiungibili da un telefono`,
    );
  }

  /*
    `/medical` nel Web V2 non ha piu una `TabsList`: le cinque schede (Tutti
    · Validi · In scadenza · Scaduti · Mancanti) sono le viste del DataGrid,
    e «Mancanti» — quella che una segreteria guarda per prima — deve restare
    raggiungibile a 375 px: la barra delle viste va a capo invece di tagliare.
  */
  assert.match(
    read("app/medical/page.tsx"),
    /views=\{CERTIFICATE_VIEWS\}/,
    "app/medical/page.tsx: le schede di stato sono le viste della griglia",
  );
  assert.doesNotMatch(read("app/medical/page.tsx"), /<TabsList/);
  assert.match(
    read("components/web/datagrid/DataGrid.tsx"),
    /flex min-h-\[52px\] flex-wrap items-center gap-2 border-b border-egw-hairline[^"]*"[\s\S]{0,200}<Eyebrow className="mr-1">Viste<\/Eyebrow>/,
    "la barra delle viste della griglia va a capo: nessuna vista viene tagliata a 375 px",
  );
});

test("i comandi di intestazione vanno a capo prima di uscire", () => {
  assert.match(
    read("components/web/page/PageHeader.tsx"),
    /flex flex-wrap gap-2 sm:shrink-0/,
    "`shrink-0` sotto sm faceva sporgere di qualche pixel un pulsante con etichetta lunga",
  );
  /*
    Nel Web V2 la navigazione della settimana vive nel rail delle gare: sotto
    i 1024 px i sette giorni scorrono in riga invece di sporgere.
  */
  assert.match(
    read("components/matches/v2/MatchWeekRail.tsx"),
    /flex gap-1\.5 overflow-x-auto/,
    "i giorni della settimana scorrono in riga a 375 px, non escono dal pannello",
  );
});

test("esiste un guscio solo, e Modulistica usa quello", () => {
  const modulistica = read("app/modulistica/page.tsx");

  /* Dal Web V2 (Wave E) la barra mobile arriva da `Header`: montarne una seconda impilava due intestazioni. */
  assert.match(modulistica, /<Header title="Modulistica" \/>/);
  assert.doesNotMatch(modulistica, /<MobileTopBar/);
  assert.match(modulistica, /className={dashboardMainClassName}/);
  assert.doesNotMatch(
    modulistica,
    /<LayoutWithMobileNav>/,
    "era l'unica pagina con un guscio proprio, e su un telefono la navigazione in flusso normale le lasciava 146 pixel su 375",
  );

  for (const orfano of [
    "app/layout-with-mobile-nav.tsx",
    "components/ui/mobile-navigation.tsx",
  ]) {
    assert.equal(
      existsSync(path.join(SRC, orfano)),
      false,
      `${orfano}: seconda generazione di guscio, ora senza nessun consumatore`,
    );
  }
});

/* ----------------------------------- superfici di RC Fix 2 (punto 21) */

/** Cio che RC Fix 2 ha aggiunto o riscritto. */
const RC_FIX_2_SURFACES = [
  "components/forms/person-identity-fields.tsx",
  "components/ui/list-selection.tsx",
  "components/sites/site-filter.tsx",
  "components/payments/ClubPaymentAccountPanel.tsx",
  "components/brand/stripe-brand.tsx",
];

test("le superfici di RC Fix 2 non restano a due colonne a 375 px", () => {
  const offenders = [];

  for (const file of RC_FIX_2_SURFACES) {
    read(file)
      .split(/\r?\n/)
      .forEach((line, index) => {
        if (/(?<![a-z:])grid-cols-[23]\b/.test(line)) {
          offenders.push(`${file}:${index + 1}`);
        }
      });
  }

  assert.deepEqual(
    offenders,
    [],
    "una griglia senza punto di rottura vale anche a 375 px",
  );
});

/**
 * La barra della selezione a schermo stretto.
 *
 * Ha un conteggio a sinistra e da tre a cinque pulsanti a destra: in riga
 * fissa a 375 px l'ultimo esce dallo schermo, e l'ultimo e «Cancella
 * selezione» — cioe l'unico modo di tornare indietro.
 */
test("la barra della selezione impila e va a capo su schermo stretto", () => {
  const toolbar = read("components/ui/list-selection.tsx");

  assert.match(
    toolbar,
    /flex flex-col gap-2 [^"]*sm:flex-row/,
    "sotto i 640 px conteggio e azioni stanno uno sopra l'altro",
  );
  assert.match(
    toolbar,
    /flex flex-wrap items-center gap-2/,
    "le azioni vanno a capo invece di uscire",
  );
});

/**
 * I due filtri di elenco — sede e gruppo — occupano tutta la riga su
 * schermo stretto e si affiancano da 640 px in su. Larghezza fissa a 375 px
 * vorrebbe dire due tendine che non ci stanno.
 */
test("i filtri sede e gruppo non hanno larghezza fissa a 375 px", () => {
  const filters = read("components/sites/site-filter.tsx");
  const fixedWidths = filters.match(/className="mt-1 w-full sm:w-56"/g) || [];

  assert.equal(
    fixedWidths.length,
    2,
    "sede e gruppo devono avere entrambi la stessa regola di larghezza",
  );
});

/**
 * La scheda del conto di incasso: marchio a sinistra, stato a destra, e a
 * capo quando non ci stanno. A 375 px il marchio e lo stato in riga fissa si
 * sovrapporrebbero al titolo.
 */
test("l'intestazione del conto di incasso va a capo", () => {
  assert.match(
    read("components/payments/ClubPaymentAccountPanel.tsx"),
    /flex flex-wrap items-center justify-between gap-3/,
    "titolo e marchio devono poter andare a capo",
  );
});

/**
 * A 1280 px, su un club multi-sede, «Nuovo atleta» era **tagliato**.
 *
 * E il difetto che si vede solo aprendo la pagina alla larghezza giusta con i
 * dati giusti: il filtro Gruppo aggiunto da RC Fix 2 ha portato a cinque i
 * blocchi della riga di intestazione, che a 1280 px ne chiedono piu di quanto
 * la riga ne abbia. Il gruppo delle azioni, senza `shrink-0`, veniva
 * compresso sotto la larghezza del suo contenuto — 173 px per 208 — e
 * `overflow-x-hidden` del contenitore principale tagliava il resto. Nessuno
 * scorrimento orizzontale comparso: solo un pulsante mozzato.
 *
 * A 1440 px ci stava, a 768 px la riga era gia in colonna: la fascia rotta
 * era esattamente quella che il collaudo dichiara di coprire.
 */
test("la riga di intestazione degli Atleti va a capo invece di tagliare le azioni", () => {
  /*
    Nel Web V2 la riga e la `PageHeader` delle fondamenta: contesto (sede,
    gruppo) e azioni stanno nello stesso blocco a destra del titolo, e l'
    invariante — «va a capo, non taglia» — vive li, una volta per tutte le
    pagine. Qui si verifica che l'elenco la usi e che le fondamenta la
    mantengano.
  */
  const source = read("app/athletes/page.tsx");
  assert.match(source, /<PageHeader/, "l'elenco usa l'intestazione di pagina del sistema");
  assert.match(source, /context=\{/, "sede e gruppo sono controlli di contesto dell'intestazione");
  assert.match(source, /actions=\{/, "l'azione principale sta nell'intestazione");

  const header = read("components/web/page/PageHeader.tsx");
  assert.match(
    header,
    /flex flex-wrap items-end justify-between/,
    "i blocchi della riga devono poter andare a capo",
  );
  assert.match(
    header,
    /flex flex-wrap gap-2 sm:shrink-0 items-center/,
    "il gruppo con l'azione principale non si comprime sotto il suo contenuto",
  );
});

/* --------------- Wave 5, lane 5I — le superfici della dashboard allenatore */

/**
 * **La dashboard allenatore entra negli invarianti.**
 *
 * Nella verifica voce per voce della Wave 5 questa riga diceva: «responsive
 * 375 px: corretto **di fatto**, zero invarianti a presidio». Cioe funzionava
 * perche nessuno lo aveva ancora rotto — che non e una garanzia, e la ragione
 * per cui esiste questo file.
 *
 * E la superficie con il maggior diritto a starci: un allenatore apre queste
 * pagine **in palestra, dal telefono**, per prendere le presenze mentre venti
 * ragazzi si cambiano. Non e il caso limite, e il caso normale.
 */
const TRAINER_DASHBOARD = [
  "components/trainer/trainer-dashboard-club-shell.tsx",
  "components/trainer/TrainerSidebar.tsx",
  "components/trainer/trainer-dashboard-shared.tsx",
  "components/trainer/trainer-dashboard-home-v2-page.tsx",
  "components/trainer/trainer-trainings-dashboard-page.tsx",
  "components/trainer/trainer-matches-dashboard-page.tsx",
  "components/trainer/trainer-athletes-dashboard-page.tsx",
  "components/trainer/trainer-athlete-profile-page.tsx",
  "components/trainer/trainer-weekly-schedule-panel.tsx",
  "components/trainer/trainer-board-dashboard-page.tsx",
  "components/trainer/trainer-documents-dashboard-page.tsx",
  "components/trainer/trainer-appointments-dashboard-page.tsx",
  "app/trainer-dashboard/notifications/page.tsx",
];

test("le pagine trainer-dashboard non restano a due colonne a 375 px", () => {
  const offenders = [];

  for (const file of TRAINER_DASHBOARD) {
    read(file)
      .split(/\r?\n/)
      .forEach((line, index) => {
        if (!/(?<![a-z:])grid-cols-[234]\b/.test(line)) return;
        /* Una barra di schede a due o tre etichette a 375 px ci sta. */
        if (line.includes("TabsList")) return;
        offenders.push(`${file}:${index + 1}`);
      });
  }

  assert.deepEqual(
    offenders,
    [],
    "usare grid-cols-1 sm:grid-cols-2: a 375 px due colonne non ci stanno",
  );
});

test("gli elenchi della dashboard allenatore scrollano nel proprio contenitore", () => {
  for (const file of TRAINER_DASHBOARD) {
    const source = read(file);
    const tables = source.match(/<table[\s\S]{0,400}?>/g) || [];
    if (!tables.length) continue;

    assert.match(
      source,
      /overflow-x-auto/,
      `${file}: una tabella senza contenitore scrollabile allarga il documento`,
    );
  }

  /*
    L'elenco dei certificati non e una `<table>` ma ha lo stesso difetto
    potenziale: nome dell'atleta, categoria, data e pastiglia di stato su una
    riga sola a 375 px. Scorre nel proprio contenitore invece di allargare la
    pagina.
  */
  assert.match(
    read("components/trainer/trainer-documents-dashboard-page.tsx"),
    /overflow-x-auto/,
  );
});

/**
 * **Una sezione raggiungibile solo dalla barra laterale non esiste su un
 * telefono.**
 *
 * `TrainerSidebar` e dentro un `hidden md:block`: sotto i 768 px la
 * navigazione e quella del `Header`. Le tre sezioni nuove — bacheca,
 * appuntamenti, documenti — devono comparire in **entrambe**, o l'allenatore
 * che apre l'applicazione dal campo non le trova.
 */
test("le sezioni nuove sono raggiungibili anche sotto i 768 px", () => {
  const shell = read("components/trainer/trainer-dashboard-club-shell.tsx");

  for (const voce of ["board", "appointments", "documents"]) {
    assert.match(
      shell,
      new RegExp(
        `TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY\.${voce}`,
      ),
      `${voce}: manca dal menu mobile, quindi da un telefono la sezione non si raggiunge`,
    );
  }
});

test("i comandi di un appuntamento vanno a capo invece di uscire", () => {
  const source = read(
    "components/trainer/trainer-appointments-dashboard-page.tsx",
  );

  /*
    Conferma, Riprogramma e Rifiuta sono tre pulsanti con icona: a 375 px in
    riga fissa il terzo esce dal contenitore, e il terzo e quello che chiude la
    richiesta.
  */
  assert.match(source, /flex flex-wrap gap-2/);
  assert.match(
    source,
    /w-full justify-center gap-2 rounded-2xl sm:w-auto/,
    "il comando «Aggiorna» occupa la riga finche c'e poco spazio",
  );
});

/* ----------------- Wave 5, lane 5H e 5G — le superfici dell'area famiglia */

/**
 * **L'area famiglia entra negli invarianti.**
 *
 * La lane 5I aveva portato qui la dashboard allenatore; quella della famiglia
 * era rimasta fuori, e ha lo stesso diritto di starci per la stessa ragione:
 * un genitore non apre EasyGame da una scrivania. Accetta un consenso mentre
 * accompagna il figlio, legge un avviso in bacheca a un semaforo, scarica una
 * ricevuta dal telefono. La larghezza normale di queste pagine e 375 px, non
 * 1280.
 *
 * Vale l'avvertenza di tutto il file: sono test statici, non sostituiscono
 * l'apertura a 375 px. Presidiano la classe di difetti che si scrive senza
 * accorgersene.
 *
 * `parent-dashboard-pages.tsx` era **fuori** da questo elenco, con una nota
 * che diceva perche: era anteriore alla Wave 5, che ne aveva cambiato la sola
 * pagina Pagamenti, e presidiare tremila righe mai riscritte sarebbe stato
 * presidiare codice che nessuno aveva guardato.
 *
 * PP-02 ne ha cambiate **915**. La ragione della nota e scaduta, e il file e
 * adesso la superficie piu grande dell'area famiglia: ci vivono la scheda
 * atleta, i moduli online, le prenotazioni e il checkout, cioe le schermate
 * che una famiglia apre dal telefono. Oggi non ha nessuna violazione — e il
 * momento giusto per metterlo sotto presidio, perche domani ne avra una e
 * nessuno se ne accorgera.
 */
const PARENT_DASHBOARD = [
  "components/parent-dashboard/parent-dashboard-pages.tsx",
  "components/parent-dashboard/parent-family-pages.tsx",
  "components/parent-dashboard/parent-dashboard-shell.tsx",
  "components/parent-dashboard/ParentSidebar.tsx",
  "components/payments/EnrollmentPaymentBreakdown.tsx",
  /*
    La pagina pubblica della ricevuta di iscrizione. Non e dentro l'area
    famiglia — non ha sessione ne chrome — ma e la superficie **piu** mobile
    del prodotto insieme al link di pagamento: si apre da un messaggio, e la
    larghezza normale e quella del telefono su cui il messaggio e arrivato.
  */
  "components/enrollment/PublicEnrollmentStatusPage.tsx",
];

test("le pagine dell'area famiglia non restano a due colonne a 375 px", () => {
  const offenders = [];

  for (const file of PARENT_DASHBOARD) {
    read(file)
      .split(/\r?\n/)
      .forEach((line, index) => {
        if (!/(?<![a-z:])grid-cols-[234]\b/.test(line)) return;
        /* Una barra di schede a due o tre etichette a 375 px ci sta. */
        if (line.includes("TabsList")) return;
        offenders.push(`${file}:${index + 1}`);
      });
  }

  assert.deepEqual(
    offenders,
    [],
    "usare grid-cols-1 sm:grid-cols-2: a 375 px due colonne non ci stanno",
  );
});

test("gli elenchi dell'area famiglia scrollano nel proprio contenitore", () => {
  for (const file of PARENT_DASHBOARD) {
    const source = read(file);
    const tables = source.match(/<table[\s\S]{0,400}?>/g) || [];
    if (!tables.length) continue;

    assert.match(
      source,
      /overflow-x-auto/,
      `${file}: una tabella senza contenitore scrollabile allarga il documento`,
    );
  }
});

/**
 * **Le cinque voci nuove devono esistere in due elenchi, non in uno.**
 *
 * `ParentSidebar` sta dentro un `hidden md:block`: sotto i 768 px non e
 * montata, e la navigazione e quella del `Header`, che riceve le proprie voci
 * da `mobileNavSections` nel guscio. I due elenchi sono duplicati a mano — e
 * questo il motivo dell'invariante: aggiungere una sezione ricordandosi di uno
 * solo dei due la rende irraggiungibile esattamente sul dispositivo da cui una
 * famiglia entra piu spesso.
 *
 * La terza verifica e la piu banale e la piu costosa se salta: la rotta deve
 * esistere. Una voce di menu verso una pagina che non c'e e un 404 con
 * l'aspetto di una funzione.
 */
test("le sezioni nuove della famiglia sono raggiungibili anche sotto i 768 px", () => {
  const sidebar = read("components/parent-dashboard/ParentSidebar.tsx");
  const shell = read("components/parent-dashboard/parent-dashboard-shell.tsx");

  for (const voce of [
    "calendar",
    "enrollment",
    "consents",
    "board",
    "notifications",
  ]) {
    const href = new RegExp(`\\$\\{basePath\\}/${voce}\``);

    assert.match(
      sidebar,
      href,
      `${voce}: manca dalla barra laterale, quindi da un tablet o da un desktop la sezione non si raggiunge`,
    );
    assert.match(
      shell,
      href,
      `${voce}: manca dal menu mobile, quindi da un telefono la sezione non si raggiunge`,
    );
    assert.equal(
      existsSync(path.join(SRC, "app", "parent-view", "[id]", voce, "page.tsx")),
      true,
      `${voce}: la voce di menu punta a una rotta che non esiste`,
    );
  }
});

/**
 * Il guscio della famiglia e un elemento flex dentro una riga, come quello del
 * club, e aveva `min-h-0` dove serve `min-w-0`: sono assi diversi.
 *
 * `overflow-hidden` da solo non basta — misurato su `/organization`, dove la
 * barra delle schede allargava il guscio a 1022 px invece di scorrere. Qui il
 * taglio c'era e la larghezza minima no, cioe la meta che non si vede finche
 * non arriva un contenuto largo.
 */
test("il guscio della famiglia non cresce con il proprio contenuto", () => {
  assert.match(
    read("components/parent-dashboard/parent-dashboard-shell.tsx"),
    /className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"/,
    "senza min-w-0 il guscio si allarga con il contenuto invece di lasciarlo scorrere",
  );
});

/**
 * **La riga della ricevuta, che la Wave 5 ha portato da due blocchi a tre.**
 *
 * «Scarica» e nato accanto all'importo perche una famiglia vedeva la somma
 * versata e non poteva stampare la carta che lo dimostra. Il contenitore
 * dell'elenco ha `overflow-hidden`: quando la riga non ci sta, il pulsante non
 * sporge — viene **tagliato**, e la ricevuta torna a non essere scaricabile.
 * A 375 px basta una descrizione con una parola lunga.
 */
test("la riga di una ricevuta va a capo invece di tagliare «Scarica»", () => {
  /*
    PP-02 §E. La riga e passata da tre blocchi a quattro — si sono aggiunti il
    figlio, il numero e lo stato — e da una riga sola a tre impilate. La
    proprieta non cambia: dentro un contenitore con `overflow-hidden` niente
    deve stare su una riga rigida, altrimenti non sporge, viene **tagliato**.
  */
  const source = read("components/parent-dashboard/parent-dashboard-pages.tsx");

  assert.match(
    source,
    /className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"/,
    "descrizione e importo su una riga fissa non stanno a 375 px",
  );
  assert.match(
    source,
    /className="flex flex-wrap gap-2"/,
    "«Visualizza» e «Scarica» devono poter andare a capo",
  );
});

/**
 * I due comandi di un consenso — «Accetto» e «Revoco» — hanno entrambi
 * un'icona, e il secondo e l'unico modo che una famiglia ha di cambiare idea
 * senza telefonare al club. Se esce dal riquadro, la revoca non si puo premere.
 */
test("i comandi di un consenso vanno a capo invece di uscire", () => {
  const source = read("components/parent-dashboard/parent-family-pages.tsx");

  assert.match(source, /className="mt-3 flex flex-wrap gap-2"/);
  assert.match(
    source,
    /flex flex-wrap items-start justify-between gap-3/,
    "titolo del consenso e pastiglia di stato devono poter andare a capo",
  );
});

/**
 * Il pulsante «Paga ora» del riepilogo iscrizione: la Wave 5 lo ha acceso, e
 * un pulsante acceso che a 375 px non si preme non vale piu di uno spento.
 * Occupa la riga finche c'e poco spazio, e i quattro riquadri dei totali
 * partono da una colonna.
 */
test("il riepilogo dell'iscrizione parte da una colonna e il comando occupa la riga", () => {
  const source = read("components/payments/EnrollmentPaymentBreakdown.tsx");

  assert.match(source, /className="w-full md:w-auto"/);
  assert.match(
    source,
    /grid grid-cols-1 gap-3 md:grid-cols-4/,
    "quattro totali affiancati a 375 px non ci stanno",
  );
});
