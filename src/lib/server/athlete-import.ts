import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { createResource, updateResource } from "./resources";
import { loadClubCategoryCatalog, loadMembershipTargetIndex } from "./category-write-guard";
import { AUDIT_ACTIONS, recordAuditEvent, recordPermissionDenied } from "./audit";
import { assertClubResourceAccess, canAccessClubResource } from "@/lib/access-roles";
import { buildAthleteCategoryProjection } from "@/lib/athlete-category-memberships";
import { normalizeClubSites } from "@/lib/club-sites";
import { isWellFormedCodiceFiscale } from "@/lib/italian-registry";
import { isRealCalendarDate, MIN_PLAUSIBLE_BIRTH_YEAR } from "@/lib/birth-date";
import { todayLocalDateOnly } from "@/lib/date-only";
import { categoryLabelKey, type AthleteImportRequest, type AthleteImportRequestCategory, type AthleteImportRequestRow } from "@/lib/athletes/import/plan";

/**
 * **L'import di atleti, sul server** (ADR-0195).
 *
 * Il client manda cio che il club ha deciso nel wizard — righe pronte,
 * categorie da collegare o da creare — e qui si **rivaglia tutto** prima di
 * scrivere: il server e l'autorita, l'anteprima e una promessa. Nessuna
 * scrittura aggira i proprietari dei domini: la scheda nasce dal registro
 * generico (`simplified_athletes`), l'appartenenza dal registro con il
 * vaglio della coppia categoria/sede (ADR-0194 §24), la categoria dal
 * registro (`categories`) con la stagione stampata, la squadra dal club
 * (`category_groups`). Tutto passa per l'audit.
 *
 * **Modello di scrittura: a scaglioni, deterministico, per atleta.** Ogni
 * atleta e una transazione sola (scheda + appartenenza: o entrambe o
 * niente); un atleta che fallisce non ferma gli altri, e il rapporto dice
 * riga per riga cosa e stato scritto. Un import da 113 righe non e una
 * transazione unica di un minuto che un timeout farebbe ripartire da zero.
 *
 * **Idempotenza.** Ogni scheda creata porta `data.import = {batchId,
 * sourceRowNumber}`: riprovare lo stesso lotto (stesso `batchId`) dopo un
 * errore di rete **non crea doppioni** — le righe gia scritte si
 * riconoscono e si dicono «gia scritte». Le categorie si riusano per nome
 * (una sola omonima) invece di nascere due volte.
 *
 * **Le categorie non si creano da sole.** Qui arriva solo cio che il club ha
 * deciso esplicitamente di creare al passo Categorie, con il permesso di
 * farlo; un'etichetta del file non e mai un identificativo.
 */

type ImportScope = {
  userId?: string | null;
  activeOrganizationId: string | null;
  activeRole: string | null;
  allowedOrganizationIds?: string[];
  accessScopes?: any;
};

type Attore = { userId?: string | null; email?: string | null };

export const MAX_IMPORT_ROWS_PER_REQUEST = 200;
const MAX_TEXT = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const asText = (value: unknown) => String(value ?? "").trim();
const negato = (motivo: string) => new Error(`Accesso negato: ${motivo}`);

const requireOrganization = (scope: ImportScope) => {
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

const assertCan = async (scope: ImportScope, resource: string, action: "create" | "update", resourceId: string | null) => {
  if (canAccessClubResource(scope.activeRole, resource, action)) return;
  await recordPermissionDenied({
    scope: scope as never,
    permission: `${resource}:${action}`,
    resource,
    resourceId,
  });
  assertClubResourceAccess(scope.activeRole, resource, action);
};

/** Cosa puo fare chi importa: la UI nasconde cio che qui si rifiuterebbe. */
export const describeImportPermissions = (scope: ImportScope) => ({
  canImport: canAccessClubResource(scope.activeRole, "simplified_athletes", "create"),
  canLink: canAccessClubResource(scope.activeRole, "simplified_athletes", "update"),
  canCreateCategories: canAccessClubResource(scope.activeRole, "categories", "create"),
  canAssignSites: canAccessClubResource(scope.activeRole, "clubs", "update"),
});

/* ── Validazione dell'input ──────────────────────────────────────────────── */

export type AthleteImportRowOutcome = {
  sourceRowNumber: number;
  status: "created" | "linked" | "already_written" | "failed" | "rejected";
  athleteId: string | null;
  membership: "written" | "kept_existing" | "none" | "failed";
  reason?: string;
};

export type AthleteImportResult = {
  batchId: string;
  rows: AthleteImportRowOutcome[];
  categories: { key: string; id: string; name: string; siteId: string; status: "created" | "reused" | "rejected"; reason?: string }[];
  totals: {
    requested: number;
    created: number;
    linked: number;
    alreadyWritten: number;
    failed: number;
    rejected: number;
    membershipsWritten: number;
    categoriesCreated: number;
  };
};

const cleanText = (value: unknown, campo: string) => {
  const text = asText(value);
  if (text.length > MAX_TEXT) throw new Error(`${campo}: troppo lungo (massimo ${MAX_TEXT} caratteri)`);
  if (/[<>]/.test(text)) throw new Error(`${campo}: caratteri non ammessi`);
  return text;
};

const validateRow = (row: AthleteImportRequestRow, today: string) => {
  const sourceRowNumber = Number(row?.sourceRowNumber);
  if (!Number.isInteger(sourceRowNumber) || sourceRowNumber <= 0) throw new Error("Numero di riga mancante");
  const action = row?.action === "link" ? "link" : row?.action === "create" ? "create" : null;
  if (!action) throw new Error("Azione della riga non riconosciuta");
  const athlete = row?.athlete && typeof row.athlete === "object" ? row.athlete : ({} as AthleteImportRequestRow["athlete"]);
  const firstName = cleanText(athlete.firstName, "Nome");
  const lastName = cleanText(athlete.lastName, "Cognome");
  if (!firstName) throw new Error("Nome mancante");
  if (!lastName) throw new Error("Cognome mancante");
  const birthDate = asText(athlete.birthDate).slice(0, 10);
  if (birthDate) {
    if (!isRealCalendarDate(birthDate)) throw new Error(`Data di nascita non valida (${birthDate})`);
    if (birthDate > today) throw new Error(`Data di nascita nel futuro (${birthDate})`);
    if (Number(birthDate.slice(0, 4)) < MIN_PLAUSIBLE_BIRTH_YEAR) throw new Error(`Data di nascita non plausibile (${birthDate})`);
  }
  const gender = ["M", "F"].includes(asText(athlete.gender).toUpperCase()) ? asText(athlete.gender).toUpperCase() : "";
  const fiscalCode = cleanText(athlete.fiscalCode, "Codice fiscale").toUpperCase();
  if (fiscalCode && !isWellFormedCodiceFiscale(fiscalCode)) throw new Error("Codice fiscale non valido");
  const email = cleanText(athlete.email, "Email");
  if (email && !EMAIL_PATTERN.test(email)) throw new Error("Email non valida");
  const phone = cleanText(athlete.phone, "Telefono");
  const athleteId = action === "link" ? asText(row.athleteId) : "";
  if (action === "link" && !UUID.test(athleteId)) throw new Error("Scheda da collegare non indicata");
  const category =
    row.category && typeof row.category === "object"
      ? row.category.kind === "target"
        ? { kind: "target" as const, targetId: asText(row.category.targetId) }
        : row.category.kind === "create"
          ? { kind: "create" as const, key: asText(row.category.key) }
          : null
      : null;
  if (category?.kind === "target" && !category.targetId) throw new Error("Squadra non indicata");
  if (category?.kind === "create" && !category.key) throw new Error("Categoria da creare non indicata");
  return { sourceRowNumber, action, athleteId, athlete: { firstName, lastName, birthDate, gender, fiscalCode, email, phone }, category };
};

type ValidatedRow = ReturnType<typeof validateRow>;

const normalizeRequest = (input: AthleteImportRequest) => {
  const batchId = asText(input?.batchId);
  if (!UUID.test(batchId)) throw new Error("Identificativo del lotto mancante o non valido");
  const rows = Array.isArray(input?.rows) ? input.rows : [];
  if (rows.length > MAX_IMPORT_ROWS_PER_REQUEST) {
    throw new Error(`Al massimo ${MAX_IMPORT_ROWS_PER_REQUEST} righe per richiesta`);
  }
  const categories = Array.isArray(input?.categoriesToCreate) ? input.categoriesToCreate : [];
  if (categories.length > 50) throw new Error("Troppe categorie da creare in una richiesta");
  const seen = new Set<number>();
  for (const row of rows) {
    const n = Number(row?.sourceRowNumber);
    if (seen.has(n)) throw new Error(`Riga ${n} ripetuta nella richiesta`);
    seen.add(n);
  }
  return { batchId, rows, categories };
};

/* ── Categorie da creare ─────────────────────────────────────────────────── */

const createOrReuseCategory = async (
  scope: ImportScope,
  organizationId: string,
  richiesta: AthleteImportRequestCategory,
  options: { request?: Request | null; sites: ReturnType<typeof normalizeClubSites>; rawGroups: unknown[] },
): Promise<{ id: string; name: string; siteId: string; status: "created" | "reused"; groupAdded: boolean }> => {
  const name = cleanText(richiesta.name, "Nome della categoria");
  if (!name) throw new Error("Nome della categoria mancante");
  const key = categoryLabelKey(name);
  const catalogo = await loadClubCategoryCatalog(organizationId);
  const omonime = catalogo.filter((voce) => categoryLabelKey(voce.name) === key);
  if (omonime.length > 1) {
    throw new Error(`Esistono gia ${omonime.length} categorie chiamate «${name}»: collegarne una invece di crearla`);
  }
  let id = omonime.length ? asText(omonime[0].id) : "";
  let status: "created" | "reused" = "reused";
  const siteId = asText(richiesta.siteId);
  /*
    I permessi prima di ogni scrittura: una categoria nata e poi una squadra
    rifiutata sarebbe una categoria orfana, e l'import non ne lascia.
  */
  if (!id) await assertCan(scope, "categories", "create", null);
  if (siteId) {
    if (!options.sites.some((voce) => voce.id === siteId)) throw new Error(`La sede indicata per «${name}» non e una sede del club`);
    await assertCan(scope, "clubs", "update", organizationId);
  }
  if (!id) {
    const from = Number.isInteger(richiesta.birthYearFrom) ? Number(richiesta.birthYearFrom) : new Date().getFullYear();
    const to = Number.isInteger(richiesta.birthYearTo) ? Number(richiesta.birthYearTo) : from;
    id = `category-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await createResource(
      "categories",
      {
        id,
        club_id: organizationId,
        organization_id: organizationId,
        name,
        description: "Categoria importata",
        sport: "Categoria importata",
        ageRange: from === to ? String(from) : `${from}-${to}`,
        birthYearFrom: from,
        birthYearTo: to,
        color: "bg-blue-500 text-white",
      },
      "create",
      scope as never,
      { request: options.request || undefined } as never,
    );
    status = "created";
  }

  let groupAdded = false;
  if (siteId) {
    const site = options.sites.find((voce) => voce.id === siteId)!;
    const giaPresente = options.rawGroups.some(
      (group: any) => asText(group?.categoryId ?? group?.category_id) === id && asText(group?.siteId ?? group?.site_id) === siteId,
    );
    if (!giaPresente) {
      options.rawGroups.push({ categoryId: id, categoryName: name, siteId, siteName: site.name, active: true });
      await updateResource("clubs", organizationId, { category_groups: options.rawGroups }, scope as never, {
        request: options.request || undefined,
      } as never);
      groupAdded = true;
    }
  }
  return { id, name, siteId, status, groupAdded };
};

/* ── Scrittura ───────────────────────────────────────────────────────────── */

const membershipRowFor = (
  organizationId: string,
  athleteId: string,
  target: { categoryId: string; categoryName: string; siteId: string },
) => ({
  id: randomUUID(),
  organization_id: organizationId,
  athlete_id: athleteId,
  category_id: target.categoryId,
  category_name: target.categoryName,
  is_primary: true,
  site_id: target.siteId || "",
});

const creaScheda = async (
  scope: ImportScope,
  organizationId: string,
  batchId: string,
  row: ValidatedRow,
  target: { categoryId: string; categoryName: string; siteId: string } | null,
  request: Request | null | undefined,
) => {
  const athleteId = randomUUID();
  const membership = target ? membershipRowFor(organizationId, athleteId, target) : null;
  const birthDate = row.athlete.birthDate ? `${row.athlete.birthDate}T00:00:00.000Z` : null;
  const memberships = membership
    ? [{ id: membership.id, categoryId: membership.category_id, categoryName: membership.category_name, isPrimary: true, siteId: membership.site_id }]
    : [];
  await prisma.$transaction(async (tx) => {
    await createResource(
      "simplified_athletes",
      {
        id: athleteId,
        club_id: organizationId,
        organization_id: organizationId,
        first_name: row.athlete.firstName,
        last_name: row.athlete.lastName,
        birth_date: birthDate,
        status: "active",
        category_id: membership?.category_id || null,
        category_name: membership?.category_name || null,
        data: {
          ...buildAthleteCategoryProjection(memberships as never, { clubId: organizationId }),
          category: membership?.category_id || null,
          categoryName: membership?.category_name || null,
          birthDate,
          status: "active",
          ...(row.athlete.gender ? { gender: row.athlete.gender } : {}),
          ...(row.athlete.fiscalCode ? { fiscalCode: row.athlete.fiscalCode } : {}),
          ...(row.athlete.email ? { email: row.athlete.email } : {}),
          ...(row.athlete.phone ? { phone: row.athlete.phone } : {}),
          import: { batchId, sourceRowNumber: row.sourceRowNumber },
        },
      },
      "create",
      scope as never,
      { client: tx, request: request || undefined } as never,
    );
    if (membership) {
      await createResource("athlete_category_memberships", membership, "create", scope as never, { client: tx, request: request || undefined } as never);
    }
  });
  return { athleteId, membershipWritten: Boolean(membership) };
};

const collegaScheda = async (
  scope: ImportScope,
  organizationId: string,
  batchId: string,
  row: ValidatedRow,
  target: { categoryId: string; categoryName: string; siteId: string } | null,
  request: Request | null | undefined,
) => {
  await assertCan(scope, "simplified_athletes", "update", row.athleteId);
  const scheda = await prisma.athlete.findFirst({
    where: { id: row.athleteId, organization_id: organizationId },
    select: { id: true, birth_date: true, data: true, status: true },
  });
  if (!scheda) throw new Error("La scheda da collegare non e del club");
  const data = scheda.data && typeof scheda.data === "object" && !Array.isArray(scheda.data) ? (scheda.data as Record<string, unknown>) : {};
  /* Si completano solo i campi vuoti: la scheda che c'e ha ragione sul file. */
  const patch: Record<string, unknown> = {};
  const dataPatch: Record<string, unknown> = {};
  if (!scheda.birth_date && row.athlete.birthDate) {
    patch.birth_date = `${row.athlete.birthDate}T00:00:00.000Z`;
    dataPatch.birthDate = patch.birth_date;
  }
  for (const [key, value] of Object.entries({ gender: row.athlete.gender, fiscalCode: row.athlete.fiscalCode, email: row.athlete.email, phone: row.athlete.phone })) {
    if (value && !asText(data[key])) dataPatch[key] = value;
  }
  const imports = Array.isArray(data.importLinks) ? (data.importLinks as unknown[]) : [];
  dataPatch.importLinks = [...imports, { batchId, sourceRowNumber: row.sourceRowNumber }].slice(-20);
  await updateResource("simplified_athletes", scheda.id, { ...patch, data: { ...data, ...dataPatch } }, scope as never, {
    request: request || undefined,
  } as never);

  let membership: AthleteImportRowOutcome["membership"] = "none";
  if (target) {
    const correnti = await prisma.athleteCategoryMembership.count({ where: { athlete_id: scheda.id } });
    if (correnti > 0) {
      membership = "kept_existing";
    } else {
      await createResource("athlete_category_memberships", membershipRowFor(organizationId, scheda.id, target), "create", scope as never, {
        request: request || undefined,
      } as never);
      membership = "written";
    }
  }
  return { athleteId: scheda.id, membership, status: scheda.status };
};

/**
 * Applica un lotto (o uno scaglione di un lotto) di import.
 */
export const applyAthleteImport = async (
  scope: ImportScope,
  input: AthleteImportRequest,
  attore: Attore = {},
  options: { request?: Request | null; today?: string } = {},
): Promise<AthleteImportResult> => {
  const organizationId = requireOrganization(scope);
  await assertCan(scope, "simplified_athletes", "create", null);
  const { batchId, rows, categories } = normalizeRequest(input);
  const today = String(options.today || "").slice(0, 10) || todayLocalDateOnly();

  /* Le categorie decise dal club, prima delle schede che le citano. */
  const club = await prisma.club.findUnique({ where: { id: organizationId }, select: { club_sites: true, category_groups: true } });
  const sites = normalizeClubSites(club?.club_sites);
  const rawGroups = Array.isArray(club?.category_groups) ? [...(club!.category_groups as unknown[])] : [];
  const perChiave = new Map<string, { id: string; name: string; siteId: string }>();
  const esitiCategorie: AthleteImportResult["categories"] = [];
  for (const richiesta of categories) {
    const key = asText(richiesta?.key);
    if (!key) continue;
    try {
      const esito = await createOrReuseCategory(scope, organizationId, richiesta, { request: options.request, sites, rawGroups });
      perChiave.set(key, { id: esito.id, name: esito.name, siteId: esito.siteId });
      esitiCategorie.push({ key, id: esito.id, name: esito.name, siteId: esito.siteId, status: esito.status });
    } catch (error: any) {
      esitiCategorie.push({ key, id: "", name: asText(richiesta?.name), siteId: asText(richiesta?.siteId), status: "rejected", reason: String(error?.message || error) });
    }
  }

  const index = await loadMembershipTargetIndex(organizationId);
  const giaScritte = await prisma.athlete.findMany({
    where: { organization_id: organizationId, data: { path: ["import", "batchId"], equals: batchId } },
    select: { id: true, data: true },
  });
  const giaPerRiga = new Map<number, string>();
  for (const scheda of giaScritte) {
    const info = (scheda.data as any)?.import;
    const riga = Number(info?.sourceRowNumber);
    if (Number.isInteger(riga)) giaPerRiga.set(riga, scheda.id);
  }

  const esiti: AthleteImportRowOutcome[] = [];
  let membershipsWritten = 0;
  for (const grezza of rows) {
    const sourceRowNumber = Number(grezza?.sourceRowNumber) || 0;
    let row: ValidatedRow;
    try {
      row = validateRow(grezza, today);
    } catch (error: any) {
      esiti.push({ sourceRowNumber, status: "rejected", athleteId: null, membership: "none", reason: String(error?.message || error) });
      continue;
    }
    if (giaPerRiga.has(row.sourceRowNumber)) {
      esiti.push({ sourceRowNumber: row.sourceRowNumber, status: "already_written", athleteId: giaPerRiga.get(row.sourceRowNumber)!, membership: "none" });
      continue;
    }
    let target: { categoryId: string; categoryName: string; siteId: string } | null = null;
    if (row.category?.kind === "target") {
      const trovata = index.byId(row.category.targetId);
      if (!trovata) {
        esiti.push({ sourceRowNumber: row.sourceRowNumber, status: "rejected", athleteId: null, membership: "none", reason: "La squadra scelta non esiste piu: rifare la scelta al passo Categorie" });
        continue;
      }
      target = { categoryId: trovata.categoryId, categoryName: trovata.categoryName, siteId: trovata.siteId };
    } else if (row.category?.kind === "create") {
      const creata = perChiave.get(row.category.key);
      if (!creata) {
        const motivo = esitiCategorie.find((voce) => voce.key === row.category?.key)?.reason;
        esiti.push({ sourceRowNumber: row.sourceRowNumber, status: "rejected", athleteId: null, membership: "none", reason: motivo ? `Categoria non creata: ${motivo}` : "La categoria da creare non e nella richiesta" });
        continue;
      }
      target = { categoryId: creata.id, categoryName: creata.name, siteId: creata.siteId };
    }
    try {
      if (row.action === "create") {
        const esito = await creaScheda(scope, organizationId, batchId, row, target, options.request);
        if (esito.membershipWritten) membershipsWritten += 1;
        esiti.push({ sourceRowNumber: row.sourceRowNumber, status: "created", athleteId: esito.athleteId, membership: esito.membershipWritten ? "written" : "none" });
        await recordAuditEvent({
          action: AUDIT_ACTIONS.athleteImported,
          actorUserId: attore.userId || scope.userId || null,
          actorEmail: attore.email || null,
          actorRole: scope.activeRole || null,
          organizationId,
          resource: "athletes",
          resourceId: esito.athleteId,
          request: options.request || undefined,
          metadata: { batchId, sourceRowNumber: row.sourceRowNumber, operation: "create", target: target ? { categoryId: target.categoryId, siteId: target.siteId } : null },
        });
      } else {
        const esito = await collegaScheda(scope, organizationId, batchId, row, target, options.request);
        if (esito.membership === "written") membershipsWritten += 1;
        esiti.push({ sourceRowNumber: row.sourceRowNumber, status: "linked", athleteId: esito.athleteId, membership: esito.membership });
        await recordAuditEvent({
          action: AUDIT_ACTIONS.athleteImported,
          actorUserId: attore.userId || scope.userId || null,
          actorEmail: attore.email || null,
          actorRole: scope.activeRole || null,
          organizationId,
          resource: "athletes",
          resourceId: esito.athleteId,
          request: options.request || undefined,
          metadata: { batchId, sourceRowNumber: row.sourceRowNumber, operation: "link", target: target ? { categoryId: target.categoryId, siteId: target.siteId } : null, membership: esito.membership },
        });
      }
    } catch (error: any) {
      esiti.push({ sourceRowNumber: row.sourceRowNumber, status: "failed", athleteId: null, membership: "failed", reason: messaggioDiScrittura(error) });
    }
  }

  const totals = {
    requested: rows.length,
    created: esiti.filter((esito) => esito.status === "created").length,
    linked: esiti.filter((esito) => esito.status === "linked").length,
    alreadyWritten: esiti.filter((esito) => esito.status === "already_written").length,
    failed: esiti.filter((esito) => esito.status === "failed").length,
    rejected: esiti.filter((esito) => esito.status === "rejected").length,
    membershipsWritten,
    categoriesCreated: esitiCategorie.filter((voce) => voce.status === "created").length,
  };
  await recordAuditEvent({
    action: AUDIT_ACTIONS.athleteImportBatch,
    actorUserId: attore.userId || scope.userId || null,
    actorEmail: attore.email || null,
    actorRole: scope.activeRole || null,
    organizationId,
    resource: "athletes",
    resourceId: batchId,
    request: options.request || undefined,
    outcome: totals.failed || totals.rejected ? "failure" : "success",
    metadata: { batchId, totals, categories: esitiCategorie.map((voce) => ({ key: voce.key, id: voce.id, status: voce.status })) },
  });
  return { batchId, rows: esiti, categories: esitiCategorie, totals };
};

/** Un errore del driver non si mostra: si traduce, o si riduce alla prima riga. */
const messaggioDiScrittura = (error: any) => {
  const code = String(error?.code || "");
  const message = String(error?.message || error || "Errore in scrittura");
  if (code === "P2002") return "Una riga uguale esiste gia (vincolo di unicita)";
  if (code === "P2028" || /transaction/i.test(message) && /timeout|expired/i.test(message)) return "Scrittura scaduta: riprovare lo stesso lotto";
  return message.split("\n")[0].slice(0, 200);
};
