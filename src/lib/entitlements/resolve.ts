/**
 * Chi puo usare cosa: **un posto solo** in cui la domanda ha una risposta.
 *
 * **Perche una funzione e non un `if` sparso.** «Questo club ha i report
 * avanzati?» scritta a mano in ogni componente diventa un `plan === "plus"`
 * qui e un `extras.includes(...)` la, e dopo sei mesi nessuno sa piu quali
 * schermate controllano davvero qualcosa. Qui la risposta si calcola una
 * volta, e chi la usa non conosce ne i piani ne i servizi opzionali: conosce
 * il nome della funzione.
 *
 * **Perche la risposta e sempre motivata.** Non basta sapere che una funzione
 * e spenta: chi la vede spenta deve capire **cosa fare** — passare a un piano
 * superiore, attivare un servizio, rinnovare un abbonamento scaduto, o
 * chiedere a Cedi. Sono quattro strade diverse e le percorrono persone
 * diverse. Una funzione che restituisse solo `false` costringerebbe ogni
 * schermata a reinventarsi il messaggio.
 *
 * **Il platform admin vede tutto, e si vede che lo sta facendo.** Chi
 * amministra la piattaforma deve poter aprire qualunque schermata di
 * qualunque club, altrimenti non puo assistere nessuno. Ma la ragione resta
 * scritta (`platform_admin`), cosi l'interfaccia puo dire «stai vedendo una
 * funzione che questo club non ha» invece di far credere che il club ce
 * l'abbia.
 *
 * Modulo **puro**: si prova senza database e senza sessione.
 */

import {
  ENTITLEMENT_KEYS,
  ENTITLEMENTS,
  isEntitlementKey,
  type EntitlementKey,
} from "./catalog";
import type {
  ClubSubscriptionPlan,
  ClubSubscriptionStatus,
  HubExtraServiceKey,
} from "@/lib/payments/payment-types";

/** Le decisioni prese a mano dalla console di piattaforma, per un club. */
export type EntitlementOverrides = Partial<Record<EntitlementKey, boolean>>;

export type EntitlementInput = {
  plan?: ClubSubscriptionPlan | null;
  subscriptionStatus?: ClubSubscriptionStatus | null;
  /** I servizi opzionali **attivi**. Non quelli disponibili a listino. */
  activeExtras?: readonly HubExtraServiceKey[];
  overrides?: EntitlementOverrides;
  isPlatformAdmin?: boolean;
};

export type EntitlementReason =
  | "included_in_plan"
  | "unlocked_by_extra"
  | "granted_by_platform"
  | "revoked_by_platform"
  | "requires_plan"
  | "requires_extra"
  | "subscription_inactive"
  | "platform_admin"
  | "unknown_feature";

export type EntitlementVerdict = {
  key: EntitlementKey;
  allowed: boolean;
  reason: EntitlementReason;
  /** Cosa leggere nell'interfaccia. Gia in italiano, gia utile. */
  message: string;
};

/**
 * Gli stati in cui un abbonamento **paga**.
 *
 * `past_due` e dentro di proposito: un pagamento in ritardo non e una
 * disdetta, e spegnere il gestionale di una societa il giorno in cui una
 * carta scade e un modo per perdere il cliente invece che l'insoluto.
 */
const PAYING_STATUSES: ClubSubscriptionStatus[] = [
  "active",
  "trialing",
  "past_due",
];

const normalizePlan = (value: unknown): ClubSubscriptionPlan =>
  value === "plus" ? "plus" : "free";

const normalizeStatus = (value: unknown): ClubSubscriptionStatus => {
  const status = String(value || "");
  return (
    [
      "not_active",
      "trialing",
      "active",
      "past_due",
      "cancelled",
      "expired",
    ] as const
  ).includes(status as ClubSubscriptionStatus)
    ? (status as ClubSubscriptionStatus)
    : "not_active";
};

export type EntitlementSet = {
  plan: ClubSubscriptionPlan;
  /** Il piano che vale davvero: `free` se l'abbonamento non e in corso. */
  effectivePlan: ClubSubscriptionPlan;
  subscriptionStatus: ClubSubscriptionStatus;
  isPlatformAdmin: boolean;
  has: (key: unknown) => boolean;
  explain: (key: unknown) => EntitlementVerdict;
  /** Tutte le funzioni con il loro esito: la console le mostra cosi. */
  all: () => EntitlementVerdict[];
};

/**
 * Calcola cosa un club puo usare.
 *
 * L'ordine dei controlli **e** la regola, e conta:
 *
 * 1. la funzione esiste? Un nome sbagliato non deve concedere niente;
 * 2. c'e un'eccezione della piattaforma? Vince, in entrambe le direzioni —
 *    esiste apposta per i casi che il listino non prevede, e una revoca deve
 *    poter fermare anche cio che il piano comprende;
 * 3. e chi amministra la piattaforma? Vede tutto, ma la ragione lo dichiara;
 * 4. il piano che vale la comprende? Se l'abbonamento non e in corso, il
 *    piano che vale e `free` — cio che era incluso in `plus` smette, cio che
 *    e sempre stato disponibile resta;
 * 5. un servizio attivo la sblocca?
 * 6. altrimenti no, e il messaggio dice quale delle due strade prendere.
 */
export const resolveEntitlements = (
  input: EntitlementInput = {},
): EntitlementSet => {
  const plan = normalizePlan(input.plan);
  const subscriptionStatus = normalizeStatus(input.subscriptionStatus);
  const isPlatformAdmin = Boolean(input.isPlatformAdmin);
  const activeExtras = new Set(input.activeExtras || []);
  const overrides = input.overrides || {};

  /*
    Il piano che vale non e sempre il piano scritto. Un abbonamento scaduto o
    disdetto lascia il club sul livello di base: non gli toglie il gestionale,
    gli toglie cio per cui non sta piu pagando.
  */
  const effectivePlan: ClubSubscriptionPlan = PAYING_STATUSES.includes(
    subscriptionStatus,
  )
    ? plan
    : "free";

  const explain = (rawKey: unknown): EntitlementVerdict => {
    if (!isEntitlementKey(rawKey)) {
      return {
        key: String(rawKey || "") as EntitlementKey,
        allowed: false,
        reason: "unknown_feature",
        message: "Funzione non riconosciuta.",
      };
    }

    const key = rawKey;
    const definition = ENTITLEMENTS[key];

    const override = overrides[key];
    if (override === true) {
      return {
        key,
        allowed: true,
        reason: "granted_by_platform",
        message: "Attivata per questa societa da Cedi.",
      };
    }
    if (override === false) {
      return {
        key,
        allowed: false,
        reason: "revoked_by_platform",
        message: "Disattivata per questa societa da Cedi.",
      };
    }

    if (isPlatformAdmin) {
      return {
        key,
        allowed: true,
        reason: "platform_admin",
        message:
          "Visibile perche stai amministrando la piattaforma: la societa potrebbe non averla.",
      };
    }

    if (definition.includedIn.includes(effectivePlan)) {
      return {
        key,
        allowed: true,
        reason: "included_in_plan",
        message: "Compresa nel piano.",
      };
    }

    if (definition.unlockedByExtra && activeExtras.has(definition.unlockedByExtra)) {
      return {
        key,
        allowed: true,
        reason: "unlocked_by_extra",
        message: "Attiva come servizio aggiuntivo.",
      };
    }

    /*
      Se la funzione era compresa nel piano scritto ma non in quello che
      vale, il problema e l'abbonamento e non il listino: dirlo cambia cosa
      fa la persona che legge.
    */
    if (
      definition.includedIn.includes(plan) &&
      !PAYING_STATUSES.includes(subscriptionStatus)
    ) {
      return {
        key,
        allowed: false,
        reason: "subscription_inactive",
        message: "L'abbonamento non e in corso: rinnovalo per riattivarla.",
      };
    }

    if (definition.includedIn.length) {
      return {
        key,
        allowed: false,
        reason: "requires_plan",
        message: `Disponibile con il piano ${definition.includedIn.includes("plus") ? "Plus" : "superiore"}.`,
      };
    }

    return {
      key,
      allowed: false,
      reason: "requires_extra",
      message: "Si attiva come servizio aggiuntivo.",
    };
  };

  return {
    plan,
    effectivePlan,
    subscriptionStatus,
    isPlatformAdmin,
    has: (key: unknown) => explain(key).allowed,
    explain,
    all: () => ENTITLEMENT_KEYS.map((key) => explain(key)),
  };
};

/** Le eccezioni di un club, ripulite: chiavi sconosciute e valori non booleani via. */
export const normalizeEntitlementOverrides = (
  value: unknown,
): EntitlementOverrides => {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const overrides: EntitlementOverrides = {};

  for (const [key, raw] of Object.entries(record)) {
    if (!isEntitlementKey(key)) continue;
    if (typeof raw !== "boolean") continue;
    overrides[key] = raw;
  }

  return overrides;
};
