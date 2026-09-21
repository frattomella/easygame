import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { formatCategoryBirthYearRange } from "../../src/lib/category-utils.ts";
import { buildCategoryDisplayIndex } from "../../src/lib/categories/display.ts";
import { buildMembershipTargetIndex } from "../../src/lib/categories/placement.ts";

/**
 * MASTER BATCH — Wave A (Athlete UX / Category Presentation).
 *
 * A1/A2: le annate entrano nell'etichetta di **selezione** (`optionLabel`),
 * mai in quella di lettura (`label`, che il testo libero di import e
 * modulistica continua a confrontare con `fromLabel`). Niente `(undefined)`,
 * `(-)`, `()` quando la categoria non le porta.
 */

test("formatCategoryBirthYearRange: forma compatta per un'etichetta di selezione", () => {
  assert.equal(formatCategoryBirthYearRange({ birthYearFrom: 2016, birthYearTo: 2017 }), "2016-2017");
  assert.equal(formatCategoryBirthYearRange({ birthYearFrom: 2017 }), "2017");
  assert.equal(formatCategoryBirthYearRange({}), "");
  assert.equal(formatCategoryBirthYearRange({ ageRange: "qualcosa senza anni" }), "");
});

test("buildCategoryDisplayIndex: optionLabel porta le annate, label resta senza (A1/A2)", () => {
  const categories = [
    { id: "pulcini-b", name: "Pulcini", birthYearFrom: 2016, birthYearTo: 2017 },
    { id: "esordienti", name: "Esordienti" },
  ];
  const index = buildCategoryDisplayIndex({ categories });

  assert.equal(index.optionLabel("pulcini-b"), "Pulcini (2016-2017)");
  assert.equal(index.label("pulcini-b"), "Pulcini");
  assert.equal(index.describe("pulcini-b").birthYears, "2016-2017");

  // Senza annate configurate: nessuna parentesi vuota.
  assert.equal(index.optionLabel("esordienti"), "Esordienti");
  assert.equal(index.describe("esordienti").birthYears, "");
});

test("buildCategoryDisplayIndex: la sede e le annate si accostano insieme quando servono entrambe", () => {
  const categories = [
    { id: "u15-formia", name: "Under 15", birthYearFrom: 2011, birthYearTo: 2011 },
    { id: "u15-scauri", name: "Under 15", birthYearFrom: 2011, birthYearTo: 2011 },
  ];
  const groups = [
    { categoryId: "u15-formia", siteId: "site-formia", siteName: "Formia" },
    { categoryId: "u15-scauri", siteId: "site-scauri", siteName: "Scauri" },
  ];
  const index = buildCategoryDisplayIndex({ categories, groups });

  assert.equal(index.optionLabel("u15-formia"), "Under 15 · Formia (2011)");
});

test("buildMembershipTargetIndex: A3 — la B attiva non eredita le annate della A omonima", () => {
  const categorieA = [{ id: "pulcini-a", name: "Pulcini", birthYearFrom: 2015, birthYearTo: 2016, configured: true }];
  const categorieB = [{ id: "pulcini-b", name: "Pulcini", birthYearFrom: 2016, birthYearTo: 2017, configured: true }];

  const indiceA = buildMembershipTargetIndex({ categories: categorieA });
  const indiceB = buildMembershipTargetIndex({ categories: categorieB });

  assert.equal(indiceA.targets[0].optionLabel, "Pulcini (2015-2016)");
  assert.equal(indiceB.targets[0].optionLabel, "Pulcini (2016-2017)");
  // Un selettore costruito sul solo catalogo B non vede mai le annate della A.
  assert.ok(!indiceB.targets.some((t) => t.optionLabel.includes("2015")));
});

test("buildMembershipTargetIndex: optionLabel con sede e annate insieme, label invariata per fromLabel", () => {
  const categories = [{ id: "pulcini", name: "Pulcini", birthYearFrom: 2016, birthYearTo: 2017, configured: true }];
  const groups = [{ categoryId: "pulcini", siteId: "site-scauri", siteName: "Scauri" }];
  const index = buildMembershipTargetIndex({ categories, groups });

  const target = index.targets[0];
  assert.equal(target.label, "Pulcini · Scauri");
  assert.equal(target.optionLabel, "Pulcini · Scauri (2016-2017)");
  // Il riconoscimento da testo libero (import, modulistica) confronta `label`: deve continuare a riconoscere il nome scritto senza annate.
  assert.equal(index.fromLabel("Pulcini · Scauri").target?.id, target.id);
});

/**
 * A3 (season safety) — New Athlete e la pagina Atleti leggono le categorie
 * dal registro con perimetro di stagione, non piu dalla tabella grezza.
 */
test("A3: New Athlete filtra le categorie sulla stagione attiva prima di offrirle", () => {
  const source = readFileSync("src/app/athletes/new/page.tsx", "utf8");
  assert.match(source, /normalizeClubSeasons\(settings \|\| \{\}\)/);
  assert.match(source, /filterCollectionBySeason\("categories", tutte, stagioni\.activeSeasonId,/);
});

test("A3: la pagina Atleti legge le categorie dal registro con perimetro di stagione, non dalla tabella grezza", () => {
  const source = readFileSync("src/app/athletes/page.tsx", "utf8");
  assert.doesNotMatch(
    source,
    /supabase\s*\.from\("categories"\)/,
    "niente lettura diretta della tabella categories: perderebbe il perimetro di stagione",
  );
  assert.match(source, /apiRequest<any\[\]>\(`\/api\/v1\/categories\?organization_id=\$\{encodeURIComponent\(clubId\)\}`\)/);
});

/**
 * A9/A10 — la pagina Atleti rispetta l'ordine che il club ha scelto nella
 * pagina Categorie (`sortOrder`), non l'ordine di creazione.
 */
test("A9/A10: la pagina Atleti ordina le categorie per il posto deciso dal club", () => {
  const source = readFileSync("src/app/athletes/page.tsx", "utf8");
  assert.match(source, /readCategorySortOrder\(sinistra\.category\)/);
  assert.match(source, /const buildCategoryList = \(rawCategories: any\[\]\) =>\s*\n\s*ordinaPerPostoDelClub/);
});

/**
 * A4 — dopo la conversione si va sulla scheda Atleta nuova, per
 * identificativo (mai una ricerca per nome).
 */
test("A4: la conversione di una prova rimanda alla scheda Atleta per identificativo", () => {
  const source = readFileSync("src/components/trials/v2/TrialAthletesPanel.tsx", "utf8");
  assert.match(source, /const result = await convertTrialAthlete\(converting\.id, input\);/);
  assert.match(source, /athleteHref\(result\.athleteId\)/);
});

/**
 * A7 — «Contatti» diventa «Contatti Atleta» solo sulle superfici della
 * scheda atleta, non sulle altre anagrafiche (club, sponsor, staff, soci…).
 */
test("A7: il modulo e la scheda atleta dicono «Contatti Atleta»", () => {
  assert.match(readFileSync("src/components/forms/AthleteCreateForm.tsx", "utf8"), /title="Contatti Atleta"/);
  assert.match(readFileSync("src/components/athletes/profile/v2/AthleteProfileSections.tsx", "utf8"), /eyebrow="Contatti Atleta"/);
  assert.match(readFileSync("src/components/trainer/trainer-athlete-profile-page.tsx", "utf8"), /label: "Contatti Atleta"/);
});

/**
 * A8 — la griglia Atleti si apre in ordine alfabetico, come Trainer/Guardians/Staff.
 */
test("A8: la griglia Atleti ha un ordine alfabetico di default", () => {
  const source = readFileSync("src/app/athletes/page.tsx", "utf8");
  assert.match(source, /defaultSort=\{\{ columnId: "atleta", direction: "asc" \}\}/);
});
