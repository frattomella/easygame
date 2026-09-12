import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **`training_automation.manage` protegge anche la porta generica** (WP-19,
 * chiude un reperto dell'audit ostile del mandato).
 *
 * Le due rotte dedicate (`/api/v1/training-automation`,
 * `.../schedule-impact`) chiedevano gia la chiave. Restava scrivibile senza
 * alcun controllo `settings.trainingAutomation` — dove vivono l'interruttore
 * "Automazione attiva" e le sospensioni (WP-15) — tramite
 * `PATCH /api/v1/clubs/:id`, la stessa porta generica su cui ADR-0153 aveva
 * gia chiuso il caso identico per `seasons.change`.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000099";

const scope = (activeRole) => ({
  userId: "user-a",
  activeOrganizationId: CLUB,
  activeRole,
  allowedOrganizationIds: [CLUB],
});

let resources;
let encodeCustomRoleToken;
let setPrismaClientForTests;
let fake;

const settingsIniziali = () => ({
  companyEmail: "club@example.com",
  trainingAutomation: { enabled: false, generateDaysAhead: 21, exclusions: [] },
});

const seed = () => ({
  club: [
    {
      id: CLUB,
      slug: "club-a",
      name: "Club A",
      settings: settingsIniziali(),
    },
  ],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  resources = await import("../../src/lib/server/resources.ts");
  ({ encodeCustomRoleToken } = await import("../../src/lib/access-roles.ts"));
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const leggiSettings = async (ruolo) => {
  const record = await resources.getResourceById("clubs", CLUB, scope(ruolo));
  return record?.settings || {};
};

test("owner puo attivare/sospendere l'automazione dalla rotta generica", async () => {
  const current = await leggiSettings("owner");

  await resources.updateResource(
    "clubs",
    CLUB,
    {
      settings: {
        ...current,
        trainingAutomation: { ...current.trainingAutomation, enabled: true },
      },
    },
    scope("owner"),
  );

  const dopo = await leggiSettings("owner");
  assert.equal(dopo.trainingAutomation.enabled, true);
});

test("un ruolo personalizzato SENZA training_automation.manage non puo toccare settings.trainingAutomation dalla rotta generica", async () => {
  const senzaChiave = encodeCustomRoleToken("custom:club_manager:segreteria", [
    "events.read",
  ]);
  const current = await leggiSettings(senzaChiave);

  await assert.rejects(
    () =>
      resources.updateResource(
        "clubs",
        CLUB,
        {
          settings: {
            ...current,
            trainingAutomation: { ...current.trainingAutomation, enabled: true },
          },
        },
        scope(senzaChiave),
      ),
    /Accesso negato/,
  );

  const dopo = await leggiSettings("owner");
  assert.equal(
    dopo.trainingAutomation.enabled,
    false,
    "la scrittura rifiutata non deve comunque essere applicata",
  );
});

test("un ruolo personalizzato CON training_automation.manage puo toccare settings.trainingAutomation dalla rotta generica", async () => {
  const conChiave = encodeCustomRoleToken(
    "custom:club_manager:segreteria-allenamenti",
    ["events.read", "training_automation.manage"],
  );
  const current = await leggiSettings(conChiave);

  await resources.updateResource(
    "clubs",
    CLUB,
    {
      settings: {
        ...current,
        trainingAutomation: {
          ...current.trainingAutomation,
          exclusions: [{ id: "natale", from: "2026-12-23", to: "2027-01-06" }],
        },
      },
    },
    scope(conChiave),
  );

  const dopo = await leggiSettings("owner");
  assert.equal(dopo.trainingAutomation.exclusions.length, 1);
});

test("un ruolo senza la chiave puo comunque modificare altre sezioni di settings, non toccando trainingAutomation", async () => {
  const senzaChiave = encodeCustomRoleToken("custom:club_manager:segreteria", [
    "events.read",
  ]);
  const current = await leggiSettings(senzaChiave);

  await resources.updateResource(
    "clubs",
    CLUB,
    { settings: { ...current, companyEmail: "nuova@example.com" } },
    scope(senzaChiave),
  );

  const dopo = await leggiSettings("owner");
  assert.equal(dopo.companyEmail, "nuova@example.com");
});
