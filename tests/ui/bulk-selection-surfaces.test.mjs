import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Selezione multipla e azioni di massa sugli elenchi di persone
 * (RC Fix 2, punti 6-10).
 *
 * L'elenco Atleti aveva il pattern maturo; allenatori, staff e soci avevano
 * l'export PDF e basta — e quell'export prendeva **sempre tutto**. Questi test
 * elencano le tre superfici una per una, come
 * `anagrafiche-coverage.test.mjs`: un elenco esplicito e piu noioso di una
 * regola generica, ed e l'unico modo perche una quarta schermata di persone
 * non nasca senza selezione.
 */

const SRC = path.join(process.cwd(), "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8");

/**
 * Gli elenchi V1 che selezionano e agiscono sulla selezione. Vuoto dalla
 * Wave D: anche i soci sono passati al `DataGrid`. L'elenco resta perche una
 * quarta schermata di persone nata fuori dalla griglia deve venire qui.
 */
const SELECTION_SURFACES = [];

/**
 * Gli elenchi migrati al Web V2: la selezione, la casella «tutti visibili»,
 * l'ambito di export e la barra delle azioni sono del `DataGrid` condiviso
 * (guideline 07 §7.7, §7.10). Le stesse invarianti si leggono nella
 * configurazione della griglia, non in una copia per pagina.
 */
const GRID_SURFACES = [
  ["app/trainers/page.tsx", "elenco allenatori"],
  ["app/staff/page.tsx", "elenco staff"],
  ["app/soci/page.tsx", "elenco soci"],
];

test("i tre elenchi usano la selezione condivisa, non una copia per pagina", () => {
  for (const [file, label] of SELECTION_SURFACES) {
    const source = read(file);

    assert.match(
      source,
      /useListSelection\(\)/,
      `${label} (${file}): la selezione deve venire dal componente condiviso`,
    );
    assert.match(
      source,
      /<BulkSelectionToolbar/,
      `${label} (${file}): manca la barra delle azioni sulla selezione`,
    );
    assert.match(
      source,
      /<SelectRowCheckbox/,
      `${label} (${file}): manca la casella di riga`,
    );
  }

  for (const [file, label] of GRID_SURFACES) {
    const source = read(file);

    assert.match(
      source,
      /<DataGrid/,
      `${label} (${file}): l'elenco deve essere il DataGrid condiviso`,
    );
    assert.match(
      source,
      /bulkActions=\{bulkActions\}/,
      `${label} (${file}): le azioni sulla selezione passano dalla barra della griglia`,
    );
    assert.match(
      source,
      /onSelectionChange=\{setSelectedIds\}/,
      `${label} (${file}): la selezione e controllata dalla pagina, cosi si ripulisce alla rilettura`,
    );
  }
});

/**
 * «Seleziona tutti visibili» dove le righe stanno in una tabella.
 *
 * Allenatori, staff e soci sono passati al `DataGrid`, che monta la casella
 * di testata da se (`aria-label="Seleziona la pagina"`): per questo i loro
 * file non compaiono e l'elenco delle tabelle V1 e vuoto.
 */
test("dove c'e una tabella c'e la casella «seleziona tutti visibili»", () => {
  for (const [file] of SELECTION_SURFACES) {
    assert.match(
      read(file),
      /<SelectAllCheckbox/,
      `${file}: senza la casella in testa si seleziona una riga per volta`,
    );
  }
});

/**
 * L'export sceglie l'ambito, e non stampa tutto per abitudine.
 *
 * E il difetto concreto: chi ne aveva scelti quattro otteneva quaranta pagine.
 */
test("l'export dei tre elenchi passa dagli ambiti condivisi", () => {
  for (const [file, label] of SELECTION_SURFACES) {
    const source = read(file);

    assert.match(
      source,
      /availableExportScopes\(/,
      `${label} (${file}): gli ambiti di export vanno decisi dal modulo condiviso`,
    );
    assert.match(
      source,
      /resolveScopeRows\(/,
      `${label} (${file}): le righe da esportare vanno risolte dal modulo condiviso`,
    );
    /*
      Il PDF deve dire su cosa e stato generato — e deve dirlo **con la stessa
      voce della barra di selezione**. Finche ogni pagina scriveva la frase a
      mano, tre pagine su tre sbagliavano il plurale a uno e i Soci non
      avevano nemmeno il caso del risultato filtrato.
    */
    assert.match(
      source,
      /^\s*scope,\s*$/m,
      `${label} (${file}): l'ambito si passa, la frase la costruisce person-export`,
    );
    assert.doesNotMatch(
      source,
      /scopeLabel:/,
      `${label} (${file}): l'intestazione del PDF non si riscrive nella pagina`,
    );
  }

  for (const [file, label] of GRID_SURFACES) {
    const source = read(file);

    assert.match(
      source,
      /export=\{\{ onExport/,
      `${label} (${file}): l'export vive nel menu «Esporta» della griglia`,
    );
    assert.match(
      source,
      /requestScope === "selected" \? "selected"/,
      `${label} (${file}): «selezionati» significa esattamente i selezionati`,
    );
    assert.match(
      source,
      /^\s*scope,\s*$/m,
      `${label} (${file}): l'ambito si passa, la frase la costruisce person-export`,
    );
    assert.doesNotMatch(
      source,
      /scopeLabel:/,
      `${label} (${file}): l'intestazione del PDF non si riscrive nella pagina`,
    );
  }
});

/**
 * Una selezione che tiene l'id di una riga sparita mostra un conteggio che
 * non corrisponde a niente, e un'azione di massa su quell'id fallisce senza
 * spiegazioni.
 */
test("ogni elenco ripulisce la selezione quando rilegge le righe", () => {
  for (const [file, label] of SELECTION_SURFACES) {
    assert.match(
      read(file),
      /selection\.prune\(/,
      `${label} (${file}): la selezione va ripulita di cio che non esiste piu`,
    );
  }

  for (const [file, label] of GRID_SURFACES) {
    assert.match(
      read(file),
      /setSelectedIds\(\(current\) => new Set\(Array\.from\(current\)\.filter\(/,
      `${label} (${file}): la selezione va ripulita di cio che non esiste piu`,
    );
  }
});

/**
 * Le azioni sono quelle del dominio, non quelle degli atleti copiate.
 *
 * In particolare: **nessuna eliminazione di massa** su queste tre schermate.
 * Non e stata chiesta, e cancellare dieci anagrafiche in un clic e
 * l'operazione con il rapporto peggiore fra gesto e conseguenza.
 */
test("nessun elenco di persone ha preso l'eliminazione di massa dagli atleti", () => {
  for (const [file, label] of SELECTION_SURFACES) {
    const source = read(file);
    const toolbar = source.slice(
      source.indexOf("<BulkSelectionToolbar"),
      source.indexOf("</BulkSelectionToolbar>"),
    );

    assert.ok(toolbar.length > 0, `${label}: barra non trovata`);
    assert.equal(
      /Elimina/i.test(toolbar),
      false,
      `${label} (${file}): la barra della selezione non deve offrire l'eliminazione di massa`,
    );
  }

  for (const [file, label] of GRID_SURFACES) {
    const source = read(file);
    const start = source.indexOf("useMemo<BulkActionDef");
    const block = source.slice(start, source.indexOf("]);", start));

    assert.ok(block.length > 0, `${label}: azioni di massa non trovate`);
    assert.equal(
      /Elimina/i.test(block),
      false,
      `${label} (${file}): le azioni di massa non devono offrire l'eliminazione`,
    );
    assert.equal(
      /tone: "danger"/.test(block),
      false,
      `${label} (${file}): nessuna azione di massa distruttiva`,
    );
  }
});

/**
 * L'assegnazione degli allenatori ragiona per **gruppo operativo** dove i
 * gruppi esistono (RC Fix 2, punto 15).
 *
 * Assegnare per categoria su un club multi-sede metterebbe l'allenatore su
 * tutte le squadre di quella categoria — Roma **e** Aprilia — che e
 * esattamente cio che il modello dei gruppi esiste per evitare.
 */
test("l'assegnazione di massa degli allenatori non attraversa le sedi", () => {
  const source = read("app/trainers/page.tsx");

  assert.match(
    source,
    /assignByGroup/,
    "l'assegnazione deve distinguere il club multi-sede da quello con una sede sola",
  );
  assert.match(
    source,
    /getActiveCategoryGroups\(/,
    "i gruppi assegnabili vanno presi dal modello, non dedotti dai nomi",
  );
  assert.match(
    source,
    /filter\(\(group\) => !group\.implicit\)/,
    "un gruppo implicito e una categoria con un altro nome: non si offre come gruppo",
  );
  assert.match(
    source,
    /new Set\(\[\.\.\.getTrainerGroupIds/,
    "l'assegnazione aggiunge un gruppo, non sostituisce quelli gia seguiti",
  );
});
