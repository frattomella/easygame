import {
  getTrainingDate,
  getTrainingEndTime,
  getTrainingStartTime,
  timeToMinutes,
} from "@/lib/training-utils";
import {
  toFundingMeasure,
  type FundingPeriod,
  type FundingRequirementUnit,
} from "./funding-model";

/**
 * Dalle presenze EasyGame alla misura che un bando chiede (ADR-0037).
 *
 * **Perche serve un modulo e non una `COUNT(*)`.** Un allenamento non porta
 * una durata: porta una data, un orario di inizio e uno di fine, scritti in
 * una decina di grafie diverse a seconda di chi ha creato il record. Le ore si
 * ricavano da li, con le stesse funzioni che usa il resto dell'applicazione
 * (`training-utils`) — se le riscrivessi qui, due schermate direbbero due
 * durate diverse per lo stesso allenamento.
 *
 * **Cosa conta come presenza.** Solo `status = "present"`. Un allenamento
 * senza appello non e una presenza: la segreteria che non ha registrato
 * l'appello non ha *dimostrato* la frequenza, e un contributo pubblico si
 * rendiconta con cio che si puo dimostrare.
 *
 * **Cosa succede a un allenamento senza orario.** Non contribuisce alle ore, e
 * la cosa viene **detta** (`sessionsWithoutDuration`) invece di essere
 * nascosta in un totale piu basso: un requisito orario mancato per dati
 * incompleti e un problema di anagrafica, non di frequenza, e va distinto.
 *
 * Modulo puro: riceve gli allenamenti e le presenze gia lette, non li cerca.
 */

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const asText = (value: unknown) => String(value ?? "").trim();

/** Vero se la riga di presenza dichiara l'atleta presente. */
export const isPresentAttendance = (attendance: unknown) => {
  const record = asRecord(attendance);
  const status = asText(record.status).toLowerCase();

  if (status) {
    return status === "present" || status === "presente";
  }

  // Le righe piu vecchie portavano un booleano invece dello stato.
  return record.present === true;
};

/**
 * La durata di un allenamento in ore, o `null` se non e ricavabile.
 *
 * Un allenamento che finisce prima di cominciare — succede con gli orari
 * digitati a mano — vale `null` e non una durata negativa: meglio un dato
 * mancante dichiarato che un totale silenziosamente sbagliato.
 */
export const getTrainingDurationHours = (training: unknown) => {
  const start = timeToMinutes(getTrainingStartTime(training));
  const end = timeToMinutes(getTrainingEndTime(training));

  if (start === null || end === null) {
    return null;
  }

  const minutes = end - start;
  return minutes > 0 ? Number((minutes / 60).toFixed(2)) : null;
};

/**
 * Il giorno di calendario di una data, come `YYYY-MM-DD`.
 *
 * **Perche non si confrontano i timestamp.** `getTrainingDate` restituisce una
 * data nel fuso locale, i periodi sono costruiti su mezzanotte UTC: in Italia
 * d'estate le due cose distano due ore, e un allenamento del primo ottobre
 * finiva dentro settembre. Il confronto giusto e sul **giorno**, che e anche
 * l'unita in cui il bando e scritto: «ore nel mese di settembre», non «ore
 * fra due istanti».
 */
const toLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const isWithinPeriod = (date: Date, period: FundingPeriod) => {
  const day = toLocalDateKey(date);
  // `period.end` e l'ultimo giorno **incluso**: senza questo, l'ultimo
  // allenamento del mese non conterebbe mai.
  return day >= period.start.slice(0, 10) && day <= period.end.slice(0, 10);
};

export type PeriodMeasure = {
  periodIndex: number;
  /** Ore o presenze, secondo l'unita richiesta. */
  value: number;
  sessions: number;
  hours: number;
  /** Allenamenti presenti ma senza orario: non entrano nelle ore. */
  sessionsWithoutDuration: number;
  trainingIds: string[];
};

/**
 * Quante ore o presenze valide ha un atleta in ciascun periodo.
 *
 * `attendance` sono le righe di `club_event_participants` dell'atleta;
 * `trainings` sono gli allenamenti del club, da cui si ricavano data e durata.
 * Gli allenamenti vengono indicizzati una volta sola: con una stagione intera
 * e dieci periodi, cercarli linearmente a ogni periodo costerebbe un ordine di
 * grandezza in piu.
 */
export const measureAttendanceByPeriod = ({
  periods,
  trainings = [],
  attendance = [],
  requirementUnit = "hours",
}: {
  periods: FundingPeriod[];
  trainings?: unknown[];
  attendance?: unknown[];
  requirementUnit?: FundingRequirementUnit;
}): PeriodMeasure[] => {
  const trainingsById = new Map<string, Record<string, any>>();
  for (const raw of Array.isArray(trainings) ? trainings : []) {
    const training = asRecord(raw);
    const id = asText(training.id);
    if (id) trainingsById.set(id, training);
  }

  const measures: PeriodMeasure[] = periods.map((period) => ({
    periodIndex: period.index,
    value: 0,
    sessions: 0,
    hours: 0,
    sessionsWithoutDuration: 0,
    trainingIds: [],
  }));

  const seen = new Set<string>();

  for (const raw of Array.isArray(attendance) ? attendance : []) {
    const record = asRecord(raw);
    if (!isPresentAttendance(record)) continue;

    /*
      Da ADR-0098 la riga della presenza cita l'evento con `event_id` e
      conserva l'identificativo storico in `legacy_training_id`. Le tre grafie
      convivono finche l'ultimo lettore della collezione JSON non e sparito:
      leggerne una sola vorrebbe dire non contare le ore di chi non e ancora
      passato — cioe dichiarare a un ente meno di quanto e stato fatto.
    */
    const trainingId = asText(
      record.training_id ?? record.trainingId ?? record.legacy_training_id,
    );
    if (!trainingId) continue;

    /*
      Una presenza contata due volte e un contributo dichiarato di troppo.
      `saveTrainingAttendance` deduplica gia le righe, ma un elenco che arriva
      da due letture unite puo ripetersi: la chiave e (allenamento, atleta).
    */
    const dedupeKey = `${trainingId}|${asText(record.athlete_id ?? record.athleteId)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const training = trainingsById.get(trainingId);
    if (!training) continue;

    const date = getTrainingDate(training);
    if (!date) continue;

    const periodIndex = periods.findIndex((period) =>
      isWithinPeriod(date, period),
    );
    if (periodIndex === -1) continue;

    const measure = measures[periodIndex];
    const hours = getTrainingDurationHours(training);

    measure.sessions += 1;
    measure.trainingIds.push(trainingId);

    if (hours === null) {
      measure.sessionsWithoutDuration += 1;
    } else {
      measure.hours = Number((measure.hours + hours).toFixed(2));
    }
  }

  for (const measure of measures) {
    measure.value = toFundingMeasure(
      requirementUnit === "sessions" ? measure.sessions : measure.hours,
    );
  }

  return measures;
};
