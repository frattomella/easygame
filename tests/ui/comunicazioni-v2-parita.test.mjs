import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  DELIVERY_STATUS,
  SHELF_LABELS,
  SHELF_ORDER,
  deliveryStatusSpec,
  ruleStatusSpec,
  shelfStatusSpec,
} from "@/components/communications/v2/communication-status";
import {
  canPublishAnnouncement,
  canWithdrawAnnouncement,
  countByShelf,
  describeAudience,
  describeReads,
} from "@/components/communications/v2/announcement-model";
import {
  isRuleDraftDirty,
  offsetsToText,
  parseCategories,
  parseOffsets,
  ruleDraftFrom,
  rulePayload,
} from "@/components/communications/v2/automation-model";
import { audienceCriteriaPayload, audienceSelectionError, emptyOptionsMessage } from "@/components/communications/v2/audience-model";
import { PERSON_STATUS, ACTIVITY_STATUS } from "@/lib/web/status";

/**
 * Parita delle tre pagine Comunicazioni V2 con l'audit V1
 * (`docs/redesign/audit/wave-e-comunicazioni.md`).
 *
 * Il redesign cambia forma, non capacita: ogni etichetta, azione, campo ed
 * endpoint che l'audit elenca deve restare nel sorgente V2. Un test statico
 * non prova che funzioni — lo fa il lead a schermo — ma impedisce che una
 * capacita sparisca per distrazione.
 */
const read = (relative) => readFileSync(path.join(process.cwd(), relative), "utf8");
const V2 = "src/components/communications/v2";
const sources = {
  send: read("src/app/communications/page.tsx"),
  board: read("src/app/communications/bacheca/page.tsx"),
  automations: read("src/app/communications/automazioni/page.tsx"),
  picker: read(`${V2}/audience-picker.tsx`),
  audienceModel: read(`${V2}/audience-model.ts`),
  nav: read(`${V2}/communications-nav.tsx`),
  preview: read(`${V2}/communication-preview.tsx`),
  status: read(`${V2}/communication-status.ts`),
  announcementModel: read(`${V2}/announcement-model.ts`),
  announcementDrawer: read(`${V2}/announcement-drawer.tsx`),
  announcementInspector: read(`${V2}/announcement-inspector.tsx`),
  automationModel: read(`${V2}/automation-model.ts`),
  rulePanel: read(`${V2}/automation-rule-panel.tsx`),
};
const everything = Object.values(sources).join("\n");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ------------------------------------------------------------- regole comuni */

test("comunicazioni V2: nessuna conferma nativa, nessun fetch diretto, nessun gradiente Tailwind, nessuna emoji", () => {
  const pulito = senzaCommenti(everything);
  assert.doesNotMatch(pulito, /window\.confirm|window\.alert|[^.\w]confirm\(\s*"/, "nessuna conferma nativa");
  assert.doesNotMatch(pulito, /[^\w]fetch\(/, "nessun fetch diretto: si passa da apiRequest");
  assert.doesNotMatch(pulito, /bg-gradient-to-/, "niente gradienti Tailwind");
  assert.doesNotMatch(pulito, /[\u{1F300}-\u{1FAFF}]/u, "niente emoji");
  assert.doesNotMatch(pulito, /@\/components\/ui\/(card|badge|button|input|label|textarea|tabs)/, "solo le fondamenta del Web V2");
});

test("comunicazioni V2: le tre pagine montano il guscio e la navigazione fra le sezioni", () => {
  for (const page of [sources.send, sources.board, sources.automations]) {
    assert.match(page, /<Sidebar \/>/);
    assert.match(page, /<Header title="/);
    assert.match(page, /<PageHeader/);
    assert.match(page, /<CommunicationsNav \/>/);
  }
  assert.ok(sources.nav.includes('if (pathname.startsWith("/communications/bacheca")) return "board";'));
  assert.ok(sources.nav.includes('if (pathname.startsWith("/communications/automazioni")) return "automations";'));
  assert.match(sources.nav, /href: "\/communications\/bacheca"/);
  assert.match(sources.nav, /href: "\/communications\/automazioni"/);
});

/* ------------------------------------------------------------- /communications */

test("/communications: stessi criteri, stesso endpoint, stesso identificativo persistito", () => {
  const elenco = /const CRITERI_OFFERTI = \[([\s\S]*?)\] as const/.exec(sources.send);
  assert.ok(elenco);
  for (const kind of ["all_families", "category_ids", "group_ids", "site_ids", "event_convocated", "event_no_rsvp", "overdue_payments", "certificate_missing_or_expiring", "no_account"]) {
    assert.ok(elenco[1].includes(`"${kind}"`), `manca il criterio ${kind}`);
  }
  assert.match(sources.send, /apiRequest<any>\("\/api\/v1\/communications"/);
  assert.match(sources.send, /communication_id: communicationId/);
  assert.match(sources.send, /\.\.\.\(modalita === "preview" \? \{ preview: true \} : \{\}\)/);
  assert.match(sources.send, /COMMUNICATION_ID_KEY = "easygame_communication_id"/);
  assert.match(sources.send, /window\.sessionStorage\.getItem\(COMMUNICATION_ID_KEY\)/);
  assert.match(sources.send, /Nuova comunicazione/);
  assert.match(sources.send, /Parti da un testo/);
  assert.match(sources.send, /subject: "Comunicazione da \{\{club\.name\}\}"/);
  assert.match(sources.send, /Vedi chi raggiungo/);
  assert.match(sources.send, /variant="neutral"/, "«Vedi chi raggiungo» e navy pieno: il gradiente e «Manda»");
});

test("/communications: le frasi di validazione e dei toast della V1", () => {
  assert.match(sources.send, /Oggetto e testo del messaggio sono obbligatori/);
  assert.match(sources.audienceModel, /Nessuna voce disponibile per questo criterio: scegline un altro/);
  assert.match(sources.audienceModel, /Seleziona almeno una voce per questo criterio/);
  assert.match(sources.send, /Inviato a \$\{esito\.totals\.sent\} destinatari/);
  assert.match(sources.send, /Nessun messaggio inviato: leggi l'esito per destinatario/);
  assert.match(sources.send, /"Operazione non riuscita"/);
  assert.ok(sources.send.includes("{{athlete.first_name}}"), "i segnaposto disponibili restano scritti sotto il testo");
  assert.equal(audienceSelectionError("category_ids", [], []), "Nessuna voce disponibile per questo criterio: scegline un altro");
  assert.equal(audienceSelectionError("category_ids", [], [{ id: "a", label: "A" }]), "Seleziona almeno una voce per questo criterio");
  assert.equal(audienceSelectionError("all_families", [], []), null);
  assert.deepEqual(audienceCriteriaPayload("all_families", ["x"]), [{ kind: "all_families" }]);
  assert.deepEqual(audienceCriteriaPayload("category_ids", ["x"]), [{ kind: "category_ids", values: ["x"] }]);
  assert.match(emptyOptionsMessage("event_no_rsvp"), /conferma di presenza attiva/);
  assert.match(emptyOptionsMessage("event_convocated"), /prossimi 30 giorni/);
  assert.equal(emptyOptionsMessage("site_ids"), "Nessuna voce disponibile per questo criterio.");
});

test("/communications: l'anteprima mostra numeri, blocco, esempio, esclusi con motivo; l'esito per destinatario e la ripresa", () => {
  assert.match(sources.preview, /label="raggiungibili"/);
  assert.match(sources.preview, /label="esclusi"/);
  assert.match(sources.preview, /preview\.blockedReason/);
  assert.match(sources.preview, /Come lo leggera \{preview\.sample\.to\}/);
  assert.match(sources.preview, /Senza valore: \{preview\.sample\.unresolved\.join\(", "\)\}/);
  assert.match(sources.preview, /AUDIENCE_EXCLUSION_LABELS/);
  assert.match(sources.preview, /Manda a \{formatInteger\(preview\.counts\.recipients\)\}/);
  assert.match(sources.preview, /preview && preview\.canSend \?/, "senza canSend il pulsante e assente, e il blocco spiega");
  assert.match(sources.preview, /Continua: restano \{formatInteger\(outcome\.remaining\)\}/);
  assert.match(sources.preview, /Inviati <span className="egw-num">\{formatInteger\(outcome\.totals\.sent\)\}<\/span> · saltati/);
  assert.match(sources.preview, /module="comunicazioni-destinatari"/);
  assert.match(sources.preview, /module="comunicazioni-esito"/);
  assert.equal(deliveryStatusSpec("sent"), DELIVERY_STATUS.sent);
  assert.equal(deliveryStatusSpec("failed").weight, "urgent");
  assert.equal(deliveryStatusSpec("boh").label, "NON REGISTRATO");
  assert.match(sources.send, /useConfirm\(\)/, "mandare e un gesto notevole: una conferma, nessuna scrittura");
});

/* ------------------------------------------------------------- /communications/bacheca */

test("/communications/bacheca: sei criteri, quattro scaffali come viste, griglia unica", () => {
  const elenco = /const CRITERI_OFFERTI = \[([\s\S]*?)\] as const/.exec(sources.board);
  assert.ok(elenco);
  for (const kind of ["all_families", "category_ids", "group_ids", "site_ids", "event_convocated", "event_no_rsvp"]) {
    assert.ok(elenco[1].includes(`"${kind}"`));
  }
  assert.doesNotMatch(elenco[1], /overdue_payments|certificate_missing_or_expiring|no_account/, "la bacheca non offre i criteri economici e sanitari");
  assert.match(sources.board, /module="bacheca"/);
  assert.match(sources.board, /apiRequest<Announcement\[\]>\("\/api\/v1\/announcements"\)/);
  assert.match(sources.board, /apiRequest<any>\(`\/api\/v1\/announcements\/\$\{announcementId\}`, \{ method: "POST", body: \{ action \} \}\)/);
  assert.deepEqual(SHELF_ORDER, ["draft", "scheduled", "current", "expired"]);
  assert.deepEqual(Object.values(SHELF_LABELS), ["Bozze", "Programmati", "In bacheca", "Scaduti"]);
  assert.equal(shelfStatusSpec("draft"), PERSON_STATUS.draft);
  assert.equal(shelfStatusSpec("scheduled"), ACTIVITY_STATUS.scheduled);
  assert.equal(shelfStatusSpec("current").label, "IN BACHECA");
  assert.equal(shelfStatusSpec("expired").weight, "quiet", "uno scaduto in archivio non e un problema");
  for (const column of ['id: "title"', 'id: "shelf"', 'id: "audience"', 'id: "publishAt"', 'id: "expiresAt"', 'id: "reads"']) {
    assert.ok(sources.board.includes(column), `manca la colonna ${column}`);
  }
});

test("/communications/bacheca: pubblica e ritira con i toast della V1; il modulo e un cassetto con la guardia", () => {
  assert.match(sources.board, /label: "Pubblica", icon: <Send \/>, hidden: \(row\) => !canPublishAnnouncement\(row\)/);
  assert.match(sources.board, /label: "Ritira", icon: <Undo2 \/>, hidden: \(row\) => !canWithdrawAnnouncement\(row\)/);
  assert.ok(sources.board.includes("In bacheca per ${esito.delivered} famiglie${esito.withoutAccount ? `, ${esito.withoutAccount} senza account` : \"\"}"));
  assert.match(sources.board, /Nessuna famiglia con un account puo leggerlo/);
  assert.match(sources.board, /Annuncio ritirato dalla bacheca/);
  assert.match(sources.board, /Bozza salvata: pubblicala quando vuoi/);
  assert.match(sources.board, /"Annuncio non creato"/);
  assert.match(sources.board, /"Bacheca non leggibile"/);
  assert.match(sources.board, /Il primo che scrivi resta in bacheca finche non scade, e chi arriva dopo lo trova\./);
  assert.match(sources.announcementDrawer, /<Drawer/);
  assert.match(sources.announcementDrawer, /dirty=\{dirty\}/);
  assert.match(sources.announcementDrawer, /Salva come bozza/);
  for (const label of ['label="Titolo"', 'label="Testo"', 'label="Chi lo legge"', 'label="Esce il"', 'label="Scade il"']) {
    assert.ok(sources.announcementDrawer.includes(label), `manca il campo ${label}`);
  }
  assert.match(sources.announcementDrawer, /Domenica il campo e chiuso/);
  assert.match(sources.announcementDrawer, /Senza data esce quando lo pubblichi\. Un avviso scaduto non viene cancellato: esce dalla bacheca e resta in archivio\./);
  assert.match(sources.announcementDrawer, /publishAt: publishAt \|\| null/);
  assert.match(sources.announcementDrawer, /expiresAt: expiresAt \|\| null/);
  assert.match(sources.announcementInspector, /Letto da/);
  assert.equal(canPublishAnnouncement({ status: "draft" }), true);
  assert.equal(canPublishAnnouncement({ status: "published" }), false);
  assert.equal(canWithdrawAnnouncement({ shelf: "current" }), true);
  assert.equal(canWithdrawAnnouncement({ shelf: "scheduled" }), true);
  assert.equal(canWithdrawAnnouncement({ shelf: "expired" }), false);
  assert.equal(describeReads({ status: "published", readCount: 3, audienceCount: 20 }), "3/20");
  assert.equal(describeReads({ status: "draft", readCount: 0, audienceCount: 0 }), null);
  assert.equal(describeAudience([{ kind: "category_ids", values: ["a", "b"] }, { kind: "all_families" }]), "Per categoria (2) · Tutte le famiglie");
  assert.deepEqual(countByShelf([{ shelf: "draft" }, { shelf: "current" }, { shelf: "current" }]), { draft: 1, scheduled: 0, current: 2, expired: 0 });
});

/* ------------------------------------------------------------- /communications/automazioni */

test("/communications/automazioni: stessi endpoint, stessi campi per regola, salva per regola, esegui adesso con conferma", () => {
  assert.match(sources.automations, /apiRequest<any>\("\/api\/v1\/automations"\)/);
  assert.match(sources.automations, /body: \{ rule: rulePayload\(rule, draft\) \}/);
  assert.match(sources.automations, /apiRequest<any>\("\/api\/v1\/automations\/run", \{ method: "POST", body: \{\} \}\)/);
  assert.match(sources.automations, /Esegui adesso/);
  assert.match(sources.automations, /useConfirm\(\)/);
  assert.ok(sources.automations.includes("`${rule.label}: configurazione salvata`"));
  assert.match(sources.automations, /"Salvataggio non riuscito"/);
  assert.match(sources.automations, /"Esecuzione non riuscita"/);
  assert.ok(sources.automations.includes("Occorrenze trovate: ${response.data.occurrences || 0} · inviati ${totali.sent} · saltati ${totali.skipped} · falliti ${totali.failed}"));
  assert.match(sources.automations, /Il giro parte ogni notte/);
  assert.match(sources.automations, /<SectionNav/);
  for (const field of ["Anticipi (giorni, al massimo ${MAX_AUTOMATION_OFFSETS})", 'label="Pubblico"', 'label="Come arriva alla societa"', 'label="Documenti da sorvegliare"', 'label="Oggetto"', 'label="Testo"']) {
    assert.ok(sources.rulePanel.includes(field), `manca il campo ${field}`);
  }
  assert.match(sources.rulePanel, /<Toggle/);
  assert.match(sources.rulePanel, /disabled=\{draft\.audience === "family"\}/);
  assert.match(sources.rulePanel, /rule\.supportsCategoryFilter \?/);
  assert.match(sources.rulePanel, /SUGGESTED_ATTACHMENT_CATEGORIES\.map/);
  assert.match(sources.rulePanel, /Nessun anticipo: la regola non parte/);
  assert.match(sources.rulePanel, /Anteprima con dati di esempio/);
  assert.match(sources.rulePanel, /Segnaposto senza valore:/);
  assert.match(sources.rulePanel, /Predefiniti: /);
  assert.match(sources.rulePanel, /Modifiche non salvate/);
  assert.match(sources.rulePanel, /variant="neutral" icon=\{<Save \/>\}/, "cinque «Salva» sono navy, non cinque gradienti");
  assert.equal(ruleStatusSpec(true).label, "ACCESA");
  assert.equal(ruleStatusSpec(false).label, "SPENTA");
});

test("/communications/automazioni: anticipi e categorie si leggono come nella V1", () => {
  assert.deepEqual(parseOffsets("7, tre, 3"), [7, 3], "cio che non e un numero resta fuori, non diventa zero");
  assert.deepEqual(parseOffsets(""), []);
  assert.equal(offsetsToText([7, 3]), "7, 3");
  assert.deepEqual(parseCategories("BLSD, primo soccorso\n documento-identita"), ["BLSD", "primo soccorso", "documento-identita"]);
  const rule = {
    id: "r1",
    trigger: "document_expiry",
    enabled: true,
    offsetDays: [7, 3],
    audience: "family",
    delivery: "immediate",
    template: { subject: "S", body: "B" },
    categories: ["blsd"],
    updatedAt: null,
    label: "Documenti",
    description: "",
    direction: "before",
    defaultOffsetDays: [7],
    supportsCategoryFilter: true,
    sample: { subject: "", text: "", unresolved: [] },
  };
  const draft = ruleDraftFrom(rule);
  assert.equal(isRuleDraftDirty(rule, draft), false);
  assert.equal(isRuleDraftDirty(rule, { ...draft, enabled: false }), true);
  const payload = rulePayload(rule, { ...draft, offsetText: "7, 3, x", categoryText: "blsd, documento-identita" });
  assert.deepEqual(payload, {
    trigger: "document_expiry",
    enabled: true,
    offsetDays: [7, 3],
    audience: "family",
    delivery: "immediate",
    template: { subject: "S", body: "B" },
    categories: ["blsd", "documento-identita"],
  });
  assert.deepEqual(rulePayload({ ...rule, supportsCategoryFilter: false }, draft).categories, []);
});
