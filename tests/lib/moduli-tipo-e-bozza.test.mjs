import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

/**
 * **Moduli online: il tipo, il catalogo e la bozza locale** (Wave 6, lane 6F).
 *
 * Tre cose vanno dimostrate, non affermate:
 *
 * 1. **un modulo sa dire a cosa serve.** Il menu «cosa vuoi rinnovare» della
 *    famiglia offriva ogni modulo pubblicato del club, questionari di
 *    gradimento compresi (W6-42/W6-46). La risposta e configurazione, con una
 *    deduzione per i moduli scritti prima che la configurazione esistesse — e
 *    la deduzione deve sbagliare **in un verso solo**;
 * 2. **un modulo nato da un modello sa da dove viene** (W6-45). Prima era
 *    indistinguibile da uno scritto a mano;
 * 3. **la bozza locale non conserva cio che non deve conservare** (W6-48).
 *    Niente file, niente consensi, niente firme, e sparisce all'invio.
 */

let model;
let catalogo;
let bozze;

before(async () => {
  model = await import("../../src/lib/forms/model.ts");
  catalogo = await import("../../src/lib/forms/catalog.ts");
  bozze = await import("../../src/lib/forms/draft-storage.ts");
});

const schema = (fields, settings = {}) =>
  model.normalizeFormSchema({
    title: "Modulo",
    description: "",
    fields,
    settings,
  });

const campo = (extra) => ({
  id: extra.id || `f_${extra.type}`,
  type: "short_text",
  label: "Campo",
  ...extra,
});

/* ------------------------------------------------- a cosa serve un modulo */

test("un modulo che raccoglie l'atleta e di iscrizione, anche senza dichiararlo", () => {
  const iscrizione = schema([
    campo({ id: "f_nome", binding: "athlete.firstName" }),
    campo({ id: "f_cognome", binding: "athlete.lastName" }),
  ]);

  assert.equal(iscrizione.settings.purpose, "");
  assert.equal(model.isEnrollmentForm(iscrizione), true);
});

test("un modulo che non raccoglie l'atleta non e di iscrizione", () => {
  /* Il questionario di gradimento del difetto W6-46, in due campi. */
  const questionario = schema([
    campo({ id: "f_voto", type: "dropdown", label: "Come e andata?" }),
    campo({ id: "f_note", type: "long_text", label: "Suggerimenti" }),
  ]);

  assert.equal(model.isEnrollmentForm(questionario), false);
});

test("cio che il club dichiara vince sulla deduzione, nei due versi", () => {
  const campiAtleta = [campo({ id: "f_nome", binding: "athlete.firstName" })];

  assert.equal(
    model.isEnrollmentForm(schema(campiAtleta, { purpose: "generic" })),
    false,
    "un modulo dichiarato «altro» non deve comparire nel rinnovo anche se nomina l'atleta",
  );

  assert.equal(
    model.isEnrollmentForm(schema([campo({ id: "f_x" })], { purpose: "enrollment" })),
    true,
  );
});

test("una destinazione d'uso sconosciuta torna a «non dichiarata», non ad «altro»", () => {
  const inventata = schema([campo({ id: "f_nome", binding: "athlete.firstName" })], {
    purpose: "iscrizione-2026",
  });

  assert.equal(inventata.settings.purpose, "");
  assert.equal(
    model.isEnrollmentForm(inventata),
    true,
    "scartare un valore inventato deve restituire la deduzione, non spegnere il rinnovo",
  );
});

test("la destinazione d'uso e la provenienza contano come modifiche da pubblicare", () => {
  const campi = [campo({ id: "f_nome", binding: "athlete.firstName" })];

  assert.equal(
    model.schemasAreEqual(schema(campi), schema(campi, { purpose: "generic" })),
    false,
  );
  assert.equal(
    model.schemasAreEqual(schema(campi), schema(campi, { catalogKey: "x" })),
    false,
  );
});

/* --------------------------------------------------- il catalogo dei modelli */

test("il catalogo distribuisce solo voci di classe A e attive", () => {
  assert.ok(catalogo.DISTRIBUTABLE_FORM_CATALOG.length > 0);
  for (const voce of catalogo.DISTRIBUTABLE_FORM_CATALOG) {
    assert.equal(voce.catalogClass, "A");
    assert.equal(voce.status, "active");
  }
});

test("ogni voce dichiara chi risponde del contenuto e quando e stato riletto", () => {
  for (const voce of catalogo.FORM_CATALOG) {
    assert.ok(voce.editorialOwner, `${voce.key} non dice chi ne risponde`);
    assert.match(
      voce.lastReviewedAt,
      /^\d{4}-\d{2}-\d{2}$/,
      `${voce.key} non dice quando e stato riletto`,
    );
    assert.ok(voce.description, `${voce.key} non ha una riga di descrizione`);
  }
});

test("«modulo vuoto» non e una voce di catalogo", () => {
  /*
    Un foglio bianco non e un modello consigliato: e il pulsante «Nuovo
    modulo». Mescolarli e cio che il difetto chiedeva di smettere di fare.
  */
  assert.equal(catalogo.findFormCatalogEntry("blank"), null);
});

test("la copia adottata porta provenienza e destinazione d'uso", () => {
  const voce = catalogo.findFormCatalogEntry("online_enrollment");
  const copia = catalogo.buildFormFromCatalog(voce);

  assert.equal(copia.settings.catalogKey, "online_enrollment");
  assert.equal(copia.settings.purpose, "enrollment");
  assert.equal(model.isEnrollmentForm(copia), true);
});

test("il consenso medico e dichiarato «altro»: raccoglie l'atleta ma non lo iscrive", () => {
  const voce = catalogo.findFormCatalogEntry("medical_consent");
  const copia = catalogo.buildFormFromCatalog(voce);

  assert.equal(copia.settings.purpose, "generic");
  assert.equal(
    model.isEnrollmentForm(copia),
    false,
    "senza la dichiarazione la deduzione lo farebbe comparire nel menu del rinnovo",
  );
});

/* ------------------------------------------------------ la bozza nel browser */

const CAMPI_BOZZA = [
  { id: "f_nome", type: "short_text", label: "Nome", consentKey: "" },
  { id: "f_certificato", type: "file_upload", label: "Certificato", consentKey: "" },
  { id: "f_firma", type: "signature", label: "Firma", consentKey: "" },
  {
    id: "f_privacy",
    type: "checkbox",
    label: "Consenso al trattamento",
    consentKey: "privacy",
  },
  { id: "f_newsletter", type: "checkbox", label: "Voglio le notizie", consentKey: "" },
];

/** Un archivio locale finto, con lo stesso contratto di `localStorage`. */
const archivioFinto = () => {
  const dati = new Map();
  return {
    getItem: (key) => (dati.has(key) ? dati.get(key) : null),
    setItem: (key, value) => dati.set(key, String(value)),
    removeItem: (key) => dati.delete(key),
    size: () => dati.size,
  };
};

let archivio;

beforeEach(() => {
  archivio = archivioFinto();
  globalThis.window = { localStorage: archivio };
});

test("la bozza non contiene file, firme ne consensi", () => {
  const chiave = bozze.formDraftKey("iscrizione-abc123");

  bozze.saveFormDraft(chiave, CAMPI_BOZZA, {
    answers: {
      f_nome: "Mario",
      f_certificato: "certificato.pdf",
      f_firma: "data:image/png;base64,AAAA",
      f_privacy: true,
      f_newsletter: true,
    },
    respondentName: "Anna",
    respondentEmail: "anna@example.it",
  });

  const salvata = JSON.parse(archivio.getItem(chiave));

  assert.deepEqual(Object.keys(salvata.answers).sort(), [
    "f_newsletter",
    "f_nome",
  ]);
  assert.equal(salvata.answers.f_certificato, undefined);
  assert.equal(salvata.answers.f_firma, undefined);
  assert.equal(
    salvata.answers.f_privacy,
    undefined,
    "un consenso e un atto: ripristinarlo lo darebbe per dato",
  );
});

test("la bozza si cancella all'invio riuscito", () => {
  const chiave = bozze.formDraftKey("iscrizione-abc123");

  bozze.saveFormDraft(chiave, CAMPI_BOZZA, {
    answers: { f_nome: "Mario" },
    respondentName: "",
    respondentEmail: "",
  });
  assert.ok(bozze.readFormDraft(chiave));

  bozze.clearFormDraft(chiave);
  assert.equal(bozze.readFormDraft(chiave), null);
  assert.equal(archivio.size(), 0);
});

test("una bozza scaduta non si restituisce e non resta in archivio", () => {
  const chiave = bozze.formDraftKey("iscrizione-abc123");

  bozze.saveFormDraft(chiave, CAMPI_BOZZA, {
    answers: { f_nome: "Mario" },
    respondentName: "",
    respondentEmail: "",
  });

  const dopo = Date.now() + bozze.FORM_DRAFT_MAX_AGE_MS + 1000;
  assert.equal(bozze.readFormDraft(chiave, dopo), null);
  assert.equal(archivio.size(), 0, "una scaduta si cancella, non si lascia li");
});

test("due moduli e due figli sono quattro bozze distinte", () => {
  const chiavi = new Set([
    bozze.formDraftKey("modulo-uno"),
    bozze.formDraftKey("modulo-due"),
    bozze.formDraftKey("modulo-uno", "atleta-1"),
    bozze.formDraftKey("modulo-uno", "atleta-2"),
  ]);

  assert.equal(chiavi.size, 4);
});

test("senza archivio locale il modulo funziona lo stesso", () => {
  /* Navigazione privata, quota piena, dati dei siti bloccati. */
  globalThis.window = {
    get localStorage() {
      throw new Error("SecurityError");
    },
  };

  const chiave = bozze.formDraftKey("iscrizione-abc123");
  assert.doesNotThrow(() =>
    bozze.saveFormDraft(chiave, CAMPI_BOZZA, {
      answers: { f_nome: "Mario" },
      respondentName: "",
      respondentEmail: "",
    }),
  );
  assert.equal(bozze.readFormDraft(chiave), null);
  assert.doesNotThrow(() => bozze.clearFormDraft(chiave));
});
