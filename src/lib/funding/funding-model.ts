/**
 * Voucher e contributi legati alla frequenza (Workstream A, ADR-0037).
 *
 * **Il problema che questo modulo risolve.** Un contributo pubblico non e un
 * pagamento della famiglia, e un voucher assegnato non e denaro incassato. Fra
 * «assegnato» e «arrivato in banca» ci sono almeno tre passaggi che possono
 * fallire separatamente: l'atleta deve frequentare abbastanza da far maturare
 * il periodo, il club deve rendicontarlo, l'ente deve liquidarlo. Trattarli
 * come un numero solo vuol dire, prima o poi, contare come cassa dei soldi che
 * nessuno ha versato.
 *
 * Qui i cinque importi restano cinque:
 *
 * | Importo | Cosa significa |
 * |---|---|
 * | **assegnato** | il plafond che l'ente ha riservato all'atleta |
 * | **maturato** | quanto ne ha guadagnato frequentando |
 * | **rendicontato** | quanto e stato dichiarato all'ente |
 * | **liquidato** | quanto l'ente ha effettivamente versato |
 * | **residuo** | quanto del plafond puo ancora maturare |
 *
 * **Nessuna regola di un singolo bando vive nel codice.** Importo per periodo,
 * frequenza, requisito minimo, unita del requisito, comportamento sotto soglia
 * e tetti sono configurazione. Il Voucher per lo Sport della Regione Lazio
 * 2025 — plafond di 500 EUR, mensilita che matura al raggiungimento di una
 * soglia oraria — e un insieme di valori, non un ramo dentro il calcolo. Un
 * test lo configura come caso di regressione, e nessuna sua costante compare
 * in questo file.
 *
 * Modulo puro: nessuna dipendenza da Prisma, React o rete.
 */

/* ------------------------------------------------------------ vocabolario */

/** Ogni quanto matura un periodo. */
export const FUNDING_PERIOD_FREQUENCIES = ["monthly", "days"] as const;
export type FundingPeriodFrequency =
  (typeof FUNDING_PERIOD_FREQUENCIES)[number];

/**
 * In che cosa si misura il requisito.
 *
 * `hours` somma la durata degli allenamenti a cui l'atleta risulta presente;
 * `sessions` ne conta il numero. Sono due metriche diverse e non
 * intercambiabili: un bando che chiede «almeno 8 ore al mese» non e
 * soddisfatto da otto presenze da venti minuti.
 */
export const FUNDING_REQUIREMENT_UNITS = ["hours", "sessions"] as const;
export type FundingRequirementUnit =
  (typeof FUNDING_REQUIREMENT_UNITS)[number];

/**
 * Cosa succede quando il requisito non e raggiunto.
 *
 * - `none` — il periodo non matura niente. E il comportamento dei bandi a
 *   soglia, fra cui il caso di riferimento;
 * - `prorata` — matura in proporzione a quanto e stato fatto;
 * - `full` — matura comunque per intero: il requisito e solo un dato da
 *   rendicontare.
 */
export const FUNDING_UNMET_BEHAVIORS = ["none", "prorata", "full"] as const;
export type FundingUnmetBehavior = (typeof FUNDING_UNMET_BEHAVIORS)[number];

export const FUNDING_PROGRAM_STATUSES = ["draft", "active", "closed"] as const;
export type FundingProgramStatus = (typeof FUNDING_PROGRAM_STATUSES)[number];

export const FUNDING_ENROLLMENT_STATUSES = [
  "active",
  "suspended",
  "closed",
] as const;
export type FundingEnrollmentStatus =
  (typeof FUNDING_ENROLLMENT_STATUSES)[number];

/**
 * Il ciclo di vita di un periodo maturato.
 *
 * `not_accrued` non e un errore: e il periodo in cui l'atleta non ha
 * frequentato abbastanza, e va mostrato lo stesso — sapere quanto si e perso
 * e la ragione per cui una segreteria guarda questa tabella.
 */
export const FUNDING_ACCRUAL_STATUSES = [
  "not_accrued",
  "accrued",
  "reported",
  "settled",
] as const;
export type FundingAccrualStatus = (typeof FUNDING_ACCRUAL_STATUSES)[number];

export type NormalizedFundingProgram = {
  id: string | null;
  organizationId: string | null;
  name: string;
  funderName: string;
  status: FundingProgramStatus;
  validFrom: string | null;
  validTo: string | null;
  athletePlafond: number;
  periodAmount: number;
  periodFrequency: FundingPeriodFrequency;
  periodLengthDays: number | null;
  requirementUnit: FundingRequirementUnit;
  requirementMin: number;
  unmetBehavior: FundingUnmetBehavior;
  maxPeriods: number | null;
  maxTotalAmount: number | null;
  notes: string | null;
  data: Record<string, any>;
};

export type FundingPeriod = {
  index: number;
  label: string;
  /** Inizio incluso, in ISO. */
  start: string;
  /** Fine **inclusa**, in ISO: l'ultimo giorno del periodo e dentro. */
  end: string;
};

/* ---------------------------------------------------------------- utility */

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const asText = (value: unknown) => String(value ?? "").trim();

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return "";
};

/** Un importo in euro, al centesimo. I confronti si fanno in centesimi. */
export const toFundingAmount = (value: unknown) => {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(asText(value).replace(",", "."));
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
};

const toCents = (value: unknown) => Math.round(toFundingAmount(value) * 100);
const fromCents = (cents: number) => Number((cents / 100).toFixed(2));

/**
 * Una misura del requisito: ore o presenze.
 *
 * Non passa da `toFundingAmount` perche non e denaro — le ore si arrotondano
 * al centesimo di ora (36 secondi) e non al centesimo di euro, ed e comodo che
 * i due arrotondamenti restino due funzioni diverse.
 */
export const toFundingMeasure = (value: unknown) => {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(asText(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : 0;
};

const toIsoOrNull = (value: unknown) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  const raw = asText(value);
  if (!raw) return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const toPositiveInteger = (value: unknown) => {
  const parsed = Number.parseInt(asText(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const pickEnum = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T => {
  const token = asText(value).toLowerCase();
  return (allowed as readonly string[]).includes(token) ? (token as T) : fallback;
};

/* ---------------------------------------------------- normalizzazione */

export const normalizeFundingProgram = (
  value: unknown,
): NormalizedFundingProgram => {
  const record = asRecord(value);

  return {
    id: firstText(record.id) || null,
    organizationId:
      firstText(record.organization_id, record.organizationId) || null,
    name: firstText(record.name) || "Programma senza nome",
    funderName: firstText(record.funder_name, record.funderName) || "",
    status: pickEnum(record.status, FUNDING_PROGRAM_STATUSES, "draft"),
    validFrom: toIsoOrNull(record.valid_from ?? record.validFrom),
    validTo: toIsoOrNull(record.valid_to ?? record.validTo),
    athletePlafond: toFundingAmount(
      record.athlete_plafond ?? record.athletePlafond,
    ),
    periodAmount: toFundingAmount(record.period_amount ?? record.periodAmount),
    periodFrequency: pickEnum(
      record.period_frequency ?? record.periodFrequency,
      FUNDING_PERIOD_FREQUENCIES,
      "monthly",
    ),
    periodLengthDays: toPositiveInteger(
      record.period_length_days ?? record.periodLengthDays,
    ),
    requirementUnit: pickEnum(
      record.requirement_unit ?? record.requirementUnit,
      FUNDING_REQUIREMENT_UNITS,
      "hours",
    ),
    requirementMin: toFundingMeasure(
      record.requirement_min ?? record.requirementMin,
    ),
    unmetBehavior: pickEnum(
      record.unmet_behavior ?? record.unmetBehavior,
      FUNDING_UNMET_BEHAVIORS,
      "none",
    ),
    maxPeriods: toPositiveInteger(record.max_periods ?? record.maxPeriods),
    maxTotalAmount:
      record.max_total_amount ?? record.maxTotalAmount
        ? toFundingAmount(record.max_total_amount ?? record.maxTotalAmount)
        : null,
    notes: firstText(record.notes) || null,
    data: asRecord(record.data),
  };
};

/**
 * Valida la configurazione di un programma prima di salvarla.
 *
 * Restituisce il messaggio dell'errore, o `null`. Vive qui perche la stessa
 * regola deve valere per il pannello di configurazione e per il route
 * handler: una soglia salvata a zero su un bando a soglia farebbe maturare
 * tutto, e nessuno se ne accorgerebbe fino alla rendicontazione.
 */
export const validateFundingProgram = (value: unknown): string | null => {
  const program = normalizeFundingProgram(value);

  if (!program.name || program.name === "Programma senza nome") {
    return "Il programma deve avere un nome";
  }

  if (!program.funderName) {
    return "Indica l'ente finanziatore";
  }

  if (!program.validFrom || !program.validTo) {
    return "Indica il periodo di validita del programma";
  }

  if (new Date(program.validTo) < new Date(program.validFrom)) {
    return "Il periodo di validita finisce prima di cominciare";
  }

  if (!(program.athletePlafond > 0)) {
    return "Il plafond per atleta deve essere maggiore di zero";
  }

  if (!(program.periodAmount > 0)) {
    return "L'importo riconosciuto per periodo deve essere maggiore di zero";
  }

  if (program.periodFrequency === "days" && !program.periodLengthDays) {
    return "Con la frequenza a giorni serve la lunghezza del periodo";
  }

  if (program.unmetBehavior !== "full" && !(program.requirementMin > 0)) {
    return "Con un comportamento a soglia serve un requisito minimo maggiore di zero";
  }

  return null;
};

/* -------------------------------------------------------------- periodi */

const MONTH_LABELS = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

const startOfUtcDay = (value: Date) =>
  new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );

const addUtcDays = (value: Date, days: number) => {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

/**
 * I periodi di un programma, dal primo all'ultimo.
 *
 * **Perche i periodi non sono una tabella.** Sono interamente derivabili dalla
 * configurazione: salvarli sarebbe una seconda fonte di verita per qualcosa
 * che si ricalcola in un microsecondo, con il rischio classico che le due
 * divergano il giorno in cui qualcuno corregge le date del bando. Il periodo
 * viene denormalizzato **dentro il maturato**, dove serve a spiegare un
 * importo gia calcolato e dove congelarlo e giusto.
 *
 * Il mensile segue il **mese di calendario**, non trenta giorni dall'inizio:
 * un bando che dice «mensilita» intende gennaio, febbraio, marzo, e una
 * rendicontazione sfasata di qualche giorno non e accettabile per l'ente. Il
 * primo e l'ultimo periodo possono quindi essere parziali, e restano tali
 * invece di essere allungati oltre la validita del programma.
 */
export const generateFundingPeriods = (
  program: unknown,
  options: { until?: Date | string | null } = {},
): FundingPeriod[] => {
  const normalized = normalizeFundingProgram(program);
  if (!normalized.validFrom || !normalized.validTo) {
    return [];
  }

  const from = startOfUtcDay(new Date(normalized.validFrom));
  const declaredTo = startOfUtcDay(new Date(normalized.validTo));
  const requestedUntil = options.until
    ? startOfUtcDay(new Date(options.until))
    : null;

  /*
    `until` accorcia, non allunga: serve a chiedere «i periodi fino a oggi»
    senza far comparire mensilita future, ma non puo estendere un programma
    oltre la sua validita.
  */
  const to =
    requestedUntil && requestedUntil < declaredTo ? requestedUntil : declaredTo;

  if (to < from) {
    return [];
  }

  const periods: FundingPeriod[] = [];
  const limit = normalized.maxPeriods ?? Number.MAX_SAFE_INTEGER;
  /*
    Tetto di sicurezza indipendente dalla configurazione: un programma con date
    sbagliate non deve poter generare un milione di periodi e bloccare il
    processo. 600 periodi coprono cinquant'anni di mensilita.
  */
  const HARD_LIMIT = 600;

  let cursor = from;
  let index = 0;

  while (cursor <= to && index < limit && index < HARD_LIMIT) {
    let periodEnd: Date;
    let label: string;

    if (normalized.periodFrequency === "monthly") {
      const lastDayOfMonth = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0),
      );
      periodEnd = lastDayOfMonth > to ? to : lastDayOfMonth;
      label = `${MONTH_LABELS[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`;
    } else {
      const length = normalized.periodLengthDays || 30;
      const naturalEnd = addUtcDays(cursor, length - 1);
      periodEnd = naturalEnd > to ? to : naturalEnd;
      label = `Periodo ${index + 1}`;
    }

    periods.push({
      index,
      label,
      start: cursor.toISOString(),
      end: periodEnd.toISOString(),
    });

    cursor = addUtcDays(periodEnd, 1);
    index += 1;
  }

  return periods;
};

/* ------------------------------------------------------------- maturato */

export type PeriodAccrualResult = {
  requirementMin: number;
  requirementUnit: FundingRequirementUnit;
  measuredValue: number;
  requirementMet: boolean;
  /** Quanto varrebbe il periodo se maturasse per intero. */
  eligibleAmount: number;
  /** Quanto matura davvero, dopo soglia e plafond residuo. */
  accruedAmount: number;
  /** Quanto e andato perso: `eligibleAmount - accruedAmount`. */
  unaccruedAmount: number;
  status: FundingAccrualStatus;
  /** Perche l'importo e quello: si mostra all'operatore, non si deduce. */
  reason: string;
};

/**
 * Quanto matura un periodo.
 *
 * `remainingPlafond` e cio che resta del plafond dell'atleta **prima** di
 * questo periodo: e la ragione per cui il calcolo va fatto in ordine
 * cronologico e non periodo per periodo in isolamento. Con un plafond di 500 e
 * mensilita da 60, l'ultima mensilita utile matura 20 e non 60.
 */
export const calculatePeriodAccrual = ({
  program,
  measuredValue,
  remainingPlafond,
}: {
  program: unknown;
  measuredValue: unknown;
  remainingPlafond: unknown;
}): PeriodAccrualResult => {
  const normalized = normalizeFundingProgram(program);
  const measured = toFundingMeasure(measuredValue);
  const requirement = normalized.requirementMin;
  const eligible = normalized.periodAmount;
  const remainingCents = Math.max(0, toCents(remainingPlafond));

  const met = requirement <= 0 ? measured > 0 : measured >= requirement;

  let grossCents: number;
  let reason: string;

  if (met) {
    grossCents = toCents(eligible);
    reason = "Requisito raggiunto";
  } else if (normalized.unmetBehavior === "full") {
    grossCents = toCents(eligible);
    reason = "Il programma riconosce il periodo anche sotto la soglia";
  } else if (normalized.unmetBehavior === "prorata") {
    const ratio = requirement > 0 ? Math.min(1, measured / requirement) : 0;
    grossCents = Math.round(toCents(eligible) * ratio);
    reason =
      grossCents > 0
        ? "Sotto la soglia: riconosciuto in proporzione"
        : "Nessuna frequenza registrata nel periodo";
  } else {
    grossCents = 0;
    reason =
      measured > 0
        ? `Sotto la soglia di ${requirement} ${requirementUnitLabel(normalized.requirementUnit)}`
        : "Nessuna frequenza registrata nel periodo";
  }

  const cappedCents = Math.min(grossCents, remainingCents);
  if (cappedCents < grossCents) {
    reason =
      cappedCents > 0
        ? "Plafond quasi esaurito: riconosciuto fino al residuo"
        : "Plafond esaurito";
  }

  return {
    requirementMin: requirement,
    requirementUnit: normalized.requirementUnit,
    measuredValue: measured,
    requirementMet: met,
    eligibleAmount: eligible,
    accruedAmount: fromCents(cappedCents),
    unaccruedAmount: fromCents(Math.max(0, toCents(eligible) - cappedCents)),
    status: cappedCents > 0 ? "accrued" : "not_accrued",
    reason,
  };
};

export const requirementUnitLabel = (unit: FundingRequirementUnit) =>
  unit === "sessions" ? "presenze" : "ore";

/**
 * Il maturato di **tutti** i periodi di un beneficiario, in ordine.
 *
 * Va fatto in una passata sola e in ordine cronologico perche il plafond e
 * condiviso fra i periodi: il residuo che entra in un periodo dipende da
 * quanto hanno consumato i precedenti.
 */
export const calculateEnrollmentAccruals = ({
  program,
  assignedAmount,
  periods,
  measureForPeriod,
}: {
  program: unknown;
  assignedAmount: unknown;
  periods: FundingPeriod[];
  /** Quante ore o presenze valide ha l'atleta in quel periodo. */
  measureForPeriod: (period: FundingPeriod) => number;
}) => {
  let remainingCents = Math.max(0, toCents(assignedAmount));

  return periods.map((period) => {
    const result = calculatePeriodAccrual({
      program,
      measuredValue: measureForPeriod(period),
      remainingPlafond: fromCents(remainingCents),
    });

    remainingCents = Math.max(0, remainingCents - toCents(result.accruedAmount));

    return { period, ...result };
  });
};

/* ------------------------------------------------------------ riepilogo */

export type FundingSummary = {
  /** Il plafond riservato all'atleta. **Non e denaro incassato.** */
  assignedAmount: number;
  /** Quanto ha guadagnato frequentando. E un credito, non cassa. */
  accruedAmount: number;
  /** Quanto e stato dichiarato all'ente. */
  reportedAmount: number;
  /** Quanto l'ente ha versato davvero. Questo, e solo questo, e cassa. */
  settledAmount: number;
  /** Maturato ma non ancora liquidato. */
  pendingSettlementAmount: number;
  /** Quanto del plafond puo ancora maturare. */
  residualAmount: number;
  /** Quanto e andato perso perche il requisito non e stato raggiunto. */
  unaccruedAmount: number;
  periodCount: number;
  accruedPeriodCount: number;
  missedPeriodCount: number;
};

const accrualStatusOf = (accrual: Record<string, any>): FundingAccrualStatus =>
  pickEnum(accrual.status, FUNDING_ACCRUAL_STATUSES, "not_accrued");

/**
 * I cinque importi di un beneficiario, piu cio che serve a spiegarli.
 *
 * `settledAmount` si legge dalle **righe di liquidazione**, non dallo stato
 * del maturato: lo stato dice che una liquidazione e arrivata, le righe dicono
 * quanto. Con liquidazioni parziali — che sono la norma — i due numeri
 * differiscono, e quello autorevole e il secondo.
 */
export const summarizeFunding = ({
  assignedAmount,
  accruals = [],
  settlementLines = [],
}: {
  assignedAmount: unknown;
  accruals?: unknown[];
  settlementLines?: unknown[];
}): FundingSummary => {
  const assignedCents = Math.max(0, toCents(assignedAmount));

  let accruedCents = 0;
  let reportedCents = 0;
  let unaccruedCents = 0;
  let accruedPeriodCount = 0;
  let missedPeriodCount = 0;

  for (const raw of Array.isArray(accruals) ? accruals : []) {
    const accrual = asRecord(raw);
    const status = accrualStatusOf(accrual);
    const accrued = toCents(accrual.accrued_amount ?? accrual.accruedAmount);

    accruedCents += accrued;
    unaccruedCents += toCents(
      accrual.unaccrued_amount ?? accrual.unaccruedAmount,
    );

    if (status === "reported" || status === "settled") {
      reportedCents += accrued;
    }

    if (accrued > 0) accruedPeriodCount += 1;
    else missedPeriodCount += 1;
  }

  const settledCents = (Array.isArray(settlementLines) ? settlementLines : [])
    .map((line) => toCents(asRecord(line).amount))
    .reduce((total, value) => total + value, 0);

  return {
    assignedAmount: fromCents(assignedCents),
    accruedAmount: fromCents(accruedCents),
    reportedAmount: fromCents(reportedCents),
    settledAmount: fromCents(settledCents),
    pendingSettlementAmount: fromCents(Math.max(0, accruedCents - settledCents)),
    residualAmount: fromCents(Math.max(0, assignedCents - accruedCents)),
    unaccruedAmount: fromCents(unaccruedCents),
    periodCount: (Array.isArray(accruals) ? accruals : []).length,
    accruedPeriodCount,
    missedPeriodCount,
  };
};

/**
 * Somma i riepiloghi di piu programmi dello stesso atleta.
 *
 * Un atleta puo beneficiare di due contributi insieme — un voucher regionale e
 * uno comunale — e la scheda economica deve poterli mostrare come un totale
 * oltre che uno per uno.
 */
export const mergeFundingSummaries = (
  summaries: FundingSummary[] = [],
): FundingSummary =>
  summaries.reduce<FundingSummary>(
    (total, summary) => ({
      assignedAmount: fromCents(
        toCents(total.assignedAmount) + toCents(summary.assignedAmount),
      ),
      accruedAmount: fromCents(
        toCents(total.accruedAmount) + toCents(summary.accruedAmount),
      ),
      reportedAmount: fromCents(
        toCents(total.reportedAmount) + toCents(summary.reportedAmount),
      ),
      settledAmount: fromCents(
        toCents(total.settledAmount) + toCents(summary.settledAmount),
      ),
      pendingSettlementAmount: fromCents(
        toCents(total.pendingSettlementAmount) +
          toCents(summary.pendingSettlementAmount),
      ),
      residualAmount: fromCents(
        toCents(total.residualAmount) + toCents(summary.residualAmount),
      ),
      unaccruedAmount: fromCents(
        toCents(total.unaccruedAmount) + toCents(summary.unaccruedAmount),
      ),
      periodCount: total.periodCount + summary.periodCount,
      accruedPeriodCount:
        total.accruedPeriodCount + summary.accruedPeriodCount,
      missedPeriodCount: total.missedPeriodCount + summary.missedPeriodCount,
    }),
    {
      assignedAmount: 0,
      accruedAmount: 0,
      reportedAmount: 0,
      settledAmount: 0,
      pendingSettlementAmount: 0,
      residualAmount: 0,
      unaccruedAmount: 0,
      periodCount: 0,
      accruedPeriodCount: 0,
      missedPeriodCount: 0,
    },
  );

/**
 * Valida la ripartizione di una liquidazione sui periodi maturati.
 *
 * L'ente versa in blocco; le righe dicono a chi e a cosa quel bonifico si
 * riferisce. Senza questa validazione «liquidato» diventerebbe un totale che
 * non si puo attribuire, oppure si potrebbe liquidare piu di quanto e maturato.
 */
export const validateSettlementAllocation = ({
  amount,
  lines = [],
  accrualsById = new Map<string, { accruedAmount: number; settledAmount: number }>(),
}: {
  amount: unknown;
  lines?: Array<{ accrualId: string; amount: unknown }>;
  accrualsById?: Map<string, { accruedAmount: number; settledAmount: number }>;
}): string | null => {
  const totalCents = toCents(amount);

  if (!(totalCents > 0)) {
    return "L'importo della liquidazione deve essere maggiore di zero";
  }

  if (lines.length === 0) {
    return "Indica a quali periodi si riferisce la liquidazione";
  }

  let allocatedCents = 0;
  const seen = new Set<string>();

  for (const line of lines) {
    const lineCents = toCents(line.amount);
    if (!(lineCents > 0)) {
      return "Ogni riga della liquidazione deve avere un importo maggiore di zero";
    }

    if (seen.has(line.accrualId)) {
      return "Lo stesso periodo compare due volte nella liquidazione";
    }
    seen.add(line.accrualId);

    const accrual = accrualsById.get(line.accrualId);
    if (!accrual) {
      return "Una riga della liquidazione punta a un periodo che non esiste";
    }

    const availableCents =
      toCents(accrual.accruedAmount) - toCents(accrual.settledAmount);
    if (lineCents > availableCents) {
      return `Non si puo liquidare piu di quanto e maturato: restano ${fromCents(Math.max(0, availableCents)).toFixed(2)} EUR su quel periodo`;
    }

    allocatedCents += lineCents;
  }

  if (allocatedCents !== totalCents) {
    return `La ripartizione (${fromCents(allocatedCents).toFixed(2)} EUR) non corrisponde all'importo liquidato (${fromCents(totalCents).toFixed(2)} EUR)`;
  }

  return null;
};
