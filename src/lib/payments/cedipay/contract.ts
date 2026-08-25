/**
 * CediPay: il contratto che EasyGame usa per incassare online.
 *
 * **Cosa e CediPay e cosa non e.** CediPay e il **livello di prodotto**: il
 * nome che una societa legge, le regole che EasyGame applica, la commissione
 * che la piattaforma trattiene. Non e un processore di pagamento e non lo
 * diventera: sotto c'e sempre un PSP — oggi Stripe — e il giorno in cui se ne
 * cambia uno il dominio non deve accorgersene.
 *
 *     EasyGame → CediPay → Payment Provider
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

export const CEDIPAY_PROVIDER_KEYS = [
  "stripe",
  "paypal",
  "postepay",
  "mastercard",
] as const;

export type CediPayProviderKey = (typeof CEDIPAY_PROVIDER_KEYS)[number];

export const isCediPayProviderKey = (
  value: unknown,
): value is CediPayProviderKey =>
  CEDIPAY_PROVIDER_KEYS.includes(String(value || "") as CediPayProviderKey);

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
export type CediPayPlatformFee = {
  percent: number;
  fixedCents: number;
  /** Chi la sostiene. Oggi solo `club`: farla pagare a chi versa cambia l'importo mostrato. */
  paidBy: "club" | "payer";
};

/* ------------------------------------------------------------- importi */

export type CediPayMoney = {
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
export type CediPayMerchant = {
  provider: CediPayProviderKey;
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

export type CediPayOnboardingLink = {
  url: string;
  /** Scade: un link di attivazione riutilizzabile e una credenziale. */
  expiresAt: string;
};

/* ---------------------------------------------------------- il checkout */

export type CediPayCheckoutRequest = {
  merchant: Pick<CediPayMerchant, "externalId">;
  money: CediPayMoney;
  platformFee: CediPayPlatformFee;
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

export type CediPayPaymentStatus =
  | "created"
  | "pending"
  | "succeeded"
  | "failed"
  | "expired"
  | "refunded"
  | "partially_refunded";

export type CediPayCheckout = {
  provider: CediPayProviderKey;
  /** L'identificativo presso il provider. Finisce in `external_reference`. */
  externalId: string;
  /** Dove mandare chi paga. */
  url: string;
  status: CediPayPaymentStatus;
  money: CediPayMoney;
  platformFeeCents: number;
};

export type CediPayPaymentReference = CediPayCheckoutRequest["reference"];

export type CediPayPayment = {
  provider: CediPayProviderKey;
  externalId: string;
  status: CediPayPaymentStatus;
  money: CediPayMoney;
  platformFeeCents: number;
  /** I riferimenti EasyGame rimandati indietro dal provider. */
  reference: CediPayPaymentReference;
  paidAt: string | null;
};

/* ------------------------------------------------------------ rimborsi */

export type CediPayRefundRequest = {
  externalPaymentId: string;
  merchant: Pick<CediPayMerchant, "externalId">;
  /** Assente = rimborso totale. */
  amountCents?: number;
  reason?: string;
  idempotencyKey: string;
};

export type CediPayRefund = {
  provider: CediPayProviderKey;
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

export type CediPayWebhookEvent = {
  provider: CediPayProviderKey;
  /** L'identificativo dell'evento presso il provider: la chiave di deduplica. */
  id: string;
  type: string;
  /** Il pagamento a cui l'evento si riferisce, se ne ha uno. */
  payment: CediPayPayment | null;
  createdAt: string;
  /** Il corpo interpretato, per chi deve guardarci dentro. Mai loggato intero. */
  raw: Record<string, any>;
};

/* -------------------------------------------------------------- errori */

export type CediPayErrorCode =
  | "not_configured"
  | "not_implemented"
  | "invalid_signature"
  | "provider_error"
  | "merchant_not_ready";

export class CediPayError extends Error {
  readonly code: CediPayErrorCode;
  readonly provider: CediPayProviderKey | null;

  constructor(
    code: CediPayErrorCode,
    message: string,
    provider: CediPayProviderKey | null = null,
  ) {
    super(message);
    this.name = "CediPayError";
    this.code = code;
    this.provider = provider;
  }
}

/* ---------------------------------------------------------- l'adapter */

/**
 * Cosa deve saper fare un provider per stare sotto CediPay.
 *
 * Sette operazioni, non una di piu. Se un provider ne offre altre, restano
 * dietro l'adapter; se ne offre meno, l'adapter lancia `not_implemented` e la
 * configurazione lo dichiara — cosi l'interfaccia puo disabilitare cio che
 * quel provider non sa fare, invece di offrirlo e fallire davanti a chi paga.
 */
export type CediPayProvider = {
  key: CediPayProviderKey;
  /** Vero se le credenziali ci sono. Non dice che siano valide. */
  isConfigured: () => boolean;
  createMerchant: (input: {
    organizationId: string;
    clubName: string;
    email: string;
    country: string;
  }) => Promise<CediPayMerchant>;
  createOnboardingLink: (input: {
    merchantExternalId: string;
    returnUrl: string;
    refreshUrl: string;
  }) => Promise<CediPayOnboardingLink>;
  getMerchant: (merchantExternalId: string) => Promise<CediPayMerchant>;
  createCheckout: (request: CediPayCheckoutRequest) => Promise<CediPayCheckout>;
  getPayment: (input: {
    externalId: string;
    merchantExternalId: string;
  }) => Promise<CediPayPayment>;
  refund: (request: CediPayRefundRequest) => Promise<CediPayRefund>;
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
  }) => CediPayWebhookEvent;
};
