import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  buildAttachmentFileName,
  extensionForMime,
  extensionFromFileName,
  readMimeFromDataUrl,
  resolveAttachmentExtension,
  sanitizeFileNamePart,
} from "../../src/lib/attachment-names.ts";

/**
 * Blocco 7, punto 7 — i download hanno un nome leggibile.
 *
 * I file uscivano da EasyGame chiamati `attestato_blsd`, `documento`,
 * `download`: senza estensione e senza dire di chi fossero. Trenta certificati
 * di trenta atleti finivano in Download indistinguibili l'uno dall'altro.
 */

test("il formato e Tipo_Cognome_Nome_data.estensione", () => {
  assert.equal(
    buildAttachmentFileName({
      documentType: "BLSD",
      lastName: "Rossi",
      firstName: "Mario",
      date: "2026-08-25",
      mimeType: "application/pdf",
    }),
    "BLSD_Rossi_Mario_2026-08-25.pdf",
  );
});

test("le parti mancanti si saltano, non lasciano trattini doppi", () => {
  assert.equal(
    buildAttachmentFileName({
      documentType: "Certificato medico",
      lastName: "Rossi",
      mimeType: "image/png",
    }),
    "Certificato-medico_Rossi.png",
  );

  assert.equal(
    buildAttachmentFileName({ documentType: "BLSD", date: "2026-08-25" }),
    "BLSD_2026-08-25",
    "senza estensione nota il file esce senza estensione, non con una inventata",
  );
});

test("senza nessuna informazione resta comunque un nome", () => {
  assert.equal(buildAttachmentFileName({}), "documento");
  assert.equal(buildAttachmentFileName({ documentType: "   " }), "documento");
});

test("accenti, apostrofi e caratteri vietati da Windows spariscono", () => {
  assert.equal(sanitizeFileNamePart("D'Angelò"), "DAngelo");
  assert.equal(sanitizeFileNamePart("a/b\\c:d*e?f\"g<h>i|j"), "a-b-c-d-e-f-g-h-i-j");
  assert.equal(sanitizeFileNamePart("  Van  der   Berg "), "Van-der-Berg");
  assert.equal(sanitizeFileNamePart(null), "");
});

test("il nome intero si usa solo se cognome e nome mancano", () => {
  assert.equal(
    buildAttachmentFileName({
      documentType: "Contratto",
      fullName: "Mario Rossi",
      mimeType: "application/pdf",
    }),
    "Contratto_Mario-Rossi.pdf",
  );

  assert.equal(
    buildAttachmentFileName({
      documentType: "Contratto",
      lastName: "Rossi",
      fullName: "Mario Rossi",
      mimeType: "application/pdf",
    }),
    "Contratto_Rossi.pdf",
    "avendo il cognome, il nome intero non si aggiunge in coda",
  );
});

test("la data si normalizza in ISO e si tiene solo il giorno", () => {
  assert.match(
    buildAttachmentFileName({ documentType: "Visita", date: "2026-08-25T10:30:00Z" }),
    /_2026-08-25$/,
  );
  assert.equal(
    buildAttachmentFileName({ documentType: "Visita", date: "non-una-data" }),
    "Visita",
    "una data illeggibile si omette invece di finire nel nome",
  );
});

// --- estensione --------------------------------------------------------------

test("il MIME si legge dal data URL", () => {
  assert.equal(readMimeFromDataUrl("data:application/pdf;base64,AAAA"), "application/pdf");
  assert.equal(readMimeFromDataUrl("data:image/png,AAAA"), "image/png");
  assert.equal(readMimeFromDataUrl("https://example.org/a.pdf"), "");
  assert.equal(readMimeFromDataUrl(null), "");
});

test("un tipo sconosciuto non produce un'estensione inventata", () => {
  assert.equal(extensionForMime("application/pdf"), "pdf");
  assert.equal(extensionForMime("IMAGE/JPEG"), "jpg");
  assert.equal(extensionForMime("application/x-cosa-strana"), "");
});

test("l'estensione del data URL batte quella del nome originale", () => {
  assert.equal(
    resolveAttachmentExtension({
      url: "data:application/pdf;base64,AAAA",
      fileName: "scansione.jpg",
    }),
    "pdf",
    "il MIME lo scrive il browser leggendo il file; il nome puo essere stato cambiato a mano",
  );

  assert.equal(
    resolveAttachmentExtension({ fileName: "scansione.JPEG" }),
    "jpeg",
    "senza data URL resta il nome originale",
  );

  assert.equal(extensionFromFileName("senza-estensione"), "");
});

// --- la regola vale ovunque --------------------------------------------------

const SRC = path.join(process.cwd(), "src");

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
};

const APP_FILES = walk(SRC);

/**
 * `window.open` su un data URL e bloccato dai browser da anni: era il motivo
 * per cui **ogni** pulsante «Visualizza» apriva una scheda vuota. Va sempre
 * passato da `openClientFileUrl`, che converte in object URL.
 */
test("nessuno apre un allegato con window.open diretto", () => {
  const offenders = APP_FILES.filter((file) => {
    const source = readFileSync(file, "utf8");
    return /window\.open\(\s*[a-zA-Z_$][\w.$[\]]*(File|Url|url)\b/.test(source);
  }).map((file) => path.relative(SRC, file).replace(/\\/g, "/"));

  assert.deepEqual(
    offenders,
    [],
    "usare openClientFileUrl: window.open su un data URL non apre niente",
  );
});

/**
 * Un `<a download>` costruito a mano finiva sempre con nomi come
 * `attestato_blsd`, senza estensione. Il nome si costruisce in un posto solo.
 */
test("nessuno costruisce a mano un nome di download", () => {
  const offenders = APP_FILES.filter((file) => {
    const source = readFileSync(file, "utf8");
    // `link.download = "qualcosa"` con una stringa letterale.
    return /\.download\s*=\s*["'`]/.test(source);
  }).map((file) => path.relative(SRC, file).replace(/\\/g, "/"));

  assert.deepEqual(
    offenders,
    [],
    "usare downloadAttachment / buildAttachmentFileName",
  );
});

/**
 * `<a href="data:…">` non scarica e non apre niente sui browser recenti:
 * e la stessa restrizione che rendeva morto `window.open`.
 */
test("nessun link punta direttamente a un allegato", () => {
  const offenders = APP_FILES.filter((file) => {
    const source = readFileSync(file, "utf8");
    return /<a\s[^>]*href=\{[a-zA-Z_$][\w.$?]*\.fileUrl\}/.test(source);
  }).map((file) => path.relative(SRC, file).replace(/\\/g, "/"));

  assert.deepEqual(
    offenders,
    [],
    "usare downloadAttachment / openClientFileUrl",
  );
});

/**
 * Un contratto scaricava un `text/plain` con dentro la propria descrizione,
 * chiamato pero `contratto.pdf`. Il file non era da nessuna parte, perche
 * l'upload ne teneva solo nome, peso e tipo.
 */
test("nessuno fabbrica un finto documento da scaricare", () => {
  const offenders = APP_FILES.filter((file) => {
    const source = readFileSync(file, "utf8");
    return /data:text\/plain;charset=utf-8,\$\{encodeURIComponent\(`(Contratto|Documento)/.test(
      source,
    );
  }).map((file) => path.relative(SRC, file).replace(/\\/g, "/"));

  assert.deepEqual(offenders, [], "si scarica il file vero, o si dice che manca");
});

/** Chi carica un allegato deve conservarlo, non solo i suoi metadati. */
test("l'upload di un contratto conserva il file", () => {
  for (const file of [
    "app/trainers/[id]/contracts/page.tsx",
    "app/trainers/[id]/contracts/upload/page.tsx",
  ]) {
    const source = readFileSync(path.join(SRC, file), "utf8");
    assert.match(
      source,
      /fileUrl: newContract\.fileUrl/,
      `${file}: il file caricato deve finire nel record`,
    );
  }
});
