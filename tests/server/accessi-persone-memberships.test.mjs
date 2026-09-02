import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Una tessera che non si puo risolvere non si elenca.**
 *
 * `GET /api/v1/auth/memberships` e cio che il browser usa per disegnare il
 * selettore dei club: `AuthProvider` ne costruisce `activeClub`, e il ruolo che
 * ne legge lo rimanda al server come `x-active-access-role`.
 *
 * La rotta elencava le tessere **grezze**. `resolveOrganizationScopeForUser`
 * invece ne scarta due famiglie (Wave 6, lane 6G):
 *
 *   * `role` con uno slug `custom:<base>:<slug>` e `custom_role_id` nullo — chi
 *     la leggesse vedrebbe il ruolo **base** senza restringimento;
 *   * `custom_role_id` che punta a un ruolo cancellato, disattivato, di un
 *     altro club, o il cui slug non corrisponde piu a `role`.
 *
 * Le due risposte si contraddicevano. Il club compariva nel menu con
 * un'etichetta ricavata dallo slug; chi lo sceglieva otteneva `activeRole:
 * null`, e — se quella era l'unica tessera del club — un club che non e
 * nemmeno in `allowedOrganizationIds`: ogni schermata vuota o negata, senza
 * che niente dicesse perche.
 *
 * Questi test riproducono le quattro forme di incoerenza e la tessera sana che
 * deve continuare a passare.
 */

const CLUB_SANO = "aaaaaaaa-6006-4000-8000-00000000000a";
const CLUB_ORFANO = "bbbbbbbb-6006-4000-8000-00000000000b";
const CLUB_ALTRUI = "cccccccc-6006-4000-8000-00000000000c";
const CLUB_SPENTO = "dddddddd-6006-4000-8000-00000000000d";
const CLUB_RINOMINATO = "eeeeeeee-6006-4000-8000-00000000000e";
const CLUB_PERSONALIZZATO = "ffffffff-6006-4000-8000-00000000000f";

const UTENTE = "11111111-6006-4000-8000-000000000aaa";
const TOKEN = "token-accessi-persone";

let route;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  route = await import("../../src/app/api/v1/auth/memberships/route.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const organizzazione = (id, nome) => ({
  id,
  name: nome,
  creator_id: null,
  settings: { seasons: [] },
  created_at: new Date("2026-01-01T00:00:00.000Z"),
});

const tessera = (id, organizationId, role, customRoleId = null) => ({
  id,
  user_id: UTENTE,
  organization_id: organizationId,
  role,
  custom_role_id: customRoleId,
  is_primary: false,
  created_at: new Date("2026-01-01T00:00:00.000Z"),
  organization: organizzazione(organizationId, `Club ${id}`),
});

const seed = () => ({
  session: [
    {
      id: "sess-accessi",
      token: TOKEN,
      user_id: UTENTE,
      expires_at: new Date(Date.now() + 3600_000),
      user: {
        id: UTENTE,
        email: "segreteria@example.invalid",
        role: "collaborator",
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        updated_at: new Date("2026-01-01T00:00:00.000Z"),
        email_verified_at: new Date("2026-01-01T00:00:00.000Z"),
      },
    },
  ],
  user: [
    { id: UTENTE, email: "segreteria@example.invalid", role: "collaborator" },
  ],
  /*
    Nessun club ha `creator_id` uguale all'utente: le righe di ownership
    resterebbero fuori dal conto e nasconderebbero cosa fa il filtro.
  */
  club: [],
  organizationUser: [
    // Sana: ruolo canonico, nessun ruolo di club.
    tessera("ou-sana", CLUB_SANO, "collaborator"),
    // Sana: ruolo personalizzato coerente in ogni sua parte.
    tessera(
      "ou-personalizzata",
      CLUB_PERSONALIZZATO,
      "custom:collaborator:segreteria",
      "cr-viva",
    ),
    // Incoerente: slug in `role`, nessun riferimento.
    tessera("ou-orfana", CLUB_ORFANO, "custom:collaborator:segreteria"),
    // Incoerente: il ruolo appartiene a un altro club.
    tessera(
      "ou-altrui",
      CLUB_ALTRUI,
      "custom:staff:magazzino",
      "cr-di-un-altro-club",
    ),
    // Incoerente: il ruolo esiste ma e disattivato.
    tessera("ou-spenta", CLUB_SPENTO, "custom:staff:magazzino", "cr-spento"),
    // Incoerente: il ruolo e stato rinominato e lo slug non combacia piu.
    tessera(
      "ou-rinominata",
      CLUB_RINOMINATO,
      "custom:collaborator:segreteria",
      "cr-rinominato",
    ),
  ],
  clubRole: [
    {
      id: "cr-viva",
      organization_id: CLUB_PERSONALIZZATO,
      slug: "custom:collaborator:segreteria",
      name: "Segreteria",
      base_role: "collaborator",
      is_active: true,
    },
    {
      id: "cr-di-un-altro-club",
      organization_id: CLUB_SANO,
      slug: "custom:staff:magazzino",
      name: "Magazzino",
      base_role: "staff",
      is_active: true,
    },
    {
      id: "cr-spento",
      organization_id: CLUB_SPENTO,
      slug: "custom:staff:magazzino",
      name: "Magazzino",
      base_role: "staff",
      is_active: false,
    },
    {
      id: "cr-rinominato",
      organization_id: CLUB_RINOMINATO,
      slug: "custom:collaborator:accoglienza",
      name: "Accoglienza",
      base_role: "collaborator",
      is_active: true,
    },
  ],
  clubRolePermission: [
    { id: "crp-1", role_id: "cr-viva", permission_key: "members.read" },
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const chiedi = () =>
  route.GET(
    new Request("https://easygame.test/api/v1/auth/memberships", {
      headers: { authorization: `Bearer ${TOKEN}` },
    }),
  );

const elenco = async () => {
  const risposta = await chiedi();
  const payload = await risposta.json();
  assert.equal(risposta.status, 200, JSON.stringify(payload));
  return payload.data || [];
};

test("le tessere coerenti restano elencate", async () => {
  const righe = await elenco();
  const ids = righe.map((riga) => riga.id);

  assert.ok(ids.includes("ou-sana"), "la tessera canonica deve restare");
  assert.ok(
    ids.includes("ou-personalizzata"),
    "un ruolo personalizzato coerente deve restare",
  );
});

test("uno slug senza riferimento non compare nel selettore", async () => {
  const righe = await elenco();

  assert.ok(
    !righe.some((riga) => riga.id === "ou-orfana"),
    "una tessera con lo slug e senza `custom_role_id` mostrerebbe il ruolo base non ristretto",
  );
  assert.ok(
    !righe.some((riga) => riga.organization_id === CLUB_ORFANO),
    "e con lei deve sparire il club che nessun'altra tessera raggiunge",
  );
});

test("un ruolo di un altro club non rende utilizzabile la tessera", async () => {
  const righe = await elenco();

  assert.ok(
    !righe.some((riga) => riga.id === "ou-altrui"),
    "il riferimento punta a un ruolo di un altro club: non risolve niente",
  );
});

test("un ruolo disattivato toglie la tessera dall'elenco", async () => {
  const righe = await elenco();

  assert.ok(
    !righe.some((riga) => riga.id === "ou-spenta"),
    "un ruolo disattivato non concede piu niente",
  );
});

test("un ruolo rinominato non vale piu per il vecchio slug", async () => {
  const righe = await elenco();

  assert.ok(
    !righe.some((riga) => riga.id === "ou-rinominata"),
    "lo slug in `role` non corrisponde piu a quello del ruolo: la riga si contraddice",
  );
});

test("l'elenco e esattamente quello che il risolutore di scope riconosce", async () => {
  const { resolveOrganizationScopeForUser } = await import(
    "../../src/lib/server/auth.ts"
  );

  const righe = await elenco();
  const clubElencati = new Set(righe.map((riga) => riga.organization_id));

  const scope = await resolveOrganizationScopeForUser(UTENTE);
  const clubAmmessi = new Set(scope.allowedOrganizationIds);

  assert.deepEqual(
    [...clubElencati].sort(),
    [...clubAmmessi].sort(),
    "il menu e il confine devono dire la stessa cosa",
  );
});

test("chi non ha nessun ruolo di club non paga letture in piu", async () => {
  fake = createFakePrisma({
    ...seed(),
    organizationUser: [tessera("ou-sana", CLUB_SANO, "collaborator")],
  });
  setPrismaClientForTests(fake.client);

  const righe = await elenco();
  assert.equal(righe.length, 1);

  /*
    Il percorso critico di ogni caricamento di pagina non deve guadagnare due
    round trip a Neon per un caso che questo utente non ha.
  */
  assert.equal(
    fake.calls.filter((chiamata) => chiamata.delegate === "clubRole").length,
    0,
  );
  assert.equal(
    fake.calls.filter(
      (chiamata) => chiamata.delegate === "clubRolePermission",
    ).length,
    0,
  );
});
