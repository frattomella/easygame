export type PaymentPlanServiceType =
  | "iscrizione"
  | "allenamenti"
  | "assicurazione"
  | "kit"
  | "gare"
  | "altro";

export type NormalizedPaymentPlanService = {
  id: string;
  name: string;
  description: string;
  price: number;
  type: PaymentPlanServiceType;
  optional: boolean;
  required: boolean;
  included: boolean;
};

export type NormalizedPaymentPlanInstallment = {
  id: string;
  label: string;
  amountType: "percentage" | "fixed" | "remaining";
  amount: number;
  dueAfterDays: number;
  dueDate: string | null;
};

export type NormalizedPaymentPlanProrationSettings = {
  enabled: boolean;
  method: "none" | "days" | "months";
  seasonStartDate: string | null;
  seasonEndDate: string | null;
  allowManualOverride: boolean;
};

export type NormalizedPaymentPlan = {
  id: string;
  name: string;
  description: string;
  services: NormalizedPaymentPlanService[];
  amount: number;
  totalAmount: number;
  installments: NormalizedPaymentPlanInstallment[];
  installmentsCount: number;
  installmentAmount: number;
  proration: NormalizedPaymentPlanProrationSettings;
  applicableDiscountIds: string[];
  notes: string;
  active: boolean;
  raw: Record<string, any>;
};

export const PAYMENT_PLAN_SERVICE_TYPES: Array<{
  value: PaymentPlanServiceType;
  label: string;
}> = [
  { value: "iscrizione", label: "Iscrizione" },
  { value: "allenamenti", label: "Allenamenti" },
  { value: "assicurazione", label: "Assicurazione" },
  { value: "kit", label: "Kit" },
  { value: "gare", label: "Torneo/Gare" },
  { value: "altro", label: "Altro" },
];

const SERVICE_TYPE_SET = new Set(
  PAYMENT_PLAN_SERVICE_TYPES.map((type) => type.value),
);

const toRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const toText = (value: unknown) => String(value || "").trim();

const toLowerText = (value: unknown) => toText(value).toLowerCase();

export const toPaymentPlanAmount = (value: unknown) => {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value || "").replace(",", "."));

  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
};

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = toText(value);
    if (text) return text;
  }

  return "";
};

const firstPositiveAmount = (...values: unknown[]) => {
  for (const value of values) {
    const amount = toPaymentPlanAmount(value);
    if (amount > 0) return amount;
  }

  return 0;
};

const buildStableId = (prefix: string, value: unknown) => {
  const slug =
    toLowerText(value)
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "legacy";

  return `${prefix}_${slug}`;
};

const normalizeServiceType = (value: unknown): PaymentPlanServiceType => {
  const normalized = toLowerText(value);

  if (normalized === "registration" || normalized === "enrollment") {
    return "iscrizione";
  }

  if (normalized === "training") {
    return "allenamenti";
  }

  if (normalized === "insurance") {
    return "assicurazione";
  }

  if (normalized === "tournament" || normalized === "match") {
    return "gare";
  }

  if (normalized === "other") {
    return "altro";
  }

  if (normalized === "torneo" || normalized === "partite") {
    return "gare";
  }

  return SERVICE_TYPE_SET.has(normalized as PaymentPlanServiceType)
    ? (normalized as PaymentPlanServiceType)
    : "altro";
};

const normalizePaymentPlanService = (
  service: unknown,
  index: number,
  planId: string,
): NormalizedPaymentPlanService | null => {
  const record = toRecord(service);
  const name = firstText(
    record.name,
    record.title,
    record.label,
    record.serviceName,
    record.service_name,
  );
  const price = toPaymentPlanAmount(
    record.price ??
      record.amount ??
      record.value ??
      record.total ??
      record.unitPrice ??
      record.unit_price,
  );

  if (!name && price <= 0) {
    return null;
  }

  const explicitOptional =
    record.optional ??
    record.isOptional ??
    record.is_optional ??
    record.optionalService ??
    record.optional_service;
  const optional =
    explicitOptional !== undefined
      ? Boolean(explicitOptional)
      : record.required === false || record.mandatory === false;

  return {
    id:
      firstText(record.id, record.serviceId, record.service_id) ||
      `${planId || "plan"}_service_${index + 1}`,
    name: name || "Servizio",
    description: firstText(record.description, record.notes, record.note),
    price,
    type: normalizeServiceType(record.type || record.category || record.kind),
    optional,
    required: optional ? false : Boolean(record.required ?? record.mandatory ?? true),
    included: record.included === false ? false : true,
  };
};

const collectPlanServices = (
  plan: Record<string, any>,
  planId: string,
): NormalizedPaymentPlanService[] => {
  const rawServices = [
    plan.services,
    plan.includedServices,
    plan.included_services,
    plan.items,
    plan.components,
  ].find((value) => Array.isArray(value)) as unknown[] | undefined;

  const normalizedServices = (rawServices || [])
    .map((service, index) => normalizePaymentPlanService(service, index, planId))
    .filter(Boolean) as NormalizedPaymentPlanService[];

  if (normalizedServices.length > 0) {
    return normalizedServices;
  }

  const registrationFee = firstPositiveAmount(
    plan.registrationFee,
    plan.registration_fee,
    plan.enrollmentFee,
    plan.enrollment_fee,
    plan.subscriptionFee,
    plan.subscription_fee,
  );
  const amount = firstPositiveAmount(
    plan.amount,
    plan.totalAmount,
    plan.total_amount,
    plan.price,
    plan.value,
    plan.baseAmount,
    plan.base_amount,
  );
  const services: NormalizedPaymentPlanService[] = [];

  if (registrationFee > 0) {
    services.push({
      id: `${planId || "plan"}_registration_fee`,
      name: "Quota iscrizione",
      description: "",
      price: registrationFee,
      type: "iscrizione",
      optional: false,
      required: true,
      included: true,
    });
  }

  if (amount > 0) {
    services.push({
      id: `${planId || "plan"}_legacy_quota`,
      name: registrationFee > 0 ? "Servizi inclusi" : "Quota",
      description: firstText(plan.description),
      price: amount,
      type: registrationFee > 0 ? "altro" : "iscrizione",
      optional: false,
      required: true,
      included: true,
    });
  }

  return services;
};

export const getSelectedOptionalServiceIdsFromAthlete = (athlete: unknown) => {
  const record = toRecord(athlete);
  const data = toRecord(record.data);
  const enrollment = toRecord(record.enrollment);
  const paymentConfig = toRecord(data.enrollmentPaymentConfig);
  const candidates = [
    record.selectedOptionalServiceIds,
    record.selected_optional_service_ids,
    record.enrollmentSelectedOptionalServiceIds,
    record.enrollment_selected_optional_service_ids,
    data.selectedOptionalServiceIds,
    data.selected_optional_service_ids,
    data.enrollmentSelectedOptionalServiceIds,
    data.enrollment_selected_optional_service_ids,
    paymentConfig.selectedOptionalServiceIds,
    paymentConfig.selected_optional_service_ids,
    enrollment.selectedOptionalServiceIds,
    enrollment.selected_optional_service_ids,
  ];

  // Si prende il primo array **non vuoto**, non il primo array.
  // La scheda atleta valorizza sempre `selectedOptionalServiceIds`, anche a
  // `[]`: fermarsi li nascondeva la selezione confermata, che vive in
  // `enrollmentPaymentConfig`, e i servizi opzionali sparivano da totale e
  // rate (WP-33).
  const selected = candidates.find(
    (value) => Array.isArray(value) && value.length > 0,
  ) as unknown[] | undefined;

  return Array.from(
    new Set((selected || []).map((value) => toText(value)).filter(Boolean)),
  );
};

export const getEnrollmentStartDateFromAthlete = (athlete: unknown) => {
  const record = toRecord(athlete);
  const data = toRecord(record.data);
  const enrollment = toRecord(record.enrollment);

  return (
    firstText(
      record.subscriptionStartDate,
      record.subscription_start_date,
      record.enrollmentStartDate,
      record.enrollment_start_date,
      record.selectedPlanStartDate,
      record.selected_plan_start_date,
      data.subscriptionStartDate,
      data.subscription_start_date,
      data.enrollmentStartDate,
      data.enrollment_start_date,
      data.selectedPlanStartDate,
      data.selected_plan_start_date,
      data.enrollmentPaymentConfig?.subscriptionStartDate,
      data.enrollmentPaymentConfig?.subscription_start_date,
      enrollment.startDate,
      enrollment.start_date,
      enrollment.subscriptionStartDate,
      enrollment.subscription_start_date,
    ) || null
  );
};

export const getManualEnrollmentAmountFromAthlete = (athlete: unknown) => {
  const record = toRecord(athlete);
  const data = toRecord(record.data);
  const enrollment = toRecord(record.enrollment);

  return firstPositiveAmount(
    record.manualEnrollmentAmount,
    record.manual_enrollment_amount,
    record.selectedPlanManualAmount,
    record.selected_plan_manual_amount,
    data.manualEnrollmentAmount,
    data.manual_enrollment_amount,
    data.selectedPlanManualAmount,
    data.selected_plan_manual_amount,
    enrollment.manualAmount,
    enrollment.manual_amount,
  );
};

const serviceTokenSet = (service: NormalizedPaymentPlanService) =>
  [service.id, service.name]
    .map((value) => toLowerText(value))
    .filter(Boolean);

export const getPlanServicesForAthlete = (
  plan: unknown,
  selectedOptionalServiceIds: unknown[] = [],
) => {
  const normalizedPlan = normalizePaymentPlan(plan);
  const selectedTokens = new Set(
    selectedOptionalServiceIds.map((value) => toLowerText(value)).filter(Boolean),
  );

  return normalizedPlan.services.filter((service) => {
    if (service.included === false) {
      return false;
    }

    if (!service.optional) {
      return true;
    }

    return serviceTokenSet(service).some((token) => selectedTokens.has(token));
  });
};

export const calculatePlanTotal = (
  plan: unknown,
  options?: { selectedOptionalServiceIds?: unknown[] },
) => {
  const record = toRecord(plan);
  const services = options
    ? getPlanServicesForAthlete(plan, options.selectedOptionalServiceIds || [])
    : Array.isArray(record.services)
      ? record.services
          .map((service, index) =>
            normalizePaymentPlanService(
              service,
              index,
              firstText(record.id, record.name, "plan"),
            ),
          )
          .filter(Boolean)
      : collectPlanServices(record, firstText(record.id, record.name, "plan"));
  const includeSelectedOptionalServices = Boolean(options);
  const servicesTotal = services.reduce(
    (total, service: any) =>
      total +
      (service.included === false ||
      (!includeSelectedOptionalServices && service.optional)
        ? 0
        : toPaymentPlanAmount(service.price)),
    0,
  );

  if (servicesTotal > 0) {
    return Number(servicesTotal.toFixed(2));
  }

  return firstPositiveAmount(
    record.amount,
    record.totalAmount,
    record.total_amount,
    record.price,
    record.value,
  );
};

export const calculatePlanRequiredTotal = (plan: unknown) =>
  Number(normalizePaymentPlan(plan).services.reduce(
    (total, service) =>
      total +
      (!service.optional && service.included !== false
        ? toPaymentPlanAmount(service.price)
        : 0),
    0,
  ).toFixed(2));

export const calculateSelectedOptionalServicesTotal = (
  plan: unknown,
  selectedOptionalServiceIds: unknown[] = [],
) =>
  Number(getPlanServicesForAthlete(plan, selectedOptionalServiceIds).reduce(
    (total, service) =>
      total + (service.optional ? toPaymentPlanAmount(service.price) : 0),
    0,
  ).toFixed(2));

export const calculatePlanBaseTotal = (plan: unknown) => calculatePlanTotal(plan);

export const calculateSelectedServicesTotal = (
  plan: unknown,
  selectedOptionalServiceIds: unknown[] = [],
) => calculatePlanTotal(plan, { selectedOptionalServiceIds });

export const normalizePlanInstallments = (
  plan: unknown,
  totalOverride?: number,
): NormalizedPaymentPlanInstallment[] => {
  const record = toRecord(plan);
  const planId = firstText(record.id, record.name, "plan");
  const rawInstallments = [
    record.installmentSchedule,
    record.installment_schedule,
    record.relativeInstallments,
    record.relative_installments,
    record.installments,
    record.rates,
    record.schedule,
    record.paymentSchedule,
    record.payment_schedule,
  ].find((value) => Array.isArray(value)) as unknown[] | undefined;

  if (rawInstallments?.length) {
    const mappedInstallments = rawInstallments
      .map((installment, index) => {
        const item = toRecord(installment);
        const explicitAmountType = firstText(
          item.amountType,
          item.amount_type,
          item.type,
        ).toLowerCase();
        const amountType =
          explicitAmountType === "remaining" ||
          explicitAmountType === "saldo" ||
          explicitAmountType === "restante"
            ? "remaining"
            : explicitAmountType === "percentage" ||
                explicitAmountType === "percent" ||
                explicitAmountType === "percentuale"
              ? "percentage"
              : explicitAmountType === "fixed" ||
                  explicitAmountType === "amount" ||
                  explicitAmountType === "fisso"
                ? "fixed"
                : "";
        const amount = toPaymentPlanAmount(
          item.amount ??
            item.value ??
            item.percentage ??
            item.percent ??
            item.installmentAmount ??
            item.installment_amount,
        );
        const dueAfterDays = Math.max(
          0,
          Number.parseInt(
            String(
              item.dueAfterDays ??
                item.due_after_days ??
                item.offsetDays ??
                item.offset_days ??
                item.daysAfterStart ??
                0,
            ),
            10,
          ) || 0,
        );

        return {
          id: firstText(item.id) || `${planId}_installment_${index + 1}`,
          label:
            firstText(item.label, item.name, item.description) ||
            `Rata ${index + 1}`,
          amountType: (amountType || "fixed") as NormalizedPaymentPlanInstallment["amountType"],
          amount,
          dueAfterDays,
          dueDate: firstText(item.dueDate, item.due_date) || null,
        };
      })
      .filter(
        (installment) =>
          installment.amountType === "remaining" || installment.amount > 0,
      );
    const hasExplicitAmountType = rawInstallments.some((installment) => {
      const item = toRecord(installment);
      return firstText(item.amountType, item.amount_type, item.type);
    });

    if (!hasExplicitAmountType) {
      const baseSum = mappedInstallments.reduce(
        (total, installment) => total + installment.amount,
        0,
      );

      if (baseSum > 0) {
        return mappedInstallments.map((installment) => ({
          ...installment,
          amountType: "percentage",
          amount: Number(((installment.amount / baseSum) * 100).toFixed(2)),
        }));
      }
    }

    return mappedInstallments;
  }

  const installmentsCount = Math.max(
    0,
    Number.parseInt(
      String(
        record.installmentsCount ||
          record.installments_count ||
          record.ratesCount ||
          (typeof record.installments === "number" ? record.installments : ""),
      ),
      10,
    ) || 0,
  );
  const total = totalOverride ?? calculatePlanTotal(record);
  if (installmentsCount > 0 && total > 0) {
    return Array.from({ length: installmentsCount }, (_, index) => ({
      id: `${planId}_installment_${index + 1}`,
      label: `Rata ${index + 1}`,
      amountType:
        index === installmentsCount - 1 ? "remaining" : "percentage",
      amount:
        index === installmentsCount - 1
          ? 0
          : Number((100 / installmentsCount).toFixed(2)),
      dueAfterDays: index * 30,
      dueDate: null,
    }));
  }

  return [];
};

const roundCurrency = (value: number) => Number(value.toFixed(2));

const parseDate = (value: unknown) => {
  const raw = firstText(value);
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toIsoDateOnly = (value: Date) => value.toISOString().slice(0, 10);

const addDays = (value: Date, days: number) => {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
};

const diffInDays = (start: Date, end: Date) => {
  const startUtc = Date.UTC(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(0, Math.ceil((endUtc - startUtc) / 86400000));
};

const diffInCalendarMonthsInclusive = (start: Date, end: Date) => {
  if (end < start) {
    return 0;
  }

  return (
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth()) +
    1
  );
};

const normalizeProrationMethod = (
  value: unknown,
): NormalizedPaymentPlanProrationSettings["method"] => {
  const normalized = toLowerText(value);
  if (normalized === "days" || normalized === "giorni") return "days";
  if (normalized === "months" || normalized === "mesi") return "months";
  return "none";
};

const normalizeProrationSettings = (
  plan: Record<string, any>,
): NormalizedPaymentPlanProrationSettings => {
  const source = toRecord(
    plan.proration ||
      plan.prorationSettings ||
      plan.proration_settings ||
      plan.proRata ||
      plan.pro_rata,
  );
  const method = normalizeProrationMethod(source.method || plan.prorationMethod);
  const enabled = Boolean(source.enabled ?? source.active ?? method !== "none");

  return {
    enabled,
    // Un pro-rata attivo con metodo non riconosciuto resta `none`, ma
    // `calculateProratedTotal` lo segnala invece di degradarlo in silenzio.
    method: enabled ? method : "none",
    seasonStartDate:
      firstText(
        source.seasonStartDate,
        source.season_start_date,
        source.periodStartDate,
        source.period_start_date,
      ) || null,
    seasonEndDate:
      firstText(
        source.seasonEndDate,
        source.season_end_date,
        source.periodEndDate,
        source.period_end_date,
      ) || null,
    allowManualOverride: Boolean(
      source.allowManualOverride ??
        source.allow_manual_override ??
        source.manualOverride ??
        false,
    ),
  };
};

/**
 * Perche il pro-rata e (o non e) stato applicato.
 *
 * Serve alla UI. Prima esisteva solo `applied`, un booleano, e la scheda
 * atleta mostrava «Non applicato» in almeno **quattro** situazioni diverse:
 * piano senza pro-rata, pro-rata acceso senza metodo, periodo non
 * configurato, e piano non ancora scelto. Sono quattro cose da fare diverse —
 * una si risolve nel piano, una nella data di iscrizione, una non e un
 * problema — e dirle con la stessa frase non aiuta nessuno.
 */
export type PaymentPlanProrationReason =
  /** Il piano non prevede pro-rata: non c'e niente da applicare. */
  | "not-configured"
  /** Acceso, ma senza metodo di calcolo. */
  | "no-method"
  /** Acceso, ma manca il periodo o la data di iscrizione. */
  | "missing-period"
  /** Il piano non ha un importo su cui calcolarlo. */
  | "no-amount"
  /** Calcolato. */
  | "applied"
  /** Sostituito da un importo scritto a mano. */
  | "manual";

export type ProratedTotalResult = {
  total: number;
  originalTotal: number;
  applied: boolean;
  adjusted: boolean;
  method: NormalizedPaymentPlanProrationSettings["method"] | "manual";
  reason: PaymentPlanProrationReason;
  warning: string | null;
  /** Periodo effettivamente usato, per poterlo mostrare. */
  periodStart: string | null;
  periodEnd: string | null;
  /** Il periodo non era nel piano: viene dalla stagione attiva del club. */
  periodFromSeason: boolean;
};

/**
 * Applica il pro-rata al totale del piano.
 *
 * `applied` significa **il pro-rata e stato calcolato**, non «l'importo e
 * cambiato». Un'iscrizione che parte esattamente all'inizio del periodo paga
 * il 100%: il pro-rata e comunque stato applicato, e la UI deve dirlo.
 * Prima `applied` era `prorated !== baseTotal`, quindi in quel caso — il piu
 * comune a inizio stagione — mostrava «Non applicato» (WP-33).
 *
 * `adjusted` distingue il caso in cui l'importo e davvero cambiato.
 *
 * **`fallbackPeriod` e la correzione di RC Fix 1.** Il modulo del piano
 * chiede «Inizio periodo/stagione» e «Fine periodo/stagione» come due date da
 * riscrivere ogni anno: chi accendeva il pro-rata e le lasciava vuote
 * otteneva un pro-rata che non si applicava mai, con un avviso in fondo alla
 * scheda che nessuno collegava alla causa. La stagione attiva del club **e**
 * quel periodo: usarla quando il piano non ne dichiara uno proprio non
 * inventa niente, e il risultato dice che lo ha fatto (`periodFromSeason`).
 */
export const calculateProratedTotal = ({
  total,
  proration,
  startDate,
  manualOverride,
  fallbackPeriod,
}: {
  total: number;
  proration?: NormalizedPaymentPlanProrationSettings | null;
  startDate?: unknown;
  manualOverride?: unknown;
  /** Periodo da usare quando il piano non ne porta uno: la stagione attiva. */
  fallbackPeriod?: { startDate?: unknown; endDate?: unknown } | null;
}): ProratedTotalResult => {
  const baseTotal = roundCurrency(Math.max(0, Number(total) || 0));
  const manualAmount = toPaymentPlanAmount(manualOverride);

  const result = (value: {
    total: number;
    applied: boolean;
    method: NormalizedPaymentPlanProrationSettings["method"] | "manual";
    reason: PaymentPlanProrationReason;
    warning?: string | null;
    periodStart?: Date | null;
    periodEnd?: Date | null;
    periodFromSeason?: boolean;
  }): ProratedTotalResult => ({
    total: value.total,
    originalTotal: baseTotal,
    applied: value.applied,
    adjusted: value.applied && value.total !== baseTotal,
    method: value.method,
    reason: value.reason,
    warning: value.warning ?? null,
    periodStart: value.periodStart
      ? value.periodStart.toISOString().slice(0, 10)
      : null,
    periodEnd: value.periodEnd ? value.periodEnd.toISOString().slice(0, 10) : null,
    periodFromSeason: Boolean(value.periodFromSeason),
  });

  if (proration?.allowManualOverride && manualAmount > 0) {
    return result({
      total: manualAmount,
      applied: true,
      method: "manual",
      reason: "manual",
    });
  }

  if (!proration?.enabled) {
    return result({
      total: baseTotal,
      applied: false,
      method: "none",
      reason: "not-configured",
    });
  }

  if (proration.method === "none") {
    return result({
      total: baseTotal,
      applied: false,
      method: "none",
      reason: "no-method",
      warning:
        "Il pro-rata e attivo ma non ha un metodo di calcolo: scegli giorni o mesi.",
    });
  }

  if (baseTotal <= 0) {
    return result({
      total: baseTotal,
      applied: false,
      method: proration.method,
      reason: "no-amount",
    });
  }

  const planStart = parseDate(proration.seasonStartDate);
  const planEnd = parseDate(proration.seasonEndDate);
  /*
    Il ripiego e tutto o niente. Mescolare l'inizio scritto nel piano con la
    fine presa dalla stagione produrrebbe un periodo che nessuno ha deciso, e
    un importo che nessuno saprebbe rifare a mano.
  */
  const usesFallback = !planStart || !planEnd;
  const seasonStart = usesFallback
    ? parseDate(fallbackPeriod?.startDate)
    : planStart;
  const seasonEnd = usesFallback ? parseDate(fallbackPeriod?.endDate) : planEnd;
  const assignmentStart = parseDate(startDate);

  if (!seasonStart || !seasonEnd || !assignmentStart || seasonEnd <= seasonStart) {
    return result({
      total: baseTotal,
      applied: false,
      method: proration.method,
      reason: "missing-period",
      warning: assignmentStart
        ? "Il pro-rata e attivo ma il periodo non e definito: scrivilo nel piano o imposta il periodo della stagione attiva."
        : "Il pro-rata e attivo ma manca la data di inizio iscrizione dell'atleta.",
    });
  }

  const periodFromSeason = usesFallback;
  const effectiveStart =
    assignmentStart < seasonStart ? seasonStart : assignmentStart;

  if (effectiveStart >= seasonEnd) {
    return result({
      total: 0,
      applied: true,
      method: proration.method,
      reason: "applied",
      periodStart: seasonStart,
      periodEnd: seasonEnd,
      periodFromSeason,
    });
  }

  if (proration.method === "months") {
    const totalMonths = diffInCalendarMonthsInclusive(seasonStart, seasonEnd);
    const remainingMonths = diffInCalendarMonthsInclusive(effectiveStart, seasonEnd);

    return result({
      total: totalMonths
        ? roundCurrency(baseTotal * (remainingMonths / totalMonths))
        : baseTotal,
      applied: true,
      method: "months",
      reason: "applied",
      periodStart: seasonStart,
      periodEnd: seasonEnd,
      periodFromSeason,
    });
  }

  const totalDays = diffInDays(seasonStart, seasonEnd);
  const remainingDays = diffInDays(effectiveStart, seasonEnd);

  return result({
    total: totalDays
      ? roundCurrency(baseTotal * (remainingDays / totalDays))
      : baseTotal,
    applied: true,
    method: "days",
    reason: "applied",
    periodStart: seasonStart,
    periodEnd: seasonEnd,
    periodFromSeason,
  });
};

/**
 * Cosa mostrare accanto alla voce «Pro-rata».
 *
 * Una funzione sola perche le due schermate che lo mostrano — riepilogo
 * iscrizione e conferma del piano — dicevano cose diverse per lo stesso stato.
 */
/**
 * Importi e date come li scrive il resto dell'applicazione.
 *
 * `toFixed(2)` metteva il punto decimale — «Da 600.00 a 506.04» — accanto a
 * «600,00 €» stampato due righe sopra dalla stessa schermata. Visto in UAT su
 * staging. La formattazione e esplicitamente `it-IT` e non dipende dalla
 * localizzazione della macchina che disegna la pagina.
 */
const italianAmount = (value: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

const italianDay = (iso: string) => {
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;

  return parsed.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

export const describeProrationResult = (
  result?: ProratedTotalResult | null,
): { label: string; detail: string | null; tone: "applied" | "neutral" | "warning" } => {
  if (!result) {
    return {
      label: "Da calcolare",
      detail: "Scegli un piano per vedere se il pro-rata si applica.",
      tone: "neutral",
    };
  }

  if (result.reason === "manual") {
    return {
      label: "Importo su misura",
      detail: "Il totale e stato scritto a mano, al posto del calcolo.",
      tone: "applied",
    };
  }

  if (result.reason === "applied") {
    const period =
      result.periodStart && result.periodEnd
        ? ` sul periodo ${italianDay(result.periodStart)} - ${italianDay(result.periodEnd)}`
        : "";
    return {
      label: "Pro-rata applicato",
      detail: result.adjusted
        ? `Da ${italianAmount(result.originalTotal)} a ${italianAmount(result.total)}${period}${
            result.periodFromSeason ? ", periodo della stagione attiva" : ""
          }.`
        : `L'iscrizione copre tutto il periodo${period}: si paga la quota intera.`,
      tone: "applied",
    };
  }

  if (result.reason === "not-configured") {
    return {
      label: "Non previsto dal piano",
      detail: "Questo piano non calcola la quota in proporzione al periodo.",
      tone: "neutral",
    };
  }

  if (result.reason === "no-amount") {
    return {
      label: "Non calcolabile",
      detail: "Il piano non ha un importo su cui calcolarlo.",
      tone: "neutral",
    };
  }

  return {
    label: "Attivo, non calcolabile",
    detail: result.warning,
    tone: "warning",
  };
};

export const roundInstallmentsToFive = (
  amounts: number[],
  totalAmount: number,
  options: { preserveIndexes?: number[] } = {},
) => {
  const total = roundCurrency(Math.max(0, totalAmount));
  if (amounts.length <= 1) {
    return [total];
  }

  let assigned = 0;
  const preserveIndexes = new Set(options.preserveIndexes || []);
  return amounts.map((amount, index) => {
    if (index === amounts.length - 1) {
      return roundCurrency(total - assigned);
    }

    const rounded = preserveIndexes.has(index)
      ? roundCurrency(Math.min(total - assigned, toPaymentPlanAmount(amount)))
      : Math.max(0, Math.floor(toPaymentPlanAmount(amount) / 5) * 5);
    assigned = roundCurrency(assigned + rounded);
    return rounded;
  });
};

export const generateInstallmentPreview = (
  plan: unknown,
  totalAmount: number,
  options: { startDate?: unknown } = {},
) => {
  const normalizedPlan = normalizePaymentPlan(plan);
  const schedule =
    normalizedPlan.installments.length > 0
      ? normalizedPlan.installments
      : [
          {
            id: `${normalizedPlan.id}_single_payment`,
            label: "Pagamento unico",
            amountType: "percentage" as const,
            amount: 100,
            dueAfterDays: 0,
            dueDate: null,
          },
        ];
  const total = roundCurrency(Math.max(0, totalAmount));
  const percentageTotal = schedule
    .filter((installment) => installment.amountType === "percentage")
    .reduce((sum, installment) => sum + toPaymentPlanAmount(installment.amount), 0);
  const fixedTotal = schedule
    .filter((installment) => installment.amountType === "fixed")
    .reduce((sum, installment) => sum + toPaymentPlanAmount(installment.amount), 0);
  const warnings: string[] = [];

  if (percentageTotal > 100) {
    warnings.push("La somma delle percentuali supera il 100%.");
  }

  if (fixedTotal > total) {
    warnings.push("Gli importi fissi superano il totale del piano.");
  }

  let assignedBeforeRemaining = 0;
  const rawAmounts = schedule.map((installment) => {
    if (installment.amountType === "remaining") {
      const amount = Math.max(0, total - assignedBeforeRemaining);
      assignedBeforeRemaining = roundCurrency(assignedBeforeRemaining + amount);
      return amount;
    }

    const amount =
      installment.amountType === "percentage"
        ? roundCurrency((total * toPaymentPlanAmount(installment.amount)) / 100)
        : toPaymentPlanAmount(installment.amount);
    assignedBeforeRemaining = roundCurrency(assignedBeforeRemaining + amount);
    return amount;
  });
  const rawTotal = rawAmounts.reduce((sum, amount) => sum + amount, 0);

  if (rawTotal < total && rawAmounts.length > 0) {
    rawAmounts[rawAmounts.length - 1] = roundCurrency(
      rawAmounts[rawAmounts.length - 1] + (total - rawTotal),
    );
  }

  const roundedAmounts = roundInstallmentsToFive(rawAmounts, total, {
    preserveIndexes: schedule
      .map((installment, index) =>
        installment.amountType === "fixed" ? index : -1,
      )
      .filter((index) => index >= 0 && index < schedule.length - 1),
  });
  const parsedStartDate = parseDate(options.startDate);

  return {
    installments: schedule.map((installment, index) => ({
      ...installment,
      amount: roundedAmounts[index] || 0,
      dueDate: parsedStartDate
        ? toIsoDateOnly(addDays(parsedStartDate, installment.dueAfterDays))
        : installment.dueDate,
    })),
    warnings,
  };
};

export const calculatePlanInstallmentsForTotal = (
  plan: unknown,
  totalAmount: number,
  options: { startDate?: unknown } = {},
) => generateInstallmentPreview(plan, totalAmount, options).installments;

const normalizeDiscountIds = (value: unknown) =>
  (Array.isArray(value) ? value : value ? [value] : [])
    .map((item) => {
      const record = toRecord(item);
      return firstText(record.id, record.name, record.title, item);
    })
    .filter(Boolean);

export const normalizePaymentPlan = (plan: unknown): NormalizedPaymentPlan => {
  const record = toRecord(plan);
  const name = firstText(record.name, record.title, record.label) || "Piano";
  const id = firstText(record.id, record.code) || buildStableId("plan", name);
  const services = collectPlanServices(record, id);
  const servicesTotal = services.reduce(
    (total, service) =>
      total + (service.included && !service.optional ? service.price : 0),
    0,
  );
  const directTotal = firstPositiveAmount(
    record.totalAmount,
    record.total_amount,
    record.amount,
    record.price,
    record.value,
  );
  const totalAmount = Number((servicesTotal || directTotal).toFixed(2));
  const installments = normalizePlanInstallments(record, totalAmount);
  const installmentsCount =
    installments.length ||
    Number.parseInt(
      String(
        record.installmentsCount ||
          record.installments_count ||
          (typeof record.installments === "number" ? record.installments : 1),
      ),
      10,
    ) ||
    1;
  const proration = normalizeProrationSettings(record);

  return {
    id,
    name,
    description: firstText(record.description),
    services,
    amount: totalAmount,
    totalAmount,
    installments,
    installmentsCount,
    installmentAmount:
      firstPositiveAmount(record.installmentAmount, record.installment_amount) ||
      (installmentsCount > 0
        ? Number((totalAmount / installmentsCount).toFixed(2))
        : totalAmount),
    proration,
    applicableDiscountIds: normalizeDiscountIds(
      record.applicableDiscountIds ||
        record.applicable_discount_ids ||
        record.discounts ||
        record.discountIds,
    ),
    notes: firstText(record.notes, record.note),
    active: record.active === false ? false : true,
    raw: record,
  };
};

export const normalizePaymentPlans = (plans: unknown) =>
  (Array.isArray(plans) ? plans : []).map(normalizePaymentPlan);

export const findPaymentPlan = (
  selectedPlan: unknown,
  paymentPlans: unknown[] = [],
) => {
  const normalizedSelectedPlan = toLowerText(selectedPlan);
  if (!normalizedSelectedPlan) {
    return null;
  }

  return (
    normalizePaymentPlans(paymentPlans).find((plan) =>
      [plan.id, plan.name, plan.raw?.title, plan.raw?.code]
        .map((value) => toLowerText(value))
        .filter(Boolean)
        .includes(normalizedSelectedPlan),
    ) || null
  );
};

export const planAllowsDiscount = (
  plan: NormalizedPaymentPlan | null,
  discount: unknown,
) => {
  if (!plan || plan.applicableDiscountIds.length === 0) {
    return true;
  }

  const record = toRecord(discount);
  const discountTokens = [record.id, record.name, record.title, record.label]
    .map((value) => toLowerText(value))
    .filter(Boolean);
  const allowedTokens = plan.applicableDiscountIds.map(toLowerText);

  return discountTokens.some((token) => allowedTokens.includes(token));
};
