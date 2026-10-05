/**
 * **Colori leggibili per costruzione** (ADR-0200 §7).
 *
 * La logica di contrasto e quella del Website Builder GPW
 * (`packages/products/dealer-web/ui/src/dealer-palette.ts` in Cedi Platform),
 * riscritta qui e non importata: i due prodotti non condividono codice a
 * runtime. Il principio e lo stesso: un club sceglie i suoi colori, e il sito
 * resta leggibile anche quando la scelta non lo sarebbe.
 *
 * 1. sopra un fondo pieno il testo e bianco o quasi-nero, quello dei due che
 *    misura il contrasto maggiore;
 * 2. un colore usato **come testo** (link, occhielli) viene scurito a piccoli
 *    passi finche raggiunge 4,5:1 sullo sfondo del tema, cosi resta
 *    riconoscibile — un blu resta blu — e solo un colore quasi bianco diventa
 *    irriconoscibile, che e il caso in cui leggere conta piu che somigliare;
 * 3. lo stato «hover» e un passo di luminosita, non un secondo colore.
 *
 * Funzioni pure di stringhe esadecimali: testabili senza DOM.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;

export type Rgb = readonly [number, number, number];

export const TEXT_CONTRAST_TARGET = 4.5;
export const LARGE_TEXT_CONTRAST_TARGET = 3;

export const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && HEX.test(value.trim());

export const parseHex = (value: unknown): Rgb | null => {
  if (!isHexColor(value)) return null;
  const hex = value.trim().slice(1);
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ] as const;
};

export const formatHex = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("")}`;

/** `rgb` separato da spazi, la forma che Tailwind legge con `<alpha-value>`. */
export const toRgbChannels = (hex: string) => {
  const rgb = parseHex(hex) ?? ([0, 0, 0] as const);
  return `${rgb[0]} ${rgb[1]} ${rgb[2]}`;
};

const relativeLuminance = ([r, g, b]: Rgb) => {
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** Contrasto WCAG 2.x fra due colori esadecimali. Un colore illeggibile vale 1. */
export const contrastRatio = (first: string, second: string) => {
  const a = parseHex(first);
  const b = parseHex(second);
  if (!a || !b) return 1;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const mix = (colour: Rgb, towards: Rgb, weight: number): Rgb =>
  colour.map((channel, index) => Math.round(channel * (1 - weight) + towards[index] * weight)) as unknown as Rgb;

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];
const NEAR_BLACK = "#111827";

/** Bianco o quasi-nero sopra un fondo pieno: quello piu leggibile. */
export const readableOn = (fill: string) =>
  contrastRatio(fill, "#ffffff") >= contrastRatio(fill, NEAR_BLACK) ? "#ffffff" : NEAR_BLACK;

/**
 * Lo stesso colore, spostato finche e leggibile come testo su `surface`.
 * Se il fondo e scuro si schiarisce invece di scurire.
 */
export const inkOn = (colour: string, surface: string, target = TEXT_CONTRAST_TARGET) => {
  const parsed = parseHex(colour);
  if (!parsed) return readableOn(surface);
  const towards = relativeLuminance(parseHex(surface) ?? WHITE) > 0.4 ? BLACK : WHITE;
  let candidate = parsed;
  for (let step = 0; step < 24; step += 1) {
    const hex = formatHex(candidate);
    if (contrastRatio(hex, surface) >= target) return hex;
    candidate = mix(candidate, towards, 0.1);
  }
  return formatHex(candidate);
};

/** Un passo di luminosita, nella direzione che si vede davvero. */
export const shade = (colour: string, amount: number) => {
  const parsed = parseHex(colour);
  if (!parsed) return colour;
  const towards = relativeLuminance(parsed) < 0.18 ? WHITE : BLACK;
  return formatHex(mix(parsed, towards, amount));
};

/** Una tinta tenue per i fondi «del club» che non competono con niente. */
export const soften = (colour: string, amount = 0.08, base = "#ffffff") => {
  const parsed = parseHex(colour);
  const target = parseHex(base) ?? WHITE;
  if (!parsed) return base;
  return formatHex(mix(parsed, target, 1 - amount));
};

export type ContrastCheck = {
  pair: string;
  label: string;
  ratio: number;
  target: number;
  passes: boolean;
};

/**
 * Le coppie che il sito usa davvero, misurate. L'editor del tema le mostra
 * accanto ai selettori: un'avvertenza vale piu di un divieto, perche il
 * renderer corregge comunque il colore del testo.
 */
export const checkPaletteContrast = (colors: {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
  muted: string;
}): ContrastCheck[] => {
  const pairs: Array<[string, string, string, string, number]> = [
    ["foreground/background", "Testo sullo sfondo", colors.foreground, colors.background, TEXT_CONTRAST_TARGET],
    ["foreground/muted", "Testo sul fondo tenue", colors.foreground, colors.muted, TEXT_CONTRAST_TARGET],
    ["primary/background", "Colore principale come testo", colors.primary, colors.background, TEXT_CONTRAST_TARGET],
    ["primary-ink/primary", "Testo sui bottoni principali", readableOn(colors.primary), colors.primary, TEXT_CONTRAST_TARGET],
    ["secondary-ink/secondary", "Testo sui fondi secondari", readableOn(colors.secondary), colors.secondary, TEXT_CONTRAST_TARGET],
    ["accent-ink/accent", "Testo sul colore d'accento", readableOn(colors.accent), colors.accent, LARGE_TEXT_CONTRAST_TARGET],
  ];
  return pairs.map(([pair, label, a, b, target]) => {
    const ratio = Math.round(contrastRatio(a, b) * 100) / 100;
    return { pair, label, ratio, target, passes: ratio >= target };
  });
};
