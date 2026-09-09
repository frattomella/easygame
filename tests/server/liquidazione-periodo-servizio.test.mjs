import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Registrare il bonifico di un ente su un periodo** (N15), a runtime.
 *
 * ---
 *
 * ## Il fatto
 *
 * Il dominio delle liquidazioni esisteva per intero — testata, ripartizione,
 * due tetti, storno, conto, causale congelata — e le sue due rotte non avevano
 * **nessun chiamante**. Nessuna finestra, nessun pulsante, nessun hook: la
 * forma che `CLAUDE.md` §11.8 chiama per nome, e la piu costosa, perche
 * riguardava l'unico momento in cui un contributo diventa denaro.
 *
 * `settleFundingPeriod` e la porta. **Non e un secondo dominio**: compone
 * l'ingresso — un periodo, un importo — e delega a `createFundingSettlement`.
 * Lo scrittore resta uno, la transazione resta una, i tetti restano i suoi.
 *
 * ## Cosa questo file presidia
 *
 * 1. **Il movimento bancario non e una seconda riga.** La liquidazione **e** il
 *    movimento: la vista `accounting_ledger_lines` la proietta con il conto, il
 *    verso e la causale. Non si scrive niente in `accounting_entries` —
 *    `OWNERSHIP.md` lo vieta per nome — quindi non esiste la finestra in cui una
 *    delle due cose c'e e l'altra no.
 * 2. **Non nasce nessun pagamento della famiglia.**
 * 3. **Parziale e la norma**, e il residuo si ricalcola dalle righe.
 * 4. **Non si liquida cio che non e maturato**, ne piu di quanto resta.
 * 5. **Il doppio invio lascia un accredito solo.**
 * 6. **Lo storno rimette indietro**, e non si storna due volte.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "bbbbbbbb-0000-4000-8000-000000000002";
const PROGRAMMA = "cccccccc-0000-4000-8000-000000000003";
const ALTRO_PROGRAMMA = "cccccccc-0000-4000-8000-000000000009";
const ANNA = "dddddddd-0000-4000-8000-000000000004";
const ADESIONE = "eeeeeeee-0000-4000-8000-000000000001";
const MATURATO = "ffffffff-0000-4000-8000-000000000001";
const CONTO = "99999999-0000-4000-8000-000000000001";
const CONTO_ALTRUI = "99999999-0000-4000-8000-000000000002";

let funding;
let setPrismaClientForTests;
let fake;

before(async () => {
  funding = await import("../../src/lib/server/funding.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const scope = (overrides = {}) => ({
  userId: "utente-1",
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
  ...overrides,
});

const seed = () => ({
  club: [
    { id: CLUB, name: "ASD Alfa" },
    { id: ALTRO_CLUB, name: "ASD Beta" },
  ],
  athlete: [
    {
      id: ANNA,
      organization_id: CLUB,
      first_name: "Anna",
      last_name: "Coperta",
    },
  ],
  financialAccount: [
    { id: CONTO, organization_id: CLUB, name: "Banca", kind: "BANK" },
    {
      id: CONTO_ALTRUI,
      organization_id: ALTRO_CLUB,
      name: "Banca altrui",
      kind: "BANK",
    },
  ],
  fiscalOperationType: [
    {
      id: "causale-1",
      organization_id: CLUB,
      code: "liquidazione_contributo",
      label: "Liquidazione di contributo o voucher",
      activity_scope: "unspecified",
      direction_hint: "IN",
      is_active: true,
    },
  ],
  fundingProgram: [
    {
      id: PROGRAMMA,
      organization_id: CLUB,
      name: "Voucher Sport e Salute",
      funder_name: "Regione",
      status: "active",
      valid_from: new Date("2026-01-01T00:00:00.000Z"),
      valid_to: new Date("2026-12-31T00:00:00.000Z"),
      athlete_plafond: 600,
      period_amount: 100,
      period_frequency: "monthly",
      requirement_unit: "hours",
      requirement_min: 8,
      unmet_behavior: "none",
    },
    {
      id: ALTRO_PROGRAMMA,
      organization_id: CLUB,
      name: "Altro bando",
      funder_name: "Comune",
      status: "active",
      valid_from: new Date("2026-01-01T00:00:00.000Z"),
      valid_to: new Date("2026-12-31T00:00:00.000Z"),
      athlete_plafond: 600,
      period_amount: 100,
      period_frequency: "monthly",
      requirement_unit: "hours",
      requirement_min: 8,
      unmet_behavior: "none",
    },
  ],
  fundingEnrollment: [
    {
      id: ADESIONE,
      organization_id: CLUB,
      program_id: PROGRAMMA,
      athlete_id: ANNA,
      assigned_amount: 600,
      status: "active",
      enrolled_at: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  fundingAccrual: [
    {
      id: MATURATO,
      organization_id: CLUB,
      enrollment_id: ADESIONE,
      period_index: 9,
      period_label: "ottobre 2026",
      accrued_amount: 100,
      eligible_amount: 100,
      status: "accrued",
      data: {},
    },
  ],
  fundingSettlement: [],
  fundingSettlementLine: [],
  paymentTransaction: [],
  athletePayment: [],
  accountingEntry: [],
  paymentCoverageAllocation: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const liquida = (extra = {}, s = scope()) =>
  funding.settleFundingPeriod(
    {
      accrualId: MATURATO,
      financialAccountId: CONTO,
      settledAt: "2026-11-05T00:00:00.000Z",
      reference: "TRN-0001",
      ...extra,
    },
    s,
  );

/* -------------------------------------------------- lo scenario normale */

test("scenario A · si liquida il residuo, e il periodo si chiude", async () => {
  const esito = await liquida();

  assert.equal(Number(esito.amount), 100, "l'importo si propone dal residuo");
  assert.equal(fake.rows("fundingSettlement").length, 1);
  assert.equal(fake.rows("fundingSettlementLine").length, 1);
  assert.equal(Number(fake.rows("fundingSettlementLine")[0].amount), 100);

  const periodo = fake.rows("fundingAccrual")[0];
  assert.equal(periodo.status, "settled", "coperto per intero");
});

test("il movimento bancario porta conto, verso e causale", async () => {
  await liquida();

  const riga = fake.rows("fundingSettlement")[0];
  assert.equal(riga.financial_account_id, CONTO);
  assert.ok(Number(riga.amount) > 0, "importo positivo: il denaro entra");
  assert.equal(riga.operation_type_code, "liquidazione_contributo");
  assert.equal(
    riga.activity_scope_snapshot,
    "unspecified",
    "l'ambito si congela sulla riga",
  );
  assert.ok(riga.operation_type_label_snapshot, "e l'etichetta con lui");
});

test("il movimento nomina atleta e periodo, e li lega strutturalmente", async () => {
  await liquida();

  const riga = fake.rows("fundingSettlement")[0];
  assert.equal(
    riga.beneficiary_athlete_id,
    ANNA,
    "un beneficiario solo: la riga lo dice senza tre join",
  );
  assert.equal(
    riga.description_snapshot,
    "Incasso voucher Voucher Sport e Salute — Anna Coperta — ottobre 2026",
  );
  assert.equal(
    fake.rows("fundingSettlementLine")[0].accrual_id,
    MATURATO,
    "e il periodo resta legato dalla riga di ripartizione",
  );
});

/* ------------------------------------------- niente cassa della famiglia */

test("nessun pagamento della famiglia nasce da una liquidazione", async () => {
  await liquida();

  assert.equal(fake.rows("paymentTransaction").length, 0);
  assert.equal(fake.rows("athletePayment").length, 0);
  assert.equal(fake.rows("paymentCoverageAllocation").length, 0);

  const scritture = fake.calls.filter(
    (chiamata) =>
      ["paymentTransaction", "athletePayment", "paymentCoverageAllocation"].includes(
        chiamata.delegate,
      ) && ["create", "update", "updateMany", "delete"].includes(chiamata.method),
  );
  assert.deepEqual(scritture, []);
});

test("e nessuna riga di prima nota: il movimento e la liquidazione stessa", async () => {
  /*
    `accounting_entries` non contiene contributi — lo dice `OWNERSHIP.md`, e
    `WRITABLE_SOURCE_DOMAINS` non ammette `FUNDING_SETTLEMENT`. Il movimento
    esiste come **proiezione**, e per questo non puo esistere senza la
    liquidazione ne la liquidazione senza di lui.
  */
  await liquida();

  assert.equal(fake.rows("accountingEntry").length, 0);
  const scritture = fake.calls.filter(
    (chiamata) =>
      chiamata.delegate === "accountingEntry" &&
      ["create", "createMany", "update"].includes(chiamata.method),
  );
  assert.deepEqual(scritture, []);
});

/* ------------------------------------------------ scenario B: parziale */

test("scenario B · 60 su 100, poi altri 40", async () => {
  await liquida({ amount: 60 });

  let periodo = fake.rows("fundingAccrual")[0];
  assert.equal(
    periodo.status,
    "reported",
    "coperto per meta: resta fra i crediti verso l'ente",
  );

  const residuo = fake
    .rows("fundingSettlementLine")
    .reduce((somma, riga) => somma + Number(riga.amount), 0);
  assert.equal(residuo, 60);

  await liquida({ amount: 40, reference: "TRN-0002" });

  periodo = fake.rows("fundingAccrual")[0];
  assert.equal(periodo.status, "settled");
  assert.equal(fake.rows("fundingSettlement").length, 2, "due accrediti");
  assert.equal(
    fake
      .rows("fundingSettlementLine")
      .reduce((somma, riga) => somma + Number(riga.amount), 0),
    100,
  );
});

test("senza importo si propone il residuo, non il maturato", async () => {
  await liquida({ amount: 60 });
  const secondo = await liquida({ reference: "TRN-0002" });

  assert.equal(
    Number(secondo.amount),
    40,
    "il residuo, non i 100 gia in parte incassati",
  );
});

/* ------------------------------------------------- scenari C e D: i no */

test("scenario C · un periodo non maturato non si liquida", async () => {
  fake.rows("fundingAccrual")[0].accrued_amount = 0;
  fake.rows("fundingAccrual")[0].status = "not_accrued";

  await assert.rejects(() => liquida({ amount: 50 }), /non e maturato/);
  assert.equal(fake.rows("fundingSettlement").length, 0);
});

test("scenario D · non si liquidano 110 su 100 maturati", async () => {
  await assert.rejects(
    () => liquida({ amount: 110 }),
    /non si puo liquidare piu di quanto e maturato/i,
  );
  assert.equal(fake.rows("fundingSettlement").length, 0);
});

test("e nemmeno 41 su un residuo di 40", async () => {
  await liquida({ amount: 60 });
  await assert.rejects(() => liquida({ amount: 41 }), /restano 40\.00 EUR/);
});

test("un periodo gia liquidato per intero non si liquida di nuovo", async () => {
  await liquida();
  await assert.rejects(() => liquida({ amount: 10 }), /gia liquidato per intero/);
});

test("senza conto la liquidazione non si registra", async () => {
  /*
    Il movimento bancario e cio per cui questo percorso esiste: senza conto il
    credito si chiuderebbe e il denaro non comparirebbe in nessun saldo.
  */
  await assert.rejects(
    () => liquida({ financialAccountId: "" }),
    /su quale conto/,
  );
  assert.equal(fake.rows("fundingSettlement").length, 0);
});

test("un conto di un altro club non si usa", async () => {
  await assert.rejects(
    () => liquida({ financialAccountId: CONTO_ALTRUI }),
    /non appartiene a questo club/,
  );
  assert.equal(fake.rows("fundingSettlement").length, 0);
});

/* ------------------------------------------- scenario E: doppio invio */

test("scenario E · lo stesso invio, due volte, lascia un accredito solo", async () => {
  const chiave = "gesto-1";

  const primo = await liquida({ amount: 40, idempotencyKey: chiave });
  const secondo = await liquida({ amount: 40, idempotencyKey: chiave });

  assert.equal(primo.id, secondo.id, "la seconda risposta e la prima riga");
  assert.equal(fake.rows("fundingSettlement").length, 1);
  assert.equal(fake.rows("fundingSettlementLine").length, 1);
  assert.equal(
    fake
      .rows("fundingSettlementLine")
      .reduce((somma, riga) => somma + Number(riga.amount), 0),
    40,
    "quaranta, non ottanta",
  );
});

test("due gesti distinti restano due accrediti", async () => {
  await liquida({ amount: 40, idempotencyKey: "gesto-1" });
  await liquida({ amount: 40, idempotencyKey: "gesto-2" });

  assert.equal(fake.rows("fundingSettlement").length, 2);
  assert.equal(
    fake
      .rows("fundingSettlementLine")
      .reduce((somma, riga) => somma + Number(riga.amount), 0),
    80,
  );
});

/* ------------------------------------------------ scenario G: lo storno */

test("scenario G · lo storno rimette indietro, e lo storico resta", async () => {
  const accredito = await liquida({ amount: 60 });

  await funding.reverseFundingSettlement(
    { settlementId: accredito.id, reason: "Bonifico attribuito per errore" },
    scope(),
  );

  const teste = fake.rows("fundingSettlement");
  assert.equal(teste.length, 2, "l'originale resta, e nasce la riga opposta");

  const originale = teste.find((riga) => riga.id === accredito.id);
  assert.ok(originale.reversed_at, "l'originale e marcato");

  const storno = teste.find((riga) => riga.reversal_of_id === accredito.id);
  assert.equal(Number(storno.amount), -60, "segno opposto");
  assert.equal(
    storno.financial_account_id,
    CONTO,
    "il denaro torna indietro dal conto su cui era entrato",
  );

  const netto = fake
    .rows("fundingSettlementLine")
    .reduce((somma, riga) => somma + Number(riga.amount), 0);
  assert.equal(netto, 0, "netto liquidato zero");

  assert.equal(
    fake.rows("fundingAccrual")[0].status,
    "reported",
    "e il periodo torna fra i crediti verso l'ente",
  );
});

test("lo storno porta lo stesso beneficiario e un nome riconoscibile", async () => {
  const accredito = await liquida();
  await funding.reverseFundingSettlement(
    { settlementId: accredito.id, reason: "Errore" },
    scope(),
  );

  const storno = fake
    .rows("fundingSettlement")
    .find((riga) => riga.reversal_of_id === accredito.id);

  assert.equal(storno.beneficiary_athlete_id, ANNA);
  assert.equal(
    storno.description_snapshot,
    "Storno incasso voucher Voucher Sport e Salute — Anna Coperta — ottobre 2026",
  );
});

test("uno storno non si storna, e non si storna due volte", async () => {
  const accredito = await liquida();
  await funding.reverseFundingSettlement(
    { settlementId: accredito.id, reason: "Errore" },
    scope(),
  );

  await assert.rejects(
    () =>
      funding.reverseFundingSettlement(
        { settlementId: accredito.id, reason: "Di nuovo" },
        scope(),
      ),
    /gia stata stornata/,
  );

  const storno = fake
    .rows("fundingSettlement")
    .find((riga) => riga.reversal_of_id === accredito.id);

  await assert.rejects(
    () =>
      funding.reverseFundingSettlement(
        { settlementId: storno.id, reason: "Terzo giro" },
        scope(),
      ),
    /non si storna/,
  );
});

test("dopo lo storno il periodo si puo liquidare di nuovo", async () => {
  const accredito = await liquida({ amount: 60 });
  await funding.reverseFundingSettlement(
    { settlementId: accredito.id, reason: "Errore" },
    scope(),
  );

  const nuovo = await liquida({ reference: "TRN-9" });
  assert.equal(
    Number(nuovo.amount),
    100,
    "il residuo e tornato pieno: 60 incassati e 60 stornati fanno zero",
  );
});

/* --------------------------------------------------- scenario J: i ruoli */

test("scenario J · l'allenatore non registra una liquidazione", async () => {
  await assert.rejects(
    () => liquida({}, scope({ activeRole: "trainer" })),
    /Accesso negato/,
  );
  assert.equal(fake.rows("fundingSettlement").length, 0);
});

test("il genitore nemmeno, e nemmeno l'atleta", async () => {
  for (const ruolo of ["parent", "athlete"]) {
    await assert.rejects(
      () => liquida({}, scope({ activeRole: ruolo })),
      /Accesso negato/,
    );
  }
  assert.equal(fake.rows("fundingSettlement").length, 0);
});

test("la segreteria da sola non basta: servono tutte e due le chiavi", async () => {
  /*
    `collaborator` ha `accounting.manage` ma non `funding.manage`: registrare
    un bonifico e insieme un atto sui contributi e un movimento di cassa, e
    chi ne ha una sola sta facendo meta di un'operazione che non si fa a meta.
  */
  for (const ruolo of ["collaborator", "staff"]) {
    await assert.rejects(
      () => liquida({}, scope({ activeRole: ruolo })),
      /Accesso negato/,
    );
  }
});

test("un ruolo personalizzato con tutte e due le chiavi registra", async () => {
  const { encodeCustomRoleToken } = await import("../../src/lib/access-roles.ts");

  const completo = encodeCustomRoleToken("custom:club_manager:amministrazione", [
    "accounting.read",
    "accounting.manage",
    "funding.manage",
  ]);
  const soloBandi = encodeCustomRoleToken("custom:club_manager:contributi", [
    "accounting.read",
    "funding.manage",
  ]);

  await assert.rejects(
    () => liquida({}, scope({ activeRole: soloBandi })),
    /Accesso negato/,
    "senza la chiave contabile non si tocca la cassa",
  );

  const esito = await liquida({}, scope({ activeRole: completo }));
  assert.equal(Number(esito.amount), 100);
});

test("lo storno chiede la chiave dello storno, che la segreteria non ha", async () => {
  const { encodeCustomRoleToken } = await import("../../src/lib/access-roles.ts");
  const accredito = await liquida();

  const senzaStorno = encodeCustomRoleToken("custom:club_manager:segreteria", [
    "accounting.read",
    "accounting.manage",
    "funding.manage",
  ]);

  await assert.rejects(
    () =>
      funding.reverseFundingSettlement(
        { settlementId: accredito.id, reason: "Errore" },
        scope({ activeRole: senzaStorno }),
      ),
    /Accesso negato/,
  );
});

/* ------------------------------------------------------- il perimetro */

test("un periodo di un altro club non si liquida", async () => {
  await assert.rejects(
    () =>
      liquida(
        {},
        scope({
          activeOrganizationId: ALTRO_CLUB,
          allowedOrganizationIds: [ALTRO_CLUB],
        }),
      ),
    /Accesso negato|non trovato/,
  );
  assert.equal(fake.rows("fundingSettlement").length, 0);
});

test("il periodo appartiene al bando che si sta liquidando", async () => {
  /*
    Un maturato non porta il bando: lo porta la sua iscrizione. Liquidare il
    periodo di un ente con il bonifico di un altro chiuderebbe un credito
    consumando il maturato di un terzo, e i due rendiconti direbbero numeri che
    non tornano.
  */
  await assert.rejects(
    () =>
      funding.createFundingSettlement(
        {
          programId: ALTRO_PROGRAMMA,
          amount: 100,
          financialAccountId: CONTO,
          lines: [{ accrualId: MATURATO, amount: 100 }],
        },
        scope(),
      ),
    /non appartiene a questo programma/,
  );
});

/* ------------------------------------------- cio che la scheda riceve */

test("la proiezione dell'atleta porta il residuo e gli accrediti", async () => {
  await liquida({ amount: 60 });

  const [overview] = await funding.getAthleteFundingOverview(ANNA, scope());
  const periodo = overview.accruals.find((riga) => riga.id === MATURATO);

  assert.equal(Number(periodo.settled_amount), 60);
  assert.equal(Number(periodo.pending_settlement_amount), 40);
  assert.equal(periodo.settlements.length, 1);
  assert.equal(Number(periodo.settlements[0].amount), 60);
  assert.equal(periodo.settlements[0].reference, "TRN-0001");
  assert.equal(periodo.settlements[0].financialAccountId, CONTO);

  assert.equal(
    Number(overview.summary.pendingSettlementAmount),
    40,
    "e il riepilogo dice quanto l'ente deve ancora versare",
  );
  assert.equal(overview.canSettle, true);
  assert.equal(overview.canReverseSettlement, true);
});

test("chi non puo registrare lo legge dalla proiezione", async () => {
  const { encodeCustomRoleToken } = await import("../../src/lib/access-roles.ts");
  const soloLettura = encodeCustomRoleToken("custom:club_manager:segreteria", [
    "accounting.read",
  ]);

  const [overview] = await funding.getAthleteFundingOverview(
    ANNA,
    scope({ activeRole: soloLettura }),
  );

  assert.equal(overview.canSettle, false);
  assert.equal(overview.canReverseSettlement, false);
});

/* ================= i reperti della revisione ostile ================= */

test("F2 · un periodo liquidato in parte non si riscrive col ricalcolo", async () => {
  /*
    **Il reperto piu costoso della lane.** Una liquidazione parziale lascia il
    periodo in `reported`, e le tre guardie che proteggono `accrued_amount` si
    fermavano al solo `settled`. Un ricalcolo lo riportava a zero, e da quel
    momento il club risultava aver incassato 60 euro su un maturato di niente:
    nessun errore da nessuna parte, e il rendiconto all'ente in meno di 60.

    Il periodo di prova sta **dentro** la finestra del ricalcolo — che si ferma
    a oggi — altrimenti la prova passerebbe per la ragione sbagliata: non
    perche la guardia regge, ma perche il ciclo non ci arriva. E la ragione per
    cui la prima stesura di questo test non vedeva la mutazione.
  */
  const DENTRO = "ffffffff-0000-4000-8000-0000000000ff";

  fake.rows("fundingProgram")[0].valid_from = new Date("2020-01-01T00:00:00.000Z");
  fake.rows("fundingProgram")[0].valid_to = new Date("2020-03-31T00:00:00.000Z");
  fake.rows("fundingAccrual").length = 0;
  fake.rows("fundingAccrual").push({
    id: DENTRO,
    organization_id: CLUB,
    enrollment_id: ADESIONE,
    period_index: 0,
    period_label: "gennaio 2020",
    accrued_amount: 100,
    eligible_amount: 100,
    status: "accrued",
    data: {},
  });

  await funding.settleFundingPeriod(
    {
      accrualId: DENTRO,
      amount: 60,
      financialAccountId: CONTO,
      settledAt: "2020-02-05T00:00:00.000Z",
    },
    scope(),
  );

  assert.equal(
    fake.rows("fundingAccrual").find((r) => r.id === DENTRO).status,
    "reported",
    "coperto per meta: e lo stato su cui la guardia vecchia non si fermava",
  );

  await funding.recomputeEnrollmentAccruals(ADESIONE, scope());

  const periodo = fake.rows("fundingAccrual").find((r) => r.id === DENTRO);
  assert.equal(
    Number(periodo.accrued_amount),
    100,
    "il maturato non scende sotto cio che l'ente ha gia versato",
  );
});

test("F2 · e nemmeno con una decisione manuale", async () => {
  await liquida({ amount: 60 });

  await assert.rejects(
    () =>
      funding.decideAccrualPeriod(
        {
          enrollmentId: ADESIONE,
          periodIndex: 9,
          decision: "not_accrued",
        },
        scope(),
      ),
    /si corregge stornando la liquidazione/,
  );

  assert.equal(Number(fake.rows("fundingAccrual")[0].accrued_amount), 100);
});

test("F3 · la stessa chiave con un fatto diverso e un conflitto, non un duplicato", async () => {
  await liquida({ amount: 40, idempotencyKey: "gesto-x" });

  await assert.rejects(
    () => liquida({ amount: 30, idempotencyKey: "gesto-x" }),
    /gia stata usata per una liquidazione diversa/,
    "restituire la riga vecchia direbbe «fatto» su un accredito mai registrato",
  );

  assert.equal(fake.rows("fundingSettlement").length, 1);
});

test("F3 · e una chiave che appartiene a una liquidazione stornata non replica", async () => {
  const accredito = await liquida({ amount: 40, idempotencyKey: "gesto-y" });
  await funding.reverseFundingSettlement(
    { settlementId: accredito.id, reason: "Errore" },
    scope(),
  );

  await assert.rejects(
    () => liquida({ amount: 40, idempotencyKey: "gesto-y" }),
    /gia stornata/,
  );
});

test("F4 · il secondo invio dell'intero residuo risponde «fatto», non un errore", async () => {
  /*
    Il caso comune: accredito dell'intero residuo, risposta persa, secondo clic
    con la stessa chiave. Il vaglio girava per primo e rispondeva «e gia
    liquidato per intero» — un errore per un'operazione riuscita, che manda
    l'operatore a reinserire il bonifico dall'altra strada.
  */
  const primo = await liquida({ idempotencyKey: "gesto-pieno" });
  const secondo = await liquida({ idempotencyKey: "gesto-pieno" });

  assert.equal(primo.id, secondo.id);
  assert.equal(fake.rows("fundingSettlement").length, 1);
});

test("F5 · un importo che il registro non sa rappresentare viene rifiutato", async () => {
  fake.rows("fundingAccrual")[0].accrued_amount = 25_000_000;
  fake.rows("fundingEnrollment")[0].assigned_amount = 25_000_000;

  await assert.rejects(
    () => liquida({ amount: 25_000_000 }),
    /troppo grande per il registro/,
    "oltre il limite la vista lascerebbe cadere la riga: credito chiuso e saldo fermo",
  );
});

test("6a · una chiave che non e una stringa non diventa un gettone stabile", async () => {
  /*
    `String({})` vale `"[object Object]"`: un oggetto al posto della chiave
    diventava un gettone uguale per chiunque facesse lo stesso errore, e da li
    in poi ogni accredito di quel club veniva ingoiato con un `201`.
  */
  await liquida({ amount: 30, idempotencyKey: {} });
  await liquida({ amount: 30, idempotencyKey: {} });

  assert.equal(
    fake.rows("fundingSettlement").length,
    2,
    "due gesti distinti restano due accrediti: l'oggetto non e una chiave",
  );
  assert.equal(
    fake.rows("fundingSettlement").every((riga) => !riga.idempotency_key),
    true,
  );
});

test("6a · e una chiave lunghissima viene rifiutata", async () => {
  await assert.rejects(
    () => liquida({ amount: 10, idempotencyKey: "x".repeat(200) }),
    /supera 120 caratteri/,
  );
});

test("7 · il riferimento bancario lo vede chi ha il permesso sui conti", async () => {
  const { encodeCustomRoleToken } = await import("../../src/lib/access-roles.ts");
  await liquida({ amount: 60 });

  const [comeProprietario] = await funding.getAthleteFundingOverview(
    ANNA,
    scope(),
  );
  const periodoPieno = comeProprietario.accruals.find((r) => r.id === MATURATO);
  assert.equal(periodoPieno.settlements[0].reference, "TRN-0001");
  assert.equal(periodoPieno.settlements[0].financialAccountId, CONTO);
  assert.equal(comeProprietario.canChooseAccount, true);

  /* La segreteria registra movimenti e non vede gli estremi bancari. */
  const segreteria = encodeCustomRoleToken("custom:club_manager:segreteria", [
    "accounting.read",
    "accounting.manage",
    "funding.manage",
  ]);

  const [ristretto] = await funding.getAthleteFundingOverview(
    ANNA,
    scope({ activeRole: segreteria }),
  );
  const periodoRistretto = ristretto.accruals.find((r) => r.id === MATURATO);

  assert.equal(periodoRistretto.settlements[0].reference, null);
  assert.equal(periodoRistretto.settlements[0].financialAccountId, null);
  assert.equal(
    Number(periodoRistretto.settlements[0].amount),
    60,
    "l'importo resta: serve a capire il periodo, e non e un estremo bancario",
  );
  assert.equal(ristretto.canChooseAccount, false);
});

test("F1 · la proiezione dice quanto vale l'accredito intero e quanti periodi tocca", async () => {
  /*
    Lo storno agisce sulla **testata**: su un bonifico in blocco la riga di
    questo periodo e solo una quota. La schermata mostrava la quota e stornava
    la testata.
  */
  fake.rows("fundingAccrual").push({
    id: "maturato-2",
    organization_id: CLUB,
    enrollment_id: ADESIONE,
    period_index: 10,
    period_label: "novembre 2026",
    accrued_amount: 100,
    eligible_amount: 100,
    status: "accrued",
    data: {},
  });

  await funding.createFundingSettlement(
    {
      programId: PROGRAMMA,
      amount: 150,
      financialAccountId: CONTO,
      settledAt: "2026-12-01T00:00:00.000Z",
      lines: [
        { accrualId: MATURATO, amount: 100 },
        { accrualId: "maturato-2", amount: 50 },
      ],
    },
    scope(),
  );

  const [overview] = await funding.getAthleteFundingOverview(ANNA, scope());
  const periodo = overview.accruals.find((riga) => riga.id === MATURATO);
  const accredito = periodo.settlements[0];

  assert.equal(Number(accredito.amount), 100, "la quota di questo periodo");
  assert.equal(
    Number(accredito.settlementAmount),
    150,
    "ma lo storno rimette indietro l'accredito intero",
  );
  assert.equal(accredito.lineCount, 2, "e riguarda due periodi");
});
