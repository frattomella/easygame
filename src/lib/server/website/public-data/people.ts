import { prisma } from "../../prisma";
import { readConsentEnforcement } from "../../consents";
import {
  applyPublicationPolicy,
  normalizePublicationSettings,
  type ImageConsent,
  type PersonSource,
  type PublicationSettings,
} from "@/lib/website/people/policy";
import { detailSlug } from "@/lib/website/slug";
import { membershipMatchesLink, linkForSeason } from "@/lib/sports/teams";
import type { PublicPerson, PublicStatValue } from "@/lib/website/public-dto";
import type { ClubContext, TeamRow } from "./club-context";
import { loadMediaMeta, toPublicImage } from "./images";

/**
 * **Le persone pubbliche del sito** (ADR-0200 §7).
 *
 * L'unico caricatore che legge atleti, allenatori e staff per il sito. La
 * catena e sempre: righe di pubblicazione (`published = true`) → righe
 * interne con **sole** le colonne che la policy riceve → registro dei
 * consensi → `applyPublicationPolicy` → `PublicPerson`. Un atleta senza una
 * pubblicazione non viene nemmeno letto.
 *
 * Tre letture per pagina, qualunque sia il numero di blocchi: pubblicazioni,
 * atleti (con le loro appartenenze) e consenso alle immagini.
 */

export type PeopleIndex = {
  athletes: Map<string, { person: PublicPerson; memberships: Array<{ categoryId: string; siteId: string | null }>; showStats: boolean }>;
  trainers: Map<string, PublicPerson>;
  staff: Map<string, PublicPerson>;
  /** I file delle foto pubblicate, per caricarne i metadati insieme agli altri. */
  photoIds: Set<string>;
};

const text = (value: unknown, max = 120) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const ACTIVE_ATHLETE_STATUSES = new Set(["active", "loan", "attivo", "in prestito", ""]);
const INACTIVE_STAFF = new Set(["inactive", "archived", "suspended", "sospeso", "disattivato"]);

const splitName = (record: Record<string, any>) => {
  const first = text(record.firstName ?? record.first_name ?? record.nome, 60);
  const last = text(record.lastName ?? record.last_name ?? record.cognome, 60);
  if (first || last) return { first, last };
  const full = text(record.name ?? record.fullName, 120).split(" ");
  return { first: full[0] || "", last: full.slice(1).join(" ") };
};

export type PeopleLoadOptions = {
  now: Date;
  seasonId: string | null;
  bases: Partial<Record<"player" | "team", string>>;
};

/** Il numero di maglia della stagione, dalla numerazione; altrimenti quello storico della scheda. */
const jerseyFor = (context: ClubContext, athleteId: string, seasonId: string | null, fallback: string | null) => {
  const inSeason = context.jerseyAssignments.filter((assignment) => {
    if (String(assignment.athleteId ?? assignment.athlete_id ?? "") !== athleteId) return false;
    const season = String(assignment.seasonId ?? assignment.season_id ?? "");
    return !season || !seasonId || season === seasonId;
  });
  const numbered = inSeason.find((assignment) => assignment.number !== null && assignment.number !== undefined && String(assignment.number).trim() !== "");
  return numbered ? text(numbered.number, 4) : text(fallback, 4);
};

/** Le squadre (stabili) di una persona nella stagione, dalle sue appartenenze. */
export const teamsForMemberships = (
  context: ClubContext,
  memberships: Array<{ categoryId: string; siteId: string | null }>,
  seasonId: string | null,
): TeamRow[] =>
  context.teams.filter((team) => {
    if (!team.active) return false;
    const link = linkForSeason(team.season_links, seasonId);
    if (!link) return false;
    const groupSiteId = link.groupId ? context.groupById.get(link.groupId)?.siteId || null : null;
    return memberships.some((membership) => membershipMatchesLink(membership, link, groupSiteId));
  });

export const loadPeopleIndex = async (context: ClubContext, options: PeopleLoadOptions): Promise<PeopleIndex> => {
  const organizationId = context.organizationId;
  const publications = await (prisma as any).websitePersonPublication.findMany({
    where: { organization_id: organizationId, published: true },
    select: { person_kind: true, person_id: true, settings: true },
  });

  const settingsByKey = new Map<string, PublicationSettings>();
  const athleteIds: string[] = [];
  for (const row of publications as any[]) {
    settingsByKey.set(`${row.person_kind}:${row.person_id}`, { ...normalizePublicationSettings(row.settings), published: true });
    if (row.person_kind === "athlete" && /^[0-9a-f-]{36}$/i.test(row.person_id)) athleteIds.push(row.person_id);
  }

  const [athletes, memberships, consent] = await Promise.all([
    athleteIds.length
      ? (prisma as any).athlete.findMany({
          where: { organization_id: organizationId, id: { in: athleteIds } },
          /* Le sole colonne che la policy riceve. Mai `data`. */
          select: { id: true, first_name: true, last_name: true, birth_date: true, status: true, anonymized_at: true, jersey_number: true },
        })
      : [],
    athleteIds.length
      ? (prisma as any).athleteCategoryMembership.findMany({
          where: { organization_id: organizationId, athlete_id: { in: athleteIds } },
          select: { athlete_id: true, category_id: true, site_id: true },
        })
      : [],
    publications.length
      ? readConsentEnforcement({ organizationId, consentKey: "images", subjectKind: "athlete", mode: "require_explicit" })
      : null,
  ]);

  const consentOf = (athleteId: string): ImageConsent => {
    if (!consent?.enforced) return "missing";
    if (consent.acceptedSubjectIds.has(athleteId)) return "accepted";
    if (consent.blockedSubjectIds.has(athleteId)) return "rejected";
    return "missing";
  };

  const membershipsByAthlete = new Map<string, Array<{ categoryId: string; siteId: string | null }>>();
  for (const row of memberships as any[]) {
    const list = membershipsByAthlete.get(row.athlete_id) || [];
    list.push({ categoryId: String(row.category_id), siteId: row.site_id || null });
    membershipsByAthlete.set(row.athlete_id, list);
  }

  const index: PeopleIndex = { athletes: new Map(), trainers: new Map(), staff: new Map(), photoIds: new Set() };

  const toPerson = (
    source: PersonSource,
    settings: PublicationSettings,
    imageConsent: ImageConsent,
    teams: TeamRow[],
  ): PublicPerson | null => {
    const verdict = applyPublicationPolicy(source, settings, {
      now: options.now,
      imageConsent,
      imageConsentDefined: Boolean(consent?.enforced),
    });
    if (!verdict.visible) return null;
    const fields = verdict.fields;
    if (fields.photoMediaId) index.photoIds.add(fields.photoMediaId);
    const slug = detailSlug(source.id, fields.displayName);
    return {
      id: source.id,
      slug,
      href: source.kind === "athlete" && options.bases.player ? `${options.bases.player}/${slug}` : null,
      kind: source.kind,
      displayName: fields.displayName,
      /* La foto si completa dopo, con i metadati di tutte le foto letti insieme. */
      photo: fields.photoMediaId ? toPublicImage(fields.photoMediaId, new Map(), fields.displayName) : null,
      jerseyNumber: fields.jerseyNumber,
      role: fields.role,
      birthYear: fields.birthYear,
      heightCm: fields.heightCm,
      bio: fields.bio,
      teams: teams.map((team) => ({
        id: team.id,
        name: team.name,
        href: options.bases.team ? `${options.bases.team}/${team.slug}` : null,
      })),
      stats: [],
    };
  };

  for (const athlete of athletes as any[]) {
    const settings = settingsByKey.get(`athlete:${athlete.id}`);
    if (!settings) continue;
    const athleteMemberships = membershipsByAthlete.get(athlete.id) || [];
    const birthDate = athlete.birth_date instanceof Date ? athlete.birth_date.toISOString().slice(0, 10) : athlete.birth_date ? String(athlete.birth_date).slice(0, 10) : null;
    const person = toPerson(
      {
        id: athlete.id,
        kind: "athlete",
        firstName: athlete.first_name,
        lastName: athlete.last_name,
        birthDate,
        active: ACTIVE_ATHLETE_STATUSES.has(String(athlete.status || "").toLowerCase()),
        anonymized: Boolean(athlete.anonymized_at),
        jerseyNumber: jerseyFor(context, athlete.id, options.seasonId, athlete.jersey_number),
        internalRole: "",
      },
      settings,
      consentOf(athlete.id),
      teamsForMemberships(context, athleteMemberships, options.seasonId),
    );
    if (person) index.athletes.set(athlete.id, { person, memberships: athleteMemberships, showStats: settings.showStats });
  }

  for (const [kind, records] of [
    ["trainer", context.trainers],
    ["staff", context.staff],
  ] as const) {
    for (const record of records) {
      const id = text(record.id, 64);
      const settings = settingsByKey.get(`${kind}:${id}`);
      if (!id || !settings) continue;
      const { first, last } = splitName(record);
      const person = toPerson(
        {
          id,
          kind,
          firstName: first,
          lastName: last,
          birthDate: null,
          active: !INACTIVE_STAFF.has(String(record.status || "").toLowerCase()),
          anonymized: Boolean(record.anonymizedAt || record.anonymized_at),
          jerseyNumber: "",
          internalRole: text(record.role ?? record.qualification ?? record.position, 60),
        },
        settings,
        /* Allenatori e staff sono adulti: la foto segue la regola degli adulti, consenso dichiarato dal club. */
        "missing",
        [],
      );
      if (person) (kind === "trainer" ? index.trainers : index.staff).set(id, person);
    }
  }

  const meta = await loadMediaMeta(organizationId, index.photoIds);
  const withMeta = (person: PublicPerson) =>
    person.photo ? { ...person, photo: toPublicImage(person.photo.mediaId, meta, person.displayName) } : person;
  for (const [id, entry] of index.athletes) index.athletes.set(id, { ...entry, person: withMeta(entry.person) });
  for (const [id, person] of index.trainers) index.trainers.set(id, withMeta(person));
  for (const [id, person] of index.staff) index.staff.set(id, withMeta(person));

  return index;
};

/**
 * Le statistiche di stagione di alcuni atleti, sommate dalle gare della
 * stagione. Solo per chi ha la pubblicazione con le statistiche abilitate.
 */
export const loadSeasonStats = async (
  context: ClubContext,
  athleteIds: string[],
  seasonId: string | null,
): Promise<Map<string, { values: Record<string, number>; matches: number }>> => {
  const ids = athleteIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (!ids.length) return new Map();
  const rows = await (prisma as any).clubEventPlayerStat.findMany({
    where: {
      organization_id: context.organizationId,
      athlete_id: { in: ids },
      event: { organization_id: context.organizationId, kind: "match", ...(seasonId ? { season_id: seasonId } : {}) },
    },
    select: { athlete_id: true, stats: true },
  });
  const out = new Map<string, { values: Record<string, number>; matches: number }>();
  for (const row of rows as any[]) {
    const entry = out.get(row.athlete_id) || { values: {}, matches: 0 };
    entry.matches += 1;
    const stats = row.stats && typeof row.stats === "object" ? (row.stats as Record<string, unknown>) : {};
    for (const definition of context.sport.stats) {
      const value = Number(stats[definition.key]);
      if (!Number.isFinite(value)) continue;
      entry.values[definition.key] =
        definition.aggregate === "max" ? Math.max(entry.values[definition.key] ?? 0, value) : (entry.values[definition.key] ?? 0) + value;
    }
    out.set(row.athlete_id, entry);
  }
  return out;
};

export const statValues = (context: ClubContext, values: Record<string, number>, keys: readonly string[]): PublicStatValue[] => {
  const wanted = keys.length ? keys : context.sport.stats.map((stat) => stat.key);
  return wanted
    .map((key) => context.sport.stats.find((stat) => stat.key === key))
    .filter((stat): stat is NonNullable<typeof stat> => Boolean(stat))
    .filter((stat) => values[stat.key] !== undefined)
    .map((stat) => ({ key: stat.key, label: stat.label, value: values[stat.key], kind: "total" as const }));
};
