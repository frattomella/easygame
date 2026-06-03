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

export const normalizePaymentAccountingStatus = (payment: unknown) => {
  if (isPaymentExcludedFromTotals(payment)) {
    return "cancelled" as const;
  }

  if (isPaymentPaidLike(payment)) {
    return "paid" as const;
  }

  return "pending" as const;
};
