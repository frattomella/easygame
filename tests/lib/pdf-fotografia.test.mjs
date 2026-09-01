import assert from "node:assert/strict";
import test from "node:test";

import {
  estraiImmagineDaPdf,
  sembraUnPdf,
} from "../../src/lib/pdf-embedded-image.ts";

/**
 * **W6 §16 — il PDF che è una fotografia.**
 *
 * L'estrazione dai documenti rifiutava i PDF con una frase onesta: «il motore
 * legge immagini, fotografa il documento». Ma chi riceveva quel messaggio
 * aveva, quasi sempre, appena fotografato il documento: i telefoni salvano lo
 * scatto in PDF per impostazione predefinita. Gli si stava chiedendo di rifare
 * una cosa già fatta.
 *
 * Questo modulo **non legge PDF**: apre un contenitore, e solo quando dentro
 * c'è esattamente una fotografia e nient'altro.
 *
 * ## Perché i test più importanti sono quelli che tornano `null`
 *
 * Su un documento d'identità un ritaglio sbagliato produce un dato
 * **plausibile e falso**, e un dato plausibile e falso su un tesseramento
 * diventa un errore federale. Un modulo che «prova a indovinare» qui sarebbe
 * peggio di uno che rifiuta: perciò la maggioranza di queste prove verifica
 * che davanti all'ambiguità si fermi.
 */

const byte = (...parti) => {
  const pezzi = parti.map((parte) =>
    typeof parte === "string"
      ? Uint8Array.from([...parte].map((c) => c.charCodeAt(0)))
      : Uint8Array.from(parte),
  );
  const totale = pezzi.reduce((somma, pezzo) => somma + pezzo.length, 0);
  const fuori = new Uint8Array(totale);
  let posizione = 0;
  for (const pezzo of pezzi) {
    fuori.set(pezzo, posizione);
    posizione += pezzo.length;
  }
  return fuori;
};

/** Un JPEG minimo ma **vero**: comincia con FFD8FF e finisce con FFD9. */
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0xff, 0xd9];

const pdfConImmagine = (dizionario, dati = JPEG) =>
  byte(
    "%PDF-1.4\n1 0 obj\n",
    dizionario,
    "\nstream\r\n",
    dati,
    "\nendstream\nendobj\n%%EOF",
  );

test("riconosce un PDF dai primi byte, e non si fida dell'estensione", () => {
  assert.equal(sembraUnPdf(byte("%PDF-1.7 ...")), true);
  assert.equal(sembraUnPdf(byte("Non sono un pdf")), false);
  assert.equal(sembraUnPdf(Uint8Array.from(JPEG)), false);
});

test("estrae la fotografia da un PDF che ne contiene una sola", () => {
  const pdf = pdfConImmagine(
    "<< /Type /XObject /Subtype /Image /Filter /DCTDecode /Length 10 >>",
  );

  const esito = estraiImmagineDaPdf(pdf);
  assert.ok(esito, "il caso piu comune deve funzionare, o il modulo non serve");
  assert.equal(esito.mimeType, "image/jpeg");
  assert.deepEqual([...esito.bytes], JPEG);
});

test("il filtro puo essere dichiarato dentro un elenco", () => {
  /*
    Un PDF puo dichiarare piu filtri in cascata. La forma con le parentesi
    quadre e comunissima, e ignorarla avrebbe fatto fallire proprio i file
    prodotti da alcune app di scansione.
  */
  const pdf = pdfConImmagine(
    "<< /Subtype /Image /Filter [/DCTDecode] /Length 10 >>",
  );
  assert.ok(estraiImmagineDaPdf(pdf));
});

test("si ferma davanti a due immagini: non sa quale sta guardando la persona", () => {
  const dizionario =
    "<< /Subtype /Image /Filter /DCTDecode /Length 10 >>";
  const pdf = byte(
    "%PDF-1.4\n",
    dizionario,
    "\nstream\r\n",
    JPEG,
    "\nendstream\n",
    dizionario,
    "\nstream\r\n",
    JPEG,
    "\nendstream\n%%EOF",
  );

  assert.equal(
    estraiImmagineDaPdf(pdf),
    null,
    "con due pagine il ritaglio giusto e una supposizione, e su un documento non si suppone",
  );
});

test("si ferma se dichiara un'immagine che non sa aprire", () => {
  /*
    Una sola JPEG **piu** una PNG: la JPEG si leggerebbe, ma il documento ne
    dichiara due e noi ne vediamo una. Non sappiamo quale delle due sia il
    documento, quindi non lo sa nessuno.
  */
  const pdf = byte(
    "%PDF-1.4\n",
    "<< /Subtype /Image /Filter /DCTDecode /Length 10 >>",
    "\nstream\r\n",
    JPEG,
    "\nendstream\n",
    "<< /Subtype /Image /Filter /FlateDecode /Length 4 >>",
    "\nstream\r\n",
    [1, 2, 3, 4],
    "\nendstream\n%%EOF",
  );

  assert.equal(estraiImmagineDaPdf(pdf), null);
});

test("si ferma se il contenitore mente sul contenuto", () => {
  /*
    Il dizionario dichiara `/DCTDecode`, i byte non sono un JPEG. Fidarsi della
    dichiarazione invece del contenuto e il modo in cui si nascondono i file.
  */
  const pdf = pdfConImmagine(
    "<< /Subtype /Image /Filter /DCTDecode /Length 4 >>",
    [0x00, 0x01, 0x02, 0x03],
  );
  assert.equal(estraiImmagineDaPdf(pdf), null);
});

test("un PDF di solo testo resta rifiutato, come prima", () => {
  const pdf = byte(
    "%PDF-1.4\n<< /Length 44 >>\nstream\nBT /F1 12 Tf (Certificato) Tj ET\nendstream\n%%EOF",
  );
  assert.equal(estraiImmagineDaPdf(pdf), null);
});

test("cio che non e un PDF non si tocca", () => {
  assert.equal(estraiImmagineDaPdf(Uint8Array.from(JPEG)), null);
  assert.equal(estraiImmagineDaPdf(new Uint8Array(0)), null);
});

test("un PDF enorme non si scorre: l'OCR ha lo stesso limite", () => {
  const enorme = new Uint8Array(9 * 1024 * 1024);
  enorme.set(byte("%PDF-1.4"), 0);
  assert.equal(estraiImmagineDaPdf(enorme), null);
});

test("l'a capo dopo `stream` non entra nella fotografia", () => {
  /*
    Un byte di troppo in testa produce un JPEG che nessun decodificatore apre,
    e il difetto si vedrebbe solo come «non riesco a leggere il documento» —
    cioe come il difetto che questo modulo esiste per chiudere.
  */
  for (const aCapo of ["\r\n", "\n"]) {
    const pdf = byte(
      "%PDF-1.4\n<< /Subtype /Image /Filter /DCTDecode >>\nstream",
      aCapo,
      JPEG,
      "\nendstream\n%%EOF",
    );
    const esito = estraiImmagineDaPdf(pdf);
    assert.ok(esito, `con l'a capo ${JSON.stringify(aCapo)} deve funzionare`);
    assert.deepEqual([...esito.bytes], JPEG);
  }
});
