import type { SocialCoverage } from "./rules";

/**
 * Il vocabolario del dominio **Lavoro sportivo e compensi**: stati, tipi,
 * transizioni ammesse e le poche funzioni pure che li governano.
 *
 * Modulo **senza dipendenze**: niente Prisma, niente rete, niente React. Chi
 * lo importa puo essere un test, un servizio o una schermata.
 *
 * Tre scelte reggono tutto il resto.
 *
 * 1. **Programmato, maturato ed erogato sono tre grandezze, non tre valori di
 *    una colonna `status`.** Lo stato di una scadenza si *deriva* da loro, e
 *    non si imposta mai a mano. E la stessa disciplina che ADR-0036 ha gia
 *    fissato sugli incassi, applicata al contrario.
 * 2. **La stagione sportiva non e l'anno fiscale.** Il rapporto e il piano
 *    appartengono alla stagione; il calcolo e la posizione appartengono
 *    all'**anno solare** della data di pagamento.
 * 3. **Compenso, premio e rimborso non sono lo stesso oggetto.** Sommarli
 *    nella stessa riga renderebbe falso — in eccesso — il progressivo verso le
 *    soglie, dichiarando superamenti che non ci sono.
 */

/* ------------------------------------------------------------ denaro */

/**
 * Arrotondamento a due decimali passando per i centesimi.
 *
 * Sommare in virgola mobile senza passare dai centesimi produce i
 * 250.00000000000003 che un totale di cassa non puo mostrare.
 */
export const roundMoney = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

/** Somma di importi, arrotondata una volta sola alla fine. */
export const sumMoney = (values: Array<number | null | undefined>) =>
  roundMoney(
    values.reduce<number>(
      (total, value) =>
        total + (Number.isFinite(Number(value)) ? Number(value) : 0),
      0,
    ),
  );

/** Un importo di denaro valido: finito e a due decimali. */
export const toMoney = (value: unknown): number => {
  const parsed =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").replace(",", ".").trim());
  if (!Number.isFinite(parsed)) return 0;
  return roundMoney(parsed);
};

/* ----------------------------------------------- tipo di rapporto */

/**
 * I tre regimi che EasyGame V1 sa distinguere.
 *
 * - `SPORT_COCOCO` — collaborazione coordinata e continuativa sportiva
 *   (art. 28 D.Lgs. 36/2021). **L'unico** su cui gira il motore contributivo.
 * - `SELF_EMPLOYED_VAT` — lavoro autonomo con partita IVA. Il club registra
 *   fattura, scadenza e pagamento; **non applica** il calcolo co.co.co.
 * - `EXTERNAL_PAYROLL_REFERENCE` — lavoro subordinato liquidato da un
 *   software paghe esterno. EasyGame registra l'esistenza del rapporto e il
 *   costo; non fa cedolini, TFR, ferie, malattia, INAIL.
 *
 * Il tipo **non si deduce dal ruolo**: lo dichiara chi crea il rapporto.
 */
export type RelationshipType =
  | "SPORT_COCOCO"
  | "SELF_EMPLOYED_VAT"
  | "EXTERNAL_PAYROLL_REFERENCE";

export const RELATIONSHIP_TYPES: readonly RelationshipType[] = [
  "SPORT_COCOCO",
  "SELF_EMPLOYED_VAT",
  "EXTERNAL_PAYROLL_REFERENCE",
] as const;

export const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
  SPORT_COCOCO: "Co.co.co. sportiva",
  SELF_EMPLOYED_VAT: "Lavoro autonomo con P.IVA",
  EXTERNAL_PAYROLL_REFERENCE: "Subordinato — paghe esterne",
};

export const RELATIONSHIP_TYPE_HINTS: Record<RelationshipType, string> = {
  SPORT_COCOCO:
    "Franchigie di 5.000 e 15.000 euro, Gestione separata, ripartizione un terzo/due terzi. EasyGame calcola i contributi.",
  SELF_EMPLOYED_VAT:
    "Il calcolo lo fa chi emette la fattura. EasyGame registra documento, scadenza, pagamento e uscita.",
  EXTERNAL_PAYROLL_REFERENCE:
    "Gestito da consulente o software paghe esterno. EasyGame registra il rapporto e il costo, non liquida.",
};

/** Vero se su questo rapporto gira il motore contributivo del lavoro sportivo. */
export const usesSportWorkEngine = (type: RelationshipType) =>
  type === "SPORT_COCOCO";

/* ------------------------------------------------------ ruoli */

export type SportWorkRole =
  | "ATHLETE"
  | "COACH"
  | "INSTRUCTOR"
  | "ATHLETIC_TRAINER"
  | "TECHNICAL_DIRECTOR"
  | "SPORT_DIRECTOR"
  | "MEDICAL_STAFF"
  | "TEAM_MANAGER"
  | "ADMINISTRATIVE"
  | "OTHER";

export const SPORT_WORK_ROLES: readonly SportWorkRole[] = [
  "ATHLETE",
  "COACH",
  "INSTRUCTOR",
  "ATHLETIC_TRAINER",
  "TECHNICAL_DIRECTOR",
  "SPORT_DIRECTOR",
  "MEDICAL_STAFF",
  "TEAM_MANAGER",
  "ADMINISTRATIVE",
  "OTHER",
] as const;

export const SPORT_WORK_ROLE_LABELS: Record<SportWorkRole, string> = {
  ATHLETE: "Atleta",
  COACH: "Allenatore",
  INSTRUCTOR: "Istruttore",
  ATHLETIC_TRAINER: "Preparatore atletico",
  TECHNICAL_DIRECTOR: "Direttore tecnico",
  SPORT_DIRECTOR: "Direttore sportivo",
  MEDICAL_STAFF: "Staff sanitario",
  TEAM_MANAGER: "Team manager",
  ADMINISTRATIVE: "Amministrativo-gestionale",
  OTHER: "Altro",
};

/* ------------------------------------------ stato del rapporto */

export type RelationshipStatus =
  | "DRAFT"
  | "ACTIVE"
  | "SUSPENDED"
  | "EXPIRED"
  | "TERMINATED";

export const RELATIONSHIP_STATUSES: readonly RelationshipStatus[] = [
  "DRAFT",
  "ACTIVE",
  "SUSPENDED",
  "EXPIRED",
  "TERMINATED",
] as const;

export const RELATIONSHIP_STATUS_LABELS: Record<RelationshipStatus, string> = {
  DRAFT: "Bozza",
  ACTIVE: "Attivo",
  SUSPENDED: "Sospeso",
  EXPIRED: "Scaduto",
  TERMINATED: "Cessato",
};

/**
 * Le transizioni ammesse. Uno stato **non e un campo libero**.
 *
 * `EXPIRED` non e destinazione di nessuna transizione manuale: e lo stato in
 * cui un rapporto attivo **cade** superata la data di fine, e lo decide
 * `deriveRelationshipStatus`, non un operatore. `TERMINATED` invece e un
 * atto — qualcuno chiude il rapporto prima del termine — e resta manuale.
 */
const RELATIONSHIP_TRANSITIONS: Record<
  RelationshipStatus,
  readonly RelationshipStatus[]
> = {
  DRAFT: ["ACTIVE", "TERMINATED"],
  ACTIVE: ["SUSPENDED", "TERMINATED"],
  SUSPENDED: ["ACTIVE", "TERMINATED"],
  EXPIRED: ["ACTIVE", "TERMINATED"],
  TERMINATED: [],
};

export const canTransitionRelationship = (
  from: RelationshipStatus,
  to: RelationshipStatus,
) => RELATIONSHIP_TRANSITIONS[from]?.includes(to) ?? false;

export const listRelationshipTransitions = (from: RelationshipStatus) =>
  RELATIONSHIP_TRANSITIONS[from] ?? [];

/**
 * Vero se il rapporto, in questo stato, puo ricevere erogazioni.
 *
 * Un rapporto **scaduto** puo: il contratto e finito ma le rate maturate
 * restano dovute, e negarne il pagamento significherebbe costringere la
 * segreteria a riattivare un contratto chiuso per saldare un arretrato.
 * Un rapporto **in bozza** non puo: non esiste ancora.
 */
export const relationshipAllowsPayout = (status: RelationshipStatus) =>
  status === "ACTIVE" || status === "SUSPENDED" || status === "EXPIRED";

/** Vero se il rapporto, in questo stato, puo far **maturare** nuove scadenze. */
export const relationshipAllowsAccrual = (status: RelationshipStatus) =>
  status === "ACTIVE";

/**
 * Lo stato **derivato** di un rapporto: cosa dovrebbe essere, viste le date.
 *
 * Non riscrive `TERMINATED` (e un atto) ne `DRAFT` (non e ancora nato). Porta
 * ad `EXPIRED` un rapporto attivo o sospeso la cui data di fine e passata.
 */
export const deriveRelationshipStatus = (input: {
  status: RelationshipStatus;
  endDate?: string | Date | null;
  now?: Date;
}): RelationshipStatus => {
  const { status } = input;
  if (status === "TERMINATED" || status === "DRAFT") return status;

  const end = toDateOrNull(input.endDate);
  if (!end) return status;

  const now = input.now ?? new Date();
  return startOfDay(end).getTime() < startOfDay(now).getTime()
    ? "EXPIRED"
    : status === "EXPIRED"
      ? "ACTIVE"
      : status;
};

/* --------------------------------------------- piano compensi */

/**
 * Le tre forme di piano che coprono i casi reali (analisi 28, cap. 9.3).
 *
 * - `EQUAL_INSTALMENTS` — 12.000 stagionali in 10 rate da 1.200.
 * - `MONTHLY` — 900 euro al mese, da settembre a giugno.
 * - `CUSTOM` — rate scritte una per una, importi e date liberi.
 *
 * Il compenso fisso e il caso `EQUAL_INSTALMENTS` con una rata sola. I premi
 * **non** sono una quarta forma: sono un dominio separato (`SportBonus`).
 */
export type CompensationPlanKind = "EQUAL_INSTALMENTS" | "MONTHLY" | "CUSTOM";

export const COMPENSATION_PLAN_KINDS: readonly CompensationPlanKind[] = [
  "EQUAL_INSTALMENTS",
  "MONTHLY",
  "CUSTOM",
] as const;

export const COMPENSATION_PLAN_KIND_LABELS: Record<
  CompensationPlanKind,
  string
> = {
  EQUAL_INSTALMENTS: "Rate uguali",
  MONTHLY: "Mensilita",
  CUSTOM: "Rate personalizzate",
};

export type CompensationFrequency =
  | "SEASONAL"
  | "ANNUAL"
  | "MONTHLY"
  | "PER_PERFORMANCE";

export const COMPENSATION_FREQUENCIES: readonly CompensationFrequency[] = [
  "SEASONAL",
  "ANNUAL",
  "MONTHLY",
  "PER_PERFORMANCE",
] as const;

export const COMPENSATION_FREQUENCY_LABELS: Record<
  CompensationFrequency,
  string
> = {
  SEASONAL: "Stagionale",
  ANNUAL: "Annuale",
  MONTHLY: "Mensile",
  PER_PERFORMANCE: "A prestazione",
};

/* ------------------------------------------ stato di una scadenza */

export type InstallmentStatus =
  | "SCHEDULED"
  | "ACCRUED"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED";

export const INSTALLMENT_STATUSES: readonly InstallmentStatus[] = [
  "SCHEDULED",
  "ACCRUED",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "CANCELLED",
] as const;

export const INSTALLMENT_STATUS_LABELS: Record<InstallmentStatus, string> = {
  SCHEDULED: "Programmata",
  ACCRUED: "Maturata",
  PARTIALLY_PAID: "Parzialmente erogata",
  PAID: "Erogata",
  OVERDUE: "Scaduta",
  CANCELLED: "Annullata",
};

/**
 * Lo stato di una scadenza, **derivato** da tre grandezze e una data.
 *
 * Nessuna schermata lo imposta. La precedenza e questa:
 *
 * 1. **annullata** — una decisione esplicita, che vince su tutto;
 * 2. **erogata** — il residuo e zero: non importa se la data e passata;
 * 3. **parzialmente erogata** — c'e denaro uscito ma non tutto;
 * 4. **scaduta** — la data di scadenza e passata e non e uscito niente;
 * 5. **maturata** — il periodo di competenza e trascorso;
 * 6. **programmata** — tutto il resto.
 *
 * La differenza fra 4 e 5 e la ragione per cui gli stati sono sei e non tre:
 * «maturata» dice che il compenso e **dovuto**, «scaduta» dice che era dovuto
 * e nessuno l'ha pagato. Un previsionale che non le distingue mostra come
 * impegno anche cio che non e ancora dovuto.
 */
export const deriveInstallmentStatus = (input: {
  cancelled?: boolean;
  grossAmount: number;
  accruedAmount: number;
  paidAmount: number;
  dueDate?: string | Date | null;
  now?: Date;
}): InstallmentStatus => {
  if (input.cancelled) return "CANCELLED";

  const gross = roundMoney(Number(input.grossAmount) || 0);
  const accrued = roundMoney(Number(input.accruedAmount) || 0);
  const paid = roundMoney(Number(input.paidAmount) || 0);

  if (gross > 0 && paid >= gross) return "PAID";
  if (paid > 0) return "PARTIALLY_PAID";

  const due = toDateOrNull(input.dueDate);
  const now = startOfDay(input.now ?? new Date());

  if (due && startOfDay(due).getTime() < now.getTime()) return "OVERDUE";
  if (accrued > 0) return "ACCRUED";
  return "SCHEDULED";
};

/** Il residuo di una scadenza: quanto non e ancora uscito. Mai negativo. */
export const installmentRemaining = (grossAmount: number, paidAmount: number) =>
  roundMoney(Math.max(0, roundMoney(grossAmount) - roundMoney(paidAmount)));

/* ------------------------------------------- ledger in uscita */

/**
 * I tipi di movimento del registro **in uscita**.
 *
 * Il registro e append-only: correggere significa aggiungere un movimento
 * inverso (`COMPENSATION_REVERSAL`), mai cancellare la riga originale.
 */
export type OutboundTransactionType =
  | "COMPENSATION_PAYMENT"
  | "COMPENSATION_REVERSAL"
  | "BONUS_PAYMENT"
  | "EXPENSE_REIMBURSEMENT"
  | "CONTRIBUTION_PAYMENT"
  | "VAT_INVOICE_PAYMENT"
  | "EXTERNAL_PAYROLL_COST"
  | "OTHER";

export const OUTBOUND_TRANSACTION_TYPES: readonly OutboundTransactionType[] = [
  "COMPENSATION_PAYMENT",
  "COMPENSATION_REVERSAL",
  "BONUS_PAYMENT",
  "EXPENSE_REIMBURSEMENT",
  "CONTRIBUTION_PAYMENT",
  "VAT_INVOICE_PAYMENT",
  "EXTERNAL_PAYROLL_COST",
  "OTHER",
] as const;

export const OUTBOUND_TRANSACTION_TYPE_LABELS: Record<
  OutboundTransactionType,
  string
> = {
  COMPENSATION_PAYMENT: "Compenso erogato",
  COMPENSATION_REVERSAL: "Storno di compenso",
  BONUS_PAYMENT: "Premio erogato",
  EXPENSE_REIMBURSEMENT: "Rimborso spese",
  CONTRIBUTION_PAYMENT: "Versamento contributi",
  VAT_INVOICE_PAYMENT: "Pagamento fattura P.IVA",
  EXTERNAL_PAYROLL_COST: "Costo paghe esterne",
  OTHER: "Altra uscita",
};

/**
 * Vero se il movimento **consuma le franchigie** del lavoratore.
 *
 * Rimborsi documentati, premi ex art. 36 c. 6-quater e versamenti all'INPS
 * non concorrono: sommarli renderebbe il progressivo falso in eccesso, cioe
 * dichiarerebbe superamenti che non ci sono (analisi 28, cap. 4.1 e 5.2).
 *
 * Il pagamento di una fattura P.IVA e fuori per una ragione diversa: quel
 * compenso ha un suo regime, e il club non e chiamato ad applicargli il
 * motore co.co.co.
 */
export const affectsAnnualPosition = (type: OutboundTransactionType) =>
  type === "COMPENSATION_PAYMENT" || type === "COMPENSATION_REVERSAL";

/* ---------------------------------------------------- premi */

export type BonusFiscalTreatment =
  | "TO_VERIFY"
  | "PRIZE_ART_36"
  | "VARIABLE_REMUNERATION";

export const BONUS_FISCAL_TREATMENTS: readonly BonusFiscalTreatment[] = [
  "TO_VERIFY",
  "PRIZE_ART_36",
  "VARIABLE_REMUNERATION",
] as const;

export const BONUS_FISCAL_TREATMENT_LABELS: Record<
  BonusFiscalTreatment,
  string
> = {
  TO_VERIFY: "Da verificare con il consulente",
  PRIZE_ART_36: "Premio ex art. 36 c. 6-quater",
  VARIABLE_REMUNERATION: "Retribuzione variabile del rapporto",
};

/**
 * Vero se il premio, per come e stato **dichiarato**, concorre al progressivo
 * dei compensi.
 *
 * La distinzione la fa il contratto, non l'etichetta: una somma che si chiama
 * premio ma e parte variabile della retribuzione segue il regime del
 * rapporto. EasyGame la **chiede**, non la deduce (AdE cons. giur. 14/2025).
 */
export const bonusCountsTowardThresholds = (treatment: BonusFiscalTreatment) =>
  treatment === "VARIABLE_REMUNERATION";

/* ---------------------------------------------- rimborsi spese */

export type ExpenseCategory =
  | "TRAVEL"
  | "MEALS"
  | "ACCOMMODATION"
  | "MILEAGE"
  | "OTHER_DOCUMENTED";

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  "TRAVEL",
  "MEALS",
  "ACCOMMODATION",
  "MILEAGE",
  "OTHER_DOCUMENTED",
] as const;

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  TRAVEL: "Viaggio",
  MEALS: "Vitto",
  ACCOMMODATION: "Alloggio",
  MILEAGE: "Rimborso chilometrico",
  OTHER_DOCUMENTED: "Altra spesa documentata",
};

export type ReimbursementStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "PAID";

export const REIMBURSEMENT_STATUSES: readonly ReimbursementStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "PAID",
] as const;

export const REIMBURSEMENT_STATUS_LABELS: Record<ReimbursementStatus, string> = {
  DRAFT: "Bozza",
  SUBMITTED: "Presentato",
  APPROVED: "Approvato",
  REJECTED: "Respinto",
  PAID: "Liquidato",
};

const REIMBURSEMENT_TRANSITIONS: Record<
  ReimbursementStatus,
  readonly ReimbursementStatus[]
> = {
  DRAFT: ["SUBMITTED", "REJECTED"],
  SUBMITTED: ["APPROVED", "REJECTED"],
  APPROVED: ["PAID", "REJECTED"],
  REJECTED: ["DRAFT"],
  PAID: [],
};

export const canTransitionReimbursement = (
  from: ReimbursementStatus,
  to: ReimbursementStatus,
) => REIMBURSEMENT_TRANSITIONS[from]?.includes(to) ?? false;

export const listReimbursementTransitions = (from: ReimbursementStatus) =>
  REIMBURSEMENT_TRANSITIONS[from] ?? [];

/* -------------------------------------------- autocertificazioni */

export type DeclarationStatus = "ACTIVE" | "SUPERSEDED" | "REVOKED";

export const DECLARATION_STATUSES: readonly DeclarationStatus[] = [
  "ACTIVE",
  "SUPERSEDED",
  "REVOKED",
] as const;

export const DECLARATION_STATUS_LABELS: Record<DeclarationStatus, string> = {
  ACTIVE: "Valida",
  SUPERSEDED: "Sostituita",
  REVOKED: "Revocata",
};

/* ---------------------------------------------- adempimenti */

export type ObligationKind =
  | "CONTRIBUTION"
  | "F24"
  | "SELF_DECLARATION"
  | "CONTRACT_EXPIRY"
  | "RASD_COMMUNICATION"
  | "CU_PREPARATION"
  | "DOCUMENT_EXPIRY";

export const OBLIGATION_KINDS: readonly ObligationKind[] = [
  "CONTRIBUTION",
  "F24",
  "SELF_DECLARATION",
  "CONTRACT_EXPIRY",
  "RASD_COMMUNICATION",
  "CU_PREPARATION",
  "DOCUMENT_EXPIRY",
] as const;

export const OBLIGATION_KIND_LABELS: Record<ObligationKind, string> = {
  CONTRIBUTION: "Contributi da versare",
  F24: "F24",
  SELF_DECLARATION: "Autocertificazione compensi esterni",
  CONTRACT_EXPIRY: "Contratto in scadenza",
  RASD_COMMUNICATION: "Comunicazione al RASD",
  CU_PREPARATION: "Certificazione Unica",
  DOCUMENT_EXPIRY: "Documento in scadenza",
};

export type ObligationStatus = "DUE" | "IN_PROGRESS" | "COMPLETED" | "NOT_DUE";

export const OBLIGATION_STATUSES: readonly ObligationStatus[] = [
  "DUE",
  "IN_PROGRESS",
  "COMPLETED",
  "NOT_DUE",
] as const;

export const OBLIGATION_STATUS_LABELS: Record<ObligationStatus, string> = {
  DUE: "Dovuto",
  IN_PROGRESS: "In corso",
  COMPLETED: "Assolto",
  NOT_DUE: "Non dovuto",
};

/**
 * Stati della comunicazione al **RASD** (analisi 28, cap. 12).
 *
 * `SUBMITTED` significa «una persona l'ha trasmessa sul portale e lo ha
 * registrato qui», non «EasyGame l'ha trasmessa»: non esiste una API pubblica
 * per farlo, e dichiarare un'integrazione che non esiste sarebbe peggio di
 * non averla.
 */
export type RasdStatus =
  | "NOT_REQUIRED"
  | "TO_PREPARE"
  | "READY"
  | "SUBMITTED"
  | "CONFIRMED"
  | "ERROR";

export const RASD_STATUSES: readonly RasdStatus[] = [
  "NOT_REQUIRED",
  "TO_PREPARE",
  "READY",
  "SUBMITTED",
  "CONFIRMED",
  "ERROR",
] as const;

export const RASD_STATUS_LABELS: Record<RasdStatus, string> = {
  NOT_REQUIRED: "Non dovuta",
  TO_PREPARE: "Da preparare",
  READY: "Pronta",
  SUBMITTED: "Trasmessa",
  CONFIRMED: "Confermata",
  ERROR: "Errore",
};

/* -------------------------------------------------- documenti */

export type SportWorkDocumentCategory =
  | "CONTRACT"
  | "IDENTITY_DOCUMENT"
  | "SELF_DECLARATION"
  | "MANDATE"
  | "VAT_DOCUMENT"
  | "BANK_DETAILS"
  | "COMMUNICATION"
  | "INVOICE"
  | "PAYSLIP"
  | "EXPENSE_RECEIPT"
  | "OTHER";

export const SPORT_WORK_DOCUMENT_CATEGORIES: readonly SportWorkDocumentCategory[] =
  [
    "CONTRACT",
    "IDENTITY_DOCUMENT",
    "SELF_DECLARATION",
    "MANDATE",
    "VAT_DOCUMENT",
    "BANK_DETAILS",
    "COMMUNICATION",
    "INVOICE",
    "PAYSLIP",
    "EXPENSE_RECEIPT",
    "OTHER",
  ] as const;

export const SPORT_WORK_DOCUMENT_CATEGORY_LABELS: Record<
  SportWorkDocumentCategory,
  string
> = {
  CONTRACT: "Contratto",
  IDENTITY_DOCUMENT: "Documento d identita",
  SELF_DECLARATION: "Autocertificazione compensi esterni",
  MANDATE: "Mandato o procura",
  VAT_DOCUMENT: "Documenti P.IVA",
  BANK_DETAILS: "Coordinate bancarie",
  COMMUNICATION: "Comunicazione obbligatoria",
  INVOICE: "Fattura ricevuta",
  PAYSLIP: "Cedolino esterno",
  EXPENSE_RECEIPT: "Giustificativo di spesa",
  OTHER: "Altro documento",
};

/** I due `owner_type` che questo dominio usa su Attachment Core. */
export const SPORT_WORK_ATTACHMENT_OWNERS = {
  relationship: "sport_work_relationship",
  person: "sport_work_person",
} as const;

/* ---------------------------------------------- Person Core */

/**
 * Il legame **debole** fra una persona del modulo e l'anagrafica da cui
 * proviene.
 *
 * Debole di proposito: allenatori e staff non sono righe di tabella ma
 * elementi di colonne JSON del club, e un vincolo di integrita verso un
 * elemento di array non esiste. `origin_type` + `origin_id` dicono da dove
 * viene la persona; se l'origine sparisce, il rapporto resta leggibile —
 * che e cio che serve, perche un contratto firmato non si cancella insieme a
 * una scheda.
 */
export type PersonOriginType =
  | "athlete"
  | "trainer"
  | "staff_member"
  | "member"
  | "user"
  | "external";

export const PERSON_ORIGIN_TYPES: readonly PersonOriginType[] = [
  "athlete",
  "trainer",
  "staff_member",
  "member",
  "user",
  "external",
] as const;

export const PERSON_ORIGIN_TYPE_LABELS: Record<PersonOriginType, string> = {
  athlete: "Atleta",
  trainer: "Allenatore",
  staff_member: "Staff",
  member: "Socio",
  user: "Utente",
  external: "Persona esterna",
};

export type FiscalProfileKind = "NONE" | "VAT_ORDINARY" | "VAT_FLAT_RATE";

export const FISCAL_PROFILE_KINDS: readonly FiscalProfileKind[] = [
  "NONE",
  "VAT_ORDINARY",
  "VAT_FLAT_RATE",
] as const;

export const FISCAL_PROFILE_KIND_LABELS: Record<FiscalProfileKind, string> = {
  NONE: "Senza partita IVA",
  VAT_ORDINARY: "P.IVA in regime ordinario",
  VAT_FLAT_RATE: "P.IVA in regime forfettario",
};

/* --------------------------------------------------- date */

export const startOfDay = (value: Date) =>
  new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );

export const toDateOrNull = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** `YYYY-MM-DD` da una data, in UTC. */
export const toIsoDate = (value: Date) => value.toISOString().slice(0, 10);

/**
 * L'**anno fiscale** di un pagamento: l'anno solare della data di pagamento.
 *
 * Non l'anno della stagione, e non l'anno di competenza della prestazione: la
 * franchigia si consuma per cassa. E la regola che, sbagliata, produce due
 * franchigie applicate allo stesso anno o una sola su due anni.
 */
export const fiscalYearOfPayment = (paidAt: Date | string) => {
  const date = toDateOrNull(paidAt);
  if (!date) {
    throw new Error("Data di pagamento non valida");
  }
  return date.getUTCFullYear();
};

/** Il periodo `YYYY-MM` di una data: la chiave con cui si raggruppano F24 e Uniemens. */
export const monthKeyOf = (value: Date | string) => {
  const date = toDateOrNull(value);
  if (!date) throw new Error("Data non valida");
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

/* ------------------------------------------------- normalizzazioni */

const oneOf = <T extends string>(
  values: readonly T[],
  value: unknown,
  fallback: T,
): T => {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  return (values as readonly string[]).includes(normalized)
    ? (normalized as T)
    : fallback;
};

export const normalizeRelationshipType = (value: unknown) =>
  oneOf(RELATIONSHIP_TYPES, value, "SPORT_COCOCO");

export const normalizeRelationshipStatus = (value: unknown) =>
  oneOf(RELATIONSHIP_STATUSES, value, "DRAFT");

export const normalizeInstallmentStatus = (value: unknown) =>
  oneOf(INSTALLMENT_STATUSES, value, "SCHEDULED");

export const normalizeRole = (value: unknown) =>
  oneOf(SPORT_WORK_ROLES, value, "OTHER");

export const normalizePlanKind = (value: unknown) =>
  oneOf(COMPENSATION_PLAN_KINDS, value, "EQUAL_INSTALMENTS");

export const normalizeFrequency = (value: unknown) =>
  oneOf(COMPENSATION_FREQUENCIES, value, "SEASONAL");

export const normalizeOutboundType = (value: unknown) =>
  oneOf(OUTBOUND_TRANSACTION_TYPES, value, "COMPENSATION_PAYMENT");

export const normalizeExpenseCategory = (value: unknown) =>
  oneOf(EXPENSE_CATEGORIES, value, "OTHER_DOCUMENTED");

export const normalizeReimbursementStatus = (value: unknown) =>
  oneOf(REIMBURSEMENT_STATUSES, value, "DRAFT");

export const normalizeObligationKind = (value: unknown) =>
  oneOf(OBLIGATION_KINDS, value, "DOCUMENT_EXPIRY");

export const normalizeObligationStatus = (value: unknown) =>
  oneOf(OBLIGATION_STATUSES, value, "DUE");

export const normalizeRasdStatus = (value: unknown) =>
  oneOf(RASD_STATUSES, value, "TO_PREPARE");

export const normalizeBonusTreatment = (value: unknown) =>
  oneOf(BONUS_FISCAL_TREATMENTS, value, "TO_VERIFY");

export const normalizeSocialCoverage = (value: unknown): SocialCoverage =>
  oneOf(["NONE", "OTHER_COVERAGE", "PENSIONER"] as const, value, "NONE");

export const normalizeFiscalProfile = (value: unknown) =>
  oneOf(FISCAL_PROFILE_KINDS, value, "NONE");

export const normalizeDocumentCategory = (value: unknown) =>
  oneOf(SPORT_WORK_DOCUMENT_CATEGORIES, value, "OTHER");

export const normalizeDeclarationStatus = (value: unknown) =>
  oneOf(DECLARATION_STATUSES, value, "ACTIVE");

export const normalizePersonOrigin = (value: unknown): PersonOriginType => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return (PERSON_ORIGIN_TYPES as readonly string[]).includes(normalized)
    ? (normalized as PersonOriginType)
    : "external";
};
