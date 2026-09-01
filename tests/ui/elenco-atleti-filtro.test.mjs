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

  assert.match(
    sorgente,
    /const filteredAthletes = paginated\s*\n\s*\? athletes\.filter\(matchesStatusFilter\)/,
    "il ramo paginato deve applicarlo: e cio che toglie il lampo iniziale",
  );

  assert.equal(
    /const filteredAthletes = paginated\s*\n\s*\? athletes\s*\n/.test(sorgente),
    false,
    "il ramo paginato non puo restituire le righe cosi come sono arrivate",
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

test("W6-04 · l'elenco offre un filtro per ognuno dei quattro stati", () => {
  const sorgente = leggi(ELENCO);

  for (const stato of ATHLETE_STATUSES) {
    assert.ok(
      sorgente.includes(`setStatusFilter("${stato}")`),
      `manca il filtro per lo stato ${stato}`,
    );
  }

  assert.ok(
    sorgente.includes('setStatusFilter("all")'),
    "manca il filtro «tutti»",
  );

  /*
    Le due etichette che prima valevano per lo stesso valore devono ora venire
    dal vocabolario, dove non possono ripetersi.
  */
  assert.ok(sorgente.includes("ATHLETE_STATUS_PLURAL_LABELS.loan"));
  assert.ok(sorgente.includes("ATHLETE_STATUS_PLURAL_LABELS.inactive"));
  assert.notEqual(
    ATHLETE_STATUS_PLURAL_LABELS.loan,
    ATHLETE_STATUS_PLURAL_LABELS.inactive,
  );
});

test("W6-04 · l'elenco non tiene una copia propria del vocabolario", () => {
  const sorgente = leggi(ELENCO);

  assert.match(
    sorgente,
    /from "@\/lib\/athletes\/status"/,
    "il vocabolario ha un proprietario, e le schermate lo importano",
  );

  for (const scritta of [
    '"In Prestito"',
    '"Disattivati"',
    '"Atleti in Prestito"',
    '"Atleti Attivi"',
  ]) {
    assert.equal(
      sorgente.includes(scritta),
      false,
      `${scritta} scritta a mano: e cosi che tre stati diventavano quattro etichette`,
    );
  }
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
  for (const file of [ELENCO, SCHEDA]) {
    const sorgente = leggi(file);
    assert.ok(
      sorgente.includes("Eliminare questo atleta?"),
      `${file}: manca il dialogo di conferma sulla cancellazione dell'atleta`,
    );
    assert.ok(
      sorgente.includes("certificati medici collegati"),
      `${file}: la conferma deve nominare le conseguenze`,
    );
  }
});
