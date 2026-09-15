import {
  BONUS_FISCAL_TREATMENT_LABELS,
  COMPENSATION_PLAN_KIND_LABELS,
  EXPENSE_CATEGORY_LABELS,
  OBLIGATION_KIND_LABELS,
  OUTBOUND_TRANSACTION_TYPE_LABELS,
  RELATIONSHIP_STATUS_LABELS,
  RELATIONSHIP_TYPE_LABELS,
  SPORT_WORK_DOCUMENT_CATEGORY_LABELS,
  SPORT_WORK_ROLE_LABELS,
  type RelationshipStatus,
} from "@/lib/sport-work/model";
import { CONFIGURED_RULE_YEARS } from "@/lib/sport-work/rules";
import { daysUntil, formatDateShort, formatMoney, joinMeta, MISSING } from "@/lib/web/format";

/**
 * Il modello di presentazione del lavoro sportivo (Web V2): tipi delle righe
 * dell'API, etichette del dominio, collegamenti con `clubId`, la frase della
 * scadenza e i tre cassetti temporali della pagina «Scadenze».
 *
 * Modulo puro: niente React, niente `window`. Le etichette **non si
 * riscrivono**: vengono da `src/lib/sport-work/model.ts`, cosi una schermata
 * non chiama mai «scaduta» cio che il motore chiama «maturata».
 */

/* ── Righe dell'API ─────────────────────────────────────────────────────── */
export type SportWorkPerson = {
  id: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  fiscal_code?: string | null;
  email?: string | null;
  phone?: string | null;
  vat_number?: string | null;
  has_iban?: boolean;
};

export type RelationshipRow = {
  id: string;
  person_id: string;
  role: string;
  relationship_type: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  contract_amount: number | null;
  compensation_frequency?: string | null;
  weekly_hours?: number | null;
  contract_attachment_id?: string | null;
  rasd_status?: string | null;
  termination_reason?: string | null;
  notes?: string | null;
};

export type InstallmentRow = {
  id: string;
  relationship_id: string;
  sequence?: number;
  label: string;
  due_date: string;
  gross_amount: number;
  accrued_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: string;
  cancelled: boolean;
};

export type PayoutRow = {
  id: string;
  transaction_type: string;
  person_id: string;
  relationship_id?: string | null;
  paid_at: string;
  fiscal_year: number;
  gross_amount: number;
  employee_contribution?: number;
  employer_contribution?: number;
  net_amount?: number;
  club_cost?: number;
  fiscal_treatment?: string;
  rules_version?: string | null;
  reversed_at?: string | null;
  reversal_reason?: string | null;
  payment_method?: string | null;
  reference?: string | null;
};

export type ObligationRow = {
  id: string;
  kind: string;
  title: string;
  description?: string | null;
  due_date: string;
  status: string;
  amount: number | null;
  period?: string | null;
  paymentReversed?: boolean;
};

/* ── Etichette del dominio ──────────────────────────────────────────────── */
const labelOf = (map: Record<string, string>, value: unknown) => map[String(value || "")] || String(value || MISSING);

export const roleLabel = (value: unknown) => labelOf(SPORT_WORK_ROLE_LABELS, value);
export const relationshipTypeLabel = (value: unknown) => labelOf(RELATIONSHIP_TYPE_LABELS, value);
export const relationshipStatusLabel = (value: unknown) => labelOf(RELATIONSHIP_STATUS_LABELS, value);
export const obligationKindLabel = (value: unknown) => labelOf(OBLIGATION_KIND_LABELS, value);
export const transactionTypeLabel = (value: unknown) => labelOf(OUTBOUND_TRANSACTION_TYPE_LABELS, value);
export const bonusTreatmentLabel = (value: unknown) => labelOf(BONUS_FISCAL_TREATMENT_LABELS, value);
export const expenseCategoryLabel = (value: unknown) => labelOf(EXPENSE_CATEGORY_LABELS, value);
export const planKindLabel = (value: unknown) => labelOf(COMPENSATION_PLAN_KIND_LABELS, value);
export const documentCategoryLabel = (value: unknown) => labelOf(SPORT_WORK_DOCUMENT_CATEGORY_LABELS, value);

/** I verbi delle transizioni, come nella V1. */
export const TRANSITION_VERBS: Partial<Record<RelationshipStatus, string>> = {
  ACTIVE: "Attiva",
  SUSPENDED: "Sospendi",
  TERMINATED: "Cessa",
};

/* ── Collegamenti ───────────────────────────────────────────────────────── */
export const withClubId = (href: string, clubId: string | null | undefined) =>
  clubId ? `${href}${href.includes("?") ? "&" : "?"}clubId=${encodeURIComponent(clubId)}` : href;

export const relationshipHref = (id: string, clubId: string | null | undefined) =>
  withClubId(`/sport-work/relationships/${encodeURIComponent(id)}`, clubId);

/* ── Persone ────────────────────────────────────────────────────────────── */
export const personNameMap = (people: readonly SportWorkPerson[]) =>
  new Map<string, string>(people.map((person) => [String(person.id), String(person.full_name || "").trim()]));

export const personOfRelationshipMap = (relationships: readonly RelationshipRow[]) =>
  new Map<string, string>(relationships.map((row) => [String(row.id), String(row.person_id)]));

/** `Allenatore · Co.co.co. sportiva · 1 set 2026 — 30 giu 2027` */
export const relationshipMeta = (row: RelationshipRow) =>
  joinMeta(
    roleLabel(row.role),
    relationshipTypeLabel(row.relationship_type),
    row.start_date ? `${formatDateShort(row.start_date)}${row.end_date ? ` — ${formatDateShort(row.end_date)}` : ""}` : null,
  );

/* ── Date e scadenze ────────────────────────────────────────────────────── */
/**
 * La frase della scadenza, come nella V1: «scaduta da 3 giorni», «scade
 * oggi», «scade domani», «fra 12 giorni». Vuota se la data manca.
 */
export const dueLabel = (value: string | Date | null | undefined, today: Date = new Date()) => {
  const days = daysUntil(value, today);
  if (days === null) return "";
  if (days < 0) return `scaduta da ${Math.abs(days)} ${Math.abs(days) === 1 ? "giorno" : "giorni"}`;
  if (days === 0) return "scade oggi";
  if (days === 1) return "scade domani";
  return `fra ${days} giorni`;
};

export type DeadlineBucket = "overdue" | "week" | "month" | "later";

export const DEADLINE_BUCKETS: ReadonlyArray<{ id: DeadlineBucket; label: string; empty: string }> = [
  { id: "overdue", label: "In ritardo", empty: "Niente in ritardo." },
  { id: "week", label: "Entro sette giorni", empty: "Niente in scadenza questa settimana." },
  { id: "month", label: "Entro trenta giorni", empty: "Niente in scadenza nel mese." },
  { id: "later", label: "Oltre trenta giorni", empty: "Niente oltre il mese." },
];

export const deadlineBucketOf = (value: string | Date | null | undefined, today: Date = new Date()): DeadlineBucket => {
  const days = daysUntil(value, today);
  if (days === null) return "later";
  if (days < 0) return "overdue";
  if (days <= 7) return "week";
  if (days <= 30) return "month";
  return "later";
};

export const deadlineBucketLabel = (bucket: DeadlineBucket) => DEADLINE_BUCKETS.find((b) => b.id === bucket)?.label || bucket;

/** L'anno di regole per la posizione: quello corrente se configurato, altrimenti il primo. */
export const defaultRuleYear = (today: Date = new Date()) => {
  const current = today.getFullYear();
  return CONFIGURED_RULE_YEARS.includes(current) ? current : CONFIGURED_RULE_YEARS[0];
};

const MONTHS_LONG = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** `2026-09` → `settembre 2026` (il titolo del mese sul cruscotto). */
export const monthLabel = (month: string) => {
  const [year, index] = String(month || "").split("-");
  const position = Number(index) - 1;
  return MONTHS_LONG[position] ? `${MONTHS_LONG[position]} ${year}` : month;
};

/** Un importo o `—`, per le celle e i riepiloghi. */
export const money = (value: unknown) => (value == null || value === "" ? MISSING : formatMoney(Number(value)));

/** Le voci della pagina «Scadenze»: rate residue e adempimenti dovuti, insieme. */
export type DeadlineEntry = {
  id: string;
  kind: "installment" | "obligation";
  title: string;
  subtitle: string;
  dueDate: string;
  amount: number | null;
  status: string;
  bucket: DeadlineBucket;
  relationshipId?: string;
  installmentId?: string;
  payable: boolean;
};

export const buildDeadlineEntries = (
  input: {
    installments: readonly InstallmentRow[];
    obligations: readonly ObligationRow[];
    people: readonly SportWorkPerson[];
    relationships: readonly RelationshipRow[];
  },
  today: Date = new Date(),
): DeadlineEntry[] => {
  const names = personNameMap(input.people);
  const personOf = personOfRelationshipMap(input.relationships);

  const installmentEntries: DeadlineEntry[] = input.installments
    .filter((row) => !row.cancelled && Number(row.remaining_amount) > 0)
    .map((row) => ({
      id: `installment-${row.id}`,
      kind: "installment",
      title: names.get(personOf.get(String(row.relationship_id)) || "") || "Compenso",
      subtitle: `${row.label} · residuo ${formatMoney(Number(row.remaining_amount) || 0)}`,
      dueDate: String(row.due_date),
      amount: Number(row.remaining_amount) || 0,
      status: String(row.status),
      bucket: deadlineBucketOf(row.due_date, today),
      relationshipId: String(row.relationship_id),
      installmentId: String(row.id),
      payable: true,
    }));

  const obligationEntries: DeadlineEntry[] = input.obligations.map((row) => ({
    id: `obligation-${row.id}`,
    kind: "obligation",
    title: row.title,
    subtitle: obligationKindLabel(row.kind),
    dueDate: String(row.due_date),
    amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
    status: String(row.status),
    bucket: deadlineBucketOf(row.due_date, today),
    payable: false,
  }));

  return [...installmentEntries, ...obligationEntries].sort((left, right) => left.dueDate.localeCompare(right.dueDate));
};

export const sumAmounts = (rows: ReadonlyArray<{ amount: number | null }>) => rows.reduce((total, row) => total + (row.amount || 0), 0);
