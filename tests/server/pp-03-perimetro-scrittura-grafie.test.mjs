import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * **Una categoria, non una grafia** (PP-03 §11.2).
 *
 * §7 ha reso `eventWithinTrainerPerimeter` sensibile al **modo**: `"lettura"`
 * chiede che almeno una categoria dell'evento stia nel perimetro (ADR-0111),
 * `"scrittura"` che ci stiano tutte. La regola e giusta; l'insieme su cui
 * girava non lo era.
 *
 * L'elenco dei riferimenti era **piatto** — identificativo primario, **nome**
 * primario e tutte le categorie insieme — e il perimetro dell'allenatore e
 * fatto di identificativi. In lettura non faceva danno (`some` su una grafia in
 * piu e sempre `some`); in scrittura `every` falliva su **ogni** evento che
 * portasse anche il nome della categoria, cioe su ogni creazione fatta da un
 * modulo che il nome lo manda.
 *
 * Falliva chiuso, quindi non era una falla: rendeva `events.manage`
 * inutilizzabile per il ruolo che la possiede. Non si e visto per due Wave
 * perche non esisteva un pulsante — ed e comparso alla prima creazione fatta a
 * schermo, con il messaggio «questo evento e condiviso con una squadra che non
 * e tua» su un evento con **una categoria sola**, la propria.
 */

const PERIMETRO = { categoryIds: ["cat-u15"], groupIds: [] };

let dentro;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  ({ eventWithinTrainerPerimeter: dentro } = await import(
    "../../src/lib/server/events.ts"
  ));
});

test("PP-03 §11.2 · il nome della categoria e una grafia della primaria, non una categoria in piu", () => {
  const evento = {
    category_id: "cat-u15",
    category_name: "Under 15 maschile — girone provinciale B",
    category_ids: ["cat-u15"],
  };

  assert.equal(dentro(PERIMETRO, evento, "lettura"), true);
  assert.equal(
    dentro(PERIMETRO, evento, "scrittura"),
    true,
    "l'allenatore creava l'allenamento della propria e unica squadra e si sentiva rispondere che e condiviso con un'altra",
  );
});

test("PP-03 §11.2 · e vale anche quando il perimetro conosce il nome e non l'identificativo", () => {
  /*
    Il caso simmetrico, e non e teorico: un club che non ha mai normalizzato le
    categorie tiene nella scheda dell'allenatore il **nome**. Se una sola delle
    due grafie combacia, la categoria e sua.
  */
  const perimetroPerNome = { categoryIds: ["under 15"], groupIds: [] };
  const evento = {
    category_id: "cat-u15",
    category_name: "Under 15",
    category_ids: ["cat-u15"],
  };

  assert.equal(dentro(perimetroPerNome, evento, "scrittura"), true);
});

/* ------------------------------------------------ cio che deve restare chiuso */

test("PP-03 §11.2 · l'evento condiviso resta non scrivibile da chi ne ha una sola categoria", () => {
  const evento = {
    category_id: "cat-u15",
    category_name: "Under 15 maschile",
    category_ids: ["cat-u15", "cat-u17"],
  };

  assert.equal(
    dentro(PERIMETRO, evento, "lettura"),
    true,
    "il congiunto resta leggibile a entrambi gli allenatori: e ADR-0111",
  );
  assert.equal(
    dentro(PERIMETRO, evento, "scrittura"),
    false,
    "e la falla CRITICAL di §7: chi ne ha una sola categoria non puo appropriarsene",
  );
});

test("PP-03 §11.2 · non si aggiunge una categoria altrui nominando anche la propria", () => {
  const evento = {
    category_id: "cat-u15",
    category_ids: ["cat-u15", "cat-prima"],
  };

  assert.equal(dentro(PERIMETRO, evento, "scrittura"), false);
});

test("PP-03 §11.2 · una categoria altrui da sola resta fuori in tutti e due i modi", () => {
  const evento = {
    category_id: "cat-prima",
    category_name: "Prima squadra",
    category_ids: ["cat-prima"],
  };

  assert.equal(dentro(PERIMETRO, evento, "lettura"), false);
  assert.equal(dentro(PERIMETRO, evento, "scrittura"), false);
});

test("PP-03 §11.2 · un evento senza nessuna categoria e di nessuno, in tutti e due i modi", () => {
  /*
    `every` su un elenco vuoto risponderebbe **vero**: e la ragione per cui
    questa riga esiste, e va difesa anche dopo aver cambiato la forma
    dell'insieme.
  */
  const evento = { category_id: null, category_name: null, category_ids: [] };

  assert.equal(dentro(PERIMETRO, evento, "lettura"), false);
  assert.equal(dentro(PERIMETRO, evento, "scrittura"), false);
});

test("PP-03 §11.2 · senza perimetro non si passa", () => {
  assert.equal(dentro(null, { category_id: "cat-u15" }, "lettura"), false);
  assert.equal(dentro(null, { category_id: "cat-u15" }, "scrittura"), false);
});

test("PP-03 §11.2 · i gruppi restano la regola che vince quando entrambi li dichiarano", () => {
  const perimetroConGruppi = {
    categoryIds: ["cat-u15"],
    groupIds: ["gruppo-nord"],
  };

  assert.equal(
    dentro(
      perimetroConGruppi,
      { category_id: "cat-u15", group_ids: ["gruppo-nord"] },
      "scrittura",
    ),
    true,
  );
  assert.equal(
    dentro(
      perimetroConGruppi,
      { category_id: "cat-u15", group_ids: ["gruppo-nord", "gruppo-sud"] },
      "scrittura",
    ),
    false,
    "un evento su due gruppi lo cambia chi li segue entrambi",
  );
  assert.equal(
    dentro(
      perimetroConGruppi,
      { category_id: "cat-u15", group_ids: ["gruppo-nord", "gruppo-sud"] },
      "lettura",
    ),
    true,
  );
});
