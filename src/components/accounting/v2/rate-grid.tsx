"use client";

import * as React from "react";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { MONEY_STATUS, type StatusSpec } from "@/lib/web/status";
import { formatDateShort, formatMoney } from "@/lib/web/format";
import type { ColumnDef, FilterDef, ViewDef } from "@/components/web/datagrid/types";
import {
  readChargeCollectedAmount,
  resolveLedgerState,
  toPaymentAmount,
  type InstallmentLedgerState,
} from "@/lib/payments/installment-ledger";

/**
 * La scheda **Rate e solleciti** come configurazione del `DataGrid`.
 *
 * Le rate delle famiglie **non** sono prima nota: sono crediti, e il loro
 * proprietario e `payments` con il registro degli incassi. Quanto e incassato
 * su una rata lo dice `readChargeCollectedAmount`, che e il proprietario del
 * calcolo, e lo stato lo deriva `resolveLedgerState` — non si legge da una
 * colonna, che era il difetto di ADR-0036. Questo modulo non somma niente.
 */

export type InstallmentRow = {
  charge: any;
  id: string;
  athleteId: string;
  athleteName: string;
  description: string;
  dueAmount: number;
  paidAmount: number;
  state: InstallmentLedgerState;
  overdue: boolean;
  dueDate: string | null;
};

/**
 * Le rate con il loro stato **derivato**. Una rata gia saldata non si
 * sollecita, e non e una regola di questa pagina: lo stato lo decide il
 * registro degli incassi.
 */
export const toInstallmentRows = (
  installments: readonly any[],
  athleteNames: Record<string, string>,
): InstallmentRow[] =>
  installments.map((charge) => {
    const dueAmount = toPaymentAmount((charge as any)?.amount);
    const paidAmount = readChargeCollectedAmount(charge);
    const state = resolveLedgerState({ dueAmount, paidAmount });
    const dueDate = (charge as any)?.due_date || (charge as any)?.dueDate;
    const overdue =
      state !== "paid" && Boolean(dueDate) && new Date(dueDate).getTime() < Date.now();
    const athleteId = String((charge as any)?.athlete_id || "").trim();

    return {
      charge,
      id: String((charge as any)?.id || ""),
      athleteId,
      athleteName: athleteNames[athleteId] || "",
      description: String((charge as any)?.description || "").trim(),
      dueAmount,
      paidAmount,
      state,
      overdue,
      dueDate: dueDate || null,
    };
  });

export const isRemindable = (row: InstallmentRow) => Boolean(row.id) && row.state !== "paid";

/** Lo stato della rata nelle parole del sistema (§9.4, «Denaro»). */
export const installmentStatus = (row: InstallmentRow): StatusSpec => {
  if (row.state === "paid") return MONEY_STATUS.paid;
  if (row.state === "partial") return MONEY_STATUS.partial;
  return MONEY_STATUS.pending;
};

export const RATE_VIEWS: ViewDef[] = [
  { id: "open", label: "Aperte", filters: { state: "open" }, builtIn: true },
  { id: "overdue", label: "Scadute", filters: { state: "overdue" }, builtIn: true, tone: "red" },
  { id: "paid", label: "Pagate", filters: { state: "paid" }, builtIn: true },
];

export const RATE_FILTERS: FilterDef<InstallmentRow>[] = [
  {
    id: "state",
    label: "Stato",
    type: "select",
    pinned: true,
    options: [
      { value: "open", label: "Aperte (in attesa o parziali)" },
      { value: "overdue", label: "Scadute" },
      { value: "pending", label: "In attesa" },
      { value: "partial", label: "Parziali" },
      { value: "paid", label: "Pagate" },
    ],
    apply: (row, value) => {
      if (typeof value !== "string" || !value) return true;
      if (value === "open") return row.state !== "paid";
      if (value === "overdue") return row.overdue;
      return row.state === value;
    },
  },
];

export const RATE_COLUMNS: ColumnDef<InstallmentRow>[] = [
  {
    id: "dueDate",
    header: "Scadenza",
    kind: "date",
    width: "110px",
    locked: true,
    cell: (row) => (row.dueDate ? formatDateShort(row.dueDate) : null),
    sortValue: (row) => row.dueDate || null,
    exportValue: (row) => row.dueDate || "",
  },
  {
    id: "athlete",
    header: "Atleta",
    kind: "identity",
    locked: true,
    minWidth: 160,
    width: 1.4,
    cell: (row) => (
      <span className="egw-ellipsis block font-brand text-[13px] font-semibold text-egw-ink">
        {row.athleteName || "—"}
      </span>
    ),
    sortValue: (row) => row.athleteName.toLowerCase() || null,
    title: (row) => row.athleteName || undefined,
    exportValue: (row) => row.athleteName,
  },
  {
    id: "description",
    header: "Descrizione",
    kind: "text",
    minWidth: 160,
    width: 1.6,
    cell: (row) => row.description || null,
    sortValue: (row) => row.description.toLowerCase() || null,
  },
  {
    id: "due",
    header: "Dovuto",
    kind: "amount",
    align: "right",
    width: "110px",
    cell: (row) => formatMoney(row.dueAmount),
    sortValue: (row) => row.dueAmount,
    exportValue: (row) => row.dueAmount,
  },
  {
    id: "paid",
    header: "Incassato",
    kind: "amount",
    align: "right",
    width: "110px",
    cell: (row) => <span className={row.paidAmount > 0 ? "text-egw-green" : undefined}>{formatMoney(row.paidAmount)}</span>,
    sortValue: (row) => row.paidAmount,
    exportValue: (row) => row.paidAmount,
  },
  {
    id: "state",
    header: "Stato",
    kind: "chips",
    minWidth: 150,
    cell: (row) => (
      <>
        <StatusPill status={installmentStatus(row)} size="sm" />
        {row.overdue ? <StatusPill status={MONEY_STATUS.overdue} size="sm" /> : null}
      </>
    ),
    sortValue: (row) => (row.overdue ? "0-overdue" : `1-${row.state}`),
    exportValue: (row) => [installmentStatus(row).label, row.overdue ? MONEY_STATUS.overdue.label : ""].filter(Boolean).join(" · "),
  },
];

export const rateSearch = {
  placeholder: "Cerca per atleta o descrizione",
  match: (row: InstallmentRow, query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [row.athleteName, row.description].some((value) => value.toLowerCase().includes(q));
  },
};
