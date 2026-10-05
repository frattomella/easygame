/**
 * **Il catalogo dei caratteri del sito** (ADR-0200 §8).
 *
 * Chiuso di proposito. Un campo libero «nome del font» vorrebbe dire una
 * richiesta a un servizio esterno per ogni sito, un CSS costruito da una
 * stringa scritta da un utente e nessuna garanzia che il carattere esista.
 * Qui ogni voce e una chiave, un'etichetta, la variabile CSS che il layout del
 * sito dichiara una volta sola (`src/components/website/render/fonts.ts`, che
 * li carica tutti con il caricatore di caratteri di Next, self-hosted e senza precaricamento) e lo
 * stack di ripiego.
 *
 * **Perche li carica tutti e non solo i due scelti.** Il caricatore di Next vuole
 * dichiarazioni statiche: non si puo scegliere a runtime quale importare. Il
 * costo e una regola `@font-face` per voce, pochi byte; il file del carattere
 * lo scarica il browser solo se qualcosa lo usa, e il sito ne usa due. Nessun
 * blocco genera richieste proprie: il tema imposta due variabili e basta.
 *
 * Modulo puro, client-safe.
 */

export const WEBSITE_FONT_KEYS = [
  "inter",
  "poppins",
  "montserrat",
  "oswald",
  "barlow-condensed",
  "archivo",
  "roboto-slab",
  "playfair",
  "lora",
  "source-sans",
  "system",
] as const;

export type WebsiteFontKey = (typeof WEBSITE_FONT_KEYS)[number];

export type WebsiteFontDefinition = {
  key: WebsiteFontKey;
  label: string;
  /** La variabile CSS dichiarata dal layout del sito. */
  cssVariable: string;
  fallback: string;
  /** Per il selettore: titoli, testo o entrambi. */
  roles: ReadonlyArray<"heading" | "body">;
};

const SANS = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const SERIF = "ui-serif, Georgia, 'Times New Roman', serif";

export const WEBSITE_FONTS: Record<WebsiteFontKey, WebsiteFontDefinition> = {
  inter: { key: "inter", label: "Inter", cssVariable: "--wsf-inter", fallback: SANS, roles: ["heading", "body"] },
  poppins: { key: "poppins", label: "Poppins", cssVariable: "--wsf-poppins", fallback: SANS, roles: ["heading", "body"] },
  montserrat: { key: "montserrat", label: "Montserrat", cssVariable: "--wsf-montserrat", fallback: SANS, roles: ["heading", "body"] },
  oswald: { key: "oswald", label: "Oswald", cssVariable: "--wsf-oswald", fallback: SANS, roles: ["heading"] },
  "barlow-condensed": { key: "barlow-condensed", label: "Barlow Condensed", cssVariable: "--wsf-barlow-condensed", fallback: SANS, roles: ["heading"] },
  archivo: { key: "archivo", label: "Archivo", cssVariable: "--wsf-archivo", fallback: SANS, roles: ["heading", "body"] },
  "roboto-slab": { key: "roboto-slab", label: "Roboto Slab", cssVariable: "--wsf-roboto-slab", fallback: SERIF, roles: ["heading"] },
  playfair: { key: "playfair", label: "Playfair Display", cssVariable: "--wsf-playfair", fallback: SERIF, roles: ["heading"] },
  lora: { key: "lora", label: "Lora", cssVariable: "--wsf-lora", fallback: SERIF, roles: ["heading", "body"] },
  "source-sans": { key: "source-sans", label: "Source Sans 3", cssVariable: "--wsf-source-sans", fallback: SANS, roles: ["body"] },
  system: { key: "system", label: "Carattere di sistema", cssVariable: "--wsf-system", fallback: SANS, roles: ["heading", "body"] },
};

export const isWebsiteFontKey = (value: unknown): value is WebsiteFontKey =>
  typeof value === "string" &&
  (WEBSITE_FONT_KEYS as readonly string[]).includes(value);

export const normalizeWebsiteFont = (
  value: unknown,
  fallback: WebsiteFontKey,
): WebsiteFontKey => (isWebsiteFontKey(value) ? value : fallback);

/** Lo stack completo da mettere nella variabile del tema. */
export const websiteFontStack = (key: WebsiteFontKey) => {
  const font = WEBSITE_FONTS[key];
  return key === "system" ? font.fallback : `var(${font.cssVariable}), ${font.fallback}`;
};

export const listWebsiteFontsForRole = (role: "heading" | "body") =>
  WEBSITE_FONT_KEYS.map((key) => WEBSITE_FONTS[key]).filter((font) =>
    font.roles.includes(role),
  );
