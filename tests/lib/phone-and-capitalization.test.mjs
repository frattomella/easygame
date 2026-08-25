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

/* ------------------------------------------------- Blocco 8: casi legacy */

/**
 * Il rischio vero non e il numero nuovo, e quello vecchio.
 *
 * Il Blocco 8 porta il campo condiviso anche nelle schede di **modifica**:
 * ogni numero gia in archivio viene ora aperto dentro il campo nuovo. Se
 * aprirlo bastasse a riscriverlo, un giro di correzioni di indirizzi
 * cambierebbe centinaia di numeri senza che nessuno lo abbia chiesto.
 */
test("aprire una scheda non riscrive un numero che non si e capito", () => {
  for (const legacy of [
    "333 1234567",
    "333-123-4567",
    "0331 123456",
    "tel. 333 1234567",
    "333 1234567 (casa)",
  ]) {
    assert.equal(
      normalizePhoneNumber(legacy),
      legacy,
      `${legacy} non deve essere riscritto`,
    );
  }
});

test("un numero legacy resta leggibile e modificabile senza perdere cifre", () => {
  const parsed = parsePhoneNumber("333-123-4567");

  assert.equal(parsed.national, "3331234567", "le cifre si conservano tutte");
  assert.equal(parsed.dial, "", "non si inventa un prefisso");
  assert.equal(
    parsed.assumedDefault,
    true,
    "il campo mostra l'Italia come ipotesi, ma l'ipotesi non e un dato",
  );

  // Scegliere il prefisso e un gesto esplicito: solo allora il valore cambia.
  assert.equal(
    formatPhoneNumber("39", parsed.national),
    "+39 3331234567",
  );
});

test("un numero estero legacy non diventa italiano", () => {
  const parsed = parsePhoneNumber("+33 6 12 34 56 78");
  assert.equal(parsed.dial, "33");
  assert.equal(parsed.countryCode, "FR");
  assert.equal(parsed.national, "612345678");
});

test("un prefisso fuori elenco si conserva invece di essere attribuito a caso", () => {
  const parsed = parsePhoneNumber("+998 90 1234567");
  assert.equal(parsed.dial, "", "nessun paese in elenco ha +998");
  assert.equal(
    parsed.assumedDefault,
    true,
    "il valore non va riscritto: chi lo ospita deve saperlo",
  );
  assert.equal(normalizePhoneNumber("+998 90 1234567"), "+998 90 1234567");
});

/**
 * La capitalizzazione e UX, non una trasformazione dei dati.
 *
 * Il confine e questo: i campi in cui il case ha un significato non si
 * toccano **mai**, nemmeno quando il nome del campo somiglia a quello di un
 * campo nominale.
 */
test("i campi in cui il case ha significato restano intatti", () => {
  const intoccabili = [
    ["email", "mario.rossi@esempio.it"],
    ["contactEmail", "info@ASD.it"],
    ["password", "seGreta123"],
    ["website", "https://www.esempio.it/Chi-Siamo"],
    ["iban", "IT60X0542811101000000123456"],
    ["fiscalCode", "RSSMRA80A01H501U"],
    ["codiceFiscale", "rssmra80a01h501u"],
    ["vatNumber", "IT12345678901"],
    ["membershipNumber", "aB-0012"],
    ["username", "mrossi"],
    ["accessToken", "aBcD-1234"],
    ["belfioreCode", "H501"],
    ["sdiCode", "0000000"],
    ["atecoCode", "93.12.00"],
  ];

  for (const [field, value] of intoccabili) {
    assert.equal(
      capitalizationModeForField(field),
      "none",
      `${field} non deve essere capitalizzato`,
    );
    assert.equal(
      applyCapitalization(value, capitalizationModeForField(field)),
      value,
      `${field} deve uscire identico`,
    );
  }
});

test("i campi nominali ricevono la maiuscola, quelli descrittivi la frase", () => {
  const nominali = [
    ["firstName", "mario", "Mario"],
    ["lastName", "de luca", "De Luca"],
    ["city", "reggio nell'emilia", "Reggio nell'Emilia"],
    ["birthPlace", "sant'agata bolognese", "Sant'Agata Bolognese"],
    ["address", "via giuseppe garibaldi", "Via Giuseppe Garibaldi"],
    ["businessName", "nuova sportiva", "Nuova Sportiva"],
    ["representativeSurname", "d'angelo", "D'Angelo"],
    ["bankName", "banca popolare", "Banca Popolare"],
  ];

  for (const [field, input, expected] of nominali) {
    assert.equal(capitalizationModeForField(field), "name", field);
    assert.equal(applyCapitalization(input, "name"), expected, field);
  }

  assert.equal(capitalizationModeForField("notes"), "sentence");
  assert.equal(
    applyCapitalization("allergico alle arachidi. usa l'inalatore", "sentence"),
    "Allergico alle arachidi. usa l'inalatore",
    "una frase riceve una maiuscola sola: il resto e testo di chi lo ha scritto",
  );
});

test("un valore gia scritto bene non viene toccato due volte", () => {
  for (const value of [
    "De Luca",
    "Sant'Agata Bolognese",
    "ASD Nuova Sportiva",
    "McDonald",
    "U15",
    "Reggio nell'Emilia",
  ]) {
    assert.equal(
      capitalizeName(value),
      value,
      `${value} deve restare identico: la regola e idempotente`,
    );
  }
});

test("capitalizeSentence non tocca una frase che comincia gia in maiuscolo", () => {
  const frase = "Nessuna allergia nota. Assume vitamina D";
  assert.equal(capitalizeSentence(frase), frase);
});

/**
 * L'archivio ISTAT e la prova sul campo della regola di capitalizzazione.
 *
 * Dal Blocco 8 la capitalizzazione arriva anche sulle schede di modifica, e
 * quindi tocca i comuni. Prima di questo test la regola cambiava **30** dei
 * 7.896 nomi ufficiali, e li cambiava tutti in peggio.
 */
test("nessun comune ufficiale viene alterato dalla capitalizzazione", async () => {
  const dataset = (
    await import("../../src/data/comuni-istat.json", { with: { type: "json" } })
  ).default;

  const altered = dataset.comuni
    .map((row) => row[0])
    .filter((name) => capitalizeName(name) !== name);

  assert.deepEqual(
    altered,
    [],
    "un nome ufficiale non si «corregge»: e gia il nome",
  );
});

test("i casi che hanno rotto la regola restano chiusi", () => {
  // Scritti a mano tutti minuscoli: qui la regola deve intervenire.
  assert.equal(capitalizeName("reggio nell'emilia"), "Reggio nell'Emilia");
  assert.equal(capitalizeName("cava de' tirreni"), "Cava de' Tirreni");
  assert.equal(capitalizeName("san giovanni in persiceto"), "San Giovanni in Persiceto");
  assert.equal(capitalizeName("bagno a ripoli"), "Bagno a Ripoli");

  // Gia scritti con una maiuscola: qui non deve toccare niente.
  assert.equal(capitalizeName("Morra De Sanctis"), "Morra De Sanctis");
  assert.equal(capitalizeName("Alcara li Fusi"), "Alcara li Fusi");
  assert.equal(capitalizeName("Torre Le Nocelle"), "Torre Le Nocelle");
  assert.equal(capitalizeName("Riva presso Chieri"), "Riva presso Chieri");
});
