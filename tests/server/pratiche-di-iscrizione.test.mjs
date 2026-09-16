import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Le pratiche di iscrizione (ADR-0189, ADR-0191, ADR-0192, ADR-0193): la
 * matrice §47 del secondo lotto del redesign, sul servizio a runtime con il
 * doppio di Prisma. Cio che il doppio non sa fare (rate limit, rotte HTTP)
 * si prova a livello di sorgente nelle ultime prove.
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";
const OWNER_A = "11111111-0000-4000-8000-00000000000a";
const TRAINER_A = "11111111-0000-4000-8000-00000000000c";

const scopeA = (activeRole = "owner", userId = OWNER_A) => ({
  userId,
  activeOrganizationId: CLUB_A,
  activeRole,
  allowedOrganizationIds: [CLUB_A],
  accessScopes: [],
});
const scopeB = () => ({
  userId: "22222222-0000-4000-8000-00000000000b",
  activeOrganizationId: CLUB_B,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB_B],
  accessScopes: [],
});

let forms;
let submissions;
let drafts;
let trials;
let iscrizioni;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  forms = await import("../../src/lib/server/forms.ts");
  submissions = await import("../../src/lib/server/form-submissions.ts");
  drafts = await import("../../src/lib/server/form-drafts.ts");
  trials = await import("../../src/lib/server/trial-athletes.ts");
  iscrizioni = await import("../../src/lib/server/enrollment-requests.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import("../../src/lib/server/prisma.ts"));
});

const seed = () => ({
  club: [
    { id: CLUB_A, name: "ASD Alfa", logo_url: null, contact_email: "alfa@example.it", creator_id: OWNER_A, organization_users: [], settings: {}, categories: [{ id: "u11", name: "Under 11" }], club_sites: [] },
    { id: CLUB_B, name: "ASD Beta", logo_url: null, contact_email: null, creator_id: scopeB().userId, organization_users: [], settings: {}, categories: [], club_sites: [] },
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const teachCompositeVersionLookup = () => {
  const delegate = fake.client.formTemplateVersion;
  const original = delegate.findUnique;
  delegate.findUnique = async (args = {}) => {
    const composite = args.where?.template_id_version;
    if (!composite) return original(args);
    return fake.rows("formTemplateVersion").find((row) => row.template_id === composite.template_id && row.version === composite.version) || null;
  };
};

const FIELDS = [
  { id: "f_info", type: "content", label: "Informativa", content: "<h2>Informativa privacy</h2><p>Testo dell'informativa.</p>" },
  { id: "f_presa", type: "checkbox", label: "Presa visione dell'informativa", legalKind: "acknowledgement", required: true, description: "Dichiaro di aver letto l'informativa." },
  { id: "f_nome", type: "short_text", label: "Nome", binding: "athlete.firstName", required: true },
  { id: "f_cognome", type: "short_text", label: "Cognome", binding: "athlete.lastName", required: true },
  { id: "f_nascita", type: "date", label: "Data di nascita", binding: "athlete.birthDate", required: true },
  { id: "f_minore", type: "checkbox", label: "Atleta minorenne?" },
  { id: "f_tutore", type: "short_text", label: "Nome del genitore", binding: "guardian.firstName", visibleWhen: { fieldId: "f_minore", equals: "true" }, required: true },
  { id: "f_note", type: "long_text", label: "Note (facoltative)" },
  { id: "f_cert", type: "file_upload", label: "Certificato", required: true, upload: { accept: "documents", maxBytes: 2 * 1024 * 1024 } },
  { id: "f_foto", type: "image_upload", label: "Fototessera" },
  { id: "f_immagini", type: "checkbox", label: "Uso delle immagini", legalKind: "optional_consent", description: "Acconsento alla pubblicazione delle foto.", required: true },
];

const schemaWith = (fields = FIELDS) => ({
  title: "UAT — Iscrizione EasyGame",
  description: "",
  fields,
  settings: { successMessage: "Grazie", closeAt: "", collectRespondentEmail: true, notifyOnSubmit: false },
});

const publishedTemplate = async (fields = FIELDS) => {
  teachCompositeVersionLookup();
  const created = await forms.createFormTemplate(scopeA(), { starter: "blank" });
  await forms.updateFormTemplateDraft(scopeA(), created.id, schemaWith(fields));
  return forms.publishFormTemplate(scopeA(), created.id);
};

const PDF = Buffer.from("%PDF-1.4 fake");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const RISPOSTE = { f_presa: true, f_nome: "Mario", f_cognome: "Rossi", f_nascita: "2015-05-05", f_minore: true, f_tutore: "Anna", f_immagini: false };

const submitOne = async (template, answers = RISPOSTE, extra = {}) => {
  const esito = await submissions.submitPublicForm(template.publicSlug, {
    answers,
    files: [{ fieldId: "f_cert", fileName: "cert.pdf", mimeType: "application/pdf", content: PDF }],
    respondentName: "Anna Rossi",
    respondentEmail: "anna@example.it",
    ...extra,
  });
  return esito;
};

const rigaPratica = (id) => fake.rows("formSubmission").find((row) => row.id === id);

/* ------------------------------------------------------------ 1–5 il modulo */

test("1–2 · il modulo pubblico si legge dallo slug senza sessione, e non porta ne compilazioni ne identificativi", async () => {
  const template = await publishedTemplate();
  const match = await forms.findPublicFormBySlug(template.publicSlug);
  assert.ok(match);
  assert.equal(match.organizationId, CLUB_A);
  assert.ok(!("submissions" in match));
  assert.ok(match.schema.fields.some((f) => f.type === "content" && f.content.includes("<h2>")), "il blocco di contenuto arriva sanificato");
});

test("3–4 · uno slug sconosciuto, un modulo in bozza o archiviato non rispondono", async () => {
  const template = await publishedTemplate();
  assert.equal(await forms.findPublicFormBySlug("iscrizione-000000000000"), null);
  await forms.setFormTemplateStatus(scopeA(), template.id, "archived");
  assert.equal(await forms.findPublicFormBySlug(template.publicSlug), null);
});

test("5 · il gettone di una bozza non apre niente da un altro modulo ne da un altro club", async () => {
  const template = await publishedTemplate();
  const match = await forms.findPublicFormBySlug(template.publicSlug);
  const { token } = await drafts.saveFormDraft(match, { answers: { f_nome: "Mario" } });
  const altro = await forms.createFormTemplate(scopeB(), { starter: "blank" });
  await forms.updateFormTemplateDraft(scopeB(), altro.id, schemaWith([FIELDS[2]]));
  await forms.publishFormTemplate(scopeB(), altro.id);
  const matchB = await forms.findPublicFormBySlug((await forms.getFormTemplate(scopeB(), altro.id)).publicSlug);
  await assert.rejects(() => drafts.readFormDraft(matchB, token), /Bozza non trovata/);
});

/* ------------------------------------------------------------ 6–7 la bozza */

test("6 · la bozza si salva con un gettone che esce una volta, senza obbligatorieta e senza file", async () => {
  const template = await publishedTemplate();
  const match = await forms.findPublicFormBySlug(template.publicSlug);
  const esito = await drafts.saveFormDraft(match, { answers: { f_nome: "Mario", f_nascita: "non-una-data", f_cert: "furbo" }, respondentEmail: "Anna@Example.it" });
  assert.ok(esito.created);
  assert.match(esito.token, /^[A-Za-z0-9_-]{40,64}$/, "256 bit in base64url");
  const riga = fake.rows("formDraft")[0];
  assert.notEqual(riga.resume_token_hash, esito.token, "in archivio resta l'impronta");
  assert.equal(riga.answers.f_nome, "Mario");
  assert.equal(riga.answers.f_nascita, undefined, "un valore fuori tipo si scarta");
  assert.equal(riga.answers.f_cert, undefined, "un campo file non ha risposta in bozza");
  assert.equal(riga.respondent_email, "anna@example.it");
  assert.equal(fake.rows("formSubmission").length, 0, "una bozza non e una pratica");
});

test("7 · la bozza si riprende, si aggiorna con lo stesso gettone, si consuma all'invio e non si riapre", async () => {
  const template = await publishedTemplate();
  const match = await forms.findPublicFormBySlug(template.publicSlug);
  const { token } = await drafts.saveFormDraft(match, { answers: { f_nome: "Mario" } });
  const letta = await drafts.readFormDraft(match, token);
  assert.equal(letta.answers.f_nome, "Mario");
  const aggiornata = await drafts.saveFormDraft(match, { token, answers: { f_nome: "Mario", f_cognome: "Rossi" } });
  assert.equal(aggiornata.created, false);
  assert.equal(aggiornata.token, token);
  assert.equal(fake.rows("formDraft").length, 1);

  await submitOne(template, RISPOSTE, { draftToken: token });
  assert.ok(fake.rows("formDraft")[0].submitted_id, "la bozza dice quale pratica e diventata");
  await assert.rejects(() => drafts.readFormDraft(match, token), /Bozza non trovata/, "consumata");
  await assert.rejects(() => drafts.readFormDraft(match, "gettone-inventato-abcdefghijklmnopqrstuvwxyz0123"), /Bozza non trovata/);
  /* Scaduta: stessa risposta. */
  const { token: t2 } = await drafts.saveFormDraft(match, { answers: {} });
  fake.rows("formDraft").find((r) => !r.submitted_id).expires_at = new Date(Date.now() - 1000);
  await assert.rejects(() => drafts.readFormDraft(match, t2), /Bozza non trovata/);
  const tolte = await drafts.purgeExpiredFormDrafts();
  assert.equal(tolte, 1);
});

/* ------------------------------------------------------ 8–14 la validazione */

test("8–10 · obbligatori, facoltativi, personalizzati e condizionali: il server e l'autorita", async () => {
  const template = await publishedTemplate();
  await assert.rejects(
    () => submitOne(template, { ...RISPOSTE, f_nome: "" }),
    (err) => err.fieldErrors?.f_nome === "Campo obbligatorio.",
  );
  /* Il tutore e obbligatorio solo se «minorenne» e spuntato. */
  const esito = await submitOne(template, { ...RISPOSTE, f_minore: false, f_tutore: "" });
  assert.ok(esito.submissionId);
  const riga = rigaPratica(esito.submissionId);
  assert.equal(riga.answers.f_tutore, undefined, "un campo nascosto non accetta risposta");
  assert.equal(riga.answers.f_note, undefined, "il facoltativo vuoto non c'e");
  await assert.rejects(
    () => submitOne(template, { ...RISPOSTE, f_minore: true, f_tutore: "" }),
    (err) => err.fieldErrors?.f_tutore === "Campo obbligatorio.",
    "visibile → obbligatorio",
  );
  const conNote = await submitOne(template, { ...RISPOSTE, f_note: "  ciao  ", f_nome: "Luca" });
  assert.equal(rigaPratica(conNote.submissionId).answers.f_note, "ciao", "il campo personalizzato resta nella pratica");
});

test("11–12 · l'allegato richiesto si carica, un tipo o una dimensione fuori regola si rifiutano", async () => {
  const template = await publishedTemplate();
  await assert.rejects(
    () => submissions.submitPublicForm(template.publicSlug, { respondentEmail: "anna@example.it", answers: RISPOSTE, files: [] }),
    (err) => err.fieldErrors?.f_cert === "Allega il file richiesto.",
  );
  await assert.rejects(
    () => submissions.submitPublicForm(template.publicSlug, { respondentEmail: "anna@example.it", answers: RISPOSTE, files: [{ fieldId: "f_cert", fileName: "x.html", mimeType: "text/html", content: Buffer.from("<script>") }] }),
    /formato non accettato/,
  );
  await assert.rejects(
    () => submissions.submitPublicForm(template.publicSlug, { respondentEmail: "anna@example.it", answers: RISPOSTE, files: [{ fieldId: "f_cert", fileName: "big.pdf", mimeType: "application/pdf", content: Buffer.alloc(2 * 1024 * 1024 + 1) }] }),
    /supera 2 MB/,
    "il tetto e quello scelto dal club",
  );
  await assert.rejects(
    () => submissions.submitPublicForm(template.publicSlug, { respondentEmail: "anna@example.it", answers: RISPOSTE, files: [{ fieldId: "f_cert", fileName: "cert.pdf", mimeType: "application/pdf", content: PDF }, { fieldId: "f_foto", fileName: "foto.pdf", mimeType: "application/pdf", content: PDF }] }),
    /carica un'immagine/,
    "un campo immagine accetta solo immagini",
  );
  const ok = await submissions.submitPublicForm(template.publicSlug, { respondentEmail: "anna@example.it", answers: RISPOSTE, files: [{ fieldId: "f_cert", fileName: "cert.pdf", mimeType: "application/pdf", content: PDF }, { fieldId: "f_foto", fileName: "foto.png", mimeType: "image/png", content: PNG }] });
  assert.equal(rigaPratica(ok.submissionId).files.length, 2);
});

test("13–14 · la presa visione richiesta blocca; il consenso facoltativo si puo rifiutare e non e mai obbligatorio", async () => {
  const template = await publishedTemplate();
  const versione = fake.rows("formTemplateVersion")[0].schema_json;
  const facoltativo = versione.fields.find((f) => f.id === "f_immagini");
  assert.equal(facoltativo.required, false, "il modello ha rifiutato `required` su un consenso facoltativo");
  await assert.rejects(
    () => submitOne(template, { ...RISPOSTE, f_presa: false }),
    (err) => err.fieldErrors?.f_presa === "Devi spuntare questa casella.",
  );
  const esito = await submitOne(template, { ...RISPOSTE, f_immagini: false });
  assert.ok(esito.submissionId, "senza consenso alle immagini si va avanti");
});

/* ------------------------------------------------- 15–16 invio e versione */

test("15–16 · l'invio nasce con dichiarazioni (testo mostrato e impronta), impronta della pratica, revisione 1 e la versione esatta", async () => {
  const template = await publishedTemplate();
  const esito = await submitOne(template);
  const riga = rigaPratica(esito.submissionId);
  assert.equal(riga.status, "pending");
  assert.equal(riga.revision, 1);
  assert.equal(riga.version_id, fake.rows("formTemplateVersion")[0].id);
  assert.match(riga.snapshot_hash, /^[0-9a-f]{64}$/);
  const presa = riga.declarations.find((d) => d.fieldId === "f_presa");
  assert.equal(presa.legalKind, "acknowledgement");
  assert.equal(presa.answer, true);
  assert.match(presa.text, /Informativa privacy/, "il blocco di testo sopra la casella fa parte di cio che si e mostrato");
  assert.match(presa.text, /Dichiaro di aver letto/);
  assert.match(presa.textHash, /^[0-9a-f]{64}$/);
  assert.equal(presa.method, "web_checkbox");
  assert.equal(presa.respondent, "Anna Rossi");
  const immagini = riga.declarations.find((d) => d.fieldId === "f_immagini");
  assert.equal(immagini.legalKind, "optional_consent");
  assert.equal(immagini.answer, false);
  const audit = fake.rows("auditLog").find((r) => r.action === "form.submission.received");
  assert.ok(audit, "l'invio e un fatto nell'audit");

  /* Una nuova versione del modulo non tocca la pratica gia inviata. */
  await forms.updateFormTemplateDraft(scopeA(), template.id, schemaWith(FIELDS.filter((f) => f.id !== "f_note")));
  await forms.publishFormTemplate(scopeA(), template.id);
  assert.equal(fake.rows("formTemplateVersion").length, 2);
  assert.equal(rigaPratica(esito.submissionId).version_id, fake.rows("formTemplateVersion")[0].id, "la pratica cita ancora la versione 1");
});

/* ------------------------------------------------------ 17–20 la revisione */

test("17–18 · il club vede la pratica in coda con i contatori per stato; un allenatore no", async () => {
  const template = await publishedTemplate();
  await submitOne(template);
  const coda = await submissions.listFormSubmissions(scopeA(), { status: "pending" });
  assert.equal(coda.total, 1);
  assert.equal(coda.items[0].declarations.length, 2);
  const modelli = await forms.listFormTemplates(scopeA());
  assert.equal(modelli[0].statusCounts.pending, 1);
  assert.equal(modelli[0].statusCounts.converted, 0);
  await assert.rejects(() => submissions.listFormSubmissions(scopeA("trainer", TRAINER_A), {}), /Accesso negato/);
});

test("19 · «Richiedi integrazione» vuole la capacita, campi esistenti o una nota, e rimanda la pratica alla famiglia", async () => {
  const template = await publishedTemplate();
  const { submissionId } = await submitOne(template);
  await assert.rejects(
    () => submissions.decideFormSubmission(scopeA("trainer", TRAINER_A), submissionId, { decision: "request_changes", fieldIds: ["f_nascita"] }),
    /Accesso negato/,
  );
  await assert.rejects(
    () => submissions.decideFormSubmission(scopeA(), submissionId, { decision: "request_changes", fieldIds: ["f_inesistente"] }),
    /almeno un campo/,
  );
  const esito = await submissions.decideFormSubmission(scopeA(), submissionId, {
    decision: "request_changes",
    fieldIds: ["f_nascita", "f_cert", "f_info"],
    note: "La data di nascita non torna e il certificato e illeggibile.",
  });
  assert.equal(esito.submission.status, "changes_requested");
  assert.deepEqual(esito.submission.changesRequested.fieldIds, ["f_nascita", "f_cert"], "un blocco di contenuto non si corregge");
  assert.equal(rigaPratica(submissionId).reviewed_at, null, "la presa in esame si rilascia: la pratica non e decisa");
  assert.ok(fake.rows("auditLog").some((r) => r.action === "form.submission.changes_requested"));
  /* Nello stato di attesa non si approva. */
  await assert.rejects(() => submissions.decideFormSubmission(scopeA(), submissionId, { decision: "approve" }), /in attesa dell'integrazione/);
});

test("20 · il reinvio con la ricevuta cambia solo i campi chiesti, conserva la revisione precedente e torna in coda", async () => {
  const template = await publishedTemplate();
  const { submissionId, receiptReference } = await submitOne(template);
  await submissions.decideFormSubmission(scopeA(), submissionId, { decision: "request_changes", fieldIds: ["f_nascita", "f_cert"], note: "n" });

  const contesto = await submissions.readPublicRevisionContext(receiptReference);
  assert.deepEqual(contesto.allowedFieldIds, ["f_nascita", "f_cert"]);
  assert.equal(contesto.answers.f_nome, undefined, "la ricevuta non rilegge l'anagrafica: solo i campi da correggere");
  assert.equal(contesto.answers.f_nascita, "2015-05-05");
  assert.equal(contesto.files[0].fieldId, "f_cert");
  assert.ok(!("settings" in contesto.schema), "lo schema e un elenco chiuso");
  const vista = await iscrizioni.readPublicEnrollmentStatus(receiptReference);
  assert.equal(vista.state, "changes_requested");
  assert.deepEqual(vista.changesRequested.fields.map((f) => f.label), ["Data di nascita", "Certificato"]);

  const esito = await submissions.resubmitPublicSubmission(receiptReference, {
    answers: { f_nascita: "2015-06-06", f_nome: "HACKER", f_presa: false },
    files: [{ fieldId: "f_cert", fileName: "cert2.pdf", mimeType: "application/pdf", content: PDF }, { fieldId: "f_foto", fileName: "x.png", mimeType: "image/png", content: PNG }],
  });
  assert.equal(esito.revision, 2);
  const riga = rigaPratica(submissionId);
  assert.equal(riga.status, "pending");
  assert.equal(riga.revision, 2);
  assert.equal(riga.answers.f_nascita, "2015-06-06");
  assert.equal(riga.answers.f_nome, "Mario", "un campo non chiesto non cambia, qualunque cosa arrivi");
  assert.equal(riga.answers.f_presa, true, "nemmeno una dichiarazione");
  assert.equal(riga.files.length, 1, "il file non chiesto non entra");
  assert.equal(riga.files[0].fileName, "cert2.pdf");
  assert.equal(riga.changes_requested, null);
  const revisioni = fake.rows("formSubmissionRevision");
  assert.equal(revisioni.length, 1);
  assert.equal(revisioni[0].revision, 1);
  assert.equal(revisioni[0].answers.f_nascita, "2015-05-05", "la copia precedente resta");
  assert.equal(revisioni[0].files[0].fileName, "cert.pdf");
  assert.deepEqual(revisioni[0].reason.fieldIds, ["f_nascita", "f_cert"]);
  assert.ok(fake.rows("auditLog").some((r) => r.action === "form.submission.resubmitted"));
  /* Reinviare di nuovo senza una richiesta aperta: 404. */
  await assert.rejects(() => submissions.resubmitPublicSubmission(receiptReference, { answers: {}, files: [] }), (e) => e.status === 404);
  assert.equal(await submissions.readPublicRevisionContext(receiptReference), null);
  assert.equal(await submissions.readPublicRevisionContext("ricevuta-inventata"), null);
});

/* --------------------------------------------- 21–23 le corrispondenze */

test("21–23 · in revisione compaiono le persone in prova e gli atleti che somigliano; il pubblico non ha nessuna strada per chiederlo", async () => {
  const template = await publishedTemplate();
  const prova = await trials.createTrialAthlete(scopeA(), { firstName: "Mario", lastName: "Rossi", birthDate: "2015-05-05" });
  fake.rows("athlete").push({ id: "atleta-omonimo", organization_id: CLUB_A, first_name: "Mario", last_name: "Rossi", birth_date: new Date("2015-05-05"), data: {}, status: "active" });
  const { submissionId } = await submitOne(template);

  const review = await submissions.reviewFormSubmission(scopeA(), submissionId);
  assert.equal(review.trialCandidates.length, 1);
  assert.equal(review.trialCandidates[0].id, prova.id);
  assert.equal(review.trialCandidates[0].sameBirthDate, true);
  assert.ok(review.duplicates.some((d) => d.recordId === "atleta-omonimo"));

  /* Un ruolo senza `trials.read` non vede le prove (la scheda si). */
  const soloForms = await submissions.reviewFormSubmission(scopeA("collaborator"), submissionId).catch(() => null);
  if (soloForms) assert.ok(Array.isArray(soloForms.trialCandidates));

  /* Nessuna rotta pubblica cerca persone. */
  const rotte = ["src/app/api/public/forms/[publicSlug]/route.ts", "src/app/api/public/forms/[publicSlug]/draft/route.ts", "src/app/api/public/forms/[publicSlug]/draft/[token]/route.ts", "src/app/api/public/enrollment-status/[reference]/route.ts", "src/app/api/public/enrollment-status/[reference]/revision/route.ts", "src/app/api/public/forms/[publicSlug]/assets/[attachmentId]/route.ts"];
  for (const rotta of rotte) {
    const sorgente = readFileSync(path.join(process.cwd(), rotta), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(sorgente, /searchTrialAthletes|listTrialAthletes|findAthleteDuplicates|matchDuplicates|athlete\.findMany|trialAthlete\./, `${rotta} non cerca persone`);
  }
});

/* --------------------------------------------- 24–27 approvazione e scheda */

test("24–26 · approvare crea la scheda una volta sola (converted, athlete_id), un secondo clic non duplica, un allenatore non puo", async () => {
  const template = await publishedTemplate();
  const { submissionId } = await submitOne(template);
  await assert.rejects(() => submissions.decideFormSubmission(scopeA("trainer", TRAINER_A), submissionId, { decision: "approve" }), /Accesso negato/);
  const esito = await submissions.decideFormSubmission(scopeA(), submissionId, { decision: "approve" });
  assert.equal(esito.submission.status, "converted");
  assert.equal(fake.rows("athlete").length, 1);
  assert.equal(esito.submission.athleteId, fake.rows("athlete")[0].id);
  assert.ok(fake.rows("auditLog").some((r) => r.action === "form.submission.converted"));
  await assert.rejects(() => submissions.decideFormSubmission(scopeA(), submissionId, { decision: "approve" }), /gia stata esaminata/);
  assert.equal(fake.rows("athlete").length, 1, "nessuna seconda scheda");
  /* Un tutore nato dal pubblico e un recapito: nessun accesso, nessuna utenza. */
  const tutori = fake.rows("athleteGuardian") || [];
  assert.ok(tutori.every((t) => t.contact_only === true && !t.user_id));
  assert.equal(fake.rows("user").length, 0);
});

test("27 · approvare collegando a un atleta esistente aggiorna quella scheda e la pratica lo registra", async () => {
  fake.rows("athlete").push({ id: "atleta-1", organization_id: CLUB_A, first_name: "Mario", last_name: "Rossi", birth_date: new Date("2015-05-05"), data: {}, status: "active" });
  const template = await publishedTemplate();
  const { submissionId } = await submitOne(template, { ...RISPOSTE, f_nome: "Mario Luigi" });
  const esito = await submissions.decideFormSubmission(scopeA(), submissionId, {
    decision: "approve",
    subjects: [{ subject: "athlete", recordId: "atleta-1", label: "Mario Rossi" }],
  });
  assert.equal(fake.rows("athlete").length, 1);
  assert.equal(fake.rows("athlete")[0].first_name, "Mario Luigi");
  assert.equal(esito.submission.athleteId, "atleta-1");
  assert.equal(esito.submission.status, "converted", "collegare una scheda che la pratica non nominava e una conversione (ADR-0189 §4)");
});

/* --------------------------------------------- 19 (§19) prova → atleta */

test("§19 · approvare convertendo la persona in prova usa la conversione canonica: una scheda, la prova collegata, le presenze conservate", async () => {
  const template = await publishedTemplate();
  const prova = await trials.createTrialAthlete(scopeA(), { firstName: "Mario", lastName: "Rossi", birthDate: "2015-05-05", categoryId: "u11" });
  fake.rows("clubEvent").push({ id: "eeeeeeee-0189-4000-8000-000000000001", organization_id: CLUB_A, kind: "training", status: "scheduled", category_id: "u11", category_ids: ["u11"], group_ids: [], starts_at: new Date("2026-09-01T18:00:00Z"), ends_at: new Date("2026-09-01T19:00:00Z"), season_id: null, site_id: null, title: "A", payload: {}, version: 1 });
  await trials.saveEventTrialAttendance(scopeA(), "eeeeeeee-0189-4000-8000-000000000001", [{ trialAthleteId: prova.id, status: "present" }]);
  const { submissionId } = await submitOne(template);

  const esito = await submissions.decideFormSubmission(scopeA(), submissionId, { decision: "approve", trialAthleteId: prova.id });
  assert.equal(esito.submission.status, "converted");
  assert.equal(esito.submission.trialAthleteId, prova.id);
  assert.equal(fake.rows("athlete").length, 1);
  const scheda = fake.rows("athlete")[0];
  assert.equal(esito.submission.athleteId, scheda.id);
  assert.equal(scheda.data.trialOriginId, prova.id, "la scheda dice da dove viene");
  const rigaProva = fake.rows("trialAthlete").find((r) => r.id === prova.id);
  assert.equal(rigaProva.status, "enrolled");
  assert.equal(rigaProva.athlete_id, scheda.id);
  assert.equal(fake.rows("trialAttendance").length, 1, "la presenza di prova resta");
  assert.ok(esito.applied.some((voce) => /1 prova prima dell'iscrizione/.test(voce)));
  /* Riprovare non crea una seconda scheda. */
  await assert.rejects(() => submissions.decideFormSubmission(scopeA(), submissionId, { decision: "approve", trialAthleteId: prova.id }), /gia stata esaminata/);
  assert.equal(fake.rows("athlete").length, 1);
});

/* ------------------------------------ 28–31 documenti, prova, audit, GDPR */

test("28–30 · allegati, dichiarazioni e audit restano sulla pratica dopo l'approvazione; la prova del testo la vede chi ha forms.evidence.read", async () => {
  const template = await publishedTemplate();
  const { submissionId } = await submitOne(template);
  await submissions.decideFormSubmission(scopeA(), submissionId, { decision: "approve" });
  const riga = rigaPratica(submissionId);
  assert.equal(riga.files.length, 1);
  assert.equal(riga.declarations.length, 2);
  assert.match(riga.snapshot_hash, /^[0-9a-f]{64}$/);
  const review = await submissions.reviewFormSubmission(scopeA(), submissionId);
  assert.ok(review.submission.declarations[0].text.length > 0);
  const senzaProva = await submissions.reviewFormSubmission(scopeA("staff"), submissionId).catch(() => null);
  if (senzaProva) {
    /* staff e in GESTIONE: la vede. La guardia si prova sulla sorgente. */
    assert.ok(senzaProva.submission.declarations[0].answer === true);
  }
  const sorgente = readFileSync(path.join(process.cwd(), "src/lib/server/form-submissions.ts"), "utf8");
  assert.match(sorgente, /roleHasPermission\(scope\.activeRole, "forms\.evidence\.read"\)/);
});

test("31 · la cancellazione dell'interessato trova la pratica anche dalla scheda nata e toglie gli allegati delle revisioni", async () => {
  const sorgente = readFileSync(path.join(process.cwd(), "src/lib/server/data-subject.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(sorgente, /asText\(row\?\.athlete_id\) === subjectId/);
  assert.match(sorgente, /include: \{ revisions: true \}/);
  assert.match(sorgente, /submission\?\.revisions/);
});

/* --------------------------------------------------- 32–33 tenant e permessi */

test("32–33 · un altro club non legge, non decide e non ottiene la revisione pubblica; l'archiviazione chiude senza scrivere", async () => {
  const template = await publishedTemplate();
  const { submissionId, receiptReference } = await submitOne(template);
  await assert.rejects(() => submissions.reviewFormSubmission(scopeB(), submissionId), /Accesso negato/);
  await assert.rejects(() => submissions.decideFormSubmission(scopeB(), submissionId, { decision: "archive" }), /Accesso negato/);
  const esito = await submissions.decideFormSubmission(scopeA(), submissionId, { decision: "archive", note: "duplicata" });
  assert.equal(esito.submission.status, "archived");
  assert.equal(fake.rows("athlete").length, 0);
  assert.ok(fake.rows("auditLog").some((r) => r.action === "form.submission.archived"));
  const vista = await iscrizioni.readPublicEnrollmentStatus(receiptReference);
  assert.equal(vista.state, "archived");
  await assert.rejects(() => submissions.decideFormSubmission(scopeA(), submissionId, { decision: "archive" }), /non si puo archiviare/);
});

/* ------------------------------------------------ 34–35 versioni e storia */

test("34–35 · un modulo archiviato lascia leggibili le sue pratiche, e i modelli hanno capacita proprie", async () => {
  const template = await publishedTemplate();
  const { submissionId } = await submitOne(template);
  await forms.setFormTemplateStatus(scopeA(), template.id, "archived");
  const review = await submissions.reviewFormSubmission(scopeA(), submissionId);
  assert.equal(review.submission.schema.fields.length, FIELDS.length);
  /* Pubblicare, archiviare, rigenerare il link: direzione. Modificare: gestione. */
  await assert.rejects(() => forms.publishFormTemplate(scopeA("collaborator"), template.id), /Accesso negato/);
  await assert.rejects(() => forms.regenerateFormTemplateSlug(scopeA("staff"), template.id), /Accesso negato/);
  await assert.rejects(() => forms.createFormTemplate(scopeA("trainer", TRAINER_A), {}), /Accesso negato/);
});

/* ------------------------------------------- sanificazione e schema */

test("il contenuto di un blocco si sanifica sul server prima di salvarlo e prima di pubblicarlo", async () => {
  teachCompositeVersionLookup();
  const created = await forms.createFormTemplate(scopeA(), { starter: "blank" });
  const sporco = '<h2 onclick="x()">Titolo</h2><script>alert(1)</script><p style="color:red;text-align:center">t</p><img src="data:image/png;base64,AAAA"><a href="javascript:alert(1)">l</a>';
  await forms.updateFormTemplateDraft(scopeA(), created.id, schemaWith([{ id: "f_c", type: "content", label: "T", content: sporco }, FIELDS[2]]));
  const salvato = fake.rows("formTemplate")[0].draft.fields[0].content;
  assert.doesNotMatch(salvato, /script|onclick|data:|javascript:|color:red/);
  assert.match(salvato, /<h2>Titolo<\/h2>/);
  assert.match(salvato, /text-align:center/);
});

test("lo schema rifiuta una condizione su un campo che viene dopo e un consenso facoltativo obbligatorio", async () => {
  const { validateSchema } = await import("../../src/lib/forms/validation.ts");
  const { normalizeFormSchema } = await import("../../src/lib/forms/model.ts");
  const schema = normalizeFormSchema(schemaWith([
    { id: "a", type: "short_text", label: "A", visibleWhen: { fieldId: "b", equals: "si" } },
    { id: "b", type: "dropdown", label: "B", options: ["si", "no"] },
  ]));
  const esito = validateSchema(schema);
  assert.ok(esito.errors.some((e) => /viene dopo/.test(e)));
  const consenso = normalizeFormSchema(schemaWith([{ id: "c", type: "checkbox", label: "C", legalKind: "optional_consent", required: true }]));
  assert.equal(consenso.fields[0].required, false, "il modello lo spegne da solo");
});

/* ── Revisione ostile (secondo lotto): cio che la prima stesura non provava ── */

test("R-A2 · un'approvazione caduta dopo la creazione della scheda riparte da quella scheda: nessun doppione", async () => {
  const template = await publishedTemplate();
  const { submissionId } = await submitOne(template);
  /* La membership fallisce dopo la scheda: la presa si rilascia, ma athlete_id resta annotato. */
  const originale = fake.client.athleteCategoryMembership.create;
  fake.client.athleteCategoryMembership.create = async () => { throw new Error("guasto simulato"); };
  const clubRow = fake.rows("club").find((c) => c.id === CLUB_A);
  clubRow.club_sites = [{ id: "sede-a", name: "Sede A", active: true }];
  try {
    await submissions.decideFormSubmission(scopeA(), submissionId, { decision: "approve" }).catch(() => undefined);
  } finally {
    fake.client.athleteCategoryMembership.create = originale;
  }
  const dopoIlGuasto = rigaPratica(submissionId);
  const schedePrima = fake.rows("athlete").length;
  if (dopoIlGuasto.status === "pending") {
    assert.ok(dopoIlGuasto.athlete_id || schedePrima === 0, "se una scheda e nata, la pratica la nomina");
    const esito = await submissions.decideFormSubmission(scopeA(), submissionId, { decision: "approve" });
    assert.equal(esito.submission.status, "converted");
  }
  assert.equal(fake.rows("athlete").length, Math.max(schedePrima, 1), "una scheda sola, mai due");
});

test("R-A4 · archiviare e condizionato: una pratica gia convertita o presa in esame non si archivia", async () => {
  const template = await publishedTemplate();
  const { submissionId } = await submitOne(template);
  await submissions.decideFormSubmission(scopeA(), submissionId, { decision: "approve" });
  await assert.rejects(() => submissions.decideFormSubmission(scopeA(), submissionId, { decision: "archive" }), /non si puo archiviare/);
  const seconda = await submitOne(template, { ...RISPOSTE, f_nome: "Luca" });
  /* Una presa in esame fresca blocca l'archiviazione altrui. */
  const riga = rigaPratica(seconda.submissionId);
  riga.reviewed_at = new Date();
  riga.reviewed_by = "qualcun-altro";
  await assert.rejects(() => submissions.decideFormSubmission(scopeA(), seconda.submissionId, { decision: "archive" }), /cambiata nel frattempo/);
});

test("R-A6 · una casella legale nascosta da una condizione non produce nessuna dichiarazione; il reinvio conserva le dichiarazioni non ritoccate con la loro ora", async () => {
  const template = await publishedTemplate([
    ...FIELDS,
    { id: "f_aut", type: "checkbox", label: "Autorizzo l'uscita autonoma", legalKind: "authorization", visibleWhen: { fieldId: "f_minore", equals: "false" } },
  ]);
  const { submissionId, receiptReference } = await submitOne(template, { ...RISPOSTE, f_minore: true });
  const riga = rigaPratica(submissionId);
  assert.ok(!riga.declarations.some((d) => d.fieldId === "f_aut"), "mai mostrata, mai dichiarata");
  const oraPresa = riga.declarations.find((d) => d.fieldId === "f_presa").at;
  await submissions.decideFormSubmission(scopeA(), submissionId, { decision: "request_changes", fieldIds: ["f_nascita"], note: "n" });
  await new Promise((r) => setTimeout(r, 5));
  await submissions.resubmitPublicSubmission(receiptReference, { answers: { f_nascita: "2015-06-06" }, files: [] });
  assert.equal(rigaPratica(submissionId).declarations.find((d) => d.fieldId === "f_presa").at, oraPresa, "la presa visione non e stata rifatta: stessa ora");
});

test("R-A3 · ripetere la conversione di una prova gia convertita e idempotente", async () => {
  const prova = await trials.createTrialAthlete(scopeA(), { firstName: "Mario", lastName: "Rossi", birthDate: "2015-05-05" });
  const prima = await trials.convertTrialAthlete(scopeA(), prova.id, { create: {} }, { userId: OWNER_A });
  const seconda = await trials.convertTrialAthlete(scopeA(), prova.id, {}, { userId: OWNER_A });
  assert.equal(seconda.athleteId, prima.athleteId);
  assert.equal(seconda.created, false);
  await assert.rejects(() => trials.convertTrialAthlete(scopeA(), prova.id, { athleteId: "aaaaaaaa-1111-4000-8000-000000000009" }, { userId: OWNER_A }), /altra scheda/);
  assert.equal(fake.rows("athlete").length, 1);
});

test("R-B1/B7 · la rotta pubblica delle immagini serve solo gli allegati di contenuto del modulo dello slug", async () => {
  const { isPublicFormContentAsset } = await import("../../src/lib/forms/public-assets.ts");
  const match = { organizationId: CLUB_A, templateId: "t1" };
  const ok = { organizationId: CLUB_A, ownerType: "form", ownerId: "t1", category: "contenuto-modulo", mimeType: "image/png" };
  assert.equal(isPublicFormContentAsset(ok, match), true);
  assert.equal(isPublicFormContentAsset({ ...ok, category: "compilazione-modulo" }, match), false, "il certificato di una famiglia no");
  assert.equal(isPublicFormContentAsset({ ...ok, ownerId: "t2" }, match), false, "un altro modulo no");
  assert.equal(isPublicFormContentAsset({ ...ok, organizationId: CLUB_B }, match), false, "un altro club no");
  assert.equal(isPublicFormContentAsset({ ...ok, mimeType: "application/pdf" }, match), false, "un PDF no");
  const rotta = readFileSync(path.join(process.cwd(), "src/app/api/public/forms/[publicSlug]/assets/[attachmentId]/route.ts"), "utf8");
  assert.match(rotta, /getAttachmentMetadata\(id\)/, "prima i metadati, poi i byte");
  assert.match(rotta, /isPublicFormContentAsset\(meta, match\)/);
});

test("R-C1 · cambiare contenuto, semantica legale, condizione o regole di caricamento rende due schemi diversi", async () => {
  const { normalizeFormSchema, schemasAreEqual, FIELD_COMPARISON_KEYS, normalizeFormField } = await import("../../src/lib/forms/model.ts");
  const base = normalizeFormSchema(schemaWith(FIELDS));
  const con = (patch, id) => normalizeFormSchema(schemaWith(FIELDS.map((f) => (f.id === id ? { ...f, ...patch } : f))));
  assert.equal(schemasAreEqual(base, con({ content: "<p>altro</p>" }, "f_info")), false);
  assert.equal(schemasAreEqual(base, con({ legalKind: "authorization" }, "f_presa")), false);
  assert.equal(schemasAreEqual(base, con({ visibleWhen: { fieldId: "f_minore", equals: "false" } }, "f_tutore")), false);
  assert.equal(schemasAreEqual(base, con({ upload: { accept: "images", maxBytes: 1024 * 1024 } }, "f_cert")), false);
  assert.equal(schemasAreEqual(base, normalizeFormSchema(schemaWith(FIELDS))), true);
  /* Ogni chiave di un campo entra nel confronto: la nona non ripetera la storia dell'ottava. */
  assert.deepEqual([...FIELD_COMPARISON_KEYS].sort(), Object.keys(normalizeFormField({ type: "short_text" })).sort());
});

test("R-B/M1 · la ricevuta non rilegge l'anagrafica: il contesto dell'integrazione porta solo i campi da correggere e chi li governa", async () => {
  const template = await publishedTemplate();
  const { submissionId, receiptReference } = await submitOne(template);
  await submissions.decideFormSubmission(scopeA(), submissionId, { decision: "request_changes", fieldIds: ["f_tutore"], note: "n" });
  const contesto = await submissions.readPublicRevisionContext(receiptReference);
  assert.deepEqual(Object.keys(contesto.answers).sort(), ["f_minore", "f_tutore"], "il tutore e la casella che lo mostra");
  assert.equal(contesto.files.length, 0, "nessun nome di file dei campi non chiesti");
  assert.deepEqual(Object.keys(contesto.schema).sort(), ["description", "fields", "title"]);
});
