import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Iscrizione online e rinnovo: il riscontro alla famiglia** (Wave 5, lane
 * 5G, §16), dal lato del servizio.
 *
 * Il motore dei moduli era gia corretto e resta com'e: pagina pubblica senza
 * sessione, versione congelata, errori collassati a 404 e — la regola d'oro —
 * l'anagrafica che nasce **solo** all'approvazione umana (ADR-0040). Cio che
 * non esisteva e il verso opposto: la famiglia inviava e poi non sapeva piu
 * niente.
 *
 * Cinque cose vanno provate, non affermate:
 *
 * 1. **la ricevuta esce una volta sola.** In archivio resta l'impronta: chi
 *    legge il database non puo aprire la pratica di nessuno (ADR-0085);
 * 2. **un riferimento inventato non racconta niente.** Non «non trovato per
 *    questo club», che confermerebbe l'esistenza del riferimento altrove:
 *    niente, come per lo slug di un modulo e per il token di un pagamento;
 * 3. **il confine multi-tenant**, e il fatto che il gate dell'area genitore e
 *    il **legame** e non il ruolo;
 * 4. **l'approvazione con documento mancante emette una richiesta
 *    documentale invece di respingere** — chiamando il proprietario del
 *    fascicolo, non un secondo modo di chiedere un documento;
 * 5. **il rinnovo non e un secondo motore**: stesso modulo, stessa coda,
 *    stessa approvazione umana, e nessuna anagrafica nuova.
 */

const CLUB_A = "aaaaaaaa-5g00-4000-8000-00000000000a";
const CLUB_B = "bbbbbbbb-5g00-4000-8000-00000000000b";

const SEGRETERIA_A = "11111111-5g00-4000-8000-000000000aaa";
const SEGRETERIA_B = "22222222-5g00-4000-8000-000000000bbb";
const GENITORE = "33333333-5g00-4000-8000-000000000ccc";
const ESTRANEO = "44444444-5g00-4000-8000-000000000ddd";

const ATLETA = "a1a1a1a1-5g00-4000-8000-000000000001";
const ATLETA_ALTRUI = "a2a2a2a2-5g00-4000-8000-000000000002";

const STAGIONE = {
  id: "s-2026",
  label: "2026/2027",
  startDate: "2026-09-01",
  endDate: "2027-06-30",
  status: "active",
  createdAt: "2026-08-01T00:00:00.000Z",
};

const scope = (organizationId, userId, activeRole = "owner") => ({
  userId,
  activeOrganizationId: organizationId,
  activeRole,
  allowedOrganizationIds: [organizationId],
});

const scopeA = (activeRole = "owner") => scope(CLUB_A, SEGRETERIA_A, activeRole);
const scopeB = (activeRole = "owner") => scope(CLUB_B, SEGRETERIA_B, activeRole);

let forms;
let submissions;
let iscrizioni;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  forms = await import("../../src/lib/server/forms.ts");
  submissions = await import("../../src/lib/server/form-submissions.ts");
  iscrizioni = await import("../../src/lib/server/enrollment-requests.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const club = (id, name, creatorId) => ({
  id,
  slug: `slug-${id}`,
  name,
  business_name: `${name} ASD`,
  contact_email: `info@${id}.it`,
  logo_url: null,
  payment_plans: [],
  club_sites: [],
  categories: [],
  settings: { seasons: [STAGIONE], activeSeasonId: STAGIONE.id },
  creator_id: creatorId,
  organization_users: [],
});

const seed = () => ({
  user: [
    { id: SEGRETERIA_A, email: "segreteria@alfa.it", email_verified_at: new Date() },
    { id: SEGRETERIA_B, email: "segreteria@beta.it", email_verified_at: new Date() },
    { id: GENITORE, email: "mamma@famiglia.it", email_verified_at: new Date() },
    { id: ESTRANEO, email: "altro@famiglia.it", email_verified_at: new Date() },
  ],
  organizationUser: [
    { id: "ou-a", organization_id: CLUB_A, user_id: SEGRETERIA_A, role: "owner" },
    { id: "ou-b", organization_id: CLUB_B, user_id: SEGRETERIA_B, role: "owner" },
  ],
  club: [
    club(CLUB_A, "ASD Alfa", SEGRETERIA_A),
    club(CLUB_B, "ASD Beta", SEGRETERIA_B),
  ],
  athlete: [
    {
      id: ATLETA,
      organization_id: CLUB_A,
      first_name: "Mario",
      last_name: "Rossi",
      /* Il legame vero: e questo, e non una membership, a fare il genitore. */
      user_id: GENITORE,
      data: { guardians: [{ name: "Anna Rossi", linkedUserId: GENITORE }] },
    },
    {
      id: ATLETA_ALTRUI,
      organization_id: CLUB_B,
      first_name: "Luca",
      last_name: "Bianchi",
      user_id: null,
      data: {},
    },
  ],
  formSubmission: [],
  documentRequest: [],
  documentSubmission: [],
  notification: [],
  auditLog: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
  insegnaChiaveComposta();
});

/*
  Il doppio non implementa le chiavi composte. Servirla qui fa provare al test
  il codice vero — compresa la risoluzione della versione **congelata** del
  modulo — invece di un percorso alternativo scritto per il test.
*/
const insegnaChiaveComposta = () => {
  const versioni = fake.client.formTemplateVersion;
  const originale = versioni.findUnique;
  versioni.findUnique = async (args = {}) => {
    const composta = args.where?.template_id_version;
    if (!composta) return originale(args);
    return (
      fake
        .rows("formTemplateVersion")
        .find(
          (row) =>
            row.template_id === composta.template_id &&
            Number(row.version) === Number(composta.version),
        ) || null
    );
  };
};

const CAMPI = [
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
    id: "f_cf",
    type: "short_text",
    label: "Codice fiscale",
    binding: "athlete.fiscalCode",
  },
];

const moduloPubblicato = async (proprietario = scopeA(), titolo = "Iscrizione 2026") => {
  const creato = await forms.createFormTemplate(proprietario, { starter: "blank" });

  await forms.updateFormTemplateDraft(proprietario, creato.id, {
    title: titolo,
    description: "",
    fields: CAMPI,
    settings: {
      successMessage: "Grazie",
      closeAt: "",
      collectRespondentEmail: false,
      notifyOnSubmit: false,
      documentTemplateId: "",
    },
  });

  return forms.publishFormTemplate(proprietario, creato.id);
};

/**
 * Attacca alla riga le relazioni che `include` risolverebbe.
 *
 * E la stessa scorciatoia di `form-submissions-documents.test.mjs`: il doppio
 * non risolve `include`, e cio che si attacca qui e esattamente cio che Prisma
 * restituirebbe.
 */
const completaRelazioni = (submissionId, template) => {
  const row = fake
    .rows("formSubmission")
    .find((entry) => entry.id === submissionId);
  row.template = { title: template.title };
  const versione = fake
    .rows("formTemplateVersion")
    .find((entry) => entry.id === row.version_id);
  row.template_version = {
    version: versione.version,
    schema_json: versione.schema_json,
  };
  return row;
};

const invia = async (template, answers = { f_nome: "Mario", f_cognome: "Rossi" }) => {
  const esito = await submissions.submitPublicForm(template.publicSlug, {
    answers,
    files: [],
  });
  completaRelazioni(esito.submissionId, template);
  return esito;
};

const riga = (submissionId) =>
  fake.rows("formSubmission").find((entry) => entry.id === submissionId);

/* ============================================================ la ricevuta */

test("l'invio consegna un riferimento, e in archivio ne resta solo l'impronta", async () => {
  const template = await moduloPubblicato();
  const esito = await invia(template);

  assert.ok(esito.receiptReference, "senza riferimento la famiglia non sa piu niente");

  const salvata = riga(esito.submissionId);
  assert.ok(salvata.receipt_token_hash);
  assert.notEqual(
    salvata.receipt_token_hash,
    esito.receiptReference,
    "il riferimento in chiaro non deve entrare in archivio",
  );
  assert.ok(
    !JSON.stringify(salvata).includes(esito.receiptReference),
    "nessuna colonna deve contenere la credenziale",
  );
  assert.equal(salvata.kind, "enrollment");
});

test("una compilazione della segreteria non emette nessuna ricevuta", async () => {
  const template = await moduloPubblicato();

  /*
    Non c'e nessuna famiglia che la segue da casa: un riferimento emesso e mai
    consegnato sarebbe una credenziale in giro senza motivo. E due
    compilazioni interne devono poter convivere, cosa che un vincolo unico su
    una colonna riempita a vuoto impedirebbe.
  */
  const prima = await submissions.submitInternalForm(scopeA(), {
    templateId: template.id,
    answers: { f_nome: "Mario", f_cognome: "Rossi" },
    files: [],
  });
  const seconda = await submissions.submitInternalForm(scopeA(), {
    templateId: template.id,
    answers: { f_nome: "Luca", f_cognome: "Verdi" },
    files: [],
  });

  assert.equal(prima.receiptReference, "");
  assert.equal(riga(prima.submissionId).receipt_token_hash, null);
  assert.equal(riga(seconda.submissionId).receipt_token_hash, null);
});

/* ================================================= la lettura pubblica */

test("un riferimento inventato non trova niente, e non dice perche", async () => {
  const template = await moduloPubblicato();
  await invia(template);

  for (const inventato of [
    "riferimento-che-non-esiste",
    "",
    "   ",
    null,
    undefined,
  ]) {
    const vista = await iscrizioni.readPublicEnrollmentStatus(inventato);
    assert.equal(
      vista,
      null,
      "un solo esito negativo: distinguere i casi direbbe quando si e indovinato",
    );
  }
});

test("la lettura pubblica non nomina il club sbagliato ne solleva un errore parlante", async () => {
  /*
    Il difetto che questa riga chiude e una frase: «non trovato per questo
    club» confermerebbe che il riferimento esiste da qualche altra parte, che e
    esattamente cio che chi prova riferimenti a caso vuole sapere.
  */
  await assert.doesNotReject(() =>
    iscrizioni.readPublicEnrollmentStatus("un-riferimento-di-un-altro-club"),
  );
});

test("la ricevuta mostra lo stato e non le risposte del modulo", async () => {
  const template = await moduloPubblicato();
  const esito = await invia(template, {
    f_nome: "Mario",
    f_cognome: "Rossi",
    f_cf: "RSSMRA10A01H501U",
  });

  const vista = await iscrizioni.readPublicEnrollmentStatus(
    esito.receiptReference,
  );

  assert.equal(vista.state, "sent");
  assert.equal(vista.stateLabel, "Inviata");
  assert.equal(vista.clubName, "ASD Alfa");
  assert.equal(vista.templateTitle, "Iscrizione 2026");

  const serializzata = JSON.stringify(vista);
  for (const segreto of ["RSSMRA10A01H501U", esito.submissionId, CLUB_A, template.id]) {
    assert.ok(
      !serializzata.includes(segreto),
      `«${segreto}» non deve uscire da una lettura senza sessione`,
    );
  }
});

test("la ricevuta racconta il rifiuto con il suo motivo", async () => {
  const template = await moduloPubblicato();
  const esito = await invia(template);

  await submissions.decideFormSubmission(scopeA(), esito.submissionId, {
    decision: "reject",
    note: "Codice fiscale incompleto",
  });

  const vista = await iscrizioni.readPublicEnrollmentStatus(
    esito.receiptReference,
  );
  assert.equal(vista.state, "rejected");
  assert.equal(vista.reviewNote, "Codice fiscale incompleto");
});

/* ============================================= l'approvazione e il documento */

test("approvare con un documento mancante lo chiede, e non respinge la domanda", async () => {
  const template = await moduloPubblicato();
  const esito = await invia(template);

  const outcome = await submissions.decideFormSubmission(
    scopeA(),
    esito.submissionId,
    {
      decision: "approve",
      documentRequests: [
        {
          documentKind: "medical_certificate",
          title: "Certificato medico agonistico",
          dueDate: "2026-10-01",
        },
      ],
    },
  );

  assert.equal(outcome.submission.status, "approved");
  assert.ok(
    outcome.applied.some((riga) => riga.includes("Documento richiesto")),
    outcome.applied.join(" | "),
  );

  const richieste = fake.rows("documentRequest");
  assert.equal(richieste.length, 1);
  assert.equal(richieste[0].organization_id, CLUB_A);
  assert.equal(richieste[0].document_kind, "medical_certificate");
  assert.equal(richieste[0].status, "open");

  /* L'atleta nasce dall'approvazione, non prima: la regola d'oro tiene. */
  const nato = fake.rows("athlete").find((row) => row.first_name === "Mario" && row.id !== ATLETA);
  assert.equal(richieste[0].subject_id, nato.id);

  /* E la traccia c'e: il fascicolo scrive l'audit, il rifiuto non lo faceva. */
  assert.ok(
    fake.rows("auditLog").some((row) => row.action === "document.request.created"),
  );
});

test("la ricevuta dice che la domanda e approvata e cosa resta da consegnare", async () => {
  const template = await moduloPubblicato();
  const esito = await invia(template);

  await submissions.decideFormSubmission(scopeA(), esito.submissionId, {
    decision: "approve",
    documentRequests: [
      { documentKind: "medical_certificate", title: "Certificato medico" },
    ],
  });

  const vista = await iscrizioni.readPublicEnrollmentStatus(
    esito.receiptReference,
  );

  assert.equal(
    vista.state,
    "approved",
    "una decisione presa vince su cio che resta da consegnare",
  );
  assert.deepEqual(
    vista.pendingDocuments.map((documento) => documento.title),
    ["Certificato medico"],
  );
});

test("riapprovare non chiede due volte lo stesso documento", async () => {
  const template = await moduloPubblicato();
  const esito = await invia(template);

  const documenti = [
    { documentKind: "medical_certificate", title: "Certificato medico" },
  ];

  await submissions.decideFormSubmission(scopeA(), esito.submissionId, {
    decision: "approve",
    documentRequests: documenti,
  });

  /* Un'approvazione interrotta si ritenta: la riga torna in coda. */
  riga(esito.submissionId).status = "pending";

  await submissions.decideFormSubmission(scopeA(), esito.submissionId, {
    decision: "approve",
    documentRequests: documenti,
  });

  assert.equal(
    fake.rows("documentRequest").length,
    1,
    "due righe «Certificato medico» si leggono come due certificati da consegnare",
  );
});

test("chiedere un documento resta un permesso della segreteria", async () => {
  const template = await moduloPubblicato();
  const esito = await invia(template);

  /*
    Il permesso e quello del fascicolo (`documents.request`), e non si ottiene
    di sponda approvando un'iscrizione. Un errore qui **fa fallire**
    l'approvazione: una segreteria che crede di aver chiesto il certificato e
    non l'ha chiesto e peggio di un'approvazione da ripetere.
  */
  await assert.rejects(
    () =>
      submissions.decideFormSubmission(scopeA("trainer"), esito.submissionId, {
        decision: "approve",
        documentRequests: [
          { documentKind: "medical_certificate", title: "Certificato medico" },
        ],
      }),
    /Accesso negato/,
  );
});

/* ================================================== l'area genitore */

test("le pratiche della famiglia le legge chi e collegato all'atleta", async () => {
  const template = await moduloPubblicato();
  const esito = await invia(template);

  await submissions.decideFormSubmission(scopeA(), esito.submissionId, {
    decision: "approve",
    subjects: [{ subject: "athlete", recordId: ATLETA, label: "Mario Rossi" }],
  });

  const pratiche = await iscrizioni.listFamilyEnrollmentRequests(
    GENITORE,
    ATLETA,
  );

  assert.equal(pratiche.length, 1);
  assert.equal(pratiche[0].state, "approved");
  assert.equal(pratiche[0].athleteName, "Mario Rossi");
  assert.equal(pratiche[0].templateTitle, "Iscrizione 2026");
});

test("un estraneo non legge le pratiche di una famiglia", async () => {
  await assert.rejects(
    () => iscrizioni.listFamilyEnrollmentRequests(ESTRANEO, ATLETA),
    /Accesso negato/,
    "il gate e il legame con l'atleta, non l'appartenenza al club",
  );
});

test("il confine multi-tenant: la pratica di un altro club non entra nell'elenco", async () => {
  const moduloAltrui = await moduloPubblicato(scopeB(), "Iscrizione Beta");
  const altrui = await invia(moduloAltrui);
  await submissions.decideFormSubmission(scopeB(), altrui.submissionId, {
    decision: "approve",
    subjects: [
      { subject: "athlete", recordId: ATLETA_ALTRUI, label: "Luca Bianchi" },
    ],
  });

  const mio = await moduloPubblicato();
  const mia = await invia(mio);
  await submissions.decideFormSubmission(scopeA(), mia.submissionId, {
    decision: "approve",
    subjects: [{ subject: "athlete", recordId: ATLETA, label: "Mario Rossi" }],
  });

  const pratiche = await iscrizioni.listFamilyEnrollmentRequests(
    GENITORE,
    ATLETA,
  );

  assert.deepEqual(
    pratiche.map((pratica) => pratica.id),
    [mia.submissionId],
  );
});

/* ============================================================== il rinnovo */

test("il rinnovo e lo stesso modulo, precompilato e con la stagione citata", async () => {
  const template = await moduloPubblicato();

  const bozza = await iscrizioni.buildRenewalDraft(GENITORE, {
    athleteId: ATLETA,
    publicSlug: template.publicSlug,
  });

  assert.equal(bozza.seasonId, STAGIONE.id);
  assert.equal(bozza.seasonLabel, STAGIONE.label);
  assert.equal(bozza.answers.f_nome, "Mario");
  assert.equal(bozza.answers.f_cognome, "Rossi");
  assert.equal(bozza.athleteName, "Mario Rossi");
});

test("il rinnovo entra nella stessa coda, come rinnovo e per l'atleta gia noto", async () => {
  const template = await moduloPubblicato();

  const esito = await submissions.submitRenewalForm(GENITORE, {
    athleteId: ATLETA,
    publicSlug: template.publicSlug,
    answers: { f_nome: "Mario", f_cognome: "Rossi" },
    files: [],
  });

  const salvata = riga(esito.submissionId);
  assert.equal(salvata.kind, "renewal");
  assert.equal(salvata.status, "pending", "nessuna scrittura in anagrafica senza un operatore");
  assert.equal(salvata.season_id, STAGIONE.id);
  assert.equal(salvata.submitted_by, GENITORE);
  assert.deepEqual(salvata.subjects, [
    { subject: "athlete", recordId: ATLETA, label: "Mario Rossi" },
  ]);
  assert.ok(esito.receiptReference);

  /* Nessun atleta nuovo: il rinnovo aggiorna, non duplica. */
  assert.equal(fake.rows("athlete").length, 2);
});

test("un rinnovo per un atleta non collegato e negato", async () => {
  const template = await moduloPubblicato();

  await assert.rejects(
    () =>
      submissions.submitRenewalForm(ESTRANEO, {
        athleteId: ATLETA,
        publicSlug: template.publicSlug,
        answers: { f_nome: "Mario", f_cognome: "Rossi" },
        files: [],
      }),
    /Accesso negato/,
  );
  assert.equal(fake.rows("formSubmission").length, 0);
});

test("il modulo di un altro club non si rinnova, e non si distingue da uno inesistente", async () => {
  const moduloAltrui = await moduloPubblicato(scopeB(), "Iscrizione Beta");

  for (const slug of [moduloAltrui.publicSlug, "slug-che-non-esiste"]) {
    await assert.rejects(
      () =>
        submissions.submitRenewalForm(GENITORE, {
          athleteId: ATLETA,
          publicSlug: slug,
          answers: { f_nome: "Mario", f_cognome: "Rossi" },
          files: [],
        }),
      /Modulo non disponibile/,
      "un solo esito: distinguere direbbe quali slug si sono indovinati",
    );
  }

  assert.equal(fake.rows("formSubmission").length, 0);
});
