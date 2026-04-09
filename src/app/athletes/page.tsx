"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Search,
  Plus,
  FileHeart,
  MoreVertical,
  Trash2,
  CheckSquare,
  ListChecks,
  UserCheck,
  UserMinus,
  UserX,
  Settings,
  CheckCircle2,
  X,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Upload,
} from "lucide-react";
import { AthleteQuickCreateDialog } from "@/components/forms/AthleteQuickCreateDialog";
import { AthleteImportDialog } from "@/components/forms/AthleteImportDialog";
import { useToast } from "@/components/ui/toast-notification";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  ConfirmDialog,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/components/providers/AuthProvider";
import { useGlobalLoading } from "@/components/providers/GlobalLoadingProvider";
import Image from "next/image";
import userDefaultImage from "@/../public/images/user.png";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import {
  findCategoryForBirthDate,
  formatCategoryBirthYears,
  normalizeCategoryBirthYears,
  resolveCategoryId,
  resolveCategoryLabel,
  UNCATEGORIZED_CATEGORY_ID,
} from "@/lib/category-utils";
import {
  getPrimaryAthleteCategoryMembership,
  normalizeAthleteCategoryMemberships,
} from "@/lib/athlete-category-memberships";
import {
  getClubAthletes,
  addClubAthlete,
  updateClubAthlete,
  deleteClubAthlete,
} from "@/lib/simplified-db";
import { supabase } from "@/lib/supabase";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface Athlete {
  id: string;
  name: string;
  categoryId: string | null;
  categoryLabel: string;
  membershipType: "primary" | "secondary";
  primaryCategoryLabel?: string;
  allCategoryLabels: string[];
  age: number;
  status: "active" | "inactive" | "suspended";
  medicalCertExpiry: string;
  birthDate?: string;
  avatar?: string;
  accessCode?: string;
  jerseyNumber?: string;
}

type BulkActionType =
  | "activate"
  | "inactive"
  | "suspended"
  | "delete"
  | "changeCategory";

type PendingBulkAction = {
  scope: "selected" | "all";
  action: BulkActionType;
  targetCategoryId?: string | null;
};

const normalizeCategoryKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

const createCategoryIdFromName = (value: string) =>
  `category-${value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}-${Date.now().toString(36).slice(-6)}`;

const buildCategoryList = (rawCategories: any[]) =>
  (rawCategories || []).map((category: any) => {
    const { birthYearFrom, birthYearTo } = normalizeCategoryBirthYears(category);

    return {
      ...category,
      birthYearFrom,
      birthYearTo,
      birthYearsLabel: formatCategoryBirthYears({
        ...category,
        birthYearFrom,
        birthYearTo,
      }),
    };
  });

export default function AthletesPage() {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [athletes, setAthletes] = React.useState<Athlete[]>([]);
  const [categories, setCategories] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showAddAthleteModal, setShowAddAthleteModal] = useState(false);
  const [showImportAthletesModal, setShowImportAthletesModal] =
    useState(false);
  const [showCustomizeColumnsModal, setShowCustomizeColumnsModal] =
    useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [selectedAthleteIds, setSelectedAthleteIds] = useState<Set<string>>(
    new Set(),
  );
  const [pendingBulkAction, setPendingBulkAction] =
    useState<PendingBulkAction | null>(null);
  const [showBulkCategoryDialog, setShowBulkCategoryDialog] = useState(false);
  const [bulkCategoryTargetId, setBulkCategoryTargetId] = useState("");

  // Status filter: "active" | "inactive" | "suspended" | "all"
  const [statusFilter, setStatusFilter] = useState<
    "active" | "inactive" | "suspended" | "all"
  >("active");

  // Default column preferences
  const defaultColumns = {
    name: true,
    category: true,
    age: true,
    status: true,
    medicalCert: true,
    birthYear: false,
    registrationComplete: false,
    jerseyNumber: false,
  };

  // Load column preferences from localStorage
  const loadColumnPreferences = (clubId: string) => {
    if (typeof window !== "undefined" && clubId) {
      const saved = localStorage.getItem(`athleteColumns_${clubId}`);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error("Error parsing column preferences:", e);
        }
      }
    }
    return defaultColumns;
  };

  const [visibleColumns, setVisibleColumns] = useState(defaultColumns);

  const { showToast } = useToast();
  const { activeClub, user } = useAuth();
  const { runWithLoader } = useGlobalLoading();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const resolveCurrentClubId = () => {
    let clubId = activeClub?.id;

    if (!clubId && typeof window !== "undefined") {
      try {
        const activeClubData = localStorage.getItem("activeClub");
        if (activeClubData) {
          const parsedClub = JSON.parse(activeClubData);
          clubId = parsedClub.id;
        }
      } catch (error) {
        console.error("Error parsing active club:", error);
      }
    }

    return clubId;
  };

  const refreshAthletesData = async () => {
    const clubId = resolveCurrentClubId();

    if (!clubId || !user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [{ data: categoriesData }, athletesData] = await Promise.all([
        supabase
          .from("categories")
          .select("*")
          .eq("club_id", clubId)
          .order("created_at", { ascending: true }),
        getClubAthletes(clubId),
      ]);

      const normalizedCategories = buildCategoryList(categoriesData || []);
      setCategories(normalizedCategories);

      const transformedAthletes = athletesData.flatMap((athlete: any) => {
        const memberships = normalizeAthleteCategoryMemberships(
          athlete,
          normalizedCategories,
        );
        const primaryMembership = getPrimaryAthleteCategoryMembership(
          memberships,
          normalizedCategories,
        );
        const rowMemberships =
          memberships.length > 0
            ? memberships
            : [
                {
                  categoryId: null,
                  categoryName: "Senza categoria",
                  isPrimary: true,
                },
              ];

        return rowMemberships.map((membership) => {
          const categoryId = membership.categoryId
            ? resolveCategoryId(membership.categoryId, normalizedCategories)
            : null;
          const categoryLabel = membership.categoryName
            ? resolveCategoryLabel(membership.categoryName, normalizedCategories)
            : "Senza categoria";

          return {
            id: athlete.id,
            name: `${athlete.first_name} ${athlete.last_name}`.trim(),
            categoryId,
            categoryLabel,
            membershipType: membership.isPrimary ? "primary" : "secondary",
            primaryCategoryLabel:
              primaryMembership?.categoryName || categoryLabel || "Senza categoria",
            allCategoryLabels: rowMemberships.map((item) => item.categoryName),
            age: athlete.birth_date
              ? new Date().getFullYear() -
                new Date(athlete.birth_date).getFullYear()
              : 0,
            status: athlete.status || athlete.data?.status || "active",
            medicalCertExpiry: athlete.data?.medicalCertExpiry || "",
            birthDate: athlete.birth_date || "",
            avatar: athlete.avatar_url || athlete.data?.avatar || null,
            accessCode: athlete.access_code || athlete.data?.accessCode,
            jerseyNumber: athlete.jersey_number || athlete.data?.jerseyNumber,
          } as Athlete;
        });
      });

      setAthletes(transformedAthletes);
      setSelectedAthleteIds((currentSelection) => {
        const nextSelection = new Set<string>();
        transformedAthletes.forEach((athlete) => {
          if (currentSelection.has(athlete.id)) {
            nextSelection.add(athlete.id);
          }
        });
        return nextSelection;
      });
    } catch (error) {
      console.error("Error loading athletes data:", error);
      showToast("error", "Errore nel caricamento dei dati");
    } finally {
      setLoading(false);
    }
  };

  // Save column preferences to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== "undefined" && activeClub?.id) {
      localStorage.setItem(
        `athleteColumns_${activeClub.id}`,
        JSON.stringify(visibleColumns),
      );
    }
  }, [visibleColumns, activeClub?.id]);

  // Update column preferences when activeClub changes
  useEffect(() => {
    if (activeClub?.id) {
      const savedPreferences = loadColumnPreferences(activeClub.id);
      setVisibleColumns(savedPreferences);
    } else {
      // Reset to default when no club is selected
      setVisibleColumns(defaultColumns);
    }
  }, [activeClub?.id]);

  // Load athletes and categories from database
  useEffect(() => {
    refreshAthletesData();
  }, [activeClub?.id, user?.id]);

  useEffect(() => {
    const action = searchParams.get("action");
    if (!action) {
      return;
    }

    if (action === "new") {
      setShowAddAthleteModal(true);
    }

    if (action === "import") {
      setShowImportAthletesModal(true);
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("action");
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;

    const frame = window.requestAnimationFrame(() => {
      router.replace(nextUrl, { scroll: false });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pathname, router, searchParams]);

  const handleAddAthlete = async (athleteData: any) => {
    const clubId = resolveCurrentClubId();

    if (!clubId || !user) {
      showToast("error", "Club o utente non trovato");
      return false;
    }

    try {
      const linkedCategory =
        categories.find((category) => category.id === athleteData.categoryId) ||
        findCategoryForBirthDate(athleteData.birthDate, categories);

      const newAthleteData = {
        firstName: athleteData.firstName,
        lastName: athleteData.lastName,
        birthDate: athleteData.birthDate,
        category: linkedCategory?.id || null,
        categoryName: linkedCategory?.name || null,
        status: "active",
      };

      const savedAthlete = await addClubAthlete(clubId, newAthleteData);
      const birthYear = new Date(athleteData.birthDate).getFullYear();

      const newAthlete: Athlete = {
        id: savedAthlete.id,
        name: `${athleteData.firstName} ${athleteData.lastName}`.trim(),
        categoryId: linkedCategory?.id || null,
        categoryLabel: linkedCategory?.name || "Senza categoria",
        membershipType: "primary",
        primaryCategoryLabel: linkedCategory?.name || "Senza categoria",
        allCategoryLabels: linkedCategory?.name ? [linkedCategory.name] : [],
        age: Number.isFinite(birthYear)
          ? new Date().getFullYear() - birthYear
          : 0,
        status: "active",
        medicalCertExpiry: "",
        birthDate: athleteData.birthDate,
      };

      setAthletes((currentAthletes) => [...currentAthletes, newAthlete]);
      await refreshAthletesData();
      showToast("success", `Atleta ${newAthlete.name} aggiunto con successo`);
      return true;
    } catch (error) {
      console.error("Error adding athlete:", error);
      showToast("error", "Errore nell'aggiunta dell'atleta");
      return false;
    }
  };

  const handleImportAthletes = async (
    importedRows: {
      firstName: string;
      lastName: string;
      birthDate: string;
      categoryId: string | null;
      categoryLabel: string;
    }[],
  ) =>
    runWithLoader(
      "Importazione atleti in corso, attendi il completamento dell'operazione...",
      async () => {
        const clubId = resolveCurrentClubId();

        if (!clubId || !user) {
          throw new Error("Club o utente non trovato");
        }

        let currentCategories = [...categories];
        const categoryIdByKey = new Map<string, string>();

        currentCategories.forEach((category) => {
          const normalizedKey = normalizeCategoryKey(
            category.name || category.id || "",
          );
          if (normalizedKey) {
            categoryIdByKey.set(normalizedKey, category.id);
          }
        });

        const categoriesToCreate = new Map<
          string,
          {
            id: string;
            name: string;
            birthYearFrom: number;
            birthYearTo: number;
          }
        >();

        importedRows.forEach((row) => {
          const normalizedLabel = normalizeCategoryKey(row.categoryLabel || "");
          const hasExistingCategory =
            Boolean(
              row.categoryId &&
                currentCategories.some(
                  (category) => category.id === row.categoryId,
                ),
            ) ||
            currentCategories.some(
              (category) =>
                normalizeCategoryKey(category.name || "") === normalizedLabel,
            );

          if (
            !normalizedLabel ||
            hasExistingCategory ||
            categoryIdByKey.has(normalizedLabel)
          ) {
            return;
          }

          const birthYear = new Date(row.birthDate).getFullYear();
          const safeBirthYear = Number.isFinite(birthYear)
            ? birthYear
            : new Date().getFullYear();
          const existingGroup = categoriesToCreate.get(normalizedLabel);

          if (existingGroup) {
            existingGroup.birthYearFrom = Math.min(
              existingGroup.birthYearFrom,
              safeBirthYear,
            );
            existingGroup.birthYearTo = Math.max(
              existingGroup.birthYearTo,
              safeBirthYear,
            );
            return;
          }

          categoriesToCreate.set(normalizedLabel, {
            id: createCategoryIdFromName(
              row.categoryLabel || "categoria-importata",
            ),
            name: row.categoryLabel.trim(),
            birthYearFrom: safeBirthYear,
            birthYearTo: safeBirthYear,
          });
        });

        if (categoriesToCreate.size) {
          for (const category of categoriesToCreate.values()) {
            const { error } = await supabase.from("categories").upsert({
              id: category.id,
              club_id: clubId,
              name: category.name,
              description: "Categoria importata",
              sport: "Categoria importata",
              ageRange:
                category.birthYearFrom === category.birthYearTo
                  ? String(category.birthYearFrom)
                  : `${category.birthYearFrom}-${category.birthYearTo}`,
              birthYearFrom: category.birthYearFrom,
              birthYearTo: category.birthYearTo,
              color: "bg-blue-500 text-white",
            });

            if (error) {
              throw error;
            }

            categoryIdByKey.set(normalizeCategoryKey(category.name), category.id);
          }

          const { data: categoriesData, error: categoriesError } = await supabase
            .from("categories")
            .select("*")
            .eq("club_id", clubId)
            .order("created_at", { ascending: true });

          if (categoriesError) {
            throw categoriesError;
          }

          currentCategories = buildCategoryList(categoriesData || []);
          setCategories(currentCategories);
          currentCategories.forEach((category) => {
            const normalizedKey = normalizeCategoryKey(
              category.name || category.id || "",
            );
            if (normalizedKey) {
              categoryIdByKey.set(normalizedKey, category.id);
            }
          });
        }

        let successCount = 0;
        const failedRows: string[] = [];

        for (const row of importedRows) {
          try {
            const importedCategoryId =
              row.categoryId &&
              currentCategories.some((category) => category.id === row.categoryId)
                ? row.categoryId
                : categoryIdByKey.get(
                    normalizeCategoryKey(row.categoryLabel || ""),
                  ) || null;

            const linkedCategory =
              currentCategories.find(
                (category) => category.id === importedCategoryId,
              ) || findCategoryForBirthDate(row.birthDate, currentCategories);

            await addClubAthlete(clubId, {
              firstName: row.firstName,
              lastName: row.lastName,
              birthDate: row.birthDate,
              category: linkedCategory?.id || null,
              categoryName: linkedCategory?.name || row.categoryLabel || null,
              status: "active",
            });

            successCount += 1;
          } catch (error: any) {
            console.error("Error importing athlete row:", row, error);
            failedRows.push(
              `${row.firstName} ${row.lastName}`.trim() ||
                `riga import ${successCount + failedRows.length + 1}`,
            );
          }
        }

        await refreshAthletesData();

        return {
          successCount,
          failedRows,
        };
      },
    );

  const formatDate = (dateString: string) => {
    if (!dateString) {
      return "-";
    }

    const date = new Date(dateString);
    return date.toLocaleDateString("it-IT", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const isCertificateExpired = (dateString: string) => {
    if (!dateString) {
      return false;
    }

    const expiryDate = new Date(dateString);
    const today = new Date();
    return expiryDate < today;
  };

  // Function to update athlete status in database
  const updateAthleteStatus = async (
    athleteId: string,
    newStatus: "active" | "inactive" | "suspended",
  ) => {
    if (!activeClub?.id) {
      showToast("error", "Club non trovato");
      return;
    }

    try {
      await updateClubAthlete(activeClub.id, athleteId, { status: newStatus });

      // Update local state
      setAthletes(
        athletes.map((a) =>
          a.id === athleteId ? { ...a, status: newStatus } : a,
        ),
      );

      const statusText =
        newStatus === "active"
          ? "attivato"
          : newStatus === "suspended"
            ? "sospeso"
            : "disattivato";
      showToast("success", `Atleta ${statusText} con successo`);
    } catch (error) {
      console.error("Error updating athlete status:", error);
      showToast("error", "Errore nell'aggiornamento dello stato dell'atleta");
    }
  };

  // Function to delete athlete
  const deleteAthlete = async (athleteId: string, athleteName: string) => {
    if (!activeClub?.id) {
      showToast("error", "Club non trovato");
      return;
    }

    if (
      !confirm(
        `Sei sicuro di voler eliminare l'atleta ${athleteName}? Questa azione non può essere annullata.`,
      )
    ) {
      return;
    }

    try {
      await deleteClubAthlete(activeClub.id, athleteId);

      // Update local state
      setAthletes(athletes.filter((a) => a.id !== athleteId));

      showToast("success", `Atleta ${athleteName} eliminato con successo`);
    } catch (error) {
      console.error("Error deleting athlete:", error);
      showToast("error", "Errore nell'eliminazione dell'atleta");
    }
  };

  const toggleAthleteSelection = (athleteId: string, checked: boolean) => {
    setSelectedAthleteIds((currentSelection) => {
      const nextSelection = new Set(currentSelection);

      if (checked) {
        nextSelection.add(athleteId);
      } else {
        nextSelection.delete(athleteId);
      }

      return nextSelection;
    });
  };

  const toggleManyAthletesSelection = (
    athleteIds: string[],
    checked: boolean,
  ) => {
    setSelectedAthleteIds((currentSelection) => {
      const nextSelection = new Set(currentSelection);

      athleteIds.forEach((athleteId) => {
        if (checked) {
          nextSelection.add(athleteId);
        } else {
          nextSelection.delete(athleteId);
        }
      });

      return nextSelection;
    });
  };

  const clearAthleteSelection = () => {
    setSelectedAthleteIds(new Set());
  };

  // Toggle category collapse
  const toggleCategoryCollapse = (categoryId: string) => {
    setCollapsedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  // Filter athletes by search and status
  const filteredAthletes = athletes.filter((athlete) => {
    const matchesSearch =
      athlete.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      athlete.categoryLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      athlete.allCategoryLabels.some((label) =>
        label.toLowerCase().includes(searchQuery.toLowerCase()),
      );

    const matchesStatus =
      statusFilter === "all" || athlete.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const selectedAthletesCount = selectedAthleteIds.size;

  const getBulkActionLabel = (action: BulkActionType) => {
    if (action === "activate") {
      return "rendere attivi";
    }

    if (action === "inactive") {
      return "rendere inattivi";
    }

    if (action === "suspended") {
      return "sospendere";
    }

    if (action === "changeCategory") {
      return "spostare";
    }

    return "eliminare";
  };

  const getBulkActionTargetIds = () => {
    if (!pendingBulkAction) {
      return [];
    }

    if (pendingBulkAction.scope === "selected") {
      return Array.from(selectedAthleteIds);
    }

    return athletes.map((athlete) => athlete.id);
  };

  const getBulkActionDescription = () => {
    if (!pendingBulkAction) {
      return "";
    }

    const targetIds = getBulkActionTargetIds();
    const athletesCount = targetIds.length;
    const scopeLabel =
      pendingBulkAction.scope === "selected"
        ? "gli atleti selezionati"
        : "tutti gli atleti registrati";

    if (pendingBulkAction.action === "delete") {
      return `Stai per eliminare ${athletesCount} ${athletesCount === 1 ? "atleta" : "atleti"} tra ${scopeLabel}. Questa azione non può essere annullata. Vuoi continuare?`;
    }

    if (pendingBulkAction.action === "changeCategory") {
      const targetCategoryName =
        categories.find(
          (category) => category.id === pendingBulkAction.targetCategoryId,
        )?.name || "nuova categoria";

      return `Stai per spostare ${athletesCount} ${athletesCount === 1 ? "atleta" : "atleti"} tra ${scopeLabel} nella categoria ${targetCategoryName}. Confermi l'operazione?`;
    }

    return `Stai per ${getBulkActionLabel(pendingBulkAction.action)} ${athletesCount} ${athletesCount === 1 ? "atleta" : "atleti"} tra ${scopeLabel}. Confermi l'operazione?`;
  };

  const runBulkAction = async () => {
    if (!pendingBulkAction) {
      return;
    }

    const clubId = resolveCurrentClubId();
    const targetIds = getBulkActionTargetIds();

    if (!clubId || !targetIds.length) {
      showToast("error", "Nessun atleta disponibile per questa operazione");
      return;
    }

    try {
      await runWithLoader(
        pendingBulkAction.action === "delete"
          ? "Eliminazione atleti in corso, attendi il completamento..."
          : "Aggiornamento atleti in corso, attendi il completamento...",
        async () => {
          if (pendingBulkAction.action === "delete") {
            for (const athleteId of targetIds) {
              await deleteClubAthlete(clubId, athleteId);
            }

            showToast(
              "success",
              `${targetIds.length} ${targetIds.length === 1 ? "atleta eliminato" : "atleti eliminati"} con successo`,
            );
          } else if (pendingBulkAction.action === "changeCategory") {
            const targetCategory = categories.find(
              (category) => category.id === pendingBulkAction.targetCategoryId,
            );

            if (!targetCategory) {
              throw new Error("Categoria di destinazione non trovata");
            }

            for (const athleteId of targetIds) {
              await updateClubAthlete(clubId, athleteId, {
                category: targetCategory.id,
                category_id: targetCategory.id,
                categoryName: targetCategory.name,
                category_name: targetCategory.name,
              });
            }

            showToast(
              "success",
              `${targetIds.length} ${targetIds.length === 1 ? "atleta spostato" : "atleti spostati"} in ${targetCategory.name}`,
            );
          } else {
            for (const athleteId of targetIds) {
              await updateClubAthlete(clubId, athleteId, {
                status: pendingBulkAction.action,
              });
            }

            showToast(
              "success",
              `${targetIds.length} ${targetIds.length === 1 ? "atleta aggiornato" : "atleti aggiornati"} con successo`,
            );
          }

          clearAthleteSelection();
          await refreshAthletesData();
        },
      );
    } catch (error) {
      console.error("Error running bulk athlete action:", error);
      showToast(
        "error",
        "Errore durante l'esecuzione dell'operazione in blocco",
      );
    } finally {
      setPendingBulkAction(null);
    }
  };

  // Get unique categories from athletes (including those without registered categories)
  const getUniqueCategories = () => {
    const allCategories = new Map<
      string,
      { id: string; name: string; birthYearsLabel?: string }
    >();

    categories.forEach((cat) => {
      allCategories.set(cat.id, {
        id: cat.id,
        name: cat.name,
        birthYearsLabel: cat.birthYearsLabel,
      });
    });

    filteredAthletes.forEach((athlete) => {
      const fallbackId = athlete.categoryId || UNCATEGORIZED_CATEGORY_ID;

      if (!allCategories.has(fallbackId)) {
        allCategories.set(fallbackId, {
          id: fallbackId,
          name: athlete.categoryLabel || "Senza categoria",
        });
      }
    });

    return Array.from(allCategories.values());
  };

  // Render athlete table for a category
  const renderAthleteTable = (categoryAthletes: Athlete[]) => {
    const categoryAthleteIds = categoryAthletes.map((athlete) => athlete.id);
    const allCategorySelected =
      categoryAthleteIds.length > 0 &&
      categoryAthleteIds.every((athleteId) => selectedAthleteIds.has(athleteId));
    const someCategorySelected =
      !allCategorySelected &&
      categoryAthleteIds.some((athleteId) => selectedAthleteIds.has(athleteId));

    return (
      <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className="w-12 py-3 px-4">
              <Checkbox
                checked={
                  allCategorySelected
                    ? true
                    : someCategorySelected
                      ? "indeterminate"
                      : false
                }
                onCheckedChange={(checked) =>
                  toggleManyAthletesSelection(categoryAthleteIds, Boolean(checked))
                }
                aria-label="Seleziona atleti della categoria"
              />
            </th>
            <th className="text-left py-3 px-4 font-medium">Atleta</th>
            {visibleColumns.category && (
              <th className="text-left py-3 px-4 font-medium">Categoria</th>
            )}
            {visibleColumns.age && (
              <th className="text-left py-3 px-4 font-medium">Età</th>
            )}
            {visibleColumns.birthYear && (
              <th className="text-left py-3 px-4 font-medium">
                Anno di Nascita
              </th>
            )}
            {visibleColumns.status && (
              <th className="text-left py-3 px-4 font-medium">Stato</th>
            )}
            {visibleColumns.medicalCert && (
              <th className="text-left py-3 px-4 font-medium">
                Certificato Medico
              </th>
            )}
            {visibleColumns.registrationComplete && (
              <th className="text-left py-3 px-4 font-medium">Iscrizione</th>
            )}
            {visibleColumns.jerseyNumber && (
              <th className="text-left py-3 px-4 font-medium">Numero Maglia</th>
            )}
            <th className="text-left py-3 px-4 font-medium">Azioni</th>
          </tr>
        </thead>
        <tbody>
          {categoryAthletes.map((athlete) => (
            <tr
              key={athlete.id}
              className="border-b hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <td className="py-3 px-4">
                <Checkbox
                  checked={selectedAthleteIds.has(athlete.id)}
                  onCheckedChange={(checked) =>
                    toggleAthleteSelection(athlete.id, Boolean(checked))
                  }
                  aria-label={`Seleziona ${athlete.name}`}
                />
              </td>
              <td className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <Avatar>
                    {athlete.avatar ? (
                      <AvatarImage src={athlete.avatar} alt={athlete.name} />
                    ) : (
                      <AvatarFallback className="bg-white dark:bg-gray-800 p-0.5">
                        <Image
                          src={userDefaultImage}
                          alt={athlete.name}
                          className="object-contain w-full h-full"
                          width={40}
                          height={40}
                        />
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <button
                    onClick={() =>
                      router.push(
                        `/athletes/${athlete.id}?clubId=${activeClub?.id}`,
                      )
                    }
                    className="hover:text-blue-600 hover:underline cursor-pointer text-left"
                  >
                    <span>{athlete.name}</span>
                    {athlete.membershipType === "secondary" ? (
                      <span className="mt-1 block text-xs text-sky-600">
                        Categoria primaria: {athlete.primaryCategoryLabel || "Non definita"}
                      </span>
                    ) : null}
                  </button>
                  {athlete.membershipType === "secondary" ? (
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
                      Secondaria
                    </span>
                  ) : null}
                </div>
              </td>
              {visibleColumns.category && (
                <td className="py-3 px-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{athlete.categoryLabel}</span>
                    {athlete.membershipType === "primary" ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Primaria
                      </span>
                    ) : null}
                  </div>
                </td>
              )}
              {visibleColumns.age && (
                <td className="py-3 px-4">{athlete.age} anni</td>
              )}
              {visibleColumns.birthYear && (
                <td className="py-3 px-4">
                  {athlete.birthDate
                    ? new Date(athlete.birthDate).getFullYear()
                    : "-"}
                </td>
              )}
              {visibleColumns.status && (
                <td className="py-3 px-4">
                  {athlete.status === "active" ? (
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>Attivo</span>
                    </div>
                  ) : athlete.status === "inactive" ? (
                    <div className="flex items-center gap-1">
                      <X className="h-4 w-4 text-gray-500" />
                      <span>In Prestito</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <X className="h-4 w-4 text-red-500" />
                      <span>Sospeso</span>
                    </div>
                  )}
                </td>
              )}
              {visibleColumns.medicalCert && (
                <td className="py-3 px-4">
                  {athlete.medicalCertExpiry ? (
                    <div className="flex items-center gap-2">
                      <FileHeart
                        className={`h-4 w-4 ${isCertificateExpired(athlete.medicalCertExpiry) ? "text-red-500" : "text-green-500"}`}
                      />
                      <span
                        className={
                          isCertificateExpired(athlete.medicalCertExpiry)
                            ? "text-red-500"
                            : ""
                        }
                      >
                        {formatDate(athlete.medicalCertExpiry)}
                      </span>
                    </div>
                  ) : (
                    <span>-</span>
                  )}
                </td>
              )}
              {visibleColumns.registrationComplete && (
                <td className="py-3 px-4">
                  {Math.random() > 0.5 ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <X className="h-5 w-5 text-red-500" />
                  )}
                </td>
              )}
              {visibleColumns.jerseyNumber && (
                <td className="py-3 px-4">{athlete.jerseyNumber || "-"}</td>
              )}
              <td className="py-3 px-4">
                <div className="relative">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() =>
                          router.push(
                            `/athletes/${athlete.id}?clubId=${activeClub?.id}`,
                          )
                        }
                      >
                        Visualizza Profilo
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {athlete.status === "active" ? (
                        <>
                          <DropdownMenuItem
                            onClick={() =>
                              updateAthleteStatus(athlete.id, "suspended")
                            }
                          >
                            <UserX className="h-4 w-4 mr-2 text-amber-500" />
                            Sospendi
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              updateAthleteStatus(athlete.id, "inactive")
                            }
                          >
                            <UserMinus className="h-4 w-4 mr-2 text-gray-500" />
                            Disattiva
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <DropdownMenuItem
                          onClick={() =>
                            updateAthleteStatus(athlete.id, "active")
                          }
                        >
                          <UserCheck className="h-4 w-4 mr-2 text-green-500" />
                          Attiva
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => deleteAthlete(athlete.id, athlete.name)}
                      >
                        Elimina
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    );
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Atleti" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-9xl space-y-6">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Atleti
              </h1>
              <p className="text-gray-600 mt-2">
                Gestisci gli atleti tesserati del tuo club.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="relative w-full sm:w-auto">
                <Input
                  placeholder="Cerca atleti..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-full sm:w-80"
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex gap-2 w-full sm:w-auto flex-wrap">
                {/* Status Filter Buttons */}
                <div className="flex gap-1 border rounded-lg p-1 bg-white dark:bg-gray-800">
                  <Button
                    variant={statusFilter === "active" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setStatusFilter("active")}
                    className={
                      statusFilter === "active"
                        ? "bg-green-600 hover:bg-green-700"
                        : ""
                    }
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Attivi
                  </Button>
                  <Button
                    variant={statusFilter === "suspended" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setStatusFilter("suspended")}
                    className={
                      statusFilter === "suspended"
                        ? "bg-amber-600 hover:bg-amber-700"
                        : ""
                    }
                  >
                    <UserX className="h-4 w-4 mr-1" />
                    Sospesi
                  </Button>
                  <Button
                    variant={statusFilter === "inactive" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setStatusFilter("inactive")}
                    className={
                      statusFilter === "inactive"
                        ? "bg-gray-600 hover:bg-gray-700"
                        : ""
                    }
                  >
                    <EyeOff className="h-4 w-4 mr-1" />
                    Disattivati
                  </Button>
                  <Button
                    variant={statusFilter === "all" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setStatusFilter("all")}
                    className={
                      statusFilter === "all"
                        ? "bg-blue-600 hover:bg-blue-700"
                        : ""
                    }
                  >
                    Tutti
                  </Button>
                </div>
                <Button
                  variant="outline"
                  className="flex-1 sm:flex-none"
                  onClick={() => setShowCustomizeColumnsModal(true)}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Personalizza Colonne
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 sm:flex-none"
                  onClick={() => setShowImportAthletesModal(true)}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Importa Atleti
                </Button>
                <Button
                  className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700"
                  onClick={() => setShowAddAthleteModal(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nuovo Atleta
                </Button>
              </div>
            </div>

            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">
                Atleti Attivi:{" "}
                {athletes.filter((a) => a.status === "active").length} | Atleti
                Sospesi:{" "}
                {athletes.filter((a) => a.status === "suspended").length} |
                Atleti in Prestito:{" "}
                {athletes.filter((a) => a.status === "inactive").length}
              </h2>
            </div>

            <Card className="overflow-hidden border-blue-100 bg-gradient-to-br from-white via-white to-blue-50 shadow-sm">
              <CardContent className="p-0">
                <div className="grid gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
                  <div className="border-b border-blue-100 bg-gradient-to-br from-blue-600 to-indigo-600 p-5 text-white lg:border-b-0 lg:border-r">
                    <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-blue-100">
                      <ListChecks className="h-4 w-4" />
                      Modifiche in blocco
                    </div>
                    <h3 className="mt-3 text-2xl font-semibold">
                      Gestione rapida atleti
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-blue-50/90">
                      Seleziona gli atleti dalla griglia e applica operazioni massive in modo chiaro e controllato.
                    </p>
                    <div className="mt-5 grid grid-cols-3 gap-3">
                      <div className="rounded-2xl bg-white/12 p-3 backdrop-blur-sm">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-blue-100">
                          Selezionati
                        </p>
                        <p className="mt-1 text-2xl font-semibold">
                          {selectedAthletesCount}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white/12 p-3 backdrop-blur-sm">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-blue-100">
                          Visibili
                        </p>
                        <p className="mt-1 text-2xl font-semibold">
                          {filteredAthletes.length}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white/12 p-3 backdrop-blur-sm">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-blue-100">
                          Totali
                        </p>
                        <p className="mt-1 text-2xl font-semibold">
                          {athletes.length}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      className="mt-5 w-full bg-white text-blue-700 hover:bg-blue-50"
                      onClick={clearAthleteSelection}
                      disabled={!selectedAthletesCount}
                    >
                      Cancella selezione
                    </Button>
                  </div>

                  <div className="space-y-5 p-5">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Azioni sui selezionati
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Le operazioni vengono applicate solo agli atleti marcati nella tabella.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      <Button
                        variant="outline"
                        className="justify-start rounded-2xl border-green-200 bg-green-50/60 py-6 text-left text-green-800 hover:bg-green-100"
                        disabled={!selectedAthletesCount}
                        onClick={() =>
                          setPendingBulkAction({
                            scope: "selected",
                            action: "activate",
                          })
                        }
                      >
                        <UserCheck className="mr-2 h-4 w-4 text-green-600" />
                        Attiva selezionati
                      </Button>

                      <Button
                        variant="outline"
                        className="justify-start rounded-2xl border-slate-200 bg-slate-50 py-6 text-left text-slate-700 hover:bg-slate-100"
                        disabled={!selectedAthletesCount}
                        onClick={() =>
                          setPendingBulkAction({
                            scope: "selected",
                            action: "inactive",
                          })
                        }
                      >
                        <UserMinus className="mr-2 h-4 w-4 text-slate-500" />
                        Inattiva selezionati
                      </Button>

                      <Button
                        variant="outline"
                        className="justify-start rounded-2xl border-amber-200 bg-amber-50 py-6 text-left text-amber-800 hover:bg-amber-100"
                        disabled={!selectedAthletesCount}
                        onClick={() =>
                          setPendingBulkAction({
                            scope: "selected",
                            action: "suspended",
                          })
                        }
                      >
                        <UserX className="mr-2 h-4 w-4 text-amber-600" />
                        Sospendi selezionati
                      </Button>

                      <Button
                        variant="outline"
                        className="justify-start rounded-2xl border-blue-200 bg-blue-50 py-6 text-left text-blue-800 hover:bg-blue-100"
                        disabled={!selectedAthletesCount || !categories.length}
                        onClick={() => {
                          setBulkCategoryTargetId("");
                          setShowBulkCategoryDialog(true);
                        }}
                      >
                        <CheckSquare className="mr-2 h-4 w-4 text-blue-600" />
                        Cambia categoria
                      </Button>

                      <Button
                        variant="outline"
                        className="justify-start rounded-2xl border-red-200 bg-red-50 py-6 text-left text-red-700 hover:bg-red-100"
                        disabled={!selectedAthletesCount}
                        onClick={() =>
                          setPendingBulkAction({
                            scope: "selected",
                            action: "delete",
                          })
                        }
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Elimina selezionati
                      </Button>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          Operazioni globali
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Gestisci l’intera anagrafica del club con conferma prima dell’esecuzione.
                        </p>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            className="bg-blue-600 hover:bg-blue-700"
                            disabled={!athletes.length}
                          >
                            Azioni su tutti ({athletes.length})
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              setPendingBulkAction({
                                scope: "all",
                                action: "activate",
                              })
                            }
                          >
                            <UserCheck className="mr-2 h-4 w-4 text-green-500" />
                            Rendi tutti attivi
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              setPendingBulkAction({
                                scope: "all",
                                action: "inactive",
                              })
                            }
                          >
                            <UserMinus className="mr-2 h-4 w-4 text-gray-500" />
                            Rendi tutti inattivi
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              setPendingBulkAction({
                                scope: "all",
                                action: "suspended",
                              })
                            }
                          >
                            <UserX className="mr-2 h-4 w-4 text-amber-500" />
                            Sospendi tutti
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() =>
                              setPendingBulkAction({
                                scope: "all",
                                action: "delete",
                              })
                            }
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Elimina tutti
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {loading ? (
              <div className="py-8">
                <AppLoadingScreen
                  compact
                  title="EasyGame"
                  subtitle="Caricamento lista atleti..."
                  className="mx-auto max-w-md"
                />
              </div>
            ) : !activeClub ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                  <UserCheck className="h-8 w-8 text-red-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Club non selezionato
                </h3>
                <p className="text-gray-500 mb-4">
                  Seleziona un club per visualizzare e gestire gli atleti
                </p>
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={() => (window.location.href = "/dashboard")}
                >
                  Vai alla Dashboard
                </Button>
              </div>
            ) : filteredAthletes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <UserCheck className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {statusFilter === "all"
                    ? "Nessun atleta presente"
                    : `Nessun atleta ${statusFilter === "active" ? "attivo" : statusFilter === "suspended" ? "sospeso" : "disattivato"}`}
                </h3>
                <p className="text-gray-500 mb-4">
                  {statusFilter === "all"
                    ? "Inizia aggiungendo il primo atleta al tuo club"
                    : "Prova a cambiare il filtro per vedere altri atleti"}
                </p>
                {statusFilter === "all" && (
                  <Button
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={() => setShowAddAthleteModal(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Aggiungi Primo Atleta
                  </Button>
                )}
              </div>
            ) : (
              // Render categories with collapsible data grids
              <div className="space-y-4">
                {getUniqueCategories().map((category) => {
                  const categoryAthletes = filteredAthletes.filter(
                    (athlete) =>
                      (athlete.categoryId || UNCATEGORIZED_CATEGORY_ID) ===
                      category.id,
                  );

                  if (categoryAthletes.length === 0) return null;

                  const isCollapsed = collapsedCategories.has(category.id);

                  return (
                    <Card key={category.id} className="overflow-hidden">
                      <Collapsible
                        open={!isCollapsed}
                        onOpenChange={() => toggleCategoryCollapse(category.id)}
                      >
                        <CollapsibleTrigger asChild>
                          <CardHeader className="pb-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            <CardTitle className="flex items-center gap-2">
                              {isCollapsed ? (
                                <ChevronRight className="h-5 w-5 text-gray-500" />
                              ) : (
                                <ChevronDown className="h-5 w-5 text-gray-500" />
                              )}
                              <span className="inline-block w-3 h-3 rounded-full bg-blue-500"></span>
                              {category.name} ({categoryAthletes.length})
                            </CardTitle>
                          </CardHeader>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <CardContent>
                            {renderAthleteTable(categoryAthletes)}
                          </CardContent>
                        </CollapsibleContent>
                      </Collapsible>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      <AthleteQuickCreateDialog
        isOpen={showAddAthleteModal}
        onClose={() => setShowAddAthleteModal(false)}
        onSubmit={handleAddAthlete}
        categories={categories}
      />

      <AthleteImportDialog
        open={showImportAthletesModal}
        onOpenChange={setShowImportAthletesModal}
        categories={categories}
        onImport={handleImportAthletes}
      />

      <Dialog
        open={showCustomizeColumnsModal}
        onOpenChange={setShowCustomizeColumnsModal}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Personalizza Colonne</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Seleziona le colonne da visualizzare nella tabella degli atleti
            </p>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="column-name"
                  checked={visibleColumns.name}
                  onCheckedChange={(checked) =>
                    setVisibleColumns({ ...visibleColumns, name: !!checked })
                  }
                  disabled
                />
                <Label htmlFor="column-name">Nome Atleta (obbligatorio)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="column-category"
                  checked={visibleColumns.category}
                  onCheckedChange={(checked) =>
                    setVisibleColumns({
                      ...visibleColumns,
                      category: !!checked,
                    })
                  }
                />
                <Label htmlFor="column-category">Categoria</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="column-age"
                  checked={visibleColumns.age}
                  onCheckedChange={(checked) =>
                    setVisibleColumns({ ...visibleColumns, age: !!checked })
                  }
                />
                <Label htmlFor="column-age">Età</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="column-birthYear"
                  checked={visibleColumns.birthYear}
                  onCheckedChange={(checked) =>
                    setVisibleColumns({
                      ...visibleColumns,
                      birthYear: !!checked,
                    })
                  }
                />
                <Label htmlFor="column-birthYear">Anno di Nascita</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="column-status"
                  checked={visibleColumns.status}
                  onCheckedChange={(checked) =>
                    setVisibleColumns({ ...visibleColumns, status: !!checked })
                  }
                />
                <Label htmlFor="column-status">Stato</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="column-medicalCert"
                  checked={visibleColumns.medicalCert}
                  onCheckedChange={(checked) =>
                    setVisibleColumns({
                      ...visibleColumns,
                      medicalCert: !!checked,
                    })
                  }
                />
                <Label htmlFor="column-medicalCert">Certificato Medico</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="column-registrationComplete"
                  checked={visibleColumns.registrationComplete}
                  onCheckedChange={(checked) =>
                    setVisibleColumns({
                      ...visibleColumns,
                      registrationComplete: !!checked,
                    })
                  }
                />
                <Label htmlFor="column-registrationComplete">
                  Iscrizione Completata
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="column-jerseyNumber"
                  checked={visibleColumns.jerseyNumber}
                  onCheckedChange={(checked) =>
                    setVisibleColumns({
                      ...visibleColumns,
                      jerseyNumber: !!checked,
                    })
                  }
                />
                <Label htmlFor="column-jerseyNumber">Numero Maglia</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setShowCustomizeColumnsModal(false)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Salva Preferenze
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showBulkCategoryDialog}
        onOpenChange={setShowBulkCategoryDialog}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambia categoria agli atleti selezionati</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Seleziona la categoria di destinazione per gli atleti selezionati.
            </p>
            <div className="space-y-2">
              <Label htmlFor="bulk-category-target">Nuova categoria</Label>
              <select
                id="bulk-category-target"
                value={bulkCategoryTargetId}
                onChange={(event) => setBulkCategoryTargetId(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Seleziona una categoria</option>
                {categories.map((category) => (
                  <option key={`bulk-category-${category.id}`} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBulkCategoryDialog(false)}
            >
              Annulla
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              disabled={!bulkCategoryTargetId}
              onClick={() => {
                setPendingBulkAction({
                  scope: "selected",
                  action: "changeCategory",
                  targetCategoryId: bulkCategoryTargetId,
                });
                setShowBulkCategoryDialog(false);
              }}
            >
              Continua
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={Boolean(pendingBulkAction)}
        onClose={() => setPendingBulkAction(null)}
        onConfirm={runBulkAction}
        title="Conferma operazione in blocco"
        description={getBulkActionDescription()}
        confirmText="Sì, conferma"
        cancelText="No, annulla"
        type={pendingBulkAction?.action === "delete" ? "warning" : "question"}
      />
    </div>
  );
}
