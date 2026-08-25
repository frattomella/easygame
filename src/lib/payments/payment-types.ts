/**
 * I provider che le impostazioni di un club possono nominare.
 *
 * `stripe` e il primo con un adapter vero sotto CediPay (ADR-0045). Gli
 * altri tre restano perche stanno gia nei dati dei club: dichiarati,
 * configurabili, e senza adapter — il registro di CediPay lo dice
 * esplicitamente invece di lasciarlo scoprire a chi preme «Paga».
 */
export type PaymentProviderKey =
  | "stripe"
  | "paypal"
  | "postepay"
  | "mastercard";

export type PaymentProviderStatus =
  | "not_configured"
  | "configured"
  | "onboarding_required"
  | "active"
  | "disabled"
  | "error";

export type PaymentMode = "test" | "live";

export type ClubPaymentProviderConfig = {
  provider: PaymentProviderKey;
  enabled: boolean;
  displayName: string;
  status: PaymentProviderStatus;
  mode: PaymentMode;
  accountEmail?: string;
  connectedAccountId?: string;
  merchantId?: string;
  publicLabel?: string;
  instructions?: string;
  lastVerifiedAt?: string;
  metadata?: Record<string, unknown>;
};

export type ClubPaymentSettings = {
  enabled: boolean;
  currency: "EUR";
  platformFeePercent: number;
  platformFeeFixedCents?: number;
  platformFeePaidBy: "club" | "payer";
  providers: Record<PaymentProviderKey, ClubPaymentProviderConfig>;
  enabledRegistrationMethods: PaymentProviderKey[];
  manualMethods?: {
    bankTransfer?: boolean;
    cash?: boolean;
    other?: boolean;
  };
  updatedAt: string;
};

export type PaymentProviderDefinition = {
  key: PaymentProviderKey;
  label: string;
  description: string;
  type: "wallet" | "card" | "gateway";
  supportsOnlineCheckout: boolean;
  supportsPlatformFee: boolean;
  requiresOnboarding: boolean;
  isImplemented: boolean;
};

export type ClubSubscriptionPlan = "free" | "plus";

export type ClubSubscriptionStatus =
  | "not_active"
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled"
  | "expired";

export type ClubSubscriptionSettings = {
  plan: ClubSubscriptionPlan;
  status: ClubSubscriptionStatus;
  billingCycle?: "monthly" | "annual";
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  renewalDate?: string;
  provider?: "stripe" | "paypal" | "manual";
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  includedServices?: string[];
  updatedAt: string;
};

export type HubExtraServiceKey =
  | "advanced_reports"
  | "sms_notifications"
  | "ai_documents"
  | "premium_support"
  | "extra_storage"
  | "public_booking_portal";

export type HubExtraBillingStatus =
  | "not_active"
  | "active"
  | "trialing"
  | "cancelled";

export type HubExtraService = {
  key: HubExtraServiceKey;
  name: string;
  description: string;
  enabled: boolean;
  billingStatus: HubExtraBillingStatus;
  priceCents?: number;
  billingCycle?: "monthly" | "annual" | "one_time";
  providerSubscriptionItemId?: string;
  activatedAt?: string;
};

export type RegistrationPaymentMethodAvailability = {
  key: PaymentProviderKey;
  label: string;
  provider: PaymentProviderKey;
  status: PaymentProviderStatus;
  isImplemented: boolean;
  checkoutReady: boolean;
};
