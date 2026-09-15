"use client";

import * as React from "react";
import type { ColumnDef, FilterDef, ViewDef } from "@/components/web/datagrid/types";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import type { AppointmentSlotRow } from "@/lib/api/appointments-client";
import { MISSING, formatDateShort, formatTime } from "@/lib/web/format";
import {
  GIORNI,
  isSlotActive,
  nomeOperatore,
  nomeSede,
  slotDayLabel,
  slotKindLabel,
  slotSortKey,
  slotStatusKey,
  slotStatusSpec,
  soloData,
  type Operatore,
  type Sede,
} from "@/components/appuntamenti/v2/slot-model";

/**
 * La griglia delle fasce di ricevimento (guideline 07): una riga per regola,
 * con il giorno o la data, l'orario, la durata, la sede, l'operatore, lo
 * stato e la validita. Colonne, filtri e viste sono configurazione; dati e
 * scritture restano nella pagina.
 */
export const SLOT_VIEWS: ViewDef[] = [
  { id: "weekly", label: "Settimanali", filters: { kind: "weekly" }, builtIn: true },
  { id: "dates", label: "Date singole", filters: { kind: "date" }, builtIn: true },
  { id: "inactive", label: "Disattivate e chiusure", filters: { status: "off" }, builtIn: true, tone: "amber" },
];

export const slotColumns = (sedi: Sede[], operatori: Operatore[]): ColumnDef<AppointmentSlotRow>[] => [
  {
    id: "identity",
    header: "Giorno",
    kind: "identity",
    locked: true,
    width: 1.6,
    cell: (row) => (
      <span className="flex min-w-0 flex-col">
        <span className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink">{row.specific_date ? formatDateShort(row.specific_date) : slotDayLabel(row)}</span>
        <span className="egw-ellipsis block font-brand text-[10px] text-[rgba(11,26,58,.5)]">{slotKindLabel(row)}</span>
      </span>
    ),
    sortValue: (row) => slotSortKey(row),
    exportValue: (row) => slotDayLabel(row),
    title: (row) => slotDayLabel(row),
  },
  {
    id: "time",
    header: "Orario",
    kind: "text",
    cell: (row) => (
      <span className="egw-num font-semibold">
        {formatTime(row.start_time)} – {formatTime(row.end_time)}
      </span>
    ),
    sortValue: (row) => row.start_time,
    exportValue: (row) => `${row.start_time} – ${row.end_time}`,
  },
  {
    id: "duration",
    header: "Durata",
    kind: "number",
    width: 0.7,
    cell: (row) => <span className="egw-num">{row.duration_minutes} min</span>,
    sortValue: (row) => row.duration_minutes,
    exportValue: (row) => row.duration_minutes,
  },
  {
    id: "site",
    header: "Sede",
    kind: "classification",
    cell: (row) => (
      <DataChip size="sm" title={nomeSede(sedi, row.site_id)}>
        {nomeSede(sedi, row.site_id)}
      </DataChip>
    ),
    sortValue: (row) => nomeSede(sedi, row.site_id).toLowerCase(),
    exportValue: (row) => nomeSede(sedi, row.site_id),
  },
  {
    id: "operator",
    header: "Operatore",
    kind: "classification",
    cell: (row) => nomeOperatore(operatori, row.assigned_to_user_id),
    sortValue: (row) => nomeOperatore(operatori, row.assigned_to_user_id).toLowerCase(),
    title: (row) => nomeOperatore(operatori, row.assigned_to_user_id),
  },
  {
    id: "status",
    header: "Stato",
    kind: "status",
    cell: (row) => <StatusPill status={slotStatusSpec(row)} />,
    sortValue: (row) => slotStatusSpec(row).label,
    exportValue: (row) => slotStatusSpec(row).label,
  },
  {
    id: "validity",
    header: "In vigore",
    kind: "date",
    hidden: true,
    cell: (row) =>
      row.valid_from || row.valid_until ? (
        <span className="egw-num">
          {row.valid_from ? `dal ${formatDateShort(soloData(row.valid_from))}` : ""}
          {row.valid_from && row.valid_until ? " " : ""}
          {row.valid_until ? `fino al ${formatDateShort(soloData(row.valid_until))}` : ""}
        </span>
      ) : null,
    sortValue: (row) => soloData(row.valid_from) || null,
    exportValue: (row) => [row.valid_from ? `dal ${soloData(row.valid_from)}` : "", row.valid_until ? `fino al ${soloData(row.valid_until)}` : ""].filter(Boolean).join(" ") || MISSING,
  },
  {
    id: "notes",
    header: "Note interne",
    kind: "text",
    hidden: true,
    cell: (row) => row.notes || null,
    title: (row) => row.notes || undefined,
    exportValue: (row) => row.notes,
  },
];

export const slotFilters = (rows: AppointmentSlotRow[], sedi: Sede[], operatori: Operatore[]): FilterDef<AppointmentSlotRow>[] => [
  {
    id: "kind",
    label: "Ricorrenza",
    type: "select",
    pinned: true,
    options: [
      { value: "weekly", label: "Ogni settimana", count: rows.filter((row) => !row.specific_date).length },
      { value: "date", label: "Una data sola", count: rows.filter((row) => Boolean(row.specific_date)).length },
    ],
    apply: (row, value) => (value === "weekly" ? !row.specific_date : value === "date" ? Boolean(row.specific_date) : true),
  },
  {
    id: "status",
    label: "Stato",
    type: "select",
    pinned: true,
    options: [
      { value: "active", label: "Attive", count: rows.filter(isSlotActive).length, tone: "green" },
      { value: "off", label: "Disattivate e chiusure", count: rows.filter((row) => !isSlotActive(row)).length, tone: "amber" },
      { value: "closure", label: "Chiusure (date disattivate)", count: rows.filter((row) => slotStatusKey(row) === "closure").length, tone: "red" },
    ],
    apply: (row, value) => (value === "active" ? isSlotActive(row) : value === "off" ? !isSlotActive(row) : value === "closure" ? slotStatusKey(row) === "closure" : true),
  },
  {
    id: "weekday",
    label: "Giorno della settimana",
    type: "select",
    options: GIORNI.map((giorno) => ({ value: String(giorno.valore), label: giorno.nome, count: rows.filter((row) => !row.specific_date && row.weekday === giorno.valore).length })),
    apply: (row, value) => (typeof value === "string" && value ? !row.specific_date && String(row.weekday) === value : true),
  },
  {
    id: "site",
    label: "Sede",
    type: "select",
    options: [{ value: "__all__", label: "Tutte le sedi", count: rows.filter((row) => !row.site_id).length }, ...sedi.map((sede) => ({ value: sede.id, label: sede.name, count: rows.filter((row) => row.site_id === sede.id).length }))],
    apply: (row, value) => (typeof value === "string" && value ? (value === "__all__" ? !row.site_id : row.site_id === value) : true),
  },
  {
    id: "operator",
    label: "Operatore",
    type: "select",
    options: [{ value: "__desk__", label: "Segreteria", count: rows.filter((row) => !row.assigned_to_user_id).length }, ...operatori.map((operatore) => ({ value: operatore.userId, label: operatore.nome, count: rows.filter((row) => row.assigned_to_user_id === operatore.userId).length }))],
    apply: (row, value) => (typeof value === "string" && value ? (value === "__desk__" ? !row.assigned_to_user_id : row.assigned_to_user_id === value) : true),
  },
];

export const slotSearch = (sedi: Sede[], operatori: Operatore[]) => ({
  placeholder: "Cerca per giorno, sede, operatore, note",
  match: (row: AppointmentSlotRow, query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [slotDayLabel(row), nomeSede(sedi, row.site_id), nomeOperatore(operatori, row.assigned_to_user_id), row.notes, row.start_time, row.end_time]
      .map((value) => String(value || "").toLowerCase())
      .some((value) => value.includes(q));
  },
});
