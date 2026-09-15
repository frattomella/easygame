import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **W6 §16 — una sola esperienza dietro un solo nome**, e la decisione che
 * PP-01 ha ribaltato per una schermata sola.
 *
 * ## Cosa disse la Wave 6, e perche
 *
 * Il mandato della Wave 6 chiedeva di **nascondere** «Scansiona documento»
 * finche la capability non fosse reale. Questi controlli risposero di no: l'OCR
 * c'era, era locale, riconosceva la MRZ e validava il codice fiscale con il
 * carattere di controllo prima di proporlo, ed era montato in cinque schermate.
 * Il difetto vero era che quattro schermate su cinque **proponevano** i campi e
 * la quinta — la scheda atleta — li **scriveva tutti**. La Wave 6 allineo la
 * quinta invece di spegnerla.
 *
 * ## Cosa dice PP-01 §H, e perche non e la stessa richiesta
 *
 * PP-01 toglie la funzione **dalla sola scheda atleta**. La Wave 6 aveva
 * respinto «nascondi una capability che non esiste», perche esisteva; qui il
 * proprietario del prodotto giudica **non utilizzabile l'esperienza** di quella
 * schermata — la fotocamera a tutta pagina, il dialogo largo, l'OCR
 * sull'immagine di una scrivania — e decide di riproporla in futuro con un
 * percorso vero: acquisizione, riconoscimento, estrazione, anteprima, conferma.
 *
 * **Cio che PP-01 non tocca** e esattamente cio che questo file difendeva:
 * `DocumentExtractionField` e il motore che gli sta sotto restano montati nelle
 * altre quattro schermate — nuovo socio, nuovo staff, nuovo allenatore, nuovo
 * atleta — **e nel dialogo del tutore dentro questa stessa scheda**. La regola
 * del dominio «si propone, non si scrive» resta la regola, e i controlli che la
 * presidiano restano tutti qui.
 *
 * Il controllo che ha cambiato segno e **uno solo**: chiedeva alla scheda
 * atleta di avere un proprio scanner allineato al campo condiviso; adesso
 * chiede che non ne abbia uno proprio. Accanto gli sta il censimento, che
 * verifica che togliere quello non abbia tolto anche gli altri cinque.
 */

const SRC = path.join(process.cwd(), "src");
const leggi = (relativo) =>
  readFileSync(path.join(SRC, ...relativo.split("/")), "utf8");

const senzaCommenti = (sorgente) =>
  sorgente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CAMPO = "components/forms/document-extraction-field.tsx";
const SCHEDA = "app/athletes/[id]/page.tsx";

test("§16 · la regola del dominio e una sola, ed e scritta", () => {
  const dominio = leggi("lib/document-extraction.ts");
  assert.match(
    dominio,
    /si propone, non si scrive/i,
    "la regola deve stare nel dominio, non nei componenti che la applicano",
  );
});

test("PP-01 §H · la scheda atleta non ha piu uno scanner suo", () => {
  const scheda = senzaCommenti(leggi(SCHEDA));

  for (const residuo of [
    "Scansiona documento",
    "showDocumentScannerModal",
    "documentScanAccepted",
    "campiDelDocumento",
    "startDocumentScannerCamera",
    "getUserMedia",
    'import("tesseract.js")',
    "parseScannedDocument",
  ]) {
    assert.equal(
      scheda.includes(residuo),
      false,
      `la funzione e stata tolta dalla superficie: non deve restarne il motore (${residuo})`,
    );
  }
});

test("PP-01 §H · toglierla dalla scheda non l'ha tolta dalle altre cinque", () => {
  /*
    **Il censimento, come controllo.** La scheda atleta duplicava il motore
    invece di montare il campo condiviso: e per questo che togliere il suo
    scanner non tocca nessun altro. Se un giorno qualcuno togliesse anche il
    campo condiviso credendo di finire il lavoro, questo controllo lo ferma.
  */
  const consumatori = [
    "app/soci/new/page.tsx",
    "components/staff/v2/staff-form.tsx",
    "app/trainers/new/page.tsx",
    "components/forms/AthleteCreateForm.tsx",
    /* Il tutore vive **dentro** la scheda atleta: dal Web V2 nel cassetto del tutore. */
    "components/athletes/profile/v2/AthleteProfileDrawers.tsx",
  ];

  for (const file of consumatori) {
    assert.ok(
      leggi(file).includes("DocumentExtractionField"),
      `${file}: il campo condiviso deve restare montato`,
    );
  }

  assert.ok(
    leggi("lib/document-extraction.ts").includes("parseScannedDocument"),
    "il parser resta: lo usa il campo condiviso",
  );
});

test("§16 · la preselezione non sovrascrive cio che la segreteria ha gia verificato", () => {
  const sorgente = senzaCommenti(leggi(CAMPO));
  assert.ok(
    sorgente.includes("!hasValue(entry.key)"),
    `${CAMPO}: un dato gia in scheda non si spunta da solo`,
  );
});

test("§16 · la fotocamera non e piu in un punto solo dell'applicazione", () => {
  const campo = leggi(CAMPO);

  assert.ok(
    campo.includes('capture="environment"'),
    "chi ha il documento in mano e il telefono in mano non deve prima salvare un file",
  );
  assert.ok(
    campo.includes("Scatta una foto"),
    "e deve poterlo leggere sul pulsante",
  );
  assert.ok(
    campo.includes('matchMedia("(pointer: coarse)")'),
    "su un dispositivo con il mouse `capture` non apre niente: un pulsante che promette la fotocamera e apre un selettore di file e una promessa non mantenuta",
  );
});

test("§16 · il PDF che e una fotografia si legge, gli altri restano rifiutati", () => {
  const motore = leggi("lib/document-extraction-ocr.ts");

  assert.ok(
    motore.includes('"application/pdf"'),
    "il caso piu comune di rifiuto era un telefono che aveva gia fotografato il documento",
  );
  assert.ok(
    motore.includes("dataUrlImmagineDaPdf"),
    "il contenitore si apre, il PDF non si rasterizza",
  );

  /*
    La decisione di non aggiungere `pdfjs-dist` resta, e resta scritta: sarebbe
    un megabyte di JavaScript su ogni sessione per una funzione che si usa una
    volta per anagrafica.
  */
  const pacchetto = JSON.parse(
    readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
  );
  assert.equal(
    Boolean(pacchetto.dependencies?.["pdfjs-dist"]),
    false,
    "aprire un contenitore non richiede un motore di rendering",
  );

  const estrattore = leggi("lib/pdf-embedded-image.ts");
  assert.ok(
    estrattore.includes("trovate.length !== 1 || dichiarateNonJpeg > 0"),
    "davanti a un PDF ambiguo ci si ferma: su un documento un ritaglio sbagliato produce un dato plausibile e falso",
  );
});

test("§16 · l'OCR resta nel browser, e nessun documento parte verso un servizio", () => {
  /*
    E la proprieta che nessun servizio esterno puo offrire, ed e la ragione per
    cui il motore resta locale: mandare la carta d'identita di un **minore** a
    un servizio richiede base giuridica, DPA e informativa — non una riga di
    codice. La decisione e in [35] §539 e resta valida.
  */
  const motore = leggi("lib/document-extraction-ocr.ts");
  assert.ok(motore.includes('import("tesseract.js")'));

  for (const vietato of ["fetch(", "XMLHttpRequest", "axios"]) {
    assert.equal(
      senzaCommenti(motore).includes(vietato),
      false,
      `il motore non deve poter mandare il documento da nessuna parte (${vietato})`,
    );
  }
});
