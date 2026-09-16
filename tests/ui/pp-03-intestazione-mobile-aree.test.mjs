import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * **`includes` non e un'area, e un pezzo di stringa** (PP-03 §13).
 *
 * `mobile-header.tsx` sceglieva il menu con `pathname.includes("trainer")`:
 * ci finivano dentro `/trainers` e `/trainers/<id>`, schermate gestionali, e
 * a chi apriva la scheda di un allenatore da telefono compariva un menu
 * «ALLENATORE» con dentro percorsi vietati a un allenatore vero.
 *
 * Con ADR-0187 quell'intestazione **non esiste piu**: le tre aree montano
 * `AreaShell`, che disegna la barra e il menu sotto i 1024 px dallo stesso
 * elenco (`area-navigation.ts`) filtrato per permesso, e il gestionale monta
 * `MobileTopBar` con le voci di `visibleNavGroups`. Non c'e piu una lista
 * scritta a mano che possa promettere a un allenatore una pagina che non puo
 * aprire, ne un confronto per sottostringa che scelga il menu sbagliato.
 */

const SRC = path.join(process.cwd(), "src");
const leggi = (relativo) => readFileSync(path.join(SRC, ...relativo.split("/")), "utf8");
const senzaCommenti = (sorgente) => sorgente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("PP-03 §13 · l'intestazione mobile legacy e il suo wrapper non esistono piu", () => {
  for (const file of ["components/ui/mobile-header.tsx", "app/mobile-layout-wrapper.tsx"]) {
    assert.equal(existsSync(path.join(SRC, ...file.split("/"))), false, `${file} e stato tolto`);
  }
});

test("PP-03 §13 · il menu mobile non sceglie l'area per sottostringa: le voci arrivano da chi lo monta", () => {
  const barra = senzaCommenti(leggi("components/layout/MobileTopBar.tsx"));
  assert.doesNotMatch(barra, /pathname\?\.includes\("(trainer|parent)"\)/, "nessun `includes` su un pezzo di percorso");
  assert.doesNotMatch(barra, /const trainerSections|const parentSections/, "nessuna lista d'area scritta a mano");
  assert.match(barra, /navSectionsOverride \|\| toSections\(visibleNavGroups\(navContext\)\)/, "le voci del gestionale vengono dalla fonte unica, quelle di un'area da chi la monta");
});

test("PP-03 §13 · le voci dell'allenatore non promettono pagine gestionali", () => {
  const voci = senzaCommenti(leggi("components/web/shell/area-navigation.ts"));
  const inizio = voci.indexOf("TRAINER_NAV");
  assert.ok(inizio >= 0, "l'elenco dell'allenatore esiste");
  const blocco = voci.slice(inizio, voci.indexOf("ATHLETE_AREA_NAV_GROUPS"));
  for (const percorso of ['"/training"', '"/matches"', '"/athletes"']) {
    assert.ok(!blocco.includes(percorso), `${percorso} sta in MANAGEMENT_PATH_PREFIXES: a un allenatore promette una pagina che non puo aprire`);
  }
  assert.match(blocco, /TRAINER_DASHBOARD_ROUTE_BY_NAVIGATION_KEY/, "la rotta viene dalla mappa dell'area, non da una stringa");
});
