"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Plus,
  Clock,
  MapPin,
  Users,
  Trophy,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  FileCheck,
  MoreVertical,
  Trash,
  Edit,
  UserCheck,
  AlertTriangle,
  Filter,
  Home,
  Search,
  LayoutGrid,
  Table2,
} from "lucide-react";
import { useToast } from "@/components/ui/toast-notification";
import { AddMatchForm } from "@/components/forms/AddMatchForm";
import { MultipleAddMatchForm } from "@/components/forms/MultipleAddMatchForm";
import { MatchCertificateWarningBadge } from "@/components/matches/MatchCertificateWarningBadge";
import { MatchConvocationsList } from "@/components/matches/MatchConvocationsList";
import { MatchConvocations } from "@/components/trainer/MatchConvocations";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  getClubData,
  addClubData,
  updateClubData,
  getClubAthletes,
  getClubCategories,
  getClubStructures,
  getClubTrainers,
  getClubSettings,
  saveClubSettings,
} from "@/lib/simplified-db";
import { athleteMatchesAnyCategory } from "@/lib/category-utils";
import {
  getParticipationCategoryBadgeLabel,
  getParticipationCategoryContext,
  getPrimaryAthleteCategoryMembership,
} from "@/lib/athlete-category-memberships";
import {
  buildTrainingLocationOptions,
  type TrainingLocationOption,
} from "@/lib/training-location-options";
import { formatMatchLocationLabel } from "@/lib/match-location";
import {
  getConvocatedAthleteIdsFromMatch,
  getInvalidCertificatesForConvocatedAthletes,
} from "@/lib/match-certificate-warnings";
import { normalizeMatchConvocationEntries } from "@/lib/athlete-participation-utils";
import { getAthleteDisplayName } from "@/lib/athlete-name-utils";

interface Match {
  id: string;
  title: string;
  date: Date;
  time: string;
  category: string;
  categoryId: string;
  opponent: string;
  location: string;
  trainers: string[];
  notes?: string;
  categoryColor: string;
  status: "upcoming" | "completed" | "cancelled";
  convocationsStatus?: "pending" | "completed" | "none";
  convocatedAthletes?: string[];
  [key: string]: any;
}

type MatchStatusSource = {
  status?: unknown;
  date?: unknown;
  time?: unknown;
};

const CANCELLED_MATCH_STATUSES = new Set([
  "cancelled",
  "annullata",
  "annullato",
]);

const COMPLETED_MATCH_STATUSES = new Set([
  "completed",
  "complete",
  "conclusa",
  "concluso",
  "passata",
]);

const normalizeMatchStatus = (status: unknown): Match["status"] => {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();

  if (CANCELLED_MATCH_STATUSES.has(normalized)) {
    return "cancelled";
  }

  if (COMPLETED_MATCH_STATUSES.has(normalized)) {
    return "completed";
  }

  return "upcoming";
};

const getMatchBoundaryDate = (match: MatchStatusSource) => {
  const date = new Date(match.date as any);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const timeMatches = String(match.time || "").match(/\d{1,2}:\d{2}/g) || [];
  const boundaryTime = timeMatches[timeMatches.length > 1 ? 1 : 0];

  if (!boundaryTime) {
    date.setHours(23, 59, 59, 999);
    return date;
  }

  const [hours, minutes] = boundaryTime.split(":").map(Number);
  date.setHours(hours || 0, minutes || 0, 0, 0);

  return date;
};

const getEffectiveMatchStatus = (match: MatchStatusSource): Match["status"] => {
  const normalizedStatus = normalizeMatchStatus(match.status);

  if (normalizedStatus === "cancelled") {
    return "cancelled";
  }

  const boundaryDate = getMatchBoundaryDate(match);
  if (boundaryDate && boundaryDate < new Date()) {
    return "completed";
  }

  return normalizedStatus === "completed" ? "completed" : "upcoming";
};

const buildMatchAthleteOption = ({
  athlete,
  match,
}: {
  athlete: any;
  match: Match;
}) => {
  const existingEntry = normalizeMatchConvocationEntries(match).find(
    (entry) => entry.athleteId === athlete.id,
  );
  const context = getParticipationCategoryContext({
    athlete,
    eventCategories: [match.categoryId, match.category],
    entry: existingEntry || null,
  });
  const primaryCategory = getPrimaryAthleteCategoryMembership(athlete);

  return {
    id: athlete.id,
    name: getAthleteDisplayName(athlete) || "Atleta",
    avatar:
      athlete.avatar_url ||
      athlete.data?.avatar ||
      "",
    matchesPlayed: 0,
    matchesAbsent: 0,
    medicalCertExpiry:
      athlete.data?.medicalCertExpiry ||
      athlete.medical_cert_expiry ||
      athlete.medicalCertExpiry ||
      null,
    participationContext: context,
    participationBadgeLabel:
      context === "primary" ? null : getParticipationCategoryBadgeLabel(context),
    isExtraCategory: context === "extra" || Boolean(existingEntry?.isExtraCategory),
    isManualExtra: context === "extra" || Boolean(existingEntry?.isManualExtra),
    primaryCategoryName: primaryCategory?.categoryName || null,
  };
};

export default function MatchesPage() {
  const [date, setDate] = React.useState<Date | undefined>(undefined);
  const [matches, setMatches] = React.useState<Match[]>([]);

  // Initialize date on client side to avoid hydration mismatch
  React.useEffect(() => {
    if (!date) {
      setDate(new Date());
    }
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
      setShowAddMatchModal(true);
    }

    params.delete("action");
    const nextQuery = params.toString();
    const nextUrl = nextQuery
      ? `${window.location.pathname}?${nextQuery}`
      : window.location.pathname;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, []);

  const [categories, setCategories] = React.useState<any[]>([]);
  const [trainers, setTrainers] = React.useState<any[]>([]);
  const [athletes, setAthletes] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showAddMatchModal, setShowAddMatchModal] = useState(false);
  const [showMultipleAddMatchModal, setShowMultipleAddMatchModal] =
    useState(false);
  const [showConvocationsModal, setShowConvocationsModal] = useState(false);
  const [showEditMatchModal, setShowEditMatchModal] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [matchesViewMode, setMatchesViewMode] = useState<"cards" | "table">(
    "cards",
  );
  const [scheduleConflictsEnabled, setScheduleConflictsEnabled] =
    useState(true);
  const [homeFields, setHomeFields] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [homeLocations, setHomeLocations] = useState<TrainingLocationOption[]>(
    [],
  );
  const [athleteStatusFilter, setAthleteStatusFilter] = useState("active");
  const [matchConvocationDeadlineDays, setMatchConvocationDeadlineDays] =
    useState(2);
  const [savingMatchSettings, setSavingMatchSettings] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [historySelectedCategory, setHistorySelectedCategory] = useState("all");

  // Initialize localStorage values on client side to avoid hydration mismatch
  React.useEffect(() => {
    setIsClient(true);
    const savedConflicts = localStorage.getItem(
      "matchSettings_scheduleConflicts",
    );
    if (savedConflicts !== null) {
      setScheduleConflictsEnabled(JSON.parse(savedConflicts));
    }
    const savedFilter = localStorage.getItem(
      "matchSettings_athleteStatusFilter",
    );
    if (savedFilter) {
      setAthleteStatusFilter(savedFilter);
    }
  }, []);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictData, setConflictData] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const { showToast } = useToast();
  const { activeClub, user } = useAuth();

  // Persist settings to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(
        "matchSettings_scheduleConflicts",
        JSON.stringify(scheduleConflictsEnabled),
      );
    }
  }, [scheduleConflictsEnabled]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(
        "matchSettings_athleteStatusFilter",
        athleteStatusFilter,
      );
    }
  }, [athleteStatusFilter]);

  // Load matches, categories, and trainers from database
  useEffect(() => {
    const loadData = async () => {
      if (!activeClub?.id || !user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Load matches from club data
        const matchesData = await getClubData(activeClub.id, "matches");
        const transformedMatches = (
          Array.isArray(matchesData) ? matchesData : []
        ).map((match: any) => {
          const normalizedMatch = {
            ...match,
            date: new Date(match.date),
          };

          return {
            ...normalizedMatch,
            status: getEffectiveMatchStatus(normalizedMatch),
          };
        });
        setMatches(transformedMatches);

        // Load normalized categories from the club registry and legacy sources.
        const categoriesData = await getClubCategories(activeClub.id);
        setCategories(Array.isArray(categoriesData) ? categoriesData : []);

        // Load trainers from the dedicated trainers registry
        const trainerData = await getClubTrainers(activeClub.id);
        setTrainers(Array.isArray(trainerData) ? trainerData : []);

        const clubSettings = await getClubSettings(activeClub.id);
        const deadlineDays = Number(
          clubSettings?.matchConvocationDeadlineDays ??
            clubSettings?.match_convocation_deadline_days ??
            2,
        );
        setMatchConvocationDeadlineDays(
          Number.isFinite(deadlineDays)
            ? Math.max(0, Math.min(Math.round(deadlineDays), 30))
            : 2,
        );

        // Load club structures as available home fields / locations
        const structuresData = await getClubStructures(activeClub.id);
        const locationOptions = buildTrainingLocationOptions(structuresData);
        setHomeLocations(locationOptions);

        // Load athletes from club data
        const athletesData = await getClubAthletes(activeClub.id);
        console.log("Loaded athletes:", athletesData);
        setAthletes(athletesData);
      } catch (error) {
        console.error("Error loading matches data:", error);
        showToast("error", "Errore nel caricamento dei dati");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [activeClub, user, showToast]);

  const checkScheduleConflicts = (matchData: any) => {
    if (!scheduleConflictsEnabled) {
      return { trainerConflicts: [], categoryConflicts: [] };
    }

    const matchDate = matchData.date;
    const matchTime = matchData.time;

    // Parse match time to get start and end times
    const parseTime = (timeStr: string) => {
      const [start, end] = timeStr.split(" - ");
      return { start: start?.trim(), end: end?.trim() };
    };

    const newMatchTimes = parseTime(matchTime);

    // Function to check if two time ranges overlap (considering 3-hour duration)
    const timesOverlap = (time1: string, time2: string) => {
      const times1 = parseTime(time1);
      const times2 = parseTime(time2);

      // If either time doesn't have end time, assume 3-hour duration
      const getEndTime = (start: string, end?: string) => {
        if (end) return end;
        const [hours, minutes] = start.split(":").map(Number);
        const endHours = hours + 3;
        return `${endHours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
      };

      const start1 = times1.start;
      const end1 = getEndTime(times1.start, times1.end);
      const start2 = times2.start;
      const end2 = getEndTime(times2.start, times2.end);

      // Convert to minutes for easier comparison
      const timeToMinutes = (time: string) => {
        const [hours, minutes] = time.split(":").map(Number);
        return hours * 60 + minutes;
      };

      const start1Min = timeToMinutes(start1);
      const end1Min = timeToMinutes(end1);
      const start2Min = timeToMinutes(start2);
      const end2Min = timeToMinutes(end2);

      return start1Min < end2Min && start2Min < end1Min;
    };

    // Check for conflicts on the same day (not just same time)
    const dayMatches = matches.filter((match) => {
      if (getEffectiveMatchStatus(match) === "cancelled") return false;
      return new Date(match.date).toDateString() === matchDate.toDateString();
    });

    // Check for trainer conflicts
    const trainerConflicts = dayMatches.filter((match) => {
      const hasCommonTrainers = match.trainers.some((trainer) =>
        matchData.trainerIds.some(
          (id: string) => trainers.find((t) => t.id === id)?.name === trainer,
        ),
      );
      return hasCommonTrainers && timesOverlap(match.time, matchTime);
    });

    // Check for category conflicts
    const categoryConflicts = dayMatches.filter((match) => {
      const hasCommonCategories = matchData.categoryIds.includes(
        match.categoryId,
      );
      return hasCommonCategories && timesOverlap(match.time, matchTime);
    });

    return { trainerConflicts, categoryConflicts };
  };

  const resolveSelectedHomeLocation = (matchData: any) =>
    homeLocations.find(
      (location) =>
        location.structureId === matchData.structureId &&
        location.fieldId === matchData.fieldId,
    );

  const multipleHomeFieldOptions = React.useMemo(
    () =>
      homeLocations.map((location) => ({
        id: location.fieldId || location.id,
        name: location.label || location.name,
      })),
    [homeLocations],
  );

  const handleAddMatch = async (matchData: any) => {
    if (!activeClub?.id || !user) {
      showToast("error", "Club o utente non trovato");
      return;
    }

    if (!matchData.categoryIds || matchData.categoryIds.length === 0) {
      showToast("error", "Seleziona almeno una categoria per la gara");
      return;
    }

    // Check for scheduling conflicts
    const { trainerConflicts, categoryConflicts } =
      checkScheduleConflicts(matchData);

    if (trainerConflicts.length > 0 || categoryConflicts.length > 0) {
      let conflictMessage = "⚠️ CONFLITTI DI PROGRAMMAZIONE RILEVATI\n\n";

      if (trainerConflicts.length > 0) {
        conflictMessage += "👨‍🏫 ALLENATORI GIÀ IMPEGNATI:\n";
        trainerConflicts.forEach((match) => {
          conflictMessage += `   • ${match.title}\n     Orario: ${match.time}\n\n`;
        });
      }

      if (categoryConflicts.length > 0) {
        conflictMessage += "🏆 CATEGORIE GIÀ IMPEGNATE:\n";
        categoryConflicts.forEach((match) => {
          conflictMessage += `   • ${match.title}\n     Orario: ${match.time}\n\n`;
        });
      }

      conflictMessage +=
        "ℹ️ INFORMAZIONI:\n" +
        "   • I conflitti sono calcolati considerando una durata di 3 ore per partita\n" +
        "   • Puoi disabilitare questo controllo nelle impostazioni\n\n" +
        "❓ Desideri procedere comunque con la creazione della gara?";

      // Show custom conflict dialog instead of browser confirm
      return new Promise((resolve) => {
        setConflictData({
          message: conflictMessage,
          onConfirm: () => {
            setShowConflictDialog(false);
            resolve(true);
          },
        });
        setShowConflictDialog(true);
      }).then((shouldContinue) => {
        if (!shouldContinue) return;
        // Continue with the rest of the function
        proceedWithMatchCreation(matchData);
      });
    } else {
      proceedWithMatchCreation(matchData);
    }
  };

  const proceedWithMatchCreation = async (matchData: any) => {
    try {
      const trainerNames = matchData.trainerIds
        .map((id: string) => trainers.find((t) => t.id === id)?.name || "")
        .filter(Boolean);
      const selectedHomeLocation = resolveSelectedHomeLocation(matchData);

      // Create a match for each selected category
      const matchPromises = matchData.categoryIds.map(
        async (categoryId: string) => {
          const categoryObj = categories.find((c) => c.id === categoryId);
          const matchDateIso = matchData.date.toISOString();
          const effectiveStatus = getEffectiveMatchStatus({
            date: matchDateIso,
            time: matchData.time,
            status: "upcoming",
          });

          const newMatchData = {
            title:
              matchData.title ||
              `Partita ${categoryObj?.name || ""} vs ${matchData.opponent}`,
            date: matchDateIso,
            time: matchData.time,
            category: categoryObj?.name || "Categoria",
            categoryId: categoryId,
            opponent: matchData.opponent,
            location: matchData.location,
            isHome: matchData.isHome !== false,
            structureId: matchData.structureId || null,
            structureName: selectedHomeLocation?.structureName || null,
            fieldId: matchData.fieldId || null,
            fieldName: selectedHomeLocation?.fieldName || null,
            locationId: matchData.fieldId || null,
            trainers: trainerNames,
            notes: matchData.notes,
            matchNumber: matchData.matchNumber || "",
            categoryColor: "bg-blue-500 text-white",
            status: effectiveStatus,
            convocationsStatus: "none",
            convocatedAthletes: [],
            convocationEntries: [],
          };

          const savedMatch = await addClubData(
            activeClub.id,
            "matches",
            newMatchData,
          );

          return {
            ...savedMatch,
            date: new Date(savedMatch.date),
            status: getEffectiveMatchStatus(savedMatch),
          };
        },
      );

      const newMatches = await Promise.all(matchPromises);
      setMatches([...matches, ...newMatches]);

      const categoryNames = matchData.categoryIds
        .map((id: string) => categories.find((c) => c.id === id)?.name)
        .filter(Boolean)
        .join(", ");

      showToast("success", `Gare per ${categoryNames} aggiunte con successo`);
      setShowAddMatchModal(false);
    } catch (error) {
      console.error("Error adding match:", error);
      showToast("error", "Errore nell'aggiunta della gara");
    }
  };

  const handleEditMatch = async (matchData: any) => {
    if (!activeClub?.id || !selectedMatch) {
      showToast("error", "Errore nella modifica della gara");
      return;
    }

    try {
      const trainerNames = matchData.trainerIds
        .map((id: string) => trainers.find((t) => t.id === id)?.name || "")
        .filter(Boolean);
      const selectedHomeLocation = resolveSelectedHomeLocation(matchData);

      const categoryObj = categories.find(
        (c) => c.id === matchData.categoryIds[0],
      );

      const updatedMatchData = {
        ...selectedMatch,
        title:
          matchData.title ||
          `Partita ${categoryObj?.name || ""} vs ${matchData.opponent}`,
        date: matchData.date.toISOString(),
        time: matchData.time,
        category: categoryObj?.name || "Categoria",
        categoryId: matchData.categoryIds[0],
        opponent: matchData.opponent,
        location: matchData.location,
        isHome: matchData.isHome !== false,
        structureId: matchData.structureId || null,
        structureName: selectedHomeLocation?.structureName || null,
        fieldId: matchData.fieldId || null,
        fieldName: selectedHomeLocation?.fieldName || null,
        locationId: matchData.fieldId || null,
        trainers: trainerNames,
        notes: matchData.notes,
        matchNumber: matchData.matchNumber || "",
        status: getEffectiveMatchStatus({
          status: selectedMatch.status,
          date: matchData.date.toISOString(),
          time: matchData.time,
        }),
        updated_at: new Date().toISOString(),
      };

      // Update in database
      const currentMatches = await getClubData(activeClub.id, "matches");
      const updatedMatches = currentMatches.map((match: any) =>
        match.id === selectedMatch.id ? updatedMatchData : match,
      );
      await updateClubData(activeClub.id, "matches", updatedMatches);

      // Update local state
      const updatedLocalMatches = matches.map((match) =>
        match.id === selectedMatch.id
          ? { ...updatedMatchData, date: new Date(updatedMatchData.date) }
          : match,
      );
      setMatches(updatedLocalMatches);

      showToast("success", "Gara modificata con successo");
      setShowEditMatchModal(false);
      setSelectedMatch(null);
    } catch (error) {
      console.error("Error editing match:", error);
      showToast("error", "Errore nella modifica della gara");
    }
  };

  const handleDeleteMatch = async (matchId: string) => {
    if (!activeClub?.id) {
      showToast("error", "Club non trovato");
      return;
    }

    try {
      // Remove from database
      const currentMatches = await getClubData(activeClub.id, "matches");
      const updatedMatches = currentMatches.filter(
        (match: any) => match.id !== matchId,
      );
      await updateClubData(activeClub.id, "matches", updatedMatches);

      // Update local state
      setMatches(matches.filter((match) => match.id !== matchId));
      showToast("success", "Gara eliminata con successo");
    } catch (error) {
      console.error("Error deleting match:", error);
      showToast("error", "Errore nell'eliminazione della gara");
    }
  };

  const handleCancelMatch = async (matchId: string) => {
    if (!activeClub?.id) {
      showToast("error", "Club non trovato");
      return;
    }

    try {
      // Update in database
      const currentMatches = await getClubData(activeClub.id, "matches");
      const updatedMatches = currentMatches.map((match: any) =>
        match.id === matchId
          ? {
              ...match,
              status: "cancelled",
              updated_at: new Date().toISOString(),
            }
          : match,
      );
      await updateClubData(activeClub.id, "matches", updatedMatches);

      // Update local state
      const updatedLocalMatches = matches.map((match) =>
        match.id === matchId
          ? { ...match, status: "cancelled" as const }
          : match,
      );
      setMatches(updatedLocalMatches);
      showToast("success", "Gara annullata");
    } catch (error) {
      console.error("Error cancelling match:", error);
      showToast("error", "Errore nell'annullamento della gara");
    }
  };

  const handleOpenConvocations = (match: Match) => {
    setSelectedMatch(match);
    setShowConvocationsModal(true);
  };

  const handleOpenEditMatch = (match: Match) => {
    setSelectedMatch(match);
    setShowEditMatchModal(true);
  };

  const handleSaveConvocations = async (data: {
    matchId: string;
    convocatedAthletes: string[];
    convocationEntries: {
      athleteId: string;
      isExtraCategory?: boolean;
      isManualExtra?: boolean;
      categoryMembershipType?: string | null;
    }[];
  }) => {
    if (!activeClub?.id) {
      showToast("error", "Club non trovato");
      return;
    }

    try {
      // Update in database
      const currentMatches = await getClubData(activeClub.id, "matches");
      const updatedMatches = currentMatches.map((match: any) =>
        match.id === data.matchId
          ? {
              ...match,
              convocatedAthletes: data.convocatedAthletes,
              convocationEntries: data.convocationEntries,
              convocationsStatus: "completed",
              updated_at: new Date().toISOString(),
            }
          : match,
      );
      await updateClubData(activeClub.id, "matches", updatedMatches);

      // Update local state
      const updatedLocalMatches = matches.map((match) =>
        match.id === data.matchId
          ? {
              ...match,
              convocatedAthletes: data.convocatedAthletes,
              convocationEntries: data.convocationEntries,
              convocationsStatus: "completed" as const,
            }
          : match,
      );
      setMatches(updatedLocalMatches);
      setShowConvocationsModal(false);
    } catch (error) {
      console.error("Error saving convocations:", error);
      showToast("error", "Errore nel salvataggio delle convocazioni");
    }
  };

  const matchMatchesSelectedCategory = (match: Match) => {
    if (selectedCategory === "all") {
      return true;
    }

    const category = categories.find((item) => item.id === selectedCategory);
    return (
      match.categoryId === selectedCategory ||
      category?.name === match.category ||
      category?.id === match.category
    );
  };

  // Filter matches for the selected date
  const filteredMatches = matches.filter((match) => {
    if (!date || !(match.date instanceof Date)) return false;

    const matchDate = new Date(match.date);
    const dateMatches =
      matchDate.getDate() === date.getDate() &&
      matchDate.getMonth() === date.getMonth() &&
      matchDate.getFullYear() === date.getFullYear();

    return dateMatches && matchMatchesSelectedCategory(match);
  });

  const tableMatches = matches
    .filter(matchMatchesSelectedCategory)
    .slice()
    .sort((a, b) => {
      if (!(a.date instanceof Date) || !(b.date instanceof Date)) return 0;

      const aStatus = getEffectiveMatchStatus(a);
      const bStatus = getEffectiveMatchStatus(b);

      if (aStatus === "upcoming" && bStatus !== "upcoming") return -1;
      if (aStatus !== "upcoming" && bStatus === "upcoming") return 1;

      const leftDate = new Date(a.date).getTime();
      const rightDate = new Date(b.date).getTime();

      return aStatus === "upcoming"
        ? leftDate - rightDate
        : rightDate - leftDate;
    });

  // Function to get dates with matches for calendar highlighting
  const getMatchDates = () => {
    return matches
      .filter((match) => match.date instanceof Date)
      .map((match) => new Date(match.date));
  };

  const getStatusBadge = (match: MatchStatusSource) => {
    switch (getEffectiveMatchStatus(match)) {
      case "upcoming":
        return (
          <Badge className="bg-blue-100 text-blue-800">In Programma</Badge>
        );
      case "completed":
        return (
          <Badge className="bg-green-100 text-green-800">Conclusa</Badge>
        );
      case "cancelled":
        return <Badge className="bg-red-100 text-red-800">Annullata</Badge>;
      default:
        return null;
    }
  };

  const getConvocationStatusIcon = (status?: Match["convocationsStatus"]) => {
    switch (status) {
      case "completed":
        return (
          <div
            className="flex items-center text-green-600"
            title="Convocazioni completate"
          >
            <FileCheck className="h-4 w-4 mr-1" />
            <span className="text-xs">Convocazioni salvate</span>
          </div>
        );
      case "pending":
        return (
          <div
            className="flex items-center text-amber-600"
            title="Convocazioni in corso"
          >
            <Clock className="h-4 w-4 mr-1" />
            <span className="text-xs">Convocazioni in corso</span>
          </div>
        );
      default:
        return null;
    }
  };

  const renderMatchesDataGrid = () => (
    <Card>
      <CardHeader>
        <CardTitle>Tutte le gare</CardTitle>
      </CardHeader>
      <CardContent>
        {tableMatches.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-4 py-3 font-medium">N. gara</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Orario</th>
                  <th className="px-4 py-3 font-medium">Avversario</th>
                  <th className="px-4 py-3 font-medium">Luogo</th>
                  <th className="px-4 py-3 font-medium">Categoria</th>
                  <th className="px-4 py-3 font-medium">Stato</th>
                  <th className="px-4 py-3 font-medium">Convocazioni</th>
                  <th className="px-4 py-3 font-medium">Certificati</th>
                  <th className="px-4 py-3 font-medium">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {tableMatches.map((match, index) => {
                  const certificateWarning =
                    getInvalidCertificatesForConvocatedAthletes(match, athletes);
                  const convocatedCount =
                    getConvocatedAthleteIdsFromMatch(match).length;
                  const canManageMatch =
                    getEffectiveMatchStatus(match) === "upcoming";

                  return (
                    <tr
                      key={match.id}
                      className="cursor-pointer border-b hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => handleOpenEditMatch(match)}
                    >
                      <td className="px-4 py-3 font-medium">
                        {match.matchNumber || index + 1}
                      </td>
                      <td className="px-4 py-3">
                        {match.date instanceof Date
                          ? new Date(match.date).toLocaleDateString("it-IT")
                          : "-"}
                      </td>
                      <td className="px-4 py-3">{match.time || "-"}</td>
                      <td className="px-4 py-3">{match.opponent || "-"}</td>
                      <td className="px-4 py-3">
                        {formatMatchLocationLabel(match)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={cn("text-xs", match.categoryColor)}>
                          {match.category || "Categoria"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(match)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span>
                            {convocatedCount} convocati
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {match.convocationsStatus === "completed"
                              ? "Completate"
                              : match.convocationsStatus === "pending"
                                ? "In corso"
                                : "Mancanti"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <MatchCertificateWarningBadge
                          warning={certificateWarning}
                          compact
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {canManageMatch && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleOpenConvocations(match);
                              }}
                            >
                              <UserCheck className="h-4 w-4 mr-1" />
                              Convoca
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleOpenEditMatch(match);
                            }}
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Apri
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500">
            <Table2 className="h-12 w-12 mb-3 opacity-50" />
            <p>Nessuna gara trovata</p>
            <p className="text-sm">
              Cambia filtro categoria o aggiungi una nuova gara.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  // Function to get the start of the week (Monday) for the current date
  const getStartOfWeek = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday
    return new Date(date.setDate(diff));
  };

  // Function to navigate to previous week
  const goToPreviousWeek = () => {
    if (!date) return;
    const newDate = new Date(date);
    newDate.setDate(newDate.getDate() - 7);
    setDate(newDate);
  };

  // Function to navigate to next week
  const goToNextWeek = () => {
    if (!date) return;
    const newDate = new Date(date);
    newDate.setDate(newDate.getDate() + 7);
    setDate(newDate);
  };

  const handleSaveMatchSettings = async () => {
    if (!activeClub?.id) {
      return;
    }

    try {
      setSavingMatchSettings(true);
      const deadlineDays = Math.max(
        0,
        Math.min(Math.round(Number(matchConvocationDeadlineDays) || 2), 30),
      );
      await saveClubSettings(activeClub.id, {
        matchConvocationDeadlineDays: deadlineDays,
      });
      setMatchConvocationDeadlineDays(deadlineDays);
      showToast("success", "Impostazioni convocazioni salvate");
    } catch (error) {
      console.error("Error saving match settings:", error);
      showToast("error", "Errore nel salvataggio delle impostazioni gare");
    } finally {
      setSavingMatchSettings(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Gare e Partite" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <SharedPageHeader
              title="Gare e Partite"
              subtitle={
                loading
                  ? "Caricamento calendario gare..."
                  : "Organizza e monitora gare, partite e convocazioni."
              }
            />
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <Select
                value={selectedCategory}
                onValueChange={setSelectedCategory}
              >
                <SelectTrigger className="w-full sm:w-[240px]">
                  <SelectValue placeholder="Tutte le categorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le categorie</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <Button
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
                  onClick={() => setShowAddMatchModal(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nuova Gara
                </Button>
                <Button
                  className="w-full sm:w-auto bg-green-600 hover:bg-green-700"
                  onClick={() => setShowMultipleAddMatchModal(true)}
                >
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  Calendario
                </Button>
              </div>
            </div>

            <div className="hidden justify-end">
              <Select
                value={selectedCategory}
                onValueChange={setSelectedCategory}
              >
                <SelectTrigger className="w-full sm:w-[240px]">
                  <SelectValue placeholder="Tutte le categorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le categorie</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Card className="hidden border-blue-100 bg-blue-50/60">
              <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-blue-950">
                    Scadenza convocazioni
                  </p>
                  <p className="mt-1 text-sm text-blue-700">
                    Avvisa gli allenatori quando una gara è vicina e mancano le
                    convocazioni.
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-blue-800">
                      Convocare entro
                    </span>
                    <Input
                      type="number"
                      min={0}
                      max={30}
                      value={matchConvocationDeadlineDays}
                      onChange={(event) =>
                        setMatchConvocationDeadlineDays(
                          Math.max(
                            0,
                            Math.min(Number(event.target.value) || 0, 30),
                          ),
                        )
                      }
                      className="h-10 w-20 rounded-xl border-blue-200 bg-white"
                    />
                    <span className="text-sm text-blue-800">
                      giorni prima
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    className="border-blue-300 bg-white text-blue-700 hover:bg-blue-100"
                    disabled={savingMatchSettings}
                    onClick={handleSaveMatchSettings}
                  >
                    {savingMatchSettings ? "Salvataggio..." : "Salva"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Calendario Settimanale</CardTitle>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goToPreviousWeek}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Settimana Precedente
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDate(new Date())}
                    >
                      Oggi
                    </Button>
                    <Button variant="outline" size="sm" onClick={goToNextWeek}>
                      Settimana Successiva
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-md border">
                    {/* Weekly calendar view */}
                    <div className="grid grid-cols-7 gap-2">
                      {isClient &&
                        Array.from({ length: 7 }).map((_, index) => {
                          const startOfWeek = date
                            ? getStartOfWeek(date)
                            : getStartOfWeek(new Date());
                          const currentDate = new Date(startOfWeek);
                          currentDate.setDate(currentDate.getDate() + index);

                          const today = new Date();
                          const isToday =
                            today.toDateString() === currentDate.toDateString();
                          const isSelected =
                            date?.toDateString() === currentDate.toDateString();

                          const monthName = currentDate.toLocaleDateString(
                            "it-IT",
                            {
                              month: "long",
                              year: "numeric",
                            },
                          );

                          const dayMatches = matches.filter((match) => {
                            if (!(match.date instanceof Date)) return false;
                            const matchDate = new Date(match.date);
                            return (
                              matchDate.toDateString() ===
                                currentDate.toDateString() &&
                              matchMatchesSelectedCategory(match)
                            );
                          });

                          return (
                            <div
                              key={index}
                              className={`border rounded-md p-2 ${isToday ? "bg-blue-50 dark:bg-blue-900 border-blue-500" : ""} ${isSelected ? "ring-2 ring-blue-500" : ""} min-h-[150px] cursor-pointer transition-all hover:border-blue-400`}
                              onClick={() => setDate(new Date(currentDate))}
                            >
                              <div className="text-center mb-2 pb-1 border-b">
                                <div className="text-sm font-medium">
                                  {currentDate.toLocaleDateString("it-IT", {
                                    weekday: "short",
                                  })}
                                </div>
                                <div
                                  className={`text-lg font-bold ${isToday ? "text-blue-600 dark:text-blue-400" : ""}`}
                                >
                                  {currentDate.getDate()}
                                </div>
                                {index === 0 && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    {monthName}
                                  </div>
                                )}
                              </div>
                              <div className="space-y-1">
                                {dayMatches.length === 0 ? (
                                  <div className="text-xs text-gray-400 text-center italic">
                                    Nessuna gara
                                  </div>
                                ) : (
                                  dayMatches.map((match, idx) => {
                                    const certificateWarning =
                                      getInvalidCertificatesForConvocatedAthletes(
                                        match,
                                        athletes,
                                      );

                                    return (
                                      <div
                                        key={idx}
                                        className="text-xs p-1.5 bg-blue-100 dark:bg-blue-800 rounded mb-1"
                                      >
                                        <div className="font-medium truncate">
                                          {match.time.split(" - ")[0]} -{" "}
                                          {match.opponent}
                                        </div>
                                        <div className="flex justify-between items-center gap-1 mt-0.5">
                                          <span className="text-[10px] text-gray-600 dark:text-gray-300">
                                            {match.category}
                                          </span>
                                          <span className="flex items-center gap-1">
                                            <MatchCertificateWarningBadge
                                              warning={certificateWarning}
                                              compact
                                              className="px-1"
                                            />
                                            {match.convocationsStatus ===
                                              "completed" && (
                                              <span title="Convocazioni completate">
                                                <FileCheck className="h-3 w-3 text-green-600" />
                                              </span>
                                            )}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Tabs defaultValue="matches">
                <TabsList>
                  <TabsTrigger value="matches">Gare del Giorno</TabsTrigger>
                  <TabsTrigger value="convocations">Convocazioni</TabsTrigger>
                </TabsList>

                <TabsContent value="matches">
                  <div className="mb-4 flex justify-end">
                    <div className="inline-flex rounded-lg border bg-white p-1 dark:bg-gray-800">
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          matchesViewMode === "cards" ? "default" : "ghost"
                        }
                        onClick={() => setMatchesViewMode("cards")}
                        className="gap-2"
                      >
                        <LayoutGrid className="h-4 w-4" />
                        Card
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          matchesViewMode === "table" ? "default" : "ghost"
                        }
                        onClick={() => setMatchesViewMode("table")}
                        className="gap-2"
                      >
                        <Table2 className="h-4 w-4" />
                        Tabella
                      </Button>
                    </div>
                  </div>

                  {matchesViewMode === "table" ? (
                    renderMatchesDataGrid()
                  ) : (
                    <>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle>
                        Gare del{" "}
                        {date?.toLocaleDateString("it-IT", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {filteredMatches.length > 0 ? (
                        <div className="space-y-4">
                          {filteredMatches.map((match) => {
                            const effectiveStatus =
                              getEffectiveMatchStatus(match);
                            const canManageMatch = effectiveStatus === "upcoming";
                            const certificateWarning =
                              getInvalidCertificatesForConvocatedAthletes(
                                match,
                                athletes,
                              );

                            return (
                            <div
                              key={match.id}
                              className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                            >
                              <div className="flex justify-between items-start mb-2">
                                <h4 className="font-medium">{match.title}</h4>
                                <Badge
                                  className={cn("text-xs", match.categoryColor)}
                                >
                                  {match.category}
                                </Badge>
                              </div>
                              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                                <div className="flex items-center gap-2">
                                  <Clock className="h-3.5 w-3.5" />
                                  <span>{match.time}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Trophy className="h-3.5 w-3.5" />
                                  <span>vs {match.opponent}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <MapPin className="h-3.5 w-3.5" />
                                  <span>{formatMatchLocationLabel(match)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Users className="h-3.5 w-3.5" />
                                  <span>
                                    Allenatori: {match.trainers.join(", ")}
                                  </span>
                                </div>
                                {match.notes && (
                                  <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-md">
                                    <p className="text-sm">{match.notes}</p>
                                  </div>
                                )}
                                {getConvocationStatusIcon(
                                  match.convocationsStatus,
                                )}
                                <MatchCertificateWarningBadge
                                  warning={certificateWarning}
                                />
                              </div>
                              <div className="flex justify-between items-center mt-4">
                                <div className="flex items-center gap-4">
                                  {getStatusBadge(match)}
                                  {canManageMatch &&
                                    match.convocationsStatus === "none" && (
                                      <Badge className="bg-amber-100 text-amber-800 flex items-center gap-1">
                                        <AlertTriangle className="h-3 w-3" />
                                        Convocazioni Mancanti
                                      </Badge>
                                    )}
                                  {match.matchNumber && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium">
                                        N. Gara:
                                      </span>
                                      <span className="text-xs">
                                        {match.matchNumber}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  {canManageMatch && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="bg-green-50 text-green-600 border-green-600 hover:bg-green-100"
                                        onClick={() =>
                                          handleOpenConvocations(match)
                                        }
                                      >
                                        <UserCheck className="h-4 w-4 mr-1" />
                                        Convocazioni
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="bg-blue-50 text-blue-600 border-blue-600 hover:bg-blue-100"
                                        onClick={() =>
                                          handleOpenEditMatch(match)
                                        }
                                      >
                                        <Edit className="h-4 w-4 mr-1" />
                                        Modifica
                                      </Button>
                                    </>
                                  )}
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button size="sm" variant="ghost">
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                      {canManageMatch && (
                                        <DropdownMenuItem
                                          onClick={() => {
                                            if (
                                              confirm(
                                                "Sei sicuro di voler annullare questa gara?",
                                              )
                                            ) {
                                              handleCancelMatch(match.id);
                                            }
                                          }}
                                          className="text-amber-600"
                                        >
                                          Annulla Gara
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuItem
                                        onClick={() => {
                                          if (
                                            confirm(
                                              "Sei sicuro di voler eliminare questa gara?",
                                            )
                                          ) {
                                            handleDeleteMatch(match.id);
                                          }
                                        }}
                                        className="text-red-600"
                                      >
                                        <Trash className="h-4 w-4 mr-2" />
                                        Elimina
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>
                            </div>
                          );
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-64 text-center text-gray-500 p-6">
                          <CalendarIcon className="h-12 w-12 mb-2 opacity-50" />
                          <p>Nessuna gara programmata per questa data</p>
                          <p className="text-sm">
                            Seleziona un&apos;altra data o aggiungi una nuova gara
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="mt-6">
                    <CardHeader>
                      <CardTitle>Prossime Gare</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {matches
                          .filter((match) => {
                            if (getEffectiveMatchStatus(match) !== "upcoming") {
                              return false;
                            }
                            if (!matchMatchesSelectedCategory(match)) {
                              return false;
                            }
                            if (!(match.date instanceof Date)) return false;
                            const matchDate = new Date(match.date);
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            return matchDate >= today;
                          })
                          .sort((a, b) => {
                            if (
                              !(a.date instanceof Date) ||
                              !(b.date instanceof Date)
                            )
                              return 0;
                            return (
                              new Date(a.date).getTime() -
                              new Date(b.date).getTime()
                            );
                          })
                          .slice(0, 5)
                          .map((match) => (
                            <div
                              key={match.id}
                              className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                            >
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <h4 className="font-medium">{match.title}</h4>
                                  <p className="text-sm text-gray-500">
                                    {match.date instanceof Date
                                      ? new Date(match.date).toLocaleDateString(
                                          "it-IT",
                                          {
                                            weekday: "long",
                                            day: "numeric",
                                            month: "long",
                                          },
                                        )
                                      : "Data non disponibile"}
                                  </p>
                                </div>
                                <Badge
                                  className={cn("text-xs", match.categoryColor)}
                                >
                                  {match.category}
                                </Badge>
                              </div>
                              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                                <div className="flex items-center gap-2">
                                  <Clock className="h-3.5 w-3.5" />
                                  <span>{match.time}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Trophy className="h-3.5 w-3.5" />
                                  <span>vs {match.opponent}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <MapPin className="h-3.5 w-3.5" />
                                  <span>{formatMatchLocationLabel(match)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Users className="h-3.5 w-3.5" />
                                  <span>
                                    Allenatori: {match.trainers.join(", ")}
                                  </span>
                                </div>
                                {getConvocationStatusIcon(
                                  match.convocationsStatus,
                                )}
                                <MatchCertificateWarningBadge
                                  warning={getInvalidCertificatesForConvocatedAthletes(
                                    match,
                                    athletes,
                                  )}
                                />
                              </div>
                            </div>
                          ))}
                        {matches.filter((match) => {
                          if (getEffectiveMatchStatus(match) !== "upcoming") {
                            return false;
                          }
                          if (!matchMatchesSelectedCategory(match)) {
                            return false;
                          }
                          if (!(match.date instanceof Date)) return false;
                          const matchDate = new Date(match.date);
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          return matchDate >= today;
                        }).length === 0 && (
                          <p className="text-center text-gray-500 py-4">
                            Nessuna gara in programma
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Storico Gare */}
                  <Card className="mt-6">
                    <CardHeader>
                      <CardTitle>Storico Gare</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {/* Search and filters */}
                      <div className="flex flex-col sm:flex-row gap-2 mb-4">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            placeholder="Cerca gare passate..."
                            value={historySearchQuery}
                            className="w-full h-10 pl-10 pr-4 rounded-md border border-input bg-background text-sm ring-offset-background"
                            onChange={(e) =>
                              setHistorySearchQuery(e.target.value)
                            }
                          />
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                        </div>
                        <select
                          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background w-full sm:w-auto"
                          value={historySelectedCategory}
                          onChange={(e) =>
                            setHistorySelectedCategory(e.target.value)
                          }
                        >
                          <option value="all">Tutte le categorie</option>
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-4 max-h-96 overflow-y-auto">
                        {matches
                          .filter((match) => {
                            if (!(match.date instanceof Date)) return false;
                            const isPast =
                              getEffectiveMatchStatus(match) === "completed";

                            // Apply search filter
                            const searchMatches =
                              historySearchQuery === "" ||
                              match.title
                                .toLowerCase()
                                .includes(historySearchQuery.toLowerCase()) ||
                              match.opponent
                                .toLowerCase()
                                .includes(historySearchQuery.toLowerCase()) ||
                              match.category
                                .toLowerCase()
                                .includes(historySearchQuery.toLowerCase());

                            // Apply category filter
                            const categoryMatches =
                              historySelectedCategory === "all" ||
                              match.categoryId === historySelectedCategory ||
                              categories.find(
                                (c) => c.id === historySelectedCategory,
                              )?.name === match.category;

                            return isPast && searchMatches && categoryMatches;
                          })
                          .sort((a, b) => {
                            if (
                              !(a.date instanceof Date) ||
                              !(b.date instanceof Date)
                            )
                              return 0;
                            return (
                              new Date(b.date).getTime() -
                              new Date(a.date).getTime()
                            );
                          })
                          .map((match) => (
                            <div
                              key={match.id}
                              className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                            >
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <h4 className="font-medium">{match.title}</h4>
                                  <p className="text-sm text-gray-500">
                                    {match.date instanceof Date
                                      ? new Date(match.date).toLocaleDateString(
                                          "it-IT",
                                          {
                                            weekday: "long",
                                            day: "numeric",
                                            month: "long",
                                            year: "numeric",
                                          },
                                        )
                                      : "Data non disponibile"}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge
                                    className={cn(
                                      "text-xs",
                                      match.categoryColor,
                                    )}
                                  >
                                    {match.category}
                                  </Badge>
                                  <Badge
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    Conclusa
                                  </Badge>
                                </div>
                              </div>
                              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                                <div className="flex items-center gap-2">
                                  <Clock className="h-3.5 w-3.5" />
                                  <span>{match.time}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Trophy className="h-3.5 w-3.5" />
                                  <span>vs {match.opponent}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <MapPin className="h-3.5 w-3.5" />
                                  <span>{formatMatchLocationLabel(match)}</span>
                                </div>
                                <MatchCertificateWarningBadge
                                  warning={getInvalidCertificatesForConvocatedAthletes(
                                    match,
                                    athletes,
                                  )}
                                />
                              </div>
                            </div>
                          ))}
                        {matches.filter((match) => {
                          if (!(match.date instanceof Date)) return false;
                          const isPast =
                            getEffectiveMatchStatus(match) === "completed";

                          const searchMatches =
                            historySearchQuery === "" ||
                            match.title
                              .toLowerCase()
                              .includes(historySearchQuery.toLowerCase()) ||
                            match.opponent
                              .toLowerCase()
                              .includes(historySearchQuery.toLowerCase()) ||
                            match.category
                              .toLowerCase()
                              .includes(historySearchQuery.toLowerCase());

                          const categoryMatches =
                            historySelectedCategory === "all" ||
                            match.categoryId === historySelectedCategory ||
                            categories.find(
                              (c) => c.id === historySelectedCategory,
                            )?.name === match.category;

                          return isPast && searchMatches && categoryMatches;
                        }).length === 0 && (
                          <p className="text-center text-gray-500 py-4">
                            Nessuna gara nello storico
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="convocations">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle>Gestione Convocazioni</CardTitle>
                      <div className="flex items-center gap-4">
                        {/* Status Legend */}
                        <div className="flex items-center gap-3 text-xs">
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-full bg-green-500"></div>
                            <span>Attivo</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-full bg-red-500"></div>
                            <span>Sospeso</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                            <span>In Prestito</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Filter className="h-4 w-4" />
                          <Select
                            value={athleteStatusFilter}
                            onValueChange={setAthleteStatusFilter}
                          >
                            <SelectTrigger className="w-48">
                              <SelectValue placeholder="Filtra per stato" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">
                                Tutti gli atleti
                              </SelectItem>
                              <SelectItem value="active">
                                Solo attivi
                              </SelectItem>
                              <SelectItem value="suspended">
                                Solo sospesi
                              </SelectItem>
                              <SelectItem value="loaned">
                                Solo in prestito
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <MatchConvocationsList
                        convocationStats={categories.map((category) => {
                          console.log("Processing category:", category);
                          let categoryAthletes = athletes.filter(
                            (athlete: any) => {
                              return athleteMatchesAnyCategory(athlete, [
                                category,
                                category.id,
                                category.name,
                              ]);
                            },
                          );

                          // Apply status filter
                          if (athleteStatusFilter !== "all") {
                            categoryAthletes = categoryAthletes.filter(
                              (athlete: any) => {
                                const status = athlete.data?.status || "active";
                                return status === athleteStatusFilter;
                              },
                            );
                          }

                          console.log(
                            "Athletes for category",
                            category.name,
                            ":",
                            categoryAthletes,
                          );
                          return {
                            categoryId: category.id,
                            categoryName: category.name,
                            athletes: categoryAthletes.map((athlete: any) => ({
                              id: athlete.id,
                              name: getAthleteDisplayName(athlete) || "Atleta",
                              matchesPlayed: 0,
                              matchesAbsent: 0,
                              status: athlete.data?.status || "active",
                            })),
                          };
                        })}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>

            {false && (
              <Card className="mt-8 border-2 border-dashed border-blue-200 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-950/20">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg text-blue-700 dark:text-blue-300">
                    Impostazioni Gare
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                  {/* Schedule Conflicts Toggle */}
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-amber-100 dark:bg-amber-900 rounded-lg mt-1">
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <label
                              htmlFor="schedule-conflicts"
                              className="text-sm font-semibold text-gray-900 dark:text-gray-100"
                            >
                              Controllo Conflitti di Programmazione
                            </label>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              Verifica automaticamente sovrapposizioni tra gare
                              considerando allenatori e categorie (durata 3 ore)
                            </p>
                          </div>
                          <Switch
                            id="schedule-conflicts"
                            checked={scheduleConflictsEnabled}
                            onCheckedChange={setScheduleConflictsEnabled}
                          />
                        </div>
                        <div
                          className={`text-xs px-3 py-2 rounded-md ${
                            scheduleConflictsEnabled
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                          }`}
                        >
                          {scheduleConflictsEnabled
                            ? "✓ Attivo - Riceverai avvisi per conflitti di programmazione"
                            : "✗ Disattivo - Nessun controllo sui conflitti"}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Home Fields Management */}
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg mt-1">
                        <Home className="h-4 w-4 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="flex-1">
                        <div className="mb-3">
                          <label className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            Gestione Campi di Casa
                          </label>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            Configura i campi disponibili per le gare in casa
                          </p>
                        </div>
                        <div className="space-y-3">
                          {homeFields.map((field, index) => (
                            <div
                              key={field.id}
                              className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border"
                            >
                              <div className="flex-1">
                                <input
                                  type="text"
                                  value={field.name}
                                  onChange={(e) => {
                                    const updatedFields = [...homeFields];
                                    updatedFields[index].name = e.target.value;
                                    setHomeFields(updatedFields);
                                  }}
                                  className="w-full h-9 px-3 text-sm border border-input rounded-md bg-background focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  placeholder="Nome del campo"
                                />
                              </div>
                              {homeFields.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setHomeFields(
                                      homeFields.filter((_, i) => i !== index),
                                    );
                                  }}
                                  className="text-red-600 hover:text-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 h-9 w-9 p-0"
                                >
                                  <Trash className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const newId = (homeFields.length + 1).toString();
                              setHomeFields([
                                ...homeFields,
                                { id: newId, name: `Campo ${newId}` },
                              ]);
                            }}
                            className="w-full h-10 border-dashed border-2 hover:border-solid hover:bg-blue-50 dark:hover:bg-blue-950/20"
                          >
                            <Plus className="h-4 w-4 mr-2" /> Aggiungi Nuovo
                            Campo
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            )}

            <Card className="border-blue-100 bg-blue-50/60">
              <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-blue-950">
                    Scadenza convocazioni
                  </p>
                  <p className="mt-1 text-sm text-blue-700">
                    Avvisa gli allenatori quando una gara si avvicina e mancano
                    le convocazioni.
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-blue-800">
                      Convocare entro
                    </span>
                    <Input
                      type="number"
                      min={0}
                      max={30}
                      value={matchConvocationDeadlineDays}
                      onChange={(event) =>
                        setMatchConvocationDeadlineDays(
                          Math.max(
                            0,
                            Math.min(Number(event.target.value) || 0, 30),
                          ),
                        )
                      }
                      className="h-10 w-20 rounded-xl border-blue-200 bg-white"
                    />
                    <span className="text-sm text-blue-800">
                      giorni prima
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    className="border-blue-300 bg-white text-blue-700 hover:bg-blue-100"
                    disabled={savingMatchSettings}
                    onClick={handleSaveMatchSettings}
                  >
                    {savingMatchSettings ? "Salvataggio..." : "Salva"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </DashboardPageContainer>
        </main>
      </div>

      <AddMatchForm
        isOpen={showAddMatchModal}
        onClose={() => setShowAddMatchModal(false)}
        onSubmit={handleAddMatch}
        categories={categories}
        trainers={trainers}
        selectedDate={date}
        homeFields={homeLocations}
      />

      <MultipleAddMatchForm
        isOpen={showMultipleAddMatchModal}
        onClose={() => setShowMultipleAddMatchModal(false)}
        onSubmit={(matchesData) => {
          // Handle multiple matches submission
          matchesData.forEach((matchData) => {
            handleAddMatch(matchData);
          });
          showToast(
            "success",
            `${matchesData.length} gare aggiunte con successo`,
          );
          setShowMultipleAddMatchModal(false);
        }}
        categories={categories}
        trainers={trainers}
        selectedDate={date}
        homeFields={multipleHomeFieldOptions}
      />

      {selectedMatch && (
        <MatchConvocations
          isOpen={showConvocationsModal}
          onClose={() => {
            setShowConvocationsModal(false);
            setSelectedMatch(null);
          }}
          matchId={selectedMatch.id}
          matchTitle={selectedMatch.title}
          matchDate={selectedMatch.date.toISOString()}
          matchTime={selectedMatch.time}
          categoryName={selectedMatch.category}
          opponent={selectedMatch.opponent}
          location={formatMatchLocationLabel(selectedMatch)}
          athletes={(() => {
            const baseAthletes = athletes.filter((athlete: any) =>
              athleteMatchesAnyCategory(athlete, [
                selectedMatch.categoryId,
                selectedMatch.category,
              ]),
            );
            const savedConvocationEntries =
              normalizeMatchConvocationEntries(selectedMatch);
            const savedExtraAthletes = athletes.filter(
              (athlete: any) =>
                savedConvocationEntries.some(
                  (entry) => entry.athleteId === athlete.id,
                ) &&
                !baseAthletes.some(
                  (currentAthlete: any) => currentAthlete.id === athlete.id,
                ),
            );

            return [...baseAthletes, ...savedExtraAthletes]
              .reduce<any[]>((collection, athlete) => {
                if (collection.some((candidate) => candidate.id === athlete.id)) {
                  return collection;
                }

                collection.push(athlete);
                return collection;
              }, [])
              .map((athlete: any) =>
                buildMatchAthleteOption({
                  athlete,
                  match: selectedMatch,
                }),
              );
          })()}
          clubAthletes={athletes.map((athlete: any) =>
            buildMatchAthleteOption({
              athlete,
              match: selectedMatch,
            }),
          )}
          onSave={handleSaveConvocations}
          savedConvocations={selectedMatch.convocatedAthletes || []}
          savedConvocationEntries={selectedMatch.convocationEntries || []}
        />
      )}

      {selectedMatch && (
        <AddMatchForm
          isOpen={showEditMatchModal}
          onClose={() => {
            setShowEditMatchModal(false);
            setSelectedMatch(null);
          }}
          onSubmit={handleEditMatch}
          categories={categories}
          trainers={trainers}
          selectedDate={selectedMatch.date}
          editMode={true}
          homeFields={homeLocations}
          initialData={{
            title: selectedMatch.title,
            date: selectedMatch.date,
            time: selectedMatch.time,
            categoryIds: [selectedMatch.categoryId],
            opponent: selectedMatch.opponent,
            location: selectedMatch.location,
            venueMode: selectedMatch.isHome === false ? "away" : "home",
            structureId: selectedMatch.structureId || "",
            fieldId: selectedMatch.fieldId || selectedMatch.locationId || "",
            manualLocation:
              selectedMatch.isHome === false ? selectedMatch.location : "",
            trainerIds: trainers
              .filter((trainer) =>
                selectedMatch.trainers.includes(trainer.name),
              )
              .map((trainer) => trainer.id),
            notes: selectedMatch.notes || "",
            matchNumber: selectedMatch.matchNumber || "",
          }}
        />
      )}

      {/* Custom Conflict Dialog */}
      {conflictData && (
        <ConfirmDialog
          isOpen={showConflictDialog}
          onClose={() => {
            setShowConflictDialog(false);
            setConflictData(null);
          }}
          onConfirm={conflictData.onConfirm}
          title="Conflitto di Programmazione"
          description={conflictData.message}
          confirmText="Procedi Comunque"
          cancelText="Annulla"
          type="warning"
        />
      )}
    </div>
  );
}
