/**
 * **Il giorno del sito** (ADR-0200). Un club italiano vive nel fuso di Roma:
 * uno sponsor «visibile fino al 30» lo e fino a mezzanotte di Roma, non fino
 * all'una di notte perche il server ragiona in UTC. Il troncamento di
 * `toISOString()` sbaglia giorno per due ore ogni notte (presidio
 * `tests/ui/date-only-timezone-shift.test.mjs`).
 *
 * Modulo puro.
 */
export const SITE_TIME_ZONE = "Europe/Rome";

/** `YYYY-MM-DD` del giorno in corso nel fuso del sito. */
export const siteDayKey = (now: Date, timeZone: string = SITE_TIME_ZONE) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
