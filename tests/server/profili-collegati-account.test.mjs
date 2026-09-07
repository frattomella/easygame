import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import { readFileSync } from "node:fs";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Chi sei dentro un club, non solo dove puoi entrare** (P0 «pagina Account»).
 *
 * `GET /api/v1/auth/memberships` restituiva `linked_athlete_ids`: degli
 * identificativi, abbastanza perche la guardia d'area decida **dove** il
 * browser puo andare, e non abbastanza perche una schermata dica a una persona
 * **chi e** li dentro. La pagina Account mostrava «Genitore» a chi ha due
 * figli, «Atleta» a chi ha una scheda, «Allenatore» a chi ne ha un'altra, e
 * nessuno dei tre nomi.
 *
 * Questi test misurano le tre forme del legame e i due modi in cui la risposta
 * potrebbe dire troppo: la scheda allenatore di **un'altra persona** nello
 * stesso club, e i campi dell'anagrafica che non devono uscire.
 */

const CLUB_FAMIGLIA = "aaaa1111-9001-4000-8000-000000000001";
const CLUB_ATLETA = "bbbb2222-9001-4000-8000-000000000002";
const CLUB_ALLENATORE = "cccc3333-9001-4000-8000-000000000003";

const UTENTE = "dddd4444-9001-4000-8000-000000000004";
const FIGLIA = "eeee5555-9001-4000-8000-000000000005";
const PROPRIA_SCHEDA = "ffff6666-9001-4000-8000-000000000006";
const UN_ALTRO = "00007777-9001-4000-8000-000000000007";

const EMAIL = "paolo@famiglia.invalid";
const TOKEN = "token-profili-collegati";

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

const club = (id, nome) => ({
  id,
  name: nome,
  creator_id: null,
  settings: { seasons: [] },
  created_at: new Date("2026-01-01T00:00:00.000Z"),
});

const tessera = (id, organizationId, role) => ({
  id,
  user_id: UTENTE,
  organization_id: organizationId,
  role,
  custom_role_id: null,
  is_primary: false,
  created_at: new Date("2026-01-01T00:00:00.000Z"),
  organization: club(organizationId, `Club ${id}`),
});

const seme = () => ({
  session: [
    {
      id: "sess-profili",
      token: TOKEN,
      user_id: UTENTE,
      expires_at: new Date(Date.now() + 3600_000),
      user: {
        id: UTENTE,
        email: EMAIL,
        role: "parent",
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        updated_at: new Date("2026-01-01T00:00:00.000Z"),
        email_verified_at: new Date("2026-01-01T00:00:00.000Z"),
      },
    },
  ],
  user: [
    {
      id: UTENTE,
      email: EMAIL,
      role: "parent",
      email_verified_at: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  club: [
    club(CLUB_FAMIGLIA, "ASD Famiglia"),
    club(CLUB_ATLETA, "ASD Atleta"),
    club(CLUB_ALLENATORE, "ASD Allenatore"),
  ],
  organizationUser: [
    tessera("ou-parent", CLUB_FAMIGLIA, "parent"),
    tessera("ou-athlete", CLUB_ATLETA, "athlete"),
    tessera("ou-trainer", CLUB_ALLENATORE, "trainer"),
  ],
  athlete: [
    {
      id: FIGLIA,
      organization_id: CLUB_FAMIGLIA,
      first_name: "Giulia",
      last_name: "Bianchi",
      status: "active",
      user_id: null,
      data: {},
    },
    {
      id: PROPRIA_SCHEDA,
      organization_id: CLUB_ATLETA,
      first_name: "Paolo",
      last_name: "Prova",
      status: "active",
      user_id: UTENTE,
      data: {},
    },
  ],
  athleteGuardian: [
    {
      id: "ag-figlia",
      organization_id: CLUB_FAMIGLIA,
      athlete_id: FIGLIA,
      identity_key: UTENTE,
      user_id: UTENTE,
      email: EMAIL,
      name: "Paolo",
      contact_only: false,
      revoked_at: null,
    },
  ],
  clubResourceItem: [
    {
      id: "cri-mia",
      organization_id: CLUB_ALLENATORE,
      resource_type: "trainers",
      payload: {
        id: "t-mio",
        name: "Paolo",
        surname: "Prova",
        linkedUserId: UTENTE,
      },
    },
    {
      id: "cri-altrui",
      organization_id: CLUB_ALLENATORE,
      resource_type: "trainers",
      payload: {
        id: "t-altro",
        name: "Marco",
        surname: "Rossi",
        linkedUserId: UN_ALTRO,
      },
    },
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seme());
  setPrismaClientForTests(fake.client);
});

const tessere = async () => {
  const risposta = await route.GET(
    new Request("https://easygame.test/api/v1/auth/memberships", {
      headers: { authorization: `Bearer ${TOKEN}` },
    }),
  );
  const payload = await risposta.json();
  assert.equal(risposta.status, 200, JSON.stringify(payload));
  return payload.data || [];
};

const per = (righe, id) => righe.find((riga) => riga.id === id);

test("il genitore riceve il nome dei figli, non i loro identificativi", async () => {
  const righe = await tessere();
  const profili = per(righe, "ou-parent")?.linked_profiles;

  assert.deepEqual(profili, [
    { kind: "guardian", id: FIGLIA, name: "Giulia Bianchi" },
  ]);
});

test("l'atleta riceve la propria scheda, e con il tipo giusto", async () => {
  const righe = await tessere();
  const profili = per(righe, "ou-athlete")?.linked_profiles;

  assert.deepEqual(profili, [
    { kind: "athlete", id: PROPRIA_SCHEDA, name: "Paolo Prova" },
  ]);
});

test("l'allenatore riceve la propria scheda allenatore", async () => {
  const righe = await tessere();
  const profili = per(righe, "ou-trainer")?.linked_profiles;

  assert.deepEqual(profili, [
    { kind: "trainer", id: CLUB_ALLENATORE, name: "Paolo Prova" },
  ]);
});

test("la scheda allenatore di un altro non entra nella risposta", async () => {
  /*
    Il club ne ha due, e il legame e `linkedUserId`: se il filtro cadesse, la
    risposta direbbe a questa persona che e Marco Rossi — e il nome di un
    terzo, non un dettaglio estetico.
  */
  const righe = await tessere();
  const nomi = (per(righe, "ou-trainer")?.linked_profiles || []).map(
    (profilo) => profilo.name,
  );

  assert.ok(
    !nomi.includes("Marco Rossi"),
    "la scheda di un'altra persona non e un profilo collegato",
  );
});

test("del profilo escono tre chiavi e nessun campo di anagrafica", async () => {
  const righe = await tessere();
  const tutti = righe.flatMap((riga) => riga.linked_profiles || []);

  assert.ok(tutti.length >= 3, "i tre legami devono esserci tutti");
  for (const profilo of tutti) {
    assert.deepEqual(
      Object.keys(profilo).sort(),
      ["id", "kind", "name"],
      "un profilo collegato dice chi sei, non che cosa c'e sulla scheda",
    );
  }
});

test("una tessera senza legami porta un elenco vuoto, non l'assenza della chiave", async () => {
  /*
    La card legge `club.linkedProfiles?.length`: un `undefined` funzionerebbe
    lo stesso, ma un contratto che a volte porta la chiave e a volte no e cio
    che ha gia prodotto la riga `linked_athlete_ids` letta come booleano.
  */
  fake = createFakePrisma({
    ...seme(),
    athleteGuardian: [],
    athlete: [],
    clubResourceItem: [],
  });
  setPrismaClientForTests(fake.client);

  const righe = await tessere();
  for (const riga of righe) {
    assert.ok(
      Array.isArray(riga.linked_profiles),
      `la tessera ${riga.id} deve portare comunque l'elenco`,
    );
    assert.equal(riga.linked_profiles.length, 0);
  }
});

test("la card dell'account mostra i profili e li manda a capo", () => {
  /*
    **La superficie, non solo il contratto** (CLAUDE.md §11.8).

    Il payload esisteva gia in altra forma — `linked_athlete_ids` — e nessuna
    schermata lo diceva. E il nodo che lo mostra non puo essere `truncate`: a
    375 px un nodo che non va a capo alza la larghezza minima della colonna
    della griglia, e l'intera pagina Account scorreva in orizzontale (misurato:
    `scrollWidth` 457 su un viewport di 375).
  */
  const sorgente = readFileSync(
    "src/components/account/account-home-screen.tsx",
    "utf8",
  );

  const inizio = sorgente.indexOf('data-testid="profili-collegati"');
  assert.ok(inizio > 0, "la card deve mostrare i profili collegati");

  const blocco = sorgente.slice(inizio - 400, inizio + 900);
  assert.ok(
    blocco.includes("club.linkedProfiles"),
    "e deve leggerli dal club, non ricostruirli",
  );
  assert.ok(
    !/className="[^"]*\btruncate\b[^"]*"/.test(blocco),
    "nessun nodo troncato: a 375 px farebbe scorrere la pagina in orizzontale",
  );
  assert.ok(blocco.includes("break-words"), "i nomi vanno a capo");
});
