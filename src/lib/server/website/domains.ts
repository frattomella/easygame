import { randomBytes } from "node:crypto";
import { promises as dnsPromises } from "node:dns";
import { prisma } from "../prisma";
import {
  auditWebsite,
  requireWebsiteAccess,
  WebsiteConflictError,
  WEBSITE_AUDIT_ACTIONS,
  type WebsiteScope,
} from "./access";
import { findSiteRow } from "./sites";
import { invalidateWebsiteSite } from "./cache";
import { describeDomainProvider, resolveDomainProvider, DomainProviderError } from "./domain-providers";
import {
  companionHostname,
  expectedDnsRecords,
  normalizeHostname,
  VERIFICATION_PREFIX,
  type DnsRecord,
  type DomainState,
  type TlsState,
} from "@/lib/website/domains/model";

/**
 * **I domini del sito** (ADR-0200 §2). Del solo proprietario.
 *
 * Il flusso: l'operatore scrive il dominio → EasyGame lo normalizza, rifiuta
 * gli host di EasyGame e quelli gia di un altro club, lo registra presso il
 * provider e mostra i record da creare → l'operatore crea i record dal suo
 * registrar → «verifica»: EasyGame legge il TXT di proprieta con il proprio
 * resolver DNS e solo dopo chiede al provider lo stato del certificato →
 * attivo con HTTPS → si puo pubblicare.
 *
 * `website.domain.manage` ha come soli ruoli `owner`: nessun ruolo
 * personalizzato lo puo contenere. Leggere l'elenco basta `website.read`.
 */

export type DnsResolver = {
  resolveTxt(hostname: string): Promise<string[][]>;
};

let resolver: DnsResolver = dnsPromises;

/** Solo per i test: un resolver che non va in rete. */
export const __setDnsResolverForTests = (next: DnsResolver | null) => {
  resolver = next || dnsPromises;
};

/** Gli host che appartengono a EasyGame e nessun club puo collegare. */
export const reservedHostSuffixes = () =>
  [
    ...String(process.env.EASYGAME_APP_HOSTS || "").split(","),
    "easygame.it",
    "easygame.app",
    "vercel.app",
    "vercel-dns.com",
  ]
    .map((value) => value.trim().toLowerCase().replace(/:\d+$/, ""))
    .filter(Boolean);

const allowLocal = () => process.env.NODE_ENV !== "production" || ["1", "true"].includes(String(process.env.EASYGAME_WEBSITE_ALLOW_LOCAL_DOMAINS || "").trim().toLowerCase());

const toIso = (value: unknown) => (value instanceof Date ? value.toISOString() : value ? String(value) : null);

export const serializeDomain = (row: Record<string, any>) => ({
  id: row.id,
  hostname: row.hostname as string,
  role: row.role as "primary" | "redirect",
  state: row.state as DomainState,
  tlsState: row.tls_state as TlsState,
  provider: row.provider as string,
  records: (Array.isArray(row.dns_records) ? row.dns_records : []) as DnsRecord[],
  lastError: row.last_error || null,
  lastCheckedAt: toIso(row.last_checked_at),
  verifiedAt: toIso(row.verified_at),
  activatedAt: toIso(row.activated_at),
  attemptCount: Number(row.attempt_count || 0),
  companion: companionHostname(row.hostname),
});

export const listDomains = async (scope: WebsiteScope | null | undefined) => {
  const grant = await requireWebsiteAccess(scope, "website.read", "read");
  const site = await findSiteRow(grant.organizationId);
  const rows = site
    ? await (prisma as any).websiteDomain.findMany({
        where: { site_id: site.id, organization_id: grant.organizationId },
        orderBy: [{ role: "asc" }, { created_at: "asc" }],
      })
    : [];
  return { provider: describeDomainProvider(), domains: rows.map(serializeDomain) };
};

const findDomain = async (organizationId: string, domainId: string) => {
  const row = await (prisma as any).websiteDomain.findFirst({ where: { id: String(domainId || ""), organization_id: organizationId } });
  if (!row) throw new Error("Accesso negato: il dominio non appartiene al club attivo, o non esiste");
  return row;
};

const requireProvider = () => {
  const provider = resolveDomainProvider();
  if (!provider || !provider.isConfigured()) {
    throw new Error(
      "Il collegamento dei domini non e ancora configurato su questa installazione di EasyGame: contatta l'assistenza",
    );
  }
  return provider;
};

const hostsOfSite = async (siteId: string) =>
  ((await (prisma as any).websiteDomain.findMany({ where: { site_id: siteId }, select: { hostname: true } })) as Array<{ hostname: string }>).map(
    (row) => row.hostname,
  );

/** Aggiunge un dominio. Il primo diventa il principale. */
export const addDomain = async (scope: WebsiteScope | null | undefined, input: { hostname: unknown }, request?: Request) => {
  const grant = await requireWebsiteAccess(scope, "website.domain.manage", "publish");
  const site = await findSiteRow(grant.organizationId);
  if (!site) throw new Error("Crea prima il sito: il dominio si collega a un sito esistente");

  const check = normalizeHostname(input.hostname, { reservedSuffixes: reservedHostSuffixes(), allowLocalDevelopment: allowLocal() });
  if (!check.ok) throw new Error(check.message);
  const hostname = check.hostname;

  const taken = await (prisma as any).websiteDomain.findUnique({ where: { hostname }, select: { organization_id: true } });
  if (taken) {
    throw new WebsiteConflictError(
      taken.organization_id === grant.organizationId
        ? `Il dominio ${hostname} e gia collegato a questo sito`
        : `Il dominio ${hostname} e gia collegato a un altro sito: se e vostro, contatta l'assistenza`,
    );
  }

  const count = await (prisma as any).websiteDomain.count({ where: { site_id: site.id } });
  if (count >= 6) throw new Error("Un sito puo avere al massimo sei domini");

  const provider = requireProvider();
  const token = `easygame-verify=${randomBytes(16).toString("hex")}`;
  let providerRef: string | null = null;
  let providerRecords: DnsRecord[] = [];
  try {
    const registered = await provider.register(hostname);
    providerRef = registered.providerRef;
    providerRecords = registered.records;
  } catch (error) {
    if (error instanceof DomainProviderError) throw new Error(error.message);
    throw error;
  }

  const records = [...expectedDnsRecords(hostname, token, provider.routingTarget()), ...providerRecords];
  const hasPrimary = await (prisma as any).websiteDomain.count({ where: { site_id: site.id, role: "primary" } });
  const row = await (prisma as any).websiteDomain.create({
    data: {
      site_id: site.id,
      organization_id: grant.organizationId,
      hostname,
      role: hasPrimary ? "redirect" : "primary",
      state: "pending_dns",
      tls_state: "not_started",
      verification_token: token,
      provider: provider.key,
      provider_ref: providerRef,
      dns_records: records,
      created_by: grant.scope.userId,
    },
  });
  await auditWebsite(grant, WEBSITE_AUDIT_ACTIONS.domainAdded, row.id, { hostname, provider: provider.key }, request);
  return serializeDomain(row);
};

/** Vero se il TXT di proprieta contiene il token. */
export const checkOwnershipRecord = async (hostname: string, token: string) => {
  if (/\.(localhost|test)$/.test(hostname) && allowLocal()) return { ok: true, found: [token] };
  try {
    const answers = await resolver.resolveTxt(`${VERIFICATION_PREFIX}.${hostname}`);
    const flat = answers.map((chunks) => chunks.join(""));
    return { ok: flat.includes(token), found: flat };
  } catch {
    return { ok: false, found: [] as string[] };
  }
};

/**
 * Verifica un dominio: prima la proprieta (DNS, fatta da EasyGame), poi il
 * provider (instradamento e certificato). Lo stato si scrive com'e, senza
 * ottimismo: «attivo» solo con il certificato attivo.
 */
export const verifyDomain = async (scope: WebsiteScope | null | undefined, domainId: string, request?: Request) => {
  const grant = await requireWebsiteAccess(scope, "website.domain.manage", "publish");
  const row = await findDomain(grant.organizationId, domainId);
  const provider = requireProvider();

  const ownership = await checkOwnershipRecord(row.hostname, row.verification_token);
  const now = new Date();
  if (!ownership.ok) {
    const updated = await (prisma as any).websiteDomain.update({
      where: { id: row.id },
      data: {
        state: "pending_dns",
        last_checked_at: now,
        attempt_count: { increment: 1 },
        last_error: ownership.found.length
          ? `Il record TXT ${VERIFICATION_PREFIX}.${row.hostname} esiste ma non contiene il codice atteso`
          : `Il record TXT ${VERIFICATION_PREFIX}.${row.hostname} non e ancora visibile (il DNS puo impiegare fino a qualche ora)`,
      },
    });
    return serializeDomain(updated);
  }

  let status;
  try {
    status = await provider.verify(row.hostname, row.provider_ref);
  } catch (error) {
    const updated = await (prisma as any).websiteDomain.update({
      where: { id: row.id },
      data: { state: "failed", last_checked_at: now, attempt_count: { increment: 1 }, last_error: error instanceof Error ? error.message : "Errore del provider" },
    });
    return serializeDomain(updated);
  }

  const state: DomainState = status.attached ? (status.tls === "active" ? "active" : "provisioning") : "verifying";
  const records = [
    ...(Array.isArray(row.dns_records) ? (row.dns_records as DnsRecord[]).filter((record) => record.purpose === "routing" || record.fqdn.startsWith(`${VERIFICATION_PREFIX}.`)) : []),
    ...status.records,
  ];
  const updated = await (prisma as any).websiteDomain.update({
    where: { id: row.id },
    data: {
      state,
      tls_state: status.tls,
      dns_records: records,
      last_checked_at: now,
      attempt_count: { increment: 1 },
      verified_at: row.verified_at || now,
      activated_at: state === "active" ? row.activated_at || now : row.activated_at,
      last_error: status.message || null,
    },
  });
  if (state === "active" && row.state !== "active") {
    await auditWebsite(grant, WEBSITE_AUDIT_ACTIONS.domainVerified, row.id, { hostname: row.hostname }, request);
    invalidateWebsiteSite(row.site_id, [row.hostname]);
  }
  return serializeDomain(updated);
};

/** Il dominio principale: quello canonico, a cui gli altri reindirizzano. */
export const setPrimaryDomain = async (scope: WebsiteScope | null | undefined, domainId: string, request?: Request) => {
  const grant = await requireWebsiteAccess(scope, "website.domain.manage", "publish");
  const row = await findDomain(grant.organizationId, domainId);
  if (row.state !== "active") throw new Error("Solo un dominio attivo puo diventare il principale");
  await (prisma as any).$transaction([
    (prisma as any).websiteDomain.updateMany({ where: { site_id: row.site_id, role: "primary" }, data: { role: "redirect" } }),
    (prisma as any).websiteDomain.update({ where: { id: row.id }, data: { role: "primary" } }),
  ]);
  await auditWebsite(grant, WEBSITE_AUDIT_ACTIONS.domainPrimary, row.id, { hostname: row.hostname }, request);
  invalidateWebsiteSite(row.site_id, await hostsOfSite(row.site_id));
  return listDomains(scope);
};

/**
 * Toglie un dominio: dal provider e dall'archivio. Se era il principale, il
 * ruolo passa al primo altro dominio attivo; altrimenti il sito resta senza
 * principale e smette di essere servito finche non se ne collega uno.
 */
export const removeDomain = async (scope: WebsiteScope | null | undefined, domainId: string, request?: Request) => {
  const grant = await requireWebsiteAccess(scope, "website.domain.manage", "read");
  const row = await findDomain(grant.organizationId, domainId);
  const provider = resolveDomainProvider();
  if (provider && provider.key === row.provider && provider.isConfigured()) {
    await provider.remove(row.hostname, row.provider_ref).catch((error: unknown) => {
      if (!(error instanceof DomainProviderError)) throw error;
    });
  }
  const hosts = await hostsOfSite(row.site_id);
  await (prisma as any).$transaction(async (tx: any) => {
    await tx.websiteDomain.delete({ where: { id: row.id } });
    if (row.role === "primary") {
      const next = await tx.websiteDomain.findFirst({
        where: { site_id: row.site_id, state: "active" },
        orderBy: { created_at: "asc" },
      });
      if (next) await tx.websiteDomain.update({ where: { id: next.id }, data: { role: "primary" } });
    }
  });
  await auditWebsite(grant, WEBSITE_AUDIT_ACTIONS.domainRemoved, row.id, { hostname: row.hostname }, request);
  invalidateWebsiteSite(row.site_id, hosts);
  return listDomains(scope);
};

/**
 * Il giro periodico (cron): rilegge lo stato dei domini in attesa e di quelli
 * attivi da piu di un giorno, cosi un certificato che scade o un DNS cambiato
 * si vedono senza che il club debba premere «verifica».
 */
export const refreshDomainsInBackground = async (limit = 50) => {
  const provider = resolveDomainProvider();
  if (!provider || !provider.isConfigured()) return { checked: 0, skipped: "provider non configurato" };
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await (prisma as any).websiteDomain.findMany({
    where: {
      provider: provider.key,
      OR: [{ state: { in: ["pending_dns", "verifying", "provisioning"] } }, { state: "active", last_checked_at: { lt: dayAgo } }],
    },
    take: limit,
    orderBy: { last_checked_at: "asc" },
  });
  let checked = 0;
  for (const row of rows) {
    const ownership = await checkOwnershipRecord(row.hostname, row.verification_token);
    if (!ownership.ok) {
      await (prisma as any).websiteDomain.update({
        where: { id: row.id },
        data: { last_checked_at: new Date(), state: row.state === "active" ? "failed" : "pending_dns", last_error: "Record TXT di proprieta non trovato" },
      });
      checked += 1;
      continue;
    }
    const status = await provider.status(row.hostname, row.provider_ref).catch(() => null);
    if (status) {
      const state: DomainState = status.attached ? (status.tls === "active" ? "active" : "provisioning") : "verifying";
      await (prisma as any).websiteDomain.update({
        where: { id: row.id },
        data: { state, tls_state: status.tls, last_checked_at: new Date(), activated_at: state === "active" ? row.activated_at || new Date() : row.activated_at, last_error: status.message || null },
      });
      if (state !== row.state) invalidateWebsiteSite(row.site_id, [row.hostname]);
    }
    checked += 1;
  }
  return { checked };
};
