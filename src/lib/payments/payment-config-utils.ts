import type {
  ClubPaymentProviderConfig,
  ClubPaymentSettings,
  ClubSubscriptionSettings,
  HubExtraService,
  HubExtraServiceKey,
  PaymentMode,
  PaymentProviderKey,
  PaymentProviderStatus,
  RegistrationPaymentMethodAvailability,
} from "./payment-types";
import {
  PAYMENT_PROVIDER_ORDER,
  PAYMENT_PROVIDER_REGISTRY,
} from "./provider-registry";
import {
  DEFAULT_PLATFORM_FEE_PERCENT,
  readPlatformFeePercent,
} from "./platform-fees";

const PROVIDER_STATUSES: PaymentProviderStatus[] = [
  "not_configured",
  "configured",
  "onboarding_required",
  "active",
  "disabled",
  "error",
];

const PAYMENT_MODES: PaymentMode[] = ["test", "live"];

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }

  return "";
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const readDefaultPaymentMode = (): PaymentMode => {
  const raw = String(process.env.PAYMENT_MODE || "").trim().toLowerCase();
  return raw === "live" ? "live" : "test";
};

export const paymentStatusLabel = (status: PaymentProviderStatus) => {
  const labels: Record<PaymentProviderStatus, string> = {
    not_configured: "Non configurato",
    configured: "Configurato",
    onboarding_required: "Richiede onboarding",
    active: "Attivo",
    disabled: "Disabilitato",
    error: "Errore",
  };

  return labels[status] || "Non configurato";
};

export const subscriptionStatusLabel = (
  status: ClubSubscriptionSettings["status"],
) => {
  const labels: Record<ClubSubscriptionSettings["status"], string> = {
    not_active: "Non attivo",
    trialing: "In prova",
    active: "Attivo",
    past_due: "Scaduto",
    cancelled: "Annullato",
    expired: "Scaduto",
  };

  return labels[status] || "Non attivo";
};

export const normalizePaymentProviderKey = (
  value: unknown,
): PaymentProviderKey | null => {
  const key = String(value || "").trim().toLowerCase();
  return PAYMENT_PROVIDER_ORDER.includes(key as PaymentProviderKey)
    ? (key as PaymentProviderKey)
    : null;
};

export const createDefaultProviderConfig = (
  provider: PaymentProviderKey,
  now = new Date().toISOString(),
): ClubPaymentProviderConfig => {
  const definition = PAYMENT_PROVIDER_REGISTRY[provider];
  return {
    provider,
    enabled: false,
    displayName: definition.label,
    status: "not_configured",
    mode: readDefaultPaymentMode(),
    publicLabel: definition.label,
    updatedAt: now,
  } as ClubPaymentProviderConfig;
};

export const normalizeProviderConfig = (
  provider: PaymentProviderKey,
  value: unknown,
): ClubPaymentProviderConfig => {
  const record = asRecord(value);
  const status = PROVIDER_STATUSES.includes(record.status)
    ? record.status
    : record.enabled
      ? "onboarding_required"
      : "not_configured";
  const mode = PAYMENT_MODES.includes(record.mode) ? record.mode : readDefaultPaymentMode();
  const fallback = createDefaultProviderConfig(provider);

  return {
    ...fallback,
    ...record,
    provider,
    enabled: Boolean(record.enabled),
    displayName:
      firstText(record.displayName, record.display_name, fallback.displayName) ||
      fallback.displayName,
    status,
    mode,
    accountEmail: firstText(record.accountEmail, record.account_email) || undefined,
    connectedAccountId:
      firstText(record.connectedAccountId, record.connected_account_id) ||
      undefined,
    merchantId: firstText(record.merchantId, record.merchant_id) || undefined,
    publicLabel:
      firstText(record.publicLabel, record.public_label, fallback.publicLabel) ||
      fallback.publicLabel,
    instructions: firstText(record.instructions) || undefined,
    lastVerifiedAt:
      firstText(record.lastVerifiedAt, record.last_verified_at) || undefined,
    metadata: asRecord(record.metadata),
  };
};

export const createDefaultPaymentSettings = (
  value: Partial<ClubPaymentSettings> = {},
): ClubPaymentSettings => {
  const now = new Date().toISOString();
  return {
    enabled: Boolean(value.enabled ?? false),
    currency: "EUR",
    platformFeePercent:
      value.platformFeePercent ?? readPlatformFeePercent(process.env.PLATFORM_FEE_PERCENT),
    platformFeeFixedCents: Math.max(0, Number(value.platformFeeFixedCents || 0)),
    platformFeePaidBy: value.platformFeePaidBy || "club",
    providers: {
      stripe: createDefaultProviderConfig("stripe", now),
      paypal: createDefaultProviderConfig("paypal", now),
      postepay: createDefaultProviderConfig("postepay", now),
      mastercard: createDefaultProviderConfig("mastercard", now),
    },
    enabledRegistrationMethods: [],
    manualMethods: {
      bankTransfer: true,
      cash: true,
      other: false,
    },
    updatedAt: value.updatedAt || now,
  };
};

export const normalizePaymentSettings = (
  value: unknown,
): ClubPaymentSettings => {
  const record = asRecord(value);
  const defaults = createDefaultPaymentSettings({
    enabled: record.enabled,
    platformFeePercent:
      Number.isFinite(Number(record.platformFeePercent))
        ? Number(record.platformFeePercent)
        : DEFAULT_PLATFORM_FEE_PERCENT,
    platformFeeFixedCents: record.platformFeeFixedCents,
    platformFeePaidBy: record.platformFeePaidBy,
    updatedAt: firstText(record.updatedAt, record.updated_at),
  });
  const providersRecord = asRecord(record.providers);
  const enabledRegistrationMethods = Array.isArray(record.enabledRegistrationMethods)
    ? record.enabledRegistrationMethods
        .map(normalizePaymentProviderKey)
        .filter(Boolean)
    : [];

  return {
    ...defaults,
    enabled: Boolean(record.enabled ?? defaults.enabled),
    platformFeePercent: Math.max(0, Number(defaults.platformFeePercent || 0)),
    platformFeeFixedCents: Math.max(0, Number(defaults.platformFeeFixedCents || 0)),
    platformFeePaidBy: record.platformFeePaidBy === "payer" ? "payer" : "club",
    providers: {
      stripe: normalizeProviderConfig("stripe", providersRecord.stripe),
      paypal: normalizeProviderConfig("paypal", providersRecord.paypal),
      postepay: normalizeProviderConfig("postepay", providersRecord.postepay),
      mastercard: normalizeProviderConfig("mastercard", providersRecord.mastercard),
    },
    enabledRegistrationMethods:
      enabledRegistrationMethods as PaymentProviderKey[],
    manualMethods: {
      bankTransfer: Boolean(record.manualMethods?.bankTransfer ?? true),
      cash: Boolean(record.manualMethods?.cash ?? true),
      other: Boolean(record.manualMethods?.other ?? false),
    },
    updatedAt: firstText(record.updatedAt, record.updated_at) || defaults.updatedAt,
  };
};

export const sanitizePaymentSettingsForStorage = (
  value: ClubPaymentSettings,
): ClubPaymentSettings => {
  const settings = normalizePaymentSettings(value);
  const enabledRegistrationMethods = settings.enabledRegistrationMethods.filter(
    (provider) => isProviderConfigUsableForRegistration(settings.providers[provider]),
  );

  return {
    ...settings,
    enabledRegistrationMethods,
    updatedAt: new Date().toISOString(),
  };
};

export const isProviderConfigUsableForRegistration = (
  provider?: ClubPaymentProviderConfig,
) =>
  Boolean(
    provider?.enabled &&
      (provider.status === "configured" || provider.status === "active"),
  );

export const getAvailableRegistrationPaymentMethods = (
  settings: ClubPaymentSettings,
): RegistrationPaymentMethodAvailability[] =>
  PAYMENT_PROVIDER_ORDER.flatMap((provider) => {
    const providerConfig = settings.providers[provider];
    const definition = PAYMENT_PROVIDER_REGISTRY[provider];
    if (
      !settings.enabled ||
      !settings.enabledRegistrationMethods.includes(provider) ||
      !isProviderConfigUsableForRegistration(providerConfig)
    ) {
      return [];
    }

    return [
      {
        key: provider,
        label: providerConfig.publicLabel || definition.label,
        provider,
        status: providerConfig.status,
        isImplemented: definition.isImplemented,
        checkoutReady: definition.isImplemented,
      },
    ];
  });

export const validatePaymentSettingsForSave = (
  value: ClubPaymentSettings,
): string | null => {
  const settings = normalizePaymentSettings(value);
  for (const provider of PAYMENT_PROVIDER_ORDER) {
    const config = settings.providers[provider];
    const isMarkedReady =
      config.enabled &&
      (config.status === "configured" || config.status === "active");

    if (!isMarkedReady) {
      continue;
    }

    if (provider === "paypal" && !firstText(config.accountEmail, config.merchantId, config.connectedAccountId)) {
      return "Per segnare PayPal come configurato inserisci email business, merchant id o account id.";
    }

    if (
      (provider === "postepay" || provider === "mastercard") &&
      !firstText(config.connectedAccountId, config.merchantId, config.publicLabel)
    ) {
      return `Per segnare ${PAYMENT_PROVIDER_REGISTRY[provider].label} come configurato inserisci etichetta pubblica o account gateway.`;
    }
  }

  return null;
};

export const createDefaultSubscriptionSettings = (): ClubSubscriptionSettings => ({
  plan: "plus",
  status: "not_active",
  billingCycle: "monthly",
  provider: "manual",
  includedServices: [
    "Gestione tesserati",
    "Modulistica online",
    "Movimenti avanzati",
    "Magazzino abbigliamento",
    "Prenotazioni strutture",
  ],
  updatedAt: new Date().toISOString(),
});

export const normalizeSubscriptionSettings = (
  value: unknown,
): ClubSubscriptionSettings => {
  const record = asRecord(value);
  const defaults = createDefaultSubscriptionSettings();
  const status = [
    "not_active",
    "trialing",
    "active",
    "past_due",
    "cancelled",
    "expired",
  ].includes(record.status)
    ? record.status
    : defaults.status;

  return {
    ...defaults,
    ...record,
    plan: record.plan === "free" ? "free" : "plus",
    status,
    includedServices: Array.isArray(record.includedServices)
      ? record.includedServices.map((item: unknown) => String(item))
      : defaults.includedServices,
    updatedAt: firstText(record.updatedAt, record.updated_at) || defaults.updatedAt,
  };
};

export const HUB_EXTRA_SERVICE_DEFINITIONS: Array<
  Omit<HubExtraService, "enabled" | "billingStatus">
> = [
  {
    key: "advanced_reports",
    name: "Report avanzati",
    description: "Analisi estese per andamento economico e sportivo.",
    priceCents: 900,
    billingCycle: "monthly",
  },
  {
    key: "sms_notifications",
    name: "Notifiche SMS",
    description: "Canale SMS predisposto per comunicazioni operative.",
    priceCents: 1200,
    billingCycle: "monthly",
  },
  {
    key: "ai_documents",
    name: "Modulistica AI",
    description: "Generazione assistita di documenti e moduli.",
    priceCents: 1500,
    billingCycle: "monthly",
  },
  {
    key: "premium_support",
    name: "Supporto premium",
    description: "Percorso prioritario per richieste del club.",
    priceCents: 2500,
    billingCycle: "monthly",
  },
  {
    key: "extra_storage",
    name: "Spazio extra",
    description: "Archivio aggiuntivo per documenti e allegati.",
    priceCents: 700,
    billingCycle: "monthly",
  },
  {
    key: "public_booking_portal",
    name: "Portale prenotazioni pubblico",
    description: "Predisposizione portale pubblico per strutture.",
    priceCents: 1900,
    billingCycle: "monthly",
  },
];

export const normalizeExtraServices = (value: unknown): HubExtraService[] => {
  const records = Array.isArray(value) ? value : [];
  const byKey = new Map(
    records
      .map((item) => asRecord(item))
      .filter((item) => item.key)
      .map((item) => [item.key as HubExtraServiceKey, item]),
  );

  return HUB_EXTRA_SERVICE_DEFINITIONS.map((definition) => {
    const stored = asRecord(byKey.get(definition.key));
    return {
      ...definition,
      ...stored,
      key: definition.key,
      name: firstText(stored.name, definition.name),
      description: firstText(stored.description, definition.description),
      enabled: Boolean(stored.enabled),
      billingStatus:
        stored.billingStatus === "active" ||
        stored.billingStatus === "trialing" ||
        stored.billingStatus === "cancelled"
          ? stored.billingStatus
          : "not_active",
    };
  });
};

/**
 * Metodo di incasso configurato a mano dal club, in `settings.paymentMethods`.
 *
 * Vive qui e non nella pagina Iscrizioni perche serve anche alla scheda
 * atleta: registrare un incasso deve poter scegliere fra i metodi del club
 * invece di scriverne il nome a mano (WP-33).
 */
export type ClubPaymentMethodOption = {
  id: string;
  name: string;
  details: string;
  active: boolean;
};

const MANUAL_PAYMENT_METHOD_LABELS: Record<string, string> = {
  bankTransfer: "Bonifico",
  cash: "Contanti",
  other: "Altro metodo manuale",
};

export const normalizeClubPaymentMethod = (
  method: unknown,
): ClubPaymentMethodOption => {
  const record = asRecord(method);

  return {
    id:
      firstText(record.id) ||
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `method_${Date.now()}`),
    name: firstText(record.name),
    details: firstText(record.details, asRecord(record.config).details),
    active: Boolean(record.active ?? record.is_enabled ?? true),
  };
};

export const normalizeClubPaymentMethods = (
  value: unknown,
): ClubPaymentMethodOption[] =>
  (Array.isArray(value) ? value : []).map(normalizeClubPaymentMethod);

export const serializeClubPaymentMethodsForSettings = (
  methods: ClubPaymentMethodOption[],
) =>
  methods.map((method, index) => ({
    id: method.id,
    name: method.name,
    type: "custom",
    is_enabled: method.active,
    processing_fee_percentage: 0,
    processing_fee_fixed: 0,
    display_order: index + 1,
    config: {
      details: method.details || "",
    },
  }));

/**
 * Etichette selezionabili quando si registra un incasso: i metodi
 * personalizzati attivi del club, i metodi manuali abilitati e i provider
 * online effettivamente utilizzabili. Nessun duplicato, ordine stabile.
 */
export const getClubPaymentMethodChoices = (clubSettings: unknown): string[] => {
  const settings = asRecord(clubSettings);
  const paymentSettings = normalizePaymentSettings(settings.paymentSettings);

  const custom = normalizeClubPaymentMethods(settings.paymentMethods)
    .filter((method) => method.active && method.name)
    .map((method) => method.name);

  const manual = Object.entries(paymentSettings.manualMethods || {})
    .filter(([, enabled]) => Boolean(enabled))
    .map(([key]) => MANUAL_PAYMENT_METHOD_LABELS[key] || key);

  const online = getAvailableRegistrationPaymentMethods(paymentSettings).map(
    (method) => method.label,
  );

  const seen = new Set<string>();
  return [...custom, ...manual, ...online].filter((label) => {
    const key = label.trim().toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};
