"use client";

import * as React from "react";
import { CheckCircle2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { MONEY_STATUS } from "@/lib/web/status";
import type { ColumnDef, FilterDef, FilterState, FilterValue, RowActionDef } from "@/components/web/datagrid/types";
import type { ClubSite } from "@/lib/club-sites";
import { getActiveClubSites, isMultiSiteClub } from "@/lib/club-sites";
import {
  RECONCILIATION_STATUSES,
  RECONCILIATION_STATUS_LABELS,
  SOURCE_DOMAINS,
  SOURCE_DOMAIN_LABELS,
  type AccountingLine,
} from "@/lib/accounting/model";
import {
  activityScopeLabel,
  formatCents,
  formatDate,
  ownEntryId,
  reconciliationLabel,
  sourceLabel,
  type AccountingFilterState,
  type FinancialAccountView,
  type OperationTypeView,
} from "../accounting-view";

/**
 * Il registro della prima nota come **configurazione** del `DataGrid`
 * (guideline 07): colonne, filtri, azioni di riga. Il modulo non disegna una
 * griglia propria.
 *
 * ---
 *
 * ## I filtri sono del server, la griglia li mostra
 *
 * Il `DataGrid` filtra sul lato client le righe che ha in mano; qui in mano ha
 * **una pagina** di cento righe, e filtrare quella darebbe l'elenco della
 * pagina spacciato per l'elenco del periodo. Percio ogni `FilterDef` ha un
 * predicato che lascia passare tutto (`apply: () => true`) e la pagina ascolta
 * `onFiltersChange`/`onQueryChange` per **ricostruire la query** e rileggere
 * dal servizio, esattamente come la V1 faceva con la sua barra di filtri
 * (`buildEntriesQuery`, cento righe, offset). La griglia resta la sola
 * superficie dei filtri; il servizio resta il solo a filtrare, sugli indici.
 *
 * ## Le azioni vengono dalla riga, non dal ruolo
 *
 * Ogni azione nasce da `canReverse` / `canReconcile`, che il **servizio**
 * mette sulla riga insieme al resto. Questo modulo non conosce il ruolo di chi
 * guarda e non deve conoscerlo: e la lezione W3-14, per cui la matrice della
 * pagina e quella della rotta devono essere **la stessa**. Una riga
 * **proiettata** — un incasso, un compenso, una liquidazione — non mostra
 * nessuna azione, perche il servizio le ha marcate tutte `false`.
 *
 * ## Non esiste «Elimina»
 *
 * Il denaro non si cancella: si storna, e restano visibili entrambe le righe
 * con il motivo.
 *
 * ## Il filtro sede
 *
 * Compare solo ai club multi-sede, e la condizione e `isMultiSiteClub` di
 * `@/lib/club-sites` — il proprietario della regola di ADR-0038 — non un
 * conteggio riscritto qui. E la forma V2 di `SiteFilter`, con la stessa
 * regola di montaggio.
 */

/** Gli identificativi dei filtri della griglia, e a quale asse della V1 corrispondono. */
export const PRIMA_NOTA_FILTER_IDS = {
  period: "period",
  financialAccountId: "financialAccountId",
  operationTypeCode: "operationTypeCode",
  direction: "direction",
  sourceDomain: "sourceDomain",
  reconciliationStatus: "reconciliationStatus",
  siteId: "siteId",
} as const;

const asText = (value: FilterValue): string =>
  typeof value === "string" ? value : "";

/**
 * Dallo stato dei filtri della griglia agli assi che il servizio conosce.
 *
 * Anno fiscale, stagione e ricerca **non** stanno qui: i primi due sono
 * controlli di contesto nell'intestazione, la terza e la casella di ricerca
 * della griglia; la pagina li unisce a questo risultato.
 */
export const gridFiltersToAccounting = (
  state: FilterState,
): Pick<
  AccountingFilterState,
  "from" | "to" | "financialAccountId" | "operationTypeCode" | "direction" | "sourceDomain" | "reconciliationStatus" | "siteId"
> => {
  const period = state[PRIMA_NOTA_FILTER_IDS.period];
  const range =
    period && typeof period === "object" && !Array.isArray(period) ? period : { from: undefined, to: undefined };
  return {
    from: String(range.from || ""),
    to: String(range.to || ""),
    financialAccountId: asText(state[PRIMA_NOTA_FILTER_IDS.financialAccountId]),
    operationTypeCode: asText(state[PRIMA_NOTA_FILTER_IDS.operationTypeCode]),
    direction: asText(state[PRIMA_NOTA_FILTER_IDS.direction]),
    sourceDomain: asText(state[PRIMA_NOTA_FILTER_IDS.sourceDomain]),
    reconciliationStatus: asText(state[PRIMA_NOTA_FILTER_IDS.reconciliationStatus]),
    siteId: asText(state[PRIMA_NOTA_FILTER_IDS.siteId]),
  };
};

/* Il predicato non filtra: filtra il servizio, sugli indici. */
const serverSide = () => true;

export function buildPrimaNotaFilters({
  accounts,
  operationTypes,
  sites,
}: {
  accounts: readonly FinancialAccountView[];
  operationTypes: readonly OperationTypeView[];
  sites: ClubSite[];
}): FilterDef<AccountingLine>[] {
  const defs: FilterDef<AccountingLine>[] = [
    {
      id: PRIMA_NOTA_FILTER_IDS.period,
      label: "Periodo",
      type: "date-range",
      pinned: true,
      apply: serverSide,
      formatValue: (value) => {
        const range = value && typeof value === "object" && !Array.isArray(value) ? value : {};
        const from = range.from ? `dal ${formatDate(range.from)}` : "";
        const to = range.to ? `al ${formatDate(range.to)}` : "";
        return [from, to].filter(Boolean).join(" ");
      },
    },
    {
      id: PRIMA_NOTA_FILTER_IDS.financialAccountId,
      label: "Conto",
      type: "select",
      options: accounts.map((account) => ({ value: account.id, label: account.name })),
      apply: serverSide,
    },
    {
      id: PRIMA_NOTA_FILTER_IDS.operationTypeCode,
      label: "Causale",
      type: "select",
      options: operationTypes.map((type) => ({ value: type.code, label: type.label })),
      apply: serverSide,
    },
    {
      id: PRIMA_NOTA_FILTER_IDS.direction,
      label: "Verso",
      type: "select",
      options: [
        { value: "IN", label: "Solo entrate" },
        { value: "OUT", label: "Solo uscite" },
      ],
      apply: serverSide,
    },
    {
      id: PRIMA_NOTA_FILTER_IDS.sourceDomain,
      label: "Origine",
      type: "select",
      options: SOURCE_DOMAINS.map((domain) => ({ value: domain, label: SOURCE_DOMAIN_LABELS[domain] })),
      apply: serverSide,
    },
    {
      id: PRIMA_NOTA_FILTER_IDS.reconciliationStatus,
      label: "Riconciliazione",
      type: "select",
      options: RECONCILIATION_STATUSES.map((status) => ({ value: status, label: RECONCILIATION_STATUS_LABELS[status] })),
      apply: serverSide,
    },
  ];

  /* Si monta da solo o non si monta affatto (ADR-0038). */
  if (isMultiSiteClub(sites)) {
    defs.push({
      id: PRIMA_NOTA_FILTER_IDS.siteId,
      label: "Sede",
      type: "select",
      options: getActiveClubSites(sites).map((site) => ({ value: site.id, label: site.name })),
      apply: serverSide,
    });
  }

  return defs;
}

/* ── Colonne ─────────────────────────────────────────────────────────────── */

const amountClass = (line: AccountingLine) =>
  cn(
    line.reversedAt ? "text-egw-ink-42 line-through" : null,
    !line.reversedAt && line.direction === "IN" && "text-egw-green",
    !line.reversedAt && line.direction === "OUT" && "text-egw-red",
  );

/**
 * Lo stato di una riga: l'origine (un chip dati, non uno stato), la
 * riconciliazione quando non e «da riconciliare», e la pillola `STORNATO` se la
 * riga e stata stornata — la parola c'e sempre, il colore da solo non e mai
 * uno stato (§9.4).
 */
const StateCell = ({ line }: { line: AccountingLine }) => (
  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
    {line.reversedAt ? <StatusPill status={MONEY_STATUS.reversed} size="sm" /> : null}
    {line.reconciliationStatus !== "unreconciled" ? (
      <StatusPill
        status={{
          label: reconciliationLabel(line).toUpperCase(),
          weight: line.reconciliationStatus === "reconciled" ? "solid" : "urgent",
          hue: line.reconciliationStatus === "reconciled" ? "green" : "red",
        }}
        size="sm"
      />
    ) : null}
    <DataChip size="sm" title={sourceLabel(line)}>
      {sourceLabel(line)}
    </DataChip>
  </div>
);

export function buildPrimaNotaColumns(): ColumnDef<AccountingLine>[] {
  return [
    {
      id: "date",
      header: "Data",
      kind: "date",
      width: "104px",
      locked: true,
      cell: (line) => formatDate(line.entryDate),
      exportValue: (line) => line.entryDate,
    },
    {
      id: "description",
      header: "Descrizione",
      kind: "identity",
      locked: true,
      width: 2,
      minWidth: 220,
      cell: (line) => (
        <div className="min-w-0">
          <p className={cn("egw-ellipsis font-brand text-[13px] font-semibold text-egw-ink", line.reversedAt && "text-egw-ink-62")}>
            {line.description}
          </p>
          {line.counterpartyLabel || line.notes ? (
            <p className="egw-ellipsis font-brand text-[11.5px] text-egw-ink-62">
              {[line.counterpartyLabel, line.notes].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
      ),
      title: (line) => [line.description, line.counterpartyLabel, line.notes].filter(Boolean).join(" · "),
      exportValue: (line) => line.description,
    },
    {
      id: "operationType",
      header: "Causale",
      kind: "classification",
      minWidth: 140,
      cell: (line) =>
        line.activityScope === "unspecified" ? (
          <DataChip size="sm" tone="amber" title="Da classificare">
            Da classificare
          </DataChip>
        ) : (
          <span className="egw-ellipsis block" title={`${line.operationTypeLabel || ""} · ${activityScopeLabel(line)}`}>
            {line.operationTypeLabel || "—"}
          </span>
        ),
      title: (line) =>
        line.activityScope === "unspecified"
          ? "Da classificare"
          : [line.operationTypeLabel, activityScopeLabel(line)].filter(Boolean).join(" · "),
      exportValue: (line) => line.operationTypeLabel || "",
    },
    {
      id: "account",
      header: "Conto",
      kind: "classification",
      minWidth: 120,
      cell: (line) => line.financialAccountName || null,
      exportValue: (line) => line.financialAccountName || "",
    },
    {
      id: "amount",
      header: "Importo",
      kind: "amount",
      align: "right",
      width: "128px",
      cell: (line) => (
        <span className={amountClass(line)} aria-label={line.direction === "IN" ? "Entrata" : "Uscita"}>
          {line.direction === "IN" ? "+" : "−"}
          {formatCents(line.amountCents)}
        </span>
      ),
      title: (line) => `${line.direction === "IN" ? "Entrata" : "Uscita"} · ${formatCents(line.amountCents)}`,
      exportValue: (line) => (line.direction === "IN" ? line.amountCents : -line.amountCents) / 100,
    },
    {
      id: "state",
      header: "Stato",
      kind: "chips",
      minWidth: 170,
      cell: (line) => <StateCell line={line} />,
      exportValue: (line) => [sourceLabel(line), reconciliationLabel(line), line.reversedAt ? "Stornato" : ""].filter(Boolean).join(" · "),
    },
    {
      id: "paymentMethod",
      header: "Metodo",
      kind: "text",
      hidden: true,
      cell: (line) => line.paymentMethod || null,
    },
    {
      id: "document",
      header: "Documento",
      kind: "text",
      hidden: true,
      cell: (line) => line.documentNumber || null,
    },
    {
      id: "bankReference",
      header: "Riferimento bancario",
      kind: "text",
      hidden: true,
      cell: (line) => line.bankReference || null,
    },
    {
      id: "valueDate",
      header: "Data valuta",
      kind: "date",
      hidden: true,
      cell: (line) => (line.valueDate ? formatDate(line.valueDate) : null),
    },
  ];
}

/* ── Azioni di riga ──────────────────────────────────────────────────────── */

/**
 * Una riga che non e nostra non ha un id da mandare alle rotte: i flag del
 * servizio lo dicono gia, e `ownEntryId` e solo il presidio che impedisce di
 * spedire `payment-transaction:...` a `/reverse` se un giorno un flag
 * cambiasse senza che l'id cambi. Nessun `disabled`: un'azione che il
 * servizio nega e **assente**.
 */
export function buildPrimaNotaRowActions({
  onReconcile,
  onReverse,
}: {
  onReconcile: (line: AccountingLine) => void;
  onReverse: (line: AccountingLine) => void;
}): RowActionDef<AccountingLine>[] {
  return [
    {
      id: "reconcile",
      label: "Riconcilia",
      icon: <CheckCircle2 />,
      primary: true,
      hidden: (line) => !line.canReconcile || !ownEntryId(line),
      onClick: onReconcile,
    },
    {
      id: "reverse",
      label: "Storna",
      icon: <Undo2 />,
      tone: "danger",
      hidden: (line) => !line.canReverse || !ownEntryId(line),
      onClick: onReverse,
    },
  ];
}

/* ── Paginazione del server ──────────────────────────────────────────────── */

