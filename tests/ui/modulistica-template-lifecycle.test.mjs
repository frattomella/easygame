import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Il ciclo di vita di un modello, visto dalla schermata (W3-A, parte UI).
 *
 * **Cosa prova, e cosa no.** Sono asserzioni statiche sul sorgente: non
 * provano che `/modulistica` funzioni, provano che le tre implementazioni
 * doppie che questa lane ha rimosso non siano tornate e che la pagina non
 * abbia una seconda strada verso i modelli. E la forma degli altri test di
 * `tests/ui/`, ed e quella giusta qui: il difetto che si teme non e un bug di
 * rendering, e un secondo motore che ricompare accanto al primo.
 *
 * Le tre implementazioni, per nome:
 *
 * - `DOC-02` — quattro modelli predefiniti generati nel browser, mai chiamati
 *   da nessuno, che scrivevano segnaposto fuori catalogo;
 * - `DOC-03` — la compilazione dei segnaposto fatta nel client, con una mappa
 *   propria di chiavi storiche e l'anno sportivo letto da `localStorage`;
 * - il **«generatore IA»**, che non chiamava nessuna intelligenza artificiale
 *   e scriveva `{{first_name}}` e `{{fiscalCode}}`, chiavi che il catalogo non
 *   conosce e che sarebbero rimaste bianche per sempre.
 */

const SRC = path.join(process.cwd(), "src");

/*
  I commenti si tolgono, e non e un dettaglio: questa pagina **cita** le chiavi
  storiche che ha smesso di scrivere — `{{fiscalCode}}`, `{{first_name}}` —
  perche e cosi che si spiega perche il generatore IA e stato tolto. Cercarle
  nel sorgente grezzo troverebbe la spiegazione e la scambierebbe per il
  reperto.
*/
const readCode = (...segments) =>
  readFileSync(path.join(SRC, ...segments), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/*
  Dal Web V2 (Wave E) la pagina e divisa: `page.tsx` tiene i gesti e le
  letture, `components/modulistica/v2/*` le griglie, i cassetti e il modello.
  I reperti si cercano nell'insieme, salvo dove conta **in quale** file stanno.
*/
const V2 = ["components", "modulistica", "v2"];
const PAGE_ONLY = readCode("app", "modulistica", "page.tsx");
const MODEL = readCode(...V2, "modulistica-model.ts");
const GRID = readCode(...V2, "templates-grid.tsx");
const CATALOG = readCode(...V2, "catalog-grid.tsx");
const GENERATED = readCode(...V2, "generated-grid.tsx");
const NEW_DRAWER = readCode(...V2, "new-template-drawer.tsx");
const GENERATE_DRAWER = readCode(...V2, "generate-document-drawer.tsx");
const PREVIEW_DRAWER = readCode(...V2, "filled-preview-drawer.tsx");
const DIALOGS = readCode(...V2, "template-dialogs.tsx");
const EDITOR_VIEW = readCode(...V2, "template-editor-view.tsx");
const PAGE = [PAGE_ONLY, MODEL, GRID, CATALOG, GENERATED, NEW_DRAWER, GENERATE_DRAWER, PREVIEW_DRAWER, DIALOGS, EDITOR_VIEW].join("\n");
const EDITOR = readCode("components", "forms", "DocumentEditor.tsx");
const CLIENT = readCode("lib", "api", "documents.ts");
const VIEW = readCode("lib", "documents", "document-view.ts");

/* ------------------------------------------------ un motore solo, il nuovo */

test("la pagina non scrive piu i modelli passando da simplified-db", () => {
  const vecchie = [
    /saveDocumentTemplate(?!Draft)/,
    /updateDocumentTemplate\b/,
    /getDocumentTemplates\b/,
  ];

  for (const funzione of vecchie) {
    assert.ok(
      !funzione.test(PAGE),
      `${funzione}: legge e scrive clubs.document_templates, e due schede aperte insieme si sovrascrivevano`,
    );
  }

  /*
    `deleteDocumentTemplate` esiste con lo stesso nome anche nel client nuovo:
    qui conta da **dove** arriva.
  */
  const importaDaSimplifiedDb = PAGE_ONLY.match(
    /import\s*\{([^}]*)\}\s*from\s*"@\/lib\/simplified-db"/,
  );
  assert.ok(importaDaSimplifiedDb, "la pagina importa ancora gli atleti da li");
  assert.ok(
    !/document|Template/i.test(importaDaSimplifiedDb[1]),
    "nessuna funzione sui modelli deve arrivare da simplified-db",
  );
});

test("i gesti sui modelli passano dal client documentale", () => {
  assert.match(PAGE_ONLY, /from "@\/lib\/api\/documents"/);

  for (const gesto of [
    "listDocumentTemplates",
    "getDocumentTemplate",
    "createDocumentTemplate",
    "saveDocumentTemplateDraft",
    "publishDocumentTemplate",
    "deleteDocumentTemplate",
    "previewFilledDocument",
    "generateDocuments",
    "listGeneratedDocuments",
  ]) {
    assert.ok(PAGE_ONLY.includes(gesto), `${gesto} e il gesto del motore nuovo`);
  }
});

test("la pagina non chiama /api con il proprio trasporto", () => {
  assert.ok(
    !/apiRequest\s*[<(]/.test(PAGE_ONLY),
    "il trasporto e src/lib/api/client.ts, e ci arriva il client documentale",
  );
  assert.ok(
    !/\bfetch\s*\(\s*["'`]\/api/.test(PAGE),
    "nessun fetch diretto a /api da un componente",
  );
});

/* -------------------------------------------- il codice morto non e tornato */

test("i quattro modelli predefiniti nel browser non esistono piu (DOC-02)", () => {
  assert.ok(
    !PAGE.includes("generateDocumentTemplates"),
    "erano centosettantacinque righe che non chiamava nessuno, con segnaposto fuori catalogo",
  );

  for (const storico of ["{{fiscalCode}}", "{{first_name}}", "{{category}}"]) {
    assert.ok(
      !PAGE.includes(storico),
      `${storico} non e nel catalogo: in un modello resterebbe bianco per sempre`,
    );
  }
});

test("la compilazione nel browser non esiste piu (DOC-03)", () => {
  for (const residuo of [
    "compileDocument",
    "handleCompileDocument",
    "showCompileDialog",
  ]) {
    assert.ok(
      !PAGE.includes(residuo),
      `${residuo} era una terza interpretazione della sostituzione dei segnaposto`,
    );
  }
});

test("il «generatore IA» non esiste piu, ne i suoi stati morti", () => {
  for (const residuo of [
    "generateAIDocument",
    "aiDescription",
    "setAiGeneratorDialog",
    "setAiGenerating",
    "DOCUMENTO GENERATO DALL'IA",
  ]) {
    assert.ok(
      !PAGE.includes(residuo),
      `${residuo}: prometteva un'intelligenza artificiale che non c'era, e scriveva chiavi fuori catalogo`,
    );
  }
});

test("le tracce di debug non sono rimaste in pagina", () => {
  assert.ok(
    !/console\.log\(/.test(PAGE),
    "un console.log di debug in produzione stampa dati del club nella consolle",
  );
});

/* ------------------------------------------------------- il ciclo di vita */

test("l'elenco dichiara stato, versione e modifiche non pubblicate", () => {
  for (const atteso of [
    "publishedVersion",
    "hasUnpublishedChanges",
    "Modifiche non pubblicate",
    "Bozza",
    "Attivo",
    "Ritirato",
  ]) {
    assert.ok(PAGE.includes(atteso), `l'elenco deve dire «${atteso}»`);
  }
});

test("pubblicare e un gesto separato, e quando fallisce dice quale chiave", () => {
  assert.match(
    PAGE,
    /const \{ template, error, issues \} = await publishDocumentTemplate/,
    "le issues che tornano dal client vanno mostrate: «non si puo pubblicare» e basta manda a chiamare l'assistenza",
  );
  assert.ok(PAGE_ONLY.includes("setPublishIssues"));
  assert.match(
    PAGE,
    /issue\.key/,
    "ogni problema si mostra con la chiave che lo causa",
  );
});

test("un modello si ritira, e si cancella solo se non ha prodotto niente", () => {
  assert.ok(PAGE.includes("Ritira"), "«ritira», non «archivia»");
  assert.ok(
    !/["'>\s]Archivia[<"'\s]/.test(PAGE),
    "archiviare non e ritirare: un modello ritirato continua a spiegare i documenti che ha prodotto",
  );
  assert.match(
    DIALOGS,
    /template && template\.generatedCount > 0/,
    "con documenti gia prodotti la cancellazione va spiegata, non solo rifiutata",
  );
  assert.match(
    DIALOGS,
    /Non puoi eliminare «/,
    "e il pulsante distruttivo e assente, non disabilitato (guideline 08 §8.9, «Blocked»)",
  );
});

test("il nuovo modello chiede il soggetto, e lo spiega", () => {
  assert.ok(NEW_DRAWER.includes("newDocumentSubject"));
  assert.match(NEW_DRAWER, /subjectKind: newDocumentSubject/);
  assert.match(PAGE_ONLY, /subjectKind: values\.subjectKind/);
  assert.match(
    PAGE,
    /SUBJECT_HINT/,
    "il soggetto decide quali dati il modello sapra scrivere: va detto",
  );
  for (const soggetto of ["club", "athlete", "person", "member"]) {
    assert.ok(
      new RegExp(`\\b${soggetto}:`).test(PAGE),
      `manca il soggetto ${soggetto}`,
    );
  }
});

test("le versioni del modello si vedono, con numero e data", () => {
  assert.match(EDITOR_VIEW, /template\.versions\.map/);
  assert.match(EDITOR_VIEW, /Versione \{version\.version\}/);
  assert.match(EDITOR_VIEW, /formatDate\(version\.publishedAt\)/);
});

/* ---------------------------------------------------------- la generazione */

test("prima si vede cosa non e entrato nel documento, poi lo si produce", () => {
  const anteprima = PAGE_ONLY.indexOf("previewFilledDocument(");
  const produzione = PAGE_ONLY.indexOf("generateDocuments(");

  assert.ok(anteprima > 0 && produzione > 0);
  assert.ok(
    anteprima < produzione,
    "l'anteprima non scrive niente ed e il gesto che viene prima",
  );

  for (const dichiarazione of ["missing", "unresolved", "warnings"]) {
    assert.ok(
      PREVIEW_DRAWER.includes(`preview.${dichiarazione}`),
      `${dichiarazione} va elencato prima di produrre: un'attestazione con righe bianche sembra completa`,
    );
  }

  assert.match(
    PAGE,
    /Dati mancanti: restano campi da riempire a mano/,
    "i dati mancanti si dicono in italiano, non con il nome della chiave e basta",
  );
});

test("un documento generato si riapre com'era, senza rigenerarlo", () => {
  assert.match(
    PAGE,
    /generatedDocumentHref = \(id: string\) => `\/api\/v1\/documents\/generated\/\$\{id\}\?format=html`/,
    "si apre la resa conservata: modificare un modello non cambia un documento gia consegnato",
  );
  assert.ok(PAGE.includes("Documenti generati"));
});

/* --------------------------------------------- il catalogo ha una porta */

/**
 * **Il difetto, per nome.** `GET`/`POST /api/v1/documents/catalog`
 * funzionavano, erano nel registro e avevano i test — e non li chiamava
 * nessuna riga di client. Delle sei voci distribuite, cinque erano
 * irraggiungibili: l'unica adozione possibile era un pulsante che si scriveva
 * da se la copia dell'attestazione, senza classe redazionale, senza
 * proprietario del testo, senza data di rilettura e senza audit.
 */
test("il catalogo si legge e si adotta dal client documentale", () => {
  for (const gesto of ["listDocumentCatalog", "adoptCatalogEntry"]) {
    assert.ok(
      PAGE.includes(gesto),
      `${gesto}: senza, la rotta del catalogo resta una porta murata`,
    );
  }

  assert.match(
    CLIENT,
    /export const listDocumentCatalog = async/,
    "il trasporto verso il catalogo sta nel client documentale, come tutto il resto",
  );
  assert.match(CLIENT, /export const adoptCatalogEntry = async/);
});

test("la scheda «Catalogo» dice classe, proprietario e data di rilettura", () => {
  assert.match(
    PAGE,
    /catalog: "Catalogo"/,
    "cinque voci su sei non avevano nessuna schermata da cui prenderle",
  );

  assert.match(CATALOG, /row\.catalogClass/, "di che classe e la voce");
  assert.match(CATALOG, /row\.editorialOwner/, "chi risponde del testo");
  assert.match(
    CATALOG,
    /formatDateShort\(row\.lastReviewedAt\)/,
    "da quanto tempo nessuno lo rilegge: e meta di ADR-0092",
  );
  assert.match(
    CATALOG,
    /row\.adopted \?/,
    "una voce gia adottata si dice, non si ripropone",
  );
});

test("la scheda «Catalogo» la vede solo chi puo adottare", () => {
  assert.match(
    PAGE_ONLY,
    /if \(canManage\) tabs\.push\("catalog"\)/,
    "la pagina e aperta anche a collaboratori e staff: una vetrina che risponde «Accesso negato» e un difetto",
  );
  assert.match(PAGE_ONLY, /canManage\s*\?\s*listDocumentCatalog\(\)/);
});

test("la seconda adozione impoverita non esiste piu", () => {
  for (const residuo of [
    "handleAddAttestationTemplate",
    "buildAttestationTemplate",
    "ATTESTATION_TEMPLATE_ID",
    "Aggiungi attestazione",
  ]) {
    assert.ok(
      !PAGE.includes(residuo),
      `${residuo}: era la stessa adozione senza classe, proprietario, rilettura e audit`,
    );
  }
});

/* ------------------------------------------- il modulo vuoto, e la stampa */

test("il modulo vuoto non ha una sintassi dei segnaposto tutta sua", () => {
  assert.ok(
    !/\{\{\\s\*/.test(PAGE),
    "la copia in pagina era gia divergente dal proprietario: due sintassi, due documenti diversi",
  );
  assert.match(
    PAGE,
    /applyPlaceholderValues\(\{ content, rendered: BLANK_SIGNATURE_HTML \}\)/,
    "a svuotare i segnaposto e il motore di placeholders.ts",
  );
  assert.ok(
    !PAGE.includes(`'<span class="blank-field"></span>'`),
    "BLANK_FIELD_HTML e esportato: ricopiarne il valore e come ricopiare la regex",
  );
});

test("il modulo vuoto stampa la bozza solo dicendolo", () => {
  assert.ok(
    PAGE_ONLY.includes("template.draftContent"),
    "il contenuto pubblicato non lo restituisce nessuna rotta: si stampa la bozza",
  );
  assert.match(
    GENERATE_DRAWER,
    /template\?\.hasUnpublishedChanges/,
    "quando bozza e versione pubblicata dicono cose diverse, va detto prima di stampare",
  );
  assert.match(
    PAGE,
    /Questo modello ha modifiche non pubblicate/,
    "un modulo cartaceo che non dice quello che dira il generato va dichiarato",
  );
  assert.match(
    PAGE,
    /Questo modello non [eè] mai stato pubblicato/,
    "mai pubblicato: la bozza si stampa lo stesso, ma dicendolo",
  );
});

test("la pagina non ha un terzo foglio di stile di stampa", () => {
  for (const regola of ["@page", "794px", "size: A4", "margin: 18mm"]) {
    assert.ok(
      !PAGE.includes(regola),
      `«${regola}» e in document-view.ts: due fogli di stile divergono, e lo stesso modello si stampa in due impaginazioni`,
    );
  }

  assert.match(
    PAGE,
    /renderBlankFormHtml\(\{/,
    "la pagina stampabile la compone il proprietario dei documenti stampabili",
  );
  assert.match(
    VIEW,
    /export const PRINTABLE_DOCUMENT_STYLESHEET/,
    "una sola definizione, e si esporta",
  );
  assert.equal(
    (VIEW.match(/@page \{ size: A4; margin: 18mm; \}/g) || []).length,
    1,
    "anche dentro il proprietario, una volta sola",
  );
});

test("la stampa non parte a tempo, la fa partire chi guarda", () => {
  assert.ok(
    !/setTimeout\([\s\S]{0,80}print\(\)/.test(PAGE),
    "una finestra di stampa che parte prima dell'impaginazione mostra la cosa sbagliata",
  );
  assert.ok(
    !PAGE.includes("printHtmlPage"),
    "la stampa temporizzata era una seconda strada accanto a quella del fascicolo",
  );
  assert.match(
    PAGE_ONLY,
    /openBundleWindow\(\)/,
    "la finestra si apre nel gestore del clic, prima di ogni await, o il browser la blocca",
  );
  assert.match(PAGE_ONLY, /renderBundleInto\(/);
  assert.match(PAGE_ONLY, /openPrintableBundle\(/);
});

/* ------------------------- le azioni hanno un nome, e stati che le ammettono */

test("il menu azioni di ogni modello dice su cosa agisce (H6)", () => {
  /*
    Dal Web V2 il menu della riga lo disegna il DataGrid, che nomina la riga
    (`Altre azioni per {rowLabel}`): qui si presidia che la griglia riceva il
    nome, o venti pulsanti identici tornerebbero senza nome.
  */
  assert.match(
    GRID,
    /rowLabel=\{\(row\) => row\.title\}/,
    "era l'unica via a Modifica/Pubblica/Ritira/Elimina, ripetuta N volte senza nome",
  );

  const iconeParlanti = PAGE.match(
    /<(Download|Users|Edit|Trash2|MoreVertical|RotateCcw|Upload) className="[^"]*"\s*\/>/g,
  );
  assert.equal(
    iconeParlanti,
    null,
    `icone decorative senza aria-hidden: ${iconeParlanti?.join(", ")}`,
  );
});

test("non si offre un gesto che il server rifiutera (M1)", () => {
  assert.match(
    GRID,
    /hidden: \(row\) => !canManage \|\| row\.status !== "active"/,
    "«Ritira» su una bozza faceva rispondere 400: le transizioni sono draft→active, active→retired",
  );
  assert.match(GRID, /hidden: \(row\) => !canManage \|\| row\.status !== "retired"/, "«Riattiva» solo su un modello ritirato");

  assert.match(
    MODEL,
    /const canProduceFilled = \(template: DocumentTemplateSummary\) =>\s*\n\s*template\.status !== "retired" && template\.publishedVersion > 0;/,
    "sono le due condizioni di loadPublishableVersion, dette con le stesse parole",
  );
  assert.match(
    GRID,
    /label: "Genera documento"[^\n]*hidden: \(row\) => !canProduceFilled\(row\)/,
    "su una bozza il gesto possibile e uno solo, e l'etichetta lo deve dire",
  );
  assert.match(GRID, /label: "Stampa il modulo vuoto"[^\n]*hidden: \(row\) => canProduceFilled\(row\)/);
  assert.match(
    GENERATE_DRAWER,
    /!canProduceFilled\(template\)/,
    "«Genera compilato» era offerto anche su bozze e ritirati",
  );
  assert.match(
    PAGE,
    /Questo modello [eè] ritirato/,
    "un rifiuto va spiegato dove viene rifiutato",
  );
});

test("i dati mancanti si dicono in italiano, non in chiavi", () => {
  assert.match(
    PREVIEW_DRAWER,
    /preview\.missing\.map\(describePlaceholderKey\)/,
    "«athlete.fiscal_code» e la chiave; l'etichetta umana e gia nel catalogo",
  );
  /*
    E la funzione vive nel **proprietario del catalogo**, non in pagina: la
    useranno due componenti — l'anteprima e il dialogo del lotto — e una
    seconda copia divergerebbe alla prima etichetta che qualcuno decide di
    cambiare.
  */
  assert.match(
    PREVIEW_DRAWER,
    /describePlaceholderKey \} from "@\/lib\/documents\/placeholders"/,
    "l'etichetta si legge dal proprietario dei segnaposto, non si riscrive qui",
  );
  assert.doesNotMatch(
    PAGE,
    /const describePlaceholderKey/,
    "una seconda copia dell'etichetta divergerebbe dalla prima",
  );
});

/* ------------------------------------------------------------- l'editor */

test("l'editor propone solo cio che il soggetto sa riempire (DOC-04)", () => {
  assert.match(EDITOR, /listPlaceholderTokensForSubject\(subject\)/);
  assert.ok(
    !/tokens = DOCUMENT_TEMPLATE_TOKENS/.test(EDITOR),
    "il catalogo intero proponeva {{trainer.first_name}} dentro un modello che parla di un atleta",
  );
  assert.match(
    EDITOR_VIEW,
    /subject=\{subject\}/,
    "il soggetto del modello va passato all'editor, o l'elenco resta quello di prima",
  );
});

/* ------------------------------------------------------------ responsive */

test("la schermata regge 375 px", () => {
  const colonneFisse = PAGE.split("\n").filter((riga) =>
    /(?<![a-z:])grid-cols-[23]\b/.test(riga),
  );
  assert.deepEqual(
    colonneFisse,
    [],
    "a 375 px due o tre colonne non ci stanno: si usa grid-cols-1 md:grid-cols-2",
  );

  if (/<table/.test(PAGE)) {
    assert.match(
      PAGE,
      /overflow-x-auto/,
      "una tabella senza contenitore scrollabile allarga tutto il documento",
    );
  }

  assert.match(
    PAGE_ONLY,
    /<SegmentedControl<ModulisticaTab>[\s\S]{0,400}?className="max-w-full overflow-x-auto"/,
    "le schede oltre la terza erano tagliate via, cioe irraggiungibili da un telefono",
  );
  /* I piedi dei cassetti V2 vanno a capo da soli (`flex-wrap` nel Drawer). */
  assert.equal((PAGE.match(/<DialogFooter/g) || []).length, 0, "nessun Dialog V1: i moduli sono cassetti, i modali confermano");
});
