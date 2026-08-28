"use client";

import React, { useMemo, useState, useEffect } from "react";
import dynamic from "next/dynamic";
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
  Download,
  Upload,
  BarChart3,
} from "lucide-react";
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
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import { EntityIcon } from "@/components/ui/entity-icon";
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
  compareAthletesByLastName,
  getAthleteDisplayName,
  getAthleteFirstName,
  getAthleteLastName,
} from "@/lib/athlete-name-utils";
import {
  getClubAthletesPage,
  addClubAthlete,
  addClubAthletesBatch,
  updateClubAthlete,
  deleteClubAthlete,
} from "@/lib/simplified-db";
import type { ListPageMeta } from "@/lib/api/client";
import { describeSelection } from "@/lib/list-selection";
import { printPeoplePdf } from "@/lib/people-pdf-export";
import {
  buildCategoryGroups,
  buildCategoryGroupLabel,
  buildSiteIndex,
  compareCategoryGroups,
  getActiveCategoryGroups,
  getActiveClubSites,
  getMembershipGroupId,
  isMultiSiteClub,
  normalizeClubSites,
  recordMatchesSite,
  UNASSIGNED_SITE_LABEL,
  type CategoryGroup,
  type ClubSite,
} from "@/lib/club-sites";
import { CategoryGroupFilter, SiteFilter } from "@/components/sites/site-filter";
import { supabase } from "@/lib/supabase";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import type {
  AthleteImportOutcome,
  AthleteImportPayload,
} from "@/lib/athlete-import";

const AthleteImportDialog = dynamic(
  () =>
    import("@/components/forms/AthleteImportDialog").then(
      (module) => module.AthleteImportDialog,
    ),
  { ssr: false },
);

interface Athlete {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  categoryId: string | null;
  categoryLabel: string;
  membershipType: "primary" | "secondary";
  /** Sede in cui l'atleta svolge la categoria di questa riga (ADR-0038). */
  siteId: string;
  siteName: string;
  /**
   * Il **gruppo operativo** di questa riga: la coppia (categoria, sede), cioe
   * la squadra concreta. E l'unita con cui la pagina raggruppa gli elenchi,
   * perche `Pulcini · Scauri` e `Pulcini · Santi Cosma` sono due liste di
   * lavoro distinte e non due righe della stessa (ADR-0055).
   */
  groupId: string;
  primaryCategoryLabel?: string;
  allCategoryLabels: string[];
  age: number;
  status: "active" | "inactive" | "suspended";
  medicalCertExpiry: string;
  birthDate?: string;
  avatar?: string;
  accessCode?: string;
  jerseyNumber?: string;
  registrationComplete: boolean;
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
  /**
   * La sede da assegnare insieme alla categoria. E la procedura con cui un
   * club che ha appena configurato le sue sedi colloca il dato storico senza
   * aprire duecento schede una per una (ADR-0055).
   */
  targetSiteId?: string | null;
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

const coerceBoolean = (value: unknown) => {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return false;
  }

  return ["true", "1", "yes", "si", "sì", "active", "enabled"].includes(
    normalized,
  );
};

/**
 * Quanti atleti stanno in una pagina.
 *
 * E il tetto che il server accetta (`MAX_PAGE_SIZE`), e non e scelto per
 * caso: sotto questa soglia l'archivio intero arriva in una richiesta sola e
 * la pagina si comporta come si e sempre comportata — ricerca, raggruppamento
 * ed export nel browser, che con centocinquanta righe e piu rapido di un giro
 * sulla rete. Sopra, la pagina passa a chiedere i filtri al server.
 */
const ATHLETE_PAGE_SIZE = 200;

/**
 * Come si intitola il conteggio quando a contare e il server.
 *
 * Con la paginazione attiva l'elenco chiede una sola categoria di stato per
 * volta, e il totale che torna e gia quello: la riga ne annuncia uno, non
 * tre — di cui due sarebbero comunque zero.
 */
const STATUS_FILTER_HEADINGS: Record<
  "active" | "inactive" | "suspended" | "all",
  string
> = {
  active: "Atleti Attivi",
  suspended: "Atleti Sospesi",
  inactive: "Atleti in Prestito",
  all: "Atleti",
};

/**
 * L'indirizzo dell'iscrizione di un nuovo atleta.
 *
 * Il club viaggia nell'indirizzo, come per allenatori e soci: chi apre la
 * pagina da un collegamento salvato non deve dipendere da cosa c'e nel
 * localStorage (ADR-0057).
 */
const buildNewAthleteHref = (clubId?: string | null) =>
  clubId ? `/athletes/new?clubId=${encodeURIComponent(clubId)}` : "/athletes/new";

/**
 * Da righe del database a righe della tabella.
 *
 * Una riga per **appartenenza**, non per atleta: chi si allena con due gruppi
 * compare sotto entrambi. E il motivo per cui «visibili» e «totali» contano
 * cose diverse, e la pagina lo dice invece di far tornare i conti per finta.
 */
const buildAthleteRows = (
  rows: any[],
  normalizedCategories: any[],
  siteIndex: ReturnType<typeof buildSiteIndex>,
): Athlete[] =>
  rows.flatMap((athlete: any) => {
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
              siteId: "",
            },
          ];

    return rowMemberships.map((membership) => {
      const categoryId = membership.categoryId
        ? resolveCategoryId(membership.categoryId, normalizedCategories)
        : null;
      const categoryLabel = membership.categoryName
        ? resolveCategoryLabel(membership.categoryName, normalizedCategories)
        : "Senza categoria";

      const resolvedSiteId = siteIndex.resolveSiteId(membership.siteId);

      return {
        id: athlete.id,
        name: getAthleteDisplayName(athlete),
        firstName: getAthleteFirstName(athlete),
        lastName: getAthleteLastName(athlete),
        categoryId,
        categoryLabel,
        membershipType: membership.isPrimary ? "primary" : "secondary",
        siteId: resolvedSiteId,
        siteName: membership.siteId
          ? siteIndex.getSiteName(membership.siteId)
          : "",
        /*
          Il gruppo operativo della riga: la squadra concreta con cui questo
          atleta si allena. Non e la categoria, ed e l'unita con cui questa
          pagina raggruppa (ADR-0055).
        */
        groupId:
          getMembershipGroupId(
            { categoryId: categoryId || membership.categoryName, siteId: resolvedSiteId },
            siteIndex,
          ) || UNCATEGORIZED_CATEGORY_ID,
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
        registrationComplete: coerceBoolean(
          athlete.data?.enrollmentStatus ??
            athlete.data?.isRegistered ??
            athlete.data?.registered ??
            athlete.data?.enrolled,
        ),
      } as Athlete;
    });
  });

export default function AthletesPage() {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [athletes, setAthletes] = React.useState<Athlete[]>([]);
  const [categories, setCategories] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
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
  const [bulkSiteTargetId, setBulkSiteTargetId] = useState("");

  const [sites, setSites] = useState<ClubSite[]>([]);
  const [siteFilter, setSiteFilter] = useState("");
  /**
   * Il gruppo operativo scelto: `Pulcini · Roma` (RC Fix 2, punto 13).
   *
   * Un gruppo e la coppia (categoria, sede), quindi il filtro si traduce nei
   * due parametri che l'archivio conosce gia — `category_id` e `site_id` —
   * invece di introdurne un terzo. Cosi restringe **anche** la pagina che
   * arriva dal server, non solo le righe che sono gia a schermo: un filtro che
   * agisse solo su cio che e caricato direbbe «quattro atleti» guardandone
   * duecento su duemila.
   */
  const [groupFilter, setGroupFilter] = useState("");
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);

  /**
   * Le squadre fra cui si puo scegliere, adesso.
   *
   * Solo quelle configurate — un gruppo implicito e una categoria con un altro
   * nome (ADR-0055) — e solo quelle della sede scelta, se una sede e scelta:
   * e la strada **Sede → Gruppo**. Senza sede si vedono tutte, con la sede
   * scritta nell'etichetta: e la strada **direttamente Gruppo**.
   */
  const groupOptions = useMemo(
    () =>
      getActiveCategoryGroups(categoryGroups)
        .filter((group) => !group.implicit)
        .filter((group) => !siteFilter || group.siteId === siteFilter)
        .slice()
        .sort(compareCategoryGroups)
        .map((group) => ({ id: group.id, name: group.name })),
    [categoryGroups, siteFilter],
  );

  const selectedGroup = useMemo(
    () => categoryGroups.find((group) => group.id === groupFilter) || null,
    [categoryGroups, groupFilter],
  );

  /*
    Cambiare sede non deve lasciare selezionata una squadra di un'altra citta:
    l'elenco tornerebbe vuoto senza dire perche.
  */
  useEffect(() => {
    if (!groupFilter) return;
    if (groupOptions.some((group) => group.id === groupFilter)) return;
    setGroupFilter("");
  }, [groupFilter, groupOptions]);

  /*
    `meta` arriva solo quando la pagina e stata chiesta: `total` e il conteggio
    vero dell'archivio, non delle righe caricate. `paginated` dice se il
    server sta gia filtrando — sotto la soglia non lo fa, e la pagina continua
    a lavorare sui dati che ha in mano.
  */
  const [listMeta, setListMeta] = useState<ListPageMeta | null>(null);
  const [page, setPage] = useState(1);
  const [pageLoading, setPageLoading] = useState(false);
  const paginated = Boolean(listMeta && listMeta.total > listMeta.limit);

  // Status filter: "active" | "inactive" | "suspended" | "all"
  const [statusFilter, setStatusFilter] = useState<
    "active" | "inactive" | "suspended" | "all"
  >("active");

  // Default column preferences
  const defaultColumns = {
    name: true,
    category: false,
    age: false,
    status: true,
    medicalCert: true,
    birthYear: true,
    registrationComplete: false,
    jerseyNumber: false,
    columnSchemaVersion: 2,
  };

  // Load column preferences from localStorage
  const loadColumnPreferences = (clubId: string) => {
    if (typeof window !== "undefined" && clubId) {
      const saved = localStorage.getItem(`athleteColumns_${clubId}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return {
            ...defaultColumns,
            ...parsed,
            category:
              parsed?.columnSchemaVersion === 2
                ? Boolean(parsed.category)
                : false,
            age: false,
            birthYear: true,
            columnSchemaVersion: 2,
          };
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
  const pathname = usePathname() || "";
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const requestedClubId =
    searchParams.get("clubId") ||
    searchParams.get("organization_id") ||
    searchParams.get("organizationId");

  const resolveCurrentClubId = () => {
    let clubId = requestedClubId || activeClub?.id;

    if (!clubId && typeof window !== "undefined") {
      try {
        const activeClubData =
          (user?.id && localStorage.getItem(`activeClub_${user.id}`)) ||
          localStorage.getItem("activeClub");
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

      const [{ data: categoriesData }, { data: clubData }, athletesPage] =
        await Promise.all([
        supabase
          .from("categories")
          .select("*")
          .eq("club_id", clubId)
          .order("created_at", { ascending: true }),
        supabase
          .from("clubs")
          .select("club_sites, category_groups")
          .eq("id", clubId)
          .single(),
        // La lista mostra anagrafica, categoria e stato: non serve trasportare
        // gli allegati base64 di 200 schede atleta (WP-31).
        //
        // E ne chiede una pagina, non l'archivio: con 2.000 atleti la
        // differenza fra le due cose e il difetto originale di questa pagina
        // (R-02). I filtri partono solo quando l'archivio e grande — vedi
        // `paginated` piu sotto — cosi un club con settanta atleti continua a
        // cercare e raggruppare nel browser, che li e piu rapido.
        getClubAthletesPage(clubId, {
          view: "summary",
          limit: ATHLETE_PAGE_SIZE,
        }),
      ]);

      const athletesData = athletesPage.athletes;
      setListMeta(athletesPage.meta);
      setPage(1);

      const normalizedCategories = buildCategoryList(categoriesData || []);
      setCategories(normalizedCategories);

      const normalizedSites = normalizeClubSites(clubData?.club_sites);
      const siteIndex = buildSiteIndex(normalizedSites);
      setSites(normalizedSites);
      setCategoryGroups(
        buildCategoryGroups({
          categories: normalizedCategories,
          sites: normalizedSites,
          groups: clubData?.category_groups,
        }),
      );

      const transformedAthletes = buildAthleteRows(
        athletesData,
        normalizedCategories,
        siteIndex,
      );

      transformedAthletes.sort(compareAthletesByLastName);
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

  /**
   * Una pagina dell'archivio, con i filtri correnti applicati **dal server**.
   *
   * Si usa solo quando l'archivio supera una pagina. Sotto la soglia i dati
   * sono gia tutti in memoria e rifare il giro sulla rete a ogni carattere
   * digitato sarebbe piu lento, non piu veloce.
   */
  const loadAthletePage = React.useCallback(
    async (targetPage: number) => {
      const clubId = resolveCurrentClubId();
      if (!clubId) return;

      setPageLoading(true);
      try {
        const result = await getClubAthletesPage(clubId, {
          view: "summary",
          limit: ATHLETE_PAGE_SIZE,
          page: targetPage,
          search: searchQuery,
          status: statusFilter,
          // Un gruppo e la coppia (categoria, sede): si traduce nei due
          // parametri che l'archivio conosce gia.
          siteId: selectedGroup?.siteId || siteFilter,
          categoryId: selectedGroup?.categoryId || "",
        });

        setListMeta(result.meta);

        const rows = buildAthleteRows(
          result.athletes,
          categories,
          buildSiteIndex(sites),
        );
        rows.sort(compareAthletesByLastName);
        setAthletes(rows);
      } finally {
        setPageLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categories, searchQuery, selectedGroup, siteFilter, sites, statusFilter],
  );

  // Load athletes and categories from database
  useEffect(() => {
    refreshAthletesData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClub?.id, requestedClubId, user?.id]);

  /*
    Cambiare un filtro riporta alla prima pagina. Restare sulla settima
    mentre l'insieme si restringe mostra una schermata vuota che sembra un
    archivio vuoto.
  */
  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, siteFilter, groupFilter]);

  useEffect(() => {
    if (!paginated) return;

    /*
      Un quarto di secondo di pausa: senza, ogni carattere digitato nella
      casella di ricerca sarebbe una query sull'archivio.
    */
    const timer = window.setTimeout(() => {
      void loadAthletePage(page);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [paginated, page, loadAthletePage]);

  useEffect(() => {
    const action = searchParams.get("action");
    if (!action) {
      return;
    }

    if (action === "new") {
      // Il vecchio indirizzo con `?action=new` continua a funzionare: porta
      // alla pagina dedicata invece di aprire una finestra che non c'e piu.
      router.push(buildNewAthleteHref(resolveCurrentClubId()));
      return;
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

  /**
   * Import riga per riga, con avanzamento reale.
   *
   * Ogni atleta e una scrittura indipendente: se una fallisce, le precedenti
   * restano valide e la riga fallita finisce nel riepilogo con il motivo. Le
   * categorie create per l'occasione ma rimaste senza nemmeno un atleta
   * vengono rimosse: sono l'unica scrittura che l'import puo lasciare a meta.
   */
  const handleImportAthletes = async (
    importedRows: AthleteImportPayload[],
    { onProgress }: { onProgress: (completed: number) => void },
  ): Promise<AthleteImportOutcome> => {
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
        ) || categoryIdByKey.has(normalizedLabel);

      if (!normalizedLabel || hasExistingCategory) {
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
        id: createCategoryIdFromName(row.categoryLabel || "categoria-importata"),
        name: row.categoryLabel.trim(),
        birthYearFrom: safeBirthYear,
        birthYearTo: safeBirthYear,
      });
    });

    const createdCategoryIds = new Set<string>();

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
          throw new Error(
            `Creazione della categoria "${category.name}" non riuscita: nessun atleta e stato importato`,
          );
        }

        createdCategoryIds.add(category.id);
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

    const failed: AthleteImportOutcome["failed"] = [];
    const usedCategoryIds = new Set<string>();

    /*
      L'import va in scaglioni, non una richiesta per atleta.

      Prima questo era un ciclo con un `await addClubAthlete` dentro:
      duecento atleti erano duecento inserimenti piu duecento scritture di
      appartenenza, in fila. Su una connessione di palestra l'import di una
      squadra durava minuti. Le categorie si risolvono qui, prima di partire,
      perche dipendono dalle categorie appena create e non dal database.
    */
    const payloads = importedRows.map((row) => {
      const importedCategoryId =
        row.categoryId &&
        currentCategories.some((category) => category.id === row.categoryId)
          ? row.categoryId
          : categoryIdByKey.get(normalizeCategoryKey(row.categoryLabel || "")) ||
            null;

      const linkedCategory =
        currentCategories.find(
          (category) => category.id === importedCategoryId,
        ) || findCategoryForBirthDate(row.birthDate, currentCategories);

      if (linkedCategory?.id) {
        usedCategoryIds.add(linkedCategory.id);
      }

      return {
        firstName: row.firstName,
        lastName: row.lastName,
        birthDate: row.birthDate,
        category: linkedCategory?.id || null,
        categoryName: linkedCategory?.name || row.categoryLabel || null,
        status: "active",
        data: {
          gender: row.gender || "",
          fiscalCode: row.fiscalCode || "",
          email: row.email || "",
          phone: row.phone || "",
        },
      };
    });

    const { created, failedIndexes } = await addClubAthletesBatch(
      clubId,
      payloads,
      { onProgress },
    );

    for (const index of failedIndexes) {
      const row = importedRows[index];
      failed.push({
        rowNumber: row?.rowNumber ?? index + 1,
        label:
          `${row?.lastName || ""} ${row?.firstName || ""}`.trim() ||
          "riga senza nominativo",
        reason: "Scrittura non riuscita",
      });
    }

    const imported = created.length;
    onProgress(importedRows.length);

    for (const categoryId of createdCategoryIds) {
      if (usedCategoryIds.has(categoryId)) {
        continue;
      }

      await supabase
        .from("categories")
        .delete()
        .eq("id", categoryId)
        .eq("club_id", clubId);
    }

    await refreshAthletesData();

    return { imported, failed };
  };

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
    const clubId = resolveCurrentClubId();

    if (!clubId) {
      showToast("error", "Club non trovato");
      return;
    }

    try {
      await updateClubAthlete(clubId, athleteId, { status: newStatus });

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
    const clubId = resolveCurrentClubId();

    if (!clubId) {
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
      await deleteClubAthlete(clubId, athleteId);

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

  /*
    Con l'archivio grande i filtri li ha gia applicati il server, e rifarli
    qui non toglierebbe niente: filtrerebbe una pagina gia filtrata, e la
    differenza fra i due criteri — il server cerca su nome, cognome, codice e
    numero, la pagina anche sull'etichetta di categoria — farebbe sparire
    righe che il server ha appena scelto di mandare.
  */
  // Filter athletes by search and status
  const filteredAthletes = paginated
    ? athletes
    : athletes.filter((athlete) => {
    const matchesSearch =
      athlete.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      athlete.categoryLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      athlete.allCategoryLabels.some((label) =>
        label.toLowerCase().includes(searchQuery.toLowerCase()),
      );

    const matchesStatus =
      statusFilter === "all" || athlete.status === statusFilter;

    // Sede vuota sulla riga significa «non dichiarata», non «nessuna»: resta
    // visibile con qualunque filtro sede (ADR-0038).
    const matchesSite = recordMatchesSite(
      athlete.siteId ? [athlete.siteId] : [],
      siteFilter,
    );

    /*
      Il gruppo non ha indulgenze: un atleta di `Pulcini · Roma` non compare
      fra i `Pulcini · Aprilia`, nemmeno se la categoria coincide. E
      esattamente la contaminazione che un elenco operativo non deve avere.
    */
    const matchesGroup = !groupFilter || athlete.groupId === groupFilter;

        return matchesSearch && matchesStatus && matchesSite && matchesGroup;
      });

  const selectedAthletesCount = selectedAthleteIds.size;

  const getAthleteStatusLabel = (status: Athlete["status"]) => {
    if (status === "active") return "Attivo";
    if (status === "inactive") return "In Prestito";
    return "Sospeso";
  };

  const getVisibleAthleteExportColumns = () =>
    [
      { key: "name", label: "Atleta", enabled: true },
      {
        key: "category",
        label: "Categoria",
        enabled: visibleColumns.category,
      },
      { key: "age", label: "Eta", enabled: visibleColumns.age },
      {
        key: "birthYear",
        label: "Anno di Nascita",
        enabled: visibleColumns.birthYear,
      },
      { key: "status", label: "Stato", enabled: visibleColumns.status },
      {
        key: "medicalCert",
        label: "Certificato Medico",
        enabled: visibleColumns.medicalCert,
      },
      {
        key: "registrationComplete",
        label: "Iscrizione",
        enabled: visibleColumns.registrationComplete,
      },
      {
        key: "jerseyNumber",
        label: "Numero Maglia",
        enabled: visibleColumns.jerseyNumber,
      },
    ].filter((column) => column.enabled);

  const getAthleteExportValue = (athlete: Athlete, key: string) => {
    if (key === "name") return athlete.name;
    if (key === "category") {
      return athlete.membershipType === "secondary"
        ? `${athlete.categoryLabel} (secondaria)`
        : athlete.categoryLabel;
    }
    if (key === "age") return `${athlete.age} anni`;
    if (key === "birthYear") {
      return athlete.birthDate ? String(new Date(athlete.birthDate).getFullYear()) : "-";
    }
    if (key === "status") return getAthleteStatusLabel(athlete.status);
    if (key === "medicalCert") {
      return athlete.medicalCertExpiry
        ? `${formatDate(athlete.medicalCertExpiry)}${
            isCertificateExpired(athlete.medicalCertExpiry) ? " (scaduto)" : ""
          }`
        : "-";
    }
    if (key === "registrationComplete") {
      return athlete.registrationComplete ? "Completa" : "Da completare";
    }
    if (key === "jerseyNumber") return athlete.jerseyNumber || "-";
    return "-";
  };

  /**
   * Tutte le righe che l'export deve contenere.
   *
   * **Un export non e cio che si vede.** Con l'archivio paginato la pagina ha
   * in mano duecento righe su duemila: esportare quelle e chiamarle «atleti
   * filtrati» sarebbe una bugia in cima a un PDF. Le pagine restanti si
   * chiedono qui, una alla volta, e solo quando qualcuno preme Esporta — che
   * e il momento giusto per pagare quel costo.
   */
  const collectAthletesForExport = async (): Promise<Athlete[]> => {
    if (selectedAthleteIds.size) {
      return athletes.filter((athlete) => selectedAthleteIds.has(athlete.id));
    }

    if (!paginated || !listMeta) {
      return filteredAthletes;
    }

    const clubId = resolveCurrentClubId();
    if (!clubId) return filteredAthletes;

    const siteIndex = buildSiteIndex(sites);
    const collected: Athlete[] = [];
    const pages = Math.max(1, Math.ceil(listMeta.total / listMeta.limit));

    for (let index = 1; index <= pages; index += 1) {
      const result = await getClubAthletesPage(clubId, {
        view: "summary",
        limit: ATHLETE_PAGE_SIZE,
        page: index,
        search: searchQuery,
        status: statusFilter,
        siteId: selectedGroup?.siteId || siteFilter,
        categoryId: selectedGroup?.categoryId || "",
      });

      collected.push(
        ...buildAthleteRows(result.athletes, categories, siteIndex),
      );

      if (!result.meta?.hasMore) break;
    }

    collected.sort(compareAthletesByLastName);
    return collected;
  };

  const exportAthletesPdf = async () => {
    const exportAthletes = await collectAthletesForExport();
    const columns = getVisibleAthleteExportColumns();

    if (!exportAthletes.length) {
      showToast("error", "Nessun atleta da esportare");
      return;
    }

    const success = printPeoplePdf({
      clubName: activeClub?.name || activeClub?.clubName || "EasyGame",
      title: "Elenco Atleti",
      columns,
      rows: exportAthletes.map((athlete) => ({
        id: athlete.id,
        values: Object.fromEntries(
          columns.map((column) => [
            column.key,
            getAthleteExportValue(athlete, column.key),
          ]),
        ),
      })),
      scopeLabel: selectedAthleteIds.size
        ? describeSelection(exportAthletes.length, {
            one: "atleta",
            many: "atleti",
          })
        : `${exportAthletes.length} ${exportAthletes.length === 1 ? "atleta filtrato" : "atleti filtrati"}`,
      countLabel: "Atleti esportati",
    });

    if (!success) {
      showToast("error", "Consenti i popup per generare il PDF");
      return;
    }

    showToast("success", "PDF pronto: si apre la finestra di stampa");
  };

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
                /*
                  Senza sede indicata quella dell'atleta resta com'era: un
                  cambio di categoria non e il momento per cancellare
                  un'informazione che nessuno ha chiesto di cambiare.
                */
                ...(pendingBulkAction.targetSiteId
                  ? { site_id: pendingBulkAction.targetSiteId }
                  : {}),
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

  /**
   * Gli elenchi operativi: **un gruppo, una lista**.
   *
   * `Pulcini` che porta dentro Scauri e Santi Cosma non e utilizzabile: chi
   * stampa l'appello o conta gli iscritti di una squadra deve poter prendere
   * *una* squadra. Su un club mono-gruppo l'etichetta resta la categoria
   * nuda — il concetto di gruppo non compare a chi non ne ha bisogno
   * (ADR-0055).
   *
   * Una passata sola sulle righe gia filtrate: niente categorie x gruppi x
   * atleti a ogni render.
   */
  const athleteGroups = useMemo(() => {
    const buckets = new Map<
      string,
      {
        id: string;
        categoryId: string | null;
        categoryName: string;
        siteId: string;
        siteName: string;
        athletes: Athlete[];
      }
    >();

    filteredAthletes.forEach((athlete) => {
      const id = athlete.groupId || UNCATEGORIZED_CATEGORY_ID;
      const bucket = buckets.get(id);

      if (bucket) {
        bucket.athletes.push(athlete);
        return;
      }

      buckets.set(id, {
        id,
        categoryId: athlete.categoryId,
        categoryName: athlete.categoryLabel || "Senza categoria",
        siteId: athlete.siteId,
        siteName: athlete.siteName,
        athletes: [athlete],
      });
    });

    const groups = Array.from(buckets.values());

    /*
      Quante squadre ha ogni categoria: e la domanda che decide se l'etichetta
      deve dire anche la sede. Con una sola, dirla e rumore.
    */
    const groupCountByCategory = new Map<string, number>();
    groups.forEach((group) => {
      const key = group.categoryId || UNCATEGORIZED_CATEGORY_ID;
      groupCountByCategory.set(key, (groupCountByCategory.get(key) || 0) + 1);
    });

    return groups
      .map((group) => {
        const key = group.categoryId || UNCATEGORIZED_CATEGORY_ID;
        const needsSite = (groupCountByCategory.get(key) || 0) > 1;

        return {
          ...group,
          label:
            needsSite && (group.siteName || group.siteId)
              ? buildCategoryGroupLabel(group.categoryName, group.siteName)
              : needsSite
                ? buildCategoryGroupLabel(
                    group.categoryName,
                    UNASSIGNED_SITE_LABEL,
                  )
                : group.categoryName,
        };
      })
      .sort((left, right) =>
        compareCategoryGroups(
          {
            categoryName: left.categoryName,
            siteName: left.siteName,
            siteId: left.siteId,
          },
          {
            categoryName: right.categoryName,
            siteName: right.siteName,
            siteId: right.siteId,
          },
        ),
      );
  }, [filteredAthletes]);

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
                      <AvatarFallback className="bg-transparent p-0">
                        <EntityIcon
                          type="athlete"
                          label={athlete.name}
                          className="h-full w-full border-0"
                        />
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <button
                    onClick={() =>
                      router.push(
                        `/athletes/${athlete.id}?clubId=${resolveCurrentClubId() || ""}`,
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
                  {athlete.registrationComplete ? (
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
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Azioni per ${athlete.name}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() =>
                          router.push(
                            `/athletes/${athlete.id}?clubId=${resolveCurrentClubId() || ""}`,
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
    <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Atleti" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <SharedPageHeader
              title="Atleti"
              subtitle="Gestisci gli atleti tesserati del tuo club."
            />
            {/*
              Una riga sola: cerca, filtra, aggiungi. Le quattro azioni
              secondarie — colonne, report, export, import — stavano in fila
              come la principale e su telefono riempivano due schermate.
              Ora vivono in un menu e la barra ha una sola azione evidente.

              `lg:flex-wrap` non e cosmesi: da quando il filtro Gruppo si e
              aggiunto a quello Sede, a 1280 px i cinque blocchi chiedono piu
              spazio di quanto la riga ne abbia, e senza andare a capo il
              gruppo delle azioni veniva compresso sotto la sua larghezza —
              con «Nuovo atleta» tagliato da `overflow-x-hidden` del main.
            */}
            <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
              <div className="relative w-full lg:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Cerca per nome o cognome"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  aria-label="Cerca atleti"
                />
              </div>

              <div className="eg-scroll-x -mx-1 px-1 lg:mx-0 lg:px-0">
                <div
                  role="group"
                  aria-label="Filtra per stato"
                  className="inline-flex gap-1 rounded-lg border border-slate-200 bg-white p-1"
                >
                  <Button
                    variant={statusFilter === "active" ? "default" : "ghost"}
                    size="sm"
                    aria-pressed={statusFilter === "active"}
                    onClick={() => setStatusFilter("active")}
                    className="h-8 shrink-0 px-2.5 text-xs"
                  >
                    <Eye className="mr-1 h-3.5 w-3.5" />
                    Attivi
                  </Button>
                  <Button
                    variant={statusFilter === "suspended" ? "default" : "ghost"}
                    size="sm"
                    aria-pressed={statusFilter === "suspended"}
                    onClick={() => setStatusFilter("suspended")}
                    className="h-8 shrink-0 px-2.5 text-xs"
                  >
                    <UserX className="mr-1 h-3.5 w-3.5" />
                    Sospesi
                  </Button>
                  <Button
                    variant={statusFilter === "inactive" ? "default" : "ghost"}
                    size="sm"
                    aria-pressed={statusFilter === "inactive"}
                    onClick={() => setStatusFilter("inactive")}
                    className="h-8 shrink-0 px-2.5 text-xs"
                  >
                    <EyeOff className="mr-1 h-3.5 w-3.5" />
                    Disattivati
                  </Button>
                  <Button
                    variant={statusFilter === "all" ? "default" : "ghost"}
                    size="sm"
                    aria-pressed={statusFilter === "all"}
                    onClick={() => setStatusFilter("all")}
                    className="h-8 shrink-0 px-2.5 text-xs"
                  >
                    Tutti
                  </Button>
                </div>
              </div>

              <SiteFilter
                sites={sites}
                value={siteFilter}
                onChange={setSiteFilter}
                label="Sede"
                id="athletes-site-filter"
              />

              {/*
                Sede → Gruppo, oppure direttamente Gruppo. Con una sede scelta
                questo elenco mostra solo le sue squadre; senza, le mostra
                tutte con la sede nell'etichetta (RC Fix 2, punto 13).
              */}
              <CategoryGroupFilter
                groups={groupOptions}
                value={groupFilter}
                onChange={setGroupFilter}
                label="Gruppo"
                id="athletes-group-filter"
              />

              <div className="flex shrink-0 items-center gap-2 lg:ml-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9">
                      <MoreVertical className="mr-1.5 h-4 w-4" />
                      Altre azioni
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem
                      onClick={() => setShowCustomizeColumnsModal(true)}
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      Personalizza colonne
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => router.push("/reports?report=categories")}
                    >
                      <BarChart3 className="mr-2 h-4 w-4" />
                      Report categorie
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => void exportAthletesPdf()}
                      disabled={!filteredAthletes.length && !selectedAthleteIds.size}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Esporta PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setShowImportAthletesModal(true)}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Importa atleti
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  size="sm"
                  className="h-9 flex-1 lg:flex-none"
                  onClick={() => router.push(buildNewAthleteHref(resolveCurrentClubId()))}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Nuovo atleta
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
              {/*
                Sopra la soglia di paginazione i tre conteggi si ricavavano da
                `athletes`, che e **la pagina caricata**: su un club da 212
                atleti tutti attivi la riga diceva «Atleti Attivi: 200», due
                centimetri sopra la riga che diceva «212 atleti nell'archivio».
                Quando il server sta paginando, il numero vero e quello che il
                server ha contato — ed e gia filtrato per lo stato scelto,
                quindi ne basta uno.
              */}
              <h2 className="text-xl font-semibold">
                {paginated && listMeta ? (
                  <>
                    {STATUS_FILTER_HEADINGS[statusFilter]}: {listMeta.total}
                  </>
                ) : (
                  <>
                    Atleti Attivi:{" "}
                    {athletes.filter((a) => a.status === "active").length} |
                    Atleti Sospesi:{" "}
                    {athletes.filter((a) => a.status === "suspended").length} |
                    Atleti in Prestito:{" "}
                    {athletes.filter((a) => a.status === "inactive").length}
                  </>
                )}
              </h2>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-fit"
                    disabled={!athletes.length}
                  >
                    <MoreVertical className="mr-1.5 h-3.5 w-3.5" />
                    Azioni su tutti
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

            {selectedAthletesCount >= 2 ? (
              <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <ListChecks className="h-4 w-4 text-slate-500" />
                  <span>{selectedAthletesCount} atleti selezionati</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() =>
                      setPendingBulkAction({
                        scope: "selected",
                        action: "activate",
                      })
                    }
                  >
                    <UserCheck className="mr-1.5 h-3.5 w-3.5 text-green-600" />
                    Attiva
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() =>
                      setPendingBulkAction({
                        scope: "selected",
                        action: "inactive",
                      })
                    }
                  >
                    <UserMinus className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
                    Inattiva
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() =>
                      setPendingBulkAction({
                        scope: "selected",
                        action: "suspended",
                      })
                    }
                  >
                    <UserX className="mr-1.5 h-3.5 w-3.5 text-amber-600" />
                    Sospendi
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={!categories.length}
                    onClick={() => {
                      setBulkCategoryTargetId("");
                      setShowBulkCategoryDialog(true);
                    }}
                  >
                    <CheckSquare className="mr-1.5 h-3.5 w-3.5 text-blue-600" />
                    Cambia categoria
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-red-600 hover:text-red-700"
                    onClick={() =>
                      setPendingBulkAction({
                        scope: "selected",
                        action: "delete",
                      })
                    }
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Elimina
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={clearAthleteSelection}
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    Cancella selezione
                  </Button>
                </div>
              </div>
            ) : null}

            <Card className="hidden">
              <CardContent className="p-0">
                <div className="grid gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
                  <div className="border-b border-blue-100 bg-gradient-to-br from-blue-600 to-indigo-600 p-5 text-white lg:border-b-0 lg:border-r">
                    <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-blue-100">
                      <ListChecks className="h-4 w-4" />
                      Modifiche in blocco
                    </div>
                    <h3 className="mt-3 text-2xl font-semibold">
                      Azioni selezione
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
                          {/*
                            Con l'archivio paginato «totali» e il conteggio
                            del database, non delle righe caricate: mostrare
                            duecento accanto a un elenco di duemila atleti
                            sarebbe il numero sbagliato nel posto in cui si
                            guarda per primo.
                          */}
                          {paginated && listMeta
                            ? listMeta.total
                            : athletes.length}
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
                    onClick={() => router.push(buildNewAthleteHref(resolveCurrentClubId()))}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Aggiungi Primo Atleta
                  </Button>
                )}
              </div>
            ) : (
              // Un gruppo operativo, un elenco: le squadre non si mescolano.
              <div className="space-y-4">
                {athleteGroups.map((group: (typeof athleteGroups)[number]) => {
                  const isCollapsed = collapsedCategories.has(group.id);

                  return (
                    <Card key={group.id} className="overflow-hidden">
                      <Collapsible
                        open={!isCollapsed}
                        onOpenChange={() => toggleCategoryCollapse(group.id)}
                      >
                        <CardHeader className="pb-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <CollapsibleTrigger asChild>
                              <button
                                type="button"
                                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                              >
                                <CardTitle className="flex items-center gap-2">
                                  {isCollapsed ? (
                                    <ChevronRight className="h-5 w-5 text-gray-500" />
                                  ) : (
                                    <ChevronDown className="h-5 w-5 text-gray-500" />
                                  )}
                                  <span className="inline-block w-3 h-3 rounded-full bg-blue-500"></span>
                                  {group.label} ({group.athletes.length})
                                </CardTitle>
                              </button>
                            </CollapsibleTrigger>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full sm:w-auto"
                              disabled={
                                !group.categoryId ||
                                group.id === UNCATEGORIZED_CATEGORY_ID
                              }
                              onClick={() =>
                                router.push(
                                  `/reports?report=categories&categoryId=${encodeURIComponent(group.categoryId || "")}`,
                                )
                              }
                            >
                              <BarChart3 className="h-4 w-4 mr-2" />
                              Report
                            </Button>
                          </div>
                        </CardHeader>
                        <CollapsibleContent>
                          <CardContent>
                            {renderAthleteTable(group.athletes)}
                          </CardContent>
                        </CollapsibleContent>
                      </Collapsible>
                    </Card>
                  );
                })}
              </div>
            )}

            {/*
              La barra delle pagine compare **solo** quando c'e piu di una
              pagina. Un club con settanta atleti non deve imparare che
              esistono le pagine per usare la propria lista.
            */}
            {paginated && listMeta ? (
              <div className="mt-4 flex flex-col items-center justify-between gap-3 rounded-2xl border p-3 sm:flex-row">
                <p className="text-sm text-muted-foreground">
                  Pagina {page} di{" "}
                  {Math.max(1, Math.ceil(listMeta.total / listMeta.limit))} —{" "}
                  {listMeta.total} atleti nell&apos;archivio
                  {pageLoading ? " · caricamento…" : ""}
                </p>
                <div className="flex w-full gap-2 sm:w-auto">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 sm:flex-none"
                    disabled={page <= 1 || pageLoading}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Precedente
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 sm:flex-none"
                    disabled={!listMeta.hasMore || pageLoading}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Successiva
                  </Button>
                </div>
              </div>
            ) : null}
          </DashboardPageContainer>
        </main>
      </div>

      {showImportAthletesModal ? (
        <AthleteImportDialog
          open={showImportAthletesModal}
          onOpenChange={setShowImportAthletesModal}
          categories={categories}
          existingAthletes={athletes.map((athlete) => ({
            firstName: athlete.firstName,
            lastName: athlete.lastName,
            birthDate: athlete.birthDate,
          }))}
          onImport={handleImportAthletes}
        />
      ) : null}

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
              <div className="hidden">
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

            {/*
              La sede in blocco esiste per un motivo solo: collocare il dato
              storico. Un club che configura le sedi oggi ha centinaia di
              atleti senza sede, e assegnarla scheda per scheda vuol dire non
              assegnarla (ADR-0055).
            */}
            {isMultiSiteClub(sites) ? (
              <div className="space-y-2">
                <Label htmlFor="bulk-site-target">Sede</Label>
                <select
                  id="bulk-site-target"
                  value={bulkSiteTargetId}
                  onChange={(event) => setBulkSiteTargetId(event.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Lascia la sede attuale</option>
                  {getActiveClubSites(sites).map((site) => (
                    <option key={`bulk-site-${site.id}`} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
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
                  targetSiteId: bulkSiteTargetId || null,
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
