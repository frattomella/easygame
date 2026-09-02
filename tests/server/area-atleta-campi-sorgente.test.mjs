import assert from "node:assert/strict";
import test, { before } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Il presidio dei nomi: la whitelist contro la sorgente vera.**
 *
 * ---
 *
 * ## Il difetto che chiude
 *
 * La proiezione dell'area atleta e un **elenco chiuso di campi**, ed e giusto
 * che lo sia. Ma un elenco di stringhe che nessuno confronta con la sorgente e
 * un difetto che si ripete: chiedeva `startsAt`, `endsAt` e `decisionNote`
 * mentre `toFamilyAppointment` produce `starts_at`, `ends_at` e
 * `decision_note`; chiedeva `name`, `type`, `status`, `uploadedAt` mentre il
 * fascicolo di famiglia produce `title`, `documentKindLabel`, `stateLabel` e
 * `submittedAt`. `soloCampi` copia `sorgente[campo]`: un nome che non esiste
 * non solleva niente, copia `undefined`, e l'atleta leggeva «Data da definire»
 * su ogni appuntamento e «— · —» su ogni documento.
 *
 * ## I due modi in cui questo file lo impedisce
 *
 * 1. **Il controllo strutturale** — per ogni elenco si prende l'oggetto che la
 *    sorgente vera produce e si pretende che **ogni nome chiesto sia una sua
 *    chiave**. Non e una copia dei nomi in un secondo posto: i nomi arrivano da
 *    `CAMPI_AREA_ATLETA`, gli oggetti dai moduli di dominio. Sbagliare un nome
 *    da una parte fa fallire il test dall'altra.
 * 2. **Il controllo a valle** — si legge l'area come la legge una persona, e si
 *    pretende che **nessun campo proiettato valga `undefined`**. E la rete che
 *    prende anche gli elenchi la cui sorgente non e un modulo puro
 *    importabile — le categorie, le presenze, le notifiche.
 */

const CLUB = "aaaaaaaa-6c00-4000-8000-00000000000a";
const UTENTE_ATLETA = "55555555-6c00-4000-8000-000000000eee";
const ATLETA = "aaaa1111-6c00-4000-8000-00000000aaaa";
const EVENTO_RIGA = "eeee1111-6c00-4000-8000-00000000eeee";
const ALLEGATO = "ffff1111-6c00-4000-8000-00000000ffff";

let dominio;
let toFamilyAppointment;
let buildFamilyDocumentAreas;
let toEventLegacyShape;
let setPrismaClientForTests;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  dominio = await import("../../src/lib/server/athlete-accounts.ts");
  ({ toFamilyAppointment } = await import(
    "../../src/lib/appointments/projection.ts"
  ));
  ({ buildFamilyDocumentAreas } = await import(
    "../../src/lib/documents/family-dossier.ts"
  ));
  ({ toEventLegacyShape } = await import("../../src/lib/events/model.ts"));
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

/* ==================================================================== *
 *  1. La whitelist contro l'oggetto che la sorgente produce
 * ==================================================================== */

/**
 * Ogni nome di sorgente dell'elenco deve essere una chiave dell'oggetto.
 *
 * `aggiunti` sono i campi che non nascono dalla sorgente pura ma da chi la
 * compone — per gli eventi, i due che `getParentDashboardData` attacca alla
 * riga. Sono dichiarati qui, e il controllo a valle li verifica per davvero.
 */
const pretendiCheEsistano = (elenco, sorgente, aggiunti = []) => {
  const mancanti = elenco
    .map((campo) => dominio.nomeSorgente(campo))
    .filter(
      (chiave) =>
        !Object.prototype.hasOwnProperty.call(sorgente, chiave) &&
        !aggiunti.includes(chiave),
    );

  assert.deepEqual(
    mancanti,
    [],
    `l'area atleta chiede campi che la sorgente non produce: ${mancanti.join(", ")}`,
  );
};

const RIGA_APPUNTAMENTO = {
  id: "app-1",
  organization_id: CLUB,
  athlete_id: ATLETA,
  starts_at: new Date("2026-09-10T15:00:00.000Z"),
  ends_at: new Date("2026-09-10T15:30:00.000Z"),
  status: "cancelled_by_family",
  reason: "Colloquio con la segreteria",
  notes: "Portare il modulo",
  internal_notes: "NOTA-INTERNA",
  decision_note: "La famiglia ha disdetto",
  version: 1,
};

const VOCE_FASCICOLO = {
  id: "voce-1",
  requestId: "richiesta-1",
  documentKind: "identity_document",
  title: "Documento d'identita",
  description: "Fronte e retro",
  required: true,
  dueDate: "2026-09-30",
  state: {
    status: "fulfilled",
    dossier: "approved",
    submissionId: "deposito-1",
    attachmentId: ALLEGATO,
    submittedAt: "2026-09-01T10:00:00.000Z",
    decidedAt: "2026-09-02T10:00:00.000Z",
    decisionNote: null,
    historyCount: 1,
    overdue: false,
  },
};

const RIGA_EVENTO = {
  id: EVENTO_RIGA,
  legacy_id: "training-1",
  organization_id: CLUB,
  kind: "training",
  title: "Allenamento",
  starts_at: new Date("2026-09-12T17:00:00.000Z"),
  ends_at: new Date("2026-09-12T18:30:00.000Z"),
  status: "scheduled",
  category_name: "Under 15",
  location: "Palestra comunale",
  opponent: "",
  payload: {},
};

test("appuntamenti: ogni campo chiesto esiste in `toFamilyAppointment`", () => {
  const sorgente = toFamilyAppointment(RIGA_APPUNTAMENTO, {});

  pretendiCheEsistano(dominio.CAMPI_AREA_ATLETA.appuntamento, sorgente);

  /*
    **La prova che il presidio morde.** I tre nomi che l'area atleta chiedeva
    prima non sono chiavi di quell'oggetto: se qualcuno li rimettesse, il
    controllo qui sopra fallirebbe invece di far stampare un trattino.
  */
  for (const sbagliato of ["startsAt", "endsAt", "decisionNote"]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(sorgente, sbagliato),
      false,
      `${sbagliato} non e un campo della sorgente: chiederlo copierebbe undefined`,
    );
  }
});

test("documenti: ogni campo chiesto esiste nella voce del fascicolo", () => {
  const aree = buildFamilyDocumentAreas(
    [VOCE_FASCICOLO],
    new Map([
      [
        ALLEGATO,
        {
          fileName: "carta-identita.pdf",
          mimeType: "application/pdf",
          url: `/api/v1/attachments/${ALLEGATO}`,
          validUntil: "2030-01-01",
        },
      ],
    ]),
    { now: new Date("2026-09-05T00:00:00.000Z") },
  );

  const sorgente = aree.archive[0];
  assert.ok(sorgente, "la voce consegnata sta in archivio");

  pretendiCheEsistano(dominio.CAMPI_AREA_ATLETA.documento, sorgente);

  for (const sbagliato of ["name", "type", "status", "uploadedAt", "url"]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(sorgente, sbagliato),
      false,
      `${sbagliato} non e un campo della sorgente`,
    );
  }
});

test("eventi: ogni campo chiesto esiste nella proiezione degli eventi", () => {
  const sorgente = toEventLegacyShape(RIGA_EVENTO);

  /*
    L'unico campo che non nasce qui e quello che `getParentDashboardData`
    attacca alla riga, ed e **uno per genere**: la presenza sull'allenamento,
    la partecipazione sulla gara. Chiederli entrambi a entrambi — com'era —
    faceva uscire una chiave sempre `undefined`, indistinguibile da un nome
    sbagliato. Il controllo a valle li vede arrivare per davvero.
  */
  pretendiCheEsistano(dominio.CAMPI_AREA_ATLETA.allenamento, sorgente, [
    "attendanceStatus",
  ]);
  pretendiCheEsistano(dominio.CAMPI_AREA_ATLETA.gara, sorgente, [
    "participationStatus",
  ]);

  assert.equal(
    dominio.CAMPI_AREA_ATLETA.allenamento.includes("participationStatus"),
    false,
    "un allenamento non ha una partecipazione a una gara",
  );
  assert.equal(
    dominio.CAMPI_AREA_ATLETA.gara.includes("attendanceStatus"),
    false,
    "la presenza si registra all'appello dell'allenamento",
  );
});

test("l'indirizzo del file non e in elenco: era un link che rispondeva 403", () => {
  const chiesti = dominio.CAMPI_AREA_ATLETA.documento.map((campo) =>
    dominio.nomeSorgente(campo),
  );

  /*
    `fileUrl` vale `/api/v1/attachments/<id>`, e quella rotta al ruolo
    `athlete` risponde 403. La rotta per legame dell'area famiglia
    risponderebbe, ma aprirebbe i **byte** dei documenti — fra i quali il
    certificato medico, cioe il contenuto clinico che questa proiezione tiene
    fuori per scelta. Non esce nessuno dei due.
  */
  assert.equal(chiesti.includes("fileUrl"), false);
  assert.equal(chiesti.includes("url"), false);
});

/* ==================================================================== *
 *  2. L'area letta davvero: nessun campo vale `undefined`
 * ==================================================================== */

/**
 * La riga del club, con la colonna `trainings` **proiettata dalla riga
 * dell'evento**: e cosi che `projectEventsToClubColumn` la scrive, e un seme
 * scritto a mano proverebbe una forma che in produzione non esiste.
 */
const clubRow = () => ({
  id: CLUB,
  slug: "club",
  name: "Polisportiva Test",
  categories: [{ id: "cat-1", name: "Under 15" }],
  trainings: [toEventLegacyShape(RIGA_EVENTO)],
  matches: [],
  settings: {},
  opening_hours: null,
});

const semeArea = () => {
  const CLUB_ROW = clubRow();

  return {
  user: [
    {
      id: UTENTE_ATLETA,
      email: "luca@famiglia.it",
      first_name: "Luca",
      last_name: "Rossi",
      email_verified_at: new Date(),
    },
  ],
  club: [CLUB_ROW],
  organizationUser: [
    {
      id: "m-atleta",
      organization_id: CLUB,
      user_id: UTENTE_ATLETA,
      role: "athlete",
    },
  ],
  athlete: [
    {
      id: ATLETA,
      organization_id: CLUB,
      user_id: UTENTE_ATLETA,
      first_name: "Luca",
      last_name: "Rossi",
      status: "active",
      category_id: "cat-1",
      category_name: "Under 15",
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      data: { phone: "3330000000" },
      organization: CLUB_ROW,
      category_memberships: [
        {
          category_id: "cat-1",
          category_name: "Under 15",
          site_id: "sede-1",
          is_primary: true,
        },
      ],
    },
  ],
  athletePayment: [],
  receipt: [],
  invoice: [],
  medicalCertificate: [],
  clubEvent: [
    {
      id: EVENTO_RIGA,
      organization_id: CLUB,
      legacy_id: "training-1",
      kind: "training",
    },
  ],
  clubEventParticipant: [
    {
      id: "part-1",
      organization_id: CLUB,
      event_id: EVENTO_RIGA,
      athlete_id: ATLETA,
      status: "present",
      notes: "",
      created_at: new Date("2026-09-12T19:00:00.000Z"),
      updated_at: new Date("2026-09-12T19:00:00.000Z"),
    },
  ],
  notification: [
    {
      id: "notifica-1",
      organization_id: CLUB,
      user_id: UTENTE_ATLETA,
      title: "Allenamento spostato",
      message: "Si comincia alle 18",
      type: "info",
      read: false,
      data: {},
      created_at: new Date("2026-09-01T08:00:00.000Z"),
      updated_at: new Date("2026-09-01T08:00:00.000Z"),
    },
  ],
  appointment: [RIGA_APPUNTAMENTO],
  appointmentSlot: [],
  documentRequest: [
    {
      id: "richiesta-1",
      organization_id: CLUB,
      subject_kind: "athlete",
      subject_id: ATLETA,
      document_kind: "identity_document",
      title: "Documento d'identita",
      description: "Fronte e retro",
      required: true,
      due_date: new Date("2026-09-30T00:00:00.000Z"),
      season_id: null,
      status: "fulfilled",
      last_reminded_at: null,
      created_at: new Date("2026-08-01T00:00:00.000Z"),
      updated_at: new Date("2026-09-02T00:00:00.000Z"),
    },
  ],
  documentSubmission: [
    {
      id: "deposito-1",
      organization_id: CLUB,
      request_id: "richiesta-1",
      subject_kind: "athlete",
      subject_id: ATLETA,
      document_kind: "identity_document",
      attachment_id: ALLEGATO,
      status: "approved",
      decision_note: null,
      submitted_at: new Date("2026-09-01T10:00:00.000Z"),
      decided_at: new Date("2026-09-02T10:00:00.000Z"),
      created_at: new Date("2026-09-01T10:00:00.000Z"),
      updated_at: new Date("2026-09-02T10:00:00.000Z"),
    },
  ],
  attachment: [
    {
      id: ALLEGATO,
      organization_id: CLUB,
      owner_type: "athlete",
      owner_id: ATLETA,
      category: "identity_document",
      file_name: "carta-identita.pdf",
      mime_type: "application/pdf",
      size_bytes: 1024,
      valid_from: null,
      valid_until: null,
      created_at: new Date("2026-09-01T10:00:00.000Z"),
      updated_at: new Date("2026-09-01T10:00:00.000Z"),
    },
  ],
  };
};

/** Ogni riga di ogni elenco proiettato, con il nome del suo elenco. */
const righeProiettate = (area) => [
  ["categories", area.categories],
  ["trainings.upcoming", area.trainings.upcoming],
  ["trainings.history", area.trainings.history],
  ["matches.upcoming", area.matches.upcoming],
  ["matches.history", area.matches.history],
  ["attendance.items", area.attendance.items],
  ["appointments", area.appointments],
  ["documents", area.documents],
  ["notifications", area.notifications],
];

test("nessun campo dell'area atleta arriva indefinito", async () => {
  const fake = createFakePrisma(semeArea());
  setPrismaClientForTests(fake.client);

  const area = await dominio.readAthleteAreaOverview(UTENTE_ATLETA);

  /*
    Il seme non e vuoto per una ragione: su elenchi vuoti questo controllo
    passerebbe sempre. Se una di queste liste arrivasse vuota, il difetto
    sarebbe nel seme e non nella proiezione, e va visto subito.

    L'allenamento sta in `upcoming` o in `history` a seconda del giorno in cui
    il test gira: qui conta che una riga ci sia, non in quale delle due.
  */
  for (const [nome, righe] of [
    ["categories", area.categories],
    ["attendance.items", area.attendance.items],
    ["appointments", area.appointments],
    ["documents", area.documents],
    ["notifications", area.notifications],
    [
      "trainings",
      [...area.trainings.upcoming, ...area.trainings.history],
    ],
  ]) {
    assert.ok(righe.length > 0, `${nome} deve avere almeno una riga da provare`);
  }

  const vuoti = [];
  for (const [nome, righe] of righeProiettate(area)) {
    for (const riga of righe) {
      for (const [campo, valore] of Object.entries(riga)) {
        if (valore === undefined) vuoti.push(`${nome}.${campo}`);
      }
    }
  }

  assert.deepEqual(
    vuoti,
    [],
    `questi campi non esistono nella sorgente: ${vuoti.join(", ")}`,
  );
});

test("l'appuntamento porta la data e l'etichetta italiana, non il nome della colonna", async () => {
  const fake = createFakePrisma(semeArea());
  setPrismaClientForTests(fake.client);

  const area = await dominio.readAthleteAreaOverview(UTENTE_ATLETA);
  const appuntamento = area.appointments[0];

  assert.equal(appuntamento.startsAt, "2026-09-10T15:00:00.000Z");
  assert.equal(appuntamento.endsAt, "2026-09-10T15:30:00.000Z");
  assert.equal(appuntamento.status, "cancelled_by_family");
  assert.equal(appuntamento.statusLabel, "Annullato dalla famiglia");
  assert.equal(appuntamento.decisionNote, "La famiglia ha disdetto");

  /* Le note della segreteria restano fuori: non ci sono, non sono nascoste. */
  assert.equal(
    JSON.stringify(area).includes("NOTA-INTERNA"),
    false,
    "le note interne non appartengono a nessuna area che non sia la segreteria",
  );
});

test("il documento porta tipo, data e stato, e nessun indirizzo di file", async () => {
  const fake = createFakePrisma(semeArea());
  setPrismaClientForTests(fake.client);

  const area = await dominio.readAthleteAreaOverview(UTENTE_ATLETA);
  const documento = area.documents[0];

  assert.ok(documento, "il documento consegnato compare nell'area atleta");
  assert.equal(documento.title, "Documento d'identita");
  assert.ok(documento.type, "il genere del documento e un'etichetta, non vuoto");
  assert.equal(documento.status, "approved");
  assert.equal(documento.statusLabel, "Approvato");
  assert.equal(documento.uploadedAt, "2026-09-01T10:00:00.000Z");

  /* Nessun indirizzo: ne quello che risponde 403, ne quello che aprirebbe i byte. */
  assert.equal(documento.url, undefined);
  assert.equal(
    JSON.stringify(area).includes("/api/v1/attachments/"),
    false,
    "nessun link agli allegati esce da quest'area",
  );
});

test("l'evento porta la categoria, la fine e la presenza registrata", async () => {
  const fake = createFakePrisma(semeArea());
  setPrismaClientForTests(fake.client);

  const area = await dominio.readAthleteAreaOverview(UTENTE_ATLETA);
  const allenamenti = [
    ...area.trainings.upcoming,
    ...area.trainings.history,
  ];
  const evento = allenamenti[0];

  assert.ok(evento, "l'allenamento dell'atleta compare nella sua area");
  /*
    L'istante di inizio lo ricompone `summarizeEvent` dal giorno e dall'ora
    della colonna JSON, quindi qui si prova che sia una data leggibile — cio
    che `dataOra` chiede per non stampare «Data da definire» — e non un istante
    al minuto, che dipenderebbe dal fuso della macchina che esegue il test.
  */
  assert.ok(
    evento.startsAt && !Number.isNaN(new Date(evento.startsAt).getTime()),
    "l'inizio dell'allenamento e una data leggibile",
  );
  assert.equal(evento.endsAt, "2026-09-12T18:30:00.000Z");
  assert.equal(evento.categoryName, "Under 15");
  assert.equal(evento.location, "Palestra comunale");
  assert.equal(evento.attendanceStatus, "present");
});
