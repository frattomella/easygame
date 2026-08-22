/**
 * Performance utility functions
 */

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return function debounced(...args: Parameters<T>) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

/**
 * Creates a memoized version of a function that caches the result of expensive function calls
 */
export function memoize<T extends (...args: any[]) => any>(func: T): T {
  const cache = new Map<string, ReturnType<T>>();

  return ((...args: Parameters<T>): ReturnType<T> => {
    const key = JSON.stringify(args);

    if (cache.has(key)) {
      return cache.get(key)!;
    }

    const result = func(...args);
    cache.set(key, result);
    return result;
  }) as T;
}

/**
 * Throttle function that limits the rate at which a function can fire
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number,
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false;

  return function throttled(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Esegue una scrittura per volta, accorpando quelle richieste nel frattempo.
 *
 * Un autosave puo essere invocato di nuovo mentre il salvataggio precedente e
 * ancora in volo: senza accorpamento le scritture si sovrappongono, il server
 * riceve richieste che si annullano a vicenda e l'ordine delle risposte non e
 * garantito.
 *
 * Qui la scrittura in corso non viene interrotta; l'ultimo stato richiesto
 * durante l'attesa viene salvato una sola volta al termine, scartando quelli
 * intermedi. `isEqual` permette di saltare del tutto una scrittura che non
 * cambierebbe nulla.
 */
export function createCoalescingSaver<T>(
  save: (value: T) => Promise<void>,
  options: { isEqual?: (candidate: T) => boolean } = {},
) {
  let inFlight = false;
  let pending: { value: T } | null = null;

  const shouldSkip = (value: T) =>
    typeof options.isEqual === "function" && options.isEqual(value);

  return async function run(value: T): Promise<void> {
    if (inFlight) {
      // Solo l'ultimo stato sopravvive: i precedenti sarebbero comunque
      // sovrascritti.
      pending = { value };
      return;
    }

    inFlight = true;
    try {
      if (!shouldSkip(value)) {
        await save(value);
      }

      while (pending) {
        const next = pending.value;
        pending = null;

        if (shouldSkip(next)) {
          continue;
        }

        await save(next);
      }
    } finally {
      inFlight = false;
      pending = null;
    }
  };
}
