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

/*
  La porta del cron.

  Il `GET` prima non esisteva, e il motivo era buono: cancella righe, e un
  prefetch del browser o un antivirus eseguono i `GET`. Ma Vercel Cron sa
  invocare solo un `GET`, e senza di esso la pulizia non girava mai: le righe
  scadute restavano a crescere.

  Cio che rende il `GET` accettabile non e una promessa, e la severita del suo
  controllo — piu stretta di quella delle altre porte di cron del progetto — ed
  e esattamente cio che questi tre test presidiano. Se qualcuno la allentasse
  per far girare il cron in locale, il `GET` tornerebbe la porta aperta che il
  `POST` evitava.
*/

test("la manutenzione ha una porta per il cron", () => {
  const source = routeSource();

  assert.match(source, /export async function POST/);
  assert.match(
    source,
    /export async function GET/,
    "Vercel Cron invoca un GET: senza, la pulizia non gira mai davvero",
  );
});

test("la porta del cron delega al gate condiviso", () => {
  const source = routeSource();
  const get = source.slice(source.indexOf("export async function GET"));

  /*
    La regola non vive piu qui. Dall'audit di fine Wave 1 le quattro porte
    periodiche passano tutte da `src/lib/server/cron-auth.ts`, che pretende il
    segreto in **ogni** ambiente e lo confronta a tempo costante: prima ognuna
    aveva la sua copia, e tre su quattro lasciavano passare chiunque fuori da
    produzione. Il comportamento e provato sul modulo, in
    `tests/server/cron-auth.test.mjs`; qui si verifica che la rotta non se ne
    sia rifatta una propria.
  */
  assert.match(get, /authorizeCronRequest\(/);
  assert.doesNotMatch(
    get,
    /NODE_ENV/,
    "qui non vale la scorciatoia «fuori da produzione passa comunque»: cancella righe",
  );
});

test("il POST conserva il proprio confronto a tempo costante", () => {
  const source = routeSource();
  const post = source.slice(
    source.indexOf("export async function POST"),
    source.indexOf("export async function GET"),
  );

  /*
    Il `POST` non e una porta di cron: si autentica con
    `x-maintenance-token`, che ADR-0007 tiene in vita come strada per uno
    schedulatore fuori dall'hosting. Il suo confronto resta suo, e resta a
    tempo costante.
  */
  assert.match(
    post,
    /secretsMatch\(configuredToken, presentedToken\)/,
    "un !== esce al primo carattere diverso, e il tempo che ci mette lo racconta",
  );
});

test("il segreto si confronta a tempo costante", () => {
  assert.match(
    routeSource(),
    /diff \|= left\.charCodeAt\(index\) \^ right\.charCodeAt\(index\)/,
    "un === esce al primo carattere diverso, e il tempo che ci mette lo racconta",
  );
});
