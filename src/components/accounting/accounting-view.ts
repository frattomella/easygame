import {
  ACTIVITY_SCOPE_LABELS,
  RECONCILIATION_STATUS_LABELS,
  SOURCE_DOMAIN_LABELS,
  fromCents,
  type AccountingLine,
} from "@/lib/accounting/model";

/**
 * Cio che serve alla superficie della prima nota per **mostrare** una riga, e
 * niente di piu.
 *
 * **Perche un modulo e non quattro funzioni sparse nei componenti.** La pagina
 * precedente formattava date e importi in tre punti con tre regole leggermente
 * diverse, e chiamava «Entrate» un numero che il rendiconto chiamava «Pagato».
 * Qui la formattazione sta in un posto solo; la **classificazione** invece non
 * sta qui affatto: etichette, cataloghi e permessi arrivano da
 * `src/lib/accounting/model.ts` e `permissions.ts`, che sono la barriera.
 *
 * Nessuna regola di dominio nasce in questo file. Se una serve e non c'e,
 * appartiene alla barriera o al servizio, non alla schermata.
 */

const currency = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
});

/** Da centesimi a «1.234,56 EUR». Il segno non compare: lo dice il verso. */
export const formatCents = (cents: number) => currency.format(fromCents(cents));

export const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

/** Da `Date` al valore di un `<input type="date">`, in UTC come l'anno fiscale. */
export const toDateInputValue = (date: Date) => date.toISOString().slice(0, 10);

/**
 * L'identificativo da mandare alle rotte di storno e riconciliazione.
 *
 * Una riga di prima nota porta un id **prefissato** (`accounting-entry:<uuid>`,
 * `payment-transaction:<uuid>`, `legacy-transfer:<n>`), perche righe di domini
 * diversi convivono nella stessa lista e senza prefisso due id potrebbero
 * coincidere. Le rotte vogliono l'id nudo della tabella.
 *
 * Restituisce `null` per tutto cio che **non** e una riga propria: una
 * proiezione o un movimento storico non hanno niente da stornare qui, e
 * mandarne l'id a `/reverse` produrrebbe un 404 al posto di un pulsante che
 * non doveva esistere.
 */
export const ownEntryId = (line: Pick<AccountingLine, "id">) => {
  const raw = String(line.id || "");
  return raw.startsWith("accounting-entry:")
    ? raw.slice("accounting-entry:".length)
    : null;
};

export const sourceLabel = (line: AccountingLine) =>
  SOURCE_DOMAIN_LABELS[line.sourceDomain] || line.sourceDomain;

export const reconciliationLabel = (line: AccountingLine) =>
  RECONCILIATION_STATUS_LABELS[line.reconciliationStatus] ||
  line.reconciliationStatus;

export const activityScopeLabel = (line: AccountingLine) =>
  ACTIVITY_SCOPE_LABELS[line.activityScope] || line.activityScope;

/**
 * Il **riepilogo gestionale**, come la rotta lo consegna al browser.
 *
 * **Nessuno di questi numeri si calcola qui.** Li somma
 * `GET /api/v1/accounting/reports`, che li ricava dalle righe **gia filtrate
 * sul server** — non dalla pagina che la prima nota mostra, che ne contiene
 * cento. Sommare nel browser darebbe il totale della pagina spacciato per
 * totale del periodo, e per i crediti sarebbe anche il numero duplicato che il
 * §28 del piano vieta: le rate le somma il loro registro, i contributi i
 * bandi, i compensi il lavoro sportivo.
 */
export type AccountingReportView = {
  disclaimer: string;
  cash: {
    collectedCents: number;
    paidCents: number;
    netCents: number;
    transferCount: number;
  };
  accrual: {
    familyReceivablesCents: number;
    overdueReceivablesCents: number;
    overdueCount: number;
    fundingPendingCents: number;
    sportWorkAccruedUnpaidCents: number;
  };
  /** `null` per chi non ha `accounting.accounts_read`. **Mai zero**. */
  accountBalances: { accountId: string; balanceCents: number }[] | null;
  /** Vero se la lettura si e fermata prima della fine dell'insieme. */
  truncated: boolean;
};

/**
 * Un conto finanziario, **come la rotta lo consegna al browser**.
 *
 * E una copia ridotta di `FinancialAccountRecord`, e la duplicazione e voluta:
 * quel tipo vive in `src/lib/server/financial-accounts.ts`, e un componente
 * client non importa mai da `src/lib/server/**` — trascinerebbe Prisma nel
 * bundle. Qui stanno solo i campi che la schermata mostra.
 */
export type FinancialAccountView = {
  id: string;
  name: string;
  kind: string;
  kindLabel: string;
  isArchived: boolean;
  siteId: string | null;
  /** Assente per chi non ha `accounting.accounts_read`. Mai `0` per difetto. */
  balance: { balanceCents: number } | null;
};

/** Una causale, come la consegna `GET /api/v1/fiscal/operation-types`. */
export type OperationTypeView = {
  code: string;
  label: string;
  directionHint: string | null;
  isActive: boolean;
};

/**
 * Le causali proponibili per un verso.
 *
 * `directionHint` a `null` vuol dire «vale per entrambi», non «per nessuno»:
 * e la disciplina di ADR-0052, per cui un valore non dichiarato resta
 * visibilmente da compilare invece di essere indovinato.
 */
export const operationTypesForDirection = (
  types: readonly OperationTypeView[],
  direction: string,
) =>
  types.filter(
    (type) =>
      type.isActive &&
      (!direction || !type.directionHint || type.directionHint === direction),
  );

/**
 * I filtri della prima nota, nella forma in cui la pagina li tiene.
 *
 * Sono **stringhe** anche dove il dominio ha un enum: sono cio che l'utente ha
 * scelto in una tendina, e la stringa vuota vuol dire «non filtrare». La
 * normalizzazione la fa il servizio, che e l'unico posto in cui e gia scritta.
 */
export type AccountingFilterState = {
  from: string;
  to: string;
  fiscalYear: string;
  financialAccountId: string;
  operationTypeCode: string;
  direction: string;
  sourceDomain: string;
  reconciliationStatus: string;
  siteId: string;
  search: string;
};

export const emptyFilters: AccountingFilterState = {
  from: "",
  to: "",
  fiscalYear: "",
  financialAccountId: "",
  operationTypeCode: "",
  direction: "",
  sourceDomain: "",
  reconciliationStatus: "",
  siteId: "",
  search: "",
};

export const hasActiveFilters = (filters: AccountingFilterState) =>
  Object.values(filters).some((value) => String(value).trim() !== "");

/**
 * Dai filtri alla query della rotta.
 *
 * **Le chiavi assenti restano assenti.** Un `from=` vuoto in querystring arriva
 * al servizio come stringa vuota, non come «nessun filtro», ed e il gemello
 * della trappola di `toFiscalYearFilter`: un parametro che c'e ma non dice
 * niente e piu pericoloso di uno che manca.
 */
export const buildEntriesQuery = (
  filters: AccountingFilterState,
  page: { limit: number; offset: number },
) => {
  const query = new URLSearchParams();

  const put = (key: string, value: string) => {
    const text = String(value || "").trim();
    if (text) query.set(key, text);
  };

  put("from", filters.from);
  put("to", filters.to);
  put("fiscal_year", filters.fiscalYear);
  put("financial_account_id", filters.financialAccountId);
  put("operation_type_code", filters.operationTypeCode);
  put("direction", filters.direction);
  put("source_domain", filters.sourceDomain);
  put("reconciliation_status", filters.reconciliationStatus);
  put("site_id", filters.siteId);
  put("q", filters.search);

  query.set("limit", String(page.limit));
  query.set("offset", String(page.offset));

  return query.toString();
};

/**
 * Dai filtri alla query del **riepilogo**.
 *
 * `GET /api/v1/accounting/reports` accetta gli assi del periodo — date, anno,
 * conto, causale, sede, verso — e **non** origine, stato di riconciliazione e
 * ricerca testuale, che sono modi di restringere l'elenco, non il periodo.
 * Passargliene uno che non conosce non darebbe un errore: darebbe un totale
 * che ignora silenziosamente la restrizione, ed e il motivo per cui questa
 * funzione e separata da `buildEntriesQuery` invece di riusarla.
 */
export const REPORT_UNAWARE_FILTERS: readonly (keyof AccountingFilterState)[] = [
  "sourceDomain",
  "reconciliationStatus",
  "search",
];

export const buildReportQuery = (filters: AccountingFilterState) => {
  const query = new URLSearchParams();

  const put = (key: string, value: string) => {
    const text = String(value || "").trim();
    if (text) query.set(key, text);
  };

  put("from", filters.from);
  put("to", filters.to);
  put("fiscal_year", filters.fiscalYear);
  put("financial_account_id", filters.financialAccountId);
  put("operation_type_code", filters.operationTypeCode);
  put("direction", filters.direction);
  put("site_id", filters.siteId);

  return query.toString();
};

/** Vero se e attivo un filtro che il riepilogo non sa applicare. */
export const hasReportUnawareFilter = (filters: AccountingFilterState) =>
  REPORT_UNAWARE_FILTERS.some((key) => String(filters[key] || "").trim() !== "");

/**
 * Gli anni fiscali proponibili in tendina.
 *
 * L'anno corrente e i quattro precedenti: un club che deve rileggere il 2019
 * usa l'intervallo di date, che non ha limiti. Un elenco che partisse dalla
 * fondazione sarebbe lungo e quasi tutto vuoto.
 */
export const fiscalYearChoices = (today = new Date()) => {
  const current = today.getUTCFullYear();
  return [0, 1, 2, 3, 4].map((back) => current - back);
};
