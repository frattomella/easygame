import assert from "node:assert/strict";
import test, { afterEach, before, beforeEach } from "node:test";

/**
 * **Un record marcato con una stagione che il club non ha.**
 *
 * E il difetto 2 del Full Club UAT: una categoria e i suoi gruppi marcati
 * `seasonId: "season-2026-2027"` su un club il cui `settings.seasons` e vuoto.
 * Quell'id e quello della stagione **sintetizzata** in lettura per non
 * lasciare l'interfaccia senza perimetro; il giorno in cui il club crea la sua
 * prima stagione vera, la sintetizzata sparisce e quei record non appartengono
 * piu a nessuna annata. Sparivano da ogni schermata, in silenzio.
 *
 * La correzione era stata applicata al **solo** percorso del server
 * (`listResourcePage`). La seconda revisione ha trovato che il browser ha un
 * suo percorso di lettura — `getClubData`, che meta applicazione usa — e che
 * li la regola non c'era: lo stesso club mostrava due elenchi diversi a
 * seconda di quale strada avesse preso la pagina.
 *
 * Due regole, le stesse su tutti e due i lati:
 *
 * 1. finche il club non ha **nessuna** stagione salvata non si filtra: quella
 *    che si legge e sintetizzata, non e un dato, e usarla come perimetro
 *    nasconde i record che portano un altro id;
 * 2. un `seasonId` che nomina una stagione che il club **non ha** e un record
 *    orfano, non un record di un'altra annata: si mostra accanto a quelli
 *    senza annata. Le stagioni vere di altre annate restano escluse.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const MANDATORY = ["id", "slug", "name", "settings"];

const SEASON_VERA = "season-2027-09-01-2028-06-30-abc";
const SEASON_FANTASMA = "season-2026-2027";
const SEASON_ALTRA = "season-2025-09-01-2026-06-30-xyz";

let db;
let fetchOriginale;
let windowOriginale;
let club;

before(async () => {
  db = await import("../../src/lib/simplified-db.ts");
});

const categorie = () => [
  { id: "cat-orfana", name: "Pulcini", seasonId: SEASON_FANTASMA },
  { id: "cat-attuale", name: "Esordienti", seasonId: SEASON_VERA },
  { id: "cat-senza", name: "Prima squadra" },
  { id: "cat-altra-annata", name: "Allievi 2025", seasonId: SEASON_ALTRA },
];

beforeEach(() => {
  club = {
    id: CLUB,
    slug: "club",
    name: "Club",
    settings: {},
    categories: categorie(),
  };

  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    key: () => null,
    length: 0,
  };
  windowOriginale = globalThis.window;
  globalThis.window = { localStorage: storage, sessionStorage: storage };

  fetchOriginale = globalThis.fetch;
  globalThis.fetch = async (path) => {
    const url = new URL(String(path), "https://local");
    const fields = url.searchParams.get("fields");
    const keys = new Set([
      ...MANDATORY,
      ...(fields || "").split(",").map((field) => field.trim()),
    ]);

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        data: [
          Object.fromEntries(
            Object.entries(club).filter(([key]) => keys.has(key)),
          ),
        ],
        error: null,
      }),
    };
  };
});

afterEach(() => {
  globalThis.fetch = fetchOriginale;
  globalThis.window = windowOriginale;
});

const nomi = (records) => records.map((record) => record.id).sort();

test("un club senza stagioni salvate non filtra niente", async () => {
  /*
    `settings.seasons` vuoto: la stagione che si legge e sintetizzata. Filtrare
    su di essa nascondeva le tre categorie che portano un id diverso — e le
    nasconde su un club dove *nessuno* ha mai scelto un'annata.
  */
  const categories = await db.getClubData(CLUB, "categories");

  assert.deepEqual(nomi(categories), [
    "cat-altra-annata",
    "cat-attuale",
    "cat-orfana",
    "cat-senza",
  ]);
});

const stagioneVera = () => ({
  id: SEASON_VERA,
  label: "2027/2028",
  startDate: "2027-09-01",
  endDate: "2028-06-30",
  status: "active",
});

const stagioneAltra = (status = "archived") => ({
  id: SEASON_ALTRA,
  label: "2025/2026",
  startDate: "2025-09-01",
  endDate: "2026-06-30",
  status,
});

test("con una sola stagione salvata l'orfano non sparisce", async () => {
  /*
    Il club ha creato la sua prima stagione vera. La sintetizzata non esiste
    piu, e le categorie marcate con il suo id non appartengono a nessuna
    annata: prima di questa correzione venivano scartate come «di un'altra
    stagione» e sparivano da ogni schermata senza che nulla lo dicesse.

    `cat-altra-annata` compare per la stessa ragione: quella stagione il club
    non ce l'ha, quindi anche quello e un orfano.
  */
  club.settings = { activeSeasonId: SEASON_VERA, seasons: [stagioneVera()] };

  const categories = await db.getClubData(CLUB, "categories");

  assert.deepEqual(nomi(categories), [
    "cat-altra-annata",
    "cat-attuale",
    "cat-orfana",
    "cat-senza",
  ]);
});

/**
 * Un orfano segue la regola dei record **senza annata**, che WP-32 attribuisce
 * alla stagione piu vecchia del club. Non e una deroga inventata qui: e la
 * stessa riga, e vale nei due sensi.
 */
test("una stagione vera di un'altra annata resta esclusa, l'orfano no", async () => {
  club.settings = {
    /* La piu vecchia e la baseline, ed e quella attiva. */
    activeSeasonId: SEASON_ALTRA,
    seasons: [stagioneVera(), stagioneAltra("active")],
  };

  const categories = await db.getClubData(CLUB, "categories");

  assert.equal(
    categories.some((record) => record.id === "cat-attuale"),
    false,
    "quella stagione il club ce l'ha: il record e di un'altra annata, e resta fuori",
  );
  assert.equal(
    categories.some((record) => record.id === "cat-orfana"),
    true,
    "l'orfano no: sta con i record senza annata, che qui sono in casa",
  );
  assert.equal(
    categories.some((record) => record.id === "cat-senza"),
    true,
  );
});

/**
 * E il rovescio: quando l'annata attiva **non** e la baseline, i record senza
 * stagione — orfani compresi — restano fuori, come prima. La correzione
 * riclassifica l'orfano, non gli da un salvacondotto.
 */
test("fuori dalla baseline l'orfano segue i record senza annata", async () => {
  club.settings = {
    activeSeasonId: SEASON_VERA,
    seasons: [stagioneVera(), stagioneAltra()],
  };

  const categories = await db.getClubData(CLUB, "categories");

  assert.deepEqual(nomi(categories), ["cat-attuale"]);
});

test("una collezione non soggetta a stagione non viene toccata", async () => {
  club.trainers = [{ id: "trainer-1", name: "Mario", seasonId: SEASON_FANTASMA }];

  const trainers = await db.getClubData(CLUB, "trainers");

  assert.deepEqual(nomi(trainers), ["trainer-1"]);
});
