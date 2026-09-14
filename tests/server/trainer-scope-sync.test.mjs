import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **La scheda dell'allenatore e `club_access_scopes` sono due archivi
 * distinti, e nessun codice li teneva insieme** (pilota Fortitudo Scauri):
 * `clubs.trainers[].data.categories` e il perimetro dell'appello
 * (`readTrainerEventPerimeter`); `club_access_scopes` e il confine SQL di
 * `listClubEvents`/`buildAthleteAccessScopeConditions` (Wave 6 §11.3).
 * Aggiungere una categoria alla scheda non la faceva comparire nel
 * perimetro di sede, e l'allenamento di quella categoria restava
 * invisibile per sempre a un allenatore ristretto a una sede — non finche
 * qualcuno non riapriva a mano "Gestisci accesso" e risalvava lo stesso
 * perimetro.
 *
 * `syncTrainerCategoryAccessScope` (club-roles.ts, l'unico scrittore di
 * `club_access_scopes`) chiude il divario, ma **solo** per chi ha gia
 * righe di categoria: mai una restrizione nuova come effetto collaterale
 * di questa schermata (ADR-0103, "zero righe = tutto il club"). L'asse
 * sede non si tocca mai da qui.
 */

const CLUB = "aaaaaaaa-5c07-4000-8000-00000000000a";
const ALLENATORE = "11111111-5c07-4000-8000-000000000f01";
const ALLENATORE_SENZA_SCOPE = "22222222-5c07-4000-8000-000000000f02";

const DIREZIONE = "33333333-5c07-4000-8000-000000000f03";

let clubRoles;
let risorse;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  clubRoles = await import("../../src/lib/server/club-roles.ts");
  risorse = await import("../../src/lib/server/resources.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const scopeDirezione = () => ({
  userId: DIREZIONE,
  activeOrganizationId: CLUB,
  allowedOrganizationIds: [CLUB],
  activeRole: "owner",
});

const scopeRow = (id, organizationUserId, kind, value) => ({
  id,
  organization_user_id: organizationUserId,
  scope_kind: kind,
  scope_value: value,
  created_at: new Date("2026-08-01T00:00:00.000Z"),
});

const seed = () => ({
  user: [{ id: DIREZIONE, email: "direzione@club.it" }],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      creator_id: DIREZIONE,
      trainers: [
        {
          id: "trainer-1",
          name: "Il mister",
          linkedUserId: ALLENATORE,
          categories: ["cat-pulcini", "cat-esordienti"],
        },
      ],
    },
  ],
  clubResourceItem: [
    {
      id: "44444444-5c07-4000-8000-000000000f04",
      organization_id: CLUB,
      resource_type: "trainers",
      payload: {
        id: "trainer-1",
        name: "Il mister",
        linkedUserId: ALLENATORE,
        categories: ["cat-pulcini", "cat-esordienti"],
      },
    },
  ],
  organizationUser: [
    {
      id: "ou-allenatore",
      organization_id: CLUB,
      user_id: ALLENATORE,
      role: "trainer",
      custom_role_id: null,
      is_primary: true,
      created_at: new Date("2026-08-01T00:00:00.000Z"),
    },
    {
      id: "ou-allenatore-senza-scope",
      organization_id: CLUB,
      user_id: ALLENATORE_SENZA_SCOPE,
      role: "trainer",
      custom_role_id: null,
      is_primary: true,
      created_at: new Date("2026-08-01T00:00:00.000Z"),
    },
  ],
  clubAccessScope: [
    scopeRow("scope-sito", "ou-allenatore", "site", "site-scauri"),
    scopeRow("scope-cat-1", "ou-allenatore", "category", "cat-pulcini"),
    scopeRow("scope-cat-2", "ou-allenatore", "category", "cat-esordienti"),
  ],
  auditLog: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

test("categoria aggiunta alla scheda → compare nel perimetro (scope aggiornato)", async () => {
  const esito = await clubRoles.syncTrainerCategoryAccessScope(
    CLUB,
    ALLENATORE,
    ["cat-pulcini", "cat-esordienti", "cat-femminile"],
  );

  assert.deepEqual(esito.aggiunte, ["cat-femminile"]);
  assert.deepEqual(esito.rimosse, []);

  const righe = fake
    .rows("clubAccessScope")
    .filter((r) => r.organization_user_id === "ou-allenatore" && r.scope_kind === "category")
    .map((r) => r.scope_value)
    .sort();
  assert.deepEqual(righe, ["cat-esordienti", "cat-femminile", "cat-pulcini"]);
});

test("categoria togliuta dalla scheda → il perimetro la revoca (scope rimosso)", async () => {
  const esito = await clubRoles.syncTrainerCategoryAccessScope(
    CLUB,
    ALLENATORE,
    ["cat-pulcini"],
  );

  assert.deepEqual(esito.aggiunte, []);
  assert.deepEqual(esito.rimosse, ["cat-esordienti"]);

  const righe = fake
    .rows("clubAccessScope")
    .filter((r) => r.organization_user_id === "ou-allenatore" && r.scope_kind === "category")
    .map((r) => r.scope_value);
  assert.deepEqual(righe, ["cat-pulcini"]);
});

test("l'asse sede non si tocca mai: la riga site resta esattamente quella che era", async () => {
  await clubRoles.syncTrainerCategoryAccessScope(CLUB, ALLENATORE, ["cat-femminile"]);

  const righeSito = fake
    .rows("clubAccessScope")
    .filter((r) => r.organization_user_id === "ou-allenatore" && r.scope_kind === "site");
  assert.deepEqual(righeSito.map((r) => r.scope_value), ["site-scauri"]);
});

test("nessuna riga di categoria preesistente → nessuna restrizione nuova (mai un effetto collaterale)", async () => {
  const esito = await clubRoles.syncTrainerCategoryAccessScope(
    CLUB,
    ALLENATORE_SENZA_SCOPE,
    ["cat-pulcini", "cat-esordienti"],
  );

  assert.equal(esito, null, "chi non ha ancora righe di categoria resta senza — zero righe = tutto il club (ADR-0103)");
  const righe = fake
    .rows("clubAccessScope")
    .filter((r) => r.organization_user_id === "ou-allenatore-senza-scope");
  assert.deepEqual(righe, []);
});

test("nessuna riga duplicata: risincronizzare con la stessa scheda non cambia niente", async () => {
  const primaEsito = await clubRoles.syncTrainerCategoryAccessScope(
    CLUB,
    ALLENATORE,
    ["cat-pulcini", "cat-esordienti", "cat-femminile"],
  );
  assert.deepEqual(primaEsito.aggiunte, ["cat-femminile"]);

  const secondaEsito = await clubRoles.syncTrainerCategoryAccessScope(
    CLUB,
    ALLENATORE,
    ["cat-pulcini", "cat-esordienti", "cat-femminile"],
  );
  assert.deepEqual(secondaEsito, { aggiunte: [], rimosse: [] });

  const righe = fake
    .rows("clubAccessScope")
    .filter((r) => r.organization_user_id === "ou-allenatore" && r.scope_kind === "category" && r.scope_value === "cat-femminile");
  assert.equal(righe.length, 1, "una sola riga, non una per ogni sincronizzazione");
});

test("nessuna tessera per questa persona in questo club → null, nessuna scrittura", async () => {
  const esito = await clubRoles.syncTrainerCategoryAccessScope(
    CLUB,
    "99999999-5c07-4000-8000-000000000fff",
    ["cat-pulcini"],
  );
  assert.equal(esito, null);
});

/* ------------------------ dal percorso di scrittura reale ------------- */

test("PUT dell'intero club (resources.updateResource su \"clubs\", la strada che updateClubDataItem/simplified-db.ts usa davvero) sincronizza il perimetro — non solo la funzione isolata", async () => {
  await risorse.updateResource(
    "clubs",
    CLUB,
    {
      trainers: [
        {
          id: "trainer-1",
          name: "Il mister",
          linkedUserId: ALLENATORE,
          categories: ["cat-pulcini", "cat-femminile"],
        },
      ],
    },
    scopeDirezione(),
  );

  const righe = fake
    .rows("clubAccessScope")
    .filter((r) => r.organization_user_id === "ou-allenatore" && r.scope_kind === "category")
    .map((r) => r.scope_value)
    .sort();
  assert.deepEqual(
    righe,
    ["cat-femminile", "cat-pulcini"],
    "esordienti tolta dalla scheda, femminile aggiunta — il perimetro segue senza che nessuno riapra \"Gestisci accesso\"",
  );

  const righeSito = fake
    .rows("clubAccessScope")
    .filter((r) => r.organization_user_id === "ou-allenatore" && r.scope_kind === "site");
  assert.deepEqual(righeSito.map((r) => r.scope_value), ["site-scauri"], "la sede resta quella che era");
});
