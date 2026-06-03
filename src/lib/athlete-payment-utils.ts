import {
  calculatePlanInstallmentsForTotal,
  calculatePlanRequiredTotal,
  calculateProratedTotal,
  calculateSelectedOptionalServicesTotal,
  calculatePlanTotal,
  findPaymentPlan,
  getEnrollmentStartDateFromAthlete,
  getManualEnrollmentAmountFromAthlete,
  getPlanServicesForAthlete,
  getSelectedOptionalServiceIdsFromAthlete,
  planAllowsDiscount,
} from "@/lib/payment-plan-utils";
import {
  isPaymentExcludedFromTotals,
  normalizePaymentAccountingStatus,
} from "@/lib/payments/payment-status-utils";

type NormalizedPaymentRecord = {
  id: string;
  date: string;
  dueDate: string | null;
  paidAt: string | null;
  description: string;
  type: string;
  amount: number;
  status: string;
  statusKey: "paid" | "pending" | "cancelled";
  method?: string | null;
  notes?: string | null;
  reference?: string | null;
  data?: Record<string, any>;
  raw?: Record<string, any>;
  source: "athlete_json" | "athlete_payment";
};

type AppliedDiscountSummary = {
  id: string;
  label: string;
  mode: "percentage" | "fixed";
  rawValue: number;
  amount: number;
};

type AthleteIncomeSummaryInput = {
  athlete: Record<string, any> | null;
  athleteId?: string | null;
  paymentPlans?: any[];
  discounts?: any[];
  payments?: any[];
  expectedIncomeEntries?: any[];
};

const toTrimmedString = (value: unknown) => String(value || "").trim();

const toLowerText = (value: unknown) => toTrimmedString(value).toLowerCase();

const toFiniteNumber = (value: unknown) => {
  const normalized =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value || "").replace(",", "."));
  return Number.isFinite(normalized) ? normalized : 0;
};

const getRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const getFirstString = (...values: unknown[]) => {
  for (const value of values) {
    const candidate = toTrimmedString(value);
    if (candidate) {
      return candidate;
    }
  }

  return "";
};

const getFirstPositiveNumber = (...values: unknown[]) => {
  for (const value of values) {
    const candidate = toFiniteNumber(value);
    if (candidate > 0) {
      return candidate;
    }
  }

  return 0;
};

const normalizeDateString = (value: unknown) => {
  const raw = toTrimmedString(value);
  if (!raw) {
    return "";
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }

  return parsed.toISOString();
};

const buildPaymentIdentityKey = (payment: NormalizedPaymentRecord) =>
  [
    payment.id,
    payment.description,
    payment.amount,
    payment.dueDate || payment.paidAt || payment.date,
    payment.statusKey,
  ]
    .map((value) => toTrimmedString(value).toLowerCase())
    .filter(Boolean)
    .join("|");

const normalizePaymentStatus = (
  value: unknown,
  paidAt?: unknown,
  data?: Record<string, any>,
) => {
  const accountingStatus = normalizePaymentAccountingStatus({
    status: value,
    paidAt,
    data,
  });

  if (accountingStatus === "cancelled") {
    return {
      statusKey: "cancelled" as const,
      status: "Annullato",
    };
  }

  if (accountingStatus === "paid") {
    return {
      statusKey: "paid" as const,
      status: "Pagato",
    };
  }

  const normalized = toLowerText(value);
  return {
    statusKey: "pending" as const,
    status:
      normalized.includes("scad") || normalized === "overdue"
        ? "Scaduto"
        : "Da incassare",
  };
};

const normalizeStoredPayment = (
  payment: unknown,
  source: NormalizedPaymentRecord["source"],
): NormalizedPaymentRecord | null => {
  const record = getRecord(payment);
  const dueDate = getFirstString(
    record.dueDate,
    record.due_date,
    record.date,
    record.createdAt,
    record.created_at,
  );
  const paidAt = getFirstString(record.paidAt, record.paid_at);
  const description = getFirstString(
    record.description,
    record.name,
    record.title,
    "Pagamento atleta",
  );
  const amount = getFirstPositiveNumber(record.amount, record.value, record.total);
  const data = getRecord(record.data);

  if (!description || amount <= 0) {
    return null;
  }

  const normalizedStatus = normalizePaymentStatus(record.status, paidAt, data);

  return {
    id:
      getFirstString(record.id, record.reference) ||
      `${source}-${description}-${dueDate}-${amount}`,
    date: normalizeDateString(dueDate || paidAt || new Date().toISOString()),
    dueDate: dueDate ? normalizeDateString(dueDate) : null,
    paidAt: paidAt ? normalizeDateString(paidAt) : null,
    description,
    type: getFirstString(record.type, record.method, record.category, "Quota"),
    amount,
    status: normalizedStatus.status,
    statusKey: normalizedStatus.statusKey,
    method: getFirstString(record.method) || null,
    notes: getFirstString(record.notes, data.notes) || null,
    reference: getFirstString(record.reference, data.reference) || null,
    data,
    raw: record,
    source,
  };
};

const normalizeInstallments = (plan: Record<string, any>) => {
  const rawInstallments = Array.isArray(plan.installments)
    ? plan.installments
    : Array.isArray(plan.rates)
      ? plan.rates
      : Array.isArray(plan.schedule)
        ? plan.schedule
        : [];

  if (rawInstallments.length > 0) {
    return rawInstallments
      .map((installment: any, index: number) => {
        const amount = getFirstPositiveNumber(
          installment.amount,
          installment.value,
          installment.installmentAmount,
          installment.installment_amount,
        );

        return {
          id:
            getFirstString(installment.id) ||
            `${toTrimmedString(plan.id || plan.name || "plan")}-installment-${index + 1}`,
          label:
            getFirstString(
              installment.label,
              installment.name,
              installment.description,
            ) || `Rata ${index + 1}`,
          amount,
          dueDate:
            getFirstString(installment.dueDate, installment.due_date) || null,
        };
      })
      .filter((installment) => installment.amount > 0);
  }

  const totalInstallments = Math.max(
    0,
    Number.parseInt(
      String(plan.installmentsCount || plan.installments || plan.ratesCount || ""),
      10,
    ) || 0,
  );
  const installmentAmount = getFirstPositiveNumber(
    plan.installmentAmount,
    plan.installment_amount,
    plan.rateAmount,
    plan.rate_amount,
  );

  if (totalInstallments > 0 && installmentAmount > 0) {
    return Array.from({ length: totalInstallments }, (_, index) => ({
      id: `${toTrimmedString(plan.id || plan.name || "plan")}-installment-${index + 1}`,
      label: `Rata ${index + 1}`,
      amount: installmentAmount,
      dueDate: null,
    }));
  }

  return [];
};

const resolvePlanBaseAmount = (plan: Record<string, any>) => {
  const directAmount = getFirstPositiveNumber(
    plan.amount,
    plan.totalAmount,
    plan.total_amount,
    plan.price,
    plan.value,
    plan.baseAmount,
    plan.base_amount,
  );

  if (directAmount > 0) {
    return directAmount;
  }

  return normalizeInstallments(plan).reduce(
    (total, installment) => total + installment.amount,
    0,
  );
};

const resolveSelectedPlan = (selectedPlan: unknown, paymentPlans: any[] = []) => {
  return findPaymentPlan(selectedPlan, paymentPlans);
};

const resolveSelectedDiscounts = (
  selectedDiscount: unknown,
  clubDiscounts: any[] = [],
) => {
  const requested = Array.isArray(selectedDiscount)
    ? selectedDiscount
    : selectedDiscount
      ? [selectedDiscount]
      : [];

  return requested
    .map((value) => {
      const normalized = toLowerText(
        typeof value === "object" && value ? getRecord(value).id || getRecord(value).name || getRecord(value).title : value,
      );
      if (!normalized) {
        return null;
      }

      const matchedClubDiscount =
        clubDiscounts.find((discount) =>
          [
            getRecord(discount).id,
            getRecord(discount).name,
            getRecord(discount).title,
          ]
            .map((candidate) => toLowerText(candidate))
            .filter(Boolean)
            .includes(normalized),
        ) || null;

      if (matchedClubDiscount) {
        return getRecord(matchedClubDiscount);
      }

      return typeof value === "object" && value ? getRecord(value) : { label: value };
    })
    .filter(Boolean) as Record<string, any>[];
};

const normalizeDiscountMode = (discount: Record<string, any>) => {
  const explicitType = toLowerText(discount.type || discount.mode);
  if (explicitType === "percentage" || explicitType === "percent") {
    return "percentage" as const;
  }

  if (explicitType === "fixed" || explicitType === "amount") {
    return "fixed" as const;
  }

  const percentageValue = getFirstPositiveNumber(
    discount.percentage,
    discount.percent,
  );
  if (percentageValue > 0) {
    return "percentage" as const;
  }

  const label = getFirstString(discount.label, discount.name, discount.title);
  if (label.includes("%")) {
    return "percentage" as const;
  }

  return "fixed" as const;
};

const calculateDiscountAmount = (
  baseAmount: number,
  discount: Record<string, any>,
): AppliedDiscountSummary | null => {
  const rawValue = getFirstPositiveNumber(
    discount.value,
    discount.amount,
    discount.discountAmount,
    discount.discount_amount,
    discount.percentage,
    discount.percent,
  );

  if (rawValue <= 0 || baseAmount <= 0) {
    return null;
  }

  const mode = normalizeDiscountMode(discount);
  const amount =
    mode === "percentage"
      ? Number(((baseAmount * rawValue) / 100).toFixed(2))
      : Number(Math.min(baseAmount, rawValue).toFixed(2));

  if (amount <= 0) {
    return null;
  }

  return {
    id:
      getFirstString(discount.id, discount.code) ||
      `${mode}-${getFirstString(discount.name, discount.title, discount.label) || rawValue}`,
    label:
      getFirstString(discount.title, discount.name, discount.label) ||
      (mode === "percentage" ? `${rawValue}%` : `${rawValue} EUR`),
    mode,
    rawValue,
    amount,
  };
};

const resolveExpectedIncomeFallback = (
  entries: any[] = [],
  athlete: Record<string, any> | null,
  athleteId?: string | null,
) => {
  const normalizedAthleteId = toTrimmedString(athleteId || athlete?.id);
  const athleteName = [
    toTrimmedString(athlete?.firstName),
    toTrimmedString(athlete?.lastName),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return entries
    .filter((entry) => {
      const record = getRecord(entry);
      return [
        record.athleteId,
        record.athlete_id,
        getRecord(record.data).athleteId,
        getRecord(record.data).athlete_id,
      ]
        .map((value) => toTrimmedString(value))
        .filter(Boolean)
        .includes(normalizedAthleteId)
        ? true
        : athleteName &&
            [
              record.athleteName,
              record.athlete_name,
              record.description,
              record.reference,
            ]
              .map((value) => toLowerText(value))
              .some((value) => value.includes(athleteName));
    })
    .reduce(
      (total, entry) =>
        total +
        getFirstPositiveNumber(
          getRecord(entry).amount,
          getRecord(entry).value,
          getRecord(entry).total,
        ),
      0,
    );
};

export const mergeAthletePayments = (
  storedPayments: any[] = [],
  athletePayments: any[] = [],
) => {
  const merged = [
    ...(Array.isArray(storedPayments) ? storedPayments : [])
      .map((payment) => normalizeStoredPayment(payment, "athlete_json"))
      .filter(Boolean),
    ...(Array.isArray(athletePayments) ? athletePayments : [])
      .map((payment) => normalizeStoredPayment(payment, "athlete_payment"))
      .filter(Boolean),
  ] as NormalizedPaymentRecord[];

  const seen = new Set<string>();

  return merged
    .filter((payment) => {
      const key = buildPaymentIdentityKey(payment);
      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .sort((left, right) => {
      const leftTime = new Date(left.date).getTime();
      const rightTime = new Date(right.date).getTime();
      return rightTime - leftTime;
    });
};

export const calculateAthleteExpectedIncome = ({
  athlete,
  athleteId,
  paymentPlans = [],
  discounts = [],
  payments = [],
  expectedIncomeEntries = [],
}: AthleteIncomeSummaryInput) => {
  const record = getRecord(athlete);
  const selectedPlan = resolveSelectedPlan(
    record.selectedPlan || record.selectedPlanId || record.selected_plan_id,
    paymentPlans,
  );
  const normalizedPayments = mergeAthletePayments(payments, []);
  const planRecord = selectedPlan;
  const selectedOptionalServiceIds =
    getSelectedOptionalServiceIdsFromAthlete(record);
  const enrollmentDate = getFirstString(
    record.enrollmentDate,
    record.enrollment_date,
    getRecord(record.data).enrollmentDate,
    getRecord(record.data).enrollment_date,
  );
  const enrollmentStartDate = getEnrollmentStartDateFromAthlete(record);
  const manualEnrollmentAmount = getManualEnrollmentAmountFromAthlete(record);
  const selectedDiscounts = resolveSelectedDiscounts(record.discount, discounts);
  const applicableSelectedDiscounts = selectedDiscounts.filter((discount) =>
    planAllowsDiscount(planRecord, discount),
  );
  const includedServices = planRecord
    ? getPlanServicesForAthlete(planRecord, selectedOptionalServiceIds)
    : [];

  const planBaseAmount = planRecord
    ? calculatePlanTotal(planRecord, { selectedOptionalServiceIds })
    : 0;
  const proratedPlanTotal = planRecord
    ? calculateProratedTotal({
        total: planBaseAmount,
        proration: planRecord.proration,
        startDate: enrollmentStartDate,
        manualOverride: manualEnrollmentAmount,
      })
    : null;
  const expectedIncomeFallback =
    planBaseAmount > 0
      ? 0
      : resolveExpectedIncomeFallback(expectedIncomeEntries, record, athleteId);
  const grossAmount =
    planBaseAmount > 0
      ? proratedPlanTotal?.total ?? planBaseAmount
      : expectedIncomeFallback;

  const appliedDiscounts = applicableSelectedDiscounts
    .map((discount) => calculateDiscountAmount(grossAmount, discount))
    .filter(Boolean) as AppliedDiscountSummary[];
  const totalDiscounts = appliedDiscounts.reduce(
    (total, discount) => total + discount.amount,
    0,
  );
  const expectedTotal = Math.max(0, Number((grossAmount - totalDiscounts).toFixed(2)));
  const installments = planRecord
    ? calculatePlanInstallmentsForTotal(planRecord, expectedTotal, {
        startDate: enrollmentStartDate,
      })
    : [];

  const accountingPayments = normalizedPayments.filter(
    (payment) => !isPaymentExcludedFromTotals(payment),
  );
  const recordedPaid = accountingPayments
    .filter((payment) => payment.statusKey === "paid")
    .reduce((total, payment) => total + payment.amount, 0);
  const recordedPending = accountingPayments
    .filter((payment) => payment.statusKey === "pending")
    .reduce((total, payment) => total + payment.amount, 0);
  const recordedTotal = accountingPayments.reduce(
    (total, payment) => total + payment.amount,
    0,
  );
  const residual = Math.max(
    0,
    Number((expectedTotal - recordedPaid).toFixed(2)),
  );

  return {
    source:
      planBaseAmount > 0
        ? "payment_plan"
        : expectedIncomeFallback > 0
          ? "expected_income"
          : "manual",
    planId: getFirstString(planRecord?.id) || null,
    planName: getFirstString(planRecord?.name, planRecord?.raw?.title, record.selectedPlan) || null,
    planDescription: getFirstString(planRecord?.description) || null,
    services: includedServices,
    allPlanServices: planRecord?.services || [],
    selectedOptionalServiceIds,
    enrollmentDate: enrollmentDate || null,
    subscriptionStartDate: enrollmentStartDate,
    enrollmentStartDate,
    manualEnrollmentAmount,
    proration: planRecord?.proration || null,
    prorationResult: proratedPlanTotal,
    requiredServicesTotal: planRecord ? calculatePlanRequiredTotal(planRecord) : 0,
    selectedOptionalServicesTotal: planRecord
      ? calculateSelectedOptionalServicesTotal(
          planRecord,
          selectedOptionalServiceIds,
        )
      : 0,
    planNotes: getFirstString(planRecord?.notes) || null,
    applicableDiscountIds: planRecord?.applicableDiscountIds || [],
    grossAmount,
    totalDiscounts: Number(totalDiscounts.toFixed(2)),
    expectedTotal,
    recordedPaid: Number(recordedPaid.toFixed(2)),
    recordedPending: Number(recordedPending.toFixed(2)),
    recordedTotal: Number(recordedTotal.toFixed(2)),
    residual,
    appliedDiscounts,
    installments,
    payments: normalizedPayments,
  };
};

export const calculateAthleteEnrollmentPaymentSummary =
  calculateAthleteExpectedIncome;
