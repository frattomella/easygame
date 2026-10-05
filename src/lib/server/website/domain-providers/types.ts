import type { DnsRecord, RoutingTarget, TlsState } from "@/lib/website/domains/model";

/**
 * **Il contratto di un provider di domini** (ADR-0200 §2).
 *
 * Il provider e cio che porta il traffico di `www.club.it` all'applicazione e
 * ne emette il certificato: oggi Vercel (domini del progetto) o Cloudflare
 * for SaaS (custom hostnames), domani un altro. EasyGame non dipende da
 * nessuno dei due: parla con questa interfaccia, e il provider si sceglie con
 * `EASYGAME_WEBSITE_DOMAIN_PROVIDER`. La prova di proprieta (il TXT
 * `_easygame-verify`) la fa EasyGame da se, prima di chiamare il provider.
 */

export type ProviderDomainStatus = {
  /** Il provider considera il dominio suo e instradato verso il progetto. */
  attached: boolean;
  tls: TlsState;
  /** Record aggiuntivi che il provider chiede (una convalida del certificato). */
  records: DnsRecord[];
  message?: string;
};

export type DomainProvider = {
  key: "mock" | "vercel" | "cloudflare";
  label: string;
  /** Vero se le credenziali necessarie sono presenti. */
  isConfigured(): boolean;
  /** Dove devono puntare i record di instradamento. */
  routingTarget(): RoutingTarget;
  /** Registra il dominio presso il provider. Idempotente. */
  register(hostname: string): Promise<{ providerRef: string | null; records: DnsRecord[] }>;
  /** Chiede al provider di verificare (se lo prevede) e restituisce lo stato. */
  verify(hostname: string, providerRef: string | null): Promise<ProviderDomainStatus>;
  /** Lo stato senza chiedere una verifica nuova. */
  status(hostname: string, providerRef: string | null): Promise<ProviderDomainStatus>;
  /** Toglie il dominio. Idempotente: un dominio gia assente non e un errore. */
  remove(hostname: string, providerRef: string | null): Promise<void>;
};

export class DomainProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainProviderError";
  }
}

/** Una richiesta HTTP verso un provider, con un tempo massimo e un errore leggibile. */
export const providerFetch = async (
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<{ status: number; body: any }> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 10_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 500) };
    }
    return { status: response.status, body };
  } catch (error: any) {
    throw new DomainProviderError(
      error?.name === "AbortError" ? "Il provider dei domini non ha risposto in tempo" : "Il provider dei domini non e raggiungibile",
    );
  } finally {
    clearTimeout(timer);
  }
};
