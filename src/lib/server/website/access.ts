import { prisma } from "../prisma";
import { assertActiveClub } from "@/lib/auth/active-club-boundary";
import { normalizeEntitlementOverrides } from "@/lib/entitlements";
import { normalizeExtraServices } from "@/lib/payments/payment-config-utils";
import { resolveWebsiteAccess, type WebsiteAccess } from "@/lib/website/access-state";
import { assertWebsitePermission, type WebsitePermission } from "@/lib/website/permissions";
import { recordAuditEvent } from "../audit";
import { WEBSITE_AUDIT_ACTIONS } from "./audit-actions";

/**
 * **Il cancello unico del modulo Website** (ADR-0200 §1, §10).
 *
 * Ogni funzione di `src/lib/server/website/` che legge o scrive per conto di
 * una persona passa da `requireWebsiteAccess`, in quest'ordine:
 *
 * 1. il club e quello **attivo** (`assertActiveClub`): un identificativo di un
 *    altro club non passa nemmeno se l'utente vi appartiene;
 * 2. il ruolo attivo porta la chiave (`website.*`, catalogo unico, ruoli
 *    personalizzati compresi);
 * 3. il servizio e nello stato giusto: leggere chiede `canView`, scrivere
 *    `canEdit`, pubblicare e collegare domini `canPublish`.
 *
 * Nessuna rotta ricostruisce questi controlli: una rotta che chiamasse un
 * modulo del sito senza passare di qui non avrebbe niente da chiamare.
 */

export type WebsiteScope = {
  userId: string;
  activeOrganizationId: string | null;
  activeRole?: string | null;
  allowedOrganizationIds: string[];
  /** Si ricava dalla sessione, mai dal corpo di una richiesta. */
  isPlatformAdmin?: boolean;
  actorEmail?: string | null;
};

export type WebsiteMode = "read" | "write" | "publish";

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};

/** Lo stato del servizio per un club, dalle sue impostazioni. */
export const loadWebsiteAccess = async (
  organizationId: string,
  options: { isPlatformAdmin?: boolean; now?: Date } = {},
): Promise<WebsiteAccess> => {
  const club = await (prisma as any).club.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  if (!club) throw new Error("Accesso negato: club non trovato");
  return resolveWebsiteAccessFromSettings(club.settings, options);
};

export const resolveWebsiteAccessFromSettings = (
  settings: unknown,
  options: { isPlatformAdmin?: boolean; now?: Date } = {},
): WebsiteAccess => {
  const record = asRecord(settings);
  const extra = normalizeExtraServices(record.extraServices).find((service) => service.key === "website") || null;
  const overrides = normalizeEntitlementOverrides(asRecord(record.entitlements).overrides);
  return resolveWebsiteAccess({
    extra: extra
      ? {
          enabled: extra.enabled,
          billingStatus: extra.billingStatus,
          trialEndsAt: (extra as any).trialEndsAt ?? null,
          currentPeriodEnd: (extra as any).currentPeriodEnd ?? null,
          activatedAt: (extra as any).activatedAt ?? null,
        }
      : null,
    override: overrides.website ?? null,
    isPlatformAdmin: options.isPlatformAdmin,
    now: options.now,
  });
};

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

export type WebsiteGrant = {
  organizationId: string;
  access: WebsiteAccess;
  scope: WebsiteScope;
};

/**
 * Pretende che chi chiama possa operare sul sito del club attivo.
 *
 * `organizationId` facoltativo: quando una rotta riceve l'identificativo di
 * una riga, passa il club della riga e il cancello verifica che sia quello
 * attivo. Senza, vale il club attivo.
 */
export const requireWebsiteAccess = async (
  scope: WebsiteScope | null | undefined,
  permission: WebsitePermission,
  mode: WebsiteMode = "read",
  organizationId?: string | null,
): Promise<WebsiteGrant> => {
  if (!scope) throw denied("sessione non valida");
  const clubId = String(organizationId || scope.activeOrganizationId || "").trim();
  assertActiveClub(scope, clubId, "il sito");
  assertWebsitePermission(scope.activeRole, permission);

  const access = await loadWebsiteAccess(clubId, { isPlatformAdmin: scope.isPlatformAdmin });
  if (!access.canView) throw denied(access.message);
  if (mode === "write" && !access.canEdit) {
    throw denied(`${access.message} Le modifiche non sono disponibili.`);
  }
  if (mode === "publish" && !access.canPublish) {
    throw denied(`${access.message} La pubblicazione non e disponibile.`);
  }
  return { organizationId: clubId, access, scope };
};

export { WEBSITE_AUDIT_ACTIONS };

/** L'audit del modulo: non solleva mai, come `recordAuditEvent`. */
export const auditWebsite = async (
  grant: Pick<WebsiteGrant, "organizationId" | "scope">,
  action: (typeof WEBSITE_AUDIT_ACTIONS)[keyof typeof WEBSITE_AUDIT_ACTIONS],
  resourceId: string | null,
  metadata: Record<string, unknown> = {},
  request?: Request | null,
) =>
  recordAuditEvent({
    action,
    actorUserId: grant.scope.userId,
    actorEmail: grant.scope.actorEmail || null,
    actorRole: grant.scope.activeRole || null,
    organizationId: grant.organizationId,
    resource: "website",
    resourceId,
    request: request || null,
    metadata,
  });

/** L'errore di concorrenza: la rotta lo mappa su 409. */
export class WebsiteConflictError extends Error {
  readonly status = 409;
  readonly currentVersion: number | null;
  constructor(message: string, currentVersion: number | null = null) {
    super(message);
    this.name = "WebsiteConflictError";
    this.currentVersion = currentVersion;
  }
}

export const isWebsiteConflict = (error: unknown): error is WebsiteConflictError =>
  error instanceof WebsiteConflictError || (error as any)?.name === "WebsiteConflictError";

/** La versione dichiarata dal client, obbligatoria per ogni scrittura su una bozza. */
export const requireExpectedVersion = (value: unknown) => {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("Manca la versione della bozza: ricarica l'editor e riprova");
  }
  return version;
};
