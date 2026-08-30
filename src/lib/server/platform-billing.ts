/**
 * Il **billing di piattaforma** lato server: chi apre un abbonamento e chi
 * crede a un evento del flusso di Cedi Soft.
 *
 * **Il confine, ancora una volta.** Questo file scrive
 * `platform_billing_accounts` e, attraverso `entitlements`, il piano di una
 * societa. Non tocca **mai** `payment_transactions`: gli incassi degli atleti
 * sono un altro denaro, su un altro account Stripe, e un abbonamento che
 * comparisse nel registro incassi di un club sarebbe un errore contabile che
 * nessuno cercherebbe li. Vedi ADR-0051.
 *
 * **Perche lo stato dell'abbonamento arriva solo da un evento firmato.** Il
 * ritorno dal checkout dice che il browser e tornato, non che il primo
 * addebito sia riuscito: una carta rifiutata produce esattamente lo stesso
 * ritorno. Concedere il piano al ritorno significherebbe regalarlo a chiunque
 * apra il checkout e chiuda la finestra.
 */

import { prisma } from "./prisma";
import { setClubPlan } from "./entitlements";
import { checkWebhookEnvironment } from "./payment-environment";
import {
  fetchSubscription,
  type PlatformBillingEvent,
  type PlatformSubscriptionSnapshot,
} from "@/lib/payments/billing/stripe-billing";

const asText = (value: unknown) => String(value ?? "").trim();

const billingClient = () => (prisma as any).platformBillingAccount;
const webhookClient = () => (prisma as any).paymentWebhookEvent;

export type PlatformBillingRecord = {
  organizationId: string;
  externalCustomerId: string | null;
  externalSubscriptionId: string | null;
  externalPriceId: string | null;
  plan: "free" | "plus";
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  lastEventAt: string | null;
  lastError: string | null;
};

const toRecord = (row: any, organizationId: string): PlatformBillingRecord => ({
  organizationId,
  externalCustomerId: asText(row?.external_customer_id) || null,
  externalSubscriptionId: asText(row?.external_subscription_id) || null,
  externalPriceId: asText(row?.external_price_id) || null,
  plan: row?.plan === "plus" ? "plus" : "free",
  status: asText(row?.status) || "not_active",
  currentPeriodEnd: row?.current_period_end
    ? new Date(row.current_period_end).toISOString()
    : null,
  cancelAtPeriodEnd: Boolean(row?.cancel_at_period_end),
  lastEventAt: row?.last_event_at
    ? new Date(row.last_event_at).toISOString()
    : null,
  lastError: asText(row?.last_error) || null,
});

export const getPlatformBillingAccount = async (
  organizationId: string,
): Promise<PlatformBillingRecord> => {
  const id = asText(organizationId);
  if (!id) throw new Error("Accesso negato: nessun club indicato");

  const row = await billingClient().findUnique({
    where: { organization_id: id },
  });

  return toRecord(row, id);
};

export const listPlatformBillingAccounts = async (
  organizationIds: string[],
): Promise<Map<string, PlatformBillingRecord>> => {
  const ids = Array.from(new Set(organizationIds.map(asText).filter(Boolean)));
  if (!ids.length) return new Map();

  const rows = await billingClient().findMany({
    where: { organization_id: { in: ids } },
  });

  const byId = new Map<string, PlatformBillingRecord>();
  for (const id of ids) {
    byId.set(
      id,
      toRecord(
        rows.find((entry: any) => String(entry.organization_id) === id),
        id,
      ),
    );
  }

  return byId;
};

export const rememberBillingCustomer = async (input: {
  organizationId: string;
  customerId: string;
}) => {
  const id = asText(input.organizationId);

  const row = await billingClient().upsert({
    where: { organization_id: id },
    create: {
      organization_id: id,
      external_customer_id: asText(input.customerId),
    },
    update: { external_customer_id: asText(input.customerId) },
  });

  return toRecord(row, id);
};

/**
 * Applica al database lo stato di una sottoscrizione, e allinea il piano.
 *
 * **Perche il piano si scrive qui e non in due posti.** Il piano di una
 * societa e di proprieta della piattaforma (ADR-0048) e vive in
 * `clubs.settings.subscription`; lo stato presso Stripe vive qui. Se le due
 * scritture fossero indipendenti, una societa potrebbe risultare `plus` in
 * EasyGame e `cancelled` su Stripe, e nessuno saprebbe quale delle due
 * guardare. Una sola funzione le muove insieme.
 */
export const applySubscriptionSnapshot = async (input: {
  organizationId: string;
  snapshot: PlatformSubscriptionSnapshot;
}): Promise<PlatformBillingRecord> => {
  const id = asText(input.organizationId);
  const snapshot = input.snapshot;

  /*
    Il piano segue lo stato, non il contrario. `trialing` da diritto al piano
    come `active`: una prova che non desse accesso a nulla non sarebbe una
    prova. `past_due` lo **conserva**: sospendere una societa al primo addebito
    fallito significherebbe spegnere una segreteria per una carta scaduta, e
    la sospensione resta una decisione che si prende in Platform Admin.
  */
  const plan =
    snapshot.status === "active" ||
    snapshot.status === "trialing" ||
    snapshot.status === "past_due"
      ? "plus"
      : "free";

  const row = await billingClient().upsert({
    where: { organization_id: id },
    create: {
      organization_id: id,
      external_customer_id: snapshot.customerId || null,
      external_subscription_id: snapshot.subscriptionId || null,
      external_price_id: snapshot.priceId || null,
      plan,
      status: snapshot.status,
      current_period_end: snapshot.currentPeriodEnd
        ? new Date(snapshot.currentPeriodEnd)
        : null,
      cancel_at_period_end: snapshot.cancelAtPeriodEnd,
      last_event_at: new Date(),
      last_error: null,
    },
    update: {
      external_customer_id: snapshot.customerId || undefined,
      external_subscription_id: snapshot.subscriptionId || undefined,
      external_price_id: snapshot.priceId || undefined,
      plan,
      status: snapshot.status,
      current_period_end: snapshot.currentPeriodEnd
        ? new Date(snapshot.currentPeriodEnd)
        : null,
      cancel_at_period_end: snapshot.cancelAtPeriodEnd,
      last_event_at: new Date(),
      last_error: null,
    },
  });

  await setClubPlan({
    organizationId: id,
    plan,
    status: snapshot.status as any,
    renewalDate: snapshot.currentPeriodEnd || undefined,
  });

  return toRecord(row, id);
};

/* -------------------------------------------------------------- webhook */

export type BillingWebhookOutcome = {
  duplicate: boolean;
  status: "processed" | "ignored" | "failed";
  organizationId: string | null;
  message: string;
};

/**
 * Elabora un evento del flusso Cedi Soft -> Club.
 *
 * La deduplica e la stessa tabella degli incassi, distinta dal campo `flow`:
 * gli identificativi degli eventi sono unici per account Stripe, e tenerli
 * insieme evita due meccaniche di idempotenza da mantenere allineate.
 */
export const handlePlatformBillingEvent = async (
  event: PlatformBillingEvent,
): Promise<BillingWebhookOutcome> => {
  const eventId = asText(event.id);
  if (!eventId) {
    throw new Error("Evento senza identificativo");
  }

  /*
    L'ambiente, prima di tutto il resto e prima della deduplica: un abbonamento
    **live** registrato da un deployment di prova cambierebbe il piano di una
    societa vera partendo da un evento che questo deployment non aveva titolo
    di ricevere. Vedi `payment-environment.ts`.
  */
  const environment = checkWebhookEnvironment(event.liveMode);

  if (!environment.accepted) {
    console.warn("[billing/webhook] evento di un altro ambiente", {
      eventId,
      expected: environment.expected,
      received: environment.eventEnvironment,
    });

    return {
      duplicate: false,
      status: "ignored",
      organizationId: null,
      message: environment.reason,
    };
  }

  /*
    Un evento che arriva da un account connesso su questo endpoint significa
    che i due segreti sono stati scambiati in configurazione. Elaborarlo
    tratterebbe l'incasso di una famiglia come un abbonamento di piattaforma:
    si rifiuta, e lo si dice.
  */
  if (event.fromConnectedAccount) {
    return {
      duplicate: false,
      status: "ignored",
      organizationId: null,
      message:
        "Evento di un account connesso ricevuto sull'endpoint del billing: controlla quale segreto e configurato su quale endpoint",
    };
  }

  const organizationId = asText(event.subscription?.organizationId) || null;

  try {
    await webhookClient().create({
      data: {
        provider: "stripe",
        event_id: eventId,
        event_type: event.type,
        flow: "platform",
        organization_id: organizationId,
        external_reference: event.subscription?.subscriptionId || null,
        status: "processed",
      },
    });
  } catch (error: any) {
    const isDuplicate =
      error?.code === "P2002" ||
      String(error?.message || "").includes("payment_webhook_events");

    if (!isDuplicate) throw error;

    /*
      **Un tentativo fallito non e un evento gia elaborato.**

      Stessa forma dell'endpoint dei pagamenti, e stessa conseguenza spostata
      di dominio: la riga si inserisce prima di agire, `markFailed` la lascia
      dov'e, e alla riconsegna questo ramo rispondeva 200 «gia ricevuto». Il
      provider smetteva di ritentare, e un club che ha pagato l'abbonamento
      restava sul piano gratuito **per sempre**, senza che nessuna riga lo
      dicesse a qualcuno.

      Il tentativo fallito si riprende in modo atomico: una sola riga
      aggiornata designa il vincitore anche fra riconsegne simultanee.
    */
    const ripreso = await webhookClient().updateMany({
      where: { provider: "stripe", event_id: eventId, status: "failed" },
      data: { status: "processed", error: null },
    });

    if (ripreso.count !== 1) {
      return {
        duplicate: true,
        status: "processed",
        organizationId,
        message: "Evento gia ricevuto: nessuna operazione ripetuta",
      };
    }
  }

  const markIgnored = async (message: string): Promise<BillingWebhookOutcome> => {
    await webhookClient().updateMany({
      where: { provider: "stripe", event_id: eventId },
      data: { status: "ignored" },
    });
    return { duplicate: false, status: "ignored", organizationId, message };
  };

  if (!event.subscription || !organizationId) {
    return markIgnored(
      "Evento senza una sottoscrizione riconducibile a una societa di EasyGame",
    );
  }

  try {
    /*
      La sessione di checkout porta l'identificativo, non lo stato. Rileggerla
      da Stripe e l'unico modo di sapere se il primo addebito e riuscito: la
      sessione «completata» lo e anche quando la carta viene poi rifiutata.
    */
    const snapshot = event.subscription.priceId
      ? event.subscription
      : await fetchSubscription(event.subscription.subscriptionId);

    await applySubscriptionSnapshot({
      organizationId,
      snapshot: { ...snapshot, organizationId },
    });

    return {
      duplicate: false,
      status: "processed",
      organizationId,
      message: `Abbonamento aggiornato: ${snapshot.status}`,
    };
  } catch (error: any) {
    await webhookClient().updateMany({
      where: { provider: "stripe", event_id: eventId },
      data: {
        status: "failed",
        error: String(error?.message || "").slice(0, 500),
      },
    });

    await billingClient()
      .updateMany({
        where: { organization_id: organizationId },
        data: { last_error: String(error?.message || "").slice(0, 500) },
      })
      .catch(() => undefined);

    throw error;
  }
};
