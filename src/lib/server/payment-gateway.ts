/**
 * Il gateway di incasso lato server: chi apre un checkout e chi crede a un webhook.
 *
 * **Il confine che questo file custodisce.** Un incasso online non e un
 * incasso perche il browser dice di essere tornato dalla pagina di pagamento:
 * il browser puo non tornare affatto — la finestra si chiude, la connessione
 * cade — e con i metodi differiti (SEPA, bonifico) il denaro arriva giorni
 * dopo. L'unica fonte che vale e l'evento firmato dal provider. Qui l'evento
 * viene verificato, **deduplicato**, e solo allora diventa una riga del
 * registro incassi.
 *
 * **Perche la deduplica e una tabella e non un `if`.** La firma dice che
 * l'evento viene dal provider; non dice che sia la prima volta che arriva.
 * Stripe riprova la consegna per tre giorni finche non riceve un 2xx, e un
 * rinvio manuale e a un clic di distanza nella sua dashboard. Un evento
 * consegnato due volte, senza memoria, registra l'incasso due volte: la rata
 * di una famiglia risulta pagata il doppio, e a scoprirlo e la famiglia.
 */

import { prisma } from "./prisma";
import { createPaymentTransaction } from "./payment-transactions";
import {
  PaymentGatewayError,
  describeGatewayReadiness,
  requirePaymentGateway,
  type GatewayCheckout,
  type PaymentGatewayKey,
  type GatewayReadiness,
  type GatewayWebhookEvent,
} from "@/lib/payments/gateway";
import { normalizePaymentSettings } from "@/lib/payments/payment-config-utils";
import type { ClubPaymentSettings } from "@/lib/payments/payment-types";

const asText = (value: unknown) => String(value ?? "").trim();

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

/* --------------------------------------------------- il contesto del club */

export type ClubGatewayContext = {
  organizationId: string;
  provider: PaymentGatewayKey;
  settings: ClubPaymentSettings;
  merchantExternalId: string;
  readiness: GatewayReadiness;
};

/**
 * Il provider che questo club usa, e se puo davvero incassare adesso.
 *
 * Il provider **non arriva dalla richiesta**. Un client che potesse
 * sceglierlo sceglierebbe quello con meno controlli; qui lo dicono le
 * impostazioni del club, che solo chi governa il club puo cambiare.
 */
export const resolveClubGatewayContext = async (
  organizationId: string,
): Promise<ClubGatewayContext> => {
  const id = asText(organizationId);
  if (!id) {
    throw new Error("Accesso negato: nessun club indicato");
  }

  const club = await (prisma as any).club.findUnique({
    where: { id },
    select: { settings: true },
  });

  if (!club) {
    throw new Error("Club non trovato");
  }

  const settings = normalizePaymentSettings(
    asRecord(club.settings).paymentSettings,
  );

  /*
    Il provider attivo e il primo abilitato fra quelli configurati per le
    iscrizioni. Uno solo alla volta: due checkout attivi sullo stesso club
    vorrebbero dire due conti su cui il denaro puo arrivare, e nessuno che
    sappia quale guardare.
  */
  const provider: PaymentGatewayKey =
    settings.enabledRegistrationMethods.find(
      (key) => settings.providers[key]?.enabled,
    ) || "stripe";

  const merchantExternalId = asText(
    settings.providers[provider]?.connectedAccountId,
  );

  return {
    organizationId: id,
    provider,
    settings,
    merchantExternalId,
    readiness: describeGatewayReadiness({
      provider,
      enabledByClub: Boolean(settings.enabled && settings.providers[provider]?.enabled),
      merchantExternalId,
      merchantChargesEnabled:
        settings.providers[provider]?.status === "active",
    }),
  };
};

/* ----------------------------------------------------------- il checkout */

export type OpenCheckoutInput = {
  organizationId: string;
  paymentId?: string | null;
  athleteId?: string | null;
  amountCents: number;
  description: string;
  successUrl: string;
  cancelUrl: string;
  payer?: { email?: string; name?: string };
  /** Chi ha premuto: entra nella chiave di idempotenza, non nel provider. */
  actorUserId?: string | null;
};

/**
 * Apre un checkout per una rata.
 *
 * **La chiave di idempotenza non e casuale, ed e apposta.** Se lo fosse, due
 * clic su «Paga» aprirebbero due checkout — e due addebiti a una famiglia.
 * Derivarla dal club, dalla rata e dall'importo fa si che lo stesso pulsante
 * premuto due volte chieda al provider **lo stesso** checkout.
 */
export const openGatewayCheckout = async (
  input: OpenCheckoutInput,
): Promise<{ checkout: GatewayCheckout; context: ClubGatewayContext }> => {
  const context = await resolveClubGatewayContext(input.organizationId);

  if (!context.readiness.canCheckout) {
    throw new PaymentGatewayError(
      context.readiness.blocker === "not_configured"
        ? "not_configured"
        : "merchant_not_ready",
      context.readiness.message,
      context.provider,
    );
  }

  const amountCents = Math.round(Number(input.amountCents || 0));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new PaymentGatewayError(
      "provider_error",
      "Importo del pagamento non valido",
      context.provider,
    );
  }

  const provider = requirePaymentGateway(context.provider);

  const checkout = await provider.createCheckout({
    merchant: { externalId: context.merchantExternalId },
    money: { amountCents, currency: "EUR" },
    platformFee: {
      percent: Number(context.settings.platformFeePercent || 0),
      fixedCents: Number(context.settings.platformFeeFixedCents || 0),
      paidBy: context.settings.platformFeePaidBy,
    },
    description: asText(input.description) || "Quota sportiva",
    reference: {
      organizationId: context.organizationId,
      paymentId: asText(input.paymentId) || null,
      athleteId: asText(input.athleteId) || null,
    },
    payer: input.payer,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    idempotencyKey: [
      "checkout",
      context.organizationId,
      asText(input.paymentId) || "acconto",
      amountCents,
    ].join(":"),
  });

  return { checkout, context };
};

/* ------------------------------------------------------------- i webhook */

const webhookClient = () => (prisma as any).paymentWebhookEvent;

export type WebhookOutcome = {
  /** Vero se questo evento era gia stato ricevuto: non si rifa niente. */
  duplicate: boolean;
  status: "processed" | "ignored" | "failed";
  /** L'incasso registrato, se l'evento ne ha prodotto uno. */
  transactionId: string | null;
  message: string;
};

/**
 * Traduce un evento verificato in cio che EasyGame deve fare.
 *
 * **Cosa produce un incasso e cosa no.** Solo un pagamento **riuscito** con
 * un riferimento a una rata di EasyGame. Un pagamento in corso, autorizzato,
 * scaduto o fallito viene registrato come ricevuto e non muove denaro: una
 * sessione «completa» con SEPA significa che il modulo e stato compilato, non
 * che il denaro sia arrivato.
 *
 * **Cosa succede a un evento senza rata.** Viene marcato `ignored`. Puo
 * capitare — un pagamento nato fuori da EasyGame sull'account del club — e non
 * e un errore: EasyGame non e il registro di cassa di Stripe.
 */
export const handleGatewayWebhookEvent = async (
  event: GatewayWebhookEvent,
): Promise<WebhookOutcome> => {
  const eventId = asText(event.id);
  if (!eventId) {
    throw new PaymentGatewayError(
      "provider_error",
      "Evento senza identificativo",
      event.provider,
    );
  }

  /*
    La riga si inserisce **prima** di agire, e il vincolo di unicita e cio che
    rende la deduplica affidabile: se due consegne dello stesso evento
    arrivano insieme, una delle due fallisce l'inserimento e si ferma. Un
    controllo «esiste gia?» seguito da una scrittura avrebbe una finestra in
    mezzo, e la finestra e proprio il caso che si vuole escludere.
  */
  const payment = event.payment;
  const organizationId = asText(payment?.reference.organizationId) || null;

  try {
    await webhookClient().create({
      data: {
        provider: event.provider,
        event_id: eventId,
        event_type: event.type,
        organization_id: organizationId,
        external_reference: payment?.externalId || null,
        status: "processed",
      },
    });
  } catch (error: any) {
    const isDuplicate =
      error?.code === "P2002" ||
      String(error?.message || "").includes("payment_webhook_events");

    if (!isDuplicate) throw error;

    return {
      duplicate: true,
      status: "processed",
      transactionId: null,
      message: "Evento gia ricevuto: nessuna operazione ripetuta",
    };
  }

  const markIgnored = async (message: string): Promise<WebhookOutcome> => {
    await webhookClient().updateMany({
      where: { provider: event.provider, event_id: eventId },
      data: { status: "ignored" },
    });
    return { duplicate: false, status: "ignored", transactionId: null, message };
  };

  if (!payment) {
    return markIgnored("Evento senza pagamento: registrato e basta");
  }

  if (payment.status !== "succeeded") {
    return markIgnored(
      `Pagamento in stato «${payment.status}»: nessun incasso registrato`,
    );
  }

  if (!organizationId || !payment.reference.paymentId) {
    return markIgnored(
      "Pagamento senza riferimento a una rata di EasyGame: non e nostro",
    );
  }

  try {
    /*
      Uno scope ristretto al club **dichiarato dall'evento**.

      Senza, l'incasso finirebbe sul club a cui appartiene la rata, e un
      evento che citasse la rata di un'altra societa scriverebbe li dentro
      senza che nessuno se ne accorgesse. I metadati li scrive EasyGame
      quando apre il checkout, quindi in condizioni normali le due cose
      coincidono: e proprio per questo che, se un giorno non coincidono, va
      fermato invece che assecondato.
    */
    const result = await createPaymentTransaction({
      organizationId,
      athleteId: payment.reference.athleteId,
      paymentId: payment.reference.paymentId,
      amount: payment.money.amountCents / 100,
      paidAt: payment.paidAt || new Date().toISOString(),
      paymentMethod: "online",
      source: "STRIPE",
      externalReference: payment.externalId,
      notes: `Incasso online ${event.provider}`,
      /*
        L'unico punto in cui EasyGame accetta un incasso non manuale. Lo
        accetta perche arriva da un evento la cui firma e stata verificata,
        non perche qualcuno lo ha dichiarato: la rotta HTTP non puo impostare
        questo flag, e infatti costruisce il suo input campo per campo.
      */
      confirmedByProvider: true,
      /*
        Il provider non conosce il residuo della rata, e potrebbe incassare
        piu di quanto restava — per esempio se qualcuno ha registrato un
        acconto in contanti mentre la famiglia pagava online. Rifiutare
        l'incasso vorrebbe dire perdere denaro che e gia arrivato.
      */
      allowOverpayment: true,
    }, {
      userId: "",
      activeOrganizationId: organizationId,
      allowedOrganizationIds: [organizationId],
    });

    return {
      duplicate: false,
      status: "processed",
      transactionId: result.transaction.id,
      message: "Incasso registrato",
    };
  } catch (error: any) {
    await webhookClient().updateMany({
      where: { provider: event.provider, event_id: eventId },
      data: { status: "failed", error: String(error?.message || "").slice(0, 500) },
    });

    throw error;
  }
};
