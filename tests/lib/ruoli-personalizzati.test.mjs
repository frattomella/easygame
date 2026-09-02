import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOM_ROLE_BASE_ROLES,
  buildCustomRoleSlug,
  canAccessClubResource,
  canAccessPath,
  canManageClubConfiguration,
  canManageClubConfigurationAsActor,
  encodeCustomRoleToken,
  getAccessRoleLabel,
  isCustomRoleValue,
  normalizeAccessRole,
  parseCustomRoleValue,
} from "../../src/lib/access-roles.ts";
import {
  listPermissionsForRole,
  roleHasPermission,
} from "../../src/lib/permissions/catalog.ts";
import {
  LINK_GATED_PERMISSION_KEYS,
  assertMayGrantRole,
  isDirectionPermission,
  isOwnerActor,
  listGrantablePermissions,
  validateCustomRoleDraft,
} from "../../src/lib/roles/custom-role.ts";
import {
  accessScopeAllows,
  normalizeAccessScopes,
} from "../../src/lib/roles/access-scope.ts";
import { hasHealthPermission } from "../../src/lib/health/permissions.ts";
import { canReadConsentRecords } from "../../src/lib/consents/permissions.ts";

/**
 * **I ruoli personalizzati, dalla parte del dominio** (Wave 6, lane 6G, W6-1).
 *
 * La maggioranza di questi controlli prova **il diniego**: un test che provasse
 * solo cio che un ruolo puo fare passerebbe anche se il tetto non ci fosse.
 *
 * La proprieta che tiene insieme tutto e una sola, ed e §10.1 del piano:
 *
 * > un ruolo personalizzato e un **sottoinsieme** delle chiavi del suo ruolo
 * > base, mai un soprainsieme.
 *
 * E la sua conseguenza operativa, che e la ragione per cui il gettone porta le
 * chiavi: **togliere una chiave la toglie davvero**, in tutte e quindici le
 * guardie di dominio, senza che nessuna di loro sappia che i ruoli
 * personalizzati esistono.
 */

const SEGRETERIA = "custom:collaborator:segreteria";
const DIRETTORE = "custom:staff:direttore-sportivo";

/* ========================================== la grammatica dello slug === */

test("uno slug personalizzato si normalizza sul proprio ruolo base", () => {
  assert.equal(normalizeAccessRole(SEGRETERIA), "collaborator");
  assert.equal(normalizeAccessRole(DIRETTORE), "staff");
  assert.equal(normalizeAccessRole("custom:trainer:vice"), "trainer");
});

test("una base non ammessa o malformata non e un ruolo", () => {
  // `owner` non e clonabile: la proprieta e strutturale, non un modello.
  assert.equal(normalizeAccessRole("custom:owner:super"), "");
  assert.equal(normalizeAccessRole("custom:parent:tutore"), "");
  assert.equal(normalizeAccessRole("custom:athlete:capitano"), "");
  assert.equal(normalizeAccessRole("custom:segreteria"), "");
  assert.equal(normalizeAccessRole("custom:collaborator:"), "");
  assert.equal(normalizeAccessRole("custom:collaborator:Segre teria"), "");
  assert.equal(normalizeAccessRole("custom:"), "");
  assert.equal(isCustomRoleValue("collaborator"), false);
});

test("owner e club_manager non sono clonabili allo stesso modo", () => {
  assert.deepEqual([...CUSTOM_ROLE_BASE_ROLES], [
    "club_manager",
    "collaborator",
    "staff",
    "trainer",
  ]);
  assert.equal(buildCustomRoleSlug("owner", "Super"), "");
  assert.equal(
    buildCustomRoleSlug("collaborator", "Segreteria e iscrizioni"),
    "custom:collaborator:segreteria-e-iscrizioni",
  );
});

test("il gettone porta le chiavi e lo slug resta leggibile", () => {
  const gettone = encodeCustomRoleToken(SEGRETERIA, [
    "documents.review",
    "documents.request",
  ]);
  const letto = parseCustomRoleValue(gettone);

  assert.equal(letto.slug, SEGRETERIA);
  assert.equal(letto.baseRole, "collaborator");
  assert.deepEqual(letto.permissions, ["documents.request", "documents.review"]);
  assert.equal(normalizeAccessRole(gettone), "collaborator");
  assert.equal(getAccessRoleLabel(SEGRETERIA), "Segreteria");
  assert.equal(
    getAccessRoleLabel(DIRETTORE),
    "Direttore sportivo",
  );
});

/* ================================= il tetto: mai piu del ruolo base === */

test("un ruolo personalizzato non porta nessuna chiave fuori dal ruolo base", () => {
  // `sport_work.read` e solo della direzione: elencarla nel gettone non basta.
  const gettone = encodeCustomRoleToken(SEGRETERIA, [
    "documents.review",
    "sport_work.read",
    "members.register.manage",
  ]);

  assert.equal(roleHasPermission(gettone, "documents.review"), true);
  assert.equal(roleHasPermission(gettone, "sport_work.read"), false);
  assert.equal(roleHasPermission(gettone, "members.register.manage"), false);
});

test("una chiave non concessa e negata anche se il ruolo base ce l'ha", () => {
  const gettone = encodeCustomRoleToken(SEGRETERIA, ["documents.review"]);

  assert.equal(roleHasPermission("collaborator", "consents.records.read"), true);
  assert.equal(roleHasPermission(gettone, "consents.records.read"), false);
});

test("uno slug senza chiavi non concede niente: default negato", () => {
  // E la riga letta dall'archivio, che le chiavi non le porta.
  for (const chiave of listPermissionsForRole("collaborator")) {
    assert.equal(roleHasPermission(SEGRETERIA, chiave.key), false);
  }
});

test("il restringimento arriva ai domini senza che i domini lo sappiano", () => {
  const conClinico = encodeCustomRoleToken(SEGRETERIA, [
    "clinical.status_read",
    "clinical.read",
  ]);
  const senzaClinico = encodeCustomRoleToken(SEGRETERIA, ["documents.review"]);

  assert.equal(hasHealthPermission(conClinico, "clinical.read"), true);
  assert.equal(hasHealthPermission(senzaClinico, "clinical.read"), false);
  assert.equal(hasHealthPermission("collaborator", "clinical.read"), true);

  assert.equal(
    canReadConsentRecords(
      encodeCustomRoleToken(SEGRETERIA, ["consents.records.read"]),
    ),
    true,
  );
  assert.equal(canReadConsentRecords(senzaClinico), false);
});

test("la matrice per risorsa risponde come il ruolo base, mai di piu", () => {
  const gettone = encodeCustomRoleToken(SEGRETERIA, ["documents.review"]);

  assert.equal(canAccessClubResource(gettone, "athletes", "read"), true);
  assert.equal(canAccessClubResource(gettone, "bank_accounts", "read"), false);
  assert.equal(canAccessClubResource(gettone, "sport_work", "read"), false);
  assert.equal(canAccessClubResource(gettone, "payments", "delete"), false);

  const daGestore = encodeCustomRoleToken(
    "custom:club_manager:controllo",
    ["audit.read"],
  );

  /*
    **«Come il ruolo base, mai di piu» non basta quando la base e la
    direzione.**

    Questa riga pretendeva `true` su `bank_accounts`, cioe registrava come
    corretto il comportamento che una revisione ha poi misurato come
    scalata: un ruolo di club con **una chiave** leggeva i conti correnti,
    i modelli di documento e `access_tokens` — il codice d'accesso delle
    famiglie in chiaro — e ne coniava di nuovi.

    Le risorse riservate alla direzione non hanno una chiave di catalogo con
    cui concederle: sono il perimetro del proprietario e del gestore
    **canonici**. Un ruolo ristretto non le riceve per il fatto di essere
    basato su uno di loro, come gia non riceve l'amministrazione degli
    accessi.
  */
  assert.equal(canAccessClubResource(daGestore, "bank_accounts", "read"), false);
  assert.equal(canAccessClubResource(daGestore, "access_tokens", "read"), false);

  /* e cio che e aperto alla gestione resta aperto */
  assert.equal(canAccessClubResource(daGestore, "categories", "read"), true);
  assert.equal(canAccessClubResource("club_manager", "bank_accounts", "read"), true);

  /*
    Il predicato del **soffitto** continua a rispondere sulla base — le
    matrici di dominio lo chiamano cosi, e le chiavi concesse restringono
    dopo. Quello che autorizza **l'attore** no.
  */
  assert.equal(canManageClubConfiguration(daGestore), true);
  assert.equal(canManageClubConfiguration(gettone), false);
  assert.equal(canManageClubConfigurationAsActor(daGestore), false);
  assert.equal(canManageClubConfigurationAsActor("club_manager"), true);
});

test("le guardie di percorso vedono il ruolo base", () => {
  const gettone = encodeCustomRoleToken(SEGRETERIA, ["documents.review"]);

  assert.equal(canAccessPath(gettone, "/dashboard"), true);
  assert.equal(canAccessPath(gettone, "/athletes"), true);
  assert.equal(canAccessPath(gettone, "/dashboard/access-management"), false);
  assert.equal(canAccessPath(gettone, "/sport-work"), false);
  assert.equal(canAccessPath(gettone, "/trainer-dashboard"), false);
  // `/audit` e gestionale: chi decide e la chiave, non il prefisso.
  assert.equal(canAccessPath(gettone, "/audit"), true);
});

/* ====================== cosa si puo mettere in un ruolo: la validazione === */

test("le tre chiavi di legame non sono mai concedibili", () => {
  assert.deepEqual([...LINK_GATED_PERMISSION_KEYS], [
    "consents.decide_own",
    "documents.submit_own",
    "rsvp.answer",
  ]);

  for (const base of CUSTOM_ROLE_BASE_ROLES) {
    const concedibili = listGrantablePermissions(base).map((voce) => voce.key);
    for (const chiave of LINK_GATED_PERMISSION_KEYS) {
      assert.equal(
        concedibili.includes(chiave),
        false,
        `${chiave} non deve essere concedibile a ${base}`,
      );
    }
  }
});

test("una chiave di legame in una bozza fa fallire la validazione", () => {
  assert.throws(
    () =>
      validateCustomRoleDraft({
        name: "Segreteria",
        baseRole: "collaborator",
        permissions: ["documents.review", "documents.submit_own"],
      }),
    /legame/i,
  );
});

test("una chiave fuori dal ruolo base fa fallire la validazione", () => {
  assert.throws(
    () =>
      validateCustomRoleDraft({
        name: "Segreteria",
        baseRole: "collaborator",
        permissions: ["sport_work.read"],
      }),
    /sottoinsieme/i,
  );
});

test("una chiave inventata, un ruolo base inventato e un ruolo vuoto falliscono", () => {
  assert.throws(
    () =>
      validateCustomRoleDraft({
        name: "Segreteria",
        baseRole: "collaborator",
        permissions: ["documents.tutto"],
      }),
    /non esiste nel catalogo/,
  );
  assert.throws(
    () =>
      validateCustomRoleDraft({
        name: "Super",
        baseRole: "owner",
        permissions: ["audit.read"],
      }),
    /non e clonabile/,
  );
  assert.throws(
    () =>
      validateCustomRoleDraft({
        name: "Vuoto",
        baseRole: "staff",
        permissions: [],
      }),
    /nessun permesso/,
  );
  assert.throws(
    () =>
      validateCustomRoleDraft({
        name: "ab",
        baseRole: "staff",
        permissions: ["events.read"],
      }),
    /tre caratteri/,
  );
});

test("ogni chiave proposta e davvero restringibile, anche fuori dal catalogo", async () => {
  /*
    **Il presidio che ha sostituito un elenco di esclusioni.**

    La lane 6G aveva escluso le cinque chiavi `sport_work.*` dall'editor,
    perche `hasSportWorkPermission` risponde da una matrice privata che
    normalizza il ruolo — e vede quindi il ruolo **base**: togliere la spunta
    non avrebbe tolto niente.

    Nascondere una casella pero non e renderla vera: si smetteva di mostrarla
    **e** di poterla togliere. Adesso le quattro matrici private applicano il
    restringimento (`narrowDomainPermission`), e le cinque chiavi sono
    concedibili come tutte le altre.

    Questo test prova la proprieta invece dell elenco: **ogni** chiave che
    l editor propone deve rispondere in modo diverso quando e concessa e
    quando non lo e. Una casella che non cambia niente lo fa fallire.
  */
  const { roleHasPermission } = await import(
    "../../src/lib/permissions/catalog.ts"
  );
  const { hasSportWorkPermission } = await import(
    "../../src/lib/sport-work/permissions.ts"
  );

  const chiedi = (gettone, chiave) =>
    chiave.startsWith("sport_work.")
      ? hasSportWorkPermission(gettone, chiave)
      : roleHasPermission(gettone, chiave);

  for (const base of CUSTOM_ROLE_BASE_ROLES) {
    for (const voce of listGrantablePermissions(base)) {
      const concessa = `custom:${base}:prova#${voce.key}`;
      const negata = `custom:${base}:prova#`;

      assert.equal(
        chiedi(concessa, voce.key),
        true,
        `${voce.key} concessa a un ruolo su ${base} deve rispondere di si`,
      );
      assert.equal(
        chiedi(negata, voce.key),
        false,
        `${voce.key} tolta a un ruolo su ${base} deve rispondere di no: una casella che non cambia niente e la promessa vuota che questa lane esiste per smontare`,
      );
    }
  }
});
test("le chiavi di direzione si riconoscono dal catalogo, non da un elenco", () => {
  assert.equal(isDirectionPermission("audit.read"), true);
  assert.equal(isDirectionPermission("sport_work.pay"), true);
  assert.equal(isDirectionPermission("members.register.manage"), true);
  assert.equal(isDirectionPermission("documents.review"), false);
  assert.equal(isDirectionPermission("events.manage"), false);
});

/* ================================ i due ruoli del mandato (§24) === */

test("Segreteria da Collaborator: documenti e famiglie, niente compensi", () => {
  const valido = validateCustomRoleDraft({
    name: "Segreteria",
    baseRole: "collaborator",
    permissions: [
      "documents.request",
      "documents.review",
      "documents.read_dossier",
      "appointments.read",
      "appointments.manage",
      "consents.decide_for_others",
      "consents.records.read",
      "members.register.read",
      "clinical.status_read",
      "accounts.athlete.manage",
    ],
  });

  assert.equal(valido.slug, SEGRETERIA);
  assert.equal(valido.baseRole, "collaborator");
  assert.equal(valido.containsDirectionKeys, false);

  const gettone = encodeCustomRoleToken(valido.slug, valido.permissions);
  assert.equal(roleHasPermission(gettone, "documents.review"), true);
  assert.equal(roleHasPermission(gettone, "appointments.manage"), true);
  // Niente compensi, niente configurazione contabile, niente proprieta.
  assert.equal(roleHasPermission(gettone, "sport_work.read_own"), false);
  assert.equal(roleHasPermission(gettone, "sport_work.read"), false);
  assert.equal(roleHasPermission(gettone, "audit.read"), false);
  assert.equal(canAccessClubResource(gettone, "sport_work", "read"), false);
  assert.equal(canAccessClubResource(gettone, "bank_accounts", "read"), false);
  assert.equal(isOwnerActor(gettone), false);
});

test("Direttore Sportivo da Staff: eventi e programmazione, niente denaro", () => {
  const valido = validateCustomRoleDraft({
    name: "Direttore Sportivo",
    baseRole: "staff",
    permissions: [
      "events.read",
      "events.manage",
      "events.convoke",
      "events.attendance",
      "rsvp.read",
      "clinical.status_read",
    ],
  });

  assert.equal(valido.slug, DIRETTORE);
  const gettone = encodeCustomRoleToken(valido.slug, valido.permissions);

  assert.equal(roleHasPermission(gettone, "events.convoke"), true);
  assert.equal(roleHasPermission(gettone, "rsvp.read"), true);
  assert.equal(roleHasPermission(gettone, "documents.review"), false);
  assert.equal(roleHasPermission(gettone, "consents.records.read"), false);
  assert.equal(roleHasPermission(gettone, "sport_work.read"), false);
  assert.equal(canAccessClubResource(gettone, "bank_accounts", "read"), false);
});

/* ================================ i quattro tentativi di escalation === */

test("escalation 1 · un gestore non concede `owner`", () => {
  assert.throws(
    () => assertMayGrantRole("club_manager", { role: "owner" }),
    /Accesso negato/,
  );
  assert.throws(
    () => assertMayGrantRole("collaborator", { role: "staff" }),
    /Accesso negato/,
  );
  // Il proprietario si, ed e l'unico.
  assert.doesNotThrow(() => assertMayGrantRole("owner", { role: "owner" }));
});

test("escalation 2 · non si concede una chiave che non si ha", () => {
  const segreteria = encodeCustomRoleToken(
    "custom:club_manager:vice",
    ["documents.review"],
  );

  assert.throws(
    () =>
      assertMayGrantRole(segreteria, {
        role: SEGRETERIA,
        permissions: ["documents.review", "consents.records.read"],
      }),
    /non ha/,
  );

  assert.doesNotThrow(() =>
    assertMayGrantRole(segreteria, {
      role: SEGRETERIA,
      permissions: ["documents.review"],
    }),
  );
});

test("escalation 3 · una chiave di legame non si concede a un ruolo", () => {
  assert.throws(
    () =>
      assertMayGrantRole("owner", {
        role: SEGRETERIA,
        permissions: ["rsvp.answer"],
      }),
    /legame/,
  );
});

test("escalation 4 · un ruolo con chiavi di direzione lo assegna solo il proprietario", () => {
  const conDirezione = {
    role: "custom:club_manager:controllo",
    permissions: ["audit.read"],
  };

  assert.throws(
    () => assertMayGrantRole("club_manager", conDirezione),
    /proprietario/,
  );
  assert.doesNotThrow(() => assertMayGrantRole("owner", conDirezione));
});

test("un ruolo personalizzato non e mai `owner`, nemmeno se si chiama cosi", () => {
  const finto = encodeCustomRoleToken("custom:club_manager:owner", [
    "audit.read",
  ]);
  assert.equal(isOwnerActor(finto), false);
  assert.equal(isOwnerActor("club_manager"), false);
  assert.equal(isOwnerActor("owner"), true);
  assert.throws(
    () => assertMayGrantRole(finto, { role: "owner" }),
    /proprietario/,
  );
});

/* ============================================ il perimetro (§9.3) === */

test("zero righe di perimetro significa tutto il club", () => {
  assert.equal(accessScopeAllows([], { siteId: "s1", categoryId: "c1" }), true);
  assert.equal(accessScopeAllows(null, { siteId: null }), true);
});

test("un perimetro per sede esclude le altre sedi e i dati senza sede", () => {
  const perimetro = [{ kind: "site", value: "scauri" }];

  assert.equal(accessScopeAllows(perimetro, { siteId: "scauri" }), true);
  assert.equal(accessScopeAllows(perimetro, { siteId: "santi-cosma" }), false);
  assert.equal(accessScopeAllows(perimetro, { siteId: null }), false);
});

test("i due assi sono in AND, i valori dentro un asse in OR", () => {
  const perimetro = [
    { kind: "site", value: "scauri" },
    { kind: "site", value: "santi-cosma" },
    { kind: "category", value: "pulcini" },
  ];

  assert.equal(
    accessScopeAllows(perimetro, { siteId: "scauri", categoryId: "pulcini" }),
    true,
  );
  assert.equal(
    accessScopeAllows(perimetro, {
      siteId: "santi-cosma",
      categoryId: "pulcini",
    }),
    true,
  );
  assert.equal(
    accessScopeAllows(perimetro, { siteId: "scauri", categoryId: "esordienti" }),
    false,
  );
});

test("un perimetro malformato viene scartato, non interpretato", () => {
  assert.deepEqual(
    normalizeAccessScopes([
      { kind: "site", value: "scauri" },
      { kind: "gruppo", value: "pulcini-scauri" },
      { kind: "category", value: "" },
      { kind: "site", value: "scauri" },
    ]),
    [{ kind: "site", value: "scauri" }],
  );
});
