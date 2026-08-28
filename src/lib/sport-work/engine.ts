import {
  buildRuleSnapshot,
  canRuleProduceDefinitiveCalculation,
  listPendingRules,
  rulesFor,
  type RuleSnapshot,
  type SocialCoverage,
  type SportWorkRuleSet,
} from "./rules";
import {
  fiscalYearOfPayment,
  roundMoney,
  toDateOrNull,
  usesSportWorkEngine,
  type RelationshipType,
} from "./model";

/**
 * Il **motore** del lavoro sportivo: dato un lordo da erogare, la posizione
 * annua del lavoratore e le regole dell'anno, produce imponibili, contributi,
 * netto, costo del club — **e la motivazione di ogni numero**.
 *
 * Modulo puro. Nessun DOM, nessuna rete, nessun Prisma. Si prova riga per
 * riga, e i casi di prova sono gli esempi A–E del cap. 7.3 dell'analisi 28.
 *
 * Quattro proprieta lo definiscono.
 *
 * 1. **Propone e spiega, non decide.** L'esito porta con se `explanation`:
 *    una sequenza di righe che dice da dove viene ogni cifra. E la firma di
 *    `fiscal/engine.ts`, replicata qui: un numero senza le sue ipotesi e un
 *    numero che nessuno puo contestare, e quindi nessuno puo correggere.
 * 2. **Le regole non validate non producono calcoli definitivi.** Se una
 *    voce del rule set e `PENDING_PROFESSIONAL_VALIDATION` e serve a questo
 *    calcolo, l'esito esce con `definitive: false` e un avviso. La ritenuta
 *    IRPEF non si calcola affatto: si mostra l'imponibile eccedente e ci si
 *    ferma.
 * 3. **L'anno e quello della data di pagamento.** Non quello della stagione.
 *    Le regole si risolvono con `rulesFor(anno)`, che **fallisce** se l'anno
 *    non e configurato.
 * 4. **La posizione annua e un input, non un effetto.** Il motore non legge
 *    il database e non lo scrive: riceve quanto il club ha gia erogato e
 *    quanto il lavoratore ha dichiarato di aver percepito altrove.
 */

/* --------------------------------------------------------- posizione */

/**
 * La posizione del lavoratore **prima** di questa erogazione, nell'anno
 * solare della data di pagamento.
 *
 * `clubGrossPaid` e cio che questo club ha gia erogato; `externalDeclared` e
 * cio che il lavoratore ha dichiarato di aver percepito da altri committenti.
 * Sono due numeri distinti e restano distinti fino in schermata: il primo
 * EasyGame lo sa, il secondo glielo hanno detto.
 */
export type AnnualPositionSnapshot = {
  year: number;
  clubGrossPaid: number;
  externalDeclared: number;
  /** Data dell'autocertificazione da cui viene `externalDeclared`. */
  declaredAt?: string | null;
  /** Vero se esiste un'autocertificazione valida **per questo anno**. */
  hasCurrentDeclaration: boolean;
};

export const emptyPosition = (year: number): AnnualPositionSnapshot => ({
  year,
  clubGrossPaid: 0,
  externalDeclared: 0,
  declaredAt: null,
  hasCurrentDeclaration: false,
});

/* ----------------------------------------------------------- avvisi */

export type PayoutWarningCode =
  | "MISSING_SELF_DECLARATION"
  | "SOCIAL_THRESHOLD_CROSSED"
  | "FISCAL_THRESHOLD_CROSSED"
  | "RULES_PENDING_VALIDATION"
  | "ANNUAL_CAP_EXCEEDED"
  | "VAT_REGIME_NO_ENGINE"
  | "EXTERNAL_PAYROLL_NO_ENGINE";

export type PayoutWarning = {
  code: PayoutWarningCode;
  /** `blocking` non esiste: nessun avviso impedisce di pagare in V1. */
  severity: "info" | "warning" | "hard";
  message: string;
  detail?: string;
};

/* -------------------------------------------------------- spiegazione */

export type ExplanationLine = {
  key: string;
  label: string;
  /** `null` quando la riga e una nota e non un importo. */
  amount: number | null;
  kind: "amount" | "rate" | "note";
  note?: string;
  /** Vero se la riga e un totale su cui si tira una riga. */
  emphasis?: boolean;
};

/* ----------------------------------------------------------- esito */

export type SocialTreatment = "COMPUTED" | "OUT_OF_SCOPE";

/**
 * Cosa EasyGame puo dire del trattamento fiscale di questa erogazione.
 *
 * - `NOT_APPLICABLE` — il progressivo resta sotto la franchigia dei 15.000:
 *   non c'e imponibile e non c'e ritenuta. **Il netto e definitivo.**
 * - `TO_VERIFY` — la franchigia e superata: c'e un imponibile eccedente, ma
 *   quale ritenuta si applichi dipende dalla qualificazione reddituale, che
 *   non e validata. **Il netto previdenziale non e il netto finale.**
 * - `OUT_OF_SCOPE` — regime P.IVA o paghe esterne: non e il club a
 *   determinarlo.
 */
export type FiscalTreatment = "NOT_APPLICABLE" | "TO_VERIFY" | "OUT_OF_SCOPE";

export const FISCAL_TREATMENT_LABELS: Record<FiscalTreatment, string> = {
  NOT_APPLICABLE: "Non applicabile — sotto la soglia fiscale",
  TO_VERIFY: "Trattamento fiscale da verificare",
  OUT_OF_SCOPE: "Determinato fuori da EasyGame",
};

export type PayoutComputation = {
  year: number;
  rulesVersion: string;
  relationshipType: RelationshipType;
  socialCoverage: SocialCoverage;
  grossAmount: number;

  /* progressivi */
  priorClubGross: number;
  priorExternalDeclared: number;
  priorProgressive: number;
  progressiveAfter: number;

  /* previdenziale */
  socialTreatment: SocialTreatment;
  socialFranchise: number;
  socialFranchiseRemainingBefore: number;
  socialFranchiseUsed: number;
  taxableSocialGross: number;
  reductionFactor: number;
  socialBase: number;
  socialRate: number;
  totalContribution: number;
  employeeContribution: number;
  employerContribution: number;

  /* fiscale */
  fiscalTreatment: FiscalTreatment;
  fiscalFranchise: number;
  fiscalFranchiseRemainingBefore: number;
  fiscalFranchiseUsed: number;
  taxableFiscal: number;
  /** Sempre `null` in V1: la ritenuta non si calcola. */
  withholdingAmount: null;

  /* esiti */
  /** Lordo meno la quota a carico del lavoratore. **Non** e il netto finale. */
  netSocial: number;
  /**
   * Il netto che il lavoratore percepisce, **quando e determinabile**.
   * `null` quando la soglia fiscale e superata: in quel caso nessuna
   * schermata puo chiamarlo «netto da corrispondere definitivo».
   */
  netDefinitive: number | null;
  clubCost: number;

  /** Vero solo se ogni regola usata e validata. */
  definitive: boolean;
  warnings: PayoutWarning[];
  explanation: ExplanationLine[];
  snapshot: RuleSnapshot;
};

/* ----------------------------------------------------------- input */

export type ComputePayoutInput = {
  grossAmount: number;
  paidAt: Date | string;
  relationshipType: RelationshipType;
  socialCoverage: SocialCoverage;
  position: AnnualPositionSnapshot;
  /** Solo per i test e per le simulazioni: normalmente si risolve dall'anno. */
  rules?: SportWorkRuleSet;
};

const asAmount = (value: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("Importo non valido");
  }
  return roundMoney(parsed);
};

/**
 * Le due quote del contributo.
 *
 * La quota del committente si ricava per **differenza** e non moltiplicando
 * per due terzi: due arrotondamenti indipendenti su un contributo di 270,30
 * darebbero 90,10 e 180,20 che sommano a 270,30 per fortuna, e su altre
 * cifre no. Cosi le due quote tornano sempre al totale, che e la sola
 * proprieta che un F24 richiede.
 */
const splitContribution = (total: number, employeeShare: number) => {
  const employee = roundMoney(total * employeeShare);
  return { employee, employer: roundMoney(total - employee) };
};

/**
 * Calcola un'erogazione di compenso.
 *
 * Solleva se l'anno della data di pagamento non ha un rule set configurato:
 * e il fail-closed di `rulesFor`, e va lasciato salire fino a chi ha premuto
 * il pulsante.
 */
export const computeCompensationPayout = (
  input: ComputePayoutInput,
): PayoutComputation => {
  const paidAt = toDateOrNull(input.paidAt);
  if (!paidAt) {
    throw new Error("Data di erogazione non valida");
  }

  const year = fiscalYearOfPayment(paidAt);
  const rules = input.rules ?? rulesFor(year);
  const gross = asAmount(input.grossAmount);

  if (gross <= 0) {
    throw new Error("L'importo da erogare deve essere maggiore di zero");
  }

  const coverage = input.socialCoverage;
  const position = input.position;
  const priorClubGross = roundMoney(Math.max(0, position.clubGrossPaid || 0));
  const priorExternal = roundMoney(Math.max(0, position.externalDeclared || 0));
  const priorProgressive = roundMoney(priorClubGross + priorExternal);
  const progressiveAfter = roundMoney(priorProgressive + gross);

  const snapshot = buildRuleSnapshot(rules, coverage);
  const warnings: PayoutWarning[] = [];
  const explanation: ExplanationLine[] = [];

  explanation.push({
    key: "gross",
    label: "Compenso lordo",
    amount: gross,
    kind: "amount",
  });
  explanation.push({
    key: "priorClubGross",
    label: `Compensi erogati dal club nel ${year}`,
    amount: priorClubGross,
    kind: "amount",
  });
  explanation.push({
    key: "priorExternal",
    label: `Compensi esterni dichiarati per il ${year}`,
    amount: priorExternal,
    kind: "amount",
    note: position.hasCurrentDeclaration
      ? position.declaredAt
        ? `Autocertificazione del ${String(position.declaredAt).slice(0, 10)}`
        : "Autocertificazione acquisita"
      : "Nessuna autocertificazione per l'anno: il progressivo e parziale",
  });
  explanation.push({
    key: "progressive",
    label: "Progressivo dopo questa erogazione",
    amount: progressiveAfter,
    kind: "amount",
    emphasis: true,
  });

  /* ---------------------------------------------- regimi senza motore */

  if (!usesSportWorkEngine(input.relationshipType)) {
    const outOfScope: PayoutWarning =
      input.relationshipType === "SELF_EMPLOYED_VAT"
        ? {
            code: "VAT_REGIME_NO_ENGINE",
            severity: "info",
            message:
              "Rapporto con partita IVA: il club non applica il calcolo co.co.co.",
            detail:
              "Contributi, rivalse e ritenute li determina chi emette la fattura. EasyGame registra documento, scadenza, pagamento e uscita.",
          }
        : {
            code: "EXTERNAL_PAYROLL_NO_ENGINE",
            severity: "info",
            message:
              "Rapporto subordinato: gestito da consulente o software paghe esterno.",
            detail:
              "EasyGame registra il costo e i documenti. Nessun cedolino, nessun TFR, nessun INAIL, nessuna malattia.",
          };
    warnings.push(outOfScope);

    explanation.push({
      key: "outOfScope",
      label: "Trattamento previdenziale",
      amount: null,
      kind: "note",
      note: outOfScope.detail,
    });

    return {
      year,
      rulesVersion: snapshot.rulesVersion,
      relationshipType: input.relationshipType,
      socialCoverage: coverage,
      grossAmount: gross,
      priorClubGross,
      priorExternalDeclared: priorExternal,
      priorProgressive,
      progressiveAfter,
      socialTreatment: "OUT_OF_SCOPE",
      socialFranchise: rules.socialFranchise.value,
      socialFranchiseRemainingBefore: 0,
      socialFranchiseUsed: 0,
      taxableSocialGross: 0,
      reductionFactor: rules.reductionFactor.value,
      socialBase: 0,
      socialRate: 0,
      totalContribution: 0,
      employeeContribution: 0,
      employerContribution: 0,
      fiscalTreatment: "OUT_OF_SCOPE",
      fiscalFranchise: rules.fiscalFranchise.value,
      fiscalFranchiseRemainingBefore: 0,
      fiscalFranchiseUsed: 0,
      taxableFiscal: 0,
      withholdingAmount: null,
      netSocial: gross,
      netDefinitive: gross,
      clubCost: gross,
      definitive: true,
      warnings,
      explanation,
      snapshot,
    };
  }

  /* -------------------------------------------------- previdenziale */

  const socialFranchise = rules.socialFranchise.value;
  const socialRemainingBefore = roundMoney(
    Math.max(0, socialFranchise - priorProgressive),
  );
  const socialFranchiseUsed = roundMoney(Math.min(gross, socialRemainingBefore));
  const taxableSocialGross = roundMoney(gross - socialFranchiseUsed);
  const reductionFactor = rules.reductionFactor.value;
  const socialBase = roundMoney(taxableSocialGross * reductionFactor);
  const socialRate = rules.socialRates.value[coverage];
  const totalContribution = roundMoney(socialBase * socialRate);
  const { employee, employer } = splitContribution(
    totalContribution,
    rules.employeeShare.value,
  );

  explanation.push({
    key: "socialFranchise",
    label: "Soglia previdenziale",
    amount: socialFranchise,
    kind: "amount",
    note:
      priorProgressive >= socialFranchise
        ? "Gia esaurita prima di questa erogazione"
        : taxableSocialGross > 0
          ? "SUPERATA con questa erogazione"
          : `Residua dopo questa erogazione: ${roundMoney(socialRemainingBefore - socialFranchiseUsed).toFixed(2)}`,
  });
  explanation.push({
    key: "socialFranchiseUsed",
    label: "Quota coperta dalla franchigia",
    amount: socialFranchiseUsed,
    kind: "amount",
  });
  explanation.push({
    key: "taxableSocialGross",
    label: "Eccedenza soggetta a contribuzione",
    amount: taxableSocialGross,
    kind: "amount",
  });
  explanation.push({
    key: "reductionFactor",
    label: "Riduzione della base imponibile",
    amount: reductionFactor,
    kind: "rate",
    note: rules.reductionFactor.note,
  });
  explanation.push({
    key: "socialBase",
    label: "Imponibile previdenziale",
    amount: socialBase,
    kind: "amount",
    emphasis: true,
  });
  explanation.push({
    key: "socialRate",
    label: "Aliquota Gestione separata",
    amount: socialRate,
    kind: "rate",
    note: `Causale F24 ${snapshot.f24Causale}`,
  });
  explanation.push({
    key: "employeeContribution",
    label: "Contributi a carico del lavoratore",
    amount: employee,
    kind: "amount",
  });
  explanation.push({
    key: "employerContribution",
    label: "Contributi a carico del club",
    amount: employer,
    kind: "amount",
  });

  if (taxableSocialGross > 0 && priorProgressive < socialFranchise) {
    warnings.push({
      code: "SOCIAL_THRESHOLD_CROSSED",
      severity: "info",
      message: `Con questa erogazione il lavoratore supera la soglia previdenziale di ${socialFranchise.toLocaleString("it-IT")} euro.`,
      detail:
        "Da qui in avanti ogni compenso concorre per intero alla base imponibile ridotta.",
    });
  }

  /* -------------------------------------------------------- fiscale */

  const fiscalFranchise = rules.fiscalFranchise.value;
  const fiscalRemainingBefore = roundMoney(
    Math.max(0, fiscalFranchise - priorProgressive),
  );
  const fiscalFranchiseUsed = roundMoney(Math.min(gross, fiscalRemainingBefore));
  const taxableFiscal = roundMoney(gross - fiscalFranchiseUsed);
  const fiscalTreatment: FiscalTreatment =
    taxableFiscal > 0 ? "TO_VERIFY" : "NOT_APPLICABLE";

  explanation.push({
    key: "fiscalFranchise",
    label: "Soglia fiscale",
    amount: fiscalFranchise,
    kind: "amount",
    note:
      taxableFiscal > 0
        ? "SUPERATA"
        : `Residua dopo questa erogazione: ${roundMoney(fiscalRemainingBefore - fiscalFranchiseUsed).toFixed(2)}`,
  });
  explanation.push({
    key: "taxableFiscal",
    label: "Imponibile fiscale eccedente",
    amount: taxableFiscal,
    kind: "amount",
  });
  explanation.push({
    key: "fiscalTreatment",
    label: "Trattamento fiscale",
    amount: null,
    kind: "note",
    note:
      taxableFiscal > 0
        ? "Da verificare con il consulente: la ritenuta sull'eccedenza dipende dalla qualificazione reddituale, che EasyGame non determina."
        : "Non applicabile: il progressivo resta sotto la soglia fiscale.",
  });

  if (taxableFiscal > 0) {
    warnings.push({
      code: "FISCAL_THRESHOLD_CROSSED",
      severity: "hard",
      message: `Soglia fiscale di ${fiscalFranchise.toLocaleString("it-IT")} euro superata: imponibile eccedente ${taxableFiscal.toFixed(2)} euro.`,
      detail:
        "EasyGame non calcola la ritenuta IRPEF. Il valore mostrato e il netto previdenziale, non il netto da corrispondere.",
    });
  }

  /* -------------------------------------------------- autocertificazione */

  if (!position.hasCurrentDeclaration) {
    warnings.push({
      code: "MISSING_SELF_DECLARATION",
      severity: "hard",
      message: `Autocertificazione compensi esterni non aggiornata per il ${year}. Il calcolo contributivo potrebbe essere incompleto.`,
      detail:
        "Le soglie sono del lavoratore, non del committente: senza la dichiarazione degli altri compensi il progressivo e solo quello che il club conosce.",
    });
  }

  /* --------------------------------------------------------- massimale */

  if (progressiveAfter > rules.annualCap.value) {
    warnings.push({
      code: "ANNUAL_CAP_EXCEEDED",
      severity: "warning",
      message: `Il progressivo supera il massimale annuo della Gestione separata (${rules.annualCap.value.toLocaleString("it-IT")} euro).`,
      detail:
        "EasyGame non tronca l'imponibile al massimale: il modo in cui il massimale si applica al lavoro sportivo con franchigia e riduzione non e validato. Trattamento da verificare.",
    });
  }

  /* -------------------------------------------- regole non validate */

  const pending = listPendingRules(rules).filter(
    ({ key }) => key === "socialRates" || key === "reductionFactor" || key === "socialFranchise",
  );

  if (pending.length > 0) {
    warnings.push({
      code: "RULES_PENDING_VALIDATION",
      severity: "hard",
      message: `Le regole ${year} usate da questo calcolo non sono ancora validate: ${pending
        .map(({ key }) => key)
        .join(", ")}.`,
      detail:
        "Gli importi sono una stima. Vanno riconfermati quando il rule set dell'anno viene aggiornato con la circolare ufficiale.",
    });
  }

  const definitiveSocial =
    pending.length === 0 &&
    canRuleProduceDefinitiveCalculation(rules.socialRates.status) &&
    canRuleProduceDefinitiveCalculation(rules.reductionFactor.status);

  const netSocial = roundMoney(gross - employee);
  const clubCost = roundMoney(gross + employer);

  explanation.push({
    key: "netSocial",
    label: "Netto previdenziale",
    amount: netSocial,
    kind: "amount",
    emphasis: true,
    note:
      taxableFiscal > 0
        ? "Non comprende la ritenuta fiscale: non e il netto da corrispondere."
        : undefined,
  });
  explanation.push({
    key: "clubCost",
    label: "Costo per il club",
    amount: clubCost,
    kind: "amount",
    emphasis: true,
  });

  return {
    year,
    rulesVersion: snapshot.rulesVersion,
    relationshipType: input.relationshipType,
    socialCoverage: coverage,
    grossAmount: gross,
    priorClubGross,
    priorExternalDeclared: priorExternal,
    priorProgressive,
    progressiveAfter,
    socialTreatment: "COMPUTED",
    socialFranchise,
    socialFranchiseRemainingBefore: socialRemainingBefore,
    socialFranchiseUsed,
    taxableSocialGross,
    reductionFactor,
    socialBase,
    socialRate,
    totalContribution,
    employeeContribution: employee,
    employerContribution: employer,
    fiscalTreatment,
    fiscalFranchise,
    fiscalFranchiseRemainingBefore: fiscalRemainingBefore,
    fiscalFranchiseUsed,
    taxableFiscal,
    withholdingAmount: null,
    netSocial,
    netDefinitive: fiscalTreatment === "NOT_APPLICABLE" ? netSocial : null,
    clubCost,
    definitive: definitiveSocial && fiscalTreatment === "NOT_APPLICABLE",
    warnings,
    explanation,
    snapshot,
  };
};

/**
 * L'etichetta corretta per il netto, dato l'esito.
 *
 * Esiste come funzione e non come stringa nella schermata perche il divieto
 * di chiamare «netto da corrispondere definitivo» un numero che non lo e
 * (requisito 14) deve valere in ogni superficie che mostra quel numero, e
 * l'unico modo perche valga davvero e che la stringa la produca il dominio.
 */
export const netAmountLabel = (computation: PayoutComputation) => {
  if (computation.socialTreatment === "OUT_OF_SCOPE") {
    return "Importo da corrispondere";
  }
  if (computation.netDefinitive === null) {
    return "Netto previdenziale (ritenuta fiscale esclusa)";
  }
  if (!computation.definitive) {
    return "Netto previdenziale — stima non definitiva";
  }
  return "Netto da corrispondere";
};

/**
 * Il **fiscal snapshot** da congelare sulla riga di erogazione (requisito 34).
 *
 * Contiene tutto cio che serve a rileggere il calcolo fra due anni: versione
 * delle regole, soglie, aliquote, dichiarato esterno, progressivo del club,
 * imponibili, quote e le fonti. Una modifica normativa futura **non** riscrive
 * la storia perche la storia se la porta dietro.
 */
export type PayoutFiscalSnapshot = {
  rulesVersion: string;
  year: number;
  thresholds: { social: number; fiscal: number; annualCap: number };
  rates: {
    socialRate: number;
    reductionFactor: number;
    employeeShare: number;
    employerShare: number;
    f24Causale: string;
  };
  externalDeclaredAmount: number;
  externalDeclaredAt: string | null;
  hadCurrentDeclaration: boolean;
  clubYtdAmount: number;
  progressiveAfter: number;
  taxableSocialBase: number;
  contributionBase: number;
  employeeContribution: number;
  employerContribution: number;
  taxableFiscal: number;
  fiscalTreatment: FiscalTreatment;
  definitive: boolean;
  pendingRules: RuleSnapshot["pendingRules"];
  sources: Record<string, string>;
  computedAt: string;
};

export const buildPayoutFiscalSnapshot = (
  computation: PayoutComputation,
  position: AnnualPositionSnapshot,
  computedAt: Date = new Date(),
): PayoutFiscalSnapshot => ({
  rulesVersion: computation.rulesVersion,
  year: computation.year,
  thresholds: {
    social: computation.socialFranchise,
    fiscal: computation.fiscalFranchise,
    annualCap: computation.snapshot.annualCap,
  },
  rates: {
    socialRate: computation.socialRate,
    reductionFactor: computation.reductionFactor,
    employeeShare: computation.snapshot.employeeShare,
    employerShare: computation.snapshot.employerShare,
    f24Causale: computation.snapshot.f24Causale,
  },
  externalDeclaredAmount: computation.priorExternalDeclared,
  externalDeclaredAt: position.declaredAt ?? null,
  hadCurrentDeclaration: Boolean(position.hasCurrentDeclaration),
  clubYtdAmount: computation.priorClubGross,
  progressiveAfter: computation.progressiveAfter,
  taxableSocialBase: computation.taxableSocialGross,
  contributionBase: computation.socialBase,
  employeeContribution: computation.employeeContribution,
  employerContribution: computation.employerContribution,
  taxableFiscal: computation.taxableFiscal,
  fiscalTreatment: computation.fiscalTreatment,
  definitive: computation.definitive,
  pendingRules: computation.snapshot.pendingRules,
  sources: computation.snapshot.sources,
  computedAt: computedAt.toISOString(),
});
