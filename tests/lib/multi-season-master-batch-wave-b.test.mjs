import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { calculateAthleteCategoryAnalytics } from "../../src/lib/athlete-category-analytics.ts";
import { resolveNumberingGroupForCategory } from "../../src/lib/jersey-numbering-utils.ts";

/**
 * MASTER BATCH — Wave B (Athlete Analytics / Numbering).
 */

const athlete = { id: "atleta-1", firstName: "Mario", lastName: "Rossi" };
const categories = [{ id: "cat-pulcini", name: "Pulcini" }];
const memberships = [{ id: "m1", categoryId: "cat-pulcini", categoryName: "Pulcini", isPrimary: true, siteId: "" }];

test("B4: appello registrato distingue PRESENTE/ASSENTE, appello non fatto dice NON REGISTRATO", () => {
  const trainings = [
    { id: "t-presente", date: "2026-09-10", category_id: "cat-pulcini" },
    { id: "t-assente", date: "2026-09-11", category_id: "cat-pulcini" },
    { id: "t-non-registrato", date: "2026-09-12", category_id: "cat-pulcini" },
  ];
  const attendanceRecords = [
    { training_id: "t-presente", athlete_id: "atleta-1", status: "present" },
    { training_id: "t-assente", athlete_id: "atleta-1", status: "absent" },
    // t-non-registrato: nessuna riga -> appello mai fatto per questo atleta.
  ];
  const result = calculateAthleteCategoryAnalytics({
    athlete,
    categoryMemberships: memberships,
    trainings,
    attendanceRecords,
    categories,
    now: "2026-09-20",
  });
  const righe = result.categories[0].recentTrainings;
  const stato = (id) => righe.find((r) => r.id === `training-${id}`)?.statusLabel;
  assert.equal(stato("t-presente"), "Presente");
  assert.equal(stato("t-assente"), "Assente");
  assert.equal(stato("t-non-registrato"), "Non registrato");
});

test("B5: un allenamento futuro non entra nel consuntivo", () => {
  const trainings = [
    { id: "t-passato", date: "2026-09-01", category_id: "cat-pulcini" },
    { id: "t-futuro", date: "2026-12-01", category_id: "cat-pulcini" },
  ];
  const attendanceRecords = [
    { training_id: "t-passato", athlete_id: "atleta-1", status: "present" },
    { training_id: "t-futuro", athlete_id: "atleta-1", status: "present" },
  ];
  const result = calculateAthleteCategoryAnalytics({
    athlete,
    categoryMemberships: memberships,
    trainings,
    attendanceRecords,
    categories,
    now: "2026-09-20",
  });
  assert.equal(result.categories[0].trainingsTotal, 1);
  assert.ok(!result.categories[0].recentTrainings.some((r) => r.id === "training-t-futuro"));
});

test("B6: un allenamento prima dell'inizio attivita non entra nel consuntivo", () => {
  const trainings = [
    { id: "t-prima", date: "2026-08-01", category_id: "cat-pulcini" },
    { id: "t-dopo", date: "2026-09-15", category_id: "cat-pulcini" },
  ];
  const attendanceRecords = [
    { training_id: "t-prima", athlete_id: "atleta-1", status: "absent" },
    { training_id: "t-dopo", athlete_id: "atleta-1", status: "present" },
  ];
  const result = calculateAthleteCategoryAnalytics({
    athlete,
    categoryMemberships: memberships,
    trainings,
    attendanceRecords,
    categories,
    now: "2026-09-20",
    activityStartAt: "2026-09-10",
  });
  assert.equal(result.categories[0].trainingsTotal, 1);
  assert.ok(!result.categories[0].recentTrainings.some((r) => r.id === "training-t-prima"));
});

test("B3: le presenze da prova riportate sull'atleta valgono come presenze sue", () => {
  const trainings = [{ id: "t-da-prova", date: "2026-09-05", category_id: "cat-pulcini" }];
  // Simula quanto fa il caricatore della pagina: la riga di trial_attendances ri-chiavata su athleteId.
  const attendanceRecords = [{ training_id: "t-da-prova", athlete_id: "atleta-1", status: "present" }];
  const result = calculateAthleteCategoryAnalytics({
    athlete,
    categoryMemberships: memberships,
    trainings,
    attendanceRecords,
    categories,
    now: "2026-09-20",
    activityStartAt: "2026-09-01", // la creazione della prova, precedente alla scheda
  });
  assert.equal(result.categories[0].attendancesPresent, 1);
  assert.equal(
    result.categories[0].recentTrainings.find((r) => r.id === "training-t-da-prova")?.statusLabel,
    "Presente",
  );
});

test("B9: il gruppo numerazione lo dice la categoria primaria, non il primo gruppo del club", () => {
  const groups = [
    { id: "g-generico", name: "Generico", categoryIds: [], includeCompatibleCategories: false, siteIds: [], season: null, minNumber: 1, maxNumber: 99, reservedNumbers: [], assignedNumbers: [] },
    { id: "g-pulcini", name: "Settore Giovanile", categoryIds: ["cat-pulcini"], includeCompatibleCategories: false, siteIds: [], season: null, minNumber: 1, maxNumber: 99, reservedNumbers: [], assignedNumbers: [] },
  ];
  const group = resolveNumberingGroupForCategory({ categoryId: "cat-pulcini", groups, categories });
  assert.equal(group?.id, "g-pulcini");
});

test("B11: nessun gruppo nomina la categoria e non c'e un gruppo generico -> nessuno", () => {
  const groups = [
    { id: "g-altro", name: "Altro", categoryIds: ["cat-esordienti"], includeCompatibleCategories: false, siteIds: [], season: null, minNumber: 1, maxNumber: 99, reservedNumbers: [], assignedNumbers: [] },
  ];
  const group = resolveNumberingGroupForCategory({ categoryId: "cat-pulcini", groups, categories });
  assert.equal(group, null);
});

test("B11: un gruppo senza categorie configurate resta l'ultima spiaggia", () => {
  const groups = [
    { id: "g-generico", name: "Generico", categoryIds: [], includeCompatibleCategories: false, siteIds: [], season: null, minNumber: 1, maxNumber: 99, reservedNumbers: [], assignedNumbers: [] },
  ];
  const group = resolveNumberingGroupForCategory({ categoryId: "cat-pulcini", groups, categories });
  assert.equal(group?.id, "g-generico");
});

/**
 * B10 — il cassetto non lascia piu scegliere il gruppo a mano.
 */
test("B10: il cassetto del numero maglia non ha piu un selettore di gruppo", () => {
  const source = readFileSync("src/components/athletes/profile/v2/AthleteActivityDrawers.tsx", "utf8");
  assert.doesNotMatch(source, /onGroupChange/, "il gruppo non e piu un campo che si sceglie");
  assert.match(source, /Assegnato automaticamente dalla categoria primaria/);
  assert.match(source, /Nessun gruppo numerazione configurato per questa categoria\./);
});

test("B9: la pagina deriva il gruppo di default dalla categoria primaria, non dal primo gruppo del club", () => {
  const source = readFileSync("src/app/athletes/[id]/page.tsx", "utf8");
  assert.doesNotMatch(
    source,
    /clothingState\.numberingGroups\[0\]\?\.id \|\|\s*\n\s*"";/,
    "niente piu «primo gruppo del club» come ripiego dell'assegnazione",
  );
  assert.match(source, /derivedNumberingGroup\?\.id \|\|\s*\n\s*"";/);
});

/**
 * B3/B4 — le presenze arrivano da club_event_participants e dalla storia da
 * prova, non dalla copia incassata nella proiezione.
 */
test("B3/B4: la scheda atleta legge le presenze vere e la storia da prova", () => {
  const source = readFileSync("src/app/athletes/[id]/page.tsx", "utf8");
  assert.match(source, /\/api\/v1\/club_event_participants\?athlete_id=/);
  assert.match(source, /\/trial-history/);
  assert.match(source, /const activityStartAt = trialHistory\?\.activityStartAt \|\| null;/);
});

/**
 * Revisione ostile Wave F (Reviewer A) — senza una prova non si taglia
 * niente: `athleteRecord.created_at` e la nascita della riga, non della
 * persona, e un roster importato in blocco l'avrebbe usata per nascondere
 * presenze vere gia migrate con la loro data reale.
 */
test("B1/B2 (revisione ostile Wave F): senza una prova, activityStartAt non usa la creazione della riga", () => {
  const source = readFileSync("src/app/athletes/[id]/page.tsx", "utf8");
  assert.doesNotMatch(source, /activityStartAt.*athleteRecord\.created_at/);
});

/**
 * B12 — anteprima read-only, mai un numero chiesto all'iscrizione (ADR-0057
 * resta in vigore).
 */
test("B12: Nuovo atleta mostra l'anteprima del gruppo ma non chiede il numero", () => {
  const source = readFileSync("src/components/forms/AthleteCreateForm.tsx", "utf8");
  assert.match(source, /athlete-create-numbering-preview/);
  assert.doesNotMatch(source, /id="jersey-number"/, "il numero resta un'assegnazione, non un campo del modulo di iscrizione (ADR-0057)");
  assert.match(source, /ADR-0057/, "la ragione per cui il numero non si chiede qui resta documentata");
});
