import type { StatusSpec } from "@/lib/web/status";

/**
 * Il registro delle operazioni come lo manda `GET /api/v1/audit` (Web V2).
 * Modulo puro: la forma della riga, gli esiti e la loro parola.
 */
export type AuditEvent = {
  id: string;
  created_at: string;
  action: string;
  outcome: string;
  actor_email: string | null;
  actor_role: string | null;
  resource: string | null;
  resource_id: string | null;
  ip: string | null;
  metadata: Record<string, unknown>;
};

export type AuditOutcome = "success" | "failure" | "denied";

/**
 * Riuscita · Fallita · Negata — le tre parole della V1, con il peso del
 * sistema: una negazione **blocca** (urgente), un fallimento chiede
 * attenzione (contorno ambra), una riuscita e lo stato di fatto. Da
 * promuovere in `status.ts`.
 */
export const AUDIT_OUTCOME_STATUS: Readonly<Record<AuditOutcome, StatusSpec>> = Object.freeze({
  success: Object.freeze({ label: "RIUSCITA", weight: "solid", hue: "green" }),
  failure: Object.freeze({ label: "FALLITA", weight: "outline", hue: "amber" }),
  denied: Object.freeze({ label: "NEGATA", weight: "urgent", hue: "red" }),
});

export const AUDIT_OUTCOME_LABELS: Readonly<Record<AuditOutcome, string>> = Object.freeze({
  success: "Riuscite",
  failure: "Fallite",
  denied: "Negate",
});

const spec = (label: string): StatusSpec => Object.freeze({ label: label.toUpperCase(), weight: "quiet", hue: "neutral" });

export const auditOutcomeSpec = (outcome: string | null | undefined): StatusSpec => {
  const key = String(outcome || "").trim().toLowerCase() as AuditOutcome;
  return AUDIT_OUTCOME_STATUS[key] || spec(String(outcome || "non registrato"));
};

/** «denied» → «Negata», per gli export e le tendine. */
export const auditOutcomeLabel = (outcome: string | null | undefined): string => auditOutcomeSpec(outcome).label;

/** Le coppie chiave/valore dei metadati, gia in forma di testo. */
export const metadataEntries = (metadata: Record<string, unknown> | null | undefined): Array<{ key: string; value: string }> =>
  Object.entries(metadata || {}).map(([key, value]) => ({
    key,
    value: value !== null && typeof value === "object" ? JSON.stringify(value) : String(value),
  }));

/** `payment.reminder.sent` → `payment` — l'area di un'azione. */
export const auditAreaOf = (action: string | null | undefined): string => String(action || "").split(".")[0] || "";
