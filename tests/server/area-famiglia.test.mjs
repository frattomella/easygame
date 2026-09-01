import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **L'area della famiglia: il gate e il legame, non il ruolo** (lane 5H).
 *
 * Un tutore ha un accesso di **ruolo genitore** e nessun ruolo gestionale: ogni
 * controllo di permesso per ruolo, su questa strada, risponde «no». Il suo
 * accesso nasce dal **legame** con l'atleta, che un solo proprietario risolve
 * (`getParentLinkedAthletes`, attraverso `canParentAccessAthlete`), e che
 * accetta anche la corrispondenza con l'indirizzo verificato.
 *
 * Il difetto che questi test presidiano e il rovescio: **il legame di un figlio
 * non e il legame di un altro**, e non e il legame di un altro club. Fino alla
 * Wave 5 la famiglia non poteva decidere niente sui consensi — doveva
 * telefonare per cambiare idea su una fotografia — e la porta che si apre
 * adesso deve aprirsi **solo** sul proprio atleta.
 */

const CLUB = "aaaaaaaa-8000-4000-8000-00000000000a";
const ALTRO_CLUB = "bbbbbbbb-8000-4000-8000-00000000000b";
const GENITORE = "11111111-8000-4000-8000-000000000aaa";
const ESTRANEO = "22222222-8000-4000-8000-000000000bbb";

const FIGLIO_A = "aaaa0000-8000-4000-8000-00000000000a";
const FIGLIO_B = "bbbb0000-8000-4000-8000-00000000000b";
const ALTRUI = "cccc0000-8000-4000-8000-00000000000c";

const DEFINIZIONE = "dddd0000-8000-4000-8000-00000000000d";
const VERSIONE = "eeee0000-8000-4000-8000-00000000000e";

let consensi;
let parentDashboard;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  consensi = await import("../../src/lib/server/consents.ts");
  parentDashboard = await import("../../src/lib/server/parent-dashboard.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const atleta = (id, organizationId, nome) => ({
  id,
  organization_id: organizationId,
  first_name: nome,
  last_name: "Rossi",
  data: {
    guardians: [
      {
        name: "Anna Rossi",
        email: "genitore@example.it",
        linkedUserId: organizationId === CLUB ? GENITORE : null,
      },
    ],
  },
});

const seed = () => ({
  user: [
    {
      id: GENITORE,
      email: "genitore@example.it",
      email_verified_at: new Date("2026-01-01T00:00:00.000Z"),
    },
    { id: ESTRANEO, email: "estraneo@example.it" },
  ],
  club: [
    { id: CLUB, slug: "club", name: "Club" },
    { id: ALTRO_CLUB, slug: "altro", name: "Altro club" },
  ],
  /*
    Il tutore ha un accesso di **ruolo genitore**, che e come entra nella
    propria area — e non ha nessun ruolo gestionale. E la ragione per cui ogni
    controllo di permesso per ruolo, su questa strada, risponde «no»: il suo
    accesso nasce dal legame con l'atleta, non dal ruolo.
  */
  organizationUser: [
    {
      id: "ou-genitore",
      organization_id: CLUB,
      user_id: GENITORE,
      role: "parent",
      is_primary: true,
    },
  ],
  athlete: [
    atleta(FIGLIO_A, CLUB, "Marco"),
    atleta(FIGLIO_B, CLUB, "Luca"),
    atleta(ALTRUI, ALTRO_CLUB, "Sara"),
  ],
  consentDefinition: [
    {
      id: DEFINIZIONE,
      organization_id: CLUB,
      key: "foto",
      title: "Pubblicazione fotografie",
      description: "Le foto delle partite sui canali della societa",
      required: false,
      status: "active",
      published_version: 1,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  consentVersion: [
    {
      id: VERSIONE,
      organization_id: CLUB,
      definition_id: DEFINIZIONE,
      version: 1,
      body: "Testo dell'informativa",
      published_at: new Date("2026-01-01T00:00:00.000Z"),
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  consentRecord: [],
  auditLog: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

/** Lo scope che la rotta della famiglia costruisce: **nessun ruolo**. */
const scopeFamiglia = () => ({
  userId: GENITORE,
  activeOrganizationId: CLUB,
  activeRole: null,
  allowedOrganizationIds: [CLUB],
});

const negato = /Accesso negato/;

/* ============================= il legame, e i suoi confini =============== */

test("il legame risolve entrambi i figli, e non quello di un'altra famiglia", async () => {
  assert.equal(
    await parentDashboard.canParentAccessAthlete(GENITORE, FIGLIO_A),
    true,
  );
  assert.equal(
    await parentDashboard.canParentAccessAthlete(GENITORE, FIGLIO_B),
    true,
  );
  assert.equal(
    await parentDashboard.canParentAccessAthlete(GENITORE, ALTRUI),
    false,
    "un atleta di un altro club non e un figlio",
  );
  assert.equal(
    await parentDashboard.canParentAccessAthlete(ESTRANEO, FIGLIO_A),
    false,
  );
});

/* =================== i consensi decisi dalla famiglia (5H) =============== */

test("la famiglia accetta un consenso, e la sorgente lo dice", async () => {
  const esito = await consensi.recordConsentDecision(scopeFamiglia(), {
    definitionId: DEFINIZIONE,
    subjectKind: "athlete",
    subjectId: FIGLIO_A,
    status: "accepted",
    source: "subject",
    asSubject: { userId: GENITORE, athleteId: FIGLIO_A },
  });

  assert.equal(esito.state.status, "accepted");

  const riga = fake.rows("consentRecord")[0];
  assert.equal(
    riga.source,
    "subject",
    "«l'ha spuntata il tutore» non e «gliel'ha spuntata la segreteria»",
  );
  assert.equal(riga.decided_by, GENITORE);
});

test("la famiglia revoca cio che aveva accettato", async () => {
  await consensi.recordConsentDecision(scopeFamiglia(), {
    definitionId: DEFINIZIONE,
    subjectKind: "athlete",
    subjectId: FIGLIO_A,
    status: "accepted",
    source: "subject",
    asSubject: { userId: GENITORE, athleteId: FIGLIO_A },
  });

  const esito = await consensi.recordConsentDecision(scopeFamiglia(), {
    definitionId: DEFINIZIONE,
    subjectKind: "athlete",
    subjectId: FIGLIO_A,
    status: "revoked",
    source: "subject",
    asSubject: { userId: GENITORE, athleteId: FIGLIO_A },
  });

  assert.equal(esito.state.status, "revoked");
  assert.equal(
    fake.rows("consentRecord").length,
    2,
    "una revoca **aggiunge** una riga, non ne cambia una",
  );
});

test("dal contesto del figlio A non si decide per il figlio B", async () => {
  /*
    E la forma del difetto che 5E ha chiuso sugli appuntamenti — un OR
    permissivo fra «l'atleta corrisponde» e «l'autore corrisponde» — e qui non
    deve nascere: il soggetto della decisione deve essere **quello del
    contesto**, non un altro figlio della stessa famiglia.
  */
  await assert.rejects(
    () =>
      consensi.recordConsentDecision(scopeFamiglia(), {
        definitionId: DEFINIZIONE,
        subjectKind: "athlete",
        subjectId: FIGLIO_B,
        status: "accepted",
        source: "subject",
        asSubject: { userId: GENITORE, athleteId: FIGLIO_A },
      }),
    negato,
  );

  assert.equal(fake.rows("consentRecord").length, 0);
});

test("un estraneo non decide sull'atleta di un altro", async () => {
  await assert.rejects(
    () =>
      consensi.recordConsentDecision(
        { ...scopeFamiglia(), userId: ESTRANEO },
        {
          definitionId: DEFINIZIONE,
          subjectKind: "athlete",
          subjectId: FIGLIO_A,
          status: "accepted",
          source: "subject",
          asSubject: { userId: ESTRANEO, athleteId: FIGLIO_A },
        },
      ),
    negato,
  );
});

test("la famiglia non decide su un socio ne su un tutore", async () => {
  for (const soggetto of ["member", "person", "guardian"]) {
    await assert.rejects(
      () =>
        consensi.recordConsentDecision(scopeFamiglia(), {
          definitionId: DEFINIZIONE,
          subjectKind: soggetto,
          subjectId: FIGLIO_A,
          status: "accepted",
          source: "subject",
          asSubject: { userId: GENITORE, athleteId: FIGLIO_A },
        }),
      negato,
      `un soggetto ${soggetto} non e il proprio atleta`,
    );
  }
});

test("senza il legame dichiarato vale il permesso di ruolo, che la famiglia non ha", async () => {
  /*
    Il ramo del soggetto si apre **solo** quando chi chiama dichiara il legame.
    Senza, si ricade sul controllo di ruolo — e lo scope della famiglia ha
    `activeRole: null` di proposito, cosi ogni controllo di ruolo risponde «no».
  */
  await assert.rejects(
    () =>
      consensi.recordConsentDecision(scopeFamiglia(), {
        definitionId: DEFINIZIONE,
        subjectKind: "athlete",
        subjectId: FIGLIO_A,
        status: "accepted",
      }),
    negato,
  );
});

/* ============================ la lettura dei propri consensi ============= */

test("la famiglia legge i consensi del proprio atleta", async () => {
  const stati = await consensi.listConsentStates(scopeFamiglia(), {
    subjectKind: "athlete",
    subjectId: FIGLIO_A,
    asSubject: { userId: GENITORE, athleteId: FIGLIO_A },
  });

  assert.equal(stati.length, 1);
  assert.equal(stati[0].status, "missing");
});

test("la famiglia non legge i consensi di un altro atleta", async () => {
  await assert.rejects(
    () =>
      consensi.listConsentStates(scopeFamiglia(), {
        subjectKind: "athlete",
        subjectId: FIGLIO_B,
        asSubject: { userId: GENITORE, athleteId: FIGLIO_A },
      }),
    negato,
  );
});

test("senza legame dichiarato la lettura chiede il permesso della segreteria", async () => {
  await assert.rejects(
    () =>
      consensi.listConsentStates(scopeFamiglia(), {
        subjectKind: "athlete",
        subjectId: FIGLIO_A,
      }),
    negato,
  );
});
