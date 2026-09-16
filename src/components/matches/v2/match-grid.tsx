"use client";

import * as React from "react";
import { Copy, Pencil, RotateCcw, Trash2, Users, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ColumnDef, FilterDef, FilterValue, RowActionDef, ViewDef } from "@/components/web/datagrid/types";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { formatDateShort, formatTime, MISSING } from "@/lib/web/format";
import { PERSON_STATUS } from "@/lib/web/status";
import { formatMatchLocationLabel } from "@/lib/match-location";
import type { MatchCertificateWarningResult } from "@/lib/match-certificate-warnings";
import { MatchCertificateWarningBadge } from "@/components/matches/MatchCertificateWarningBadge";
import { ConvocationLine, type RsvpCounts } from "@/components/matches/v2/DayMatches";
import {
  canManageMatch,
  convocatedCountOf,
  convocationTone,
  convocationWord,
  getEffectiveMatchStatus,
  isHomeMatch,
  matchEndTime,
  matchStartTime,
  matchStatusSpec,
  type MatchRecord,
} from "@/components/matches/v2/match-page-model";

/**
 * La «Vista elenco» delle gare come **griglia** (guideline 07): tutte le gare
 * del club, con le viste di sistema (Prossime · Senza convocazioni · Concluse
 * · Annullate), i filtri per categoria, sede, casa/trasferta, stato,
 * convocazioni e periodo, e le stesse azioni di riga della giornata. Copre la
 * tabella «Tutte le gare», le card «Prossime Gare» e lo «Storico Gare» della
 * V1. Niente esportazione: la V1 non la aveva.
 */
export const MATCH_GRID_MODULE = "gare";

export const matchRowKey = (row: MatchRecord) => String(row.eventId || row.id);

export const MATCH_VIEWS: ViewDef[] = [
  {
    id: "prossime",
    label: "Prossime",
    filters: { stato: "upcoming" },
    sort: { columnId: "data", direction: "asc" },
    builtIn: true,
  },
  {
    id: "senza-convocazioni",
    label: "Senza convocazioni",
    filters: { convocazioni: "missing" },
    sort: { columnId: "data", direction: "asc" },
    tone: "amber",
    builtIn: true,
  },
  {
    id: "concluse",
    label: "Concluse",
    filters: { stato: "completed" },
    sort: { columnId: "data", direction: "desc" },
    builtIn: true,
  },
  {
    id: "annullate",
    label: "Annullate",
    filters: { stato: "cancelled" },
    builtIn: true,
  },
];

const asList = (value: FilterValue): string[] =>
  Array.isArray(value) ? value : typeof value === "string" && value ? [value] : [];

const toDayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const buildMatchFilters = ({
  categoryOptions,
  siteOptions,
  siteIdOf,
  categoryMatches,
}: {
  categoryOptions: Array<{ value: string; label: string }>;
  /** Vuoto per un club a sede unica: il filtro non compare. */
  siteOptions: Array<{ value: string; label: string }>;
  siteIdOf: (row: MatchRecord) => string;
  /** Lo stesso predicato del contesto V1: id, o nome/id uguali a `match.category`. */
  categoryMatches: (row: MatchRecord, categoryId: string) => boolean;
}): FilterDef<MatchRecord>[] => {
  const filters: FilterDef<MatchRecord>[] = [
    {
      id: "categoria",
      label: "Categoria",
      type: "multi",
      options: categoryOptions,
      pinned: true,
      apply: (row, value) => {
        const wanted = asList(value);
        if (!wanted.length) return true;
        return wanted.some((id) => categoryMatches(row, id));
      },
    },
    {
      id: "sede-gara",
      label: "Casa / trasferta",
      type: "select",
      options: [
        { value: "home", label: "In casa", tone: "green" },
        { value: "away", label: "Trasferta", tone: "amber" },
      ],
      apply: (row, value) => {
        if (!value) return true;
        return (value === "home") === isHomeMatch(row);
      },
    },
    {
      id: "stato",
      label: "Stato",
      type: "select",
      pinned: true,
      options: [
        { value: "upcoming", label: "In programma" },
        { value: "completed", label: "Concluse", tone: "green" },
        { value: "cancelled", label: "Annullate" },
      ],
      apply: (row, value) => {
        if (!value) return true;
        return getEffectiveMatchStatus(row) === value;
      },
    },
    {
      id: "convocazioni",
      label: "Convocazioni",
      type: "select",
      options: [
        { value: "saved", label: "Salvate", tone: "green" },
        { value: "pending", label: "In corso", tone: "amber" },
        { value: "missing", label: "Mancanti", tone: "amber" },
      ],
      apply: (row, value) => {
        if (!value) return true;
        return convocationTone(row) === value;
      },
    },
    {
      id: "periodo",
      label: "Periodo",
      type: "date-range",
      apply: (row, value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return true;
        const key = toDayKey(row.date);
        if (value.from && key < value.from) return false;
        if (value.to && key > value.to) return false;
        return true;
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

export const buildMatchColumns = ({
  siteNameOf,
  warningOf,
  rsvpOf,
  categoryLabel = (row) => row.category,
}: {
  siteNameOf: (row: MatchRecord) => string;
  warningOf: (row: MatchRecord) => MatchCertificateWarningResult;
  rsvpOf?: (row: MatchRecord) => RsvpCounts;
  /** Come si scrive la categoria (ADR-0185): lo dice la pagina con il suo indice; la riga porta solo il nome salvato. */
  categoryLabel?: (row: MatchRecord) => string;
}): ColumnDef<MatchRecord>[] => [
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
    width: "112px",
    cell: (row) => {
      const cancelled = getEffectiveMatchStatus(row) === "cancelled";
      const start = matchStartTime(row);
      const end = matchEndTime(row);
      return (
        <span className={cn("egw-num font-bold", cancelled && "text-egw-ink-42 line-through")}>
          {start ? formatTime(start) : MISSING}
          {end ? <span className="font-medium text-egw-ink-62">–{formatTime(end)}</span> : null}
        </span>
      );
    },
    sortValue: (row) => matchStartTime(row),
  },
  {
    id: "avversario",
    header: "Avversario",
    kind: "identity",
    minWidth: 200,
    width: 2,
    locked: true,
    cell: (row) => (
      <span className="min-w-0">
        <span className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink" title={row.opponent || row.title}>
          {row.opponent || row.title || MISSING}
        </span>
        <span className="egw-ellipsis block font-brand text-[10px] text-[rgba(11,26,58,.5)]" title={row.title}>
          {row.matchNumber ? `N. ${row.matchNumber} · ` : ""}
          {row.title}
        </span>
      </span>
    ),
    sortValue: (row) => row.opponent || row.title,
    title: (row) => row.opponent || row.title,
  },
  {
    id: "casa",
    header: "Casa / trasferta",
    kind: "chips",
    width: "126px",
    cell: (row) => (
      <DataChip tone={isHomeMatch(row) ? "green" : "amber"} size="sm">
        {isHomeMatch(row) ? "In casa" : "Trasferta"}
      </DataChip>
    ),
    sortValue: (row) => (isHomeMatch(row) ? 0 : 1),
    exportValue: (row) => (isHomeMatch(row) ? "In casa" : "Trasferta"),
  },
  {
    id: "categoria",
    header: "Categoria",
    kind: "chips",
    minWidth: 130,
    cell: (row) => (
      <DataChip tone="blue" size="sm" title={categoryLabel(row)}>
        {categoryLabel(row) || "Categoria"}
      </DataChip>
    ),
    sortValue: (row) => categoryLabel(row),
    exportValue: (row) => categoryLabel(row),
  },
  {
    id: "luogo",
    header: "Sede · campo",
    kind: "text",
    minWidth: 160,
    cell: (row) => {
      const label = [siteNameOf(row), formatMatchLocationLabel(row)].filter(Boolean).join(" · ");
      return (
        <span className="egw-ellipsis block" title={label}>
          {label || MISSING}
        </span>
      );
    },
    sortValue: (row) => `${siteNameOf(row)} ${formatMatchLocationLabel(row)}`,
  },
  {
    id: "allenatori",
    header: "Allenatori",
    kind: "text",
    minWidth: 150,
    hidden: true,
    cell: (row) => (
      <span className="egw-ellipsis block" title={row.trainers?.join(", ")}>
        {row.trainers?.length ? row.trainers.join(", ") : MISSING}
      </span>
    ),
    sortValue: (row) => row.trainers?.join(", ") || "",
  },
  {
    id: "convocazioni",
    header: "Convocazioni",
    kind: "number",
    minWidth: 160,
    cell: (row) =>
      getEffectiveMatchStatus(row) === "cancelled" ? (
        <span className="text-egw-ink-42">{MISSING}</span>
      ) : (
        <ConvocationLine match={row} rsvp={rsvpOf?.(row)} compact />
      ),
    sortValue: (row) => convocatedCountOf(row),
    exportValue: (row) => `${convocatedCountOf(row)} convocati · ${convocationWord(convocationTone(row))}`,
  },
  {
    id: "certificati",
    header: "Certificati",
    kind: "status",
    width: "120px",
    cell: (row) => {
      const warning = warningOf(row);
      return warning.hasInvalidCertificates ? (
        <MatchCertificateWarningBadge warning={warning} compact />
      ) : (
        <span className="text-egw-ink-42">{MISSING}</span>
      );
    },
    sortValue: (row) => warningOf(row).count,
  },
  {
    id: "stato",
    header: "Stato",
    kind: "status",
    width: "140px",
    cell: (row) => <StatusPill status={matchStatusSpec(getEffectiveMatchStatus(row))} size="sm" />,
    sortValue: (row) => getEffectiveMatchStatus(row),
  },
];

export const buildMatchRowActions = ({
  onConvocations,
  onEdit,
  onDuplicate,
  onCancel,
  onRestore,
  onDelete,
}: {
  onConvocations: (row: MatchRecord) => void;
  onEdit: (row: MatchRecord) => void;
  onDuplicate: (row: MatchRecord) => void;
  onCancel: (row: MatchRecord) => void;
  onRestore: (row: MatchRecord) => void;
  onDelete: (row: MatchRecord) => void;
}): RowActionDef<MatchRecord>[] => [
  {
    id: "convocazioni",
    label: "Convocazioni",
    icon: <Users />,
    primary: true,
    onClick: onConvocations,
    hidden: (row) => !canManageMatch(row),
  },
  {
    id: "modifica",
    label: "Modifica",
    icon: <Pencil />,
    onClick: onEdit,
    hidden: (row) => getEffectiveMatchStatus(row) === "cancelled",
  },
  {
    id: "duplica",
    label: "Duplica",
    icon: <Copy />,
    onClick: onDuplicate,
  },
  {
    id: "annulla",
    label: "Annulla gara",
    icon: <XCircle />,
    onClick: onCancel,
    hidden: (row) => !canManageMatch(row),
  },
  {
    id: "ripristina",
    label: "Ripristina",
    icon: <RotateCcw />,
    onClick: onRestore,
    hidden: (row) => getEffectiveMatchStatus(row) !== "cancelled",
  },
  {
    id: "elimina",
    label: "Elimina",
    icon: <Trash2 />,
    tone: "danger",
    onClick: onDelete,
  },
];

/* ── La rosa convocabile per categoria (la tab «Convocazioni» della V1) ──── */

export const ROSTER_GRID_MODULE = "gare-rosa";

export type RosterRow = {
  id: string;
  athleteId: string;
  name: string;
  categoryId: string;
  categoryName: string;
  status: string;
  /** La V1 non li calcolava mai (sempre 0): restano `null` finche nessuno li conta. */
  matchesPlayed: number | null;
  matchesAbsent: number | null;
};

export const rosterRowKey = (row: RosterRow) => row.id;

export const ROSTER_STATUS_OPTIONS = [
  { value: "active", label: "Solo attivi", tone: "green" as const },
  { value: "suspended", label: "Solo sospesi", tone: "red" as const },
  { value: "loaned", label: "Solo in prestito", tone: "amber" as const },
];

const rosterStatusSpec = (status: string) => {
  switch (status) {
    case "suspended":
      return PERSON_STATUS.suspended;
    case "loaned":
    case "loan":
    case "on_loan":
      return PERSON_STATUS.on_loan;
    default:
      return PERSON_STATUS.active;
  }
};

export const buildRosterFilters = ({
  categoryOptions,
}: {
  categoryOptions: Array<{ value: string; label: string }>;
}): FilterDef<RosterRow>[] => [
  {
    id: "categoria",
    label: "Categoria",
    type: "select",
    options: categoryOptions,
    pinned: true,
    apply: (row, value) => !value || row.categoryId === value,
  },
  {
    id: "stato",
    label: "Stato",
    type: "select",
    options: ROSTER_STATUS_OPTIONS,
    pinned: true,
    apply: (row, value) => !value || row.status === value,
  },
];

export const ROSTER_COLUMNS: ColumnDef<RosterRow>[] = [
  {
    id: "atleta",
    header: "Atleta",
    kind: "identity",
    minWidth: 200,
    width: 2,
    locked: true,
    cell: (row) => (
      <span className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink" title={row.name}>
        {row.name}
      </span>
    ),
    sortValue: (row) => row.name,
    title: (row) => row.name,
  },
  {
    id: "categoria",
    header: "Categoria",
    kind: "chips",
    minWidth: 140,
    cell: (row) => (
      <DataChip tone="blue" size="sm" title={row.categoryName}>
        {row.categoryName}
      </DataChip>
    ),
    sortValue: (row) => row.categoryName,
  },
  {
    id: "stato",
    header: "Stato",
    kind: "status",
    width: "130px",
    cell: (row) => <StatusPill status={rosterStatusSpec(row.status)} size="sm" />,
    sortValue: (row) => row.status,
  },
  {
    id: "disputate",
    header: "Gare disputate",
    kind: "number",
    align: "right",
    width: "120px",
    cell: (row) => <span className="egw-num">{row.matchesPlayed ?? MISSING}</span>,
    sortValue: (row) => row.matchesPlayed ?? -1,
  },
  {
    id: "assenze",
    header: "Assenze",
    kind: "number",
    align: "right",
    width: "100px",
    cell: (row) => <span className="egw-num">{row.matchesAbsent ?? MISSING}</span>,
    sortValue: (row) => row.matchesAbsent ?? -1,
  },
  {
    id: "percentuale",
    header: "Percentuale presenze",
    kind: "number",
    align: "right",
    width: "150px",
    cell: (row) => {
      const total = (row.matchesPlayed ?? 0) + (row.matchesAbsent ?? 0);
      if (row.matchesPlayed === null || total === 0) return <span className="egw-num text-egw-ink-42">{MISSING}</span>;
      return <span className="egw-num">{Math.round(((row.matchesPlayed ?? 0) / total) * 100)}%</span>;
    },
    sortValue: (row) => {
      const total = (row.matchesPlayed ?? 0) + (row.matchesAbsent ?? 0);
      return total ? (row.matchesPlayed ?? 0) / total : -1;
    },
  },
];
