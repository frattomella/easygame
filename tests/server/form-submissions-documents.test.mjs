import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * La modulistica pubblica che produce documenti e consensi (W3-F).
 *
 * **Cosa questo file esiste per dimostrare.** Fino a qui una spunta restava
 * dentro `form_submissions.answers` e una compilazione non produceva nessun
 * foglio. Adesso l'approvazione — e **solo** l'approvazione — puo registrare
 * un consenso e generare un documento. Quattro cose vanno provate, non
 * affermate:
 *
 * 1. **l'idempotenza, con due meccanismi diversi.** Riapprovare non produce un
 *    secondo documento (lo impedisce l'indice unico sul lotto) e non produce
 *    una seconda decisione di consenso (lo impedisce il controllo
 *    sull'evidenza, perche il registro dei consensi e append-only per scelta e
 *    un indice vieterebbe la riaccettazione, che e legittima);
 * 2. **un consenso rifiutato e un fatto**, non un'assenza: una casella non
 *    spuntata scrive `rejected`, perche «ha detto no» e «non gli e mai stato
 *    chiesto» sono due situazioni diverse davanti a chi contesta una foto;
 * 3. **niente fa fallire l'approvazione, e niente resta orfano.** Un modello
 *    non pubblicato, di un altro club, o un soggetto che il risolutore non
 *    trova: l'anagrafica viene scritta comunque, non nasce nessuna riga a
 *    meta, e l'esito lo dice;
 * 4. **il confine multi-tenant.** Una definizione di consenso o un modello di
 *    un'altra societa non si citano: il diniego contiene «Accesso negato»,
 *    oppure la chiave semplicemente non esiste in questo club.
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";

const UTENTE_A = "11111111-0000-4000-8000-00000000000a";
const UTENTE_B = "22222222-0000-4000-8000-00000000000b";

const scopeA = (activeRole = "owner") => ({
  userId: UTENTE_A,
  activeOrganizationId: CLUB_A,
  activeRole,
  allowedOrganizationIds: [CLUB_A],
});

const scopeB = (activeRole = "owner") => ({
  userId: UTENTE_B,
  activeOrganizationId: CLUB_B,
  activeRole,
  allowedOrganizationIds: [CLUB_B],
});

/** Lo scope dei consensi e dei documenti ha la stessa forma, nomi diversi. */
const documentScopeA = () => ({
  userId: UTENTE_A,
  activeOrganizationId: CLUB_A,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB_A],
  role: "owner",
});

const documentScopeB = () => ({
  userId: UTENTE_B,
  activeOrganizationId: CLUB_B,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB_B],
  role: "owner",
});

let forms;
let submissions;
let consents;
let documents;
let setPrismaClientForTests;
let fake;

before(async () => {
  forms = await import("../../src/lib/server/forms.ts");
  submissions = await import("../../src/lib/server/form-submissions.ts");
  consents = await import("../../src/lib/server/consents.ts");
  documents = await import("../../src/lib/server/document-templates.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const STAGIONE = {
  id: "s-2025",
  label: "2025/2026",
  startDate: "2025-09-01",
  endDate: "2026-06-30",
  status: "active",
  createdAt: "2025-08-01T00:00:00.000Z",
};

const club = (id, name) => ({
  id,
  slug: `slug-${id}`,
  name,
  business_name: `${name} ASD`,
  address: "Via dello Sport 10",
  city: "Roma",
  postal_code: "00100",
  province: "RM",
  fiscal_code: "12345678901",
  vat_number: "IT12345678901",
  contact_email: `info@${id}.it`,
  contact_phone: "+39 06 1234567",
  logo_url: null,
  payment_plans: [],
  club_sites: [],
  categories: [],
  settings: { seasons: [STAGIONE], activeSeasonId: STAGIONE.id },
  creator_id: id === CLUB_A ? UTENTE_A : UTENTE_B,
  organization_users: [],
});

beforeEach(() => {
  fake = createFakePrisma({ club: [club(CLUB_A, "ASD Alfa"), club(CLUB_B, "ASD Beta")] });
  setPrismaClientForTests(fake.client);
  insegnaChiaviComposte();
});

/*
  Il doppio di Prisma non implementa le chiavi composte. Servirle qui fa
  provare al test il codice vero — compreso l'`upsert` sul lotto, che e il
  meccanismo su cui poggia l'idempotenza del documento — invece di un percorso
  alternativo scritto per il test.
*/
const insegnaChiaviComposte = () => {
  const formVersions = fake.client.formTemplateVersion;
  const trovaFormVersion = formVersions.findUnique;
  formVersions.findUnique = async (args = {}) => {
    const composite = args.where?.template_id_version;
    if (!composite) return trovaFormVersion(args);
    return (
      fake
        .rows("formTemplateVersion")
        .find(
          (row) =>
            row.template_id === composite.template_id &&
            Number(row.version) === Number(composite.version),
        ) || null
    );
  };

  const docVersions = fake.client.documentTemplateVersion;
  const trovaDocVersion = docVersions.findUnique;
  docVersions.findUnique = async (args = {}) => {
    const composite = args.where?.template_id_version;
    if (!composite) return trovaDocVersion(args);
    return (
      fake
        .rows("documentTemplateVersion")
        .find(
          (row) =>
            row.template_id === composite.template_id &&
            Number(row.version) === Number(composite.version),
        ) || null
    );
  };

  const generated = fake.client.generatedDocument;
  const upsertOriginale = generated.upsert;
  generated.upsert = async (args = {}) => {
    const composite = args.where?.generated_documents_batch_subject;
    if (!composite) return upsertOriginale(args);
    const esistente = fake
      .rows("generatedDocument")
      .find(
        (row) =>
          row.organization_id === composite.organization_id &&
          row.batch_id === composite.batch_id &&
          row.subject_kind === composite.subject_kind &&
          row.subject_id === composite.subject_id,
      );
    if (esistente) return esistente;
    return generated.create({ data: args.create });
  };
};

/* ------------------------------------------------------------- il modulo */

const CAMPI = (consentKey = "images") => [
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
  {
    id: "f_consenso",
    type: "checkbox",
    label: "Autorizzo foto e video",
    consentKey,
  },
];

const moduloPubblicato = async ({
  fields = CAMPI(),
  documentTemplateId = "",
} = {}) => {
  const creato = await forms.createFormTemplate(scopeA(), { starter: "blank" });

  await forms.updateFormTemplateDraft(scopeA(), creato.id, {
    title: "Iscrizione 2026",
    description: "",
    fields,
    settings: {
      successMessage: "Grazie",
      closeAt: "",
      collectRespondentEmail: false,
      notifyOnSubmit: false,
      documentTemplateId,
    },
  });

  return forms.publishFormTemplate(scopeA(), creato.id);
};

/**
 * Invia una compilazione e le attacca le relazioni che `include` risolverebbe.
 *
 * E la stessa scorciatoia di `forms-service.test.mjs`: il doppio non risolve
 * `include`, e cio che si attacca qui e esattamente cio che Prisma
 * restituirebbe.
 */
const invia = async (template, answers) => {
  await submissions.submitPublicForm(template.publicSlug, { answers, files: [] });
  const righe = fake.rows("formSubmission");
  const row = righe[righe.length - 1];
  row.template = { title: template.title };
  const version = fake
    .rows("formTemplateVersion")
    .find((entry) => entry.id === row.version_id);
  row.template_version = {
    version: version.version,
    schema_json: version.schema_json,
  };
  return row;
};

/* ------------------------------------------------------- i due domini vicini */

const consensoAttivo = async (scope = scopeA(), key = "images") => {
  const definizione = await consents.createConsentDefinition(scope, {
    key,
    title: "Consenso immagini",
    description: "Foto e video dell'attivita sportiva",
    required: true,
  });

  await consents.publishConsentVersion(scope, definizione.id, {
    bodyText: "Autorizzo la pubblicazione di foto e video.",
  });

  return consents.getConsentDefinition(scope, definizione.id);
};

const modelloDocumento = async ({
  scope = documentScopeA(),
  subjectKind = "athlete",
  content = "<p>{{club.name}} — {{athlete.first_name}} {{athlete.last_name}}</p>",
  pubblica = true,
} = {}) => {
  const creato = await documents.createDocumentTemplate(scope, {
    title: "Dichiarazione di iscrizione",
    description: "Per la scuola",
    subjectKind,
    content,
  });

  return pubblica
    ? documents.publishDocumentTemplate(scope, creato.id)
    : creato;
};

/**
 * Rimette la compilazione in coda: e cosi che si prova un nuovo tentativo.
 *
 * Anche `reviewed_at` torna vuoto: su una riga `pending` quel campo e la
 * **presa in esame** (B-H4) — «qualcuno la sta scrivendo adesso» — e una
 * riga tornata in coda non e in mano a nessuno. Lasciarlo pieno modellerebbe
 * un'approvazione ancora in corso, che e proprio cio che il nuovo tentativo
 * deve trovare libero.
 */
const riapri = (submissionId) => {
  const row = fake
    .rows("formSubmission")
    .find((entry) => entry.id === submissionId);
  row.status = "pending";
  row.reviewed_at = null;
  return row;
};

const statoConsenso = (definitionId, subjectId) =>
  consents.getConsentStateForSubject(scopeA(), {
    definitionId,
    subjectKind: "athlete",
    subjectId,
  });

/* ============================================================ il caso vero */

test("approvare registra il consenso e genera il documento", async () => {
  const definizione = await consensoAttivo();
  const modello = await modelloDocumento();
  const template = await moduloPubblicato({
    documentTemplateId: modello.id,
  });

  const row = await invia(template, {
    f_nome: "Mario",
    f_cognome: "Rossi",
    f_consenso: true,
  });

  const esito = await submissions.decideFormSubmission(scopeA(), row.id, {
    decision: "approve",
  });

  assert.equal(esito.submission.status, "approved");
  assert.deepEqual(esito.issues, [], esito.issues.join(" | "));

  const atleta = fake.rows("athlete")[0];
  assert.equal(atleta.first_name, "Mario");

  /* Il consenso e uno stato della persona, e cita il testo pubblicato. */
  const record = fake.rows("consentRecord");
  assert.equal(record.length, 1);
  assert.equal(record[0].status, "accepted");
  assert.equal(record[0].subject_kind, "athlete");
  assert.equal(record[0].subject_id, atleta.id);
  assert.equal(record[0].version_id, definizione.publishedVersionId);
  assert.equal(record[0].source, "public_form");
  assert.equal(record[0].evidence_kind, "form_submission");
  assert.equal(record[0].evidence_id, row.id);

  const stato = await statoConsenso(definizione.id, atleta.id);
  assert.equal(stato.status, "accepted");

  /* Il documento e collegato alla persona e cita la versione del modello. */
  const documento = fake.rows("generatedDocument");
  assert.equal(documento.length, 1);
  assert.equal(documento[0].subject_kind, "athlete");
  assert.equal(documento[0].subject_id, atleta.id);
  assert.equal(documento[0].version_id, modello.versions[0].id);
  assert.ok(documento[0].content_html.includes("Mario"));

  /*
    Il riferimento che la compilazione conserva: non c'e una colonna, c'e un
    `batch_id` derivato dalla compilazione — che e anche il vincolo.
  */
  assert.equal(documento[0].batch_id, `form:${row.id}`);
  assert.equal(esito.generatedDocumentId, documento[0].id);
});

/* ------------------------------------------------------------ idempotenza */

test("riapprovare la stessa compilazione non crea un secondo documento ne una seconda decisione", async () => {
  const definizione = await consensoAttivo();
  const modello = await modelloDocumento();
  const template = await moduloPubblicato({ documentTemplateId: modello.id });

  const row = await invia(template, {
    f_nome: "Mario",
    f_cognome: "Rossi",
    f_consenso: true,
  });

  const primo = await submissions.decideFormSubmission(scopeA(), row.id, {
    decision: "approve",
  });

  /*
    Un nuovo tentativo: e cio che succede dopo un errore a meta, un
    ricaricamento della pagina, o un secondo clic.
  */
  riapri(row.id);
  const secondo = await submissions.decideFormSubmission(scopeA(), row.id, {
    decision: "approve",
  });

  assert.equal(fake.rows("generatedDocument").length, 1);
  assert.equal(secondo.generatedDocumentId, primo.generatedDocumentId);

  assert.equal(
    fake.rows("consentRecord").length,
    1,
    "due decisioni identiche sulla stessa evidenza sono un doppione, non uno storico",
  );

  const stato = await statoConsenso(
    definizione.id,
    fake.rows("athlete")[0].id,
  );
  assert.equal(stato.status, "accepted");
  assert.deepEqual(secondo.issues, [], secondo.issues.join(" | "));
});

test("una compilazione inviata due volte resta due compilazioni, ciascuna con il suo documento", async () => {
  const modello = await modelloDocumento();
  const template = await moduloPubblicato({
    fields: CAMPI(),
    documentTemplateId: modello.id,
  });
  await consensoAttivo();

  const prima = await invia(template, {
    f_nome: "Mario",
    f_cognome: "Rossi",
    f_consenso: true,
  });
  /*
    **La seconda deve essere davvero una seconda.** Da quando il doppio invio
    ha una chiave (`buildSubmissionDedupKey`), due compilazioni identiche dello
    stesso modulo a pochi secondi di distanza sono *lo stesso gesto* e ne resta
    una: qui il cognome corretto e cio che rende i due invii due fatti — che e
    esattamente la forma in cui una famiglia reinvia davvero, accorgendosi di
    un errore.
  */
  const seconda = await invia(template, {
    f_nome: "Mario",
    f_cognome: "Rossini",
    f_consenso: true,
  });

  assert.notEqual(prima.id, seconda.id);

  await submissions.decideFormSubmission(scopeA(), prima.id, {
    decision: "approve",
  });
  /*
    La seconda si collega all'atleta gia creato: e la segreteria a deciderlo,
    ed e il caso in cui due invii della stessa famiglia non devono diventare
    due atleti.
  */
  const atleta = fake.rows("athlete")[0];
  await submissions.decideFormSubmission(scopeA(), seconda.id, {
    decision: "approve",
    subjects: [{ subject: "athlete", recordId: atleta.id, label: "Mario Rossi" }],
  });

  assert.equal(fake.rows("athlete").length, 1);
  /*
    Due compilazioni sono due evidenze diverse: due documenti e due decisioni.
    L'idempotenza protegge dal **ripetere la stessa**, non dal registrare due
    fatti distinti.
  */
  assert.equal(fake.rows("generatedDocument").length, 2);
  assert.equal(fake.rows("consentRecord").length, 2);
});

test("lo stesso invio ripetuto identico resta una compilazione sola", async () => {
  /*
    Il rovescio del test qui sopra, e il difetto che la sonda di concorrenza
    della Wave 5 ha misurato: due invii **identici** producevano due pratiche
    `pending` e due copie di ogni allegato, che la segreteria si trovava in coda
    e doveva scartare a mano.
  */
  const template = await moduloPubblicato({ fields: CAMPI() });
  await consensoAttivo();

  const risposte = { f_nome: "Luca", f_cognome: "Bianchi", f_consenso: true };
  const prima = await invia(template, risposte);
  const ripetuta = await invia(template, { ...risposte });

  assert.equal(prima.id, ripetuta.id);
  assert.equal(fake.rows("formSubmission").length, 1);
});

/* ------------------------------------------------------- il consenso negato */

test("una casella non spuntata scrive un rifiuto, non un'assenza", async () => {
  const definizione = await consensoAttivo();
  const template = await moduloPubblicato();

  const row = await invia(template, { f_nome: "Mario", f_cognome: "Rossi" });

  const esito = await submissions.decideFormSubmission(scopeA(), row.id, {
    decision: "approve",
  });
  assert.deepEqual(esito.issues, [], esito.issues.join(" | "));

  const record = fake.rows("consentRecord");
  assert.equal(record.length, 1);
  assert.equal(record[0].status, "rejected");

  const stato = await statoConsenso(
    definizione.id,
    fake.rows("athlete")[0].id,
  );
  assert.equal(
    stato.status,
    "rejected",
    "«ha detto no» e «non gli e mai stato chiesto» non sono la stessa cosa",
  );
});

/* -------------------------------------- il documento che non si puo generare */

test("un modello non pubblicato non blocca l'approvazione, e l'esito lo dice", async () => {
  const modello = await modelloDocumento({ pubblica: false });
  const template = await moduloPubblicato({
    fields: CAMPI(),
    documentTemplateId: modello.id,
  });
  await consensoAttivo();

  const row = await invia(template, {
    f_nome: "Mario",
    f_cognome: "Rossi",
    f_consenso: true,
  });

  const esito = await submissions.decideFormSubmission(scopeA(), row.id, {
    decision: "approve",
  });

  assert.equal(esito.submission.status, "approved");
  assert.equal(fake.rows("athlete").length, 1, "l'anagrafica e il fatto principale");
  assert.equal(fake.rows("consentRecord").length, 1, "il consenso non dipende dal documento");
  assert.equal(fake.rows("generatedDocument").length, 0);
  assert.equal(esito.generatedDocumentId, null);
  assert.equal(esito.issues.length, 1);
  assert.match(esito.issues[0], /mai stato pubblicato/i);
});

test("un modello che parla di un altro soggetto non produce un foglio bianco", async () => {
  const modello = await modelloDocumento({
    subjectKind: "member",
    content: "<p>{{club.name}}</p>",
  });
  const template = await moduloPubblicato({
    fields: CAMPI(),
    documentTemplateId: modello.id,
  });

  const row = await invia(template, { f_nome: "Mario", f_cognome: "Rossi" });

  const esito = await submissions.decideFormSubmission(scopeA(), row.id, {
    decision: "approve",
  });

  assert.equal(fake.rows("generatedDocument").length, 0);
  assert.match(esito.issues.join(" "), /parla di «member»/);
});

test("se la generazione fallisce a meta non resta nessuna entita orfana", async () => {
  const modello = await modelloDocumento();
  const template = await moduloPubblicato({
    fields: CAMPI(),
    documentTemplateId: modello.id,
  });
  await consensoAttivo();

  const row = await invia(template, {
    f_nome: "Mario",
    f_cognome: "Rossi",
    f_consenso: true,
  });

  /*
    Il risolutore cade **dopo** che l'anagrafica e stata scritta e **prima** di
    `recordGeneratedDocument`: e il punto peggiore in cui cadere, ed e quello
    che non deve lasciare mezze righe.
  */
  const originale = fake.client.athletePayment.findMany;
  fake.client.athletePayment.findMany = async () => {
    throw new Error("Neon non risponde");
  };

  let esito;
  try {
    esito = await submissions.decideFormSubmission(scopeA(), row.id, {
      decision: "approve",
    });
  } finally {
    fake.client.athletePayment.findMany = originale;
  }

  assert.equal(esito.submission.status, "approved");
  assert.equal(fake.rows("athlete").length, 1);
  assert.equal(fake.rows("consentRecord").length, 1);
  assert.equal(fake.rows("generatedDocument").length, 0);
  assert.match(esito.issues.join(" "), /Documento non generato/);

  /* E il nuovo tentativo, quando il guasto passa, lo genera davvero. */
  riapri(row.id);
  const ripetuto = await submissions.decideFormSubmission(scopeA(), row.id, {
    decision: "approve",
  });

  assert.equal(fake.rows("generatedDocument").length, 1);
  assert.equal(fake.rows("consentRecord").length, 1, "il consenso non si riscrive");
  assert.deepEqual(ripetuto.issues, [], ripetuto.issues.join(" | "));
});

/* --------------------------------------------------------- multi-tenant */

test("un modulo non puo citare la definizione di consenso di un altro club", async () => {
  /* La chiave esiste — ma nell'altra societa. */
  await consensoAttivo(scopeB(), "images");
  const template = await moduloPubblicato();

  const row = await invia(template, {
    f_nome: "Mario",
    f_cognome: "Rossi",
    f_consenso: true,
  });

  const esito = await submissions.decideFormSubmission(scopeA(), row.id, {
    decision: "approve",
  });

  assert.equal(
    fake.rows("consentRecord").length,
    0,
    "il consenso di un'altra societa non si scrive citando la sua chiave",
  );
  assert.match(esito.issues.join(" "), /nessun consenso con chiave «images»/i);
  assert.equal(fake.rows("athlete").length, 1);
});

test("un modulo non puo citare il modello di documento di un altro club", async () => {
  const modelloAltrui = await modelloDocumento({ scope: documentScopeB() });
  const template = await moduloPubblicato({
    fields: CAMPI(),
    documentTemplateId: modelloAltrui.id,
  });

  const row = await invia(template, { f_nome: "Mario", f_cognome: "Rossi" });

  const esito = await submissions.decideFormSubmission(scopeA(), row.id, {
    decision: "approve",
  });

  assert.equal(fake.rows("generatedDocument").length, 0);
  assert.match(esito.issues.join(" "), /Accesso negato/);
});

test("il club e la persona non arrivano mai dal corpo della richiesta", async () => {
  const modello = await modelloDocumento();
  const template = await moduloPubblicato({
    fields: CAMPI(),
    documentTemplateId: modello.id,
  });

  /* Un atleta che esiste, ma nell'altra societa. */
  fake.rows("athlete").push({
    id: "atleta-di-beta",
    organization_id: CLUB_B,
    first_name: "Luca",
    last_name: "Bianchi",
    birth_date: null,
    data: {},
  });

  const row = await invia(template, { f_nome: "Mario", f_cognome: "Rossi" });

  /*
    Il corpo prova a collegare la compilazione a una persona di un altro club.
    La scrittura passa da `resources.ts`, che confronta il club della riga con
    lo scope: l'approvazione si ferma, e si ferma **prima** di scrivere.
  */
  await assert.rejects(
    () =>
      submissions.decideFormSubmission(scopeA(), row.id, {
        decision: "approve",
        subjects: [
          { subject: "athlete", recordId: "atleta-di-beta", label: "Luca Bianchi" },
        ],
      }),
    /Accesso negato/,
  );

  const bianchi = fake
    .rows("athlete")
    .find((entry) => entry.id === "atleta-di-beta");
  assert.equal(bianchi.first_name, "Luca", "la scheda dell'altro club e intatta");
  assert.equal(fake.rows("generatedDocument").length, 0);
  assert.equal(fake.rows("consentRecord").length, 0);
});

test("una compilazione di un altro club non si approva, e non produce niente", async () => {
  const modello = await modelloDocumento();
  await consensoAttivo();
  const template = await moduloPubblicato({
    fields: CAMPI(),
    documentTemplateId: modello.id,
  });

  const row = await invia(template, {
    f_nome: "Mario",
    f_cognome: "Rossi",
    f_consenso: true,
  });

  await assert.rejects(
    () =>
      submissions.decideFormSubmission(scopeB(), row.id, {
        decision: "approve",
      }),
    /Accesso negato/,
  );

  assert.equal(fake.rows("generatedDocument").length, 0);
  assert.equal(fake.rows("consentRecord").length, 0);
});

test("lo slug pubblico rigenerato non serve piu il vecchio link", async () => {
  const template = await moduloPubblicato();
  const vecchio = template.publicSlug;

  const rigenerato = await forms.regenerateFormTemplateSlug(scopeA(), template.id);

  assert.notEqual(rigenerato.publicSlug, vecchio);
  await assert.rejects(
    () =>
      submissions.submitPublicForm(vecchio, {
        answers: { f_nome: "Mario", f_cognome: "Rossi" },
        files: [],
      }),
    /Modulo non disponibile/,
  );
  assert.equal(fake.rows("formSubmission").length, 0);
});

test("un allegato estraneo citato fra i file non entra nella compilazione", async () => {
  const template = await moduloPubblicato();

  await submissions.submitPublicForm(template.publicSlug, {
    answers: { f_nome: "Mario", f_cognome: "Rossi" },
    files: [
      {
        /* `f_consenso` e una casella, non un allegato. */
        fieldId: "f_consenso",
        fileName: "estraneo.pdf",
        mimeType: "application/pdf",
        content: Buffer.from("%PDF-"),
      },
      {
        /* E questo campo nel modulo non esiste proprio. */
        fieldId: "f_inventato",
        fileName: "payload.pdf",
        mimeType: "application/pdf",
        content: Buffer.from("%PDF-"),
      },
    ],
  });

  assert.equal(fake.rows("attachment").length, 0);
  assert.deepEqual(fake.rows("formSubmission")[0].files, []);
});

/* ----------------------------------------------- la dichiarazione sul campo */

test("una chiave di consenso su un campo che non e una casella si scarta", async () => {
  const template = await moduloPubblicato({
    fields: [
      {
        id: "f_nome",
        type: "short_text",
        label: "Nome",
        binding: "athlete.firstName",
        required: true,
        /* Su un testo, «spuntato» non vuol dire niente. */
        consentKey: "images",
      },
      {
        id: "f_cognome",
        type: "short_text",
        label: "Cognome",
        binding: "athlete.lastName",
        required: true,
      },
    ],
  });
  await consensoAttivo();

  const row = await invia(template, { f_nome: "Mario", f_cognome: "Rossi" });
  const esito = await submissions.decideFormSubmission(scopeA(), row.id, {
    decision: "approve",
  });

  assert.equal(fake.rows("consentRecord").length, 0);
  assert.deepEqual(esito.issues, []);
});

test("una compilazione di un altro club non si approva affatto", async () => {
  /*
    **La mitigazione precedente era troppo gentile, e questo test la fotografa.**

    Il difetto e sempre lo stesso: il confine dei moduli era
    `allowedOrganizationIds` — tutti i club a cui l'utente appartiene — mentre
    `activeRole` e il ruolo del club **attivo**. Chi ha due societa poteva
    approvare una compilazione della prima tenendo attiva la seconda, e i due
    valori smettevano di parlare della stessa cosa.

    La Wave 3 aveva risposto **restringendo l'effetto**: l'approvazione riusciva
    lo stesso, e il documento sensibile non veniva generato. Era meglio di
    niente e non era il confine: una compilazione di un altro club veniva
    comunque **approvata**, cioe uno stato di quel club cambiava per mano di un
    ruolo che li non vale.

    Adesso non si entra affatto. Il confine e il club attivo, e sta in un solo
    posto — `src/lib/auth/active-club-boundary.ts` — per tutti i domini che
    prima se lo riscrivevano ognuno a modo suo.
  */
  const modello = await modelloDocumento({
    content: "<p>{{athlete.first_name}} — {{payment.total_paid}}</p>",
  });
  const template = await moduloPubblicato({ documentTemplateId: modello.id });
  const row = await invia(template, { f_nome: "Mario", f_cognome: "Rossi" });

  const scopeAltroveAttivo = {
    ...scopeA(),
    activeOrganizationId: CLUB_B,
    activeRole: "owner",
    allowedOrganizationIds: [CLUB_A, CLUB_B],
  };

  await assert.rejects(
    () =>
      submissions.decideFormSubmission(scopeAltroveAttivo, row.id, {
        decision: "approve",
      }),
    /Accesso negato/,
  );

  /* Niente e cambiato: ne lo stato della compilazione, ne un documento. */
  const dopo = fake.rows("formSubmission").find((riga) => riga.id === row.id);
  assert.equal(dopo.status, "pending");
  assert.equal(
    fake
      .rows("generatedDocument")
      .filter((riga) => riga.template_id === modello.id).length,
    0,
  );
});

test("il documento nato da un modulo porta il nome di chi lo riceve", async () => {
  /*
    L'intestazione si leggeva da `values["recipient.name"]`, cioe da una chiave
    della mappa dei segnaposto. Da quando la mappa esce filtrata alle sole
    chiavi **nominate dal modello** — perche gli importi di una famiglia non
    devono uscire da un documento che non li chiede — quella chiave in un
    modello che non la nomina non c'e piu, e l'intestazione cadeva sul ripiego.

    Il ripiego di solito e giusto. Ma non sempre: una compilazione che non
    porta nome e cognome — un modulo che raccoglie il solo consenso, o
    aggiorna un recapito — fa cadere l'etichetta del soggetto su un generico
    «Nuovo …» o sul vuoto, e `subject_label` tornava **null**. Il nome del
    destinatario esce quindi come campo proprio del risolutore, non come
    effetto collaterale della mappa.
  */
  await consensoAttivo();
  const modello = await modelloDocumento({
    content: "<p>{{athlete.first_name}} {{athlete.last_name}}</p>",
  });
  const template = await moduloPubblicato({ documentTemplateId: modello.id });

  const row = await invia(template, {
    f_nome: "Mario",
    f_cognome: "Rossi",
    f_consenso: true,
  });

  await submissions.decideFormSubmission(scopeA(), row.id, {
    decision: "approve",
  });

  const documento = fake.rows("generatedDocument")[0];

  /* La chiave non c'e — e va bene cosi: il modello non la nomina. */
  assert.equal(documento.values_snapshot["recipient.name"], undefined);
  assert.equal(
    documento.subject_label,
    "Mario Rossi",
    "l'intestazione non puo dipendere da una chiave che il modello non nomina",
  );
});
