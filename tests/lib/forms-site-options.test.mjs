import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * Sede e categoria dentro un modulo: le opzioni che il modulo non possiede.
 *
 * Il campo «Sede» sembra un menu a tendina come gli altri, e non lo e. Le
 * voci non le scrive chi costruisce il modulo: sono le sedi del club, e
 * cambiano senza che nessuno ripubblichi niente. Cio che va dimostrato qui e
 * la conseguenza che ne discende sulla sicurezza — chi compila un modulo
 * pubblico non manda un identificativo di sede, manda il testo di un'opzione
 * che il server ha appena messo lui, e un testo fuori da quell'elenco non ha
 * un percorso per diventare una sede.
 */

let model;
let options;
let validation;

before(async () => {
  model = await import("../../src/lib/forms/model.ts");
  options = await import("../../src/lib/forms/field-options.ts");
  validation = await import("../../src/lib/forms/validation.ts");
});

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

const schemaWith = (fields) =>
  model.normalizeFormSchema({
    title: "Iscrizione",
    description: "",
    fields,
    settings: {},
  });

const catalogOf = (siteNames, categoryNames = []) =>
  options.buildFormOptionCatalog({ siteNames, categoryNames });

/* --------------------------------------------------------- riempimento */

test("le sedi del club diventano le opzioni del campo", () => {
  const applied = options.applyServerFieldOptions(
    schemaWith([SITE_FIELD]),
    catalogOf(["Palestra Nord", "Palestra Sud"]),
  );

  assert.deepEqual(applied.fields[0].options, ["Palestra Nord", "Palestra Sud"]);
});

test("le opzioni scritte a mano vengono sostituite, non sommate", () => {
  const applied = options.applyServerFieldOptions(
    schemaWith([{ ...SITE_FIELD, options: ["Sede inventata"] }]),
    catalogOf(["Palestra Nord", "Palestra Sud"]),
  );

  assert.deepEqual(
    applied.fields[0].options,
    ["Palestra Nord", "Palestra Sud"],
    "un'opzione scritta nel modulo non deve poter aggiungere una sede",
  );
});

test("un club con una sede sola non vede la domanda", () => {
  const applied = options.applyServerFieldOptions(
    schemaWith([SITE_FIELD]),
    catalogOf(["Palestra unica"]),
  );

  assert.equal(
    applied.fields.length,
    0,
    "scegliere fra una possibilita non e una scelta: la domanda sparisce",
  );
});

test("un club senza sedi non vede la domanda", () => {
  const applied = options.applyServerFieldOptions(
    schemaWith([SITE_FIELD]),
    catalogOf([]),
  );

  assert.equal(applied.fields.length, 0);
});

test("una categoria sola resta una domanda: si conferma", () => {
  const applied = options.applyServerFieldOptions(
    schemaWith([CATEGORY_FIELD]),
    catalogOf([], ["Under 14"]),
  );

  assert.deepEqual(applied.fields[0].options, ["Under 14"]);
});

test("i campi normali non vengono toccati", () => {
  const normale = {
    id: "f_taglia",
    type: "dropdown",
    label: "Taglia",
    options: ["S", "M", "L"],
  };

  const applied = options.applyServerFieldOptions(
    schemaWith([normale, SITE_FIELD]),
    catalogOf(["Nord", "Sud"]),
  );

  assert.deepEqual(applied.fields[0].options, ["S", "M", "L"]);
});

test("le sedi ripetute o vuote non diventano due voci", () => {
  const catalog = catalogOf(["Nord", "nord", "  ", null, "Sud"]);
  assert.deepEqual(catalog.club_sites, ["Nord", "Sud"]);
});

/* ------------------------------------------------------------ sicurezza */

test("una sede fuori elenco viene rifiutata come qualunque scelta inventata", () => {
  const schema = options.applyServerFieldOptions(
    schemaWith([{ ...SITE_FIELD, required: true }]),
    catalogOf(["Palestra Nord", "Palestra Sud"]),
  );

  const esito = validation.validateAnswers(schema, {
    f_sede: "aaaaaaaa-0000-4000-8000-000000000001",
  });

  assert.equal(esito.valid, false);
  assert.ok(esito.errors.f_sede);
});

test("la sede di un altro club non e un'opzione di questo", () => {
  const schema = options.applyServerFieldOptions(
    schemaWith([SITE_FIELD]),
    catalogOf(["Palestra Nord", "Palestra Sud"]),
  );

  const esito = validation.validateAnswers(schema, {
    f_sede: "Palestra di un'altra societa",
  });

  assert.equal(esito.valid, false);
});

test("un modulo con il campo sede si pubblica senza scrivere opzioni", () => {
  const esito = validation.validateSchemaForPublish(
    schemaWith([{ ...SITE_FIELD, label: "Sede" }]),
  );

  assert.equal(
    esito.valid,
    true,
    `pubblicazione bloccata: ${esito.errors.join(" | ")}`,
  );
});

test("un menu a tendina normale senza opzioni resta non pubblicabile", () => {
  const esito = validation.validateSchemaForPublish(
    schemaWith([
      { id: "f_x", type: "dropdown", label: "Taglia", options: [] },
    ]),
  );

  assert.equal(esito.valid, false);
});
