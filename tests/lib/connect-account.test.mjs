import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * Lo **stato dell'account di incasso** di un club, e se si puo incassare
 * adesso.
 *
 * Sette stati e cinque ostacoli non sono barocchismo: ognuno lo risolve una
 * persona diversa — chi installa l'ambiente, Cedi Soft, il rappresentante
 * legale della societa, il provider, la segreteria. «Non disponibile» li
 * manderebbe tutti al telefono.
 */

let connect;

before(async () => {
  connect = await import("../../src/lib/payments/connect-account.ts");
});

/* ----------------------------------------- dal provider allo stato nostro */

test("senza account non c'e nulla da configurare", () => {
  const derivato = connect.deriveConnectAccountState({});
  assert.equal(derivato.state, "not_configured");
});

test("un account appena creato chiede di completare l'onboarding", () => {
  const derivato = connect.deriveConnectAccountState({
    externalId: "acct_1",
    chargesEnabled: false,
    payoutsEnabled: false,
  });

  assert.equal(derivato.state, "onboarding_required");
});

test("un account che non incassa e con dati mancanti chiede al club", () => {
  const derivato = connect.deriveConnectAccountState({
    externalId: "acct_1",
    chargesEnabled: false,
    currentlyDue: ["individual.id_number"],
  });

  assert.equal(derivato.state, "action_required");
  assert.deepEqual(derivato.requirements, ["individual.id_number"]);
});

test("un account che non incassa e senza dati mancanti sta aspettando il provider", () => {
  const derivato = connect.deriveConnectAccountState({
    externalId: "acct_1",
    chargesEnabled: false,
    pendingVerification: ["document"],
  });

  assert.equal(derivato.state, "pending_verification");
});

test("un account operativo con richieste pendenti resta «azione richiesta»", () => {
  /*
    Dire «attivo» e tacere sarebbe corretto oggi e falso fra due settimane,
    quando la richiesta scade e i pagamenti si fermano senza preavviso.
  */
  const derivato = connect.deriveConnectAccountState({
    externalId: "acct_1",
    chargesEnabled: true,
    payoutsEnabled: true,
    currentlyDue: ["company.tax_id"],
  });

  assert.equal(derivato.state, "action_required");
  assert.equal(derivato.chargesEnabled, true);
});

test("un account disabilitato dal provider e limitato, qualunque cosa dica il resto", () => {
  const derivato = connect.deriveConnectAccountState({
    externalId: "acct_1",
    chargesEnabled: true,
    payoutsEnabled: true,
    disabledReason: "requirements.past_due",
  });

  assert.equal(derivato.state, "restricted");
});

test("una richiesta scaduta su un account che non incassa lo rende limitato", () => {
  const derivato = connect.deriveConnectAccountState({
    externalId: "acct_1",
    chargesEnabled: false,
    pastDue: ["individual.verification.document"],
  });

  assert.equal(derivato.state, "restricted");
});

test("tutto a posto significa attivo", () => {
  const derivato = connect.deriveConnectAccountState({
    externalId: "acct_1",
    chargesEnabled: true,
    payoutsEnabled: true,
  });

  assert.equal(derivato.state, "active");
});

/* --------------------------------------------------- si puo incassare? */

const READY = {
  providerConfigured: true,
  platformEnabled: true,
  externalAccountId: "acct_1",
  state: "active",
  chargesEnabled: true,
  clubEnabled: true,
};

test("con tutti i gradini saliti si incassa", () => {
  const esito = connect.describeCheckoutReadiness(READY);

  assert.equal(esito.canCheckout, true);
  assert.equal(esito.blocker, null);
});

test("senza credenziali sull'ambiente il problema non e del club", () => {
  const esito = connect.describeCheckoutReadiness({
    ...READY,
    providerConfigured: false,
  });

  assert.equal(esito.blocker, "provider_not_configured");
  assert.match(esito.message, /non sono configurati su questo ambiente/i);
});

test("un club senza il servizio venduto non incassa, e lo dice come tale", () => {
  const esito = connect.describeCheckoutReadiness({
    ...READY,
    platformEnabled: false,
  });

  assert.equal(esito.blocker, "platform_disabled");
});

test("un club senza account connesso non incassa", () => {
  const esito = connect.describeCheckoutReadiness({
    ...READY,
    externalAccountId: null,
  });

  assert.equal(esito.blocker, "no_account");
});

test("un account in verifica non incassa, e il messaggio spiega cosa sta succedendo", () => {
  const esito = connect.describeCheckoutReadiness({
    ...READY,
    state: "pending_verification",
    chargesEnabled: false,
  });

  assert.equal(esito.blocker, "account_not_ready");
  assert.match(esito.message, /verificando/i);
});

test("la societa puo spegnere i propri incassi online, ed e l'ultimo gradino", () => {
  /*
    E l'unica cosa di tutto questo dominio che il club deve poter cambiare da
    solo. Sta per ultima perche non ha senso dire a una segreteria di
    riaccendere un interruttore se il servizio non e stato venduto.
  */
  const esito = connect.describeCheckoutReadiness({
    ...READY,
    clubEnabled: false,
  });

  assert.equal(esito.blocker, "club_disabled");
});

test("i cinque ostacoli hanno cinque messaggi diversi", () => {
  const messaggi = new Set(
    [
      { ...READY, providerConfigured: false },
      { ...READY, platformEnabled: false },
      { ...READY, externalAccountId: null },
      { ...READY, state: "pending_verification", chargesEnabled: false },
      { ...READY, clubEnabled: false },
    ].map((input) => connect.describeCheckoutReadiness(input).message),
  );

  assert.equal(
    messaggi.size,
    5,
    "«non disponibile» manda tutti al telefono: li risolvono persone diverse",
  );
});

/* --------------------------- l'interruttore commerciale: deciso o mai mosso */

test("un `false` mai deciso non e una sospensione: si inizializza", () => {
  const esito = connect.resolvePlatformEnablement({
    storedEnabled: false,
    decidedAt: null,
    provisioning: true,
  });

  assert.equal(esito.enabled, true);
  assert.equal(esito.explicitlyDisabled, false);
  assert.equal(esito.initializes, true);
});

test("un `false` deciso e una sospensione, e resta", () => {
  const esito = connect.resolvePlatformEnablement({
    storedEnabled: false,
    decidedAt: "2026-08-01T10:00:00.000Z",
    provisioning: true,
  });

  assert.equal(esito.enabled, false);
  assert.equal(esito.explicitlyDisabled, true);
  assert.equal(esito.initializes, false);
});

test("senza un account pronto non si inizializza niente", () => {
  const esito = connect.resolvePlatformEnablement({
    storedEnabled: false,
    decidedAt: null,
    provisioning: false,
  });

  assert.equal(esito.enabled, false);
  assert.equal(
    esito.explicitlyDisabled,
    false,
    "non deciso non e spento: lo stato resta quello del PSP",
  );
  assert.equal(esito.initializes, false);
});

test("un interruttore gia acceso non si ridecide", () => {
  for (const decidedAt of [null, "2026-08-01T10:00:00.000Z"]) {
    const esito = connect.resolvePlatformEnablement({
      storedEnabled: true,
      decidedAt,
      provisioning: false,
    });

    assert.equal(esito.enabled, true);
    assert.equal(esito.explicitlyDisabled, false);
    assert.equal(esito.initializes, false);
  }
});
