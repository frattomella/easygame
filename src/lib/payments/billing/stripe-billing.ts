/**
 * Il **billing di piattaforma**: Cedi Soft incassa dai club.
 *
 * **Perche non riusa il gateway degli incassi.** Sono due denari su due
 * account Stripe diversi, e la differenza non e organizzativa ma sostanziale:
 *
 *   * la quota che una **famiglia** paga entra sull'account connesso del
 *     **club**, e EasyGame ne trattiene una commissione;
 *   * la quota che una **societa** paga entra sull'account centrale di **Cedi
 *     Soft**, e non c'entra nulla con gli incassi di nessuno.
 *
 * Mescolarli vorrebbe dire che il fatturato di EasyGame compare nel registro
 * incassi di un club, e viceversa. La differenza tecnica e una sola —
 * l'intestazione `Stripe-Account`, che qui **non si passa mai** — e proprio
 * perche e una sola serve un modulo separato: in un modulo condiviso sarebbe
 * un parametro dimenticabile. Vedi ADR-0051.
 *
 * **Cosa e collaudato e cosa no.** La traduzione degli eventi ha test. Tutto
 * cio che parla con `api.stripe.com` non e collaudato contro Stripe: non ci
 * sono credenziali in questo repository e non se ne inventano. Il codice e
 * scritto sulla documentazione ufficiale e va considerato **da collaudare**,
 * non funzionante.
 */

import {
  callStripe,
  readStripeSecretKey,
} from "@/lib/payments/gateway/providers/stripe-http";
import { verifyStripeSignature } from "@/lib/payments/gateway/providers/stripe-signature";
import { PaymentGatewayError } from "@/lib/payments/gateway";

const asText = (value: unknown) => String(value ?? "").trim();

export const isPlatformBillingConfigured = () =>
  Boolean(readStripeSecretKey());

/* --------------------------------------------------------- abbonamenti */

export const PLATFORM_SUBSCRIPTION_STATUSES = [
  "not_active",
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "expired",
] as const;

export type PlatformSubscriptionStatus =
  (typeof PLATFORM_SUBSCRIPTION_STATUSES)[number];

/**
 * Lo stato di Stripe tradotto in quello di EasyGame.
 *
 * **`incomplete` non e `active`, e non e nemmeno un errore.** E una
 * sottoscrizione il cui primo pagamento non e ancora andato a buon fine:
 * trattarla come attiva concederebbe il piano superiore a chi non ha pagato,
 * che e esattamente il difetto che ADR-0048 ha chiuso dall'altro lato.
 */
export const translateSubscriptionStatus = (
  value: unknown,
): PlatformSubscriptionStatus => {
  switch (asText(value)) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "cancelled";
    case "incomplete_expired":
      return "expired";
    case "incomplete":
    case "paused":
    default:
      return "not_active";
  }
};

export type PlatformSubscriptionSnapshot = {
  customerId: string;
  subscriptionId: string;
  priceId: string;
  status: PlatformSubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** Il club, dai metadati che EasyGame scrive quando apre la sottoscrizione. */
  organizationId: string | null;
};

const snapshotFromSubscription = (
  subscription: any,
): PlatformSubscriptionSnapshot => ({
  customerId: asText(subscription?.customer),
  subscriptionId: asText(subscription?.id),
  priceId: asText(subscription?.items?.data?.[0]?.price?.id),
  status: translateSubscriptionStatus(subscription?.status),
  currentPeriodEnd: subscription?.current_period_end
    ? new Date(Number(subscription.current_period_end) * 1000).toISOString()
    : null,
  cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
  organizationId:
    asText(subscription?.metadata?.easygame_organization_id) || null,
});

/* ------------------------------------------------------------ il cliente */

/** Il cliente Stripe di una societa, creato se non c'e. */
export const ensureBillingCustomer = async (input: {
  organizationId: string;
  clubName: string;
  email: string;
  existingCustomerId?: string | null;
}): Promise<string> => {
  const existing = asText(input.existingCustomerId);
  if (existing) return existing;

  const customer = await callStripe("/customers", {
    /*
      Nessun `stripeAccount`: e il punto di tutto questo modulo. Il cliente
      appartiene a Cedi Soft, non al club che sta pagando.
    */
    body: {
      name: asText(input.clubName) || "Societa sportiva",
      email: asText(input.email),
      "metadata[easygame_organization_id]": asText(input.organizationId),
    },
    idempotencyKey: `billing-customer:${asText(input.organizationId)}`,
  });

  return asText(customer?.id);
};

/**
 * Apre il checkout dell'abbonamento EasyGame.
 *
 * L'identificativo del prezzo arriva dalla configurazione di piattaforma, non
 * dal client: un client che potesse sceglierlo sceglierebbe quello che costa
 * meno.
 */
export const createSubscriptionCheckout = async (input: {
  organizationId: string;
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}) => {
  if (!asText(input.priceId)) {
    throw new PaymentGatewayError(
      "not_configured",
      "Il listino EasyGame non e configurato: manca l'identificativo del prezzo su Stripe",
      "stripe",
    );
  }

  const session = await callStripe("/checkout/sessions", {
    body: {
      mode: "subscription",
      customer: input.customerId,
      "line_items[0][price]": input.priceId,
      "line_items[0][quantity]": 1,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      "metadata[easygame_organization_id]": asText(input.organizationId),
      "subscription_data[metadata][easygame_organization_id]": asText(
        input.organizationId,
      ),
    },
    idempotencyKey: [
      "billing-checkout",
      asText(input.organizationId),
      asText(input.priceId),
    ].join(":"),
  });

  return {
    url: asText(session?.url),
    externalId: asText(session?.id),
  };
};

/**
 * Apre il portale clienti Stripe.
 *
 * **Perche il portale e non un'interfaccia nostra.** Cambiare metodo di
 * pagamento, scaricare le fatture di Cedi Soft e disdire sono operazioni che
 * toccano dati di pagamento: farle passare da EasyGame vorrebbe dire
 * ricostruire — e custodire — cose che Stripe gia fa e che noi non dobbiamo
 * vedere.
 */
export const createBillingPortalSession = async (input: {
  customerId: string;
  returnUrl: string;
}) => {
  const session = await callStripe("/billing_portal/sessions", {
    body: {
      customer: asText(input.customerId),
      return_url: input.returnUrl,
    },
  });

  return { url: asText(session?.url) };
};

export const fetchSubscription = async (
  subscriptionId: string,
): Promise<PlatformSubscriptionSnapshot> =>
  snapshotFromSubscription(
    await callStripe(`/subscriptions/${encodeURIComponent(subscriptionId)}`),
  );

/* -------------------------------------------------------------- webhook */

export type PlatformBillingEvent = {
  id: string;
  type: string;
  /** La sottoscrizione a cui l'evento si riferisce, se ne ha una. */
  subscription: PlatformSubscriptionSnapshot | null;
  createdAt: string;
  /**
   * Vero se l'evento arriva da un account **connesso**.
   *
   * Il webhook del billing non deve elaborarne nessuno: significherebbe che il
   * segreto di un endpoint e stato puntato all'altro flusso, e trattare
   * l'evento di un club come un abbonamento di piattaforma e il genere di
   * errore che si scopre in contabilita.
   */
  fromConnectedAccount: boolean;
  /**
   * L'ambiente dichiarato da Stripe: vero in produzione, falso in sandbox.
   *
   * `null` quando l'evento non lo dichiara. Vale qui la stessa ragione del
   * flusso degli incassi: un abbonamento **live** registrato da un deployment
   * di prova cambierebbe il piano di una societa vera partendo da un evento
   * che quel deployment non aveva titolo di ricevere. Vedi `live-mode.ts`.
   */
  liveMode: boolean | null;
};

/**
 * Gli eventi che questo flusso ascolta.
 *
 * **Solo quelli che cambiano lo stato di un abbonamento.** Sottoscrivere
 * `invoice.*` per intero riempirebbe la tabella degli eventi di righe che
 * nessuno legge e che nascondono quelle che contano.
 */
export const PLATFORM_BILLING_EVENT_TYPES = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
] as const;

const subscriptionFromEventObject = (
  object: any,
): PlatformSubscriptionSnapshot | null => {
  const kind = asText(object?.object);

  if (kind === "subscription") return snapshotFromSubscription(object);

  /*
    Una sessione di checkout completata porta l'identificativo della
    sottoscrizione, non la sottoscrizione: lo stato vero va riletto. Si
    restituisce quel che si sa, e chi elabora l'evento completa con una
    lettura.
  */
  if (kind === "checkout.session" && asText(object?.subscription)) {
    return {
      customerId: asText(object?.customer),
      subscriptionId: asText(object?.subscription),
      priceId: "",
      status: "not_active",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      organizationId:
        asText(object?.metadata?.easygame_organization_id) || null,
    };
  }

  return null;
};

export const parsePlatformBillingWebhook = (input: {
  rawBody: string;
  signature: string;
  secret: string;
  now?: Date;
}): PlatformBillingEvent => {
  const verification = verifyStripeSignature({
    rawBody: input.rawBody,
    header: input.signature,
    secret: input.secret,
    now: input.now,
  });

  if (!verification.valid) {
    throw new PaymentGatewayError(
      "invalid_signature",
      `Firma webhook non valida (${verification.reason})`,
      "stripe",
    );
  }

  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(input.rawBody);
  } catch {
    throw new PaymentGatewayError(
      "invalid_signature",
      "Corpo del webhook non interpretabile",
      "stripe",
    );
  }

  return {
    id: asText(parsed?.id),
    type: asText(parsed?.type),
    subscription: subscriptionFromEventObject(parsed?.data?.object),
    createdAt: parsed?.created
      ? new Date(Number(parsed.created) * 1000).toISOString()
      : "",
    fromConnectedAccount: Boolean(asText(parsed?.account)),
    liveMode: typeof parsed?.livemode === "boolean" ? parsed.livemode : null,
  };
};
