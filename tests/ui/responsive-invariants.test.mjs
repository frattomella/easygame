import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
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
