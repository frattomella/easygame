import type { AutomationAudience, AutomationDelivery } from "@/lib/automations/catalog";

/**
 * Le regole delle automazioni come le manda `GET /api/v1/automations`, e la
 * bozza che la schermata tiene per ciascuna (Web V2). Modulo puro.
 */
export type RuleView = {
  id: string;
  trigger: string;
  enabled: boolean;
  offsetDays: number[];
  audience: AutomationAudience;
  delivery: AutomationDelivery;
  template: { subject: string; body: string };
  categories: string[];
  updatedAt: string | null;
  label: string;
  description: string;
  direction: "before" | "after";
  defaultOffsetDays: number[];
  supportsCategoryFilter: boolean;
  sample: { subject: string; text: string; unresolved: string[] };
};

/** Cio che si modifica di una regola; gli anticipi e le categorie restano testo finche non si salva. */
export type RuleDraft = {
  enabled: boolean;
  offsetText: string;
  audience: AutomationAudience;
  delivery: AutomationDelivery;
  subject: string;
  body: string;
  categoryText: string;
};

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

export const offsetsToText = (values: readonly number[]) => values.join(", ");

/**
 * `7, 3` diventa `[7, 3]`.
 *
 * Cio che non e un numero **resta fuori** invece di diventare zero: «7, tre»
 * salvato come «7, 0» manderebbe un messaggio il giorno della scadenza senza
 * che nessuno lo abbia chiesto. Il server rifiuta comunque, ed e li che la
 * regola vera vive.
 */
export const parseOffsets = (text: string) =>
  text
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number(part))
    .filter((value) => Number.isFinite(value));

/**
 * «BLSD, primo soccorso» diventa `["BLSD", "primo soccorso"]`.
 *
 * La riduzione vera la fa il dominio, che e anche l'unico posto in cui le
 * categorie del certificato medico vengono scartate: qui si separa e basta,
 * cosi il campo resta scrivibile come si scriverebbe a mano.
 */
export const parseCategories = (text: string) =>
  text
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);

export const ruleDraftFrom = (rule: RuleView): RuleDraft => ({
  enabled: Boolean(rule.enabled),
  offsetText: offsetsToText(asArray(rule.offsetDays)),
  audience: rule.audience,
  delivery: rule.delivery,
  subject: rule.template?.subject || "",
  body: rule.template?.body || "",
  categoryText: asArray(rule.categories).join(", "),
});

export const isRuleDraftDirty = (rule: RuleView, draft: RuleDraft) => {
  const base = ruleDraftFrom(rule);
  return (Object.keys(base) as Array<keyof RuleDraft>).some((key) => base[key] !== draft[key]);
};

/** Il corpo di `POST /api/v1/automations { rule }`, con le stesse chiavi della V1. */
export const rulePayload = (rule: RuleView, draft: RuleDraft) => ({
  trigger: rule.trigger,
  enabled: draft.enabled,
  offsetDays: parseOffsets(draft.offsetText),
  audience: draft.audience,
  delivery: draft.delivery,
  template: { subject: draft.subject, body: draft.body },
  categories: rule.supportsCategoryFilter ? parseCategories(draft.categoryText) : [],
});
