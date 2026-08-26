import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Il piano di un club esce dalle mani del club (D37, R-18, ADR-0048).
 *
 * **Il difetto che questi test impediscono di riaprire.** Piano, stato
 * dell'abbonamento e servizi aggiuntivi stavano in `clubs.settings`, e
 * `clubs.settings` si scrive dalla pagina Organizzazione. Finche quello
 * strato **descriveva** non era sfruttabile; il giorno in cui nega qualcosa,
 * un club si concede il piano superiore da solo. Nascondere i campi
 * nell'interfaccia non basta: la scrittura passa da `PATCH /api/v1/clubs/:id`
 * e la stessa richiesta la puo rifare chiunque a mano. La regola sta dove il
 * dato viene scritto, e questi test la provano li.
 *
 * **Il secondo difetto, trovato scrivendo il primo.** Il calcolo leggeva
 * `settings.subscriptionSettings`; la pagina scriveva `settings.subscription`.
 * Nessun club aveva quindi il piano che credeva di avere — e il test che
 * avrebbe dovuto accorgersene seminava a sua volta `subscriptionSettings`,
 * cioe provava la stessa cosa sbagliata.
 */

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");
const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";

let ownership;
let entitlements;
let resources;
let setPrismaClientForTests;
let fake;

before(async () => {
  ownership = await import("../../src/lib/entitlements/ownership.ts");
  entitlements = await import("../../src/lib/server/entitlements.ts");
  resources = await import("../../src/lib/server/resources.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const seed = () => ({
  club: [
    {
      id: CLUB,
      name: "ASD Prova",
      settings: {
        subscription: { plan: "free", status: "not_active" },
        extraServices: [
          {
            key: "sms_notifications",
            enabled: false,
            billingStatus: "not_active",
          },
        ],
        seasons: [{ id: "s1", label: "2025/26" }],
      },
    },
  ],
  clubResourceItem: [],
  auditLog: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const scope = () => ({
  userId: "utente-del-club",
  activeOrganizationId: CLUB,
  allowedOrganizationIds: [CLUB],
});

const settingsOf = () =>
  fake.rows("club").find((row) => row.id === CLUB).settings;

/* ------------------------------------------------ la funzione pura */

test("cio che il club rimanda indietro invariato non e un tentativo", () => {
  const esito = ownership.withPlatformOwnedSettings(
    { subscription: { plan: "plus" }, city: "Roma" },
    { subscription: { plan: "plus" }, city: "Milano" },
    {},
  );

  assert.deepEqual(esito.rejectedKeys, []);
  assert.equal(
    esito.settings.city,
    "Milano",
    "cio che il club possiede deve poter cambiare",
  );
});

test("un piano diverso da quello che c'e viene ignorato e dichiarato", () => {
  const esito = ownership.withPlatformOwnedSettings(
    { subscription: { plan: "free" } },
    { subscription: { plan: "plus" } },
    {},
  );

  assert.deepEqual(esito.settings.subscription, { plan: "free" });
  assert.deepEqual(esito.rejectedKeys, ["subscription"]);
});

test("chi amministra la piattaforma scrive quello che vuole", () => {
  const esito = ownership.withPlatformOwnedSettings(
    { subscription: { plan: "free" } },
    { subscription: { plan: "plus" } },
    { isPlatformAdmin: true },
  );

  assert.deepEqual(esito.settings.subscription, { plan: "plus" });
  assert.deepEqual(esito.rejectedKeys, []);
});

test("le quattro chiavi protette sono quattro, e le eccezioni sono fra queste", () => {
  assert.deepEqual(
    [...ownership.PLATFORM_OWNED_SETTINGS_KEYS],
    ["subscription", "subscriptionSettings", "extraServices", "entitlements"],
  );

  const esito = ownership.withPlatformOwnedSettings(
    {},
    { entitlements: { overrides: { online_payments: true } } },
    {},
  );

  assert.equal(
    esito.settings.entitlements,
    undefined,
    "un'eccezione non si concede scrivendo le impostazioni del club",
  );
  assert.deepEqual(esito.rejectedKeys, ["entitlements"]);
});

/* -------------------------------------- la chiave da cui si legge */

test("il piano si legge dalla chiave che la pagina Organizzazione scrive", () => {
  assert.deepEqual(
    ownership.readSubscriptionSettingsSource({
      subscription: { plan: "plus" },
    }),
    { plan: "plus" },
  );

  assert.deepEqual(
    ownership.readSubscriptionSettingsSource({
      subscriptionSettings: { plan: "plus" },
    }),
    { plan: "plus" },
    "la chiave storica resta leggibile",
  );
});

test("un club in Plus attivo vede le funzioni del piano", async () => {
  settingsOf().subscription = { plan: "plus", status: "active" };

  const { entitlements: esito } = await entitlements.loadClubEntitlements({
    organizationId: CLUB,
  });

  assert.equal(
    esito.has("online_payments"),
    true,
    "prima di ADR-0048 questa lettura falliva: il calcolo guardava un'altra chiave",
  );
});

/* --------------------------------------- la scrittura dal club */

test("un club non si puo mettere in Plus da solo", async () => {
  await resources.updateResource(
    "clubs",
    CLUB,
    {
      settings: {
        ...settingsOf(),
        subscription: { plan: "plus", status: "active" },
      },
    },
    scope(),
  );

  const settings = settingsOf();
  assert.equal(settings.subscription.plan, "free");
  assert.equal(settings.subscription.status, "not_active");
});

test("il tentativo resta scritto nell'audit come diniego", async () => {
  await resources.updateResource(
    "clubs",
    CLUB,
    {
      settings: {
        ...settingsOf(),
        subscription: { plan: "plus", status: "active" },
      },
    },
    scope(),
  );

  const righe = fake.rows("auditLog");
  assert.equal(
    righe.length,
    1,
    "un tentativo di cambiarsi il piano va letto dopo",
  );
  assert.equal(righe[0].outcome, "denied");
  assert.equal(righe[0].resource, "club_plan");
});

test("il club continua a salvare cio che gli appartiene", async () => {
  await resources.updateResource(
    "clubs",
    CLUB,
    {
      settings: {
        ...settingsOf(),
        city: "Latina",
        subscription: { plan: "plus", status: "active" },
      },
    },
    scope(),
  );

  const settings = settingsOf();
  assert.equal(settings.city, "Latina", "il recapito si salva lo stesso");
  assert.equal(
    settings.seasons.length,
    1,
    "la guardia non porta via cio che non stava guardando",
  );
  assert.equal(settings.subscription.plan, "free");
});

test("un club non si attiva da solo un servizio aggiuntivo", async () => {
  await resources.updateResource(
    "clubs",
    CLUB,
    {
      settings: {
        ...settingsOf(),
        extraServices: [
          { key: "sms_notifications", enabled: true, billingStatus: "active" },
        ],
      },
    },
    scope(),
  );

  assert.equal(settingsOf().extraServices[0].enabled, false);
});

test("un club non nasce in Plus", async () => {
  const creato = await resources.createResource(
    "clubs",
    {
      name: "ASD Furba",
      settings: { subscription: { plan: "plus", status: "active" } },
    },
    "create",
    {
      userId: "chi-crea",
      activeOrganizationId: null,
      allowedOrganizationIds: [],
    },
  );

  const riga = fake.rows("club").find((row) => row.id === creato.id);
  assert.equal(
    riga.settings.subscription,
    undefined,
    "il piano di un club nuovo lo assegna la piattaforma, non chi lo crea",
  );
});

/* ------------------------------- la scrittura dalla piattaforma */

test("la piattaforma assegna il piano, e il club lo legge", async () => {
  await entitlements.setClubPlan({
    organizationId: CLUB,
    plan: "plus",
    status: "active",
  });

  const { entitlements: esito } = await entitlements.loadClubEntitlements({
    organizationId: CLUB,
  });

  assert.equal(esito.plan, "plus");
  assert.equal(esito.effectivePlan, "plus");
  assert.equal(esito.has("online_payments"), true);
  assert.equal(
    settingsOf().seasons.length,
    1,
    "scrivere il piano non porta via il resto delle impostazioni",
  );
});

test("un abbonamento disdetto riporta il club al livello di base", async () => {
  await entitlements.setClubPlan({
    organizationId: CLUB,
    plan: "plus",
    status: "cancelled",
  });

  const { entitlements: esito } = await entitlements.loadClubEntitlements({
    organizationId: CLUB,
  });

  assert.equal(esito.plan, "plus", "il piano scritto resta quello");
  assert.equal(esito.effectivePlan, "free");
  assert.equal(
    esito.explain("online_payments").reason,
    "subscription_inactive",
  );
});

test("la piattaforma attiva e disdice un servizio, e la differenza si vede", async () => {
  await entitlements.setClubExtraService({
    organizationId: CLUB,
    key: "sms_notifications",
    enabled: true,
  });

  let esito = (
    await entitlements.loadClubEntitlements({ organizationId: CLUB })
  ).entitlements;
  assert.equal(esito.has("sms_notifications"), true);

  await entitlements.setClubExtraService({
    organizationId: CLUB,
    key: "sms_notifications",
    enabled: false,
  });

  esito = (await entitlements.loadClubEntitlements({ organizationId: CLUB }))
    .entitlements;
  assert.equal(esito.has("sms_notifications"), false);
  assert.equal(
    settingsOf().extraServices.find(
      (service) => service.key === "sms_notifications",
    ).billingStatus,
    "cancelled",
    "«mai attivato» e «non piu pagato» restano due stati diversi",
  );
});

test("un servizio inventato non si attiva", async () => {
  await assert.rejects(
    () =>
      entitlements.setClubExtraService({
        organizationId: CLUB,
        key: "accesso_totale",
        enabled: true,
      }),
    /non riconosciuto/,
  );
});

/* ---------------------------------------------- l'interfaccia */

const readFile = (relative) =>
  fs.readFileSync(path.join(PROJECT_ROOT, relative), "utf8");

test("la pagina Organizzazione non offre piu di scegliere il piano", () => {
  const page = readFile("src/app/organization/page.tsx");

  assert.match(
    page,
    /<ClubBillingSettings[\s\S]{0,240}readOnly/,
    "il pannello di fatturazione va montato in sola lettura",
  );
  assert.doesNotMatch(
    page,
    /onSubscriptionChange=|onExtraServicesChange=/,
    "nessun canale di modifica del piano dalla pagina del club",
  );
  assert.doesNotMatch(
    page,
    /subscription: normalized|extraServices: normalized/,
    "il salvataggio del club non deve rimandare piano e servizi",
  );
});

test("il piano si cambia dalla console di piattaforma", () => {
  const consoleSection = readFile(
    "src/components/platform-admin/club-services-section.tsx",
  );

  assert.match(consoleSection, /operation: "plan"/);
  assert.match(consoleSection, /operation: "service"/);
});

/* ------------------------------------------------- il gating vero */

test("una funzione non compresa nel piano viene negata con il suo motivo", async () => {
  await assert.rejects(
    () =>
      entitlements.requireClubEntitlement({
        organizationId: CLUB,
        key: "online_payments",
      }),
    (error) => {
      assert.match(
        error.message,
        /Accesso negato/,
        "il prefisso e cio che il route handler usa per rispondere 403",
      );
      assert.doesNotMatch(
        error.message,
        /Accesso negato\.?$/,
        "un diniego che non dice cosa fare finisce al telefono",
      );
      return true;
    },
  );
});

test("assegnato il piano, la stessa funzione passa", async () => {
  await entitlements.setClubPlan({
    organizationId: CLUB,
    plan: "plus",
    status: "active",
  });

  const verdetto = await entitlements.requireClubEntitlement({
    organizationId: CLUB,
    key: "online_payments",
  });

  assert.equal(verdetto.allowed, true);
  assert.equal(verdetto.reason, "included_in_plan");
});

test("chi amministra la piattaforma non resta fuori dal club che assiste", async () => {
  const verdetto = await entitlements.requireClubEntitlement({
    organizationId: CLUB,
    key: "online_payments",
    isPlatformAdmin: true,
  });

  assert.equal(verdetto.reason, "platform_admin");
});

test("le rotte che negano una funzione la chiedono a un posto solo", () => {
  const rotte = [
    "src/app/api/payments/create-checkout-session/route.ts",
    "src/app/api/v1/funding/programs/route.ts",
    "src/app/api/v1/forms/route.ts",
  ];

  for (const rotta of rotte) {
    assert.match(
      readFile(rotta),
      /requireClubEntitlement\(/,
      `${rotta} deve chiedere l'entitlement invece di leggere il piano da sola`,
    );
  }
});

test("nessuna schermata decide da sola guardando il piano", () => {
  const sospetti = [];
  const visita = (directory) => {
    for (const voce of fs.readdirSync(directory, { withFileTypes: true })) {
      const percorso = path.join(directory, voce.name);
      if (voce.isDirectory()) {
        visita(percorso);
        continue;
      }
      if (!/\.tsx?$/.test(voce.name)) continue;

      const relativo = path
        .relative(PROJECT_ROOT, percorso)
        .split(path.sep)
        .join("/");

      /*
        Il calcolo, il catalogo, la console di piattaforma e la pagina che
        mostra il piano in sola lettura possono nominare i piani: sono i posti
        in cui il concetto vive. Tutti gli altri devono chiedere `has(...)`.
      */
      if (
        relativo.startsWith("src/lib/entitlements/") ||
        relativo.startsWith("src/lib/payments/") ||
        relativo.startsWith("src/lib/server/entitlements") ||
        /*
          Il billing di piattaforma traduce lo stato di una sottoscrizione
          Stripe nel piano di una societa: e il posto in cui quella
          traduzione **deve** avvenire, e l'unico che la scrive (ADR-0051).
        */
        relativo.startsWith("src/lib/server/platform-billing") ||
        relativo.includes("platform-admin") ||
        relativo.includes("ClubSubscriptionPanel") ||
        relativo.includes("HubExtraServicesPanel")
      ) {
        continue;
      }

      const contenuto = fs.readFileSync(percorso, "utf8");
      if (/(plan|piano)\s*===\s*["']plus["']/.test(contenuto)) {
        sospetti.push(relativo);
      }
    }
  };

  visita(path.join(PROJECT_ROOT, "src"));

  assert.deepEqual(
    sospetti,
    [],
    "un `plan === \"plus\"` sparso e il modo in cui il gating smette di essere governabile",
  );
});
