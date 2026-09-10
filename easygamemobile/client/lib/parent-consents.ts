import type { ConsentSubjectState } from "@/services/api";

/**
 * Consensi Parent — dominio puro. Specchio della matrice pura del Web
 * (`DECISION_TRANSITIONS`, `src/lib/consents/model.ts`,
 * `canApplyConsentDecision`): non esiste un flag "bloccato" nella risposta,
 * e' la transizione stessa a essere ammessa o no. Qui si usa solo per
 * abilitare/disabilitare i pulsanti — il server resta l'unico a farla
 * valere davvero (una transizione non ammessa risponde 400).
 */

export type ConsentDecision = "accepted" | "rejected" | "revoked";

const TRANSITIONS: Record<ConsentSubjectState["status"], ConsentDecision[]> = {
  missing: ["accepted", "rejected"],
  accepted: ["accepted", "revoked"],
  rejected: ["accepted", "rejected"],
  revoked: ["accepted"],
};

export function canApplyConsentDecision(
  current: ConsentSubjectState["status"],
  next: ConsentDecision,
): boolean {
  return TRANSITIONS[current].includes(next);
}

export interface ConsentRowActions {
  canAccept: boolean;
  canRevoke: boolean;
}

/** Quali azioni la riga puo offrire per lo stato corrente — "Accetto" quando la transizione e' ammessa, "Revoca" solo da `accepted`. */
export function resolveConsentActions(
  status: ConsentSubjectState["status"],
): ConsentRowActions {
  return {
    canAccept: canApplyConsentDecision(status, "accepted"),
    canRevoke: canApplyConsentDecision(status, "revoked"),
  };
}
