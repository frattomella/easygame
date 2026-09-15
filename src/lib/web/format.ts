/**
 * Formattazione italiana per il Web V2 (guideline 05 §5.3).
 *
 * Un numero e sempre tabellare; un valore mancante e sempre `—`, mai vuoto e
 * mai «N/D». Le date usano il mese corto italiano (`24 set 2026`), gli importi
 * i decimali italiani con il simbolo dopo (`305,00 €`).
 *
 * Moduli puri: niente React, niente `window`. Testati in
 * `tests/web/format.test.mjs`.
 */

export const MISSING = "—";

const MONTHS_SHORT = [
  "gen",
  "feb",
  "mar",
  "apr",
  "mag",
  "giu",
  "lug",
  "ago",
  "set",
  "ott",
  "nov",
  "dic",
];

const WEEKDAYS_LONG = [
  "domenica",
  "lunedì",
  "martedì",
  "mercoledì",
  "giovedì",
  "venerdì",
  "sabato",
];

const MONTHS_LONG = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

/**
 * Legge una data da cio che l'API manda: `YYYY-MM-DD` (giorno civile, letto
 * come locale e non come UTC, vedi `src/lib/date-only.ts`), una ISO completa,
 * un `Date`. Restituisce `null` per tutto cio che non e una data.
 */
export const parseDateInput = (
  value: string | Date | number | null | undefined,
): Date | null => {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const text = String(value).trim();
  const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dayOnly) {
    const d = new Date(
      Number(dayOnly[1]),
      Number(dayOnly[2]) - 1,
      Number(dayOnly[3]),
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** `24 set 2026` — la forma di riga. */
export const formatDateShort = (
  value: string | Date | number | null | undefined,
): string => {
  const d = parseDateInput(value);
  if (!d) return MISSING;
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
};

/** `24 set` — quando l'anno e ovvio dal contesto. */
export const formatDayMonth = (
  value: string | Date | number | null | undefined,
): string => {
  const d = parseDateInput(value);
  if (!d) return MISSING;
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
};

/** `24/09/2026` — la forma dei campi. */
export const formatDateNumeric = (
  value: string | Date | number | null | undefined,
): string => {
  const d = parseDateInput(value);
  if (!d) return MISSING;
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/** `GIOVEDÌ 10 SETTEMBRE 2026` — l'occhiello della Dashboard. */
export const formatDateEyebrow = (
  value: string | Date | number | null | undefined,
): string => {
  const d = parseDateInput(value);
  if (!d) return MISSING;
  return `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`.toUpperCase();
};

/** `17:30` */
export const formatTime = (
  value: string | Date | number | null | undefined,
): string => {
  if (typeof value === "string" && /^\d{1,2}:\d{2}/.test(value.trim())) {
    const [h, m] = value.trim().split(":");
    return `${pad2(Number(h))}:${m.slice(0, 2)}`;
  }
  const d = parseDateInput(value);
  if (!d) return MISSING;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

/** `24 set 2026 · 17:30` */
export const formatDateTime = (
  value: string | Date | number | null | undefined,
): string => {
  const d = parseDateInput(value);
  if (!d) return MISSING;
  return `${formatDateShort(d)} · ${formatTime(d)}`;
};

/**
 * `305,00 €` — mai un numero nudo per il denaro, mai `EUR`.
 * `null`/`undefined`/NaN → `—`.
 */
export const formatMoney = (
  value: number | string | null | undefined,
  options: { signed?: boolean } = {},
): string => {
  if (value == null || value === "") return MISSING;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n)) return MISSING;
  const abs = Math.abs(n);
  const [intPart, decPart] = abs.toFixed(2).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const sign = n < 0 ? "−" : options.signed && n > 0 ? "+" : "";
  return `${sign}${grouped},${decPart} €`;
};

/** `1.250` — un intero con i punti delle migliaia. */
export const formatInteger = (
  value: number | string | null | undefined,
): string => {
  if (value == null || value === "") return MISSING;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return MISSING;
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

/** `87%` */
export const formatPercent = (
  value: number | string | null | undefined,
  digits = 0,
): string => {
  if (value == null || value === "") return MISSING;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return MISSING;
  return `${n.toFixed(digits).replace(".", ",")}%`;
};

/** Testo mancante → `—`. */
export const orMissing = (value: string | number | null | undefined): string => {
  if (value == null) return MISSING;
  const text = String(value).trim();
  return text ? text : MISSING;
};

/**
 * Giorni fra oggi e una data (positivo = futuro). `null` se la data manca.
 * Conta i giorni civili, non le ore: una scadenza «domani» e 1 anche alle 23.
 */
export const daysUntil = (
  value: string | Date | number | null | undefined,
  today: Date = new Date(),
): number | null => {
  const d = parseDateInput(value);
  if (!d) return null;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  return Math.round((a - b) / 86_400_000);
};

/** `4 GIORNI` · `1 GIORNO` · `OGGI` — per la pillola «in scadenza». */
export const formatDaysLabel = (days: number): string => {
  if (days === 0) return "OGGI";
  if (days === 1) return "1 GIORNO";
  return `${days} GIORNI`;
};

/** Iniziali (max due) per un avatar: `Marco Ferretti` → `MF`. */
export const initialsOf = (name: string | null | undefined): string =>
  String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

/** `14 mar 2011 · Scauri` — la riga meta dell'identita. */
export const joinMeta = (
  ...parts: Array<string | number | null | undefined | false>
): string =>
  parts
    .filter((p) => p !== null && p !== undefined && p !== false && String(p).trim() !== "" && p !== MISSING)
    .map(String)
    .join(" · ");
