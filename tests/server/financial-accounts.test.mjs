import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * I **conti finanziari** e il loro saldo derivato (Wave 4, lane W4-A).
 *
 * Quattro cose vanno dimostrate, e sono le quattro che il difetto chiuso da
 * questa lane rendeva impossibili:
 *
 * 1. **il saldo e la somma dei movimenti.** Non una colonna mutata a mano dal
 *    browser: apertura piu prima nota piu incassi meno uscite del lavoro
 *    sportivo piu liquidazioni. Una coppia originale/storno non lo muove, e un
 *    giroconto non cambia la liquidita totale del club;
 * 2. **un conto non si cancella.** Non esiste una funzione che lo faccia, e
 *    nessuna scrittura del modulo emette una `delete` su `financialAccount`:
 *    si archivia, e la riga resta;
 * 3. **il confine multi-tenant tiene.** Un conto di un altro club non si legge,
 *    non si rinomina e non si archivia: «Accesso negato», e mai i dati;
 * 4. **i permessi sono quelli della matrice.** Segreteria e staff vedono
 *    l'elenco dei conti — senza l'elenco non si registra un movimento — e
 *    **non** i saldi; l'allenatore non vede niente.
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";
const CASSA_A = "11111111-0000-4000-8000-00000000000a";
const BANCA_A = "22222222-0000-4000-8000-00000000000b";
const CONTO_B = "33333333-0000-4000-8000-00000000000c";

const scope = (organizationId, role, userId = "user-1") => ({
  userId,
  activeOrganizationId: organizationId,
  activeRole: role,
  allowedOrganizationIds: [organizationId],
});

const owner = () => scope(CLUB_A, "owner");
const ownerB = () => scope(CLUB_B, "owner", "user-b");
const segreteria = () => scope(CLUB_A, "collaborator");
const staff = () => scope(CLUB_A, "staff");
const allenatore = () => scope(CLUB_A, "trainer");

let service;
let setPrismaClientForTests;
let fake;

const conto = (id, organizationId, name, overrides = {}) => ({
  id,
  organization_id: organizationId,
  name,
  kind: "BANK",
  iban: null,
  bank_name: null,
  site_id: null,
  opening_balance_cents: 0,
  opening_balance_at: null,
  legacy_account_id: null,
  is_archived: false,
  archived_at: null,
  notes: null,
  created_by: null,
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
});

/** Una riga di prima nota. Gli importi sono gia in centesimi. */
const movimento = (id, accountId, direction, amountCents, overrides = {}) => ({
  id,
  organization_id: CLUB_A,
  financial_account_id: accountId,
  direction,
  amount_cents: amountCents,
  entry_date: new Date("2026-03-01T00:00:00Z"),
  fiscal_year: 2026,
  source_domain: "MANUAL",
  transfer_group_id: null,
  reversal_of_id: null,
  reversed_at: null,
  operation_type_code: "quota_attivita",
  ...overrides,
});

/** Un incasso. `amount` e in **euro**, come nella tabella vera. */
const incasso = (id, accountId, amount, overrides = {}) => ({
  id,
  organization_id: CLUB_A,
  financial_account_id: accountId,
  amount,
  paid_at: new Date("2026-03-02T00:00:00Z"),
  payment_method: "cash",
  reversed_at: null,
  reverses_transaction_id: null,
  operation_type_code: null,
  ...overrides,
});

/** Un'erogazione del lavoro sportivo: esce il **netto**. */
const erogazione = (id, accountId, netAmount, overrides = {}) => ({
  id,
  organization_id: CLUB_A,
  financial_account_id: accountId,
  transaction_type: "COMPENSATION_PAYMENT",
  gross_amount: netAmount,
  net_amount: netAmount,
  paid_at: new Date("2026-03-03T00:00:00Z"),
  fiscal_year: 2026,
  reversal_of_id: null,
  reversed_at: null,
  ...overrides,
});

const liquidazione = (id, accountId, amount, overrides = {}) => ({
  id,
  organization_id: CLUB_A,
  financial_account_id: accountId,
  amount,
  settled_at: new Date("2026-03-04T00:00:00Z"),
  reversal_of_id: null,
  reversed_at: null,
  ...overrides,
});

const seed = () => ({
  financialAccount: [
    conto(CASSA_A, CLUB_A, "Cassa", {
      kind: "CASH",
      opening_balance_cents: 10_000,
      opening_balance_at: new Date("2026-01-01T00:00:00Z"),
    }),
    conto(BANCA_A, CLUB_A, "Banca", { opening_balance_cents: 500_000 }),
    conto(CONTO_B, CLUB_B, "Cassa"),
  ],
  accountingEntry: [],
  paymentTransaction: [],
  sportWorkOutboundTransaction: [],
  fundingSettlement: [],
  club: [{ id: CLUB_A, club_sites: [] }, { id: CLUB_B, club_sites: [] }],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  service = await import("../../src/lib/server/financial-accounts.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const rejects = (promise, pattern) =>
  assert.rejects(promise, (error) => {
    assert.match(String(error.message), pattern);
    return true;
  });

const saldoDi = async (accountId, chi = owner()) =>
  (await service.getFinancialAccountBalance(accountId, chi)).balanceCents;

// --- il saldo derivato ------------------------------------------------------

test("il saldo di un conto senza movimenti e il suo saldo di apertura", async () => {
  assert.equal(await saldoDi(CASSA_A), 10_000);
  assert.equal(await saldoDi(BANCA_A), 500_000);
});

test("apertura piu entrate meno uscite: il saldo e la somma dei movimenti", async () => {
  fake.rows("accountingEntry").push(
    movimento("m1", CASSA_A, "IN", 25_000),
    movimento("m2", CASSA_A, "OUT", 4_000),
    movimento("m3", CASSA_A, "OUT", 1_000),
  );

  assert.equal(await saldoDi(CASSA_A), 10_000 + 25_000 - 4_000 - 1_000);
});

test("una coppia originale/storno non muove il saldo", async () => {
  const prima = await saldoDi(BANCA_A);

  fake.rows("accountingEntry").push(
    movimento("m1", BANCA_A, "OUT", 33_300, {
      reversed_at: new Date("2026-03-05T00:00:00Z"),
    }),
    movimento("m1-storno", BANCA_A, "IN", 33_300, {
      source_domain: "REVERSAL",
      reversal_of_id: "m1",
    }),
  );

  assert.equal(await saldoDi(BANCA_A), prima);
});

test("un giroconto lascia invariata la liquidita totale del club", async () => {
  const saldi = await service.listFinancialAccountBalances(owner(), {});
  const totalePrima = saldi.reduce((somma, s) => somma + s.balanceCents, 0);

  fake.rows("accountingEntry").push(
    movimento("g-out", BANCA_A, "OUT", 20_000, {
      source_domain: "INTERNAL_TRANSFER",
      transfer_group_id: "gruppo-1",
    }),
    movimento("g-in", CASSA_A, "IN", 20_000, {
      source_domain: "INTERNAL_TRANSFER",
      transfer_group_id: "gruppo-1",
    }),
  );

  const dopo = await service.listFinancialAccountBalances(owner(), {});
  const totaleDopo = dopo.reduce((somma, s) => somma + s.balanceCents, 0);

  assert.equal(totaleDopo, totalePrima);

  // E i due conti si sono mossi davvero, in versi opposti.
  const perConto = new Map(dopo.map((s) => [s.accountId, s.balanceCents]));
  assert.equal(perConto.get(BANCA_A), 500_000 - 20_000);
  assert.equal(perConto.get(CASSA_A), 10_000 + 20_000);
});

test("il saldo somma anche incassi, uscite del lavoro sportivo e liquidazioni", async () => {
  fake.rows("paymentTransaction").push(
    incasso("i1", BANCA_A, 120.5),
    incasso("i2", BANCA_A, 79.5),
  );
  fake.rows("sportWorkOutboundTransaction").push(erogazione("e1", BANCA_A, 300));
  fake.rows("fundingSettlement").push(liquidazione("l1", BANCA_A, 1_000));

  const saldo = await service.getFinancialAccountBalance(BANCA_A, owner());

  assert.equal(saldo.paymentsCents, 20_000);
  assert.equal(saldo.sportWorkCents, 30_000);
  assert.equal(saldo.fundingCents, 100_000);
  assert.equal(saldo.balanceCents, 500_000 + 20_000 - 30_000 + 100_000);
});

test("il rimborso resta nella somma: non e uno storno, e denaro tornato indietro", async () => {
  fake.rows("paymentTransaction").push(
    incasso("i1", CASSA_A, 100),
    // Riga negativa **senza** `reverses_transaction_id`: e un rimborso vero.
    incasso("r1", CASSA_A, -40),
  );

  assert.equal(await saldoDi(CASSA_A), 10_000 + 6_000);
});

test("incasso stornato e riga di storno escono entrambi dalla somma", async () => {
  fake.rows("paymentTransaction").push(
    incasso("i1", CASSA_A, 100, {
      reversed_at: new Date("2026-03-06T00:00:00Z"),
    }),
    incasso("i1-storno", CASSA_A, -100, { reverses_transaction_id: "i1" }),
  );

  assert.equal(await saldoDi(CASSA_A), 10_000);
});

test("il compenso stornato non consuma il conto: originale e storno escono", async () => {
  fake.rows("sportWorkOutboundTransaction").push(
    erogazione("e1", BANCA_A, 400, {
      reversed_at: new Date("2026-03-07T00:00:00Z"),
    }),
    erogazione("e1-storno", BANCA_A, -400, {
      transaction_type: "COMPENSATION_REVERSAL",
      reversal_of_id: "e1",
    }),
  );

  assert.equal(await saldoDi(BANCA_A), 500_000);
});

test("il saldo non e mai una colonna: nessuna scrittura tocca un campo saldo", async () => {
  fake.rows("accountingEntry").push(movimento("m1", CASSA_A, "IN", 5_000));
  await service.getFinancialAccountBalance(CASSA_A, owner());

  const scritture = fake.calls.filter(
    (call) =>
      call.delegate === "financialAccount" &&
      ["create", "update", "updateMany", "upsert"].includes(call.method),
  );

  assert.equal(scritture.length, 0);
});

test("il saldo si aggrega nel database, non leggendo tutte le righe", async () => {
  fake.rows("accountingEntry").push(movimento("m1", CASSA_A, "IN", 5_000));
  await service.getFinancialAccountBalance(CASSA_A, owner());

  for (const tabella of [
    "accountingEntry",
    "paymentTransaction",
    "sportWorkOutboundTransaction",
    "fundingSettlement",
  ]) {
    assert.ok(
      fake.lastCall(tabella, "groupBy"),
      `${tabella} deve essere aggregata con groupBy`,
    );
    assert.equal(
      fake.lastCall(tabella, "findMany"),
      null,
      `${tabella} non deve essere letta riga per riga`,
    );
  }
});

// --- un conto non si cancella ----------------------------------------------

test("il modulo non espone nessuna cancellazione di un conto", () => {
  const cancellazioni = Object.keys(service).filter((nome) =>
    /delete|remove|destroy|drop/i.test(nome),
  );

  assert.deepEqual(cancellazioni, []);
});

test("un conto con movimenti si archivia, e la riga resta", async () => {
  fake.rows("accountingEntry").push(movimento("m1", CASSA_A, "OUT", 2_500));

  const archiviato = await service.archiveFinancialAccount(CASSA_A, owner());

  assert.equal(archiviato.isArchived, true);
  assert.ok(archiviato.archivedAt);
  assert.equal(fake.rows("financialAccount").length, 3);
  assert.equal(
    fake.calls.filter(
      (call) =>
        call.delegate === "financialAccount" &&
        ["delete", "deleteMany"].includes(call.method),
    ).length,
    0,
  );

  // E il movimento che lo cita e ancora li, leggibile.
  assert.equal(fake.rows("accountingEntry").length, 1);
});

test("un conto archiviato sparisce dagli elenchi e si puo riaprire", async () => {
  await service.archiveFinancialAccount(CASSA_A, owner());

  const visibili = await service.listFinancialAccounts(owner(), {});
  assert.deepEqual(
    visibili.map((c) => c.id).sort(),
    [BANCA_A].sort(),
  );

  const conArchiviati = await service.listFinancialAccounts(owner(), {
    includeArchived: true,
  });
  assert.equal(conArchiviati.length, 2);

  const riaperto = await service.archiveFinancialAccount(CASSA_A, owner(), {
    archived: false,
  });
  assert.equal(riaperto.isArchived, false);
  assert.equal(riaperto.archivedAt, null);
});

// --- multi-tenant -----------------------------------------------------------

test("non si legge il conto di un altro club", async () => {
  await rejects(
    service.getFinancialAccountById(CONTO_B, owner()),
    /Accesso negato/,
  );
});

test("non si legge il saldo del conto di un altro club", async () => {
  await rejects(
    service.getFinancialAccountBalance(CONTO_B, owner()),
    /Accesso negato/,
  );
});

test("non si rinomina ne si archivia il conto di un altro club", async () => {
  await rejects(
    service.renameFinancialAccount(CONTO_B, { name: "Rubato" }, owner()),
    /Accesso negato/,
  );
  await rejects(
    service.archiveFinancialAccount(CONTO_B, owner()),
    /Accesso negato/,
  );

  const intatto = fake.rows("financialAccount").find((r) => r.id === CONTO_B);
  assert.equal(intatto.name, "Cassa");
  assert.equal(intatto.is_archived, false);
});

test("non si elencano i conti di un altro club", async () => {
  await rejects(
    service.listFinancialAccounts(owner(), { organizationId: CLUB_B }),
    /Accesso negato/,
  );
});

test("non si apre un conto dentro un altro club", async () => {
  await rejects(
    service.createFinancialAccount(
      { name: "Conto ombra", organizationId: CLUB_B },
      owner(),
    ),
    /Accesso negato/,
  );
  assert.equal(fake.rows("financialAccount").length, 3);
});

test("ogni lettura filtra per organization_id, sempre", async () => {
  await service.listFinancialAccounts(owner(), { withBalances: true });

  assert.equal(
    fake.lastCall("financialAccount", "findMany").args.where.organization_id,
    CLUB_A,
  );
  for (const tabella of [
    "accountingEntry",
    "paymentTransaction",
    "sportWorkOutboundTransaction",
    "fundingSettlement",
  ]) {
    assert.equal(
      fake.lastCall(tabella, "groupBy").args.where.organization_id,
      CLUB_A,
    );
  }
});

test("i saldi di un club non contengono i conti di un altro", async () => {
  const saldi = await service.listFinancialAccountBalances(owner(), {});
  assert.deepEqual(saldi.map((s) => s.accountId).sort(), [CASSA_A, BANCA_A].sort());

  const altrui = await service.listFinancialAccountBalances(ownerB(), {});
  assert.deepEqual(
    altrui.map((s) => s.accountId),
    [CONTO_B],
  );
});

// --- permessi ---------------------------------------------------------------

test("la segreteria vede l'elenco dei conti: senza, non registra un movimento", async () => {
  const conti = await service.listFinancialAccounts(segreteria(), {});
  assert.equal(conti.length, 2);
  assert.deepEqual(
    conti.map((c) => c.balance),
    [null, null],
  );
});

test("segreteria e staff non vedono i saldi", async () => {
  for (const chi of [segreteria(), staff()]) {
    await rejects(
      service.listFinancialAccounts(chi, { withBalances: true }),
      /Accesso negato/,
    );
    await rejects(
      service.getFinancialAccountBalance(CASSA_A, chi),
      /Accesso negato/,
    );
  }
});

test("segreteria e staff non aprono, non rinominano e non archiviano un conto", async () => {
  for (const chi of [segreteria(), staff()]) {
    await rejects(
      service.createFinancialAccount({ name: "Conto nuovo" }, chi),
      /Accesso negato/,
    );
    await rejects(
      service.renameFinancialAccount(CASSA_A, { name: "Cassetta" }, chi),
      /Accesso negato/,
    );
    await rejects(service.archiveFinancialAccount(CASSA_A, chi), /Accesso negato/);
  }

  assert.equal(fake.rows("financialAccount").length, 3);
  assert.equal(
    fake.rows("financialAccount").find((r) => r.id === CASSA_A).name,
    "Cassa",
  );
});

test("l'allenatore non vede nemmeno l'elenco dei conti", async () => {
  await rejects(
    service.listFinancialAccounts(allenatore(), {}),
    /Accesso negato/,
  );
  await rejects(
    service.getFinancialAccountById(CASSA_A, allenatore()),
    /Accesso negato/,
  );
});

test("il messaggio di diniego dice quale azione ha negato", async () => {
  await rejects(
    service.listFinancialAccounts(segreteria(), { withBalances: true }),
    /vedere i conti finanziari e i loro saldi/i,
  );
});

test("canReadAccountBalances risponde come la matrice", () => {
  assert.equal(service.canReadAccountBalances("owner"), true);
  assert.equal(service.canReadAccountBalances("club_manager"), true);
  assert.equal(service.canReadAccountBalances("collaborator"), false);
  assert.equal(service.canReadAccountBalances("staff"), false);
  assert.equal(service.canReadAccountBalances("trainer"), false);
});

// --- apertura e modifica ----------------------------------------------------

test("un conto nasce con il tipo, gli estremi e il saldo di apertura dichiarato", async () => {
  const creato = await service.createFinancialAccount(
    {
      name: "Transito Stripe",
      kind: "CLEARING",
      openingBalance: "12,34",
      notes: "Incassi online in attesa di versamento",
    },
    owner(),
  );

  assert.equal(creato.kind, "CLEARING");
  assert.equal(creato.kindLabel, "Transito");
  assert.equal(creato.openingBalanceCents, 1_234);
  assert.ok(creato.openingBalanceAt);
  assert.equal(creato.isArchived, false);
});

test("un conto vuoto non ha una data di apertura da inventare", async () => {
  const creato = await service.createFinancialAccount(
    { name: "Cassa piccola", kind: "CASH" },
    owner(),
  );

  assert.equal(creato.openingBalanceCents, 0);
  assert.equal(creato.openingBalanceAt, null);
});

test("due conti non possono chiamarsi allo stesso modo", async () => {
  await rejects(
    service.createFinancialAccount({ name: "Cassa" }, owner()),
    /Esiste gia un conto/,
  );
  await rejects(
    service.renameFinancialAccount(BANCA_A, { name: "Cassa" }, owner()),
    /Esiste gia un conto/,
  );
});

test("un conto senza nome non si apre", async () => {
  await rejects(
    service.createFinancialAccount({ name: "   " }, owner()),
    /senza nome/,
  );
});

test("un tipo di conto fuori catalogo si rifiuta", async () => {
  await rejects(
    service.createFinancialAccount({ name: "Cripto", kind: "WALLET" }, owner()),
    /cassa, banca o transito/,
  );
});

test("la sede e facoltativa, e non si accetta una sede inesistente", async () => {
  const senzaSede = await service.createFinancialAccount(
    { name: "Conto senza sede" },
    owner(),
  );
  assert.equal(senzaSede.siteId, null);

  await rejects(
    service.createFinancialAccount(
      { name: "Conto di Roma", siteId: "sede-inesistente" },
      owner(),
    ),
    /sed[ei]/i,
  );
});

test("rinominare non tocca il tipo ne il saldo di apertura", async () => {
  const rinominato = await service.renameFinancialAccount(
    CASSA_A,
    { name: "Cassa contanti", iban: null, notes: "Cassaforte in segreteria" },
    owner(),
  );

  assert.equal(rinominato.name, "Cassa contanti");
  assert.equal(rinominato.kind, "CASH");
  assert.equal(rinominato.openingBalanceCents, 10_000);

  const scritto = fake.lastCall("financialAccount", "update").args.data;
  assert.equal("kind" in scritto, false);
  assert.equal("opening_balance_cents" in scritto, false);
});
