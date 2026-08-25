import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * Modulistica V2 — il modello, senza database e senza browser.
 *
 * Quello che questi test presidiano non e «il codice fa quello che fa»: e la
 * riga di confine fra cio che un client puo dire e cio che il server accetta.
 * Un modulo pubblico e raggiungibile con `curl`, quindi ogni regola che il
 * browser applica deve valere di nuovo qui — e va provato che valga, perche
 * il giorno in cui non vale non se ne accorge nessuno.
 */

let model;
let dynamic;
let validation;
let changes;
let prefill;
let starters;

before(async () => {
  model = await import("../../src/lib/forms/model.ts");
  dynamic = await import("../../src/lib/forms/dynamic-fields.ts");
  validation = await import("../../src/lib/forms/validation.ts");
  changes = await import("../../src/lib/forms/changes.ts");
  prefill = await import("../../src/lib/forms/prefill.ts");
  starters = await import("../../src/lib/forms/starter-templates.ts");
});

const schemaWith = (fields, settings = {}) =>
  model.normalizeFormSchema({
    title: "Modulo di prova",
    description: "",
    fields,
    settings,
  });

/* ------------------------------------------------------------ i tipi di campo */

test("ogni tipo di campo dichiara cosa sa fare", () => {
  for (const definition of model.FORM_FIELD_TYPES) {
    assert.ok(definition.label, `${definition.value} senza etichetta`);
    assert.ok(definition.hint, `${definition.value} senza descrizione`);
  }

  assert.equal(model.fieldCollectsAnswer("section"), false);
  assert.equal(model.fieldCollectsAnswer("short_text"), true);
  assert.equal(model.fieldHasOptions("dropdown"), true);
  assert.equal(model.fieldHasOptions("short_text"), false);
  assert.equal(model.fieldIsFile("signature"), true);
});

test("i tipi coprono cio che il workstream chiede", () => {
  const values = model.FORM_FIELD_TYPES.map((definition) => definition.value);

  for (const richiesto of [
    "short_text",
    "long_text",
    "number",
    "date",
    "single_choice",
    "multiple_choice",
    "dropdown",
    "checkbox",
    "email",
    "phone",
    "signature",
  ]) {
    assert.ok(values.includes(richiesto), `manca il tipo ${richiesto}`);
  }
});

/* ------------------------------------------------------------ normalizzazione */

test("un tipo sconosciuto diventa testo breve invece di rompere il modulo", () => {
  const schema = schemaWith([{ type: "quantum_field", label: "X" }]);

  assert.equal(schema.fields[0].type, "short_text");
});

test("due campi non possono condividere lo stesso identificativo", () => {
  const schema = schemaWith([
    { id: "f_uno", type: "short_text", label: "A" },
    { id: "f_uno", type: "short_text", label: "B" },
  ]);

  assert.notEqual(schema.fields[0].id, schema.fields[1].id);
});

test("una sezione non puo essere obbligatoria", () => {
  const schema = schemaWith([{ type: "section", label: "Dati", required: true }]);

  assert.equal(schema.fields[0].required, false);
});

test("un collegamento che il catalogo non conosce viene buttato via", () => {
  const schema = schemaWith([
    { type: "short_text", label: "Password", binding: "user.password_hash" },
    { type: "short_text", label: "Nome", binding: "athlete.firstName" },
  ]);

  assert.equal(schema.fields[0].binding, "");
  assert.equal(schema.fields[1].binding, "athlete.firstName");
});

test("le opzioni esistono solo per i campi che ne hanno", () => {
  const schema = schemaWith([
    { type: "short_text", label: "Nome", options: ["a", "b"] },
    { type: "dropdown", label: "Taglia", options: ["S", "M", ""] },
  ]);

  assert.deepEqual(schema.fields[0].options, []);
  assert.deepEqual(schema.fields[1].options, ["S", "M"]);
});

/* ----------------------------------------------------------- link pubblico */

test("lo slug pubblico non e indovinabile", () => {
  const slug = model.buildPublicSlug("Iscrizione 2026/27", "3f9a1c7d5b2e");

  assert.equal(slug, "iscrizione-2026-27-3f9a1c7d5b2e");
  assert.equal(model.isSecurePublicSlug(slug), true);
  assert.equal(model.isSecurePublicSlug("iscrizione-2026"), false);
});

test("uno slug si costruisce anche da un titolo senza lettere latine", () => {
  const slug = model.buildPublicSlug("!!!", "abcdef012345");

  assert.equal(slug, "modulo-abcdef012345");
});

test("il suffisso non accetta caratteri che non siano esadecimali", () => {
  const slug = model.buildPublicSlug("Modulo", "../../etc/passwd");

  assert.match(slug, /^modulo-[0-9a-f]{12}$/);
});

/* ---------------------------------------------------- confronto fra versioni */

test("due schemi identici non risultano diversi per l'ordine delle chiavi", () => {
  const left = schemaWith([{ id: "f_1", type: "email", label: "Email", required: true }]);
  const right = model.normalizeFormSchema({
    settings: left.settings,
    fields: [{ required: true, label: "Email", type: "email", id: "f_1" }],
    description: left.description,
    title: left.title,
  });

  assert.equal(model.schemasAreEqual(left, right), true);
});

test("cambiare l'etichetta di un campo conta come modifica da pubblicare", () => {
  const left = schemaWith([{ id: "f_1", type: "short_text", label: "Nome" }]);
  const right = schemaWith([{ id: "f_1", type: "short_text", label: "Nome completo" }]);

  assert.equal(model.schemasAreEqual(left, right), false);
});

test("un modulo con data di chiusura passata e chiuso", () => {
  const schema = schemaWith([], { closeAt: "2020-01-01T00:00:00.000Z" });

  assert.equal(model.isFormClosed(schema, new Date("2026-08-25")), true);
  assert.equal(model.isFormClosed(schemaWith([]), new Date("2026-08-25")), false);
});

/* ------------------------------------------------------------- campi dinamici */

test("il catalogo non espone mai credenziali", () => {
  const proibite = ["password", "hash", "token", "otp", "secret", "pin"];

  for (const definition of dynamic.DYNAMIC_FIELDS) {
    const percorso = definition.path.join(".").toLowerCase();
    for (const parola of proibite) {
      assert.ok(
        !percorso.includes(parola),
        `${definition.key} punta a ${percorso}`,
      );
    }
  }
});

test("ogni dato del catalogo ha un'etichetta umana e nessuna chiave tecnica in vista", () => {
  for (const definition of dynamic.DYNAMIC_FIELDS) {
    assert.ok(definition.label.length > 3, `${definition.key} senza etichetta`);
    assert.ok(
      !definition.label.includes("."),
      `${definition.key} mostra un identificativo tecnico`,
    );
  }
});

test("i dati della societa non si riscrivono da un modulo", () => {
  for (const definition of dynamic.getDynamicFieldsForSubject("club")) {
    assert.equal(definition.writable, false, `${definition.key} e scrivibile`);
  }
});

test("i soggetti di un modulo si deducono dai campi, non si dichiarano", () => {
  const schema = schemaWith([
    { type: "short_text", label: "Nome", binding: "athlete.firstName" },
    { type: "phone", label: "Telefono", binding: "guardian.phone" },
    { type: "short_text", label: "Societa", binding: "club.name" },
    { type: "short_text", label: "Note", binding: "" },
  ]);

  assert.deepEqual(model.getSchemaSubjects(schema), ["athlete", "guardian"]);
});

test("il valore di un dato si legge dal record senza sapere dove sta", () => {
  const atleta = {
    first_name: "Mario",
    birth_date: "2010-05-04T00:00:00.000Z",
    data: { fiscalCode: "RSSMRA10E04H501U" },
  };

  assert.equal(dynamic.readDynamicFieldValue("athlete.firstName", atleta), "Mario");
  assert.equal(dynamic.readDynamicFieldValue("athlete.birthDate", atleta), "2010-05-04");
  assert.equal(
    dynamic.readDynamicFieldValue("athlete.fiscalCode", atleta),
    "RSSMRA10E04H501U",
  );
  assert.equal(dynamic.readDynamicFieldValue("athlete.city", atleta), "");
  assert.equal(dynamic.readDynamicFieldValue("chiave.inventata", atleta), "");
});

/* ------------------------------------------------------------ validazione */

test("un campo obbligatorio vuoto e un errore, anche se il browser lo aveva impedito", () => {
  const schema = schemaWith([
    { id: "f_1", type: "short_text", label: "Nome", required: true },
  ]);

  const result = validation.validateAnswers(schema, {});

  assert.equal(result.valid, false);
  assert.equal(result.errors.f_1, "Campo obbligatorio.");
});

test("una scelta fuori elenco non passa", () => {
  const schema = schemaWith([
    { id: "f_1", type: "dropdown", label: "Taglia", options: ["S", "M"] },
  ]);

  const ok = validation.validateAnswers(schema, { f_1: "M" });
  const ko = validation.validateAnswers(schema, { f_1: "XXL" });

  assert.equal(ok.valid, true);
  assert.equal(ko.valid, false);
});

test("una scelta multipla accetta solo opzioni dell'elenco", () => {
  const schema = schemaWith([
    { id: "f_1", type: "multiple_choice", label: "Giorni", options: ["Lun", "Mer"] },
  ]);

  assert.equal(validation.validateAnswers(schema, { f_1: ["Lun", "Mer"] }).valid, true);
  assert.equal(validation.validateAnswers(schema, { f_1: ["Lun", "Ven"] }).valid, false);
});

test("email, telefono, numero e data si controllano davvero", () => {
  const schema = schemaWith([
    { id: "f_mail", type: "email", label: "Email" },
    { id: "f_tel", type: "phone", label: "Telefono" },
    { id: "f_num", type: "number", label: "Numero" },
    { id: "f_data", type: "date", label: "Data" },
  ]);

  const ko = validation.validateAnswers(schema, {
    f_mail: "non-una-email",
    f_tel: "abc",
    f_num: "tre",
    f_data: "32/13/2026",
  });

  assert.deepEqual(Object.keys(ko.errors).sort(), [
    "f_data",
    "f_mail",
    "f_num",
    "f_tel",
  ]);

  const ok = validation.validateAnswers(schema, {
    f_mail: "Genitore@Example.IT",
    f_tel: "+39 333 1234567",
    f_num: "12,5",
    f_data: "2026-08-25T10:00:00.000Z",
  });

  assert.equal(ok.valid, true);
  assert.equal(ok.answers.f_mail, "genitore@example.it");
  assert.equal(ok.answers.f_num, "12.5");
  assert.equal(ok.answers.f_data, "2026-08-25");
});

test("un allegato obbligatorio si soddisfa con un file, non con una stringa", () => {
  const schema = schemaWith([
    { id: "f_1", type: "file_upload", label: "Certificato", required: true },
  ]);

  const finto = validation.validateAnswers(schema, {
    f_1: "https://esempio.invalid/certificato.pdf",
  });
  assert.equal(finto.valid, false);
  assert.equal(finto.answers.f_1, undefined, "un URL non diventa un allegato");

  const vero = validation.validateAnswers(schema, {}, ["f_1"]);
  assert.equal(vero.valid, true);
});

test("le risposte a campi che non esistono nel modulo non vengono salvate", () => {
  const schema = schemaWith([{ id: "f_1", type: "short_text", label: "Nome" }]);

  const result = validation.validateAnswers(schema, {
    f_1: "Mario",
    f_intruso: "qualcosa",
  });

  assert.deepEqual(Object.keys(result.answers), ["f_1"]);
});

test("una risposta lunghissima viene tagliata invece di essere salvata intera", () => {
  const schema = schemaWith([{ id: "f_1", type: "long_text", label: "Note" }]);

  const result = validation.validateAnswers(schema, {
    f_1: "x".repeat(validation.FORM_LIMITS.maxAnswerLength * 2),
  });

  assert.equal(result.answers.f_1.length, validation.FORM_LIMITS.maxAnswerLength);
});

test("le sezioni non producono risposte", () => {
  const schema = schemaWith([
    { id: "f_sez", type: "section", label: "Dati" },
    { id: "f_1", type: "short_text", label: "Nome" },
  ]);

  const result = validation.validateAnswers(schema, { f_sez: "x", f_1: "Mario" });

  assert.deepEqual(Object.keys(result.answers), ["f_1"]);
});

test("un modulo senza campi da compilare non si pubblica", () => {
  const schema = schemaWith([{ type: "section", label: "Solo un titolo" }]);

  assert.equal(validation.validateSchemaForPublish(schema).valid, false);
});

test("una tendina senza opzioni non si pubblica ma si salva come bozza", () => {
  const schema = schemaWith([{ type: "dropdown", label: "Taglia", options: [] }]);

  assert.equal(validation.validateSchema(schema).valid, true);
  assert.equal(validation.validateSchemaForPublish(schema).valid, false);
});

test("i moduli pubblici accettano meno tipi di file di quelli autenticati", () => {
  assert.equal(validation.isPublicFormUploadMimeType("application/pdf"), true);
  assert.equal(validation.isPublicFormUploadMimeType("image/png"), true);
  assert.equal(
    validation.isPublicFormUploadMimeType(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ),
    false,
  );
});

/* -------------------------------------------------------------- precompilazione */

test("i dati gia noti non si richiedono", () => {
  const schema = schemaWith([
    { id: "f_nome", type: "short_text", label: "Nome", binding: "athlete.firstName" },
    { id: "f_tel", type: "phone", label: "Telefono", binding: "guardian.phone" },
    { id: "f_note", type: "long_text", label: "Note" },
    { id: "f_doc", type: "file_upload", label: "Documento", binding: "" },
  ]);

  const answers = prefill.buildPrefilledAnswers(schema, {
    athlete: { first_name: "Mario" },
    guardian: { phone: "3331234567" },
  });

  assert.deepEqual(answers, { f_nome: "Mario", f_tel: "3331234567" });
});

test("una tendina non si precompila con un valore che non e fra le opzioni", () => {
  const schema = schemaWith([
    {
      id: "f_sesso",
      type: "dropdown",
      label: "Sesso",
      binding: "athlete.gender",
      options: ["Maschile", "Femminile"],
    },
  ]);

  assert.deepEqual(
    prefill.buildPrefilledAnswers(schema, { athlete: { data: { gender: "M" } } }),
    {},
  );
  assert.deepEqual(
    prefill.buildPrefilledAnswers(schema, {
      athlete: { data: { gender: "Maschile" } },
    }),
    { f_sesso: "Maschile" },
  );
});

/* ------------------------------------------------------------- proposta */

test("una compilazione dice cosa cambierebbe, campo per campo", () => {
  const schema = schemaWith([
    { id: "f_nome", type: "short_text", label: "Nome", binding: "athlete.firstName" },
    { id: "f_cf", type: "short_text", label: "CF", binding: "athlete.fiscalCode" },
    { id: "f_tel", type: "phone", label: "Telefono", binding: "guardian.phone" },
    { id: "f_note", type: "long_text", label: "Note" },
  ]);

  const changeSet = changes.buildChangeSet({
    schema,
    answers: {
      f_nome: "Mario",
      f_cf: "RSSMRA10E04H501U",
      f_tel: "3331234567",
      f_note: "Allergico alle arachidi",
    },
    selections: [{ subject: "athlete", recordId: "atleta-1", label: "Mario Rossi" }],
    records: {
      athlete: { first_name: "Mario", data: {} },
      guardian: null,
    },
  });

  const atleta = changeSet.subjects.find((entry) => entry.subject === "athlete");
  const genitore = changeSet.subjects.find((entry) => entry.subject === "guardian");

  assert.equal(atleta.mode, "update");
  assert.equal(
    atleta.changes.find((change) => change.binding === "athlete.firstName").kind,
    "unchanged",
  );
  assert.equal(
    atleta.changes.find((change) => change.binding === "athlete.fiscalCode").kind,
    "add",
  );
  assert.equal(genitore.mode, "create");
  assert.deepEqual(changeSet.unmappedAnswers, [
    { fieldId: "f_note", label: "Note", value: "Allergico alle arachidi" },
  ]);
});

test("un dato di sola lettura non entra mai nella proposta", () => {
  const schema = schemaWith([
    { id: "f_club", type: "short_text", label: "Societa", binding: "club.name" },
    {
      id: "f_cat",
      type: "short_text",
      label: "Categoria",
      binding: "athlete.categoryName",
    },
  ]);

  const changeSet = changes.buildChangeSet({
    schema,
    answers: { f_club: "Altra ASD", f_cat: "Allievi" },
    selections: [],
    records: { athlete: { category_name: "Pulcini" } },
  });

  assert.deepEqual(changeSet.subjects, []);
});

test("una risposta vuota non cancella un dato che c'era", () => {
  const schema = schemaWith([
    { id: "f_tel", type: "phone", label: "Telefono", binding: "athlete.phone" },
  ]);

  const changeSet = changes.buildChangeSet({
    schema,
    answers: { f_tel: "" },
    selections: [{ subject: "athlete", recordId: "a1", label: "Mario Rossi" }],
    records: { athlete: { data: { phone: "3331234567" } } },
  });

  assert.equal(changeSet.subjects[0].changes[0].kind, "empty");
  assert.equal(changes.changeSetHasWrites(changeSet), false);
});

/* ------------------------------------------------------------- duplicati */

test("si riconosce un duplicato dal codice fiscale, dal nome o dall'email", () => {
  const probe = {
    subject: "athlete",
    fiscalCode: "RSSMRA10E04H501U",
    firstName: "Mario",
    lastName: "Rossi",
    birthDate: "2010-05-04",
    email: "mario@example.it",
    phone: "",
  };

  const matches = changes.matchDuplicates(probe, [
    { id: "a1", label: "Mario Rossi", fiscalCode: "rssmra10e04h501u" },
    {
      id: "a2",
      label: "Mario Rossi",
      firstName: "Mario",
      lastName: "Rossi",
      birthDate: "2010-05-04T00:00:00.000Z",
    },
    { id: "a3", label: "Altro", email: "mario@example.it" },
    { id: "a4", label: "Estraneo", firstName: "Luca", lastName: "Bianchi" },
  ]);

  assert.deepEqual(
    matches.map((match) => [match.recordId, match.reasons]),
    [
      ["a1", ["fiscal_code"]],
      ["a2", ["name_and_birth_date"]],
      ["a3", ["email"]],
    ],
  );
});

test("un omonimo con data di nascita diversa non e un duplicato", () => {
  const matches = changes.matchDuplicates(
    {
      subject: "athlete",
      fiscalCode: "",
      firstName: "Mario",
      lastName: "Rossi",
      birthDate: "2010-05-04",
      email: "",
      phone: "",
    },
    [
      {
        id: "a1",
        label: "Mario Rossi",
        firstName: "Mario",
        lastName: "Rossi",
        birthDate: "2012-01-01",
      },
    ],
  );

  assert.deepEqual(matches, []);
});

/* --------------------------------------------------------- modelli di partenza */

test("il modello di iscrizione online e pubblicabile cosi com'e", () => {
  const schema = model.normalizeFormSchema(
    starters.createStarterSchema("online_enrollment"),
  );

  assert.equal(validation.validateSchemaForPublish(schema).valid, true);
  assert.deepEqual(model.getSchemaSubjects(schema), ["athlete", "guardian"]);
});

test("ogni modello di partenza produce uno schema valido", () => {
  for (const template of starters.STARTER_TEMPLATES) {
    const schema = model.normalizeFormSchema(
      starters.createStarterSchema(template.key),
    );
    assert.equal(
      validation.validateSchema(schema).valid,
      true,
      `${template.key} non e valido`,
    );
  }
});
