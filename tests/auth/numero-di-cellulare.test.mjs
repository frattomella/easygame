import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_COUNTRY_CALLING_CODE,
  getPhoneNormalizationMessage,
  maskPhoneNumber,
  normalizePhoneNumber,
  resolveDefaultCountryCallingCode,
} from "../../src/lib/auth/phone-number.ts";

/**
 * **Un numero ha una forma sola** (PP-05, ADR-0115).
 *
 * Finche le quattro forme in cui una persona scrive lo stesso numero restano
 * quattro stringhe diverse, il contatore per numero conta quattro secchielli e
 * la challenge legata al destinatario non si ritrova mai. Questi test provano
 * la funzione che le riduce a una.
 */

const e164 = (valore, predefinito) => {
  const esito = normalizePhoneNumber(valore, predefinito);
  return esito.valid ? esito.e164 : null;
};

test("le forme in cui si scrive lo stesso cellulare italiano collassano in una", () => {
  const atteso = "+393401234567";
  for (const scritto of [
    "3401234567",
    "340 123 4567",
    "340-123-4567",
    "340.123.4567",
    "+39 340 1234567",
    "+393401234567",
    "00393401234567",
    "0039 340 123 4567",
    "  3401234567  ",
    "(340) 1234567",
  ]) {
    assert.equal(e164(scritto), atteso, `«${scritto}» deve dare ${atteso}`);
  }
});

test("un fisso italiano non passa: non riceve SMS", () => {
  const roma = normalizePhoneNumber("06 1234567");
  assert.equal(roma.valid, false);
  assert.equal(roma.reason, "not_mobile");
  assert.match(getPhoneNormalizationMessage(roma.reason), /cellulare/i);

  const milano = normalizePhoneNumber("+39 02 12345678");
  assert.equal(milano.valid, false);
  assert.equal(milano.reason, "not_mobile");
});

test("i motivi del rifiuto sono distinti, perche hanno rimedi distinti", () => {
  assert.equal(normalizePhoneNumber("").reason, "empty");
  assert.equal(normalizePhoneNumber("   ").reason, "empty");
  assert.equal(normalizePhoneNumber(null).reason, "empty");
  assert.equal(normalizePhoneNumber(undefined).reason, "empty");
  assert.equal(normalizePhoneNumber("340-ABC-4567").reason, "invalid_characters");
  assert.equal(normalizePhoneNumber("+39 340 12").reason, "too_short");
  assert.equal(
    normalizePhoneNumber("+39 3401234567890123").reason,
    "too_long",
  );

  /* Ogni motivo ha una frase, e nessuna e vuota. */
  for (const motivo of [
    "empty",
    "invalid_characters",
    "missing_country_code",
    "too_short",
    "too_long",
    "not_mobile",
  ]) {
    assert.ok(getPhoneNormalizationMessage(motivo).length > 10);
  }
});

test("il prefisso predefinito si applica solo a chi non ne ha scritto uno", () => {
  assert.equal(DEFAULT_COUNTRY_CALLING_CODE, "+39");

  /* Chi scrive il prefisso lo tiene, anche se non e quello predefinito. */
  assert.equal(e164("+41 79 123 45 67"), "+41791234567");

  /* Chi non lo scrive riceve quello dell'installazione. */
  assert.equal(e164("791234567", "+41"), "+41791234567");

  /*
    **Il prefisso e configurabile, ma un valore assurdo non fa finire i numeri
    in un altro paese**: si torna al valore documentato invece di inventare.
  */
  assert.equal(resolveDefaultCountryCallingCode({}), "+39");
  assert.equal(
    resolveDefaultCountryCallingCode({ AUTH_DEFAULT_COUNTRY_CODE: "41" }),
    "+41",
  );
  assert.equal(
    resolveDefaultCountryCallingCode({ AUTH_DEFAULT_COUNTRY_CODE: "+41" }),
    "+41",
  );
  assert.equal(
    resolveDefaultCountryCallingCode({ AUTH_DEFAULT_COUNTRY_CODE: "banane" }),
    "+39",
  );
  assert.equal(
    resolveDefaultCountryCallingCode({ AUTH_DEFAULT_COUNTRY_CODE: "+0" }),
    "+39",
  );
});

test("un prefisso che non conosciamo passa, e dichiara di non essere stato classificato", () => {
  const svizzero = normalizePhoneNumber("+41791234567");
  assert.equal(svizzero.valid, true);
  assert.equal(
    svizzero.mobileChecked,
    false,
    "non sappiamo distinguere un cellulare svizzero: va detto, non finto",
  );

  const italiano = normalizePhoneNumber("+393401234567");
  assert.equal(italiano.mobileChecked, true);
  assert.equal(italiano.countryCallingCode, "+39");
  assert.equal(italiano.nationalNumber, "3401234567");
});

test("il numero mascherato si riconosce e non si compone", () => {
  const mascherato = maskPhoneNumber("+393401234567");

  assert.ok(mascherato.endsWith("567"), "le ultime cifre restano leggibili");
  assert.ok(mascherato.startsWith("+39"), "il prefisso resta leggibile");
  assert.ok(
    !mascherato.includes("3401234"),
    "il corpo del numero non deve comparire",
  );
  assert.equal(
    mascherato.length,
    "+393401234567".length,
    "la maschera non deve rivelare una lunghezza diversa da quella vera",
  );

  /* Un valore vuoto o assurdo non diventa mai un numero in chiaro. */
  assert.equal(maskPhoneNumber(""), "•••");
  assert.equal(maskPhoneNumber("+39"), "•••");
  assert.equal(maskPhoneNumber(null), "•••");
});
