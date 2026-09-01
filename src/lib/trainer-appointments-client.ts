import { apiRequest } from "@/lib/api/client";

/**
 * **Il trasporto degli appuntamenti per l'area allenatore.**
 *
 * Non e un secondo dominio: le rotte sono quelle della segreteria —
 * `/api/v1/appointments`, `/api/v1/appointments/:id`,
 * `/api/v1/appointments/availability` — e il perimetro **non lo dichiara
 * questo file**. `listAppointments` risponde a chi ha soltanto
 * `appointments.read_own` con i soli appuntamenti assegnati, e la restrizione
 * non si accende su un parametro: e la prima cosa che fa. Se questo modulo
 * mandasse `assigned_to=<qualcun altro>` il server lo ignorerebbe.
 *
 * Per questo qui non c'e nessun filtro: aggiungerlo darebbe l'impressione che
 * il confine viva nel browser, ed e proprio l'errore che la Wave 5 ha corretto
 * sugli atleti (D-5, un filtro che si accendeva su `trainer_dashboard=1`).
 *
 * Nessun `fetch` diretto: passa da `apiRequest`, come vuole CLAUDE.md §2.
 */

const unwrap = <T,>(
  response: { data: T | null; error: any },
  fallback: string,
) => {
  if (response?.error) {
    throw new Error(response.error.message || fallback);
  }
  return response?.data ?? null;
};

export type TrainerAppointment = {
  id: string;
  starts_at: string | null;
  ends_at: string | null;
  date: string;
  time: string;
  status: string;
  status_label: string;
  athlete_id: string | null;
  assigned_to_user_id: string | null;
  reason: string;
  title: string;
  notes: string;
  decision_note: string;
  site_id: string | null;
  version: number;
  transitions: string[];
  [key: string]: unknown;
};

export const listTrainerAppointments = async (
  headers: Record<string, string> = {},
) => {
  const response = await apiRequest<TrainerAppointment[]>(
    "/api/v1/appointments",
    { method: "GET", headers },
  );
  return (unwrap(response, "Impossibile leggere gli appuntamenti") ||
    []) as TrainerAppointment[];
};

/**
 * Conferma.
 *
 * Porta la **versione** su cui la decisione e stata presa: due operatori che
 * confermano insieme non si sovrascrivono, il secondo riceve 409 e ricarica.
 * Senza, tornerebbe a essere «vince l'ultimo», che su una conferma vuol dire
 * che una famiglia riceve due orari diversi.
 */
export const confirmTrainerAppointment = async (
  id: string,
  input: { note?: string | null; version?: number | null },
  headers: Record<string, string> = {},
) => {
  const response = await apiRequest<TrainerAppointment>(
    `/api/v1/appointments/${encodeURIComponent(id)}`,
    {
      method: "POST",
      headers,
      body: {
        data: {
          action: "confirm",
          note: input.note ?? null,
          version: input.version ?? null,
        },
      },
    },
  );
  return unwrap(response, "Impossibile confermare l'appuntamento");
};

export const rejectTrainerAppointment = async (
  id: string,
  input: { note?: string | null; version?: number | null },
  headers: Record<string, string> = {},
) => {
  const response = await apiRequest<TrainerAppointment>(
    `/api/v1/appointments/${encodeURIComponent(id)}`,
    {
      method: "POST",
      headers,
      body: {
        data: {
          action: "reject",
          note: input.note ?? null,
          version: input.version ?? null,
        },
      },
    },
  );
  return unwrap(response, "Impossibile rifiutare l'appuntamento");
};

/**
 * Riprogrammazione.
 *
 * Il dominio **non muta la data in luogo**: chiude la riga vecchia e ne crea
 * una nuova collegata. La risposta porta le due righe, e la schermata deve
 * ricaricare — non provare a modificare la riga che aveva in mano, che ora e
 * chiusa.
 */
export const rescheduleTrainerAppointment = async (
  id: string,
  input: {
    date: string;
    time: string;
    note?: string | null;
    version?: number | null;
  },
  headers: Record<string, string> = {},
) => {
  const response = await apiRequest<{
    closed: TrainerAppointment;
    created: TrainerAppointment;
  }>(`/api/v1/appointments/${encodeURIComponent(id)}`, {
    method: "POST",
    headers,
    body: {
      data: {
        action: "reschedule",
        date: input.date,
        time: input.time,
        note: input.note ?? null,
        version: input.version ?? null,
      },
    },
  });
  return unwrap(response, "Impossibile riprogrammare l'appuntamento");
};
