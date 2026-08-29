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

const PAGE = readCode("app", "modulistica", "page.tsx");
const EDITOR = readCode("components", "forms", "DocumentEditor.tsx");

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
  const importaDaSimplifiedDb = PAGE.match(
    /import\s*\{([^}]*)\}\s*from\s*"@\/lib\/simplified-db"/,
  );
  assert.ok(importaDaSimplifiedDb, "la pagina importa ancora gli atleti da li");
  assert.ok(
    !/document|Template/i.test(importaDaSimplifiedDb[1]),
    "nessuna funzione sui modelli deve arrivare da simplified-db",
  );
});

test("i gesti sui modelli passano dal client documentale", () => {
  assert.match(PAGE, /from "@\/lib\/api\/documents"/);

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
    assert.ok(PAGE.includes(gesto), `${gesto} e il gesto del motore nuovo`);
  }
});

test("la pagina non chiama /api con il proprio trasporto", () => {
  assert.ok(
    !/apiRequest\s*[<(]/.test(PAGE),
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
  assert.ok(PAGE.includes("setPublishIssues"));
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
    PAGE,
    /deleteTarget && deleteTarget\.generatedCount > 0/,
    "con documenti gia prodotti la cancellazione va spiegata, non solo rifiutata",
  );
});

test("il nuovo modello chiede il soggetto, e lo spiega", () => {
  assert.ok(PAGE.includes("newDocumentSubject"));
  assert.match(PAGE, /subjectKind: newDocumentSubject/);
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
  assert.match(PAGE, /editorTemplate\.versions\.map/);
  assert.match(PAGE, /Versione \{version\.version\}/);
  assert.match(PAGE, /formatDate\(version\.publishedAt\)/);
});

/* ---------------------------------------------------------- la generazione */

test("prima si vede cosa non e entrato nel documento, poi lo si produce", () => {
  const anteprima = PAGE.indexOf("previewFilledDocument(");
  const produzione = PAGE.indexOf("generateDocuments(");

  assert.ok(anteprima > 0 && produzione > 0);
  assert.ok(
    anteprima < produzione,
    "l'anteprima non scrive niente ed e il gesto che viene prima",
  );

  for (const dichiarazione of ["missing", "unresolved", "warnings"]) {
    assert.ok(
      PAGE.includes(`filledPreview.${dichiarazione}`),
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
    /href=\{`\/api\/v1\/documents\/generated\/\$\{document\.id\}\?format=html`\}/,
    "si apre la resa conservata: modificare un modello non cambia un documento gia consegnato",
  );
  assert.ok(PAGE.includes("Documenti generati"));
});

/* ------------------------------------------------------------- l'editor */

test("l'editor propone solo cio che il soggetto sa riempire (DOC-04)", () => {
  assert.match(EDITOR, /listPlaceholderTokensForSubject\(subject\)/);
  assert.ok(
    !/tokens = DOCUMENT_TEMPLATE_TOKENS/.test(EDITOR),
    "il catalogo intero proponeva {{trainer.first_name}} dentro un modello che parla di un atleta",
  );
  assert.match(
    PAGE,
    /subject=\{editorSubject\}/,
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
    PAGE,
    /<TabsList className="h-auto w-full flex-wrap/,
    "le schede oltre la terza erano tagliate via, cioe irraggiungibili da un telefono",
  );

  const piedi = PAGE.match(/<DialogFooter[^>]*>/g) || [];
  const nonImpilati = piedi.filter(
    (piede) => !piede.includes("flex-col") && !piede.includes("<DialogFooter>"),
  );
  assert.deepEqual(
    nonImpilati,
    [],
    "tre azioni affiancate a 375 px si tagliano a vicenda",
  );
});
