import { apiRequest } from "./client";
import type { ComuneMatch } from "@/lib/comuni-model";

/**
 * Accesso client all'archivio dei comuni.
 *
 * Passa da `apiRequest` come tutto il resto: nessun `fetch` diretto a `/api`
 * dai componenti (regola di ownership in CLAUDE.md).
 *
 * La cache non e un'ottimizzazione opportunistica: la tendina interroga a ogni
 * tasto e l'archivio e **immutabile per la vita del processo** — la stessa
 * query dara sempre la stessa risposta. Senza cache, tornare indietro di un
 * carattere rifarebbe una richiesta di rete per un risultato gia in mano.
 */

type ComuniPayload = { comuni: ComuneMatch[] };

const cache = new Map<string, ComuneMatch[]>();

/** Oltre questa soglia la cache si svuota: e un aiuto, non un archivio. */
const MAX_CACHED_QUERIES = 200;

const remember = (key: string, comuni: ComuneMatch[]) => {
  if (cache.size >= MAX_CACHED_QUERIES) cache.clear();
  cache.set(key, comuni);
  return comuni;
};

const request = async (
  key: string,
  query: string,
  signal?: AbortSignal,
): Promise<ComuneMatch[]> => {
  const cached = cache.get(key);
  if (cached) return cached;

  const { data, error } = await apiRequest<ComuniPayload>(
    `/api/v1/comuni?${query}`,
    { signal },
  );

  // Una richiesta annullata non e un risultato vuoto: non va messa in cache,
  // altrimenti la tendina resterebbe vuota per sempre su quella query.
  if (error) return [];

  return remember(key, data?.comuni || []);
};

export const searchComuni = (
  query: string,
  options: { limit?: number; province?: string | null; signal?: AbortSignal } = {},
) => {
  const trimmed = String(query || "").trim();
  if (trimmed.length < 2) return Promise.resolve<ComuneMatch[]>([]);

  const params = new URLSearchParams({ q: trimmed });
  if (options.limit) params.set("limit", String(options.limit));
  if (options.province) params.set("province", String(options.province));

  const serialized = params.toString();
  return request(`q:${serialized}`, serialized, options.signal);
};

/** Il comune di un codice catastale, oppure `null` se l'archivio non lo ha. */
export const lookupComuneByBelfiore = async (
  belfiore: string,
  signal?: AbortSignal,
): Promise<ComuneMatch | null> => {
  const code = String(belfiore || "").trim().toUpperCase();
  if (!/^[A-Z]\d{3}$/.test(code)) return null;

  const params = new URLSearchParams({ belfiore: code }).toString();
  const comuni = await request(`b:${params}`, params, signal);
  return comuni[0] || null;
};

/** Tutti gli omonimi di un nome: serve per capire se un nome e ambiguo. */
export const lookupComuniByName = (
  name: string,
  signal?: AbortSignal,
): Promise<ComuneMatch[]> => {
  const trimmed = String(name || "").trim();
  if (!trimmed) return Promise.resolve([]);

  const params = new URLSearchParams({ name: trimmed }).toString();
  return request(`n:${params}`, params, signal);
};
