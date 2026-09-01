import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * La risposta della famiglia, e l'invariante che la separa dalla presenza.
 *
 * > L'RSVP e un'intenzione dichiarata dalla famiglia. La presenza e un fatto
 * > registrato dall'allenatore. Vivono sulla stessa riga e non si scrivono mai
 * > a vicenda.
 *
 * Non e una preferenza di modellazione. `src/lib/funding/attendance-measure.ts`
 * legge `training_attendance.status` per rendicontare i contributi pubblici: se
 * un «si» scrivesse `status = "present"`, un ente riceverebbe come frequenza
 * dimostrata una promessa che nessuno ha verificato. L'ultimo test di questo
 * file misura esattamente quello, con la funzione vera.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "aaaaaaaa-0000-4000-8000-000000000002";
const ATLETA = "bbbbbbbb-0000-4000-8000-00000000000a";
const ATLETA_ALTRO_CLUB = "bbbbbbbb-0000-4000-8000-00000000000b";
const GENITORE = "cccccccc-0000-4000-8000-00000000000a";
const ESTRANEO = "cccccccc-0000-4000-8000-00000000000b";

const ADESSO = new Date("2026-09-01T10:00:00Z");

const T_APERTO = "training-aperto";
const T_SCADUTO = "training-scaduto";
const T_ANNULLATO = "training-annullato";
const T_SENZA_RSVP = "training-senza-rsvp";
const GARA = "gara-aperta";

let service;
let misura;
let setPrismaClientForTests;
let fake;

/**
 * Le righe di `club_events` corrispondenti agli allenamenti del fixture
 * (ADR-0098): l'RSVP si appoggia adesso alla riga, e l'identificativo storico
 * resta in `legacy_id` finche la proiezione esiste.
 */
const eventi = (organizationId) =>
  trainings().map((training) => ({
    id: `evento-${organizationId.slice(0, 4)}-${training.id}`,
    organization_id: organizationId,
    kind: "training",
    legacy_id: training.id,
    status: ["cancelled", "annullato"].includes(String(training.status))
      ? "cancelled"
      : "scheduled",
    starts_at: new Date(`${training.date}T${training.time}:00.000Z`),
    /*
      **La riga e la verita, non il payload.** `toEventLegacyShape` ricostruisce
      la forma storica **dalle colonne**: la richiesta di conferma e la scadenza
      devono stare qui, altrimenti l'evento non chiede niente a nessuno — che e
      esattamente cio che succedeva prima della Wave 5, e per la stessa ragione.
    */
    rsvp_required: Boolean(training.rsvpRequired),
    rsvp_deadline: training.rsvpDeadline ? new Date(training.rsvpDeadline) : null,
    category_name: training.category ?? null,
    title: training.title ?? null,
    payload: training,
  }));

/**
 * **Una gara che chiede conferma.**
 *
 * Esiste solo fra le righe di `club_events`, e non nella proiezione
 * `clubs.trainings` — che di gare non ne contiene per definizione. Era questa
 * la ragione per cui l'invito non arrivava mai a nessuno: l'elenco che la
 * famiglia legge iterava la proiezione degli allenamenti, quindi il servizio
 * rispondeva a una gara e nessuna schermata gliela chiedeva.
 *
 * Non ha titolo di proposito: e la forma con cui una gara viene creata quasi
 * sempre, ed e quella su cui il ripiego «Allenamento» era piu visibile.
 */
const gara = (organizationId) => ({
  id: `evento-${organizationId.slice(0, 4)}-${GARA}`,
  organization_id: organizationId,
  kind: "match",
  legacy_id: GARA,
  status: "scheduled",
  starts_at: new Date("2026-09-08T15:00:00.000Z"),
  rsvp_required: true,
  rsvp_deadline: new Date("2026-09-07T18:00:00.000Z"),
  category_name: "Pulcini",
  title: null,
  opponent: "ASD Rivale",
  location: "Campo comunale",
  payload: {},
});

const trainings = () => [
  {
    id: T_APERTO,
    title: "Allenamento Pulcini",
    date: "2026-09-05",
    time: "17:30",
    endTime: "19:00",
    status: "upcoming",
    category: "Pulcini",
    rsvpRequired: true,
    rsvpDeadline: "2026-09-04T18:00:00Z",
  },
  {
    id: T_SCADUTO,
    title: "Allenamento con conferme chiuse",
    date: "2026-09-03",
    time: "17:30",
    endTime: "19:00",
    status: "upcoming",
    category: "Pulcini",
    rsvpRequired: true,
    rsvpDeadline: "2026-08-31T18:00:00Z",
  },
  {
    id: T_ANNULLATO,
    title: "Allenamento annullato",
    date: "2026-09-06",
    time: "17:30",
    endTime: "19:00",
    status: "cancelled",
    category: "Pulcini",
    rsvpRequired: true,
  },
  {
    id: T_SENZA_RSVP,
    title: "Allenamento senza conferma",
    date: "2026-09-07",
    time: "17:30",
    endTime: "19:00",
    status: "upcoming",
    category: "Pulcini",
  },
];

const seed = () => ({
  /*
    **`email_verified_at` non e decorazione.**

    Il legame fra un account e un tutore vale anche per corrispondenza con
    l'indirizzo di contatto scritto sull'anagrafica, e dalla decima tornata
    quella corrispondenza conta **solo se l'indirizzo e verificato**: chiunque
    puo cambiare il proprio con `PATCH /api/v1/auth/user`, e senza questa
    condizione bastava scrivere l'indirizzo del tutore di un'altra famiglia
    per leggerne certificati medici e pagamenti.

    Un utente con una sessione ha sempre l'indirizzo verificato — il login non
    ne rilascia a chi non lo ha — quindi seminarlo qui non allenta il test:
    lo rende conforme a cio che puo esistere davvero.
  */
  user: [
    {
      id: GENITORE,
      email: "genitore@example.it",
      email_verified_at: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: ESTRANEO,
      email: "estraneo@example.it",
      email_verified_at: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  /*
    L'appartenenza dice **a quale club** il genitore ha accesso; a dire **per
    quale atleta** puo rispondere e il tutore dichiarato sull'anagrafica. Sono
    due cose diverse, ed e la seconda il gate: `ESTRANEO` qui sotto non e
    tutore di nessuno e viene respinto anche se il club fosse lo stesso.
  */
  organizationUser: [
    {
      id: "membership-genitore",
      organization_id: CLUB,
      user_id: GENITORE,
      role: "parent",
      is_primary: true,
    },
    {
      id: "membership-estraneo",
      organization_id: CLUB,
      user_id: ESTRANEO,
      role: "parent",
      is_primary: true,
    },
  ],
  club: [
    {
      id: CLUB,
      name: "ASD Prova",
      creator_id: "dddddddd-0000-4000-8000-00000000000a",
      trainings: trainings(),
      categories: [{ id: "cat-pulcini", name: "Pulcini" }],
      club_sites: [],
      category_groups: [],
      trainers: [],
    },
    {
      id: ALTRO_CLUB,
      name: "ASD Altra",
      creator_id: "dddddddd-0000-4000-8000-00000000000b",
      trainings: trainings(),
      categories: [],
      club_sites: [],
      category_groups: [],
      trainers: [],
    },
  ],
  athlete: [
    {
      id: ATLETA,
      organization_id: CLUB,
      user_id: null,
      first_name: "Mario",
      last_name: "Rossi",
      category_id: "cat-pulcini",
      category_name: "Pulcini",
      data: { guardians: [{ name: "Anna", email: "genitore@example.it" }] },
    },
    {
      id: ATLETA_ALTRO_CLUB,
      organization_id: ALTRO_CLUB,
      user_id: null,
      first_name: "Luca",
      last_name: "Bianchi",
      data: { guardians: [{ name: "Paolo", email: "altro@example.it" }] },
    },
  ],
  athleteCategoryMembership: [],
  clubEvent: [
    ...eventi(CLUB),
    gara(CLUB),
    ...eventi(ALTRO_CLUB),
    gara(ALTRO_CLUB),
  ],
  clubEventParticipant: [],
  auditLog: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  service = await import("../../src/lib/server/rsvp.ts");
  misura = await import("../../src/lib/funding/attendance-measure.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const rispondi = (overrides = {}) =>
  service.answerRsvp({
    trainingId: T_APERTO,
    athleteId: ATLETA,
    status: "yes",
    userId: GENITORE,
    actorEmail: "genitore@example.it",
    now: ADESSO,
    ...overrides,
  });

const righe = () => fake.rows("clubEventParticipant");

test("un si crea una riga con la sola intenzione", async () => {
  const esito = await rispondi({ note: "arriva alle 17:45" });

  assert.equal(esito.status, "yes");
  assert.equal(esito.organizationId, CLUB);

  assert.equal(righe().length, 1);
  const riga = righe()[0];
  assert.equal(riga.rsvp_status, "yes");
  assert.equal(riga.rsvp_note, "arriva alle 17:45");
  assert.equal(riga.rsvp_by_user_id, GENITORE);
  assert.equal(riga.status, service.RSVP_NEUTRAL_ATTENDANCE_STATUS);
});

test("un no e una risposta come le altre", async () => {
  await rispondi({ status: "no", note: "e influenzato" });

  assert.equal(righe().length, 1);
  assert.equal(righe()[0].rsvp_status, "no");
});

test("cambiare risposta aggiorna la riga, non ne aggiunge una", async () => {
  await rispondi({ status: "yes" });
  await rispondi({ status: "no", note: "cambio programma" });

  assert.equal(righe().length, 1);
  assert.equal(righe()[0].rsvp_status, "no");
  assert.equal(righe()[0].rsvp_note, "cambio programma");
});

/**
 * Due invii dello stesso clic — due schede, o una richiesta ritentata dalla
 * rete — devono lasciare **una** riga. La difesa e la chiave unica, non un
 * controllo in memoria: con un `create` senza `where` unico si otterrebbero
 * due risposte contraddittorie e a scegliere sarebbe l'ordinamento di una
 * query.
 */
test("la risposta duplicata resta una riga sola", async () => {
  await Promise.all([rispondi(), rispondi()]);

  assert.equal(righe().length, 1);
  assert.equal(righe()[0].rsvp_status, "yes");

  const upsert = fake.lastCall("clubEventParticipant", "upsert");
  assert.ok(upsert, "la scrittura deve passare da un upsert sulla chiave unica");
  assert.deepEqual(
    Object.keys(upsert.args.where),
    ["organization_id_event_id_athlete_id"],
  );
});

test("su un evento annullato non si risponde", async () => {
  await assert.rejects(
    () => rispondi({ trainingId: T_ANNULLATO }),
    /annullato/i,
  );
  assert.equal(righe().length, 0);
});

test("dopo la scadenza non si risponde piu", async () => {
  await assert.rejects(
    () => rispondi({ trainingId: T_SCADUTO }),
    /scaduto/i,
  );
  assert.equal(righe().length, 0);
});

test("un allenamento che non chiede conferma non si conferma", async () => {
  await assert.rejects(
    () => rispondi({ trainingId: T_SENZA_RSVP }),
    /non chiede una conferma/i,
  );
});

test("il forse non viene archiviato", async () => {
  await assert.rejects(() => rispondi({ status: "maybe" }), /non valida/i);
  assert.equal(righe().length, 0);
});

/* ------------------------------------------------------------- isolamento */

test("chi non e legato all'atleta non risponde per lui", async () => {
  await assert.rejects(
    () => rispondi({ userId: ESTRANEO, actorEmail: "estraneo@example.it" }),
    /Accesso negato/,
  );
  assert.equal(righe().length, 0);
});

test("non si risponde per un atleta di un altro club", async () => {
  await assert.rejects(
    () => rispondi({ athleteId: ATLETA_ALTRO_CLUB }),
    /Accesso negato/,
  );
  assert.equal(righe().length, 0);
});

/**
 * Il club dichiarato dal client non sceglie le righe: viene **confrontato**
 * con il club dell'atleta. Senza questo controllo un `organization_id`
 * arbitrario nel corpo della richiesta sarebbe un filtro scritto da chi
 * chiama (CLAUDE.md §8).
 */
test("un club dichiarato che non e quello dell'atleta viene rifiutato", async () => {
  await assert.rejects(
    () => rispondi({ organizationId: ALTRO_CLUB }),
    /Accesso negato/,
  );
  assert.equal(righe().length, 0);
});

/* ------------------------------------------------- l'invariante, misurata */

/**
 * **Il test che giustifica l'intera lane.**
 *
 * L'allenatore ha registrato una presenza. La famiglia risponde «no» dopo
 * l'appello — succede, per esempio quando la riga viene creata prima e la
 * risposta arriva su un evento ripetuto. La presenza registrata **non deve
 * cambiare**, e la misura dei bandi deve continuare a contarla.
 */
test("rispondere non tocca la presenza gia registrata", async () => {
  fake.rows("clubEventParticipant").push({
    id: "riga-appello",
    organization_id: CLUB,
    event_id: `evento-${CLUB.slice(0, 4)}-${T_APERTO}`,
    legacy_training_id: T_APERTO,
    athlete_id: ATLETA,
    status: "present",
    notes: "appello dell'allenatore",
    rsvp_status: null,
  });

  await rispondi({ status: "no" });

  assert.equal(righe().length, 1);
  assert.equal(righe()[0].status, "present");
  assert.equal(righe()[0].notes, "appello dell'allenatore");
  assert.equal(righe()[0].rsvp_status, "no");
});

/**
 * E il contrario: un «si» senza appello non deve produrre **nessuna** ora
 * rendicontabile. Qui si usa la funzione vera dei bandi, non una sua
 * riscrittura: se domani cambiasse cosa conta come presenza, questo test se ne
 * accorge.
 */
test("un si non entra nella misura presenze dei bandi", async () => {
  const periodo = [
    {
      index: 0,
      label: "Settembre",
      start: "2026-09-01T00:00:00.000Z",
      end: "2026-09-30T00:00:00.000Z",
    },
  ];

  await rispondi({ status: "yes" });

  assert.equal(misura.isPresentAttendance(righe()[0]), false);

  const senzaAppello = misura.measureAttendanceByPeriod({
    periods: periodo,
    trainings: trainings(),
    attendance: righe(),
    requirementUnit: "hours",
  });
  assert.equal(senzaAppello[0].sessions, 0);
  assert.equal(senzaAppello[0].hours, 0);

  // L'appello arriva dopo e scrive la presenza: ora, e solo ora, si conta.
  righe()[0].status = "present";
  const conAppello = misura.measureAttendanceByPeriod({
    periods: periodo,
    trainings: trainings(),
    attendance: righe(),
    requirementUnit: "hours",
  });
  assert.equal(conAppello[0].sessions, 1);
  assert.equal(conAppello[0].hours, 1.5);
});

test("la risposta finisce nel registro di audit", async () => {
  await rispondi();

  const audit = fake.rows("auditLog");
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, "rsvp.answered");
  assert.equal(audit[0].actor_role, "parent");
  assert.equal(audit[0].organization_id, CLUB);
});

/* ------------------------------------------------------- inviti pendenti */

test("gli inviti pendenti sono solo quelli a cui si puo ancora rispondere", async () => {
  const pendenti = await service.listPendingRsvpForAthlete({
    organizationId: CLUB,
    athleteId: ATLETA,
    now: ADESSO,
  });

  /*
    Restano fuori: quello scaduto, quello annullato e quello che non chiede
    conferma. Un promemoria su una porta gia chiusa e solo un messaggio in piu
    che nessuno puo seguire.

    La gara invece **c'e**, ed e in ordine di data dopo l'allenamento: un
    sollecito automatico che dimenticasse le gare lascerebbe senza risposta
    proprio le convocazioni.
  */
  assert.deepEqual(
    pendenti.map((invito) => invito.trainingId),
    [T_APERTO, GARA],
  );
  assert.equal(pendenti[0].state, "no_response");
  assert.equal(pendenti[0].canAnswer, true);
});

test("un invito gia risposto esce dai pendenti ma resta fra gli inviti", async () => {
  await rispondi({ status: "yes" });

  const pendenti = await service.listPendingRsvpForAthlete({
    organizationId: CLUB,
    athleteId: ATLETA,
    now: ADESSO,
  });
  /*
    L'allenamento a cui si e appena risposto esce dai pendenti; la gara, a cui
    nessuno ha risposto, resta. Un sollecito si manda su cio che manca.
  */
  assert.deepEqual(
    pendenti.map((invito) => invito.trainingId),
    [GARA],
  );

  /*
    L'area genitore vede anche gli inviti chiusi: la famiglia deve poter
    leggere cosa ha risposto, e perche non puo piu cambiare. Sono i pendenti a
    essere un sottoinsieme, non il contrario.
  */
  const inviti = await service.readAthleteRsvpInvitations({
    athleteId: ATLETA,
    userId: GENITORE,
    now: ADESSO,
  });

  const risposto = inviti.find((invito) => invito.trainingId === T_APERTO);
  assert.equal(risposto.state, "yes");
  assert.equal(risposto.canAnswer, true);

  const chiuso = inviti.find((invito) => invito.trainingId === T_SCADUTO);
  assert.equal(chiuso.state, "no_response");
  assert.equal(chiuso.canAnswer, false);
  assert.match(chiuso.blockedMessage, /scaduto/i);
});

/* ------------------------------------------------- gli inviti sono di due tipi */

/**
 * **La gara fra gli inviti: la meta della capability che non arrivava.**
 *
 * La Wave 5 aveva dichiarato completo l'RSVP su partite e convocazioni, e il
 * servizio lo reggeva davvero — `findTraining` trova entrambi i tipi. Ma
 * l'elenco che la famiglia legge iterava `clubs.trainings`, la proiezione dei
 * soli allenamenti: il backend rispondeva a una gara e **nessuna schermata
 * gliela chiedeva mai**. E la forma di difetto descritta in CLAUDE.md §11.8 —
 * non codice mancante, codice irraggiungibile.
 */
test("gli inviti della famiglia comprendono le gare", async () => {
  const inviti = await service.readAthleteRsvpInvitations({
    athleteId: ATLETA,
    userId: GENITORE,
    now: ADESSO,
  });

  const invito = inviti.find((riga) => riga.trainingId === GARA);
  assert.ok(invito, "una gara che chiede conferma deve comparire fra gli inviti");
  assert.equal(invito.kind, "match");
  assert.equal(invito.opponent, "ASD Rivale");
  assert.equal(invito.canAnswer, true);
  assert.equal(invito.state, "no_response");
});

/**
 * Un invito deve dire **che cosa** si sta confermando. Il ripiego era
 * «Allenamento» per tutti: una gara senza titolo — cioe quasi ogni gara —
 * arrivava alla famiglia con il nome dell'altra cosa, e le due non costano lo
 * stesso pomeriggio.
 */
test("una gara senza titolo non si chiama «Allenamento»", async () => {
  const inviti = await service.readAthleteRsvpInvitations({
    athleteId: ATLETA,
    userId: GENITORE,
    now: ADESSO,
  });

  const gara_ = inviti.find((riga) => riga.trainingId === GARA);
  assert.equal(gara_.title, "Gara con ASD Rivale");

  const allenamento = inviti.find((riga) => riga.trainingId === T_APERTO);
  assert.equal(allenamento.kind, "training");
  assert.equal(allenamento.opponent, "");
});

/**
 * Si risponde a una gara **con lo stesso gesto** di un allenamento, e la
 * risposta si appoggia alla riga della gara: la strada che il difetto rendeva
 * impercorribile dall'interfaccia era gia percorribile qui.
 */
test("si risponde a una gara come a un allenamento", async () => {
  const esito = await rispondi({ trainingId: GARA, status: "yes" });

  assert.equal(esito.trainingId, GARA);
  assert.equal(righe().length, 1);
  assert.equal(righe()[0].event_id, gara(CLUB).id);
  assert.equal(righe()[0].rsvp_status, "yes");
});

/**
 * **La proiezione non e piu la fonte.**
 *
 * Il presidio che se ne accorge se qualcuno rimettesse `clubs.trainings` fra
 * le colonne lette: svuotata la proiezione, gli inviti restano — perche a
 * produrli sono le righe di `club_events` (ADR-0098).
 */
test("gli inviti non dipendono piu dalla proiezione degli allenamenti", async () => {
  const club = fake.rows("club").find((riga) => riga.id === CLUB);
  club.trainings = [];

  const inviti = await service.readAthleteRsvpInvitations({
    athleteId: ATLETA,
    userId: GENITORE,
    now: ADESSO,
  });

  assert.deepEqual(
    inviti.map((invito) => invito.trainingId).sort(),
    [GARA, T_APERTO, T_SCADUTO].sort(),
  );
});

/**
 * ===========================================================================
 * Decima tornata — l'indirizzo di contatto non e una prova, se non e verificato
 * ===========================================================================
 *
 * Il legame fra un account e un tutore vale per `linked_user_id`, e in sua
 * assenza per corrispondenza con l'indirizzo di contatto scritto
 * sull'anagrafica dalla segreteria.
 *
 * `PATCH /api/v1/auth/user` lascia cambiare il proprio indirizzo con qualunque
 * altro non ancora registrato. Chiunque avesse **una qualsiasi** tessera nel
 * club — genitore del proprio figlio, atleta, allenatore — poteva scrivere
 * l'indirizzo del tutore di un'altra famiglia e agire al posto suo: qui
 * rispondere per un atleta che non e suo, e nell'area genitore leggerne
 * pagamenti, fatture e **certificati medici**.
 *
 * Il cambio azzera pero `email_verified_at`, e il login non rilascia sessioni a
 * un indirizzo non verificato. Il legame per indirizzo vale quindi solo se
 * l'indirizzo e verificato — condizione che il tutore vero soddisfa sempre, e
 * che chi ha appena cambiato indirizzo non soddisfa mai.
 */
test("un indirizzo appena cambiato non collega a un atleta di un'altra famiglia", async () => {
  const utente = fake.rows("user").find((riga) => riga.id === ESTRANEO);
  assert.ok(utente, "l'estraneo deve esistere nel seed");

  // L'attacco: si prende l'indirizzo del tutore dichiarato sull'anagrafica.
  utente.email = "genitore@example.it";
  utente.email_verified_at = null;

  await assert.rejects(
    () =>
      rispondi({
        userId: ESTRANEO,
        actorEmail: "genitore@example.it",
      }),
    /Accesso negato/,
    "un indirizzo non verificato non deve collegare a nessun atleta",
  );

  assert.equal(
    righe().length,
    0,
    "e non deve nemmeno lasciare una riga di risposta",
  );
});

/**
 * Il verso opposto: verificato, il legame per indirizzo continua a valere.
 * Una correzione che chiudesse anche il tutore vero non sarebbe una correzione.
 */
test("verificato, l'indirizzo collega come prima", async () => {
  const utente = fake.rows("user").find((riga) => riga.id === ESTRANEO);
  utente.email = "genitore@example.it";
  utente.email_verified_at = new Date("2026-01-01T00:00:00.000Z");

  const esito = await rispondi({
    userId: ESTRANEO,
    actorEmail: "genitore@example.it",
  });

  assert.equal(esito.status, "yes");
  assert.equal(righe().length, 1);
});
