import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  DOCUMENT_PLACEHOLDER_KEYS,
  DOCUMENT_SIGNATURE_TOKENS,
  DOCUMENT_TEMPLATE_TOKENS,
  applyPlaceholderValues,
  extractPlaceholderKeys,
} from "../../src/lib/documents/placeholders.ts";

/**
 * Un catalogo di segnaposto, e uno solo (W1-G, §6.1).
 *
 * **Perche e un test e non una convenzione.** Il catalogo esisteva dentro
 * `DocumentEditor`, il risolutore e nato dopo: la strada facile era
 * ricopiarne le chiavi. Due elenchi che divergono sono **peggio** di nessun
 * elenco — l'editor propone `{{payment.total_paid}}`, il documento stampa un
 * campo vuoto, e nessuno sa dire quale dei due ha ragione. Se qualcuno ne
 * riscrive uno, questo file diventa rosso prima che il modello sbagliato
 * arrivi a una famiglia.
 *
 * **E la strada vecchia resta.** `renderBlankTemplateForPdf` svuota i
 * segnaposto **di proposito**: e il modulo da compilare a mano in segreteria,
 * ed e la cosa giusta per una liberatoria da firmare. Il risolutore le si
 * affianca, non la sostituisce — e anche questo va provato, perche «sostituire
 * cio che sembrava rotto» e l'errore piu naturale del mondo.
 */

const SRC = path.join(process.cwd(), "src");
const CATALOGO = path.join("lib", "documents", "placeholders.ts");
const RISOLUTORE = path.join("lib", "server", "document-placeholders.ts");
const MODULISTICA = path.join(SRC, "app", "modulistica", "page.tsx");

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
};

const relative = (file) => path.relative(SRC, file).replace(/\\/g, "/");

/* ------------------------------------------------------- un catalogo solo */

test("esiste un solo elenco di segnaposto in tutto src/", () => {
  const offenders = walk(SRC)
    .filter((file) => !file.endsWith(CATALOGO))
    .filter((file) => {
      const source = readFileSync(file, "utf8");
      return (
        /DOCUMENT_TEMPLATE_TOKENS[^=\n]*=\s*\[/.test(source) ||
        /DOCUMENT_SIGNATURE_TOKENS[^=\n]*=\s*\[/.test(source) ||
        /SIGNATURE_TOKENS\s*:\s*\w+\[\]\s*=\s*\[/.test(source)
      );
    })
    .map(relative);

  assert.deepEqual(
    offenders,
    [],
    "il catalogo dei segnaposto vive in lib/documents/placeholders.ts e da nessun'altra parte",
  );
});

test("l'editor dei modelli consuma quel catalogo, non una sua copia", () => {
  const source = readFileSync(
    path.join(SRC, "components", "forms", "DocumentEditor.tsx"),
    "utf8",
  );

  assert.match(source, /from "@\/lib\/documents\/placeholders"/);
});

test("esiste un solo risolutore di segnaposto", () => {
  const offenders = walk(SRC)
    .filter((file) => !file.endsWith(RISOLUTORE))
    .filter((file) =>
      /export\s+(const|async function|function)\s+(resolveDocumentPlaceholders|buildPlaceholderValues)\b/.test(
        readFileSync(file, "utf8"),
      ),
    )
    .map(relative);

  assert.deepEqual(
    offenders,
    [],
    "chi risolve i segnaposto e lib/server/document-placeholders.ts",
  );
});

test("il catalogo non contiene due volte la stessa chiave", () => {
  const duplicati = DOCUMENT_PLACEHOLDER_KEYS.filter(
    (key, index) => DOCUMENT_PLACEHOLDER_KEYS.indexOf(key) !== index,
  );

  assert.deepEqual(duplicati, []);
  assert.ok(DOCUMENT_TEMPLATE_TOKENS.length > 0);
  assert.ok(DOCUMENT_SIGNATURE_TOKENS.length > 0);
});

/* ------------------------------------------------ la strada vecchia resta */

test("renderBlankTemplateForPdf esiste ancora e continua a svuotare i segnaposto", () => {
  const source = readFileSync(MODULISTICA, "utf8");

  assert.match(
    source,
    /const renderBlankTemplateForPdf = /,
    "il modulo da compilare a mano non e stato sostituito: gli si e affiancata una seconda strada",
  );
  assert.match(
    source,
    /\.replace\(\/\{\{\\s\*\[\^\}\]\+\}\}\/g, '<span class="blank-field"><\/span>'\)/,
    "un segnaposto, nel modulo vuoto, resta un campo da riempire a penna",
  );
});

test("il generatore offre entrambe le strade, e la compilata passa dal server", () => {
  const source = readFileSync(MODULISTICA, "utf8");

  assert.match(source, /Genera vuoto/);
  assert.match(source, /Genera compilato/);
  assert.match(
    source,
    /\/api\/v1\/documents\/filled/,
    "il risolutore e lato server: la pagina non lo reimplementa",
  );
});

/* ------------------------------------------------- il motore, senza rete */

test("un segnaposto senza valore resta un campo vuoto e viene dichiarato", () => {
  const { html, unresolved } = applyPlaceholderValues({
    content: "<p>{{athlete.first_name}} — {{pippo}}</p>",
    rendered: { "athlete.first_name": "Mario" },
  });

  assert.equal(html, '<p>Mario — <span class="blank-field"></span></p>');
  assert.deepEqual(unresolved, ["pippo"]);
});

test("il chip dell'editor e il segnaposto in chiaro sono la stessa cosa", () => {
  const chip =
    '<span data-template-placeholder="{{club.name}}" class="x">Nome club</span>';

  assert.deepEqual(extractPlaceholderKeys(chip), ["club.name"]);
  assert.equal(
    applyPlaceholderValues({ content: chip, rendered: { "club.name": "ASD" } })
      .html,
    "ASD",
  );
});

test("leggere due volte lo stesso modello da lo stesso elenco", () => {
  const content = "<p>{{club.name}} {{club.city}}</p>";

  assert.deepEqual(
    extractPlaceholderKeys(content),
    extractPlaceholderKeys(content),
  );
});
