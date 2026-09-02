import { prisma } from "./prisma";
import { resolveInboundClassification } from "./fiscal-config";
import { assertContoDelClub } from "./financial-account-guard";
import { canAccessClubResource } from "@/lib/access-roles";
import { AUDIT_ACTIONS, recordAuditEvent } from "./audit";
import {
  buildFundingReconciliation,
  type FundingReconciliation,
} from "@/lib/funding/reconciliation";
import {
  calculatePeriodAccrual,
  generateFundingPeriods,
  normalizeFundingProgram,
  requiresExternalConfirmation,
  summarizeFunding,
  toFundingAmount,
  validateAssignedAmount,
  validateFundingProgram,
  validateSettlementAllocation,
  FUNDING_ACCRUAL_ORIGINS,
  type FundingAccrualOrigin,
  type FundingPeriod,
} from "@/lib/funding/funding-model";
import { measureAttendanceByPeriod } from "@/lib/funding/attendance-measure";
import { toEventLegacyShape } from "@/lib/events/model";
import {
  matchConfirmationsToPeriods,
  parseConfirmationImport,
} from "@/lib/funding/confirmation-import";
import {
  buildSiteIndex,
  filterTrainingsForAthleteGroups,
  getAthleteGroupIds,
  normalizeClubSites,
} from "@/lib/club-sites";

/**
 * Il servizio dei contributi: **l'unico** punto in cui EasyGame calcola un
 * maturato o registra una liquidazione (Workstream A, ADR-0037).
 *
 * Tre proprieta valgono qui e non altrove.
 *
 * 1. **La segreteria non fa calcoli.** `recomputeEnrollmentAccruals` legge le
 *    presenze e gli allenamenti, misura ore o sessioni periodo per periodo,
 *    applica la configurazione del programma e scrive il maturato. Nessun
 *    numero viene digitato a mano.
 * 2. **Il ricalcolo e idempotente.** L'unico `(enrollment_id, period_index)`
 *    fa si che ricalcolare aggiorni la riga del periodo invece di
 *    aggiungerne una seconda. E la proprieta che permette di rifare il conto
 *    ogni volta che qualcuno corregge un appello.
 * 3. **Un periodo gia liquidato non si riscrive.** L'ente ha versato su un
 *    numero: cambiarlo dopo renderebbe la riconciliazione una finzione.
 *
 * Il confine di sicurezza e `organization_id`, come per ogni risorsa di club.
 */

export type FundingScope = {
  userId: string;
  activeOrganizationId: string | null;
  /** Il ruolo nel club attivo. Serve al permesso, che il confine non sostituisce. */
  activeRole?: string | null;
  allowedOrganizationIds: string[];
};

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

const asText = (value: unknown) => String(value ?? "").trim();

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

/**
 * Il confine, ed e il **club attivo** — non l'insieme dei club accessibili.
 *
 * **Il difetto che l'audit della Wave 4 ha misurato qui.** Il confronto era con
 * `allowedOrganizationIds`, cioe con tutti i club a cui l'utente appartiene.
 * Ma il permesso si verifica con `activeRole`, che e il ruolo **nel club
 * attivo**: i due insiemi non coincidono mai per chi ha piu di un club, e
 * chiunque puo crearsi una societa e diventarne proprietario.
 *
 * Bastava mandare `x-active-club-id: <la mia>` insieme all'identificativo di
 * un contributo **di un'altra**, e il permesso veniva concesso con il ruolo
 * sbagliato. L'audit lo ha provato end-to-end: un genitore in un club, e
 * proprietario nel proprio, ha letto l'IBAN altrui, rinominato un conto,
 * registrato un'uscita da 70.000 euro e stornato un movimento.
 *
 * **Era gia stato trovato e chiuso una volta**, in
 * `src/lib/server/document-templates.ts`, con il commento che lo racconta. Sei
 * moduli nuovi lo hanno reintrodotto: la lezione non era nel codice, era in un
 * commento che nessuno ha riletto.
 *
 * La regola giusta e una sola: **la riga deve appartenere al club attivo**. Per
 * lavorare su un altro club si cambia club, e il ruolo viene risolto di nuovo
 * per quello.
 */
const ensureOrganizationAccess = (
  scope: FundingScope | undefined,
  organizationId: string | null | undefined,
) => {
  if (!scope) return;
  if (!organizationId) {
    throw denied("contributo senza club");
  }
  const attivo = asText(scope.activeOrganizationId);
  if (!attivo) throw denied("nessun club attivo selezionato");
  if (attivo !== asText(organizationId)) {
    throw denied("non trovato, o non appartiene al club attivo");
  }

  /*
    **E il permesso, che nelle letture non c'era.**

    Le scritture chiedevano `canManageClubConfiguration`; le letture non
    chiedevano niente, e ogni `GET` sotto `/api/v1/funding` era aperta a
    chiunque appartenesse al club — compresa la riconciliazione di un bando e
    il suo export CSV. Sapere **quali famiglie** sono iscritte a un voucher e
    per quanto e un'affermazione sulla loro situazione economica, ed era la
    lettura piu delicata del dominio e l'unica senza porta.

    Il confine dice **su quale club**; questo dice **se puoi**. I due controlli
    sono entrambi obbligatori — vedi `src/lib/auth/active-club-boundary.ts` — e
    stanno insieme perche nessuno ne aggiunga uno solo.
  */
  if (!canAccessClubResource(scope.activeRole, "payments", "read")) {
    throw denied(
      "i contributi pubblici li vede chi tiene i conti del club: dicono la situazione economica di una famiglia",
    );
  }
};

const resolveOrganizationId = (
  scope: FundingScope | undefined,
  requested?: string | null,
) => {
  const wanted = asText(requested);

  if (!scope) {
    if (!wanted) throw new Error("Nessun club indicato per il contributo");
    return wanted;
  }

  /*
    **Il permesso non dipende da come la richiesta e scritta.**

    Il controllo di ruolo viveva dentro `ensureOrganizationAccess`, ma questa
    funzione la chiamava **solo** sul ramo in cui il chiamante nominava un
    club. Il percorso ordinario del client non lo nomina — manda solo
    l'intestazione del club attivo — e prendeva quindi il ramo sotto, dove non
    c'era nessun controllo: la porta era chiusa a chi bussava e aperta a chi
    entrava dal lato.

    Ora il club si **risolve** prima, e si giudica sempre lo stesso: quello su
    cui si sta per lavorare.
  */
  const risolto = wanted || asText(scope.activeOrganizationId);
  if (!risolto) throw new Error("Nessun club attivo selezionato");
  ensureOrganizationAccess(scope, risolto);
  return risolto;
};

const toDateOrNull = (value: unknown) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const raw = asText(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const programClient = () => (prisma as any).fundingProgram;
const enrollmentClient = () => (prisma as any).fundingEnrollment;
const accrualClient = () => (prisma as any).fundingAccrual;
const settlementClient = () => (prisma as any).fundingSettlement;
const settlementLineClient = () => (prisma as any).fundingSettlementLine;

/* ------------------------------------------------------------- programmi */

export const listFundingPrograms = async (
  filter: { organizationId?: string | null; status?: string | null },
  scope?: FundingScope,
) => {
  const organizationId = resolveOrganizationId(scope, filter.organizationId);
  const status = asText(filter.status);

  return programClient().findMany({
    where: {
      organization_id: organizationId,
      ...(status ? { status } : {}),
    },
    orderBy: [{ valid_from: "desc" }],
  });
};

export const getFundingProgramById = async (
  programId: string,
  scope?: FundingScope,
) => {
  const row = await programClient().findUnique({
    where: { id: asText(programId) },
  });

  if (!row) throw new Error("Programma non trovato");
  ensureOrganizationAccess(scope, row.organization_id);
  return row;
};

const buildProgramData = (input: Record<string, any>) => {
  const normalized = normalizeFundingProgram(input);

  return {
    name: normalized.name,
    funder_name: normalized.funderName,
    status: normalized.status,
    valid_from: new Date(normalized.validFrom as string),
    valid_to: new Date(normalized.validTo as string),
    athlete_plafond: normalized.athletePlafond,
    accrual_source: normalized.accrualSource,
    period_amount: normalized.periodAmount,
    period_frequency: normalized.periodFrequency,
    period_length_days: normalized.periodLengthDays,
    requirement_unit: normalized.requirementUnit,
    requirement_min: normalized.requirementMin,
    unmet_behavior: normalized.unmetBehavior,
    max_periods: normalized.maxPeriods,
    max_total_amount: normalized.maxTotalAmount,
    notes: normalized.notes,
  };
};

export const createFundingProgram = async (
  input: Record<string, any>,
  scope?: FundingScope,
) => {
  const organizationId = resolveOrganizationId(scope, input.organizationId);

  const error = validateFundingProgram(input);
  if (error) throw new Error(error);

  return programClient().create({
    data: {
      ...buildProgramData(input),
      organization_id: organizationId,
      created_by: scope?.userId || null,
      data: {},
    },
  });
};

/**
 * Aggiorna un programma.
 *
 * Non ricalcola i maturati: cambiare una soglia a stagione in corso e una
 * decisione che va vista prima di essere applicata, e il ricalcolo e
 * un'operazione esplicita. Il conteggio dei periodi gia liquidati che
 * cambierebbero viene restituito, cosi l'interfaccia puo dirlo.
 */
export const updateFundingProgram = async (
  programId: string,
  input: Record<string, any>,
  scope?: FundingScope,
) => {
  const existing = await getFundingProgramById(programId, scope);

  const merged = { ...existing, ...input };
  const error = validateFundingProgram(merged);
  if (error) throw new Error(error);

  return programClient().update({
    where: { id: existing.id },
    data: buildProgramData(merged),
  });
};

/* ------------------------------------------------------------ beneficiari */

export const listFundingEnrollments = async (
  filter: {
    organizationId?: string | null;
    programId?: string | null;
    athleteId?: string | null;
  },
  scope?: FundingScope,
) => {
  const organizationId = resolveOrganizationId(scope, filter.organizationId);
  const programId = asText(filter.programId);
  const athleteId = asText(filter.athleteId);

  return enrollmentClient().findMany({
    where: {
      organization_id: organizationId,
      ...(programId ? { program_id: programId } : {}),
      ...(athleteId ? { athlete_id: athleteId } : {}),
    },
    orderBy: [{ enrolled_at: "asc" }],
  });
};

export const getFundingEnrollmentById = async (
  enrollmentId: string,
  scope?: FundingScope,
) => {
  const row = await enrollmentClient().findUnique({
    where: { id: asText(enrollmentId) },
  });

  if (!row) throw new Error("Beneficiario non trovato");
  ensureOrganizationAccess(scope, row.organization_id);
  return row;
};

/**
 * Ammette un atleta a un programma.
 *
 * `assignedAmount` e **l'importo utilizzabile presso questo club**, e non il
 * massimale del bando: il programma riconosce fino a 500 EUR a Mario, ma
 * Mario puo decidere di spenderne 300 qui e il resto in un'altra societa.
 * EasyGame conosce solo i 300 e non deve assumere che gli altri 200 siano
 * disponibili — sono il limite entro cui l'iscrizione puo maturare.
 *
 * Il massimale serve a **validare** l'assegnato, non a sostituirlo: senza
 * indicazione esplicita l'assegnato coincide con il massimale, che e il caso
 * piu comune (ADR-0054).
 */
export const createFundingEnrollment = async (
  input: {
    programId: unknown;
    athleteId: unknown;
    assignedAmount?: unknown;
    voucherCode?: unknown;
    enrolledAt?: unknown;
    endsAt?: unknown;
    notes?: unknown;
  },
  scope?: FundingScope,
) => {
  const program = await getFundingProgramById(asText(input.programId), scope);
  const athleteId = asText(input.athleteId);

  if (!athleteId) {
    throw new Error("Indica l'atleta beneficiario");
  }

  /*
    **Il beneficiario deve essere del club del programma.**

    L'identificativo dell'atleta arrivava dal corpo della richiesta e non
    veniva confrontato con niente: il programma si risolve nello scope, la
    riga nasce con l'organizzazione del programma, e sembrava chiuso. Non lo
    era — quello che entra nel confine non e la riga, e **l'atleta**.

    Il calcolo del maturato legge le presenze e gli allenamenti del
    beneficiario (`loadAttendanceInputs`): un atleta di un altro club
    iscritto qui avrebbe fatto entrare la sua frequenza in un rendiconto che
    non lo riguarda, e la frequenza di un minore dice dove si trova due volte
    a settimana.

    Ed e un dato che poi **esce**: la rendicontazione all'ente porta nome e
    ore del beneficiario.
  */
  const beneficiario = await (prisma as any).athlete.findUnique({
    where: { id: athleteId },
    select: { organization_id: true },
  });

  if (
    !beneficiario ||
    asText(beneficiario.organization_id) !== asText(program.organization_id)
  ) {
    /*
      «Non trovato» e non «negato»: confermare che quell'identificativo
      esiste in un altro club e gia un'informazione, ed e la stessa scelta
      presa su ogni altra lettura per identificativo.
    */
    throw new Error("Atleta non trovato");
  }

  if (program.status === "closed") {
    throw new Error("Il programma e chiuso: non ammette nuovi beneficiari");
  }

  const assignedAmount =
    input.assignedAmount === undefined || input.assignedAmount === null
      ? toFundingAmount(program.athlete_plafond)
      : toFundingAmount(input.assignedAmount);

  if (!(assignedAmount > 0)) {
    throw new Error("Il plafond assegnato deve essere maggiore di zero");
  }

  const assignedError = validateAssignedAmount({ program, assignedAmount });
  if (assignedError) throw new Error(assignedError);

  const existing = await enrollmentClient().findFirst({
    where: { program_id: program.id, athlete_id: athleteId },
  });

  if (existing) {
    throw new Error("L'atleta e gia beneficiario di questo programma");
  }

  return enrollmentClient().create({
    data: {
      organization_id: program.organization_id,
      program_id: program.id,
      athlete_id: athleteId,
      voucher_code: asText(input.voucherCode) || null,
      assigned_amount: assignedAmount,
      status: "active",
      enrolled_at: toDateOrNull(input.enrolledAt) || new Date(program.valid_from),
      ends_at: toDateOrNull(input.endsAt),
      notes: asText(input.notes) || null,
      created_by: scope?.userId || null,
      data: {},
    },
  });
};

/* ----------------------------------------------------- maturato: calcolo */

/**
 * Le presenze e gli allenamenti che servono a misurare la frequenza.
 *
 * Gli allenamenti vivono in `club_resource_items` con
 * `resource_type = "trainings"`: il payload porta data e orari, e da li si
 * ricavano le ore. Si leggono qui, in un punto solo, invece di essere passati
 * dal chiamante — un contributo calcolato su dati scelti da chi chiama non e
 * verificabile.
 *
 * **Gli allenamenti di un'altra squadra non contano** (ADR-0055). Mario si
 * allena con `Pulcini · Scauri`: l'esistenza di un allenamento di
 * `Pulcini · Santi Cosma` non deve produrgli ne ore ne previsione, nemmeno se
 * un appello sbagliato lo aveva segnato presente. Un allenamento che non
 * dichiara nessun gruppo resta dentro: e un dato precedente ai gruppi, ed
 * escluderlo cancellerebbe frequenza vera da stagioni gia rendicontate.
 *
 * **Esportata perche la frequenza si misura in un posto solo.** Dal W1-G la
 * consuma anche il risolutore dei segnaposto: l'attestazione di frequenza
 * risponde alla stessa domanda del rendiconto di un bando — «quante ore ha
 * fatto questo atleta in questo periodo» — e una seconda lettura delle
 * presenze significherebbe un club che attesta un numero e ne rendiconta un
 * altro.
 */
export const loadAttendanceInputs = async (
  organizationId: string,
  athleteId: string,
) => {
  /*
    **La fonte della presenza e la riga, non la copia JSON** (ADR-0098).

    Prima si leggevano `training_attendance` e `club_resource_items`: la prima
    era la tabella, la seconda la copia che il salvataggio scriveva accanto. Da
    quando l'evento e una riga, l'allenamento e la presenza vengono dalla stessa
    fonte e non possono piu dire due cose diverse.
  */
  const [attendanceRows, eventRows, club, memberships] = await Promise.all([
    (prisma as any).clubEventParticipant.findMany({
      where: { organization_id: organizationId, athlete_id: athleteId },
    }),
    (prisma as any).clubEvent.findMany({
      where: { organization_id: organizationId, kind: "training" },
    }),
    (prisma as any).club.findUnique({
      where: { id: organizationId },
      select: { club_sites: true },
    }),
    (prisma as any).athleteCategoryMembership.findMany({
      where: { organization_id: organizationId, athlete_id: athleteId },
    }),
  ]);

  const allTrainings = (Array.isArray(eventRows) ? eventRows : []).map(
    (row: any) => toEventLegacyShape(row),
  );

  /*
    La misura incrocia presenza e allenamento per identificativo: si usa quello
    **storico** finche la proiezione esiste, perche e quello che
    `toEventLegacyShape` mette in `id`.
  */
  const legacyIdPerEvento = new Map(
    (Array.isArray(eventRows) ? eventRows : []).map((row: any) => [
      asText(row.id),
      asText(row.legacy_id || row.id),
    ]),
  );
  const attendance = (Array.isArray(attendanceRows) ? attendanceRows : []).map(
    (row: any) => ({
      ...row,
      training_id:
        legacyIdPerEvento.get(asText(row.event_id)) ||
        asText(row.legacy_training_id || row.event_id),
    }),
  );

  const siteIndex = buildSiteIndex(normalizeClubSites(club?.club_sites));
  const athleteGroupIds = getAthleteGroupIds(
    Array.isArray(memberships) ? memberships : [],
    siteIndex,
  );

  const trainings = filterTrainingsForAthleteGroups({
    trainings: allTrainings,
    athleteGroupIds,
  });

  return { attendance, trainings };
};

export type RecomputeResult = {
  enrollment: Record<string, any>;
  accruals: Record<string, any>[];
  skippedSettledPeriods: number;
};

/**
 * Ricalcola il maturato di un beneficiario, periodo per periodo.
 *
 * L'importo assegnato si consuma in ordine cronologico, quindi il calcolo e
 * una passata sola sui periodi ordinati: il residuo che entra in un periodo
 * dipende da quanto hanno consumato i precedenti.
 *
 * I periodi gia liquidati **non** vengono riscritti — l'ente ha versato su un
 * numero — ma il loro maturato consuma comunque l'assegnato, altrimenti i
 * periodi successivi ne troverebbero piu di quanto ce n'e.
 *
 * **Con una fonte esterna il ricalcolo non fa maturare niente** (ADR-0054).
 * Aggiorna la previsione — quanto il periodo varrebbe secondo l'appello di
 * EasyGame — e lascia il maturato a zero finche non arriva una conferma. Una
 * conferma gia registrata non viene mai riscritta da un ricalcolo: e un dato
 * dichiarato da una fonte, non un risultato derivato dalle presenze.
 */
export const recomputeEnrollmentAccruals = async (
  enrollmentId: string,
  scope?: FundingScope,
  options: { until?: Date | string | null } = {},
): Promise<RecomputeResult> => {
  const enrollment = await getFundingEnrollmentById(enrollmentId, scope);
  const program = await getFundingProgramById(enrollment.program_id, scope);

  const periods: FundingPeriod[] = generateFundingPeriods(program, {
    until: options.until ?? new Date(),
  });

  const { attendance, trainings } = await loadAttendanceInputs(
    enrollment.organization_id,
    enrollment.athlete_id,
  );

  const normalizedProgram = normalizeFundingProgram(program);
  const measures = measureAttendanceByPeriod({
    periods,
    trainings,
    attendance,
    requirementUnit: normalizedProgram.requirementUnit,
  });

  const existingRows = await accrualClient().findMany({
    where: { enrollment_id: enrollment.id },
  });
  const existingByIndex = new Map<number, any>(
    (Array.isArray(existingRows) ? existingRows : []).map((row: any) => [
      Number(row.period_index),
      row,
    ]),
  );

  const now = new Date();
  const external = requiresExternalConfirmation(program);
  let remainingPlafond = toFundingAmount(enrollment.assigned_amount);
  let skippedSettledPeriods = 0;
  const written: Record<string, any>[] = [];

  for (const period of periods) {
    const existing = existingByIndex.get(period.index);

    if (existing && existing.status === "settled") {
      /*
        Gia liquidato: non si riscrive, ma consuma l'assegnato. Saltarlo del
        tutto farebbe trovare ai periodi successivi un residuo che non esiste.
      */
      remainingPlafond = Math.max(
        0,
        Number(
          (remainingPlafond - toFundingAmount(existing.accrued_amount)).toFixed(
            2,
          ),
        ),
      );
      skippedSettledPeriods += 1;
      written.push(existing);
      continue;
    }

    const measure = measures[period.index];

    /*
      Una conferma esterna gia registrata e un dato, non un derivato: il
      ricalcolo aggiorna la previsione attorno a essa e ne lascia l'importo
      dov'e. Riscriverla dalle presenze significherebbe che il numero
      dichiarato all'ente cambia da solo quando qualcuno corregge un appello.
    */
    const existingConfirmation =
      external && existing?.confirmed_at
        ? {
            amount: toFundingAmount(existing.accrued_amount),
            origin: (asText(existing.accrual_origin) ||
              "manual_confirmation") as FundingAccrualOrigin,
          }
        : null;

    const result = calculatePeriodAccrual({
      program,
      measuredValue: measure?.value ?? 0,
      remainingPlafond,
      confirmedAmount: existingConfirmation ? existingConfirmation.amount : null,
      confirmationOrigin: existingConfirmation?.origin,
    });

    remainingPlafond = Math.max(
      0,
      Number((remainingPlafond - result.accruedAmount).toFixed(2)),
    );

    /*
      Un periodo gia rendicontato resta rendicontato se l'importo non cambia;
      se cambia torna a «maturato», perche cio che era stato dichiarato
      all'ente non corrisponde piu.
    */
    const amountChanged =
      existing &&
      toFundingAmount(existing.accrued_amount) !== result.accruedAmount;
    const status =
      existing?.status === "reported" && !amountChanged
        ? "reported"
        : result.status;

    const data = {
      organization_id: enrollment.organization_id,
      enrollment_id: enrollment.id,
      period_index: period.index,
      period_start: new Date(period.start),
      period_end: new Date(period.end),
      period_label: period.label,
      requirement_min: result.requirementMin,
      requirement_unit: result.requirementUnit,
      measured_value: result.measuredValue,
      requirement_met: result.requirementMet,
      eligible_amount: result.eligibleAmount,
      estimated_amount: result.estimatedAmount,
      accrued_amount: result.accruedAmount,
      unaccrued_amount: result.unaccruedAmount,
      status,
      accrual_origin: result.origin,
      confirmed_at: existingConfirmation ? existing?.confirmed_at ?? null : null,
      confirmed_by: existingConfirmation ? existing?.confirmed_by ?? null : null,
      external_reference: existingConfirmation
        ? existing?.external_reference ?? null
        : null,
      confirmation_notes: existingConfirmation
        ? existing?.confirmation_notes ?? null
        : null,
      reported_at: status === "reported" ? existing?.reported_at ?? null : null,
      reported_by: status === "reported" ? existing?.reported_by ?? null : null,
      computed_at: now,
      data: {
        reason: result.reason,
        sessions: measure?.sessions ?? 0,
        hours: measure?.hours ?? 0,
        sessionsWithoutDuration: measure?.sessionsWithoutDuration ?? 0,
      },
    };

    const row = existing
      ? await accrualClient().update({ where: { id: existing.id }, data })
      : await accrualClient().create({ data });

    written.push(row);
  }

  return { enrollment, accruals: written, skippedSettledPeriods };
};

/* -------------------------------------------- maturato: conferma esterna */

export type AccrualConfirmationInput = {
  /** Il periodo da confermare, per indice o per id della riga. */
  accrualId?: unknown;
  periodIndex?: unknown;
  /** Quanto la fonte ufficiale ha riconosciuto. */
  amount: unknown;
  confirmedAt?: unknown;
  externalReference?: unknown;
  notes?: unknown;
};

const resolveConfirmationOrigin = (value: unknown): FundingAccrualOrigin => {
  const token = asText(value).toLowerCase();
  return (FUNDING_ACCRUAL_ORIGINS as readonly string[]).includes(token)
    ? (token as FundingAccrualOrigin)
    : "manual_confirmation";
};

/**
 * Registra la **conferma di maturazione** di uno o piu periodi.
 *
 * E l'atto che, su un programma a fonte esterna, trasforma una previsione in
 * un credito. Resta separato dal ricalcolo di proposito: il ricalcolo legge
 * le presenze di EasyGame, la conferma dichiara cio che la piattaforma
 * dell'ente ha riconosciuto, e le due cose possono non coincidere.
 *
 * **Tre limiti non negoziabili** (ADR-0054):
 *
 * 1. non si conferma su un programma la cui fonte e l'appello di EasyGame:
 *    li il maturato si ricalcola, e digitarlo a mano riaprirebbe la porta
 *    all'importo inventato;
 * 2. la somma dei confermati non supera **l'importo assegnato al club**, che
 *    e il tetto vero dell'iscrizione;
 * 3. un periodo gia liquidato non si tocca: l'ente ha versato su quel numero.
 *
 * La conferma resta auditabile — data, utente, riferimento esterno, nota — e
 * una correzione successiva sovrascrive l'importo lasciando la traccia
 * precedente in `data.previousConfirmations`.
 */
export const confirmAccrualPeriods = async (
  input: {
    enrollmentId: unknown;
    confirmations: AccrualConfirmationInput[];
    origin?: unknown;
  },
  scope?: FundingScope,
) => {
  const enrollment = await getFundingEnrollmentById(
    asText(input.enrollmentId),
    scope,
  );
  const program = await getFundingProgramById(enrollment.program_id, scope);

  if (!requiresExternalConfirmation(program)) {
    throw new Error(
      "Questo programma matura dalle presenze EasyGame: il maturato si ricalcola, non si conferma a mano",
    );
  }

  const confirmations = (
    Array.isArray(input.confirmations) ? input.confirmations : []
  ).filter(Boolean);

  if (!confirmations.length) {
    throw new Error("Indica quali periodi stai confermando");
  }

  const origin = resolveConfirmationOrigin(input.origin);
  const rows = await accrualClient().findMany({
    where: { enrollment_id: enrollment.id },
    orderBy: [{ period_index: "asc" }],
  });
  const existingRows: any[] = Array.isArray(rows) ? rows : [];

  const byId = new Map(existingRows.map((row) => [String(row.id), row]));
  const byIndex = new Map(
    existingRows.map((row) => [Number(row.period_index), row]),
  );

  const targets = confirmations.map((confirmation) => {
    const row = asText(confirmation.accrualId)
      ? byId.get(asText(confirmation.accrualId))
      : byIndex.get(Number(confirmation.periodIndex));

    if (!row) {
      throw new Error(
        "Un periodo indicato non esiste: ricalcola prima di confermare",
      );
    }

    ensureOrganizationAccess(scope, row.organization_id);

    if (asText(row.status) === "settled") {
      throw new Error(
        `Il periodo «${row.period_label}» e gia liquidato: non si corregge`,
      );
    }

    const amount = toFundingAmount(confirmation.amount);
    if (amount < 0) {
      throw new Error("Un importo confermato non puo essere negativo");
    }

    return { row, amount, confirmation };
  });

  /*
    Il tetto si verifica sul **totale** dopo la conferma, non sulla singola
    riga: confermare due periodi da 200 su un assegnato di 300 e sbagliato
    anche se ognuno dei due, da solo, ci starebbe.
  */
  const confirmedIds = new Set(targets.map((target) => String(target.row.id)));
  const untouchedAccrued = existingRows
    .filter((row) => !confirmedIds.has(String(row.id)))
    .reduce((total, row) => total + toFundingAmount(row.accrued_amount), 0);
  const confirmedTotal = targets.reduce(
    (total, target) => total + target.amount,
    0,
  );
  const assigned = toFundingAmount(enrollment.assigned_amount);

  if (
    Math.round((untouchedAccrued + confirmedTotal) * 100) >
    Math.round(assigned * 100)
  ) {
    throw new Error(
      `La conferma porterebbe il maturato a ${(untouchedAccrued + confirmedTotal).toFixed(2)} EUR, oltre l'importo assegnato al club (${assigned.toFixed(2)} EUR)`,
    );
  }

  const now = new Date();
  const written: Record<string, any>[] = [];

  for (const { row, amount, confirmation } of targets) {
    const previous = Array.isArray(asRecord(row.data).previousConfirmations)
      ? asRecord(row.data).previousConfirmations
      : [];

    /*
      Una correzione non cancella lo storico: l'importo precedente resta
      leggibile con la sua data e il suo autore, perche una rendicontazione
      gia inviata all'ente si spiega con quel numero.
    */
    const history = row.confirmed_at
      ? [
          ...previous,
          {
            amount: toFundingAmount(row.accrued_amount),
            confirmedAt: row.confirmed_at,
            confirmedBy: row.confirmed_by,
            externalReference: row.external_reference,
            notes: row.confirmation_notes,
            origin: row.accrual_origin,
          },
        ]
      : previous;

    const updated = await accrualClient().update({
      where: { id: row.id },
      data: {
        accrued_amount: amount,
        unaccrued_amount: Number(
          Math.max(0, toFundingAmount(row.eligible_amount) - amount).toFixed(2),
        ),
        status: amount > 0 ? "accrued" : "not_accrued",
        accrual_origin: amount > 0 ? origin : null,
        confirmed_at: toDateOrNull(confirmation.confirmedAt) || now,
        confirmed_by: scope?.userId || null,
        external_reference: asText(confirmation.externalReference) || null,
        confirmation_notes: asText(confirmation.notes) || null,
        /*
          Una conferma smentisce cio che era stato dichiarato all'ente: il
          periodo torna «maturato» e va rendicontato di nuovo.
        */
        reported_at: null,
        reported_by: null,
        computed_at: now,
        data: {
          ...asRecord(row.data),
          reason:
            amount > 0
              ? "Confermato dalla fonte ufficiale"
              : "La fonte ufficiale non ha riconosciuto niente per questo periodo",
          previousConfirmations: history,
        },
      },
    });

    written.push(updated);
  }

  return { enrollment, program, accruals: written };
};

export type ConfirmationImportOutcome = {
  enrollment: Record<string, any>;
  accruals: Record<string, any>[];
  /** Righe illeggibili o che non corrispondono a nessun periodo. */
  rejected: Array<{ line: number; content: string; reason: string }>;
};

/**
 * Importa un blocco di conferme da una fonte esterna.
 *
 * E la stessa scrittura di `confirmAccrualPeriods`, con la stessa provenienza
 * dichiarata (`external_import`) e gli stessi tre limiti: nessun import puo
 * fare quello che una conferma a mano non potrebbe.
 *
 * **Nessuna riga sparisce in silenzio.** Cio che il parser non legge e cio che
 * non trova il suo periodo torna indietro elencato: un import che scarta senza
 * dirlo e peggio di un import che fallisce, perche il totale sembra giusto.
 */
export const importAccrualConfirmations = async (
  input: { enrollmentId: unknown; text: unknown; reference?: unknown },
  scope?: FundingScope,
): Promise<ConfirmationImportOutcome> => {
  const enrollment = await getFundingEnrollmentById(
    asText(input.enrollmentId),
    scope,
  );
  const program = await getFundingProgramById(enrollment.program_id, scope);

  if (!requiresExternalConfirmation(program)) {
    throw new Error(
      "Questo programma matura dalle presenze EasyGame: non si importano conferme",
    );
  }

  const parsed = parseConfirmationImport(input.text);
  const periods = generateFundingPeriods(program);
  const { matched, unmatched } = matchConfirmationsToPeriods({
    rows: parsed.rows,
    periods,
  });

  const rejected = [
    ...parsed.rejected,
    ...unmatched.map((row) => ({
      line: row.line,
      content: row.period,
      reason: "Nessun periodo del programma corrisponde",
    })),
  ];

  if (!matched.length) {
    throw new Error(
      rejected.length
        ? `Nessuna riga importabile: ${rejected[0].reason} (riga ${rejected[0].line})`
        : "Il file non contiene nessuna conferma",
    );
  }

  const result = await confirmAccrualPeriods(
    {
      enrollmentId: enrollment.id,
      origin: "external_import",
      confirmations: matched.map((row) => ({
        periodIndex: row.periodIndex,
        amount: row.amount,
        externalReference: row.externalReference || asText(input.reference),
        notes: row.notes,
      })),
    },
    scope,
  );

  return { enrollment: result.enrollment, accruals: result.accruals, rejected };
};

export const listFundingAccruals = async (
  filter: { organizationId?: string | null; enrollmentId?: string | null },
  scope?: FundingScope,
) => {
  const organizationId = resolveOrganizationId(scope, filter.organizationId);
  const enrollmentId = asText(filter.enrollmentId);

  return accrualClient().findMany({
    where: {
      organization_id: organizationId,
      ...(enrollmentId ? { enrollment_id: enrollmentId } : {}),
    },
    orderBy: [{ period_index: "asc" }],
  });
};

/**
 * La riconciliazione di un bando: tutte le righe, per tutti gli atleti.
 *
 * **Perche esiste.** Il primo bando vero non si puo dichiarare affidabile
 * perche i test sono verdi: i test provano che il calcolo faccia quello che
 * la configurazione dice, non che la configurazione dica quello che il bando
 * prevede. Le due cose divergono per un giorno di calendario, per una soglia
 * letta come «almeno» invece che «piu di», per un periodo che l'ente conta dal
 * lunedi e il club dal primo del mese. Chi rendiconta deve poter mettere
 * accanto, riga per riga, cio che EasyGame ha calcolato e cio che l'ente si
 * aspetta.
 *
 * Lettura sola: non ricalcola niente. Il ricalcolo resta un'azione esplicita
 * della segreteria, perche legge tutte le presenze del club.
 */
export const buildProgramReconciliation = async (
  programId: string,
  scope?: FundingScope,
): Promise<FundingReconciliation & { program: Record<string, any> }> => {
  const program = await getFundingProgramById(programId, scope);

  const enrollments = await listFundingEnrollments(
    { organizationId: program.organization_id, programId: program.id },
    scope,
  );

  const enrollmentIds = enrollments.map((enrollment: any) => enrollment.id);

  const accruals = enrollmentIds.length
    ? await accrualClient().findMany({
        where: {
          organization_id: program.organization_id,
          enrollment_id: { in: enrollmentIds },
        },
        orderBy: [{ period_index: "asc" }],
      })
    : [];

  /*
    I nomi si leggono in una volta sola. Una riga di riconciliazione senza il
    nome dell'atleta e inutilizzabile da chi rendiconta, e leggerli uno per
    uno costerebbe una query per periodo.
  */
  const athleteIds = Array.from(
    new Set(enrollments.map((enrollment: any) => String(enrollment.athlete_id))),
  );

  const athletes = athleteIds.length
    ? await (prisma as any).athlete.findMany({
        where: {
          organization_id: program.organization_id,
          id: { in: athleteIds },
        },
        select: { id: true, first_name: true, last_name: true },
      })
    : [];

  const athleteNames: Record<string, string> = {};
  for (const athlete of athletes) {
    athleteNames[athlete.id] =
      `${athlete.last_name || ""} ${athlete.first_name || ""}`.trim();
  }

  return {
    program,
    ...buildFundingReconciliation({ enrollments, accruals, athleteNames }),
  };
};
/**
 * Marca come rendicontati i periodi maturati indicati.
 *
 * «Rendicontato» e una dichiarazione all'ente, non un incasso: sta in mezzo
 * fra maturato e liquidato proprio perche i due momenti sono distinti e
 * possono distare mesi.
 */
export const markAccrualsReported = async (
  accrualIds: string[],
  scope?: FundingScope,
) => {
  const ids = (Array.isArray(accrualIds) ? accrualIds : [])
    .map(asText)
    .filter(Boolean);

  if (ids.length === 0) {
    throw new Error("Indica quali periodi stai rendicontando");
  }

  const rows = await accrualClient().findMany({ where: { id: { in: ids } } });

  for (const row of rows) {
    ensureOrganizationAccess(scope, row.organization_id);

    /*
      Una previsione non si rendiconta. Dichiarare all'ente un importo che la
      sua piattaforma non ha ancora riconosciuto e il difetto che la conferma
      esplicita esiste per impedire (ADR-0054).
    */
    if (asText(row.status) === "pending_confirmation") {
      throw new Error(
        `Il periodo «${row.period_label}» e ancora una previsione: conferma la maturazione prima di rendicontarlo`,
      );
    }

    if (toFundingAmount(row.accrued_amount) <= 0) {
      throw new Error(
        `Il periodo «${row.period_label}» non ha maturato niente: non si rendiconta`,
      );
    }
  }

  if (rows.length !== ids.length) {
    throw new Error("Uno dei periodi indicati non esiste");
  }

  const now = new Date();
  await accrualClient().updateMany({
    where: { id: { in: ids } },
    data: {
      status: "reported",
      reported_at: now,
      reported_by: scope?.userId || null,
    },
  });

  return accrualClient().findMany({ where: { id: { in: ids } } });
};

/* ---------------------------------------------------------- liquidazioni */

export const listFundingSettlements = async (
  filter: { organizationId?: string | null; programId?: string | null },
  scope?: FundingScope,
) => {
  const organizationId = resolveOrganizationId(scope, filter.organizationId);
  const programId = asText(filter.programId);

  return settlementClient().findMany({
    where: {
      organization_id: organizationId,
      ...(programId ? { program_id: programId } : {}),
    },
    orderBy: [{ settled_at: "desc" }],
    include: { lines: true },
  });
};

/**
 * Registra una liquidazione dell'ente e la riconcilia con i periodi maturati.
 *
 * **Perche le righe sono obbligatorie.** Un ente liquida in blocco: un
 * bonifico solo per venti atleti e tre mesi. Senza la ripartizione,
 * «liquidato» sarebbe un totale che non si puo attribuire a nessuno, e la
 * domanda che una segreteria fa davvero — «per questo atleta, quanto e
 * arrivato?» — resterebbe senza risposta.
 *
 * **Perche non nasce un incasso della famiglia.** Il contributo non e un
 * pagamento dell'atleta: confonderli farebbe risultare saldate rate che
 * nessuno ha pagato. Le due contabilita restano separate (ADR-0037).
 */
export const createFundingSettlement = async (
  input: {
    programId: unknown;
    amount: unknown;
    settledAt?: unknown;
    reference?: unknown;
    method?: unknown;
    notes?: unknown;
    /**
     * **Su quale conto e arrivato il bonifico dell'ente.**
     *
     * Senza, la liquidazione era invisibile nel saldo: il credito verso l'ente
     * si chiudeva e il denaro non compariva da nessuna parte. Facoltativo,
     * perche le liquidazioni gia registrate non ce l'hanno.
     */
    financialAccountId?: unknown;
    /**
     * **La voce di rendiconto** (W4-R7).
     *
     * Facoltativa: se tace, il dominio ripiega su `liquidazione_contributo`,
     * che e cio che una liquidazione e sempre. Serve a un club che tenga voci
     * distinte per bando o per ente.
     */
    operationTypeCode?: unknown;
    lines?: Array<{ accrualId: unknown; amount: unknown }>;
  },
  scope?: FundingScope,
) => {
  const program = await getFundingProgramById(asText(input.programId), scope);

  const lines = (Array.isArray(input.lines) ? input.lines : []).map((line) => ({
    accrualId: asText(line.accrualId),
    amount: toFundingAmount(line.amount),
  }));

  const accrualIds = lines.map((line) => line.accrualId).filter(Boolean);
  /*
    Il maturato **non porta il bando**: lo porta la sua iscrizione. Cercare
    un `program_id` sulla riga darebbe sempre indefinito e rifiuterebbe ogni
    liquidazione — un rifiuto che nessuna prova di diniego noterebbe, perche
    negare e cio che si attende.

    Si risolve con una **seconda interrogazione** e non con un `include`:
    una relazione montata dall'ORM e cio che il doppio di questo archivio
    nei test unitari non sa fare, e una guardia che dipende da una capacita
    dell'ORM diventa un rifiuto totale la` dove quella capacita manca.
  */
  const accrualRows = accrualIds.length
    ? await accrualClient().findMany({ where: { id: { in: accrualIds } } })
    : [];

  const enrollmentIds = Array.from(
    new Set(accrualRows.map((row: any) => asText(row.enrollment_id))),
  ).filter(Boolean);

  const programByEnrollment = new Map<string, string>();
  if (enrollmentIds.length) {
    const iscrizioni = await enrollmentClient().findMany({
      where: { id: { in: enrollmentIds } },
      select: { id: true, program_id: true },
    });
    for (const riga of iscrizioni) {
      programByEnrollment.set(asText(riga.id), asText(riga.program_id));
    }
  }

  for (const row of accrualRows) {
    ensureOrganizationAccess(scope, row.organization_id);

    /*
      **Un maturato appartiene al suo bando.**

      Il club era verificato, il bando no: le righe di una liquidazione
      potevano venire da un **altro programma dello stesso club**. Il credito
      verso un ente si chiudeva consumando il maturato di un ente diverso, e i
      due rendiconti — quello che si manda e quello che si tiene — dicevano
      numeri che non tornano.

      Non e una fuga: e un dato che esce verso un ente pubblico con dentro ore
      che quell ente non ha finanziato.
    */
    if (
      programByEnrollment.get(asText(row.enrollment_id)) !==
      asText(program.id)
    ) {
      throw new Error(
        "Una riga della liquidazione non appartiene a questo programma",
      );
    }
  }

  /**
   * **La capienza si misura dentro la transazione, con i periodi bloccati.**
   *
   * Questa verifica girava **prima** di `$transaction`, e niente bloccava i
   * periodi: sei richieste simultanee da 10.000 euro contro un maturato di
   * 10.000 leggevano tutte «capiente» e **quattro passavano**. Quarantamila
   * euro liquidati su diecimila maturati: trentamila inventati, che il
   * registro mostra e che nessuno ha mai ricevuto.
   *
   * Sequenzialmente il controllo era gia corretto — la seconda richiesta viene
   * rifiutata con «restano 0.00 EUR su quel periodo». Era solo la lettura
   * fuori dalla transazione, la stessa forma che
   * `lockInstallmentAndTransaction` chiude sugli incassi delle famiglie.
   */
  const misuraCapienza = async (client: any) => {
    if (accrualIds.length) {
      /*
        `FOR UPDATE` mette in fila chi liquida lo stesso periodo. L'ordine e
        quello degli identificativi, cosi due richieste che toccano gli stessi
        periodi in ordine diverso non si bloccano a vicenda.
      */
      const ordinati = [...accrualIds].sort();
      for (const id of ordinati) {
        await client.$queryRaw`SELECT id FROM funding_accruals WHERE id = ${id}::uuid FOR UPDATE`;
      }
    }

    const settledByAccrual = new Map<string, number>();
    if (accrualIds.length) {
      const existingLines = await client.fundingSettlementLine.findMany({
        where: { accrual_id: { in: accrualIds } },
      });
      for (const line of Array.isArray(existingLines) ? existingLines : []) {
        settledByAccrual.set(
          line.accrual_id,
          Number(
            (
              (settledByAccrual.get(line.accrual_id) || 0) +
              toFundingAmount(line.amount)
            ).toFixed(2),
          ),
        );
      }
    }

    const accrualsById = new Map<
      string,
      { accruedAmount: number; settledAmount: number }
    >(
      accrualRows.map((row: any) => [
        String(row.id),
        {
          accruedAmount: toFundingAmount(row.accrued_amount),
          settledAmount: settledByAccrual.get(row.id) || 0,
        },
      ]),
    );

    const error = validateSettlementAllocation({
      amount: input.amount,
      lines,
      accrualsById,
    });
    if (error) throw new Error(error);

    return accrualsById;
  };

  const settledAt = toDateOrNull(input.settledAt) || new Date();

  /*
    Il conto appartiene al club che scrive: un conto di un altro club produceva
    denaro che il registro mostra e che **nessun saldo contiene**. Vedi
    `financial-account-guard.ts`.
  */
  const contoVerificato = await assertContoDelClub(
    program.organization_id,
    input.financialAccountId,
  );

  return (prisma as any).$transaction(async (client: any) => {
    const accrualsById = await misuraCapienza(client);

    /*
      W4-R7. La liquidazione di un bando usciva dal registro senza causale, e
      con i compensi faceva 7.000 euro su 7.210 del non classificato. Il
      ripiego e `liquidazione_contributo`, perche di questo si tratta sempre:
      qui, a differenza del lavoro sportivo, non c e un sottotipo da cui
      dedurre altro.

      **E una classificazione in ENTRATA, e prima chiedeva quella in uscita.**
      Questa riga registra il bonifico con cui l ente liquida al club i voucher
      maturati: il denaro arriva, e lo dicono lo schema (`financial_account_id`
      e «su quale conto e arrivato il bonifico»), la proiezione del registro e
      la vista SQL, che sul verso leggono entrambe il segno dell importo. Il
      giro alla famiglia e un secondo fatto, che non si registra qui.

      Passando dalla guardia in uscita la causale corretta veniva **rifiutata**
      con un 400, e l unica ammessa era quella che sommava un incasso dentro un
      capitolo di spesa.

      Lo **storno** ha segno opposto — quindi verso `OUT` — ma non ripassa di
      qui: eredita la fotografia della riga che annulla. Il verso da dichiarare
      e percio quello del fatto, non quello della singola riga.
    */
    const classificazione = await resolveInboundClassification({
      organizationId: program.organization_id,
      code: (input as { operationTypeCode?: unknown }).operationTypeCode,
      fallbackCode: "liquidazione_contributo",
    });

    const settlement = await client.fundingSettlement.create({
      data: {
        organization_id: program.organization_id,
        program_id: program.id,
        ...classificazione,
        reference: asText(input.reference) || null,
        settled_at: settledAt,
        amount: toFundingAmount(input.amount),
        method: asText(input.method) || null,
        notes: asText(input.notes) || null,
        financial_account_id: contoVerificato,
        created_by: scope?.userId || null,
      },
    });

    for (const line of lines) {
      await client.fundingSettlementLine.create({
        data: {
          organization_id: program.organization_id,
          settlement_id: settlement.id,
          accrual_id: line.accrualId,
          amount: line.amount,
        },
      });
    }

    /*
      Un periodo diventa «liquidato» solo quando **tutto** il suo maturato e
      stato coperto: con una liquidazione parziale resta rendicontato, e il
      residuo continua a comparire fra i crediti verso l'ente.
    */
    for (const line of lines) {
      const accrual = accrualsById.get(line.accrualId);
      if (!accrual) continue;

      const coveredTotal = Number(
        (accrual.settledAmount + line.amount).toFixed(2),
      );

      if (coveredTotal >= accrual.accruedAmount) {
        await client.fundingAccrual.update({
          where: { id: line.accrualId },
          data: { status: "settled" },
        });
      } else {
        await client.fundingAccrual.update({
          where: { id: line.accrualId },
          data: { status: "reported" },
        });
      }
    }

    return client.fundingSettlement.findUnique({
      where: { id: settlement.id },
      include: { lines: true },
    });
  });
};

/**
 * **Storna una liquidazione registrata per errore.**
 *
 * **Il difetto che chiude.** Il dominio dei bandi non aveva alcun rimedio: non
 * un `update`, non un `delete`, non una rotta. Una liquidazione sbagliata
 * restava — e l'errore non restava fermo, **propagava**: l'accrual passava a
 * `settled`, e da li non si riscriveva piu, non si confermava piu, e
 * l'iscrizione non si cancellava piu. Un bonifico digitato con uno zero di
 * troppo bloccava un periodo per sempre.
 *
 * **La forma e quella che gli altri tre domini usano gia**, e non e stata
 * inventata qui: una riga opposta che cita l'originale, l'originale che resta e
 * porta il motivo, e un indice unico parziale che vieta il doppio storno. Il
 * denaro non si cancella, in nessuno dei cinque domini.
 *
 * **Cosa succede ai periodi.** Le righe di ripartizione dello storno rimettono
 * indietro esattamente cio che avevano coperto, e ogni accrual toccato torna
 * allo stato che gli compete: `reported` se resta scoperto, `settled` se
 * un'altra liquidazione lo copre ancora. Lo stato **si ricalcola**, non si
 * indovina — e la stessa disciplina di `recomputeChargeFromLedger`.
 */
export const reverseFundingSettlement = async (
  input: { settlementId: unknown; reason?: unknown },
  scope?: FundingScope,
) => {
  const settlementId = asText(input.settlementId);
  if (!settlementId) {
    throw new Error("Liquidazione non trovata");
  }

  const original = await settlementClient().findUnique({ where: { id: settlementId } });
  if (!original) {
    throw new Error("Liquidazione non trovata");
  }
  ensureOrganizationAccess(scope, original.organization_id);

  if (original.reversal_of_id) {
    throw new Error("Uno storno non si storna");
  }
  if (original.reversed_at) {
    throw new Error("Questa liquidazione e gia stata stornata");
  }

  const reason = asText(input.reason);
  if (!reason) {
    throw new Error("Uno storno deve dire perche: senza motivo la riga non spiega niente");
  }

  const now = new Date();
  /*
    Le righe si leggono a parte e non con un `include`: la ripartizione e cio
    che lo storno deve rimettere indietro, e leggerla dalla relazione di un
    record gia caricato la rende dipendente da **come** l'originale e stato
    letto. Una lettura esplicita dice cosa serve.
  */
  const lines = await settlementLineClient().findMany({
    where: { settlement_id: original.id },
  });

  const risultato = await (prisma as any).$transaction(async (client: any) => {
    /*
      Marcare **prima** l'originale, e nella stessa transazione: se due richieste
      arrivano insieme, la seconda trova `reversed_at` gia scritto e si ferma
      sull'indice unico parziale invece di produrre due storni.
    */
    await client.fundingSettlement.update({
      where: { id: original.id },
      data: {
        reversed_at: now,
        reversed_by: scope?.userId || null,
        reversal_reason: reason,
      },
    });

    const reversal = await client.fundingSettlement.create({
      data: {
        organization_id: original.organization_id,
        program_id: original.program_id,
        reference: original.reference,
        settled_at: now,
        amount: -toFundingAmount(original.amount),
        method: original.method,
        notes: reason,
        /*
          Lo storno eredita **lo scatto** della causale, non lo ricalcola: se
          la causale e stata rinominata fra la liquidazione e lo storno, le
          due righe devono continuare a dire la stessa cosa, altrimenti la
          voce di rendiconto non torna a zero.
        */
        operation_type_code: original.operation_type_code,
        operation_type_label_snapshot: original.operation_type_label_snapshot,
        activity_scope_snapshot: original.activity_scope_snapshot,
        /* Il denaro torna indietro dal conto su cui era entrato. */
        financial_account_id: original.financial_account_id || null,
        reversal_of_id: original.id,
        created_by: scope?.userId || null,
      },
    });

    for (const line of lines) {
      await client.fundingSettlementLine.create({
        data: {
          organization_id: original.organization_id,
          settlement_id: reversal.id,
          accrual_id: line.accrual_id,
          amount: -toFundingAmount(line.amount),
        },
      });
    }

    /*
      Lo stato di ogni periodo toccato si **ricalcola** dalla somma di tutte le
      righe che lo riguardano, storno compreso. Rimetterlo a `reported` per
      decreto sarebbe sbagliato quando un'altra liquidazione lo copre ancora.
    */
    for (const accrualId of new Set(lines.map((line: any) => String(line.accrual_id)))) {
      const accrual = await client.fundingAccrual.findUnique({ where: { id: accrualId } });
      if (!accrual) continue;

      const tutteLeRighe = await client.fundingSettlementLine.findMany({
        where: { accrual_id: accrualId },
      });
      const coperto = (Array.isArray(tutteLeRighe) ? tutteLeRighe : []).reduce(
        (sum: number, riga: any) => sum + toFundingAmount(riga.amount),
        0,
      );

      await client.fundingAccrual.update({
        where: { id: accrualId },
        data: {
          status:
            Number(coperto.toFixed(2)) >= toFundingAmount(accrual.accrued_amount)
              ? "settled"
              : "reported",
        },
      });
    }

    return client.fundingSettlement.findUnique({
      where: { id: reversal.id },
      include: { lines: true },
    });
  });

  await recordAuditEvent({
    action: AUDIT_ACTIONS.fundingSettlementReversed,
    actorUserId: scope?.userId,
    organizationId: original.organization_id,
    resource: "funding_settlements",
    resourceId: original.id,
    metadata: {
      reversalId: risultato?.id || null,
      amount: toFundingAmount(original.amount),
      reason,
      accrualIds: lines.map((line: any) => String(line.accrual_id)),
    },
  });

  return risultato;
};

/* ------------------------------------------------------------- riepilogo */

export type AthleteFundingOverview = {
  enrollment: Record<string, any>;
  program: Record<string, any>;
  accruals: Record<string, any>[];
  summary: ReturnType<typeof summarizeFunding>;
};

/**
 * I contributi di un atleta, con i cinque importi e il dettaglio dei periodi.
 *
 * E cio che la scheda economica mostra. Il liquidato si legge dalle righe di
 * liquidazione, non dallo stato del periodo: con liquidazioni parziali i due
 * numeri differiscono, e quello autorevole e il primo.
 */
export const getAthleteFundingOverview = async (
  athleteId: string,
  scope?: FundingScope,
  organizationId?: string | null,
): Promise<AthleteFundingOverview[]> => {
  const resolvedOrganizationId = resolveOrganizationId(scope, organizationId);
  const enrollments = await enrollmentClient().findMany({
    where: {
      organization_id: resolvedOrganizationId,
      athlete_id: asText(athleteId),
    },
    orderBy: [{ enrolled_at: "asc" }],
  });

  const overviews: AthleteFundingOverview[] = [];

  for (const enrollment of Array.isArray(enrollments) ? enrollments : []) {
    const [program, accruals] = await Promise.all([
      programClient().findUnique({ where: { id: enrollment.program_id } }),
      accrualClient().findMany({
        where: { enrollment_id: enrollment.id },
        orderBy: [{ period_index: "asc" }],
      }),
    ]);

    const accrualIds = (Array.isArray(accruals) ? accruals : []).map(
      (row: any) => row.id,
    );
    const lines = accrualIds.length
      ? await settlementLineClient().findMany({
          where: { accrual_id: { in: accrualIds } },
        })
      : [];

    /*
      Quanto e stato liquidato **su quel periodo**. Il dettaglio periodo per
      periodo deve poter affiancare rendicontato e liquidato, e con
      liquidazioni parziali il secondo non si deduce dallo stato: si legge
      dalle righe (ADR-0054).
    */
    const settledByAccrual = new Map<string, number>();
    for (const line of Array.isArray(lines) ? lines : []) {
      const key = String((line as any).accrual_id);
      settledByAccrual.set(
        key,
        Number(
          (
            (settledByAccrual.get(key) || 0) +
            toFundingAmount((line as any).amount)
          ).toFixed(2),
        ),
      );
    }

    overviews.push({
      enrollment,
      program,
      accruals: (Array.isArray(accruals) ? accruals : []).map((row: any) => ({
        ...row,
        settled_amount: settledByAccrual.get(String(row.id)) || 0,
      })),
      summary: summarizeFunding({
        assignedAmount: enrollment.assigned_amount,
        accruals,
        settlementLines: lines,
      }),
    });
  }

  return overviews;
};

/* ============================================================ il programma
   aperto: chi c'e dentro, con quanto, e a che punto e
   ========================================================================= */

/**
 * Il dettaglio di un programma: configurazione, beneficiari, e i cinque
 * importi per ognuno.
 *
 * **Perche una funzione sola e non tre chiamate dal client.** Perche la scheda
 * del programma mostra, per ogni atleta, assegnato/maturato/rendicontato/
 * liquidato/residuo — e quei numeri non si sommano nel browser: si ricavano
 * dagli stessi periodi e dalle stesse righe di liquidazione che il dominio
 * conosce. Farli calcolare al client vorrebbe dire riscrivere il dominio in
 * TypeScript di interfaccia, che e il debito D1 che EasyGame sta riducendo.
 *
 * **Perche le query sono quattro e non una per beneficiario.** Un programma
 * regionale ha centinaia di iscritti: una lettura per atleta sarebbe un N+1
 * che cresce con il successo del bando. Maturati e righe di liquidazione si
 * caricano in blocco e si raggruppano in memoria.
 */
export type FundingProgramDetail = {
  program: Record<string, any>;
  enrollments: Array<{
    enrollment: Record<string, any>;
    athlete: { id: string; firstName: string; lastName: string } | null;
    summary: ReturnType<typeof summarizeFunding>;
    /** Vero se sono gia stati rendicontati o liquidati importi. */
    hasSettledHistory: boolean;
  }>;
  totals: {
    enrolledCount: number;
    activeCount: number;
    assignedAmount: number;
    accruedAmount: number;
    reportedAmount: number;
    settledAmount: number;
    residualAmount: number;
  };
};

export const getFundingProgramDetail = async (
  programId: string,
  scope?: FundingScope,
): Promise<FundingProgramDetail> => {
  const program = await getFundingProgramById(programId, scope);

  const enrollments = await enrollmentClient().findMany({
    where: { organization_id: program.organization_id, program_id: program.id },
    orderBy: [{ enrolled_at: "asc" }],
  });

  const rows: any[] = Array.isArray(enrollments) ? enrollments : [];
  const enrollmentIds = rows.map((row) => row.id);
  const athleteIds = Array.from(
    new Set(rows.map((row) => String(row.athlete_id)).filter(Boolean)),
  );

  const [athletes, accruals] = await Promise.all([
    athleteIds.length
      ? (prisma as any).athlete.findMany({
          where: {
            id: { in: athleteIds },
            organization_id: program.organization_id,
          },
          select: { id: true, first_name: true, last_name: true },
        })
      : Promise.resolve([]),
    enrollmentIds.length
      ? accrualClient().findMany({
          where: { enrollment_id: { in: enrollmentIds } },
          orderBy: [{ period_index: "asc" }],
        })
      : Promise.resolve([]),
  ]);

  const accrualRows: any[] = Array.isArray(accruals) ? accruals : [];
  const lines = accrualRows.length
    ? await settlementLineClient().findMany({
        where: { accrual_id: { in: accrualRows.map((row) => row.id) } },
      })
    : [];

  const athleteById = new Map(
    (Array.isArray(athletes) ? athletes : []).map((row: any) => [
      String(row.id),
      {
        id: String(row.id),
        firstName: asText(row.first_name),
        lastName: asText(row.last_name),
      },
    ]),
  );

  const accrualsByEnrollment = new Map<string, any[]>();
  for (const accrual of accrualRows) {
    const key = String(accrual.enrollment_id);
    accrualsByEnrollment.set(key, [
      ...(accrualsByEnrollment.get(key) || []),
      accrual,
    ]);
  }

  const linesByAccrual = new Map<string, any[]>();
  for (const line of Array.isArray(lines) ? lines : []) {
    const key = String((line as any).accrual_id);
    linesByAccrual.set(key, [...(linesByAccrual.get(key) || []), line]);
  }

  const detail: FundingProgramDetail["enrollments"] = rows.map((row) => {
    const own = accrualsByEnrollment.get(String(row.id)) || [];
    const ownLines = own.flatMap(
      (accrual: any) => linesByAccrual.get(String(accrual.id)) || [],
    );

    return {
      enrollment: row,
      athlete: athleteById.get(String(row.athlete_id)) || null,
      summary: summarizeFunding({
        assignedAmount: row.assigned_amount,
        accruals: own,
        settlementLines: ownLines,
      }),
      /*
        «Storico gia maturato o liquidato» e cio che distingue una revoca da una
        cancellazione: un'iscrizione che ha prodotto denaro non si toglie di
        mezzo, si chiude.
      */
      hasSettledHistory:
        ownLines.length > 0 ||
        own.some((accrual: any) =>
          ["reported", "settled"].includes(asText(accrual.status)),
        ),
    };
  });

  const totals = detail.reduce(
    (acc, entry) => ({
      enrolledCount: acc.enrolledCount + 1,
      activeCount:
        acc.activeCount + (asText(entry.enrollment.status) === "active" ? 1 : 0),
      assignedAmount: acc.assignedAmount + entry.summary.assignedAmount,
      accruedAmount: acc.accruedAmount + entry.summary.accruedAmount,
      reportedAmount: acc.reportedAmount + entry.summary.reportedAmount,
      settledAmount: acc.settledAmount + entry.summary.settledAmount,
      residualAmount: acc.residualAmount + entry.summary.residualAmount,
    }),
    {
      enrolledCount: 0,
      activeCount: 0,
      assignedAmount: 0,
      accruedAmount: 0,
      reportedAmount: 0,
      settledAmount: 0,
      residualAmount: 0,
    },
  );

  return {
    program,
    enrollments: detail,
    totals: {
      ...totals,
      assignedAmount: Number(totals.assignedAmount.toFixed(2)),
      accruedAmount: Number(totals.accruedAmount.toFixed(2)),
      reportedAmount: Number(totals.reportedAmount.toFixed(2)),
      settledAmount: Number(totals.settledAmount.toFixed(2)),
      residualAmount: Number(totals.residualAmount.toFixed(2)),
    },
  };
};

/**
 * Gli atleti che si possono ancora iscrivere a un programma.
 *
 * **Perche l'elenco lo calcola il server.** Perche «non ancora iscritti» e una
 * differenza fra due insiemi, e farla nel browser vorrebbe dire mandargli
 * l'anagrafica intera per poi scartarne meta — su un club con duemila atleti e
 * cinque megabyte per aprire una tendina.
 */
export const listEnrollableAthletes = async (
  programId: string,
  scope?: FundingScope,
): Promise<Array<{ id: string; firstName: string; lastName: string }>> => {
  const program = await getFundingProgramById(programId, scope);

  const [athletes, enrollments] = await Promise.all([
    (prisma as any).athlete.findMany({
      where: { organization_id: program.organization_id },
      select: { id: true, first_name: true, last_name: true },
      orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
    }),
    enrollmentClient().findMany({
      where: { program_id: program.id },
      select: { athlete_id: true },
    }),
  ]);

  const alreadyEnrolled = new Set(
    (Array.isArray(enrollments) ? enrollments : []).map((row: any) =>
      String(row.athlete_id),
    ),
  );

  return (Array.isArray(athletes) ? athletes : [])
    .filter((row: any) => !alreadyEnrolled.has(String(row.id)))
    .map((row: any) => ({
      id: String(row.id),
      firstName: asText(row.first_name),
      lastName: asText(row.last_name),
    }));
};

/**
 * I programmi a cui un atleta si puo ancora iscrivere.
 *
 * E la stessa domanda di sopra girata: la scheda atleta parte dall'atleta e
 * cerca il programma. Le due direzioni usano **lo stesso servizio di
 * iscrizione**, e questa e solo la lista da cui scegliere.
 */
export const listEnrollableProgramsForAthlete = async (
  athleteId: string,
  scope?: FundingScope,
  organizationId?: string | null,
): Promise<Record<string, any>[]> => {
  const resolvedOrganizationId = resolveOrganizationId(scope, organizationId);
  const id = asText(athleteId);

  const [programs, enrollments] = await Promise.all([
    programClient().findMany({
      where: { organization_id: resolvedOrganizationId },
      orderBy: [{ valid_from: "desc" }],
    }),
    enrollmentClient().findMany({
      where: { organization_id: resolvedOrganizationId, athlete_id: id },
      select: { program_id: true },
    }),
  ]);

  const enrolled = new Set(
    (Array.isArray(enrollments) ? enrollments : []).map((row: any) =>
      String(row.program_id),
    ),
  );

  /*
    Un programma `closed` non ammette nuovi beneficiari — lo dice gia
    `createFundingEnrollment` — e offrirlo nella tendina significherebbe far
    scegliere qualcosa che poi viene rifiutato.
  */
  return (Array.isArray(programs) ? programs : []).filter(
    (program: any) =>
      !enrolled.has(String(program.id)) && asText(program.status) !== "closed",
  );
};

/**
 * Ammette **piu atleti** a un programma, in una sola operazione.
 *
 * **Perche non fallisce tutta insieme.** Iscrivere trenta atleti e un'azione
 * di segreteria: se il ventitreesimo risulta gia iscritto, rifiutare l'intero
 * lotto costringerebbe a rifare la selezione a mano per capire quale. Ogni
 * atleta ha il suo esito, e chi ha premuto vede cosa e passato e cosa no.
 *
 * **Perche non e transazionale, e va detto.** Le iscrizioni riuscite restano
 * anche se una fallisce. E il comportamento giusto qui — un'iscrizione e un
 * atto indipendente dalle altre — ma non e quello di una transazione, e chi
 * legge il codice deve saperlo.
 */
export type BulkEnrollmentOutcome = {
  created: Record<string, any>[];
  skipped: Array<{ athleteId: string; reason: string }>;
};

export const createFundingEnrollments = async (
  input: {
    programId: unknown;
    athleteIds: unknown;
    /** Valori per atleta, quando l'ente assegna importi differenziati. */
    perAthlete?: Record<
      string,
      { assignedAmount?: unknown; voucherCode?: unknown }
    >;
    assignedAmount?: unknown;
    enrolledAt?: unknown;
    endsAt?: unknown;
    notes?: unknown;
  },
  scope?: FundingScope,
): Promise<BulkEnrollmentOutcome> => {
  const athleteIds = Array.from(
    new Set(
      (Array.isArray(input.athleteIds) ? input.athleteIds : [])
        .map(asText)
        .filter(Boolean),
    ),
  );

  if (!athleteIds.length) {
    throw new Error("Seleziona almeno un atleta da iscrivere");
  }

  const created: Record<string, any>[] = [];
  const skipped: BulkEnrollmentOutcome["skipped"] = [];

  for (const athleteId of athleteIds) {
    const overrides = input.perAthlete?.[athleteId] || {};

    try {
      created.push(
        await createFundingEnrollment(
          {
            programId: input.programId,
            athleteId,
            assignedAmount:
              overrides.assignedAmount === undefined
                ? input.assignedAmount
                : overrides.assignedAmount,
            voucherCode: overrides.voucherCode,
            enrolledAt: input.enrolledAt,
            endsAt: input.endsAt,
            notes: input.notes,
          },
          scope,
        ),
      );
    } catch (error: any) {
      const message = String(error?.message || "Iscrizione non riuscita");

      /*
        Un «Accesso negato» non e l'esito di un atleta: e un problema
        dell'intera operazione, e continuare vorrebbe dire nasconderlo dentro
        un elenco di righe saltate.
      */
      if (message.includes("Accesso negato")) throw error;

      skipped.push({ athleteId, reason: message });
    }
  }

  return { created, skipped };
};

/**
 * Aggiorna un'iscrizione: plafond individuale, codice voucher, stato.
 *
 * **Il plafond non puo scendere sotto il gia maturato.** Abbassarlo sotto
 * quello che l'atleta ha gia maturato produrrebbe un residuo negativo, e un
 * residuo negativo non significa niente: significa che qualcuno ha assegnato
 * meno di quanto e gia stato riconosciuto.
 */
export const updateFundingEnrollment = async (
  enrollmentId: string,
  updates: {
    assignedAmount?: unknown;
    voucherCode?: unknown;
    status?: unknown;
    endsAt?: unknown;
    notes?: unknown;
  },
  scope?: FundingScope,
) => {
  const enrollment = await getFundingEnrollmentById(enrollmentId, scope);
  const data: Record<string, any> = {};

  if (updates.assignedAmount !== undefined) {
    const assignedAmount = toFundingAmount(updates.assignedAmount);
    if (!(assignedAmount > 0)) {
      throw new Error("Il plafond assegnato deve essere maggiore di zero");
    }

    const accruals = await accrualClient().findMany({
      where: { enrollment_id: enrollment.id },
    });

    const accrued = (Array.isArray(accruals) ? accruals : []).reduce(
      (total: number, row: any) =>
        total + toFundingAmount(row.accrued_amount ?? row.accruedAmount),
      0,
    );

    if (assignedAmount < accrued) {
      throw new Error(
        `Il plafond non puo scendere sotto il gia maturato (${accrued.toFixed(2)} €)`,
      );
    }

    /*
      L'assegnato resta dentro il massimale del bando: e la sola relazione fra
      i due numeri, e va verificata anche in modifica — altrimenti il limite
      varrebbe solo alla prima iscrizione (ADR-0054).
    */
    const program = await getFundingProgramById(enrollment.program_id, scope);
    const assignedError = validateAssignedAmount({
      program,
      assignedAmount,
      alreadyAccrued: accrued,
    });
    if (assignedError) throw new Error(assignedError);

    data.assigned_amount = assignedAmount;
  }

  if (updates.voucherCode !== undefined) {
    data.voucher_code = asText(updates.voucherCode) || null;
  }

  if (updates.status !== undefined) {
    const status = asText(updates.status);
    if (!["active", "suspended", "closed"].includes(status)) {
      throw new Error("Stato dell'iscrizione non riconosciuto");
    }
    data.status = status;
  }

  if (updates.endsAt !== undefined) {
    data.ends_at = toDateOrNull(updates.endsAt);
  }

  if (updates.notes !== undefined) {
    data.notes = asText(updates.notes) || null;
  }

  if (!Object.keys(data).length) return enrollment;

  return enrollmentClient().update({
    where: { id: enrollment.id },
    data,
  });
};

/**
 * Toglie un atleta da un programma.
 *
 * **Cancella solo se non e mai successo niente.** Un'iscrizione che ha gia
 * prodotto maturati rendicontati o righe di liquidazione **non si cancella**:
 * quei numeri sono stati comunicati a un ente e, in parte, gia incassati.
 * Portarla via si porterebbe dietro la traccia di denaro vero. In quel caso
 * l'iscrizione si **revoca** — passa a `closed`, smette di maturare, e resta
 * leggibile.
 *
 * Restituisce quale delle due cose e successa, perche l'interfaccia deve
 * poterlo dire a chi ha premuto invece di far sparire una riga in silenzio.
 */
export const removeFundingEnrollment = async (
  enrollmentId: string,
  input: { reason?: unknown } = {},
  scope?: FundingScope,
): Promise<{ outcome: "deleted" | "revoked"; enrollment: Record<string, any> }> => {
  const enrollment = await getFundingEnrollmentById(enrollmentId, scope);

  const accruals = await accrualClient().findMany({
    where: { enrollment_id: enrollment.id },
  });

  const accrualRows: any[] = Array.isArray(accruals) ? accruals : [];
  const lines = accrualRows.length
    ? await settlementLineClient().findMany({
        where: { accrual_id: { in: accrualRows.map((row) => row.id) } },
      })
    : [];

  const hasHistory =
    (Array.isArray(lines) ? lines : []).length > 0 ||
    accrualRows.some((row) => ["reported", "settled"].includes(asText(row.status)));

  if (hasHistory) {
    const revoked = await enrollmentClient().update({
      where: { id: enrollment.id },
      data: {
        status: "closed",
        ends_at: new Date(),
        notes: asText(input.reason) || enrollment.notes,
      },
    });

    return { outcome: "revoked", enrollment: revoked };
  }

  /*
    Nessuno storico: si cancellano anche i maturati calcolati, che sono un
    risultato derivato dalle presenze e si ricalcolano da soli. Lasciarli
    orfani riempirebbe la riconciliazione di righe senza beneficiario.
  */
  if (accrualRows.length) {
    await accrualClient().deleteMany({ where: { enrollment_id: enrollment.id } });
  }

  const deleted = await enrollmentClient().delete({
    where: { id: enrollment.id },
  });

  return { outcome: "deleted", enrollment: deleted };
};
