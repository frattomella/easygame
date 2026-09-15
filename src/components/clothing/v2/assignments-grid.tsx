"use client";

import * as React from "react";
import { PackageCheck, Pencil, RefreshCw, Shirt, Trash2 } from "lucide-react";
import { CellChips, DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, FilterDef, RowActionDef, ViewDef } from "@/components/web/datagrid/types";
import { Button } from "@/components/web/primitives/Button";
import { IdentityCell } from "@/components/web/primitives/Identity";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { assignmentStatusLabels, type ClothingAssignment, type ClothingAssignmentSource, type ClothingAssignmentStatus, type InventoryStock } from "@/lib/clothing-inventory-utils";
import { getKitDeliveryProgress } from "@/lib/clothing-delivery";
import { formatDateShort } from "@/lib/web/format";
import { KitDeliveryStatePill } from "@/components/clothing/v2/kit-delivery-drawer";
import {
  ASSIGNMENT_STATUS,
  assignmentNumberLabels,
  athleteLabel,
  getAthleteCategoryLabel,
  getAthletePrimaryCategoryId,
  SOURCE_LABELS,
} from "@/components/clothing/v2/clothing-model";

/**
 * La griglia delle assegnazioni (area «Assegnazioni»). Solo
 * `assigneeType === "athlete"`, dalla piu recente. Lo stato e quello
 * **derivato** dagli articoli (`KitDeliveryStatePill`) quando ce ne sono,
 * altrimenti lo stato scritto dell'assegnazione.
 */
const SOURCE_OPTIONS = (Object.keys(SOURCE_LABELS) as ClothingAssignmentSource[]).map((value) => ({ value, label: SOURCE_LABELS[value] }));
const STATUS_OPTIONS = (Object.keys(assignmentStatusLabels) as ClothingAssignmentStatus[]).map((value) => ({ value, label: assignmentStatusLabels[value] }));
const DELIVERY_OPTIONS = [
  { value: "to_prepare", label: "Da preparare" },
  { value: "partial", label: "Parziale" },
  { value: "completed", label: "Completato" },
];

const ASSIGNMENT_VIEWS: ViewDef[] = [
  { id: "to-deliver", label: "Da consegnare", filters: { delivery: ["to_prepare", "partial"] }, builtIn: true, tone: "amber" },
  { id: "delivered", label: "Consegnate", filters: { delivery: "completed" }, builtIn: true },
  { id: "supplier", label: "Da fornitore", filters: { source: "supplier_order" }, builtIn: true },
];

const deliveryKey = (assignment: ClothingAssignment) => (assignment.items.length ? getKitDeliveryProgress(assignment).state : assignment.status === "delivered" ? "completed" : "to_prepare");

export function AssignmentsGrid({
  assignments,
  athletesById,
  categories = [],
  categoryLabel,
  stockById,
  canManage,
  loading,
  onDeliveries,
  onEdit,
  onChangeStatus,
  onDelete,
  onCreate,
}: {
  assignments: ClothingAssignment[];
  athletesById: Map<string, any>;
  /** Il catalogo del club: la categoria si legge per identita (ADR-0185). */
  categories?: readonly { id?: string | null; name?: string | null }[];
  /** Come si scrive una categoria (ADR-0185): lo dice la pagina con l'indice canonico. */
  categoryLabel?: (reference: { categoryId: string; categoryName: string }) => string;
  stockById: Map<string, InventoryStock>;
  canManage: boolean;
  loading: boolean;
  onDeliveries: (assignment: ClothingAssignment) => void;
  onEdit: (assignment: ClothingAssignment) => void;
  onChangeStatus: (assignment: ClothingAssignment) => void;
  onDelete: (assignment: ClothingAssignment) => void;
  onCreate: () => void;
}) {
  const athleteOf = React.useCallback((row: ClothingAssignment) => athletesById.get(row.athleteId), [athletesById]);

  const columns = React.useMemo<ColumnDef<ClothingAssignment>[]>(
    () => [
      {
        id: "athlete",
        header: "Atleta",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => <IdentityCell name={athleteLabel(athleteOf(row))} round meta={getAthleteCategoryLabel(athleteOf(row), categories, categoryLabel)} onClick={canManage ? () => onEdit(row) : undefined} />,
        sortValue: (row) => athleteLabel(athleteOf(row)).toLowerCase(),
        exportValue: (row) => athleteLabel(athleteOf(row)),
        title: (row) => athleteLabel(athleteOf(row)),
      },
      {
        id: "date",
        header: "Data",
        kind: "date",
        width: "110px",
        cell: (row) => formatDateShort(row.createdAt),
        sortValue: (row) => row.createdAt || null,
        exportValue: (row) => row.createdAt,
      },
      {
        id: "category",
        header: "Categoria",
        kind: "classification",
        hidden: true,
        cell: (row) => getAthleteCategoryLabel(athleteOf(row), categories, categoryLabel),
        sortValue: (row) => getAthleteCategoryLabel(athleteOf(row), categories, categoryLabel).toLowerCase(),
      },
      {
        id: "kit",
        header: "Kit/Articoli",
        kind: "chips",
        width: 2,
        minWidth: 200,
        cell: (row) => (
          <>
            <span className="egw-ellipsis shrink-0 font-brand text-[12.5px] font-semibold text-egw-ink">{row.kitName || "Articoli"}</span>
            <CellChips items={row.items.map((item) => ({ label: item.name }))} />
          </>
        ),
        sortValue: (row) => (row.kitName || "Articoli").toLowerCase(),
        exportValue: (row) => [row.kitName || "Articoli", ...row.items.map((item) => item.name)].join(" · "),
        title: (row) => [row.kitName || "Articoli", ...row.items.map((item) => item.name)].join(" · "),
      },
      { id: "source", header: "Origine", kind: "classification", cell: (row) => SOURCE_LABELS[row.source] || "Manuale", sortValue: (row) => SOURCE_LABELS[row.source] || "Manuale" },
      {
        id: "status",
        header: "Stato",
        kind: "status",
        width: 1.4,
        minWidth: 170,
        cell: (row) => (row.items.length ? <KitDeliveryStatePill assignment={row} /> : <StatusPill status={ASSIGNMENT_STATUS[row.status]} />),
        sortValue: (row) => (row.items.length ? getKitDeliveryProgress(row).state : row.status),
        exportValue: (row) => (row.items.length ? getKitDeliveryProgress(row).label : assignmentStatusLabels[row.status]),
      },
      {
        id: "numbers",
        header: "Numero",
        kind: "chips",
        cell: (row) => (
          <CellChips
            items={assignmentNumberLabels(row, stockById).map((number) => ({ label: number.label === "Senza numero" ? number.label : `n. ${number.label}` }))}
          />
        ),
        sortValue: (row) => assignmentNumberLabels(row, stockById).map((n) => n.label).join(", "),
        exportValue: (row) => assignmentNumberLabels(row, stockById).map((n) => n.label).join(", "),
      },
      {
        id: "rawStatus",
        header: "Stato registrato",
        kind: "status",
        hidden: true,
        cell: (row) => <StatusPill status={ASSIGNMENT_STATUS[row.status]} />,
        sortValue: (row) => assignmentStatusLabels[row.status],
        exportValue: (row) => assignmentStatusLabels[row.status],
      },
      { id: "notes", header: "Note", kind: "text", hidden: true, cell: (row) => row.notes, sortValue: (row) => row.notes || null },
    ],
    [athleteOf, canManage, categories, categoryLabel, onEdit, stockById],
  );

  const filters = React.useMemo<FilterDef<ClothingAssignment>[]>(
    () => [
      {
        id: "delivery",
        label: "Consegna",
        type: "multi",
        pinned: true,
        options: DELIVERY_OPTIONS.map((option) => ({ ...option, count: assignments.filter((row) => deliveryKey(row) === option.value).length })),
        apply: (row, value) => {
          const wanted = Array.isArray(value) ? value : typeof value === "string" && value ? [value] : [];
          return wanted.length ? wanted.includes(deliveryKey(row)) : true;
        },
      },
      {
        id: "source",
        label: "Origine",
        type: "select",
        options: SOURCE_OPTIONS,
        apply: (row, value) => (typeof value === "string" && value ? row.source === value : true),
      },
      {
        id: "status",
        label: "Stato registrato",
        type: "select",
        options: STATUS_OPTIONS,
        apply: (row, value) => (typeof value === "string" && value ? row.status === value : true),
      },
      {
        id: "category",
        label: "Categoria",
        type: "select",
        /*
          **Il filtro e per identificativo, l'etichetta e solo da leggere**
          (ADR-0185): con la chiave sull'etichetta due «Pulcini» su due sedi
          erano un filtro solo e sceglierlo mostrava tutte e due le squadre.
        */
        options: Array.from(
          new Map(
            assignments
              .map((row) => athleteOf(row))
              .map((athlete) => [
                getAthletePrimaryCategoryId(athlete, categories),
                getAthleteCategoryLabel(athlete, categories, categoryLabel),
              ] as const)
              .filter(([id]) => Boolean(id)),
          ).entries(),
        )
          .sort(([, a], [, b]) => a.localeCompare(b))
          .map(([id, label]) => ({ value: id, label })),
        apply: (row, value) =>
          typeof value === "string" && value
            ? getAthletePrimaryCategoryId(athleteOf(row), categories) === value
            : true,
      },
    ],
    [assignments, athleteOf, categories, categoryLabel],
  );

  const rowActions = React.useMemo<RowActionDef<ClothingAssignment>[]>(
    () => [
      { id: "deliveries", label: "Consegne del kit", icon: <PackageCheck />, primary: true, hidden: (row) => !canManage || !row.items.length, onClick: onDeliveries },
      { id: "edit", label: "Modifica assegnazione", icon: <Pencil />, hidden: () => !canManage, onClick: onEdit },
      { id: "status", label: "Cambia stato", icon: <RefreshCw />, hidden: () => !canManage, onClick: onChangeStatus },
      { id: "delete", label: "Elimina assegnazione", icon: <Trash2 />, tone: "danger", hidden: () => !canManage, onClick: onDelete },
    ],
    [canManage, onChangeStatus, onDelete, onDeliveries, onEdit],
  );

  return (
    <DataGrid<ClothingAssignment>
      module="abbigliamento-assegnazioni"
      aria-label="Assegnazioni"
      rows={assignments}
      getRowId={(row) => row.id}
      rowLabel={(row) => athleteLabel(athleteOf(row))}
      columns={columns}
      filters={filters}
      views={ASSIGNMENT_VIEWS}
      search={{
        placeholder: "Cerca atleta, categoria, articolo",
        match: (row, query) => {
          const q = query.trim().toLowerCase();
          if (!q) return true;
          const athlete = athleteOf(row);
          return [athleteLabel(athlete), getAthleteCategoryLabel(athlete), row.kitName || "", row.items.map((item) => item.name).join(" "), row.status, assignmentStatusLabels[row.status] || ""]
            .some((value) => String(value).toLowerCase().includes(q));
        },
      }}
      defaultSort={{ columnId: "date", direction: "desc" }}
      rowActions={rowActions}
      onOpenRow={canManage ? (row) => (row.items.length ? onDeliveries(row) : onEdit(row)) : undefined}
      state={loading ? "loading" : "ready"}
      noun={{ singular: "assegnazione", plural: "assegnazioni" }}
      empty={{
        icon: <Shirt />,
        title: "Nessuna assegnazione registrata",
        description: "Assegna un kit o un articolo a un atleta, da magazzino o da ordinare.",
        primary: canManage ? (
          <Button variant="primary" size="sm" onClick={onCreate}>
            Nuova assegnazione
          </Button>
        ) : null,
      }}
    />
  );
}
