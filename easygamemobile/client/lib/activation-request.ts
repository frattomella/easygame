/**
 * Il corpo di `POST /api/v1/auth/memberships/activate` da un accesso scelto
 * nell'Account Hub. Pura per essere provabile senza rete: la richiesta resta
 * comunque solo una **proposta**, il server la rifiuta se quella tessera non
 * esiste davvero per l'utente (vedi `activate/route.ts`, che non si fida di
 * `role`/`membership_id` piu di quanto già non faccia con gli header di
 * contesto).
 */

export type AccessSource = "owned" | "assigned" | null | undefined;

export interface ActivationRequest {
  role?: string;
  membershipId?: string;
  accessKind: "membership" | "ownership";
}

/**
 * Un club di proprieta si attiva per identita del club: il ruolo "owner" lo
 * ricava il server da `creator_id`, non da una tessera `organization_users`
 * (che puo anche mancare). Un accesso assegnato porta invece il ruolo e,
 * quando disponibile, l'id preciso della tessera — necessario se la stessa
 * persona ha piu ruoli sullo stesso club (ADR-0102 lato Web).
 */
export const buildActivationRequest = (
  role: string,
  accessId: string | null | undefined,
  source: AccessSource,
): ActivationRequest => ({
  role: source === "owned" ? undefined : role || undefined,
  membershipId: accessId || undefined,
  accessKind: source === "owned" ? "ownership" : "membership",
});
