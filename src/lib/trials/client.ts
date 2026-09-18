import { apiRequest } from "@/lib/api/client";
import { clearCache } from "@/lib/supabase";

/**
 * Il trasporto client delle persone in prova (ADR-0188): le rotte
 * `/api/v1/trial-athletes*` e `/api/v1/events/:id/trial-attendance`, e
 * nient'altro. Nessun `fetch` diretto dai componenti (CLAUDE.md §2).
 */

export type TrialStatus = "in_trial" | "enrolled" | "declined";

export type TrialAthlete = {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  /** `null` se la persona non l'ha lasciata (ADR-0198 §4). */
  birthDate: string | null;
  status: TrialStatus;
  categoryId: string | null;
  categoryName: string | null;
  categoryLabel: string | null;
  groupId: string | null;
  siteId: string | null;
  siteName: string | null;
  phone?: string | null;
  email?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  notes: string | null;
  athleteId: string | null;
  convertedAt: string | null;
  declinedAt: string | null;
  createdAt: string;
  updatedAt: string;
  trialsCount: number;
  firstTrialAt: string | null;
  lastTrialAt: string | null;
};

export type TrialAttendanceRow = {
  id: string;
  eventId: string;
  status: string;
  notes: string | null;
  recordedAt: string;
  event: {
    id: string;
    kind: string;
    title: string | null;
    startsAt: string;
    endsAt: string | null;
    seasonId: string | null;
    siteId: string | null;
    categoryId: string | null;
    categoryName: string | null;
    categoryLabel: string | null;
    groupIds: string[];
    location: string | null;
    status: string;
  };
};

export type TrialAthleteInput = {
  firstName?: string;
  lastName?: string;
  birthDate?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  groupId?: string | null;
  siteId?: string | null;
  phone?: string | null;
  email?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  notes?: string | null;
};

export type AthleteCandidate = {
  id: string;
  name: string;
  birthDate: string | null;
  status: string;
  categoryLabel: string | null;
  match: "exact" | "name";
};

export type EventTrialAttendanceRow = {
  trial: TrialAthlete;
  attendance: { id: string; status: string; notes: string | null; recordedAt: string } | null;
};

const unwrap = <T>(response: { data: T | null; error: { message?: string } | null }, fallback: string): T => {
  if (response.error) throw new Error(response.error.message || fallback);
  return response.data as T;
};

export const listTrialAthletes = async (filters: { status?: string | null; q?: string | null; categoryId?: string | null } = {}) => {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.q) params.set("q", filters.q);
  if (filters.categoryId) params.set("categoryId", filters.categoryId);
  const query = params.toString();
  const response = await apiRequest<TrialAthlete[]>(`/api/v1/trial-athletes${query ? `?${query}` : ""}`);
  return unwrap(response, "Impossibile leggere le persone in prova") || [];
};

export const searchTrialAthletes = async (q: string, birthDate?: string | null) => {
  const params = new URLSearchParams({ q });
  if (birthDate) params.set("birthDate", birthDate);
  const response = await apiRequest<TrialAthlete[]>(`/api/v1/trial-athletes?${params.toString()}`);
  return unwrap(response, "Impossibile cercare le persone in prova") || [];
};

export const createTrialAthlete = async (input: TrialAthleteInput) => {
  const response = await apiRequest<TrialAthlete>("/api/v1/trial-athletes", { method: "POST", body: { data: input } });
  return unwrap(response, "Impossibile registrare la persona in prova");
};

export const readTrialAthlete = async (id: string) => {
  const response = await apiRequest<{ trial: TrialAthlete; attendances: TrialAttendanceRow[] }>(
    `/api/v1/trial-athletes/${encodeURIComponent(id)}`,
  );
  return unwrap(response, "Impossibile leggere la persona in prova");
};

export const updateTrialAthlete = async (id: string, input: TrialAthleteInput) => {
  const response = await apiRequest<TrialAthlete>(`/api/v1/trial-athletes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: { data: input },
  });
  return unwrap(response, "Impossibile aggiornare la persona in prova");
};

export const setTrialAthleteStatus = async (id: string, status: "in_trial" | "declined") => {
  const response = await apiRequest<TrialAthlete>(`/api/v1/trial-athletes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: { data: { status } },
  });
  return unwrap(response, "Impossibile cambiare lo stato");
};

export const findAthleteCandidates = async (id: string) => {
  const response = await apiRequest<AthleteCandidate[]>(`/api/v1/trial-athletes/${encodeURIComponent(id)}/convert`);
  return unwrap(response, "Impossibile cercare le schede esistenti") || [];
};

export const convertTrialAthlete = async (
  id: string,
  input: { athleteId?: string; create?: { status?: string; categoryId?: string | null; siteId?: string | null; birthDate?: string | null } },
) => {
  const response = await apiRequest<{ trial: TrialAthlete; athleteId: string; created: boolean }>(
    `/api/v1/trial-athletes/${encodeURIComponent(id)}/convert`,
    { method: "POST", body: { data: input } },
  );
  return unwrap(response, "Impossibile convertire in atleta");
};

export type TrialHomonym = {
  kind: "trial" | "athlete";
  id: string;
  name: string;
  birthDate: string | null;
  status: string;
  categoryLabel: string | null;
  match: "exact" | "name";
};

export type TrialHomonymsResult = { trials: TrialHomonym[]; athletes: TrialHomonym[]; athletesSearched: boolean };

/**
 * Gli omonimi in tutto il club — persone in prova e schede atleta di ogni
 * stagione (ADR-0198 §5). Si mostrano, non si fondono.
 */
export const findTrialHomonyms = async (query: { firstName: string; lastName: string; birthDate?: string | null }) => {
  const params = new URLSearchParams({ firstName: query.firstName, lastName: query.lastName });
  if (query.birthDate) params.set("birthDate", query.birthDate);
  const response = await apiRequest<TrialHomonymsResult>(`/api/v1/trial-athletes/homonyms?${params.toString()}`);
  return unwrap(response, "Impossibile cercare gli omonimi") || { trials: [], athletes: [], athletesSearched: false };
};

export const listEventTrialAttendance = async (eventId: string) => {
  const response = await apiRequest<EventTrialAttendanceRow[]>(
    `/api/v1/events/${encodeURIComponent(eventId)}/trial-attendance`,
  );
  return unwrap(response, "Impossibile leggere le presenze di prova") || [];
};

export const saveEventTrialAttendance = async (
  eventId: string,
  entries: Array<{ trialAthleteId: string; status: "present" | "absent" | null; notes?: string | null }>,
) => {
  const response = await apiRequest<EventTrialAttendanceRow[]>(
    `/api/v1/events/${encodeURIComponent(eventId)}/trial-attendance`,
    { method: "POST", body: { data: { entries } } },
  );
  /* Le persone in prova contano nel numeratore della Dashboard (ADR-0198 §6): la cache di oggi non vale piu. */
  clearCache("trainings-");
  return unwrap(response, "Impossibile salvare le presenze di prova") || [];
};
