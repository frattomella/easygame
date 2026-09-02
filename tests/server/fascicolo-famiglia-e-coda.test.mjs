import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Il fascicolo arriva alla famiglia, e la coda arriva al club**
 * (Wave 6, lane 6E — W6-36, W6-37, W6-38, W6-39, W6-40).
 *
 * ---
 *
 * Il dominio della Wave 5 era completo, corretto e **senza consumatori**: le
 * quattro rotte del fascicolo non erano chiamate da nessuna schermata, e
 * l'area famiglia continuava a leggere `athletes.data.sharedDocuments` — un
 * array JSON dentro l'anagrafica. Conseguenza misurabile: **una richiesta
 * creata dalla segreteria non arrivava al genitore.**
 *
 * Questi test presidiano il collegamento, non il dominio (che ha gia il suo in
 * `fascicolo-unico.test.mjs`):
 *
 * - la famiglia legge il **fascicolo**, non l'array JSON;
 * - una richiesta creata dalla segreteria **compare** al genitore;
 * - un documento gia caricato **non compare in due elenchi** (W6-40);
 * - la coda del club vede i depositi di **tutti** gli atleti, e **nessuno** di
 *   un altro club.
 */

const CLUB = "aaaaaaaa-6e00-4000-8000-00000000000a";
const ALTRO_CLUB = "bbbbbbbb-6e00-4000-8000-00000000000b";

const SEGRETERIA = "11111111-6e00-4000-8000-000000000aaa";
const GENITORE = "22222222-6e00-4000-8000-000000000bbb";

const FIGLIO = "aaaa1111-6e00-4000-8000-000000000001";
const COMPAGNO = "aaaa2222-6e00-4000-8000-000000000002";
const ALTRUI = "cccc3333-6e00-4000-8000-000000000003";

const RICHIESTA = "rrrr1111-6e00-4000-8000-000000000001";
const RICHIESTA_CONSEGNATA = "rrrr2222-6e00-4000-8000-000000000002";
const RICHIESTA_COMPAGNO = "rrrr3333-6e00-4000-8000-000000000003";
const RICHIESTA_ALTRUI = "rrrr4444-6e00-4000-8000-000000000004";

let fascicolo;
let areaFamiglia;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  fascicolo = await import("../../src/lib/server/document-requests.ts");
  areaFamiglia = await import("../../src/lib/server/parent-dashboard.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const scopeClub = (activeRole = "owner") => ({
  userId: SEGRETERIA,
  activeOrganizationId: CLUB,
  activeRole,
  allowedOrganizationIds: [CLUB],
});

const richiesta = (overrides) => ({
  description: null,
  required: true,
  due_date: null,
  season_id: null,
  status: "open",
  last_reminded_at: null,
  created_by: SEGRETERIA,
  created_at: new Date("2026-08-01T08:00:00.000Z"),
  updated_at: new Date("2026-08-01T08:00:00.000Z"),
  subject_kind: "athlete",
  ...overrides,
});

const seed = () => ({
  user: [
    {
      id: SEGRETERIA,
      email: "segreteria@club.it",
      first_name: "Sara",
      last_name: "Segre",
      email_verified_at: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: GENITORE,
      email: "mamma@famiglia.it",
      first_name: "Anna",
      last_name: "Rossi",
      email_verified_at: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  organizationUser: [
    {
      id: "ou-segreteria",
      organization_id: CLUB,
      user_id: SEGRETERIA,
      role: "owner",
      is_primary: true,
    },
  ],
  club: [
    { id: CLUB, slug: "club", name: "Club", document_templates: [] },
    { id: ALTRO_CLUB, slug: "altro", name: "Altro club" },
  ],
  athlete: [
    {
      id: FIGLIO,
      organization_id: CLUB,
      first_name: "Marco",
      last_name: "Rossi",
      /* Il legame vero: e questo, e non una membership, a fare il genitore. */
      user_id: GENITORE,
      data: {
        /*
          L'array JSON di prima resta nell'anagrafica: il travaso e
          un'operazione a se. Se l'area famiglia lo leggesse ancora, questo
          documento comparirebbe — ed e proprio cio che non deve piu succedere.
        */
        sharedDocuments: [
          {
            id: "vecchio-json",
            title: "Documento dell'array JSON",
            status: "approved",
            visibleToParent: true,
            documentType: "other",
          },
        ],
      },
    },
    {
      id: COMPAGNO,
      organization_id: CLUB,
      first_name: "Luca",
      last_name: "Bianchi",
      user_id: null,
      data: {},
    },
    {
      id: ALTRUI,
      organization_id: ALTRO_CLUB,
      first_name: "Sara",
      last_name: "Verdi",
      user_id: null,
      data: {},
    },
  ],
  documentRequest: [
    richiesta({
      id: RICHIESTA,
      organization_id: CLUB,
      subject_id: FIGLIO,
      document_kind: "health_card",
      title: "Tessera sanitaria",
    }),
    richiesta({
      id: RICHIESTA_CONSEGNATA,
      organization_id: CLUB,
      subject_id: FIGLIO,
      document_kind: "medical_certificate",
      title: "Certificato medico agonistico",
    }),
    richiesta({
      id: RICHIESTA_COMPAGNO,
      organization_id: CLUB,
      subject_id: COMPAGNO,
      document_kind: "identity_document",
      title: "Carta d'identita",
    }),
    richiesta({
      id: RICHIESTA_ALTRUI,
      organization_id: ALTRO_CLUB,
      subject_id: ALTRUI,
      document_kind: "medical_certificate",
      title: "Certificato di un altro club",
    }),
  ],
  documentSubmission: [
    {
      id: "dep-figlio",
      organization_id: CLUB,
      request_id: RICHIESTA_CONSEGNATA,
      subject_kind: "athlete",
      subject_id: FIGLIO,
      document_kind: "medical_certificate",
      attachment_id: "all-figlio",
      submitted_by: GENITORE,
      submitted_at: new Date("2026-08-20T10:00:00.000Z"),
      source: "parent",
      status: "under_review",
      decided_by: null,
      decided_at: null,
      decision_note: null,
    },
    {
      id: "dep-compagno",
      organization_id: CLUB,
      request_id: RICHIESTA_COMPAGNO,
      subject_kind: "athlete",
      subject_id: COMPAGNO,
      document_kind: "identity_document",
      attachment_id: "all-compagno",
      submitted_by: GENITORE,
      submitted_at: new Date("2026-08-21T10:00:00.000Z"),
      source: "parent",
      status: "under_review",
      decided_by: null,
      decided_at: null,
      decision_note: null,
    },
    {
      id: "dep-altrui",
      organization_id: ALTRO_CLUB,
      request_id: RICHIESTA_ALTRUI,
      subject_kind: "athlete",
      subject_id: ALTRUI,
      document_kind: "medical_certificate",
      attachment_id: "all-altrui",
      submitted_by: null,
      submitted_at: new Date("2026-08-22T10:00:00.000Z"),
      source: "parent",
      status: "under_review",
      decided_by: null,
      decided_at: null,
      decision_note: null,
    },
  ],
  attachment: [
    {
      id: "all-figlio",
      organization_id: CLUB,
      owner_type: "athlete",
      owner_id: FIGLIO,
      category: "medical_certificate",
      file_name: "certificato.pdf",
      mime_type: "application/pdf",
      size_bytes: 1024,
      checksum: "x",
      storage_driver: "database",
      storage_key: "k",
      valid_from: null,
      valid_until: null,
      created_by: GENITORE,
      created_at: new Date("2026-08-20T10:00:00.000Z"),
      updated_at: new Date("2026-08-20T10:00:00.000Z"),
    },
  ],
  notification: [],
  auditLog: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const areeDelFiglio = () =>
  areaFamiglia.getFamilyDocumentAreas(
    GENITORE,
    { id: FIGLIO, organization_id: CLUB },
    { document_templates: [] },
    { now: new Date("2026-09-01T12:00:00.000Z") },
  );

/* --------------------------------------------------------- la famiglia */

test("W6-37: la richiesta della segreteria arriva al genitore", async () => {
  const aree = await areeDelFiglio();

  const daFare = aree.todo.map((voce) => voce.title);
  assert.ok(
    daFare.includes("Tessera sanitaria"),
    `la richiesta creata dalla segreteria non arriva: ${JSON.stringify(daFare)}`,
  );
});

test("W6-37: la famiglia legge il fascicolo, non l'array JSON dell'anagrafica", async () => {
  const aree = await areeDelFiglio();
  const titoli = [...aree.todo, ...aree.archive].map((voce) => voce.title);

  assert.equal(
    titoli.includes("Documento dell'array JSON"),
    false,
    "l'area famiglia sta ancora leggendo athletes.data.sharedDocuments",
  );
});

test("W6-40: un documento gia caricato non compare in due elenchi", async () => {
  const aree = await areeDelFiglio();

  const daFare = aree.todo.map((voce) => voce.id);
  const archivio = aree.archive.map((voce) => voce.id);

  // Il certificato consegnato aspetta la verifica: sta in archivio, e basta.
  assert.deepEqual(archivio, [RICHIESTA_CONSEGNATA]);
  assert.equal(aree.archive[0].state, "under_review");
  assert.deepEqual(daFare, [RICHIESTA]);
  assert.deepEqual(
    daFare.filter((id) => archivio.includes(id)),
    [],
  );
});

test("la riga in archivio porta il file, che il fascicolo da solo non conosce", async () => {
  const aree = await areeDelFiglio();

  assert.equal(aree.archive[0].fileName, "certificato.pdf");
  assert.equal(aree.archive[0].mimeType, "application/pdf");
  /*
    **Non basta che l'indirizzo esista: deve essere apribile da chi lo riceve.**

    `assert.ok(fileUrl)` passava anche quando l'indirizzo era
    `/api/v1/attachments/<id>`, cioe una rotta che risponde 403 a un genitore.
    La famiglia legge i byte dalla propria rotta, che risolve per legame.
    Il resto della verifica sta in `area-famiglia-rimedio-documenti.test.mjs`.
  */
  assert.equal(
    aree.archive[0].fileUrl,
    `/api/parent-dashboard/${FIGLIO}/documents/all-figlio?download=1`,
  );
});

test("il fascicolo di un altro figlio non entra in quello del proprio", async () => {
  const aree = await areeDelFiglio();
  const soggetti = [...aree.todo, ...aree.archive].map((voce) => voce.title);

  assert.equal(soggetti.includes("Carta d'identita"), false);
});

/* ------------------------------------------------------------- il club */

test("W6-39: la coda del club vede i depositi di tutti gli atleti", async () => {
  const coda = await fascicolo.listDocumentReviewQueue(scopeClub(), {});

  const inVerifica = coda.filter((row) => row.state === "under_review");
  assert.deepEqual(
    inVerifica.map((row) => row.subjectName).sort(),
    ["Luca Bianchi", "Marco Rossi"],
  );
});

test("W6-39: e nessun documento di un altro club", async () => {
  const coda = await fascicolo.listDocumentReviewQueue(scopeClub(), {});

  assert.equal(
    coda.some((row) => row.subjectId === ALTRUI),
    false,
  );
  assert.equal(
    coda.some((row) => row.title === "Certificato di un altro club"),
    false,
  );
});

test("la riga della coda dice atleta, documento, genitore e data", async () => {
  const coda = await fascicolo.listDocumentReviewQueue(scopeClub(), {});
  const riga = coda.find((row) => row.id === RICHIESTA_CONSEGNATA);

  assert.equal(riga.subjectName, "Marco Rossi");
  assert.equal(riga.documentKindLabel, "Certificato medico");
  assert.equal(riga.submittedByName, "Anna Rossi");
  assert.equal(riga.source, "parent");
  assert.ok(riga.submittedAt);
  assert.equal(riga.submissionId, "dep-figlio");
});

test("la coda la vede chi decide, non chi ha un ruolo qualunque", async () => {
  await assert.rejects(
    () => fascicolo.listDocumentReviewQueue(scopeClub("parent"), {}),
    /Accesso negato/,
  );
  await assert.rejects(
    () => fascicolo.listDocumentReviewQueue(scopeClub("trainer"), {}),
    /Accesso negato/,
  );
});

/* -------------------------------------------------- il tipo canonico */

test("W6-47: un tipo scritto come lo scrive una persona resta canonico in archivio", async () => {
  const creata = await fascicolo.createDocumentRequest(scopeClub(), {
    subjectKind: "athlete",
    subjectId: FIGLIO,
    documentKind: "Tessera sanitaria",
    title: "Tessera sanitaria del minore",
  });

  assert.equal(creata.documentKind, "health_card");

  const riga = fake.rows("documentRequest").find((row) => row.id === creata.id);
  assert.equal(
    riga.document_kind,
    "health_card",
    "il tipo e stato scritto in archivio in una forma che la coda non filtra",
  );
});

test("W6-47: «visita medica» resta un certificato medico, non un tipo a se", async () => {
  const creata = await fascicolo.createDocumentRequest(scopeClub(), {
    subjectKind: "athlete",
    subjectId: FIGLIO,
    documentKind: "visita medica",
    title: "Visita medica agonistica",
  });

  assert.equal(creata.documentKind, "medical_certificate");
});
