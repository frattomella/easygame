"use client";

import React, { useState, useEffect, memo, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase, cachedQuery } from "@/lib/supabase";
import { debounce, memoize } from "@/lib/performance";
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
  getTrainingCategoryColor,
  getTrainingCategoryLabel,
  getTrainingDate,
  getTrainingStableKey,
  getTrainingTimeLabel,
  getTrainingTrainerLabel,
  isTrainingOnDate,
} from "@/lib/training-utils";
import { getAthleteDisplayName } from "@/lib/athlete-name-utils";
import {
  CalendarIcon,
  CheckCircle,
  Clock,
  MapPin,
  Users,
  X,
} from "lucide-react";

interface TrainingSession {
  id: string;
  title: string;
  date: Date;
  time: string;
  category: string;
  trainer: string;
  location: string;
  attendees: number;
  categoryColor: string;
  expectedAttendees?: number;
  categoryReferences?: string[];
  status?: "upcoming" | "completed" | "cancelled" | "annullato" | "concluded";
  attendanceStatus?: "saved" | "pending" | "none";
}

interface UpcomingTrainingsProps {
  trainings?: TrainingSession[];
  maxHeight?: string;
  isLoading?: boolean;
  organizationId?: string | null;
  showEmptyState?: boolean;
  variant?: "card" | "embedded";
}

const INVALID_TRAINING_VALUES = new Set(["", "undefined", "null"]);

const normalizeTrainingText = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (INVALID_TRAINING_VALUES.has(trimmed.toLowerCase())) {
      return null;
    }

    return trimmed;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return null;
};

const normalizeTrainingSession = (
  training: any,
  options?: { categories?: any[]; trainers?: any[]; athletes?: any[] },
): TrainingSession => {
  const source =
    training?.data && typeof training.data === "object" ? training.data : {};
  const categoryReferences = getTrainingCategoryReferences(training);
  const categoryOptions = buildClubCategoryOptions({
    clubCategories: options?.categories || [],
    athletes: options?.athletes || [],
  });
  const matchedCategoryOptions = categoryReferences
    .map((reference) => {
      const normalizedReference = String(reference || "").trim().toLowerCase();
      return categoryOptions.find(
        (category) =>
          String(category.id || "").trim().toLowerCase() ===
            normalizedReference ||
          String(category.name || "").trim().toLowerCase() ===
            normalizedReference,
      );
    })
    .filter(Boolean) as Array<{ id: string; name: string }>;
  const categoryCandidates =
    matchedCategoryOptions.length > 0
      ? matchedCategoryOptions
      : categoryReferences.length > 0
        ? categoryReferences
        : [getTrainingCategoryLabel(training, options?.categories || [])];
  const categoryAthleteCount = Array.isArray(options?.athletes)
    ? options.athletes.filter((athlete) =>
        athleteMatchesAnyCategory(athlete, categoryCandidates),
      ).length
    : 0;

  return {
    id: String(
      training?.id || training?.training_id || getTrainingStableKey(training),
    ),
    title:
      normalizeTrainingText(training?.title) ||
      normalizeTrainingText(source?.title) ||
      "Allenamento",
    date: getTrainingDate(training) || new Date(),
    time:
      normalizeTrainingText(training?.time) ||
      normalizeTrainingText(training?.start_time) ||
      normalizeTrainingText(training?.startTime) ||
      getTrainingTimeLabel(training),
    category: getTrainingCategoryLabel(training, options?.categories || []),
    trainer: getTrainingTrainerLabel(training, options?.trainers || []),
    location:
      normalizeTrainingText(training?.location) ||
      normalizeTrainingText(source?.location) ||
      "Luogo non specificato",
    attendees:
      typeof training?.attendees === "number" ? training.attendees : 0,
    categoryColor: getTrainingCategoryColor(
      training,
      options?.categories || [],
    ),
    expectedAttendees:
      categoryAthleteCount > 0
        ? categoryAthleteCount
        : typeof training?.expectedAttendees === "number"
        ? training.expectedAttendees
        : typeof training?.expected_attendees === "number"
          ? training.expected_attendees
          : 0,
    categoryReferences,
    status: training?.status || "upcoming",
    attendanceStatus:
      training?.attendanceStatus || training?.attendance_status || "none",
  };
};

const UpcomingTrainings = memo(
  ({
    trainings = [],
    maxHeight = "300px",
    isLoading = false,
    organizationId = null,
    showEmptyState = false,
    variant = "card",
  }: UpcomingTrainingsProps) => {
    const [loadedTrainings, setLoadedTrainings] =
      useState<TrainingSession[]>(() =>
        dedupeTrainings(Array.isArray(trainings) ? trainings : []).map(
          (training) => normalizeTrainingSession(training),
        ),
      );
    const [loading, setLoading] = useState(isLoading);

    // Memoized fetch function with caching
    const fetchTrainings = useMemo(
      () =>
        memoize(async (orgId: string | null) => {
          if (!orgId) return [];

          try {
            // Use cached query for better performance
            const result = await cachedQuery(`trainings-${orgId}`, async () => {
              const [trainingsData, categoriesData, trainersData, athletesData] =
                await Promise.all([
                  getClubTrainings(orgId),
                  getClubCategories(orgId),
                  getClubTrainers(orgId),
                  getClubAthletes(orgId),
                ]);

              return {
                trainingsData,
                categoriesData,
                trainersData,
                athletesData,
              };
            });

            if (result?.trainingsData) {
              return dedupeTrainings(Array.isArray(result.trainingsData)
                ? result.trainingsData
                : []
              )
                .map((training: any) =>
                  normalizeTrainingSession(training, {
                    categories: Array.isArray(result.categoriesData)
                      ? result.categoriesData
                      : [],
                    trainers: Array.isArray(result.trainersData)
                      ? result.trainersData
                      : [],
                    athletes: Array.isArray(result.athletesData)
                      ? result.athletesData
                      : [],
                  }),
                )
                .sort(compareTrainingsByStart);
            }

            return [];
          } catch (error) {
            console.error("Error fetching trainings:", error);
            return [];
          }
        }),
      [],
    );

    // Debounced loading function
    const debouncedLoadTrainings = useMemo(
      () =>
        debounce(async () => {
          if (trainings.length > 0) {
            setLoadedTrainings(
              dedupeTrainings(Array.isArray(trainings) ? trainings : []).map(
                (training) => normalizeTrainingSession(training),
              ),
            );
            return;
          }

          // If showEmptyState is true, don't fetch any data
          if (showEmptyState) {
            setLoadedTrainings([]);
            setLoading(false);
            return;
          }

          setLoading(true);
          try {
            const fetchedTrainings = await fetchTrainings(organizationId);
            setLoadedTrainings(fetchedTrainings);
          } finally {
            setLoading(false);
          }
        }, 300),
      [trainings, showEmptyState, organizationId, fetchTrainings],
    );

    useEffect(() => {
      debouncedLoadTrainings();
    }, [debouncedLoadTrainings]);

    // Memoize filtered and sorted trainings
    const todayTrainings = useMemo(() => {
      const today = new Date();

      return dedupeTrainings(loadedTrainings)
        .filter((training) => isTrainingOnDate(training, today))
        .sort(compareTrainingsByStart);
    }, [loadedTrainings]);
    const isEmbedded = variant === "embedded";
    const shellClassName = cn(
      "w-full h-full",
      isEmbedded
        ? "border-0 bg-transparent shadow-none"
        : "bg-white dark:bg-gray-800 shadow-md border-0",
    );
    const headerClassName = cn(
      "flex flex-row items-center justify-between",
      isEmbedded
        ? "px-0 pb-3 pt-0"
        : "pb-2 border-b border-gray-100 dark:border-gray-700",
    );
    const contentClassName = isEmbedded ? "px-0 pb-0 pt-0" : "pt-4";

    if (loading) {
      return (
        <Card className={shellClassName}>
          <CardHeader className={headerClassName}>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
              <div className="h-8 w-8 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-center">
                <CalendarIcon className="h-4 w-4 text-white" />
              </div>
              Allenamenti del giorno
            </CardTitle>
          </CardHeader>
          <CardContent className={contentClassName}>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-3 border rounded-lg animate-pulse">
                  <div className="flex justify-between items-start mb-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className={shellClassName}>
        <CardHeader className={headerClassName}>
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
            <div className="h-8 w-8 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-center">
              <CalendarIcon className="h-4 w-4 text-white" />
            </div>
            Allenamenti del giorno
          </CardTitle>
        </CardHeader>
        <CardContent className={contentClassName}>
          <div
            className="overflow-y-auto pr-1 scrollbar-hide"
            style={{ maxHeight }}
          >
            {todayTrainings.length > 0 ? (
              <div className="space-y-4">
                {todayTrainings.map((training) => (
                  <TrainingCard
                    key={getTrainingStableKey(training)}
                    training={training}
                    organizationId={organizationId}
                  />
                ))}
              </div>
            ) : (
              <EmptyTrainingsState />
            )}
          </div>
        </CardContent>
      </Card>
    );
  },
);

UpcomingTrainings.displayName = "UpcomingTrainings";

// Memoized empty state component
const EmptyTrainingsState = memo(() => (
  <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 p-6">
    <CalendarIcon className="h-12 w-12 mb-2 opacity-50" />
    <p>Nessun allenamento programmato per oggi</p>
    <p className="text-sm">Gli allenamenti di altri giorni non compaiono qui</p>
  </div>
));

EmptyTrainingsState.displayName = "EmptyTrainingsState";

const TrainingCard = memo(
  ({
    training,
    organizationId,
  }: {
    training: TrainingSession;
    organizationId?: string | null;
  }) => {
  const [showAttendance, setShowAttendance] = useState(false);
  const [attendanceData, setAttendanceData] = useState<
    { name: string; present: boolean }[]
  >([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const presentCount =
    attendanceData.length > 0
      ? attendanceData.filter((athlete) => athlete.present).length
      : training.attendees;
  const attendanceTotal =
    typeof training.expectedAttendees === "number" &&
    training.expectedAttendees > 0
      ? training.expectedAttendees
      : attendanceData.length > 0
        ? attendanceData.length
        : 0;
  const attendanceTotalLabel = attendanceTotal > 0 ? attendanceTotal : "-";
  const attendanceRatio = `${presentCount}/${attendanceTotalLabel}`;

  const toggleAttendance = useCallback(() => {
    setShowAttendance((prev) => !prev);
  }, []);
  const openAttendanceManagement = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams({
      focus: "attendance",
      trainingId: training.id,
    });
    const trainingDateTime = training.date.getTime();

    if (!Number.isNaN(trainingDateTime)) {
      params.set("date", training.date.toISOString().slice(0, 10));
    }

    if (organizationId) {
      params.set("clubId", organizationId);
    }

    window.location.href = `/training?${params.toString()}`;
  }, [organizationId, training.date, training.id]);

  useEffect(() => {
    // Only fetch attendance data if the user expands the attendance section
    if (showAttendance && attendanceData.length === 0) {
      const fetchAttendanceData = async () => {
        try {
          setLoadingAttendance(true);

          // Fetch attendance records for this training
          let attendanceQuery = supabase.from("training_attendance").select(
            `
              id,
              is_present,
              athletes(id, first_name, last_name)
            `,
          );

          attendanceQuery = attendanceQuery.eq("training_id", training.id);

          if (organizationId) {
            attendanceQuery = attendanceQuery.eq(
              "organization_id",
              organizationId,
            );
          }

          const { data: attendanceRecords } = await attendanceQuery;

          if (attendanceRecords) {
            const formattedAttendance = attendanceRecords.map((record: {
              athletes?: unknown;
              is_present?: boolean;
            }) => ({
              name: record.athletes
                ? getAthleteDisplayName(record.athletes)
                : "Atleta sconosciuto",
              present: record.is_present,
            }));

            setAttendanceData(formattedAttendance);
          }

          setLoadingAttendance(false);
        } catch (error) {
          console.error("Error fetching attendance data:", error);
          setLoadingAttendance(false);
        }
      };

      fetchAttendanceData();
    }
  }, [showAttendance, training.id, organizationId, attendanceData.length]);

  return (
    <div className="p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Badge
            variant="secondary"
            className={cn("shrink-0 text-xs", training.categoryColor)}
          >
            {training.category}
          </Badge>
          <h4 className="truncate font-medium">{training.title}</h4>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={openAttendanceManagement}
        >
          Presenze
        </Button>
      </div>
      <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5" />
          <span>{training.time}</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5" />
          <span>{training.location}</span>
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5" />
          <span>
            {training.trainer} · {attendanceRatio} Atleti
            {training.status && training.status !== "upcoming" && (
              <span className="ml-1 text-blue-600">
                ·{" "}
                {training.status === "completed" ||
                training.status === "concluded"
                  ? "Concluso"
                  : training.status === "cancelled" ||
                      training.status === "annullato"
                    ? "Annullato"
                    : training.status}
              </span>
            )}
          </span>
        </div>
        <div className="mt-1 pt-1 border-t border-gray-100 dark:border-gray-800">
          {training.attendanceStatus === "saved" ? (
            <div>
              <span
                className="text-green-600 flex items-center gap-1 text-xs cursor-pointer"
                onClick={toggleAttendance}
              >
                <CheckCircle className="h-3 w-3" /> Presenze salvate{" "}
                {showAttendance ? "▲" : "▼"}
              </span>

              {showAttendance && (
                <div className="mt-2 text-xs border-t pt-2 space-y-1">
                  {loadingAttendance ? (
                    <p>Caricamento presenze...</p>
                  ) : attendanceData.length > 0 ? (
                    <>
                      <p className="font-medium">
                        Presenze:{" "}
                        {attendanceData.filter((a) => a.present).length}/
                        {Math.max(
                          training.expectedAttendees || 0,
                          attendanceData.length,
                        )}
                      </p>
                      {attendanceData.map((athlete, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          {athlete.present ? (
                            <CheckCircle className="h-2.5 w-2.5 text-green-500" />
                          ) : (
                            <X className="h-2.5 w-2.5 text-red-500" />
                          )}
                          <span>{athlete.name}</span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <p>Nessun dato di presenza disponibile</p>
                  )}
                </div>
              )}
            </div>
          ) : training.attendanceStatus === "pending" ? (
            <span className="text-amber-600 flex items-center gap-1 text-xs">
              <Clock className="h-3 w-3" /> Presenze in corso
            </span>
          ) : (
            <span className="text-gray-500 flex items-center gap-1 text-xs">
              <Users className="h-3 w-3" /> Presenze non registrate
            </span>
          )}
        </div>
      </div>
    </div>
  );
  },
);

TrainingCard.displayName = "TrainingCard";

export default UpcomingTrainings;
