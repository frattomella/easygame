import { NextResponse } from "next/server";

/**
 * La risposta con cui EasyGame consegna un file salvato.
 *
 * **Il difetto che questo modulo chiude** (RC Fix 1, punto 8). «Visualizza»
 * non apriva tutti i PDF, e le tre rotte che servono un file lo facevano in
 * tre modi diversi:
 *
 * - `/api/v1/attachments/:id` rispondeva con
 *   `Content-Security-Policy: sandbox; default-src 'none'`. Sono **due**
 *   istruzioni che spengono il visualizzatore PDF del browser: la direttiva
 *   `sandbox` alza il flag che vieta i plugin al documento, e
 *   `default-src 'none'` vale anche come `object-src 'none'`, cioe vieta
 *   l'elemento con cui il browser disegna il PDF. Le immagini si vedevano,
 *   i PDF no: da qui «non tutti i documenti si aprono»;
 * - `/api/athletes/:id/documents/:id/file` rispondeva **sempre**
 *   `attachment`: «Visualizza» scaricava invece di mostrare;
 * - `/api/forms/assets/:id` rispondeva `inline` per qualunque tipo, senza
 *   `nosniff`: un file registrato con un tipo sbagliato poteva essere
 *   interpretato dal browser come pagina, dentro l'origine di EasyGame.
 *
 * Qui ce n'e una sola, e la sicurezza non viene tolta ma spostata dove
 * funziona:
 *
 * - `nosniff` **sempre**: il tipo lo decide il server, non l'ipotesi del
 *   browser. E il controllo che rende innocuo servire `inline`;
 * - `inline` **solo** per i tipi che si sanno guardare — PDF, immagini,
 *   testo. Tutto il resto arriva come allegato, quindi un tipo aggiunto
 *   domani all'elenco non diventa per sbaglio una pagina da aprire;
 * - una CSP che vieta script, stili esterni, richieste di rete e
 *   incorniciamento, ma **permette** l'oggetto di pari origine con cui il
 *   PDF viene disegnato.
 *
 * Il nome del file viaggia in due forme, come vuole la RFC 6266: `filename`
 * ripulito per i browser vecchi e `filename*` con la codifica UTF-8 per
 * quelli nuovi. Prima un nome con accenti o spazi arrivava percent-encoded
 * **a schermo** (`Certificato%20Rossi.pdf`).
 */

/** Tipi che il browser sa mostrare e che qui e lecito servire `inline`. */
export const INLINE_RENDERABLE_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/tiff",
  "text/plain",
  "text/csv",
]);

/**
 * La politica di sicurezza applicata a ogni file servito.
 *
 * Niente `sandbox` e niente `object-src 'none'`: erano le due direttive che
 * impedivano al browser di disegnare un PDF. Quello che serve davvero — che
 * un file caricato da un utente non possa eseguire codice ne parlare con la
 * rete — lo fanno `default-src 'none'` per tutto il resto e `nosniff`.
 */
export const STORED_FILE_CSP = [
  "default-src 'none'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "style-src 'unsafe-inline'",
  /*
    Servono **entrambe**, e la ragione e stata misurata invece che dedotta:
    con `default-src 'none'` il browser scrive in console
    «Loading plugin data ... has been blocked» — e `object-src` a mancare —
    e togliendo solo quella ne compare una seconda,
    «Framing ... has been blocked», perche il visualizzatore PDF di Chrome
    disegna dentro un riquadro figlio. Bloccarne una sola non basta a far
    vedere il documento.
  */
  "object-src 'self'",
  "frame-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

export const isInlineRenderableMimeType = (mimeType?: string | null) =>
  INLINE_RENDERABLE_MIME_TYPES.has(
    String(mimeType || "").trim().toLowerCase().split(";")[0],
  );

const ASCII_FALLBACK = /[^\x20-\x7e]|["\\]/g;

/**
 * Il nome nell'header, nelle due forme che i browser accettano.
 *
 * Il valore fra virgolette non puo contenere virgolette, barre rovesciate ne
 * caratteri di controllo: un ritorno a capo permetterebbe di aggiungere
 * header alla risposta.
 */
export const buildContentDisposition = (
  disposition: "inline" | "attachment",
  fileName: string,
) => {
  const clean = String(fileName || "documento")
    .replace(/[\r\n]+/g, " ")
    .trim() || "documento";
  const ascii = clean.replace(ASCII_FALLBACK, "_");

  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(
    clean,
  )}`;
};

export type StoredFileResponseInput = {
  content: Buffer | Uint8Array;
  mimeType?: string | null;
  fileName: string;
  /** `true` quando chi chiede vuole scaricare invece di guardare. */
  download?: boolean;
};

export const buildStoredFileResponse = ({
  content,
  mimeType,
  fileName,
  download = false,
}: StoredFileResponseInput) => {
  const type = String(mimeType || "").trim() || "application/octet-stream";
  const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
  const disposition =
    !download && isInlineRenderableMimeType(type) ? "inline" : "attachment";

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": buildContentDisposition(disposition, fileName),
      /*
        Un file di club non deve finire in nessuna cache condivisa. `private`
        lascia comunque la cache del browser, che e quella che evita di
        riscaricare un PDF ogni volta che si torna sulla scheda.
      */
      "Cache-Control": "private, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": STORED_FILE_CSP,
    },
  });
};
