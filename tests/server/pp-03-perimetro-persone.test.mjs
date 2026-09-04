import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import { readFileSync } from "node:fs";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Ammettere l'evento non ammette le persone dell'evento** (PP-03).
 *
 * ADR-0111 ha allargato l'ammissione: un evento passa il perimetro se
 * **almeno una** delle sue categorie ci sta dentro. La scelta e giusta — un
 * evento che compare nel calendario e su cui poi ogni atto viene rifiutato e
 * la divergenza fra cio che si vede e cio che si puo — ma da quella scelta
 * discende un caso che nessuno guardava: l'allenamento **congiunto**.
 *
 * Su un A+B l'allenatore della sola B e legittimamente ammesso all'evento, e:
 *
 * - `listEventParticipants` gli restituiva **tutti** i partecipanti, cioe i
 *   minori della categoria A che il suo stesso elenco atleti non gli mostra;
 * - `saveEventAttendance` e `saveEventConvocations` gli lasciavano **scrivere**
 *   su quei minori. La convocazione fa partire l'invito alla loro famiglia.
 *
 * ## Perche i presidi esistenti non lo vedevano
 *
 * `tests/server/perimetro-allenatore.test.mjs` enumera le funzioni pubbliche di
 * `events.ts` e pretende che ognuna interroghi il perimetro.
 * `listEventParticipants` lo interroga — **sull'evento**. Il presidio era
 * verde, e la domanda che non faceva era «e le persone?».
 *
 * `assertAtletiDentroIlPerimetro` la faceva, ma solo per meta: si accendeva
 * unicamente se `buildAthleteAccessScopeConditions(scope)` trovava qualcosa,
 * cioe se l'operatore aveva righe in `club_access_scopes`. **Un allenatore
 * ordinario non ne ha nessuna**: il suo recinto vive nella scheda dentro
 * `clubs.trainers`. Per quella guardia il suo perimetro era assente, e
 * «assente» vale «tutto il club» (ADR-0103). La guardia c'era, e su di lui non
 * si accendeva mai.
 *
 * L'ultimo test e un'**enumerazione**, sullo schema di W6-22: non prova le
 * funzioni di oggi, pretende che quella di domani nasca chiusa.
 */

const CLUB = "aaaaaaaa-7c00-4000-8000-00000000000a";
const DIREZIONE = "11111111-7c00-4000-8000-000000000aaa";
/** Allenatore della **sola** categoria B. */
const MISTER_B = "22222222-7c00-4000-8000-000000000bbb";

const EVENTO_CONGIUNTO = "eeeeeeee-7c00-4000-8000-000000000001";

const ATLETA_A = "dddddddd-7c00-4000-8000-000000000001";
const ATLETA_B = "dddddddd-7c00-4000-8000-000000000002";

let eventi;
let setPrismaClientForTests;
let fake;

const scope = (activeRole, userId) => ({
  userId,
  activeOrganizationId: CLUB,
  activeRole,
  activeMembershipId: null,
  allowedOrganizationIds: [CLUB],
  accessScopes: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  eventi = await import("../../src/lib/server/events.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const seed = () => ({
  user: [
    { id: DIREZIONE, email: "direzione@club.it" },
    { id: MISTER_B, email: "mister-b@club.it" },
  ],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      creator_id: DIREZIONE,
      categories: [
        { id: "cat-a", name: "Under 12" },
        { id: "cat-b", name: "Under 15" },
      ],
      club_sites: [],
      category_groups: [],
      trainers: [
        {
          id: "t-b",
          name: "Mister B",
          email: "mister-b@club.it",
          linkedUserId: MISTER_B,
          categories: ["cat-b"],
        },
      ],
      staff_members: [],
      trainings: [],
      matches: [],
    },
  ],
  athlete: [
    {
      id: ATLETA_A,
      organization_id: CLUB,
      first_name: "Anna",
      last_name: "DellaA",
      category_id: "cat-a",
      category_name: "Under 12",
      data: {},
      category_memberships: [],
    },
    {
      id: ATLETA_B,
      organization_id: CLUB,
      first_name: "Bruna",
      last_name: "DellaB",
      category_id: "cat-b",
      category_name: "Under 15",
      data: {},
      category_memberships: [],
    },
  ],
  athleteCategoryMembership: [],
  clubEvent: [
    {
      id: EVENTO_CONGIUNTO,
      organization_id: CLUB,
      kind: "training",
      legacy_id: "training-congiunto",
      title: "Allenamento congiunto A+B",
      status: "scheduled",
      /* La primaria e A; B e la seconda categoria: e la riga su cui ADR-0111
         ammette il mister di B. */
      category_id: "cat-a",
      category_name: "Under 12",
      category_ids: ["cat-a", "cat-b"],
      group_ids: [],
      rsvp_required: false,
      starts_at: new Date("2026-09-05T17:30:00.000Z"),
      ends_at: new Date("2026-09-05T19:00:00.000Z"),
      version: 1,
      payload: { id: "training-congiunto" },
    },
  ],
  clubEventParticipant: [
    {
      id: "p-a",
      organization_id: CLUB,
      event_id: EVENTO_CONGIUNTO,
      athlete_id: ATLETA_A,
      attendance_status: "present",
    },
    {
      id: "p-b",
      organization_id: CLUB,
      event_id: EVENTO_CONGIUNTO,
      athlete_id: ATLETA_B,
      attendance_status: "present",
    },
  ],
  auditLog: [],
  notification: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const dinieghi = () =>
  fake.rows("auditLog").filter((riga) => riga.action === "permission.denied");

/* =============================================== 1 · la lettura ========= */

test("PP-03 · l'evento congiunto resta visibile all'allenatore della seconda categoria", async () => {
  /*
    Il controspecchio del test seguente: se l'evento smettesse di essere
    leggibile, l'elenco vuoto dei partecipanti non proverebbe niente — sarebbe
    solo un evento negato, e avremmo tolto una funzione invece di chiudere una
    perdita.
  */
  const riga = await eventi.readClubEvent(
    scope("trainer", MISTER_B),
    EVENTO_CONGIUNTO,
  );
  assert.equal(riga?.id, EVENTO_CONGIUNTO);
});

test("PP-03 · i partecipanti fuori dalla categoria dell'allenatore non escono", async () => {
  const righe = await eventi.listEventParticipants(
    scope("trainer", MISTER_B),
    EVENTO_CONGIUNTO,
  );

  const atleti = righe.map((riga) => riga.athlete_id).sort();
  assert.deepEqual(
    atleti,
    [ATLETA_B],
    "l'allenatore della sola categoria B ha ricevuto anche i minori della categoria A",
  );
});

test("PP-03 · la direzione continua a vedere tutti i partecipanti", async () => {
  /*
    Un restringimento va misurato due volte: una per verificare che faccia cio
    che deve, e una per verificare che **non faccia altro**. Se il filtro si
    accendesse anche per la segreteria, l'appello diventerebbe illeggibile a
    chi lo deve controllare.
  */
  const righe = await eventi.listEventParticipants(
    scope("owner", DIREZIONE),
    EVENTO_CONGIUNTO,
  );

  assert.deepEqual(
    righe.map((riga) => riga.athlete_id).sort(),
    [ATLETA_A, ATLETA_B].sort(),
  );
});

/* =============================================== 2 · la scrittura ======= */

test("PP-03 · l'appello su un atleta fuori perimetro e respinto", async () => {
  await assert.rejects(
    () =>
      eventi.saveEventAttendance(
        scope("trainer", MISTER_B),
        EVENTO_CONGIUNTO,
        [{ athleteId: ATLETA_A, status: "absent" }],
      ),
    /Accesso negato/,
    "l'allenatore di B ha potuto scrivere la presenza di un minore della categoria A",
  );

  assert.ok(
    dinieghi().length >= 1,
    "un diniego che non lascia traccia non e un diniego",
  );
});

test("PP-03 · la convocazione di un atleta fuori perimetro e respinta", async () => {
  /*
    La convocazione e il caso piu grave dei due: non si limita a scrivere una
    riga, **manda l'invito alla famiglia** di quel minore.
  */
  await assert.rejects(
    () =>
      eventi.saveEventConvocations(
        scope("trainer", MISTER_B),
        EVENTO_CONGIUNTO,
        [{ athleteId: ATLETA_A, status: "convocated" }],
      ),
    /Accesso negato/,
  );
});

test("PP-03 · una convocazione vuota non ripulisce chi e fuori perimetro", async () => {
  /*
    `saveEventConvocations` riporta a «indeciso» chi **non** compare
    nell'elenco. Il vaglio sulle persone guarda cio che l'elenco nomina; la
    ripulitura agisce su cio che non nomina, e non passava da nessun vaglio.
    Un elenco **vuoto** non nomina nessuno, supera il vaglio senza toccarlo, e
    `notIn: []` in SQL non esclude niente: cancellava tutto l'evento.
  */
  fake.rows("clubEventParticipant").forEach((riga) => {
    riga.convocation_status = "convocated";
  });

  await eventi.saveEventConvocations(
    scope("trainer", MISTER_B),
    EVENTO_CONGIUNTO,
    [],
  );

  const fuoriPerimetro = fake
    .rows("clubEventParticipant")
    .find((riga) => riga.athlete_id === ATLETA_A);

  assert.equal(
    fuoriPerimetro?.convocation_status,
    "convocated",
    "l'allenatore di B ha cancellato la convocazione di un minore della categoria A senza nemmeno nominarlo",
  );
});

test("PP-03 · la direzione puo ancora svuotare le convocazioni di un evento", async () => {
  fake.rows("clubEventParticipant").forEach((riga) => {
    riga.convocation_status = "convocated";
  });

  await eventi.saveEventConvocations(scope("owner", DIREZIONE), EVENTO_CONGIUNTO, []);

  assert.deepEqual(
    fake
      .rows("clubEventParticipant")
      .map((riga) => riga.convocation_status),
    [null, null],
    "chi non ha recinto deve poter ripulire l'intero evento",
  );
});

test("PP-03 · l'appello sul proprio atleta continua a passare", async () => {
  const righe = await eventi.saveEventAttendance(
    scope("trainer", MISTER_B),
    EVENTO_CONGIUNTO,
    [{ athleteId: ATLETA_B, status: "absent" }],
  );

  assert.ok(
    righe.some((riga) => riga.athlete_id === ATLETA_B),
    "il recinto ha chiuso anche cio che doveva restare aperto",
  );
});

/* =============================================== 3 · l'enumerazione ===== */

test("PP-03 · chi tocca i partecipanti interroga il perimetro delle persone", () => {
  /*
    Il perimetro dell'**evento** e gia enumerato da W6-22. Questo enumera
    l'altro: ogni funzione pubblica di `events.ts` che nomina
    `clubEventParticipant` deve consultare anche il recinto sulle persone —
    perche l'evento ammesso non ammette chi ci sta dentro.
  */
  const sorgente = readFileSync(
    new URL("../../src/lib/server/events.ts", import.meta.url),
    "utf8",
  );

  const blocchi = sorgente.split("\nexport const ").slice(1);
  const suiPartecipanti = blocchi
    .map((blocco) => {
      const nome = blocco.slice(0, blocco.indexOf(" ")).trim();
      const fine = blocco.indexOf("\n};");
      return { nome, corpo: blocco.slice(0, fine === -1 ? undefined : fine) };
    })
    /*
      `.count(` non entra: contare le righe di partecipazione per decidere se
      un evento e congelato (ADR-0112) o cancellabile (ADR-0098) non fa uscire
      ne cambiare il dato di nessuno. Cio che conta e chi **legge le righe** o
      **le scrive**.
    */
    .filter(
      ({ corpo }) =>
        /scope:\s*EventsScope/.test(corpo) &&
        /(prisma|tx)\.clubEventParticipant\.(findMany|upsert|updateMany|create|delete)/.test(
          corpo,
        ),
    );

  assert.ok(
    suiPartecipanti.length >= 3,
    `attese almeno tre funzioni pubbliche sui partecipanti, trovate ${suiPartecipanti.length}`,
  );

  const sfondate = suiPartecipanti
    .filter(
      ({ corpo }) =>
        !/assertAtletiDentroIlPerimetro\(|filtraPartecipantiPerPerimetro\(/.test(
          corpo,
        ),
    )
    .map(({ nome }) => nome);

  assert.deepEqual(
    sfondate,
    [],
    "queste funzioni servono o scrivono righe di partecipazione senza guardare il perimetro delle persone",
  );
});

test("PP-03 · il recinto della scheda si somma a quello di sede e categoria", () => {
  /*
    La regressione da temere non e che la guardia sparisca: e che qualcuno
    rimetta il `return` anticipato che la spegneva per chi non ha righe in
    `club_access_scopes` — cioe per ogni allenatore ordinario. La forma
    dell'istruzione conta quanto il suo esito.
  */
  const sorgente = readFileSync(
    new URL("../../src/lib/server/events.ts", import.meta.url),
    "utf8",
  );

  const inizio = sorgente.indexOf("const assertAtletiDentroIlPerimetro");
  assert.ok(inizio > -1, "la guardia sulle persone non esiste piu");
  const corpo = sorgente.slice(inizio, sorgente.indexOf("\n};", inizio));

  assert.ok(
    !/if \(!buildAthleteAccessScopeConditions\(scope\)\) return;/.test(corpo),
    "il ritorno anticipato spegne la guardia per ogni allenatore senza righe in club_access_scopes",
  );
  assert.match(
    corpo,
    /athleteIdsWithinTrainerPerimeter\(/,
    "la guardia non consulta il recinto della scheda dell'allenatore",
  );
});
