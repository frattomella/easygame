"use client";

import React, { useState, useEffect, memo, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase, cachedQuery } from "@/lib/supabase";
import { debounce, memoize } from "@/lib/performance";
import {
  getClubCategories,
  getClubTrainers,
  getClubTrainings,
} from "@/lib/simplified-db";
import {
  compareTrainingsByStart,
  getTrainingCategoryColor,
  getTrainingCategoryLabel,
  getTrainingDate,
  getTrainingTimeLabel,
  getTrainingTrainerLabel,
  isTrainingOnDate,
} from "@/lib/training-utils";
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
  status?: "upcoming" | "completed" | "cancelled" | "annullato" | "concluded";
  attendanceStatus?: "saved" | "pending" | "none";
}

interface UpcomingTrainingsProps {
  trainings?: TrainingSession[];
  maxHeight?: string;
  isLoading?: boolean;
  organizationId?: string | null;
  showEmptyState?: boolean;
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
  options?: { categories?: any[]; trainers?: any[] },
): TrainingSession => {
  const source =
    training?.data && typeof training.data === "object" ? training.data : {};

  return {
    id: String(
      training?.id || globalThis.crypto?.randomUUID?.() || Math.random(),
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
      typeof training?.expectedAttendees === "number"
        ? training.expectedAttendees
        : typeof training?.expected_attendees === "number"
          ? training.expected_attendees
          : 0,
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
  }: UpcomingTrainingsProps) => {
    const [loadedTrainings, setLoadedTrainings] =
      useState<TrainingSession[]>(() =>
        (Array.isArray(trainings) ? trainings : []).map(normalizeTrainingSession),
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
              const [trainingsData, categoriesData, trainersData] =
                await Promise.all([
                  getClubTrainings(orgId),
                  getClubCategories(orgId),
                  getClubTrainers(orgId),
                ]);

              return {
                trainingsData,
                categoriesData,
                trainersData,
              };
            });

            if (result?.trainingsData) {
              return (Array.isArray(result.trainingsData)
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
              (Array.isArray(trainings) ? trainings : []).map(
                normalizeTrainingSession,
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

      return loadedTrainings
        .filter((training) => isTrainingOnDate(training, today))
        .sort(compareTrainingsByStart);
    }, [loadedTrainings]);

    if (loading) {
      return (
        <Card className="w-full h-full bg-white dark:bg-gray-800 shadow-md border-0">
          <CardHeader className="border-b border-gray-100 dark:border-gray-700">
            <CardTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-center">
                <CalendarIcon className="h-4 w-4 text-white" />
              </div>
              Prossimi Allenamenti
            </CardTitle>
          </CardHeader>
          <CardContent>
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
      <Card className="w-full h-full bg-white dark:bg-gray-800 shadow-md border-0">
        <CardHeader className="border-b border-gray-100 dark:border-gray-700">
          <CardTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-center">
              <CalendarIcon className="h-4 w-4 text-white" />
            </div>
            Prossimi Allenamenti
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="overflow-auto" style={{ maxHeight: maxHeight }}>
            {todayTrainings.length > 0 ? (
              <div className="space-y-4">
                {todayTrainings.map((training) => (
                  <TrainingCard key={training.id} training={training} />
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

const TrainingCard = memo(({ training }: { training: TrainingSession }) => {
  const [showAttendance, setShowAttendance] = useState(false);
  const [attendanceData, setAttendanceData] = useState<
    { name: string; present: boolean }[]
  >([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);

  const toggleAttendance = useCallback(() => {
    setShowAttendance((prev) => !prev);
  }, []);

  useEffect(() => {
    // Only fetch attendance data if the user expands the attendance section
    if (showAttendance && attendanceData.length === 0) {
      const fetchAttendanceData = async () => {
        try {
          setLoadingAttendance(true);

          // Fetch attendance records for this training
          const { data: attendanceRecords } = await supabase
            .from("training_attendance")
            .select(
              `
              id,
              is_present,
              athletes(id, first_name, last_name)
            `,
            )
            .eq("training_id", training.id);

          if (attendanceRecords) {
            const formattedAttendance = attendanceRecords.map((record) => ({
              name: record.athletes
                ? `${record.athletes.first_name} ${record.athletes.last_name}`
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
  }, [showAttendance, training.id, attendanceData.length]);

  return (
    <div className="p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-medium">{training.title}</h4>
        <Badge
          variant="secondary"
          className={cn("text-xs", training.categoryColor)}
        >
          {training.category}
        </Badge>
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
            {training.trainer} · {training.attendees} atleti ·{" "}
            <span className="text-green-600">
              {training.expectedAttendees || training.attendees} previsti
            </span>
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
                        {attendanceData.length}
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
});

TrainingCard.displayName = "TrainingCard";

export default UpcomingTrainings;
