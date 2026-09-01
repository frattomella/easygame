import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { PERMISSION_CATALOG } from "../../src/lib/permissions/catalog.ts";
import {
  LINK_GATED_PERMISSION_KEYS,
  listGrantablePermissions,
} from "../../src/lib/roles/custom-role.ts";

/**
 * **Le due superfici della lane 6G** (W6-2 e WP-16).
 *
 * `/dashboard/access-management` era la peggiore delle tre superfici finte
 * censite dal piano: `grep "fetch("` rispondeva **zero**, i gestori erano tre
 * nomi inventati con indirizzi `@example.com`, il token nasceva da un
 * `Math.random()` **nel browser** e non veniva salvato da nessuna parte, e la
 * tabella `access_tokens` che la pagina dichiarava di scrivere **non esiste
 * nello schema**.
 *
 * Questi test sono statici e lo sono per costruzione: la domanda «questa
 * pagina e ancora un mock» non si risponde eseguendola, perche un mock si
 * esegue benissimo.
 */

const SRC = path.join(process.cwd(), "src");
const leggi = (relativo) =>
  readFileSync(path.join(SRC, ...relativo.split("/")), "utf8");

/**
 * I commenti raccontano il difetto che la pagina ha chiuso, e nominano quindi
 * `@example.com`, `Math.random` e `access_tokens`. Cercarli nel testo intero
 * troverebbe la **spiegazione** invece del difetto: si guarda il codice.
 */
const senzaCommenti = (sorgente) =>
  sorgente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const GESTIONE_ACCESSI = senzaCommenti(
  leggi("app/dashboard/access-management/page.tsx"),
);
const REGISTRO = leggi("app/audit/page.tsx");
const RUOLI = leggi("lib/access-roles.ts");
const MIDDLEWARE = leggi("middleware.ts");

/* ================================== il mock e stato sostituito === */

test("la gestione accessi non ha piu nessun dato finto", () => {
  assert.equal(
    GESTIONE_ACCESSI.includes("@example.com"),
    false,
    "i tre gestori inventati devono essere spariti",
  );
  assert.equal(
    /Math\.random/.test(GESTIONE_ACCESSI),
    false,
    "il token generato nel browser deve essere sparito",
  );
  assert.equal(
    GESTIONE_ACCESSI.includes("access_tokens"),
    false,
    "la pagina non dichiara piu di scrivere una tabella che non esiste",
  );
});

test("la gestione accessi parla con il server, e passa dal trasporto unico", () => {
  assert.equal(
    GESTIONE_ACCESSI.includes("/api/v1/club-roles/assignments"),
    true,
  );
  assert.equal(GESTIONE_ACCESSI.includes("apiRequest("), true);
  assert.equal(
    /\bfetch\(/.test(GESTIONE_ACCESSI),
    false,
    "nessun fetch diretto a /api da un componente (CLAUDE.md §2)",
  );
});

test("la revoca e la cancellazione chiedono conferma con AlertDialog, non con confirm()", () => {
  assert.equal(GESTIONE_ACCESSI.includes("AlertDialog"), true);
  assert.equal(/\bconfirm\(/.test(GESTIONE_ACCESSI), false);
});

/* ============= nessuna casella che non faccia niente (regola del mandato) === */

const CHIAVI_DEL_CATALOGO = new Set(
  PERMISSION_CATALOG.map((voce) => voce.key),
);

/**
 * Le chiavi che la pagina nomina **a mano**: sono i due preset del §24 del
 * mandato. Tutte le altre le disegna `listGrantablePermissions`, cioe il
 * catalogo, e non c'e modo di scriverne una che non esista.
 */
const chiaviCitate = [
  ...GESTIONE_ACCESSI.matchAll(/"([a-z_]+(?:\.[a-z_]+)+)"/g),
]
  .map((corrispondenza) => corrispondenza[1])
  .filter((chiave) => CHIAVI_DEL_CATALOGO.has(chiave));

test("ogni chiave nominata dalla schermata esiste nel catalogo", () => {
  assert.ok(chiaviCitate.length >= 15, "i due preset devono nominare le loro chiavi");
  for (const chiave of chiaviCitate) {
    assert.equal(
      CHIAVI_DEL_CATALOGO.has(chiave),
      true,
      `${chiave} non e in catalogo`,
    );
  }
});

test("nessuna chiave di legame compare fra quelle proposte", () => {
  for (const chiave of LINK_GATED_PERMISSION_KEYS) {
    assert.equal(
      chiaviCitate.includes(chiave),
      false,
      `${chiave} nasce dal legame con un atleta: non si propone a un ruolo`,
    );
  }
});

test("le chiavi dei due preset appartengono al loro ruolo base", () => {
  const concedibili = (base) =>
    new Set(listGrantablePermissions(base).map((voce) => voce.key));

  const segreteria = GESTIONE_ACCESSI.slice(
    GESTIONE_ACCESSI.indexOf('titolo: "Segreteria"'),
    GESTIONE_ACCESSI.indexOf('titolo: "Direttore Sportivo"'),
  );
  const direttore = GESTIONE_ACCESSI.slice(
    GESTIONE_ACCESSI.indexOf('titolo: "Direttore Sportivo"'),
    GESTIONE_ACCESSI.indexOf("export default function"),
  );

  assert.ok(segreteria.length > 100 && direttore.length > 100);

  const estrai = (blocco) =>
    [...blocco.matchAll(/"([a-z_]+(?:\.[a-z_]+)+)"/g)]
      .map((corrispondenza) => corrispondenza[1])
      .filter((chiave) => CHIAVI_DEL_CATALOGO.has(chiave));

  const perSegreteria = concedibili("collaborator");
  for (const chiave of estrai(segreteria)) {
    assert.equal(
      perSegreteria.has(chiave),
      true,
      `Segreteria non puo portare ${chiave}: non e del collaboratore`,
    );
  }

  const perDirettore = concedibili("staff");
  for (const chiave of estrai(direttore)) {
    assert.equal(
      perDirettore.has(chiave),
      true,
      `Direttore Sportivo non puo portare ${chiave}: non e dello staff`,
    );
  }

  /* Il mandato §24: niente compensi per la segreteria, niente denaro per il DS. */
  assert.equal(estrai(segreteria).includes("sport_work.read"), false);
  assert.equal(estrai(segreteria).includes("sport_work.read_own"), false);
  assert.equal(estrai(direttore).includes("documents.review"), false);
  assert.equal(estrai(direttore).some((chiave) => chiave.startsWith("sport_work")), false);
});

/* ============================== il registro, e la sua chiave === */

test("la voce del registro sparisce con la chiave, e la pagina lo ripete", () => {
  assert.equal(
    GESTIONE_ACCESSI.includes('roleHasPermission(ruoloAttivo, "audit.read")'),
    true,
    "il collegamento al registro e condizionato alla chiave (§10.5, meta visibile)",
  );
  assert.equal(REGISTRO.includes("audit.read"), true);
  assert.equal(REGISTRO.includes("/api/v1/audit"), true);
  assert.equal(
    /status === 403/.test(REGISTRO),
    true,
    "un 403 si racconta, non si mostra come elenco vuoto",
  );
});

test("il registro non promette filtri che la rotta non applica", () => {
  for (const parametro of [
    "area",
    "outcome",
    "actor_email",
    "resource",
    "from",
    "to",
    "denied",
  ]) {
    assert.equal(
      REGISTRO.includes(`"${parametro}"`),
      true,
      `il filtro ${parametro} deve essere mandato al server`,
    );
  }

  const rotta = readFileSync(
    path.join(process.cwd(), "src/app/api/v1/audit/route.ts"),
    "utf8",
  );
  for (const parametro of [
    "area",
    "outcome",
    "actor_email",
    "resource",
    "from",
    "to",
    "denied",
  ]) {
    assert.equal(
      rotta.includes(`"${parametro}"`),
      true,
      `la rotta deve leggere il filtro ${parametro}`,
    );
  }
});

/* ====================================== raggiungibilita e guardie === */

test("`/audit` e un percorso gestionale, protetto dal middleware", () => {
  assert.equal(RUOLI.includes('"/audit"'), true);
  assert.equal(MIDDLEWARE.includes('"/audit"'), true);
  assert.equal(
    RUOLI.slice(
      RUOLI.indexOf("MANAGEMENT_ADMIN_ONLY_PATH_PREFIXES"),
      RUOLI.indexOf("MANAGEMENT_ADMIN_ONLY_RESOURCES"),
    ).includes('"/audit"'),
    false,
    "chi decide sul registro e la chiave, non il prefisso amministrativo",
  );
});

/* ================================================ responsivita === */

test("le due schermate nuove restano usabili a 375 px", () => {
  for (const [nome, sorgente] of [
    ["gestione accessi", GESTIONE_ACCESSI],
    ["registro", REGISTRO],
  ]) {
    const griglieSenzaRottura = [
      ...sorgente.matchAll(/className="([^"]*\bgrid-cols-\d[^"]*)"/g),
    ].filter((corrispondenza) => !/\b(sm|md|lg|xl):grid-cols-/.test(corrispondenza[1]));

    assert.deepEqual(
      griglieSenzaRottura.map((corrispondenza) => corrispondenza[1]),
      [],
      `${nome}: una griglia a colonne fisse e a due colonne anche a 375 px`,
    );

    assert.equal(
      /\bw-\[\d{3,}px\]|\bmin-w-\[\d{3,}px\]/.test(sorgente),
      false,
      `${nome}: nessuna larghezza fissa oltre i 100 px`,
    );
  }
});
