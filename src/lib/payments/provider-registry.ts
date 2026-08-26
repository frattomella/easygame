import type {
  PaymentProviderDefinition,
  PaymentProviderKey,
} from "./payment-types";

export const PAYMENT_PROVIDER_ORDER: PaymentProviderKey[] = [
  "stripe",
  "paypal",
  "postepay",
  "mastercard",
];

export const PAYMENT_PROVIDER_REGISTRY: Record<
  PaymentProviderKey,
  PaymentProviderDefinition
> = {
  stripe: {
    key: "stripe",
    label: "Stripe",
    description:
      "Carte, wallet e SEPA. Il denaro entra sul conto della societa; la commissione della piattaforma resta sull'incasso.",
    type: "gateway",
    supportsOnlineCheckout: true,
    supportsPlatformFee: true,
    requiresOnboarding: true,
    isImplemented: true,
  },
  paypal: {
    key: "paypal",
    label: "PayPal",
    description: "Wallet online con account business PayPal.",
    type: "wallet",
    supportsOnlineCheckout: true,
    supportsPlatformFee: true,
    requiresOnboarding: true,
    isImplemented: false,
  },
  postepay: {
    key: "postepay",
    label: "Postepay",
    description: "Metodo carta esposto tramite gateway esterno.",
    type: "card",
    supportsOnlineCheckout: true,
    supportsPlatformFee: false,
    requiresOnboarding: true,
    isImplemented: false,
  },
  mastercard: {
    key: "mastercard",
    label: "Mastercard",
    description: "Circuito carta gestito solo tramite provider PSP.",
    type: "card",
    supportsOnlineCheckout: true,
    supportsPlatformFee: false,
    requiresOnboarding: true,
    isImplemented: false,
  },
};

export const getPaymentProviderDefinition = (
  provider: PaymentProviderKey,
) => PAYMENT_PROVIDER_REGISTRY[provider];
