import assert from "node:assert/strict";
import test from "node:test";

import {
  getEmailLogoUrl,
  renderEmailLayout,
} from "../../src/lib/server/email/layout.ts";

/**
 * Il logotipo nelle email va servito da un URL assoluto: i client di posta
 * non caricano percorsi relativi ne componenti React. Questi test bloccano
 * una regressione facile da reintrodurre (es. tornare a un `src="/images/..."`
 * relativo).
 */

test("l'URL del logo email e assoluto", () => {
  const url = getEmailLogoUrl();
  assert.match(url, /^https?:\/\//, "il logo deve avere un host, non un percorso relativo");
  assert.match(url, /\/images\/brand\/logotipo-b\.png$/);
});

test("renderEmailLayout include il logo assoluto e il corpo passato", () => {
  const html = renderEmailLayout({ bodyHtml: "<p>Ciao</p>" });
  assert.match(html, /<img src="https?:\/\/[^"]+\/images\/brand\/logotipo-b\.png"/);
  assert.match(html, /<p>Ciao<\/p>/);
});

test("renderEmailLayout non referenzia file locali o percorsi relativi per l'immagine", () => {
  const html = renderEmailLayout({ bodyHtml: "" });
  const imgSrcMatch = html.match(/<img src="([^"]+)"/);
  assert.ok(imgSrcMatch, "deve esserci un tag <img> con il logo");
  assert.doesNotMatch(imgSrcMatch[1], /^file:|^\.\.?\//);
});
