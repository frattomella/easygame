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

test("due categorie omonime nell'origine non collassano in una sola", () => {
  /*
    Il difetto che questo test chiude, trovato dall'audit di fine Wave.

    Su un club multi-sede due categorie che si chiamano entrambe «Under 14» —
    una a Nord e una a Sud — sono normali. La corrispondenza per nome faceva
    trovare alla seconda il clone della prima: non veniva creata, e l'`idMap`
    faceva puntare **entrambe** allo stesso id. Finche il riporto portava solo
    configurazione era un difetto silenzioso; da quando porta i tesserati, e
    mezza squadra nella squadra sbagliata — il criterio n. 1 di fallimento
    della UAT.
  */
  const plan = planSeasonRollover({
    sourceSeasonId: A,
    targetSeasonId: B,
    types: ["categories"],
    collections: {
      categories: [
        categoria("cat-nord", "Under 14", A),
        categoria("cat-sud", "Under 14", A),
      ],
    },
    generateId: idFisso(),
  });

  assert.equal(plan.createdTotal, 2, "due categorie di origine, due categorie nuove");
  assert.notEqual(
    plan.idMap["cat-nord"],
    plan.idMap["cat-sud"],
    "due squadre diverse non possono finire nello stesso id",
  );
});

test("una sola categoria omonima gia in destinazione serve una sola origine", () => {
  const plan = planSeasonRollover({
    sourceSeasonId: A,
    targetSeasonId: B,
    types: ["categories"],
    collections: {
      categories: [
        categoria("cat-nord", "Under 14", A),
        categoria("cat-sud", "Under 14", A),
        // La segreteria ne ha ricreata una a mano nella stagione nuova.
        categoria("cat-fatta-a-mano", "under 14", B),
      ],
    },
    generateId: idFisso(),
  });

  assert.equal(
    plan.idMap["cat-nord"],
    "cat-fatta-a-mano",
    "la prima trova quella che esiste gia",
  );
  assert.equal(
    plan.createdTotal,
    1,
    "la seconda non puo riusarla: viene creata",
  );
  assert.notEqual(plan.idMap["cat-sud"], "cat-fatta-a-mano");
});

test("al secondo riporto un'omonima non ruba la destinazione di chi l'ha gia", () => {
  /*
    Il caso che la prima correzione non copriva, trovato dalla seconda
    revisione — ed e il caso **reale**, perche il primo riporto quasi mai e
    l'ultimo.

    In destinazione c'e gia il clone di `cat-nord`. Se `cat-sud`, che si chiama
    uguale, viene iterata per prima, con un passo solo si prendeva quel clone
    **per nome** prima che `cat-nord` lo reclamasse con il suo
    `rolloverSourceId`: entrambe finivano sullo stesso id, e i tesserati di Sud
    nella squadra di Nord.

    Le corrispondenze certe si risolvono prima; quelle per nome scelgono fra
    cio che resta.
  */
  const plan = planSeasonRollover({
    sourceSeasonId: A,
    targetSeasonId: B,
    types: ["categories"],
    collections: {
      categories: [
        // L'ordine e quello che rompeva: l'omonima senza clone viene prima.
        categoria("cat-sud", "Under 14", A),
        categoria("cat-nord", "Under 14", A),
        categoria("cat-nord-copia", "Under 14", B, {
          rolloverSourceId: "cat-nord",
        }),
      ],
    },
    generateId: idFisso(),
  });

  assert.equal(
    plan.idMap["cat-nord"],
    "cat-nord-copia",
    "chi ha gia il suo clone se lo tiene",
  );
  assert.notEqual(
    plan.idMap["cat-sud"],
    "cat-nord-copia",
    "l'omonima non puo rubarglielo",
  );
  assert.equal(plan.createdTotal, 1, "a Sud ne serve una sua");
});

test("due omonime gia in destinazione servono due origini diverse", () => {
  const plan = planSeasonRollover({
    sourceSeasonId: A,
    targetSeasonId: B,
    types: ["categories"],
    collections: {
      categories: [
        categoria("cat-nord", "Under 14", A),
        categoria("cat-sud", "Under 14", A),
        categoria("t1", "Under 14", B),
        categoria("t2", "Under 14", B),
      ],
    },
    generateId: idFisso(),
  });

  assert.equal(plan.createdTotal, 0, "ce ne sono gia due: bastano");
  assert.notEqual(
    plan.idMap["cat-nord"],
    plan.idMap["cat-sud"],
    "una per ciascuna, non due volte la stessa",
  );
  assert.deepEqual(
    [plan.idMap["cat-nord"], plan.idMap["cat-sud"]].sort(),
    ["t1", "t2"],
  );
});

test("tre omonime nell'origine producono tre destinazioni distinte", () => {
  const plan = planSeasonRollover({
    sourceSeasonId: A,
    targetSeasonId: B,
    types: ["categories"],
    collections: {
      categories: [
        categoria("cat-1", "Under 14", A),
        categoria("cat-2", "Under 14", A),
        categoria("cat-3", "Under 14", A),
      ],
    },
    generateId: idFisso(),
  });

  const destinazioni = ["cat-1", "cat-2", "cat-3"].map((id) => plan.idMap[id]);

  assert.equal(plan.createdTotal, 3);
  assert.equal(new Set(destinazioni).size, 3, "tre squadre, tre id");
});
