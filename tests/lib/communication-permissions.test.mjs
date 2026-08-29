import assert from "node:assert/strict";
import test from "node:test";

import {
  COMMUNICATION_PERMISSIONS,
  assertCommunicationPermission,
  hasCommunicationPermission,
  listCommunicationPermissions,
} from "../../src/lib/communications/permissions.ts";

/**
 * I permessi del dominio comunicazioni (Wave 2).
 *
 * **Perche la parte che conta e il diniego.** Un test che prova solo cio che
 * un proprietario puo fare passerebbe anche se la matrice desse tutto a tutti.
 * Qui si prova soprattutto cio che i ruoli sportivi **non** possono, perche e
 * la ragione per cui il modulo esiste.
 */

test("un ruolo sconosciuto non ha nessun permesso", () => {
  assert.deepEqual(listCommunicationPermissions(""), []);
  assert.deepEqual(listCommunicationPermissions(null), []);
  assert.deepEqual(listCommunicationPermissions("capo ultras"), []);
});

test("proprietario e gestore possono mandare, configurare e pubblicare", () => {
  for (const role of ["owner", "club_manager", "proprietario", "gestore"]) {
    for (const permission of [
      "communications.send",
      "communications.read_recipients",
      "communications.audience_economic",
      "automations.manage",
      "board.publish",
      "rsvp.read",
    ]) {
      assert.equal(
        hasCommunicationPermission(role, permission),
        true,
        `${role} deve poter ${permission}`,
      );
    }
  }
});

test("l'allenatore legge le risposte ma non manda e non configura", () => {
  assert.equal(hasCommunicationPermission("trainer", "rsvp.read"), true);
  assert.equal(hasCommunicationPermission("trainer", "board.read"), true);

  assert.equal(hasCommunicationPermission("trainer", "communications.send"), false);
  assert.equal(hasCommunicationPermission("trainer", "automations.manage"), false);
  assert.equal(hasCommunicationPermission("trainer", "board.publish"), false);
});

test("nessun ruolo sportivo puo selezionare un pubblico economico", () => {
  for (const role of ["trainer", "parent", "athlete", "collaborator", "staff"]) {
    assert.equal(
      hasCommunicationPermission(role, "communications.audience_economic"),
      false,
      `${role} non deve poter selezionare gli insoluti`,
    );
  }
});

test("segreteria e collaboratori leggono ma non mandano", () => {
  for (const role of ["staff", "collaborator"]) {
    assert.equal(hasCommunicationPermission(role, "board.read"), true);
    assert.equal(hasCommunicationPermission(role, "rsvp.read"), true);
    assert.equal(hasCommunicationPermission(role, "communications.send"), false);
    assert.equal(hasCommunicationPermission(role, "board.publish"), false);
  }
});

test("solo genitore e atleta rispondono all'invito", () => {
  assert.equal(hasCommunicationPermission("parent", "rsvp.answer"), true);
  assert.equal(hasCommunicationPermission("athlete", "rsvp.answer"), true);

  for (const role of ["owner", "club_manager", "trainer", "staff", "collaborator"]) {
    assert.equal(
      hasCommunicationPermission(role, "rsvp.answer"),
      false,
      `${role} non risponde al posto della famiglia`,
    );
  }
});

test("il genitore non legge le risposte degli altri", () => {
  assert.equal(hasCommunicationPermission("parent", "rsvp.read"), false);
  assert.equal(hasCommunicationPermission("athlete", "rsvp.read"), false);
});

test("il diniego dice «Accesso negato», perche il route handler ci mappa il 403", () => {
  assert.throws(
    () => assertCommunicationPermission("trainer", "communications.send"),
    /Accesso negato/,
  );

  assert.doesNotThrow(() =>
    assertCommunicationPermission("owner", "communications.send"),
  );
});

test("ogni permesso dichiarato ha almeno un ruolo che lo possiede", () => {
  const ruoli = [
    "owner",
    "club_manager",
    "collaborator",
    "staff",
    "trainer",
    "parent",
    "athlete",
  ];

  for (const permission of COMMUNICATION_PERMISSIONS) {
    const qualcuno = ruoli.some((role) =>
      hasCommunicationPermission(role, permission),
    );
    assert.equal(qualcuno, true, `${permission} non e assegnato a nessuno`);
  }
});
