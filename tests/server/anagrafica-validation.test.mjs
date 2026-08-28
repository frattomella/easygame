import assert from "node:assert/strict";
import test from "node:test";

import {
  AnagraficaValidationError,
  assertAnagraficaIsValid,
  normalizeAnagraficaText,
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

/* --------------------------- maiuscola iniziale lato server (RC Fix 2, punto 2) */

/**
 * La regola dei nomi non e piu solo dei campi di testo.
 *
 * `CapitalizedInput` la applica all'uscita dal campo, e finisce li: l'import
 * atleti da file — cioe il modo in cui un club carica i primi duecento nomi —
 * la aggirava del tutto. Un foglio scritto in minuscolo restava in minuscolo,
 * e nell'elenco ordinato alfabeticamente i nomi importati e quelli digitati
 * sembravano due archivi diversi.
 */

test("i nomi di un atleta si normalizzano prima della scrittura", () => {
  const input = {
    first_name: "mario",
    last_name: "de luca",
    data: {
      birthPlace: "reggio nell'emilia",
      city: "roma",
      address: "via dei mestieri, 4",
      guardians: [{ name: "anna maria", surname: "d'angelo" }],
    },
  };

  normalizeAnagraficaText("athletes", input);

  assert.equal(input.first_name, "Mario");
  assert.equal(input.last_name, "De Luca");
  assert.equal(input.data.birthPlace, "Reggio nell'Emilia");
  assert.equal(input.data.city, "Roma");
  assert.equal(input.data.address, "Via dei Mestieri, 4");
  assert.equal(input.data.guardians[0].name, "Anna Maria");
  assert.equal(
    input.data.guardians[0].surname,
    "D'Angelo",
    "il genitore e una persona come l'atleta",
  );
});

test("allenatori, staff e soci passano dalla stessa regola", () => {
  for (const resource of ["trainers", "staff_members", "members"]) {
    const input = { payload: { name: "o'connor", surname: "rossi" } };
    normalizeAnagraficaText(resource, input);

    assert.equal(input.payload.name, "O'Connor", resource);
    assert.equal(input.payload.surname, "Rossi", resource);
  }
});

/**
 * Cio che non e una parola di una lingua non si tocca.
 *
 * Un codice fiscale, un IBAN, un'email e un numero di tessera sono
 * identificatori: capitalizzarli li rompe. E una maiuscola gia scritta e una
 * decisione di chi l'ha scritta — un cognome in stampatello e come sta sul
 * documento.
 */
test("codici, recapiti e maiuscole volute restano intatti", () => {
  const input = {
    payload: {
      name: "MARIO",
      surname: "McDonald",
      email: "mario.rossi@example.org",
      fiscalCode: "rsSmra10e12h501u",
      iban: "it60x0542811101000000123456",
      membershipNumber: "abc123",
      notes: "iscritto a settembre",
    },
  };

  normalizeAnagraficaText("trainers", input);

  assert.equal(input.payload.name, "MARIO", "lo stampatello e una scelta");
  assert.equal(input.payload.surname, "McDonald");
  assert.equal(input.payload.email, "mario.rossi@example.org");
  assert.equal(input.payload.fiscalCode, "rsSmra10e12h501u");
  assert.equal(input.payload.iban, "it60x0542811101000000123456");
  assert.equal(input.payload.membershipNumber, "abc123");
  assert.equal(input.payload.notes, "iscritto a settembre");
});

test("una risorsa che non e un'anagrafica di persona non viene toccata", () => {
  const input = { payload: { name: "maglia da gara" } };
  normalizeAnagraficaText("clothing_items", input);

  assert.equal(input.payload.name, "maglia da gara");
});

/**
 * La normalizzazione sta accanto alla validazione, in tutte e cinque le
 * scritture.
 *
 * `resources.ts` e il punto di ingresso unico dei dati (vedi CLAUDE.md, §2), e
 * ha cinque punti in cui una scrittura viene validata. Se la maiuscola si
 * applicasse in quattro, il quinto sarebbe la strada per cui un nome entra in
 * minuscolo — e nessuno saprebbe quale.
 */
test("ogni scrittura validata e anche normalizzata", async () => {
  const { readFileSync } = await import("node:fs");
  const path = await import("node:path");
  const source = readFileSync(
    path.join(process.cwd(), "src", "lib", "server", "resources.ts"),
    "utf8",
  );

  const validations = source.match(/assertAnagraficaIsValid\(/g) || [];
  const normalizations = source.match(/normalizeAnagraficaText\(/g) || [];

  assert.ok(validations.length >= 5, "le scritture validate sono almeno cinque");
  assert.equal(
    normalizations.length,
    validations.length,
    "ogni assertAnagraficaIsValid deve avere accanto la sua normalizeAnagraficaText",
  );
});

/**
 * La stessa lettera scritta in due modi.
 *
 * Visto cercando sullo staging: l'atleta salvata come `Niccolò` **non si
 * trovava** digitando «Niccolò», e si trovava digitando «Niccolo». La causa
 * non era la ricerca: il nome era in archivio in forma **decomposta** — `o`
 * piu accento combinante — perche cosi era arrivato dal file di import.
 * `ILIKE '%Niccolò%'` su quella stringa non trova niente; `'%Niccolo%'` si,
 * perche le lettere di base ci sono tutte.
 *
 * Verificato sul database: `octet_length` 9 su 8 caratteri, e
 * `first_name = normalize(first_name, NFC)` falso.
 */
test("un nome in forma decomposta viene salvato in forma composta", () => {
  // Costruita a mano invece che scritta come lettera: un editor che salva in
  // NFC renderebbe il test vuoto senza farlo fallire.
  const decomposto = "Niccolo" + String.fromCharCode(0x0300);
  const composto = "Niccol" + String.fromCharCode(0x00f2);
  assert.equal(decomposto.length, 8);
  assert.equal(composto.length, 7);
  assert.notEqual(decomposto, composto);

  const input = {
    first_name: decomposto,
    last_name: "D'Angelo" + String.fromCharCode(0x0300),
  };
  normalizeAnagraficaText("simplified_athletes", input);

  assert.equal(input.first_name, composto);
  assert.equal(input.first_name.length, 7);
  assert.equal(input.last_name, input.last_name.normalize("NFC"));
});
test("la normalizzazione non tocca chi era gia in forma composta", () => {
  const input = { first_name: "Niccolò", last_name: "De Luca" };
  normalizeAnagraficaText("simplified_athletes", input);

  assert.equal(input.first_name, "Niccolò");
  assert.equal(input.last_name, "De Luca");
});

test("vale anche per i dati dentro `data` e per i genitori", () => {
  const input = {
    first_name: "marta",
    last_name: "rossi",
    data: {
      birthPlace: "Forlì",
      guardians: [{ firstName: "Martì", lastName: "Brùno" }],
    },
  };

  normalizeAnagraficaText("simplified_athletes", input);

  assert.equal(input.data.birthPlace, "Forlì".normalize("NFC"));
  assert.equal(
    input.data.guardians[0].firstName,
    input.data.guardians[0].firstName.normalize("NFC"),
  );
  assert.equal(input.data.guardians[0].firstName, "Martì");
});
