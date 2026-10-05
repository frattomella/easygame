import { prisma } from "../prisma";
import { readClubResourceCollection } from "../resources";
import { requireWebsiteAccess, type WebsiteScope } from "./access";
import { findSiteRow } from "./sites";
import { listSponsorShowcases } from "../sponsors";
import { normalizeClubSeasons, filterCollectionBySeason } from "@/lib/club-seasons";
import { normalizeSettings } from "@/lib/website/site-config";
import { normalizeSeasonLinks } from "@/lib/sports/teams";
import { clubPrimarySport, getSportAdapter } from "@/lib/sports/adapters";

/**
 * **Le scelte dei selettori dell'inspector**: squadre, stagioni,
 * competizioni, livelli sponsor, categorie delle news, moduli pubblicati,
 * persone pubblicate, statistiche dello sport.
 *
 * Una lettura sola quando si apre l'editor. Restituisce etichette e
 * identificativi, mai dati personali oltre al nome di visualizzazione di chi
 * e gia pubblicato sul sito.
 */
export const getEditorOptions = async (scope: WebsiteScope | null | undefined) => {
  const grant = await requireWebsiteAccess(scope, "website.read", "read");
  const organizationId = grant.organizationId;
  const [club, site, teams, competitions, forms, publications, categories, sponsors] = await Promise.all([
    prisma.club.findUnique({ where: { id: organizationId }, select: { settings: true, name: true } }),
    findSiteRow(organizationId),
    (prisma as any).clubTeam.findMany({ where: { organization_id: organizationId, active: true }, orderBy: [{ sort_order: "asc" }, { name: "asc" }] }),
    (prisma as any).competition.findMany({ where: { organization_id: organizationId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, season_id: true } }),
    (prisma as any).formTemplate.findMany({
      where: { organization_id: organizationId, status: "published", public_enabled: true },
      select: { public_slug: true, title: true },
      orderBy: { title: "asc" },
    }),
    (prisma as any).websitePersonPublication.findMany({
      where: { organization_id: organizationId, published: true },
      select: { person_kind: true, person_id: true, settings: true },
    }),
    readClubResourceCollection(organizationId, "categories"),
    listSponsorShowcases(organizationId),
  ]);
  const seasons = normalizeClubSeasons(club?.settings);
  const settings = normalizeSettings(site?.settings);
  const sport = getSportAdapter(clubPrimarySport(club?.settings));

  const athleteIds = (publications as any[]).filter((row) => row.person_kind === "athlete").map((row) => row.person_id);
  const athletes = athleteIds.length
    ? await (prisma as any).athlete.findMany({
        where: { organization_id: organizationId, id: { in: athleteIds }, anonymized_at: null },
        select: { id: true, first_name: true, last_name: true },
      })
    : [];

  return {
    seasons: seasons.seasons.map((season) => ({ id: season.id, label: season.label, active: season.id === seasons.activeSeasonId })),
    teams: (teams as any[]).map((team) => ({ id: team.id, name: team.name, slug: team.slug, seasonIds: normalizeSeasonLinks(team.season_links).map((link) => link.seasonId) })),
    categories: (filterCollectionBySeason("categories", categories as any[], seasons.activeSeasonId, {
      legacySeasonId: seasons.legacySeasonId,
      knownSeasonIds: seasons.seasons.map((season) => season.id),
    }) as any[]).map((category) => ({ id: String(category.id), name: String(category.name || "") })),
    competitions: (competitions as any[]).map((competition) => ({ id: competition.id, name: competition.name, seasonId: competition.season_id })),
    sponsorTiers: settings.sponsorTiers,
    sponsorCount: sponsors.filter((sponsor) => sponsor.showcase.visible).length,
    articleCategories: settings.articleCategories,
    forms: (forms as any[]).map((form) => ({ slug: form.public_slug, title: form.title })),
    people: (athletes as any[]).map((athlete) => ({ id: athlete.id, kind: "athlete", label: `${athlete.first_name} ${athlete.last_name}`.trim() })),
    sport: { key: sport.key, label: sport.label, periodLabel: sport.periodLabel, stats: sport.stats.map((stat) => ({ key: stat.key, label: stat.label })) },
    formsOrigin: (process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_BASE_URL || "").replace(/\/+$/, ""),
  };
};
