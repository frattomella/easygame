"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronRight, MapPin, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useToast } from "@/components/ui/toast-notification";
import { HeaderStat, PageHeader } from "@/components/web/page/PageHeader";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/web/primitives/Overlays";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { IdentityCell } from "@/components/web/primitives/Identity";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, FilterDef, RowActionDef, ViewDef } from "@/components/web/datagrid/types";
import { formatInteger, joinMeta, MISSING } from "@/lib/web/format";
import { normalizeStructure, type ClubStructure } from "@/lib/structures-utils";
import { filterStructuresBySite, isMultiSiteClub, normalizeClubSites, serializeClubSite, type ClubSite } from "@/lib/club-sites";
import { SiteContextControl } from "@/components/athletes/v2/athletes-context-controls";
import { StructureDrawer } from "@/components/structures/v2/structure-drawer";
import { SitesDrawer } from "@/components/structures/v2/sites-drawer";
import { DeleteStructureDialog } from "@/components/structures/v2/delete-structure-dialog";
import { useRouteClubId } from "@/components/web/hooks/use-route-club-id";
import {
  STRUCTURE_BOOKABILITY,
  STRUCTURE_VISIBILITY,
  describeStructureHours,
  structureAddressLine,
  structureDisplayName,
  structureSiteName,
  withClubId,
} from "@/components/structures/v2/structure-model";

/**
 * `/structures` — elenco delle strutture (Web V2, pattern 1: intestazione di
 * pagina + DataGrid a tutta larghezza).
 *
 * La griglia sostituisce le card della V1: cio che la card mostrava (nome,
 * indirizzo, visibilita, campi, prenotazioni, affittabile, tipo) sono
 * colonne. I dati e le scritture sono quelli della V1: `clubs.structures`
 * letto con `getClubStructures` e riscritto **intero** con
 * `saveClubStructures`; le sedi (ADR-0038) con `updateClubData("club_sites")`.
 * Il filtro sede e il controllo di contesto V2, montato solo per un club
 * multi-sede, con lo stesso contratto: vuoto = tutte.
 */
const VIEWS: ViewDef[] = [
  { id: "bookable", label: "Prenotabili dalle famiglie", filters: { bookable: "yes" }, builtIn: true },
  { id: "hidden", label: "Non visibili", filters: { visibility: "hidden" }, builtIn: true, tone: "amber" },
  { id: "rent", label: "In affitto", filters: { rentable: "yes" }, builtIn: true },
];

const YES_NO = [
  { value: "yes", label: "Sì" },
  { value: "no", label: "No" },
];

export default function StrutturePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { clubId, resolved } = useRouteClubId(null);

  const [structures, setStructures] = React.useState<ClubStructure[]>([]);
  const [sites, setSites] = React.useState<ClubSite[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [siteFilter, setSiteFilter] = React.useState("");
  const [drawer, setDrawer] = React.useState<{ structure: ClubStructure | null } | null>(null);
  const [sitesOpen, setSitesOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<ClubStructure | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  React.useEffect(() => {
    if (!resolved) return;
    if (!clubId) {
      setLoading(false);
      setStructures([]);
      setSites([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { getClubStructures, getClubData } = await import("@/lib/simplified-db");
        const [dbStructures, dbSites] = await Promise.all([getClubStructures(clubId), getClubData(clubId, "club_sites")]);
        if (cancelled) return;
        setStructures((dbStructures || []).map((item: unknown) => normalizeStructure(item)));
        setSites(normalizeClubSites(dbSites));
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setLoadError("Errore nel caricamento delle strutture");
        showToast("error", "Errore nel caricamento delle strutture");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [clubId, resolved, reloadKey, showToast]);

  const reload = () => setReloadKey((key) => key + 1);

  /* ── Scritture (le stesse della V1) ────────────────────────────────────── */
  const persist = async (next: ClubStructure[]) => {
    if (!clubId) return false;
    const { saveClubStructures } = await import("@/lib/simplified-db");
    const ok = await saveClubStructures(clubId, next);
    if (!ok) showToast("error", "Salvataggio strutture fallito");
    return ok;
  };

  const persistSites = async (next: ClubSite[]) => {
    if (!clubId) return;
    const { updateClubData } = await import("@/lib/simplified-db");
    const previous = sites;
    setSites(next);
    try {
      await updateClubData(clubId, "club_sites", next.map(serializeClubSite));
      showToast("success", "Sedi aggiornate");
    } catch {
      setSites(previous);
      showToast("error", "Salvataggio sedi fallito");
    }
  };

  const openDetail = (structure: ClubStructure) => router.push(withClubId(`/structures/${structure.id}`, clubId));

  const saveStructure = async (next: ClubStructure) => {
    const exists = structures.some((item) => item.id === next.id);
    const nextList = exists ? structures.map((item) => (item.id === next.id ? next : item)) : [...structures, next];
    const previous = structures;
    setStructures(nextList);
    const ok = await persist(nextList);
    if (!ok) {
      setStructures(previous);
      return false;
    }
    showToast("success", "Struttura salvata");
    setDrawer(null);
    // Come nella V1: dopo la creazione si apre la scheda appena creata.
    if (!exists) openDetail(next);
    return true;
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    const previous = structures;
    const next = structures.filter((item) => item.id !== deleting.id);
    setStructures(next);
    try {
      const ok = await persist(next);
      if (!ok) {
        setStructures(previous);
        return;
      }
      showToast("success", "Struttura eliminata");
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  /* ── Derivati ──────────────────────────────────────────────────────────── */
  const multiSite = isMultiSiteClub(sites);
  const rows = React.useMemo(() => filterStructuresBySite(structures, siteFilter), [structures, siteFilter]);
  const structureCountBySiteId = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const structure of structures) {
      const siteId = String(structure.siteId || "");
      if (siteId) counts[siteId] = (counts[siteId] || 0) + 1;
    }
    return counts;
  }, [structures]);
  const typesInUse = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const structure of structures) {
      const type = String(structure.type || "").trim();
      if (type && !seen.has(type.toLowerCase())) seen.set(type.toLowerCase(), type);
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
  }, [structures]);
  const fieldsCount = structures.reduce((total, structure) => total + structure.fields.length, 0);
  const bookableCount = structures.filter((structure) => structure.isVisibleToMembers && structure.isBookableByMembers).length;

  /* ── Griglia ───────────────────────────────────────────────────────────── */
  const columns = React.useMemo<ColumnDef<ClubStructure>[]>(() => {
    const base: ColumnDef<ClubStructure>[] = [
      {
        id: "identity",
        header: "Struttura",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => (
          <IdentityCell
            name={structureDisplayName(row)}
            href={withClubId(`/structures/${row.id}`, clubId)}
            onClick={() => openDetail(row)}
            meta={joinMeta(row.type, row.city) || undefined}
          />
        ),
        sortValue: (row) => structureDisplayName(row).toLowerCase(),
        exportValue: (row) => structureDisplayName(row),
        title: (row) => structureDisplayName(row),
      },
      {
        id: "type",
        header: "Tipologia",
        kind: "classification",
        cell: (row) => (String(row.type || "").trim() ? <DataChip size="sm" title={row.type}>{row.type}</DataChip> : null),
        sortValue: (row) => String(row.type || "").trim().toLowerCase() || null,
        exportValue: (row) => String(row.type || "").trim(),
      },
    ];
    if (multiSite) {
      base.push({
        id: "site",
        header: "Sede",
        kind: "classification",
        cell: (row) => {
          const name = structureSiteName(row, sites);
          return name ? (
            <DataChip size="sm" tone="blue" title={name}>
              {name}
            </DataChip>
          ) : (
            <DataChip size="sm">Tutte le sedi</DataChip>
          );
        },
        sortValue: (row) => structureSiteName(row, sites).toLowerCase() || null,
        exportValue: (row) => structureSiteName(row, sites),
      });
    }
    base.push(
      {
        id: "address",
        header: "Indirizzo",
        kind: "text",
        minWidth: 160,
        cell: (row) => structureAddressLine(row),
        sortValue: (row) => structureAddressLine(row).toLowerCase() || null,
        title: (row) => structureAddressLine(row) || undefined,
      },
      {
        id: "fields",
        header: "Campi",
        kind: "number",
        align: "right",
        cell: (row) => <span className="egw-num font-bold">{formatInteger(row.fields.length)}</span>,
        sortValue: (row) => row.fields.length,
        exportValue: (row) => row.fields.length,
      },
      {
        id: "hours",
        header: "Orari",
        kind: "text",
        minWidth: 180,
        cell: (row) => describeStructureHours(row) || MISSING,
        sortValue: (row) => describeStructureHours(row) || null,
        title: (row) => describeStructureHours(row) || "Nessuna fascia dichiarata: l'orario non è vincolato",
      },
      {
        id: "bookings",
        header: "Prenotazioni",
        kind: "number",
        align: "right",
        cell: (row) => <span className="egw-num">{formatInteger((row.bookings || []).length)}</span>,
        sortValue: (row) => (row.bookings || []).length,
        exportValue: (row) => (row.bookings || []).length,
      },
      {
        id: "visibility",
        header: "Visibilità",
        kind: "status",
        cell: (row) => <StatusPill size="sm" status={row.isVisibleToMembers ? STRUCTURE_VISIBILITY.visible : STRUCTURE_VISIBILITY.hidden} />,
        sortValue: (row) => (row.isVisibleToMembers ? "a" : "b"),
        exportValue: (row) => (row.isVisibleToMembers ? "Visibile ai tesserati" : "Non visibile ai tesserati"),
      },
      {
        id: "bookable",
        header: "Prenotabile",
        kind: "status",
        cell: (row) => <StatusPill size="sm" status={row.isBookableByMembers ? STRUCTURE_BOOKABILITY.bookable : STRUCTURE_BOOKABILITY.closed} />,
        sortValue: (row) => (row.isBookableByMembers ? "a" : "b"),
        exportValue: (row) => (row.isBookableByMembers ? "Sì" : "No"),
      },
      {
        id: "ownership",
        header: "Proprietà",
        kind: "classification",
        hidden: true,
        cell: (row) => <DataChip size="sm">{row.isPublic ? "Pubblica" : "Privata"}</DataChip>,
        sortValue: (row) => (row.isPublic ? "Pubblica" : "Privata"),
      },
      {
        id: "rentable",
        header: "Affittabile",
        kind: "text",
        hidden: true,
        cell: (row) => (row.isRentable ? "Sì" : "No"),
        sortValue: (row) => (row.isRentable ? "a" : "b"),
      },
      {
        id: "contact",
        header: "Referente",
        kind: "text",
        hidden: true,
        cell: (row) => joinMeta(row.contactName, row.contactPhone) || null,
        sortValue: (row) => String(row.contactName || "").trim().toLowerCase() || null,
        title: (row) => joinMeta(row.contactName, row.contactPhone, row.contactEmail) || undefined,
      },
    );
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, multiSite, sites]);

  const filters = React.useMemo<FilterDef<ClubStructure>[]>(() => {
    const list: FilterDef<ClubStructure>[] = [
      {
        id: "visibility",
        label: "Visibilità",
        type: "select",
        pinned: true,
        options: [
          { value: "visible", label: "Visibile ai tesserati" },
          { value: "hidden", label: "Non visibile" },
        ],
        apply: (row, value) => (typeof value === "string" && value ? (value === "visible") === row.isVisibleToMembers : true),
      },
      {
        id: "bookable",
        label: "Prenotabile dalle famiglie",
        type: "select",
        options: YES_NO,
        apply: (row, value) => (typeof value === "string" && value ? (value === "yes") === row.isBookableByMembers : true),
      },
      {
        id: "rentable",
        label: "Affittabile",
        type: "select",
        options: YES_NO,
        apply: (row, value) => (typeof value === "string" && value ? (value === "yes") === row.isRentable : true),
      },
      {
        id: "ownership",
        label: "Proprietà",
        type: "select",
        options: [
          { value: "Pubblica", label: "Pubblica" },
          { value: "Privata", label: "Privata" },
        ],
        apply: (row, value) => (typeof value === "string" && value ? (value === "Pubblica") === row.isPublic : true),
      },
    ];
    if (typesInUse.length) {
      list.splice(1, 0, {
        id: "type",
        label: "Tipologia",
        type: "select",
        options: typesInUse.map((type) => ({ value: type, label: type })),
        apply: (row, value) => (typeof value === "string" && value ? String(row.type || "").trim().toLowerCase() === value.toLowerCase() : true),
      });
    }
    return list;
  }, [typesInUse]);

  const rowActions = React.useMemo<RowActionDef<ClubStructure>[]>(
    () => [
      { id: "open", label: "Apri scheda", icon: <ChevronRight />, primary: true, onClick: (row) => openDetail(row) },
      { id: "edit", label: "Modifica", icon: <Pencil />, onClick: (row) => setDrawer({ structure: row }) },
      { id: "delete", label: "Elimina", icon: <Trash2 />, tone: "danger", onClick: (row) => setDeleting(row) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clubId],
  );

  const search = React.useMemo(
    () => ({
      placeholder: "Cerca per nome, indirizzo, città, tipologia",
      match: (row: ClubStructure, query: string) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return [row.name, row.address, row.city, row.type, row.contactName]
          .map((value) => String(value || "").toLowerCase())
          .some((value) => value.includes(q));
      },
    }),
    [],
  );

  const openCreate = () => setDrawer({ structure: null });
  const gridState = loading ? "loading" : loadError ? "error" : "ready";

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Strutture" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader
              eyebrow="Club"
              title="Strutture"
              description="Registra strutture, gestisci pagamenti e configura i campi."
              context={<SiteContextControl sites={sites} value={siteFilter} onChange={setSiteFilter} id="structures-site-filter" />}
              stats={
                <>
                  <HeaderStat value={formatInteger(structures.length)} label={structures.length === 1 ? "struttura" : "strutture"} />
                  <HeaderStat value={formatInteger(fieldsCount)} label={fieldsCount === 1 ? "campo" : "campi"} />
                  <HeaderStat value={formatInteger(bookableCount)} label="prenotabili" tone="green" />
                  {sites.length ? <HeaderStat value={formatInteger(sites.length)} label={sites.length === 1 ? "sede" : "sedi"} onClick={() => setSitesOpen(true)} /> : null}
                </>
              }
              actions={
                <>
                  <Menu>
                    <MenuTrigger asChild>
                      <IconButton aria-label="Altre azioni" variant="secondary" size="md">
                        <MoreHorizontal />
                      </IconButton>
                    </MenuTrigger>
                    <MenuContent align="end" width={240}>
                      <MenuItem onSelect={() => setSitesOpen(true)}>
                        <MapPin />
                        Gestisci sedi
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                  <Button variant="primary" icon={<Plus />} onClick={openCreate}>
                    Nuova struttura
                  </Button>
                </>
              }
            />

            {!loading && resolved && !clubId ? (
              <p className="font-brand text-[13px] text-egw-ink-62">Nessun club selezionato</p>
            ) : (
              <DataGrid<ClubStructure>
                module="strutture"
                aria-label="Elenco delle strutture"
                rows={rows}
                getRowId={(row) => String(row.id)}
                columns={columns}
                filters={filters}
                views={VIEWS}
                search={search}
                defaultSort={{ columnId: "identity", direction: "asc" }}
                rowActions={rowActions}
                rowLabel={(row) => structureDisplayName(row)}
                canSelect={false}
                onOpenRow={(row) => openDetail(row)}
                state={gridState}
                errorMessage={loadError}
                onRetry={reload}
                noun={{ singular: "struttura", plural: "strutture" }}
                empty={{
                  icon: <Building2 />,
                  title: "Nessuna struttura registrata",
                  description: "Registra il primo impianto del club: i campi, le fasce orarie e le tariffe si configurano nella scheda.",
                  primary: (
                    <Button variant="primary" size="sm" icon={<Plus />} onClick={openCreate}>
                      Nuova struttura
                    </Button>
                  ),
                }}
              />
            )}
          </DashboardPageContainer>
        </main>
      </div>

      <StructureDrawer
        open={Boolean(drawer)}
        section="all"
        structure={drawer?.structure ?? null}
        sites={sites}
        onClose={() => setDrawer(null)}
        onSave={saveStructure}
      />

      <SitesDrawer open={sitesOpen} onOpenChange={setSitesOpen} sites={sites} structureCountBySiteId={structureCountBySiteId} onChange={persistSites} />

      <DeleteStructureDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && !deleteBusy && setDeleting(null)}
        structure={deleting}
        clubId={clubId}
        onConfirm={confirmDelete}
        loading={deleteBusy}
      />
    </div>
  );
}
