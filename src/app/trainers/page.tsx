"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  Pencil,
  Plus,
  Unlink2,
  UserCheck,
  UserX,
  Users,
  Trash2,
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { PageHeader, HeaderStat } from "@/components/web/page/PageHeader";
import { Button } from "@/components/web/primitives/Button";
import { IdentityCell } from "@/components/web/primitives/Identity";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { DataGrid, CellChips } from "@/components/web/datagrid/DataGrid";
import type {
  BulkActionDef,
  ColumnDef,
  ExportRequest,
  FilterDef,
  RowActionDef,
  ViewDef,
} from "@/components/web/datagrid/types";
import { Drawer } from "@/components/web/overlays/Drawer";
import {
  ConfirmDialog,
  DangerConfirmDialog,
} from "@/components/web/overlays/Modal";
import {
  Field,
  FieldSizeProvider,
  SearchableSelect,
} from "@/components/web/forms/Field";
import { formatDateShort, joinMeta, MISSING } from "@/lib/web/format";
import { PERSON_STATUS } from "@/lib/web/status";
import {
  buildCategoryGroups,
  compareCategoryGroups,
  getActiveCategoryGroups,
  labelCategoryGroupOptions,
  normalizeClubSites,
  type CategoryGroup,
  type ClubSite,
} from "@/lib/club-sites";
import { buildCategoryDisplayIndex } from "@/lib/categories/display";
import { getTrainerCategoryIds, getTrainerGroupIds } from "@/lib/trainer-utils";
import { supabase } from "@/lib/supabase";
import { apiRequest } from "@/lib/api/client";
import { deleteClubTrainer, getClubTrainers } from "@/lib/simplified-db";
import { sortPeopleByLastName } from "@/lib/athlete-name-utils";
import { exportPeopleCsv, exportPeoplePdf } from "@/lib/person-export";
import type { SelectionScope } from "@/lib/list-selection";
import {
  TRAINER_ACCESS_FILTER_OPTIONS,
  resolveTrainerAccess,
  trainerAccessFilterOf,
  trainerStatusSpec,
  type TrainerAccessFilter,
  type TrainerAccessMeta,
} from "@/components/trainer/v2/trainer-record-model";

/**
 * L'elenco Allenatori nel Web V2 (pattern 1, guideline 09 §9.1): intestazione
 * di pagina con i contatori, una sola azione primaria, e il DataGrid del
 * sistema con viste, filtri, colonne, esportazione e azioni di riga e di
 * massa. I dati e le scritture sono quelli della V1: `getClubTrainers`,
 * `updateClubDataItem` con ripiego su `staff_members`, `deleteClubTrainer`.
 */
interface Trainer {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone: string;
  categories: { id: string; name: string }[];
  /** I gruppi operativi dichiarati: e cio che scrive l'assegnazione di massa. */
  groupIds?: string[];
  salary: string;
  avatar?: string;
  status?: string;
}

type TrainerRow = Trainer & {
  access: TrainerAccessMeta;
  accessFilter: TrainerAccessFilter;
  startDate: string;
  assignmentLabels: string[];
  siteIds: string[];
};

type AssignTarget = { id: string; name: string };

const trainerHref = (
  trainerId: string,
  clubId: string | null,
  area?: string,
) => {
  const params = new URLSearchParams();
  if (clubId) params.set("clubId", clubId);
  if (area) params.set("area", area);
  const query = params.toString();
  return `/trainers/${trainerId}${query ? `?${query}` : ""}`;
};

export default function TrainersPage() {
  const router = useRouter();
  const { activeClub } = useAuth();
  const { showToast } = useToast();
  const [trainers, setTrainers] = React.useState<Trainer[]>([]);
  const [rawRecords, setRawRecords] = React.useState<Map<string, any>>(
    new Map(),
  );
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [clubId, setClubId] = React.useState<string | null>(null);
  /**
   * Categorie, sedi e gruppi operativi del club.
   *
   * Servono all'assegnazione di massa: assegnare per categoria su un club
   * multi-sede vorrebbe dire mettere l'allenatore su **tutte** le squadre di
   * quella categoria, Roma e Aprilia insieme. Su un club con una sede sola i
   * gruppi non esistono e la categoria e l'unica cosa da assegnare
   * (ADR-0038, ADR-0055).
   */
  const [categories, setCategories] = React.useState<
    { id: string; name: string }[]
  >([]);
  const [sites, setSites] = React.useState<ClubSite[]>([]);
  const [categoryGroups, setCategoryGroups] = React.useState<CategoryGroup[]>(
    [],
  );
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  const [deleteTarget, setDeleteTarget] = React.useState<TrainerRow | null>(
    null,
  );
  const [deleting, setDeleting] = React.useState(false);
  const [suspendTarget, setSuspendTarget] = React.useState<TrainerRow | null>(
    null,
  );
  const [unlinkTarget, setUnlinkTarget] = React.useState<TrainerRow | null>(
    null,
  );
  const [rowBusy, setRowBusy] = React.useState(false);
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [assignRows, setAssignRows] = React.useState<TrainerRow[]>([]);
  const [assignTargetId, setAssignTargetId] = React.useState<string | null>(
    null,
  );

  React.useEffect(() => {
    if (activeClub?.id) {
      setClubId(activeClub.id);
      return;
    }
    if (typeof window !== "undefined") {
      const storedClub = localStorage.getItem("activeClub");
      if (storedClub) {
        try {
          const parsed = JSON.parse(storedClub);
          if (parsed?.id) setClubId(parsed.id);
        } catch (e) {
          console.error("Error parsing activeClub from localStorage", e);
        }
      }
    }
  }, [activeClub]);

  const fetchData = React.useCallback(async () => {
    if (!clubId || clubId === "null" || clubId === "undefined") {
      setLoading(false);
      setTrainers([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [trainersData, clubResponse] = await Promise.all([
        getClubTrainers(clubId),
        supabase
          .from("clubs")
          .select(
            "categories, club_sites, category_groups, trainers, staff_members",
          )
          .eq("id", clubId)
          .maybeSingle(),
      ]);

      const nextTrainers = Array.isArray(trainersData) ? trainersData : [];
      setTrainers(nextTrainers);
      // Una selezione che tiene l'id di un allenatore sparito mostra un
      // conteggio che non corrisponde a niente.
      const known = new Set(nextTrainers.map((trainer) => String(trainer.id)));
      setSelectedIds((current) => new Set(Array.from(current).filter((id) => known.has(id))));

      const clubData = clubResponse?.data;
      const clubCategories = Array.isArray(clubData?.categories)
        ? clubData.categories
        : [];
      setCategories(clubCategories);
      const clubSites = normalizeClubSites(clubData?.club_sites);
      setSites(clubSites);
      setCategoryGroups(
        buildCategoryGroups({
          categories: clubCategories,
          sites: clubSites,
          groups: clubData?.category_groups,
        }),
      );
      /*
        Il record grezzo, per cio che la vista normalizzata non porta: lo
        stato dell'accesso EasyGame e la data di inizio. E la stessa lettura
        che fa la scheda (`trainers` + `staff_members` di `clubs`).
      */
      const raw = new Map<string, any>();
      for (const record of [
        ...(Array.isArray(clubData?.trainers) ? clubData.trainers : []),
        ...(Array.isArray(clubData?.staff_members)
          ? clubData.staff_members
          : []),
      ]) {
        if (record?.id && !raw.has(String(record.id)))
          raw.set(String(record.id), record);
      }
      setRawRecords(raw);
    } catch (error) {
      console.error("Error fetching data:", error);
      setLoadError("Errore nel caricamento degli allenatori");
      setTrainers([]);
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const reloadTrainers = React.useCallback(async () => {
    if (!clubId) return;
    // Si rilegge dal server invece di filtrare lo stato locale: e la lettura
    // a unire le tre origini dell'allenatore, e solo lei sa cosa resta.
    const trainersData = await getClubTrainers(clubId);
    const nextTrainers = Array.isArray(trainersData) ? trainersData : [];
    setTrainers(nextTrainers);
    const known = new Set(nextTrainers.map((trainer) => String(trainer.id)));
    setSelectedIds((current) => new Set(Array.from(current).filter((id) => known.has(id))));
  }, [clubId]);

  /* ── Derivazioni ─────────────────────────────────────────────────────── */
  /** Come si scrive una categoria nei filtri (ADR-0185): la sede solo dove serve. */
  const categoryDisplay = React.useMemo(
    () => buildCategoryDisplayIndex({ categories, groups: categoryGroups }),
    [categories, categoryGroups],
  );

  /**
   * Le squadre che un allenatore segue, come si leggono in tabella e nel PDF.
   *
   * I gruppi vincono sulle categorie quando ci sono, perche sono l'unita piu
   * precisa: dire «Pulcini» a chi segue solo Roma direbbe una cosa in piu di
   * quella vera (RC Fix 2, punto 9).
   */
  /*
    Gruppi e categorie si scrivono con le regole condivise (ADR-0185):
    `labelCategoryGroupOptions` per i gruppi — la sede quando il nome ne
    nomina due — e l'indice per le categorie, come nell'elenco atleti.
  */
  const etichettaGruppo = React.useMemo(
    () => labelCategoryGroupOptions(categoryGroups),
    [categoryGroups],
  );
  const trainerAssignmentLabels = React.useCallback(
    (trainer: Trainer): string[] => {
      const groupLabels = getTrainerGroupIds(trainer as any)
        .map((groupId) => categoryGroups.find((group) => String(group.id) === String(groupId)))
        .filter((group): group is CategoryGroup => Boolean(group))
        .map((group) => etichettaGruppo(group));
      if (groupLabels.length) return groupLabels;
      return (Array.isArray(trainer.categories) ? trainer.categories : [])
        .filter((category) => category?.id || category?.name)
        .map((category) =>
          categoryDisplay.label({ categoryId: String(category?.id || ""), categoryName: String(category?.name || "") }),
        );
    },
    [categoryDisplay, categoryGroups, etichettaGruppo],
  );

  const rows = React.useMemo<TrainerRow[]>(() => {
    const groupById = new Map(
      categoryGroups.map((group) => [String(group.id), group]),
    );
    return sortPeopleByLastName(trainers).map((trainer) => {
      const raw = rawRecords.get(String(trainer.id)) || {};
      const access = resolveTrainerAccess(raw);
      const declaredGroups = getTrainerGroupIds(trainer as any);
      const siteIds = declaredGroups.length
        ? declaredGroups
            .map((groupId) => groupById.get(groupId)?.siteId)
            .filter((siteId): siteId is string => Boolean(siteId))
        : categoryGroups
            .filter((group) =>
              trainer.categories.some(
                (category) => category.id === group.categoryId,
              ),
            )
            .map((group) => group.siteId)
            .filter(Boolean);
      return {
        ...trainer,
        access,
        accessFilter: trainerAccessFilterOf(access),
        startDate: String(raw.startDate || raw.hireDate || raw.hire_date || ""),
        assignmentLabels: trainerAssignmentLabels(trainer),
        siteIds: Array.from(new Set(siteIds)),
      };
    });
  }, [categoryGroups, rawRecords, trainerAssignmentLabels, trainers]);

  const counts = React.useMemo(
    () => ({
      total: trainers.length,
      active: trainers.filter((t) => (t.status || "active") === "active")
        .length,
      suspended: trainers.filter((t) => t.status === "suspended").length,
    }),
    [trainers],
  );

  /**
   * Cosa si puo assegnare: i gruppi dove esistono, le categorie altrimenti.
   * Un gruppo «implicito» e una categoria con un altro nome: offrirlo come
   * gruppo sarebbe una spunta in piu che dice la stessa cosa (ADR-0055).
   */
  const assignableGroups = React.useMemo(
    () =>
      getActiveCategoryGroups(categoryGroups)
        .filter((group) => !group.implicit)
        .slice()
        .sort(compareCategoryGroups),
    [categoryGroups],
  );
  const assignByGroup = assignableGroups.length > 0;
  const assignTargets: AssignTarget[] = assignByGroup
    ? assignableGroups.map((group) => ({ id: group.id, name: group.name }))
    : categories;

  /* ── Scritture ───────────────────────────────────────────────────────── */
  /**
   * Scrive la stessa modifica su ogni allenatore indicato, una riga per
   * volta: l'allenatore vive in due collezioni (`trainers` e, per i piu
   * vecchi, `staff_members`) e `updateClubDataItem` sa trovarlo in entrambe.
   * Chi fallisce viene contato e detto.
   */
  const applyToRows = async (
    targets: TrainerRow[],
    updatesFor: (trainer: TrainerRow) => Record<string, any>,
    successMessage: (count: number) => string,
  ) => {
    if (!clubId || bulkBusy || !targets.length) return;
    setBulkBusy(true);
    try {
      const { updateClubDataItem } = await import("@/lib/simplified-db");
      let failed = 0;
      for (const trainer of targets) {
        const updates = updatesFor(trainer);
        try {
          await updateClubDataItem(
            clubId,
            "trainers",
            String(trainer.id),
            updates,
          );
        } catch {
          try {
            await updateClubDataItem(
              clubId,
              "staff_members",
              String(trainer.id),
              updates,
            );
          } catch {
            failed += 1;
          }
        }
      }
      await reloadTrainers();
      if (failed) {
        showToast(
          "error",
          `${failed} allenatori su ${targets.length} non sono stati aggiornati`,
        );
        return;
      }
      showToast("success", successMessage(targets.length));
    } catch (error) {
      console.error("Error running bulk trainer action:", error);
      showToast("error", "Operazione non riuscita");
    } finally {
      setBulkBusy(false);
    }
  };

  const setRowsStatus = (
    targets: TrainerRow[],
    status: "active" | "suspended",
  ) =>
    applyToRows(
      targets,
      () => ({ status }),
      (count) =>
        count === 1
          ? `Allenatore ${status === "active" ? "attivato" : "sospeso"}`
          : `${count} allenatori ${status === "active" ? "attivati" : "sospesi"}`,
    );

  /**
   * Aggiunge un gruppo operativo (o una categoria) alla selezione.
   * **Si aggiunge, non si sostituisce**: rimpiazzare l'elenco toglierebbe in
   * silenzio a un allenatore le squadre che gia segue.
   */
  const assignToRows = async (targets: TrainerRow[], target: AssignTarget) => {
    if (assignByGroup) {
      await applyToRows(
        targets,
        (trainer) => ({
          groupIds: Array.from(
            new Set([...getTrainerGroupIds(trainer as any), target.id]),
          ),
        }),
        (count) => `${count} allenatori assegnati a ${target.name}`,
      );
      return;
    }
    await applyToRows(
      targets,
      (trainer) => ({
        categories: Array.from(
          new Set([
            ...getTrainerCategoryIds(trainer.categories, categories),
            target.id,
          ]),
        ),
      }),
      (count) => `${count} allenatori assegnati a ${target.name}`,
    );
  };

  const handleDelete = async () => {
    if (!clubId || !deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const result = await deleteClubTrainer(clubId, String(deleteTarget.id));
      if (!result.removed) {
        showToast("error", "Allenatore non trovato tra i dati del club");
        return;
      }
      await reloadTrainers();
      showToast("success", "Allenatore eliminato");
      setDeleteTarget(null);
    } catch (error) {
      console.error("Error deleting trainer:", error);
      showToast("error", "Impossibile eliminare l'allenatore");
    } finally {
      setDeleting(false);
    }
  };

  /*
    **Scollega, non revoca** (ADR-0110): la stessa rotta dedicata della
    scheda, che slega l'utenza da questa sola scheda e non tocca la tessera.
  */
  const handleUnlink = async () => {
    if (!clubId || !unlinkTarget || rowBusy) return;
    setRowBusy(true);
    try {
      const risposta = await apiRequest(
        `/api/v1/trainer-accounts/${encodeURIComponent(String(unlinkTarget.id))}`,
        { method: "DELETE", headers: { "x-active-club-id": clubId } },
      );
      if (risposta.error) throw new Error(risposta.error.message);
      showToast("success", "Account scollegato dal profilo allenatore");
      setUnlinkTarget(null);
      await fetchData();
    } catch (error: any) {
      console.error("Error disconnecting trainer account:", error);
      showToast(
        "error",
        error?.message || "Errore nello scollegamento dell'account",
      );
    } finally {
      setRowBusy(false);
    }
  };

  /* ── Esportazione (stesso motore di Atleti/Staff/Soci) ───────────────── */
  const peopleForExport = (people: TrainerRow[]) =>
    people.map((trainer) => ({
      ...trainer,
      categories: trainer.assignmentLabels.map((name) => ({ id: name, name })),
    })) as unknown as Record<string, any>[];

  const runExport = (
    kind: "csv" | "pdf",
    scope: SelectionScope,
    people: TrainerRow[],
  ) => {
    const input = {
      entity: "trainers" as const,
      people: peopleForExport(people),
      clubName: activeClub?.name || "EasyGame",
      visibleColumns: null,
      scope,
    };
    if (kind === "pdf") {
      const result = exportPeoplePdf(input);
      if (!result.ok) {
        showToast(
          "error",
          result.reason === "empty"
            ? "Nessun elemento da esportare"
            : "Consenti i popup per generare il PDF",
        );
        return;
      }
      showToast("success", "PDF pronto: si apre la finestra di stampa");
      return;
    }
    const result = exportPeopleCsv(input);
    if (!result.ok) {
      showToast("error", "Nessun elemento da esportare");
      return;
    }
    showToast("success", "CSV scaricato");
  };

  const handleGridExport = (request: ExportRequest<TrainerRow>) => {
    if (request.kind === "xlsx") return;
    const requestScope = request.scope;
    const scope: SelectionScope =
      requestScope === "selected" ? "selected" : "filtered";
    runExport(request.kind, scope, request.rows);
  };

  /* ── Colonne ─────────────────────────────────────────────────────────── */
  const columns = React.useMemo<ColumnDef<TrainerRow>[]>(
    () => [
      {
        id: "trainer",
        header: "Allenatore",
        kind: "identity",
        locked: true,
        width: 2,
        minWidth: 220,
        cell: (row) => (
          <IdentityCell
            round
            avatarSrc={row.avatar}
            name={row.name}
            meta={row.email || undefined}
            href={trainerHref(String(row.id), clubId)}
            onClick={() => router.push(trainerHref(String(row.id), clubId))}
          />
        ),
        sortValue: (row) =>
          `${row.lastName || ""} ${row.firstName || row.name}`.trim(),
        exportValue: (row) => row.name,
        title: (row) => row.name,
      },
      {
        id: "categories",
        header: "Categorie",
        kind: "chips",
        width: 1.4,
        minWidth: 160,
        cell: (row) => (
          <CellChips
            items={row.assignmentLabels.map((label) => ({
              label,
              tone: "blue",
            }))}
          />
        ),
        sortValue: (row) => row.assignmentLabels.join(", "),
        title: (row) => row.assignmentLabels.join(", ") || undefined,
      },
      {
        id: "status",
        header: "Stato",
        kind: "status",
        width: 0.9,
        minWidth: 110,
        cell: (row) => <StatusPill status={trainerStatusSpec(row.status)} />,
        sortValue: (row) => (row.status === "suspended" ? 1 : 0),
        exportValue: (row) => trainerStatusSpec(row.status).label,
      },
      {
        id: "access",
        header: "Accesso EasyGame",
        label: "Accesso EasyGame",
        kind: "status",
        width: 1,
        minWidth: 130,
        cell: (row) => <StatusPill status={row.access.status} />,
        sortValue: (row) => row.accessFilter,
        exportValue: (row) => row.access.status.label,
      },
      {
        id: "email",
        header: "Email",
        kind: "text",
        width: 1.3,
        minWidth: 160,
        cell: (row) => (
          <span className="egw-ellipsis block">{row.email || MISSING}</span>
        ),
        sortValue: (row) => row.email,
        title: (row) => row.email || undefined,
      },
      {
        id: "phone",
        header: "Telefono",
        kind: "text",
        width: 0.9,
        minWidth: 120,
        cell: (row) => <span className="egw-num">{row.phone || MISSING}</span>,
        sortValue: (row) => row.phone,
      },
      {
        id: "startDate",
        header: "Data inizio",
        kind: "date",
        hidden: true,
        width: 0.9,
        minWidth: 110,
        cell: (row) => (
          <span className="egw-num">{formatDateShort(row.startDate)}</span>
        ),
        sortValue: (row) => row.startDate || null,
        exportValue: (row) => formatDateShort(row.startDate),
      },
    ],
    [clubId, router],
  );

  /* ── Viste e filtri ──────────────────────────────────────────────────── */
  const views = React.useMemo<ViewDef[]>(
    () => [
      {
        id: "active",
        label: "Attivi",
        filters: { status: "active" },
        isDefault: true,
      },
      {
        id: "suspended",
        label: "Sospesi",
        filters: { status: "suspended" },
        tone: "amber",
      },
    ],
    [],
  );

  const multiSite = sites.filter((site) => site.active !== false).length > 1;

  const filters = React.useMemo<FilterDef<TrainerRow>[]>(() => {
    const defs: FilterDef<TrainerRow>[] = [
      {
        id: "status",
        label: "Stato",
        type: "select",
        pinned: true,
        options: [
          { value: "active", label: "Attivo", tone: "green" },
          { value: "suspended", label: "Sospeso", tone: "amber" },
        ],
        apply: (row, value) => !value || (row.status || "active") === value,
      },
      {
        id: "category",
        label: "Categoria",
        type: "multi",
        pinned: true,
        options: categories.map((category) => ({
          value: category.id,
          label: categoryDisplay.label(category.id),
        })),
        apply: (row, value) => {
          const wanted = Array.isArray(value)
            ? value
            : value
              ? [String(value)]
              : [];
          if (!wanted.length) return true;
          return row.categories.some((category) =>
            wanted.includes(category.id),
          );
        },
      },
    ];
    if (multiSite) {
      defs.push({
        id: "site",
        label: "Sede",
        type: "multi",
        options: sites
          .filter((site) => site.active !== false)
          .map((site) => ({ value: site.id, label: site.name })),
        apply: (row, value) => {
          const wanted = Array.isArray(value)
            ? value
            : value
              ? [String(value)]
              : [];
          if (!wanted.length) return true;
          return row.siteIds.some((siteId) => wanted.includes(siteId));
        },
      });
    }
    defs.push({
      id: "access",
      label: "Accesso EasyGame",
      type: "multi",
      options: TRAINER_ACCESS_FILTER_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
      })),
      apply: (row, value) => {
        const wanted = Array.isArray(value)
          ? value
          : value
            ? [String(value)]
            : [];
        if (!wanted.length) return true;
        return wanted.includes(row.accessFilter);
      },
    });
    return defs;
  }, [categories, categoryDisplay, multiSite, sites]);

  /* ── Azioni di riga e di massa ───────────────────────────────────────── */
  const rowActions: RowActionDef<TrainerRow>[] = [
    {
      id: "open",
      label: "Apri scheda",
      icon: <ExternalLink />,
      primary: true,
      onClick: (row) => router.push(trainerHref(String(row.id), clubId)),
    },
    {
      id: "edit",
      label: "Modifica",
      icon: <Pencil />,
      onClick: (row) =>
        router.push(trainerHref(String(row.id), clubId, "profilo")),
    },
    {
      id: "suspend",
      label: "Sospendi",
      icon: <UserX />,
      hidden: (row) => row.status === "suspended",
      onClick: (row) => setSuspendTarget(row),
    },
    {
      id: "activate",
      label: "Attiva",
      icon: <UserCheck />,
      hidden: (row) => row.status !== "suspended",
      onClick: (row) => void setRowsStatus([row], "active"),
    },
    {
      id: "unlink",
      label: "Scollega accesso",
      icon: <Unlink2 />,
      hidden: (row) => row.accessFilter !== "linked",
      onClick: (row) => setUnlinkTarget(row),
    },
    {
      id: "delete",
      label: "Elimina",
      icon: <Trash2 />,
      tone: "danger",
      onClick: (row) => setDeleteTarget(row),
    },
  ];

  /*
    Le azioni di massa della V1, e nessuna eliminazione: cancellare dieci
    anagrafiche in un clic e l'operazione con il rapporto peggiore fra gesto e
    conseguenza.
  */
  const bulkActions = React.useMemo<BulkActionDef<TrainerRow>[]>(() => {
    return [
      {
        id: "activate",
        label: "Attiva",
        icon: <UserCheck />,
        disabled: () => bulkBusy,
        onRun: (selected) => setRowsStatus(selected, "active"),
      },
      {
        id: "suspend",
        label: "Sospendi",
        icon: <UserX />,
        disabled: () => bulkBusy,
        onRun: (selected) => setRowsStatus(selected, "suspended"),
      },
      {
        id: "assign",
        label: assignByGroup ? "Assegna a un gruppo" : "Assegna a una categoria",
        icon: <Users />,
        hidden: assignTargets.length === 0,
        disabled: () => bulkBusy,
        onRun: (selected) => {
          setAssignRows(selected);
          setAssignTargetId(null);
          setAssignOpen(true);
        },
      },
      {
        id: "export-pdf",
        label: "Esporta PDF",
        disabled: () => bulkBusy,
        onRun: (selected) => runExport("pdf", "selected", selected),
      },
      {
        id: "export-csv",
        label: "Esporta CSV",
        disabled: () => bulkBusy,
        onRun: (selected) => runExport("csv", "selected", selected),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignByGroup, assignTargets.length, bulkBusy, categories, clubId, reloadTrainers]);

  const newTrainerHref = clubId
    ? `/trainers/new?clubId=${clubId}`
    : "/trainers/new";

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Allenatori" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader
              eyebrow="Persone"
              title="Allenatori"
              description="Gestisci staff tecnico, categorie assegnate e stato operativo degli allenatori del club."
              stats={
                !loading ? (
                  <>
                    <HeaderStat value={counts.total} label="allenatori" />
                    <HeaderStat
                      value={counts.active}
                      label="attivi"
                      tone="green"
                    />
                    {counts.suspended ? (
                      <HeaderStat
                        value={counts.suspended}
                        label="sospesi"
                        tone="amber"
                      />
                    ) : null}
                  </>
                ) : null
              }
              actions={
                <Button
                  variant="primary"
                  icon={<Plus />}
                  onClick={() => router.push(newTrainerHref)}
                >
                  Nuovo allenatore
                </Button>
              }
            />

            <DataGrid<TrainerRow>
              module="allenatori"
              aria-label="Elenco allenatori"
              rows={rows}
              getRowId={(row) => String(row.id)}
              columns={columns}
              views={views}
              filters={filters}
              search={{
                placeholder: "Cerca allenatori",
                match: (row, query) =>
                  [
                    row.name,
                    row.email,
                    row.phone,
                    row.assignmentLabels.join(" "),
                    row.categories.map((c) => c.name).join(" "),
                  ]
                    .join(" ")
                    .toLowerCase()
                    .includes(query),
              }}
              defaultSort={{ columnId: "trainer", direction: "asc" }}
              noun={{ singular: "allenatore", plural: "allenatori" }}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              bulkActions={bulkActions}
              rowActions={rowActions}
              onOpenRow={(row) =>
                router.push(trainerHref(String(row.id), clubId))
              }
              state={loading ? "loading" : loadError ? "error" : "ready"}
              errorMessage={loadError}
              onRetry={() => void fetchData()}
              export={{ onExport: handleGridExport, kinds: ["csv", "pdf"] }}
              empty={{
                icon: <Users />,
                title: "Nessun allenatore in archivio",
                description:
                  "Aggiungi il primo allenatore e assegnagli le categorie che segue.",
                primary: (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Plus />}
                    onClick={() => router.push(newTrainerHref)}
                  >
                    Nuovo allenatore
                  </Button>
                ),
              }}
            />
          </DashboardPageContainer>
        </main>
      </div>

      <DangerConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={`Eliminare ${deleteTarget?.name ?? "questo allenatore"}?`}
        description="La scheda viene tolta dal club e non si recupera."
        consequences={[
          "Anagrafica, contatti, taglie e note",
          "Documenti caricati, visita medica e attestati",
          "Registro pagamenti e token di accesso EasyGame",
          "Inviti EasyGame in sospeso legati a questa scheda",
        ]}
        confirmLabel="Elimina"
        loading={deleting}
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={Boolean(suspendTarget)}
        onOpenChange={(open) => {
          if (!open) setSuspendTarget(null);
        }}
        title={`Sospendere ${suspendTarget?.name ?? "questo allenatore"}?`}
        description="L'allenatore resta in archivio ma non compare tra gli attivi. Potrai riattivarlo in qualsiasi momento."
        confirmLabel="Sospendi"
        loading={bulkBusy}
        onConfirm={async () => {
          if (!suspendTarget) return;
          await setRowsStatus([suspendTarget], "suspended");
          setSuspendTarget(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(unlinkTarget)}
        onOpenChange={(open) => {
          if (!open) setUnlinkTarget(null);
        }}
        title="Scollegare questo account?"
        description="La scheda allenatore dimenticherà l'utenza collegata, ma il suo accesso al club non viene toccato: per revocarlo usa la Gestione accessi. Se servirà, potrai poi generare un nuovo token dalla scheda."
        confirmLabel="Conferma scollegamento"
        tone="danger"
        loading={rowBusy}
        onConfirm={handleUnlink}
      />

      <Drawer
        open={assignOpen}
        onOpenChange={setAssignOpen}
        width="default"
        eyebrow={`Azione su ${assignRows.length} ${assignRows.length === 1 ? "allenatore" : "allenatori"}`}
        title={
          assignByGroup ? "Assegna a un gruppo" : "Assegna a una categoria"
        }
        description={
          assignByGroup
            ? "Si aggiunge ai gruppi già seguiti: nessuna squadra viene tolta."
            : "Si aggiunge alle categorie già assegnate: nessuna categoria viene tolta."
        }
        footer={
          <>
            <Button
              variant="primary"
              loading={bulkBusy}
              disabled={!assignTargetId}
              onClick={async () => {
                const target = assignTargets.find(
                  (t) => t.id === assignTargetId,
                );
                if (!target) return;
                await assignToRows(assignRows, target);
                setAssignOpen(false);
              }}
            >
              Assegna
            </Button>
            <Button
              variant="secondary"
              onClick={() => setAssignOpen(false)}
              disabled={bulkBusy}
            >
              Annulla
            </Button>
          </>
        }
      >
        <FieldSizeProvider size="sm">
          <Field
            label={assignByGroup ? "Gruppo operativo" : "Categoria"}
            htmlFor="trainer-assign-target"
            required
          >
            <SearchableSelect
              id="trainer-assign-target"
              value={assignTargetId}
              onValueChange={setAssignTargetId}
              options={assignTargets.map((target) => ({
                value: target.id,
                label: target.name,
              }))}
              placeholder="Seleziona"
            />
          </Field>
          <InsetBlock className="mt-5">
            <p className="mb-2 font-brand text-[10px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-ink-42">
              Record interessati
            </p>
            <ul className="egw-scroll max-h-[240px] space-y-1.5 overflow-y-auto">
              {assignRows.map((row) => (
                <li
                  key={row.id}
                  className="font-brand text-[12.5px] text-egw-ink"
                >
                  <span className="font-semibold">{row.name}</span>
                  <span className="text-egw-ink-62">
                    {" "}
                    ·{" "}
                    {joinMeta(...row.assignmentLabels) ||
                      "nessuna assegnazione"}
                  </span>
                </li>
              ))}
            </ul>
          </InsetBlock>
        </FieldSizeProvider>
      </Drawer>
    </div>
  );
}
