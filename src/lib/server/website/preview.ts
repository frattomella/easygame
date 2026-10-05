import { prisma } from "../prisma";
import { instantToArchiveDigits } from "./public-data/matches";
import { requireAuthenticatedUser, resolveOrganizationScopeForUser, isPlatformAdminSession } from "../auth";
import { requireWebsiteAccess } from "./access";
import { buildDraftSnapshot } from "./publishing";
import type { SiteSnapshot } from "@/lib/website/publishing/snapshot";

/**
 * **L'anteprima privata** (ADR-0200 §5).
 *
 * Non e un indirizzo pubblico: vive sotto `/website-preview/<sito>/…` sul
 * dominio del gestionale, chiede la sessione (il cookie del gestionale, che
 * sul dominio di un club non arriva mai), e chi la apre deve poter leggere il
 * sito **di quel club** con `website.read`. Rende la **bozza** con lo stesso
 * renderer del pubblico. Ogni risposta e `noindex, nofollow` e non si mette in
 * cache.
 */

export type PreviewGrant = {
  organizationId: string;
  siteId: string;
  snapshot: SiteSnapshot;
};

export const authorizePreview = async (cookieHeader: string, siteId: string): Promise<PreviewGrant | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) return null;
  const request = new Request("http://preview.internal/", { headers: { cookie: cookieHeader } });
  const session = await requireAuthenticatedUser(request);
  if (!session) return null;
  const site = await (prisma as any).websiteSite.findUnique({ where: { id: siteId }, select: { id: true, organization_id: true } });
  if (!site) return null;
  const scope = await resolveOrganizationScopeForUser(session.db.user_id, site.organization_id, null);
  if (scope.activeOrganizationId !== site.organization_id) return null;
  try {
    await requireWebsiteAccess(
      { ...scope, isPlatformAdmin: isPlatformAdminSession(session), actorEmail: session.db.user.email },
      "website.read",
      "read",
      site.organization_id,
    );
  } catch {
    return null;
  }
  const snapshot = await buildDraftSnapshot(site.organization_id);
  if (!snapshot) return null;
  return { organizationId: site.organization_id, siteId: site.id, snapshot };
};

/**
 * Il contesto «di esempio» per l'anteprima di un modello di dettaglio:
 * l'editor apre `/squadre/__esempio` e vede il modello riempito con la prima
 * squadra attiva, l'ultima gara, l'ultimo articolo pubblicato, il primo
 * giocatore pubblicato, il prossimo evento. Se il gestionale non ne ha, il
 * modello mostra i suoi messaggi vuoti.
 */
export const samplePageContext = async (organizationId: string, detail: "article" | "team" | "match" | "player" | "event") => {
  const now = new Date();
  switch (detail) {
    case "team": {
      const team = await (prisma as any).clubTeam.findFirst({ where: { organization_id: organizationId, active: true }, orderBy: [{ sort_order: "asc" }, { name: "asc" }], select: { id: true } });
      return { teamId: team?.id || null };
    }
    case "match": {
      const match =
        (await (prisma as any).clubEvent.findFirst({ where: { organization_id: organizationId, kind: "match", home_score: { not: null } }, orderBy: { starts_at: "desc" }, select: { id: true } })) ||
        (await (prisma as any).clubEvent.findFirst({ where: { organization_id: organizationId, kind: "match", status: { not: "archived" } }, orderBy: { starts_at: "desc" }, select: { id: true } }));
      return { matchId: match?.id || null };
    }
    case "event": {
      const event = await (prisma as any).clubEvent.findFirst({ where: { organization_id: organizationId, status: { not: "archived" }, starts_at: { gte: instantToArchiveDigits(now) } }, orderBy: { starts_at: "asc" }, select: { id: true } });
      return { eventId: event?.id || null };
    }
    case "article": {
      const article = await (prisma as any).websiteArticle.findFirst({
        where: { organization_id: organizationId, OR: [{ status: "published", published_at: { lte: now } }, { status: "scheduled", publish_at: { lte: now } }] },
        orderBy: { published_at: "desc" },
        select: { id: true },
      });
      return { articleId: article?.id || null };
    }
    case "player": {
      const publication = await (prisma as any).websitePersonPublication.findFirst({
        where: { organization_id: organizationId, person_kind: "athlete", published: true },
        select: { person_id: true },
      });
      return { personId: publication?.person_id || null };
    }
    default:
      return {};
  }
};
