import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **I ruoli personalizzati, dal clic alla riga** (Wave 6, lane 6G, W6-1/W6-2).
 *
 * Il test del dominio prova che il tetto sia scritto bene. Questo prova il
 * pezzo che il mandato chiede esplicitamente (§10.5), e che una matrice non
 * puo provare:
 *
 * > togli la chiave: la funzione **sparisce dalla UI** e la rotta risponde
 * > **403**; rimetti la chiave: la funzione torna e la rotta risponde **200**.
 *
 * Il giro completo passa da `audit.read` e da `GET /api/v1/audit`, che e una
 * rotta vera con un dato vero dietro. Non «la matrice contiene la chiave»: la
 * concessione scritta in archivio, il ruolo attivo risolto dalla sessione, la
 * rotta che risponde.
 *
 * Piu i **quattro tentativi di escalation** del piano, ognuno negato **e**
 * tracciato: concedere `owner`, concedere una chiave che non si possiede,
 * concedere una chiave di legame, auto-promuoversi.
 */

const CLUB = "aaaaaaaa-1111-4000-8000-000000000001";
const ALTRO_CLUB = "bbbbbbbb-1111-4000-8000-000000000002";
const PROPRIETARIO = "cccccccc-1111-4000-8000-000000000003";
const GESTORE = "dddddddd-1111-4000-8000-000000000004";
const OPERATORE = "eeeeeeee-1111-4000-8000-000000000005";

const TOKEN_PROPRIETARIO = "sess-proprietario";
const TOKEN_GESTORE = "sess-gestore";
const TOKEN_OPERATORE = "sess-operatore";

let rotteRuoli;
let rotteRuoloSingolo;
let rotteAssegnazioni;
let rotteAssegnazione;
let rottaAudit;
let risorse;
let auth;
let setPrismaClientForTests;
let fake;

const utente = (id, email) => ({
  id,
  email,
  role: "user",
  first_name: "Nome",
  last_name: email.split("@")[0],
  password_hash: "$2b$fake",
  created_at: new Date("2026-01-01T00:00:00.000Z"),
  updated_at: new Date("2026-01-01T00:00:00.000Z"),
});

const sessione = (id, token, userId, email) => ({
  id,
  token,
  user_id: userId,
  expires_at: new Date(Date.now() + 3_600_000),
  user: utente(userId, email),
});

const seed = () => ({
  user: [
    utente(PROPRIETARIO, "presidente@example.invalid"),
    utente(GESTORE, "gestore@example.invalid"),
    utente(OPERATORE, "operatore@example.invalid"),
  ],
  session: [
    sessione("s1", TOKEN_PROPRIETARIO, PROPRIETARIO, "presidente@example.invalid"),
    sessione("s2", TOKEN_GESTORE, GESTORE, "gestore@example.invalid"),
    sessione("s3", TOKEN_OPERATORE, OPERATORE, "operatore@example.invalid"),
  ],
  club: [
    {
      id: CLUB,
      slug: "alfa",
      name: "ASD Alfa",
      creator_id: PROPRIETARIO,
      club_sites: [
        { id: "scauri", name: "Scauri", city: "Minturno", active: true },
        { id: "santi-cosma", name: "Santi Cosma", city: "Minturno", active: true },
      ],
      categories: [
        { id: "pulcini", name: "Pulcini" },
        { id: "esordienti", name: "Esordienti" },
      ],
    },
    { id: ALTRO_CLUB, slug: "beta", name: "ASD Beta", creator_id: GESTORE },
  ],
  organizationUser: [
    {
      id: "ou-proprietario",
      organization_id: CLUB,
      user_id: PROPRIETARIO,
      role: "owner",
      custom_role_id: null,
      is_primary: true,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: "ou-gestore",
      organization_id: CLUB,
      user_id: GESTORE,
      role: "club_manager",
      custom_role_id: null,
      is_primary: true,
      created_at: new Date("2026-01-02T00:00:00.000Z"),
    },
    {
      id: "ou-operatore",
      organization_id: CLUB,
      user_id: OPERATORE,
      role: "collaborator",
      custom_role_id: null,
      is_primary: true,
      created_at: new Date("2026-01-03T00:00:00.000Z"),
    },
  ],
  clubRole: [],
  clubRolePermission: [],
  clubAccessScope: [],
  auditLog: [
    {
      id: "audit-del-club",
      action: "payment.transaction.recorded",
      outcome: "success",
      organization_id: CLUB,
      actor_user_id: PROPRIETARIO,
      actor_email: "presidente@example.invalid",
      resource: "payment_transactions",
      metadata: { count: 1 },
      created_at: new Date("2026-08-01T10:00:00.000Z"),
    },
    {
      id: "audit-di-un-altro-club",
      action: "payment.transaction.recorded",
      outcome: "success",
      organization_id: ALTRO_CLUB,
      actor_email: "estraneo@example.invalid",
      resource: "payment_transactions",
      metadata: {},
      created_at: new Date("2026-08-01T11:00:00.000Z"),
    },
    {
      id: "audit-senza-club",
      action: "auth.login.failure",
      outcome: "failure",
      organization_id: null,
      actor_email: "ignoto@example.invalid",
      metadata: {},
      created_at: new Date("2026-08-01T12:00:00.000Z"),
    },
  ],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  rotteRuoli = await import("../../src/app/api/v1/club-roles/route.ts");
  rotteRuoloSingolo = await import(
    "../../src/app/api/v1/club-roles/[id]/route.ts"
  );
  rotteAssegnazioni = await import(
    "../../src/app/api/v1/club-roles/assignments/route.ts"
  );
  rotteAssegnazione = await import(
    "../../src/app/api/v1/club-roles/assignments/[id]/route.ts"
  );
  rottaAudit = await import("../../src/app/api/v1/audit/route.ts");
  risorse = await import("../../src/lib/server/resources.ts");
  auth = await import("../../src/lib/server/auth.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const richiesta = (url, options = {}) =>
  new Request(url, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      ...(options.token ? { cookie: `easygame_session=${options.token}` } : {}),
      "x-active-club-id": options.clubId || CLUB,
      ...(options.role ? { "x-active-access-role": options.role } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

const leggi = async (response) => ({
  status: response.status,
  payload: await response.json(),
});

const dinieghi = () =>
  fake.rows("auditLog").filter((riga) => riga.outcome === "denied");

const CONTROLLO_INTERNO = {
  name: "Controllo interno",
  base_role: "club_manager",
  permissions: ["audit.read"],
};

const creaRuolo = async (corpo = CONTROLLO_INTERNO, token = TOKEN_PROPRIETARIO) =>
  leggi(
    await rotteRuoli.POST(
      richiesta("http://localhost/api/v1/club-roles", {
        method: "POST",
        token,
        role: token === TOKEN_PROPRIETARIO ? "owner" : "club_manager",
        body: corpo,
      }),
    ),
  );

/* ============================================ sessione e perimetro === */

test("senza sessione le rotte dei ruoli rispondono 401", async () => {
  const { status } = await leggi(
    await rotteRuoli.GET(richiesta("http://localhost/api/v1/club-roles")),
  );
  assert.equal(status, 401);
});

test("un collaboratore non vede la configurazione degli accessi, e il diniego resta", async () => {
  const { status } = await leggi(
    await rotteAssegnazioni.GET(
      richiesta("http://localhost/api/v1/club-roles/assignments", {
        token: TOKEN_OPERATORE,
        role: "collaborator",
      }),
    ),
  );

  assert.equal(status, 403);
  assert.equal(
    dinieghi().some((riga) => riga.metadata?.permission === "club_roles.manage"),
    true,
    "il diniego deve lasciare una riga",
  );
});

/* ================================ il ciclo di vita: solo il proprietario === */

test("il proprietario crea un ruolo; il gestore no, e il diniego resta", async () => {
  const creato = await creaRuolo();
  assert.equal(creato.status, 201);
  assert.equal(creato.payload.data.slug, "custom:club_manager:controllo-interno");
  assert.deepEqual(creato.payload.data.permissions, ["audit.read"]);
  assert.equal(creato.payload.data.contains_direction_keys, true);

  const rifiutato = await creaRuolo(
    { name: "Altro", base_role: "staff", permissions: ["events.read"] },
    TOKEN_GESTORE,
  );
  assert.equal(rifiutato.status, 403);
  assert.match(rifiutato.payload.error.message, /proprietario/);
  assert.equal(
    dinieghi().some(
      (riga) => riga.metadata?.permission === "club_roles.owner_only",
    ),
    true,
  );
});

test("una chiave fuori dal ruolo base e una di legame vengono rifiutate dalla rotta", async () => {
  const soprainsieme = await creaRuolo({
    name: "Segreteria",
    base_role: "collaborator",
    permissions: ["sport_work.read"],
  });
  assert.equal(soprainsieme.status, 400);
  assert.match(soprainsieme.payload.error.message, /sottoinsieme/);

  const legame = await creaRuolo({
    name: "Segreteria",
    base_role: "collaborator",
    permissions: ["documents.review", "rsvp.answer"],
  });
  assert.equal(legame.status, 400);
  assert.match(legame.payload.error.message, /legame/);
});

test("un ruolo assegnato non si cancella", async () => {
  const creato = await creaRuolo();
  await leggi(
    await rotteAssegnazioni.POST(
      richiesta("http://localhost/api/v1/club-roles/assignments", {
        method: "POST",
        token: TOKEN_PROPRIETARIO,
        role: "owner",
        body: { user_id: OPERATORE, role: creato.payload.data.slug },
      }),
    ),
  );

  const rifiutata = await leggi(
    await rotteRuoloSingolo.DELETE(
      richiesta(`http://localhost/api/v1/club-roles/${creato.payload.data.id}`, {
        method: "DELETE",
        token: TOKEN_PROPRIETARIO,
        role: "owner",
      }),
      { params: { id: creato.payload.data.id } },
    ),
  );

  assert.equal(rifiutata.status, 400);
  assert.match(rifiutata.payload.error.message, /revocalo prima/);
});

/* ======================= §10.5 · il giro completo di una chiave === */

const assegnaControlloInterno = async () => {
  const creato = await creaRuolo();
  const assegnato = await leggi(
    await rotteAssegnazioni.POST(
      richiesta("http://localhost/api/v1/club-roles/assignments", {
        method: "POST",
        token: TOKEN_PROPRIETARIO,
        role: "owner",
        body: { user_id: OPERATORE, role: creato.payload.data.slug },
      }),
    ),
  );
  assert.equal(assegnato.status, 201);
  return creato.payload.data;
};

test("§10.5 · con la chiave la rotta risponde 200, senza risponde 403, e rimessa torna 200", async () => {
  const ruolo = await assegnaControlloInterno();

  /* --- la chiave c'e -------------------------------------------------- */
  const con = await leggi(
    await rottaAudit.GET(
      richiesta("http://localhost/api/v1/audit", {
        token: TOKEN_OPERATORE,
        role: ruolo.slug,
      }),
    ),
  );
  assert.equal(con.status, 200);
  const identificativi = con.payload.data.items.map((riga) => riga.id);
  assert.equal(identificativi.includes("audit-del-club"), true);
  assert.equal(
    identificativi.includes("audit-di-un-altro-club"),
    false,
    "le righe di un altro club non escono",
  );
  assert.equal(
    identificativi.includes("audit-senza-club"),
    false,
    "le righe senza club non appartengono a nessuno",
  );

  /* --- la chiave si toglie -------------------------------------------- */
  const tolta = await leggi(
    await rotteRuoloSingolo.PATCH(
      richiesta(`http://localhost/api/v1/club-roles/${ruolo.id}`, {
        method: "PATCH",
        token: TOKEN_PROPRIETARIO,
        role: "owner",
        body: { permissions: ["documents.review"] },
      }),
      { params: { id: ruolo.id } },
    ),
  );
  assert.equal(tolta.status, 200);
  assert.deepEqual(tolta.payload.data.permissions, ["documents.review"]);

  const senza = await leggi(
    await rottaAudit.GET(
      richiesta("http://localhost/api/v1/audit", {
        token: TOKEN_OPERATORE,
        role: ruolo.slug,
      }),
    ),
  );
  assert.equal(senza.status, 403);
  assert.equal(
    dinieghi().some((riga) => riga.metadata?.permission === "audit.read"),
    true,
    "il diniego di lettura del registro lascia una riga",
  );

  /* --- la chiave si rimette ------------------------------------------- */
  const rimessa = await leggi(
    await rotteRuoloSingolo.PATCH(
      richiesta(`http://localhost/api/v1/club-roles/${ruolo.id}`, {
        method: "PATCH",
        token: TOKEN_PROPRIETARIO,
        role: "owner",
        body: { permissions: ["audit.read"] },
      }),
      { params: { id: ruolo.id } },
    ),
  );
  assert.equal(rimessa.status, 200);

  const ancora = await leggi(
    await rottaAudit.GET(
      richiesta("http://localhost/api/v1/audit", {
        token: TOKEN_OPERATORE,
        role: ruolo.slug,
      }),
    ),
  );
  assert.equal(ancora.status, 200);
});

test("la lettura del registro nega chi non ha la chiave, ruolo canonico compreso", async () => {
  const collaboratore = await leggi(
    await rottaAudit.GET(
      richiesta("http://localhost/api/v1/audit", {
        token: TOKEN_OPERATORE,
        role: "collaborator",
      }),
    ),
  );
  assert.equal(collaboratore.status, 403);

  const proprietario = await leggi(
    await rottaAudit.GET(
      richiesta("http://localhost/api/v1/audit", {
        token: TOKEN_PROPRIETARIO,
        role: "owner",
      }),
    ),
  );
  assert.equal(proprietario.status, 200);
  /*
    Il diniego appena registrato appartiene a questo club ed e giusto che si
    veda: la riga del club estraneo e quella senza club no.
  */
  const identificativi = proprietario.payload.data.items.map((riga) => riga.id);
  assert.equal(identificativi.includes("audit-del-club"), true);
  assert.equal(identificativi.includes("audit-di-un-altro-club"), false);
  assert.equal(identificativi.includes("audit-senza-club"), false);
});

test("il registro non fa uscire il dispositivo ne i metadati fuori elenco", async () => {
  fake.rows("auditLog").push({
    id: "audit-con-dettagli",
    action: "anagrafica.updated",
    outcome: "success",
    organization_id: CLUB,
    actor_email: "presidente@example.invalid",
    ip: "10.0.0.1",
    user_agent: "Mozilla/5.0 (impronta del dispositivo)",
    metadata: {
      permission: "clinical.manage",
      nome_atleta: "Mario Rossi",
      importo: 250,
    },
    created_at: new Date("2026-08-02T10:00:00.000Z"),
  });

  const { payload } = await leggi(
    await rottaAudit.GET(
      richiesta("http://localhost/api/v1/audit", {
        token: TOKEN_PROPRIETARIO,
        role: "owner",
      }),
    ),
  );

  const riga = payload.data.items.find((voce) => voce.id === "audit-con-dettagli");
  assert.ok(riga);
  assert.equal(riga.user_agent, undefined, "il dispositivo non esce");
  assert.equal(riga.metadata.permission, "clinical.manage");
  assert.equal(riga.metadata.nome_atleta, undefined);
  assert.equal(riga.metadata.importo, undefined);
});

/* ============================== i quattro tentativi di escalation === */

test("escalation 1 · un gestore non si fabbrica una tessera `owner` dalla rotta generica", async () => {
  await assert.rejects(
    () =>
      risorse.createResource(
        "organization_users",
        { organization_id: CLUB, user_id: OPERATORE, role: "owner" },
        "create",
        {
          userId: GESTORE,
          activeOrganizationId: CLUB,
          activeRole: "club_manager",
          allowedOrganizationIds: [CLUB],
        },
      ),
    /Accesso negato/,
  );

  assert.equal(
    dinieghi().some(
      (riga) =>
        riga.resource === "organization_users" && riga.metadata?.role === "owner",
    ),
    true,
    "il tentativo di promozione lascia una riga",
  );
});

test("escalation 2 · non si concede una chiave che non si possiede", async () => {
  const ruolo = await creaRuolo({
    name: "Segreteria",
    base_role: "collaborator",
    permissions: ["documents.review", "consents.records.read"],
  });
  assert.equal(ruolo.status, 201);

  /*
    Chi assegna e un ruolo personalizzato che ha soltanto `documents.review`:
    dare un ruolo che porta anche `consents.records.read` sarebbe concedere una
    chiave che non si ha.
  */
  fake.rows("clubRole").push({
    id: "ruolo-vice",
    organization_id: CLUB,
    slug: "custom:club_manager:vice",
    name: "Vice",
    base_role: "club_manager",
    is_active: true,
  });
  fake.rows("clubRolePermission").push({
    id: "perm-vice",
    role_id: "ruolo-vice",
    permission_key: "documents.review",
  });
  fake.rows("organizationUser").push({
    id: "ou-vice",
    organization_id: CLUB,
    user_id: GESTORE,
    role: "custom:club_manager:vice",
    custom_role_id: "ruolo-vice",
    is_primary: false,
    created_at: new Date("2026-01-04T00:00:00.000Z"),
  });

  const rifiutata = await leggi(
    await rotteAssegnazioni.POST(
      richiesta("http://localhost/api/v1/club-roles/assignments", {
        method: "POST",
        token: TOKEN_GESTORE,
        role: "custom:club_manager:vice",
        body: { user_id: OPERATORE, role: ruolo.payload.data.slug },
      }),
    ),
  );

  /*
    **La stessa scalata, e adesso la porta e murata prima del soffitto.**

    Fino al closeout della Wave 6 il ruolo personalizzato entrava
    nell'amministrazione degli accessi — `canManageClubConfiguration`
    normalizza sulla base — e li lo fermava il soffitto: «non si concede il
    permesso che non si ha». Reggeva, ma era l'**ultima** difesa dentro una
    stanza in cui non doveva poter entrare: lo stesso titolare leggeva
    l'elenco di chi ha accesso al club e le chiavi di tutti, e poteva provare
    le combinazioni finche una passava.

    Il diniego cambia frase, e va detto: una prova che pretendesse ancora il
    messaggio del soffitto racconterebbe che la difesa e rimasta quella.
  */
  assert.equal(rifiutata.status, 403);
  assert.match(rifiutata.payload.error.message, /non puo assegnare un ruolo/);
  assert.equal(
    dinieghi().some(
      (riga) => riga.metadata?.permission === "club_roles.manage",
    ),
    true,
  );
});

test("escalation 2bis · il soffitto regge dove resta raggiungibile", async () => {
  /*
    La guardia nuova chiude la stanza ai ruoli personalizzati, e cosi
    toglierebbe ogni prova al soffitto se non lo si esercitasse **dove resta
    raggiungibile**: un `club_manager` canonico, che nell'amministrazione entra
    di diritto, e che non puo concedere una chiave di direzione.
  */
  const ruolo = await creaRuolo({
    name: "Direzione per interposta persona",
    base_role: "club_manager",
    permissions: ["data_subject.erase"],
  });
  assert.equal(ruolo.status, 201);

  const rifiutata = await leggi(
    await rotteAssegnazioni.POST(
      richiesta("http://localhost/api/v1/club-roles/assignments", {
        method: "POST",
        token: TOKEN_GESTORE,
        role: "club_manager",
        body: { user_id: OPERATORE, role: ruolo.payload.data.slug },
      }),
    ),
  );

  assert.equal(rifiutata.status, 403);
  assert.match(rifiutata.payload.error.message, /soltanto il proprietario/);
  assert.equal(
    dinieghi().length > 0,
    true,
    "un tentativo di concedere la direzione deve restare scritto",
  );
});

test("escalation 3 · una chiave di legame non entra in un ruolo nemmeno dal proprietario", async () => {
  const rifiutato = await creaRuolo({
    name: "Famiglia",
    base_role: "collaborator",
    permissions: ["consents.decide_own"],
  });
  assert.equal(rifiutato.status, 400);
  assert.match(rifiutato.payload.error.message, /legame/);
});

test("escalation 4 · non ci si assegna un ruolo da soli, e il tentativo resta", async () => {
  const ruolo = await creaRuolo();

  const rifiutata = await leggi(
    await rotteAssegnazioni.POST(
      richiesta("http://localhost/api/v1/club-roles/assignments", {
        method: "POST",
        token: TOKEN_GESTORE,
        role: "club_manager",
        body: { user_id: GESTORE, role: ruolo.payload.data.slug },
      }),
    ),
  );

  assert.equal(rifiutata.status, 403);
  assert.match(rifiutata.payload.error.message, /a se stessi/);
  assert.equal(
    dinieghi().some((riga) => riga.metadata?.reason === "self_assignment"),
    true,
  );
});

test("un ruolo personalizzato non si assegna dalla rotta generica", async () => {
  await creaRuolo();

  await assert.rejects(
    () =>
      risorse.createResource(
        "organization_users",
        {
          organization_id: CLUB,
          user_id: OPERATORE,
          role: "custom:club_manager:controllo-interno",
        },
        "create",
        {
          userId: PROPRIETARIO,
          activeOrganizationId: CLUB,
          activeRole: "owner",
          allowedOrganizationIds: [CLUB],
        },
      ),
    /Accesso negato/,
  );

  assert.equal(
    dinieghi().some(
      (riga) => riga.metadata?.reason === "custom_role_from_generic_route",
    ),
    true,
  );
});

/* ============================ la risoluzione del ruolo attivo === */

test("una tessera con lo slug e senza riferimento non concede niente", async () => {
  fake.rows("organizationUser").push({
    id: "ou-incoerente",
    organization_id: ALTRO_CLUB,
    user_id: OPERATORE,
    role: "custom:club_manager:controllo-interno",
    custom_role_id: null,
    is_primary: true,
    created_at: new Date("2026-01-05T00:00:00.000Z"),
  });

  const scope = await auth.resolveOrganizationScopeForUser(
    OPERATORE,
    ALTRO_CLUB,
    null,
  );

  assert.equal(scope.allowedOrganizationIds.includes(ALTRO_CLUB), false);
  assert.equal(scope.activeRole, "collaborator");
});

test("un ruolo disattivato smette di concedere, senza toccare la tessera", async () => {
  const ruolo = await assegnaControlloInterno();

  await leggi(
    await rotteRuoloSingolo.PATCH(
      richiesta(`http://localhost/api/v1/club-roles/${ruolo.id}`, {
        method: "PATCH",
        token: TOKEN_PROPRIETARIO,
        role: "owner",
        body: { is_active: false },
      }),
      { params: { id: ruolo.id } },
    ),
  );

  const scope = await auth.resolveOrganizationScopeForUser(OPERATORE, CLUB, null);
  assert.equal(scope.activeRole, null);
  assert.equal(scope.allowedOrganizationIds.includes(CLUB), false);
});

test("un gettone forgiato dal client non concede niente", async () => {
  /*
    **La proprieta piu importante di tutto il meccanismo.** Il gettone porta le
    chiavi, e il gettone arriva anche da un header che scrive il browser: se
    quelle chiavi fossero credute, chiunque si scriverebbe i propri permessi in
    una riga di `curl`.
    Il ruolo attivo lo costruisce **sempre** il server dalle righe di
    `club_role_permissions`; `x-active-access-role` serve solo a **scegliere**
    quale tessera usare, e una tessera che non esiste non si sceglie.
  */
  const ruolo = await assegnaControlloInterno();

  const forgiato = await auth.resolveOrganizationScopeForUser(
    OPERATORE,
    CLUB,
    `${ruolo.slug}#audit.read,sport_work.pay,members.register.manage`,
  );
  assert.equal(
    forgiato.activeRole,
    `${ruolo.slug}#audit.read`,
    "le chiavi le dice l'archivio, non l'header",
  );

  const inventato = await auth.resolveOrganizationScopeForUser(
    OPERATORE,
    CLUB,
    "custom:club_manager:inventato#audit.read",
  );
  assert.equal(inventato.activeRole, null);

  const senzaRegistro = await leggi(
    await rottaAudit.GET(
      richiesta("http://localhost/api/v1/audit", {
        token: TOKEN_OPERATORE,
        role: "custom:club_manager:inventato#audit.read",
      }),
    ),
  );
  assert.equal(senzaRegistro.status, 403);
});

test("il ruolo attivo di una tessera personalizzata e il gettone con le chiavi", async () => {
  const ruolo = await assegnaControlloInterno();

  const scope = await auth.resolveOrganizationScopeForUser(
    OPERATORE,
    CLUB,
    ruolo.slug,
  );

  assert.equal(scope.activeRole, `${ruolo.slug}#audit.read`);
  assert.equal(scope.activeOrganizationId, CLUB);
});

test("assegnare sostituisce le altre tessere della stessa persona, e la revoca resta", async () => {
  const ruolo = await assegnaControlloInterno();

  const tessere = fake
    .rows("organizationUser")
    .filter((riga) => riga.user_id === OPERATORE && riga.organization_id === CLUB);

  assert.equal(tessere.length, 1);
  assert.equal(tessere[0].role, ruolo.slug);
  assert.equal(
    fake
      .rows("auditLog")
      .some(
        (riga) =>
          riga.action === "club_role.revoked" &&
          riga.metadata?.reason === "replaced_by_new_role",
      ),
    true,
  );
});

/* ====================================== il perimetro si scrive === */

test("il perimetro si scrive per sostituzione e lascia una riga", async () => {
  const ruolo = await assegnaControlloInterno();
  const tessera = fake
    .rows("organizationUser")
    .find((riga) => riga.user_id === OPERATORE && riga.role === ruolo.slug);

  const salvato = await leggi(
    await rotteAssegnazione.PATCH(
      richiesta(
        `http://localhost/api/v1/club-roles/assignments/${tessera.id}`,
        {
          method: "PATCH",
          token: TOKEN_PROPRIETARIO,
          role: "owner",
          body: {
            scopes: [
              { kind: "site", value: "scauri" },
              { kind: "category", value: "pulcini" },
            ],
          },
        },
      ),
      { params: { id: tessera.id } },
    ),
  );

  assert.equal(salvato.status, 200);
  assert.equal(fake.rows("clubAccessScope").length, 2);
  assert.equal(
    fake
      .rows("auditLog")
      .some((riga) => riga.action === "club_role.scope.changed"),
    true,
  );

  const azzerato = await leggi(
    await rotteAssegnazione.PATCH(
      richiesta(
        `http://localhost/api/v1/club-roles/assignments/${tessera.id}`,
        {
          method: "PATCH",
          token: TOKEN_PROPRIETARIO,
          role: "owner",
          body: { scopes: [] },
        },
      ),
      { params: { id: tessera.id } },
    ),
  );

  assert.equal(azzerato.status, 200);
  assert.equal(
    fake.rows("clubAccessScope").length,
    0,
    "nessun perimetro significa tutto il club",
  );
});

test("il perimetro di un altro club non si tocca", async () => {
  fake.rows("organizationUser").push({
    id: "ou-estranea",
    organization_id: ALTRO_CLUB,
    user_id: OPERATORE,
    role: "collaborator",
    custom_role_id: null,
    is_primary: false,
    created_at: new Date("2026-01-06T00:00:00.000Z"),
  });

  const { status } = await leggi(
    await rotteAssegnazione.PATCH(
      richiesta("http://localhost/api/v1/club-roles/assignments/ou-estranea", {
        method: "PATCH",
        token: TOKEN_PROPRIETARIO,
        role: "owner",
        body: { scopes: [{ kind: "site", value: "scauri" }] },
      }),
      { params: { id: "ou-estranea" } },
    ),
  );

  assert.equal(status, 403);
});

/* ============================================== la revoca === */

test("il fondatore non si revoca e non si restringe", async () => {
  const ruolo = await creaRuolo();

  const revoca = await leggi(
    await rotteAssegnazione.DELETE(
      richiesta(
        "http://localhost/api/v1/club-roles/assignments/ou-proprietario",
        { method: "DELETE", token: TOKEN_GESTORE, role: "club_manager" },
      ),
      { params: { id: "ou-proprietario" } },
    ),
  );
  assert.equal(revoca.status, 403);

  const assegnazione = await leggi(
    await rotteAssegnazioni.POST(
      richiesta("http://localhost/api/v1/club-roles/assignments", {
        method: "POST",
        token: TOKEN_GESTORE,
        role: "club_manager",
        body: { user_id: PROPRIETARIO, role: ruolo.payload.data.slug },
      }),
    ),
  );
  assert.equal(assegnazione.status, 403);
});

test("l'elenco degli accessi porta le voci di perimetro del club, non l'anagrafica", async () => {
  const { status, payload } = await leggi(
    await rotteAssegnazioni.GET(
      richiesta("http://localhost/api/v1/club-roles/assignments", {
        token: TOKEN_PROPRIETARIO,
        role: "owner",
      }),
    ),
  );

  assert.equal(status, 200);
  assert.equal(payload.data.assignments.length, 3);
  assert.deepEqual(
    payload.data.scope_options.site.map((voce) => voce.id).sort(),
    ["santi-cosma", "scauri"],
  );
  assert.deepEqual(
    payload.data.scope_options.category.map((voce) => voce.id).sort(),
    ["esordienti", "pulcini"],
  );
  assert.equal(payload.data.creator_user_id, PROPRIETARIO);
});
