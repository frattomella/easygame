import { prisma } from "../prisma";
import { readAttachment } from "../attachments";
import { siteDayKey } from "@/lib/website/dates";
import { readShowcasedSponsorLegacyLogo } from "../sponsors";

/**
 * **I loghi storici**, serviti al sito senza copiarli (ADR-0200 §9).
 *
 * Il logo del club vive in `clubs.logo_url` e quello di uno sponsor nella sua
 * scheda: spesso come data URL (debito D13), a volte come riferimento a un
 * allegato o come URL. Il sito non li ricopia nella sua libreria — un cambio
 * di logo in anagrafica deve arrivare al sito da solo — e li serve da qui.
 *
 * Solo immagini raster: un SVG in un data URL puo contenere script, e non si
 * serve mai.
 */

const ALLOWED = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);

export type LogoPayload = { content: Buffer; mimeType: string } | { redirect: string } | null;

const decodeLogo = async (value: string | null | undefined, organizationId: string): Promise<LogoPayload> => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const dataUrl = raw.match(/^data:([a-z/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (dataUrl) {
    const mimeType = dataUrl[1].toLowerCase();
    if (!ALLOWED.has(mimeType)) return null;
    const content = Buffer.from(dataUrl[2].replace(/\s+/g, ""), "base64");
    if (!content.length || content.length > 5 * 1024 * 1024) return null;
    return { content, mimeType: mimeType === "image/jpg" ? "image/jpeg" : mimeType };
  }
  const attachment = raw.match(/^attachment:([0-9a-f-]{36})$/i) || raw.match(/\/api\/v1\/attachments\/([0-9a-f-]{36})/i);
  if (attachment) {
    const stored = await readAttachment(attachment[1]);
    if (!stored || stored.metadata.organizationId !== organizationId) return null;
    const mimeType = String(stored.metadata.mimeType || "").toLowerCase();
    if (!ALLOWED.has(mimeType)) return null;
    return { content: stored.content, mimeType };
  }
  if (/^https:\/\//i.test(raw)) return { redirect: raw };
  return null;
};

/** Il logo del club, solo per un club che ha un sito. */
export const readClubLogoForWebsite = async (organizationId: string): Promise<LogoPayload> => {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) return null;
  const site = await (prisma as any).websiteSite.findUnique({ where: { organization_id: organizationId }, select: { id: true } });
  if (!site) return null;
  const club = await (prisma as any).club.findUnique({ where: { id: organizationId }, select: { logo_url: true } });
  return decodeLogo(club?.logo_url, organizationId);
};

/** Il logo storico di uno sponsor, solo se e in vetrina oggi. */
export const readSponsorLogoForWebsite = async (organizationId: string, sponsorId: string): Promise<LogoPayload> => {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) return null;
  const site = await (prisma as any).websiteSite.findUnique({ where: { organization_id: organizationId }, select: { id: true } });
  if (!site) return null;
  const logo = await readShowcasedSponsorLegacyLogo(organizationId, sponsorId, siteDayKey(new Date()));
  return decodeLogo(logo, organizationId);
};
