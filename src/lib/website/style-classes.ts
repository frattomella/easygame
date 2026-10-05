import {
  SPACING_TOKENS,
  type AlignToken,
  type ColumnCount,
  type ElementStyle,
  type GutterToken,
  type ResponsiveStyle,
  type ResponsiveValue,
  type SpacingToken,
  type TextSizeToken,
  type WebsiteDevice,
} from "./document/types";

/**
 * **Da token a classi, per dispositivo** (ADR-0200 §6).
 *
 * Le classi sono scritte per esteso, una per una, e non costruite con una
 * stringa: Tailwind genera solo cio che trova nel sorgente, e
 * `tailwind.website.config.ts` scansiona proprio questo file. Una classe
 * composta a runtime (`md:pt-${n}`) non esisterebbe nel CSS.
 *
 * I dispositivi seguono i breakpoint di Tailwind e dell'editor: mobile sotto
 * 768px (nessun prefisso), tablet da 768 (`md:`), desktop da 1024 (`lg:`).
 * Il CSS e mobile-first, il documento no — desktop e la base e gli altri due
 * scostamenti — e la traduzione sta tutta in `resolveResponsive`.
 *
 * Modulo puro.
 */

type DeviceMap<T extends string | number> = Record<WebsiteDevice, Record<T, string>>;

const PADDING_TOP: DeviceMap<SpacingToken> = {
  mobile: { none: "pt-0", xs: "pt-3", sm: "pt-6", md: "pt-10", lg: "pt-14", xl: "pt-20" },
  tablet: { none: "md:pt-0", xs: "md:pt-4", sm: "md:pt-8", md: "md:pt-12", lg: "md:pt-20", xl: "md:pt-28" },
  desktop: { none: "lg:pt-0", xs: "lg:pt-4", sm: "lg:pt-8", md: "lg:pt-14", lg: "lg:pt-24", xl: "lg:pt-32" },
};

const PADDING_BOTTOM: DeviceMap<SpacingToken> = {
  mobile: { none: "pb-0", xs: "pb-3", sm: "pb-6", md: "pb-10", lg: "pb-14", xl: "pb-20" },
  tablet: { none: "md:pb-0", xs: "md:pb-4", sm: "md:pb-8", md: "md:pb-12", lg: "md:pb-20", xl: "md:pb-28" },
  desktop: { none: "lg:pb-0", xs: "lg:pb-4", sm: "lg:pb-8", md: "lg:pb-14", lg: "lg:pb-24", xl: "lg:pb-32" },
};

const PADDING_X: DeviceMap<GutterToken> = {
  mobile: { none: "px-0", sm: "px-4", md: "px-5", lg: "px-6" },
  tablet: { none: "md:px-0", sm: "md:px-6", md: "md:px-8", lg: "md:px-10" },
  desktop: { none: "lg:px-0", sm: "lg:px-8", md: "lg:px-10", lg: "lg:px-16" },
};

const GAP: DeviceMap<GutterToken> = {
  mobile: { none: "gap-0", sm: "gap-3", md: "gap-6", lg: "gap-8" },
  tablet: { none: "md:gap-0", sm: "md:gap-4", md: "md:gap-8", lg: "md:gap-10" },
  desktop: { none: "lg:gap-0", sm: "lg:gap-4", md: "lg:gap-8", lg: "lg:gap-12" },
};

const ALIGN: DeviceMap<AlignToken> = {
  mobile: { left: "text-left", center: "text-center", right: "text-right" },
  tablet: { left: "md:text-left", center: "md:text-center", right: "md:text-right" },
  desktop: { left: "lg:text-left", center: "lg:text-center", right: "lg:text-right" },
};

/* Allineamento degli elementi in colonna (bottoni, immagini). */
const ITEMS: DeviceMap<AlignToken> = {
  mobile: { left: "items-start", center: "items-center", right: "items-end" },
  tablet: { left: "md:items-start", center: "md:items-center", right: "md:items-end" },
  desktop: { left: "lg:items-start", center: "lg:items-center", right: "lg:items-end" },
};

const JUSTIFY: DeviceMap<AlignToken> = {
  mobile: { left: "justify-start", center: "justify-center", right: "justify-end" },
  tablet: { left: "md:justify-start", center: "md:justify-center", right: "md:justify-end" },
  desktop: { left: "lg:justify-start", center: "lg:justify-center", right: "lg:justify-end" },
};

const TEXT_SIZE: DeviceMap<TextSizeToken> = {
  mobile: { sm: "text-sm", md: "text-base", lg: "text-lg", xl: "text-xl" },
  tablet: { sm: "md:text-sm", md: "md:text-base", lg: "md:text-lg", xl: "md:text-xl" },
  desktop: { sm: "lg:text-sm", md: "lg:text-base", lg: "lg:text-xl", xl: "lg:text-2xl" },
};

const GRID_COLUMNS: DeviceMap<ColumnCount> = {
  mobile: { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" },
  tablet: { 1: "md:grid-cols-1", 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4" },
  desktop: { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" },
};

const HIDDEN: Record<WebsiteDevice, { hide: string; show: string }> = {
  mobile: { hide: "hidden", show: "block" },
  tablet: { hide: "md:hidden", show: "md:block" },
  desktop: { hide: "lg:hidden", show: "lg:block" },
};

/** Il passo di spaziatura del tema sposta la scala di un gradino. */
export type ThemeSpacing = "compact" | "comfortable" | "spacious";

export const shiftSpacing = (token: SpacingToken, spacing: ThemeSpacing): SpacingToken => {
  if (token === "none" || spacing === "comfortable") return token;
  const index = SPACING_TOKENS.indexOf(token);
  const next = spacing === "compact" ? Math.max(1, index - 1) : Math.min(SPACING_TOKENS.length - 1, index + 1);
  return SPACING_TOKENS[next];
};

/**
 * Il valore effettivo di un token su un dispositivo.
 *
 * Desktop e la base; tablet eredita da desktop; mobile eredita da tablet, che
 * a sua volta eredita. E la regola che l'editor mostra con «ereditato da».
 */
export const resolveResponsive = <K extends keyof ResponsiveStyle>(
  value: ResponsiveValue<ResponsiveStyle> | undefined,
  key: K,
  device: WebsiteDevice,
  fallback?: ResponsiveStyle[K],
): ResponsiveStyle[K] | undefined => {
  const base = value?.base?.[key] ?? fallback;
  if (device === "desktop") return base;
  const tablet = value?.tablet?.[key] ?? base;
  if (device === "tablet") return tablet;
  return value?.mobile?.[key] ?? tablet;
};

/** Da dove viene il valore che si vede: serve al bottone «ripristina». */
export const responsiveSource = (
  value: ResponsiveValue<ResponsiveStyle> | undefined,
  key: keyof ResponsiveStyle,
  device: WebsiteDevice,
): WebsiteDevice | "default" => {
  if (device === "mobile" && value?.mobile?.[key] !== undefined) return "mobile";
  if (device !== "desktop" && value?.tablet?.[key] !== undefined) return "tablet";
  if (value?.base?.[key] !== undefined) return "desktop";
  return "default";
};

const perDevice = <T extends string | number>(
  map: DeviceMap<T>,
  value: ResponsiveValue<ResponsiveStyle> | undefined,
  key: keyof ResponsiveStyle,
  fallback: T | undefined,
  transform?: (token: T) => T,
) => {
  const classes: string[] = [];
  for (const device of ["mobile", "tablet", "desktop"] as const) {
    const raw = resolveResponsive(value, key, device, fallback as any) as T | undefined;
    if (raw === undefined || raw === null) continue;
    const token = transform ? transform(raw) : raw;
    const cls = map[device][token];
    if (cls) classes.push(cls);
  }
  return classes;
};

export type ResponsiveDefaults = Partial<ResponsiveStyle>;

/** Le classi di spaziatura e allineamento di un elemento. */
export const responsiveClasses = (
  style: ElementStyle | undefined,
  defaults: ResponsiveDefaults = {},
  spacing: ThemeSpacing = "comfortable",
) => {
  const value = style?.responsive;
  const shift = (token: SpacingToken) => shiftSpacing(token, spacing);
  return [
    ...perDevice(PADDING_TOP, value, "paddingTop", defaults.paddingTop, shift),
    ...perDevice(PADDING_BOTTOM, value, "paddingBottom", defaults.paddingBottom, shift),
    ...perDevice(PADDING_X, value, "paddingX", defaults.paddingX),
    ...perDevice(ALIGN, value, "align", defaults.align),
    ...perDevice(TEXT_SIZE, value, "textSize", defaults.textSize),
  ].join(" ");
};

export const gapClasses = (style: ElementStyle | undefined, fallback: GutterToken = "md") =>
  perDevice(GAP, style?.responsive, "gap", fallback).join(" ");

export const itemsAlignClasses = (style: ElementStyle | undefined, fallback: AlignToken = "left") =>
  perDevice(ITEMS, style?.responsive, "align", fallback).join(" ");

export const justifyClasses = (style: ElementStyle | undefined, fallback: AlignToken = "left") =>
  perDevice(JUSTIFY, style?.responsive, "align", fallback).join(" ");

/**
 * Le colonne di una sezione. Senza scostamenti dichiarati, una sezione a tre
 * o quattro colonne diventa due su tablet e una su mobile: e il comportamento
 * che chi impagina si aspetta, e lo si cambia con uno scostamento esplicito.
 */
export const sectionGridClasses = (columns: number, style: ElementStyle | undefined) => {
  const base = Math.min(4, Math.max(1, columns)) as ColumnCount;
  const value: ResponsiveValue<ResponsiveStyle> = {
    base: { columns: style?.responsive?.base?.columns ?? base },
    tablet: {
      columns: style?.responsive?.tablet?.columns ?? (Math.min(base, 2) as ColumnCount),
    },
    mobile: { columns: style?.responsive?.mobile?.columns ?? 1 },
  };
  return perDevice(GRID_COLUMNS, value, "columns", base).join(" ");
};

/** Le classi di una griglia di elementi (card, loghi, giocatori). */
export const itemGridClasses = (columns: { desktop: number; tablet?: number; mobile?: number }) => {
  const clamp = (n: number | undefined, fallback: number) =>
    Math.min(4, Math.max(1, Math.round(n ?? fallback))) as ColumnCount;
  const desktop = clamp(columns.desktop, 3);
  const tablet = clamp(columns.tablet, Math.min(desktop, 2));
  const mobile = clamp(columns.mobile, 1);
  return [GRID_COLUMNS.mobile[mobile], GRID_COLUMNS.tablet[tablet], GRID_COLUMNS.desktop[desktop]].join(" ");
};

/**
 * Nascondere su un dispositivo. Con le classi e non con un ramo nel renderer:
 * l'HTML e uno solo, e una cache non deve sapere chi sta guardando.
 */
export const visibilityClasses = (hidden: Partial<Record<WebsiteDevice, boolean>> | undefined) => {
  if (!hidden || (!hidden.mobile && !hidden.tablet && !hidden.desktop)) return "";
  const classes: string[] = [];
  classes.push(hidden.mobile ? HIDDEN.mobile.hide : HIDDEN.mobile.show);
  classes.push(hidden.tablet ? HIDDEN.tablet.hide : HIDDEN.tablet.show);
  classes.push(hidden.desktop ? HIDDEN.desktop.hide : HIDDEN.desktop.show);
  return classes.join(" ");
};

/** Larghezza del contenuto di una sezione. */
export const WIDTH_CLASSES = {
  full: "w-full",
  wide: "mx-auto w-full max-w-[calc(var(--ws-container)*1.25)]",
  container: "mx-auto w-full max-w-ws-container",
  narrow: "mx-auto w-full max-w-ws-narrow",
} as const;

export const BACKGROUND_CLASSES = {
  none: "",
  surface: "bg-ws-bg text-ws-fg",
  muted: "bg-ws-muted text-ws-fg",
  primary: "bg-ws-primary text-ws-primary-ink",
  secondary: "bg-ws-secondary text-ws-secondary-ink",
  accent: "bg-ws-accent text-ws-accent-ink",
  dark: "bg-ws-dark text-ws-dark-fg",
  image: "text-white",
} as const;

export const TONE_CLASSES = {
  auto: "",
  light: "text-white",
  dark: "text-ws-fg",
} as const;

export const RADIUS_CLASSES = {
  theme: "rounded-ws",
  none: "rounded-none",
  sm: "rounded-ws-sm",
  lg: "rounded-ws-lg",
} as const;

export const HEADING_SIZE_CLASSES = {
  sm: "text-xl md:text-2xl",
  md: "text-2xl md:text-3xl",
  lg: "text-3xl md:text-4xl lg:text-5xl",
  xl: "text-4xl md:text-5xl lg:text-6xl",
} as const;
