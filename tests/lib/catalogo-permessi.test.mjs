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
import {
  COMMUNICATION_PERMISSIONS,
  hasCommunicationPermission,
} from "../../src/lib/communications/permissions.ts";
import {
  ACCOUNTING_PERMISSIONS,
  hasAccountingPermission,
} from "../../src/lib/accounting/permissions.ts";
import { SEASON_PERMISSIONS } from "../../src/lib/seasons/permissions.ts";

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

/* ==========================================================================
   L'audit ostile della Wave 6: la domanda inversa
   ========================================================================== */

/**
 * Le chiavi che una guardia nomina **senza** essere in catalogo, con il motivo.
 *
 * Sono etichette di **audit**, non controlli: nominano l'atto nella riga di
 * diniego (`recordPermissionDenied`), mentre la decisione la prende un'altra
 * funzione. Metterle in catalogo darebbe all'editor una casella che non
 * governa niente, cioe l'esatto contrario di cio che il catalogo promette.
 */
const NON_SONO_CHIAVI = new Map([
  [
    "club_roles.assign",
    "etichetta di audit: a decidere e `assertMayGrantRole`, che confronta le chiavi del concedente con quelle del ruolo concesso",
  ],
  [
    "club_roles.manage",
    "etichetta di audit: a decidere e `assertPuoAmministrareAccessi`",
  ],
  [
    "club_roles.owner_only",
    "etichetta di audit: a decidere e `assertOwnerOnlyAction`, e gli atti riservati al proprietario non sono delegabili per definizione",
  ],
]);

/*
  **I due file che elencano i nomi delle azioni di audit, non dei permessi.**

  Sono cataloghi di **atti registrati**, con la stessa forma `dominio.cosa` dei
  permessi e un significato diverso: `sport_work.compensation.paid` e cio che e
  successo, non cio che qualcuno puo fare. Cercare li produrrebbe ventitre falsi
  positivi e nessun difetto.
*/
const CATALOGHI_DI_AUDIT = [
  path.join("lib", "server", "audit.ts"),
  path.join("lib", "sport-work", "audit-actions.ts"),
];

/*
  I domini che il catalogo conosce. Una stringa `dominio.qualcosa` in un file di
  guardia, con un dominio fra questi, e quasi certamente una chiave: e il
  criterio piu largo che non annega nei falsi positivi.
*/
/*
  **I domini si prendono dal catalogo E dai vocabolari dei domini.**

  Prendendoli dal solo catalogo, un dominio interamente assente era invisibile
  per costruzione: e cosi che quattordici chiavi di `communications` e
  `accounting` — «manda a chi non ha pagato», «storna un movimento» — sono
  vissute fuori da ogni casella. Una revisione ostile lo ha dimostrato
  inventando chiavi in domini orfani e ottenendo un verde.

  Prendere **tutte** le stringhe a forma di chiave non funziona: i segnaposto
  dei documenti e delle automazioni (`athlete.first_name`, `club.name`) hanno
  la stessa forma e non sono permessi. Il criterio giusto sta in mezzo — i
  domini che qualcuno dichiara come **vocabolario di permessi** — ed e chiuso
  dal controllo qui sotto, che pretende che ogni vocabolario stia in catalogo.
*/
const dominiNoti = () =>
  new Set(
    [
      ...listPermissionKeys(),
      ...VOCABOLARI_DI_DOMINIO.flatMap((voce) => voce.chiavi),
    ].map((chiave) => chiave.split(".")[0]),
  );

const CHIAVE_CITATA = new RegExp(
  String.raw`"([a-z][a-z_]*\.[a-z][a-z_.]*)"`,
  "g",
);

const chiaviChiesteDalleGuardie = () => {
  const domini = dominiNoti();
  const trovate = new Map();

  for (const file of SORGENTI) {
    const relativo = path.relative(RADICE, file);
    if (CATALOGHI_DI_AUDIT.includes(relativo)) continue;
    if (!eUnaGuardia(file) && !relativo.startsWith(path.join("lib", "roles")))
      continue;

    const testo = readFileSync(file, "utf8");
    CHIAVE_CITATA.lastIndex = 0;
    let match;
    while ((match = CHIAVE_CITATA.exec(testo))) {
      const chiave = match[1];
      if (!domini.has(chiave.split(".")[0])) continue;
      if (!trovate.has(chiave)) trovate.set(chiave, relativo);
    }
  }

  return trovate;
};

test("W6 · nessuna guardia chiede una chiave che il catalogo non conosce", () => {
  /*
    **La domanda inversa, e perche mancava.**

    Il presidio W5-D01 qui sopra dimostra che ogni chiave del catalogo e chiesta
    da qualcuno: catalogo → guardia. Nessuno dimostrava il verso opposto, e
    l'audit ostile della Wave 6 ha trovato li il difetto piu grave dei ruoli
    personalizzati.

    `data_subject.erase` — la cancellazione **irreversibile** del fascicolo di
    una persona, spesso di un minore — era protetta da una guardia che nominava
    quella stringa e da nessuna voce di catalogo. Conseguenza: la chiave non
    compariva nell'editor, quindi **non si poteva togliere**, e
    `narrowDomainPermission` la trattava con la regola «fuori catalogo = vale il
    ruolo base». Ogni ruolo personalizzato costruito su `club_manager` la
    portava con se. Le parole del revisore: «non si puo togliere la spunta,
    perche non c'e una spunta». Stessa forma per `seasons.change`.

    **Perche la ricerca e larga, e non elegante.** La prima stesura cercava solo
    `permission: "..."` e le chiamate ai verificatori — e **non avrebbe visto il
    difetto**, perche quella chiave arriva come argomento posizionale a una
    funzione di dominio. Un presidio che non trova il caso da cui nasce non e un
    presidio. Adesso guarda ogni stringa a forma di chiave in un dominio noto,
    e i due cataloghi di audit sono esclusi per nome.
  */
  const chieste = chiaviChiesteDalleGuardie();
  const conosciute = new Set(listPermissionKeys());
  const orfane = [];

  for (const [chiave, file] of chieste) {
    if (conosciute.has(chiave)) {
      assert.equal(
        NON_SONO_CHIAVI.has(chiave),
        false,
        `${chiave} e dichiarata «non e una chiave» ma sta in catalogo: togli la riga da NON_SONO_CHIAVI`,
      );
      continue;
    }
    if (NON_SONO_CHIAVI.has(chiave)) continue;
    orfane.push(`${chiave} (${file})`);
  }

  assert.deepEqual(
    orfane,
    [],
    `guardie che chiedono una chiave fuori catalogo: ${orfane.join(", ")}. ` +
      "Un potere che nessuna casella governa e un potere che il club non puo togliere: " +
      "mettila in catalogo, oppure dichiarala in NON_SONO_CHIAVI spiegando perche non e una chiave",
  );
});

test("W6 · la ricerca larga vede una chiave passata come argomento posizionale", () => {
  /*
    La prova che il presidio sopra non e vacuo, sul caso che lo ha generato:
    `data_subject.erase` non compare in nessuna forma `permission: "..."` — la
    guardia la riceve come terzo argomento — e deve comparire lo stesso fra le
    chiavi trovate.
  */
  const chieste = chiaviChiesteDalleGuardie();

  assert.ok(
    chieste.has("data_subject.erase"),
    "il presidio non vede la chiave che lo ha fatto nascere: e vacuo",
  );
  assert.ok(chieste.has("seasons.change"));
});

test("W6 · le due chiavi che governano il fascicolo di una persona sono di direzione", () => {
  /*
    Non basta che esistano: devono essere **riservate**. `isDirectionPermission`
    e vera solo se la chiave appartiene al solo `owner` piu `club_manager`, e
    da li discende che un ruolo personalizzato che la porta lo puo assegnare
    soltanto il proprietario. Cancellare i dati di una persona non si delega di
    rimbalzo.
  */
  for (const chiave of ["data_subject.export", "data_subject.erase"]) {
    const entry = getPermissionEntry(chiave);
    assert.ok(entry, `${chiave} deve stare in catalogo`);
    assert.deepEqual(
      [...entry.roles].sort(),
      ["club_manager", "owner"],
      `${chiave} deve essere una chiave di direzione`,
    );
  }
});

test("W6 · togliere la chiave toglie davvero il potere, e rimetterla lo ridà", () => {
  /*
    Il test che il §11.5 del mandato pretende, sulla chiave piu pericolosa del
    catalogo: «togli la permission → la feature sparisce; rimettila → la
    feature funziona».
  */
  const senza = "custom:club_manager:segreteria#members.register.read";
  const con = "custom:club_manager:segreteria#data_subject.erase";

  assert.equal(roleHasPermission(senza, "data_subject.erase"), false);
  assert.equal(roleHasPermission(con, "data_subject.erase"), true);

  // e il ruolo canonico non cambia comportamento
  assert.equal(roleHasPermission("club_manager", "data_subject.erase"), true);
  assert.equal(roleHasPermission("secretary", "data_subject.erase"), false);
});

/**
 * I vocabolari che ogni dominio con **matrice privata** dichiara per conto suo.
 *
 * Sono la fonte piu affidabile per sapere quali chiavi esistono davvero: un
 * dominio le elenca perche le usa, mentre un controllo che legge il sorgente
 * deve indovinare quali stringhe siano permessi.
 */
const VOCABOLARI_DI_DOMINIO = [
  { nome: "health", chiavi: HEALTH_PERMISSIONS },
  { nome: "sport_work", chiavi: SPORT_WORK_PERMISSIONS },
  { nome: "communications", chiavi: COMMUNICATION_PERMISSIONS },
  { nome: "accounting", chiavi: ACCOUNTING_PERMISSIONS },
  { nome: "seasons", chiavi: SEASON_PERMISSIONS },
];

test("W6 · ogni chiave che un dominio dichiara sta in catalogo", () => {
  /*
    **L'invariante che chiude la classe, e che il presidio testuale non poteva
    chiudere.**

    `narrowDomainPermission`, davanti a una chiave che il catalogo non conosce,
    risponde «vale il ruolo base»: un dominio con matrice privata puo quindi
    chiamare il restringimento e non restringere niente. E successo a
    `communications` e ad `accounting` — quattordici chiavi, fra cui «seleziona
    il pubblico in base alla posizione economica» e «storna un movimento» —
    mentre la documentazione presentava quei domini come **ponteggiati**.

    Il ponte c'era. Non reggeva nessun peso, perche il catalogo non conosceva
    le chiavi che ci passavano sopra.

    Le eccezioni si dichiarano qui con il motivo: una chiave che nessuna
    guardia interroga non entra in catalogo, perche darebbe all'editor una
    casella che non toglie niente.
  */
  const DICHIARATE_MA_NON_APPLICATE = new Map([
    [
      "board.read",
      "nessuna guardia la interroga: le schermate della bacheca decidono con altri criteri, e una casella che non toglie niente e il difetto opposto",
    ],
  ]);

  const conosciute = new Set(listPermissionKeys());
  const orfane = [];

  for (const { nome, chiavi } of VOCABOLARI_DI_DOMINIO) {
    for (const chiave of chiavi) {
      if (conosciute.has(chiave)) {
        assert.equal(
          DICHIARATE_MA_NON_APPLICATE.has(chiave),
          false,
          `${chiave} e dichiarata non applicata ma sta in catalogo: togli la riga`,
        );
        continue;
      }
      if (DICHIARATE_MA_NON_APPLICATE.has(chiave)) continue;
      orfane.push(`${chiave} (vocabolario ${nome})`);
    }
  }

  assert.deepEqual(
    orfane,
    [],
    `chiavi dichiarate da un dominio e assenti dal catalogo: ${orfane.join(", ")}. ` +
      "Fuori catalogo `narrowDomainPermission` risponde «vale il ruolo base»: " +
      "il restringimento di un ruolo personalizzato non arriva, e la casella non esiste",
  );
});

test("W6 · e restringere davvero toglie quei poteri a un ruolo personalizzato", () => {
  /*
    La prova sul comportamento, sulle due chiavi piu pesanti dei due domini che
    erano scoperti: chi non le ha non le esercita, chi le ha si, e il ruolo
    canonico non cambia.
  */
  const senza = "custom:club_manager:segreteria#members.register.read";
  const con =
    "custom:club_manager:segreteria#communications.audience_economic,accounting.reverse";

  assert.equal(hasCommunicationPermission(senza, "communications.audience_economic"), false);
  assert.equal(hasCommunicationPermission(con, "communications.audience_economic"), true);
  assert.equal(hasAccountingPermission(senza, "accounting.reverse"), false);
  assert.equal(hasAccountingPermission(con, "accounting.reverse"), true);

  assert.equal(hasCommunicationPermission("club_manager", "communications.audience_economic"), true);
  assert.equal(hasAccountingPermission("club_manager", "accounting.reverse"), true);
  assert.equal(hasAccountingPermission("trainer", "accounting.read"), false);
});
