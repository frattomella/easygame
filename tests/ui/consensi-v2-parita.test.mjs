import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  DECISION_STATUS,
  DECISION_VIEWS,
  DEFINITION_STATUS,
  DEFINITION_VIEWS,
  SOURCE_LABELS,
  SUBJECT_KIND_LABELS,
  decisionStatusSpec,
  definitionStatusSpec,
  describePublishedText,
  sourceLabel,
  statoSoggettoId,
  subjectKindLabel,
} from "@/components/consensi/v2/consensi-model";
import { CONSENT_SOURCES, CONSENT_SUBJECT_KINDS } from "@/lib/consents/model";

/**
 * Parita della pagina Consensi V2 con l'audit V1
 * (`docs/redesign/audit/wave-e-consensi.md`).
 *
 * Il redesign cambia forma, non capacita: ogni etichetta, azione, campo ed
 * endpoint che l'audit elenca deve restare nel sorgente V2. Un test statico
 * non prova che funzioni — lo fa il lead a schermo — ma impedisce che una
 * capacita sparisca per distrazione.
 */
const read = (relative) => readFileSync(path.join(process.cwd(), relative), "utf8");
const V2 = "src/components/consensi/v2";
const sources = {
  page: read("src/app/consensi/page.tsx"),
  model: read(`${V2}/consensi-model.ts`),
  drawers: read(`${V2}/consent-drawers.tsx`),
};
const everything = Object.values(sources).join("\n");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("/consensi: guscio V2, intestazione con i numeri e un solo primario di pagina", () => {
  assert.match(sources.page, /<Header title="Consensi" \/>/);
  assert.doesNotMatch(sources.page, /<MobileTopBar/);
  assert.match(sources.page, /bg-egw-page/);
  assert.match(sources.page, /title="Consensi"/);
  assert.match(sources.page, /Una revoca non cancella niente: aggiunge una riga\./);
  assert.match(sources.page, /label="attivi"/);
  assert.match(sources.page, /label="senza testo"/);
  assert.equal((sources.page.match(/variant="primary"/g) || []).length, 2, "il primario di pagina e quello dello stato vuoto: nessun altro gradiente");
  assert.match(sources.page, /puoConfigurare \? \(\s*<Button variant="primary" icon=\{<Plus \/>\}/, "«Nuovo consenso» solo a chi configura");
});

test("/consensi: le tre letture e le quattro scritture sono quelle della V1", () => {
  assert.match(sources.page, /"\/api\/v1\/consents\?include_retired=1"/);
  assert.match(sources.page, /\/api\/v1\/consents\/\$\{definitionId\}\/records\?limit=50/);
  assert.match(sources.page, /\/api\/v1\/consents\/states\?subject_kind=\$\{encodeURIComponent\(soggettoTipo\)\}&subject_id=\$\{encodeURIComponent\(id\)\}/);
  assert.match(sources.page, /apiRequest<Definizione>\("\/api\/v1\/consents", \{ method: "POST", body: values \}\)/);
  assert.match(sources.page, /\/api\/v1\/consents\/\$\{definizione\.id\}\/versions`, \{ method: "POST", body: \{ body_text: testo \} \}/);
  assert.match(sources.page, /\/api\/v1\/consents\/\$\{definizione\.id\}`, \{ method: "PATCH", body: \{ status: stato \} \}/);
  assert.match(sources.page, /\/api\/v1\/consents\/\$\{definizione\.id\}\/records`, \{\s*method: "POST"/);
  assert.match(sources.page, /source: "manual"/);
  assert.match(sources.page, /subject_label: soggettoNome\.trim\(\)/);
  assert.doesNotMatch(senzaCommenti(everything), /\bfetch\s*\(/, "nessun fetch diretto: il trasporto e apiRequest");
});

test("/consensi: i tre predicati della V1, con le stesse chiavi", () => {
  assert.match(sources.page, /import \{ canManageConsentDefinitions, canReadConsentRecords, canRecordConsentDecision \} from "@\/lib\/consents\/permissions"/);
  assert.match(sources.page, /puoConfigurare = canManageConsentDefinitions\(ruolo\)/);
  assert.match(sources.page, /puoRegistrare = canRecordConsentDecision\(ruolo\)/);
  assert.match(sources.page, /puoLeggere = canReadConsentRecords\(ruolo\)/);
  assert.match(sources.page, /Accesso negato: i consensi del club li legge chi ci lavora dentro\./);
  assert.match(sources.page, /\{puoRegistrare \? \(\s*<Field label="Nota"/, "la nota solo a chi registra");
  assert.match(sources.page, /hidden: \(\) => !puoConfigurare/, "«Pubblica un testo nuovo» solo a chi configura");
  assert.match(sources.page, /actions=\{\s*puoConfigurare \? \(/, "Ritira e Riattiva solo a chi configura");
});

test("/consensi: la griglia delle definizioni porta titolo, chiave, stato, versione e obbligatorio", () => {
  assert.match(sources.page, /module="consensi"/);
  for (const column of ['id: "identity"', 'id: "status"', 'id: "version"', 'id: "required"']) {
    assert.ok(sources.page.includes(column), `manca la colonna ${column}`);
  }
  for (const hidden of ['id: "description"', 'id: "key"']) {
    assert.ok(sources.page.includes(hidden), `manca la colonna nascosta ${hidden}`);
  }
  assert.match(sources.page, /Nessun testo pubblicato/);
  assert.match(sources.page, /activeRowId=\{selezionata \|\| null\}/, "la riga selezionata e la riga attiva");
  assert.deepEqual(
    DEFINITION_VIEWS.map((v) => v.id),
    ["in-use", "active", "draft", "retired", "required", "unpublished"],
  );
  assert.match(sources.page, /Nessun consenso definito/);
  assert.match(sources.page, /La direzione del club non ne ha ancora definiti\./);
  assert.match(sources.page, /Seleziona un consenso per vederne il testo e le decisioni\./);
});

test("/consensi: definire un consenso e un cassetto con i quattro campi e la regola della chiave", () => {
  assert.match(sources.drawers, /Definisci un consenso/);
  assert.match(sources.drawers, /placeholder="images"/);
  assert.match(sources.drawers, /placeholder="Consenso immagini"/);
  assert.match(sources.drawers, /Minuscole, cifre, trattino\. La citano i moduli e i modelli: dopo non si cambia\./);
  assert.match(sources.drawers, /Segnala chi non lo ha dato/);
  assert.match(sources.drawers, /Chiave e titolo sono obbligatori/);
  assert.match(sources.drawers, /explainConsentKeyDenial\(nuovaChiave\)/, "la regola della chiave e quella del dominio");
  assert.match(sources.drawers, /key: normalizeConsentKey\(nuovaChiave\)/);
  assert.match(sources.drawers, /Crea in bozza/);
  assert.match(sources.page, /Consenso creato: ora pubblica il testo/);
  assert.match(sources.page, /setSelezionata\(risposta\.data\.id\)/, "dopo la creazione si apre la nuova definizione");
});

test("/consensi: pubblicare un testo e un cassetto, ritirare e riattivare chiedono conferma", () => {
  assert.match(sources.drawers, /Pubblica un testo nuovo/);
  assert.match(sources.drawers, /Pubblica versione \{nextVersion\}/);
  assert.match(sources.drawers, /Il testo del consenso non può essere vuoto/);
  assert.match(sources.drawers, /Una versione pubblicata non si modifica più\. I consensi già raccolti restano validi/);
  assert.match(sources.page, /Testo pubblicato\. I consensi già raccolti restano validi e vengono segnalati come dati su una versione precedente/);
  assert.match(sources.page, /definizione\.status === "active" \? \([\s\S]{0,200}Ritira/);
  assert.match(sources.page, /definizione\.status === "retired" \? \([\s\S]{0,200}Riattiva/);
  assert.match(sources.page, /title: `Ritirare «\$\{definizione\.title\}»\?`/);
  assert.match(sources.page, /title: `Riattivare «\$\{definizione\.title\}»\?`/);
  assert.doesNotMatch(senzaCommenti(everything), /window\.confirm|[^.\w]confirm\(\s*"/, "nessuna conferma nativa");
});

test("/consensi: il soggetto, la ricerca «cosa ha firmato» e le tre decisioni", () => {
  assert.match(sources.page, /options=\{SUBJECT_KIND_OPTIONS\}/);
  assert.deepEqual(Object.keys(SUBJECT_KIND_LABELS), [...CONSENT_SUBJECT_KINDS]);
  assert.match(sources.page, /label="Identificativo"/);
  assert.match(sources.page, /placeholder="Rossi Mario"/);
  assert.match(sources.page, /placeholder="Modulo cartaceo consegnato in segreteria"/);
  assert.match(sources.page, /Cosa ha firmato/);
  assert.match(sources.page, /Indica il soggetto da cercare/);
  assert.match(sources.page, /Indica il soggetto della decisione/);
  for (const decision of ['registra("accepted")', 'registra("rejected")', 'registra("revoked")']) {
    assert.ok(sources.page.includes(decision), `manca ${decision}`);
  }
  assert.match(sources.page, /title: `Revocare il consenso di/, "la revoca e notevole: una conferma");
  assert.match(sources.page, /Revoca registrata\. L'accettazione precedente resta nello storico/);
  assert.match(sources.page, /"Decisione registrata"/);
  assert.match(sources.page, /if \(stati\.length\) await cercaSoggetto\(\);/, "dopo una decisione la vista per soggetto si aggiorna");
  assert.match(sources.page, /Versione precedente/);
  assert.match(sources.page, /stato\.onOutdatedVersion/);
  assert.equal(statoSoggettoId({ definitionId: "d", subjectId: "s" }), "d-s");
});

test("/consensi: le decisioni registrate sono una griglia con le sei colonne della tabella V1", () => {
  assert.match(sources.page, /module="consensi-decisioni"/);
  for (const column of ['id: "decidedAt"', 'id: "subject"', 'id: "status"', 'id: "version"', 'id: "source"', 'id: "note"']) {
    assert.ok(sources.page.includes(column), `manca la colonna ${column}`);
  }
  assert.match(sources.page, /Nessuna decisione registrata per questo consenso/);
  assert.match(sources.page, /Non sono riuscito a leggere le decisioni/);
  assert.match(sources.page, /onRetry=\{\(\) => void caricaDecisioni\(selezionata\)\}/);
  assert.deepEqual(DECISION_VIEWS.map((v) => v.id), ["accepted", "rejected", "revoked"]);
});

test("/consensi: le parole sono quelle della V1, e la provenienza si traduce", () => {
  assert.equal(DEFINITION_STATUS.retired.label, "RITIRATO");
  assert.equal(definitionStatusSpec("active").label, "ATTIVO");
  assert.equal(definitionStatusSpec("draft").label, "BOZZA");
  assert.equal(DECISION_STATUS.accepted.label, "ACCETTATO");
  assert.equal(DECISION_STATUS.rejected.label, "RIFIUTATO");
  assert.equal(DECISION_STATUS.revoked.label, "REVOCATO");
  assert.equal(DECISION_STATUS.missing.label, "MANCA");
  assert.equal(decisionStatusSpec("boh").label, "MANCA", "il ripiego della V1");
  for (const source of CONSENT_SOURCES) {
    assert.ok(SOURCE_LABELS[source], `manca l'etichetta della provenienza ${source}`);
  }
  assert.equal(sourceLabel("manual"), "Registrata a mano");
  assert.equal(sourceLabel("altro"), "altro");
  assert.equal(subjectKindLabel("guardian"), "Tutore");
  assert.equal(describePublishedText({ publishedVersion: 0, publishedAt: null }, () => "x"), "Nessun testo pubblicato: non si possono raccogliere decisioni.");
  assert.equal(describePublishedText({ publishedVersion: 2, publishedAt: "2026-09-01" }, () => "1 set 2026"), "Testo in vigore: versione 2 del 1 set 2026.");
});

test("/consensi: la V1 e stata rimossa, non affiancata", () => {
  for (const residuo of ["ETICHETTA_STATO", "COLORE_STATO", "formatData", "<Card", "<Badge", "<table"]) {
    assert.ok(!senzaCommenti(sources.page).includes(residuo), `${residuo}: un pezzo di V1 e rimasto in pagina`);
  }
  assert.doesNotMatch(senzaCommenti(everything), /from "@\/components\/ui\/(card|badge|button|input|textarea|label)"/, "solo le fondamenta di src/components/web");
  assert.doesNotMatch(senzaCommenti(everything), /bg-gradient-to|[^\w]#[0-9a-fA-F]{6}\b/, "niente esadecimali ne gradienti nuovi");
  assert.doesNotMatch(senzaCommenti(sources.page), /grid-cols-\[minmax\(0,320px\)/, "il layout a due colonne della V1 e la griglia + dettaglio");
});
