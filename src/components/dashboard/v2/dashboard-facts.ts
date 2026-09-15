/**
 * I fatti che la Dashboard V2 dice nel blocco di saluto e nei KPI: funzioni
 * pure, senza React, ricavate dai dati che la pagina legge gia con
 * `loadClubDashboardOverview` (guideline 09 §9.7).
 */

/** `Buongiorno` fino alle 18, poi `Buonasera`. */
export const greetingWord = (now: Date = new Date()) =>
  now.getHours() < 18 ? "Buongiorno" : "Buonasera";

/** Il nome con cui salutare: prima il nome proprio, poi cio che c'e. */
export const greetingName = (user: any): string => {
  const meta = user?.user_metadata || {};
  const first = String(meta.firstName || "").trim();
  if (first) return first;
  const full = String(meta.name || "").trim();
  if (full) return full.split(/\s+/)[0];
  const email = String(user?.email || "").trim();
  if (email) return email.split("@")[0];
  return "";
};

/** `1 allenamento` · `3 allenamenti` — l'italiano non si concatena. */
export const countNoun = (count: number, singular: string, plural: string) =>
  `${count} ${count === 1 ? singular : plural}`;

/**
 * Le gare del **prossimo** fine settimana: sabato e domenica a venire (oggi
 * compreso, se oggi e gia sabato o domenica). Le gare sono gia filtrate su
 * «da oggi in poi, non annullate» da `selectUpcomingMatches`.
 */
export const countWeekendMatches = (
  matches: Array<{ date: Date }>,
  today: Date = new Date(),
) => {
  const reference = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const weekday = reference.getDay(); // 0 = domenica
  const daysToSaturday = weekday === 0 ? -1 : 6 - weekday;
  const saturday = new Date(reference);
  saturday.setDate(reference.getDate() + daysToSaturday);
  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);
  const from = Math.max(saturday.getTime(), reference.getTime());
  const to = sunday.getTime();

  return matches.filter((match) => {
    const time = match?.date instanceof Date ? match.date.getTime() : NaN;
    return !Number.isNaN(time) && time >= from && time <= to;
  }).length;
};

/** La riga di riepilogo sotto il saluto. */
export const buildGreetingSummary = ({
  trainingsToday,
  weekendMatches,
  expiringCertificates,
}: {
  trainingsToday: number;
  weekendMatches: number;
  expiringCertificates: number;
}) =>
  [
    `${countNoun(trainingsToday, "allenamento", "allenamenti")} oggi`,
    `${countNoun(weekendMatches, "gara", "gare")} nel fine settimana`,
    `${countNoun(expiringCertificates, "certificato", "certificati")} in scadenza`,
  ].join(" · ");
