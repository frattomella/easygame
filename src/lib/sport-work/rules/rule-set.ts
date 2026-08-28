/**
 * La forma di un **rule set** del lavoro sportivo.
 *
 * Le regole previdenziali e fiscali del lavoro sportivo cambiano per legge, e
 * cambiano con una data: la riduzione al 50% della base imponibile decade il
 * 31 dicembre 2027, e il 1 gennaio 2028, a parita di compenso, la
 * contribuzione raddoppia. Un motore che tiene le soglie come costanti sparse
 * quel giorno produce numeri sbagliati **in silenzio**.
 *
 * Da qui le tre proprieta di questo modulo.
 *
 * 1. **Un rule set per anno solare**, con `validFrom` e `validTo` espliciti.
 * 2. **Ogni valore porta la sua fonte** e il suo grado di validazione. Un
 *    numero senza fonte, fra due anni, e un numero che nessuno potra piu
 *    verificare — che e esattamente il problema che l'analisi 28 esiste per
 *    prevenire.
 * 3. **Il grado di validazione decide se il numero puo produrre un calcolo
 *    definitivo.** Solo `VALIDATED_OFFICIAL` e `VALIDATED_PROFESSIONAL` lo
 *    possono; `PENDING_PROFESSIONAL_VALIDATION` produce un avviso e un dato
 *    informativo, mai un netto dichiarato definitivo.
 *
 * Vedi `docs/knowledge-base/28-lavoro-sportivo-e-compensi-analisi.md`, cap. 2,
 * 5, 6, 7 e 21.
 */

/**
 * Quanto vale una regola.
 *
 * - `VALIDATED_OFFICIAL` — il valore sta nel testo di legge o in un documento
 *   istituzionale letto direttamente.
 * - `VALIDATED_PROFESSIONAL` — ricostruzione di prassi professionale
 *   consolidata e concorde, con riferimenti normativi puntuali.
 * - `PENDING_PROFESSIONAL_VALIDATION` — la prassi **non** e pacifica, oppure
 *   il valore attende la conferma scritta di un professionista abilitato.
 *   **Non puo produrre un calcolo definitivo.**
 */
export type RuleValidationStatus =
  | "VALIDATED_OFFICIAL"
  | "VALIDATED_PROFESSIONAL"
  | "PENDING_PROFESSIONAL_VALIDATION";

/** Vero se la regola puo produrre un numero che si presenta come definitivo. */
export const canRuleProduceDefinitiveCalculation = (
  status: RuleValidationStatus,
) =>
  status === "VALIDATED_OFFICIAL" || status === "VALIDATED_PROFESSIONAL";

/**
 * Un valore con la sua provenienza.
 *
 * `value` puo essere `null`: e il caso delle regole che esistono nel dominio
 * ma che EasyGame **non calcola** — la ritenuta IRPEF sull'eccedenza dei
 * 15.000 e l'esempio principale. Tenerle qui con `value: null` e uno stato
 * `PENDING` e meglio che ometterle: una regola assente sembra una regola
 * dimenticata, una regola dichiarata pendente dice che la si conosce e che si
 * e scelto di non applicarla.
 */
export type RuleEntry<Value> = {
  value: Value;
  status: RuleValidationStatus;
  /** Riferimento normativo o di prassi. Obbligatorio: senza, la regola non entra. */
  source: string;
  /** Cosa resta da chiarire, quando qualcosa resta da chiarire. */
  note?: string;
  /** Data della validazione professionale, quando c'e stata. `null` se manca. */
  validatedAt?: string | null;
};

/**
 * La copertura previdenziale del lavoratore. **Non si deduce dal ruolo**: la
 * dichiara il lavoratore e la si registra sul rapporto (analisi 28, cap. 6.5).
 */
export type SocialCoverage = "NONE" | "OTHER_COVERAGE" | "PENSIONER";

export const SOCIAL_COVERAGES: readonly SocialCoverage[] = [
  "NONE",
  "OTHER_COVERAGE",
  "PENSIONER",
] as const;

export const SOCIAL_COVERAGE_LABELS: Record<SocialCoverage, string> = {
  NONE: "Nessun'altra copertura previdenziale",
  OTHER_COVERAGE: "Altra copertura previdenziale",
  PENSIONER: "Pensionato",
};

export type SportWorkRuleSet = {
  /** Anno solare. E la chiave: non la stagione sportiva. */
  year: number;
  validFrom: string;
  validTo: string;
  /** Franchigia contributiva annua, aggregata su tutti i committenti, per cassa. */
  socialFranchise: RuleEntry<number>;
  /** Franchigia fiscale annua, aggregata su tutti i committenti. */
  fiscalFranchise: RuleEntry<number>;
  /** Fattore di riduzione della base imponibile contributiva (0,50 fino al 2027). */
  reductionFactor: RuleEntry<number>;
  /** Ultimo giorno in cui la riduzione si applica. */
  reductionExpiresOn: RuleEntry<string>;
  /** Aliquota Gestione separata per copertura previdenziale del lavoratore. */
  socialRates: RuleEntry<Record<SocialCoverage, number>>;
  /** Causale F24 per copertura previdenziale. */
  f24Causali: RuleEntry<Record<SocialCoverage, string>>;
  /** Quota a carico del lavoratore sul contributo totale. */
  employeeShare: RuleEntry<number>;
  /** Quota a carico del committente sul contributo totale. */
  employerShare: RuleEntry<number>;
  /** Massimale annuo della Gestione separata. */
  annualCap: RuleEntry<number>;
  /** Minimale per l'accredito contributivo integrale. */
  minimumForFullCredit: RuleEntry<number>;
  /** Ritenuta IRPEF sull'eccedenza fiscale: **non calcolata in V1**. */
  incomeTaxWithholding: RuleEntry<null>;
  /** Deducibilita dei contributi del lavoratore dalla base fiscale: **non applicata**. */
  contributionDeductibility: RuleEntry<null>;
  /** Trattamento fiscale dei premi ex art. 36 c. 6-quater: **non applicato**. */
  bonusTreatment: RuleEntry<null>;
  /** Tetto mensile del rimborso forfettario al volontario. */
  volunteerMonthlyFlatCap: RuleEntry<number>;
  /** Giorno del mese successivo entro cui versare i contributi con F24. */
  contributionPaymentDay: RuleEntry<number>;
  /** Cassa allargata: giorno di gennaio entro cui il pagato si imputa all'anno prima. */
  cashExtensionDayOfJanuary: RuleEntry<number>;
};

/** Tutte le regole di un rule set, in forma navigabile per la UI e i test. */
export const listRuleEntries = (
  rules: SportWorkRuleSet,
): Array<{ key: string; entry: RuleEntry<unknown> }> =>
  Object.entries(rules)
    .filter(
      ([, entry]) =>
        entry !== null &&
        typeof entry === "object" &&
        "status" in (entry as Record<string, unknown>) &&
        "source" in (entry as Record<string, unknown>),
    )
    .map(([key, entry]) => ({ key, entry: entry as RuleEntry<unknown> }));

/** Le regole che attendono ancora una validazione professionale. */
export const listPendingRules = (rules: SportWorkRuleSet) =>
  listRuleEntries(rules).filter(
    ({ entry }) => entry.status === "PENDING_PROFESSIONAL_VALIDATION",
  );
