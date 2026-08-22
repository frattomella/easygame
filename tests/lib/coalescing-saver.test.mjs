import assert from "node:assert/strict";
import test from "node:test";

import { createCoalescingSaver } from "../../src/lib/performance.ts";

/**
 * Regressione WP-36 — l'autosave non deve generare chiamate eccessive.
 *
 * Il debounce da solo non basta: quando una scrittura e in volo e l'utente
 * continua a modificare, senza accorpamento partono PATCH sovrapposte che si
 * annullano a vicenda e il cui ordine di arrivo non e garantito.
 */

/** Promise che il test risolve quando vuole. */
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

test("una scrittura alla volta: le richieste concorrenti non si sovrappongono", async () => {
  const inCorso = [];
  const gate = deferred();
  let attive = 0;
  let massimoConcorrenti = 0;

  const salva = createCoalescingSaver(async (value) => {
    attive += 1;
    massimoConcorrenti = Math.max(massimoConcorrenti, attive);
    inCorso.push(value);
    await gate.promise;
    attive -= 1;
  });

  const prima = salva("A");
  const seconda = salva("B");
  const terza = salva("C");

  gate.resolve();
  await Promise.all([prima, seconda, terza]);

  assert.equal(massimoConcorrenti, 1, "nessuna sovrapposizione");
  assert.deepEqual(
    inCorso,
    ["A", "C"],
    "si scrive lo stato iniziale e l'ultimo richiesto, non quelli intermedi",
  );
});

test("tre modifiche durante una scrittura diventano una sola scrittura", async () => {
  const scritture = [];
  const gate = deferred();

  const salva = createCoalescingSaver(async (value) => {
    scritture.push(value);
    if (scritture.length === 1) {
      await gate.promise;
    }
  });

  const prima = salva(1);
  salva(2);
  salva(3);
  salva(4);

  gate.resolve();
  await prima;

  assert.deepEqual(scritture, [1, 4]);
});

test("senza concorrenza ogni richiesta e una scrittura", async () => {
  const scritture = [];
  const salva = createCoalescingSaver(async (value) => {
    scritture.push(value);
  });

  await salva("x");
  await salva("y");

  assert.deepEqual(scritture, ["x", "y"]);
});

test("uno stato identico all'ultimo salvato non produce scrittura", async () => {
  const scritture = [];
  let ultimoSalvato = null;

  const salva = createCoalescingSaver(
    async (value) => {
      scritture.push(value);
      ultimoSalvato = value;
    },
    { isEqual: (candidate) => candidate === ultimoSalvato },
  );

  await salva("stessa");
  await salva("stessa");
  await salva("diversa");

  assert.deepEqual(scritture, ["stessa", "diversa"]);
});

test("un errore non blocca le scritture successive", async () => {
  const scritture = [];
  const salva = createCoalescingSaver(async (value) => {
    scritture.push(value);
    if (value === "rotta") {
      throw new Error("scrittura fallita");
    }
  });

  await assert.rejects(salva("rotta"), /scrittura fallita/);
  await salva("ok");

  assert.deepEqual(scritture, ["rotta", "ok"]);
});

test("lo stato accumulato non sopravvive a una scrittura fallita", async () => {
  const scritture = [];
  const gate = deferred();

  const salva = createCoalescingSaver(async (value) => {
    scritture.push(value);
    await gate.promise;
    throw new Error("scrittura fallita");
  });

  const prima = salva("A");
  salva("B");

  gate.resolve();
  await assert.rejects(prima, /scrittura fallita/);

  assert.deepEqual(
    scritture,
    ["A"],
    "dopo un errore il chiamante ripropone lo stato: non va riscritto alla cieca",
  );
});
