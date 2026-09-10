import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_TRAINER_DASHBOARD_PERMISSIONS,
  resolveTrainerDashboardPermissions,
} from "../client/lib/trainer-permissions";

test("le dieci chiavi di navigazione nascono accese, categorie incluse", () => {
  const permissions = resolveTrainerDashboardPermissions({});
  assert.deepEqual(permissions.navigation, {
    home: true,
    trainings: true,
    matches: true,
    athletes: true,
    categories: true,
    board: true,
    documents: true,
    appointments: true,
    notifications: true,
    compensation: true,
  });
});

test("la scelta del club su clubs.settings.trainerDashboardPermissions ha effetto (il difetto reale)", () => {
  // Prima di questa correzione `resolveTrainerDashboardPermissions` leggeva
  // `navigation` direttamente sull'ingresso: su `clubs.settings` — cio che il
  // chiamante reale passa — quella chiave non esiste mai (vive un livello
  // sotto), quindi ogni scelta del club ricadeva sempre sui default.
  const clubSettings = {
    trainerDashboardPermissions: {
      navigation: {
        trainings: false,
        board: false,
      },
    },
  };

  const permissions = resolveTrainerDashboardPermissions(clubSettings);

  assert.equal(permissions.navigation.trainings, false);
  assert.equal(permissions.navigation.board, false);
  // Le chiavi non toccate dal club restano ai valori di default.
  assert.equal(permissions.navigation.home, true);
  assert.equal(permissions.navigation.categories, true);
  assert.equal(permissions.navigation.compensation, true);
});

test("accetta anche la chiave snake_case scritta dal Web", () => {
  const clubSettings = {
    trainer_dashboard_permissions: {
      navigation: { appointments: false },
    },
  };

  const permissions = resolveTrainerDashboardPermissions(clubSettings);
  assert.equal(permissions.navigation.appointments, false);
});

test("i widget accettano sia il nome storico del mobile sia quello del Web", () => {
  const daNomeStorico = resolveTrainerDashboardPermissions({
    trainerDashboardPermissions: {
      widgets: { todayTrainings: false },
    },
  });
  assert.equal(daNomeStorico.widgets.todayTrainings, false);

  const daNomeWeb = resolveTrainerDashboardPermissions({
    trainerDashboardPermissions: {
      widgets: { upcomingTrainings: false, upcomingMatches: false },
    },
  });
  assert.equal(daNomeWeb.widgets.todayTrainings, false);
  assert.equal(daNomeWeb.widgets.todayMatches, false);
});

test("un valore non booleano non spegne una chiave: resta il default", () => {
  const permissions = resolveTrainerDashboardPermissions({
    trainerDashboardPermissions: {
      navigation: { home: "no" as unknown as boolean },
    },
  });
  assert.equal(permissions.navigation.home, true);
});

test("i valori di default esportati corrispondono a quelli restituiti senza override", () => {
  assert.deepEqual(
    resolveTrainerDashboardPermissions(null),
    DEFAULT_TRAINER_DASHBOARD_PERMISSIONS,
  );
});
