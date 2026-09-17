import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **D-RD-27 (chiuso in ADR-0197 §37).** Il `DELETE` di una scheda dal
 * registro generico usciva nell'audit come `anagrafica.updated` con metadata
 * vuoto: trecento cancellazioni in blocco erano indistinguibili da trecento
 * modifiche. Ora e `anagrafica.deleted`, con l'etichetta della persona
 * cancellata e l'operazione; la modifica resta `anagrafica.updated`, e le
 * risorse che non sono anagrafiche restano `resource.deleted`.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-00000000d270";
const GESTORE = "11111111-0000-4000-8000-00000000d271";
const TOKEN = "token-gestore-drd27";
const ATLETA = "22222222-0000-4000-8000-00000000d272";

const seed = () => ({
  session: [
    {
      id: "s1",
      token: TOKEN,
      user_id: GESTORE,
      expires_at: new Date(Date.now() + 3_600_000),
      user: { id: GESTORE, email: "gestore@example.invalid", role: "club_manager", first_name: "G", last_name: "M", created_at: new Date(), updated_at: new Date(), email_verified_at: new Date() },
    },
  ],
  organizationUser: [
    { id: "ou-1", user_id: GESTORE, organization_id: CLUB, role: "club_manager", is_primary: true, created_at: new Date() },
  ],
  club: [{ id: CLUB, name: "ASD Alfa", slug: "alfa", categories: [], club_sites: [], trainers: [], staff_members: [] }],
  athlete: [
    { id: ATLETA, organization_id: CLUB, first_name: "Mario", last_name: "Rossi", status: "active", data: {} },
  ],
  athleteCategoryMembership: [],
  clubResourceItem: [],
  auditLog: [],
});

let route;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  route = await import("../../src/app/api/v1/[resource]/[id]/route.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import("../../src/lib/server/prisma.ts"));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const richiesta = (url, method, body) =>
  new Request(url, {
    method,
    headers: {
      "content-type": "application/json",
      cookie: `easygame_session=${TOKEN}`,
      "x-active-club-id": CLUB,
      "x-active-access-role": "club_manager",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

test("cancellare una scheda atleta si audita come anagrafica.deleted, con l'etichetta della persona", async () => {
  const response = await route.DELETE(
    richiesta(`https://local/api/v1/athletes/${ATLETA}`, "DELETE"),
    { params: { resource: "athletes", id: ATLETA } },
  );
  assert.equal(response.status, 200);

  const righe = fake.rows("auditLog").filter((row) => row.resource_id === ATLETA);
  assert.equal(righe.length, 1);
  assert.equal(righe[0].action, "anagrafica.deleted");
  assert.notEqual(righe[0].action, "anagrafica.updated", "una cancellazione non e una modifica");
  assert.equal(righe[0].metadata?.operation, "delete");
  assert.equal(righe[0].metadata?.resource, "athletes");
  assert.equal(righe[0].metadata?.label, "Mario Rossi");
});

test("modificare una scheda resta anagrafica.updated", async () => {
  const response = await route.PATCH(
    richiesta(`https://local/api/v1/athletes/${ATLETA}`, "PATCH", { data: { first_name: "Marco" } }),
    { params: { resource: "athletes", id: ATLETA } },
  );
  assert.equal(response.status, 200);
  const righe = fake.rows("auditLog").filter((row) => row.resource_id === ATLETA);
  assert.equal(righe.length, 1);
  assert.equal(righe[0].action, "anagrafica.updated");
});
