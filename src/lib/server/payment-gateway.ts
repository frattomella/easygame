/**
 * Il gateway di incasso lato server: chi apre un checkout e chi crede a un
 * webhook.
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
 *
 * **Cosa e cambiato nel Blocco D.** Tre cose, e sono le tre che rendevano
 * fragile il resto:
 *
 * 1. **l'account su cui incassare non arriva piu dalle impostazioni del
 *    club.** Arriva da `club_payment_accounts`, che scrivono solo la console
 *    di piattaforma e gli eventi firmati (ADR-0051);
 * 2. **la commissione non arriva piu dalle impostazioni del club.** Arriva
 *    dalle condizioni commerciali della piattaforma, e viene **congelata**
 *    sulla riga dell'incasso (ADR-0050);
 * 3. **i rimborsi e lo stato dell'account producono qualcosa.** Prima
 *    arrivavano e non muovevano niente.
 */

import { prisma } from "./prisma";
import {
  createPaymentTransaction,
  findTransactionByExternalPaymentId,
  recordRefundTransaction,
} from "./payment-transactions";
import {
  applyProviderAccountSnapshot,
  findOrganizationByExternalAccount,
  getClubPaymentAccount,
  resolveCheckoutReadiness,
} from "./connect-accounts";
import { resolveCommissionForClub } from "./platform-settings";
import { checkWebhookEnvironment } from "./payment-environment";
import {
  PaymentGatewayError,
  requirePaymentGateway,
  type GatewayCheckout,
  type GatewayWebhookEvent,
  type PaymentGatewayKey,
} from "@/lib/payments/gateway";
import {
  freezeSettlement,
  reverseSettlement,
  type FrozenSettlement,
} from "@/lib/payments/commission";
import { normalizePaymentSettings } from "@/lib/payments/payment-config-utils";
import type { CheckoutReadiness } from "@/lib/payments/connect-account";
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
  readiness: CheckoutReadiness;
};

/**
 * Il gateway che questo club usa, e se puo davvero incassare adesso.
 *
 * **Cosa arriva da dove, adesso.** L'account e lo stato arrivano dalla tabella
 * degli account connessi; l'unica cosa che ancora arriva dalle impostazioni
 * del club e `enabled` — la preferenza operativa di spegnere gli incassi
 * online, che e legittimo che una segreteria governi da sola.
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

  const { account, readiness } = await resolveCheckoutReadiness({
    organizationId: id,
    clubEnabled: settings.enabled,
  });

  return {
    organizationId: id,
    provider: account.provider,
    settings,
    merchantExternalId: account.externalAccountId || "",
    readiness,
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
 * Apre un checkout per una rata, anche per un **importo parziale**.
 *
 * L'importo arriva da chi paga: e il residuo per impostazione predefinita, ma
 * una famiglia che vuole versare 50 dei 130 dovuti deve poterlo fare online
 * esattamente come lo farebbe allo sportello. Il registro incassi sa gia
 * gestire una rata pagata in piu volte (ADR-0036): non c'e nessuna ragione per
 * cui il canale online debba essere piu rigido di quello manuale.
 *
 * **La chiave di idempotenza non e casuale, ed e apposta.** Se lo fosse, due
 * clic su «Paga» aprirebbero due checkout — e due addebiti a una famiglia.
 * Derivarla dal club, dalla rata e dall'importo fa si che lo stesso pulsante
 * premuto due volte chieda al provider **lo stesso** checkout; premuto con un
 * importo diverso, ne chiede uno diverso, che e cio che serve a chi versa un
 * secondo acconto.
 */
export const openGatewayCheckout = async (
  input: OpenCheckoutInput,
): Promise<{
  checkout: GatewayCheckout;
  context: ClubGatewayContext;
  settlement: FrozenSettlement;
}> => {
  const context = await resolveClubGatewayContext(input.organizationId);

  if (!context.readiness.canCheckout) {
    throw new PaymentGatewayError(
      context.readiness.blocker === "provider_not_configured"
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

  /*
    La commissione si risolve **adesso** dalle condizioni della piattaforma, e
    non dalle impostazioni del club. Il valore che si manda al PSP e lo stesso
    che verra congelato sull'incasso quando l'evento tornera indietro: se i due
    divergessero, il club vedrebbe un numero e ne riceverebbe un altro.
  */
  const commission = await resolveCommissionForClub({
    organizationId: context.organizationId,
  });

  const settlement = freezeSettlement({
    grossAmountCents: amountCents,
    commission,
  });

  const provider = requirePaymentGateway(context.provider);

  const checkout = await provider.createCheckout({
    merchant: { externalId: context.merchantExternalId },
    money: { amountCents, currency: "EUR" },
    platformFee: {
      percent: commission.percent,
      fixedCents: commission.fixedCents,
      paidBy: "club",
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

  return { checkout, context, settlement };
};

/* -------------------------------------------------------- la liquidazione */

/**
 * Quanto e costato un incasso, chiesto al provider, **senza far fallire
 * l'incasso se non risponde**.
 *
 * **Perche non si propaga l'errore.** Questo dato e accessorio: serve a un
 * rendiconto, non a stabilire che il denaro sia arrivato. Se la chiamata
 * fallisce — rete, credenziali ruotate, provider lento — e l'eccezione
 * risalisse, il webhook risponderebbe 500, Stripe riproverebbe, e un incasso
 * gia avvenuto resterebbe non registrato per un motivo che non lo riguarda. Si
 * conserva `null`, che nel registro significa **non ancora noto**.
 *
 * **Perche non c'e un secondo tentativo qui dentro.** Il caso normale in cui
 * il dato manca non e un guasto: la transazione di saldo di Stripe matura
 * dopo, a volte giorni dopo per i metodi differiti. Riprovare adesso non la
 * farebbe comparire; a riprendere il dato dovra essere una lettura successiva,
 * non questa.
 */
const fetchProviderSettlement = async (input: {
  provider: PaymentGatewayKey;
  externalPaymentId: string;
  merchantExternalId: string | null;
}) => {
  if (!input.externalPaymentId || !input.merchantExternalId) return null;

  try {
    const provider = requirePaymentGateway(input.provider);
    if (!provider.fetchSettlement) return null;

    return await provider.fetchSettlement({
      externalPaymentId: input.externalPaymentId,
      merchantExternalId: input.merchantExternalId,
    });
  } catch (error: any) {
    /* Il messaggio, mai la richiesta: contiene importo e account connesso. */
    console.warn("[payments/webhook] costo dell'incasso non disponibile", {
      provider: input.provider,
      message: String(error?.message || error),
    });
    return null;
  }
};

/* ------------------------------------------------------------- i webhook */

const webhookClient = () => (prisma as any).paymentWebhookEvent;

export type WebhookOutcome = {
  /** Vero se questo evento era gia stato ricevuto: non si rifa niente. */
  duplicate: boolean;
  status: "processed" | "ignored" | "failed";
  /** L'incasso registrato o stornato, se l'evento ne ha prodotto uno. */
  transactionId: string | null;
  message: string;
};

/**
 * Il club a cui appartiene un evento.
 *
 * **L'account connesso vince sui metadati.** I metadati di un pagamento li puo
 * scrivere chiunque sappia creare un pagamento sull'account connesso di un
 * club; `event.account` lo scrive Stripe. Quando i due non coincidono l'evento
 * **non** viene assecondato: in condizioni normali coincidono sempre, e proprio
 * per questo una divergenza e un fatto da fermare, non da interpretare.
 */
const resolveEventOrganization = async (
  event: GatewayWebhookEvent,
): Promise<{
  organizationId: string | null;
  mismatch: boolean;
  unknownAccount: boolean;
}> => {
  const fromMetadata =
    asText(event.payment?.reference.organizationId) ||
    asText(event.refund?.reference.organizationId) ||
    asText(event.account?.organizationId) ||
    null;

  const accountId = asText(event.accountId) || asText(event.account?.externalId);
  const fromAccount = accountId
    ? await findOrganizationByExternalAccount(accountId)
    : null;

  if (fromAccount && fromMetadata && fromAccount !== fromMetadata) {
    return { organizationId: null, mismatch: true, unknownAccount: false };
  }

  /*
    L'evento dichiara un account connesso che EasyGame non conosce. Ripiegare
    sui metadati sarebbe il buco piu grande di tutti: chiunque possa far
    generare un evento su un proprio account Connect potrebbe metterci dentro
    l'identificativo di una rata altrui e vedersela registrata. Un account che
    non risulta collegato a nessuna societa non muove denaro, e lo dice.
  */
  if (accountId && !fromAccount) {
    return { organizationId: null, mismatch: false, unknownAccount: true };
  }

  return {
    organizationId: fromAccount || fromMetadata,
    mismatch: false,
    unknownAccount: false,
  };
};

/**
 * Traduce un evento verificato in cio che EasyGame deve fare.
 *
 * **Cosa produce un incasso e cosa no.** Solo un pagamento **riuscito** con un
 * riferimento a una rata di EasyGame. Un pagamento in corso, autorizzato,
 * scaduto o fallito viene registrato come ricevuto e non muove denaro: una
 * sessione «completa» con SEPA significa che il modulo e stato compilato, non
 * che il denaro sia arrivato.
 *
 * **Cosa succede a un evento che non ci riguarda.** Viene marcato `ignored`.
 * Puo capitare — un pagamento nato fuori da EasyGame sull'account del club — e
 * non e un errore: EasyGame non e il registro di cassa di Stripe.
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
    L'ambiente si controlla **prima di tutto il resto**, deduplica compresa.
    La firma prova che l'evento viene da Stripe; non prova che venga dallo
    Stripe di *questo* mondo. Un endpoint di staging puo ricevere un evento
    live — endpoint registrato sull'account sbagliato, segreto copiato da un
    ambiente all'altro, rinvio manuale dalla dashboard di produzione — e lo
    troverebbe perfettamente firmato: registrarlo vorrebbe dire far comparire
    denaro vero nel registro incassi di un database di prova.

    Prima della deduplica perche una riga scritta qui renderebbe l'evento un
    duplicato quando arrivasse, con lo stesso identificativo, all'ambiente a
    cui appartiene davvero.
  */
  const environment = checkWebhookEnvironment(event.liveMode);

  if (!environment.accepted) {
    console.warn("[payments/webhook] evento di un altro ambiente", {
      provider: event.provider,
      eventId,
      expected: environment.expected,
      received: environment.eventEnvironment,
    });

    return {
      duplicate: false,
      status: "ignored",
      transactionId: null,
      message: environment.reason,
    };
  }

  const { organizationId, mismatch, unknownAccount } =
    await resolveEventOrganization(event);

  /*
    La riga si inserisce **prima** di agire, e il vincolo di unicita e cio che
    rende la deduplica affidabile: se due consegne dello stesso evento arrivano
    insieme, una delle due fallisce l'inserimento e si ferma. Un controllo
    «esiste gia?» seguito da una scrittura avrebbe una finestra in mezzo, e la
    finestra e proprio il caso che si vuole escludere.
  */
  try {
    await webhookClient().create({
      data: {
        provider: event.provider,
        event_id: eventId,
        event_type: event.type,
        flow: "connect",
        organization_id: organizationId,
        external_account_id: asText(event.accountId) || null,
        external_reference:
          event.payment?.externalId || event.refund?.externalRefundId || null,
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

  const markFailed = async (error: any) => {
    await webhookClient().updateMany({
      where: { provider: event.provider, event_id: eventId },
      data: {
        status: "failed",
        error: String(error?.message || "").slice(0, 500),
      },
    });
  };

  if (mismatch) {
    return markIgnored(
      "L'evento cita un club diverso da quello a cui appartiene l'account connesso: non viene elaborato",
    );
  }

  if (unknownAccount) {
    return markIgnored(
      "L'evento arriva da un account connesso che non risulta collegato a nessuna societa: non viene elaborato",
    );
  }

  try {
    /* --------------------------------------------- lo stato dell'account */
    if (event.account) {
      if (!organizationId) {
        return markIgnored(
          "Evento su un account connesso che non appartiene a nessuna societa di EasyGame",
        );
      }

      await applyProviderAccountSnapshot({
        organizationId,
        snapshot: {
          externalId: event.account.externalId,
          chargesEnabled: event.account.chargesEnabled,
          payoutsEnabled: event.account.payoutsEnabled,
          currentlyDue: event.account.currentlyDue,
          pastDue: event.account.pastDue,
          pendingVerification: event.account.pendingVerification,
          disabledReason: event.account.disabledReason,
        },
      });

      return {
        duplicate: false,
        status: "processed",
        transactionId: null,
        message: "Stato dell'account di incasso aggiornato",
      };
    }

    /* ------------------------------------------------------- il rimborso */
    if (event.refund) {
      if (!organizationId) {
        return markIgnored("Rimborso senza una societa riconoscibile");
      }

      if (event.refund.status !== "succeeded") {
        return markIgnored(
          `Rimborso in stato «${event.refund.status}»: nessun movimento registrato`,
        );
      }

      const original = await findTransactionByExternalPaymentId({
        organizationId,
        externalPaymentId: event.refund.externalPaymentId,
      });

      if (!original) {
        return markIgnored(
          "Rimborso di un incasso che non risulta nel registro di questa societa",
        );
      }

      /*
        La commissione restituita e **proporzionale a quella trattenuta**, non
        ricalcolata sulla condizione di oggi: il denaro da restituire e quello
        che era stato trattenuto allora. Vedi `reverseSettlement`.
      */
      const settlement = reverseSettlement({
        original: {
          grossAmountCents:
            Number(original.gross_amount_cents) ||
            Math.round(Number(original.amount) * 100),
          platformFeeCents: Number(original.platform_fee_cents) || 0,
          providerFeeCents:
            original.provider_fee_cents === null ? null : Number(original.provider_fee_cents),
          appliedFeePercent: Number(original.applied_fee_percent) || 0,
          appliedFeeFixedCents: Number(original.applied_fee_fixed_cents) || 0,
          commissionRuleId: original.commission_rule_id || null,
        },
        refundedAmountCents: event.refund.amountCents,
      });

      const result = await recordRefundTransaction({
        transactionId: String(original.id),
        amountCents: event.refund.amountCents,
        externalRefundId: event.refund.externalRefundId,
        externalEventId: eventId,
        paidAt: event.refund.createdAt || new Date().toISOString(),
        reason: "Rimborso confermato dal provider",
        settlement,
        confirmedByProvider: true,
      });

      return {
        duplicate: result.duplicate,
        status: "processed",
        transactionId: result.transaction.id,
        message: result.duplicate
          ? "Rimborso gia registrato"
          : "Rimborso registrato",
      };
    }

    /* ------------------------------------------------------- il pagamento */
    const payment = event.payment;

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

    /*
      **Lo stesso incasso, chiamato in due modi.**

      La deduplica degli eventi, poco sopra, copre la riconsegna dello *stesso*
      evento. Non copre il caso che si verifica a ogni pagamento riuscito: un
      solo incasso genera **due eventi diversi** — `checkout.session.completed`
      e `payment_intent.succeeded` — che descrivono lo stesso denaro con due
      identificativi diversi. Registrarli entrambi accredita il doppio a una
      famiglia che ha pagato una volta, e lo fa in silenzio: entrambi gli
      eventi sono legittimi, firmati e attesi.

      L'incasso si riconosce quindi dal **denaro**, non dall'evento: si
      cercano nel registro tutti i nomi che il provider da a questo pagamento.
      E lo stesso principio che `recordRefundTransaction` applica gia ai
      rimborsi, dove il problema si era presentato fra `charge.refunded` e
      `charge.refund.updated`.
    */
    const nomiDelDenaro = Array.from(
      new Set(
        [payment.externalId, ...(payment.relatedExternalIds || [])]
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    );

    for (const externalPaymentId of nomiDelDenaro) {
      const gia = await findTransactionByExternalPaymentId({
        organizationId,
        externalPaymentId,
      });

      if (gia) {
        return {
          duplicate: true,
          status: "processed",
          transactionId: String(gia.id),
          message: "Incasso gia registrato da un altro evento dello stesso pagamento",
        };
      }
    }

    const account = await getClubPaymentAccount(organizationId);

    /*
      La commissione si congela **alla data dell'incasso**, non a quella in cui
      l'evento viene elaborato: con i metodi differiti le due possono distare
      giorni, e nel mezzo la condizione commerciale puo essere cambiata.
    */
    const commission = await resolveCommissionForClub({
      organizationId,
      at: payment.paidAt || new Date(),
    });

    const settlement = freezeSettlement({
      grossAmountCents: payment.money.amountCents,
      commission,
      /*
        La commissione del PSP si **chiede al PSP**. Non si calcola: cambia per
        metodo di pagamento, circuito e paese della carta, e cambia di listino
        senza avvisare. Quando non e ancora nota resta `null`, che vuol dire
        «non lo so» e non «zero». Vedi `fetchProviderSettlement`.
      */
      providerFeeCents: (
        await fetchProviderSettlement({
          provider: account.provider,
          externalPaymentId: payment.externalId,
          merchantExternalId: account.externalAccountId,
        })
      )?.providerFeeCents,
    });

    const result = await createPaymentTransaction(
      {
        organizationId,
        athleteId: payment.reference.athleteId,
        paymentId: payment.reference.paymentId,
        amount: payment.money.amountCents / 100,
        paidAt: payment.paidAt || new Date().toISOString(),
        paymentMethod: "online",
        source: "STRIPE",
        externalReference: payment.externalId,
        externalAccountId: account.externalAccountId,
        externalPaymentId: payment.externalId,
        externalEventId: eventId,
        settlement,
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
      },
      {
        userId: "",
        activeOrganizationId: organizationId,
        allowedOrganizationIds: [organizationId],
      },
    );

    return {
      duplicate: false,
      status: "processed",
      transactionId: result.transaction.id,
      message: "Incasso registrato",
    };
  } catch (error: any) {
    await markFailed(error);
    throw error;
  }
};
