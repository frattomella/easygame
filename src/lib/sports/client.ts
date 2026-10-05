import { apiRequest } from "@/lib/api/client";
import type { SeasonLink } from "./teams";

/**
 * Il client dello sport core (ADR-0200 §8): squadre stabili, competizioni,
 * avversari, risultato di una gara. Passa da `apiRequest`, come ogni chiamata
 * del gestionale.
 */

export type ClubTeamDto = {
  id: string;
  name: string;
  shortName: string;
  slug: string;
  previousSlugs: string[];
  sport: string | null;
  description: string;
  photoMediaId: string | null;
  seasonLinks: SeasonLink[];
  sortOrder: number;
  active: boolean;
  version: number;
};

export type StandingsRowDto = {
  position: number;
  team: string;
  isClub: boolean;
  played: number | null;
  won: number | null;
  drawn: number | null;
  lost: number | null;
  pointsFor: number | null;
  pointsAgainst: number | null;
  points: number | null;
};

export type CompetitionDto = {
  id: string;
  name: string;
  shortName: string;
  seasonId: string | null;
  sport: string | null;
  kind: "league" | "cup" | "tournament" | "friendly";
  standings: StandingsRowDto[];
  standingsUpdatedAt: string | null;
  active: boolean;
  version: number;
};

export type OpponentDto = {
  id: string;
  name: string;
  shortName: string;
  city: string;
  logoMediaId: string | null;
  websiteUrl: string | null;
  version: number;
};

export type MatchResultInput = {
  homeScore: number | null;
  awayScore: number | null;
  status: "provisional" | "final";
  periods: Array<{ label?: string; home: number | null; away: number | null }>;
  playerStats?: Array<{ athleteId: string; stats: Record<string, number> }>;
  expectedVersion?: number;
  clear?: boolean;
};

export const sportsApi = {
  teams: () => apiRequest<ClubTeamDto[]>("/api/v1/club-teams"),
  createTeam: (input: Partial<ClubTeamDto>) => apiRequest<ClubTeamDto>("/api/v1/club-teams", { method: "POST", body: input }),
  updateTeam: (id: string, input: Partial<ClubTeamDto> & { expectedVersion?: number }) =>
    apiRequest<ClubTeamDto>(`/api/v1/club-teams/${encodeURIComponent(id)}`, { method: "PATCH", body: input }),
  deleteTeam: (id: string) => apiRequest<{ deleted: boolean }>(`/api/v1/club-teams/${encodeURIComponent(id)}`, { method: "DELETE" }),
  teamsFromCategories: (seasonId?: string) =>
    apiRequest<{ created: number; linked: number; seasonId: string }>("/api/v1/club-teams/from-categories", { method: "POST", body: { seasonId } }),

  competitions: (seasonId?: string) =>
    apiRequest<CompetitionDto[]>(`/api/v1/competitions${seasonId ? `?seasonId=${encodeURIComponent(seasonId)}` : ""}`),
  saveCompetition: (input: Partial<CompetitionDto> & { id?: string; expectedVersion?: number }) => apiRequest<CompetitionDto>("/api/v1/competitions", { method: "POST", body: input }),
  deleteCompetition: (id: string) => apiRequest<{ deleted: boolean }>(`/api/v1/competitions/${encodeURIComponent(id)}`, { method: "DELETE" }),

  opponents: () => apiRequest<OpponentDto[]>("/api/v1/opponents"),
  saveOpponent: (input: Partial<OpponentDto> & { id?: string; expectedVersion?: number }) => apiRequest<OpponentDto>("/api/v1/opponents", { method: "POST", body: input }),
  deleteOpponent: (id: string) => apiRequest<{ deleted: boolean }>(`/api/v1/opponents/${encodeURIComponent(id)}`, { method: "DELETE" }),

  matchStats: (eventId: string) =>
    apiRequest<Array<{ athlete_id: string; stats: Record<string, number> }>>(`/api/v1/events/${encodeURIComponent(eventId)}/result`),
  saveMatchResult: (eventId: string, input: MatchResultInput) =>
    apiRequest<Record<string, unknown>>(`/api/v1/events/${encodeURIComponent(eventId)}/result`, { method: "PUT", body: input }),
  saveMatchSportDetails: (
    eventId: string,
    input: { teamId?: string | null; competitionId?: string | null; opponentId?: string | null; roundLabel?: string | null; expectedVersion?: number },
  ) => apiRequest<Record<string, unknown>>(`/api/v1/events/${encodeURIComponent(eventId)}/sport-details`, { method: "PUT", body: input }),
};
