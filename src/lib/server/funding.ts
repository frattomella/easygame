import { prisma } from "./prisma";
import {
  buildFundingReconciliation,
  type FundingReconciliation,
} from "@/lib/funding/reconciliation";
import {
  calculatePeriodAccrual,
  generateFundingPeriods,
  normalizeFundingProgram,
  summarizeFunding,
  toFundingAmount,
  validateFundingProgram,
  validateSettlementAllocation,
  type FundingPeriod,
} from "@/lib/funding/funding-model";
import { measureAttendanceByPeriod } from "@/lib/funding/attendance-measure";

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
  allowedOrganizationIds: string[];
};

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

const asText = (value: unknown) => String(value ?? "").trim();

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const ensureOrganizationAccess = (
  scope: FundingScope | undefined,
  organizationId: string | null | undefined,
) => {
  if (!scope) return;
  if (!organizationId) {
    throw denied("contributo senza club");
  }
  if (!scope.allowedOrganizationIds.includes(organizationId)) {
    throw denied("il contributo appartiene a un altro club");
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

  if (wanted) {
    ensureOrganizationAccess(scope, wanted);
    return wanted;
  }

  if (scope.activeOrganizationId) return scope.activeOrganizationId;

  throw new Error("Nessun club attivo selezionato");
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
 * `assignedAmount` predefinito e il plafond del programma; il singolo
 * beneficiario puo averne uno diverso perche gli enti assegnano importi
 * differenziati (ISEE, numero di figli, residenza).
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
 */
const loadAttendanceInputs = async (
  organizationId: string,
  athleteId: string,
) => {
  const [attendance, trainingItems] = await Promise.all([
    (prisma as any).trainingAttendance.findMany({
      where: { organization_id: organizationId, athlete_id: athleteId },
    }),
    (prisma as any).clubResourceItem.findMany({
      where: { organization_id: organizationId, resource_type: "trainings" },
    }),
  ]);

  const trainings = (Array.isArray(trainingItems) ? trainingItems : []).map(
    (item: any) => {
      const payload = asRecord(item.payload);
      return {
        ...payload,
        // L'id logico dell'allenamento sta nel payload; la riga ne ha uno
        // proprio, e le presenze puntano al primo.
        id: asText(payload.id) || asText(item.id),
        date: payload.date ?? item.date,
      };
    },
  );

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
 * Il plafond si consuma in ordine cronologico, quindi il calcolo e una
 * passata sola sui periodi ordinati: il residuo che entra in un periodo
 * dipende da quanto hanno consumato i precedenti.
 *
 * I periodi gia liquidati **non** vengono riscritti — l'ente ha versato su un
 * numero — ma il loro maturato consuma comunque plafond, altrimenti i periodi
 * successivi ne troverebbero piu di quanto ce n'e.
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
  let remainingPlafond = toFundingAmount(enrollment.assigned_amount);
  let skippedSettledPeriods = 0;
  const written: Record<string, any>[] = [];

  for (const period of periods) {
    const existing = existingByIndex.get(period.index);

    if (existing && existing.status === "settled") {
      /*
        Gia liquidato: non si riscrive, ma consuma plafond. Saltarlo del tutto
        farebbe trovare ai periodi successivi un residuo che non esiste.
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
    const result = calculatePeriodAccrual({
      program,
      measuredValue: measure?.value ?? 0,
      remainingPlafond,
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
      accrued_amount: result.accruedAmount,
      unaccrued_amount: result.unaccruedAmount,
      status,
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
  const accrualRows = accrualIds.length
    ? await accrualClient().findMany({ where: { id: { in: accrualIds } } })
    : [];

  for (const row of accrualRows) {
    ensureOrganizationAccess(scope, row.organization_id);
  }

  const settledByAccrual = new Map<string, number>();
  if (accrualIds.length) {
    const existingLines = await settlementLineClient().findMany({
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

  const settledAt = toDateOrNull(input.settledAt) || new Date();

  return (prisma as any).$transaction(async (client: any) => {
    const settlement = await client.fundingSettlement.create({
      data: {
        organization_id: program.organization_id,
        program_id: program.id,
        reference: asText(input.reference) || null,
        settled_at: settledAt,
        amount: toFundingAmount(input.amount),
        method: asText(input.method) || null,
        notes: asText(input.notes) || null,
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

    overviews.push({
      enrollment,
      program,
      accruals: Array.isArray(accruals) ? accruals : [],
      summary: summarizeFunding({
        assignedAmount: enrollment.assigned_amount,
        accruals,
        settlementLines: lines,
      }),
    });
  }

  return overviews;
};
