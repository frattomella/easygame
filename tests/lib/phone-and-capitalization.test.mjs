import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PHONE_DIAL,
  PHONE_COUNTRIES,
  findCountryByDial,
  findPhoneCountry,
  formatPhoneNumber,
  isPlausiblePhoneNumber,
  normalizePhoneNumber,
  parsePhoneNumber,
} from "../../src/lib/phone-numbers.ts";

import {
  applyCapitalization,
  capitalizationModeForField,
  capitalizeName,
  capitalizeSentence,
} from "../../src/lib/text-capitalization.ts";

/**
 * Blocco 7, punti 10 e 11 — telefoni e maiuscole.
 *
 * Due regole condivise che devono valere ovunque, e due modi diversi di fare
 * danno: riscrivere un numero di telefono che non si e capito, e mettere una
 * maiuscola dove non va.
 */

// --- telefoni ----------------------------------------------------------------

test("l'elenco dei prefissi e coerente e parte dall'Italia", () => {
  assert.equal(PHONE_COUNTRIES[0].code, "IT");
  assert.equal(PHONE_COUNTRIES[0].dial, DEFAULT_PHONE_DIAL);

  for (const country of PHONE_COUNTRIES) {
    assert.match(country.code, /^[A-Z]{2}$/, `codice di ${country.name}`);
    assert.match(country.dial, /^\d{1,4}$/, `prefisso di ${country.name}`);
    assert.ok(country.flag.length >= 2, `bandiera di ${country.name}`);
    assert.ok(country.name, "ogni paese ha un nome");
  }

  const codes = PHONE_COUNTRIES.map((country) => country.code);
  assert.equal(new Set(codes).size, codes.length, "nessun paese ripetuto");
});

test("un numero italiano si legge in tutte le forme in cui e stato scritto", () => {
  for (const value of [
    "+39 333 1234567",
    "+393331234567",
    "0039 333 1234567",
    "+39-333-123-4567",
  ]) {
    const parsed = parsePhoneNumber(value);
    assert.equal(parsed.dial, "39", value);
    assert.equal(parsed.national, "3331234567", value);
    assert.equal(parsed.countryCode, "IT", value);
    assert.equal(parsed.assumedDefault, false, value);
  }
});

/**
 * Il punto piu importante: un numero senza prefisso **non** viene attribuito
 * all'Italia nel dato. La tendina mostra l'Italia come ipotesi, il valore
 * resta com'e.
 */
test("un numero senza prefisso non viene attribuito a nessun paese", () => {
  const parsed = parsePhoneNumber("333 1234567");

  assert.equal(parsed.dial, "");
  assert.equal(parsed.national, "3331234567");
  assert.equal(parsed.assumedDefault, true, "e un'ipotesi, non un dato");
  assert.equal(
    normalizePhoneNumber("333 1234567"),
    "333 1234567",
    "normalizzare non deve riscrivere cio che non si e capito",
  );
});

test("i prefissi lunghi vincono su quelli corti", () => {
  const dominican = parsePhoneNumber("+1809 5551234");
  assert.equal(dominican.countryCode, "DO");
  assert.equal(dominican.national, "5551234");

  /*
    `+1` e sia Canada sia Stati Uniti: vince il primo in elenco. Non e un
    difetto — il numero memorizzato e identico nei due casi, quindi la
    tendina mostra un paese e il dato non ne risente.
  */
  const northAmerican = parsePhoneNumber("+1 2125551234");
  assert.equal(northAmerican.countryCode, "CA");
  assert.equal(northAmerican.national, "2125551234");
});

test("un prefisso fuori elenco resta intatto invece di essere attribuito a caso", () => {
  const parsed = parsePhoneNumber("+998 901234567");
  assert.equal(parsed.assumedDefault, true);
  assert.equal(normalizePhoneNumber("+998 901234567"), "+998 901234567");
});

test("la forma memorizzata e sempre la stessa", () => {
  assert.equal(formatPhoneNumber("39", "333 123 4567"), "+39 3331234567");
  assert.equal(formatPhoneNumber("+39", "3331234567"), "+39 3331234567");
  assert.equal(formatPhoneNumber("39", ""), "", "un numero vuoto non ha prefisso");
  assert.equal(formatPhoneNumber("", "3331234567"), "3331234567");
  assert.equal(normalizePhoneNumber("0039 333 1234567"), "+39 3331234567");
});

test("un numero vuoto non diventa un prefisso orfano", () => {
  assert.equal(normalizePhoneNumber(""), "");
  assert.equal(normalizePhoneNumber(null), "");
  assert.equal(parsePhoneNumber("").national, "");
});

test("la plausibilita guarda la lunghezza, non la struttura del paese", () => {
  assert.equal(isPlausiblePhoneNumber("+39 3331234567"), true);
  assert.equal(isPlausiblePhoneNumber("+39 12"), false, "troppo corto");
  assert.equal(
    isPlausiblePhoneNumber("+39 12345678901234567"),
    false,
    "E.164 si ferma a 15 cifre",
  );
  assert.equal(isPlausiblePhoneNumber(""), false);
});

test("i paesi si trovano per codice e per prefisso", () => {
  assert.equal(findPhoneCountry("it")?.name, "Italia");
  assert.equal(findPhoneCountry("ZZ"), null);
  assert.equal(findCountryByDial("+39")?.code, "IT");
  assert.equal(findCountryByDial("")?.code, undefined);
});

// --- maiuscole ---------------------------------------------------------------

test("la prima lettera di ogni parola, non tutte le lettere", () => {
  assert.equal(capitalizeName("mario rossi"), "Mario Rossi");
  assert.equal(capitalizeName("MARIO ROSSI"), "MARIO ROSSI", "una sigla non si tocca");
  assert.equal(capitalizeName("mArIo"), "mArIo", "maiuscole interne: intenzionali");
});

test("le particelle in mezzo a un nome restano minuscole", () => {
  assert.equal(capitalizeName("mario de luca"), "Mario de Luca");
  assert.equal(capitalizeName("de luca"), "De Luca", "ma non se aprono il nome");
  assert.equal(capitalizeName("piazza dei mestieri"), "Piazza dei Mestieri");
  assert.equal(capitalizeName("van der berg"), "Van der Berg");
});

test("trattini e apostrofi sono separatori interni", () => {
  assert.equal(capitalizeName("anna-maria"), "Anna-Maria");
  assert.equal(capitalizeName("d'angelo"), "D'Angelo");
  assert.equal(capitalizeName("sant'agata"), "Sant'Agata");
});

test("le sigle e i codici con cifre non vengono toccati", () => {
  assert.equal(capitalizeName("ASD Prova"), "ASD Prova");
  assert.equal(capitalizeName("U15"), "U15");
  assert.equal(capitalizeName("A1 Centro"), "A1 Centro");
  assert.equal(capitalizeName("McDonald"), "McDonald");
});

test("gli spazi originali si conservano", () => {
  assert.equal(capitalizeName("  mario  rossi "), "  Mario  Rossi ");
  assert.equal(capitalizeName(""), "");
  assert.equal(capitalizeName("   "), "   ");
  assert.equal(capitalizeName(null), "");
});

test("una frase prende la maiuscola solo all'inizio", () => {
  assert.equal(
    capitalizeSentence("note sul certificato medico"),
    "Note sul certificato medico",
  );
  assert.equal(
    capitalizeSentence("Note gia corrette"),
    "Note gia corrette",
    "una frase gia giusta non si tocca",
  );
  assert.equal(capitalizeSentence("  scritto dopo spazi"), "  Scritto dopo spazi");
});

// --- quali campi ------------------------------------------------------------

test("email, password, codici e valori tecnici sono esclusi", () => {
  for (const field of [
    "email",
    "companyEmail",
    "password",
    "confirmPassword",
    "website",
    "url",
    "username",
    "fiscalCode",
    "fiscal_code",
    "codiceFiscale",
    "iban",
    "partitaIva",
    "membershipNumber",
    "numeroTessera",
    "phone",
    "telefono",
    "companyPec",
    "accessToken",
    "birthPlaceCode",
  ]) {
    assert.equal(
      capitalizationModeForField(field),
      "none",
      `${field} non deve essere capitalizzato`,
    );
  }
});

test("i campi anagrafici veri sono capitalizzati", () => {
  for (const field of ["name", "surname", "firstName", "lastName", "city", "address"]) {
    assert.equal(capitalizationModeForField(field), "name", field);
  }
});

test("note e descrizioni prendono la regola della frase", () => {
  for (const field of ["notes", "note", "description", "descrizione", "bio"]) {
    assert.equal(capitalizationModeForField(field), "sentence", field);
  }
});

test("un campo sconosciuto non viene rovinato per prudenza", () => {
  assert.equal(capitalizationModeForField(""), "none");
  assert.equal(capitalizationModeForField(null), "none");
});

test("applyCapitalization rispetta la modalita", () => {
  assert.equal(applyCapitalization("mario rossi", "name"), "Mario Rossi");
  assert.equal(applyCapitalization("una nota", "sentence"), "Una nota");
  assert.equal(
    applyCapitalization("mario.rossi@example.org", "none"),
    "mario.rossi@example.org",
  );
});
