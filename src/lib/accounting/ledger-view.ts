/**
 * **La specifica in TypeScript della vista `accounting_ledger_lines`.**
 *
 * Modulo **puro**: nessun Prisma, nessuna rete. Riceve le righe gia lette dai
 * cinque domini e restituisce le righe del registro, nella **stessa forma** che
 * il database produce.
 *
 * ---
 *
 * ## Perche esiste una seconda scrittura della stessa regola
 *
 * In produzione il registro lo compone Postgres, e deve: comporlo in memoria
 * significava rileggerlo tutto a ogni pagina, e su 35.000 righe il rendiconto
 * ci metteva due minuti. La vista
 * (`prisma/migrations/20260830090000_wave4_registro_unico`) e la risposta.
 *
 * Ma una regola scritta in SQL e una regola che nessun test unitario legge, e
 * questa Wave ha gia dimostrato — piu volte — che tremila test verdi non
 * bastano a dire che il denaro e giusto. Quindi la regola vive **anche** qui, e
 * i tre usi sono distinti e nessuno e ridondante:
 *
 * | Chi | Cosa ne fa |
 * |---|---|
 * | Postgres | **esegue** la regola, in produzione |
 * | questo modulo | la **dichiara**, in una forma che i test possono leggere |
 * | `scripts/wave-4-registro-riconciliazione.mjs` | prova che le due **coincidono**, riga per riga, contro il database vero |
 *
 * Senza il terzo, i primi due sarebbero due contabilita — che e esattamente
 * cio che questa Wave vieta. Il terzo e la ragione per cui non lo sono.
 *
 * ## Cosa questo modulo non fa
 *
 * Non decide i permessi. Una riga del registro non sa chi la sta leggendo: i
 * verdetti `canEdit`, `canReverse` e `canReconcile` li applica
 * `src/lib/server/accounting.ts`, che il ruolo lo conosce.
 */

import {
  fiscalYearOfEntry,
  normalizeActivityScope,
  toCents,
  type AccountingLine,
  type AccountingSourceDomain,
  type CounterpartyKind,
  type ReconciliationStatus,
} from "./model";
import {
  projectFundingSettlements,
  projectPaymentTransactions,
  projectSportWorkPayouts,
  sortAccountingLines,
  type FundingSettlementRow,
  type PaymentTransactionRow,
  type SportWorkOutboundRow,
} from "./projection";

const testo = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text || null;
};

const iso = (value: unknown): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/**
 * Le colonne temporali sono **`Date`**, come quelle che Postgres restituisce.
 *
 * Non e cosmesi. Un filtro `entry_date: { gte, lte }` confronta la colonna con
 * un `Date`, e una riga che porta una stringa ISO non e ne maggiore ne minore:
 * il confronto risponde `false` in silenzio e la riga sparisce. E il modo in
 * cui una proiezione che sembrava corretta faceva svanire tutti gli incassi da
 * un filtro per stagione.
 */
const data = (value: unknown): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

/**
 * Da dove viene una riga del registro.
 *
 * Non e un dettaglio di presentazione: e cio che decide **se si puo toccare**.
 * `entry` e di questa contabilita e si modifica e si storna; `projected`
 * appartiene a un dominio proprietario e si corregge li, dove ci sono i suoi
 * permessi, i suoi invarianti e il suo audit; `legacy` e il blob storico, che
 * non ha nemmeno un conto a cui appartenere.
 */
export const LEDGER_ROW_KINDS = ["entry", "projected", "legacy"] as const;
export type LedgerRowKind = (typeof LEDGER_ROW_KINDS)[number];

/**
 * Una riga della vista, con i nomi delle **colonne** e non quelli del dominio.
 *
 * La forma e quella che Prisma restituisce leggendo `accounting_ledger_lines`,
 * ed e voluta: il codice di lettura ne conosce una sola, e il doppio dei test
 * puo produrne una identica.
 */
export type LedgerViewRow = {
  id: string;
  row_kind: LedgerRowKind;
  organization_id: string;
  entry_date: Date;
  fiscal_year: number;
  season_id: string | null;
  direction: string;
  amount_cents: number;
  currency: string;
  financial_account_id: string | null;
  financial_account_name: string | null;
  operation_type_code: string | null;
  operation_type_label: string | null;
  activity_scope: string;
  description: string;
  notes: string | null;
  payment_method: string | null;
  counterparty_kind: string | null;
  counterparty_id: string | null;
  counterparty_label: string | null;
  source_domain: string;
  source_id: string | null;
  document_kind: string | null;
  document_id: string | null;
  document_number: string | null;
  site_id: string | null;
  reconciliation_status: string;
  value_date: Date | null;
  bank_reference: string | null;
  transfer_group_id: string | null;
  reversal_of_id: string | null;
  reversed_at: Date | null;
  reversal_reason: string | null;
  created_by: string | null;
  created_at: Date | null;
  search_text: string | null;
};

/* ========================================================================== */
/* I movimenti propri                                                          */
/* ========================================================================== */

export type OwnEntryRow = {
  id: string;
  organization_id: string;
  entry_date: Date | string;
  fiscal_year: number;
  season_id?: string | null;
  direction: string;
  amount_cents: number;
  currency?: string | null;
  financial_account_id?: string | null;
  operation_type_id?: string | null;
  operation_type_code?: string | null;
  operation_type_label_snapshot?: string | null;
  activity_scope_snapshot?: string | null;
  description: string;
  notes?: string | null;
  payment_method?: string | null;
  counterparty_kind?: string | null;
  counterparty_id?: string | null;
  counterparty_label?: string | null;
  source_domain?: string | null;
  source_id?: string | null;
  document_kind?: string | null;
  document_id?: string | null;
  site_id?: string | null;
  reconciliation_status?: string | null;
  value_date?: Date | string | null;
  bank_reference?: string | null;
  transfer_group_id?: string | null;
  reversal_of_id?: string | null;
  reversed_at?: Date | string | null;
  reversal_reason?: string | null;
  created_by?: string | null;
  created_at?: Date | string | null;
  _accountName?: string | null;
  _operationTypeLabel?: string | null;
  _documentNumber?: string | null;
};

/**
 * Una riga di `accounting_entries` diventa una riga di registro.
 *
 * L'identificativo e **prefissato per dominio**: due domini non possono
 * collidere, e chi legge una riga sa da dove viene senza guardare altro.
 */
export const projectOwnEntries = (
  rows: readonly OwnEntryRow[],
): LedgerViewRow[] =>
  rows.map((row) => {
    /*
      L'etichetta congelata vince su quella corrente. Invertire l'ordine
      farebbe cambiare nome alle causali del passato ogni volta che qualcuno
      ne corregge una: e la stessa disciplina dello snapshot di un documento.
    */
    const etichetta =
      testo(row.operation_type_label_snapshot) || testo(row._operationTypeLabel);

    return {
      id: `accounting-entry:${row.id}`,
      row_kind: "entry",
      organization_id: String(row.organization_id),
      entry_date: data(row.entry_date) as Date,
      fiscal_year: Number(row.fiscal_year),
      season_id: testo(row.season_id),
      direction: String(row.direction),
      amount_cents: Number(row.amount_cents) || 0,
      currency: testo(row.currency) || "EUR",
      financial_account_id: testo(row.financial_account_id),
      financial_account_name: testo(row._accountName),
      operation_type_code: testo(row.operation_type_code),
      operation_type_label: etichetta,
      activity_scope: normalizeActivityScope(row.activity_scope_snapshot),
      description: String(row.description ?? ""),
      notes: testo(row.notes),
      payment_method: testo(row.payment_method),
      counterparty_kind: testo(row.counterparty_kind),
      counterparty_id: testo(row.counterparty_id),
      counterparty_label: testo(row.counterparty_label),
      source_domain: testo(row.source_domain) || "MANUAL",
      source_id: testo(row.source_id),
      document_kind: testo(row.document_kind),
      document_id: testo(row.document_id),
      document_number: testo(row._documentNumber),
      site_id: testo(row.site_id),
      reconciliation_status: testo(row.reconciliation_status) || "unreconciled",
      value_date: data(row.value_date),
      bank_reference: testo(row.bank_reference),
      transfer_group_id: testo(row.transfer_group_id),
      reversal_of_id: testo(row.reversal_of_id),
      reversed_at: data(row.reversed_at),
      reversal_reason: testo(row.reversal_reason),
      created_by: testo(row.created_by),
      created_at: data(row.created_at),
      search_text: testoDiRicerca([
        row.description,
        row.counterparty_label,
        etichetta,
        row.operation_type_code,
        row.notes,
        row.bank_reference,
      ]),
    };
  });

/* ========================================================================== */
/* I movimenti storici, che vivono ancora nel JSON                             */
/* ========================================================================== */

/**
 * Le righe scritte prima che la prima nota esistesse, lette dal blob
 * `clubs.transactions` / `clubs.transfers` e mostrate in sola lettura.
 *
 * **Non hanno un conto**, e non gliene viene attribuito uno: il loro effetto e
 * gia dentro il saldo di apertura dei conti travasati, e assegnarle a una cassa
 * le conterebbe due volte.
 *
 * **Non hanno una causale**, e neanche questa viene inventata: compaiono come
 * `unspecified`, che e la verita. Il rendiconto le contera fra le «non
 * classificate» invece di nasconderle in un totale — ed e cosi che un club
 * capisce che ha del lavoro di classificazione da fare.
 */
export const projectLegacyClubMovements = (club: any): LedgerViewRow[] => {
  const organizationId = String(club?.id || "");
  if (!organizationId) return [];

  const guscio = (entryDate: string): Omit<LedgerViewRow, "id" | "direction" | "amount_cents" | "description" | "payment_method" | "source_domain" | "source_id" | "search_text"> => ({
    row_kind: "legacy",
    organization_id: organizationId,
    entry_date: data(entryDate) as Date,
    fiscal_year: fiscalYearOfEntry(entryDate),
    season_id: null,
    currency: "EUR",
    financial_account_id: null,
    financial_account_name: null,
    operation_type_code: null,
    operation_type_label: null,
    activity_scope: "unspecified",
    notes: null,
    counterparty_kind: null,
    counterparty_id: null,
    counterparty_label: null,
    document_kind: null,
    document_id: null,
    document_number: null,
    site_id: null,
    reconciliation_status: "unreconciled",
    value_date: null,
    bank_reference: null,
    transfer_group_id: null,
    reversal_of_id: null,
    reversed_at: null,
    reversal_reason: null,
    created_by: null,
    created_at: data(entryDate),
  });

  const movimenti = asArray(club.transactions).flatMap(
    (row, index): LedgerViewRow[] => {
      const entryDate = iso(row?.date) || iso(row?.created_at);
      if (!entryDate) return [];
      const amountCents = Math.abs(toCents(Number(row?.amount) || 0));
      if (amountCents === 0) return [];

      const tipo = String(row?.type || row?.direction || "income").toLowerCase();
      const descrizione =
        testo(row?.description) || testo(row?.title) || "Movimento storico";

      return [
        {
          ...guscio(entryDate),
          id: `legacy-transaction:${row?.id || index}`,
          direction: ["expense", "uscita", "out"].includes(tipo) ? "OUT" : "IN",
          amount_cents: amountCents,
          source_domain: "MANUAL",
          source_id: String(row?.id || `legacy-${index}`),
          description: descrizione,
          payment_method: testo(row?.paymentMethod) || testo(row?.method),
          search_text: testoDiRicerca([descrizione]),
        },
      ];
    },
  );

  const giroconti = asArray(club.transfers).flatMap(
    (row, index): LedgerViewRow[] => {
      const entryDate = iso(row?.date) || iso(row?.created_at);
      if (!entryDate) return [];
      const amountCents = Math.abs(toCents(Number(row?.amount) || 0));
      if (amountCents === 0) return [];

      /*
        Un giroconto storico e **una** riga sola nel blob, non due. Resta una
        riga qui, con verso `OUT` per convenzione e senza gruppo: non e una
        gamba di niente, e presentarlo come due meta suggerirebbe un
        collegamento che nel dato non c'e.
      */
      const descrizione = testo(row?.description) || "Giroconto storico";

      return [
        {
          ...guscio(entryDate),
          id: `legacy-transfer:${row?.id || index}`,
          direction: "OUT",
          amount_cents: amountCents,
          source_domain: "INTERNAL_TRANSFER",
          source_id: String(row?.id || `legacy-transfer-${index}`),
          description: descrizione,
          payment_method: "Giroconto",
          search_text: testoDiRicerca([descrizione]),
        },
      ];
    },
  );

  return [...movimenti, ...giroconti];
};

/* ========================================================================== */
/* La composizione                                                             */
/* ========================================================================== */

/**
 * Il testo su cui la pagina cerca: gli stessi campi, nello stesso ordine, in
 * minuscolo. Sta nella riga e non nel codice di ricerca perche il filtro possa
 * scendere nel `WHERE` invece di scorrere in memoria trentacinquemila righe.
 */
const testoDiRicerca = (parti: readonly unknown[]) => {
  const testo = parti
    .map((parte) => String(parte ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return testo || null;
};

/**
 * Una riga proiettata da un dominio proprietario, nella forma della vista.
 *
 * Le proiezioni producono `AccountingLine`, che e la forma del **dominio**;
 * qui si torna alla forma delle **colonne**, perche il registro ne abbia una
 * sola e il codice di lettura non debba distinguere.
 */
const daProiezione = (line: AccountingLine): LedgerViewRow => ({
  id: line.id,
  row_kind: "projected",
  organization_id: line.organizationId,
  entry_date: data(line.entryDate) as Date,
  fiscal_year: line.fiscalYear,
  season_id: line.seasonId ?? null,
  direction: line.direction,
  amount_cents: line.amountCents,
  currency: line.currency || "EUR",
  financial_account_id: line.financialAccountId ?? null,
  financial_account_name: line.financialAccountName ?? null,
  operation_type_code: line.operationTypeCode ?? null,
  operation_type_label: line.operationTypeLabel ?? null,
  activity_scope: line.activityScope,
  description: line.description,
  notes: line.notes ?? null,
  payment_method: line.paymentMethod ?? null,
  counterparty_kind: line.counterpartyKind ?? null,
  counterparty_id: line.counterpartyId ?? null,
  counterparty_label: line.counterpartyLabel ?? null,
  source_domain: line.sourceDomain,
  source_id: line.sourceId ?? null,
  document_kind: line.documentKind ?? null,
  document_id: line.documentId ?? null,
  document_number: line.documentNumber ?? null,
  site_id: line.siteId ?? null,
  reconciliation_status: line.reconciliationStatus,
  value_date: data(line.valueDate),
  bank_reference: line.bankReference ?? null,
  transfer_group_id: line.transferGroupId ?? null,
  reversal_of_id: line.reversalOfId ?? null,
  reversed_at: data(line.reversedAt),
  reversal_reason: line.reversalReason ?? null,
  created_by: line.createdBy ?? null,
  created_at: data(line.createdAt),
  search_text: testoDiRicerca([
    line.description,
    line.counterpartyLabel,
    line.operationTypeLabel,
    line.operationTypeCode,
    line.notes,
    line.bankReference,
  ]),
});

/**
 * Il registro intero, dalle cinque sorgenti, nell'ordine in cui il database lo
 * restituisce: **per data decrescente, e a parita di data per identificativo**.
 *
 * L'ordine secondario non e estetico: senza, la pagina 2 puo ripetere righe
 * della pagina 1, perche due letture con lo stesso `ORDER BY` ambiguo non sono
 * obbligate a restituire lo stesso ordine.
 */
export const buildLedgerView = (input: {
  entries?: readonly OwnEntryRow[];
  paymentTransactions?: readonly PaymentTransactionRow[];
  sportWorkPayouts?: readonly SportWorkOutboundRow[];
  fundingSettlements?: readonly FundingSettlementRow[];
  clubs?: readonly any[];
}): LedgerViewRow[] => {
  const righe: LedgerViewRow[] = [
    ...projectOwnEntries(input.entries || []),
    ...projectPaymentTransactions(input.paymentTransactions || []).map(daProiezione),
    ...projectSportWorkPayouts(input.sportWorkPayouts || []).map(daProiezione),
    ...projectFundingSettlements(input.fundingSettlements || []).map(daProiezione),
    ...(input.clubs || []).flatMap((club) => projectLegacyClubMovements(club)),
  ];

  return ordinaRigheRegistro(righe);
};

/** L'ordine del registro: data decrescente, poi identificativo crescente. */
export const ordinaRigheRegistro = (righe: readonly LedgerViewRow[]) =>
  [...righe].sort((a, b) => {
    const ta = Date.parse(String(iso(a.entry_date) || ""));
    const tb = Date.parse(String(iso(b.entry_date) || ""));
    if (tb !== ta) return tb - ta;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

/* ========================================================================== */
/* Dalla riga della vista alla riga di dominio                                 */
/* ========================================================================== */

/**
 * Cosa si puo fare su una riga, e perche cosi poco.
 *
 * Una riga **stornata** e uno **storno** non si toccano: sono la coppia che
 * racconta una correzione, e modificarne una meta la renderebbe illeggibile.
 * Un **giroconto** non si modifica gamba per gamba — si storna intero,
 * altrimenti le due meta possono divergere e il denaro sparisce fra due conti.
 * Nessuna riga si **cancella**: e la regola della Wave.
 *
 * Le righe proiettate e quelle storiche non permettono niente: un compenso si
 * storna dove i compensi si erogano, perche li ci sono i permessi del dominio,
 * i suoi invarianti e il suo audit.
 */
export const ledgerRowToLine = (
  row: LedgerViewRow,
  can: { reverse: boolean; reconcile: boolean; manage: boolean },
): AccountingLine => {
  const propria = row.row_kind === "entry";
  const stornata = Boolean(row.reversed_at);
  const eStorno = row.source_domain === "REVERSAL";
  const giroconto = row.source_domain === "INTERNAL_TRANSFER";

  return {
    id: row.id,
    organizationId: row.organization_id,
    entryDate: iso(row.entry_date) as string,
    fiscalYear: Number(row.fiscal_year),
    seasonId: row.season_id || null,
    direction: row.direction as AccountingLine["direction"],
    amountCents: Number(row.amount_cents) || 0,
    currency: row.currency || "EUR",
    financialAccountId: row.financial_account_id || null,
    financialAccountName: row.financial_account_name || null,
    operationTypeCode: row.operation_type_code || null,
    operationTypeLabel: row.operation_type_label || null,
    activityScope: normalizeActivityScope(row.activity_scope),
    description: row.description,
    notes: row.notes || null,
    paymentMethod: row.payment_method || null,
    counterpartyKind: (row.counterparty_kind as CounterpartyKind) || null,
    counterpartyId: row.counterparty_id || null,
    counterpartyLabel: row.counterparty_label || null,
    sourceDomain: row.source_domain as AccountingSourceDomain,
    sourceId: row.source_id || null,
    documentKind: row.document_kind || null,
    documentId: row.document_id || null,
    documentNumber: row.document_number || null,
    siteId: row.site_id || null,
    reconciliationStatus: row.reconciliation_status as ReconciliationStatus,
    valueDate: iso(row.value_date),
    bankReference: row.bank_reference || null,
    transferGroupId: row.transfer_group_id || null,
    reversalOfId: row.reversal_of_id || null,
    reversedAt: iso(row.reversed_at),
    reversalReason: row.reversal_reason || null,
    createdBy: row.created_by || null,
    createdAt: iso(row.created_at),
    canEdit: propria && can.manage && !stornata && !eStorno && !giroconto,
    canDelete: false,
    canReverse: propria && can.reverse && !stornata && !eStorno,
    canReconcile: propria && can.reconcile && !stornata,
  };
};

/** L'identificativo della riga propria, senza il prefisso di dominio. */
export const ownEntryIdOf = (id: string) =>
  id.startsWith("accounting-entry:") ? id.slice("accounting-entry:".length) : null;

export { sortAccountingLines };
