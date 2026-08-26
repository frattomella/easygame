import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import fs from "node:fs";
import path from "node:path";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Le **condizioni commerciali** e l'**account di incasso** lato server: chi le
 * scrive, e come si conserva il passato.
 *
 * La regola: una condizione commerciale non si sovrascrive, si aggiunge con
 * una decorrenza. Una funzione che aggiornasse la riga corrente riporterebbe
 * esattamente il difetto che questa tabella esiste per chiudere — il listino
 * di oggi applicato retroattivamente alla contabilita del mese scorso.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "bbbbbbbb-0000-4000-8000-000000000002";
const PROJECT_ROOT = process.cwd();

let settings;
let accounts;
let setPrismaClientForTests;
let fake;

before(async () => {
  settings = await import("../../src/lib/server/platform-settings.ts");
  accounts = await import("../../src/lib/server/connect-accounts.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma({
    club: [
      { id: CLUB, name: "Fortitudo Scauri", settings: {} },
      { id: ALTRO_CLUB, name: "ASD Beta", settings: {} },
    ],
  });
  setPrismaClientForTests(fake.client);
});

/* --------------------------------------------------- le condizioni */

test("scrivere una condizione aggiunge una riga, non ne modifica una", async () => {
  await settings.saveCommissionRule({ percent: 1, note: "listino iniziale" });
  await settings.saveCommissionRule({ percent: 1.5, note: "aumento" });

  assert.equal(
    fake.rows("platformCommissionRule").length,
    2,
    "il passato resta leggibile perche le righe vecchie non spariscono",
  );
});

test("l'esempio del blocco: standard 1%, Fortitudo allo 0,75%", async () => {
  await settings.saveCommissionRule({ percent: 1 });
  await settings.saveCommissionRule({
    organizationId: CLUB,
    percent: 0.75,
    note: "condizione dedicata",
  });

  const fortitudo = await settings.resolveCommissionForClub({
    organizationId: CLUB,
  });
  const altro = await settings.resolveCommissionForClub({
    organizationId: ALTRO_CLUB,
  });

  assert.equal(fortitudo.percent, 0.75);
  assert.equal(fortitudo.origin, "club");
  assert.equal(altro.percent, 1);
  assert.equal(altro.origin, "platform");
});

test("rientrare nello standard non cancella la storia dell'override", async () => {
  await settings.saveCommissionRule({ percent: 1 });
  await settings.saveCommissionRule({ organizationId: CLUB, percent: 0.75 });

  await settings.clearClubCommissionOverride({ organizationId: CLUB });

  const righe = fake
    .rows("platformCommissionRule")
    .filter((row) => row.organization_id === CLUB);

  assert.equal(
    righe.length,
    2,
    "cancellare l'override farebbe sparire la spiegazione dei movimenti che lo applicavano",
  );

  const risolta = await settings.resolveCommissionForClub({
    organizationId: CLUB,
  });
  assert.equal(risolta.percent, 1);
});

test("una percentuale fuori scala viene rifiutata prima di essere scritta", async () => {
  await assert.rejects(
    () => settings.saveCommissionRule({ percent: 150 }),
    /fra 0 e 100/i,
  );

  await assert.rejects(
    () => settings.saveCommissionRule({ percent: -1 }),
    /fra 0 e 100/i,
  );
});

test("una data di decorrenza non valida viene rifiutata", async () => {
  await assert.rejects(
    () => settings.saveCommissionRule({ percent: 1, effectiveFrom: "domani" }),
    /decorrenza non valida/i,
  );
});

test("lo storico si legge dalla piu recente", async () => {
  await settings.saveCommissionRule({
    percent: 1,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
  });
  await settings.saveCommissionRule({
    percent: 1.5,
    effectiveFrom: "2026-07-01T00:00:00.000Z",
  });

  const storico = await settings.listCommissionHistory({});

  assert.equal(storico.length, 2);
  assert.equal(storico[0].percent, 1.5);
});

test("le regole di un club non compaiono nello storico standard", async () => {
  await settings.saveCommissionRule({ percent: 1 });
  await settings.saveCommissionRule({ organizationId: CLUB, percent: 0.75 });

  const standard = await settings.listCommissionHistory({});

  assert.equal(standard.length, 1);
  assert.equal(standard[0].percent, 1);
});

/* ------------------------------------------------- la configurazione */

test("una configurazione non scritta restituisce i valori predefiniti", async () => {
  const connect = await settings.readPlatformSetting(
    settings.PLATFORM_SETTING_KEYS.stripeConnect,
  );

  assert.equal(connect.accountType, "standard");
  assert.equal(connect.defaultCountry, "IT");
  assert.equal(connect.onboardingEnabled, true);
});

test("il provider fiscale nasce non scelto", async () => {
  const fiscal = await settings.readPlatformSetting(
    settings.PLATFORM_SETTING_KEYS.fiscalProvider,
  );

  assert.equal(
    fiscal.providerKey,
    null,
    "la trasmissione allo SdI non e attiva finche qualcuno non la decide",
  );
});

test("scrivere una configurazione non azzera le altre chiavi", async () => {
  await settings.writePlatformSetting(
    settings.PLATFORM_SETTING_KEYS.stripeConnect,
    { onboardingEnabled: false },
  );

  const connect = await settings.readPlatformSetting(
    settings.PLATFORM_SETTING_KEYS.stripeConnect,
  );

  assert.equal(connect.onboardingEnabled, false);
  assert.equal(connect.accountType, "standard");
});

/* -------------------------------------------------- l'account di incasso */

test("un club senza account si legge come «non configurato», senza scrivere", async () => {
  const account = await accounts.getClubPaymentAccount(CLUB);

  assert.equal(account.state, "not_configured");
  assert.equal(account.externalAccountId, null);
  assert.equal(account.onlinePaymentsEnabled, false);
  assert.equal(fake.rows("clubPaymentAccount").length, 0);
});

test("la piattaforma accende e spegne il servizio per un club", async () => {
  const acceso = await accounts.setClubOnlinePaymentsEnabled({
    organizationId: CLUB,
    enabled: true,
  });
  assert.equal(acceso.onlinePaymentsEnabled, true);

  const spento = await accounts.setClubOnlinePaymentsEnabled({
    organizationId: CLUB,
    enabled: false,
  });
  assert.equal(spento.onlinePaymentsEnabled, false);
  assert.equal(spento.state, "disabled");
});

test("spegnere il servizio non cancella l'account presso il PSP", async () => {
  fake.rows("clubPaymentAccount").push({
    id: "cpa-1",
    organization_id: CLUB,
    provider: "stripe",
    external_account_id: "acct_1",
    account_type: "standard",
    status: "active",
    charges_enabled: true,
    payouts_enabled: true,
    requirements: [],
    online_payments_enabled: true,
  });

  const spento = await accounts.setClubOnlinePaymentsEnabled({
    organizationId: CLUB,
    enabled: false,
  });

  assert.equal(spento.externalAccountId, "acct_1");
  assert.equal(
    spento.state,
    "disabled",
    "deve essere reversibile senza rifare l'onboarding",
  );
});

test("riaccendere il servizio riporta allo stato che diceva il PSP", async () => {
  fake.rows("clubPaymentAccount").push({
    id: "cpa-1",
    organization_id: CLUB,
    provider: "stripe",
    external_account_id: "acct_1",
    account_type: "standard",
    status: "disabled",
    charges_enabled: true,
    payouts_enabled: true,
    requirements: [],
    online_payments_enabled: false,
  });

  const acceso = await accounts.setClubOnlinePaymentsEnabled({
    organizationId: CLUB,
    enabled: true,
  });

  assert.equal(acceso.state, "active");
});

test("l'account connesso si ritrova dal suo identificativo", async () => {
  fake.rows("clubPaymentAccount").push({
    id: "cpa-1",
    organization_id: CLUB,
    external_account_id: "acct_alfa",
  });

  assert.equal(
    await accounts.findOrganizationByExternalAccount("acct_alfa"),
    CLUB,
  );
  assert.equal(
    await accounts.findOrganizationByExternalAccount("acct_sconosciuto"),
    null,
  );
});

test("senza credenziali sull'ambiente non si apre nessun collegamento", async () => {
  /*
    Nel repository non ci sono credenziali Stripe e non se ne inventano: il
    tentativo deve fallire con «non configurato», che e un problema di
    ambiente e non del club.
  */
  await assert.rejects(
    () =>
      accounts.startConnectOnboarding({
        organizationId: CLUB,
        clubName: "Fortitudo Scauri",
        email: "info@example.it",
        returnUrl: "https://easygame.test/organization",
        refreshUrl: "https://easygame.test/organization",
      }),
    /non e configurato/i,
  );
});

/* ------------------------------------- l'invariante sulle rotte di piattaforma */

test("le rotte commerciali sono riservate a chi amministra la piattaforma", () => {
  const rotte = [
    "src/app/api/v1/platform/payments/route.ts",
    "src/app/api/v1/entitlements/route.ts",
  ];

  for (const rotta of rotte) {
    const sorgente = fs.readFileSync(path.join(PROJECT_ROOT, rotta), "utf8");

    assert.match(
      sorgente,
      /isPlatformAdminUser\(/,
      `${rotta} deve ricavare il ruolo dalla sessione`,
    );

    assert.doesNotMatch(
      sorgente,
      /body\.(isPlatformAdmin|is_platform_admin)/,
      `${rotta}: se arrivasse dal corpo, chiunque potrebbe dichiararsi amministratore`,
    );
  }
});

test("nessuna rotta di club scrive le condizioni commerciali", () => {
  const commerciali = [
    "platform_commission_rules",
    "platformCommissionRule",
    "saveCommissionRule",
  ];

  const visita = (directory, trovati = []) => {
    for (const voce of fs.readdirSync(directory, { withFileTypes: true })) {
      const percorso = path.join(directory, voce.name);
      if (voce.isDirectory()) {
        visita(percorso, trovati);
        continue;
      }
      if (!/route\.ts$/.test(voce.name)) continue;

      const relativo = path
        .relative(PROJECT_ROOT, percorso)
        .split(path.sep)
        .join("/");

      if (relativo.includes("/api/v1/platform/")) continue;

      const sorgente = fs.readFileSync(percorso, "utf8");
      if (commerciali.some((token) => sorgente.includes(token))) {
        trovati.push(relativo);
      }
    }
    return trovati;
  };

  assert.deepEqual(
    visita(path.join(PROJECT_ROOT, "src/app/api")),
    [],
    "le condizioni commerciali si scrivono solo dalla console di piattaforma",
  );
});
