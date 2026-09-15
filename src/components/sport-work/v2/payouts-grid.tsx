"use client";

import * as React from "react";
import { ChevronRight, Receipt, RotateCcw } from "lucide-react";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, FilterDef, GridState, RowActionDef, ViewDef } from "@/components/web/datagrid/types";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { formatDateShort, formatMoney, joinMeta } from "@/lib/web/format";
import { exportGridCsv } from "@/lib/web/export-grid-csv";
import { OUTBOUND_TRANSACTION_TYPES, OUTBOUND_TRANSACTION_TYPE_LABELS } from "@/lib/sport-work/model";
import { FISCAL_TO_VERIFY_SPEC, PAYOUT_RECORDED_SPEC, PAYOUT_REVERSED_SPEC } from "@/components/sport-work/v2/sport-work-status";
import { transactionTypeLabel, type PayoutRow } from "@/components/sport-work/v2/sport-work-model";

/**
 * Il **registro in uscita**: la fonte canonica del denaro uscito, append-only.
 * Correggere significa stornare, e lo storno resta accanto all'originale —
 * per questo una riga stornata non sparisce: cambia pillola.
 *
 * La stessa griglia serve la scheda del rapporto (con «Storna», per chi ha
 * `sport_work.pay`) e la pagina «Compensi» (in sola lettura, come nella V1).
 */
export type PayoutGridRow = PayoutRow & { personName?: string };

const PAYOUT_VIEWS: ViewDef[] = [
  { id: "compensations", label: "Compensi", filters: { type: "COMPENSATION_PAYMENT" }, builtIn: true },
  { id: "reversed", label: "Stornate", filters: { reversed: true }, builtIn: true },
  { id: "to-verify", label: "Fiscale da verificare", filters: { fiscal: true }, builtIn: true, tone: "amber" },
];

export const payoutIsReversible = (row: PayoutRow) => !row.reversed_at && row.transaction_type === "COMPENSATION_PAYMENT";

export function PayoutsGrid({
  module,
  rows,
  state,
  errorMessage,
  onRetry,
  canPay,
  onReverse,
  onOpenRelationship,
  withPerson = false,
  compact = false,
}: {
  module: string;
  rows: PayoutGridRow[];
  state: GridState;
  errorMessage?: string | null;
  onRetry?: () => void;
  canPay: boolean;
  /** Assente = la griglia e in sola lettura (pagina «Compensi»). */
  onReverse?: (row: PayoutRow) => void;
  onOpenRelationship?: (relationshipId: string) => void;
  withPerson?: boolean;
  compact?: boolean;
}) {
  const columns = React.useMemo<ColumnDef<PayoutGridRow>[]>(
    () => [
      {
        id: "type",
        header: withPerson ? "Persona e movimento" : "Movimento",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => (
          <div className="min-w-0">
            <span className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink">{withPerson ? row.personName || "Persona" : transactionTypeLabel(row.transaction_type)}</span>
            <span className="egw-ellipsis block font-brand text-[10px] text-egw-ink-62">
              {joinMeta(withPerson ? transactionTypeLabel(row.transaction_type) : null, `anno fiscale ${row.fiscal_year}`, row.rules_version ? `regole ${row.rules_version}` : null, row.reversal_reason)}
            </span>
          </div>
        ),
        sortValue: (row) => (withPerson ? `${row.personName || ""} ${transactionTypeLabel(row.transaction_type)}` : transactionTypeLabel(row.transaction_type)).toLowerCase(),
        exportValue: (row) => (withPerson ? `${row.personName || ""} · ${transactionTypeLabel(row.transaction_type)}` : transactionTypeLabel(row.transaction_type)),
        title: (row) => joinMeta(row.personName, transactionTypeLabel(row.transaction_type), row.reversal_reason),
      },
      { id: "paidAt", header: "Pagato il", kind: "date", cell: (row) => formatDateShort(row.paid_at), sortValue: (row) => row.paid_at, exportValue: (row) => row.paid_at },
      {
        id: "status",
        header: "Stato",
        kind: "status",
        cell: (row) => <StatusPill status={row.reversed_at ? PAYOUT_REVERSED_SPEC : PAYOUT_RECORDED_SPEC} />,
        sortValue: (row) => (row.reversed_at ? 1 : 0),
        exportValue: (row) => (row.reversed_at ? "Stornata" : "Registrata"),
      },
      { id: "gross", header: "Lordo", kind: "amount", cell: (row) => formatMoney(row.gross_amount), sortValue: (row) => Number(row.gross_amount) || 0 },
      { id: "employee", header: "Contributi lavoratore", kind: "amount", cell: (row) => formatMoney(row.employee_contribution ?? 0), sortValue: (row) => Number(row.employee_contribution) || 0 },
      { id: "employer", header: "Contributi club", kind: "amount", cell: (row) => formatMoney(row.employer_contribution ?? 0), sortValue: (row) => Number(row.employer_contribution) || 0 },
      {
        id: "fiscal",
        header: "Fiscale",
        kind: "status",
        cell: (row) => (row.fiscal_treatment === "TO_VERIFY" ? <StatusPill status={FISCAL_TO_VERIFY_SPEC} size="sm" /> : null),
        sortValue: (row) => (row.fiscal_treatment === "TO_VERIFY" ? 1 : 0),
        exportValue: (row) => row.fiscal_treatment || "",
      },
      { id: "year", header: "Anno fiscale", kind: "number", hidden: true, align: "right", cell: (row) => String(row.fiscal_year), sortValue: (row) => row.fiscal_year },
      { id: "reference", header: "Riferimento", kind: "text", hidden: true, cell: (row) => row.reference, sortValue: (row) => row.reference || null },
    ],
    [withPerson],
  );

  const filters = React.useMemo<FilterDef<PayoutGridRow>[]>(
    () => [
      {
        id: "type",
        label: "Tipo di movimento",
        type: "select",
        pinned: true,
        options: OUTBOUND_TRANSACTION_TYPES.map((type) => ({ value: type, label: OUTBOUND_TRANSACTION_TYPE_LABELS[type], count: rows.filter((row) => row.transaction_type === type).length })),
        apply: (row, value) => (typeof value === "string" && value ? row.transaction_type === value : true),
      },
      { id: "reversed", label: "Stornate", type: "boolean", apply: (row, value) => (value === true ? Boolean(row.reversed_at) : true) },
      { id: "fiscal", label: "Fiscale da verificare", type: "boolean", apply: (row, value) => (value === true ? row.fiscal_treatment === "TO_VERIFY" : true) },
    ],
    [rows],
  );

  const rowActions = React.useMemo<RowActionDef<PayoutGridRow>[]>(
    () => [
      { id: "reverse", label: "Storna", icon: <RotateCcw />, primary: true, hidden: (row) => !canPay || !onReverse || !payoutIsReversible(row), onClick: (row) => onReverse?.(row) },
      { id: "open", label: "Apri il rapporto", icon: <ChevronRight />, hidden: (row) => !onOpenRelationship || !row.relationship_id, onClick: (row) => onOpenRelationship?.(String(row.relationship_id)) },
    ],
    [canPay, onReverse, onOpenRelationship],
  );

  const search = React.useMemo(
    () => ({
      placeholder: "Cerca per persona, riferimento o motivo",
      match: (row: PayoutGridRow, query: string) => {
        const q = query.trim().toLowerCase();
        return !q || `${row.personName || ""} ${row.reference || ""} ${row.reversal_reason || ""} ${transactionTypeLabel(row.transaction_type)}`.toLowerCase().includes(q);
      },
    }),
    [],
  );

  return (
    <DataGrid<PayoutGridRow>
      module={module}
      aria-label="Registro delle uscite"
      rows={rows}
      getRowId={(row) => String(row.id)}
      rowLabel={(row) => joinMeta(row.personName, transactionTypeLabel(row.transaction_type), formatDateShort(row.paid_at))}
      columns={columns}
      filters={compact ? undefined : filters}
      views={compact ? undefined : PAYOUT_VIEWS}
      search={compact ? undefined : search}
      defaultSort={{ columnId: "paidAt", direction: "desc" }}
      rowActions={rowActions}
      onOpenRow={onOpenRelationship ? (row) => row.relationship_id && onOpenRelationship(String(row.relationship_id)) : undefined}
      state={state}
      errorMessage={errorMessage}
      onRetry={onRetry}
      noun={{ singular: "uscita", plural: "uscite" }}
      canSelect={false}
      hideViews={compact}
      hideFooter={compact && rows.length <= 25}
      persist={!compact}
      export={compact ? undefined : { onExport: (request) => exportGridCsv(request, "Registro delle uscite"), kinds: ["csv"] }}
      empty={{ icon: <Receipt />, title: "Nessuna uscita registrata", description: "Le erogazioni e i pagamenti compaiono qui appena registrati." }}
    />
  );
}
