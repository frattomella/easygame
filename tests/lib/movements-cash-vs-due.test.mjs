import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateClubPayments,
  summarizeClubMovements,
} from "../../src/lib/club-financial-summary.ts";

/**
 * **D-2 — «Entrate» sommava cassa e dovuto.**
 *
 * Il numero di testa di `/movements` non era ne cassa ne competenza: era un
 * misto, e nessuno che lo leggesse poteva saperlo.
 *
 * La causa era in una riga sola. Quando una riga non porta la fotografia del
 * registro (`data.ledger.paidAmount`), l'incassato veniva **dedotto dallo
 * stato**:
 *
 * ```js
 * return status === "paid" ? amount : 0;
 * ```
 *
 * Per le rate quella deduzione e legittima e va conservata: le rate anteriori
 * al registro sono saldate davvero, e toglierle cancellerebbe denaro gia
 * incassato. Ma la stessa riga passava sotto **tutto il resto** — previsioni,
 * fatture, ricevute, pagamenti sponsor — dove non c'e nessun fatto finanziario
 * a dimostrare l'incasso. E la mappa degli stati peggiorava le cose:
 * `"issued"` veniva riscritto in `"paid"`, quindi **una fattura emessa e non
 * pagata contava come denaro entrato**.
 *
 * La regola provata qui e una sola, ed e quella del brief:
 *
 * > **Incassato = evento finanziario realmente registrato.** Non si deduce
 * > cassa dallo stato quando non esiste una prova di pagamento canonica.
 *
 * Il dovuto non sparisce: resta in `amount` e nei totali dei pendenti. Sono
 * due numeri, e non si sommano mai.
 */

const CLUB = "club-d2";

const conto = { id: "conto-cassa", name: "Cassa" };

/* ------------------------------------------------------------ le fixture */

/** Una fattura emessa e non pagata: un credito, non cassa. */
const fatturaEmessa = {
  id: "fattura-1",
  organization_id: CLUB,
  amount: 1000,
  status: "issued",
  invoice_number: "2026/000004",
  issue_date: "2026-09-10T00:00:00.000Z",
  description: "Sponsorizzazione stagione 2026/27",
};

/** Uno sponsor che ha promesso e non ha ancora versato. */
const sponsorDovuto = {
  id: "sponsor-1",
  name: "Ferramenta Bianchi",
  payments: [
    {
      id: "sponsor-pay-1",
      amount: 3000,
      status: "pending",
      date: "2026-09-01T00:00:00.000Z",
      description: "Prima tranche contratto",
    },
  ],
};

/** Un movimento **previsto**: una riga di piano, non un fatto. */
const previstoIncassato = {
  id: "previsto-1",
  amount: 500,
  status: "paid",
  date: "2026-09-15T00:00:00.000Z",
  description: "Contributo comunale atteso",
};

/** Un movimento manuale registrato: qui il denaro si e mosso davvero. */
const movimentoReale = {
  id: "manuale-1",
  amount: 250,
  type: "income",
  status: "paid",
  date: "2026-09-20T00:00:00.000Z",
  description: "Incasso bar torneo",
  bankAccountId: conto.id,
};

const aggrega = (sources) =>
  aggregateClubPayments({ bankAccounts: [conto], ...sources });

const riga = (movimenti, id) => movimenti.find((m) => m.id === id);

/* ------------------------------------------------- fattura emessa: credito */

test("una fattura emessa e non pagata non e denaro entrato", () => {
  const movimenti = aggrega({ invoices: [fatturaEmessa] });
  const fattura = riga(movimenti, "fattura-1");

  assert.ok(fattura, "la fattura deve comparire fra i movimenti");
  assert.equal(fattura.amount, 1000, "il dovuto resta quello che il documento dichiara");
  assert.equal(fattura.collectedAmount, 0, "e non e cassa");
});

test("una fattura emessa non viene piu presentata come «pagata»", () => {
  const movimenti = aggrega({ invoices: [fatturaEmessa] });

  assert.notEqual(
    riga(movimenti, "fattura-1").status,
    "paid",
    "«emessa» e uno stato del documento, non una prova di incasso",
  );
});

test("il riepilogo mette la fattura fra i crediti, non fra le entrate", () => {
  const totali = summarizeClubMovements(aggrega({ invoices: [fatturaEmessa] }));

  assert.equal(totali.totalIncome, 0);
  assert.equal(totali.totalPendingIncome, 1000);
});

/* --------------------------------------------------- sponsor: dovuto ≠ cassa */

test("lo sponsor che non ha ancora versato non alza le entrate", () => {
  const totali = summarizeClubMovements(aggrega({ sponsors: [sponsorDovuto] }));

  assert.equal(totali.totalIncome, 0);
  assert.equal(totali.totalPendingIncome, 3000);
});

/* ------------------------------------------------------ previsione ≠ cassa */

test("un movimento previsto non produce cassa, nemmeno se si dichiara pagato", () => {
  const movimenti = aggrega({ expectedIncome: [previstoIncassato] });
  const previsto = riga(movimenti, "previsto-1");

  assert.ok(previsto, "la previsione resta visibile");
  assert.equal(previsto.amount, 500);
  assert.equal(
    previsto.collectedAmount,
    0,
    "una previsione vive nella tabella delle cose che non sono ancora accadute",
  );
});

/* ------------------------------------------------------ il fatto vero conta */

test("il movimento manuale registrato e cassa, e resta cassa", () => {
  const movimenti = aggrega({ transactions: [movimentoReale] });

  assert.equal(riga(movimenti, "manuale-1").collectedAmount, 250);
  assert.equal(summarizeClubMovements(movimenti).totalIncome, 250);
});

/* -------------------------------- i quattro insieme: il numero sbagliato */

test("i quattro casi insieme: Entrate dice 250, non 4.750", () => {
  const movimenti = aggrega({
    invoices: [fatturaEmessa],
    sponsors: [sponsorDovuto],
    expectedIncome: [previstoIncassato],
    transactions: [movimentoReale],
  });

  const totali = summarizeClubMovements(movimenti);

  assert.equal(
    totali.totalIncome,
    250,
    "solo il movimento realmente registrato e denaro entrato",
  );
  assert.equal(
    totali.totalPendingIncome,
    4500,
    "fattura, sponsor e previsione restano crediti: 1000 + 3000 + 500",
  );
  assert.equal(totali.balance, 250);
});

/* ------------------------------------ cio che non deve cambiare (RC FIX 3) */

test("una rata saldata prima del registro resta contata per intero", () => {
  const movimenti = aggrega({
    payments: [
      {
        id: "rata-legacy",
        organization_id: CLUB,
        athlete_id: "atleta-1",
        description: "Quota annuale - Rata 1",
        amount: 329.8,
        status: "paid",
        data: null,
      },
    ],
  });

  assert.equal(
    riga(movimenti, "rata-legacy").collectedAmount,
    329.8,
    "toglierla cancellerebbe denaro gia incassato",
  );
});

test("una rata con il registro risponde il registro, non lo stato", () => {
  const movimenti = aggrega({
    payments: [
      {
        id: "rata-parziale",
        organization_id: CLUB,
        athlete_id: "atleta-1",
        description: "Quota annuale - Rata 2",
        amount: 600,
        status: "partially_paid",
        data: {
          ledger: {
            dueAmount: 600,
            paidAmount: 200,
            residualAmount: 400,
            state: "partial",
          },
        },
      },
    ],
  });

  assert.equal(riga(movimenti, "rata-parziale").collectedAmount, 200);
});

test("un giroconto non muove ne entrate ne uscite", () => {
  const totali = summarizeClubMovements(
    aggrega({
      transfers: [
        {
          id: "giro-1",
          amount: 500,
          fromAccount: conto.id,
          toAccount: "conto-banca",
          date: "2026-09-25T00:00:00.000Z",
        },
      ],
    }),
  );

  assert.equal(totali.totalIncome, 0);
  assert.equal(totali.totalExpense, 0);
});
