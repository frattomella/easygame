import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  STORED_FILE_CSP,
  buildContentDisposition,
  buildStoredFileResponse,
  isInlineRenderableMimeType,
} from "../../src/lib/server/stored-file-response.ts";

/**
 * RC Fix 1, punto 8 — «Visualizza» non apriva tutti i PDF.
 *
 * **La causa, misurata e non dedotta.** Servendo lo stesso PDF con i due
 * insiemi di header e leggendo la console del browser:
 *
 * - con `Content-Security-Policy: sandbox; default-src 'none'` — quella in
 *   uso — il browser scriveva *«Loading plugin data … violates the following
 *   Content Security Policy directive: "default-src 'none'". Note that
 *   'object-src' was not explicitly set … The action has been blocked»*, piu
 *   *«Blocked script execution … because the document's frame is
 *   sandboxed»*;
 * - togliendo solo `object-src` ne compariva una seconda: *«Framing … has
 *   been blocked»*, perche il visualizzatore PDF disegna in un riquadro
 *   figlio;
 * - con `object-src 'self'` **e** `frame-src 'self'`: nessun errore.
 *
 * Le immagini si vedevano lo stesso — non passano da un plugin — ed e il
 * motivo per cui il difetto sembrava capriccioso.
 */

test("la politica non spegne il visualizzatore PDF", () => {
  assert.equal(
    /(^|;)\s*sandbox/.test(STORED_FILE_CSP),
    false,
    "la direttiva sandbox vieta i plugin al documento",
  );
  assert.match(STORED_FILE_CSP, /object-src 'self'/);
  assert.match(STORED_FILE_CSP, /frame-src 'self'/);
});

test("la politica continua a vietare cio che conta", () => {
  assert.match(STORED_FILE_CSP, /default-src 'none'/);
  assert.equal(
    /script-src/.test(STORED_FILE_CSP),
    false,
    "senza script-src vale default-src 'none': nessuno script",
  );
  assert.match(STORED_FILE_CSP, /frame-ancestors 'none'/);
  assert.match(STORED_FILE_CSP, /form-action 'none'/);
  assert.match(STORED_FILE_CSP, /base-uri 'none'/);
});

test("solo i tipi che si sanno guardare vengono serviti inline", () => {
  for (const mimeType of [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "text/plain",
  ]) {
    assert.equal(isInlineRenderableMimeType(mimeType), true, mimeType);
  }

  for (const mimeType of [
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",
    "text/html",
    "image/svg+xml",
    "",
    null,
  ]) {
    assert.equal(
      isInlineRenderableMimeType(mimeType),
      false,
      `${mimeType}: un tipo che il browser potrebbe eseguire non si apre in scheda`,
    );
  }

  assert.equal(
    isInlineRenderableMimeType("APPLICATION/PDF; charset=binary"),
    true,
    "il tipo arriva come lo ha scritto chi ha caricato il file",
  );
});

test("il nome del file viaggia nelle due forme della RFC 6266", () => {
  const header = buildContentDisposition("inline", "Certificato Rossi à.pdf");

  assert.match(header, /^inline; filename="Certificato Rossi _\.pdf"/);
  assert.match(header, /filename\*=UTF-8''Certificato%20Rossi%20%C3%A0\.pdf$/);
});

test("un nome con un ritorno a capo non aggiunge header alla risposta", () => {
  const header = buildContentDisposition(
    "attachment",
    'doc\r\nX-Iniettato: si".pdf',
  );

  assert.equal(/[\r\n]/.test(header), false);
  assert.equal(
    header.includes('X-Iniettato: si"'),
    false,
    "le virgolette dentro il valore chiuderebbero il campo",
  );
});

test("un PDF si serve inline, un documento Office come allegato", () => {
  const pdf = buildStoredFileResponse({
    content: Buffer.from("%PDF-1.4"),
    mimeType: "application/pdf",
    fileName: "contratto.pdf",
  });

  assert.match(pdf.headers.get("Content-Disposition"), /^inline;/);
  assert.equal(pdf.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(pdf.headers.get("Content-Security-Policy"), STORED_FILE_CSP);
  assert.equal(pdf.headers.get("Content-Length"), "8");
  assert.match(pdf.headers.get("Cache-Control"), /private/);

  const doc = buildStoredFileResponse({
    content: Buffer.from("PK"),
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    fileName: "verbale.docx",
  });
  assert.match(doc.headers.get("Content-Disposition"), /^attachment;/);
});

test("chiedere il download vince sempre sulla visualizzazione", () => {
  const response = buildStoredFileResponse({
    content: Buffer.from("%PDF-1.4"),
    mimeType: "application/pdf",
    fileName: "contratto.pdf",
    download: true,
  });

  assert.match(response.headers.get("Content-Disposition"), /^attachment;/);
});

// --- che nessuna rotta torni a fare di testa sua -------------------------------

const API = path.join(process.cwd(), "src", "app", "api");

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.ts$/.test(entry)) out.push(full);
  }
  return out;
};

const ROUTES = walk(API).map((file) => ({
  file: path.relative(process.cwd(), file).replace(/\\/g, "/"),
  source: readFileSync(file, "utf8"),
}));

test("nessuna rotta costruisce a mano un Content-Disposition per un file salvato", () => {
  const offenders = ROUTES.filter(({ file, source }) => {
    if (file.endsWith("funding/programs/[id]/reconciliation/route.ts")) {
      // Un CSV generato al momento, non un file salvato da un utente.
      return false;
    }
    return /"[Cc]ontent-[Dd]isposition"\s*:/.test(source);
  }).map(({ file }) => file);

  assert.deepEqual(
    offenders,
    [],
    "gli header di un file salvato li costruisce buildStoredFileResponse",
  );
});

test("nessuna rotta rimette la CSP che spegneva i PDF", () => {
  const offenders = ROUTES.filter(({ source }) =>
    /sandbox;\s*default-src 'none'/.test(source),
  ).map(({ file }) => file);

  assert.deepEqual(offenders, []);
});

test("le quattro superfici documentali passano dalla stessa risposta", () => {
  for (const route of [
    "src/app/api/v1/attachments/[id]/route.ts",
    "src/app/api/athletes/[athleteId]/documents/[documentId]/file/route.ts",
    "src/app/api/forms/assets/[assetId]/route.ts",
    "src/app/api/parent-dashboard/[athleteId]/documents/[assetId]/route.ts",
  ]) {
    const entry = ROUTES.find(({ file }) => file === route);
    assert.ok(entry, `${route} non trovata`);
    assert.match(
      entry.source,
      /buildStoredFileResponse\(/,
      `${route}: deve servire il file dalla risposta condivisa`,
    );
  }
});
