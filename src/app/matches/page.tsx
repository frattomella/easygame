"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
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
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  FileCheck,
  MoreVertical,
  Trash,
  Edit,
  UserCheck,
  AlertTriangle,
  Filter,
  Search,
} from "lucide-react";
import { useToast } from "@/components/ui/toast-notification";
import { AddMatchForm } from "@/components/forms/AddMatchForm";
import { MultipleAddMatchForm } from "@/components/forms/MultipleAddMatchForm";
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
  getClubStructures,
  getClubTrainers,
} from "@/lib/simplified-db";
import {
  buildTrainingLocationOptions,
  type TrainingLocationOption,
} from "@/lib/training-location-options";
import { formatMatchLocationLabel } from "@/lib/match-location";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [scheduleConflictsEnabled, setScheduleConflictsEnabled] =
    useState(true);
  const [homeFields, setHomeFields] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [homeLocations, setHomeLocations] = useState<TrainingLocationOption[]>(
    [],
  );
  const [athleteStatusFilter, setAthleteStatusFilter] = useState("active");
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
        const transformedMatches = matchesData.map((match: any) => ({
          ...match,
          date: new Date(match.date),
        }));
        setMatches(transformedMatches);

        // Load categories from club data
        const categoriesData = await getClubData(activeClub.id, "categories");
        setCategories(categoriesData);

        // Load trainers from the dedicated trainers registry
        const trainerData = await getClubTrainers(activeClub.id);
        setTrainers(Array.isArray(trainerData) ? trainerData : []);

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
      if (match.status === "cancelled") return false;
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

          const newMatchData = {
            title:
              matchData.title ||
              `Partita ${categoryObj?.name || ""} vs ${matchData.opponent}`,
            date: matchData.date.toISOString(),
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
            status: "upcoming",
            convocationsStatus: "none",
            convocatedAthletes: [],
          };

          const savedMatch = await addClubData(
            activeClub.id,
            "matches",
            newMatchData,
          );

          return {
            ...savedMatch,
            date: new Date(savedMatch.date),
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

  // Filter matches for the selected date
  const filteredMatches = matches.filter((match) => {
    if (!date || !(match.date instanceof Date)) return false;

    const matchDate = new Date(match.date);
    const dateMatches =
      matchDate.getDate() === date.getDate() &&
      matchDate.getMonth() === date.getMonth() &&
      matchDate.getFullYear() === date.getFullYear();

    // Apply search filter
    const searchMatches =
      searchQuery === "" ||
      match.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      match.opponent.toLowerCase().includes(searchQuery.toLowerCase()) ||
      match.category.toLowerCase().includes(searchQuery.toLowerCase());

    // Apply category filter
    const categoryMatches =
      selectedCategory === "all" ||
      categories.find((c) => c.id === selectedCategory)?.name ===
        match.category;

    return dateMatches && searchMatches && categoryMatches;
  });

  // Function to get dates with matches for calendar highlighting
  const getMatchDates = () => {
    return matches
      .filter((match) => match.date instanceof Date)
      .map((match) => new Date(match.date));
  };

  const getStatusBadge = (status: Match["status"]) => {
    switch (status) {
      case "upcoming":
        return (
          <Badge className="bg-blue-100 text-blue-800">In Programma</Badge>
        );
      case "completed":
        return (
          <Badge className="bg-green-100 text-green-800">Completata</Badge>
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

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Gare e Partite" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-9xl space-y-6">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Gare e Partite
              </h1>
              <p className="text-gray-600 mt-2">
                Organizza e monitora gare, partite e convocazioni.
              </p>
              {loading ? (
                <p className="mt-2 text-sm text-gray-500">
                  Caricamento calendario gare...
                </p>
              ) : null}
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <h2 className="text-xl font-semibold">Calendario Gare</h2>
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

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Cerca una gara per titolo, avversario o categoria..."
                  className="pl-9"
                />
              </div>
              <Select
                value={selectedCategory}
                onValueChange={setSelectedCategory}
              >
                <SelectTrigger>
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
                              currentDate.toDateString()
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
                                  dayMatches.map((match, idx) => (
                                    <div
                                      key={idx}
                                      className="text-xs p-1.5 bg-blue-100 dark:bg-blue-800 rounded mb-1"
                                    >
                                      <div className="font-medium truncate">
                                        {match.time.split(" - ")[0]} -{" "}
                                        {match.opponent}
                                      </div>
                                      <div className="flex justify-between items-center mt-0.5">
                                        <span className="text-[10px] text-gray-600 dark:text-gray-300">
                                          {match.category}
                                        </span>
                                        {match.convocationsStatus ===
                                          "completed" && (
                                          <span title="Convocazioni completate">
                                            <FileCheck className="h-3 w-3 text-green-600" />
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ))
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
                          {filteredMatches.map((match) => (
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
                              </div>
                              <div className="flex justify-between items-center mt-4">
                                <div className="flex items-center gap-4">
                                  {getStatusBadge(match.status)}
                                  {match.status === "upcoming" &&
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
                                  {match.status === "upcoming" && (
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
                                      {match.status === "upcoming" && (
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
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-64 text-center text-gray-500 p-6">
                          <CalendarIcon className="h-12 w-12 mb-2 opacity-50" />
                          <p>Nessuna gara programmata per questa data</p>
                          <p className="text-sm">
                            Seleziona un'altra data o aggiungi una nuova gara
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
                            if (match.status !== "upcoming") return false;
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
                              </div>
                            </div>
                          ))}
                        {matches.filter((match) => {
                          if (match.status !== "upcoming") return false;
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
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            />
                          </svg>
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
                            const matchDate = new Date(match.date);
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const isPast =
                              matchDate < today || match.status === "completed";

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
                                    {match.status === "completed"
                                      ? "Completata"
                                      : "Passata"}
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
                              </div>
                            </div>
                          ))}
                        {matches.filter((match) => {
                          if (!(match.date instanceof Date)) return false;
                          const matchDate = new Date(match.date);
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const isPast =
                            matchDate < today || match.status === "completed";

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
                              console.log(
                                "Checking athlete:",
                                athlete,
                                "Category match:",
                                athlete.data?.category,
                                "===",
                                category.name,
                                "(comparing with category name instead of ID)",
                              );
                              // Compare with category name instead of ID
                              return athlete.data?.category === category.name;
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
                              name: `${athlete.first_name} ${athlete.last_name}`,
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
          </div>
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
            console.log("All athletes:", athletes);
            console.log("Selected match category:", selectedMatch.category);
            const filteredAthletes = athletes.filter((athlete: any) => {
              console.log(
                "Athlete category:",
                athlete.data?.category,
                "Match category:",
                selectedMatch.category,
              );
              // Compare with category name instead of ID
              return athlete.data?.category === selectedMatch.category;
            });
            console.log("Filtered athletes:", filteredAthletes);
            return filteredAthletes.map((athlete: any) => ({
              id: athlete.id,
              name: `${athlete.first_name} ${athlete.last_name}`,
              avatar:
                athlete.data?.avatar ||
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(`${athlete.first_name}-${athlete.last_name}`)}`,
              matchesPlayed: 0,
              matchesAbsent: 0,
              medicalCertExpiry:
                athlete.data?.medicalCertExpiry ||
                athlete.medical_cert_expiry ||
                athlete.medicalCertExpiry ||
                null,
            }));
          })()}
          onSave={handleSaveConvocations}
          savedConvocations={selectedMatch.convocatedAthletes || []}
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
