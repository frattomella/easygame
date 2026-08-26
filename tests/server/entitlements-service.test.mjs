import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Gli entitlement letti dal database.
 *
 * Il calcolo e provato altrove, senza database. Qui si prova la meta noiosa:
 * che i dati vengano presi **sempre dagli stessi campi**, e che scrivere
 * un'eccezione non porti via il resto delle impostazioni del club — che e il
 * modo classico in cui una scrittura su un campo JSON cancella cio che non
 * stava guardando.
 */

const CLUB_CON = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_SENZA = "bbbbbbbb-0000-4000-8000-000000000002";

let entitlements;
let setPrismaClientForTests;
let fake;

before(async () => {
  entitlements = await import("../../src/lib/server/entitlements.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const seed = () => ({
  club: [
    {
      id: CLUB_CON,
      name: "ASD Con Servizi",
      settings: {
        subscriptionSettings: { plan: "plus", status: "active" },
        extraServices: [
          {
            key: "sms_notifications",
            enabled: true,
            billingStatus: "active",
          },
        ],
        seasons: [{ id: "s1", label: "2025/26" }],
      },
    },
    {
      id: CLUB_SENZA,
      name: "ASD Senza Servizi",
      settings: {
        subscriptionSettings: { plan: "free", status: "not_active" },
        extraServices: [],
      },
    },
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const settingsOf = (id) =>
  fake.rows("club").find((row) => row.id === id).settings;

/* -------------------------------------------------- club con e senza */

test("un club con il piano e i servizi vede cio che ha comprato", async () => {
  const { entitlements: esito } = await entitlements.loadClubEntitlements({
    organizationId: CLUB_CON,
  });

  assert.equal(esito.has("online_payments"), true);
  assert.equal(esito.has("sms_notifications"), true);
});

test("un club senza piano non vede cio che non ha comprato", async () => {
  const { entitlements: esito } = await entitlements.loadClubEntitlements({
    organizationId: CLUB_SENZA,
  });

  assert.equal(esito.has("online_payments"), false);
  assert.equal(esito.has("sms_notifications"), false);
  assert.equal(
    esito.has("forms_v2"),
    true,
    "cio che e sempre stato disponibile resta disponibile",
  );
});

test("un servizio disdetto non tiene accesa la funzione", async () => {
  settingsOf(CLUB_CON).extraServices = [
    { key: "sms_notifications", enabled: true, billingStatus: "cancelled" },
  ];

  const { entitlements: esito } = await entitlements.loadClubEntitlements({
    organizationId: CLUB_CON,
  });

  assert.equal(esito.has("sms_notifications"), false);
});

test("chi amministra la piattaforma vede anche il club senza servizi", async () => {
  const { entitlements: esito } = await entitlements.loadClubEntitlements({
    organizationId: CLUB_SENZA,
    isPlatformAdmin: true,
  });

  assert.equal(esito.has("online_payments"), true);
  assert.equal(
    esito.explain("online_payments").reason,
    "platform_admin",
    "l'assistenza deve sapere che il club non ce l'ha davvero",
  );
});

/* ------------------------------------------------------- le eccezioni */

test("un'eccezione concessa arriva fino al club", async () => {
  await entitlements.setClubEntitlementOverride({
    organizationId: CLUB_SENZA,
    key: "online_payments",
    value: true,
  });

  const { entitlements: esito } = await entitlements.loadClubEntitlements({
    organizationId: CLUB_SENZA,
  });

  assert.equal(esito.has("online_payments"), true);
  assert.equal(esito.explain("online_payments").reason, "granted_by_platform");
});

test("togliere l'eccezione riporta alla regola del listino", async () => {
  await entitlements.setClubEntitlementOverride({
    organizationId: CLUB_SENZA,
    key: "online_payments",
    value: true,
  });
  await entitlements.setClubEntitlementOverride({
    organizationId: CLUB_SENZA,
    key: "online_payments",
    value: null,
  });

  const { entitlements: esito } = await entitlements.loadClubEntitlements({
    organizationId: CLUB_SENZA,
  });

  assert.equal(
    esito.has("online_payments"),
    false,
    "«togli» e «vieta» sono due cose diverse: senza la distinzione, «rimetti com'era» non esiste",
  );
});

test("scrivere un'eccezione non porta via il resto delle impostazioni", async () => {
  await entitlements.setClubEntitlementOverride({
    organizationId: CLUB_CON,
    key: "sms_notifications",
    value: false,
  });

  const settings = settingsOf(CLUB_CON);
  assert.equal(settings.seasons.length, 1, "le stagioni non c'entrano niente");
  assert.equal(settings.subscriptionSettings.plan, "plus");
  assert.deepEqual(settings.entitlements.overrides, {
    sms_notifications: false,
  });
});

test("una funzione inventata non si puo concedere", async () => {
  await assert.rejects(
    () =>
      entitlements.setClubEntitlementOverride({
        organizationId: CLUB_CON,
        key: "accesso_totale",
        value: true,
      }),
    /non riconosciuta/,
  );
});

/* ---------------------------------------------------------- i confini */

test("senza club non si legge e non si scrive niente", async () => {
  await assert.rejects(
    () => entitlements.loadClubEntitlements({ organizationId: "" }),
    /Accesso negato/,
  );
  await assert.rejects(
    () =>
      entitlements.setClubEntitlementOverride({
        organizationId: "",
        key: "forms_v2",
        value: true,
      }),
    /Accesso negato/,
  );
});

test("un club che non esiste non produce entitlement vuoti ma un errore", async () => {
  await assert.rejects(
    () =>
      entitlements.loadClubEntitlements({
        organizationId: "cccccccc-0000-4000-8000-000000000003",
      }),
    /non trovato/,
  );
});
