import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * La manutenzione periodica (Blocco Finale C, punto 13).
 *
 * **Cosa doveva davvero essere periodico.** L'audit ha guardato tutto cio che
 * oggi dipende dall'apertura di una schermata e ha risposto «request-driven»
 * quasi ovunque: scadenze e alert si calcolano dalle date, i contributi si
 * ricalcolano su richiesta, e lo stato di una rata **non si aggiorna** perche
 * non si scrive (ADR-0036). L'unica cosa che nessuna schermata fara mai e
 * togliere le righe scadute — sessioni, sfide OTP, contatori di rate limit,
 * audit oltre la retention — perche nessuna schermata le legge.
 *
 * **Il rischio che questi test presidiano** e la rotta, non la pulizia: una
 * porta di servizio che cancella righe e raggiungibile da un cron deve essere
 * chiusa quando il segreto non e configurato. Un confronto con una stringa
 * vuota la aprirebbe a chiunque mandi un header vuoto.
 */

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");
const ORA = new Date("2026-08-26T12:00:00Z");
const IERI = new Date("2026-08-25T12:00:00Z");
const DOMANI = new Date("2026-08-27T12:00:00Z");

let maintenance;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  maintenance = await import("../../src/lib/server/maintenance.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma({
    session: [
      { id: "viva", expires_at: DOMANI },
      { id: "scaduta", expires_at: IERI },
    ],
    authVerificationChallenge: [
      { id: "otp-vivo", expires_at: DOMANI },
      { id: "otp-scaduto", expires_at: IERI },
    ],
    authRateLimitBucket: [
      { key: "ip:1", expires_at: DOMANI },
      { key: "ip:2", expires_at: IERI },
    ],
    auditLog: [
      { id: "recente", created_at: IERI },
      { id: "vecchio", created_at: new Date("2020-01-01T00:00:00Z") },
    ],
  });
  setPrismaClientForTests(fake.client);
  delete process.env.AUDIT_LOG_RETENTION_DAYS;
});

test("toglie cio che e scaduto e lascia cio che vale ancora", async () => {
  const report = await maintenance.runScheduledMaintenance(ORA);

  assert.deepEqual(
    fake.rows("session").map((row) => row.id),
    ["viva"],
  );
  assert.deepEqual(
    fake.rows("authVerificationChallenge").map((row) => row.id),
    ["otp-vivo"],
  );
  assert.deepEqual(
    fake.rows("authRateLimitBucket").map((row) => row.key),
    ["ip:1"],
  );
  assert.equal(report.removedTotal, 3);
  assert.equal(report.failed, 0);
});

test("senza retention configurata l'audit non si tocca", async () => {
  await maintenance.runScheduledMaintenance(ORA);

  assert.equal(
    fake.rows("auditLog").length,
    2,
    "il periodo di conservazione e una decisione di compliance, non un valore predefinito che si scopre dopo aver perso dei dati",
  );
});

test("con la retention configurata l'audit vecchio se ne va", async () => {
  process.env.AUDIT_LOG_RETENTION_DAYS = "30";

  const report = await maintenance.runScheduledMaintenance(ORA);

  assert.deepEqual(
    fake.rows("auditLog").map((row) => row.id),
    ["recente"],
  );
  assert.equal(report.steps.find((step) => step.name === "audit_logs").removed, 1);
});

test("un passo che fallisce non ferma gli altri", async () => {
  fake.client.session.deleteMany = async () => {
    throw new Error("database non raggiungibile");
  };

  const report = await maintenance.runScheduledMaintenance(ORA);

  assert.equal(report.failed, 1);
  assert.match(
    report.steps.find((step) => step.name === "sessions").error,
    /non raggiungibile/,
  );
  assert.deepEqual(
    fake.rows("authRateLimitBucket").map((row) => row.key),
    ["ip:1"],
    "una pulizia interrotta a meta lascia il lavoro a domani, non fa risultare rotto un sistema sano",
  );
});

/* ------------------------------------------------------------ la rotta */

const routeSource = () =>
  fs.readFileSync(
    path.join(PROJECT_ROOT, "src/app/api/v1/maintenance/route.ts"),
    "utf8",
  );

test("senza segreto configurato la porta di servizio resta chiusa", () => {
  const source = routeSource();

  assert.match(
    source,
    /Boolean\(configuredToken\) && secretsMatch\(/,
    "un confronto con una stringa vuota aprirebbe la rotta a chiunque mandi un header vuoto",
  );
  assert.match(
    source,
    /isPlatformAdminUser\(session\.db\.user\)/,
    "la seconda strada e una sessione di piattaforma, non una sessione qualunque",
  );
});

test("la manutenzione si aziona con POST, non con GET", () => {
  const source = routeSource();

  assert.match(source, /export async function POST/);
  assert.doesNotMatch(
    source,
    /export async function GET/,
    "cancella righe: un GET lo esegue un prefetch, un antivirus o un crawler",
  );
});

test("il segreto si confronta a tempo costante", () => {
  assert.match(
    routeSource(),
    /diff \|= left\.charCodeAt\(index\) \^ right\.charCodeAt\(index\)/,
    "un === esce al primo carattere diverso, e il tempo che ci mette lo racconta",
  );
});
