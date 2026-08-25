const CANCELLED_PAYMENT_STATUSES = new Set([
  "cancelled",
  "canceled",
  "voided",
  "deleted",
  "annullato",
  "annullata",
  "stornato",
  "stornata",
]);

const PAID_PAYMENT_STATUSES = new Set([
  "paid",
  "completed",
  "complete",
  "pagato",
  "pagata",
  "saldato",
  "saldata",
]);

export const toPaymentStatusToken = (value: unknown) =>
  String(value || "").trim().toLowerCase();

export const isCancelledPaymentStatus = (value: unknown) =>
  CANCELLED_PAYMENT_STATUSES.has(toPaymentStatusToken(value));

export const isPaidPaymentStatus = (value: unknown) =>
  PAID_PAYMENT_STATUSES.has(toPaymentStatusToken(value));

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

export const getPaymentDataRecord = (payment: unknown) => {
  const record = asRecord(payment);
  return asRecord(record.data);
};

export const isPaymentExcludedFromTotals = (payment: unknown) => {
  const record = asRecord(payment);
  const data = getPaymentDataRecord(record);

  return (
    data.excludedFromTotals === true ||
    data.excludeFromTotals === true ||
    isCancelledPaymentStatus(record.status) ||
    isCancelledPaymentStatus(data.status)
  );
};

export const isPaymentPaidLike = (payment: unknown) => {
  if (isPaymentExcludedFromTotals(payment)) {
    return false;
  }

  const record = asRecord(payment);
  return Boolean(record.paid_at || record.paidAt) || isPaidPaymentStatus(record.status);
};

export type InstallmentPaymentState =
  | "paid"
  | "partial"
  | "pending"
  | "unbilled";

const asText = (value: unknown) => String(value ?? "").trim().toLowerCase();

/**
 * Vero se il pagamento registrato copre questa rata.
 *
 * `syncAthleteEnrollmentInstallmentPayments` scrive `data.installmentId` su
 * ogni pagamento generato: e il legame autorevole. La descrizione e l'etichetta
 * servono solo per i pagamenti creati prima che quel campo esistesse.
 */
export const paymentCoversInstallment = (
  payment: unknown,
  installment: unknown,
) => {
  const installmentRecord = asRecord(installment);
  const installmentId = asText(installmentRecord.id);
  const data = getPaymentDataRecord(payment);
  const paymentInstallmentId = asText(
    data.installmentId ?? data.installment_id,
  );

  if (installmentId && paymentInstallmentId) {
    return paymentInstallmentId === installmentId;
  }

  const label = asText(installmentRecord.label);
  if (!label) {
    return false;
  }

  if (asText(data.installmentLabel ?? data.installment_label) === label) {
    return true;
  }

  const description = asText(asRecord(payment).description);
  return description.endsWith(`- ${label}`) || description === label;
};

/**
 * Stato reale di una rata del piano.
 *
 * Il Riepilogo Incasso mostrava «In attesa» come costante nel markup, quindi
 * anche dopo un incasso registrato (WP-33). `unbilled` distingue la rata per
 * cui non esiste ancora nessun pagamento generato.
 */
export const resolveInstallmentPaymentStatus = (
  installment: unknown,
  payments: unknown[] = [],
) => {
  const related = (Array.isArray(payments) ? payments : []).filter(
    (payment) =>
      !isPaymentExcludedFromTotals(payment) &&
      paymentCoversInstallment(payment, installment),
  );

  if (related.length === 0) {
    return {
      state: "unbilled" as InstallmentPaymentState,
      label: "Da generare",
      payment: null as unknown,
    };
  }

  const paid = related.find((payment) => isPaymentPaidLike(payment));
  if (paid) {
    return {
      state: "paid" as InstallmentPaymentState,
      label: "Pagato",
      payment: paid,
    };
  }

  /*
    Un incasso parziale non e ne «pagato» ne «in attesa»: `data.ledger` porta
    quanto ne e stato incassato, scritto dal servizio incassi nella stessa
    transazione che aggiorna la rata (ADR-0036). Senza quel campo la riga e
    anteriore al registro e vale il comportamento di prima.
  */
  const partial = related.find((payment) => {
    const ledger = asRecord(getPaymentDataRecord(payment).ledger);
    return Number(ledger.paidAmount || 0) > 0;
  });

  if (partial) {
    const ledger = asRecord(getPaymentDataRecord(partial).ledger);
    return {
      state: "partial" as InstallmentPaymentState,
      label: `Parziale — residuo ${Number(ledger.residualAmount || 0).toFixed(2)} EUR`,
      payment: partial,
    };
  }

  return {
    state: "pending" as InstallmentPaymentState,
    label: "In attesa",
    payment: related[0],
  };
};

export const normalizePaymentAccountingStatus = (payment: unknown) => {
  if (isPaymentExcludedFromTotals(payment)) {
    return "cancelled" as const;
  }

  if (isPaymentPaidLike(payment)) {
    return "paid" as const;
  }

  return "pending" as const;
};
