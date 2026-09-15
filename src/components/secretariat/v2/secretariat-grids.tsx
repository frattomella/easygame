"use client";

import * as React from "react";
import type { ColumnDef, FilterDef, ViewDef } from "@/components/web/datagrid/types";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import type { ClubAppointment } from "@/lib/api/appointments-client";
import { getReminderTargetSummary } from "@/lib/reminder-targeting";
import { CERTIFICATE_STATUS } from "@/lib/web/status";
import { MISSING, daysUntil, formatDateShort, formatDaysLabel, formatTime, joinMeta } from "@/lib/web/format";
import {
  APPOINTMENT_STATUS_FILTER_OPTIONS,
  appointmentPersonName,
  appointmentStatusSpec,
  isLiveAppointment,
  isNoteExpired,
  noteNotificationSummary,
  noteTargetLabel,
  NOTE_TARGET_OPTIONS,
  type SecretariatNote,
} from "@/components/secretariat/v2/secretariat-model";

/**
 * Le due griglie della Segreteria (guideline 07): la coda degli appuntamenti
 * e l'elenco delle note. Colonne, filtri e viste sono configurazione; i dati
 * e le scritture restano nella pagina.
 */

/* ── Appuntamenti ────────────────────────────────────────────────────────── */
export const APPOINTMENT_VIEWS: ViewDef[] = [
  { id: "requested", label: "In attesa", filters: { status: "requested" }, builtIn: true, tone: "amber" },
  { id: "confirmed", label: "Confermati", filters: { status: "confirmed" }, builtIn: true },
  { id: "closed", label: "Chiusi", filters: { phase: "closed" }, builtIn: true },
];

export const appointmentColumns = (): ColumnDef<ClubAppointment>[] => [
  {
    id: "identity",
    header: "Appuntamento",
    kind: "identity",
    locked: true,
    width: 2,
    cell: (row) => (
      <span className="flex min-w-0 flex-col">
        <span className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink">{row.title || "Appuntamento"}</span>
        <span className="egw-ellipsis block font-brand text-[10px] text-[rgba(11,26,58,.5)]">{joinMeta(appointmentPersonName(row), row.notes) || MISSING}</span>
      </span>
    ),
    sortValue: (row) => String(row.title || "").toLowerCase(),
    exportValue: (row) => row.title,
    title: (row) => row.title,
  },
  {
    id: "date",
    header: "Giorno",
    kind: "date",
    cell: (row) => formatDateShort(row.date),
    sortValue: (row) => `${row.date} ${row.time}`,
    exportValue: (row) => row.date,
  },
  {
    id: "time",
    header: "Orario",
    kind: "text",
    width: 0.7,
    cell: (row) => <span className="egw-num font-semibold">{formatTime(row.time)}</span>,
    sortValue: (row) => `${row.date} ${row.time}`,
    exportValue: (row) => row.time,
  },
  {
    id: "status",
    header: "Stato",
    kind: "status",
    cell: (row) => <StatusPill status={appointmentStatusSpec(row.status)} title={row.status_label} />,
    sortValue: (row) => row.status_label,
    exportValue: (row) => row.status_label,
  },
  {
    id: "person",
    header: "Nominativo",
    kind: "text",
    hidden: true,
    cell: (row) => appointmentPersonName(row) || null,
    sortValue: (row) => appointmentPersonName(row).toLowerCase() || null,
  },
  {
    id: "notes",
    header: "Note",
    kind: "text",
    hidden: true,
    cell: (row) => row.notes || null,
    title: (row) => row.notes || undefined,
    exportValue: (row) => row.notes,
  },
  {
    id: "decision",
    header: "Nota della decisione",
    kind: "text",
    hidden: true,
    cell: (row) => row.decision_note || null,
    title: (row) => row.decision_note || undefined,
    exportValue: (row) => row.decision_note,
  },
];

export const appointmentFilters = (rows: ClubAppointment[]): FilterDef<ClubAppointment>[] => [
  {
    id: "status",
    label: "Stato",
    type: "select",
    pinned: true,
    options: APPOINTMENT_STATUS_FILTER_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
      count: rows.filter((row) => row.status === option.value).length,
      tone: option.tone,
    })),
    apply: (row, value) => (typeof value === "string" && value ? row.status === value : true),
  },
  {
    id: "phase",
    label: "Fase",
    type: "select",
    options: [
      { value: "live", label: "Da lavorare (in attesa o confermati)", count: rows.filter(isLiveAppointment).length },
      { value: "closed", label: "Chiusi", count: rows.filter((row) => !isLiveAppointment(row)).length },
    ],
    apply: (row, value) => (value === "live" ? isLiveAppointment(row) : value === "closed" ? !isLiveAppointment(row) : true),
  },
];

export const appointmentSearch = {
  placeholder: "Cerca per titolo, nominativo, note",
  match: (row: ClubAppointment, query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [row.title, appointmentPersonName(row), row.notes, row.decision_note, row.status_label]
      .map((value) => String(value || "").toLowerCase())
      .some((value) => value.includes(q));
  },
};

/* ── Note e promemoria ───────────────────────────────────────────────────── */
export const NOTE_VIEWS: ViewDef[] = [
  { id: "active", label: "Attive", filters: { expiry: "active" }, builtIn: true },
  { id: "expired", label: "Scadute", filters: { expiry: "expired" }, builtIn: true, tone: "amber" },
  { id: "notified", label: "Con notifica", filters: { notification: true }, builtIn: true },
];

const EXPIRING_WITHIN_DAYS = 7;

function NoteExpiryCell({ note }: { note: SecretariatNote }) {
  if (!note.expiryDate) return null;
  const days = daysUntil(note.expiryDate);
  const time = !note.isAllDay && note.notificationTime ? ` · ${note.notificationTime}` : "";
  if (days != null && days < 0) return <StatusPill status={CERTIFICATE_STATUS.expired} detail={formatDateShort(note.expiryDate)} />;
  if (days != null && days <= EXPIRING_WITHIN_DAYS) return <StatusPill status={CERTIFICATE_STATUS.expiring} detail={formatDaysLabel(days)} title={formatDateShort(note.expiryDate)} />;
  return (
    <span className="egw-num">
      {formatDateShort(note.expiryDate)}
      {time}
    </span>
  );
}

export const noteColumns = (): ColumnDef<SecretariatNote>[] => [
  {
    id: "identity",
    header: "Nota",
    kind: "identity",
    locked: true,
    width: 2.4,
    cell: (row) => (
      <span className="flex min-w-0 flex-col">
        <span className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink">{row.content || MISSING}</span>
        <span className="egw-ellipsis block font-brand text-[10px] text-[rgba(11,26,58,.5)]">Creata {formatDateShort(row.date)}</span>
      </span>
    ),
    sortValue: (row) => row.content.toLowerCase(),
    exportValue: (row) => row.content,
    title: (row) => row.content,
  },
  {
    id: "target",
    header: "Destinazione",
    kind: "classification",
    width: 1.3,
    cell: (row) => (
      <span className="flex min-w-0 items-center gap-2">
        <DataChip size="sm" title={noteTargetLabel(row.targetType)}>
          {noteTargetLabel(row.targetType)}
        </DataChip>
        {row.targetLabel ? <span className="egw-ellipsis font-brand text-[12px] text-egw-ink-72">{row.targetLabel}</span> : null}
      </span>
    ),
    sortValue: (row) => getReminderTargetSummary(row).toLowerCase(),
    exportValue: (row) => getReminderTargetSummary(row),
    title: (row) => getReminderTargetSummary(row),
  },
  {
    id: "expiry",
    header: "Scadenza",
    kind: "date",
    cell: (row) => <NoteExpiryCell note={row} />,
    sortValue: (row) => (row.expiryDate ? row.expiryDate.toISOString() : null),
    exportValue: (row) => (row.expiryDate ? formatDateShort(row.expiryDate) : null),
  },
  {
    id: "notification",
    header: "Notifica",
    kind: "text",
    cell: (row) => {
      const summary = noteNotificationSummary(row);
      return summary ? (
        <DataChip size="sm" tone="blue" title={summary}>
          {summary}
        </DataChip>
      ) : null;
    },
    sortValue: (row) => (row.notificationEnabled ? 1 : 0),
    exportValue: (row) => noteNotificationSummary(row) || "",
  },
  {
    id: "created",
    header: "Creata",
    kind: "date",
    hidden: true,
    cell: (row) => formatDateShort(row.date),
    sortValue: (row) => row.date.toISOString(),
    exportValue: (row) => formatDateShort(row.date),
  },
];

export const noteFilters = (rows: SecretariatNote[]): FilterDef<SecretariatNote>[] => [
  {
    id: "target",
    label: "Destinazione",
    type: "select",
    pinned: true,
    options: NOTE_TARGET_OPTIONS.map((option) => ({ ...option, count: rows.filter((row) => row.targetType === option.value).length })),
    apply: (row, value) => (typeof value === "string" && value ? row.targetType === value : true),
  },
  {
    id: "expiry",
    label: "Scadenza",
    type: "select",
    options: [
      { value: "active", label: "Attive (non scadute)", count: rows.filter((row) => !isNoteExpired(row)).length },
      { value: "expired", label: "Scadute", count: rows.filter((row) => isNoteExpired(row)).length, tone: "amber" },
      { value: "none", label: "Senza scadenza", count: rows.filter((row) => !row.expiryDate).length },
    ],
    apply: (row, value) => (value === "active" ? !isNoteExpired(row) : value === "expired" ? isNoteExpired(row) : value === "none" ? !row.expiryDate : true),
  },
  {
    id: "notification",
    label: "Con notifica",
    type: "boolean",
    apply: (row, value) => (value === true ? row.notificationEnabled : true),
  },
];

export const noteSearch = {
  placeholder: "Cerca nel testo o nel destinatario",
  match: (row: SecretariatNote, query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [row.content, row.targetLabel, getReminderTargetSummary(row)].map((value) => String(value || "").toLowerCase()).some((value) => value.includes(q));
  },
};
