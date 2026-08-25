import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * L'assegnazione del numero di un documento (ADR-0044).
 *
 * Due cose vanno dimostrate, e sono diverse fra loro.
 *
 * 1. **Che la numerazione appartenga al club e all'anno.** Prima il vincolo
 *    era globale: la societa Beta non poteva avere la sua ricevuta 1 del 2026
 *    perche ce l'aveva gia Alfa. E un comportamento osservabile e si prova
 *    guardando i numeri prodotti.
 * 2. **Che due richieste contemporanee non possano leggere lo stesso
 *    numero.** Questo un doppio di Prisma non lo puo dimostrare — non ha i
 *    lock di Postgres — e fingere di provarlo sarebbe peggio che non
 *    provarlo. Si prova allora la proprieta da cui la garanzia discende: che
 *    l'incremento sia **una sola istruzione** (`updateMany` con `increment`,
 *    che diventa `SET last_number = last_number + 1`) dentro una transazione,
 *    e non una lettura seguita da una scrittura. E il controllo che si
 *    accorge di una riscrittura futura che reintroduca la corsa.
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";

let numbering;
let setPrismaClientForTests;
let fake;

before(async () => {
  numbering = await import("../../src/lib/server/document-numbering.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma({});
  setPrismaClientForTests(fake.client);
});

const allocate = (organizationId, year = 2026, kind = "receipt") =>
  numbering.allocateDocumentNumber({ organizationId, kind, year });

/* ------------------------------------------------- club, tipo, esercizio */

test("il primo documento di un club e il numero uno", async () => {
  const first = await allocate(CLUB_A);

  assert.equal(first.sequence, 1);
  assert.equal(first.number, "R-2026-0001");
});

test("i numeri successivi salgono di uno", async () => {
  await allocate(CLUB_A);
  await allocate(CLUB_A);
  const third = await allocate(CLUB_A);

  assert.equal(third.number, "R-2026-0003");
});

test("due societa hanno entrambe la loro ricevuta uno", async () => {
  const alfa = await allocate(CLUB_A);
  const beta = await allocate(CLUB_B);

  assert.equal(alfa.number, "R-2026-0001");
  assert.equal(
    beta.number,
    "R-2026-0001",
    "la numerazione di Beta non dipende da quante ricevute ha emesso Alfa",
  );
});

test("ricevute e fatture hanno due registri distinti", async () => {
  await allocate(CLUB_A, 2026, "receipt");
  const fattura = await allocate(CLUB_A, 2026, "invoice");

  assert.equal(fattura.number, "FT-2026-0001");
});

test("l'esercizio nuovo riparte da uno", async () => {
  await allocate(CLUB_A, 2026);
  await allocate(CLUB_A, 2026);
  const nuovo = await allocate(CLUB_A, 2027);

  assert.equal(nuovo.number, "R-2027-0001");
});

test("la sequenza sta su una riga sola per club, tipo e anno", async () => {
  await allocate(CLUB_A);
  await allocate(CLUB_A);
  await allocate(CLUB_B);

  const righe = fake.rows("documentNumberSequence");
  assert.equal(righe.length, 2);
  assert.equal(
    righe.find((row) => row.organization_id === CLUB_A).last_number,
    2,
  );
});

test("un numero assegnato non torna disponibile", async () => {
  const prima = await allocate(CLUB_A);

  /* La ricevuta viene annullata: la riga sparisce, il numero no. */
  fake.rows("receipt").length = 0;

  const dopo = await allocate(CLUB_A);
  assert.notEqual(dopo.number, prima.number);
  assert.equal(dopo.number, "R-2026-0002");
});

/* ------------------------------------------------------ la concorrenza */

test("l'incremento e una sola istruzione, non una lettura seguita da una scrittura", async () => {
  await allocate(CLUB_A);
  await allocate(CLUB_A);

  const incremento = fake.lastCall("documentNumberSequence", "updateMany");

  assert.ok(incremento, "il numero deve salire con un update, non con un create");
  assert.deepEqual(
    incremento.args.data,
    { last_number: { increment: 1 } },
    "il valore non deve passare dall'applicazione: la corsa nascerebbe li",
  );
  assert.equal(incremento.args.where.organization_id, CLUB_A);
  assert.equal(incremento.args.where.kind, "receipt");
  assert.equal(incremento.args.where.year, 2026);
});

test("leggere il prossimo numero non lo consuma", async () => {
  await allocate(CLUB_A);

  const letto = await numbering.peekDocumentNumber({
    organizationId: CLUB_A,
    kind: "receipt",
    year: 2026,
  });
  const successivo = await allocate(CLUB_A);

  assert.equal(letto, 1);
  assert.equal(successivo.sequence, 2);
});

/* --------------------------------------------------------- il confine */

test("senza club non si numera niente", async () => {
  await assert.rejects(() => allocate(""), /Accesso negato/);
});
