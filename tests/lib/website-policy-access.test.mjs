import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PUBLICATION,
  applyPublicationPolicy,
  formatDisplayName,
  isMinorAt,
  normalizePublicationSettings,
} from "../../src/lib/website/people/policy.ts";
import { resolveWebsiteAccess } from "../../src/lib/website/access-state.ts";
import { WEBSITE_PERMISSIONS, hasWebsitePermission, assertWebsitePermission } from "../../src/lib/website/permissions.ts";
import { PERMISSION_CATALOG } from "../../src/lib/permissions/catalog.ts";

/**
 * **ADR-0200 — chi compare sul sito, e chi puo cambiarlo.**
 *
 * La policy delle persone e la sola funzione che decide che cosa di un atleta
 * arriva al pubblico: qui si provano le regole sui minori (il consenso alle
 * immagini deve essere **accettato**, l'assenza di un rifiuto non basta), il
 * nome ridotto, l'anno di nascita mai mostrato per un minore. Poi lo stato
 * del servizio (prova che pubblica, sospeso in sola lettura) e i permessi,
 * con il dominio riservato al proprietario.
 */

const NOW = new Date("2026-10-05T10:00:00Z");

const person = (overrides = {}) => ({
  id: "a1",
  kind: "athlete",
  firstName: "Giulia",
  lastName: "rossi",
  birthDate: "2012-03-04",
  active: true,
  anonymized: false,
  jerseyNumber: "7",
  internalRole: "",
  ...overrides,
});

const published = (overrides = {}) => ({ ...DEFAULT_PUBLICATION, published: true, ...overrides });

test("una persona non pubblicata, inattiva o anonimizzata non compare", () => {
  const context = { now: NOW, imageConsent: "accepted", imageConsentDefined: true };
  assert.deepEqual(applyPublicationPolicy(person(), DEFAULT_PUBLICATION, context), { visible: false, reason: "not_published" });
  assert.deepEqual(applyPublicationPolicy(person(), null, context), { visible: false, reason: "not_published" });
  assert.deepEqual(applyPublicationPolicy(person({ active: false }), published(), context), { visible: false, reason: "inactive" });
  assert.deepEqual(applyPublicationPolicy(person({ anonymized: true }), published(), context), { visible: false, reason: "anonymized" });
});

test("minore: il nome pieno diventa nome e iniziale, l'anno di nascita non esce mai", () => {
  const verdict = applyPublicationPolicy(
    person(),
    published({ nameDisplay: "full", showBirthYear: true }),
    { now: NOW, imageConsent: "accepted", imageConsentDefined: true },
  );
  assert.equal(verdict.visible, true);
  assert.equal(verdict.fields.displayName, "Giulia R.");
  assert.equal(verdict.fields.birthYear, null);
  assert.equal(verdict.fields.isMinor, true);
});

test("minore: un nome personalizzato scelto dal club resta quello", () => {
  const verdict = applyPublicationPolicy(person(), published({ nameDisplay: "custom", customName: "Giuly" }), {
    now: NOW,
    imageConsent: "missing",
    imageConsentDefined: true,
  });
  assert.equal(verdict.fields.displayName, "Giuly");
});

test("minore: la foto esce solo con il consenso accettato — assenza di rifiuto non e consenso", () => {
  const settings = published({ showPhoto: true, photoMediaId: "m1", photoConsentOutsideRegistry: true });
  for (const [imageConsent, imageConsentDefined, expected] of [
    ["accepted", true, "m1"],
    ["missing", true, null],
    ["missing", false, null],
    ["rejected", true, null],
  ]) {
    const verdict = applyPublicationPolicy(person(), settings, { now: NOW, imageConsent, imageConsentDefined });
    assert.equal(verdict.fields.photoMediaId, expected, `${imageConsent}/${imageConsentDefined}`);
  }
});

test("adulto: senza registro serve la dichiarazione del club; con il registro serve l'accettazione; un rifiuto vince sempre", () => {
  const adult = person({ birthDate: "1990-01-01" });
  const base = published({ showPhoto: true, photoMediaId: "m1" });
  assert.equal(applyPublicationPolicy(adult, base, { now: NOW, imageConsent: "missing", imageConsentDefined: false }).fields.photoMediaId, null);
  assert.equal(
    applyPublicationPolicy(adult, { ...base, photoConsentOutsideRegistry: true }, { now: NOW, imageConsent: "missing", imageConsentDefined: false }).fields.photoMediaId,
    "m1",
  );
  assert.equal(applyPublicationPolicy(adult, base, { now: NOW, imageConsent: "missing", imageConsentDefined: true }).fields.photoMediaId, null);
  assert.equal(applyPublicationPolicy(adult, base, { now: NOW, imageConsent: "accepted", imageConsentDefined: true }).fields.photoMediaId, "m1");
  assert.equal(
    applyPublicationPolicy(adult, { ...base, photoConsentOutsideRegistry: true }, { now: NOW, imageConsent: "rejected", imageConsentDefined: false }).fields.photoMediaId,
    null,
  );
});

test("adulto: anno di nascita e nome pieno quando il club li sceglie", () => {
  const verdict = applyPublicationPolicy(person({ birthDate: "1990-06-01" }), published({ showBirthYear: true }), {
    now: NOW,
    imageConsent: "missing",
    imageConsentDefined: false,
  });
  assert.equal(verdict.fields.displayName, "Giulia rossi");
  assert.equal(verdict.fields.birthYear, 1990);
  assert.equal(verdict.fields.isMinor, false);
});

test("isMinorAt: senza data leggibile si tratta come minore; il compleanno dei 18 anni conta", () => {
  assert.equal(isMinorAt(null, NOW), true);
  assert.equal(isMinorAt("non una data", NOW), true);
  assert.equal(isMinorAt("2008-10-05", NOW), false);
  assert.equal(isMinorAt("2008-10-06", NOW), true);
});

test("formatDisplayName e normalizePublicationSettings ripuliscono", () => {
  assert.equal(formatDisplayName("mario", "bianchi", "initials"), "M. B.");
  assert.equal(formatDisplayName("Mario", "", "first_initial"), "Mario");
  const normalized = normalizePublicationSettings({ published: "si", nameDisplay: "boh", heightCm: 999, bio: "x".repeat(2000) });
  assert.equal(normalized.published, false);
  assert.equal(normalized.nameDisplay, "full");
  assert.ok(normalized.bio.length <= 1200);
});

test("lo stato del servizio: la prova pubblica, lo scaduto sospende, la revoca spegne", () => {
  const trial = resolveWebsiteAccess({ extra: { enabled: true, billingStatus: "trialing", trialEndsAt: "2026-11-01" }, now: NOW });
  assert.equal(trial.state, "trial");
  assert.equal(trial.canPublish, true);
  assert.equal(trial.publicServing, true);

  const expiredTrial = resolveWebsiteAccess({ extra: { enabled: true, billingStatus: "trialing", trialEndsAt: "2026-10-01" }, now: NOW });
  assert.equal(expiredTrial.state, "suspended");
  assert.equal(expiredTrial.canEdit, false);
  assert.equal(expiredTrial.canView, true);

  assert.equal(resolveWebsiteAccess({ extra: { enabled: true, billingStatus: "active" }, now: NOW }).state, "active");
  assert.equal(resolveWebsiteAccess({ extra: { enabled: false, billingStatus: "past_due" }, now: NOW }).state, "suspended");
  assert.equal(resolveWebsiteAccess({ extra: null, now: NOW }).state, "unavailable");
  assert.equal(resolveWebsiteAccess({ extra: { enabled: true, billingStatus: "active" }, override: false, now: NOW }).state, "unavailable");
  assert.equal(resolveWebsiteAccess({ extra: null, override: true, now: NOW }).state, "active");
  const admin = resolveWebsiteAccess({ extra: null, isPlatformAdmin: true, now: NOW });
  assert.equal(admin.state, "unavailable");
  assert.equal(admin.canView, true);
});

test("ogni permesso del sito e nel catalogo unico", () => {
  const keys = new Set(PERMISSION_CATALOG.map((entry) => entry.key));
  for (const permission of WEBSITE_PERMISSIONS) assert.ok(keys.has(permission), permission);
});

test("il dominio e solo del proprietario; il club manager fa tutto il resto; staff, allenatore, genitore e atleta niente", () => {
  assert.equal(hasWebsitePermission("owner", "website.domain.manage"), true);
  for (const role of ["club_manager", "admin", "staff", "trainer", "parent", "athlete"]) {
    assert.equal(hasWebsitePermission(role, "website.domain.manage"), false, role);
  }
  for (const permission of WEBSITE_PERMISSIONS.filter((key) => key !== "website.domain.manage")) {
    assert.equal(hasWebsitePermission("owner", permission), true, `owner ${permission}`);
  }
  for (const role of ["trainer", "parent", "athlete"]) {
    for (const permission of WEBSITE_PERMISSIONS) assert.equal(hasWebsitePermission(role, permission), false, `${role} ${permission}`);
  }
  assert.throws(() => assertWebsitePermission("trainer", "website.publish"), /Accesso negato/);
});
