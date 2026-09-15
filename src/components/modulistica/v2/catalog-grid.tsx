"use client";

import * as React from "react";
import { BookOpen, Plus } from "lucide-react";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, FilterDef, GridState, RowActionDef } from "@/components/web/datagrid/types";
import { DataChip, IconChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { InfoCard } from "@/components/web/page/Cards";
import { formatDateShort, MISSING } from "@/lib/web/format";
import type { DocumentCatalogEntry } from "@/lib/api/documents";
import { CATALOG_ENTRY_STATUS, SUBJECT_LABELS, catalogClassLabel } from "@/components/modulistica/v2/modulistica-model";

/**
 * Il catalogo dei modelli di EasyGame (guideline 07 per la forma; ADR-0092
 * per le tre cose che non si tacciono): di ogni voce si vede di che
 * **classe** e, **chi risponde** del testo, **quando** e stato riletto
 * l'ultima volta. Un modello che esce con il timbro del presidente e
 * scritto da noi, e un club ha diritto di sapere da quanto tempo nessuno lo
 * rilegge prima di firmarlo.
 *
 * Non e un elenco di modelli del club: e cio che il club **puo** adottare.
 * Adottarne uno ne crea una copia del club, gia pubblicata; da quel momento
 * si modifica liberamente e il catalogo non la tocca piu. Le voci gia
 * adottate restano in elenco, dette come tali.
 */
export function CatalogGrid({
  entries,
  state,
  onRetry,
  adoptingKey,
  onAdopt,
}: {
  entries: DocumentCatalogEntry[];
  state: GridState;
  onRetry: () => void;
  adoptingKey: string;
  onAdopt: (entry: DocumentCatalogEntry) => void;
}) {
  const columns = React.useMemo<ColumnDef<DocumentCatalogEntry>[]>(
    () => [
      {
        id: "identity",
        header: "Modello",
        kind: "identity",
        locked: true,
        width: 2.2,
        cell: (row) => (
          <span className="flex min-w-0 items-center gap-2.5">
            <IconChip tone="blue" size={32} className="[&>svg]:h-4 [&>svg]:w-4">
              <BookOpen />
            </IconChip>
            <span className="min-w-0 flex-1">
              <span className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink">{row.title}</span>
              <span className="egw-ellipsis block font-brand text-[10px] leading-[1.4] text-[rgba(11,26,58,.5)]" title={row.description}>
                {row.description}
              </span>
            </span>
          </span>
        ),
        sortValue: (row) => row.title.toLowerCase(),
        exportValue: (row) => row.title,
        title: (row) => row.description,
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
        id: "class",
        header: "Classe redazionale",
        kind: "classification",
        width: 1.4,
        cell: (row) => (
          <DataChip size="sm" tone="blue" title={catalogClassLabel(row.catalogClass)}>
            {catalogClassLabel(row.catalogClass)}
          </DataChip>
        ),
        sortValue: (row) => row.catalogClass,
        exportValue: (row) => catalogClassLabel(row.catalogClass),
      },
      {
        id: "owner",
        header: "Del testo risponde",
        kind: "text",
        width: 1.3,
        cell: (row) => row.editorialOwner,
        sortValue: (row) => row.editorialOwner.toLowerCase(),
        title: (row) => row.editorialOwner,
      },
      {
        id: "reviewed",
        header: "Riletto il",
        kind: "date",
        cell: (row) => <span className="egw-num">{row.lastReviewedAt ? formatDateShort(row.lastReviewedAt) : MISSING}</span>,
        sortValue: (row) => row.lastReviewedAt || null,
        exportValue: (row) => row.lastReviewedAt,
      },
      {
        id: "adopted",
        header: "Nel club",
        kind: "status",
        cell: (row) => <StatusPill status={row.adopted ? CATALOG_ENTRY_STATUS.adopted : CATALOG_ENTRY_STATUS.available} />,
        sortValue: (row) => (row.adopted ? 1 : 0),
        exportValue: (row) => (row.adopted ? "Già fra i modelli del club" : "Disponibile"),
      },
    ],
    [],
  );

  const filters = React.useMemo<FilterDef<DocumentCatalogEntry>[]>(
    () => [
      {
        id: "adopted",
        label: "Nel club",
        type: "select",
        pinned: true,
        options: [
          { value: "available", label: "Da adottare", count: entries.filter((e) => !e.adopted).length },
          { value: "adopted", label: "Già adottati", count: entries.filter((e) => e.adopted).length, tone: "green" },
        ],
        apply: (row, value) => (value === "adopted" ? row.adopted : value === "available" ? !row.adopted : true),
      },
    ],
    [entries],
  );

  const rowActions = React.useMemo<RowActionDef<DocumentCatalogEntry>[]>(
    () => [{ id: "adopt", label: "Adotta", icon: <Plus />, primary: true, hidden: (row) => row.adopted || Boolean(adoptingKey), onClick: onAdopt }],
    [adoptingKey, onAdopt],
  );

  const adoptable = entries.filter((entry) => !entry.adopted).length;

  return (
    <div className="flex flex-col gap-[18px]">
      <InfoCard eyebrow="Catalogo dei modelli">
        Modelli scritti da EasyGame che il club può adottare. Adottarne uno ne crea una <strong>copia del club</strong>, già
        pubblicata: da quel momento si modifica liberamente e il catalogo non la tocca più.
        {entries.length > 0 && adoptable === 0 ? " Il club ha già adottato tutto quello che il catalogo distribuisce." : ""}
      </InfoCard>
      <DataGrid<DocumentCatalogEntry>
        module="modulistica-catalogo"
        aria-label="Catalogo dei modelli di documento"
        rows={entries}
        getRowId={(row) => row.key}
        rowLabel={(row) => row.title}
        columns={columns}
        filters={filters}
        defaultSort={{ columnId: "identity", direction: "asc" }}
        rowActions={rowActions}
        canSelect={false}
        state={state}
        onRetry={onRetry}
        noun={{ singular: "modello", plural: "modelli" }}
        hideFooter={entries.length <= 25}
        empty={{ icon: <BookOpen />, title: "Nessun modello disponibile nel catalogo", description: "Le voci che EasyGame distribuisce compaiono qui." }}
      />
    </div>
  );
}
