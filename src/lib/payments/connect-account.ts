/**
 * Lo stato dell'**account di incasso di un club** presso il PSP.
 *
 * **Perche gli stati sono sette e non due.** «Attivo / non attivo» costringe
 * chi legge a telefonare per sapere cosa fare. Un account Connect puo trovarsi
 * in situazioni che richiedono azioni diverse da persone diverse: chi
 * amministra la piattaforma deve abilitare il servizio, il rappresentante
 * legale deve completare la verifica presso Stripe, oppure non c'e nulla da
 * fare e si aspetta. Ogni stato qui dice **chi** deve muoversi.
 *
 * **Perche lo stato si legge dal database e non da Stripe.** Interrogare il
 * PSP a ogni caricamento di pagina sarebbe una chiamata di rete su un percorso
 * di lettura, e una pagina che non si apre perche Stripe e lento. Lo stato
 * viene riscritto quando lo si sincronizza esplicitamente e quando arriva un
 * evento `account.updated` firmato; qui si legge quello. Vedi ADR-0051.
 *
 * Modulo **puro**: nessun database, nessuna rete.
 */

export const CONNECT_ACCOUNT_STATES = [
  "not_configured",
  "onboarding_required",
  "pending_verification",
  "action_required",
  "active",
  "restricted",
  "disabled",
] as const;

export type ConnectAccountState = (typeof CONNECT_ACCOUNT_STATES)[number];

export const isConnectAccountState = (
  value: unknown,
): value is ConnectAccountState =>
  CONNECT_ACCOUNT_STATES.includes(String(value || "") as ConnectAccountState);

type StateDefinition = {
  label: string;
  /** Una riga: cosa significa, per chi non conosce Stripe. */
  description: string;
  /** Chi deve muoversi perche lo stato cambi. */
  actor: "platform" | "club" | "provider" | "nobody";
  /** Il tono con cui l'interfaccia lo mostra. Nessun colore nuovo. */
  tone: "neutral" | "info" | "warning" | "success" | "danger";
};

export const CONNECT_ACCOUNT_STATE_DEFINITIONS: Record<
  ConnectAccountState,
  StateDefinition
> = {
  not_configured: {
    label: "Non configurato",
    description:
      "I pagamenti online non sono ancora stati abilitati per questa societa.",
    actor: "platform",
    tone: "neutral",
  },
  onboarding_required: {
    label: "Configurazione richiesta",
    description:
      "Il collegamento e stato avviato: il rappresentante legale deve completare la procedura presso il provider.",
    actor: "club",
    tone: "warning",
  },
  pending_verification: {
    label: "In verifica",
    description:
      "Il provider sta verificando i dati. Non serve fare nulla: puo richiedere qualche giorno.",
    actor: "provider",
    tone: "info",
  },
  action_required: {
    label: "Azione richiesta",
    description:
      "Il provider chiede altri dati o documenti al rappresentante legale prima di attivare l'account.",
    actor: "club",
    tone: "warning",
  },
  active: {
    label: "Attivo",
    description: "La societa puo incassare online e ricevere i versamenti.",
    actor: "nobody",
    tone: "success",
  },
  restricted: {
    label: "Limitato",
    description:
      "Il provider ha limitato l'account: gli incassi o i versamenti sono sospesi finche non viene risolto.",
    actor: "club",
    tone: "danger",
  },
  disabled: {
    label: "Disabilitato",
    description:
      "I pagamenti online sono stati sospesi dalla piattaforma. Gli incassi manuali restano disponibili.",
    actor: "platform",
    tone: "neutral",
  },
};

export const connectAccountStateLabel = (value: unknown) =>
  CONNECT_ACCOUNT_STATE_DEFINITIONS[
    isConnectAccountState(value) ? value : "not_configured"
  ].label;

/* ------------------------------------------- da cosa dice il PSP a uno stato */

export type ProviderAccountSnapshot = {
  externalId?: string | null;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  /** Cosa manca **adesso**, in parole del provider. */
  currentlyDue?: string[];
  /** Cosa e gia scaduto: non e la stessa cosa, e non si aspetta. */
  pastDue?: string[];
  /** Verifiche in corso presso il provider. */
  pendingVerification?: string[];
  disabledReason?: string | null;
};

/**
 * Traduce cio che il provider dice nello stato che EasyGame mostra.
 *
 * **Perche `charges_enabled` da solo non basta.** Un account puo incassare e
 * avere comunque una richiesta pendente che, scaduta, lo bloccherebbe: dire
 * «Attivo» e tacere sarebbe corretto oggi e falso fra due settimane, quando la
 * societa si troverebbe i pagamenti fermi senza preavviso. Ordine dei
 * controlli, dal piu grave:
 *
 * 1. il provider ha **disabilitato** l'account — nulla di cio che segue conta;
 * 2. ci sono richieste **scadute** — l'account e limitato o sta per esserlo;
 * 3. l'account **non incassa** e mancano dati — tocca al club;
 * 4. l'account **non incassa** e non manca nulla — sta verificando il provider;
 * 5. l'account incassa ma ha richieste pendenti — attivo, e lo si dice comunque.
 */
export const deriveConnectAccountState = (
  snapshot: ProviderAccountSnapshot,
): {
  state: ConnectAccountState;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirements: string[];
  disabledReason: string | null;
} => {
  const chargesEnabled = Boolean(snapshot?.chargesEnabled);
  const payoutsEnabled = Boolean(snapshot?.payoutsEnabled);
  const currentlyDue = (snapshot?.currentlyDue || []).map(String).filter(Boolean);
  const pastDue = (snapshot?.pastDue || []).map(String).filter(Boolean);
  const pendingVerification = (snapshot?.pendingVerification || [])
    .map(String)
    .filter(Boolean);
  const disabledReason = String(snapshot?.disabledReason || "").trim() || null;

  const requirements = Array.from(
    new Set([...pastDue, ...currentlyDue, ...pendingVerification]),
  );

  const base = {
    chargesEnabled,
    payoutsEnabled,
    requirements,
    disabledReason,
  };

  if (!String(snapshot?.externalId || "").trim()) {
    return { ...base, state: "not_configured" };
  }

  if (disabledReason) {
    return { ...base, state: "restricted" };
  }

  if (pastDue.length) {
    return { ...base, state: chargesEnabled ? "action_required" : "restricted" };
  }

  if (!chargesEnabled) {
    if (currentlyDue.length) {
      return { ...base, state: "action_required" };
    }
    return {
      ...base,
      state: pendingVerification.length ? "pending_verification" : "onboarding_required",
    };
  }

  if (currentlyDue.length) {
    return { ...base, state: "action_required" };
  }

  return { ...base, state: "active" };
};

/* ----------------------------------------------- si puo incassare, adesso? */

export type CheckoutReadiness = {
  canCheckout: boolean;
  /** Il primo ostacolo. `null` quando non ce ne sono. */
  blocker:
    | "provider_not_configured"
    | "platform_disabled"
    | "no_account"
    | "account_not_ready"
    | "club_disabled"
    | null;
  message: string;
  state: ConnectAccountState;
};

/**
 * Se un club puo aprire un checkout adesso, e se no cosa lo impedisce.
 *
 * **Cinque ostacoli, cinque messaggi diversi, ed e voluto.** «Non disponibile»
 * manda tutti al telefono. Ognuno di questi lo risolve una persona diversa: il
 * primo chi installa l'ambiente, il secondo Cedi Soft, il terzo e il quarto il
 * rappresentante della societa, il quinto la segreteria. L'ordine e quello
 * della catena: non ha senso dire a una segreteria di riaccendere un
 * interruttore se il servizio non e stato venduto.
 */
export const describeCheckoutReadiness = (input: {
  providerConfigured: boolean;
  /** L'interruttore commerciale della piattaforma. */
  platformEnabled: boolean;
  externalAccountId?: string | null;
  state: unknown;
  chargesEnabled?: boolean;
  /** La preferenza della societa: puo spegnere gli incassi online che ha. */
  clubEnabled?: boolean;
}): CheckoutReadiness => {
  const state: ConnectAccountState = isConnectAccountState(input.state)
    ? input.state
    : "not_configured";

  const blocked = (
    blocker: NonNullable<CheckoutReadiness["blocker"]>,
    message: string,
  ): CheckoutReadiness => ({ canCheckout: false, blocker, message, state });

  if (!input.providerConfigured) {
    return blocked(
      "provider_not_configured",
      "I pagamenti online non sono configurati su questo ambiente.",
    );
  }

  if (!input.platformEnabled) {
    return blocked(
      "platform_disabled",
      "I pagamenti online non sono attivi per questa societa.",
    );
  }

  if (!String(input.externalAccountId || "").trim()) {
    return blocked(
      "no_account",
      "La societa non ha ancora completato il collegamento del proprio conto di incasso.",
    );
  }

  if (state !== "active" || !input.chargesEnabled) {
    return blocked(
      "account_not_ready",
      CONNECT_ACCOUNT_STATE_DEFINITIONS[state].description,
    );
  }

  if (input.clubEnabled === false) {
    return blocked(
      "club_disabled",
      "I pagamenti online sono disattivati nelle impostazioni della societa.",
    );
  }

  return {
    canCheckout: true,
    blocker: null,
    message: "I pagamenti online sono attivi.",
    state,
  };
};

/* ------------------------------- l'interruttore commerciale, e chi lo ha mosso */

/**
 * Cosa fare dell'**interruttore commerciale** di un club dopo che la
 * piattaforma ha predisposto l'incasso.
 *
 * **Il difetto che questa funzione chiude (E9).** `online_payments_enabled`
 * nasce `false` per default di colonna. Finche l'unica riga possibile era
 * quella creata dall'onboarding — che lo scriveva `true` — la cosa non si
 * vedeva; ma il ramo `update` dell'upsert non lo toccava affatto, e una riga
 * gia esistente restava `false` per sempre. Il risultato era un club con
 * l'account Stripe pienamente attivo e EasyGame che mostrava «pagamenti non
 * attivi per questa societa», senza che nessuno avesse deciso niente.
 *
 * **Perche non si risolve con un `true`.** Perche `false` significa due cose
 * diverse, e confonderle e il difetto opposto e peggiore: riaccendere gli
 * incassi di una societa che la piattaforma ha **sospeso di proposito** — per
 * un abbonamento non pagato, per una contestazione — al primo evento
 * `account.updated` che passa. Le due cose si distinguono con una data:
 *
 *   `decidedAt === null`  → nessuno ha mai deciso: il `false` e il default
 *                           della colonna, e si puo inizializzare;
 *   `decidedAt` presente  → qualcuno ha deciso, e la sua decisione vale —
 *                           che sia «acceso» o «spento».
 *
 * Modulo **puro**: si prova senza database e senza rete.
 */
export type PlatformEnablementDecision = {
  /** L'interruttore come deve restare dopo questa operazione. */
  enabled: boolean;
  /**
   * Vero solo quando qualcuno ha deciso **no**. E la sola condizione che
   * autorizza a mostrare lo stato `disabled` al posto di quello del PSP.
   */
  explicitlyDisabled: boolean;
  /**
   * Vero quando questa operazione sta portando a `true` un interruttore che
   * non era mai stato deciso. Chi chiama lo scrive; nessuno stampiglia una
   * data, perche un'inizializzazione non e una decisione.
   */
  initializes: boolean;
};

export const resolvePlatformEnablement = (input: {
  /** Il valore in colonna. `false` puo essere una scelta o un default. */
  storedEnabled?: boolean | null;
  /** Quando l'interruttore e stato deciso davvero. `null` = mai. */
  decidedAt?: Date | string | null;
  /**
   * Vero quando la piattaforma sta **predisponendo** l'incasso per questo
   * club: ha creato o ricollegato l'account presso il PSP (onboarding),
   * oppure il PSP ha dichiarato l'account operativo (sincronizzazione o
   * evento `account.updated`).
   *
   * Falso quando l'account **non e pronto**: un account in verifica, limitato
   * o con requisiti scaduti non abilita niente, e non deve.
   */
  provisioning: boolean;
}): PlatformEnablementDecision => {
  const stored = input.storedEnabled === true;
  const decided =
    input.decidedAt !== null &&
    input.decidedAt !== undefined &&
    String(input.decidedAt) !== "";

  if (decided) {
    return {
      enabled: stored,
      explicitlyDisabled: !stored,
      initializes: false,
    };
  }

  if (stored) {
    return { enabled: true, explicitlyDisabled: false, initializes: false };
  }

  return {
    enabled: Boolean(input.provisioning),
    explicitlyDisabled: false,
    initializes: Boolean(input.provisioning),
  };
};
