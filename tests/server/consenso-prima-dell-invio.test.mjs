import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Il consenso, prima dell'invio** (Wave 6, §15.2).
 *
 * Il presidio che la Wave 5 aveva dichiarato e mai scritto: quindici percorsi
 * di invio su quindici ignoravano il registro dei consensi, e il motivo di
 * esclusione `consent_revoked` non compariva in nessuna riga del repository.
 *
 * **Cio che conta di piu qui e la meta che deve passare.** Una revoca del
 * consenso promozionale non puo spegnere il sollecito di una rata ne la
 * verifica di un indirizzo email: il default e che si manda, e il consenso
 * governa una classe sola.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const DEFINIZIONE = "cccccccc-0000-4000-8000-000000000001";
const VERSIONE = "cccccccc-0000-4000-8000-0000000000v1";

let audience;
let setPrismaClientForTests;
let fake;

const scope = () => ({
  userId: "dddddddd-0000-4000-8000-00000000000a",
  activeOrganizationId: CLUB,
  allowedOrganizationIds: [CLUB],
  activeRole: "owner",
});

const atleta = (id) => ({
  id,
  organization_id: CLUB,
  first_name: "Luca",
  last_name: id.toUpperCase(),
  status: "active",
  category_id: "under-14",
  data: {
    guardians: [{ name: "Maria", surname: "Bianchi", email: `${id}@example.com` }],
  },
  category_memberships: [],
});

const decisione = (id, athleteId, status, decidedAt) => ({
  id,
  organization_id: CLUB,
  definition_id: DEFINIZIONE,
  version_id: VERSIONE,
  subject_kind: "athlete",
  subject_id: athleteId,
  subject_label: null,
  status,
  decided_at: new Date(decidedAt),
  decided_by: null,
  source: "manual",
  evidence_kind: null,
  evidence_id: null,
  note: null,
  created_at: new Date(decidedAt),
});

const seed = ({ definitionStatus = "active", records = [] } = {}) => ({
  club: [{ id: CLUB, name: "ASD Alfa", club_sites: [] }],
  athlete: [atleta("a1"), atleta("a2"), atleta("a3")],
  organizationUser: [],
  user: [],
  athletePayment: [],
  paymentTransaction: [],
  communicationDelivery: [],
  consentDefinition: [
    {
      id: DEFINIZIONE,
      organization_id: CLUB,
      key: "marketing",
      title: "Comunicazioni promozionali",
      description: null,
      required: false,
      status: definitionStatus,
      published_version: 1,
      created_by: null,
      created_at: new Date("2026-01-01T00:00:00Z"),
      updated_at: new Date("2026-01-01T00:00:00Z"),
    },
  ],
  consentVersion: [
    {
      id: VERSIONE,
      organization_id: CLUB,
      definition_id: DEFINIZIONE,
      version: 1,
      published_at: new Date("2026-01-01T00:00:00Z"),
    },
  ],
  consentRecord: records,
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  audience = await import("../../src/lib/server/audience.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const monta = (options) => {
  fake = createFakePrisma(seed(options));
  setPrismaClientForTests(fake.client);
};

beforeEach(() => monta());

const risolvi = (options = {}) =>
  audience.resolveAudience({
    criteria: [{ kind: "all_families" }],
    scope: scope(),
    now: new Date("2026-10-05T10:00:00Z"),
    ...options,
  });

test("senza chiave di consenso il registro non viene nemmeno letto", async () => {
  monta({
    records: [decisione("r1", "a2", "revoked", "2026-05-01T10:00:00Z")],
  });

  const pubblico = await risolvi();

  assert.deepEqual(
    pubblico.recipients.map((row) => row.email).sort(),
    ["a1@example.com", "a2@example.com", "a3@example.com"],
  );
  assert.equal(pubblico.appliedConsentKey, null);
  assert.equal(
    fake.calls.some((call) => call.delegate === "consentDefinition"),
    false,
    "una comunicazione non governata non deve interrogare i consensi",
  );
});

test("una revoca esclude dal pubblico di una comunicazione governata", async () => {
  monta({
    records: [
      decisione("r1", "a2", "accepted", "2026-02-01T10:00:00Z"),
      decisione("r2", "a2", "revoked", "2026-05-01T10:00:00Z"),
    ],
  });

  const pubblico = await risolvi({ requiredConsentKey: "marketing" });

  assert.deepEqual(
    pubblico.recipients.map((row) => row.email).sort(),
    ["a1@example.com", "a3@example.com"],
  );
  assert.deepEqual(
    pubblico.exclusions
      .filter((row) => row.reason === "consent_revoked")
      .map((row) => row.athleteId),
    ["a2"],
  );
  assert.equal(pubblico.appliedConsentKey, "marketing");
  /* Chi non e stato raggiunto non finisce nel registro delle consegne. */
  assert.deepEqual(pubblico.athleteIds.sort(), ["a1", "a3"]);
});

test("un diniego esclude come una revoca: l'esito e lo stesso", async () => {
  monta({
    records: [decisione("r1", "a3", "rejected", "2026-03-01T10:00:00Z")],
  });

  const pubblico = await risolvi({ requiredConsentKey: "marketing" });

  assert.deepEqual(
    pubblico.recipients.map((row) => row.email).sort(),
    ["a1@example.com", "a2@example.com"],
  );
});

test("una revoca **non** esclude da una comunicazione necessaria", async () => {
  monta({
    records: [decisione("r1", "a2", "revoked", "2026-05-01T10:00:00Z")],
  });

  const catalogo = await import("../../src/lib/consents/catalog.ts");

  const pubblico = await risolvi({
    /* E la stessa strada, con la chiave che la regola di prodotto restituisce. */
    requiredConsentKey: catalogo.consentKeyForCommunication("payment_reminder"),
  });

  assert.deepEqual(
    pubblico.recipients.map((row) => row.email).sort(),
    ["a1@example.com", "a2@example.com", "a3@example.com"],
  );
  assert.equal(pubblico.appliedConsentKey, null);
});

test("chi ha revocato e poi riaccettato torna nel pubblico", async () => {
  monta({
    records: [
      decisione("r1", "a2", "accepted", "2026-02-01T10:00:00Z"),
      decisione("r2", "a2", "revoked", "2026-05-01T10:00:00Z"),
      decisione("r3", "a2", "accepted", "2026-06-01T10:00:00Z"),
    ],
  });

  const pubblico = await risolvi({ requiredConsentKey: "marketing" });

  assert.equal(pubblico.recipients.length, 3);
});

test("una definizione non attiva non governa niente", async () => {
  monta({
    definitionStatus: "draft",
    records: [decisione("r1", "a2", "revoked", "2026-05-01T10:00:00Z")],
  });

  const pubblico = await risolvi({ requiredConsentKey: "marketing" });

  assert.equal(pubblico.recipients.length, 3);
  assert.equal(pubblico.appliedConsentKey, null);
});

test("una chiave che il club non ha definito non svuota il pubblico", async () => {
  const pubblico = await risolvi({ requiredConsentKey: "images" });

  assert.equal(pubblico.recipients.length, 3);
  assert.equal(pubblico.appliedConsentKey, null);
});

test("nessuna decisione non e un diniego: chi non ha mai risposto passa", async () => {
  const pubblico = await risolvi({ requiredConsentKey: "marketing" });

  assert.equal(pubblico.recipients.length, 3);
  assert.equal(
    pubblico.appliedConsentKey,
    "marketing",
    "la regola e applicata: e il silenzio a non essere un diniego",
  );
});

test("in «require_explicit» passa solo chi ha accettato", async () => {
  monta({
    records: [decisione("r1", "a1", "accepted", "2026-02-01T10:00:00Z")],
  });

  const pubblico = await risolvi({
    requiredConsentKey: "marketing",
    consentEnforcementMode: "require_explicit",
  });

  assert.deepEqual(
    pubblico.recipients.map((row) => row.email),
    ["a1@example.com"],
  );
  assert.deepEqual(
    pubblico.exclusions
      .filter((row) => row.reason === "consent_revoked")
      .map((row) => row.athleteId)
      .sort(),
    ["a2", "a3"],
  );
});

test("la chiave puo arrivare dallo scope, che e dove il piano la mette", async () => {
  monta({
    records: [decisione("r1", "a2", "revoked", "2026-05-01T10:00:00Z")],
  });

  const pubblico = await audience.resolveAudience({
    criteria: [{ kind: "all_families" }],
    scope: { ...scope(), requiredConsentKey: "marketing" },
    now: new Date("2026-10-05T10:00:00Z"),
  });

  assert.equal(pubblico.recipients.length, 2);
});

test("il consenso di un altro club non tocca questo pubblico", async () => {
  monta({
    records: [
      {
        ...decisione("r1", "a2", "revoked", "2026-05-01T10:00:00Z"),
        organization_id: "aaaaaaaa-0000-4000-8000-000000000002",
      },
    ],
  });

  const pubblico = await risolvi({ requiredConsentKey: "marketing" });

  assert.equal(pubblico.recipients.length, 3);
});
