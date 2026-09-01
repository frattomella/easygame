import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **W6 §16 — una sola esperienza dietro un solo nome.**
 *
 * ## La premessa del mandato che i fatti hanno corretto
 *
 * Il mandato chiedeva di **nascondere** «Scansiona documento» finché la
 * capability non fosse reale. Non era da nascondere: l'OCR c'era, era locale,
 * riconosceva la MRZ e validava il codice fiscale con il carattere di
 * controllo prima di proporlo, ed era montato in cinque schermate.
 *
 * Ciò che spiegava la percezione contraria erano **tre attriti**, e sono
 * quelli che questi controlli presidiano.
 *
 * ## Il terzo attrito, che è il più serio
 *
 * `DocumentExtractionField` — il campo montato in quattro schermate — propone
 * i dati **campo per campo** e lascia scegliere. La scheda atleta, con lo
 * stesso pulsante e lo stesso nome, li **scriveva tutti**.
 *
 * Non è una differenza di stile. Un OCR sbaglia: su un codice fiscale basta un
 * carattere, e un dato plausibile e falso scritto senza che nessuno lo abbia
 * guardato diventa un errore federale al primo tesseramento. La regola del
 * dominio è dichiarata in testa a `src/lib/document-extraction.ts` — «si
 * propone, non si scrive» — ed era rispettata in quattro schermate su cinque.
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

test("§16 · la scheda atleta propone i campi invece di scriverli tutti", () => {
  const scheda = senzaCommenti(leggi(SCHEDA));

  assert.ok(
    scheda.includes("const campiDelDocumento"),
    "servono i campi come elenco scegliibile, non un blocco da applicare",
  );
  assert.ok(
    scheda.includes("documentScanAccepted"),
    "e una selezione che qualcuno ha fatto",
  );
  assert.ok(
    scheda.includes("if (documentScanAccepted.has(campo.key))"),
    "si applica cio che e stato spuntato",
  );

  /*
    La forma vecchia: dieci `if` che copiavano un campo nell'oggetto da
    scrivere, senza che nessuno li avesse guardati.
  */
  assert.equal(
    /nextFields\.fiscalCode = documentScanResult\.fiscalCode/.test(scheda),
    false,
    "un codice fiscale letto da una fotografia non entra in scheda senza che qualcuno lo confermi",
  );
});

test("§16 · la preselezione non sovrascrive cio che la segreteria ha gia verificato", () => {
  for (const [file, marcatore] of [
    [CAMPO, "!hasValue(entry.key)"],
    [SCHEDA, "!campo.giaPresente"],
  ]) {
    const sorgente = senzaCommenti(leggi(file));
    assert.ok(
      sorgente.includes(marcatore),
      `${file}: un dato gia in scheda non si spunta da solo`,
    );
  }
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
