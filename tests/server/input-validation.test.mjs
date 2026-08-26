import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { before } from "node:test";

/**
 * La forma di un corpo la dichiara uno schema (R-04, F1-05, D14, WP-05).
 *
 * **Il difetto.** Ogni route handler coercizzava a mano —
 * `String(body?.email || "").trim()`, `Number(body?.amount)`,
 * `Boolean(body?.enabled)`. Tre conseguenze: regole diverse per lo stesso
 * campo, messaggi diversi per lo stesso errore, e nessun posto in cui leggere
 * cosa un endpoint accetta.
 *
 * **Cosa questi test proteggono.** Che gli schemi rifiutino cio che deve
 * essere rifiutato **e accettino cio che gia funzionava**: uno schema troppo
 * stretto e peggio di nessuno schema, perche rompe una cosa che andava. E
 * per questo che i due schemi piu aperti — registrazione e bando — sono
 * `passthrough`, e c'e un test che lo verifica invece di lasciarlo alla buona
 * memoria di chi legge.
 */

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");

let validation;
let schemas;

before(async () => {
  validation = await import("../../src/lib/validation/index.ts");
  schemas = await import("../../src/lib/validation/schemas.ts");
});

/* ------------------------------------------------ l'errore che produce */

test("un input malformato produce un errore con codice, non un messaggio a caso", () => {
  try {
    validation.parseInput(schemas.loginInputSchema, { email: "non-una-email" });
    assert.fail("doveva rifiutare");
  } catch (error) {
    assert.equal(error.code, "VALIDATION_ERROR");
    assert.equal(error.status, 400);
    assert.match(error.message, /email/i);
    assert.ok(error.issues.length >= 1);
  }
});

test("la risposta porta il codice nell'envelope, non dentro il testo", () => {
  let payload;
  try {
    validation.parseInput(schemas.loginInputSchema, {});
  } catch (error) {
    payload = validation.validationErrorPayload(error);
  }

  assert.equal(payload.data, null);
  assert.equal(payload.error.code, "VALIDATION_ERROR");
  assert.ok(
    payload.error.issues.length >= 1,
    "un client che vuole segnare i campi sbagliati deve poterli leggere",
  );
});

/* -------------------------------------------------- autenticazione */

test("il login normalizza l'email come faceva prima", () => {
  const input = validation.parseInput(schemas.loginInputSchema, {
    email: "  Mario.Rossi@Esempio.IT ",
    password: "qualunque",
  });

  assert.equal(input.email, "mario.rossi@esempio.it");
});

test("il login rifiuta un'email lunga oltre il massimo di RFC 5321", () => {
  assert.throws(() =>
    validation.parseInput(schemas.loginInputSchema, {
      email: `${"a".repeat(320)}@esempio.it`,
      password: "qualunque",
    }),
  );
});

test("la registrazione non scarta i dati anagrafici del form", () => {
  const input = validation.parseInput(schemas.registerInputSchema, {
    email: "nuovo@esempio.it",
    password: "qualunque",
    options: { data: { firstName: "Mario", createClub: true } },
  });

  assert.deepEqual(input.options.data, {
    firstName: "Mario",
    createClub: true,
  });
});

test("la forza della password non si valida qui", () => {
  const input = validation.parseInput(schemas.registerInputSchema, {
    email: "nuovo@esempio.it",
    password: "corta",
  });

  assert.equal(
    input.password,
    "corta",
    "la politica vive in password-policy.ts e resta l'unica a conoscerla",
  );
});

/* --------------------------------------------------------- denaro */

test("un incasso da zero o negativo non e un incasso", () => {
  for (const amount of [0, -50]) {
    assert.throws(
      () =>
        validation.parseInput(schemas.paymentTransactionInputSchema, {
          payment_id: "rata-1",
          amount,
        }),
      /maggiore di zero/,
      `importo ${amount} doveva essere rifiutato`,
    );
  }
});

test("un importo scritto come testo resta accettato, perche arriva da un form", () => {
  const input = validation.parseInput(schemas.paymentTransactionInputSchema, {
    payment_id: "rata-1",
    amount: "50.00",
  });

  assert.equal(input.amount, 50);
});

test("le due forme dei nomi arrivano alla stessa forma sola", () => {
  const snake = validation.parseInput(schemas.paymentTransactionInputSchema, {
    payment_id: "rata-1",
    amount: 30,
    payment_method: "Contanti",
    allow_overpayment: true,
  });
  const camel = validation.parseInput(schemas.paymentTransactionInputSchema, {
    paymentId: "rata-1",
    amount: 30,
    paymentMethod: "Contanti",
    allowOverpayment: true,
  });

  assert.deepEqual(snake, camel);
});

test("una data non leggibile viene rifiutata prima di arrivare al registro", () => {
  assert.throws(
    () =>
      validation.parseInput(schemas.paymentTransactionInputSchema, {
        payment_id: "rata-1",
        amount: 30,
        paid_at: "il mese scorso",
      }),
    /non valida/,
  );
});

/* ------------------------------------------------- piano e servizi */

test("un piano inventato non passa", () => {
  assert.throws(() =>
    validation.parseInput(schemas.entitlementWriteSchema, {
      operation: "plan",
      organization_id: "club-1",
      plan: "illimitato",
    }),
  );
});

test("senza `operation` si intende l'eccezione, come faceva la console", () => {
  const input = validation.parseInput(schemas.entitlementWriteSchema, {
    organization_id: "club-1",
    key: "online_payments",
    value: null,
  });

  assert.equal(input.operation, "override");
  assert.equal(
    input.value,
    null,
    "«togli l'eccezione» e diverso da «vieta»: i tre valori restano tre",
  );
});

/* ------------------------------------------------------ contributi */

test("le regole di un bando non si perdono nella validazione", () => {
  const input = validation.parseInput(schemas.fundingProgramInputSchema, {
    name: "Voucher Lazio 2025",
    athlete_plafond: 400,
    periods: [{ from: "2025-09-01", to: "2025-09-30" }],
    requirement: { unit: "hours", min: 8 },
  });

  assert.deepEqual(input.periods, [{ from: "2025-09-01", to: "2025-09-30" }]);
  assert.deepEqual(input.requirement, { unit: "hours", min: 8 });
});

test("un plafond negativo non si carica", () => {
  assert.throws(() =>
    validation.parseInput(schemas.fundingProgramInputSchema, {
      name: "Bando storto",
      athlete_plafond: -1,
    }),
  );
});

/* -------------------------------------------- le rotte lo usano */

const readFile = (relative) =>
  fs.readFileSync(path.join(PROJECT_ROOT, relative), "utf8");

test("gli endpoint a corpo chiuso passano dallo schema", () => {
  const rotte = [
    "src/app/api/v1/auth/login/route.ts",
    "src/app/api/v1/auth/register/route.ts",
    "src/app/api/v1/payment-transactions/route.ts",
    "src/app/api/v1/entitlements/route.ts",
    "src/app/api/v1/seasons/route.ts",
    "src/app/api/v1/funding/programs/route.ts",
  ];

  for (const rotta of rotte) {
    assert.match(
      readFile(rotta),
      /parseInput\(/,
      `${rotta} coercizza ancora a mano invece di dichiarare la forma del corpo`,
    );
  }
});

test("non e nata una seconda libreria di validazione", () => {
  const packageJson = JSON.parse(readFile("package.json"));
  const dipendenze = Object.keys(packageJson.dependencies || {});

  const concorrenti = dipendenze.filter((name) =>
    ["joi", "yup", "ajv", "superstruct", "valibot", "io-ts"].includes(name),
  );

  assert.deepEqual(
    concorrenti,
    [],
    "zod e gia una dipendenza: aggiungerne una seconda e l'errore numero 1 di CLAUDE.md",
  );
});
