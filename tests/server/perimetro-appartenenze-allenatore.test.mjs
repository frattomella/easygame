import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **La squadra dell'allenatore sta nelle appartenenze** (P0-5, P0-6).
 *
 * La categoria di un atleta vive in `athlete_category_memberships` — la
 * tabella vera, ADR-0038 — e non nel campo di comodita della scheda: e cio che
 * l'iscrizione scrive, ed e la strada normale. Il perimetro dell'allenatore
 * quelle righe le caricava **solo** per chi ha dei gruppi dichiarati; per tutti
 * gli altri — cioe per la ricaduta documentata sulla sola categoria —
 * rispondeva sui campi della scheda.
 *
 * Misurato su un club vero: l'allenatore dei suoi quindici Under 15 ne vedeva
 * **tre**, quelli che avevano *anche* il campo di comodita valorizzato. Da
 * quell'elenco si aprono il registro presenze e le convocazioni, quindi
 * l'appello di una squadra intera si apriva su tre nomi.
 *
 * Falliva chiuso — non e mai stata una fuga — ma un confine che nasconde due
 * terzi della squadra al suo allenatore non e un confine: e una superficie
 * rotta.
 *
 * Il secondo test guarda l'altra meta del difetto: la bacheca **rifa** il
 * conto nel browser (la stessa schermata la puo aprire il club per un altro
 * allenatore, e allora il server manda l'organico intero), e senza le
 * appartenenze nel payload il browser rispondeva peggio del server.
 */

const CLUB = "aaaaaaaa-a500-4000-8000-00000000000a";
const MISTER = "11111111-a500-4000-8000-00000000000b";
const DIREZIONE = "11111111-a500-4000-8000-00000000000c";

const U15 = "cat-u15";
const U12 = "cat-u12";

/** Nella squadra del mister **solo** per la riga di appartenenza. */
const PER_APPARTENENZA = "bbbbbbbb-a500-4000-8000-000000000001";
/** Nella stessa squadra anche per il campo di comodita: passava gia prima. */
const PER_CAMPO = "bbbbbbbb-a500-4000-8000-000000000002";
/** Di un'altra squadra, per appartenenza: non deve entrare. */
const DI_UN_ALTRA = "bbbbbbbb-a500-4000-8000-000000000003";

let risorse;
let setPrismaClientForTests;
let fake;

const scopeAllenatore = () => ({
  userId: MISTER,
  activeOrganizationId: CLUB,
  activeRole: "trainer",
  allowedOrganizationIds: [CLUB],
  accessScopes: [],
});

const scopeDirezione = () => ({
  userId: DIREZIONE,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
  accessScopes: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  risorse = await import("../../src/lib/server/resources.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const atleta = (id, nome, categoryId) => ({
  id,
  organization_id: CLUB,
  first_name: nome,
  last_name: "Prova",
  status: "active",
  /* Il campo di comodita, che qui e vuoto apposta salvo dove serve. */
  category_id: categoryId,
  data: {},
});

const appartenenza = (id, athleteId, categoryId, categoryName) => ({
  id,
  organization_id: CLUB,
  athlete_id: athleteId,
  category_id: categoryId,
  category_name: categoryName,
  is_primary: true,
  site_id: null,
});

const seme = () => ({
  user: [
    { id: MISTER, email: "mister@club.it" },
    { id: DIREZIONE, email: "direzione@club.it" },
  ],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      creator_id: DIREZIONE,
      categories: [
        { id: U15, name: "Under 15" },
        { id: U12, name: "Under 12" },
      ],
      club_sites: [],
      category_groups: [],
      trainers: [
        {
          id: "scheda-mister",
          email: "mister@club.it",
          linkedUserId: MISTER,
          /* Solo categorie: nessun gruppo dichiarato, che e la ricaduta. */
          categories: [U15],
        },
      ],
      staff_members: [],
    },
  ],
  athlete: [
    atleta(PER_APPARTENENZA, "Anna", null),
    atleta(PER_CAMPO, "Bruno", U15),
    atleta(DI_UN_ALTRA, "Carla", null),
  ],
  athleteCategoryMembership: [
    appartenenza("m1", PER_APPARTENENZA, U15, "Under 15"),
    appartenenza("m2", PER_CAMPO, U15, "Under 15"),
    appartenenza("m3", DI_UN_ALTRA, U12, "Under 12"),
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seme());
  setPrismaClientForTests(fake.client);
});

const elenco = async (scope, parametri = {}) => {
  const { records } = await risorse.listResourcePage(
    "athletes",
    new URLSearchParams({ organization_id: CLUB, ...parametri }),
    scope,
  );
  return records;
};

test("l'atleta legato alla squadra dalla sola appartenenza entra nel perimetro", async () => {
  const righe = await elenco(scopeAllenatore());
  const ids = righe.map((riga) => String(riga.id)).sort();

  assert.deepEqual(
    ids,
    [PER_APPARTENENZA, PER_CAMPO].sort(),
    "la squadra e quella delle appartenenze, non quella del campo di comodita",
  );
});

test("l'appartenenza a un'altra squadra resta fuori", async () => {
  /*
    La correzione allarga cio che l'allenatore vede, e va misurato che non
    allarghi **oltre** la propria categoria: sarebbe il difetto opposto, e
    quello sarebbe una fuga.
  */
  const righe = await elenco(scopeAllenatore());

  assert.ok(
    !righe.some((riga) => String(riga.id) === DI_UN_ALTRA),
    "un'appartenenza a Under 12 non e un atleta di chi allena gli Under 15",
  );
});

test("la bacheca riceve le appartenenze con cui il server ha deciso", async () => {
  const righe = await elenco(scopeAllenatore(), { trainer_dashboard: "1" });

  for (const riga of righe) {
    assert.ok(
      Array.isArray(riga.category_memberships),
      `la riga ${riga.id} deve portare le proprie appartenenze`,
    );
  }

  const anna = righe.find((riga) => String(riga.id) === PER_APPARTENENZA);
  assert.deepEqual(
    (anna?.category_memberships || []).map((voce) => voce.category_id),
    [U15],
    "senza questa riga il browser rifa il conto con meno informazioni del server",
  );
});

test("il club che apre la bacheca di un allenatore riceve le stesse appartenenze", async () => {
  /*
    La stessa schermata la apre il club per **un altro** allenatore: li il
    server manda l'organico intero e a restringere e il browser. Se le
    appartenenze uscissero solo per il ruolo `trainer`, quella vista
    resterebbe rotta con la correzione applicata accanto.
  */
  const righe = await elenco(scopeDirezione(), { trainer_dashboard: "1" });

  assert.equal(righe.length, 3, "il club vede tutto l'organico");
  for (const riga of righe) {
    assert.ok(
      Array.isArray(riga.category_memberships),
      `la riga ${riga.id} deve portare le proprie appartenenze anche qui`,
    );
  }
});

test("la pagina Atleti non paga le appartenenze che non ha chiesto", async () => {
  /*
    Il parametro esiste per non appesantire l'elenco generale, che di righe ne
    chiede duecento per volta (R-02).
  */
  const righe = await elenco(scopeDirezione());

  assert.ok(
    righe.every((riga) => riga.category_memberships === undefined),
    "senza `trainer_dashboard=1` il payload resta quello di prima",
  );
});
