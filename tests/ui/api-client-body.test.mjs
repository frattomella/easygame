import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * **Il corpo di una richiesta si serializza una volta sola.**
 *
 * `apiRequest` fa `JSON.stringify` da solo (`src/lib/api/client.ts`).
 * Passargli una stringa gia serializzata la serializza una seconda volta, e il
 * server riceve una stringa JSON al posto di un oggetto: `body.athlete_ids` e
 * `undefined`, `body.percent` e `undefined`, **ogni** campo risulta assente.
 *
 * **Perche merita un invariante e non solo una correzione.** Perche l'errore
 * che ne esce parla d'altro. Il server risponde «Seleziona almeno un atleta da
 * iscrivere» — che e vero rispetto a cio che ha ricevuto — e chi legge va a
 * cercare il difetto nella selezione, non nella codifica. E costato un giro di
 * verifica su schermo per accorgersene, ed e esattamente il tipo di cosa che
 * un test statico trova in un secondo.
 *
 * `fetch` diretto resta libero di serializzare: li il corpo lo si costruisce a
 * mano, ed e giusto che sia una stringa.
 */

const COMPONENTS = path.join(process.cwd(), "src");

const walk = (directory) => {
  const out = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
};

test("nessuno serializza due volte il corpo di una chiamata ad apiRequest", () => {
  const offenders = [];

  for (const file of walk(COMPONENTS)) {
    const source = readFileSync(file, "utf8");

    /*
      Il file usa `apiRequest` e da qualche parte scrive `body: JSON.stringify`.
      Un file che usa **solo** `fetch` diretto non e in discussione: parent
      dashboard costruisce le sue richieste a mano, e li la stringa e corretta.
    */
    if (!/\bapiRequest\s*[<(]/.test(source)) continue;
    if (!/body:\s*JSON\.stringify/.test(source)) continue;

    offenders.push(path.relative(process.cwd(), file).split(path.sep).join("/"));
  }

  assert.deepEqual(
    offenders,
    [],
    "apiRequest serializza da solo: il server riceverebbe una stringa e ogni campo risulterebbe assente",
  );
});

test("apiRequest serializza davvero il corpo, e questo test lo presidia", () => {
  /*
    L'invariante sopra ha senso solo finche il client si comporta cosi. Se un
    giorno `apiRequest` smettesse di serializzare, il test sopra vieterebbe la
    cosa giusta — e sarebbe peggio del difetto che previene.
  */
  const client = readFileSync(
    path.join(process.cwd(), "src/lib/api/client.ts"),
    "utf8",
  );

  assert.match(
    client,
    /body:\s*hasJsonBody\s*\?\s*JSON\.stringify\(options\.body\)/,
    "se il client smette di serializzare, l'invariante qui sopra va rivisto",
  );
});
