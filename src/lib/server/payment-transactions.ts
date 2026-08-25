import { prisma } from "./prisma";
import {
  isSettledTransaction,
  normalizePaymentTransaction,
  normalizePaymentTransactionSource,
  normalizePaymentTransactions,
  resolveInstallmentLedger,
  sortTransactionsChronologically,
  sumSettledTransactions,
  toPaymentAmount,
  validatePaymentTransactionInput,
  type NormalizedPaymentTransaction,
  type PaymentTransactionSource,
} from "@/lib/payments/installment-ledger";

/**
 * Il servizio degli incassi: **l'unico** punto in cui EasyGame registra o
 * storna un movimento di denaro di un atleta (Workstream A, ADR-0036).
 *
 * Tre cose accadono qui e non possono accadere altrove.
 *
 * 1. **La rata non si tocca a mano.** Chi registra un incasso dichiara
 *    importo, metodo e data; `status`, `paid_at` e `method` della rata li
 *    riscrive questo modulo, ricalcolandoli dal registro. E la ragione per cui
 *    lo stato non puo piu contraddire gli importi.
 * 2. **Le due scritture stanno in una transazione.** Inserire l'incasso e
 *    aggiornare la rata sono un'operazione sola: a meta strada esisterebbe un
 *    incasso che non ha spostato nessun saldo.
 * 3. **Niente si cancella.** Correggere vuol dire stornare e registrare di
 *    nuovo. Restano visibili l'originale, lo storno e il motivo.
 *
 * Il confine di sicurezza e `organization_id`, come per ogni risorsa di club:
 * un incasso di un altro club non si legge, non si crea e non si storna, e il
 * messaggio contiene «Accesso negato» perche il route handler lo mappi su 403.
 */

export type PaymentTransactionScope = {
  userId: string;
  activeOrganizationId: string | null;
  allowedOrganizationIds: string[];
};

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

const asText = (value: unknown) => String(value ?? "").trim();

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const ensureOrganizationAccess = (
  scope: PaymentTransactionScope | undefined,
  organizationId: string | null | undefined,
) => {
  if (!scope) return;
  if (!organizationId) {
    throw denied("incasso senza club");
  }
  if (!scope.allowedOrganizationIds.includes(organizationId)) {
    throw denied("l'incasso appartiene a un altro club");
  }
};

const resolveOrganizationId = (
  scope: PaymentTransactionScope | undefined,
  requested?: string | null,
) => {
  const wanted = asText(requested);

  if (!scope) {
    if (!wanted) throw new Error("Nessun club indicato per l'incasso");
    return wanted;
  }

  if (wanted) {
    ensureOrganizationAccess(scope, wanted);
    return wanted;
  }

  if (scope.activeOrganizationId) return scope.activeOrganizationId;

  throw new Error("Nessun club attivo selezionato");
};

const toDateOrNull = (value: unknown) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = asText(value);
  if (!raw) return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const transactionClient = () => (prisma as any).paymentTransaction;
const chargeClient = () => (prisma as any).athletePayment;

/* --------------------------------------------------------------- lettura */

export type ListPaymentTransactionsFilter = {
  organizationId?: string | null;
  athleteId?: string | null;
  paymentId?: string | null;
};

/**
 * Gli incassi di un club, di un atleta o di una singola rata.
 *
 * Ordine **crescente**: e un estratto conto, e un estratto conto si legge
 * dall'inizio. Le superfici che mostrano una cronologia trasversale lo
 * riordinano a modo loro.
 */
export const listPaymentTransactions = async (
  filter: ListPaymentTransactionsFilter,
  scope?: PaymentTransactionScope,
): Promise<NormalizedPaymentTransaction[]> => {
  const organizationId = resolveOrganizationId(scope, filter.organizationId);
  const athleteId = asText(filter.athleteId);
  const paymentId = asText(filter.paymentId);

  const rows = await transactionClient().findMany({
    where: {
      organization_id: organizationId,
      ...(athleteId ? { athlete_id: athleteId } : {}),
      ...(paymentId ? { payment_id: paymentId } : {}),
    },
    orderBy: [{ paid_at: "asc" }, { created_at: "asc" }],
  });

  /*
    L'ordine si riafferma qui e non si eredita dalla query: la stessa lista
    passa anche da percorsi che non sono un `findMany`, e due cronologie
    ordinate in modo diverso sono peggio di una cronologia non ordinata.
  */
  return sortTransactionsChronologically(normalizePaymentTransactions(rows));
};

export const getPaymentTransactionById = async (
  transactionId: string,
  scope?: PaymentTransactionScope,
) => {
  const row = await transactionClient().findUnique({
    where: { id: asText(transactionId) },
  });

  if (!row) {
    throw new Error("Incasso non trovato");
  }

  ensureOrganizationAccess(scope, row.organization_id);
  return row;
};

/* ------------------------------------------------- stato derivato di una rata */

/**
 * Riscrive `status`, `paid_at` e `method` di una rata a partire dai suoi
 * incassi.
 *
 * I tre campi restano nella tabella perche mezza applicazione — riepiloghi,
 * report, area Movimenti, app mobile — li legge; ma da qui in avanti sono una
 * **copia** del registro, non una dichiarazione dell'operatore. `data.ledger`
 * porta con se anche incassato e residuo, cosi chi legge la riga senza
 * caricare i movimenti vede numeri coerenti.
 */
const recomputeChargeFromLedger = async (
  client: any,
  chargeId: string,
) => {
  const charge = await client.athletePayment.findUnique({
    where: { id: chargeId },
  });

  if (!charge) return null;

  const rows = await client.paymentTransaction.findMany({
    where: { payment_id: chargeId },
    orderBy: [{ paid_at: "asc" }, { created_at: "asc" }],
  });

  const transactions = normalizePaymentTransactions(rows);
  const ledger = resolveInstallmentLedger({ charge, transactions });
  const settled = transactions.filter(isSettledTransaction);
  const lastSettled = settled[settled.length - 1] || null;

  /*
    Una rata annullata resta annullata: il registro dice quanto e stato
    incassato, non se il debito esista ancora. Sovrascrivere `cancelled` qui
    resusciterebbe rate che qualcuno ha tolto di mezzo di proposito.
  */
  const currentData = asRecord(charge.data);
  if (currentData.excludedFromTotals === true) {
    return charge;
  }

  const status =
    ledger.state === "paid"
      ? "paid"
      : ledger.state === "partial"
        ? "partially_paid"
        : "pending";

  return client.athletePayment.update({
    where: { id: chargeId },
    data: {
      status,
      paid_at:
        ledger.state === "paid" && lastSettled?.paidAt
          ? new Date(lastSettled.paidAt)
          : null,
      method: lastSettled?.paymentMethod || charge.method || null,
      data: {
        ...currentData,
        ledger: {
          dueAmount: ledger.dueAmount,
          paidAmount: ledger.paidAmount,
          residualAmount: ledger.residualAmount,
          state: ledger.state,
          transactionCount: settled.length,
          updatedAt: new Date().toISOString(),
        },
      },
    },
  });
};

/**
 * Lo stato di una rata dopo un'operazione: la rata riscritta e i suoi incassi.
 *
 * Le schermate lo usano per aggiornarsi senza rileggere l'intera scheda: un
 * incasso registrato deve spostare rata, riepilogo e residuo nello stesso
 * istante, senza che nessuno prema «aggiorna».
 */
export type PaymentTransactionResult = {
  transaction: NormalizedPaymentTransaction;
  charge: Record<string, any> | null;
  transactions: NormalizedPaymentTransaction[];
};

/* -------------------------------------------------------------- scrittura */

export type CreatePaymentTransactionInput = {
  organizationId?: string | null;
  athleteId?: string | null;
  /** La rata da saldare. Un incasso senza rata e ammesso: e un acconto libero. */
  paymentId?: string | null;
  amount: unknown;
  paidAt?: unknown;
  paymentMethod: unknown;
  notes?: unknown;
  source?: unknown;
  externalReference?: unknown;
  /** Consente di incassare piu del residuo: lo decide chi chiama, non il default. */
  allowOverpayment?: boolean;
};

/**
 * Registra un incasso e riallinea la rata.
 *
 * L'importo predefinito lo sceglie l'interfaccia (il residuo); qui si valida
 * quello che arriva davvero, perche un client non e una garanzia.
 */
export const createPaymentTransaction = async (
  input: CreatePaymentTransactionInput,
  scope?: PaymentTransactionScope,
): Promise<PaymentTransactionResult> => {
  const paymentId = asText(input.paymentId) || null;

  let charge: any = null;
  if (paymentId) {
    charge = await chargeClient().findUnique({ where: { id: paymentId } });
    if (!charge) {
      throw new Error("Rata non trovata");
    }
    ensureOrganizationAccess(scope, charge.organization_id);
  }

  const organizationId = charge
    ? charge.organization_id
    : resolveOrganizationId(scope, input.organizationId);

  if (charge) {
    ensureOrganizationAccess(scope, organizationId);
  }

  const amount = toPaymentAmount(input.amount);
  const paymentMethod = asText(input.paymentMethod);
  const paidAt = toDateOrNull(input.paidAt) || new Date();

  const existing = paymentId
    ? normalizePaymentTransactions(
        await transactionClient().findMany({ where: { payment_id: paymentId } }),
      )
    : [];

  const ledger = charge
    ? resolveInstallmentLedger({ charge, transactions: existing })
    : null;

  const validationError = validatePaymentTransactionInput({
    amount,
    paymentMethod,
    ledger,
    allowOverpayment: Boolean(input.allowOverpayment) || !charge,
  });

  if (validationError) {
    throw new Error(validationError);
  }

  const athleteId =
    asText(input.athleteId) || asText(charge?.athlete_id) || null;
  const source: PaymentTransactionSource = normalizePaymentTransactionSource(
    input.source,
  );

  if (source !== "MANUAL") {
    /*
      I provider non sono implementati (ADR-0013, ADR-0036): accettare qui un
      incasso dichiarato «STRIPE» vorrebbe dire registrare denaro che nessuno
      ha incassato. Il campo esiste perche il modello sia pronto, non perche
      sia gia utilizzabile.
    */
    throw new Error(
      "Solo gli incassi manuali sono registrabili: i provider di pagamento online non sono ancora attivi",
    );
  }

  const created = await (prisma as any).$transaction(async (client: any) => {
    const row = await client.paymentTransaction.create({
      data: {
        organization_id: organizationId,
        athlete_id: athleteId,
        payment_id: paymentId,
        amount,
        paid_at: paidAt,
        payment_method: paymentMethod,
        notes: asText(input.notes) || null,
        source,
        external_reference: asText(input.externalReference) || null,
        created_by: scope?.userId || null,
        data: {},
      },
    });

    const updatedCharge = paymentId
      ? await recomputeChargeFromLedger(client, paymentId)
      : null;

    const transactions = paymentId
      ? normalizePaymentTransactions(
          await client.paymentTransaction.findMany({
            where: { payment_id: paymentId },
            orderBy: [{ paid_at: "asc" }, { created_at: "asc" }],
          }),
        )
      : [];

    return { row, updatedCharge, transactions };
  });

  return {
    transaction: normalizePaymentTransaction(
      created.row,
    ) as NormalizedPaymentTransaction,
    charge: created.updatedCharge,
    transactions: created.transactions,
  };
};

export type ReversePaymentTransactionInput = {
  transactionId: string;
  reason?: unknown;
};

/**
 * Storna un incasso.
 *
 * Non lo cancella: marca l'originale con `reversed_at` e crea il movimento di
 * segno opposto che lo compensa. Lo storico continua a raccontare cosa e
 * successo — quanto era stato incassato, quando, da chi e perche e stato
 * annullato — e i totali tornano indietro senza che nessuna riga scompaia.
 *
 * Per **correggere** un incasso sbagliato si storna e si registra di nuovo:
 * modificare l'importo di un movimento gia registrato riscriverebbe la storia.
 */
export const reversePaymentTransaction = async (
  input: ReversePaymentTransactionInput,
  scope?: PaymentTransactionScope,
): Promise<PaymentTransactionResult> => {
  const original = await getPaymentTransactionById(input.transactionId, scope);

  if (original.reversed_at) {
    throw new Error("Questo incasso e gia stato stornato");
  }

  if (original.reverses_transaction_id) {
    throw new Error("Uno storno non si storna: registra un nuovo incasso");
  }

  const reason = asText(input.reason) || "Storno registrato dalla segreteria";
  const now = new Date();
  const paymentId = original.payment_id || null;

  const result = await (prisma as any).$transaction(async (client: any) => {
    await client.paymentTransaction.update({
      where: { id: original.id },
      data: {
        reversed_at: now,
        reversed_by: scope?.userId || null,
        reversal_reason: reason,
      },
    });

    const row = await client.paymentTransaction.create({
      data: {
        organization_id: original.organization_id,
        athlete_id: original.athlete_id,
        payment_id: paymentId,
        amount: -toPaymentAmount(original.amount),
        paid_at: now,
        payment_method: original.payment_method,
        notes: reason,
        source: normalizePaymentTransactionSource(original.source),
        external_reference: original.external_reference,
        created_by: scope?.userId || null,
        reverses_transaction_id: original.id,
        data: {},
      },
    });

    const updatedCharge = paymentId
      ? await recomputeChargeFromLedger(client, paymentId)
      : null;

    const transactions = paymentId
      ? normalizePaymentTransactions(
          await client.paymentTransaction.findMany({
            where: { payment_id: paymentId },
            orderBy: [{ paid_at: "asc" }, { created_at: "asc" }],
          }),
        )
      : [];

    return { row, updatedCharge, transactions };
  });

  return {
    transaction: normalizePaymentTransaction(
      result.row,
    ) as NormalizedPaymentTransaction,
    charge: result.updatedCharge,
    transactions: result.transactions,
  };
};

/** Il totale incassato su una rata, letto dal registro. */
export const getSettledAmountForCharge = async (
  paymentId: string,
  scope?: PaymentTransactionScope,
) => {
  const transactions = await listPaymentTransactions({ paymentId }, scope);
  return sumSettledTransactions(transactions);
};
