import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

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
  canManageDocumentTemplates,
  canReadDocumentTemplates,
} from "../../src/lib/documents/permissions.ts";
import {
  canManageConsentDefinitions,
  canReadConsentRecords,
  canRecordConsentDecision,
} from "../../src/lib/consents/permissions.ts";
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
  assert.equal(canAccessClubResource("collaborator", "club_events", "read"), true);
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

/* ------------------------------------------------------------------------ */
/*  W5-D01 — il presidio che mancava                                        */
/* ------------------------------------------------------------------------ */

/**
 * **Una chiave in un catalogo non e un permesso finche una strada non la
 * chiede.**
 *
 * Questo file verificava etichette, duplicati e appartenenza ai ruoli — mai che
 * una chiave fosse **interrogata** da qualche parte. Cosi nove chiavi su
 * trentatre non le chiedeva nessuno, e cinque di esse collassavano a runtime su
 * un unico interruttore: `documents.templates.read` decideva anche la
 * generazione, la rilettura, l'avanzamento di stato, la registrazione dei
 * consensi per conto terzi e la lettura del registro consensi.
 *
 * Un catalogo che elenca chiavi non applicate e **peggio di un catalogo
 * assente**: promette una configurabilita che non c'e, e il giorno dei ruoli
 * personalizzati un club spunta cinque caselle che agiscono su un bit solo.
 *
 * Il presidio e questo, e va tenuto verde: se una chiave nuova entra in
 * catalogo senza che nessuno la chieda, questo test lo dice subito invece di
 * lasciarlo scoprire a un audit fra tre Wave.
 */

const RADICE = path.join(process.cwd(), "src");

const sorgentiDi = (cartella) => {
  const trovate = [];
  const visita = (corrente) => {
    for (const voce of readdirSync(corrente)) {
      const completo = path.join(corrente, voce);
      if (statSync(completo).isDirectory()) {
        visita(completo);
      } else if (/\.(ts|tsx)$/.test(voce)) {
        trovate.push(completo);
      }
    }
  };
  visita(cartella);
  return trovate;
};

/**
 * **Quando una chiave e «chiesta».**
 *
 * Non basta che la stringa compaia da qualche parte: comparirebbe in ogni
 * elenco che la dichiara, e un elenco non e una domanda. E la ragione per cui
 * il difetto e sopravvissuto a un test che gia leggeva il catalogo.
 *
 * Si usa la definizione operativa del debito W5-D01, che e anche quella con cui
 * l'audit lo ha trovato:
 *
 * - una occorrenza sotto `src/lib/server/**` o `src/app/api/**` conta sempre —
 *   li vivono le guardie, e una chiave nominata li e una chiave applicata;
 * - altrove conta solo se sta sulla **riga di una chiamata** a un verificatore
 *   (`roleHasPermission`, `hasSportWorkPermission`, `assertClinicalPermission`,
 *   …), cioe se qualcuno la sta davvero interrogando.
 */
const SORGENTI = sorgentiDi(RADICE).filter(
  (file) => !file.endsWith(path.join("permissions", "catalog.ts")),
);

const eUnaGuardia = (file) =>
  file.includes(path.join("lib", "server")) ||
  file.includes(path.join("app", "api"));

const chiaveInterrogata = (chiave) => {
  const citazioni = [JSON.stringify(chiave), `'${chiave}'`];

  for (const file of SORGENTI) {
    const testo = readFileSync(file, "utf8");
    if (!citazioni.some((c) => testo.includes(c))) continue;

    if (eUnaGuardia(file)) return true;

    for (const riga of testo.split("\n")) {
      if (!citazioni.some((c) => riga.includes(c))) continue;
      if (/Permissions?\s*\(/.test(riga)) return true;
    }
  }

  return false;
};

/**
 * Le chiavi che **non** sono ancora chieste da nessuno, con il motivo.
 *
 * Ogni voce e un debito dichiarato, non un'assoluzione: quando la superficie
 * che la consuma nasce, la riga sparisce da qui.
 */
const NON_ANCORA_CHIESTE = new Map([
  /*
    **L'elenco e vuoto, ed e il punto.**

    `sport_work.read_own` era l'ultima voce: la superficie «i miei compensi»
    non esisteva e la chiave proteggeva un atto che nessuno poteva compiere.
    La lane 6C l'ha costruita — `/trainer-dashboard/compensi` e
    `GET /api/v1/sport-work/me`, che chiede questa chiave e non
    `sport_work.read` — e la riga e sparita da qui, come il commento di sopra
    prometteva.

    Chi aggiunge una chiave al catalogo senza innestarla in una guardia trova
    ora un test rosso e nessuna eccezione da imitare. Se ne serve una,
    aggiungerla qui e dichiarare **perche**: un debito con un nome sopra e
    un'altra cosa da una svista.
  */
]);

test("W5-D01 · ogni chiave del catalogo e chiesta da qualcuno", () => {
  const mute = [];

  for (const chiave of listPermissionKeys()) {
    const chiesta = chiaveInterrogata(chiave);

    if (chiesta) {
      assert.equal(
        NON_ANCORA_CHIESTE.has(chiave),
        false,
        `${chiave} e dichiarata «non ancora chiesta» ma qualcuno la chiede: togli la riga dall'elenco`,
      );
      continue;
    }

    if (NON_ANCORA_CHIESTE.has(chiave)) continue;
    mute.push(chiave);
  }

  assert.deepEqual(
    mute,
    [],
    `chiavi in catalogo che nessuno interroga: ${mute.join(", ")}. Una chiave non applicata promette una configurabilita che non c'e`,
  );
});

test("W5-D01 · le cinque chiavi non collassano piu su documents.templates.read", () => {
  /*
    Il perno del difetto era una funzione privata di due righe in
    `src/lib/documents/permissions.ts` che rispondeva per tutte:

        const canStandBeforeADocument = (role) =>
          roleHasPermission(role, "documents.templates.read");

    Restava l'unica chiamata a `roleHasPermission` dell'intero file.
  */
  const documenti = readFileSync(
    path.join(RADICE, "lib", "documents", "permissions.ts"),
    "utf8",
  );

  for (const chiave of [
    "documents.templates.manage",
    "documents.generate",
    "documents.generated.read",
    "documents.generated.advance",
  ]) {
    assert.ok(
      documenti.includes(`"${chiave}"`),
      `${chiave} deve essere chiesta dal modulo che decide quell'atto`,
    );
  }

  /*
    E i tre atti sui consensi non li decide piu il dominio dei documenti: una
    chiave di *documenti* che governa un atto sui *consensi* rende
    irrappresentabile un ruolo «segreteria consensi» che non veda i modelli.
  */
  const consensi = readFileSync(
    path.join(RADICE, "lib", "consents", "permissions.ts"),
    "utf8",
  );
  for (const chiave of [
    "consents.definitions.manage",
    "consents.decide_for_others",
    "consents.records.read",
  ]) {
    assert.ok(consensi.includes(`"${chiave}"`), `${chiave} non e chiesta`);
    assert.equal(
      documenti.includes(`"${chiave}"`),
      false,
      `${chiave} e un atto sui consensi: non la decide il dominio dei documenti`,
    );
  }
});

test("W5-D01 · le tre chiavi cablate su owner||club_manager passano dal catalogo", () => {
  /*
    Peggio del collasso su un interruttore: `canManageClubConfiguration` non
    passa da **nessuna** chiave, quindi un motore di ruoli personalizzati non
    avrebbe avuto niente da leggere e quelle tre caselle non avrebbero agito
    affatto.
  */
  const soci = readFileSync(
    path.join(RADICE, "lib", "members", "permissions.ts"),
    "utf8",
  );
  assert.ok(soci.includes('"members.register.manage"'));

  const documenti = readFileSync(
    path.join(RADICE, "lib", "documents", "permissions.ts"),
    "utf8",
  );
  assert.ok(documenti.includes('"documents.templates.manage"'));

  const consensi = readFileSync(
    path.join(RADICE, "lib", "consents", "permissions.ts"),
    "utf8",
  );
  assert.ok(consensi.includes('"consents.definitions.manage"'));
});

test("W5-D01 · il comportamento non cambia: gli stessi ruoli di prima", () => {
  /*
    L'innesto delle nove chiavi non e una restrizione ne un allargamento. Il
    catalogo dava gia esattamente i ruoli che le funzioni cablate rispondevano,
    e questa e la prova che il passaggio e stato a saldo zero.
  */
  for (const ruolo of ["owner", "club_manager"]) {
    assert.equal(canManageDocumentTemplates(ruolo), true);
    assert.equal(canManageConsentDefinitions(ruolo), true);
    assert.equal(canManageMembershipRegister(ruolo), true);
  }

  for (const ruolo of ["collaborator", "staff"]) {
    assert.equal(canManageDocumentTemplates(ruolo), false);
    assert.equal(canManageConsentDefinitions(ruolo), false);
    assert.equal(canManageMembershipRegister(ruolo), false);

    // Gli atti operativi restano alla segreteria.
    assert.equal(canReadDocumentTemplates(ruolo), true);
    assert.equal(canRecordConsentDecision(ruolo), true);
    assert.equal(canReadConsentRecords(ruolo), true);
    assert.equal(canAdvanceGeneratedDocument(ruolo), true);
  }

  for (const ruolo of ["trainer", "parent", "athlete"]) {
    assert.equal(canReadDocumentTemplates(ruolo), false);
    assert.equal(canRecordConsentDecision(ruolo), false);
    assert.equal(canReadConsentRecords(ruolo), false);
    assert.equal(canManageMembershipRegister(ruolo), false);
  }
});
