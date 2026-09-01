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
  /**
   * Quanto di questa voce e stato davvero incassato.
   *
   * Non e derivabile da `statusKey`: una rata parzialmente pagata non e ne
   * «pagata» ne «da incassare» per intero. Il valore lo scrive il server in
   * `data.ledger` a ogni incasso registrato (ADR-0036); per le righe piu
   * vecchie vale l'importo pieno se risultano saldate.
   */
  paidAmount: number;
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
  /**
   * Periodo della stagione attiva del club.
   *
   * Usato **solo** quando il piano accende il pro-rata senza dichiarare il
   * proprio periodo: e la causa per cui il pro-rata risultava «non applicato»
   * anche su piani che lo avevano acceso.
   */
  seasonPeriod?: { startDate?: unknown; endDate?: unknown } | null;
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

/**
 * Le **due forme** dello stato di una rata, prodotte insieme.
 *
 * `status` e l etichetta italiana che una persona legge; `statusKey` e il
 * campo macchina su cui il codice decide. Sono esportate insieme perche il
 * difetto W6-08 nasceva proprio dall averle scambiate: la schermata della
 * famiglia confrontava l etichetta con dei token inglesi, e non corrispondeva
 * mai.
 */
export const resolveAthletePaymentStatus = (
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

  if (
    normalized === "partially_paid" ||
    normalized === "partial" ||
    normalized.includes("parzial")
  ) {
    return {
      statusKey: "pending" as const,
      status: "Parzialmente pagato",
    };
  }

  return {
    statusKey: "pending" as const,
    status:
      normalized.includes("scad") || normalized === "overdue"
        ? "Scaduto"
        : "Da incassare",
  };
};

/**
 * Quanto e stato incassato su una voce.
 *
 * `data.ledger.paidAmount` e la somma dei movimenti, scritta dal servizio
 * incassi nella stessa transazione che aggiorna la rata: e il valore
 * autorevole. Senza di esso si ricade sul comportamento precedente — tutto o
 * niente — che per le righe mai toccate dal registro e ancora corretto.
 */
const resolvePaidAmount = (
  data: Record<string, any>,
  amount: number,
  statusKey: "paid" | "pending" | "cancelled",
) => {
  if (statusKey === "cancelled") {
    return 0;
  }

  const ledgerPaid = getRecord(data.ledger).paidAmount;
  if (ledgerPaid !== undefined && ledgerPaid !== null) {
    const parsed = toFiniteNumber(ledgerPaid);
    return Math.min(amount, Math.max(0, Number(parsed.toFixed(2))));
  }

  return statusKey === "paid" ? amount : 0;
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

  const normalizedStatus = resolveAthletePaymentStatus(record.status, paidAt, data);

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
    paidAmount: resolvePaidAmount(data, amount, normalizedStatus.statusKey),
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
  seasonPeriod = null,
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
        fallbackPeriod: seasonPeriod,
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
  /*
    Il totale incassato si somma **per importo**, non per stato: una rata da
    130 con 50 gia in cassa contribuisce 50, non 0 e non 130. Contarla per
    stato era il difetto che rendeva invisibile un acconto (ADR-0036).
  */
  const recordedPaid = accountingPayments.reduce(
    (total, payment) => total + payment.paidAmount,
    0,
  );
  const recordedPending = accountingPayments.reduce(
    (total, payment) => total + Math.max(0, payment.amount - payment.paidAmount),
    0,
  );
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

/**
 * **Questa rata si puo pagare adesso?**
 *
 * W6-08. La domanda ha una risposta sola, e fino alla Wave 6 la schermata della
 * famiglia se la dava da sola — sbagliando:
 *
 * ```ts
 * items.find((rata) =>
 *   ["pending", "overdue", "partial", "unpaid"].includes(
 *     String(rata?.status || "").toLowerCase(),
 *   ),
 * )
 * ```
 *
 * `status` non e un campo macchina: e l'**etichetta italiana** che questo
 * modulo produce — «Da incassare», «Scaduto», «Parzialmente pagato», «Pagato»,
 * «Annullato». Nessuno di quei quattro token inglesi poteva mai corrispondere,
 * quindi la ricerca restituiva **sempre** `null`, il pulsante «Paga ora» era
 * **sempre** disabilitato, e il messaggio d'aiuto diceva «Nessuna rata da
 * saldare» a una famiglia che di rate aperte ne aveva tre.
 *
 * Il campo macchina si chiama `statusKey`, e il server lo usa correttamente due
 * righe piu sotto per contare le rate in attesa. Era un difetto **fra il clic e
 * la rete**: il dominio funzionava, il checkout funzionava, la rotta della
 * famiglia esisteva e il client la chiamava gia. Mancava solo che qualcuno
 * gliela desse da chiamare.
 *
 * Sta qui, accanto a chi produce le due forme, perche una schermata che
 * ricostruisce il vocabolario di un dominio prima o poi lo ricostruisce
 * diverso: e appena successo.
 */
export const isPayableAthletePayment = (payment: any): boolean => {
  if (!payment) return false;

  const chiave = toLowerText(payment.statusKey);

  /*
    Le righe che arrivano da un payload vecchio possono non avere `statusKey`.
    In quel caso si legge l'etichetta, che e cio che c'e: e il ripiego, non la
    strada principale.
  */
  const stato = chiave || toLowerText(payment.status);
  if (!stato) return false;
  if (stato === "paid" || stato === "pagato") return false;
  if (stato === "cancelled" || stato === "annullato") return false;
  if (payment?.data?.excludedFromTotals === true) return false;

  /*
    Una rata di importo nullo non si paga: aprire un checkout da zero euro
    manda la famiglia su una pagina che non puo concludere.
  */
  return Number(payment.amount ?? 0) > 0;
};

/** La prima rata che una famiglia puo saldare, o `null`. */
export const findFirstPayableAthletePayment = (payments: any): any =>
  (Array.isArray(payments) ? payments : []).find(isPayableAthletePayment) ||
  null;
