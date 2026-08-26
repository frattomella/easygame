/**
 * L'adapter Stripe: il primo provider sotto il gateway.
 *
 * **Il modello scelto, e perche.** Addebiti **diretti** su account connessi
 * (`Stripe-Account` sulla richiesta), con la commissione della piattaforma in
 * `payment_intent_data[application_fee_amount]`. La documentazione Stripe
 * indica l'addebito diretto come il modello adatto alle piattaforme SaaS, ed
 * e anche quello giusto per come stanno le cose qui: chi paga sta pagando
 * **la sua societa sportiva**, non EasyGame. Sull'estratto conto della
 * famiglia compare il club, la pagina di pagamento porta il branding del
 * club, e il denaro entra sul saldo del club senza passare da un conto di
 * Cedi. Un marketplace avrebbe scelto l'addebito indiretto; un gestionale
 * no — EasyGame non vende lo sport, lo amministra.
 *
 * **Perche non c'e la libreria `stripe`.** Le operazioni che servono sono
 * sette e sono chiamate HTTP con corpo `form-urlencoded`. Aggiungere l'SDK
 * significherebbe legare l'astrazione provider-agnostica alla forma degli
 * oggetti di un provider — cioe rinunciare esattamente a cio per cui
 * l'astrazione esiste — e portarsi una dipendenza nel bundle del server. La
 * verifica della firma, che e la parte in cui l'SDK vale davvero, e
 * implementata a parte e **collaudata** (`stripe-signature.ts`).
 *
 * **Cosa e collaudato e cosa no.** La verifica della firma e la traduzione di
 * un evento hanno test. Tutto cio che parla con `api.stripe.com` non e
 * collaudato contro Stripe: non ci sono credenziali in questo repository e
 * non se ne inventano. Il codice e scritto sulla documentazione ufficiale,
 * e finche non gira contro un account vero va considerato **da collaudare**,
 * non funzionante. Vedi ADR-0045.
 */

import {
  PaymentGatewayError,
  type GatewayCheckout,
  type GatewayCheckoutRequest,
  type GatewayMerchant,
  type GatewayOnboardingLink,
  type GatewayPayment,
  type GatewayPaymentReference,
  type GatewayPaymentStatus,
  type PaymentGateway,
  type GatewayRefund,
  type GatewayRefundRequest,
  type GatewayWebhookEvent,
} from "../contract";
import { verifyStripeSignature } from "./stripe-signature";

const STRIPE_API_BASE = "https://api.stripe.com/v1";

const readSecretKey = () => String(process.env.STRIPE_SECRET_KEY || "").trim();

/**
 * Il corpo di una richiesta Stripe: `form-urlencoded` con le parentesi
 * quadre per le strutture annidate (`payment_intent_data[application_fee_amount]`).
 */
const encodeForm = (
  values: Record<string, string | number | undefined | null>,
) => {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") continue;
    params.append(key, String(value));
  }

  return params.toString();
};

const callStripe = async (
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: Record<string, string | number | undefined | null>;
    /** L'account connesso su cui agire: e cio che rende l'addebito diretto. */
    stripeAccount?: string;
    idempotencyKey?: string;
  } = {},
): Promise<Record<string, any>> => {
  const secretKey = readSecretKey();
  if (!secretKey) {
    throw new PaymentGatewayError(
      "not_configured",
      "Stripe non e configurato: manca la chiave segreta",
      "stripe",
    );
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (options.stripeAccount) {
    headers["Stripe-Account"] = options.stripeAccount;
  }

  /*
    La chiave di idempotenza non e un vezzo: senza, un doppio clic o un
    tentativo ripetuto dopo un timeout di rete crea due checkout, e due
    checkout su una rata sola sono due addebiti a una famiglia.
  */
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  const method = options.method || (options.body ? "POST" : "GET");

  let response: Response;
  try {
    response = await fetch(`${STRIPE_API_BASE}${path}`, {
      method,
      headers,
      body: options.body ? encodeForm(options.body) : undefined,
    });
  } catch (error: any) {
    throw new PaymentGatewayError(
      "provider_error",
      `Stripe non raggiungibile: ${error?.message || "errore di rete"}`,
      "stripe",
    );
  }

  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    any
  >;

  if (!response.ok) {
    /*
      Il messaggio del provider si riporta, la richiesta no: contiene
      l'importo, l'email di chi paga e la chiave dell'account connesso.
    */
    throw new PaymentGatewayError(
      "provider_error",
      String(payload?.error?.message || `Stripe ha risposto ${response.status}`),
      "stripe",
    );
  }

  return payload;
};

/* ------------------------------------------------------------ traduzioni */

const readReference = (metadata: any): GatewayPaymentReference => ({
  organizationId: String(metadata?.easygame_organization_id || ""),
  paymentId: String(metadata?.easygame_payment_id || "") || null,
  athleteId: String(metadata?.easygame_athlete_id || "") || null,
});

const merchantFromAccount = (account: any): GatewayMerchant => {
  const chargesEnabled = Boolean(account?.charges_enabled);
  const payoutsEnabled = Boolean(account?.payouts_enabled);
  const pendingRequirements: string[] = [
    ...(account?.requirements?.currently_due || []),
    ...(account?.requirements?.past_due || []),
  ].map((entry: any) => String(entry));

  const status: GatewayMerchant["status"] = account?.requirements?.disabled_reason
    ? "restricted"
    : chargesEnabled && payoutsEnabled
      ? "active"
      : "pending";

  return {
    provider: "stripe",
    externalId: String(account?.id || ""),
    status,
    chargesEnabled,
    payoutsEnabled,
    pendingRequirements,
  };
};

/**
 * Lo stato di una Checkout Session tradotto nello stato del gateway.
 *
 * `payment_status` e la fonte, non `status`: una sessione «completa» con
 * pagamento differito (SEPA, bonifico) e stata compilata ma il denaro non e
 * arrivato, e trattarla come riuscita significherebbe segnare pagata una rata
 * che potrebbe ancora fallire.
 */
const checkoutStatusOf = (session: any): GatewayPaymentStatus => {
  const paymentStatus = String(session?.payment_status || "");
  if (paymentStatus === "paid" || paymentStatus === "no_payment_required") {
    return "succeeded";
  }

  const status = String(session?.status || "");
  if (status === "expired") return "expired";
  if (status === "complete") return "pending";
  return "created";
};

const paymentFromSession = (session: any): GatewayPayment => ({
  provider: "stripe",
  externalId: String(session?.id || ""),
  status: checkoutStatusOf(session),
  money: {
    amountCents: Math.round(Number(session?.amount_total || 0)),
    currency: "EUR",
  },
  platformFeeCents: Math.round(
    Number(session?.metadata?.easygame_platform_fee_cents || 0),
  ),
  reference: readReference(session?.metadata),
  paidAt:
    checkoutStatusOf(session) === "succeeded" && session?.created
      ? new Date(Number(session.created) * 1000).toISOString()
      : null,
});

/**
 * Lo stato di un PaymentIntent.
 *
 * Un intent e un oggetto diverso da una sessione: porta `amount` invece di
 * `amount_total` e uno `status` proprio. Tradurlo con la funzione della
 * sessione darebbe importo zero e stato «creato» su un pagamento riuscito —
 * un errore silenzioso, del tipo peggiore, perche il webhook risponderebbe
 * comunque 200.
 */
const intentStatusOf = (intent: any): GatewayPaymentStatus => {
  switch (String(intent?.status || "")) {
    case "succeeded":
      return "succeeded";
    case "canceled":
      return "failed";
    case "processing":
    case "requires_action":
    case "requires_confirmation":
    case "requires_capture":
      return "pending";
    case "requires_payment_method":
      return intent?.last_payment_error ? "failed" : "created";
    default:
      return "created";
  }
};

const paymentFromIntent = (intent: any): GatewayPayment => {
  const status = intentStatusOf(intent);

  return {
    provider: "stripe",
    externalId: String(intent?.id || ""),
    status,
    money: {
      amountCents: Math.round(Number(intent?.amount || 0)),
      currency: "EUR",
    },
    platformFeeCents: Math.round(Number(intent?.application_fee_amount || 0)),
    reference: readReference(intent?.metadata),
    paidAt:
      status === "succeeded" && intent?.created
        ? new Date(Number(intent.created) * 1000).toISOString()
        : null,
  };
};

/** Traduce l'oggetto di un evento, qualunque dei due sia. */
const paymentFromEventObject = (object: any): GatewayPayment | null => {
  const kind = String(object?.object || "");
  if (kind === "checkout.session") return paymentFromSession(object);
  if (kind === "payment_intent") return paymentFromIntent(object);
  return null;
};

/* ------------------------------------------------------------- adapter */

export const stripeProvider: PaymentGateway = {
  key: "stripe",

  isConfigured: () => Boolean(readSecretKey()),

  createMerchant: async (input) => {
    const account = await callStripe("/accounts", {
      body: {
        type: "standard",
        country: input.country || "IT",
        email: input.email,
        "business_profile[name]": input.clubName,
        "metadata[easygame_organization_id]": input.organizationId,
      },
    });

    return merchantFromAccount(account);
  },

  createOnboardingLink: async (input) => {
    const link = await callStripe("/account_links", {
      body: {
        account: input.merchantExternalId,
        refresh_url: input.refreshUrl,
        return_url: input.returnUrl,
        type: "account_onboarding",
      },
    });

    return {
      url: String(link?.url || ""),
      expiresAt: link?.expires_at
        ? new Date(Number(link.expires_at) * 1000).toISOString()
        : "",
    };
  },

  getMerchant: async (merchantExternalId) =>
    merchantFromAccount(
      await callStripe(`/accounts/${encodeURIComponent(merchantExternalId)}`),
    ),

  createCheckout: async (request: GatewayCheckoutRequest) => {
    if (!request.merchant.externalId) {
      throw new PaymentGatewayError(
        "merchant_not_ready",
        "Il club non ha ancora un account di incasso attivo",
        "stripe",
      );
    }

    const feeCents = Math.min(
      Math.max(
        0,
        Math.round(
          request.money.amountCents * (request.platformFee.percent / 100),
        ) + Math.max(0, Math.round(request.platformFee.fixedCents)),
      ),
      /*
        Stripe rifiuta una commissione maggiore o uguale all'importo. Il
        taglio evita che una configurazione sbagliata trasformi il rifiuto
        del PSP nell'errore che vede la famiglia davanti alla pagina di
        pagamento.
      */
      Math.max(0, request.money.amountCents - 1),
    );

    const session = await callStripe("/checkout/sessions", {
      stripeAccount: request.merchant.externalId,
      idempotencyKey: request.idempotencyKey,
      body: {
        mode: "payment",
        "line_items[0][quantity]": 1,
        "line_items[0][price_data][currency]": "eur",
        "line_items[0][price_data][unit_amount]": request.money.amountCents,
        "line_items[0][price_data][product_data][name]": request.description,
        "payment_intent_data[application_fee_amount]": feeCents || undefined,
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        customer_email: request.payer?.email,
        /*
          I riferimenti di EasyGame stanno nei metadati e tornano indietro
          nel webhook. Il ritorno del browser non e una fonte: chi paga puo
          chiudere la finestra, e con i metodi differiti il denaro arriva
          giorni dopo.
        */
        "metadata[easygame_organization_id]": request.reference.organizationId,
        "metadata[easygame_payment_id]": request.reference.paymentId || "",
        "metadata[easygame_athlete_id]": request.reference.athleteId || "",
        "metadata[easygame_platform_fee_cents]": feeCents,
        "payment_intent_data[metadata][easygame_organization_id]":
          request.reference.organizationId,
        "payment_intent_data[metadata][easygame_payment_id]":
          request.reference.paymentId || "",
      },
    });

    return {
      provider: "stripe",
      externalId: String(session?.id || ""),
      url: String(session?.url || ""),
      status: checkoutStatusOf(session),
      money: request.money,
      platformFeeCents: feeCents,
    } satisfies GatewayCheckout;
  },

  getPayment: async (input) =>
    paymentFromSession(
      await callStripe(
        `/checkout/sessions/${encodeURIComponent(input.externalId)}`,
        { stripeAccount: input.merchantExternalId },
      ),
    ),

  refund: async (request: GatewayRefundRequest) => {
    const refund = await callStripe("/refunds", {
      stripeAccount: request.merchant.externalId,
      idempotencyKey: request.idempotencyKey,
      body: {
        payment_intent: request.externalPaymentId,
        amount: request.amountCents,
        /*
          Senza `refund_application_fee`, la commissione resta alla
          piattaforma e a rimetterla e il club, che ha rimborsato tutto.
        */
        refund_application_fee: "true",
        reason: request.reason,
      },
    });

    return {
      provider: "stripe",
      externalId: String(refund?.id || ""),
      amountCents: Math.round(Number(refund?.amount || 0)),
      status:
        String(refund?.status || "") === "succeeded"
          ? "succeeded"
          : String(refund?.status || "") === "failed"
            ? "failed"
            : "pending",
      platformFeeRefunded: true,
    } satisfies GatewayRefund;
  },

  parseWebhook: ({ rawBody, signature, secret, now }): GatewayWebhookEvent => {
    const verification = verifyStripeSignature({
      rawBody,
      header: signature,
      secret,
      now,
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
      parsed = JSON.parse(rawBody);
    } catch {
      throw new PaymentGatewayError(
        "invalid_signature",
        "Corpo del webhook non interpretabile",
        "stripe",
      );
    }

    const object = parsed?.data?.object || {};
    const type = String(parsed?.type || "");

    /*
      Solo gli eventi il cui oggetto e una sessione o un intent producono un
      pagamento. Per tutti gli altri l'evento resta, viene registrato e non
      muove niente: un webhook che si rompe su un tipo che non conosce si
      rompe al primo evento nuovo che Stripe introduce.
    */
    return {
      provider: "stripe",
      id: String(parsed?.id || ""),
      type,
      payment: paymentFromEventObject(object),
      createdAt: parsed?.created
        ? new Date(Number(parsed.created) * 1000).toISOString()
        : "",
      raw: parsed,
    };
  },
};
