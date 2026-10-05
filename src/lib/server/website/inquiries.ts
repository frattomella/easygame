import { prisma } from "../prisma";
import { requireWebsiteAccess, type WebsiteScope } from "./access";
import { findSiteRow } from "./sites";
import { sanitizeEmail } from "@/lib/website/links";
import { normalizeIdentity } from "@/lib/website/site-config";
import { sendWebsiteInquiryEmail } from "../email/email-service";
import { reportServerError } from "../observability";

/**
 * **La casella del modulo contatti del sito** (ADR-0200 §9).
 *
 * EasyGame non ha un dominio «lead», e il mandato chiede di non inventarne
 * uno: questa e una casella, non un CRM. Una richiesta arriva con nome,
 * email, telefono facoltativo, argomento e messaggio, e con il **testo del
 * consenso** che la persona ha accettato, congelato sulla riga.
 *
 * Difese, tutte sul server: limite di frequenza per indirizzo e per sito, un
 * campo esca (honeypot) che una persona non vede e un robot riempie, un tempo
 * minimo di compilazione, lunghezze massime, email valida. Chi legge le
 * richieste ha `website.settings.manage`: contengono dati personali di chi non
 * e (ancora) del club.
 *
 * Conservazione: 24 mesi (`purgeOldInquiries`, nel giro notturno).
 *
 * **Avviso al club** (D-WS-13): se la piattaforma ha l'SMTP configurato, una
 * richiesta nuova manda un'email all'indirizzo del sito (Impostazioni →
 * identita) o, se vuoto, a quello del club. Senza SMTP non parte niente e la
 * richiesta resta comunque nella casella; un invio fallito non fa fallire la
 * richiesta.
 */

export const INQUIRY_RETENTION_DAYS = 730;

export class InquiryRejected extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "InquiryRejected";
    this.status = status;
  }
}

const text = (value: unknown, max: number) => String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);

export type InquiryInput = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  topic?: unknown;
  message?: unknown;
  consent?: unknown;
  consentText?: unknown;
  /** Il campo esca: deve arrivare vuoto. */
  website?: unknown;
  /** Quando il modulo e stato disegnato (ms epoch), per il tempo minimo. */
  startedAt?: unknown;
  sourcePath?: unknown;
};

/** Valida e scrive una richiesta. Il sito e il club arrivano dal dominio risolto. */
export const submitInquiry = async (target: { siteId: string; organizationId: string }, input: InquiryInput, now = new Date()) => {
  if (text(input.website, 200)) {
    /* Un robot: si risponde come se fosse andato tutto bene, senza scrivere niente. */
    return { accepted: true, stored: false };
  }
  const started = Number(input.startedAt);
  if (Number.isFinite(started) && now.getTime() - started < 3000) {
    return { accepted: true, stored: false };
  }
  const name = text(input.name, 120);
  const email = sanitizeEmail(input.email);
  const message = text(input.message, 4000);
  const consentText = text(input.consentText, 600);
  if (name.length < 2) throw new InquiryRejected("Scrivi il tuo nome");
  if (!email) throw new InquiryRejected("Scrivi un indirizzo email valido");
  if (message.length < 5) throw new InquiryRejected("Scrivi il messaggio");
  if (input.consent !== true && input.consent !== "true" && input.consent !== "on") {
    throw new InquiryRejected("Per inviare la richiesta serve il consenso al trattamento dei dati");
  }
  const phone = text(input.phone, 40).replace(/[^\d+ ]/g, "") || null;
  const row = await (prisma as any).websiteInquiry.create({
    data: {
      site_id: target.siteId,
      organization_id: target.organizationId,
      name,
      email,
      phone,
      topic: text(input.topic, 60) || null,
      message,
      consent_text: consentText || "Consenso al trattamento dei dati per ricevere una risposta",
      source_path: text(input.sourcePath, 200) || null,
      status: "new",
    },
    select: { id: true },
  });
  await notifyClubOfInquiry(target, { name, email, phone, topic: text(input.topic, 60) || null, message });
  return { accepted: true, stored: true, id: row.id as string };
};

/** L'email al club per una richiesta nuova. Non solleva: la richiesta e gia salvata. */
export const notifyClubOfInquiry = async (
  target: { siteId: string; organizationId: string },
  inquiry: { name: string; email: string; phone: string | null; topic: string | null; message: string },
) => {
  try {
    const [site, club] = await Promise.all([
      (prisma as any).websiteSite.findFirst({ where: { id: target.siteId, organization_id: target.organizationId }, select: { settings: true } }),
      (prisma as any).club.findFirst({ where: { id: target.organizationId }, select: { name: true, contact_email: true } }),
    ]);
    const to = normalizeIdentity(site?.settings?.identity).email || sanitizeEmail(club?.contact_email) || "";
    if (!to) return { status: "skipped" as const, reason: "no_recipient" };
    return await sendWebsiteInquiryEmail({ to, clubName: String(club?.name || ""), inquiry });
  } catch (error) {
    reportServerError(error, { route: "/api/public/website/inquiries" });
    return { status: "failed" as const };
  }
};

export const listInquiries = async (scope: WebsiteScope | null | undefined, filter: { status?: unknown } = {}) => {
  const grant = await requireWebsiteAccess(scope, "website.settings.manage", "read");
  const site = await findSiteRow(grant.organizationId);
  if (!site) return { items: [], unread: 0 };
  const status = ["new", "handled", "archived"].includes(String(filter.status)) ? String(filter.status) : null;
  const [rows, unread] = await Promise.all([
    (prisma as any).websiteInquiry.findMany({
      where: { site_id: site.id, organization_id: grant.organizationId, ...(status ? { status } : {}) },
      orderBy: { created_at: "desc" },
      take: 200,
    }),
    (prisma as any).websiteInquiry.count({ where: { site_id: site.id, organization_id: grant.organizationId, status: "new" } }),
  ]);
  return {
    unread: Number(unread || 0),
    items: rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      topic: row.topic,
      message: row.message,
      consentText: row.consent_text,
      sourcePath: row.source_path,
      status: row.status,
      handledAt: row.handled_at ? new Date(row.handled_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
    })),
  };
};

export const setInquiryStatus = async (scope: WebsiteScope | null | undefined, inquiryId: string, status: unknown) => {
  const grant = await requireWebsiteAccess(scope, "website.settings.manage", "read");
  if (!["new", "handled", "archived"].includes(String(status))) throw new Error("Stato non riconosciuto");
  const result = await (prisma as any).websiteInquiry.updateMany({
    where: { id: String(inquiryId || ""), organization_id: grant.organizationId },
    data: {
      status: String(status),
      handled_by: status === "new" ? null : grant.scope.userId,
      handled_at: status === "new" ? null : new Date(),
    },
  });
  if (!result.count) throw new Error("Accesso negato: la richiesta non appartiene al club attivo, o non esiste");
  return { id: inquiryId, status: String(status) };
};

/** Il giro notturno: le richieste piu vecchie del periodo di conservazione si cancellano. */
export const purgeOldInquiries = async (now = new Date()) => {
  const cutoff = new Date(now.getTime() - INQUIRY_RETENTION_DAYS * 86400 * 1000);
  const result = await (prisma as any).websiteInquiry.deleteMany({ where: { created_at: { lt: cutoff } } });
  return { deleted: Number(result.count || 0) };
};
