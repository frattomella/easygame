import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  PASSWORD_POLICY,
  validatePassword,
} from "../../src/lib/auth/password-policy.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8");

const WORKFLOWS = read("src/lib/server/auth-workflows.ts");
const FORGOT_ROUTE = read("src/app/api/v1/auth/password/forgot/route.ts");
const RESET_ROUTE = read("src/app/api/v1/auth/password/reset/route.ts");

test("la nuova password deve rispettare la policy del progetto", () => {
  // La stessa policy usata da registrazione e reset.
  assert.equal(PASSWORD_POLICY.minLength, 12);
  assert.equal(validatePassword("password123", "user@example.invalid").valid, false);
  assert.equal(validatePassword("Corta1!", "user@example.invalid").valid, false);
  assert.equal(
    validatePassword("Reimpostata-2026!", "user@example.invalid").valid,
    true,
  );

  assert.ok(
    WORKFLOWS.includes("validatePassword(password, user.email)"),
    "confirmPasswordReset deve validare la password contro la policy",
  );
});

test("il token di reset e casuale, lungo e salvato solo come hash", () => {
  assert.ok(
    WORKFLOWS.includes("randomBytes(32).toString(\"hex\")"),
    "il token deve essere casuale da 32 byte",
  );
  assert.ok(
    WORKFLOWS.includes("code_hash: hashOtpCode(token)"),
    "il token deve essere salvato come hash, mai in chiaro",
  );
  assert.ok(
    !WORKFLOWS.includes("code_hash: token"),
    "il token non deve mai essere salvato in chiaro",
  );
});

test("il confronto del token e a tempo costante", () => {
  assert.ok(
    WORKFLOWS.includes("timingSafeEqual"),
    "il confronto del token deve usare timingSafeEqual",
  );
});

test("il token e monouso, scade e ha un tetto di tentativi", () => {
  assert.ok(WORKFLOWS.includes("PASSWORD_RESET_TTL_MINUTES = 30"));
  assert.ok(
    WORKFLOWS.includes("expires_at: { gt: new Date() }"),
    "la challenge scaduta non deve essere accettata",
  );
  /*
    Il tetto si applica **dentro** la scrittura, non prima: `attempts < MAX`
    nel `WHERE` dell'incremento e cio che fa contare i tentativi e non le
    raffiche (B-H1). Un controllo `challenge.attempts >= MAX` letto prima
    dell'incremento e la forma del difetto, e questa prova non deve piu
    accettarla.
  */
  assert.ok(
    WORKFLOWS.includes("attempts: { lt: MAX_OTP_ATTEMPTS }"),
    "il tetto ai tentativi va nel WHERE dell'incremento",
  );
  assert.ok(
    !WORKFLOWS.includes("challenge.attempts >= MAX_OTP_ATTEMPTS"),
    "il tetto non si controlla leggendo prima di scrivere",
  );
  assert.ok(
    WORKFLOWS.includes("consumed_at: new Date()"),
    "la challenge usata va consumata",
  );
});

test("un reset chiude tutte le sessioni dell'utente", () => {
  assert.ok(
    WORKFLOWS.includes("prisma.session.deleteMany({ where: { user_id: user.id } })"),
    "dopo il reset ogni sessione aperta deve essere invalidata",
  );
  assert.ok(
    WORKFLOWS.includes("prisma.$transaction"),
    "consumo challenge, cambio password e revoca sessioni devono essere atomici",
  );
});

test("le challenge di reset non interferiscono con gli OTP di verifica", () => {
  assert.ok(
    WORKFLOWS.includes('purpose: { not: "reset_password" }'),
    "verifyInternalChallenge deve escludere le challenge di reset password",
  );
  assert.ok(
    WORKFLOWS.includes('purpose: "reset_password"'),
    "la ricerca della challenge di reset deve essere vincolata al purpose",
  );
});

test("la risposta ha la stessa forma per account esistenti e non", () => {
  // Un campo in piu nella risposta dell'account reale sarebbe un oracolo di
  // esistenza: rilevato su staging il 2026-08-22 e corretto.
  assert.ok(
    FORGOT_ROUTE.includes("const rispostaGenerica ="),
    "entrambe le risposte devono passare dallo stesso costruttore",
  );
  assert.ok(
    FORGOT_ROUTE.includes("...(previewToken ? { previewToken } : {})"),
    "previewToken deve comparire solo se valorizzato",
  );
  assert.ok(
    !FORGOT_ROUTE.includes("previewToken: challenge.previewCode"),
    "previewToken non deve essere inserito incondizionatamente",
  );
});

test("l'endpoint di richiesta non rivela se un account esiste", () => {
  assert.ok(
    FORGOT_ROUTE.includes("PASSWORD_RESET_GENERIC_MESSAGE"),
    "la risposta deve essere sempre la stessa",
  );
  assert.ok(
    FORGOT_ROUTE.includes("return genericSuccess"),
    "account inesistente e errore inatteso devono dare la stessa risposta",
  );
  assert.ok(
    !/status:\s*404/.test(FORGOT_ROUTE),
    "nessun 404 che riveli l'assenza dell'account",
  );
});

test("entrambi gli endpoint applicano un rate limit", () => {
  for (const [nome, source] of [
    ["forgot", FORGOT_ROUTE],
    ["reset", RESET_ROUTE],
  ]) {
    assert.ok(
      source.includes("consumeRequestRateLimits"),
      `${nome} deve applicare un rate limit`,
    );
    assert.ok(
      source.includes("RATE_LIMITED"),
      `${nome} deve rispondere con il codice RATE_LIMITED`,
    );
    assert.ok(
      source.includes("getRequestIp"),
      `${nome} deve limitare anche per IP`,
    );
  }
});

test("senza SMTP il reset non e disponibile e lo dichiara", () => {
  assert.ok(
    FORGOT_ROUTE.includes("isEmailDeliveryConfigured"),
    "il reset dipende dalla configurazione SMTP",
  );
  assert.ok(
    FORGOT_ROUTE.includes("SMTP_CONFIGURATION_INVALID"),
    "senza SMTP va restituito un codice esplicito",
  );
});

test("il link di reset punta al percorso applicativo corretto", () => {
  assert.ok(WORKFLOWS.includes("/auth/reset-password?uid="));
  assert.ok(
    fs.existsSync(path.join(PROJECT_ROOT, "src/app/auth/reset-password/page.tsx")),
    "manca la pagina /auth/reset-password",
  );
  assert.ok(
    fs.existsSync(path.join(PROJECT_ROOT, "src/app/auth/forgot-password/page.tsx")),
    "manca la pagina /auth/forgot-password",
  );
});

test("il flusso di reset resta raggiungibile senza sessione", () => {
  const middleware = read("src/middleware.ts");
  // /auth non e tra i prefissi protetti: le due pagine devono restare pubbliche.
  assert.ok(
    !middleware.includes('"/auth"'),
    "il middleware non deve proteggere /auth: bloccherebbe il reset",
  );

  const authShell = read("src/components/auth/auth-shell.tsx");
  assert.ok(
    authShell.includes("/auth/forgot-password"),
    "il login deve offrire il link a password dimenticata",
  );
});
