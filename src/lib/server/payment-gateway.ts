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
import { reportServerError } from "./observability";
import {
  createPaymentTransaction,
  findTransactionByExternalPaymentId,
  getChargeById,
  getPaymentTransactionById,
  getSettledAmountForCharge,
  listPaymentTransactions,
  listTransactionsByExternalPaymentId,
  markRefundRequested,
  recordRefundTransaction,
  type PaymentTransactionScope,
} from "./payment-transactions";
import {
  applyProviderAccountSnapshot,
  findOrganizationByExternalAccount,
  getClubPaymentAccount,
  resolveCheckoutReadiness,
} from "./connect-accounts";
import { resolveCommissionForClub } from "./platform-settings";
import { checkWebhookEnvironment } from "./payment-environment";
import { AUDIT_ACTIONS, recordAuditEvent } from "./audit";
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
import {
  buildRefundIdempotencyKey,
  describeRefundAvailability,
  isRefundReason,
  type RefundAvailability,
} from "@/lib/payments/refunds";
import {
  normalizePaymentTransaction,
  type NormalizedPaymentTransaction,
} from "@/lib/payments/installment-ledger";
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
/**
 * La **chiave di idempotenza** di un checkout.
 *
 * **A cosa serve.** A impedire che un doppio clic, o un tentativo ripetuto
 * dopo un timeout di rete, apra due sessioni di pagamento sulla stessa rata:
 * due sessioni sono due addebiti a una famiglia.
 *
 * **Perche c'e dentro l'importo gia incassato.** Perche senza, la chiave non
 * conteneva **nulla che cambiasse fra un pagamento e il successivo**. Una
 * famiglia che versa 50 € su una rata da 130 € e poi ne versa altri 50
 * riceveva la stessa sessione — quella gia pagata — e leggeva «hai completato
 * il pagamento» davanti a un residuo di 80 €. Trovato nel collaudo sandbox del
 * Blocco E.
 *
 * L'importo gia incassato e la cosa giusta da mettere: **non cambia** fra due
 * clic dello stesso tentativo, e li la sessione va riusata; **cambia** dopo
 * ogni incasso andato a buon fine, che e esattamente quando ne serve una
 * nuova. Un orologio avrebbe rotto l'idempotenza anche quando serviva.
 *
 * Funzione **pura**: si prova senza rete e senza database.
 */
export const buildCheckoutIdempotencyKey = (input: {
  organizationId: string;
  paymentId?: string | null;
  amountCents: number;
  settledCents: number;
}): string =>
  [
    "checkout",
    String(input.organizationId || "").trim(),
    String(input.paymentId || "").trim() || "acconto",
    Math.round(Number(input.amountCents) || 0),
    Math.round(Number(input.settledCents) || 0),
  ].join(":");

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

  /*
    Quanto e gia stato incassato su questa rata: entra nella chiave di
    idempotenza qui sotto. Su un acconto senza rata non c'e nulla da contare.
  */
  const giaIncassatoCents = asText(input.paymentId)
    ? Math.round(
        (await getSettledAmountForCharge({
          paymentId: String(input.paymentId),
          organizationId: context.organizationId,
        })) * 100,
      )
    : 0;

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
    idempotencyKey: buildCheckoutIdempotencyKey({
      organizationId: context.organizationId,
      paymentId: input.paymentId,
      amountCents,
      settledCents: giaIncassatoCents,
    }),
  });

  return { checkout, context, settlement };
};

/**
 * Recupera la **commissione del PSP** sugli incassi che non ce l'hanno ancora.
 *
 * **Perche serve una seconda occasione.** La commissione di Stripe non vive
 * nell'evento: vive sul `balance_transaction`, che matura **dopo**. Il webhook
 * arriva entro frazioni di secondo dal pagamento e la trova quasi sempre non
 * ancora pronta — nel collaudo del Blocco E era `null` su **tutti** gli
 * incassi. Il campo era progettato per essere riempito «piu tardi», ma quel
 * piu tardi non esisteva: nessuno tornava a chiedere.
 *
 * Senza, `net_amount_cents` resta il lordo meno la sola quota di piattaforma —
 * cioe **sovrastima il netto del club** di tutta la commissione Stripe, e lo fa
 * in un rendiconto che ha l'aria di essere un fatto.
 *
 * **Perche qui e non su una lettura.** Perche sarebbe una chiamata di rete per
 * riga a ogni apertura di una lista, che e la cosa che
 * `syncClubPaymentAccount` esiste per non fare. Questa gira a orario, sui soli
 * incassi che hanno ancora qualcosa da sapere.
 *
 * **Perche non fallisce mai.** Un incasso e gia avvenuto e gia registrato: se
 * il PSP non risponde, il dato resta `null` e si riprovera al giro dopo. Far
 * fallire la manutenzione per un costo accessorio sarebbe sproporzionato.
 */
export const backfillProviderFees = async (input?: {
  limit?: number;
}): Promise<{ esaminati: number; aggiornati: number }> => {
  const limit = Math.max(
    1,
    Math.min(200, Math.round(Number(input?.limit) || 50)),
  );

  const pendenti = await (prisma as any).paymentTransaction.findMany({
    where: {
      provider_fee_cents: null,
      external_payment_id: { not: null },
      external_account_id: { not: null },
      amount: { gt: 0 },
    },
    orderBy: { created_at: "desc" },
    take: limit,
    select: {
      id: true,
      external_payment_id: true,
      external_account_id: true,
      gross_amount_cents: true,
      platform_fee_cents: true,
      organization_id: true,
    },
  });

  let aggiornati = 0;

  for (const riga of pendenti) {
    const account = await getClubPaymentAccount(String(riga.organization_id));

    const liquidazione = await fetchProviderSettlement({
      provider: account.provider,
      externalPaymentId: String(riga.external_payment_id),
      merchantExternalId: String(riga.external_account_id),
    });

    const providerFeeCents = liquidazione?.providerFeeCents;
    if (providerFeeCents === null || providerFeeCents === undefined) continue;

    /*
      Il netto si **ricalcola**, non si copia da quello del provider: il netto
      di Stripe e riferito al suo account connesso, mentre qui interessa cosa
      resta al club dopo entrambe le trattenute.
    */
    const lordo = Math.round(Number(riga.gross_amount_cents) || 0);
    const quotaPiattaforma = Math.round(Number(riga.platform_fee_cents) || 0);

    await (prisma as any).paymentTransaction.update({
      where: { id: riga.id },
      data: {
        provider_fee_cents: providerFeeCents,
        net_amount_cents: Math.max(
          0,
          lordo - quotaPiattaforma - providerFeeCents,
        ),
      },
    });

    aggiornati += 1;
  }

  return { esaminati: pendenti.length, aggiornati };
};

/* ------------------------------------------------------------- i rimborsi */

export type RequestRefundInput = {
  /** L'incasso da rimborsare. **Uno**, non una rata. */
  transactionId: string;
  /** Assente o `null` = tutto il rimborsabile. In centesimi. */
  amountCents?: number | null;
  /** Uno dei motivi che il provider riconosce. Facoltativo. */
  reason?: unknown;
  /** Le note della segreteria. Restano in EasyGame: al provider non vanno. */
  notes?: unknown;
  /** Chi ha premuto. Finisce nell'annotazione, non nella richiesta al PSP. */
  actorUserId?: string | null;
};

export type RefundOutcome = {
  /** Lo stato **dichiarato dal provider**, non quello del registro. */
  status: "pending" | "succeeded" | "failed";
  externalRefundId: string;
  amountCents: number;
  /** Vero finche il movimento non e comparso nel registro. */
  awaitingWebhook: boolean;
  /** L'incasso originale, riletto: porta l'annotazione della richiesta. */
  transaction: NormalizedPaymentTransaction;
  /** La rata, com'e adesso. Immutata finche il webhook non registra il movimento. */
  charge: Record<string, any> | null;
  /** Il registro della rata, per aggiornare la schermata senza rileggerla tutta. */
  transactions: NormalizedPaymentTransaction[];
  /** Il rimborsabile **prima** di questa richiesta. */
  availability: RefundAvailability;
  message: string;
};

/**
 * Avvia un rimborso **da EasyGame**, sull'account connesso del club giusto.
 *
 * **Il buco che questa funzione chiude.** Il contratto del gateway aveva
 * `refund` dal Blocco D e il registro sapeva registrare un rimborso arrivato
 * per webhook; ma nessuna superficie di EasyGame lo avviava. Il club doveva
 * entrare nel cruscotto Stripe — che con dashboard *full* ha — trovare il
 * pagamento e rimborsarlo li. Funzionava, e chiedeva a una segreteria sportiva
 * di saper usare un cruscotto di pagamenti per fare una cosa che EasyGame le
 * mostra gia in scheda.
 *
 * **La risposta del provider non e il registro, e questo e il punto.** Un
 * rimborso puo nascere `pending` e restarci; puo anche fallire. Quel che questa
 * funzione scrive e un'**annotazione** sull'incasso — «ne ho chiesto uno, si
 * chiama `re_…`, vale tanto» — che serve a dire «in elaborazione» e a impedire
 * che ne parta un secondo. Il movimento nel registro lo scrive
 * `handleGatewayWebhookEvent`, dall'evento firmato, come per gli incassi. Se i
 * due arrivano nell'ordine inverso — webhook prima della nostra risposta — non
 * cambia niente: l'annotazione si spegne da sola confrontandosi con il
 * registro.
 *
 * **Cosa NON fa, di proposito.** Non distribuisce un rimborso su piu incassi.
 * Una rata da 130 € pagata con 50 e 80 sono due addebiti Stripe distinti; il
 * rimborso ne cita **uno**, ed e l'unico modo perche il registro di EasyGame e
 * il cruscotto del provider raccontino la stessa cosa.
 */
export const requestGatewayRefund = async (
  input: RequestRefundInput,
  scope?: PaymentTransactionScope,
): Promise<RefundOutcome> => {
  /* Il confine di sicurezza e qui: uno scope che non copre il club solleva. */
  const row = await getPaymentTransactionById(input.transactionId, scope);
  const original = normalizePaymentTransaction(
    row,
  ) as NormalizedPaymentTransaction;

  const organizationId = asText(original.organizationId);
  if (!organizationId) {
    throw new Error("Accesso negato: incasso senza club");
  }

  const externalPaymentId = asText(original.externalPaymentId);

  /*
    I movimenti dello stesso pagamento presso il provider: l'incasso, i suoi
    rimborsi, il suo eventuale storno. E l'insieme su cui si decide, e si
    prende per pagamento del PSP e non per rata — una rata puo avere piu
    incassi, e il rimborsabile dell'uno non e quello dell'altro.
  */
  const transactions = externalPaymentId
    ? await listTransactionsByExternalPaymentId({
        organizationId,
        externalPaymentId,
      })
    : [original];

  const availability = describeRefundAvailability({
    transaction: original,
    transactions,
  });

  if (!availability.refundable) {
    throw new Error(availability.message);
  }

  const amountCents =
    input.amountCents === undefined || input.amountCents === null
      ? availability.refundableCents
      : Math.round(Number(input.amountCents) || 0);

  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error("L'importo del rimborso deve essere maggiore di zero");
  }

  if (amountCents > availability.refundableCents) {
    throw new Error(
      "Il rimborso supera quanto resta rimborsabile su questo incasso",
    );
  }

  /*
    L'account su cui rimborsare e quello del club, letto dalla tabella degli
    account connessi — **non** quello scritto sulla riga dell'incasso, che
    arriva da un evento e per questo non e un lasciapassare. Quando i due non
    coincidono ci si ferma: rimborsare sull'account sbagliato vorrebbe dire
    prendere denaro dal conto di una societa per restituirlo a una famiglia che
    ha pagato a un'altra.
  */
  const account = await getClubPaymentAccount(organizationId);
  const merchantExternalId = asText(account.externalAccountId);

  if (!merchantExternalId) {
    throw new PaymentGatewayError(
      "merchant_not_ready",
      "La societa non ha un conto di incasso collegato: il rimborso non si puo avviare",
      account.provider,
    );
  }

  const suRigaIncasso = asText((row as any)?.external_account_id);

  if (suRigaIncasso && suRigaIncasso !== merchantExternalId) {
    throw new Error(
      "Accesso negato: l'incasso appartiene a un conto diverso da quello collegato alla societa",
    );
  }

  const provider = requirePaymentGateway(account.provider);

  const reason = isRefundReason(input.reason)
    ? String(input.reason).trim()
    : undefined;

  let refund;
  try {
    refund = await provider.refund({
      externalPaymentId,
      merchant: { externalId: merchantExternalId },
      amountCents,
      reason,
      /*
        Deterministica: due clic dello stesso tentativo chiedono **lo stesso**
        rimborso, e Stripe restituisce quello gia creato invece di crearne un
        secondo. Il gia rimborsato la fa cambiare dopo ogni rimborso riuscito,
        che e quando un rimborso nuovo serve davvero. Vedi ADR-0063.
      */
      idempotencyKey: buildRefundIdempotencyKey({
        organizationId,
        externalPaymentId,
        amountCents,
        refundedCents: availability.refundedCents,
      }),
    });
  } catch (error: any) {
    /* Il messaggio del provider si riporta; la richiesta no. */
    reportServerError(error, {
      metadata: {
        provider: account.provider,
        esito: "[payments/refund] il provider ha rifiutato il rimborso",
      },
    });
    throw error;
  }

  const externalRefundId = asText(refund.externalId);
  if (!externalRefundId) {
    /*
      **Un identificativo non si inventa** — stessa regola del webhook. Senza,
      l'annotazione non si potrebbe mai spegnere e il rimborso resterebbe «in
      elaborazione» per sempre.
    */
    throw new PaymentGatewayError(
      "provider_error",
      "Il provider non ha restituito un identificativo per il rimborso",
      account.provider,
    );
  }

  const annotato = await markRefundRequested(
    {
      transactionId: original.id,
      externalRefundId,
      amountCents: refund.amountCents || amountCents,
      reason,
      notes: input.notes,
      requestedBy: input.actorUserId || scope?.userId || null,
    },
    scope,
  );

  /*
    Il registro si rilegge **adesso**: se il webhook e gia arrivato — con carta
    succede, i due viaggi si incrociano — il movimento c'e gia e non c'e niente
    da attendere.
  */
  const dopo = await listTransactionsByExternalPaymentId({
    organizationId,
    externalPaymentId,
  });

  const registrato = dopo.some(
    (entry) => asText(entry.externalReference) === externalRefundId,
  );

  const paymentId = asText(original.installmentId);

  return {
    status: refund.status,
    externalRefundId,
    amountCents: refund.amountCents || amountCents,
    awaitingWebhook: !registrato,
    transaction: annotato,
    charge: paymentId ? await getChargeById(paymentId, scope) : null,
    /*
      Il registro **della rata**, non quello del solo pagamento: la schermata
      mostra tutti gli incassi della rata, e restituirne un sottoinsieme le
      farebbe perdere gli altri.
    */
    transactions: paymentId
      ? await listPaymentTransactions({ organizationId, paymentId }, scope)
      : dopo,
    availability,
    message: registrato
      ? "Rimborso registrato"
      : "Rimborso in elaborazione: il movimento comparira quando il provider lo conferma",
  };
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
    reportServerError(error, {
      metadata: {
        provider: input.provider,
        esito: "[payments/webhook] costo dell'incasso non disponibile",
      },
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

  const accountId =
    asText(event.accountId) || asText(event.account?.externalId);
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
    /* eslint-disable-next-line no-console -- un evento del PSP di un altro ambiente: si scarta e si dice quale */
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

    /*
      **Un tentativo fallito non e un evento gia elaborato.**

      La riga si inserisce prima di agire, ed e giusto: e il vincolo di unicita
      a rendere affidabile la deduplica fra due consegne simultanee. Ma se
      qualcosa falliva **dopo** l'inserimento — un singhiozzo di rete verso il
      database, il timeout della funzione mentre si interroga il provider, un
      rifiuto di dominio — `markFailed` lasciava la riga al suo posto e la
      rotta rispondeva 500. Alla riconsegna dello stesso `evt_` l'inserimento
      falliva di nuovo, e questo ramo rispondeva **«gia ricevuto», con 200**:
      il provider smetteva di ritentare.

      Il risultato e il caso peggiore che questo dominio conosca. Il denaro e
      sul conto del club e in EasyGame non esiste **nessuna** riga: la rata
      resta scoperta, il sollecito riparte, e la famiglia viene invitata a
      pagare una seconda volta. Un incasso perso in silenzio e peggio di uno
      contato due volte, perche nessuno lo va a cercare — e niente rilegge le
      righe `failed`.

      Il tentativo fallito si riprende quindi, e lo si riprende **in modo
      atomico**: `updateMany` filtrato su `failed` e una sola riga aggiornata
      designano un vincitore unico anche se le riconsegne sono simultanee. Chi
      non vince risponde «gia ricevuto», che per lui e vero.

      Riprendere non puo far contare due volte: se il tentativo precedente
      avesse gia scritto il movimento, la deduplica economica su
      `(organization_id, external_payment_id)` lo riconosce e restituisce
      l'incasso esistente invece di crearne un altro.
    */
    const ripreso = await webhookClient().updateMany({
      where: { provider: event.provider, event_id: eventId, status: "failed" },
      data: { status: "processed", error: null },
    });

    if (ripreso.count !== 1) {
      return {
        duplicate: true,
        status: "processed",
        transactionId: null,
        message: "Evento gia ricevuto: nessuna operazione ripetuta",
      };
    }
  }

  const markIgnored = async (message: string): Promise<WebhookOutcome> => {
    await webhookClient().updateMany({
      where: { provider: event.provider, event_id: eventId },
      data: { status: "ignored" },
    });
    return {
      duplicate: false,
      status: "ignored",
      transactionId: null,
      message,
    };
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
        /*
          Un rimborso **fallito** e il fatto che si va a cercare quando una
          famiglia chiama dicendo che i soldi non sono tornati. Non muove
          denaro e non deve, ma sparire in silenzio nel registro degli eventi
          lascerebbe la segreteria senza niente da leggere. L'attore non c'e:
          questo lo racconta il provider, non una persona.
        */
        if (event.refund.status === "failed") {
          await recordAuditEvent({
            action: AUDIT_ACTIONS.paymentRefundFailed,
            organizationId,
            resource: "payment_transactions",
            resourceId: event.refund.externalPaymentId,
            metadata: {
              externalRefundId: event.refund.externalRefundId,
              amountCents: event.refund.amountCents,
              eventId,
            },
          });
        }

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
            original.provider_fee_cents === null
              ? null
              : Number(original.provider_fee_cents),
          appliedFeePercent: Number(original.applied_fee_percent) || 0,
          appliedFeeFixedCents: Number(original.applied_fee_fixed_cents) || 0,
          commissionRuleId: original.commission_rule_id || null,
        },
        refundedAmountCents: event.refund.amountCents,
      });

      let result;

      try {
        result = await recordRefundTransaction({
          transactionId: String(original.id),
          amountCents: event.refund.amountCents,
          externalRefundId: event.refund.externalRefundId,
          externalEventId: eventId,
          paidAt: event.refund.createdAt || new Date().toISOString(),
          reason: "Rimborso confermato dal provider",
          settlement,
          confirmedByProvider: true,
        });
      } catch (error: any) {
        /*
          Come per gli incassi (ADR-0062): il controllo applicativo di
          `recordRefundTransaction` e una lettura seguita da una scrittura, e
          i due eventi di un rimborso arrivano insieme — sette millisecondi di
          distanza nel collaudo. La corsa la arbitra l'indice unico parziale
          `payment_transactions_storno_unico`.
        */
        const violaStornoUnico =
          error?.code === "P2002" ||
          String(error?.message || "").includes(
            "payment_transactions_storno_unico",
          );

        if (!violaStornoUnico) throw error;

        return {
          duplicate: true,
          status: "processed",
          transactionId: null,
          message: "Rimborso gia registrato da un altro evento",
        };
      }

      /*
        La **conferma** e un fatto diverso dalla richiesta, e va tracciata a
        parte: fra le due passa il viaggio, e quando qualcosa si perde per
        strada e la coppia mancante a dirlo. Un duplicato non si traccia — il
        fatto e gia stato registrato una volta e due righe direbbero due
        rimborsi.
      */
      if (!result.duplicate) {
        await recordAuditEvent({
          action: AUDIT_ACTIONS.paymentRefundCompleted,
          organizationId,
          resource: "payment_transactions",
          resourceId: String(original.id),
          metadata: {
            refundTransactionId: result.transaction.id,
            externalRefundId: event.refund.externalRefundId,
            amountCents: event.refund.amountCents,
            paymentId: result.transaction.installmentId,
            eventId,
          },
        });
      }

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
          message:
            "Incasso gia registrato da un altro evento dello stesso pagamento",
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

    let result;

    try {
      result = await createPaymentTransaction(
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
            **La causale resta nulla, e si dichiara perche.**

            L'evento del provider non porta una classificazione, e nessuno dei
            dati che porta ne e una fonte affidabile: la rata non ha una
            causale propria, e dedurla dal fatto che l'incasso e online
            direbbe qualcosa sul *canale*, non sull'operazione. Il §5.2 del
            piano della Wave 4 chiede l'opposto di inventarla: cio che nessuno
            ha dichiarato deve **vedersi** come non dichiarato, e a valle il
            documento risultera NON CLASSIFICATO finche una persona non
            sceglie.

            Il giorno in cui il checkout portera con se la causale — e sarebbe
            la fonte giusta, perche la sceglie chi prepara la richiesta di
            pagamento — questa riga la legge da `payment.reference`.
          */
          operationTypeCode: null,
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
    } catch (error: any) {
      /*
        **La corsa fra i due eventi, arbitrata dal database.**

        Il controllo poco sopra e una lettura seguita da una scrittura: due
        invocazioni concorrenti leggono entrambe «non c'e» prima che una delle
        due scriva. Non e un caso di laboratorio — nel collaudo del Blocco E i
        due eventi dello stesso pagamento sono arrivati a **109 millisecondi**
        di distanza, e il doppio accredito si e verificato a ogni pagamento.

        L'indice unico parziale `payment_transactions_incasso_unico` chiude la
        finestra dove la concorrenza si arbitra davvero. Qui il suo rifiuto si
        traduce in cio che significa: quel denaro e gia stato incassato, e
        l'evento e un duplicato economico — non un errore.

        Il controllo applicativo resta perche risponde nel caso normale, la
        riconsegna a distanza di secondi, senza far arrivare fin qui una
        eccezione di vincolo.
      */
      const violaIncassoUnico =
        error?.code === "P2002" ||
        String(error?.message || "").includes(
          "payment_transactions_incasso_unico",
        );

      if (!violaIncassoUnico) throw error;

      const gia = await findTransactionByExternalPaymentId({
        organizationId,
        externalPaymentId: payment.externalId,
      });

      return {
        duplicate: true,
        status: "processed",
        transactionId: gia ? String(gia.id) : null,
        message:
          "Incasso gia registrato da un altro evento dello stesso pagamento",
      };
    }

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
