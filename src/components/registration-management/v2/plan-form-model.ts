import {
  calculatePlanTotal,
  calculateProratedTotal,
  generateInstallmentPreview,
  normalizePaymentPlan,
  type NormalizedPaymentPlan,
} from "@/lib/payment-plan-utils";
import { todayLocalDateOnly } from "@/lib/date-only";

/**
 * Il modulo del piano di pagamento, senza React.
 *
 * E la logica che `registration-management/page.tsx` (V1) teneva in linea fra
 * lo stato del dialogo e il markup: le fabbriche del servizio e della rata,
 * il modulo vuoto, la lettura di un piano esistente nel modulo, la
 * validazione e la composizione del record da salvare. **Niente e cambiato
 * nei valori**: stessi default (`allenamenti`, «Pagamento unico» al 100%,
 * `Rata n` a saldo dopo `n·30` giorni), stessi messaggi, stesso record scritto
 * in `payment_plans` — `normalizePaymentPlan` resta l'unico che decide la
 * forma, e qui si compone soltanto.
 *
 * I calcoli (totale, pro-rata, anteprima delle rate) restano in
 * `src/lib/payment-plan-utils.ts`; questo modulo li chiama con gli stessi
 * argomenti della V1 (`startDate: todayLocalDateOnly()`,
 * `fallbackPeriod: seasonPeriod`).
 */

export type PlanServiceDraft = {
  id: string;
  name: string;
  description: string;
  price: number;
  type: string;
  optional: boolean;
  required: boolean;
  included: boolean;
};

export type PlanInstallmentDraft = {
  id: string;
  label: string;
  amountType: "percentage" | "fixed" | "remaining";
  amount: number;
  dueAfterDays: number;
  /** Passa invariata da un record esistente: la V1 la conservava con lo spread. */
  dueDate?: string | null;
};

export type PlanProrationDraft = {
  enabled: boolean;
  method: "none" | "days" | "months";
  seasonStartDate: string;
  seasonEndDate: string;
  allowManualOverride: boolean;
};

export type PaymentPlanDraft = {
  name: string;
  description: string;
  amount: number;
  services: PlanServiceDraft[];
  installments: number;
  installmentAmount: number;
  installmentSchedule: PlanInstallmentDraft[];
  proration: PlanProrationDraft;
  applicableDiscountIds: string[];
  notes: string;
  active: boolean;
};

export type SeasonPeriod = { startDate: string; endDate: string };

const newId = (prefix: string, suffix = "") =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${prefix}_${Date.now()}${suffix}`;

export const createPlanService = (): PlanServiceDraft => ({
  id: newId("service"),
  name: "",
  description: "",
  price: 0,
  type: "allenamenti",
  optional: false,
  required: true,
  included: true,
});

export const createPlanInstallment = (index = 0): PlanInstallmentDraft => ({
  id: newId("installment", `_${index}`),
  label: index === 0 ? "Pagamento unico" : `Rata ${index + 1}`,
  amountType: index === 0 ? "percentage" : "remaining",
  amount: index === 0 ? 100 : 0,
  dueAfterDays: index * 30,
});

export const createPlanProrationSettings = (): PlanProrationDraft => ({
  enabled: false,
  method: "none",
  seasonStartDate: "",
  seasonEndDate: "",
  allowManualOverride: true,
});

export const createEmptyPaymentPlanDraft = (): PaymentPlanDraft => ({
  name: "",
  description: "",
  amount: 0,
  services: [createPlanService()],
  installments: 1,
  installmentAmount: 0,
  installmentSchedule: [createPlanInstallment()],
  proration: createPlanProrationSettings(),
  applicableDiscountIds: [],
  notes: "",
  active: true,
});

/** Il modulo di un piano esistente: e `editPlan` della V1. */
export const planDraftFromRecord = (plan: unknown): PaymentPlanDraft => {
  const normalizedPlan = normalizePaymentPlan(plan);
  return {
    name: normalizedPlan.name,
    description: normalizedPlan.description,
    amount: normalizedPlan.totalAmount,
    services:
      normalizedPlan.services.length > 0
        ? normalizedPlan.services.map((service) => ({ ...service }))
        : [createPlanService()],
    installments: normalizedPlan.installmentsCount || 1,
    installmentAmount: normalizedPlan.installmentAmount || 0,
    installmentSchedule:
      normalizedPlan.installments.length > 0
        ? normalizedPlan.installments.map((installment) => ({ ...installment }))
        : [createPlanInstallment()],
    proration: {
      ...normalizedPlan.proration,
      seasonStartDate: normalizedPlan.proration.seasonStartDate || "",
      seasonEndDate: normalizedPlan.proration.seasonEndDate || "",
    },
    applicableDiscountIds: normalizedPlan.applicableDiscountIds,
    notes: normalizedPlan.notes,
    active: normalizedPlan.active,
  };
};

/**
 * Accendere il pro-rata senza metodo lo porta a «per giorni»; spegnerlo lo
 * riporta a `none`. Sono le due regole di `updatePlanProration` della V1.
 */
export const applyProrationChange = (
  proration: PlanProrationDraft,
  field: keyof PlanProrationDraft,
  value: string | boolean,
): PlanProrationDraft => {
  const next = { ...proration, [field]: value } as PlanProrationDraft;
  if (field === "enabled" && value === false) next.method = "none";
  if (field === "enabled" && value === true && next.method === "none") next.method = "days";
  return next;
};

/**
 * I numeri che il modulo mostra mentre si compila: totale automatico,
 * totale d'esempio con il pro-rata di oggi, anteprima delle rate e
 * l'importo della prima rata (o la media, come faceva la V1).
 */
export const computePlanPreview = (
  draft: PaymentPlanDraft,
  seasonPeriod: SeasonPeriod | null,
) => {
  const currentPlanTotal = calculatePlanTotal(draft);
  const prorationPreview = calculateProratedTotal({
    total: currentPlanTotal,
    proration: normalizePaymentPlan(draft).proration,
    startDate: todayLocalDateOnly(),
    fallbackPeriod: seasonPeriod,
  });
  const installmentPreview = generateInstallmentPreview(draft, prorationPreview.total, {
    startDate: todayLocalDateOnly(),
  });
  const displayedInstallmentAmount =
    installmentPreview.installments[0]?.amount ||
    (draft.installments > 1
      ? draft.installmentAmount ||
        Number((currentPlanTotal / Math.max(draft.installments, 1)).toFixed(2))
      : currentPlanTotal);

  return { currentPlanTotal, prorationPreview, installmentPreview, displayedInstallmentAmount };
};

/**
 * La frase sotto le date del pro-rata: quale periodo verra usato. Senza date
 * e con una stagione attiva si usa il periodo della stagione attiva; e la
 * correzione di RC Fix 1 (`tests/lib/payment-proration.test.mjs`).
 */
export const describeProrationPeriod = (
  proration: PlanProrationDraft,
  seasonPeriod: SeasonPeriod | null,
) => {
  if (!proration.seasonStartDate || !proration.seasonEndDate) {
    return seasonPeriod
      ? `Se lasci vuote le date uso il periodo della stagione attiva: ${seasonPeriod.startDate} - ${seasonPeriod.endDate}.`
      : "Senza queste date e senza una stagione attiva con un periodo, il pro-rata non puo essere calcolato.";
  }
  return "Il piano ha un periodo proprio: la stagione attiva non viene usata.";
};

export type PlanValidation =
  | { ok: true; validServices: PlanServiceDraft[] }
  | { ok: false; message: string; field?: "name" | "services" | "installments" };

/** La validazione di `savePlan`, con gli stessi messaggi. */
export const validatePlanDraft = (
  draft: PaymentPlanDraft,
  installmentWarnings: readonly string[],
): PlanValidation => {
  const validServices = draft.services.filter((service) => String(service.name || "").trim());
  if (!draft.name || validServices.length === 0) {
    return {
      ok: false,
      message: "Inserisci nome piano e almeno un servizio",
      field: !draft.name ? "name" : "services",
    };
  }
  if (installmentWarnings.length > 0) {
    return { ok: false, message: installmentWarnings[0], field: "installments" };
  }
  return { ok: true, validServices };
};

/** Il record che finisce in `payment_plans`: e `planToSave` della V1, invariato. */
export const buildPlanRecord = ({
  draft,
  validServices,
  editing,
  currentPlanTotal,
  displayedInstallmentAmount,
}: {
  draft: PaymentPlanDraft;
  validServices: PlanServiceDraft[];
  editing: Record<string, any> | null;
  currentPlanTotal: number;
  displayedInstallmentAmount: number;
}) => {
  const normalizedDraft = normalizePaymentPlan({
    ...draft,
    services: validServices,
    installmentSchedule: draft.installmentSchedule,
    proration: draft.proration,
    amount: currentPlanTotal,
    totalAmount: currentPlanTotal,
    installmentsCount: Math.max(draft.installmentSchedule.length, 1),
    installmentAmount: displayedInstallmentAmount,
  });
  const normalizedPlanFields: Partial<NormalizedPaymentPlan> = { ...normalizedDraft };
  delete normalizedPlanFields.raw;

  return {
    ...editing,
    ...normalizedPlanFields,
    amount: normalizedDraft.totalAmount,
    totalAmount: normalizedDraft.totalAmount,
    installments: normalizedDraft.installmentsCount,
    installmentsCount: normalizedDraft.installmentsCount,
    installmentAmount: normalizedDraft.installmentAmount,
    installmentSchedule: normalizedDraft.installments,
    paymentSchedule: normalizedDraft.installments,
    proration: normalizedDraft.proration,
    applicableDiscountIds: normalizedDraft.applicableDiscountIds,
    services: normalizedDraft.services,
    notes: normalizedDraft.notes,
    active: Boolean(draft.active ?? true),
    id: editing?.id || `plan_${Date.now()}`,
    createdAt: editing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

/** L'identificativo con cui un piano nomina uno sconto (id, o titolo, o nome). */
export const discountIdOf = (discount: Record<string, any>) =>
  String(discount.id || discount.title || discount.name);
