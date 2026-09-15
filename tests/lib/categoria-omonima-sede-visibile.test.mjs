import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  buildCategoryDisplayIndex,
  describeCategoryForDisplay,
} from "../../src/lib/categories/display.ts";

/**
 * **N3 — due categorie omonime non restano due voci con la stessa scritta.**
 *
 * ADR-0155 ha tolto la fusione nel **codice**; questo e il lato dello schermo,
 * registrato come `D-INT-3`. La decisione di prodotto che il debito lasciava
 * aperta — accostare **sempre** la sede o solo quando il nome e ambiguo — e
 * presa qui: **solo quando serve**, e l'ambiguita si calcola dove si disegna.
 *
 * La ragione e che l'alternativa e rumore: «Pulcini · Roma» su ogni riga di un
 * club che ha una sede sola non aiuta nessuno a distinguere niente.
 */

const U15_FORMIA = "category-u15-formia";
const U15_SCAURI = "category-u15-scauri";
const PULCINI = "category-pulcini";

const CATALOGO_OMONIME = [
  { id: U15_FORMIA, name: "Under 15" },
  { id: U15_SCAURI, name: "Under 15" },
  { id: PULCINI, name: "Pulcini" },
];

const GRUPPI = [
  {
    categoryId: U15_FORMIA,
    siteId: "sede-formia",
    siteName: "Formia",
    active: true,
  },
  {
    categoryId: U15_SCAURI,
    siteId: "sede-scauri",
    siteName: "Scauri",
    active: true,
  },
  {
    categoryId: PULCINI,
    siteId: "sede-formia",
    siteName: "Formia",
    active: true,
  },
];

/* ------------------------------------------------------------------ */
/* La sede compare dove serve                                          */
/* ------------------------------------------------------------------ */

test("due omonime si leggono con la sede accanto", () => {
  const indice = buildCategoryDisplayIndex({
    categories: CATALOGO_OMONIME,
    groups: GRUPPI,
  });

  assert.equal(indice.label(U15_FORMIA), "Under 15 · Formia");
  assert.equal(indice.label(U15_SCAURI), "Under 15 · Scauri");
  assert.notEqual(
    indice.label(U15_FORMIA),
    indice.label(U15_SCAURI),
    "le due voci devono potersi distinguere a schermo",
  );
});

test("la sede resta un campo a parte, non una stringa concatenata", () => {
  /*
    Serve alla resa: la sede va **piu piccola e smorzata**, quindi deve poter
    stare in un elemento suo. Se uscisse solo `label`, ogni schermata la
    riscriverebbe a mano, che e il difetto che questo modulo esiste per non
    avere.
  */
  const descritta = describeCategoryForDisplay(U15_FORMIA, {
    categories: CATALOGO_OMONIME,
    groups: GRUPPI,
  });

  assert.equal(descritta.name, "Under 15");
  assert.equal(descritta.site, "Formia");
  assert.equal(descritta.ambiguous, true);
  assert.equal(descritta.id, U15_FORMIA, "l'identita resta l'identificativo");
});

/* ------------------------------------------------------------------ */
/* Il controspecchio: non compare dove non serve                       */
/* ------------------------------------------------------------------ */

test("una categoria con nome unico non porta nessuna sede", () => {
  const indice = buildCategoryDisplayIndex({
    categories: CATALOGO_OMONIME,
    groups: GRUPPI,
  });

  assert.equal(indice.label(PULCINI), "Pulcini");
  assert.equal(indice.describe(PULCINI).site, "");
  assert.equal(indice.describe(PULCINI).ambiguous, false);
});

test("un club mono-sede senza omonime non vede mai una sede accanto", () => {
  const indice = buildCategoryDisplayIndex({
    categories: [
      { id: "c1", name: "Pulcini" },
      { id: "c2", name: "Esordienti" },
    ],
    groups: [
      { categoryId: "c1", siteId: "s1", siteName: "Roma", active: true },
      { categoryId: "c2", siteId: "s1", siteName: "Roma", active: true },
    ],
  });

  assert.equal(indice.hasHomonyms, false);
  assert.equal(indice.label("c1"), "Pulcini");
  assert.equal(indice.label("c2"), "Esordienti");
});

/* ------------------------------------------------------------------ */
/* Quando la sede non distingue, non si scrive                         */
/* ------------------------------------------------------------------ */

test("due omonime nella stessa sede non si separano con la sede", () => {
  /*
    Accostarla darebbe due scritte **ancora uguali**, con in piu la promessa
    implicita di aver disambiguato. Meglio il nome nudo: a distinguere ci pensa
    cio che la schermata ha gia.
  */
  const indice = buildCategoryDisplayIndex({
    categories: [
      { id: "a", name: "Under 15" },
      { id: "b", name: "Under 15" },
    ],
    groups: [
      { categoryId: "a", siteId: "s1", siteName: "Roma", active: true },
      { categoryId: "b", siteId: "s1", siteName: "Roma", active: true },
    ],
  });

  assert.equal(indice.label("a"), "Under 15");
  assert.equal(indice.label("b"), "Under 15");
  assert.equal(
    indice.describe("a").ambiguous,
    true,
    "l'ambiguita resta vera: e la sede che non la risolve",
  );
});

test("una categoria che gira su due sedi non ne dichiara una sola", () => {
  const indice = buildCategoryDisplayIndex({
    categories: [
      { id: "a", name: "Under 15" },
      { id: "b", name: "Under 15" },
    ],
    groups: [
      { categoryId: "a", siteId: "s1", siteName: "Roma", active: true },
      { categoryId: "a", siteId: "s2", siteName: "Milano", active: true },
      { categoryId: "b", siteId: "s3", siteName: "Napoli", active: true },
    ],
  });

  assert.equal(indice.label("a"), "Under 15", "due sedi: nominarne una sarebbe falso");
  assert.equal(indice.label("b"), "Under 15 · Napoli");
});

test("un gruppo archiviato non presta la propria sede", () => {
  const indice = buildCategoryDisplayIndex({
    categories: [
      { id: "a", name: "Under 15" },
      { id: "b", name: "Under 15" },
    ],
    groups: [
      { categoryId: "a", siteId: "s1", siteName: "Roma", active: false },
      { categoryId: "a", siteId: "s2", siteName: "Milano", active: true },
      { categoryId: "b", siteId: "s3", siteName: "Napoli", active: true },
    ],
  });

  assert.equal(
    indice.label("a"),
    "Under 15 · Milano",
    "resta una sola sede attiva, ed e quella",
  );
});

/* ------------------------------------------------------------------ */
/* Nessun catalogo, nessun danno                                       */
/* ------------------------------------------------------------------ */

test("un riferimento che il catalogo non conosce si mostra com'e", () => {
  const indice = buildCategoryDisplayIndex({ categories: CATALOGO_OMONIME, groups: GRUPPI });

  assert.equal(indice.label("Giovanissimi"), "Giovanissimi");
  assert.equal(indice.describe("Giovanissimi").site, "");
});

test("senza catalogo e senza gruppi non si rompe niente", () => {
  const indice = buildCategoryDisplayIndex();

  assert.equal(indice.hasHomonyms, false);
  assert.equal(indice.label("Under 15"), "Under 15");
});

/* ------------------------------------------------------------------ */
/* La primitiva e una sola                                             */
/* ------------------------------------------------------------------ */

test("la resa vive in un componente solo, e la sede vi e secondaria", () => {
  /*
    `D-INT-3` dice esplicitamente che la sede si accosta **in un punto solo, non
    in dieci schermate**. Questa prova e la guardia contro la decima copia.
  */
  const sorgente = readFileSync(
    "src/components/categories/category-label.tsx",
    "utf8",
  );

  assert.match(
    sorgente,
    /buildCategoryDisplayIndex/,
    "il componente deve chiedere la regola al dominio, non riscriverla",
  );
  assert.match(
    sorgente,
    /text-\[0\.85em\][^"]*text-muted-foreground|text-muted-foreground[^"]*text-\[0\.85em\]/,
    "la sede va resa piu piccola e smorzata del nome",
  );
  assert.match(
    sorgente,
    /whitespace-nowrap/,
    "«· Formia» non deve andare a capo da solo su 375 px",
  );
});

test("il dominio non decide l'identita, solo l'etichetta", () => {
  const sorgente = readFileSync("src/lib/categories/display.ts", "utf8");
  const senzaCommenti = sorgente
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

  assert.doesNotMatch(
    senzaCommenti,
    /sameCategory|athleteMatchesCategory|resolveEligible/,
    "questo modulo scrive etichette: non deve poter decidere chi appartiene a cosa",
  );
});
