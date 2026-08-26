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

/* ------------------------------------------------------- la liquidazione */

/**
 * Quanto **davvero** e costato un incasso, secondo il provider.
 *
 * **Perche non si calcola.** La commissione di EasyGame la decide EasyGame e
 * si congela (ADR-0050); quella del PSP la decide il PSP, cambia per metodo di
 * pagamento, per circuito, per paese della carta, e cambia di listino senza
 * avvisare. Una formula scritta qui sarebbe giusta il giorno in cui viene
 * scritta e sbagliata il giorno dopo, e il numero sbagliato comparirebbe in un
 * rendiconto con l'aria di essere un fatto. Si chiede al provider, oppure si
 * dichiara di non saperlo.
 *
 * **Perche ogni campo puo essere `null`.** Il costo di un incasso non e noto
 * nell'istante in cui l'incasso avviene: su Stripe vive sul
 * `balance_transaction`, che non viaggia nell'evento e che per certi metodi di
 * pagamento matura giorni dopo. `null` significa **non ancora noto**, e non
 * zero: scriverci zero direbbe «gratis», che e un'affermazione diversa.
 */
export type GatewaySettlement = {
  currency: "EUR";
  /** L'incasso lordo secondo il provider. */
  grossAmountCents: number | null;
  /** La commissione del PSP. Mai calcolata da EasyGame. */
  providerFeeCents: number | null;
  /**
   * La commissione della piattaforma **come il provider la riporta**.
   *
   * Serve a riconciliare, non a decidere: quella che vale resta quella
   * congelata sulla riga dell'incasso. Se le due divergono, e un fatto da
   * guardare, non da correggere in automatico.
   */
  platformFeeCents: number | null;
  /** Quanto resta al club, al netto di entrambe le commissioni. */
  netAmountCents: number | null;
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

/**
 * Il **rimborso** che un evento porta con se.
 *
 * E un oggetto a parte e non un pagamento con lo stato «rimborsato»: un
 * rimborso ha un importo proprio, che puo essere una frazione dell'incasso, e
 * deve produrre un **movimento** nel registro invece di modificare quello
 * esistente. Vedi ADR-0050.
 */
export type GatewayRefundEvent = {
  externalRefundId: string;
  /** L'incasso rimborsato, con cui si ritrova la riga del registro. */
  externalPaymentId: string;
  amountCents: number;
  currency: "EUR";
  status: "succeeded" | "pending" | "failed";
  reference: GatewayPaymentReference;
  createdAt: string;
};

/**
 * Lo stato dell'account connesso, come il provider lo racconta.
 *
 * Arriva con gli eventi che riguardano l'account, non con quelli di pagamento:
 * e cio che permette di tenere aggiornato lo stato di un club senza
 * interrogare il PSP a ogni caricamento di pagina.
 */
export type GatewayAccountEvent = {
  externalId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  currentlyDue: string[];
  pastDue: string[];
  pendingVerification: string[];
  disabledReason: string | null;
  /** Il club, quando il provider ce lo rimanda nei metadati. */
  organizationId: string | null;
};

export type GatewayWebhookEvent = {
  provider: PaymentGatewayKey;
  /** L'identificativo dell'evento presso il provider: la chiave di deduplica. */
  id: string;
  type: string;
  /** Il pagamento a cui l'evento si riferisce, se ne ha uno. */
  payment: GatewayPayment | null;
  /** Il rimborso, quando l'evento ne porta uno. */
  refund: GatewayRefundEvent | null;
  /** Lo stato dell'account connesso, quando l'evento lo riguarda. */
  account: GatewayAccountEvent | null;
  /**
   * L'account connesso che ha generato l'evento.
   *
   * Su Stripe e il campo `account` dell'evento, presente solo sugli eventi di
   * Connect. E il modo per sapere **di chi** e l'evento senza fidarsi dei
   * metadati, che potrebbero essere stati scritti da chiunque abbia creato un
   * pagamento su quell'account.
   */
  accountId: string | null;
  /**
   * L'ambiente dichiarato dal provider: vero in produzione, falso in sandbox.
   *
   * `null` quando l'evento non lo dichiara, e la differenza conta: un evento
   * che non dice a quale mondo appartiene non si puo assumere «di prova» solo
   * perche il campo manca. La firma prova **chi** ha parlato, `accountId`
   * prova **per conto di chi**, questo prova **da dove**. Vedi
   * `src/lib/payments/live-mode.ts`.
   */
  liveMode: boolean | null;
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
    /**
     * Il tipo di account presso il provider.
     *
     * **Non ha un valore predefinito qui.** E una scelta irreversibile per
     * account gia creato, e un default nel contratto sarebbe la scelta fatta
     * da chi ha scritto il codice invece che da chi risponde delle
     * conseguenze. Lo passa la configurazione di piattaforma.
     */
    accountType: "standard" | "express";
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
   * Quanto e costato un incasso, chiesto al provider.
   *
   * **Opzionale**, e la ragione e nel dominio e non nel codice: non tutti i
   * PSP espongono la propria commissione per singola transazione, e chi non la
   * espone non deve costringere EasyGame a inventarla. Un adapter che non
   * implementa questo metodo dice «non lo so», e il registro conserva `null`.
   *
   * Restituisce `null` anche quando il provider **non lo sa ancora**: e il
   * caso normale nei minuti successivi a un incasso, e non e un errore.
   */
  fetchSettlement?: (input: {
    externalPaymentId: string;
    merchantExternalId: string;
  }) => Promise<GatewaySettlement | null>;
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
