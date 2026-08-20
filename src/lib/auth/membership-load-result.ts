type MembershipEnvelope<T> = {
  data: T[] | null;
  error: null | {
    message?: string;
    status?: number;
    code?: string;
  };
};

export type MembershipLoadResult<T> =
  | { kind: "success"; memberships: T[] }
  | { kind: "error"; message: string }
  | { kind: "unauthorized" }
  | { kind: "aborted" };

/**
 * Mantiene esplicita la differenza tra una risposta valida senza membership e
 * una risposta fallita: soltanto `success` può aggiornare la UI con una lista
 * vuota.
 */
export const classifyMembershipResponse = <T>(
  response: MembershipEnvelope<T>,
): MembershipLoadResult<T> => {
  if (response.error?.code === "REQUEST_ABORTED") {
    return { kind: "aborted" };
  }

  if (response.error?.status === 401) {
    return { kind: "unauthorized" };
  }

  if (response.error) {
    return {
      kind: "error",
      message: response.error.message || "Errore caricamento club",
    };
  }

  return {
    kind: "success",
    memberships: Array.isArray(response.data) ? response.data : [],
  };
};
