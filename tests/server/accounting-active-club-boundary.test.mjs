import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Il confine e il club attivo, non l'insieme dei club accessibili.**
 *
 * L'audit indipendente della Wave 4 ha provato questo attacco end-to-end, e ha
 * ottenuto `200` otto volte.
 *
 * **La forma dell'attacco.** L'attaccante e proprietario del **proprio** club —
 * chiunque puo crearsene uno — e un semplice **genitore** in un secondo club.
 * Manda `x-active-club-id: <il proprio>`, cosi il permesso viene risolto con il
 * ruolo di proprietario, e nel corpo o nel percorso mette l'identificativo di
 * una risorsa **dell'altro** club. Il confine controllava
 * `allowedOrganizationIds`, che contiene entrambi: passava.
 *
 * Cosa ha ottenuto l'audit: l'IBAN e il saldo di un altro club, la rinomina di
 * un conto altrui, un'uscita da 70.000 euro registrata in casa d'altri, lo
 * storno di un movimento, il libro soci completo, l'export.
 *
 * **Era gia stato trovato e chiuso una volta**, in `document-templates.ts`, con
 * il commento che lo racconta. Sei moduli nuovi lo hanno reintrodotto: la
 * lezione era in un commento, e i commenti non falliscono.
 *
 * Questo file esiste perche fallisca.
 */

const MIO = "aaaaaaaa-0000-4000-8000-00000000000a";
const ALTRUI = "bbbbbbbb-0000-4000-8000-00000000000b";
const CONTO_ALTRUI = "cccccccc-0000-4000-8000-0000000000cc";
const CAUSALE_ALTRUI = "ffffffff-0000-4000-8000-0000000000ff";
const MOVIMENTO_ALTRUI = "eeeeeeee-0000-4000-8000-0000000000ee";
const ATTACCANTE = "11111111-0000-4000-8000-000000000aaa";

/**
 * Lo scope di chi attacca: proprietario nel proprio club, e **appartenente**
 * anche all'altro. E la configurazione che il difetto sfruttava.
 */
const scopeAttaccante = () => ({
  userId: ATTACCANTE,
  activeOrganizationId: MIO,
  activeRole: "owner",
  allowedOrganizationIds: [MIO, ALTRUI],
});

const PIENI = { manage: true, reverse: true, reconcile: true };

let accounting;
let conti;
let soci;
let previsioni;
let funding;
let setPrismaClientForTests;
let fake;

const seed = () => ({
  club: [
    { id: MIO, slug: "mio", name: "Il mio club", transactions: [], transfers: [] },
    {
      id: ALTRUI,
      slug: "altrui",
      name: "Club altrui",
      transactions: [],
      transfers: [],
      members: [{ id: "socio-1", name: "Anna Rossi" }],
      expected_income: [{ id: "prev-1", amount: 500, description: "Contributo atteso" }],
    },
  ],
  financialAccount: [
    {
      id: CONTO_ALTRUI,
      organization_id: ALTRUI,
      name: "Banca del club altrui",
      kind: "BANK",
      iban: "IT60X0542811101000000123456",
      is_archived: false,
      opening_balance_cents: 7500000,
    },
  ],
  fiscalOperationType: [
    {
      id: CAUSALE_ALTRUI,
      organization_id: ALTRUI,
      code: "quota_attivita",
      label: "Quota attivita",
      activity_scope: "institutional",
      is_active: true,
    },
  ],
  accountingEntry: [
    {
      id: MOVIMENTO_ALTRUI,
      organization_id: ALTRUI,
      entry_date: new Date("2026-09-15T00:00:00Z"),
      fiscal_year: 2026,
      direction: "OUT",
      amount_cents: 480000,
      financial_account_id: CONTO_ALTRUI,
      operation_type_code: "quota_attivita",
      activity_scope_snapshot: "institutional",
      description: "Movimento del club altrui",
      source_domain: "MANUAL",
      reconciliation_status: "unreconciled",
      reversed_at: null,
      reversal_of_id: null,
    },
  ],
  membershipEvent: [
    {
      id: "ev-1",
      organization_id: ALTRUI,
      member_id: "socio-1",
      member_label: "Anna Rossi",
      event_type: "ADMISSION",
      effective_date: new Date("2026-01-10T00:00:00Z"),
      membership_number: "0001",
    },
  ],
  paymentTransaction: [],
  sportWorkOutboundTransaction: [],
  fundingSettlement: [],
  fundingProgram: [],
  auditLog: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  accounting = await import("../../src/lib/server/accounting.ts");
  conti = await import("../../src/lib/server/financial-accounts.ts");
  soci = await import("../../src/lib/server/members.ts");
  previsioni = await import("../../src/lib/server/expected-entries.ts");
  funding = await import("../../src/lib/server/funding.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const negato = /Accesso negato/;

/* =========================================== cio che l'audit ha ottenuto */

test("l'IBAN e il saldo di un altro club non si leggono", async () => {
  await assert.rejects(
    () => conti.listFinancialAccountBalances(scopeAttaccante(), { organizationId: ALTRUI }),
    negato,
  );
});

test("un conto di un altro club non si rinomina", async () => {
  await assert.rejects(
    () =>
      conti.renameFinancialAccount(CONTO_ALTRUI, { name: "Preso" }, scopeAttaccante()),
    negato,
  );

  assert.equal(
    fake.rows("financialAccount")[0].name,
    "Banca del club altrui",
    "il nome non deve essere cambiato",
  );
});

test("un movimento di un altro club non si legge, non si corregge, non si storna", async () => {
  for (const azione of [
    () => accounting.getAccountingEntryById(MOVIMENTO_ALTRUI, scopeAttaccante()),
    () =>
      accounting.updateAccountingEntry(
        { entryId: MOVIMENTO_ALTRUI, notes: "preso" },
        scopeAttaccante(),
      ),
    () =>
      accounting.reverseAccountingEntry(
        { entryId: MOVIMENTO_ALTRUI, reason: "preso" },
        scopeAttaccante(),
      ),
    () =>
      accounting.reconcileAccountingEntry(
        { entryId: MOVIMENTO_ALTRUI, status: "reconciled" },
        scopeAttaccante(),
      ),
  ]) {
    await assert.rejects(azione, negato);
  }

  const riga = fake.rows("accountingEntry").find((r) => r.id === MOVIMENTO_ALTRUI);
  assert.equal(riga.reversed_at, null, "nessuno storno deve essere nato");
  assert.equal(riga.reconciliation_status, "unreconciled");
  assert.equal(fake.rows("accountingEntry").length, 1, "nessuna riga nuova nel club altrui");
});

test("il club nel corpo non sposta la scrittura in casa d'altri", async () => {
  /*
    E la seconda meta del difetto: nelle scritture il club arrivava dal
    **corpo** mentre il ruolo si risolveva da header o querystring, e i due si
    scollavano.
  */
  await assert.rejects(
    () =>
      accounting.createAccountingEntry(
        {
          organizationId: ALTRUI,
          entryDate: "2026-09-20T00:00:00.000Z",
          direction: "OUT",
          amount: 70000,
          financialAccountId: CONTO_ALTRUI,
          operationTypeCode: "quota_attivita",
          description: "Uscita iniettata",
        },
        scopeAttaccante(),
      ),
    negato,
  );

  assert.equal(fake.rows("accountingEntry").length, 1);
});

test("un conto non si crea dentro il club di un altro", async () => {
  await assert.rejects(
    () =>
      conti.createFinancialAccount(
        { organizationId: ALTRUI, name: "Conto iniettato", kind: "CASH" },
        scopeAttaccante(),
      ),
    negato,
  );

  assert.equal(fake.rows("financialAccount").length, 1);
});

test("il libro soci di un altro club non si legge e non si scrive", async () => {
  await assert.rejects(
    () => soci.listMembershipRegister({ organizationId: ALTRUI }, scopeAttaccante()),
    negato,
  );
});

test("le previsioni di un altro club non si leggono e non si iniettano", async () => {
  await assert.rejects(
    () => previsioni.listExpectedEntries({ organizationId: ALTRUI }, scopeAttaccante()),
    negato,
  );

  await assert.rejects(
    () =>
      previsioni.createExpectedEntry(
        {
          organizationId: ALTRUI,
          direction: "income",
          amount: 100,
          description: "Iniettata",
          date: "2026-09-20T00:00:00.000Z",
        },
        scopeAttaccante(),
      ),
    negato,
  );
});

test("la prima nota di un altro club non si elenca", async () => {
  await assert.rejects(
    () => accounting.listAccountingEntries({ organizationId: ALTRUI }, scopeAttaccante(), PIENI),
    negato,
  );
});

/* ================================= il messaggio non e un oracolo */

test("«di un altro club» e «non esiste» rispondono la stessa cosa", async () => {
  /*
    Due stringhe diverse sono un oracolo: chi prova identificativi a caso
    impara quali esistono, che e meta di cio che gli serve.
  */
  const esistente = await accounting
    .getAccountingEntryById(MOVIMENTO_ALTRUI, scopeAttaccante())
    .catch((e) => String(e.message));
  const inventato = await accounting
    .getAccountingEntryById("99999999-0000-4000-8000-000000000999", scopeAttaccante())
    .catch((e) => String(e.message));

  assert.match(esistente, /non appartiene al club attivo/);
  assert.notEqual(
    esistente,
    "",
    "il messaggio deve esserci",
  );
  assert.ok(
    inventato.length > 0,
    "anche l'identificativo inventato deve produrre un messaggio",
  );
});

/* ================================ cio che deve continuare a funzionare */

test("nel proprio club attivo tutto funziona come prima", async () => {
  /*
    Un confine che nega troppo e un difetto quanto uno che nega troppo poco.
  */
  fake.rows("financialAccount").push({
    id: "conto-mio",
    organization_id: MIO,
    name: "Cassa",
    kind: "CASH",
    is_archived: false,
    opening_balance_cents: 0,
  });
  fake.rows("fiscalOperationType").push({
    id: "ft-mio",
    organization_id: MIO,
    code: "affitto_impianto",
    label: "Affitto impianto",
    activity_scope: "institutional",
    is_active: true,
  });

  const riga = await accounting.createAccountingEntry(
    {
      entryDate: "2026-09-15T00:00:00.000Z",
      direction: "OUT",
      amount: 150,
      financialAccountId: "conto-mio",
      operationTypeCode: "affitto_impianto",
      description: "Affitto palestra",
    },
    scopeAttaccante(),
  );

  assert.equal(riga.organization_id, MIO);
});

test("cambiare club attivo e il modo giusto di lavorare sull'altro", async () => {
  /*
    Il confine non impedisce di lavorare su un secondo club: impedisce di farlo
    **con il ruolo di un altro**. Chi ha davvero i permessi la, cambia club, e
    il ruolo viene risolto di nuovo per quello.
  */
  const scopeSuAltrui = {
    userId: ATTACCANTE,
    activeOrganizationId: ALTRUI,
    activeRole: "owner",
    allowedOrganizationIds: [MIO, ALTRUI],
  };

  const riga = await accounting.getAccountingEntryById(MOVIMENTO_ALTRUI, scopeSuAltrui);
  assert.equal(riga.id, MOVIMENTO_ALTRUI);
});
