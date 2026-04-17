"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
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
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from "lucide-react";
import { useToast } from "@/components/ui/toast-notification";
import { useAuth } from "@/components/providers/AuthProvider";
import { PinInput } from "@/components/ui/pin-input";
import {
  getParticipationCategoryBadgeLabel,
  getParticipationCategoryContext,
  getPrimaryAthleteCategoryMembership,
} from "@/lib/athlete-category-memberships";
import {
  athleteMatchesAnyCategory,
} from "@/lib/category-utils";
import {
  getClubCategories,
  getClubTrainings,
  getClubTrainers,
  getClubWeeklySchedule,
  getClubStructures,
  addClubData,
  updateClubDataItem,
  deleteClubDataItem,
  saveTrainingAttendance,
  getClubAthletes,
  getClubPaymentPin,
} from "@/lib/simplified-db";
import {
  buildTrainingLocationOptions,
  findTrainingLocationOption,
  getFallbackTrainingLocationOptions,
} from "@/lib/training-location-options";
import {
  canRecordTrainingAttendance,
  compareTrainingsByStart,
  findTrainingCollisions,
  getTrainingCategoryColor,
  getTrainingCategoryLabel,
  getTrainingDate,
  getTrainingEndTime,
  getTrainingPhase,
  getTrainingStartTime,
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

const TrainingCalendar = dynamic(
  () => import("@/components/ui/calendar").then((module) => module.Calendar),
  {
    ssr: false,
    loading: () => (
      <div className="h-[320px] animate-pulse rounded-md border bg-slate-100" />
    ),
  },
);

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
  trainer: string;
  location: string;
  locationId?: string | null;
  structureId?: string | null;
  attendees: number;
  categoryColor: string;
  status: "upcoming" | "completed" | "cancelled" | "annullato" | "concluded";
  attendance?: any[];
  expectedAttendees?: number;
}

type AttendanceSheetAthlete = {
  id: string;
  name: string;
  avatar?: string;
  present?: boolean;
  notes?: string;
  medicalCertExpiry?: string | null;
  participationContext?: "primary" | "secondary" | "extra";
  participationBadgeLabel?: string | null;
  isExtraCategory?: boolean;
  isManualExtra?: boolean;
  primaryCategoryName?: string | null;
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
    trainer: getTrainingTrainerLabel(training, trainers),
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
    name: `${athlete.first_name || ""} ${athlete.last_name || ""}`.trim() || "Atleta",
    avatar:
      athlete.avatar_url ||
      athlete.data?.avatar ||
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(`${athlete.first_name || "atleta"}-${athlete.last_name || ""}`)}`,
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
  };
};

export default function TrainingPage() {
  const [date, setDate] = React.useState<Date | undefined>(undefined);
  const [activeTab, setActiveTab] = React.useState<"daily" | "calendar">(
    "daily",
  );
  const [trainers, setTrainers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [trainings, setTrainings] = React.useState<TrainingSession[]>([]);
  const [weeklySchedule, setWeeklySchedule] = React.useState<any[]>([]);
  const [clubAthletes, setClubAthletes] = useState<any[]>([]);
  const [showAddTrainingModal, setShowAddTrainingModal] = useState(false);
  const [showEditTrainingModal, setShowEditTrainingModal] = useState(false);
  const [editingTraining, setEditingTraining] =
    useState<TrainingSession | null>(null);
  const [showPinInput, setShowPinInput] = useState(false);
  const [trainingToDelete, setTrainingToDelete] =
    useState<TrainingSession | null>(null);
  const [attendanceModalState, setAttendanceModalState] =
    useState<AttendanceModalState | null>(null);
  const [calendarDate, setCalendarDate] = React.useState<Date | undefined>(
    undefined,
  );
  const [shouldRenderSchedule, setShouldRenderSchedule] = useState(false);
  const scheduleSectionRef = React.useRef<HTMLDivElement | null>(null);
  const { showToast } = useToast();
  const { activeClub } = useAuth();

  // Initialize dates on client side to avoid hydration mismatch
  React.useEffect(() => {
    if (!date) setDate(new Date());
    if (!calendarDate) setCalendarDate(new Date());
  }, []);

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
      const [
        clubCategories,
        clubTrainers,
        clubStructures,
        allAthletes,
        clubTrainings,
        clubWeeklySchedule,
      ] = await Promise.all([
        getClubCategories(activeClub.id),
        getClubTrainers(activeClub.id),
        getClubStructures(activeClub.id),
        getClubAthletes(activeClub.id),
        getClubTrainings(activeClub.id),
        getClubWeeklySchedule(activeClub.id),
      ]);

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

      setTrainings(formattedTrainings);
    } catch (error) {
      console.error("Error loading training data:", error);
      showToast("error", "Errore nel caricamento dei dati");
    }
  }, [activeClub?.id, showToast]);

  // Load data from database
  useEffect(() => {
    loadData();
  }, [loadData]);

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
        [...current, formattedTraining].sort(compareTrainingsByStart),
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
        .sort((left: any, right: any) =>
          `${left.first_name || ""} ${left.last_name || ""}`
            .trim()
            .localeCompare(
              `${right.first_name || ""} ${right.last_name || ""}`.trim(),
              "it",
              { sensitivity: "base" },
            ),
        );

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
            left.name.localeCompare(right.name, "it", {
              sensitivity: "base",
            }),
          ),
      });
    },
    [categories, clubAthletes],
  );

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
        return <Badge className="bg-green-100 text-green-800">Concluso</Badge>;
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

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      <div className="shrink-0">
        <Sidebar />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0">
          <Header title="Allenamenti" />
        </div>
        <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4 pb-24 md:p-6">
          <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col space-y-5 md:space-y-6">
            <div>
              <h1 className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-3xl font-bold text-transparent md:text-4xl">
                Allenamenti
              </h1>
              <p className="mt-2 text-sm text-gray-600 md:text-base">
                Pianifica e gestisci il calendario degli allenamenti.
              </p>
            </div>
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

                          return (
                            <div
                              key={training.id}
                              className="min-w-0 rounded-xl border p-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
                            >
                              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <h4 className="min-w-0 pr-2 text-base font-medium break-words">
                                  {training.title}
                                </h4>
                              <Badge
                                className={cn(
                                  "w-fit text-xs",
                                  training.categoryColor,
                                )}
                              >
                                {training.category}
                              </Badge>
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
                                  {training.expectedAttendees || 0} atleti
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
                                        return;
                                        try {
                                          // Get all athletes from the simplified_athletes table
                                          const allAthletes =
                                            await getClubAthletes(
                                              activeClub.id,
                                            );

                                          // Get categories for this training
                                          const trainingCategories =
                                            categories.filter((cat) =>
                                              training.category.includes(
                                                cat.name,
                                              ),
                                            );
                                          const categoryIds =
                                            trainingCategories.map(
                                              (cat) => cat.id,
                                            );

                                          console.log(
                                            "Training category string:",
                                            training.category,
                                          );
                                          console.log(
                                            "Available categories:",
                                            categories,
                                          );
                                          console.log(
                                            "Matched training categories:",
                                            trainingCategories,
                                          );
                                          console.log(
                                            "Category IDs to filter by:",
                                            categoryIds,
                                          );
                                          console.log(
                                            "All athletes from database:",
                                            allAthletes,
                                          );

                                          // Filter athletes by categories if categories exist, otherwise use all athletes
                                          const realAthletes =
                                            categoryIds.length > 0
                                              ? allAthletes.filter(
                                                  (athlete) => {
                                                    const athleteCategory =
                                                      athlete.data?.category;
                                                    console.log(
                                                      `Athlete ${athlete.first_name} ${athlete.last_name} has category:`,
                                                      athleteCategory,
                                                    );
                                                    const matches =
                                                      categoryIds.includes(
                                                        athleteCategory,
                                                      );
                                                    console.log(
                                                      `Category match for ${athlete.first_name}:`,
                                                      matches,
                                                    );
                                                    return matches;
                                                  },
                                                )
                                              : allAthletes;

                                          console.log(
                                            "Filtered athletes for attendance:",
                                            realAthletes,
                                          );

                                          // If no athletes found with category filtering, show all active athletes as fallback
                                          const finalAthletes =
                                            realAthletes.length > 0
                                              ? realAthletes
                                              : allAthletes.filter(
                                                  (athlete) =>
                                                    !athlete.data?.status ||
                                                    athlete.data.status ===
                                                      "active",
                                                );

                                          console.log(
                                            "Final athletes list:",
                                            finalAthletes,
                                          );

                                          // Format athletes for the attendance sheet
                                          const formattedAthletes =
                                            finalAthletes.map((athlete) => ({
                                              id: athlete.id,
                                              name: `${athlete.first_name} ${athlete.last_name}`,
                                              avatar:
                                                athlete.data?.avatar ||
                                                `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(athlete.first_name + athlete.last_name)}`,
                                              medicalCertExpiry:
                                                athlete.data?.medicalCertExpiry ||
                                                athlete.medical_cert_expiry ||
                                                athlete.medicalCertExpiry ||
                                                null,
                                            }));

                                          console.log(
                                            "Training categories:",
                                            trainingCategories,
                                          );
                                          console.log(
                                            "Category IDs:",
                                            categoryIds,
                                          );
                                          console.log(
                                            "All athletes:",
                                            allAthletes,
                                          );
                                          console.log(
                                            "Filtered athletes:",
                                            realAthletes,
                                          );
                                          console.log(
                                            "Formatted athletes:",
                                            formattedAthletes,
                                          );

                                          // Create attendance sheet modal
                                          const attendanceContainer =
                                            document.createElement("div");
                                          attendanceContainer.className =
                                            "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4";
                                          attendanceContainer.id =
                                            "attendance-sheet-container";
                                          document.body.appendChild(
                                            attendanceContainer,
                                          );

                                          // Handle save attendance
                                          const handleSave = async (
                                            attendanceData: any[],
                                          ) => {
                                            try {
                                              await saveTrainingAttendance(
                                                activeClub.id,
                                                training.id,
                                                attendanceData,
                                              );

                                              // Update local state
                                              const updatedTrainings =
                                                trainings.map((t) =>
                                                  t.id === training.id
                                                    ? {
                                                        ...t,
                                                        attendance:
                                                          attendanceData,
                                                        attendees:
                                                          attendanceData.filter(
                                                            (entry) =>
                                                              entry.present,
                                                          ).length,
                                                      }
                                                    : t,
                                                );
                                              setTrainings(updatedTrainings);

                                              document
                                                .getElementById(
                                                  "attendance-sheet-container",
                                                )
                                                ?.remove();
                                              showToast(
                                                "success",
                                                "Presenze salvate con successo",
                                              );
                                            } catch (error) {
                                              console.error(
                                                "Error saving attendance:",
                                                error,
                                              );
                                              showToast(
                                                "error",
                                                "Errore nel salvataggio delle presenze",
                                              );
                                            }
                                          };

                                          const handleClose = () => {
                                            document
                                              .getElementById(
                                                "attendance-sheet-container",
                                              )
                                              ?.remove();
                                          };

                                          // Create attendance sheet HTML with real data
                                          const existingAttendance = Array.isArray(
                                            training.attendance,
                                          )
                                            ? training.attendance
                                            : [];
                                          const existingAttendanceMap =
                                            new Map(
                                              existingAttendance.map(
                                                (entry: any) => [
                                                  entry.athleteId,
                                                  entry,
                                                ],
                                              ),
                                            );
                                          const presentCount = existingAttendance.filter(
                                            (entry: any) => entry.present,
                                          ).length;
                                          attendanceContainer.innerHTML = `
                                          <div class="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-4xl max-h-[88vh] overflow-y-auto shadow-2xl">
                                            <div class="flex justify-between items-center mb-4">
                                              <div>
                                                <h3 class="text-xl font-medium">${training.title}</h3>
                                                <p class="text-sm text-gray-500 mt-1">${new Date(training.date).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })} • ${training.time} • ${training.category} • ${training.location}</p>
                                              </div>
                                              <button id="close-attendance" class="p-1 rounded-full hover:bg-gray-100">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                              </button>
                                            </div>
                                            
                                            <div class="space-y-4">
                                              <div class="flex justify-between items-center">
                                                <p class="text-sm">Presenti: <strong id="present-count">${presentCount}</strong> / ${formattedAthletes.length}</p>
                                                <button id="mark-all-present" class="px-3 py-1.5 text-sm border border-green-600 text-green-600 rounded-md hover:bg-green-50 flex items-center gap-1">
                                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                                  Segna tutti presenti
                                                </button>
                                              </div>
                                              
                                              ${
                                                formattedAthletes.length > 0
                                                  ? `
                                                <div class="border rounded-md">
                                                  <div class="grid grid-cols-12 gap-4 p-3 font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 text-sm">
                                                    <div class="col-span-5">Atleta</div>
                                                    <div class="col-span-2 text-center">Presenza</div>
                                                    <div class="col-span-5">Note</div>
                                                  </div>
                                                  
                                                  <div class="max-h-[300px] overflow-y-auto">
                                                    ${formattedAthletes
                                                      .map(
                                                        (athlete, idx) => {
                                                          const medicalAvailability = getMedicalCertificateAvailability(
                                                            athlete.medicalCertExpiry,
                                                          );
                                                          const medicalLabel =
                                                            getMedicalCertificateAvailabilityLabel(
                                                              medicalAvailability,
                                                            );

                                                          return `
                                                      <div class="grid grid-cols-12 gap-4 p-3 items-center ${idx !== formattedAthletes.length - 1 ? "border-b" : ""}">
                                                        <div class="col-span-5">
                                                          <div class="flex items-center gap-2 font-medium">
                                                            <span>${athlete.name}</span>
                                                            ${
                                                              medicalAvailability !== "valid"
                                                                ? `<span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-600" title="${medicalLabel.replace(/"/g, "&quot;")}">!</span>`
                                                                : ""
                                                            }
                                                          </div>
                                                          ${
                                                            medicalAvailability !== "valid"
                                                              ? `<p class="mt-1 text-xs font-medium text-amber-600">${medicalLabel}</p>`
                                                              : ""
                                                          }
                                                        </div>
                                                        <div class="col-span-2 flex justify-center">
                                                          <input type="checkbox" data-athlete-id="${athlete.id}" class="h-5 w-5 text-blue-600 rounded attendance-checkbox" ${existingAttendanceMap.get(athlete.id)?.present ? "checked" : ""}>
                                                        </div>
                                                        <div class="col-span-5">
                                                          <input type="text" data-athlete-id="${athlete.id}" placeholder="Note (opzionale)" class="w-full px-3 py-1.5 border rounded-md text-sm attendance-notes" value="${String(existingAttendanceMap.get(athlete.id)?.notes || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;")}">
                                                        </div>
                                                      </div>
                                                    `;
                                                        },
                                                      )
                                                      .join("")}
                                                  </div>
                                                </div>
                                              `
                                                  : `
                                                <div class="text-center py-8 text-gray-500">
                                                  <p>Nessun atleta trovato per le categorie di questo allenamento.</p>
                                                  <p class="text-sm mt-2">Categorie allenamento: ${training.category}</p>
                                                  <p class="text-sm mt-1">Atleti totali nel club: ${allAthletes.length}</p>
                                                  <p class="text-sm mt-1">Categorie disponibili: ${categories.map((c) => c.name).join(", ")}</p>
                                                  <button class="mt-3 px-3 py-1 bg-blue-600 text-white rounded text-sm" onclick="console.log('Debug info:', {training: '${training.category}', categories: ${JSON.stringify(categories)}, athletes: ${JSON.stringify(allAthletes.map((a) => ({ name: a.first_name + " " + a.last_name, category: a.data?.category })))}})">Mostra info debug</button>
                                                </div>
                                              `
                                              }
                                              
                                              <div class="flex justify-end mt-4">
                                                <button id="cancel-attendance" class="px-4 py-2 border rounded-md mr-2">Annulla</button>
                                                <button id="save-attendance" class="px-4 py-2 bg-blue-600 text-white rounded-md flex items-center gap-1" ${formattedAthletes.length === 0 ? "disabled" : ""}>
                                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                                                  Salva Presenze
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        `;

                                          // Add event listeners
                                          document
                                            .getElementById("close-attendance")
                                            ?.addEventListener(
                                              "click",
                                              handleClose,
                                            );
                                          document
                                            .getElementById("cancel-attendance")
                                            ?.addEventListener(
                                              "click",
                                              handleClose,
                                            );

                                          // Update present count when checkboxes change
                                          const updatePresentCount = () => {
                                            const checkedBoxes =
                                              document.querySelectorAll(
                                                ".attendance-checkbox:checked",
                                              );
                                            const presentCountEl =
                                              document.getElementById(
                                                "present-count",
                                              );
                                            if (presentCountEl) {
                                              presentCountEl.textContent =
                                                checkedBoxes.length.toString();
                                            }
                                          };

                                          document
                                            .querySelectorAll(
                                              ".attendance-checkbox",
                                            )
                                            .forEach((checkbox) => {
                                              checkbox.addEventListener(
                                                "change",
                                                updatePresentCount,
                                              );
                                            });

                                          document
                                            .getElementById("mark-all-present")
                                            ?.addEventListener("click", () => {
                                              const checkboxes =
                                                document.querySelectorAll(
                                                  ".attendance-checkbox",
                                                );
                                              checkboxes.forEach((checkbox) => {
                                                (
                                                  checkbox as HTMLInputElement
                                                ).checked = true;
                                              });
                                              updatePresentCount();
                                            });

                                          document
                                            .getElementById("save-attendance")
                                            ?.addEventListener("click", () => {
                                              const attendanceData =
                                                formattedAthletes.map(
                                                  (athlete) => {
                                                    const checkbox =
                                                      document.querySelector(
                                                        `input[data-athlete-id="${athlete.id}"].attendance-checkbox`,
                                                      ) as HTMLInputElement;
                                                    const notesInput =
                                                      document.querySelector(
                                                        `input[data-athlete-id="${athlete.id}"].attendance-notes`,
                                                      ) as HTMLInputElement;
                                                    return {
                                                      athleteId: athlete.id,
                                                      present:
                                                        checkbox?.checked ||
                                                        false,
                                                      notes:
                                                        notesInput?.value || "",
                                                    };
                                                  },
                                                );
                                              handleSave(attendanceData);
                                            });
                                        } catch (error) {
                                          console.error(
                                            "Error loading athletes:",
                                            error,
                                          );
                                          showToast(
                                            "error",
                                            "Errore nel caricamento degli atleti",
                                          );
                                        }
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
                                              setShowPinInput(true);
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
                    <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
                      {/* Calendar */}
                      <div className="min-w-0">
                        {activeTab === "calendar" ? (
                          <TrainingCalendar
                            mode="single"
                            selected={calendarDate}
                            onSelect={setCalendarDate}
                            className="rounded-md border"
                            modifiers={{
                              hasTraining: (date) => hasTrainings(date),
                            }}
                            modifiersStyles={{
                              hasTraining: {
                                backgroundColor: "#dbeafe",
                                color: "#1e40af",
                                fontWeight: "bold",
                              },
                            }}
                          />
                        ) : null}
                        <div className="mt-4 text-sm text-gray-600">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-3 h-3 bg-blue-100 border border-blue-300 rounded" />
                            <span>Giorni con allenamenti</span>
                          </div>
                          <p>
                            Clicca su una data per vedere i dettagli degli
                            allenamenti.
                          </p>
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

                                    return (
                                    <div
                                      key={training.id}
                                      className="rounded-lg border bg-gray-50 p-3 dark:bg-gray-800"
                                    >
                                      <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-medium text-sm">
                                          {training.title}
                                        </h4>
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
                                            {training.expectedAttendees || 0}{" "}
                                            atleti
                                          </span>
                                        </div>
                                      </div>
                                      <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <Badge
                                          className={cn(
                                            "text-xs",
                                            training.categoryColor,
                                          )}
                                        >
                                          {training.category}
                                        </Badge>
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
                                            onClick={() =>
                                              openAttendanceSheet(training)
                                            }
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
          </div>
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
                trainer:
                  trainers.find((tr) => tr.id === updatedTraining.trainerId)
                    ?.name || originalTraining.trainer,
                trainerIds: updatedTraining.trainerId
                  ? [updatedTraining.trainerId]
                  : [],
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
            trainerId:
              trainers.find(
                (trainer) =>
                  editingTraining.trainer
                    ?.split(",")
                    .map((name) => name.trim())
                    .includes(trainer.name),
              )?.id || "",
            category: editingTraining.category,
          }}
          trainers={trainers}
          locations={locations.map((loc) => loc.name)}
        />
      )}

      {/* PIN Input Modal for Training Deletion */}
      <PinInput
        isOpen={showPinInput}
        onClose={() => {
          setShowPinInput(false);
          setTrainingToDelete(null);
        }}
        onSubmit={async (pin: string) => {
          if (!trainingToDelete || !activeClub?.id) return;

          try {
            // Get the club's payment PIN from database
            const clubPin = await getClubPaymentPin(activeClub.id);

            if (pin !== clubPin) {
              showToast("error", "PIN non corretto");
              return;
            }

            // Delete training from database
            await deleteClubDataItem(
              activeClub.id,
              "trainings",
              trainingToDelete.id,
            );

            // Update local state
            const updatedTrainings = trainings.filter(
              (t) => t.id !== trainingToDelete.id,
            );
            setTrainings(updatedTrainings);

            setShowPinInput(false);
            setTrainingToDelete(null);
            showToast("success", "Allenamento eliminato con successo");
          } catch (error) {
            console.error("Error deleting training:", error);
            showToast("error", "Errore durante l'eliminazione");
          }
        }}
        title="Conferma eliminazione"
        description="Inserisci il PIN del club per eliminare definitivamente questo allenamento."
      />
    </div>
  );
}
