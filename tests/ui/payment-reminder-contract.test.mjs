import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Il contratto del sollecito degli insoluti (W1-F, PP-4).
 *
 * `tests/server/payment-reminders.test.mjs` difende **cosa fa** il sollecito.
 * Questo difende **da dove esce**: un solo punto di invio email, nessun
 * secondo canale, nessun `fetch` diretto a `/api` dalla schermata.
 *
 * Sono test statici sul sorgente. Non provano che l'applicazione funzioni:
 * provano che la regola non e stata aggirata in un posto nuovo — che e
 * l'errore che questo repository ha gia commesso con i toast, con lo storage
 * mobile e con le dashboard dell'allenatore.
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
};

const APP_FILES = walk(SRC);
const rel = (file) => path.relative(SRC, file).replace(/\\/g, "/");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8");

/** Le superfici che il sollecito ha portato con se. */
const REMINDER_SURFACES = [
  "lib/server/payment-reminders.ts",
  "app/api/v1/payment-reminders/route.ts",
  "lib/api/payment-reminders.ts",
  "components/payments/PaymentReminderDialog.tsx",
];

test("il trasporto email resta dentro src/lib/server/email/", () => {
  const offenders = APP_FILES.filter((file) => {
    const name = rel(file);
    if (name.startsWith("lib/server/email/")) return false;
    const source = readFileSync(file, "utf8");
    return (
      /from\s+["']nodemailer["']/.test(source) ||
      /createTransport\s*\(/.test(source)
    );
  }).map(rel);

  assert.deepEqual(
    offenders,
    [],
    "un secondo punto di invio email e la cosa che CLAUDE.md §2 vieta esplicitamente",
  );
});

test("il sollecito manda dal servizio email, non da un canale proprio", () => {
  const source = read("lib/server/payment-reminders.ts");

  assert.match(
    source,
    /from\s+["']\.\/email\/email-service["']/,
    "il postino predefinito deve venire da src/lib/server/email/",
  );
  assert.doesNotMatch(
    source,
    /nodemailer|createTransport|smtp\.|sendmail/i,
    "il modulo di dominio non conosce il trasporto",
  );
});

/**
 * Il codice senza i commenti.
 *
 * Serve dove la regola vieta una **parola**: i commenti di questi moduli
 * dichiarano cosa non fanno («niente SMS»), e cercare la parola nel file
 * intero farebbe fallire il test proprio sulla frase che promette la regola.
 */
const withoutComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("il sollecito non apre un secondo canale di notifica", () => {
  for (const name of REMINDER_SURFACES) {
    const source = withoutComments(read(name));
    assert.doesNotMatch(
      source,
      /twilio|sendSms|\bSMS\b|whatsapp|firebase|onesignal|expo-notifications/i,
      `${name}: Wave 1 e email piu notifica in-app, e nient'altro (PP-4)`,
    );
  }
});

test("la schermata del sollecito non parla con /api da sola", () => {
  const source = read("components/payments/PaymentReminderDialog.tsx");

  assert.doesNotMatch(
    source,
    /fetch\(\s*["'`]\/api/,
    "un componente passa da src/lib/api/, mai da un fetch proprio (CLAUDE.md §2)",
  );
  assert.match(
    source,
    /from\s+["']@\/lib\/api\/payment-reminders["']/,
    "il trasporto del sollecito vive in src/lib/api/",
  );
});

test("l'anteprima mostra i due elenchi, e il secondo porta il motivo", () => {
  const source = read("components/payments/PaymentReminderDialog.tsx");

  assert.match(source, /Raggiungibili \(/, "manca l'elenco dei raggiungibili");
  assert.match(
    source,
    /Non raggiungibili \(/,
    "chi non e raggiungibile si vede, non si perde",
  );
  for (const reason of [
    "no_guardian",
    "no_email",
    "no_account",
    "already_reminded",
  ]) {
    assert.match(
      source,
      new RegExp(`\\b${reason}\\b`),
      `${reason}: ogni motivo deve avere un'etichetta leggibile`,
    );
  }
});

test("la finestra del sollecito impila invece di scorrere in orizzontale", () => {
  const source = read("components/payments/PaymentReminderDialog.tsx");

  assert.doesNotMatch(
    source,
    /<table|<Table\b/,
    "a 375 px una tabella nasconderebbe proprio la colonna del motivo",
  );
  assert.match(
    source,
    /max-h-\[90vh\] overflow-y-auto/,
    "un dialogo piu alto della finestra e un dialogo il cui pulsante non si raggiunge",
  );
});

test("il pulsante di invio si disabilita mentre l'invio e in corso", () => {
  const source = read("components/payments/PaymentReminderDialog.tsx");

  assert.match(
    source,
    /disabled=\{sending \|\| loading \|\| !preview\?\.canSend\}/,
    "il doppio clic non deve nemmeno partire dalla schermata",
  );
});

test("l'elenco pagamenti offre la selezione multipla e l'azione «Sollecita»", () => {
  const source = read("app/movements/page.tsx");

  assert.match(source, /useListSelection\(\)/, "la selezione e quella condivisa");
  assert.match(source, /<BulkSelectionToolbar/, "manca la barra delle azioni");
  assert.match(source, /<SelectRowCheckbox/, "manca la casella di riga");
  assert.match(source, /<SelectAllCheckbox/, "manca «seleziona tutti visibili»");
  assert.match(source, /Sollecita/, "manca l'azione di massa");
  assert.match(
    source,
    /<PaymentReminderDialog/,
    "l'azione deve aprire l'anteprima, non inviare al primo clic",
  );
});

test("la rotta del sollecito e registrata dove le rotte si dichiarano", () => {
  assert.match(
    read("lib/api/registry.ts"),
    /\/api\/v1\/payment-reminders/,
    "src/lib/api/registry.ts",
  );
  assert.match(
    readFileSync(path.join(ROOT, "docs", "api-registry.md"), "utf8"),
    /\/api\/v1\/payment-reminders/,
    "docs/api-registry.md",
  );
});
