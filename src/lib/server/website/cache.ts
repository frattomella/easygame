import { revalidateTag } from "next/cache";

/**
 * **I tag di cache del sito pubblico** (ADR-0200 §6).
 *
 * EasyGame usa Next.js 14.2: la cache dei dati e `unstable_cache` con i tag,
 * l'invalidazione e `revalidateTag`. Due famiglie, e nient'altro:
 *
 * - `website:site:<id>` — lo snapshot pubblicato e la risoluzione degli host.
 *   Si invalida quando si pubblica, si ripristina, si ritira il sito o cambia
 *   un dominio: e una scrittura rara e precisa;
 * - `website:data:<organizationId>` — i dati vivi (gare, rose, sponsor,
 *   articoli, persone). Hanno anche una durata breve (`WEBSITE_DATA_TTL`),
 *   cosi un risultato inserito dal gestionale arriva al sito entro un minuto
 *   anche se nessuno invalida niente; le scritture del modulo invalidano
 *   subito.
 *
 * `revalidateTag` fuori da una richiesta di Next (un test, uno script) lancia:
 * qui si inghiotte, perche invalidare una cache che non esiste non e un errore.
 */

export const WEBSITE_SITE_TTL = 600;
export const WEBSITE_DATA_TTL = 60;

export const websiteSiteTag = (siteId: string) => `website:site:${siteId}`;
export const websiteHostTag = (hostname: string) => `website:host:${hostname}`;
export const websiteDataTag = (organizationId: string) => `website:data:${organizationId}`;

const safeRevalidate = (tag: string) => {
  try {
    revalidateTag(tag);
  } catch {
    /* Fuori da una richiesta Next non c'e una cache da invalidare. */
  }
};

export const invalidateWebsiteSite = (siteId: string, hostnames: readonly string[] = []) => {
  safeRevalidate(websiteSiteTag(siteId));
  for (const hostname of hostnames) safeRevalidate(websiteHostTag(hostname));
};

export const invalidateWebsiteData = (organizationId: string | null | undefined) => {
  if (organizationId) safeRevalidate(websiteDataTag(organizationId));
};
