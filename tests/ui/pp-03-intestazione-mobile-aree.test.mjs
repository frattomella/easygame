import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **`includes` non e un'area, e un pezzo di stringa** (PP-03 §13).
 *
 * `mobile-header.tsx` sceglieva il menu con `pathname.includes("trainer")`. Ci
 * finiscono dentro `/trainers` e `/trainers/<id>`, che sono schermate
 * **gestionali**: su un telefono, chi apriva la scheda di un allenatore
 * dall'area di gestione si vedeva comparire un menu intitolato «ALLENATORE»,
 * con dentro tre percorsi che a un allenatore vero sono vietati
 * (`MANAGEMENT_PATH_PREFIXES`).
 *
 * Le due meta della correzione si tengono: il confine si chiede per **prefisso
 * d'area**, e le voci del menu allenatore spariscono, perche l'area allenatore
 * ha il proprio guscio e questa intestazione non la serve mai — la esclude
 * `mobile-layout-wrapper`.
 */

const SRC = path.join(process.cwd(), "src");
const leggi = (relativo) =>
  readFileSync(path.join(SRC, ...relativo.split("/")), "utf8");

const senzaCommenti = (sorgente) =>
  sorgente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const HEADER = "components/ui/mobile-header.tsx";

test("PP-03 §13 · l'area si riconosce dal prefisso, non da una sottostringa", () => {
  const sorgente = senzaCommenti(leggi(HEADER));

  assert.ok(
    !/pathname\?\.includes\("trainer"\)/.test(sorgente),
    "`includes(\"trainer\")` aggancia anche `/trainers/<id>`, che e gestionale",
  );
  assert.ok(
    !/pathname\?\.includes\("parent"\)/.test(sorgente),
    "stessa forma, stesso difetto sull'altra area",
  );
  assert.ok(
    sorgente.includes('"/trainer-dashboard"') &&
      sorgente.includes('"/parent-view"'),
    "le due aree si nominano per intero",
  );
  assert.ok(
    /startsWith\(`\$\{prefisso\}\/`\)/.test(sorgente),
    "il confronto per prefisso e lo stesso che usa `mobile-layout-wrapper` per decidere se mostrare l'intestazione",
  );
});

test("PP-03 §13 · questa intestazione non promette all'allenatore pagine gestionali", () => {
  const sorgente = senzaCommenti(leggi(HEADER));

  const inizio = sorgente.indexOf("const trainerSections");
  const fine = sorgente.indexOf("const parentSections");
  assert.ok(inizio >= 0 && fine > inizio, "le due liste devono restare accanto");

  const blocco = sorgente.slice(inizio, fine);

  for (const percorso of ["/training", "/matches", "/athletes"]) {
    assert.ok(
      !blocco.includes(`"${percorso}"`),
      `\`${percorso}\` sta in MANAGEMENT_PATH_PREFIXES: a un allenatore promette una pagina che non puo aprire`,
    );
  }
});

test("PP-03 §13 · l'intestazione mobile non serve mai l'area allenatore", () => {
  /*
    La ragione per cui le voci si possono togliere invece che correggere: il
    guscio dell'area allenatore ha la propria navigazione, e questa
    intestazione e esclusa da `/trainer-dashboard`. Se domani l'esclusione
    cadesse, questa prova fallirebbe e chiederebbe di ricostruire il menu con
    le chiavi di permesso giuste, invece di lasciare l'area senza navigazione.
  */
  const wrapper = senzaCommenti(leggi("app/mobile-layout-wrapper.tsx"));

  assert.ok(
    wrapper.includes('"/trainer-dashboard"'),
    "`/trainer-dashboard` deve restare fra i percorsi che nascondono questa intestazione",
  );
});
