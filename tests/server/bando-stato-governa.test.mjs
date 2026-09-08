import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import { readFileSync } from "node:fs";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **N6 — lo stato di un bando comincia a significare qualcosa.**
 *
 * `funding_programs.status` ammetteva `draft | active | closed` dal Blocco D e
 * non governava niente:
 *
 * * ogni programma nasce `draft`, e **nessuna schermata sapeva cambiarlo** —
 *   la `PATCH` esisteva e nessun componente la chiamava;
 * * l'unico rifiuto nel dominio era su `closed`, quindi una **bozza** iscriveva
 *   atleti e faceva maturare denaro pubblico come un programma attivo;
 * * `active` era un valore che nessuna riga di `src/` leggeva.
 *
 * A schermo: «BOZZA» accanto a un bando che stava gia maturando. Uno stato che
 * non impedisce niente e un'etichetta, e un'etichetta che mente e peggio di una
 * che manca.
 *
 * Le prove qui sotto misurano le tre meta: che le transizioni siano quelle
 * dichiarate, che gli stati **chiudano davvero le porte**, e che chiudere non
 * sia distruttivo.
 */

const CLUB = "aaaaaaaa-b600-4000-8000-00000000000a";
const GESTORE = "11111111-b600-4000-8000-00000000000a";
const PROG = "cccccccc-b600-4000-8000-00000000000a";
const ATLETA = "bbbbbbbb-b600-4000-8000-00000000000a";
const ISCRIZIONE = "dddddddd-b600-4000-8000-00000000000a";

let funding;
let modello;
let setPrismaClientForTests;
let fake;

const scope = () => ({
  userId: GESTORE,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
  accessScopes: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  funding = await import("../../src/lib/server/funding.ts");
  modello = await import("../../src/lib/funding/funding-model.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const programma = (overrides = {}) => ({
  id: PROG,
  organization_id: CLUB,
  name: "Voucher per lo Sport 2025",
  funder_name: "Regione Lazio",
  status: "draft",
  valid_from: new Date("2025-09-01T00:00:00Z"),
  valid_to: new Date("2025-11-30T00:00:00Z"),
  athlete_plafond: 500,
  period_amount: 60,
  period_frequency: "monthly",
  period_length_days: null,
  requirement_unit: "hours",
  requirement_min: 8,
  unmet_behavior: "none",
  max_periods: null,
  max_total_amount: null,
  accrual_source: "easygame_attendance",
  notes: null,
  data: {},
  created_at: new Date("2025-08-01T00:00:00Z"),
  updated_at: new Date("2025-08-01T00:00:00Z"),
  ...overrides,
});

const seed = (statoProgramma = "draft", conIscrizione = false) => ({
  user: [{ id: GESTORE, email: "gestore@club.it" }],
  club: [{ id: CLUB, slug: "club", name: "Club", categories: [] }],
  athlete: [
    {
      id: ATLETA,
      organization_id: CLUB,
      first_name: "Sara",
      last_name: "Bianchi",
      status: "active",
      data: {},
    },
  ],
  fundingProgram: [programma({ status: statoProgramma })],
  fundingEnrollment: conIscrizione
    ? [
        {
          id: ISCRIZIONE,
          organization_id: CLUB,
          program_id: PROG,
          athlete_id: ATLETA,
          voucher_code: null,
          assigned_amount: 300,
          status: "active",
          enrolled_at: new Date("2025-09-01T00:00:00Z"),
          ends_at: null,
          notes: null,
          data: {},
        },
      ]
    : [],
  fundingAccrual: [],
  fundingSettlement: [],
  fundingSettlementLine: [],
  clubEvent: [],
  clubEventParticipant: [],
  auditLog: [],
});

const monta = (stato = "draft", conIscrizione = false) => {
  fake = createFakePrisma(seed(stato, conIscrizione));
  setPrismaClientForTests(fake.client);
};

beforeEach(() => monta());

/* ------------------------------------------------------------------ */
/* Le transizioni sono quattro, e le dichiara il dominio               */
/* ------------------------------------------------------------------ */

test("il dominio dichiara le quattro transizioni ammesse", () => {
  assert.deepEqual(modello.listFundingProgramTransitions("draft"), [
    "active",
    "closed",
  ]);
  assert.deepEqual(modello.listFundingProgramTransitions("active"), ["closed"]);
  assert.deepEqual(modello.listFundingProgramTransitions("closed"), ["active"]);

  assert.equal(modello.canTransitionFundingProgram("draft", "active"), true);
  assert.equal(modello.canTransitionFundingProgram("closed", "active"), true);
});

test("una transizione che non cambia niente non e una transizione", () => {
  /*
    Scriverla lascerebbe in registro una riga che racconta un atto mai
    avvenuto: l'audit di un bando serve a spiegare perche da marzo nessuno ha
    piu maturato, e va tenuto pulito.
  */
  assert.equal(modello.canTransitionFundingProgram("draft", "draft"), false);
  assert.equal(modello.canTransitionFundingProgram("active", "active"), false);
  assert.equal(modello.canTransitionFundingProgram("active", "draft"), false);
  assert.equal(modello.canTransitionFundingProgram("draft", "boh"), false);
});

test("attivare un programma lo porta ad active e lascia una riga di audit", async () => {
  const aggiornato = await funding.transitionFundingProgram(
    PROG,
    { status: "active", reason: "Bando aperto dall'ente" },
    scope(),
  );

  assert.equal(aggiornato.status, "active");

  const righe = fake.rows("auditLog").filter(
    (riga) => riga.action === "funding.program.transition",
  );
  assert.equal(righe.length, 1, "un atto, una riga");
  assert.equal(righe[0].metadata.from, "draft");
  assert.equal(righe[0].metadata.to, "active");
  assert.equal(righe[0].metadata.reason, "Bando aperto dall'ente");
});

test("una transizione non ammessa viene rifiutata, e non scrive niente", async () => {
  monta("active");

  await assert.rejects(
    () => funding.transitionFundingProgram(PROG, { status: "draft" }, scope()),
    /non puo passare/,
  );

  const righe = fake.rows("auditLog").filter(
    (riga) => riga.action === "funding.program.transition",
  );
  assert.equal(righe.length, 0, "un rifiuto non lascia traccia di un atto");
});

test("un programma chiuso si riapre", async () => {
  /*
    Chiudere non e distruttivo, quindi riaprire non deve costare una
    riconfigurazione da capo: una proroga dell'ente e un caso ordinario.
  */
  monta("closed");

  const aggiornato = await funding.transitionFundingProgram(
    PROG,
    { status: "active" },
    scope(),
  );

  assert.equal(aggiornato.status, "active");
});

/* ------------------------------------------------------------------ */
/* Gli stati chiudono davvero le porte                                 */
/* ------------------------------------------------------------------ */

test("su una bozza non si iscrive nessuno", async () => {
  await assert.rejects(
    () =>
      funding.createFundingEnrollment(
        { programId: PROG, athleteId: ATLETA },
        scope(),
      ),
    /in bozza/,
    "e la porta che prima non c'era: si iscriveva sulle bozze",
  );
});

test("attivato il programma, l'iscrizione passa", async () => {
  await funding.transitionFundingProgram(PROG, { status: "active" }, scope());

  const iscrizione = await funding.createFundingEnrollment(
    { programId: PROG, athleteId: ATLETA },
    scope(),
  );

  assert.equal(iscrizione.program_id, PROG);
  assert.equal(iscrizione.status, "active");
});

test("su un programma chiuso non si iscrive nessuno", async () => {
  monta("closed");

  await assert.rejects(
    () =>
      funding.createFundingEnrollment(
        { programId: PROG, athleteId: ATLETA },
        scope(),
      ),
    /chiuso/,
  );
});

test("su una bozza il maturato non si ricalcola", async () => {
  monta("draft", true);

  await assert.rejects(
    () => funding.recomputeEnrollmentAccruals(ISCRIZIONE, scope()),
    /in bozza/,
  );
});

test("su un programma chiuso il maturato non si ricalcola piu", async () => {
  /*
    Maturare su un bando chiuso vorrebbe dire far crescere un credito verso un
    ente che ha smesso di riconoscerlo.
  */
  monta("closed", true);

  await assert.rejects(
    () => funding.recomputeEnrollmentAccruals(ISCRIZIONE, scope()),
    /chiuso/,
  );
});

test("un'iscrizione revocata non matura", async () => {
  /*
    `removeFundingEnrollment` lo **dichiarava** in un commento — «smette di
    maturare» — e nessuna riga lo faceva valere: il ricalcolo la trattava come
    le altre. Un commento che afferma una proprieta e un debito finche non ha
    una prova (ADR-0138).
  */
  monta("active", true);
  fake.rows("fundingEnrollment")[0].status = "closed";

  await assert.rejects(
    () => funding.recomputeEnrollmentAccruals(ISCRIZIONE, scope()),
    /non e attiva/,
  );
});

/* ------------------------------------------------------------------ */
/* Chiudere non e distruttivo                                          */
/* ------------------------------------------------------------------ */

test("chiudere non tocca iscrizioni ne maturati", async () => {
  monta("active", true);

  await funding.transitionFundingProgram(PROG, { status: "closed" }, scope());

  assert.equal(
    fake.rows("fundingEnrollment").length,
    1,
    "l'iscrizione resta: chiudere dice «non entra piu nessuno», non «non e mai successo»",
  );
  assert.equal(fake.rows("fundingEnrollment")[0].status, "active");
});

/* ------------------------------------------------------------------ */
/* Lo stato non si cambia dalla porta sbagliata                        */
/* ------------------------------------------------------------------ */

test("la modifica generica non cambia lo stato", async () => {
  await assert.rejects(
    () => funding.updateFundingProgram(PROG, { status: "active" }, scope()),
    /si cambia dalle sue azioni/,
    "una schermata che correggeva una nota poteva chiudere il bando",
  );
});

test("le regole di un programma avviato non si cambiano", async () => {
  /*
    Le regole decidono quanto matura ogni periodo: cambiarle sotto a
    un'iscrizione riscrive in silenzio importi che la segreteria ha gia letto,
    e forse rendicontato all'ente.
  */
  monta("active");

  await assert.rejects(
    () => funding.updateFundingProgram(PROG, { requirement_min: 2 }, scope()),
    /non si cambiano/,
  );
});

test("ma nome, ente e note restano correggibili", async () => {
  monta("active");

  const aggiornato = await funding.updateFundingProgram(
    PROG,
    { name: "Voucher per lo Sport 2025/26", notes: "Prorogato a giugno" },
    scope(),
  );

  assert.equal(aggiornato.name, "Voucher per lo Sport 2025/26");
});

test("in bozza si cambia tutto", async () => {
  const aggiornato = await funding.updateFundingProgram(
    PROG,
    { requirement_min: 4, period_amount: 80 },
    scope(),
  );

  assert.equal(Number(aggiornato.requirement_min), 4);
  assert.equal(Number(aggiornato.period_amount), 80);
});

/* ------------------------------------------------------------------ */
/* Interfaccia e dominio dicono la stessa cosa                         */
/* ------------------------------------------------------------------ */

test("la scheda offre esattamente le transizioni che il dominio ammette", () => {
  /*
    Se l'interfaccia proponesse una transizione che il servizio rifiuta,
    l'utente scoprirebbe la regola dall'errore. Il mandato lo chiede
    esplicitamente: «UI e dominio devono concordare sugli stati disponibili».
  */
  const sorgente = readFileSync(
    "src/components/funding/FundingProgramDetail.tsx",
    "utf8",
  );

  assert.match(
    sorgente,
    /listFundingProgramTransitions\(program\.status\)\.map/,
    "le voci offerte devono venire dal dominio, non da un elenco scritto nella schermata",
  );
  assert.match(
    sorgente,
    /\/transition`/,
    "e devono passare dalla rotta che vaglia la transizione",
  );
  assert.match(
    sorgente,
    /disabled=\{String\(program\.status\) !== "active"\}/,
    "«Iscrivi atleti» deve spegnersi dove il dominio rifiuta l'iscrizione",
  );
});

test("la migrazione porta ad active i bandi che hanno gia beneficiari", () => {
  /*
    I programmi del pilota sono **tutti** in bozza, e alcuni hanno beneficiari,
    maturati e liquidazioni. Senza questa migrazione il rilascio spegnerebbe il
    ricalcolo su bandi vivi, e la segreteria leggerebbe «attivalo prima di
    calcolare il maturato» su un bando che finanzia dei ragazzi da mesi.

    Non e una scelta: un programma con degli iscritti *e* attivo, lo era anche
    ieri, ed era la colonna a dire un'altra cosa.
  */
  const sql = readFileSync(
    "prisma/migrations/20260909100000_n6_stato_del_bando_governa/migration.sql",
    "utf8",
  );

  assert.match(sql, /UPDATE "funding_programs"/);
  assert.match(sql, /SET "status" = 'active'/);
  assert.match(sql, /WHERE p\."status" = 'draft'/, "i chiusi non si riaprono");
  assert.match(
    sql,
    /EXISTS \(\s*SELECT 1\s*FROM "funding_enrollments"/,
    "solo i programmi che hanno gia beneficiari",
  );
  assert.doesNotMatch(sql, /\bDELETE\b|\bDROP\b|\bTRUNCATE\b/);
});
