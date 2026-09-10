import type { ParentDashboardEvent } from "@/services/api";

/**
 * Il calendario unificato Parent — dominio puro. Specchio del comportamento
 * Web (`ParentCalendarPage` in `src/components/parent-dashboard/
 * parent-family-pages.tsx`): aggrega `trainings.all` + `matches.all` dal
 * payload gia caricato, etichetta ciascuna voce con `kind`, ordina per
 * data/ora. Nessuna fetch propria — le stesse liste che alimentano la Home.
 */

export type ParentCalendarKind = "training" | "match";

export type ParentCalendarItem = ParentDashboardEvent & {
  kind: ParentCalendarKind;
};

export type ParentCalendarFilter = "all" | ParentCalendarKind;

const sortKey = (item: ParentDashboardEvent) =>
  `${item.date || ""}T${item.time || ""}`;

/** Unisce allenamenti e gare in un'unica lista ordinata per data/ora, ciascuna voce etichettata con la propria specie. */
export function buildParentCalendarItems(
  trainings: ParentDashboardEvent[],
  matches: ParentDashboardEvent[],
): ParentCalendarItem[] {
  const tagged: ParentCalendarItem[] = [
    ...trainings.map((item) => ({ ...item, kind: "training" as const })),
    ...matches.map((item) => ({ ...item, kind: "match" as const })),
  ];

  return tagged.sort((left, right) =>
    sortKey(left).localeCompare(sortKey(right)),
  );
}

/** Filtra la lista unificata per specie — "all" (default web), "training" o "match". */
export function filterParentCalendarItems(
  items: ParentCalendarItem[],
  filter: ParentCalendarFilter,
): ParentCalendarItem[] {
  if (filter === "all") return items;
  return items.filter((item) => item.kind === filter);
}

/** Trova una voce del calendario per id — usata per aprire il dettaglio senza una seconda fetch. */
export function findParentCalendarItem(
  items: ParentCalendarItem[],
  eventId: string,
): ParentCalendarItem | null {
  return items.find((item) => item.id === eventId) || null;
}

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const MONTH_NAMES = [
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

/** `"2026-09-12"` -> `{ dayName: "Sab", dayNumber: "12", monthLabel: "set" }` — la rotaia data di `EventCard`/`AppointmentCard`. Torna `null` per una data non valida (l'evento non ha ancora una data reale). */
export function formatEventDateRail(
  isoDate: string | undefined,
): { dayName: string; dayNumber: string; monthLabel: string } | null {
  if (!isoDate) return null;
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;

  return {
    dayName: DAY_NAMES[parsed.getDay()],
    dayNumber: String(parsed.getDate()),
    monthLabel: MONTH_NAMES[parsed.getMonth()],
  };
}

/** `"2026-09-12"` -> `"sab 12 set"` — l'etichetta breve usata nella Home ("Prossimo allenamento: sab 12 set"). */
export function formatEventDateShort(isoDate: string | undefined): string {
  const rail = formatEventDateRail(isoDate);
  if (!rail) return "Da definire";
  return `${rail.dayName.toLowerCase()} ${rail.dayNumber} ${rail.monthLabel}`;
}
