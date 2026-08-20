import { apiRequest, type ApiEnvelope } from "@/lib/api/client";
import { createScopedRequestDeduper } from "@/lib/auth/request-deduper";

export const MEMBERSHIPS_ENDPOINT = "/api/v1/auth/memberships";

const membershipRequests = createScopedRequestDeduper<ApiEnvelope<any[]>>();

/**
 * AuthProvider e AccountHomeScreen richiedono le membership nello stesso
 * istante quando si apre /account. Condividiamo la richiesta in volo così il
 * server viene interrogato una sola volta, mantenendo comunque la sessione come
 * unica fonte autorevole (nessun dato viene memorizzato tra un load e l'altro).
 */
export const fetchMemberships = <T = any>(
  sessionScope: string,
): Promise<ApiEnvelope<T[]>> =>
  membershipRequests.run(sessionScope, (signal) =>
    apiRequest<T[]>(MEMBERSHIPS_ENDPOINT, { signal }),
  ) as Promise<ApiEnvelope<T[]>>;

/** Annulla richieste appartenenti alla sessione precedente. */
export const resetMembershipRequests = (sessionScope?: string) => {
  membershipRequests.reset(sessionScope);
};
