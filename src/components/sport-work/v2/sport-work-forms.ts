import type { CompensationPlanKind, RelationshipType } from "@/lib/sport-work/model";
import { todayLocalDateOnly } from "@/lib/date-only";

/**
 * I moduli del lavoro sportivo come **dati puri**: valori iniziali, regole
 * del client e la traduzione del piano nella configurazione del motore.
 * Niente React: i cassetti li montano, i test li leggono.
 *
 * Le regole sono quelle del client V1 (data di inizio, persona o persona
 * nuova, importo dichiarato) piu quelle che il server applica comunque e
 * che conviene dire prima del giro di rete (fine non prima dell'inizio,
 * codice fiscale di 11–16 caratteri, importi maggiori di zero).
 */
export type FormError = { id?: string; field: string; label: string };

/* ── Nuovo rapporto ─────────────────────────────────────────────────────── */
export type PersonDraft = {
  firstName: string;
  lastName: string;
  fiscalCode: string;
  email: string;
  phone: string;
  originType: string;
  socialCoverage: string;
  fiscalProfile: string;
  vatNumber: string;
  iban: string;
};

export type RelationshipDraft = {
  personId: string;
  role: string;
  relationshipType: RelationshipType;
  startDate: string;
  endDate: string;
  contractAmount: string;
  compensationFrequency: string;
  weeklyHours: string;
  notes: string;
};

export type RelationshipDraftMode = "existing" | "new";

export const emptyPersonDraft = (): PersonDraft => ({
  firstName: "",
  lastName: "",
  fiscalCode: "",
  email: "",
  phone: "",
  originType: "trainer",
  socialCoverage: "NONE",
  fiscalProfile: "NONE",
  vatNumber: "",
  iban: "",
});

export const emptyRelationshipDraft = (): RelationshipDraft => ({
  personId: "",
  role: "COACH",
  relationshipType: "SPORT_COCOCO",
  startDate: "",
  endDate: "",
  contractAmount: "",
  compensationFrequency: "SEASONAL",
  weeklyHours: "",
  notes: "",
});

export const validateRelationshipDraft = (mode: RelationshipDraftMode, person: PersonDraft, form: RelationshipDraft, idPrefix = "sw"): FormError[] => {
  const errors: FormError[] = [];
  if (mode === "existing" && !form.personId) errors.push({ id: `${idPrefix}-person`, field: "personId", label: "Seleziona una persona o creane una nuova" });
  if (mode === "new") {
    if (!person.firstName.trim()) errors.push({ id: `${idPrefix}-first`, field: "firstName", label: "Il nome della persona è obbligatorio" });
    if (!person.lastName.trim()) errors.push({ id: `${idPrefix}-last`, field: "lastName", label: "Il cognome della persona è obbligatorio" });
    const cf = person.fiscalCode.trim().toUpperCase();
    if (cf && !/^[A-Z0-9]{11,16}$/.test(cf)) errors.push({ id: `${idPrefix}-cf`, field: "fiscalCode", label: "Il codice fiscale ha da 11 a 16 caratteri" });
  }
  if (!form.startDate) errors.push({ id: `${idPrefix}-start`, field: "startDate", label: "La data di inizio del rapporto è obbligatoria" });
  if (form.startDate && form.endDate && form.endDate < form.startDate) errors.push({ id: `${idPrefix}-end`, field: "endDate", label: "La data di fine non può precedere quella di inizio" });
  return errors;
};

/* ── Piano compensi ─────────────────────────────────────────────────────── */
export type PlanForm = {
  kind: CompensationPlanKind;
  totalAmount: string;
  installmentCount: string;
  firstDueDate: string;
  monthlyAmount: string;
  startMonth: string;
  endMonth: string;
  dueDayOfMonth: string;
};

export const emptyPlanForm = (): PlanForm => ({
  kind: "EQUAL_INSTALMENTS",
  totalAmount: "",
  installmentCount: "10",
  firstDueDate: "",
  monthlyAmount: "",
  startMonth: "",
  endMonth: "",
  dueDayOfMonth: "",
});

/** La configurazione che `generatePlanItems` e il `PUT …/plan` leggono: la stessa della V1. */
export const planFormToConfig = (form: PlanForm) => {
  if (form.kind === "MONTHLY") {
    return {
      kind: "MONTHLY" as const,
      monthlyAmount: Number(String(form.monthlyAmount).replace(",", ".")),
      startMonth: form.startMonth,
      endMonth: form.endMonth,
      dueDayOfMonth: form.dueDayOfMonth ? Number(form.dueDayOfMonth) : null,
    };
  }
  return {
    kind: "EQUAL_INSTALMENTS" as const,
    totalAmount: Number(String(form.totalAmount).replace(",", ".")),
    installmentCount: Number(form.installmentCount),
    firstDueDate: form.firstDueDate,
  };
};

/* ── Premio ─────────────────────────────────────────────────────────────── */
export type BonusDraft = { personId: string; relationshipId: string; reason: string; competition: string; amount: string; awardDate: string; fiscalTreatment: string };

export const emptyBonusDraft = (): BonusDraft => ({ personId: "", relationshipId: "", reason: "", competition: "", amount: "", awardDate: todayLocalDateOnly(), fiscalTreatment: "TO_VERIFY" });

const positiveAmount = (value: string) => value.trim() !== "" && Number(String(value).replace(",", ".")) > 0;

export const validateBonusDraft = (draft: BonusDraft): FormError[] => {
  const errors: FormError[] = [];
  if (!draft.personId) errors.push({ id: "bonus-person", field: "personId", label: "Scegli la persona" });
  if (!draft.reason.trim()) errors.push({ id: "bonus-reason", field: "reason", label: "La causale del premio è obbligatoria" });
  if (!positiveAmount(draft.amount)) errors.push({ id: "bonus-amount", field: "amount", label: "L'importo deve essere maggiore di zero" });
  if (!draft.awardDate) errors.push({ id: "bonus-date", field: "awardDate", label: "La data di assegnazione è obbligatoria" });
  return errors;
};

/* ── Rimborso spese ─────────────────────────────────────────────────────── */
export type ExpenseDraft = { personId: string; category: string; description: string; expenseDate: string; amount: string };

export const emptyExpenseDraft = (): ExpenseDraft => ({ personId: "", category: "TRAVEL", description: "", expenseDate: todayLocalDateOnly(), amount: "" });

export const validateExpenseDraft = (draft: ExpenseDraft): FormError[] => {
  const errors: FormError[] = [];
  if (!draft.personId) errors.push({ id: "exp-person", field: "personId", label: "Scegli la persona" });
  if (!draft.description.trim()) errors.push({ id: "exp-description", field: "description", label: "La causale della spesa è obbligatoria" });
  if (!positiveAmount(draft.amount)) errors.push({ id: "exp-amount", field: "amount", label: "L'importo deve essere maggiore di zero" });
  if (!draft.expenseDate) errors.push({ id: "exp-date", field: "expenseDate", label: "La data della spesa è obbligatoria" });
  return errors;
};

/* ── Fattura del professionista ─────────────────────────────────────────── */
export type InvoiceDraft = {
  relationshipId: string;
  documentNumber: string;
  documentDate: string;
  taxableAmount: string;
  vatAmount: string;
  withholdingAmount: string;
  totalAmount: string;
  dueDate: string;
};

export const emptyInvoiceDraft = (): InvoiceDraft => ({
  relationshipId: "",
  documentNumber: "",
  documentDate: todayLocalDateOnly(),
  taxableAmount: "",
  vatAmount: "",
  withholdingAmount: "",
  totalAmount: "",
  dueDate: "",
});

export const validateInvoiceDraft = (draft: InvoiceDraft): FormError[] => {
  const errors: FormError[] = [];
  if (!draft.relationshipId) errors.push({ id: "inv-relationship", field: "relationshipId", label: "Scegli il rapporto con partita IVA" });
  if (!draft.documentNumber.trim()) errors.push({ id: "inv-number", field: "documentNumber", label: "Il numero del documento è obbligatorio" });
  if (!draft.documentDate) errors.push({ id: "inv-date", field: "documentDate", label: "La data del documento è obbligatoria" });
  if (!positiveAmount(draft.totalAmount)) errors.push({ id: "inv-total", field: "totalAmount", label: "Il totale del documento deve essere maggiore di zero" });
  return errors;
};
