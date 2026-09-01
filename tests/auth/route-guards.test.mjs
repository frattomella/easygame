import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { canAccessPath, getPathAccessArea } from "../../src/lib/access-roles.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..", "..");
const APP_DIR = path.join(PROJECT_ROOT, "src", "app");

/**
 * Aree di gestione: ogni prefisso deve avere un layout che monta
 * AccessAreaGuard, altrimenti la shell resta raggiungibile da un ruolo che non
 * dovrebbe vederla. Vedi 08-roles-and-permissions.md e WP-03.
 */
const MANAGEMENT_ROUTE_DIRS = [
  "athletes",
  "categories",
  "clothing",
  "create-club",
  "dashboard",
  "hub",
  "matches",
  "medical",
  "modulistica",
  "movements",
  "notifications",
  "organization",
  "payments",
  "permissions",
  "procura",
  "registration-management",
  "reports",
  "secretariat",
  "settings",
  "soci",
  "sponsors",
  "staff",
  "structures",
  "trainers",
  "training",
];

const GUARDED_NON_MANAGEMENT_LAYOUTS = [
  path.join("trainer-dashboard", "layout.tsx"),
  path.join("parent-view", "[id]", "layout.tsx"),
  path.join("athletes", "[id]", "profile", "layout.tsx"),
];

const readLayout = (relativePath) => {
  const filePath = path.join(APP_DIR, relativePath);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
};

const mountsGuard = (source) =>
  source !== null &&
  (source.includes("AccessAreaGuard") ||
    source.includes("management-area-layout"));

test("ogni area di gestione monta un guard di route", () => {
  const senzaGuard = [];

  for (const dir of MANAGEMENT_ROUTE_DIRS) {
    if (!fs.existsSync(path.join(APP_DIR, dir))) continue;
    if (!mountsGuard(readLayout(path.join(dir, "layout.tsx")))) {
      senzaGuard.push(dir);
    }
  }

  assert.deepEqual(
    senzaGuard,
    [],
    `aree di gestione senza AccessAreaGuard: ${senzaGuard.join(", ")}`,
  );
});

test("le aree trainer, genitore e atleta restano protette", () => {
  for (const relativePath of GUARDED_NON_MANAGEMENT_LAYOUTS) {
    assert.equal(
      mountsGuard(readLayout(relativePath)),
      true,
      `manca il guard in ${relativePath}`,
    );
  }
});

test("il middleware protegge tutti i prefissi di gestione", () => {
  const middleware = fs.readFileSync(
    path.join(PROJECT_ROOT, "src", "middleware.ts"),
    "utf8",
  );

  const mancanti = MANAGEMENT_ROUTE_DIRS.filter(
    (dir) => !middleware.includes(`"/${dir}"`),
  );
  assert.deepEqual(
    mancanti,
    [],
    `prefissi assenti dal middleware: ${mancanti.join(", ")}`,
  );

  for (const prefix of ["/trainer-dashboard", "/parent-view", "/account", "/private"]) {
    assert.ok(
      middleware.includes(`"${prefix}"`),
      `il middleware non protegge ${prefix}`,
    );
  }

  // I flussi che devono ancora creare la sessione non vanno intercettati.
  assert.ok(middleware.includes('"/token-verification"'));
  assert.ok(middleware.includes('"/auth/complete"'));

  /*
    **Le API devono restituire 401 JSON, non un redirect** — e resta vero, ma
    non lo dice piu il matcher.

    Fino alla Wave 6 il matcher escludeva `/api` del tutto, e questa riga
    cercava `(?!api|`. Dalla lane 6I le API **entrano** nel middleware, per una
    ragione che non c'entra con l'autenticazione: e l'unico punto in cui
    l'identificativo di richiesta puo essere generato una volta sola per tutte
    le righe di log della stessa richiesta (§16 del piano). Il cancello non le
    tocca — il ramo `/api` prosegue prima di ogni controllo — e la garanzia si
    verifica dove vale davvero, cioe sul comportamento:
    `tests/server/identificativo-di-richiesta.test.mjs`.
  */
  assert.ok(
    middleware.includes('pathname.startsWith("/api/")'),
    "il middleware deve lasciar proseguire le API senza redirect",
  );
});

test("il guard di area classifica correttamente ogni prefisso di gestione", () => {
  for (const dir of MANAGEMENT_ROUTE_DIRS) {
    assert.equal(
      getPathAccessArea(`/${dir}`),
      "management",
      `/${dir} non e classificata come area di gestione`,
    );
  }
});

test("montare il guard piu in alto non cambia l'esito: dipende dal pathname", () => {
  // /athletes e area management, ma /athletes/:id/profile resta area atleta.
  assert.equal(getPathAccessArea("/athletes"), "management");
  assert.equal(getPathAccessArea("/athletes/abc/profile"), "athlete");

  // Un atleta non entra nella lista atleti del club...
  assert.equal(canAccessPath("athlete", "/athletes"), false);
  // ...ma entra nel proprio profilo, anche con il guard montato su /athletes.
  assert.equal(
    canAccessPath("athlete", "/athletes/abc/profile", { linkedAthleteId: "abc" }),
    true,
  );
  // e non in quello di un altro.
  assert.equal(
    canAccessPath("athlete", "/athletes/xyz/profile", { linkedAthleteId: "abc" }),
    false,
  );
});

test("i ruoli non di gestione non accedono alle aree di gestione", () => {
  const areeSensibili = [
    "/payments",
    "/movements",
    "/reports",
    "/soci",
    "/sponsors",
    "/secretariat",
    "/registration-management",
  ];

  for (const area of areeSensibili) {
    for (const role of ["trainer", "parent", "athlete", ""]) {
      assert.equal(
        canAccessPath(role, area),
        false,
        `${role || "(nessun ruolo)"} non deve accedere a ${area}`,
      );
    }
    for (const role of ["owner", "club_manager", "collaborator", "staff"]) {
      assert.equal(
        canAccessPath(role, area),
        true,
        `${role} deve accedere a ${area}`,
      );
    }
  }
});

test("le aree riservate restano solo a owner e club manager", () => {
  const soloAdmin = [
    "/organization",
    "/permissions",
    "/settings",
    "/create-club",
    "/dashboard/access-management",
  ];

  for (const area of soloAdmin) {
    assert.equal(canAccessPath("owner", area), true, `owner su ${area}`);
    assert.equal(
      canAccessPath("club_manager", area),
      true,
      `club_manager su ${area}`,
    );
    assert.equal(
      canAccessPath("collaborator", area),
      false,
      `collaborator non deve accedere a ${area}`,
    );
    assert.equal(
      canAccessPath("staff", area),
      false,
      `staff non deve accedere a ${area}`,
    );
  }
});

/* ------------------------------------------------------------------------ */
/*  Wave 6 — il presidio che chiude la classe                               */
/* ------------------------------------------------------------------------ */

/**
 * **Le aree si contano dal filesystem, non dalla memoria di chi scrive.**
 *
 * Questo file teneva `MANAGEMENT_ROUTE_DIRS` a mano, e il commento in testa a
 * `src/middleware.ts` racconta le prime tre volte che l'elenco ha dimenticato
 * una pagina: `/consensi` (Wave 3), `/sport-work`, `/calendar` (Wave 5) —
 * ognuna scoperta da uno smoke su staging, ognuna corretta aggiungendo una
 * riga a mano.
 *
 * La Wave 6 e stata la **quarta**, e tutta insieme: l'area atleta, la coda
 * documentale e la configurazione degli appuntamenti sono nate tutte e tre
 * fuori dall'elenco. Tre aree in una Wave non sono tre distrazioni: sono la
 * prova che un elenco scritto a mano non e un presidio.
 *
 * Cosa cambia qui: le aree si **enumerano** da `src/app/`, e ognuna deve avere
 * un guscio con una guardia **e** un prefisso nel middleware. Cio che non e
 * un'area — i flussi pubblici, i percorsi di autenticazione, le pagine che una
 * sessione la devono ancora creare — sta in un elenco **chiuso e motivato**:
 * aggiungere una cartella nuova senza pensarci fa fallire questo test, che e
 * esattamente cio che serviva.
 *
 * **Non e la stessa cosa che una fuga di dati**: le API rifiutano comunque, e
 * ogni pagina si difende da sola. Cio che esce senza sessione e la *struttura*
 * di una schermata riservata. Ma questo elenco esiste perche non succeda, e un
 * elenco che va ricordato non serve a niente.
 */

/** Cio che **non** e un'area riservata, con il motivo. Elenco chiuso. */
const NON_SONO_AREE = new Map([
  ["api", "rotte, non pagine: rispondono 401 JSON e non un rinvio"],
  ["auth", "il flusso che una sessione la deve ancora creare"],
  ["forms", "moduli pubblici per slug"],
  ["iscrizione", "il riscontro pubblico di un'iscrizione"],
  ["login", "la porta"],
  ["onboarding", "precede l'esistenza di un club"],
  ["pay", "il link di pagamento, che vive di un token opaco"],
  ["register", "la registrazione"],
  ["token-verification", "consuma un codice, quindi non puo chiedere una sessione"],
  /*
    Le tre che non sono di **un** ruolo. Restano protette dal middleware — chi
    non ha una sessione viene rinviato — ma non hanno un guscio d area perche
    non esiste un area a cui appartengano.
  */
  ["account", "e di chiunque abbia una sessione: non e un area di ruolo"],
  ["profile", "il proprio profilo, per qualunque ruolo"],
  [
    "private",
    "console di piattaforma: il suo confine e requirePlatformAdmin, che e un asse ortogonale ai sette ruoli di club",
  ],
]);

const eUnaCartellaDiRotte = (nome) => {
  const completo = path.join(APP_DIR, nome);
  if (!fs.statSync(completo).isDirectory()) return false;
  // I gruppi di rotte e le cartelle private di Next non sono aree.
  return !nome.startsWith("(") && !nome.startsWith("_") && !nome.startsWith(".");
};

const AREE_DAL_FILESYSTEM = fs
  .readdirSync(APP_DIR)
  .filter(eUnaCartellaDiRotte)
  .filter((nome) => !NON_SONO_AREE.has(nome));

test("Wave 6 · ogni area di src/app ha un guscio con una guardia", () => {
  const senzaGuardia = AREE_DAL_FILESYSTEM.filter((area) => {
    if (mountsGuard(readLayout(path.join(area, "layout.tsx")))) return false;

    /*
      Un'area puo montare la guardia piu in basso, come fa `/parent-view`, che
      la mette sotto `[id]` perche il segmento del figlio e parte di cio che
      viene autorizzato. Si cerca in profondita prima di dichiarare un buco.
    */
    const trovata = (function cerca(cartella, profondita) {
      if (profondita > 3) return false;
      const completo = path.join(APP_DIR, cartella);
      if (mountsGuard(readLayout(path.join(cartella, "layout.tsx")))) return true;
      return fs
        .readdirSync(completo)
        .filter((voce) => {
          const dentro = path.join(completo, voce);
          return fs.statSync(dentro).isDirectory();
        })
        .some((voce) => cerca(path.join(cartella, voce), profondita + 1));
    })(area, 0);

    return !trovata;
  });

  assert.deepEqual(
    senzaGuardia,
    [],
    `aree senza guardia: ${senzaGuardia.join(", ")}. Se una di queste e pubblica, dichiarala in NON_SONO_AREE con il motivo invece di lasciarla scoperta`,
  );
});

test("Wave 6 · ogni area di src/app ha un prefisso nel middleware", () => {
  const middleware = fs.readFileSync(
    path.join(PROJECT_ROOT, "src", "middleware.ts"),
    "utf8",
  );

  const mancanti = AREE_DAL_FILESYSTEM.filter(
    (area) => !middleware.includes(`"/${area}"`),
  );

  assert.deepEqual(
    mancanti,
    [],
    `aree assenti dal middleware: ${mancanti.join(", ")}. E la quarta volta che questo elenco dimentica una pagina: adesso il test lo dice prima dello smoke su staging`,
  );
});

test("Wave 6 · la porta dell'area atleta resta aperta a chi non ha ancora una password", () => {
  const middleware = fs.readFileSync(
    path.join(PROJECT_ROOT, "src", "middleware.ts"),
    "utf8",
  );

  /*
    L'invito arriva a chi non ha una sessione e non ha una password: mandarlo
    su `/login` sarebbe mandarlo dove non puo entrare. E la stessa forma
    dell'eccezione che gia esiste per `/auth/complete`.
  */
  assert.ok(
    middleware.includes('"/athlete-dashboard/attiva"'),
    "senza questa eccezione l'invito non si puo riscattare",
  );
  assert.ok(
    middleware.includes('"/athlete-dashboard"'),
    "e il resto dell'area deve restare protetto",
  );
});
