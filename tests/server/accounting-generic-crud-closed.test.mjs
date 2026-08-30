import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **La terza porta della prima nota.**
 *
 * La Wave 4 ha chiuso la pagina e ha scritto la rotta dedicata, e il commento
 * in `src/lib/accounting/permissions.ts` descriveva la terza **al passato**:
 * «il CRUD generico su `transactions` e `transfers` *rispondeva* 200 e
 * permetteva di cancellare».
 *
 * L'audit indipendente ha dimostrato che era ancora aperta, e a **staff e
 * collaboratori**. E non erano righe inerti: la prima nota le proietta, quindi
 * cancellarne una faceva sparire una riga dal registro **senza storno, senza
 * autore e senza una traccia con l'id del movimento** — cioe annullava D-3,
 * l'invariante centrale della Wave.
 *
 * Il registro nuovo chiede `accounting.manage` per scrivere, `accounting.reverse`
 * per stornare, e un `DELETE` non ce l'ha affatto.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";

const scope = () => ({
  userId: "11111111-0000-4000-8000-000000000aaa",
  activeOrganizationId: CLUB,
  allowedOrganizationIds: [CLUB],
});

let resources;
let setPrismaClientForTests;
let fake;

const seed = () => ({
  club: [{ id: CLUB, slug: "club-a", name: "Club A" }],
  clubResourceItem: [
    {
      id: "mov-storico",
      organization_id: CLUB,
      resource_type: "transactions",
      payload: { amount: 12000, description: "Movimento storico" },
    },
    {
      id: "giro-storico",
      organization_id: CLUB,
      resource_type: "transfers",
      payload: { amount: 500 },
    },
    {
      id: "prev-1",
      organization_id: CLUB,
      resource_type: "expected_income",
      payload: { amount: 300, description: "Contributo atteso" },
    },
  ],
  auditLog: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  resources = await import("../../src/lib/server/resources.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const righe = () => fake.rows("clubResourceItem");

const DOMINI = ["transactions", "transfers", "expected_income", "expected_expenses"];

/* ============================ la rotta propria della risorsa */

test("un movimento non si crea dal registro generico", async () => {
  for (const tipo of DOMINI) {
    await assert.rejects(
      () =>
        resources.createResource(
          tipo,
          { organization_id: CLUB, amount: 100, description: "Iniettato" },
          scope(),
        ),
      /Accesso negato/,
      `${tipo} non deve accettare una creazione dal registro generico`,
    );
  }
});

test("un movimento storico non si cancella dal registro generico", async () => {
  /*
    E la prova che chiude D-3 sulla porta che era rimasta. Prima rispondeva
    `200` e la riga spariva.
  */
  await assert.rejects(
    () => resources.deleteResource("transactions", "mov-storico", scope()),
    /Accesso negato/,
  );

  assert.ok(
    righe().some((r) => r.id === "mov-storico"),
    "il movimento da 120 euro deve essere ancora li",
  );
});

test("un giroconto storico e una previsione non si cancellano", async () => {
  for (const [tipo, id] of [
    ["transfers", "giro-storico"],
    ["expected_income", "prev-1"],
  ]) {
    await assert.rejects(
      () => resources.deleteResource(tipo, id, scope()),
      /Accesso negato/,
    );
    assert.ok(righe().some((r) => r.id === id));
  }
});

test("nemmeno una modifica passa", async () => {
  await assert.rejects(
    () =>
      resources.updateResource(
        "transactions",
        "mov-storico",
        { amount: 1 },
        scope(),
      ),
    /Accesso negato/,
  );
});

/* ================== la porta di `club_resource_items` resta chiusa */

test("il tipo nel payload di club_resource_items e bloccato come prima", async () => {
  /*
    Le due porte portano alla stessa riga: `club_resource_items` con il tipo nel
    payload, e `/api/v1/transactions` dove il tipo **e** il nome della risorsa.
    La prima versione della guardia guardava solo la prima.
  */
  await assert.rejects(
    () =>
      resources.createResource(
        "club_resource_items",
        { organization_id: CLUB, resource_type: "transactions", payload: {} },
        scope(),
      ),
    /Accesso negato/,
  );
});

/* ================= cio che deve continuare a passare */

test("le altre risorse di club non sono state chiuse per errore", async () => {
  /*
    Una guardia che nega troppo e un difetto quanto una che nega troppo poco.
    Gli sponsor, per esempio, hanno ancora la loro superficie sul registro
    generico: chiuderli avrebbe rotto `/sponsors` senza dare niente in cambio.
  */
  const creato = await resources.createResource(
    "sponsors",
    { organization_id: CLUB, name: "Ferramenta Bianchi" },
    scope(),
  );

  assert.ok(creato, "gli sponsor devono continuare a passare");
});
