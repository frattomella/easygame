import assert from "node:assert/strict";
import test from "node:test";

import {
  SMTP_CONFIG_ID,
  smtpConfigurationInputSchema,
  smtpTestInputSchema,
  toPublicSmtpConfiguration,
} from "../../src/lib/email/smtp-config.ts";
import {
  decryptCredential,
  encryptCredential,
  isCredentialEncryptionAvailable,
} from "../../src/lib/server/email/credential-crypto.ts";
import { resolveEmailVerificationPolicy } from "../../src/lib/auth/email-verification-policy.ts";

test("SMTP assente mantiene obbligatoria la verifica e non abilita sessioni", () => {
  assert.deepEqual(resolveEmailVerificationPolicy(false), {
    required: true,
    canSendOtp: false,
    allowUnverifiedSession: false,
  });
  assert.deepEqual(resolveEmailVerificationPolicy(true), {
    required: true,
    canSendOtp: true,
    allowUnverifiedSession: false,
  });
});

test("valida una configurazione SMTP TLS/SSL completa", () => {
  assert.equal(SMTP_CONFIG_ID, "smtp");
  const startTls = smtpConfigurationInputSchema.parse({
    enabled: true,
    host: "smtp.example.com",
    port: 587,
    securityMode: "starttls",
    username: "mailer@example.com",
    password: "smtp-secret",
    fromEmail: "noreply@example.com",
    fromName: "EasyGame",
  });
  assert.equal(startTls.securityMode, "starttls");
  assert.equal(
    smtpConfigurationInputSchema.safeParse({ ...startTls, port: 70000 })
      .success,
    false,
  );
  assert.equal(
    smtpConfigurationInputSchema.safeParse({ ...startTls, host: "localhost" })
      .success,
    false,
  );
  assert.equal(
    smtpTestInputSchema.safeParse({ to: "invalid-address" }).success,
    false,
  );
});

test("la configurazione pubblica non espone mai il segreto SMTP", () => {
  const publicConfig = toPublicSmtpConfiguration({
    enabled: true,
    host: "smtp.example.com",
    port: 465,
    security_mode: "ssl",
    username: "mailer@example.com",
    from_email: "noreply@example.com",
    from_name: "EasyGame",
    password_ciphertext: "encrypted-value",
    last_test_at: null,
    last_test_status: null,
  });
  assert.equal(publicConfig.passwordConfigured, true);
  assert.equal(Object.hasOwn(publicConfig, "password"), false);
  assert.equal(Object.hasOwn(publicConfig, "password_ciphertext"), false);
});

test("cifra la password SMTP con autenticazione e rileva alterazioni", () => {
  const previousSmtpSecret = process.env.SMTP_CREDENTIALS_SECRET;
  const previousAuthSecret = process.env.AUTH_RATE_LIMIT_SECRET;
  process.env.SMTP_CREDENTIALS_SECRET =
    "smtp-test-secret-with-at-least-32-characters";
  delete process.env.AUTH_RATE_LIMIT_SECRET;

  try {
    assert.equal(isCredentialEncryptionAvailable(), true);
    const plaintext = "password-che-non-deve-uscire";
    const encrypted = encryptCredential(plaintext);
    assert.equal(encrypted.ciphertext.includes(plaintext), false);
    assert.equal(decryptCredential(encrypted), plaintext);

    const tamperedBytes = Buffer.from(encrypted.ciphertext, "base64");
    tamperedBytes[0] ^= 1;
    assert.throws(
      () =>
        decryptCredential({
          ...encrypted,
          ciphertext: tamperedBytes.toString("base64"),
        }),
      /SMTP_CREDENTIAL_DECRYPTION_FAILED/,
    );
  } finally {
    if (previousSmtpSecret === undefined)
      delete process.env.SMTP_CREDENTIALS_SECRET;
    else process.env.SMTP_CREDENTIALS_SECRET = previousSmtpSecret;
    if (previousAuthSecret === undefined)
      delete process.env.AUTH_RATE_LIMIT_SECRET;
    else process.env.AUTH_RATE_LIMIT_SECRET = previousAuthSecret;
  }
});
