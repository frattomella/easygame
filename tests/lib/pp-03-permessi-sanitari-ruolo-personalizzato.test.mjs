import assert from "node:assert/strict";
import test from "node:test";

import {
  listHealthPermissions,
  hasHealthPermission,
} from "../../src/lib/health/permissions.ts";

/**
 * **Le due funzioni sorelle devono rispondere alla stessa domanda** (PP-03).
 *
 * `listHealthPermissions` chiedeva `roleHasPermission` passandogli il ruolo
 * gia **normalizzato**, e `normalizeAccessRole` di un gettone personalizzato
 * restituisce il ruolo **base**: le chiavi concesse sparivano per strada e
 * l'elenco rispondeva per la base. `hasHealthPermission`, tre righe piu in
 * basso nello stesso file, il ruolo lo passava intero.
 *
 * Due funzioni che rispondono diversamente alla stessa domanda sono gia rotte
 * prima che qualcuno trovi quale delle due chiamare: questo test le lega.
 */

/** Il gettone che `resolveOrganizationScopeForUser` costruisce a ogni richiesta. */
const gettone = (base, nome, chiavi) =>
  `custom:${base}:${nome}` + (chiavi.length ? `#${chiavi.join(",")}` : "");

test("PP-03 · l'elenco sanitario di un ruolo personalizzato porta le chiavi concesse, non quelle della base", () => {
  const senzaClinico = gettone("collaborator", "segreteria", ["events.read"]);

  assert.deepEqual(
    [...listHealthPermissions(senzaClinico)],
    [],
    "l'elenco ha risposto per il ruolo base: le caselle tolte non toglievano niente",
  );

  const conStato = gettone("collaborator", "segreteria", [
    "clinical.status_read",
  ]);
  assert.deepEqual([...listHealthPermissions(conStato)], ["clinical.status_read"]);
});

test("PP-03 · l'elenco e la domanda singola danno la stessa risposta", () => {
  const ruoli = [
    "owner",
    "collaborator",
    "staff",
    "trainer",
    "parent",
    "athlete",
    gettone("collaborator", "segreteria", []),
    gettone("collaborator", "segreteria", ["clinical.status_read"]),
    gettone("collaborator", "segreteria", ["clinical.status_read", "clinical.read"]),
    gettone("trainer", "preparatori", ["clinical.status_read"]),
    /* Il tetto: una chiave che il ruolo base non ha non si guadagna. */
    gettone("trainer", "preparatori", ["clinical.read", "clinical.manage"]),
  ];

  for (const ruolo of ruoli) {
    const elenco = new Set(listHealthPermissions(ruolo));
    for (const permesso of [
      "clinical.status_read",
      "clinical.read",
      "clinical.manage",
    ]) {
      assert.equal(
        elenco.has(permesso),
        hasHealthPermission(ruolo, permesso),
        `le due funzioni divergono su ${ruolo} / ${permesso}`,
      );
    }
  }
});

test("PP-03 · un ruolo personalizzato non guadagna una chiave che la base non ha", () => {
  /*
    Il verso opposto, e conta quanto il primo: il tetto di ADR-0102 dice che un
    ruolo di club e un **sottoinsieme** del suo ruolo base, mai un
    soprainsieme. L'allenatore non ha `clinical.read`, e nessuna casella
    spuntata glielo puo dare.
  */
  const allenatoreGoloso = gettone("trainer", "preparatori", [
    "clinical.status_read",
    "clinical.read",
    "clinical.manage",
  ]);

  assert.deepEqual(
    [...listHealthPermissions(allenatoreGoloso)],
    ["clinical.status_read"],
    "un ruolo su allenatore ha guadagnato il contenuto clinico",
  );
});
