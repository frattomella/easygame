import assert from "node:assert/strict";
import test from "node:test";

import {
  SPORT_WORK_PERMISSIONS,
  assertSportWorkPermission,
  canReadOthersCompensation,
  hasSportWorkPermission,
  listSportWorkPermissions,
} from "../../src/lib/sport-work/permissions.ts";

/**
 * Chi puo vedere e toccare i compensi.
 *
 * Un rapporto di lavoro dice quanto guadagna una persona. In un club e il
 * dato che circola per pettegolezzo prima che per necessita, e il difetto che
 * questi test esistono per impedire non e un accesso cross-tenant: e un
 * allenatore che legge il compenso del collega.
 */

const ADMIN_ROLES = ["owner", "club_manager"];
const NON_ADMIN_ROLES = ["collaborator", "staff", "trainer", "athlete", "parent"];

test("proprietario e club manager hanno accesso pieno", () => {
  for (const role of ADMIN_ROLES) {
    assert.deepEqual(
      [...listSportWorkPermissions(role)].sort(),
      [...SPORT_WORK_PERMISSIONS].sort(),
      `${role} deve avere tutti i permessi`,
    );
  }
});

test("nessun altro ruolo puo leggere i compensi altrui", () => {
  for (const role of NON_ADMIN_ROLES) {
    assert.equal(
      hasSportWorkPermission(role, "sport_work.read"),
      false,
      `${role} non deve poter leggere i compensi del club`,
    );
    assert.equal(canReadOthersCompensation(role), false);
  }
});

test("nessun altro ruolo puo registrare o stornare un'erogazione", () => {
  for (const role of NON_ADMIN_ROLES) {
    assert.equal(hasSportWorkPermission(role, "sport_work.pay"), false);
    assert.equal(hasSportWorkPermission(role, "sport_work.manage"), false);
    assert.equal(hasSportWorkPermission(role, "sport_work.fiscal"), false);
  }
});

test("allenatore, staff, collaboratore e atleta vedono al piu i propri", () => {
  for (const role of ["trainer", "staff", "collaborator", "athlete"]) {
    assert.deepEqual(listSportWorkPermissions(role), ["sport_work.read_own"]);
  }
});

test("un genitore non ha nessun permesso su questo dominio", () => {
  assert.deepEqual(listSportWorkPermissions("parent"), []);
});

test("un ruolo sconosciuto o assente non ha permessi", () => {
  for (const role of [null, undefined, "", "superadmin", "presidente"]) {
    assert.deepEqual(listSportWorkPermissions(role), []);
  }
});

test("gli alias italiani dei ruoli vengono riconosciuti", () => {
  assert.equal(hasSportWorkPermission("proprietario", "sport_work.pay"), true);
  assert.equal(hasSportWorkPermission("gestore", "sport_work.pay"), true);
  assert.equal(hasSportWorkPermission("allenatore", "sport_work.read"), false);
});

test("il diniego dice «Accesso negato», perche il 403 si mappa cosi", () => {
  assert.throws(
    () => assertSportWorkPermission("trainer", "sport_work.read"),
    /Accesso negato/,
  );
  assert.doesNotThrow(() =>
    assertSportWorkPermission("owner", "sport_work.read"),
  );
});
