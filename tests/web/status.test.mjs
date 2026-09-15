import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVITY_STATUS,
  CALLUP_STATUS,
  CERTIFICATE_STATUS,
  ENROLMENT_STATUS,
  MEMBERSHIP_STATUS,
  MONEY_STATUS,
  PERSON_STATUS,
  STATUS_UNKNOWN,
  certificateStatusFromExpiry,
  resolveStatus,
} from "../../src/lib/web/status.ts";

/**
 * Il sistema di stato (guideline 09 §9.4): otto livelli, quattro pesi, la
 * parola sempre presente, e le etichette canoniche scritte in un posto solo.
 */

test("ogni stato del sistema ha un'etichetta italiana in maiuscolo e un peso", () => {
  const all = [PERSON_STATUS, CERTIFICATE_STATUS, MONEY_STATUS, ACTIVITY_STATUS, ENROLMENT_STATUS, CALLUP_STATUS, MEMBERSHIP_STATUS]
    .flatMap((group) => Object.values(group))
    .concat([STATUS_UNKNOWN]);
  for (const spec of all) {
    assert.equal(spec.label, spec.label.toUpperCase(), spec.label);
    assert.ok(spec.label.trim().length > 0);
    assert.ok(["quiet", "outline", "solid", "urgent"].includes(spec.weight), spec.label);
    assert.equal(/[!]/.test(spec.label), false, "niente punti esclamativi");
  }
});

test("le etichette canoniche sono quelle del sistema, nel peso giusto", () => {
  assert.deepEqual(PERSON_STATUS.active, { label: "ATTIVO", weight: "solid", hue: "green" });
  assert.deepEqual(PERSON_STATUS.suspended, { label: "SOSPESO", weight: "urgent", hue: "red" });
  assert.deepEqual(PERSON_STATUS.on_loan, { label: "IN PRESTITO", weight: "outline", hue: "blue" });
  assert.deepEqual(CERTIFICATE_STATUS.expiring, { label: "IN SCADENZA", weight: "outline", hue: "amber" });
  assert.deepEqual(CERTIFICATE_STATUS.missing, { label: "MANCANTE", weight: "urgent", hue: "red" });
  assert.deepEqual(MONEY_STATUS.paid, { label: "INCASSATO", weight: "solid", hue: "green" });
  assert.deepEqual(MONEY_STATUS.cancelled, { label: "ANNULLATO", weight: "quiet", hue: "neutral" });
  assert.deepEqual(ACTIVITY_STATUS.scheduled, { label: "PROGRAMMATO", weight: "quiet", hue: "neutral" });
  assert.deepEqual(CALLUP_STATUS.no_answer, { label: "SENZA RISPOSTA", weight: "outline", hue: "amber" });
});

test("un valore dell'API si risolve nelle grafie che il prodotto usa oggi", () => {
  assert.equal(resolveStatus("active"), PERSON_STATUS.active);
  assert.equal(resolveStatus("Attivo"), PERSON_STATUS.active);
  assert.equal(resolveStatus("in prestito"), PERSON_STATUS.on_loan);
  assert.equal(resolveStatus("on-loan"), PERSON_STATUS.on_loan);
  assert.equal(resolveStatus("PARZIALMENTE PAGATA"), MONEY_STATUS.partial);
  assert.equal(resolveStatus("expiring_soon"), CERTIFICATE_STATUS.expiring);
  assert.equal(resolveStatus("not_recorded"), ACTIVITY_STATUS.not_recorded);
});

test("cio che non si riconosce rende NON REGISTRATO, mai una cella vuota", () => {
  assert.equal(resolveStatus(null), STATUS_UNKNOWN);
  assert.equal(resolveStatus(""), STATUS_UNKNOWN);
  assert.equal(resolveStatus("qualcosa-di-nuovo"), STATUS_UNKNOWN);
  assert.equal(STATUS_UNKNOWN.label, "NON REGISTRATO");
  const fallback = CERTIFICATE_STATUS.missing;
  assert.equal(resolveStatus(undefined, fallback), fallback);
});

test("lo stato di un certificato si deriva dalla scadenza con una soglia di 30 giorni", () => {
  assert.equal(certificateStatusFromExpiry(null), CERTIFICATE_STATUS.missing);
  assert.equal(certificateStatusFromExpiry(-1), CERTIFICATE_STATUS.expired);
  assert.equal(certificateStatusFromExpiry(0), CERTIFICATE_STATUS.expiring);
  assert.equal(certificateStatusFromExpiry(30), CERTIFICATE_STATUS.expiring);
  assert.equal(certificateStatusFromExpiry(31), CERTIFICATE_STATUS.valid);
  assert.equal(certificateStatusFromExpiry(10, { expiringWithinDays: 7 }), CERTIFICATE_STATUS.valid);
});
