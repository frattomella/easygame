import assert from "node:assert/strict";
import test, { before } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **Chi puo scrivere le condizioni commerciali dentro `paymentSettings`.**
 *
 * Il difetto era questo, e non era teorico. La pagina Organizzazione rimanda
 * l'intero blocco `settings` a ogni salvataggio, e la guardia di ADR-0048
 * proteggeva solo `subscription`, `extraServices` ed `entitlements`.
 * `paymentSettings` restava scoperta, e conteneva:
 *
 *   * `platformFeePercent` — quanto trattiene EasyGame;
 *   * `providers.stripe.connectedAccountId` — **dove finisce il denaro delle
 *     famiglie**;
 *   * `providers.stripe.status` — se si puo incassare.
 *
 * Tutti e tre erano modificabili aprendo la console del browser, o
 * semplicemente compilando i campi che la scheda Pagamenti mostrava.
 *
 * La difesa non poteva essere «proteggi tutta la chiave»: dentro c'e anche
 * l'interruttore con cui una segreteria sospende gli incassi durante la
 * chiusura estiva, ed e giusto che lo governi. La guardia lavora quindi
 * **campo per campo**.
 */

let ownership;

before(async () => {
  ownership = await import("../../src/lib/entitlements/ownership.ts");
});

const ESISTENTE = {
  paymentSettings: {
    enabled: false,
    platformFeePercent: 1,
    platformFeeFixedCents: 0,
    platformFeePaidBy: "club",
    enabledRegistrationMethods: [],
    providers: {
      stripe: {
        provider: "stripe",
        enabled: false,
        status: "not_configured",
        mode: "test",
        connectedAccountId: "acct_vero",
        publicLabel: "Stripe",
      },
    },
  },
};

const guarda = (incoming, options = {}) =>
  ownership.withPlatformOwnedSettings(ESISTENTE, incoming, options);

/* ------------------------------------------------------- la commissione */

test("un club non puo azzerarsi la commissione", () => {
  const esito = guarda({
    paymentSettings: {
      ...ESISTENTE.paymentSettings,
      platformFeePercent: 0,
    },
  });

  assert.equal(esito.settings.paymentSettings.platformFeePercent, 1);
  assert.ok(esito.rejectedKeys.includes("paymentSettings.platformFeePercent"));
});

test("un club non puo togliersi la quota fissa ne spostarla su chi paga", () => {
  const esito = guarda({
    paymentSettings: {
      ...ESISTENTE.paymentSettings,
      platformFeeFixedCents: 999,
      platformFeePaidBy: "payer",
    },
  });

  assert.equal(esito.settings.paymentSettings.platformFeeFixedCents, 0);
  assert.equal(esito.settings.paymentSettings.platformFeePaidBy, "club");
  assert.equal(esito.rejectedKeys.length, 2);
});

/* --------------------------------------------------- il conto di incasso */

test("un club non puo dirottare gli incassi su un altro conto", () => {
  const esito = guarda({
    paymentSettings: {
      ...ESISTENTE.paymentSettings,
      providers: {
        stripe: {
          ...ESISTENTE.paymentSettings.providers.stripe,
          connectedAccountId: "acct_del_ladro",
        },
      },
    },
  });

  assert.equal(
    esito.settings.paymentSettings.providers.stripe.connectedAccountId,
    "acct_vero",
  );
  assert.ok(
    esito.rejectedKeys.includes(
      "paymentSettings.providers.stripe.connectedAccountId",
    ),
  );
});

test("un club non puo dichiararsi verificato", () => {
  const esito = guarda({
    paymentSettings: {
      ...ESISTENTE.paymentSettings,
      providers: {
        stripe: {
          ...ESISTENTE.paymentSettings.providers.stripe,
          status: "active",
        },
      },
    },
  });

  assert.equal(
    esito.settings.paymentSettings.providers.stripe.status,
    "not_configured",
  );
});

test("un club non puo passare da test a live da solo", () => {
  const esito = guarda({
    paymentSettings: {
      ...ESISTENTE.paymentSettings,
      providers: {
        stripe: {
          ...ESISTENTE.paymentSettings.providers.stripe,
          mode: "live",
        },
      },
    },
  });

  assert.equal(esito.settings.paymentSettings.providers.stripe.mode, "test");
});

/* ------------------------------------------- cosa il club governa davvero */

test("il club puo accendere e spegnere i propri incassi online", () => {
  const esito = guarda({
    paymentSettings: { ...ESISTENTE.paymentSettings, enabled: true },
  });

  assert.equal(esito.settings.paymentSettings.enabled, true);
  assert.deepEqual(esito.rejectedKeys, []);
});

test("il club puo cambiare l'etichetta pubblica di un metodo", () => {
  const esito = guarda({
    paymentSettings: {
      ...ESISTENTE.paymentSettings,
      providers: {
        stripe: {
          ...ESISTENTE.paymentSettings.providers.stripe,
          publicLabel: "Carta di credito",
        },
      },
    },
  });

  assert.equal(
    esito.settings.paymentSettings.providers.stripe.publicLabel,
    "Carta di credito",
  );
  assert.deepEqual(esito.rejectedKeys, []);
});

test("rimandare indietro cio che si e letto non e un tentativo", () => {
  /*
    Succede a ogni salvataggio della pagina Organizzazione, anche quando si e
    cambiato solo un numero di telefono. Segnalarlo riempirebbe l'audit di
    righe che non raccontano niente.
  */
  const esito = guarda({ paymentSettings: ESISTENTE.paymentSettings });

  assert.deepEqual(esito.rejectedKeys, []);
});

/* ------------------------------------------------------ la piattaforma */

test("chi amministra la piattaforma scrive tutto", () => {
  const esito = guarda(
    {
      paymentSettings: {
        ...ESISTENTE.paymentSettings,
        platformFeePercent: 0.75,
        providers: {
          stripe: {
            ...ESISTENTE.paymentSettings.providers.stripe,
            status: "active",
          },
        },
      },
    },
    { isPlatformAdmin: true },
  );

  assert.equal(esito.settings.paymentSettings.platformFeePercent, 0.75);
  assert.deepEqual(esito.rejectedKeys, []);
});

test("il piano resta protetto come prima", () => {
  const esito = ownership.withPlatformOwnedSettings(
    { subscription: { plan: "free" } },
    { subscription: { plan: "plus" } },
  );

  assert.deepEqual(esito.settings.subscription, { plan: "free" });
  assert.ok(esito.rejectedKeys.includes("subscription"));
});

/* ------------------------------------------------- l'elenco e completo */

test("i campi commerciali protetti sono dichiarati, non sparsi", () => {
  assert.deepEqual(ownership.PLATFORM_OWNED_PAYMENT_FIELDS, [
    "platformFeePercent",
    "platformFeeFixedCents",
    "platformFeePaidBy",
  ]);

  for (const campo of ["connectedAccountId", "status", "mode"]) {
    assert.ok(
      ownership.PLATFORM_OWNED_PROVIDER_FIELDS.includes(campo),
      `${campo} decide dove finisce il denaro o se si puo incassare`,
    );
  }
});

/* ------------------------------------------------------- l audit resta leggibile */

test("il campo dell audit non si chiama come un segreto", () => {
  /*
    Il sanitizzatore dell audit oscura ogni chiave che contenga il segmento
    «key». Con `rejectedKeys` il valore finiva «[rimosso]»: restava la traccia
    del tentativo e spariva **quale** campo qualcuno avesse provato a
    cambiarsi — cioe la sola cosa per cui quella riga esiste.
  */
  const resources = readFileSync(
    path.join(process.cwd(), "src/lib/server/resources.ts"),
    "utf8",
  );

  assert.match(resources, /metadata: { rejectedFields:/);
  assert.doesNotMatch(resources, /metadata: { rejectedKeys:/);
});
