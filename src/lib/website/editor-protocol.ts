/**
 * **Il protocollo fra l'editor e l'anteprima** (ADR-0200 §5).
 *
 * L'editor disegna il sito in un iframe dello stesso origine
 * (`/website-preview/...`), con il renderer vero: le media query funzionano
 * come sul dispositivo, perche l'iframe ha la larghezza del dispositivo. I due
 * documenti parlano solo con i messaggi di questo file — e lo stesso disegno
 * di `editor-protocol.ts` del Website Builder GPW, riscritto per sezioni e
 * blocchi.
 *
 * Ogni messaggio ha un tipo con il prefisso `eg-website:` e una forma chiusa;
 * chi riceve controlla l'origine **e** la forma (`parseEditorMessage`), e
 * scarta tutto il resto. Un messaggio da un'altra finestra non seleziona
 * niente e non cancella niente.
 *
 * Modulo puro.
 */

export const EDITOR_MESSAGE_PREFIX = "eg-website:";

export type EditorTarget = { kind: "section" | "block"; id: string };

export const EDITOR_ACTIONS = ["up", "down", "duplicate", "toggle", "delete", "add-after"] as const;
export type EditorAction = (typeof EDITOR_ACTIONS)[number];

/** Dall'editor all'anteprima. */
export type ToPreviewMessage =
  | { type: "eg-website:select"; target: EditorTarget | null }
  | { type: "eg-website:hover"; target: EditorTarget | null }
  | { type: "eg-website:refresh" }
  | { type: "eg-website:scroll-to"; target: EditorTarget };

/** Dall'anteprima all'editor. */
export type FromPreviewMessage =
  | { type: "eg-website:ready"; path: string }
  | { type: "eg-website:select"; target: EditorTarget | null }
  | { type: "eg-website:action"; action: EditorAction; target: EditorTarget }
  | { type: "eg-website:navigate"; path: string }
  | { type: "eg-website:rendered"; path: string };

export type EditorMessage = ToPreviewMessage | FromPreviewMessage;

const ID = /^[A-Za-z0-9_-]{1,64}$/;

const parseTarget = (value: unknown): EditorTarget | null | undefined => {
  if (value === null) return null;
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if ((record.kind !== "section" && record.kind !== "block") || typeof record.id !== "string" || !ID.test(record.id)) {
    return undefined;
  }
  return { kind: record.kind, id: record.id };
};

const parsePath = (value: unknown) =>
  typeof value === "string" && value.startsWith("/") && value.length <= 300 && !value.startsWith("//") ? value : null;

/**
 * Il messaggio ricevuto, se ha una forma che si conosce. `null` per tutto il
 * resto — un'estensione del browser, un altro iframe, un attacco.
 */
export const parseEditorMessage = (data: unknown): EditorMessage | null => {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const type = record.type;
  if (typeof type !== "string" || !type.startsWith(EDITOR_MESSAGE_PREFIX)) return null;
  switch (type) {
    case "eg-website:select":
    case "eg-website:hover": {
      const target = parseTarget(record.target);
      return target === undefined ? null : ({ type, target } as EditorMessage);
    }
    case "eg-website:scroll-to": {
      const target = parseTarget(record.target);
      return target ? { type, target } : null;
    }
    case "eg-website:refresh":
      return { type };
    case "eg-website:action": {
      const target = parseTarget(record.target);
      const action = record.action;
      if (!target || typeof action !== "string" || !(EDITOR_ACTIONS as readonly string[]).includes(action)) return null;
      return { type, action: action as EditorAction, target };
    }
    case "eg-website:ready":
    case "eg-website:navigate":
    case "eg-website:rendered": {
      const path = parsePath(record.path);
      return path ? ({ type, path } as EditorMessage) : null;
    }
    default:
      return null;
  }
};

/** Gli attributi che il renderer mette sugli elementi in anteprima. */
export const PREVIEW_ATTRIBUTES = {
  section: "data-ws-section",
  block: "data-ws-block",
  label: "data-ws-label",
} as const;

/** L'elemento «di esempio» con cui l'anteprima riempie un modello di dettaglio. */
export const PREVIEW_SAMPLE_ITEM = "__esempio";
