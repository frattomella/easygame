/**
 * Cosa un club puo usare, letto dal database. **Unico punto.**
 *
 * Il calcolo sta nel modulo puro (`src/lib/entitlements/`); qui si prende cio
 * che serve al calcolo dalle impostazioni del club, e si prende **sempre
 * dagli stessi campi**. E la meta noiosa del problema ed e quella che, se
 * duplicata, fa divergere due schermate che dovrebbero dire la stessa cosa.
 *
 * **Un avvertimento che vale piu del codice qui sotto.** Il piano e i servizi
 * attivi stanno in `clubs.settings`, e la pagina Organizzazione permette al
 * club di modificarli. Finche gli entitlement **descrivono** — la console li
 * mostra, l'interfaccia puo spiegare cosa manca — non e un problema. Il
 * giorno in cui cominciano a **negare** l'accesso a qualcosa, un club potra
 * concedersi il piano superiore da solo, ed e per questo che il piano deve
 * prima passare sotto il controllo della piattaforma. Vedi D37 in
 * [16 — debito tecnico], e ADR-0046.
 *
 * Le **eccezioni** (`settings.entitlements.overrides`) invece nascono gia
 * governate: le scrive solo la console di piattaforma.
 */

import { prisma } from "./prisma";
import {
  normalizeEntitlementOverrides,
  resolveEntitlements,
  type EntitlementSet,
} from "@/lib/entitlements";
import {
  normalizeExtraServices,
  normalizeSubscriptionSettings,
} from "@/lib/payments/payment-config-utils";
import type { HubExtraServiceKey } from "@/lib/payments/payment-types";

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
  const subscription = normalizeSubscriptionSettings(record.subscriptionSettings);
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
