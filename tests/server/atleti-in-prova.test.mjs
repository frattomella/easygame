import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Le persone in prova** (ADR-0188): identita stabile, presenze su una
 * tabella propria, perimetro, tenant, conversione che conserva.
 *
 * I trentatre presidi del mandato, uno per uno. Il doppio di Prisma applica i
 * vincoli della migrazione (una presenza per evento e persona, una scheda per
 * prova); cio che dipende dal database vero — la migrazione applicata, gli
 * invarianti D-RD-16 letti — lo verificano le sonde e il rapporto.
 */

const CLUB = "aaaaaaaa-1188-4000-8000-00000000000a";
const ALTRO_CLUB = "bbbbbbbb-1188-4000-8000-00000000000b";
const DIREZIONE = "11111111-1188-4000-8000-000000000001";
const ALLENATORE = "22222222-1188-4000-8000-000000000002";
const GENITORE = "33333333-1188-4000-8000-000000000003";
const ALTRA_DIREZIONE = "44444444-1188-4000-8000-000000000004";

const EV_U15_1 = "eeeeeeee-1188-4000-8000-000000000001";
const EV_U15_2 = "eeeeeeee-1188-4000-8000-000000000002";
const EV_U13 = "eeeeeeee-1188-4000-8000-000000000003";
const EV_ALTRO = "eeeeeeee-1188-4000-8000-000000000009";
const EV_ANNULLATO = "eeeeeeee-1188-4000-8000-000000000004";

const ATLETA_ESISTENTE = "a7a7a7a7-1188-4000-8000-000000000001";

let dominio;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  dominio = await import("../../src/lib/server/trial-athletes.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import("../../src/lib/server/prisma.ts"));
});

const evento = (id, categoryId, startsAt, extra = {}) => ({
  id,
  organization_id: CLUB,
  kind: "training",
  legacy_id: null,
  title: `Allenamento ${categoryId}`,
  status: "scheduled",
  season_id: extra.season_id || "s2026",
  site_id: extra.site_id || "sede-a",
  category_id: categoryId,
  category_ids: [categoryId],
  category_name: categoryId === "u15" ? "Under 15" : "Under 13",
  group_ids: [],
  starts_at: new Date(startsAt),
  ends_at: new Date(new Date(startsAt).getTime() + 90 * 60_000),
  location: "Palestra",
  version: 1,
  payload: {},
  ...extra,
});

const seme = () => ({
  user: [
    { id: DIREZIONE, email: "direzione@club.it", role: "owner" },
    { id: ALLENATORE, email: "coach@club.it", role: "trainer" },
    { id: GENITORE, email: "genitore@club.it", role: "parent" },
    { id: ALTRA_DIREZIONE, email: "altra@club.it", role: "owner" },
  ],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      creator_id: DIREZIONE,
      categories: [
        { id: "u15", name: "Under 15" },
        { id: "u13", name: "Under 13" },
      ],
      club_sites: [
        { id: "sede-a", name: "Sede A" },
        { id: "sede-b", name: "Sede B" },
      ],
      category_groups: [{ categoryId: "u15", siteId: "sede-a", name: "Under 15 · Sede A", active: true }],
      trainers: [{ id: "tr-1", user_id: ALLENATORE, email: "coach@club.it", categories: ["u15"] }],
      staff_members: [],
      settings: { seasons: [] },
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: ALTRO_CLUB,
      slug: "altro",
      name: "Altro club",
      creator_id: ALTRA_DIREZIONE,
      categories: [{ id: "u15", name: "Under 15" }],
      club_sites: [],
      category_groups: [],
      trainers: [],
      staff_members: [],
      settings: {},
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  organizationUser: [
    { id: "ou-1", organization_id: CLUB, user_id: DIREZIONE, role: "owner" },
    { id: "ou-2", organization_id: CLUB, user_id: ALLENATORE, role: "trainer" },
    { id: "ou-3", organization_id: CLUB, user_id: GENITORE, role: "parent" },
    { id: "ou-4", organization_id: ALTRO_CLUB, user_id: ALTRA_DIREZIONE, role: "owner" },
  ],
  clubResourceItem: [],
  clubEvent: [
    evento(EV_U15_1, "u15", "2026-09-16T18:00:00.000Z"),
    evento(EV_U15_2, "u15", "2026-09-23T18:00:00.000Z", { season_id: "s2027" }),
    evento(EV_U13, "u13", "2026-09-17T18:00:00.000Z"),
    evento(EV_ANNULLATO, "u15", "2026-09-30T18:00:00.000Z", { status: "cancelled" }),
    { ...evento(EV_ALTRO, "u15", "2026-09-18T18:00:00.000Z"), organization_id: ALTRO_CLUB },
  ],
  clubEventParticipant: [],
  athlete: [
    {
      id: ATLETA_ESISTENTE,
      organization_id: CLUB,
      first_name: "Mario",
      last_name: "Rossi",
      birth_date: new Date("2012-05-04T00:00:00.000Z"),
      status: "active",
      category_id: "u15",
      category_name: "Under 15",
      data: {},
      anonymized_at: null,
    },
  ],
  athleteCategoryMembership: [
    { id: "m-1", organization_id: CLUB, athlete_id: ATLETA_ESISTENTE, category_id: "u15", category_name: "Under 15", is_primary: true, site_id: null },
  ],
  athleteGuardian: [],
  athletePayment: [],
  paymentTransaction: [],
  athleteAccountInvite: [],
  trialAthlete: [],
  trialAttendance: [],
  auditLog: [],
});

const scopeDirezione = { userId: DIREZIONE, activeOrganizationId: CLUB, activeRole: "owner", allowedOrganizationIds: [CLUB], accessScopes: [] };
const scopeAllenatore = { userId: ALLENATORE, activeOrganizationId: CLUB, activeRole: "trainer", allowedOrganizationIds: [CLUB], accessScopes: [] };
const scopeGenitore = { userId: GENITORE, activeOrganizationId: CLUB, activeRole: "parent", allowedOrganizationIds: [CLUB], accessScopes: [] };
const scopeAltroClub = { userId: ALTRA_DIREZIONE, activeOrganizationId: ALTRO_CLUB, activeRole: "owner", allowedOrganizationIds: [ALTRO_CLUB], accessScopes: [] };

beforeEach(() => {
  fake = createFakePrisma(seme());
  setPrismaClientForTests(fake.client);
});

const righe = (delegato) => fake.client[delegato].__rows?.() ?? fake.rowsOf?.(delegato) ?? [];
const conta = async (delegato) => (await fake.client[delegato].findMany({})).length;

const mario = (extra = {}) => ({ firstName: "Mario", lastName: "Rossi", birthDate: "2012-05-04", categoryId: "u15", ...extra });

const conPresenze = async (scope = scopeDirezione) => {
  const trial = await dominio.createTrialAthlete(scope, mario());
  await dominio.saveEventTrialAttendance(scope, EV_U15_1, [{ trialAthleteId: trial.id, status: "present" }]);
  await dominio.saveEventTrialAttendance(scope, EV_U15_2, [{ trialAthleteId: trial.id, status: "present" }]);
  return trial;
};

/* 1 */
test("1 · una persona in prova si registra con nome e cognome (la data di nascita e facoltativa), e nasce «in prova»", async () => {
  const trial = await dominio.createTrialAthlete(scopeDirezione, mario());
  assert.ok(trial.id);
  assert.equal(trial.status, "in_trial");
  assert.equal(trial.birthDate, "2012-05-04");
  assert.equal(trial.trialsCount, 0);
  /* Da ADR-0198 §4 la data di nascita e facoltativa: senza, la prova nasce con `null`. */
  const senzaData = await dominio.createTrialAthlete(scopeDirezione, { firstName: "Solo", lastName: "Nome" });
  assert.equal(senzaData.birthDate, null);
  await assert.rejects(() => dominio.createTrialAthlete(scopeDirezione, { firstName: "Data", lastName: "Storta", birthDate: "ieri" }), /non e valida/i);
});

/* 2 */
test("2 · l'identita e l'identificativo, stabile: cambiare il nome non cambia la persona", async () => {
  const trial = await dominio.createTrialAthlete(scopeDirezione, mario());
  const aggiornata = await dominio.updateTrialAthlete(scopeDirezione, trial.id, { firstName: "Marius" });
  assert.equal(aggiornata.id, trial.id);
  const riletta = await dominio.readTrialAthlete(scopeDirezione, trial.id);
  assert.equal(riletta.trial.id, trial.id);
  assert.equal(riletta.trial.firstName, "Marius");
});

/* 3, 4, 5, 6, 7 */
test("3 · la stessa persona torna e la seconda presenza si registra sullo stesso identificativo", async () => {
  const trial = await conPresenze();
  const presenze = await fake.client.trialAttendance.findMany({ where: { trial_athlete_id: trial.id } });
  assert.equal(presenze.length, 2);
  assert.ok(presenze.every((riga) => riga.trial_athlete_id === trial.id));
});

test("4 · il totale delle prove e 2, derivato dalle presenze", async () => {
  const trial = await conPresenze();
  const { trial: riletta } = await dominio.readTrialAthlete(scopeDirezione, trial.id);
  assert.equal(riletta.trialsCount, 2);
});

test("5 · la prima prova e la data del primo evento", async () => {
  const trial = await conPresenze();
  const { trial: riletta } = await dominio.readTrialAthlete(scopeDirezione, trial.id);
  assert.equal(riletta.firstTrialAt, "2026-09-16T18:00:00.000Z");
});

test("6 · l'ultima prova e la data dell'ultimo evento", async () => {
  const trial = await conPresenze();
  const { trial: riletta } = await dominio.readTrialAthlete(scopeDirezione, trial.id);
  assert.equal(riletta.lastTrialAt, "2026-09-23T18:00:00.000Z");
});

test("7 · l'elenco delle prove porta evento, categoria e sede, dal piu recente", async () => {
  const trial = await conPresenze();
  const { attendances } = await dominio.readTrialAthlete(scopeDirezione, trial.id);
  assert.equal(attendances.length, 2);
  assert.equal(attendances[0].eventId, EV_U15_2);
  assert.equal(attendances[1].eventId, EV_U15_1);
  assert.equal(attendances[0].event.categoryLabel, "Under 15");
  assert.equal(attendances[0].event.siteId, "sede-a");
  assert.equal(attendances[0].status, "present");
});

/* 8 */
test("8 · nessuna presenza con un nominativo libero: solo identificativi di righe che esistono", async () => {
  const prima = await conta("trialAttendance");
  const risultato = await dominio.saveEventTrialAttendance(scopeDirezione, EV_U15_1, [{ name: "Mario Rossi", status: "present" }, { trialAthleteId: "non-un-uuid" }]);
  assert.equal(await conta("trialAttendance"), prima, "una voce senza identificativo non scrive niente");
  assert.ok(Array.isArray(risultato));
  await assert.rejects(
    () => dominio.saveEventTrialAttendance(scopeDirezione, EV_U15_1, [{ trialAthleteId: "99999999-1188-4000-8000-000000000099", status: "present" }]),
    /Accesso negato/,
  );
  /* E la superficie non manda mai un nome: la sezione del registro scrive `trialAthleteId`. */
  const sezione = readFileSync(path.join(process.cwd(), "src/components/training/v2/TrialAttendanceSection.tsx"), "utf8");
  assert.match(sezione, /trialAthleteId: row\.trial\.id/);
  assert.doesNotMatch(sezione, /entries:\s*\[\s*\{\s*name/);
});

/* 9 */
test("9 · due omonimi con date di nascita diverse sono due persone: nessun merge", async () => {
  const uno = await dominio.createTrialAthlete(scopeDirezione, mario({ birthDate: "2012-05-04" }));
  const due = await dominio.createTrialAthlete(scopeDirezione, mario({ birthDate: "2013-02-11" }));
  assert.notEqual(uno.id, due.id);
  const elenco = await dominio.listTrialAthletes(scopeDirezione, { q: "Mario Rossi" });
  assert.equal(elenco.length, 2);
  const { findTrialMatches } = await import("../../src/components/trials/v2/trial-model.ts");
  const proposte = findTrialMatches({ firstName: "Mario", lastName: "Rossi", birthDate: "2013-02-11" }, elenco);
  assert.equal(proposte.length, 2, "si propongono entrambi");
  assert.equal(proposte[0].trial.id, due.id, "quello con la stessa data viene prima");
  assert.equal(proposte[0].exact, true);
});

/* 10, 11, 12, 13, 14 */
test("10 · una persona in prova non e un atleta: nessuna riga in athletes", async () => {
  const prima = await conta("athlete");
  await conPresenze();
  assert.equal(await conta("athlete"), prima);
});

test("11 · una persona in prova non entra nella rosa: nessuna riga in club_event_participants", async () => {
  await conPresenze();
  assert.equal(await conta("clubEventParticipant"), 0);
});

test("12 · nessuna quota, rata o incasso nasce da una prova", async () => {
  await conPresenze();
  assert.equal(await conta("athletePayment"), 0);
  assert.equal(await conta("paymentTransaction"), 0);
});

test("13 · nessun tutore nasce da una prova, nemmeno con il nome del genitore scritto", async () => {
  await dominio.createTrialAthlete(scopeDirezione, mario({ guardianName: "Anna Rossi", guardianPhone: "333" }));
  assert.equal(await conta("athleteGuardian"), 0);
});

test("14 · nessun accesso EasyGame nasce da una prova", async () => {
  const prima = await conta("user");
  await dominio.createTrialAthlete(scopeDirezione, mario({ email: "mario@esempio.it" }));
  assert.equal(await conta("user"), prima);
  assert.equal(await conta("athleteAccountInvite"), 0);
});

/* 15, 16, 17, 18, 19 */
test("15 · la categoria si scrive canonica: un nome che ne nomina una diventa il suo identificativo", async () => {
  const trial = await dominio.createTrialAthlete(scopeDirezione, mario({ categoryId: "", categoryName: "Under 15" }));
  const riga = (await fake.client.trialAthlete.findMany({ where: { id: trial.id } }))[0];
  assert.equal(riga.category_id, "u15");
  assert.equal(trial.categoryId, "u15");
});

test("16 · la sede e quella della squadra (ADR-0194 §16): una sede inesistente non si scrive, una sede dove la categoria non si svolge nemmeno, e con una squadra sola si deriva", async () => {
  const trial = await dominio.createTrialAthlete(scopeDirezione, mario({ siteId: "sede-a" }));
  assert.equal(trial.siteId, "sede-a");
  assert.equal(trial.siteName, "Sede A");
  await assert.rejects(() => dominio.createTrialAthlete(scopeDirezione, mario({ siteId: "sede-fantasma" })), /sede indicata non esiste/);
  await assert.rejects(() => dominio.createTrialAthlete(scopeDirezione, mario({ siteId: "sede-b" })), /non si svolge nella sede «Sede B»/);
  const derivata = await dominio.createTrialAthlete(scopeDirezione, mario({ firstName: "Luca" }));
  assert.equal(derivata.siteId, "sede-a", "Under 15 ha una squadra sola: la sede e la sua");
  assert.equal(derivata.groupId, null, "il gruppo resta una scelta esplicita: non entra nel perimetro dei gruppi da solo");
});

test("17 · il gruppo e un identificativo del club, coerente con la categoria", async () => {
  const trial = await dominio.createTrialAthlete(scopeDirezione, mario({ groupId: "group:u15:sede-a" }));
  assert.equal(trial.groupId, "group:u15:sede-a");
  await assert.rejects(() => dominio.createTrialAthlete(scopeDirezione, mario({ categoryId: "u13", groupId: "group:u15:sede-a" })), /altra categoria/);
  await assert.rejects(() => dominio.createTrialAthlete(scopeDirezione, mario({ groupId: "grp-fantasma" })), /gruppo indicato non esiste/);
});

test("18 · l'etichetta e quella dell'indice canonico, mai l'identificativo grezzo", async () => {
  const trial = await dominio.createTrialAthlete(scopeDirezione, mario());
  assert.equal(trial.categoryLabel, "Under 15");
  assert.notEqual(trial.categoryLabel, trial.categoryId);
  const sorgente = readFileSync(path.join(process.cwd(), "src/lib/server/trial-athletes.ts"), "utf8");
  assert.match(sorgente, /buildCategoryDisplayIndex/, "l'etichetta viene dall'indice ADR-0185");
});

test("19 · un nome che nessuna categoria porta non crea un fantasma", async () => {
  await assert.rejects(() => dominio.createTrialAthlete(scopeDirezione, mario({ categoryId: "", categoryName: "Under 99" })), /non identifica una categoria/);
  assert.equal(await conta("trialAthlete"), 0);
});

/* 20, 21 */
test("20 · l'allenatore registra una persona in prova e la sua presenza dentro il proprio perimetro", async () => {
  const trial = await dominio.createTrialAthlete(scopeAllenatore, mario());
  assert.equal(trial.categoryId, "u15");
  const righe = await dominio.saveEventTrialAttendance(scopeAllenatore, EV_U15_1, [{ trialAthleteId: trial.id, status: "present" }]);
  assert.equal(righe.find((riga) => riga.trial.id === trial.id)?.attendance?.status, "present");
  assert.equal(trial.phone, undefined, "i recapiti non si mostrano a chi non puo leggerli");
});

test("21 · fuori dal perimetro, o con un ruolo che non puo, l'atto e negato e tracciato", async () => {
  await assert.rejects(() => dominio.createTrialAthlete(scopeAllenatore, mario({ categoryId: "u13" })), /Accesso negato/);
  const trial = await dominio.createTrialAthlete(scopeDirezione, mario({ categoryId: "u13" }));
  await assert.rejects(() => dominio.saveEventTrialAttendance(scopeAllenatore, EV_U13, [{ trialAthleteId: trial.id }]), /Accesso negato/);
  await assert.rejects(() => dominio.createTrialAthlete(scopeGenitore, mario()), /Accesso negato/);
  await assert.rejects(() => dominio.listTrialAthletes(scopeGenitore), /Accesso negato/);
  const dinieghi = (await fake.client.auditLog.findMany({})).filter((riga) => riga.action === "permission.denied");
  assert.ok(dinieghi.length >= 3, "ogni diniego lascia una riga");
});

/* 22 */
test("22 · convertire in atleta e della segreteria: l'allenatore non puo", async () => {
  const trial = await dominio.createTrialAthlete(scopeAllenatore, mario());
  await assert.rejects(() => dominio.convertTrialAthlete(scopeAllenatore, trial.id, { create: {} }), /Accesso negato/);
  await assert.rejects(() => dominio.findAthleteCandidates(scopeAllenatore, trial.id), /Accesso negato/);
});

/* 23 */
test("23 · la conversione crea la scheda atleta con la categoria della prova come primaria", async () => {
  const trial = await conPresenze();
  const esito = await dominio.convertTrialAthlete(scopeDirezione, trial.id, { create: {} });
  assert.equal(esito.created, true);
  assert.equal(esito.trial.status, "enrolled");
  assert.equal(esito.trial.athleteId, esito.athleteId);
  const atleta = (await fake.client.athlete.findMany({ where: { id: esito.athleteId } }))[0];
  assert.ok(atleta, "la scheda esiste");
  assert.equal(atleta.first_name, "Mario");
  assert.equal(atleta.status, "active");
  assert.equal(atleta.category_id, "u15");
  const appartenenze = await fake.client.athleteCategoryMembership.findMany({ where: { athlete_id: esito.athleteId } });
  assert.equal(appartenenze.length, 1);
  assert.equal(appartenenze[0].category_id, "u15");
  assert.equal(appartenenze[0].is_primary, true);
});

/* 24 */
test("24 · prima di creare si propongono le schede esistenti, e si puo collegare quella giusta", async () => {
  const trial = await dominio.createTrialAthlete(scopeDirezione, mario());
  const candidate = await dominio.findAthleteCandidates(scopeDirezione, trial.id);
  assert.equal(candidate.length, 1);
  assert.equal(candidate[0].id, ATLETA_ESISTENTE);
  assert.equal(candidate[0].match, "exact");
  const prima = await conta("athlete");
  const esito = await dominio.convertTrialAthlete(scopeDirezione, trial.id, { athleteId: ATLETA_ESISTENTE });
  assert.equal(esito.created, false);
  assert.equal(esito.athleteId, ATLETA_ESISTENTE);
  assert.equal(await conta("athlete"), prima, "nessun duplicato");
});

/* 25, 26, 27 */
test("25 · dopo la conversione lo storico delle prove resta leggibile", async () => {
  const trial = await conPresenze();
  await dominio.convertTrialAthlete(scopeDirezione, trial.id, { create: {} });
  const { trial: riletta, attendances } = await dominio.readTrialAthlete(scopeDirezione, trial.id);
  assert.equal(riletta.status, "enrolled");
  assert.equal(riletta.trialsCount, 2, "«ha fatto 2 allenamenti di prova prima dell'iscrizione»");
  assert.equal(attendances.length, 2);
  assert.ok(riletta.convertedAt);
});

test("26 · le presenze non si duplicano: ne alla conversione, ne salvando due volte la stessa", async () => {
  const trial = await conPresenze();
  await dominio.saveEventTrialAttendance(scopeDirezione, EV_U15_1, [{ trialAthleteId: trial.id, status: "present" }]);
  assert.equal(await conta("trialAttendance"), 2, "un upsert su (evento, persona)");
  await dominio.convertTrialAthlete(scopeDirezione, trial.id, { create: {} });
  assert.equal(await conta("trialAttendance"), 2);
  assert.equal(await conta("clubEventParticipant"), 0, "le prove non diventano appello degli atleti");
});

test("27 · il legame prova → atleta resta, ed e unico", async () => {
  const trial = await conPresenze();
  const esito = await dominio.convertTrialAthlete(scopeDirezione, trial.id, { create: {} });
  const riga = (await fake.client.trialAthlete.findMany({ where: { id: trial.id } }))[0];
  assert.equal(riga.athlete_id, esito.athleteId);
  await assert.rejects(() => dominio.convertTrialAthlete(scopeDirezione, trial.id, { create: {} }), /gia iscritta/);
  const seconda = await dominio.createTrialAthlete(scopeDirezione, mario({ birthDate: "2011-01-01" }));
  await assert.rejects(() => dominio.convertTrialAthlete(scopeDirezione, seconda.id, { athleteId: esito.athleteId }), /gia collegata/);
});

/* 28, 29 */
test("28 · chi non prosegue esce dal registro presenze e non si puo segnare presente", async () => {
  const trial = await conPresenze();
  await dominio.setTrialAthleteStatus(scopeDirezione, trial.id, "declined");
  const inRegistro = await dominio.listEventTrialAttendance(scopeDirezione, EV_U13);
  assert.ok(!inRegistro.some((riga) => riga.trial.id === trial.id));
  await assert.rejects(() => dominio.saveEventTrialAttendance(scopeDirezione, EV_U13, [{ trialAthleteId: trial.id }]), /ancora in prova/);
  await assert.rejects(() => dominio.setTrialAthleteStatus(scopeDirezione, trial.id, "enrolled"), /conversione/);
});

test("29 · chi non prosegue conserva lo storico, e puo tornare in prova", async () => {
  const trial = await conPresenze();
  const declinata = await dominio.setTrialAthleteStatus(scopeDirezione, trial.id, "declined");
  assert.equal(declinata.status, "declined");
  assert.ok(declinata.declinedAt);
  const { attendances, trial: riletta } = await dominio.readTrialAthlete(scopeDirezione, trial.id);
  assert.equal(attendances.length, 2);
  assert.equal(riletta.trialsCount, 2);
  const ripresa = await dominio.setTrialAthleteStatus(scopeDirezione, trial.id, "in_trial");
  assert.equal(ripresa.status, "in_trial");
  assert.equal(ripresa.declinedAt, null);
});

/* 30 */
test("30 · un altro club non vede, non tocca e non converte le prove di questo", async () => {
  const trial = await conPresenze();
  assert.deepEqual(await dominio.listTrialAthletes(scopeAltroClub), []);
  await assert.rejects(() => dominio.readTrialAthlete(scopeAltroClub, trial.id), /non trovata/);
  await assert.rejects(() => dominio.updateTrialAthlete(scopeAltroClub, trial.id, { notes: "x" }), /non trovata/);
  await assert.rejects(() => dominio.convertTrialAthlete(scopeAltroClub, trial.id, { create: {} }), /non trovata/);
  await assert.rejects(() => dominio.saveEventTrialAttendance(scopeDirezione, EV_ALTRO, [{ trialAthleteId: trial.id }]), /non trovato|Accesso negato/);
  await assert.rejects(() => dominio.saveEventTrialAttendance(scopeAltroClub, EV_ALTRO, [{ trialAthleteId: trial.id }]), /Accesso negato/);
  /* Uno scope con un club attivo fuori dai consentiti non passa. */
  await assert.rejects(() => dominio.listTrialAthletes({ ...scopeAltroClub, activeOrganizationId: CLUB }), /Accesso negato/);
});

/* 31 */
test("31 · la persona e del club, la prova e della stagione dell'evento", async () => {
  const trial = await conPresenze();
  const { attendances } = await dominio.readTrialAthlete(scopeDirezione, trial.id);
  const stagioni = new Set(attendances.map((riga) => riga.event.seasonId));
  assert.deepEqual([...stagioni].sort(), ["s2026", "s2027"], "due stagioni, una persona sola");
  assert.equal(await conta("trialAthlete"), 1, "nessuna seconda riga per il cambio di stagione");
  await assert.rejects(() => dominio.saveEventTrialAttendance(scopeDirezione, EV_ANNULLATO, [{ trialAthleteId: trial.id }]), /annullato/);
});

/* 32, 33 */
test("32 · la migrazione e additiva: non tocca appartenenze, atleti ne presenze degli atleti (D-RD-16)", () => {
  const cartella = path.join(process.cwd(), "prisma/migrations/20260916120000_adr0188_atleti_in_prova/migration.sql");
  assert.ok(existsSync(cartella));
  const sql = readFileSync(cartella, "utf8");
  const istruzioni = sql
    .split("\n")
    .filter((riga) => !riga.trim().startsWith("--") && riga.trim())
    .join("\n");
  assert.doesNotMatch(istruzioni, /athlete_category_memberships/);
  assert.doesNotMatch(istruzioni, /club_event_participants/);
  assert.doesNotMatch(istruzioni, /ALTER TABLE "athletes"/);
  assert.doesNotMatch(istruzioni, /^\s*(UPDATE|DELETE|DROP|TRUNCATE)\b/m, "nessuna istruzione che tocchi righe esistenti");
  assert.match(istruzioni, /CREATE TABLE "trial_athletes"/);
  assert.match(istruzioni, /CREATE TABLE "trial_attendances"/);
});

test("33 · la categoria di una prova passa dal vaglio di ADR-0186, mai dall'etichetta (D-RD-17)", () => {
  const sorgente = readFileSync(path.join(process.cwd(), "src/lib/server/trial-athletes.ts"), "utf8");
  assert.match(sorgente, /canonicalizeCategoryReferenceForWrite/);
  assert.match(sorgente, /loadClubCategoryCatalog/);
  const codice = sorgente.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(codice, /category_id:\s*(asText\()?input\.categoryName/, "il nome non finisce mai nella colonna dell'identificativo");
  const guardia = readFileSync(path.join(process.cwd(), "src/lib/server/category-write-guard.ts"), "utf8");
  assert.match(guardia, /export const assertMembershipCategoryIsCanonical/, "il vaglio del registro generico resta al suo posto");
});

/* ── Revisione ostile (ADR-0188): cio che la prima stesura non provava ──── */

test("34 · i recapiti non arrivano all'allenatore in nessuna lettura, e la ricerca non li tasta", async () => {
  const trial = await dominio.createTrialAthlete(scopeDirezione, mario({ phone: "3331234567", email: "mario@example.com" }));
  const conRecapiti = await dominio.readTrialAthlete(scopeDirezione, trial.id);
  assert.strictEqual(conRecapiti.trial.phone, "3331234567");

  const letta = await dominio.readTrialAthlete(scopeAllenatore, trial.id);
  assert.ok(!("phone" in letta.trial) || letta.trial.phone === undefined, "la scheda non porta il telefono");
  assert.ok(!("email" in letta.trial) || letta.trial.email === undefined, "ne l'email");
  const elenco = await dominio.listTrialAthletes(scopeAllenatore, {});
  assert.ok(elenco.every((voce) => voce.phone === undefined && voce.email === undefined), "l'elenco nemmeno");
  const presenze = await dominio.listEventTrialAttendance(scopeAllenatore, EV_U15_1);
  assert.ok(presenze.every((riga) => riga.trial.phone === undefined), "il registro presenze nemmeno");

  /* L'oracolo: «chi ha questo numero?» non risponde a chi non puo leggerlo. */
  assert.equal((await dominio.listTrialAthletes(scopeAllenatore, { q: "3331234567" })).length, 0);
  assert.equal((await dominio.listTrialAthletes(scopeDirezione, { q: "3331234567" })).length, 1);
  /* E non li scrive nemmeno: in creazione come in modifica. */
  await assert.rejects(() => dominio.createTrialAthlete(scopeAllenatore, mario({ phone: "3339999999" })), /Accesso negato/);
  await assert.rejects(() => dominio.updateTrialAthlete(scopeAllenatore, trial.id, { phone: "3339999999" }), /Accesso negato/);
});

test("35 · l'allenatore legge solo le prove del proprio perimetro, e non le sposta fuori", async () => {
  const dentro = await dominio.createTrialAthlete(scopeDirezione, mario({ categoryId: "u15" }));
  const fuori = await dominio.createTrialAthlete(scopeDirezione, mario({ firstName: "Luca", categoryId: "u13" }));
  const viste = (await dominio.listTrialAthletes(scopeAllenatore, {})).map((voce) => voce.id);
  assert.ok(viste.includes(dentro.id));
  assert.ok(!viste.includes(fuori.id), "l'Under 13 non e del suo perimetro");
  await assert.rejects(() => dominio.readTrialAthlete(scopeAllenatore, fuori.id), /non trovata|Accesso negato/);
  /* Spostare una prova nell'Under 13 e un atto sull'Under 13. */
  await assert.rejects(() => dominio.updateTrialAthlete(scopeAllenatore, dentro.id, { categoryId: "u13" }), /Accesso negato/);
  /* E una prova senza categoria non e dell'allenatore: nessun perimetro la coprirebbe. */
  await assert.rejects(() => dominio.createTrialAthlete(scopeAllenatore, { firstName: "Sara", lastName: "Bianchi", birthDate: "2012-01-01" }), /Accesso negato/);
  const riletta = await fake.client.trialAthlete.findFirst({ where: { id: dentro.id } });
  assert.equal(riletta.category_id, "u15");
});

test("36 · null azzera il gruppo e la sede torna quella della squadra (ADR-0194 §16); un cambio di categoria non si porta dietro il gruppo di un'altra", async () => {
  const trial = await dominio.createTrialAthlete(scopeDirezione, mario({ siteId: "sede-a", groupId: "group:u15:sede-a" }));
  assert.equal(trial.siteId, "sede-a");
  const senzaSede = await dominio.updateTrialAthlete(scopeDirezione, trial.id, { siteId: null, groupId: null });
  assert.equal(senzaSede.siteId, "sede-a", "Under 15 si svolge in una sede sola: la sede non e un campo da azzerare, e derivata");
  assert.equal(senzaSede.groupId, null);
  const conGruppo = await dominio.updateTrialAthlete(scopeDirezione, trial.id, { groupId: "group:u15:sede-a" });
  assert.equal(conGruppo.groupId, "group:u15:sede-a");
  await assert.rejects(() => dominio.updateTrialAthlete(scopeDirezione, trial.id, { categoryId: "u13" }), /altra categoria/);
});

test("37 · la conversione non crea tutori, utenze ne inviti, e la proiezione della scheda dice le righe coniate", async () => {
  const trial = await conPresenze();
  const utentiPrima = await conta("user");
  const esito = await dominio.convertTrialAthlete(scopeDirezione, trial.id, { create: {} });
  assert.equal(esito.created, true);
  assert.equal(await conta("athleteGuardian"), 0);
  assert.equal(await conta("athleteAccountInvite"), 0);
  assert.equal(await conta("user"), utentiPrima);
  const scheda = await fake.client.athlete.findFirst({ where: { id: esito.athleteId } });
  assert.equal(scheda.user_id ?? null, null);
  const righeAppartenenza = await fake.client.athleteCategoryMembership.findMany({ where: { athlete_id: esito.athleteId } });
  assert.equal(righeAppartenenza.length, 1);
  const proiezione = scheda.data?.categoryMemberships || [];
  assert.deepEqual(proiezione.map((voce) => voce.id), righeAppartenenza.map((riga) => riga.id), "ogni voce della proiezione e una riga (D-RD-16)");
});

test("38 · due «Converti» insieme creano una scheda sola: la seconda presa fallisce prima di scrivere", async () => {
  const trial = await dominio.createTrialAthlete(scopeDirezione, mario());
  const atletiPrima = await conta("athlete");
  const esiti = await Promise.allSettled([
    dominio.convertTrialAthlete(scopeDirezione, trial.id, { create: {} }),
    dominio.convertTrialAthlete(scopeDirezione, trial.id, { create: {} }),
  ]);
  assert.equal(esiti.filter((esito) => esito.status === "fulfilled").length, 1);
  assert.match(String(esiti.find((esito) => esito.status === "rejected")?.reason?.message), /gia in corso o completata/);
  assert.equal(await conta("athlete"), atletiPrima + 1);
});

test("39 · una presenza segnata per sbaglio si toglie: status null cancella la riga", async () => {
  const trial = await dominio.createTrialAthlete(scopeDirezione, mario());
  await dominio.saveEventTrialAttendance(scopeDirezione, EV_U15_1, [{ trialAthleteId: trial.id, status: "present" }]);
  assert.equal((await fake.client.trialAttendance.findMany({ where: { trial_athlete_id: trial.id } })).length, 1);
  const righe = await dominio.saveEventTrialAttendance(scopeDirezione, EV_U15_1, [{ trialAthleteId: trial.id, status: null }]);
  assert.equal(righe.find((riga) => riga.trial.id === trial.id)?.attendance ?? null, null);
  assert.equal((await fake.client.trialAttendance.findMany({ where: { trial_athlete_id: trial.id } })).length, 0);
  const { trial: riletta } = await dominio.readTrialAthlete(scopeDirezione, trial.id);
  assert.equal(riletta.trialsCount, 0);
});

test("40 · la cancellazione dell'anagrafica sa della scheda di prova: la guardia la conta, la cancellazione la toglie", async () => {
  const soggetto = await import("../../src/lib/server/data-subject.ts");
  const trial = await conPresenze();
  const esito = await dominio.convertTrialAthlete(scopeDirezione, trial.id, { athleteId: ATLETA_ESISTENTE });
  assert.equal(esito.athleteId, ATLETA_ESISTENTE);
  await assert.rejects(() => soggetto.assertPersonalDataDisposed("athletes", ATLETA_ESISTENTE, CLUB), /schede di persona in prova/);
  await soggetto.assertPersonalDataDisposed("athletes", "a7a7a7a7-1188-4000-8000-000000000099", CLUB);
  const sorgente = readFileSync(path.join(process.cwd(), "src/lib/server/data-subject.ts"), "utf8");
  assert.match(sorgente, /cancella\("trial_athletes", "trialAthlete"/, "eraseDataSubject toglie la riga di prova");
  assert.match(sorgente, /table: "trial_athletes"/, "e il riepilogo la dichiara");
});

test("41 · cancellare la scheda atleta nata da una prova non e vietato dall'archivio (vincolo tollerante)", () => {
  const cartella = path.join(process.cwd(), "prisma/migrations/20260916150000_adr0188_prova_senza_scheda_dopo_cancellazione/migration.sql");
  assert.ok(existsSync(cartella));
  const sql = readFileSync(cartella, "utf8");
  assert.match(sql, /CHECK \("status" = 'enrolled' OR "athlete_id" IS NULL\)/);
  assert.doesNotMatch(sql, /ALTER TABLE "athletes"|athlete_category_memberships|club_event_participants/);
  const prima = readFileSync(path.join(process.cwd(), "prisma/migrations/20260916120000_adr0188_atleti_in_prova/migration.sql"), "utf8");
  assert.match(prima, /ON DELETE SET NULL/, "la chiave esterna su athletes resta SET NULL");
});

test("42 · la modifica lascia nel registro da dove a dove: categoria e sede", async () => {
  const trial = await dominio.createTrialAthlete(scopeDirezione, mario({ siteId: "sede-a" }));
  /* Under 13 non ha squadre: la sede di Sede A non la segue (ADR-0194), e la sede B non e una sua squadra. */
  await assert.rejects(() => dominio.updateTrialAthlete(scopeDirezione, trial.id, { categoryId: "u13", siteId: "sede-b" }), /non si svolge nella sede «Sede B»/);
  await dominio.updateTrialAthlete(scopeDirezione, trial.id, { categoryId: "u13", siteId: null });
  const voce = (await fake.client.auditLog.findMany({})).find((riga) => riga.action === "trial_athlete.updated");
  assert.ok(voce, "l'audit c'e");
  assert.deepEqual(voce.metadata?.categoryId, { da: "u15", a: "u13" });
  assert.deepEqual(voce.metadata?.siteId, { da: "sede-a", a: null });
});

/* ── D-RD-22 chiuso: la conversione e una transazione sola ─────────────── */

test("43 · la conversione scrive scheda, appartenenze e collegamento nella stessa transazione, e la proiezione nasce con le righe vere", async () => {
  const sorgente = readFileSync(path.join(process.cwd(), "src/lib/server/trial-athletes.ts"), "utf8");
  const codice = sorgente.replace(/\/\*[\s\S]*?\*\//g, "");
  const conversione = codice.slice(codice.indexOf("export const convertTrialAthlete"));
  assert.match(conversione, /prisma\.\$transaction\(\s*async \(tx\) =>/, "una transazione sola");
  assert.match(conversione, /tx\.trialAthlete\.updateMany\(/, "la presa e dentro la transazione");
  assert.match(conversione, /tx\.trialAthlete\.update\(/, "e il collegamento pure");
  assert.equal((conversione.match(/\{ client: tx \}/g) || []).length, 2, "scheda e appartenenze passano dal registro generico con la transazione di chi chiama");
  assert.doesNotMatch(conversione, /updateResource\(/, "niente seconda scrittura per riallineare la proiezione");
  assert.doesNotMatch(conversione, /rilascia/, "niente rilascio a mano: il rollback e della transazione");
  assert.match(conversione, /id: randomUUID\(\)/, "gli identificativi delle appartenenze si coniano prima");

  /* Il registro generico accetta il client (ADR-0188): solo in creazione. */
  const registro = readFileSync(path.join(process.cwd(), "src/lib/server/resources.ts"), "utf8");
  assert.match(registro, /client\?: unknown;/, "ResourceRequestOptions.client");
  assert.match(registro, /options\?\.client\s*\?\s*clientDelegate\(options\.client, resource\)\s*:\s*getDelegate\(resource\)/, "createResource scrive dal client di chi chiama");

  /* Sul fake: la proiezione cita esattamente le righe coniate, senza seconda scrittura. */
  const trial = await dominio.createTrialAthlete(scopeDirezione, mario({ categoryId: "u15" }));
  const esito = await dominio.convertTrialAthlete(scopeDirezione, trial.id, { create: {} }, { userId: DIREZIONE });
  const scheda = await fake.client.athlete.findFirst({ where: { id: esito.athleteId } });
  const righe = await fake.client.athleteCategoryMembership.findMany({ where: { athlete_id: esito.athleteId } });
  assert.equal(righe.length, 1);
  assert.deepEqual(scheda.data.categoryMemberships.map((m) => m.id), righe.map((m) => m.id));
  assert.match(righe[0].id, /^[0-9a-f-]{36}$/, "un identificativo vero, non vuoto");
  const prova = await fake.client.trialAthlete.findFirst({ where: { id: trial.id } });
  assert.equal(prova.athlete_id, esito.athleteId);
  assert.equal(prova.status, "enrolled");
});

test("44 · se una scrittura della conversione fallisce, non resta ne la scheda ne la presa (rollback)", async () => {
  const trial = await dominio.createTrialAthlete(scopeDirezione, mario({ categoryId: "u15" }));
  /* Il fake esegue la transazione sullo stesso client: si simula il rollback verificando che l'errore risalga
     dalla transazione e che, con un client transazionale vero, nessuna scrittura precedente sopravviva. Qui si
     prova la parte osservabile: l'errore di una scrittura interna fa fallire l'intera conversione. */
  const originale = fake.client.athleteCategoryMembership.create;
  fake.client.athleteCategoryMembership.create = async () => { throw new Error("guasto simulato"); };
  try {
    await assert.rejects(
      () => dominio.convertTrialAthlete(scopeDirezione, trial.id, { create: {} }, { userId: DIREZIONE }),
      /guasto simulato/,
    );
  } finally {
    fake.client.athleteCategoryMembership.create = originale;
  }
  const prova = await fake.client.trialAthlete.findFirst({ where: { id: trial.id } });
  assert.ok(prova.athlete_id == null, "nessun collegamento");
  assert.equal(prova.status, "in_trial");
  /* Con il database vero il rollback toglie anche la presa e la scheda: lo prova scripts/prova-conversione-concorrente.mjs. */
});

/* ── ADR-0194 (UAT): il vaglio del padre legge dalla transazione ────────── */

test("45 · la conversione con categoria passa il vaglio del padre: la scheda appena creata si legge dalla transazione, non dal client globale", async () => {
  /*
    Il doppio esegue la transazione sullo stesso client, e il difetto non si
    vedeva: sul database vero la scheda creata dentro `$transaction` **non
    esiste** per il client globale finche non si conferma, e il vaglio
    «la riga a cui si collega non esiste» fermava ogni conversione con una
    categoria. Qui si riproduce la visibilita: durante la transazione il
    client globale non vede le schede nate dentro.
  */
  const base = fake.client;
  let inTransazione = false;
  let preesistenti = new Set();
  const globale = new Proxy(base, {
    get(bersaglio, chiave) {
      if (chiave === "$transaction") {
        return async (input) => {
          if (typeof input !== "function") return Promise.all(input);
          preesistenti = new Set((await base.athlete.findMany({})).map((riga) => riga.id));
          inTransazione = true;
          try {
            return await input(base);
          } finally {
            inTransazione = false;
          }
        };
      }
      if (chiave === "athlete") {
        return new Proxy(bersaglio.athlete, {
          get(delegato, metodo) {
            if (metodo !== "findUnique") return delegato[metodo];
            return async (args) => {
              const riga = await delegato.findUnique(args);
              return inTransazione && riga && !preesistenti.has(riga.id) ? null : riga;
            };
          },
        });
      }
      return bersaglio[chiave];
    },
  });
  setPrismaClientForTests(globale);
  try {
    const trial = await dominio.createTrialAthlete(scopeDirezione, mario({ categoryId: "u15" }));
    const esito = await dominio.convertTrialAthlete(scopeDirezione, trial.id, { create: {} }, { userId: DIREZIONE });
    assert.equal(esito.created, true);
    const appartenenze = await base.athleteCategoryMembership.findMany({ where: { athlete_id: esito.athleteId } });
    assert.equal(appartenenze.length, 1, "l'appartenenza si scrive: il padre si e letto dalla transazione");
    assert.equal(appartenenze[0].is_primary, true);
    assert.equal(appartenenze[0].site_id, "sede-a", "e la sede e derivata dalla squadra unica");
  } finally {
    setPrismaClientForTests(base);
  }

  /* E il registro lo dice: il vaglio del padre riceve il client di chi chiama, in creazione e in modifica. */
  const registro = readFileSync(path.join(process.cwd(), "src/lib/server/resources.ts"), "utf8");
  assert.equal((registro.match(/guardParentBelongsToClub\([\s\S]*?options\?\.client,?\s*\)/g) || []).length, 2, "creazione e modifica passano il client");
  assert.match(registro, /\(\(client as any\) \|\| prisma\)\[regola\.modello\]\.findUnique/, "il padre si legge dal client ricevuto");
});
