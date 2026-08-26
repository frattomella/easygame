/**
 * Il contratto che EasyGame usa per incassare online.
 *
 * **Cosa e questo livello e cosa non e.** E il confine fra il dominio di
 * EasyGame e il PSP: le regole che EasyGame applica, la commissione che la
 * piattaforma trattiene, la forma di un incasso. Non e un processore di
 * pagamento e non lo diventera — sotto c'e sempre un PSP, oggi Stripe, e il
 * giorno in cui se ne cambia uno il dominio non deve accorgersene.
 *
 *     EasyGame → gateway → PSP (Stripe)
 *
 * **Non esiste un prodotto chiamato CediPay nella V1**
 * ([ADR-0049](../../../../docs/knowledge-base/18-decision-log.md)). Cio che
 * una societa legge e il nome del PSP: «Stripe · Carta». Un marchio
 * intermedio avrebbe dovuto rispondere a domande — chi incassa, chi e
 * responsabile del rimborso, chi compare sull'estratto conto — a cui la V1
 * risponde «il club, tramite Stripe».
 *
 * **Perche il nome del provider non compare nel dominio.** Se `stripe`
 * comparisse dentro le rate, le ricevute o le impostazioni del club,
 * sostituirlo vorrebbe dire riscrivere quei tre domini. Qui il provider e un
 * valore di configurazione piu un adapter che implementa questa interfaccia:
 * il resto di EasyGame conosce «un incasso online», il suo stato e il suo
 * riferimento esterno.
 *
 * **Perche tutto passa da centesimi interi.** Un importo in virgola mobile
 * moltiplicato per una percentuale produce differenze di un centesimo, e un
 * centesimo fra quel che il club vede e quel che il PSP versa e una
 * telefonata. Gli importi entrano ed escono da qui come interi.
 *
 * Modulo **puro**: tipi ed errori. Nessuna rete, nessun database, nessuna
 * variabile d'ambiente letta qui dentro.
 */

/* ------------------------------------------------------------- provider */

export const PAYMENT_GATEWAY_KEYS = [
  "stripe",
  "paypal",
  "postepay",
  "mastercard",
] as const;

export type PaymentGatewayKey = (typeof PAYMENT_GATEWAY_KEYS)[number];

export const isPaymentGatewayKey = (
  value: unknown,
): value is PaymentGatewayKey =>
  PAYMENT_GATEWAY_KEYS.includes(String(value || "") as PaymentGatewayKey);

/* --------------------------------------------------------- commissione */

/**
 * La commissione della piattaforma su un incasso.
 *
 * **Non e una costante e non deve diventarlo.** Percentuale e quota fissa
 * sono configurazione — per prodotto, per piano, per singolo cliente — perche
 * cambiano per contratto commerciale e non per rilascio del software. Il
 * calcolo sta in `platform-fees.ts` ed e gia condiviso; qui si dichiara solo
 * come viaggia dentro una richiesta.
 */
export type GatewayPlatformFee = {
  percent: number;
  fixedCents: number;
  /** Chi la sostiene. Oggi solo `club`: farla pagare a chi versa cambia l'importo mostrato. */
  paidBy: "club" | "payer";
};

/* ------------------------------------------------------------- importi */

export type GatewayMoney = {
  /** Sempre un intero. Vedi la nota sui centesimi in testa al file. */
  amountCents: number;
  currency: "EUR";
};

/* ---------------------------------------------------------- il negozio */

/**
 * L'account del club presso il provider.
 *
 * `externalId` e l'unico dato del provider che EasyGame conserva: non
 * conserva credenziali del club, non conserva dati di verifica, non conserva
 * IBAN. A custodirli e il PSP, ed e una delle ragioni per cui si usa un PSP.
 */
export type GatewayMerchant = {
  provider: PaymentGatewayKey;
  externalId: string;
  /** `pending` finche il provider non dichiara l'account operativo. */
  status: "pending" | "restricted" | "active" | "rejected" | "disabled";
  /** Vero quando l'account puo davvero incassare adesso. */
  chargesEnabled: boolean;
  /** Vero quando il provider puo davvero versare al club. */
  payoutsEnabled: boolean;
  /** Cosa manca perche diventi operativo, in parole del provider. */
  pendingRequirements: string[];
};

export type GatewayOnboardingLink = {
  url: string;
  /** Scade: un link di attivazione riutilizzabile e una credenziale. */
  expiresAt: string;
};

/* ---------------------------------------------------------- il checkout */

export type GatewayCheckoutRequest = {
  merchant: Pick<GatewayMerchant, "externalId">;
  money: GatewayMoney;
  platformFee: GatewayPlatformFee;
  /** Cosa sta pagando la famiglia. Compare sulla pagina del PSP. */
  description: string;
  /**
   * Il riferimento **di EasyGame**: la rata che questo incasso paghera.
   *
   * Viaggia nei metadati e torna indietro nel webhook. E il solo modo per
   * riconoscere un incasso senza fidarsi di cio che il browser dice al
   * ritorno dal checkout: il browser puo non tornare affatto.
   */
  reference: {
    organizationId: string;
    paymentId: string | null;
    athleteId: string | null;
  };
  payer?: {
    email?: string;
    name?: string;
  };
  successUrl: string;
  cancelUrl: string;
  /**
   * Chiave di idempotenza: due invii dello stesso pulsante non devono
   * produrre due checkout.
   */
  idempotencyKey: string;
};

export type GatewayPaymentStatus =
  | "created"
  | "pending"
  | "succeeded"
  | "failed"
  | "expired"
  | "refunded"
  | "partially_refunded";

export type GatewayCheckout = {
  provider: PaymentGatewayKey;
  /** L'identificativo presso il provider. Finisce in `external_reference`. */
  externalId: string;
  /** Dove mandare chi paga. */
  url: string;
  status: GatewayPaymentStatus;
  money: GatewayMoney;
  platformFeeCents: number;
};

export type GatewayPaymentReference = GatewayCheckoutRequest["reference"];

export type GatewayPayment = {
  provider: PaymentGatewayKey;
  externalId: string;
  status: GatewayPaymentStatus;
  money: GatewayMoney;
  platformFeeCents: number;
  /** I riferimenti EasyGame rimandati indietro dal provider. */
  reference: GatewayPaymentReference;
  paidAt: string | null;
};

/* ------------------------------------------------------------ rimborsi */

export type GatewayRefundRequest = {
  externalPaymentId: string;
  merchant: Pick<GatewayMerchant, "externalId">;
  /** Assente = rimborso totale. */
  amountCents?: number;
  reason?: string;
  idempotencyKey: string;
};

export type GatewayRefund = {
  provider: PaymentGatewayKey;
  externalId: string;
  amountCents: number;
  status: "pending" | "succeeded" | "failed";
  /**
   * Vero se e stata restituita anche la commissione della piattaforma.
   *
   * Non e un dettaglio: se non la si chiede indietro, la commissione resta
   * alla piattaforma e a rimetterla e **il club**, che ha rimborsato tutto.
   */
  platformFeeRefunded: boolean;
};

/* ------------------------------------------------------------- webhook */

export type GatewayWebhookEvent = {
  provider: PaymentGatewayKey;
  /** L'identificativo dell'evento presso il provider: la chiave di deduplica. */
  id: string;
  type: string;
  /** Il pagamento a cui l'evento si riferisce, se ne ha uno. */
  payment: GatewayPayment | null;
  createdAt: string;
  /** Il corpo interpretato, per chi deve guardarci dentro. Mai loggato intero. */
  raw: Record<string, any>;
};

/* -------------------------------------------------------------- errori */

export type PaymentGatewayErrorCode =
  | "not_configured"
  | "not_implemented"
  | "invalid_signature"
  | "provider_error"
  | "merchant_not_ready";

export class PaymentGatewayError extends Error {
  readonly code: PaymentGatewayErrorCode;
  readonly provider: PaymentGatewayKey | null;

  constructor(
    code: PaymentGatewayErrorCode,
    message: string,
    provider: PaymentGatewayKey | null = null,
  ) {
    super(message);
    this.name = "PaymentGatewayError";
    this.code = code;
    this.provider = provider;
  }
}

/* ---------------------------------------------------------- l'adapter */

/**
 * Cosa deve saper fare un provider per stare sotto il gateway.
 *
 * Sette operazioni, non una di piu. Se un provider ne offre altre, restano
 * dietro l'adapter; se ne offre meno, l'adapter lancia `not_implemented` e la
 * configurazione lo dichiara — cosi l'interfaccia puo disabilitare cio che
 * quel provider non sa fare, invece di offrirlo e fallire davanti a chi paga.
 */
export type PaymentGateway = {
  key: PaymentGatewayKey;
  /** Vero se le credenziali ci sono. Non dice che siano valide. */
  isConfigured: () => boolean;
  createMerchant: (input: {
    organizationId: string;
    clubName: string;
    email: string;
    country: string;
  }) => Promise<GatewayMerchant>;
  createOnboardingLink: (input: {
    merchantExternalId: string;
    returnUrl: string;
    refreshUrl: string;
  }) => Promise<GatewayOnboardingLink>;
  getMerchant: (merchantExternalId: string) => Promise<GatewayMerchant>;
  createCheckout: (request: GatewayCheckoutRequest) => Promise<GatewayCheckout>;
  getPayment: (input: {
    externalId: string;
    merchantExternalId: string;
  }) => Promise<GatewayPayment>;
  refund: (request: GatewayRefundRequest) => Promise<GatewayRefund>;
  /**
   * Verifica la firma e restituisce l'evento.
   *
   * Riceve il **corpo grezzo**, non un oggetto gia interpretato: la firma
   * copre i byte esatti, e qualunque riscrittura — spazi, ordine delle
   * chiavi, ricodifica — la invalida.
   */
  parseWebhook: (input: {
    rawBody: string;
    signature: string;
    secret: string;
    now?: Date;
  }) => GatewayWebhookEvent;
};
