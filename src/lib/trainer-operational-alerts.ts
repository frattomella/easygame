import { recordMatchesCategory } from "@/lib/trainer-dashboard-helpers";
import { getConvocatedAthleteIdsFromMatch } from "@/lib/match-certificate-warnings";

export type TrainingAttendanceState = "complete" | "partial" | "missing";

export type MatchConvocationState =
  | "convocations_complete"
  | "convocations_missing"
  | "not_due_yet"
  | "past_match";

export type TrainerOperationalAlert = {
  key: string;
  type: "missing_attendance" | "missing_convocations";
  title: string;
  message: string;
  recordId: string;
  actionHref: string;
};

/**
 * I due soli tipi di notifica che questo calcolo produce.
 *
 * Sta qui e non nella rotta perche adesso l'elenco serve a **due** cose: dire
 * cosa si scrive, e dire cosa si va a rileggere per spegnerlo. Quando erano
 * due elenchi, uno dei due poteva restare indietro e un avviso risolto non si
 * sarebbe mai chiuso.
 */
export const TRAINER_OPERATIONAL_ALERT_TYPES = [
  "missing_attendance",
  "missing_convocations",
] as const;

/**
 * **Il default EasyGame della scadenza convocazioni: 4 giorni.** Vale quando
 * il club non ha mai scelto (chiave assente o non numerica) e per ogni club
 * nuovo; un valore gia scritto — anche 2, anche 0 — si conserva com'e. Chi
 * legge il valore passa **solo** da `getMatchConvocationDeadlineDays`: un
 * secondo default scritto altrove sarebbe due prodotti.
 */
export const DEFAULT_MATCH_CONVOCATION_DEADLINE_DAYS = 4;
export const MATCH_CONVOCATION_DEADLINE_RANGE = Object.freeze({ min: 0, max: 30 });

const normalizeValue = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const PRESENT_STATUSES = new Set(["present", "presente", "yes", "true"]);
const RECORDED_ABSENCE_STATUSES = new Set([
  "absent",
  "assente",
  "justified",
  "giustificato",
  "late",
  "ritardo",
  "delayed",
]);
const CANCELLED_STATUSES = new Set(["cancelled", "annullato", "annullata"]);
const COMPLETED_STATUSES = new Set([
  "completed",
  "complete",
  "concluded",
  "concluso",
  "conclusa",
]);

export const getMatchConvocationDeadlineDays = (settings: any) => {
  const rawValue =
    settings?.matchConvocationDeadlineDays ??
    settings?.match_convocation_deadline_days ??
    settings?.matches?.convocationDeadlineDays ??
    settings?.matches?.matchConvocationDeadlineDays;
  const parsedValue = Number(rawValue);

  if (!Number.isFinite(parsedValue) || parsedValue < MATCH_CONVOCATION_DEADLINE_RANGE.min) {
    return DEFAULT_MATCH_CONVOCATION_DEADLINE_DAYS;
  }

  return Math.min(Math.round(parsedValue), MATCH_CONVOCATION_DEADLINE_RANGE.max);
};

export const getTrainerRecordAthletes = ({
  record,
  assignedAthletes,
  assignedCategories,
  categories,
}: {
  record: any;
  assignedAthletes: any[];
  assignedCategories: any[];
  categories: any[];
}) => {
  const recordCategories = assignedCategories.filter((category) =>
    recordMatchesCategory(record, category, categories),
  );

  if (recordCategories.length === 0) {
    return [];
  }

  return assignedAthletes.filter((athlete) =>
    recordCategories.some((category) =>
      recordMatchesCategory(athlete, category, categories),
    ),
  );
};

const getAttendanceAthleteId = (entry: any) =>
  String(entry?.athleteId || entry?.athlete_id || entry?.id || "").trim();

const isAttendanceEntryRecorded = (entry: any) => {
  const normalizedStatus = normalizeValue(entry?.status);

  return (
    Boolean(getAttendanceAthleteId(entry)) &&
    (normalizedStatus
      ? PRESENT_STATUSES.has(normalizedStatus) ||
        RECORDED_ABSENCE_STATUSES.has(normalizedStatus)
      : typeof entry?.present === "boolean")
  );
};

/**
 * **Dove sta l'appello di un evento**, e c'e una risposta sola (P0-5).
 *
 * Puo arrivare in due forme, e nessuna delle due e sempre disponibile:
 *
 *   * l'**elenco** riga per riga, che ha chi ha appena aperto il registro o
 *     lo ha appena salvato. E la forma piu precisa — si puo restringere agli
 *     atleti che si stanno guardando — ma la rotta del calendario non l'ha
 *     mai portata;
 *   * i **due numeri** che la rotta del calendario adesso manda per ogni
 *     evento: quanti registrati e quanti presenti.
 *
 * Vive qui perche i lettori sono tre — questo modulo, la scheda della pagina
 * Allenamenti e il suo riepilogo — e tre risposte diverse alla stessa domanda
 * sono il modo in cui una schermata dice «Presenze salvate» e quella accanto
 * «Presenze mancanti» sullo stesso allenamento.
 */
export const readRecordedAttendance = (training: any) => {
  const elenco = Array.isArray(training?.attendance) ? training.attendance : [];

  if (elenco.length) {
    return {
      /** Vero se la risposta viene dall'elenco, cioe dalla forma precisa. */
      dallElenco: true,
      recorded: elenco.filter((voce: any) => isAttendanceEntryRecorded(voce))
        .length,
      present: elenco.filter(
        (voce: any) =>
          voce?.present === true ||
          PRESENT_STATUSES.has(normalizeValue(voce?.status)),
      ).length,
    };
  }

  const registrati = Number(
    training?.attendance_recorded ?? training?.attendanceRecorded,
  );
  const presenti = Number(
    training?.attendance_present ?? training?.attendancePresent,
  );

  return {
    dallElenco: false,
    recorded: Number.isFinite(registrati) ? registrati : 0,
    present: Number.isFinite(presenti) ? presenti : 0,
  };
};

export const getTrainingAttendanceStatus = (
  training: any,
  athletes: any[],
) => {
  const allowedAthleteIds = new Set(
    (Array.isArray(athletes) ? athletes : [])
      .map((athlete) => String(athlete?.id || "").trim())
      .filter(Boolean),
  );
  const attendanceEntries = Array.isArray(training?.attendance)
    ? training.attendance
    : [];
  const recordedAthleteIds = new Set<string>();
  /*
    **Una riga di presenza e un fatto dell'evento, non dell'elenco di oggi**
    (ADR-0194 §19). L'elenco arriva dall'appartenenza corrente; chi ha
    cambiato categoria dopo l'allenamento ha una riga e non e nell'elenco.
    Scartarla faceva dire «presenze mancanti» a un appello completo, e
    toglieva una presenza a chi c'era. La riga conta, e chi la porta entra nel
    totale di quell'evento.
  */
  const fuoriElenco = new Set<string>();
  let present = 0;

  for (const entry of attendanceEntries) {
    const athleteId = getAttendanceAthleteId(entry);
    if (!athleteId) continue;
    if (!isAttendanceEntryRecorded(entry)) {
      continue;
    }
    if (allowedAthleteIds.size > 0 && !allowedAthleteIds.has(athleteId)) {
      fuoriElenco.add(athleteId);
    }

    recordedAthleteIds.add(athleteId);

    const status = normalizeValue(entry?.status);
    if (entry?.present === true || PRESENT_STATUSES.has(status)) {
      present += 1;
    }
  }

  /*
    **Il riepilogo che arriva dal server, quando l'elenco non c'e** (P0-5).

    Senza questa ricaduta ogni scheda diceva «0/16 · Presenze mancanti» anche
    dopo aver salvato l'appello, e la bacheca chiedeva di completare cio che
    era gia completo: la lettura non trovava mai `training.attendance`, che
    nessuna rotta ha mai restituito.

    L'elenco, quando c'e, **vince**: sopra e gia stato ristretto agli atleti
    che si stanno guardando, mentre il numero e quello dell'evento intero. Due
    letture della stessa cosa, e la piu precisa comanda.
  */
  const total = (Array.isArray(athletes) ? athletes.length : 0) + fuoriElenco.size;
  const dalServer = readRecordedAttendance(training);
  const senzaElenco = !dalServer.dallElenco && dalServer.recorded > 0;

  const registered = senzaElenco
    ? Math.min(dalServer.recorded, total || dalServer.recorded)
    : recordedAthleteIds.size;
  if (senzaElenco) present = dalServer.present;

  const state: TrainingAttendanceState =
    total === 0
      ? "complete"
      : registered >= total
      ? "complete"
      : registered > 0
        ? "partial"
        : "missing";

  return {
    state,
    total,
    present,
    registered,
    missing: Math.max(total - registered, 0),
  };
};

export const isTrainingConcluded = (training: any, now = new Date()) => {
  const status = normalizeValue(training?.status);

  if (CANCELLED_STATUSES.has(status)) {
    return false;
  }

  if (COMPLETED_STATUSES.has(status)) {
    return true;
  }

  const endDate = training?.endsAt || training?.startsAt;
  if (!endDate) {
    return false;
  }

  const parsedEndDate = new Date(endDate);
  return !Number.isNaN(parsedEndDate.getTime()) && parsedEndDate < now;
};

export const isTrainingMissingAttendance = (
  training: any,
  athletes: any[],
  now = new Date(),
) => {
  if (!isTrainingConcluded(training, now)) {
    return false;
  }

  const attendanceStatus = getTrainingAttendanceStatus(training, athletes);
  return attendanceStatus.state !== "complete";
};

export const getTrainingAttendanceLabel = (
  state: TrainingAttendanceState,
) => {
  if (state === "complete") {
    return "Presenze complete";
  }

  if (state === "partial") {
    return "Presenze parziali";
  }

  return "Presenze mancanti";
};

export const getConvocatedAthleteIds = (match: any) => {
  return getConvocatedAthleteIdsFromMatch(match);
};

/**
 * **Quante convocazioni ha questa gara** (P0-6, `D-AUD-9`).
 *
 * La convocazione e una colonna di `club_event_participants`
 * (`convocation_status`) con il suo scrittore, `saveEventConvocations`
 * (ADR-0099). Qui pero si contava `getConvocatedAthleteIds`, che cerca **dieci
 * grafie diverse dentro il payload della gara** — `convocatedAthletes`,
 * `calledAthletes`, `selectedAthleteIds`… — e nessuna di quelle la scrive piu
 * nessuno.
 *
 * L'effetto, misurato a schermo: si convocano undici atleti su sedici, si
 * salva, e la scheda continua a dire «0/16». La rosa c'era, in archivio, e la
 * schermata da cui era stata fatta non la sapeva dire — ed e la stessa forma
 * di difetto del registro presenze (P0-5), sulla colonna accanto.
 *
 * Il conteggio del server **vince**, perche legge la colonna giusta. Il
 * payload resta il ripiego di una riga che il server non ha ancora contato.
 */
const readConvocatedCount = (match: any) => {
  const dalServer = Number(
    match?.convocated_count ?? match?.convocatedCount,
  );
  if (Number.isFinite(dalServer)) return dalServer;

  return getConvocatedAthleteIds(match).length;
};

export const getMatchConvocationStatus = ({
  match,
  totalAthletes,
  deadlineDays,
  now = new Date(),
}: {
  match: any;
  totalAthletes: number;
  deadlineDays: number;
  now?: Date;
}) => {
  const status = normalizeValue(match?.status);
  const convocated = readConvocatedCount(match);
  const startsAt = match?.startsAt ? new Date(match.startsAt) : null;

  if (CANCELLED_STATUSES.has(status)) {
    return {
      state: "convocations_complete" as MatchConvocationState,
      convocated,
      total: totalAthletes,
      daysUntilMatch: null as number | null,
    };
  }

  if (convocated > 0) {
    return {
      state: "convocations_complete" as MatchConvocationState,
      convocated,
      total: totalAthletes,
      daysUntilMatch: startsAt
        ? Math.ceil((startsAt.getTime() - now.getTime()) / 86_400_000)
        : null,
    };
  }

  if (!startsAt || Number.isNaN(startsAt.getTime()) || startsAt < now) {
    return {
      state: "past_match" as MatchConvocationState,
      convocated,
      total: totalAthletes,
      daysUntilMatch: null,
    };
  }

  const daysUntilMatch = Math.ceil(
    (startsAt.getTime() - now.getTime()) / 86_400_000,
  );

  return {
    state:
      daysUntilMatch <= deadlineDays
        ? ("convocations_missing" as MatchConvocationState)
        : ("not_due_yet" as MatchConvocationState),
    convocated,
    total: totalAthletes,
    daysUntilMatch,
  };
};

export const getMatchConvocationLabel = (state: MatchConvocationState) => {
  if (state === "convocations_complete") {
    return "Convocazioni complete";
  }

  if (state === "convocations_missing") {
    return "Convocazioni mancanti";
  }

  if (state === "not_due_yet") {
    return "Non ancora in scadenza";
  }

  return "Non registrato";
};

const MATCH_DAY_PHRASES = [
  "Oggi si scende in campo. Testa alta e squadra unita ⚽",
  "Giorno gara: concentrazione, energia e cuore 🔥",
  "È il momento di dare tutto. Forza squadra 💪",
  "Ogni partita è un'occasione per crescere ⚽",
];

export const getMatchDayPhrase = (match: any) => {
  const seed = String(match?.id || match?.date || match?.title || "gara");
  const index =
    seed.split("").reduce((total, char) => total + char.charCodeAt(0), 0) %
    MATCH_DAY_PHRASES.length;

  return MATCH_DAY_PHRASES[index];
};

export type EventParticipationRow = {
  athlete_id?: unknown;
  athleteId?: unknown;
  status?: unknown;
  notes?: unknown;
  convocation_status?: unknown;
  convocationStatus?: unknown;
};

/**
 * Le righe di partecipazione riportate sulla forma storica dell'evento.
 *
 * **Perche serve, e perche e qui.** Le funzioni sopra leggono `attendance` e
 * i convocati dal payload dell'evento, cioe dalla forma che il browser ha
 * sempre avuto. Sul server la verita non e quella: sono le righe di
 * `club_event_participants` — tre colonne, tre scrittori (ADR-0099) — e il
 * payload ne conserva una copia che puo essere rimasta indietro.
 *
 * Questa proiezione **sovrascrive** la copia con le righe, cosi che la stessa
 * regola, chiamata dal server e chiamata dal browser, risponda la stessa cosa.
 * E l'alternativa a scrivere una seconda volta le regole di «presenza
 * mancante» e «convocazione mancante» in forma SQL, che e esattamente il modo
 * in cui due verita sullo stesso appello sono gia nate una volta.
 *
 * `pending` non e una presenza: e lo stato delle righe **nate da una risposta
 * della famiglia** e mai passate dall'appello. Esce dalla proiezione con quel
 * nome, e `isAttendanceEntryRecorded` la scarta — che e cio che deve fare, se
 * no una promessa varrebbe un appello.
 */
export const attachEventParticipation = <T extends Record<string, any>>(
  event: T,
  rows: readonly EventParticipationRow[],
) => {
  const entries = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      athleteId: String(row?.athlete_id ?? row?.athleteId ?? "").trim(),
      status: String(row?.status ?? "").trim(),
      notes: String(row?.notes ?? "").trim(),
      convocationStatus: String(
        row?.convocation_status ?? row?.convocationStatus ?? "",
      ).trim(),
    }))
    .filter((entry) => entry.athleteId);

  /*
    **Le dieci grafie storiche della convocazione vengono azzerate.**

    `getConvocatedAthleteIdsFromMatch` legge l'unione di quattordici chiavi:
    lasciarne anche una sola piena vorrebbe dire che una convocazione
    cancellata dalle righe continua a comparire come fatta, e l'avviso
    «convocazioni mancanti» non si accende mai su una gara che ne ha bisogno.
    Sovrascrivere solo `convocatedAthleteIds` non basta: l'unione le somma.
  */
  const grafieStoriche = Object.fromEntries(
    [
      "convocations",
      "convocationEntries",
      "convocation_entries",
      "convocatedAthleteIds",
      "convocated_athlete_ids",
      "convocatedAthletes",
      "convocated_athletes",
      "calledAthletes",
      "called_athletes",
      "selectedAthletes",
      "selected_athletes",
      "selectedAthleteIds",
      "selected_athlete_ids",
      "participants",
    ].map((chiave) => [chiave, []]),
  );

  return {
    ...event,
    ...grafieStoriche,
    payload: undefined,
    data: undefined,
    attendance: entries.map((entry) => ({
      athleteId: entry.athleteId,
      status: entry.status,
      notes: entry.notes,
    })),
    /*
      `convocated` e l'unico stato che conta come convocazione: `excluded` e
      una decisione presa — «non giochi» — e `null` significa che nessuno ha
      deciso. Contarli insieme direbbe «convocazioni fatte» a una gara in cui
      l'allenatore ha soltanto escluso qualcuno.
    */
    convocatedAthleteIds: entries
      .filter((entry) => entry.convocationStatus.toLowerCase() === "convocated")
      .map((entry) => entry.athleteId),
  };
};

/**
 * **Le righe di partecipazione riportate su un elenco di eventi** (`D-AUD-9`).
 *
 * `attachEventParticipation` risponde per **un** evento, e il chiamante che ne
 * ha cento deve sapere quali righe sono sue. La chiave e l'identificativo
 * dell'evento, e ne esistono due forme legittime sulla stessa riga: la
 * proiezione storica porta `id` (l'identificativo di quando l'allenamento
 * viveva nel JSON) e `eventId` (la riga di `club_events`), mentre la lettura di
 * `training_attendance` porta `event_id` e `training_id` — che il registro
 * traduce da `legacy_training_id`, ripiegando su `event_id` quando quello non
 * c'e. Indicizzare sulle **due** chiavi e cio che fa incontrare un evento nato
 * prima della migrazione con le righe scritte dopo.
 *
 * **Perche non basta contarle.** P0-6 ha dato al calendario un
 * `convocated_count`, e alle due schermate operative la rilettura delle righe.
 * Il rendiconto vuole un'altra cosa: **chi**. Un conteggio non dice se lo
 * stesso atleta e stato convocato dieci volte o dieci atleti una volta
 * ciascuno, e la statistica per categoria e per atleta e esattamente quella
 * differenza.
 */
export const attachParticipationToEvents = <T extends Record<string, any>>(
  events: readonly T[],
  rows: readonly (EventParticipationRow & {
    event_id?: unknown;
    eventId?: unknown;
    training_id?: unknown;
    trainingId?: unknown;
  })[],
) => {
  const lista = Array.isArray(events) ? events : [];
  if (!lista.length) return [] as ReturnType<typeof attachEventParticipation>[];

  const indice = new Map<string, EventParticipationRow[]>();
  const deposita = (chiave: unknown, riga: EventParticipationRow) => {
    const testo = String(chiave ?? "").trim();
    if (!testo) return;
    const secchio = indice.get(testo);
    if (secchio) {
      if (!secchio.includes(riga)) secchio.push(riga);
    } else {
      indice.set(testo, [riga]);
    }
  };

  for (const riga of Array.isArray(rows) ? rows : []) {
    deposita(riga?.event_id, riga);
    deposita((riga as any)?.eventId, riga);
    deposita((riga as any)?.training_id, riga);
    deposita((riga as any)?.trainingId, riga);
  }

  return lista.map((evento) => {
    const chiavi = [
      (evento as any)?.eventId,
      (evento as any)?.id,
      (evento as any)?.event_id,
    ];
    const viste = new Set<EventParticipationRow>();
    for (const chiave of chiavi) {
      const testo = String(chiave ?? "").trim();
      if (!testo) continue;
      for (const riga of indice.get(testo) || []) viste.add(riga);
    }

    const proiettato = attachEventParticipation(evento, Array.from(viste));

    /*
      **Zero righe non vuol dire zero convocati, quando il server ha gia
      risposto.**

      `attachEventParticipation` azzera le quattordici grafie storiche, ed e
      giusto: una rosa **cancellata** dalle righe non deve continuare a
      comparire come fatta. Ma da quando la rotta del calendario serve
      `convocated_athlete_ids` — gli identificativi che il server ha letto
      dalle righe e filtrato sul perimetro — quella chiave non e una grafia
      storica: e la **risposta canonica**, e azzerarla su un chiamante che le
      righe non ce le ha in mano (la bacheca allenatore ne ha tre) toglieva
      l'unica fonte rimasta e faceva dire «zero convocati» a ogni gara.

      Quando per questo evento non e arrivata nessuna riga, si tiene quindi cio
      che il server aveva gia detto. Quando le righe ci sono, decidono loro:
      sono la stessa fonte, lette piu da vicino.
    */
    if (!viste.size) {
      const dalServer = (evento as any)?.convocated_athlete_ids;
      if (Array.isArray(dalServer) && dalServer.length) {
        return {
          ...proiettato,
          convocatedAthleteIds: dalServer.map((id: unknown) =>
            String(id ?? "").trim(),
          ).filter(Boolean),
        };
      }
    }

    return proiettato;
  });
};

export const buildTrainerOperationalAlerts = ({
  trainings,
  matches,
  assignedAthletes,
  assignedCategories,
  categories,
  matchConvocationDeadlineDays,
  now = new Date(),
}: {
  trainings: any[];
  matches: any[];
  assignedAthletes: any[];
  assignedCategories: any[];
  categories: any[];
  matchConvocationDeadlineDays: number;
  now?: Date;
}): TrainerOperationalAlert[] => {
  const alerts: TrainerOperationalAlert[] = [];

  for (const training of trainings || []) {
    const trainingAthletes = getTrainerRecordAthletes({
      record: training,
      assignedAthletes,
      assignedCategories,
      categories,
    });

    if (!isTrainingMissingAttendance(training, trainingAthletes, now)) {
      continue;
    }

    alerts.push({
      key: `missing-attendance:${training.id}`,
      type: "missing_attendance",
      title: "Presenze mancanti",
      message: `Completa le presenze di ${training.title || "allenamento"}.`,
      recordId: String(training.id || ""),
      actionHref: `/trainer-dashboard/trainings?focus=${training.id}`,
    });
  }

  for (const match of matches || []) {
    const matchAthletes = getTrainerRecordAthletes({
      record: match,
      assignedAthletes,
      assignedCategories,
      categories,
    });
    const convocationStatus = getMatchConvocationStatus({
      match,
      totalAthletes: matchAthletes.length,
      deadlineDays: matchConvocationDeadlineDays,
      now,
    });

    if (convocationStatus.state !== "convocations_missing") {
      continue;
    }

    alerts.push({
      key: `missing-convocations:${match.id}`,
      type: "missing_convocations",
      title: "Convocazioni mancanti",
      message: `La gara è tra ${convocationStatus.daysUntilMatch ?? matchConvocationDeadlineDays} giorni: prepara le convocazioni.`,
      recordId: String(match.id || ""),
      actionHref: `/trainer-dashboard/matches?focus=${match.id}`,
    });
  }

  return alerts;
};
