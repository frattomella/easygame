"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cachedQuery, clearCache } from "@/lib/supabase";
import {
  getClubAthletes,
  getClubCategories,
  getClubTrainers,
} from "@/lib/simplified-db";
import { listEventParticipants, listEvents } from "@/lib/events/client";
import { listEventTrialAttendance } from "@/lib/trials/client";
import { attendanceStateOf, isRecordedAttendanceStatus } from "@/lib/events/attendance-count";
import { athleteCarriesCategoryIds, athleteHasCategoryId } from "@/lib/athlete-category-memberships";
import { isPresentAttendance } from "@/lib/funding/attendance-measure";
import { readRecordedAttendance } from "@/lib/trainer-operational-alerts";
import { trainingDisplayTitle } from "@/lib/events/training-presenter";
import {
  athleteMatchesAnyCategory,
  buildClubCategoryOptions,
} from "@/lib/category-utils";
import {
  compareTrainingsByStart,
  dedupeTrainings,
  getTrainingCategoryReferences,
  getTrainingCategoryLabel,
  getTrainingDate,
  getTrainingEndTime,
  getTrainingStableKey,
  getTrainingStartTime,
  getTrainingTrainerLabel,
  isTrainingOnDate,
  timeToMinutes,
} from "@/lib/training-utils";
import { getAthleteDisplayName } from "@/lib/athlete-name-utils";
import { formatLocalDateOnly } from "@/lib/date-only";

/**
 * Gli allenamenti **di oggi** per il riquadro «Oggi in palestra» della
 * Dashboard.
 *
 * E la lettura che faceva il riquadro V1 (`UpcomingTrainings`), spostata fuori
 * dal componente: le stesse quattro funzioni in parallelo, la stessa cache
 * (`trainings-<club>`), la stessa normalizzazione. Il catalogo delle
 * categorie e ricevuto davvero, perche due «Under 15» di due sedi sono due
 * squadre e l'organico atteso e quello del gruppo giusto (ADR-0155).
 *
 * **Gli allenamenti si leggono dalla rotta canonica, con i due numeri
 * dell'appello** (ADR-0198 §2). Prima arrivavano dalla proiezione storica
 * `clubs.trainings`, che non porta l'appello: `attendanceStatus` non
 * esisteva nella risposta e il riquadro diceva «Presenze non registrate»
 * sopra un registro compilato (pilota, 2026-09-18). Adesso «registrato» lo
 * dice `attendanceStateOf` sui conteggi del server — almeno una riga di
 * appello, presenti o assenti che siano — lo stesso lettore della pagina
 * Allenamenti.
 */
export type TodayTrainingStatus =
  | "upcoming"
  | "completed"
  | "concluded"
  | "cancelled"
  | "annullato";

export type TodayTraining = {
  id: string;
  key: string;
  title: string;
  date: Date;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  category: string;
  trainer: string;
  location: string;
  attendees: number;
  expectedAttendees: number;
  status: TodayTrainingStatus | string;
  attendanceStatus: "saved" | "pending" | "none";
};

const INVALID_TRAINING_VALUES = new Set(["", "undefined", "null"]);

const normalizeTrainingText = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (INVALID_TRAINING_VALUES.has(trimmed.toLowerCase())) return null;
    return trimmed;
  }
  if (typeof value === "number") return String(value);
  return null;
};

const durationBetween = (start: string | null, end: string | null) => {
  if (!start || !end) return null;
  const from = timeToMinutes(start);
  const to = timeToMinutes(end);
  if (from == null || to == null || to <= from) return null;
  return to - from;
};

export const normalizeTodayTraining = (
  training: any,
  options: { categories?: any[]; trainers?: any[]; athletes?: any[] } = {},
): TodayTraining => {
  const source =
    training?.data && typeof training.data === "object" ? training.data : {};
  const categories = options.categories || [];
  const categoryReferences = getTrainingCategoryReferences(training);
  const categoryOptions = buildClubCategoryOptions({
    clubCategories: categories,
    athletes: options.athletes || [],
  });
  const matchedCategoryOptions = categoryReferences
    .map((reference) => {
      const normalizedReference = String(reference || "").trim().toLowerCase();
      return categoryOptions.find(
        (category) =>
          String(category.id || "").trim().toLowerCase() === normalizedReference ||
          String(category.name || "").trim().toLowerCase() === normalizedReference,
      );
    })
    .filter(Boolean) as Array<{ id: string; name: string }>;
  const categoryCandidates =
    matchedCategoryOptions.length > 0
      ? matchedCategoryOptions
      : categoryReferences.length > 0
        ? categoryReferences
        : [getTrainingCategoryLabel(training, categories)];
  /* Per identificativo quando l'atleta ne porta (ADR-0198 §6): un nome non attraversa le stagioni. */
  const categoryAthleteCount = Array.isArray(options.athletes)
    ? options.athletes.filter((athlete) =>
        matchedCategoryOptions.length && athleteCarriesCategoryIds(athlete)
          ? matchedCategoryOptions.some((category) => athleteHasCategoryId(athlete, category.id))
          : athleteMatchesAnyCategory(athlete, categoryCandidates, categories),
      ).length
    : 0;

  const startTime =
    normalizeTrainingText(training?.time) ||
    normalizeTrainingText(training?.start_time) ||
    normalizeTrainingText(training?.startTime) ||
    getTrainingStartTime(training);
  const endTime = getTrainingEndTime(training);
  const explicitExpected =
    typeof training?.expectedAttendees === "number"
      ? training.expectedAttendees
      : typeof training?.expected_attendees === "number"
        ? training.expected_attendees
        : 0;
  /*
    «Registrato» = almeno una riga di appello, dal conteggio del server
    (`attendance_recorded`) o dall'elenco se la forma lo porta. Mai
    `presenti > 0`: tredici assenti sono un appello fatto.
  */
  const appello = readRecordedAttendance(training);
  /* Niente `pending` dal payload: la copia storica non e l'appello (revisione B8). */
  const statoAppello: TodayTraining["attendanceStatus"] = attendanceStateOf(appello) === "recorded" ? "saved" : "none";

  return {
    id: String(training?.id || training?.training_id || getTrainingStableKey(training)),
    key: getTrainingStableKey(training),
    title: trainingDisplayTitle(training),
    date: getTrainingDate(training) || new Date(),
    startTime: startTime ? String(startTime).split(" - ")[0] : null,
    endTime: endTime ? String(endTime) : null,
    durationMinutes: durationBetween(
      startTime ? String(startTime).split(" - ")[0] : null,
      endTime ? String(endTime) : null,
    ),
    category: getTrainingCategoryLabel(training, categories),
    trainer: getTrainingTrainerLabel(training, options.trainers || []),
    location:
      normalizeTrainingText(training?.location) ||
      normalizeTrainingText(source?.location) ||
      "Luogo non specificato",
    attendees: appello.recorded
      ? appello.present
      : typeof training?.attendees === "number"
        ? training.attendees
        : 0,
    expectedAttendees: categoryAthleteCount > 0 ? categoryAthleteCount : explicitExpected,
    status: training?.status || "upcoming",
    attendanceStatus: statoAppello,
  };
};

/** La lettura: quattro risorse in parallelo, una cache per club. */
export const loadTodayTrainings = async (
  clubId: string | null,
  seasonId: string | null = null,
): Promise<TodayTraining[]> => {
  if (!clubId) return [];

  /* La chiave porta la stagione (revisione C7): B attivata, la cache di A non risponde piu. */
  /*
    Il giorno **civile** del browser, con le cifre scritte come UTC: e la
    convenzione di `starts_at` (`toEventInstant`) e la stessa del calendario
    (revisione B1/D7). La chiave della cache porta anche il giorno: a
    mezzanotte la lista di ieri non risponde piu (revisione B7).
  */
  const oggi = formatLocalDateOnly(new Date());
  const result = await cachedQuery(`trainings-${clubId}:${seasonId || ""}:${oggi}`, async () => {
    const [trainingsData, categoriesData, trainersData, athletesData] = await Promise.all([
      /*
        La rotta canonica, sul solo giorno di oggi e sulla stagione che il
        browser dichiara (`x-active-season-id`, ADR-0197): ogni riga porta
        `attendance_recorded` e `attendance_present`.
      */
      listEvents({
        kind: "training",
        from: `${oggi}T00:00:00.000Z`,
        to: `${oggi}T23:59:59.999Z`,
        include_cancelled: "1",
      }),
      getClubCategories(clubId),
      getClubTrainers(clubId),
      /*
        Proiezione `summary`: qui gli atleti servono solo a contare quanti
        appartengono alla categoria di un allenamento (RC Fix 1, punto 11).
      */
      getClubAthletes(clubId, { view: "summary" }),
    ]);
    return { trainingsData, categoriesData, trainersData, athletesData };
  });

  const asList = (value: unknown) => (Array.isArray(value) ? value : []);
  const today = new Date();

  return dedupeTrainings(asList(result?.trainingsData))
    .filter((training) => isTrainingOnDate(training, today))
    .sort(compareTrainingsByStart)
    .map((training) =>
      normalizeTodayTraining(training, {
        categories: asList(result?.categoriesData),
        trainers: asList(result?.trainersData),
        athletes: asList(result?.athletesData),
      }),
    );
};

export type TodayTrainingsState = {
  trainings: TodayTraining[];
  loading: boolean;
  error: boolean;
  reload: () => void;
};

/*
  Nessun debounce: alla prima apertura non c'e niente da accorpare, ed erano
  300 ms aggiunti al primo disegno della dashboard.
*/
export const useTodayTrainings = (
  clubId: string | null,
  seasonId: string | null = null,
): TodayTrainingsState => {
  const [trainings, setTrainings] = useState<TodayTraining[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!clubId) {
      setTrainings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    /* La chiave porta la stagione: il prefisso le prende tutte. */
    if (attempt > 0) clearCache(`trainings-${clubId}:`);
    loadTodayTrainings(clubId, seasonId)
      .then((rows) => {
        if (!cancelled) setTrainings(rows);
      })
      .catch((cause) => {
        console.error("Error fetching trainings:", cause);
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clubId, seasonId, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  return useMemo(() => ({ trainings, loading, error, reload }), [trainings, loading, error, reload]);
};

/* ── Le presenze salvate di un allenamento, a richiesta ──────────────────── */
export type SavedAttendanceRow = { name: string; present: boolean };

/**
 * L'elenco nominativo delle presenze salvate, a richiesta: le righe vere
 * dell'appello (`/api/v1/events/:id/participants`, dal perimetro di chi
 * legge) e le persone in prova (`trial-attendance`), con il nome dal
 * catalogo atleti (revisione B5: la lettura su `training_attendance` chiedeva
 * una colonna `is_present` che nessuna proiezione produce e segnava tutti
 * assenti).
 */
export const loadSavedAttendance = async (
  trainingId: string,
  clubId: string | null,
): Promise<SavedAttendanceRow[]> => {
  const [partecipanti, prove, atleti] = await Promise.all([
    listEventParticipants(trainingId),
    listEventTrialAttendance(trainingId).catch(() => []),
    clubId ? getClubAthletes(clubId, { view: "summary" }) : Promise.resolve([]),
  ]);
  const nomi = new Map(
    (Array.isArray(atleti) ? atleti : []).map((atleta: any) => [String(atleta?.id || ""), getAthleteDisplayName(atleta)]),
  );
  const righe: SavedAttendanceRow[] = [];
  for (const riga of Array.isArray(partecipanti) ? partecipanti : []) {
    if (!isRecordedAttendanceStatus(riga?.status)) continue;
    righe.push({
      name: nomi.get(String(riga?.athlete_id || "")) || "Atleta",
      present: isPresentAttendance(riga),
    });
  }
  for (const riga of Array.isArray(prove) ? prove : []) {
    if (!riga?.attendance || !isRecordedAttendanceStatus(riga.attendance.status)) continue;
    righe.push({ name: `${riga.trial?.name || "Persona in prova"} · in prova`, present: isPresentAttendance(riga.attendance) });
  }
  return righe;
};

/**
 * Il link alla registrazione presenze di `/training`: gli stessi parametri
 * della V1. Il giorno e quello **civile** (`formatLocalDateOnly`), non
 * `toISOString().slice(0, 10)`: dopo le 23 con fuso positivo quello spostava
 * la data di un giorno e `/training` apriva il giorno sbagliato.
 */
export const buildAttendanceHref = (training: TodayTraining, clubId: string | null) => {
  const params = new URLSearchParams({ focus: "attendance", trainingId: training.id });
  if (!Number.isNaN(training.date.getTime())) {
    params.set("date", formatLocalDateOnly(training.date));
  }
  if (clubId) params.set("clubId", clubId);
  return `/training?${params.toString()}`;
};
