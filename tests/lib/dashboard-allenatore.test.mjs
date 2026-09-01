import assert from "node:assert/strict";
import test from "node:test";

import {
  attachEventParticipation,
  buildTrainerOperationalAlerts,
  getMatchConvocationStatus,
  getTrainingAttendanceStatus,
  TRAINER_OPERATIONAL_ALERT_TYPES,
} from "../../src/lib/trainer-operational-alerts.ts";
import {
  TRAINER_FORBIDDEN_CLINICAL_KEYS,
  buildTrainerSquadCertificates,
} from "../../src/lib/trainer-clinical-view.ts";
import {
  DEFAULT_TRAINER_DASHBOARD_PERMISSIONS,
  getFirstAccessibleTrainerRoute,
  resolveTrainerDashboardPermissions,
} from "../../src/lib/trainer-dashboard-permissions.ts";

/**
 * **Il dominio puro della dashboard allenatore.**
 *
 * Tre cose, e la terza e quella che conta:
 *
 * 1. gli **avvisi operativi** — presenze mancanti, convocazioni mancanti —
 *    calcolati dalla stessa regola che il server chiama e che la schermata
 *    disegna;
 * 2. il **taglio clinico**: chi vede lo stato di un certificato non vede per
 *    cio stesso il contenuto (D-4);
 * 3. **cosa un allenatore non vede**, che e la meta che un test scritto al
 *    contrario non prova mai. Una prova che verifica solo cio che funziona
 *    passerebbe identica se la matrice desse tutto a tutti: la maggioranza di
 *    questi controlli e percio un diniego.
 */

const ORA = new Date("2026-09-10T12:00:00.000Z");

const CATEGORIE = [
  { id: "u15", name: "Under 15" },
  { id: "prima", name: "Prima squadra" },
];

const ASSEGNATE = [{ id: "u15", name: "Under 15" }];

const ATLETI = [
  { id: "a1", category_id: "u15", category_name: "Under 15" },
  { id: "a2", category_id: "u15", category_name: "Under 15" },
  { id: "b1", category_id: "prima", category_name: "Prima squadra" },
];

const avvisi = ({ trainings = [], matches = [], deadlineDays = 2 } = {}) =>
  buildTrainerOperationalAlerts({
    trainings,
    matches,
    assignedAthletes: ATLETI,
    assignedCategories: ASSEGNATE,
    categories: CATEGORIE,
    matchConvocationDeadlineDays: deadlineDays,
    now: ORA,
  });

const allenamento = (extra = {}) => ({
  id: "t1",
  title: "Allenamento Under 15",
  category_id: "u15",
  category_name: "Under 15",
  startsAt: "2026-09-09T17:30:00.000Z",
  endsAt: "2026-09-09T19:00:00.000Z",
  status: "scheduled",
  ...extra,
});

const gara = (extra = {}) => ({
  id: "m1",
  title: "Gara Under 15",
  category_id: "u15",
  category_name: "Under 15",
  startsAt: "2026-09-11T15:00:00.000Z",
  status: "scheduled",
  ...extra,
});

/* ============================================ gli avvisi che si accendono */

test("un allenamento concluso senza appello accende l'avviso", () => {
  const risultato = avvisi({ trainings: [allenamento()] });

  assert.equal(risultato.length, 1);
  assert.equal(risultato[0].type, "missing_attendance");
  assert.equal(risultato[0].key, "missing-attendance:t1");
  assert.equal(risultato[0].recordId, "t1");
  assert.match(risultato[0].actionHref, /^\/trainer-dashboard\/trainings\?focus=t1$/);
});

test("una gara entro la scadenza e senza convocati accende l'avviso", () => {
  const risultato = avvisi({ matches: [gara()] });

  assert.equal(risultato.length, 1);
  assert.equal(risultato[0].type, "missing_convocations");
  assert.equal(risultato[0].key, "missing-convocations:m1");
});

test("i due tipi dichiarati sono i due tipi prodotti", () => {
  const prodotti = new Set(
    avvisi({ trainings: [allenamento()], matches: [gara()] }).map(
      (alert) => alert.type,
    ),
  );

  assert.deepEqual(
    [...prodotti].sort(),
    [...TRAINER_OPERATIONAL_ALERT_TYPES].sort(),
    "l'elenco che la rotta rilegge per spegnere gli avvisi deve coincidere con quello che il calcolo scrive: se divergono, un avviso risolto non si chiude mai",
  );
});

/* =================================== gli avvisi che NON si devono accendere */

test("un allenamento con l'appello completo non accende niente", () => {
  const risultato = avvisi({
    trainings: [
      allenamento({
        attendance: [
          { athleteId: "a1", status: "present" },
          { athleteId: "a2", status: "absent" },
        ],
      }),
    ],
  });

  assert.deepEqual(risultato, []);
});

test("un allenamento di una categoria non assegnata non e affare suo", () => {
  const risultato = avvisi({
    trainings: [
      allenamento({
        id: "t-altrui",
        category_id: "prima",
        category_name: "Prima squadra",
      }),
    ],
  });

  assert.deepEqual(
    risultato,
    [],
    "senza atleti nel proprio perimetro non c'e nessun appello da completare: l'avviso apparterrebbe a un altro allenatore",
  );
});

test("un allenamento annullato non chiede l'appello", () => {
  assert.deepEqual(
    avvisi({ trainings: [allenamento({ status: "cancelled" })] }),
    [],
  );
});

test("un allenamento non ancora concluso non chiede l'appello", () => {
  assert.deepEqual(
    avvisi({
      trainings: [
        allenamento({
          startsAt: "2026-09-12T17:30:00.000Z",
          endsAt: "2026-09-12T19:00:00.000Z",
        }),
      ],
    }),
    [],
    "chiedere le presenze di un allenamento che deve ancora cominciare e rumore, e il rumore fa smettere di guardare gli avvisi",
  );
});

test("una gara oltre la scadenza delle convocazioni non accende niente", () => {
  assert.deepEqual(
    avvisi({
      matches: [gara({ startsAt: "2026-09-30T15:00:00.000Z" })],
      deadlineDays: 2,
    }),
    [],
  );
});

test("una gara gia convocata non accende niente", () => {
  assert.deepEqual(
    avvisi({ matches: [gara({ convocatedAthleteIds: ["a1", "a2"] })] }),
    [],
  );
});

test("una promessa della famiglia non vale come appello", () => {
  /*
    `pending` e lo stato delle righe **nate da una risposta della famiglia** e
    mai passate dall'appello. Se contasse come presenza registrata, un
    allenamento in cui nessuno ha fatto l'appello risulterebbe completo e
    l'avviso non si accenderebbe mai — che e il modo silenzioso in cui una
    rendicontazione di contributi pubblici diventa falsa.
  */
  const stato = getTrainingAttendanceStatus(
    allenamento({
      attendance: [
        { athleteId: "a1", status: "pending" },
        { athleteId: "a2", status: "pending" },
      ],
    }),
    ATLETI.filter((atleta) => atleta.category_id === "u15"),
  );

  assert.equal(stato.registered, 0);
  assert.equal(stato.state, "missing");
});

/* ================= le righe di partecipazione battono la copia nel payload */

test("le righe sovrascrivono la copia delle presenze rimasta nel payload", () => {
  const proiettato = attachEventParticipation(
    allenamento({
      attendance: [
        { athleteId: "a1", status: "present" },
        { athleteId: "a2", status: "present" },
      ],
    }),
    [{ athlete_id: "a1", status: "present", notes: "puntuale" }],
  );

  assert.deepEqual(
    proiettato.attendance.map((entry) => entry.athleteId),
    ["a1"],
    "la copia JSON diceva due presenti, le righe ne conoscono uno: vince la riga",
  );
  assert.equal(
    avvisi({ trainings: [proiettato] }).length,
    1,
    "e l'avviso si accende, perche l'appello di a2 manca davvero",
  );
});

test("le grafie storiche della convocazione non sopravvivono alla proiezione", () => {
  /*
    `getConvocatedAthleteIdsFromMatch` legge l'**unione** di quattordici
    chiavi. Sovrascriverne una sola lascerebbe le altre tredici a raccontare
    una convocazione cancellata: la gara risulterebbe convocata per sempre e
    l'avviso non si accenderebbe piu.
  */
  const proiettato = attachEventParticipation(
    gara({
      convocatedAthletes: ["vecchio-1"],
      convocationEntries: [{ athleteId: "vecchio-2" }],
      selectedAthleteIds: ["vecchio-3"],
    }),
    [],
  );

  const stato = getMatchConvocationStatus({
    match: proiettato,
    totalAthletes: 2,
    deadlineDays: 2,
    now: ORA,
  });

  assert.equal(stato.convocated, 0);
  assert.equal(stato.state, "convocations_missing");
});

test("una convocazione esclusa non e una convocazione", () => {
  const proiettato = attachEventParticipation(gara(), [
    { athlete_id: "a1", status: "pending", convocation_status: "excluded" },
  ]);

  assert.deepEqual(
    proiettato.convocatedAthleteIds,
    [],
    "«non giochi» e una decisione presa, non una convocazione: contarla direbbe convocazioni fatte a una gara che non ne ha nessuna",
  );
});

/* ================================================== il taglio clinico ==== */

const ATLETA_CON_CONTENUTO = {
  id: "a1",
  category_name: "Under 15",
  first_name: "Marco",
  last_name: "Rossi",
  data: {
    medicalCertExpiry: "2026-09-20",
    allergies: "arachidi",
    medications: "adrenalina",
    bloodType: "0-",
    medicalNotes: "asma da sforzo",
  },
};

const nome = (atleta) =>
  `${atleta?.first_name || ""} ${atleta?.last_name || ""}`.trim() || "Atleta";

test("senza clinical.status_read la sezione non esiste, non e vuota", () => {
  const vista = buildTrainerSquadCertificates({
    athletes: [ATLETA_CON_CONTENUTO],
    clinical: { statusRead: false, read: false },
    now: ORA,
    getDisplayName: nome,
  });

  assert.equal(vista.allowed, false);
  assert.deepEqual(
    vista.rows,
    [],
    "una tabella vuota direbbe «nessuna scadenza», che e una risposta falsa a una domanda che non si aveva il diritto di fare",
  );
});

test("con lo stato concesso escono le date, mai il contenuto clinico", () => {
  const vista = buildTrainerSquadCertificates({
    athletes: [ATLETA_CON_CONTENUTO],
    clinical: { statusRead: true, read: false },
    now: ORA,
    getDisplayName: nome,
  });

  assert.equal(vista.allowed, true);
  assert.equal(vista.rows.length, 1);
  assert.equal(vista.rows[0].expiryDate, "2026-09-20");
  assert.equal(vista.rows[0].availability, "expiring");

  const chiavi = Object.keys(vista.rows[0]);
  for (const vietata of TRAINER_FORBIDDEN_CLINICAL_KEYS) {
    assert.equal(
      chiavi.includes(vietata),
      false,
      `«${vietata}» e contenuto clinico: la riga non deve portarlo, nemmeno vuoto`,
    );
  }
});

test("il contenuto clinico non passa neanche annidato dentro la riga", () => {
  const vista = buildTrainerSquadCertificates({
    athletes: [ATLETA_CON_CONTENUTO],
    clinical: { statusRead: true, read: false },
    now: ORA,
    getDisplayName: nome,
  });

  const serializzata = JSON.stringify(vista.rows[0]);
  for (const valore of ["arachidi", "adrenalina", "0-", "asma da sforzo"]) {
    assert.equal(
      serializzata.includes(valore),
      false,
      `il valore «${valore}» e uscito: uno spread con qualche chiave tolta lascia sempre passare il campo aggiunto dopo`,
    );
  }
});

test("un certificato valido non finisce nell'elenco delle scadenze", () => {
  const vista = buildTrainerSquadCertificates({
    athletes: [
      { id: "a9", data: { medicalCertExpiry: "2027-06-30" } },
      { id: "a8", data: {} },
    ],
    clinical: { statusRead: true, read: false },
    now: ORA,
    getDisplayName: () => "Atleta",
  });

  assert.deepEqual(
    vista.rows.map((row) => row.athleteId),
    ["a8"],
    "l'elenco risponde a «chi non puo giocare domenica»: un certificato valido dentro e rumore, uno mancante fuori e un difetto",
  );
});

/* ============================== la navigazione, e cio che si puo spegnere = */

test("le categorie restano spente anche se il club le accende", () => {
  const risolti = resolveTrainerDashboardPermissions({
    trainerDashboardPermissions: { navigation: { categories: true } },
  });

  assert.equal(
    risolti.navigation.categories,
    false,
    "la sezione Categorie non ha una schermata mantenuta: accenderla porterebbe a una rotta orfana",
  );
});

test("le tre sezioni nuove nascono accese e si possono spegnere", () => {
  assert.equal(DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.navigation.board, true);
  assert.equal(DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.navigation.documents, true);
  assert.equal(
    DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.navigation.appointments,
    true,
  );

  const spente = resolveTrainerDashboardPermissions({
    trainerDashboardPermissions: {
      navigation: { board: false, documents: false, appointments: false },
    },
  });

  assert.equal(spente.navigation.board, false);
  assert.equal(spente.navigation.documents, false);
  assert.equal(spente.navigation.appointments, false);
});

test("un allenatore senza nessuna sezione non resta dentro l'area", () => {
  const nessuna = resolveTrainerDashboardPermissions({
    trainerDashboardPermissions: {
      navigation: {
        home: false,
        trainings: false,
        matches: false,
        athletes: false,
        board: false,
        documents: false,
        appointments: false,
      },
    },
  });

  assert.equal(
    getFirstAccessibleTrainerRoute(nessuna),
    "/account",
    "senza una sezione accessibile il guscio deve portare fuori, non lasciare una pagina bianca dentro l'area",
  );
});
