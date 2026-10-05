/**
 * **Domini del sito: forma, stati, record DNS** (ADR-0200 §2).
 *
 * Il sito si pubblica solo su un dominio o sottodominio del club. Questo
 * modulo sa tre cose, tutte pure:
 *
 * 1. **com'e fatto un hostname accettabile** — minuscolo, senza porta, senza
 *    punto finale, in punycode, non un indirizzo IP, non un host di EasyGame;
 * 2. **quali record DNS servono** — un TXT di proprieta e il record che
 *    instrada (CNAME per un sottodominio, A per un dominio di secondo livello,
 *    dove un CNAME non e ammesso);
 * 3. **come si passa da uno stato all'altro**.
 *
 * Il provider che chiede il certificato e lo stato TLS vive sul server
 * (`src/lib/server/website/domain-providers/`).
 */

export const DOMAIN_STATES = [
  "pending_dns",
  "verifying",
  "provisioning",
  "active",
  "failed",
  "removed",
] as const;
export type DomainState = (typeof DOMAIN_STATES)[number];

export const TLS_STATES = ["not_started", "pending", "active", "failed"] as const;
export type TlsState = (typeof TLS_STATES)[number];

export const DOMAIN_ROLES = ["primary", "redirect"] as const;
export type DomainRole = (typeof DOMAIN_ROLES)[number];

export const DOMAIN_STATE_LABELS: Record<DomainState, string> = {
  pending_dns: "In attesa dei record DNS",
  verifying: "Verifica in corso",
  provisioning: "Certificato in emissione",
  active: "Attivo",
  failed: "Verifica non riuscita",
  removed: "Rimosso",
};

export const TLS_STATE_LABELS: Record<TlsState, string> = {
  not_started: "Non richiesto",
  pending: "In emissione",
  active: "Attivo (HTTPS)",
  failed: "Non riuscito",
};

export const VERIFICATION_PREFIX = "_easygame-verify";

/** Suffissi a due livelli piu comuni: `club.co.uk` e un apex, non un sottodominio. */
const TWO_LEVEL_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "com.br",
  "com.ar",
  "co.za",
  "com.mx",
]);

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export type HostnameCheck = { ok: true; hostname: string } | { ok: false; message: string };

/**
 * Normalizza e valida un hostname scritto da un operatore. Accetta anche un
 * URL incollato per intero (`https://www.club.it/chi-siamo`) e ne tiene l'host.
 */
export type HostnameOptions = {
  /** Gli host di EasyGame: nessun club li puo collegare. */
  reservedSuffixes?: readonly string[];
  /**
   * Solo in sviluppo: ammette `*.localhost` e `*.test`, cosi il flusso del
   * dominio si prova in locale con il provider simulato.
   */
  allowLocalDevelopment?: boolean;
};

export const normalizeHostname = (value: unknown, options: HostnameOptions = {}): HostnameCheck => {
  const reservedSuffixes = options.reservedSuffixes || [];
  let raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return { ok: false, message: "Scrivi il dominio, per esempio www.miasocieta.it" };
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(raw)) raw = `http://${raw}`;
  let host: string;
  try {
    const url = new URL(raw);
    if (url.username || url.password) return { ok: false, message: "Il dominio non puo contenere credenziali" };
    host = url.hostname.replace(/\.$/, "");
  } catch {
    return { ok: false, message: "Il dominio non e valido" };
  }
  if (host.startsWith("[") || IPV4.test(host)) return { ok: false, message: "Serve un nome di dominio, non un indirizzo IP" };
  if (host.length > 253) return { ok: false, message: "Il dominio e troppo lungo" };
  const labels = host.split(".");
  if (labels.length < 2) return { ok: false, message: "Il dominio deve avere almeno un punto (es. miasocieta.it)" };
  if (!labels.every((label) => LABEL.test(label))) return { ok: false, message: "Il dominio contiene caratteri non ammessi" };
  const tld = labels[labels.length - 1];
  if (tld === "localhost" || tld === "test" || tld === "local" || tld === "internal") {
    if (!options.allowLocalDevelopment || tld === "local" || tld === "internal") {
      return { ok: false, message: "Un dominio locale non si collega a un sito pubblico" };
    }
  } else if (!/^[a-z]{2,63}$|^xn--[a-z0-9-]{1,59}$/.test(tld)) {
    return { ok: false, message: "L'estensione del dominio non e valida" };
  }
  for (const suffix of reservedSuffixes) {
    const clean = suffix.toLowerCase().replace(/^\./, "");
    if (host === clean || host.endsWith(`.${clean}`)) {
      return { ok: false, message: "Questo indirizzo appartiene a EasyGame: collega un dominio della societa" };
    }
  }
  return { ok: true, hostname: host };
};

/** Il dominio registrato (apex) di un hostname: `basket.club.it` → `club.it`. */
export const registrableDomain = (hostname: string) => {
  const labels = hostname.split(".");
  const lastTwo = labels.slice(-2).join(".");
  if (TWO_LEVEL_SUFFIXES.has(lastTwo) && labels.length >= 3) return labels.slice(-3).join(".");
  return lastTwo;
};

export const isApexDomain = (hostname: string) => registrableDomain(hostname) === hostname;

/** L'altra meta della coppia apex/www, per proporla all'operatore. */
export const companionHostname = (hostname: string) => {
  if (hostname.startsWith("www.")) return hostname.slice(4);
  if (isApexDomain(hostname)) return `www.${hostname}`;
  return null;
};

export type DnsRecord = {
  type: "TXT" | "CNAME" | "A" | "AAAA";
  /** Il nome come lo si scrive nel pannello del registrar (relativo all'apex). */
  name: string;
  /** Il nome completo. */
  fqdn: string;
  value: string;
  purpose: "ownership" | "routing";
  note?: string;
};

export type RoutingTarget = {
  /** Il nome verso cui puntare i sottodomini (CNAME). */
  cname: string;
  /** Gli indirizzi per un dominio di secondo livello (A). */
  ipv4: readonly string[];
};

const relativeName = (fqdn: string, apex: string) => {
  if (fqdn === apex) return "@";
  return fqdn.endsWith(`.${apex}`) ? fqdn.slice(0, -(apex.length + 1)) : fqdn;
};

/**
 * I record che il club deve creare. Il TXT prova che il dominio e suo; il
 * record di instradamento porta il traffico. Il provider puo aggiungerne di
 * suoi (una convalida del certificato): li unisce chi chiama.
 */
export const expectedDnsRecords = (hostname: string, token: string, target: RoutingTarget): DnsRecord[] => {
  const apex = registrableDomain(hostname);
  const txtFqdn = `${VERIFICATION_PREFIX}.${hostname}`;
  const records: DnsRecord[] = [
    { type: "TXT", name: relativeName(txtFqdn, apex), fqdn: txtFqdn, value: token, purpose: "ownership" },
  ];
  if (isApexDomain(hostname)) {
    for (const ip of target.ipv4) {
      records.push({
        type: "A",
        name: "@",
        fqdn: hostname,
        value: ip,
        purpose: "routing",
        note: "Un dominio senza «www» non accetta un CNAME: si usa un record A (o ALIAS/ANAME se il registrar lo offre).",
      });
    }
  } else {
    records.push({ type: "CNAME", name: relativeName(hostname, apex), fqdn: hostname, value: target.cname, purpose: "routing" });
  }
  return records;
};

export const TRANSITIONS: Record<DomainState, readonly DomainState[]> = {
  pending_dns: ["verifying", "failed", "removed"],
  verifying: ["pending_dns", "provisioning", "active", "failed", "removed"],
  provisioning: ["active", "failed", "removed", "pending_dns"],
  active: ["provisioning", "failed", "removed", "pending_dns"],
  failed: ["verifying", "pending_dns", "removed"],
  removed: [],
};

export const canTransitionDomain = (from: DomainState, to: DomainState) =>
  from === to || TRANSITIONS[from].includes(to);

/** Un dominio serve il sito solo attivo **e** con il certificato attivo. */
export const isDomainServing = (state: DomainState, tls: TlsState) => state === "active" && tls === "active";
