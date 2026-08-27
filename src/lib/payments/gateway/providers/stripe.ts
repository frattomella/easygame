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
  type GatewayAccountEvent,
  type GatewayPayment,
  type GatewayPaymentReference,
  type GatewayPaymentStatus,
  type PaymentGateway,
  type GatewayRefund,
  type GatewayRefundEvent,
  type GatewayRefundRequest,
  type GatewaySettlement,
  type GatewayWebhookEvent,
} from "../contract";
import { verifyStripeSignature } from "./stripe-signature";
import { callStripe, callStripeV2, readStripeSecretKey } from "./stripe-http";

/* ------------------------------------------------------------ traduzioni */

const readReference = (metadata: any): GatewayPaymentReference => ({
  organizationId: String(metadata?.easygame_organization_id || ""),
  paymentId: String(metadata?.easygame_payment_id || "") || null,
  athleteId: String(metadata?.easygame_athlete_id || "") || null,
});

/**
 * I rami dell'account v2 che servono a EasyGame.
 *
 * Cio che non si chiede torna `null`, non «vuoto»: omettere
 * `configuration.merchant` vorrebbe dire leggere «nessuna capacita» su un
 * account che incassa, e spegnere i pagamenti di un club che funziona.
 */
const V2_ACCOUNT_INCLUDE = [
  "configuration.merchant",
  "identity",
  "requirements",
  "defaults",
];

/**
 * Il cruscotto che vede il club, a partire dal tipo di account configurato.
 *
 * Nella v2 non esiste piu un `type`: l'equivalente dell'account **Standard**
 * e `dashboard: "full"`, cioe il club vede il cruscotto Stripe completo e
 * legge i propri incassi senza passare da EasyGame. La configurazione di
 * piattaforma continua a parlare di «standard» ed «express», e la traduzione
 * vive qui invece che nella configurazione: cambiare vocabolario a
 * un'impostazione gia scritta avrebbe voluto dire una migrazione di dati per
 * una rinomina.
 */
const V2_DASHBOARD_BY_ACCOUNT_TYPE: Record<string, "full" | "express"> = {
  standard: "full",
  express: "express",
};

/**
 * Un **account v2** tradotto nello stato che EasyGame conosce.
 *
 * **Perche non e la traduzione campo per campo della v1.** La v1 esponeva due
 * booleani — `charges_enabled`, `payouts_enabled` — e un `disabled_reason`.
 * La v2 espone per **ogni capacita** uno stato e un elenco di motivi, e i due
 * vocabolari non si sovrappongono.
 *
 * Il caso che rende la differenza concreta: un account appena creato ha
 * `card_payments.status = "restricted"` con motivo `requirements_past_due`.
 * Non e un account *limitato*, e un account che **non ha ancora fatto
 * l'onboarding**. Tradurre `restricted` in «limitato» direbbe alla console
 * che Stripe ha bloccato il club il minuto dopo averlo creato, e manderebbe
 * una segreteria a cercare un problema che non esiste.
 *
 * La distinzione la fa il **motivo**, non lo stato: `restricted_other` e
 * `unsupported_country` sono condizioni su cui il club non puo agire da solo;
 * tutto il resto e onboarding da completare.
 */
const merchantFromV2Account = (account: any): GatewayMerchant => {
  const capabilities = account?.configuration?.merchant?.capabilities || {};
  const cardPayments = String(capabilities?.card_payments?.status || "");
  const payouts = String(capabilities?.stripe_balance?.payouts?.status || "");

  const chargesEnabled = cardPayments === "active";
  const payoutsEnabled = payouts === "active";

  /*
    I motivi delle due capacita si leggono insieme: un club che incassa ma non
    puo essere pagato ha comunque qualcosa da sistemare.
  */
  const reasons: string[] = [
    ...(capabilities?.card_payments?.status_details || []),
    ...(capabilities?.stripe_balance?.payouts?.status_details || []),
  ].map((entry: any) => String(entry?.code || ""));

  /*
    `requirements.entries` sostituisce le tre liste della v1
    (`currently_due`, `past_due`, `pending_verification`). Si tengono le voci
    con una scadenza scattata o in scadenza: le «eventually due» non
    impediscono di incassare oggi, e metterle davanti al club come cose da
    fare subito sarebbe falso.
  */
  const entries: any[] = Array.isArray(account?.requirements?.entries)
    ? account.requirements.entries
    : [];

  const pendingRequirements = entries
    .filter((entry: any) => {
      const deadline = String(entry?.minimum_deadline?.status || "");
      return deadline === "past_due" || deadline === "currently_due";
    })
    .map((entry: any) => String(entry?.description || ""))
    .filter(Boolean);

  const status: GatewayMerchant["status"] =
    account?.closed || cardPayments === "unsupported"
      ? "disabled"
      : reasons.includes("restricted_other")
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

/**
 * Un **charge**: l'oggetto che porta i rimborsi.
 *
 * Non e ne una sessione ne un intent, e va tradotto a parte. Il riferimento a
 * EasyGame sta nei metadati del charge quando Stripe li propaga dall'intent;
 * quando non ci sono, `external_payment_id` resta l'unico appiglio — ed e
 * sufficiente, perche il registro conserva l'identificativo del pagamento.
 */
const paymentFromCharge = (charge: any): GatewayPayment => ({
  provider: "stripe",
  externalId: String(charge?.payment_intent || charge?.id || ""),
  status: charge?.refunded
    ? "refunded"
    : Number(charge?.amount_refunded || 0) > 0
      ? "partially_refunded"
      : charge?.status === "succeeded"
        ? "succeeded"
        : charge?.status === "failed"
          ? "failed"
          : "pending",
  money: {
    amountCents: Math.round(Number(charge?.amount || 0)),
    currency: "EUR",
  },
  platformFeeCents: Math.round(Number(charge?.application_fee_amount || 0)),
  reference: readReference(charge?.metadata),
  paidAt: charge?.created
    ? new Date(Number(charge.created) * 1000).toISOString()
    : null,
});

/** Traduce l'oggetto di un evento di pagamento, qualunque dei tre sia. */
const paymentFromEventObject = (object: any): GatewayPayment | null => {
  const kind = String(object?.object || "");
  if (kind === "checkout.session") return paymentFromSession(object);
  if (kind === "payment_intent") return paymentFromIntent(object);
  if (kind === "charge") return paymentFromCharge(object);
  return null;
};

/**
 * Il rimborso che un evento porta, se ne porta uno.
 *
 * **Perche l'importo e `amount_refunded` e non `amount`.** Su
 * `charge.refunded` l'oggetto e il *charge*, e il suo `amount` e l'incasso
 * originale: usarlo vorrebbe dire stornare 130 € per un rimborso di 30 €.
 * Sugli eventi `charge.refund.*` l'oggetto e il rimborso, e li `amount` e
 * quello giusto. Sono due forme e vanno distinte.
 */
const refundFromEventObject = (
  object: any,
  eventType: string,
): GatewayRefundEvent | null => {
  const kind = String(object?.object || "");

  if (kind === "refund") {
    return {
      externalRefundId: String(object?.id || ""),
      externalPaymentId: String(object?.payment_intent || object?.charge || ""),
      amountCents: Math.round(Number(object?.amount || 0)),
      currency: "EUR",
      status:
        String(object?.status || "") === "succeeded"
          ? "succeeded"
          : String(object?.status || "") === "failed"
            ? "failed"
            : "pending",
      reference: readReference(object?.metadata),
      createdAt: object?.created
        ? new Date(Number(object.created) * 1000).toISOString()
        : "",
    };
  }

  if (kind === "charge" && eventType === "charge.refunded") {
    const amountRefunded = Math.round(Number(object?.amount_refunded || 0));
    if (amountRefunded <= 0) return null;

    /*
      Il charge non dice quanto e stato rimborsato *da questo evento*, dice
      quanto e stato rimborsato **in tutto**. L'ultimo rimborso dell'elenco e
      quello che ha generato l'evento: si preferisce quello, e si ripiega sul
      totale solo se l'elenco non e arrivato.
    */
    const refunds: any[] = Array.isArray(object?.refunds?.data)
      ? object.refunds.data
      : [];
    const latest = refunds[0] || null;

    return {
      externalRefundId: String(latest?.id || `${object?.id}_refund`),
      externalPaymentId: String(object?.payment_intent || object?.id || ""),
      amountCents: Math.round(Number(latest?.amount || amountRefunded)),
      currency: "EUR",
      status: "succeeded",
      reference: readReference(object?.metadata),
      createdAt: object?.created
        ? new Date(Number(object.created) * 1000).toISOString()
        : "",
    };
  }

  return null;
};

/** Lo stato dell'account connesso, quando l'evento lo riguarda. */
const accountFromEventObject = (object: any): GatewayAccountEvent | null => {
  if (String(object?.object || "") !== "account") return null;

  return {
    externalId: String(object?.id || ""),
    chargesEnabled: Boolean(object?.charges_enabled),
    payoutsEnabled: Boolean(object?.payouts_enabled),
    currentlyDue: (object?.requirements?.currently_due || []).map(String),
    pastDue: (object?.requirements?.past_due || []).map(String),
    pendingVerification: (object?.requirements?.pending_verification || []).map(
      String,
    ),
    disabledReason:
      String(object?.requirements?.disabled_reason || "").trim() || null,
    organizationId:
      String(object?.metadata?.easygame_organization_id || "").trim() || null,
  };
};

/* -------------------------------------------------------- liquidazione */

/**
 * Il `balance_transaction` di un charge, tradotto.
 *
 * **Da dove arrivano i numeri, e perche non da una formula.** `fee_details` e
 * la scomposizione che Stripe fa del costo: una voce `stripe_fee` per la
 * propria commissione, una voce `application_fee` per quella della
 * piattaforma. Si leggono per **tipo** e non per posizione, perche l'elenco
 * puo contenerne altre — imposte su alcuni mercati, costi di rete — e sommare
 * tutto attribuirebbe a Stripe voci che non sono sue.
 *
 * **Perche `net` si prende com'e.** E il numero che il club vedra sul proprio
 * saldo. Ricalcolarlo come «lordo meno le due commissioni» darebbe lo stesso
 * risultato quasi sempre, e nei casi in cui non lo darebbe — proprio le voci
 * che non abbiamo saputo classificare — sarebbe sbagliato in silenzio.
 */
const settlementFromBalanceTransaction = (
  transaction: any,
): GatewaySettlement | null => {
  if (!transaction || typeof transaction !== "object") return null;

  const details: any[] = Array.isArray(transaction?.fee_details)
    ? transaction.fee_details
    : [];

  const sumOf = (type: string) => {
    const rows = details.filter((row) => String(row?.type || "") === type);
    if (!rows.length) return null;
    return rows.reduce(
      (total, row) => total + Math.round(Number(row?.amount || 0)),
      0,
    );
  };

  return {
    currency: "EUR",
    grossAmountCents:
      transaction?.amount === undefined || transaction?.amount === null
        ? null
        : Math.round(Number(transaction.amount)),
    providerFeeCents: sumOf("stripe_fee"),
    platformFeeCents: sumOf("application_fee"),
    netAmountCents:
      transaction?.net === undefined || transaction?.net === null
        ? null
        : Math.round(Number(transaction.net)),
  };
};

/**
 * Il charge di un pagamento, qualunque forma abbia il suo identificativo.
 *
 * EasyGame conserva cio che il provider gli ha restituito: una sessione
 * (`cs_…`) quando l'incasso e nato da un checkout, un intent (`pi_…`) quando
 * e arrivato da un evento sull'intent, un charge (`ch_…`) negli altri casi.
 * Sono tre strade allo stesso oggetto, e il `balance_transaction` sta in fondo
 * a tutte e tre.
 *
 * L'espansione si chiede nella **stessa** richiesta: seguire i riferimenti a
 * mano vorrebbe dire tre chiamate al PSP per un dato accessorio.
 */
const fetchChargeForSettlement = async (input: {
  externalPaymentId: string;
  merchantExternalId: string;
}): Promise<any | null> => {
  const id = String(input.externalPaymentId || "").trim();
  if (!id) return null;

  /* Il charge vive sull'account connesso: e cio che rende l'addebito diretto. */
  const onAccount = { stripeAccount: input.merchantExternalId };

  if (id.startsWith("cs_")) {
    const session = await callStripe(
      `/checkout/sessions/${encodeURIComponent(id)}?expand[]=payment_intent.latest_charge.balance_transaction`,
      onAccount,
    );
    return session?.payment_intent?.latest_charge || null;
  }

  if (id.startsWith("ch_")) {
    return callStripe(
      `/charges/${encodeURIComponent(id)}?expand[]=balance_transaction`,
      onAccount,
    );
  }

  const intent = await callStripe(
    `/payment_intents/${encodeURIComponent(id)}?expand[]=latest_charge.balance_transaction`,
    onAccount,
  );

  return intent?.latest_charge || null;
};

/* ------------------------------------------------------------- adapter */

export const stripeProvider: PaymentGateway = {
  key: "stripe",

  isConfigured: () => Boolean(readStripeSecretKey()),

  createMerchant: async (input) => {
    const account = await callStripeV2("/core/accounts", {
      body: {
        display_name: input.clubName,
        ...(input.email ? { contact_email: input.email } : {}),
        identity: { country: input.country || "IT" },
        dashboard:
          V2_DASHBOARD_BY_ACCOUNT_TYPE[String(input.accountType)] || "full",
        defaults: {
          currency: "eur",
          /*
            Le due responsabilita **non si cambiano dopo la creazione**: qui si
            decide una volta sola chi paga le commissioni Stripe e chi risponde
            di un saldo negativo.

            In EasyGame incassa il **club**, con addebito diretto sul suo
            account. Quindi Stripe trattiene le proprie commissioni dal club
            (`fees_collector: "stripe"`) e resta responsabile dei saldi
            negativi (`losses_collector: "stripe"`): e la coppia equivalente
            all'account Standard della v1, ed e cio che rende vero il modello
            per cui il club — non EasyGame — e l'esercente che risponde di un
            rimborso. La quota di piattaforma resta cosa distinta e viaggia
            come application fee sul singolo incasso.
          */
          responsibilities: {
            fees_collector: "stripe",
            losses_collector: "stripe",
          },
        },
        configuration: {
          merchant: {
            capabilities: { card_payments: { requested: true } },
          },
        },
        /*
          Il club torna indietro nei metadati dell'account: e cosi che un
          evento si ricollega a una societa senza dover interrogare il
          database su un identificativo che il PSP potrebbe aver cambiato.
        */
        metadata: { easygame_organization_id: input.organizationId },
      },
      include: V2_ACCOUNT_INCLUDE,
    });

    return merchantFromV2Account(account);
  },

  createOnboardingLink: async (input) => {
    const link = await callStripeV2("/core/account_links", {
      body: {
        account: input.merchantExternalId,
        use_case: {
          type: "account_onboarding",
          account_onboarding: {
            configurations: ["merchant"],
            return_url: input.returnUrl,
            refresh_url: input.refreshUrl,
            /*
              `eventually_due`: si raccoglie tutto in una volta sola. Un club
              rimandato indietro una seconda volta perche mancava un campo e
              un club che non incassa, e una telefonata in segreteria.
            */
            collection_options: { fields: "eventually_due" },
          },
        },
      },
    });

    return {
      /*
        Sulla v2 le date sono gia stringhe ISO: nessuna conversione da epoch,
        che sulla v1 serviva e qui produrrebbe una data del 1970.
      */
      url: String(link?.url || ""),
      expiresAt: String(link?.expires_at || ""),
    };
  },

  getMerchant: async (merchantExternalId) =>
    merchantFromV2Account(
      await callStripeV2(
        `/core/accounts/${encodeURIComponent(merchantExternalId)}`,
        { include: V2_ACCOUNT_INCLUDE },
      ),
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

  fetchSettlement: async (input) => {
    const charge = await fetchChargeForSettlement(input);

    /*
      `balance_transaction` puo essere ancora un identificativo invece
      dell'oggetto espanso: succede quando la transazione di saldo non e
      ancora maturata. Non e un errore ed e il caso normale nei minuti dopo un
      incasso — si dice «non lo so» e si riproverera piu tardi.
    */
    const transaction = charge?.balance_transaction;
    if (!transaction || typeof transaction === "string") return null;

    return settlementFromBalanceTransaction(transaction);
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
      Solo gli eventi il cui oggetto e conosciuto producono qualcosa. Per tutti
      gli altri l'evento resta, viene registrato e non muove niente: un webhook
      che si rompe su un tipo che non conosce si rompe al primo evento nuovo
      che Stripe introduce.
    */
    return {
      provider: "stripe",
      id: String(parsed?.id || ""),
      type,
      payment: paymentFromEventObject(object),
      refund: refundFromEventObject(object, type),
      account: accountFromEventObject(object),
      /*
        `event.account` c'e solo sugli eventi di Connect, ed e l'account
        connesso che li ha generati. E piu affidabile dei metadati: i metadati
        li puo scrivere chiunque crei un pagamento su quell'account, questo lo
        scrive Stripe.
      */
      accountId: String(parsed?.account || "").trim() || null,
      /*
        `livemode` lo mette Stripe su ogni evento. Si riporta com'e — booleano
        o `null` — senza normalizzarlo a falso: un evento che non dichiara
        l'ambiente non e un evento di sandbox, e un evento non verificabile, e
        chi decide se accettarlo deve poter distinguere i due casi.
      */
      liveMode: typeof parsed?.livemode === "boolean" ? parsed.livemode : null,
      createdAt: parsed?.created
        ? new Date(Number(parsed.created) * 1000).toISOString()
        : "",
      raw: parsed,
    };
  },
};
