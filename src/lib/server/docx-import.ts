/**
 * **Import di un documento Word come base per la Modulistica** (mandato
 * multi-stagione E5-E12).
 *
 * Un `.docx` e uno zip di XML: non promette una conversione perfetta, ma
 * non deve nemmeno perdere niente in silenzio (E9). Questo modulo fa due
 * cose e nient'altro — vaglia il file, converte il testo — e lascia a chi
 * chiama la scelta di salvare cio che esce.
 *
 * **Sicurezza (E10), punto per punto:**
 * - dimensione: `MAX_ATTACHMENT_BYTES` (10 MB), lo stesso soffitto degli
 *   allegati — non un limite nuovo per un formato nuovo;
 * - MIME + estensione: vagliati da chi chiama, con
 *   `ALLOWED_ATTACHMENT_MIME_TYPES` (gia comprende il DOCX) — mai fidarsi
 *   del nome del file da solo;
 * - bomba d'archivio: la dimensione **non compressa** della somma delle
 *   voci si legge dai metadati dello zip (intestazione centrale) **prima**
 *   di espandere niente, e si rifiuta oltre una soglia — un file piccolo
 *   compresso che si gonfia enormemente in memoria non arriva a `mammoth`;
 * - XML: nessun parser proprio, e `mammoth`/`@xmldom` non eseguono entita
 *   esterne ne DTD — solo testo e formattazione del documento;
 * - macro: non lette mai. `mammoth` non apre `vbaProject.bin`;
 * - risorse esterne: nessuna. Le immagini incassate nel `.docx` **non**
 *   diventano `data:` URI nell'HTML — la sanificazione (ADR-0190) le
 *   toglierebbe comunque, e qui si scelgono di non generarle affatto,
 *   dicendolo nel rapporto invece di lasciare che spariscano da sole;
 * - percorso: nessuna scrittura su disco. Tutto in memoria, `Buffer` a
 *   `Buffer`.
 */

import mammoth from "mammoth";
import JSZip from "jszip";
import { sanitizeRichHtml } from "@/lib/rich-text/sanitize";
import { MAX_ATTACHMENT_BYTES } from "@/lib/attachments";

/**
 * La somma delle dimensioni non compresse non deve superare questo tetto:
 * un `.docx` reale (testo, tabelle, qualche immagine) sta ben sotto; una
 * bomba d'archivio (pochi KB compressi, gigabyte di XML ripetuto) lo
 * supera all'istante, senza aver decompresso niente per scoprirlo.
 */
const MAX_UNCOMPRESSED_BYTES = 80 * 1024 * 1024;

/** Il tetto dell'HTML prodotto: una seconda soglia, indipendente dalla prima. */
const MAX_OUTPUT_HTML_LENGTH = 5_000_000;

export class DocxImportError extends Error {}

export type DocxImportResult = {
  html: string;
  /** Cio che il documento aveva e questo import non ha portato (E9). */
  unsupported: string[];
};

/**
 * **Il tetto si legge dai metadati, non dal contenuto** (bomba d'archivio).
 *
 * `JSZip.loadAsync` legge l'intestazione centrale dello zip — nomi e
 * dimensioni delle voci — senza decomprimerle: e per questo che la somma
 * si puo controllare prima di chiamare `mammoth`, che decomprime per
 * intero.
 */
const assertSafeArchiveSize = async (buffer: Buffer) => {
  let archivio: JSZip;
  try {
    archivio = await JSZip.loadAsync(buffer);
  } catch {
    throw new DocxImportError("Il file non e un documento Word valido (archivio corrotto o non riconosciuto)");
  }

  let totaleNonCompresso = 0;
  archivio.forEach((_percorso, voce) => {
    /*
      Un nome di voce con `..` non porta a una scrittura su disco qui (non
      si estrae niente): resta comunque un segnale di un archivio scritto a
      mano, non da Word, e si rifiuta per prudenza.
    */
    if (_percorso.includes("..")) {
      throw new DocxImportError("Il file contiene un percorso non valido");
    }
    totaleNonCompresso += (voce as any)?._data?.uncompressedSize || 0;
  });

  if (totaleNonCompresso > MAX_UNCOMPRESSED_BYTES) {
    throw new DocxImportError("Il documento e troppo grande una volta decompresso: non importato");
  }
};

/**
 * Converte un `.docx` in HTML sanificato, pronto per il builder.
 *
 * Non salva niente: chi chiama decide, dopo l'anteprima (E12), se
 * scrivere il risultato in un modello.
 */
export const convertDocxToHtml = async (buffer: Buffer): Promise<DocxImportResult> => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new DocxImportError("File vuoto o non leggibile");
  }
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new DocxImportError(`Il file supera la dimensione massima consentita (${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB)`);
  }

  await assertSafeArchiveSize(buffer);

  let immaginiNelDocumento = 0;
  const esito = await mammoth.convertToHtml(
    { buffer },
    {
      /*
        Nessuna `data:` URI: un'immagine incassata sparirebbe comunque alla
        sanificazione (ADR-0190, `ALLOWED_IMAGE_SRC` accetta solo gli
        allegati del sistema). Si conta qui invece di lasciarla sparire in
        silenzio dal passo successivo.
      */
      convertImage: mammoth.images.imgElement(async () => {
        immaginiNelDocumento += 1;
        /*
          `src` vuoto, mai una `data:` URI: la sanificazione toglierebbe
          comunque il tag (ADR-0190), qui si evita solo di costruire prima
          una stringa di byte che non servirebbe a niente.
        */
        return { src: "" };
      }),
    },
  );

  if (esito.value.length > MAX_OUTPUT_HTML_LENGTH) {
    throw new DocxImportError("Il documento produce un contenuto troppo grande da importare");
  }

  const html = sanitizeRichHtml(esito.value);

  const unsupported = esito.messages.map((messaggio) => messaggio.message);
  if (immaginiNelDocumento > 0) {
    unsupported.push(
      `${immaginiNelDocumento} immagine${immaginiNelDocumento === 1 ? "" : "i"} nel documento non importata${immaginiNelDocumento === 1 ? "" : "e"}: da aggiungere a mano dal builder`,
    );
  }

  return { html, unsupported };
};
