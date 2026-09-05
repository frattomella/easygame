import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Il contatore dei tentativi OTP conta i tentativi, non le raffiche.**
 * (B-H1, revisione finale della Wave 6)
 *
 * La verifica leggeva `attempts`, confrontava il codice e riscriveva
 * `attempts + 1` come valore assoluto: N richieste intrecciate leggevano
 * tutte 0 e scrivevano tutte 1. Contro Postgres lo misura la sonda (U-70,
 * sessanta richieste dalla rotta); qui il doppio esegue le chiamate
 * **intrecciate** ai confini degli `await`, e ogni scrittura condizionata e
 * atomica come in un database: basta a distinguere «si prende un tentativo
 * prima di giudicare» da «si legge e poi si scrive». Con la forma vecchia
 * questo file e rosso: `attempts` resta 1 e il codice giusto passa.
 */

const UTENTE = "11111111-0000-4000-8000-000000000aaa";
/*
  **Il riferimento opaco, non l'UUID** (PP-05, M-1 del secondo round della
  revisione ostile). Le rotte e il dominio accettano l'UUID nudo **solo** da
  chi ha gia una sessione su quell'account: qui non c'e nessuna sessione, e
  questa e la forma in cui il flusso vero arriva — la registrazione restituisce
  il riferimento, non l'identificativo.
*/
const RIFERIMENTO = "verify_0123456789abcdef0123456789abcdef";
const DESTINATARIO = "persona@example.invalid";
const CODICE = "654321";
const TOKEN_RESET = "token-di-reset-lungo-e-imprevedibile";

/*
  **L'impronta la calcola il codice di produzione, non il test.**

  Prima era una riga di SHA-256 nuda scritta qui: quando `hashOtpCode` e
  diventato un HMAC con il pepe e con il legame a canale, scopo e utente
  (PP-05), questo file e diventato rosso — ed e giusto che lo sia diventato,
  perche una copia dell'impronta scritta nel test avrebbe continuato a passare
  qualunque cosa facesse la produzione. Adesso si chiama la stessa funzione.
*/
let impronta;

let flussi;
let MAX_OTP_ATTEMPTS;
let setPrismaClientForTests;
let fake;

const challenge = (over = {}) => ({
  id: "ch-verifica",
  user_id: UTENTE,
  channel: "email",
  purpose: "verify_email",
  target: DESTINATARIO,
  code_hash: impronta(CODICE),
  expires_at: new Date(Date.now() + 10 * 60_000),
  consumed_at: null,
  attempts: 0,
  created_at: new Date(),
  ...over,
});

const seed = () => ({
  user: [
    {
      id: UTENTE,
      email: DESTINATARIO,
      first_name: "Anna",
      last_name: "Rossi",
      password_hash: "x",
      email_verified_at: null,
      token_verification_id: RIFERIMENTO,
    },
  ],
  authVerificationChallenge: [challenge()],
  session: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  flussi = await import("../../src/lib/server/auth-workflows.ts");
  /*
    **Il destinatario entra nell'impronta** (PP-05, CRITICAL del quarto round
    della revisione ostile): un codice nasce per un recapito, e se l'account
    cambia recapito fra l'emissione e il consumo quel codice non prova piu
    niente. Qui il destinatario e sempre l'indirizzo dell'utente della
    fixture, che e anche il `target` della riga.
  */
  impronta = (
    valore,
    purpose = "verify_email",
    channel = "email",
    target = DESTINATARIO,
  ) => flussi.hashOtpCode(valore, { userId: UTENTE, channel, purpose, target });
  ({ MAX_OTP_ATTEMPTS } = await import("../../src/lib/auth/otp-policy.ts"));
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const riga = (id = "ch-verifica") =>
  fake.rows("authVerificationChallenge").find((r) => r.id === id);

test("dodici codici sbagliati intrecciati: contati fino al tetto, e la challenge si chiude", async () => {
  const esiti = await Promise.allSettled(
    Array.from({ length: 12 }, (_, i) =>
      flussi.confirmEmailVerification(RIFERIMENTO, String(100000 + i)),
    ),
  );

  assert.equal(esiti.filter((e) => e.status === "rejected").length, 12);
  assert.equal(
    riga().attempts,
    MAX_OTP_ATTEMPTS,
    "il contatore conta i tentativi, non le raffiche",
  );
  /*
    Al tetto non si scrive `consumed_at`: il tetto vive nel WHERE
    dell'incremento, e una scrittura in piu competerebbe con il consumo di un
    codice giusto ancora in volo (vedi `prendiUnTentativo`).
  */
  assert.equal(riga().consumed_at, null);

  await assert.rejects(
    () => flussi.confirmEmailVerification(RIFERIMENTO, CODICE),
    /Codice non valido o scaduto/,
    "dopo la raffica il codice giusto non apre piu niente",
  );
  assert.equal(fake.rows("user")[0].email_verified_at, null);
});

test("controspecchio: due errori e poi il codice giusto verificano l'indirizzo", async () => {
  await assert.rejects(() => flussi.confirmEmailVerification(RIFERIMENTO, "000000"));
  await assert.rejects(() => flussi.confirmEmailVerification(RIFERIMENTO, "111111"));

  const { user: utente, purpose } = await flussi.confirmEmailVerification(
    RIFERIMENTO,
    CODICE,
  );

  assert.ok(utente.email_verified_at, "l'indirizzo risulta verificato");
  /*
    Lo scopo torna insieme all'utente (PP-05, ADR-0117): e cio su cui la rotta
    decide se aprire una sessione, e qui la challenge e stata scritta come
    `verify_email`, che **non** ne apre nessuna.
  */
  assert.equal(purpose, "verify_email");
  assert.equal(riga().attempts, 3);
  assert.ok(riga().consumed_at, "la challenge usata si consuma");
});

test("la challenge e monouso anche sotto dieci codici giusti intrecciati", async () => {
  const esiti = await Promise.allSettled(
    Array.from({ length: 10 }, () => flussi.confirmEmailVerification(RIFERIMENTO, CODICE)),
  );

  assert.equal(
    esiti.filter((e) => e.status === "fulfilled").length,
    1,
    "una verifica sola: la seconda scrittura trova consumed_at gia pieno",
  );
});

test("reset password: il token giusto non consuma tentativi se la password che segue non vale", async () => {
  fake.rows("authVerificationChallenge").push(
    challenge({
      id: "ch-reset",
      purpose: "reset_password",
      code_hash: impronta(TOKEN_RESET, "reset_password"),
    }),
  );

  await assert.rejects(
    () =>
      flussi.confirmPasswordReset({
        userId: UTENTE,
        token: TOKEN_RESET,
        password: "corta",
      }),
    /almeno|caratteri|password/i,
  );
  assert.equal(riga("ch-reset").attempts, 0, "il tentativo si rimborsa: il link resta buono");
  assert.equal(riga("ch-reset").consumed_at, null);

  /* Un token sbagliato invece spende, e al tetto la challenge si chiude. */
  for (let i = 0; i < MAX_OTP_ATTEMPTS; i += 1) {
    await assert.rejects(
      () =>
        flussi.confirmPasswordReset({
          userId: UTENTE,
          token: `token-sbagliato-${i}`,
          password: "Corretta-Sicura-2026!!",
        }),
      /Link di reset non valido o scaduto/,
    );
  }
  assert.equal(riga("ch-reset").attempts, MAX_OTP_ATTEMPTS);
  assert.equal(riga("ch-reset").consumed_at, null, "il tetto vive nel contatore, non in consumed_at");

  await assert.rejects(
    () =>
      flussi.confirmPasswordReset({
        userId: UTENTE,
        token: TOKEN_RESET,
        password: "Corretta-Sicura-2026!!",
      }),
    /Link di reset non valido o scaduto/,
    "il token giusto, dopo il tetto, non vale piu",
  );
});

test("reset password, controspecchio: il token giusto e una password valida cambiano la password", async () => {
  fake.rows("authVerificationChallenge").push(
    challenge({
      id: "ch-reset",
      purpose: "reset_password",
      code_hash: impronta(TOKEN_RESET, "reset_password"),
    }),
  );

  const esito = await flussi.confirmPasswordReset({
    userId: UTENTE,
    token: TOKEN_RESET,
    password: "Corretta-Sicura-2026!!",
  });

  assert.equal(esito.userId, UTENTE);
  assert.ok(riga("ch-reset").consumed_at, "il link e monouso");
  assert.notEqual(fake.rows("user")[0].password_hash, "x");
});
