import {
  buildAttachmentUrl,
  resolveAttachmentSource,
} from "./attachments";
import {
  buildAttachmentFileName,
  readMimeFromDataUrl,
  sanitizeFileNamePart,
  type AttachmentNameInput,
} from "./attachment-names";

/**
 * Aprire e scaricare un allegato dal browser.
 *
 * **Due formati, un comportamento.** Dal Blocco 8 un allegato puo essere due
 * cose (vedi `src/lib/attachments.ts`):
 *
 * - un **riferimento** `attachment:<id>` a una riga della tabella
 *   `attachments`, che l'API serve come un normale URL http;
 * - un **data URL legacy**, cioe il file dentro il record, come era prima di
 *   WP-15.
 *
 * Chi chiama non deve distinguerli e non li distingue: `resolveAttachmentSource`
 * classifica il valore una volta sola e queste funzioni fanno il resto.
 *
 * **Il difetto storico che questo modulo chiude** (Blocco 7, punto 6). Aprire
 * un allegato faceva `window.open("data:application/pdf;base64,…")` — e i
 * browser bloccano da anni la navigazione di primo livello verso `data:`,
 * perche era il vettore classico del phishing. Il risultato: **ogni pulsante
 * «Visualizza» apriva una scheda vuota**. Per i data URL la via che funziona e
 * convertirli in un `Blob` e aprire un *object URL*; per i riferimenti il
 * problema non si pone piu, perche non sono `data:`.
 *
 * Regola di prodotto che ne discende: **se compare «Visualizza», il file si
 * deve vedere**. Queste funzioni restituiscono `false` quando non ci riescono,
 * cosi chi le chiama puo dirlo invece di non fare niente.
 */

const sanitizeDownloadName = (value: string) =>
  sanitizeFileNamePart(value.replace(/\.[A-Za-z0-9]{1,5}$/, "")) || "documento";

/** Preserva l'estensione mentre ripulisce il resto del nome. */
const safeFileName = (fileName: string) => {
  const trimmed = String(fileName || "").trim();
  const extension = /\.([A-Za-z0-9]{1,5})$/.exec(trimmed)?.[1] || "";
  const stem = sanitizeDownloadName(trimmed);
  return extension ? `${stem}.${extension.toLowerCase()}` : stem;
};

/**
 * Da data URL a `Blob`.
 *
 * `fetch(dataUrl).blob()` sarebbe piu breve ma e asincrono e in alcune
 * configurazioni CSP viene bloccato; `atob` non ha ne l'una ne l'altra
 * controindicazione. Torna `null` su un data URL malformato invece di
 * lanciare: un allegato corrotto in archivio non deve rompere la pagina.
 */
export const dataUrlToBlob = (url: string): Blob | null => {
  try {
    const comma = url.indexOf(",");
    if (comma < 0) return null;

    const header = url.slice(0, comma);
    const body = url.slice(comma + 1);
    const mime = readMimeFromDataUrl(url) || "application/octet-stream";

    if (!/;base64/i.test(header)) {
      return new Blob([decodeURIComponent(body)], { type: mime });
    }

    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
};

/**
 * Un object URL utilizzabile per l'URL dato, piu come liberarlo.
 *
 * Per un URL di rete non si crea nulla: si usa quello che c'e, e `revoke` non
 * fa niente.
 */
const toUsableUrl = (
  url: string,
  downloadName?: string | null,
): { href: string; revoke: () => void } | null => {
  const source = resolveAttachmentSource(url);

  if (source.kind === "empty") return null;

  /*
    Un allegato nuovo e gia un URL http servito dall'API: non c'e niente da
    convertire, e il browser lo apre come qualunque altra risorsa. E il punto
    di tutto WP-15 — la conversione a object URL esiste solo per i data URL
    legacy, e sparira con loro.
  */
  if (source.kind === "reference") {
    return {
      href: buildAttachmentUrl(source.id, { download: downloadName }),
      revoke: () => {},
    };
  }

  if (source.kind === "remote") {
    return { href: source.href, revoke: () => {} };
  }

  const blob = dataUrlToBlob(source.href);
  if (!blob) return null;

  const href = URL.createObjectURL(blob);
  return { href, revoke: () => URL.revokeObjectURL(href) };
};

/**
 * Apre un allegato in una scheda nuova.
 *
 * Torna `false` se non c'e un file, se il data URL e illeggibile o se il
 * browser ha bloccato la finestra: sono i tre casi in cui l'interfaccia deve
 * dirlo, non restare muta.
 */
export const openClientFileUrl = (url?: string | null) => {
  const href = String(url || "").trim();
  if (!href || typeof window === "undefined") {
    return false;
  }

  const usable = toUsableUrl(href);
  if (!usable) return false;

  const opened = window.open(usable.href, "_blank", "noopener,noreferrer");

  if (!opened) {
    usable.revoke();
    return false;
  }

  /*
    L'object URL non si puo liberare subito: la scheda appena aperta non ha
    ancora finito di leggerlo. Un minuto e abbondante per qualunque allegato e
    il browser lo libera comunque alla chiusura del documento.
  */
  window.setTimeout(usable.revoke, 60_000);
  return true;
};

/**
 * Scarica un allegato con un nome leggibile.
 *
 * Anche qui si passa da un object URL: un `href` con dentro un data URL di
 * qualche megabyte viene troncato da alcuni browser, e il file arriva corrotto.
 */
export const downloadClientFileUrl = (
  url?: string | null,
  fileName: string = "documento",
) => {
  const href = String(url || "").trim();
  if (!href || typeof document === "undefined") {
    return false;
  }

  const safeName = safeFileName(fileName);
  const usable = toUsableUrl(href, safeName);
  if (!usable) return false;

  const link = document.createElement("a");
  link.href = usable.href;
  link.download = safeName;
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.setTimeout(usable.revoke, 60_000);
  return true;
};

/**
 * Scarica un allegato costruendone il nome secondo la regola condivisa.
 *
 * E la forma da preferire: chi chiama descrive il documento e la persona, non
 * inventa una stringa. Vedi `src/lib/attachment-names.ts`.
 */
export const downloadAttachment = (
  url: string | null | undefined,
  name: AttachmentNameInput,
) => downloadClientFileUrl(url, buildAttachmentFileName({ ...name, url }));

export const fileToDataUrl = async (file: File | Blob | null | undefined) => {
  if (!file || typeof FileReader === "undefined") {
    return "";
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
};

export { buildAttachmentFileName };
