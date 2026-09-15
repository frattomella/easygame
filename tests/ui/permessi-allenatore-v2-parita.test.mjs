import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  ACTION_OPTIONS,
  CONTROLLED_PRESET,
  FULL_PRESET,
  NAV_OPTIONS,
  PERMISSION_GROUPS,
  PRESETS,
  READ_ONLY_PRESET,
  WIDGET_OPTIONS,
  clonePermissions,
  countEnabled,
  matchingPreset,
  permissionsEqual,
  setPermission,
} from "@/components/permissions/v2/trainer-permissions-model";
import { DEFAULT_TRAINER_DASHBOARD_PERMISSIONS } from "@/lib/trainer-dashboard-permissions";

/**
 * Parita della pagina «Permessi allenatore» V2 con l'audit V1
 * (`docs/redesign/audit/wave-e-permessi-allenatore.md`).
 */
const read = (relative) => readFileSync(path.join(process.cwd(), relative), "utf8");
const sources = {
  route: read("src/app/permissions/page.tsx"),
  page: read("src/components/permissions/v2/trainer-permissions-page.tsx"),
  model: read("src/components/permissions/v2/trainer-permissions-model.ts"),
};
const everything = Object.values(sources).join("\n");

test("la rotta monta il componente V2 e la V1 non esiste piu", () => {
  assert.match(sources.route, /@\/components\/permissions\/v2\/trainer-permissions-page/);
  assert.throws(() => read("src/components/permissions/trainer-permissions-page.tsx"), "la V1 va rimossa, non affiancata");
});

test("intestazione: il nome della barra, un solo primario (la barra di salvataggio), il club, il testo del perimetro", () => {
  assert.match(sources.page, /title="Permessi allenatore"/, "PP-01 §M");
  assert.match(sources.page, /<Header title="Permessi allenatore" \/>/);
  assert.doesNotMatch(sources.page, /variant="primary"/, "il primario e quello della StickyActionBar");
  assert.match(sources.page, /<StickyActionBar/);
  assert.match(sources.page, /saveLabel="Salva permessi trainer"/);
  assert.match(sources.page, /Club: \{activeClub\?\.name \|\| "non selezionato"\}/);
  assert.match(sources.page, /vedrà sempre e solo categorie, atleti, allenamenti e gare assegnate al suo profilo/);
  assert.match(sources.page, /label="leve attive"/);
});

test("le tre liste di leve della V1, con le stesse chiavi, etichette e descrizioni", () => {
  assert.deepEqual(
    NAV_OPTIONS.map((o) => o.key),
    ["home", "trainings", "matches", "athletes", "categories", "board", "appointments", "documents", "compensation", "notifications"],
  );
  assert.deepEqual(
    WIDGET_OPTIONS.map((o) => o.key),
    ["summary", "upcomingTrainings", "upcomingMatches", "assignedAthletes", "assignedCategories"],
  );
  assert.deepEqual(
    ACTION_OPTIONS.map((o) => o.key),
    ["viewTrainingDetails", "manageAttendance", "manageTrainingStatus", "viewMatchDetails", "manageConvocations", "viewAthleteDetails", "viewAthleteTechnicalSheet", "viewAthleteContacts", "viewMedicalStatus", "viewEnrollmentAndPayments"],
  );
  for (const [key, label] of [
    ["home", "Home dashboard"],
    ["compensation", "Pagina «I miei compensi»"],
    ["summary", "Card riepilogo"],
    ["assignedAthletes", "Roster in evidenza"],
    ["manageTrainingStatus", "Calendario di allenamenti e gare"],
    ["viewEnrollmentAndPayments", "Iscrizione e pagamenti"],
  ]) {
    const option = [...NAV_OPTIONS, ...WIDGET_OPTIONS, ...ACTION_OPTIONS].find((o) => o.key === key);
    assert.equal(option?.label, label);
    assert.ok(option?.description, `${key} senza descrizione`);
  }
  assert.match(ACTION_OPTIONS.find((o) => o.key === "manageTrainingStatus").description, /creare, spostare, annullare e ripristinare/);
  // ogni chiave del dominio ha la sua leva, e nessuna leva e senza chiave
  for (const group of PERMISSION_GROUPS) {
    assert.deepEqual(
      group.options.map((o) => o.key).sort(),
      Object.keys(DEFAULT_TRAINER_DASHBOARD_PERMISSIONS[group.id]).sort(),
      `${group.id}: le leve devono coincidere con le chiavi del dominio`,
    );
  }
  assert.deepEqual(
    PERMISSION_GROUPS.map((g) => g.title),
    ["Navigazione", "Widget della home", "Azioni e dati"],
  );
});

test("i tre preset della V1, con gli stessi valori", () => {
  assert.deepEqual(
    PRESETS.map((p) => p.label),
    ["Sola consultazione", "Operatività controllata", "Accesso completo"],
  );
  assert.deepEqual(READ_ONLY_PRESET.actions, {
    viewTrainingDetails: true,
    manageAttendance: false,
    manageTrainingStatus: false,
    viewMatchDetails: true,
    manageConvocations: false,
    viewAthleteDetails: true,
    viewAthleteTechnicalSheet: true,
    viewAthleteContacts: false,
    viewMedicalStatus: false,
    viewEnrollmentAndPayments: false,
  });
  assert.deepEqual(CONTROLLED_PRESET.actions, {
    viewTrainingDetails: true,
    manageAttendance: true,
    manageTrainingStatus: true,
    viewMatchDetails: true,
    manageConvocations: true,
    viewAthleteDetails: true,
    viewAthleteTechnicalSheet: true,
    viewAthleteContacts: false,
    viewMedicalStatus: true,
    viewEnrollmentAndPayments: false,
  });
  assert.ok(permissionsEqual(FULL_PRESET, DEFAULT_TRAINER_DASHBOARD_PERMISSIONS));
  assert.deepEqual(READ_ONLY_PRESET.navigation, DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.navigation);
  assert.deepEqual(CONTROLLED_PRESET.widgets, DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.widgets);
  assert.match(sources.page, /applyPreset\(item\.value\)/, "un preset sostituisce lo stato locale e non salva");
  assert.doesNotMatch(sources.page.slice(sources.page.indexOf("const applyPreset"), sources.page.indexOf("const handleSave")), /saveClubSettings/);
  assert.equal(matchingPreset(clonePermissions(CONTROLLED_PRESET))?.id, "controlled");
  assert.equal(matchingPreset(setPermission(clonePermissions(CONTROLLED_PRESET), "actions", "viewAthleteContacts", true)), null);
});

test("lettura e scrittura: le stesse funzioni della V1, gli stessi toast, la guardia dirty in piu", () => {
  assert.match(sources.page, /getClubSettings\(activeClub\.id\)/);
  assert.match(sources.page, /resolveTrainerDashboardPermissions\(clubSettings\)/);
  assert.match(sources.page, /saveClubSettings\(activeClub\.id, buildTrainerDashboardPermissionPayload\(permissions\)\)/);
  for (const frase of ['"Errore nel caricamento dei permessi trainer"', '"Nessun club attivo selezionato"', '"Permessi trainer salvati con successo"', '"Errore nel salvataggio dei permessi trainer"']) {
    assert.ok(sources.page.includes(frase), `manca il toast ${frase}`);
  }
  assert.match(sources.page, /const dirty = !permissionsEqual\(permissions, saved\)/);
  assert.match(sources.page, /dirty=\{dirty\}/);
  assert.match(sources.page, /saveDisabled=\{isLoading \|\| !activeClub\?\.id\}/, "senza club il salvataggio e temporaneamente non disponibile, come in V1");
  assert.doesNotMatch(everything, /\bfetch\(/);
  const base = clonePermissions(DEFAULT_TRAINER_DASHBOARD_PERMISSIONS);
  assert.ok(permissionsEqual(base, DEFAULT_TRAINER_DASHBOARD_PERMISSIONS));
  assert.ok(!permissionsEqual(setPermission(base, "navigation", "home", false), base));
  assert.equal(countEnabled({ a: true, b: false, c: true }), 2);
});

test("ogni leva e un Toggle con la parola dello stato accanto, e lo scheletro mentre la lettura arriva", () => {
  assert.match(sources.page, /<Toggle id=\{id\} checked=\{checked\}/);
  assert.match(sources.page, /\{checked \? "Attiva" : "Non attiva"\}/, "guideline 08 §8.2: lo stato non e lasciato alla sola manopola");
  assert.match(sources.page, /<Skeleton/);
  assert.match(sources.page, /<SectionNav/);
  assert.doesNotMatch(everything, /@\/components\/ui\/(card|badge|button|label|switch)"/);
  assert.doesNotMatch(everything, /bg-gradient-to-|#[0-9a-fA-F]{6}\b|rounded-\[3\dpx\]/);
  assert.doesNotMatch(everything, /[!]"|[!]\s*<|[!]\s*$/m, "niente punti esclamativi nei testi");
  for (const [name, source] of Object.entries(sources)) {
    const griglieSenzaRottura = [...source.matchAll(/className="([^"]*\bgrid-cols-\d[^"]*)"/g)].filter((m) => !/\b(sm|md|lg|xl|laptop):grid-cols-/.test(m[1]));
    assert.deepEqual(griglieSenzaRottura, [], `${name}: una griglia a colonne fisse`);
  }
});
