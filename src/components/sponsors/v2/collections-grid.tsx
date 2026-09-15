"use client";

import * as React from "react";
import { Euro, Undo2 } from "lucide-react";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, FilterDef, RowActionDef, ViewDef } from "@/components/web/datagrid/types";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { formatDateShort, formatMoney } from "@/lib/web/format";
import { fromSponsorCents } from "@/lib/sponsors/model";
import {
  canReverseCollection,
  collectionDescription,
  collectionStatusSpec,
  matchesCollectionSearch,
  sponsorKindLabel,
  type SponsorCollectionRow,
} from "@/components/sponsors/v2/sponsor-model";

/**
 * Il registro degli incassi sponsor come `DataGrid` (guideline 07): lo
 * montano l'elenco (scheda «Pagamenti» della V1, tutti gli sponsor) e la
 * scheda (card «Pagamenti», uno sponsor solo). Le righe sono quelle che il
 * server manda con il credito — `payment_transactions` piu lo storico
 * congelato — e **uno storno si dichiara**: la riga stornata e la sua
 * compensazione portano la pillola STORNATO e l'importo con il segno.
 *
 * «Storna» compare solo per chi puo (`onReverse` assente = permesso negato,
 * quindi azione assente) e solo su una riga viva e positiva.
 */
const COLLECTION_VIEWS: ViewDef[] = [
  { id: "live", label: "Vivi", filters: { state: "live" }, builtIn: true },
  { id: "reversed", label: "Stornati", filters: { state: "reversed" }, builtIn: true, tone: "neutral" },
];

export function SponsorCollectionsGrid({
  module,
  rows,
  showSponsor,
  state,
  errorMessage,
  onRetry,
  onReverse,
  onOpenSponsor,
  emptyPrimary,
  emptyTitle = "Nessun incasso registrato",
  emptyDescription = "Gli incassi degli sponsor entrano nel registro e da lì in prima nota.",
  hideFooter,
}: {
  module: string;
  rows: SponsorCollectionRow[];
  /** La colonna dello sponsor (nell'elenco si, nella scheda no). */
  showSponsor: boolean;
  state: "ready" | "loading" | "error";
  errorMessage?: string | null;
  onRetry?: () => void;
  /** Assente = il ruolo non puo stornare: l'azione non compare. */
  onReverse?: (row: SponsorCollectionRow) => void;
  onOpenSponsor?: (row: SponsorCollectionRow) => void;
  emptyPrimary?: React.ReactNode;
  emptyTitle?: React.ReactNode;
  emptyDescription?: React.ReactNode;
  hideFooter?: boolean;
}) {
  const columns = React.useMemo<ColumnDef<SponsorCollectionRow>[]>(() => {
    const list: ColumnDef<SponsorCollectionRow>[] = [
      {
        id: "date",
        header: "Data",
        kind: "date",
        locked: true,
        cell: (row) => formatDateShort(row.paidAt),
        sortValue: (row) => row.paidAt || null,
        exportValue: (row) => row.paidAt || "",
      },
    ];
    if (showSponsor) {
      list.push({
        id: "sponsor",
        header: "Sponsor / Fornitore",
        kind: "text",
        width: 1.4,
        cell: (row) =>
          onOpenSponsor ? (
            <button type="button" onClick={() => onOpenSponsor(row)} className="egw-ellipsis block max-w-full text-left font-brand text-[12.5px] font-semibold text-egw-ink hover:text-egw-blue-700 hover:underline focus-visible:outline-none focus-visible:underline">
              {row.sponsorName}
            </button>
          ) : (
            row.sponsorName
          ),
        sortValue: (row) => row.sponsorName.toLowerCase(),
        exportValue: (row) => row.sponsorName,
        title: (row) => row.sponsorName,
      });
      list.push({
        id: "kind",
        header: "Tipologia",
        kind: "classification",
        hidden: true,
        cell: (row) => sponsorKindLabel(row.sponsorKind),
        sortValue: (row) => row.sponsorKind,
      });
    }
    list.push(
      {
        id: "description",
        header: "Descrizione",
        kind: "text",
        width: 2,
        cell: (row) => collectionDescription(row),
        sortValue: (row) => collectionDescription(row).toLowerCase(),
        title: (row) => collectionDescription(row),
      },
      {
        id: "method",
        header: "Metodo",
        kind: "text",
        cell: (row) => row.paymentMethod || null,
        sortValue: (row) => row.paymentMethod.toLowerCase() || null,
      },
      {
        id: "amount",
        header: "Importo",
        kind: "amount",
        align: "right",
        cell: (row) => (
          <span className={row.reversed ? "text-egw-ink-62 line-through" : undefined}>
            {formatMoney(fromSponsorCents(row.amountCents))}
          </span>
        ),
        sortValue: (row) => row.amountCents,
        exportValue: (row) => fromSponsorCents(row.amountCents),
      },
      {
        id: "status",
        header: "Stato",
        kind: "status",
        cell: (row) => <StatusPill status={collectionStatusSpec(row)} />,
        sortValue: (row) => (row.reversed ? 1 : 0),
        exportValue: (row) => collectionStatusSpec(row).label,
      },
    );
    return list;
    // `onOpenSponsor` cambia solo con il club.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSponsor]);

  const filters = React.useMemo<FilterDef<SponsorCollectionRow>[]>(
    () => [
      {
        id: "state",
        label: "Stato",
        type: "select",
        options: [
          { value: "live", label: "Vivi" },
          { value: "reversed", label: "Stornati" },
        ],
        apply: (row, value) => (value === "live" ? !row.reversed : value === "reversed" ? row.reversed : true),
      },
    ],
    [],
  );

  const rowActions = React.useMemo<RowActionDef<SponsorCollectionRow>[]>(
    () =>
      onReverse
        ? [
            {
              id: "reverse",
              label: "Storna",
              icon: <Undo2 />,
              tone: "danger",
              hidden: (row) => !canReverseCollection(row),
              onClick: (row) => onReverse(row),
            },
          ]
        : [],
    [onReverse],
  );

  const search = React.useMemo(
    () => ({
      placeholder: showSponsor ? "Cerca per sponsor, descrizione, metodo" : "Cerca per descrizione, metodo",
      match: (row: SponsorCollectionRow, query: string) => matchesCollectionSearch(row, query),
    }),
    [showSponsor],
  );

  return (
    <DataGrid<SponsorCollectionRow>
      module={module}
      aria-label="Registro degli incassi sponsor"
      rows={rows}
      getRowId={(row) => row.id}
      rowLabel={(row) => collectionDescription(row)}
      columns={columns}
      filters={filters}
      views={COLLECTION_VIEWS}
      search={search}
      defaultSort={{ columnId: "date", direction: "desc" }}
      rowActions={rowActions}
      canSelect={false}
      state={state}
      errorMessage={errorMessage}
      onRetry={onRetry}
      hideFooter={hideFooter}
      noun={{ singular: "incasso", plural: "incassi" }}
      empty={{
        icon: <Euro />,
        title: emptyTitle,
        description: emptyDescription,
        primary: emptyPrimary,
      }}
    />
  );
}
