import assert from "node:assert/strict";
import test from "node:test";

import {
  isLiveCoverage,
  normalizeCoverageAllocations,
  remainingCoverageCapacity,
  remainingEnrollmentCapacity,
  resolveInstallmentCoverage,
  sumLiveCoverage,
  validateCoverageAllocation,
} from "../../src/lib/payments/coverage-ledger.ts";
import { resolveInstallmentLedger } from "../../src/lib/payments/installment-ledger.ts";

/**
 * **N7 / ADR-0158 — i dodici scenari di riconciliazione del mandato.**
 *
 * La proprieta che tutti misurano, da lati diversi, e una sola: **una copertura
 * non e un incasso**. Il piano resta la fonte del debito, il voucher lo copre,
 * e finche l'ente non versa quel denaro non e cassa.
 *
 * La prova che vale piu di tutte e la §3 sulla compatibilita: su una rata senza
 * copertura il nuovo calcolo deve dare **esattamente** il vecchio, altrimenti
 * questa lane avrebbe cambiato il significato di ogni rata del pilota.
 */

const ADESIONE = "enr-1";
const RATA = "pay-1";

const copertura = (amount, overrides = {}) => ({
  id: overrides.id || `cov-${Math.random().toString(36).slice(2, 8)}`,
  payment_id: RATA,
  enrollment_id: ADESIONE,
  athlete_id: "atl-1",
  amount,
  reversed_at: null,
  reverses_allocation_id: null,
  ...overrides,
});

const incasso = (amount, overrides = {}) => ({
  id: overrides.id || `tx-${Math.random().toString(36).slice(2, 8)}`,
  payment_id: RATA,
  amount,
  paid_at: "2026-01-15T10:00:00.000Z",
  payment_method: "cash",
  reversed_at: null,
  reverses_transaction_id: null,
  ...overrides,
});

/* ------------------------------------------------------------------ */
/* 1. 600 di piano, 500 di voucher, 100 di famiglia                    */
/* ------------------------------------------------------------------ */

test("scenario 1 · 600 di piano, 500 di voucher, 100 alla famiglia", () => {
  const quadro = resolveInstallmentCoverage({
    dueAmount: 600,
    allocations: [copertura(500)],
    enrollmentCoverage: { [ADESIONE]: 500 },
    enrollmentFunding: { [ADESIONE]: { accruedAmount: 0, settledAmount: 0 } },
  });

  assert.equal(quadro.dueAmount, 600, "il debito non cambia: il piano resta la fonte");
  assert.equal(quadro.plannedCoverage, 500);
  assert.equal(quadro.familyDueAmount, 100, "la famiglia deve 100, non 600");
  assert.equal(quadro.familyPaidAmount, 0);
  assert.equal(quadro.familyResidualAmount, 100);

  /* E il punto di tutto: i 500 non sono incassati. */
  assert.equal(quadro.settledCoverage, 0, "nessun euro dell'ente e ancora arrivato");
  assert.equal(quadro.state, "pending");
});

/* ------------------------------------------------------------------ */
/* 2. Voucher previsto ma 0 maturato                                   */
/* ------------------------------------------------------------------ */

test("scenario 2 · voucher previsto e zero maturato: la copertura resta una promessa", () => {
  const quadro = resolveInstallmentCoverage({
    dueAmount: 200,
    allocations: [copertura(150)],
    enrollmentCoverage: { [ADESIONE]: 150 },
    enrollmentFunding: { [ADESIONE]: { accruedAmount: 0, settledAmount: 0 } },
  });

  assert.equal(quadro.plannedCoverage, 150);
  assert.equal(quadro.accruedCoverage, 0);
  assert.equal(quadro.settledCoverage, 0);
  assert.equal(
    quadro.familyDueAmount,
    50,
    "la quota famiglia dipende dalla copertura **prevista**: e cio che il club ha deciso di chiedere",
  );
});

/* ------------------------------------------------------------------ */
/* 3. Maturazione parziale                                             */
/* ------------------------------------------------------------------ */

test("scenario 3 · maturazione parziale: matura la quota, non tutto", () => {
  const quadro = resolveInstallmentCoverage({
    dueAmount: 200,
    allocations: [copertura(150)],
    enrollmentCoverage: { [ADESIONE]: 300 },
    enrollmentFunding: { [ADESIONE]: { accruedAmount: 150, settledAmount: 0 } },
  });

  /*
    L'adesione ha allocato 300 in tutto (due rate da 150) e ne ha maturati 150:
    meta. Su questa rata la quota maturata e percio 75.
  */
  assert.equal(quadro.accruedCoverage, 75);
  assert.equal(quadro.settledCoverage, 0, "maturato non e liquidato");
  assert.equal(quadro.familyDueAmount, 50, "la quota famiglia non si muove");
});

/* ------------------------------------------------------------------ */
/* 4. Liquidazione parziale                                            */
/* ------------------------------------------------------------------ */

test("scenario 4 · liquidazione parziale: liquidato <= maturato", () => {
  const quadro = resolveInstallmentCoverage({
    dueAmount: 200,
    allocations: [copertura(150)],
    enrollmentCoverage: { [ADESIONE]: 150 },
    enrollmentFunding: { [ADESIONE]: { accruedAmount: 150, settledAmount: 60 } },
  });

  assert.equal(quadro.accruedCoverage, 150);
  assert.equal(quadro.settledCoverage, 60);
  assert.ok(
    quadro.settledCoverage <= quadro.accruedCoverage,
    "l'ente non puo aver versato piu di quanto sia maturato",
  );
});

/* ------------------------------------------------------------------ */
/* 5. La famiglia paga prima della maturazione                         */
/* ------------------------------------------------------------------ */

test("scenario 5 · la famiglia salda la sua quota prima che il voucher maturi", () => {
  const quadro = resolveInstallmentCoverage({
    dueAmount: 200,
    transactions: [incasso(50)],
    allocations: [copertura(150)],
    enrollmentCoverage: { [ADESIONE]: 150 },
    enrollmentFunding: { [ADESIONE]: { accruedAmount: 0, settledAmount: 0 } },
  });

  assert.equal(quadro.familyPaidAmount, 50);
  assert.equal(quadro.familyResidualAmount, 0);
  assert.equal(
    quadro.state,
    "paid",
    "«pagata» risponde alla domanda della famiglia: ha versato quanto le toccava",
  );

  /*
    E la prova che il mandato chiede con piu insistenza: i 150 **non** sono
    diventati un incasso solo perche la rata risulta saldata per la famiglia.
  */
  assert.equal(quadro.familyPaidAmount, 50, "la cassa e 50, non 200");
  assert.equal(quadro.settledCoverage, 0);
});

/* ------------------------------------------------------------------ */
/* 6. Voucher rifiutato                                                */
/* ------------------------------------------------------------------ */

test("scenario 6 · voucher rifiutato: la quota famiglia risale", () => {
  const originale = copertura(150, { id: "cov-1" });
  const storno = copertura(-150, {
    id: "cov-2",
    reverses_allocation_id: "cov-1",
  });
  originale.reversed_at = "2026-02-01T00:00:00.000Z";

  const quadro = resolveInstallmentCoverage({
    dueAmount: 200,
    transactions: [incasso(50)],
    allocations: [originale, storno],
    enrollmentCoverage: { [ADESIONE]: 0 },
    enrollmentFunding: { [ADESIONE]: { accruedAmount: 0, settledAmount: 0 } },
  });

  assert.equal(quadro.plannedCoverage, 0, "lo storno neutralizza le due gambe");
  assert.equal(quadro.familyDueAmount, 200, "la famiglia torna a dovere tutto");
  assert.equal(quadro.familyResidualAmount, 150);
  assert.equal(quadro.state, "partial", "i 50 gia versati restano versati");
});

/* ------------------------------------------------------------------ */
/* 7-9. Rimozione prima, dopo la maturazione, dopo la liquidazione     */
/* ------------------------------------------------------------------ */

test("scenario 7 · rimozione prima della maturazione: non resta residuo anomalo", () => {
  const originale = copertura(150, { id: "cov-1" });
  originale.reversed_at = "2026-02-01T00:00:00.000Z";

  const quadro = resolveInstallmentCoverage({
    dueAmount: 200,
    allocations: [
      originale,
      copertura(-150, { id: "cov-2", reverses_allocation_id: "cov-1" }),
    ],
    enrollmentCoverage: { [ADESIONE]: 0 },
    enrollmentFunding: { [ADESIONE]: { accruedAmount: 0, settledAmount: 0 } },
  });

  assert.equal(quadro.plannedCoverage, 0);
  assert.equal(quadro.familyDueAmount, 200);
  assert.equal(
    quadro.allocations.length,
    2,
    "lo storico resta: due righe, non zero",
  );
});

test("scenario 8 · rimozione dopo la maturazione: lo storico del maturato non si tocca", () => {
  /*
    La copertura si storna comunque — la promessa alla famiglia decade — ma
    cio che l'atleta ha **maturato** resta un fatto verso l'ente. Le due cose
    vivono in due domini diversi, ed e la ragione per cui `funding` non importa
    `payments`.
  */
  const originale = copertura(150, { id: "cov-1" });
  originale.reversed_at = "2026-03-01T00:00:00.000Z";

  const quadro = resolveInstallmentCoverage({
    dueAmount: 200,
    allocations: [
      originale,
      copertura(-150, { id: "cov-2", reverses_allocation_id: "cov-1" }),
    ],
    enrollmentCoverage: { [ADESIONE]: 0 },
    enrollmentFunding: { [ADESIONE]: { accruedAmount: 150, settledAmount: 0 } },
  });

  assert.equal(quadro.plannedCoverage, 0, "la promessa decade");
  assert.equal(
    quadro.accruedCoverage,
    0,
    "senza copertura viva non c'e niente da sostenere su questa rata",
  );
  assert.equal(quadro.familyDueAmount, 200);
});

test("scenario 9 · rimozione dopo la liquidazione: il denaro dell'ente resta dov'e", () => {
  const quadro = resolveInstallmentCoverage({
    dueAmount: 200,
    allocations: [copertura(150)],
    enrollmentCoverage: { [ADESIONE]: 150 },
    enrollmentFunding: { [ADESIONE]: { accruedAmount: 150, settledAmount: 150 } },
  });

  assert.equal(quadro.settledCoverage, 150);
  assert.equal(
    quadro.familyDueAmount,
    50,
    "una copertura gia liquidata non si storna: quel denaro e arrivato",
  );
});

/* ------------------------------------------------------------------ */
/* 10. Doppio clic / idempotenza                                       */
/* ------------------------------------------------------------------ */

test("scenario 10 · due coperture identiche sono due promesse, e il tetto le ferma", () => {
  /*
    L'idempotenza vera vive nel servizio, con la chiave dentro il blocco della
    rata. Qui si misura la difesa che regge **anche** senza chiave: la seconda
    allocazione non ci sta.
  */
  const errore = validateCoverageAllocation({
    amount: 150,
    dueAmount: 200,
    existingOnInstallment: [copertura(150)],
    assignedAmount: 500,
    existingOnEnrollment: [copertura(150)],
    enrollmentId: ADESIONE,
  });

  assert.match(errore, /puo ancora essere coperta per 50\.00/);
});

/* ------------------------------------------------------------------ */
/* 11. Storno                                                          */
/* ------------------------------------------------------------------ */

test("scenario 11 · lo storno neutralizza tutte e due le gambe", () => {
  const originale = copertura(150, { id: "cov-1" });
  originale.reversed_at = "2026-02-01T00:00:00.000Z";
  const storno = copertura(-150, {
    id: "cov-2",
    reverses_allocation_id: "cov-1",
  });

  const righe = normalizeCoverageAllocations([originale, storno]);

  assert.equal(sumLiveCoverage(righe), 0);
  assert.equal(righe.filter(isLiveCoverage).length, 0);

  /*
    Il controspecchio: contare la sola riga negativa porterebbe la copertura
    **sotto zero**, e la quota famiglia sopra il debito.
  */
  assert.ok(sumLiveCoverage(righe) >= 0, "la copertura non va mai sotto zero");
});

/* ------------------------------------------------------------------ */
/* 12. Il rendiconto quadra                                            */
/* ------------------------------------------------------------------ */

test("scenario 12 · debito = copertura prevista + quota famiglia, sempre", () => {
  const casi = [
    { due: 600, cov: 500 },
    { due: 200, cov: 150 },
    { due: 200, cov: 0 },
    { due: 100, cov: 100 },
    { due: 133.33, cov: 66.66 },
  ];

  for (const caso of casi) {
    const quadro = resolveInstallmentCoverage({
      dueAmount: caso.due,
      allocations: caso.cov > 0 ? [copertura(caso.cov)] : [],
      enrollmentCoverage: { [ADESIONE]: caso.cov },
      enrollmentFunding: { [ADESIONE]: { accruedAmount: 0, settledAmount: 0 } },
    });

    assert.equal(
      Math.round((quadro.plannedCoverage + quadro.familyDueAmount) * 100),
      Math.round(caso.due * 100),
      `${caso.due} = ${quadro.plannedCoverage} + ${quadro.familyDueAmount}`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* La compatibilita: la prova che vale piu di tutte                    */
/* ------------------------------------------------------------------ */

test("su una rata senza copertura il calcolo nuovo da esattamente il vecchio", () => {
  /*
    Se questa fosse rossa, questa lane avrebbe cambiato il significato di
    **ogni** rata del pilota. La compatibilita non e una promessa: e una
    proprieta della formula, perche senza copertura `familyDueAmount` e
    `dueAmount` sono lo stesso numero.
  */
  const casi = [
    { due: 200, tx: [] },
    { due: 200, tx: [incasso(50)] },
    { due: 200, tx: [incasso(200)] },
    { due: 200, tx: [incasso(120), incasso(80)] },
    { due: 0, tx: [] },
  ];

  for (const caso of casi) {
    const vecchio = resolveInstallmentLedger({
      charge: { id: RATA, amount: caso.due },
      transactions: caso.tx,
    });
    const nuovo = resolveInstallmentCoverage({
      dueAmount: caso.due,
      transactions: caso.tx,
      allocations: [],
    });

    assert.equal(nuovo.state, vecchio.state, `stato per dovuto ${caso.due}`);
    assert.equal(nuovo.familyPaidAmount, vecchio.paidAmount);
    assert.equal(nuovo.familyDueAmount, vecchio.dueAmount);
  }
});

/* ------------------------------------------------------------------ */
/* I due tetti                                                         */
/* ------------------------------------------------------------------ */

test("non si copre una rata piu di quanto valga", () => {
  assert.equal(remainingCoverageCapacity(200, [copertura(150)]), 50);

  const errore = validateCoverageAllocation({
    amount: 60,
    dueAmount: 200,
    existingOnInstallment: [copertura(150)],
    assignedAmount: 500,
    existingOnEnrollment: [copertura(150)],
    enrollmentId: ADESIONE,
  });

  assert.match(errore, /promettere un rimborso/);
});

test("non si copre con denaro che l'ente non ha assegnato", () => {
  /*
    E il tetto piu importante, e quello che una revisione ostile cerca per
    primo: senza, un voucher da 500 coprirebbe 5.000 di rate e la quota
    famiglia si azzererebbe con una promessa mai fatta.
  */
  const gia = [
    copertura(300, { id: "a", payment_id: "pay-a" }),
    copertura(200, { id: "b", payment_id: "pay-b" }),
  ];

  assert.equal(remainingEnrollmentCapacity(500, gia, ADESIONE), 0);

  const errore = validateCoverageAllocation({
    amount: 50,
    dueAmount: 1000,
    existingOnInstallment: [],
    assignedAmount: 500,
    existingOnEnrollment: gia,
    enrollmentId: ADESIONE,
  });

  assert.match(errore, /non ancora impegnati/);
});

test("una copertura vale piu di zero", () => {
  assert.match(
    validateCoverageAllocation({
      amount: 0,
      dueAmount: 200,
      assignedAmount: 500,
      enrollmentId: ADESIONE,
    }),
    /maggiore di zero/,
  );
});

test("una copertura scritta a mano oltre il debito non produce un rimborso", () => {
  /*
    La guardia vive in scrittura, ma la lettura si difende comunque: una riga
    arrivata da una mano non deve poter produrre una quota famiglia
    **negativa**, cioe un rimborso che nessuno ha deliberato.
  */
  const quadro = resolveInstallmentCoverage({
    dueAmount: 200,
    allocations: [copertura(250)],
    enrollmentCoverage: { [ADESIONE]: 250 },
    enrollmentFunding: { [ADESIONE]: { accruedAmount: 0, settledAmount: 0 } },
  });

  assert.equal(quadro.familyDueAmount, 0);
  assert.ok(quadro.familyDueAmount >= 0);
});

/* ------------------------------------------------------------------ */
/* La ripartizione non introduce un ordine                             */
/* ------------------------------------------------------------------ */

test("il maturato si ripartisce in proporzione, non in ordine di scadenza", () => {
  /*
    Una ripartizione cronologica renderebbe lo stato di una rata dipendente
    dall'**ordine** delle altre: correggere una data di scadenza sposterebbe il
    maturato da una rata all'altra senza che nessuno abbia toccato una
    presenza.
  */
  const primaRata = resolveInstallmentCoverage({
    dueAmount: 200,
    allocations: [copertura(100, { payment_id: "pay-1" })],
    enrollmentCoverage: { [ADESIONE]: 200 },
    enrollmentFunding: { [ADESIONE]: { accruedAmount: 100, settledAmount: 0 } },
  });

  const secondaRata = resolveInstallmentCoverage({
    dueAmount: 200,
    allocations: [copertura(100, { payment_id: "pay-2" })],
    enrollmentCoverage: { [ADESIONE]: 200 },
    enrollmentFunding: { [ADESIONE]: { accruedAmount: 100, settledAmount: 0 } },
  });

  assert.equal(primaRata.accruedCoverage, 50);
  assert.equal(
    secondaRata.accruedCoverage,
    50,
    "le due rate portano la stessa quota: nessuna e «prima»",
  );
});
