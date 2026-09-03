import assert from "node:assert/strict";
import test from "node:test";

import {
  campiCongelatiToccati,
  toEventColumns,
  toEventLegacyShape,
} from "../../src/lib/events/model.ts";
import {
  getTrainingCategoryLabel,
  getTrainingCategoryReferences,
  resolveCategoriesForTraining,
} from "../../src/lib/training-utils.ts";

/**
 * **PP-01 §A e §B — il dominio puro delle due correzioni sugli allenamenti.**
 *
 * Le tre funzioni implicate nel difetto delle categorie non avevano **nessun
 * test**: `resolveCategoryLabelForTraining`, `getCurrentCategoryMatch` e
 * `getTrainingCategoryReferences` non comparivano in nessun file di `tests/`.
 * E il motivo per cui un allenamento di tre categorie ne ha mostrata una per
 * due Wave con quattromila test verdi.
 *
 * Il giro completo — creazione, conclusione, rilettura dal database, filtro,
 * perimetro — sta in `scripts/pp-01-uat.mjs`. Qui c'e cio che si prova senza
 * database, e che quindi si prova a ogni commit.
 */

const CATALOGO = [
  { id: "cat-a", name: "Under 12", color: "blue" },
  { id: "cat-b", name: "Under 15", color: "green" },
  { id: "cat-c", name: "Prima squadra", color: "red" },
];

/* ==================================================================== */
/*  §A — le tre categorie                                               */
/* ==================================================================== */

test("§A · le colonne portano tutte le categorie, la primaria per prima", () => {
  const colonne = toEventColumns("training", {
    date: "2026-09-10",
    time: "18:00",
    categoryId: "cat-b",
    categories: ["cat-a", "cat-b", "cat-c"],
  });

  assert.equal(colonne.category_id, "cat-b", "la primaria resta quella dichiarata");
  assert.deepEqual(
    colonne.category_ids,
    ["cat-b", "cat-a", "cat-c"],
    "la primaria si mette davanti anche quando l'elenco la contiene gia: l'ordine e cio che la distingue",
  );
});

test("§A · una categoria ripetuta conta una volta sola", () => {
  const colonne = toEventColumns("training", {
    date: "2026-09-10",
    time: "18:00",
    categoryId: "cat-a",
    categories: ["cat-a", "cat-a", "", "cat-b"],
  });
  assert.deepEqual(colonne.category_ids, ["cat-a", "cat-b"]);
});

test("§A · un evento di una categoria sola resta di una categoria sola", () => {
  const colonne = toEventColumns("training", {
    date: "2026-09-10",
    time: "18:00",
    categoryId: "cat-a",
  });
  assert.deepEqual(colonne.category_ids, ["cat-a"]);
});

test("§A · un evento senza categoria non ne inventa una", () => {
  const colonne = toEventColumns("training", {
    date: "2026-09-10",
    time: "18:00",
  });
  assert.equal(colonne.category_id, null);
  assert.deepEqual(colonne.category_ids, []);
});

test("§A · la forma storica riporta le categorie dalla colonna", () => {
  const storica = toEventLegacyShape({
    id: "riga-1",
    organization_id: "club",
    kind: "training",
    status: "completed",
    starts_at: new Date("2026-09-10T18:00:00.000Z"),
    category_id: "cat-a",
    category_name: "Under 12",
    category_ids: ["cat-a", "cat-b", "cat-c"],
    payload: {},
  });

  assert.deepEqual(storica.categories, ["cat-a", "cat-b", "cat-c"]);
  assert.deepEqual(storica.categoryIds, ["cat-a", "cat-b", "cat-c"]);
});

test("§A · l'etichetta nomina tutte le categorie riconosciute", () => {
  const allenamento = {
    categoryId: "cat-a",
    categories: ["cat-a", "cat-b", "cat-c"],
  };

  assert.equal(
    getTrainingCategoryLabel(allenamento, CATALOGO),
    "Under 12, Under 15, Prima squadra",
    "qui stava il difetto: la funzione tornava al primo riscontro",
  );
  assert.deepEqual(
    resolveCategoriesForTraining(allenamento, CATALOGO).map((c) => c.id),
    ["cat-a", "cat-b", "cat-c"],
  );
});

test("§A · l'etichetta di un allenamento di una categoria non guadagna virgole", () => {
  assert.equal(
    getTrainingCategoryLabel({ categoryId: "cat-b" }, CATALOGO),
    "Under 15",
  );
});

test("§A · una categoria che il club non ha piu non fa sparire le altre", () => {
  /*
    Una categoria archiviata esce dal catalogo ma resta scritta sull'evento
    storico. L'etichetta deve nominare cio che riconosce, non tacere.
  */
  assert.equal(
    getTrainingCategoryLabel(
      { categoryId: "cat-sparita", categories: ["cat-sparita", "cat-c"] },
      CATALOGO,
    ),
    "Prima squadra",
  );
});

test("§A · le grafie alternative dell'elenco vengono tutte lette", () => {
  for (const chiave of ["categories", "categoryIds", "category_ids"]) {
    const colonne = toEventColumns("training", {
      date: "2026-09-10",
      time: "18:00",
      categoryId: "cat-a",
      [chiave]: ["cat-a", "cat-b"],
    });
    assert.deepEqual(colonne.category_ids, ["cat-a", "cat-b"], chiave);
  }
});

test("§A · i riferimenti di categoria comprendono l'elenco della colonna", () => {
  const riferimenti = getTrainingCategoryReferences({
    categoryId: "cat-a",
    category_ids: ["cat-a", "cat-b"],
  });
  assert.ok(riferimenti.includes("cat-b"));
});

/* ==================================================================== */
/*  §C — la conferma della sovrapposizione non finisce nell'archivio    */
/* ==================================================================== */

test("§C · `allowOverlap` e un'istruzione della richiesta, non un dato dell'evento", () => {
  const colonne = toEventColumns("training", {
    date: "2026-09-10",
    time: "18:00",
    categoryId: "cat-a",
    allowOverlap: true,
    noteInterne: "questa invece si conserva",
  });

  assert.equal(
    Object.prototype.hasOwnProperty.call(colonne.payload, "allowOverlap"),
    false,
    "conservarla la farebbe rispedire da sola alla modifica successiva",
  );
  assert.equal(
    colonne.payload.noteInterne,
    "questa invece si conserva",
    "il resto del payload resta l'archivio del dato di partenza",
  );
});

/* ==================================================================== */
/*  §B — cosa una storia congela                                        */
/* ==================================================================== */

const evento = (extra = {}) => ({
  title: "Allenamento",
  notes: null,
  starts_at: new Date("2026-09-10T18:00:00.000Z"),
  ends_at: new Date("2026-09-10T19:30:00.000Z"),
  site_id: "sede-1",
  structure_id: "struttura-1",
  field_id: "campo-1",
  category_id: "cat-a",
  category_ids: ["cat-a"],
  group_ids: ["gruppo-1"],
  capacity: null,
  rsvp_required: false,
  rsvp_deadline: null,
  trainer_ids: ["mister-1"],
  ...extra,
});

test("§B · titolo, note e allenatori non sono mai congelati", () => {
  const toccati = campiCongelatiToccati(
    evento(),
    evento({
      title: "Allenamento (recupero)",
      notes: "Sessione ridotta",
      trainer_ids: ["mister-1", "mister-2"],
    }),
  );
  assert.deepEqual(toccati, [], "sono descrizioni: non cambiano il significato di una presenza");
});

test("§B · l'istante, il luogo, le categorie e la capienza sono congelati", () => {
  const casi = [
    [{ starts_at: new Date("2026-09-17T18:00:00.000Z") }, "l'istante"],
    [{ ends_at: new Date("2026-09-10T20:00:00.000Z") }, "la fine"],
    [{ site_id: "sede-2" }, "la sede"],
    [{ structure_id: "struttura-2" }, "la struttura"],
    [{ field_id: "campo-2" }, "il campo"],
    [{ category_id: "cat-b" }, "la categoria"],
    [{ category_ids: ["cat-a", "cat-b"] }, "le categorie"],
    [{ group_ids: ["gruppo-2"] }, "i gruppi"],
    [{ capacity: 12 }, "la capienza"],
    [{ rsvp_required: true }, "la richiesta di conferma"],
    [{ rsvp_deadline: new Date("2026-09-09T18:00:00.000Z") }, "il termine per confermare"],
  ];

  for (const [modifica, etichetta] of casi) {
    const toccati = campiCongelatiToccati(evento(), evento(modifica));
    assert.deepEqual(
      toccati,
      [etichetta],
      `${etichetta}: cambia il significato delle righe gia scritte`,
    );
  }
});

test("§B · riscrivere lo stesso valore non conta come un cambiamento", () => {
  /*
    E il caso che la modifica dal browser produce sempre: il modulo rimanda
    **tutti** i campi, anche quelli che nessuno ha toccato. Se il confronto
    fosse per identita e non per valore, correggere un titolo verrebbe
    rifiutato perche la data e stata «rimandata».
  */
  const toccati = campiCongelatiToccati(
    evento(),
    evento({
      starts_at: new Date("2026-09-10T18:00:00.000Z"),
      category_ids: ["cat-a"],
      group_ids: ["gruppo-1"],
    }),
  );
  assert.deepEqual(toccati, []);
});

test("§B · una data uguale scritta come stringa e la stessa data", () => {
  const toccati = campiCongelatiToccati(
    evento(),
    evento({ starts_at: "2026-09-10T18:00:00.000Z" }),
  );
  assert.deepEqual(toccati, []);
});

test("§B · piu campi congelati insieme si dichiarano tutti", () => {
  const toccati = campiCongelatiToccati(
    evento(),
    evento({ starts_at: new Date("2026-09-17T18:00:00.000Z"), field_id: "campo-2" }),
  );
  assert.deepEqual(toccati, ["l'istante", "il campo"]);
});
