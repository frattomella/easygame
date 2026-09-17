import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * **ADR-0197 — il confine di stagione, provato per forma dove non c'e un
 * modulo puro da eseguire**: le rotte passano dal risolutore canonico, le
 * pagine dicono la stagione e ricaricano al cambio, il pannello mostra la
 * diagnostica, la scheda Stagioni ha l'eliminazione con la conferma scritta,
 * la migrazione della vista proietta la stagione delle righe storiche.
 */

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const eventsRoute = read("src/app/api/v1/events/route.ts");
const automationRoute = read("src/app/api/v1/training-automation/route.ts");
const automation = read("src/lib/server/training-automation.ts");
const events = read("src/lib/server/events.ts");
const resources = read("src/lib/server/resources.ts");
const panel = read("src/components/trainer/TrainingScheduleAutomationPanel.tsx");
const weekly = read("src/components/dashboard/WeeklyTrainingSchedulePanel.tsx");
const auth = read("src/components/providers/AuthProvider.tsx");
const calendar = read("src/app/calendar/page.tsx");
const training = read("src/app/training/page.tsx");
const matches = read("src/app/matches/page.tsx");
const manager = read("src/components/organization/v2/season-manager.tsx");
const trainersList = read("src/app/trainers/page.tsx");
const trainerDetail = read("src/app/trainers/[id]/page.tsx");
const seasonsModel = read("src/lib/club-seasons.ts");
const catalog = read("src/lib/permissions/catalog.ts");
const seasonRoute = read("src/app/api/v1/seasons/[seasonId]/route.ts");
const genericRoute = read("src/app/api/v1/[resource]/[id]/route.ts");
const migration = read("prisma/migrations/20260917120000_adr0197_stagione_dei_movimenti_storici/migration.sql");
const overview = read("src/lib/dashboard/club-overview.ts");

test("§6 · la rotta degli eventi legge la stagione dal risolutore canonico, mai dall'header a mano", () => {
  assert.match(eventsRoute, /resolveSeasonContext\(scope\.activeOrganizationId, request\)/);
  assert.doesNotMatch(eventsRoute, /headers\.get\("x-active-season-id"\)/);
  assert.match(eventsRoute, /season: stagione,/);
  assert.match(eventsRoute, /allSeasons: url\.searchParams\.get\("all_seasons"\) === "1"/);
  assert.match(eventsRoute, /\{ season: stagione \},/, "gli eventi nuovi nascono nella stagione dichiarata");
});

test("§6 · listClubEvents filtra per identita con seasonWhere; una PATCH non sposta la stagione", () => {
  assert.match(events, /seasonWhere\(filters\.season\)/);
  assert.match(events, /colonne\.season_id = existing\.season_id \?\? null;/);
  assert.match(events, /colonne\.season_id = seasonIdForNewRecord\(/);
});

test("§4 · la generazione riceve la stagione dichiarata e produce la diagnostica", () => {
  assert.match(automationRoute, /readRequestedSeason\(request\)/);
  assert.match(automation, /reason: "no_valid_rules"/);
  assert.match(automation, /diagnostics: buildDiagnostics\(\)/);
  assert.match(automation, /seasonId: scheduleItem\.seasonId \|\| generationSeasonId \|\| null/, "l'evento porta la stagione della regola");
  assert.match(automation, /clubCategories: dellaStagione\(/, "il catalogo e della stagione, non del club: si filtrano i grezzi");
  assert.match(automation, /onIncomplete: \(item\) => incomplete\.push\(item\)/, "le voci scartate dalla normalizzazione si contano");
  assert.match(automation, /reason: "outside_season" as const/);
  assert.match(automation, /outsideSeasonCount \+= 1;/);
});

test("§4 · il pannello mostra la diagnostica e non il messaggio generico", () => {
  assert.doesNotMatch(panel, /Il programma settimanale non contiene sessioni valide da generare/);
  assert.match(panel, /describeDiagnostics\(/);
  assert.match(panel, /function DiagnosticaProgramma/);
  assert.match(panel, /data-testid="diagnostica-programma"/);
  assert.match(weekly, /seasonId: String\(item\?\.seasonId \|\| item\?\.season_id\)\.trim\(\)/, "la voce del programma porta la sua stagione all'override");
});

test("§5 · la colonna di stagione riscritta per intero conserva le altre stagioni, sul server", () => {
  assert.match(resources, /const preserveOtherSeasonRecords = async \(/);
  assert.match(resources, /if \(input\[field\] !== undefined\) input\[field\] = fuso;/, "la proiezione su club_resource_items dice la stessa cosa della colonna");
});

test("§3 · la stagione cambia senza F5: il contesto ascolta club-updated e le pagine dipendono dalla stagione", () => {
  assert.match(auth, /window\.addEventListener\("club-updated", onClubUpdated\)/);
  for (const [name, source] of [["calendar", calendar], ["training", training], ["matches", matches]]) {
    assert.match(source, /activeClub\?\.activeSeasonId/, `${name}: la stagione mostrata e una dipendenza del caricamento`);
    assert.match(source, /activeClub\?\.activeSeasonLabel/, `${name}: la stagione si dice nell'intestazione`);
  }
});

test("§7 · le pagine Allenatori spaccano le assegnazioni per stagione e l'editor offre solo la stagione scelta", () => {
  assert.match(trainersList, /splitTrainerAssignmentsBySeason\(/);
  assert.match(trainersList, /mergeTrainerAssignmentsForSeason\(/);
  assert.match(trainersList, /Nessuna categoria assegnata nella stagione/);
  assert.match(trainersList, /Stagione precedente:/);
  assert.match(trainerDetail, /categories=\{seasonCategories\}/);
  assert.match(trainerDetail, /mergeTrainerAssignmentsForSeason\(\{/);
  assert.match(trainerDetail, /label: "Stagioni precedenti"/);
});

test("§7 · il riporto ha il tipo «Assegnazioni allenatori», spento per scelta e legato alle categorie", () => {
  assert.match(seasonsModel, /key: "trainer_assignments",[\s\S]{0,400}defaultSelected: false,[\s\S]{0,100}storage: "model",[\s\S]{0,300}requires: \["categories", "category_groups"\]/);
});

test("§8 · il riepilogo del wizard dichiara cio che non viene riportato", () => {
  assert.match(manager, /data-test="season-wizard-not-carried"/);
  assert.match(manager, /lo storico resta nella stagione di origine/);
});

test("§9 · l'eliminazione: azione, cassetto con impatto, conferma scritta, permesso e audit", () => {
  assert.match(manager, /id: "delete", label: "Elimina"[\s\S]{0,120}hidden: \(season\) => season\.id === activeSeasonId/);
  assert.match(manager, /data-test="season-delete-drawer"/);
  assert.match(manager, /data-test="season-delete-confirmation"/);
  assert.match(manager, /deleteConfirmation\.trim\(\) !== \(deleteImpact\?\.confirmationText \|\| ""\)/, "il pulsante resta spento finche il testo non e esatto");
  assert.match(manager, /Elimina definitivamente/);
  assert.match(manager, /imposta un&apos;altra stagione come attiva/);
  assert.match(seasonRoute, /hasSeasonPermission\(requestContext\.role, "seasons\.delete"\)/);
  assert.match(seasonRoute, /AUDIT_ACTIONS\.seasonDeleteRequested/);
  assert.match(seasonRoute, /AUDIT_ACTIONS\.seasonDeleted/);
  assert.match(catalog, /key: "seasons\.delete"/);
});

test("§10 · D-RD-27: il DELETE di un'anagrafica esce come anagrafica.deleted con l'etichetta", () => {
  assert.match(genericRoute, /AUDIT_ACTIONS\.anagraficaDeleted/);
  assert.match(genericRoute, /const deletedRecordLabel = /);
  assert.match(genericRoute, /\{ operation: "delete", resource, \.\.\.\(label \? \{ label \} : \{\}\) \}/);
});

test("§11 · D-RD-30: la vista proietta la stagione delle due gambe storiche", () => {
  const proiezioni = migration.match(/NULLIF\(btrim\(t\.value ->> 'seasonId'\), ''\)/g) || [];
  assert.equal(proiezioni.length, 2, "legacy-transaction e legacy-transfer");
  assert.match(migration, /CREATE OR REPLACE VIEW "accounting_ledger_lines" AS/);
  assert.equal((migration.match(/UNION ALL/g) || []).length, 5, "stessi rami della vista precedente");
});

test("§21 · la Dashboard filtra le collezioni sulla stagione attiva", () => {
  assert.match(overview, /dellaStagione\("matches"/);
  assert.match(overview, /dellaStagione\("trainings"/);
  assert.match(overview, /dellaStagione\("categories"/);
});
