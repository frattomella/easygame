"use client";

import * as React from "react";
import { Pencil, Shirt, Layers } from "lucide-react";
import { CellChips, DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, FilterDef, RowActionDef } from "@/components/web/datagrid/types";
import { Button } from "@/components/web/primitives/Button";
import { IdentityCell } from "@/components/web/primitives/Identity";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import type { ClothingCatalogItem, ClothingKit } from "@/lib/clothing-inventory-utils";
import { joinMeta } from "@/lib/web/format";
import { CATALOG_STATUS, NUMBER_MODE_LABELS, SIZE_SOURCE_LABELS, STOCK_MODE_LABELS } from "@/components/clothing/v2/clothing-model";

/**
 * Le due griglie del catalogo (aree «Kit» e «Articoli»). Solo lettura +
 * «Modifica» per riga: la V1 non aveva eliminazione ne disattivazione, e il
 * salvataggio forza `active: true`. La ricerca e quella della V1
 * (`catalogSearch`), che qui vive dentro ogni griglia.
 */
const catalogStatus = (active: boolean) => (active ? CATALOG_STATUS.active : CATALOG_STATUS.inactive);

const NUMBER_MODE_OPTIONS = (Object.keys(NUMBER_MODE_LABELS) as Array<keyof typeof NUMBER_MODE_LABELS>).map((value) => ({ value, label: NUMBER_MODE_LABELS[value] }));
const STATUS_OPTIONS = [
  { value: "active", label: "Attivo" },
  { value: "inactive", label: "Non attivo" },
];

/* ── Kit ────────────────────────────────────────────────────────────────── */
export function KitsGrid({
  kits,
  itemById,
  groupsById,
  canManage,
  loading,
  onEdit,
  onCreate,
}: {
  kits: ClothingKit[];
  itemById: Map<string, ClothingCatalogItem>;
  groupsById: Map<string, { name: string }>;
  canManage: boolean;
  loading: boolean;
  onEdit: (kit: ClothingKit) => void;
  onCreate: () => void;
}) {
  const componentNames = React.useCallback(
    (kit: ClothingKit) => kit.components.map((component) => component.name || itemById.get(component.itemId)?.name || component.itemId),
    [itemById],
  );

  const columns = React.useMemo<ColumnDef<ClothingKit>[]>(
    () => [
      {
        id: "name",
        header: "Nome kit",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => <IdentityCell name={row.name} meta={row.description || "Nessuna descrizione"} onClick={canManage ? () => onEdit(row) : undefined} />,
        sortValue: (row) => row.name.toLowerCase(),
        exportValue: (row) => row.name,
        title: (row) => row.name,
      },
      {
        id: "components",
        header: "Componenti",
        kind: "chips",
        width: 2,
        minWidth: 200,
        cell: (row) => <CellChips items={componentNames(row).map((label) => ({ label }))} />,
        sortValue: (row) => row.components.length,
        exportValue: (row) => componentNames(row).join(", "),
        title: (row) => componentNames(row).join(", ") || undefined,
      },
      {
        id: "numberMode",
        header: "Numerazione",
        kind: "classification",
        cell: (row) => NUMBER_MODE_LABELS[row.numberMode],
        sortValue: (row) => NUMBER_MODE_LABELS[row.numberMode],
      },
      {
        id: "group",
        header: "Gruppo numerazione",
        kind: "classification",
        hidden: true,
        cell: (row) => (row.numberingGroupId ? groupsById.get(row.numberingGroupId)?.name || row.numberingGroupId : null),
        sortValue: (row) => (row.numberingGroupId ? groupsById.get(row.numberingGroupId)?.name || null : null),
      },
      {
        id: "status",
        header: "Stato",
        kind: "status",
        cell: (row) => <StatusPill status={catalogStatus(row.active)} />,
        sortValue: (row) => (row.active ? "active" : "inactive"),
        exportValue: (row) => catalogStatus(row.active).label,
      },
    ],
    [canManage, componentNames, groupsById, onEdit],
  );

  const filters = React.useMemo<FilterDef<ClothingKit>[]>(
    () => [
      {
        id: "numberMode",
        label: "Numerazione",
        type: "select",
        options: NUMBER_MODE_OPTIONS,
        apply: (row, value) => (typeof value === "string" && value ? row.numberMode === value : true),
      },
      {
        id: "status",
        label: "Stato",
        type: "select",
        options: STATUS_OPTIONS,
        apply: (row, value) => (typeof value === "string" && value ? (row.active ? "active" : "inactive") === value : true),
      },
    ],
    [],
  );

  const rowActions = React.useMemo<RowActionDef<ClothingKit>[]>(
    () => [{ id: "edit", label: "Modifica", icon: <Pencil />, primary: true, hidden: () => !canManage, onClick: onEdit }],
    [canManage, onEdit],
  );

  return (
    <DataGrid<ClothingKit>
      module="abbigliamento-kit"
      aria-label="Kit"
      rows={kits}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.name}
      columns={columns}
      filters={filters}
      search={{
        placeholder: "Cerca kit, descrizione, componente",
        match: (row, query) => {
          const q = query.trim().toLowerCase();
          if (!q) return true;
          return [row.name, row.description || "", ...componentNames(row)].some((value) => value.toLowerCase().includes(q));
        },
      }}
      defaultSort={{ columnId: "name", direction: "asc" }}
      rowActions={rowActions}
      onOpenRow={canManage ? onEdit : undefined}
      state={loading ? "loading" : "ready"}
      noun={{ singular: "kit", plural: "kit" }}
      empty={{
        icon: <Layers />,
        title: "Nessun kit configurato",
        description: "Un kit è una composizione di articoli del catalogo.",
        primary: canManage ? (
          <Button variant="primary" size="sm" onClick={onCreate}>
            Nuovo kit
          </Button>
        ) : null,
      }}
    />
  );
}

/* ── Articoli ───────────────────────────────────────────────────────────── */
const REQUIREMENT_OPTIONS = [
  { value: "size", label: "Richiede taglia" },
  { value: "color", label: "Richiede colore" },
  { value: "number", label: "Richiede numero" },
];
const STOCK_MODE_OPTIONS = (Object.keys(STOCK_MODE_LABELS) as Array<keyof typeof STOCK_MODE_LABELS>).map((value) => ({ value, label: STOCK_MODE_LABELS[value] }));

const requirementChips = (item: ClothingCatalogItem) => [
  ...(item.requiresSize ? [{ label: "taglia" }] : []),
  ...(item.requiresColor ? [{ label: "colore" }] : []),
  ...(item.requiresNumber ? [{ label: "numero" }] : []),
];

export function ItemsGrid({
  items,
  canManage,
  loading,
  onEdit,
  onCreate,
}: {
  items: ClothingCatalogItem[];
  canManage: boolean;
  loading: boolean;
  onEdit: (item: ClothingCatalogItem) => void;
  onCreate: () => void;
}) {
  const columns = React.useMemo<ColumnDef<ClothingCatalogItem>[]>(
    () => [
      {
        id: "name",
        header: "Nome",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => <IdentityCell name={row.name} meta={joinMeta(row.type, row.code)} onClick={canManage ? () => onEdit(row) : undefined} />,
        sortValue: (row) => row.name.toLowerCase(),
        exportValue: (row) => row.name,
        title: (row) => row.name,
      },
      { id: "type", header: "Tipo", kind: "classification", cell: (row) => row.type, sortValue: (row) => row.type.toLowerCase() || null },
      { id: "code", header: "Codice", kind: "text", cell: (row) => <span className="egw-num">{row.code}</span>, sortValue: (row) => row.code || null },
      {
        id: "sizes",
        header: "Taglie",
        kind: "chips",
        cell: (row) => <CellChips items={row.sizes.map((label) => ({ label }))} max={3} />,
        sortValue: (row) => row.sizes.length,
        exportValue: (row) => row.sizes.join(", "),
        title: (row) => row.sizes.join(", ") || undefined,
      },
      {
        id: "colors",
        header: "Colori",
        kind: "chips",
        cell: (row) => <CellChips items={row.colors.map((label) => ({ label }))} />,
        sortValue: (row) => row.colors.length,
        exportValue: (row) => row.colors.join(", "),
        title: (row) => row.colors.join(", ") || undefined,
      },
      {
        id: "variants",
        header: "Varianti",
        kind: "chips",
        cell: (row) => <CellChips items={row.variants.map((label) => ({ label }))} />,
        sortValue: (row) => row.variants.length,
        exportValue: (row) => row.variants.join(", "),
        title: (row) => row.variants.join(", ") || undefined,
      },
      {
        id: "requirements",
        header: "Requisiti",
        kind: "chips",
        cell: (row) => <CellChips items={requirementChips(row)} max={3} />,
        sortValue: (row) => requirementChips(row).length,
        exportValue: (row) => requirementChips(row).map((chip) => chip.label).join(", "),
      },
      {
        id: "status",
        header: "Stato",
        kind: "status",
        cell: (row) => <StatusPill status={catalogStatus(row.active)} />,
        sortValue: (row) => (row.active ? "active" : "inactive"),
        exportValue: (row) => catalogStatus(row.active).label,
      },
      { id: "stockMode", header: "Modalità stock", kind: "classification", hidden: true, cell: (row) => STOCK_MODE_LABELS[row.stockMode], sortValue: (row) => STOCK_MODE_LABELS[row.stockMode] },
      { id: "numberMode", header: "Numero", kind: "classification", hidden: true, cell: (row) => NUMBER_MODE_LABELS[row.numberMode], sortValue: (row) => NUMBER_MODE_LABELS[row.numberMode] },
      { id: "sizeSource", header: "Taglia dall'anagrafica", kind: "classification", hidden: true, cell: (row) => SIZE_SOURCE_LABELS[row.sizeSource], sortValue: (row) => SIZE_SOURCE_LABELS[row.sizeSource] },
      { id: "description", header: "Descrizione", kind: "text", hidden: true, cell: (row) => row.description, sortValue: (row) => row.description || null },
    ],
    [canManage, onEdit],
  );

  const filters = React.useMemo<FilterDef<ClothingCatalogItem>[]>(
    () => [
      {
        id: "requirements",
        label: "Requisiti",
        type: "multi",
        options: REQUIREMENT_OPTIONS,
        apply: (row, value) => {
          const wanted = Array.isArray(value) ? value : typeof value === "string" && value ? [value] : [];
          return wanted.every((key) => (key === "size" ? row.requiresSize : key === "color" ? row.requiresColor : row.requiresNumber));
        },
      },
      {
        id: "stockMode",
        label: "Modalità stock",
        type: "select",
        options: STOCK_MODE_OPTIONS,
        apply: (row, value) => (typeof value === "string" && value ? row.stockMode === value : true),
      },
      {
        id: "status",
        label: "Stato",
        type: "select",
        options: STATUS_OPTIONS,
        apply: (row, value) => (typeof value === "string" && value ? (row.active ? "active" : "inactive") === value : true),
      },
    ],
    [],
  );

  const rowActions = React.useMemo<RowActionDef<ClothingCatalogItem>[]>(
    () => [{ id: "edit", label: "Modifica", icon: <Pencil />, primary: true, hidden: () => !canManage, onClick: onEdit }],
    [canManage, onEdit],
  );

  return (
    <DataGrid<ClothingCatalogItem>
      module="abbigliamento-articoli"
      aria-label="Articoli del catalogo"
      rows={items}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.name}
      columns={columns}
      filters={filters}
      search={{
        placeholder: "Cerca articolo, codice, taglia",
        match: (row, query) => {
          const q = query.trim().toLowerCase();
          if (!q) return true;
          return [row.name, row.type, row.code || "", row.sizes.join(" "), row.colors.join(" "), row.variants.join(" ")].some((value) => value.toLowerCase().includes(q));
        },
      }}
      defaultSort={{ columnId: "name", direction: "asc" }}
      rowActions={rowActions}
      onOpenRow={canManage ? onEdit : undefined}
      state={loading ? "loading" : "ready"}
      noun={{ singular: "articolo", plural: "articoli" }}
      empty={{
        icon: <Shirt />,
        title: "Nessun articolo configurato",
        description: "Il catalogo dice quali taglie, colori e numeri esistono per ogni capo.",
        primary: canManage ? (
          <Button variant="primary" size="sm" onClick={onCreate}>
            Nuovo articolo
          </Button>
        ) : null,
      }}
    />
  );
}

