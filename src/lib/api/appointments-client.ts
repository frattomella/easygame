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
  /** Gli **stati** di arrivo ammessi da questo stato per la segreteria. */
  transitions: string[];
  /**
   * I nomi delle **azioni** che la rotta accetta, gia tradotti (W6-51).
   *
   * Sono due elenchi perche dicono due cose diverse. Confondere il primo
   * per il secondo — `"confirmed"` contro `"confirm"` — e cio che ha tenuto
   * la segreteria senza un pulsante Conferma per tutta la Wave 5.
   */
  actions: string[];
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
 * **La chiusura: concluso, oppure assente.**
 *
 * W6-52. La rotta accetta `complete` e `no-show` da quando esiste, il dominio
 * ha `closeAppointment`, e **questo file non aveva la funzione**: la segreteria
 * non aveva nessun modo di dire che un colloquio era avvenuto, e la coda di
 * lavoro restava piena di appuntamenti confermati di mesi prima. Erano due
 * capability dichiarate complete e irraggiungibili — la forma di CLAUDE.md
 * §11.8.
 *
 * `no_show` non e un giudizio sulla famiglia ed e per questo che la nota
 * finisce in `internal_notes` e non parte nessuna notifica: la constata chi era
 * in segreteria, e resta un fatto interno.
 */
export const closeClubAppointment = async (
  id: string,
  input: {
    outcome: "complete" | "no-show";
    note?: string | null;
    version?: number | null;
  },
  headers: Record<string, string> = {},
) => {
  const response = await apiRequest<ClubAppointment>(
    `/api/v1/appointments/${encodeURIComponent(id)}`,
    {
      method: "POST",
      headers,
      body: {
        data: {
          action: input.outcome,
          note: input.note ?? null,
          version: input.version ?? null,
        },
      },
    },
  );
  return unwrap(
    response,
    input.outcome === "complete"
      ? "Impossibile chiudere l'appuntamento"
      : "Impossibile segnare l'assenza",
  );
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

/* ============================== la disponibilita configurata (W6-53) ===== */

/**
 * **La regola di disponibilita, e perche il suo trasporto sta qui.**
 *
 * Le quattro rotte di `/api/v1/appointment-slots` esistono dalla Wave 5 e
 * **nessun componente le chiamava**: `grep -l appointment-slots` non trovava
 * un solo `.tsx`. La conseguenza non era che mancasse una schermata di
 * comodo — era che *ogni club del prodotto* stava in configurazione di
 * ripiego, cioe che la disponibilita mostrata alle famiglie veniva dedotta
 * dagli orari di apertura: colloqui di trenta minuti, nessun operatore, e la
 * stessa fascia replicata su tutti e sette i giorni della settimana.
 *
 * Il trasporto sta in questo file e non accanto alla pagina per la stessa
 * ragione per cui ci sta quello degli appuntamenti: le rotte sono le stesse,
 * e un secondo client sarebbe l'errore numero uno di CLAUDE.md §11.
 */
export type AppointmentSlotRow = {
  id: string;
  organization_id: string;
  site_id: string | null;
  assigned_to_user_id: string | null;
  weekday: number | null;
  specific_date: string | null;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  valid_from: string | null;
  valid_until: string | null;
  active: boolean;
  notes: string | null;
  [key: string]: unknown;
};

/**
 * I campi che una regola dichiara.
 *
 * Non c'e `capacity`: W6-56 l'ha tolta. L'indice unico parziale che impedisce
 * la doppia prenotazione non conosce la capienza, quindi un valore maggiore di
 * uno prometteva posti che il database rifiutava.
 */
export type AppointmentSlotInputBody = {
  siteId?: string | null;
  assignedToUserId?: string | null;
  weekday?: number | null;
  specificDate?: string | null;
  startTime: string;
  endTime: string;
  durationMinutes?: number | null;
  validFrom?: string | null;
  validUntil?: string | null;
  active?: boolean;
  notes?: string | null;
};

const corpoSlot = (input: AppointmentSlotInputBody) => ({
  site_id: input.siteId ?? null,
  assigned_to: input.assignedToUserId ?? null,
  weekday: input.weekday ?? null,
  specific_date: input.specificDate ?? null,
  start_time: input.startTime,
  end_time: input.endTime,
  duration_minutes: input.durationMinutes ?? null,
  valid_from: input.validFrom ?? null,
  valid_until: input.validUntil ?? null,
  active: input.active ?? true,
  notes: input.notes ?? null,
});

export const listAppointmentSlots = async (
  headers: Record<string, string> = {},
) => {
  const response = await apiRequest<AppointmentSlotRow[]>(
    "/api/v1/appointment-slots",
    { method: "GET", headers },
  );
  return (unwrap(response, "Impossibile leggere la disponibilita configurata") ||
    []) as AppointmentSlotRow[];
};

export const createAppointmentSlot = async (
  input: AppointmentSlotInputBody,
  headers: Record<string, string> = {},
) => {
  const response = await apiRequest<AppointmentSlotRow>(
    "/api/v1/appointment-slots",
    { method: "POST", headers, body: { data: corpoSlot(input) } },
  );
  return unwrap(response, "Impossibile creare la fascia di ricevimento");
};

export const updateAppointmentSlot = async (
  id: string,
  input: AppointmentSlotInputBody,
  headers: Record<string, string> = {},
) => {
  const response = await apiRequest<AppointmentSlotRow>(
    `/api/v1/appointment-slots/${encodeURIComponent(id)}`,
    { method: "PATCH", headers, body: { data: corpoSlot(input) } },
  );
  return unwrap(response, "Impossibile modificare la fascia di ricevimento");
};

/**
 * La rimozione.
 *
 * **Non** cancella gli appuntamenti gia presi su quella fascia: la chiave
 * esterna e `SET NULL`, e chi ha un colloquio in agenda non lo perde perche la
 * segreteria ha cambiato orario di ricevimento. Per smettere di proporre una
 * fascia senza toglierla dalla storia basta disattivarla.
 */
export const deleteAppointmentSlot = async (
  id: string,
  headers: Record<string, string> = {},
) => {
  const response = await apiRequest<{ id: string }>(
    `/api/v1/appointment-slots/${encodeURIComponent(id)}`,
    { method: "DELETE", headers },
  );
  return unwrap(response, "Impossibile rimuovere la fascia di ricevimento");
};
