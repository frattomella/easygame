import {
  calculateAthleteExpectedIncome,
  mergeAthletePayments,
} from "@/lib/athlete-payment-utils";

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const asArray = <T = any>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }

  return "";
};

const toBoolean = (value: unknown) => {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  return ["true", "1", "yes", "si", "iscritto", "active"].includes(normalized);
};

export const getAthleteEnrollmentSummary = ({
  athlete,
  athleteId,
  paymentPlans = [],
  discounts = [],
  payments = [],
  athletePayments = [],
  expectedIncomeEntries = [],
}: {
  athlete: Record<string, any> | null;
  athleteId?: string | null;
  paymentPlans?: any[];
  discounts?: any[];
  payments?: any[];
  athletePayments?: any[];
  expectedIncomeEntries?: any[];
}) => {
  const athleteRecord = asRecord(athlete);
  const data = asRecord(athleteRecord.data);
  const profile = {
    ...data,
    ...athleteRecord,
    firstName: firstText(data.firstName, data.first_name, athleteRecord.first_name),
    lastName: firstText(data.lastName, data.last_name, athleteRecord.last_name),
    selectedPlan: firstText(
      data.selectedPlanId,
      data.selected_plan_id,
      data.selectedPlan,
      athleteRecord.selectedPlan,
    ),
    discount: data.discount ?? athleteRecord.discount ?? "",
  };
  const jsonPayments = [
    ...asArray(data.payments),
    ...asArray(data.paymentHistory),
    ...asArray(athleteRecord.payments),
  ];
  const normalizedPayments = mergeAthletePayments(
    [...jsonPayments, ...payments],
    athletePayments,
  );
  const income = calculateAthleteExpectedIncome({
    athlete: profile,
    athleteId: athleteId || firstText(athleteRecord.id),
    paymentPlans,
    discounts,
    payments: normalizedPayments,
    expectedIncomeEntries,
  });

  return {
    status: toBoolean(
      data.enrollmentStatus ??
        data.isRegistered ??
        data.registered ??
        data.enrolled ??
        athleteRecord.enrollmentStatus,
    )
      ? "enrolled"
      : "not_enrolled",
    notes: firstText(data.enrollmentNotes, athleteRecord.enrollmentNotes),
    enrollmentDate:
      firstText(
        data.enrollmentDate,
        data.enrollment_date,
        athleteRecord.enrollmentDate,
      ) || null,
    subscriptionStartDate:
      firstText(
        data.subscriptionStartDate,
        data.subscription_start_date,
        data.enrollmentStartDate,
        data.enrollment_start_date,
        athleteRecord.subscriptionStartDate,
        athleteRecord.enrollmentStartDate,
      ) || null,
    selectedPlan: profile.selectedPlan || null,
    discount: profile.discount || null,
    documents: [
      ...asArray(data.enrollmentDocuments),
      ...asArray(data.registrationDocuments),
    ],
    income,
    payments: income.payments,
  };
};
