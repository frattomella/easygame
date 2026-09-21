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
 * - bomba d'archivio: la somma **decompressa per davvero** delle voci si
 *   conta mentre si decomprime, con un tetto che ferma il flusso appena
 *   superato — mai fidandosi del campo «dimensione non compressa» che lo
 *   zip stesso dichiara nell'intestazione centrale, perche quel numero lo
 *   scrive chi ha costruito l'archivio e un file scritto a mano puo
 *   dichiararne uno piccolo mentre il contenuto vero si gonfia enormemente
 *   (revisione ostile Wave F, C1: la prima stesura si fidava di quel
 *   campo, ed era esattamente il buco che il commento sopra prometteva di
 *   chiudere);
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
 * Decomprime **una voce per davvero**, contando i byte che escono dal
 * flusso, e si ferma appena il totale **condiviso** (`stato.totale`, somma
 * di tutte le voci) supera il tetto — senza aver mai chiesto allo zip
 * quanto pesa: e lo zip stesso a poterlo dire il falso.
 */
const decomprimiContando = (
  voce: JSZip.JSZipObject,
  stato: { totale: number },
): Promise<void> =>
  new Promise((resolve, reject) => {
    /*
      Il tipo di `jszip` dichiara `ReadableStream` (la sua interfaccia
      astratta), ma in Node e sempre un vero `stream.Readable` — e per
      questo ha `.destroy()`, che il tipo non elenca.

      **Non si passa l'errore a `.destroy()`**: distruggere il flusso mentre
      il decompressore sta ancora spingendo dati fa emettere a `jszip` un
      proprio errore di flusso interrotto, che arriverebbe qui **al posto**
      di quello passato — il pacchetto arrivato si tiene con un flag, e si
      decide cosa risolvere in `finally`, non nell'evento `error`.
    */
    let troppoGrande = false;
    const flusso: NodeJS.ReadableStream = voce.nodeStream("nodebuffer") as any;
    let risolto = false;
    const chiudi = (fn: () => void) => {
      if (risolto) return;
      risolto = true;
      fn();
    };
    flusso.on("data", (chunk: Buffer) => {
      stato.totale += chunk.length;
      if (stato.totale > MAX_UNCOMPRESSED_BYTES) {
        troppoGrande = true;
        (flusso as any).destroy();
      }
    });
    flusso.on("error", () => {
      chiudi(() =>
        troppoGrande
          ? reject(new DocxImportError("Il documento e troppo grande una volta decompresso: non importato"))
          : reject(new DocxImportError("Il file non e un documento Word valido (archivio corrotto o non riconosciuto)")),
      );
    });
    flusso.on("close", () => {
      chiudi(() =>
        troppoGrande
          ? reject(new DocxImportError("Il documento e troppo grande una volta decompresso: non importato"))
          : resolve(),
      );
    });
    flusso.on("end", () => chiudi(resolve));
  });

/**
 * **Il tetto si misura decomprimendo, non leggendo i metadati** (bomba
 * d'archivio, revisione ostile Wave F, C1). Una voce alla volta, in serie
 * — non in parallelo, cosi il picco di memoria resta quello di una voce
 * sola — con un contatore condiviso che ferma il flusso appena la somma
 * supera la soglia, prima che l'ultima voce finisca di decomprimersi.
 *
 * Nello stesso giro si rilevano intestazioni e piè di pagina (`word/header*.xml`,
 * `word/footer*.xml`): `mammoth` non li legge mai (non fa nemmeno un
 * tentativo, non e un caso limite del convertitore), e senza dirlo qui
 * sparirebbero in silenzio — l'esatto difetto che E9 vuole evitare
 * (revisione ostile Wave F, H1).
 */
const assertSafeArchiveSize = async (buffer: Buffer): Promise<{ haIntestazioniOPiePagina: boolean }> => {
  let archivio: JSZip;
  try {
    archivio = await JSZip.loadAsync(buffer);
  } catch {
    throw new DocxImportError("Il file non e un documento Word valido (archivio corrotto o non riconosciuto)");
  }

  const voci = Object.values(archivio.files).filter((voce) => !voce.dir);
  let haIntestazioniOPiePagina = false;
  const stato = { totale: 0 };

  for (const voce of voci) {
    /*
      Un nome di voce con `..` non porta a una scrittura su disco qui (non
      si estrae niente): resta comunque un segnale di un archivio scritto a
      mano, non da Word, e si rifiuta per prudenza.
    */
    if (voce.name.includes("..")) {
      throw new DocxImportError("Il file contiene un percorso non valido");
    }
    if (/^word\/(header|footer)\d*\.xml$/.test(voce.name)) {
      haIntestazioniOPiePagina = true;
    }
    await decomprimiContando(voce, stato);
  }

  return { haIntestazioniOPiePagina };
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

  const { haIntestazioniOPiePagina } = await assertSafeArchiveSize(buffer);

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
  if (haIntestazioniOPiePagina) {
    unsupported.push(
      "Intestazione o piè di pagina del documento non importati: si aggiungono a mano dal builder",
    );
  }

  return { html, unsupported };
};
