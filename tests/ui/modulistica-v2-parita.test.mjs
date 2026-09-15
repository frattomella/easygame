import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  CATALOG_ENTRY_STATUS,
  FORM_VIEWS,
  GENERATED_STATUS_LABELS,
  MODULISTICA_TABS,
  MODULISTICA_TAB_LABELS,
  SUBJECT_LABELS,
  SUBMISSION_VIEWS,
  TEMPLATE_STATUS_LABELS,
  TEMPLATE_VIEWS,
  canGenerateInBulk,
  canProduceFilled,
  catalogClassLabel,
  describeTemplateVersion,
  formCatalogClassLabel,
  formStatusSpec,
  generatedDocumentHref,
  generatedStatusSpec,
  isModulisticaTab,
  newTemplateContent,
  normalizeAthletes,
  renderBlankTemplateForPdf,
  submissionStatusFromFilters,
  submissionStatusSpec,
  templateStatusSpec,
} from "@/components/modulistica/v2/modulistica-model";
import { FORM_STATUS_LABELS, FORM_SUBMISSION_STATUS_LABELS } from "@/lib/forms/model";

/**
 * Parita della pagina Modulistica V2 con l'audit V1
 * (`docs/redesign/audit/wave-e-modulistica.md`).
 *
 * Il redesign cambia forma, non capacita: ogni etichetta, azione, campo ed
 * endpoint che l'audit elenca deve restare nel sorgente V2. Le regole del
 * ciclo di vita (`modulistica-template-lifecycle`), delle schede
 * (`modulistica-schede-e-stati`) e del lotto (`modulistica-bulk-generation`)
 * hanno i loro test: qui si presidia cio che cambia forma.
 */
const read = (relative) => readFileSync(path.join(process.cwd(), relative), "utf8");
const V2 = "src/components/modulistica/v2";
const sources = {
  page: read("src/app/modulistica/page.tsx"),
  model: read(`${V2}/modulistica-model.ts`),
  templates: read(`${V2}/templates-grid.tsx`),
  catalog: read(`${V2}/catalog-grid.tsx`),
  generated: read(`${V2}/generated-grid.tsx`),
  forms: read(`${V2}/online-forms-section.tsx`),
  editor: read(`${V2}/template-editor-view.tsx`),
  state: read(`${V2}/template-state.tsx`),
  newDrawer: read(`${V2}/new-template-drawer.tsx`),
  generateDrawer: read(`${V2}/generate-document-drawer.tsx`),
  previewDrawer: read(`${V2}/filled-preview-drawer.tsx`),
  dialogs: read(`${V2}/template-dialogs.tsx`),
};
const everything = Object.values(sources).join("\n");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ------------------------------------------------------------- guscio e schede */

test("/modulistica: guscio V2 con una barra sola, intestazione e un solo primario di pagina", () => {
  assert.match(sources.page, /<Header title="Modulistica" \/>/);
  assert.doesNotMatch(sources.page, /<MobileTopBar/);
  assert.match(sources.page, /bg-egw-page/);
  assert.match(sources.page, /<PageHeader/);
  assert.match(sources.page, /title="Modulistica"/);
  assert.match(sources.page, /Nuovo documento/);
  assert.match(sources.page, /currentTab === "documents" && canManage \? \(\s*<Button variant="primary"/, "il primario di pagina solo sulla scheda dei modelli e solo a chi puo");
  assert.equal((sources.page.match(/variant="primary"/g) || []).length, 1, "un solo gradiente in pagina: gli altri stanno nei cassetti");
});

test("/modulistica: le schede sono quattro, ricavate dai permessi, con «Ritirati» diventata una vista", () => {
  assert.deepEqual([...MODULISTICA_TABS], ["documents", "catalog", "online-forms", "generated"]);
  assert.equal(MODULISTICA_TAB_LABELS.documents, "Modelli di documento");
  assert.equal(MODULISTICA_TAB_LABELS["online-forms"], "Moduli online");
  assert.equal(isModulisticaTab("retired"), false, "«Ritirati» non e piu una scheda: e la vista della griglia");
  assert.ok(TEMPLATE_VIEWS.some((view) => view.id === "retired" && view.filters.status.includes("retired") && view.tone === "amber"));
  assert.ok(TEMPLATE_VIEWS.find((view) => view.isDefault)?.id === "in-use", "di default si vedono attivi e bozze, come l'elenco V1");
  assert.match(sources.page, /searchParams\.get\("tab"\)/, "la scheda vive nell'indirizzo");
  assert.match(sources.page, /searchParams\.get\("action"\) !== "new"/, "le azioni rapide aprono il modulo di creazione");
});

test("/modulistica: senza club e senza permesso si legge perche", () => {
  assert.match(sources.page, /Nessun club attivo: scegline uno dal menu in alto\./);
  assert.match(sources.page, /I modelli di documento e i moduli online li vede chi lavora nella segreteria del club\./);
  assert.match(sources.page, /<EmptyStateCard[\s\S]{0,120}icon=\{<Lock \/>\}/);
});

/* --------------------------------------------------------- modelli di documento */

test("/modulistica: la griglia dei modelli porta stato, versione, modifiche non pubblicate e documenti prodotti", () => {
  for (const column of ['id: "identity"', 'id: "subject"', 'id: "status"', 'id: "version"', 'id: "unpublished"', 'id: "generatedCount"']) {
    assert.ok(sources.templates.includes(column), `manca la colonna ${column}`);
  }
  for (const hidden of ['id: "updatedAt"', 'id: "catalog"']) {
    assert.ok(sources.templates.includes(hidden), `manca la colonna nascosta ${hidden}`);
  }
  assert.match(sources.templates, /module="modulistica-modelli"/);
  assert.match(sources.templates, /Mai pubblicato/);
  assert.match(sources.templates, /Modifiche non pubblicate/);
  assert.equal(describeTemplateVersion({ publishedVersion: 0, publishedAt: null }, () => "x"), "Mai pubblicato");
  assert.equal(describeTemplateVersion({ publishedVersion: 3, publishedAt: "2026-09-01" }, () => "1 set 2026"), "Versione 3 del 1 set 2026");
  assert.equal(templateStatusSpec("retired").label, "RITIRATO");
  assert.equal(templateStatusSpec("active").label, "ATTIVO");
  assert.equal(templateStatusSpec("draft").label, "BOZZA");
  assert.deepEqual(TEMPLATE_STATUS_LABELS, { draft: "Bozza", active: "Attivo", retired: "Ritirato" });
});

test("/modulistica: le azioni di riga sono quelle delle card V1, offerte solo dove lo stato le ammette", () => {
  for (const action of ['label: "Genera documento"', 'label: "Stampa il modulo vuoto"', 'label: "Genera per più atleti"', 'label: "Modifica il testo"', 'label: "Pubblica"', 'label: "Riattiva"', 'label: "Ritira"', 'label: "Elimina"']) {
    assert.ok(sources.templates.includes(action), `manca l'azione ${action}`);
  }
  assert.match(sources.templates, /label: "Modifica il testo", icon: <Pencil \/>, hidden: \(\) => !canManage/);
  assert.match(sources.templates, /label: "Elimina", icon: <Trash2 \/>, tone: "danger", hidden: \(\) => !canManage/);
  assert.equal(canProduceFilled({ status: "active", publishedVersion: 1 }), true);
  assert.equal(canProduceFilled({ status: "draft", publishedVersion: 0 }), false);
  assert.equal(canProduceFilled({ status: "retired", publishedVersion: 2 }), false);
  assert.equal(canGenerateInBulk({ status: "active", subjectKind: "athlete" }), true);
  assert.equal(canGenerateInBulk({ status: "active", subjectKind: "member" }), false);
  assert.equal(canGenerateInBulk({ status: "draft", subjectKind: "athlete" }), false);
});

test("/modulistica: il lotto interrotto si propone in pagina con Riprendi e Scarta", () => {
  assert.match(sources.page, /è rimasto a metà/);
  assert.match(sources.page, /Riprendendolo si\s+generano solo i mancanti: i documenti già prodotti non si duplicano\./);
  assert.match(sources.page, /onClick=\{resumeBulkBatch\}/);
  assert.match(sources.page, /onClick=\{discardBulkBatch\}/);
  assert.match(sources.page, /Il modello di quel lotto non c'è più: il lotto è stato scartato/);
});

test("/modulistica: nuovo documento e un cassetto con i tre campi della V1", () => {
  assert.match(sources.newDrawer, /<Drawer[\s\S]*width="default"/);
  assert.match(sources.newDrawer, /placeholder="Inserisci il titolo del documento"/);
  assert.match(sources.newDrawer, /placeholder="Inserisci una breve descrizione"/);
  assert.match(sources.newDrawer, /label="Di chi parla"/);
  assert.match(sources.newDrawer, /helper=\{SUBJECT_HINT\}/);
  assert.match(sources.newDrawer, /Inserisci il titolo del documento/);
  assert.match(sources.newDrawer, /dirty=\{dirty && !creating\}/, "la guardia sulle modifiche non salvate");
  assert.match(sources.page, /content: newTemplateContent\(values\.title\)/);
  assert.equal(newTemplateContent("Attestazione <A&B>"), "<h1>Attestazione &lt;A&amp;B&gt;</h1><p>Inserisci il contenuto qui.</p>");
  assert.match(sources.page, /Nuovo modello creato: è una bozza, finché non lo pubblichi/);
  assert.deepEqual(Object.keys(SUBJECT_LABELS), ["club", "athlete", "person", "member"]);
});

test("/modulistica: genera documento e un cassetto con le due strade, gli avvisi e la ricerca dell'atleta", () => {
  assert.match(sources.generateDrawer, /Genera vuoto/);
  assert.match(sources.generateDrawer, /Genera compilato/);
  assert.match(sources.generateDrawer, /<SearchableSelect/, "la ricerca e dentro il selettore: obbligatoria sopra otto opzioni");
  assert.match(sources.generateDrawer, /Nessun atleta trovato/);
  assert.match(sources.generateDrawer, /Nessun atleta disponibile/);
  assert.match(sources.generateDrawer, /Questo modello parla di/);
  assert.match(sources.generateDrawer, /Questo modello è ritirato/);
  assert.match(sources.generateDrawer, /Questo modello non è mai stato pubblicato/);
  assert.match(sources.generateDrawer, /Questo modello ha modifiche non pubblicate/);
  assert.match(sources.generateDrawer, /Serve un modello pubblicato e non ritirato/);
  assert.match(sources.page, /const finestra = openBundleWindow\(\);/, "la finestra si apre prima di ogni await");
  assert.match(sources.page, /printLabel: "Stampa il modulo"/);
  assert.match(sources.page, /renderBlankFormHtml\(\{ title: template\.title, bodyHtml: renderBlankTemplateForPdf\(template\.draftContent\) \}\)/);
  assert.match(sources.page, /Il browser ha bloccato la finestra di stampa/);
  assert.match(sources.page, /Seleziona prima un atleta/);
  assert.equal(renderBlankTemplateForPdf("<p>{{athlete.first_name}}</p>"), '<p><span class="blank-field"></span></p>');
});

test("/modulistica: l'anteprima dice cosa non e entrato, poi si produce", () => {
  assert.match(sources.previewDrawer, /width="wide"/);
  assert.match(sources.previewDrawer, /Dati mancanti: restano campi da riempire a mano/);
  assert.match(sources.previewDrawer, /Segnaposto non riconosciuti: restano vuoti/);
  assert.match(sources.previewDrawer, /Tutti i segnaposto del modello sono stati compilati/);
  assert.match(sources.previewDrawer, /<iframe title="Anteprima del documento" srcDoc=\{preview\.html\} sandbox=""/);
  assert.match(sources.previewDrawer, /Stampa l&apos;anteprima/);
  assert.match(sources.previewDrawer, /Produci il documento/);
  assert.match(sources.page, /printLabel: "Stampa il documento"/);
  assert.match(sources.page, /subjects: \[\{ kind: "athlete", id: filledPreview\.athleteId \}\]/);
  assert.match(sources.page, /Documento prodotto: lo trovi in «Documenti generati»/);
  assert.match(sources.page, /selectTab\("generated"\)/);
});

test("/modulistica: l'editor avvolge il foglio visuale con soggetto, Pubblica, versioni e la riga salva/pubblica", () => {
  assert.match(sources.editor, /<DocumentEditor initialContent=\{template\.draftContent\} onSave=\{onSave\} onCancel=\{onBack\} readOnly=\{!canManage\} subject=\{subject\}/);
  assert.match(sources.editor, /Torna alla lista/);
  assert.match(sources.editor, /Versioni pubblicate/);
  assert.match(sources.editor, /pubblica\s+dopo aver salvato/);
  assert.match(sources.page, /Bozza salvata\. I documenti già prodotti non cambiano: per farla valere, pubblicala/);
  assert.match(sources.page, /Pubblicata la versione \$\{template\.publishedVersion\}/);
  assert.match(sources.dialogs, /Questo modello non si può pubblicare/);
  assert.match(sources.dialogs, /Ho capito/);
  assert.match(sources.state, /<StatusPill status=\{templateStatusSpec\(template\.status\)\}/);
});

test("/modulistica: ritira, riattiva ed elimina con i toast della V1; elimina e bloccata se ha prodotto", () => {
  assert.match(sources.page, /Modello ritirato: non produce documenti nuovi, e continua a spiegare quelli già prodotti/);
  assert.match(sources.page, /"Modello riattivato"/);
  assert.match(sources.page, /"Modello eliminato"/);
  assert.match(sources.dialogs, /<DangerConfirmDialog/);
  assert.match(sources.dialogs, /confirmLabel="Elimina"/);
  assert.match(sources.dialogs, /si ritira, non si cancella, o quei documenti non saprebbero più spiegarsi/);
  assert.doesNotMatch(senzaCommenti(everything), /window\.confirm|[^.\w]confirm\(\s*"/, "nessuna conferma nativa");
});

/* ---------------------------------------------------------------- catalogo */

test("/modulistica: il catalogo e una griglia con classe, proprietario, rilettura e adozione", () => {
  assert.match(sources.catalog, /module="modulistica-catalogo"/);
  for (const column of ['id: "identity"', 'id: "subject"', 'id: "class"', 'id: "owner"', 'id: "reviewed"', 'id: "adopted"']) {
    assert.ok(sources.catalog.includes(column), `manca la colonna ${column}`);
  }
  assert.match(sources.catalog, /label: "Adotta", icon: <Plus \/>, primary: true, hidden: \(row\) => row\.adopted \|\| Boolean\(adoptingKey\)/);
  assert.match(sources.catalog, /Il club ha già adottato tutto quello che il catalogo distribuisce\./);
  assert.match(sources.catalog, /Nessun modello disponibile nel catalogo/);
  assert.match(sources.page, /adottato: è già pubblicato, lo trovi fra i modelli del club/);
  assert.equal(catalogClassLabel("A"), "Classe A — dice fatti del gestionale");
  assert.equal(catalogClassLabel("Z"), "Classe Z");
  assert.equal(CATALOG_ENTRY_STATUS.adopted.label, "ADOTTATO");
  assert.match(sources.page, /\{canManage \? \(\s*<div[^\n]*\n\s*<CatalogGrid/, "la vede solo chi puo adottare");
});

/* ------------------------------------------------------- documenti generati */

test("/modulistica: i documenti generati sono una griglia e si riaprono com'erano", () => {
  assert.match(sources.generated, /module="modulistica-generati"/);
  for (const column of ['id: "identity"', 'id: "version"', 'id: "subject"', 'id: "generatedAt"', 'id: "status"']) {
    assert.ok(sources.generated.includes(column), `manca la colonna ${column}`);
  }
  assert.match(sources.generated, /href=\{generatedDocumentHref\(row\.id\)\}\s*target="_blank"\s*rel="noreferrer"/);
  assert.equal(generatedDocumentHref("abc"), "/api/v1/documents/generated/abc?format=html");
  assert.match(sources.generated, /Nessun documento generato/);
  assert.match(sources.generated, /Parti da un modello pubblicato e usa «Genera compilato»/);
  assert.deepEqual(Object.keys(GENERATED_STATUS_LABELS), ["generated", "issued", "awaiting_signature", "signed", "rejected", "archived"]);
  assert.equal(generatedStatusSpec("signed").label, "COPIA FIRMATA RIENTRATA");
  assert.equal(generatedStatusSpec("boh").label, "BOH", "uno stato ignoto si mostra com'e, come faceva la V1");
});

/* ------------------------------------------------------------ moduli online */

test("/modulistica: i moduli online hanno tre griglie con le azioni e i toast della V1", () => {
  assert.match(sources.forms, /module="modulistica-moduli"/);
  assert.match(sources.forms, /module="modulistica-coda"/);
  assert.match(sources.forms, /Nuovo modulo/);
  assert.match(sources.forms, /void create\("blank"\)/);
  for (const action of ['label: "Apri"', 'label: "Duplica"', 'label: "Ripristina"', 'label: "Archivia"', 'label: "Elimina"', 'label: "Esamina"']) {
    assert.ok(sources.forms.includes(action), `manca l'azione ${action}`);
  }
  for (const toast of ["Modulo duplicato", "Modulo ripristinato come bozza", "Modulo archiviato", "Modulo eliminato", "Il modulo ha già delle compilazioni: è stato archiviato invece che cancellato.", "Non riesco a creare il modulo", "Non riesco ad aprire il modulo", "Operazione non riuscita"]) {
    assert.ok(sources.forms.includes(toast), `manca il toast «${toast}»`);
  }
  assert.match(sources.forms, /fetchFormTemplates\(\{ includeArchived: true \}\)/);
  assert.ok(FORM_VIEWS.some((view) => view.id === "archived"), "gli archiviati sono una vista, non un interruttore");
  assert.match(sources.forms, /fetchFormSubmissions\(\{ status: statusFilter, limit: 50 \}\)/);
  assert.match(sources.forms, /onFiltersChange=\{onSubmissionFilters\}/, "il server filtra per stato, la vista dice quale");
  assert.equal(submissionStatusFromFilters({ status: "approved" }), "approved");
  assert.equal(submissionStatusFromFilters({}), "all");
  assert.deepEqual(SUBMISSION_VIEWS.map((v) => v.id), ["pending", "approved", "rejected"]);
  assert.match(sources.forms, /<FormBuilder/);
  assert.match(sources.forms, /<SubmissionReviewDialog/);
  assert.match(sources.forms, /Da esaminare/);
  assert.match(sources.forms, /Modelli consigliati EasyGame/);
  assert.match(sources.forms, /Cosa chiede questo modulo/);
  assert.match(sources.forms, /Usa modello/);
  assert.match(sources.forms, /GIÀ FRA I MODULI DEL CLUB/);
  assert.match(sources.forms, /tone: "danger",\s*title: `Eliminare «\$\{template\.title\}»\?`/, "eliminare un modulo chiede conferma (la V1 non la chiedeva)");
  assert.equal(formStatusSpec("published").label, "PUBBLICATO");
  assert.equal(submissionStatusSpec("pending").label, "DA ESAMINARE");
  assert.equal(formCatalogClassLabel("A"), "Classe A — campi che EasyGame sa già leggere e scrivere");
  for (const status of Object.keys(FORM_STATUS_LABELS)) {
    assert.equal(formStatusSpec(status).label, FORM_STATUS_LABELS[status].toUpperCase());
  }
  for (const status of Object.keys(FORM_SUBMISSION_STATUS_LABELS)) {
    assert.equal(submissionStatusSpec(status).label, FORM_SUBMISSION_STATUS_LABELS[status].toUpperCase());
  }
});

/* ------------------------------------------------------------------ atleti */

test("/modulistica: gli atleti per il compilato e il lotto si normalizzano come nella V1", () => {
  const atleti = normalizeAthletes([
    { id: "1", first_name: "Marco", last_name: "Ferretti", data: { category: "Under 15" } },
    { id: "2", data: { firstName: "Anna", lastName: "Rossi" } },
    { id: "3", name: "", data: {} },
    { first_name: "Senza", last_name: "Id" },
    "boh",
  ]);
  assert.deepEqual(atleti, [
    { id: "1", label: "Marco Ferretti", category: "Under 15" },
    { id: "2", label: "Anna Rossi", category: "" },
  ]);
  assert.match(sources.page, /getClubAthletes\(clubId\)\.catch\(\(\) => \[\]\)/);
});

/* ----------------------------------------------------------- rimozione V1 */

test("/modulistica: la V1 e stata rimossa, non affiancata", () => {
  assert.equal(existsSync(path.join(process.cwd(), "src/components/forms/forms-dashboard.tsx")), false, "il cruscotto V1 dei moduli esiste ancora");
  for (const residuo of ["TemplateStatusBadge", "STATUS_CLASSES", "<Tabs ", "<TabsTrigger", "<Dialog", "<DialogFooter", "AppLoadingScreen", "MobileTopBar"]) {
    assert.ok(!senzaCommenti(sources.page).includes(residuo), `${residuo}: un pezzo di V1 e rimasto in pagina`);
  }
  assert.doesNotMatch(senzaCommenti(everything), /from "@\/components\/ui\/(card|badge|button|input|textarea|dialog|tabs|select|dropdown-menu|label)"/, "solo le fondamenta di src/components/web");
  for (const [name, source] of Object.entries(sources)) {
    if (name === "model") continue; // gli stili del foglio stampato vivono fuori dal DOM dell'applicazione
    assert.doesNotMatch(senzaCommenti(source), /bg-gradient-to|[^\w]#[0-9a-fA-F]{6}\b/, `${name}: niente esadecimali ne gradienti nuovi`);
  }
});
