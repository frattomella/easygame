import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  ATHLETE_STATUSES,
  ATHLETE_STATUS_PLURAL_LABELS,
} from "../../src/lib/athletes/status.ts";

/**
 * **W6-01 · W6-02 · W6-03 · W6-07 — l'elenco Atleti.**
 *
 * Il difetto che il cliente descriveva era doppio, e le due meta avevano cause
 * diverse:
 *
 * 1. *«entrando si vedono tutti per pochi millisecondi, poi restano solo gli
 *    attivi»* — il primo caricamento chiede una pagina **senza filtri**, perche
 *    deve misurare quanto e grande l'archivio; la ricarica filtrata arriva un
 *    quarto di secondo dopo. In quella finestra la pagina disegnava tutti gli
 *    stati.
 * 2. *«cambiando filtro su sospesi o disattivati appaiono 0 risultati pur
 *    esistendo»* — questo era peggio, ed era una **retroazione**. `paginated`
 *    era `listMeta.total > listMeta.limit` su un `meta` che arriva anche dalle
 *    chiamate filtrate. Filtrando «Sospesi» su un club grande il server
 *    rispondeva trenta righe su un limite di duecento, `paginated` diventava
 *    falso, e l'effetto che ricarica — che comincia con `if (!paginated)
 *    return` — **si spegneva da solo**. Da quel momento nessuna richiesta
 *    partiva piu, e ogni filtro successivo girava in memoria sui trenta
 *    sospesi rimasti in mano.
 *
 * Un test statico non apre la pagina. Verifica pero le **proprieta strutturali
 * che rendono quei difetti impossibili**, e sono le tre che seguono: la misura
 * dell'archivio non viene dal filtro, il vaglio di stato si applica sempre, e
 * il nome di un'azione non finisce in una colonna di stato.
 *
 * Il giro end-to-end sui quattro stati con ricarica e cambio filtro sta in
 * `scripts/wave-6-uat.mjs`, contro un database vero.
 */

const SRC = path.join(process.cwd(), "src");
const leggi = (relativo) =>
  readFileSync(path.join(SRC, ...relativo.split("/")), "utf8");

const ELENCO = "app/athletes/page.tsx";
const SCHEDA = "app/athletes/[id]/page.tsx";

test("W6-01 · la dimensione dell'archivio non si legge da una risposta filtrata", () => {
  const sorgente = leggi(ELENCO);

  assert.match(
    sorgente,
    /const paginated = \(archiveTotal \?\? 0\) > ATHLETE_PAGE_SIZE;/,
    "`paginated` deve dipendere dall'archivio, non dal totale filtrato",
  );

  assert.equal(
    /const paginated = Boolean\(listMeta/.test(sorgente),
    false,
    "e la forma che si spegneva da sola quando un filtro restringeva sotto la soglia",
  );

  /*
    `archiveTotal` puo essere scritto in un punto solo: il caricamento senza
    filtri. Se lo scrivesse anche `loadAthletePage`, che e filtrata, la
    retroazione tornerebbe identica con un nome nuovo.
  */
  const scritture = sorgente.match(/setArchiveTotal\(/g) || [];
  assert.equal(
    scritture.length,
    1,
    "solo il caricamento iniziale, che e l'unico senza filtri, misura l'archivio",
  );

  const dentroPaginaFiltrata = sorgente
    .slice(
      sorgente.indexOf("const loadAthletePage"),
      sorgente.indexOf("// Load athletes and categories from database"),
    )
    .includes("setArchiveTotal(");
  assert.equal(
    dentroPaginaFiltrata,
    false,
    "la chiamata filtrata non deve poter ridefinire quanto e grande l'archivio",
  );
});

test("W6-02 · il vaglio di stato si applica anche quando comanda il server", () => {
  const sorgente = leggi(ELENCO);

  assert.match(
    sorgente,
    /const matchesStatusFilter = \(athlete: Athlete\) =>/,
    "serve un vaglio di stato condiviso fra i due rami",
  );

  /*
    Nel Web V2 le righe passano al DataGrid da `filteredAthletes`, che e un
    `useMemo`: dentro, il ramo paginato vaglia lo stato prima di tutto il
    resto (sede e gruppo). Sotto la soglia lo stato lo filtra la griglia con
    la vista «Attivi».
  */
  assert.match(
    sorgente,
    /const inStato = paginated\s*\n\s*\? athletes\.filter\(matchesStatusFilter\)/,
    "il ramo paginato deve applicarlo: e cio che toglie il lampo iniziale",
  );

  assert.equal(
    /const inStato = paginated\s*\n\s*\? athletes\s*\n/.test(sorgente),
    false,
    "il ramo paginato non puo restituire le righe cosi come sono arrivate",
  );

  assert.match(
    sorgente,
    /rows=\{filteredAthletes\}/,
    "la griglia riceve le righe gia vagliate, non `athletes`",
  );
});

test("W6-03 · nessuna schermata scrive il nome di un'azione dentro lo stato", () => {
  const sorgente = leggi(ELENCO);

  assert.equal(
    sorgente.includes("status: pendingBulkAction.action"),
    false,
    "e la riga che metteva `activate` in archivio e faceva sparire l'atleta da ogni filtro",
  );

  assert.match(
    sorgente,
    /ATHLETE_BULK_STATUS_ACTIONS\[/,
    "la traduzione azione -> stato deve essere esplicita",
  );
});

test("W6-04 · l'elenco offre un filtro per ognuno dei quattro stati", async () => {
  const sorgente = leggi(ELENCO);

  /*
    Nel Web V2 il filtro di stato ha due sedi, e in tutte e due si **itera
    sul vocabolario** invece di scrivere quattro pulsanti a mano — che era
    esattamente il modo in cui tre stati erano diventati quattro etichette.

    1. Sotto la soglia di paginazione: le viste di sistema della griglia,
       una per stato, piu «Tutti» che la griglia mette sempre per prima.
    2. Sopra la soglia: la banda d'archivio dentro il pannello, con un
       segmento per stato piu «Tutti», che comanda la query del server.
  */
  const { ATHLETE_STATUS_VIEWS } = await import(
    "../../src/components/athletes/v2/athlete-grid-model.ts"
  );
  for (const stato of ATHLETE_STATUSES) {
    const vista = ATHLETE_STATUS_VIEWS.find(
      (view) => view.filters.stato === stato,
    );
    assert.ok(vista, `manca la vista per lo stato ${stato}`);
    assert.equal(vista.label, ATHLETE_STATUS_PLURAL_LABELS[stato]);
  }
  assert.equal(
    ATHLETE_STATUS_VIEWS.filter((view) => view.isDefault).map((v) => v.filters.stato).join(","),
    "active",
    "«Attivi» e la vista di partenza, come il filtro della V1",
  );

  assert.match(
    sorgente,
    /ATHLETE_STATUSES\.map\(\(stato\) => \(\{\s*value: stato,\s*label: ATHLETE_STATUS_PLURAL_LABELS\[stato\],/,
    "la banda d'archivio offre un segmento per stato, dal vocabolario",
  );
  assert.match(
    sorgente,
    /\{ value: "all", label: "Tutti" \}/,
    "manca il filtro «tutti»",
  );
  assert.match(
    sorgente,
    /status: statusFilter,/,
    "lo stato scelto nella banda deve viaggiare nella query del server",
  );

  /*
    Le due etichette che prima valevano per lo stesso valore devono ora venire
    dal vocabolario, dove non possono ripetersi.
  */
  assert.notEqual(
    ATHLETE_STATUS_PLURAL_LABELS.loan,
    ATHLETE_STATUS_PLURAL_LABELS.inactive,
  );
});

test("W6-04 · l'elenco non tiene una copia propria del vocabolario", async () => {
  const sorgente = leggi(ELENCO);

  assert.match(
    sorgente,
    /from "@\/lib\/athletes\/status"/,
    "il vocabolario ha un proprietario, e le schermate lo importano",
  );

  /*
    **Il controllo cercava le virgolette, e il difetto era in un `<span>`**
    (PP-01 §D).

    L'ultima copia del vocabolario non stava in una stringa fra virgolette: era
    testo JSX — `<span>In Prestito</span>` — e questo elenco, che confrontava
    `'"In Prestito"'`, ci passava accanto senza vederlo. La cella dell'elenco ha
    continuato per tutta la Wave 6 a stampare «In Prestito» per `inactive` e
    «Sospeso» per `loan`: i due stati **scambiati**, in bella vista, sotto un
    presidio verde.

    Adesso si cerca la scritta, non la sua punteggiatura, e lo si fa **fuori dai
    commenti**, perche la prosa che racconta il difetto lo nomina apposta.
  */
  const codice = sorgente
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  for (const scritta of [
    "In Prestito",
    "Atleti in Prestito",
    "Atleti Attivi",
  ]) {
    assert.equal(
      codice.includes(scritta),
      false,
      `«${scritta}» scritta a mano: e cosi che tre stati diventavano quattro etichette`,
    );
  }

  /*
    E il verso positivo: la cella **deve** leggere il vocabolario. Vietare le
    scritte sbagliate non basta — un quinto stato scritto a mano domani non
    somiglierebbe a nessuna di quelle.

    Nel Web V2 la cella e una `StatusPill`, e l'etichetta viene dal sistema
    di stato (`src/lib/web/status.ts`) attraverso **una** mappa dai quattro
    stati dell'atleta alle quattro pillole — `ATHLETE_STATUS_PILL`, chiusa
    sul tipo `AthleteStatus`, quindi un quinto stato non compila finche non
    ha la sua pillola. L'export, invece, continua a scrivere l'etichetta
    della V1 (`ATHLETE_STATUS_LABELS`), cosi un CSV di ieri e uno di oggi si
    leggono uguali.
  */
  const colonne = leggi("components/athletes/v2/athletes-grid-columns.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.ok(
    colonne.includes("ATHLETE_STATUS_PILL[row.status]"),
    "la riga dell'elenco prende la pillola dalla mappa, non da un ternario",
  );
  assert.ok(
    colonne.includes("ATHLETE_STATUS_LABELS[row.status]"),
    "l'export prende l'etichetta dal vocabolario",
  );
  for (const scritta of ["In Prestito", "Atleti in Prestito", "Atleti Attivi"]) {
    assert.equal(colonne.includes(scritta), false, `«${scritta}» scritta a mano nelle colonne`);
  }

  const { ATHLETE_STATUS_PILL } = await import(
    "../../src/components/athletes/v2/athlete-grid-model.ts"
  );
  const { PERSON_STATUS } = await import("../../src/lib/web/status.ts");
  assert.deepEqual(
    Object.keys(ATHLETE_STATUS_PILL).sort(),
    [...ATHLETE_STATUSES].sort(),
    "una pillola per ognuno dei quattro stati, e nessuna in piu",
  );
  assert.equal(ATHLETE_STATUS_PILL.loan, PERSON_STATUS.on_loan);
  assert.equal(ATHLETE_STATUS_PILL.inactive, PERSON_STATUS.inactive);
  assert.notEqual(
    ATHLETE_STATUS_PILL.loan.label,
    ATHLETE_STATUS_PILL.inactive.label,
    "«In prestito» e «Disattivato» sono due pillole diverse: era lo scambio W6-04",
  );
});

test("W6-07 · una cancellazione irreversibile non passa dal confirm del browser", () => {
  for (const file of [ELENCO, SCHEDA]) {
    const sorgente = leggi(file);
    /*
      Si guardano solo le righe di codice: la prosa che *racconta* il difetto
      nomina `confirm()` apposta, e non deve far fallire il presidio.
    */
    const senzaCommenti = sorgente
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const nativi = senzaCommenti
      .split("\n")
      .filter((riga) => /(^|[^.\w])confirm\s*\(/.test(riga));

    assert.equal(
      nativi.length,
      0,
      `${file}: conferma nativa in "${nativi.map((r) => r.trim()).join(" | ")}". Il browser puo sopprimerla, e in una webview puo non comparire affatto: l'operazione irreversibile partirebbe senza che nessuno abbia confermato`,
    );
  }
});

test("W6-07 · la conferma dice cosa si perde, non solo che e irreversibile", () => {
  const elenco = leggi(ELENCO);
  assert.ok(
    elenco.includes("Eliminare questo atleta?"),
    `${ELENCO}: manca il dialogo di conferma sulla cancellazione dell'atleta`,
  );
  assert.ok(
    elenco.includes("certificati medici collegati"),
    `${ELENCO}: la conferma deve nominare le conseguenze`,
  );

  /*
    La scheda V2 usa il modale distruttivo del sistema (08 §8.9): il titolo
    nomina la persona e il blocco rosso elenca **cosa se ne va**.
  */
  const scheda = leggi(SCHEDA);
  assert.ok(
    scheda.includes("title: `Eliminare ${nome}?`"),
    `${SCHEDA}: manca il dialogo di conferma sulla cancellazione dell'atleta`,
  );
  assert.ok(
    scheda.includes("consequences: ["),
    `${SCHEDA}: la conferma deve nominare le conseguenze`,
  );
});
