import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Modulistica V2 — il servizio, a runtime.
 *
 * Tre cose vanno dimostrate, non affermate:
 *
 * 1. **l'isolamento multi-tenant.** Un modulo di iscrizione contiene nomi,
 *    date di nascita, codici fiscali e certificati medici di minorenni. Ogni
 *    operazione — elencare, leggere, modificare, pubblicare, approvare —
 *    viene provata dal club sbagliato e deve fallire con «Accesso negato»,
 *    che e la stringa da cui il route handler ricava il 403;
 * 2. **il versionamento.** Modificare un modulo gia compilato non deve
 *    cambiare cio che una compilazione di ieri significava;
 * 3. **che una compilazione non scriva da sola.** Fra l'invio e l'anagrafica
 *    c'e un'approvazione, e cio che l'approvazione scrive e esattamente cio
 *    che l'anteprima aveva mostrato.
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";

const scopeA = () => ({
  userId: "11111111-0000-4000-8000-00000000000a",
  activeOrganizationId: CLUB_A,
  allowedOrganizationIds: [CLUB_A],
});

const scopeB = () => ({
  userId: "22222222-0000-4000-8000-00000000000b",
  activeOrganizationId: CLUB_B,
  allowedOrganizationIds: [CLUB_B],
});

let forms;
let submissions;
let setPrismaClientForTests;
let fake;

before(async () => {
  forms = await import("../../src/lib/server/forms.ts");
  submissions = await import("../../src/lib/server/form-submissions.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const seed = () => ({
  club: [
    {
      id: CLUB_A,
      name: "ASD Alfa",
      logo_url: null,
      contact_email: "alfa@example.it",
      creator_id: scopeA().userId,
      organization_users: [],
    },
    {
      id: CLUB_B,
      name: "ASD Beta",
      logo_url: null,
      contact_email: null,
      creator_id: scopeB().userId,
      organization_users: [],
    },
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

/*
  Il doppio di Prisma non implementa le chiavi composte (`template_id_version`).
  Le poche letture che le usano vengono servite qui, cosi il test prova il
  codice vero invece di un percorso alternativo.
*/
const teachCompositeVersionLookup = () => {
  const delegate = fake.client.formTemplateVersion;
  const original = delegate.findUnique;
  delegate.findUnique = async (args = {}) => {
    const composite = args.where?.template_id_version;
    if (!composite) return original(args);
    return (
      fake
        .rows("formTemplateVersion")
        .find(
          (row) =>
            row.template_id === composite.template_id &&
            row.version === composite.version,
        ) || null
    );
  };
};

const createTemplate = async (scope = scopeA(), starter = "blank") => {
  teachCompositeVersionLookup();
  return forms.createFormTemplate(scope, { starter });
};

const schemaWithFields = (fields) => ({
  title: "Iscrizione",
  description: "",
  fields,
  settings: {
    successMessage: "Grazie",
    closeAt: "",
    collectRespondentEmail: false,
    notifyOnSubmit: false,
  },
});

const ATHLETE_FIELDS = [
  {
    id: "f_nome",
    type: "short_text",
    label: "Nome",
    binding: "athlete.firstName",
    required: true,
  },
  {
    id: "f_cognome",
    type: "short_text",
    label: "Cognome",
    binding: "athlete.lastName",
    required: true,
  },
  { id: "f_tel", type: "phone", label: "Telefono", binding: "guardian.phone" },
];

/* --------------------------------------------------- isolamento multi-tenant */

test("un modulo di un altro club non si legge", async () => {
  const created = await createTemplate();

  await assert.rejects(
    () => forms.getFormTemplate(scopeB(), created.id),
    /Accesso negato/,
  );
});

test("un modulo di un altro club non si modifica ne si pubblica", async () => {
  const created = await createTemplate();

  await assert.rejects(
    () => forms.updateFormTemplateDraft(scopeB(), created.id, created.draft),
    /Accesso negato/,
  );
  await assert.rejects(
    () => forms.publishFormTemplate(scopeB(), created.id),
    /Accesso negato/,
  );
  await assert.rejects(
    () => forms.deleteFormTemplate(scopeB(), created.id),
    /Accesso negato/,
  );
  await assert.rejects(
    () => forms.regenerateFormTemplateSlug(scopeB(), created.id),
    /Accesso negato/,
  );
});

test("l'elenco dei moduli filtra sempre per club", async () => {
  await createTemplate(scopeA());
  await createTemplate(scopeB());

  const listA = await forms.listFormTemplates(scopeA());
  const listB = await forms.listFormTemplates(scopeB());

  assert.equal(listA.length, 1);
  assert.equal(listB.length, 1);
  assert.equal(listA[0].organizationId, CLUB_A);

  const where = fake.lastCall("formTemplate", "findMany").args.where;
  assert.equal(where.organization_id, CLUB_B);
});

test("un club non puo chiedere l'elenco di un altro", async () => {
  await assert.rejects(
    () => forms.listFormTemplates(scopeA(), { organizationId: CLUB_B }),
    /Accesso negato/,
  );
});

/* ------------------------------------------------------------ link pubblico */

test("il link pubblico di un modulo nuovo non e indovinabile", async () => {
  const created = await createTemplate();

  assert.match(created.publicSlug, /-[0-9a-f]{12}$/);
  assert.equal(created.publicPath, `/forms/${created.publicSlug}`);
});

test("rigenerare il link fa smettere di rispondere quello vecchio", async () => {
  const created = await createTemplate(scopeA(), "online_enrollment");
  await forms.publishFormTemplate(scopeA(), created.id);
  const vecchio = created.publicSlug;

  const aggiornato = await forms.regenerateFormTemplateSlug(scopeA(), created.id);

  assert.notEqual(aggiornato.publicSlug, vecchio);
  assert.equal(await forms.findPublicFormBySlug(vecchio), null);
  assert.notEqual(await forms.findPublicFormBySlug(aggiornato.publicSlug), null);
});

test("una bozza non e raggiungibile dal link pubblico", async () => {
  const created = await createTemplate(scopeA(), "online_enrollment");

  assert.equal(await forms.findPublicFormBySlug(created.publicSlug), null);
});

test("un modulo pubblicato ma non pubblico risponde come se non esistesse", async () => {
  const created = await createTemplate(scopeA(), "online_enrollment");
  await forms.publishFormTemplate(scopeA(), created.id);
  await forms.setFormTemplatePublicAccess(scopeA(), created.id, false);

  assert.equal(await forms.findPublicFormBySlug(created.publicSlug), null);
});

test("un modulo chiuso per data non accetta piu risposte", async () => {
  const created = await createTemplate();
  await forms.updateFormTemplateDraft(scopeA(), created.id, {
    ...schemaWithFields(ATHLETE_FIELDS),
    settings: { closeAt: "2020-01-01T00:00:00.000Z" },
  });
  await forms.publishFormTemplate(scopeA(), created.id);

  assert.equal(await forms.findPublicFormBySlug(created.publicSlug), null);
});

test("uno slug che non esiste non rivela nulla", async () => {
  assert.equal(await forms.findPublicFormBySlug("modulo-000000000000"), null);
  assert.equal(await forms.findPublicFormBySlug(""), null);
});

/* -------------------------------------------------------------- versioni */

test("pubblicare crea la versione 1; modificare e ripubblicare crea la 2", async () => {
  const created = await createTemplate();
  await forms.updateFormTemplateDraft(
    scopeA(),
    created.id,
    schemaWithFields(ATHLETE_FIELDS),
  );

  const primaPubblicazione = await forms.publishFormTemplate(scopeA(), created.id);
  assert.equal(primaPubblicazione.publishedVersion, 1);
  assert.equal(primaPubblicazione.hasUnpublishedChanges, false);

  await forms.updateFormTemplateDraft(
    scopeA(),
    created.id,
    schemaWithFields([
      ...ATHLETE_FIELDS,
      { id: "f_note", type: "long_text", label: "Note" },
    ]),
  );

  const conModifiche = await forms.getFormTemplate(scopeA(), created.id);
  assert.equal(conModifiche.hasUnpublishedChanges, true);
  assert.equal(conModifiche.publishedVersion, 1, "il pubblico vede ancora la 1");

  const secondaPubblicazione = await forms.publishFormTemplate(scopeA(), created.id);
  assert.equal(secondaPubblicazione.publishedVersion, 2);
  assert.equal(fake.rows("formTemplateVersion").length, 2);
});

test("ripubblicare senza modifiche non crea una versione uguale alla precedente", async () => {
  const created = await createTemplate(scopeA(), "online_enrollment");

  await forms.publishFormTemplate(scopeA(), created.id);
  const seconda = await forms.publishFormTemplate(scopeA(), created.id);

  assert.equal(seconda.publishedVersion, 1);
  assert.equal(fake.rows("formTemplateVersion").length, 1);
});

test("una versione pubblicata non viene mai riscritta", async () => {
  const created = await createTemplate();
  await forms.updateFormTemplateDraft(
    scopeA(),
    created.id,
    schemaWithFields(ATHLETE_FIELDS),
  );
  await forms.publishFormTemplate(scopeA(), created.id);

  const primaVersione = JSON.stringify(
    fake.rows("formTemplateVersion")[0].schema_json,
  );

  await forms.updateFormTemplateDraft(
    scopeA(),
    created.id,
    schemaWithFields([
      { id: "f_nome", type: "short_text", label: "Nome e cognome" },
    ]),
  );
  await forms.publishFormTemplate(scopeA(), created.id);

  assert.equal(
    JSON.stringify(fake.rows("formTemplateVersion")[0].schema_json),
    primaVersione,
    "la versione 1 e cambiata: le risposte gia raccolte cambierebbero significato",
  );
});

test("un modulo senza campi da compilare non si pubblica", async () => {
  const created = await createTemplate();
  await forms.updateFormTemplateDraft(scopeA(), created.id, {
    title: "Solo un titolo",
    fields: [{ type: "section", label: "Dati" }],
  });

  await assert.rejects(
    () => forms.publishFormTemplate(scopeA(), created.id),
    /non si pubblica/,
  );
});

test("togliere dalla pubblicazione non cancella le versioni", async () => {
  const created = await createTemplate(scopeA(), "online_enrollment");
  await forms.publishFormTemplate(scopeA(), created.id);

  const bozza = await forms.setFormTemplateStatus(scopeA(), created.id, "draft");

  assert.equal(bozza.status, "draft");
  assert.equal(fake.rows("formTemplateVersion").length, 1);
  assert.equal(await forms.findPublicFormBySlug(created.publicSlug), null);
});

/* ----------------------------------------------------------- compilazione */

const publishedTemplate = async (fields = ATHLETE_FIELDS) => {
  const created = await createTemplate();
  await forms.updateFormTemplateDraft(
    scopeA(),
    created.id,
    schemaWithFields(fields),
  );
  return forms.publishFormTemplate(scopeA(), created.id);
};

test("una compilazione pubblica finisce in coda, non in anagrafica", async () => {
  const template = await publishedTemplate();

  const result = await submissions.submitPublicForm(template.publicSlug, {
    answers: { f_nome: "Mario", f_cognome: "Rossi", f_tel: "3331234567" },
    files: [],
  });

  assert.ok(result.submissionId);
  assert.equal(fake.rows("formSubmission").length, 1);
  assert.equal(fake.rows("formSubmission")[0].status, "pending");
  assert.equal(
    fake.rows("athlete").length,
    0,
    "nessuna scrittura in anagrafica prima dell'approvazione",
  );
});

test("una compilazione cita la versione con cui e stata compilata", async () => {
  const template = await publishedTemplate();
  await submissions.submitPublicForm(template.publicSlug, {
    answers: { f_nome: "Mario", f_cognome: "Rossi" },
    files: [],
  });

  const versionId = fake.rows("formTemplateVersion")[0].id;
  assert.equal(fake.rows("formSubmission")[0].version_id, versionId);
});

test("i campi obbligatori si controllano sul server", async () => {
  const template = await publishedTemplate();

  await assert.rejects(
    () =>
      submissions.submitPublicForm(template.publicSlug, {
        answers: { f_nome: "Mario" },
        files: [],
      }),
    (error) => {
      assert.equal(error.status, 422);
      assert.equal(error.fieldErrors.f_cognome, "Campo obbligatorio.");
      return true;
    },
  );
  assert.equal(fake.rows("formSubmission").length, 0);
});

test("non si compila un modulo che non e pubblicato", async () => {
  const created = await createTemplate(scopeA(), "online_enrollment");

  await assert.rejects(
    () =>
      submissions.submitPublicForm(created.publicSlug, {
        answers: {},
        files: [],
      }),
    /Modulo non disponibile/,
  );
});

test("un allegato per un campo che non e un allegato non si salva", async () => {
  const template = await publishedTemplate();

  await submissions.submitPublicForm(template.publicSlug, {
    answers: { f_nome: "Mario", f_cognome: "Rossi" },
    files: [
      {
        fieldId: "f_nome",
        fileName: "payload.pdf",
        mimeType: "application/pdf",
        content: Buffer.from("%PDF-"),
      },
    ],
  });

  assert.equal(
    fake.rows("attachment").length,
    0,
    "il modulo pubblico non deve diventare un servizio di hosting",
  );
  assert.deepEqual(fake.rows("formSubmission")[0].files, []);
});

test("un allegato accettato passa dal servizio allegati e appartiene al modulo", async () => {
  const template = await publishedTemplate([
    ...ATHLETE_FIELDS,
    { id: "f_doc", type: "file_upload", label: "Certificato" },
  ]);

  await submissions.submitPublicForm(template.publicSlug, {
    answers: { f_nome: "Mario", f_cognome: "Rossi" },
    files: [
      {
        fieldId: "f_doc",
        fileName: "certificato.pdf",
        mimeType: "application/pdf",
        content: Buffer.from("%PDF-1.4 contenuto"),
      },
    ],
  });

  const attachment = fake.rows("attachment")[0];
  assert.equal(attachment.organization_id, CLUB_A);
  assert.equal(attachment.owner_type, "form");
  assert.equal(attachment.owner_id, template.id);

  const file = fake.rows("formSubmission")[0].files[0];
  assert.equal(file.reference, `attachment:${attachment.id}`);
  assert.equal(
    fake.rows("attachmentBlob").length,
    1,
    "i byte stanno nella tabella dei blob, non nella compilazione",
  );
});

test("un formato non accettato dal modulo pubblico viene rifiutato", async () => {
  const template = await publishedTemplate([
    ...ATHLETE_FIELDS,
    { id: "f_doc", type: "file_upload", label: "Certificato" },
  ]);

  await assert.rejects(
    () =>
      submissions.submitPublicForm(template.publicSlug, {
        answers: { f_nome: "Mario", f_cognome: "Rossi" },
        files: [
          {
            fieldId: "f_doc",
            fileName: "foglio.xlsx",
            mimeType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            content: Buffer.from("PK"),
          },
        ],
      }),
    /formato non accettato/i,
  );
});

/* --------------------------------------------------------- coda e revisione */

const submitOne = async (template, answers, subjects = []) => {
  await submissions.submitPublicForm(template.publicSlug, { answers, files: [] });
  const row = fake.rows("formSubmission")[fake.rows("formSubmission").length - 1];
  if (subjects.length) row.subjects = subjects;
  /*
    Il doppio non risolve `include`: si allegano le relazioni alla riga, che e
    esattamente cio che Prisma restituirebbe.
  */
  row.template = { title: template.title };
  const version = fake
    .rows("formTemplateVersion")
    .find((entry) => entry.id === row.version_id);
  row.template_version = {
    version: version.version,
    schema_json: version.schema_json,
  };
  return row.id;
};

test("la coda della segreteria non mostra le compilazioni di un altro club", async () => {
  const template = await publishedTemplate();
  await submitOne(template, { f_nome: "Mario", f_cognome: "Rossi" });

  const elenco = await submissions.listFormSubmissions(scopeB());

  assert.equal(elenco.total, 0);
  assert.equal(
    fake.lastCall("formSubmission", "findMany").args.where.organization_id,
    CLUB_B,
  );
});

test("una compilazione di un altro club non si legge ne si approva", async () => {
  const template = await publishedTemplate();
  const id = await submitOne(template, { f_nome: "Mario", f_cognome: "Rossi" });

  await assert.rejects(
    () => submissions.reviewFormSubmission(scopeB(), id),
    /Accesso negato/,
  );
  await assert.rejects(
    () => submissions.decideFormSubmission(scopeB(), id, { decision: "approve" }),
    /Accesso negato/,
  );
});

test("la revisione dice cosa cambierebbe e cosa somiglia a una scheda esistente", async () => {
  fake.rows("athlete").push({
    id: "atleta-esistente",
    organization_id: CLUB_A,
    first_name: "Mario",
    last_name: "Rossi",
    birth_date: null,
    data: {},
  });

  const template = await publishedTemplate();
  const id = await submitOne(template, {
    f_nome: "Mario",
    f_cognome: "Rossi",
    f_tel: "3331234567",
  });

  const review = await submissions.reviewFormSubmission(scopeA(), id);

  const atleta = review.changeSet.subjects.find(
    (subject) => subject.subject === "athlete",
  );
  assert.equal(atleta.mode, "create");
  assert.equal(atleta.recordLabel, "Mario Rossi");

  assert.deepEqual(
    review.duplicates.map((duplicate) => duplicate.recordId),
    ["atleta-esistente"],
    "un omonimo va segnalato, non deciso al posto della segreteria",
  );
});

/* ------------------------------------------------------------ approvazione */

test("approvare crea l'atleta con i valori mostrati nell'anteprima", async () => {
  const template = await publishedTemplate();
  const id = await submitOne(template, {
    f_nome: "Mario",
    f_cognome: "Rossi",
    f_tel: "3331234567",
  });

  const esito = await submissions.decideFormSubmission(scopeA(), id, {
    decision: "approve",
  });

  const atleta = fake.rows("athlete")[0];
  assert.equal(atleta.organization_id, CLUB_A);
  assert.equal(atleta.first_name, "Mario");
  assert.equal(atleta.last_name, "Rossi");
  assert.deepEqual(atleta.data.guardians, [{ phone: "3331234567" }]);
  assert.equal(esito.submission.status, "approved");
  assert.ok(esito.applied.length > 0);
});

test("approvare collegando a un atleta esistente aggiorna invece di duplicare", async () => {
  fake.rows("athlete").push({
    id: "atleta-1",
    organization_id: CLUB_A,
    first_name: "Mario",
    last_name: "Rossi",
    birth_date: null,
    data: { phone: "" },
  });

  const template = await publishedTemplate([
    ATHLETE_FIELDS[0],
    ATHLETE_FIELDS[1],
    { id: "f_cf", type: "short_text", label: "CF", binding: "athlete.fiscalCode" },
  ]);
  const id = await submitOne(template, {
    f_nome: "Mario",
    f_cognome: "Rossi",
    f_cf: "RSSMRA85M01H501Q",
  });

  await submissions.decideFormSubmission(scopeA(), id, {
    decision: "approve",
    subjects: [
      { subject: "athlete", recordId: "atleta-1", label: "Mario Rossi" },
    ],
  });

  assert.equal(fake.rows("athlete").length, 1, "nessun duplicato creato");
  assert.equal(fake.rows("athlete")[0].data.fiscalCode, "RSSMRA85M01H501Q");
});

test("rifiutare non scrive niente in anagrafica", async () => {
  const template = await publishedTemplate();
  const id = await submitOne(template, { f_nome: "Mario", f_cognome: "Rossi" });

  const esito = await submissions.decideFormSubmission(scopeA(), id, {
    decision: "reject",
    note: "Iscrizione doppia",
  });

  assert.equal(esito.submission.status, "rejected");
  assert.equal(esito.applied.length, 0);
  assert.equal(fake.rows("athlete").length, 0);
});

test("una compilazione gia esaminata non si approva una seconda volta", async () => {
  const template = await publishedTemplate();
  const id = await submitOne(template, { f_nome: "Mario", f_cognome: "Rossi" });

  await submissions.decideFormSubmission(scopeA(), id, { decision: "approve" });

  await assert.rejects(
    () => submissions.decideFormSubmission(scopeA(), id, { decision: "approve" }),
    /gia stata esaminata/,
  );
  assert.equal(fake.rows("athlete").length, 1);
});

test("un dato di sola lettura non si scrive nemmeno approvando", async () => {
  const template = await publishedTemplate([
    ATHLETE_FIELDS[0],
    ATHLETE_FIELDS[1],
    {
      id: "f_cat",
      type: "short_text",
      label: "Categoria",
      binding: "athlete.categoryName",
    },
  ]);
  const id = await submitOne(template, {
    f_nome: "Mario",
    f_cognome: "Rossi",
    f_cat: "Serie A",
  });

  await submissions.decideFormSubmission(scopeA(), id, { decision: "approve" });

  assert.equal(fake.rows("athlete")[0].category_name, undefined);
});

test("gli allegati approvati restano gli stessi e si collegano alla scheda", async () => {
  const template = await publishedTemplate([
    ...ATHLETE_FIELDS,
    { id: "f_doc", type: "file_upload", label: "Certificato medico" },
  ]);

  await submissions.submitPublicForm(template.publicSlug, {
    answers: { f_nome: "Mario", f_cognome: "Rossi" },
    files: [
      {
        fieldId: "f_doc",
        fileName: "certificato.pdf",
        mimeType: "application/pdf",
        content: Buffer.from("%PDF-1.4"),
      },
    ],
  });

  const row = fake.rows("formSubmission")[0];
  row.template = { title: template.title };
  const version = fake.rows("formTemplateVersion")[0];
  row.template_version = {
    version: version.version,
    schema_json: version.schema_json,
  };

  const attachmentsPrima = fake.rows("attachment").length;
  await submissions.decideFormSubmission(scopeA(), row.id, {
    decision: "approve",
  });

  assert.equal(
    fake.rows("attachment").length,
    attachmentsPrima,
    "l'allegato non si ricarica: si collega",
  );

  const documenti = fake.rows("athlete")[0].data.enrollmentDocuments;
  assert.equal(documenti.length, 1);
  assert.match(documenti[0].fileUrl, /^attachment:/);
});

/* ----------------------------------------------------------- cancellazione */

test("un modulo senza compilazioni si cancella", async () => {
  const created = await createTemplate();

  const esito = await forms.deleteFormTemplate(scopeA(), created.id);

  assert.deepEqual(esito, { deleted: true, archived: false });
  assert.equal(fake.rows("formTemplate").length, 0);
});

test("un modulo con compilazioni si archivia, non si cancella", async () => {
  const template = await publishedTemplate();
  await submitOne(template, { f_nome: "Mario", f_cognome: "Rossi" });

  const esito = await forms.deleteFormTemplate(scopeA(), template.id);

  assert.deepEqual(esito, { deleted: false, archived: true });
  assert.equal(fake.rows("formTemplate")[0].status, "archived");
  assert.equal(
    fake.rows("formSubmission").length,
    1,
    "cancellare avrebbe reso illeggibile una risposta gia raccolta",
  );
});
