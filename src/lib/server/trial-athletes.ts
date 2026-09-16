/**
 * **Le persone in prova** — l'unico scrittore di `trial_athletes` e
 * `trial_attendances` (ADR-0188).
 *
 * ## Cosa e una persona in prova
 *
 * Chi viene ad allenarsi prima di iscriversi. Ha un'identita stabile (`id`,
 * mai il nome: due «Mario Rossi» del 2012 e del 2013 sono due righe), uno
 * storico di presenze e, un giorno, una scheda atleta a cui e legata. **Non e
 * un atleta**: non sta in `athletes`, non conta fra gli attivi, non entra
 * nelle rose, non genera quote, tessere, obblighi documentali, certificati,
 * tutori o accessi. Le tabelle sono due e sono sue: chi legge `athletes` o
 * `club_event_participants` non la incontra — che e il verso giusto in cui
 * sbagliare.
 *
 * ## Le regole
 *
 * 1. **Tenant.** Ogni lettura e ogni scrittura porta `organization_id` del
 *    club attivo; una riga di un altro club non si vede e non si tocca.
 * 2. **Permessi** dal catalogo (`trials.*`): leggere, gestire, presenza,
 *    recapiti, conversione. L'allenatore ha le prime tre **nel proprio
 *    perimetro** (le categorie della sua scheda, come per gli eventi); la
 *    conversione e della segreteria. Un ruolo con perimetro di sede o
 *    categoria (ADR-0103) vede solo le prove di quel perimetro.
 * 3. **Categoria canonica.** La categoria di una prova passa dal vaglio di
 *    ADR-0186: l'identificativo, o un nome che ne nomina una sola; mai
 *    un'etichetta come identita, mai un fantasma.
 * 4. **Nessun merge per nome.** La ricerca propone; la scelta e di chi
 *    registra. Un omonimo si distingue per data di nascita e categoria.
 * 5. **La presenza e una riga per (evento, persona).** Contare, prima e
 *    ultima prova, categorie e sedi frequentate si **derivano** dalle righe
 *    e dagli eventi: nessun contatore a mano.
 * 6. **La conversione conserva.** La riga di prova resta, con `athlete_id`,
 *    `converted_at` e stato `enrolled`; le presenze restano sue. Non nasce
 *    nessun tutore e nessun accesso. La scheda si crea dal registro generico
 *    (`createResource`), cioe dagli stessi vagli di ogni altra scheda.
 */

import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { createResource } from "./resources";
import {
  eventWithinTrainerPerimeter,
  findClubEvent,
  readTrainerEventPerimeter,
  type TrainerEventPerimeter,
} from "./events";
import {
  canonicalizeCategoryReferenceForWrite,
  loadClubCategoryCatalog,
} from "./category-write-guard";
import {
  AUDIT_ACTIONS,
  recordAuditEvent,
  recordPermissionDenied,
} from "./audit";
import { roleHasPermission } from "@/lib/permissions/catalog";
import { loadMembershipTargetIndex } from "./category-write-guard";
import { explainUnresolvedPlacement } from "@/lib/categories/placement";
import { isTrainerAccessRole } from "@/lib/access-roles";
import {
  accessScopeAllows,
  type AccessScopeEntry,
} from "@/lib/roles/access-scope";
import { buildAthleteCategoryProjection } from "@/lib/athlete-category-memberships";
import { buildCategoryDisplayIndex } from "@/lib/categories/display";
import { buildClubCategoryOptions } from "@/lib/category-utils";
import {
  buildCategoryGroups,
  getActiveCategoryGroups,
  normalizeClubSites,
} from "@/lib/club-sites";

export type TrialScope = {
  userId?: string | null;
  activeOrganizationId?: string | null;
  activeRole?: string | null;
  allowedOrganizationIds?: string[];
  accessScopes?: readonly AccessScopeEntry[] | null;
};

type Attore = { userId?: string | null; email?: string | null };

export const TRIAL_STATUSES = ["in_trial", "enrolled", "declined"] as const;
export type TrialStatus = (typeof TRIAL_STATUSES)[number];

export const TRIAL_ATTENDANCE_STATUSES = ["present", "absent"] as const;
export type TrialAttendanceStatus = (typeof TRIAL_ATTENDANCE_STATUSES)[number];

type TrialPermission =
  | "trials.read"
  | "trials.manage"
  | "trials.attendance"
  | "trials.contacts_read"
  | "trials.convert";

const asText = (value: unknown) => String(value ?? "").trim();
const negato = (motivo: string) => new Error(`Accesso negato: ${motivo}`);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ── Guardie ─────────────────────────────────────────────────────────────── */

const requireOrganization = (scope: TrialScope) => {
  const organizationId = asText(scope.activeOrganizationId);
  if (!organizationId) throw negato("nessun club attivo selezionato");
  if (
    Array.isArray(scope.allowedOrganizationIds) &&
    scope.allowedOrganizationIds.length &&
    !scope.allowedOrganizationIds.includes(organizationId)
  ) {
    throw negato("il club attivo non e fra quelli consentiti");
  }
  return organizationId;
};

const assertPermission = async (
  scope: TrialScope,
  permesso: TrialPermission,
  resourceId?: string | null,
) => {
  if (roleHasPermission(scope.activeRole, permesso)) return;
  await recordPermissionDenied({
    scope,
    permission: permesso,
    resource: "trial_athletes",
    resourceId: resourceId || null,
  });
  throw negato(`il ruolo attivo non puo ${permesso}`);
};

export const canReadTrialContacts = (role: string | null | undefined) =>
  roleHasPermission(role, "trials.contacts_read");

/**
 * **Il perimetro dell'allenatore sulle prove.** Le stesse categorie della
 * sua scheda che governano gli eventi (`readTrainerEventPerimeter`): una prova
 * senza categoria e visibile solo a chi l'ha registrata. Chi non e allenatore
 * non ha perimetro qui; il perimetro di sede/categoria di un ruolo ristretto
 * (ADR-0103) si applica a tutti, dopo.
 */
const readTrialPerimeter = async (
  scope: TrialScope,
  organizationId: string,
): Promise<TrainerEventPerimeter | null> => {
  if (!isTrainerAccessRole(scope.activeRole)) return null;
  const perimetro = await readTrainerEventPerimeter(
    organizationId,
    asText(scope.userId),
  );
  return perimetro || { categoryIds: [], categoryTokens: [], groupIds: [] };
};

const trialWithinPerimeter = (
  perimetro: TrainerEventPerimeter | null,
  scope: TrialScope,
  riga: {
    category_id: string | null;
    group_id: string | null;
    site_id: string | null;
    created_by: string | null;
  },
) => {
  if (
    !accessScopeAllows(scope.accessScopes, {
      siteId: riga.site_id,
      categoryId: riga.category_id,
    })
  )
    return false;
  if (!perimetro) return true;
  if (riga.created_by && riga.created_by === asText(scope.userId)) return true;
  if (!riga.category_id && !riga.group_id) return false;
  return eventWithinTrainerPerimeter(
    perimetro,
    {
      category_id: riga.category_id,
      category_ids: riga.category_id ? [riga.category_id] : [],
      group_ids: riga.group_id ? [riga.group_id] : [],
    } as never,
    "lettura",
  );
};

/* ── Normalizzazione ─────────────────────────────────────────────────────── */

const normalizeName = (value: unknown) => asText(value).replace(/\s+/g, " ");

const parseBirthDate = (value: unknown): Date => {
  const raw = asText(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw new Error("La data di nascita e obbligatoria (AAAA-MM-GG)");
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  if (Number.isNaN(date.getTime()))
    throw new Error("La data di nascita non e valida");
  if (date.getTime() > Date.now())
    throw new Error("La data di nascita e nel futuro");
  return date;
};

const parseOptionalText = (value: unknown, max = 500) => {
  const text = asText(value);
  return text ? text.slice(0, max) : null;
};

export type TrialAthleteInput = {
  firstName?: unknown;
  lastName?: unknown;
  birthDate?: unknown;
  categoryId?: unknown;
  categoryName?: unknown;
  groupId?: unknown;
  siteId?: unknown;
  phone?: unknown;
  email?: unknown;
  guardianName?: unknown;
  guardianPhone?: unknown;
  notes?: unknown;
};

const resolveCategoryForWrite = async (
  organizationId: string,
  input: TrialAthleteInput,
) => {
  const categoryId = asText(input.categoryId);
  const categoryName = asText(input.categoryName);
  if (!categoryId && !categoryName)
    return { category_id: null, category_name: null };
  const catalogo = await loadClubCategoryCatalog(organizationId);
  const canonico = canonicalizeCategoryReferenceForWrite(
    { categoryId, categoryName },
    catalogo,
    "Persona in prova",
  );
  return {
    category_id: canonico.categoryId,
    category_name: canonico.categoryName,
  };
};

/**
 * Sede e gruppo sono identificativi del club, non etichette: si accettano
 * solo se esistono nel catalogo del club (o sono vuoti). Il catalogo e lo
 * stesso della scheda atleta — `clubs.club_sites` e `clubs.category_groups`
 * piu il registro — letto con gli stessi normalizzatori (`normalizeClubSites`,
 * `buildCategoryGroups`); un gruppo implicito non e una scelta.
 *
 * **La sede e quella del gruppo** (ADR-0194 §16): con un gruppo indicato la
 * sede si deriva da lui, e una sede diversa e un errore; senza gruppo, una
 * sede su una categoria che ha i suoi gruppi altrove non si scrive — la
 * coppia (categoria, sede) deve essere una squadra del club, come per
 * l'atleta. Una categoria con una squadra sola prende quella.
 */
const resolveSiteAndGroup = async (
  organizationId: string,
  input: TrialAthleteInput,
  categoryId: string | null,
) => {
  const siteId = asText(input.siteId);
  const groupId = asText(input.groupId);
  const { sedi, gruppi } = await loadDisplay(organizationId);
  if (siteId && !sedi.some((sede) => sede.id === siteId)) {
    throw new Error("Persona in prova: la sede indicata non esiste nel club");
  }
  if (groupId) {
    const gruppo = gruppi.find((candidato) => candidato.id === groupId);
    if (!gruppo)
      throw new Error(
        "Persona in prova: il gruppo indicato non esiste nel club",
      );
    if (categoryId && gruppo.categoryId && gruppo.categoryId !== categoryId) {
      throw new Error(
        "Persona in prova: il gruppo indicato appartiene a un'altra categoria",
      );
    }
    if (siteId && gruppo.siteId && gruppo.siteId !== siteId) {
      throw new Error(
        "Persona in prova: la sede indicata non e quella del gruppo scelto",
      );
    }
    return { site_id: gruppo.siteId || siteId || null, group_id: groupId };
  }
  if (!categoryId) return { site_id: siteId || null, group_id: null };

  /*
    Il gruppo resta quello che il chiamante indica: dedurlo qui lo metterebbe
    sotto il perimetro dei gruppi dell'allenatore (`eventWithinTrainerPerimeter`,
    che in scrittura fallisce chiuso per chi non ha gruppi assegnati). La
    sede invece si deriva: una squadra sola, la sua sede.
  */
  const index = await loadMembershipTargetIndex(organizationId);
  const squadre = index.forCategory(categoryId);
  if (!siteId) {
    if (squadre.length === 1 && !squadre[0].implicit) {
      return { site_id: squadre[0].siteId, group_id: null };
    }
    return { site_id: null, group_id: null };
  }
  const collocazione = index.place({ categoryId, siteId });
  if (collocazione.status === "resolved") {
    return { site_id: collocazione.target.siteId, group_id: null };
  }
  if (collocazione.status === "unresolved" && collocazione.reason !== "unknown_category") {
    throw new Error(`Persona in prova: ${explainUnresolvedPlacement(collocazione)}`);
  }
  return { site_id: siteId || null, group_id: null };
};

/* ── Serializzazione ─────────────────────────────────────────────────────── */

const toDateOnly = (value: Date | null | undefined) =>
  value ? value.toISOString().slice(0, 10) : null;
const toIso = (value: Date | null | undefined) =>
  value instanceof Date ? value.toISOString() : null;

type TrialRow = {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  birth_date: Date;
  status: string;
  category_id: string | null;
  category_name: string | null;
  group_id: string | null;
  site_id: string | null;
  phone: string | null;
  email: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  notes: string | null;
  athlete_id: string | null;
  converted_at: Date | null;
  declined_at: Date | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

export type TrialAttendanceView = {
  id: string;
  eventId: string;
  status: string;
  notes: string | null;
  recordedAt: string;
  event: {
    id: string;
    kind: string;
    title: string | null;
    startsAt: string;
    endsAt: string | null;
    seasonId: string | null;
    siteId: string | null;
    categoryId: string | null;
    categoryName: string | null;
    categoryLabel: string | null;
    groupIds: string[];
    location: string | null;
    status: string;
  };
};

export type TrialAthleteView = {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  birthDate: string;
  status: TrialStatus;
  categoryId: string | null;
  categoryName: string | null;
  /** L'etichetta canonica (ADR-0185), scritta dal server. */
  categoryLabel: string | null;
  groupId: string | null;
  siteId: string | null;
  siteName: string | null;
  /** Solo per chi ha `trials.contacts_read`. */
  phone?: string | null;
  email?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  notes: string | null;
  athleteId: string | null;
  convertedAt: string | null;
  declinedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Derivati dalle presenze: nessun contatore a mano. */
  trialsCount: number;
  firstTrialAt: string | null;
  lastTrialAt: string | null;
};

/**
 * L'indice canonico delle etichette (ADR-0185): lo stesso catalogo, gli
 * stessi gruppi e le stesse sedi con cui la scheda atleta e la famiglia
 * leggono una categoria. Nessuna etichetta composta qui.
 */
const loadDisplay = async (organizationId: string) => {
  const [club, items] = await Promise.all([
    prisma.club.findUnique({
      where: { id: organizationId },
      select: { categories: true, club_sites: true, category_groups: true },
    }),
    prisma.clubResourceItem.findMany({
      where: {
        organization_id: organizationId,
        resource_type: { in: ["categories", "club_sites"] },
      },
      select: { id: true, resource_type: true, payload: true, name: true },
    }),
  ]);
  const payloadOf = (item: {
    payload: unknown;
    id: string;
    name: string | null;
  }) => {
    const payload =
      item.payload &&
      typeof item.payload === "object" &&
      !Array.isArray(item.payload)
        ? (item.payload as Record<string, unknown>)
        : {};
    return {
      ...payload,
      id: asText(payload.id) || item.id,
      name: asText(payload.name) || asText(item.name),
    };
  };
  const resourceCategories = items
    .filter((item) => item.resource_type === "categories")
    .map(payloadOf);
  const resourceSites = items
    .filter((item) => item.resource_type === "club_sites")
    .map(payloadOf);
  const catalogo = buildClubCategoryOptions({
    clubCategories: Array.isArray(club?.categories)
      ? (club!.categories as unknown[])
      : [],
    resourceCategories,
  });
  const sedi = normalizeClubSites([
    ...(Array.isArray(club?.club_sites) ? (club!.club_sites as unknown[]) : []),
    ...resourceSites,
  ]);
  const tuttiIGruppi = buildCategoryGroups({
    categories: catalogo,
    sites: sedi,
    groups: club?.category_groups,
  });
  const display = buildCategoryDisplayIndex({
    categories: catalogo,
    groups: tuttiIGruppi,
    sites: sedi,
  });
  const siteNames = new Map(sedi.map((sede) => [sede.id, sede.name]));
  const gruppi = getActiveCategoryGroups(tuttiIGruppi).filter(
    (gruppo) => !gruppo.implicit,
  );
  return { display, siteNames, sedi, gruppi };
};

type Display = Awaited<ReturnType<typeof loadDisplay>>;

const serializeTrial = (
  riga: TrialRow,
  presenze: { count: number; first: Date | null; last: Date | null },
  display: Display,
  conRecapiti: boolean,
): TrialAthleteView => {
  const categoryLabel = riga.category_id
    ? display.display.label({
        categoryId: riga.category_id,
        categoryName: riga.category_name,
      })
    : null;
  const view: TrialAthleteView = {
    id: riga.id,
    firstName: riga.first_name,
    lastName: riga.last_name,
    name: `${riga.first_name} ${riga.last_name}`.trim(),
    birthDate: toDateOnly(riga.birth_date) || "",
    status: (TRIAL_STATUSES.includes(riga.status as TrialStatus)
      ? riga.status
      : "in_trial") as TrialStatus,
    categoryId: riga.category_id,
    categoryName: riga.category_name,
    categoryLabel,
    groupId: riga.group_id,
    siteId: riga.site_id,
    siteName: riga.site_id ? display.siteNames.get(riga.site_id) || null : null,
    notes: riga.notes,
    athleteId: riga.athlete_id,
    convertedAt: toIso(riga.converted_at),
    declinedAt: toIso(riga.declined_at),
    createdAt: toIso(riga.created_at) || "",
    updatedAt: toIso(riga.updated_at) || "",
    trialsCount: presenze.count,
    firstTrialAt: presenze.first ? presenze.first.toISOString() : null,
    lastTrialAt: presenze.last ? presenze.last.toISOString() : null,
  };
  if (conRecapiti) {
    view.phone = riga.phone;
    view.email = riga.email;
    view.guardianName = riga.guardian_name;
    view.guardianPhone = riga.guardian_phone;
  }
  return view;
};

/**
 * Conteggio, prima e ultima prova per ogni persona, **dagli eventi**: si
 * contano le presenze `present`, e la data e quella dell'evento, non quella
 * in cui qualcuno ha premuto Salva.
 */
const loadTrialStats = async (
  organizationId: string,
  trialIds: readonly string[],
) => {
  const stats = new Map<
    string,
    { count: number; first: Date | null; last: Date | null }
  >();
  for (const id of trialIds)
    stats.set(id, { count: 0, first: null, last: null });
  if (!trialIds.length) return stats;
  const righe = await prisma.trialAttendance.findMany({
    where: {
      organization_id: organizationId,
      trial_athlete_id: { in: [...trialIds] },
      status: "present",
    },
    select: { trial_athlete_id: true, event: { select: { starts_at: true } } },
  });
  for (const riga of righe) {
    const voce = stats.get(riga.trial_athlete_id);
    if (!voce) continue;
    voce.count += 1;
    const quando = riga.event.starts_at;
    if (!voce.first || quando < voce.first) voce.first = quando;
    if (!voce.last || quando > voce.last) voce.last = quando;
  }
  return stats;
};

/* ── Lettura ─────────────────────────────────────────────────────────────── */

export type ListTrialsFilters = {
  status?: string | null;
  q?: string | null;
  categoryId?: string | null;
  /** Solo le persone pertinenti a un evento (categoria dell'evento) oltre a chi vi ha gia una presenza. */
  eventId?: string | null;
};

export const listTrialAthletes = async (
  scope: TrialScope,
  filters: ListTrialsFilters = {},
) => {
  await assertPermission(scope, "trials.read");
  const organizationId = requireOrganization(scope);
  const perimetro = await readTrialPerimeter(scope, organizationId);

  const status = asText(filters.status);
  const q = normalizeName(filters.q).toLowerCase();
  const categoryId = asText(filters.categoryId);

  const righe = await prisma.trialAthlete.findMany({
    where: {
      organization_id: organizationId,
      ...(status && TRIAL_STATUSES.includes(status as TrialStatus)
        ? { status }
        : {}),
      ...(categoryId ? { category_id: categoryId } : {}),
    },
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
  });

  const visibili = righe.filter((riga) =>
    trialWithinPerimeter(perimetro, scope, riga),
  );
  const recapiti = canReadTrialContacts(scope.activeRole);
  /*
    La ricerca tasta i recapiti **solo** per chi puo leggerli: altrimenti
    `?q=333` risponderebbe «chi ha questo numero» a un ruolo a cui la
    risposta toglie il numero (revisione ostile, M4).
  */
  const cercate = q
    ? visibili.filter((riga) => {
        const identita = `${riga.first_name} ${riga.last_name} ${riga.last_name} ${riga.first_name} ${toDateOnly(riga.birth_date)}`;
        const testo =
          `${identita} ${recapiti ? `${riga.phone || ""} ${riga.email || ""}` : ""}`.toLowerCase();
        return q.split(" ").every((parola) => testo.includes(parola));
      })
    : visibili;

  const [display, stats] = await Promise.all([
    loadDisplay(organizationId),
    loadTrialStats(
      organizationId,
      cercate.map((riga) => riga.id),
    ),
  ]);
  return cercate.map((riga) =>
    serializeTrial(riga, stats.get(riga.id)!, display, recapiti),
  );
};

const findTrialRow = async (
  scope: TrialScope,
  organizationId: string,
  id: string,
  permesso: TrialPermission,
) => {
  const trialId = asText(id);
  const riga = UUID.test(trialId)
    ? await prisma.trialAthlete.findFirst({
        where: { id: trialId, organization_id: organizationId },
      })
    : null;
  if (!riga) throw new Error("Persona in prova non trovata");
  const perimetro = await readTrialPerimeter(scope, organizationId);
  if (!trialWithinPerimeter(perimetro, scope, riga)) {
    await recordPermissionDenied({
      scope,
      permission: permesso,
      resource: "trial_athletes",
      resourceId: riga.id,
    });
    throw negato("la persona in prova e fuori dal tuo perimetro");
  }
  return riga;
};

const serializeAttendances = (
  righe: Array<{
    id: string;
    event_id: string;
    status: string;
    notes: string | null;
    recorded_at: Date;
    event: any;
  }>,
  display: Display,
): TrialAttendanceView[] =>
  righe
    .slice()
    .sort((a, b) => b.event.starts_at.getTime() - a.event.starts_at.getTime())
    .map((riga) => ({
      id: riga.id,
      eventId: riga.event_id,
      status: riga.status,
      notes: riga.notes,
      recordedAt: toIso(riga.recorded_at) || "",
      event: {
        id: riga.event.id,
        kind: riga.event.kind,
        title: riga.event.title,
        startsAt: toIso(riga.event.starts_at) || "",
        endsAt: toIso(riga.event.ends_at),
        seasonId: riga.event.season_id,
        siteId: riga.event.site_id,
        categoryId: riga.event.category_id,
        categoryName: riga.event.category_name,
        categoryLabel: riga.event.category_id
          ? display.display.label({
              categoryId: riga.event.category_id,
              categoryName: riga.event.category_name,
            })
          : riga.event.category_name || null,
        groupIds: Array.isArray(riga.event.group_ids)
          ? (riga.event.group_ids as unknown[]).map(asText).filter(Boolean)
          : [],
        location: riga.event.location,
        status: riga.event.status,
      },
    }));

export const readTrialAthlete = async (scope: TrialScope, id: string) => {
  await assertPermission(scope, "trials.read", id);
  const organizationId = requireOrganization(scope);
  const riga = await findTrialRow(scope, organizationId, id, "trials.read");
  const [display, stats, presenze] = await Promise.all([
    loadDisplay(organizationId),
    loadTrialStats(organizationId, [riga.id]),
    prisma.trialAttendance.findMany({
      where: { organization_id: organizationId, trial_athlete_id: riga.id },
      include: { event: true },
    }),
  ]);
  return {
    trial: serializeTrial(
      riga,
      stats.get(riga.id)!,
      display,
      canReadTrialContacts(scope.activeRole),
    ),
    attendances: serializeAttendances(presenze, display),
  };
};

/**
 * **Le possibili corrispondenze, senza fondere nessuno.** Cognome e nome
 * (in qualunque ordine) e, se data, la data di nascita: chi registra sceglie.
 */
export const searchTrialAthletes = async (
  scope: TrialScope,
  query: { q?: string | null; birthDate?: string | null },
) => {
  const elenco = await listTrialAthletes(scope, {
    q: query.q,
    status: "in_trial",
  });
  const birthDate = asText(query.birthDate);
  if (!birthDate) return elenco;
  return elenco.filter((voce) => voce.birthDate === birthDate);
};

/* ── Scrittura ───────────────────────────────────────────────────────────── */

export const createTrialAthlete = async (
  scope: TrialScope,
  input: TrialAthleteInput,
  attore: Attore = {},
) => {
  await assertPermission(scope, "trials.manage");
  const organizationId = requireOrganization(scope);

  const firstName = normalizeName(input.firstName);
  const lastName = normalizeName(input.lastName);
  if (!firstName || !lastName)
    throw new Error("Nome e cognome sono obbligatori");
  const birthDate = parseBirthDate(input.birthDate);
  const categoria = await resolveCategoryForWrite(organizationId, input);
  const collocazione = await resolveSiteAndGroup(
    organizationId,
    input,
    categoria.category_id,
  );

  /*
    L'allenatore registra dentro il proprio perimetro: una prova in una
    categoria che non e sua e un atto su una squadra che non e sua.
  */
  const perimetro = await readTrialPerimeter(scope, organizationId);
  await assertCollocazioneNelPerimetro(
    scope,
    perimetro,
    categoria.category_id,
    collocazione.group_id,
    collocazione.site_id,
    null,
  );

  /* I recapiti li scrive solo chi puo leggerli, in creazione come in modifica (revisione ostile, L10). */
  const portaRecapiti = [
    input.phone,
    input.email,
    input.guardianName,
    input.guardianPhone,
  ].some((v) => asText(v));
  if (portaRecapiti && !canReadTrialContacts(scope.activeRole)) {
    await assertPermission(scope, "trials.contacts_read");
  }

  const riga = await prisma.trialAthlete.create({
    data: {
      organization_id: organizationId,
      first_name: firstName,
      last_name: lastName,
      birth_date: birthDate,
      status: "in_trial",
      ...categoria,
      ...collocazione,
      phone: parseOptionalText(input.phone, 40),
      email: parseOptionalText(input.email, 200),
      guardian_name: parseOptionalText(input.guardianName, 200),
      guardian_phone: parseOptionalText(input.guardianPhone, 40),
      notes: parseOptionalText(input.notes, 2000),
      created_by: UUID.test(asText(attore.userId || scope.userId))
        ? asText(attore.userId || scope.userId)
        : null,
    },
  });

  await recordAuditEvent({
    action: AUDIT_ACTIONS.trialAthleteCreated,
    actorUserId: attore.userId || scope.userId || null,
    actorEmail: attore.email || null,
    actorRole: scope.activeRole || null,
    organizationId,
    resource: "trial_athletes",
    resourceId: riga.id,
    metadata: { categoryId: riga.category_id, siteId: riga.site_id },
  });

  const [display, stats] = await Promise.all([
    loadDisplay(organizationId),
    loadTrialStats(organizationId, [riga.id]),
  ]);
  return serializeTrial(
    riga,
    stats.get(riga.id)!,
    display,
    canReadTrialContacts(scope.activeRole),
  );
};

/**
 * **Dove si colloca una persona in prova e un atto sul perimetro** — in
 * creazione e in modifica allo stesso modo (revisione ostile, H3: la modifica
 * cambiava categoria senza chiederlo al perimetro, e una prova registrata
 * nell'Under 15 finiva nell'Under 13 di un altro allenatore).
 *
 * Per l'allenatore: una prova **senza** categoria non e sua — non si saprebbe
 * a quale squadra appartiene, e nessun perimetro la coprirebbe; un gruppo si
 * valuta insieme alla categoria. Per tutti: il perimetro di sede e categoria
 * di ADR-0103.
 */
const assertCollocazioneNelPerimetro = async (
  scope: TrialScope,
  perimetro: Awaited<ReturnType<typeof readTrialPerimeter>>,
  categoryId: string | null,
  groupId: string | null,
  siteId: string | null,
  resourceId: string | null,
) => {
  if (perimetro) {
    if (!categoryId) {
      await recordPermissionDenied({
        scope,
        permission: "trials.manage",
        resource: "trial_athletes",
        resourceId: resourceId || undefined,
      });
      throw negato(
        "una persona in prova registrata dall'allenatore ha sempre una categoria del suo perimetro",
      );
    }
    const dentro = eventWithinTrainerPerimeter(
      perimetro,
      {
        category_id: categoryId,
        category_ids: [categoryId],
        group_ids: groupId ? [groupId] : [],
      } as never,
      "scrittura",
    );
    if (!dentro) {
      await recordPermissionDenied({
        scope,
        permission: "trials.manage",
        resource: "trial_athletes",
        resourceId: resourceId || undefined,
      });
      throw negato("la categoria indicata e fuori dal tuo perimetro");
    }
  }
  if (!accessScopeAllows(scope.accessScopes, { siteId, categoryId })) {
    await recordPermissionDenied({
      scope,
      permission: "trials.manage",
      resource: "trial_athletes",
      resourceId: resourceId || undefined,
    });
    throw negato("la categoria o la sede indicata e fuori dal tuo perimetro");
  }
};

export const updateTrialAthlete = async (
  scope: TrialScope,
  id: string,
  input: TrialAthleteInput,
  attore: Attore = {},
) => {
  await assertPermission(scope, "trials.manage", id);
  const organizationId = requireOrganization(scope);
  const corrente = await findTrialRow(
    scope,
    organizationId,
    id,
    "trials.manage",
  );

  const data: Record<string, unknown> = {};
  if (input.firstName !== undefined) {
    const v = normalizeName(input.firstName);
    if (!v) throw new Error("Il nome e obbligatorio");
    data.first_name = v;
  }
  if (input.lastName !== undefined) {
    const v = normalizeName(input.lastName);
    if (!v) throw new Error("Il cognome e obbligatorio");
    data.last_name = v;
  }
  if (input.birthDate !== undefined)
    data.birth_date = parseBirthDate(input.birthDate);
  if (input.categoryId !== undefined || input.categoryName !== undefined) {
    Object.assign(data, await resolveCategoryForWrite(organizationId, input));
  }
  const cambiaCategoria =
    "category_id" in data && data.category_id !== corrente.category_id;
  /*
    Il perimetro sulla categoria si controlla **prima** di risolvere sede e
    gruppo: un atto fuori dal recinto e un diniego (403, con la sua riga),
    non un errore di collocazione (400) che direbbe a chi non puo quale
    squadra esiste.
  */
  if (cambiaCategoria) {
    const perimetro = await readTrialPerimeter(scope, organizationId);
    await assertCollocazioneNelPerimetro(
      scope,
      perimetro,
      data.category_id as string | null,
      input.groupId === undefined ? corrente.group_id : asText(input.groupId) || null,
      input.siteId === undefined ? corrente.site_id : asText(input.siteId) || null,
      corrente.id,
    );
  }
  if (
    input.siteId !== undefined ||
    input.groupId !== undefined ||
    cambiaCategoria
  ) {
    /*
      `null` azzera, `undefined` conserva (revisione ostile, L7); e un cambio
      di categoria rivaluta il gruppo, perche un gruppo appartiene a una
      categoria e non la segue.
    */
    const categoryId =
      (data.category_id as string | null | undefined) ?? corrente.category_id;
    Object.assign(
      data,
      await resolveSiteAndGroup(
        organizationId,
        {
          siteId:
            input.siteId === undefined
              ? (corrente.site_id ?? "")
              : (input.siteId ?? ""),
          groupId:
            input.groupId === undefined
              ? (corrente.group_id ?? "")
              : (input.groupId ?? ""),
        },
        categoryId ?? null,
      ),
    );
  }
  if (input.phone !== undefined)
    data.phone = parseOptionalText(input.phone, 40);
  if (input.email !== undefined)
    data.email = parseOptionalText(input.email, 200);
  if (input.guardianName !== undefined)
    data.guardian_name = parseOptionalText(input.guardianName, 200);
  if (input.guardianPhone !== undefined)
    data.guardian_phone = parseOptionalText(input.guardianPhone, 40);
  if (input.notes !== undefined)
    data.notes = parseOptionalText(input.notes, 2000);

  /* I recapiti li scrive solo chi puo leggerli: altrimenti un allenatore li sovrascriverebbe al buio. */
  const toccaRecapiti = [
    "phone",
    "email",
    "guardian_name",
    "guardian_phone",
  ].some((k) => k in data);
  if (toccaRecapiti && !canReadTrialContacts(scope.activeRole)) {
    await assertPermission(scope, "trials.contacts_read", id);
  }

  const nuovaCategoria =
    "category_id" in data
      ? (data.category_id as string | null)
      : corrente.category_id;
  const nuovaSede =
    "site_id" in data ? (data.site_id as string | null) : corrente.site_id;
  const nuovoGruppo =
    "group_id" in data ? (data.group_id as string | null) : corrente.group_id;
  if (cambiaCategoria || "site_id" in data || "group_id" in data) {
    const perimetro = await readTrialPerimeter(scope, organizationId);
    await assertCollocazioneNelPerimetro(
      scope,
      perimetro,
      nuovaCategoria,
      nuovoGruppo,
      nuovaSede,
      corrente.id,
    );
  }

  /* Da dove: letto prima della scrittura, non dopo. */
  const prima = { category_id: corrente.category_id, site_id: corrente.site_id };
  const riga = Object.keys(data).length
    ? await prisma.trialAthlete.update({
        where: { id: corrente.id },
        data: data as never,
      })
    : corrente;

  if (Object.keys(data).length) {
    await recordAuditEvent({
      action: AUDIT_ACTIONS.trialAthleteUpdated,
      actorUserId: attore.userId || scope.userId || null,
      actorEmail: attore.email || null,
      actorRole: scope.activeRole || null,
      organizationId,
      resource: "trial_athletes",
      resourceId: riga.id,
      metadata: {
        campi: Object.keys(data),
        ...(cambiaCategoria
          ? { categoryId: { da: prima.category_id, a: riga.category_id } }
          : {}),
        ...("site_id" in data
          ? { siteId: { da: prima.site_id, a: riga.site_id } }
          : {}),
      },
    });
  }

  const [display, stats] = await Promise.all([
    loadDisplay(organizationId),
    loadTrialStats(organizationId, [riga.id]),
  ]);
  return serializeTrial(
    riga,
    stats.get(riga.id)!,
    display,
    canReadTrialContacts(scope.activeRole),
  );
};

/**
 * Cambio di stato fra `in_trial` e `declined`. `enrolled` non si imposta: lo
 * scrive la conversione, che e l'unico modo di arrivarci.
 */
export const setTrialAthleteStatus = async (
  scope: TrialScope,
  id: string,
  status: unknown,
  attore: Attore = {},
) => {
  await assertPermission(scope, "trials.manage", id);
  const organizationId = requireOrganization(scope);
  const corrente = await findTrialRow(
    scope,
    organizationId,
    id,
    "trials.manage",
  );
  const nuovo = asText(status);
  if (nuovo !== "in_trial" && nuovo !== "declined") {
    throw new Error(
      "Stato non ammesso: si puo segnare «in prova» o «non prosegue»; «iscritto» lo scrive la conversione",
    );
  }
  if (corrente.status === "enrolled")
    throw new Error("Una persona gia iscritta non torna in prova");
  if (corrente.status === nuovo) {
    const [display, stats] = await Promise.all([
      loadDisplay(organizationId),
      loadTrialStats(organizationId, [corrente.id]),
    ]);
    return serializeTrial(
      corrente,
      stats.get(corrente.id)!,
      display,
      canReadTrialContacts(scope.activeRole),
    );
  }
  const riga = await prisma.trialAthlete.update({
    where: { id: corrente.id },
    data: {
      status: nuovo,
      declined_at: nuovo === "declined" ? new Date() : null,
    },
  });
  await recordAuditEvent({
    action: AUDIT_ACTIONS.trialAthleteStatusChanged,
    actorUserId: attore.userId || scope.userId || null,
    actorEmail: attore.email || null,
    actorRole: scope.activeRole || null,
    organizationId,
    resource: "trial_athletes",
    resourceId: riga.id,
    metadata: { da: corrente.status, a: nuovo },
  });
  const [display, stats] = await Promise.all([
    loadDisplay(organizationId),
    loadTrialStats(organizationId, [riga.id]),
  ]);
  return serializeTrial(
    riga,
    stats.get(riga.id)!,
    display,
    canReadTrialContacts(scope.activeRole),
  );
};

/* ── Presenze ────────────────────────────────────────────────────────────── */

export type TrialAttendanceInput = {
  trialAthleteId: string;
  status?: unknown;
  notes?: unknown;
};

const loadEventForTrials = async (
  scope: TrialScope,
  organizationId: string,
  eventId: string,
  permesso: TrialPermission,
) => {
  const event = await findClubEvent(organizationId, eventId);
  if (!event) throw new Error("Evento non trovato");
  if (event.organization_id !== organizationId)
    throw negato("l'evento non appartiene al club attivo");
  const perimetro = await readTrialPerimeter(scope, organizationId);
  if (
    perimetro &&
    !eventWithinTrainerPerimeter(
      perimetro,
      event as never,
      permesso === "trials.read" ? "lettura" : "scrittura",
    )
  ) {
    await recordPermissionDenied({
      scope,
      permission: permesso,
      resource: "trial_attendances",
      resourceId: event.id,
    });
    throw negato("l'evento e fuori dal tuo perimetro");
  }
  if (
    !accessScopeAllows(scope.accessScopes, {
      siteId: event.site_id,
      categoryId: event.category_id,
    })
  ) {
    await recordPermissionDenied({
      scope,
      permission: permesso,
      resource: "trial_attendances",
      resourceId: event.id,
    });
    throw negato("l'evento e fuori dal tuo perimetro");
  }
  return event;
};

/**
 * Le presenze di prova di un evento **e** le persone in prova pertinenti
 * (stessa categoria dell'evento, ancora in prova) che non ne hanno ancora una:
 * cio che il registro presenze mostra sotto gli atleti.
 */
export const listEventTrialAttendance = async (
  scope: TrialScope,
  eventId: string,
) => {
  await assertPermission(scope, "trials.read", eventId);
  const organizationId = requireOrganization(scope);
  const event = await loadEventForTrials(
    scope,
    organizationId,
    eventId,
    "trials.read",
  );

  const [presenze, display] = await Promise.all([
    prisma.trialAttendance.findMany({
      where: { organization_id: organizationId, event_id: event.id },
      include: { trial_athlete: true },
    }),
    loadDisplay(organizationId),
  ]);
  const registrati = new Set(presenze.map((riga) => riga.trial_athlete_id));
  const categorieEvento = new Set(
    [
      ...(event.category_id ? [event.category_id] : []),
      ...(Array.isArray(event.category_ids) ? event.category_ids : []),
    ]
      .map(asText)
      .filter(Boolean),
  );

  const pertinenti = categorieEvento.size
    ? await prisma.trialAthlete.findMany({
        where: {
          organization_id: organizationId,
          status: "in_trial",
          category_id: { in: [...categorieEvento] },
        },
        orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
      })
    : [];
  const perimetro = await readTrialPerimeter(scope, organizationId);
  const tutti = [
    ...presenze.map((riga) => riga.trial_athlete),
    ...pertinenti.filter((riga) => !registrati.has(riga.id)),
  ].filter((riga) => trialWithinPerimeter(perimetro, scope, riga));
  const stats = await loadTrialStats(
    organizationId,
    tutti.map((riga) => riga.id),
  );
  const recapiti = canReadTrialContacts(scope.activeRole);
  const presenzaPer = new Map(
    presenze.map((riga) => [riga.trial_athlete_id, riga]),
  );

  return tutti.map((riga) => {
    const presenza = presenzaPer.get(riga.id) || null;
    return {
      trial: serializeTrial(riga, stats.get(riga.id)!, display, recapiti),
      attendance: presenza
        ? {
            id: presenza.id,
            status: presenza.status,
            notes: presenza.notes,
            recordedAt: toIso(presenza.recorded_at) || "",
          }
        : null,
    };
  });
};

/**
 * L'appello delle persone in prova: una riga per (evento, persona), scritta
 * o riscritta. Solo persone **in prova** del club, solo eventi aperti, solo
 * dentro il perimetro. Nessun nominativo libero: si passa un identificativo,
 * e dev'essere di una riga che esiste.
 */
export const saveEventTrialAttendance = async (
  scope: TrialScope,
  eventId: string,
  entries: readonly TrialAttendanceInput[],
  attore: Attore = {},
) => {
  await assertPermission(scope, "trials.attendance", eventId);
  const organizationId = requireOrganization(scope);
  const event = await loadEventForTrials(
    scope,
    organizationId,
    eventId,
    "trials.attendance",
  );
  if (event.status === "cancelled")
    throw new Error("L'evento e annullato: non si registrano presenze");

  /*
    Una voce con `status: null` **toglie** la presenza (revisione ostile, M5):
    chi segna «presente» per sbaglio e torna a «da segnare» deve poter
    salvare, e il server non puo indovinarlo dall'assenza della voce — l'elenco
    che arriva non e mai «tutto», perche chi salva vede solo il proprio
    perimetro.
  */
  const normalizzate = entries
    .map((entry) => {
      const trialId = asText(entry.trialAthleteId);
      if (entry.status === null) {
        return { trialId, status: null, notes: null };
      }
      const status = asText(entry.status || "present").toLowerCase();
      if (
        !TRIAL_ATTENDANCE_STATUSES.includes(status as TrialAttendanceStatus)
      ) {
        throw new Error(
          `Stato di presenza non ammesso: «${status}». Sono ammessi ${TRIAL_ATTENDANCE_STATUSES.join(", ")}`,
        );
      }
      return {
        trialId,
        status: status as TrialAttendanceStatus,
        notes: parseOptionalText(entry.notes, 500),
      };
    })
    .filter((entry) => UUID.test(entry.trialId));

  if (!normalizzate.length) return listEventTrialAttendance(scope, eventId);

  const ids = Array.from(new Set(normalizzate.map((entry) => entry.trialId)));
  const righe = await prisma.trialAthlete.findMany({
    where: { organization_id: organizationId, id: { in: ids } },
  });
  const perimetro = await readTrialPerimeter(scope, organizationId);
  const ammesse = new Map(
    righe
      .filter((riga) => trialWithinPerimeter(perimetro, scope, riga))
      .map((riga) => [riga.id, riga]),
  );
  const fuori = ids.filter((id) => !ammesse.has(id));
  if (fuori.length) {
    await recordPermissionDenied({
      scope,
      permission: "trials.attendance",
      resource: "trial_attendances",
      resourceId: fuori[0],
      metadata: { fuori: fuori.length },
    });
    throw negato(
      "una o piu persone in prova non sono del club o sono fuori dal tuo perimetro",
    );
  }
  const nonInProva = normalizzate
    .filter((entry) => entry.status !== null)
    .map((entry) => entry.trialId)
    .filter((id) => ammesse.get(id)!.status !== "in_trial");
  if (nonInProva.length)
    throw new Error("Si registra la presenza solo di chi e ancora in prova");

  const recordedBy = UUID.test(asText(attore.userId || scope.userId))
    ? asText(attore.userId || scope.userId)
    : null;
  await prisma.$transaction(async (tx) => {
    for (const entry of normalizzate) {
      if (entry.status === null) {
        await tx.trialAttendance.deleteMany({
          where: {
            organization_id: organizationId,
            event_id: event.id,
            trial_athlete_id: entry.trialId,
          },
        });
        continue;
      }
      await tx.trialAttendance.upsert({
        where: {
          organization_id_event_id_trial_athlete_id: {
            organization_id: organizationId,
            event_id: event.id,
            trial_athlete_id: entry.trialId,
          },
        },
        update: {
          status: entry.status,
          notes: entry.notes,
          recorded_by: recordedBy,
          recorded_at: new Date(),
        },
        create: {
          organization_id: organizationId,
          event_id: event.id,
          trial_athlete_id: entry.trialId,
          status: entry.status,
          notes: entry.notes,
          recorded_by: recordedBy,
        },
      });
    }
  });

  await recordAuditEvent({
    action: AUDIT_ACTIONS.trialAttendanceRecorded,
    actorUserId: attore.userId || scope.userId || null,
    actorEmail: attore.email || null,
    actorRole: scope.activeRole || null,
    organizationId,
    resource: "trial_attendances",
    resourceId: event.id,
    metadata: {
      registrate: normalizzate.filter((entry) => entry.status !== null).length,
      tolte: normalizzate.filter((entry) => entry.status === null).length,
      voci: normalizzate.map((entry) => ({
        trialAthleteId: entry.trialId,
        status: entry.status,
      })),
    },
  });

  return listEventTrialAttendance(scope, eventId);
};

/* ── Conversione ─────────────────────────────────────────────────────────── */

const normalizeForMatch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export type AthleteCandidate = {
  id: string;
  name: string;
  birthDate: string | null;
  status: string;
  categoryLabel: string | null;
  /** `exact`: stesso nome e stessa data; `name`: stesso nome. */
  match: "exact" | "name";
};

/**
 * **Le schede atleta che potrebbero gia essere questa persona.** Per nome e
 * cognome (normalizzati, in qualunque ordine), con la data di nascita che
 * distingue la corrispondenza esatta. Si propone; non si fonde.
 */
export const findAthleteCandidates = async (
  scope: TrialScope,
  trialId: string,
): Promise<AthleteCandidate[]> => {
  await assertPermission(scope, "trials.convert", trialId);
  const organizationId = requireOrganization(scope);
  const trial = await findTrialRow(
    scope,
    organizationId,
    trialId,
    "trials.convert",
  );

  const nome = normalizeForMatch(trial.first_name);
  const cognome = normalizeForMatch(trial.last_name);
  const atleti = await prisma.athlete.findMany({
    where: {
      organization_id: organizationId,
      anonymized_at: null,
      OR: [
        {
          last_name: {
            contains: trial.last_name.split(" ")[0],
            mode: "insensitive",
          },
        },
        {
          first_name: {
            contains: trial.last_name.split(" ")[0],
            mode: "insensitive",
          },
        },
      ],
    },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      birth_date: true,
      status: true,
      category_id: true,
      category_name: true,
    },
    take: 50,
  });
  const display = await loadDisplay(organizationId);
  const nascita = toDateOnly(trial.birth_date);
  return atleti
    .filter((atleta) => {
      const a = normalizeForMatch(atleta.first_name);
      const b = normalizeForMatch(atleta.last_name);
      return (a === nome && b === cognome) || (a === cognome && b === nome);
    })
    .map((atleta) => ({
      id: atleta.id,
      name: `${atleta.first_name} ${atleta.last_name}`.trim(),
      birthDate: toDateOnly(atleta.birth_date),
      status: atleta.status,
      categoryLabel: atleta.category_id
        ? display.display.label({
            categoryId: atleta.category_id,
            categoryName: atleta.category_name,
          })
        : null,
      match: (toDateOnly(atleta.birth_date) === nascita
        ? "exact"
        : "name") as AthleteCandidate["match"],
    }))
    .sort((a, b) =>
      a.match === b.match
        ? a.name.localeCompare(b.name)
        : a.match === "exact"
          ? -1
          : 1,
    );
};

export type ConvertTrialInput = {
  /** Collega una scheda esistente del club. */
  athleteId?: unknown;
  /** Oppure crea la scheda: la categoria della prova diventa la primaria, se c'e. */
  create?: {
    status?: unknown;
    categoryId?: unknown;
    categoryName?: unknown;
    siteId?: unknown;
  } | null;
};

/**
 * **La conversione: crea o collega, e conserva.** La scheda nasce dal registro
 * generico (`createResource`, gli stessi vagli di ogni scheda: categoria
 * canonica, proiezione, perimetro), o e una scheda esistente del club scelta
 * da chi converte. La riga di prova resta, con la scheda collegata e la data:
 * «ha fatto N prove prima di iscriversi» si legge da qui. Nessun tutore e
 * nessun accesso nascono da questo atto.
 */
export const convertTrialAthlete = async (
  scope: TrialScope,
  trialId: string,
  input: ConvertTrialInput,
  attore: Attore = {},
) => {
  await assertPermission(scope, "trials.convert", trialId);
  const organizationId = requireOrganization(scope);
  const trial = await findTrialRow(
    scope,
    organizationId,
    trialId,
    "trials.convert",
  );
  const richiestaScheda = asText(input.athleteId);
  if (trial.status === "enrolled" && trial.athlete_id) {
    /*
      Gia convertita (revisione ostile A-F3): ripetere la conversione verso la
      stessa scheda — o senza indicarne una — e idempotente e restituisce cio
      che c'e; verso una scheda diversa e un errore.
    */
    if (richiestaScheda && richiestaScheda !== trial.athlete_id)
      throw new Error("La persona e gia iscritta con un'altra scheda");
    if (!richiestaScheda && input.create) throw new Error("La persona e gia iscritta");
    const [display, stats] = await Promise.all([loadDisplay(organizationId), loadTrialStats(organizationId, [trial.id])]);
    return {
      trial: serializeTrial(trial, stats.get(trial.id)!, display, canReadTrialContacts(scope.activeRole)),
      athleteId: trial.athlete_id,
      created: false,
    };
  }
  if (richiestaScheda && !UUID.test(richiestaScheda))
    throw new Error("Identificativo della scheda non valido");

  /*
    **Una transazione sola** (D-RD-22, chiuso).

    Le scritture sono quattro — la presa della riga di prova, la scheda,
    le sue appartenenze, il collegamento finale — e prima passavano dal
    registro generico una alla volta: due «Converti» concorrenti erano fermati
    dalla presa condizionata, ma un errore fra la seconda e la terza scrittura
    lasciava una scheda creata e una prova «in conversione». Ora il registro
    generico accetta la transazione di chi chiama (`options.client`): la
    scheda e le appartenenze si scrivono dentro **questa** transazione, e la
    riga di prova si prende e si collega nella stessa. O tutto o niente.

    La presa resta un `updateMany` condizionato su `converted_at IS NULL`:
    dentro una transazione e anche un blocco di riga, quindi il secondo
    «Converti» aspetta il primo e poi trova `count = 0`. L'unicita di
    `athlete_id` sulla riga di prova chiude l'ultima porta: due prove non
    si collegano alla stessa scheda.

    Gli identificativi delle appartenenze si coniano **prima** di scrivere,
    cosi la proiezione della scheda nasce gia con le righe vere (ADR-0187
    §9) e non serve una seconda scrittura per riallinearla.
  */
  const esito = await prisma.$transaction(
    async (tx) => {
      const presa = await tx.trialAthlete.updateMany({
        where: {
          id: trial.id,
          organization_id: organizationId,
          converted_at: null,
          athlete_id: null,
        },
        data: { converted_at: new Date() },
      });
      if (presa.count !== 1)
        throw new Error(
          "La conversione di questa persona e gia in corso o completata",
        );

      let athleteId = richiestaScheda;
      let creata = false;

      if (athleteId) {
        const esistente = await tx.athlete.findFirst({
          where: {
            id: athleteId,
            organization_id: organizationId,
            anonymized_at: null,
          },
          select: { id: true, trial_origin: { select: { id: true } } },
        });
        if (!esistente)
          throw new Error(
            "La scheda atleta indicata non esiste in questo club",
          );
        if (esistente.trial_origin && esistente.trial_origin.id !== trial.id) {
          throw new Error(
            "La scheda atleta e gia collegata a un'altra persona in prova",
          );
        }
      } else {
        const create =
          input.create && typeof input.create === "object" ? input.create : {};
        const categoria = await resolveCategoryForWrite(organizationId, {
          categoryId: create.categoryId ?? trial.category_id ?? "",
          categoryName: create.categoryName ?? trial.category_name ?? "",
        });
        /*
          La sede della scheda e quella della **squadra** (ADR-0194 §16): il
          gruppo della prova se c'e, altrimenti la sede della prova; chi
          converte puo indicarne un'altra, e il registro generico vaglia la
          coppia (categoria, sede) come per ogni appartenenza.
        */
        const gruppoDellaProva = trial.group_id
          ? (await loadDisplay(organizationId)).gruppi.find((g) => g.id === trial.group_id) || null
          : null;
        const siteId =
          asText(create.siteId ?? (gruppoDellaProva?.categoryId === categoria.category_id ? gruppoDellaProva.siteId : "") ?? "") ||
          asText(trial.site_id ?? "") ||
          null;
        const memberships = categoria.category_id
          ? [
              {
                id: randomUUID(),
                categoryId: categoria.category_id,
                categoryName: categoria.category_name || categoria.category_id,
                isPrimary: true,
                siteId,
              },
            ]
          : [];
        const status = asText(create.status) || "active";
        const birthDate = `${toDateOnly(trial.birth_date)}T00:00:00.000Z`;
        const scheda = await createResource(
          "simplified_athletes",
          {
            club_id: organizationId,
            organization_id: organizationId,
            first_name: trial.first_name,
            last_name: trial.last_name,
            birth_date: birthDate,
            status,
            category_id: categoria.category_id,
            category_name: categoria.category_name,
            data: {
              ...buildAthleteCategoryProjection(memberships as never, {
                clubId: organizationId,
              }),
              category: categoria.category_id,
              categoryName: categoria.category_name,
              birthDate,
              /* Recapiti della prova: dati della persona, non un tutore ne un accesso. */
              ...(trial.phone ? { phone: trial.phone } : {}),
              ...(trial.email ? { email: trial.email } : {}),
              /* Da dove viene: leggibile dalla scheda, senza dover cercare la prova. */
              trialOriginId: trial.id,
            },
          },
          "create",
          scope as never,
          { client: tx },
        );
        athleteId = asText((scheda as { id?: string })?.id);
        if (!athleteId) throw new Error("La scheda atleta non e stata creata");
        creata = true;
        for (const membership of memberships) {
          await createResource(
            "athlete_category_memberships",
            {
              id: membership.id,
              organization_id: organizationId,
              athlete_id: athleteId,
              category_id: membership.categoryId,
              category_name: membership.categoryName,
              is_primary: true,
              site_id: membership.siteId,
            },
            "create",
            scope as never,
            { client: tx },
          );
        }
      }

      const riga = await tx.trialAthlete.update({
        where: { id: trial.id },
        data: {
          athlete_id: athleteId,
          status: "enrolled",
          converted_at: new Date(),
          declined_at: null,
        },
      });
      return { riga, athleteId, creata };
    },
    { timeout: 20_000 },
  );
  const { riga, athleteId, creata } = esito;

  await recordAuditEvent({
    action: AUDIT_ACTIONS.trialAthleteConverted,
    actorUserId: attore.userId || scope.userId || null,
    actorEmail: attore.email || null,
    actorRole: scope.activeRole || null,
    organizationId,
    resource: "trial_athletes",
    resourceId: riga.id,
    metadata: { athleteId, schedaCreata: creata },
  });

  const [display, stats] = await Promise.all([
    loadDisplay(organizationId),
    loadTrialStats(organizationId, [riga.id]),
  ]);
  return {
    trial: serializeTrial(
      riga,
      stats.get(riga.id)!,
      display,
      canReadTrialContacts(scope.activeRole),
    ),
    athleteId,
    created: creata,
  };
};
