import type { DnsRecord, TlsState } from "@/lib/website/domains/model";
import { DomainProviderError, providerFetch, type DomainProvider, type ProviderDomainStatus } from "./types";

/**
 * **Cloudflare for SaaS: custom hostnames** (API v4).
 *
 * E la strada del Website Builder GPW in Cedi Platform: il dominio del club
 * diventa un «custom hostname» della zona EasyGame, Cloudflare emette il
 * certificato con una convalida DCV via TXT, e il traffico arriva
 * all'origine dichiarata come fallback della zona. Qui la convalida del
 * certificato e i record di proprieta di Cloudflare tornano come record del
 * provider, da mostrare al club accanto ai nostri.
 *
 * Variabili: `CLOUDFLARE_API_TOKEN` (permesso «SSL and Certificates: Edit»
 * sulla zona), `CLOUDFLARE_ZONE_ID`, `EASYGAME_WEBSITE_CNAME_TARGET` (il
 * fallback origin, es. `sites.easygame.it`), `EASYGAME_WEBSITE_A_RECORDS`
 * (per gli apex, se il registrar non offre CNAME flattening).
 */

const API = "https://api.cloudflare.com/client/v4";

const config = () => ({
  token: process.env.CLOUDFLARE_API_TOKEN || "",
  zoneId: process.env.CLOUDFLARE_ZONE_ID || "",
});

const headers = () => ({ Authorization: `Bearer ${config().token}`, "Content-Type": "application/json" });

const fail = (status: number, body: any): never => {
  const message = Array.isArray(body?.errors) && body.errors[0]?.message ? body.errors[0].message : `Cloudflare ha risposto ${status}`;
  throw new DomainProviderError(`Provider domini: ${message}`);
};

const TLS_BY_STATUS: Record<string, TlsState> = {
  active: "active",
  pending_validation: "pending",
  pending_issuance: "pending",
  pending_deployment: "pending",
  initializing: "pending",
  validation_timed_out: "failed",
  issuance_timed_out: "failed",
  deployment_timed_out: "failed",
  deleted: "failed",
};

const recordsOf = (result: any): DnsRecord[] => {
  const out: DnsRecord[] = [];
  const ownership = result?.ownership_verification;
  if (ownership?.type === "txt" && ownership?.name && ownership?.value) {
    out.push({ type: "TXT", name: ownership.name, fqdn: ownership.name, value: ownership.value, purpose: "ownership", note: "Verifica di proprieta richiesta da Cloudflare." });
  }
  for (const record of Array.isArray(result?.ssl?.validation_records) ? result.ssl.validation_records : []) {
    if (record?.txt_name && record?.txt_value) {
      out.push({ type: "TXT", name: record.txt_name, fqdn: record.txt_name, value: record.txt_value, purpose: "ownership", note: "Convalida del certificato HTTPS." });
    }
  }
  return out;
};

const toStatus = (result: any): ProviderDomainStatus => ({
  attached: result?.status === "active",
  tls: TLS_BY_STATUS[String(result?.ssl?.status || "")] || "pending",
  records: recordsOf(result),
  message: Array.isArray(result?.verification_errors) && result.verification_errors[0] ? String(result.verification_errors[0]) : undefined,
});

const findByHostname = async (hostname: string) => {
  const { zoneId } = config();
  const response = await providerFetch(`${API}/zones/${encodeURIComponent(zoneId)}/custom_hostnames?hostname=${encodeURIComponent(hostname)}`, {
    headers: headers(),
  });
  if (response.status >= 400) fail(response.status, response.body);
  return Array.isArray(response.body?.result) ? response.body.result[0] || null : null;
};

export const cloudflareDomainProvider: DomainProvider = {
  key: "cloudflare",
  label: "Cloudflare for SaaS",
  isConfigured: () => Boolean(config().token && config().zoneId && process.env.EASYGAME_WEBSITE_CNAME_TARGET),
  routingTarget: () => ({
    cname: process.env.EASYGAME_WEBSITE_CNAME_TARGET || "",
    ipv4: (process.env.EASYGAME_WEBSITE_A_RECORDS || "").split(",").map((ip) => ip.trim()).filter(Boolean),
  }),
  async register(hostname) {
    const existing = await findByHostname(hostname);
    if (existing) return { providerRef: existing.id, records: recordsOf(existing) };
    const { zoneId } = config();
    const response = await providerFetch(`${API}/zones/${encodeURIComponent(zoneId)}/custom_hostnames`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ hostname, ssl: { method: "txt", type: "dv", settings: { min_tls_version: "1.2" } } }),
    });
    if (response.status >= 400) fail(response.status, response.body);
    return { providerRef: response.body?.result?.id || null, records: recordsOf(response.body?.result) };
  },
  async verify(hostname, providerRef) {
    const { zoneId } = config();
    if (providerRef) {
      /* Una PATCH vuota chiede a Cloudflare di ritentare la convalida. */
      await providerFetch(`${API}/zones/${encodeURIComponent(zoneId)}/custom_hostnames/${encodeURIComponent(providerRef)}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ ssl: { method: "txt", type: "dv" } }),
      });
    }
    return this.status(hostname, providerRef);
  },
  async status(hostname, providerRef) {
    const { zoneId } = config();
    if (providerRef) {
      const response = await providerFetch(`${API}/zones/${encodeURIComponent(zoneId)}/custom_hostnames/${encodeURIComponent(providerRef)}`, {
        headers: headers(),
      });
      if (response.status === 404) return { attached: false, tls: "not_started", records: [] };
      if (response.status >= 400) fail(response.status, response.body);
      return toStatus(response.body?.result);
    }
    const found = await findByHostname(hostname);
    return found ? toStatus(found) : { attached: false, tls: "not_started", records: [] };
  },
  async remove(hostname, providerRef) {
    const { zoneId } = config();
    const id = providerRef || (await findByHostname(hostname))?.id;
    if (!id) return;
    const response = await providerFetch(`${API}/zones/${encodeURIComponent(zoneId)}/custom_hostnames/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: headers(),
    });
    if (response.status >= 400 && response.status !== 404) fail(response.status, response.body);
  },
};
