import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Scollegare un profilo non e revocare una tessera** (correzione Fortitudo
 * Scauri, 2026-09-03, ADR-0110).
 *
 * Il caso reale: il trainer Francesco Mella restava «collegato»
 * (`linked_user_id` valorizzato) a un'utenza gia revocata dalla Gestione
 * Accessi, e «Scollega account» rispondeva «Accesso Negato: una tessera di
 * club si revoca dalla gestione accessi, non dalla rotta generica» — perche
 * chiamava `DELETE /api/v1/organization_users/<id>`, la porta che quella
 * tessera nega sempre.
 *
 * Questi test provano la separazione: scollegare (`unlinkTrainerAccount`,
 * `unlinkGuardianAccount`, `unlinkAthleteAccount`) non tocca mai
 * `organization_users`; revocare (`revokeClubAccess`) ripulisce anche i
 * riferimenti che lasciava dietro.
 */

const CLUB = "aaaaaaaa-5100-4000-8000-00000000000a";
const ALTRO_CLUB = "bbbbbbbb-5100-4000-8000-00000000000b";

const OWNER = "11111111-5100-4000-8000-000000000aaa";
const UTENTE_ALLENATORE = "22222222-5100-4000-8000-000000000bbb";
const UTENTE_GENITORE = "33333333-5100-4000-8000-000000000ccc";
const UTENTE_MULTI = "44444444-5100-4000-8000-000000000ddd";

const TRAINER_RESOURCE_ID = "cccccccc-5100-4000-8000-000000000201";
const TRAINER_LOGICAL_ID = "trainer-1787321270854-x3a4eog";

const ATLETA = "dddddddd-5100-4000-8000-00000000000e";
const ATLETA_MULTI = "eeeeeeee-5100-4000-8000-00000000000f";
const GUARDIAN_ID = "guardian-1";

let dominio;
let clubRoles;
let athleteAccounts;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  dominio = await import("../../src/lib/server/profile-account-links.ts");
  clubRoles = await import("../../src/lib/server/club-roles.ts");
  athleteAccounts = await import("../../src/lib/server/athlete-accounts.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const scope = (overrides = {}) => ({
  userId: OWNER,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB, ALTRO_CLUB],
  actorEmail: "proprietario@club.it",
  ...overrides,
});

/**
 * Lo stato **esatto** trovato su Fortitudo Scauri: `linkedUserId` gia `null`,
 * `linked_user_id` ancora valorizzato. Due percorsi diversi avevano scritto
 * ognuno una sola grafia.
 */
const trainerPayloadDangling = (linkedUserId, linkedUserEmail) => ({
  id: TRAINER_LOGICAL_ID,
  name: "Francesco Mella",
  role: "trainer",
  organization_id: CLUB,
  club_id: CLUB,
  linkedUserId: null,
  linked_user_id: linkedUserId || null,
  linkedUserEmail: "",
  linked_user_email: linkedUserEmail || "",
  linkedAt: null,
  linked_at: linkedUserId ? "2026-08-22T11:18:13.603Z" : null,
  accessTokenRecordId: null,
  access_token_record_id: linkedUserId ? "token-record-1" : null,
  accessTokenStatus: "active",
  access_token_status: linkedUserId ? "redeemed" : "active",
});

const trainerPayloadLinkedBoth = (linkedUserId, linkedUserEmail) => ({
  ...trainerPayloadDangling(linkedUserId, linkedUserEmail),
  linkedUserId: linkedUserId || null,
  linkedUserEmail: linkedUserEmail || "",
});

const seed = () => ({
  user: [
    { id: OWNER, email: "proprietario@club.it" },
    { id: UTENTE_ALLENATORE, email: "mefrancesco2007y@gmail.com" },
    { id: UTENTE_GENITORE, email: "genitore@famiglia.it" },
    { id: UTENTE_MULTI, email: "mefrancesco2007@gmail.com" },
  ],
  club: [
    {
      id: CLUB,
      name: "Fortitudo Scauri",
      creator_id: OWNER,
      trainers: [trainerPayloadLinkedBoth(UTENTE_ALLENATORE, "mefrancesco2007y@gmail.com")],
      staff_members: [],
    },
    { id: ALTRO_CLUB, name: "Altro Club", creator_id: OWNER, trainers: [], staff_members: [] },
  ],
  clubResourceItem: [
    {
      id: TRAINER_RESOURCE_ID,
      organization_id: CLUB,
      resource_type: "trainers",
      name: "Francesco Mella",
      payload: trainerPayloadLinkedBoth(UTENTE_ALLENATORE, "mefrancesco2007y@gmail.com"),
    },
    {
      id: "token-record-1",
      organization_id: CLUB,
      resource_type: "access_tokens",
      name: "TRN5E4YB88BC",
      status: "redeemed",
      payload: {},
    },
  ],
  athlete: [
    {
      id: ATLETA,
      organization_id: CLUB,
      first_name: "Luca",
      last_name: "Bianchi",
      user_id: null,
      data: {
        guardians: [
          {
            id: GUARDIAN_ID,
            name: "Genitore Uno",
            linkedUserId: UTENTE_GENITORE,
            linked_user_id: UTENTE_GENITORE,
            linkedUserEmail: "genitore@famiglia.it",
            linked_user_email: "genitore@famiglia.it",
            parentAccessTokenRecordId: null,
          },
        ],
      },
    },
    {
      /* Il caso «mefrancesco2007@gmail.com»: gia atleta altrove nello stesso club. */
      id: ATLETA_MULTI,
      organization_id: CLUB,
      first_name: "Emanuele",
      last_name: "Comentale",
      user_id: UTENTE_MULTI,
      data: {},
    },
  ],
  organizationUser: [
    { id: "ou-owner", organization_id: CLUB, user_id: OWNER, role: "owner" },
    {
      id: "ou-athlete-multi",
      organization_id: CLUB,
      user_id: UTENTE_MULTI,
      role: "athlete",
    },
  ],
  auditLog: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

/* ==================================================================== *
 *  Scollegare un allenatore: non tocca organization_users
 * ==================================================================== */

test("scollegare l'allenatore pulisce entrambe le grafie e non tocca organization_users", async () => {
  const primaDelleTessere = fake.rows("organizationUser").length;

  const esito = await dominio.unlinkTrainerAccount(scope(), {
    trainerId: TRAINER_LOGICAL_ID,
  });

  assert.equal(esito.unlinkedUserId, UTENTE_ALLENATORE);

  const riga = fake
    .rows("clubResourceItem")
    .find((r) => r.id === TRAINER_RESOURCE_ID);
  assert.equal(riga.payload.linkedUserId, null);
  assert.equal(riga.payload.linked_user_id, null);
  assert.equal(riga.payload.linkedUserEmail, "");
  assert.equal(riga.payload.linked_user_email, "");
  assert.equal(riga.payload.linkedAt, null);
  assert.equal(riga.payload.linked_at, null);

  assert.equal(
    fake.rows("organizationUser").length,
    primaDelleTessere,
    "nessuna tessera si tocca da qui: la revoca vive nella Gestione Accessi",
  );

  const traccia = fake
    .rows("auditLog")
    .find((r) => r.action === "trainer_account.link.removed");
  assert.ok(traccia, "lo scollegamento lascia la sua riga di audit");
  assert.equal(traccia.metadata.unlinked_user_id, UTENTE_ALLENATORE);
});

test("scollegare l'allenatore riallinea anche la proiezione clubs.trainers", async () => {
  await dominio.unlinkTrainerAccount(scope(), { trainerId: TRAINER_LOGICAL_ID });

  const club = fake.rows("club").find((r) => r.id === CLUB);
  const trainerNellaProiezione = club.trainers.find(
    (t) => t.id === TRAINER_LOGICAL_ID,
  );
  assert.ok(trainerNellaProiezione, "il trainer resta nella proiezione");
  assert.equal(trainerNellaProiezione.linkedUserId ?? null, null);
  assert.equal(trainerNellaProiezione.linked_user_id ?? null, null);
});

test("scollega anche quando solo la grafia snake_case porta ancora il legame (stato reale di Fortitudo Scauri)", async () => {
  fake.rows("clubResourceItem")
    .find((r) => r.id === TRAINER_RESOURCE_ID)
    .payload = trainerPayloadDangling(UTENTE_ALLENATORE, "mefrancesco2007y@gmail.com");

  const esito = await dominio.unlinkTrainerAccount(scope(), {
    trainerId: TRAINER_LOGICAL_ID,
  });

  assert.equal(
    esito.unlinkedUserId,
    UTENTE_ALLENATORE,
    "linked_user_id da solo basta a riconoscere il legame, come linkedUserId da solo",
  );
});

test("scollegare un allenatore gia scollegato e idempotente", async () => {
  await dominio.unlinkTrainerAccount(scope(), { trainerId: TRAINER_LOGICAL_ID });
  const esito = await dominio.unlinkTrainerAccount(scope(), {
    trainerId: TRAINER_LOGICAL_ID,
  });

  assert.equal(esito.unlinkedUserId, null, "un secondo clic non e un errore");
});

test("senza accounts.trainer.manage lo scollegamento e negato e tracciato", async () => {
  await assert.rejects(
    () =>
      dominio.unlinkTrainerAccount(scope({ activeRole: "trainer" }), {
        trainerId: TRAINER_LOGICAL_ID,
      }),
    /Accesso negato/,
  );

  const traccia = fake
    .rows("auditLog")
    .find((r) => r.action === "permission_denied" || r.metadata?.permission === "accounts.trainer.manage");
  assert.ok(traccia, "il diniego lascia la sua riga");
});

/* ==================================================================== *
 *  Scollegare un genitore: non tocca organization_users
 * ==================================================================== */

test("scollegare un genitore pulisce il suo elemento e non tocca organization_users, ne gli altri genitori", async () => {
  fake.rows("athlete")
    .find((r) => r.id === ATLETA)
    .data.guardians.push({
      id: "guardian-2",
      name: "Genitore Due",
      linkedUserId: UTENTE_MULTI,
      linked_user_id: UTENTE_MULTI,
    });

  const primaDelleTessere = fake.rows("organizationUser").length;

  const esito = await dominio.unlinkGuardianAccount(scope(), {
    athleteId: ATLETA,
    guardianId: GUARDIAN_ID,
  });

  assert.equal(esito.unlinkedUserId, UTENTE_GENITORE);

  const atleta = fake.rows("athlete").find((r) => r.id === ATLETA);
  const scollegato = atleta.data.guardians.find((g) => g.id === GUARDIAN_ID);
  assert.equal(scollegato.linkedUserId, null);
  assert.equal(scollegato.linked_user_id, null);

  const altro = atleta.data.guardians.find((g) => g.id === "guardian-2");
  assert.equal(
    altro.linkedUserId,
    UTENTE_MULTI,
    "un genitore scollegato non tocca gli altri genitori dello stesso atleta",
  );

  assert.equal(fake.rows("organizationUser").length, primaDelleTessere);

  const traccia = fake
    .rows("auditLog")
    .find((r) => r.action === "guardian_account.link.removed");
  assert.ok(traccia);
});

/* ==================================================================== *
 *  Scollegare l'atleta: non tocca organization_users (a differenza della revoca completa)
 * ==================================================================== */

test("scollegare l'atleta slega solo athletes.user_id, la tessera athlete resta", async () => {
  fake.rows("athlete")
    .find((r) => r.id === ATLETA_MULTI)
    .user_id = UTENTE_MULTI;

  const esito = await athleteAccounts.unlinkAthleteAccount(scope(), {
    athleteId: ATLETA_MULTI,
  });

  assert.equal(esito.unlinkedUserId, UTENTE_MULTI);
  assert.equal(
    fake.rows("athlete").find((r) => r.id === ATLETA_MULTI).user_id,
    null,
  );
  assert.equal(
    fake
      .rows("organizationUser")
      .filter((r) => r.user_id === UTENTE_MULTI && r.role === "athlete").length,
    1,
    "a differenza di revokeAthleteAccess, unlinkAthleteAccount non tocca la tessera",
  );

  const traccia = fake
    .rows("auditLog")
    .find((r) => r.action === "athlete_account.link.removed");
  assert.ok(traccia);
});

test("scollegare un atleta gia scollegato e idempotente", async () => {
  const esito = await athleteAccounts.unlinkAthleteAccount(scope(), {
    athleteId: ATLETA,
  });
  assert.equal(esito.unlinkedUserId, null);
});

/* ==================================================================== *
 *  Un account con piu profili nello stesso club (§6 del mandato)
 * ==================================================================== */

test("un'utenza allenatore E atleta nello stesso club: scollegare l'uno non tocca l'altro", async () => {
  /* mefrancesco2007@gmail.com: gia atleta (Emanuele Comentale) del club. */
  fake.rows("clubResourceItem")
    .find((r) => r.id === TRAINER_RESOURCE_ID)
    .payload = trainerPayloadLinkedBoth(UTENTE_MULTI, "mefrancesco2007@gmail.com");
  fake.rows("club").find((r) => r.id === CLUB).trainers = [
    trainerPayloadLinkedBoth(UTENTE_MULTI, "mefrancesco2007@gmail.com"),
  ];

  const esito = await dominio.unlinkTrainerAccount(scope(), {
    trainerId: TRAINER_LOGICAL_ID,
  });
  assert.equal(esito.unlinkedUserId, UTENTE_MULTI);

  assert.equal(
    fake.rows("athlete").find((r) => r.id === ATLETA_MULTI).user_id,
    UTENTE_MULTI,
    "il legame atleta della stessa utenza resta intatto",
  );
  assert.equal(
    fake
      .rows("organizationUser")
      .filter((r) => r.user_id === UTENTE_MULTI && r.role === "athlete").length,
    1,
  );
});

/* ==================================================================== *
 *  revokeClubAccess: ripulisce i riferimenti dopo una revoca completa
 * ==================================================================== */

test("revocare la tessera allenatore dalla Gestione Accessi scollega anche la scheda, senza riferimenti dangling", async () => {
  fake.rows("organizationUser").push({
    id: "ou-trainer",
    organization_id: CLUB,
    user_id: UTENTE_ALLENATORE,
    role: "trainer",
  });

  await clubRoles.revokeClubAccess(scope(), "ou-trainer");

  assert.equal(
    fake.rows("organizationUser").some((r) => r.id === "ou-trainer"),
    false,
    "la tessera se ne va",
  );

  const riga = fake
    .rows("clubResourceItem")
    .find((r) => r.id === TRAINER_RESOURCE_ID);
  assert.equal(
    riga.payload.linked_user_id,
    null,
    "revocare da Gestione Accessi non deve lasciare la scheda ancora collegata",
  );

  const club = fake.rows("club").find((r) => r.id === CLUB);
  const trainerNellaProiezione = club.trainers.find(
    (t) => t.id === TRAINER_LOGICAL_ID,
  );
  assert.equal(trainerNellaProiezione.linked_user_id ?? null, null);

  const traccia = fake
    .rows("auditLog")
    .find((r) => r.action === "club_role.revoked" && r.resource_id === "ou-trainer");
  assert.ok(traccia);
  assert.ok(
    traccia.metadata.unlinked_profiles_count >= 1,
    "l'audit della revoca dice quanti profili ha ripulito",
  );
});

test("revocare la tessera genitore ripulisce athletes.data.guardians[] del club", async () => {
  fake.rows("organizationUser").push({
    id: "ou-parent",
    organization_id: CLUB,
    user_id: UTENTE_GENITORE,
    role: "parent",
  });

  await clubRoles.revokeClubAccess(scope(), "ou-parent");

  const atleta = fake.rows("athlete").find((r) => r.id === ATLETA);
  const genitore = atleta.data.guardians.find((g) => g.id === GUARDIAN_ID);
  assert.equal(genitore.linkedUserId ?? null, null);
  assert.equal(genitore.linked_user_id ?? null, null);
});

test("revocare la tessera atleta di un'utenza multi-profilo non tocca il suo profilo allenatore", async () => {
  /* mefrancesco2007@gmail.com e sia atleta (Emanuele Comentale) sia allenatore. */
  fake.rows("clubResourceItem")
    .find((r) => r.id === TRAINER_RESOURCE_ID)
    .payload = trainerPayloadLinkedBoth(UTENTE_MULTI, "mefrancesco2007@gmail.com");
  fake.rows("club").find((r) => r.id === CLUB).trainers = [
    trainerPayloadLinkedBoth(UTENTE_MULTI, "mefrancesco2007@gmail.com"),
  ];

  await clubRoles.revokeClubAccess(scope(), "ou-athlete-multi");

  assert.equal(
    fake.rows("athlete").find((r) => r.id === ATLETA_MULTI).user_id,
    null,
    "il legame atleta si toglie",
  );

  const riga = fake
    .rows("clubResourceItem")
    .find((r) => r.id === TRAINER_RESOURCE_ID);
  assert.equal(
    riga.payload.linked_user_id,
    UTENTE_MULTI,
    "revocare la tessera atleta non deve scollegare il profilo allenatore della stessa persona",
  );
});
