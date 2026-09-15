import type { ExportRequest } from "@/components/web/datagrid/types";
import { csvFileName, downloadCsv, toCsv } from "@/lib/csv";

/**
 * Il CSV di una griglia: le colonne visibili con il loro `exportValue` (o, in
 * mancanza, `sortValue`), nell'ordine in cui l'utente le vede. `name` e il
 * titolo umano («Piani di pagamento» → `piani-di-pagamento-2026-09-15.csv`)
 * oppure, se finisce in `.csv`, il nome del file gia deciso (`f24-2026.csv`).
 */
export function exportGridCsv<Row>(request: ExportRequest<Row>, name: string): void {
  const columns = request.columns.map((column) => ({
    key: column.id,
    label: column.label || (typeof column.header === "string" ? column.header : column.id),
  }));
  const rows = request.rows.map((row) =>
    Object.fromEntries(
      request.columns.map((column) => [column.id, column.exportValue?.(row) ?? column.sortValue?.(row) ?? ""]),
    ),
  );
  downloadCsv(name.toLowerCase().endsWith(".csv") ? name : csvFileName(name), toCsv(columns, rows));
}
