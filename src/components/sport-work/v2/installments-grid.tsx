"use client";

import * as React from "react";
import { ChevronRight, Wallet } from "lucide-react";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, ExportRequest, FilterDef, GridState, RowActionDef, ViewDef } from "@/components/web/datagrid/types";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { formatDateShort, formatMoney, joinMeta } from "@/lib/web/format";
import { csvFileName, downloadCsv, toCsv } from "@/lib/csv";
import { INSTALLMENT_STATUSES, INSTALLMENT_STATUS_LABELS } from "@/lib/sport-work/model";
import { INSTALLMENT_STATUS_SPEC, specOf } from "@/components/sport-work/v2/sport-work-status";
import { dueLabel, type InstallmentRow } from "@/components/sport-work/v2/sport-work-model";

/**
 * La griglia delle **scadenze di compenso**, la stessa nella scheda del
 * rapporto e nella pagina «Compensi». Programmato, maturato ed erogato sono
 * tre numeri diversi: la riga li mostra tutti e tre, piu il residuo.
 *
 * «Eroga» compare solo per chi ha `sport_work.pay`, e solo su una scadenza
 * con residuo e non annullata — la stessa condizione della V1.
 */
export type InstallmentGridRow = InstallmentRow & { personName?: string };

const INSTALLMENT_VIEWS: ViewDef[] = [
  { id: "open", label: "Da erogare", filters: { open: true }, builtIn: true },
  { id: "overdue", label: "Scadute", filters: { status: "OVERDUE" }, builtIn: true, tone: "red" },
  { id: "paid", label: "Erogate", filters: { status: "PAID" }, builtIn: true },
];

export const exportInstallmentsCsv = (request: ExportRequest<InstallmentGridRow>, name = "Scadenze compenso") => {
  const columns = request.columns.map((column) => ({ key: column.id, label: column.label || (typeof column.header === "string" ? column.header : column.id) }));
  const rows = request.rows.map((row) => Object.fromEntries(request.columns.map((column) => [column.id, column.exportValue?.(row) ?? column.sortValue?.(row) ?? ""])));
  downloadCsv(csvFileName(name), toCsv(columns, rows));
};

export const installmentIsPayable = (row: InstallmentRow) => Number(row.remaining_amount) > 0 && !row.cancelled;

export function InstallmentsGrid({
  module,
  rows,
  state,
  errorMessage,
  onRetry,
  canPay,
  onPay,
  onOpenRelationship,
  withPerson = false,
  compact = false,
  emptyTitle = "Nessuna scadenza",
  emptyDescription = "Nascono dal piano compensi di un rapporto.",
}: {
  module: string;
  rows: InstallmentGridRow[];
  state: GridState;
  errorMessage?: string | null;
  onRetry?: () => void;
  canPay: boolean;
  onPay: (installmentId: string) => void;
  /** Nella pagina «Compensi» la riga porta alla scheda del rapporto. */
  onOpenRelationship?: (relationshipId: string) => void;
  withPerson?: boolean;
  /** Dentro una scheda: senza viste, senza piede. */
  compact?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const columns = React.useMemo<ColumnDef<InstallmentGridRow>[]>(
    () => [
      {
        id: "label",
        header: withPerson ? "Persona e scadenza" : "Scadenza",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => (
          <div className="min-w-0">
            <span className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink">{withPerson ? row.personName || row.label : row.label}</span>
            <span className="egw-ellipsis block font-brand text-[10px] text-egw-ink-62">{joinMeta(withPerson ? row.label : null, dueLabel(row.due_date))}</span>
          </div>
        ),
        sortValue: (row) => (withPerson ? `${row.personName || ""} ${row.label}` : row.label).toLowerCase(),
        exportValue: (row) => (withPerson ? `${row.personName || ""} · ${row.label}` : row.label),
        title: (row) => (withPerson ? `${row.personName || ""} · ${row.label}` : row.label),
      },
      { id: "due", header: "Scadenza", kind: "date", cell: (row) => formatDateShort(row.due_date), sortValue: (row) => row.due_date, exportValue: (row) => row.due_date },
      {
        id: "status",
        header: "Stato",
        kind: "status",
        cell: (row) => <StatusPill status={specOf(INSTALLMENT_STATUS_SPEC, row.status)} />,
        sortValue: (row) => INSTALLMENT_STATUSES.indexOf(row.status as any),
        exportValue: (row) => INSTALLMENT_STATUS_LABELS[row.status as keyof typeof INSTALLMENT_STATUS_LABELS] || row.status,
      },
      { id: "gross", header: "Lordo programmato", kind: "amount", cell: (row) => formatMoney(row.gross_amount), sortValue: (row) => Number(row.gross_amount) || 0 },
      { id: "accrued", header: "Maturato", kind: "amount", cell: (row) => formatMoney(row.accrued_amount), sortValue: (row) => Number(row.accrued_amount) || 0 },
      { id: "paid", header: "Erogato", kind: "amount", cell: (row) => <span className="text-egw-green">{formatMoney(row.paid_amount)}</span>, sortValue: (row) => Number(row.paid_amount) || 0, exportValue: (row) => Number(row.paid_amount) || 0 },
      {
        id: "remaining",
        header: "Residuo",
        kind: "amount",
        cell: (row) => <span className={Number(row.remaining_amount) > 0 && row.status === "OVERDUE" ? "text-egw-red" : undefined}>{formatMoney(row.remaining_amount)}</span>,
        sortValue: (row) => Number(row.remaining_amount) || 0,
        exportValue: (row) => Number(row.remaining_amount) || 0,
      },
    ],
    [withPerson],
  );

  const filters = React.useMemo<FilterDef<InstallmentGridRow>[]>(
    () => [
      {
        id: "status",
        label: "Stato",
        type: "select",
        pinned: true,
        options: INSTALLMENT_STATUSES.map((status) => ({ value: status, label: INSTALLMENT_STATUS_LABELS[status], count: rows.filter((row) => row.status === status).length })),
        apply: (row, value) => (typeof value === "string" && value ? row.status === value : true),
      },
      { id: "open", label: "Con residuo da erogare", type: "boolean", apply: (row, value) => (value === true ? installmentIsPayable(row) : true) },
    ],
    [rows],
  );

  const rowActions = React.useMemo<RowActionDef<InstallmentGridRow>[]>(
    () => [
      { id: "pay", label: "Eroga", icon: <Wallet />, primary: true, hidden: (row) => !canPay || !installmentIsPayable(row), onClick: (row) => onPay(String(row.id)) },
      { id: "open", label: "Apri il rapporto", icon: <ChevronRight />, hidden: () => !onOpenRelationship, onClick: (row) => onOpenRelationship?.(String(row.relationship_id)) },
    ],
    [canPay, onPay, onOpenRelationship],
  );

  const search = React.useMemo(
    () => ({
      placeholder: withPerson ? "Cerca per persona o scadenza" : "Cerca una scadenza",
      match: (row: InstallmentGridRow, query: string) => {
        const q = query.trim().toLowerCase();
        return !q || `${row.personName || ""} ${row.label}`.toLowerCase().includes(q);
      },
    }),
    [withPerson],
  );

  return (
    <DataGrid<InstallmentGridRow>
      module={module}
      aria-label="Scadenze di compenso"
      rows={rows}
      getRowId={(row) => String(row.id)}
      rowLabel={(row) => (withPerson ? `${row.personName || ""} · ${row.label}` : row.label)}
      columns={columns}
      filters={compact ? undefined : filters}
      views={compact ? undefined : INSTALLMENT_VIEWS}
      search={compact ? undefined : search}
      defaultSort={{ columnId: "due", direction: "asc" }}
      rowActions={rowActions}
      onOpenRow={onOpenRelationship ? (row) => onOpenRelationship(String(row.relationship_id)) : undefined}
      state={state}
      errorMessage={errorMessage}
      onRetry={onRetry}
      noun={{ singular: "scadenza", plural: "scadenze" }}
      canSelect={false}
      hideViews={compact}
      hideFooter={compact && rows.length <= 25}
      persist={!compact}
      export={compact ? undefined : { onExport: (request) => exportInstallmentsCsv(request), kinds: ["csv"] }}
      empty={{ icon: <Wallet />, title: emptyTitle, description: emptyDescription }}
    />
  );
}
