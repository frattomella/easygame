import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * **C3 — il difetto di Fortitudo reintrodotto dal lato che lo scrive.**
 *
 * La correzione di N1 costruiva la primaria **dal valore ricevuto**, che su un
 * cambio per nome e un'etichetta. Su un club con due «Under 15» — esattamente
 * la popolazione per cui N1 e N3 esistono — quel valore non identifica nessuna
 * categoria, non si fondeva con nessuna appartenenza, e usciva come riga
 * propria **primaria**. E `replaceAthleteMemberships` cancella e reinserisce
 * cio che esce di li: in archivio finiva una riga vera con
 * `category_id = "Under 15"`, che l'indice unico non intercetta perche e una
 * stringa diversa.
 *
 * Cioe: la correzione reintroduceva il difetto che doveva togliere. Il filtro
 * grezzo di prima aveva i suoi guai, ma non **creava** una riga.
 */

const U15_FORMIA = "category-1757000000000-u15fo";
const U15_SCAURI = "category-1757000000000-u15sc";
const PULCINI = "category-1757000000000-pulci";

let risolvi;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  const modulo = await import("../../src/lib/simplified-db.ts");
  risolvi = modulo.__resolveRequestedAthleteMembershipsForTests;
});

const atletaConDueOmonime = () => ({
  id: "atleta-1",
  category_memberships: [
    {
      category_id: U15_FORMIA,
      category_name: "Under 15",
      site_id: "sede-formia",
      is_primary: true,
    },
    {
      category_id: U15_SCAURI,
      category_name: "Under 15",
      site_id: "sede-scauri",
      is_primary: false,
    },
  ],
});

test("C3 · un nome ambiguo non crea una terza categoria fantasma", () => {
  const risultato = risolvi(atletaConDueOmonime(), { category: "Under 15" });

  assert.equal(
    risultato.some((membership) => membership.categoryId === "Under 15"),
    false,
    "«Under 15» non e l'identificativo di nessuna categoria: non deve diventare una riga",
  );
  assert.equal(risultato.length, 2, "le due squadre restano due");
});

test("C3 · e non tocca niente: un cambio che non identifica non e un cambio", () => {
  const risultato = risolvi(atletaConDueOmonime(), { category: "Under 15" });

  assert.equal(
    risultato.find((membership) => membership.isPrimary).categoryId,
    U15_FORMIA,
    "meglio un cambio che non avviene di un cambio che inventa una squadra",
  );
});

test("C3 · un identificativo vero promuove la riga che c'e gia", () => {
  const risultato = risolvi(atletaConDueOmonime(), {
    category: U15_SCAURI,
  });

  assert.equal(risultato.length, 2, "nessuna riga nuova");
  assert.equal(
    risultato.find((membership) => membership.isPrimary).categoryId,
    U15_SCAURI,
  );
});

test("C3 · promuovendo una secondaria si porta dietro la propria sede", () => {
  /*
    La sede della primaria uscente era quella di **un'altra** categoria: farla
    ereditare vorrebbe dire spostare un ragazzo di sede senza dirglielo
    (revisione ostile, M1).
  */
  const risultato = risolvi(atletaConDueOmonime(), { category: U15_SCAURI });
  const primaria = risultato.find((membership) => membership.isPrimary);

  assert.equal(primaria.siteId, "sede-scauri");
});

test("C3 · una categoria davvero nuova si crea ancora", () => {
  /*
    Il controspecchio: la difesa non deve poter essere soddisfatta chiudendo
    tutto. Un riferimento che il catalogo corrente non conosce **e** una
    categoria nuova, non un'ambiguita.
  */
  const risultato = risolvi(atletaConDueOmonime(), {
    category: PULCINI,
    categoryName: "Pulcini",
  });

  assert.equal(risultato.length, 3);
  assert.equal(
    risultato.find((membership) => membership.isPrimary).categoryId,
    PULCINI,
  );
});

test("C3 · un cambio per nome inequivocabile continua a funzionare", () => {
  const atleta = {
    id: "atleta-1",
    category_memberships: [
      {
        category_id: PULCINI,
        category_name: "Pulcini",
        is_primary: true,
      },
      {
        category_id: U15_FORMIA,
        category_name: "Under 15",
        site_id: "sede-formia",
        is_primary: false,
      },
    ],
  };

  const risultato = risolvi(atleta, { category: "Under 15" });

  assert.equal(risultato.length, 2, "nessuna riga in piu");
  assert.equal(
    risultato.find((membership) => membership.isPrimary).categoryId,
    U15_FORMIA,
    "un nome che ne nomina una sola la nomina",
  );
});

test("C3 · la vecchia primaria scende a secondaria, e non resta doppia", () => {
  const atleta = {
    id: "atleta-1",
    category_memberships: [
      { category_id: PULCINI, category_name: "Pulcini", is_primary: true },
      {
        category_id: U15_FORMIA,
        category_name: "Under 15",
        is_primary: false,
      },
    ],
  };

  const risultato = risolvi(atleta, { category: U15_FORMIA });

  assert.equal(risultato.filter((m) => m.isPrimary).length, 1);
  assert.equal(
    risultato.find((m) => m.categoryId === PULCINI).isPrimary,
    false,
  );
  assert.equal(
    new Set(risultato.map((m) => m.categoryId)).size,
    risultato.length,
    "nessuna categoria compare due volte",
  );
});
