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
  activeRole: "owner",
  allowedOrganizationIds: [CLUB_A],
});

const scopeB = () => ({
  userId: "22222222-0000-4000-8000-00000000000b",
  activeOrganizationId: CLUB_B,
  activeRole: "owner",
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
      id: "f_maglia",
      type: "short_text",
      label: "Numero di maglia",
      binding: "athlete.jerseyNumber",
    },
  ]);
  const id = await submitOne(template, {
    f_nome: "Mario",
    f_cognome: "Rossi",
    f_maglia: "10",
  });

  await submissions.decideFormSubmission(scopeA(), id, { decision: "approve" });

  assert.equal(fake.rows("athlete")[0].jersey_number, undefined);
});

/* ------------------------------------------------------- sede e categoria */

/**
 * Le sedi e le categorie del club, per i test che le riguardano.
 *
 * Vengono messe **sul club**, non nel modulo: e proprio la separazione che
 * questi test devono provare. Il modulo dichiara «qui va la sede»; quale
 * sede sia possibile lo dice il club, e lo dice al momento in cui il modulo
 * viene aperto.
 */
const giveClubSitesAndCategories = (
  sites = [
    { id: "sede-nord", name: "Palestra Nord", active: true },
    { id: "sede-sud", name: "Palestra Sud", active: true },
  ],
  categories = [{ id: "cat-u14", name: "Under 14" }],
) => {
  const club = fake.rows("club").find((row) => row.id === CLUB_A);
  club.club_sites = sites;
  club.categories = categories;
};

const SITE_FIELD = {
  id: "f_sede",
  type: "dropdown",
  label: "Sede",
  binding: "athlete.siteId",
  options: [],
};

const CATEGORY_FIELD = {
  id: "f_cat",
  type: "dropdown",
  label: "Categoria",
  binding: "athlete.categoryName",
  options: [],
};

test("il modulo pubblico offre le sedi del club, non quelle scritte nel modulo", async () => {
  giveClubSitesAndCategories();

  const template = await publishedTemplate([
    ...ATHLETE_FIELDS,
    { ...SITE_FIELD, options: ["Sede inventata"] },
  ]);

  const match = await forms.findPublicFormBySlug(template.publicSlug);
  const sede = match.schema.fields.find((field) => field.id === "f_sede");

  assert.deepEqual(sede.options, ["Palestra Nord", "Palestra Sud"]);
});

test("approvare scrive l'identificativo della sede, non il nome scelto", async () => {
  giveClubSitesAndCategories();

  const template = await publishedTemplate([...ATHLETE_FIELDS, SITE_FIELD]);
  const id = await submitOne(template, {
    f_nome: "Mario",
    f_cognome: "Rossi",
    f_sede: "Palestra Sud",
  });

  await submissions.decideFormSubmission(scopeA(), id, { decision: "approve" });

  assert.equal(
    fake.rows("athlete")[0].data.siteId,
    "sede-sud",
    "il nome di una sede cambia, il suo identificativo no",
  );
});

test("approvare con una categoria iscrive l'atleta e colloca l'iscrizione nella sede", async () => {
  giveClubSitesAndCategories();

  const template = await publishedTemplate([
    ...ATHLETE_FIELDS,
    SITE_FIELD,
    CATEGORY_FIELD,
  ]);
  const id = await submitOne(template, {
    f_nome: "Mario",
    f_cognome: "Rossi",
    f_sede: "Palestra Nord",
    f_cat: "Under 14",
  });

  await submissions.decideFormSubmission(scopeA(), id, { decision: "approve" });

  const atleta = fake.rows("athlete")[0];
  assert.equal(atleta.category_id, "cat-u14");
  assert.equal(atleta.category_name, "Under 14");

  const iscrizioni = fake.rows("athleteCategoryMembership");
  assert.equal(iscrizioni.length, 1);
  assert.equal(iscrizioni[0].athlete_id, atleta.id);
  assert.equal(iscrizioni[0].category_id, "cat-u14");
  assert.equal(iscrizioni[0].site_id, "sede-nord");
  assert.equal(iscrizioni[0].organization_id, CLUB_A);
  assert.equal(iscrizioni[0].is_primary, true);
});

test("un club con una sede sola non chiede nulla e assegna comunque la sede", async () => {
  giveClubSitesAndCategories([
    { id: "sede-unica", name: "Palestra unica", active: true },
  ]);

  const template = await publishedTemplate([...ATHLETE_FIELDS, SITE_FIELD]);
  const match = await forms.findPublicFormBySlug(template.publicSlug);

  assert.equal(
    match.schema.fields.some((field) => field.id === "f_sede"),
    false,
    "con una sede sola la domanda non si pone",
  );

  const id = await submitOne(template, { f_nome: "Mario", f_cognome: "Rossi" });
  await submissions.decideFormSubmission(scopeA(), id, { decision: "approve" });

  assert.equal(fake.rows("athlete")[0].data.siteId, "sede-unica");
});

test("una sede che il club non ha non entra nemmeno approvando", async () => {
  giveClubSitesAndCategories();

  const template = await publishedTemplate([...ATHLETE_FIELDS, SITE_FIELD]);
  const id = await submitOne(template, { f_nome: "Mario", f_cognome: "Rossi" });

  /*
    La compilazione viene manomessa **dopo** la validazione, che e il caso
    peggiore: qualcuno con accesso alla riga scrive un identificativo di un
    altro club. L'approvazione non deve fidarsene.
  */
  const row = fake.rows("formSubmission")[0];
  row.answers = { ...row.answers, f_sede: "sede-di-un-altro-club" };

  await submissions.decideFormSubmission(scopeA(), id, { decision: "approve" });

  assert.equal(
    fake.rows("athlete")[0].data.siteId,
    undefined,
    "una sede sconosciuta non diventa una sede: resta non dichiarata",
  );
  assert.equal(fake.rows("athleteCategoryMembership").length, 0);
});

test("una sede scelta non sposta un'iscrizione gia collocata", async () => {
  giveClubSitesAndCategories();

  fake.rows("athlete").push({
    id: "atleta-1",
    organization_id: CLUB_A,
    first_name: "Mario",
    last_name: "Rossi",
    birth_date: null,
    data: {},
  });
  fake.rows("athleteCategoryMembership").push({
    id: "iscrizione-1",
    organization_id: CLUB_A,
    athlete_id: "atleta-1",
    category_id: "cat-u14",
    category_name: "Under 14",
    site_id: "sede-sud",
    is_primary: true,
  });

  const template = await publishedTemplate([...ATHLETE_FIELDS, SITE_FIELD]);
  const id = await submitOne(template, {
    f_nome: "Mario",
    f_cognome: "Rossi",
    f_sede: "Palestra Nord",
  });

  await submissions.decideFormSubmission(scopeA(), id, {
    decision: "approve",
    subjects: [
      { subject: "athlete", recordId: "atleta-1", label: "Mario Rossi" },
    ],
  });

  assert.equal(
    fake.rows("athleteCategoryMembership")[0].site_id,
    "sede-sud",
    "chi ha collocato quell'iscrizione ne sapeva piu di un modulo",
  );
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

/* -------------------------------------------- compilazione dalla segreteria */

const ATHLETE_ROW = {
  id: "atleta-1",
  organization_id: CLUB_A,
  first_name: "Mario",
  last_name: "Rossi",
  birth_date: null,
  data: {
    fiscalCode: "RSSMRA85M01H501Q",
    guardians: [
      { name: "Maria", surname: "Bianchi", relationship: "Madre", phone: "3331234567" },
      { name: "Luca", surname: "Rossi", relationship: "Padre", phone: "3339876543" },
    ],
  },
};

test("compilare dalla scheda precompila cio che EasyGame sa gia", async () => {
  fake.rows("athlete").push({ ...ATHLETE_ROW });
  const template = await publishedTemplate();

  const context = await submissions.buildCompileContext(scopeA(), {
    templateId: template.id,
    subjects: [
      { subject: "athlete", recordId: "atleta-1", label: "Mario Rossi" },
      { subject: "guardian", recordId: "0", label: "" },
    ],
  });

  assert.equal(context.answers.f_nome, "Mario");
  assert.equal(context.answers.f_cognome, "Rossi");
  assert.equal(context.answers.f_tel, "3331234567");
  assert.deepEqual(context.prefilledFieldIds.sort(), [
    "f_cognome",
    "f_nome",
    "f_tel",
  ]);
});

test("con piu tutori la scelta e esplicita, non si prende il primo", async () => {
  fake.rows("athlete").push({ ...ATHLETE_ROW });
  const template = await publishedTemplate();

  const context = await submissions.buildCompileContext(scopeA(), {
    templateId: template.id,
    subjects: [{ subject: "athlete", recordId: "atleta-1", label: "Mario Rossi" }],
  });

  assert.deepEqual(
    context.options.guardian.map((option) => [option.recordId, option.label]),
    [
      ["0", "Maria Bianchi"],
      ["1", "Luca Rossi"],
    ],
  );
  assert.equal(
    context.answers.f_tel,
    undefined,
    "nessun tutore scelto: nessun telefono precompilato",
  );
});

test("un soggetto che il modulo non nomina non viene nemmeno letto", async () => {
  fake.rows("athlete").push({ ...ATHLETE_ROW });
  const template = await publishedTemplate([
    { id: "f_note", type: "long_text", label: "Note", binding: "" },
  ]);

  const context = await submissions.buildCompileContext(scopeA(), {
    templateId: template.id,
    subjects: [{ subject: "athlete", recordId: "atleta-1", label: "Mario Rossi" }],
  });

  assert.deepEqual(context.selections, []);
  assert.deepEqual(context.answers, {});
});

test("non si prepara la compilazione di un modulo di un altro club", async () => {
  const template = await publishedTemplate();

  await assert.rejects(
    () =>
      submissions.buildCompileContext(scopeB(), { templateId: template.id }),
    /Accesso negato/,
  );
});

test("la compilazione interna finisce in coda come quella pubblica", async () => {
  fake.rows("athlete").push({ ...ATHLETE_ROW });
  const template = await publishedTemplate();

  await submissions.submitInternalForm(scopeA(), {
    templateId: template.id,
    answers: { f_nome: "Mario", f_cognome: "Rossi", f_tel: "3331234567" },
    files: [],
    subjects: [
      { subject: "athlete", recordId: "atleta-1", label: "Mario Rossi" },
      { subject: "guardian", recordId: "0", label: "Maria Bianchi" },
    ],
  });

  const row = fake.rows("formSubmission")[0];
  assert.equal(row.source, "internal");
  assert.equal(row.status, "pending");
  assert.equal(row.submitted_by, scopeA().userId);
  assert.equal(row.subjects[0].recordId, "atleta-1");
  assert.equal(
    fake.rows("athlete").length,
    1,
    "nemmeno la segreteria scrive senza passare dall'approvazione",
  );
});

test("un modulo mai pubblicato non si compila dalla scheda", async () => {
  const created = await createTemplate(scopeA(), "online_enrollment");

  await assert.rejects(
    () => submissions.buildCompileContext(scopeA(), { templateId: created.id }),
    /non e ancora pubblicato/,
  );
});

/* =========================================================================
 * Dodicesima tornata — chi viene avvisato di una compilazione pubblica
 * ========================================================================= */

/** Un modulo pubblicato che chiede di essere segnalato a ogni compilazione. */
const templateCheAvvisa = async () => {
  const created = await createTemplate();
  await forms.updateFormTemplateDraft(scopeA(), created.id, {
    ...schemaWithFields(ATHLETE_FIELDS),
    settings: {
      ...schemaWithFields(ATHLETE_FIELDS).settings,
      notifyOnSubmit: true,
    },
  });
  return forms.publishFormTemplate(scopeA(), created.id);
};

/**
 * **Una compilazione anonima non raggiunge la bacheca di tutto il club.**
 *
 * `notifyClub` prendeva `club.creator_id` piu **ogni riga** di
 * `organization_users`, senza filtro di ruolo — e quella tabella contiene
 * anche genitori e allenatori, perche il riscatto di un token di accesso ci
 * scrive dentro il ruolo che il token nomina.
 *
 * Erano tre cose insieme: il nome dichiarato da chi compila un modulo pubblico
 * diffuso a **tutte le famiglie** invece che alla sola segreteria; un canale
 * di testo verso quelle bacheche per chiunque conosca lo slug — che e il link
 * di iscrizione, e si da a tutti; e una richiesta che produce N email, con la
 * reputazione SMTP del club in gioco.
 */
test("della compilazione pubblica si avvisa chi puo esaminarla, non tutto il club", async () => {
  const template = await templateCheAvvisa();

  const SEGRETERIA = "99999999-0000-4000-8000-00000000000a";
  const GENITORE = "99999999-0000-4000-8000-00000000000b";
  const ALLENATORE = "99999999-0000-4000-8000-00000000000c";

  /*
    Il doppio di Prisma serve la relazione annidata dalla riga del club, non
    dalla tabella: `notifyClub` legge `club.organization_users`, e la si semina
    dove il codice la va a prendere.
  */
  const clubA = fake.rows("club").find((riga) => riga.id === CLUB_A);
  clubA.organization_users = [
    { user_id: SEGRETERIA, role: "staff" },
    { user_id: GENITORE, role: "parent" },
    { user_id: ALLENATORE, role: "trainer" },
  ];

  await submissions.submitPublicForm(template.publicSlug, {
    answers: { f_nome: "Mario", f_cognome: "Rossi", f_tel: "3331234567" },
    files: [],
    respondentName: "Mario Rossi",
  });

  const destinatari = new Set(
    fake.rows("notification").map((riga) => riga.user_id),
  );

  assert.ok(destinatari.has(SEGRETERIA), "la segreteria esamina le compilazioni");
  assert.equal(
    destinatari.has(GENITORE),
    false,
    "il nome di chi si iscrive non si diffonde alle altre famiglie",
  );
  assert.equal(
    destinatari.has(ALLENATORE),
    false,
    "un allenatore non esamina le compilazioni",
  );
});

/**
 * **Il nome entra come una riga sola e corta.**
 *
 * Arriva dal corpo di una richiesta anonima: senza a capo non puo fingersi un
 * messaggio del sistema, e accorciato non e piu lo spazio per scriverne uno.
 */
test("il nome del compilatore non porta a capo nella notifica", async () => {
  const template = await templateCheAvvisa();

  const clubPerNome = fake.rows("club").find((riga) => riga.id === CLUB_A);
  clubPerNome.organization_users = [
    { user_id: "99999999-0000-4000-8000-00000000000d", role: "staff" },
  ];

  await submissions.submitPublicForm(template.publicSlug, {
    answers: { f_nome: "Mario", f_cognome: "Rossi", f_tel: "3331234567" },
    files: [],
    respondentName: `Mario\n\nAVVISO DELLA SEGRETERIA: ${"x".repeat(200)}`,
  });

  const riga = fake.rows("notification").find((r) => r.type === "form_submission");
  assert.ok(riga, "la notifica deve esserci");
  assert.equal(
    /[\r\n]/.test(String(riga.message)),
    false,
    "nessun a capo: il messaggio resta una riga sola",
  );
  assert.ok(
    String(riga.message).length < 200,
    `il messaggio resta corto, misurato ${String(riga.message).length}`,
  );
});

/**
 * **Una firma e un'immagine, e il tipo si controlla.**
 *
 * Il controllo era saltato **del tutto** per i campi `signature`, con la
 * ragione giusta — una firma disegnata dal browser non passa dal selettore di
 * file, e confrontarla con l'elenco dei documenti (PDF, foto, scansioni) non
 * avrebbe senso. Ma «non quell'elenco» non vuol dire «nessun elenco»: chi
 * compila un modulo pubblico decide come si chiama la parte multipart, e
 * bastava nominarla come il campo firma per dichiarare qualunque tipo.
 *
 * Non ne usciva uno stored XSS — `createAttachment` rivalida su un elenco che
 * non contiene ne HTML ne SVG, e cio che non e visualizzabile in linea viene
 * servito come allegato con `nosniff` — ma allargava i tipi accettati da sette
 * a quindici passando da una porta che non doveva aprirsi.
 */
test("un campo firma accetta un'immagine e rifiuta il resto", async () => {
  const template = await publishedTemplate([
    ...ATHLETE_FIELDS,
    { id: "f_firma", type: "signature", label: "Firma" },
  ]);

  const invia = (mimeType, fileName) =>
    submissions.submitPublicForm(template.publicSlug, {
      answers: { f_nome: "Mario", f_cognome: "Rossi" },
      files: [
        { fieldId: "f_firma", fileName, mimeType, content: Buffer.from("x") },
      ],
    });

  // Il PNG e cio che produce davvero il pad di firma.
  const esito = await invia("image/png", "firma.png");
  assert.ok(esito.submissionId, "la firma vera deve passare");

  await assert.rejects(
    () => invia("application/pdf", "firma.pdf"),
    /firma deve essere un'immagine/i,
    "un tipo qualunque non passa piu dalla porta della firma",
  );
});

/* ------------------------------------------------ la presa in esame (B-H4) */

/*
  Due approvazioni della stessa compilazione producevano due schede: il
  controllo «e ancora pending?» stava in testa e il passaggio ad `approved`
  in coda. Contro Postgres lo misura la sonda (U-72); qui il doppio esegue le
  due chiamate **intrecciate** ai confini degli `await`, e la presa in esame
  — un `updateMany` condizionato — e atomica come in un database. Con la
  forma vecchia questo blocco e rosso: due schede.
*/

test("due approvazioni intrecciate producono una scheda sola", async () => {
  const template = await publishedTemplate();
  const id = await submitOne(template, { f_nome: "Mario", f_cognome: "Rossi" });

  const esiti = await Promise.allSettled([
    submissions.decideFormSubmission(scopeA(), id, { decision: "approve" }),
    submissions.decideFormSubmission(scopeA(), id, { decision: "approve" }),
  ]);

  assert.equal(esiti.filter((e) => e.status === "fulfilled").length, 1);
  assert.match(
    String(esiti.find((e) => e.status === "rejected")?.reason?.message),
    /gia in esame|gia stata esaminata/,
  );
  assert.equal(fake.rows("athlete").length, 1, "una scheda sola per lo stesso minore");
});

test("una compilazione presa in esame adesso si rifiuta; una presa vecchia si riprende", async () => {
  const template = await publishedTemplate();
  const id = await submitOne(template, { f_nome: "Mario", f_cognome: "Rossi" });
  const row = fake.rows("formSubmission").find((entry) => entry.id === id);

  row.reviewed_at = new Date();
  await assert.rejects(
    () => submissions.decideFormSubmission(scopeA(), id, { decision: "approve" }),
    /gia in esame/,
  );
  assert.equal(fake.rows("athlete").length, 0);

  /* Un processo caduto senza rilascio: dopo dieci minuti la pratica torna libera. */
  row.reviewed_at = new Date(Date.now() - 20 * 60_000);
  const esito = await submissions.decideFormSubmission(scopeA(), id, { decision: "approve" });

  assert.equal(esito.submission.status, "approved");
  assert.equal(fake.rows("athlete").length, 1);
});

test("una decisione fallita rilascia la presa: il tentativo successivo passa", async () => {
  const template = await publishedTemplate([
    { id: "f_genitore", type: "short_text", label: "Nome del genitore", binding: "guardian.name" },
  ]);
  const id = await submitOne(template, { f_genitore: "Anna" });

  /* Senza atleta scelto il genitore non sa a chi collegarsi: fallisce dopo la presa. */
  await assert.rejects(
    () => submissions.decideFormSubmission(scopeA(), id, { decision: "approve" }),
    /scegli o crea/,
  );
  const row = fake.rows("formSubmission").find((entry) => entry.id === id);
  assert.equal(row.status, "pending");
  assert.equal(row.reviewed_at, null, "la presa si rilascia");

  fake.rows("athlete").push({
    id: "atleta-1",
    organization_id: CLUB_A,
    first_name: "Mario",
    last_name: "Rossi",
    data: {},
  });
  const esito = await submissions.decideFormSubmission(scopeA(), id, {
    decision: "approve",
    subjects: [{ subject: "athlete", recordId: "atleta-1", label: "Mario Rossi" }],
  });
  assert.equal(esito.submission.status, "approved");
});
