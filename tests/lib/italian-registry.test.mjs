import assert from "node:assert/strict";
import test from "node:test";

import {
  ITALIAN_PROVINCES,
  ITALIAN_REGIONS,
  checkCodiceFiscale,
  computeCodiceFiscale,
  computeCodiceFiscaleCheckCharacter,
  extractBelfioreCode,
  findProvince,
  getRegionForProvince,
  isValidPostalCode,
  isWellFormedCodiceFiscale,
  normalizeProvinceCode,
  suggestAddressCompletion,
  validateAddressFields,
} from "../../src/lib/italian-registry.ts";

/**
 * Blocco 4 — anagrafica assistita.
 *
 * Il codice fiscale e l'unico dato di questa applicazione che si puo
 * *calcolare*: sbagliarlo significa produrre in silenzio un identificativo
 * falso su tesseramenti e fatture. I quattro codici usati qui sotto sono
 * esempi pubblici e verificabili con il solo carattere di controllo.
 */

test("le province italiane sono 107 e ognuna ha una regione", () => {
  assert.equal(ITALIAN_PROVINCES.length, 107);
  assert.equal(ITALIAN_REGIONS.length, 20);
  assert.equal(
    ITALIAN_PROVINCES.every(
      (province) =>
        /^[A-Z]{2}$/.test(province.code) && province.name && province.region,
    ),
    true,
  );
  assert.equal(
    new Set(ITALIAN_PROVINCES.map((province) => province.code)).size,
    107,
    "nessuna sigla duplicata",
  );
});

test("la provincia si riconosce dalla sigla e dal nome, anche senza accenti", () => {
  assert.equal(findProvince("MI")?.name, "Milano");
  assert.equal(findProvince("milano")?.code, "MI");
  assert.equal(findProvince("Forli-Cesena")?.code, "FC");
  assert.equal(findProvince("Monza e della Brianza")?.code, "MB");
  assert.equal(findProvince("Provincia inventata"), null);
  assert.equal(normalizeProvinceCode("mi"), "MI");
  assert.equal(normalizeProvinceCode("XX"), "");
  assert.equal(getRegionForProvince("BZ"), "Trentino-Alto Adige");
});

test("il CAP e valido solo con cinque cifre", () => {
  assert.equal(isValidPostalCode("20121"), true);
  assert.equal(isValidPostalCode("2012"), false);
  assert.equal(isValidPostalCode("2012A"), false);
  assert.equal(isValidPostalCode(""), false);
});

test("la validazione segnala CAP, provincia e regione incoerenti", () => {
  assert.deepEqual(
    validateAddressFields({
      postalCode: "20121",
      city: "Milano",
      province: "MI",
      region: "Lombardia",
      country: "Italia",
    }),
    [],
  );

  const issues = validateAddressFields({
    postalCode: "201",
    city: "",
    province: "ZZ",
    region: "Lazio",
    country: "Italia",
  });
  const fields = issues.map((issue) => issue.field);
  assert.deepEqual(fields.sort(), ["city", "postalCode", "province"].sort());

  const wrongRegion = validateAddressFields({
    postalCode: "20121",
    city: "Milano",
    province: "MI",
    region: "Lazio",
  });
  assert.equal(wrongRegion[0]?.field, "region");
  assert.match(wrongRegion[0]?.message || "", /Lombardia/);
});

test("fuori dall'Italia i controlli su CAP e provincia non si applicano", () => {
  assert.deepEqual(
    validateAddressFields({
      postalCode: "CH-8001",
      city: "Zurigo",
      province: "ZH",
      country: "Svizzera",
    }),
    [],
  );
});

test("il completamento propone solo cio che manca e non sovrascrive", () => {
  assert.deepEqual(suggestAddressCompletion({ province: "MI", country: "Italia" }), {
    region: "Lombardia",
  });

  // Regione gia scritta a mano: non viene toccata, semmai segnalata.
  assert.deepEqual(
    suggestAddressCompletion({
      province: "MI",
      region: "Lombardia",
      country: "Italia",
    }),
    {},
  );

  // Il nome esteso viene normalizzato nella sigla, che e la forma canonica.
  assert.deepEqual(
    suggestAddressCompletion({ province: "Milano", country: "Italia" }),
    { province: "MI", region: "Lombardia" },
  );
});

test("il carattere di controllo riproduce codici fiscali reali", () => {
  for (const codiceFiscale of [
    "MRTMTT25D09F205Z",
    "RSSBBR69C48F839A",
    "CNTCHR83T41D969D",
    "FOXDRA26C24H872Y",
  ]) {
    assert.equal(
      computeCodiceFiscaleCheckCharacter(codiceFiscale.slice(0, 15)),
      codiceFiscale.slice(15),
      codiceFiscale,
    );
    assert.equal(isWellFormedCodiceFiscale(codiceFiscale), true);
  }

  assert.equal(isWellFormedCodiceFiscale("MRTMTT25D09F205A"), false);
  assert.equal(isWellFormedCodiceFiscale("non-un-codice"), false);
});

test("il calcolo applica la regola delle quattro consonanti e il giorno femminile", () => {
  const mario = computeCodiceFiscale({
    firstName: "Mario",
    lastName: "Rossi",
    birthDate: "1985-08-01",
    gender: "M",
    belfioreCode: "H501",
  });
  assert.equal(mario.ok, true);
  assert.equal(mario.value, "RSSMRA85M01H501Q");

  // Marco ha quattro consonanti: si salta la seconda -> MRC, non MRA.
  const marco = computeCodiceFiscale({
    firstName: "Marco",
    lastName: "Rossi",
    birthDate: "1985-08-01",
    gender: "M",
    belfioreCode: "H501",
  });
  assert.equal(marco.value?.slice(3, 6), "MRC");

  // Femmina: al giorno si somma 40.
  const maria = computeCodiceFiscale({
    firstName: "Maria",
    lastName: "Bianchi",
    birthDate: "1990-02-14",
    gender: "F",
    belfioreCode: "F205",
  });
  assert.equal(maria.value?.slice(9, 11), "54");
});

test("senza gli elementi necessari il calcolo dice cosa manca, non improvvisa", () => {
  const result = computeCodiceFiscale({
    firstName: "Mario",
    lastName: "Rossi",
    birthDate: "1985-08-01",
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ["sesso", "codice catastale"]);
  assert.equal(Object.hasOwn(result, "value"), false);
});

test("il codice catastale si ricava da un codice fiscale gia valido", () => {
  assert.equal(extractBelfioreCode("MRTMTT25D09F205Z"), "F205");
  assert.equal(extractBelfioreCode("MRTMTT25D09F205A"), "");
  assert.equal(extractBelfioreCode(null), "");
});

test("il controllo confronta senza correggere", () => {
  const person = {
    firstName: "Mario",
    lastName: "Rossi",
    birthDate: "1985-08-01",
    gender: "M",
  };

  assert.equal(checkCodiceFiscale("", person).status, "empty");
  assert.equal(
    checkCodiceFiscale("RSSMRA85M01H501Q", person).status,
    "valid",
  );
  assert.equal(checkCodiceFiscale("RSSMRA85", person).status, "malformed");

  // Codice formalmente corretto ma di un'altra persona: segnalato, non riscritto.
  const mismatch = checkCodiceFiscale("MRTMTT25D09F205Z", person);
  assert.equal(mismatch.status, "mismatch");
  // Il comune di nascita viene dal codice inserito (F205), il resto dai campi:
  // la proposta e "lo stesso comune, ma i tuoi dati anagrafici".
  assert.equal(mismatch.expected, "RSSMRA85M01F205T");
});
