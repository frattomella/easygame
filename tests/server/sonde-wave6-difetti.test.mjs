import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import { readFile } from "node:fs/promises";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * I quattro difetti che hanno trovato le sonde della Wave 6, e non i test.
 *
 * Vale la pena scrivere **perche** i test non li avevano visti, perche e la
 * stessa ragione per tutti e quattro: un test unitario costruisce l'ingresso
 * che il codice si aspetta. Le sonde (`scripts/wave-6-*.mjs`) partono invece
 * dal database e chiamano le funzioni con cio che ci trovano dentro — righe
 * scritte da versioni precedenti, payload composti da un altro modulo, scope
 * costruiti a mano. Li stavano i quattro.
 *
 * Ognuno ha lo stesso profilo: la difesa **esisteva**, e non era arrivata fino
 * alla superficie piu larga.
 *
 *   1. il confine multi-tenant girava sui domini e non sul registro generico;
 *   2. l'elenco delle grafie di uno stato era un elenco di minuscole;
 *   3. le appartenenze si ricostruivano da una proiezione che non le contiene;
 *   4. la stagione si chiedeva con un nome che il payload non usa.
 *
 * Quello che si presidia qui non e l'istanza: e che la difesa **passi di li**.
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";

let resources;
let setPrismaClientForTests;
let fake;

const atleta = (id, organizationId, overrides = {}) => ({
  id,
  organization_id: organizationId,
  first_name: "Nome",
  last_name: "Cognome",
  status: "active",
  data: {},
  ...overrides,
});

const seed = () => ({
  athlete: [
    atleta("a-1", CLUB_A),
    atleta("a-2", CLUB_A, { status: "Attivo" }),
    atleta("b-1", CLUB_B),
  ],
});

const scopeCoerente = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB_A,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB_A],
});

/*
  Uno scope il cui club attivo **non e fra quelli consentiti** non e uno scope.
*/
const scopeContraffatto = () => ({
  userId: "user-x",
  activeOrganizationId: CLUB_A,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB_B],
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

/* ------------------------------------------ 1. lo scope contraffatto (Critical) */

/*
  La Wave 5 aveva scritto la guardia in `assertScopeIsCoherent`, e il registro
  generico non ci passava: chiamava `belongsToActiveClub` da sola, che di
  proposito guarda solo il club attivo e non l'elenco dei club consentiti. Il
  risultato e che eventi e appuntamenti rifiutavano lo scope contraffatto e
  **l'elenco degli atleti no** — cioe la superficie piu ampia delle due, una
  cinquantina di risorse.
*/
test("uno scope incoerente non legge il registro generico", async () => {
  await assert.rejects(
    () =>
      resources.listResourcePage(
        "athletes",
        new URLSearchParams(""),
        scopeContraffatto(),
      ),
    /Accesso negato/,
    "il club attivo non e fra quelli dell'account: nessuna riga deve uscire",
  );
});

test("la stessa incoerenza ferma anche la lettura di una singola riga", async () => {
  await assert.rejects(
    () => resources.getResourceById("athletes", "a-1", scopeContraffatto()),
    /Accesso negato/,
  );
});

test("uno scope coerente continua a leggere: la guardia non e un blocco", async () => {
  const result = await resources.listResourcePage(
    "athletes",
    new URLSearchParams(""),
    scopeCoerente(),
  );

  assert.equal(result.records.length, 2);
  assert.ok(
    result.records.every((riga) => riga.organization_id === CLUB_A),
    "e resta il club attivo, non entrambi",
  );
});

/* ------------------------------------------- 2. le grafie di uno stato */

/*
  `athleteStatusQueryValues` restituisce le chiavi degli alias, che sono
  minuscole. Su Postgres `text IN (...)` confronta lettera per lettera: un
  atleta scritto `Attivo` non compariva in nessun filtro. Misurato sul
  database di sviluppo prima della correzione: 0 righe contro 224.
*/
test("il filtro di stato chiede a Postgres un confronto insensibile alle maiuscole", async () => {
  await resources.listResourcePage(
    "athletes",
    new URLSearchParams("status=active"),
    scopeCoerente(),
  );

  const call = fake.lastCall("athlete", "findMany");
  assert.equal(
    call.args.where.status.mode,
    "insensitive",
    "senza mode l'elenco delle grafie resta un elenco di minuscole",
  );
  assert.ok(
    Array.isArray(call.args.where.status.in) &&
      call.args.where.status.in.length > 1,
    "e le grafie devono essere piu di una: e il punto dell'IN",
  );
});

test("la traduzione delle grafie copre tutti e quattro gli stati", async () => {
  const { ATHLETE_STATUSES, athleteStatusQueryValues, normalizeAthleteStatus } =
    await import("../../src/lib/athletes/status.ts");

  for (const stato of ATHLETE_STATUSES) {
    const grafie = athleteStatusQueryValues(stato);
    assert.ok(grafie.length > 0, `${stato} non ha nessuna grafia da cercare`);
    for (const grafia of grafie) {
      assert.equal(
        normalizeAthleteStatus(grafia),
        stato,
        `«${grafia}» e cercata per ${stato} ma non ci si normalizza`,
      );
      assert.equal(
        normalizeAthleteStatus(grafia.toUpperCase()),
        stato,
        `«${grafia.toUpperCase()}» deve valere quanto la sua minuscola`,
      );
    }
  }
});

/* --------------------------- 3. un aggiornamento non riscrive cio che non gli e dato */

test("salvare un campo qualunque non tocca le appartenenze di categoria", async () => {
  /*
    Non c'e un renderer qui, e la funzione parla con `supabase`: cio che si
    puo presidiare in modo non ambiguo e che la scrittura sia **condizionata**
    e che le appartenenze si leggano dalla loro tabella. Le tre righe sono
    l'intera correzione; la prova sul dato la fa `scripts/wave-6-uat.mjs`.
  */
  const sorgente = await readFile("src/lib/simplified-db.ts", "utf8");

  assert.match(
    sorgente,
    /const membershipsDeclared = updatesDeclareAthleteMemberships\(updates\);/,
    "senza il predicato, ogni aggiornamento parziale riscrive le appartenenze",
  );
  assert.match(
    sorgente,
    /const savedMemberships = membershipsDeclared\s*\n\s*\? await replaceAthleteMemberships/,
    "replaceAthleteMemberships cancella e riscrive: deve girare solo se glielo si e chiesto",
  );
  assert.match(
    sorgente,
    /const membershipRows = await loadClubAthleteMemberships\(clubId, \[athleteId\]\);/,
    "le appartenenze si leggono da dove stanno, non dalla proiezione piatta dell'anagrafica",
  );
});

test("il predicato conosce gli stessi campi che il risolutore legge", async () => {
  /*
    I due elenchi sono la stessa cosa detta due volte: se divergono, un
    aggiornamento che dichiara una categoria non la scriverebbe.
  */
  const sorgente = await readFile("src/lib/simplified-db.ts", "utf8");
  const predicato = sorgente.slice(
    sorgente.indexOf("const updatesDeclareAthleteMemberships"),
    sorgente.indexOf("const resolveRequestedAthleteMemberships"),
  );

  assert.ok(predicato.length > 0, "il predicato deve stare prima del risolutore");

  for (const campo of [
    "categoryMemberships",
    "category_memberships",
    "memberships",
    "category",
    "category_id",
    "categoryName",
    "category_name",
  ]) {
    assert.ok(
      predicato.includes(campo),
      `il risolutore legge «${campo}» e il predicato non lo conosce`,
    );
  }
});

/* ------------------------------------------ 4. la stagione dell'area atleta */

test("l'area atleta legge la stagione dal nome che il dominio pubblica", async () => {
  const dominio = await import("../../src/lib/club-seasons.ts");
  const sorgente = await readFile("src/lib/server/athlete-accounts.ts", "utf8");

  const stagione = dominio.normalizeActiveClubSeason({
    settings: {
      seasons: [{ id: "s-1", label: "2025/2026", isActive: true }],
    },
  });

  assert.equal(
    stagione.activeSeasonLabel,
    "2025/2026",
    "e il dominio a dire come si chiama la stagione attiva",
  );
  assert.equal(
    stagione.seasonLabel,
    undefined,
    "il nome che l'area atleta chiedeva prima non esiste: rispondeva undefined",
  );

  for (const chiave of ["activeSeasonId", "activeSeasonLabel"]) {
    assert.ok(
      sorgente.includes(`club.${chiave}`),
      `l'area atleta deve chiedere ${chiave}, altrimenti mostra un club senza stagione`,
    );
  }
});
