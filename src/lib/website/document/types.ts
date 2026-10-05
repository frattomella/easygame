/**
 * **Il documento di una pagina del sito** (ADR-0200 §6).
 *
 * SITE → PAGE → SECTION → BLOCK, e nient'altro: niente posizionamento libero,
 * niente CSS scritto a mano, niente codice. E la stessa scelta del Website
 * Builder GPW (ADR-0033 di Cedi Platform, «NOT an Elementor»), con due
 * differenze volute:
 *
 * 1. **la sezione e un contenitore vero**: ha colonne, e ogni colonna una
 *    lista di blocchi. In GPW la sezione *era* il blocco, e un testo accanto a
 *    un'immagine richiedeva un tipo apposta;
 * 2. **gli override per dispositivo esistono**, ma solo sui token di stile:
 *    il contenuto e la sorgente dati sono una cosa sola per tutti i
 *    dispositivi. `padding: lg` su desktop e `padding: sm` su mobile sono lo
 *    stesso blocco, non due copie.
 *
 * Modulo puro, client-safe: lo leggono l'editor, la validazione del server e
 * il renderer pubblico.
 */

export const WEBSITE_DEVICES = ["desktop", "tablet", "mobile"] as const;
export type WebsiteDevice = (typeof WEBSITE_DEVICES)[number];

/* ------------------------------------------------------------------ token */

export const SPACING_TOKENS = ["none", "xs", "sm", "md", "lg", "xl"] as const;
export type SpacingToken = (typeof SPACING_TOKENS)[number];

export const GUTTER_TOKENS = ["none", "sm", "md", "lg"] as const;
export type GutterToken = (typeof GUTTER_TOKENS)[number];

export const ALIGN_TOKENS = ["left", "center", "right"] as const;
export type AlignToken = (typeof ALIGN_TOKENS)[number];

export const WIDTH_TOKENS = ["full", "wide", "container", "narrow"] as const;
export type WidthToken = (typeof WIDTH_TOKENS)[number];

export const TEXT_SIZE_TOKENS = ["sm", "md", "lg", "xl"] as const;
export type TextSizeToken = (typeof TEXT_SIZE_TOKENS)[number];

export const COLUMN_COUNTS = [1, 2, 3, 4] as const;
export type ColumnCount = (typeof COLUMN_COUNTS)[number];

/**
 * I token che **possono cambiare per dispositivo**. Tutto il resto dello
 * stile — sfondo, tono, animazione — vale per tutti: cambiare il colore di
 * fondo fra tablet e desktop non e una scelta di impaginazione, e un errore.
 */
export type ResponsiveStyle = {
  paddingTop?: SpacingToken;
  paddingBottom?: SpacingToken;
  paddingX?: GutterToken;
  gap?: GutterToken;
  align?: AlignToken;
  textSize?: TextSizeToken;
  /** Solo per le sezioni: quante colonne affiancate. */
  columns?: ColumnCount;
};

export const RESPONSIVE_STYLE_KEYS = [
  "paddingTop",
  "paddingBottom",
  "paddingX",
  "gap",
  "align",
  "textSize",
  "columns",
] as const satisfies ReadonlyArray<keyof ResponsiveStyle>;

export type ResponsiveStyleKey = (typeof RESPONSIVE_STYLE_KEYS)[number];

/**
 * Il valore per desktop e gli scostamenti di tablet e mobile. Uno scostamento
 * assente eredita: tablet da desktop, mobile da tablet. Toglierlo («ripristina»)
 * e cancellare la chiave, non riscrivere il valore di desktop.
 */
export type ResponsiveValue<T> = {
  base: T;
  tablet?: Partial<T>;
  mobile?: Partial<T>;
};

export type DeviceVisibility = Partial<Record<WebsiteDevice, boolean>>;

export const BACKGROUND_KINDS = [
  "none",
  "surface",
  "muted",
  "primary",
  "secondary",
  "accent",
  "dark",
  "image",
] as const;
export type BackgroundKind = (typeof BACKGROUND_KINDS)[number];

export const TONE_TOKENS = ["auto", "light", "dark"] as const;
export type ToneToken = (typeof TONE_TOKENS)[number];

export const ANIMATION_TOKENS = ["none", "fade", "slide", "scale", "reveal"] as const;
export type AnimationToken = (typeof ANIMATION_TOKENS)[number];

export const RADIUS_OVERRIDE_TOKENS = ["theme", "none", "sm", "lg"] as const;
export type RadiusOverrideToken = (typeof RADIUS_OVERRIDE_TOKENS)[number];

/** Un riferimento a un file della libreria del sito. Mai un URL libero. */
export type MediaRef = {
  mediaId: string | null;
  /** Il testo alternativo per questo uso; vuoto = quello della libreria. */
  alt?: string;
  /** Il punto di interesse, 0-100 su entrambi gli assi. */
  focalX?: number;
  focalY?: number;
};

export type StaticStyle = {
  background?: BackgroundKind;
  backgroundImage?: MediaRef | null;
  /** Oscuramento sopra l'immagine di fondo, 0-80. */
  overlay?: number;
  tone?: ToneToken;
  width?: WidthToken;
  radius?: RadiusOverrideToken;
  animation?: AnimationToken;
};

export type ElementStyle = {
  static?: StaticStyle;
  responsive?: ResponsiveValue<ResponsiveStyle>;
};

/* ------------------------------------------------------------- collegamenti */

export const LINK_KINDS = [
  "none",
  "page",
  "url",
  "anchor",
  "email",
  "phone",
  "form",
] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/**
 * Un collegamento, sempre **tipizzato**. Il renderer lo trasforma in un
 * `href` passando da `resolveLinkHref`: una pagina si cita per identificativo,
 * cosi rinominarne lo slug non rompe i bottoni che la puntano.
 */
export type WebsiteLink = {
  kind: LinkKind;
  pageId?: string | null;
  url?: string | null;
  anchor?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Lo slug pubblico di un modulo online EasyGame (ADR-0189). */
  formSlug?: string | null;
  newTab?: boolean;
};

/* ------------------------------------------------------------------ blocchi */

export type WebsiteBlock = {
  id: string;
  type: string;
  /** La versione della definizione con cui le props sono state scritte. */
  version: number;
  props: Record<string, unknown>;
  style?: ElementStyle;
  hidden?: DeviceVisibility;
};

export type WebsiteColumn = {
  id: string;
  blocks: WebsiteBlock[];
};

export const SECTION_LAYOUTS = [
  "one",
  "two",
  "two-wide-left",
  "two-wide-right",
  "three",
  "four",
] as const;
export type SectionLayout = (typeof SECTION_LAYOUTS)[number];

export type WebsiteSection = {
  id: string;
  /** Come l'operatore la chiama nell'albero. Non compare sul sito. */
  label?: string;
  /** L'ancora per i collegamenti interni (`#iscrizioni`). */
  anchor?: string;
  layout: SectionLayout;
  columns: WebsiteColumn[];
  style?: ElementStyle;
  hidden?: DeviceVisibility;
  /** Il preset da cui e nata, solo per dirlo nell'editor. */
  preset?: string;
};

export const PAGE_DOCUMENT_SCHEMA_VERSION = 1;

export type WebsitePageDocument = {
  schemaVersion: number;
  sections: WebsiteSection[];
};

export const emptyPageDocument = (): WebsitePageDocument => ({
  schemaVersion: PAGE_DOCUMENT_SCHEMA_VERSION,
  sections: [],
});

/** Il numero di colonne che un layout dichiara. */
export const SECTION_LAYOUT_COLUMNS: Record<SectionLayout, number> = {
  one: 1,
  two: 2,
  "two-wide-left": 2,
  "two-wide-right": 2,
  three: 3,
  four: 4,
};
