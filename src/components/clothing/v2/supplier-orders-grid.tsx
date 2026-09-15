"use client";

import * as React from "react";
import { FileDown, Truck } from "lucide-react";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { BulkActionDef, ColumnDef, ExportRequest, FilterDef, FilterState, RowActionDef } from "@/components/web/datagrid/types";
import { IdentityCell } from "@/components/web/primitives/Identity";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { assignmentStatusLabels, type ClothingAssignmentStatus } from "@/lib/clothing-inventory-utils";
import { formatInteger } from "@/lib/web/format";
import { ASSIGNMENT_STATUS, type SupplierOrderRow } from "@/components/clothing/v2/clothing-model";

/**
 * La griglia degli ordini al fornitore (area «Ordini fornitore»): una riga
 * per articolo delle assegnazioni da ordinare. L'unica esportazione della
 * V1 (l'ordine in PDF) resta nei suoi tre ambiti: **tutto cio che si vede**
 * dal menu Esporta («Ordine completo»), **la selezione** dalla barra di massa
 * («Articoli selezionati»), **una riga** dall'azione di riga («Articolo
 * singolo»). Il filtro fornitore attivo finisce nell'intestazione del PDF
 * come in V1.
 */
export type SupplierExportScope = "Ordine completo" | "Articoli selezionati" | "Articolo singolo";

const STATUS_OPTIONS = (Object.keys(assignmentStatusLabels) as ClothingAssignmentStatus[]).map((value) => ({ value, label: assignmentStatusLabels[value] }));

export function SupplierOrdersGrid({
  rows,
  loading,
  onExport,
}: {
  rows: SupplierOrderRow[];
  loading: boolean;
  onExport: (rows: SupplierOrderRow[], scope: SupplierExportScope, supplierFilter: string | null) => void;
}) {
  const [supplierFilter, setSupplierFilter] = React.useState<string | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());

  React.useEffect(() => {
    setSelectedIds((current) => new Set(Array.from(current).filter((id) => rows.some((row) => row.id === id))));
  }, [rows]);

  const supplierOptions = React.useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.supplier || "Non indicato")))
        .sort((left, right) => left.localeCompare(right))
        .map((supplier) => ({ value: supplier, label: supplier, count: rows.filter((row) => (row.supplier || "Non indicato") === supplier).length })),
    [rows],
  );

  const columns = React.useMemo<ColumnDef<SupplierOrderRow>[]>(
    () => [
      {
        id: "item",
        header: "Articolo",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => <IdentityCell name={row.itemName} meta={`${row.athleteName} · ${row.categoryName}`} />,
        sortValue: (row) => row.itemName.toLowerCase(),
        exportValue: (row) => row.itemName,
        title: (row) => row.itemName,
      },
      { id: "type", header: "Tipo", kind: "classification", cell: (row) => (row.itemType === "-" ? null : row.itemType), sortValue: (row) => row.itemType || null },
      { id: "size", header: "Taglia", kind: "classification", width: "80px", cell: (row) => row.size, sortValue: (row) => row.size || null },
      { id: "color", header: "Colore", kind: "classification", cell: (row) => row.color, sortValue: (row) => row.color || null },
      { id: "variant", header: "Variante", kind: "classification", hidden: true, cell: (row) => row.variant, sortValue: (row) => row.variant || null },
      {
        id: "number",
        header: "Numero",
        kind: "number",
        width: "100px",
        cell: (row) => (row.numberLabel === "Senza numero" ? null : `n. ${row.numberLabel}`),
        sortValue: (row) => (row.numberLabel === "Senza numero" ? null : row.numberLabel || null),
        exportValue: (row) => row.numberLabel,
      },
      { id: "quantity", header: "Quantità", kind: "number", align: "right", width: "90px", cell: (row) => formatInteger(row.quantity), sortValue: (row) => row.quantity, exportValue: (row) => row.quantity },
      { id: "supplier", header: "Fornitore", kind: "classification", cell: (row) => row.supplier, sortValue: (row) => (row.supplier || "").toLowerCase() || null },
      {
        id: "status",
        header: "Stato",
        kind: "status",
        cell: (row) => <StatusPill status={ASSIGNMENT_STATUS[row.assignmentItem.status] || ASSIGNMENT_STATUS[row.assignment.status]} />,
        sortValue: (row) => row.status || null,
        exportValue: (row) => row.status,
      },
      { id: "athlete", header: "Atleta", kind: "text", hidden: true, cell: (row) => row.athleteName, sortValue: (row) => (row.athleteName || "").toLowerCase() || null },
      { id: "notes", header: "Note", kind: "text", hidden: true, cell: (row) => row.notes, sortValue: (row) => row.notes || null },
    ],
    [],
  );

  const filters = React.useMemo<FilterDef<SupplierOrderRow>[]>(
    () => [
      {
        id: "supplier",
        label: "Fornitore",
        type: "select",
        pinned: true,
        options: supplierOptions,
        apply: (row, value) => (typeof value === "string" && value ? (row.supplier || "Non indicato") === value : true),
      },
      {
        id: "status",
        label: "Stato",
        type: "select",
        options: STATUS_OPTIONS,
        apply: (row, value) => (typeof value === "string" && value ? (row.assignmentItem.status || row.assignment.status) === value : true),
      },
    ],
    [supplierOptions],
  );

  const onFiltersChange = React.useCallback((state: FilterState) => {
    const value = state.supplier;
    setSupplierFilter(typeof value === "string" && value ? value : null);
  }, []);

  const rowActions = React.useMemo<RowActionDef<SupplierOrderRow>[]>(
    () => [{ id: "pdf", label: "PDF di questo articolo", icon: <FileDown />, primary: true, onClick: (row) => onExport([row], "Articolo singolo", supplierFilter) }],
    [onExport, supplierFilter],
  );

  const bulkActions = React.useMemo<BulkActionDef<SupplierOrderRow>[]>(
    () => [{ id: "export-pdf", label: "Esporta selezionati PDF", icon: <FileDown />, onRun: (selected) => onExport(selected, "Articoli selezionati", supplierFilter) }],
    [onExport, supplierFilter],
  );

  const handleExport = (request: ExportRequest<SupplierOrderRow>) =>
    onExport(request.rows, request.scope === "selected" ? "Articoli selezionati" : "Ordine completo", supplierFilter);

  return (
    <DataGrid<SupplierOrderRow>
      module="abbigliamento-ordini"
      aria-label="Ordini fornitore"
      rows={rows}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.itemName}
      columns={columns}
      filters={filters}
      onFiltersChange={onFiltersChange}
      search={{
        placeholder: "Cerca articolo, atleta, note",
        match: (row, query) => {
          const q = query.trim().toLowerCase();
          if (!q) return true;
          return [row.itemName, row.itemType, row.size, row.color, row.variant, row.numberLabel, row.supplier, row.notes, row.status, row.athleteName, row.categoryName]
            .map((value) => String(value ?? "").toLowerCase())
            .some((value) => value && value.includes(q));
        },
      }}
      defaultSort={{ columnId: "item", direction: "asc" }}
      rowActions={rowActions}
      bulkActions={bulkActions}
      selectedIds={selectedIds}
      onSelectionChange={setSelectedIds}
      export={{ onExport: handleExport, kinds: ["pdf"] }}
      state={loading ? "loading" : "ready"}
      noun={{ singular: "articolo da ordinare", plural: "articoli da ordinare" }}
      empty={{
        icon: <Truck />,
        title: "Nessun ordine fornitore",
        description: "Le richieste al fornitore nascono dalle assegnazioni «da ordinare».",
      }}
    />
  );
}
