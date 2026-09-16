/**
 * La sanificazione del testo formattato — **l'autorita e il server**
 * (ADR-0190 §3).
 *
 * L'editor (ProseMirror) ha uno schema chiuso e produce solo cio che lo schema
 * ammette; ma un HTML arriva anche da un `curl`, da un incolla, da una
 * versione vecchia del builder. Questa funzione gira su **ogni** scrittura di
 * un blocco di contenuto dei moduli e del corpo dei modelli di documento, e
 * cio che cambia e cio che si salva: un HTML fuori dall'allowlist non e un
 * errore, e un HTML che perde cio che non poteva avere.
 *
 * Allowlist, non blocklist: tag, attributi e proprieta di stile nominati uno
 * per uno. I link accettano solo `http(s):` e `mailto:`; le immagini solo gli
 * allegati del sistema (`ATTACHMENT_ENDPOINT/…`) — mai `data:`, che era il
 * modo in cui l'editor precedente incollava i byte dentro il documento.
 *
 * E pura: la usano il server (Node) e, per l'anteprima, il client. La stessa
 * funzione, non due.
 */

import sanitizeHtml from "sanitize-html";
import { ATTACHMENT_ENDPOINT } from "@/lib/attachments";

/** I tag che un documento o un blocco di contenuto puo contenere. */
export const RICH_TEXT_ALLOWED_TAGS = [
  "p",
  "br",
  "h1",
  "h2",
  "h3",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "span",
  "a",
  "ul",
  "ol",
  "li",
  "blockquote",
  "hr",
  "img",
  "figure",
  "figcaption",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "colgroup",
  "col",
  "div",
] as const;

/** Le proprieta di stile ammesse, con i valori che possono prendere. */
const STYLE_RULES: Record<string, Record<string, RegExp[]>> = {
  "*": {
    "text-align": [/^(left|right|center|justify)$/],
    "font-size": [/^(0\.[5-9]\d*|[1-3](\.\d+)?)(em|rem)$/, /^([8-9]|[1-5]\d|6[0-4])px$/],
    "line-height": [/^(1|1\.[0-9]+|2|2\.[0-5]|normal)$/],
    "margin-top": [/^(0|[0-9]{1,2}(\.\d+)?(px|em|rem))$/],
    "margin-bottom": [/^(0|[0-9]{1,2}(\.\d+)?(px|em|rem))$/],
    width: [/^(\d{1,4}px|\d{1,3}%)$/],
    "text-decoration": [/^(underline|line-through)$/],
  },
  img: {
    width: [/^(\d{1,4}px|\d{1,3}%)$/],
    height: [/^auto$/],
    float: [/^(left|right|none)$/],
    margin: [/^(0|[0-9]{1,2}px)( (0|[0-9]{1,2}px|auto)){0,3}$/],
    display: [/^(block|inline-block)$/],
  },
  td: { "vertical-align": [/^(top|middle|bottom)$/] },
  th: { "vertical-align": [/^(top|middle|bottom)$/] },
};

/** L'URL di un'immagine ammessa: un allegato del sistema, o un percorso relativo del sito. */
const escapeForRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const ALLOWED_IMAGE_SRC = new RegExp(
  `^${escapeForRegExp(ATTACHMENT_ENDPOINT)}/[0-9a-f-]{36}(/[a-z-]+)?(\\?[a-z0-9=&_-]*)?$`,
  "i",
);

/** La classe dell'interruzione di pagina, l'unica classe che sopravvive. */
export const PAGE_BREAK_CLASS = "easygame-page-break";
/** La classe del segnaposto inline (`{{token}}` reso come chip). */
export const PLACEHOLDER_CLASS = "egw-placeholder";

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...RICH_TEXT_ALLOWED_TAGS],
  allowedAttributes: {
    "*": ["style"],
    a: ["href", "target", "rel", "title"],
    img: ["src", "alt", "title", "width", "height", "style", "data-align"],
    div: ["class", "data-type"],
    span: ["class", "data-token", "data-type", "style", "title"],
    td: ["colspan", "rowspan", "style"],
    th: ["colspan", "rowspan", "style"],
    table: ["style"],
    col: ["style"],
    ol: ["start"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["https", "http"] },
  allowProtocolRelative: false,
  allowedStyles: STYLE_RULES,
  allowedClasses: {
    div: [PAGE_BREAK_CLASS],
    span: [PLACEHOLDER_CLASS],
  },
  disallowedTagsMode: "discard",
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        /* Un link esterno si apre altrove e non puo toccare la finestra madre. */
        target: "_blank",
        rel: "noopener noreferrer nofollow",
      },
    }),
    b: "strong",
    i: "em",
  },
  exclusiveFilter: (frame) => {
    if (frame.tag === "img") {
      const src = String(frame.attribs.src || "");
      /* Un'immagine che non e un allegato del sistema non si salva: niente `data:`, niente host esterni. */
      return !ALLOWED_IMAGE_SRC.test(src);
    }
    if (frame.tag === "div") {
      const classi = String(frame.attribs.class || "").split(/\s+/);
      return classi.includes(PAGE_BREAK_CLASS) ? false : "excludeTag";
    }
    return false;
  },
  /*
    Un `div` sopravvive solo come interruzione di pagina: ogni altro `div`
    perde il tag e **tiene il contenuto** (`excludeTag`, non l'esclusione
    intera — che cancellava l'intera sezione di un documento dell'editor
    precedente o di un incolla da Word).
  */
  nonTextTags: ["script", "style", "textarea", "option", "noscript"],
  nestingLimit: 40,
};

/** Il testo formattato, ridotto a cio che puo contenere. */
export const sanitizeRichHtml = (html: unknown): string => {
  const text = String(html ?? "");
  if (!text.trim()) return "";
  return sanitizeHtml(text, SANITIZE_OPTIONS).trim();
};

/** Il solo testo, senza tag: per anteprime, riassunti e impronte. */
export const richHtmlToText = (html: unknown): string =>
  sanitizeHtml(
    /* Un blocco che finisce e uno spazio: «Informativa» e «Testo» non si incollano. */
    String(html ?? "").replace(/<\/(p|h[1-6]|li|tr|td|th|div|blockquote|figcaption)>/gi, "$& "),
    { allowedTags: [], allowedAttributes: {} },
  )
    .replace(/\s+/g, " ")
    .trim();
