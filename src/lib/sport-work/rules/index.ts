import { SPORT_WORK_RULES_2026 } from "./2026";
import { SPORT_WORK_RULES_2027 } from "./2027";
import {
  listPendingRules,
  type SportWorkRuleSet,
  type RuleEntry,
} from "./rule-set";

export * from "./rule-set";
export { SPORT_WORK_RULES_2026 } from "./2026";
export { SPORT_WORK_RULES_2027 } from "./2027";

/**
 * Il registro dei rule set, **per anno solare**.
 *
 * La chiave e l'anno della **data di pagamento**, non quello della stagione:
 * la franchigia contributiva si consuma per cassa, e una stagione 2026/27
 * attraversa due franchigie intere (analisi 28, cap. 5.3 e 9.4).
 */
const REGISTRY: Record<number, SportWorkRuleSet> = {
  2026: SPORT_WORK_RULES_2026,
  2027: SPORT_WORK_RULES_2027,
};

export const CONFIGURED_RULE_YEARS = Object.keys(REGISTRY)
  .map((year) => Number(year))
  .sort((left, right) => left - right);

/** Il primo e l'ultimo anno per cui esistono regole. */
export const RULE_YEAR_RANGE = {
  first: CONFIGURED_RULE_YEARS[0],
  last: CONFIGURED_RULE_YEARS[CONFIGURED_RULE_YEARS.length - 1],
};

export const hasRulesForYear = (year: unknown) =>
  Number.isInteger(Number(year)) && Boolean(REGISTRY[Number(year)]);

/**
 * Le regole di un anno. **Fallisce se l'anno non e configurato.**
 *
 * Non esiste fallback all'anno precedente, e non e una svista: il 1 gennaio
 * 2028 la riduzione al 50% della base imponibile decade, e un motore che quel
 * giorno riusa le regole del 2027 dimezza la contribuzione dovuta **senza che
 * nessuno se ne accorga**. Un errore rumoroso costa un'ora di lavoro; un
 * calcolo sbagliato in silenzio costa una sanzione, mesi dopo, a un cliente
 * che aveva ragione di fidarsi.
 *
 * Il messaggio dice cosa fare, perche chi lo legge e chi dovra scrivere il
 * file mancante.
 */
export const rulesFor = (year: unknown): SportWorkRuleSet => {
  const normalized = Number(year);

  if (!Number.isInteger(normalized)) {
    throw new Error(
      `Anno non valido per le regole del lavoro sportivo: ${String(year)}`,
    );
  }

  const rules = REGISTRY[normalized];

  if (!rules) {
    throw new Error(
      `Regole del lavoro sportivo non configurate per l'anno ${normalized}. ` +
        `Anni disponibili: ${CONFIGURED_RULE_YEARS.join(", ")}. ` +
        `Aggiungere src/lib/sport-work/rules/${normalized}.ts con le fonti normative, ` +
        `senza copiare l'anno precedente: le aliquote e la riduzione della base imponibile cambiano per legge.`,
    );
  }

  return rules;
};

/**
 * Le regole di un anno, oppure `null`. Per le superfici di sola lettura che
 * devono poter dire «per quell'anno non ci sono regole» senza sollevare.
 */
export const tryRulesFor = (year: unknown): SportWorkRuleSet | null => {
  try {
    return rulesFor(year);
  } catch {
    return null;
  }
};

/**
 * Le regole **effettivamente usate** da un calcolo, congelate sulla riga di
 * erogazione (`fiscal snapshot`).
 *
 * Non e il rule set intero: e cio che ha prodotto quel numero. Se domani
 * l'aliquota cambia, l'erogazione di ieri continua a spiegare se stessa.
 */
export type RuleSnapshot = {
  rulesVersion: string;
  year: number;
  socialFranchise: number;
  fiscalFranchise: number;
  reductionFactor: number;
  socialRate: number;
  employeeShare: number;
  employerShare: number;
  f24Causale: string;
  annualCap: number;
  /** Le voci pendenti al momento del calcolo, con la loro fonte. */
  pendingRules: Array<{ key: string; source: string; note?: string }>;
  sources: Record<string, string>;
};

export const buildRuleSnapshot = (
  rules: SportWorkRuleSet,
  coverage: keyof SportWorkRuleSet["socialRates"]["value"],
): RuleSnapshot => ({
  rulesVersion: String(rules.year),
  year: rules.year,
  socialFranchise: rules.socialFranchise.value,
  fiscalFranchise: rules.fiscalFranchise.value,
  reductionFactor: rules.reductionFactor.value,
  socialRate: rules.socialRates.value[coverage],
  employeeShare: rules.employeeShare.value,
  employerShare: rules.employerShare.value,
  f24Causale: rules.f24Causali.value[coverage],
  annualCap: rules.annualCap.value,
  pendingRules: listPendingRules(rules).map(({ key, entry }) => ({
    key,
    source: (entry as RuleEntry<unknown>).source,
    ...((entry as RuleEntry<unknown>).note
      ? { note: (entry as RuleEntry<unknown>).note as string }
      : {}),
  })),
  sources: {
    socialFranchise: rules.socialFranchise.source,
    fiscalFranchise: rules.fiscalFranchise.source,
    reductionFactor: rules.reductionFactor.source,
    socialRates: rules.socialRates.source,
    shares: rules.employeeShare.source,
    f24Causali: rules.f24Causali.source,
  },
});
