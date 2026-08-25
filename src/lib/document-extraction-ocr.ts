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
 * Cosa **non** fa: i PDF. `tesseract.js` legge immagini. Un PDF va prima
 * rasterizzato, e serve una libreria che oggi non c'e — vedi la nota in
 * `docs/knowledge-base/11-capabilities.md`.
 */

export const OCR_PROVIDER_ID = "tesseract-local";

export const ocrExtractionProvider: DocumentExtractionProvider = {
  id: OCR_PROVIDER_ID,
  label: "Lettura locale (OCR)",

  async extract(dataUrl: string) {
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

/** I tipi di file che il motore attuale sa davvero leggere. */
export const OCR_ACCEPTED_TYPES = ".jpg,.jpeg,.png,.webp,.heic";
