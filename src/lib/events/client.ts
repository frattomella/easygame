import { apiRequest } from "@/lib/api/client";

/**
 * **Il trasporto verso il dominio degli eventi.**
 *
 * Sostituisce `addClubData` / `updateClubDataItem` / `deleteClubDataItem` su
 * `trainings` e `matches`, che leggevano l'intero array del club, lo
 * modificavano e lo riscrivevano: due segretarie che salvavano insieme si
 * sovrascrivevano, e la seconda vinceva in silenzio (ADR-0098).
 *
 * Nessun `fetch` diretto: passa da `apiRequest`, come vuole CLAUDE.md §2.
 */

export type EventKindParam = "training" | "match";

const unwrap = <T,>(response: { data: T | null; error: any }, fallback: string) => {
  if (response.error) {
    throw new Error(response.error.message || fallback);
  }
  return response.data;
};

export const listEvents = async (params: Record<string, string> = {}) => {
  const query = new URLSearchParams(params).toString();
  const response = await apiRequest<any[]>(
    `/api/v1/events${query ? `?${query}` : ""}`,
  );
  return (unwrap(response, "Impossibile leggere il calendario") || []) as any[];
};

export const createEvent = async (kind: EventKindParam, input: any) => {
  const response = await apiRequest<any>("/api/v1/events", {
    method: "POST",
    body: { data: { ...input, kind } },
  });
  return unwrap(response, "Impossibile creare l'evento");
};

/**
 * La modifica, che porta con se la **versione** su cui e stata fatta.
 *
 * Senza, due salvataggi concorrenti tornerebbero a essere «vince l'ultimo». Con
 * la versione il secondo riceve un 409 e ricarica: e la differenza fra perdere
 * il lavoro di qualcuno e chiedergli di rifare l'ultimo gesto.
 */
export const updateEvent = async (
  id: string,
  input: any,
  version?: number | null,
) => {
  const response = await apiRequest<any>(
    `/api/v1/events/${encodeURIComponent(id)}`,
    { method: "PATCH", body: { data: { ...input, version: version ?? null } } },
  );
  return unwrap(response, "Impossibile salvare l'evento");
};

/**
 * Annullare, non cancellare.
 *
 * Un evento a cui qualcuno ha gia risposto o su cui e stato fatto l'appello non
 * si distrugge: si annulla, e la storia resta leggibile. E la stessa regola del
 * denaro — non si cancella, si storna.
 */
export const cancelEvent = (id: string, version?: number | null) =>
  updateEvent(id, { status: "cancelled" }, version);

export const restoreEvent = (id: string, version?: number | null) =>
  updateEvent(id, { status: "scheduled" }, version);

/**
 * Cancella un evento **solo se non ha lasciato una traccia**.
 *
 * La regola la applica il server: un evento con presenze, convocazioni o
 * risposte delle famiglie si annulla, non si cancella. Serve alla
 * rigenerazione del programma settimanale, che ripulisce cio che ha generato e
 * che non ha ancora avuto luogo.
 */
export const deleteEventIfEmpty = async (id: string) => {
  const response = await apiRequest<any>(
    `/api/v1/events/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  return unwrap(response, "Impossibile rimuovere l'evento");
};

export const createEventsBatch = async (
  kind: EventKindParam,
  events: any[],
) => {
  const response = await apiRequest<any[]>("/api/v1/events", {
    method: "POST",
    body: { data: { kind, events } },
  });
  return unwrap(response, "Impossibile generare gli eventi") || [];
};

export const saveEventConvocations = async (
  id: string,
  entries: Array<{
    athleteId: string;
    status?: string;
    isExtraCategory?: boolean;
  }>,
) => {
  const response = await apiRequest<any[]>(
    `/api/v1/events/${encodeURIComponent(id)}/participants`,
    { method: "POST", body: { data: { action: "convoke", entries } } },
  );
  return unwrap(response, "Impossibile salvare le convocazioni") || [];
};

export const saveEventAttendance = async (
  id: string,
  entries: Array<{ athleteId: string; status: string; notes?: string | null }>,
) => {
  const response = await apiRequest<any[]>(
    `/api/v1/events/${encodeURIComponent(id)}/participants`,
    { method: "POST", body: { data: { action: "attendance", entries } } },
  );
  return unwrap(response, "Impossibile salvare l'appello") || [];
};

export const listEventParticipants = async (id: string) => {
  const response = await apiRequest<any[]>(
    `/api/v1/events/${encodeURIComponent(id)}/participants`,
  );
  return unwrap(response, "Impossibile leggere i partecipanti") || [];
};
