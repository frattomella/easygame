"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Briefcase, ChevronRight, Plus } from "lucide-react";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { Button } from "@/components/web/primitives/Button";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { IdentityCell } from "@/components/web/primitives/Identity";
import { HeaderStat } from "@/components/web/page/PageHeader";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, ExportRequest, FilterDef, RowActionDef, ViewDef } from "@/components/web/datagrid/types";
import { daysUntil, formatDateShort, formatInteger, formatMoney, joinMeta } from "@/lib/web/format";
import { csvFileName, downloadCsv, toCsv } from "@/lib/csv";
import { RELATIONSHIP_STATUSES, RELATIONSHIP_STATUS_LABELS, RELATIONSHIP_TYPES, RELATIONSHIP_TYPE_LABELS, SPORT_WORK_ROLES, SPORT_WORK_ROLE_LABELS } from "@/lib/sport-work/model";
import { SportWorkShell } from "@/components/sport-work/v2/sport-work-shell";
import { useSportWorkRole } from "@/components/sport-work/v2/use-sport-work-role";
import { RelationshipDrawer } from "@/components/sport-work/v2/relationship-drawer";
import { RELATIONSHIP_STATUS_SPEC, specOf } from "@/components/sport-work/v2/sport-work-status";
import {
  personNameMap,
  relationshipHref,
  relationshipTypeLabel,
  roleLabel,
  type RelationshipRow,
  type SportWorkPerson,
} from "@/components/sport-work/v2/sport-work-model";

/**
 * `/sport-work/relationships` — i rapporti di lavoro sportivo (Web V2,
 * pattern 1: intestazione di pagina + DataGrid a tutta larghezza).
 *
 * La griglia unica sostituisce l'elenco di pulsanti-riga della V1: cio che
 * la riga mostrava — nome, ruolo, tipo, periodo, importo, stato — sono
 * colonne. La ricerca «per nome o ruolo» e il filtro di stato della V1
 * restano; a loro si aggiungono le viste del sistema. I dati e le scritture
 * sono gli stessi: `GET /api/v1/sport-work/relationships` + `/people`, e la
 * creazione dal cassetto.
 *
 * **Il pulsante «Nuovo rapporto» c'e solo per chi puo** (`sport_work.manage`):
 * la V1 lo mostrava a tutti e rispondeva 403.
 */
type GridRow = RelationshipRow & { personName: string; expiringSoon: boolean };

const EXPIRING_WITHIN_DAYS = 30;

const RELATIONSHIP_VIEWS: ViewDef[] = [
  { id: "active", label: "Attivi", filters: { status: "ACTIVE" }, builtIn: true },
  { id: "draft", label: "Bozze", filters: { status: "DRAFT" }, builtIn: true },
  { id: "expiring", label: "In scadenza", filters: { expiring: true }, builtIn: true, tone: "amber" },
  { id: "closed", label: "Scaduti e cessati", filters: { status: ["EXPIRED", "TERMINATED"] }, builtIn: true },
];

const exportGridCsv = (request: ExportRequest<GridRow>) => {
  const columns = request.columns.map((column) => ({ key: column.id, label: column.label || (typeof column.header === "string" ? column.header : column.id) }));
  const rows = request.rows.map((row) => Object.fromEntries(request.columns.map((column) => [column.id, column.exportValue?.(row) ?? column.sortValue?.(row) ?? ""])));
  downloadCsv(csvFileName("Rapporti di lavoro sportivo"), toCsv(columns, rows));
};

function RelationshipsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { canManage } = useSportWorkRole();
  const clubId = searchParams?.get("clubId") || null;
  const requestedView = searchParams?.get("view") || null;

  const [relationships, setRelationships] = React.useState<RelationshipRow[]>([]);
  const [people, setPeople] = React.useState<SportWorkPerson[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const [relationshipsResult, peopleResult] = await Promise.all([
      apiRequest<RelationshipRow[]>("/api/v1/sport-work/relationships"),
      apiRequest<SportWorkPerson[]>("/api/v1/sport-work/people"),
    ]);
    setLoading(false);
    if (relationshipsResult.error) {
      const message = relationshipsResult.error.message || "Errore nella lettura dei rapporti";
      setLoadError(message);
      showToast("error", message);
      return;
    }
    setLoadError(null);
    setRelationships(Array.isArray(relationshipsResult.data) ? relationshipsResult.data : []);
    setPeople(Array.isArray(peopleResult.data) ? peopleResult.data : []);
  }, [showToast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const rows = React.useMemo<GridRow[]>(() => {
    const names = personNameMap(people);
    return relationships.map((row) => {
      const days = daysUntil(row.end_date);
      return {
        ...row,
        personName: names.get(String(row.person_id)) || "Persona non trovata",
        expiringSoon: row.status === "ACTIVE" && days !== null && days >= 0 && days <= EXPIRING_WITHIN_DAYS,
      };
    });
  }, [relationships, people]);

  const columns = React.useMemo<ColumnDef<GridRow>[]>(
    () => [
      {
        id: "identity",
        header: "Persona",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => (
          <IdentityCell
            name={row.personName}
            round
            href={relationshipHref(row.id, clubId)}
            onClick={() => router.push(relationshipHref(row.id, clubId))}
            meta={joinMeta(roleLabel(row.role), relationshipTypeLabel(row.relationship_type))}
          />
        ),
        sortValue: (row) => row.personName.toLowerCase(),
        exportValue: (row) => row.personName,
        title: (row) => row.personName,
      },
      {
        id: "status",
        header: "Stato",
        kind: "status",
        cell: (row) => <StatusPill status={specOf(RELATIONSHIP_STATUS_SPEC, row.status)} />,
        sortValue: (row) => RELATIONSHIP_STATUSES.indexOf(row.status as any),
        exportValue: (row) => RELATIONSHIP_STATUS_LABELS[row.status as keyof typeof RELATIONSHIP_STATUS_LABELS] || row.status,
      },
      {
        id: "role",
        header: "Ruolo",
        kind: "classification",
        cell: (row) => <DataChip size="sm">{roleLabel(row.role)}</DataChip>,
        sortValue: (row) => roleLabel(row.role),
      },
      {
        id: "type",
        header: "Tipo di rapporto",
        kind: "classification",
        cell: (row) => relationshipTypeLabel(row.relationship_type),
        sortValue: (row) => relationshipTypeLabel(row.relationship_type),
      },
      { id: "start", header: "Inizio", kind: "date", cell: (row) => (row.start_date ? formatDateShort(row.start_date) : null), sortValue: (row) => row.start_date || null },
      { id: "end", header: "Fine", kind: "date", cell: (row) => (row.end_date ? formatDateShort(row.end_date) : null), sortValue: (row) => row.end_date || null },
      {
        id: "amount",
        header: "Importo pattuito",
        kind: "amount",
        cell: (row) => (row.contract_amount ? formatMoney(row.contract_amount) : null),
        sortValue: (row) => row.contract_amount ?? null,
      },
      { id: "hours", header: "Ore settimanali", kind: "number", hidden: true, align: "right", cell: (row) => (row.weekly_hours ? String(row.weekly_hours) : null), sortValue: (row) => row.weekly_hours ?? null },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clubId],
  );

  const filters = React.useMemo<FilterDef<GridRow>[]>(
    () => [
      {
        id: "status",
        label: "Stato",
        type: "multi",
        pinned: true,
        options: RELATIONSHIP_STATUSES.map((status) => ({ value: status, label: RELATIONSHIP_STATUS_LABELS[status], count: rows.filter((row) => row.status === status).length })),
        apply: (row, value) => {
          if (typeof value === "string") return value ? row.status === value : true;
          if (Array.isArray(value)) return value.length ? value.includes(row.status) : true;
          return true;
        },
      },
      {
        id: "type",
        label: "Tipo di rapporto",
        type: "select",
        options: RELATIONSHIP_TYPES.map((type) => ({ value: type, label: RELATIONSHIP_TYPE_LABELS[type], count: rows.filter((row) => row.relationship_type === type).length })),
        apply: (row, value) => (typeof value === "string" && value ? row.relationship_type === value : true),
      },
      {
        id: "role",
        label: "Ruolo",
        type: "select",
        options: SPORT_WORK_ROLES.map((role) => ({ value: role, label: SPORT_WORK_ROLE_LABELS[role], count: rows.filter((row) => row.role === role).length })),
        apply: (row, value) => (typeof value === "string" && value ? row.role === value : true),
      },
      {
        id: "expiring",
        label: "Contratto in scadenza (30 giorni)",
        type: "boolean",
        apply: (row, value) => (value === true ? row.expiringSoon : true),
      },
    ],
    [rows],
  );

  const rowActions = React.useMemo<RowActionDef<GridRow>[]>(
    () => [{ id: "open", label: "Apri scheda", icon: <ChevronRight />, primary: true, onClick: (row) => router.push(relationshipHref(row.id, clubId)) }],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clubId],
  );

  const search = React.useMemo(
    () => ({
      placeholder: "Cerca per nome o ruolo",
      match: (row: GridRow, query: string) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return `${row.personName} ${roleLabel(row.role)} ${relationshipTypeLabel(row.relationship_type)}`.toLowerCase().includes(q);
      },
    }),
    [],
  );

  const activeCount = rows.filter((row) => row.status === "ACTIVE").length;
  const draftCount = rows.filter((row) => row.status === "DRAFT").length;
  const expiringCount = rows.filter((row) => row.expiringSoon).length;
  const [requestedViewId, setRequestedViewId] = React.useState<string | null>(requestedView);
  const gridState = loading ? "loading" : loadError ? "error" : "ready";

  return (
    <SportWorkShell
      title="Rapporti"
      description="Chi lavora per la società, con quale tipo di rapporto e per quale periodo."
      stats={
        !loading && !loadError ? (
          <>
            <HeaderStat value={formatInteger(rows.length)} label={rows.length === 1 ? "rapporto" : "rapporti"} />
            <HeaderStat value={formatInteger(activeCount)} label="attivi" tone="green" onClick={() => setRequestedViewId("active")} />
            <HeaderStat value={formatInteger(draftCount)} label="in bozza" tone={draftCount ? "amber" : "ink"} onClick={() => setRequestedViewId("draft")} />
            <HeaderStat value={formatInteger(expiringCount)} label="in scadenza" tone={expiringCount ? "amber" : "ink"} onClick={() => setRequestedViewId("expiring")} />
          </>
        ) : null
      }
      actions={
        canManage ? (
          <Button variant="primary" icon={<Plus />} onClick={() => setDrawerOpen(true)}>
            Nuovo rapporto
          </Button>
        ) : null
      }
    >
      <DataGrid<GridRow>
        module="sport-work-relationships"
        aria-label="Rapporti di lavoro sportivo"
        rows={rows}
        getRowId={(row) => String(row.id)}
        rowLabel={(row) => row.personName}
        columns={columns}
        filters={filters}
        views={RELATIONSHIP_VIEWS}
        requestedViewId={requestedViewId}
        search={search}
        defaultSort={{ columnId: "start", direction: "desc" }}
        rowActions={rowActions}
        onOpenRow={(row) => router.push(relationshipHref(row.id, clubId))}
        state={gridState}
        errorMessage={loadError}
        onRetry={() => void load()}
        noun={{ singular: "rapporto", plural: "rapporti" }}
        canSelect={false}
        export={{ onExport: exportGridCsv, kinds: ["csv"] }}
        empty={{
          icon: <Briefcase />,
          title: "Nessun rapporto",
          description: "Il primo si crea con «Nuovo rapporto»: nasce in bozza e si attiva dalla sua scheda.",
          primary: canManage ? (
            <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setDrawerOpen(true)}>
              Nuovo rapporto
            </Button>
          ) : null,
        }}
      />

      <RelationshipDrawer open={drawerOpen} onOpenChange={setDrawerOpen} people={people} onCreated={(id) => router.push(relationshipHref(id, clubId))} />
    </SportWorkShell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RelationshipsPage />
    </Suspense>
  );
}
