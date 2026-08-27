/**
 * L'**account di incasso di un club**: chi lo crea, chi lo aggiorna, chi lo
 * spegne.
 *
 * **La regola che questo file esiste per rendere vera.** L'identificativo
 * dell'account connesso e il suo stato **non arrivano mai da un club**. Prima
 * del Blocco D arrivavano da un campo di testo nella pagina Organizzazione, e
 * con un menu a tendina accanto per dichiararsi «attivo»: bastava incollarci
 * l'account di qualcun altro perche gli incassi delle famiglie finissero
 * altrove, con EasyGame a fare da tramite. Qui le sole tre origini ammesse
 * sono:
 *
 *   1. la console di piattaforma, che crea l'account presso il PSP;
 *   2. una sincronizzazione esplicita, che chiede al PSP com'e messo;
 *   3. un evento `account.updated` la cui **firma e stata verificata**.
 *
 * Il club non compare fra le tre. Cio che il club puo fare e aprire il link di
 * onboarding e seguirlo — cioe andare a parlare con Stripe, che e esattamente
 * quel che deve succedere quando servono i dati del rappresentante legale.
 *
 * **Perche EasyGame non raccoglie i dati KYC.** Perche non e un intermediario
 * finanziario e non deve diventarlo. Chiedere documento e dati del
 * rappresentante dentro un gestionale sportivo significherebbe custodire dati
 * di identita che il PSP e attrezzato a custodire e noi no. Si genera il link,
 * e li dentro ci va chi ha titolo. Vedi ADR-0051.
 */

import { prisma } from "./prisma";
import { readPlatformSetting, PLATFORM_SETTING_KEYS, type StripeConnectSettings } from "./platform-settings";
import {
  deriveConnectAccountState,
  describeCheckoutReadiness,
  resolvePlatformEnablement,
  type CheckoutReadiness,
  type ConnectAccountState,
  type ProviderAccountSnapshot,
} from "@/lib/payments/connect-account";
import {
  PaymentGatewayError,
  getPaymentGateway,
  requirePaymentGateway,
  type PaymentGatewayKey,
} from "@/lib/payments/gateway";

const asText = (value: unknown) => String(value ?? "").trim();

const accountClient = () => (prisma as any).clubPaymentAccount;

export type ClubPaymentAccountRecord = {
  organizationId: string;
  provider: PaymentGatewayKey;
  externalAccountId: string | null;
  accountType: "standard" | "express";
  state: ConnectAccountState;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirements: string[];
  disabledReason: string | null;
  /** L'interruttore commerciale della piattaforma. */
  onlinePaymentsEnabled: boolean;
  /**
   * Quando l'interruttore e stato deciso davvero. `null` = mai: il valore
   * accanto e il default della colonna, non una scelta. Vedi
   * `resolvePlatformEnablement`.
   */
  onlinePaymentsDecidedAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
};

const toRecord = (row: any, organizationId: string): ClubPaymentAccountRecord => ({
  organizationId,
  provider: (asText(row?.provider) || "stripe") as PaymentGatewayKey,
  externalAccountId: asText(row?.external_account_id) || null,
  accountType: row?.account_type === "express" ? "express" : "standard",
  state: (asText(row?.status) || "not_configured") as ConnectAccountState,
  chargesEnabled: Boolean(row?.charges_enabled),
  payoutsEnabled: Boolean(row?.payouts_enabled),
  requirements: Array.isArray(row?.requirements)
    ? row.requirements.map(String)
    : [],
  disabledReason: asText(row?.disabled_reason) || null,
  onlinePaymentsEnabled: Boolean(row?.online_payments_enabled),
  onlinePaymentsDecidedAt: row?.online_payments_decided_at
    ? new Date(row.online_payments_decided_at).toISOString()
    : null,
  lastSyncedAt: row?.last_synced_at
    ? new Date(row.last_synced_at).toISOString()
    : null,
  lastError: asText(row?.last_error) || null,
});

/**
 * L'account di un club, o lo stato «non configurato» se non ne ha uno.
 *
 * **Non crea la riga.** Una lettura che scrive e una lettura che non si puo
 * fare da una replica, e soprattutto e una lettura che lascia dietro di se una
 * riga per ogni club mai visitato. Lo stato «non esiste» si rappresenta bene
 * senza una riga.
 */
export const getClubPaymentAccount = async (
  organizationId: string,
): Promise<ClubPaymentAccountRecord> => {
  const id = asText(organizationId);
  if (!id) throw new Error("Accesso negato: nessun club indicato");

  const row = await accountClient().findUnique({
    where: { organization_id: id },
  });

  return toRecord(row, id);
};

/** Gli account di piu club in una query sola: la console li elenca tutti. */
export const listClubPaymentAccounts = async (
  organizationIds: string[],
): Promise<Map<string, ClubPaymentAccountRecord>> => {
  const ids = Array.from(new Set(organizationIds.map(asText).filter(Boolean)));
  if (!ids.length) return new Map();

  const rows = await accountClient().findMany({
    where: { organization_id: { in: ids } },
  });

  const byId = new Map<string, ClubPaymentAccountRecord>();
  for (const id of ids) {
    const row = rows.find((entry: any) => String(entry.organization_id) === id);
    byId.set(id, toRecord(row, id));
  }

  return byId;
};

/* ------------------------------------------------------- l'interruttore */

/**
 * Accende o spegne i pagamenti online per un club. **Solo la piattaforma.**
 *
 * Spegnerlo non cancella l'account presso il PSP e non tocca gli incassi gia
 * registrati: sospende la possibilita di aprire nuovi checkout. E la leva che
 * serve quando un cliente non paga l'abbonamento, e deve essere reversibile
 * senza rifare l'onboarding.
 */
export const setClubOnlinePaymentsEnabled = async (input: {
  organizationId: string;
  enabled: boolean;
}) => {
  const id = asText(input.organizationId);
  if (!id) throw new Error("Accesso negato: nessun club indicato");

  const existing = await accountClient().findUnique({
    where: { organization_id: id },
  });

  /*
    Lo stato `disabled` e una fotografia dell'interruttore, non dello stato
    presso il PSP: riaccendendo si torna a cio che il PSP diceva, che e in
    `requirements` e `charges_enabled` e non e stato toccato.
  */
  const nextStatus = input.enabled
    ? deriveConnectAccountState({
        externalId: existing?.external_account_id,
        chargesEnabled: existing?.charges_enabled,
        payoutsEnabled: existing?.payouts_enabled,
        currentlyDue: Array.isArray(existing?.requirements)
          ? existing.requirements
          : [],
        disabledReason: existing?.disabled_reason,
      }).state
    : "disabled";

  /*
    **Qui, e solo qui, si stampiglia la data della decisione.** E cio che
    distingue «spento di proposito» da «mai acceso»: senza, il primo evento
    `account.updated` di un account operativo riaccenderebbe gli incassi di
    una societa che la piattaforma ha sospeso. Vedi
    `resolvePlatformEnablement` e ADR-0064.
  */
  const decidedAt = new Date();

  const row = await accountClient().upsert({
    where: { organization_id: id },
    create: {
      organization_id: id,
      online_payments_enabled: input.enabled,
      online_payments_decided_at: decidedAt,
      status: nextStatus,
    },
    update: {
      online_payments_enabled: input.enabled,
      online_payments_decided_at: decidedAt,
      status: nextStatus,
    },
  });

  return toRecord(row, id);
};

/* ----------------------------------------------------------- onboarding */

export type OnboardingResult = {
  account: ClubPaymentAccountRecord;
  /** Il link da consegnare al rappresentante legale. Scade. */
  url: string;
  expiresAt: string;
};

/**
 * Crea l'account presso il PSP, se non c'e, e genera il link di onboarding.
 *
 * **Perche i due passi stanno insieme.** Un account creato senza un link e un
 * account che nessuno completera, e la seconda chiamata la si dimentica. Il
 * link **scade** di proposito: un indirizzo di attivazione riutilizzabile e a
 * tutti gli effetti una credenziale, e girerebbe via email finche qualcuno non
 * lo trova.
 */
export const startConnectOnboarding = async (input: {
  organizationId: string;
  clubName: string;
  email: string;
  returnUrl: string;
  refreshUrl: string;
}): Promise<OnboardingResult> => {
  const id = asText(input.organizationId);
  if (!id) throw new Error("Accesso negato: nessun club indicato");

  const settings = await readPlatformSetting<StripeConnectSettings>(
    PLATFORM_SETTING_KEYS.stripeConnect,
  );

  if (!settings.onboardingEnabled) {
    throw new PaymentGatewayError(
      "not_configured",
      "L'apertura di nuovi collegamenti e sospesa nella configurazione di piattaforma",
      "stripe",
    );
  }

  const gateway = requirePaymentGateway("stripe");
  const existing = await accountClient().findUnique({
    where: { organization_id: id },
  });

  let externalAccountId = asText(existing?.external_account_id);
  let accountType: "standard" | "express" =
    existing?.account_type === "express" ? "express" : settings.accountType;

  if (!externalAccountId) {
    const merchant = await gateway.createMerchant({
      organizationId: id,
      clubName: asText(input.clubName) || "Societa sportiva",
      email: asText(input.email),
      country: settings.defaultCountry || "IT",
      accountType: settings.accountType,
    });

    externalAccountId = merchant.externalId;
    accountType = settings.accountType;
  }

  const link = await gateway.createOnboardingLink({
    merchantExternalId: externalAccountId,
    returnUrl: input.returnUrl,
    refreshUrl: input.refreshUrl,
  });

  /*
    **L'interruttore si inizializza anche su una riga che c'era gia (E9).**

    Il ramo `create` lo scriveva `true` e il ramo `update` non lo toccava: una
    riga preesistente — legacy, o creata da un percorso che non era questo —
    restava a `false`, cioe al default della colonna, e ci restava per sempre.
    Il club completava l'onboarding, Stripe dichiarava l'account operativo, e
    EasyGame continuava a rispondere «i pagamenti online non sono attivi per
    questa societa».

    Non e un `true` indiscriminato: se la piattaforma ha **deciso** di spegnere
    gli incassi di questa societa, la sua decisione resta. Predisporre
    l'account non e revocare una sospensione.
  */
  const enablement = resolvePlatformEnablement({
    storedEnabled: existing?.online_payments_enabled,
    decidedAt: existing?.online_payments_decided_at,
    provisioning: true,
  });

  const row = await accountClient().upsert({
    where: { organization_id: id },
    create: {
      organization_id: id,
      provider: "stripe",
      external_account_id: externalAccountId,
      account_type: accountType,
      status: "onboarding_required",
      online_payments_enabled: true,
    },
    update: {
      external_account_id: externalAccountId,
      account_type: accountType,
      status: enablement.explicitlyDisabled
        ? "disabled"
        : existing?.status === "active"
          ? "active"
          : "onboarding_required",
      online_payments_enabled: enablement.enabled,
      last_error: null,
    },
  });

  return {
    account: toRecord(row, id),
    url: link.url,
    expiresAt: link.expiresAt,
  };
};

/* ------------------------------------------------------ sincronizzazione */

/**
 * Riscrive lo stato di un account a partire da cio che dice il PSP.
 *
 * Si chiama **esplicitamente** — da un pulsante della console, o quando arriva
 * un evento — e mai durante il caricamento di una lista: sarebbe una chiamata
 * di rete per riga, e una pagina che non si apre quando il PSP e lento.
 */
export const syncClubPaymentAccount = async (
  organizationId: string,
): Promise<ClubPaymentAccountRecord> => {
  const id = asText(organizationId);
  const existing = await accountClient().findUnique({
    where: { organization_id: id },
  });

  const externalAccountId = asText(existing?.external_account_id);
  if (!externalAccountId) {
    return toRecord(existing, id);
  }

  const gateway = requirePaymentGateway("stripe");

  try {
    const merchant = await gateway.getMerchant(externalAccountId);

    return applyProviderAccountSnapshot({
      organizationId: id,
      snapshot: {
        externalId: merchant.externalId,
        chargesEnabled: merchant.chargesEnabled,
        payoutsEnabled: merchant.payoutsEnabled,
        currentlyDue: merchant.pendingRequirements,
        disabledReason:
          merchant.status === "restricted" ? "requirements" : null,
      },
    });
  } catch (error: any) {
    /*
      Un errore di rete non deve cancellare lo stato conosciuto: si registra
      accanto, cosi la console lo mostra senza far credere che l'account sia
      diventato «non configurato».
    */
    const row = await accountClient().update({
      where: { organization_id: id },
      data: {
        last_error: String(error?.message || error).slice(0, 500),
        last_synced_at: new Date(),
      },
    });

    return toRecord(row, id);
  }
};

/**
 * Applica al database la fotografia dell'account fornita dal provider.
 *
 * E il punto unico in cui `charges_enabled`, `payouts_enabled` e i requisiti
 * vengono scritti: ci arrivano la sincronizzazione esplicita e il webhook, e
 * nessun altro.
 */
export const applyProviderAccountSnapshot = async (input: {
  organizationId: string;
  snapshot: ProviderAccountSnapshot;
}): Promise<ClubPaymentAccountRecord> => {
  const id = asText(input.organizationId);
  const derived = deriveConnectAccountState(input.snapshot);

  const existing = await accountClient().findUnique({
    where: { organization_id: id },
  });

  /*
    **L'interruttore della piattaforma vince su cio che dice il PSP — se
    qualcuno lo ha davvero mosso.** Un account perfettamente operativo presso
    Stripe, ma sospeso da Cedi Soft, deve restare `disabled`: e una decisione
    commerciale, e un evento del PSP non la puo ribaltare.

    Fino al Blocco E qui bastava `online_payments_enabled === false`, e non
    bastava: quel `false` e anche il default della colonna. Una riga mai
    inizializzata veniva scambiata per una sospensione, e lo stato del club
    veniva forzato a `disabled` **a ogni sincronizzazione riuscita** — con
    l'account Stripe attivo e nessuno che avesse deciso niente (E9).

    Adesso la sospensione la prova una data. Quando non c'e, e l'account e
    diventato operativo, l'interruttore si inizializza: e il momento in cui
    l'incasso e stato davvero predisposto per questo club. Se l'account **non**
    e pronto non si abilita niente, che e la meta opposta dello stesso difetto.
  */
  const enablement = resolvePlatformEnablement({
    storedEnabled: existing?.online_payments_enabled,
    decidedAt: existing?.online_payments_decided_at,
    provisioning: derived.state === "active" && derived.chargesEnabled,
  });

  const status = enablement.explicitlyDisabled ? "disabled" : derived.state;

  const row = await accountClient().upsert({
    where: { organization_id: id },
    create: {
      organization_id: id,
      provider: "stripe",
      external_account_id: asText(input.snapshot.externalId) || null,
      status,
      charges_enabled: derived.chargesEnabled,
      payouts_enabled: derived.payoutsEnabled,
      requirements: derived.requirements,
      disabled_reason: derived.disabledReason,
      online_payments_enabled: true,
      last_synced_at: new Date(),
      last_error: null,
    },
    update: {
      external_account_id:
        asText(input.snapshot.externalId) || existing?.external_account_id || null,
      status,
      charges_enabled: derived.chargesEnabled,
      payouts_enabled: derived.payoutsEnabled,
      requirements: derived.requirements,
      disabled_reason: derived.disabledReason,
      online_payments_enabled: enablement.enabled,
      last_synced_at: new Date(),
      last_error: null,
    },
  });

  return toRecord(row, id);
};

/**
 * Il club a cui appartiene un account connesso.
 *
 * **Perche si cerca per identificativo dell'account e non per metadati.** I
 * metadati di un account li puo modificare chi ha accesso a quell'account; la
 * riga in questa tabella l'ha scritta EasyGame quando l'account e stato
 * creato. Quando le due cose non coincidono, e la riga a vincere — ed e la
 * ragione per cui un evento che citasse un club diverso da quello a cui
 * l'account e collegato non viene assecondato.
 */
export const findOrganizationByExternalAccount = async (
  externalAccountId: string,
): Promise<string | null> => {
  const id = asText(externalAccountId);
  if (!id) return null;

  const row = await accountClient().findFirst({
    where: { external_account_id: id },
    select: { organization_id: true },
  });

  return row ? String(row.organization_id) : null;
};

/* --------------------------------------------------- si puo incassare? */

/**
 * Se un club puo aprire un checkout adesso.
 *
 * `clubEnabled` resta la preferenza della societa e continua a vivere in
 * `clubs.settings.paymentSettings.enabled`: e l'unica cosa, di tutto questo
 * dominio, che il club deve poter cambiare da solo. Spegnere gli incassi
 * online durante una settimana di chiusura e una scelta operativa, non una
 * condizione commerciale.
 */
export const resolveCheckoutReadiness = async (input: {
  organizationId: string;
  clubEnabled?: boolean;
}): Promise<{ account: ClubPaymentAccountRecord; readiness: CheckoutReadiness }> => {
  const account = await getClubPaymentAccount(input.organizationId);
  const gateway = getPaymentGateway(account.provider);

  return {
    account,
    readiness: describeCheckoutReadiness({
      providerConfigured: Boolean(gateway?.isConfigured()),
      platformEnabled: account.onlinePaymentsEnabled,
      externalAccountId: account.externalAccountId,
      state: account.state,
      chargesEnabled: account.chargesEnabled,
      clubEnabled: input.clubEnabled,
    }),
  };
};
