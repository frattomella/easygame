import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * **Il perimetro consegnato da un riscatto non e mai piu largo di quello di chi
 * ha coniato** (P0-2, invariante B).
 *
 * La sonda contro PostgreSQL misura le porte vere; qui si misura la **regola**,
 * e la si misura su tutto il suo dominio invece che su qualche caso scelto a
 * mano — la forma che ADR-0130 prescrive.
 *
 * Il dominio non e un elenco scritto qui dentro: e il prodotto cartesiano di
 * tutti i sottoinsiemi di due assi, generato. Se un giorno la risoluzione
 * cambia e allarga anche una sola combinazione, questo file diventa rosso da
 * solo.
 */

let risolvi;
let accessScopeContains;
let accessScopeAllows;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  ({ resolveRedeemAccessScopes: risolvi } = await import(
    "../../src/lib/server/club-roles.ts"
  ));
  ({ accessScopeContains, accessScopeAllows } = await import(
    "../../src/lib/roles/access-scope.ts"
  ));
});

const SEDI = ["sede-a", "sede-b"];
const CATEGORIE = ["cat-1", "cat-2"];

/** Tutti i sottoinsiemi di un elenco: il dominio, generato. */
const sottoinsiemi = (elenco) =>
  elenco.reduce((acc, voce) => [...acc, ...acc.map((s) => [...s, voce])], [[]]);

/** Tutti i perimetri esprimibili sui due assi. */
const perimetri = () => {
  const risultato = [];
  for (const sedi of sottoinsiemi(SEDI)) {
    for (const categorie of sottoinsiemi(CATEGORIE)) {
      risultato.push([
        ...sedi.map((value) => ({ kind: "site", value })),
        ...categorie.map((value) => ({ kind: "category", value })),
      ]);
    }
  }
  return risultato;
};

test("il dominio generato copre tutti i perimetri dei due assi", () => {
  /* 4 sottoinsiemi di sedi x 4 di categorie. Se un asse nuovo comparisse, il
     numero cambierebbe e questa riga lo direbbe. */
  assert.equal(perimetri().length, 16);
});

test("TOTALITA — il risultato non e mai piu largo del soffitto dell'emittente", () => {
  const violazioni = [];

  for (const emittente of perimetri()) {
    for (const profilo of perimetri()) {
      const esito = risolvi(profilo, emittente);
      if (!accessScopeContains(emittente, esito)) {
        violazioni.push({ emittente, profilo, esito });
      }
    }
  }

  assert.deepEqual(
    violazioni,
    [],
    "una combinazione qui dentro e un riscatto che allarga il recinto di chi ha coniato",
  );
});

test("un emittente ristretto non consegna mai zero righe", () => {
  /*
    Zero righe significa **tutto il club** (ADR-0103): consegnarle a chi entra
    da un gettone coniato da un recintato e esattamente il difetto che P0-2
    chiude. Il caso critico e il profilo che non dichiara niente.
  */
  const vuoti = [];

  for (const emittente of perimetri()) {
    if (!emittente.length) continue;
    for (const profilo of perimetri()) {
      const esito = risolvi(profilo, emittente);
      if (!esito.length) vuoti.push({ emittente, profilo });
    }
  }

  assert.deepEqual(vuoti, []);
});

test("chi non ha recinti non ne impone: il profilo passa cosi com'e", () => {
  for (const profilo of perimetri()) {
    assert.deepEqual(
      risolvi(profilo, []),
      profilo,
      "un emittente senza perimetro non restringe cio che il profilo dichiara",
    );
  }
});

test("un profilo muto eredita il recinto dell'emittente, non il club intero", () => {
  const emittente = [{ kind: "site", value: "sede-a" }];
  const esito = risolvi([], emittente);

  assert.deepEqual(esito, emittente);
  assert.equal(
    accessScopeAllows(esito, { siteId: "sede-b", categoryId: "cat-1" }),
    false,
    "la sede che l'emittente non vedeva resta chiusa anche a chi riscatta",
  );
});

test("un asse che l'emittente restringe e che il profilo non nomina non resta scoperto", () => {
  /*
    Il caso vero del collaudo: un gestore recintato sulla **sede** A conia un
    gettone di allenatore, e la scheda dell'allenatore dichiara solo
    **categorie**. Se l'asse sede restasse vuoto, «vuoto» varrebbe «tutte le
    sedi» e il recinto del gestore sarebbe evaporato.
  */
  const esito = risolvi(
    [{ kind: "category", value: "cat-1" }],
    [{ kind: "site", value: "sede-a" }],
  );

  /* L'ordine dei due assi non e parte della regola: si confronta l'insieme. */
  const ordinato = (righe) =>
    [...righe].sort((a, b) =>
      `${a.kind}:${a.value}`.localeCompare(`${b.kind}:${b.value}`),
    );

  assert.deepEqual(
    ordinato(esito),
    ordinato([
      { kind: "category", value: "cat-1" },
      { kind: "site", value: "sede-a" },
    ]),
  );
  assert.equal(
    accessScopeAllows(esito, { siteId: "sede-b", categoryId: "cat-1" }),
    false,
  );
});

test("il profilo che eccede il soffitto viene tagliato, non rifiutato in silenzio", () => {
  const esito = risolvi(
    [
      { kind: "site", value: "sede-a" },
      { kind: "site", value: "sede-b" },
    ],
    [{ kind: "site", value: "sede-a" }],
  );

  assert.deepEqual(esito, [{ kind: "site", value: "sede-a" }]);
});
