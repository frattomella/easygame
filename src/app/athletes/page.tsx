"use client";

import React, { useCallback, useMemo, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CheckSquare,
  MoreHorizontal,
  Search,
  Trash2,
  Upload,
  UserCheck,
  UserMinus,
  UserX,
  Users,
} from "lucide-react";
import { useToast } from "@/components/ui/toast-notification";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useGlobalLoading } from "@/components/providers/GlobalLoadingProvider";
import {
  ATHLETE_BULK_STATUS_ACTIONS,
  ATHLETE_STATUS_HEADINGS,
  ATHLETE_STATUS_LABELS,
  ATHLETE_STATUSES,
  ATHLETE_STATUS_PLURAL_LABELS,
  normalizeAthleteStatus,
  type AthleteBulkStatusAction,
  type AthleteStatus,
  type AthleteStatusFilter,
} from "@/lib/athletes/status";
import {
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
  updateClubAthlete,
  deleteClubAthlete,
} from "@/lib/simplified-db";
import { apiRequest, type ListPageMeta } from "@/lib/api/client";
import {
  eDatiPersonaliDaSmaltire,
  messaggioDatiPersonali,
} from "@/components/athletes/profile/athlete-data-subject-section";
import { describeSelection } from "@/lib/list-selection";
import { printPeoplePdf } from "@/lib/people-pdf-export";
import { csvFileName, downloadCsv, toCsv } from "@/lib/csv";
import { buildCategoryDisplayIndex } from "@/lib/categories/display";
import {
  buildCategoryGroups,
  labelCategoryGroupOptions,
  buildSiteIndex,
  compareCategoryGroups,
  getActiveCategoryGroups,
  getMembershipGroupId,
  normalizeClubSites,
  recordMatchesSite,
  type CategoryGroup,
  type ClubSite,
} from "@/lib/club-sites";
import { normalizeClubSeasons } from "@/lib/club-seasons";
import { supabase } from "@/lib/supabase";
import { PageHeader, HeaderStat } from "@/components/web/page/PageHeader";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { Eyebrow } from "@/components/web/primitives/Surface";
import { SegmentedControl } from "@/components/web/primitives/Controls";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from "@/components/web/primitives/Overlays";
import { ConfirmDialog, DangerConfirmDialog } from "@/components/web/overlays/Modal";
import { EmptyStateCard } from "@/components/web/page/Cards";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type {
  BulkActionDef,
  ExportRequest,
  GroupDef,
  RowActionDef,
} from "@/components/web/datagrid/types";
import { formatInteger } from "@/lib/web/format";
import {
  ATHLETE_CERTIFICATE_VIEWS,
  ATHLETE_VIEWS,
  athleteRowKey,
  buildAthleteFilters,
  categoryDotColor,
  type Athlete,
  ATHLETE_CATEGORY_FILTER_ID,
  outOfSeasonGroupId,
} from "@/components/athletes/v2/athlete-grid-model";
import { buildAthleteColumns } from "@/components/athletes/v2/athletes-grid-columns";
import {
  GroupContextControl,
  SiteContextControl,
} from "@/components/athletes/v2/athletes-context-controls";
import { withClubId } from "@/components/web/hooks/use-route-club-id";
import { BulkCategoryDrawer } from "@/components/athletes/v2/bulk-category-drawer";
import { useMembershipTargetIndex } from "@/components/athletes/v2/AthleteCategoryMembershipEditor";
import { AthletesViewSwitch } from "@/components/athletes/v2/AthletesViewSwitch";

import type { ExistingAthleteIdentity } from "@/lib/athletes/import/plan";
import type { MembershipTarget } from "@/lib/categories/placement";

const AthleteImportDialog = dynamic(
  () =>
    import("@/components/forms/AthleteImportDialog").then(
      (module) => module.AthleteImportDialog,
    ),
  { ssr: false },
);

/*
  L'elenco Atleti nel Web V2 (guideline 07, pattern 1 «Operational list»):
  intestazione di pagina con i numeri e i controlli di contesto, poi **il**
  DataGrid. La logica dati e la stessa della V1 — stesse funzioni, stessi
  endpoint, stessa risoluzione dei bersagli — e vive qui; cio che disegna le
  colonne, i filtri e le viste sta in `src/components/athletes/v2/`.

  Il nome di un'azione e il nome di uno stato sono due vocabolari diversi.
  Confonderli era il difetto W6-03: `action: "activate"` finiva tale e quale
  in `athletes.status`, e quegli atleti sparivano da ogni filtro perche
  nessun confronto poteva riconoscerli. La traduzione ora e esplicita e sta
  in `ATHLETE_BULK_STATUS_ACTIONS`.
*/
type BulkActionType = AthleteBulkStatusAction | "delete";

type PendingBulkAction = {
  scope: "selected" | "all";
  action: BulkActionType;
  /**
   * **Gli atleti su cui l’azione girera, risolti quando si apre la
   * conferma** (P0-1, pilota Fortitudo Scauri).
   *
   * Prima non esistevano: il bersaglio si ricalcolava due volte, una per
   * scrivere il numero nella conferma e una per eseguire, e tutte e due
   * leggevano `athletes` — cioe **la pagina caricata**, non l’insieme
   * filtrato. Con 213 atleti la conferma diceva 245.
   *
   * Due difetti in una riga: le righe caricate possono contenere lo stesso
   * atleta piu volte (una tessera per categoria), e «tutti» significava
   * «quelli che ho in mano adesso».
   *
   * Risolverli **una volta** e conservarli qui vuol dire anche che il
   * numero mostrato e esattamente l’insieme su cui si scrive: due calcoli
   * separati sono due risposte che un giorno divergono.
   */
  targetIds: string[];
};

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
 * la griglia si comporta come si e sempre comportata — ricerca, filtri,
 * raggruppamento ed export nel browser, che con centocinquanta righe e piu
 * rapido di un giro sulla rete. Sopra, la pagina passa a chiedere stato e
 * ricerca al server.
 */
const ATHLETE_PAGE_SIZE = 200;

/**
 * Come si intitola il conteggio quando a contare e il server.
 *
 * Con la paginazione attiva l'elenco chiede una sola categoria di stato per
 * volta, e il totale che torna e gia quello: la riga ne annuncia uno, non
 * tre — di cui due sarebbero comunque zero.
 */
const STATUS_FILTER_HEADINGS = ATHLETE_STATUS_HEADINGS;

/**
 * L'indirizzo dell'iscrizione di un nuovo atleta.
 *
 * Il club viaggia nell'indirizzo, come per allenatori e soci: chi apre la
 * pagina da un collegamento salvato non deve dipendere da cosa c'e nel
 * localStorage (ADR-0057).
 */
const buildNewAthleteHref = (clubId?: string | null) =>
  clubId ? `/athletes/new?clubId=${encodeURIComponent(clubId)}` : "/athletes/new";

const buildAthleteProfileHref = (athleteId: string, clubId?: string | null) =>
  `/athletes/${athleteId}?clubId=${encodeURIComponent(clubId || "")}`;

/**
 * Il catalogo **di tutte le stagioni**, accanto a quello della stagione
 * attiva (ADR-0196).
 *
 * `normalizeAthleteCategoryMemberships` vuole «il catalogo del club — tutto,
 * mai un sottoinsieme»: passandole il solo catalogo della stagione attiva,
 * un'appartenenza alla «Under 14 Gold» della stagione **archiviata** non
 * trovava il suo identificativo e ripiegava sul nome, che nella stagione
 * nuova nomina la «Under 14 Gold» copiata dal riporto. La riga diceva quindi
 * che l'atleta stava nella squadra nuova: un riporto che nessuno aveva fatto,
 * disegnato dall'etichetta. Con il catalogo intero l'identita si risolve per
 * identificativo, e la riga dice la verita: quella squadra e di un'altra
 * stagione.
 */
type CatalogoPerIdentita = {
  completo: any[];
  stagioni: { id: string; label: string }[];
  /** La stagione dei record senza `seasonId`: la piu vecchia del club (WP-32). */
  legacySeasonId?: string | null;
};

const NESSUN_CATALOGO: CatalogoPerIdentita = { completo: [], stagioni: [], legacySeasonId: null };

/**
 * L'etichetta di un'appartenenza a una categoria che **non e** della stagione
 * attiva: il nome com'e sulla riga, con la stagione di quella categoria
 * accanto. Mai il nome nudo, che si confonderebbe con la squadra omonima
 * della stagione corrente.
 */
const etichettaFuoriStagione = (
  membership: { categoryId: string | null; categoryName: string },
  catalogo: CatalogoPerIdentita,
) => {
  const nome = String(membership.categoryName || "").trim() || "Senza categoria";
  const voce = catalogo.completo.find(
    (category) => String(category?.id || "") === String(membership.categoryId || ""),
  );
  if (!voce) {
    /*
      L'identificativo non c'e piu, ma il nome si: e una riga storica con un
      nome che oggi nomina una o piu categorie (revisione ostile ADR-0196 C7).
      Non si sceglie per lei: si dice che va verificata.
    */
    const omonime = catalogo.completo.filter((category) => String(category?.name || "").trim() === nome);
    return omonime.length ? `${nome} · da verificare` : `${nome} · non piu in catalogo`;
  }
  const seasonId = String(voce?.seasonId || "").trim() || String(catalogo.legacySeasonId || "");
  const stagione = catalogo.stagioni.find((season) => season.id === seasonId);
  return stagione ? `${nome} · stagione ${stagione.label}` : `${nome} · altra stagione`;
};

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
  catalogo: CatalogoPerIdentita = NESSUN_CATALOGO,
): Athlete[] =>
  rows.flatMap((athlete: any) => {
    /* L'identita si risolve sul catalogo intero, quando c'e; il perimetro e la stagione attiva. */
    const catalogoIdentita = catalogo.completo.length ? catalogo.completo : normalizedCategories;
    const memberships = normalizeAthleteCategoryMemberships(
      athlete,
      catalogoIdentita,
    );
    const primaryMembership = getPrimaryAthleteCategoryMembership(
      memberships,
      catalogoIdentita,
    );
    const inStagione = (membership: { categoryId: string | null }) =>
      !membership.categoryId ||
      normalizedCategories.some(
        (category) => String(category?.id || "") === String(membership.categoryId),
      );
    const etichettaDi = (membership: { categoryId: string | null; categoryName: string }) =>
      !membership.categoryName
        ? "Senza categoria"
        : inStagione(membership)
          ? resolveCategoryLabel(membership.categoryName, normalizedCategories)
          : etichettaFuoriStagione(membership, catalogo);
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
      const dellaStagione = inStagione(membership);
      const categoryId = membership.categoryId
        ? dellaStagione
          ? resolveCategoryId(membership.categoryId, normalizedCategories)
          : String(membership.categoryId)
        : null;
      const categoryLabel = etichettaDi(membership);

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
        groupId: dellaStagione
          ? getMembershipGroupId(
              { categoryId: categoryId || membership.categoryName, siteId: resolvedSiteId },
              siteIndex,
            ) || UNCATEGORIZED_CATEGORY_ID
          : outOfSeasonGroupId(categoryId || membership.categoryName),
        primaryCategoryLabel: primaryMembership
          ? etichettaDi(primaryMembership)
          : categoryLabel || "Senza categoria",
        primaryCategoryId: primaryMembership?.categoryId || categoryId || null,
        allCategoryLabels: rowMemberships.map((item) => etichettaDi(item)),
        age: athlete.birth_date
          ? new Date().getFullYear() -
            new Date(athlete.birth_date).getFullYear()
          : 0,
        status: normalizeAthleteStatus(
          athlete.status ?? athlete.data?.status,
        ),
        medicalCertExpiry: athlete.data?.medicalCertExpiry || "",
        birthDate: athlete.birth_date || "",
        fiscalCode: String(athlete.data?.fiscalCode || athlete.fiscal_code || "").trim().toUpperCase(),
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

/** Il tono del numero di stato nell'intestazione (guideline 09 §9.2). */
const STATUS_STAT_TONE: Record<AthleteStatus, "green" | "red" | "blue" | "ink"> = {
  active: "green",
  suspended: "red",
  loan: "blue",
  inactive: "ink",
};

export default function AthletesPage() {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [athletes, setAthletes] = React.useState<Athlete[]>([]);
  const [categories, setCategories] = React.useState<any[]>([]);
  /** Il catalogo di tutte le stagioni, per l'identita delle appartenenze (ADR-0196). */
  const [catalogoCompleto, setCatalogoCompleto] = React.useState<any[]>([]);
  const [legacySeasonId, setLegacySeasonId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [showImportAthletesModal, setShowImportAthletesModal] =
    useState(false);
  /**
   * La selezione della griglia, per **chiave di riga** (una tessera per
   * riga). Gli atleti — le persone — si ricavano deduplicando per `id` nel
   * momento in cui si risolvono i bersagli (`risolviBersagliMassivi`).
   */
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(
    new Set(),
  );
  const [pendingBulkAction, setPendingBulkAction] =
    useState<PendingBulkAction | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [showBulkCategoryDialog, setShowBulkCategoryDialog] = useState(false);
  /**
   * Gli atleti su cui «Cambia categoria» girera, risolti **prima** di aprire
   * il cassetto (selezione o «tutti», come per le altre azioni in blocco): il
   * cassetto chiede l'anteprima al server per questi identificativi e il
   * server scrive per questi identificativi (ADR-0194).
   */
  const [bulkCategoryTargetIds, setBulkCategoryTargetIds] = useState<string[]>([]);
  const [bulkCategoryResolving, setBulkCategoryResolving] = useState(false);
  /** Le righe su cui e stato chiesto «Cambia categoria», congelate all'apertura del cassetto. */
  const [bulkCategoryRows, setBulkCategoryRows] = useState<Athlete[]>([]);

  const [sites, setSites] = useState<ClubSite[]>([]);
  /** Le stagioni del club: servono a distinguere due squadre omonime nell'import (ADR-0195). */
  const [clubSeasons, setClubSeasons] = useState<{ id: string; label: string }[]>([]);
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
  /** Il club risolto all'ultimo caricamento: serve ai collegamenti delle righe. */
  const [resolvedClubId, setResolvedClubId] = useState<string | null>(null);

  /**
   * Come si scrive una categoria in questa pagina (N3): la sede si accosta
   * solo dove il nome ne nomina due. Le due sorgenti — catalogo e gruppi — la
   * pagina ce le ha gia.
   */
  const categoryDisplay = useMemo(
    () => buildCategoryDisplayIndex({ categories, groups: categoryGroups }),
    [categories, categoryGroups],
  );
  /** Le squadre scegliibili per «Cambia categoria» (ADR-0194): la sede e quella della squadra. */
  const membershipTargetIndex = useMembershipTargetIndex({ categories, groups: categoryGroups, sites });

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
    vero delle righe che rispondono ai filtri correnti, non delle righe
    caricate. Serve per l'intestazione e per i pulsanti di pagina.
  */
  const [listMeta, setListMeta] = useState<ListPageMeta | null>(null);
  const [page, setPage] = useState(1);
  const [pageLoading, setPageLoading] = useState(false);

  /*
    W6-01. `paginated` decide se comanda il server o il browser, e **non puo**
    dipendere dal totale filtrato.

    Prima era `listMeta.total > listMeta.limit` su un `meta` che arriva anche
    dalle chiamate filtrate. Su un club grande succedeva questo: si filtrava
    «Sospesi», il server rispondeva trenta righe su un limite di duecento,
    `paginated` diventava `false`, e l'effetto che ricarica — che comincia con
    `if (!paginated) return` — **si spegneva da solo**. Da quel momento nessuna
    richiesta partiva piu e ogni filtro successivo girava in memoria sui trenta
    sospesi rimasti: «Disattivati» dava zero risultati con l'archivio pieno.

    La misura giusta e la dimensione dell'**archivio**, che non cambia quando
    cambia un filtro. La scrive solo il caricamento iniziale.
  */
  const [archiveTotal, setArchiveTotal] = useState<number | null>(null);
  const paginated = (archiveTotal ?? 0) > ATHLETE_PAGE_SIZE;

  /**
   * Lo stato chiesto al server quando l'archivio e paginato.
   *
   * Sotto la soglia lo stato e una **vista** della griglia («Attivi» e quella
   * di partenza) e questo valore non comanda niente: il DataGrid filtra nel
   * browser le righe che ha. Sopra la soglia la griglia non puo dire al server
   * che cosa filtrare (il suo stato e interno), quindi lo stato si sceglie
   * nella banda d'archivio dentro il pannello, e viaggia nella query.
   */
  const [statusFilter, setStatusFilter] =
    useState<AthleteStatusFilter>("active");

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
      setLoadError(null);
      setResolvedClubId(clubId);

      const [{ data: categoriesData }, { data: clubData }, athletesPage, catalogoTutteLeStagioni] =
        await Promise.all([
        supabase
          .from("categories")
          .select("*")
          .eq("club_id", clubId)
          .order("created_at", { ascending: true }),
        supabase
          .from("clubs")
          .select("club_sites, category_groups, settings")
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
        /*
          Lo stesso catalogo **senza** il perimetro di stagione: un header
          vuoto dice al registro di non filtrare. Serve all'identita delle
          appartenenze, non all'elenco delle categorie fra cui scegliere.
        */
        apiRequest<any[]>(`/api/v1/categories?organization_id=${encodeURIComponent(clubId)}`, {
          headers: { "x-active-season-id": "" },
        }).then((response) => {
          if (response.error) {
            /* Senza il catalogo intero l'identita ripiega sui nomi: si dice, non si tace (revisione C8). */
            showToast("error", "Catalogo delle stagioni passate non letto: le squadre di altre stagioni potrebbero non essere distinte da quelle di oggi");
            return [];
          }
          return response.data || [];
        }),
      ]);

      const athletesData = athletesPage.athletes;
      setListMeta(athletesPage.meta);
      /*
        Questa e l'unica chiamata senza filtri, quindi l'unica che puo dire
        quanto e grande l'archivio. Vedi `paginated` (W6-01).
      */
      setArchiveTotal(athletesPage.meta?.total ?? athletesData.length);
      setPage(1);

      const normalizedCategories = buildCategoryList(categoriesData || []);
      setCategories(normalizedCategories);
      const completo = buildCategoryList(
        Array.isArray(catalogoTutteLeStagioni) && catalogoTutteLeStagioni.length
          ? catalogoTutteLeStagioni
          : categoriesData || [],
      );
      setCatalogoCompleto(completo);

      const normalizedSites = normalizeClubSites(clubData?.club_sites);
      const siteIndex = buildSiteIndex(normalizedSites);
      setSites(normalizedSites);
      const statoStagioni = normalizeClubSeasons(clubData?.settings);
      const stagioni = statoStagioni.seasons.map((season) => ({ id: season.id, label: season.label }));
      setClubSeasons(stagioni);
      setLegacySeasonId(statoStagioni.legacySeasonId);
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
        { completo, stagioni, legacySeasonId: statoStagioni.legacySeasonId },
      );

      transformedAthletes.sort(compareAthletesByLastName);
      setAthletes(transformedAthletes);
      setSelectedRowIds((currentSelection) => {
        const nextSelection = new Set<string>();
        transformedAthletes.forEach((athlete) => {
          const key = athleteRowKey(athlete);
          if (currentSelection.has(key)) {
            nextSelection.add(key);
          }
        });
        return nextSelection;
      });
    } catch (error) {
      console.error("Error loading athletes data:", error);
      setLoadError("Controlla la connessione e riprova.");
      showToast("error", "Errore nel caricamento dei dati");
    } finally {
      setLoading(false);
    }
  };

  /*
    **La richiesta piu recente e l'unica che ha ragione.**

    L'elenco continuo puo avere due letture in volo insieme — si digita mentre
    l'osservatore sta chiedendo la porzione successiva — e la piu lenta
    arriverebbe **dopo**, riscrivendo l'elenco con il risultato di un filtro
    che non e piu quello scritto nella casella. Un gettone crescente: chi torna
    e non e l'ultimo non tocca niente.
  */
  const gettoneLettura = React.useRef(0);

  /**
   * Una porzione dell'archivio, con i filtri correnti applicati **dal server**.
   *
   * Si usa solo quando l'archivio supera una porzione. Sotto la soglia i dati
   * sono gia tutti in memoria e rifare il giro sulla rete a ogni carattere
   * digitato sarebbe piu lento, non piu veloce.
   *
   * `accoda` distingue le due domande che la stessa rotta serve: «rifai
   * l'elenco con questi filtri» — la prima porzione — e «continua», le
   * successive. Prima esisteva solo la prima, e ogni porzione **sostituiva**
   * la precedente: era la paginazione classica, con due pulsanti in fondo.
   */
  const loadAthletePage = React.useCallback(
    async (
      targetPage: number,
      { accoda = false }: { accoda?: boolean } = {},
    ) => {
      const clubId = resolveCurrentClubId();
      if (!clubId) return;

      const mio = ++gettoneLettura.current;
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

        if (mio !== gettoneLettura.current) return;

        setListMeta(result.meta);

        const rows = buildAthleteRows(
          result.athletes,
          categories,
          buildSiteIndex(sites),
          { completo: catalogoCompleto, stagioni: clubSeasons, legacySeasonId },
        );
        rows.sort(compareAthletesByLastName);

        if (!accoda) {
          setAthletes(rows);
          return;
        }

        /*
          **Accodare non e concatenare.** L'archivio puo cambiare fra due
          letture — una segreteria che iscrive un atleta mentre qualcun altro
          scorre — e la stessa riga tornerebbe due volte, con due caselle di
          selezione che si spuntano insieme. Si accoda per identificativo, e
          l'ordine resta quello del cognome.
        */
        setAthletes((precedenti) => {
          const visti = new Set(precedenti.map((riga) => riga.id));
          const aggiunte = rows.filter((riga) => !visti.has(riga.id));
          if (!aggiunte.length) return precedenti;

          const uniti = [...precedenti, ...aggiunte];
          uniti.sort(compareAthletesByLastName);
          return uniti;
        });
      } finally {
        if (mio === gettoneLettura.current) setPageLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categories, searchQuery, selectedGroup, siteFilter, sites, statusFilter],
  );

  /**
   * **Continua**: la porzione successiva si aggiunge a quella che si sta
   * leggendo.
   *
   * Non e un pulsante «Successiva» con un altro nome. «Successiva»
   * **sostituiva** l'elenco, e su questa pagina l'elenco e anche il posto in
   * cui si scelgono le righe per un'azione massiva: chi ne aveva spuntate
   * dodici e passava di pagina non le vedeva piu, e non aveva modo di sapere
   * se erano ancora selezionate. Qui l'elenco cresce e la selezione resta
   * sotto gli occhi.
   */
  const caricaAltriAtleti = React.useCallback(() => {
    if (!paginated || pageLoading) return;
    if (!listMeta?.hasMore) return;

    const prossima = page + 1;
    setPage(prossima);
    void loadAthletePage(prossima, { accoda: true });
  }, [listMeta?.hasMore, loadAthletePage, page, pageLoading, paginated]);

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

      Questo effetto rifa **l'inizio** dell'elenco, e non dipende piu da
      `page`: la porzione successiva non e un cambio di stato da cui ripartire,
      e `caricaAltriAtleti` che la aggiunge in fondo.
    */
    const timer = window.setTimeout(() => {
      void loadAthletePage(1);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [paginated, loadAthletePage]);

  /*
    **L'elenco continua da solo quando si arriva in fondo.**

    Il sentinello e un nodo vuoto sotto l'ultima riga: quando entra nella
    finestra, la porzione successiva parte. Il pulsante sotto resta, e non e
    un ripiego — e la strada da tastiera, e quella per chi non vuole aspettare
    lo scorrimento. Chi usa `IntersectionObserver` non lo vedra mai lavorare.
  */
  const sentinelloElenco = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!paginated || !listMeta?.hasMore) return;
    if (typeof IntersectionObserver === "undefined") return;

    const nodo = sentinelloElenco.current;
    if (!nodo) return;

    const osservatore = new IntersectionObserver(
      (voci) => {
        if (voci.some((voce) => voce.isIntersecting)) caricaAltriAtleti();
      },
      /*
        Duecento pixel prima del fondo: la lettura parte mentre l'ultima riga
        e ancora in vista, cosi chi scorre non incontra un vuoto.
      */
      { rootMargin: "200px" },
    );

    osservatore.observe(nodo);
    return () => osservatore.disconnect();
  }, [paginated, listMeta?.hasMore, caricaAltriAtleti]);

  /*
    «Vedi atleti» di una categoria arriva con `?category=<id>` (la V1 lo
    mandava a una modale mai attivata): qui diventa il filtro Categoria di
    partenza della griglia. `categoryId` e accettato come sinonimo.
  */
  const categoryDeepLink =
    searchParams.get("category") || searchParams.get("categoryId") || null;

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
  /*
    L'import da file e un wizard con un writer sul server (ADR-0195): qui la
    pagina fornisce le squadre, le sedi e le schede esistenti (per i
    duplicati) e si limita a ricaricare l'elenco quando il lotto e scritto.
    Prima la pagina creava le categorie del file per conto suo — nove
    categorie fantasma in un import solo, sul pilota — e scriveva le schede
    riga per riga dal client.
  */
  const existingAthletesForImport = useMemo(() => {
    const perId = new Map<string, ExistingAthleteIdentity>();
    for (const athlete of athletes) {
      const current = perId.get(athlete.id);
      if (current) {
        current.hasMemberships = true;
        continue;
      }
      perId.set(athlete.id, {
        id: athlete.id,
        firstName: athlete.firstName,
        lastName: athlete.lastName,
        birthDate: athlete.birthDate || "",
        fiscalCode: athlete.fiscalCode || "",
        status: athlete.status,
        /* Una riga senza categoria ha comunque un'etichetta («Senza categoria»): conta la categoria, non l'etichetta (B3). */
        hasMemberships: Boolean(athlete.categoryId) || Boolean(athlete.primaryCategoryId),
        categoryLabel: athlete.primaryCategoryLabel || "",
      });
    }
    return Array.from(perId.values());
  }, [athletes]);

  /*
    Due squadre con la stessa etichetta (la stessa categoria in due stagioni,
    dopo un riporto) si distinguono con la stagione: scegliere «la prima»
    non e una scelta.
  */
  const describeImportTarget = useCallback(
    (target: MembershipTarget) => {
      const omonime = membershipTargetIndex.targets.filter((other) => other.label === target.label);
      if (omonime.length <= 1) return target.label;
      const category = categories.find((item: any) => item.id === target.categoryId);
      const seasonId = String(category?.seasonId || "");
      const season = seasonId ? clubSeasons.find((item) => item.id === seasonId) : null;
      /* Mai un identificativo grezzo a schermo (ADR-0185): senza stagione si dice che manca. */
      return season ? `${target.label} · stagione ${season.label}` : `${target.label} · stagione non indicata`;
    },
    [membershipTargetIndex, categories, clubSeasons],
  );

  // Function to update athlete status in database
  const updateAthleteStatus = async (
    athleteId: string,
    newStatus: AthleteStatus,
  ) => {
    const clubId = resolveCurrentClubId();

    if (!clubId) {
      showToast("error", "Club non trovato");
      return;
    }

    try {
      await updateClubAthlete(clubId, athleteId, { status: newStatus });

      // Update local state
      setAthletes((current) =>
        current.map((a) =>
          a.id === athleteId ? { ...a, status: newStatus } : a,
        ),
      );

      showToast(
        "success",
        `Atleta: stato aggiornato a "${ATHLETE_STATUS_LABELS[newStatus]}"`,
      );
    } catch (error) {
      console.error("Error updating athlete status:", error);
      showToast("error", "Errore nell'aggiornamento dello stato dell'atleta");
    }
  };

  /*
    W6-07. La conferma passa dal dialogo dell'applicazione — la stessa
    primitiva che questa pagina usa gia per le operazioni in blocco — e non
    dal `confirm()` del browser, che il browser stesso puo sopprimere e che
    dentro una webview puo non comparire affatto: l'operazione irreversibile
    partirebbe senza che nessuno abbia confermato niente.
  */
  const [pendingAthleteDeletion, setPendingAthleteDeletion] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deletingAthlete, setDeletingAthlete] = useState(false);

  const deleteAthlete = (athleteId: string, athleteName: string) => {
    if (!resolveCurrentClubId()) {
      showToast("error", "Club non trovato");
      return;
    }
    setPendingAthleteDeletion({ id: athleteId, name: athleteName });
  };

  const confirmAthleteDeletion = async () => {
    const pending = pendingAthleteDeletion;
    const clubId = resolveCurrentClubId();
    if (!pending || !clubId) return;
    const athleteId = pending.id;
    const athleteName = pending.name;

    setDeletingAthlete(true);
    try {
      await deleteClubAthlete(clubId, athleteId);

      // Update local state
      setAthletes((current) => current.filter((a) => a.id !== athleteId));

      showToast("success", `Atleta ${athleteName} eliminato con successo`);
    } catch (error: any) {
      console.error("Error deleting athlete:", error);
      /*
        **Il motivo lo diceva gia il server, e finiva nel cestino.**

        `assertPersonalDataDisposed` elenca i dati che resterebbero orfani — «3
        file depositati, 2 consensi registrati» — e indica la strada.
        Sostituirlo con «Errore nell'eliminazione dell'atleta» lasciava chi
        prova senza sapere ne cosa e successo ne cosa fare, e su quasi ogni
        atleta reale: l'iscrizione online crea richieste documentali e i moduli
        registrano consensi.
      */
      const messaggio = String(error?.message || "").trim();
      showToast(
        "error",
        eDatiPersonaliDaSmaltire(messaggio)
          ? messaggioDatiPersonali(messaggio, athleteName)
          : messaggio || "Errore nell'eliminazione dell'atleta",
      );
    } finally {
      setDeletingAthlete(false);
      setPendingAthleteDeletion(null);
    }
  };

  const clearAthleteSelection = () => {
    setSelectedRowIds(new Set());
  };

  /*
    W6-02. Il filtro di stato si applica **sempre**, anche quando comanda il
    server.

    Il primo caricamento chiede una pagina senza filtri — deve, per misurare
    l'archivio — e la ricarica filtrata arriva un quarto di secondo dopo. In
    quella finestra la pagina disegnava **tutti** gli stati, ed e il lampo che
    si vedeva entrando. Con il server che ha gia filtrato questo passaggio non
    toglie nulla: e un vaglio che non trova niente da togliere.

    Sotto la soglia lo stato lo filtra la griglia (vista «Attivi» e filtro
    «Stato»); qui restano sede e gruppo, che sono controlli di contesto della
    pagina e valgono in tutti e due i rami: la sede guida sia la query server
    sia il vaglio nel browser, e il gruppo non ha indulgenze — un atleta di
    `Pulcini · Roma` non compare fra i `Pulcini · Aprilia`, nemmeno se la
    categoria coincide.
  */
  const filteredAthletes = useMemo(() => {
    const matchesStatusFilter = (athlete: Athlete) =>
      statusFilter === "all" || athlete.status === statusFilter;

    const inStato = paginated
      ? athletes.filter(matchesStatusFilter)
      : athletes;

    return inStato.filter((athlete) => {
      // Sede vuota sulla riga significa «non dichiarata», non «nessuna»: resta
      // visibile con qualunque filtro sede (ADR-0038).
      const matchesSite = recordMatchesSite(
        athlete.siteId ? [athlete.siteId] : [],
        siteFilter,
      );
      const matchesGroup = !groupFilter || athlete.groupId === groupFilter;
      return matchesSite && matchesGroup;
    });
  }, [athletes, groupFilter, paginated, siteFilter, statusFilter]);

  /**
   * **Quante persone, non quante tessere** (P0-1).
   *
   * `athletes` e un elenco di **appartenenze**: chi si allena con due gruppi
   * compare due volte, ed e una scelta voluta per la griglia — «righe» conta
   * le righe che si vedono. Ma i numeri dell'intestazione sono persone, e nel
   * ramo paginato lo sono davvero (`listMeta.total`, che il database conta
   * sulle persone): nel ramo non paginato erano `athletes.length`, cioe le
   * tessere. Lo stesso numero cambiava significato a seconda della
   * dimensione del club — quaranta atleti di cui otto in due categorie
   * diventavano «48» — ed e la forma esatta del difetto che P0-1 ha chiuso
   * sull'insieme bersaglio e non qui: «213 contro 245».
   */
  const totaleAtletiDistinti = React.useMemo(
    () => new Set(athletes.map((athlete) => athlete.id)).size,
    [athletes],
  );

  /*
    W6-04. Erano tre conteggi scritti a mano, uno per stato. Gli stati sono
    quattro, e si itera sul vocabolario: un quinto stato, il giorno che
    servisse, si aggiunge in un posto solo e l'intestazione lo mostra da sola.
  */
  const conteggiPerStato = React.useMemo(
    () =>
      Object.fromEntries(
        ATHLETE_STATUSES.map((stato) => [
          stato,
          new Set(
            athletes
              .filter((a) => a.status === stato)
              .map((a) => a.id),
          ).size,
        ]),
      ) as Record<AthleteStatus, number>,
    [athletes],
  );

  /**
   * Tutte le righe che l'export deve contenere.
   *
   * **Un export non e cio che si vede.** Con l'archivio paginato la pagina ha
   * in mano duecento righe su duemila: esportare quelle e chiamarle «atleti
   * filtrati» sarebbe una bugia in cima a un PDF. Le pagine restanti si
   * chiedono qui, una alla volta, e solo quando qualcuno preme Esporta — che
   * e il momento giusto per pagare quel costo.
   *
   * **Tutto l'insieme filtrato, e non gli conta niente la selezione.**
   *
   * E la meta di `collectAthletesForExport` che risponde a «tutti»: sta a se
   * perche le due domande sono diverse, e confonderle e il difetto che questa
   * separazione chiude. L'export chiede «cosa metto sul foglio», e li la
   * selezione **e** la risposta — chi ha spuntato dodici righe vuole quelle
   * dodici. L'azione massiva «su tutti» chiede un'altra cosa, e la selezione
   * non c'entra: il dialogo dice «tutti gli atleti registrati», e deve essere
   * vero anche quando una casella e spuntata.
   *
   * Sotto la soglia risponde `visibili`: le righe che la griglia sta
   * mostrando con i suoi filtri, che sono gia tutto l'insieme.
   */
  const collectFilteredAthletes = async (
    visibili: Athlete[] = filteredAthletes,
  ): Promise<Athlete[]> => {
    if (!paginated || !listMeta) {
      return visibili;
    }

    const clubId = resolveCurrentClubId();
    if (!clubId) return visibili;

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
        ...buildAthleteRows(result.athletes, categories, siteIndex, {
          completo: catalogoCompleto,
          stagioni: clubSeasons,
          legacySeasonId,
        }),
      );

      if (!result.meta?.hasMore) break;
    }

    collected.sort(compareAthletesByLastName);
    return collected;
  };

  /**
   * Cio che l'export deve contenere: la selezione se c'e, altrimenti tutto
   * l'insieme filtrato.
   *
   * Con l'archivio paginato «tutto l'insieme filtrato» sono le pagine del
   * server — ma solo se la griglia non ha stretto ulteriormente nel browser
   * (un filtro di categoria o di certificato, che il server non conosce): in
   * quel caso l'insieme e esattamente cio che la griglia mostra.
   */
  const collectAthletesForExport = async (
    request: ExportRequest<Athlete>,
  ): Promise<Athlete[]> => {
    if (selectedRowIds.size) {
      return athletes.filter((athlete) =>
        selectedRowIds.has(athleteRowKey(athlete)),
      );
    }

    if (paginated && request.rows.length < filteredAthletes.length) {
      return request.rows;
    }

    return collectFilteredAthletes(request.rows);
  };

  const exportColumnsOf = (request: ExportRequest<Athlete>) =>
    request.columns.map((column) => ({
      key: column.id,
      label:
        column.label ?? (typeof column.header === "string" ? column.header : column.id),
      value: (athlete: Athlete) => {
        const raw = column.exportValue
          ? column.exportValue(athlete)
          : column.sortValue?.(athlete);
        return raw === null || raw === undefined ? "-" : String(raw);
      },
    }));

  const exportAthletesPdf = async (request: ExportRequest<Athlete>) => {
    const exportAthletes = await collectAthletesForExport(request);
    const columns = exportColumnsOf(request);

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
          columns.map((column) => [column.key, column.value(athlete)]),
        ),
      })),
      scopeLabel: selectedRowIds.size
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

  /**
   * Lo stesso elenco in CSV, con le stesse colonne e gli stessi valori.
   *
   * Passa da `collectAthletesForExport`, quindi vale anche qui la regola del
   * PDF: **una selezione attiva vince**, e con l'archivio paginato le pagine
   * restanti si chiedono al server. Il tracciato — separatore, CRLF, BOM —
   * appartiene a `src/lib/csv.ts`: qui non si serializza niente a mano.
   */
  const exportAthletesCsv = async (request: ExportRequest<Athlete>) => {
    const exportAthletes = await collectAthletesForExport(request);
    const columns = exportColumnsOf(request);

    if (!exportAthletes.length) {
      showToast("error", "Nessun atleta da esportare");
      return;
    }

    const rows = exportAthletes.map((athlete) =>
      Object.fromEntries(
        columns.map((column) => [column.key, column.value(athlete)]),
      ),
    );

    downloadCsv(csvFileName("Elenco Atleti"), toCsv(columns, rows));
    showToast("success", "CSV scaricato");
  };

  const handleExport = async (request: ExportRequest<Athlete>) => {
    if (request.kind === "pdf") {
      await exportAthletesPdf(request);
      return;
    }
    await exportAthletesCsv(request);
  };

  const getBulkActionLabel = (action: BulkActionType) => {
    if (action === "activate") {
      return "rendere attivi";
    }

    if (action === "deactivate") {
      return "disattivare";
    }

    if (action === "suspend") {
      return "sospendere";
    }

    if (action === "loan") {
      return "mettere in prestito";
    }

    return "eliminare";
  };

  /**
   * L'ambito di un'azione chiesta dalla barra di massa.
   *
   * «Seleziona tutti i N» della griglia seleziona **le righe caricate**. Sotto
   * la soglia sono gia tutto l'insieme filtrato. Sopra la soglia, quando la
   * selezione copre ogni riga caricata, «tutti» vuol dire tutto l'archivio
   * filtrato — e i bersagli si risolvono sulle pagine del server, come la V1
   * faceva con «Azioni su tutti». Una selezione piu stretta (un filtro di
   * categoria, una vista sul certificato) e esattamente cio che si e scelto.
   */
  const bulkScopeOf = (righe: Athlete[]): PendingBulkAction["scope"] =>
    paginated && righe.length > 0 && righe.length >= filteredAthletes.length
      ? "all"
      : "selected";

  /**
   * **Chi sara toccato, per davvero.**
   *
   * Per la selezione: gli identificativi scelti, resi distinti — la stessa
   * persona puo comparire in due righe se ha due tessere.
   *
   * Per «tutti»: **tutto l’insieme filtrato**, non la pagina. Si riusa la
   * stessa paginazione dell’export, che questo file ha gia scritto per la
   * stessa ragione — «esportare le duecento righe che ho in mano e
   * chiamarle gli atleti filtrati sarebbe una bugia in cima a un PDF». Su
   * un’azione di scrittura la bugia costa di piu: e un’operazione che non
   * tocca chi doveva toccare, e nessuno se ne accorge.
   */
  const risolviBersagliMassivi = async (
    scope: "selected" | "all",
    righe: Athlete[],
  ): Promise<string[]> => {
    if (scope === "selected") {
      return Array.from(new Set(righe.map((athlete) => athlete.id))).filter(
        Boolean,
      );
    }

    /*
      **`collectFilteredAthletes`, non `collectAthletesForExport`.**

      La seconda risponde alla domanda dell'export, e la sua prima riga e «se
      c'e una selezione, sono quelli»: chiamandola da qui, «tutti» con una
      casella spuntata toccherebbe **quella sola**, mentre la conferma dice
      «tutti gli atleti registrati».
    */
    const tutti = await collectFilteredAthletes();
    return Array.from(new Set(tutti.map((athlete) => athlete.id))).filter(
      Boolean,
    );
  };

  /**
   * Apre la conferma con i bersagli gia risolti: il numero che si legge e
   * l’insieme su cui si scrive.
   */
  const apriAzioneMassiva = async (
    azione: Omit<PendingBulkAction, "targetIds">,
    righe: Athlete[],
  ) => {
    /*
      **Se non si sa su chi si scrive, non si apre la conferma.**

      Risolvere «tutti» chiede le pagine restanti alla rete, e quella chiamata
      puo fallire. Aprire lo stesso il dialogo vorrebbe dire far confermare
      un'operazione su un insieme che nessuno ha potuto contare — che e la
      forma peggiore del difetto che questa correzione chiude, non la sua
      attenuazione.
    */
    let targetIds: string[] = [];
    try {
      targetIds = await risolviBersagliMassivi(azione.scope, righe);
    } catch (error) {
      console.error("Error resolving bulk athlete targets:", error);
      showToast(
        "error",
        "Non è stato possibile determinare gli atleti da aggiornare. Riprova.",
      );
      return;
    }

    if (!targetIds.length) {
      showToast("error", "Nessun atleta da aggiornare");
      return;
    }

    setPendingBulkAction({ ...azione, targetIds });
  };

  const getBulkActionTargetIds = () => pendingBulkAction?.targetIds ?? [];

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
      /*
        Il testo diceva solo «non può essere annullata». Non diceva che
        l'operazione puo riuscire **su una parte**: gli atleti con dati
        personali da smaltire non vengono eliminati, e gli altri si. Chi
        conferma deve saperlo prima, non scoprirlo dal riepilogo dopo.
      */
      return `Stai per eliminare ${athletesCount} ${athletesCount === 1 ? "atleta" : "atleti"} tra ${scopeLabel}. Questa azione non può essere annullata. Gli atleti che hanno file, consensi, richieste o consegne documentali non vengono eliminati: vanno trattati uno per uno dalla sezione «Dati personali» della loro scheda. Al termine viene detto quanti sono stati eliminati e quanti no. Vuoi continuare?`;
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

    setBulkRunning(true);
    try {
      await runWithLoader(
        pendingBulkAction.action === "delete"
          ? "Eliminazione atleti in corso, attendi il completamento..."
          : "Aggiornamento atleti in corso, attendi il completamento...",
        async () => {
          if (pendingBulkAction.action === "delete") {
            /*
              **Il ciclo si fermava al primo che non si poteva cancellare.**

              Era un `for` senza `try`: bastava un atleta con un consenso o una
              richiesta documentale — cioe quasi chiunque si sia iscritto
              online — perche l'errore uscisse dal ciclo, i successivi non
              venissero nemmeno tentati, e l'operatore leggesse «Errore durante
              l'esecuzione dell'operazione in blocco» su una cancellazione
              **gia parzialmente avvenuta**, senza sapere quali fossero spariti.

              Adesso ogni elemento e tentato per conto suo e l'esito e
              dichiarato per intero: quanti sono spariti, quanti no e perche.
              La cancellazione parziale resta possibile — e irreversibile per
              natura — ma smette di essere una sorpresa.
            */
            const eliminati: string[] = [];
            const falliti: Array<{ id: string; motivo: string }> = [];

            for (const athleteId of targetIds) {
              try {
                await deleteClubAthlete(clubId, athleteId);
                eliminati.push(athleteId);
              } catch (caught: any) {
                console.error("Error deleting athlete in bulk:", caught);
                falliti.push({
                  id: athleteId,
                  motivo: String(caught?.message || "").trim(),
                });
              }
            }

            if (eliminati.length) {
              showToast(
                "success",
                `${eliminati.length} ${eliminati.length === 1 ? "atleta eliminato" : "atleti eliminati"} con successo`,
              );
            }

            if (falliti.length) {
              /*
                Il motivo che ricorre e sempre lo stesso — i dati personali che
                non spariscono con l'anagrafica — e va detto una volta con la
                strada, non ripetuto per ogni riga.
              */
              const conDatiPersonali = falliti.filter((riga) =>
                eDatiPersonaliDaSmaltire(riga.motivo),
              );

              showToast(
                "error",
                conDatiPersonali.length
                  ? `${falliti.length} ${falliti.length === 1 ? "atleta non e stato eliminato" : "atleti non sono stati eliminati"}: ` +
                    `${conDatiPersonali.length} ${conDatiPersonali.length === 1 ? "ha" : "hanno"} dati personali ` +
                    "(file, consensi, richieste o consegne documentali) che cancellando l'anagrafica " +
                    "resterebbero in archivio slegati da tutto. Apri la scheda di ognuno e usa la " +
                    "sezione «Dati personali»: la cancellazione in blocco non la puo fare al posto tuo, " +
                    "perche per un minore serve una conferma esplicita su cio che verra distrutto."
                  : `${falliti.length} ${falliti.length === 1 ? "atleta non e stato eliminato" : "atleti non sono stati eliminati"}: ` +
                    (falliti[0]?.motivo || "operazione non riuscita"),
              );
            }
          } else {
            for (const athleteId of targetIds) {
              await updateClubAthlete(clubId, athleteId, {
                /*
                  W6-03. `pendingBulkAction.action` e il nome di un'azione
                  (`activate`), non uno stato (`active`). Scriverlo tale e
                  quale metteva in archivio un valore che nessun filtro
                  riconosce, e l'atleta spariva da tutti — "Attivi" compreso.
                */
                status:
                  ATHLETE_BULK_STATUS_ACTIONS[
                    pendingBulkAction.action as AthleteBulkStatusAction
                  ],
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
      setBulkRunning(false);
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
   * atleti a ogni render. Il risultato e un indice per chiave di gruppo, che
   * il DataGrid interroga quando disegna l'intestazione di ogni gruppo.
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
        count: number;
      }
    >();

    filteredAthletes.forEach((athlete) => {
      const id = athlete.groupId || UNCATEGORIZED_CATEGORY_ID;
      const bucket = buckets.get(id);

      if (bucket) {
        bucket.count += 1;
        return;
      }

      buckets.set(id, {
        id,
        categoryId: athlete.categoryId,
        categoryName: athlete.categoryLabel || "Senza categoria",
        siteId: athlete.siteId,
        siteName: athlete.siteName,
        count: 1,
      });
    });

    const groups = Array.from(buckets.values());

    /*
      **L'etichetta di un gruppo e una sola** (ADR-0185): qui si contava per
      `categoryId`, e due «Pulcini» con un gruppo ciascuna — due categorie,
      un gruppo l'una — si leggevano «Pulcini» e «Pulcini». La regola vive in
      `labelCategoryGroupOptions`, la stessa del selettore dei gruppi e del
      programma settimanale.
    */
    const etichettaDelGruppo = labelCategoryGroupOptions(groups);

    const index = new Map<
      string,
      (typeof groups)[number] & { label: string; color: string | null }
    >();

    groups.forEach((group) => {
      const category = categories.find((item) => item.id === group.categoryId);

      index.set(group.id, {
        ...group,
        color: category?.color ?? null,
        label: etichettaDelGruppo(group),
      });
    });

    return index;
  }, [categories, filteredAthletes]);

  /* ── La configurazione della griglia ──────────────────────────────────── */
  const columns = useMemo(
    () =>
      buildAthleteColumns({
        clubId: resolvedClubId,
        onOpen: (athlete) =>
          router.push(buildAthleteProfileHref(athlete.id, resolvedClubId)),
        categoryLabel: (athlete) =>
          athlete.categoryId
            ? categoryDisplay.label({
                categoryId: athlete.categoryId,
                categoryName: athlete.categoryLabel,
              })
            : athlete.categoryLabel,
      }),
    [categoryDisplay, resolvedClubId, router],
  );

  const filters = useMemo(
    () =>
      buildAthleteFilters({
        includeStatus: !paginated,
        /*
          Le stesse etichette del cassetto «Cambia categoria» (N3): su un club
          con due «Under 15» la sede fa parte del nome.
        */
        categoryOptions: categories.map((category) => ({
          value: category.id,
          label: categoryDisplay.label(category.id),
        })),
      }),
    [categories, categoryDisplay, paginated],
  );

  const search = useMemo(
    () =>
      paginated
        ? undefined
        : {
            placeholder: "Cerca per nome o cognome",
            /*
              La chiave si normalizza a NFC come i nomi salvati: sotto la soglia
              di paginazione la ricerca la fa il browser, e senza questa riga il
              difetto di «Niccolo con l'accento» resterebbe aperto proprio sui
              club piccoli — quelli che non passano mai dalla ricerca del
              server. Vedi `buildSearchFilter` in `src/lib/server/resources.ts`.
            */
            match: (athlete: Athlete, searchQuery: string) => {
              const normalizedQuery = searchQuery.normalize("NFC").toLowerCase();
              return (
                athlete.name.toLowerCase().includes(normalizedQuery) ||
                athlete.categoryLabel.toLowerCase().includes(normalizedQuery) ||
                athlete.allCategoryLabels.some((label) =>
                  label.toLowerCase().includes(normalizedQuery),
                )
              );
            },
          },
    [paginated],
  );

  const groupBy = useMemo<GroupDef<Athlete>>(
    () => ({
      id: "gruppo",
      label: "Categoria",
      keyOf: (athlete) => athlete.groupId || UNCATEGORIZED_CATEGORY_ID,
      render: (key) => {
        const group = athleteGroups.get(key);
        const canReport =
          Boolean(group?.categoryId) && key !== UNCATEGORIZED_CATEGORY_ID;
        return {
          label: group?.label ?? "Senza categoria",
          dot: categoryDotColor(group?.color),
          action: canReport ? (
            <Button
              variant="text"
              size="xs"
              icon={<BarChart3 />}
              onClick={() =>
                router.push(
                  `/reports?report=categories&categoryId=${encodeURIComponent(group?.categoryId || "")}`,
                )
              }
            >
              Report
            </Button>
          ) : null,
        };
      },
      order: (left, right) => {
        const a = athleteGroups.get(left);
        const b = athleteGroups.get(right);
        return compareCategoryGroups(
          {
            categoryName: a?.categoryName || "",
            siteName: a?.siteName || "",
            siteId: a?.siteId || "",
          },
          {
            categoryName: b?.categoryName || "",
            siteName: b?.siteName || "",
            siteId: b?.siteId || "",
          },
        );
      },
    }),
    [athleteGroups, router],
  );

  /*
    Le azioni di riga e di massa sono chiusure sullo stato corrente e si
    ricostruiscono a ogni render: la griglia le usa solo per disegnare, non
    le mette in nessun `useMemo`. Memoizzarle qui vorrebbe dire far girare
    un'azione su un elenco che non e piu quello a schermo.
  */
  const rowActions: RowActionDef<Athlete>[] = [
      {
        id: "apri",
        label: "Apri scheda",
        primary: true,
        icon: <ArrowUpRight />,
        onClick: (athlete) =>
          router.push(buildAthleteProfileHref(athlete.id, resolvedClubId)),
      },
      {
        id: "sospendi",
        label: "Sospendi",
        icon: <UserX />,
        hidden: (athlete) => athlete.status !== "active",
        onClick: (athlete) => void updateAthleteStatus(athlete.id, "suspended"),
      },
      {
        id: "disattiva",
        label: "Disattiva",
        icon: <UserMinus />,
        hidden: (athlete) => athlete.status !== "active",
        onClick: (athlete) => void updateAthleteStatus(athlete.id, "inactive"),
      },
      {
        id: "attiva",
        label: "Attiva",
        icon: <UserCheck />,
        hidden: (athlete) => athlete.status === "active",
        onClick: (athlete) => void updateAthleteStatus(athlete.id, "active"),
      },
      {
        id: "elimina",
        label: "Elimina",
        tone: "danger",
        icon: <Trash2 />,
        onClick: (athlete) => deleteAthlete(athlete.id, athlete.name),
      },
  ];

  const bulkActions: BulkActionDef<Athlete>[] = [
      {
        id: "attiva",
        label: "Attiva",
        icon: <UserCheck />,
        onRun: (righe) =>
          apriAzioneMassiva({ scope: bulkScopeOf(righe), action: "activate" }, righe),
      },
      {
        id: "sospendi",
        label: "Sospendi",
        icon: <UserX />,
        onRun: (righe) =>
          apriAzioneMassiva({ scope: bulkScopeOf(righe), action: "suspend" }, righe),
      },
      {
        id: "disattiva",
        label: "Disattiva",
        icon: <UserMinus />,
        onRun: (righe) =>
          apriAzioneMassiva({ scope: bulkScopeOf(righe), action: "deactivate" }, righe),
      },
      {
        id: "categoria",
        label: "Cambia categoria",
        icon: <CheckSquare />,
        /* Senza categorie non c'e dove spostare: l'azione e assente, non spenta. */
        hidden: !categories.length,
        onRun: (righe) => {
          setBulkCategoryRows(righe);
          setBulkCategoryTargetIds([]);
          setBulkCategoryResolving(true);
          setShowBulkCategoryDialog(true);
          void risolviBersagliMassivi(bulkScopeOf(righe), righe)
            .then((ids) => setBulkCategoryTargetIds(ids))
            .catch((error) => {
              console.error("Error resolving bulk athlete targets:", error);
              showToast("error", "Non è stato possibile determinare gli atleti da aggiornare. Riprova.");
              setShowBulkCategoryDialog(false);
            })
            .finally(() => setBulkCategoryResolving(false));
        },
      },
      {
        id: "elimina",
        label: "Elimina",
        tone: "danger",
        icon: <Trash2 />,
        onRun: (righe) =>
          apriAzioneMassiva({ scope: bulkScopeOf(righe), action: "delete" }, righe),
      },
  ];

  const bulkTargetCount = getBulkActionTargetIds().length;
  const archiveEmpty =
    !loading && !loadError && archiveTotal !== null && archiveTotal === 0 && athletes.length === 0;

  /*
    La banda d'archivio: compare solo sopra la soglia, dentro il pannello,
    sopra le bande della griglia. Porta lo stato e la ricerca che il server
    applica, e lo dice.
  */
  const archiveBand =
    paginated && listMeta ? (
      <div className="flex flex-col gap-3 border-b border-egw-hairline bg-egw-tint-blue px-4 py-3 lg:flex-row lg:items-center lg:gap-4">
        <div className="min-w-0 flex-1">
          <Eyebrow tone="blue">Archivio grande</Eyebrow>
          <p className="mt-1 text-[12px] leading-[1.45] text-egw-ink-72">
            {formatInteger(archiveTotal)} atleti in archivio: stato e ricerca passano dal
            server, {ATHLETE_PAGE_SIZE} righe per volta. Con «seleziona tutti» le azioni
            valgono per l&apos;intero archivio filtrato.
          </p>
        </div>
        <div
          role="group"
          aria-label="Filtra per stato"
          className="egw-scroll flex shrink-0 items-center overflow-x-auto"
        >
          <SegmentedControl<AthleteStatusFilter>
            aria-label="Stato"
            size="sm"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              ...ATHLETE_STATUSES.map((stato) => ({
                value: stato,
                label: ATHLETE_STATUS_PLURAL_LABELS[stato],
              })),
              { value: "all", label: "Tutti" },
            ]}
          />
        </div>
        <div className="flex h-8 min-w-[200px] items-center gap-2 rounded-egw-control border border-[rgba(11,26,58,.12)] bg-white px-2.5 focus-within:border-egw-blue focus-within:shadow-egw-focus lg:w-[260px]">
          <Search className="h-3.5 w-3.5 shrink-0 text-egw-ink-42" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Cerca per nome o cognome"
            aria-label="Cerca atleti"
            className="min-w-0 flex-1 bg-transparent text-[12px] font-medium text-egw-ink outline-none placeholder:font-normal placeholder:text-egw-ink-42"
          />
        </div>
      </div>
    ) : null;

  const newAthleteHref = buildNewAthleteHref(resolvedClubId || requestedClubId || activeClub?.id);

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Atleti" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader
              eyebrow="Persone"
              title="Atleti"
              description="Gestisci gli atleti tesserati del tuo club."
              stats={
                activeClub && !archiveEmpty ? (
                  paginated && listMeta ? (
                    <>
                      <HeaderStat value={formatInteger(archiveTotal)} label="tesserati" />
                      {/*
                        Sopra la soglia di paginazione i conteggi si ricavavano
                        da `athletes`, che e **la pagina caricata**: su un club
                        da 212 atleti tutti attivi la riga diceva «Atleti
                        Attivi: 200». Quando il server sta paginando, il numero
                        vero e quello che il server ha contato — ed e gia
                        filtrato per lo stato scelto, quindi ne basta uno.
                      */}
                      <HeaderStat
                        value={formatInteger(listMeta.total)}
                        label={STATUS_FILTER_HEADINGS[statusFilter]}
                        tone={statusFilter === "all" ? "ink" : STATUS_STAT_TONE[statusFilter]}
                      />
                    </>
                  ) : (
                    <>
                      <HeaderStat value={formatInteger(totaleAtletiDistinti)} label="tesserati" />
                      {ATHLETE_STATUSES.map((stato) => (
                        <HeaderStat
                          key={stato}
                          value={formatInteger(conteggiPerStato[stato])}
                          label={ATHLETE_STATUS_PLURAL_LABELS[stato]}
                          tone={STATUS_STAT_TONE[stato]}
                        />
                      ))}
                    </>
                  )
                ) : null
              }
              context={
                activeClub ? (
                  <>
                    <SiteContextControl
                      sites={sites}
                      value={siteFilter}
                      onChange={setSiteFilter}
                      id="athletes-site-filter"
                    />
                    {/*
                      Sede → Gruppo, oppure direttamente Gruppo. Con una sede
                      scelta questo elenco mostra solo le sue squadre; senza, le
                      mostra tutte con la sede nell'etichetta (RC Fix 2, punto 13).
                    */}
                    <GroupContextControl
                      groups={groupOptions}
                      value={groupFilter}
                      onChange={setGroupFilter}
                      id="athletes-group-filter"
                    />
                  </>
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
                        <MenuItem onSelect={() => setShowImportAthletesModal(true)}>
                          <Upload />
                          Importa atleti
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                    <Button
                      variant="primary"
                      trailingIcon={<ArrowRight />}
                      onClick={() => router.push(newAthleteHref)}
                    >
                      Nuovo atleta
                    </Button>
                  </>
                ) : null
              }
            >
              {/* Le due viste dell'area (ADR-0188): Atleti e In prova, una accanto all'altra. */}
              {activeClub ? (
                <AthletesViewSwitch
                  value="athletes"
                  clubId={resolvedClubId || requestedClubId || activeClub?.id || null}
                  role={activeClub?.role || null}
                  athletesCount={archiveTotal ?? totaleAtletiDistinti}
                />
              ) : null}
            </PageHeader>

            {!activeClub && !loading ? (
              <EmptyStateCard
                icon={<Users />}
                iconTone="red"
                title="Club non selezionato"
                description="Seleziona un club per visualizzare e gestire gli atleti"
                primary={
                  <Button variant="neutral" onClick={() => router.push("/dashboard")}>
                    Vai alla Dashboard
                  </Button>
                }
              />
            ) : archiveEmpty ? (
              /*
                Il modulo vuoto (pattern 8): un pannello solo, con la prima
                azione. Niente griglia con le intestazioni sopra il nulla.
              */
              <EmptyStateCard
                icon={<Users />}
                title="Nessun atleta in archivio"
                description="Inizia aggiungendo il primo atleta al tuo club, oppure importa un elenco da un file."
                primary={
                  <Button variant="neutral" onClick={() => router.push(newAthleteHref)}>
                    Aggiungi il primo atleta
                  </Button>
                }
                secondary={
                  <Button
                    variant="secondary"
                    icon={<Upload />}
                    onClick={() => setShowImportAthletesModal(true)}
                  >
                    Importa atleti
                  </Button>
                }
              />
            ) : (
              <>
                {/*
                  La chiave cambia con il ramo: la griglia sopra la soglia ha
                  viste e filtri diversi (lo stato sta nella banda), e un
                  rimontaggio e l'unico modo di non lasciarle in mano un filtro
                  che non esiste piu.
                */}
                <DataGrid<Athlete>
                  key={paginated ? "atleti-archivio" : "atleti"}
                  module="atleti"
                  aria-label="Elenco atleti"
                  rows={filteredAthletes}
                  getRowId={athleteRowKey}
                  rowLabel={(row) => getAthleteDisplayName(row)}
                  initialFilters={
                    categoryDeepLink
                      ? { [ATHLETE_CATEGORY_FILTER_ID]: [categoryDeepLink] }
                      : null
                  }
                  totalCount={paginated ? (listMeta?.total ?? archiveTotal ?? totaleAtletiDistinti) : totaleAtletiDistinti}
                  columns={columns}
                  filters={filters}
                  views={paginated ? ATHLETE_CERTIFICATE_VIEWS : ATHLETE_VIEWS}
                  /*
                    L'elenco si apre **sempre** su «Attivi» (ADR-0196). Sotto la
                    soglia e la vista predefinita e non si ricorda un «Tutti»
                    scelto in passato; sopra la soglia lo stato lo decide la
                    banda d'archivio e il chip senza filtri della griglia porta
                    il nome di quello stato, non «Tutti».
                  */
                  rememberView={false}
                  allViewLabel={
                    paginated && statusFilter !== "all" ? ATHLETE_STATUS_PLURAL_LABELS[statusFilter] : undefined
                  }
                  search={search}
                  groupBy={groupBy}
                  defaultGrouped
                  bulkActions={bulkActions}
                  rowActions={rowActions}
                  onOpenRow={(athlete) =>
                    router.push(buildAthleteProfileHref(athlete.id, resolvedClubId))
                  }
                  state={
                    loadError
                      ? "error"
                      : loading || pageLoading
                        ? "loading"
                        : "ready"
                  }
                  errorMessage={loadError}
                  onRetry={() => void refreshAthletesData()}
                  empty={
                    paginated
                      ? {
                          title:
                            statusFilter === "all"
                              ? "Nessun atleta corrisponde alla ricerca"
                              : `${STATUS_FILTER_HEADINGS[statusFilter]}: nessuno in elenco`,
                          description:
                            "Prova a cambiare il filtro di stato o la ricerca per vedere altri atleti.",
                          primary: (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setStatusFilter("all");
                                setSearchQuery("");
                              }}
                            >
                              Azzera stato e ricerca
                            </Button>
                          ),
                        }
                      : {
                          title: "Nessun atleta in elenco",
                          description:
                            "Con la sede o il gruppo scelti non c'è nessun atleta: prova a cambiare il contesto.",
                        }
                  }
                  export={{
                    onExport: handleExport,
                    kinds: ["csv", "pdf"],
                    onImport: () => setShowImportAthletesModal(true),
                  }}
                  noun={{ singular: "atleta", plural: "atleti", gender: "m" }}
                  selectedIds={selectedRowIds}
                  onSelectionChange={setSelectedRowIds}
                  banner={archiveBand}
                  serverTotal={paginated ? listMeta?.total : undefined}
                  defaultPageSize={50}
                />

                {/*
                  **L'elenco e continuo, e in fondo dice a che punto sta.**

                  Sopra la soglia la griglia ha in mano le porzioni gia lette;
                  qui c'e il sentinello che chiede la successiva quando si
                  arriva in fondo, il conteggio — quante righe si stanno
                  guardando su quante ce ne sono — e il pulsante, che e la
                  strada da tastiera e quella di chi non vuole aspettare lo
                  scorrimento.
                */}
                {paginated && listMeta ? (
                  <div className="flex flex-col items-center gap-3">
                    {/*
                      Un pixel di altezza e tutta la larghezza: un nodo **senza
                      area** non viene mai riferito come visibile, e
                      l'osservatore resterebbe muto per sempre (misurato: 0×0,
                      nessuno scatto).
                    */}
                    <div
                      ref={sentinelloElenco}
                      aria-hidden="true"
                      className="h-px w-full"
                    />
                    <p
                      className="egw-num font-brand text-[12px] text-egw-ink-62"
                      data-testid="elenco-atleti-avanzamento"
                      aria-live="polite"
                    >
                      {filteredAthletes.length} di {listMeta.total} atleti
                      {pageLoading ? " · caricamento…" : ""}
                    </p>
                    {listMeta.hasMore ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        data-testid="carica-altri-atleti"
                        loading={pageLoading}
                        onClick={caricaAltriAtleti}
                      >
                        {pageLoading ? "Caricamento…" : "Carica altri atleti"}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </DashboardPageContainer>
        </main>
      </div>

      {showImportAthletesModal ? (
        <AthleteImportDialog
          open={showImportAthletesModal}
          onOpenChange={setShowImportAthletesModal}
          targets={membershipTargetIndex}
          sites={sites.filter((site) => site.active !== false).map((site) => ({ id: site.id, name: site.name }))}
          existingAthletes={existingAthletesForImport}
          describeTarget={describeImportTarget}
          onImported={async (result) => {
            if (result.totals.created || result.totals.linked || result.totals.categoriesCreated) {
              await refreshAthletesData();
            }
          }}
        />
      ) : null}

      <BulkCategoryDrawer
        open={showBulkCategoryDialog}
        onOpenChange={setShowBulkCategoryDialog}
        index={membershipTargetIndex}
        athleteIds={bulkCategoryTargetIds.length ? bulkCategoryTargetIds : Array.from(new Set(bulkCategoryRows.map((athlete) => athlete.id)))}
        resolvingTargets={bulkCategoryResolving}
        onApplied={(report) => {
          const { updated, unchanged, blocked, failed, notAttempted } = report.totals;
          const nomi = (stato: string) =>
            report.athletes
              .filter((a) => a.status === stato && a.name)
              .slice(0, 5)
              .map((a) => a.name)
              .join(", ");
          if (failed || notAttempted) {
            const motivo = report.athletes.find((a) => a.error)?.error || "operazione non riuscita";
            showToast(
              "error",
              `Cambio di categoria interrotto: ${formatInteger(updated)} aggiornati, ${formatInteger(failed + notAttempted)} non aggiornati (${motivo})` +
                (nomi("failed") ? ` — ${nomi("failed")}` : ""),
            );
          } else if (blocked) {
            showToast(
              "warning",
              `${formatInteger(updated)} ${updated === 1 ? "atleta aggiornato" : "atleti aggiornati"}; ${formatInteger(blocked)} ${blocked === 1 ? "non toccato" : "non toccati"}: ${nomi("blocked")}` +
                (unchanged ? `; ${formatInteger(unchanged)} già a posto` : ""),
            );
          } else {
            showToast(
              "success",
              `${formatInteger(updated)} ${updated === 1 ? "atleta aggiornato" : "atleti aggiornati"} in ${report.target?.label || "categoria"}` +
                (unchanged ? `, ${formatInteger(unchanged)} già a posto` : "") +
                (blocked ? `, ${formatInteger(blocked)} da guardare` : ""),
            );
          }
          clearAthleteSelection();
          void refreshAthletesData();
        }}
      />

      {/*
        Conferma proporzionata (guideline 10 §10.5, regola 9): un cambio di
        stato o di categoria e notevole e reversibile → `ConfirmDialog`;
        un'eliminazione in blocco e distruttiva e ampia → `DangerConfirmDialog`,
        con la conferma scritta sopra i venti record.
      */}
      <ConfirmDialog
        open={Boolean(pendingBulkAction) && pendingBulkAction?.action !== "delete"}
        onOpenChange={(open) => {
          if (!open && !bulkRunning) setPendingBulkAction(null);
        }}
        onConfirm={runBulkAction}
        loading={bulkRunning}
        title="Conferma operazione in blocco"
        description={getBulkActionDescription()}
        confirmLabel="Sì, conferma"
        cancelLabel="No, annulla"
      />

      <DangerConfirmDialog
        open={pendingBulkAction?.action === "delete"}
        onOpenChange={(open) => {
          if (!open && !bulkRunning) setPendingBulkAction(null);
        }}
        onConfirm={runBulkAction}
        loading={bulkRunning}
        title={
          bulkTargetCount === 1
            ? "Eliminare questo atleta?"
            : `Eliminare ${formatInteger(bulkTargetCount)} atleti?`
        }
        description={getBulkActionDescription()}
        consequences={[
          "La scheda e le appartenenze alle categorie vengono rimosse.",
          "Le rate e i movimenti già registrati restano in contabilità.",
          "Chi ha file, consensi, richieste o consegne documentali non viene eliminato: si tratta dalla sezione «Dati personali» della sua scheda.",
        ]}
        confirmLabel={
          bulkTargetCount === 1
            ? "Elimina atleta"
            : `Elimina ${formatInteger(bulkTargetCount)} atleti`
        }
        typedConfirmation={bulkTargetCount > 20 ? "ELIMINA" : undefined}
      />

      <DangerConfirmDialog
        open={Boolean(pendingAthleteDeletion)}
        onOpenChange={(open) => {
          if (!open && !deletingAthlete) setPendingAthleteDeletion(null);
        }}
        onConfirm={() => void confirmAthleteDeletion()}
        loading={deletingAthlete}
        title="Eliminare questo atleta?"
        description={
          /*
            Prometteva che «i certificati medici collegati vengono rimossi».
            Da quando `assertPersonalDataDisposed` presidia `deleteResource`,
            un'anagrafica con anche un solo file, consenso, richiesta o
            deposito **non si cancella affatto**: la frase era falsa per quasi
            ogni atleta reale. Adesso dice cosa succede, e dove sta l'altra
            strada.
          */
          `Stai per eliminare ${pendingAthleteDeletion?.name ?? "questo atleta"}. L'operazione non si annulla.`
        }
        consequences={[
          "La scheda e le appartenenze alle categorie vengono rimosse.",
          "Le rate e i movimenti già registrati restano in contabilità.",
          "Se questa persona ha file, consensi, richieste o consegne documentali, l'eliminazione non parte: apri la sua scheda e usa la sezione «Dati personali».",
        ]}
        confirmLabel="Elimina atleta"
      />
    </div>
  );
}
