import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * **N7, il lato della schermata: la copertura si raggiunge davvero.**
 *
 * Il dominio e provato altrove. Questa prova esiste perche una foundation
 * scritta, provata e irraggiungibile e la forma di difetto che CLAUDE.md §11.8
 * nomina, ed e gia successa a `board.read`, all'RSVP e — dentro questa stessa
 * lane — alla `PATCH` del programma, che esisteva e che nessun componente
 * chiamava.
 *
 * Misura tre cose: che il pulsante ci sia, che la finestra sappia allocare e
 * stornare, e che a schermo resti scritto che **una copertura non e un
 * incasso**.
 */

const leggi = (percorso) => readFileSync(percorso, "utf8");
const senzaCommenti = (testo) =>
  testo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

/* ------------------------------------------------------------------ */
/* Il percorso esiste, dal pulsante alla rotta                         */
/* ------------------------------------------------------------------ */

test("la rata offre un pulsante per la copertura", () => {
  const lista = senzaCommenti(
    leggi("src/components/payments/InstallmentLedgerList.tsx"),
  );

  assert.match(lista, /onManageCoverage\?:/);
  assert.match(lista, /Copri con un voucher/);
  assert.match(
    lista,
    /onManageCoverage && canManage/,
    "chi non gestisce i conti non deve vedere l'azione",
  );
});

test("la scheda pagamenti monta la finestra e le passa le due azioni", () => {
  const scheda = senzaCommenti(
    leggi("src/components/payments/AthletePaymentLedger.tsx"),
  );

  assert.match(scheda, /<CoverageDialog/);
  assert.match(scheda, /onAllocate=\{ledger\.allocateCoverage\}/);
  assert.match(scheda, /onReverse=\{ledger\.reverseCoverage\}/);
  assert.match(scheda, /onManageCoverage=\{\(installment\) => setCoverageTarget/);
});

test("le due azioni arrivano alla rotta della copertura", () => {
  const hook = senzaCommenti(
    leggi("src/components/payments/use-athlete-payment-ledger.ts"),
  );

  assert.match(hook, /"\/api\/v1\/payment-coverage"/);
  assert.match(hook, /action: "reverse"/);
  assert.match(
    hook,
    /idempotency_key:/,
    "il doppio clic non deve promettere due volte lo stesso denaro",
  );
});

test("la rotta esiste e non e chiusa dietro un alias", () => {
  const rotta = leggi("src/app/api/v1/payment-coverage/route.ts");

  assert.match(rotta, /export async function POST/);
  assert.match(rotta, /export async function GET/);
  assert.match(rotta, /allocateCoverage/);
  assert.match(rotta, /reverseCoverage/);
});

/* ------------------------------------------------------------------ */
/* La copertura non si legge come un incasso                           */
/* ------------------------------------------------------------------ */

test("a schermo resta scritto che una copertura non e un incasso", () => {
  /*
    E la frase che impedisce di leggere la copertura come cassa, ed e la
    ragione per cui ADR-0037 aveva rifiutato la compensazione automatica.
    Toglierla e togliere la difesa: chi legge «coperta per 500» accanto a una
    rata da 600 conclude da solo che ne sono entrati 500.
  */
  const finestra = leggi("src/components/payments/CoverageDialog.tsx");
  assert.match(finestra, /non e un incasso/);
  assert.match(finestra, /In cassa entra quando l&apos;ente versa/);

  const lista = leggi("src/components/payments/InstallmentLedgerList.tsx");
  assert.match(lista, /La copertura non e un incasso/);
});

test("le quattro grandezze dell'ente stanno in un riquadro separato", () => {
  const lista = leggi("src/components/payments/InstallmentLedgerList.tsx");

  assert.match(lista, /Coperta da voucher per/);
  assert.match(lista, /a carico\s*\n?\s*della famiglia/);
  assert.match(lista, /Maturato \{formatCurrency\(coverage\.accruedCoverage\)\}/);
  assert.match(lista, /liquidato dall&apos;ente/);
});

test("il riepilogo della famiglia continua a dire di chi e il denaro", () => {
  const scheda = leggi("src/components/payments/AthletePaymentLedger.tsx");
  assert.match(
    scheda,
    /Pagamenti della famiglia/,
    "i contributi non entrano in questi totali (ADR-0037)",
  );
});

/* ------------------------------------------------------------------ */
/* La finestra e il server vagliano con la stessa funzione             */
/* ------------------------------------------------------------------ */

test("client e server usano lo stesso vaglio", () => {
  /*
    Due idee di «quanto ci sta» divergono al primo caso limite, e chi le scopre
    e la segreteria davanti a un errore che non si aspettava.
  */
  const finestra = senzaCommenti(
    leggi("src/components/payments/CoverageDialog.tsx"),
  );
  const servizio = senzaCommenti(leggi("src/lib/server/payment-coverage.ts"));

  assert.match(finestra, /validateCoverageAllocation\(/);
  assert.match(servizio, /validateCoverageAllocation\(/);
});

test("la finestra offre solo le adesioni attive", () => {
  const finestra = senzaCommenti(
    leggi("src/components/payments/CoverageDialog.tsx"),
  );

  assert.match(
    finestra,
    /String\(overview\?\.enrollment\?\.status\) === "active"/,
    "non si promette copertura su un voucher revocato",
  );
});

/* ------------------------------------------------------------------ */
/* Nessuna scrittura di cassa dalla superficie                         */
/* ------------------------------------------------------------------ */

test("la superficie della copertura non chiama mai la rotta degli incassi", () => {
  const finestra = senzaCommenti(
    leggi("src/components/payments/CoverageDialog.tsx"),
  );

  assert.doesNotMatch(
    finestra,
    /payment-transactions/,
    "una copertura non passa mai per la rotta che scrive cassa",
  );
});
