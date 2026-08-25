"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  Plus,
  Clock,
  MapPin,
  Users,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from "lucide-react";
import { useToast } from "@/components/ui/toast-notification";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getParticipationCategoryBadgeLabel,
  getParticipationCategoryContext,
  getPrimaryAthleteCategoryMembership,
} from "@/lib/athlete-category-memberships";
import {
  athleteMatchesAnyCategory,
} from "@/lib/category-utils";
import {
  compareAthletesByLastName,
  getAthleteDisplayName,
} from "@/lib/athlete-name-utils";
import {
  getClubCategories,
  getClubTrainings,
  getClubTrainers,
  getClubWeeklySchedule,
  getClubStructures,
  addClubData,
  cleanupOrphanScheduledTrainings,
  updateClubDataItem,
  deleteClubDataItem,
  saveTrainingAttendance,
  getClubAthletes,
} from "@/lib/simplified-db";
import {
  buildTrainingLocationOptions,
  findTrainingLocationOption,
  getFallbackTrainingLocationOptions,
  type TrainingLocationOption,
} from "@/lib/training-location-options";
import {
  canRecordTrainingAttendance,
  compareTrainingsByStart,
  dedupeTrainings,
  findTrainingsWithMissingCategories,
  findTrainingCollisions,
  getTrainingCategoryColor,
  getTrainingCategoryLabel,
  getTrainingCategoryReferences,
  getTrainingDate,
  getTrainingEndTime,
  getTrainingPhase,
  getTrainingStartTime,
  getTrainingStableKey,
  getTrainingTimeLabel,
  getTrainingTrainerLabel,
  isTrainingOnDate,
} from "@/lib/training-utils";
import {
  getMedicalCertificateAvailability,
  getMedicalCertificateAvailabilityLabel,
} from "@/lib/medical-certificates";
import {
  normalizeTrainingAttendanceEntries,
} from "@/lib/athlete-participation-utils";

const WeeklyTrainingSchedule = dynamic(
  () =>
    import("@/components/dashboard/WeeklyTrainingSchedulePanel").then(
      (module) => module.WeeklyTrainingSchedule,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-56 animate-pulse rounded-xl border bg-slate-100" />
    ),
  },
);

const AddTrainingForm = dynamic(
  () =>
    import("@/components/forms/AddTrainingForm").then(
      (module) => module.AddTrainingForm,
    ),
  { ssr: false },
);

const EditTrainingForm = dynamic(
  () =>
    import("@/components/forms/EditTrainingForm").then(
      (module) => module.EditTrainingForm,
    ),
  { ssr: false },
);

const AttendanceSheet = dynamic(
  () =>
    import("@/components/trainer/AttendanceSheet").then(
      (module) => module.AttendanceSheet,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="w-full max-w-3xl animate-pulse rounded-xl border bg-white p-6 shadow-xl" />
    ),
  },
);

interface TrainingSession {
  id: string;
  title: string;
  date: Date;
  time: string;
  endTime?: string | null;
  category: string;
  categoryId?: string | null;
  categoryReferences?: string[];
  historicalCategoryName?: string | null;
  /** Nomi uniti, per la lista. */
  trainer: string;
  /** Gli id veri: i record piu vecchi hanno solo `trainer`. */
  trainerIds?: string[];
  location: string;
  locationId?: string | null;
  structureId?: string | null;
  attendees: number;
  categoryColor: string;
  status: "upcoming" | "completed" | "cancelled" | "annullato" | "concluded";
  attendance?: any[];
  expectedAttendees?: number;
}

type TrainingPersonOption = {
  id: string;
  name: string;
  [key: string]: unknown;
};

type TrainingCategoryOption = TrainingPersonOption & {
  color?: string;
};

type AttendanceSheetAthlete = {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  present?: boolean;
  notes?: string;
  medicalCertExpiry?: string | null;
  participationContext?: "primary" | "secondary" | "extra";
  participationBadgeLabel?: string | null;
  isExtraCategory?: boolean;
  isManualExtra?: boolean;
  primaryCategoryName?: string | null;
  rawAthlete?: any;
};

type AttendanceModalState = {
  training: TrainingSession;
  athletes: AttendanceSheetAthlete[];
  clubAthletes: AttendanceSheetAthlete[];
};

const normalizeTrainingCategoryReference = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const trainingMatchesCategory = (
  training: any,
  category: { id?: string | null; name?: string | null },
) => {
  const nestedTrainingCategories = Array.isArray(training?.categories)
    ? training.categories.flatMap((value: any) =>
        value && typeof value === "object"
          ? [
              value.id,
              value.name,
              value.categoryId,
              value.category_id,
              value.categoryName,
              value.category_name,
            ]
          : [value],
      )
    : [];
  const trainingReferences = [
    ...nestedTrainingCategories,
    training?.categoryId,
    training?.category_id,
    training?.category?.id,
    training?.category?.name,
    training?.category,
    training?.categoryName,
    training?.category_name,
  ]
    .map(normalizeTrainingCategoryReference)
    .filter(Boolean);

  const categoryReferences = [category?.id, category?.name]
    .map(normalizeTrainingCategoryReference)
    .filter(Boolean);

  return categoryReferences.some((reference) =>
    trainingReferences.includes(reference),
  );
};

const formatTrainingSession = ({
  training,
  categories,
  trainers,
  athletes,
  locations,
}: {
  training: any;
  categories: any[];
  trainers: any[];
  athletes: any[];
  locations: any[];
}): TrainingSession | null => {
  const trainingDate = getTrainingDate(training);
  if (!trainingDate) {
    return null;
  }

  const matchedCategories = categories.filter((category: any) =>
    trainingMatchesCategory(training, category),
  );
  const expectedAttendees =
    typeof training?.expectedAttendees === "number"
      ? training.expectedAttendees
      : typeof training?.expected_attendees === "number"
        ? training.expected_attendees
        : athletes.filter((athlete: any) =>
            athleteMatchesAnyCategory(athlete, matchedCategories),
          ).length;

  const matchedLocation = findTrainingLocationOption(locations, {
    structureId: training.structureId,
    fieldId: training.locationId || training.fieldId,
    locationId: training.locationId || training.fieldId,
    location: training.location,
  });
  const source =
    training?.data && typeof training.data === "object" ? training.data : {};

  return {
    id: String(
      training?.id || globalThis.crypto?.randomUUID?.() || Math.random(),
    ),
    title: String(training?.title || source?.title || "Allenamento"),
    date: trainingDate,
    time: getTrainingStartTime(training) || getTrainingTimeLabel(training),
    endTime: getTrainingEndTime(training),
    category: getTrainingCategoryLabel(training, categories),
    categoryId:
      String(
        training?.categoryId ||
          training?.category_id ||
          training?.category?.id ||
          source?.categoryId ||
          source?.category_id ||
          source?.category?.id ||
          "",
      ).trim() || null,
    categoryReferences: getTrainingCategoryReferences(training),
    historicalCategoryName:
      String(
        training?.category_name ||
          training?.categoryName ||
          training?.category?.name ||
          source?.category_name ||
          source?.categoryName ||
          source?.category?.name ||
          "",
      ).trim() || null,
    trainer: getTrainingTrainerLabel(training, trainers),
    // Gli id servono alla modifica per ripresentare la selezione multipla.
    trainerIds: (Array.isArray(training?.trainerIds)
      ? training.trainerIds
      : Array.isArray(source?.trainerIds)
        ? source.trainerIds
        : []
    )
      .map((id: unknown) => String(id || "").trim())
      .filter(Boolean),
    location:
      matchedLocation?.name ||
      training?.location ||
      source?.location ||
      "Campo",
    locationId:
      matchedLocation?.fieldId || training?.locationId || training?.fieldId || null,
    structureId: matchedLocation?.structureId || training?.structureId || null,
    attendees:
      typeof training?.attendees === "number" ? training.attendees : 0,
    categoryColor: getTrainingCategoryColor(training, categories),
    status: training?.status || "upcoming",
    attendance: Array.isArray(training?.attendance) ? training.attendance : [],
    expectedAttendees,
  };
};

const buildTrainingAttendanceAthlete = ({
  athlete,
  eventCategories,
  existingEntry,
}: {
  athlete: any;
  eventCategories: any[];
  existingEntry?: ReturnType<typeof normalizeTrainingAttendanceEntries>[number];
}): AttendanceSheetAthlete => {
  const context = getParticipationCategoryContext({
    athlete,
    eventCategories,
    entry: existingEntry || null,
  });
  const primaryCategory = getPrimaryAthleteCategoryMembership(athlete);

  return {
    id: athlete.id,
    name: getAthleteDisplayName(athlete) || "Atleta",
    firstName: athlete.first_name || "",
    lastName: athlete.last_name || "",
    avatar:
      athlete.avatar_url ||
      athlete.data?.avatar ||
      "",
    present: existingEntry?.present || false,
    notes: existingEntry?.notes || "",
    medicalCertExpiry:
      athlete.data?.medicalCertExpiry ||
      athlete.medical_cert_expiry ||
      athlete.medicalCertExpiry ||
      null,
    participationContext: context,
    participationBadgeLabel:
      context === "primary" ? null : getParticipationCategoryBadgeLabel(context),
    isExtraCategory:
      context === "extra" ||
      Boolean(existingEntry?.isExtraCategory),
    isManualExtra:
      context === "extra" ||
      Boolean(existingEntry?.isManualExtra),
    primaryCategoryName: primaryCategory?.categoryName || null,
    rawAthlete: athlete,
  };
};

export default function TrainingPage() {
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const [date, setDate] = React.useState<Date | undefined>(undefined);
  const [activeTab, setActiveTab] = React.useState<"daily" | "calendar">(
    "daily",
  );
  const [trainers, setTrainers] = useState<TrainingPersonOption[]>([]);
  const [categories, setCategories] = useState<TrainingCategoryOption[]>([]);
  const [locations, setLocations] = useState<TrainingLocationOption[]>([]);
  const [trainings, setTrainings] = React.useState<TrainingSession[]>([]);
  const [weeklySchedule, setWeeklySchedule] = React.useState<any[]>([]);
  const [clubAthletes, setClubAthletes] = useState<any[]>([]);
  const [showAddTrainingModal, setShowAddTrainingModal] = useState(false);
  const [showEditTrainingModal, setShowEditTrainingModal] = useState(false);
  const [editingTraining, setEditingTraining] =
    useState<TrainingSession | null>(null);
  /*
    Il PIN di club e stato rimosso (Blocco 7, punto 17).

    Eliminare un allenamento chiedeva quattro cifre uguali per tutto il club,
    con valore predefinito `1234` scritto in chiaro: non diceva chi stesse
    cancellando e non impediva a nessuno di farlo, perche l'API era comunque
    raggiungibile. Resta una conferma esplicita, che e cio che serve davvero
    contro il clic sbagliato.
  */
  const [showDeleteTraining, setShowDeleteTraining] = useState(false);
  const [trainingToDelete, setTrainingToDelete] =
    useState<TrainingSession | null>(null);
  const [attendanceModalState, setAttendanceModalState] =
    useState<AttendanceModalState | null>(null);
  const [autoOpenedAttendanceId, setAutoOpenedAttendanceId] = useState<
    string | null
  >(null);
  const [calendarDate, setCalendarDate] = React.useState<Date | undefined>(
    undefined,
  );
  const [shouldRenderSchedule, setShouldRenderSchedule] = useState(false);
  const [cleaningMissingCategories, setCleaningMissingCategories] =
    useState(false);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const scheduleSectionRef = React.useRef<HTMLDivElement | null>(null);
  const { showToast } = useToast();
  const { activeClub } = useAuth();
  const requestedTrainingId = searchParams.get("trainingId");
  const requestedFocus = searchParams.get("focus");
  const requestedDate = React.useMemo(() => {
    const dateParam = searchParams.get("date");

    if (!dateParam) {
      return new Date();
    }

    const parsedDate = new Date(`${dateParam}T00:00:00`);
    return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  }, [searchParams]);

  // Initialize dates on client side to avoid hydration mismatch
  React.useEffect(() => {
    if (!date) setDate(requestedDate);
    if (!calendarDate) setCalendarDate(requestedDate);
  }, [calendarDate, date, requestedDate]);

  React.useEffect(() => {
    if (shouldRenderSchedule) {
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setShouldRenderSchedule(true);
      return;
    }

    const target = scheduleSectionRef.current;
    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldRenderSchedule(true);
        }
      },
      { rootMargin: "240px 0px" },
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [shouldRenderSchedule]);

  React.useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousHtmlHeight = document.documentElement.style.height;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyHeight = document.body.style.height;

    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.height = "100%";
    document.body.style.overflow = "hidden";
    document.body.style.height = "100%";

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.documentElement.style.height = previousHtmlHeight;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.height = previousBodyHeight;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    if (!action) {
      return;
    }

    if (action === "new") {
      setShowAddTrainingModal(true);
    }

    params.delete("action");
    const nextQuery = params.toString();
    const nextUrl = nextQuery
      ? `${window.location.pathname}?${nextQuery}`
      : window.location.pathname;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, []);

  const loadData = React.useCallback(async () => {
    if (!activeClub?.id) {
      return;
    }

    try {
      const settledResults = await Promise.allSettled([
        getClubCategories(activeClub.id),
        getClubTrainers(activeClub.id),
        getClubStructures(activeClub.id),
        getClubAthletes(activeClub.id),
        getClubTrainings(activeClub.id),
        getClubWeeklySchedule(activeClub.id),
      ]);

      const failedSections: string[] = [];
      const readArrayResult = (
        index: number,
        fallbackLabel: string,
      ): any[] => {
        const result = settledResults[index];
        if (result.status === "fulfilled") {
          return Array.isArray(result.value) ? result.value : [];
        }

        console.error(`Error loading training ${fallbackLabel}:`, result.reason);
        failedSections.push(fallbackLabel);
        return [];
      };

      const clubCategories = readArrayResult(0, "categorie");
      const clubTrainers = readArrayResult(1, "allenatori");
      const clubStructures = readArrayResult(2, "strutture");
      const allAthletes = readArrayResult(3, "atleti");
      const clubTrainings = readArrayResult(4, "allenamenti");
      const clubWeeklySchedule = readArrayResult(5, "programma settimanale");

      const normalizedCategories = Array.isArray(clubCategories)
        ? clubCategories
        : [];
      const normalizedTrainers = Array.isArray(clubTrainers) ? clubTrainers : [];
      const normalizedTrainings = Array.isArray(clubTrainings)
        ? clubTrainings
        : [];
      const normalizedWeeklySchedule = Array.isArray(clubWeeklySchedule)
        ? clubWeeklySchedule
        : [];
      const normalizedAthletes = Array.isArray(allAthletes) ? allAthletes : [];

      setCategories(normalizedCategories);
      setTrainers(normalizedTrainers);
      setClubAthletes(normalizedAthletes);
      setWeeklySchedule(normalizedWeeklySchedule);

      const builtLocations = buildTrainingLocationOptions(clubStructures);
      const normalizedLocations =
        builtLocations.length > 0
          ? builtLocations
          : getFallbackTrainingLocationOptions();
      setLocations(normalizedLocations);

      const formattedTrainings = normalizedTrainings
        .map((training: any) =>
          formatTrainingSession({
            training,
            categories: normalizedCategories,
            trainers: normalizedTrainers,
            athletes: normalizedAthletes,
            locations: normalizedLocations,
          }),
        )
        .filter(Boolean)
        .sort(compareTrainingsByStart) as TrainingSession[];

      setTrainings(dedupeTrainings(formattedTrainings));

      if (failedSections.length > 0) {
        setLoadWarning(
          `Alcune sezioni non sono state caricate correttamente: ${failedSections.join(", ")}.`,
        );
      } else {
        setLoadWarning(null);
      }
    } catch (error) {
      console.error("Error loading training data:", error);
      setLoadWarning(
        "Non è stato possibile caricare tutti i dati degli allenamenti. Riprova tra qualche istante.",
      );
      showToast("error", "Errore nel caricamento dei dati");
    }
  }, [activeClub?.id, showToast]);

  // Load data from database
  useEffect(() => {
    loadData();
  }, [loadData]);

  const missingWeeklyScheduleCategories = React.useMemo(
    () => findTrainingsWithMissingCategories(weeklySchedule, categories),
    [categories, weeklySchedule],
  );

  const missingUpcomingTrainingCategories = React.useMemo(
    () =>
      findTrainingsWithMissingCategories(trainings, categories, {
        scheduledOnly: true,
      }),
    [categories, trainings],
  );

  const missingCategoryPanel = React.useMemo(() => {
    const combined = [
      ...missingWeeklyScheduleCategories,
      ...missingUpcomingTrainingCategories,
    ];

    if (!combined.length) {
      return null;
    }

    const labels = Array.from(
      new Set(
        combined
          .map((item) => String(item.label || "").trim())
          .filter(Boolean),
      ),
    );
    const references = Array.from(
      new Set(
        combined.flatMap((item) =>
          Array.isArray(item.references) ? item.references : [],
        ),
      ),
    );

    return {
      labels,
      references,
      weeklyCount: missingWeeklyScheduleCategories.length,
      upcomingCount: missingUpcomingTrainingCategories.length,
    };
  }, [missingUpcomingTrainingCategories, missingWeeklyScheduleCategories]);

  const handleCleanupMissingCategories = React.useCallback(async () => {
    if (!activeClub?.id || !missingCategoryPanel?.references.length) {
      return;
    }

    const confirmed = window.confirm(
      "Rimuovere solo gli allenamenti in programma collegati a categorie non piu disponibili? Gli allenamenti storici resteranno salvati.",
    );

    if (!confirmed) {
      return;
    }

    try {
      setCleaningMissingCategories(true);
      const result = await cleanupOrphanScheduledTrainings(
        activeClub.id,
        missingCategoryPanel.references,
      );

      const removedCount =
        (Array.isArray(result?.removedWeeklyScheduleItems)
          ? result.removedWeeklyScheduleItems.length
          : 0) +
        (Array.isArray(result?.removedUpcomingTrainings)
          ? result.removedUpcomingTrainings.length
          : 0);

      await loadData();
      showToast(
        "success",
        removedCount > 0
          ? `Ripuliti ${removedCount} allenamenti programmati collegati a categorie eliminate`
          : "Nessun allenamento programmato da ripulire",
      );
    } catch (error) {
      console.error("Error cleaning orphan scheduled trainings:", error);
      showToast(
        "error",
        "Errore durante la pulizia degli allenamenti con categorie non rilevate",
      );
    } finally {
      setCleaningMissingCategories(false);
    }
  }, [activeClub?.id, loadData, missingCategoryPanel, showToast]);

  const handleAddTraining = async (trainingData: any) => {
    if (!activeClub?.id) {
      showToast("error", "Nessun club attivo selezionato");
      return;
    }

    try {
      // Map category and trainer IDs to names for display
      const selectedCategories = categories.filter((category) =>
        trainingMatchesCategory(
          { categories: trainingData.categories || [] },
          category,
        ),
      );
      const selectedTrainers = trainers.filter((trainer) =>
        trainingData.trainers?.includes(trainer.id),
      );
      const selectedLocation = findTrainingLocationOption(locations, {
        structureId: trainingData.structureId,
        fieldId: trainingData.locationId,
        locationId: trainingData.locationId,
        location: trainingData.location,
      });

      const collisionCandidate = {
        date: trainingData.date,
        time: trainingData.time,
        endTime: trainingData.endTime || null,
        locationId: selectedLocation?.fieldId || trainingData.locationId || null,
      };
      const collisions = findTrainingCollisions(trainings, collisionCandidate);

      if (
        collisions.length > 0 &&
        !window.confirm(
          `Attenzione: nel campo selezionato esistono già ${collisions.length} allenamenti nello stesso orario. Vuoi inserirlo comunque?`,
        )
      ) {
        return;
      }

      const newTraining = {
        id: `training-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: trainingData.title,
        date: trainingData.date,
        time: trainingData.time,
        endTime: trainingData.endTime || null,
        categories: trainingData.categories || [],
        category:
          selectedCategories.length > 0
            ? selectedCategories.map((cat) => cat.name).join(", ")
            : "Categoria",
        categoryId: trainingData.categories?.[0] || null,
        trainerIds: trainingData.trainers || [],
        trainer:
          selectedTrainers.length > 0
            ? selectedTrainers.map((trainer) => trainer.name).join(", ")
            : "Allenatore",
        structureId: selectedLocation?.structureId || trainingData.structureId || null,
        locationId: selectedLocation?.fieldId || trainingData.locationId || null,
        location: selectedLocation?.name || trainingData.location,
        attendees: 0,
        categoryColor: "bg-blue-500 text-white",
        status: "upcoming",
        generated: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      console.log("Saving new training to database:", newTraining);

      // Save to database
      const savedTraining = await addClubData(
        activeClub.id,
        "trainings",
        newTraining,
      );
      console.log("Training saved successfully:", savedTraining);

      // Calculate expected attendees
      const allAthletes = await getClubAthletes(activeClub.id);
      const expectedAttendees = allAthletes.filter((athlete: any) =>
        athleteMatchesAnyCategory(athlete, selectedCategories),
      ).length;

      // Update local state
      const formattedTraining: TrainingSession = {
        id: newTraining.id,
        title: newTraining.title,
        date: getTrainingDate(newTraining) || new Date(),
        time: newTraining.time,
        endTime: newTraining.endTime,
        category: newTraining.category,
        categoryId: newTraining.categoryId,
        categoryReferences: Array.isArray(newTraining.categories)
          ? newTraining.categories
          : newTraining.categoryId
            ? [newTraining.categoryId]
            : [],
        historicalCategoryName: newTraining.category,
        trainer: newTraining.trainer,
        location: newTraining.location,
        locationId: newTraining.locationId,
        structureId: newTraining.structureId,
        attendees: 0,
        categoryColor: "bg-blue-500 text-white",
        status: "upcoming",
        attendance: [],
        expectedAttendees: expectedAttendees,
      };

      setTrainings((current) =>
        dedupeTrainings([...current, formattedTraining]).sort(compareTrainingsByStart),
      );
      setShowAddTrainingModal(false);
      showToast(
        "success",
        `Allenamento ${formattedTraining.title} aggiunto e salvato con successo`,
      );
    } catch (error) {
      console.error("Error adding training:", error);
      showToast("error", "Errore durante l'aggiunta dell'allenamento");
    }
  };

  const openAttendanceSheet = React.useCallback(
    (training: TrainingSession) => {
      const eventCategories = categories.filter((category) =>
        trainingMatchesCategory(training, category),
      );
      const existingEntries = normalizeTrainingAttendanceEntries(
        training.attendance,
      );
      const existingEntriesByAthleteId = new Map(
        existingEntries.map((entry) => [entry.athleteId, entry]),
      );
      const activeAthletes = clubAthletes.filter(
        (athlete: any) =>
          !athlete.data?.status || athlete.data.status === "active",
      );
      const categoryAthletes =
        eventCategories.length > 0
          ? activeAthletes.filter((athlete: any) =>
              athleteMatchesAnyCategory(athlete, eventCategories),
            )
          : activeAthletes;
      const savedOutsideCategoryAthletes = clubAthletes.filter(
        (athlete: any) =>
          existingEntriesByAthleteId.has(athlete.id) &&
          !categoryAthletes.some(
            (candidate: any) => candidate.id === athlete.id,
          ),
      );
      const visibleAthletes = [...categoryAthletes, ...savedOutsideCategoryAthletes]
        .reduce<any[]>((collection, athlete) => {
          if (collection.some((candidate) => candidate.id === athlete.id)) {
            return collection;
          }

          collection.push(athlete);
          return collection;
        }, [])
        .sort(compareAthletesByLastName);

      setAttendanceModalState({
        training,
        athletes: visibleAthletes.map((athlete) =>
          buildTrainingAttendanceAthlete({
            athlete,
            eventCategories,
            existingEntry: existingEntriesByAthleteId.get(athlete.id),
          }),
        ),
        clubAthletes: activeAthletes
          .map((athlete: any) =>
            buildTrainingAttendanceAthlete({
              athlete,
              eventCategories,
              existingEntry: existingEntriesByAthleteId.get(athlete.id),
            }),
          )
          .sort((left, right) =>
            compareAthletesByLastName(
              left.rawAthlete || {
                first_name: left.firstName,
                last_name: left.lastName,
              },
              right.rawAthlete || {
                first_name: right.firstName,
                last_name: right.lastName,
              },
            ),
          ),
      });
    },
    [categories, clubAthletes],
  );

  React.useEffect(() => {
    if (
      requestedFocus !== "attendance" ||
      !requestedTrainingId ||
      autoOpenedAttendanceId === requestedTrainingId
    ) {
      return;
    }

    const requestedTraining = trainings.find(
      (training) => training.id === requestedTrainingId,
    );

    if (!requestedTraining) {
      return;
    }

    setActiveTab("daily");
    setDate(requestedTraining.date);
    setCalendarDate(requestedTraining.date);

    if (canRecordTrainingAttendance(requestedTraining)) {
      openAttendanceSheet(requestedTraining);
    }

    setAutoOpenedAttendanceId(requestedTrainingId);
  }, [
    autoOpenedAttendanceId,
    openAttendanceSheet,
    requestedFocus,
    requestedTrainingId,
    trainings,
  ]);

  const handleSaveAttendanceSheet = React.useCallback(
    async (data: {
      trainingId: string;
      attendance: {
        athleteId: string;
        present: boolean;
        notes: string;
        isExtraCategory?: boolean;
        isManualExtra?: boolean;
        categoryMembershipType?: string | null;
      }[];
    }) => {
      if (!activeClub?.id) {
        showToast("error", "Nessun club attivo selezionato");
        return;
      }

      try {
        await saveTrainingAttendance(activeClub.id, data.trainingId, data.attendance);
        setTrainings((currentTrainings) =>
          currentTrainings.map((training) =>
            training.id === data.trainingId
              ? {
                  ...training,
                  attendance: data.attendance,
                  attendees: data.attendance.filter((entry) => entry.present)
                    .length,
                }
              : training,
          ),
        );
        setAttendanceModalState(null);
        showToast("success", "Presenze salvate con successo");
      } catch (error) {
        console.error("Error saving attendance:", error);
        showToast("error", "Errore nel salvataggio delle presenze");
      }
    },
    [activeClub?.id, showToast],
  );

  // Filter trainings for the selected date (including all statuses)
  const filteredTrainings = trainings
    .filter((training) => Boolean(date && isTrainingOnDate(training, date)))
    .sort(compareTrainingsByStart);

  const getDerivedStatus = (training: TrainingSession) =>
    getTrainingPhase({
      date: training.date,
      time: training.time,
      endTime: training.endTime,
      status: training.status,
    });

  const getStatusBadge = (
    status:
      | TrainingSession["status"]
      | "in_progress",
  ) => {
    switch (status) {
      case "upcoming":
        return (
          <Badge className="bg-blue-100 text-blue-800">In Programma</Badge>
        );
      case "in_progress":
        return <Badge className="bg-amber-100 text-amber-800">In corso</Badge>;
      case "completed":
        return (
          <Badge className="bg-green-100 text-green-800">Completato</Badge>
        );
      case "concluded":
        return <Badge className="bg-blue-100 text-blue-800">Concluso</Badge>;
      case "cancelled":
      case "annullato":
        return <Badge className="bg-red-100 text-red-800">Annullato</Badge>;
      default:
        return null;
    }
  };

  const getTrainingAttendanceStatus = (training: TrainingSession) => {
    const hasAttendance =
      Array.isArray(training.attendance) && training.attendance.length > 0;
    const canTakeAttendance = canRecordTrainingAttendance(training);

    if (hasAttendance) {
      return {
        tone: "saved" as const,
        label: "Presenze salvate",
        className: "text-green-600",
      };
    }

    if (canTakeAttendance) {
      return {
        tone: "missing" as const,
        label: "Presenze mancanti",
        className: "text-red-600",
      };
    }

    return null;
  };

  const getTrainingAttendanceSummary = (training: TrainingSession) => {
    const present = Array.isArray(training.attendance)
      ? training.attendance.filter((entry: any) => entry?.present).length
      : typeof training.attendees === "number"
        ? training.attendees
        : 0;
    const total =
      typeof training.expectedAttendees === "number" &&
      training.expectedAttendees > 0
        ? training.expectedAttendees
        : 0;

    return { present, total };
  };

  // Navigation functions for day switching
  const goToPreviousDay = () => {
    if (date) {
      const previousDay = new Date(date);
      previousDay.setDate(date.getDate() - 1);
      setDate(previousDay);
    }
  };

  const goToNextDay = () => {
    if (date) {
      const nextDay = new Date(date);
      nextDay.setDate(date.getDate() + 1);
      setDate(nextDay);
    }
  };

  const goToToday = () => {
    setDate(new Date());
  };

  // Get trainings for calendar view
  const getTrainingsForDate = (targetDate: Date) => {
    return trainings
      .filter((training) => isTrainingOnDate(training, targetDate))
      .sort(compareTrainingsByStart);
  };

  // Check if a date has trainings
  const hasTrainings = (targetDate: Date) => {
    return getTrainingsForDate(targetDate).length > 0;
  };

  const calendarMonthAnchor = React.useMemo(() => {
    const sourceDate = calendarDate || date || new Date();
    return new Date(sourceDate.getFullYear(), sourceDate.getMonth(), 1);
  }, [calendarDate, date]);

  const calendarMonthDays = React.useMemo(() => {
    const firstWeekdayOffset = (calendarMonthAnchor.getDay() + 6) % 7;
    const daysInMonth = new Date(
      calendarMonthAnchor.getFullYear(),
      calendarMonthAnchor.getMonth() + 1,
      0,
    ).getDate();
    const days: Array<Date | null> = Array.from(
      { length: firstWeekdayOffset },
      () => null,
    );

    for (let day = 1; day <= daysInMonth; day += 1) {
      days.push(
        new Date(
          calendarMonthAnchor.getFullYear(),
          calendarMonthAnchor.getMonth(),
          day,
        ),
      );
    }

    while (days.length % 7 !== 0) {
      days.push(null);
    }

    return days;
  }, [calendarMonthAnchor]);

  const calendarMonthLabel = calendarMonthAnchor.toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });

  const goToCalendarMonth = (offset: number) => {
    setCalendarDate(
      new Date(
        calendarMonthAnchor.getFullYear(),
        calendarMonthAnchor.getMonth() + offset,
        1,
      ),
    );
  };

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-gray-50 dark:bg-gray-900">
      <div className="shrink-0">
        <Sidebar />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0">
          <Header title="Allenamenti" />
        </div>
        <main className={dashboardMainClassName}>
          <DashboardPageContainer className="min-w-0 max-w-7xl">
            <SharedPageHeader
              title="Allenamenti"
              subtitle="Pianifica e gestisci il calendario degli allenamenti."
            />
            <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
              <h2 className="text-xl font-semibold">Calendario Allenamenti</h2>
              <Button
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
                onClick={() => setShowAddTrainingModal(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Nuovo Allenamento
              </Button>
            </div>

            {loadWarning ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {loadWarning}
              </div>
            ) : null}

            <Tabs
              value={activeTab}
              onValueChange={(value) =>
                setActiveTab(value === "calendar" ? "calendar" : "daily")
              }
              className="flex w-full min-w-0 flex-col"
            >
              <TabsList className="grid h-auto w-full grid-cols-1 gap-1 sm:grid-cols-2">
                <TabsTrigger value="daily">Vista Giornaliera</TabsTrigger>
                <TabsTrigger value="calendar">Calendario Storico</TabsTrigger>
              </TabsList>

              <TabsContent value="daily" className="min-w-0 space-y-6 pt-1">
                <Card className="overflow-hidden">
                  <CardHeader className="flex flex-col gap-4 pb-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start sm:gap-4">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={goToPreviousDay}
                        className="h-8 w-8"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>

                      <div className="min-w-0 flex-1 text-center sm:flex-none">
                        <CardTitle className="text-base capitalize sm:text-lg">
                          {date?.toLocaleDateString("it-IT", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={goToToday}
                          className="mt-1 text-xs text-blue-600 hover:text-blue-800"
                        >
                          Vai a oggi
                        </Button>
                      </div>

                      <Button
                        variant="outline"
                        size="icon"
                        onClick={goToNextDay}
                        className="h-8 w-8"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-2 sm:self-end">
                      {/* Quick day navigation */}
                      <div className="hidden md:flex gap-1">
                        {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map(
                          (dayAbbr, dayIndex) => {
                            const today = new Date();
                            const startOfWeek = new Date(today);
                            startOfWeek.setDate(
                              today.getDate() -
                                today.getDay() +
                                (today.getDay() === 0 ? -6 : 1),
                            );
                            const currentDay = new Date(startOfWeek);
                            currentDay.setDate(
                              startOfWeek.getDate() + dayIndex,
                            );

                            const isSelected =
                              date &&
                              currentDay.getDate() === date.getDate() &&
                              currentDay.getMonth() === date.getMonth() &&
                              currentDay.getFullYear() === date.getFullYear();

                            const dayHasTrainings = hasTrainings(currentDay);

                            return (
                              <Button
                                key={dayAbbr}
                                variant={isSelected ? "default" : "ghost"}
                                size="sm"
                                onClick={() => setDate(currentDay)}
                                className={`relative h-8 w-12 text-xs ${
                                  isSelected
                                    ? "bg-blue-600 hover:bg-blue-700"
                                    : ""
                                }`}
                              >
                                {dayAbbr}
                                {dayHasTrainings && (
                                  <div className="absolute -top-1 -right-1 h-2 w-2 bg-green-500 rounded-full" />
                                )}
                              </Button>
                            );
                          },
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="min-w-0">
                    {filteredTrainings.length > 0 ? (
                      <div className="space-y-4">
                        {filteredTrainings.map((training) => {
                          const derivedStatus = getDerivedStatus(training);
                          const attendanceStatus =
                            getTrainingAttendanceStatus(training);
                          const canManageAttendance =
                            derivedStatus !== "annullato" &&
                            canRecordTrainingAttendance(training);
                          const attendanceSummary =
                            getTrainingAttendanceSummary(training);

                          return (
                            <div
                              key={getTrainingStableKey(training)}
                              className="min-w-0 rounded-xl border p-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
                            >
                              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  <Badge
                                    className={cn(
                                      "w-fit rounded-full px-3 py-1 text-[11px] font-semibold shadow-sm ring-1 ring-black/5",
                                      training.categoryColor,
                                    )}
                                  >
                                    {training.category}
                                  </Badge>
                                  <h4 className="min-w-0 pr-2 text-base font-medium break-words">
                                    {training.title}
                                  </h4>
                                </div>
                              </div>
                              <div className="min-w-0 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                                <div className="flex min-w-0 items-center gap-2">
                                <Clock className="h-3.5 w-3.5 shrink-0" />
                                <span className="min-w-0 break-words">
                                  {training.time}
                                  {training.endTime
                                    ? ` - ${training.endTime}`
                                    : ""}
                                </span>
                              </div>
                              <div className="flex min-w-0 items-center gap-2">
                                <MapPin className="h-3.5 w-3.5 shrink-0" />
                                <span className="min-w-0 break-words">{training.location}</span>
                              </div>
                              <div className="flex min-w-0 items-center gap-2">
                                <Users className="h-3.5 w-3.5 shrink-0" />
                                <span className="min-w-0 break-words">
                                  {training.trainer} ·{" "}
                                  {attendanceSummary.present}/
                                  {attendanceSummary.total} Atleti
                                </span>
                              </div>
                              </div>
                              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex flex-wrap items-center gap-2">
                                {getStatusBadge(derivedStatus)}
                                {/* Attendance Status Icon */}
                                {attendanceStatus ? (
                                  <div className={`flex items-center gap-1 ${attendanceStatus.className}`}>
                                    {attendanceStatus.tone === "saved" ? (
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                                      </svg>
                                    ) : (
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <line
                                          x1="15"
                                          y1="9"
                                          x2="9"
                                          y2="15"
                                        ></line>
                                        <line
                                          x1="9"
                                          y1="9"
                                          x2="15"
                                          y2="15"
                                        ></line>
                                      </svg>
                                    )}
                                    <span className="text-xs">
                                      {attendanceStatus.label}
                                    </span>
                                  </div>
                                ) : null}
                                </div>
                                <div className="flex flex-wrap gap-2 sm:justify-end">
                                <>
                                  {canManageAttendance && (
                                    <Button
                                      size="sm"
                                      className="bg-blue-600 hover:bg-blue-700 mr-2"
                                      onClick={async () => {
                                        openAttendanceSheet(training);
                                      }}
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                      {attendanceStatus?.tone === "saved"
                                        ? "Modifica Presenze"
                                        : "Presenze"}
                                    </Button>
                                  )}
                                  {derivedStatus !== "concluded" &&
                                    derivedStatus !== "annullato" && (
                                      <Button
                                        size="sm"
                                        className="bg-amber-600 hover:bg-amber-700 mr-2"
                                        onClick={() => {
                                          setEditingTraining(training);
                                          setShowEditTrainingModal(true);
                                        }}
                                      >
                                        <svg
                                          xmlns="http://www.w3.org/2000/svg"
                                          width="14"
                                          height="14"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          className="mr-1"
                                        >
                                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11l5 5v-11a2 2 0 0 0-2-2z"></path>
                                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                        </svg>
                                        Modifica
                                      </Button>
                                    )}
                                  {derivedStatus !== "annullato" &&
                                    derivedStatus !== "concluded" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-orange-600 border-orange-600 hover:bg-orange-50 mr-2"
                                      onClick={async () => {
                                        if (
                                          !window.confirm(
                                            "Vuoi davvero annullare questo allenamento?",
                                          )
                                        ) {
                                          return;
                                        }

                                        try {
                                          await updateClubDataItem(
                                            activeClub.id,
                                            "trainings",
                                            training.id,
                                            { status: "annullato" },
                                          );

                                          const updatedTrainings = trainings.map((t) =>
                                            t.id === training.id
                                              ? {
                                                  ...t,
                                                  status: "annullato" as const,
                                                }
                                              : t,
                                          );
                                          setTrainings(updatedTrainings);
                                          showToast(
                                            "success",
                                            "Allenamento annullato",
                                          );
                                        } catch (error) {
                                          console.error(
                                            "Error cancelling training:",
                                            error,
                                          );
                                          showToast(
                                            "error",
                                            "Errore durante l'annullamento",
                                          );
                                        }
                                      }}
                                    >
                                      Annulla
                                    </Button>
                                  )}
                                  {derivedStatus === "annullato" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-emerald-600 border-emerald-600 hover:bg-emerald-50 mr-2"
                                      onClick={async () => {
                                        if (
                                          !window.confirm(
                                            "Vuoi ripristinare questo allenamento annullato?",
                                          )
                                        ) {
                                          return;
                                        }

                                        try {
                                          await updateClubDataItem(
                                            activeClub.id,
                                            "trainings",
                                            training.id,
                                            { status: "upcoming" },
                                          );

                                          const updatedTrainings = trainings.map((t) =>
                                            t.id === training.id
                                              ? {
                                                  ...t,
                                                  status: "upcoming" as const,
                                                }
                                              : t,
                                          );
                                          setTrainings(updatedTrainings);
                                          showToast(
                                            "success",
                                            "Allenamento ripristinato",
                                          );
                                        } catch (error) {
                                          console.error(
                                            "Error restoring training:",
                                            error,
                                          );
                                          showToast(
                                            "error",
                                            "Errore durante il ripristino",
                                          );
                                        }
                                      }}
                                    >
                                      Ripristina
                                    </Button>
                                  )}
                                    <div className="relative">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="p-1 h-8 w-8"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const rect =
                                            e.currentTarget.getBoundingClientRect();
                                          const dropdown =
                                            document.createElement("div");
                                          dropdown.className =
                                            "fixed bg-white dark:bg-gray-800 border rounded-md shadow-lg z-50 p-1";
                                          dropdown.style.left = `${rect.left}px`;
                                          dropdown.style.top = `${rect.bottom + 5}px`;
                                          dropdown.innerHTML = `
                                          <button class="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded flex items-center gap-2" id="delete-training-${training.id}">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                              <polyline points="3 6 5 6 21 6"></polyline>
                                              <path d="m19 6-1 14c0 1-1 2-2 2H8c-1 0-2-1-2-2L5 6"></path>
                                              <path d="m10 11 0 6"></path>
                                              <path d="m14 11 0 6"></path>
                                              <path d="M5 6l1-2c0-1 1-2 2-2h8c1 0 2 1 2 2l1 2"></path>
                                            </svg>
                                            Elimina
                                          </button>
                                        `;
                                          document.body.appendChild(dropdown);

                                          const deleteBtn =
                                            document.getElementById(
                                              `delete-training-${training.id}`,
                                            );
                                          deleteBtn?.addEventListener(
                                            "click",
                                            () => {
                                              dropdown.remove();
                                              setTrainingToDelete(training);
                                              setShowDeleteTraining(true);
                                            },
                                          );

                                          // Close dropdown when clicking outside
                                          const closeDropdown = (
                                            e: MouseEvent,
                                          ) => {
                                            if (
                                              !dropdown.contains(
                                                e.target as Node,
                                              )
                                            ) {
                                              dropdown.remove();
                                              document.removeEventListener(
                                                "click",
                                                closeDropdown,
                                              );
                                            }
                                          };
                                          setTimeout(() => {
                                            document.addEventListener(
                                              "click",
                                              closeDropdown,
                                            );
                                          }, 100);
                                        }}
                                      >
                                        <svg
                                          xmlns="http://www.w3.org/2000/svg"
                                          width="16"
                                          height="16"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        >
                                          <circle
                                            cx="12"
                                            cy="12"
                                            r="1"
                                          ></circle>
                                          <circle cx="12" cy="5" r="1"></circle>
                                          <circle
                                            cx="12"
                                            cy="19"
                                            r="1"
                                          ></circle>
                                        </svg>
                                      </Button>
                                    </div>
                                </>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-64 text-center text-gray-500 p-6">
                        <p>Nessun allenamento programmato per questa data</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

              </TabsContent>

              <TabsContent value="calendar" className="min-w-0 space-y-6">
                <Card className="overflow-hidden">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CalendarDays className="h-5 w-5" />
                      Calendario Storico Allenamenti
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="min-w-0">
                    <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
                      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-full text-slate-600 hover:bg-slate-100"
                            onClick={() => goToCalendarMonth(-1)}
                            aria-label="Mese precedente"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <div className="min-w-0 text-center">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Calendario
                            </p>
                            <h3 className="truncate text-base font-semibold capitalize text-slate-900">
                              {calendarMonthLabel}
                            </h3>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-full text-slate-600 hover:bg-slate-100"
                            onClick={() => goToCalendarMonth(1)}
                            aria-label="Mese successivo"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-slate-500">
                          {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map(
                            (weekday) => (
                              <div key={weekday}>{weekday}</div>
                            ),
                          )}
                        </div>
                        <div className="mt-2 grid grid-cols-7 gap-1.5">
                          {calendarMonthDays.map((day, index) => {
                            if (!day) {
                              return (
                                <div
                                  key={`empty-${index}`}
                                  className="h-14 rounded-xl border border-slate-100 bg-slate-50"
                                />
                              );
                            }

                            const dayTrainings = getTrainingsForDate(day);
                            const isSelected =
                              calendarDate &&
                              day.getDate() === calendarDate.getDate() &&
                              day.getMonth() === calendarDate.getMonth() &&
                              day.getFullYear() ===
                                calendarDate.getFullYear();
                            const isToday = (() => {
                              const today = new Date();
                              return (
                                day.getDate() === today.getDate() &&
                                day.getMonth() === today.getMonth() &&
                                day.getFullYear() === today.getFullYear()
                              );
                            })();

                            return (
                              <button
                                key={day.toISOString()}
                                type="button"
                                onClick={() => setCalendarDate(day)}
                                className={cn(
                                  "h-14 rounded-xl border p-1.5 text-left transition hover:border-blue-300 hover:bg-blue-50",
                                  dayTrainings.length > 0
                                    ? "border-blue-200 bg-blue-50"
                                    : "border-slate-100 bg-white",
                                  isSelected
                                    ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                                    : "text-slate-800",
                                )}
                              >
                                <span className="flex items-center justify-between gap-1">
                                  <span className="text-sm font-semibold">
                                    {day.getDate()}
                                  </span>
                                  {isToday ? (
                                    <span
                                      className={cn(
                                        "h-2 w-2 rounded-full",
                                        isSelected ? "bg-white" : "bg-blue-500",
                                      )}
                                    />
                                  ) : null}
                                </span>
                                {dayTrainings.length > 0 ? (
                                  <span
                                    className={cn(
                                      "mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                      isSelected
                                        ? "bg-white/20 text-white"
                                        : "bg-blue-100 text-blue-700",
                                    )}
                                  >
                                    {dayTrainings.length}
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Selected Date Details */}
                      <div className="min-w-0">
                        {calendarDate && (
                          <div>
                            <h3 className="font-medium mb-4">
                              Allenamenti del{" "}
                              {calendarDate.toLocaleDateString("it-IT", {
                                weekday: "long",
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                              })}
                            </h3>

                            {getTrainingsForDate(calendarDate).length > 0 ? (
                              <div className="space-y-3">
                                {getTrainingsForDate(calendarDate).map(
                                  (training) => {
                                    const attendanceStatus =
                                      getTrainingAttendanceStatus(training);
                                    const canManageAttendance =
                                      getDerivedStatus(training) !==
                                        "annullato" &&
                                      canRecordTrainingAttendance(training);
                                    const attendanceSummary =
                                      getTrainingAttendanceSummary(training);
                                    const attendanceTotalLabel =
                                      attendanceSummary.total > 0
                                        ? attendanceSummary.total
                                        : "-";

                                    return (
                                    <div
                                      key={getTrainingStableKey(training)}
                                      role={canManageAttendance ? "button" : undefined}
                                      tabIndex={canManageAttendance ? 0 : undefined}
                                      onClick={() => {
                                        if (canManageAttendance) {
                                          openAttendanceSheet(training);
                                        }
                                      }}
                                      onKeyDown={(event) => {
                                        if (
                                          canManageAttendance &&
                                          (event.key === "Enter" ||
                                            event.key === " ")
                                        ) {
                                          event.preventDefault();
                                          openAttendanceSheet(training);
                                        }
                                      }}
                                      className={cn(
                                        "rounded-xl border bg-white p-3 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40 dark:bg-gray-800",
                                        canManageAttendance && "cursor-pointer",
                                      )}
                                    >
                                      <div className="flex justify-between items-start gap-2 mb-2">
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                          <Badge
                                            className={cn(
                                              "rounded-full px-3 py-1 text-[11px] font-semibold shadow-sm ring-1 ring-black/5",
                                              training.categoryColor,
                                            )}
                                          >
                                            {training.category}
                                          </Badge>
                                          <h4 className="font-medium text-sm">
                                            {training.title}
                                          </h4>
                                        </div>
                                        {getStatusBadge(
                                          getDerivedStatus(training),
                                        )}
                                      </div>
                                      <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                                        <div className="flex items-center gap-2">
                                          <Clock className="h-3 w-3" />
                                          <span>
                                            {training.time}
                                            {training.endTime
                                              ? ` - ${training.endTime}`
                                              : ""}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <MapPin className="h-3 w-3" />
                                          <span>{training.location}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Users className="h-3 w-3" />
                                          <span>
                                            {training.trainer} •{" "}
                                            {attendanceSummary.present}/
                                            {attendanceTotalLabel} Atleti
                                          </span>
                                        </div>
                                      </div>
                                      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                                        {attendanceStatus ? (
                                          <Badge
                                            variant="outline"
                                            className={
                                              attendanceStatus.tone === "saved"
                                                ? "border-green-200 bg-green-50 text-green-700"
                                                : "border-red-200 bg-red-50 text-red-700"
                                            }
                                          >
                                            {attendanceStatus.label}
                                          </Badge>
                                        ) : null}
                                        {canManageAttendance ? (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-8"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              openAttendanceSheet(training);
                                            }}
                                          >
                                            {attendanceStatus?.tone === "saved"
                                              ? "Modifica Presenze"
                                              : "Presenze"}
                                          </Button>
                                        ) : null}
                                      </div>
                                    </div>
                                    );
                                  },
                                )}
                              </div>
                            ) : (
                              <div className="text-center py-8 text-gray-500">
                                <CalendarDays className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                                <p>
                                  Nessun allenamento programmato per questa data
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {missingCategoryPanel ? (
              <Card className="border-amber-200 bg-amber-50/80">
                <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-full bg-amber-100 p-2 text-amber-700">
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-amber-900">
                          Categorie non rilevate nel programma allenamenti
                        </p>
                        <p className="text-sm text-amber-800">
                          Alcuni allenamenti in programma fanno riferimento a categorie che probabilmente sono state eliminate o rinominate fuori sincronizzazione.
                        </p>
                        <p className="text-xs text-amber-700">
                          Programma settimanale: {missingCategoryPanel.weeklyCount} • Allenamenti futuri: {missingCategoryPanel.upcomingCount}
                        </p>
                        {missingCategoryPanel.labels.length > 0 ? (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {missingCategoryPanel.labels.slice(0, 6).map((label) => (
                              <Badge
                                key={label}
                                variant="outline"
                                className="border-amber-300 bg-white text-amber-800"
                              >
                                {label}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 justify-end">
                    <Button
                      variant="outline"
                      className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                      disabled={cleaningMissingCategories}
                      onClick={handleCleanupMissingCategories}
                    >
                      {cleaningMissingCategories
                        ? "Pulizia in corso..."
                        : "Rimuovi allenamenti in programma"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card className="overflow-hidden" ref={scheduleSectionRef}>
              <CardHeader>
                <CardTitle>Programma Settimanale</CardTitle>
              </CardHeader>
              <CardContent className="min-w-0 overflow-x-hidden">
                {shouldRenderSchedule ? (
                  <WeeklyTrainingSchedule
                    categories={categories}
                    trainers={trainers}
                    locations={locations}
                    initialSchedule={weeklySchedule}
                    autoSave={true}
                    onSave={async (nextSchedule) => {
                      setWeeklySchedule(
                        Array.isArray(nextSchedule) ? nextSchedule : [],
                      );
                    }}
                    allowDragDrop={true}
                    onTrainingsGenerated={loadData}
                  />
                ) : (
                  <div className="h-56 animate-pulse rounded-xl border bg-slate-100" />
                )}
              </CardContent>
            </Card>
          </DashboardPageContainer>
        </main>
      </div>

      {attendanceModalState ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 p-4">
          <AttendanceSheet
            trainingId={attendanceModalState.training.id}
            trainingTitle={attendanceModalState.training.title}
            trainingDate={attendanceModalState.training.date.toISOString()}
            trainingTime={attendanceModalState.training.time}
            categoryName={attendanceModalState.training.category}
            location={attendanceModalState.training.location}
            athletes={attendanceModalState.athletes}
            clubAthletes={attendanceModalState.clubAthletes}
            onSave={handleSaveAttendanceSheet}
            onClose={() => setAttendanceModalState(null)}
          />
        </div>
      ) : null}

      {showAddTrainingModal ? (
        <AddTrainingForm
          isOpen={showAddTrainingModal}
          onClose={() => setShowAddTrainingModal(false)}
          onSubmit={handleAddTraining}
          categories={categories}
          trainers={trainers}
          locations={locations}
          selectedDate={date}
        />
      ) : null}

      {/* Edit Training Form */}
      {editingTraining && (
        <EditTrainingForm
          isOpen={showEditTrainingModal}
          onClose={() => {
            setShowEditTrainingModal(false);
            setEditingTraining(null);
          }}
          onSubmit={async (updatedTraining, originalTraining) => {
            if (!activeClub?.id) {
              showToast("error", "Nessun club attivo selezionato");
              return;
            }

            try {
              const resolvedLocationId =
                locations.find(
                  (location) => location.name === updatedTraining.location,
                )?.id || null;
              const collisions = findTrainingCollisions(
                trainings,
                {
                  id: updatedTraining.id,
                  date: updatedTraining.date,
                  time: updatedTraining.time,
                  endTime: updatedTraining.endTime || null,
                  locationId: resolvedLocationId,
                },
                { ignoreId: updatedTraining.id },
              );

              if (
                collisions.length > 0 &&
                !window.confirm(
                  `Attenzione: nel campo selezionato esistono già ${collisions.length} allenamenti nella stessa fascia oraria. Vuoi salvare comunque le modifiche?`,
                )
              ) {
                return;
              }

              // Prepare the update data
              const updateData = {
                title: updatedTraining.title,
                date: updatedTraining.date,
                time: updatedTraining.time,
                endTime: updatedTraining.endTime || null,
                location: updatedTraining.location,
                /*
                  Allenatori e categorie si salvano per intero.

                  Qui `trainerIds` veniva riscritto con **un** solo id, quello
                  scelto in una tendina singola: un allenamento con tre
                  allenatori, aperto in modifica e salvato, ne perdeva due.
                  Le categorie non venivano toccate affatto, quindi non c'era
                  modo di cambiarle dopo la creazione.
                */
                trainerIds: updatedTraining.trainerIds,
                trainer:
                  trainers
                    .filter((tr) => updatedTraining.trainerIds.includes(tr.id))
                    .map((tr) => tr.name)
                    .join(", ") || editingTraining.trainer,
                categories: updatedTraining.categories,
                categoryId: updatedTraining.categories[0] || null,
                category:
                  categories
                    .filter((category) =>
                      updatedTraining.categories.includes(category.id),
                    )
                    .map((category) => category.name)
                    .join(", ") || editingTraining.category,
                locationId: resolvedLocationId,
                updated_at: new Date().toISOString(),
              };

              console.log(
                "Updating training in database:",
                updatedTraining.id,
                updateData,
              );

              // Save to database
              await updateClubDataItem(
                activeClub.id,
                "trainings",
                updatedTraining.id,
                updateData,
              );

              console.log("Training updated successfully in database");

              // Update the training in the local state
              const updatedTrainings = trainings.map((t) =>
                t.id === updatedTraining.id
                  ? {
                      ...t,
                      title: updatedTraining.title,
                      date: new Date(updatedTraining.date),
                      time: updatedTraining.time,
                      endTime: updatedTraining.endTime || null,
                      location: updatedTraining.location,
                      locationId: resolvedLocationId,
                      trainer: updateData.trainer,
                      category: updateData.category,
                      categoryId: updateData.categoryId,
                      categoryReferences: updatedTraining.categories,
                    }
                  : t,
              );
              setTrainings(updatedTrainings);
              showToast(
                "success",
                `Allenamento ${updatedTraining.title} modificato e salvato con successo`,
              );
            } catch (error) {
              console.error("Error updating training:", error);
              showToast("error", "Errore durante la modifica dell'allenamento");
            }
          }}
          training={{
            id: editingTraining.id,
            title: editingTraining.title,
            date: editingTraining.date.toISOString().split("T")[0],
            time: editingTraining.time,
            endTime: editingTraining.endTime || "",
            location: editingTraining.location,
            /*
              Gli allenatori si ricavano dai nomi solo se il record non porta
              gia gli id: i record piu vecchi hanno solo la stringa unita.
            */
            trainerIds:
              editingTraining.trainerIds?.length
                ? editingTraining.trainerIds
                : trainers
                    .filter((trainer) =>
                      editingTraining.trainer
                        ?.split(",")
                        .map((name) => name.trim())
                        .includes(trainer.name),
                    )
                    .map((trainer) => trainer.id),
            categories: editingTraining.categoryReferences || [],
          }}
          trainers={trainers}
          categories={categories}
          locations={locations.map((loc) => loc.name)}
        />
      )}

      <AlertDialog
        open={showDeleteTraining}
        onOpenChange={(open) => {
          if (!open) {
            setShowDeleteTraining(false);
            setTrainingToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare l&apos;allenamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {trainingToDelete?.title
                ? `«${trainingToDelete.title}» verra rimosso dal calendario. L'operazione non puo essere annullata.`
                : "L'allenamento verra rimosso dal calendario. L'operazione non puo essere annullata."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={async (event) => {
                event.preventDefault();
                if (!trainingToDelete || !activeClub?.id) return;

                try {
                  await deleteClubDataItem(
                    activeClub.id,
                    "trainings",
                    trainingToDelete.id,
                  );

                  setTrainings(
                    trainings.filter((t) => t.id !== trainingToDelete.id),
                  );
                  showToast("success", "Allenamento eliminato con successo");
                } catch (error) {
                  console.error("Error deleting training:", error);
                  showToast("error", "Errore durante l'eliminazione");
                } finally {
                  setShowDeleteTraining(false);
                  setTrainingToDelete(null);
                }
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
