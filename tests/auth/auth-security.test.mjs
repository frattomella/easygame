import assert from "node:assert/strict";
import test from "node:test";

import {
  PASSWORD_POLICY,
  validatePassword,
} from "../../src/lib/auth/password-policy.ts";
import { normalizePublicRegistrationRole } from "../../src/lib/auth/registration-policy.ts";
import {
  AUTH_RATE_LIMITS,
  buildRateLimitResult,
} from "../../src/lib/auth/rate-limit-policy.ts";
import {
  MAX_OTP_ATTEMPTS,
  shouldExposeVerificationPreviewCode,
} from "../../src/lib/auth/otp-policy.ts";
import {
  canDeliverPhoneOtp,
  isPhoneNumberRequiredAtSignup,
  isPhoneVerificationRequired,
  isSmsTransportConfigured,
} from "../../src/lib/auth/provider-policy.ts";

test("la password policy server-side richiede complessità e lunghezza", () => {
  assert.equal(PASSWORD_POLICY.minLength, 12);
  assert.equal(
    validatePassword("password123", "user@example.com").valid,
    false,
  );
  assert.equal(validatePassword("Short1!", "user@example.com").valid, false);
  assert.equal(
    validatePassword("Sicura-Molto-2026!", "user@example.com").valid,
    true,
  );
  assert.equal(
    validatePassword("User-Molto-2026!", "user@example.com").valid,
    false,
  );
});

test("la registrazione pubblica non può auto-assegnare ruoli privilegiati", () => {
  assert.equal(normalizePublicRegistrationRole("parent", false), "parent");
  assert.equal(normalizePublicRegistrationRole("trainer", false), "trainer");
  assert.equal(normalizePublicRegistrationRole("club_manager", false), "user");
  assert.equal(
    normalizePublicRegistrationRole("platform_admin", false),
    "user",
  );
  assert.equal(normalizePublicRegistrationRole("owner", true), "club_creator");
});

test("i codici test non sono mai esposti in produzione", () => {
  assert.equal(
    shouldExposeVerificationPreviewCode({
      NODE_ENV: "production",
      AUTH_ALLOW_TEST_CODES: "true",
    }),
    false,
  );
  assert.equal(
    shouldExposeVerificationPreviewCode({
      NODE_ENV: "development",
      AUTH_ALLOW_TEST_CODES: "false",
    }),
    false,
  );
  assert.equal(
    shouldExposeVerificationPreviewCode({
      NODE_ENV: "development",
      AUTH_ALLOW_TEST_CODES: "true",
    }),
    true,
  );
});

/**
 * **Il numero si chiede sempre; la verifica dipende dal canale (ADR-0115).**
 *
 * Il test di prima provava l'opposto — «la verifica SMS e proposta solo quando
 * il canale e disponibile» — e provava anche, senza dirlo, che senza le tre
 * variabili di Twilio il prodotto non aveva il concetto di cellulare. Quello
 * era il difetto, non la proprieta: il numero e un dato del prodotto e non una
 * funzione del fornitore.
 */
test("il cellulare e obbligatorio sempre, la verifica solo se consegnabile", () => {
  const produzioneMuta = { NODE_ENV: "production" };

  /* Il numero: obbligatorio ovunque, senza guardare l'ambiente. */
  assert.equal(isPhoneNumberRequiredAtSignup(), true);

  /* Senza trasporto e senza codici di prova non si puo consegnare niente. */
  assert.equal(isSmsTransportConfigured(produzioneMuta), false);
  assert.equal(canDeliverPhoneOtp(produzioneMuta), false);
  /*
    E cio che non si puo consegnare non si puo pretendere: pretenderlo
    chiuderebbe fuori ogni account nuovo di un'installazione senza contratto
    SMS. Il ripiego e dichiarato, non silenzioso: `/auth/providers` lo espone.
  */
  assert.equal(isPhoneVerificationRequired(produzioneMuta), false);

  /* Con un trasporto dichiarato la verifica torna a essere obbligatoria. */
  const conTrasporto = { NODE_ENV: "production", SMS_PROVIDER: "noop" };
  assert.equal(isSmsTransportConfigured(conTrasporto), true);
  assert.equal(isPhoneVerificationRequired(conTrasporto), true);

  /* E si puo spegnere per scelta esplicita, non per assenza di configurazione. */
  assert.equal(
    isPhoneVerificationRequired({
      ...conTrasporto,
      AUTH_REQUIRE_PHONE_VERIFICATION: "false",
    }),
    false,
  );

  /* In sviluppo i codici di prova valgono come canale. */
  assert.equal(
    isPhoneVerificationRequired({
      NODE_ENV: "development",
      AUTH_ALLOW_TEST_CODES: "true",
    }),
    true,
  );

  /*
    **Un nome di fornitore sconosciuto non e un fornitore.** Chi scrive male
    `SMS_PROVIDER` non deve credere di spedire: si comporta come se non ci
    fosse niente.
  */
  assert.equal(
    isSmsTransportConfigured({ NODE_ENV: "production", SMS_PROVIDER: "twilio" }),
    false,
  );
});

test("rate limiting e OTP bloccano oltre la soglia configurata", () => {
  const now = new Date("2026-08-21T10:00:00.000Z");
  const expiresAt = new Date(now.getTime() + 60_000);
  const policy = AUTH_RATE_LIMITS.otpConfirm;

  assert.equal(
    buildRateLimitResult(policy.limit, policy, expiresAt, now).allowed,
    true,
  );
  const blocked = buildRateLimitResult(
    policy.limit + 1,
    policy,
    expiresAt,
    now,
  );
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterSeconds, 60);
  assert.equal(MAX_OTP_ATTEMPTS, 5);
  assert.ok(AUTH_RATE_LIMITS.loginIdentity.limit > MAX_OTP_ATTEMPTS);
  assert.ok(AUTH_RATE_LIMITS.otpSend.limit < AUTH_RATE_LIMITS.otpConfirm.limit);
});
