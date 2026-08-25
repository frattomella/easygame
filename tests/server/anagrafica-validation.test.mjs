import assert from "node:assert/strict";
import test from "node:test";

import {
  AnagraficaValidationError,
  assertAnagraficaIsValid,
} from "../../src/lib/server/anagrafica.ts";

/**
 * Blocco 4 — validazione anagrafica lato server.
 *
 * Il client valida per aiutare; il server valida perche le API sono
 * raggiungibili anche senza il client. L'unica indulgenza e sui dati gia in
 * archivio: introdurre una regola nuova non deve rendere immodificabile una
 * scheda che quella regola l'ha sempre violata.
 */

const clubInput = (overrides = {}) => ({
  name: "ASD Prova",
  country: "Italia",
  postal_code: "20121",
  province: "MI",
  ...overrides,
});

test("un club valido passa senza obiezioni", () => {
  assert.doesNotThrow(() =>
    assertAnagraficaIsValid(
      "clubs",
      clubInput({
        legal_postal_code: "00184",
        legal_province: "RM",
        fiscal_code: "12345678901",
        representative_fiscal_code: "MRTMTT25D09F205Z",
      }),
    ),
  );
});

test("CAP e provincia non validi sono rifiutati alla creazione", () => {
  assert.throws(
    () => assertAnagraficaIsValid("clubs", clubInput({ postal_code: "201" })),
    (error) =>
      error instanceof AnagraficaValidationError &&
      error.field === "postal_code" &&
      /cinque cifre/.test(error.message),
  );

  assert.throws(
    () => assertAnagraficaIsValid("clubs", clubInput({ province: "ZZ" })),
    (error) =>
      error instanceof AnagraficaValidationError && error.field === "province",
  );
});

test("la sede legale ha messaggi propri, distinti da quella operativa", () => {
  assert.throws(
    () =>
      assertAnagraficaIsValid(
        "clubs",
        clubInput({ legal_postal_code: "abcde", legal_country: "Italia" }),
      ),
    (error) =>
      error.field === "legal_postal_code" && /Sede legale/.test(error.message),
  );
});

test("il codice fiscale del club accetta 11 cifre oppure 16 caratteri", () => {
  assert.doesNotThrow(() =>
    assertAnagraficaIsValid("clubs", clubInput({ fiscal_code: "12345678901" })),
  );
  assert.doesNotThrow(() =>
    assertAnagraficaIsValid(
      "clubs",
      clubInput({ fiscal_code: "MRTMTT25D09F205Z" }),
    ),
  );
  assert.throws(
    () => assertAnagraficaIsValid("clubs", clubInput({ fiscal_code: "1234" })),
    (error) => error.field === "fiscal_code",
  );
});

test("il codice fiscale del legale rappresentante deve avere il controllo giusto", () => {
  assert.throws(
    () =>
      assertAnagraficaIsValid(
        "clubs",
        clubInput({ representative_fiscal_code: "MRTMTT25D09F205A" }),
      ),
    (error) => error.field === "representative_fiscal_code",
  );
});

test("all'estero CAP e provincia non vengono giudicati", () => {
  assert.doesNotThrow(() =>
    assertAnagraficaIsValid(
      "clubs",
      clubInput({ country: "Svizzera", postal_code: "CH-8001", province: "ZH" }),
    ),
  );
});

test("un dato gia sbagliato in archivio non blocca la correzione del resto", () => {
  const existing = { postal_code: "201", province: "MI" };

  // Stesso CAP sbagliato di prima: la scrittura riguarda altro, passa.
  assert.doesNotThrow(() =>
    assertAnagraficaIsValid(
      "clubs",
      clubInput({ postal_code: "201", name: "Nome nuovo" }),
      existing,
    ),
  );

  // Ma se si tocca proprio quel campo, deve diventare valido.
  assert.throws(
    () =>
      assertAnagraficaIsValid("clubs", clubInput({ postal_code: "2012" }), existing),
    (error) => error.field === "postal_code",
  );
});

test("l'anagrafica atleta e validata dentro il blob data", () => {
  assert.throws(
    () =>
      assertAnagraficaIsValid("simplified_athletes", {
        data: { fiscalCode: "CODICE-FINTO" },
      }),
    (error) => error.field === "fiscalCode",
  );

  assert.throws(
    () =>
      assertAnagraficaIsValid("simplified_athletes", {
        data: { postalCode: "1", province: "MI", country: "Italia" },
      }),
    (error) => error.field === "postalCode",
  );

  assert.doesNotThrow(() =>
    assertAnagraficaIsValid("simplified_athletes", {
      data: {
        fiscalCode: "RSSMRA85M01H501Q",
        postalCode: "20121",
        province: "MI",
      },
    }),
  );
});

test("un atleta gia in archivio con codice fiscale sbagliato resta modificabile", () => {
  assert.doesNotThrow(() =>
    assertAnagraficaIsValid(
      "simplified_athletes",
      { data: { fiscalCode: "CODICE-FINTO", phone: "3331234567" } },
      { data: { fiscalCode: "CODICE-FINTO" } },
    ),
  );
});

test("le risorse senza anagrafica non vengono toccate dalla validazione", () => {
  assert.doesNotThrow(() =>
    assertAnagraficaIsValid("trainings", { postal_code: "non-un-cap" }),
  );
});

/**
 * Blocco 7 — allenatori, staff e soci sono persone anche loro.
 *
 * Vivono in `club_resource_items` e fino a qui nessuno ne validava il codice
 * fiscale: quello del club si controllava, quello di un socio no. Non era una
 * scelta, era un buco.
 */

const personInput = (payload) => ({ payload });

for (const resource of ["trainers", "staff_members", "members"]) {
  test(`un ${resource} valido passa senza obiezioni`, () => {
    assert.doesNotThrow(() =>
      assertAnagraficaIsValid(
        resource,
        personInput({
          name: "Mario",
          fiscalCode: "MRTMTT25D09F205Z",
          postalCode: "20121",
          province: "MI",
        }),
      ),
    );
  });

  test(`un ${resource} con codice fiscale inventato viene rifiutato`, () => {
    assert.throws(
      () =>
        assertAnagraficaIsValid(
          resource,
          personInput({ fiscalCode: "AAAAAA00A00A000A" }),
        ),
      (error) =>
        error instanceof AnagraficaValidationError &&
        error.field === "fiscalCode",
    );
  });

  test(`un ${resource} gia in archivio con dati sbagliati resta modificabile`, () => {
    assert.doesNotThrow(() =>
      assertAnagraficaIsValid(
        resource,
        personInput({ fiscalCode: "CODICE-FINTO", phone: "3331234567" }),
        personInput({ fiscalCode: "CODICE-FINTO" }),
      ),
    );
  });
}

test("il codice fiscale si accetta con qualunque nome di chiave storico", () => {
  for (const key of ["fiscalCode", "fiscal_code", "codiceFiscale"]) {
    assert.throws(
      () => assertAnagraficaIsValid("trainers", personInput({ [key]: "XXX" })),
      (error) => error instanceof AnagraficaValidationError,
      `la chiave ${key} deve essere validata come le altre`,
    );
  }
});

test("fuori dall'Italia CAP e provincia non si applicano", () => {
  assert.doesNotThrow(() =>
    assertAnagraficaIsValid(
      "staff_members",
      personInput({ country: "Svizzera", postalCode: "8001", province: "ZH" }),
    ),
  );
});

test("un CAP di quattro cifre in Italia viene rifiutato anche per un socio", () => {
  assert.throws(
    () =>
      assertAnagraficaIsValid("members", personInput({ postalCode: "2012" })),
    (error) =>
      error instanceof AnagraficaValidationError &&
      error.field === "postalCode",
  );
});
