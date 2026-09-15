"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, cachedQuery } from "@/lib/supabase";
import {
  getClubAthletes,
  getClubCategories,
  getClubTrainers,
  getClubTrainings,
} from "@/lib/simplified-db";
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
  const categoryAthleteCount = Array.isArray(options.athletes)
    ? options.athletes.filter((athlete) =>
        athleteMatchesAnyCategory(athlete, categoryCandidates, categories),
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

  return {
    id: String(training?.id || training?.training_id || getTrainingStableKey(training)),
    key: getTrainingStableKey(training),
    title:
      normalizeTrainingText(training?.title) ||
      normalizeTrainingText(source?.title) ||
      "Allenamento",
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
    attendees: typeof training?.attendees === "number" ? training.attendees : 0,
    expectedAttendees: categoryAthleteCount > 0 ? categoryAthleteCount : explicitExpected,
    status: training?.status || "upcoming",
    attendanceStatus:
      training?.attendanceStatus || training?.attendance_status || "none",
  };
};

/** La lettura: quattro risorse in parallelo, una cache per club. */
export const loadTodayTrainings = async (clubId: string | null): Promise<TodayTraining[]> => {
  if (!clubId) return [];

  const result = await cachedQuery(`trainings-${clubId}`, async () => {
    const [trainingsData, categoriesData, trainersData, athletesData] = await Promise.all([
      getClubTrainings(clubId),
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
export const useTodayTrainings = (clubId: string | null): TodayTrainingsState => {
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
    loadTodayTrainings(clubId)
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
  }, [clubId, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  return useMemo(() => ({ trainings, loading, error, reload }), [trainings, loading, error, reload]);
};

/* ── Le presenze salvate di un allenamento, a richiesta ──────────────────── */
export type SavedAttendanceRow = { name: string; present: boolean };

/**
 * L'elenco nominativo delle presenze salvate: si legge solo quando la persona
 * lo apre, come faceva il riquadro V1 (stessa lettura su `training_attendance`).
 */
export const loadSavedAttendance = async (
  trainingId: string,
  clubId: string | null,
): Promise<SavedAttendanceRow[]> => {
  let query = supabase
    .from("training_attendance")
    .select("id, is_present, athletes(id, first_name, last_name)")
    .eq("training_id", trainingId);
  if (clubId) {
    query = query.eq("organization_id", clubId);
  }
  const { data } = await query;
  if (!Array.isArray(data)) return [];
  return data.map((record: { athletes?: unknown; is_present?: boolean }) => ({
    name: record.athletes ? getAthleteDisplayName(record.athletes) : "Atleta sconosciuto",
    present: Boolean(record.is_present),
  }));
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
