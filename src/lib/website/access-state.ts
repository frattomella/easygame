/**
 * **Lo stato del modulo EasyGame Website per un club** (ADR-0200 §1).
 *
 * Non e un secondo sistema di billing: si **ricava** dall'extra Hub
 * `website` (`clubs.settings.extraServices`, scritto solo dalla console di
 * piattaforma o dal webhook di fatturazione) e dalle eccezioni di
 * piattaforma (`settings.entitlements.overrides.website`). Quattro stati:
 *
 * - `unavailable` — mai acquistato, disattivato, o revocato da Cedi;
 * - `trial` — prova in corso: **si puo pubblicare**;
 * - `active` — attivo;
 * - `suspended` — sospeso, scaduto, disdetto dopo essere stato attivo, o
 *   prova finita. Il club vede il sito in sola lettura, il pubblico vede
 *   «sito non disponibile», i dati restano.
 *
 * Modulo puro: la data di oggi arriva da chi chiama.
 */

export type WebsiteAccessState = "unavailable" | "trial" | "active" | "suspended";

export type WebsiteAccessInput = {
  /** Lo stato dell'extra `website` cosi come `normalizeExtraServices` lo restituisce. */
  extra: {
    enabled: boolean;
    billingStatus: string;
    trialEndsAt?: string | null;
    currentPeriodEnd?: string | null;
    activatedAt?: string | null;
  } | null;
  /** `true` concessa da Cedi, `false` revocata, assente = regola del listino. */
  override?: boolean | null;
  isPlatformAdmin?: boolean;
  now?: Date;
};

export type WebsiteAccess = {
  state: WebsiteAccessState;
  /** Modificare bozza, pagine, media, articoli. */
  canEdit: boolean;
  /** Pubblicare e collegare domini. */
  canPublish: boolean;
  /** Il pubblico vede il sito (se pubblicato e con un dominio attivo). */
  publicServing: boolean;
  /** Il gestionale mostra l'area (anche in sola lettura). */
  canView: boolean;
  trialEndsAt: string | null;
  message: string;
};

const toTime = (value: unknown) => {
  if (!value) return null;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : null;
};

const describe = (state: WebsiteAccessState, trialEndsAt: string | null): string => {
  switch (state) {
    case "trial":
      return trialEndsAt
        ? `Prova gratuita fino al ${new Date(trialEndsAt).toLocaleDateString("it-IT")}: puoi costruire e pubblicare il sito.`
        : "Prova gratuita in corso: puoi costruire e pubblicare il sito.";
    case "active":
      return "EasyGame Website e attivo.";
    case "suspended":
      return "Il servizio e sospeso: il sito non e visibile al pubblico e la bozza e in sola lettura. I contenuti restano conservati.";
    default:
      return "EasyGame Website e un servizio aggiuntivo: attivalo dall'Hub per costruire il sito della societa.";
  }
};

const build = (state: WebsiteAccessState, trialEndsAt: string | null, extra?: Partial<WebsiteAccess>): WebsiteAccess => ({
  state,
  canEdit: state === "trial" || state === "active",
  canPublish: state === "trial" || state === "active",
  publicServing: state === "trial" || state === "active",
  canView: state !== "unavailable",
  trialEndsAt,
  message: describe(state, trialEndsAt),
  ...extra,
});

/**
 * L'ordine dei controlli **e** la regola:
 *
 * 1. una revoca della piattaforma spegne tutto, anche un servizio pagato;
 * 2. una concessione della piattaforma accende (assistenza, demo, accordi);
 * 3. chi amministra la piattaforma vede l'area, ma lo stato resta quello vero;
 * 4. poi il servizio: prova in corso, attivo, sospeso o mai attivato.
 */
export const resolveWebsiteAccess = (input: WebsiteAccessInput): WebsiteAccess => {
  const now = (input.now || new Date()).getTime();
  const extra = input.extra;

  if (input.override === false) {
    return build("unavailable", null, { message: "Disattivato per questa societa da Cedi." });
  }
  if (input.override === true) {
    return build("active", null, { message: "Attivato per questa societa da Cedi." });
  }

  const status = String(extra?.billingStatus || "not_active");
  const trialEnd = toTime(extra?.trialEndsAt);
  const periodEnd = toTime(extra?.currentPeriodEnd);
  const trialEndsAt = trialEnd ? new Date(trialEnd).toISOString() : null;

  let state: WebsiteAccessState = "unavailable";
  if (extra?.enabled && status === "trialing") {
    state = trialEnd !== null && trialEnd <= now ? "suspended" : "trial";
  } else if (extra?.enabled && status === "active") {
    state = periodEnd !== null && periodEnd <= now ? "suspended" : "active";
  } else if (status === "suspended" || status === "expired" || status === "past_due") {
    state = "suspended";
  } else if (status === "cancelled" && extra?.activatedAt) {
    /* Un servizio disdetto dopo essere stato attivo e sospeso, non sparito: i contenuti restano. */
    state = "suspended";
  }

  const access = build(state, trialEndsAt);
  if (input.isPlatformAdmin && state === "unavailable") {
    return { ...access, canView: true, message: "Stai amministrando la piattaforma: la societa non ha il servizio attivo." };
  }
  return access;
};
