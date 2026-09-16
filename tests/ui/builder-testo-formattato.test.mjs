import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/*
  Il builder e l'editor di testo formattato (ADR-0190): la matrice §48 del
  secondo lotto, a livello di sorgente. Cio che si prova a runtime — la
  sanificazione — sta in tests/lib/sanificazione-testo-formattato.test.mjs.
*/

const leggi = (p) => readFileSync(path.join(process.cwd(), p), "utf8");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const editor = senzaCommenti(leggi("src/components/rich-text/RichTextEditor.tsx"));
const estensioni = senzaCommenti(leggi("src/components/rich-text/extensions.ts"));
const documento = senzaCommenti(leggi("src/components/forms/DocumentEditor.tsx"));
const card = senzaCommenti(leggi("src/components/forms/form-field-card.tsx"));
const builder = senzaCommenti(leggi("src/components/forms/form-builder.tsx"));
const renderer = senzaCommenti(leggi("src/components/forms/form-renderer.tsx"));
const anteprima = senzaCommenti(leggi("src/app/modulistica/moduli/[id]/anteprima/page.tsx"));
const css = leggi("src/styles/egw-base.css");

test("l'editor e uno solo, su ProseMirror (TipTap), e lo montano sia il blocco di contenuto sia il modello di documento", () => {
  assert.match(editor, /from "@tiptap\/react"/);
  assert.match(editor, /StarterKit/);
  assert.match(card, /<RichTextEditor/, "il blocco `content` del builder");
  assert.match(documento, /<RichTextEditor/, "il modello di documento");
  assert.doesNotMatch(documento, /execCommand|contentEditable/, "il vecchio editor non c'e piu");
  assert.doesNotMatch(documento, /readAsDataURL/, "niente base64 nel documento");
});

test("paragrafo, titoli, grassetto, corsivo, sottolineato, allineamento, elenchi, link, annulla/ripeti", () => {
  for (const cosa of ["setParagraph", "toggleHeading", "toggleBold", "toggleItalic", "toggleUnderline", "setTextAlign", "toggleBulletList", "toggleOrderedList", "setLink", "undo()", "redo()"]) {
    assert.ok(editor.includes(cosa), cosa);
  }
  assert.match(editor, /isAllowedHref/, "un link vale solo https/http/mailto");
});

test("dimensione del carattere, interlinea e spazio fra paragrafi sono scale chiuse", () => {
  assert.match(estensioni, /FONT_SIZES = \[10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32\]/);
  assert.match(estensioni, /LINE_HEIGHTS = \["1", "1\.15", "1\.3", "1\.5", "1\.7", "2"\]/);
  assert.match(estensioni, /PARAGRAPH_SPACINGS = \[0, 4, 8, 12, 16, 24\]/);
  assert.match(editor, /setFontSize\(/);
  assert.match(editor, /setLineHeight\(/);
  assert.match(editor, /setParagraphSpacing\(/);
});

test("il campo dinamico e un nodo inline atomico: non si spezza, non si edita dentro, in HTML e uno span con la classe e il token", () => {
  assert.match(estensioni, /name: "placeholderToken"[\s\S]*group: "inline"[\s\S]*inline: true[\s\S]*atom: true/);
  assert.match(estensioni, /contenteditable: "false"/);
  assert.match(estensioni, /class: PLACEHOLDER_CLASS/);
  assert.match(documento, /toAtoms|fromAtoms/, "nel documento il testo `{{chiave}}` diventa nodo e torna testo al salvataggio");
  assert.match(documento, /listPlaceholderTokensForSubject\(subject\)/);
  assert.match(css, /\.egw-placeholder\s*\{[\s\S]*white-space: nowrap/);
});

test("immagini: dagli allegati, con larghezza, allineamento, testo alternativo e rimozione", () => {
  assert.match(estensioni, /allowBase64: false/);
  assert.match(estensioni, /setImageWidth/);
  assert.match(estensioni, /setImageAlign/);
  assert.match(editor, /Testo alternativo dell'immagine/);
  assert.match(editor, /Togli immagine/);
  assert.match(builder, /uploadAttachment\(\{[\s\S]*ownerType: "form"[\s\S]*category: "contenuto-modulo"/, "le immagini del modulo vanno negli allegati del modulo");
  assert.match(documento, /category: "contenuto-documento"/);
  assert.ok(existsSync("src/app/api/public/forms/[publicSlug]/assets/[attachmentId]/route.ts"), "il pubblico le legge da una rotta che serve solo quelle di contenuto");
});

test("tabelle: inserisci, riga, colonna, intestazione, elimina; markup accessibile", () => {
  for (const cosa of ["insertTable(", "addRowAfter", "addColumnAfter", "deleteRow", "deleteColumn", "toggleHeaderRow", "deleteTable"]) {
    assert.ok(editor.includes(cosa), cosa);
  }
  assert.match(css, /\.egw-rich-content table[\s\S]*overflow-x: auto/, "una tabella larga scorre da sola a 375 px");
});

test("caselle, radio, dichiarazioni e caricamenti sono blocchi del builder con la loro semantica", () => {
  assert.match(builder, /const PALETTE/);
  assert.match(builder, /label: "Dichiarazioni"[^\n]*legalKind: "acknowledgement"/);
  assert.match(builder, /legalKind: "optional_consent"/);
  assert.match(card, /Cosa significa spuntare/);
  assert.match(card, /Mostra solo se/);
  assert.match(card, /Tipi di file/);
  assert.match(renderer, /data-legal-kind=\{field\.legalKind\}/);
  assert.match(renderer, /field\.type === "single_choice"/);
  assert.match(renderer, /image_upload/);
});

test("interruzione di pagina come nodo, con stampa che la rispetta", () => {
  assert.match(estensioni, /name: "pageBreak"[\s\S]*atom: true/);
  assert.match(estensioni, /class: PAGE_BREAK_CLASS/);
  assert.match(css, /\.easygame-page-break\s*\{[\s\S]*page-break-before: always/);
  assert.match(documento, /allowPageBreaks/, "nel documento si");
  assert.doesNotMatch(card, /allowPageBreaks/, "nel modulo web no: il modulo non e un foglio");
});

test("l'anteprima web e una pagina, desktop e 375 px, e non scrive", () => {
  assert.match(builder, /buildFormPreviewPath\(templateId\)/);
  assert.match(anteprima, /data-test="preview-mobile-frame"/);
  assert.match(anteprima, /w-\[375px\]/);
  assert.match(anteprima, /<FormRenderer/);
  assert.doesNotMatch(anteprima, /submitPublicForm|fetch\(`\/api\/public/, "nessun invio");
  assert.match(anteprima, /forms\.templates\.read/);
});

test("pubblicare congela una versione, duplicare crea un modello nuovo, e chi puo farlo lo dice il catalogo", () => {
  const servizio = senzaCommenti(leggi("src/lib/server/forms.ts"));
  assert.match(servizio, /formTemplateVersion\.create/);
  assert.match(servizio, /forms\.templates\.publish/);
  assert.match(servizio, /forms\.templates\.manage/);
  assert.match(servizio, /conContenutoSanificato\(/, "il contenuto si sanifica prima di salvare e prima di pubblicare");
  assert.match(servizio, /export const duplicateFormTemplate/);
});
