import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractRetryAfterFromMessage,
  interpretAckResponse,
  interpretAuthResponse,
  interpretPasswordResetResponse,
  parseRetryAfterSeconds,
  pickVerificationChannel,
} from "../client/lib/auth-flow";

// --- register → verifica richiesta -----------------------------------

test("register: risposta 202 con verification → verification_required su email", () => {
  const outcome = interpretAuthResponse({
    status: 202,
    data: {
      user: null,
      session: null,
      verification: {
        userId: "verify_abc",
        email: "m***@esempio.it",
        phone: "+39•••567",
        emailRequired: true,
        phoneRequired: false,
      },
    },
    error: null,
  });

  assert.equal(outcome.kind, "verification_required");
  if (outcome.kind === "verification_required") {
    assert.equal(outcome.channel, "email");
    assert.equal(outcome.verification.userId, "verify_abc");
  }
});

test("register: un vecchio controllo su status 201 avrebbe rifiutato una registrazione riuscita", () => {
  // Il bug reale del client: /api/v1/auth/register risponde sempre 202, mai
  // 201. Questo test blinda che l'interpretazione non dipenda da quello.
  const outcome = interpretAuthResponse({
    status: 202,
    data: { user: null, session: null, verification: { userId: "verify_x" } },
    error: null,
  });
  assert.notEqual(outcome.kind, "error");
});

// --- login: account verificato vs bloccato ----------------------------

test("login: sessione presente → authenticated", () => {
  const outcome = interpretAuthResponse({
    status: 200,
    data: {
      user: { id: "u1", email: "a@b.it" },
      session: { access_token: "tok_123" },
    },
    error: null,
  });

  assert.deepEqual(outcome, {
    kind: "authenticated",
    user: { id: "u1", email: "a@b.it" },
    session: { access_token: "tok_123" },
  });
});

test("login: telefono da verificare (PHONE_NOT_VERIFIED) → verification_required su phone", () => {
  const outcome = interpretAuthResponse({
    status: 403,
    data: {
      user: { id: "u1" },
      session: null,
      verification: {
        userId: "verify_xyz",
        phone: "+39•••999",
        emailRequired: false,
        phoneRequired: true,
      },
    },
    error: { message: "Telefono non verificato", code: "PHONE_NOT_VERIFIED" },
  });

  assert.equal(outcome.kind, "verification_required");
  if (outcome.kind === "verification_required") {
    assert.equal(outcome.channel, "phone");
  }
});

test("login: credenziali errate → error con il messaggio del server", () => {
  const outcome = interpretAuthResponse({
    status: 401,
    data: { user: null, session: null },
    error: { message: "Email o password non corretti" },
  });

  assert.deepEqual(outcome, {
    kind: "error",
    message: "Email o password non corretti",
    code: undefined,
  });
});

// --- OTP: codice non valido/scaduto (il backend non li distingue) ----

test("OTP non valido o scaduto → error con il messaggio unico del backend", () => {
  const outcome = interpretAuthResponse({
    status: 400,
    data: null,
    error: { message: "Codice non valido o scaduto" },
  });

  assert.equal(outcome.kind, "error");
  if (outcome.kind === "error") {
    assert.equal(outcome.message, "Codice non valido o scaduto");
  }
});

test("OTP confermato ma resta un secondo canale → verification_required incatenato", () => {
  const outcome = interpretAuthResponse({
    status: 200,
    data: {
      user: { id: "u1" },
      session: null,
      verification: {
        userId: "verify_abc",
        emailRequired: false,
        phoneRequired: true,
        phone: "+39•••999",
      },
    },
    error: null,
  });

  assert.equal(outcome.kind, "verification_required");
  if (outcome.kind === "verification_required") {
    assert.equal(outcome.channel, "phone");
  }
});

// --- rate limiting -----------------------------------------------------

test("limite di frequenza con intestazione Retry-After → retryAfterSeconds numerico", () => {
  const outcome = interpretAuthResponse({
    status: 429,
    data: { user: null, session: null },
    error: {
      message: "Troppe richieste. Riprova più tardi.",
      code: "RATE_LIMITED",
    },
    retryAfterHeader: "42",
  });

  assert.deepEqual(outcome, {
    kind: "rate_limited",
    message: "Troppe richieste. Riprova più tardi.",
    retryAfterSeconds: 42,
  });
});

test("cooldown di reinvio (RESEND_TOO_SOON) senza intestazione → legge i secondi dal messaggio", () => {
  const outcome = interpretAuthResponse({
    status: 429,
    data: null,
    error: {
      message: "Attendi 37 secondi prima di richiedere un altro codice.",
      code: "RESEND_TOO_SOON",
    },
  });

  assert.equal(outcome.kind, "rate_limited");
  if (outcome.kind === "rate_limited") {
    assert.equal(outcome.retryAfterSeconds, 37);
  }
});

test("parseRetryAfterSeconds ignora valori non numerici o non positivi", () => {
  assert.equal(parseRetryAfterSeconds(null), null);
  assert.equal(parseRetryAfterSeconds(""), null);
  assert.equal(parseRetryAfterSeconds("0"), null);
  assert.equal(parseRetryAfterSeconds("-5"), null);
  assert.equal(parseRetryAfterSeconds("abc"), null);
  assert.equal(parseRetryAfterSeconds("12.4"), 13);
});

test("extractRetryAfterFromMessage legge il numero di secondi dalla frase italiana", () => {
  assert.equal(
    extractRetryAfterFromMessage(
      "Attendi 5 secondi prima di richiedere un altro codice.",
    ),
    5,
  );
  assert.equal(
    extractRetryAfterFromMessage("Troppe richieste. Riprova più tardi."),
    null,
  );
  assert.equal(extractRetryAfterFromMessage(null), null);
});

// --- resend / forgot password (stessa forma {sent, message}) ---------

test("resend riuscito → sent con il messaggio del backend", () => {
  const outcome = interpretAckResponse({
    status: 200,
    data: { sent: true, message: null },
    error: null,
  });
  assert.deepEqual(outcome, { kind: "sent", message: "Fatto." });
});

test("forgot-password risponde sempre allo stesso modo, esista o no l'account", () => {
  const generic =
    "Se l'indirizzo è associato a un account, ti abbiamo inviato le istruzioni.";
  const forAnyEmail = interpretAckResponse({
    status: 200,
    data: { sent: true, message: generic },
    error: null,
  });
  assert.deepEqual(forAnyEmail, { kind: "sent", message: generic });
});

test("resend: limite di frequenza → rate_limited", () => {
  const outcome = interpretAckResponse({
    status: 429,
    data: null,
    error: {
      message: "Troppi reinvii. Riprova più tardi.",
      code: "RATE_LIMITED",
    },
    retryAfterHeader: "60",
  });
  assert.equal(outcome.kind, "rate_limited");
  if (outcome.kind === "rate_limited") {
    assert.equal(outcome.retryAfterSeconds, 60);
  }
});

test("resend: errore generico quando il backend non conferma l'invio", () => {
  const outcome = interpretAckResponse({
    status: 503,
    data: null,
    error: {
      message: "Il servizio email non è configurato.",
      code: "SMTP_CONFIGURATION_INVALID",
    },
  });
  assert.deepEqual(outcome, {
    kind: "error",
    message: "Il servizio email non è configurato.",
    code: "SMTP_CONFIGURATION_INVALID",
  });
});

// --- scelta del canale --------------------------------------------------

test("pickVerificationChannel preferisce phone solo se email non è più richiesta", () => {
  assert.equal(
    pickVerificationChannel({
      userId: "x",
      emailRequired: true,
      phoneRequired: true,
    }),
    "email",
  );
  assert.equal(
    pickVerificationChannel({
      userId: "x",
      emailRequired: false,
      phoneRequired: true,
    }),
    "phone",
  );
  assert.equal(pickVerificationChannel({ userId: "x" }), "email");
  assert.equal(pickVerificationChannel(null), "email");
});

// --- completamento reset password (WP11) --------------------------------

test("reset password: 200 con reset:true → success", () => {
  const outcome = interpretPasswordResetResponse({
    status: 200,
    data: { reset: true, message: "Password aggiornata." },
    error: null,
  });
  assert.deepEqual(outcome, {
    kind: "success",
    message: "Password aggiornata.",
  });
});

test("reset password: token invalido, scaduto e già usato condividono lo stesso stato — il server non li distingue di proposito", () => {
  const messaggioUnico = "Link di reset non valido o scaduto";
  for (const status of [400]) {
    const outcome = interpretPasswordResetResponse({
      status,
      data: null,
      error: { message: messaggioUnico, code: "PASSWORD_RESET_FAILED" },
    });
    assert.equal(outcome.kind, "token_invalid");
    assert.equal(outcome.message, messaggioUnico);
  }
});

test("reset password: un'altra frase di errore è la regola sulla password, non il token", () => {
  const outcome = interpretPasswordResetResponse({
    status: 400,
    data: null,
    error: {
      message: "La password deve contenere almeno 12 caratteri",
      code: "PASSWORD_RESET_FAILED",
    },
  });
  assert.deepEqual(outcome, {
    kind: "policy_error",
    message: "La password deve contenere almeno 12 caratteri",
  });
});

test("reset password: 429 → rate_limited con i secondi di attesa", () => {
  const outcome = interpretPasswordResetResponse({
    status: 429,
    data: null,
    error: {
      message: "Troppi tentativi. Riprova più tardi.",
      code: "RATE_LIMITED",
    },
    retryAfterHeader: "30",
  });
  assert.equal(outcome.kind, "rate_limited");
  if (outcome.kind === "rate_limited") {
    assert.equal(outcome.retryAfterSeconds, 30);
  }
});

test("reset password: nessun messaggio d'errore e nessun successo → error generico, mai un crash", () => {
  const outcome = interpretPasswordResetResponse({
    status: 500,
    data: null,
    error: null,
  });
  assert.equal(outcome.kind, "error");
});
