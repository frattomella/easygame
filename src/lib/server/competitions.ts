import { prisma } from "./prisma";
import { recordAuditEvent, AUDIT_ACTIONS } from "./audit";
import { assertActiveClub, resolveActiveClubId } from "@/lib/auth/active-club-boundary";
import { roleHasPermission } from "@/lib/permissions/catalog";
import { canManageClubConfigurationAsActor } from "@/lib/access-roles";
import { WebsiteConflictError } from "./website/access";
import { resolveSportKey } from "@/lib/sports/adapters";

/**
 * **Competizioni e avversari** (ADR-0200 §8). Unico scrittore di
 * `competitions` e `opponents`.
 *
 * Non e un motore di campionati: una competizione e un nome con una stagione,
 * che classifica le gare e che il sito mostra. La classifica, se il club la
 * vuole sul sito, la scrive il club (`standings`): EasyGame conosce solo le
 * gare del club, e una classifica calcolata da quelle sarebbe una classifica
 * inventata.
 *
 * Li gestisce chi gestisce il calendario (`events.manage`); li legge chi lo
 * vede (`events.read`).
 */

export type CompetitionsScope = {
  userId: string;
  activeOrganizationId: string | null;
  activeRole?: string | null;
  allowedOrganizationIds: string[];
  actorEmail?: string | null;
};

const denied = (message: string) => new Error(`Accesso negato: ${message}`);
const text = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const assertRead = (scope: CompetitionsScope) => {
  if (!roleHasPermission(scope.activeRole, "events.read") && !roleHasPermission(scope.activeRole, "website.read")) {
    throw denied("il ruolo attivo non puo vedere competizioni e avversari");
  }
};
/*
  **Competizioni, classifiche e avversari sono configurazione del club**, come
  le squadre stabili (D-WS-7): li scrive chi amministra il club, sull'attore e
  non sul ruolo base. Prima bastava `events.manage`, che ha anche
  l'allenatore: chi allena una categoria riscriveva la classifica e
  l'anagrafica avversari di tutto il club. Leggerle resta di chi vede il
  calendario, perche l'allenatore le sceglie sulle gare che gestisce.
*/
const assertManage = (scope: CompetitionsScope) => {
  if (!canManageClubConfigurationAsActor(scope.activeRole)) {
    throw denied("competizioni, classifiche e avversari li configura chi amministra il club");
  }
};

const COMPETITION_KINDS = ["league", "cup", "tournament", "friendly"] as const;

const num = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(-9999, Math.min(9999, n)) : null;
};

/** Le righe di classifica ripulite: squadra obbligatoria, numeri interi o vuoti. */
export const normalizeStandings = (raw: unknown) =>
  (Array.isArray(raw) ? raw : [])
    .map((row: any, index) => ({
      position: num(row?.position) ?? index + 1,
      team: text(row?.team, 80),
      isClub: Boolean(row?.isClub),
      played: num(row?.played),
      won: num(row?.won),
      drawn: num(row?.drawn),
      lost: num(row?.lost),
      pointsFor: num(row?.pointsFor),
      pointsAgainst: num(row?.pointsAgainst),
      points: num(row?.points),
    }))
    .filter((row) => row.team)
    .slice(0, 40);

export const serializeCompetition = (row: any) => ({
  id: row.id,
  name: row.name,
  shortName: row.short_name || "",
  seasonId: row.season_id || null,
  sport: row.sport || null,
  kind: row.kind,
  standings: normalizeStandings(row.standings),
  standingsUpdatedAt: row.standings_updated_at ? new Date(row.standings_updated_at).toISOString() : null,
  active: Boolean(row.active),
  version: Number(row.version || 1),
});

export const listCompetitions = async (scope: CompetitionsScope, filter: { seasonId?: unknown } = {}) => {
  const organizationId = resolveActiveClubId(scope, null, "le competizioni");
  assertRead(scope);
  const rows = await (prisma as any).competition.findMany({
    where: { organization_id: organizationId, ...(filter.seasonId ? { season_id: String(filter.seasonId) } : {}) },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return rows.map(serializeCompetition);
};

export const saveCompetition = async (
  scope: CompetitionsScope,
  input: { id?: unknown; name?: unknown; shortName?: unknown; seasonId?: unknown; sport?: unknown; kind?: unknown; standings?: unknown; active?: unknown; expectedVersion?: unknown },
) => {
  assertManage(scope);
  const id = text(input.id, 64);
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = text(input.name, 120);
    if (!name) throw new Error("Dai un nome alla competizione");
    data.name = name;
  }
  if (input.shortName !== undefined) data.short_name = text(input.shortName, 40) || null;
  if (input.seasonId !== undefined) data.season_id = text(input.seasonId, 64) || null;
  if (input.sport !== undefined) data.sport = input.sport ? resolveSportKey(input.sport) : null;
  if (input.kind !== undefined) data.kind = (COMPETITION_KINDS as readonly string[]).includes(String(input.kind)) ? String(input.kind) : "league";
  if (input.standings !== undefined) {
    data.standings = normalizeStandings(input.standings);
    data.standings_updated_at = new Date();
  }
  if (input.active !== undefined) data.active = Boolean(input.active);

  let row;
  if (id) {
    const existing = await (prisma as any).competition.findFirst({ where: { id } });
    if (!existing) throw denied("la competizione non esiste");
    assertActiveClub(scope, existing.organization_id, "la competizione");
    /*
      **Due salvataggi della stessa classifica non si sovrascrivono in silenzio**
      (D-WS-12): con `expectedVersion` la riga si scrive solo se nessuno l'ha
      cambiata nel frattempo, altrimenti 409 con la versione corrente.
    */
    const expected = input.expectedVersion === undefined || input.expectedVersion === null ? Number(existing.version) : Number(input.expectedVersion);
    const updated = await (prisma as any).competition.updateMany({ where: { id, version: expected }, data: { ...data, version: { increment: 1 } } });
    if (!updated.count) throw new WebsiteConflictError("La competizione e stata modificata da qualcun altro: ricarica e riprova", Number(existing.version));
    row = await (prisma as any).competition.findUnique({ where: { id } });
  } else {
    const organizationId = resolveActiveClubId(scope, null, "la competizione");
    if (!data.name) throw new Error("Dai un nome alla competizione");
    row = await (prisma as any).competition.create({ data: { organization_id: organizationId, kind: "league", version: 1, ...data } });
  }
  await recordAuditEvent({
    action: AUDIT_ACTIONS.competitionSaved,
    actorUserId: scope.userId,
    actorEmail: scope.actorEmail || null,
    actorRole: scope.activeRole || null,
    organizationId: row.organization_id,
    resource: "competitions",
    resourceId: row.id,
    metadata: { fields: Object.keys(data) },
  });
  return serializeCompetition(row);
};

export const deleteCompetition = async (scope: CompetitionsScope, competitionId: string) => {
  assertManage(scope);
  const existing = await (prisma as any).competition.findFirst({ where: { id: String(competitionId || "") } });
  if (!existing) throw denied("la competizione non esiste");
  assertActiveClub(scope, existing.organization_id, "la competizione");
  await (prisma as any).competition.deleteMany({ where: { id: existing.id, organization_id: existing.organization_id } });
  return { deleted: true };
};

export const serializeOpponent = (row: any) => ({
  id: row.id,
  name: row.name,
  shortName: row.short_name || "",
  city: row.city || "",
  logoMediaId: row.logo_attachment_id || null,
  websiteUrl: row.website_url || null,
  version: Number(row.version || 1),
});

export const listOpponents = async (scope: CompetitionsScope) => {
  const organizationId = resolveActiveClubId(scope, null, "gli avversari");
  assertRead(scope);
  const rows = await (prisma as any).opponent.findMany({ where: { organization_id: organizationId }, orderBy: { name: "asc" } });
  return rows.map(serializeOpponent);
};

const httpUrl = (value: unknown) => {
  const raw = text(value, 300);
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
};

export const saveOpponent = async (
  scope: CompetitionsScope,
  input: { id?: unknown; name?: unknown; shortName?: unknown; city?: unknown; logoMediaId?: unknown; websiteUrl?: unknown; expectedVersion?: unknown },
) => {
  assertManage(scope);
  const id = text(input.id, 64);
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = text(input.name, 120);
    if (!name) throw new Error("Dai un nome all'avversario");
    data.name = name;
  }
  if (input.shortName !== undefined) data.short_name = text(input.shortName, 30) || null;
  if (input.city !== undefined) data.city = text(input.city, 80) || null;
  if (input.websiteUrl !== undefined) data.website_url = httpUrl(input.websiteUrl);

  const organizationId = id
    ? (await (prisma as any).opponent.findFirst({ where: { id }, select: { organization_id: true } }))?.organization_id
    : resolveActiveClubId(scope, null, "l'avversario");
  if (!organizationId) throw denied("l'avversario non esiste");
  assertActiveClub(scope, organizationId, "l'avversario");

  if (input.logoMediaId !== undefined) {
    const mediaId = text(input.logoMediaId, 64) || null;
    if (mediaId) {
      /* Una foto di persona ha la sua policy e non diventa un logo pubblico. */
      const media = await (prisma as any).attachment.findFirst({ where: { id: mediaId, organization_id: organizationId, owner_type: "website", category: { not: "person-photo" } }, select: { id: true } });
      if (!media) throw new Error("Il logo deve essere un'immagine della libreria del sito");
    }
    data.logo_attachment_id = mediaId;
  }
  if (data.name) {
    const clash = await (prisma as any).opponent.findFirst({
      where: { organization_id: organizationId, name: data.name, ...(id ? { NOT: { id } } : {}) },
      select: { id: true },
    });
    if (clash) throw new Error("Esiste gia un avversario con questo nome");
  }
  let row;
  if (id) {
    const existing = await (prisma as any).opponent.findFirst({ where: { id }, select: { version: true } });
    const expected = input.expectedVersion === undefined || input.expectedVersion === null ? Number(existing?.version ?? 1) : Number(input.expectedVersion);
    const updated = await (prisma as any).opponent.updateMany({ where: { id, organization_id: organizationId, version: expected }, data: { ...data, version: { increment: 1 } } });
    if (!updated.count) throw new WebsiteConflictError("L'avversario e stato modificato da qualcun altro: ricarica e riprova", Number(existing?.version ?? 1));
    row = await (prisma as any).opponent.findUnique({ where: { id } });
  } else {
    row = await (prisma as any).opponent.create({ data: { organization_id: organizationId, version: 1, ...data } });
  }
  await recordAuditEvent({
    action: AUDIT_ACTIONS.opponentSaved,
    actorUserId: scope.userId,
    actorEmail: scope.actorEmail || null,
    actorRole: scope.activeRole || null,
    organizationId,
    resource: "opponents",
    resourceId: row.id,
    metadata: { fields: Object.keys(data) },
  });
  return serializeOpponent(row);
};

export const deleteOpponent = async (scope: CompetitionsScope, opponentId: string) => {
  assertManage(scope);
  const existing = await (prisma as any).opponent.findFirst({ where: { id: String(opponentId || "") } });
  if (!existing) throw denied("l'avversario non esiste");
  assertActiveClub(scope, existing.organization_id, "l'avversario");
  await (prisma as any).opponent.deleteMany({ where: { id: existing.id, organization_id: existing.organization_id } });
  return { deleted: true };
};
