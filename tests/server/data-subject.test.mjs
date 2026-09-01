import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Export e cancellazione di una persona** (ADR-0019, Wave 6 §15.3).
 *
 * Il difetto che questi test presidiano non e «manca una funzione»: e che
 * cancellare un atleta **distruggeva** i suoi certificati medici e **lasciava
 * vivi** i suoi file, i suoi consensi e i suoi moduli compilati. Gli indici che
 * li legano alla persona sono polimorfi e senza chiave esterna: dopo la
 * cancellazione quei dati restavano in archivio senza piu niente che li legasse
 * a nessuno, che e la forma peggiore del difetto — il dato resta, e la
 * possibilita di trovarlo no.
 *
 * Ogni test qui parte da righe che vivono **solo** su quegli indici.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "aaaaaaaa-0000-4000-8000-000000000002";
const MINORE = "bbbbbbbb-0000-4000-8000-000000000001";
const MAGGIORENNE = "bbbbbbbb-0000-4000-8000-000000000002";
const ADESSO = new Date("2026-09-01T10:00:00Z");

let dominio;
let setPrismaClientForTests;
let fake;

const scope = (activeRole = "owner") => ({
  userId: "dddddddd-0000-4000-8000-00000000000a",
  activeOrganizationId: CLUB,
  allowedOrganizationIds: [CLUB],
  activeRole,
});

const seed = () => ({
  club: [{ id: CLUB, name: "ASD Alfa" }],
  athlete: [
    {
      id: MINORE,
      organization_id: CLUB,
      first_name: "Luca",
      last_name: "Rossi",
      birth_date: new Date("2015-04-02T00:00:00Z"),
      status: "active",
      data: { guardians: [{ name: "Maria", email: "maria@example.com" }] },
    },
    {
      id: MAGGIORENNE,
      organization_id: CLUB,
      first_name: "Anna",
      last_name: "Neri",
      birth_date: new Date("1996-04-02T00:00:00Z"),
      status: "active",
      data: {},
    },
  ],
  /* I tre indici polimorfi del mandato, piu i tre che la ricognizione ha aggiunto. */
  attachment: [
    {
      id: "att-1",
      organization_id: CLUB,
      owner_type: "athlete",
      owner_id: MINORE,
      category: "identity",
      file_name: "carta-identita.jpg",
      mime_type: "image/jpeg",
      size_bytes: 12,
      checksum: "abc",
      storage_driver: "database",
      storage_key: null,
      valid_from: null,
      valid_until: null,
      created_by: null,
      created_at: new Date("2026-01-01T00:00:00Z"),
      updated_at: new Date("2026-01-01T00:00:00Z"),
    },
    {
      id: "att-2",
      organization_id: CLUB,
      owner_type: "athlete",
      owner_id: MAGGIORENNE,
      category: "identity",
      file_name: "altro.jpg",
      mime_type: "image/jpeg",
      size_bytes: 12,
      checksum: "def",
      storage_driver: "database",
      storage_key: null,
      valid_from: null,
      valid_until: null,
      created_by: null,
      created_at: new Date("2026-01-01T00:00:00Z"),
      updated_at: new Date("2026-01-01T00:00:00Z"),
    },
  ],
  attachmentBlob: [
    { attachment_id: "att-1", content: Buffer.from("segreto") },
    { attachment_id: "att-2", content: Buffer.from("altro") },
  ],
  consentRecord: [
    {
      id: "con-1",
      organization_id: CLUB,
      definition_id: "def-1",
      version_id: "ver-1",
      subject_kind: "athlete",
      subject_id: MINORE,
      status: "accepted",
      decided_at: new Date("2026-01-01T00:00:00Z"),
      created_at: new Date("2026-01-01T00:00:00Z"),
    },
  ],
  documentRequest: [
    {
      id: "req-1",
      organization_id: CLUB,
      subject_kind: "athlete",
      subject_id: MINORE,
      document_kind: "identity",
      status: "pending",
    },
  ],
  documentSubmission: [
    {
      id: "sub-1",
      organization_id: CLUB,
      request_id: "req-1",
      subject_kind: "athlete",
      subject_id: MINORE,
      status: "pending",
      submitted_at: new Date("2026-02-01T00:00:00Z"),
    },
  ],
  generatedDocument: [
    {
      id: "gen-1",
      organization_id: CLUB,
      subject_kind: "athlete",
      subject_id: MINORE,
      subject_label: "Rossi Luca",
      template_id: "tpl-1",
    },
  ],
  formSubmission: [
    {
      id: "form-solo",
      organization_id: CLUB,
      subjects: [{ subject: "athlete", recordId: MINORE, label: "Rossi Luca" }],
      answers: { indirizzo: "Via Roma 1" },
      status: "approved",
    },
    {
      id: "form-condiviso",
      organization_id: CLUB,
      subjects: [
        { subject: "athlete", recordId: MINORE, label: "Rossi Luca" },
        { subject: "athlete", recordId: MAGGIORENNE, label: "Neri Anna" },
      ],
      answers: { note: "iscrizione doppia" },
      status: "approved",
    },
    {
      id: "form-altrui",
      organization_id: CLUB,
      subjects: [{ subject: "athlete", recordId: MAGGIORENNE, label: "Neri Anna" }],
      answers: {},
      status: "approved",
    },
  ],
  medicalCertificate: [
    {
      id: "cert-1",
      organization_id: CLUB,
      athlete_id: MINORE,
      expiry_date: new Date("2027-01-01T00:00:00Z"),
    },
  ],
  clubEventParticipant: [
    {
      id: "part-1",
      organization_id: CLUB,
      event_id: "ev-1",
      athlete_id: MINORE,
      convocation_status: "convocated",
    },
  ],
  athleteCategoryMembership: [
    { id: "mem-1", organization_id: CLUB, athlete_id: MINORE, category_id: "u12" },
  ],
  appointment: [
    {
      id: "app-1",
      organization_id: CLUB,
      athlete_id: MINORE,
      status: "confirmed",
    },
  ],
  paymentLink: [
    { id: "link-1", organization_id: CLUB, athlete_id: MINORE, payment_id: "p1" },
  ],
  communicationDelivery: [
    {
      id: "del-1",
      organization_id: CLUB,
      athlete_ids: [MINORE],
      recipient_name: "Maria Bianchi",
      recipient_email: "maria@example.com",
      recipient_user_id: null,
      status: "sent",
    },
    {
      id: "del-2",
      organization_id: CLUB,
      athlete_ids: [MAGGIORENNE],
      recipient_name: "Anna Neri",
      recipient_email: "anna@example.com",
      recipient_user_id: null,
      status: "sent",
    },
  ],
  /* Storia fiscale: si conserva, e va dichiarata a chi chiede la cancellazione. */
  athletePayment: [
    { id: "pay-1", organization_id: CLUB, athlete_id: MINORE, amount: 100 },
  ],
  paymentTransaction: [],
  invoice: [],
  receipt: [
    { id: "ric-1", organization_id: CLUB, athlete_id: MINORE, status: "issued" },
  ],
  fundingEnrollment: [],
  auditLog: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  dominio = await import("../../src/lib/server/data-subject.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const righe = (delegate) => fake.rows(delegate);

/* --------------------------------------------------------------- inventario */

test("il riepilogo conta cio che vive sui sei indici polimorfi", async () => {
  const inventario = await dominio.previewDataSubjectErasure(
    scope(),
    { subjectId: MINORE },
    ADESSO,
  );

  const per = (table) =>
    inventario.slices.find((slice) => slice.table === table);

  assert.equal(per("attachments").count, 1);
  assert.equal(per("consent_records").count, 1);
  assert.equal(per("document_requests").count, 1);
  assert.equal(per("document_submissions").count, 1);
  assert.equal(per("generated_documents").count, 1);
  assert.equal(per("form_submissions").count, 1);
  assert.equal(per("form_submissions (condivisi)").count, 1);
});

test("cio che si conserva compare con il motivo, non sparisce dal riepilogo", async () => {
  const inventario = await dominio.previewDataSubjectErasure(
    scope(),
    { subjectId: MINORE },
    ADESSO,
  );

  const conservati = inventario.slices.filter(
    (slice) => slice.disposal === "retain" && slice.count > 0,
  );

  assert.deepEqual(
    conservati.map((slice) => slice.table).sort(),
    ["athlete_payments", "receipts"],
  );
  for (const slice of conservati) {
    assert.ok(slice.reason, `${slice.table} deve dire perche resta`);
  }
});

test("un'anagrafica senza data di nascita si tratta come minore", async () => {
  righe("athlete").find((row) => row.id === MAGGIORENNE).birth_date = null;

  const inventario = await dominio.previewDataSubjectErasure(
    scope(),
    { subjectId: MAGGIORENNE },
    ADESSO,
  );

  assert.equal(inventario.isMinor, true);
});

test("una persona di un altro club non si legge", async () => {
  righe("athlete").find((row) => row.id === MINORE).organization_id = ALTRO_CLUB;

  await assert.rejects(
    dominio.previewDataSubjectErasure(scope(), { subjectId: MINORE }, ADESSO),
    /non trovata/i,
  );
});

test("il fascicolo completo non lo tratta chi non dirige il club", async () => {
  await assert.rejects(
    dominio.previewDataSubjectErasure(
      scope("trainer"),
      { subjectId: MINORE },
      ADESSO,
    ),
    /Accesso negato/,
  );
});

/* ------------------------------------------------------------------ export */

test("l'export trova cio che vive sui tre indici polimorfi del mandato", async () => {
  const esportato = await dominio.exportDataSubject(
    scope(),
    { subjectId: MINORE },
    ADESSO,
  );

  assert.deepEqual(
    esportato.sections.attachments.map((row) => row.id),
    ["att-1"],
  );
  assert.deepEqual(
    esportato.sections.consent_records.map((row) => row.id),
    ["con-1"],
  );
  assert.deepEqual(
    esportato.sections.form_submissions.map((row) => row.id).sort(),
    ["form-condiviso", "form-solo"],
  );
  /* Mai i byte: gli allegati escono come metadati. */
  assert.equal(esportato.sections.attachments[0].content, undefined);
});

test("l'export non porta fuori i dati di un'altra persona", async () => {
  const esportato = await dominio.exportDataSubject(
    scope(),
    { subjectId: MINORE },
    ADESSO,
  );

  assert.equal(
    esportato.sections.form_submissions.some((row) => row.id === "form-altrui"),
    false,
    "una compilazione che non lo nomina non e sua",
  );
  assert.equal(
    esportato.sections.communication_deliveries.some((row) => row.id === "del-2"),
    false,
    "il registro delle consegne di un'altra famiglia non esce di qui",
  );
  assert.equal(
    esportato.sections.attachments.some((row) => row.id === "att-2"),
    false,
  );
});

test("l'export lascia una riga di audit", async () => {
  await dominio.exportDataSubject(scope(), { subjectId: MINORE }, ADESSO);

  assert.deepEqual(
    righe("auditLog").map((row) => row.action),
    ["data_subject.exported"],
  );
});

/* ------------------------------------------------------------ cancellazione */

const cancella = async (extra = {}) => {
  const inventario = await dominio.previewDataSubjectErasure(
    scope(),
    { subjectId: MINORE },
    ADESSO,
  );

  return dominio.eraseDataSubject(
    scope(),
    {
      subjectId: MINORE,
      confirmationToken: inventario.confirmationToken,
      acknowledgeMinor: true,
      ...extra,
    },
    ADESSO,
  );
};

test("senza il gettone del riepilogo la cancellazione non parte", async () => {
  await assert.rejects(
    dominio.eraseDataSubject(
      scope(),
      { subjectId: MINORE, confirmationToken: "", acknowledgeMinor: true },
      ADESSO,
    ),
    /riepilogo/i,
  );

  assert.equal(righe("attachment").length, 2);
});

test("il dato di un minore non si cancella senza conferma esplicita", async () => {
  const inventario = await dominio.previewDataSubjectErasure(
    scope(),
    { subjectId: MINORE },
    ADESSO,
  );

  assert.equal(inventario.isMinor, true);

  await assert.rejects(
    dominio.eraseDataSubject(
      scope(),
      {
        subjectId: MINORE,
        confirmationToken: inventario.confirmationToken,
      },
      ADESSO,
    ),
    /minorenne/i,
  );
});

test("un gettone di un riepilogo superato non vale piu", async () => {
  const inventario = await dominio.previewDataSubjectErasure(
    scope(),
    { subjectId: MINORE },
    ADESSO,
  );

  righe("attachment").push({
    ...righe("attachment")[0],
    id: "att-3",
  });

  await assert.rejects(
    dominio.eraseDataSubject(
      scope(),
      {
        subjectId: MINORE,
        confirmationToken: inventario.confirmationToken,
        acknowledgeMinor: true,
      },
      ADESSO,
    ),
    /riepilogo/i,
  );
});

test("la cancellazione non lascia orfani su nessuno dei sei indici", async () => {
  await cancella();

  const orfani = [
    ["attachment", (row) => row.owner_id === MINORE],
    ["attachmentBlob", (row) => row.attachment_id === "att-1"],
    ["consentRecord", (row) => row.subject_id === MINORE],
    ["documentRequest", (row) => row.subject_id === MINORE],
    ["documentSubmission", (row) => row.subject_id === MINORE],
    ["medicalCertificate", (row) => row.athlete_id === MINORE],
    ["clubEventParticipant", (row) => row.athlete_id === MINORE],
    ["athleteCategoryMembership", (row) => row.athlete_id === MINORE],
    ["appointment", (row) => row.athlete_id === MINORE],
    ["paymentLink", (row) => row.athlete_id === MINORE],
  ];

  for (const [delegate, predicato] of orfani) {
    assert.equal(
      righe(delegate).filter(predicato).length,
      0,
      `${delegate} conserva righe che nessuno raggiunge piu`,
    );
  }

  /* Il modulo che riguarda solo lui sparisce; quello condiviso resta. */
  assert.deepEqual(
    righe("formSubmission").map((row) => row.id).sort(),
    ["form-altrui", "form-condiviso"],
  );
});

test("cio che non si cancella smette di nominare la persona", async () => {
  await cancella();

  assert.equal(
    righe("generatedDocument")[0].subject_label,
    dominio.ANONYMIZED_LABEL,
  );

  const condiviso = righe("formSubmission").find(
    (row) => row.id === "form-condiviso",
  );
  assert.deepEqual(
    condiviso.subjects.map((subject) => subject.recordId).sort(),
    ["", MAGGIORENNE].sort(),
  );

  const anagrafica = righe("athlete").find((row) => row.id === MINORE);
  assert.equal(anagrafica.first_name, dominio.ANONYMIZED_LABEL);
  assert.equal(anagrafica.birth_date, null);
  assert.deepEqual(anagrafica.data, { anonymizedAt: ADESSO.toISOString() });
});

test("la cancellazione non tocca i dati di un'altra persona", async () => {
  await cancella();

  assert.equal(righe("attachment").some((row) => row.id === "att-2"), true);
  assert.equal(
    righe("communicationDelivery").find((row) => row.id === "del-2")
      .recipient_email,
    "anna@example.com",
  );
  const altra = righe("athlete").find((row) => row.id === MAGGIORENNE);
  assert.equal(altra.first_name, "Anna");
});

test("la consegna gia partita resta, ma senza il destinatario", async () => {
  await cancella();

  const consegna = righe("communicationDelivery").find(
    (row) => row.id === "del-1",
  );
  assert.equal(consegna.recipient_email, null);
  assert.equal(consegna.recipient_name, dominio.ANONYMIZED_LABEL);
});

test("il rapporto dichiara cosa resta e cosa va riletto a mano", async () => {
  const rapporto = await cancella();

  assert.deepEqual(
    rapporto.retained.map((slice) => slice.table).sort(),
    ["athlete_payments", "receipts"],
  );
  assert.deepEqual(rapporto.manualReview.map((row) => row.id), [
    "form-condiviso",
  ]);
  assert.equal(rapporto.deleted.attachments, 1);
});

test("la cancellazione lascia una riga di audit con i conteggi", async () => {
  await cancella({ reason: "richiesta della famiglia" });

  const riga = righe("auditLog").find(
    (row) => row.action === "data_subject.erased",
  );
  assert.ok(riga, "manca la riga di audit della cancellazione");
  assert.equal(riga.outcome, "success");
  assert.equal(riga.metadata.minor, true);
  assert.equal(riga.metadata.reason, "richiesta della famiglia");
});

/* --------------------------------------------------------------- la guardia */

test("la guardia rifiuta di cancellare un'anagrafica con dati personali vivi", async () => {
  await assert.rejects(
    dominio.assertPersonalDataDisposed("athletes", MINORE),
    /non spariscono cancellando l'anagrafica/,
  );
});

test("dopo la cancellazione dei dati personali la guardia lascia passare", async () => {
  await cancella();

  await dominio.assertPersonalDataDisposed("athletes", MINORE);
});

test("la guardia non si applica alle risorse che non sono persone", async () => {
  await dominio.assertPersonalDataDisposed("payments", MINORE);
});
