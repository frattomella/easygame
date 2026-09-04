import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Una revoca vale sull'identita, non sulla riga che si e guardata** (PP-04).
 *
 * Il difetto era in due meta simmetriche, e nessuna delle due la vedeva il
 * dominio da solo: e per questo che accanto a questi controlli sta
 * `scripts/pp-04-atleta-probe.mjs`, che li ripete contro PostgreSQL vero e
 * contro le rotte vere (P-52, P-53, P-54, P-55).
 *
 * **Meta A — la tessera se ne va e il legame resta.** La Gestione Accessi
 * revoca un accesso; `revokeClubAccess` chiama lo sweep
 * `unlinkDirectAthleteProfile`, che riconosce **lo slug** (`athlete`, `atleta`,
 * `player`) e non l'identita. Con un ruolo personalizzato basato su `athlete`
 * (ADR-0102) lo slug e un altro, lo sweep non slega niente, e
 * `athletes.user_id` sopravvive alla revoca. Misurato: l'area rispondeva
 * **200** a chi non apparteneva piu al club.
 *
 * **Meta B — il legame se ne va e la tessera resta.** `revokeAthleteAccess`
 * cancellava `organization_users` con `role: "athlete"` **letterale**: la
 * tessera con lo slug italiano, o quella di un ruolo personalizzato,
 * sopravviveva alla revoca.
 *
 * La correzione non aggiunge un secondo elenco di slug — ne nascerebbe un
 * terzo. Cambia la **domanda**: da «come si chiama questa riga» a «questa
 * persona appartiene ancora a questo club, e come che cosa».
 */

const CLUB = "aaaaaaaa-7c00-4000-8000-00000000000a";
const ALTRO_CLUB = "bbbbbbbb-7c00-4000-8000-00000000000b";

const SEGRETERIA = "11111111-7c00-4000-8000-000000000aaa";
const UTENTE = "22222222-7c00-4000-8000-000000000bbb";

const ATLETA = "aaaa1111-7c00-4000-8000-00000000aaaa";
const ATLETA_ALTROVE = "bbbb2222-7c00-4000-8000-00000000bbbb";

let dominio;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  dominio = await import("../../src/lib/server/athlete-accounts.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const scope = () => ({
  userId: SEGRETERIA,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB, ALTRO_CLUB],
  actorEmail: "segreteria@club.it",
});

const seed = (tessere) => ({
  user: [
    { id: SEGRETERIA, email: "segreteria@club.it", email_verified_at: new Date() },
    { id: UTENTE, email: "atleta@famiglia.it", email_verified_at: new Date() },
  ],
  club: [
    { id: CLUB, slug: "club", name: "Polisportiva Test", creator_id: SEGRETERIA },
    { id: ALTRO_CLUB, slug: "altro", name: "Altro club", creator_id: SEGRETERIA },
  ],
  organizationUser: [
    { id: "m0", organization_id: CLUB, user_id: SEGRETERIA, role: "owner" },
    ...tessere,
  ],
  clubRole: [],
  clubAccessScope: [],
  athlete: [
    {
      id: ATLETA,
      organization_id: CLUB,
      user_id: UTENTE,
      first_name: "Luca",
      last_name: "Rossi",
      status: "active",
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      data: {},
    },
    {
      id: ATLETA_ALTROVE,
      organization_id: ALTRO_CLUB,
      user_id: null,
      first_name: "Luca",
      last_name: "Rossi",
      status: "active",
      created_at: new Date("2026-02-01T00:00:00.000Z"),
      data: {},
    },
  ],
  athleteAccountInvite: [],
  auditLog: [],
  session: [],
});

const monta = (tessere) => {
  fake = createFakePrisma(seed(tessere));
  setPrismaClientForTests(fake.client);
};

beforeEach(() => {
  monta([{ id: "m1", organization_id: CLUB, user_id: UTENTE, role: "athlete" }]);
});

const tesserePresenti = () =>
  fake
    .rows("organizationUser")
    .filter((riga) => riga.user_id === UTENTE)
    .map((riga) => riga.role);

/* ==================================================================== *
 *  Meta A — il legame senza appartenenza non apre niente
 * ==================================================================== */

test("con la tessera, il legame apre la propria scheda", async () => {
  const profilo = await dominio.findAthleteProfileForUser(UTENTE);
  assert.equal(profilo?.id, ATLETA);
});

test("tolta ogni tessera, il legame superstite non apre piu niente", async () => {
  /*
    E la forma esatta della meta A: la riga di `organization_users` e sparita —
    come dopo `revokeClubAccess` — e **nessuno ha azzerato** `athletes.user_id`.
    Prima di PP-04 questa chiamata restituiva la scheda, e da li l'area intera.
  */
  monta([]);

  assert.equal(
    await dominio.findAthleteProfileForUser(UTENTE),
    null,
    "un legame che nessuna appartenenza sostiene non e una porta",
  );

  await assert.rejects(
    () => dominio.readAthleteAreaOverview(UTENTE),
    /Accesso negato/,
    "e l'area lo dice con la stessa frase di chi non e mai entrato",
  );

  await assert.rejects(
    () => dominio.updateOwnAthleteContacts(UTENTE, { phone: "3330000000" }),
    /Accesso negato/,
    "e nemmeno si scrivono i propri recapiti da fuori",
  );
});

test("appartenere al club non basta: serve esserci ancora come atleta", async () => {
  /*
    **La forma piu raggiungibile del difetto** (P-45 della sonda).
    `assignClubRole` applica «un ruolo alla volta per persona e per club»:
    assegnarne uno nuovo **cancella** le altre tessere, con
    `reason: "replaced_by_new_role"`, e quel ramo non chiama nessuno sweep. La
    segreteria cambia a un atleta il ruolo in «Collaboratore»: la tessera
    `athlete` sparisce, il legame resta, e la persona **appartiene ancora al
    club** — quindi un controllo di sola appartenenza la lascerebbe passare.
  */
  monta([
    { id: "m1", organization_id: CLUB, user_id: UTENTE, role: "collaborator" },
  ]);

  assert.equal(
    await dominio.findAthleteProfileForUser(UTENTE),
    null,
    "chi non e piu un atleta non ha un'area atleta",
  );
});

test("gli alias di `athlete` valgono quanto la parola inglese", async () => {
  /*
    `giocatore` e `giocatrice` sono alias legittimi in `ROLE_ALIASES` e mancano
    da `ATHLETE_ROLES` di `profile-account-links.ts`: e da li che nasce il
    legame che sopravvive alla revoca. Qui la domanda passa dal vocabolario
    unico, e i cinque nomi della stessa cosa danno la stessa risposta.
  */
  for (const slug of ["athlete", "atleta", "player", "giocatore", "giocatrice"]) {
    monta([{ id: "m1", organization_id: CLUB, user_id: UTENTE, role: slug }]);
    assert.equal(
      (await dominio.findAthleteProfileForUser(UTENTE))?.id,
      ATLETA,
      `«${slug}» e un atleta`,
    );
  }
});

test("il fondatore del club non resta fuori dalla propria area", async () => {
  /*
    La sua appartenenza non nasce da una tessera ma da `clubs.creator_id`, e
    nelle societa piccole il fondatore che gioca e il caso normale.
  */
  monta([]);
  fake.rows("club").find((riga) => riga.id === CLUB).creator_id = UTENTE;

  assert.equal((await dominio.findAthleteProfileForUser(UTENTE))?.id, ATLETA);
});

test("un legame morto in un club non nasconde quello vivo in un altro", async () => {
  /*
    La funzione tornava la riga **piu vecchia** e si fermava li: chi fosse
    stato atleta in due societa vedeva la porta chiusa invece dell'area della
    societa in cui gioca ancora.
  */
  monta([
    { id: "m2", organization_id: ALTRO_CLUB, user_id: UTENTE, role: "athlete" },
  ]);
  fake.rows("athlete").find((riga) => riga.id === ATLETA_ALTROVE).user_id =
    UTENTE;

  const profilo = await dominio.findAthleteProfileForUser(UTENTE);
  assert.equal(
    profilo?.id,
    ATLETA_ALTROVE,
    "si sceglie il primo di cui si e ancora soci, non il primo in ordine di nascita",
  );
});

/* ==================================================================== *
 *  Meta B — la revoca toglie la tessera per cio che e, non per come si chiama
 * ==================================================================== */

test("la revoca toglie la tessera scritta con la parola inglese", async () => {
  await dominio.revokeAthleteAccess(scope(), { athleteId: ATLETA });
  assert.deepEqual(tesserePresenti(), []);
});

test("la revoca toglie anche la tessera scritta con lo slug italiano", async () => {
  monta([{ id: "m1", organization_id: CLUB, user_id: UTENTE, role: "atleta" }]);

  await dominio.revokeAthleteAccess(scope(), { athleteId: ATLETA });
  assert.deepEqual(
    tesserePresenti(),
    [],
    "`role: \"athlete\"` toglieva solo la riga scritta con quella parola",
  );
});

test("la revoca toglie anche la tessera di un ruolo personalizzato su `athlete`", async () => {
  /*
    Sulla fixture la relazione e appiattita sulla riga: il finto Prisma ignora
    `select` sulle relazioni. Il ramo con la **chiave esterna vera** lo prova
    P-54 di `scripts/pp-04-atleta-probe.mjs`, contro PostgreSQL.
  */
  monta([
    {
      id: "m1",
      organization_id: CLUB,
      user_id: UTENTE,
      role: "atleta-under-12",
      custom_role_id: "r1",
      custom_role: { base_role: "athlete" },
    },
  ]);

  await dominio.revokeAthleteAccess(scope(), { athleteId: ATLETA });
  assert.deepEqual(tesserePresenti(), []);
});

test("e una tessera che non e quella di un atleta resta dov'e", async () => {
  /*
    Un allargamento si misura due volte: che faccia cio che deve, e che **non
    faccia altro**. Lo stesso essere umano puo essere l'atleta di un club e il
    genitore di un altro figlio nello stesso club.
  */
  monta([
    { id: "m1", organization_id: CLUB, user_id: UTENTE, role: "athlete" },
    { id: "m2", organization_id: CLUB, user_id: UTENTE, role: "parent" },
    { id: "m3", organization_id: ALTRO_CLUB, user_id: UTENTE, role: "athlete" },
  ]);

  await dominio.revokeAthleteAccess(scope(), { athleteId: ATLETA });
  assert.deepEqual(
    tesserePresenti().sort(),
    ["athlete", "parent"],
    "resta il genitore di questo club, e l'atleta dell'altro club",
  );
});

test("la revoca porta via anche il perimetro di sede e categoria della tessera", async () => {
  /*
    `club_access_scopes` ha una chiave esterna verso `organization_users`
    (ADR-0103). Lasciarne le righe dietro a una tessera cancellata e, nel
    migliore dei casi, spazzatura; nel peggiore un `Restrict` che fa fallire la
    revoca a meta.
  */
  fake.rows("clubAccessScope").push({
    id: "s1",
    organization_user_id: "m1",
    axis: "site",
    value: "sede-nord",
  });

  await dominio.revokeAthleteAccess(scope(), { athleteId: ATLETA });
  assert.deepEqual(fake.rows("clubAccessScope"), []);
});

/* ==================================================================== *
 *  Il quarto stato: una revoca che si vede
 * ==================================================================== */

/**
 * **«Accesso revocato» non era uno stato, e la scheda diceva il falso.**
 *
 * Un accesso tolto tornava `none`, cioe la stessa parola di un atleta mai
 * invitato. La storia in fondo al pannello lo diceva, ma uno stato che si
 * legge solo scorrendo un elenco non e lo stato: cio che il pannello
 * dichiarava in testa era sbagliato, e la domanda che ci si fa in quel momento
 * — «devo rimandarglielo, o non gliel'ho mai mandato?» — non aveva risposta.
 */

const invito = (righe) => {
  fake.rows("athleteAccountInvite").push(...righe);
};

const statoDi = () =>
  dominio.readAthleteAccountState(scope(), ATLETA);

test("senza legame e senza inviti lo stato e «nessun account»", async () => {
  fake.rows("athlete").find((riga) => riga.id === ATLETA).user_id = null;

  const stato = await statoDi();
  assert.equal(stato.status, "none");
  assert.equal(stato.lastInviteAt, null);
  assert.equal(stato.revokedAt, null);
});

test("con un invito vivo lo stato e «invito inviato»", async () => {
  fake.rows("athlete").find((riga) => riga.id === ATLETA).user_id = null;
  invito([
    {
      id: "i1",
      organization_id: CLUB,
      athlete_id: ATLETA,
      email: "luca@famiglia.it",
      status: "sent",
      sent_at: new Date("2026-03-01T10:00:00.000Z"),
      expires_at: new Date("2099-01-01T00:00:00.000Z"),
      accepted_at: null,
      revoked_at: null,
    },
  ]);

  const stato = await statoDi();
  assert.equal(stato.status, "invited");
  assert.equal(stato.lastInviteEmail, "luca@famiglia.it");
});

test("un invito accettato e poi tolto e «accesso revocato», non «nessun account»", async () => {
  fake.rows("athlete").find((riga) => riga.id === ATLETA).user_id = null;
  invito([
    {
      id: "i1",
      organization_id: CLUB,
      athlete_id: ATLETA,
      email: "luca@famiglia.it",
      status: "accepted",
      sent_at: new Date("2026-03-01T10:00:00.000Z"),
      expires_at: new Date("2026-04-01T00:00:00.000Z"),
      accepted_at: new Date("2026-03-02T10:00:00.000Z"),
      revoked_at: new Date("2026-05-01T10:00:00.000Z"),
    },
  ]);

  const stato = await statoDi();
  assert.equal(stato.status, "revoked");
  assert.equal(stato.revokedAt, "2026-05-01T10:00:00.000Z");
  assert.equal(
    stato.lastInviteEmail,
    "luca@famiglia.it",
    "«a chi» e «quando» servono proprio adesso, e sparivano con il ramo `invite`",
  );
});

test("anche un invito revocato prima di essere accettato e «accesso revocato»", async () => {
  fake.rows("athlete").find((riga) => riga.id === ATLETA).user_id = null;
  invito([
    {
      id: "i1",
      organization_id: CLUB,
      athlete_id: ATLETA,
      email: "luca@famiglia.it",
      status: "revoked",
      sent_at: new Date("2026-03-01T10:00:00.000Z"),
      expires_at: new Date("2099-01-01T00:00:00.000Z"),
      accepted_at: null,
      revoked_at: new Date("2026-03-03T10:00:00.000Z"),
    },
  ]);

  assert.equal((await statoDi()).status, "revoked");
});

test("un invito solo scaduto non e una revoca: nessuno ha deciso niente", async () => {
  /*
    La distinzione conta: «revocato» vuol dire che qualcuno ha tolto qualcosa,
    «scaduto» che e passato del tempo. Confonderli farebbe telefonare per una
    decisione che nessuno ha preso.
  */
  fake.rows("athlete").find((riga) => riga.id === ATLETA).user_id = null;
  invito([
    {
      id: "i1",
      organization_id: CLUB,
      athlete_id: ATLETA,
      email: "luca@famiglia.it",
      status: "expired",
      sent_at: new Date("2026-01-01T10:00:00.000Z"),
      expires_at: new Date("2026-02-01T00:00:00.000Z"),
      accepted_at: null,
      revoked_at: null,
    },
  ]);

  const stato = await statoDi();
  assert.equal(stato.status, "none");
  assert.equal(
    stato.lastInviteAt,
    "2026-01-01T10:00:00.000Z",
    "e la data dice perche quel link non funziona piu",
  );
});

test("un accesso attivo resta «attivo» anche con una revoca vecchia alle spalle", async () => {
  invito([
    {
      id: "i0",
      organization_id: CLUB,
      athlete_id: ATLETA,
      email: "vecchio@famiglia.it",
      status: "revoked",
      sent_at: new Date("2026-01-01T10:00:00.000Z"),
      expires_at: new Date("2026-02-01T00:00:00.000Z"),
      accepted_at: null,
      revoked_at: new Date("2026-01-05T10:00:00.000Z"),
    },
  ]);

  const stato = await statoDi();
  assert.equal(stato.status, "active", "il legame vivo viene prima di tutto");
  assert.equal(stato.revokedAt, null);
});

test("revocare un accesso attivo scrive quando, e non riscrive che era stato accettato", async () => {
  /*
    Senza questa riga lo stato «revocato» si poteva dedurre ma non datare: la
    revoca chiudeva solo un invito **vivo**, e quando l'accesso e attivo un
    invito vivo non c'e. Lo `status` resta `accepted` perche quell'invito e
    stato accettato davvero: le due colonne dicono due cose diverse.
  */
  invito([
    {
      id: "i1",
      organization_id: CLUB,
      athlete_id: ATLETA,
      email: "luca@famiglia.it",
      status: "accepted",
      sent_at: new Date("2026-03-01T10:00:00.000Z"),
      expires_at: new Date("2026-04-01T00:00:00.000Z"),
      accepted_at: new Date("2026-03-02T10:00:00.000Z"),
      revoked_at: null,
    },
  ]);

  await dominio.revokeAthleteAccess(scope(), { athleteId: ATLETA });

  const riga = fake.rows("athleteAccountInvite").find((r) => r.id === "i1");
  assert.equal(riga.status, "accepted", "l'invito e stato accettato davvero");
  assert.ok(riga.revoked_at, "e adesso si sa anche quando e stato tolto");

  const stato = await statoDi();
  assert.equal(stato.status, "revoked");
  assert.ok(stato.revokedAt);
});
