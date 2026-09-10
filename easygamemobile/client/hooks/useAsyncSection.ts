import { useCallback, useEffect, useState } from "react";

import { classifyFetchError, fetchErrorMessage } from "@/lib/fetch-error";

export type AsyncSectionStatus =
  | "loading"
  | "ready"
  | "empty"
  | "forbidden"
  | "network"
  | "error";

interface AsyncSectionState<T> {
  status: AsyncSectionStatus;
  data: T | null;
  errorMessage: string;
  reload: () => void;
}

/**
 * Il pattern di caricamento condiviso dalle sezioni nuove: loading, pronto,
 * vuoto-reale, accesso-negato, rete, errore — sei stati distinti, mai un
 * 403 piegato in un elenco vuoto (vedi `client/lib/fetch-error.ts`).
 *
 * `isEmpty` decide "vuoto" da "pronto": per un elenco e `data.length === 0`,
 * per un oggetto singolo (compensi) e `data === null`. Il chiamante lo
 * dichiara perche non c'e una regola sola per entrambe le forme.
 */
export function useAsyncSection<T>(
  fetcher: () => Promise<T>,
  isEmpty: (data: T) => boolean,
  deps: unknown[] = [],
): AsyncSectionState<T> {
  const [status, setStatus] = useState<AsyncSectionStatus>("loading");
  const [data, setData] = useState<T | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const load = useCallback(() => {
    let cancelled = false;
    setStatus("loading");
    setErrorMessage("");

    fetcher()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setStatus(isEmpty(result) ? "empty" : "ready");
      })
      .catch((error) => {
        if (cancelled) return;
        const kind = classifyFetchError(error);
        setErrorMessage(
          fetchErrorMessage(
            error,
            kind === "forbidden"
              ? "Accesso non consentito."
              : "Errore di connessione.",
          ),
        );
        setStatus(kind);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken, ...deps]);

  useEffect(() => load(), [load]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { status, data, errorMessage, reload };
}
