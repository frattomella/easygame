"use client";

import * as React from "react";
import { Bell, CalendarDays, Check, FileHeart, Settings, UserPlus } from "lucide-react";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { BulkActionDef, ColumnDef, FilterDef, RowActionDef, ViewDef } from "@/components/web/datagrid/types";
import { DataChip, IconChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { formatDateTime, MISSING } from "@/lib/web/format";
import {
  NOTIFICATION_TYPE_LABELS,
  notificationStatusSpec,
  notificationTypeLabel,
  type NotificationRow,
} from "@/components/notifications/v2/notification-data";

/**
 * La griglia delle notifiche (Web V2): le cinque tab della V1 sono viste,
 * la ricerca e quella in griglia, «segna come letta» e l'azione di riga.
 *
 * Le icone per tipo sono le stesse del cassetto del guscio, cosi una
 * notifica ha lo stesso aspetto in entrambi i posti.
 */
const iconFor = (type: string): { icon: React.ReactNode; tone: "red" | "blue" | "green" | "neutral" } => {
  switch (type) {
    case "certificate":
      return { icon: <FileHeart />, tone: "red" };
    case "training":
      return { icon: <CalendarDays />, tone: "blue" };
    case "registration":
      return { icon: <UserPlus />, tone: "green" };
    case "system":
      return { icon: <Settings />, tone: "neutral" };
    default:
      return { icon: <Bell />, tone: "blue" };
  }
};

export const NOTIFICATION_VIEWS: ViewDef[] = [
  { id: "unread", label: "Non lette", filters: { read: "unread" }, builtIn: true, tone: "amber" },
  { id: "certificate", label: "Certificati", filters: { type: "certificate" }, builtIn: true },
  { id: "training", label: "Allenamenti", filters: { type: "training" }, builtIn: true },
  { id: "registration", label: "Registrazioni", filters: { type: "registration" }, builtIn: true },
];

const COLUMNS: ColumnDef<NotificationRow>[] = [
  {
    id: "notification",
    header: "Notifica",
    kind: "identity",
    locked: true,
    width: 2.4,
    cell: (row) => {
      const { icon, tone } = iconFor(row.type);
      return (
        <span className="flex min-w-0 items-center gap-2.5">
          <IconChip tone={tone} size={32} className="[&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </IconChip>
          <span className="min-w-0">
            <span className={`egw-ellipsis block font-brand text-[12.5px] ${row.read ? "font-medium text-egw-ink-72" : "font-semibold text-egw-ink"}`}>{row.title}</span>
            <span className="egw-ellipsis block font-brand text-[10px] text-[rgba(11,26,58,.5)]">{row.message || MISSING}</span>
          </span>
        </span>
      );
    },
    sortValue: (row) => row.title.toLowerCase(),
    exportValue: (row) => row.title,
    title: (row) => (row.message ? `${row.title} — ${row.message}` : row.title),
  },
  {
    id: "type",
    header: "Tipo",
    kind: "classification",
    width: 0.9,
    cell: (row) => <DataChip size="sm">{notificationTypeLabel(row.type)}</DataChip>,
    sortValue: (row) => notificationTypeLabel(row.type),
    exportValue: (row) => notificationTypeLabel(row.type),
  },
  {
    id: "status",
    header: "Stato",
    kind: "status",
    width: 0.9,
    cell: (row) => <StatusPill status={notificationStatusSpec(row.read)} />,
    sortValue: (row) => (row.read ? 1 : 0),
    exportValue: (row) => notificationStatusSpec(row.read).label,
  },
  {
    id: "createdAt",
    header: "Quando",
    kind: "date",
    width: 1.1,
    cell: (row) => <span className="egw-num">{formatDateTime(row.createdAt)}</span>,
    sortValue: (row) => row.createdAt,
    exportValue: (row) => row.createdAt,
  },
];

const FILTERS: FilterDef<NotificationRow>[] = [
  {
    id: "read",
    label: "Lettura",
    type: "select",
    pinned: true,
    options: [
      { value: "unread", label: "Da leggere", tone: "blue" },
      { value: "read", label: "Lette" },
    ],
    apply: (row, value) => (typeof value === "string" && value ? (value === "unread" ? !row.read : row.read) : true),
  },
  {
    id: "type",
    label: "Tipo",
    type: "select",
    options: (Object.keys(NOTIFICATION_TYPE_LABELS) as Array<keyof typeof NOTIFICATION_TYPE_LABELS>).map((type) => ({ value: type, label: NOTIFICATION_TYPE_LABELS[type] })),
    apply: (row, value) => (typeof value === "string" && value ? row.type === value : true),
  },
];

const SEARCH = {
  placeholder: "Cerca notifiche",
  match: (row: NotificationRow, query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return row.title.toLowerCase().includes(q) || row.message.toLowerCase().includes(q);
  },
};

export function NotificationGrid({
  rows,
  state,
  errorMessage,
  onRetry,
  onMarkRead,
  onMarkRows,
  requestedViewId,
  selectedIds,
  onSelectionChange,
}: {
  rows: NotificationRow[];
  state: "ready" | "loading" | "error";
  errorMessage?: string | null;
  onRetry: () => void;
  onMarkRead: (row: NotificationRow) => void;
  onMarkRows: (rows: NotificationRow[]) => void | Promise<void>;
  requestedViewId?: string | null;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
}) {
  const rowActions = React.useMemo<RowActionDef<NotificationRow>[]>(
    () => [{ id: "read", label: "Segna come letta", icon: <Check />, primary: true, hidden: (row) => row.read, onClick: onMarkRead }],
    [onMarkRead],
  );
  const bulkActions = React.useMemo<BulkActionDef<NotificationRow>[]>(
    () => [{ id: "read", label: "Segna come lette", icon: <Check />, onRun: (selected) => onMarkRows(selected.filter((row) => !row.read)) }],
    [onMarkRows],
  );
  return (
    <DataGrid<NotificationRow>
      module="notifiche"
      aria-label="Notifiche"
      rows={rows}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.title}
      columns={COLUMNS}
      filters={FILTERS}
      views={NOTIFICATION_VIEWS}
      requestedViewId={requestedViewId}
      search={SEARCH}
      defaultSort={{ columnId: "createdAt", direction: "desc" }}
      rowActions={rowActions}
      bulkActions={bulkActions}
      selectedIds={selectedIds}
      onSelectionChange={onSelectionChange}
      state={state}
      errorMessage={errorMessage}
      onRetry={onRetry}
      noun={{ singular: "notifica", plural: "notifiche" }}
      empty={{
        icon: <Bell />,
        title: "Nessuna notifica",
        description: "Quando succede qualcosa che ti riguarda, lo trovi qui.",
      }}
    />
  );
}
