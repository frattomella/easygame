import assert from "node:assert/strict";
import test from "node:test";

import {
  EASYGAME_BRAND,
  escapeHtml,
  renderEmailDocument,
  resolveBrandLogo,
  sanitizeEmailColor,
  sanitizeEmailUrl,
} from "../../src/lib/server/email/template-core.ts";
import { renderEmailLayout } from "../../src/lib/server/email/layout.ts";

/**
 * **Email Template Core** (PP-05B, ADR-0116).
 *
 * Le proprieta che qui si provano non sono estetiche. Un'email e l'unico
 * artefatto del prodotto che esce dal perimetro e viene reso da un motore che
 * non controlliamo, davanti a una persona che non ha una sessione: cio che
 * finisce dentro il markup ci finisce per sempre e non si puo correggere dopo.
 */

const CLUB = {
  mode: "club",
  clubName: "ASD Esempio",
};

/* ------------------------------------------------------------------ *
 *  Escaping — il contenuto arriva da persone
 * ------------------------------------------------------------------ */

test("il nome di un club con dentro del markup non diventa markup", () => {
  const { html, text } = renderEmailDocument({
    brand: { mode: "club", clubName: '<script>alert(1)</script>' },
    blocks: [{ kind: "text", text: "Ciao" }],
  });

  assert.ok(!html.includes("<script>"), "lo script non deve sopravvivere");
  assert.ok(html.includes("&lt;script&gt;"), "deve comparire sfuggito");
  /* Nel testo semplice non c'e markup da eseguire: resta com'e scritto. */
  assert.ok(text.includes("<script>alert(1)</script>"));
});

test("ogni blocco testuale sfugge il proprio contenuto", () => {
  const veleno = '"><img src=x onerror=alert(1)>';
  /*
    Marchio club di proposito: il ripiego del logo e testo, quindi in tutto il
    documento non esiste **nessun** `<img>` legittimo. Cosi «nessun `<img>` nel
    risultato» e una asserzione secca invece di un conteggio.
  */
  const { html } = renderEmailDocument({
    brand: CLUB,
    preheader: veleno,
    blocks: [
      { kind: "heading", text: veleno },
      { kind: "text", text: veleno },
      { kind: "list", items: [veleno] },
      { kind: "code", value: veleno },
      { kind: "info", title: veleno, lines: [veleno] },
      { kind: "footnote", text: veleno },
      { kind: "cta", label: veleno, url: "https://esempio.test/x" },
    ],
  });

  assert.ok(!/<img/i.test(html), "nessun <img> deve nascere dal contenuto");
  /*
    «onerror» compare, ed e giusto: e una parola dentro un testo, e la si legge
    a schermo com'e stata scritta. Cio che non deve esistere e un `<` non
    sfuggito che la trasformi in un **attributo**. Il conteggio e la prova: i
    nove punti in cui il veleno entra — anteprima, titolo, paragrafo, voce di
    elenco, codice, titolo e riga del riquadro, nota, etichetta del pulsante —
    sono tutti e nove diventati `&lt;`. Un conteggio invece di un «contiene»
    perche un blocco che dimenticasse l'escaping farebbe **calare** il numero,
    e un `assert.ok(!contiene)` non se ne accorgerebbe.
  */
  assert.equal(
    (html.match(/&lt;img src=x onerror=alert\(1\)&gt;/g) || []).length,
    9,
    "nove punti in cui il veleno entra, nove volte reso inerte",
  );
});

test("escapeHtml copre anche l'apostrofo", () => {
  assert.equal(escapeHtml(`a'b`), "a&#39;b");
  assert.equal(escapeHtml(undefined), "");
  assert.equal(escapeHtml(null), "");
});

/* ------------------------------------------------------------------ *
 *  Link — arrivano da un modulo compilato in interfaccia
 * ------------------------------------------------------------------ */

test("solo http, https e mailto diventano un href", () => {
  assert.equal(
    sanitizeEmailUrl("https://esempio.test/paga"),
    "https://esempio.test/paga",
  );
  assert.equal(sanitizeEmailUrl("mailto:a@b.it"), "mailto:a@b.it");
  assert.equal(sanitizeEmailUrl("javascript:alert(1)"), null);
  assert.equal(sanitizeEmailUrl("JaVaScRiPt:alert(1)"), null);
  assert.equal(sanitizeEmailUrl("data:text/html,<h1>x"), null);
  assert.equal(sanitizeEmailUrl("file:///etc/passwd"), null);
  /* Relativo: in una casella di posta non esiste una pagina da cui risolverlo. */
  assert.equal(sanitizeEmailUrl("/paga"), null);
  assert.equal(sanitizeEmailUrl(""), null);
  assert.equal(sanitizeEmailUrl(null), null);
});

test("un pulsante con un link rifiutato mostra l'etichetta e nessun href", () => {
  const { html, text } = renderEmailDocument({
    brand: EASYGAME_BRAND,
    blocks: [{ kind: "cta", label: "Paga la quota", url: "javascript:alert(1)" }],
  });

  assert.ok(html.includes("Paga la quota"), "l'etichetta resta");
  assert.ok(!html.includes("javascript"), "il link non deve comparire");
  assert.ok(!/<a\s/i.test(html), "nessun collegamento deve nascere");
  assert.ok(!text.includes("javascript"));
});

test("un pulsante valido scrive anche l'indirizzo per esteso", () => {
  const url = "https://esempio.test/pay/abc";
  const { html, text } = renderEmailDocument({
    brand: EASYGAME_BRAND,
    blocks: [{ kind: "cta", label: "Paga", url }],
  });
  assert.ok(html.includes(`href="${url}"`));
  assert.ok(html.includes(url), "l'indirizzo in chiaro sotto il pulsante");
  assert.ok(text.includes(url), "e nel testo semplice");
});

/* ------------------------------------------------------------------ *
 *  I due marchi
 * ------------------------------------------------------------------ */

test("il marchio EasyGame porta il logotipo EasyGame e non dice «powered by»", () => {
  const { html, text } = renderEmailDocument({
    brand: EASYGAME_BRAND,
    blocks: [{ kind: "text", text: "Ciao" }],
  });
  assert.ok(html.includes("logotipo-b.png"));
  assert.ok(!html.includes("Powered by"), "e gia EasyGame: non si autocita");
  assert.ok(text.trim().endsWith("EasyGame"));
});

test("il marchio club porta il nome del club e il riferimento non rimovibile", () => {
  const { html, text } = renderEmailDocument({
    brand: CLUB,
    blocks: [{ kind: "text", text: "Ciao" }],
  });
  assert.ok(html.includes("ASD Esempio"));
  assert.ok(html.includes("Powered by"), "in V1 non si toglie");
  assert.ok(text.includes("Powered by EasyGame"));
});

test("non esiste un modo di chiamare il core che ometta «Powered by EasyGame»", () => {
  /*
    La prova della non-rimovibilita: qualunque cosa un club metta nei campi
    che controlla — nome, logo, colore — il riferimento resta. Non e un
    parametro, quindi non c'e una chiamata che lo spenga.
  */
  for (const attacco of [
    { mode: "club", clubName: "" },
    { mode: "club", clubName: "Powered by EasyGame" },
    { mode: "club", clubName: "X", logoUrl: "https://cattivo.test/logo.png" },
    { mode: "club", clubName: "X", accentColor: "#ffffff;display:none" },
  ]) {
    const { html, text } = renderEmailDocument({
      brand: attacco,
      blocks: [{ kind: "text", text: "Ciao" }],
    });
    assert.ok(html.includes("Powered by"), JSON.stringify(attacco));
    assert.ok(text.includes("Powered by EasyGame"), JSON.stringify(attacco));
  }
});

/* ------------------------------------------------------------------ *
 *  Ripieghi — manca il logo, manca il colore
 * ------------------------------------------------------------------ */

test("un logo su un host esterno non diventa un <img>: resta il nome scritto", () => {
  const esito = resolveBrandLogo({
    mode: "club",
    clubName: "ASD Esempio",
    logoUrl: "https://tracciatore.test/pixel.png",
  });
  assert.equal(esito.kind, "text");
  assert.equal(esito.text, "ASD Esempio");
});

test("un logo in data URL non diventa un <img>: Gmail e Outlook lo bloccano", () => {
  const esito = resolveBrandLogo({
    mode: "club",
    clubName: "ASD Esempio",
    logoUrl: "data:image/png;base64,iVBORw0KGgo=",
  });
  assert.equal(esito.kind, "text");
});

test("un logo sulla nostra origine passa", () => {
  const prima = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://app.easygame.test";
  try {
    const esito = resolveBrandLogo({
      mode: "club",
      clubName: "ASD Esempio",
      logoUrl: "https://app.easygame.test/uploads/logo.png",
    });
    assert.equal(esito.kind, "image");
    assert.equal(esito.url, "https://app.easygame.test/uploads/logo.png");
  } finally {
    process.env.NEXT_PUBLIC_APP_URL = prima;
  }
});

test("un club senza nome e senza logo produce comunque un'email leggibile", () => {
  const { html } = renderEmailDocument({
    brand: { mode: "club", clubName: "   ", logoUrl: null, accentColor: null },
    blocks: [{ kind: "text", text: "Ciao" }],
  });
  assert.ok(html.includes("Il tuo club"), "il ripiego ha un nome");
  assert.ok(html.includes("Powered by"));
});

test("solo un esadecimale diventa un colore", () => {
  assert.equal(sanitizeEmailColor("#1d4ed8"), "#1d4ed8");
  assert.equal(sanitizeEmailColor("#abc"), "#abc");
  assert.equal(sanitizeEmailColor("red"), null);
  assert.equal(sanitizeEmailColor("#fff;position:absolute"), null);
  assert.equal(sanitizeEmailColor("url(https://x.test)"), null);
  assert.equal(sanitizeEmailColor(""), null);
});

test("un colore rifiutato non esce dallo stile in linea: ricade sull'accento EasyGame", () => {
  const { html } = renderEmailDocument({
    brand: {
      mode: "club",
      clubName: "X",
      accentColor: '#fff" onload="alert(1)',
    },
    blocks: [{ kind: "cta", label: "Vai", url: "https://esempio.test" }],
  });
  assert.ok(!html.includes("onload"));
  assert.ok(html.includes("#1d4ed8"), "l'accento predefinito");
});

/* ------------------------------------------------------------------ *
 *  Il formato: cosa i client di posta sanno rendere
 * ------------------------------------------------------------------ */

test("l'impaginazione e a tabelle, senza flex, grid o <style>", () => {
  const { html } = renderEmailDocument({
    brand: EASYGAME_BRAND,
    blocks: [
      { kind: "heading", text: "T" },
      { kind: "text", text: "p" },
      { kind: "cta", label: "Vai", url: "https://esempio.test" },
      { kind: "info", title: "i", lines: ["a"] },
      { kind: "divider" },
      { kind: "code", value: "123456" },
      { kind: "list", items: ["x"] },
      { kind: "footnote", text: "n" },
    ],
  });

  assert.ok(html.includes("<table"), "l'impaginazione e a tabelle");
  assert.ok(!html.includes("<style"), "nessun foglio di stile: viene rimosso");
  assert.ok(!/display:\s*flex/.test(html), "flex non esiste in Outlook");
  assert.ok(!/display:\s*grid/.test(html), "grid nemmeno");
  assert.ok(!/class=/.test(html), "nessuna classe: non c'e chi la risolva");
  assert.ok(
    html.includes('width="600"') && html.includes("max-width:600px"),
    "larghezza fissa piu massima: e cosi che si legge su un telefono",
  );
});

test("il testo semplice esiste sempre e non e vuoto", () => {
  const { text } = renderEmailDocument({
    brand: EASYGAME_BRAND,
    blocks: [
      { kind: "heading", text: "Verifica il tuo account" },
      { kind: "code", value: "482913" },
      { kind: "list", items: ["prima", "seconda"] },
      { kind: "info", title: "Nota", lines: ["riga"] },
    ],
  });
  assert.ok(text.includes("Verifica il tuo account"));
  assert.ok(text.includes("482913"));
  assert.ok(text.includes("- prima"));
  assert.ok(text.includes("Nota"));
  assert.ok(!/\n{3,}/.test(text), "mai piu di una riga vuota di fila");
});

test("il preheader e nascosto ma presente, e non entra nel corpo visibile", () => {
  const { html } = renderEmailDocument({
    brand: EASYGAME_BRAND,
    preheader: "Il tuo codice scade tra 5 minuti",
    blocks: [{ kind: "text", text: "Ciao" }],
  });
  assert.ok(html.includes("Il tuo codice scade tra 5 minuti"));
  assert.ok(html.includes("display:none"));
  assert.ok(html.includes("mso-hide:all"), "Outlook onora solo questa");
});

/* ------------------------------------------------------------------ *
 *  Compatibilita: i quattro chiamanti che esistevano prima
 * ------------------------------------------------------------------ */

test("renderEmailLayout continua a incapsulare l'HTML di chi lo chiama", () => {
  const html = renderEmailLayout({ bodyHtml: "<p>Ciao <b>Marco</b></p>" });
  assert.ok(html.includes("<p>Ciao <b>Marco</b></p>"), "il markup passa intero");
  assert.ok(html.includes("logotipo-b.png"), "marchio EasyGame predefinito");
  assert.ok(html.includes("<table"), "e adesso passa dal core");
});

test("renderEmailLayout sa presentarsi con il marchio del club", () => {
  const html = renderEmailLayout({
    bodyHtml: "<p>Comunicazione</p>",
    brand: CLUB,
  });
  assert.ok(html.includes("ASD Esempio"));
  assert.ok(html.includes("Powered by"));
  assert.ok(!html.includes("logotipo-b.png"), "non il logotipo EasyGame in cima");
});
