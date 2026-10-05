import type { DnsRecord, TlsState } from "@/lib/website/domains/model";
import { DomainProviderError, providerFetch, type DomainProvider, type ProviderDomainStatus } from "./types";

/**
 * **Vercel: i domini del progetto** (API v9/v10).
 *
 * Il dominio si aggiunge al progetto che serve EasyGame; Vercel emette il
 * certificato quando il DNS punta al progetto. Se il dominio e gia usato da un
 * altro account Vercel, la risposta porta un record TXT di verifica
 * (`verification[]`) che il club deve aggiungere: lo restituiamo come record
 * del provider.
 *
 * Variabili: `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`
 * (facoltativa). Nessuna e in `.env` per default: vedi `.env.example`.
 */

const API = "https://api.vercel.com";

const config = () => ({
  token: process.env.VERCEL_API_TOKEN || "",
  projectId: process.env.VERCEL_PROJECT_ID || "",
  teamId: process.env.VERCEL_TEAM_ID || "",
});

const withTeam = (path: string) => {
  const { teamId } = config();
  return teamId ? `${API}${path}${path.includes("?") ? "&" : "?"}teamId=${encodeURIComponent(teamId)}` : `${API}${path}`;
};

const headers = () => ({ Authorization: `Bearer ${config().token}`, "Content-Type": "application/json" });

const verificationRecords = (body: any): DnsRecord[] =>
  (Array.isArray(body?.verification) ? body.verification : [])
    .filter((item: any) => item?.type && item?.domain && item?.value)
    .map((item: any) => ({
      type: String(item.type).toUpperCase() === "TXT" ? "TXT" : "CNAME",
      name: String(item.domain),
      fqdn: String(item.domain),
      value: String(item.value),
      purpose: "ownership" as const,
      note: "Richiesto da Vercel perche il dominio e gia associato a un altro account.",
    }));

const fail = (status: number, body: any): never => {
  const message = body?.error?.message || `Vercel ha risposto ${status}`;
  throw new DomainProviderError(`Provider domini: ${message}`);
};

const readStatus = async (hostname: string): Promise<ProviderDomainStatus> => {
  const { projectId } = config();
  const domain = await providerFetch(withTeam(`/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(hostname)}`), {
    headers: headers(),
  });
  if (domain.status === 404) return { attached: false, tls: "not_started", records: [], message: "Il dominio non e registrato presso il provider" };
  if (domain.status >= 400) fail(domain.status, domain.body);

  const configuration = await providerFetch(withTeam(`/v6/domains/${encodeURIComponent(hostname)}/config`), { headers: headers() });
  const misconfigured = configuration.status >= 400 ? true : Boolean(configuration.body?.misconfigured);
  const verified = Boolean(domain.body?.verified);
  const tls: TlsState = verified && !misconfigured ? "active" : verified ? "pending" : "not_started";
  return {
    attached: verified,
    tls,
    records: verificationRecords(domain.body),
    message: misconfigured ? "Il DNS non punta ancora al progetto" : undefined,
  };
};

export const vercelDomainProvider: DomainProvider = {
  key: "vercel",
  label: "Vercel",
  isConfigured: () => Boolean(config().token && config().projectId),
  routingTarget: () => ({
    cname: process.env.EASYGAME_WEBSITE_CNAME_TARGET || "cname.vercel-dns.com",
    ipv4: (process.env.EASYGAME_WEBSITE_A_RECORDS || "76.76.21.21").split(",").map((ip) => ip.trim()).filter(Boolean),
  }),
  async register(hostname) {
    const { projectId } = config();
    const response = await providerFetch(withTeam(`/v10/projects/${encodeURIComponent(projectId)}/domains`), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ name: hostname }),
    });
    /* 409 = gia nel progetto: e l'idempotenza che chiediamo. */
    if (response.status >= 400 && response.status !== 409) fail(response.status, response.body);
    return { providerRef: hostname, records: verificationRecords(response.body) };
  },
  async verify(hostname) {
    const { projectId } = config();
    const response = await providerFetch(
      withTeam(`/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(hostname)}/verify`),
      { method: "POST", headers: headers() },
    );
    if (response.status >= 400 && response.status !== 400) fail(response.status, response.body);
    return readStatus(hostname);
  },
  status: (hostname) => readStatus(hostname),
  async remove(hostname) {
    const { projectId } = config();
    const response = await providerFetch(
      withTeam(`/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(hostname)}`),
      { method: "DELETE", headers: headers() },
    );
    if (response.status >= 400 && response.status !== 404) fail(response.status, response.body);
  },
};
