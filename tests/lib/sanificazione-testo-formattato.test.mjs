import test, { before } from "node:test";
import assert from "node:assert/strict";

/**
 * La sanificazione del testo formattato (ADR-0190 §3): allowlist, e il
 * server e l'autorita. Qui si prova la funzione con HTML ostile.
 */

let sanitizeRichHtml;
let richHtmlToText;

before(async () => {
  ({ sanitizeRichHtml, richHtmlToText } = await import("../../src/lib/rich-text/sanitize.ts"));
});

test("script, gestori di eventi, javascript: e iframe non sopravvivono", () => {
  const out = sanitizeRichHtml(
    '<p onclick="x()">a</p><script>alert(1)</script><iframe src="https://evil"></iframe><a href="javascript:alert(1)">l</a><img src="x" onerror="alert(1)"><svg onload="x"></svg><style>p{}</style>',
  );
  assert.doesNotMatch(out, /script|onclick|onerror|onload|iframe|javascript:|svg|<style/);
  assert.match(out, /<p>a<\/p>/);
});

test("le immagini valgono solo dagli allegati del sistema: niente data:, niente host esterni", () => {
  const ok = sanitizeRichHtml('<img src="/api/v1/attachments/11111111-2222-4333-8444-555555555555" alt="x" style="width: 50%; height: auto">');
  assert.match(ok, /<img src="\/api\/v1\/attachments\/11111111-2222-4333-8444-555555555555" alt="x" style="width:50%;height:auto" \/>/);
  assert.equal(sanitizeRichHtml('<p><img src="data:image/png;base64,AAAA"></p>'), "<p></p>");
  assert.equal(sanitizeRichHtml('<p><img src="https://example.com/x.png"></p>'), "<p></p>");
  assert.equal(sanitizeRichHtml('<p><img src="/api/v1/attachments/../../etc/passwd"></p>'), "<p></p>");
});

test("i link accettano http(s) e mailto, si aprono altrove e non toccano la finestra madre", () => {
  const out = sanitizeRichHtml('<a href="https://example.com">x</a><a href="mailto:a@b.it">m</a><a href="ftp://x">f</a>');
  assert.match(out, /<a href="https:\/\/example.com" target="_blank" rel="noopener noreferrer nofollow">x<\/a>/);
  assert.match(out, /href="mailto:a@b.it"/);
  assert.doesNotMatch(out, /ftp:/);
});

test("gli stili sono una scala chiusa: dimensione, allineamento, interlinea, spazio; il resto cade", () => {
  const out = sanitizeRichHtml('<p style="font-size: 14px; line-height: 1.5; margin-bottom: 8px; text-align: justify; color: red; position: fixed; background: url(x)">t</p>');
  assert.match(out, /font-size:14px/);
  assert.match(out, /line-height:1\.5/);
  assert.match(out, /margin-bottom:8px/);
  assert.match(out, /text-align:justify/);
  assert.doesNotMatch(out, /color|position|background|url\(/);
  assert.equal(sanitizeRichHtml('<p style="font-size: 900px">t</p>'), "<p>t</p>", "una dimensione fuori scala cade");
});

test("tabelle, elenchi, titoli, interruzione di pagina e segnaposto restano; un div qualunque no", () => {
  const out = sanitizeRichHtml(
    '<h1>T</h1><h4>no</h4><ul><li>a</li></ul><table><thead><tr><th colspan="2">h</th></tr></thead><tbody><tr><td>c</td></tr></tbody></table><div class="easygame-page-break"></div><div class="altro">x</div><span class="egw-placeholder" data-token="athlete.firstName">{{athlete.firstName}}</span><span class="rubata">s</span>',
  );
  assert.match(out, /<h1>T<\/h1>/);
  assert.match(out, /no/, "il testo di un tag non ammesso resta, il tag no");
  assert.doesNotMatch(out, /<h4>/);
  assert.match(out, /<th colspan="2">h<\/th>/);
  assert.match(out, /<div class="easygame-page-break"><\/div>/);
  assert.doesNotMatch(out, /class="altro"/);
  assert.match(out, /<span class="egw-placeholder" data-token="athlete.firstName">{{athlete.firstName}}<\/span>/);
  assert.doesNotMatch(out, /rubata/);
});

test("il solo testo, per impronte e riassunti", () => {
  assert.equal(richHtmlToText("<h2>Informativa</h2><p>Testo   con <b>grassetto</b></p>"), "Informativa Testo con grassetto");
});
