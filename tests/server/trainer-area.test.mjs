import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **L'area dell'allenatore lato server: chi calcola, e fin dove arriva.**
 *
 * Due affermazioni, e sono le due che la lane 5I doveva rendere vere:
 *
 * 1. **Gli avvisi li calcola il server, non il client.** Prima la dashboard
 *    costruiva la notifica nel browser e la rotta la persisteva cosi come
 *    arrivava: titolo, testo, record e link li dettava chi li riceveva. Qui si
 *    prova che la funzione di sincronizzazione **non ha un ingresso** per gli
 *    avvisi, che scrive cio che ha calcolato lei, e che una notifica scritta
 *    da fuori con una chiave che il calcolo non produce viene **chiusa**.
 *
 * 2. **Il perimetro sugli appuntamenti e un confine, non un filtro.** La
 *    differenza si vede solo provando a scavalcarlo: si chiede la lista con il
 *    filtro «assegnati a un altro» e si deve ricevere comunque i propri, e si
 *    prova a confermare un appuntamento altrui ricevendo «Accesso negato». Un
 *    test che chiedesse soltanto «vedo i miei?» passerebbe identico su un
 *    filtro cosmetico.
 *
 * La maggioranza dei controlli e percio un diniego: una prova che verifica
 * solo cio che funziona passerebbe anche se la matrice desse tutto a tutti.
 */

const CLUB = "aaaaaaaa-5100-4000-8000-00000000000a";
const ALTRO_CLUB = "bbbbbbbb-5100-4000-8000-00000000000b";
const SEGRETERIA = "11111111-5100-4000-8000-000000000aaa";
const ALLENATORE = "22222222-5100-4000-8000-000000000bbb";
const ALTRO_ALLENATORE = "33333333-5100-4000-8000-000000000ccc";
const FAMIGLIA = "44444444-5100-4000-8000-000000000ddd";

const ORA = new Date("2026-09-10T12:00:00.000Z");

const APPUNTAMENTO_MIO = "dddddddd-5100-4000-8000-000000000001";
const APPUNTAMENTO_ALTRUI = "dddddddd-5100-4000-8000-000000000002";

const scope = (activeRole, userId = ALLENATORE, organizationId = CLUB) => ({
  userId,
  activeOrganizationId: organizationId,
  activeRole,
  allowedOrganizationIds: [CLUB, ALTRO_CLUB],
});

let area;
let appuntamenti;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  area = await import("../../src/lib/server/trainer-area.ts");
  appuntamenti = await import("../../src/lib/server/appointments.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const seed = () => ({
  user: [
    { id: SEGRETERIA, email: "segreteria@club.it" },
    { id: ALLENATORE, email: "mister@club.it" },
    { id: ALTRO_ALLENATORE, email: "vice@club.it" },
    { id: FAMIGLIA, email: "famiglia@club.it" },
  ],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      settings: { matchConvocationDeadlineDays: 3 },
      categories: [
        { id: "u15", name: "Under 15" },
        { id: "prima", name: "Prima squadra" },
      ],
      trainers: [
        {
          id: "t1",
          name: "Mister",
          email: "mister@club.it",
          linkedUserId: ALLENATORE,
          categories: ["u15"],
        },
        {
          id: "t2",
          name: "Vice",
          email: "vice@club.it",
          linkedUserId: ALTRO_ALLENATORE,
          categories: ["prima"],
        },
      ],
      staff_members: [],
      trainings: [],
      matches: [],
      opening_hours: [],
    },
    {
      id: ALTRO_CLUB,
      slug: "altro",
      name: "Altro club",
      settings: {},
      categories: [{ id: "u15", name: "Under 15" }],
      trainers: [],
      staff_members: [],
      trainings: [],
      matches: [],
      opening_hours: [],
    },
  ],
  athlete: [
    {
      id: "a1",
      organization_id: CLUB,
      status: "active",
      category_id: "u15",
      category_name: "Under 15",
      first_name: "Marco",
      last_name: "Rossi",
      data: { medicalCertExpiry: "2026-12-01" },
    },
    {
      id: "a2",
      organization_id: CLUB,
      status: "active",
      category_id: "u15",
      category_name: "Under 15",
      first_name: "Luca",
      last_name: "Bianchi",
      data: {},
    },
    {
      id: "b1",
      organization_id: CLUB,
      status: "active",
      category_id: "prima",
      category_name: "Prima squadra",
      first_name: "Paolo",
      last_name: "Verdi",
      data: {},
    },
  ],
  clubEvent: [
    {
      /* Concluso ieri, nessuna riga di presenza: l'avviso deve accendersi. */
      id: "eeeeeeee-5100-4000-8000-000000000001",
      organization_id: CLUB,
      kind: "training",
      legacy_id: "training-1",
      title: "Allenamento Under 15",
      status: "scheduled",
      category_id: "u15",
      category_name: "Under 15",
      starts_at: new Date("2026-09-09T17:30:00.000Z"),
      ends_at: new Date("2026-09-09T19:00:00.000Z"),
      version: 1,
      payload: { id: "training-1" },
    },
    {
      /* Concluso e con l'appello fatto: nessun avviso. */
      id: "eeeeeeee-5100-4000-8000-000000000002",
      organization_id: CLUB,
      kind: "training",
      legacy_id: "training-2",
      title: "Allenamento gia registrato",
      status: "scheduled",
      category_id: "u15",
      category_name: "Under 15",
      starts_at: new Date("2026-09-08T17:30:00.000Z"),
      ends_at: new Date("2026-09-08T19:00:00.000Z"),
      version: 1,
      payload: {
        id: "training-2",
        /*
          La copia JSON dice che c'erano tutti e tre, comprese righe che le
          tabelle non conoscono: se il calcolo la leggesse, un appello fatto a
          meta risulterebbe completo.
        */
        attendance: [
          { athleteId: "a1", present: true },
          { athleteId: "a2", present: true },
          { athleteId: "b1", present: true },
        ],
      },
    },
    {
      /* Prima squadra: non e il suo perimetro. */
      id: "eeeeeeee-5100-4000-8000-000000000003",
      organization_id: CLUB,
      kind: "training",
      legacy_id: "training-prima",
      title: "Allenamento Prima squadra",
      status: "scheduled",
      category_id: "prima",
      category_name: "Prima squadra",
      starts_at: new Date("2026-09-09T20:00:00.000Z"),
      ends_at: new Date("2026-09-09T21:30:00.000Z"),
      version: 1,
      payload: { id: "training-prima" },
    },
    {
      /* Fra due giorni, scadenza convocazioni a tre: l'avviso si accende. */
      id: "eeeeeeee-5100-4000-8000-000000000004",
      organization_id: CLUB,
      kind: "match",
      legacy_id: "match-1",
      title: "Gara Under 15",
      status: "scheduled",
      category_id: "u15",
      category_name: "Under 15",
      starts_at: new Date("2026-09-12T15:00:00.000Z"),
      version: 1,
      payload: {
        id: "match-1",
        /* Grafia storica rimasta nel payload: non deve valere. */
        convocatedAthletes: ["a1", "a2"],
      },
    },
    {
      /* Di un altro club: il confine non deve farlo entrare. */
      id: "eeeeeeee-5100-4000-8000-000000000005",
      organization_id: ALTRO_CLUB,
      kind: "training",
      legacy_id: "training-altrui",
      title: "Allenamento di un altro club",
      status: "scheduled",
      category_id: "u15",
      category_name: "Under 15",
      starts_at: new Date("2026-09-09T17:30:00.000Z"),
      ends_at: new Date("2026-09-09T19:00:00.000Z"),
      version: 1,
      payload: { id: "training-altrui" },
    },
  ],
  clubEventParticipant: [
    {
      id: "pppppppp-5100-4000-8000-000000000001",
      organization_id: CLUB,
      event_id: "eeeeeeee-5100-4000-8000-000000000002",
      athlete_id: "a1",
      status: "present",
      convocation_status: null,
    },
    {
      id: "pppppppp-5100-4000-8000-000000000002",
      organization_id: CLUB,
      event_id: "eeeeeeee-5100-4000-8000-000000000002",
      athlete_id: "a2",
      status: "absent",
      convocation_status: null,
    },
  ],
  appointment: [
    {
      id: APPUNTAMENTO_MIO,
      organization_id: CLUB,
      athlete_id: "a1",
      requested_by_user_id: FAMIGLIA,
      assigned_to_user_id: ALLENATORE,
      starts_at: new Date("2026-09-15T15:00:00.000Z"),
      ends_at: new Date("2026-09-15T15:30:00.000Z"),
      timezone: "Europe/Rome",
      status: "requested",
      reason: "Colloquio con la famiglia",
      version: 1,
    },
    {
      id: APPUNTAMENTO_ALTRUI,
      organization_id: CLUB,
      athlete_id: "b1",
      requested_by_user_id: FAMIGLIA,
      assigned_to_user_id: ALTRO_ALLENATORE,
      starts_at: new Date("2026-09-16T15:00:00.000Z"),
      ends_at: new Date("2026-09-16T15:30:00.000Z"),
      timezone: "Europe/Rome",
      status: "requested",
      reason: "Colloquio della prima squadra",
      version: 1,
    },
  ],
  notification: [],
  auditLog: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const negato = /Accesso negato/;

const chiavi = (alerts) => alerts.map((alert) => alert.key).sort();

/* ================================ gli avvisi li calcola il server ======== */

test("gli avvisi nascono dai dati del club, non da un corpo di richiesta", async () => {
  const alerts = await area.computeTrainerOperationalAlerts(
    scope("trainer"),
    { now: ORA },
  );

  assert.deepEqual(chiavi(alerts), [
    "missing-attendance:training-1",
    "missing-convocations:match-1",
  ]);

  const presenze = alerts.find((alert) => alert.type === "missing_attendance");
  assert.equal(presenze.title, "Presenze mancanti");
  assert.match(presenze.message, /Allenamento Under 15/);
  assert.equal(
    presenze.actionHref,
    "/trainer-dashboard/trainings?focus=training-1",
  );
});

test("la copia JSON dell'appello non vince sulle righe", async () => {
  const alerts = await area.computeTrainerOperationalAlerts(
    scope("trainer"),
    { now: ORA },
  );

  assert.equal(
    alerts.some((alert) => alert.key === "missing-attendance:training-2"),
    false,
    "le due righe coprono i due atleti del perimetro: l'appello e completo",
  );
});

test("la grafia storica dei convocati non spegne l'avviso della gara", async () => {
  const alerts = await area.computeTrainerOperationalAlerts(
    scope("trainer"),
    { now: ORA },
  );

  assert.ok(
    alerts.some((alert) => alert.key === "missing-convocations:match-1"),
    "il payload dichiara due convocati e le righe non ne conoscono nessuno: senza azzerare le grafie storiche la gara risulterebbe convocata per sempre",
  );
});

/* ============================================ il perimetro e il confine == */

test("l'allenamento di un'altra categoria non entra negli avvisi", async () => {
  const alerts = await area.computeTrainerOperationalAlerts(
    scope("trainer"),
    { now: ORA },
  );

  assert.equal(
    alerts.some((alert) => alert.recordId === "training-prima"),
    false,
    "l'avviso apparterrebbe al vice, e prendersene carico vorrebbe dire vedere il suo gruppo",
  );
});

test("l'allenamento di un altro club non entra negli avvisi", async () => {
  const alerts = await area.computeTrainerOperationalAlerts(
    scope("trainer"),
    { now: ORA },
  );

  assert.equal(
    alerts.some((alert) => alert.recordId === "training-altrui"),
    false,
  );
});

test("cambiando club non ci si porta dietro il perimetro del primo", async () => {
  /*
    L'attacco che la Wave 4 ha eseguito end-to-end e proprio questo: mandare
    `x-active-club-id` di una societa in cui si ha un ruolo, e sperare che la
    riga di un'altra passi lo stesso. Qui il ruolo viene risolto sul club
    dell'intestazione, e in quel club questa persona **non ha** una scheda
    allenatore: nessuna categoria, nessun atleta, nessun avviso — e in
    particolare nessuno di quelli del club in cui allena davvero.
  */
  const alerts = await area.computeTrainerOperationalAlerts(
    {
      userId: ALLENATORE,
      activeOrganizationId: ALTRO_CLUB,
      activeRole: "trainer",
      allowedOrganizationIds: [CLUB, ALTRO_CLUB],
    },
    { now: ORA },
  );

  assert.deepEqual(chiavi(alerts), []);
});

/* ================================================== i dinieghi =========== */

test("un ruolo di gestione non passa dall'area allenatore", async () => {
  for (const ruolo of ["owner", "club_manager", "staff", "collaborator"]) {
    await assert.rejects(
      () =>
        area.computeTrainerOperationalAlerts(scope(ruolo, SEGRETERIA), {
          now: ORA,
        }),
      negato,
      `${ruolo}: la sua dashboard ha il proprio perimetro, questa risponde a «cosa devo fare io»`,
    );
  }
});

test("un genitore e un atleta non hanno avvisi operativi", async () => {
  for (const ruolo of ["parent", "athlete"]) {
    await assert.rejects(
      () =>
        area.computeTrainerOperationalAlerts(scope(ruolo, FAMIGLIA), {
          now: ORA,
        }),
      negato,
    );
  }
});

test("senza club attivo non si calcola niente", async () => {
  await assert.rejects(
    () =>
      area.computeTrainerOperationalAlerts({
        userId: ALLENATORE,
        activeOrganizationId: null,
        activeRole: "trainer",
        allowedOrganizationIds: [CLUB],
      }),
    negato,
  );
});

test("senza utente in sessione non si calcola niente", async () => {
  await assert.rejects(
    () =>
      area.computeTrainerOperationalAlerts({
        userId: null,
        activeOrganizationId: CLUB,
        activeRole: "trainer",
        allowedOrganizationIds: [CLUB],
      }),
    negato,
  );
});

/* ================= la sincronizzazione scrive cio che ha calcolato ======= */

test("la sincronizzazione non accetta avvisi dall'esterno", async () => {
  /*
    Non e una prova di stile: la firma **e** il controllo. Finche la funzione
    prende soltanto lo scope, non esiste un modo di dirle cosa scrivere; e il
    giorno in cui qualcuno le aggiungesse un ingresso per gli avvisi, questo
    test sarebbe il primo a saperlo.
  */
  assert.equal(
    area.syncTrainerOperationalAlerts.length,
    1,
    "un solo argomento obbligatorio, lo scope: le opzioni hanno un valore di partenza e non c'e nessun ingresso in cui far passare avvisi gia confezionati",
  );

  const esito = await area.syncTrainerOperationalAlerts(scope("trainer"), {
    now: ORA,
  });

  assert.equal(esito.synced, 2);
  assert.deepEqual(chiavi(esito.alerts), [
    "missing-attendance:training-1",
    "missing-convocations:match-1",
  ]);

  const scritte = fake
    .rows("notification")
    .filter((row) => row.user_id === ALLENATORE);

  assert.deepEqual(
    scritte.map((row) => row.title).sort(),
    ["Convocazioni mancanti", "Presenze mancanti"],
    "titolo e testo escono dal calcolo del server: prima li scriveva il browser e la rotta li copiava",
  );
  for (const riga of scritte) {
    assert.equal(riga.organization_id, CLUB);
    assert.equal(riga.read, false);
  }
});

test("una notifica con una chiave che il calcolo non produce viene chiusa", async () => {
  /*
    E la forma dell'abuso che la vecchia rotta consentiva: una riga scritta con
    un titolo qualunque e una chiave inventata. Adesso il calcolo non la
    riconosce e la sincronizzazione la segna risolta — non la conferma.
  */
  fake.rows("notification").push({
    id: "nnnnnnnn-5100-4000-8000-000000000009",
    organization_id: CLUB,
    user_id: ALLENATORE,
    title: "Titolo dettato dal client",
    message: "Messaggio dettato dal client",
    type: "missing_attendance",
    read: false,
    created_at: new Date("2026-09-01T00:00:00.000Z"),
    data: { key: "missing-attendance:evento-inventato", resolved: false },
  });

  await area.syncTrainerOperationalAlerts(scope("trainer"), { now: ORA });

  const intrusa = fake
    .rows("notification")
    .find((row) => row.title === "Titolo dettato dal client");

  assert.equal(intrusa.data.resolved, true);
  assert.equal(intrusa.read, true);
});

test("una presenza registrata spegne la notifica invece di lasciarne una copia", async () => {
  await area.syncTrainerOperationalAlerts(scope("trainer"), { now: ORA });

  fake.rows("clubEventParticipant").push(
    {
      id: "pppppppp-5100-4000-8000-000000000003",
      organization_id: CLUB,
      event_id: "eeeeeeee-5100-4000-8000-000000000001",
      athlete_id: "a1",
      status: "present",
      convocation_status: null,
    },
    {
      id: "pppppppp-5100-4000-8000-000000000004",
      organization_id: CLUB,
      event_id: "eeeeeeee-5100-4000-8000-000000000001",
      athlete_id: "a2",
      status: "absent",
      convocation_status: null,
    },
  );

  const esito = await area.syncTrainerOperationalAlerts(scope("trainer"), {
    now: ORA,
  });

  assert.deepEqual(chiavi(esito.alerts), ["missing-convocations:match-1"]);

  const presenze = fake
    .rows("notification")
    .find(
      (row) => row.data?.key === "missing-attendance:training-1",
    );

  assert.equal(presenze.data.resolved, true);
  assert.equal(
    fake.rows("notification").filter((row) => row.user_id === ALLENATORE)
      .length,
    2,
    "due chiavi, due righe: la sincronizzazione aggiorna, non accumula",
  );
});

test("due sincronizzazioni di seguito non raddoppiano le notifiche", async () => {
  await area.syncTrainerOperationalAlerts(scope("trainer"), { now: ORA });
  await area.syncTrainerOperationalAlerts(scope("trainer"), { now: ORA });

  assert.equal(
    fake.rows("notification").filter((row) => row.user_id === ALLENATORE)
      .length,
    2,
  );
});

test("la sincronizzazione e negata a chi non e allenatore", async () => {
  await assert.rejects(
    () => area.syncTrainerOperationalAlerts(scope("owner", SEGRETERIA)),
    negato,
  );
  assert.deepEqual(fake.rows("notification"), []);
});

/* ============ gli appuntamenti: un confine, non un filtro del client ===== */

test("l'allenatore vede solo gli appuntamenti che gli sono assegnati", async () => {
  const righe = await appuntamenti.listAppointments(scope("trainer"));

  assert.deepEqual(righe.map((riga) => riga.id), [APPUNTAMENTO_MIO]);
});

test("chiedere gli appuntamenti di un altro non li restituisce", async () => {
  /*
    **La prova che distingue un confine da un filtro.** Se il perimetro fosse
    un filtro che si accende su un parametro, questa chiamata restituirebbe
    l'appuntamento del vice: il chiamante lo ha chiesto esplicitamente. Il
    servizio invece sovrascrive la condizione con la propria, e il parametro
    non ha nessun effetto — che e la stessa correzione fatta sugli atleti, dove
    il perimetro si accendeva su `trainer_dashboard=1` (D-5).
  */
  const righe = await appuntamenti.listAppointments(scope("trainer"), {
    assignedToUserId: ALTRO_ALLENATORE,
  });

  assert.deepEqual(
    righe.map((riga) => riga.id),
    [APPUNTAMENTO_MIO],
    "il filtro chiesto dal chiamante non allarga il perimetro",
  );
});

test("l'appuntamento di un collega non si legge", async () => {
  await assert.rejects(
    () => appuntamenti.readAppointment(scope("trainer"), APPUNTAMENTO_ALTRUI),
    negato,
  );
});

test("l'appuntamento di un collega non si conferma", async () => {
  await assert.rejects(
    () =>
      appuntamenti.confirmAppointment(
        scope("trainer"),
        APPUNTAMENTO_ALTRUI,
        { expectedVersion: 1 },
        { userId: ALLENATORE, email: "mister@club.it" },
      ),
    negato,
  );

  const riga = fake
    .rows("appointment")
    .find((row) => row.id === APPUNTAMENTO_ALTRUI);
  assert.equal(riga.status, "requested", "e non e cambiato niente");
});

test("l'appuntamento di un collega non si riprogramma ne si rifiuta", async () => {
  await assert.rejects(
    () =>
      appuntamenti.rejectAppointment(
        scope("trainer"),
        APPUNTAMENTO_ALTRUI,
        { note: "non posso", expectedVersion: 1 },
        { userId: ALLENATORE },
      ),
    negato,
  );

  await assert.rejects(
    () =>
      appuntamenti.rescheduleAppointment(
        scope("trainer"),
        APPUNTAMENTO_ALTRUI,
        {
          date: "2026-09-20",
          time: "16:00",
          expectedVersion: 1,
          outsideAvailability: true,
        },
        { userId: ALLENATORE },
      ),
    negato,
  );
});

test("il proprio appuntamento si conferma, e la famiglia lo sa", async () => {
  const riga = await appuntamenti.confirmAppointment(
    scope("trainer"),
    APPUNTAMENTO_MIO,
    { expectedVersion: 1 },
    { userId: ALLENATORE, email: "mister@club.it" },
  );

  assert.equal(riga.status, "confirmed");
  assert.equal(
    fake
      .rows("notification")
      .some(
        (notifica) =>
          notifica.user_id === FAMIGLIA &&
          notifica.type === "appointment_update",
      ),
    true,
    "una conferma che la famiglia non vede e una conferma che non e stata data",
  );
});
