import type { CompetitionDto, StandingsRowDto } from "@/lib/sports/client";

/**
 * **Competizioni: le parole e le righe della classifica** (ADR-0200 §8).
 * Modulo puro di presentazione: la classifica la scrive il club, EasyGame non
 * la calcola; qui si traduce soltanto fra i campi del modulo (testo) e le righe
 * che il server ripulisce di nuovo (`normalizeStandings`).
 */

export type CompetitionKind = CompetitionDto["kind"];

export const COMPETITION_KIND_LABELS: Record<CompetitionKind, string> = {
  league: "Campionato",
  cup: "Coppa",
  tournament: "Torneo",
  friendly: "Amichevole",
};

export const COMPETITION_KIND_OPTIONS = (Object.keys(COMPETITION_KIND_LABELS) as CompetitionKind[]).map((value) => ({
  value,
  label: COMPETITION_KIND_LABELS[value],
}));

export const STANDINGS_NUMBER_COLUMNS = [
  { key: "played", label: "Partite giocate", short: "G" },
  { key: "won", label: "Vinte", short: "V" },
  { key: "drawn", label: "Pareggiate", short: "N" },
  { key: "lost", label: "Perse", short: "P" },
  { key: "pointsFor", label: "Punti o reti fatti", short: "F" },
  { key: "pointsAgainst", label: "Punti o reti subiti", short: "S" },
  { key: "points", label: "Punti in classifica", short: "PT" },
] as const;

export type StandingsNumberKey = (typeof STANDINGS_NUMBER_COLUMNS)[number]["key"];

export type StandingsRowDraft = {
  key: string;
  position: string;
  team: string;
  isClub: boolean;
} & Record<StandingsNumberKey, string>;

let rowSequence = 0;
export const nextStandingsRowKey = () => `standing-${++rowSequence}`;

const text = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));

export const emptyStandingsRow = (position: number): StandingsRowDraft => ({
  key: nextStandingsRowKey(),
  position: String(position),
  team: "",
  isClub: false,
  played: "",
  won: "",
  drawn: "",
  lost: "",
  pointsFor: "",
  pointsAgainst: "",
  points: "",
});

export const standingsToDraft = (rows: readonly StandingsRowDto[]): StandingsRowDraft[] =>
  rows.map((row) => ({
    key: nextStandingsRowKey(),
    position: text(row.position),
    team: row.team,
    isClub: row.isClub,
    played: text(row.played),
    won: text(row.won),
    drawn: text(row.drawn),
    lost: text(row.lost),
    pointsFor: text(row.pointsFor),
    pointsAgainst: text(row.pointsAgainst),
    points: text(row.points),
  }));

const toInteger = (value: string): number | null => {
  const raw = value.trim();
  if (!raw) return null;
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? n : null;
};

export const draftToStandings = (rows: readonly StandingsRowDraft[]): StandingsRowDto[] =>
  rows
    .filter((row) => row.team.trim())
    .map((row, index) => ({
      position: toInteger(row.position) ?? index + 1,
      team: row.team.trim(),
      isClub: row.isClub,
      played: toInteger(row.played),
      won: toInteger(row.won),
      drawn: toInteger(row.drawn),
      lost: toInteger(row.lost),
      pointsFor: toInteger(row.pointsFor),
      pointsAgainst: toInteger(row.pointsAgainst),
      points: toInteger(row.points),
    }));

/** Le righe con numeri ma senza squadra: il server le scarterebbe in silenzio. */
export const standingsRowsWithoutTeam = (rows: readonly StandingsRowDraft[]) =>
  rows.filter(
    (row) =>
      !row.team.trim() &&
      (row.isClub || STANDINGS_NUMBER_COLUMNS.some((column) => row[column.key].trim())),
  );

/** Spostare una riga rinumera le posizioni nell'ordine nuovo. */
export const moveStandingsRow = (rows: readonly StandingsRowDraft[], index: number, delta: -1 | 1) => {
  const target = index + delta;
  if (target < 0 || target >= rows.length) return [...rows];
  const next = [...rows];
  [next[index], next[target]] = [next[target], next[index]];
  return next.map((row, position) => ({ ...row, position: String(position + 1) }));
};
