import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { readFileSync } from "node:fs";
import { createFakePrisma } from "../helpers/fake-prisma.mjs";
import { assertMayGrantRole } from "../../src/lib/roles/custom-role.ts";
import { PERMISSION_CATALOG } from "../../src/lib/permissions/catalog.ts";

/**
 * Le tre scalate che l'audit ostile della Wave 6 ha trovato nei ruoli
 * personalizzati.
 *
 * Hanno la stessa forma, e vale la pena nominarla: **una difesa scritta per il
 * caso difficile, e non applicata al caso facile**.
 *
 *  1. `assertMayGrantRole` confrontava le chiavi solo quando il ruolo
 *     concesso era **personalizzato**. Un ruolo canonico usciva prima, e un
 *     ruolo personalizzato ristretto poteva concedere il proprio ruolo base
 *     **intero** a un complice;
 *  2. `assertConcessioneDiAccessoLecita` era su tre scrittori di
 *     `organization_users` e non sul quarto, la modifica — che e proprio
 *     quello che serve per farlo **su se stessi**;
 *  3. `updateAssignmentScopes` non aveva il divieto «su se stessi» che le sue
 *     due sorelle hanno, e zero righe di perimetro valgono tutto il club.
 *
 * Due revisioni indipendenti hanno trovato la prima. La sonda dei ruoli la
 * sfiorava: provava lo stesso scenario concedendo un ruolo **personalizzato**,
 * cioe la porta che era gia presidiata.
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";

/** Un gettone di «Segreteria»: base `club_manager`, una chiave sola. */
const SEGRETERIA_RISTRETTA = "custom:club_manager:segreteria#members.register.read";

/* ================================================================= 1. la concessione */

test("un ruolo personalizzato ristretto non concede il proprio ruolo base intero", () => {
  /*
    E l'attacco, per intero: il titolare di una «Segreteria» basata su
    `club_manager` con una chiave sola concede `club_manager` **canonico** a
    una seconda utenza propria. L'auto-assegnazione era gia vietata; darlo a un
    complice no.
  */
  assert.throws(
    () => assertMayGrantRole(SEGRETERIA_RISTRETTA, { role: "club_manager" }),
    /Accesso negato/,
    "concedere il proprio ruolo base intero e concedere piu di quanto si ha",
  );
});

test("e non concede nessun altro ruolo canonico che porti chiavi che non ha", () => {
  for (const ruolo of ["secretary", "collaborator", "staff", "trainer"]) {
    assert.throws(
      () => assertMayGrantRole(SEGRETERIA_RISTRETTA, { role: ruolo }),
      /Accesso negato/,
      `«${ruolo}» porta chiavi che una segreteria con una chiave sola non ha`,
    );
  }
});

test("un gestore canonico continua a concedere ogni ruolo canonico", () => {
  /*
    La correzione non deve stringere chi non c'entra. `club_manager` porta un
    soprainsieme delle chiavi di ogni altro ruolo canonico — verificato qui
    sotto sul catalogo, non affermato — quindi la nuova regola non gli toglie
    niente.
  */
  for (const ruolo of ["club_manager", "secretary", "collaborator", "staff", "trainer"]) {
    assert.doesNotThrow(
      () => assertMayGrantRole("club_manager", { role: ruolo }),
      `un gestore canonico deve poter nominare un ${ruolo}`,
    );
  }
});

test("il catalogo giustifica la regola: club_manager porta tutto cio che portano gli altri", () => {
  /*
    La prova sopra funziona **perche** questa proprieta e vera. Se un giorno una
    chiave nascesse su un ruolo e non su `club_manager`, la regola nuova
    impedirebbe a un gestore di nominare quel ruolo — e si scoprirebbe qui,
    con il nome della chiave, invece che in produzione.
  */
  const chiaviDi = (ruolo) =>
    PERMISSION_CATALOG.filter((entry) => entry.roles.includes(ruolo)).map(
      (entry) => entry.key,
    );

  const gestore = new Set(chiaviDi("club_manager"));
  for (const ruolo of ["secretary", "collaborator", "staff", "trainer"]) {
    const fuori = chiaviDi(ruolo).filter((chiave) => !gestore.has(chiave));
    assert.deepEqual(
      fuori,
      [],
      `«${ruolo}» porta chiavi che club_manager non ha: ${fuori.join(", ")}`,
    );
  }
});

test("un ruolo personalizzato completo concede il proprio base: la regola guarda le chiavi, non il nome", () => {
  const chiaviGestore = PERMISSION_CATALOG.filter((entry) =>
    entry.roles.includes("club_manager"),
  ).map((entry) => entry.key);

  const completo = `custom:club_manager:vice#${chiaviGestore.join(",")}`;

  assert.doesNotThrow(
    () => assertMayGrantRole(completo, { role: "club_manager" }),
    "chi porta tutte le chiavi del gestore non sta concedendo piu di se stesso",
  );
});

test("nessuno che non sia proprietario concede «owner»", () => {
  for (const attore of [SEGRETERIA_RISTRETTA, "club_manager", "secretary"]) {
    assert.throws(
      () => assertMayGrantRole(attore, { role: "owner" }),
      /Accesso negato/,
      `${attore} non deve poter creare un proprietario`,
    );
  }
});

/* ============================================== 2. la quarta porta su organization_users */

let resources;
let setPrismaClientForTests;
let fake;

const scopeSegreteria = () => ({
  userId: "user-segreteria",
  activeOrganizationId: CLUB_A,
  activeRole: SEGRETERIA_RISTRETTA,
  allowedOrganizationIds: [CLUB_A],
  accessScopes: [],
});

const seed = () => ({
  organizationUser: [
    {
      id: "tessera-propria",
      organization_id: CLUB_A,
      user_id: "user-segreteria",
      role: "custom:club_manager:segreteria",
      custom_role_id: "ruolo-1",
      is_primary: true,
    },
    {
      id: "tessera-proprietario",
      organization_id: CLUB_A,
      user_id: "user-presidente",
      role: "owner",
      custom_role_id: null,
      is_primary: true,
    },
  ],
  club: [{ id: CLUB_A, creator_id: "user-presidente" }],
  auditLog: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  resources = await import("../../src/lib/server/resources.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

test("la modifica della propria tessera non si promuove a proprietario", async () => {
  /*
    `role` e `custom_role_id` sono colonne scalari: sopravvivevano alla
    rimozione delle relazioni e arrivavano intatte alla `update`. Una sola
    richiesta bastava.
  */
  await assert.rejects(
    () =>
      resources.updateResource(
        "organization_users",
        "tessera-propria",
        { role: "owner", custom_role_id: null },
        scopeSegreteria(),
      ),
    /Accesso negato/,
    "l'accesso a un club non si concede da soli, nemmeno modificando la propria riga",
  );
});

test("ne si promuove a gestore pieno togliendosi il ruolo personalizzato", async () => {
  await assert.rejects(
    () =>
      resources.updateResource(
        "organization_users",
        "tessera-propria",
        { role: "club_manager", custom_role_id: null },
        scopeSegreteria(),
      ),
    /Accesso negato/,
  );
});

test("una modifica che non tocca il ruolo non deve ridichiarare niente", async () => {
  /*
    La guardia gira **solo** quando il `PATCH` nomina il ruolo. Farla girare
    sempre avrebbe rotto il cambio di tessera principale, che non e una
    concessione di accesso.
  */
  await assert.doesNotReject(
    () =>
      resources.updateResource(
        "organization_users",
        "tessera-propria",
        { is_primary: false },
        scopeSegreteria(),
      ),
    "cambiare is_primary non e concedere un ruolo",
  );
});

test("la tessera di un proprietario non si cancella dalla rotta generica", async () => {
  await assert.rejects(
    () =>
      resources.deleteResource(
        "organization_users",
        "tessera-proprietario",
        scopeSegreteria(),
      ),
    /Accesso negato/,
    "revokeClubAccess riserva questa revoca al proprietario: la porta generica non deve dire il contrario",
  );
});

test("un club diverso non entra comunque: la guardia non sostituisce il confine", async () => {
  await assert.rejects(
    () =>
      resources.updateResource(
        "organization_users",
        "tessera-propria",
        { role: "secretary" },
        {
          userId: "user-segreteria",
          activeOrganizationId: CLUB_B,
          activeRole: "owner",
          allowedOrganizationIds: [CLUB_B],
          accessScopes: [],
        },
      ),
    /Accesso negato/,
  );
});

/* ================================================ 3. il proprio perimetro non si toglie */

test("il perimetro della propria tessera non si cambia da questa schermata", async () => {
  const clubRoles = await import("../../src/lib/server/club-roles.ts");

  await assert.rejects(
    () =>
      clubRoles.updateAssignmentScopes(
        scopeSegreteria(),
        "tessera-propria",
        [],
      ),
    /Accesso negato/,
    "zero righe di perimetro valgono tutto il club: togliersele e uscire dal proprio perimetro",
  );
});

test("il divieto «su se stessi» c'e su tutti e tre gli atti che cambiano un accesso", async () => {
  /*
    Chiude la classe invece dell'istanza: `assignClubRole` e `revokeClubAccess`
    lo avevano, `updateAssignmentScopes` no. Se domani nasce un quarto atto che
    cambia un accesso, questa prova non lo vede — ma chi la legge sa che il
    divieto e una regola del modulo e non un caso particolare.
  */
  const { readFile } = await import("node:fs/promises");
  const sorgente = await readFile("src/lib/server/club-roles.ts", "utf8");

  const atti = [
    "assignClubRole",
    "revokeClubAccess",
    "updateAssignmentScopes",
  ];

  for (const atto of atti) {
    const inizio = sorgente.indexOf(`export const ${atto} =`);
    assert.ok(inizio > 0, `${atto} non trovato`);
    const corpo = sorgente.slice(inizio, inizio + 3000);
    assert.match(
      corpo,
      /testo\(scope\.userId\)/,
      `${atto} non confronta il bersaglio con chi lo chiede`,
    );
  }
});

/* ========================= 4. la colonna che nomina la persona, non il ruolo */

test("una tessera non cambia intestatario dalla rotta generica", async () => {
  /*
    **Il buco che la prima correzione ha lasciato aperto, e perche.**

    La guardia guardava `role` e `custom_role_id`: le due colonne che nominano
    un **ruolo**. La colonna che nomina la **persona** non la guardava nessuno,
    ed e scalare — sopravvive alla rimozione delle relazioni e arriva intatta
    alla `update`.

    Una revisione ostile lo ha eseguito: un `PATCH` sulla tessera del
    proprietario con il solo campo `user_id`, e la segreteria ristretta si
    ritrova a portare la tessera `owner`. Nessuna guardia si accendeva: la riga
    e del suo club, la risorsa non e `athletes`, il ruolo non e nominato.

    E la stessa forma dei due CRITICAL che l'hanno preceduto — una difesa
    scritta contro il caso difficile e non applicata a quello facile — ed e il
    motivo per cui questa prova sta qui e non fra i casi particolari.
  */
  await assert.rejects(
    () =>
      resources.updateResource(
        "organization_users",
        "tessera-proprietario",
        { user_id: "user-segreteria" },
        scopeSegreteria(),
      ),
    /Accesso negato/,
    "spostare una tessera e revocarla e riconcederla: passa da dove si concede",
  );

  const dopo = fake.rows("organizationUser").find(
    (riga) => riga.id === "tessera-proprietario",
  );
  assert.equal(
    dopo.user_id,
    "user-presidente",
    "e la riga non deve essere cambiata comunque",
  );
});

test("un PATCH che non tocca l'intestatario continua a passare", async () => {
  /*
    La guardia confronta il valore chiesto con quello che c'e: riscrivere la
    riga intera — che e cio che fa un client che rimanda l'oggetto letto — non
    deve essere respinto come un trasferimento.
  */
  await assert.doesNotReject(
    () =>
      resources.updateResource(
        "organization_users",
        "tessera-propria",
        { user_id: "user-segreteria", is_primary: false },
        scopeSegreteria(),
      ),
    "riscrivere lo stesso intestatario non e un trasferimento",
  );
});

test("nessuna tessera di club si cancella dalla rotta generica", async () => {
  /*
    La prima stesura bloccava solo le tessere che **normalizzano** su `owner`.
    Una tessera con uno slug personalizzato non normalizza su `owner`, quindi
    si cancellava di qui saltando `revokeClubAccess` — e con esso la protezione
    del fondatore, il divieto su se stessi e la riga di audit.
  */
  for (const tessera of ["tessera-proprietario", "tessera-propria"]) {
    await assert.rejects(
      () =>
        resources.deleteResource(
          "organization_users",
          tessera,
          scopeSegreteria(),
        ),
      /Accesso negato/,
      `${tessera} non deve cancellarsi dal registro generico`,
    );
  }
});

test("il divieto copre le colonne che cambiano il potere, tutte", () => {
  /*
    Chiude la classe invece delle tre istanze. `organization_users` ha quattro
    colonne che decidono **chi puo cosa**: la persona, il ruolo, il ruolo
    personalizzato e il club. Ognuna deve essere nominata da una guardia in
    `updateResource`, o la prossima dimenticanza sara la quarta.
  */
  const sorgente = readFileSync("src/lib/server/resources.ts", "utf8");
  const inizio = sorgente.indexOf("export const updateResource");
  const corpo = sorgente.slice(inizio, sorgente.indexOf("\nexport const ", inizio + 30));

  for (const colonna of ["user_id", "role", "custom_role_id"]) {
    assert.ok(
      new RegExp(`"${colonna}" in normalized`).test(corpo),
      `updateResource non guarda «${colonna}» su organization_users: e una colonna che cambia il potere`,
    );
  }
});
