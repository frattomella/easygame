import assert from "node:assert/strict";
import test from "node:test";

import {
  describeRefundAvailability,
  isRefundTransaction,
} from "../../src/lib/payments/refunds.ts";
import { measureAttendanceByPeriod } from "../../src/lib/funding/attendance-measure.ts";

/**
 * **Due fatti morti che continuavano a contare.**
 *
 * Non hanno niente in comune nel dominio, e hanno la stessa forma: una riga che
 * il club ha **annullato** restava viva agli occhi di chi somma. In un caso
 * bloccava del denaro, nell'altro lo faceva chiedere a un ente pubblico.
 */

/* ------------------------------------------------- il rimborso stornato */

const incasso = {
  id: "t-incasso",
  amount: 130,
  amountCents: 13000,
  reversedAt: null,
  reversesTransactionId: null,
  externalPaymentId: "pi_1",
  data: {},
};

const rimborso = (extra = {}) => ({
  id: "t-rimborso",
  amount: -130,
  amountCents: -13000,
  reversedAt: null,
  reversesTransactionId: null,
  externalPaymentId: "pi_1",
  data: { kind: "refund", refundOfTransactionId: "t-incasso" },
  ...extra,
});

test("un rimborso stornato non consuma piu la capienza del rimborso", () => {
  /*
    La riga di **storno** era gia esclusa; il rimborso che quello storno annulla
    no. Un fatto morto continuava a contare, e la finestra diceva «gia
    rimborsato per intero» sopra una rata che dice «pagata 130/130»: pulsante
    morto, rotta che risponde 400, e come unica strada il pannello di Stripe —
    cioe cio che questo modulo esiste per non far fare.

    E la strada che il prodotto **consiglia**: stornare un incasso con rimborsi
    vivi e rifiutato, con il suggerimento di stornare prima il rimborso.
  */
  assert.equal(isRefundTransaction(rimborso()), true, "un rimborso vivo conta");
  assert.equal(
    isRefundTransaction(rimborso({ reversedAt: "2026-03-02T10:00:00.000Z" })),
    false,
    "un rimborso stornato no",
  );

  const finestra = describeRefundAvailability({
    transaction: incasso,
    transactions: [incasso, rimborso({ reversedAt: "2026-03-02T10:00:00.000Z" })],
  });

  assert.equal(finestra.refundedCents, 0, "e la capienza torna intera");
  assert.equal(finestra.refundable, true, "il pulsante torna vivo");
});

test("la riga di storno non e mai un rimborso, e resta cosi", () => {
  /* Il verso opposto: contarla due volte sarebbe lo stesso errore, al contrario. */
  assert.equal(
    isRefundTransaction(
      rimborso({ id: "t-storno", reversesTransactionId: "t-rimborso" }),
    ),
    false,
  );
});

/* --------------------------------------- l'allenamento annullato */

const periodo = [{ start: "2026-03-01", end: "2026-03-31" }];

const presenza = (trainingId) => ({
  training_id: trainingId,
  athlete_id: "atleta-1",
  status: "present",
});

const allenamento = (id, stato) => ({
  id,
  date: "2026-03-10",
  startTime: "18:00",
  endTime: "20:00",
  ...(stato ? { status: stato } : {}),
});

test("un allenamento annullato non entra nel rendiconto di un contributo", () => {
  /*
    Lo stato non veniva letto, e non e un caso limite: annullare e il **gesto
    che il prodotto consiglia**, perche cancellare un evento con una storia e
    rifiutato. Le presenze restano dove sono, e due ore finivano nel rendiconto
    di un ente pubblico e nell'attestazione di frequenza che ne nasce.
  */
  const svolto = measureAttendanceByPeriod({
    attendance: [presenza("a1")],
    trainings: [allenamento("a1", "scheduled")],
    periods: periodo,
    requirementUnit: "hours",
  });

  const annullato = measureAttendanceByPeriod({
    attendance: [presenza("a2")],
    trainings: [allenamento("a2", "cancelled")],
    periods: periodo,
    requirementUnit: "hours",
  });

  assert.equal(svolto[0].value, 2, "cio che si e svolto si rendiconta");
  assert.equal(
    annullato[0].value,
    0,
    "cio che il club ha annullato non si dichiara a un ente",
  );
  assert.equal(annullato[0].sessions, 0);
});

test("uno stato assente non e un annullamento", () => {
  /*
    Il verso opposto: le anagrafiche storiche lo stato non lo portano, e
    scartarle tutte toglierebbe al club ore che ha davvero fatto.
  */
  const senzaStato = measureAttendanceByPeriod({
    attendance: [presenza("a3")],
    trainings: [allenamento("a3", null)],
    periods: periodo,
    requirementUnit: "hours",
  });

  assert.equal(senzaStato[0].value, 2);
});
