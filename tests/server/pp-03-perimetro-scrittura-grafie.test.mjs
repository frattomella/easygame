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

test("PP-03 §15.1 · e vale anche quando il perimetro conosce il nome e non l'identificativo", () => {
  /*
    Il caso simmetrico, e non e teorico: un club che non ha mai normalizzato le
    categorie tiene nella scheda dell'allenatore il **nome**.

    Cambia **dove** le due grafie si mettono insieme. §11.2 le prendeva dalla
    richiesta — l'evento portava `category_name`, e bastava che una delle due
    combaciasse. Da §15.1 le compone il server: `readTrainerEventPerimeter`
    allarga ogni voce del perimetro alle grafie che il **registro del club** le
    riconosce, e le consegna in `categoryTokens`. Il giudizio lato evento resta
    sugli identificativi, cioe su cio che va in colonna.
  */
  const perimetroPerNome = {
    categoryIds: ["under 15"],
    categoryTokens: ["under 15", "cat-u15"],
    groupIds: [],
  };
  const evento = {
    category_id: "cat-u15",
    category_name: "Under 15",
    category_ids: ["cat-u15"],
  };

  assert.equal(dentro(perimetroPerNome, evento, "scrittura"), true);
});

/* ------------------------------ §15.1 la contraffazione della grafia, chiusa */

test("PP-03 §15.1 · un `categoryName` inventato non fa passare la categoria di un altro", () => {
  /*
    La riproduzione del quinto round, ridotta al predicato:

        POST /api/v1/events {"categoryId":"cat-prima","categoryName":"cat-u15"}

    `category_name` e testo che **sceglie chi chiama**. Finche stava insieme
    all'identificativo sotto un `some`, dichiarare come nome l'identificativo di
    una categoria propria faceva passare qualunque categoria altrui: l'evento
    nasceva nel calendario di quella squadra, con il proprio `created_by`.
  */
  const evento = {
    category_id: "cat-prima",
    category_name: "cat-u15",
    category_ids: ["cat-prima"],
  };

  assert.equal(dentro(PERIMETRO, evento, "scrittura"), false);
  assert.equal(
    dentro(PERIMETRO, evento, "lettura"),
    false,
    "non passa nemmeno in lettura: era `some` su una grafia scelta da chi chiama",
  );
});

test("PP-03 §15.1 · il nome parla solo quando l'identificativo tace", () => {
  /*
    Il ripiego che resta, e il suo confine. Un evento storico senza
    identificativo di categoria si giudica sul nome — li non c'e nessun
    identificativo da contraddire. Appena l'identificativo c'e, il nome non
    entra piu nel giudizio, in **nessuno** dei due versi: ne per aprire, ne per
    chiudere.
  */
  const perimetroPerNome = {
    categoryIds: ["under 15"],
    categoryTokens: ["under 15", "cat-u15"],
    groupIds: [],
  };

  assert.equal(
    dentro(
      perimetroPerNome,
      { category_id: null, category_name: "Under 15", category_ids: [] },
      "scrittura",
    ),
    true,
    "l'evento storico senza identificativo resta suo",
  );
  assert.equal(
    dentro(
      PERIMETRO,
      { category_id: "cat-u15", category_name: "Prima squadra", category_ids: ["cat-u15"] },
      "scrittura",
    ),
    true,
    "un nome che non combacia non toglie l'evento a chi ne ha l'identificativo",
  );
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

/* ------------------ §15.2 il ramo dei gruppi non salta piu le categorie */

test("PP-03 §15.2 · in scrittura i due assi stanno in AND, e il gruppo proprio non apre la categoria altrui", () => {
  /*
    La riproduzione del quinto round:

        POST /api/v1/events {"groupIds":["grp-proprio"],"categoryId":"cat-altrui"}
          -> 200

    Il ramo dei gruppi **usciva**: se l'evento dichiarava gruppi e l'allenatore
    ne aveva, le categorie non venivano guardate affatto. Bastava quindi
    nominare un gruppo proprio per scrivere sotto la categoria di un altro, e
    una correzione sulle sole grafie (§15.1) non l'avrebbe chiusa: e una
    seconda porta.
  */
  const perimetroConGruppi = {
    categoryIds: ["cat-u15"],
    categoryTokens: ["cat-u15"],
    groupIds: ["gruppo-nord"],
  };

  assert.equal(
    dentro(
      perimetroConGruppi,
      { category_id: "cat-prima", category_ids: ["cat-prima"], group_ids: ["gruppo-nord"] },
      "scrittura",
    ),
    false,
    "il gruppo proprio non e un lasciapassare sulla categoria di un altro",
  );

  assert.equal(
    dentro(
      perimetroConGruppi,
      { category_id: "cat-u15", category_ids: ["cat-u15"], group_ids: ["gruppo-nord"] },
      "scrittura",
    ),
    true,
    "il verso opposto: sul proprio, con entrambi gli assi dentro, si scrive come prima",
  );

  assert.equal(
    dentro(
      perimetroConGruppi,
      { category_id: "cat-prima", category_ids: ["cat-prima"], group_ids: ["gruppo-nord"] },
      "lettura",
    ),
    true,
    "in lettura la scorciatoia di ADR-0055 resta: il gruppo e la risposta piu precisa, e un calendario piu lungo non e un atto",
  );
});

test("PP-03 §15.2 · un evento di soli gruppi, tutti propri, resta scrivibile", () => {
  /*
    Il rischio della correzione, misurato: mettendo i due assi in AND, un
    evento che dichiara **solo** gruppi non deve finire nella regola «un evento
    senza categoria e di nessuno». Li l'asse dichiarato e uno solo, ed e tutto
    dentro.
  */
  const perimetroConGruppi = {
    categoryIds: ["cat-u15"],
    categoryTokens: ["cat-u15"],
    groupIds: ["gruppo-nord"],
  };

  assert.equal(
    dentro(
      perimetroConGruppi,
      { category_id: null, category_ids: [], group_ids: ["gruppo-nord"] },
      "scrittura",
    ),
    true,
  );
  assert.equal(
    dentro(
      perimetroConGruppi,
      { category_id: null, category_ids: [], group_ids: ["gruppo-sud"] },
      "scrittura",
    ),
    false,
  );
});
