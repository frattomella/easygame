import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  BULK_GENERATION_SLICE,
  applySliceOutcome,
  batchProgress,
  clearStoredBatch,
  newBatchId,
  pendingSubjects,
  readStoredBatch,
  retryFailures,
  sliceCount,
  sliceSubjects,
  startBatch,
  writeStoredBatch,
} from "../../src/components/documents/bulk-generation.ts";
import {
  BUNDLE_HTML_LIMIT_BYTES,
  EMBEDDED_IMAGE_ATTRIBUTE,
  EMBEDDED_IMAGE_PAYLOAD_ID,
  buildDocumentBundleHtml,
  extractDocumentSheet,
  extractRepeatedImages,
  hydrateEmbeddedImages,
  measureHtmlBytes,
  planBundleParts,
} from "../../src/components/documents/document-bundle.ts";
import { MAX_GENERATION_BATCH } from "../../src/lib/documents/template-model.ts";

/**
 * La generazione massiva vista dalla schermata (W3-E, parte UI).
 *
 * **Cosa prova, e cosa no.** Le regole del lotto sono un modulo puro, e qui si
 * eseguono davvero: la dimensione delle fette, l'identificativo unico, cosa
 * resta da fare dopo un ricaricamento, il fascicolo che si divide. Il resto
 * sono asserzioni statiche sul sorgente, come negli altri test di `tests/ui/`:
 * non provano che il dialogo si disegni, provano che le tre cose che in un
 * lotto si rompono davvero non siano state scritte in un altro modo.
 *
 * Le tre cose, per nome:
 *
 * 1. una chiamata porta al piu cinquanta soggetti — oltre, il server la
 *    rifiuta, e il lotto non parte affatto;
 * 2. l'identificativo del lotto e **uno solo**, sopravvive a un F5 e viene
 *    riusato dal nuovo tentativo: e cio che rende i doppioni impossibili;
 * 3. chi non e passato compare con **il motivo**, altrimenti si consegnano
 *    novantasette documenti dicendo che sono cento.
 */

const SRC = path.join(process.cwd(), "src");

const readRaw = (...segments) =>
  readFileSync(path.join(SRC, ...segments), "utf8").replace(/\r\n/g, "\n");

/* I commenti si tolgono: spiegano cosa non si fa, e li si scambierebbe per il reperto. */
const readCode = (...segments) =>
  readRaw(...segments)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const PAGE = readCode("app", "modulistica", "page.tsx");
const DIALOG = readCode("components", "documents", "BulkGenerationDialog.tsx");
const BUNDLE_RAW = readRaw("components", "documents", "document-bundle.ts");
const ROUTE_RAW = readRaw(
  "app",
  "api",
  "v1",
  "documents",
  "generated",
  "route.ts",
);

const soggetti = (quanti, prefisso = "a") =>
  Array.from({ length: quanti }, (_, indice) => ({
    id: `${prefisso}${indice}`,
    label: `Atleta ${indice}`,
  }));

/* ------------------------------------------------------- le fette da 50 */

test("una fetta porta al piu cinquanta soggetti, quanti che se ne selezionino", () => {
  for (const quanti of [1, 50, 51, 100, 137]) {
    const fette = sliceSubjects(soggetti(quanti));

    for (const fetta of fette) {
      assert.ok(
        fetta.length <= BULK_GENERATION_SLICE,
        `${quanti} soggetti: una fetta da ${fetta.length} la rotta la rifiuta, e il lotto non parte`,
      );
    }

    assert.equal(
      fette.reduce((totale, fetta) => totale + fetta.length, 0),
      quanti,
      "una fetta in piu o in meno vuol dire un atleta senza documento",
    );
    assert.equal(fette.length, sliceCount(quanti));
  }

  assert.equal(sliceSubjects(soggetti(100)).length, 2, "cento sono due chiamate");
});

test("nessuno puo chiedere una fetta piu grande del tetto", () => {
  const fette = sliceSubjects(soggetti(120), 500);

  for (const fetta of fette) {
    assert.ok(fetta.length <= BULK_GENERATION_SLICE);
  }
});

test("il tetto della schermata e quello con cui la rotta rifiuta", () => {
  assert.equal(
    BULK_GENERATION_SLICE,
    MAX_GENERATION_BATCH,
    "due numeri diversi qui vogliono dire un lotto che si rompe solo oltre il cinquantunesimo atleta, cioe in produzione",
  );
  assert.equal(MAX_GENERATION_BATCH, 50);

  assert.match(
    ROUTE_RAW,
    /import \{ MAX_GENERATION_BATCH \} from "@\/lib\/documents\/template-model"/,
    "server e client devono leggere lo stesso valore, non copiarselo",
  );
  assert.match(
    readRaw("components", "documents", "bulk-generation.ts"),
    /import \{ MAX_GENERATION_BATCH \} from "@\/lib\/documents\/template-model"/,
  );
});

/* ------------------------------------------- un identificativo per lotto */

test("il lotto nasce con un identificativo solo, e non lo cambia mai", () => {
  const lotto = startBatch({
    templateId: "t1",
    templateTitle: "Attestazione",
    subjectKind: "athlete",
    seasonId: "s1",
    subjects: soggetti(100),
  });

  assert.ok(lotto.batchId, "senza identificativo il lotto non e ripartibile");

  const dopoPrimaFetta = applySliceOutcome(lotto, {
    produced: soggetti(50).map((soggetto) => ({
      id: `doc-${soggetto.id}`,
      subjectId: soggetto.id,
      label: soggetto.label,
      missing: [],
    })),
    failed: [],
  });

  assert.equal(
    dopoPrimaFetta.batchId,
    lotto.batchId,
    "la seconda chiamata deve portare lo stesso batch_id della prima",
  );
  assert.equal(
    retryFailures(dopoPrimaFetta).batchId,
    lotto.batchId,
    "riprovare non e un lotto nuovo: con un identificativo nuovo i gia prodotti tornerebbero doppi",
  );

  assert.notEqual(
    newBatchId(),
    newBatchId(),
    "due lotti distinti non possono condividere l'identificativo",
  );
});

test("i soggetti ripetuti non diventano due documenti", () => {
  const lotto = startBatch({
    templateId: "t1",
    templateTitle: "Attestazione",
    subjectKind: "athlete",
    seasonId: null,
    subjects: [
      { id: "a1", label: "Uno" },
      { id: "a1", label: "Uno" },
      { id: "a2", label: "Due" },
    ],
  });

  assert.deepEqual(
    lotto.subjects.map((soggetto) => soggetto.id),
    ["a1", "a2"],
  );
});

/* ------------------------------------------------ la ripresa dopo un F5 */

test("il lotto sopravvive a un ricaricamento e riprende da dove era", () => {
  const scaffale = new Map();
  const finestra = globalThis.window;

  globalThis.window = {
    sessionStorage: {
      getItem: (chiave) => (scaffale.has(chiave) ? scaffale.get(chiave) : null),
      setItem: (chiave, valore) => scaffale.set(chiave, String(valore)),
      removeItem: (chiave) => scaffale.delete(chiave),
    },
  };

  try {
    const lotto = startBatch({
      templateId: "t1",
      templateTitle: "Attestazione",
      subjectKind: "athlete",
      seasonId: "s1",
      subjects: soggetti(100),
    });

    const dopoPrimaFetta = applySliceOutcome(lotto, {
      produced: soggetti(100)
        .slice(0, 50)
        .map((soggetto) => ({
          id: `doc-${soggetto.id}`,
          subjectId: soggetto.id,
          label: soggetto.label,
          missing: [],
        })),
      failed: [],
    });

    writeStoredBatch(dopoPrimaFetta);

    /* Il ricaricamento: lo stato di React sparisce, `sessionStorage` no. */
    const ripreso = readStoredBatch();

    assert.ok(ripreso, "senza stato conservato si ricomincerebbe da capo");
    assert.equal(
      ripreso.batchId,
      lotto.batchId,
      "riprendere con un identificativo nuovo rigenererebbe i primi cinquanta",
    );
    assert.equal(
      pendingSubjects(ripreso).length,
      50,
      "restano da servire solo i cinquanta che non sono passati",
    );
    assert.equal(batchProgress(ripreso).served, 50);
    assert.equal(batchProgress(ripreso).percent, 50);

    clearStoredBatch();
    assert.equal(readStoredBatch(), null, "un lotto chiuso non si ripropone");
  } finally {
    globalThis.window = finestra;
  }
});

test("riprovare rimette in coda solo i falliti", () => {
  const lotto = startBatch({
    templateId: "t1",
    templateTitle: "Attestazione",
    subjectKind: "athlete",
    seasonId: null,
    subjects: soggetti(5),
  });

  const dopo = applySliceOutcome(lotto, {
    produced: soggetti(5)
      .slice(0, 3)
      .map((soggetto) => ({
        id: `doc-${soggetto.id}`,
        subjectId: soggetto.id,
        label: soggetto.label,
        missing: [],
      })),
    failed: [
      { subjectId: "a3", reason: "Accesso negato: appartiene a un altro club" },
      { subjectId: "a4", reason: "Manca il codice fiscale" },
    ],
  });

  assert.equal(pendingSubjects(dopo).length, 0, "la fetta e chiusa per tutti e cinque");
  assert.equal(dopo.failures.length, 2);

  const nuovoTentativo = retryFailures(dopo);

  assert.deepEqual(
    pendingSubjects(nuovoTentativo).map((soggetto) => soggetto.id),
    ["a3", "a4"],
    "i tre gia prodotti non si rispediscono",
  );
  assert.equal(nuovoTentativo.producedIds.length, 3, "cio che e prodotto resta");
});

/* ------------------------------------------------ l'esito, con i motivi */

test("l'esito porta il motivo di ogni fallito, e il nome di chi lo ha subito", () => {
  const lotto = startBatch({
    templateId: "t1",
    templateTitle: "Attestazione",
    subjectKind: "athlete",
    seasonId: null,
    subjects: [
      { id: "a1", label: "Mario Rossi" },
      { id: "a2", label: "Lucia Bianchi" },
    ],
  });

  const dopo = applySliceOutcome(lotto, {
    produced: [
      {
        id: "doc-a1",
        subjectId: "a1",
        label: "Mario Rossi",
        missing: ["athlete.fiscal_code"],
      },
    ],
    failed: [{ subjectId: "a2", reason: "Manca la data di nascita" }],
  });

  assert.deepEqual(dopo.failures, [
    { id: "a2", label: "Lucia Bianchi", reason: "Manca la data di nascita" },
  ]);

  /*
    I campi bianchi **non** sono un fallimento: il documento esiste. Ma chi lo
    consegna deve saperlo prima, non davanti alla famiglia.
  */
  assert.deepEqual(dopo.blanks, [
    { id: "a1", label: "Mario Rossi", keys: ["athlete.fiscal_code"] },
  ]);
  assert.equal(dopo.producedIds.length, 1);
});

test("una fetta non cancella l'esito di quella prima", () => {
  const lotto = startBatch({
    templateId: "t1",
    templateTitle: "Attestazione",
    subjectKind: "athlete",
    seasonId: null,
    subjects: soggetti(4),
  });

  const prima = applySliceOutcome(lotto, {
    produced: [],
    failed: [{ subjectId: "a0", reason: "Primo motivo" }],
  });
  const seconda = applySliceOutcome(prima, {
    produced: [],
    failed: [{ subjectId: "a1", reason: "Secondo motivo" }],
  });

  assert.deepEqual(
    seconda.failures.map((fallito) => fallito.reason),
    ["Primo motivo", "Secondo motivo"],
    "sovrascrivere qui vorrebbe dire consegnare un esito che dimentica meta lotto",
  );
});

test("il dialogo mostra il motivo, e non lo riscrive", () => {
  assert.match(
    DIALOG,
    /failure\.reason/,
    "il motivo e quello del server: riscriverlo manda a chiamare l'assistenza",
  );
  assert.match(DIALOG, /Non generati, e il motivo/);
  assert.match(
    DIALOG,
    /blank\.keys\.join/,
    "chi ha campi bianchi va elencato: non e un fallimento, ma va saputo prima di consegnare",
  );
});

/* -------------------------------------------------------- il fascicolo */

test("il fascicolo e una pagina sola, un documento per foglio", () => {
  const html = buildDocumentBundleHtml({
    title: "Attestazione",
    documents: [
      { id: "1", title: "A", html: "<html><body><div>Primo</div></body></html>" },
      { id: "2", title: "B", html: "<html><body><div>Secondo</div></body></html>" },
    ],
  });

  assert.match(
    html,
    /page-break-after:\s*always/,
    "senza interruzione di pagina i documenti si stampano attaccati",
  );
  assert.equal(
    (html.match(/class="fascicolo-foglio"/g) || []).length,
    2,
    "un foglio per documento",
  );
  assert.ok(html.includes("Primo") && html.includes("Secondo"));
});

test("il fascicolo riusa lo stile dei documenti, non ne scrive un secondo", () => {
  const html = buildDocumentBundleHtml({
    title: "Attestazione",
    documents: [
      {
        id: "1",
        title: "A",
        html: "<html><head><style>.sheet { padding: 24px; }</style></head><body><div class=\"sheet\">Uno</div></body></html>",
      },
    ],
  });

  assert.match(
    html,
    /\.sheet \{ padding: 24px; \}/,
    "lo stesso documento stampato da solo e dentro il fascicolo deve venire uguale",
  );
  assert.ok(
    !/font-family/.test(readRaw("components", "documents", "document-bundle.ts")),
    "il foglio di stile lo scrive il renderer del server, non questo modulo",
  );
});

test("un documento entra nel fascicolo senza il suo involucro", () => {
  const foglio = extractDocumentSheet(
    '<!doctype html><html><head><style>x{}</style></head><body>  <div class="sheet">Corpo</div>  </body></html>',
  );

  assert.equal(foglio, '<div class="sheet">Corpo</div>');

  const html = buildDocumentBundleHtml({
    title: "Attestazione",
    documents: [
      {
        id: "1",
        title: "A",
        html: "<!doctype html><html><head><title>x</title></head><body><p>Uno</p></body></html>",
      },
    ],
  });

  assert.equal(
    (html.match(/<head>/g) || []).length,
    1,
    "cento pagine complete annidate darebbero cento <head> in mezzo al corpo",
  );
});

test("sopra gli otto megabyte il fascicolo si divide, e non si tronca", () => {
  assert.equal(
    BUNDLE_HTML_LIMIT_BYTES,
    8 * 1024 * 1024,
    "la soglia e dichiarata, non implicita",
  );

  const grosso = (etichetta) => ({
    id: etichetta,
    title: etichetta,
    html: `<html><body><div>${"x".repeat(3 * 1024 * 1024)}</div></body></html>`,
  });

  const parti = planBundleParts([grosso("a"), grosso("b"), grosso("c")]);

  assert.equal(parti.length, 2, "tre pezzi da tre megabyte non stanno in uno da otto");
  assert.equal(
    parti.reduce((totale, parte) => totale + parte.length, 0),
    3,
    "dividere non e perdere: un fascicolo incompleto che sembra completo e peggio di due",
  );

  assert.equal(
    planBundleParts([grosso("a")]).length,
    1,
    "sotto soglia resta un fascicolo solo",
  );
});

/* ------------------------------ le immagini ripetute, una volta sola (H1) */

/*
  Un documento come quelli veri: firma e timbro scansionati, che in base64
  diventano ~222 kB **per documento**. E il 97% di una riga
  `generated_documents`, e per cento documenti erano 22 MB di fascicolo.
*/
const dataUrl = (bytes) =>
  `data:image/png;base64,${"A".repeat(Math.ceil(bytes / 3) * 4)}`;
const FIRMA = dataUrl(90 * 1024);
const TIMBRO = dataUrl(76 * 1024);

const documentoConFirma = (id) => ({
  id,
  title: "Attestazione",
  html: `<html><head><style>.sheet{}</style></head><body><div class="sheet"><p>Testo</p><img src="${FIRMA}" alt="Firma" style="max-height: 90px;" /><img src="${TIMBRO}" alt="Timbro" style="max-height: 90px;" /></div></body></html>`,
});

test("la firma entra nel fascicolo una volta sola, e resta un <img>", () => {
  const documenti = Array.from({ length: 100 }, (_, indice) =>
    documentoConFirma(`d${indice}`),
  );

  const grezzo = documenti.reduce(
    (totale, documento) => totale + measureHtmlBytes(documento.html),
    0,
  );
  const html = buildDocumentBundleHtml({
    title: "Attestazioni",
    documents: documenti,
  });
  const fascicolo = measureHtmlBytes(html);

  assert.ok(
    grezzo > 20 * 1024 * 1024,
    "il caso da riprodurre e proprio quello: cento documenti con firma e timbro pesano oltre 20 MB",
  );
  assert.ok(
    fascicolo < grezzo / 10,
    `il fascicolo deve smettere di ricopiare le stesse immagini: ${fascicolo} byte`,
  );
  assert.equal(
    (html.match(/data:image\/png/g) || []).length,
    2,
    "due immagini, due copie del dato: non duecento",
  );
  assert.equal(
    (html.match(new RegExp(EMBEDDED_IMAGE_ATTRIBUTE, "g")) || []).length,
    200,
    "ogni documento tiene i suoi due <img>: il foglio non cambia, cambia dove sta il dato",
  );
  assert.ok(
    html.includes(`id="${EMBEDDED_IMAGE_PAYLOAD_ID}"`),
    "l'unica copia viaggia con la pagina, altrimenti il fascicolo esce senza firme",
  );
});

test("cento documenti firmati stanno in un fascicolo solo", () => {
  const documenti = Array.from({ length: 100 }, (_, indice) =>
    documentoConFirma(`d${indice}`),
  );

  assert.equal(
    planBundleParts(documenti).length,
    1,
    "il guardrail deve misurare il fascicolo, non la somma dei documenti: si spezzava a trentasei",
  );
});

test("un'immagine che compare una volta sola non si tocca", () => {
  const solo = extractRepeatedImages([
    `<div><img src="${FIRMA}" alt="Firma" /></div>`,
  ]);

  assert.deepEqual(solo.images, {});
  assert.ok(
    solo.sheets[0].includes(FIRMA),
    "estrarre un'immagine unica non risparmia niente e cambia il foglio per niente",
  );
});

/*
  Il minimo di DOM che l'idratazione tocca: il carico e gli `<img>` marcati.
  Non si aggiunge una libreria per due `getAttribute` — e la lettura viene
  comunque dalla pagina vera, non da un finto HTML scritto qui.
*/
const documentoFinto = (html) => {
  const carico = new RegExp(
    `<script type="application/json" id="${EMBEDDED_IMAGE_PAYLOAD_ID}">([\\s\\S]*?)</script>`,
  ).exec(html);

  const marcati = html.match(
    new RegExp(`${EMBEDDED_IMAGE_ATTRIBUTE}="[^"]+"`, "g"),
  ) || [];

  const elementi = marcati.map((marcato) => {
    const attributi = {
      [EMBEDDED_IMAGE_ATTRIBUTE]: marcato.split('"')[1],
    };
    return {
      attributi,
      getAttribute: (nome) =>
        nome in attributi ? attributi[nome] : null,
      setAttribute: (nome, valore) => {
        attributi[nome] = valore;
      },
      removeAttribute: (nome) => {
        delete attributi[nome];
      },
    };
  });

  return {
    elementi,
    getElementById: (id) =>
      id === EMBEDDED_IMAGE_PAYLOAD_ID && carico
        ? { textContent: carico[1] }
        : null,
    querySelectorAll: () => elementi,
  };
};

test("il fascicolo rimette le immagini prima che qualcuno lo guardi", () => {
  const html = buildDocumentBundleHtml({
    title: "Attestazioni",
    documents: [documentoConFirma("a"), documentoConFirma("b")],
  });

  const documento = documentoFinto(html);
  const rimesse = hydrateEmbeddedImages(documento);

  assert.equal(rimesse, 4, "quattro <img> in due documenti");
  assert.deepEqual(
    documento.elementi.map((elemento) => elemento.getAttribute("src")),
    [FIRMA, TIMBRO, FIRMA, TIMBRO],
    "dentro il fascicolo il documento deve venire identico a quello stampato da solo",
  );
  assert.deepEqual(
    documento.elementi.map((elemento) =>
      elemento.getAttribute(EMBEDDED_IMAGE_ATTRIBUTE),
    ),
    [null, null, null, null],
    "a idratazione finita il marcatore non serve piu",
  );
});

/* -------------------- il fascicolo incompleto lo dice, e non lo tace (H3) */

test("un documento che non si rilegge non sparisce dal conteggio", () => {
  assert.match(
    DIALOG,
    /const \{ html \} = await readGeneratedDocumentHtml\(id\);[\s\S]{0,400}mancanti \+= 1;/,
    "prima veniva saltato e basta: novantasette fogli con scritto «97 documenti»",
  );
  assert.match(
    DIALOG,
    /setBundleGap\(\{ documenti, mancanti \}\)/,
    "si dice prima di aprire il fascicolo, non dopo averlo stampato",
  );
  assert.match(DIALOG, /non si sono potuti leggere/);
  assert.match(
    DIALOG,
    /Continua con \{bundleGap\.documenti\.length\}/,
    "le due strade restano aperte: continuare dichiarandolo, o riprovare",
  );
  assert.match(DIALOG, /Riprova la lettura/);
  assert.match(
    DIALOG,
    /missingCount: mancanti/,
    "la lacuna viaggia fino all'intestazione della pagina stampata",
  );
});

test("l'intestazione del fascicolo dichiara quanti ne mancano", () => {
  const completo = buildDocumentBundleHtml({
    title: "Attestazione",
    documents: [
      { id: "1", title: "A", html: "<html><body><p>Uno</p></body></html>" },
    ],
  });
  assert.ok(
    !/incompleto/.test(completo),
    "un fascicolo completo non deve dire niente: l'avviso deve voler dire qualcosa",
  );

  const parziale = buildDocumentBundleHtml({
    title: "Attestazione",
    documents: [
      { id: "1", title: "A", html: "<html><body><p>Uno</p></body></html>" },
    ],
    missingCount: 3,
  });

  assert.match(parziale, /incompleto/);
  assert.match(
    parziale,
    /3 documenti non letti/,
    "«97 documenti» su cento prodotti e un fascicolo che sembra completo",
  );
  assert.match(
    parziale,
    /<title>[^<]*3 documenti non letti[^<]*<\/title>/,
    "il titolo finisce nell'intestazione di stampa: e cio che resta sul foglio",
  );
});

/* ------------------------------ il lotto si annuncia a chi non vede (H7) */

test("avanzamento, interruzione e conclusione hanno una voce", () => {
  assert.match(
    DIALOG,
    /<div className="space-y-2" role="status" aria-live="polite">/,
    "un lotto da cento atleti era due minuti di silenzio: nessun modo di sapere se andava avanti",
  );
  assert.match(
    DIALOG,
    /Lotto concluso: \{batch\?\.producedIds\.length \|\| 0\}/,
    "la fine del lotto va annunciata, non solo disegnata",
  );

  const allarmi = DIALOG.match(/role="alert"/g) || [];
  assert.ok(
    allarmi.length >= 2,
    "l'interruzione e le letture mancate chiedono un gesto subito: sono allarmi, non aggiornamenti",
  );
});

/* ------------------------- un lotto per volta, o il primo sparisce (M-6) */

test("un lotto nuovo non parte sopra uno rimasto a meta", () => {
  assert.match(
    PAGE,
    /const openBulkDialog = \(template: DocumentTemplateSummary\) => \{\s*const sospeso = readStoredBatch\(\);/,
    "lo stato in sospeso si rilegge dallo storage al clic: quello in memoria puo essere di dieci minuti fa",
  );
  assert.match(
    PAGE,
    /riprendilo o scartalo prima di cominciarne un altro/,
    "sovrascriverlo in silenzio faceva sparire i cinquanta mancanti senza dire niente",
  );
  assert.match(
    PAGE,
    /if \(sospeso && !pendingSubjects\(sospeso\)\.length\)/,
    "un lotto che ha servito tutti non e «a meta»: non deve sbarrare la strada",
  );
});

test("il dialogo dichiara la soglia invece di indovinarla", () => {
  assert.match(
    DIALOG,
    /BUNDLE_HTML_LIMIT_BYTES/,
    "la soglia si legge dal modulo del fascicolo, non si riscrive a mano nel testo",
  );
  assert.match(DIALOG, /Il fascicolo supera/);
  assert.match(DIALOG, /planBundleParts/);
});

test("il fascicolo non introduce nessun motore PDF, e lo dice", () => {
  const librerie =
    /\b(jspdf|pdfmake|html2pdf|html2canvas|pdf-lib|puppeteer|playwright|@react-pdf|pdfkit|jszip)\b/i;

  for (const [nome, sorgente] of [
    ["il fascicolo", BUNDLE_RAW],
    ["il dialogo", readRaw("components", "documents", "BulkGenerationDialog.tsx")],
    ["la pagina", readRaw("app", "modulistica", "page.tsx")],
  ]) {
    assert.ok(
      !librerie.test(sorgente),
      `${nome}: un motore PDF e un ADR a se, fuori da questa Wave`,
    );
  }

  const dipendenze = JSON.parse(
    readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
  );
  for (const nome of Object.keys(dipendenze.dependencies || {})) {
    assert.ok(
      !librerie.test(nome),
      `${nome}: nessuna dipendenza nuova per stampare, il browser basta`,
    );
  }

  assert.match(
    BUNDLE_RAW,
    /ZIP/,
    "perche non uno ZIP va scritto: senza file PDF non ha senso, e chi legge il codice fra un anno lo richiedera",
  );
  assert.match(
    BUNDLE_RAW,
    /window\.open/,
    "finestra nuova e stampa del browser: e il pattern di people-pdf-export.ts",
  );
});

/* ------------------------------------------- come la pagina lo consuma */

test("il lotto passa dal client documentale e conserva lo stato fra i ricaricamenti", () => {
  assert.match(
    DIALOG,
    /from "@\/lib\/api\/documents"/,
    "il motore e quello, non un secondo",
  );
  assert.match(
    DIALOG,
    /batchId:\s*stato\.batchId/,
    "ogni fetta porta lo stesso identificativo del lotto",
  );
  assert.match(
    DIALOG,
    /writeStoredBatch\(stato\)/,
    "lo stato si scrive dopo ogni fetta: e il momento in cui un F5 smette di costare",
  );
  assert.match(
    DIALOG,
    /retryFailures\(batch\)/,
    "«riprova i falliti» riusa il lotto, non ne apre un altro",
  );

  assert.match(
    PAGE,
    /readStoredBatch\(\)/,
    "la pagina deve accorgersi del lotto lasciato a meta, o nessuno lo riprendera",
  );
  assert.match(PAGE, /<BulkGenerationDialog/);
  assert.match(PAGE, /Genera per piu atleti/);
  assert.match(
    PAGE,
    /template\.status === "active" && template\.subjectKind === "athlete"/,
    "su una bozza il server rifiuterebbe cinquanta volte, su un altro soggetto produrrebbe cinquanta fogli bianchi",
  );
});

test("prima di produrre cento fogli si dice quanti sono e cosa resta bianco", () => {
  assert.match(
    DIALOG,
    /previewFilledDocument\(/,
    "l'anteprima non scrive niente, ed e il gesto che viene prima",
  );

  const anteprima = DIALOG.indexOf("previewFilledDocument(");
  const produzione = DIALOG.indexOf("generateDocuments(");
  assert.ok(anteprima > 0 && produzione > 0 && anteprima < produzione);

  assert.match(DIALOG, /Stai per generare \{preview\.count\}/);
  assert.match(DIALOG, /questi campi restano bianchi/);
});

/* ------------------------------------------------------------ responsive */

test("la selezione e l'esito reggono 375 px", () => {
  const colonneFisse = DIALOG.split("\n").filter((riga) =>
    /(?<![a-z:])grid-cols-[23]\b/.test(riga),
  );
  assert.deepEqual(colonneFisse, [], "a 375 px due colonne non ci stanno");

  assert.match(
    DIALOG,
    /overflow-x-auto/,
    "la tabella dell'esito deve scorrere nel proprio contenitore, non allargare il dialogo",
  );

  const piedi = DIALOG.match(/<DialogFooter[^>]*>/g) || [];
  const nonImpilati = piedi.filter(
    (piede) => !piede.includes("flex-col") && !piede.includes("<DialogFooter>"),
  );
  assert.deepEqual(
    nonImpilati,
    [],
    "quattro azioni affiancate a 375 px si tagliano a vicenda",
  );

  assert.match(
    DIALOG,
    /max-h-\[90vh\][^"]*overflow-y-auto/,
    "un elenco di duecento atleti deve scorrere dentro il dialogo",
  );
});

test("la selezione multipla e quella condivisa, non una copia", () => {
  assert.match(DIALOG, /useListSelection\(\)/);
  assert.match(DIALOG, /<SelectAllCheckbox/, "«seleziona tutti i filtrati»");
  assert.match(DIALOG, /<SelectRowCheckbox/);
  assert.match(
    DIALOG,
    /describeSelection\(/,
    "il conteggio dei selezionati si dice con la formula condivisa",
  );
});
