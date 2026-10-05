import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Fondare un club proprio non e un atto dentro un club.**
 *
 * Riprodotto il 2026-10-05 sul database locale: un utente appena registrato,
 * senza nessun club, apre «Crea club» dall'area account e riceve 403
 * «Accesso negato per il ruolo attivo». La causa e `d465ec7d` (2026-08-21):
 * il POST del registro generico chiede `canAccessClubResource(activeRole,
 * "clubs", "create")`, e `clubs` e riservata alla direzione del club
 * **attivo** — che chi non ha un club non ha, e che un allenatore o un
 * genitore di un altro club non e.
 *
 * La regola giusta (ADR-0201): `clubs` in modo `create` e permessa a ogni
 * utente autenticato, valutata **fuori** dal club attivo; il fondatore e la
 * sessione e diventa proprietario; nessun'altra risorsa, nessun `upsert`,
 * nessun accesso a club altrui.
 */

const NUOVO = "11111111-0201-4000-8000-000000000001";
const ALLENATORE = "22222222-0201-4000-8000-000000000002";
const DIREZIONE = "33333333-0201-4000-8000-000000000003";
const SEGRETERIA = "44444444-0201-4000-8000-000000000004";
const CLUB_ESISTENTE = "aaaaaaaa-0201-4000-8000-00000000000a";

const utente = (id, email, role = "user") => ({
  id,
  email,
  role,
  first_name: "Mario",
  last_name: "Test",
  created_at: new Date(),
  updated_at: new Date(),
  email_verified_at: new Date(),
});

const sessione = (token, user) => ({
  id: `s-${token}`,
  token,
  user_id: user.id,
  expires_at: new Date(Date.now() + 3_600_000),
  user,
});

const seed = () => {
  const nuovo = utente(NUOVO, "mario@test.invalid");
  const allenatore = utente(ALLENATORE, "coach@test.invalid", "trainer");
  const direzione = utente(DIREZIONE, "owner@test.invalid", "owner");
  const segreteria = utente(SEGRETERIA, "segreteria@test.invalid");
  return {
    user: [nuovo, allenatore, direzione, segreteria],
    session: [
      sessione("tok-nuovo", nuovo),
      sessione("tok-allenatore", allenatore),
      sessione("tok-direzione", direzione),
      sessione("tok-segreteria", segreteria),
    ],
    club: [
      {
        id: CLUB_ESISTENTE,
        name: "ASD Esistente",
        slug: "esistente",
        creator_id: DIREZIONE,
        settings: {},
        categories: [],
        club_sites: [],
        created_at: new Date("2026-01-01T00:00:00.000Z"),
      },
    ],
    organizationUser: [
      { id: "ou-coach", organization_id: CLUB_ESISTENTE, user_id: ALLENATORE, role: "trainer", is_primary: true, created_at: new Date() },
      {
        id: "ou-segr",
        organization_id: CLUB_ESISTENTE,
        user_id: SEGRETERIA,
        role: "custom:club_manager:segreteria",
        custom_role_id: "ruolo-segreteria",
        is_primary: true,
        created_at: new Date(),
      },
    ],
    clubRole: [
      {
        id: "ruolo-segreteria",
        organization_id: CLUB_ESISTENTE,
        slug: "custom:club_manager:segreteria",
        name: "Segreteria",
        base_role: "club_manager",
        is_active: true,
      },
    ],
    clubRolePermission: [
      { id: "perm-segr", role_id: "ruolo-segreteria", permission_key: "documents.review" },
    ],
    dashboard: [],
    clubResourceItem: [],
    clubAccessScope: [],
    auditLog: [],
  };
};

let route;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  route = await import("../../src/app/api/v1/[resource]/route.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import("../../src/lib/server/prisma.ts"));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const richiesta = (token, body, headers = {}) =>
  new Request("https://local/api/v1/clubs", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `easygame_session=${token}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });

/* La forma che manda `createOwnedClub` (`buildClubPayload`). */
const corpoDiCreazione = (userId, extra = {}) => ({
  mode: "create",
  data: {
    name: "ASD Nuova",
    creator_id: userId,
    city: "Formia",
    province: "LT",
    contact_email: "club@test.invalid",
    contact_phone: "+390000000000",
    settings: { type: "ASD", types: ["ASD"] },
    memberships: [{ user_id: userId, role: "owner", is_primary: true }],
    dashboard_data: { settings: { theme: "default" } },
    ...extra,
  },
});

const crea = (token, body, headers) =>
  route.POST(richiesta(token, body, headers), { params: { resource: "clubs" } });

test("un utente senza club fonda il proprio club e ne diventa proprietario", async () => {
  const response = await crea("tok-nuovo", corpoDiCreazione(NUOVO));
  const json = await response.json();
  assert.equal(response.status, 200, JSON.stringify(json));
  assert.ok(json.data?.id);

  const club = fake.rows("club").find((riga) => riga.id === json.data.id);
  assert.equal(club.creator_id, NUOVO, "il fondatore e la sessione");
  const tessera = fake
    .rows("organizationUser")
    .find((riga) => riga.organization_id === club.id && riga.user_id === NUOVO);
  assert.equal(tessera?.role, "owner");
});

test("un allenatore di un altro club fonda il proprio, con il club attivo nell'intestazione", async () => {
  const response = await crea("tok-allenatore", corpoDiCreazione(ALLENATORE), {
    "x-active-club-id": CLUB_ESISTENTE,
    "x-active-access-role": "trainer",
  });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
});

test("un ruolo personalizzato nel club attivo non impedisce di fondarne uno proprio", async () => {
  const response = await crea("tok-segreteria", corpoDiCreazione(SEGRETERIA), {
    "x-active-club-id": CLUB_ESISTENTE,
    "x-active-access-role": "custom:club_manager:segreteria",
  });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
});

test("il club si fonda per se: un creator_id altrui e rifiutato", async () => {
  const response = await crea("tok-nuovo", corpoDiCreazione(DIREZIONE));
  assert.equal(response.status, 403);
  assert.equal(fake.rows("club").length, 1);
});

test("fondare non concede tessere ad altri: una membership altrui nel corpo e rifiutata", async () => {
  const body = corpoDiCreazione(NUOVO, {
    memberships: [
      { user_id: NUOVO, role: "owner", is_primary: true },
      { user_id: ALLENATORE, role: "club_manager" },
    ],
  });
  const response = await crea("tok-nuovo", body);
  assert.equal(response.status, 403);
  assert.equal(
    fake.rows("organizationUser").some((riga) => riga.user_id === ALLENATORE && riga.role === "club_manager"),
    false,
  );
  /* Tutto o niente: il rifiuto arriva prima di scrivere, e il club non resta (D-AC-02 chiuso). */
  assert.equal(fake.rows("club").length, 1, "nessun club rimasto a meta");
  assert.equal(fake.rows("dashboard").length, 0);
});

test("l'upsert di un club resta della direzione: chi non ha un club non riscrive quello di un altro", async () => {
  const response = await route.POST(
    richiesta("tok-nuovo", { mode: "upsert", data: { id: CLUB_ESISTENTE, name: "Preso" } }),
    { params: { resource: "clubs" } },
  );
  assert.equal(response.status, 403);
  assert.equal(fake.rows("club").find((riga) => riga.id === CLUB_ESISTENTE).name, "ASD Esistente");
});

test("l'eccezione e solo per clubs: le altre risorse riservate restano chiuse a chi non ha un club", async () => {
  for (const resource of ["organizations", "organization_users", "bank_accounts", "athletes"]) {
    const response = await route.POST(
      richiesta("tok-nuovo", { mode: "create", data: { name: "x" } }),
      { params: { resource } },
    );
    assert.equal(response.status, 403, resource);
  }
});

test("la regola vive nella matrice dei ruoli, e canAccessClubResource non cambia", async () => {
  const roles = await import("../../src/lib/access-roles.ts");
  assert.equal(roles.isOwnClubFoundation("clubs", "create"), true);
  assert.equal(roles.isOwnClubFoundation("clubs", "upsert"), false);
  assert.equal(roles.isOwnClubFoundation("organizations", "create"), false);
  assert.equal(roles.canAccessClubResource(null, "clubs", "create"), false);
  assert.equal(roles.canAccessClubResource("trainer", "clubs", "create"), false);
  assert.doesNotThrow(() => roles.assertGenericCreateAccess(null, "clubs", "create"));
  assert.throws(() => roles.assertGenericCreateAccess(null, "clubs", "upsert"), /Accesso negato/);
  assert.throws(() => roles.assertGenericCreateAccess("trainer", "bank_accounts", "create"), /Accesso negato/);
});

const conLimite = (limite) => {
  const nuovo = fake.rows("user").find((riga) => riga.id === NUOVO);
  nuovo.user_metadata = { clubSlotLimit: limite, theme: "chiaro" };
};

test("il tetto dei club si conta sul server: con gli slot esauriti la fondazione e rifiutata", async () => {
  conLimite(1);
  const primo = await crea("tok-nuovo", corpoDiCreazione(NUOVO));
  assert.equal(primo.status, 200, JSON.stringify(await primo.clone().json()));

  const secondo = await crea("tok-nuovo", corpoDiCreazione(NUOVO, { name: "ASD Seconda" }));
  const json = await secondo.json();
  assert.equal(secondo.status, 403);
  assert.match(json.error?.message || "", /slot/);
  assert.equal(fake.rows("club").filter((riga) => riga.creator_id === NUOVO).length, 1);
});

test("sotto il tetto si fonda, e senza tetto non c'e limite", async () => {
  conLimite(2);
  assert.equal((await crea("tok-nuovo", corpoDiCreazione(NUOVO))).status, 200);
  assert.equal((await crea("tok-nuovo", corpoDiCreazione(NUOVO, { name: "ASD Due" }))).status, 200);
  assert.equal((await crea("tok-nuovo", corpoDiCreazione(NUOVO, { name: "ASD Tre" }))).status, 403);

  assert.equal((await crea("tok-allenatore", corpoDiCreazione(ALLENATORE))).status, 200);
  assert.equal((await crea("tok-allenatore", corpoDiCreazione(ALLENATORE, { name: "ASD Altra" }))).status, 200);
});

test("il tetto non si alza ne si cancella da soli dal registro generico", async () => {
  /* Il proprietario di un club puo scrivere la propria riga `users` da qui: e lui il caso. */
  const direzione = fake.rows("user").find((riga) => riga.id === DIREZIONE);
  direzione.user_metadata = { clubSlotLimit: 1, theme: "chiaro" };
  const itemRoute = await import("../../src/app/api/v1/[resource]/[id]/route.ts");
  const patch = (userMetadata) =>
    itemRoute.PATCH(
      new Request(`https://local/api/v1/users/${DIREZIONE}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: "easygame_session=tok-direzione",
          "x-active-club-id": CLUB_ESISTENTE,
        },
        body: JSON.stringify({ data: { user_metadata: userMetadata } }),
      }),
      { params: { resource: "users", id: DIREZIONE } },
    );

  const alzato = await patch({ clubSlotLimit: 99, theme: "scuro" });
  assert.equal(alzato.status, 200, JSON.stringify(await alzato.clone().json()));
  let riga = fake.rows("user").find((u) => u.id === DIREZIONE);
  assert.equal(riga.user_metadata.clubSlotLimit, 1, "non si alza");
  assert.equal(riga.user_metadata.theme, "scuro", "le preferenze si scrivono");

  const svuotato = await patch({});
  assert.equal(svuotato.status, 200);
  riga = fake.rows("user").find((u) => u.id === DIREZIONE);
  assert.equal(riga.user_metadata.clubSlotLimit, 1, "non si cancella");

  /* E con il tetto pieno il proprietario non ne fonda un secondo. */
  assert.equal((await crea("tok-direzione", corpoDiCreazione(DIREZIONE))).status, 403);
});

test("il tetto: la regola pura e la stessa per area account e server", async () => {
  const slot = await import("../../src/lib/auth/club-slot-policy.ts");
  const policy = await import("../../src/lib/auth/user-metadata-policy.ts");
  assert.equal(slot.resolveClubSlotLimit({ clubSlotLimit: 3 }), 3);
  assert.equal(slot.resolveClubSlotLimit({ clubSlotLimit: "2" }), 2);
  assert.equal(slot.resolveClubSlotLimit({ clubSlotLimit: 0 }), null);
  assert.equal(slot.resolveClubSlotLimit({}), null);
  assert.equal(slot.resolveClubSlotLimit(null), null);
  assert.equal(slot.hasClubSlotAvailable(null, 50), true);
  assert.equal(slot.hasClubSlotAvailable(2, 1), true);
  assert.equal(slot.hasClubSlotAvailable(2, 2), false);
  assert.equal(policy.isProtectedUserMetadataKey("clubSlotLimit"), true);
});

test("la tessera del fondatore e owner: un ruolo a scelta sulla propria tessera e rifiutato, e il club non nasce", async () => {
  for (const role of ["custom:owner:finto", "platform_admin", "club_manager", undefined]) {
    const response = await crea(
      "tok-nuovo",
      corpoDiCreazione(NUOVO, { memberships: [{ user_id: NUOVO, ...(role ? { role } : {}) }] }),
    );
    assert.equal(response.status, 403, String(role));
  }
  assert.equal(fake.rows("club").length, 1);
  assert.equal(fake.rows("organizationUser").some((riga) => riga.user_id === NUOVO), false);
});
