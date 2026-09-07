import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Un codice nasce per un recapito, non per un account** — i due Critical del
 * quarto round della revisione ostile PP-05.
 *
 * La teoria di un token e sempre stata la stessa: dimostra che chi lo porta
 * controlla **il recapito a cui e stato consegnato**. Le rotte OTP la
 * applicavano — `verifyInternalChallenge` ha il destinatario nel `where` da
 * quando esiste — e la rotta di reset password no: cercava la challenge per
 * utente, canale, scopo e vita della riga, e non per destinatario.
 *
 * La differenza fra le due era **invisibile** finche l'indirizzo di un account
 * non poteva cambiare sotto un token vivo. Da PP-05 puo, e da quel momento la
 * riga mancante e diventata la strada piu breve per diventare amministratore
 * di piattaforma: l'elenco degli amministratori vive in una variabile
 * `NEXT_PUBLIC_*`, cioe e pubblicato a ogni browser.
 *
 * Contro PostgreSQL vero lo misurano `S11` e `S12` di
 * `scripts/pp-05-sicurezza-probe.mjs`, con la verifica per mutazione. Qui
 * stanno le stesse proprieta dentro `npm test`, che e il cancello che gira a
 * ogni commit: una difesa misurata solo da una sonda che nessuno esegue e una
 * difesa che si perde al primo refactoring.
 */

const UTENTE = "22222222-0000-4000-8000-000000000bbb";
const SUO_INDIRIZZO = "attaccante@example.invalid";
const ALTRO_INDIRIZZO = "capo@example.invalid";
const RIFERIMENTO = "verify_fedcba9876543210fedcba9876543210";
const TOKEN = "token-di-reset-lungo-e-imprevedibile-abc";
const PASSWORD_BUONA = "Corretta-Sicura-2026!!";

let flussi;
let setPrismaClientForTests;
let fake;

const sfida = (over = {}) => ({
  id: "ch-reset",
  user_id: UTENTE,
  channel: "email",
  purpose: "reset_password",
  target: SUO_INDIRIZZO,
  code_hash: flussi.hashOtpCode(TOKEN, {
    userId: UTENTE,
    channel: "email",
    purpose: "reset_password",
    target: SUO_INDIRIZZO,
  }),
  expires_at: new Date(Date.now() + 30 * 60_000),
  consumed_at: null,
  attempts: 0,
  created_at: new Date(),
  ...over,
});

const seme = (emailAttuale) => ({
  user: [
    {
      id: UTENTE,
      email: emailAttuale,
      first_name: "Anna",
      last_name: "Rossi",
      password_hash: "x",
      email_verified_at: null,
      phone: "+393401234567",
      phone_verified_at: new Date(),
      token_verification_id: RIFERIMENTO,
    },
  ],
  authVerificationChallenge: [sfida()],
  session: [],
  externalAccount: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  flussi = await import("../../src/lib/server/auth-workflows.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = null;
});

const monta = (emailAttuale) => {
  fake = createFakePrisma(seme(emailAttuale));
  setPrismaClientForTests(fake.client);
};

const utente = () => fake.rows("user")[0];
const riga = () =>
  fake.rows("authVerificationChallenge").find((r) => r.id === "ch-reset");

test("il token di reset non vale piu se l'indirizzo dell'account e cambiato", async () => {
  /*
    La catena vera, ridotta all'osso: il token nasce per `attaccante@`, e al
    momento del consumo l'account porta `capo@`. Il consumo scriveva
    `email_verified_at` sulla teoria «chi apre il link controlla la casella»,
    che dopo il cambio **non e piu vera**: nessuna email ha mai raggiunto
    `capo@`.
  */
  monta(ALTRO_INDIRIZZO);

  await assert.rejects(
    () =>
      flussi.confirmPasswordReset({
        userId: UTENTE,
        token: TOKEN,
        password: PASSWORD_BUONA,
      }),
    /Link di reset non valido o scaduto/,
  );

  assert.equal(
    utente().email_verified_at,
    null,
    "l'indirizzo nuovo non risulta provato: nessuna email lo ha raggiunto",
  );
  assert.equal(
    utente().password_hash,
    "x",
    "e la password non e stata cambiata da chi non possiede quella casella",
  );
  assert.equal(riga().consumed_at, null, "il token di qualcun altro resta suo");
});

test("controspecchio: senza cambio di indirizzo lo stesso token funziona", async () => {
  /*
    Senza questa prova, quella sopra sarebbe soddisfatta anche da un reset
    completamente rotto — ed e il modo piu comune in cui una prova di sicurezza
    smette di misurare qualcosa.
  */
  monta(SUO_INDIRIZZO);

  const esito = await flussi.confirmPasswordReset({
    userId: UTENTE,
    token: TOKEN,
    password: PASSWORD_BUONA,
  });

  assert.equal(esito.userId, UTENTE);
  assert.ok(utente().email_verified_at, "qui la casella e stata attraversata");
  assert.notEqual(utente().password_hash, "x");
  assert.ok(riga().consumed_at, "il token si consuma");
});

test("il destinatario e dentro l'impronta, non solo dentro il `where`", () => {
  /*
    Le due difese devono restare **indipendenti**: la sonda misura che ciascuna
    da sola chiude la catena. Se un giorno il `where` perdesse `target` — che e
    esattamente cio che era successo — l'impronta deve continuare a non
    corrispondere. Qui si misura la primitiva: due destinatari diversi, a
    parita di tutto il resto, devono dare due impronte diverse.
  */
  const base = {
    userId: UTENTE,
    channel: "email",
    purpose: "reset_password",
  };

  assert.notEqual(
    flussi.hashOtpCode(TOKEN, { ...base, target: SUO_INDIRIZZO }),
    flussi.hashOtpCode(TOKEN, { ...base, target: ALTRO_INDIRIZZO }),
    "un token spostato su un altro destinatario non deve corrispondere",
  );
  assert.equal(
    flussi.hashOtpCode(TOKEN, { ...base, target: SUO_INDIRIZZO }),
    flussi.hashOtpCode(TOKEN, { ...base, target: SUO_INDIRIZZO }),
    "e la funzione resta deterministica, o non sarebbe verificabile",
  );
});

test("l'impronta lega anche canale, scopo e utente, e non solo il destinatario", () => {
  /*
    Il legame nuovo si **aggiunge** ai tre che c'erano: se aggiungendo il
    destinatario si fosse perso uno degli altri, una riga spostata da un canale
    all'altro tornerebbe valida.
  */
  const base = {
    userId: UTENTE,
    channel: "email",
    purpose: "reset_password",
    target: SUO_INDIRIZZO,
  };
  const impronta = flussi.hashOtpCode(TOKEN, base);

  assert.notEqual(impronta, flussi.hashOtpCode(TOKEN, { ...base, channel: "phone" }));
  assert.notEqual(
    impronta,
    flussi.hashOtpCode(TOKEN, { ...base, purpose: "verify_email" }),
  );
  assert.notEqual(
    impronta,
    flussi.hashOtpCode(TOKEN, { ...base, userId: "un-altro-utente" }),
  );
});

test("un reset spegne ogni altra challenge viva dell'account", async () => {
  /*
    Il caso simmetrico del secondo Critical: chi cambia la password perche
    sospetta di essere stato compromesso non deve trovarsi in casa un codice
    altrui ancora valido. Un codice `login` gia emesso e una porta gia aperta —
    `challengePurposeCanMintSession` lo lascia coniare una sessione — e un
    reset invalida ogni sessione, quindi deve invalidare anche quelle.
  */
  monta(SUO_INDIRIZZO);
  fake.rows("authVerificationChallenge").push(
    sfida({
      id: "ch-login",
      purpose: "login",
      channel: "phone",
      target: "+393401234567",
      code_hash: "irrilevante",
    }),
  );

  await flussi.confirmPasswordReset({
    userId: UTENTE,
    token: TOKEN,
    password: PASSWORD_BUONA,
  });

  const vive = fake
    .rows("authVerificationChallenge")
    .filter((r) => r.consumed_at === null);
  assert.deepEqual(
    vive.map((r) => r.id),
    [],
    "nessuna challenge viva sopravvive a un reset: sono canali di accesso come le sessioni",
  );
});
