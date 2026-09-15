"use client";

import * as React from "react";
import { Download, FileText, Pencil, Plus, Printer, RotateCcw, Trash2, Upload, Users } from "lucide-react";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, FilterDef, GridState, RowActionDef } from "@/components/web/datagrid/types";
import { Button } from "@/components/web/primitives/Button";
import { DataChip, IconChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { formatDateShort, formatInteger, joinMeta, MISSING } from "@/lib/web/format";
import type { DocumentTemplateSummary } from "@/lib/api/documents";
import {
  SUBJECT_LABELS,
  TEMPLATE_STATUS_LABELS,
  TEMPLATE_VIEWS,
  canGenerateInBulk,
  canProduceFilled,
  templateStatusSpec,
} from "@/components/modulistica/v2/modulistica-model";

/**
 * La griglia dei modelli di documento (guideline 07: una sola griglia per
 * ogni elenco). Sostituisce le card della scheda «Documenti / Template» e la
 * scheda «Ritirati» della V1, che qui e la vista «Ritirati».
 *
 * Le azioni si offrono solo dove lo stato le ammette (M1): le transizioni
 * sono `draft → active`, `active → retired | draft`, `retired → active`.
 * «Ritira» su una bozza faceva rispondere 400 al server, cioe prometteva un
 * gesto che non esiste; su una bozza non compare nessuna delle due — si
 * pubblica, e da li si ritira. Il compilato esce solo da un modello
 * pubblicato e non ritirato: l'etichetta dell'azione lo dice prima.
 */
export type TemplateGridHandlers = {
  onGenerate: (template: DocumentTemplateSummary) => void;
  onBulk: (template: DocumentTemplateSummary) => void;
  onEdit: (template: DocumentTemplateSummary) => void;
  onPublish: (template: DocumentTemplateSummary) => void;
  onChangeStatus: (template: DocumentTemplateSummary, status: "active" | "retired") => void;
  onDelete: (template: DocumentTemplateSummary) => void;
  onCreate: () => void;
};

/** La cella d'identita di un modello: chip icona + titolo + descrizione. */
function TemplateIdentity({ template, onOpen }: { template: DocumentTemplateSummary; onOpen?: () => void }) {
  const meta = template.description || `Parla di: ${SUBJECT_LABELS[template.subjectKind].toLowerCase()}`;
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <IconChip tone="blue" size={32} className="[&>svg]:h-4 [&>svg]:w-4">
        <FileText />
      </IconChip>
      <span className="min-w-0 flex-1">
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="egw-ellipsis block max-w-full text-left font-brand text-[12.5px] font-semibold text-egw-ink hover:text-egw-blue-700 hover:underline focus-visible:outline-none focus-visible:underline"
          >
            {template.title}
          </button>
        ) : (
          <span className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink">{template.title}</span>
        )}
        <span className="egw-ellipsis block font-brand text-[10px] leading-[1.4] text-[rgba(11,26,58,.5)]" title={meta}>
          {meta}
        </span>
      </span>
    </span>
  );
}

export function TemplatesGrid({
  templates,
  state,
  errorMessage,
  onRetry,
  canManage,
  handlers,
}: {
  templates: DocumentTemplateSummary[];
  state: GridState;
  errorMessage?: string | null;
  onRetry: () => void;
  canManage: boolean;
  handlers: TemplateGridHandlers;
}) {
  const columns = React.useMemo<ColumnDef<DocumentTemplateSummary>[]>(
    () => [
      {
        id: "identity",
        header: "Modello",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => <TemplateIdentity template={row} onOpen={canManage ? () => handlers.onEdit(row) : undefined} />,
        sortValue: (row) => row.title.toLowerCase(),
        exportValue: (row) => row.title,
        title: (row) => row.title,
      },
      {
        id: "subject",
        header: "Parla di",
        kind: "classification",
        cell: (row) => <DataChip size="sm">{SUBJECT_LABELS[row.subjectKind]}</DataChip>,
        sortValue: (row) => SUBJECT_LABELS[row.subjectKind],
        exportValue: (row) => SUBJECT_LABELS[row.subjectKind],
      },
      {
        id: "status",
        header: "Stato",
        kind: "status",
        cell: (row) => <StatusPill status={templateStatusSpec(row.status)} />,
        sortValue: (row) => TEMPLATE_STATUS_LABELS[row.status],
        exportValue: (row) => TEMPLATE_STATUS_LABELS[row.status],
      },
      {
        id: "version",
        header: "Versione pubblicata",
        kind: "number",
        cell: (row) =>
          row.publishedVersion > 0 ? (
            <span className="egw-num">
              {formatInteger(row.publishedVersion)}
              <span className="ml-1.5 font-normal text-egw-ink-62">del {row.publishedAt ? formatDateShort(row.publishedAt) : MISSING}</span>
            </span>
          ) : (
            <span className="text-egw-ink-62">Mai pubblicato</span>
          ),
        sortValue: (row) => row.publishedVersion,
        exportValue: (row) => (row.publishedVersion > 0 ? row.publishedVersion : "Mai pubblicato"),
      },
      {
        id: "unpublished",
        header: "Bozza",
        kind: "chips",
        cell: (row) =>
          row.hasUnpublishedChanges ? (
            <DataChip size="sm" tone="blue">
              Modifiche non pubblicate
            </DataChip>
          ) : null,
        sortValue: (row) => (row.hasUnpublishedChanges ? 1 : 0),
        exportValue: (row) => (row.hasUnpublishedChanges ? "Modifiche non pubblicate" : ""),
      },
      {
        id: "generatedCount",
        header: "Documenti prodotti",
        kind: "number",
        align: "right",
        cell: (row) => <span className="egw-num">{row.generatedCount > 0 ? formatInteger(row.generatedCount) : null}</span>,
        sortValue: (row) => row.generatedCount,
        exportValue: (row) => row.generatedCount,
      },
      {
        id: "updatedAt",
        header: "Aggiornato il",
        kind: "date",
        hidden: true,
        cell: (row) => (row.updatedAt ? <span className="egw-num">{formatDateShort(row.updatedAt)}</span> : null),
        sortValue: (row) => row.updatedAt || null,
        exportValue: (row) => row.updatedAt,
      },
      {
        id: "catalog",
        header: "Dal catalogo",
        kind: "text",
        hidden: true,
        cell: (row) => (row.catalogKey ? joinMeta(row.catalogKey, row.editorialOwner) : null),
        sortValue: (row) => row.catalogKey || null,
        exportValue: (row) => row.catalogKey,
      },
    ],
    [canManage, handlers],
  );

  const filters = React.useMemo<FilterDef<DocumentTemplateSummary>[]>(
    () => [
      {
        id: "status",
        label: "Stato",
        type: "multi",
        pinned: true,
        options: (["active", "draft", "retired"] as const).map((status) => ({
          value: status,
          label: TEMPLATE_STATUS_LABELS[status],
          count: templates.filter((row) => row.status === status).length,
          tone: status === "retired" ? "amber" : "neutral",
        })),
        apply: (row, value) => (Array.isArray(value) && value.length ? value.includes(row.status) : true),
      },
      {
        id: "subject",
        label: "Parla di",
        type: "select",
        options: (Object.keys(SUBJECT_LABELS) as Array<keyof typeof SUBJECT_LABELS>).map((subject) => ({ value: subject, label: SUBJECT_LABELS[subject] })),
        apply: (row, value) => (typeof value === "string" && value ? row.subjectKind === value : true),
      },
      {
        id: "unpublished",
        label: "Modifiche non pubblicate",
        type: "boolean",
        apply: (row, value) => (value === true ? row.hasUnpublishedChanges : true),
      },
    ],
    [templates],
  );

  const rowActions = React.useMemo<RowActionDef<DocumentTemplateSummary>[]>(
    () => [
      { id: "generate", label: "Genera documento", icon: <Download />, primary: true, hidden: (row) => !canProduceFilled(row), onClick: handlers.onGenerate },
      { id: "print-blank", label: "Stampa il modulo vuoto", icon: <Printer />, primary: true, hidden: (row) => canProduceFilled(row), onClick: handlers.onGenerate },
      { id: "bulk", label: "Genera per più atleti", icon: <Users />, hidden: (row) => !canGenerateInBulk(row), onClick: handlers.onBulk },
      { id: "edit", label: "Modifica il testo", icon: <Pencil />, hidden: () => !canManage, onClick: handlers.onEdit },
      { id: "publish", label: "Pubblica", icon: <Upload />, hidden: () => !canManage, onClick: handlers.onPublish },
      { id: "reactivate", label: "Riattiva", icon: <RotateCcw />, hidden: (row) => !canManage || row.status !== "retired", onClick: (row) => handlers.onChangeStatus(row, "active") },
      { id: "retire", label: "Ritira", icon: <RotateCcw />, hidden: (row) => !canManage || row.status !== "active", onClick: (row) => handlers.onChangeStatus(row, "retired") },
      { id: "delete", label: "Elimina", icon: <Trash2 />, tone: "danger", hidden: () => !canManage, onClick: handlers.onDelete },
    ],
    [canManage, handlers],
  );

  const search = React.useMemo(
    () => ({
      placeholder: "Cerca per titolo o descrizione",
      match: (row: DocumentTemplateSummary, query: string) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return [row.title, row.description, SUBJECT_LABELS[row.subjectKind]].some((v) => String(v || "").toLowerCase().includes(q));
      },
    }),
    [],
  );

  return (
    <DataGrid<DocumentTemplateSummary>
      module="modulistica-modelli"
      aria-label="Modelli di documento del club"
      rows={templates}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.title}
      columns={columns}
      filters={filters}
      views={TEMPLATE_VIEWS}
      search={search}
      defaultSort={{ columnId: "identity", direction: "asc" }}
      rowActions={rowActions}
      canSelect={false}
      state={state}
      errorMessage={errorMessage}
      onRetry={onRetry}
      noun={{ singular: "modello", plural: "modelli" }}
      empty={{
        icon: <FileText />,
        title: "Nessun modello salvato",
        description: "Crea un nuovo documento e modificalo direttamente nel foglio visuale, senza scrivere HTML.",
        primary: canManage ? (
          <Button variant="primary" size="sm" icon={<Plus />} onClick={handlers.onCreate}>
            Nuovo documento
          </Button>
        ) : null,
      }}
    />
  );
}
