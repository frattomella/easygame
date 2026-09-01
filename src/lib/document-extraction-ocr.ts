import { dataUrlImmagineDaPdf } from "./pdf-embedded-image";
import {
  buildExtractionFromText,
  type DocumentExtractionProvider,
} from "./document-extraction";

/**
 * Motore di lettura: OCR locale con `tesseract.js`.
 *
 * E l'unico provider oggi, ed e **locale**: il documento non lascia il
 * browser. Per un documento d'identita e la scelta giusta di suo — mandare la
 * carta d'identita di un minore a un servizio esterno e una decisione che
 * richiede ben altro che una riga di codice.
 *
 * Il worker si carica solo quando serve (import dinamico): sono alcuni MB, e
 * la maggior parte delle sessioni non legge nessun documento.
 *
 * Cosa **non** fa: i PDF. Il perche, e come si aggiungeranno, sono sotto in
 * `OCR_ACCEPTED_MIME_TYPES`.
 */

export const OCR_PROVIDER_ID = "tesseract-local";

/**
 * I tipi che `tesseract.js` legge davvero.
 *
 * **Il PDF non c'e, ed e una decisione.** `tesseract.js` riconosce testo in
 * un'immagine: un PDF va prima **rasterizzato**, e rasterizzare nel browser
 * richiede `pdfjs-dist` — circa un megabyte di JavaScript, piu un canvas per
 * pagina. Aggiungerla per una funzione che si usa una volta per anagrafica
 * peserebbe su ogni sessione, comprese le moltissime che un documento non lo
 * leggono mai.
 *
 * Il modo giusto di aggiungerla, quando si decidera, e **un secondo motore**:
 * il contratto `DocumentExtractionProvider` esiste per questo, e un provider
 * PDF si aggiunge senza toccare nessun form. Fino ad allora un PDF viene
 * **rifiutato con una spiegazione**, non accettato per poi fallire.
 *
 * **Aggiornamento della Wave 6.** Il PDF resta non rasterizzato, e la
 * decisione qui sopra resta valida. Ma il caso piu comune non richiedeva
 * nessun rasterizzatore: un telefono che «scansiona» un documento salva
 * **una fotografia dentro un contenitore PDF**, e quella fotografia si tira
 * fuori con un taglio di byte. Lo fa `src/lib/pdf-embedded-image.ts`, che
 * non legge PDF: apre un contenitore, e solo quando dentro c'e esattamente
 * una immagine e nient'altro. Ogni altro PDF resta rifiutato con la stessa
 * spiegazione di prima.
 */
export const OCR_ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

export const ocrExtractionProvider: DocumentExtractionProvider = {
  id: OCR_PROVIDER_ID,
  label: "Lettura locale (OCR)",
  accepts: OCR_ACCEPTED_MIME_TYPES,

  async extract(dataUrlInIngresso: string) {
    /*
      Se e un PDF che contiene una fotografia sola, si prosegue con quella.
      Se e un PDF di altra natura, `dataUrlImmagineDaPdf` risponde `null` e
      qui si ferma con la frase che spiega perche — la stessa di prima.
    */
    const eUnPdf = dataUrlInIngresso.startsWith("data:application/pdf");
    const dataUrl = eUnPdf
      ? dataUrlImmagineDaPdf(dataUrlInIngresso)
      : dataUrlInIngresso;

    if (!dataUrl) {
      throw new Error(
        "Questo PDF non contiene una fotografia leggibile: il motore legge " +
          "immagini. Fotografa il documento, oppure compila a mano.",
      );
    }

    let worker: {
      recognize: (input: string) => Promise<any>;
      terminate: () => Promise<unknown>;
    } | null = null;

    try {
      const { createWorker } = await import("tesseract.js");
      const activeWorker = await createWorker("ita+eng");
      worker = activeWorker;

      const result = await activeWorker.recognize(dataUrl);
      const rawText = String(result?.data?.text || "");

      if (!rawText.trim()) {
        throw new Error("Nessun testo riconosciuto");
      }

      return buildExtractionFromText(rawText, OCR_PROVIDER_ID);
    } finally {
      // Un worker non terminato tiene occupata memoria per tutta la sessione.
      if (worker) await worker.terminate().catch(() => undefined);
    }
  },
};

