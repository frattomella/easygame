import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Audit log delle operazioni sensibili (ADR-0019).
 *
 * Il requisito piu importante non e "registra", e **"non registra segreti"**:
 * un audit che copia password o token in chiaro peggiora la postura di
 * sicurezza invece di migliorarla.
 */

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");

let audit;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  audit = await import("../../src/lib/server/audit.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma({ auditLog: [] });
  setPrismaClientForTests(fake.client);
  delete process.env.AUDIT_LOG_RETENTION_DAYS;
});

const richiestaFinta = (headers = {}) =>
  new Request("https://esempio.invalid/api/v1/test", { headers });

/* --------------------------- CONTENUTO SICURO --------------------------- */

test("i metadati non conservano mai password, token o credenziali", () => {
  const ripulito = audit.sanitizeMetadata({
    password: "SuperSegreta-2026",
    password_hash: "$2a$10$abcdefg",
    access_token: "tok_abcdefghijklmnop",
    refresh_token: "tok_refresh",
    code_hash: "aabbcc",
    otp: "123456",
    pin: "9999",
    iban: "IT60X0542811101000000123456",
    authorization: "Bearer xyz",
    cookie: "easygame_session=abc",
    password_ciphertext: "zzz",
    password_iv: "iv",
    password_tag: "tag",
    clientSecret: "shhh",
    // questi invece devono restare: servono a capire cosa e successo
    reason: "wrong_password",
    attempts: 3,
    delivered: true,
  });

  for (const chiave of [
    "password",
    "password_hash",
    "access_token",
    "refresh_token",
    "code_hash",
    "otp",
    "pin",
    "iban",
    "authorization",
    "cookie",
    "password_ciphertext",
    "password_iv",
    "password_tag",
    "clientSecret",
  ]) {
    assert.equal(ripulito[chiave], "[rimosso]", `${chiave} non e stata rimossa`);
  }

  assert.equal(ripulito.reason, "wrong_password");
  assert.equal(ripulito.attempts, 3);
  assert.equal(ripulito.delivered, true);

  // e il valore originale non deve comparire da nessuna parte
  const serializzato = JSON.stringify(ripulito);
  assert.ok(!serializzato.includes("SuperSegreta-2026"));
  assert.ok(!serializzato.includes("tok_abcdefghijklmnop"));
  assert.ok(!serializzato.includes("IT60X0542811101000000123456"));
});

test("il filtro sui segreti agisce anche negli oggetti annidati", () => {
  const ripulito = audit.sanitizeMetadata({
    payload: { user: { email: "a@b.invalid", password: "segreta" } },
    elenco: [{ token: "abc" }],
  });

  assert.equal(ripulito.payload.user.password, "[rimosso]");
  assert.equal(ripulito.payload.user.email, "a@b.invalid");
  assert.equal(ripulito.elenco[0].token, "[rimosso]");
  assert.ok(!JSON.stringify(ripulito).includes("segreta"));
});

test("i metadati sono limitati in lunghezza, profondita e numero di chiavi", () => {
  const lunga = "x".repeat(2000);
  const ripulito = audit.sanitizeMetadata({ nota: lunga });
  assert.ok(ripulito.nota.length < 600, "stringa non troncata");

  let profondo = { valore: "fondo" };
  for (let i = 0; i < 10; i += 1) profondo = { dentro: profondo };
  const troncato = audit.sanitizeMetadata(profondo);
  assert.ok(JSON.stringify(troncato).includes("[troncato]"));

  const molte = Object.fromEntries(
    Array.from({ length: 100 }, (_, i) => [`k${i}`, i]),
  );
  assert.ok(Object.keys(audit.sanitizeMetadata(molte)).length <= 41);
});

/* ------------------------------ SCRITTURA ------------------------------ */

test("registra actor, club, azione, risorsa, esito e contesto", async () => {
  const ok = await audit.recordAuditEvent({
    action: audit.AUDIT_ACTIONS.resourceDeleted,
    actorUserId: "aaaaaaaa-0000-4000-8000-000000000001",
    actorEmail: "Owner@Example.Invalid",
    actorRole: "owner",
    organizationId: "bbbbbbbb-0000-4000-8000-000000000002",
    resource: "invoices",
    resourceId: "inv-1",
    request: richiestaFinta({
      "x-forwarded-for": "203.0.113.9, 10.0.0.1",
      "user-agent": "Mozilla/5.0 test",
    }),
    metadata: { motivo: "annullamento" },
  });

  assert.equal(ok, true);

  const riga = fake.lastCall("auditLog", "create").args.data;
  assert.equal(riga.action, "resource.deleted");
  assert.equal(riga.outcome, "success");
  assert.equal(riga.actor_user_id, "aaaaaaaa-0000-4000-8000-000000000001");
  assert.equal(riga.actor_email, "owner@example.invalid", "email normalizzata");
  assert.equal(riga.actor_role, "owner");
  assert.equal(riga.organization_id, "bbbbbbbb-0000-4000-8000-000000000002");
  assert.equal(riga.resource, "invoices");
  assert.equal(riga.resource_id, "inv-1");
  assert.equal(riga.ip, "203.0.113.9", "solo il primo IP della catena");
  assert.equal(riga.user_agent, "Mozilla/5.0 test");
  assert.deepEqual(riga.metadata, { motivo: "annullamento" });
});

test("un actor o un club non validi non finiscono nel log come testo libero", async () => {
  await audit.recordAuditEvent({
    action: audit.AUDIT_ACTIONS.authLoginFailure,
    outcome: "failure",
    actorUserId: "non-un-uuid",
    organizationId: "nemmeno-questo",
    actorEmail: "ignoto@example.invalid",
  });

  const riga = fake.lastCall("auditLog", "create").args.data;
  assert.equal(riga.actor_user_id, null);
  assert.equal(riga.organization_id, null);
  assert.equal(riga.actor_email, "ignoto@example.invalid");
});

test("senza richiesta HTTP non si inventano IP o user agent", async () => {
  await audit.recordAuditEvent({ action: "test.senza.richiesta" });
  const riga = fake.lastCall("auditLog", "create").args.data;
  assert.equal(riga.ip, null);
  assert.equal(riga.user_agent, null);
});

test("un audit che fallisce non propaga l'errore", async () => {
  setPrismaClientForTests({
    auditLog: {
      create: async () => {
        throw new Error("database non raggiungibile");
      },
    },
  });

  const errori = [];
  const originale = console.error;
  console.error = (...args) => errori.push(args);
  try {
    const ok = await audit.recordAuditEvent({ action: "test.fallimento" });
    assert.equal(ok, false, "deve restituire false, non sollevare");
  } finally {
    console.error = originale;
  }

  assert.equal(errori.length, 1, "il fallimento va comunque segnalato");
});

/* ------------------------------ RETENTION ------------------------------ */

test("senza retention configurata non si cancella nulla", async () => {
  assert.equal(audit.getAuditRetentionDays(), null);
  assert.equal(await audit.purgeExpiredAuditEvents(), 0);
  assert.equal(fake.lastCall("auditLog", "deleteMany"), null);
});

test("con retention configurata si cancella oltre la soglia", async () => {
  process.env.AUDIT_LOG_RETENTION_DAYS = "90";
  assert.equal(audit.getAuditRetentionDays(), 90);

  const adesso = new Date("2026-08-22T12:00:00.000Z");
  await audit.purgeExpiredAuditEvents(adesso);

  const chiamata = fake.lastCall("auditLog", "deleteMany");
  const soglia = chiamata.args.where.created_at.lt;
  const giorni = Math.round((adesso.getTime() - soglia.getTime()) / 86400000);
  assert.equal(giorni, 90);
});

test("una retention non valida viene ignorata invece di cancellare troppo", async () => {
  for (const valore of ["0", "-5", "abc", ""]) {
    process.env.AUDIT_LOG_RETENTION_DAYS = valore;
    assert.equal(audit.getAuditRetentionDays(), null, `valore "${valore}"`);
  }
});

/* ---------------------------- COLLEGAMENTI ----------------------------- */

const leggi = (relativePath) =>
  fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8");

test("le operazioni sensibili sono effettivamente tracciate", () => {
  const collegamenti = [
    ["src/app/api/v1/auth/login/route.ts", ["authLoginSuccess", "authLoginFailure"]],
    ["src/app/api/v1/auth/logout/route.ts", ["authLogout"]],
    ["src/app/api/v1/auth/password/forgot/route.ts", ["authPasswordResetRequested"]],
    [
      "src/app/api/v1/auth/password/reset/route.ts",
      ["authPasswordResetCompleted", "authPasswordResetFailed"],
    ],
    ["src/app/api/v1/auth/memberships/activate/route.ts", ["membershipActivated"]],
    ["src/app/api/v1/[resource]/route.ts", ["resourceCreated", "resourceAccessDenied"]],
    [
      "src/app/api/v1/[resource]/[id]/route.ts",
      ["resourceUpdated", "resourceDeleted", "resourceAccessDenied"],
    ],
  ];

  const mancanti = [];
  for (const [file, azioni] of collegamenti) {
    const source = leggi(file);
    for (const azione of azioni) {
      if (!source.includes(`AUDIT_ACTIONS.${azione}`)) {
        mancanti.push(`${file} -> ${azione}`);
      }
    }
  }

  assert.deepEqual(mancanti, [], `collegamenti mancanti: ${mancanti.join(", ")}`);
});

test("le risorse economiche e di accesso sono tra quelle tracciate", () => {
  for (const risorsa of [
    "payments",
    "invoices",
    "receipts",
    "organization_users",
    "clubs",
    "bank_accounts",
    "access_tokens",
    "users",
  ]) {
    assert.ok(
      audit.AUDITED_RESOURCES.has(risorsa),
      `${risorsa} dovrebbe essere tracciata`,
    );
  }
});

test("il modulo di audit non registra mai il corpo delle richieste", () => {
  const source = leggi("src/lib/server/audit.ts");
  assert.ok(
    !/request\.(json|text|body)/.test(source),
    "l'audit non deve leggere il corpo della richiesta",
  );
});

/* ------------------------- ANAGRAFICHE E DENARO (R-07, Blocco Finale C) --- */

/**
 * ADR-0019 dichiara la copertura delle anagrafiche **bloccante per la
 * produzione**, e la ragione e concreta: l'approvazione di una compilazione
 * di modulo scrive in anagrafica per conto di qualcun altro. Senza traccia,
 * «chi ha cambiato la residenza di questo atleta» non ha risposta.
 */
test("le anagrafiche di persona sono tracciate, gli allenamenti no", () => {
  for (const risorsa of [
    "athletes",
    "simplified_athletes",
    "trainers",
    "staff_members",
    "members",
    "medical_certificates",
  ]) {
    assert.equal(
      audit.isAuditedResource(risorsa),
      true,
      `${risorsa} e un'anagrafica di persona: va tracciata`,
    );
  }

  for (const risorsa of ["trainings", "clothing_inventory", "weekly_schedule"]) {
    assert.equal(
      audit.isAuditedResource(risorsa),
      false,
      `${risorsa} non ha un soggetto: tracciarla rende il log illeggibile`,
    );
  }
});

test("un'anagrafica non si confonde con una scrittura qualunque", () => {
  assert.equal(audit.AUDIT_ACTIONS.anagraficaUpdated, "anagrafica.updated");
  assert.notEqual(
    audit.AUDIT_ACTIONS.anagraficaUpdated,
    audit.AUDIT_ACTIONS.resourceUpdated,
    "cercare «chi ha cambiato i dati di questa persona» fra tutte le scritture non la trova",
  );
});

test("denaro, documenti e contributi hanno un'azione propria", () => {
  const attese = {
    paymentTransactionRecorded: "payment.transaction.recorded",
    paymentTransactionReversed: "payment.transaction.reversed",
    documentIssued: "document.issued",
    fundingReported: "funding.period.reported",
    fundingSettled: "funding.period.settled",
    clubPlanChanged: "platform.club_plan.changed",
    clubServiceChanged: "platform.club_service.changed",
    clubEntitlementOverridden: "platform.entitlement.overridden",
    paymentProviderConfigured: "admin.payment_provider.updated",
  };

  for (const [chiave, valore] of Object.entries(attese)) {
    assert.equal(audit.AUDIT_ACTIONS[chiave], valore);
  }
});

test("le rotte che muovono denaro usano l'azione del denaro", () => {
  const leggi = (percorso) =>
    fs.readFileSync(path.join(PROJECT_ROOT, percorso), "utf8");

  assert.match(
    leggi("src/app/api/v1/payment-transactions/route.ts"),
    /AUDIT_ACTIONS\.paymentTransactionRecorded/,
  );
  assert.match(
    leggi("src/app/api/v1/payment-transactions/[id]/route.ts"),
    /AUDIT_ACTIONS\.paymentTransactionReversed/,
  );
  assert.match(
    leggi("src/app/api/v1/payment-transactions/[id]/route.ts"),
    /AUDIT_ACTIONS\.documentIssued/,
  );
  assert.match(
    leggi("src/app/api/v1/funding/settlements/route.ts"),
    /AUDIT_ACTIONS\.fundingSettled/,
  );
});
