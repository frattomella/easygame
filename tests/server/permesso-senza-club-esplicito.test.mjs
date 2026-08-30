import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **La porta chiusa a chi bussa e aperta a chi entra dal lato.**
 *
 * Il permesso di ruolo su contributi, moduli e compilazioni era stato messo
 * dentro `ensureOrganizationAccess`. Sembrava il posto giusto — e il punto in
 * cui passa il confine — ma `resolveOrganizationId` chiamava quella funzione
 * **solo** sul ramo in cui il chiamante nominava un club:
 *
 *     if (wanted) { ensureOrganizationAccess(scope, wanted); return wanted; }
 *     if (scope.activeOrganizationId) return scope.activeOrganizationId;   // niente
 *
 * Il percorso ordinario del client non nomina il club: manda l'intestazione
 * del club attivo e basta. Prendeva quindi il secondo ramo, dove non c'era
 * nessun controllo — e un genitore o un atleta leggeva l'elenco dei bandi con
 * dentro quali famiglie sono a voucher e per quanto, le compilazioni con
 * codice fiscale e tutori, e poteva **creare** un modulo a nome della societa.
 *
 * Il difetto non stava nel controllo: stava nel fatto che eseguirlo dipendeva
 * da come la richiesta era scritta.
 */

const CLUB = "cccccccc-4444-4000-8000-00000000000c";
const IO = "11111111-4444-4000-8000-000000000aaa";

const scopeGenitore = () => ({
  userId: IO,
  activeOrganizationId: CLUB,
  activeRole: "parent",
  allowedOrganizationIds: [CLUB],
});

let funding;
let forms;
let compilazioni;
let setPrismaClientForTests;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  funding = await import("../../src/lib/server/funding.ts");
  forms = await import("../../src/lib/server/forms.ts");
  compilazioni = await import("../../src/lib/server/form-submissions.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  const fake = createFakePrisma({
    club: [{ id: CLUB, slug: "club", name: "Il club" }],
  });
  setPrismaClientForTests(fake.client);
});

const negato = /Accesso negato/;

/*
  Ogni caso e eseguito **due volte**: nominando il club e tacendolo. Sono le
  due scritture della stessa richiesta, e devono ricevere la stessa risposta.
*/
const letture = [
  ["i bandi", (scope, org) => funding.listFundingPrograms({ organizationId: org }, scope)],
  ["le iscrizioni ai bandi", (scope, org) => funding.listFundingEnrollments({ organizationId: org }, scope)],
  ["i moduli", (scope, org) => forms.listFormTemplates(scope, { organizationId: org })],
  ["le compilazioni", (scope, org) => compilazioni.listFormSubmissions(scope, { organizationId: org })],
];

for (const [nome, leggi] of letture) {
  test(`${nome}: negati sia nominando il club sia tacendolo`, async () => {
    await assert.rejects(() => leggi(scopeGenitore(), CLUB), negato, "col club nominato");
    await assert.rejects(() => leggi(scopeGenitore(), null), negato, "col club taciuto");
  });
}

test("creare un modulo a nome della societa e negato anche senza nominare il club", async () => {
  await assert.rejects(
    () => forms.createFormTemplate(scopeGenitore(), { organizationId: null }),
    negato,
  );
});

test("chi tiene i conti legge, con o senza il club nominato", async () => {
  const scopeOwner = { ...scopeGenitore(), activeRole: "owner" };
  for (const [nome, leggi] of letture) {
    await leggi(scopeOwner, CLUB);
    await leggi(scopeOwner, null);
    assert.ok(true, nome);
  }
});
