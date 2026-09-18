import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";
import { MS_CLUB, MS_DIREZIONE, seedMultiSeasonClub } from "../helpers/multi-season-club.mjs";

/**
 * **Issue 4 e 5 del lotto ADR-0198.** La data di nascita di una persona in
 * prova e facoltativa — dall'API al DB alla conversione, che la chiede solo
 * quando la scheda atleta la vuole. Gli omonimi si cercano in tutto il club:
 * fra le prove e fra le schede atleta di ogni stagione, perche l'identita
 * dell'atleta e del club (ADR-0197 §22). Si mostrano, non si fondono.
 *
 * Club a due stagioni (helper obbligatorio): l'atleta omonimo appartiene alla
 * stagione A, quella non attiva.
 */

const ALTRO_CLUB = "bbbbbbbb-0198-4000-8000-00000000000b";
const ALTRA_DIREZIONE = "44444444-0198-4000-8000-000000000004";
const ALLENATORE = "22222222-0198-4000-8000-000000000002";
const ATLETA_A = "a7a7a7a7-0198-4000-8000-000000000001";
const ATLETA_ALTRO = "a7a7a7a7-0198-4000-8000-000000000009";

let dominio;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  dominio = await import("../../src/lib/server/trial-athletes.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import("../../src/lib/server/prisma.ts"));
});

const seme = () => {
  const base = seedMultiSeasonClub(
    {},
    {
      user: [
        { id: MS_DIREZIONE, email: "direzione@club.it", role: "owner" },
        { id: ALLENATORE, email: "coach@club.it", role: "trainer" },
        { id: ALTRA_DIREZIONE, email: "altra@club.it", role: "owner" },
      ],
      organizationUser: [
        { id: "ou-1", organization_id: MS_CLUB, user_id: MS_DIREZIONE, role: "owner" },
        { id: "ou-2", organization_id: MS_CLUB, user_id: ALLENATORE, role: "trainer" },
        { id: "ou-4", organization_id: ALTRO_CLUB, user_id: ALTRA_DIREZIONE, role: "owner" },
      ],
      athlete: [
        {
          id: ATLETA_A,
          organization_id: MS_CLUB,
          first_name: "Mario",
          last_name: "Rossi",
          birth_date: new Date("2012-05-04T00:00:00.000Z"),
          status: "active",
          category_id: "cat-a-u15",
          category_name: "Under 15 Eccellenza",
          data: {},
          anonymized_at: null,
        },
        {
          id: ATLETA_ALTRO,
          organization_id: ALTRO_CLUB,
          first_name: "Mario",
          last_name: "Rossi",
          birth_date: new Date("2012-05-04T00:00:00.000Z"),
          status: "active",
          category_id: null,
          category_name: null,
          data: {},
          anonymized_at: null,
        },
      ],
      /* L'atleta A appartiene alla stagione A, non a quella attiva. */
      athleteCategoryMembership: [
        { id: "m-1", organization_id: MS_CLUB, athlete_id: ATLETA_A, category_id: "cat-a-u15", category_name: "Under 15 Eccellenza", is_primary: true, site_id: null },
      ],
      athleteGuardian: [],
      athletePayment: [],
      paymentTransaction: [],
      athleteAccountInvite: [],
    },
  );
  base.club.push({
    id: ALTRO_CLUB,
    slug: "altro",
    name: "Altro club",
    creator_id: ALTRA_DIREZIONE,
    categories: [],
    club_sites: [],
    category_groups: [],
    trainers: [],
    staff_members: [],
    settings: {},
    created_at: new Date("2026-01-01T00:00:00.000Z"),
  });
  return base;
};

const scopeDirezione = { userId: MS_DIREZIONE, activeOrganizationId: MS_CLUB, activeRole: "owner", allowedOrganizationIds: [MS_CLUB], accessScopes: [] };
const scopeAllenatore = { userId: ALLENATORE, activeOrganizationId: MS_CLUB, activeRole: "trainer", allowedOrganizationIds: [MS_CLUB], accessScopes: [] };
const scopeAltroClub = { userId: ALTRA_DIREZIONE, activeOrganizationId: ALTRO_CLUB, activeRole: "owner", allowedOrganizationIds: [ALTRO_CLUB], accessScopes: [] };

beforeEach(() => {
  fake = createFakePrisma(seme());
  setPrismaClientForTests(fake.client);
});

/* ── Data di nascita facoltativa ──────────────────────────────────────────── */

test("21-23-24 · si crea senza data di nascita: l'API accetta null e in archivio resta null, nessun segnaposto", async () => {
  const trial = await dominio.createTrialAthlete(scopeDirezione, { firstName: "Luca", lastName: "Verdi", birthDate: null });
  assert.equal(trial.birthDate, null);
  const riga = fake.rows("trialAthlete").find((row) => row.id === trial.id);
  assert.equal(riga.birth_date, null);
  const senzaCampo = await dominio.createTrialAthlete(scopeDirezione, { firstName: "Anna", lastName: "Neri" });
  assert.equal(senzaCampo.birthDate, null);
});

test("22 · si modifica senza data: mandare null la toglie, non mandarla la lascia", async () => {
  const trial = await dominio.createTrialAthlete(scopeDirezione, { firstName: "Luca", lastName: "Verdi", birthDate: "2013-01-02" });
  const senzaTocco = await dominio.updateTrialAthlete(scopeDirezione, trial.id, { notes: "ok" });
  assert.equal(senzaTocco.birthDate, "2013-01-02");
  const tolta = await dominio.updateTrialAthlete(scopeDirezione, trial.id, { birthDate: null });
  assert.equal(tolta.birthDate, null);
});

test("21 · l'elenco, la lettura e la ricerca reggono una prova senza data", async () => {
  const trial = await dominio.createTrialAthlete(scopeDirezione, { firstName: "Luca", lastName: "Verdi" });
  const elenco = await dominio.listTrialAthletes(scopeDirezione, { q: "verdi" });
  assert.equal(elenco.some((row) => row.id === trial.id), true);
  const { trial: riletta } = await dominio.readTrialAthlete(scopeDirezione, trial.id);
  assert.equal(riletta.birthDate, null);
  const cercate = await dominio.searchTrialAthletes(scopeDirezione, { q: "luca verdi", birthDate: "2013-01-02" });
  assert.equal(cercate.some((row) => row.id === trial.id), false, "una data cercata non abbina una prova senza data");
});

test("25 · la conversione chiede la data solo se la prova non la porta, e senza si ferma senza inventare", async () => {
  const senza = await dominio.createTrialAthlete(scopeDirezione, { firstName: "Luca", lastName: "Verdi" });
  await assert.rejects(
    () => dominio.convertTrialAthlete(scopeDirezione, senza.id, { create: {} }),
    /data di nascita e obbligatoria per iscrivere/i,
  );
  assert.equal(fake.rows("athlete").some((row) => row.first_name === "Luca"), false, "nessuna scheda nata a meta");
  const esito = await dominio.convertTrialAthlete(scopeDirezione, senza.id, { create: { birthDate: "2013-01-02" } });
  const scheda = fake.rows("athlete").find((row) => row.id === esito.athleteId);
  assert.equal(String(scheda.birth_date instanceof Date ? scheda.birth_date.toISOString() : scheda.birth_date).slice(0, 10), "2013-01-02");
  /* Con la data sulla prova non serve mandarla. */
  const con = await dominio.createTrialAthlete(scopeDirezione, { firstName: "Anna", lastName: "Neri", birthDate: "2012-03-03" });
  const esitoCon = await dominio.convertTrialAthlete(scopeDirezione, con.id, { create: {} });
  assert.ok(esitoCon.athleteId);
});

test("25 · collegare una scheda esistente non chiede la data", async () => {
  const senza = await dominio.createTrialAthlete(scopeDirezione, { firstName: "Mario", lastName: "Rossi" });
  const esito = await dominio.convertTrialAthlete(scopeDirezione, senza.id, { athleteId: ATLETA_A });
  assert.equal(esito.athleteId, ATLETA_A);
  assert.equal(esito.created, false);
});

/* ── Omonimi in tutto il club ─────────────────────────────────────────────── */

test("26 · prova contro prova con lo stesso nome: avviso", async () => {
  await dominio.createTrialAthlete(scopeDirezione, { firstName: "Luca", lastName: "Verdi", birthDate: "2013-01-02" });
  const esito = await dominio.findTrialHomonyms(scopeDirezione, { firstName: "luca", lastName: "VERDI" });
  assert.equal(esito.trials.length, 1);
  assert.equal(esito.trials[0].kind, "trial");
  assert.equal(esito.trials[0].match, "name");
  const conData = await dominio.findTrialHomonyms(scopeDirezione, { firstName: "Verdi", lastName: "Luca", birthDate: "2013-01-02" });
  assert.equal(conData.trials[0].match, "exact", "nome in qualunque ordine, stessa data → esatta");
});

test("27-28 · prova contro atleta registrato, anche di una stagione non attiva: avviso", async () => {
  const esito = await dominio.findTrialHomonyms(scopeDirezione, { firstName: "Mario", lastName: "Rossi" });
  assert.equal(esito.athletesSearched, true);
  assert.equal(esito.athletes.length, 1);
  assert.equal(esito.athletes[0].id, ATLETA_A, "l'atleta della stagione A compare con B attiva: l'identita e del club");
  assert.equal(esito.athletes[0].kind, "athlete");
  assert.equal(esito.athletes[0].categoryLabel, "Under 15 Eccellenza");
  assert.equal(esito.trials.length, 0);
});

test("29 · un altro tenant non vede mai gli omonimi di questo club", async () => {
  await dominio.createTrialAthlete(scopeDirezione, { firstName: "Mario", lastName: "Rossi" });
  const altrove = await dominio.findTrialHomonyms(scopeAltroClub, { firstName: "Mario", lastName: "Rossi" });
  assert.equal(altrove.trials.length, 0);
  assert.equal(altrove.athletes.length, 1);
  assert.equal(altrove.athletes[0].id, ATLETA_ALTRO, "solo il suo Mario Rossi");
});

test("30-31 · l'avviso non blocca e non fonde: la seconda prova nasce, nessun collegamento automatico", async () => {
  const esito = await dominio.findTrialHomonyms(scopeDirezione, { firstName: "Mario", lastName: "Rossi", birthDate: "2012-05-04" });
  assert.equal(esito.athletes[0].match, "exact");
  const trial = await dominio.createTrialAthlete(scopeDirezione, { firstName: "Mario", lastName: "Rossi", birthDate: "2012-05-04" });
  assert.equal(trial.athleteId ?? null, null, "nessun auto-link");
  assert.equal(fake.rows("athlete").filter((row) => row.organization_id === MS_CLUB).length, 1, "nessun auto-merge, nessuna scheda nuova");
  assert.equal(trial.status, "in_trial", "nessuna auto-conversione");
});

test("accenti e spazi non fanno due nomi: «Sara Bianchì» e «sara  bianchi» sono omonime", async () => {
  await dominio.createTrialAthlete(scopeDirezione, { firstName: "Sara", lastName: "Bianchì" });
  const esito = await dominio.findTrialHomonyms(scopeDirezione, { firstName: "sara ", lastName: " bianchi" });
  assert.equal(esito.trials.length, 1);
});

test("l'allenatore registra prove ma non converte: vede le prove del suo perimetro, e sa che le schede non sono state cercate", async () => {
  await dominio.createTrialAthlete(scopeDirezione, { firstName: "Mario", lastName: "Rossi", categoryId: "cat-b-aquilotti" });
  const esito = await dominio.findTrialHomonyms(scopeAllenatore, { firstName: "Mario", lastName: "Rossi" });
  assert.equal(esito.athletesSearched, false);
  assert.equal(esito.athletes.length, 0, "la scheda atleta omonima non esce a chi non puo convertire");
  assert.equal(esito.trials.length, 0, "la prova degli Aquilotti e fuori dal perimetro di chi non allena nessuno in B");
});

test("chi non puo registrare una prova non cerca omonimi: Accesso negato", async () => {
  const scopeGenitore = { ...scopeDirezione, activeRole: "parent" };
  await assert.rejects(() => dominio.findTrialHomonyms(scopeGenitore, { firstName: "Mario", lastName: "Rossi" }), /Accesso negato/);
});

test("due date mancanti non sono la stessa data: il candidato della conversione e «name», non «exact»", async () => {
  const seed = seme();
  seed.athlete[0].birth_date = null;
  fake = createFakePrisma(seed);
  setPrismaClientForTests(fake.client);
  const senza = await dominio.createTrialAthlete(scopeDirezione, { firstName: "Mario", lastName: "Rossi" });
  const candidati = await dominio.findAthleteCandidates(scopeDirezione, senza.id);
  assert.equal(candidati.length, 1);
  assert.equal(candidati[0].match, "name");
});

test("UAT · una parola corta e comune in ogni cognome («Qa») non nasconde l'omonimo dietro il tetto delle righe", async () => {
  const seed = seme();
  /* 300 atleti «… Qa» prima di «Viola Qa» in ordine alfabetico. */
  for (let i = 0; i < 300; i += 1) {
    seed.athlete.push({ id: `a-${String(i).padStart(4, "0")}-0198-4000-8000-000000000000`.slice(0, 36), organization_id: MS_CLUB, first_name: "Atleta", last_name: `Aaa${String(i).padStart(3, "0")} Qa`, birth_date: null, status: "active", category_id: null, category_name: null, data: {}, anonymized_at: null });
  }
  seed.athlete.push({ id: "a7a7a7a7-0198-4000-8000-000000000777", organization_id: MS_CLUB, first_name: "Andrea", last_name: "Viola Qa", birth_date: null, status: "active", category_id: null, category_name: null, data: {}, anonymized_at: null });
  fake = createFakePrisma(seed);
  setPrismaClientForTests(fake.client);
  const esito = await dominio.findTrialHomonyms(scopeDirezione, { firstName: "Andrea", lastName: "Viola Qa" });
  assert.equal(esito.athletes.length, 1);
  assert.equal(esito.athletes[0].name, "Andrea Viola Qa");
});
