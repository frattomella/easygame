import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  CONTACT_LABEL,
  CONTACT_URL,
  FAQ_ITEMS,
  HUB_SECTIONS,
  MARKETPLACE_ITEMS,
  NEWS_ITEMS,
  TUTORIAL_ITEMS,
  isHubSection,
} from "@/components/hub/v2/hub-content";

/**
 * Parita della pagina HUB V2 con l'audit V1
 * (`docs/redesign/audit/wave-e-hub.md`) e con ADR-0014: il catalogo resta
 * statico, nessuna chiamata dati, e i tre pulsanti che nella V1 non
 * facevano niente («Acquista», «Invia Feedback», «Invia Proposta») non
 * tornano come promesse vuote.
 */
const read = (relative) => readFileSync(path.join(process.cwd(), relative), "utf8");
const sources = {
  page: read("src/app/hub/page.tsx"),
  content: read("src/components/hub/v2/hub-content.ts"),
  sections: read("src/components/hub/v2/hub-sections.tsx"),
};
const everything = Object.values(sources).join("\n");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("/hub: guscio e ambiente di lavoro; niente cielo viola, glass, emoji o punti esclamativi", () => {
  assert.match(sources.page, /<Sidebar \/>/);
  assert.match(sources.page, /<Header title="EasyGame HUB" \/>/);
  assert.match(sources.page, /<PageHeader/);
  assert.match(sources.page, /bg-egw-page/);
  const pulito = senzaCommenti(everything);
  assert.doesNotMatch(pulito, /bg-gradient-to-|backdrop-blur|animate-pulse/);
  assert.doesNotMatch(pulito, /[\u{1F300}-\u{1FAFF}]/u, "niente emoji");
  assert.doesNotMatch(pulito, /[a-zà-ù]![\s"'<]/i, "niente punti esclamativi nei testi");
  assert.doesNotMatch(pulito, /@\/components\/ui\/(card|badge|button|input|textarea|label|tabs)/);
});

test("/hub: ADR-0014 — nessuna chiamata dati, nessuna persistenza oltre alla sezione aperta", () => {
  const pulito = senzaCommenti(everything);
  assert.doesNotMatch(pulito, /apiRequest|[^\w]fetch\(|supabase|simplified-db/);
  assert.match(sources.page, /usePreference<HubSection>\("hub", "section", "marketplace"\)/);
  assert.doesNotMatch(pulito, /Acquista|Invia Feedback|Invia Proposta|showToast/, "i pulsanti che fingevano restano fuori (GAP dichiarati)");
});

test("/hub: le cinque sezioni della V1, come controllo segmentato", () => {
  assert.deepEqual(
    HUB_SECTIONS.map((s) => s.label),
    ["Marketplace", "Novità", "Tutorial e FAQ", "Feedback", "Proposte"],
  );
  assert.equal(isHubSection("news"), true);
  assert.equal(isHubSection("boh"), false);
  assert.match(sources.page, /<SegmentedControl<HubSection>/);
  for (const component of ["HubMarketplace", "HubNews", "HubTutorials", "HubFeedback", "HubProposals"]) {
    assert.ok(sources.page.includes(`<${component} />`), `manca la sezione ${component}`);
  }
});

test("/hub: il catalogo, le novità, i tutorial e le FAQ della V1 sono tutti presenti", () => {
  assert.deepEqual(
    MARKETPLACE_ITEMS.map((i) => [i.name, i.monthlyPrice, i.popular]),
    [
      ["Analytics Premium", 9.99, true],
      ["Multi-Club Manager", 19.99, false],
      ["Calendario Avanzato", 4.99, false],
      ["Document Manager Pro", 14.99, true],
    ],
  );
  assert.equal(MARKETPLACE_ITEMS.reduce((n, i) => n + i.features.length, 0), 12);
  assert.deepEqual(
    NEWS_ITEMS.map((n) => [n.title, n.date]),
    [
      ["Nuova funzionalità: Gestione Gare", "2025-01-15"],
      ["Aggiornamento Dashboard", "2025-01-10"],
      ["Miglioramenti Performance", "2025-01-05"],
    ],
  );
  assert.deepEqual(
    TUTORIAL_ITEMS.map((t) => [t.title, t.duration, t.category]),
    [
      ["Come creare il tuo primo club", "5 min", "Iniziare"],
      ["Gestire gli atleti", "8 min", "Atleti"],
      ["Pianificare gli allenamenti", "6 min", "Allenamenti"],
      ["Gestire i certificati medici", "4 min", "Certificati"],
    ],
  );
  assert.equal(FAQ_ITEMS.length, 5);
  assert.ok(FAQ_ITEMS.some((f) => f.question === "Come funziona il sistema di token per i genitori?"));
  assert.match(sources.sections, /formatMoney\(item\.monthlyPrice\)/, "il prezzo e un importo del sistema, non un testo");
  assert.match(sources.sections, /formatDateShort\(news\.date\)/);
  assert.match(sources.sections, /<CollapsedSection key=\{faq\.id\} id=\{faq\.id\} recordType="hub-faq"/);
  assert.match(sources.sections, /Potenzia il tuo club/);
  assert.match(sources.sections, /Ultime novità/);
  assert.match(sources.sections, /Video tutorial/);
  assert.match(sources.sections, /Domande frequenti/);
  assert.match(sources.sections, /Il tuo feedback conta/);
  assert.match(sources.sections, /Hai un'idea\?/);
});

test("/hub: il canale di contatto reale resta, ed e l'unico verbo delle sezioni Feedback e Proposte", () => {
  assert.equal(CONTACT_URL, "https://www.cedisoft.it/contatti/");
  assert.equal(CONTACT_LABEL, "www.cedisoft.it/contatti");
  assert.match(sources.sections, /href=\{CONTACT_URL\} target="_blank" rel="noopener noreferrer"/);
  assert.match(sources.sections, /Contattaci direttamente/);
  assert.match(sources.sections, /Per richieste urgenti o collaborazioni/);
});
