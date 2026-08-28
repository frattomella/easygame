import assert from "node:assert/strict";
import test from "node:test";

import {
  ATHLETE_MEMBERSHIP_ROLLOVER_TYPE,
  assertRolloverTypeRequirements,
  isClubResourceRolloverType,
  normalizeRolloverTypes,
  planSeasonRollover,
  SEASON_ROLLOVER_TYPES,
} from "../../src/lib/club-seasons.ts";
import {
  assertSeasonPermission,
  hasSeasonPermission,
  listSeasonPermissions,
} from "../../src/lib/seasons/permissions.ts";

/**
 * Il modello del riporto, dopo la Wave 1.
 *
 * Tre cose che prima non c'erano e che il riporto dei tesserati richiede:
 *
 * 1. un tipo riportabile che **non** vive in una collezione di club, e che il
 *    piano non deve provare a clonare;
 * 2. un elenco di dipendenze fra tipi — i tesserati senza le categorie non
 *    hanno dove andare, e la procedura lo dice invece di scrivere righe orfane;
 * 3. una mappa da id d'origine a id di destinazione **completa**, che comprenda
 *    anche cio che era gia stato riportato: al secondo giro non si crea nulla,
 *    ma chi deve rimappare un riferimento ha ancora bisogno di sapere dove e
 *    finita la categoria.
 */

const A = "stagione-2026";
const B = "stagione-2027";

const categoria = (id, name, seasonId, extra = {}) => ({
  id,
  name,
  seasonId,
  ...extra,
});

const piano = (id, name, seasonId, categoryId) => ({
  id,
  name,
  seasonId,
  categoryId,
});

const idFisso = () => {
  let counter = 0;
  return (type) => `${type}-nuovo-${(counter += 1)}`;
};

// --- il catalogo --------------------------------------------------------------

test("«Tesserati nelle squadre» e un tipo riportabile, e non e una collezione di club", () => {
  const descriptor = SEASON_ROLLOVER_TYPES.find(
    (entry) => entry.key === ATHLETE_MEMBERSHIP_ROLLOVER_TYPE,
  );

  assert.ok(descriptor, "il tipo deve esistere nel catalogo che l'API espone");
  assert.equal(descriptor.defaultSelected, true, "il caso normale e riportarli");
  assert.equal(descriptor.storage, "model");
  assert.deepEqual(descriptor.requires, ["categories"]);
  assert.equal(isClubResourceRolloverType(ATHLETE_MEMBERSHIP_ROLLOVER_TYPE), false);
  assert.equal(isClubResourceRolloverType("categories"), true);
});

test("il tipo dei tesserati passa dalla normalizzazione come gli altri", () => {
  assert.deepEqual(
    normalizeRolloverTypes(["athlete_memberships", "categories"]),
    ["categories", "athlete_memberships"],
    "l'ordine e quello del catalogo, non quello della richiesta",
  );
});

// --- le dipendenze ------------------------------------------------------------

test("riportare i tesserati senza le categorie viene rifiutato, dicendo cosa manca", () => {
  assert.throws(
    () => assertRolloverTypeRequirements(["athlete_memberships"]),
    (error) => {
      assert.match(error.message, /Tesserati nelle squadre/);
      assert.match(error.message, /Categorie/);
      return true;
    },
  );
});

test("categorie e tesserati insieme sono una richiesta valida", () => {
  assert.doesNotThrow(() =>
    assertRolloverTypeRequirements(["categories", "athlete_memberships"]),
  );
  assert.doesNotThrow(() => assertRolloverTypeRequirements(["categories"]));
});

// --- il piano -----------------------------------------------------------------

test("il piano non prova a clonare un tipo che vive in tabella", () => {
  const plan = planSeasonRollover({
    sourceSeasonId: A,
    targetSeasonId: B,
    types: ["categories", "athlete_memberships"],
    collections: {
      categories: [categoria("cat-1", "Under 12", A)],
    },
    generateId: idFisso(),
  });

  assert.deepEqual(
    plan.entries.map((entry) => entry.type),
    ["categories"],
    "i tesserati li conta il livello server, non il piano",
  );
  assert.equal(plan.createdTotal, 1);
});

test("la mappa degli id dice dove e finita ogni categoria", () => {
  const plan = planSeasonRollover({
    sourceSeasonId: A,
    targetSeasonId: B,
    types: ["categories"],
    collections: {
      categories: [
        categoria("cat-1", "Under 12", A),
        categoria("cat-2", "Under 14", A),
      ],
    },
    generateId: idFisso(),
  });

  assert.deepEqual(plan.idMap, {
    "cat-1": "categories-nuovo-1",
    "cat-2": "categories-nuovo-2",
  });
});

test("al secondo riporto la mappa cita le categorie gia presenti, invece di restare vuota", () => {
  // Cio che la prima esecuzione ha lasciato in destinazione.
  const collections = {
    categories: [
      categoria("cat-1", "Under 12", A),
      categoria("cat-1-copia", "Under 12", B, { rolloverSourceId: "cat-1" }),
    ],
  };

  const plan = planSeasonRollover({
    sourceSeasonId: A,
    targetSeasonId: B,
    types: ["categories"],
    collections,
    generateId: idFisso(),
  });

  assert.equal(plan.createdTotal, 0, "non si crea niente due volte");
  assert.equal(
    plan.idMap["cat-1"],
    "cat-1-copia",
    "senza questa riga i tesserati del secondo giro non troverebbero la categoria",
  );
});

test("una categoria creata a mano con lo stesso nome vale come destinazione", () => {
  const plan = planSeasonRollover({
    sourceSeasonId: A,
    targetSeasonId: B,
    types: ["categories"],
    collections: {
      categories: [
        categoria("cat-1", "Under 12", A),
        // Nessun `rolloverSourceId`: la segreteria l'ha ricreata a mano.
        categoria("cat-fatta-a-mano", "under 12", B),
      ],
    },
    generateId: idFisso(),
  });

  assert.equal(plan.createdTotal, 0);
  assert.equal(plan.idMap["cat-1"], "cat-fatta-a-mano");
});

test("un riferimento riportato dopo punta alla categoria gia presente, non a quella vecchia", () => {
  const collections = {
    categories: [
      categoria("cat-1", "Under 12", A),
      categoria("cat-1-copia", "Under 12", B, { rolloverSourceId: "cat-1" }),
    ],
    payment_plans: [piano("plan-1", "Quota annuale", A, "cat-1")],
  };

  const plan = planSeasonRollover({
    sourceSeasonId: A,
    targetSeasonId: B,
    types: ["categories", "payment_plans"],
    collections,
    generateId: idFisso(),
  });

  const clonato = plan.collections.payment_plans.find(
    (record) => record.seasonId === B,
  );

  assert.equal(
    clonato.categoryId,
    "cat-1-copia",
    "il piano della stagione nuova non puo puntare alla categoria dell'anno prima",
  );
});

// --- il permesso --------------------------------------------------------------

test("il cambio di stagione ha un permesso proprio, con il perimetro di oggi", () => {
  for (const role of ["owner", "club_manager"]) {
    assert.equal(
      hasSeasonPermission(role, "seasons.change"),
      true,
      `${role} deve poter cambiare stagione, come prima`,
    );
  }

  for (const role of ["collaborator", "staff", "trainer", "parent", "athlete"]) {
    assert.equal(
      hasSeasonPermission(role, "seasons.change"),
      false,
      `${role} non deve poter cambiare stagione`,
    );
  }
});

test("un ruolo assente o sconosciuto non ha permessi", () => {
  assert.deepEqual(listSeasonPermissions(null), []);
  assert.deepEqual(listSeasonPermissions("inventato"), []);
  assert.equal(hasSeasonPermission(undefined, "seasons.change"), false);
});

test("il diniego dice «Accesso negato», perche il route handler ne fa un 403", () => {
  assert.throws(
    () => assertSeasonPermission("trainer", "seasons.change"),
    (error) => {
      assert.match(error.message, /Accesso negato/);
      return true;
    },
  );
  assert.doesNotThrow(() => assertSeasonPermission("owner", "seasons.change"));
});
