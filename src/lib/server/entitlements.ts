/**
 * Cosa un club puo usare, letto dal database. **Unico punto.**
 *
 * Il calcolo sta nel modulo puro (`src/lib/entitlements/`); qui si prende cio
 * che serve al calcolo dalle impostazioni del club, e si prende **sempre
 * dagli stessi campi**. E la meta noiosa del problema ed e quella che, se
 * duplicata, fa divergere due schermate che dovrebbero dire la stessa cosa.
 *
 * **Chi puo scrivere che cosa.** Piano, stato dell'abbonamento, servizi
 * aggiuntivi ed eccezioni stanno tutti in `clubs.settings`, ma **nessuno dei
 * quattro** e scrivibile dal club: la pagina Organizzazione li mostra e basta,
 * e `withPlatformOwnedSettings` rimette al loro posto quelli che arrivassero
 * comunque da un `PATCH`. Le scritture passano da qui — `setClubPlan`,
 * `setClubExtraService`, `setClubEntitlementOverride` — e da nessun altro
 * posto. Chiude D37, che era il motivo per cui il gating vero non era mai
 * stato acceso. Vedi ADR-0046 e ADR-0048.
 */

import { prisma } from "./prisma";
import {
  normalizeEntitlementOverrides,
  readSubscriptionSettingsSource,
  resolveEntitlements,
  type EntitlementSet,
} from "@/lib/entitlements";
import {
  normalizeExtraServices,
  normalizeSubscriptionSettings,
} from "@/lib/payments/payment-config-utils";
import type {
  ClubSubscriptionPlan,
  ClubSubscriptionSettings,
  ClubSubscriptionStatus,
  HubExtraBillingStatus,
  HubExtraServiceKey,
} from "@/lib/payments/payment-types";

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

export type ClubEntitlementsInput = {
  organizationId: string;
  isPlatformAdmin?: boolean;
};

export type ClubEntitlements = {
  organizationId: string;
  entitlements: EntitlementSet;
  /** I servizi opzionali attivi, per la console. */
  activeExtras: HubExtraServiceKey[];
};

/** Estrae cio che serve al calcolo da `clubs.settings`, senza interpretarlo. */
export const readEntitlementInputFromSettings = (settings: unknown) => {
  const record = asRecord(settings);
  /*
    Da quale chiave si legge il piano non e un dettaglio: la pagina
    Organizzazione scrive `settings.subscription`, questo modulo leggeva
    `settings.subscriptionSettings`, e nessun club aveva percio il piano che
    credeva di avere — il calcolo partiva sempre dai valori predefiniti. La
    scelta della chiave sta ora in un posto solo.
  */
  const subscription = normalizeSubscriptionSettings(
    readSubscriptionSettingsSource(record),
  );
  const extras = normalizeExtraServices(record.extraServices);

  return {
    plan: subscription.plan,
    subscriptionStatus: subscription.status,
    /*
      «Attivo» vuol dire attivo **adesso**: un servizio disdetto resta
      nell'elenco con lo stato che lo dice, e contarlo fra quelli attivi
      terrebbe accesa una funzione che nessuno paga piu.
    */
    activeExtras: extras
      .filter(
        (service) =>
          service.enabled &&
          (service.billingStatus === "active" ||
            service.billingStatus === "trialing"),
      )
      .map((service) => service.key),
    overrides: normalizeEntitlementOverrides(
      asRecord(record.entitlements).overrides,
    ),
  };
};

/**
 * Gli entitlement di un club.
 *
 * Non riceve uno scope: chi chiama ha gia stabilito di poter leggere quel
 * club. Riceve pero `isPlatformAdmin`, che **non** deve mai arrivare dal
 * corpo di una richiesta — si ricava dalla sessione.
 */
export const loadClubEntitlements = async (
  input: ClubEntitlementsInput,
): Promise<ClubEntitlements> => {
  const organizationId = String(input.organizationId || "").trim();
  if (!organizationId) {
    throw new Error("Accesso negato: nessun club indicato");
  }

  const club = await (prisma as any).club.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  if (!club) {
    throw new Error("Club non trovato");
  }

  const parsed = readEntitlementInputFromSettings(club.settings);

  return {
    organizationId,
    activeExtras: parsed.activeExtras,
    entitlements: resolveEntitlements({
      ...parsed,
      isPlatformAdmin: Boolean(input.isPlatformAdmin),
    }),
  };
};

/**
 * Scrive un'eccezione per un club. **Solo dalla console di piattaforma.**
 *
 * `null` toglie l'eccezione e riporta la funzione alla regola del listino: e
 * diverso da `false`, che la **vieta** anche a chi il listino la comprende.
 * Le due cose vanno tenute distinte, altrimenti «rimetti com'era» diventa
 * irraggiungibile.
 */
export const setClubEntitlementOverride = async (input: {
  organizationId: string;
  key: string;
  value: boolean | null;
}) => {
  const organizationId = String(input.organizationId || "").trim();
  if (!organizationId) {
    throw new Error("Accesso negato: nessun club indicato");
  }

  const club = await (prisma as any).club.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  if (!club) {
    throw new Error("Club non trovato");
  }

  const settings = asRecord(club.settings);
  const entitlements = asRecord(settings.entitlements);
  const overrides = normalizeEntitlementOverrides(entitlements.overrides);

  if (input.value === null) {
    delete overrides[input.key as keyof typeof overrides];
  } else {
    const next = normalizeEntitlementOverrides({ [input.key]: input.value });
    if (!Object.keys(next).length) {
      throw new Error("Funzione non riconosciuta");
    }
    Object.assign(overrides, next);
  }

  await (prisma as any).club.update({
    where: { id: organizationId },
    data: {
      settings: {
        ...settings,
        entitlements: { ...entitlements, overrides },
      },
    },
  });

  return overrides;
};

/**
 * Il piano di un club. **Solo dalla console di piattaforma.**
 *
 * Non e una preferenza del club: e cio che il club ha comprato, e chi lo
 * vende e Cedi. Finche restava scrivibile dalla pagina Organizzazione,
 * accendere il gating vero avrebbe voluto dire permettere a un club di
 * concedersi il piano superiore da solo (D37).
 *
 * Scrive sotto la chiave `subscription`, che e quella che la pagina
 * Organizzazione legge: cosi il club vede subito, in sola lettura, cio che la
 * piattaforma gli ha assegnato.
 */
export const setClubPlan = async (input: {
  organizationId: string;
  plan?: ClubSubscriptionPlan | null;
  status?: ClubSubscriptionStatus | null;
  renewalDate?: string | null;
}) => {
  const organizationId = String(input.organizationId || "").trim();
  if (!organizationId) {
    throw new Error("Accesso negato: nessun club indicato");
  }

  const club = await (prisma as any).club.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  if (!club) {
    throw new Error("Club non trovato");
  }

  const settings = asRecord(club.settings);
  const current = normalizeSubscriptionSettings(
    readSubscriptionSettingsSource(settings),
  );

  const next: ClubSubscriptionSettings = normalizeSubscriptionSettings({
    ...current,
    ...(input.plan === undefined || input.plan === null
      ? {}
      : { plan: input.plan }),
    ...(input.status === undefined || input.status === null
      ? {}
      : { status: input.status }),
    ...(input.renewalDate === undefined
      ? {}
      : { renewalDate: input.renewalDate || "" }),
    updatedAt: new Date().toISOString(),
  });

  await (prisma as any).club.update({
    where: { id: organizationId },
    data: {
      settings: {
        ...settings,
        subscription: next,
        /*
          La chiave storica viene tenuta allineata invece che cancellata: un
          record che ne ha una e l'altra con valori diversi e il modo in cui
          il difetto della chiave sbagliata si ripresenterebbe.
        */
        ...(settings.subscriptionSettings === undefined
          ? {}
          : { subscriptionSettings: next }),
      },
    },
  });

  return next;
};

/**
 * Un servizio aggiuntivo di un club. **Solo dalla console di piattaforma.**
 *
 * `enabled` e `billingStatus` restano due cose distinte: un servizio disdetto
 * resta nell'elenco con lo stato che lo dice, e il calcolo degli entitlement
 * non lo conta fra quelli attivi. Sovrascriverli insieme farebbe sparire la
 * differenza fra «mai attivato» e «non piu pagato».
 */
export const setClubExtraService = async (input: {
  organizationId: string;
  key: string;
  enabled: boolean;
  billingStatus?: HubExtraBillingStatus | null;
}) => {
  const organizationId = String(input.organizationId || "").trim();
  if (!organizationId) {
    throw new Error("Accesso negato: nessun club indicato");
  }

  const club = await (prisma as any).club.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  if (!club) {
    throw new Error("Club non trovato");
  }

  const settings = asRecord(club.settings);
  const services = normalizeExtraServices(settings.extraServices);
  const target = services.find((service) => service.key === input.key);

  if (!target) {
    throw new Error("Servizio non riconosciuto");
  }

  const billingStatus: HubExtraBillingStatus =
    input.billingStatus ||
    (input.enabled ? "active" : target.billingStatus === "active" ? "cancelled" : "not_active");

  const next = services.map((service) =>
    service.key === input.key
      ? {
          ...service,
          enabled: input.enabled,
          billingStatus,
          activatedAt:
            input.enabled && !(service as any).activatedAt
              ? new Date().toISOString()
              : (service as any).activatedAt,
        }
      : service,
  );

  await (prisma as any).club.update({
    where: { id: organizationId },
    data: { settings: { ...settings, extraServices: next } },
  });

  return next;
};

/**
 * Pretende che un club possa usare una funzione, o ferma la richiesta.
 *
 * **Perche il messaggio e quello del calcolo e non uno nuovo.** «Disponibile
 * con il piano Plus» e «L'abbonamento non e in corso» portano la persona che
 * legge a fare due cose diverse. Un `403` con scritto «Accesso negato» le
 * porta a telefonare. Il verdetto sa gia quale delle due e, e lo dice.
 *
 * Il prefisso `Accesso negato` resta perche e cio che il route handler
 * generico usa per mappare la risposta su un 403 (CLAUDE.md, sezione 8).
 */
export const requireClubEntitlement = async (input: {
  organizationId: string;
  key: string;
  isPlatformAdmin?: boolean;
}) => {
  const { entitlements } = await loadClubEntitlements({
    organizationId: input.organizationId,
    isPlatformAdmin: input.isPlatformAdmin,
  });

  const verdict = entitlements.explain(input.key);
  if (!verdict.allowed) {
    throw new Error(`Accesso negato: ${verdict.message}`);
  }

  return verdict;
};
