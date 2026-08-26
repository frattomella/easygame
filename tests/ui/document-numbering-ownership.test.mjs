import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

/**
 * Chi ha il diritto di dare un numero a un documento.
 *
 * La numerazione ha un proprietario — `src/lib/server/document-numbering.ts`
 * — e il motivo non e ordine: e che un numero calcolato altrove non puo
 * essere corretto. Un browser che conta le ricevute che ha in pagina conta
 * quelle che ha scaricato lui, e due operatori collegati insieme producono lo
 * stesso numero senza che nessuno dei due se ne accorga.
 *
 * Questo test non guarda un comportamento: guarda che non ricompaia una
 * seconda implementazione. E il difetto che nel Blocco Finale B e stato
 * trovato **gia presente** nella pagina Movimenti.
 */

const readFilesUnder = (root, extensions) => {
  const files = [];

  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (extensions.some((extension) => entry.name.endsWith(extension))) {
        files.push(full);
      }
    }
  };

  walk(root);
  return files;
};

const CLIENT_ROOTS = ["src/app", "src/components"].map((relative) =>
  path.join(process.cwd(), relative),
);

const clientFiles = CLIENT_ROOTS.flatMap((root) =>
  readFilesUnder(root, [".tsx", ".ts"]),
).filter((file) => !file.includes(`${path.sep}api${path.sep}`));

test("nessuna schermata costruisce un numero di documento", () => {
  const offenders = clientFiles.filter((file) => {
    const source = fs.readFileSync(file, "utf8");
    return /`(R|FT)-\$\{/.test(source);
  });

  assert.deepEqual(
    offenders.map((file) => path.relative(process.cwd(), file)),
    [],
    "un numero di documento si chiede al server, non si compone nel browser",
  );
});

test("nessuna schermata scrive direttamente nelle ricevute", () => {
  const offenders = clientFiles.filter((file) => {
    const source = fs.readFileSync(file, "utf8");
    return /from\(["']receipts["']\)\s*\n?\s*\.insert/.test(source);
  });

  assert.deepEqual(
    offenders.map((file) => path.relative(process.cwd(), file)),
    [],
    "una ricevuta nasce da un incasso, sul server, e prende li il suo numero",
  );
});

test("la numerazione ha un proprietario solo, e non conta le righe", () => {
  const owner = fs.readFileSync(
    path.join(process.cwd(), "src/lib/server/document-numbering.ts"),
    "utf8",
  );

  assert.match(
    owner,
    /increment: 1/,
    "il numero deve salire con un incremento in una sola istruzione",
  );
  assert.doesNotMatch(
    owner,
    /\.count\(/,
    "contare le righe gia emesse non e sicuro sotto concorrenza",
  );
});

test("chi emette documenti non ha una numerazione propria", () => {
  /*
    Dal Blocco D i documenti stanno in `fiscal-documents.ts`: un pagamento e
    un documento sono due domini (ADR-0052), e il registro incassi non emette
    piu niente.
  */
  const service = fs.readFileSync(
    path.join(process.cwd(), "src/lib/server/fiscal-documents.ts"),
    "utf8",
  );

  assert.match(service, /allocateDocumentNumber/);
  assert.doesNotMatch(
    service,
    /padStart\(4, "0"\)/,
    "la forma del numero la decide `documents/numbering`, non chi emette",
  );
});
