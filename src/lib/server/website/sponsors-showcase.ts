import { prisma } from "../prisma";
import { listSponsorShowcases, saveSponsorShowcase } from "../sponsors";
import { auditWebsite, requireWebsiteAccess, WEBSITE_AUDIT_ACTIONS, type WebsiteScope } from "./access";
import { invalidateWebsiteData } from "./cache";
import { findSiteRow } from "./sites";
import { normalizeSettings } from "@/lib/website/site-config";

/**
 * **La vetrina degli sponsor**, dal lato del sito.
 *
 * Qui si autorizza (`website.sponsors.manage`, servizio attivo); la scrittura
 * la fa il dominio sponsor (`saveSponsorShowcase`), che resta l'unico
 * proprietario della scheda. Il logo, se si carica qui, e un file della
 * libreria del sito dello stesso club.
 */

export const listSponsorShowcaseForEditor = async (scope: WebsiteScope | null | undefined) => {
  const grant = await requireWebsiteAccess(scope, "website.read", "read");
  const site = await findSiteRow(grant.organizationId);
  return {
    tiers: normalizeSettings(site?.settings).sponsorTiers,
    sponsors: await listSponsorShowcases(grant.organizationId),
  };
};

export const updateSponsorShowcase = async (
  scope: WebsiteScope | null | undefined,
  sponsorId: string,
  showcase: unknown,
  request?: Request,
) => {
  const grant = await requireWebsiteAccess(scope, "website.sponsors.manage", "write");
  const logoMediaId = String((showcase as any)?.logoMediaId || "").trim();
  if (logoMediaId) {
    const media = await (prisma as any).attachment.findFirst({
      /* Una foto di persona ha la sua policy e non diventa un logo pubblico. */
      where: { id: logoMediaId, organization_id: grant.organizationId, owner_type: "website", category: { not: "person-photo" } },
      select: { id: true },
    });
    if (!media) throw new Error("Il logo deve essere un'immagine della libreria del sito");
  }
  const saved = await saveSponsorShowcase({ organizationId: grant.organizationId, sponsorId, showcase });
  await auditWebsite(grant, WEBSITE_AUDIT_ACTIONS.sponsorShowcase, sponsorId, { visible: saved.showcase.visible, tier: saved.showcase.tierKey }, request);
  invalidateWebsiteData(grant.organizationId);
  return saved;
};
