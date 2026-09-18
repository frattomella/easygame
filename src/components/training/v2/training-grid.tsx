"use client";

import * as React from "react";
import { ClipboardCheck, Pencil, RotateCcw, Trash2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ColumnDef, FilterDef, FilterValue, RowActionDef, ViewDef } from "@/components/web/datagrid/types";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { formatDateShort, formatTime, MISSING } from "@/lib/web/format";
import { canRecordTrainingAttendance, getTrainingStableKey } from "@/lib/training-utils";
import { AttendanceLine } from "@/components/training/v2/DaySessions";
import {
  attendanceStatusSpec,
  attendanceVerb,
  sessionAttendanceSummary,
  sessionAttendanceTone,
  sessionPhase,
  sessionStatusSpec,
  type TrainingSession,
} from "@/components/training/v2/training-page-model";

/**
 * La vista settimana come **griglia** (guideline 07): le sedute della
 * settimana scelta, con le viste di sistema, i filtri per categoria, sede,
 * allenatore e stato delle presenze, e le stesse azioni di riga della
 * giornata. Niente esportazione: la V1 non la aveva.
 */
export const TRAINING_GRID_MODULE = "allenamenti";

export const trainingRowKey = (row: TrainingSession) => getTrainingStableKey(row);

export const TRAINING_VIEWS: ViewDef[] = [
  {
    id: "da-registrare",
    label: "Da registrare",
    filters: { presenze: "missing" },
    tone: "amber",
    builtIn: true,
  },
  {
    id: "annullati",
    label: "Annullati",
    filters: { stato: "annullato" },
    builtIn: true,
  },
];

const asList = (value: FilterValue): string[] =>
  Array.isArray(value) ? value : typeof value === "string" && value ? [value] : [];

export const buildTrainingFilters = ({
  categoryOptions,
  trainerOptions,
  siteOptions,
  siteIdOf,
}: {
  categoryOptions: Array<{ value: string; label: string }>;
  trainerOptions: Array<{ value: string; label: string }>;
  /** Vuoto per un club a sede unica: il filtro non compare. */
  siteOptions: Array<{ value: string; label: string }>;
  siteIdOf: (row: TrainingSession) => string;
}): FilterDef<TrainingSession>[] => {
  const filters: FilterDef<TrainingSession>[] = [
    {
      id: "categoria",
      label: "Categoria",
      type: "multi",
      options: categoryOptions,
      pinned: true,
      apply: (row, value) => {
        const wanted = asList(value);
        if (!wanted.length) return true;
        const refs = new Set(
          [...(row.categoryReferences || []), row.categoryId || ""].map((ref) => String(ref).trim().toLowerCase()).filter(Boolean),
        );
        return wanted.some((id) => refs.has(String(id).trim().toLowerCase()));
      },
    },
    {
      id: "allenatore",
      label: "Allenatore",
      type: "multi",
      options: trainerOptions,
      apply: (row, value) => {
        const wanted = asList(value);
        if (!wanted.length) return true;
        const ids = new Set(row.trainerIds || []);
        return wanted.some((id) => ids.has(id));
      },
    },
    {
      id: "presenze",
      label: "Presenze",
      type: "select",
      pinned: true,
      options: [
        { value: "recorded", label: "Registrate", tone: "green" },
        { value: "missing", label: "Da registrare", tone: "amber" },
      ],
      apply: (row, value) => {
        if (!value) return true;
        return sessionAttendanceTone(row) === value;
      },
    },
    {
      id: "stato",
      label: "Stato",
      type: "select",
      options: [
        { value: "upcoming", label: "In programma" },
        { value: "in_progress", label: "In corso" },
        { value: "concluded", label: "Completati" },
        { value: "annullato", label: "Annullati" },
      ],
      apply: (row, value) => {
        if (!value) return true;
        return sessionPhase(row) === value;
      },
    },
  ];
  if (siteOptions.length) {
    filters.splice(1, 0, {
      id: "sede",
      label: "Sede",
      type: "select",
      options: siteOptions,
      apply: (row, value) => {
        if (!value) return true;
        /* Una sede non dichiarata resta visibile con qualunque filtro (V1). */
        const siteId = siteIdOf(row);
        return !siteId || siteId === value;
      },
    });
  }
  return filters;
};

export const buildTrainingColumns = ({
  siteNameOf,
}: {
  siteNameOf: (row: TrainingSession) => string;
}): ColumnDef<TrainingSession>[] => [
  {
    id: "data",
    header: "Data",
    kind: "date",
    width: "118px",
    cell: (row) => <span className="egw-num">{formatDateShort(row.date)}</span>,
    sortValue: (row) => row.date.getTime(),
    exportValue: (row) => formatDateShort(row.date),
    locked: true,
  },
  {
    id: "ora",
    header: "Ora",
    kind: "text",
    width: "104px",
    cell: (row) => {
      const cancelled = sessionPhase(row) === "annullato";
      return (
        <span className={cn("egw-num font-bold", cancelled && "text-egw-ink-42 line-through")}>
          {row.time ? formatTime(row.time) : MISSING}
          {row.endTime ? <span className="font-medium text-egw-ink-62">–{formatTime(row.endTime)}</span> : null}
        </span>
      );
    },
    sortValue: (row) => row.time || "",
  },
  {
    id: "titolo",
    header: "Allenamento",
    kind: "identity",
    minWidth: 200,
    width: 2,
    locked: true,
    cell: (row) => (
      <span className="min-w-0">
        <span className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink" title={[row.title, row.note].filter(Boolean).join(" · ")}>
          {row.title}
          {row.note ? <span className="font-medium text-egw-ink-62"> · {row.note}</span> : null}
        </span>
        <span className="egw-ellipsis block font-brand text-[10px] text-[rgba(11,26,58,.5)]" title={row.trainer}>
          {row.trainer}
        </span>
      </span>
    ),
    sortValue: (row) => [row.title, row.note].filter(Boolean).join(" · "),
    title: (row) => [row.title, row.note].filter(Boolean).join(" · "),
  },
  {
    id: "categoria",
    header: "Categoria",
    kind: "chips",
    minWidth: 130,
    cell: (row) => (
      <DataChip tone="blue" size="sm" title={row.category}>
        {row.category}
      </DataChip>
    ),
    sortValue: (row) => row.category,
  },
  {
    id: "sede",
    header: "Sede · struttura",
    kind: "text",
    minWidth: 150,
    cell: (row) => {
      const site = siteNameOf(row);
      return (
        <span className="egw-ellipsis block" title={[site, row.location].filter(Boolean).join(" · ")}>
          {[site, row.location].filter(Boolean).join(" · ") || MISSING}
        </span>
      );
    },
    sortValue: (row) => `${siteNameOf(row)} ${row.location}`,
  },
  {
    id: "presenze",
    header: "Presenze",
    kind: "number",
    minWidth: 150,
    cell: (row) => (sessionPhase(row) === "annullato" ? <span className="text-egw-ink-42">{MISSING}</span> : <AttendanceLine training={row} compact />),
    sortValue: (row) => {
      const summary = sessionAttendanceSummary(row);
      return summary.total ? summary.present / summary.total : -1;
    },
    exportValue: (row) => {
      const summary = sessionAttendanceSummary(row);
      return `${summary.present}/${summary.total || MISSING}`;
    },
  },
  {
    id: "stato",
    header: "Stato",
    kind: "status",
    width: "150px",
    cell: (row) => {
      const phase = sessionPhase(row);
      if (phase === "annullato" || phase === "in_progress") return <StatusPill status={sessionStatusSpec(phase)} size="sm" />;
      const spec = attendanceStatusSpec(sessionAttendanceTone(row));
      return <StatusPill status={spec ?? sessionStatusSpec(phase)} size="sm" />;
    },
    sortValue: (row) => sessionPhase(row),
  },
];

export const buildTrainingRowActions = ({
  onAttendance,
  onEdit,
  onCancel,
  onRestore,
  onDelete,
}: {
  onAttendance: (row: TrainingSession) => void;
  onEdit: (row: TrainingSession) => void;
  onCancel: (row: TrainingSession) => void;
  onRestore: (row: TrainingSession) => void;
  onDelete: (row: TrainingSession) => void;
}): RowActionDef<TrainingSession>[] => [
  {
    id: "presenze",
    label: "Presenze",
    icon: <ClipboardCheck />,
    primary: true,
    onClick: onAttendance,
    hidden: (row) => attendanceVerb(row) === null || !canRecordTrainingAttendance(row),
  },
  {
    id: "modifica",
    label: "Modifica",
    icon: <Pencil />,
    onClick: onEdit,
    hidden: (row) => sessionPhase(row) === "annullato",
  },
  {
    id: "annulla",
    label: "Annulla allenamento",
    icon: <XCircle />,
    onClick: onCancel,
    hidden: (row) => {
      const phase = sessionPhase(row);
      return phase === "annullato" || phase === "concluded";
    },
  },
  {
    id: "ripristina",
    label: "Ripristina",
    icon: <RotateCcw />,
    onClick: onRestore,
    hidden: (row) => sessionPhase(row) !== "annullato",
  },
  {
    id: "elimina",
    label: "Elimina",
    icon: <Trash2 />,
    tone: "danger",
    onClick: onDelete,
  },
];
