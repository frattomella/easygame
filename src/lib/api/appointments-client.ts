import { apiRequest } from "@/lib/api/client";

/**
 * **Il trasporto degli appuntamenti, per ogni schermata che li tocca.**
 *
 * Nasceva come client della sola area allenatore
 * (`src/lib/trainer-appointments-client.ts`), e il nome era un incidente in
 * attesa di succedere: quando la segreteria ha dovuto leggere gli stessi
 * appuntamenti, la strada piu breve era scriverne un secondo — che e l'errore
 * numero uno di CLAUDE.md §11, gia commesso su toast, storage mobile e
 * dashboard allenatore. Le rotte sono le stesse, i verbi sono gli stessi, la
 * versione ottimistica e la stessa: e un trasporto solo.
 *
 * Il perimetro **non lo dichiara questo file**. `listAppointments` risponde a chi ha soltanto
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

export type ClubAppointment = {
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

export const listClubAppointments = async (
  headers: Record<string, string> = {},
) => {
  const response = await apiRequest<ClubAppointment[]>(
    "/api/v1/appointments",
    { method: "GET", headers },
  );
  return (unwrap(response, "Impossibile leggere gli appuntamenti") ||
    []) as ClubAppointment[];
};

/**
 * Conferma.
 *
 * Porta la **versione** su cui la decisione e stata presa: due operatori che
 * confermano insieme non si sovrascrivono, il secondo riceve 409 e ricarica.
 * Senza, tornerebbe a essere «vince l'ultimo», che su una conferma vuol dire
 * che una famiglia riceve due orari diversi.
 */
export const confirmClubAppointment = async (
  id: string,
  input: { note?: string | null; version?: number | null },
  headers: Record<string, string> = {},
) => {
  const response = await apiRequest<ClubAppointment>(
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

export const rejectClubAppointment = async (
  id: string,
  input: { note?: string | null; version?: number | null },
  headers: Record<string, string> = {},
) => {
  const response = await apiRequest<ClubAppointment>(
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
export const rescheduleClubAppointment = async (
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
    closed: ClubAppointment;
    created: ClubAppointment;
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

/**
 * Annullamento da parte del club.
 *
 * **Non e una cancellazione**, ed e la differenza che il difetto D-1 ha reso
 * cara: la segreteria cancellava le richieste delle famiglie e non restava
 * niente — ne la richiesta, ne il motivo, ne il fatto che qualcuno l'avesse
 * mai chiesta. Qui la riga resta e cambia stato, la famiglia legge
 * `cancelled_by_club` e il motivo, e l'audit conserva chi ha deciso.
 */
export const cancelClubAppointment = async (
  id: string,
  input: { note?: string | null; version?: number | null },
  headers: Record<string, string> = {},
) => {
  const response = await apiRequest<ClubAppointment>(
    `/api/v1/appointments/${encodeURIComponent(id)}`,
    {
      method: "POST",
      headers,
      body: {
        data: {
          action: "cancel",
          note: input.note ?? null,
          version: input.version ?? null,
        },
      },
    },
  );
  return unwrap(response, "Impossibile annullare l'appuntamento");
};

/**
 * L'appuntamento messo in agenda **dallo sportello**.
 *
 * `outsideAvailability` e il colloquio preso al telefono: senza, la chiamata
 * cadrebbe sulla disponibilita configurata, che vale per chi prenota da casa e
 * non per chi sta parlando con la segretaria. Chiede `appointments.manage`, e
 * il server lo verifica — questo campo non e un modo di aggirare la
 * disponibilita, e il modo di dichiarare che la si sta scavalcando **con il
 * permesso di farlo**, e resta scritto nell'audit.
 */
export const createClubAppointment = async (
  input: {
    athleteId?: string | null;
    date: string;
    time: string;
    reason: string;
    notes?: string | null;
    internalNotes?: string | null;
    siteId?: string | null;
    assignedToUserId?: string | null;
    outsideAvailability?: boolean;
    idempotencyKey?: string | null;
  },
  headers: Record<string, string> = {},
) => {
  const response = await apiRequest<ClubAppointment>("/api/v1/appointments", {
    method: "POST",
    headers,
    body: { data: input },
  });
  return unwrap(response, "Impossibile creare l'appuntamento");
};
