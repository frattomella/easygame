import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  CLUB_PROFILE_SECTIONS,
  buildClubProfileSectionUpdate,
  clubProfileSectionSnapshot,
  emptyClubProfileDraft,
  isAutosaveClubSection,
  validateClubProfileSection,
} from "../../src/lib/club-profile.ts";
import { createCoalescingSaver } from "../../src/lib/performance.ts";

/**
 * Autosave della scheda club.
 *
 * **Blocco 4** aveva messo in autosave le tre schede descrittive e lasciato le
 * altre al pulsante «Salva», con una motivazione ragionevole: un IBAN salvato
 * a meta digitazione dirotta gli incassi.
 *
 * **RC Fix 1** porta tutte le schede-modulo allo stesso comportamento. Il
 * rischio non e sparito, e cambiato posto: non lo trattiene piu un clic in
 * piu — che salvava volentieri un IBAN sbagliato — ma
 * `validateClubProfileSection`, che **non scrive** un valore che non e ancora
 * un valore. Restano fuori le due schede che non sono un modulo: Stagioni, che
 * ha operazioni proprie con conferma, e Account e Fatturazione, in sola
 * lettura.
 *
 * Cio che questi test difendono: la classificazione, il perimetro di ogni
 * sezione — perche una modifica al telefono non deve diventare una modifica
 * all'IBAN — e la validazione che sostituisce il pulsante.
 */

const draft = () => ({
  ...emptyClubProfileDraft(),
  name: "ASD Prova",
  logoUrl: "data:image/png;base64,AAA",
  types: ["Dilettante"],
  sports: ["Calcio"],
  foundingYear: "2012",
  address: "Via Roma 1",
  city: "Milano",
  postalCode: "20121",
  province: "MI",
  region: "Lombardia",
  country: "Italia",
  companyEmail: "info@example.com",
  companyPec: "asd@pec.it",
  contact1Phone: "0212345678",
  website: "https://example.com",
  businessName: "ASD Prova",
  vatNumber: "12345678903",
  fiscalCode: "12345678903",
  taxRegime: "398/1991 (ASD/SSD)",
  atecoCode: "93.12.00",
  sdiCode: "ABCDEF1",
  legalAddress: "Via Roma 1",
  legalCity: "Milano",
  legalPostalCode: "20121",
  legalRegion: "Lombardia",
  legalProvince: "MI",
  legalCountry: "Italia",
  bankName: "Banca Prova",
  iban: "IT60X0542811101000000123456",
  federations: [{ id: "fed-1", name: "FIGC", registrationNumber: "123" }],
});

test("si salvano da sole tutte le schede che sono un modulo", () => {
  const autosave = CLUB_PROFILE_SECTIONS.filter((section) => section.autosave).map(
    (section) => section.id,
  );

  assert.deepEqual(autosave, [
    "generale",
    "contatti",
    "social",
    "fiscali",
    "bancari",
    "federazione",
    "pagamenti",
  ]);

  for (const selfManaged of ["stagioni", "fatturazione"]) {
    assert.equal(
      isAutosaveClubSection(selfManaged),
      false,
      `${selfManaged} non e un modulo da salvare`,
    );
  }

  // Ogni sezione dichiara perche: la regola resta leggibile fra un anno.
  assert.equal(
    CLUB_PROFILE_SECTIONS.every((section) => section.reason.length > 10),
    true,
  );
});

test("la scheda Generale non tocca dati economici ne stagioni", () => {
  const update = buildClubProfileSectionUpdate("generale", draft());

  assert.deepEqual(Object.keys(update.columns).sort(), [
    "address",
    "city",
    "country",
    "logo_url",
    "name",
    "postal_code",
    "province",
    "region",
  ]);
  assert.deepEqual(Object.keys(update.settings).sort(), [
    "foundingYear",
    "sport",
    "sports",
    "type",
    "types",
  ]);

  const written = JSON.stringify(update);
  for (const forbidden of [
    "iban",
    "bank_name",
    "vat_number",
    "fiscal_code",
    "seasons",
    "activeSeasonId",
    "paymentSettings",
    "subscription",
    "federations",
  ]) {
    assert.equal(
      written.includes(forbidden),
      false,
      `la scheda Generale non deve scrivere ${forbidden}`,
    );
  }
});

test("Contatti e Social restano nel proprio perimetro", () => {
  const contatti = buildClubProfileSectionUpdate("contatti", draft());
  assert.deepEqual(Object.keys(contatti.columns).sort(), [
    "contact_email",
    "contact_phone",
    "pec",
  ]);
  assert.equal(contatti.settings.contact1Phone, "0212345678");
  assert.equal(Object.hasOwn(contatti.settings, "iban"), false);

  const social = buildClubProfileSectionUpdate("social", draft());
  assert.deepEqual(Object.keys(social.columns), []);
  assert.equal(social.settings.website, "https://example.com");
});

test("ogni sezione scrive solo il proprio, anche quelle nuove", () => {
  const fiscali = buildClubProfileSectionUpdate("fiscali", draft());
  assert.equal(fiscali.columns.vat_number, "12345678903");
  assert.equal(fiscali.columns.legal_city, "Milano");
  assert.equal(
    Object.hasOwn(fiscali.columns, "iban"),
    false,
    "i dati fiscali non toccano il conto",
  );
  assert.equal(
    JSON.stringify(fiscali).includes("federations"),
    false,
    "ne le affiliazioni",
  );

  const bancari = buildClubProfileSectionUpdate("bancari", draft());
  assert.deepEqual(Object.keys(bancari.columns).sort(), ["bank_name", "iban"]);
  assert.equal(bancari.columns.iban, "IT60X0542811101000000123456");
  assert.equal(
    JSON.stringify(bancari).includes("vat_number"),
    false,
    "il conto non tocca i dati fiscali",
  );

  const federazione = buildClubProfileSectionUpdate("federazione", draft());
  assert.deepEqual(Object.keys(federazione.columns), []);
  assert.equal(federazione.settings.federations.length, 1);

  const pagamenti = buildClubProfileSectionUpdate("pagamenti", {
    ...draft(),
    paymentSettings: { enabled: true },
  });
  assert.deepEqual(Object.keys(pagamenti.columns), []);
  assert.deepEqual(Object.keys(pagamenti.settings), ["paymentSettings"]);
  assert.equal(pagamenti.settings.paymentSettings.enabled, true);
  assert.equal(
    pagamenti.settings.paymentSettings.currency,
    "EUR",
    "si scrive la forma normalizzata, non il frammento che arriva dallo stato",
  );
});

test("una sezione che non e un modulo non produce nessuna scrittura", () => {
  for (const selfManaged of ["stagioni", "fatturazione"]) {
    assert.deepEqual(buildClubProfileSectionUpdate(selfManaged, draft()), {
      columns: {},
      settings: {},
    });
  }
});

test("l'IBAN a meta digitazione non viene scritto", () => {
  const half = { ...draft(), iban: "IT60X05" };
  assert.match(
    validateClubProfileSection("bancari", half),
    /IBAN non e ancora completo/,
  );

  assert.equal(validateClubProfileSection("bancari", draft()), null);
  assert.equal(
    validateClubProfileSection("bancari", { ...draft(), iban: "" }),
    null,
    "un conto non ancora inserito e uno stato legittimo, non un errore",
  );
  assert.equal(
    validateClubProfileSection("bancari", {
      ...draft(),
      iban: "it60 x054 2811 1010 0000 0123 456",
    }),
    null,
    "spazi e minuscole sono come si digita un IBAN, non un errore",
  );
});

test("i dati fiscali incompleti restano fuori dall'archivio", () => {
  const base = draft();

  assert.match(
    validateClubProfileSection("fiscali", { ...base, vatNumber: "1234" }),
    /partita IVA/,
  );
  assert.equal(
    validateClubProfileSection("fiscali", { ...base, vatNumber: "IT 12345678903" }),
    null,
    "il prefisso IT e gli spazi si digitano: non sono un errore",
  );
  assert.match(
    validateClubProfileSection("fiscali", { ...base, fiscalCode: "ABC" }),
    /codice fiscale della societa/,
  );
  assert.match(
    validateClubProfileSection("fiscali", {
      ...base,
      representativeFiscalCode: "RSSMRA",
    }),
    /legale rappresentante/,
  );
  assert.match(
    validateClubProfileSection("fiscali", { ...base, legalPostalCode: "201" }),
    /CAP della sede legale/,
  );
  assert.equal(validateClubProfileSection("fiscali", base), null);
});

test("un club senza nome non si salva", () => {
  assert.match(
    validateClubProfileSection("generale", { ...draft(), name: "  " }),
    /nome del club/,
  );
  assert.equal(validateClubProfileSection("generale", draft()), null);
});

test("l'impronta di una sezione non cambia da sola fra due render", () => {
  /*
    Difetto trovato in UAT su staging. La scheda Pagamenti costruiva la
    propria scrittura con `sanitizePaymentSettingsForStorage`, che marca
    `updatedAt` con **l'ora corrente**: l'impronta risultava diversa a ogni
    render, la sezione non tornava mai «pulita» e ogni tasto premuto in
    qualunque scheda della pagina riscriveva le impostazioni di incasso.
    Misurato sul club di staging: `paymentSettings.updatedAt` avanzava di
    pochi secondi mentre si digitava nella scheda Dati Bancari.

    L'invariante vale per **tutte** le sezioni: due letture della stessa
    bozza devono dare la stessa impronta, o l'autosave non si ferma mai.
  */
  const base = {
    ...draft(),
    paymentSettings: {
      enabled: true,
      currency: "EUR",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  };

  for (const section of CLUB_PROFILE_SECTIONS.filter((s) => s.autosave)) {
    assert.equal(
      clubProfileSectionSnapshot(section.id, base),
      clubProfileSectionSnapshot(section.id, base),
      `${section.id}: l'impronta cambia senza che cambi la bozza`,
    );
  }

  /*
    La scrittura puo contenere un'ora — normalizzare un provider mancante ne
    produce una — ma **l'impronta no**: e il confronto a dover essere stabile.
  */
  assert.equal(
    clubProfileSectionSnapshot("pagamenti", base).includes("updatedAt"),
    false,
    "l'ora di scrittura non entra nell'impronta",
  );
});

test("l'impronta cambia solo quando cambia la sezione interessata", () => {
  const base = draft();
  const withOtherSection = { ...base, iban: "IT60X0542811101000000999999" };

  assert.equal(
    clubProfileSectionSnapshot("generale", base),
    clubProfileSectionSnapshot("generale", withOtherSection),
  );
  assert.notEqual(
    clubProfileSectionSnapshot("generale", base),
    clubProfileSectionSnapshot("generale", { ...base, name: "ASD Nuova" }),
  );
  assert.notEqual(
    clubProfileSectionSnapshot("bancari", base),
    clubProfileSectionSnapshot("bancari", withOtherSection),
  );
});

test("le scritture ravvicinate vengono accorpate, l'ultima vince", async () => {
  const written = [];
  let resolveFirst;
  const firstWrite = new Promise((resolve) => {
    resolveFirst = resolve;
  });

  const save = createCoalescingSaver(async (value) => {
    written.push(value.name);
    if (written.length === 1) await firstWrite;
  });

  const inFlight = save({ name: "uno" });
  const second = save({ name: "due" });
  const third = save({ name: "tre" });
  resolveFirst();
  await Promise.all([inFlight, second, third]);

  assert.deepEqual(
    written,
    ["uno", "tre"],
    "lo stato intermedio viene scartato: verrebbe comunque sovrascritto",
  );
});

// --- la pagina -----------------------------------------------------------------

const PAGE = readFileSync(
  path.join(process.cwd(), "src/app/organization/page.tsx"),
  "utf8",
);
const SAVE_STATUS = readFileSync(
  path.join(process.cwd(), "src/components/ui/save-status.tsx"),
  "utf8",
);

test("l'autosave guarda tutte le sezioni, non quella aperta", () => {
  /*
    Era il difetto piu costoso: l'effetto dipendeva da `activeTab`, quindi
    cambiando scheda entro il secondo di attesa il timer veniva annullato e la
    modifica appena scritta spariva senza dire niente.
  */
  assert.match(PAGE, /for \(const section of AUTOSAVE_SECTIONS\)/);
  assert.equal(
    /isAutosaveClubSection\(activeTab\)/.test(PAGE),
    false,
    "l'autosave non deve piu dipendere dalla scheda aperta",
  );
});

test("dalla pagina Club sparisce il pulsante Salva", () => {
  assert.equal(
    /Salva Modifiche/.test(PAGE),
    false,
    "non c'e piu una scheda che lo richieda",
  );
  assert.equal(
    /window\.location\.reload/.test(PAGE),
    false,
    "il salvataggio non ricarica piu la pagina",
  );
  assert.equal(
    /updateClub\b/.test(PAGE),
    false,
    "il salvataggio monolitico riscriveva anche le sezioni gia salvate",
  );
});

test("un salvataggio riuscito non cancella l'errore di un'altra sezione", () => {
  /*
    Difetto trovato in UAT su staging: digitando un IBAN incompleto lo
    schermo mostrava l'errore per mezzo secondo e poi «Salvato», perche il
    successo di **un'altra** sezione sovrascriveva lo stato. Chi guardava
    leggeva che l'IBAN era stato salvato: non lo era.
  */
  assert.match(PAGE, /const blockingRef = React\.useRef<string \| null>\(null\)/);
  assert.match(PAGE, /blockingRef\.current = blocking;/);
  assert.match(
    PAGE,
    /if \(blockingRef\.current\) \{\s*setSaveError\(blockingRef\.current\);\s*setSaveState\("error"\);/,
    "dopo una scrittura riuscita lo stato deve restare l'errore, se ce n'e uno aperto",
  );
});

test("lo stato del salvataggio e discreto, temporaneo e condiviso", () => {
  assert.equal(
    /Le modifiche si salvano da sole/.test(SAVE_STATUS + PAGE),
    false,
    "il riquadro fisso era rumore permanente",
  );
  assert.match(SAVE_STATUS, /Salvataggio\.\.\./);
  assert.match(SAVE_STATUS, /SAVED_VISIBLE_MS/, "«Salvato» sparisce da solo");
  assert.equal(
    (PAGE.match(/<SaveStatus/g) || []).length,
    1,
    "uno solo, in testa alla pagina, valido per tutte le schede",
  );
});
