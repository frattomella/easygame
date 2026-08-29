/**
 * L'RSVP: **l'intenzione dichiarata dalla famiglia** (G-20, Wave 2 §9).
 *
 * ## L'invariante che questo modulo esiste per proteggere
 *
 * > L'RSVP e un'intenzione dichiarata dalla famiglia. La presenza e un fatto
 * > registrato dall'allenatore. Vivono sulla stessa riga di
 * > `training_attendance` e **non si scrivono mai a vicenda**.
 *
 * Non e una preferenza di modellazione. `src/lib/funding/attendance-measure.ts`
 * legge `training_attendance.status` per rendicontare i contributi pubblici:
 * se un «si» della famiglia scrivesse `status = "present"`, un ente
 * finanziatore riceverebbe come frequenza dimostrata una promessa che nessuno
 * ha verificato. Per questo qui non esiste **nessuna** funzione che traduca un
 * RSVP in una presenza, e il modulo non importa niente dal dominio presenze.
 *
 * ## Perche `maybe` non c'e
 *
 * Il piano di Wave lo cita come possibile («solo se l'evento lo prevede»), ma
 * il perimetro autorizzato per questa lane non lo comprende e il modello dati
 * oggi **non lo distingue**: un «forse» memorizzato che nessuna schermata sa
 * leggere sarebbe un terzo stato invisibile, cioe un dato che mente. Gli stati
 * sono due — `yes` e `no` — piu uno **derivato**, `no_response`, che non si
 * scrive mai perche e semplicemente l'assenza di risposta.
 *
 * Modulo **puro**: niente Prisma, niente rete, niente DOM. Riceve gli eventi e
 * le righe gia lette, non li cerca.
 */

/** Le sole risposte che una famiglia puo dare. */
export type RsvpStatus = "yes" | "no";

/**
 * Lo stato di una famiglia su un evento: la risposta, oppure il silenzio.
 *
 * `no_response` non e un valore in colonna: e cio che resta quando non c'e
 * nessuna riga con `rsvp_status`. Scriverlo significherebbe non poter piu
 * distinguere «non ha risposto» da «una riga esiste per altri motivi».
 */
export type RsvpAnswerState = RsvpStatus | "no_response";

export const RSVP_STATUSES: readonly RsvpStatus[] = ["yes", "no"] as const;

export const RSVP_STATUS_LABELS: Record<RsvpAnswerState, string> = {
  yes: "Ci sara",
  no: "Non ci sara",
  no_response: "Senza risposta",
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const asText = (value: unknown) => String(value ?? "").trim();

const normalizeToken = (value: unknown) => asText(value).toLowerCase();

const firstDefined = (...values: unknown[]) => {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
};

/**
 * Le grafie che valgono «si» e quelle che valgono «no».
 *
 * L'italiano entra nell'elenco perche il payload degli eventi di questo
 * repository e scritto a piu mani e in due lingue (lo fa gia
 * `parent-dashboard.ts` per lo stato di un allenamento). Tutto cio che non e
 * qui dentro **non e una risposta**: enum chiusa, e `null` per il resto.
 */
const YES_TOKENS = new Set(["yes", "si", "sì", "presente", "confermato", "true"]);
const NO_TOKENS = new Set(["no", "assente", "annullato", "disdetto", "false"]);

/**
 * La risposta, oppure `null`.
 *
 * `maybe` / `forse` finiscono deliberatamente in `null`: accettarli
 * significherebbe salvare uno stato che nessuna schermata sa mostrare e che
 * nessun conteggio sa collocare. Meglio rifiutare la risposta che archiviarne
 * una che non si puo leggere.
 */
export const normalizeRsvpStatus = (value: unknown): RsvpStatus | null => {
  const token = normalizeToken(value);
  if (!token) return null;
  if (YES_TOKENS.has(token)) return "yes";
  if (NO_TOKENS.has(token)) return "no";
  return null;
};

const toDateOrNull = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const text = asText(value);
  if (!text) return null;

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
};

export type RsvpAthleteState = {
  athleteId: string;
  state: RsvpAnswerState;
  note: string;
  answeredAt: string | null;
};

export type RsvpSummary = {
  yes: number;
  no: number;
  noResponse: number;
  /** Lo stato di **ogni** atleta atteso, in ordine di elenco atteso. */
  byAthlete: RsvpAthleteState[];
};

/**
 * Tre numeri e un elenco: si, no, senza risposta.
 *
 * **Il denominatore e l'unione, non l'intersezione.** Gli atleti attesi
 * definiscono chi deve rispondere; chi ha risposto entra comunque nel
 * riepilogo anche se non risulta piu atteso — un cambio di categoria dopo
 * l'invito non deve far sparire una risposta gia data, altrimenti
 * l'allenatore chiama un rimpiazzo per qualcuno che aveva confermato.
 *
 * **`no_response` si deriva.** Una riga senza `rsvp_status` — e quella che
 * l'appello crea, o quella creata neutra dalla prima risposta poi ritirata —
 * conta come silenzio, esattamente come nessuna riga.
 */
export const summarizeRsvp = ({
  expectedAthleteIds = [],
  rows = [],
}: {
  expectedAthleteIds?: readonly unknown[];
  rows?: readonly unknown[];
}): RsvpSummary => {
  const answers = new Map<string, { status: RsvpStatus; note: string; at: string | null }>();
  const answeredOrder: string[] = [];

  for (const raw of Array.isArray(rows) ? rows : []) {
    const row = asRecord(raw);
    const athleteId = asText(row.athlete_id ?? row.athleteId);
    if (!athleteId) continue;

    const status = normalizeRsvpStatus(row.rsvp_status ?? row.rsvpStatus);
    if (!status) continue;

    const answeredAt = toDateOrNull(row.rsvp_at ?? row.rsvpAt);
    if (!answers.has(athleteId)) answeredOrder.push(athleteId);
    answers.set(athleteId, {
      status,
      note: asText(row.rsvp_note ?? row.rsvpNote),
      at: answeredAt ? answeredAt.toISOString() : null,
    });
  }

  const universe: string[] = [];
  const seen = new Set<string>();
  for (const value of [
    ...(Array.isArray(expectedAthleteIds) ? expectedAthleteIds : []).map(asText),
    ...answeredOrder,
  ]) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    universe.push(value);
  }

  const byAthlete: RsvpAthleteState[] = universe.map((athleteId) => {
    const answer = answers.get(athleteId);
    return {
      athleteId,
      state: answer ? answer.status : "no_response",
      note: answer?.note || "",
      answeredAt: answer?.at ?? null,
    };
  });

  return {
    yes: byAthlete.filter((entry) => entry.state === "yes").length,
    no: byAthlete.filter((entry) => entry.state === "no").length,
    noResponse: byAthlete.filter((entry) => entry.state === "no_response").length,
    byAthlete,
  };
};

export type RsvpEventConfig = {
  /** L'evento chiede una conferma alla famiglia. */
  required: boolean;
  /** Ultimo istante utile per rispondere, `null` se non c'e scadenza. */
  deadline: Date | null;
  /** La scadenza e passata. Falso quando non c'e scadenza. */
  closed: boolean;
};

/**
 * La configurazione RSVP **dell'evento**, non della risposta.
 *
 * Scadenza e obbligo di conferma stanno sull'allenamento perche riguardano
 * tutti gli invitati: metterli sulla riga di risposta significherebbe poterli
 * avere diversi per due famiglie dello stesso evento.
 *
 * Le grafie tollerate sono piu d'una — `rsvpRequired`, `rsvp_required`,
 * `rsvp: { required }` — per la stessa ragione per cui le tollera
 * `parent-dashboard.ts`: il payload degli allenamenti vive in una colonna JSON
 * scritta da generatore automatico, import e schermate diverse, e nessuna
 * migrazione lo ha mai uniformato.
 */
export const readEventRsvpConfig = (
  event: unknown,
  now: Date = new Date(),
): RsvpEventConfig => {
  const record = asRecord(event);
  const nested = asRecord(record.rsvp);

  const rawRequired = firstDefined(
    record.rsvpRequired,
    record.rsvp_required,
    record.requiresRsvp,
    record.requires_rsvp,
    nested.required,
    nested.enabled,
  );
  const requiredToken = normalizeToken(rawRequired);
  const required =
    rawRequired === true ||
    (requiredToken !== "" &&
      requiredToken !== "false" &&
      requiredToken !== "0" &&
      requiredToken !== "no");

  const deadline = toDateOrNull(
    firstDefined(
      record.rsvpDeadline,
      record.rsvp_deadline,
      record.rsvpDueAt,
      record.rsvp_due_at,
      record.confirmationDeadline,
      record.confirmation_deadline,
      nested.deadline,
      nested.dueAt,
      nested.due_at,
    ),
  );

  return {
    required,
    deadline,
    closed: Boolean(deadline && deadline.getTime() < now.getTime()),
  };
};

export type RsvpDenialReason =
  | "not_required"
  | "event_cancelled"
  | "deadline_passed";

export type RsvpAnswerability = {
  allowed: boolean;
  /** `null` quando si puo rispondere. */
  reason: RsvpDenialReason | null;
  message: string;
};

const DENIAL_MESSAGES: Record<RsvpDenialReason, string> = {
  not_required: "Questo allenamento non chiede una conferma di partecipazione.",
  event_cancelled: "L'allenamento e stato annullato: non serve rispondere.",
  deadline_passed:
    "Il termine per rispondere e scaduto. Avvisa direttamente la societa.",
};

const CANCELLED_TOKENS = new Set(["cancelled", "canceled", "annullato", "annullata"]);

/** Vero se lo stato dichiarato dall'evento e «annullato», in una delle sue grafie. */
export const isCancelledEventStatus = (status: unknown) =>
  CANCELLED_TOKENS.has(normalizeToken(status));

/**
 * Si puo ancora rispondere? E, soprattutto, **perche no**.
 *
 * Il motivo fa parte del risultato perche e cio che la famiglia legge a
 * schermo: un pulsante disabilitato senza spiegazione produce una telefonata
 * in segreteria, che e esattamente il costo che l'RSVP dovrebbe togliere.
 */
export const canAnswerRsvp = ({
  config,
  now = new Date(),
  eventStatus,
}: {
  config: RsvpEventConfig;
  now?: Date;
  eventStatus?: unknown;
}): RsvpAnswerability => {
  const deny = (reason: RsvpDenialReason): RsvpAnswerability => ({
    allowed: false,
    reason,
    message: DENIAL_MESSAGES[reason],
  });

  if (isCancelledEventStatus(eventStatus)) return deny("event_cancelled");
  if (!config.required) return deny("not_required");

  /*
    La scadenza si rivaluta su `now` invece di fidarsi di `config.closed`: la
    configurazione puo essere stata letta all'apertura della pagina e la
    risposta arrivare venti minuti dopo, oltre il termine.
  */
  if (config.deadline && config.deadline.getTime() < now.getTime()) {
    return deny("deadline_passed");
  }

  return { allowed: true, reason: null, message: "" };
};
