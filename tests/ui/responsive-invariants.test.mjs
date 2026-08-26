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
  "app/staff/[id]/page.tsx",
  "app/soci/[id]/page.tsx",
  "app/organization/page.tsx",
  "components/forms/AthleteQuickCreateDialog.tsx",
  "components/forms/phone-field.tsx",
  "components/forms/certificate-attachment-field.tsx",
  "components/forms/document-extraction-field.tsx",
  "components/athletes/profile/athlete-profile-header.tsx",
  "components/athletes/profile/athlete-profile-tabs.tsx",
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

test("l'intestazione della scheda atleta impila le azioni sotto md", () => {
  const source = read("components/athletes/profile/athlete-profile-header.tsx");

  assert.match(
    source,
    /flex flex-col md:flex-row/,
    "foto, nome e tre pulsanti non stanno su una riga a 375 px",
  );
  assert.match(
    source,
    /flex-1 md:flex-none/,
    "i pulsanti devono occupare la larghezza quando sono impilati",
  );
});

test("le sette sezioni della scheda atleta scorrono invece di andare a capo", () => {
  const source = read("components/athletes/profile/athlete-profile-tabs.tsx");

  assert.match(source, /overflow-x-auto/);
  assert.match(
    source,
    /flex-nowrap/,
    "sette sezioni su due righe spingono il contenuto sotto la piega",
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
 * `min-width: auto`, cioe **si rifiuta di restringersi sotto la larghezza del
 * suo contenuto** — a meno che non abbia `overflow` diverso da `visible`,
 * oppure `min-width: 0`.
 *
 * Quarantanove pagine usano la variante `overflow-hidden` e ottengono il
 * comportamento giusto per caso. Quattro usano la variante `lg:hidden`, senza
 * ne l'uno ne l'altro: li il guscio cresce con il contenuto.
 *
 * A 768 px su `/organization` l'effetto era che la barra delle nove schede —
 * che ha gia `overflow-x-auto` e dovrebbe scorrere da sola — allargava il
 * guscio a 1022 px invece di scorrere, e con lui **tutta la pagina**:
 * «Salva Modifiche» finiva fuori dallo schermo. Nessuna invariante statica
 * poteva vederlo, perche ogni singola classe era corretta; sbagliato era cio
 * che mancava, e si e visto solo misurando la pagina a 768 px.
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

    assert.equal(
      /className="flex flex-1 flex-col lg:hidden"/.test(source),
      false,
      `${file}: il guscio senza min-w-0 si allarga con il contenuto invece di lasciarlo scorrere`,
    );
    assert.match(
      source,
      /className="flex min-w-0 flex-1 flex-col lg:hidden"/,
      `${file}: manca min-w-0 sul guscio del club`,
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
  for (const file of ["app/soci/page.tsx", "app/trainers/page.tsx"]) {
    const source = read(file);

    assert.match(
      source,
      /flex[^"]*flex-wrap[^"]*gap-2|flex gap-2 w-full sm:w-auto flex-wrap/,
      `${file}: i comandi dell'intestazione non vanno a capo`,
    );
  }
});

/**
 * Sulla scheda allenatore i comandi dei contratti stanno in colonna.
 *
 * A 375 px «Visualizza Tutti» e «Aggiungi Contratto» in riga arrivavano a
 * x=402: il secondo era fuori dallo schermo e non si poteva premere.
 */
test("i comandi dei contratti dell'allenatore stanno nello schermo", () => {
  const source = read("app/trainers/[id]/page.tsx");

  assert.match(
    source,
    /className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"/,
    "i due comandi dei contratti tornano in riga a 375 px",
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
    ["app/dashboard/page.tsx", /grid-cols-\[minmax\(0,1fr\)\][\s\S]{0,80}xl:grid-cols-\[minmax\(0,1fr\)_320px\]/],
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
    read("app/dashboard/page.tsx"),
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
    ["app/registration-management/page.tsx", /<TabsList className="mb-4 w-full justify-start overflow-x-auto/],
    ["app/medical/page.tsx", /<TabsList className="w-full justify-start overflow-x-auto/],
    ["app/modulistica/page.tsx", /<TabsList className="h-auto w-full flex-wrap/],
  ];

  for (const [file, pattern] of casi) {
    assert.match(
      read(file),
      pattern,
      `${file}: le schede oltre la terza erano tagliate via, cioe irraggiungibili da un telefono`,
    );
  }
});

test("i comandi di intestazione vanno a capo prima di uscire", () => {
  assert.match(
    read("components/dashboard/shared-page-header.tsx"),
    /flex flex-wrap gap-2 sm:shrink-0/,
    "`shrink-0` sotto sm faceva sporgere di qualche pixel un pulsante con etichetta lunga",
  );
  assert.match(
    read("app/matches/page.tsx"),
    /flex flex-col items-start gap-3 sm:flex-row/,
    "i tre pulsanti della settimana non stanno accanto al titolo a 375 px",
  );
});

test("esiste un guscio solo, e Modulistica usa quello", () => {
  const modulistica = read("app/modulistica/page.tsx");

  assert.match(modulistica, /<MobileTopBar \/>/);
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
