import assert from "node:assert/strict";
import test from "node:test";

import {
  IMAP_CONFIG_ID,
  imapConfigurationInputSchema,
  toPublicImapConfiguration,
} from "../../src/lib/email/imap-config.ts";
import {
  decryptCredential,
  encryptCredential,
} from "../../src/lib/server/email/credential-crypto.ts";
import {
  containsLineBreak,
  createImapLoginConversation,
  quoteImapString,
} from "../../src/lib/server/email/imap-protocol.ts";

/**
 * Blocco 4 — casella IMAP di piattaforma.
 *
 * Il requisito di prodotto e "credenziali SMTP e IMAP separate": qui si
 * verifica che la separazione sia reale anche a livello crittografico, non
 * solo due righe su due tabelle.
 */

const withCredentialSecret = (run) => {
  const previousSmtp = process.env.SMTP_CREDENTIALS_SECRET;
  const previousAuth = process.env.AUTH_RATE_LIMIT_SECRET;
  process.env.SMTP_CREDENTIALS_SECRET =
    "imap-test-secret-with-at-least-32-characters";
  delete process.env.AUTH_RATE_LIMIT_SECRET;

  try {
    run();
  } finally {
    if (previousSmtp === undefined) delete process.env.SMTP_CREDENTIALS_SECRET;
    else process.env.SMTP_CREDENTIALS_SECRET = previousSmtp;
    if (previousAuth === undefined) delete process.env.AUTH_RATE_LIMIT_SECRET;
    else process.env.AUTH_RATE_LIMIT_SECRET = previousAuth;
  }
};

test("valida una configurazione IMAP SSL e rifiuta host e porte impossibili", () => {
  assert.equal(IMAP_CONFIG_ID, "imap");

  const parsed = imapConfigurationInputSchema.parse({
    enabled: true,
    host: "imap.example.com",
    port: 993,
    securityMode: "ssl",
    username: "casella@example.com",
    password: "imap-secret",
  });
  assert.equal(parsed.securityMode, "ssl");

  assert.equal(
    imapConfigurationInputSchema.safeParse({ ...parsed, port: 0 }).success,
    false,
  );
  assert.equal(
    imapConfigurationInputSchema.safeParse({ ...parsed, host: "localhost" })
      .success,
    false,
  );
  assert.equal(
    imapConfigurationInputSchema.safeParse({
      ...parsed,
      host: "imaps://imap.example.com",
    }).success,
    false,
  );
  assert.equal(
    imapConfigurationInputSchema.safeParse({ ...parsed, securityMode: "none" })
      .success,
    false,
  );
});

test("la password IMAP non compare mai nella configurazione pubblica", () => {
  const publicConfig = toPublicImapConfiguration({
    enabled: true,
    host: "imap.example.com",
    port: 143,
    security_mode: "starttls",
    username: "casella@example.com",
    password_ciphertext: "encrypted-value",
    last_test_at: null,
    last_test_status: null,
  });

  assert.equal(publicConfig.passwordConfigured, true);
  assert.equal(publicConfig.securityMode, "starttls");
  assert.equal(Object.hasOwn(publicConfig, "password"), false);
  assert.equal(Object.hasOwn(publicConfig, "password_ciphertext"), false);
  // IMAP non ha mittente: se comparisse, qualcuno avrebbe riusato lo schema SMTP.
  assert.equal(Object.hasOwn(publicConfig, "fromEmail"), false);
});

test("una credenziale IMAP non e decifrabile come credenziale SMTP", () => {
  withCredentialSecret(() => {
    const secret = "password-della-casella";
    const encrypted = encryptCredential(secret, "imap");

    assert.equal(decryptCredential(encrypted, "imap"), secret);
    assert.throws(
      () => decryptCredential(encrypted),
      /SMTP_CREDENTIAL_DECRYPTION_FAILED/,
      "il contesto crittografico separa davvero le due famiglie di credenziali",
    );
  });
});

test("le credenziali SMTP gia salvate restano leggibili", () => {
  withCredentialSecret(() => {
    // Il valore di default deve restare "smtp": cambiarlo renderebbe illeggibili
    // le password gia in archivio.
    const encrypted = encryptCredential("segreto-smtp");
    assert.equal(decryptCredential(encrypted, "smtp"), "segreto-smtp");
  });
});

test("la quotatura IMAP protegge virgolette e barre rovesciate", () => {
  assert.equal(quoteImapString('pa"ss'), '"pa\\"ss"');
  assert.equal(quoteImapString("pa\\ss"), '"pa\\\\ss"');
  assert.equal(containsLineBreak("riga1\r\nriga2"), true);
  assert.equal(containsLineBreak("password"), false);
});

test("conversazione IMAP su SSL: saluto, LOGIN, LOGOUT", () => {
  const conversation = createImapLoginConversation({
    username: "casella@example.com",
    password: "segreto",
    securityMode: "ssl",
  });

  assert.deepEqual(conversation.start(), { kind: "wait" });

  const afterGreeting = conversation.receive("* OK IMAP4rev1 pronto");
  assert.equal(afterGreeting.kind, "send");
  assert.match(afterGreeting.command, /^A2 LOGIN "casella@example\.com" "segreto"$/);

  const afterLogin = conversation.receive("A2 OK LOGIN completed");
  assert.deepEqual(afterLogin, { kind: "send", command: "A3 LOGOUT" });

  assert.deepEqual(conversation.receive("* BYE arrivederci"), { kind: "wait" });
  assert.deepEqual(conversation.receive("A3 OK LOGOUT completed"), {
    kind: "done",
  });
});

test("conversazione IMAP su STARTTLS: nessun LOGIN prima dell'upgrade", () => {
  const conversation = createImapLoginConversation({
    username: "casella@example.com",
    password: "segreto",
    securityMode: "starttls",
  });

  conversation.start();
  assert.deepEqual(conversation.receive("* OK pronto"), {
    kind: "send",
    command: "A1 STARTTLS",
  });
  assert.deepEqual(conversation.receive("A1 OK begin TLS"), {
    kind: "starttls",
  });

  const afterUpgrade = conversation.afterStartTls();
  assert.equal(afterUpgrade.kind, "send");
  assert.match(afterUpgrade.command, /^A2 LOGIN /);
});

test("STARTTLS rifiutato interrompe la sessione invece di autenticarsi in chiaro", () => {
  const conversation = createImapLoginConversation({
    username: "casella@example.com",
    password: "segreto",
    securityMode: "starttls",
  });

  conversation.start();
  conversation.receive("* OK pronto");
  assert.deepEqual(conversation.receive("A1 BAD comando sconosciuto"), {
    kind: "fail",
    code: "IMAP_TLS_REQUIRED",
  });
});

test("credenziali rifiutate producono IMAP_AUTH_FAILED", () => {
  const conversation = createImapLoginConversation({
    username: "casella@example.com",
    password: "sbagliata",
    securityMode: "ssl",
  });

  conversation.start();
  conversation.receive("* OK pronto");
  assert.deepEqual(conversation.receive("A2 NO credenziali non valide"), {
    kind: "fail",
    code: "IMAP_AUTH_FAILED",
  });
});

test("un a capo nelle credenziali non arriva mai sul socket", () => {
  const conversation = createImapLoginConversation({
    username: "casella@example.com",
    password: "segreto\r\nA9 DELETE INBOX",
    securityMode: "ssl",
  });

  assert.deepEqual(conversation.start(), {
    kind: "fail",
    code: "IMAP_CONFIGURATION_INVALID",
  });
  // Dopo il rifiuto la macchina resta muta: nessun comando puo partire.
  assert.deepEqual(conversation.receive("* OK pronto"), { kind: "wait" });
});
