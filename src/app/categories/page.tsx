"use client";

import React, { useMemo, useState } from "react";
import { CategoryAthletesDialog } from "@/components/dialogs/CategoryAthletesDialog";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Plus,
  Filter,
  Users,
  Calendar,
  MoreVertical,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import {
  CATEGORY_DESCRIPTION_MAX_LENGTH,
  CategoryEditorDialog,
} from "@/components/forms/CategoryEditorDialog";
import { CategoryDetailsDialog } from "@/components/categories/CategoryDetailsDialog";
import { apiRequest } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast-notification";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  compareAthletesByLastName,
  getAthleteDisplayName,
} from "@/lib/athlete-name-utils";
import {
  formatCategoryBirthYears,
  normalizeCategoryBirthYears,
  readCategorySortOrder,
} from "@/lib/category-utils";
import { readCategoryCompatibilityList } from "@/lib/category-compatibility";
import { sortByName } from "@/lib/sorting";
import {
  getPrimaryAthleteCategoryMembership,
  normalizeAthleteCategoryMemberships,
} from "@/lib/athlete-category-memberships";
import {
  getTrainerCategoryIds,
  getTrainerDisplayName,
  trainerHasCategory,
} from "@/lib/trainer-utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { normalizeClubSeasons } from "@/lib/club-seasons";
import { updateClubAthlete } from "@/lib/simplified-db";
import {
  buildCategoryGroups,
  buildCategoryGroupsForSites,
  getActiveClubSites,
  isMultiSiteClub,
  normalizeClubSites,
  serializeCategoryGroup,
  type CategoryGroup,
  type ClubSite,
} from "@/lib/club-sites";
import { SiteFilter } from "@/components/sites/site-filter";
import { MapPin } from "lucide-react";

interface Category {
  id: string;
  name: string;
  sport: string;
  ageRange: string;
  birthYearFrom?: number;
  birthYearTo?: number;
  birthYearsLabel: string;
  athletesCount: number;
  trainersCount: number;
  trainingsPerWeek: number;
  color: string;
  /**
   * Il posto scelto dal club (D-INT-9), quando c'e.
   *
   * Mancava, e questo modello di vista e un oggetto **chiuso**: il valore
   * letto dal database si fermava qui, e `ordineDelClub` — che lo legge —
   * trovava sempre `undefined`. Lo stato ottimistico dopo una freccia faceva
   * sembrare che l'ordine tenesse; al ricaricamento successivo l'elenco
   * tornava all'ordine di creazione, e la pagina che **scrive** l'ordine era
   * l'unica a non saperlo rileggere.
   */
  sortOrder: number | null;
  /**
   * Categorie in cui gli atleti di questa categoria possono essere utilizzati.
   * Configurazione esplicita, vedi `@/lib/category-compatibility`.
   */
  compatibleCategoryIds: string[];
}

type CategoryDialogAthlete = {
  id: string;
  name: string;
  avatar?: string;
  status: "active" | "inactive" | "suspended";
};

type ClubTrainer = {
  id: string;
  name?: string;
  categories?: any[];
  [key: string]: any;
};

const firstNonEmptyText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }

  return "";
};

const normalizeCategoryToken = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const flattenCategoryValues = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value.flatMap(flattenCategoryValues);
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, any>;
    return [
      record.id,
      record.categoryId,
      record.category_id,
      record.name,
      record.label,
      record.categoryName,
      record.category_name,
    ].filter((entry) => entry !== undefined && entry !== null);
  }

  return value === undefined || value === null ? [] : [value];
};

const getCategoryTokens = (category: any): string[] =>
  [
    category?.id,
    category?.name,
    category?.label,
    category?.title,
    category?.slug,
    category?.payload?.id,
    category?.payload?.name,
    category?.payload?.label,
    category?.payload?.title,
    category?.payload?.slug,
  ]
    .flatMap(flattenCategoryValues)
    .map(normalizeCategoryToken)
    .filter(Boolean);

const matchesCategory = (value: unknown, category: any): boolean => {
  const tokens = getCategoryTokens(category);
  if (!tokens.length) return false;

  if (Array.isArray(value)) {
    return value.some((item) => matchesCategory(item, category));
  }

  if (value && typeof value === "object") {
    return flattenCategoryValues(value).some((item) =>
      matchesCategory(item, category),
    );
  }

  const normalized = normalizeCategoryToken(value);
  return Boolean(normalized && tokens.includes(normalized));
};

const getAthleteCategoryReferences = (athlete: any) =>
  [
    athlete?.categoryId,
    athlete?.category_id,
    athlete?.category,
    athlete?.categoryName,
    athlete?.category_name,
    athlete?.categories,
    athlete?.categoryIds,
    athlete?.categoryNames,
    athlete?.data?.categoryId,
    athlete?.data?.category_id,
    athlete?.data?.category,
    athlete?.data?.categoryName,
    athlete?.data?.category_name,
    athlete?.data?.categories,
    athlete?.data?.categoryIds,
    athlete?.data?.categoryNames,
  ]
    .flatMap(flattenCategoryValues)
    .map(normalizeCategoryToken)
    .filter(Boolean);

const athleteBelongsToCategory = (athlete: any, category: any) => {
  const categoryReferences = new Set(getCategoryTokens(category));
  if (!categoryReferences.size) return false;

  return getAthleteCategoryReferences(athlete).some((reference) =>
    categoryReferences.has(reference),
  );
};

const getAthletesInCategory = (category: any, athletes: any[]) =>
  athletes.filter((athlete) => athleteBelongsToCategory(athlete, category));

const clearCategoryReferences = (value: any, category: any) => {
  if (Array.isArray(value)) {
    return value.filter((item) => !matchesCategory(item, category));
  }

  if (matchesCategory(value, category)) {
    return "";
  }

  return value;
};

const buildAthleteCategoryClearPayload = (athlete: any, category: any) => {
  const data =
    athlete?.data && typeof athlete.data === "object" && !Array.isArray(athlete.data)
      ? { ...athlete.data }
      : {};
  const remainingMemberships = normalizeAthleteCategoryMemberships(athlete)
    .filter(
      (membership) =>
        !matchesCategory(membership.categoryId, category) &&
        !matchesCategory(membership.categoryName, category),
    )
    .map((membership, index, memberships) => ({
      category_id: membership.categoryId,
      category_name: membership.categoryName,
      is_primary:
        membership.isPrimary ||
        !memberships.some((candidate) => candidate.isPrimary) && index === 0,
    }));
  const primaryMembership = getPrimaryAthleteCategoryMembership(
    normalizeAthleteCategoryMemberships(remainingMemberships),
  );

  if (matchesCategory(data.categoryId, category)) data.categoryId = null;
  if (matchesCategory(data.category_id, category)) data.category_id = null;
  if (matchesCategory(data.category, category)) data.category = "";
  if (matchesCategory(data.categoryName, category)) data.categoryName = "";
  if (matchesCategory(data.category_name, category)) data.category_name = "";
  if (Array.isArray(data.categories)) {
    data.categories = clearCategoryReferences(data.categories, category);
  }
  if (Array.isArray(data.categoryIds)) {
    data.categoryIds = clearCategoryReferences(data.categoryIds, category);
  }
  if (Array.isArray(data.categoryNames)) {
    data.categoryNames = clearCategoryReferences(data.categoryNames, category);
  }
  data.categoryMemberships = remainingMemberships;
  data.categories = remainingMemberships.map((membership) => membership.category_name);
  data.categoryIds = remainingMemberships.map((membership) => membership.category_id);
  data.categoryNames = remainingMemberships.map(
    (membership) => membership.category_name,
  );
  data.category = primaryMembership?.categoryId || "";
  data.categoryId = primaryMembership?.categoryId || null;
  data.category_id = primaryMembership?.categoryId || null;
  data.categoryName = primaryMembership?.categoryName || "";
  data.category_name = primaryMembership?.categoryName || "";

  return {
    category: primaryMembership?.categoryId || "",
    category_id: primaryMembership?.categoryId || "",
    categoryName: primaryMembership?.categoryName || "",
    category_name: primaryMembership?.categoryName || "",
    categories: remainingMemberships.map((membership) => membership.category_name),
    categoryIds: remainingMemberships.map((membership) => membership.category_id),
    categoryNames: remainingMemberships.map((membership) => membership.category_name),
    categoryMemberships: remainingMemberships,
    data,
  };
};

const updateAthleteCategoryOnly = async ({
  clubId,
  athlete,
  category,
}: {
  clubId: string;
  athlete: any;
  category: any;
}) => {
  const athleteId = firstNonEmptyText(athlete?.id, athlete?.athlete_id);
  const payload = buildAthleteCategoryClearPayload(athlete, category);

  if (!athleteId) {
    console.error("[delete-category] atleta senza id", { athlete, payload });
    throw new Error("Atleta senza ID: impossibile rimuovere la categoria");
  }

  try {
    return await updateClubAthlete(clubId, athleteId, payload);
  } catch (error: any) {
    console.error("[delete-category] errore aggiornamento atleta", {
      athleteId,
      athleteName: getAthleteDisplayName(athlete),
      payload,
      error,
    });
    throw new Error(
      `[athlete-update] Errore aggiornamento atleta ${athleteId}: ${
        error?.message || JSON.stringify(error)
      }`,
    );
  }
};

const getWeeklySlotCategoryReferences = (slot: any) =>
  [
    slot?.categoryId,
    slot?.category_id,
    slot?.category,
    slot?.categoryName,
    slot?.category_name,
    slot?.categories,
    slot?.categoryIds,
    slot?.categoryNames,
  ]
    .flatMap(flattenCategoryValues)
    .map(normalizeCategoryToken)
    .filter(Boolean);

const getWeeklySlotStableKey = (slot: any, index: number) =>
  String(
    slot?.id ||
      [
        slot?.day,
        slot?.weekday,
        slot?.startTime,
        slot?.start,
        slot?.endTime,
        slot?.end,
        getWeeklySlotCategoryReferences(slot).join(","),
      ]
        .filter(Boolean)
        .join("|") ||
      `slot-${index}`,
  );

const countWeeklyCategorySlots = (
  rawCategory: any,
  categoryName: string,
  weeklySchedule: any[],
  activeSeasonId?: string | null,
) => {
  const categoryReferenceSet = new Set(
    [
      rawCategory.id,
      rawCategory.name,
      rawCategory.title,
      rawCategory.label,
      rawCategory.payload?.name,
      categoryName,
    ]
      .map(normalizeCategoryToken)
      .filter(Boolean),
  );
  const matchedSlots = new Map<string, any>();

  weeklySchedule.forEach((slot, index) => {
    if (activeSeasonId && slot?.seasonId && slot.seasonId !== activeSeasonId) {
      return;
    }

    const belongsToCategory = getWeeklySlotCategoryReferences(slot).some(
      (reference) => categoryReferenceSet.has(reference),
    );

    if (belongsToCategory) {
      matchedSlots.set(getWeeklySlotStableKey(slot, index), slot);
    }
  });

  return matchedSlots.size;
};

const buildCategoryViewModel = (
  rawCategory: any,
  athletes: any[],
  trainers: any[],
  weeklySchedule: any[],
  activeSeasonId?: string | null,
): Category => {
  const { birthYearFrom, birthYearTo } = normalizeCategoryBirthYears(rawCategory);
  const categoryName =
    rawCategory.name ||
    rawCategory.title ||
    rawCategory.payload?.name ||
    "Categoria";

  const categoryAthletes = athletes.filter((athlete: any) => {
    const athleteStatus = athlete.status || athlete.data?.status || "active";
    return athleteBelongsToCategory(athlete, rawCategory) && athleteStatus === "active";
  });

  const categoryTrainers = trainers.filter((trainer: any) => {
    return trainerHasCategory(trainer, rawCategory);
  });

  return {
    id: rawCategory.id || `category-${Date.now()}-${Math.random()}`,
    name: categoryName,
    sport: rawCategory.description || rawCategory.sport || "Sport",
    ageRange: formatCategoryBirthYears({ ...rawCategory, birthYearFrom, birthYearTo }),
    birthYearFrom,
    birthYearTo,
    birthYearsLabel: formatCategoryBirthYears({
      ...rawCategory,
      birthYearFrom,
      birthYearTo,
    }),
    athletesCount: categoryAthletes.length,
    trainersCount: categoryTrainers.length,
    trainingsPerWeek: countWeeklyCategorySlots(
      rawCategory,
      categoryName,
      weeklySchedule,
      activeSeasonId,
    ),
    color: rawCategory.color || "bg-blue-500 text-white",
    compatibleCategoryIds: readCategoryCompatibilityList(rawCategory),
    sortOrder: readCategorySortOrder(rawCategory),
  };
};

export default function CategoriesPage() {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [loading, setLoading] = React.useState(true);
  const { user, activeClub, loading: authLoading } = useAuth();
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [showAthletesDialog, setShowAthletesDialog] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    null,
  );
  const [editingCategory, setEditingCategory] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(
    null,
  );
  const [showCategoryDetails, setShowCategoryDetails] = useState(false);

  // Real data for athletes in a category - loaded from database
  const [categoryAthletes, setCategoryAthletes] = useState<
    CategoryDialogAthlete[]
  >([]);
  const [clubAthletes, setClubAthletes] = useState<any[]>([]);
  const [clubTrainers, setClubTrainers] = useState<ClubTrainer[]>([]);
  const [sites, setSites] = useState<ClubSite[]>([]);
  const [rawCategoryGroups, setRawCategoryGroups] = useState<any[]>([]);
  const [clubStructures, setClubStructures] = useState<any[]>([]);
  const [siteFilter, setSiteFilter] = useState("");
  const { showToast } = useToast();
  const router = useRouter();

  // Load categories from database
  React.useEffect(() => {
    const loadCategories = async () => {
      if (authLoading) {
        return;
      }

      if (!user || !activeClub) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const [{ data: categoriesData, error: categoriesError }, { data: athletesData }, { data: clubData }] =
          await Promise.all([
            supabase
              .from("categories")
              .select("*")
              .eq("club_id", activeClub.id)
              .order("created_at", { ascending: true }),
            supabase
              .from("simplified_athletes")
              .select("*")
              .eq("club_id", activeClub.id),
            supabase
              .from("clubs")
              .select(
                "trainers, weekly_schedule, settings, club_sites, category_groups, structures",
              )
              .eq("id", activeClub.id)
              .single(),
          ]);


        if (categoriesError) {
          throw categoriesError;
        }

        const athletes = athletesData || [];
        const trainers = clubData?.trainers || [];
        const weeklySchedule = clubData?.weekly_schedule || [];
        const activeSeasonId = normalizeClubSeasons(
          clubData?.settings || {},
        ).activeSeasonId;
        const transformedCategories: Category[] = (categoriesData || []).map(
          (cat: any) =>
            buildCategoryViewModel(
              cat,
              athletes,
              trainers,
              weeklySchedule,
              activeSeasonId,
            ),
        );

        setClubAthletes(athletes);
        setClubTrainers(trainers);
        setSites(normalizeClubSites(clubData?.club_sites));
        setRawCategoryGroups(
          Array.isArray(clubData?.category_groups)
            ? clubData.category_groups
            : [],
        );
        setClubStructures(
          Array.isArray(clubData?.structures) ? clubData.structures : [],
        );
        setCategories(transformedCategories);
      } catch (error) {
        console.error("Error loading categories:", error);
        showToast("error", "Errore durante il caricamento delle categorie");
        setCategories([]);
        setClubAthletes([]);
        setClubTrainers([]);
      } finally {
        setLoading(false);
      }
    };

    loadCategories();
  }, [user, activeClub, showToast, authLoading]);

  const refetchCategories = async () => {
    if (!activeClub) {
      return;
    }

    const [{ data: categoriesData, error: categoriesError }, { data: athletesData }, { data: clubData }] =
      await Promise.all([
        supabase
          .from("categories")
          .select("*")
          .eq("club_id", activeClub.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("simplified_athletes")
          .select("*")
          .eq("club_id", activeClub.id),
      supabase
        .from("clubs")
        .select("trainers, weekly_schedule, settings")
        .eq("id", activeClub.id)
        .single(),
      ]);

    if (categoriesError) {
      throw categoriesError;
    }

    const athletes = athletesData || [];
    const trainers = clubData?.trainers || [];
    const weeklySchedule = clubData?.weekly_schedule || [];
    const activeSeasonId = normalizeClubSeasons(
      clubData?.settings || {},
    ).activeSeasonId;

    setClubAthletes(athletes);
    setClubTrainers(trainers);
    setCategories(
      (categoriesData || []).map((category: any) =>
        buildCategoryViewModel(
          category,
          athletes,
          trainers,
          weeklySchedule,
          activeSeasonId,
        ),
      ),
    );
  };

const buildDialogAthletesForCategory = (category: Category) =>
  clubAthletes
    .slice()
    .sort(compareAthletesByLastName)
    .filter((athlete: any) => athleteBelongsToCategory(athlete, category))
    .map((athlete: any) => ({
      id: athlete.id,
      name: getAthleteDisplayName(athlete) || "Atleta",
        avatar: athlete.avatar_url || athlete.data?.avatar || undefined,
        status: (athlete.status || athlete.data?.status || "active") as
          | "active"
          | "inactive"
          | "suspended",
      }));

  const handleAddCategory = async (categoryData: any) => {
    try {

      if (!user || !activeClub) {
        console.error("Missing user or activeClub:", {
          user: !!user,
          userDetails: user ? { id: user.id, email: user.email } : null,
          activeClub: !!activeClub,
          activeClubDetails: activeClub
            ? { id: activeClub.id, name: activeClub.name }
            : null,
        });
        showToast(
          "error",
          "Utente o club non trovato. Assicurati di aver selezionato un club.",
        );
        return false;
      }

      // Il secondo anno di nascita e facoltativo: una categoria puo coprire
      // un solo anno. `normalizeCategoryBirthYears` completa quello mancante.
      const { birthYearFrom, birthYearTo } = normalizeCategoryBirthYears(
        categoryData,
      );

      if (
        !categoryData.name ||
        !Number.isInteger(birthYearFrom) ||
        !Number.isInteger(birthYearTo)
      ) {
        console.error("Missing required fields:", categoryData);
        showToast(
          "error",
          "Nome categoria e anno di nascita iniziale sono obbligatori",
        );
        return false;
      }

      const trimmedDescription = categoryData.description?.trim() || "Sport";
      if (trimmedDescription.length > CATEGORY_DESCRIPTION_MAX_LENGTH) {
        showToast(
          "error",
          `La descrizione categoria deve essere al massimo ${CATEGORY_DESCRIPTION_MAX_LENGTH} caratteri`,
        );
        return false;
      }

      const payload = {
        id:
          editingCategory && selectedCategory
            ? selectedCategory.id
            : `category-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        club_id: activeClub.id,
        name: categoryData.name.trim(),
        description: trimmedDescription,
        sport: trimmedDescription,
        ageRange: categoryData.ageRange.trim(),
        birthYearFrom,
        birthYearTo,
        color: categoryData.color || "bg-blue-500 text-white",
        compatibleCategoryIds: readCategoryCompatibilityList(categoryData),
      };

      const { data, error } = await supabase.from("categories").upsert(payload);

      if (error) {
        throw error;
      }

      const savedCategory = Array.isArray(data) ? data[0] : data;
      const savedCategoryId = savedCategory?.id || payload.id;
      const assignedTrainerIds = Array.isArray(categoryData.assignedTrainerIds)
        ? categoryData.assignedTrainerIds
        : [];

      if (clubTrainers.length > 0) {
        const assignedTrainerIdSet = new Set(assignedTrainerIds);
        const updatedTrainers = clubTrainers.map((trainer) => {
          const currentCategoryIds = getTrainerCategoryIds(
            trainer.categories,
            categories,
          ).filter(
            (categoryId) =>
              categoryId !== savedCategoryId && categoryId !== payload.name,
          );

          return {
            ...trainer,
            categories: assignedTrainerIdSet.has(trainer.id)
              ? Array.from(new Set([...currentCategoryIds, savedCategoryId]))
              : currentCategoryIds,
          };
        });

        const { error: trainersUpdateError } = await supabase
          .from("clubs")
          .update({
            trainers: updatedTrainers,
          })
          .eq("id", activeClub.id);

        if (trainersUpdateError) {
          throw trainersUpdateError;
        }
      }

      /*
        Le sedi spuntate diventano gruppi operativi nello stesso salvataggio.
        Chiedere all'operatore di crearli a mano da un'altra schermata sarebbe
        chiedergli di ripetere una cosa che ha appena detto (ADR-0055).
      */
      if (isMultiSiteClub(sites)) {
        const existingForCategory = categoryGroups.filter(
          (group) => group.categoryId === savedCategoryId && !group.implicit,
        );

        await persistCategoryGroups(
          savedCategoryId,
          buildCategoryGroupsForSites({
            categoryId: savedCategoryId,
            categoryName: payload.name,
            siteIds: Array.isArray(categoryData.siteIds)
              ? categoryData.siteIds
              : [],
            sites: getActiveClubSites(sites),
            existing: existingForCategory,
          }),
          { silent: true },
        );
      }

      /*
        **Il riallineamento e un'operazione a se, e avviene dopo** (P0-8).

        Il cambio di sede e gia salvato: se questa parte fallisce, la
        configurazione resta quella che l'operatore ha scelto e gli atleti
        restano dove sono — cioe esattamente lo stato che il dialogo gli ha
        appena descritto. Non c'e niente da annullare, e nessuno stato
        intermedio che qualcuno debba indovinare.

        Si scrive dalla rotta generica delle appartenenze, che applica il
        perimetro di sede e categoria di chi sta salvando: un riallineamento
        non e un permesso in piu.
      */
      const riallineamento = categoryData.riallineamento;
      let riallineati = 0;

      if (riallineamento?.athleteIds?.length) {
        const appartenenze = clubAthletes
          .filter((athlete: any) =>
            riallineamento.athleteIds.includes(String(athlete?.id || "")),
          )
          .flatMap((athlete: any) =>
            (Array.isArray(athlete?.category_memberships)
              ? athlete.category_memberships
              : []
            ).filter(
              (membership: any) =>
                String(
                  membership?.category_id || membership?.categoryId || "",
                ) === String(savedCategoryId),
            ),
          );

        for (const membership of appartenenze) {
          try {
            const risposta = await apiRequest(
              `/api/v1/athlete_category_memberships/${String(membership.id)}`,
              {
                method: "PATCH",
                headers: { "x-active-club-id": activeClub.id },
                body: { site_id: riallineamento.siteId },
              },
            );
            if ((risposta as any)?.error) {
              throw new Error((risposta as any).error.message);
            }
            riallineati += 1;
          } catch (errore) {
            console.error("Error realigning athlete membership:", errore);
          }
        }
      }

      showToast(
        "success",
        editingCategory
          ? `Categoria ${categoryData.name} modificata con successo`
          : `Categoria ${categoryData.name} aggiunta con successo`,
      );

      if (riallineamento?.athleteIds?.length) {
        showToast(
          riallineati === riallineamento.athleteIds.length ? "success" : "error",
          riallineati === riallineamento.athleteIds.length
            ? `${riallineati} ${riallineati === 1 ? "assegnazione riallineata" : "assegnazioni riallineate"}`
            : `Riallineate ${riallineati} assegnazioni su ${riallineamento.athleteIds.length}: le altre vanno sistemate dalla scheda dell'atleta`,
        );
      }

      await refetchCategories();
      setEditingCategory(false);
      setSelectedCategory(null);
      return true;
    } catch (error: any) {
      console.error("Unexpected error in handleAddCategory:", error);

      // Provide more specific error messages based on error type
      let errorMessage = "Errore imprevisto durante il salvataggio";

      if (error.message?.includes("Impossibile connettersi")) {
        errorMessage =
          "Problema di connessione al database. Verifica la configurazione di Supabase.";
      } else if (error.message?.includes("Risorse insufficienti")) {
        errorMessage = "Server sovraccarico. Riprova tra qualche secondo.";
      } else if (error.message?.includes("Failed to fetch")) {
        errorMessage =
          "Errore di connessione. Verifica la tua connessione internet e riprova.";
      } else if (error.message?.includes("ERR_INSUFFICIENT_RESOURCES")) {
        errorMessage = "Risorse insufficienti. Riprova tra qualche secondo.";
      } else if (error.message?.includes("Database")) {
        errorMessage = `Errore database: ${error.message}`;
      } else if (error.message) {
        errorMessage = error.message;
      }

      showToast("error", errorMessage);
      return false;
    }
  };

  const categoryToDeleteAthletes = React.useMemo(
    () =>
      categoryToDelete
        ? getAthletesInCategory(categoryToDelete, clubAthletes)
        : [],
    [categoryToDelete, clubAthletes],
  );

  const detachAthletesFromCategory = async (
    category: Category,
    athletes: any[],
  ) => {
    const linkedAthletes = getAthletesInCategory(category, athletes);

    if (linkedAthletes.length === 0) {
      return {
        linkedAthletes,
        updatedAthletes: [],
      };
    }

    const cleanedAthletePayloads = linkedAthletes.map((athlete) => ({
      athleteId: firstNonEmptyText(athlete?.id, athlete?.athlete_id),
      payload: buildAthleteCategoryClearPayload(athlete, category),
    }));

    const updatedAthletes = [];
    for (const athlete of linkedAthletes) {
      const athleteId = firstNonEmptyText(athlete?.id, athlete?.athlete_id);
      try {
        const updatedAthlete = await updateAthleteCategoryOnly({
          clubId: activeClub!.id,
          athlete,
          category,
        });
        updatedAthletes.push(updatedAthlete);
      } catch (error) {
        console.error("[delete-category] atleta non aggiornato", {
          category,
          athleteId,
          athlete,
          error,
        });
        throw error;
      }
    }


    return {
      linkedAthletes,
      updatedAthletes,
    };
  };

  const handleDeleteCategory = async () => {
    if (!categoryToDelete || !user || !activeClub) return;

    setDeletingCategory(true);
    let linkedAthletes: any[] = [];

    try {
      if (!categoryToDelete.id) {
        throw new Error("Categoria senza ID: impossibile eliminarla in modo sicuro");
      }

      const detachResult = await detachAthletesFromCategory(
        categoryToDelete,
        clubAthletes,
      );
      linkedAthletes = detachResult.linkedAthletes;

      const { error: deleteError } = await supabase
        .from("categories")
        .delete()
        .eq("id", categoryToDelete.id)
        .eq("club_id", activeClub.id);

      if (deleteError) {
        console.error("[delete-category] errore delete categoria", {
          category: categoryToDelete,
          endpoint: "supabase.categories.delete",
          payload: { id: categoryToDelete.id, club_id: activeClub.id },
          error: deleteError,
        });
        throw deleteError;
      }


      setCategories((current) =>
        current.filter((category) => category.id !== categoryToDelete.id),
      );
      setClubAthletes((current) =>
        current.map((athlete) => {
          const updated = detachResult.updatedAthletes.find(
            (entry: any) =>
              firstNonEmptyText(entry?.id, entry?.athlete_id) ===
              firstNonEmptyText(athlete?.id, athlete?.athlete_id),
          );
          return updated || athlete;
        }),
      );
      showToast(
        "success",
        linkedAthletes.length > 0
          ? `Categoria eliminata. ${linkedAthletes.length} atleti spostati in Senza categoria.`
          : "Categoria eliminata.",
      );
      setSelectedCategory((current) =>
        current?.id === categoryToDelete.id ? null : current,
      );
      setCategoryToDelete(null);
      setShowDeleteConfirm(false);
      void refetchCategories().catch((refreshError) => {
        console.error("[delete-category] refresh post-delete non riuscito", {
          category: categoryToDelete,
          linkedAthletesCount: linkedAthletes.length,
          error: refreshError,
        });
      });
    } catch (error: any) {
      console.error("[delete-category] errore eliminazione categoria", {
        category: categoryToDelete,
        linkedAthletesCount: linkedAthletes.length,
        linkedAthletes,
        error,
      });
      showToast(
        "error",
        String(error?.message || "").includes("[athlete-update]")
          ? "Categoria non eliminata: non è stato possibile aggiornare gli atleti collegati."
          : "Errore durante l'eliminazione della categoria. Verifica i dettagli in console.",
      );
    } finally {
      setDeletingCategory(false);
    }
  };

  /**
   * Gruppi operativi del club: la coppia (categoria, sede). Le categorie senza
   * gruppi configurati ne ricevono uno implicito, quindi questa lista copre
   * sempre tutte le categorie (ADR-0038).
   */
  const categoryGroups = useMemo(
    () =>
      buildCategoryGroups({
        categories,
        sites,
        groups: rawCategoryGroups,
      }),
    [categories, sites, rawCategoryGroups],
  );

  const groupsByCategoryId = useMemo(() => {
    const byCategory = new Map<string, CategoryGroup[]>();
    categoryGroups.forEach((group) => {
      const bucket = byCategory.get(group.categoryId);
      if (bucket) {
        bucket.push(group);
      } else {
        byCategory.set(group.categoryId, [group]);
      }
    });
    return byCategory;
  }, [categoryGroups]);

  /*
    Le sedi gia spuntate su questa categoria. Stabile fra un render e l'altro
    perche il modulo la usa come stato iniziale: un array nuovo a ogni render
    ricostruirebbe il modulo e cancellerebbe le spunte appena messe.
  */
  const editorSiteIds = useMemo(() => {
    if (!editingCategory || !selectedCategory) return [];

    return (groupsByCategoryId.get(selectedCategory.id) || [])
      .filter((group) => !group.implicit && group.active && group.siteId)
      .map((group) => group.siteId);
  }, [editingCategory, selectedCategory, groupsByCategoryId]);

  const persistCategoryGroups = async (
    categoryId: string,
    nextForCategory: CategoryGroup[],
    { silent = false }: { silent?: boolean } = {},
  ) => {
    if (!activeClub) return;

    const others = rawCategoryGroups.filter(
      (group: any) =>
        String(group?.categoryId || group?.category_id || "") !== categoryId,
    );
    const next = [...others, ...nextForCategory.map(serializeCategoryGroup)];
    const previous = rawCategoryGroups;

    setRawCategoryGroups(next);
    try {
      const { updateClubData } = await import("@/lib/simplified-db");
      await updateClubData(activeClub.id, "category_groups", next);
      if (!silent) showToast("success", "Gruppi operativi aggiornati");
    } catch {
      setRawCategoryGroups(previous);
      showToast("error", "Salvataggio dei gruppi operativi fallito");
    }
  };

  /*
    **L'ordine e quello del club** (D-INT-9).

    Qui si ordinava per nome, e questa e la pagina in cui il club **decide**
    l'ordine: rileggerlo alfabetizzato significava non poterlo mai vedere.
    Un club che pensa per fasce d'eta trovava «Allievi» prima di «Under 14»,
    e in ogni altra schermata lo stesso.

    Il posto e `sortOrder` se la categoria ce l'ha, altrimenti la posizione
    con cui e arrivata — cioe l'ordine di creazione, che e cio che il
    prodotto faceva prima e resta il ripiego onesto.
  */
  const ordineDelClub = (elenco: any[]) =>
    elenco
      .map((category, indice) => ({ category, indice }))
      .sort((sinistra, destra) => {
        /*
          Il posto lo legge la primitiva del dominio, non due grafie scritte
          qui: le grafie sono quattro — la colonna del club, il `payload`
          della riga di risorsa, e le due forme di ognuna — e questo lettore
          ne guardava due. Un secondo lettore dello stesso valore e il modo
          in cui due schermate finiscono per ordinare in modo diverso lo
          stesso elenco.
        */
        const postoSinistra = readCategorySortOrder(sinistra.category);
        const postoDestra = readCategorySortOrder(destra.category);

        const a = postoSinistra ?? Number.MAX_SAFE_INTEGER;
        const b = postoDestra ?? Number.MAX_SAFE_INTEGER;

        if (a !== b) return a - b;
        return sinistra.indice - destra.indice;
      })
      .map((voce) => voce.category);

  /**
   * **Sposta una categoria di un posto** (D-INT-9).
   *
   * Due pulsanti e non un trascinamento, e non e un ripiego: il
   * trascinamento su un telefono e la cosa piu difficile da azzeccare che
   * ci sia, e questa pagina si apre in palestra. Due frecce funzionano al
   * primo colpo, con il pollice, e sono raggiungibili da tastiera senza
   * scrivere niente in piu.
   *
   * Si riscrive il posto di **tutte** le categorie e non solo delle due
   * scambiate: un elenco in cui alcune hanno un posto e altre no si
   * riordina da solo alla prima aggiunta, e chi ha appena messo le squadre
   * in ordine se le ritrova mescolate.
   */
  const spostaCategoria = async (categoryId: string, verso: -1 | 1) => {
    if (!activeClub) return;

    const ordinate = ordineDelClub(categories);
    const da = ordinate.findIndex((voce: any) => voce.id === categoryId);
    const a = da + verso;
    if (da < 0 || a < 0 || a >= ordinate.length) return;

    const riordinate = [...ordinate];
    [riordinate[da], riordinate[a]] = [riordinate[a], riordinate[da]];

    const precedenti = categories;
    setCategories(
      riordinate.map((voce: any, indice: number) => ({
        ...voce,
        sortOrder: indice,
      })),
    );

    try {
      for (const [indice, voce] of riordinate.entries()) {
        const risposta = await apiRequest(
          `/api/v1/categories/${String((voce as any).id)}`,
          {
            method: "PATCH",
            headers: { "x-active-club-id": activeClub.id },
            body: { sortOrder: indice },
          },
        );
        if ((risposta as any)?.error) {
          throw new Error((risposta as any).error.message);
        }
      }
    } catch (errore) {
      console.error("Error reordering categories:", errore);
      setCategories(precedenti);
      showToast("error", "Non e stato possibile salvare l'ordine");
    }
  };

  const filteredCategories = ordineDelClub(
    categories.filter((category) => {
      const matchesQuery =
        category.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        category.sport.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesQuery || !siteFilter) {
        return matchesQuery;
      }

      // Una categoria appartiene alla sede se ha un gruppo in quella sede.
      // Il gruppo implicito (categoria senza sede) resta visibile ovunque:
      // filtrare per sede non deve nascondere cio che non e ancora collocato.
      return (groupsByCategoryId.get(category.id) || []).some(
        (group) => !group.siteId || group.siteId === siteFilter,
      );
    }),
  );

  return (
    <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Categorie" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <SharedPageHeader
              title="Categorie"
              subtitle="Organizza le categorie e i gruppi sportivi del club."
            />
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="relative w-full sm:w-auto">
                <Input
                  placeholder="Cerca categorie..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-full sm:w-80"
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                {false ? (
                  <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="flex-1 sm:flex-none">
                      <Filter className="h-4 w-4 mr-2" />
                      Filtri
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      onClick={() =>
                        showToast("info", "Filtro per sport applicato")
                      }
                    >
                      Per Sport
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        showToast("info", "Filtro per età applicato")
                      }
                    >
                      Per Età
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        showToast("info", "Filtro per numero atleti applicato")
                      }
                    >
                      Per Numero Atleti
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => showToast("info", "Filtri resettati")}
                    >
                      Resetta Filtri
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
                <Button
                  className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700"
                  onClick={() => setShowAddCategoryModal(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nuova Categoria
                </Button>
              </div>
            </div>

            <SiteFilter
              sites={sites}
              value={siteFilter}
              onChange={setSiteFilter}
              label="Mostra le categorie svolte a"
              id="categories-site-filter"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {loading || authLoading ? (
                <div className="col-span-full flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : !user || !activeClub ? (
                <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                    <Users className="h-8 w-8 text-red-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Club non selezionato
                  </h3>
                  <p className="text-gray-500 mb-4">
                    Seleziona un club per visualizzare e gestire le categorie
                  </p>
                  <Button
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={() => (window.location.href = "/dashboard")}
                  >
                    Vai alla Dashboard
                  </Button>
                </div>
              ) : filteredCategories.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    <Users className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Nessuna categoria presente
                  </h3>
                  <p className="text-gray-500 mb-4">
                    Inizia creando la prima categoria per il tuo club
                  </p>
                  <Button
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={() => setShowAddCategoryModal(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Crea Prima Categoria
                  </Button>
                </div>
              ) : (
                filteredCategories.map((category, posizione) => (
                  <Card key={category.id} className="overflow-hidden">
                    <div
                      className={`h-2 ${category.color.split(" ")[0]}`}
                    ></div>
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex min-w-0 items-center gap-1">
                          {/*
                            **L'ordine si sposta da qui** (D-INT-9).

                            Due frecce e non un trascinamento: questa pagina
                            si apre in palestra, e il trascinamento su un
                            telefono e la cosa piu difficile da azzeccare che
                            ci sia. Due pulsanti funzionano al primo colpo,
                            con il pollice, e da tastiera senza aggiungere
                            niente.

                            Compaiono solo quando l'elenco non e filtrato:
                            spostare «di un posto» dentro una vista parziale
                            sposterebbe di un posto **che non si vede**, e il
                            risultato sembrerebbe casuale.
                          */}
                          {!searchQuery && !siteFilter ? (
                            <div className="flex flex-col">
                              <button
                                type="button"
                                aria-label={`Sposta ${category.name} in su`}
                                data-testid="sposta-su"
                                disabled={posizione === 0}
                                className="rounded p-0.5 text-muted-foreground transition hover:bg-muted disabled:opacity-30"
                                onClick={() => spostaCategoria(category.id, -1)}
                              >
                                <ChevronUp className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Sposta ${category.name} in giu`}
                                data-testid="sposta-giu"
                                disabled={posizione === filteredCategories.length - 1}
                                className="rounded p-0.5 text-muted-foreground transition hover:bg-muted disabled:opacity-30"
                                onClick={() => spostaCategoria(category.id, 1)}
                              >
                                <ChevronDown className="h-4 w-4" />
                              </button>
                            </div>
                          ) : null}
                          <CardTitle className="truncate text-lg">
                            {category.name}
                          </CardTitle>
                        </div>
                        <Badge
                          className={`${category.color} max-w-[180px] truncate`}
                          title={category.sport}
                        >
                          {category.sport}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Anni di nascita: {category.birthYearsLabel}
                      </p>
                      {isMultiSiteClub(sites) ? (
                        <div className="flex flex-wrap items-center gap-1 pt-1">
                          {(groupsByCategoryId.get(category.id) || [])
                            .filter((group) => !group.implicit)
                            .map((group) => (
                              <Badge
                                key={group.id}
                                variant="outline"
                                className="gap-1 text-slate-600"
                              >
                                <MapPin className="h-3 w-3" />
                                {group.siteName}
                              </Badge>
                            ))}
                          {/*
                            Le sedi si cambiano dove si cambia la categoria:
                            una superficie sola, non due (ADR-0055).
                          */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-blue-600"
                            onClick={() => {
                              setSelectedCategory(category);
                              setEditingCategory(true);
                              setShowAddCategoryModal(true);
                            }}
                          >
                            {(groupsByCategoryId.get(category.id) || []).some(
                              (group) => !group.implicit,
                            )
                              ? "Cambia sedi"
                              : "Assegna sedi"}
                          </Button>
                        </div>
                      ) : null}
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              {category.athletesCount} atleti
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              {category.trainersCount} allenatori
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                              {category.trainingsPerWeek}{" "}
                              {category.trainingsPerWeek === 1
                                ? "allenamento settimanale"
                                : "allenamenti settimanali"}
                          </span>
                        </div>
                        <div className="flex justify-end pt-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Azioni per ${category.name}`}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedCategory(category);
                                  setEditingCategory(true);
                                  setShowAddCategoryModal(true);
                                }}
                              >
                                Modifica
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedCategory(category);
                                  setShowCategoryDetails(true);
                                }}
                              >
                                Info
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => {
                                  setCategoryToDelete(category);
                                  setShowDeleteConfirm(true);
                                }}
                              >
                                Elimina
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </DashboardPageContainer>
        </main>
      </div>

      <CategoryEditorDialog
        isOpen={showAddCategoryModal}
        onClose={() => {
          setShowAddCategoryModal(false);
          setEditingCategory(false);
        }}
        onSubmit={handleAddCategory}
        initialData={editingCategory ? selectedCategory : undefined}
        isEditing={editingCategory}
        availableTrainers={sortByName(
          clubTrainers.map((trainer) => ({
            id: trainer.id,
            name: getTrainerDisplayName(trainer),
          })),
          (trainer) => trainer.name,
        )}
        availableCategories={categories.map((category) => ({
          id: category.id,
          name: category.name,
        }))}
        initialAssignedTrainerIds={
          editingCategory && selectedCategory
            ? clubTrainers
                .filter((trainer) =>
                  trainerHasCategory(trainer, selectedCategory, categories),
                )
                .map((trainer) => trainer.id)
            : []
        }
        availableSites={getActiveClubSites(sites).map((site) => ({
          id: site.id,
          name: site.name,
        }))}
        initialSiteIds={editorSiteIds}
        /*
          Servono a **contare** cosa il cambio di sede rende incoerente,
          non a spostarlo (P0-8): il dialogo mostra il numero prima della
          conferma, e il riallineamento resta un gesto esplicito.
        */
        athletes={clubAthletes}
      />

      {selectedCategory && (
        <CategoryAthletesDialog
          isOpen={showAthletesDialog}
          onClose={() => setShowAthletesDialog(false)}
          categoryName={selectedCategory.name}
          athletes={categoryAthletes}
          onAddAthlete={() => {
            setShowAthletesDialog(false);
            router.push(`/athletes?category=${selectedCategory.id}`);
            showToast(
              "info",
              "Reindirizzamento alla pagina atleti per aggiungere nuovi atleti",
            );
          }}
        />
      )}

      <CategoryDetailsDialog
        open={showCategoryDetails}
        onOpenChange={setShowCategoryDetails}
        category={selectedCategory}
        onEdit={() => {
          setShowCategoryDetails(false);
          setEditingCategory(true);
          setShowAddCategoryModal(true);
        }}
      />

      <Dialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          if (!deletingCategory) setShowDeleteConfirm(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conferma eliminazione</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              <strong className="text-slate-900">Categoria:</strong>{" "}
              {categoryToDelete?.name || "Categoria"}
            </p>
            <p>
              <strong className="text-slate-900">Atleti collegati:</strong>{" "}
              {categoryToDeleteAthletes.length}
            </p>
            <p>
              {categoryToDeleteAthletes.length > 0
                ? `Questa categoria contiene ${categoryToDeleteAthletes.length} atleti. Eliminando la categoria, gli atleti verranno spostati in Senza categoria.`
                : "Questa categoria non contiene atleti. Puoi eliminarla senza spostare tesserati."}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deletingCategory}
            >
              Annulla
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={handleDeleteCategory}
              disabled={deletingCategory}
            >
              {deletingCategory ? "Eliminazione..." : "Elimina categoria"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
