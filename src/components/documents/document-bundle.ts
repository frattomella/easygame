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
 *
 * **Si misura il fascicolo, non i documenti.** La misura passa dalla stessa
 * estrazione delle immagini ripetute che fa `buildDocumentBundleHtml`, o il
 * guardrail conterebbe cento volte una firma che nel fascicolo entra una
 * volta sola: dividerebbe a trentasei documenti un fascicolo che ne regge
 * cento. Ogni parte porta con se la sua copia delle immagini condivise, e
 * quella copia entra nel conto.
 */
export const planBundleParts = (
  documents: readonly BundleDocument[],
  limitBytes: number = BUNDLE_HTML_LIMIT_BYTES,
): BundleDocument[][] => {
  const limit = Math.max(1, limitBytes);
  const parts: BundleDocument[][] = [];

  const estratti = extractRepeatedImages(
    documents.map((document) => extractDocumentSheet(document.html)),
  );
  const condivise = Object.keys(estratti.images).length
    ? measureHtmlBytes(JSON.stringify(estratti.images))
    : 0;

  let current: BundleDocument[] = [];
  let currentBytes = condivise;

  documents.forEach((document, index) => {
    const bytes = measureHtmlBytes(estratti.sheets[index] || document.html);

    if (current.length && currentBytes + bytes > limit) {
      parts.push(current);
      current = [];
      currentBytes = condivise;
    }

    current.push(document);
    currentBytes += bytes;
  });

  if (current.length) parts.push(current);

  return parts;
};

/**
 * L'attributo che segna un'immagine il cui contenuto sta **altrove nella
 * pagina**, e l'elemento che lo porta.
 *
 * Non sono un dettaglio interno: `renderBundleInto` li legge per rimettere
 * ogni `src` al suo posto, e i due nomi devono restare gli stessi da entrambe
 * le parti.
 */
export const EMBEDDED_IMAGE_ATTRIBUTE = "data-fascicolo-immagine";
export const EMBEDDED_IMAGE_PAYLOAD_ID = "fascicolo-immagini";

/*
  Le `src` in chiaro dei documenti conservati: le scrive il renderer del
  server, sempre fra virgolette doppie, perche l'URL passa da `escapeHtml`.
  Una regex nuova a ogni chiamata, che `lastIndex` di una globale sopravvive
  fra le chiamate.
*/
/*
  L'attributo, **non** la sottostringa: senza il confine iniziale,
  `data-src="data:…"` contiene `src="data:…"` e la sostituzione produceva
  `data-data-fascicolo-immagine`, che l'idratazione non rimette mai — cioe
  un'immagine persa in silenzio.
*/
const dataImagePattern = () => /(\s)src="(data:[^"]+)"/g;

export type EmbeddedImages = Record<string, string>;

/**
 * La firma del presidente, dentro cento documenti, **una volta sola**.
 *
 * **Il difetto, misurato.** Una firma scansionata da 90 kB e un timbro da
 * 76 kB — dimensioni normali, il limite ammesso e 2 MB — diventano due
 * `data:` URL da ~222 kB **in ogni documento**: il 97% di una riga
 * `generated_documents`, la cui mediana e 229 kB. Un fascicolo da cento
 * documenti pesava cosi **22,2 MB**, cioe quasi tre volte la soglia di
 * `BUNDLE_HTML_LIMIT_BYTES`, e si spezzava gia intorno al trentaseiesimo:
 * «trenta richieste di visita a settembre» — il caso d'uso per cui il
 * fascicolo esiste — ci finiva dentro. Estraendo le ripetute lo stesso
 * fascicolo pesa **0,84 MB** e sta in una parte sola: le due immagini
 * compaiono duecento volte come elemento e **due** volte come dato.
 *
 * **Perche l'immagine resta un `<img>`.** Il vincolo e che il documento
 * stampato dentro il fascicolo venga **identico** a quello stampato da solo, e
 * un `background-image` non lo garantisce: un `<img>` si dimensiona sulla
 * dimensione intrinseca del file, e firma e timbro escono dal server con
 * `max-height`/`max-width` che su un riquadro di sfondo si comporterebbero in
 * un altro modo. L'elemento resta quindi quello che era, gli si toglie solo
 * l'URL — che `renderBundleInto` gli rimette prima che la pagina si veda. A
 * fine idratazione il DOM del fascicolo e lo stesso del documento singolo.
 *
 * **Perche solo le ripetute.** Un'immagine che compare una volta sola non
 * costa niente e non si tocca: un fascicolo da un documento resta cosi
 * byte per byte quello di prima.
 */
export const extractRepeatedImages = (sheets: readonly string[]) => {
  const conteggio = new Map<string, number>();

  for (const sheet of sheets) {
    const pattern = dataImagePattern();
    let match = pattern.exec(sheet);
    while (match) {
      // Il primo gruppo e lo spazio che ancora l attributo; il secondo l URL.
      conteggio.set(match[2], (conteggio.get(match[2]) || 0) + 1);
      match = pattern.exec(sheet);
    }
  }

  const chiavi = new Map<string, string>();
  for (const [url, volte] of conteggio) {
    if (volte > 1) chiavi.set(url, `immagine-${chiavi.size + 1}`);
  }

  if (!chiavi.size) return { sheets: [...sheets], images: {} as EmbeddedImages };

  const images: EmbeddedImages = {};
  for (const [url, chiave] of chiavi) images[chiave] = url;

  return {
    sheets: sheets.map((sheet) =>
      sheet.replace(
        dataImagePattern(),
        (intero, spazio: string, url: string) => {
          const chiave = chiavi.get(url);
          return chiave
            ? `${spazio}${EMBEDDED_IMAGE_ATTRIBUTE}="${chiave}"`
            : intero;
        },
      ),
    ),
    images,
  };
};

/*
  Il carico e **dati**, non codice: `type="application/json"` non viene
  eseguito da nessun browser, e lo rilegge `renderBundleInto` — che e
  TypeScript controllato, non una stringa. La sola sequenza che potrebbe
  chiudere il tag prima del tempo e `<`, che in un URL base64 non compare mai:
  si neutralizza comunque, perche «non compare mai» non e una garanzia.
*/
const imagePayloadScript = (images: EmbeddedImages) =>
  Object.keys(images).length
    ? `<script type="application/json" id="${EMBEDDED_IMAGE_PAYLOAD_ID}">${JSON.stringify(
        images,
      ).replace(/</g, "\\u003c")}</script>`
    : "";

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
  /**
   * Cosa dice il pulsante. Un foglio solo — un modulo vuoto, un'anteprima —
   * non e «un fascicolo», e chiamarlo cosi fa cercare gli altri.
   */
  printLabel?: string;
  /**
   * Quanti documenti prodotti **non** sono entrati, perche non si e riusciti a
   * rileggerli. Zero e il caso normale; sopra zero il fascicolo lo scrive in
   * intestazione e nel titolo della pagina. Un fascicolo incompleto che tace
   * di esserlo e peggio di due fascicoli, ed e la stessa ragione per cui sopra
   * la soglia si divide invece di troncare.
   */
  missingCount?: number;
}) => {
  const estratti = extractRepeatedImages(
    input.documents.map((document) => extractDocumentSheet(document.html)),
  );

  const fogli = estratti.sheets
    .map((sheet) => `<article class="fascicolo-foglio">${sheet}</article>`)
    .join("\n");

  const mancanti = Math.max(0, Math.floor(input.missingCount || 0));
  const lacuna = mancanti
    ? `${mancanti} ${mancanti === 1 ? "documento non letto" : "documenti non letti"}`
    : "";

  const intestazione = [
    escapeHtml(input.title),
    input.partLabel ? escapeHtml(input.partLabel) : "",
    lacuna,
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
    <span>${intestazione} — ${input.documents.length} ${input.documents.length === 1 ? "documento" : "documenti"}${
      mancanti
        ? ` — <strong>incompleto</strong>: ${lacuna}, cercali in «Documenti generati»`
        : ""
    }</span>
    <button type="button" id="fascicolo-stampa">${escapeHtml(
      input.printLabel || "Stampa il fascicolo",
    )}</button>
  </div>
${fogli}
${imagePayloadScript(estratti.images)}
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
 * Rimette a ogni immagine il suo `data:` URL, letto dall'unica copia.
 *
 * **Perche lo fa questo modulo e non uno `<script>` dentro la pagina.** Per la
 * stessa ragione per cui il pulsante di stampa si lega da qui: uno script
 * scritto in una stringa e codice che nessun controllo di tipo guarda. E
 * perche una finestra aperta con `window.open("")` eredita la policy di
 * sicurezza di chi l'ha aperta: uno script in linea la un giorno smetterebbe
 * di partire, e il fascicolo uscirebbe senza firme senza dire niente.
 *
 * Gira **prima** che chiunque veda la pagina — la finestra e appena stata
 * scritta e il pulsante di stampa lo preme una persona, dopo.
 */
export const hydrateEmbeddedImages = (document: Document) => {
  const payload = document.getElementById(EMBEDDED_IMAGE_PAYLOAD_ID)?.textContent;
  if (!payload) return 0;

  let images: EmbeddedImages;
  try {
    images = JSON.parse(payload) as EmbeddedImages;
  } catch {
    /* Carico illeggibile: meglio un'immagine mancante che una pagina rotta. */
    return 0;
  }

  let rimesse = 0;
  const elementi = document.querySelectorAll(`img[${EMBEDDED_IMAGE_ATTRIBUTE}]`);

  elementi.forEach((elemento) => {
    const chiave = elemento.getAttribute(EMBEDDED_IMAGE_ATTRIBUTE) || "";
    const url = images[chiave];
    if (!url) return;

    elemento.setAttribute("src", url);
    elemento.removeAttribute(EMBEDDED_IMAGE_ATTRIBUTE);
    rimesse += 1;
  });

  return rimesse;
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

  hydrateEmbeddedImages(printWindow.document);

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
