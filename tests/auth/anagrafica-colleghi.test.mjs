import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **L'anagrafica di un collega non e il dato dell'allenatore.**
 *
 * `trainers` e `staff_members` stanno in `TRAINER_READ_RESOURCES` perche la
 * dashboard deve sapere **chi allena cosa**: i nomi, le categorie, il legame
 * con un account. Ma la risorsa e una collezione JSON del club, e usciva per
 * intero: **codice fiscale, indirizzo e telefono** di ogni collega, a chiunque
 * abbia il ruolo allenatore in quel club.
 *
 * E la stessa forma di D-4: una schermata che mostra solo cio che serve, e una
 * risposta che porta tutto. La difesa e un elenco di cio che **puo uscire**, e
 * non di cio che va tolto: un campo nuovo sulla scheda di un collaboratore
 * nasce cosi invisibile all'allenatore.
 *
 * Questo file esiste perche fallisca se la proiezione si allarga.
 */

const CLUB = "aaaaaaaa-7000-4000-8000-00000000000a";
const ALLENATORE = "11111111-7000-4000-8000-000000000aaa";
const PROPRIETARIO = "22222222-7000-4000-8000-000000000bbb";

const scope = (activeRole, userId) => ({
  userId,
  activeOrganizationId: CLUB,
  activeRole,
  allowedOrganizationIds: [CLUB],
});

let risorse;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  risorse = await import("../../src/lib/server/resources.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const CAMPI_RISERVATI = [
  "fiscalCode",
  "fiscal_code",
  "address",
  "phone",
  "birth_date",
  "iban",
  "documentNumber",
  "notes",
];

const collega = (id, nome) => ({
  id,
  organization_id: CLUB,
  resource_type: "trainers",
  name: nome,
  payload: {
    id,
    first_name: nome,
    last_name: "Colombo",
    email: `${nome.toLowerCase()}@club.it`,
    categories: ["u15"],
    linkedUserId: id === "trainer-io" ? ALLENATORE : null,
    /* Cio che non deve uscire. */
    fiscalCode: "CLMVNI80A01H501X",
    fiscal_code: "CLMVNI80A01H501X",
    address: "Via dei Colleghi 3",
    phone: "+39 333 1234567",
    birth_date: "1980-01-01",
    iban: "IT60X0542811101000000123456",
    documentNumber: "CA12345AA",
    notes: "Contratto in scadenza a giugno",
    /* Cio che deve uscire solo sulla propria riga (vedi il blocco piu sotto). */
    documents: [{ id: "doc-1", name: "Contratto.pdf" }],
    contracts: [{ id: "ctr-1", name: "Assicurazione.pdf" }],
  },
});

const seed = () => ({
  user: [
    { id: ALLENATORE, email: "io@club.it", role: "user" },
    { id: PROPRIETARIO, email: "presidente@club.it", role: "user" },
  ],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      categories: [{ id: "u15", name: "Under 15" }],
      trainers: [],
      staff_members: [],
    },
  ],
  clubResourceItem: [
    collega("trainer-io", "Io"),
    collega("trainer-collega", "Ivan"),
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

test("all'allenatore non esce il codice fiscale dei colleghi", async () => {
  const { records } = await risorse.listResourcePage(
    "trainers",
    new URLSearchParams({ organization_id: CLUB }),
    scope("trainer", ALLENATORE),
  );

  assert.ok(records.length > 0, "i colleghi restano elencabili");

  for (const riga of records) {
    for (const campo of CAMPI_RISERVATI) {
      assert.equal(
        campo in riga,
        false,
        `${campo} non deve uscire verso un allenatore`,
      );
      assert.equal(campo in (riga.data || {}), false);
    }
  }
});

test("cio che serve alla dashboard resta", async () => {
  const { records } = await risorse.listResourcePage(
    "trainers",
    new URLSearchParams({ organization_id: CLUB }),
    scope("trainer", ALLENATORE),
  );

  const io = records.find((riga) => riga.id === "trainer-io");
  assert.ok(io, "l'allenatore deve riconoscere se stesso");
  assert.equal(io.first_name, "Io");
  assert.equal(io.email, "io@club.it");
  assert.deepEqual(io.categories, ["u15"]);
  assert.equal(
    io.linkedUserId,
    ALLENATORE,
    "senza il legame la dashboard non sa chi sta guardando",
  );
});

test("la riduzione vale anche sullo staff", async () => {
  fake.rows("clubResourceItem").push({
    ...collega("staff-1", "Segreteria"),
    resource_type: "staff_members",
  });

  const { records } = await risorse.listResourcePage(
    "staff_members",
    new URLSearchParams({ organization_id: CLUB }),
    scope("trainer", ALLENATORE),
  );

  for (const riga of records) {
    for (const campo of CAMPI_RISERVATI) {
      assert.equal(campo in riga, false);
    }
  }
});

test("alla direzione l'anagrafica esce intera", async () => {
  const { records } = await risorse.listResourcePage(
    "trainers",
    new URLSearchParams({ organization_id: CLUB }),
    scope("owner", PROPRIETARIO),
  );

  const collegaIntero = records.find((riga) => riga.id === "trainer-collega");
  assert.equal(collegaIntero.fiscalCode, "CLMVNI80A01H501X");
  assert.equal(collegaIntero.phone, "+39 333 1234567");
  assert.equal(collegaIntero.iban, "IT60X0542811101000000123456");
});

test("i propri documenti restano visibili: la riduzione pensata per i colleghi non deve colpire se stessi", async () => {
  /*
    Il difetto reale: `documents`/`contracts` mancavano dall'elenco per
    **chiunque**, quindi anche sulla propria scheda — "I miei documenti"
    risultava sempre vuoto anche quando la segreteria li aveva caricati
    davvero. Il riscontro e lo stesso gia usato per "chi allena cosa":
    `linkedUserId === scope.userId`.
  */
  const { records } = await risorse.listResourcePage(
    "trainers",
    new URLSearchParams({ organization_id: CLUB }),
    scope("trainer", ALLENATORE),
  );

  const io = records.find((riga) => riga.id === "trainer-io");
  assert.deepEqual(io.documents, [{ id: "doc-1", name: "Contratto.pdf" }]);
  assert.deepEqual(io.contracts, [{ id: "ctr-1", name: "Assicurazione.pdf" }]);
});

test("i documenti di un collega restano fuori dalla proiezione", async () => {
  const { records } = await risorse.listResourcePage(
    "trainers",
    new URLSearchParams({ organization_id: CLUB }),
    scope("trainer", ALLENATORE),
  );

  const collegaIo = records.find((riga) => riga.id === "trainer-collega");
  assert.equal(
    "documents" in collegaIo,
    false,
    "il contratto di un collega non e un dato dell'allenatore",
  );
  assert.equal("contracts" in collegaIo, false);
});

test("un campo nuovo sulla scheda nasce invisibile all'allenatore", async () => {
  /*
    E la proprieta che rende la difesa durevole: chi aggiunge un campo alla
    scheda di un collaboratore non deve ricordarsi di niente, perche il verso
    predefinito e «non esce».
  */
  const righe = fake.rows("clubResourceItem");
  righe[0].payload.campoInventatoDomani = "un segreto";

  const { records } = await risorse.listResourcePage(
    "trainers",
    new URLSearchParams({ organization_id: CLUB }),
    scope("trainer", ALLENATORE),
  );

  for (const riga of records) {
    assert.equal(
      "campoInventatoDomani" in riga,
      false,
      "il verso predefinito e «non esce»",
    );
  }
});
