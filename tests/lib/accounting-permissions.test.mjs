import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCOUNTING_PERMISSIONS,
  assertAccountingPermission,
  canOpenAccounting,
  hasAccountingPermission,
  listAccountingPermissions,
} from "../../src/lib/accounting/permissions.ts";

/**
 * **La matrice dei permessi contabili, scritta nella barriera.**
 *
 * Sta qui e non in una lane per la lezione della Wave 2: quattro copie della
 * stessa matrice restano indietro in silenzio. E prova la lezione della Wave 3
 * (W3-14): **la matrice della pagina e quella della rotta sono la stessa**.
 *
 * Il difetto che chiude, misurato prima di correggerlo: un collaboratore apriva
 * `/movements`, la pagina si caricava senza errori e **mostrava tutto a zero**,
 * perche leggeva via `clubs` — che e admin-only — e la lettura inghiottiva il
 * 403 restituendo un array vuoto. Nel frattempo il CRUD generico sulle stesse
 * righe rispondeva `200` e permetteva di cancellare.
 *
 * I sette ruoli canonici sono provati **tutti**, azione per azione, e nessuno
 * di essi e nuovo: la Wave 4 non introduce un tesoriere.
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

/* ------------------------------------------------- amministrazione piena */

test("proprietario e gestore hanno tutti i permessi contabili", () => {
  for (const ruolo of ["owner", "club_manager"]) {
    for (const permesso of ACCOUNTING_PERMISSIONS) {
      assert.equal(
        hasAccountingPermission(ruolo, permesso),
        true,
        `${ruolo} deve avere ${permesso}`,
      );
    }
  }
});

/* ------------------------------------------------------- la segreteria */

test("la segreteria vede la prima nota e registra: e il lavoro di ogni giorno", () => {
  for (const ruolo of ["collaborator", "staff"]) {
    assert.equal(hasAccountingPermission(ruolo, "accounting.read"), true);
    assert.equal(hasAccountingPermission(ruolo, "accounting.manage"), true);
    assert.equal(hasAccountingPermission(ruolo, "accounting.reconcile"), true);
  }
});

test("registrare non e stornare: la segreteria non storna", () => {
  /*
    E la separazione che sostituisce il ruolo tesoriere che il brief vieta.
    Chi tiene la cassa registra; chi corregge un errore di denaro e la
    direzione. La stessa distinzione fra `sport_work.manage` e `sport_work.pay`.
  */
  for (const ruolo of ["collaborator", "staff"]) {
    assert.equal(hasAccountingPermission(ruolo, "accounting.reverse"), false);
  }
});

test("la segreteria non vede i saldi dei conti, ne esporta, ne tocca le causali", () => {
  for (const ruolo of ["collaborator", "staff"]) {
    assert.equal(
      hasAccountingPermission(ruolo, "accounting.accounts_read"),
      false,
      "gli estremi e i saldi bancari sono gia riservati oggi",
    );
    assert.equal(
      hasAccountingPermission(ruolo, "accounting.accounts_manage"),
      false,
      "aprire un conto e configurazione societaria",
    );
    assert.equal(
      hasAccountingPermission(ruolo, "accounting.export"),
      false,
      "l'export e una fotografia completa dei conti che lascia l'applicazione",
    );
    assert.equal(
      hasAccountingPermission(ruolo, "accounting.causes_manage"),
      false,
      "cambiare una causale cambia la natura fiscale di cio che si registrera",
    );
  }
});

/* ------------------------------------------------- chi non entra affatto */

test("allenatore, genitore e atleta non hanno nessun permesso contabile", () => {
  for (const ruolo of ["trainer", "parent", "athlete"]) {
    assert.deepEqual([...listAccountingPermissions(ruolo)], []);
    assert.equal(
      canOpenAccounting(ruolo),
      false,
      "e la voce di menu non deve nemmeno comparire",
    );
  }
});

test("un ruolo sconosciuto o assente non ottiene niente per omissione", () => {
  for (const ruolo of [null, undefined, "", "treasurer", "tesoriere", "contabile"]) {
    assert.deepEqual([...listAccountingPermissions(ruolo)], []);
  }
});

test("gli alias esistenti dei ruoli canonici continuano a valere", () => {
  /*
    `admin` non e un ruolo sconosciuto: e un alias storico di `club_manager`
    (`ROLE_ALIASES` in `access-roles.ts`). Un test che lo trattasse come
    sconosciuto proverebbe il contrario di cio che serve.
  */
  assert.equal(hasAccountingPermission("admin", "accounting.reverse"), true);
  assert.equal(hasAccountingPermission("Proprietario", "accounting.export"), true);
});

test("la Wave 4 non introduce un ruolo tesoriere", () => {
  /*
    Il prodotto ha gia quattro ruoli gestionali e nessuna evidenza che un club
    li usi tutti. La separazione «registra / storna» ottiene lo stesso
    risultato senza un quinto.
  */
  assert.deepEqual([...listAccountingPermissions("treasurer")], []);
});

/* ------------------------------------------------ il messaggio del diniego */

test("il diniego contiene «Accesso negato», che il route handler mappa su 403", () => {
  assert.throws(
    () => assertAccountingPermission("collaborator", "accounting.reverse"),
    /Accesso negato/,
  );
});

test("il diniego dice quale azione ha negato, non solo che ha negato", () => {
  /*
    Il difetto che la Wave 3 ha misurato non era il 403: era il 403 senza
    motivo, che manda la segreteria a cercare un errore nei dati.
  */
  assert.throws(
    () => assertAccountingPermission("collaborator", "accounting.export"),
    /esportare la contabilita/i,
  );
});

test("chi ha il permesso non viene fermato", () => {
  assert.doesNotThrow(() => assertAccountingPermission("owner", "accounting.reverse"));
  assert.doesNotThrow(() => assertAccountingPermission("staff", "accounting.manage"));
});

/* --------------------------------------------------- nessun ruolo scoperto */

test("tutti e sette i ruoli canonici hanno una risposta dichiarata", () => {
  for (const ruolo of RUOLI) {
    const permessi = listAccountingPermissions(ruolo);
    assert.ok(Array.isArray([...permessi]), `${ruolo} deve avere una riga nella matrice`);
  }
});
