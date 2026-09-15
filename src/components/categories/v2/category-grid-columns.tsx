"use client";

import * as React from "react";
import type { ColumnDef } from "@/components/web/datagrid/types";
import { CellChips } from "@/components/web/datagrid/DataGrid";
import { formatInteger, joinMeta, MISSING } from "@/lib/web/format";
import { CATEGORY_COLOR_OPTIONS, CategoryColorDot } from "@/components/categories/v2/category-editor-drawer";
import type { CategoryRow } from "@/components/categories/v2/category-grid-model";

/** L'etichetta italiana del colore (Blu, Verde…) o «—» se non e fra le otto. */
const colorLabel = (color: string) =>
  CATEGORY_COLOR_OPTIONS.find((option) => option.value === color)?.label ?? MISSING;

/**
 * Le colonne della griglia Categorie (guideline 07 §7.4): identita a
 * sinistra — il punto nel colore della categoria, il nome che apre
 * l'ispettore, la descrizione come riga meta — poi gli anni di nascita, le
 * sedi dei gruppi operativi (solo multi-sede, ADR-0038), i conteggi che la
 * card V1 mostrava (atleti, allenatori, allenamenti settimanali) e la
 * posizione nell'ordine del club (D-INT-9), che e l'ordinamento di partenza.
 * Le categorie compatibili stanno fra le colonne nascoste.
 */
export function CategoryIdentityCell({
  row,
  onOpen,
}: {
  row: CategoryRow;
  onOpen?: (row: CategoryRow) => void;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-egw-chip border border-egw-hairline bg-egw-page-100"
        aria-hidden
      >
        <CategoryColorDot color={row.color} size={12} />
      </span>
      <span className="flex min-w-0 flex-col">
        {onOpen ? (
          <button
            type="button"
            onClick={() => onOpen(row)}
            className="egw-ellipsis block max-w-full text-left font-brand text-[12.5px] font-semibold text-egw-ink hover:text-egw-blue-700 hover:underline focus-visible:outline-none focus-visible:underline"
          >
            {row.name}
          </button>
        ) : (
          <span className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink">{row.name}</span>
        )}
        <span className="egw-ellipsis block font-brand text-[10px] text-[rgba(11,26,58,.5)]" title={row.sport}>
          {row.sport}
        </span>
      </span>
    </span>
  );
}

export const buildCategoryColumns = ({
  multiSite,
  onOpen,
}: {
  multiSite: boolean;
  onOpen?: (row: CategoryRow) => void;
}): ColumnDef<CategoryRow>[] => {
  const columns: ColumnDef<CategoryRow>[] = [
    {
      id: "categoria",
      header: "Categoria",
      label: "Categoria",
      kind: "identity",
      locked: true,
      width: 2,
      minWidth: 220,
      sortValue: (row) => row.name.toLowerCase(),
      exportValue: (row) => row.name,
      title: (row) => joinMeta(row.name, row.sport),
      cell: (row) => <CategoryIdentityCell row={row} onOpen={onOpen} />,
    },
    {
      id: "anni",
      header: "Anni di nascita",
      label: "Anni di nascita",
      kind: "classification",
      minWidth: 150,
      sortValue: (row) => row.birthYearFrom ?? null,
      exportValue: (row) => row.birthYearsLabel,
      title: (row) => row.birthYearsLabel,
      cell: (row) => <span className="egw-num">{row.birthYearsLabel}</span>,
    },
  ];

  if (multiSite) {
    columns.push({
      id: "sedi",
      header: "Sedi",
      label: "Sedi",
      kind: "chips",
      minWidth: 150,
      sortValue: (row) => row.siteNames.join(", "),
      exportValue: (row) => row.siteNames.join(", "),
      title: (row) => (row.siteNames.length ? row.siteNames.join(", ") : "Nessuna sede: una squadra sola"),
      cell: (row) => <CellChips items={row.siteNames.map((label) => ({ label }))} />,
    });
  }

  columns.push(
    {
      id: "atleti",
      header: "Atleti",
      label: "Atleti",
      kind: "number",
      align: "right",
      width: 0.7,
      minWidth: 84,
      sortValue: (row) => row.athletesCount,
      exportValue: (row) => row.athletesCount,
      cell: (row) => (
        <span className={row.athletesCount === 0 ? "egw-num text-egw-ink-42" : "egw-num font-bold"}>
          {formatInteger(row.athletesCount)}
        </span>
      ),
    },
    {
      id: "allenatori",
      header: "Allenatori",
      label: "Allenatori",
      kind: "chips",
      minWidth: 160,
      sortValue: (row) => row.trainerNames.join(", ").toLowerCase(),
      exportValue: (row) => row.trainerNames.join(", "),
      title: (row) => (row.trainerNames.length ? row.trainerNames.join(", ") : "Nessun allenatore assegnato"),
      cell: (row) => <CellChips items={row.trainerNames.map((label) => ({ label }))} />,
    },
    {
      id: "allenamenti",
      header: "Allenamenti a settimana",
      label: "Allenamenti a settimana",
      kind: "number",
      align: "right",
      width: 0.8,
      minWidth: 96,
      sortValue: (row) => row.trainingsPerWeek,
      exportValue: (row) => row.trainingsPerWeek,
      cell: (row) => (
        <span className={row.trainingsPerWeek === 0 ? "egw-num text-egw-ink-42" : "egw-num"}>
          {formatInteger(row.trainingsPerWeek)}
        </span>
      ),
    },
    {
      id: "ordine",
      header: "Ordine",
      label: "Ordine del club",
      kind: "number",
      align: "right",
      width: "72px",
      sortValue: (row) => row.posizione,
      exportValue: (row) => row.posizione,
      cell: (row) => <span className="egw-num text-egw-ink-62">{formatInteger(row.posizione)}</span>,
    },
    {
      id: "compatibili",
      header: "Categorie compatibili",
      label: "Categorie compatibili",
      kind: "chips",
      hidden: true,
      minWidth: 170,
      sortValue: (row) => row.compatibleCategoryNames.join(", ").toLowerCase(),
      exportValue: (row) => row.compatibleCategoryNames.join(", "),
      title: (row) => row.compatibleCategoryNames.join(", ") || undefined,
      cell: (row) => <CellChips items={row.compatibleCategoryNames.map((label) => ({ label }))} />,
    },
    {
      id: "colore",
      header: "Colore",
      label: "Colore",
      kind: "text",
      hidden: true,
      width: "88px",
      sortValue: (row) => colorLabel(row.color),
      exportValue: (row) => colorLabel(row.color),
      cell: (row) => (
        <span className="flex items-center gap-1.5">
          <CategoryColorDot color={row.color} />
          <span className="font-brand text-[12px] text-egw-ink-72">{colorLabel(row.color)}</span>
        </span>
      ),
    },
  );

  return columns;
};
