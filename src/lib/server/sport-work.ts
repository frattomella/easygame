import { prisma } from "./prisma";
import { recordAuditEvent } from "./audit";
import { SPORT_WORK_AUDIT_ACTIONS } from "@/lib/sport-work/audit-actions";
import {
  canTransitionRelationship,
  deriveInstallmentStatus,
  deriveRelationshipStatus,
  installmentRemaining,
  normalizeDeclarationStatus,
  normalizeFiscalProfile,
  normalizeFrequency,
  normalizePersonOrigin,
  normalizePlanKind,
  normalizeRasdStatus,
  normalizeRelationshipStatus,
  normalizeRelationshipType,
  normalizeRole,
  normalizeSocialCoverage,
  roundMoney,
  toDateOrNull,
  toMoney,
  type RelationshipStatus,
} from "@/lib/sport-work/model";
import {
  computeAccruedAmount,
  generatePlanItems,
  planTotal,
  type CompensationPlanConfig,
} from "@/lib/sport-work/plan";
import {
  computeAnnualPosition,
  computePositionDrift,
  toEngineSnapshot,
  type PositionPayoutRow,
} from "@/lib/sport-work/position";

/**
 * Il servizio del **lavoro sportivo**: l'unico punto in cui EasyGame crea o
 * modifica persone, rapporti, piani, scadenze, autocertificazioni e posizioni
 * annue.
 *
 * Il denaro non passa da qui: il registro in uscita ha un modulo proprio
 * (`sport-work-ledger.ts`), come gli incassi hanno `payment-transactions.ts`.
 * La separazione non e estetica — e la ragione per cui si puo dire, e
 * verificare, che **una sola funzione al mondo scrive un'uscita**.
 *
 * Quattro proprieta valgono qui e non altrove.
 *
 * 1. **Lo stato non si scrive, si deriva.** Lo stato di una scadenza viene da
 *    programmato, maturato e pagato; lo stato di un rapporto viene dalle date
 *    e dalle transizioni ammesse. Nessun corpo di richiesta puo impostarli.
 * 2. **La posizione annua e un calcolo, non un campo.** Si ricalcola dal
 *    registro dopo ogni operazione che la puo cambiare, ed e idempotente.
 * 3. **Le tracce si scrivono qui, non nelle rotte.** Un audit dimenticato in
 *    una delle rotte sarebbe un audit che manca proprio nel caso in cui
 *    serve; scriverlo nel servizio lo rende una proprieta del dominio.
 * 4. **Il confine e `organization_id`**, con «Accesso negato» perche il route
 *    handler lo mappi su 403.
 */

export type SportWorkScope = {
  userId: string;
  activeOrganizationId: string | null;
  activeRole?: string | null;
  actorEmail?: string | null;
  allowedOrganizationIds: string[];
  request?: Request | null;
};

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

const asText = (value: unknown) => String(value ?? "").trim();

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

export const ensureOrganizationAccess = (
  scope: SportWorkScope | undefined,
  organizationId: string | null | undefined,
) => {
  if (!scope) return;
  if (!organizationId) {
    throw denied("record senza club");
  }
  if (!scope.allowedOrganizationIds.includes(organizationId)) {
    throw denied("il record appartiene a un altro club");
  }
};

export const resolveOrganizationId = (
  scope: SportWorkScope | undefined,
  requested?: string | null,
) => {
  const wanted = asText(requested);

  if (!scope) {
    if (!wanted) throw new Error("Nessun club indicato");
    return wanted;
  }

  if (wanted) {
    ensureOrganizationAccess(scope, wanted);
    return wanted;
  }

  if (scope.activeOrganizationId) return scope.activeOrganizationId;

  throw new Error("Nessun club attivo selezionato");
};

const personClient = () => (prisma as any).sportWorkPerson;
const relationshipClient = () => (prisma as any).sportWorkRelationship;
const planClient = () => (prisma as any).sportWorkCompensationPlan;
const installmentClient = () => (prisma as any).sportWorkInstallment;
const declarationClient = () => (prisma as any).sportWorkExternalDeclaration;
const positionClient = () => (prisma as any).sportWorkYearPosition;
const ledgerClient = () => (prisma as any).sportWorkOutboundTransaction;

export const audit = async (
  scope: SportWorkScope | undefined,
  action: string,
  organizationId: string | null,
  resource: string,
  resourceId: string | null,
  metadata: Record<string, unknown> = {},
  outcome: "success" | "failure" | "denied" = "success",
) => {
  await recordAuditEvent({
    action,
    outcome,
    actorUserId: scope?.userId || null,
    actorEmail: scope?.actorEmail || null,
    actorRole: scope?.activeRole || null,
    organizationId,
    resource,
    resourceId,
    request: scope?.request || null,
    metadata,
  });
};

/* ================================================================ persone */

export type SportWorkPersonInput = {
  organizationId?: string | null;
  originType?: unknown;
  originId?: unknown;
  firstName: unknown;
  lastName: unknown;
  fiscalCode?: unknown;
  birthDate?: unknown;
  birthPlace?: unknown;
  gender?: unknown;
  email?: unknown;
  phone?: unknown;
  address?: unknown;
  fiscalProfile?: unknown;
  vatNumber?: unknown;
  pensionFund?: unknown;
  socialCoverage?: unknown;
  iban?: unknown;
  notes?: unknown;
};

/**
 * La proiezione di elenco di una persona. **Senza IBAN.**
 *
 * Non e prudenza generica: un elenco si carica per mostrare venti righe, e
 * ogni campo che ci sta dentro finisce nella cache del browser e nei log di
 * chi passa in mezzo. Le coordinate bancarie si leggono aprendo la scheda,
 * una alla volta, e chi lo fa ha `sport_work.manage`.
 */
export const projectPersonForList = (row: any) => ({
  id: row.id,
  organization_id: row.organization_id,
  origin_type: row.origin_type,
  origin_id: row.origin_id,
  first_name: row.first_name,
  last_name: row.last_name,
  full_name: `${row.first_name} ${row.last_name}`.trim(),
  fiscal_code: row.fiscal_code,
  email: row.email,
  phone: row.phone,
  fiscal_profile: row.fiscal_profile,
  vat_number: row.vat_number,
  social_coverage: row.social_coverage,
  has_iban: Boolean(asText(row.iban)),
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const buildPersonData = (input: SportWorkPersonInput) => {
  const firstName = asText(input.firstName);
  const lastName = asText(input.lastName);

  if (!firstName || !lastName) {
    throw new Error("Nome e cognome sono obbligatori");
  }

  const fiscalCode = asText(input.fiscalCode).toUpperCase();
  if (fiscalCode && !/^[A-Z0-9]{11,16}$/.test(fiscalCode)) {
    throw new Error("Codice fiscale non valido");
  }

  return {
    origin_type: normalizePersonOrigin(input.originType),
    origin_id: asText(input.originId) || null,
    first_name: firstName,
    last_name: lastName,
    fiscal_code: fiscalCode || null,
    birth_date: toDateOrNull(input.birthDate),
    birth_place: asText(input.birthPlace) || null,
    gender: asText(input.gender) || null,
    email: asText(input.email).toLowerCase() || null,
    phone: asText(input.phone) || null,
    address: asText(input.address) || null,
    fiscal_profile: normalizeFiscalProfile(input.fiscalProfile),
    vat_number: asText(input.vatNumber) || null,
    pension_fund: asText(input.pensionFund) || null,
    social_coverage: normalizeSocialCoverage(input.socialCoverage),
    iban: asText(input.iban).replace(/\s+/g, "").toUpperCase() || null,
    notes: asText(input.notes) || null,
  };
};

export const listSportWorkPeople = async (
  filter: { organizationId?: string | null; search?: string | null },
  scope?: SportWorkScope,
) => {
  const organizationId = resolveOrganizationId(scope, filter.organizationId);
  const rows = await personClient().findMany({
    where: { organization_id: organizationId },
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
  });

  const search = asText(filter.search).toLowerCase();
  const filtered = search
    ? rows.filter((row: any) =>
        `${row.first_name} ${row.last_name} ${row.fiscal_code || ""}`
          .toLowerCase()
          .includes(search),
      )
    : rows;

  return filtered.map(projectPersonForList);
};

export const getSportWorkPersonById = async (
  personId: string,
  scope?: SportWorkScope,
) => {
  const row = await personClient().findUnique({ where: { id: asText(personId) } });
  if (!row) throw new Error("Persona non trovata");
  ensureOrganizationAccess(scope, row.organization_id);
  return row;
};

export const createSportWorkPerson = async (
  input: SportWorkPersonInput,
  scope?: SportWorkScope,
) => {
  const organizationId = resolveOrganizationId(scope, input.organizationId);
  const data = buildPersonData(input);

  const created = await personClient().create({
    data: {
      organization_id: organizationId,
      ...data,
      created_by: scope?.userId || null,
    },
  });

  await audit(
    scope,
    SPORT_WORK_AUDIT_ACTIONS.personCreated,
    organizationId,
    "sport_work_people",
    created.id,
    { originType: created.origin_type, hasFiscalCode: Boolean(created.fiscal_code) },
  );

  return created;
};

export const updateSportWorkPerson = async (
  personId: string,
  input: Partial<SportWorkPersonInput>,
  scope?: SportWorkScope,
) => {
  const existing = await getSportWorkPersonById(personId, scope);
  const merged = buildPersonData({
    ...existing,
    firstName: input.firstName ?? existing.first_name,
    lastName: input.lastName ?? existing.last_name,
    fiscalCode: input.fiscalCode ?? existing.fiscal_code,
    birthDate: input.birthDate ?? existing.birth_date,
    birthPlace: input.birthPlace ?? existing.birth_place,
    gender: input.gender ?? existing.gender,
    email: input.email ?? existing.email,
    phone: input.phone ?? existing.phone,
    address: input.address ?? existing.address,
    fiscalProfile: input.fiscalProfile ?? existing.fiscal_profile,
    vatNumber: input.vatNumber ?? existing.vat_number,
    pensionFund: input.pensionFund ?? existing.pension_fund,
    socialCoverage: input.socialCoverage ?? existing.social_coverage,
    iban: input.iban ?? existing.iban,
    notes: input.notes ?? existing.notes,
    originType: input.originType ?? existing.origin_type,
    originId: input.originId ?? existing.origin_id,
  });

  const updated = await personClient().update({
    where: { id: existing.id },
    data: merged,
  });

  await audit(
    scope,
    SPORT_WORK_AUDIT_ACTIONS.personUpdated,
    existing.organization_id,
    "sport_work_people",
    existing.id,
    { fields: Object.keys(input) },
  );

  return updated;
};

/* ============================================================= rapporti */

export type RelationshipInput = {
  organizationId?: string | null;
  personId: unknown;
  seasonId?: unknown;
  role?: unknown;
  relationshipType?: unknown;
  startDate: unknown;
  endDate?: unknown;
  contractAmount?: unknown;
  currency?: unknown;
  compensationFrequency?: unknown;
  weeklyHours?: unknown;
  contractAttachmentId?: unknown;
  signatureState?: unknown;
  rasdStatus?: unknown;
  rasdReference?: unknown;
  rasdCommunicatedAt?: unknown;
  rasdNotes?: unknown;
  notes?: unknown;
};

const buildRelationshipData = (input: Partial<RelationshipInput>, existing?: any) => {
  const startDate = toDateOrNull(input.startDate ?? existing?.start_date);
  if (!startDate) {
    throw new Error("La data di inizio del rapporto e obbligatoria");
  }

  const endDate = toDateOrNull(
    input.endDate === undefined ? existing?.end_date : input.endDate,
  );
  if (endDate && endDate.getTime() < startDate.getTime()) {
    throw new Error("La data di fine non puo precedere quella di inizio");
  }

  const weeklyHoursRaw =
    input.weeklyHours === undefined ? existing?.weekly_hours : input.weeklyHours;
  const weeklyHours =
    weeklyHoursRaw === null || weeklyHoursRaw === undefined || asText(weeklyHoursRaw) === ""
      ? null
      : Number(weeklyHoursRaw);
  if (weeklyHours !== null && (!Number.isFinite(weeklyHours) || weeklyHours < 0 || weeklyHours > 168)) {
    throw new Error("Le ore settimanali dichiarate non sono plausibili");
  }

  const contractAmountRaw =
    input.contractAmount === undefined
      ? existing?.contract_amount
      : input.contractAmount;
  const contractAmount =
    contractAmountRaw === null || contractAmountRaw === undefined || asText(contractAmountRaw) === ""
      ? null
      : toMoney(contractAmountRaw);
  if (contractAmount !== null && contractAmount < 0) {
    throw new Error("L'importo pattuito non puo essere negativo");
  }

  return {
    season_id: asText(input.seasonId ?? existing?.season_id) || null,
    role: normalizeRole(input.role ?? existing?.role),
    relationship_type: normalizeRelationshipType(
      input.relationshipType ?? existing?.relationship_type,
    ),
    start_date: startDate,
    end_date: endDate,
    contract_amount: contractAmount,
    currency: asText(input.currency ?? existing?.currency) || "EUR",
    compensation_frequency: normalizeFrequency(
      input.compensationFrequency ?? existing?.compensation_frequency,
    ),
    weekly_hours: weeklyHours,
    contract_attachment_id:
      asText(input.contractAttachmentId ?? existing?.contract_attachment_id) || null,
    signature_state:
      ["NOT_REQUIRED", "PENDING", "SIGNED"].includes(
        asText(input.signatureState ?? existing?.signature_state).toUpperCase(),
      )
        ? asText(input.signatureState ?? existing?.signature_state).toUpperCase()
        : "NOT_REQUIRED",
    rasd_status: normalizeRasdStatus(input.rasdStatus ?? existing?.rasd_status),
    rasd_reference: asText(input.rasdReference ?? existing?.rasd_reference) || null,
    rasd_communicated_at: toDateOrNull(
      input.rasdCommunicatedAt ?? existing?.rasd_communicated_at,
    ),
    rasd_notes: asText(input.rasdNotes ?? existing?.rasd_notes) || null,
    notes: asText(input.notes ?? existing?.notes) || null,
  };
};

export const listRelationships = async (
  filter: {
    organizationId?: string | null;
    personId?: string | null;
    status?: string | null;
    seasonId?: string | null;
  },
  scope?: SportWorkScope,
) => {
  const organizationId = resolveOrganizationId(scope, filter.organizationId);
  const personId = asText(filter.personId);
  const status = asText(filter.status).toUpperCase();
  const seasonId = asText(filter.seasonId);

  return relationshipClient().findMany({
    where: {
      organization_id: organizationId,
      ...(personId ? { person_id: personId } : {}),
      ...(status ? { status } : {}),
      ...(seasonId ? { season_id: seasonId } : {}),
    },
    orderBy: [{ start_date: "desc" }, { created_at: "desc" }],
  });
};

export const getRelationshipById = async (
  relationshipId: string,
  scope?: SportWorkScope,
) => {
  const row = await relationshipClient().findUnique({
    where: { id: asText(relationshipId) },
  });
  if (!row) throw new Error("Rapporto non trovato");
  ensureOrganizationAccess(scope, row.organization_id);
  return row;
};

export const createRelationship = async (
  input: RelationshipInput,
  scope?: SportWorkScope,
) => {
  const person = await getSportWorkPersonById(asText(input.personId), scope);
  const organizationId = person.organization_id;
  ensureOrganizationAccess(scope, organizationId);

  const data = buildRelationshipData(input);

  const created = await relationshipClient().create({
    data: {
      organization_id: organizationId,
      person_id: person.id,
      ...data,
      // Un rapporto nasce sempre in bozza: attivarlo e un atto separato, che
      // verifica cosa manca. Nasce attivo solo se qualcuno lo decide dopo.
      status: "DRAFT",
      created_by: scope?.userId || null,
    },
  });

  await audit(
    scope,
    SPORT_WORK_AUDIT_ACTIONS.relationshipCreated,
    organizationId,
    "sport_work_relationships",
    created.id,
    {
      personId: person.id,
      relationshipType: created.relationship_type,
      role: created.role,
      contractAmount: created.contract_amount,
    },
  );

  return created;
};

export const updateRelationship = async (
  relationshipId: string,
  input: Partial<RelationshipInput>,
  scope?: SportWorkScope,
) => {
  const existing = await getRelationshipById(relationshipId, scope);

  if (existing.status === "TERMINATED") {
    throw new Error(
      "Un rapporto cessato non si modifica: la cessazione e un atto, non uno stato di lavorazione",
    );
  }

  const data = buildRelationshipData(input, existing);
  const updated = await relationshipClient().update({
    where: { id: existing.id },
    data,
  });

  await audit(
    scope,
    SPORT_WORK_AUDIT_ACTIONS.relationshipUpdated,
    existing.organization_id,
    "sport_work_relationships",
    existing.id,
    { fields: Object.keys(input) },
  );

  if (
    input.contractAttachmentId !== undefined &&
    asText(input.contractAttachmentId) &&
    asText(input.contractAttachmentId) !== asText(existing.contract_attachment_id)
  ) {
    await audit(
      scope,
      SPORT_WORK_AUDIT_ACTIONS.contractAttached,
      existing.organization_id,
      "sport_work_relationships",
      existing.id,
      { attachmentId: asText(input.contractAttachmentId) },
    );
  }

  return updated;
};

/**
 * Cosa manca perche un rapporto possa diventare attivo.
 *
 * La proposta **dice cosa manca**, non nega e basta: e lo schema del motore
 * fiscale, e la ragione per cui una segreteria puo risolvere il problema
 * invece di chiamare l'assistenza.
 */
export const listActivationBlockers = (relationship: any, person: any) => {
  const blockers: string[] = [];

  if (!asText(person?.fiscal_code)) {
    blockers.push("Il codice fiscale della persona non e stato registrato");
  }
  if (!toDateOrNull(relationship?.start_date)) {
    blockers.push("Manca la data di inizio del rapporto");
  }
  if (!asText(relationship?.contract_attachment_id)) {
    blockers.push("Il contratto firmato non e stato allegato");
  }
  if (
    relationship?.relationship_type === "SELF_EMPLOYED_VAT" &&
    !asText(person?.vat_number)
  ) {
    blockers.push("Il rapporto e con partita IVA ma la partita IVA non e indicata");
  }

  return blockers;
};

export const changeRelationshipStatus = async (
  relationshipId: string,
  nextStatus: string,
  options: { reason?: unknown; force?: boolean } = {},
  scope?: SportWorkScope,
) => {
  const existing = await getRelationshipById(relationshipId, scope);
  const from = normalizeRelationshipStatus(existing.status);
  const to = normalizeRelationshipStatus(nextStatus);

  if (from === to) return existing;

  if (!canTransitionRelationship(from, to)) {
    throw new Error(
      `Transizione non ammessa: da ${from} a ${to}. Uno stato non e un campo libero.`,
    );
  }

  if (to === "ACTIVE") {
    const person = await getSportWorkPersonById(existing.person_id, scope);
    const blockers = listActivationBlockers(existing, person);
    if (blockers.length > 0 && !options.force) {
      throw new Error(
        `Il rapporto non puo essere attivato: ${blockers.join("; ")}`,
      );
    }
  }

  const updated = await relationshipClient().update({
    where: { id: existing.id },
    data: {
      status: to,
      ...(to === "TERMINATED"
        ? {
            terminated_at: new Date(),
            termination_reason: asText(options.reason) || null,
          }
        : {}),
    },
  });

  await audit(
    scope,
    SPORT_WORK_AUDIT_ACTIONS.relationshipUpdated,
    existing.organization_id,
    "sport_work_relationships",
    existing.id,
    { from, to, forced: Boolean(options.force), reason: asText(options.reason) || null },
  );

  return updated;
};

/**
 * Porta a `EXPIRED` i rapporti la cui data di fine e passata.
 *
 * Idempotente: rieseguirla non cambia nulla se non e cambiato niente. La
 * chiama lo scheduler, e la chiama anche la lettura dell'elenco, perche una
 * schermata che mostra «attivo» un contratto finito a giugno e una schermata
 * che mente.
 */
export const refreshExpiredRelationships = async (
  organizationId: string,
  now = new Date(),
) => {
  const rows = await relationshipClient().findMany({
    where: {
      organization_id: organizationId,
      status: { in: ["ACTIVE", "SUSPENDED"] },
    },
  });

  let changed = 0;
  for (const row of rows) {
    const derived = deriveRelationshipStatus({
      status: normalizeRelationshipStatus(row.status),
      endDate: row.end_date,
      now,
    });
    if (derived !== row.status && derived === "EXPIRED") {
      await relationshipClient().update({
        where: { id: row.id },
        data: { status: "EXPIRED" },
      });
      changed += 1;
    }
  }

  return changed;
};

/* ================================================================ piani */

export type PlanInput = {
  relationshipId: unknown;
  kind?: unknown;
  totalAmount?: unknown;
  installmentCount?: unknown;
  firstDueDate?: unknown;
  monthlyAmount?: unknown;
  startMonth?: unknown;
  endMonth?: unknown;
  dueDayOfMonth?: unknown;
  items?: unknown;
  notes?: unknown;
};

const toPlanConfig = (input: PlanInput): CompensationPlanConfig => {
  const kind = normalizePlanKind(input.kind);

  if (kind === "MONTHLY") {
    return {
      kind: "MONTHLY",
      monthlyAmount: toMoney(input.monthlyAmount),
      startMonth: asText(input.startMonth),
      endMonth: asText(input.endMonth),
      dueDayOfMonth:
        input.dueDayOfMonth === undefined || input.dueDayOfMonth === null
          ? null
          : Number(input.dueDayOfMonth),
    };
  }

  if (kind === "CUSTOM") {
    const items = Array.isArray(input.items) ? input.items : [];
    return {
      kind: "CUSTOM",
      items: items.map((item: any) => ({
        label: asText(item?.label),
        grossAmount: toMoney(item?.grossAmount ?? item?.gross_amount),
        dueDate: asText(item?.dueDate ?? item?.due_date),
        accrualPeriodStart: asText(item?.accrualPeriodStart) || null,
        accrualPeriodEnd: asText(item?.accrualPeriodEnd) || null,
      })),
    };
  }

  return {
    kind: "EQUAL_INSTALMENTS",
    totalAmount: toMoney(input.totalAmount),
    installmentCount: Number(input.installmentCount),
    firstDueDate: asText(input.firstDueDate),
  };
};

export const getPlanForRelationship = async (
  relationshipId: string,
  scope?: SportWorkScope,
) => {
  const relationship = await getRelationshipById(relationshipId, scope);
  const plan = await planClient().findUnique({
    where: { relationship_id: relationship.id },
  });
  if (!plan) return null;
  ensureOrganizationAccess(scope, plan.organization_id);
  return plan;
};

export const listInstallments = async (
  filter: {
    organizationId?: string | null;
    relationshipId?: string | null;
    status?: string | null;
    dueBefore?: string | null;
  },
  scope?: SportWorkScope,
) => {
  const organizationId = resolveOrganizationId(scope, filter.organizationId);
  const relationshipId = asText(filter.relationshipId);
  const status = asText(filter.status).toUpperCase();
  const dueBefore = toDateOrNull(filter.dueBefore);

  return installmentClient().findMany({
    where: {
      organization_id: organizationId,
      ...(relationshipId ? { relationship_id: relationshipId } : {}),
      ...(status ? { status } : {}),
      ...(dueBefore ? { due_date: { lte: dueBefore } } : {}),
    },
    orderBy: [{ due_date: "asc" }, { sequence: "asc" }],
  });
};

/**
 * Crea o rifa' il piano di un rapporto.
 *
 * **Rifare un piano cancella le scadenze e le riscrive.** Per questo si
 * rifiuta se una qualunque scadenza ha gia ricevuto denaro: quelle righe sono
 * collegate a movimenti del registro, e cancellarle spezzerebbe il legame fra
 * un'uscita e cio che pagava. Chi deve correggere un piano gia in corso
 * annulla le rate residue e ne aggiunge di nuove, che e un'operazione
 * diversa e visibile.
 */
export const saveCompensationPlan = async (
  input: PlanInput,
  scope?: SportWorkScope,
) => {
  const relationship = await getRelationshipById(asText(input.relationshipId), scope);
  const config = toPlanConfig(input);
  const items = generatePlanItems(config);
  const total = planTotal(items);

  const existingPlan = await planClient().findUnique({
    where: { relationship_id: relationship.id },
  });

  if (existingPlan) {
    const paid = await installmentClient().findMany({
      where: { plan_id: existingPlan.id },
    });
    const withMoney = paid.filter((row: any) => Number(row.paid_amount) > 0);
    if (withMoney.length > 0) {
      throw new Error(
        `Il piano non si puo rifare: ${withMoney.length} scadenze hanno gia ricevuto denaro. Annulla le rate residue e aggiungine di nuove.`,
      );
    }
  }

  const result = await (prisma as any).$transaction(async (client: any) => {
    const plan = existingPlan
      ? await client.sportWorkCompensationPlan.update({
          where: { id: existingPlan.id },
          data: {
            kind: config.kind,
            total_amount: total,
            currency: relationship.currency || "EUR",
            config: config as never,
            notes: asText(input.notes) || null,
          },
        })
      : await client.sportWorkCompensationPlan.create({
          data: {
            organization_id: relationship.organization_id,
            relationship_id: relationship.id,
            kind: config.kind,
            total_amount: total,
            currency: relationship.currency || "EUR",
            config: config as never,
            notes: asText(input.notes) || null,
            created_by: scope?.userId || null,
          },
        });

    if (existingPlan) {
      await client.sportWorkInstallment.deleteMany({
        where: { plan_id: plan.id },
      });
    }

    for (const item of items) {
      await client.sportWorkInstallment.create({
        data: {
          organization_id: relationship.organization_id,
          plan_id: plan.id,
          relationship_id: relationship.id,
          sequence: item.sequence,
          label: item.label,
          accrual_period_start: new Date(item.accrualPeriodStart),
          accrual_period_end: new Date(item.accrualPeriodEnd),
          due_date: new Date(item.dueDate),
          gross_amount: item.grossAmount,
          accrued_amount: 0,
          paid_amount: 0,
          remaining_amount: item.grossAmount,
          status: "SCHEDULED",
          fiscal_year: item.scheduledYear,
        },
      });
    }

    return plan;
  });

  await audit(
    scope,
    SPORT_WORK_AUDIT_ACTIONS.planCreated,
    relationship.organization_id,
    "sport_work_compensation_plans",
    result.id,
    {
      relationshipId: relationship.id,
      kind: config.kind,
      total,
      installments: items.length,
      replaced: Boolean(existingPlan),
    },
  );

  return result;
};

/**
 * Ricalcola il maturato delle scadenze di un rapporto, e da li il loro stato.
 *
 * Idempotente. La chiama lo scheduler ogni notte, e la chiama ogni operazione
 * che tocca il rapporto: uno stato che si aggiorna solo quando qualcuno apre
 * la pagina e uno stato che si scopre in ritardo.
 */
export const recomputeInstallmentAccruals = async (
  relationshipId: string,
  scope?: SportWorkScope,
  now = new Date(),
) => {
  const relationship = await getRelationshipById(relationshipId, scope);
  const rows = await installmentClient().findMany({
    where: { relationship_id: relationship.id },
    orderBy: [{ sequence: "asc" }],
  });

  const status = normalizeRelationshipStatus(relationship.status);
  /*
    Un rapporto in bozza non fa maturare niente: non esiste ancora. Un
    rapporto sospeso non fa maturare **nuove** scadenze, ma quelle gia
    maturate restano dovute — sospendere non cancella un debito.
  */
  const activeThroughPeriod = status === "ACTIVE" || status === "EXPIRED" || status === "TERMINATED";

  let changed = 0;

  for (const row of rows) {
    const accrued = computeAccruedAmount({
      grossAmount: Number(row.gross_amount) || 0,
      accrualPeriodEnd: row.accrual_period_end,
      cancelled: Boolean(row.cancelled),
      relationshipActiveThroughPeriod:
        activeThroughPeriod || Number(row.accrued_amount) > 0,
      now,
    });

    const nextStatus = deriveInstallmentStatus({
      cancelled: Boolean(row.cancelled),
      grossAmount: Number(row.gross_amount) || 0,
      accruedAmount: accrued,
      paidAmount: Number(row.paid_amount) || 0,
      dueDate: row.due_date,
      now,
    });

    const remaining = installmentRemaining(
      Number(row.gross_amount) || 0,
      Number(row.paid_amount) || 0,
    );

    if (
      roundMoney(Number(row.accrued_amount) || 0) !== accrued ||
      row.status !== nextStatus ||
      roundMoney(Number(row.remaining_amount) || 0) !== remaining
    ) {
      await installmentClient().update({
        where: { id: row.id },
        data: {
          accrued_amount: accrued,
          remaining_amount: remaining,
          status: nextStatus,
        },
      });
      changed += 1;
    }
  }

  return changed;
};

export const cancelInstallment = async (
  installmentId: string,
  scope?: SportWorkScope,
) => {
  const row = await installmentClient().findUnique({
    where: { id: asText(installmentId) },
  });
  if (!row) throw new Error("Scadenza non trovata");
  ensureOrganizationAccess(scope, row.organization_id);

  if (Number(row.paid_amount) > 0) {
    throw new Error(
      "Una scadenza che ha gia ricevuto denaro non si annulla: si storna l'erogazione",
    );
  }

  const updated = await installmentClient().update({
    where: { id: row.id },
    data: { cancelled: true, status: "CANCELLED", accrued_amount: 0 },
  });

  await audit(
    scope,
    SPORT_WORK_AUDIT_ACTIONS.installmentChanged,
    row.organization_id,
    "sport_work_compensation_installments",
    row.id,
    { action: "cancelled", grossAmount: row.gross_amount },
  );

  return updated;
};

/* =================================================== autocertificazioni */

export type DeclarationInput = {
  personId: unknown;
  fiscalYear: unknown;
  externalAmount: unknown;
  declarationDate?: unknown;
  effectiveFrom?: unknown;
  attachmentId?: unknown;
  hasOtherCoverage?: unknown;
  notes?: unknown;
};

export const listDeclarations = async (
  filter: {
    organizationId?: string | null;
    personId?: string | null;
    fiscalYear?: number | string | null;
    status?: string | null;
  },
  scope?: SportWorkScope,
) => {
  const organizationId = resolveOrganizationId(scope, filter.organizationId);
  const personId = asText(filter.personId);
  const year = Number(filter.fiscalYear);

  return declarationClient().findMany({
    where: {
      organization_id: organizationId,
      ...(personId ? { person_id: personId } : {}),
      ...(Number.isInteger(year) ? { fiscal_year: year } : {}),
      ...(asText(filter.status)
        ? { status: normalizeDeclarationStatus(filter.status) }
        : {}),
    },
    orderBy: [{ fiscal_year: "desc" }, { declaration_date: "desc" }],
  });
};

export const getActiveDeclaration = async (
  personId: string,
  fiscalYear: number,
  scope?: SportWorkScope,
) => {
  const person = await getSportWorkPersonById(personId, scope);
  return declarationClient().findFirst({
    where: {
      organization_id: person.organization_id,
      person_id: person.id,
      fiscal_year: Number(fiscalYear),
      status: "ACTIVE",
    },
    orderBy: [{ declaration_date: "desc" }],
  });
};

/**
 * Registra un'autocertificazione, sostituendo quella dell'anno se esiste.
 *
 * Sostituire non significa cancellare: la vecchia riga passa a `SUPERSEDED` e
 * resta. E la stessa disciplina del registro — si corregge aggiungendo — e ha
 * una ragione precisa: quello che il club sapeva a marzo resta quello che
 * sapeva a marzo, anche dopo che a maggio ha saputo altro.
 */
export const createDeclaration = async (
  input: DeclarationInput,
  scope?: SportWorkScope,
) => {
  const person = await getSportWorkPersonById(asText(input.personId), scope);
  const year = Number(input.fiscalYear);

  if (!Number.isInteger(year) || year < 2000 || year > 2200) {
    throw new Error("Anno fiscale non valido");
  }

  const amount = toMoney(input.externalAmount);
  if (amount < 0) {
    throw new Error("L'importo dichiarato non puo essere negativo");
  }

  const declarationDate = toDateOrNull(input.declarationDate) || new Date();

  const created = await (prisma as any).$transaction(async (client: any) => {
    const previous = await client.sportWorkExternalDeclaration.findFirst({
      where: {
        organization_id: person.organization_id,
        person_id: person.id,
        fiscal_year: year,
        status: "ACTIVE",
      },
    });

    if (previous) {
      await client.sportWorkExternalDeclaration.update({
        where: { id: previous.id },
        data: { status: "SUPERSEDED" },
      });
    }

    return client.sportWorkExternalDeclaration.create({
      data: {
        organization_id: person.organization_id,
        person_id: person.id,
        fiscal_year: year,
        external_amount: amount,
        declaration_date: declarationDate,
        effective_from: toDateOrNull(input.effectiveFrom),
        attachment_id: asText(input.attachmentId) || null,
        status: "ACTIVE",
        has_other_coverage: Boolean(input.hasOtherCoverage),
        supersedes_id: previous?.id || null,
        notes: asText(input.notes) || null,
        created_by: scope?.userId || null,
      },
    });
  });

  await audit(
    scope,
    SPORT_WORK_AUDIT_ACTIONS.declarationCreated,
    person.organization_id,
    "sport_work_external_declarations",
    created.id,
    {
      personId: person.id,
      fiscalYear: year,
      externalAmount: amount,
      supersedes: created.supersedes_id,
    },
  );

  await recomputeYearPosition(person.id, year, scope);

  return created;
};

/* ================================================== posizione annua */

export const loadPositionRows = async (
  organizationId: string,
  personId: string,
  year: number,
): Promise<PositionPayoutRow[]> =>
  ledgerClient().findMany({
    where: {
      organization_id: organizationId,
      person_id: personId,
      fiscal_year: year,
    },
    orderBy: [{ paid_at: "asc" }, { created_at: "asc" }],
  });

/**
 * Ricalcola e materializza la posizione annua di una persona.
 *
 * **Non e una scrittura di stato: e la copia di un calcolo.** Vive in tabella
 * perche la leggono cruscotto, scheda persona ed elenco compensi, e rifarla a
 * ogni lettura costerebbe una scansione del registro per riga mostrata.
 */
export const recomputeYearPosition = async (
  personId: string,
  year: number,
  scope?: SportWorkScope,
  client: any = prisma,
) => {
  const person = await (client.sportWorkPerson ?? personClient()).findUnique({
    where: { id: asText(personId) },
  });
  if (!person) throw new Error("Persona non trovata");
  ensureOrganizationAccess(scope, person.organization_id);

  const payouts = await client.sportWorkOutboundTransaction.findMany({
    where: {
      organization_id: person.organization_id,
      person_id: person.id,
      fiscal_year: Number(year),
    },
  });

  const declaration = await client.sportWorkExternalDeclaration.findFirst({
    where: {
      organization_id: person.organization_id,
      person_id: person.id,
      fiscal_year: Number(year),
      status: "ACTIVE",
    },
    orderBy: [{ declaration_date: "desc" }],
  });

  const position = computeAnnualPosition({
    year: Number(year),
    payouts,
    declaration,
  });

  const data = {
    club_gross: position.clubGross,
    external_declared: position.externalDeclared,
    progressive: position.progressive,
    social_franchise_used: position.socialFranchiseUsed,
    social_taxable: position.socialTaxable,
    employee_contribution: position.employeeContribution,
    employer_contribution: position.employerContribution,
    fiscal_franchise_used: position.fiscalFranchiseUsed,
    fiscal_taxable: position.fiscalTaxable,
    withheld: position.withheld,
    payment_count: position.paymentCount,
    last_payment_at: position.lastPaymentAt ? new Date(position.lastPaymentAt) : null,
    last_declaration_at: position.lastDeclarationAt
      ? new Date(position.lastDeclarationAt)
      : null,
    has_current_declaration: position.hasCurrentDeclaration,
    computed_at: new Date(position.computedAt),
  };

  const existing = await client.sportWorkYearPosition.findFirst({
    where: {
      organization_id: person.organization_id,
      person_id: person.id,
      year: Number(year),
    },
  });

  if (existing) {
    await client.sportWorkYearPosition.update({
      where: { id: existing.id },
      data,
    });
  } else {
    await client.sportWorkYearPosition.create({
      data: {
        organization_id: person.organization_id,
        person_id: person.id,
        year: Number(year),
        ...data,
      },
    });
  }

  return position;
};

/**
 * La posizione annua da mostrare, con lo **scostamento** se c'e.
 *
 * Lo scostamento e la differenza fra i contributi congelati e quelli che si
 * calcolerebbero oggi con la dichiarazione attuale. Non si scrive: si mostra.
 */
export const getYearPositionDetail = async (
  personId: string,
  year: number,
  scope?: SportWorkScope,
) => {
  const person = await getSportWorkPersonById(personId, scope);
  const payouts = await loadPositionRows(person.organization_id, person.id, Number(year));
  const declaration = await declarationClient().findFirst({
    where: {
      organization_id: person.organization_id,
      person_id: person.id,
      fiscal_year: Number(year),
      status: "ACTIVE",
    },
    orderBy: [{ declaration_date: "desc" }],
  });

  const position = computeAnnualPosition({
    year: Number(year),
    payouts,
    declaration,
  });

  const relationship = await relationshipClient().findFirst({
    where: {
      organization_id: person.organization_id,
      person_id: person.id,
      relationship_type: "SPORT_COCOCO",
    },
    orderBy: [{ start_date: "desc" }],
  });

  const drift = relationship
    ? computePositionDrift({
        position,
        payouts,
        relationshipType: "SPORT_COCOCO",
        socialCoverage: normalizeSocialCoverage(person.social_coverage),
      })
    : null;

  return { position, drift, engineSnapshot: toEngineSnapshot(position) };
};

export const listYearPositions = async (
  filter: { organizationId?: string | null; year?: number | string | null },
  scope?: SportWorkScope,
) => {
  const organizationId = resolveOrganizationId(scope, filter.organizationId);
  const year = Number(filter.year);

  return positionClient().findMany({
    where: {
      organization_id: organizationId,
      ...(Number.isInteger(year) ? { year } : {}),
    },
    orderBy: [{ year: "desc" }, { progressive: "desc" }],
  });
};

export { asText as sportWorkText, asRecord as sportWorkRecord };
