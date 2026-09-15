import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  REVIEW_QUEUE_STATUS,
  REVIEW_QUEUE_VIEWS,
  reviewDecisionTarget,
  reviewQueueStatusSpec,
  reviewRowId,
  reviewSourceLabel,
  rowPassesQueueFilter,
} from "@/components/documents/v2/review-queue-model";
import { REVIEW_QUEUE_FILTERS, getReviewQueueStateLabel } from "@/lib/documents/review-queue";

/**
 * Parita della pagina Documenti V2 con l'audit V1
 * (`docs/redesign/audit/wave-e-documenti.md`).
 *
 * Il redesign cambia forma, non capacita: ogni etichetta, azione, campo ed
 * endpoint che l'audit elenca deve restare nel sorgente V2. Un test statico
 * non prova che funzioni — lo fa il lead a schermo — ma impedisce che una
 * capacita sparisca per distrazione.
 */
const read = (relative) => readFileSync(path.join(process.cwd(), relative), "utf8");
const V2 = "src/components/documents/v2";
const sources = {
  page: read("src/app/documenti/page.tsx"),
  model: read(`${V2}/review-queue-model.ts`),
  drawer: read(`${V2}/document-decision-drawer.tsx`),
};
const everything = Object.values(sources).join("\n");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("/documenti: guscio V2, intestazione con i numeri della coda e nessun gradiente oltre il primario", () => {
  assert.match(sources.page, /<Header title="Documenti" \/>/, "il titolo passa da Header, che lo gira alla barra mobile");
  assert.doesNotMatch(sources.page, /<MobileTopBar/);
  assert.match(sources.page, /bg-egw-page/);
  assert.match(sources.page, /<PageHeader/);
  assert.match(sources.page, /title="Documenti da verificare"/);
  assert.match(sources.page, /Una decisione presa non si riscrive: si chiede un altro file/);
  for (const label of ['label="da verificare"', 'label="da integrare"', 'label="scaduti"']) {
    assert.ok(sources.page.includes(label), `manca il numero ${label}`);
  }
  assert.equal((sources.page.match(/variant="primary"/g) || []).length, 0, "la pagina non crea niente: nessun primario di pagina");
  assert.match(sources.page, /Aggiorna/, "il «Ricarica» della V1");
});

test("/documenti: la lettura e la scrittura sono quelle della V1", () => {
  assert.match(sources.page, /new URLSearchParams\(\{ view: "queue" \}\)/);
  assert.match(sources.page, /\/api\/v1\/document-submissions\?\$\{parametri\.toString\(\)\}/);
  assert.match(sources.page, /\/api\/v1\/document-submissions\/\$\{reviewDecisionTarget\(row\)\}/);
  assert.match(sources.page, /method: "POST",\s*body: \{ decision, note \}/);
  assert.equal(reviewDecisionTarget({ id: "req", submissionId: "sub" }), "sub", "si decide sul deposito");
  assert.equal(reviewDecisionTarget({ id: "req", submissionId: null }), "req", "o sulla richiesta, se il deposito non c'e");
  assert.match(sources.page, /Impossibile leggere la coda dei documenti/);
  assert.doesNotMatch(senzaCommenti(everything), /\bfetch\s*\(/, "nessun fetch diretto: il trasporto e apiRequest");
});

test("/documenti: il cancello e la coppia di chiavi della V1, con il ripiego sul ruolo di club senza chiavi", () => {
  assert.match(sources.page, /roleHasPermission\(role, "documents\.review"\)/);
  assert.match(sources.page, /roleHasPermission\(role, "documents\.read_dossier"\)/);
  assert.match(sources.page, /parseCustomRoleValue\(role\)/);
  assert.match(sources.page, /chiaviNonRisolte \|\|/);
  assert.match(sources.page, /!canReview \? "restricted"/, "permesso negato = griglia ristretta, nessuna chiamata");
});

test("/documenti: le sette pastiglie della V1 sono viste e filtro della griglia, con le regole del dominio", () => {
  const keys = REVIEW_QUEUE_FILTERS.map((v) => v.key).filter((k) => k !== "all");
  assert.deepEqual(
    REVIEW_QUEUE_VIEWS.map((v) => v.id),
    keys,
    "una vista per pastiglia, «Tutti» lo mette la griglia",
  );
  assert.equal(REVIEW_QUEUE_VIEWS.find((v) => v.id === "new")?.isDefault, true, "«Nuovi» era il filtro di partenza");
  assert.equal(REVIEW_QUEUE_VIEWS.find((v) => v.id === "overdue")?.tone, "red");
  const row = { state: "under_review", overdue: true, documentKind: "medical_certificate" };
  assert.equal(rowPassesQueueFilter(row, "new"), true);
  assert.equal(rowPassesQueueFilter(row, "overdue"), true);
  assert.equal(rowPassesQueueFilter(row, "approved"), false);
  assert.equal(rowPassesQueueFilter(row, "non-esiste"), true, "un valore ignoto non filtra niente");
  assert.match(sources.page, /id: "queue",\s*label: "Coda",\s*type: "select",\s*pinned: true/);
  assert.match(sources.page, /apply: rowPassesQueueFilter/);
  assert.match(sources.page, /countReviewQueue\(rows\)/, "i conteggi sono quelli del dominio");
  assert.match(sources.page, /searchReviewQueue\(\[row\], query\)/, "la ricerca e quella del dominio");
  assert.match(sources.page, /placeholder: "Atleta, documento, genitore"/);
  assert.match(sources.page, /requestedViewId=\{requestedViewId\}/, "i numeri dell'intestazione accendono la vista");
});

test("/documenti: le colonne portano tutto cio che la card V1 diceva", () => {
  for (const column of ['id: "identity"', 'id: "title"', 'id: "kind"', 'id: "state"', 'id: "submittedAt"', 'id: "submittedBy"', 'id: "source"', 'id: "dueDate"']) {
    assert.ok(sources.page.includes(column), `manca la colonna ${column}`);
  }
  for (const hidden of ['id: "decisionNote"', 'id: "decidedAt"', 'id: "historyCount"']) {
    assert.ok(sources.page.includes(hidden), `manca la colonna nascosta ${hidden}`);
  }
  assert.match(sources.page, /Nessun file consegnato/);
  assert.match(sources.page, /<StatusPill status="expired" detail=/, "una scadenza superata e una data che e anche uno stato");
  assert.match(sources.page, /row\.state === "rejected" \? row\.decisionNote/, "il motivo si mostra solo su un rifiuto");
  assert.match(sources.page, /canSelect=\{false\}/, "la V1 non aveva selezione ne azioni di massa");
});

test("/documenti: le tre azioni di riga passano da reviewQueueActions e non da un secondo predicato", () => {
  assert.match(sources.page, /label: "Apri", icon: <ExternalLink \/>, primary: true, hidden: \(row\) => !reviewQueueActions\(row\)\.canOpen/);
  assert.match(sources.page, /openClientFileUrl\(row\.fileUrl\)/, "mai un <a href>: l'allegato puo essere un data: URL");
  assert.match(sources.page, /label: "Approva", icon: <Check \/>, hidden: \(row\) => !reviewQueueActions\(row\)\.canDecide/);
  assert.match(sources.page, /label: "Rifiuta", icon: <X \/>, hidden: \(row\) => !reviewQueueActions\(row\)\.canDecide/);
  assert.doesNotMatch(sources.page, /href=\{row\.fileUrl\}/);
});

test("/documenti: la decisione e un cassetto, chiede il motivo sul rifiuto e dice cosa succede", () => {
  assert.match(sources.page, /<DocumentDecisionDrawer/);
  assert.match(sources.drawer, /<Drawer[\s\S]*width="default"/);
  assert.match(sources.drawer, /Approvi «\$\{row\.title\}»\?/);
  assert.match(sources.drawer, /Chiedi di rifare «\$\{row\.title\}»/);
  assert.match(sources.drawer, /Motivo, obbligatorio/);
  assert.match(sources.drawer, /Nota, facoltativa/);
  assert.match(sources.drawer, /Cosa deve rifare la famiglia: senza questo, ricarica lo stesso file\./);
  assert.match(sources.drawer, /che chiedere un&apos;integrazione/, "chi preme «Rifiuta» sta chiedendo un altro file");
  assert.match(sources.drawer, /\(!rejecting \|\| Boolean\(motivo\.trim\(\)\)\)/, "finche il motivo e vuoto l'invio non parte");
  assert.match(sources.page, /Il motivo del rifiuto è obbligatorio/);
  for (const toast of ["Documento approvato", "Documento rifiutato", "Decisione non riuscita"]) {
    assert.ok(sources.page.includes(toast), `manca il toast «${toast}»`);
  }
  assert.doesNotMatch(senzaCommenti(everything), /window\.confirm|[^.\w]confirm\(/, "nessuna conferma nativa");
});

test("/documenti: le parole di stato sono quelle della V1 e della famiglia", () => {
  for (const state of ["missing", "overdue", "under_review", "approved", "rejected"]) {
    const label = REVIEW_QUEUE_STATUS[state].label;
    assert.equal(label, getReviewQueueStateLabel(state).toUpperCase(), `la pillola di ${state} deve dire la parola della V1`);
    assert.ok(["quiet", "outline", "solid", "urgent"].includes(REVIEW_QUEUE_STATUS[state].weight));
  }
  assert.equal(reviewQueueStatusSpec("boh").label, "DA VERIFICARE", "il ripiego della V1");
  assert.equal(reviewSourceLabel("parent"), "Famiglia");
  assert.equal(reviewSourceLabel("club"), "Segreteria");
  assert.equal(reviewSourceLabel("public_form"), "Modulo pubblico");
  assert.equal(reviewSourceLabel("altro"), "altro", "una fonte ignota si mostra com'e, come faceva la V1");
  assert.equal(reviewRowId({ id: "a", submissionId: null }), "a:vuoto");
});

test("/documenti: la V1 e stata rimossa, non affiancata", () => {
  assert.equal(existsSync(path.join(process.cwd(), "src/components/documents/document-review-inbox.tsx")), false, "la coda V1 esiste ancora: due implementazioni della stessa cosa");
  assert.doesNotMatch(sources.page, /DocumentReviewInbox/);
  assert.doesNotMatch(senzaCommenti(everything), /from "@\/components\/ui\/(card|badge|button|input|textarea)"/, "solo le fondamenta di src/components/web");
  assert.doesNotMatch(senzaCommenti(everything), /bg-gradient-to|!important|[^\w]#[0-9a-fA-F]{6}\b/, "niente esadecimali ne gradienti nuovi");
});
