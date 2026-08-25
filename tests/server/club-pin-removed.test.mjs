import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  compareByDate,
  paymentDateOf,
  sortByDateAsc,
  sortByDateDesc,
} from "../../src/lib/sorting.ts";

/**
 * Blocco 7, punti 16 e 17 — ordinamento cronologico e rimozione del PIN club.
 *
 * Il PIN non era un meccanismo di sicurezza:
 *
 * - valore predefinito `"1234"`, in chiaro sia nel client sia nel server, in
 *   un repository pubblico;
 * - `payment_pin` era fra i campi proiettabili di `/api/v1/clubs/:id`: chi
 *   poteva leggere il club poteva **leggere il PIN**;
 * - segreto condiviso da tutto il club: non diceva chi avesse agito;
 * - barriera solo nell'interfaccia, con le stesse operazioni raggiungibili
 *   chiamando le API.
 *
 * Al suo posto la rotta dei pagamenti controlla il **ruolo**, che il PIN non
 * ha mai fatto.
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
};

/** Sorgente senza commenti: un commento che *nomina* il PIN non e il PIN. */
const readCode = (file) =>
  readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const APP_FILES = walk(SRC);

// --- il PIN non torna --------------------------------------------------------

test("nessun codice legge o scrive il PIN del club", () => {
  const offenders = APP_FILES.filter((file) =>
    /payment_pin|getClubPaymentPin|PinInput/.test(readCode(file)),
  ).map((file) => path.relative(SRC, file).replace(/\\/g, "/"));

  assert.deepEqual(offenders, [], "il PIN di club e stato rimosso, non nascosto");
});

test("il PIN non e piu leggibile dalle API del club", () => {
  const resources = readCode(path.join(SRC, "lib/server/resources.ts"));
  assert.equal(
    /"payment_pin"/.test(resources),
    false,
    "era proiettabile con ?fields=payment_pin: chiunque poteva leggerlo",
  );
});

test("nessun PIN predefinito scritto nel codice", () => {
  const offenders = APP_FILES.filter((file) => {
    const source = readCode(file);
    return /(pin|Pin|PIN)[^;\n]{0,40}["'`]1234["'`]/.test(source);
  }).map((file) => path.relative(SRC, file).replace(/\\/g, "/"));

  assert.deepEqual(offenders, [], "un default in chiaro non e un segreto");
});

/**
 * Il punto che rende la rimozione un miglioramento e non una perdita: al posto
 * del PIN c'e un controllo di ruolo, che prima non esisteva.
 */
test("la rotta dei pagamenti atleta controlla il ruolo", () => {
  const route = readCode(
    path.join(SRC, "app/api/athlete-payments/[paymentId]/route.ts"),
  );

  assert.match(route, /canManageClubConfiguration\(scope\.activeRole\)/);
  assert.equal(/verifyClubPin/.test(route), false);
  assert.match(
    route,
    /requireAuthenticatedUser/,
    "sessione e appartenenza restano i presidi principali",
  );
  assert.match(route, /allowedOrganizationIds/);
});

/**
 * La colonna `clubs.payment_pin` resta nello schema: toglierla richiede una
 * migrazione distruttiva, e non serve a niente farlo — non la legge piu
 * nessuno. Questo test lo dichiara, cosi la sua presenza non sembra una
 * dimenticanza.
 */
test("la colonna resta nello schema, ma non la usa nessuno", () => {
  const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
  assert.match(
    schema,
    /payment_pin\s+String\?/,
    "il dato legacy resta finche non c'e una ragione per una migrazione distruttiva",
  );
});

// --- ordinamento cronologico -------------------------------------------------

test("la data di un pagamento si legge da qualunque chiave storica", () => {
  assert.equal(paymentDateOf({ paidAt: "2026-03-01" }), "2026-03-01");
  assert.equal(paymentDateOf({ due_date: "2026-04-01" }), "2026-04-01");
  assert.equal(
    paymentDateOf({ dueDate: "2026-04-01", paidAt: "2026-03-01" }),
    "2026-03-01",
    "in un registro l'incasso conta piu della scadenza",
  );
  assert.equal(paymentDateOf({}), "");
});

test("il decrescente e il default: si guarda l'ultimo movimento", () => {
  const rows = [
    { id: "a", date: "2026-01-10" },
    { id: "b", date: "2026-03-05" },
    { id: "c", date: "2026-02-01" },
  ];

  assert.deepEqual(
    sortByDateDesc(rows, paymentDateOf).map((row) => row.id),
    ["b", "c", "a"],
  );
  assert.deepEqual(
    sortByDateAsc(rows, paymentDateOf).map((row) => row.id),
    ["a", "c", "b"],
  );
});

test("le voci senza data vanno in fondo in entrambe le direzioni", () => {
  const rows = [
    { id: "senza" },
    { id: "vecchia", date: "2026-01-10" },
    { id: "nuova", date: "2026-03-05" },
  ];

  assert.equal(
    sortByDateDesc(rows, paymentDateOf).at(-1).id,
    "senza",
    "una riga senza data non e l'ultimo movimento",
  );
  assert.equal(sortByDateAsc(rows, paymentDateOf).at(-1).id, "senza");
});

test("una data illeggibile si comporta come una data assente", () => {
  const rows = [
    { id: "rotta", date: "non-una-data" },
    { id: "buona", date: "2026-01-10" },
  ];

  assert.deepEqual(
    sortByDateDesc(rows, paymentDateOf).map((row) => row.id),
    ["buona", "rotta"],
  );
});

test("ordinare non muta l'array di partenza", () => {
  const rows = [{ date: "2026-01-01" }, { date: "2026-05-01" }];
  const snapshot = [...rows];

  sortByDateDesc(rows, paymentDateOf);
  assert.deepEqual(rows, snapshot, "mutare uno stato React e un difetto silenzioso");
});

test("il comparatore e utilizzabile da solo", () => {
  const compare = compareByDate((value) => value, "asc");
  assert.ok(compare("2026-01-01", "2026-02-01") < 0);
  assert.equal(compare("2026-01-01", "2026-01-01"), 0);
});

/**
 * Gli elenchi che rappresentano eventi nel tempo comparivano nell'ordine in cui
 * erano stati scritti nel JSON — cioe di inserimento, che per una segreteria
 * non significa niente.
 */
test("gli elenchi temporali passano dal comparatore condiviso", () => {
  for (const [file, needle] of [
    ["app/trainers/[id]/page.tsx", /sortByDateDesc\(/],
    ["app/movements/page.tsx", /sortByDateDesc\(transfersData/],
  ]) {
    assert.match(
      readCode(path.join(SRC, file)),
      needle,
      `${file}: l'ordine non deve dipendere dall'inserimento`,
    );
  }
});
