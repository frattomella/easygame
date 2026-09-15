"use client";

import * as React from "react";
import { Boxes, PackagePlus, Pencil } from "lucide-react";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, FilterDef, RowActionDef, ViewDef } from "@/components/web/datagrid/types";
import { Button } from "@/components/web/primitives/Button";
import { IdentityCell } from "@/components/web/primitives/Identity";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { inventoryStatusLabels, type ClothingCatalogItem, type InventoryStock, type InventoryUnitStatus } from "@/lib/clothing-inventory-utils";
import { formatInteger } from "@/lib/web/format";
import { athleteLabel, inventoryStatusSpec, isStockAssignable, STOCK_TYPE_LABELS } from "@/components/clothing/v2/clothing-model";

/**
 * La griglia del magazzino (area «Magazzino»). Il filtro «Tutto · Unità
 * singole · Quantità» della V1 e una vista; la ricerca e la stessa. «Assegna»
 * compare solo sullo stock ancora assegnabile (la V1 lo disabilitava).
 */
const STOCK_TYPE_OPTIONS = [
  { value: "single_unit", label: "Unità singole" },
  { value: "bulk_quantity", label: "Quantità" },
];
const STATUS_OPTIONS = (Object.keys(inventoryStatusLabels) as InventoryUnitStatus[]).map((value) => ({ value, label: inventoryStatusLabels[value] }));

const INVENTORY_VIEWS: ViewDef[] = [
  { id: "units", label: "Unità singole", filters: { stockType: "single_unit" }, builtIn: true },
  { id: "bulk", label: "Quantità", filters: { stockType: "bulk_quantity" }, builtIn: true },
  { id: "available", label: "Disponibili", filters: { availability: "available" }, builtIn: true },
];

export function InventoryGrid({
  inventory,
  itemById,
  athletesById,
  canManage,
  canAssign,
  loading,
  onAssign,
  onEdit,
  onCreate,
}: {
  inventory: InventoryStock[];
  itemById: Map<string, ClothingCatalogItem>;
  athletesById: Map<string, any>;
  canManage: boolean;
  /** Puo creare assegnazioni (`kit_assignments:create`): «Assegna» compare solo a chi puo. */
  canAssign: boolean;
  loading: boolean;
  onAssign: (stock: InventoryStock) => void;
  onEdit: (stock: InventoryStock) => void;
  onCreate: () => void;
}) {
  const itemName = React.useCallback((stock: InventoryStock) => itemById.get(stock.itemId)?.name || stock.itemId, [itemById]);
  const assignedName = React.useCallback((stock: InventoryStock) => (stock.athleteId ? athleteLabel(athletesById.get(String(stock.athleteId))) : ""), [athletesById]);

  const columns = React.useMemo<ColumnDef<InventoryStock>[]>(
    () => [
      {
        id: "item",
        header: "Articolo",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => <IdentityCell name={itemName(row)} meta={itemById.get(row.itemId)?.type || undefined} onClick={canManage ? () => onEdit(row) : undefined} />,
        sortValue: (row) => itemName(row).toLowerCase(),
        exportValue: (row) => itemName(row),
        title: (row) => itemName(row),
      },
      { id: "stockType", header: "Tipo stock", kind: "classification", cell: (row) => STOCK_TYPE_LABELS[row.stockType], sortValue: (row) => STOCK_TYPE_LABELS[row.stockType] },
      { id: "size", header: "Taglia", kind: "classification", cell: (row) => row.size, sortValue: (row) => row.size || null },
      { id: "color", header: "Colore", kind: "classification", cell: (row) => row.color, sortValue: (row) => row.color || null },
      { id: "variant", header: "Variante", kind: "classification", hidden: true, cell: (row) => row.variant, sortValue: (row) => row.variant || null },
      {
        id: "number",
        header: "Numero",
        kind: "number",
        width: "90px",
        cell: (row) => (row.number === null || row.number === undefined ? null : String(row.number)),
        sortValue: (row) => row.number ?? null,
      },
      {
        id: "available",
        header: "Disponibile",
        kind: "number",
        align: "right",
        width: "110px",
        cell: (row) => formatInteger(row.quantityAvailable || 0),
        sortValue: (row) => row.quantityAvailable || 0,
        exportValue: (row) => row.quantityAvailable || 0,
      },
      {
        id: "reserved",
        header: "Riservato",
        kind: "number",
        align: "right",
        width: "100px",
        hidden: true,
        cell: (row) => formatInteger(row.quantityReserved || 0),
        sortValue: (row) => row.quantityReserved || 0,
        exportValue: (row) => row.quantityReserved || 0,
      },
      {
        id: "assigned",
        header: "Assegnato",
        kind: "number",
        align: "right",
        width: "100px",
        hidden: true,
        cell: (row) => formatInteger(row.quantityAssigned || 0),
        sortValue: (row) => row.quantityAssigned || 0,
        exportValue: (row) => row.quantityAssigned || 0,
      },
      {
        id: "status",
        header: "Stato",
        kind: "status",
        cell: (row) => <StatusPill status={inventoryStatusSpec(row)} />,
        sortValue: (row) => inventoryStatusSpec(row).label,
        exportValue: (row) => inventoryStatusSpec(row).label,
      },
      { id: "athlete", header: "Atleta assegnato", kind: "text", cell: (row) => assignedName(row), sortValue: (row) => assignedName(row).toLowerCase() || null },
      { id: "notes", header: "Note", kind: "text", hidden: true, cell: (row) => row.notes, sortValue: (row) => row.notes || null },
    ],
    [assignedName, canManage, itemById, itemName, onEdit],
  );

  const filters = React.useMemo<FilterDef<InventoryStock>[]>(
    () => [
      {
        id: "stockType",
        label: "Tipo stock",
        type: "select",
        pinned: true,
        options: STOCK_TYPE_OPTIONS.map((option) => ({ ...option, count: inventory.filter((row) => row.stockType === option.value).length })),
        apply: (row, value) => (typeof value === "string" && value ? row.stockType === value : true),
      },
      {
        id: "status",
        label: "Stato unità",
        type: "select",
        options: STATUS_OPTIONS,
        apply: (row, value) => (typeof value === "string" && value ? row.stockType === "single_unit" && (row.status || "available") === value : true),
      },
      {
        id: "availability",
        label: "Disponibilità",
        type: "select",
        options: [
          { value: "available", label: "Assegnabile" },
          { value: "unavailable", label: "Esaurito o impegnato" },
        ],
        apply: (row, value) => (typeof value === "string" && value ? isStockAssignable(row) === (value === "available") : true),
      },
      {
        id: "item",
        label: "Articolo",
        type: "select",
        options: Array.from(itemById.values())
          .map((item) => ({ value: item.id, label: item.name }))
          .sort((a, b) => a.label.localeCompare(b.label)),
        apply: (row, value) => (typeof value === "string" && value ? row.itemId === value : true),
      },
    ],
    [inventory, itemById],
  );

  const rowActions = React.useMemo<RowActionDef<InventoryStock>[]>(
    () => [
      { id: "assign", label: "Assegna", icon: <PackagePlus />, primary: true, hidden: (row) => !canAssign || !isStockAssignable(row), onClick: onAssign },
      { id: "edit", label: "Modifica", icon: <Pencil />, hidden: () => !canManage, onClick: onEdit },
    ],
    [canAssign, canManage, onAssign, onEdit],
  );

  return (
    <DataGrid<InventoryStock>
      module="abbigliamento-magazzino"
      aria-label="Magazzino"
      rows={inventory}
      getRowId={(row) => row.id}
      rowLabel={(row) => itemName(row)}
      columns={columns}
      filters={filters}
      views={INVENTORY_VIEWS}
      search={{
        placeholder: "Cerca articolo, taglia, colore, atleta",
        match: (row, query) => {
          const q = query.trim().toLowerCase();
          if (!q) return true;
          const item = itemById.get(row.itemId);
          return [item?.name, item?.type, item?.code, row.size, row.color, row.variant, row.number, row.notes, assignedName(row)]
            .map((value) => String(value ?? "").toLowerCase())
            .some((value) => value && value.includes(q));
        },
      }}
      defaultSort={{ columnId: "item", direction: "asc" }}
      rowActions={rowActions}
      onOpenRow={canManage ? onEdit : undefined}
      state={loading ? "loading" : "ready"}
      noun={{ singular: "riga di magazzino", plural: "righe di magazzino" }}
      empty={{
        icon: <Boxes />,
        title: "Nessun magazzino registrato",
        description: "Registra le unità fisiche numerate e le quantità generiche che il club ha in casa.",
        primary: canManage ? (
          <Button variant="primary" size="sm" onClick={onCreate}>
            Aggiungi a magazzino
          </Button>
        ) : null,
      }}
    />
  );
}
