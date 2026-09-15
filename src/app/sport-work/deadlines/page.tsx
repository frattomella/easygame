"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CalendarClock, ChevronRight, Wallet } from "lucide-react";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { StatusPill, DataChip } from "@/components/web/primitives/StatusPill";
import { KpiBar, KpiCard } from "@/components/web/page/Cards";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, ExportRequest, FilterDef, GroupDef, RowActionDef, ViewDef } from "@/components/web/datagrid/types";
import { formatDateShort, formatInteger, formatMoney, joinMeta } from "@/lib/web/format";
import { csvFileName, downloadCsv, toCsv } from "@/lib/csv";
import { SportWorkShell } from "@/components/sport-work/v2/sport-work-shell";
import { useSportWorkRole } from "@/components/sport-work/v2/use-sport-work-role";
import { PayoutDrawer } from "@/components/sport-work/v2/payout-drawer";
import { INSTALLMENT_STATUS_SPEC, OBLIGATION_STATUS_SPEC, specOf } from "@/components/sport-work/v2/sport-work-status";
import {
  buildDeadlineEntries,
  DEADLINE_BUCKETS,
  deadlineBucketLabel,
  dueLabel,
  relationshipHref,
  sumAmounts,
  type DeadlineBucket,
  type DeadlineEntry,
  type InstallmentRow,
  type ObligationRow,
  type RelationshipRow,
  type SportWorkPerson,
} from "@/components/sport-work/v2/sport-work-model";

/**
 * `/sport-work/deadlines` — cosa e in ritardo, cosa scade adesso, cosa
 * arriva (Web V2, pattern 10: numeri in testa, una griglia raggruppata).
 *
 * **Non e un filtro dell'elenco compensi.** Quello risponde a «cosa ho
 * pattuito»; questa pagina risponde a «cosa devo fare questa settimana», e
 * per questo mette insieme due cose che il dominio tiene separate — scadenze
 * di compenso e adempimenti — e le ordina per data. I tre cassetti della V1
 * (in ritardo · sette giorni · trenta giorni) sono i gruppi della griglia;
 * la V1 **taceva** le voci oltre i trenta giorni, qui sono un quarto gruppo
 * che la vista predefinita nasconde e la vista «Tutte» mostra.
 */
const DEADLINE_VIEWS: ViewDef[] = [
  { id: "month", label: "Entro trenta giorni", filters: { bucket: ["overdue", "week", "month"] }, builtIn: true, isDefault: true },
  { id: "overdue", label: "In ritardo", filters: { bucket: ["overdue"] }, builtIn: true, tone: "red" },
  { id: "installments", label: "Solo compensi", filters: { kind: "installment", bucket: ["overdue", "week", "month"] }, builtIn: true },
  { id: "obligations", label: "Solo adempimenti", filters: { kind: "obligation", bucket: ["overdue", "week", "month"] }, builtIn: true },
];

const exportCsv = (request: ExportRequest<DeadlineEntry>) => {
  const columns = request.columns.map((column) => ({ key: column.id, label: column.label || (typeof column.header === "string" ? column.header : column.id) }));
  const rows = request.rows.map((row) => Object.fromEntries(request.columns.map((column) => [column.id, column.exportValue?.(row) ?? column.sortValue?.(row) ?? ""])));
  downloadCsv(csvFileName("Scadenze del lavoro sportivo"), toCsv(columns, rows));
};

function DeadlinesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { canPay } = useSportWorkRole();
  const clubId = searchParams?.get("clubId") || null;
  const requestedView = searchParams?.get("view") || null;

  const [entries, setEntries] = React.useState<DeadlineEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [payoutTarget, setPayoutTarget] = React.useState<string | null>(null);
  const [requestedViewId, setRequestedViewId] = React.useState<string | null>(requestedView && DEADLINE_VIEWS.some((view) => view.id === requestedView) ? requestedView : null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const [installmentsResult, obligationsResult, peopleResult] = await Promise.all([
      apiRequest<InstallmentRow[]>("/api/v1/sport-work/installments"),
      apiRequest<ObligationRow[]>("/api/v1/sport-work/obligations?status=DUE"),
      apiRequest<SportWorkPerson[]>("/api/v1/sport-work/people"),
    ]);
    if (installmentsResult.error) {
      setLoading(false);
      const message = installmentsResult.error.message || "Errore nella lettura delle scadenze";
      setLoadError(message);
      showToast("error", message);
      return;
    }
    const relationshipsResult = await apiRequest<RelationshipRow[]>("/api/v1/sport-work/relationships");
    setLoading(false);
    setLoadError(null);
    setEntries(
      buildDeadlineEntries({
        installments: Array.isArray(installmentsResult.data) ? installmentsResult.data : [],
        obligations: Array.isArray(obligationsResult.data) ? obligationsResult.data : [],
        people: Array.isArray(peopleResult.data) ? peopleResult.data : [],
        relationships: Array.isArray(relationshipsResult.data) ? relationshipsResult.data : [],
      }),
    );
  }, [showToast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const overdue = entries.filter((entry) => entry.bucket === "overdue");
  const week = entries.filter((entry) => entry.bucket === "week");
  const month = entries.filter((entry) => entry.bucket === "month");

  const columns = React.useMemo<ColumnDef<DeadlineEntry>[]>(
    () => [
      {
        id: "title",
        header: "Voce",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => (
          <div className="min-w-0">
            <span className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink">{row.title}</span>
            <span className="egw-ellipsis block font-brand text-[10px] text-egw-ink-62">{joinMeta(row.subtitle, dueLabel(row.dueDate))}</span>
          </div>
        ),
        sortValue: (row) => `${row.title} ${row.subtitle}`.toLowerCase(),
        exportValue: (row) => `${row.title} · ${row.subtitle}`,
        title: (row) => `${row.title} · ${row.subtitle}`,
      },
      {
        id: "kind",
        header: "Tipo",
        kind: "classification",
        cell: (row) => <DataChip size="sm" tone={row.kind === "installment" ? "blue" : "neutral"}>{row.kind === "installment" ? "Compenso" : "Adempimento"}</DataChip>,
        sortValue: (row) => row.kind,
        exportValue: (row) => (row.kind === "installment" ? "Compenso" : "Adempimento"),
      },
      { id: "due", header: "Scadenza", kind: "date", cell: (row) => formatDateShort(row.dueDate), sortValue: (row) => row.dueDate, exportValue: (row) => row.dueDate },
      {
        id: "status",
        header: "Stato",
        kind: "status",
        cell: (row) => <StatusPill status={row.kind === "installment" ? specOf(INSTALLMENT_STATUS_SPEC, row.status) : specOf(OBLIGATION_STATUS_SPEC, row.status)} />,
        sortValue: (row) => row.status,
      },
      { id: "amount", header: "Importo", kind: "amount", cell: (row) => (row.amount === null ? null : formatMoney(row.amount)), sortValue: (row) => row.amount ?? null },
    ],
    [],
  );

  const filters = React.useMemo<FilterDef<DeadlineEntry>[]>(
    () => [
      {
        id: "bucket",
        label: "Quando",
        type: "multi",
        pinned: true,
        options: DEADLINE_BUCKETS.map((bucket) => ({ value: bucket.id, label: bucket.label, count: entries.filter((entry) => entry.bucket === bucket.id).length, tone: bucket.id === "overdue" ? "red" : bucket.id === "week" ? "amber" : "neutral" })),
        apply: (row, value) => (Array.isArray(value) && value.length ? value.includes(row.bucket) : typeof value === "string" && value ? row.bucket === value : true),
      },
      {
        id: "kind",
        label: "Tipo",
        type: "select",
        options: [
          { value: "installment", label: "Compensi", count: entries.filter((entry) => entry.kind === "installment").length },
          { value: "obligation", label: "Adempimenti", count: entries.filter((entry) => entry.kind === "obligation").length },
        ],
        apply: (row, value) => (typeof value === "string" && value ? row.kind === value : true),
      },
    ],
    [entries],
  );

  const groupBy = React.useMemo<GroupDef<DeadlineEntry>>(
    () => ({
      id: "bucket",
      label: "Quando",
      keyOf: (row) => row.bucket,
      render: (key, rows) => ({
        label: deadlineBucketLabel(key as DeadlineBucket),
        dot: key === "overdue" ? "var(--egw-red)" : key === "week" ? "var(--egw-amber)" : null,
        action: rows.some((row) => row.amount !== null) ? <span className="egw-num font-brand text-[11px] font-bold text-egw-ink-62">{formatMoney(sumAmounts(rows))}</span> : undefined,
      }),
      order: (a, b) => DEADLINE_BUCKETS.findIndex((bucket) => bucket.id === a) - DEADLINE_BUCKETS.findIndex((bucket) => bucket.id === b),
    }),
    [],
  );

  const rowActions = React.useMemo<RowActionDef<DeadlineEntry>[]>(
    () => [
      { id: "pay", label: "Eroga", icon: <Wallet />, primary: true, hidden: (row) => !canPay || !row.payable || !row.installmentId, onClick: (row) => setPayoutTarget(row.installmentId || null) },
      { id: "open", label: "Apri il rapporto", icon: <ChevronRight />, hidden: (row) => !row.relationshipId, onClick: (row) => router.push(relationshipHref(String(row.relationshipId), clubId)) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canPay, clubId],
  );

  const gridState = loading ? "loading" : loadError ? "error" : "ready";

  return (
    <SportWorkShell title="Scadenze" description="Cosa è in ritardo, cosa scade adesso, cosa arriva. Compensi e adempimenti insieme, ordinati per data.">
      <div className="flex flex-col gap-[18px]">
        <KpiBar>
          <KpiCard
            label="In ritardo"
            value={formatMoney(sumAmounts(overdue))}
            qualifier={`${formatInteger(overdue.length)} voci`}
            icon={<AlertTriangle />}
            iconTone={overdue.length > 0 ? "red" : "neutral"}
            onClick={() => setRequestedViewId("overdue")}
            loading={loading}
            ariaLabel={`${overdue.length} voci in ritardo`}
          />
          <KpiCard
            label="Entro sette giorni"
            value={formatMoney(sumAmounts(week))}
            qualifier={`${formatInteger(week.length)} voci`}
            icon={<CalendarClock />}
            iconTone={week.length > 0 ? "amber" : "neutral"}
            onClick={() => setRequestedViewId("month")}
            loading={loading}
          />
          <KpiCard label="Entro trenta giorni" value={formatInteger(month.length)} qualifier="Voci in arrivo" onClick={() => setRequestedViewId("month")} loading={loading} />
        </KpiBar>

        <DataGrid<DeadlineEntry>
          module="sport-work-deadlines"
          aria-label="Scadenze del lavoro sportivo"
          rows={entries}
          getRowId={(row) => row.id}
          rowLabel={(row) => `${row.title} · ${row.subtitle}`}
          columns={columns}
          filters={filters}
          views={DEADLINE_VIEWS}
          requestedViewId={requestedViewId}
          search={{ placeholder: "Cerca per persona o voce", match: (row, query) => `${row.title} ${row.subtitle}`.toLowerCase().includes(query.trim().toLowerCase()) }}
          defaultSort={{ columnId: "due", direction: "asc" }}
          groupBy={groupBy}
          defaultGrouped
          rowActions={rowActions}
          onOpenRow={(row) => row.relationshipId && router.push(relationshipHref(String(row.relationshipId), clubId))}
          state={gridState}
          errorMessage={loadError}
          onRetry={() => void load()}
          noun={{ singular: "voce", plural: "voci" }}
          canSelect={false}
          export={{ onExport: exportCsv, kinds: ["csv"] }}
          empty={{ icon: <CalendarClock />, title: "Niente in scadenza", description: "Nessuna rata residua e nessun adempimento dovuto: qui compaiono appena nascono." }}
        />
      </div>

      <PayoutDrawer open={Boolean(payoutTarget)} onOpenChange={(open) => !open && setPayoutTarget(null)} installmentId={payoutTarget} onDone={() => void load()} />
    </SportWorkShell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DeadlinesPage />
    </Suspense>
  );
}
