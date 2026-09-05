/**
 * PP-03 round 4 — le etichette del catalogo contro le guardie vere.
 * Elenca le chiavi concesse a `trainer` (canonico) e chiede al catalogo
 * l'etichetta, per confrontarla a mano con cio che il server concede.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const carica = (rel) => import(pathToFileURL(path.resolve(rel)).href);
const cat = await carica("src/lib/permissions/catalog.ts");

const chiavi = cat.PERMISSION_CATALOG ?? cat.CATALOGO_PERMESSI ?? null;
console.log("export disponibili:", Object.keys(cat).join(", "));

const elenco = cat.listPermissionCatalog
  ? cat.listPermissionCatalog()
  : chiavi;

const voci = Array.isArray(elenco) ? elenco : Object.values(elenco ?? {});
const perTrainer = [];
for (const voce of voci) {
  const key = voce?.key ?? voce?.id;
  if (!key) continue;
  if (cat.roleHasPermission("trainer", key)) {
    perTrainer.push({ key, label: voce?.label ?? voce?.etichetta ?? "" });
  }
}
console.log(`\nChiavi concesse a trainer: ${perTrainer.length}\n`);
for (const v of perTrainer) console.log(`  ${v.key.padEnd(34)} ${v.label}`);
