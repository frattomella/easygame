import { getGeneratedDocument } from "@/lib/api/documents";

/**
 * Il fascicolo: N documenti in **una** pagina, uno per foglio, che il browser
 * stampa in un PDF solo.
 *
 * **Perche non un PDF, e perche non uno ZIP.** Non esiste un motore PDF in
 * questa applicazione, e introdurne uno e una decisione a se (§3.4 e §12 del
 * planning di Wave 3): finche non c'e, un documento non e un **file**, e uno
 * ZIP di cose che non sono file non ha senso. Un fascicolo unico e per giunta
 * piu utile per il caso vero — trenta richieste di visita si stampano insieme,
 * non si scaricano una per una — e non richiede nessuna dipendenza nuova.
 *
 * **Perche il contenuto arriva dalla rotta del singolo documento.** I documenti
 * che tornano dalla generazione (`produced[]`) sono `GeneratedDocumentSummary`,
 * e quella forma **non porta l'HTML**: `summarizeGenerated` lo omette apposta,
 * perche l'elenco dei documenti generati altrimenti spedirebbe al browser cento
 * pagine intere a ogni lettura. L'unica fonte del contenuto conservato e
 * `GET /api/v1/documents/generated/:id`, che restituisce il documento **com'era
 * stato consegnato** — che e poi il motivo per cui quella colonna esiste. Si
 * legge solo quando qualcuno chiede davvero il fascicolo, e uno alla volta.
 */

/**
 * Oltre questo, il fascicolo si divide.
 *
 * Non e un limite del browser ma una soglia dichiarata: una pagina da decine
 * di megabyte la finestra di stampa la macina per minuti, e chi guarda pensa
 * che si sia bloccata. Troncare in silenzio sarebbe peggio — consegnerebbe un
 * fascicolo incompleto che sembra completo — quindi si dice e si propone di
 * dividerlo.
 */
export const BUNDLE_HTML_LIMIT_BYTES = 8 * 1024 * 1024;

export type BundleDocument = {
  id: string;
  title: string;
  /** L'HTML conservato del documento: la pagina intera, come e stata resa. */
  html: string;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Il foglio, senza il suo involucro.
 *
 * Ogni documento conservato e una pagina HTML completa, con il proprio
 * `<head>` e il proprio `<style>`: annidare cento pagine complete una dentro
 * l'altra darebbe cento `<head>` in mezzo al corpo. Si prende il contenuto del
 * `<body>`, e lo stile lo mette una volta sola il fascicolo.
 */
export const extractDocumentSheet = (html: string) => {
  const source = String(html || "");
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(source);
  return (body ? body[1] : source).trim();
};

/**
 * Lo stile del documento, preso **dal documento**.
 *
 * Il fascicolo non riscrive la resa dei fogli: la riusa. Ricopiare qui le
 * regole di `renderFilledDocumentHtml` vorrebbe dire due fogli di stile che un
 * giorno divergono, e lo stesso documento stampato da solo e dentro il
 * fascicolo verrebbe diverso — chi lo firma se ne accorgerebbe, e avrebbe
 * ragione. Il fascicolo aggiunge solo cio che riguarda **il fascicolo**: dove
 * finisce un foglio e comincia il successivo.
 */
export const extractDocumentStyle = (html: string) => {
  const style = /<style[^>]*>([\s\S]*?)<\/style>/i.exec(String(html || ""));
  return style ? style[1].trim() : "";
};

/**
 * Quanto pesa davvero, in byte.
 *
 * `length` conta caratteri, e un documento italiano ne ha parecchi che in
 * UTF-8 occupano piu di un byte: misurare in caratteri sottostimerebbe proprio
 * il fascicolo grande, cioe l'unico caso in cui la misura serve.
 */
export const measureHtmlBytes = (html: string) => {
  const source = String(html || "");

  if (typeof TextEncoder === "function") {
    return new TextEncoder().encode(source).length;
  }

  return source.length;
};

/**
 * Le parti in cui il fascicolo si divide, se una sola sfora la soglia.
 *
 * Divide per **peso**, non per numero di documenti: dieci attestazioni con la
 * foto del logo pesano piu di cento righe di testo, e un taglio ogni N
 * documenti produrrebbe parti a caso. Un singolo documento piu grande della
 * soglia resta da solo nella sua parte: non lo si taglia a meta.
 */
export const planBundleParts = (
  documents: readonly BundleDocument[],
  limitBytes: number = BUNDLE_HTML_LIMIT_BYTES,
): BundleDocument[][] => {
  const limit = Math.max(1, limitBytes);
  const parts: BundleDocument[][] = [];

  let current: BundleDocument[] = [];
  let currentBytes = 0;

  for (const document of documents) {
    const bytes = measureHtmlBytes(document.html);

    if (current.length && currentBytes + bytes > limit) {
      parts.push(current);
      current = [];
      currentBytes = 0;
    }

    current.push(document);
    currentBytes += bytes;
  }

  if (current.length) parts.push(current);

  return parts;
};

/**
 * Il fascicolo, come pagina.
 *
 * `page-break-after: always` su ogni foglio tranne l'ultimo: e cio che rende
 * «un documento per pagina» una proprieta della stampa e non una speranza.
 * L'ultimo ne resta fuori, o la stampa aggiunge un foglio bianco in coda a
 * ogni fascicolo.
 *
 * Lo stile arriva dal **primo documento** del fascicolo, non da qui: tutti
 * portano lo stesso foglio di stile, perche lo scrive lo stesso renderer del
 * server. Cio che questo modulo aggiunge riguarda solo il fascicolo — la barra
 * di stampa, e dove finisce un foglio.
 */
export const buildDocumentBundleHtml = (input: {
  title: string;
  documents: readonly BundleDocument[];
  partLabel?: string;
}) => {
  const fogli = input.documents
    .map(
      (document) =>
        `<article class="fascicolo-foglio">${extractDocumentSheet(document.html)}</article>`,
    )
    .join("\n");

  const intestazione = [
    escapeHtml(input.title),
    input.partLabel ? escapeHtml(input.partLabel) : "",
  ]
    .filter(Boolean)
    .join(" — ");

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${intestazione}</title>
<style>
${extractDocumentStyle(input.documents[0]?.html || "")}
  .fascicolo-barra {
    max-width: 794px;
    margin: 0 auto 20px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 12px 16px;
  }
  .fascicolo-barra button {
    font: inherit;
    cursor: pointer;
    border: 0;
    border-radius: 8px;
    padding: 8px 16px;
    background: #1d4ed8;
    color: #fff;
  }
  .fascicolo-foglio { page-break-after: always; break-after: page; }
  .fascicolo-foglio:last-of-type { page-break-after: auto; break-after: auto; }
  .fascicolo-foglio + .fascicolo-foglio { margin-top: 24px; }
  @media print {
    .fascicolo-barra { display: none; }
    .fascicolo-foglio + .fascicolo-foglio { margin-top: 0; }
  }
</style>
</head>
<body>
  <div class="fascicolo-barra">
    <span>${intestazione} — ${input.documents.length} ${input.documents.length === 1 ? "documento" : "documenti"}</span>
    <button type="button" id="fascicolo-stampa">Stampa il fascicolo</button>
  </div>
${fogli}
</body>
</html>`;
};

/**
 * La finestra del fascicolo, aperta **subito**.
 *
 * Va chiamata nel gestore del clic, prima di qualunque `await`: un
 * `window.open` che arriva dopo tre letture di rete il browser non lo collega
 * piu al gesto dell'utente, e lo blocca come una finestra pubblicitaria. Chi
 * ha premuto vedrebbe solo un avviso del browser, o niente.
 */
export const openBundleWindow = () => {
  if (typeof window === "undefined") return null;

  const printWindow = window.open("", "_blank", "width=1120,height=900");
  if (!printWindow) return null;

  printWindow.document.write(
    '<!doctype html><html lang="it"><head><meta charset="utf-8" /><title>Fascicolo</title></head><body style="padding: 32px; color: #475569;">Preparazione del fascicolo...</body></html>',
  );

  return printWindow;
};

/**
 * Scrive il fascicolo nella finestra, e si ferma li.
 *
 * E il pattern di `src/lib/people-pdf-export.ts` — finestra nuova, stampa del
 * browser, nessun file prodotto da noi — con una differenza deliberata: la
 * stampa **non parte da sola**. Quell'export stampa un elenco e chiama
 * `print()` dopo un quarto di secondo; qui i fogli possono essere cento, con
 * dentro il logo della societa, e una finestra di stampa che si apre prima che
 * il documento sia impaginato mostra il fascicolo sbagliato. Il pulsante lo
 * preme chi guarda, quando vede che c'e tutto.
 */
export const renderBundleInto = (printWindow: Window, html: string) => {
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  /*
    Il gestore si lega da qui invece di scriverlo dentro la pagina: un
    `onclick` in una stringa e codice che nessun controllo di tipo guarda.
  */
  printWindow.document
    .getElementById("fascicolo-stampa")
    ?.addEventListener("click", () => {
      printWindow.focus();
      printWindow.print();
    });
};

/** Le due cose insieme, per chi ha gia in mano l'HTML al momento del clic. */
export const openPrintableBundle = (html: string) => {
  const printWindow = openBundleWindow();
  if (!printWindow) return false;

  renderBundleInto(printWindow, html);
  return true;
};

/**
 * L HTML conservato di un documento generato.
 *
 * Passa dal client documentale (`src/lib/api/documents.ts`), che e il
 * proprietario del trasporto verso quelle rotte. Resta una funzione qui
 * perche il fascicolo ha bisogno del **solo** HTML e di sapere che cosa dire
 * quando manca: un documento che non si riesce a leggere non deve far
 * fallire gli altri novantanove.
 */
export const readGeneratedDocumentHtml = async (id: string) => {
  const { document, error } = await getGeneratedDocument(id);

  return {
    html: String(document?.contentHtml || ""),
    error: error || null,
  };
};
