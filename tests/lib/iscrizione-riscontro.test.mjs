import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEnrollmentReceiptPath,
  buildPublicEnrollmentView,
  buildRenewalDraftAnswers,
  deriveFamilyEnrollmentState,
  enrollmentReceiptHashesMatch,
  generateEnrollmentReceiptReference,
  hashEnrollmentReceiptReference,
  normalizeEnrollmentKind,
  submissionBelongsToFamily,
} from "../../src/lib/forms/enrollment-receipt.ts";

/**
 * **Il riscontro alla famiglia**, come dominio puro (Wave 5, lane 5G, §16).
 *
 * Il motore dei moduli era corretto e resta com'e. Cio che non esisteva — e
 * che qui va provato, non affermato — e il verso opposto: l'iscrizione online
 * viveva per il club e non per la famiglia, che inviava e poi non sapeva piu
 * niente.
 *
 * La maggior parte di questi controlli prova un **diniego**, perche e li che
 * il riscontro puo diventare una fuga di dati: una ricevuta e una credenziale
 * anonima, e cio che esce da una lettura senza sessione non lo decide chi
 * scrive la schermata.
 */

/* ============================================================ la ricevuta */

test("il riferimento non e indovinabile e non si ripete", () => {
  const primo = generateEnrollmentReceiptReference();
  const secondo = generateEnrollmentReceiptReference();

  assert.notEqual(primo, secondo);
  /* 32 byte in base64url: 43 caratteri, nessuno dei quali rompe un URL. */
  assert.equal(primo.length, 43);
  assert.match(primo, /^[A-Za-z0-9_-]+$/);
});

test("in archivio entra l'impronta, mai il riferimento", () => {
  const riferimento = generateEnrollmentReceiptReference();
  const impronta = hashEnrollmentReceiptReference(riferimento);

  assert.equal(impronta.length, 64);
  assert.match(impronta, /^[0-9a-f]+$/);
  /*
    Il difetto che questa riga chiude: un'impronta che contenesse il
    riferimento — o che ne fosse una codifica reversibile — renderebbe il
    database un elenco di link funzionanti verso le pratiche di tutti.
  */
  assert.ok(!impronta.includes(riferimento));
  assert.equal(hashEnrollmentReceiptReference(riferimento), impronta);
});

test("un riferimento assente non produce un'impronta", () => {
  for (const vuoto of ["", "   ", null, undefined]) {
    assert.equal(
      hashEnrollmentReceiptReference(vuoto),
      "",
      "un riferimento vuoto non deve poter interrogare niente",
    );
  }
});

test("il confronto fra impronte respinge cio che non coincide", () => {
  const impronta = hashEnrollmentReceiptReference("una-ricevuta");

  assert.equal(enrollmentReceiptHashesMatch(impronta, impronta), true);
  assert.equal(
    enrollmentReceiptHashesMatch(impronta, impronta.slice(0, 63)),
    false,
    "una lunghezza diversa non e mai una corrispondenza",
  );
  assert.equal(enrollmentReceiptHashesMatch("", ""), false);
  assert.equal(enrollmentReceiptHashesMatch(impronta, null), false);
});

test("il percorso della ricevuta codifica cio che gli si da", () => {
  assert.equal(buildEnrollmentReceiptPath("abc"), "/iscrizione/abc");
  assert.equal(
    buildEnrollmentReceiptPath("a/b?c"),
    "/iscrizione/a%2Fb%3Fc",
    "un riferimento non deve poter aggiungere un segmento o una query",
  );
});

/* =============================================================== lo stato */

test("lo stato della famiglia si ricava, e una decisione vince su cio che manca", () => {
  assert.equal(deriveFamilyEnrollmentState({ status: "pending" }), "sent");
  assert.equal(
    deriveFamilyEnrollmentState({ status: "pending", openDocumentRequests: 1 }),
    "in_review",
    "se il club aspetta un documento la pratica e in lavorazione, non ferma",
  );
  assert.equal(
    deriveFamilyEnrollmentState({ status: "approved", openDocumentRequests: 2 }),
    "approved",
    "approvata resta approvata: il documento atteso si mostra accanto, non al posto dell'esito",
  );
  assert.equal(
    deriveFamilyEnrollmentState({ status: "rejected", openDocumentRequests: 3 }),
    "rejected",
  );
});

test("uno stato sconosciuto non diventa mai approvata", () => {
  for (const stato of ["", "APPROVED", "in_lavorazione", null, undefined]) {
    assert.equal(
      deriveFamilyEnrollmentState({ status: stato }),
      "sent",
      "il verso prudente in cui sbagliare e «e arrivata», non «e passata»",
    );
  }
});

test("il tipo di pratica ammette due valori e nessun altro", () => {
  assert.equal(normalizeEnrollmentKind("renewal"), "renewal");
  for (const valore of ["enrollment", "", "rinnovo", "RENEWAL", null, 7]) {
    assert.equal(normalizeEnrollmentKind(valore), "enrollment");
  }
});

/* ================================================== cosa la ricevuta non dice */

const COMPILAZIONE = {
  kind: "renewal",
  status: "approved",
  clubName: "ASD Alfa",
  templateTitle: "Iscrizione 2026/2027",
  seasonLabel: "2026/2027",
  submittedAt: "2026-09-01T08:00:00.000Z",
  reviewedAt: "2026-09-03T10:00:00.000Z",
  reviewNote: "Manca il certificato medico",
  pendingDocuments: [
    { title: "Certificato medico agonistico", dueDate: "2026-10-01", required: true },
  ],
};

test("la vista pubblica ha un elenco chiuso di campi", () => {
  const vista = buildPublicEnrollmentView(COMPILAZIONE);

  assert.deepEqual(Object.keys(vista).sort(), [
    "clubName",
    "kind",
    "kindLabel",
    "pendingDocuments",
    "reviewNote",
    "reviewedAt",
    "seasonLabel",
    "state",
    "stateLabel",
    "submittedAt",
    "templateTitle",
  ]);
  assert.equal(vista.state, "approved");
  assert.equal(vista.stateLabel, "Approvata");
  assert.equal(vista.kindLabel, "Rinnovo");
});

test("la vista pubblica non espone risposte, allegati, soggetti ne identificativi", () => {
  const vista = buildPublicEnrollmentView({
    ...COMPILAZIONE,
    /*
      Cio che una compilazione porta davvero, e che una vista scritta come
      `{ ...submission }` avrebbe pubblicato su un endpoint senza sessione: la
      dichiarazione su un minore, il codice fiscale, gli allegati, l'indirizzo
      di chi ha compilato e le chiavi dell'archivio del club.
    */
    id: "22222222-5g00-4000-8000-000000000001",
    organizationId: "aaaaaaaa-5g00-4000-8000-00000000000a",
    templateId: "tttttttt-5g00-4000-8000-000000000001",
    answers: { f_cf: "RSSMRA10A01H501U", f_note: "allergie" },
    files: [{ fileName: "certificato.pdf", reference: "attachment:123" }],
    subjects: [{ subject: "athlete", recordId: "atleta-1" }],
    respondentEmail: "mamma@famiglia.it",
    respondentName: "Anna Rossi",
  });

  const serializzata = JSON.stringify(vista);
  for (const segreto of [
    "RSSMRA10A01H501U",
    "allergie",
    "certificato.pdf",
    "attachment:123",
    "atleta-1",
    "mamma@famiglia.it",
    "Anna Rossi",
    "aaaaaaaa-5g00-4000-8000-00000000000a",
    "22222222-5g00-4000-8000-000000000001",
  ]) {
    assert.ok(
      !serializzata.includes(segreto),
      `«${segreto}» non deve uscire da una lettura senza sessione`,
    );
  }
});

test("i documenti attesi escono senza il loro identificativo", () => {
  const vista = buildPublicEnrollmentView({
    ...COMPILAZIONE,
    pendingDocuments: [
      {
        id: "rrrrrrrr-5g00-4000-8000-000000000001",
        title: "Certificato medico",
        dueDate: "2026-10-01",
        required: true,
        subjectId: "atleta-1",
      },
    ],
  });

  assert.deepEqual(vista.pendingDocuments, [
    { title: "Certificato medico", dueDate: "2026-10-01", required: true },
  ]);
});

/* ================================================== a chi appartiene una pratica */

test("una pratica e della famiglia solo per invio o per atleta collegato", () => {
  const MIO = "11111111-5g00-4000-8000-00000000000a";

  assert.equal(
    submissionBelongsToFamily(
      { submittedBy: MIO, subjects: [] },
      { userId: MIO, athleteIds: [] },
    ),
    true,
  );
  assert.equal(
    submissionBelongsToFamily(
      { submittedBy: null, subjects: [{ subject: "athlete", recordId: "a-1" }] },
      { userId: MIO, athleteIds: ["a-1"] },
    ),
    true,
  );
});

test("l'indirizzo email non e un legame", () => {
  /*
    `respondent_email` e testo libero digitato in un modulo pubblico da chi non
    ha nessuna sessione. Se valesse come identita, chiunque scrivendo
    l'indirizzo di un'altra famiglia deciderebbe cosa compare fra le pratiche
    di quella famiglia.
  */
  assert.equal(
    submissionBelongsToFamily(
      {
        submittedBy: null,
        respondentEmail: "mamma@famiglia.it",
        subjects: [],
      },
      { userId: "11111111-5g00-4000-8000-00000000000a", athleteIds: [] },
    ),
    false,
  );
});

test("la pratica di un altro atleta non e mia, nemmeno se lo somiglia", () => {
  const MIO = "11111111-5g00-4000-8000-00000000000a";

  for (const soggetti of [
    [{ subject: "athlete", recordId: "a-2" }],
    [{ subject: "guardian", recordId: "a-1" }],
    [{ subject: "member", recordId: "a-1" }],
    [],
    null,
  ]) {
    assert.equal(
      submissionBelongsToFamily(
        { submittedBy: "99999999-5g00-4000-8000-00000000000z", subjects: soggetti },
        { userId: MIO, athleteIds: ["a-1"] },
      ),
      false,
    );
  }
});

test("senza account e senza atleti collegati non appartiene a nessuno", () => {
  assert.equal(
    submissionBelongsToFamily(
      { submittedBy: null, subjects: [{ subject: "athlete", recordId: "a-1" }] },
      { userId: "", athleteIds: [] },
    ),
    false,
    "un utente vuoto non deve corrispondere a un `submitted_by` vuoto",
  );
});

/* ============================================================== il rinnovo */

const SCHEMA_RINNOVO = {
  title: "Rinnovo 2026/2027",
  description: "",
  fields: [
    { id: "f_nome", type: "short_text", label: "Nome", binding: "athlete.firstName", options: [] },
    { id: "f_cognome", type: "short_text", label: "Cognome", binding: "athlete.lastName", options: [] },
    { id: "f_tutore", type: "short_text", label: "Tutore", binding: "guardian.name", options: [] },
    { id: "f_certificato", type: "file_upload", label: "Certificato", binding: "athlete.firstName", options: [] },
    { id: "f_note", type: "long_text", label: "Note", binding: "", options: [] },
  ],
  settings: {},
};

test("il rinnovo precompila cio che il club sa gia e cita la stagione", () => {
  const bozza = buildRenewalDraftAnswers({
    schema: SCHEMA_RINNOVO,
    records: {
      athlete: { first_name: "Mario", last_name: "Rossi" },
      guardian: { name: "Anna Rossi" },
    },
    seasonId: "s-2026",
    seasonLabel: "2026/2027",
  });

  assert.equal(bozza.seasonId, "s-2026");
  assert.equal(bozza.seasonLabel, "2026/2027");
  assert.equal(bozza.answers.f_nome, "Mario");
  assert.equal(bozza.answers.f_cognome, "Rossi");
  assert.deepEqual(bozza.prefilledFieldIds.sort(), [
    "f_cognome",
    "f_nome",
    "f_tutore",
  ]);
});

test("il rinnovo non precompila un allegato ne una domanda libera", () => {
  const bozza = buildRenewalDraftAnswers({
    schema: SCHEMA_RINNOVO,
    records: { athlete: { first_name: "Mario", last_name: "Rossi" } },
    seasonId: "s-2026",
    seasonLabel: "2026/2027",
  });

  assert.equal(
    "f_certificato" in bozza.answers,
    false,
    "un certificato dell'anno scorso non vale per quello nuovo: il file si ricarica",
  );
  assert.equal("f_note" in bozza.answers, false);
  assert.equal(
    "f_tutore" in bozza.answers,
    false,
    "senza il tutore che sta compilando i suoi campi restano vuoti: chiedere e meno grave che indovinare",
  );
});
