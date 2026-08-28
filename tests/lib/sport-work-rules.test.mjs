import assert from "node:assert/strict";
import test from "node:test";

import {
  CONFIGURED_RULE_YEARS,
  buildRuleSnapshot,
  canRuleProduceDefinitiveCalculation,
  hasRulesForYear,
  listPendingRules,
  listRuleEntries,
  rulesFor,
  tryRulesFor,
  SPORT_WORK_RULES_2026,
  SPORT_WORK_RULES_2027,
} from "../../src/lib/sport-work/rules/index.ts";

/**
 * Le regole del lavoro sportivo sono **configurazione versionata per anno**,
 * non costanti sparse nel codice.
 *
 * Tre cose vanno dimostrate.
 *
 * 1. **Un anno non configurato fallisce, e fallisce rumorosamente.** Il
 *    1 gennaio 2028 la riduzione al 50% della base imponibile decade: un
 *    motore che quel giorno riusa le regole del 2027 dimezza la contribuzione
 *    dovuta senza che nessuno se ne accorga. L'errore deve arrivare a chi ha
 *    premuto il pulsante, non finire in un log.
 * 2. **Ogni regola porta la sua fonte.** Una regola senza fonte, fra due anni,
 *    e un numero che nessuno potra piu verificare.
 * 3. **Le regole non validate non producono calcoli definitivi.** E la
 *    differenza fra un software che aiuta e uno che si sostituisce a un
 *    professionista.
 */

// --- fail closed -------------------------------------------------------------

test("un anno non configurato non ricade sull'anno precedente: fallisce", () => {
  assert.throws(() => rulesFor(2028), /non configurate per l'anno 2028/);
  assert.throws(() => rulesFor(2025), /non configurate per l'anno 2025/);
  assert.throws(() => rulesFor("non un anno"), /Anno non valido/);
});

test("il messaggio dice cosa fare, non solo che qualcosa non va", () => {
  let message = "";
  try {
    rulesFor(2028);
  } catch (error) {
    message = String(error.message);
  }

  assert.match(message, /src\/lib\/sport-work\/rules\/2028\.ts/);
  assert.match(message, /senza copiare l'anno precedente/);
  assert.match(message, /2026, 2027/);
});

test("tryRulesFor non solleva: serve alle superfici di sola lettura", () => {
  assert.equal(tryRulesFor(2028), null);
  assert.equal(tryRulesFor(2026), SPORT_WORK_RULES_2026);
});

test("hasRulesForYear risponde senza sollevare", () => {
  assert.equal(hasRulesForYear(2026), true);
  assert.equal(hasRulesForYear(2027), true);
  assert.equal(hasRulesForYear(2028), false);
  assert.equal(hasRulesForYear(null), false);
});

test("gli anni configurati sono esattamente due, in ordine", () => {
  assert.deepEqual(CONFIGURED_RULE_YEARS, [2026, 2027]);
});

// --- ogni regola ha una fonte ------------------------------------------------

for (const rules of [SPORT_WORK_RULES_2026, SPORT_WORK_RULES_2027]) {
  test(`ogni regola del ${rules.year} dichiara la sua fonte`, () => {
    const entries = listRuleEntries(rules);
    assert.ok(entries.length >= 15, "il rule set deve essere completo");

    for (const { key, entry } of entries) {
      assert.equal(
        typeof entry.source,
        "string",
        `${key}: la fonte deve essere una stringa`,
      );
      assert.ok(
        entry.source.trim().length > 10,
        `${key}: la fonte non puo essere un segnaposto`,
      );
      assert.ok(
        [
          "VALIDATED_OFFICIAL",
          "VALIDATED_PROFESSIONAL",
          "PENDING_PROFESSIONAL_VALIDATION",
        ].includes(entry.status),
        `${key}: stato di validazione non riconosciuto`,
      );
    }
  });
}

// --- i valori del 2026 -------------------------------------------------------

test("le soglie 2026 sono quelle di legge", () => {
  assert.equal(SPORT_WORK_RULES_2026.socialFranchise.value, 5000);
  assert.equal(SPORT_WORK_RULES_2026.fiscalFranchise.value, 15000);
  assert.equal(SPORT_WORK_RULES_2026.socialFranchise.status, "VALIDATED_OFFICIAL");
  assert.equal(SPORT_WORK_RULES_2026.fiscalFranchise.status, "VALIDATED_OFFICIAL");
});

test("le due soglie non si sommano e non si sostituiscono", () => {
  assert.notEqual(
    SPORT_WORK_RULES_2026.socialFranchise.value,
    SPORT_WORK_RULES_2026.fiscalFranchise.value,
  );
  assert.notEqual(
    SPORT_WORK_RULES_2026.socialFranchise.source,
    SPORT_WORK_RULES_2026.fiscalFranchise.source,
  );
});

test("la riduzione al 50% dichiara la sua data di scadenza", () => {
  assert.equal(SPORT_WORK_RULES_2026.reductionFactor.value, 0.5);
  assert.equal(SPORT_WORK_RULES_2026.reductionExpiresOn.value, "2027-12-31");
  assert.match(SPORT_WORK_RULES_2026.reductionFactor.note, /2028/);
});

test("le aliquote distinguono chi ha altra copertura da chi non ce l'ha", () => {
  const rates = SPORT_WORK_RULES_2026.socialRates.value;
  assert.equal(rates.NONE, 0.2703);
  assert.equal(rates.OTHER_COVERAGE, 0.24);
  assert.equal(rates.PENSIONER, 0.24);
});

test("le causali F24 seguono la copertura previdenziale", () => {
  const causali = SPORT_WORK_RULES_2026.f24Causali.value;
  assert.equal(causali.NONE, "CXX");
  assert.equal(causali.OTHER_COVERAGE, "C10");
  assert.equal(causali.PENSIONER, "C10");
});

test("le quote sommano a uno: un terzo e due terzi", () => {
  const { employeeShare, employerShare } = SPORT_WORK_RULES_2026;
  assert.ok(Math.abs(employeeShare.value + employerShare.value - 1) < 1e-12);
});

// --- cio che resta da validare ----------------------------------------------

test("la ritenuta IRPEF non e configurata: e dichiarata pendente", () => {
  const entry = SPORT_WORK_RULES_2026.incomeTaxWithholding;
  assert.equal(entry.value, null);
  assert.equal(entry.status, "PENDING_PROFESSIONAL_VALIDATION");
  assert.equal(canRuleProduceDefinitiveCalculation(entry.status), false);
});

test("deducibilita dei contributi e trattamento dei premi restano pendenti", () => {
  assert.equal(
    SPORT_WORK_RULES_2026.contributionDeductibility.status,
    "PENDING_PROFESSIONAL_VALIDATION",
  );
  assert.equal(
    SPORT_WORK_RULES_2026.bonusTreatment.status,
    "PENDING_PROFESSIONAL_VALIDATION",
  );
});

test("il 2026 elenca le sue voci pendenti, e sono quelle attese", () => {
  const keys = listPendingRules(SPORT_WORK_RULES_2026)
    .map(({ key }) => key)
    .sort();
  assert.deepEqual(keys, [
    "bonusTreatment",
    "contributionDeductibility",
    "incomeTaxWithholding",
  ]);
});

test("il 2027 dichiara pendenti le aliquote non ancora pubblicate", () => {
  const keys = listPendingRules(SPORT_WORK_RULES_2027).map(({ key }) => key);
  assert.ok(keys.includes("socialRates"));
  assert.match(SPORT_WORK_RULES_2027.socialRates.source, /PROVVISORIO/);
});

test("il 2027 non e una copia muta del 2026: dichiara cosa ha ripreso", () => {
  assert.equal(
    SPORT_WORK_RULES_2027.socialRates.value.NONE,
    SPORT_WORK_RULES_2026.socialRates.value.NONE,
  );
  assert.notEqual(
    SPORT_WORK_RULES_2027.socialRates.status,
    SPORT_WORK_RULES_2026.socialRates.status,
  );
});

// --- snapshot ----------------------------------------------------------------

test("lo snapshot congela cio che ha prodotto il numero, fonti comprese", () => {
  const snapshot = buildRuleSnapshot(SPORT_WORK_RULES_2026, "NONE");

  assert.equal(snapshot.rulesVersion, "2026");
  assert.equal(snapshot.year, 2026);
  assert.equal(snapshot.socialFranchise, 5000);
  assert.equal(snapshot.fiscalFranchise, 15000);
  assert.equal(snapshot.reductionFactor, 0.5);
  assert.equal(snapshot.socialRate, 0.2703);
  assert.equal(snapshot.f24Causale, "CXX");
  assert.ok(snapshot.sources.socialFranchise.includes("art. 35"));
  assert.ok(snapshot.pendingRules.length >= 3);
});

test("lo snapshot cambia con la copertura previdenziale", () => {
  const pensionato = buildRuleSnapshot(SPORT_WORK_RULES_2026, "PENSIONER");
  assert.equal(pensionato.socialRate, 0.24);
  assert.equal(pensionato.f24Causale, "C10");
});
