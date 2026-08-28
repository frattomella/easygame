import {
  roundMoney,
  startOfDay,
  sumMoney,
  toDateOrNull,
  toIsoDate,
  toMoney,
  type CompensationPlanKind,
} from "./model";

/**
 * Il **piano compensi**: da un accordo economico alle sue scadenze.
 *
 * Modulo puro. Genera righe, non le scrive.
 *
 * Due regole governano tutto.
 *
 * 1. **La somma delle rate e l'importo pattuito, al centesimo.** Dividere
 *    1.000 in tre rate produce 333,33 tre volte e perde un centesimo: il
 *    resto va sull'ultima rata. Un piano che non torna al pattuito e un piano
 *    che a fine stagione lascia un residuo che nessuno sa spiegare.
 * 2. **Una rata nasce programmata, non dovuta.** La maturazione e un fatto
 *    successivo — il periodo di competenza e trascorso e il rapporto era
 *    attivo — e la calcola il sistema in modo idempotente. Nessuna schermata
 *    la imposta.
 */

export type PlanItemDraft = {
  sequence: number;
  label: string;
  grossAmount: number;
  dueDate: string;
  accrualPeriodStart: string;
  accrualPeriodEnd: string;
  /** L'anno solare della **scadenza**: una previsione, non l'anno fiscale. */
  scheduledYear: number;
};

export type EqualInstalmentsConfig = {
  kind: "EQUAL_INSTALMENTS";
  totalAmount: number;
  installmentCount: number;
  /** Data della prima scadenza. Le successive cadono di mese in mese. */
  firstDueDate: string;
};

export type MonthlyConfig = {
  kind: "MONTHLY";
  monthlyAmount: number;
  /** `YYYY-MM` inclusi entrambi. */
  startMonth: string;
  endMonth: string;
  /** Giorno del mese in cui cade la scadenza. Default: fine mese. */
  dueDayOfMonth?: number | null;
};

export type CustomConfig = {
  kind: "CUSTOM";
  items: Array<{
    label?: string;
    grossAmount: number;
    dueDate: string;
    accrualPeriodStart?: string | null;
    accrualPeriodEnd?: string | null;
  }>;
};

export type CompensationPlanConfig =
  | EqualInstalmentsConfig
  | MonthlyConfig
  | CustomConfig;

const MONTH_NAMES = [
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

const parseMonthKey = (value: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) {
    throw new Error(`Mese non valido: ${String(value)}. Formato atteso AAAA-MM`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`Mese non valido: ${String(value)}`);
  }
  return { year, month };
};

const lastDayOfMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

const dateInMonth = (year: number, month: number, day?: number | null) => {
  const maxDay = lastDayOfMonth(year, month);
  const chosen = day && day > 0 ? Math.min(day, maxDay) : maxDay;
  return new Date(Date.UTC(year, month - 1, chosen));
};

const addMonths = (date: Date, months: number) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const maxDay = lastDayOfMonth(targetYear, targetMonth + 1);
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, maxDay)));
};

const monthPeriod = (date: Date) => ({
  start: toIsoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))),
  end: toIsoDate(
    new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        lastDayOfMonth(date.getUTCFullYear(), date.getUTCMonth() + 1),
      ),
    ),
  ),
});

/**
 * Spezza un totale in `count` quote che **tornano al totale**.
 *
 * Il resto finisce sull'ultima quota, non distribuito: una rata da 333,34 e
 * leggibile, dieci rate da importi diversi di un centesimo l'una dall'altra
 * no.
 */
export const splitAmount = (total: number, count: number): number[] => {
  const cents = Math.round(roundMoney(total) * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  return Array.from({ length: count }, (_, index) =>
    roundMoney((base + (index === count - 1 ? remainder : 0)) / 100),
  );
};

/** Le scadenze che un piano genera. Non tocca il database. */
export const generatePlanItems = (
  config: CompensationPlanConfig,
): PlanItemDraft[] => {
  if (config.kind === "EQUAL_INSTALMENTS") {
    const count = Math.trunc(Number(config.installmentCount));
    if (!Number.isFinite(count) || count < 1) {
      throw new Error("Il numero di rate deve essere almeno 1");
    }
    if (count > 60) {
      throw new Error("Il numero di rate non puo superare 60");
    }
    const total = toMoney(config.totalAmount);
    if (total <= 0) {
      throw new Error("L'importo del piano deve essere maggiore di zero");
    }
    const first = toDateOrNull(config.firstDueDate);
    if (!first) {
      throw new Error("Data della prima scadenza non valida");
    }

    const amounts = splitAmount(total, count);
    return amounts.map((amount, index) => {
      const due = addMonths(startOfDay(first), index);
      const period = monthPeriod(due);
      return {
        sequence: index + 1,
        label: `Rata ${index + 1} di ${count}`,
        grossAmount: amount,
        dueDate: toIsoDate(due),
        accrualPeriodStart: period.start,
        accrualPeriodEnd: period.end,
        scheduledYear: due.getUTCFullYear(),
      };
    });
  }

  if (config.kind === "MONTHLY") {
    const amount = toMoney(config.monthlyAmount);
    if (amount <= 0) {
      throw new Error("L'importo mensile deve essere maggiore di zero");
    }
    const from = parseMonthKey(config.startMonth);
    const to = parseMonthKey(config.endMonth);
    const span =
      (to.year - from.year) * 12 + (to.month - from.month) + 1;
    if (span < 1) {
      throw new Error("Il mese finale precede quello iniziale");
    }
    if (span > 60) {
      throw new Error("Il piano non puo superare 60 mensilita");
    }

    return Array.from({ length: span }, (_, index) => {
      const absolute = from.month - 1 + index;
      const year = from.year + Math.floor(absolute / 12);
      const month = (absolute % 12) + 1;
      const due = dateInMonth(year, month, config.dueDayOfMonth);
      return {
        sequence: index + 1,
        label: `${MONTH_NAMES[month - 1]} ${year}`,
        grossAmount: amount,
        dueDate: toIsoDate(due),
        accrualPeriodStart: toIsoDate(new Date(Date.UTC(year, month - 1, 1))),
        accrualPeriodEnd: toIsoDate(
          new Date(Date.UTC(year, month - 1, lastDayOfMonth(year, month))),
        ),
        scheduledYear: year,
      };
    });
  }

  const items = Array.isArray(config.items) ? config.items : [];
  if (items.length === 0) {
    throw new Error("Un piano personalizzato deve avere almeno una rata");
  }
  if (items.length > 60) {
    throw new Error("Il numero di rate non puo superare 60");
  }

  return items.map((item, index) => {
    const amount = toMoney(item.grossAmount);
    if (amount <= 0) {
      throw new Error(`Rata ${index + 1}: l'importo deve essere maggiore di zero`);
    }
    const due = toDateOrNull(item.dueDate);
    if (!due) {
      throw new Error(`Rata ${index + 1}: data di scadenza non valida`);
    }
    const period = monthPeriod(due);
    return {
      sequence: index + 1,
      label: String(item.label || "").trim() || `Rata ${index + 1}`,
      grossAmount: amount,
      dueDate: toIsoDate(startOfDay(due)),
      accrualPeriodStart:
        toDateOrNull(item.accrualPeriodStart) !== null
          ? toIsoDate(startOfDay(toDateOrNull(item.accrualPeriodStart) as Date))
          : period.start,
      accrualPeriodEnd:
        toDateOrNull(item.accrualPeriodEnd) !== null
          ? toIsoDate(startOfDay(toDateOrNull(item.accrualPeriodEnd) as Date))
          : period.end,
      scheduledYear: startOfDay(due).getUTCFullYear(),
    };
  });
};

/** Il totale programmato di un piano. */
export const planTotal = (items: PlanItemDraft[]) =>
  sumMoney(items.map((item) => item.grossAmount));

/**
 * Il piano spezzato per **anno solare della scadenza**.
 *
 * Serve a mostrare, prima ancora di erogare, che una stagione 2026/27 non e
 * un anno fiscale: le sue rate ricadono su due franchigie intere e su due
 * rule set diversi. Una schermata che non lo dice lascia credere che i 12.000
 * della stagione siano i 12.000 dell'anno.
 */
export const splitPlanByScheduledYear = (items: PlanItemDraft[]) => {
  const byYear = new Map<number, { year: number; total: number; count: number }>();
  for (const item of items) {
    const entry = byYear.get(item.scheduledYear) || {
      year: item.scheduledYear,
      total: 0,
      count: 0,
    };
    entry.total = roundMoney(entry.total + item.grossAmount);
    entry.count += 1;
    byYear.set(item.scheduledYear, entry);
  }
  return Array.from(byYear.values()).sort((left, right) => left.year - right.year);
};

/* ------------------------------------------------------ maturazione */

export type AccrualInput = {
  grossAmount: number;
  accrualPeriodEnd: string | Date;
  cancelled?: boolean;
  /** Vero se il rapporto e stato attivo per tutto il periodo di competenza. */
  relationshipActiveThroughPeriod: boolean;
  now?: Date;
};

/**
 * Quanto di una rata e **maturato**: dovuto perche il periodo e trascorso e
 * la prestazione e stata resa.
 *
 * Idempotente: rieseguirla sulla stessa rata da lo stesso numero. E la
 * proprieta che permette di rifare il conto ogni notte senza che il maturato
 * si accumuli su se stesso.
 *
 * Un rapporto **sospeso** durante il periodo non fa maturare da solo: la
 * decisione su quanto resti dovuto e umana, e il modulo si limita a non
 * dichiararla per conto di nessuno.
 */
export const computeAccruedAmount = (input: AccrualInput): number => {
  if (input.cancelled) return 0;
  if (!input.relationshipActiveThroughPeriod) return 0;

  const end = toDateOrNull(input.accrualPeriodEnd);
  if (!end) return 0;

  const now = startOfDay(input.now ?? new Date());
  return startOfDay(end).getTime() <= now.getTime()
    ? roundMoney(input.grossAmount)
    : 0;
};

/**
 * I tre numeri che una schermata deve mostrare **separati** (requisito 9).
 *
 * Programmato, maturato e pagato non sono tre valori della stessa colonna:
 * un club che li confonde legge come impegno cio che non e ancora dovuto, e
 * come dovuto cio che ha gia pagato.
 */
export type PlanProgress = {
  scheduled: number;
  accrued: number;
  paid: number;
  remaining: number;
  /** Maturato e non ancora erogato: il debito vero del club verso la persona. */
  accruedUnpaid: number;
};

export const summarizePlanProgress = (
  rows: Array<{
    gross_amount: number;
    accrued_amount?: number | null;
    paid_amount?: number | null;
    status?: string | null;
  }>,
): PlanProgress => {
  const live = rows.filter((row) => String(row.status || "") !== "CANCELLED");
  const scheduled = sumMoney(live.map((row) => Number(row.gross_amount) || 0));
  const accrued = sumMoney(live.map((row) => Number(row.accrued_amount) || 0));
  const paid = sumMoney(live.map((row) => Number(row.paid_amount) || 0));
  return {
    scheduled,
    accrued,
    paid,
    remaining: roundMoney(Math.max(0, scheduled - paid)),
    accruedUnpaid: roundMoney(Math.max(0, accrued - paid)),
  };
};
