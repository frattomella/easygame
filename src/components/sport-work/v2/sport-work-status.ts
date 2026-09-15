import {
  ACTIVITY_STATUS,
  MONEY_STATUS,
  PERSON_STATUS,
  STATUS_UNKNOWN,
  type StatusSpec,
} from "@/lib/web/status";
import type {
  DeclarationStatus,
  InstallmentStatus,
  ObligationStatus,
  RasdStatus,
  ReimbursementStatus,
  RelationshipStatus,
} from "@/lib/sport-work/model";

/**
 * Gli stati del lavoro sportivo nella forma del sistema (`{label, weight,
 * hue}`, guideline 09 §9.4).
 *
 * Dove `src/lib/web/status.ts` ha gia la parola — ATTIVO, SOSPESO, BOZZA,
 * PAGATO, PARZIALE, SCADUTO, ANNULLATO, IN ATTESA, IN CORSO — si usa quella:
 * un compenso pagato e un incasso non si pronunciano uguali (per questo
 * `paid_out` e non `paid`), ma una scadenza scaduta si pronuncia come una rata
 * scaduta. Le parole che il sistema non ha — MATURATA, PROGRAMMATA, CESSATO,
 * DOVUTO, ASSOLTO, PRESENTATO, APPROVATO, LIQUIDATO, SOSTITUITA… — sono qui
 * come **spec locale** con la stessa forma, e sono le candidate da promuovere
 * in `status.ts` (dichiarate nel rapporto di Wave E).
 *
 * Le etichette restano quelle del dominio (`src/lib/sport-work/model.ts`):
 * qui cambia solo la resa, non la parola.
 */
const spec = (label: string, weight: StatusSpec["weight"], hue: StatusSpec["hue"]): StatusSpec =>
  Object.freeze({ label, weight, hue });

/* ── Rapporto ───────────────────────────────────────────────────────────── */
export const RELATIONSHIP_STATUS_SPEC: Record<RelationshipStatus, StatusSpec> = Object.freeze({
  DRAFT: PERSON_STATUS.draft,
  ACTIVE: PERSON_STATUS.active,
  SUSPENDED: PERSON_STATUS.suspended,
  /** Il contratto e finito: non blocca il lavoro (le rate maturate restano dovute), quindi contorno e non urgente. */
  EXPIRED: spec("SCADUTO", "outline", "orange"),
  TERMINATED: spec("CESSATO", "quiet", "neutral"),
});

/* ── Scadenza di compenso (derivata) ────────────────────────────────────── */
export const INSTALLMENT_STATUS_SPEC: Record<InstallmentStatus, StatusSpec> = Object.freeze({
  SCHEDULED: spec("PROGRAMMATA", "quiet", "neutral"),
  ACCRUED: spec("MATURATA", "solid", "blue"),
  PARTIALLY_PAID: MONEY_STATUS.partial,
  PAID: MONEY_STATUS.paid_out,
  OVERDUE: MONEY_STATUS.overdue,
  CANCELLED: MONEY_STATUS.cancelled,
});

/* ── Adempimento ────────────────────────────────────────────────────────── */
export const OBLIGATION_STATUS_SPEC: Record<ObligationStatus, StatusSpec> = Object.freeze({
  DUE: spec("DOVUTO", "solid", "amber"),
  IN_PROGRESS: ACTIVITY_STATUS.in_progress,
  COMPLETED: spec("ASSOLTO", "solid", "green"),
  NOT_DUE: spec("NON DOVUTO", "quiet", "neutral"),
});

/* ── Premio (SCHEDULED | PAID) ──────────────────────────────────────────── */
export const BONUS_STATUS_SPEC = Object.freeze({
  SCHEDULED: spec("DA EROGARE", "outline", "amber"),
  PAID: MONEY_STATUS.paid_out,
});

/* ── Rimborso spese ─────────────────────────────────────────────────────── */
export const REIMBURSEMENT_STATUS_SPEC: Record<ReimbursementStatus, StatusSpec> = Object.freeze({
  DRAFT: PERSON_STATUS.draft,
  SUBMITTED: spec("PRESENTATO", "solid", "blue"),
  APPROVED: spec("APPROVATO", "outline", "green"),
  REJECTED: spec("RESPINTO", "urgent", "red"),
  PAID: spec("LIQUIDATO", "solid", "green"),
});

/* ── Fattura del professionista (PENDING | PAID) ────────────────────────── */
export const VAT_INVOICE_STATUS_SPEC = Object.freeze({
  PENDING: MONEY_STATUS.pending,
  PAID: MONEY_STATUS.paid_out,
});

/* ── Autocertificazione ─────────────────────────────────────────────────── */
export const DECLARATION_STATUS_SPEC: Record<DeclarationStatus, StatusSpec> = Object.freeze({
  ACTIVE: spec("VALIDA", "solid", "green"),
  SUPERSEDED: spec("SOSTITUITA", "quiet", "neutral"),
  REVOKED: spec("REVOCATA", "quiet", "neutral"),
});

/* ── Comunicazione al RASD ──────────────────────────────────────────────── */
export const RASD_STATUS_SPEC: Record<RasdStatus, StatusSpec> = Object.freeze({
  NOT_REQUIRED: spec("NON DOVUTA", "quiet", "neutral"),
  TO_PREPARE: spec("DA PREPARARE", "outline", "amber"),
  READY: spec("PRONTA", "solid", "blue"),
  SUBMITTED: spec("TRASMESSA", "solid", "blue"),
  CONFIRMED: spec("CONFERMATA", "solid", "green"),
  ERROR: spec("ERRORE", "urgent", "red"),
});

/* ── Registro in uscita ─────────────────────────────────────────────────── */
export const PAYOUT_REVERSED_SPEC = MONEY_STATUS.reversed;
export const PAYOUT_RECORDED_SPEC = MONEY_STATUS.paid_out;
export const FISCAL_TO_VERIFY_SPEC = spec("FISCALE DA VERIFICARE", "outline", "amber");

/** Uno stato dell'API in una spec; cio che non si riconosce rende «NON REGISTRATO». */
export const specOf = <K extends string>(map: Readonly<Record<K, StatusSpec>>, value: unknown): StatusSpec =>
  (map as Record<string, StatusSpec>)[String(value || "").toUpperCase()] || STATUS_UNKNOWN;
