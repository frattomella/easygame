import assert from "node:assert/strict";
import test from "node:test";

import {
  PERMISSION_CATALOG,
  getPermissionEntry,
  getPermissionLabel,
  listPermissionKeys,
  listPermissionsForDomain,
  listPermissionsForRole,
  roleHasPermission,
} from "../../src/lib/permissions/catalog.ts";
import {
  HEALTH_PERMISSIONS,
  HEALTH_PERMISSION_LABELS,
  hasHealthPermission,
  listHealthPermissions,
} from "../../src/lib/health/permissions.ts";
import {
  SPORT_WORK_PERMISSIONS,
  hasSportWorkPermission,
} from "../../src/lib/sport-work/permissions.ts";
import {
  canAdvanceGeneratedDocument,
  canManageConsentDefinitions,
  canManageDocumentTemplates,
  canReadConsentRecords,
  canReadDocumentTemplates,
  canRecordConsentDecision,
} from "../../src/lib/documents/permissions.ts";
import {
  canManageMembershipRegister,
  canReadMembershipRegister,
} from "../../src/lib/members/permissions.ts";
import { canAccessClubResource } from "../../src/lib/access-roles.ts";

/**
 * **Il catalogo unico delle chiavi di permesso** (W5-70), e la fine
 * dell'allow-by-default (W5-71).
 *
 * La maggioranza di questi controlli prova **il diniego**: un test che
 * provasse solo cio che un proprietario puo fare passerebbe anche se la
 * matrice desse tutto a tutti.
 */

const RUOLI = [
  "owner",
  "club_manager",
  "collaborator",
  "staff",
  "trainer",
  "parent",
  "athlete",
];

/* ================================================= il catalogo === */

test("ogni chiave del catalogo ha un'etichetta leggibile e un dominio", () => {
  assert.ok(PERMISSION_CATALOG.length >= 18);

  for (const entry of PERMISSION_CATALOG) {
    assert.match(entry.key, /^[a-z_]+(\.[a-z_]+)+$/, `chiave malformata: ${entry.key}`);
    assert.ok(entry.label.trim().length > 10, `etichetta troppo corta: ${entry.key}`);
    assert.ok(entry.domain, `dominio mancante: ${entry.key}`);
    for (const role of entry.roles) {
      assert.ok(RUOLI.includes(role), `ruolo sconosciuto in ${entry.key}: ${role}`);
    }
  }
});

test("nessuna chiave duplicata", () => {
  const chiavi = listPermissionKeys();
  assert.equal(new Set(chiavi).size, chiavi.length);
});

test("un ruolo inventato non porta nessuna chiave", () => {
  assert.deepEqual(listPermissionsForRole("ruolo-inventato"), []);
  assert.deepEqual(listPermissionsForRole(null), []);
  for (const chiave of listPermissionKeys()) {
    assert.equal(roleHasPermission("ruolo-inventato", chiave), false);
    assert.equal(roleHasPermission("", chiave), false);
  }
});

test("una chiave inventata non la porta nessun ruolo", () => {
  for (const ruolo of RUOLI) {
    assert.equal(roleHasPermission(ruolo, "clinical.everything"), false);
  }
  assert.equal(getPermissionEntry("clinical.everything"), null);
  assert.equal(getPermissionLabel("clinical.everything"), "clinical.everything");
});

/* ============================ il dominio non tiene una seconda copia === */

test("il dato sanitario legge il catalogo, non una tabella propria", () => {
  for (const permesso of HEALTH_PERMISSIONS) {
    assert.ok(
      getPermissionEntry(permesso),
      `${permesso} deve stare in catalogo`,
    );
    assert.equal(
      getPermissionLabel(permesso),
      HEALTH_PERMISSION_LABELS[permesso],
      "l'etichetta non puo divergere fra dominio e catalogo",
    );

    for (const ruolo of RUOLI) {
      assert.equal(
        hasHealthPermission(ruolo, permesso),
        roleHasPermission(ruolo, permesso),
        `${ruolo} / ${permesso}: dominio e catalogo devono coincidere`,
      );
    }
  }
});

test("il lavoro sportivo e in catalogo con la sua stessa matrice", () => {
  for (const permesso of SPORT_WORK_PERMISSIONS) {
    assert.ok(getPermissionEntry(permesso), `${permesso} deve stare in catalogo`);
    for (const ruolo of RUOLI) {
      assert.equal(
        hasSportWorkPermission(ruolo, permesso),
        roleHasPermission(ruolo, permesso),
        `${ruolo} / ${permesso}: le due matrici devono coincidere`,
      );
    }
  }
});

/* ====================== il taglio sul dato clinico, ruolo per ruolo === */

test("l'allenatore vede lo stato del certificato e non il contenuto", () => {
  assert.equal(hasHealthPermission("trainer", "clinical.status_read"), true);
  assert.equal(hasHealthPermission("trainer", "clinical.read"), false);
  assert.equal(hasHealthPermission("trainer", "clinical.manage"), false);
  assert.deepEqual(listHealthPermissions("trainer"), ["clinical.status_read"]);
});

test("genitore e atleta non ottengono il dato clinico dal ruolo", () => {
  for (const ruolo of ["parent", "athlete"]) {
    assert.deepEqual(
      listHealthPermissions(ruolo),
      [],
      "il loro gate e il legame, e i due permessi non sono lo stesso permesso",
    );
  }
});

test("segreteria e collaboratore protocollano i certificati, e quindi li leggono", () => {
  for (const ruolo of ["collaborator", "staff", "owner", "club_manager"]) {
    assert.equal(hasHealthPermission(ruolo, "clinical.read"), true);
    assert.equal(hasHealthPermission(ruolo, "clinical.manage"), true);
  }
});

/* ============================= documenti, consensi e libro soci === */

test("i modelli li riscrive la direzione, non la segreteria", () => {
  assert.equal(canManageDocumentTemplates("owner"), true);
  assert.equal(canManageDocumentTemplates("club_manager"), true);
  assert.equal(canManageDocumentTemplates("collaborator"), false);
  assert.equal(canManageDocumentTemplates("staff"), false);
  assert.equal(canManageDocumentTemplates("trainer"), false);
});

test("davanti a un documento non ci stanno allenatori, genitori e atleti", () => {
  for (const ruolo of ["trainer", "parent", "athlete", "ruolo-inventato"]) {
    assert.equal(canReadDocumentTemplates(ruolo), false);
    assert.equal(canAdvanceGeneratedDocument(ruolo), false);
    assert.equal(canRecordConsentDecision(ruolo), false);
    assert.equal(canReadConsentRecords(ruolo), false);
  }
});

test("un consenso lo definisce la direzione, lo registra la segreteria", () => {
  assert.equal(canManageConsentDefinitions("staff"), false);
  assert.equal(canManageConsentDefinitions("owner"), true);
  assert.equal(canRecordConsentDecision("staff"), true);
});

test("il libro soci lo scrive la direzione e lo legge la gestione", () => {
  assert.equal(canManageMembershipRegister("collaborator"), false);
  assert.equal(canManageMembershipRegister("club_manager"), true);
  assert.equal(canReadMembershipRegister("collaborator"), true);
  assert.equal(canReadMembershipRegister("trainer"), false);
  assert.equal(canReadMembershipRegister("parent"), false);
});

test("il dominio dei documenti e quello dei consensi sono elencabili", () => {
  assert.ok(listPermissionsForDomain("documents").length >= 5);
  assert.ok(listPermissionsForDomain("consents").length >= 3);
  assert.ok(listPermissionsForDomain("members").length >= 2);
  assert.ok(listPermissionsForDomain("health").length === 3);
});

/* ===================== W5-71 — niente piu allow-by-default === */

test("una risorsa non dichiarata e chiusa a segreteria e collaboratore", () => {
  for (const ruolo of ["collaborator", "staff"]) {
    for (const azione of ["read", "write", "delete"]) {
      assert.equal(
        canAccessClubResource(ruolo, "risorsa-inventata-domani", azione),
        false,
        `${ruolo} non deve poter ${azione} una risorsa su cui nessuno ha deciso`,
      );
    }
  }
});

test("le risorse dichiarate continuano a funzionare come prima", () => {
  assert.equal(canAccessClubResource("staff", "athletes", "read"), true);
  assert.equal(canAccessClubResource("staff", "athletes", "write"), true);
  assert.equal(canAccessClubResource("collaborator", "trainings", "write"), true);
  assert.equal(canAccessClubResource("collaborator", "staff_members", "read"), true);
  assert.equal(canAccessClubResource("staff", "forms", "write"), true);
});

test("le risorse riservate restano riservate", () => {
  for (const risorsa of [
    "bank_accounts",
    "clubs",
    "document_templates",
    "payment_methods",
    "sport_work",
    "users",
  ]) {
    assert.equal(canAccessClubResource("staff", risorsa, "read"), false);
    assert.equal(canAccessClubResource("collaborator", risorsa, "write"), false);
  }
});

test("cancellare una rata resta riservato anche se leggerla non lo e", () => {
  assert.equal(canAccessClubResource("staff", "simplified_payments", "read"), true);
  assert.equal(canAccessClubResource("staff", "simplified_payments", "write"), true);
  assert.equal(
    canAccessClubResource("staff", "simplified_payments", "delete"),
    false,
    "payment_transactions.payment_id e ON DELETE CASCADE",
  );
});

test("proprietario e gestore non passano dall'elenco: possono tutto", () => {
  for (const ruolo of ["owner", "club_manager"]) {
    assert.equal(
      canAccessClubResource(ruolo, "risorsa-inventata-domani", "delete"),
      true,
    );
  }
});
