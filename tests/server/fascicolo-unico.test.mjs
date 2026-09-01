import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Il fascicolo unico: permesso, confine, e uno stato che nessuno scrive**
 * (Wave 5, lane 5D, §17).
 *
 * Cio che l'archivio precedente non poteva avere, e che qui va provato:
 *
 * - un **permesso per chiave**, e non «chi puo leggere i certificati medici
 *   puo anche approvarli». Il genitore e l'atleta non compaiono fra i ruoli:
 *   il loro accesso nasce dal **legame**, e un genitore collegato solo come
 *   tutore ha ruolo attivo `null`;
 * - un **confine verificato riga per riga** con `assertActiveClub`: la riga di
 *   un altro club non si legge, non si scrive, non si cancella;
 * - la **derivazione**: dopo un'accettazione la colonna `status` della
 *   richiesta resta `open`, e lo stato mostrato e `fulfilled`. Sono due cose
 *   diverse, e questo test esiste perche restino tali;
 * - la **promozione** del certificato medico: accettato nel fascicolo, diventa
 *   una riga in `medical_certificates`, o sarebbe valido per la segreteria e
 *   inesistente per il promemoria notturno;
 * - l'**audit**, che le due rotte legacy non scrivevano mai.
 */

const CLUB = "aaaaaaaa-5d00-4000-8000-00000000000a";
const ALTRO_CLUB = "bbbbbbbb-5d00-4000-8000-00000000000b";
const SEGRETERIA = "11111111-5d00-4000-8000-000000000aaa";
const GENITORE = "22222222-5d00-4000-8000-000000000bbb";
const ESTRANEO = "33333333-5d00-4000-8000-000000000ccc";

const ATLETA = "aaaa1111-5d00-4000-8000-000000000001";
const ATLETA_ALTRUI = "aaaa2222-5d00-4000-8000-000000000002";
const RICHIESTA = "rrrr1111-5d00-4000-8000-000000000001";
const RICHIESTA_ALTRUI = "rrrr2222-5d00-4000-8000-000000000002";

const scope = (activeRole, userId = SEGRETERIA, organizationId = CLUB) => ({
  userId,
  activeOrganizationId: organizationId,
  activeRole,
  allowedOrganizationIds: [CLUB, ALTRO_CLUB],
});

const file = (fileName = "certificato.pdf") => ({
  fileName,
  mimeType: "application/pdf",
  content: Buffer.from("%PDF-1.4 documento di prova"),
});

let fascicolo;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  fascicolo = await import("../../src/lib/server/document-requests.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const seed = () => ({
  user: [
    { id: SEGRETERIA, email: "segreteria@club.it", email_verified_at: new Date() },
    { id: GENITORE, email: "mamma@famiglia.it", email_verified_at: new Date() },
    { id: ESTRANEO, email: "altro@famiglia.it", email_verified_at: new Date() },
  ],
  organizationUser: [
    {
      id: "ou-1",
      organization_id: CLUB,
      user_id: SEGRETERIA,
      role: "owner",
      is_primary: true,
    },
  ],
  club: [
    { id: CLUB, slug: "club", name: "Club", creator_id: SEGRETERIA },
    { id: ALTRO_CLUB, slug: "altro", name: "Altro club" },
  ],
  athlete: [
    {
      id: ATLETA,
      organization_id: CLUB,
      first_name: "Mario",
      last_name: "Rossi",
      /* Il legame vero: e questo, e non una membership, a fare il genitore. */
      user_id: GENITORE,
      data: {},
    },
    {
      id: ATLETA_ALTRUI,
      organization_id: ALTRO_CLUB,
      first_name: "Luca",
      last_name: "Bianchi",
      user_id: null,
      data: {},
    },
  ],
  documentRequest: [
    {
      id: RICHIESTA,
      organization_id: CLUB,
      subject_kind: "athlete",
      subject_id: ATLETA,
      document_kind: "medical_certificate",
      title: "Certificato medico agonistico",
      description: null,
      required: true,
      due_date: null,
      season_id: null,
      status: "open",
      last_reminded_at: null,
      created_by: SEGRETERIA,
      created_at: new Date("2026-09-01T08:00:00.000Z"),
      updated_at: new Date("2026-09-01T08:00:00.000Z"),
    },
    {
      id: RICHIESTA_ALTRUI,
      organization_id: ALTRO_CLUB,
      subject_kind: "athlete",
      subject_id: ATLETA_ALTRUI,
      document_kind: "identity_document",
      title: "Carta d'identita di un altro club",
      description: null,
      required: true,
      due_date: null,
      season_id: null,
      status: "open",
      last_reminded_at: null,
      created_by: null,
      created_at: new Date("2026-09-01T08:00:00.000Z"),
      updated_at: new Date("2026-09-01T08:00:00.000Z"),
    },
  ],
  documentSubmission: [],
  attachment: [],
  medicalCertificate: [],
  notification: [],
  auditLog: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const negato = /Accesso negato/;

/* ================================================ la matrice dei permessi */

test("chiedere un documento non e un permesso del genitore, dell'atleta o dell'allenatore", async () => {
  for (const ruolo of ["parent", "athlete", "trainer"]) {
    await assert.rejects(
      () =>
        fascicolo.createDocumentRequest(scope(ruolo), {
          subjectKind: "athlete",
          subjectId: ATLETA,
          documentKind: "identity_document",
          title: "Carta d'identita",
        }),
      negato,
      `${ruolo} non ha «documents.request»`,
    );
  }
});

test("accettare o rifiutare non e un permesso dell'allenatore, ne della famiglia", async () => {
  const deposito = await depositoDellaFamiglia();

  for (const ruolo of ["trainer", "parent", "athlete"]) {
    await assert.rejects(
      () =>
        fascicolo.decideDocumentSubmission(scope(ruolo), deposito.id, {
          decision: "approved",
        }),
      negato,
      `${ruolo} non ha «documents.review»`,
    );
  }
});

test("la coda «da verificare» la vede chi verifica, non chi legge un fascicolo", async () => {
  await assert.rejects(
    () => fascicolo.listPendingDocumentSubmissions(scope("trainer")),
    negato,
  );
  const coda = await fascicolo.listPendingDocumentSubmissions(scope("staff"));
  assert.deepEqual(coda, []);
});

test("i quattro ruoli di gestione chiedono, decidono e leggono", async () => {
  for (const ruolo of ["owner", "club_manager", "collaborator", "staff"]) {
    const creata = await fascicolo.createDocumentRequest(scope(ruolo), {
      subjectKind: "athlete",
      subjectId: ATLETA,
      documentKind: "identity_document",
      title: `Carta d'identita (${ruolo})`,
    });
    assert.equal(creata.state.status, "open");
    assert.equal(creata.state.dossier, "missing");
  }
});

test("l'elenco del club senza soggetto non lo chiede una famiglia", async () => {
  const famiglia = await fascicolo.resolveLinkedFamilyScope(GENITORE, ATLETA);
  await assert.rejects(
    () => fascicolo.listDocumentRequests(famiglia, {}),
    negato,
    "senza soggetto sarebbe il fascicolo di tutti",
  );
});

/* ================================================== il legame, non il ruolo */

test("il genitore collegato consegna e legge, pur senza appartenere al club", async () => {
  const famiglia = await fascicolo.resolveLinkedFamilyScope(GENITORE, ATLETA);
  assert.equal(famiglia.activeRole, null, "il tutore non ha un ruolo nel club");
  assert.equal(famiglia.activeOrganizationId, CLUB);

  const voce = await fascicolo.submitDocument(famiglia, {
    requestId: RICHIESTA,
    file: file(),
  });

  assert.equal(voce.state.dossier, "under_review");
  assert.equal(voce.state.status, "open", "nessuno lo ha ancora guardato");

  const fascicoloFamiglia = await fascicolo.getDocumentDossier(famiglia, {
    subjectKind: "athlete",
    subjectId: ATLETA,
  });
  assert.equal(fascicoloFamiglia.length, 1);
});

test("un estraneo non e una famiglia: nessun legame, nessun fascicolo", async () => {
  await assert.rejects(
    () => fascicolo.resolveLinkedFamilyScope(ESTRANEO, ATLETA),
    negato,
  );
  await assert.rejects(
    () =>
      fascicolo.getDocumentDossier(scope(null, ESTRANEO), {
        subjectKind: "athlete",
        subjectId: ATLETA,
      }),
    negato,
    "senza ruolo e senza legame non resta nessuna strada",
  );
});

/* ========================================================= il confine ==== */

test("una richiesta di un altro club non si legge, non si scrive, non si cancella", async () => {
  await assert.rejects(
    () => fascicolo.getDocumentRequest(scope("owner"), RICHIESTA_ALTRUI),
    negato,
  );
  await assert.rejects(
    () => fascicolo.remindDocumentRequest(scope("owner"), RICHIESTA_ALTRUI),
    negato,
  );
  await assert.rejects(
    () => fascicolo.cancelDocumentRequest(scope("owner"), RICHIESTA_ALTRUI),
    negato,
  );
  await assert.rejects(
    () =>
      fascicolo.submitDocument(scope("owner"), {
        requestId: RICHIESTA_ALTRUI,
        source: "club",
        file: file(),
      }),
    negato,
  );

  const riga = fake
    .rows("documentRequest")
    .find((row) => row.id === RICHIESTA_ALTRUI);
  assert.equal(riga.status, "open", "la riga altrui non e stata toccata");
});

test("il deposito di un altro club non si decide", async () => {
  fake.rows("documentSubmission").push({
    id: "dep-altrui",
    organization_id: ALTRO_CLUB,
    request_id: RICHIESTA_ALTRUI,
    subject_kind: "athlete",
    subject_id: ATLETA_ALTRUI,
    document_kind: "identity_document",
    attachment_id: null,
    submitted_by: null,
    submitted_at: new Date("2026-09-01T09:00:00.000Z"),
    source: "parent",
    status: "under_review",
    decided_by: null,
    decided_at: null,
    decision_note: null,
  });

  await assert.rejects(
    () =>
      fascicolo.decideDocumentSubmission(scope("owner"), "dep-altrui", {
        decision: "approved",
      }),
    negato,
  );

  const riga = fake
    .rows("documentSubmission")
    .find((row) => row.id === "dep-altrui");
  assert.equal(riga.status, "under_review");
  assert.equal(riga.decided_by, null);
});

test("il club attivo e uno solo: appartenere a due non ne autorizza l'altro", async () => {
  /*
    Lo scope dichiara **entrambi** i club fra quelli consentiti — e la
    situazione di chiunque si sia creato una societa — e il confine deve
    rifiutare lo stesso: e la forma che ha fatto leggere l'IBAN altrui
    (ADR-0094).
  */
  await assert.rejects(
    () => fascicolo.getDocumentRequest(scope("owner"), RICHIESTA_ALTRUI),
    negato,
  );
});

test("una richiesta verso un atleta di un altro club non nasce", async () => {
  await assert.rejects(
    () =>
      fascicolo.createDocumentRequest(scope("owner"), {
        subjectKind: "athlete",
        subjectId: ATLETA_ALTRUI,
        documentKind: "identity_document",
        title: "Carta d'identita",
      }),
    negato,
  );
});

/* ============================================ lo stato non si scrive ===== */

const depositoDellaFamiglia = async (requestId = RICHIESTA) => {
  const famiglia = await fascicolo.resolveLinkedFamilyScope(GENITORE, ATLETA);
  const voce = await fascicolo.submitDocument(famiglia, {
    requestId,
    file: file(),
  });
  const deposito = fake
    .rows("documentSubmission")
    .find((row) => row.request_id === requestId);
  return { voce, id: deposito.id };
};

test("dopo l'accettazione la colonna resta «open», e lo stato mostrato e «fulfilled»", async () => {
  const deposito = await depositoDellaFamiglia();

  const voce = await fascicolo.decideDocumentSubmission(
    scope("owner"),
    deposito.id,
    { decision: "approved" },
  );

  assert.equal(voce.state.status, "fulfilled");
  assert.equal(voce.state.dossier, "approved");

  const riga = fake.rows("documentRequest").find((row) => row.id === RICHIESTA);
  assert.equal(
    riga.status,
    "open",
    "«fulfilled» non si scrive: e una colonna che resterebbe indietro",
  );
});

test("una decisione presa non si riscrive", async () => {
  const deposito = await depositoDellaFamiglia();
  await fascicolo.decideDocumentSubmission(scope("owner"), deposito.id, {
    decision: "approved",
  });

  await assert.rejects(
    () =>
      fascicolo.decideDocumentSubmission(scope("owner"), deposito.id, {
        decision: "rejected",
        note: "ripensamento",
      }),
    /gia accettato/,
  );
});

test("il rifiuto senza motivo non passa, e non tocca la riga", async () => {
  const deposito = await depositoDellaFamiglia();

  await assert.rejects(
    () =>
      fascicolo.decideDocumentSubmission(scope("owner"), deposito.id, {
        decision: "rejected",
      }),
    /motivo del rifiuto/,
  );

  const riga = fake
    .rows("documentSubmission")
    .find((row) => row.id === deposito.id);
  assert.equal(riga.status, "under_review");
});

test("il rifiuto con motivo riapre la richiesta e conserva il perche", async () => {
  const deposito = await depositoDellaFamiglia();

  const voce = await fascicolo.decideDocumentSubmission(
    scope("owner"),
    deposito.id,
    { decision: "rejected", note: "il certificato e scaduto" },
  );

  assert.equal(voce.state.status, "open");
  assert.equal(voce.state.dossier, "rejected");
  assert.equal(voce.state.decisionNote, "il certificato e scaduto");
});

/* ================================== la promozione del certificato medico = */

test("il certificato medico accettato promuove una riga, e non ne scrive lo stato", async () => {
  const deposito = await depositoDellaFamiglia();

  await fascicolo.decideDocumentSubmission(scope("owner"), deposito.id, {
    decision: "approved",
  });

  const certificati = fake.rows("medicalCertificate");
  assert.equal(certificati.length, 1, "senza la riga il promemoria non lo vede");
  assert.equal(certificati[0].organization_id, CLUB);
  assert.equal(certificati[0].athlete_id, ATLETA);
  assert.equal(
    "status" in certificati[0],
    false,
    "lo stato di un certificato si ricava dalla scadenza (W5-44)",
  );
  assert.equal(certificati[0].data.submissionId, deposito.id);
});

test("un documento che non e un certificato medico non promuove niente", async () => {
  const creata = await fascicolo.createDocumentRequest(scope("owner"), {
    subjectKind: "athlete",
    subjectId: ATLETA,
    documentKind: "identity_document",
    title: "Carta d'identita",
  });

  const deposito = await depositoDellaFamiglia(creata.id);
  await fascicolo.decideDocumentSubmission(scope("owner"), deposito.id, {
    decision: "approved",
  });

  assert.equal(fake.rows("medicalCertificate").length, 0);
});

/* ================================================ deposito spontaneo ===== */

test("la famiglia consegna anche senza che nessuno abbia chiesto", async () => {
  const famiglia = await fascicolo.resolveLinkedFamilyScope(GENITORE, ATLETA);

  await fascicolo.submitDocument(famiglia, {
    subjectKind: "athlete",
    subjectId: ATLETA,
    documentKind: "identity_document",
    file: file("carta.pdf"),
  });

  const riga = fake
    .rows("documentSubmission")
    .find((row) => row.document_kind === "identity_document");
  assert.equal(riga.request_id, null, "il verso spontaneo non ha una richiesta");

  const coda = await fascicolo.listPendingDocumentSubmissions(scope("owner"));
  assert.equal(coda.length, 1, "e finisce nella stessa coda, non in una seconda");
});

test("su una richiesta annullata non si deposita piu", async () => {
  await fascicolo.cancelDocumentRequest(scope("owner"), RICHIESTA, {
    reason: "chiesto per errore",
  });

  const famiglia = await fascicolo.resolveLinkedFamilyScope(GENITORE, ATLETA);
  await assert.rejects(
    () => fascicolo.submitDocument(famiglia, { requestId: RICHIESTA, file: file() }),
    /annullata/,
  );
});

/* ====================================================== il sollecito ===== */

test("il sollecito non parte due volte in sei ore", async () => {
  await fascicolo.remindDocumentRequest(scope("owner"), RICHIESTA);

  await assert.rejects(
    () => fascicolo.remindDocumentRequest(scope("owner"), RICHIESTA),
    /ultime 6 ore/,
  );
});

test("non si sollecita un documento gia consegnato", async () => {
  await depositoDellaFamiglia();

  await assert.rejects(
    () => fascicolo.remindDocumentRequest(scope("owner"), RICHIESTA),
    /attende la verifica/,
  );
});

/* ========================================================== l'audit ===== */

test("richiesta, deposito e decisione lasciano traccia, con il motivo", async () => {
  const creata = await fascicolo.createDocumentRequest(scope("owner"), {
    subjectKind: "athlete",
    subjectId: ATLETA,
    documentKind: "identity_document",
    title: "Carta d'identita",
  });

  const deposito = await depositoDellaFamiglia(creata.id);
  await fascicolo.decideDocumentSubmission(scope("owner"), deposito.id, {
    decision: "rejected",
    note: "foto illeggibile",
  });

  const azioni = fake.rows("auditLog").map((row) => row.action);
  assert.ok(azioni.includes("document.request.created"));
  assert.ok(azioni.includes("document.submission.received"));
  assert.ok(azioni.includes("document.submission.decided"));

  const decisione = fake
    .rows("auditLog")
    .find((row) => row.action === "document.submission.decided");
  assert.equal(decisione.metadata.decision, "rejected");
  assert.equal(
    decisione.metadata.reason,
    "foto illeggibile",
    "il motivo sta nel metadato: la riga puo essere superata da un deposito nuovo",
  );
});

test("l'annullamento porta il motivo nel registro", async () => {
  await fascicolo.cancelDocumentRequest(scope("owner"), RICHIESTA, {
    reason: "chiesto per errore",
  });

  const riga = fake
    .rows("auditLog")
    .find((row) => row.action === "document.request.cancelled");
  assert.equal(riga.metadata.reason, "chiesto per errore");
});

/* ================================================ la notifica indirizzata */

test("la consegna della famiglia avvisa la segreteria, una riga per destinatario", async () => {
  await depositoDellaFamiglia();

  const notifiche = fake
    .rows("notification")
    .filter((row) => row.type === "document_uploaded");

  assert.equal(notifiche.length, 1);
  assert.equal(
    notifiche[0].user_id,
    SEGRETERIA,
    "«user_id: null» significa «di tutti» per l'area genitore",
  );
});
