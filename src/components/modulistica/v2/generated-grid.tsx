"use client";

import * as React from "react";
import { ExternalLink, FileCheck } from "lucide-react";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, FilterDef, GridState, RowActionDef } from "@/components/web/datagrid/types";
import { DataChip, IconChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { InfoCard } from "@/components/web/page/Cards";
import { formatDateShort, formatInteger, joinMeta } from "@/lib/web/format";
import type { GeneratedDocumentSummary } from "@/lib/api/documents";
import { GENERATED_STATUS_LABELS, generatedDocumentHref, generatedStatusLabel, generatedStatusSpec } from "@/components/modulistica/v2/modulistica-model";

/**
 * I documenti generati: cio che il club ha prodotto. Aprirne uno lo mostra
 * **com'era**: non viene rigenerato, perche modificare un modello non cambia
 * un documento gia consegnato — il link e la resa conservata
 * (`?format=html`), la stessa della V1.
 */
export function GeneratedGrid({
  documents,
  state,
  errorMessage,
  onRetry,
}: {
  documents: GeneratedDocumentSummary[];
  state: GridState;
  errorMessage?: string | null;
  onRetry: () => void;
}) {
  const columns = React.useMemo<ColumnDef<GeneratedDocumentSummary>[]>(
    () => [
      {
        id: "identity",
        header: "Modello",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => (
          <span className="flex min-w-0 items-center gap-2.5">
            <IconChip tone="green" size={32} className="[&>svg]:h-4 [&>svg]:w-4">
              <FileCheck />
            </IconChip>
            <span className="min-w-0 flex-1">
              <a
                href={generatedDocumentHref(row.id)}
                target="_blank"
                rel="noreferrer"
                className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink hover:text-egw-blue-700 hover:underline focus-visible:outline-none focus-visible:underline"
              >
                {row.templateTitle}
              </a>
              <span className="egw-ellipsis block font-brand text-[10px] leading-[1.4] text-[rgba(11,26,58,.5)]">
                {joinMeta(`versione ${row.version}`, row.protocolNumber ? `prot. ${row.protocolNumber}` : null)}
              </span>
            </span>
          </span>
        ),
        sortValue: (row) => row.templateTitle.toLowerCase(),
        exportValue: (row) => row.templateTitle,
        title: (row) => row.templateTitle,
      },
      {
        id: "version",
        header: "Versione",
        kind: "number",
        cell: (row) => <span className="egw-num">v{formatInteger(row.version)}</span>,
        sortValue: (row) => row.version,
        exportValue: (row) => row.version,
      },
      {
        id: "subject",
        header: "Soggetto",
        kind: "text",
        width: 1.3,
        cell: (row) => row.subjectLabel || row.subjectKind,
        sortValue: (row) => (row.subjectLabel || row.subjectKind).toLowerCase(),
        exportValue: (row) => row.subjectLabel || row.subjectKind,
        title: (row) => row.subjectLabel || row.subjectKind,
      },
      {
        id: "generatedAt",
        header: "Data",
        kind: "date",
        cell: (row) => <span className="egw-num">{formatDateShort(row.generatedAt)}</span>,
        sortValue: (row) => row.generatedAt,
        exportValue: (row) => row.generatedAt,
      },
      {
        id: "status",
        header: "Stato",
        kind: "status",
        cell: (row) => <StatusPill status={generatedStatusSpec(row.status)} />,
        sortValue: (row) => generatedStatusLabel(row.status),
        exportValue: (row) => generatedStatusLabel(row.status),
      },
      {
        id: "gaps",
        header: "Campi bianchi",
        kind: "chips",
        hidden: true,
        cell: (row) => {
          const n = (row.missing?.length || 0) + (row.unresolved?.length || 0);
          return n ? (
            <DataChip size="sm" tone="amber">
              {formatInteger(n)} da riempire a mano
            </DataChip>
          ) : null;
        },
        sortValue: (row) => (row.missing?.length || 0) + (row.unresolved?.length || 0),
        exportValue: (row) => (row.missing?.length || 0) + (row.unresolved?.length || 0),
      },
      {
        id: "batch",
        header: "Lotto",
        kind: "text",
        hidden: true,
        cell: (row) => row.batchId,
        sortValue: (row) => row.batchId || null,
        exportValue: (row) => row.batchId,
      },
    ],
    [],
  );

  const filters = React.useMemo<FilterDef<GeneratedDocumentSummary>[]>(
    () => [
      {
        id: "status",
        label: "Stato",
        type: "multi",
        pinned: true,
        options: Object.keys(GENERATED_STATUS_LABELS).map((status) => ({
          value: status,
          label: GENERATED_STATUS_LABELS[status],
          count: documents.filter((row) => row.status === status).length,
        })),
        apply: (row, value) => (Array.isArray(value) && value.length ? value.includes(row.status) : true),
      },
      {
        id: "template",
        label: "Modello",
        type: "select",
        options: Array.from(new Map(documents.map((row) => [row.templateId, row.templateTitle])).entries()).map(([value, label]) => ({ value, label })),
        apply: (row, value) => (typeof value === "string" && value ? row.templateId === value : true),
      },
    ],
    [documents],
  );

  const rowActions = React.useMemo<RowActionDef<GeneratedDocumentSummary>[]>(
    () => [{ id: "open", label: "Apri", icon: <ExternalLink />, primary: true, onClick: (row) => window.open(generatedDocumentHref(row.id), "_blank", "noopener,noreferrer") }],
    [],
  );

  const search = React.useMemo(
    () => ({
      placeholder: "Cerca per modello, soggetto o protocollo",
      match: (row: GeneratedDocumentSummary, query: string) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return [row.templateTitle, row.subjectLabel, row.subjectKind, row.protocolNumber].some((v) => String(v || "").toLowerCase().includes(q));
      },
    }),
    [],
  );

  return (
    <div className="flex flex-col gap-[18px]">
      <InfoCard eyebrow="Documenti generati">
        Ciò che il club ha prodotto. Aprirne uno lo mostra <strong>com&apos;era</strong>: non viene rigenerato, perché modificare un
        modello non cambia un documento già consegnato.
      </InfoCard>
      <DataGrid<GeneratedDocumentSummary>
        module="modulistica-generati"
        aria-label="Documenti generati dal club"
        rows={documents}
        getRowId={(row) => row.id}
        rowLabel={(row) => joinMeta(row.templateTitle, row.subjectLabel)}
        columns={columns}
        filters={filters}
        search={search}
        defaultSort={{ columnId: "generatedAt", direction: "desc" }}
        rowActions={rowActions}
        canSelect={false}
        state={state}
        errorMessage={errorMessage}
        onRetry={onRetry}
        noun={{ singular: "documento", plural: "documenti" }}
        empty={{
          icon: <FileCheck />,
          title: "Nessun documento generato",
          description: "Parti da un modello pubblicato e usa «Genera compilato».",
        }}
      />
    </div>
  );
}
