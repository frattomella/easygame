import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * **Le superfici dell'area allenatore che la Wave 6 accende.**
 *
 * Tre incoerenze della stessa famiglia — una capability completa a cui manca
 * l'ultimo metro, quello che porta una persona davanti:
 *
 * - **W6-29** — cinque chiavi `permissions.widgets.*` configurabili in
 *   `/permissions` e **zero consumatori**: un club poteva spuntarle senza che
 *   accadesse niente;
 * - **W6-30** — `/trainer-dashboard/notifications` era una pagina completa
 *   fuori dal menu e fuori dal registro delle rotte: si arrivava solo dalla
 *   campanella, e chi la chiudeva non aveva piu una strada;
 * - **W6-31** — `/trainer-dashboard/categories` esisteva e **rimandava alla
 *   home**, con la chiave di navigazione forzata a `false` un'istruzione dopo
 *   essere stata letta;
 * - **W6-32** — `sport_work.read_own` non aveva una superficie.
 *
 * Sono test sul sorgente perche la proprieta da difendere e proprio quella: la
 * rotta esiste **e** qualcuno ci arriva.
 */

const SRC = path.join(process.cwd(), "src");
const leggi = (relativo) =>
  readFileSync(path.join(SRC, ...relativo.split("/")), "utf8");
const esiste = (relativo) => existsSync(path.join(SRC, ...relativo.split("/")));

const senzaCommenti = (sorgente) =>
  sorgente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ------------------------------------------------------------------ W6-29 */

test("W6-29 · ogni chiave dei riquadri ha almeno un consumatore", () => {
  const chiavi = [
    "summary",
    "upcomingTrainings",
    "upcomingMatches",
    "assignedAthletes",
    "assignedCategories",
  ];

  const home = senzaCommenti(
    leggi("components/trainer/trainer-dashboard-home-v2-page.tsx"),
  );

  const mute = chiavi.filter(
    (chiave) => !home.includes(`permissions.widgets.${chiave}`),
  );

  assert.deepEqual(
    mute,
    [],
    "una casella che il club puo spuntare senza che accada niente promette una configurabilita che non c'e",
  );
});

/* ------------------------------------------------------------------ W6-30 */

test("W6-30 · le notifiche sono nel menu e nel registro delle rotte", () => {
  const permessi = leggi("lib/trainer-dashboard-permissions.ts");
  assert.ok(
    permessi.includes('notifications: "/trainer-dashboard/notifications"'),
    "una rotta fuori dal registro e una porta che il ripiego non sa aprire",
  );

  const sidebar = senzaCommenti(leggi("components/trainer/TrainerSidebar.tsx"));
  assert.ok(
    sidebar.includes("/trainer-dashboard/notifications"),
    "la pagina esisteva e si raggiungeva solo dalla campanella",
  );
  assert.ok(sidebar.includes("permissions.navigation.notifications"));
});

/* ------------------------------------------------------------------ W6-31 */

test("W6-31 · la pagina delle squadre non rimanda piu alla home", () => {
  const pagina = leggi("app/trainer-dashboard/categories/page.tsx");

  assert.equal(
    /redirect\(/.test(senzaCommenti(pagina)),
    false,
    "una rotta che rimanda altrove e peggio di una rotta assente: un link vecchio ci finisce dentro",
  );
  assert.ok(
    esiste("components/trainer/trainer-categories-dashboard-page.tsx"),
    "la rotta deve avere una schermata vera",
  );
});

test("W6-31 · la chiave categories non e piu forzata a false", () => {
  const permessi = senzaCommenti(leggi("lib/trainer-dashboard-permissions.ts"));

  assert.equal(
    /categories:\s*false/.test(permessi),
    false,
    "leggere la scelta del club e buttarla via una riga dopo e peggio che non offrirla",
  );
  assert.ok(leggi("components/trainer/TrainerSidebar.tsx").includes(
    "permissions.navigation.categories",
  ));
});

/* ------------------------------------------------------------------ W6-32 */

test("W6-32 · «I miei compensi» ha rotta, pagina e voce di menu", () => {
  assert.ok(esiste("app/trainer-dashboard/compensi/page.tsx"));
  assert.ok(esiste("app/api/v1/sport-work/me/route.ts"));

  const rotta = leggi("app/api/v1/sport-work/me/route.ts");
  assert.ok(
    rotta.includes('sportWorkRoute(\n  "sport_work.read_own"') ||
      rotta.includes('"sport_work.read_own"'),
    "la rotta deve chiedere la chiave del legame, non quella della direzione",
  );
  assert.equal(
    rotta.includes('"sport_work.read"'),
    false,
    "sport_work.read e della direzione: chiederla qui chiuderebbe la pagina a chi e stata scritta",
  );
  assert.equal(
    /person_id|personId/.test(senzaCommenti(rotta)),
    false,
    "non esiste un parametro per farla diventare l'elenco di un altro",
  );

  const sidebar = senzaCommenti(leggi("components/trainer/TrainerSidebar.tsx"));
  assert.ok(sidebar.includes("/trainer-dashboard/compensi"));
  assert.ok(sidebar.includes("permissions.navigation.compensation"));
});

/* ------------------------------------------------- il presidio trasversale */

/**
 * **Ogni chiave di navigazione ha una rotta, e ogni rotta una voce di menu.**
 *
 * E la forma generale dei difetti W6-30 e W6-31: una chiave senza rotta, o una
 * rotta che il menu non nomina. Enumerando invece di elencare, la voce
 * aggiunta domani non puo nascere invisibile.
 */
test("ogni voce di navigazione dell'allenatore e raggiungibile dal menu", () => {
  const permessi = leggi("lib/trainer-dashboard-permissions.ts");
  const registro = permessi.slice(
    permessi.indexOf("TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY"),
  );
  const blocco = registro.slice(0, registro.indexOf("};"));

  const rotte = [...blocco.matchAll(/(\w+):\s*"(\/trainer-dashboard[^"]*)"/g)];
  assert.ok(rotte.length >= 10, `attese almeno dieci rotte, trovate ${rotte.length}`);

  const sidebar = senzaCommenti(leggi("components/trainer/TrainerSidebar.tsx"));

  const invisibili = rotte
    .map(([, chiave, rotta]) => ({ chiave, rotta }))
    /* La home ha il suo link, senza chiave nella stessa forma testuale. */
    .filter(({ chiave }) => chiave !== "home")
    .filter(({ rotta }) => !sidebar.includes(`"${rotta}"`))
    .map(({ chiave }) => chiave);

  assert.deepEqual(
    invisibili,
    [],
    "queste rotte esistono e nessuna voce di menu ci porta",
  );

  for (const [, , rotta] of rotte) {
    const relativa = rotta.replace(/^\//, "").split("/");
    assert.ok(
      esiste(path.join("app", ...relativa, "page.tsx")),
      `${rotta} e nel registro e non ha una pagina`,
    );
  }
});
