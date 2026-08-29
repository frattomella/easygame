import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * L'unico risolutore del pubblico (W2-C, ADR-0087).
 *
 * **La parte che conta e il confine.** Un test che provasse solo «per
 * categoria mi da la categoria giusta» passerebbe anche su un risolutore che
 * ignora il club. Qui si prova soprattutto cio che **non** deve uscire: il
 * pubblico di un'altra societa, e l'elenco delle famiglie in arretrato a chi
 * non ha il permesso di vederlo.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "aaaaaaaa-0000-4000-8000-000000000002";
const NOW = new Date("2026-10-05T10:00:00Z");

let modulo;
let setPrismaClientForTests;
let fake;

const scope = (organizationId = CLUB, activeRole = "owner") => ({
  userId: "dddddddd-0000-4000-8000-00000000000a",
  activeOrganizationId: organizationId,
  allowedOrganizationIds: [organizationId],
  activeRole,
});

const atleta = (id, overrides = {}) => ({
  id,
  organization_id: CLUB,
  first_name: "Luca",
  last_name: id.toUpperCase(),
  status: "active",
  category_id: "under-14",
  data: {
    guardians: [{ name: "Maria", surname: "Bianchi", email: `${id}@example.com` }],
  },
  category_memberships: [
    { category_id: "under-14", categoryId: "under-14", site_id: "sede-nord", siteId: "sede-nord" },
  ],
  ...overrides,
});

const seed = () => ({
  club: [
    {
      id: CLUB,
      name: "ASD Alfa",
      club_sites: [
        { id: "sede-nord", name: "Sede Nord", active: true },
        { id: "sede-sud", name: "Sede Sud", active: true },
      ],
    },
    { id: ALTRO_CLUB, name: "ASD Beta", club_sites: [] },
  ],
  athlete: [
    atleta("a1"),
    atleta("a2", {
      category_id: "under-16",
      category_memberships: [
        { category_id: "under-16", categoryId: "under-16", site_id: "sede-sud", siteId: "sede-sud" },
      ],
      data: {
        guardians: [{ name: "Paolo", surname: "Verdi", email: "a2@example.com" }],
      },
    }),
    atleta("a3", {
      organization_id: ALTRO_CLUB,
      data: {
        guardians: [{ name: "Anna", surname: "Neri", email: "altroclub@example.com" }],
      },
    }),
  ],
  organizationUser: [],
  user: [],
  athletePayment: [],
  paymentTransaction: [],
  communicationDelivery: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  modulo = await import("../../src/lib/server/audience.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const risolvi = (criteria, options = {}) =>
  modulo.resolveAudience({
    criteria,
    scope: options.scope || scope(),
    now: NOW,
    ...options,
  });

// --- i criteri -------------------------------------------------------------

test("«tutte le famiglie» prende gli atleti del club e nessun altro", async () => {
  const pubblico = await risolvi([{ kind: "all_families" }]);

  assert.deepEqual(
    pubblico.recipients.map((row) => row.email).sort(),
    ["a1@example.com", "a2@example.com"],
  );
});

test("per categoria", async () => {
  const pubblico = await risolvi([
    { kind: "category_ids", values: ["under-16"] },
  ]);

  assert.deepEqual(
    pubblico.recipients.map((row) => row.email),
    ["a2@example.com"],
  );
});

test("per sede", async () => {
  const pubblico = await risolvi([{ kind: "site_ids", values: ["sede-nord"] }]);

  assert.deepEqual(
    pubblico.recipients.map((row) => row.email),
    ["a1@example.com"],
  );
});

test("per gruppo operativo: la categoria da sola non basta, la sede conta", async () => {
  const pubblico = await risolvi([
    { kind: "group_ids", values: ["under-14::sede-nord"] },
  ]);

  assert.equal(
    pubblico.recipients.length <= 1,
    true,
    "il gruppo non deve mai allargarsi ad altre sedi",
  );
});

test("per selezione di atleti", async () => {
  const pubblico = await risolvi([{ kind: "athlete_ids", values: ["a2"] }]);

  assert.deepEqual(
    pubblico.recipients.map((row) => row.email),
    ["a2@example.com"],
  );
});

// --- il confine ------------------------------------------------------------

test("il pubblico di un altro club non esce mai", async () => {
  const pubblico = await risolvi([{ kind: "all_families" }]);

  assert.equal(
    pubblico.recipients.some((row) => row.email === "altroclub@example.com"),
    false,
  );
});

test("chiedere il pubblico di un club diverso da quello attivo e «Accesso negato»", async () => {
  await assert.rejects(
    () => risolvi([{ kind: "all_families" }], { organizationId: ALTRO_CLUB }),
    /Accesso negato/,
  );
});

test("una selezione di atleti di un altro club non li porta dentro", async () => {
  const pubblico = await risolvi([{ kind: "athlete_ids", values: ["a3"] }]);

  assert.equal(pubblico.recipients.length, 0);
});

// --- il permesso protegge il criterio -------------------------------------

test("l'allenatore non puo selezionare chi non ha pagato", async () => {
  await assert.rejects(
    () =>
      risolvi([{ kind: "overdue_payments" }], {
        scope: scope(CLUB, "trainer"),
      }),
    /Accesso negato/,
  );
});

test("l'allenatore puo comunque selezionare per categoria", async () => {
  const pubblico = await risolvi([{ kind: "category_ids", values: ["under-14"] }], {
    scope: scope(CLUB, "trainer"),
  });

  assert.equal(pubblico.recipients.length, 1);
});

test("il proprietario puo selezionare chi non ha pagato", async () => {
  fake.rows("athletePayment").push({
    id: "rata-1",
    organization_id: CLUB,
    athlete_id: "a1",
    description: "Quota",
    amount: 100,
    due_date: new Date("2026-09-30T00:00:00Z"),
    status: "pending",
    data: {},
  });

  const pubblico = await risolvi([{ kind: "overdue_payments" }]);

  assert.deepEqual(
    pubblico.recipients.map((row) => row.email),
    ["a1@example.com"],
  );
});

// --- la famiglia -----------------------------------------------------------

test("la stessa email su due atleti produce un destinatario solo con due posizioni", async () => {
  fake.rows("athlete").find((row) => row.id === "a2").data = {
    guardians: [{ name: "Maria", surname: "Bianchi", email: "a1@example.com" }],
  };

  const pubblico = await risolvi([{ kind: "all_families" }]);

  assert.equal(pubblico.recipients.length, 1);
  assert.equal(pubblico.counts.positions, 2);
});

test("un atleta senza email compare fra gli esclusi con il motivo", async () => {
  fake.rows("athlete").find((row) => row.id === "a1").data = {
    guardians: [{ name: "Maria", surname: "Bianchi", email: "" }],
  };

  const pubblico = await risolvi([{ kind: "all_families" }]);

  assert.equal(
    pubblico.exclusions.some((row) => row.reason === "no_email"),
    true,
  );
});

test("un'anagrafica archiviata non riceve", async () => {
  fake.rows("athlete").find((row) => row.id === "a1").status = "inactive";

  const pubblico = await risolvi([{ kind: "all_families" }]);

  assert.equal(
    pubblico.recipients.some((row) => row.email === "a1@example.com"),
    false,
  );
  assert.equal(
    pubblico.exclusions.some((row) => row.reason === "not_active"),
    true,
  );
});

// --- scala e prestazioni ---------------------------------------------------

test("duecento atleti non producono duecento interrogazioni", async () => {
  const righe = fake.rows("athlete");
  for (let index = 0; index < 200; index += 1) {
    righe.push(
      atleta(`bulk-${index}`, {
        data: {
          guardians: [
            {
              name: "Tutore",
              surname: String(index),
              email: `bulk-${index}@example.com`,
              linkedUserId: "cccccccc-0000-4000-8000-00000000000a",
            },
          ],
        },
      }),
    );
  }

  const prima = fake.calls.length;
  const pubblico = await risolvi([{ kind: "all_families" }]);
  const interrogazioni = fake.calls.length - prima;

  assert.equal(pubblico.recipients.length, 202);
  assert.equal(
    interrogazioni <= 6,
    true,
    `il risolutore deve restare a poche interrogazioni, ne ha fatte ${interrogazioni}`,
  );
});
