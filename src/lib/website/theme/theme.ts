import {
  normalizeWebsiteFont,
  websiteFontStack,
  type WebsiteFontKey,
} from "./fonts";
import {
  inkOn,
  isHexColor,
  readableOn,
  shade,
  toRgbChannels,
} from "./palette";
import type { ThemeSpacing } from "../style-classes";

/**
 * **Il tema globale di un sito** (ADR-0200 §7).
 *
 * Un tema e dati, non codice: colori, caratteri, raggio, larghezza, passo di
 * spaziatura, forma dei bottoni, stile dei collegamenti. I blocchi non hanno
 * colori propri: leggono le variabili `--ws-*` che `themeToCssVariables` scrive
 * sul contenitore del sito, e un override locale (lo sfondo di una sezione) e
 * la scelta di **quale** token usare, mai un esadecimale scritto nel blocco.
 *
 * Modulo puro.
 */

export const THEME_COLOR_KEYS = [
  "primary",
  "secondary",
  "accent",
  "background",
  "foreground",
  "muted",
  "success",
  "warning",
  "danger",
] as const;

export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];
export type ThemeColors = Record<ThemeColorKey, string>;

export const THEME_RADIUS = ["none", "sm", "md", "lg", "xl"] as const;
export type ThemeRadius = (typeof THEME_RADIUS)[number];

export const THEME_CONTAINER = ["narrow", "standard", "wide"] as const;
export type ThemeContainer = (typeof THEME_CONTAINER)[number];

export const THEME_SPACING = ["compact", "comfortable", "spacious"] as const;

export const BUTTON_SHAPES = ["square", "rounded", "pill"] as const;
export type ButtonShape = (typeof BUTTON_SHAPES)[number];

export const BUTTON_TRANSFORMS = ["none", "uppercase"] as const;
export type ButtonTransform = (typeof BUTTON_TRANSFORMS)[number];

export const LINK_STYLES = ["always", "hover", "none"] as const;
export type LinkStyle = (typeof LINK_STYLES)[number];

export type SiteTheme = {
  colors: ThemeColors;
  fonts: { heading: WebsiteFontKey; body: WebsiteFontKey };
  radius: ThemeRadius;
  container: ThemeContainer;
  spacing: ThemeSpacing;
  buttons: { shape: ButtonShape; transform: ButtonTransform };
  links: { underline: LinkStyle };
};

export const DEFAULT_THEME: SiteTheme = {
  colors: {
    primary: "#1d4ed8",
    secondary: "#0f172a",
    accent: "#f59e0b",
    background: "#ffffff",
    foreground: "#111827",
    muted: "#f3f4f6",
    success: "#16a34a",
    warning: "#d97706",
    danger: "#dc2626",
  },
  fonts: { heading: "oswald", body: "inter" },
  radius: "md",
  container: "standard",
  spacing: "comfortable",
  buttons: { shape: "rounded", transform: "none" },
  links: { underline: "hover" },
};

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};

/**
 * Un tema ripulito: ogni chiave sconosciuta cade, ogni valore fuori catalogo
 * torna al predefinito. Si usa sia in scrittura sia in lettura, perche un
 * documento pubblicato con una versione vecchia deve restare renderizzabile.
 */
export const normalizeTheme = (raw: unknown, base: SiteTheme = DEFAULT_THEME): SiteTheme => {
  const record = asRecord(raw);
  const colors = asRecord(record.colors);
  const fonts = asRecord(record.fonts);
  const buttons = asRecord(record.buttons);
  const links = asRecord(record.links);

  const nextColors = {} as ThemeColors;
  for (const key of [
    "primary",
    "secondary",
    "accent",
    "background",
    "foreground",
    "muted",
    "success",
    "warning",
    "danger",
  ] as const) {
    const value = colors[key];
    nextColors[key] = isHexColor(value) ? String(value).toLowerCase() : base.colors[key];
  }

  return {
    colors: nextColors,
    fonts: {
      heading: normalizeWebsiteFont(fonts.heading, base.fonts.heading),
      body: normalizeWebsiteFont(fonts.body, base.fonts.body),
    },
    radius: oneOf(record.radius, THEME_RADIUS, base.radius),
    container: oneOf(record.container, THEME_CONTAINER, base.container),
    spacing: oneOf(record.spacing, THEME_SPACING, base.spacing),
    buttons: {
      shape: oneOf(buttons.shape, BUTTON_SHAPES, base.buttons.shape),
      transform: oneOf(buttons.transform, BUTTON_TRANSFORMS, base.buttons.transform),
    },
    links: { underline: oneOf(links.underline, LINK_STYLES, base.links.underline) },
  };
};

const RADIUS_REM: Record<ThemeRadius, string> = {
  none: "0rem",
  sm: "0.25rem",
  md: "0.6rem",
  lg: "1rem",
  xl: "1.6rem",
};

const CONTAINER_REM: Record<ThemeContainer, string> = {
  narrow: "64rem",
  standard: "72rem",
  wide: "84rem",
};

const BUTTON_RADIUS: Record<ButtonShape, string> = {
  square: "0rem",
  rounded: "var(--ws-radius)",
  pill: "999px",
};

/**
 * Le variabili CSS del sito. **Ogni coppia testo/fondo passa dal contrasto**:
 * il colore del testo sopra un bottone si calcola, non si sceglie, e il
 * principale usato come testo viene scurito finche si legge.
 */
export const themeToCssVariables = (theme: SiteTheme): Record<string, string> => {
  const c = theme.colors;
  const dark = c.secondary;
  return {
    "--ws-primary-rgb": toRgbChannels(c.primary),
    "--ws-primary-ink-rgb": toRgbChannels(readableOn(c.primary)),
    "--ws-primary-text-rgb": toRgbChannels(inkOn(c.primary, c.background)),
    "--ws-primary-hover-rgb": toRgbChannels(shade(c.primary, 0.1)),
    "--ws-secondary-rgb": toRgbChannels(c.secondary),
    "--ws-secondary-ink-rgb": toRgbChannels(readableOn(c.secondary)),
    "--ws-accent-rgb": toRgbChannels(c.accent),
    "--ws-accent-ink-rgb": toRgbChannels(readableOn(c.accent)),
    "--ws-background-rgb": toRgbChannels(c.background),
    "--ws-foreground-rgb": toRgbChannels(inkOn(c.foreground, c.background)),
    "--ws-muted-rgb": toRgbChannels(c.muted),
    "--ws-muted-foreground-rgb": toRgbChannels(inkOn(shade(c.foreground, 0.35), c.muted)),
    "--ws-border-rgb": toRgbChannels(shade(c.muted, 0.08)),
    "--ws-success-rgb": toRgbChannels(c.success),
    "--ws-warning-rgb": toRgbChannels(c.warning),
    "--ws-danger-rgb": toRgbChannels(c.danger),
    "--ws-dark-rgb": toRgbChannels(dark),
    "--ws-dark-foreground-rgb": toRgbChannels(readableOn(dark)),
    "--ws-font-heading": websiteFontStack(theme.fonts.heading),
    "--ws-font-body": websiteFontStack(theme.fonts.body),
    "--ws-radius": RADIUS_REM[theme.radius],
    "--ws-container": CONTAINER_REM[theme.container],
    "--ws-button-radius": BUTTON_RADIUS[theme.buttons.shape],
    "--ws-button-transform": theme.buttons.transform === "uppercase" ? "uppercase" : "none",
    "--ws-button-tracking": theme.buttons.transform === "uppercase" ? "0.04em" : "0",
    "--ws-link-decoration": theme.links.underline === "always" ? "underline" : "none",
  };
};

/** Le variabili come stringa `style` inline, per il contenitore del sito. */
export const themeStyleAttribute = (theme: SiteTheme) =>
  Object.entries(themeToCssVariables(theme))
    .map(([key, value]) => `${key}:${value}`)
    .join("; ");
