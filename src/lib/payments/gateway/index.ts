/**
 * Il registro dei gateway di incasso: quale provider risponde, e se e davvero pronto.
 *
 * **Il problema che risolve.** Un'interfaccia che offre «Paga online» e un
 * server che risponde «non implementato» non e una funzione a meta: e una
 * promessa rotta davanti a chi sta pagando. Qui si stabilisce, in un posto
 * solo, la differenza fra quattro cose che finora si confondevano:
 *
 *   1. *il provider esiste* — c'e un adapter che implementa il contratto;
 *   2. *e configurato* — le credenziali della piattaforma ci sono;
 *   3. *il club ha un negozio* — esiste un account connesso;
 *   4. *il negozio incassa* — il provider dice che puo, adesso.
 *
 * Solo quando valgono tutte e quattro il pulsante si accende. Ognuna che
 * manca ha un messaggio proprio, perche sono quattro problemi diversi e li
 * risolvono persone diverse: chi scrive il codice, chi configura la
 * piattaforma, la segreteria del club, il PSP.
 */

import {
  PaymentGatewayError,
  isPaymentGatewayKey,
  type PaymentGateway,
  type PaymentGatewayKey,
} from "./contract";
import { stripeProvider } from "./providers/stripe";

export * from "./contract";

/** Cosa EasyGame sa dire di un gateway, prima ancora di parlargli. */
export type PaymentGatewayDescriptor = {
  key: PaymentGatewayKey;
  /** Il nome che compare nell'interfaccia. */
  label: string;
  /** Una riga: cosa e, per chi non lo conosce. */
  description: string;
  /** Vero se esiste un adapter. Falso = dichiarato ma non scritto. */
  hasAdapter: boolean;
  /** Vero se l'adapter sa trattenere la commissione della piattaforma. */
  supportsPlatformFee: boolean;
  /** Vero se il club deve attivare un proprio account presso il provider. */
  requiresMerchantOnboarding: boolean;
};

export const PAYMENT_GATEWAYS: Record<
  PaymentGatewayKey,
  PaymentGatewayDescriptor
> = {
  stripe: {
    key: "stripe",
    label: "Stripe",
    description:
      "Carte, wallet e SEPA. Il denaro entra sul conto della societa; la commissione della piattaforma viene trattenuta sull'incasso.",
    hasAdapter: true,
    supportsPlatformFee: true,
    requiresMerchantOnboarding: true,
  },
  paypal: {
    key: "paypal",
    label: "PayPal",
    description: "Wallet online con account business PayPal.",
    hasAdapter: false,
    supportsPlatformFee: true,
    requiresMerchantOnboarding: true,
  },
  postepay: {
    key: "postepay",
    label: "Postepay",
    description: "Metodo carta esposto tramite un gateway esterno.",
    hasAdapter: false,
    supportsPlatformFee: false,
    requiresMerchantOnboarding: true,
  },
  mastercard: {
    key: "mastercard",
    label: "Mastercard",
    description: "Circuito carta: si raggiunge sempre attraverso un PSP.",
    hasAdapter: false,
    supportsPlatformFee: false,
    requiresMerchantOnboarding: true,
  },
};

const ADAPTERS: Partial<Record<PaymentGatewayKey, PaymentGateway>> = {
  stripe: stripeProvider,
};

/** L'adapter di un provider, oppure `null` se non e stato scritto. */
export const getPaymentGateway = (
  key: unknown,
): PaymentGateway | null =>
  isPaymentGatewayKey(key) ? ADAPTERS[key] || null : null;

/** L'adapter, o l'errore che spiega quale dei quattro gradini manca. */
export const requirePaymentGateway = (key: unknown): PaymentGateway => {
  if (!isPaymentGatewayKey(key)) {
    throw new PaymentGatewayError(
      "not_implemented",
      "Provider di pagamento non riconosciuto",
    );
  }

  const provider = ADAPTERS[key];
  if (!provider) {
    throw new PaymentGatewayError(
      "not_implemented",
      `${PAYMENT_GATEWAYS[key].label} non e ancora collegato`,
      key,
    );
  }

  if (!provider.isConfigured()) {
    throw new PaymentGatewayError(
      "not_configured",
      `${PAYMENT_GATEWAYS[key].label} non e configurato su questo ambiente`,
      key,
    );
  }

  return provider;
};

/* ------------------------------------------------- lo stato di un club */

export type GatewayReadiness = {
  provider: PaymentGatewayKey;
  /** Vero solo se tutti e quattro i gradini sono saliti. */
  canCheckout: boolean;
  /** Il primo gradino che manca. `null` quando non ne manca nessuno. */
  blocker:
    | "no_adapter"
    | "not_configured"
    | "no_merchant"
    | "merchant_not_ready"
    | "disabled_by_club"
    | null;
  /** Cosa leggere nell'interfaccia. Una frase, gia in italiano. */
  message: string;
};

/**
 * Se un club puo davvero incassare online adesso.
 *
 * **Perche non interroga il provider.** Chiedere al PSP a ogni caricamento di
 * pagina sarebbe una chiamata di rete su un percorso di lettura, e una pagina
 * che non si apre perche il PSP e lento. Lo stato dell'account connesso viene
 * aggiornato quando lo si attiva e quando arriva un evento che lo riguarda:
 * qui si legge quello.
 */
export const describeGatewayReadiness = (input: {
  provider: unknown;
  enabledByClub: boolean;
  merchantExternalId?: string | null;
  merchantChargesEnabled?: boolean;
}): GatewayReadiness => {
  const key = isPaymentGatewayKey(input.provider) ? input.provider : "stripe";
  const descriptor = PAYMENT_GATEWAYS[key];
  const adapter = ADAPTERS[key];

  const blocked = (
    blocker: NonNullable<GatewayReadiness["blocker"]>,
    message: string,
  ): GatewayReadiness => ({
    provider: key,
    canCheckout: false,
    blocker,
    message,
  });

  if (!adapter) {
    return blocked(
      "no_adapter",
      `${descriptor.label} non e ancora collegato.`,
    );
  }

  if (!adapter.isConfigured()) {
    return blocked(
      "not_configured",
      "I pagamenti online non sono configurati su questo ambiente.",
    );
  }

  if (!input.enabledByClub) {
    return blocked(
      "disabled_by_club",
      "I pagamenti online sono disattivati nelle impostazioni della societa.",
    );
  }

  if (!String(input.merchantExternalId || "").trim()) {
    return blocked(
      "no_merchant",
      "La societa non ha ancora attivato il proprio conto di incasso.",
    );
  }

  if (!input.merchantChargesEnabled) {
    return blocked(
      "merchant_not_ready",
      "Il conto di incasso della societa e in verifica: non puo ancora ricevere pagamenti.",
    );
  }

  return {
    provider: key,
    canCheckout: true,
    blocker: null,
    message: "I pagamenti online sono attivi.",
  };
};
