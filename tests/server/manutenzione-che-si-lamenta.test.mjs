import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Un giro notturno che smette di girare** (Wave 6, §16).
 *
 * `runScheduledMaintenance` raccoglie l'errore di ogni passo e non lo propaga,
 * per una ragione giusta: una pulizia che si interrompe a meta non deve far
 * risultare rotto un sistema sano. Ma il rapporto e il **corpo HTTP** della
 * risposta, e a invocarla e il cron: nessuno lo legge. Un passo che fallisce
 * ogni notte per tre settimane era invisibile fino alla telefonata di un club.
 *
 * Adesso lascia una riga. Il test prova le due meta: che la riga ci sia quando
 * un passo fallisce, e che **non** ci sia quando tutto e andato bene — un
 * registro che scrive anche i successi di un giro notturno diventa illeggibile
 * proprio nel giorno in cui serve.
 */

let manutenzione;
let setPrismaClientForTests;
let fake;

const ADESSO = new Date("2026-09-01T03:00:00Z");

const seed = () => ({
  session: [{ id: "s1", expires_at: new Date("2026-01-01T00:00:00Z") }],
  authVerificationChallenge: [],
  authRateLimitBucket: [],
  auditLog: [],
  paymentTransaction: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  manutenzione = await import("../../src/lib/server/maintenance.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const silenzia = (t) => {
  const originale = console.error;
  console.error = () => {};
  t.after(() => {
    console.error = originale;
  });
};

test("un giro senza guasti non scrive nessuna riga di audit", async (t) => {
  silenzia(t);

  const rapporto = await manutenzione.runScheduledMaintenance(ADESSO);

  assert.equal(rapporto.failed, 0);
  assert.equal(
    fake.rows("auditLog").filter((row) => row.action.startsWith("maintenance."))
      .length,
    0,
  );
});

test("un passo fallito lascia una riga di audit con esito «failure»", async (t) => {
  silenzia(t);

  fake.client.session.deleteMany = async () => {
    throw new Error("connessione al database non disponibile");
  };

  const rapporto = await manutenzione.runScheduledMaintenance(ADESSO);

  assert.equal(rapporto.failed, 1);

  const riga = fake
    .rows("auditLog")
    .find((row) => row.action === "maintenance.step.failed");

  assert.ok(riga, "il passo fallito non ha lasciato nessuna traccia");
  assert.equal(riga.outcome, "failure");
  assert.equal(riga.resource, "maintenance");
  assert.equal(riga.resource_id, "sessions");
  assert.equal(riga.metadata.step, "sessions");
  assert.match(riga.metadata.message, /connessione al database/);
});

test("due passi falliti lasciano due righe distinte", async (t) => {
  silenzia(t);

  fake.client.session.deleteMany = async () => {
    throw new Error("primo guasto");
  };
  fake.client.authRateLimitBucket.deleteMany = async () => {
    throw new Error("secondo guasto");
  };

  await manutenzione.runScheduledMaintenance(ADESSO);

  assert.deepEqual(
    fake
      .rows("auditLog")
      .filter((row) => row.action === "maintenance.step.failed")
      .map((row) => row.resource_id)
      .sort(),
    ["auth_rate_limit_buckets", "sessions"],
  );
});

test("il messaggio dell'ORM non porta nel registro cio che si stava toccando", async (t) => {
  silenzia(t);

  fake.client.session.deleteMany = async () => {
    throw new Error(
      "Invalid `prisma.session.deleteMany()` invocation:\n\n{ where: { user_email: \"mario@example.com\" } }",
    );
  };

  await manutenzione.runScheduledMaintenance(ADESSO);

  const riga = fake
    .rows("auditLog")
    .find((row) => row.action === "maintenance.step.failed");

  assert.equal(riga.metadata.message.includes("mario@example.com"), false);
});

test("un passo che fallisce non ferma gli altri", async (t) => {
  silenzia(t);

  fake.client.session.deleteMany = async () => {
    throw new Error("guasto");
  };

  const rapporto = await manutenzione.runScheduledMaintenance(ADESSO);

  assert.deepEqual(
    rapporto.steps.map((step) => step.name),
    [
      "sessions",
      "auth_verification_challenges",
      "auth_rate_limit_buckets",
      "audit_logs",
      "payment_provider_fees",
    ],
  );
});
