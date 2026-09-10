import type { UseQueryResult } from "@tanstack/react-query";

import { classifyFetchError, fetchErrorMessage } from "@/lib/fetch-error";

export type ParentSectionStatus =
  | "loading"
  | "ready"
  | "empty"
  | "forbidden"
  | "network"
  | "error";

/**
 * Lo stesso vocabolario a sei stati di `useAsyncSection` (loading /
 * pronto / vuoto-reale / accesso-negato / rete / errore), ma sopra un
 * `useQuery` di TanStack invece di un fetch locale — le schermate Parent lo
 * usano perche **piu di una tab consuma lo stesso figlio** (Home e
 * Calendario leggono entrambe `GET /api/parent-dashboard/[athleteId]`): con
 * `useAsyncSection` ciascuna schermata rifarebbe la propria fetch ogni
 * volta che monta, anche per lo stesso figlio gia caricato — esattamente il
 * fetch duplicato che l'istruzione del WP vieta. `queryKey` include sempre
 * `athleteId`: cambiare figlio e una chiave diversa, mai un aggiornamento in
 *-place che lascerebbe per un istante i dati del figlio precedente. Il
 * dominio Trainer non ha questo problema (una sola schermata per risorsa) e
 * resta su `useAsyncSection` — non e stato migrato senza motivo.
 */
export function useParentSectionStatus<T>(
  result: Pick<UseQueryResult<T>, "isPending" | "isError" | "error" | "data">,
  isEmpty: (data: T) => boolean = () => false,
): { status: ParentSectionStatus; errorMessage: string } {
  if (result.isPending) {
    return { status: "loading", errorMessage: "" };
  }

  if (result.isError) {
    const kind = classifyFetchError(result.error);
    return {
      status: kind,
      errorMessage: fetchErrorMessage(
        result.error,
        kind === "forbidden"
          ? "Accesso non consentito."
          : "Errore di connessione.",
      ),
    };
  }

  return {
    status: isEmpty(result.data as T) ? "empty" : "ready",
    errorMessage: "",
  };
}
