import { apiRequest } from "@/lib/api/client";
import {
  normalizeAudienceCriteria,
  type AudienceCriterionKind,
} from "@/lib/audience/criteria";

/**
 * **Gli eventi che si possono scegliere come pubblico** (W5-14, ADR-0098).
 *
 * Il motore del pubblico sa risolvere «Convocati a un evento» e «Senza
 * risposta a un evento» dalla Wave 5, ma nessuna schermata caricava gli eventi
 * come opzioni: i due criteri erano dichiarati nel dominio e **non
 * selezionabili da nessuna parte**. Questo modulo e cio che mancava, e sta in
 * un posto solo perche la domanda «quali eventi ha senso offrire» ha una
 * risposta sola: due schermate che la rispondessero separatamente
 * divergerebbero alla prima modifica.
 *
 * Non contiene JSX di proposito: la decisione su **quali** eventi si offrono e
 * su come si chiamano e provabile senza montare una pagina.
 */

export type AudienceOption = { id: string; label: string };

export type SelectableEvent = {
  /**
   * L'identificativo della **riga** `club_events`, non quello storico.
   *
   * E la distinzione che rende il criterio funzionante o silenziosamente
   * vuoto: `toEventLegacyShape` espone `id` come `legacy_id || row.id`, mentre
   * `club_event_participant.event_id` — cioe la colonna su cui
   * `resolveAudience` risolve convocazioni e risposte — punta sempre alla
   * riga. Mandare il `legacy_id` produrrebbe zero destinatari senza nessun
   * errore, che e il modo piu silenzioso di non mandare un messaggio.
   */
  id: string;
  kind: "training" | "match";
  title: string;
  opponent: string;
  categoryName: string;
  startsAt: string;
  rsvpRequired: boolean;
};

/**
 * Quanto avanti si guarda.
 *
 * **Perche una finestra e non l'elenco completo.** Un club con dieci categorie
 * scrive centinaia di eventi a stagione: una tendina che li contiene tutti non
 * e piu una scelta, e una ricerca. E soprattutto sarebbe piena di eventi
 * inutili per questi due criteri, che si usano **prima** di una gara — «ricorda
 * ai convocati» e, la sera prima, «chi devo chiamare». A un allenamento gia
 * giocato non si chiede piu chi viene.
 */
export const EVENT_AUDIENCE_WINDOW_DAYS = 30;

const asText = (value: unknown) => String(value ?? "").trim();

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

/**
 * I criteri che pretendono una selezione, **chiesti al dominio** invece che
 * riscritti qui.
 *
 * Un elenco a mano sarebbe una seconda copia della regola che vive in
 * `normalizeAudienceCriteria`, e la copia resterebbe indietro il giorno in cui
 * nasce un criterio nuovo. La sonda passa un valore finto e guarda se il
 * risultato normalizzato porta con se dei valori: se li porta, la schermata
 * deve far scegliere qualcosa.
 */
export const audienceCriterionNeedsSelection = (
  kind: AudienceCriterionKind,
): boolean => {
  try {
    const [criterio] = normalizeAudienceCriteria([
      { kind, values: ["__sonda__"] },
    ]);
    return Boolean(criterio && "values" in criterio);
  } catch {
    return false;
  }
};

/** I due criteri che hanno un evento come parametro. */
export const EVENT_AUDIENCE_KINDS = [
  "event_convocated",
  "event_no_rsvp",
] as const;

export type EventAudienceKind = (typeof EVENT_AUDIENCE_KINDS)[number];

export const isEventAudienceKind = (
  kind: string,
): kind is EventAudienceKind =>
  (EVENT_AUDIENCE_KINDS as readonly string[]).includes(kind);

/**
 * Da una riga di `/api/v1/events` a un evento scegliibile.
 *
 * La rotta risponde con la forma storica **piu** `row`, che e la riga vera:
 * l'identificativo si prende da li, per la ragione scritta su `SelectableEvent.id`.
 */
export const readSelectableEvent = (record: any): SelectableEvent | null => {
  const id = asText(record?.row?.id) || asText(record?.eventId);
  if (!id) return null;

  const startsAt = asText(record?.startsAt) || asText(record?.row?.starts_at);
  if (!startsAt) return null;

  return {
    id,
    kind: asText(record?.kind) === "match" ? "match" : "training",
    title: asText(record?.title),
    opponent: asText(record?.opponent),
    categoryName: asText(record?.categoryName) || asText(record?.category),
    startsAt,
    rsvpRequired: Boolean(record?.rsvpRequired ?? record?.row?.rsvp_required),
  };
};

const MESI = [
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

/**
 * Quando, prima di cosa.
 *
 * In un elenco cronologico la data e la chiave con cui si cerca — «la gara di
 * domenica» — e mettendola in testa le righe si scorrono con l'occhio invece
 * che leggendole tutte.
 */
const quando = (startsAt: string) => {
  const istante = new Date(startsAt);
  if (Number.isNaN(istante.getTime())) return "";

  const giorno = String(istante.getDate()).padStart(2, "0");
  const ora = String(istante.getHours()).padStart(2, "0");
  const minuti = String(istante.getMinutes()).padStart(2, "0");

  return `${giorno} ${MESI[istante.getMonth()]} ${ora}:${minuti}`;
};

/**
 * Come si chiama un evento in un elenco di destinatari.
 *
 * Un evento puo non avere titolo — il calendario lo consente — e «(senza
 * titolo)» in un elenco di cose a cui mandare un messaggio non aiuta nessuno a
 * scegliere: si ricade sul tipo e sull'avversario, che e cio con cui una
 * segreteria chiama davvero una gara.
 */
export const eventAudienceLabel = (evento: SelectableEvent) => {
  const cosa =
    evento.title ||
    (evento.kind === "match"
      ? evento.opponent
        ? `Gara con ${evento.opponent}`
        : "Gara"
      : "Allenamento");

  const data = quando(evento.startsAt);
  const categoria = evento.categoryName ? ` · ${evento.categoryName}` : "";

  return `${data ? `${data} — ` : ""}${cosa}${categoria}`;
};

/**
 * Le opzioni da mostrare per un criterio di evento.
 *
 * **`event_no_rsvp` offre solo gli eventi con l'RSVP acceso.** Il criterio
 * risolve «convocato e silenzioso»: su un evento che non ha mai chiesto una
 * risposta sono silenziosi *tutti* i convocati, quindi restituirebbe lo stesso
 * insieme di «Convocati a un evento» facendo credere a chi scrive di aver
 * selezionato qualcosa di piu stretto.
 */
export const eventAudienceOptions = (
  events: readonly SelectableEvent[],
  kind: EventAudienceKind,
): AudienceOption[] =>
  events
    .filter((evento) => (kind === "event_no_rsvp" ? evento.rsvpRequired : true))
    .map((evento) => ({ id: evento.id, label: eventAudienceLabel(evento) }));

/**
 * Carica gli eventi scegliibili.
 *
 * **Perche questa strada e non un'altra.** E la stessa `apiRequest` con cui le
 * due schermate caricano gia categorie, gruppi e sedi, e `/api/v1/events` e
 * l'unica porta di lettura del calendario: applica da sola il club attivo e il
 * perimetro dell'allenatore (`listClubEvents`), quindi il pubblico offerto non
 * puo essere piu largo di cio che chi scrive ha il diritto di vedere.
 *
 * Tre filtri, tre ragioni:
 *
 * - `from` a inizio giornata: un evento di stamattina puo ancora avere qualcosa
 *   da dire ai convocati, uno di ieri no;
 * - `to` a {@link EVENT_AUDIENCE_WINDOW_DAYS} giorni: vedi sopra;
 * - `status=scheduled`: a un evento annullato non si chiede piu chi viene, e
 *   avvisare dell'annullamento e cio che fa la rotta di annullamento.
 */
export const loadSelectableEvents = async (
  now: Date = new Date(),
): Promise<SelectableEvent[]> => {
  const da = new Date(now);
  da.setHours(0, 0, 0, 0);

  const a = new Date(da);
  a.setDate(a.getDate() + EVENT_AUDIENCE_WINDOW_DAYS);

  const query = new URLSearchParams({
    from: da.toISOString(),
    to: a.toISOString(),
    status: "scheduled",
  });

  const risposta = await apiRequest<any[]>(`/api/v1/events?${query.toString()}`);
  if (risposta.error) return [];

  return asArray(risposta.data)
    .map((record) => readSelectableEvent(record))
    .filter((evento): evento is SelectableEvent => Boolean(evento));
};
