import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * Il **rimborso**, come regola di dominio: cosa si puo restituire, quanto, e
 * cosa succede alla rata.
 *
 * La proprieta che questi test presidiano piu di ogni altra e che **un
 * rimborso si riferisce a un incasso, non a una rata**. Una rata da 130 €
 * pagata con due incassi — 50 e 80 — non ha «130 € rimborsabili»: ha due
 * movimenti, ciascuno con il proprio pagamento presso il PSP e il proprio
 * residuo. Sbagliare qui non produce un errore: produce un rimborso preso dal
 * pagamento sbagliato, che sul cruscotto di Stripe si vede e nel registro di
 * EasyGame no.
 */

let refunds;
let ledger;

before(async () => {
  refunds = await import("../../src/lib/payments/refunds.ts");
  ledger = await import("../../src/lib/payments/installment-ledger.ts");
});

const incasso = (overrides = {}) =>
  ledger.normalizePaymentTransaction({
    id: "tx-1",
    organization_id: "club-1",
    payment_id: "rata-1",
    amount: 130,
    paid_at: "2026-08-20T10:00:00.000Z",
    payment_method: "online",
    source: "STRIPE",
    external_reference: "pi_uno",
    external_payment_id: "pi_uno",
    gross_amount_cents: 13000,
    platform_fee_cents: 130,
    provider_fee_cents: 217,
    net_amount_cents: 12653,
    applied_fee_percent: 1,
    applied_fee_fixed_cents: 0,
    commission_rule_id: "rule-1",
    data: {},
    ...overrides,
  });

const rimborso = (overrides = {}) =>
  ledger.normalizePaymentTransaction({
    id: "tx-refund-1",
    organization_id: "club-1",
    payment_id: "rata-1",
    amount: -30,
    paid_at: "2026-08-21T10:00:00.000Z",
    source: "STRIPE",
    external_reference: "re_uno",
    external_payment_id: "pi_uno",
    data: { kind: "refund", refundOfTransactionId: "tx-1" },
    ...overrides,
  });

/* --------------------------------------------------- i numeri congelati */

test("un incasso online porta con se i numeri congelati", () => {
  const tx = incasso();

  assert.equal(tx.settlement.grossAmountCents, 13000);
  assert.equal(tx.settlement.platformFeeCents, 130);
  assert.equal(tx.externalPaymentId, "pi_uno");
});

test("un incasso manuale non porta numeri congelati, e non porta zeri", () => {
  const tx = ledger.normalizePaymentTransaction({
    id: "tx-manuale",
    amount: 50,
    source: "MANUAL",
  });

  assert.equal(
    tx.settlement,
    null,
    "zero direbbe «commissione nulla», che e un'affermazione diversa da «non ce n'era»",
  );
});

test("una commissione del PSP non ancora nota resta null, non zero", () => {
  const tx = incasso({ provider_fee_cents: null });
  assert.equal(tx.settlement.providerFeeCents, null);
});

/* ------------------------------------------------------- il rimborsabile */

test("un incasso online intatto e rimborsabile per intero", () => {
  const tx = incasso();
  const esito = refunds.describeRefundAvailability({
    transaction: tx,
    transactions: [tx],
  });

  assert.equal(esito.refundable, true);
  assert.equal(esito.blocker, null);
  assert.equal(esito.originalCents, 13000);
  assert.equal(esito.refundedCents, 0);
  assert.equal(esito.refundableCents, 13000);
});

test("un rimborso gia registrato riduce il rimborsabile", () => {
  const tx = incasso();
  const esito = refunds.describeRefundAvailability({
    transaction: tx,
    transactions: [tx, rimborso()],
  });

  assert.equal(esito.refundedCents, 3000);
  assert.equal(esito.refundableCents, 10000);
  assert.equal(esito.refundable, true);
});

test("due rimborsi che coprono l'incasso lo esauriscono", () => {
  const tx = incasso();
  const esito = refunds.describeRefundAvailability({
    transaction: tx,
    transactions: [
      tx,
      rimborso(),
      rimborso({
        id: "tx-refund-2",
        amount: -100,
        external_reference: "re_due",
      }),
    ],
  });

  assert.equal(esito.refundable, false);
  assert.equal(esito.blocker, "nothing_left");
  assert.equal(esito.refundableCents, 0);
});

/* ------------------------------------------------------- i sei ostacoli */

test("un incasso manuale non si rimborsa dal provider", () => {
  const tx = incasso({
    source: "MANUAL",
    payment_method: "contanti",
    external_payment_id: null,
    external_reference: null,
  });

  const esito = refunds.describeRefundAvailability({
    transaction: tx,
    transactions: [tx],
  });

  assert.equal(esito.blocker, "manual_payment");
  assert.match(esito.message, /si storna/);
});

test("un incasso stornato non si rimborsa: per il registro non e avvenuto", () => {
  const tx = incasso({ reversed_at: "2026-08-22T10:00:00.000Z" });

  const esito = refunds.describeRefundAvailability({
    transaction: tx,
    transactions: [tx],
  });

  assert.equal(esito.blocker, "reversed");
});

test("un movimento negativo non si rimborsa", () => {
  const tx = rimborso();

  const esito = refunds.describeRefundAvailability({
    transaction: tx,
    transactions: [tx],
  });

  assert.equal(esito.blocker, "not_a_payment");
});

test("un incasso online senza riferimento del provider non si rimborsa da qui", () => {
  const tx = incasso({ external_payment_id: null });

  const esito = refunds.describeRefundAvailability({
    transaction: tx,
    transactions: [tx],
  });

  assert.equal(esito.blocker, "provider_missing");
});

test("i sei ostacoli hanno sei messaggi diversi", () => {
  const casi = [
    rimborso(),
    incasso({ reversed_at: "2026-08-22T10:00:00.000Z" }),
    incasso({ source: "MANUAL" }),
    incasso({ external_payment_id: null }),
    incasso({ amount: 30 }),
    incasso({
      data: {
        refundRequests: [
          { externalRefundId: "re_volo", amountCents: 13000 },
        ],
      },
    }),
  ];

  const messaggi = new Set(
    casi.map((tx, indice) =>
      refunds.describeRefundAvailability({
        transaction: tx,
        transactions:
          indice === 4
            ? [tx, rimborso({ amount: -30, external_reference: "re_x" })]
            : [tx],
      }).message,
    ),
  );

  assert.equal(
    messaggi.size,
    6,
    "«non rimborsabile» manda in segreteria a chiedere perche",
  );
});

/* ------------------------------------------- il rimborso ancora in volo */

test("una richiesta partita e non confermata blocca la successiva", () => {
  const tx = incasso({
    data: {
      refundRequests: [
        {
          externalRefundId: "re_in_volo",
          amountCents: 3000,
          requestedAt: "2026-08-21T09:00:00.000Z",
        },
      ],
    },
  });

  const esito = refunds.describeRefundAvailability({
    transaction: tx,
    transactions: [tx],
  });

  assert.equal(esito.blocker, "in_progress");
  assert.equal(esito.pending.length, 1);
  assert.equal(
    esito.refundableCents,
    10000,
    "l'importo in volo e gia impegnato: mostrarlo come disponibile lo farebbe restituire due volte",
  );
});

test("la richiesta si spegne da sola quando il movimento arriva", () => {
  const tx = incasso({
    data: {
      refundRequests: [{ externalRefundId: "re_uno", amountCents: 3000 }],
    },
  });

  const esito = refunds.describeRefundAvailability({
    transaction: tx,
    transactions: [tx, rimborso()],
  });

  assert.deepEqual(esito.pending, []);
  assert.equal(esito.refundedCents, 3000);
  assert.equal(esito.refundable, true);
});

/* ------------------------------------------------------- multi-incasso */

test("il rimborsabile di un incasso non e quello della rata", () => {
  /*
    Rata 130 = A (50) + B (80). Rimborsare 30 «della rata» costringerebbe a
    scegliere da quale prenderli: qui non si sceglie, si cita un movimento.
  */
  const a = incasso({
    id: "tx-a",
    amount: 50,
    external_reference: "pi_a",
    external_payment_id: "pi_a",
    gross_amount_cents: 5000,
    platform_fee_cents: 50,
  });

  const b = incasso({
    id: "tx-b",
    amount: 80,
    external_reference: "pi_b",
    external_payment_id: "pi_b",
    gross_amount_cents: 8000,
    platform_fee_cents: 80,
  });

  const rimborsoDiB = rimborso({
    id: "tx-refund-b",
    amount: -30,
    external_reference: "re_b",
    external_payment_id: "pi_b",
    data: { kind: "refund", refundOfTransactionId: "tx-b" },
  });

  const tutti = [a, b, rimborsoDiB];

  const suA = refunds.describeRefundAvailability({
    transaction: a,
    transactions: tutti,
  });
  const suB = refunds.describeRefundAvailability({
    transaction: b,
    transactions: tutti,
  });

  assert.equal(suA.refundedCents, 0, "il rimborso di B non tocca A");
  assert.equal(suA.refundableCents, 5000);
  assert.equal(suB.refundedCents, 3000);
  assert.equal(suB.refundableCents, 5000);
});

/* ------------------------------------------------------- l'importo scritto */

test("un importo nullo o negativo non e un rimborso", () => {
  const tx = incasso();
  const availability = refunds.describeRefundAvailability({
    transaction: tx,
    transactions: [tx],
  });

  for (const amount of [0, -1, "", "abc"]) {
    assert.match(
      refunds.validateRefundAmount({ amount, availability }) || "",
      /maggiore di zero/,
    );
  }
});

test("un importo oltre il rimborsabile viene rifiutato prima di partire", () => {
  const tx = incasso();
  const availability = refunds.describeRefundAvailability({
    transaction: tx,
    transactions: [tx, rimborso()],
  });

  assert.match(
    refunds.validateRefundAmount({ amount: 100.01, availability }) || "",
    /non si puo rimborsare piu/i,
  );
  assert.equal(refunds.validateRefundAmount({ amount: 100, availability }), null);
});

/* --------------------------------------------- la commissione restituita */

test("la commissione di piattaforma torna in proporzione a quella trattenuta", () => {
  const tx = incasso();

  const parziale = refunds.previewRefund({
    transaction: tx,
    amountCents: 3000,
  });

  /* 130 € con l'1% trattenuto = 1,30 €; su 30 € ne tornano 0,30. */
  assert.equal(parziale.platformFeeRefundedCents, 30);
  assert.equal(parziale.netCollectedCents, 10000);
});

test("un rimborso totale restituisce esattamente quel che era stato trattenuto", () => {
  const tx = incasso();

  const totale = refunds.previewRefund({
    transaction: tx,
    amountCents: 13000,
  });

  assert.equal(
    totale.platformFeeRefundedCents,
    130,
    "sul totale non si passa da una proporzione, che perderebbe un centesimo",
  );
  assert.equal(totale.providerFeeRefundedCents, 217);
  assert.equal(totale.netCollectedCents, 0);
});

test("senza numeri congelati non si inventa una commissione restituita", () => {
  const tx = incasso({
    source: "MANUAL",
    gross_amount_cents: null,
    platform_fee_cents: null,
  });

  const anteprima = refunds.previewRefund({ transaction: tx, amountCents: 100 });

  assert.equal(anteprima.settlement, null);
  assert.equal(anteprima.platformFeeRefundedCents, 0);
  assert.equal(anteprima.providerFeeRefundedCents, null);
});

/* ------------------------------------------------- la rata, dopo il rimborso */

const rata = (overrides = {}) => ({
  installmentId: "rata-1",
  planInstallmentId: null,
  label: "Rata unica",
  dueDate: "2026-09-30T00:00:00.000Z",
  dueAmount: 130,
  paidAmount: 130,
  residualAmount: 0,
  state: "paid",
  overdue: false,
  statusLabels: ["PAGATA"],
  progress: 1,
  transactions: [],
  ...overrides,
});

test("un rimborso parziale riporta la rata a parzialmente pagata", () => {
  const dopo = refunds.previewInstallmentAfterRefund({
    ledger: rata(),
    amountCents: 3000,
  });

  assert.equal(dopo.paidAmount, 100);
  assert.equal(dopo.residualAmount, 30);
  assert.equal(dopo.state, "partial");
  assert.deepEqual(dopo.statusLabels, ["PARZIALMENTE PAGATA"]);
});

test("un rimborso totale riporta la rata in attesa", () => {
  const dopo = refunds.previewInstallmentAfterRefund({
    ledger: rata(),
    amountCents: 13000,
  });

  assert.equal(dopo.paidAmount, 0);
  assert.equal(dopo.residualAmount, 130);
  assert.deepEqual(dopo.statusLabels, ["IN ATTESA"]);
});

test("una rata scaduta torna scoperta e scaduta, e lo dice", () => {
  const dopo = refunds.previewInstallmentAfterRefund({
    ledger: rata({ overdue: true }),
    amountCents: 13000,
  });

  assert.deepEqual(dopo.statusLabels, ["IN ATTESA", "SCADUTA"]);
});

/* ----------------------------------------------------------- idempotenza */

test("due clic sullo stesso rimborso chiedono la stessa chiave", () => {
  const chiave = () =>
    refunds.buildRefundIdempotencyKey({
      organizationId: "club-1",
      externalPaymentId: "pi_uno",
      amountCents: 3000,
      refundedCents: 0,
    });

  assert.equal(chiave(), chiave());
});

test("un secondo rimborso dello stesso importo chiede una chiave diversa", () => {
  /*
    Il difetto che questa proprieta impedisce: 30 € restituiti, poi altri 30.
    Con una chiave che non conosce il gia rimborsato, Stripe avrebbe
    restituito il **primo** rimborso e il club avrebbe creduto di averne fatti
    due. E lo stesso ragionamento di ADR-0063 sul checkout.
  */
  const primo = refunds.buildRefundIdempotencyKey({
    organizationId: "club-1",
    externalPaymentId: "pi_uno",
    amountCents: 3000,
    refundedCents: 0,
  });

  const secondo = refunds.buildRefundIdempotencyKey({
    organizationId: "club-1",
    externalPaymentId: "pi_uno",
    amountCents: 3000,
    refundedCents: 3000,
  });

  assert.notEqual(primo, secondo);
});

test("due club non condividono mai una chiave di rimborso", () => {
  const alfa = refunds.buildRefundIdempotencyKey({
    organizationId: "club-1",
    externalPaymentId: "pi_uno",
    amountCents: 3000,
    refundedCents: 0,
  });

  const beta = refunds.buildRefundIdempotencyKey({
    organizationId: "club-2",
    externalPaymentId: "pi_uno",
    amountCents: 3000,
    refundedCents: 0,
  });

  assert.notEqual(alfa, beta);
});

/* ------------------------------------------ rimborso e storno non si confondono */

test("uno storno non e un rimborso, anche se e negativo", () => {
  const storno = ledger.normalizePaymentTransaction({
    id: "tx-storno",
    amount: -130,
    reverses_transaction_id: "tx-1",
    data: {},
  });

  assert.equal(refunds.isRefundTransaction(storno), false);

  const tx = incasso();
  const esito = refunds.describeRefundAvailability({
    transaction: tx,
    transactions: [tx, storno],
  });

  assert.equal(
    esito.refundedCents,
    0,
    "uno storno non consuma il rimborsabile: dice che l'incasso non e avvenuto",
  );
});

test("il catalogo dei motivi e quello che il provider riconosce", () => {
  const valori = refunds.REFUND_REASONS.map((entry) => entry.value);

  assert.deepEqual(valori, [
    "requested_by_customer",
    "duplicate",
    "fraudulent",
  ]);

  assert.equal(refunds.isRefundReason("duplicate"), true);
  assert.equal(refunds.isRefundReason("perche si"), false);
});

/* ------------- il netto di un secondo rimborso sullo stesso incasso */

/**
 * **Il difetto trovato a runtime nel collaudo E-13.**
 *
 * `netCollectedCents` sottraeva l'importo che si sta restituendo dal **lordo**
 * dell'incasso, ignorando cio che ne era gia tornato indietro. Su un incasso da
 * 130 gia rimborsato di 30, restituire i 100 restanti mostrava «Netto incassato
 * su questo movimento 30,00 €» invece di zero — e lo mostrava nella finestra
 * che si legge prima di premere il pulsante che restituisce il denaro.
 */

test("il netto di un movimento tiene conto dei rimborsi gia registrati", () => {
  const tx = incasso();

  const secondo = refunds.previewRefund({
    transaction: tx,
    amountCents: 10000,
    refundedCents: 3000,
  });

  assert.equal(
    secondo.netCollectedCents,
    0,
    "130 incassati, 30 gia restituiti, 100 in restituzione: non resta niente",
  );

  /*
    La commissione restituita resta proporzionale a **questo** rimborso, e non
    cambia: 100 su 130 di 1,30 € fanno 1,00 €. Sommata ai 30 centesimi del
    primo rimborso rende l'intera commissione trattenuta.
  */
  assert.equal(secondo.platformFeeRefundedCents, 100);
});

test("un rimborso parziale dopo un altro lascia incassato quel che resta", () => {
  const tx = incasso();

  const terzo = refunds.previewRefund({
    transaction: tx,
    amountCents: 4000,
    refundedCents: 3000,
  });

  assert.equal(terzo.netCollectedCents, 6000, "130 - 30 - 40 = 60");
});

test("senza rimborsi precedenti il netto e quello di sempre", () => {
  const tx = incasso();

  assert.equal(
    refunds.previewRefund({ transaction: tx, amountCents: 3000 })
      .netCollectedCents,
    10000,
    "omettere il gia rimborsato quando non ce n'e non cambia niente",
  );
});
