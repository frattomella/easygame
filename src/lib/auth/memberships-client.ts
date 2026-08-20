import { apiRequest, type ApiEnvelope } from "@/lib/api/client";

export const MEMBERSHIPS_ENDPOINT = "/api/v1/auth/memberships";

let inFlightRequest: Promise<ApiEnvelope<any[]>> | null = null;

/**
 * AuthProvider e AccountHomeScreen richiedono le membership nello stesso
 * istante quando si apre /account. Condividiamo la richiesta in volo così il
 * server viene interrogato una sola volta, mantenendo comunque la sessione come
 * unica fonte autorevole (nessun dato viene memorizzato tra un load e l'altro).
 */
export const fetchMemberships = <T = any>(): Promise<ApiEnvelope<T[]>> => {
  if (inFlightRequest) {
    return inFlightRequest as Promise<ApiEnvelope<T[]>>;
  }

  const request = apiRequest<T[]>(MEMBERSHIPS_ENDPOINT) as Promise<
    ApiEnvelope<any[]>
  >;
  inFlightRequest = request;

  void request.finally(() => {
    if (inFlightRequest === request) {
      inFlightRequest = null;
    }
  });

  return request as Promise<ApiEnvelope<T[]>>;
};
