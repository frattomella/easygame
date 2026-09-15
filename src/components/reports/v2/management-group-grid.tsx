"use client";

import * as React from "react";
import { Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { PanelHeader } from "@/components/web/primitives/Surface";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef } from "@/components/web/datagrid/types";
import { formatInteger, formatMoney } from "@/lib/web/format";
import type { ReportGroup } from "@/lib/accounting/reporting";

/**
 * Una tabella di raggruppamento del riepilogo gestionale, nella griglia del
 * sistema (guideline 07): etichetta a sinistra, **Entrate · Uscite · Saldo ·
 * Righe** a destra in cifre tabellari. Ogni gruppo porta sempre entrambi i
 * versi, anche quando uno e zero: una voce che mostra solo il netto nasconde
 * una causale su cui sono passati diecimila euro in entrata e diecimila in
 * uscita.
 *
 * I centesimi arrivano dal server e si convertono **solo qui**, alla stampa.
 */
export const euroFromCents = (cents: number) =>
  formatMoney((Number(cents) || 0) / 100);

const groupRowId = (group: ReportGroup) => group.key || "__vuoto__";

export const buildGroupColumns = (
  labelHeader: string,
  formatLabel?: (group: ReportGroup) => string,
): ColumnDef<ReportGroup>[] => {
  const labelOf = (group: ReportGroup) =>
    formatLabel ? formatLabel(group) : group.label;
  return [
    {
      id: "label",
      header: labelHeader,
      label: labelHeader,
      kind: "text",
      locked: true,
      width: 1.6,
      minWidth: 160,
      cell: (group) => (
        <span className="font-semibold text-egw-ink">{labelOf(group)}</span>
      ),
      sortValue: labelOf,
      title: labelOf,
    },
    {
      id: "in",
      header: "Entrate",
      label: "Entrate",
      kind: "amount",
      align: "right",
      minWidth: 110,
      cell: (group) => (
        <span className={cn(group.inCents > 0 && "text-egw-green")}>
          {euroFromCents(group.inCents)}
        </span>
      ),
      sortValue: (group) => group.inCents,
    },
    {
      id: "out",
      header: "Uscite",
      label: "Uscite",
      kind: "amount",
      align: "right",
      minWidth: 110,
      cell: (group) => (
        <span className={cn(group.outCents > 0 && "text-egw-red")}>
          {euroFromCents(group.outCents)}
        </span>
      ),
      sortValue: (group) => group.outCents,
    },
    {
      id: "net",
      header: "Saldo",
      label: "Saldo",
      kind: "amount",
      align: "right",
      minWidth: 110,
      cell: (group) => euroFromCents(group.netCents),
      sortValue: (group) => group.netCents,
    },
    {
      id: "lines",
      header: "Righe",
      label: "Righe",
      kind: "number",
      align: "right",
      minWidth: 70,
      width: 0.6,
      cell: (group) => (
        <span className="text-egw-ink-62">{formatInteger(group.lineCount)}</span>
      ),
      sortValue: (group) => group.lineCount,
    },
  ];
};

export function ManagementGroupGrid({
  module,
  title,
  description,
  groups,
  labelHeader,
  formatLabel,
}: {
  /** `egw.<module>.*`: uno per tabella, cosi colonne e densita non si mescolano. */
  module: string;
  title: string;
  description: string;
  groups: ReportGroup[];
  labelHeader: string;
  formatLabel?: (group: ReportGroup) => string;
}) {
  const columns = React.useMemo(
    () => buildGroupColumns(labelHeader, formatLabel),
    [labelHeader, formatLabel],
  );

  return (
    <DataGrid<ReportGroup>
      module={module}
      aria-label={title}
      rows={groups}
      getRowId={groupRowId}
      rowLabel={(group) => (formatLabel ? formatLabel(group) : group.label)}
      columns={columns}
      noun={{ singular: "voce", plural: "voci" }}
      canSelect={false}
      hideViews
      hideFooter={groups.length <= 25}
      persist={false}
      defaultPageSize={25}
      className="min-w-0"
      banner={
        <div className="border-b border-egw-hairline px-4 py-3.5 sm:px-5">
          <PanelHeader
            titleAs="h3"
            title={title}
            description={description}
            className="mb-0"
          />
        </div>
      }
      empty={{
        icon: <Scale />,
        title: "Nessun movimento nel filtro selezionato.",
      }}
    />
  );
}
