"use client";

import * as React from "react";
import { getAccessRoleLabel } from "@/lib/access-roles";
import { CellChips } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, FilterDef, FilterState, ViewDef } from "@/components/web/datagrid/types";
import { Button } from "@/components/web/primitives/Button";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { formatDateTime, formatInteger, joinMeta, MISSING } from "@/lib/web/format";
import {
  AUDIT_OUTCOME_LABELS,
  auditOutcomeLabel,
  auditOutcomeSpec,
  metadataEntries,
  type AuditEvent,
} from "@/components/audit/v2/audit-model";

/**
 * La griglia del registro (Web V2). **La griglia mostra i filtri, il server
 * li applica**: le righe in mano sono una pagina di cinquanta, quindi i
 * predicati qui tornano sempre `true` e la pagina traduce lo stato dei
 * filtri nella query di `GET /api/v1/audit` (`auditFiltersToQuery`). E lo
 * stesso contratto della prima nota.
 */
export const AUDIT_FILTER_IDS = {
  area: "area",
  outcome: "outcome",
  period: "period",
  denied: "denied",
} as const;

export const AUDIT_PAGE_SIZE = 50;

/* Il predicato non filtra: filtra il servizio, sugli indici. */
const serverSide = () => true;

const asText = (value: unknown) => (typeof value === "string" ? value : "");

/** Dallo stato dei filtri della griglia ai parametri della rotta. */
export const auditFiltersToQuery = (state: FilterState): { area: string; outcome: string; from: string; to: string; denied: boolean } => {
  const period = state[AUDIT_FILTER_IDS.period];
  const range = period && typeof period === "object" && !Array.isArray(period) ? period : { from: undefined, to: undefined };
  return {
    area: asText(state[AUDIT_FILTER_IDS.area]),
    outcome: asText(state[AUDIT_FILTER_IDS.outcome]),
    from: String(range.from || ""),
    to: String(range.to || ""),
    denied: state[AUDIT_FILTER_IDS.denied] === true,
  };
};

export const buildAuditFilters = (areas: readonly string[]): FilterDef<AuditEvent>[] => [
  {
    id: AUDIT_FILTER_IDS.area,
    label: "Area",
    type: "select",
    pinned: true,
    options: areas.map((area) => ({ value: area, label: area })),
    apply: serverSide,
  },
  {
    id: AUDIT_FILTER_IDS.outcome,
    label: "Esito",
    type: "select",
    pinned: true,
    options: (Object.keys(AUDIT_OUTCOME_LABELS) as Array<keyof typeof AUDIT_OUTCOME_LABELS>).map((outcome) => ({
      value: outcome,
      label: AUDIT_OUTCOME_LABELS[outcome],
      tone: outcome === "denied" ? "red" : outcome === "failure" ? "amber" : "green",
    })),
    apply: serverSide,
  },
  {
    id: AUDIT_FILTER_IDS.period,
    label: "Periodo",
    type: "date-range",
    pinned: true,
    apply: serverSide,
  },
  {
    id: AUDIT_FILTER_IDS.denied,
    label: "Solo dinieghi",
    type: "boolean",
    apply: serverSide,
  },
];

export const AUDIT_VIEWS: ViewDef[] = [
  { id: "denied", label: "Negate", filters: { [AUDIT_FILTER_IDS.denied]: true }, builtIn: true, tone: "red" },
  { id: "failed", label: "Fallite", filters: { [AUDIT_FILTER_IDS.outcome]: "failure" }, builtIn: true, tone: "amber" },
];

export const buildAuditColumns = (onOpen: (row: AuditEvent) => void): ColumnDef<AuditEvent>[] => [
  {
    id: "when",
    header: "Quando",
    kind: "date",
    locked: true,
    width: 1.1,
    minWidth: 150,
    cell: (row) => (
      <button
        type="button"
        onClick={() => onOpen(row)}
        className="egw-num egw-ellipsis block max-w-full text-left font-brand text-[12.5px] font-semibold text-egw-ink hover:text-egw-blue-700 hover:underline focus-visible:outline-none focus-visible:underline"
      >
        {formatDateTime(row.created_at)}
      </button>
    ),
    sortValue: (row) => row.created_at,
    exportValue: (row) => row.created_at,
  },
  {
    id: "outcome",
    header: "Esito",
    kind: "status",
    width: 0.8,
    cell: (row) => <StatusPill status={auditOutcomeSpec(row.outcome)} />,
    sortValue: (row) => row.outcome,
    exportValue: (row) => auditOutcomeLabel(row.outcome),
  },
  {
    id: "action",
    header: "Azione",
    kind: "text",
    width: 1.4,
    cell: (row) => <span className="font-mono text-[11.5px]">{row.action}</span>,
    sortValue: (row) => row.action,
    title: (row) => row.action,
  },
  {
    id: "actor",
    header: "Chi",
    kind: "identity",
    width: 1.6,
    cell: (row) => (
      <span className="min-w-0">
        <span className="egw-ellipsis block font-brand text-[12.5px] font-medium text-egw-ink">{row.actor_email || MISSING}</span>
        {row.actor_role ? <span className="egw-ellipsis block font-brand text-[10px] text-[rgba(11,26,58,.5)]">{getAccessRoleLabel(row.actor_role)}</span> : null}
      </span>
    ),
    sortValue: (row) => (row.actor_email || "").toLowerCase() || null,
    exportValue: (row) => joinMeta(row.actor_email, row.actor_role ? getAccessRoleLabel(row.actor_role) : null),
    title: (row) => joinMeta(row.actor_email, row.actor_role ? getAccessRoleLabel(row.actor_role) : null) || undefined,
  },
  {
    id: "resource",
    header: "Risorsa",
    kind: "classification",
    width: 1.2,
    cell: (row) => joinMeta(row.resource, row.resource_id) || null,
    sortValue: (row) => row.resource || null,
    exportValue: (row) => joinMeta(row.resource, row.resource_id),
    title: (row) => joinMeta(row.resource, row.resource_id) || undefined,
  },
  {
    id: "metadata",
    header: "Dettagli",
    kind: "chips",
    width: 1.6,
    cell: (row) => <CellChips items={metadataEntries(row.metadata).map((entry) => ({ label: `${entry.key}: ${entry.value}` }))} />,
    exportValue: (row) =>
      metadataEntries(row.metadata)
        .map((entry) => `${entry.key}: ${entry.value}`)
        .join(" · "),
  },
  {
    id: "ip",
    header: "IP",
    kind: "text",
    hidden: true,
    width: 0.9,
    cell: (row) => <span className="egw-num">{row.ip}</span>,
    sortValue: (row) => row.ip || null,
    exportValue: (row) => row.ip,
  },
];

/* ── Paginazione del server ──────────────────────────────────────────────── */

/**
 * «Operazioni da {primo} a {ultimo} di {total}», «Precedenti» / «Successive».
 *
 * Copia del pager della prima nota (`PrimaNotaPager`): la griglia sa
 * paginare cio che ha in mano, qui in mano c'e una pagina del servizio.
 * Candidato alle fondamenta come `ServerPager`.
 */
export function AuditPager({
  offset,
  limit,
  count,
  total,
  busy,
  onPageChange,
}: {
  offset: number;
  limit: number;
  count: number;
  total: number;
  busy: boolean;
  onPageChange: (nextOffset: number) => void;
}) {
  if (count === 0) return null;
  const primo = offset + 1;
  const ultimo = offset + count;
  return (
    <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-3 border-t border-egw-hairline bg-egw-page-100 px-4 py-1.5 font-brand text-[12px] text-egw-ink-62">
      <span>
        Operazioni da <strong className="egw-num text-egw-ink">{formatInteger(primo)}</strong> a <strong className="egw-num text-egw-ink">{formatInteger(ultimo)}</strong> di{" "}
        <strong className="egw-num text-egw-ink">{formatInteger(total)}</strong>
      </span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={offset <= 0 || busy} onClick={() => onPageChange(Math.max(0, offset - limit))}>
          Precedenti
        </Button>
        <Button variant="secondary" size="sm" disabled={ultimo >= total || busy} onClick={() => onPageChange(offset + limit)}>
          Successive
        </Button>
      </div>
    </div>
  );
}
