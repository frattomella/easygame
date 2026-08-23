import assert from "node:assert/strict";
import test from "node:test";

import {
  CLUB_PROFILE_SECTIONS,
  buildClubProfileSectionUpdate,
  clubProfileSectionSnapshot,
  emptyClubProfileDraft,
  isAutosaveClubSection,
} from "../../src/lib/club-profile.ts";
import { createCoalescingSaver } from "../../src/lib/performance.ts";

/**
 * Blocco 4 — autosave della scheda club.
 *
 * Il vincolo di prodotto e esplicito: niente autosave su operazioni
 * distruttive o economicamente sensibili. Qui si verifica che l'elenco delle
 * sezioni in autosave lo rispetti e che una sezione non possa scrivere campi
 * di un'altra — l'errore che trasformerebbe una modifica al telefono in una
 * modifica all'IBAN.
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
  contact1Phone: "0212345678",
  website: "https://example.com",
});

test("solo le sezioni descrittive sono in autosave", () => {
  const autosave = CLUB_PROFILE_SECTIONS.filter((section) => section.autosave).map(
    (section) => section.id,
  );
  assert.deepEqual(autosave, ["generale", "contatti", "social"]);

  for (const sensitive of [
    "fiscali",
    "bancari",
    "federazione",
    "stagioni",
    "pagamenti",
    "fatturazione",
  ]) {
    assert.equal(
      isAutosaveClubSection(sensitive),
      false,
      `${sensitive} non deve salvarsi da sola`,
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
  ]);
  assert.equal(contatti.settings.contact1Phone, "0212345678");
  assert.equal(Object.hasOwn(contatti.settings, "iban"), false);

  const social = buildClubProfileSectionUpdate("social", draft());
  assert.deepEqual(Object.keys(social.columns), []);
  assert.equal(social.settings.website, "https://example.com");
});

test("una sezione a conferma esplicita non produce nessuna scrittura", () => {
  for (const sensitive of ["fiscali", "bancari", "stagioni", "pagamenti"]) {
    assert.deepEqual(buildClubProfileSectionUpdate(sensitive, draft()), {
      columns: {},
      settings: {},
    });
  }
});

test("l'impronta cambia solo quando cambia la sezione interessata", () => {
  const base = draft();
  const withOtherSection = { ...base, iban: "IT60X0542811101000000123456" };

  assert.equal(
    clubProfileSectionSnapshot("generale", base),
    clubProfileSectionSnapshot("generale", withOtherSection),
  );
  assert.notEqual(
    clubProfileSectionSnapshot("generale", base),
    clubProfileSectionSnapshot("generale", { ...base, name: "ASD Nuova" }),
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
