import {
  isPaymentExcludedFromTotals,
  isPaymentPaidLike,
  paymentCoversInstallment,
} from "./payment-status-utils";

/**
 * Il registro degli incassi di una rata (Workstream A, ADR-0036).
 *
 * **Il difetto che questo modulo chiude.** Fino a qui una rata e un incasso
 * erano *la stessa riga* di `payments`: la rata portava l'importo dovuto e,
 * negli stessi campi, il modo in cui era stata pagata. Ne seguiva tutto il
 * resto — la segreteria doveva spostare a mano lo stato da «In attesa» a
 * «Pagata», una rata da 130 EUR incassata in tre volte non era
 * rappresentabile, e correggere un incasso voleva dire mutare la rata, cioe
 * il debito.
 *
 * Qui la rata resta il **dovuto** (una riga di `payments`) e ogni incasso e un
 * movimento a parte (`payment_transactions`). Lo stato **non e piu un dato**:
 * si ricava confrontando la somma degli incassi validi con il dovuto, e per
 * questo non puo contraddire gli importi.
 *
 * Il modulo e puro: nessuna dipendenza da Prisma, da React o dalla rete, cosi
 * la stessa regola vale per il server, per la scheda atleta e per l'area
 * Movimenti senza essere riscritta tre volte.
 */

/** Da dove arriva un incasso. Solo `MANUAL` e implementato (ADR-0036). */
export const PAYMENT_TRANSACTION_SOURCES = [
  "MANUAL",
  "STRIPE",
  /** Conservato per le righe scritte prima di ADR-0049. Non si scrive piu. */
  "CEDIPAY",
  "IMPORT",
  "OTHER",
] as const;

export type PaymentTransactionSource =
  (typeof PAYMENT_TRANSACTION_SOURCES)[number];

export type NormalizedPaymentTransaction = {
  id: string;
  organizationId: string | null;
  athleteId: string | null;
  /** La rata (riga di `payments`) che questo incasso salda, in tutto o in parte. */
  installmentId: string | null;
  amount: number;
  paidAt: string | null;
  paymentMethod: string | null;
  notes: string | null;
  source: PaymentTransactionSource;
  externalReference: string | null;
  createdBy: string | null;
  createdAt: string | null;
  /** Valorizzato quando l'incasso e stato stornato: non conta piu nei totali. */
  reversedAt: string | null;
  reversedBy: string | null;
  reversalReason: string | null;
  /** Se questo movimento e lo storno di un altro, l'id dell'originale. */
  reversesTransactionId: string | null;
  data: Record<string, any>;
};

export type InstallmentLedgerState = "pending" | "partial" | "paid";

export type InstallmentLedger = {
  /** L'id della riga `payments`: la rata. */
  installmentId: string | null;
  /** L'id della rata dentro il piano, quando la rata nasce da un piano. */
  planInstallmentId: string | null;
  label: string;
  dueDate: string | null;
  dueAmount: number;
  paidAmount: number;
  residualAmount: number;
  state: InstallmentLedgerState;
  overdue: boolean;
  /** Etichette da mostrare insieme: una rata scaduta puo essere anche parziale. */
  statusLabels: string[];
  /** Frazione incassata, fra 0 e 1: alimenta la barra di avanzamento. */
  progress: number;
  transactions: NormalizedPaymentTransaction[];
};

const PENDING_LABEL = "IN ATTESA";
const PARTIAL_LABEL = "PARZIALMENTE PAGATA";
const PAID_LABEL = "PAGATA";
const OVERDUE_LABEL = "SCADUTA";

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const asText = (value: unknown) => String(value ?? "").trim();

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return "";
};

/**
 * Un importo in euro, arrotondato al centesimo.
 *
 * I confronti fra somme si fanno **in centesimi** (vedi `toCents`): sommare
 * 0.1 + 0.2 in virgola mobile non da 0.3, e una rata saldata risulterebbe
 * scoperta di un millesimo di euro.
 */
export const toPaymentAmount = (value: unknown) => {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(asText(value).replace(",", "."));
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
};

const toCents = (value: unknown) => Math.round(toPaymentAmount(value) * 100);

const fromCents = (cents: number) => Number((cents / 100).toFixed(2));

const toIsoOrNull = (value: unknown) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  const raw = asText(value);
  if (!raw) return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
};

export const normalizePaymentTransactionSource = (
  value: unknown,
): PaymentTransactionSource => {
  const token = asText(value).toUpperCase();
  return (PAYMENT_TRANSACTION_SOURCES as readonly string[]).includes(token)
    ? (token as PaymentTransactionSource)
    : "MANUAL";
};

/**
 * Porta una riga di `payment_transactions` — o il suo equivalente in camelCase
 * dal client — a una forma sola.
 *
 * Le due grafie convivono perche il database usa `snake_case` e il client
 * `camelCase`: normalizzare qui evita che ogni schermata debba conoscerle
 * entrambe.
 */
export const normalizePaymentTransaction = (
  value: unknown,
): NormalizedPaymentTransaction | null => {
  const record = asRecord(value);
  const id = firstText(record.id);
  if (!id) return null;

  const data = asRecord(record.data);

  return {
    id,
    organizationId:
      firstText(record.organization_id, record.organizationId) || null,
    athleteId: firstText(record.athlete_id, record.athleteId) || null,
    installmentId:
      firstText(
        record.payment_id,
        record.paymentId,
        record.installment_id,
        record.installmentId,
      ) || null,
    amount: toPaymentAmount(record.amount),
    paidAt: toIsoOrNull(record.paid_at ?? record.paidAt),
    paymentMethod:
      firstText(record.payment_method, record.paymentMethod, record.method) ||
      null,
    notes: firstText(record.notes) || null,
    source: normalizePaymentTransactionSource(record.source),
    externalReference:
      firstText(record.external_reference, record.externalReference) || null,
    createdBy: firstText(record.created_by, record.createdBy) || null,
    createdAt: toIsoOrNull(record.created_at ?? record.createdAt),
    reversedAt: toIsoOrNull(record.reversed_at ?? record.reversedAt),
    reversedBy: firstText(record.reversed_by, record.reversedBy) || null,
    reversalReason:
      firstText(record.reversal_reason, record.reversalReason) || null,
    reversesTransactionId:
      firstText(record.reverses_transaction_id, record.reversesTransactionId) ||
      null,
    data,
  };
};

export const normalizePaymentTransactions = (
  values: unknown,
): NormalizedPaymentTransaction[] =>
  (Array.isArray(values) ? values : [])
    .map(normalizePaymentTransaction)
    .filter(Boolean) as NormalizedPaymentTransaction[];

/**
 * Vero se l'incasso conta ancora nei totali.
 *
 * Uno storno non cancella l'incasso originale: lo marca. Restano entrambi
 * visibili nello storico — un incasso non deve sparire in silenzio — ma
 * nessuno dei due sposta il saldo.
 */
export const isSettledTransaction = (
  transaction: NormalizedPaymentTransaction,
) => !transaction.reversedAt && !transaction.reversesTransactionId;

/** La somma degli incassi validi, in euro. */
export const sumSettledTransactions = (
  transactions: NormalizedPaymentTransaction[] = [],
) =>
  fromCents(
    transactions
      .filter(isSettledTransaction)
      .reduce((total, transaction) => total + toCents(transaction.amount), 0),
  );

/**
 * Ordine cronologico degli incassi di una rata: **dal piu vecchio al piu
 * recente**.
 *
 * E l'ordine di un estratto conto, non quello di una lista di notifiche: chi
 * legge «50 poi 30 poi 50» sta ricostruendo come si e arrivati al saldo, e
 * quella ricostruzione va letta in avanti. La cronologia trasversale — tutti
 * gli incassi del club, senza una rata a fare da contesto — resta invece
 * decrescente, perche li la domanda e «cosa e successo per ultimo».
 * Vedi `docs/knowledge-base/10-ui-ux-conventions.md`.
 */
export const sortTransactionsChronologically = (
  transactions: NormalizedPaymentTransaction[] = [],
) =>
  [...transactions].sort((left, right) => {
    const leftTime = new Date(left.paidAt || left.createdAt || 0).getTime();
    const rightTime = new Date(right.paidAt || right.createdAt || 0).getTime();
    if (leftTime !== rightTime) return leftTime - rightTime;
    return left.id.localeCompare(right.id);
  });

const isOverdue = (dueDate: string | null, now: Date) => {
  if (!dueDate) return false;
  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() < now.getTime();
};

/**
 * Lo stato di una rata, ricavato dagli importi.
 *
 * Una rata scaduta e ancora scoperta porta **due** etichette: «scaduta» dice
 * quando andava pagata, «parzialmente pagata» dice quanto ne resta. Mostrarne
 * una sola perderebbe meta dell'informazione proprio nel caso in cui serve
 * tutta.
 */
export const resolveLedgerState = ({
  dueAmount,
  paidAmount,
}: {
  dueAmount: number;
  paidAmount: number;
}): InstallmentLedgerState => {
  const dueCents = toCents(dueAmount);
  const paidCents = toCents(paidAmount);

  if (paidCents <= 0) return "pending";
  if (dueCents > 0 && paidCents >= dueCents) return "paid";
  return "partial";
};

const buildStatusLabels = (state: InstallmentLedgerState, overdue: boolean) => {
  if (state === "paid") return [PAID_LABEL];
  const base = state === "partial" ? PARTIAL_LABEL : PENDING_LABEL;
  return overdue ? [base, OVERDUE_LABEL] : [base];
};

/**
 * Il registro di una rata: dovuto, incassato, residuo, stato, scadenza.
 *
 * `charge` e la riga di `payments`. `transactions` sono i suoi incassi.
 *
 * **Compatibilita con i dati esistenti.** Prima del registro degli incassi una
 * rata saldata lo dichiarava con `paid_at` e `status = "paid"`, senza nessun
 * movimento a dimostrarlo. Quelle righe non vengono migrate — riscrivere
 * denaro gia registrato e la cosa che si evita — quindi se una rata risulta
 * pagata e non ha nessun incasso, la si considera incassata per intero. Al
 * primo incasso registrato comanda il registro.
 */
export const resolveInstallmentLedger = ({
  charge,
  transactions = [],
  now = new Date(),
}: {
  charge: unknown;
  transactions?: NormalizedPaymentTransaction[];
  now?: Date;
}): InstallmentLedger => {
  const record = asRecord(charge);
  const data = asRecord(record.data);
  const dueAmount = toPaymentAmount(record.amount);
  const dueDate = toIsoOrNull(record.due_date ?? record.dueDate);
  const chargeTransactions = sortTransactionsChronologically(transactions);

  /*
    La compatibilita vale solo per le rate che **non hanno nessun movimento**.
    Basarla sui movimenti ancora validi sarebbe un difetto: stornare l'unico
    incasso di una rata la lascerebbe con `status = "paid"` e zero movimenti
    validi, e la scorciatoia la dichiarerebbe di nuovo saldata — cioe
    l'operazione di storno non avrebbe effetto.
  */
  const cancelled = isPaymentExcludedFromTotals(record);
  const legacyPaid =
    chargeTransactions.length === 0 && !cancelled && isPaymentPaidLike(record);

  const paidAmount = cancelled
    ? 0
    : legacyPaid
      ? dueAmount
      : sumSettledTransactions(chargeTransactions);

  const state = cancelled
    ? "pending"
    : resolveLedgerState({ dueAmount, paidAmount });
  const overdue = state !== "paid" && !cancelled && isOverdue(dueDate, now);
  const residualCents = Math.max(0, toCents(dueAmount) - toCents(paidAmount));

  return {
    installmentId: firstText(record.id) || null,
    planInstallmentId:
      firstText(data.installmentId, data.installment_id) || null,
    label:
      firstText(
        data.installmentLabel,
        data.installment_label,
        record.description,
      ) || "Rata",
    dueDate,
    dueAmount,
    paidAmount,
    residualAmount: fromCents(residualCents),
    state,
    overdue,
    statusLabels: buildStatusLabels(state, overdue),
    progress:
      toCents(dueAmount) > 0
        ? Math.min(1, toCents(paidAmount) / toCents(dueAmount))
        : state === "paid"
          ? 1
          : 0,
    transactions: chargeTransactions,
  };
};

/** Raggruppa gli incassi per rata, cosi ogni riga li trova in tempo costante. */
export const groupTransactionsByInstallment = (
  transactions: NormalizedPaymentTransaction[] = [],
) => {
  const grouped = new Map<string, NormalizedPaymentTransaction[]>();

  for (const transaction of transactions) {
    const key = transaction.installmentId;
    if (!key) continue;
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(transaction);
    } else {
      grouped.set(key, [transaction]);
    }
  }

  return grouped;
};

/**
 * I registri di tutte le rate di un atleta, nell'ordine in cui scadono.
 *
 * `charges` sono le righe di `payments`; le rate annullate restano fuori
 * perche non sono piu un debito.
 */
export const buildInstallmentLedgers = ({
  charges = [],
  transactions = [],
  now = new Date(),
}: {
  charges?: unknown[];
  transactions?: unknown[];
  now?: Date;
}): InstallmentLedger[] => {
  const normalizedTransactions = normalizePaymentTransactions(transactions);
  const grouped = groupTransactionsByInstallment(normalizedTransactions);

  return (Array.isArray(charges) ? charges : [])
    .filter((charge) => !isPaymentExcludedFromTotals(charge))
    .map((charge) =>
      resolveInstallmentLedger({
        charge,
        transactions: grouped.get(asText(asRecord(charge).id)) || [],
        now,
      }),
    )
    .sort((left, right) => {
      const leftTime = left.dueDate ? new Date(left.dueDate).getTime() : null;
      const rightTime = right.dueDate ? new Date(right.dueDate).getTime() : null;
      if (leftTime === null && rightTime === null) return 0;
      if (leftTime === null) return 1;
      if (rightTime === null) return -1;
      return leftTime - rightTime;
    });
};

/**
 * Trova la riga `payments` che rappresenta una rata del piano.
 *
 * Il legame autorevole e `data.installmentId`, scritto alla generazione delle
 * rate; `paymentCoversInstallment` porta con se la compatibilita con le righe
 * piu vecchie, che si riconoscevano solo dall'etichetta.
 */
export const findChargeForPlanInstallment = (
  planInstallment: unknown,
  charges: unknown[] = [],
) =>
  (Array.isArray(charges) ? charges : []).find(
    (charge) =>
      !isPaymentExcludedFromTotals(charge) &&
      paymentCoversInstallment(charge, planInstallment),
  ) || null;

export type LedgerTotals = {
  dueAmount: number;
  paidAmount: number;
  residualAmount: number;
  overdueAmount: number;
  overdueCount: number;
  paidCount: number;
  partialCount: number;
  pendingCount: number;
};

/**
 * I totali di un insieme di rate.
 *
 * Il riepilogo incassi, il totale pagato e il residuo si leggono da qui: se
 * ognuno se li ricalcolasse a modo suo, un incasso registrato aggiornerebbe
 * un riquadro e non l'altro.
 */
export const summarizeLedgers = (
  ledgers: InstallmentLedger[] = [],
): LedgerTotals => {
  let dueCents = 0;
  let paidCents = 0;
  let residualCents = 0;
  let overdueCents = 0;
  let overdueCount = 0;
  let paidCount = 0;
  let partialCount = 0;
  let pendingCount = 0;

  for (const ledger of ledgers) {
    dueCents += toCents(ledger.dueAmount);
    paidCents += toCents(ledger.paidAmount);
    residualCents += toCents(ledger.residualAmount);

    if (ledger.overdue) {
      overdueCount += 1;
      overdueCents += toCents(ledger.residualAmount);
    }

    if (ledger.state === "paid") paidCount += 1;
    else if (ledger.state === "partial") partialCount += 1;
    else pendingCount += 1;
  }

  return {
    dueAmount: fromCents(dueCents),
    paidAmount: fromCents(paidCents),
    residualAmount: fromCents(residualCents),
    overdueAmount: fromCents(overdueCents),
    overdueCount,
    paidCount,
    partialCount,
    pendingCount,
  };
};

/**
 * Valida un incasso prima di registrarlo.
 *
 * Restituisce il messaggio dell'errore, o `null` se l'incasso e accettabile.
 * Vive qui e non nel route handler perche la stessa regola deve valere per la
 * finestra di dialogo, che deve poter spiegare il rifiuto **prima** di inviare
 * la richiesta.
 */
export const validatePaymentTransactionInput = ({
  amount,
  paymentMethod,
  ledger,
  allowOverpayment = false,
}: {
  amount: unknown;
  paymentMethod?: unknown;
  ledger?: InstallmentLedger | null;
  allowOverpayment?: boolean;
}): string | null => {
  const value = toPaymentAmount(amount);

  if (!(value > 0)) {
    return "L'importo dell'incasso deve essere maggiore di zero";
  }

  if (!asText(paymentMethod)) {
    return "Scegli il metodo di pagamento";
  }

  if (
    !allowOverpayment &&
    ledger &&
    toCents(value) > toCents(ledger.residualAmount)
  ) {
    return `L'importo supera il residuo della rata (${ledger.residualAmount.toFixed(2)} EUR)`;
  }

  return null;
};
