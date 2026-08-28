import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  aggregateClubPayments,
  summarizeClubMovements,
} from "../../src/lib/club-financial-summary.ts";
import {
  calculatePaymentReport,
  isAthletePaymentMovement,
} from "../../src/lib/club-report-utils.ts";
import {
  isSettledTransaction,
  normalizePaymentTransactions,
  resolveInstallmentLedger,
} from "../../src/lib/payments/installment-ledger.ts";

/**
 * `/reports` e `/movements` rispondono allo stesso numero alla domanda «quanto
 * ho incassato».
 *
 * **Il difetto che questi test chiudono (G-19).** Il report pagamenti sommava
 * `movement.amount` — il **dovuto** — quando la rata risultava saldata, e zero
 * quando era incassata a meta. Sullo stesso club e sullo stesso periodo
 * `/reports` diceva «Pagato 179,80» e `/movements` diceva «Incassato 250,00».
 * Uno dei due mentiva, ed era il report.
 *
 * ADR-0068 aveva gia stabilito quale delle due letture e quella giusta e
 * l'aveva applicata a `/movements`. Qui si chiude il giro: il report legge
 * `collectedAmount`, e cio che manca al dovuto e residuo.
 *
 * **L'invariante.** L'ultimo test del file e la protezione strutturale che
 * ADR-0068 chiede: nessun terzo posto puo tornare a dedurre la cassa dallo
 * stato della rata. Se qualcuno lo reintroduce, questo file diventa rosso
 * prima che il numero sbagliato arrivi a un cliente.
 */

const CLUB = "club-g19";

const rata = ({
  id,
  amount,
  athleteId = "atleta-1",
  label = "Rata 1",
  dueDate = "2026-09-30T00:00:00.000Z",
}) => ({
  id,
  organization_id: CLUB,
  athlete_id: athleteId,
  description: `Quota annuale - ${label}`,
  amount,
  due_date: dueDate,
  paid_at: null,
  status: "pending",
  method: null,
  data: { installmentId: `${id}-plan`, installmentLabel: label },
});

const incasso = ({
  id,
  chargeId,
  amount,
  paidAt,
  reversedAt = null,
  reverses = null,
}) => ({
  id,
  organization_id: CLUB,
  athlete_id: "atleta-1",
  payment_id: chargeId,
  amount,
  paid_at: paidAt,
  payment_method: "cash",
  source: "MANUAL",
  created_at: paidAt,
  reversed_at: reversedAt,
  reverses_transaction_id: reverses,
});

/**
 * La rata come la riscrive `recomputeChargeFromLedger` dopo un movimento: la
 * fotografia non si scrive a mano, la si ricava dalle stesse funzioni che la
 * producono in esercizio.
 */
const conIncassi = (charge, rows = []) => {
  const transactions = normalizePaymentTransactions(rows);
  const ledger = resolveInstallmentLedger({ charge, transactions });
  const settled = transactions.filter(isSettledTransaction);
  const last = settled[settled.length - 1] || null;

  return {
    ...charge,
    status:
      ledger.state === "paid"
        ? "paid"
        : ledger.state === "partial"
          ? "partially_paid"
          : "pending",
    paid_at: ledger.state === "paid" && last?.paidAt ? last.paidAt : null,
    method: last?.paymentMethod || charge.method || null,
    data: {
      ...(charge.data || {}),
      ledger: {
        dueAmount: ledger.dueAmount,
        paidAmount: ledger.paidAmount,
        residualAmount: ledger.residualAmount,
        state: ledger.state,
        transactionCount: settled.length,
        updatedAt: "2026-08-28T10:00:00.000Z",
      },
    },
  };
};

const report = (sources) => calculatePaymentReport(aggregateClubPayments(sources));

/** Il riepilogo di `/movements` ristretto alle stesse righe che legge il report. */
const cassaMovimenti = (sources) => {
  const movements = aggregateClubPayments(sources).filter(isAthletePaymentMovement);
  return summarizeClubMovements(movements);
};

// --- la cassa nel report -----------------------------------------------------

test("una rata senza incassi non porta niente al Pagato", () => {
  const risultato = report({ payments: [rata({ id: "r1", amount: 100 })] });

  assert.equal(risultato.totalDue, 100);
  assert.equal(risultato.totalPaid, 0);
  assert.equal(risultato.paidCount, 0);
  assert.equal(risultato.partialCount, 0);
});

test("una rata incassata in parte porta al Pagato il solo incassato", () => {
  const charge = rata({ id: "r1", amount: 130 });
  const risultato = report({
    payments: [
      conIncassi(charge, [
        incasso({
          id: "t1",
          chargeId: "r1",
          amount: 50,
          paidAt: "2026-09-01T10:00:00.000Z",
        }),
        incasso({
          id: "t2",
          chargeId: "r1",
          amount: 30,
          paidAt: "2026-09-05T10:00:00.000Z",
        }),
      ]),
    ],
  });

  // Lo scenario 9 della UAT: 130 dovuti, 50 in contanti + 30 con carta.
  assert.equal(risultato.totalPaid, 80);
  assert.equal(risultato.totalDue, 130);
  assert.equal(risultato.totalPending + risultato.totalOverdue, 50);
  assert.equal(risultato.paidCount, 0, "non e saldata: resta un residuo");
  assert.equal(risultato.partialCount, 1);
});

test("lo storno di un incasso torna indietro anche nel report", () => {
  const charge = rata({ id: "r1", amount: 130 });
  const rows = [
    incasso({
      id: "t1",
      chargeId: "r1",
      amount: 50,
      paidAt: "2026-09-01T10:00:00.000Z",
    }),
    incasso({
      id: "t2",
      chargeId: "r1",
      amount: 30,
      paidAt: "2026-09-05T10:00:00.000Z",
      reversedAt: "2026-09-06T10:00:00.000Z",
    }),
    incasso({
      id: "t3",
      chargeId: "r1",
      amount: -30,
      paidAt: "2026-09-06T10:00:00.000Z",
      reverses: "t2",
    }),
  ];

  // Lo scenario 10 della UAT: stornati i 30, restano 50 in cassa e 80 di residuo.
  const risultato = report({ payments: [conIncassi(charge, rows)] });

  assert.equal(risultato.totalPaid, 50);
  assert.equal(risultato.totalPending + risultato.totalOverdue, 80);
});

test("una rata saldata conta per intero e non e piu parziale", () => {
  const charge = rata({ id: "r1", amount: 100 });
  const risultato = report({
    payments: [
      conIncassi(charge, [
        incasso({
          id: "t1",
          chargeId: "r1",
          amount: 100,
          paidAt: "2026-09-01T10:00:00.000Z",
        }),
      ]),
    ],
  });

  assert.equal(risultato.totalPaid, 100);
  assert.equal(risultato.paidCount, 1);
  assert.equal(risultato.partialCount, 0);
  assert.equal(risultato.totalPending, 0);
  assert.equal(risultato.totalOverdue, 0);
});

test("una rata saldata prima del registro incassi continua a contare", () => {
  const legacy = {
    ...rata({ id: "r1", amount: 90 }),
    status: "paid",
    paid_at: "2025-10-01T10:00:00.000Z",
  };

  const risultato = report({ payments: [legacy] });

  assert.equal(
    risultato.totalPaid,
    90,
    "il passaggio alla cassa non puo cancellare denaro gia registrato",
  );
  assert.equal(risultato.paidCount, 1);
});

test("il residuo di una rata scaduta finisce nello Scaduto, non l'importo intero", () => {
  const charge = rata({
    id: "r1",
    amount: 200,
    dueDate: "2020-01-31T00:00:00.000Z",
  });

  const risultato = report({
    payments: [
      conIncassi(charge, [
        incasso({
          id: "t1",
          chargeId: "r1",
          amount: 150,
          paidAt: "2020-01-10T10:00:00.000Z",
        }),
      ]),
    ],
  });

  assert.equal(risultato.totalPaid, 150);
  assert.equal(risultato.totalOverdue, 50);
  assert.equal(risultato.overdueCount, 1);
  assert.equal(risultato.partialCount, 1);
  assert.equal(risultato.totalPending, 0);
});

test("una rata annullata non entra ne nel dovuto ne nella cassa", () => {
  const annullata = {
    ...rata({ id: "r1", amount: 100 }),
    status: "cancelled",
  };

  const risultato = report({ payments: [annullata, rata({ id: "r2", amount: 40 })] });

  assert.equal(risultato.totalDue, 40);
  assert.equal(risultato.totalPaid, 0);
});

test("un club senza pagamenti non produce NaN ne un vuoto", () => {
  const risultato = report({ payments: [] });

  // Lo scenario 11 della UAT.
  assert.equal(risultato.hasPayments, false);
  for (const key of [
    "totalDue",
    "totalPaid",
    "totalPending",
    "totalOverdue",
  ]) {
    assert.equal(risultato[key], 0, `${key} deve essere zero, non NaN`);
    assert.ok(Number.isFinite(risultato[key]), `${key} non e finito`);
  }
});

// --- l'invariante fra le due pagine ------------------------------------------

test("Report e Movimenti chiudono sullo stesso incassato", () => {
  const sources = {
    payments: [
      // saldata
      conIncassi(rata({ id: "r1", amount: 100, label: "Rata 1" }), [
        incasso({
          id: "t1",
          chargeId: "r1",
          amount: 100,
          paidAt: "2026-09-01T10:00:00.000Z",
        }),
      ]),
      // parziale
      conIncassi(rata({ id: "r2", amount: 130, label: "Rata 2" }), [
        incasso({
          id: "t2",
          chargeId: "r2",
          amount: 55.5,
          paidAt: "2026-09-02T10:00:00.000Z",
        }),
      ]),
      // scaduta e parziale
      conIncassi(
        rata({
          id: "r3",
          amount: 80,
          label: "Rata 3",
          dueDate: "2020-01-31T00:00:00.000Z",
        }),
        [
          incasso({
            id: "t3",
            chargeId: "r3",
            amount: 19.99,
            paidAt: "2020-01-02T10:00:00.000Z",
          }),
        ],
      ),
      // non pagata
      rata({ id: "r4", amount: 45, label: "Rata 4" }),
      // annullata
      { ...rata({ id: "r5", amount: 300, label: "Rata 5" }), status: "cancelled" },
      // saldata prima del registro
      {
        ...rata({ id: "r6", amount: 20, label: "Rata 6" }),
        status: "paid",
        paid_at: "2025-10-01T10:00:00.000Z",
      },
    ],
  };

  const risultato = report(sources);
  const movimenti = cassaMovimenti(sources);

  assert.equal(
    risultato.totalPaid,
    movimenti.totalIncome,
    "«Pagato» di /reports e «Entrate» di /movements sono lo stesso denaro",
  );
  assert.equal(
    risultato.totalPending + risultato.totalOverdue,
    movimenti.totalPendingIncome,
    "il residuo del report e il residuo dei movimenti, ripartito fra atteso e scaduto",
  );
});

test("l'invariante regge anche sui centesimi", () => {
  // Tre rate che in virgola mobile sommerebbero 0,30000000000000004.
  const sources = {
    payments: ["r1", "r2", "r3"].map((id, index) =>
      conIncassi(rata({ id, amount: 0.1, label: `Rata ${index + 1}` }), [
        incasso({
          id: `t-${id}`,
          chargeId: id,
          amount: 0.1,
          paidAt: "2026-09-01T10:00:00.000Z",
        }),
      ]),
    ),
  };

  const risultato = report(sources);

  assert.equal(risultato.totalPaid, 0.3);
  assert.equal(risultato.totalPaid, cassaMovimenti(sources).totalIncome);
});

// --- la protezione strutturale (ADR-0068) ------------------------------------

const SRC = path.join(process.cwd(), "src");

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
};

/**
 * I due soli punti in cui e lecito dedurre l'incassato dallo stato, e solo
 * come **fallback dichiarato** quando la fotografia `data.ledger` non c'e:
 * sono le rate anteriori al registro incassi (ADR-0068, «Compatibilita»).
 */
const FALLBACK_DICHIARATI = [
  "lib/club-financial-summary.ts",
  "lib/athlete-payment-utils.ts",
  "lib/payments/installment-ledger.ts",
];

/**
 * Le forme in cui si scrive «se la rata risulta pagata vale tutto, altrimenti
 * zero».
 *
 * **Cosa questa guardia e, e cosa non e.** E una guardia testuale, non
 * un'invariante: legge la grafia del codice, non il suo significato. La prima
 * versione cercava tre sole forme — quelle esatte del codice che G-19 aveva
 * appena cancellato — e sarebbe passata sopra un apice singolo o una variabile
 * chiamata diversamente. L'audit di fine Wave 1 lo ha rilevato, e l'elenco e
 * stato allargato a tutte le grafie ragionevoli.
 *
 * Resta aggirabile da chi si impegna a scriverlo in modo strano. La protezione
 * vera e altrove, ed e il test funzionale qui sopra: `/reports` e `/movements`
 * confrontati sugli stessi movimenti. Questa serve a **rendere rumorosa** la
 * reintroduzione distratta, che e il modo in cui G-19 e nato.
 */
const FORME_DELLA_DEDUZIONE = [
  // status === "paid" ? amount : 0   (apici doppi o singoli, qualunque nome)
  /===\s*["']paid["']\s*\?\s*[A-Za-z_$][\w.$]*\s*:\s*0/,
  // isPaid ? importo : 0
  /\bis[A-Z]\w*Paid\w*\s*\?\s*[A-Za-z_$][\w.$]*\s*:\s*0/,
  // if (isPaid) { totale += amount }
  /\bis[A-Z]?\w*[Pp]aid\w*\s*\)\s*\{[^}]{0,200}\+=\s*[A-Za-z_$][\w.$]*\s*[;,)]/,
  // PAID_STATUSES.has(...) ... += amount
  /PAID_STATUSES\.has\([^)]*\)[\s\S]{0,200}\+=\s*[A-Za-z_$][\w.$]*\s*[;,)]/,
  // status === "paid" ... += amount, entro poche righe
  /===\s*["']paid["'][\s\S]{0,200}\+=\s*[A-Za-z_$][\w.$]*\s*[;,)]/,
];

test("nessuna terza interpretazione del denaro incassato", () => {
  const offenders = walk(SRC)
    .filter((file) => {
      const source = readFileSync(file, "utf8");
      return FORME_DELLA_DEDUZIONE.some((forma) => forma.test(source));
    })
    .map((file) => path.relative(SRC, file).replace(/\\/g, "/"))
    .filter((file) => !FALLBACK_DICHIARATI.includes(file));

  assert.deepEqual(
    offenders,
    [],
    "il denaro incassato si legge da collectedAmount (ADR-0068), non dallo stato della rata",
  );
});

test("la guardia riconosce le grafie con cui il difetto si riscrive", () => {
  /*
    Una guardia testuale che non si prova contro cio che deve riconoscere e
    una decorazione. Queste sono le forme che l'audit ha indicato come vie di
    fuga della prima versione: devono essere tutte riconosciute.
  */
  const riscritture = [
    'sum += charge.status === "paid" ? charge.amount : 0;',
    "sum += charge.status === 'paid' ? charge.amount : 0;",
    'const isPaid = normalizeStatus(row.status) === "paid";\nif (isPaid) { totale += dovuto; }',
    'if (PAID_STATUSES.has(status)) {\n  incassato += movement.amount;\n}',
    'totale += stato === "paid" ? riga.importo : 0;',
  ];

  for (const riscrittura of riscritture) {
    assert.ok(
      FORME_DELLA_DEDUZIONE.some((forma) => forma.test(riscrittura)),
      `la guardia non riconoscerebbe:\n${riscrittura}`,
    );
  }

  // E non deve gridare su codice legittimo.
  const innocenti = [
    "summary.totalPaid += collectedCents;",
    'const isPaid = status === "paid";\nreturn isPaid ? labels.paid : labels.pending;',
    "residuo += Math.max(0, dueCents - collectedCents);",
  ];
  for (const innocente of innocenti) {
    assert.ok(
      !FORME_DELLA_DEDUZIONE.some((forma) => forma.test(innocente)),
      `falso positivo su:\n${innocente}`,
    );
  }
});

test("il report dei pagamenti legge collectedAmount", () => {
  const source = readFileSync(
    path.join(SRC, "lib", "club-report-utils.ts"),
    "utf8",
  );

  assert.match(
    source,
    /movement\.collectedAmount/,
    "calculatePaymentReport deve sommare la cassa",
  );
  assert.doesNotMatch(
    source,
    /PAID_STATUSES/,
    "l'elenco degli stati «pagato» non serve piu a sommare denaro",
  );
});

test("una rata esclusa dai totali sparisce da entrambe le pagine", () => {
  /*
    L'audit di fine Wave sospettava una divergenza: `/reports` filtra con
    `isPaymentExcludedFromTotals` (che guarda anche `data.excludedFromTotals`),
    `/movements` scarta lo stato `cancelled`. Sarebbero due predicati diversi
    sullo stesso denaro.

    Non lo sono, e la ragione va scritta perche non venga «corretta» per
    sbaglio: il normalizzatore dei pagamenti atleti porta gia a `cancelled`
    tutto cio che `isPaymentExcludedFromTotals` esclude. Il predicato e uno,
    applicato una volta a monte. Questo test lo tiene fermo.
  */
  const esclusa = {
    ...rata({ id: "r1", amount: 500 }),
    status: "paid",
    paid_at: "2026-09-01T10:00:00.000Z",
    data: { installmentId: "r1-plan", excludedFromTotals: true },
  };

  const sources = { payments: [esclusa, rata({ id: "r2", amount: 40 })] };
  const risultato = report(sources);
  const movimenti = cassaMovimenti(sources);

  assert.equal(risultato.totalPaid, 0, "il report non conta una rata esclusa");
  assert.equal(
    movimenti.totalIncome,
    0,
    "e nemmeno i movimenti: il predicato di esclusione e uno solo",
  );
  assert.equal(risultato.totalDue, 40);
});
