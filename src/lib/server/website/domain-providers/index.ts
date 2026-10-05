import { mockDomainProvider } from "./mock";
import { vercelDomainProvider } from "./vercel";
import { cloudflareDomainProvider } from "./cloudflare";
import type { DomainProvider } from "./types";

/**
 * **Quale provider di domini usa questa installazione.**
 *
 * `EASYGAME_WEBSITE_DOMAIN_PROVIDER` = `mock` | `vercel` | `cloudflare`.
 * Senza la variabile vale `mock` in sviluppo e **nessuno** in produzione:
 * meglio un «collegamento dei domini non configurato» detto chiaramente che un
 * simulatore che risponde «tutto a posto» a un club vero.
 */

const PROVIDERS: Record<DomainProvider["key"], DomainProvider> = {
  mock: mockDomainProvider,
  vercel: vercelDomainProvider,
  cloudflare: cloudflareDomainProvider,
};

let override: DomainProvider | null = null;

/** Solo per i test. */
export const __setDomainProviderForTests = (provider: DomainProvider | null) => {
  override = provider;
};

export const resolveDomainProvider = (): DomainProvider | null => {
  if (override) return override;
  const requested = String(process.env.EASYGAME_WEBSITE_DOMAIN_PROVIDER || "").trim().toLowerCase();
  if (requested && requested in PROVIDERS) return PROVIDERS[requested as DomainProvider["key"]];
  return process.env.NODE_ENV === "production" ? null : mockDomainProvider;
};

export const describeDomainProvider = () => {
  const provider = resolveDomainProvider();
  return provider
    ? { key: provider.key, label: provider.label, configured: provider.isConfigured(), routing: provider.routingTarget() }
    : { key: null, label: "Non configurato", configured: false, routing: null };
};

export type { DomainProvider } from "./types";
export { DomainProviderError } from "./types";
