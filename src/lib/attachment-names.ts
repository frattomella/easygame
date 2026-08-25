import { stripDiacritics } from "./italian-registry";

/**
 * Come si chiama un allegato quando lo si scarica.
 *
 * **Il problema.** I file scaricati da EasyGame si chiamavano
 * `attestato_blsd`, `documento`, `download` — senza estensione e senza dire di
 * chi fossero. In una cartella Download con trenta certificati di trenta
 * atleti erano indistinguibili, e senza estensione il sistema operativo non
 * sapeva nemmeno con che programma aprirli.
 *
 * **La regola** (Blocco 7, punto 7):
 *
 *     <TipoDocumento>_<Cognome>_<Nome>_<data>.<estensione>
 *     BLSD_Rossi_Mario_2026-08-25.pdf
 *
 * Le parti mancanti si saltano, non si riempiono con segnaposto: un file di
 * un soggetto senza nome si chiamera `BLSD_2026-08-25.pdf`, non
 * `BLSD__2026-08-25.pdf`.
 *
 * **Cosa questo modulo non fa.** Non tocca il file memorizzato. Il nome e una
 * decorazione del momento del download: il contenuto e il tipo restano quelli
 * che sono stati caricati.
 */

/**
 * Estensioni per i tipi che EasyGame accetta davvero.
 *
 * E una tabella corta di proposito: serve a dare un'estensione sensata, non a
 * essere un registro MIME. Un tipo sconosciuto non produce estensione, e il
 * file si scarica senza — che e meglio di `.bin` o di un'estensione inventata.
 */
const EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/svg+xml": "svg",
  "image/tiff": "tif",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/zip": "zip",
};

/** Il MIME dichiarato da un data URL, oppure stringa vuota. */
export const readMimeFromDataUrl = (url?: string | null): string => {
  const match = /^data:([^;,]+)[;,]/i.exec(String(url || "").trim());
  return match ? match[1].toLowerCase() : "";
};

export const extensionForMime = (mime?: string | null): string =>
  EXTENSION_BY_MIME[String(mime || "").trim().toLowerCase()] || "";

/** L'estensione gia presente in un nome di file, senza il punto. */
export const extensionFromFileName = (fileName?: string | null): string => {
  const match = /\.([A-Za-z0-9]{1,5})$/.exec(String(fileName || "").trim());
  return match ? match[1].toLowerCase() : "";
};

/**
 * L'estensione da usare, in ordine di attendibilita.
 *
 * Il MIME del data URL viene per primo perche lo ha scritto il browser al
 * momento del caricamento leggendo il file; il nome originale puo essere
 * stato rinominato a mano da chiunque.
 */
export const resolveAttachmentExtension = (source: {
  url?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
}): string =>
  extensionForMime(readMimeFromDataUrl(source.url)) ||
  extensionForMime(source.mimeType) ||
  extensionFromFileName(source.fileName) ||
  "";

/**
 * Un pezzo di nome file: senza accenti, senza spazi, senza caratteri che
 * Windows rifiuta (`\\ / : * ? " < > |`).
 */
export const sanitizeFileNamePart = (value?: string | null): string =>
  stripDiacritics(String(value || ""))
    .replace(/['’]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

/** La sola parte data, in ISO, da una data in qualunque forma ragionevole. */
const isoDatePart = (value?: string | null): string => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (iso) return iso[1];

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";

  return parsed.toISOString().slice(0, 10);
};

export type AttachmentNameInput = {
  /** «BLSD», «Certificato medico», «Contratto»… */
  documentType?: string | null;
  lastName?: string | null;
  firstName?: string | null;
  /**
   * Nome intero, quando cognome e nome non sono separati. Usato solo se
   * `lastName` e `firstName` sono entrambi vuoti.
   */
  fullName?: string | null;
  /** Scadenza, emissione, caricamento: quella che identifica il documento. */
  date?: string | null;
  /** Il data URL o l'URL del file: da qui si ricava l'estensione. */
  url?: string | null;
  mimeType?: string | null;
  /** Nome con cui il file e stato caricato: ripiego per l'estensione. */
  fileName?: string | null;
};

/** Nome usato quando non si sa proprio nulla del documento. */
const FALLBACK_NAME = "documento";

/**
 * Il nome con cui salvare un allegato.
 *
 * Non lancia mai e non restituisce mai stringa vuota: un download senza nome
 * e peggio di un download con un nome generico.
 */
export const buildAttachmentFileName = (
  input: AttachmentNameInput,
): string => {
  const person =
    sanitizeFileNamePart(input.lastName) || sanitizeFileNamePart(input.firstName)
      ? [sanitizeFileNamePart(input.lastName), sanitizeFileNamePart(input.firstName)]
      : [sanitizeFileNamePart(input.fullName)];

  const parts = [
    sanitizeFileNamePart(input.documentType),
    ...person,
    isoDatePart(input.date),
  ].filter(Boolean);

  const stem = parts.join("_") || FALLBACK_NAME;
  const extension = resolveAttachmentExtension(input);

  return extension ? `${stem}.${extension}` : stem;
};
