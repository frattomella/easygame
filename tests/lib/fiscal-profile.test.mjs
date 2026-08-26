import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * Il **profilo fiscale** di un'organizzazione: cosa si registra, cosa si
 * valida, e cosa **non** si deduce.
 *
 * La regola che questi test presidiano e una sola, ed e la piu importante di
 * tutto il motore fiscale: **la sigla non decide il trattamento fiscale.** Due
 * ASD possono avere trattamenti diversi — una in regime 398 e una no, una con
 * partita IVA per l'attivita commerciale e una senza. Un gestionale che
 * deduce dalla sigla produce documenti sbagliati con l'aria di essere giusti.
 */

let profile;
let forms;

before(async () => {
  profile = await import("../../src/lib/fiscal/fiscal-profile.ts");
  forms = await import("../../src/lib/fiscal/legal-forms.ts");
});

/* ------------------------------------------------------ i vari soggetti */

test("una ASD si registra senza partita IVA, ed e legittimo", () => {
  const normalizzato = profile.normalizeFiscalProfile({
    legalForm: "asd",
    legalName: "ASD Fortitudo Scauri",
    fiscalCode: "90012345678",
  });

  assert.equal(normalizzato.legalForm, "asd");
  assert.equal(normalizzato.vatNumber, "");
  assert.deepEqual(
    profile.validateFiscalProfile(normalizzato),
    [],
    "pretendere la partita IVA renderebbe il modulo incompilabile per la maggioranza dei clienti",
  );
});

test("una SSD a r.l. e un soggetto iscritto al Registro Imprese", () => {
  const definizione = forms.getLegalFormDefinition("ssd_arl");

  assert.equal(definizione.requiresRea, true);
  assert.equal(definizione.requiresVatNumber, true);
});

test("una ASD non e obbligata al REA, e non lo si pretende", () => {
  assert.equal(forms.getLegalFormDefinition("asd").requiresRea, false);
});

test("un soggetto non previsto si registra come «altro» senza rompere nulla", () => {
  const normalizzato = profile.normalizeFiscalProfile({
    legalForm: "cooperativa_di_quartiere",
  });

  assert.equal(normalizzato.legalForm, "altro");
  assert.deepEqual(profile.validateFiscalProfile(normalizzato), []);
});

test("la forma giuridica non porta con se un regime fiscale", () => {
  /*
    Se lo facesse, ogni ASD si troverebbe un regime che nessuno ha scelto, e
    quel regime finirebbe dentro un tracciato FatturaPA.
  */
  for (const chiave of forms.LEGAL_FORMS) {
    const normalizzato = profile.normalizeFiscalProfile({ legalForm: chiave });
    assert.equal(
      normalizzato.taxRegimeCode,
      "",
      `${chiave} non deve proporre un regime`,
    );
    assert.deepEqual(normalizzato.specialRegimes, []);
  }
});

test("i regimi speciali si dichiarano uno per uno", () => {
  const normalizzato = profile.normalizeFiscalProfile({
    legalForm: "asd",
    specialRegimes: ["legge_398_1991", "regime_inventato", "legge_398_1991"],
  });

  assert.deepEqual(
    normalizzato.specialRegimes,
    ["legge_398_1991"],
    "cio che non e nel vocabolario non entra, e i doppioni si tolgono",
  );
});

/* ------------------------------------------------------- normalizzazione */

test("codice fiscale e partita IVA si conservano in maiuscolo e senza spazi", () => {
  const normalizzato = profile.normalizeFiscalProfile({
    fiscalCode: " rsslgu78b02h501x ",
    vatNumber: "123 456 789.03",
  });

  assert.equal(normalizzato.fiscalCode, "RSSLGU78B02H501X");
  assert.equal(
    normalizzato.vatNumber,
    "12345678903",
    "la stessa societa scritta in tre modi diventa tre soggetti quando si riconcilia",
  );
});

/* -------------------------------------------------------- la validazione */

test("una partita IVA con la cifra di controllo sbagliata viene rifiutata", () => {
  const problemi = profile.validateFiscalProfile(
    profile.normalizeFiscalProfile({ vatNumber: "12345678901" }),
  );

  assert.equal(problemi.length, 1);
  assert.equal(problemi[0].path, "vatNumber");
});

test("una partita IVA valida passa", () => {
  assert.equal(profile.isValidItalianVatNumber("12345678903"), true);
  assert.equal(profile.isValidItalianVatNumber("00743110157"), true);
});

test("una partita IVA di dieci cifre non e una partita IVA", () => {
  assert.equal(profile.isValidItalianVatNumber("1234567890"), false);
});

test("un CAP di quattro cifre viene rifiutato", () => {
  const problemi = profile.validateFiscalProfile(
    profile.normalizeFiscalProfile({ postalCode: "0018" }),
  );

  assert.equal(problemi[0].path, "postalCode");
});

test("un profilo incompleto non e un profilo sbagliato", () => {
  /*
    Un profilo a meta e la condizione normale di chi sta configurando. Cio che
    manca lo si chiede quando serve — al momento di emettere — non quando si
    salva un indirizzo.
  */
  assert.deepEqual(
    profile.validateFiscalProfile(profile.createEmptyFiscalProfile()),
    [],
  );
});

/* --------------------------------------------------- cosa manca, e a cosa */

test("per una fattura servono emittente, posizione fiscale e indirizzo", () => {
  const mancanti = profile.missingForInvoicing(
    profile.createEmptyFiscalProfile(),
  );

  assert.ok(mancanti.includes("ragione sociale"));
  assert.ok(mancanti.includes("partita IVA o codice fiscale"));
  assert.ok(mancanti.includes("CAP"));
});

test("un club con il solo codice fiscale puo fatturare, se il resto c'e", () => {
  const completo = profile.normalizeFiscalProfile({
    legalForm: "asd",
    legalName: "ASD Alfa",
    fiscalCode: "90012345678",
    address: "Via Roma 1",
    city: "Roma",
    postalCode: "00100",
    province: "RM",
  });

  assert.deepEqual(profile.missingForInvoicing(completo), []);
});

test("per la fattura elettronica servono anche partita IVA e regime", () => {
  const conSoloCf = profile.normalizeFiscalProfile({
    legalForm: "asd",
    legalName: "ASD Alfa",
    fiscalCode: "90012345678",
    address: "Via Roma 1",
    city: "Roma",
    postalCode: "00100",
    province: "RM",
  });

  const mancanti = profile.missingForEInvoicing(conSoloCf);

  assert.ok(mancanti.includes("partita IVA"));
  assert.ok(mancanti.includes("regime fiscale"));
});

test("a una SSD la fattura elettronica chiede anche i dati REA", () => {
  const ssd = profile.normalizeFiscalProfile({
    legalForm: "ssd_arl",
    legalName: "SSD Beta a r.l.",
    vatNumber: "12345678903",
    taxRegimeCode: "RF01",
    address: "Via Milano 2",
    city: "Milano",
    postalCode: "20100",
    province: "MI",
  });

  const mancanti = profile.missingForEInvoicing(ssd);

  assert.ok(mancanti.includes("ufficio REA"));
  assert.ok(mancanti.includes("numero REA"));
});

test("alla stessa ASD la fattura elettronica non chiede il REA", () => {
  const asd = profile.normalizeFiscalProfile({
    legalForm: "asd",
    legalName: "ASD Alfa",
    vatNumber: "12345678903",
    taxRegimeCode: "RF01",
    address: "Via Roma 1",
    city: "Roma",
    postalCode: "00100",
    province: "RM",
  });

  assert.deepEqual(profile.missingForEInvoicing(asd), []);
});

/* -------------------------------------------------------------- il bollo */

test("il bollo nasce spento", () => {
  const normalizzato = profile.normalizeFiscalProfile({});

  assert.equal(
    normalizzato.stampDuty.enabled,
    false,
    "applicarlo e una decisione del soggetto, non una conseguenza di aver installato un gestionale",
  );
  assert.equal(normalizzato.stampDuty.thresholdCents, 7745);
  assert.equal(normalizzato.stampDuty.amountCents, 200);
});
