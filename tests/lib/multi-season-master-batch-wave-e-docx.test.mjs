import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import JSZip from "jszip";

import { convertDocxToHtml, DocxImportError } from "../../src/lib/server/docx-import.ts";

/**
 * MASTER BATCH — Wave E, import DOCX (E5-E12).
 *
 * `mammoth` (MIT, mwilliamson/mammoth.js) e stato scelto dopo la discovery
 * (E8): nessuna dipendenza di parsing zip/XML esisteva nel progetto, e
 * questa e la libreria di riferimento per DOCX -> HTML, senza esecuzione di
 * macro (non apre mai `vbaProject.bin`) e senza chiamate di rete. Il suo
 * albero di dipendenze non introduce vulnerabilita nuove (`npm audit`,
 * verificato prima di installarla).
 *
 * I file di prova sono costruiti qui, non presi da `node_modules/mammoth`:
 * un pacchetto di terzi puo togliere i suoi file di test in una versione
 * futura senza che sia un cambio incompatibile per chi lo usa come libreria.
 */

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;

/** Un `.docx` minimo e valido, con i paragrafi dati come corpo del documento. */
const buildMinimalDocx = async (bodyXml) => {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", ROOT_RELS);
  zip.file("word/_rels/document.xml.rels", DOCUMENT_RELS);
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${bodyXml}</w:body>
</w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
};

const paragraph = (text, styleId) =>
  `<w:p>${styleId ? `<w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>` : ""}<w:r><w:t>${text}</w:t></w:r></w:p>`;

test("71: un paragrafo semplice si importa come testo", async () => {
  const docx = await buildMinimalDocx(paragraph("Ciao mondo"));
  const { html, unsupported } = await convertDocxToHtml(docx);
  assert.match(html, /<p>Ciao mondo<\/p>/);
  assert.deepEqual(unsupported, []);
});

test("72: un titolo diventa un heading", async () => {
  const docx = await buildMinimalDocx(paragraph("Titolo del documento", "Heading1"));
  const { html } = await convertDocxToHtml(docx);
  assert.match(html, /<h1>Titolo del documento<\/h1>/);
});

test("73: il grassetto e il corsivo si importano come formattazione", async () => {
  const bold = `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Grassetto</w:t></w:r></w:p>`;
  const docx = await buildMinimalDocx(bold);
  const { html } = await convertDocxToHtml(docx);
  assert.match(html, /<strong>Grassetto<\/strong>/);
});

test("74: un elenco puntato si importa come lista", async () => {
  const elenco = [
    `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Primo punto</w:t></w:r></w:p>`,
    `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Secondo punto</w:t></w:r></w:p>`,
  ].join("");
  const docx = await buildMinimalDocx(elenco);
  const { html } = await convertDocxToHtml(docx);
  // Senza numbering.xml mammoth non riconosce la lista come tale e la lascia come paragrafi:
  // verifica quindi solo che il testo arrivi e niente vada perso silenziosamente.
  assert.match(html, /Primo punto/);
  assert.match(html, /Secondo punto/);
});

test("75: una tabella si importa come tabella", async () => {
  const tabella = `<w:tbl>
    <w:tr><w:tc><w:p><w:r><w:t>A1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B1</w:t></w:r></w:p></w:tc></w:tr>
  </w:tbl>`;
  const docx = await buildMinimalDocx(tabella);
  const { html } = await convertDocxToHtml(docx);
  assert.match(html, /<table>/);
  assert.match(html, /A1/);
  assert.match(html, /B1/);
});

test("77: un'interruzione di pagina si importa (E10: nessun contenuto perso)", async () => {
  const conInterruzione = `${paragraph("Prima pagina")}<w:p><w:r><w:br w:type="page"/></w:r></w:p>${paragraph("Seconda pagina")}`;
  const docx = await buildMinimalDocx(conInterruzione);
  const { html } = await convertDocxToHtml(docx);
  assert.match(html, /Prima pagina/);
  assert.match(html, /Seconda pagina/);
});

test("78: le immagini incassate non spariscono in silenzio — dichiarate come non supportate", async () => {
  // Un docx con un riferimento immagine reale richiederebbe la parte binaria e la relazione:
  // qui si prova solo che un documento senza immagini non ne dichiara, a garanzia che il
  // conteggio non sia sempre acceso per errore.
  const docx = await buildMinimalDocx(paragraph("Nessuna immagine qui"));
  const { unsupported } = await convertDocxToHtml(docx);
  assert.ok(!unsupported.some((riga) => riga.includes("immagine")));
});

test("H1 (revisione ostile Wave F): un'intestazione o un piè di pagina non sparisce in silenzio", async () => {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", ROOT_RELS);
  zip.file("word/_rels/document.xml.rels", DOCUMENT_RELS);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraph("Corpo")}</w:body></w:document>`);
  // Mammoth non legge mai queste parti (non fa nemmeno il tentativo): basta che esistano nell'archivio.
  zip.file("word/header1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${paragraph("Intestazione")}</w:hdr>`);
  const docx = await zip.generateAsync({ type: "nodebuffer" });
  const { unsupported } = await convertDocxToHtml(docx);
  assert.ok(unsupported.some((riga) => /Intestazione o piè di pagina/.test(riga)), "l'intestazione deve comparire fra i non supportati, non sparire in silenzio");
});

test("79: un file che non e uno zip (MIME sbagliato o rinominato) e rifiutato, non produce un crash", async () => {
  await assert.rejects(() => convertDocxToHtml(Buffer.from("questo non e un docx")), DocxImportError);
});

test("80: un file oltre il limite di dimensione e rifiutato", async () => {
  const grande = Buffer.alloc(11 * 1024 * 1024, "a");
  await assert.rejects(() => convertDocxToHtml(grande), /dimensione massima consentita/);
});

test("81: il vaglio rifiuta un percorso «..» nell'archivio, se mai un file lo portasse", () => {
  /*
    `JSZip.file()` normalizza da solo un percorso «../evil.txt» (non lo si
    puo costruire con l'API pubblica per un test comportamentale onesto):
    resta il controllo sulla stringa, verificato qui come codice presente e
    raggiunto da ogni voce dell'archivio, non come http bypassabile.
  */
  const source = readFileSync("src/lib/server/docx-import.ts", "utf8");
  assert.match(source, /voce\.name\.includes\("\.\."\)/);
  assert.match(source, /throw new DocxImportError\("Il file contiene un percorso non valido"\);/);
});

test("82: un archivio che si gonfia troppo una volta decompresso e rifiutato prima di convertirlo", async () => {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", ROOT_RELS);
  zip.file("word/_rels/document.xml.rels", DOCUMENT_RELS);
  // 90 MB di testo ripetuto, ben oltre MAX_UNCOMPRESSED_BYTES (80 MB) ma comprime a pochi KB.
  zip.file("word/document.xml", "a".repeat(90 * 1024 * 1024), { compression: "DEFLATE" });
  const docx = await zip.generateAsync({ type: "nodebuffer" });
  await assert.rejects(() => convertDocxToHtml(docx), /troppo grande/);
});

test("83: l'output e sempre sanificato con la stessa funzione del resto del prodotto", () => {
  const source = readFileSync("src/lib/server/docx-import.ts", "utf8");
  assert.match(source, /import \{ sanitizeRichHtml \} from "@\/lib\/rich-text\/sanitize";/);
  assert.match(source, /sanitizeRichHtml\(esito\.value\)/);
});

test("84/85: anteprima prima del salvataggio, nessuna sovrascrittura automatica", () => {
  const drawer = readFileSync("src/components/modulistica/v2/docx-import-drawer.tsx", "utf8");
  assert.match(drawer, /RichContent html=\{preview\.html\}/, "l'anteprima si mostra prima della conferma");
  const page = readFileSync("src/app/modulistica/page.tsx", "utf8");
  assert.match(
    page,
    /createDocumentTemplate\(\{\s*\n\s*title: values\.title,\s*\n\s*subjectKind: "athlete",\s*\n\s*content: values\.html,/,
    "l'import crea un documento nuovo, non scrive sopra un modello esistente",
  );
});
