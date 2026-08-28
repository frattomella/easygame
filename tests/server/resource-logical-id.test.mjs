import assert from "node:assert/strict";
import test from "node:test";

import { buildWhereFromSearchParams } from "../../src/lib/server/resources.ts";
import { publicErrorMessage } from "../../src/lib/server/api-errors.ts";

/**
 * L'id di una risorsa di club, e cosa esce quando la query fallisce.
 *
 * ## Il difetto, visto provando a fare una cosa normale
 *
 * Eliminare una categoria dalla scheda Categorie rispondeva **400** e non
 * cancellava niente. Il corpo della risposta conteneva questo:
 *
 *     invalid input syntax for type uuid: "category-under-12-bw552a"
 *
 * `club_resource_items.id` e una colonna `uuid`; l'id che l'applicazione usa
 * per una categoria e `category-<slug>-<suffisso>`, che sta nel payload.
 * Filtrare la lista per `id` metteva l'id logico dentro il confronto con la
 * colonna uuid: Postgres non «non trova niente», si ferma.
 *
 * **Nessuna categoria era eliminabile**, perche nessun id logico e un UUID.
 * E il gesto passava di qui — e non dalla rotta del singolo elemento, che
 * l'id logico lo accetta da sempre — perche la cancellazione filtra per id
 * **e** per club, cioe con due filtri, e con due filtri il client legge la
 * lista prima di cancellare.
 */

const UUID = "a82598a7-4c64-46bb-aa71-9cc61617084e";

test("un id logico di categoria cerca dentro il payload, non nella colonna uuid", () => {
  const where = buildWhereFromSearchParams(
    "categories",
    new URLSearchParams({
      id: "category-under-12-bw552a",
      club_id: "6bbf3134-1ac8-4725-9378-99b05b4c53cd",
    }),
  );

  assert.equal(where.id, undefined, "l'id logico non va nella colonna uuid");
  assert.deepEqual(where.payload, {
    path: ["id"],
    equals: "category-under-12-bw552a",
  });
  assert.equal(where.resource_type, "categories");
  assert.equal(where.organization_id, "6bbf3134-1ac8-4725-9378-99b05b4c53cd");
});

test("un UUID resta un confronto sulla colonna, come prima", () => {
  const where = buildWhereFromSearchParams(
    "categories",
    new URLSearchParams({ id: UUID }),
  );

  assert.equal(where.id, UUID);
  assert.equal(where.payload, undefined);
});

/**
 * Vale per tutte le risorse di club, non solo per le categorie: allenatori,
 * soci, gruppi e sedi hanno tutti un id logico nel payload.
 */
test("la regola vale per ogni risorsa di club", () => {
  for (const resource of ["trainers", "members", "club_sites", "category_groups"]) {
    const where = buildWhereFromSearchParams(
      resource,
      new URLSearchParams({ id: `${resource}-1787872736514-abc` }),
    );

    assert.equal(where.id, undefined, `${resource}: l'id logico non e un uuid`);
    assert.equal(
      where.payload.equals,
      `${resource}-1787872736514-abc`,
      `${resource}: va cercato nel payload`,
    );
  }
});

/**
 * Le risorse che sono tabelle vere hanno una colonna `id` e li il confronto
 * resta quello: qui non si tocca niente.
 */
test("le risorse modello non cambiano comportamento", () => {
  const where = buildWhereFromSearchParams(
    "athletes",
    new URLSearchParams({ id: UUID }),
  );

  assert.equal(where.id, UUID);
  assert.equal(where.payload, undefined);
});

// --- cosa esce quando qualcosa va storto ------------------------------------

/**
 * Il messaggio del driver arrivava intero al browser: nome del modello
 * Prisma, nome dell'operazione, codice d'errore di Postgres.
 */
test("un errore del database non esce dal server", () => {
  const prismaError = new Error(
    'Invalid `prisma.clubResourceItem.findMany()` invocation:\n\n' +
      'ConnectorError(ConnectorError { kind: QueryError(PostgresError { code: "22P02", ' +
      'message: "invalid input syntax for type uuid: \\"category-under-12-bw552a\\"" }) })',
  );

  assert.equal(
    publicErrorMessage(prismaError, "Errore recupero risorsa"),
    "Errore recupero risorsa",
  );
});

/**
 * «Accesso negato» deve passare: e la stringa su cui le rotte mappano il 403
 * (CLAUDE.md, sezione 8). Sanificarla trasformerebbe ogni 403 in un 400.
 */
test("«Accesso negato» passa sempre", () => {
  const message = "Accesso negato: il club non e nello scope della sessione";

  assert.equal(publicErrorMessage(new Error(message)), message);
});

/** I messaggi di dominio sono scritti per chi legge: passano. */
test("i messaggi di dominio passano intatti", () => {
  assert.equal(
    publicErrorMessage(new Error("Il cognome e obbligatorio")),
    "Il cognome e obbligatorio",
  );
  assert.equal(
    publicErrorMessage(new Error(""), "Operazione non riuscita"),
    "Operazione non riuscita",
  );
});
