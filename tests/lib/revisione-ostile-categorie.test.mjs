import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeAthleteCategoryMemberships,
} from "../../src/lib/athlete-category-memberships.ts";

/**
 * **I tre difetti critici che la revisione ostile ha trovato su N1.**
 *
 * Tutti e tre erano invisibili alle ventisei prove scritte insieme alla
 * correzione, e tutti e tre sono stati **riprodotti eseguendo il modulo**, non
 * leggendolo. E la ragione per cui una revisione indipendente vale piu di una
 * rilettura: chi ha scritto la correzione prova cio che ha in mente.
 */

const CAT_A = "category-1757000000000-aaaaa";
const CAT_B = "category-1757000000000-bbbbb";
const U15_FORMIA = "category-1757000000000-u15fo";
const U15_SCAURI = "category-1757000000000-u15sc";

/* ------------------------------------------------------------------ */
/* C1 — la primaria dichiarata non deve dipendere dall'ordine di lettura */
/* ------------------------------------------------------------------ */

test("C1 · la primaria dichiarata vince anche se non e la prima riga", () => {
  /*
    `loadClubAthleteMemberships` legge **senza `ORDER BY`**: l'ordine e quello
    dell'heap di Postgres, che cambia dopo ogni aggiornamento di riga. Con la
    promozione dell'indice zero dentro lo stesso ciclo che cercava la
    dichiarata, la prima riga veniva promossa prima che il ciclo vedesse la
    seconda.

    E il danno si fissava: ogni salvataggio riscrive `athletes.category_id`
    dalla primaria normalizzata, quindi bastava cambiare un avatar per spostare
    in archivio la primaria di un atleta su una sua secondaria.
  */
  const memberships = normalizeAthleteCategoryMemberships({
    id: "atleta-1",
    category_memberships: [
      { category_id: CAT_B, category_name: "Pulcini", is_primary: false },
      { category_id: CAT_A, category_name: "Scoiattoli", is_primary: true },
    ],
  });

  const primaria = memberships.find((membership) => membership.isPrimary);

  assert.equal(primaria.categoryId, CAT_A, "la dichiarata e Scoiattoli");
  assert.equal(memberships.filter((m) => m.isPrimary).length, 1);
});

test("C1 · il controspecchio: senza nessuna dichiarata si promuove la prima", () => {
  const memberships = normalizeAthleteCategoryMemberships({
    id: "atleta-1",
    category_memberships: [
      { category_id: CAT_B, category_name: "Pulcini", is_primary: false },
      { category_id: CAT_A, category_name: "Scoiattoli", is_primary: false },
    ],
  });

  assert.equal(memberships.filter((m) => m.isPrimary).length, 1);
  assert.equal(memberships.find((m) => m.isPrimary).categoryId, CAT_B);
});

test("C1 · l'ordine di lettura non cambia il risultato", () => {
  const righe = [
    { category_id: CAT_B, category_name: "Pulcini", is_primary: false },
    { category_id: CAT_A, category_name: "Scoiattoli", is_primary: true },
  ];

  const dritte = normalizeAthleteCategoryMemberships({
    id: "a",
    category_memberships: righe,
  });
  const rovesce = normalizeAthleteCategoryMemberships({
    id: "a",
    category_memberships: [...righe].reverse(),
  });

  assert.equal(
    dritte.find((m) => m.isPrimary).categoryId,
    rovesce.find((m) => m.isPrimary).categoryId,
    "l'heap di Postgres non deve decidere la squadra di un ragazzo",
  );
});

/* ------------------------------------------------------------------ */
/* C2 — la colonna storica non deve sparire                            */
/* ------------------------------------------------------------------ */

test("C2 · su un club migrato a meta la categoria della colonna non si perde", () => {
  /*
    `athletes.category_id` con la primaria vera, righe scritte solo per le
    secondarie: la prima stesura lasciava cadere la colonna e quella categoria
    spariva dalla scheda. Peggio, il salvataggio successivo riscrive la colonna
    **dalla primaria normalizzata**, quindi la perdita diventava permanente.
  */
  const memberships = normalizeAthleteCategoryMemberships({
    id: "atleta-1",
    category_id: CAT_A,
    category_name: "Scoiattoli",
    category_memberships: [
      { category_id: CAT_B, category_name: "Pulcini", is_primary: false },
    ],
  });

  const identita = memberships.map((m) => m.categoryId);

  assert.ok(identita.includes(CAT_A), "Scoiattoli non deve sparire");
  assert.ok(identita.includes(CAT_B), "e Pulcini nemmeno");
  assert.equal(memberships.length, 2);
});

test("C2 · la colonna entra come secondaria: la primaria la dicono le righe", () => {
  const memberships = normalizeAthleteCategoryMemberships({
    id: "atleta-1",
    category_id: CAT_A,
    category_name: "Scoiattoli",
    category_memberships: [
      { category_id: CAT_B, category_name: "Pulcini", is_primary: true },
    ],
  });

  assert.equal(
    memberships.find((m) => m.isPrimary).categoryId,
    CAT_B,
    "le righe sono la fonte",
  );
  assert.equal(
    memberships.find((m) => m.categoryId === CAT_A).isPrimary,
    false,
  );
});

test("C2 · e non torna il difetto N1: la stessa categoria resta una", () => {
  /*
    Il controspecchio che tiene onesta la correzione. Quello che C2 riapre e
    una categoria **diversa**; la stessa categoria continua a fondersi.
  */
  const memberships = normalizeAthleteCategoryMemberships({
    id: "atleta-1",
    category_memberships: [
      { category_id: CAT_A, category_name: "Scoiattoli", is_primary: true },
    ],
    data: { category: "Scoiattoli" },
  });

  assert.equal(memberships.length, 1);
  assert.equal(memberships[0].categoryId, CAT_A);
});

test("C2 · una colonna ambigua continua a non entrare", () => {
  const memberships = normalizeAthleteCategoryMemberships(
    {
      id: "atleta-1",
      category_memberships: [
        { category_id: U15_FORMIA, category_name: "Under 15", is_primary: true },
        { category_id: U15_SCAURI, category_name: "Under 15", is_primary: false },
      ],
      data: { category: "Under 15" },
    },
    [
      { id: U15_FORMIA, name: "Under 15" },
      { id: U15_SCAURI, name: "Under 15" },
    ],
  );

  assert.equal(memberships.length, 2, "un nome che ne nomina due non ne nomina nessuna");
  assert.equal(
    memberships.some((m) => m.categoryId === "Under 15"),
    false,
  );
});
