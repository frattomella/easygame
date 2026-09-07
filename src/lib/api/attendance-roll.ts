import { apiRequest } from "@/lib/api/client";

/**
 * **L'appello gia preso, riletto dalla tabella che lo tiene** (P0-5).
 *
 * Il registro presenze scrive su `club_event_participants` — lo scrittore e
 * uno, `saveEventAttendance` (ADR-0099) — e **nessuna schermata lo rileggeva**.
 * Le due che aprono il registro cercavano `training.attendance`, un array che
 * la rotta del calendario non ha mai restituito: si segnavano tre presenti su
 * sedici, si salvava, e riaprendo il registro erano di nuovo tutti assenti. La
 * seconda passata cancellava la prima.
 *
 * Sta qui e non in due copie perche le schermate sono due — la pagina
 * Allenamenti del club e la bacheca dell'allenatore — e una sola delle due
 * corretta sarebbe stato il difetto di prima con meta della sua superficie.
 *
 * Non e un confine: la rotta filtra sul perimetro di chi chiede, e questa
 * funzione legge cio che le risponde.
 */

export type VoceDiAppello = {
  present: boolean;
  notes: string;
  /** `true` se dell'atleta esiste una riga di appello, comunque sia andata. */
  registrata: boolean;
};

const PRESENTI = new Set(["present", "presente", "attended"]);

const testo = (valore: unknown) => String(valore ?? "").trim();

/**
 * Le righe grezze di appello di un evento, come le tiene l'archivio.
 *
 * Le serve chi le sa gia leggere — `normalizeTrainingAttendanceEntries` legge
 * `athlete_id`/`status`/`notes` insieme alle grafie del payload storico — e
 * non deve ricostruirle in una seconda forma.
 */
export const leggiRigheDiAppello = async (
  eventId: string,
  clubId: string,
): Promise<any[]> => {
  const evento = testo(eventId);
  const club = testo(clubId);
  if (!evento || !club) return [];

  const risposta = await apiRequest<any[]>(
    `/api/v1/events/${encodeURIComponent(evento)}/participants`,
    { method: "GET", headers: { "x-active-club-id": club } },
  );

  return Array.isArray((risposta as any)?.data)
    ? (risposta as any).data
    : Array.isArray(risposta)
      ? risposta
      : [];
};

/**
 * Le stesse righe indicizzate per atleta, per chi vuole solo «presente o no».
 *
 * Un evento senza appello risponde una mappa vuota, che e la stessa cosa che
 * rispondeva prima: chi apre il registro trova le caselle da spuntare.
 */
export const leggiAppelloDellEvento = async (
  eventId: string,
  clubId: string,
): Promise<Map<string, VoceDiAppello>> => {
  const mappa = new Map<string, VoceDiAppello>();
  const righe = await leggiRigheDiAppello(eventId, clubId);

  for (const riga of righe) {
    const atleta = testo(riga?.athlete_id || riga?.athleteId);
    /*
      Una riga di sola convocazione non e un appello: `status` nullo significa
      «convocato, non ancora registrato». Sono due colonne con due scrittori,
      e confonderle farebbe risultare fatto un appello mai preso.
    */
    const stato = testo(riga?.status).toLowerCase();
    if (!atleta || !stato) continue;

    mappa.set(atleta, {
      present: PRESENTI.has(stato),
      notes: testo(riga?.notes),
      registrata: true,
    });
  }

  return mappa;
};
