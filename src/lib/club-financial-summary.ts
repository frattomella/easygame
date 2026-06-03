import { getClubData } from "@/lib/simplified-db";
import { supabase } from "@/lib/supabase";
import {
  isPaymentExcludedFromTotals,
  normalizePaymentAccountingStatus,
} from "@/lib/payments/payment-status-utils";

export type ClubMovementSource =
  | "athlete"
  | "trainer"
  | "sponsor"
  | "member"
  | "staff"
  | "manual"
  | "other";

export type NormalizedClubMovement = {
  id: string;
  source: ClubMovementSource;
  direction: "income" | "expense";
  description: string;
  amount: number;
  status: "paid" | "pending" | "overdue" | "cancelled" | string;
  date?: string;
  dueDate?: string;
  paidAt?: string;
  subjectName?: string;
  category?: string;
  raw?: unknown;
};

export type ClubFinancialSources = {
  transactions?: any[];
  expectedIncome?: any[];
  expectedExpenses?: any[];
  payments?: any[];
  simplifiedPayments?: any[];
  trainerPayments?: any[];
  sponsorPayments?: any[];
  sponsors?: any[];
  members?: any[];
  staffMembers?: any[];
  trainers?: any[];
};

export type ClubFinancialSummary = {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  totalPendingIncome: number;
  totalPendingExpense: number;
  paidCount: number;
  pendingCount: number;
};

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStatus = (value: unknown) => {
  const status = String(value || "").trim().toLowerCase();
  if (["paid", "completed", "complete", "saldato", "pagato"].includes(status)) {
    return "paid";
  }
  if (
    ["cancelled", "canceled", "voided", "deleted", "annullato", "annullata"].includes(
      status,
    )
  ) {
    return "cancelled";
  }
  if (["overdue", "scaduto", "scaduta"].includes(status)) {
    return "overdue";
  }
  return status || "pending";
};

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) {
      return normalized;
    }
  }
  return "";
};

const buildId = (prefix: ClubMovementSource | "expected", item: any, index: number) =>
  firstString(item?.id, item?.payment_id, item?.reference, `${prefix}-${index}`);

const inferDirection = (item: any, fallback: "income" | "expense") => {
  const type = String(item?.type || item?.direction || "").toLowerCase();
  if (["expense", "uscita", "out"].includes(type)) {
    return "expense";
  }
  if (["income", "entrata", "in"].includes(type)) {
    return "income";
  }
  return fallback;
};

const movementKey = (movement: NormalizedClubMovement) =>
  [
    movement.source,
    movement.id,
    movement.amount,
    movement.paidAt || movement.date || movement.dueDate || "",
  ].join("|");

const paymentSubject = (item: any, fallback?: string) =>
  firstString(
    item?.subjectName,
    item?.athlete_name,
    item?.trainer_name,
    item?.member_name,
    item?.staff_name,
    item?.sponsor_name,
    item?.name,
    item?.data?.athlete_name,
    item?.data?.subjectName,
    fallback,
  );

const normalizePayment = (
  item: any,
  source: ClubMovementSource,
  index: number,
  fallbackSubject?: string,
): NormalizedClubMovement | null => {
  const amount = toNumber(item?.amount || item?.value || item?.total);
  if (amount <= 0) {
    return null;
  }

  const status = isPaymentExcludedFromTotals(item)
    ? "cancelled"
    : normalizePaymentAccountingStatus(item);
  return {
    id: buildId(source, item, index),
    source,
    direction: source === "trainer" || source === "staff" ? "expense" : "income",
    description: firstString(item?.description, item?.title, item?.reason, "Pagamento"),
    amount,
    status,
    date: firstString(item?.date, item?.created_at, item?.createdAt) || undefined,
    dueDate: firstString(item?.due_date, item?.dueDate, item?.deadline) || undefined,
    paidAt: firstString(item?.paid_at, item?.paidAt, item?.payment_date) || undefined,
    subjectName: paymentSubject(item, fallbackSubject) || undefined,
    category: firstString(item?.category, item?.category_name, item?.type) || undefined,
    raw: item,
  };
};

const normalizeManualTransaction = (
  item: any,
  index: number,
): NormalizedClubMovement | null => {
  const amount = toNumber(item?.amount);
  if (amount <= 0) {
    return null;
  }

  return {
    id: buildId("manual", item, index),
    source: "manual",
    direction: inferDirection(item, "income"),
    description: firstString(item?.description, item?.title, item?.reference, "Movimento"),
    amount,
    status: normalizeStatus(item?.status || "paid"),
    date: firstString(item?.date, item?.created_at) || undefined,
    subjectName: firstString(item?.subjectName, item?.reference) || undefined,
    category: firstString(item?.category, item?.type) || undefined,
    raw: item,
  };
};

const normalizeExpected = (
  item: any,
  direction: "income" | "expense",
  index: number,
): NormalizedClubMovement | null => {
  const amount = toNumber(item?.amount);
  if (amount <= 0) {
    return null;
  }

  return {
    id: buildId("expected", item, index),
    source: "manual",
    direction,
    description: firstString(item?.description, item?.title, "Previsto"),
    amount,
    status: normalizeStatus(item?.status || "pending"),
    date: firstString(item?.date, item?.created_at) || undefined,
    dueDate: firstString(item?.dueDate, item?.due_date, item?.date) || undefined,
    subjectName: firstString(item?.subjectName, item?.reference) || undefined,
    category: firstString(item?.category, direction === "income" ? "Entrata prevista" : "Uscita prevista"),
    raw: item,
  };
};

const collectNestedPayments = (
  records: any[],
  source: ClubMovementSource,
  paymentKeys: string[],
) =>
  records.flatMap((record, recordIndex) => {
    const subjectName = paymentSubject(record);
    return paymentKeys.flatMap((key) =>
      asArray(record?.[key]).map((payment, paymentIndex) => ({
        ...payment,
        id: firstString(payment?.id, `${source}-${record?.id || recordIndex}-${paymentIndex}`),
        subjectName,
      })),
    );
  });

export const aggregateClubPayments = (
  sources: ClubFinancialSources,
): NormalizedClubMovement[] => {
  const movements = [
    ...asArray(sources.transactions)
      .map(normalizeManualTransaction)
      .filter(Boolean),
    ...asArray(sources.expectedIncome)
      .map((item, index) => normalizeExpected(item, "income", index))
      .filter(Boolean),
    ...asArray(sources.expectedExpenses)
      .map((item, index) => normalizeExpected(item, "expense", index))
      .filter(Boolean),
    ...asArray(sources.payments)
      .map((item, index) => normalizePayment(item, "athlete", index))
      .filter(Boolean),
    ...asArray(sources.simplifiedPayments)
      .map((item, index) => normalizePayment(item, "athlete", index))
      .filter(Boolean),
    ...asArray(sources.trainerPayments)
      .map((item, index) => normalizePayment(item, "trainer", index))
      .filter(Boolean),
    ...asArray(sources.sponsorPayments)
      .map((item, index) => normalizePayment(item, "sponsor", index))
      .filter(Boolean),
    ...collectNestedPayments(asArray(sources.sponsors), "sponsor", [
      "payments",
      "sponsor_payments",
    ])
      .map((item, index) => normalizePayment(item, "sponsor", index))
      .filter(Boolean),
    ...collectNestedPayments(asArray(sources.members), "member", [
      "payments",
      "member_payments",
    ])
      .map((item, index) => normalizePayment(item, "member", index))
      .filter(Boolean),
    ...collectNestedPayments(asArray(sources.staffMembers), "staff", [
      "payments",
      "staff_payments",
    ])
      .map((item, index) => normalizePayment(item, "staff", index))
      .filter(Boolean),
    ...collectNestedPayments(asArray(sources.trainers), "trainer", [
      "payments",
      "trainer_payments",
    ])
      .map((item, index) => normalizePayment(item, "trainer", index))
      .filter(Boolean),
  ] as NormalizedClubMovement[];

  const uniqueMovements = new Map<string, NormalizedClubMovement>();
  movements.forEach((movement) => {
    const key = movementKey(movement);
    if (!uniqueMovements.has(key)) {
      uniqueMovements.set(key, movement);
    }
  });

  return Array.from(uniqueMovements.values()).sort((left, right) => {
    const leftDate = left.paidAt || left.date || left.dueDate || "";
    const rightDate = right.paidAt || right.date || right.dueDate || "";
    return rightDate.localeCompare(leftDate);
  });
};

export const summarizeClubMovements = (
  movements: NormalizedClubMovement[],
): ClubFinancialSummary => {
  return movements.reduce(
    (summary, movement) => {
      const isPaid = normalizeStatus(movement.status) === "paid";
      const isCancelled = normalizeStatus(movement.status) === "cancelled";

      if (isCancelled) {
        return summary;
      }

      if (isPaid) {
        if (movement.direction === "income") {
          summary.totalIncome += movement.amount;
        } else {
          summary.totalExpense += movement.amount;
        }
        summary.paidCount += 1;
      } else {
        if (movement.direction === "income") {
          summary.totalPendingIncome += movement.amount;
        } else {
          summary.totalPendingExpense += movement.amount;
        }
        summary.pendingCount += 1;
      }

      summary.balance = summary.totalIncome - summary.totalExpense;
      return summary;
    },
    {
      totalIncome: 0,
      totalExpense: 0,
      balance: 0,
      totalPendingIncome: 0,
      totalPendingExpense: 0,
      paidCount: 0,
      pendingCount: 0,
    },
  );
};

const safeTableRows = async (table: string, clubId: string) => {
  try {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("organization_id", clubId);

    if (error) {
      return [];
    }

    return data || [];
  } catch {
    return [];
  }
};

export const loadClubFinancialSources = async (
  clubId: string,
): Promise<ClubFinancialSources> => {
  const [
    transactions,
    expectedIncome,
    expectedExpenses,
    sponsorPayments,
    sponsors,
    members,
    staffMembers,
    trainers,
    payments,
    simplifiedPayments,
    trainerPayments,
  ] = await Promise.all([
    getClubData(clubId, "transactions").catch(() => []),
    getClubData(clubId, "expected_income").catch(() => []),
    getClubData(clubId, "expected_expenses").catch(() => []),
    getClubData(clubId, "sponsor_payments").catch(() => []),
    getClubData(clubId, "sponsors").catch(() => []),
    getClubData(clubId, "members").catch(() => []),
    getClubData(clubId, "staff_members").catch(() => []),
    getClubData(clubId, "trainers").catch(() => []),
    safeTableRows("payments", clubId),
    safeTableRows("simplified_payments", clubId),
    safeTableRows("trainer_payments", clubId),
  ]);

  return {
    transactions,
    expectedIncome,
    expectedExpenses,
    sponsorPayments,
    sponsors,
    members,
    staffMembers,
    trainers,
    payments,
    simplifiedPayments,
    trainerPayments,
  };
};
