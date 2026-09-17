"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  BarChart3,
  Layers,
  MapPin,
  MoreHorizontal,
  Pencil,
  Trash2,
  Users,
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { PageHeader, HeaderStat } from "@/components/web/page/PageHeader";
import { EmptyStateCard } from "@/components/web/page/Cards";
import { Button, IconButton } from "@/components/web/primitives/Button";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from "@/components/web/primitives/Overlays";
import { DangerConfirmDialog } from "@/components/web/overlays/Modal";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { RowActionDef } from "@/components/web/datagrid/types";
import { formatInteger } from "@/lib/web/format";
import { SiteContextControl } from "@/components/athletes/v2/athletes-context-controls";
import {
  CATEGORY_DESCRIPTION_MAX_LENGTH,
  CategoryEditorDrawer,
  DEFAULT_CATEGORY_COLOR,
} from "@/components/categories/v2/category-editor-drawer";
import { CategoryInspectorDrawer } from "@/components/categories/v2/category-inspector-drawer";
import { buildCategoryColumns } from "@/components/categories/v2/category-grid-columns";
import {
  CATEGORY_GRID_MODULE,
  CATEGORY_VIEWS,
  buildCategoryFilters,
  categoryRowId,
  categoryRowMatchesQuery,
  collectCategoryBirthYears,
  type CategoryRow,
  type CategoryViewModel,
} from "@/components/categories/v2/category-grid-model";
import { apiRequest } from "@/lib/api/client";
import { applyAthleteMembershipCommand } from "@/lib/athletes/memberships-client";
import { useToast } from "@/components/ui/toast-notification";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/providers/AuthProvider";
import { getAthleteDisplayName } from "@/lib/athlete-name-utils";
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
  getTrainerDisplayName,
  trainerHasCategory,
} from "@/lib/trainer-utils";
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

/**
 * **Categorie — Web V2** (pattern 1, elenco operativo).
 *
 * La logica dati e quella della V1 — stesse letture dall'adattatore tabella,
 * stesso `upsert`/`delete` su `categories`, stessa scrittura dei gruppi
 * operativi (ADR-0055), stesso riordino a frecce (D-INT-9), stesso
 * riallineamento esplicito (P0-8) — e vive in questo file come prima. Cambia
 * la superficie: intestazione di pagina con i numeri, il contesto di sede
 * (solo multi-sede, ADR-0038), un primario «Nuova categoria» che apre il
 * cassetto 720 a sezioni, la griglia con viste, filtri, colonne, e le
 * azioni di riga al posto del menu della card. L'ispettore sostituisce la
 * modale «Info»; la conferma di eliminazione dice **cosa se ne va**.
 *
 * Due cose la V1 aveva e non facevano niente: il menu «Filtri» dietro
 * `{false ? … : null}` e `CategoryAthletesDialog`, che nessun pulsante apriva.
 * Sono state tolte, non tradotte (CLAUDE.md §11.8).
 */
type Category = CategoryViewModel;

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
      /* La sede e il nome com'era sulla riga restano (ADR-0185 §8, revisione ostile C-R5): togliere una categoria non scollega le altre dalla loro sede. */
      stored_category_name: membership.storedCategoryName,
      site_id: membership.siteId,
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
    color: rawCategory.color || DEFAULT_CATEGORY_COLOR,
    compatibleCategoryIds: readCategoryCompatibilityList(rawCategory),
    sortOrder: readCategorySortOrder(rawCategory),
  };
};

export default function CategoriesPage() {
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [loading, setLoading] = React.useState(true);
  const { user, activeClub, loading: authLoading } = useAuth();
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
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
  /*
    Cio che la griglia sta mostrando: serve solo a decidere se le frecce
    dell'ordine hanno senso (V1: «compaiono solo quando l'elenco non e
    filtrato»). La griglia filtra da se; qui non si rifiltra niente.
  */
  const [gridQuery, setGridQuery] = useState("");
  const [gridFiltered, setGridFiltered] = useState(false);
  /* La vista chiesta da un contatore dell'intestazione. */
  const [requestedViewId, setRequestedViewId] = useState<string | null>(null);
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
        color: categoryData.color || DEFAULT_CATEGORY_COLOR,
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
        /*
          **Si tocca solo questa categoria** (ADR-0197, revisione D-H3): prima
          ogni allenatore veniva rinormalizzato sul catalogo della stagione
          attiva, e un riferimento dell'anno scorso `{ id, name }` si
          riscriveva come l'id omonimo di quest'anno — un'assegnazione che
          nessuno aveva fatto, e lo storico sparito. Adesso si aggiunge o si
          toglie l'identificativo di questa categoria e il resto resta com'e.
        */
        const stessaCategoria = (entry: unknown) => {
          const id = String(typeof entry === "string" ? entry : (entry as any)?.id || "").trim();
          return id === savedCategoryId;
        };
        const updatedTrainers = clubTrainers.map((trainer) => {
          const attuali = Array.isArray(trainer.categories) ? trainer.categories : [];
          const senzaQuesta = attuali.filter((entry: unknown) => !stessaCategoria(entry));
          const assegnato = assignedTrainerIdSet.has(trainer.id);
          const cambia = assegnato ? senzaQuesta.length === attuali.length : senzaQuesta.length !== attuali.length;
          if (!cambia) return trainer;
          return {
            ...trainer,
            categories: assegnato ? [...senzaQuesta, savedCategoryId] : senzaQuesta,
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

        /*
          Il riallineamento e un cambio di appartenenza (ADR-0194): passa dal
          comando canonico, che deriva la sede dalla squadra, tiene il ruolo
          della riga, riscrive la proiezione e lascia l'audit prima/dopo.
          Una sede vuota («senza sede») non e una squadra: le righe restano
          come sono, e lo si dice.
        */
        for (const membership of appartenenze) {
          const athleteId = String(membership?.athlete_id || membership?.athleteId || "");
          if (!athleteId || !riallineamento.siteId) continue;
          try {
            await applyAthleteMembershipCommand(athleteId, {
              kind: "assign",
              categoryId: String(savedCategoryId),
              siteId: String(riallineamento.siteId),
              role: membership?.is_primary || membership?.isPrimary ? "primary" : "secondary",
              previousPrimaryPolicy: "remove",
              otherSecondariesPolicy: "keep",
            });
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
  const ordineDelClub = <T extends Category>(elenco: T[]): T[] =>
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
        const postoSinistra = readCategorySortOrder(sinistra.category as Record<string, unknown>);
        const postoDestra = readCategorySortOrder(destra.category as Record<string, unknown>);

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
    const da = ordinate.findIndex((voce) => voce.id === categoryId);
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

  /*
    La ricerca per nome/sport la fa la griglia (`search`); qui resta solo il
    contesto di sede. Una categoria appartiene alla sede se ha un gruppo in
    quella sede. Il gruppo implicito (categoria senza sede) resta visibile
    ovunque: filtrare per sede non deve nascondere cio che non e ancora
    collocato.
  */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ordinate = useMemo(() => ordineDelClub(categories), [categories]);
  const filteredCategories = useMemo(
    () =>
      siteFilter
        ? ordinate.filter((category) =>
            (groupsByCategoryId.get(category.id) || []).some(
              (group) => !group.siteId || group.siteId === siteFilter,
            ),
          )
        : ordinate,
    [ordinate, siteFilter, groupsByCategoryId],
  );

  const multiSite = isMultiSiteClub(sites);

  /*
    Le righe della griglia: il modello di vista piu cio che la card V1
    mostrava accanto — le sedi dei gruppi operativi non impliciti, i nomi
    degli allenatori, le categorie compatibili — e la posizione nell'ordine
    del club, che e l'ordinamento di partenza.
  */
  const rows: CategoryRow[] = useMemo(
    () =>
      filteredCategories.map((category) => {
        const groups = groupsByCategoryId.get(category.id) || [];
        const configured = groups.filter((group) => !group.implicit);
        const trainers = clubTrainers.filter((trainer) =>
          trainerHasCategory(trainer, category, categories),
        );
        return {
          ...category,
          posizione: ordinate.findIndex((voce) => voce.id === category.id) + 1,
          siteNames: configured
            .filter((group) => group.active && group.siteId)
            .map((group) => group.siteName),
          siteIds: configured
            .filter((group) => group.active && group.siteId)
            .map((group) => group.siteId),
          archivedSiteNames: configured
            .filter((group) => !group.active && group.siteId)
            .map((group) => group.siteName),
          trainerIds: trainers.map((trainer) => String(trainer.id)),
          trainerNames: sortByName(
            trainers.map((trainer) => getTrainerDisplayName(trainer)),
            (name) => name,
          ),
          compatibleCategoryNames: category.compatibleCategoryIds
            .map((id) => categories.find((voce) => voce.id === id)?.name)
            .filter((name): name is string => Boolean(name)),
        };
      }),
    [filteredCategories, ordinate, groupsByCategoryId, clubTrainers, categories],
  );

  const trainerOptions = useMemo(
    () =>
      sortByName(
        clubTrainers.map((trainer) => ({
          id: String(trainer.id),
          name: getTrainerDisplayName(trainer),
        })),
        (trainer) => trainer.name,
      ),
    [clubTrainers],
  );

  const birthYears = useMemo(() => collectCategoryBirthYears(rows), [rows]);

  const filters = useMemo(
    () => buildCategoryFilters({ years: birthYears, trainers: trainerOptions }),
    [birthYears, trainerOptions],
  );

  const openInspector = (row: Category) => {
    setSelectedCategory(row);
    setShowCategoryDetails(true);
  };

  const openEditor = (row: Category) => {
    setShowCategoryDetails(false);
    setSelectedCategory(row);
    setEditingCategory(true);
    setShowAddCategoryModal(true);
  };

  const openCreate = () => {
    setSelectedCategory(null);
    setEditingCategory(false);
    setShowAddCategoryModal(true);
  };

  const goToAthletes = (row: Category) =>
    router.push(`/athletes?category=${encodeURIComponent(row.id)}`);

  const goToReport = (row: Category) =>
    router.push(`/reports?report=categories&categoryId=${encodeURIComponent(row.id)}`);

  const columns = useMemo(
    () => buildCategoryColumns({ multiSite, onOpen: openInspector }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [multiSite],
  );

  /*
    Le frecce dell'ordine compaiono solo quando l'elenco non e filtrato ne
    cercato ne ristretto a una sede (V1): spostare «di un posto» dentro una
    vista parziale sposterebbe di un posto che non si vede.
  */
  const canReorder = !gridQuery && !gridFiltered && !siteFilter;

  const selectedRow = selectedCategory
    ? rows.find((row) => row.id === selectedCategory.id) ?? null
    : null;

  /*
    Le azioni di riga sono chiusure sullo stato corrente e si ricostruiscono
    a ogni render: la griglia le usa solo per disegnare.
  */
  const rowActions: RowActionDef<CategoryRow>[] = [
    {
      id: "apri",
      label: "Apri",
      primary: true,
      icon: <ArrowUpRight />,
      onClick: (row) => openInspector(row),
    },
    {
      id: "modifica",
      label: "Modifica",
      icon: <Pencil />,
      onClick: (row) => openEditor(row),
    },
    {
      /*
        Le sedi si cambiano dove si cambia la categoria: una superficie
        sola, non due (ADR-0055). La voce resta perche la card V1 la aveva.
      */
      id: "sedi",
      label: "Cambia sedi",
      icon: <MapPin />,
      hidden: (row) => !multiSite || row.siteNames.length === 0,
      onClick: (row) => openEditor(row),
    },
    {
      id: "assegna-sedi",
      label: "Assegna sedi",
      icon: <MapPin />,
      hidden: (row) => !multiSite || row.siteNames.length > 0,
      onClick: (row) => openEditor(row),
    },
    {
      id: "atleti",
      label: "Vedi atleti",
      icon: <Users />,
      onClick: (row) => goToAthletes(row),
    },
    {
      id: "report",
      label: "Report",
      icon: <BarChart3 />,
      onClick: (row) => goToReport(row),
    },
    {
      id: "sposta-su",
      label: "Sposta in su",
      icon: <ArrowUp />,
      hidden: (row) => !canReorder || row.posizione <= 1,
      onClick: (row) => void spostaCategoria(row.id, -1),
    },
    {
      id: "sposta-giu",
      label: "Sposta in giù",
      icon: <ArrowDown />,
      hidden: (row) => !canReorder || row.posizione >= ordinate.length,
      onClick: (row) => void spostaCategoria(row.id, 1),
    },
    {
      id: "elimina",
      label: "Elimina",
      tone: "danger",
      icon: <Trash2 />,
      onClick: (row) => {
        setCategoryToDelete(row);
        setShowDeleteConfirm(true);
      },
    },
  ];

  /* I numeri dell'intestazione: sull'intero club, non sulla sede scelta. */
  const atletiAssegnati = useMemo(
    () =>
      new Set(
        clubAthletes
          .filter((athlete: any) => {
            const athleteStatus = athlete.status || athlete.data?.status || "active";
            return (
              athleteStatus === "active" &&
              categories.some((category) => athleteBelongsToCategory(athlete, category))
            );
          })
          .map((athlete: any) => firstNonEmptyText(athlete?.id, athlete?.athlete_id)),
      ).size,
    [clubAthletes, categories],
  );
  const senzaAtleti = categories.filter((category) => category.athletesCount === 0).length;
  const senzaAllenatore = categories.filter((category) => category.trainersCount === 0).length;

  const ready = !loading && !authLoading;
  const noClub = ready && (!user || !activeClub);
  const archiveEmpty = ready && Boolean(user && activeClub) && categories.length === 0;

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Categorie" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader
              eyebrow="Sport"
              title="Categorie"
              description="Organizza le categorie e i gruppi sportivi del club."
              stats={
                activeClub && ready && categories.length > 0 ? (
                  <>
                    <HeaderStat value={formatInteger(categories.length)} label="categorie" />
                    <HeaderStat value={formatInteger(atletiAssegnati)} label="atleti assegnati" tone="green" />
                    <HeaderStat
                      value={formatInteger(senzaAtleti)}
                      label="senza atleti"
                      tone={senzaAtleti > 0 ? "amber" : "ink"}
                      onClick={() => setRequestedViewId("senza-atleti")}
                    />
                    <HeaderStat
                      value={formatInteger(senzaAllenatore)}
                      label="senza allenatore"
                      tone={senzaAllenatore > 0 ? "amber" : "ink"}
                      onClick={() => setRequestedViewId("senza-allenatore")}
                    />
                    {multiSite ? (
                      <HeaderStat value={formatInteger(getActiveClubSites(sites).length)} label="sedi" />
                    ) : null}
                  </>
                ) : null
              }
              context={
                activeClub ? (
                  <SiteContextControl
                    sites={sites}
                    value={siteFilter}
                    onChange={setSiteFilter}
                    id="categories-site-filter"
                  />
                ) : null
              }
              actions={
                activeClub ? (
                  <>
                    <Menu>
                      <MenuTrigger asChild>
                        <IconButton aria-label="Altre azioni" variant="secondary" size="md">
                          <MoreHorizontal />
                        </IconButton>
                      </MenuTrigger>
                      <MenuContent align="end" width={220}>
                        <MenuItem onSelect={() => router.push("/reports?report=categories")}>
                          <BarChart3 />
                          Report categorie
                        </MenuItem>
                        {multiSite ? (
                          <MenuItem onSelect={() => router.push("/structures")}>
                            <MapPin />
                            Sedi e strutture
                          </MenuItem>
                        ) : null}
                      </MenuContent>
                    </Menu>
                    <Button variant="primary" onClick={openCreate}>
                      Nuova categoria
                    </Button>
                  </>
                ) : null
              }
            />

            {noClub ? (
              <EmptyStateCard
                icon={<Users />}
                iconTone="red"
                title="Club non selezionato"
                description="Seleziona un club per visualizzare e gestire le categorie"
                primary={
                  <Button variant="neutral" onClick={() => router.push("/dashboard")}>
                    Vai alla Dashboard
                  </Button>
                }
              />
            ) : archiveEmpty ? (
              /*
                Il modulo vuoto (pattern 8): un pannello solo, con la prima
                azione. La V1 mostrava questa stessa proposta anche quando la
                ricerca non trovava niente; qui il «nessun risultato» e della
                griglia, e non propone di creare.
              */
              <EmptyStateCard
                icon={<Layers />}
                title="Nessuna categoria presente"
                description="Inizia creando la prima categoria per il tuo club"
                primary={
                  <Button variant="neutral" onClick={openCreate}>
                    Crea la prima categoria
                  </Button>
                }
              />
            ) : (
              <DataGrid<CategoryRow>
                module={CATEGORY_GRID_MODULE}
                aria-label="Elenco categorie"
                rows={rows}
                getRowId={categoryRowId}
                rowLabel={(row) => row.name}
                totalCount={rows.length}
                columns={columns}
                filters={filters}
                views={CATEGORY_VIEWS}
                search={{ placeholder: "Cerca categorie", match: categoryRowMatchesQuery }}
                defaultSort={{ columnId: "ordine", direction: "asc" }}
                rowActions={rowActions}
                onOpenRow={openInspector}
                onInspectRow={openInspector}
                activeRowId={showCategoryDetails ? selectedRow?.id ?? null : null}
                requestedViewId={requestedViewId}
                onViewChange={() => setRequestedViewId(null)}
                onQueryChange={setGridQuery}
                onFiltersChange={(next) =>
                  setGridFiltered(
                    Object.values(next).some((value) =>
                      Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== "",
                    ),
                  )
                }
                state={ready ? "ready" : "loading"}
                empty={{
                  icon: <Layers />,
                  title: "Nessuna categoria in questa sede",
                  description:
                    "Con la sede scelta non c'è nessuna categoria: prova a cambiare il contesto o assegna la sede a una categoria.",
                  primary: (
                    <Button variant="secondary" size="sm" onClick={() => setSiteFilter("")}>
                      Tutte le sedi
                    </Button>
                  ),
                }}
                noun={{ singular: "categoria", plural: "categorie" }}
                canSelect={false}
                defaultPageSize={50}
              />
            )}
          </DashboardPageContainer>
        </main>
      </div>

      <CategoryEditorDrawer
        isOpen={showAddCategoryModal}
        onClose={() => {
          setShowAddCategoryModal(false);
          setEditingCategory(false);
        }}
        onSubmit={handleAddCategory}
        initialData={editingCategory ? selectedCategory : undefined}
        isEditing={editingCategory}
        availableTrainers={trainerOptions}
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
          non a spostarlo (P0-8): il cassetto mostra il numero prima della
          conferma, e il riallineamento resta un gesto esplicito.
        */
        athletes={clubAthletes}
      />

      <CategoryInspectorDrawer
        category={selectedRow}
        open={showCategoryDetails}
        onOpenChange={setShowCategoryDetails}
        multiSite={multiSite}
        onEdit={openEditor}
        onViewAthletes={goToAthletes}
        onReport={goToReport}
      />

      {/*
        Conferma proporzionata (guideline 08 §8.9): eliminare una categoria e
        distruttivo; con atleti dentro e anche **ampio**, e chiede il nome
        scritto. Il dominio non lo vieta: gli atleti passano in «Senza
        categoria» (V1), e la conferma lo dice invece di nasconderlo.
      */}
      <DangerConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          if (!deletingCategory) {
            setShowDeleteConfirm(open);
            if (!open) setCategoryToDelete(null);
          }
        }}
        onConfirm={handleDeleteCategory}
        loading={deletingCategory}
        title={`Eliminare ${categoryToDelete?.name || "questa categoria"}?`}
        description={
          categoryToDeleteAthletes.length > 0
            ? `Questa categoria contiene ${formatInteger(categoryToDeleteAthletes.length)} ${categoryToDeleteAthletes.length === 1 ? "atleta" : "atleti"}. Eliminando la categoria, gli atleti verranno spostati in Senza categoria.`
            : "Questa categoria non contiene atleti. Puoi eliminarla senza spostare tesserati."
        }
        consequences={[
          categoryToDeleteAthletes.length > 0
            ? `${formatInteger(categoryToDeleteAthletes.length)} ${categoryToDeleteAthletes.length === 1 ? "atleta passa" : "atleti passano"} in «Senza categoria»: ${categoryToDeleteAthletes
                .slice(0, 3)
                .map((athlete: any) => getAthleteDisplayName(athlete) || "Atleta")
                .join(", ")}${categoryToDeleteAthletes.length > 3 ? ` e altri ${formatInteger(categoryToDeleteAthletes.length - 3)}` : ""}`
            : "Nessun atleta collegato: nessun tesserato viene spostato.",
          "La fascia d'anno, il colore e le categorie compatibili configurate vengono rimosse.",
          "Gli allenatori, i gruppi operativi e gli slot del programma settimanale che la citano non vengono ripuliti.",
        ]}
        confirmLabel="Elimina categoria"
        typedConfirmation={
          categoryToDeleteAthletes.length > 0 ? categoryToDelete?.name || "ELIMINA" : undefined
        }
      />
    </div>
  );
}
