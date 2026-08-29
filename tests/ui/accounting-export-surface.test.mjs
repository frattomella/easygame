import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

/**
 * La superficie dell'**export contabile**, e le tre cose che non deve
 * reintrodurre.
 *
 * Un test statico non dice se un file e giusto — quello lo dicono
 * `tests/lib/accounting-export.test.mjs` e `tests/server/accounting-export.test.mjs`.
 * Qui si difende la classe di difetti che si reintroduce **senza
 * accorgersene**: un pulsante mostrato a chi poi riceve 403, un `fetch`
 * diretto che perde gli header di contesto, un'etichetta che promette un
 * documento.
 */

const read = (relative) =>
  fs.readFileSync(path.join(process.cwd(), relative), "utf8");

/**
 * Il file **senza i commenti**.
 *
 * Questi moduli spiegano nei commenti la regola che rispettano, e quindi
 * nominano le quattro parole vietate. Un test che le cercasse nel testo
 * integrale fallirebbe sulla documentazione e passerebbe su un'etichetta
 * infilata sotto: e la ricerca del **codice** che deve essere pulita. E lo
 * stesso aiutante gia in uso in `accounting-movements-surface.test.mjs`.
 */
const readCode = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");

const BOTTONE = "src/app/reports/accounting-export-button.tsx";
const RIEPILOGO = "src/app/reports/management-summary.tsx";

test("il pulsante di export si mostra solo a chi ha accounting.export", () => {
  const source = read(BOTTONE);

  assert.match(
    source,
    /hasAccountingPermission\(\s*role,\s*"accounting\.export"\s*\)/,
    "la matrice della pagina e quella della rotta devono essere la stessa (W3-14)",
  );
  assert.match(
    source,
    /return null/,
    "chi non ha il permesso non deve vedere un pulsante che poi nega",
  );
  assert.ok(
    !/if\s*\(\s*role\s*===/.test(source),
    "nessun controllo di ruolo scritto a mano: il permesso viene dalla matrice",
  );
});

test("l'export passa dal trasporto condiviso, non da un fetch diretto", () => {
  const source = read(BOTTONE);

  assert.match(source, /apiDownload\(/);
  assert.ok(
    !/\bfetch\(/.test(source),
    "un fetch diretto verso /api non porta gli header di contesto: il server non saprebbe quale club esportare",
  );
  assert.match(
    source,
    /from "@\/lib\/csv"/,
    "il salvataggio del file resta al proprietario del tracciato",
  );
});

test("il file esce con gli stessi filtri che l'utente sta guardando", () => {
  const source = read(RIEPILOGO);

  assert.match(
    source,
    /<AccountingExportButton[\s\S]{0,200}costruisciQuery\(/,
    "un pulsante che non riceve i filtri scarica un periodo diverso da quello a schermo",
  );
});

test("nessuna etichetta della superficie di export promette un documento", () => {
  for (const file of [BOTTONE, RIEPILOGO]) {
    const testo = readCode(file).toLowerCase();
    for (const parola of ["ufficiale", "conforme", "a norma", "per il deposito"]) {
      assert.ok(
        !testo.includes(parola),
        `${file} rivendica «${parola}»`,
      );
    }
  }
});
