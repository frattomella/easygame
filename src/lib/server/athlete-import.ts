import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { createResource } from "./resources";
import { loadClubCategoryCatalog, loadMembershipTargetIndex } from "./category-write-guard";
import { replaceAthleteMembershipSet } from "./athlete-category-memberships";
import { bloccaSchede } from "./athlete-lock-order";
import { AUDIT_ACTIONS, recordAuditEvent, recordPermissionDenied } from "./audit";
import { assertClubResourceAccess, canAccessClubResource } from "@/lib/access-roles";
import { buildAthleteCategoryProjection } from "@/lib/athlete-category-memberships";
import { normalizeClubSites } from "@/lib/club-sites";
import { normalizeClubSeasons } from "@/lib/club-seasons";
import { isWellFormedCodiceFiscale } from "@/lib/italian-registry";
import { isRealCalendarDate, MIN_PLAUSIBLE_BIRTH_YEAR } from "@/lib/birth-date";
import { todayLocalDateOnly } from "@/lib/date-only";
import { categoryLabelKey, nameKey, type AthleteImportRequest, type AthleteImportRequestCategory, type AthleteImportRequestRow } from "@/lib/athletes/import/plan";

/**
 * **L'import di atleti, sul server** (ADR-0195).
 *
 * Il client manda cio che il club ha deciso nel wizard — righe pronte,
 * categorie da collegare o da creare — e qui si **rivaglia tutto** prima di
 * scrivere: il server e l'autorita, l'anteprima e una promessa. Nessuna
 * scrittura aggira i proprietari dei domini: la scheda nasce dal registro
 * generico (`simplified_athletes`), l'appartenenza dal registro con il
 * vaglio della coppia categoria/sede (ADR-0194 §24) — o dal writer delle
 * appartenenze per una scheda che esiste —, la categoria dal registro
 * (`categories`) e la squadra dal registro (`category_groups`), entrambe
 * con la stagione stampata. Tutto passa per l'audit.
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
 * riconoscono (anche dentro la transazione della riga, per due richieste
 * sovrapposte) e si dicono «gia scritte». Una categoria nata da questo
 * lotto porta `importBatchId` e si riusa **solo** per lo stesso lotto.
 *
 * **Le categorie non si creano da sole**, e non si riusano per nome: una
 * categoria omonima che esiste gia si **collega** al passo Categorie, e un
 * «crea» con quel nome si ferma (revisione ostile B2). Nascono solo quelle
 * che almeno una riga valida cita (B4): niente categorie orfane.
 *
 * **Un duplicato non nasce per un ritentativo**: prima di creare, il
 * server cerca una scheda con lo stesso codice fiscale o lo stesso
 * nominativo e la stessa data, e si ferma a meno che il club non abbia
 * visto il possibile duplicato e scelto «importa come nuovo» (C-H3).
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
const TX = { timeout: 30_000, maxWait: 10_000 } as const;

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

const haPerimetro = (scope: ImportScope) => Array.isArray(scope.accessScopes) && scope.accessScopes.length > 0;

/** Cosa puo fare chi importa: la UI nasconde cio che qui si rifiuterebbe. */
export const describeImportPermissions = (scope: ImportScope) => ({
  /* Un ruolo con un perimetro di sede o categoria non importa: la scheda nuova non e ancora in nessun perimetro (C-M5). */
  canImport: canAccessClubResource(scope.activeRole, "simplified_athletes", "create") && !haPerimetro(scope),
  canLink: canAccessClubResource(scope.activeRole, "simplified_athletes", "update"),
  canCreateCategories: canAccessClubResource(scope.activeRole, "categories", "create"),
  canAssignSites: canAccessClubResource(scope.activeRole, "category_groups", "create") && canAccessClubResource(scope.activeRole, "clubs", "update"),
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
  return {
    sourceRowNumber,
    action,
    athleteId,
    allowDuplicate: row.allowDuplicate === true,
    athlete: { firstName, lastName, birthDate, gender, fiscalCode, email, phone },
    category,
  };
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
  const chiavi = new Set<string>();
  for (const categoria of categories) {
    const key = asText(categoria?.key);
    if (key && chiavi.has(key)) throw new Error(`Categoria «${key}» ripetuta nella richiesta`);
    chiavi.add(key);
  }
  const seen = new Set<number>();
  for (const row of rows) {
    const n = Number(row?.sourceRowNumber);
    if (!Number.isInteger(n)) continue;
    if (seen.has(n)) throw new Error(`Riga ${n} ripetuta nella richiesta`);
    seen.add(n);
  }
  return { batchId, rows, categories };
};

/* ── Categorie da creare ─────────────────────────────────────────────────── */

type CreationContext = {
  request?: Request | null;
  activeSeasonId?: string | null;
  batchId: string;
  sites: ReturnType<typeof normalizeClubSites>;
};

const createOrReuseCategory = async (
  scope: ImportScope,
  organizationId: string,
  richiesta: AthleteImportRequestCategory,
  context: CreationContext,
): Promise<{ id: string; name: string; siteId: string; status: "created" | "reused" }> => {
  const name = cleanText(richiesta.name, "Nome della categoria");
  if (!name) throw new Error("Nome della categoria mancante");
  const key = categoryLabelKey(name) || nameKey(name);
  const catalogo = await loadClubCategoryCatalog(organizationId);
  const omonime = catalogo.filter((voce) => (categoryLabelKey(voce.name) || nameKey(voce.name)) === key);
  /*
    Si riusa solo cio che questo stesso lotto ha creato (una riprova): il
    marchio del lotto vive nel payload della voce, che il catalogo normalizzato
    non riporta. Un'omonima del club si collega, non si crea.
  */
  const voci = omonime.length
    ? await prisma.clubResourceItem.findMany({ where: { organization_id: organizationId, resource_type: "categories" }, select: { id: true, payload: true } })
    : [];
  const idsDelLotto = new Set(
    voci
      .filter((voce) => asText((voce.payload as any)?.importBatchId) === context.batchId)
      .map((voce) => asText((voce.payload as any)?.id) || asText(voce.id)),
  );
  const delLotto = omonime.find((voce) => idsDelLotto.has(asText(voce.id)));
  if (!delLotto && omonime.length) {
    throw new Error(`«${name}» esiste già${omonime.length > 1 ? ` (${omonime.length} volte)` : ""}: collegarla al passo Categorie invece di crearla`);
  }
  const siteId = asText(richiesta.siteId);
  const site = siteId ? context.sites.find((voce) => voce.id === siteId && voce.active !== false) : null;
  if (siteId && !site) throw new Error(`La sede indicata per «${name}» non è una sede attiva del club`);
  /* I permessi prima di ogni scrittura: una categoria nata e poi una squadra rifiutata sarebbe una categoria orfana. */
  if (!delLotto) await assertCan(scope, "categories", "create", null);
  if (site) {
    await assertCan(scope, "category_groups", "create", null);
    await assertCan(scope, "clubs", "update", organizationId);
  }

  let id = delLotto ? asText(delLotto.id) : "";
  let status: "created" | "reused" = "reused";
  const options = { request: context.request || undefined, activeSeasonId: context.activeSeasonId || undefined } as never;
  if (!id) {
    const from = Number.isInteger(richiesta.birthYearFrom) ? Number(richiesta.birthYearFrom) : new Date().getFullYear();
    const to = Number.isInteger(richiesta.birthYearTo) ? Math.max(Number(richiesta.birthYearTo), from) : from;
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
        importBatchId: context.batchId,
      },
      "create",
      scope as never,
      options,
    );
    status = "created";
  }

  if (site) {
    const index = await loadMembershipTargetIndex(organizationId);
    const giaPresente = index.targets.some((target) => target.categoryId === id && target.siteId === site.id && !target.implicit);
    if (!giaPresente) {
      /* La squadra dal registro: una riga sola, con la stagione, senza riscrivere l'intera collezione del club (C-H2). */
      await createResource(
        "category_groups",
        { club_id: organizationId, organization_id: organizationId, categoryId: id, categoryName: name, siteId: site.id, siteName: site.name, active: true },
        "create",
        scope as never,
        options,
      );
    }
  }
  return { id, name, siteId: site ? site.id : "", status };
};

/* ── Scrittura ───────────────────────────────────────────────────────────── */

type Target = { categoryId: string; categoryName: string; siteId: string };

const membershipRowFor = (organizationId: string, athleteId: string, target: Target) => ({
  id: randomUUID(),
  organization_id: organizationId,
  athlete_id: athleteId,
  category_id: target.categoryId,
  category_name: target.categoryName,
  is_primary: true,
  site_id: target.siteId || "",
});

const giaScrittaNelLotto = async (client: any, organizationId: string, batchId: string, sourceRowNumber: number) => {
  const righe = await client.athlete.findMany({
    where: { organization_id: organizationId, data: { path: ["import", "batchId"], equals: batchId } },
    select: { id: true, data: true },
  });
  const trovata = righe.find((scheda: any) => Number(scheda?.data?.import?.sourceRowNumber) === sourceRowNumber);
  return trovata ? String(trovata.id) : null;
};

/** Una scheda del club che e la stessa persona: stesso codice fiscale, o stesso nominativo e stessa data. */
const trovaDuplicato = async (client: any, organizationId: string, row: ValidatedRow) => {
  const candidati = await client.athlete.findMany({
    where: { organization_id: organizationId, anonymized_at: null },
    select: { id: true, first_name: true, last_name: true, birth_date: true, data: true },
  });
  const nome = `${nameKey(row.athlete.lastName)}|${nameKey(row.athlete.firstName)}`;
  for (const scheda of candidati) {
    const cf = asText((scheda.data as any)?.fiscalCode).toUpperCase();
    if (row.athlete.fiscalCode && cf && cf === row.athlete.fiscalCode) return { id: String(scheda.id), motivo: "stesso codice fiscale" };
    const stessoNome = `${nameKey(scheda.last_name)}|${nameKey(scheda.first_name)}` === nome;
    if (!stessoNome || !row.athlete.birthDate || !scheda.birth_date) continue;
    const data = new Date(scheda.birth_date).toISOString().slice(0, 10);
    if (data === row.athlete.birthDate) return { id: String(scheda.id), motivo: "stesso nominativo e stessa data di nascita" };
  }
  return null;
};

const creaScheda = async (
  scope: ImportScope,
  organizationId: string,
  batchId: string,
  row: ValidatedRow,
  target: Target | null,
  request: Request | null | undefined,
) => {
  const athleteId = randomUUID();
  const membership = target ? membershipRowFor(organizationId, athleteId, target) : null;
  const birthDate = row.athlete.birthDate ? `${row.athlete.birthDate}T00:00:00.000Z` : null;
  const memberships = membership
    ? [{ id: membership.id, categoryId: membership.category_id, categoryName: membership.category_name, isPrimary: true, siteId: membership.site_id }]
    : [];
  return prisma.$transaction(async (tx) => {
    /* Due richieste sovrapposte con lo stesso lotto: la seconda trova la riga scritta dalla prima (C-M2). */
    const gia = await giaScrittaNelLotto(tx, organizationId, batchId, row.sourceRowNumber);
    if (gia) return { athleteId: gia, membershipWritten: false, alreadyWritten: true };
    if (!row.allowDuplicate) {
      const doppione = await trovaDuplicato(tx, organizationId, row);
      if (doppione) throw new Error(`Possibile duplicato di una scheda del club (${doppione.motivo}): decidere al passo Duplicati`);
    }
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
    return { athleteId, membershipWritten: Boolean(membership), alreadyWritten: false };
  }, TX);
};

const collegaScheda = async (
  scope: ImportScope,
  organizationId: string,
  batchId: string,
  row: ValidatedRow,
  target: Target | null,
  attore: Attore,
  request: Request | null | undefined,
) => {
  await assertCan(scope, "simplified_athletes", "update", row.athleteId);
  /*
    Si completano solo i campi vuoti, con la scheda bloccata e riletta nella
    stessa transazione: il dato che c'e ha ragione sul file, e nessun
    salvataggio concorrente si perde (C-M4). Si scrivono i campi, non il
    blob: la proiezione dei tutori e il dato clinico non si toccano.
  */
  const esito = await prisma.$transaction(async (tx) => {
    await bloccaSchede(tx, [row.athleteId]);
    const scheda = await tx.athlete.findFirst({
      where: { id: row.athleteId, organization_id: organizationId },
      select: { id: true, first_name: true, last_name: true, birth_date: true, data: true, status: true, category_id: true, anonymized_at: true },
    });
    if (!scheda) throw new Error("La scheda da collegare non è del club");
    if (scheda.anonymized_at) throw new Error("La scheda da collegare è stata cancellata su richiesta dell'interessato");
    if (nameKey(scheda.last_name) !== nameKey(row.athlete.lastName)) {
      throw new Error(`La scheda da collegare è di «${scheda.last_name} ${scheda.first_name}», non di «${row.athlete.lastName} ${row.athlete.firstName}»`);
    }
    const data = scheda.data && typeof scheda.data === "object" && !Array.isArray(scheda.data) ? (scheda.data as Record<string, unknown>) : {};
    const links = Array.isArray(data.importLinks) ? (data.importLinks as any[]) : [];
    const giaCollegata = links.some((link) => asText(link?.batchId) === batchId && Number(link?.sourceRowNumber) === row.sourceRowNumber);
    if (giaCollegata) return { athleteId: scheda.id, status: scheda.status, alreadyWritten: true, hasPlacement: true };

    const dataPatch: Record<string, unknown> = {};
    const patch: Record<string, unknown> = {};
    if (!scheda.birth_date && row.athlete.birthDate) {
      patch.birth_date = new Date(`${row.athlete.birthDate}T00:00:00.000Z`);
      dataPatch.birthDate = `${row.athlete.birthDate}T00:00:00.000Z`;
    }
    for (const [key, value] of Object.entries({ gender: row.athlete.gender, fiscalCode: row.athlete.fiscalCode, email: row.athlete.email, phone: row.athlete.phone })) {
      if (value && !asText(data[key])) dataPatch[key] = value;
    }
    dataPatch.importLinks = [...links, { batchId, sourceRowNumber: row.sourceRowNumber }].slice(-20);
    await tx.athlete.update({
      where: { id: scheda.id },
      data: { ...patch, data: { ...data, ...dataPatch } as never, updated_at: new Date() },
    });
    const righe = await tx.athleteCategoryMembership.count({ where: { athlete_id: scheda.id } });
    /* Una categoria solo nella colonna (scheda non ancora bonificata) e comunque una categoria: si conserva (B3). */
    return { athleteId: scheda.id, status: scheda.status, alreadyWritten: false, hasPlacement: righe > 0 || Boolean(asText(scheda.category_id)) };
  }, TX);

  let membership: AthleteImportRowOutcome["membership"] = "none";
  if (target && !esito.alreadyWritten) {
    if (esito.hasPlacement) {
      membership = "kept_existing";
    } else {
      /* Dal writer delle appartenenze: vaglio della coppia, sede derivata, proiezione nella stessa transazione (C-M3). */
      await replaceAthleteMembershipSet(
        scope as never,
        esito.athleteId,
        [{ category_id: target.categoryId, category_name: target.categoryName, is_primary: true, site_id: target.siteId || "" }],
        attore,
        { request: request || undefined },
      );
      membership = "written";
    }
  }
  return { athleteId: esito.athleteId, membership, status: esito.status, alreadyWritten: esito.alreadyWritten };
};

/**
 * Applica un lotto (o uno scaglione di un lotto) di import.
 */
export const applyAthleteImport = async (
  scope: ImportScope,
  input: AthleteImportRequest,
  attore: Attore = {},
  options: { request?: Request | null; today?: string; activeSeasonId?: string | null } = {},
): Promise<AthleteImportResult> => {
  const organizationId = requireOrganization(scope);
  await assertCan(scope, "simplified_athletes", "create", null);
  if (haPerimetro(scope)) {
    throw negato("l'import richiede un ruolo senza perimetro di sede o categoria: una scheda nuova non è ancora in nessun perimetro");
  }
  const { batchId, rows, categories } = normalizeRequest(input);
  const today = String(options.today || "").slice(0, 10) || todayLocalDateOnly();

  /* Prima si vagliano le righe: una categoria nasce solo se una riga valida la cita (B4). */
  const esiti: AthleteImportRowOutcome[] = [];
  const valide: ValidatedRow[] = [];
  for (const grezza of rows) {
    try {
      valide.push(validateRow(grezza, today));
    } catch (error: any) {
      esiti.push({ sourceRowNumber: Number(grezza?.sourceRowNumber) || 0, status: "rejected", athleteId: null, membership: "none", reason: String(error?.message || error) });
    }
  }
  const chiaviCitate = new Set(valide.flatMap((row) => (row.category?.kind === "create" ? [row.category.key] : [])));

  const club = await prisma.club.findUnique({ where: { id: organizationId }, select: { club_sites: true, settings: true } });
  /* La stagione: quella dichiarata dalla richiesta, o quella attiva del club — mai nessuna (B1/C-H1). */
  const activeSeasonId = asText(options.activeSeasonId) || asText(normalizeClubSeasons(club?.settings).activeSeasonId) || null;
  const context: CreationContext = { request: options.request, activeSeasonId, batchId, sites: normalizeClubSites(club?.club_sites) };
  const perChiave = new Map<string, Target>();
  const esitiCategorie: AthleteImportResult["categories"] = [];
  for (const richiesta of categories) {
    const key = asText(richiesta?.key);
    if (!key || !chiaviCitate.has(key)) continue;
    try {
      const esito = await createOrReuseCategory(scope, organizationId, richiesta, context);
      perChiave.set(key, { categoryId: esito.id, categoryName: esito.name, siteId: esito.siteId });
      esitiCategorie.push({ key, id: esito.id, name: esito.name, siteId: esito.siteId, status: esito.status });
    } catch (error: any) {
      esitiCategorie.push({ key, id: "", name: asText(richiesta?.name), siteId: asText(richiesta?.siteId), status: "rejected", reason: messaggioDiScrittura(error) });
    }
  }

  const index = await loadMembershipTargetIndex(organizationId);
  let membershipsWritten = 0;
  const audit = (action: string, resourceId: string, outcome: "success" | "failure", metadata: Record<string, unknown>) =>
    recordAuditEvent({
      action,
      actorUserId: attore.userId || scope.userId || null,
      actorEmail: attore.email || null,
      actorRole: scope.activeRole || null,
      organizationId,
      resource: "athletes",
      resourceId,
      request: options.request || undefined,
      outcome,
      metadata,
    });

  for (const row of valide) {
    let target: Target | null = null;
    if (row.category?.kind === "target") {
      const trovata = index.byId(row.category.targetId);
      if (!trovata) {
        esiti.push({ sourceRowNumber: row.sourceRowNumber, status: "rejected", athleteId: null, membership: "none", reason: "La squadra scelta non esiste più: rifare la scelta al passo Categorie" });
        continue;
      }
      target = { categoryId: trovata.categoryId, categoryName: trovata.categoryName, siteId: trovata.siteId };
    } else if (row.category?.kind === "create") {
      const creata = perChiave.get(row.category.key);
      if (!creata) {
        const motivo = esitiCategorie.find((voce) => voce.key === row.category?.key)?.reason;
        esiti.push({ sourceRowNumber: row.sourceRowNumber, status: "rejected", athleteId: null, membership: "none", reason: motivo ? `Categoria non creata: ${motivo}` : "La categoria da creare non è nella richiesta" });
        continue;
      }
      target = creata;
    }
    try {
      if (row.action === "create") {
        const esito = await creaScheda(scope, organizationId, batchId, row, target, options.request);
        if (esito.alreadyWritten) {
          esiti.push({ sourceRowNumber: row.sourceRowNumber, status: "already_written", athleteId: esito.athleteId, membership: target ? "written" : "none" });
          continue;
        }
        if (esito.membershipWritten) membershipsWritten += 1;
        esiti.push({ sourceRowNumber: row.sourceRowNumber, status: "created", athleteId: esito.athleteId, membership: esito.membershipWritten ? "written" : "none" });
        await audit(AUDIT_ACTIONS.athleteImported, esito.athleteId, "success", {
          batchId,
          sourceRowNumber: row.sourceRowNumber,
          operation: "create",
          target: target ? { categoryId: target.categoryId, siteId: target.siteId } : null,
        });
      } else {
        const esito = await collegaScheda(scope, organizationId, batchId, row, target, attore, options.request);
        if (esito.alreadyWritten) {
          esiti.push({ sourceRowNumber: row.sourceRowNumber, status: "already_written", athleteId: esito.athleteId, membership: "none" });
          continue;
        }
        if (esito.membership === "written") membershipsWritten += 1;
        esiti.push({
          sourceRowNumber: row.sourceRowNumber,
          status: "linked",
          athleteId: esito.athleteId,
          membership: esito.membership,
          ...(esito.status !== "active" ? { reason: `La scheda resta ${esito.status === "inactive" ? "inattiva" : esito.status}` } : {}),
        });
        await audit(AUDIT_ACTIONS.athleteImported, esito.athleteId, "success", {
          batchId,
          sourceRowNumber: row.sourceRowNumber,
          operation: "link",
          target: target ? { categoryId: target.categoryId, siteId: target.siteId } : null,
          membership: esito.membership,
        });
      }
    } catch (error: any) {
      esiti.push({ sourceRowNumber: row.sourceRowNumber, status: "failed", athleteId: null, membership: "failed", reason: messaggioDiScrittura(error) });
    }
  }

  esiti.sort((left, right) => left.sourceRowNumber - right.sourceRowNumber);
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
  await audit(AUDIT_ACTIONS.athleteImportBatch, batchId, totals.failed || totals.rejected ? "failure" : "success", {
    batchId,
    totals,
    categories: esitiCategorie.map((voce) => ({ key: voce.key, id: voce.id, status: voce.status })),
  });
  return { batchId, rows: esiti, categories: esitiCategorie, totals };
};

/** Un errore del driver non si mostra: si traduce, o si riduce alla prima riga. */
export const messaggioDiScrittura = (error: any) => {
  const code = String(error?.code || "");
  const message = String(error?.message || error || "Errore in scrittura").trim();
  if (code === "P2002") return "Una riga uguale esiste già (vincolo di unicità)";
  if (code === "P2003") return "La riga cita un dato che non esiste più";
  if (code === "P2025") return "La riga da aggiornare non esiste più";
  if (code === "P2028" || (/transaction/i.test(message) && /timeout|expired/i.test(message))) return "Scrittura scaduta: riprovare lo stesso lotto";
  if (code.startsWith("P")) return "Scrittura non riuscita: riprovare lo stesso lotto";
  const prima = message.split("\n").map((riga) => riga.trim()).find(Boolean) || "Errore in scrittura";
  return prima.slice(0, 200);
};
