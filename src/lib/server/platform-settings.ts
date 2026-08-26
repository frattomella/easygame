/**
 * Le **configurazioni della piattaforma** e le **condizioni commerciali**:
 * lettura e scrittura, in un posto solo.
 *
 * **Il confine che questo file custodisce.** Niente qui dentro appartiene a un
 * club. Ogni scrittura passa da una rotta riservata a `platform_admin`, e ogni
 * lettura che un club puo fare e ridotta a cio che un club puo sapere: la
 * commissione che gli viene applicata si, l'account Stripe di Cedi Soft no.
 *
 * **Perche i segreti non stanno qui.** Le chiavi Stripe e le credenziali del
 * provider fiscale restano variabili d'ambiente. Una chiave segreta dentro una
 * tabella si legge da qualunque query, finisce in ogni backup e sopravvive a
 * ogni rotazione che qualcuno dimentica di fare. In `platform_settings` stanno
 * gli **identificativi** — ambiente, id dei prezzi, tipo di account Connect,
 * provider fiscale scelto — che sono configurazione, non credenziali.
 *
 * Vedi ADR-0050 e ADR-0051.
 */

import { prisma } from "./prisma";
import {
  resolveCommission,
  type CommissionRule,
  type ResolvedCommission,
} from "@/lib/payments/commission";

const asText = (value: unknown) => String(value ?? "").trim();

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const settingClient = () => (prisma as any).platformSetting;
const ruleClient = () => (prisma as any).platformCommissionRule;

/* ------------------------------------------------- le chiavi conosciute */

export const PLATFORM_SETTING_KEYS = {
  /** Il flusso B: incassi degli atleti sugli account connessi. */
  stripeConnect: "stripe.connect",
  /** Il flusso A: abbonamenti EasyGame sull'account centrale di Cedi Soft. */
  stripeBilling: "stripe.billing",
  /** Quale intermediario per la fattura elettronica. Oggi: nessuno. */
  fiscalProvider: "fiscal.provider",
} as const;

export type PlatformSettingKey =
  (typeof PLATFORM_SETTING_KEYS)[keyof typeof PLATFORM_SETTING_KEYS];

export type StripeConnectSettings = {
  /**
   * Il tipo di account Connect. **Irreversibile per account gia creato**: un
   * account `standard` non diventa `express`, e viceversa. Vedi ADR-0051 e il
   * rapporto di blocco: e una delle decisioni che vanno prese prima del primo
   * collegamento reale.
   */
  accountType: "standard" | "express";
  /** Il paese predefinito dei nuovi account. */
  defaultCountry: string;
  /** Se aprire nuovi collegamenti. Spegnerlo non tocca quelli esistenti. */
  onboardingEnabled: boolean;
};

export type StripeBillingSettings = {
  /** Gli id dei prezzi EasyGame su Stripe. Identificativi, non segreti. */
  prices: {
    plusMonthly: string;
    plusAnnual: string;
  };
  /** Il portale clienti Stripe, quando configurato. */
  customerPortalEnabled: boolean;
};

export type FiscalProviderSettings = {
  /** `null` finche non se ne sceglie uno. Vedi ADR-0053. */
  providerKey: string | null;
  environment: "sandbox" | "production";
};

const DEFAULTS: Record<PlatformSettingKey, Record<string, any>> = {
  [PLATFORM_SETTING_KEYS.stripeConnect]: {
    accountType: "standard",
    defaultCountry: "IT",
    onboardingEnabled: true,
  } satisfies StripeConnectSettings,
  [PLATFORM_SETTING_KEYS.stripeBilling]: {
    prices: { plusMonthly: "", plusAnnual: "" },
    customerPortalEnabled: false,
  } satisfies StripeBillingSettings,
  [PLATFORM_SETTING_KEYS.fiscalProvider]: {
    providerKey: null,
    environment: "sandbox",
  } satisfies FiscalProviderSettings,
};

/**
 * Il valore di una configurazione, fusa con i valori predefiniti.
 *
 * **Perche la fusione e superficiale e non profonda.** Una fusione profonda
 * farebbe riapparire chiavi che qualcuno ha tolto di proposito. Le
 * configurazioni qui sono piatte a un livello, e `prices` — l'unico oggetto
 * annidato — si fonde esplicitamente.
 */
export const readPlatformSetting = async <T extends Record<string, any>>(
  key: PlatformSettingKey,
): Promise<T> => {
  const row = await settingClient().findUnique({ where: { key } });
  const stored = asRecord(row?.value);
  const defaults = DEFAULTS[key] || {};

  const merged: Record<string, any> = { ...defaults, ...stored };
  if (defaults.prices) {
    merged.prices = { ...defaults.prices, ...asRecord(stored.prices) };
  }

  return merged as T;
};

export const writePlatformSetting = async (
  key: PlatformSettingKey,
  value: Record<string, any>,
  actorUserId?: string | null,
) => {
  const current = await readPlatformSetting(key);
  const next = { ...current, ...asRecord(value) };

  await settingClient().upsert({
    where: { key },
    create: { key, value: next, updated_by: asText(actorUserId) || null },
    update: { value: next, updated_by: asText(actorUserId) || null },
  });

  return next;
};

/* -------------------------------------------- le condizioni commerciali */

const toRule = (row: any): CommissionRule => ({
  id: String(row.id),
  organizationId: row.organization_id ? String(row.organization_id) : null,
  percent: Number(row.percent),
  fixedCents: Number(row.fixed_cents || 0),
  effectiveFrom: row.effective_from,
  createdAt: row.created_at ?? null,
  note: row.note ?? null,
});

/**
 * Le regole che possono riguardare un club: la sua e quelle generali.
 *
 * **Perche si caricano entrambe e si sceglie in memoria.** Perche la scelta
 * dipende dalla data dell'incasso, e una query che la facesse dovrebbe
 * ricevere quella data — cioe una query per incasso, che su una lista di
 * movimenti sarebbe un N+1. Le regole di una piattaforma sono decine, non
 * milioni: si caricano una volta e si risolvono per ogni riga senza toccare il
 * database.
 */
export const loadCommissionRules = async (
  organizationId?: string | null,
): Promise<CommissionRule[]> => {
  const id = asText(organizationId);

  /*
    Ordine **crescente**, ed e una scelta che conta. La risoluzione scioglie i
    pareggi preferendo l'ultima regola che incontra: due scritture nello stesso
    istante — che succedono davvero quando si riporta un club allo standard —
    devono lasciar vincere quella scritta dopo, e l'unico ordine su cui si puo
    contare e quello che il database restituisce.
  */
  const rows = await ruleClient().findMany({
    where: id
      ? { OR: [{ organization_id: null }, { organization_id: id }] }
      : { organization_id: null },
    orderBy: [{ effective_from: "asc" }, { created_at: "asc" }],
  });

  return rows.map(toRule);
};

/** La commissione che vale per un club a una certa data. */
export const resolveCommissionForClub = async (input: {
  organizationId?: string | null;
  at?: Date | string;
}): Promise<ResolvedCommission> =>
  resolveCommission({
    rules: await loadCommissionRules(input.organizationId),
    organizationId: input.organizationId,
    at: input.at,
  });

export type SaveCommissionRuleInput = {
  /** `null` = la condizione standard di EasyGame. */
  organizationId?: string | null;
  percent: number;
  fixedCents?: number;
  effectiveFrom?: Date | string;
  note?: string | null;
  actorUserId?: string | null;
};

/**
 * Scrive una nuova condizione commerciale.
 *
 * **Non modifica mai una riga esistente, e non ne cancella.** Cambiare la
 * percentuale significa aggiungere una regola con una decorrenza: e cosi che
 * il passato resta leggibile. Una funzione che aggiornasse la riga corrente
 * riporterebbe esattamente il difetto che questa tabella esiste per chiudere.
 */
export const saveCommissionRule = async (input: SaveCommissionRuleInput) => {
  const percent = Number(input.percent);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error("La percentuale deve essere un numero fra 0 e 100");
  }

  const fixedCents = Math.max(0, Math.round(Number(input.fixedCents) || 0));
  const effectiveFrom = input.effectiveFrom
    ? new Date(input.effectiveFrom)
    : new Date();

  if (Number.isNaN(effectiveFrom.getTime())) {
    throw new Error("Data di decorrenza non valida");
  }

  return ruleClient().create({
    data: {
      organization_id: asText(input.organizationId) || null,
      percent,
      fixed_cents: fixedCents,
      effective_from: effectiveFrom,
      /*
        Scritto qui e non lasciato al valore predefinito della colonna: e il
        criterio con cui si sciolgono i pareggi di decorrenza, e deve venire
        dallo stesso orologio che ha prodotto `effective_from`.
      */
      created_at: new Date(),
      note: asText(input.note) || null,
      created_by: asText(input.actorUserId) || null,
    },
  });
};

/**
 * Toglie l'override di un club, riportandolo alla condizione standard.
 *
 * **Si scrive una regola, non si cancellano quelle vecchie.** Cancellare
 * l'override farebbe sparire il fatto che era esistito, e con esso la
 * spiegazione dei movimenti che lo avevano applicato. Si aggiunge invece una
 * riga che ricopia la condizione standard con decorrenza da adesso: da qui in
 * avanti il club paga il listino, e prima pagava quel che dicono le righe
 * precedenti.
 */
export const clearClubCommissionOverride = async (input: {
  organizationId: string;
  actorUserId?: string | null;
}) => {
  const standard = resolveCommission({
    rules: await loadCommissionRules(null),
    organizationId: null,
  });

  return saveCommissionRule({
    organizationId: input.organizationId,
    percent: standard.percent,
    fixedCents: standard.fixedCents,
    note: "Allineato alla condizione standard EasyGame",
    actorUserId: input.actorUserId,
  });
};

export type CommissionHistoryEntry = {
  id: string;
  organizationId: string | null;
  percent: number;
  fixedCents: number;
  effectiveFrom: string;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
};

/** Lo storico delle decisioni, dalla piu recente. Serve all'audit e alla console. */
export const listCommissionHistory = async (input: {
  organizationId?: string | null;
  limit?: number;
}): Promise<CommissionHistoryEntry[]> => {
  const id = asText(input.organizationId);

  const rows = await ruleClient().findMany({
    where: id ? { organization_id: id } : { organization_id: null },
    orderBy: [{ effective_from: "desc" }, { created_at: "desc" }],
    take: Math.min(200, Math.max(1, Math.trunc(Number(input.limit) || 50))),
  });

  return rows.map((row: any) => ({
    id: String(row.id),
    organizationId: row.organization_id ? String(row.organization_id) : null,
    percent: Number(row.percent),
    fixedCents: Number(row.fixed_cents || 0),
    effectiveFrom: new Date(row.effective_from).toISOString(),
    note: row.note ?? null,
    createdAt: row.created_at
      ? new Date(row.created_at).toISOString()
      : new Date(row.effective_from).toISOString(),
    createdBy: row.created_by ? String(row.created_by) : null,
  }));
};
