import assert from "node:assert/strict";
import test, { before } from "node:test";
import fs from "node:fs";

/**
 * ADR-0196 — le superfici: il wizard di stagione non preseleziona nessuno,
 * l'elenco atleti si apre su «Attivi», e un'appartenenza a una categoria di
 * un'altra stagione non si traveste da squadra della stagione corrente.
 */

const manager = fs.readFileSync("src/components/organization/v2/season-manager.tsx", "utf8");
const atleti = fs.readFileSync("src/app/athletes/page.tsx", "utf8");
const gridState = fs.readFileSync("src/components/web/datagrid/useGridState.ts", "utf8");
const gridTypes = fs.readFileSync("src/components/web/datagrid/types.ts", "utf8");

/* ─────────────────────────────── il wizard ─────────────────────────────── */

test("l'elenco di riconferma nasce vuoto: nessuna selezione = nessuno", () => {
  assert.match(manager, /setRoster\(data\);\s*setConfirmedIds\(new Set\(\)\);/);
  assert.ok(
    !/setConfirmedIds\(new Set\(data\.athletes\.map/.test(manager),
    "il caricamento non deve piu spuntare tutti",
  );
});

test("«Seleziona tutti» e un pulsante esplicito, e il passo lo dice", () => {
  assert.match(manager, />\s*Seleziona tutti\s*</);
  assert.match(manager, /Spunta chi entra nelle squadre della stagione nuova: chi non spunti resta fuori/);
  assert.ok(!/Sono proposti tutti: togli chi non riconfermi/.test(manager));
});

test("il riepilogo dichiara lo zero prima della conferma", () => {
  assert.match(manager, /Nessun tesserato riconfermato: le squadre della stagione nuova nascono vuote/);
});

test("quando i tesserati si portano parte sempre un elenco, mai null", () => {
  assert.match(manager, /const confirmedAthleteIds = carriesAthletes \? Array\.from\(confirmedIds\) : null;/);
});

/* ─────────────────────────────── gli atleti ────────────────────────────── */

test("l'elenco atleti si apre su «Attivi»: la vista non si ricorda e l'archivio porta il nome dello stato", () => {
  assert.match(atleti, /rememberView=\{false\}/);
  assert.match(atleti, /allViewLabel=\{[\s\S]*?paginated && statusFilter !== "all" \? ATHLETE_STATUS_PLURAL_LABELS\[statusFilter\] : undefined/);
  assert.match(atleti, /useState<AthleteStatusFilter>\("active"\)/);
});

test("la griglia onora rememberView e allViewLabel", () => {
  assert.match(gridTypes, /rememberView\?: boolean;/);
  assert.match(gridTypes, /allViewLabel\?: string;/);
  assert.match(gridState, /persist && rememberView \? readPreference<string \| null>\(module, "view", null\) : null/);
  assert.match(gridState, /if \(rememberView\) save\("view", id\);/);
  assert.equal((gridState.match(/label: allViewLabel/g) || []).length, 2, "il chip senza filtri prende l'etichetta in entrambi i punti");
});

test("le appartenenze si risolvono sul catalogo di tutte le stagioni, e una categoria di un'altra stagione lo dice", () => {
  assert.match(atleti, /headers: \{ "x-active-season-id": "" \}/);
  assert.match(atleti, /const catalogoIdentita = catalogo\.completo\.length \? catalogo\.completo : normalizedCategories;/);
  assert.match(atleti, /· stagione \$\{stagione\.label\}/);
  assert.match(atleti, /· altra stagione/);
  /* Una riga fuori stagione non entra in un gruppo operativo della stagione corrente. */
  assert.match(atleti, /groupId: dellaStagione\s*\? getMembershipGroupId\(/);
});

/* ─────────────────────── il modello, non solo il testo ─────────────────── */

let memberships;
before(async () => {
  memberships = await import("../../src/lib/athlete-category-memberships.ts");
});

test("con il solo catalogo della stagione nuova l'appartenenza vecchia si travestiva per nome: con il catalogo intero no", () => {
  const vecchia = { id: "old-u14", name: "Under 14 Gold", seasonId: "A" };
  const nuova = { id: "new-u14", name: "Under 14 Gold", seasonId: "B" };
  const atleta = {
    id: "a1",
    category_id: "old-u14",
    category_name: "Under 14 Gold",
    category_memberships: [
      { id: "m1", athlete_id: "a1", category_id: "old-u14", category_name: "Under 14 Gold", site_id: "s1", is_primary: true },
    ],
  };

  const soloStagioneNuova = memberships.normalizeAthleteCategoryMemberships(atleta, [nuova]);
  assert.equal(soloStagioneNuova[0].categoryId, "new-u14", "il difetto: il ripiego sul nome la porta nella stagione nuova");

  const catalogoIntero = memberships.normalizeAthleteCategoryMemberships(atleta, [nuova, vecchia]);
  assert.equal(catalogoIntero[0].categoryId, "old-u14", "con il catalogo intero l'identita e quella vera");
});

/* ───────────────────── chiusure della revisione ostile ─────────────────── */

test("la scheda atleta riconosce le appartenenze sul catalogo di tutte le stagioni (C3): nessun riporto scritto per sbaglio", () => {
  const scheda = fs.readFileSync("src/app/athletes/[id]/page.tsx", "utf8");
  assert.match(scheda, /headers: \{ "x-active-season-id": "" \}/);
  assert.equal((scheda.match(/normalizeAthleteCategoryMemberships\(\s*(athlete|editFormData),\s*categoryCatalogForIdentity,/g) || []).length, 2);
});

test("una riga fuori stagione ha un gruppo proprio e il filtro la raggiunge (C1/C2/C4)", () => {
  const modello = fs.readFileSync("src/components/athletes/v2/athlete-grid-model.ts", "utf8");
  assert.match(modello, /OUT_OF_SEASON_GROUP_PREFIX = "fuori-stagione:"/);
  assert.match(modello, /Categorie di altre stagioni/);
  assert.match(atleti, /: outOfSeasonGroupId\(categoryId \|\| membership\.categoryName\)/);
});

test("la predefinita personale vince su quella del modulo, e rememberView spento non scrive la vista (C5/C10)", () => {
  assert.match(gridState, /pv\.find\(\(x\) => x\.isDefault\) \|\| candidates\.find\(\(x\) => x\.isDefault\)/);
  assert.equal((gridState.match(/if \(rememberView\) save\("view", id\);/g) || []).length, 2);
  assert.ok(!/^\s*save\("view", id\);/m.test(gridState), "nessuna scrittura della vista senza rememberView");
});
