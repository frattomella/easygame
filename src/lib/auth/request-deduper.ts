export type AbortableRequestFactory<T> = (signal: AbortSignal) => Promise<T>;

type InFlightRequest<T> = {
  controller: AbortController;
  promise: Promise<T>;
};

/**
 * Deduplica soltanto le richieste contemporanee appartenenti allo stesso scope.
 * Il reset annulla le richieste della sessione precedente, evitando che una
 * risposta tardiva venga applicata dopo logout o cambio account.
 */
export const createScopedRequestDeduper = <T>() => {
  const inFlightRequests = new Map<string, InFlightRequest<T>>();

  const run = (scope: string, factory: AbortableRequestFactory<T>) => {
    const normalizedScope = String(scope || "").trim() || "anonymous";
    const existingRequest = inFlightRequests.get(normalizedScope);
    if (existingRequest) {
      return existingRequest.promise;
    }

    const controller = new AbortController();
    const promise = Promise.resolve().then(() => factory(controller.signal));
    const request = { controller, promise };
    inFlightRequests.set(normalizedScope, request);

    void promise.then(
      () => {
        if (inFlightRequests.get(normalizedScope) === request) {
          inFlightRequests.delete(normalizedScope);
        }
      },
      () => {
        if (inFlightRequests.get(normalizedScope) === request) {
          inFlightRequests.delete(normalizedScope);
        }
      },
    );

    return promise;
  };

  const reset = (scope?: string) => {
    if (scope) {
      const normalizedScope = String(scope).trim() || "anonymous";
      const request = inFlightRequests.get(normalizedScope);
      request?.controller.abort();
      inFlightRequests.delete(normalizedScope);
      return;
    }

    inFlightRequests.forEach(({ controller }) => controller.abort());
    inFlightRequests.clear();
  };

  return {
    run,
    reset,
    size: () => inFlightRequests.size,
  };
};
