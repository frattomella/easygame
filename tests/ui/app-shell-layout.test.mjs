import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * RC Fix 1, punto 2 — la pagina resta dentro il contenitore dell'app.
 *
 * **Il difetto.** «Nuovo allenatore» e «Nuovo atleta» montavano la stessa
 * chrome delle altre schermate ma con una radice `min-h-screen` invece di
 * `h-[100dvh]`. La differenza non e cosmetica: con `min-h-screen` la radice
 * **cresce** con il contenuto, il `main` non ha piu un'altezza da cui
 * ricavare il proprio scorrimento, e a scorrere finisce il documento. La
 * barra laterale, che e alta esattamente `100dvh` e non e sticky, scorreva
 * via insieme al resto: la pagina sembrava uscire dall'applicazione.
 *
 * **L'invariante.** Ogni schermata che monta la barra laterale e il `main`
 * condiviso deve fissare l'altezza della radice e confinare lo scorrimento
 * nella colonna del contenuto. Le sole `min-h-screen` ammesse sono i
 * segnaposto centrati di `Suspense`, che la barra laterale non ce l'hanno.
 */

const APP = path.join(process.cwd(), "src", "app");

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.tsx$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
};

const relative = (file) =>
  path.relative(process.cwd(), file).replace(/\\/g, "/");

const SHELL_FILES = walk(APP)
  .map((file) => ({ file, source: readFileSync(file, "utf8") }))
  .filter(
    ({ source }) =>
      source.includes("dashboardMainClassName") && /<Sidebar\b/.test(source),
  );

test("le schermate con barra laterale esistono e sono numerose", () => {
  assert.equal(
    SHELL_FILES.length > 15,
    true,
    `trovate solo ${SHELL_FILES.length} schermate: il filtro non sta piu selezionando niente`,
  );
});

test("nessuna schermata con barra laterale fa crescere la radice", () => {
  const offenders = SHELL_FILES.filter(({ source }) =>
    source
      .split("\n")
      .some(
        (line) =>
          line.includes("min-h-screen") &&
          // Il segnaposto centrato di Suspense non monta la chrome.
          !line.includes("items-center"),
      ),
  ).map(({ file }) => relative(file));

  assert.deepEqual(
    offenders,
    [],
    "la radice deve essere h-[100dvh]: con min-h-screen scorre il documento e la barra laterale scorre via",
  );
});

test("ogni schermata con barra laterale fissa l'altezza della radice", () => {
  const offenders = SHELL_FILES.filter(
    ({ source }) => !source.includes("h-[100dvh]"),
  ).map(({ file }) => relative(file));

  assert.deepEqual(offenders, []);
});

test("lo scorrimento appartiene alla colonna del contenuto", () => {
  /*
    Due forme equivalenti, entrambe in uso e entrambe corrette: `overflow-hidden`
    sulla colonna fra barra laterale e `main`, oppure sulla radice gia alta
    `100dvh` con la colonna a `min-h-0`. Quello che non deve mancare e il
    taglio: senza, il `main` non ha da chi ricavare la propria altezza e
    `overflow-y-auto` non produce nessuno scorrimento interno.
  */
  const offenders = SHELL_FILES.filter(({ source }) => {
    const columnBounded = /flex-col[^"]*overflow-hidden/.test(source);
    const rootBounded =
      /h-\[100dvh\][^"]*overflow-hidden/.test(source) &&
      /min-h-0[^"]*flex-col|flex-col[^"]*min-h-0/.test(source);
    return !columnBounded && !rootBounded;
  }).map(({ file }) => relative(file));

  assert.deepEqual(
    offenders,
    [],
    "senza overflow-hidden fra radice e main lo scorrimento torna al documento",
  );
});

/**
 * RC Fix 1, punto 11 — la chrome non monta il contenuto due volte.
 *
 * Quattro schermate montavano due rami, uno `hidden lg:flex` e uno
 * `lg:hidden`, **entrambi con dentro il contenuto**: nascosto con il CSS ma
 * vivo nel DOM, quindi React eseguiva due volte ogni effetto e ogni lettura
 * partiva due volte. Misurato sulla Dashboard di staging: 44 richieste invece
 * di 22, con `clubs` chiesto quattordici volte e `athlete_category_memberships`
 * otto. Su una pagina con autosave il rischio non era solo il costo: due
 * istanze significano due PATCH sovrapposte sulla stessa colonna JSON.
 *
 * `Header` monta gia da se la barra mobile e quella desktop: i due rami non
 * servivano, e le altre ~40 schermate non li hanno mai avuti.
 */
test("nessuna schermata monta il proprio contenuto due volte", () => {
  const offenders = SHELL_FILES.filter(({ source }) =>
    /className="hidden lg:flex w-full"/.test(source),
  ).map(({ file }) => relative(file));

  assert.deepEqual(
    offenders,
    [],
    "il ramo desktop duplicava il contenuto gia montato dal ramo mobile",
  );
});

test("la chrome della Dashboard monta i figli una volta sola", () => {
  const layout = readFileSync(
    path.join(process.cwd(), "src/app/dashboard/layout.tsx"),
    "utf8",
  );

  assert.equal(
    (layout.match(/\{children\}/g) || []).length,
    1,
    "due `{children}` sono due alberi React, quindi due volte ogni effetto",
  );
  assert.equal(
    (layout.match(/<main/g) || []).length,
    1,
    "un solo main: due producono due aree di scorrimento sovrapposte",
  );
});

test("il main condiviso resta l'unico elemento che scorre", () => {
  const container = readFileSync(
    path.join(
      process.cwd(),
      "src/components/dashboard/dashboard-page-container.tsx",
    ),
    "utf8",
  );

  assert.match(container, /min-h-0/);
  assert.match(container, /flex-1/);
  assert.match(container, /overflow-y-auto/);
  assert.match(
    container,
    /overflow-x-hidden/,
    "senza questo una tabella larga fa scorrere la pagina in orizzontale",
  );
});
