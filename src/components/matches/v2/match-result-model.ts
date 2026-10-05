import { apiRequest } from "@/lib/api/client";
import type { MatchRecord } from "@/components/matches/v2/match-page-model";
import { isHomeMatch } from "@/components/matches/v2/match-page-model";

/**
 * **Il risultato di una gara, visto dal gestionale** (ADR-0200 §8).
 *
 * Modulo di presentazione: legge cio che il server ha scritto
 * (`home_score`/`away_score`/`result_status`, secondo casa e trasferta) e lo
 * dice dal punto di vista del club — «78-65 · Vittoria». Non calcola niente
 * che il server non abbia gia deciso: la coerenza fra parziali e risultato,
 * il pareggio e le statistiche li vaglia `saveMatchResult`.
 */

export type MatchResultStatus = "provisional" | "final";

export type MatchResultSnapshot = {
  homeScore: number | null;
  awayScore: number | null;
  resultStatus: MatchResultStatus | null;
  /** Lo stato della gara dopo il salvataggio: un risultato definitivo la chiude. */
  status?: string | null;
};

/** La riga dell'evento come la restituisce `GET /api/v1/events/:id` (colonne). */
export type MatchEventRow = {
  id: string;
  kind?: string;
  status?: string;
  version?: number;
  team_id?: string | null;
  competition_id?: string | null;
  opponent_id?: string | null;
  round_label?: string | null;
  opponent?: string | null;
  home_away?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  result_status?: string | null;
  period_scores?: unknown;
  [key: string]: unknown;
};

export type MatchEventParticipant = {
  athlete_id?: string | null;
  convocation_status?: string | null;
  [key: string]: unknown;
};

export type MatchEventDetail = {
  row: MatchEventRow;
  participants: MatchEventParticipant[];
};

const toScore = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** L'identificativo con cui si parla al dominio degli eventi (la riga, o lo storico). */
export const matchEventKey = (match: Pick<MatchRecord, "id"> & { eventId?: unknown }) =>
  String(match.eventId || match.id || "").trim();

/** Il risultato scritto su una riga di evento (le colonne del server). */
export const snapshotFromEventRow = (row: Partial<MatchEventRow> | null | undefined): MatchResultSnapshot => ({
  homeScore: toScore(row?.home_score),
  awayScore: toScore(row?.away_score),
  resultStatus: row?.result_status === "provisional" || row?.result_status === "final" ? row.result_status : null,
  status: typeof row?.status === "string" ? row.status : null,
});

/** Il risultato che una gara dell'elenco porta con se, se lo porta. */
export const readMatchResult = (match: MatchRecord): MatchResultSnapshot | null => {
  const homeScore = toScore(match.homeScore ?? match.home_score);
  const awayScore = toScore(match.awayScore ?? match.away_score);
  if (homeScore === null || awayScore === null) return null;
  const raw = String(match.resultStatus ?? match.result_status ?? "");
  return {
    homeScore,
    awayScore,
    resultStatus: raw === "provisional" ? "provisional" : raw === "final" ? "final" : null,
  };
};

/** «Vittoria», «Sconfitta», «Pareggio», dal punto di vista del club. */
export const matchOutcomeWord = (match: MatchRecord, result: MatchResultSnapshot) => {
  if (result.homeScore === null || result.awayScore === null) return null;
  const club = isHomeMatch(match) ? result.homeScore : result.awayScore;
  const other = isHomeMatch(match) ? result.awayScore : result.homeScore;
  if (club > other) return "Vittoria";
  if (club < other) return "Sconfitta";
  return "Pareggio";
};

/** «78-65 · Vittoria» (con «provvisorio» se non e ancora definitivo), o `null`. */
export const matchResultLabel = (match: MatchRecord): string | null => {
  const result = readMatchResult(match);
  if (!result) return null;
  const outcome = matchOutcomeWord(match, result);
  return [
    `${result.homeScore}-${result.awayScore}`,
    outcome,
    result.resultStatus === "provisional" ? "provvisorio" : null,
  ]
    .filter(Boolean)
    .join(" · ");
};

/**
 * Una gara dell'elenco con il risultato appena salvato in questa sessione.
 *
 * L'elenco delle gare oggi non porta le colonne del risultato: la pagina
 * conserva cio che il cassetto ha scritto e lo rimette sulla gara a ogni
 * ricarica, cosi il risultato si vede subito dopo il salvataggio.
 */
export const applyResultSnapshot = <T extends MatchRecord>(
  match: T,
  snapshots: Record<string, MatchResultSnapshot>,
): T => {
  const snapshot = snapshots[matchEventKey(match)] || snapshots[String(match.id || "")];
  if (!snapshot) return match;
  return {
    ...match,
    homeScore: snapshot.homeScore,
    awayScore: snapshot.awayScore,
    resultStatus: snapshot.resultStatus,
  };
};

/** I convocati di una gara: le righe con `convocation_status = convocated`. */
export const convocatedAthleteIds = (participants: readonly MatchEventParticipant[]) =>
  Array.from(
    new Set(
      participants
        .filter((row) => String(row?.convocation_status || "").trim().toLowerCase() === "convocated")
        .map((row) => String(row?.athlete_id || "").trim())
        .filter(Boolean),
    ),
  );

/** Un punteggio scritto in un campo: intero non negativo, o vuoto. */
export const parseScoreInput = (value: string): number | null => {
  const text = value.trim();
  if (!text) return null;
  const n = Math.round(Number(text));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * La gara con colonne e convocazioni, dalla rotta del singolo evento.
 *
 * Passa da `apiRequest` (CLAUDE.md §2): `GET /api/v1/events/:id` restituisce
 * la riga intera — squadra, competizione, avversario, risultato, parziali —
 * e i partecipanti.
 */
export const loadMatchEventDetail = async (eventKey: string): Promise<MatchEventDetail> => {
  const response = await apiRequest<{ row?: MatchEventRow; participants?: MatchEventParticipant[] }>(
    `/api/v1/events/${encodeURIComponent(eventKey)}`,
  );
  if (response.error || !response.data?.row) {
    throw new Error(response.error?.message || "Impossibile leggere la gara");
  }
  return {
    row: response.data.row,
    participants: Array.isArray(response.data.participants) ? response.data.participants : [],
  };
};
