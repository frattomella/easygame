import type { DomainProvider } from "./types";

/**
 * **Il provider simulato**, per sviluppo e test.
 *
 * Non chiama nessuno. Un dominio locale (`*.localhost`, `*.test`) diventa
 * attivo con HTTPS appena verificato, cosi il flusso completo — aggiungi,
 * verifica, pubblica, visita — si prova in locale aprendo
 * `http://fortitudo.localhost:3001`. Un dominio vero resta «certificato in
 * emissione» dopo la prova di proprieta: il simulatore non finge di aver
 * emesso un certificato che nessuno ha emesso.
 *
 * In produzione non si usa: `resolveDomainProvider` lo rifiuta se
 * `NODE_ENV=production` e non e stato chiesto esplicitamente.
 */

const isLocal = (hostname: string) => /\.(localhost|test)$/.test(hostname);

export const mockDomainProvider: DomainProvider = {
  key: "mock",
  label: "Simulato (sviluppo)",
  isConfigured: () => true,
  routingTarget: () => ({
    cname: process.env.EASYGAME_WEBSITE_CNAME_TARGET || "sites.easygame.local",
    ipv4: (process.env.EASYGAME_WEBSITE_A_RECORDS || "127.0.0.1").split(",").map((ip) => ip.trim()).filter(Boolean),
  }),
  async register(hostname) {
    return { providerRef: `mock:${hostname}`, records: [] };
  },
  async verify(hostname) {
    return isLocal(hostname)
      ? { attached: true, tls: "active", records: [] }
      : { attached: true, tls: "pending", records: [], message: "Simulatore: certificato non emesso per un dominio reale" };
  },
  async status(hostname) {
    return this.verify(hostname, null);
  },
  async remove() {
    /* Niente da togliere. */
  },
};
