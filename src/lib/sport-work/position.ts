import {
  affectsAnnualPosition,
  roundMoney,
  sumMoney,
  toDateOrNull,
  type OutboundTransactionType,
} from "./model";
import {
  computeCompensationPayout,
  emptyPosition,
  type AnnualPositionSnapshot,
} from "./engine";
import { tryRulesFor, type SocialCoverage } from "./rules";
import type { RelationshipType } from "./model";

/**
 * La **posizione annua** di una persona: quanto ha percepito da questo club
 * nell'anno solare, quanto ha dichiarato di aver percepito altrove, quanta
 * franchigia resta e quanti contributi sono maturati.
 *
 * Modulo puro: riceve le righe, non le legge.
 *
 * **Perche i totali si sommano dagli snapshot congelati e non si ricalcolano.**
 * Ogni erogazione porta con se le regole e i progressivi con cui e nata. Se
 * domani arriva un'autocertificazione che dice che il lavoratore aveva gia
 * 4.000 euro di compensi esterni, i contributi gia versati su quelle
 * erogazioni **non cambiano**: sono stati versati. Ricalcolarli riscriverebbe
 * la storia e farebbe sparire una differenza che invece qualcuno deve vedere e
 * sanare.
 *
 * Da qui `computePositionDrift`: la differenza fra cio che e stato calcolato
 * e cio che si calcolerebbe oggi, **mostrata e mai scritta**. E l'equivalente
 * in uscita dello storno — si corregge aggiungendo, non sovrascrivendo.
 */

/** Una riga del registro in uscita, per quel che serve alla posizione. */
export type PositionPayoutRow = {
  id: string;
  transaction_type: OutboundTransactionType | string;
  gross_amount: number;
  paid_at: Date | string;
  fiscal_year: number;
  employee_contribution?: number | null;
  employer_contribution?: number | null;
  taxable_social?: number | null;
  social_franchise_used?: number | null;
  taxable_fiscal?: number | null;
  fiscal_franchise_used?: number | null;
  reversal_of_id?: string | null;
  reversed_at?: Date | string | null;
};

/** L'autocertificazione valida per l'anno, se c'e. */
export type PositionDeclaration = {
  id: string;
  fiscal_year: number;
  external_amount: number;
  declaration_date: Date | string;
  effective_from?: Date | string | null;
  status?: string | null;
};

export type AnnualPosition = {
  year: number;
  /** Erogato dal club nell'anno, al netto degli storni. */
  clubGross: number;
  /** Dichiarato dal lavoratore per altri committenti. */
  externalDeclared: number;
  progressive: number;
  socialFranchise: number;
  socialFranchiseUsed: number;
  socialFranchiseRemaining: number;
  socialTaxable: number;
  employeeContribution: number;
  employerContribution: number;
  fiscalFranchise: number;
  fiscalFranchiseUsed: number;
  fiscalFranchiseRemaining: number;
  fiscalTaxable: number;
  /** Sempre 0 in V1: EasyGame non opera ritenute. */
  withheld: number;
  paymentCount: number;
  lastPaymentAt: string | null;
  lastDeclarationAt: string | null;
  hasCurrentDeclaration: boolean;
  /** Vero se la dichiarazione attiva e piu recente dell'ultima erogazione. */
  declarationArrivedAfterPayment: boolean;
  computedAt: string;
};

/**
 * Vero se la riga entra nella posizione annua.
 *
 * **Una coppia stornata esce a due a due.** L'originale porta `reversed_at`,
 * lo storno porta `reversal_of_id`: escludendone uno solo la somma
 * resterebbe negativa di un compenso intero, e la persona risulterebbe avere
 * franchigia residua che non ha. Escludendoli entrambi la coppia vale zero,
 * che e quello che significa uno storno.
 *
 * Restano fuori anche premi, rimborsi e versamenti contributivi: non
 * consumano le franchigie del lavoratore, e sommarli dichiarerebbe
 * superamenti che non ci sono.
 */
const isCounted = (row: PositionPayoutRow) => {
  const type = String(row.transaction_type) as OutboundTransactionType;
  if (!affectsAnnualPosition(type)) return false;
  if (row.reversed_at) return false;
  if (row.reversal_of_id) return false;
  return true;
};

/**
 * La posizione annua a partire dalle righe del registro e dalla
 * dichiarazione attiva.
 *
 * Le soglie e la franchigia residua si leggono dal rule set dell'anno. Se
 * l'anno non e configurato le soglie valgono `0` e la funzione **non
 * solleva**: una schermata di sola lettura deve poter mostrare gli importi
 * erogati anche per un anno di cui non conosciamo le regole. Chi vuole
 * *calcolare* un'erogazione passa dal motore, che invece fallisce.
 */
export const computeAnnualPosition = (input: {
  year: number;
  payouts: PositionPayoutRow[];
  declaration?: PositionDeclaration | null;
  now?: Date;
}): AnnualPosition => {
  const year = Number(input.year);
  const rows = (input.payouts || []).filter(
    (row) => Number(row.fiscal_year) === year && isCounted(row),
  );

  const rules = tryRulesFor(year);
  const socialFranchise = rules?.socialFranchise.value ?? 0;
  const fiscalFranchise = rules?.fiscalFranchise.value ?? 0;

  const clubGross = sumMoney(rows.map((row) => Number(row.gross_amount) || 0));
  const declaration =
    input.declaration && Number(input.declaration.fiscal_year) === year
      ? input.declaration
      : null;
  const externalDeclared = declaration
    ? roundMoney(Math.max(0, Number(declaration.external_amount) || 0))
    : 0;

  const progressive = roundMoney(clubGross + externalDeclared);

  const paidDates = rows
    .map((row) => toDateOrNull(row.paid_at))
    .filter((date): date is Date => Boolean(date))
    .sort((left, right) => left.getTime() - right.getTime());
  const lastPaymentAt = paidDates.length
    ? paidDates[paidDates.length - 1].toISOString()
    : null;

  const declaredAt = declaration
    ? (toDateOrNull(declaration.declaration_date)?.toISOString() ?? null)
    : null;

  return {
    year,
    clubGross,
    externalDeclared,
    progressive,
    socialFranchise,
    socialFranchiseUsed: sumMoney(
      rows.map((row) => Number(row.social_franchise_used) || 0),
    ),
    socialFranchiseRemaining: roundMoney(
      Math.max(0, socialFranchise - progressive),
    ),
    socialTaxable: sumMoney(rows.map((row) => Number(row.taxable_social) || 0)),
    employeeContribution: sumMoney(
      rows.map((row) => Number(row.employee_contribution) || 0),
    ),
    employerContribution: sumMoney(
      rows.map((row) => Number(row.employer_contribution) || 0),
    ),
    fiscalFranchise,
    fiscalFranchiseUsed: sumMoney(
      rows.map((row) => Number(row.fiscal_franchise_used) || 0),
    ),
    fiscalFranchiseRemaining: roundMoney(
      Math.max(0, fiscalFranchise - progressive),
    ),
    fiscalTaxable: sumMoney(rows.map((row) => Number(row.taxable_fiscal) || 0)),
    withheld: 0,
    paymentCount: rows.length,
    lastPaymentAt,
    lastDeclarationAt: declaredAt,
    hasCurrentDeclaration: Boolean(declaration),
    declarationArrivedAfterPayment: Boolean(
      declaredAt && lastPaymentAt && declaredAt > lastPaymentAt,
    ),
    computedAt: (input.now ?? new Date()).toISOString(),
  };
};

/** La posizione nella forma che il motore accetta come input. */
export const toEngineSnapshot = (
  position: AnnualPosition,
): AnnualPositionSnapshot => ({
  year: position.year,
  clubGrossPaid: position.clubGross,
  externalDeclared: position.externalDeclared,
  declaredAt: position.lastDeclarationAt,
  hasCurrentDeclaration: position.hasCurrentDeclaration,
});

export const emptyAnnualPosition = (year: number): AnnualPosition =>
  computeAnnualPosition({ year, payouts: [], declaration: null });

export { emptyPosition };

/* ------------------------------------------------------- scostamento */

export type PositionDrift = {
  year: number;
  /** Contributi effettivamente congelati sulle erogazioni dell'anno. */
  frozenEmployeeContribution: number;
  frozenEmployerContribution: number;
  /** Contributi che si calcolerebbero oggi, con la dichiarazione attuale. */
  recomputedEmployeeContribution: number;
  recomputedEmployerContribution: number;
  employeeDelta: number;
  employerDelta: number;
  /** Vero se i due conti divergono di piu di un centesimo. */
  hasDrift: boolean;
  reason: string | null;
};

/**
 * Quanto il conto **cambierebbe** se si rifacesse oggi.
 *
 * Il caso reale: il club eroga 6.000 euro applicando la franchigia sui propri
 * primi 5.000; due mesi dopo arriva l'autocertificazione che dice che il
 * lavoratore aveva gia percepito 4.000 euro altrove. I contributi dovuti erano
 * 675,75 e ne sono stati calcolati 135,15. La differenza — 540,60 euro, con le
 * sanzioni a carico del club — e esattamente il numero che questa funzione
 * restituisce, e che nessuna riga del registro deve poter riscrivere da sola.
 *
 * Restituisce `null` se l'anno non ha regole configurate: senza regole non
 * c'e un ricalcolo da confrontare.
 */
export const computePositionDrift = (input: {
  position: AnnualPosition;
  payouts: PositionPayoutRow[];
  relationshipType: RelationshipType;
  socialCoverage: SocialCoverage;
}): PositionDrift | null => {
  const { position } = input;
  const rules = tryRulesFor(position.year);
  if (!rules) return null;

  const rows = (input.payouts || [])
    .filter(
      (row) =>
        Number(row.fiscal_year) === position.year &&
        isCounted(row) &&
        Number(row.gross_amount) > 0,
    )
    .sort((left, right) => {
      const l = toDateOrNull(left.paid_at)?.getTime() ?? 0;
      const r = toDateOrNull(right.paid_at)?.getTime() ?? 0;
      return l - r;
    });

  const frozenEmployee = sumMoney(
    rows.map((row) => Number(row.employee_contribution) || 0),
  );
  const frozenEmployer = sumMoney(
    rows.map((row) => Number(row.employer_contribution) || 0),
  );

  /*
    Il ricalcolo riparte da zero e consuma la franchigia **nell'ordine in cui
    il denaro e uscito**, mettendo davanti il dichiarato esterno: e l'ipotesi
    prudente, quella che il committente avrebbe applicato se avesse saputo.
  */
  let replayed = emptyPosition(position.year);
  replayed = {
    ...replayed,
    externalDeclared: position.externalDeclared,
    declaredAt: position.lastDeclarationAt,
    hasCurrentDeclaration: position.hasCurrentDeclaration,
  };

  let employee = 0;
  let employer = 0;

  for (const row of rows) {
    const computation = computeCompensationPayout({
      grossAmount: Number(row.gross_amount) || 0,
      paidAt: row.paid_at,
      relationshipType: input.relationshipType,
      socialCoverage: input.socialCoverage,
      position: replayed,
      rules,
    });
    employee = roundMoney(employee + computation.employeeContribution);
    employer = roundMoney(employer + computation.employerContribution);
    replayed = {
      ...replayed,
      clubGrossPaid: roundMoney(
        replayed.clubGrossPaid + (Number(row.gross_amount) || 0),
      ),
    };
  }

  const employeeDelta = roundMoney(employee - frozenEmployee);
  const employerDelta = roundMoney(employer - frozenEmployer);
  const hasDrift =
    Math.abs(employeeDelta) >= 0.01 || Math.abs(employerDelta) >= 0.01;

  return {
    year: position.year,
    frozenEmployeeContribution: frozenEmployee,
    frozenEmployerContribution: frozenEmployer,
    recomputedEmployeeContribution: employee,
    recomputedEmployerContribution: employer,
    employeeDelta,
    employerDelta,
    hasDrift,
    reason: hasDrift
      ? position.declarationArrivedAfterPayment
        ? "Una dichiarazione di compensi esterni e arrivata dopo erogazioni gia registrate: i contributi congelati su quelle righe non la conoscevano."
        : "I contributi congelati non coincidono con quelli che si calcolerebbero oggi."
      : null,
  };
};
