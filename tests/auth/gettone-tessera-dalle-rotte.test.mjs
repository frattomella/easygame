import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Il ruolo che esce dalle due rotte delle tessere accende i permessi.**
 *
 * Chiude la dependency che PP-03 ha registrato verso PP-05: le due rotte
 * emettevano `organization_users.role` **grezzo**, cioe lo **slug** di un ruolo
 * personalizzato. Il browser lo salva in `activeClub.role` e poi chiede
 * `roleHasPermission(activeClub.role, chiave)` — e uno slug senza `#` porta
 * `permissions: []`, quindi **ogni** ruolo personalizzato riceveva `false` su
 * **ogni** chiave lato interfaccia. Le caselle spuntate nella schermata dei
 * ruoli non accendevano niente.
 *
 * Il difetto **falliva chiuso**: il server decide sempre con
 * `scope.activeRole`, che il gettone ce l'ha. Non usciva nessun dato e non
 * passava nessuna scrittura — mancava la superficie.
 *
 * Qui si chiamano i due `POST`/`GET` veri. Cio che il doppio non rappresenta —
 * la coerenza fra `organization_users`, `club_roles` e `club_role_permissions`
 * letta da PostgreSQL — sta nella sonda
 * `scripts/pp-05-gettone-tessera-probe.mjs` (G1-G5, verificata per mutazione).
 */

const UTENTE = "55555555-0000-4000-8000-0000000000ee";
const PROPRIETARIO = "66666666-0000-4000-8000-0000000000ff";
const CLUB = "77777777-0000-4000-8000-000000000011";
const CLUB_CANONICO = "88888888-0000-4000-8000-000000000022";
const RUOLO = "99999999-0000-4000-8000-000000000033";
const TESSERA = "aaaaaaaa-0000-4000-8000-000000000044";
const GETTONE_SESSIONE = "sessione-di-chi-ha-un-ruolo-di-club";
const SLUG = "custom:club_manager:segreteria";
/* Il doppio non applica i default dello schema: le date le mette il seme. */
const QUANDO = new Date("2026-01-01T00:00:00.000Z");

/** Una concessa al ruolo di club, una no: senza il contrasto non si misura. */
const CHIAVE_CONCESSA = "documents.review";
const CHIAVE_NEGATA = "accounts.athlete.manage";

let elenco;
let attiva;
let roleHasPermission;
let setPrismaClientForTests;
let fake;

const club = (id, nome) => ({
  id,
  name: nome,
  slug: nome.toLowerCase().replace(/\s+/g, "-"),
  creator_id: PROPRIETARIO,
  settings: {},
});

const seed = () => ({
  user: [
    {
      id: UTENTE,
      email: "tessera@example.invalid",
      email_verified_at: QUANDO,
      created_at: QUANDO,
      updated_at: QUANDO,
    },
    {
      id: PROPRIETARIO,
      email: "proprietario@example.invalid",
      created_at: QUANDO,
      updated_at: QUANDO,
    },
  ],
  club: [club(CLUB, "Club con ruoli"), club(CLUB_CANONICO, "Club canonico")],
  clubRole: [
    {
      id: RUOLO,
      organization_id: CLUB,
      slug: SLUG,
      name: "Segreteria",
      base_role: "club_manager",
      is_active: true,
      created_at: QUANDO,
      updated_at: QUANDO,
    },
  ],
  clubRolePermission: [
    {
      id: "perm-1",
      role_id: RUOLO,
      permission_key: CHIAVE_CONCESSA,
      created_at: QUANDO,
    },
  ],
  organizationUser: [
    {
      id: TESSERA,
      organization_id: CLUB,
      user_id: UTENTE,
      role: SLUG,
      custom_role_id: RUOLO,
      is_primary: true,
      created_at: QUANDO,
      updated_at: QUANDO,
    },
    {
      id: "tessera-canonica",
      organization_id: CLUB_CANONICO,
      user_id: UTENTE,
      role: "trainer",
      custom_role_id: null,
      is_primary: false,
      created_at: QUANDO,
      updated_at: QUANDO,
    },
  ],
  session: [
    {
      id: "sessione",
      token: GETTONE_SESSIONE,
      user_id: UTENTE,
      expires_at: new Date(Date.now() + 3600 * 1000),
      created_at: QUANDO,
      /*
        Il doppio non idrata le relazioni di `include`: l'utente sta **dentro**
        la riga, e porta le date perche `serializeAuthUser` le formatta.
      */
      user: {
        id: UTENTE,
        email: "tessera@example.invalid",
        email_verified_at: QUANDO,
        created_at: QUANDO,
        updated_at: QUANDO,
      },
    },
  ],
  clubAccessScope: [],
  athlete: [],
  auditLog: [],
});

const richiesta = (url, corpo) =>
  new Request(url, {
    method: corpo ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      cookie: `easygame_session=${GETTONE_SESSIONE}`,
    },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";

  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
  ({ roleHasPermission } = await import("../../src/lib/permissions/catalog.ts"));
  ({ GET: elenco } = await import(
    "../../src/app/api/v1/auth/memberships/route.ts"
  ));
  ({ POST: attiva } = await import(
    "../../src/app/api/v1/auth/memberships/activate/route.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

/** La riga di un club nell'elenco, qualunque forma abbia l'involucro. */
const rigaDelClub = (corpo, organizationId) => {
  const righe = corpo?.data?.memberships || corpo?.data || [];
  return (Array.isArray(righe) ? righe : []).find(
    (r) => r.organization_id === organizationId && r.access_kind === "membership",
  );
};

test("l'elenco delle tessere emette il gettone, e il gettone accende le chiavi concesse", async () => {
  const corpo = await (
    await elenco(richiesta("http://easygame.local/api/v1/auth/memberships"))
  ).json();

  const riga = rigaDelClub(corpo, CLUB);
  assert.ok(riga, "la tessera personalizzata deve comparire nell'elenco");
  assert.equal(riga.role, `${SLUG}#${CHIAVE_CONCESSA}`);

  /*
    **Questa e la proprieta per cui la dependency esiste.** Il valore che il
    browser salva deve rispondere `true` alla chiave concessa: con lo slug nudo
    — la forma precedente — rispondeva `false`, e con lui ogni schermata che
    quel permesso governa spariva.
  */
  assert.equal(roleHasPermission(riga.role, CHIAVE_CONCESSA), true);
  assert.equal(
    roleHasPermission(riga.role, CHIAVE_NEGATA),
    false,
    "e solo quelle: il gettone porta le chiavi ristrette, non quelle del ruolo base",
  );
  assert.equal(
    roleHasPermission(SLUG, CHIAVE_CONCESSA),
    false,
    "controspecchio: con lo slug nudo il permesso era spento, ed e il difetto misurato da PP-03",
  );
});

test("una tessera canonica resta al proprio nome: il gettone non compare dove non serve", async () => {
  const corpo = await (
    await elenco(richiesta("http://easygame.local/api/v1/auth/memberships"))
  ).json();

  const riga = rigaDelClub(corpo, CLUB_CANONICO);
  assert.ok(riga);
  assert.equal(riga.role, "trainer");
  assert.equal(
    roleHasPermission(riga.role, "events.read"),
    true,
    "e risponde come il ruolo canonico che e: nessun gettone, nessun restringimento",
  );
});

test("l'attivazione emette lo stesso gettone, e `resolved_role` resta la base", async () => {
  const corpo = await (
    await attiva(
      richiesta("http://easygame.local/api/v1/auth/memberships/activate", {
        organization_id: CLUB,
        membership_id: TESSERA,
      }),
    )
  ).json();

  assert.equal(corpo?.data?.role, `${SLUG}#${CHIAVE_CONCESSA}`);
  assert.equal(
    corpo?.data?.resolved_role,
    "club_manager",
    "i due campi rispondono a due domande diverse e servono entrambi",
  );
  assert.equal(roleHasPermission(corpo.data.role, CHIAVE_CONCESSA), true);
});
