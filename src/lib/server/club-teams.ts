import { prisma } from "./prisma";
import { readClubResourceCollection } from "./resources";
import { recordAuditEvent, AUDIT_ACTIONS } from "./audit";
import { assertActiveClub, resolveActiveClubId } from "@/lib/auth/active-club-boundary";
import { canManageClubConfigurationAsActor } from "@/lib/access-roles";
import { WebsiteConflictError } from "./website/access";
import { roleHasPermission } from "@/lib/permissions/catalog";
import { filterCollectionBySeason, normalizeClubSeasons } from "@/lib/club-seasons";
import { nextSlugHistory, normalizeSeasonLinks } from "@/lib/sports/teams";
import { resolveSportKey } from "@/lib/sports/adapters";
import { slugify, uniqueSlug, RESERVED_SLUGS } from "@/lib/website/slug";

/**
 * **Le squadre stabili del club** (ADR-0200 §8). Unico scrittore di `club_teams`.
 *
 * Una squadra e configurazione sportiva del club, come le categorie: la
 * scrive chi amministra il club (`canManageClubConfigurationAsActor`), la legge chi
 * vede il calendario (`events.read`) o il sito (`website.read`). Il
 * collegamento a categoria e gruppo e **per stagione**: la «Serie C» del
 * 2026/27 e una categoria diversa da quella del 2025/26, e la squadra le
 * collega entrambe.
 *
 * Rinominare lo slug conserva quello vecchio: l'indirizzo pubblicato ieri
 * risponde ancora, con un reindirizzamento.
 */

export type ClubTeamsScope = {
  userId: string;
  activeOrganizationId: string | null;
  activeRole?: string | null;
  allowedOrganizationIds: string[];
  actorEmail?: string | null;
};

const denied = (message: string) => new Error(`Accesso negato: ${message}`);
const text = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const assertCanRead = (scope: ClubTeamsScope) => {
  if (!roleHasPermission(scope.activeRole, "events.read") && !roleHasPermission(scope.activeRole, "website.read")) {
    throw denied("il ruolo attivo non puo vedere le squadre del club");
  }
};

const assertCanManage = (scope: ClubTeamsScope) => {
  /* Sull'attore, non sul ruolo base: un ruolo personalizzato non eredita la configurazione del club. */
  if (!canManageClubConfigurationAsActor(scope.activeRole)) {
    throw denied("le squadre le configura chi amministra il club");
  }
};

export const serializeTeam = (row: any) => ({
  id: row.id,
  name: row.name,
  shortName: row.short_name || "",
  slug: row.slug,
  previousSlugs: Array.isArray(row.previous_slugs) ? row.previous_slugs : [],
  sport: row.sport || null,
  description: row.description || "",
  photoMediaId: row.photo_attachment_id || null,
  seasonLinks: normalizeSeasonLinks(row.season_links),
  sortOrder: Number(row.sort_order || 0),
  active: Boolean(row.active),
  version: Number(row.version || 1),
});

export const listClubTeams = async (scope: ClubTeamsScope) => {
  const organizationId = resolveActiveClubId(scope, null, "le squadre");
  assertCanRead(scope);
  const rows = await (prisma as any).clubTeam.findMany({
    where: { organization_id: organizationId },
    orderBy: [{ sort_order: "asc" }, { name: "asc" }],
  });
  return rows.map(serializeTeam);
};

/** I collegamenti validi: categorie (e gruppi) che il club ha davvero, nella stagione dichiarata. */
const validateLinks = async (organizationId: string, raw: unknown) => {
  const links = normalizeSeasonLinks(raw);
  if (!links.length) return links;
  const [club, categories, groups] = await Promise.all([
    prisma.club.findUnique({ where: { id: organizationId }, select: { settings: true } }),
    readClubResourceCollection(organizationId, "categories"),
    readClubResourceCollection(organizationId, "category_groups"),
  ]);
  const seasons = normalizeClubSeasons(club?.settings);
  const knownSeasons = new Set(seasons.seasons.map((season) => season.id));
  for (const link of links) {
    if (!knownSeasons.has(link.seasonId)) throw new Error("Una squadra si collega solo a stagioni del club");
    const inSeason = filterCollectionBySeason("categories", categories as any[], link.seasonId, {
      legacySeasonId: seasons.legacySeasonId,
      knownSeasonIds: seasons.seasons.map((season) => season.id),
    });
    if (!inSeason.some((category: any) => String(category.id) === link.categoryId)) {
      throw new Error("La categoria scelta non esiste nella stagione indicata");
    }
    if (link.groupId && !(groups as any[]).some((group) => String(group.id) === link.groupId)) {
      throw new Error("Il gruppo scelto non esiste");
    }
  }
  return links;
};

const assertPhoto = async (organizationId: string, mediaId: string | null) => {
  if (!mediaId) return null;
  const media = await (prisma as any).attachment.findFirst({
    where: { id: mediaId, organization_id: organizationId, owner_type: "website" },
    select: { id: true },
  });
  if (!media) throw new Error("La foto della squadra deve essere un'immagine della libreria del sito");
  return mediaId;
};

const takenSlugs = async (organizationId: string, excludeId?: string) => {
  const rows = await (prisma as any).clubTeam.findMany({
    where: { organization_id: organizationId, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    select: { slug: true, previous_slugs: true },
  });
  return new Set<string>(rows.flatMap((row: any) => [row.slug, ...(row.previous_slugs || [])]));
};

export type TeamInput = {
  name?: unknown;
  shortName?: unknown;
  slug?: unknown;
  sport?: unknown;
  description?: unknown;
  photoMediaId?: unknown;
  seasonLinks?: unknown;
  sortOrder?: unknown;
  active?: unknown;
  expectedVersion?: unknown;
};

export const createClubTeam = async (scope: ClubTeamsScope, input: TeamInput) => {
  const organizationId = resolveActiveClubId(scope, null, "la squadra");
  assertCanManage(scope);
  const name = text(input.name, 80);
  if (!name) throw new Error("Dai un nome alla squadra");
  const taken = await takenSlugs(organizationId);
  const requested = slugify(input.slug || name);
  if (requested && RESERVED_SLUGS.has(requested)) throw new Error(`«${requested}» e un indirizzo riservato`);
  const slug = requested && !taken.has(requested) ? requested : uniqueSlug(name, taken);
  const row = await (prisma as any).clubTeam.create({
    data: {
      organization_id: organizationId,
      name,
      short_name: text(input.shortName, 30) || null,
      slug,
      sport: input.sport ? resolveSportKey(input.sport) : null,
      description: text(input.description, 2000) || null,
      photo_attachment_id: await assertPhoto(organizationId, text(input.photoMediaId, 64) || null),
      season_links: await validateLinks(organizationId, input.seasonLinks),
      sort_order: Number.isFinite(Number(input.sortOrder)) ? Math.round(Number(input.sortOrder)) : 0,
      created_by: scope.userId,
      version: 1,
    },
  });
  await recordAuditEvent({
    action: AUDIT_ACTIONS.clubTeamSaved,
    actorUserId: scope.userId,
    actorEmail: scope.actorEmail || null,
    actorRole: scope.activeRole || null,
    organizationId,
    resource: "club_teams",
    resourceId: row.id,
    metadata: { created: true, slug },
  });
  return serializeTeam(row);
};

export const updateClubTeam = async (scope: ClubTeamsScope, teamId: string, input: TeamInput) => {
  assertCanManage(scope);
  const existing = await (prisma as any).clubTeam.findFirst({ where: { id: String(teamId || "") } });
  if (!existing) throw denied("la squadra non esiste");
  assertActiveClub(scope, existing.organization_id, "la squadra");
  const organizationId = existing.organization_id;

  const data: Record<string, unknown> = { version: { increment: 1 } };
  if (input.name !== undefined) {
    const name = text(input.name, 80);
    if (!name) throw new Error("Il nome della squadra non puo essere vuoto");
    data.name = name;
  }
  if (input.shortName !== undefined) data.short_name = text(input.shortName, 30) || null;
  if (input.sport !== undefined) data.sport = input.sport ? resolveSportKey(input.sport) : null;
  if (input.description !== undefined) data.description = text(input.description, 2000) || null;
  if (input.photoMediaId !== undefined) data.photo_attachment_id = await assertPhoto(organizationId, text(input.photoMediaId, 64) || null);
  if (input.seasonLinks !== undefined) data.season_links = await validateLinks(organizationId, input.seasonLinks);
  if (input.sortOrder !== undefined) data.sort_order = Number.isFinite(Number(input.sortOrder)) ? Math.round(Number(input.sortOrder)) : 0;
  if (input.active !== undefined) data.active = Boolean(input.active);
  if (input.slug !== undefined) {
    const slug = slugify(input.slug);
    if (!slug) throw new Error("Lo slug deve contenere almeno una lettera o una cifra");
    if (RESERVED_SLUGS.has(slug)) throw new Error(`«${slug}» e un indirizzo riservato`);
    if (slug !== existing.slug) {
      const taken = await takenSlugs(organizationId, existing.id);
      if (taken.has(slug)) throw new Error(`L'indirizzo «${slug}» e gia di un'altra squadra`);
      data.slug = slug;
      data.previous_slugs = nextSlugHistory(existing.slug, slug, existing.previous_slugs || []);
    }
  }

  const expected = input.expectedVersion === undefined ? existing.version : Number(input.expectedVersion);
  const result = await (prisma as any).clubTeam.updateMany({
    where: { id: existing.id, organization_id: organizationId, version: expected },
    data,
  });
  /* 409 con la versione corrente, come pagine e competizioni (D-WS-12). */
  if (!result.count) throw new WebsiteConflictError("La squadra e stata modificata da qualcun altro: ricarica e riprova", Number(existing.version));
  await recordAuditEvent({
    action: AUDIT_ACTIONS.clubTeamSaved,
    actorUserId: scope.userId,
    actorEmail: scope.actorEmail || null,
    actorRole: scope.activeRole || null,
    organizationId,
    resource: "club_teams",
    resourceId: existing.id,
    metadata: { fields: Object.keys(data).filter((key) => key !== "version") },
  });
  return serializeTeam(await (prisma as any).clubTeam.findUnique({ where: { id: existing.id } }));
};

/**
 * Elimina una squadra. Le gare che la citavano tornano senza squadra (la
 * colonna si azzera da sola, chiave esterna `SET NULL`) e restano
 * riconoscibili dalla loro categoria. Per toglierla dal sito senza perderla,
 * basta disattivarla.
 */
export const deleteClubTeam = async (scope: ClubTeamsScope, teamId: string) => {
  assertCanManage(scope);
  const existing = await (prisma as any).clubTeam.findFirst({ where: { id: String(teamId || "") } });
  if (!existing) throw denied("la squadra non esiste");
  assertActiveClub(scope, existing.organization_id, "la squadra");
  await (prisma as any).clubTeam.deleteMany({ where: { id: existing.id, organization_id: existing.organization_id } });
  await recordAuditEvent({
    action: AUDIT_ACTIONS.clubTeamDeleted,
    actorUserId: scope.userId,
    actorEmail: scope.actorEmail || null,
    actorRole: scope.activeRole || null,
    organizationId: existing.organization_id,
    resource: "club_teams",
    resourceId: existing.id,
    metadata: { name: existing.name, slug: existing.slug },
  });
  return { deleted: true };
};

/**
 * Crea una squadra per ogni categoria della stagione che non ne ha ancora
 * una, e collega le squadre gia esistenti con lo stesso nome. E l'aiuto della
 * prima configurazione: si rivede e si corregge, non decide niente di
 * irreversibile.
 */
export const createTeamsFromSeasonCategories = async (scope: ClubTeamsScope, seasonIdInput?: unknown) => {
  const organizationId = resolveActiveClubId(scope, null, "le squadre");
  assertCanManage(scope);
  const club = await prisma.club.findUnique({ where: { id: organizationId }, select: { settings: true } });
  const seasons = normalizeClubSeasons(club?.settings);
  const seasonId = text(seasonIdInput, 64) || seasons.activeSeasonId;
  const categories = filterCollectionBySeason(
    "categories",
    (await readClubResourceCollection(organizationId, "categories")) as any[],
    seasonId,
    { legacySeasonId: seasons.legacySeasonId, knownSeasonIds: seasons.seasons.map((season) => season.id) },
  ) as Array<Record<string, any>>;
  const teams = await (prisma as any).clubTeam.findMany({ where: { organization_id: organizationId } });
  const taken = await takenSlugs(organizationId);
  let created = 0;
  let linked = 0;
  for (const category of categories) {
    const categoryId = String(category.id || "");
    const name = text(category.name, 80);
    if (!categoryId || !name) continue;
    const alreadyLinked = teams.some((team: any) => normalizeSeasonLinks(team.season_links).some((link) => link.seasonId === seasonId && link.categoryId === categoryId));
    if (alreadyLinked) continue;
    const sameName = teams.find((team: any) => team.name.toLowerCase() === name.toLowerCase() && !normalizeSeasonLinks(team.season_links).some((link) => link.seasonId === seasonId));
    if (sameName) {
      const links = [...normalizeSeasonLinks(sameName.season_links), { seasonId, categoryId, groupId: null }];
      await (prisma as any).clubTeam.update({ where: { id: sameName.id }, data: { season_links: links, version: { increment: 1 } } });
      linked += 1;
      continue;
    }
    const slug = uniqueSlug(name, taken);
    taken.add(slug);
    await (prisma as any).clubTeam.create({
      data: {
        organization_id: organizationId,
        name,
        slug,
        season_links: [{ seasonId, categoryId, groupId: null }],
        sort_order: Number(category.sortOrder ?? category.sort_order ?? 0) || 0,
        created_by: scope.userId,
        version: 1,
      },
    });
    created += 1;
  }
  return { created, linked, seasonId };
};
