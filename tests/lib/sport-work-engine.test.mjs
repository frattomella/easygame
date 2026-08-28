import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPayoutFiscalSnapshot,
  computeCompensationPayout,
  emptyPosition,
  netAmountLabel,
} from "../../src/lib/sport-work/engine.ts";

/**
 * Il motore contributivo del lavoro sportivo.
 *
 * I casi A–E sono quelli del cap. 7.3 dell'analisi 28: sono numeri
 * ricostruiti da fonte normativa e prassi, e stanno **qui** e non nel codice.
 * Un motore che li superasse leggendo una costante scritta dentro
 * `engine.ts` proverebbe soltanto di saper copiare se stesso.
 *
 * Quattro proprieta oltre ai numeri.
 *
 * 1. **Le due franchigie sono indipendenti.** Si supera la contributiva molto
 *    prima della fiscale, ed e il caso piu frequente.
 * 2. **La ritenuta IRPEF non si calcola.** Sopra i 15.000 il motore mostra
 *    l'imponibile eccedente e si ferma; il netto **non** viene dichiarato
 *    definitivo.
 * 3. **Il costo del club non dipende dalla ritenuta.** La ritenuta e denaro
 *    del lavoratore che il club versa per suo conto.
 * 4. **Un anno senza regole non produce un numero.**
 */

const position = (overrides = {}) => ({
  ...emptyPosition(2026),
  hasCurrentDeclaration: true,
  ...overrides,
});

const eroga = (grossAmount, overrides = {}) =>
  computeCompensationPayout({
    grossAmount,
    paidAt: "2026-09-30",
    relationshipType: "SPORT_COCOCO",
    socialCoverage: "NONE",
    position: position(overrides.position),
    ...overrides,
  });

// --- gli esempi obbligatori --------------------------------------------------

test("A — 4.000 euro: sotto la franchigia contributiva, nessun contributo", () => {
  const result = eroga(4000);

  assert.equal(result.taxableSocialGross, 0);
  assert.equal(result.socialBase, 0);
  assert.equal(result.totalContribution, 0);
  assert.equal(result.employeeContribution, 0);
  assert.equal(result.employerContribution, 0);
  assert.equal(result.taxableFiscal, 0);
  assert.equal(result.netSocial, 4000);
  assert.equal(result.netDefinitive, 4000);
  assert.equal(result.clubCost, 4000);
  assert.equal(result.fiscalTreatment, "NOT_APPLICABLE");
  assert.equal(result.definitive, true);
});

test("B — 7.000 euro: eccedenza 2.000, base 1.000, contributo 270,30", () => {
  const result = eroga(7000);

  assert.equal(result.socialFranchiseUsed, 5000);
  assert.equal(result.taxableSocialGross, 2000);
  assert.equal(result.socialBase, 1000);
  assert.equal(result.totalContribution, 270.3);
  assert.equal(result.employeeContribution, 90.1);
  assert.equal(result.employerContribution, 180.2);
  assert.equal(result.taxableFiscal, 0);
  assert.equal(result.netSocial, 6909.9);
  assert.equal(result.clubCost, 7180.2);
});

test("C — 12.000 euro: base 3.500, contributo 946,05", () => {
  const result = eroga(12000);

  assert.equal(result.taxableSocialGross, 7000);
  assert.equal(result.socialBase, 3500);
  assert.equal(result.totalContribution, 946.05);
  assert.equal(result.employeeContribution, 315.35);
  assert.equal(result.employerContribution, 630.7);
  assert.equal(result.taxableFiscal, 0);
  assert.equal(result.netSocial, 11684.65);
  assert.equal(result.clubCost, 12630.7);
});

test("D — 18.000 euro: si supera anche la soglia fiscale", () => {
  const result = eroga(18000);

  assert.equal(result.taxableSocialGross, 13000);
  assert.equal(result.socialBase, 6500);
  assert.equal(result.totalContribution, 1756.95);
  assert.equal(result.employeeContribution, 585.65);
  assert.equal(result.employerContribution, 1171.3);

  assert.equal(result.taxableFiscal, 3000);
  assert.equal(result.fiscalTreatment, "TO_VERIFY");
  assert.equal(result.withholdingAmount, null);

  assert.equal(result.netSocial, 17414.35);
  assert.equal(
    result.netDefinitive,
    null,
    "sopra i 15.000 il netto finale non e determinabile",
  );
  assert.equal(result.clubCost, 19171.3);
  assert.equal(result.definitive, false);
});

test("E — 4.000 esterni dichiarati piu 6.000 dal club: la franchigia residua e 1.000", () => {
  const result = eroga(6000, {
    position: { externalDeclared: 4000, declaredAt: "2026-08-01" },
  });

  assert.equal(result.priorProgressive, 4000);
  assert.equal(result.socialFranchiseRemainingBefore, 1000);
  assert.equal(result.socialFranchiseUsed, 1000);
  assert.equal(result.taxableSocialGross, 5000);
  assert.equal(result.socialBase, 2500);
  assert.equal(result.totalContribution, 675.75);
  assert.equal(result.employeeContribution, 225.25);
  assert.equal(result.employerContribution, 450.5);
  assert.equal(result.netSocial, 5774.75);
  assert.equal(result.clubCost, 6450.5);
  assert.equal(result.taxableFiscal, 0);
});

test("il controfattuale che giustifica le autocertificazioni: 540,60 euro", () => {
  const conDichiarazione = eroga(6000, {
    position: { externalDeclared: 4000, declaredAt: "2026-08-01" },
  });
  const alBuio = eroga(6000);

  assert.equal(conDichiarazione.totalContribution, 675.75);
  assert.equal(alBuio.totalContribution, 135.15);
  assert.equal(
    Math.round(
      (conDichiarazione.totalContribution - alBuio.totalContribution) * 100,
    ) / 100,
    540.6,
  );
});

// --- le due soglie sono indipendenti ----------------------------------------

test("si supera la soglia contributiva senza avvicinarsi a quella fiscale", () => {
  const result = eroga(9000);

  assert.ok(result.taxableSocialGross > 0);
  assert.equal(result.taxableFiscal, 0);
  assert.equal(result.fiscalTreatment, "NOT_APPLICABLE");
  assert.ok(
    result.warnings.some((w) => w.code === "SOCIAL_THRESHOLD_CROSSED"),
  );
  assert.ok(
    !result.warnings.some((w) => w.code === "FISCAL_THRESHOLD_CROSSED"),
  );
});

test("la seconda erogazione dell'anno non riusa la franchigia gia consumata", () => {
  const prima = eroga(3000);
  assert.equal(prima.totalContribution, 0);

  const seconda = eroga(3000, { position: { clubGrossPaid: 3000 } });
  assert.equal(seconda.socialFranchiseRemainingBefore, 2000);
  assert.equal(seconda.taxableSocialGross, 1000);
  assert.equal(seconda.socialBase, 500);
  assert.equal(seconda.totalContribution, 135.15);
});

test("le due quote tornano sempre al contributo totale", () => {
  for (const gross of [5001, 6666.66, 7777.77, 12345.67, 19999.99]) {
    const result = eroga(gross);
    assert.equal(
      Math.round(
        (result.employeeContribution + result.employerContribution) * 100,
      ) / 100,
      result.totalContribution,
      `le quote non tornano al totale su ${gross}`,
    );
  }
});

// --- copertura previdenziale -------------------------------------------------

test("un pensionato paga il 24% e ha causale C10", () => {
  const result = eroga(7000, { socialCoverage: "PENSIONER" });

  assert.equal(result.socialRate, 0.24);
  assert.equal(result.snapshot.f24Causale, "C10");
  assert.equal(result.totalContribution, 240);
});

test("l'aliquota non si deduce dal ruolo: la porta la copertura dichiarata", () => {
  const senza = eroga(7000, { socialCoverage: "NONE" });
  const con = eroga(7000, { socialCoverage: "OTHER_COVERAGE" });
  assert.notEqual(senza.socialRate, con.socialRate);
});

// --- regimi senza motore -----------------------------------------------------

test("P.IVA: nessun calcolo co.co.co., nessun contributo trattenuto", () => {
  const result = eroga(6000, { relationshipType: "SELF_EMPLOYED_VAT" });

  assert.equal(result.socialTreatment, "OUT_OF_SCOPE");
  assert.equal(result.fiscalTreatment, "OUT_OF_SCOPE");
  assert.equal(result.employeeContribution, 0);
  assert.equal(result.employerContribution, 0);
  assert.equal(result.socialFranchiseUsed, 0);
  assert.equal(result.clubCost, 6000);
  assert.ok(result.warnings.some((w) => w.code === "VAT_REGIME_NO_ENGINE"));
});

test("P.IVA: anche sopra i 15.000 il club non applica le franchigie sportive", () => {
  const result = eroga(20000, { relationshipType: "SELF_EMPLOYED_VAT" });
  assert.equal(result.taxableFiscal, 0);
  assert.equal(result.taxableSocialGross, 0);
});

test("subordinato con paghe esterne: EasyGame registra il costo e basta", () => {
  const result = eroga(2500, {
    relationshipType: "EXTERNAL_PAYROLL_REFERENCE",
  });

  assert.equal(result.socialTreatment, "OUT_OF_SCOPE");
  assert.ok(
    result.warnings.some((w) => w.code === "EXTERNAL_PAYROLL_NO_ENGINE"),
  );
  assert.match(
    result.warnings.find((w) => w.code === "EXTERNAL_PAYROLL_NO_ENGINE").detail,
    /Nessun cedolino/,
  );
});

// --- autocertificazione ------------------------------------------------------

test("senza autocertificazione dell'anno esce un avviso duro, non un blocco", () => {
  const result = eroga(1200, {
    position: { hasCurrentDeclaration: false },
  });

  const warning = result.warnings.find(
    (w) => w.code === "MISSING_SELF_DECLARATION",
  );
  assert.ok(warning);
  assert.equal(warning.severity, "hard");
  assert.match(warning.message, /2026/);
  assert.match(warning.message, /potrebbe essere incompleto/);
  // Il calcolo c'e comunque: l'avviso non impedisce di pagare.
  assert.equal(result.netSocial, 1200);
});

test("con autocertificazione l'avviso non compare", () => {
  const result = eroga(1200);
  assert.ok(
    !result.warnings.some((w) => w.code === "MISSING_SELF_DECLARATION"),
  );
});

// --- anni ---------------------------------------------------------------------

test("l'anno del calcolo e quello della data di pagamento, non della stagione", () => {
  const gennaio = computeCompensationPayout({
    grossAmount: 1200,
    paidAt: "2027-01-31",
    relationshipType: "SPORT_COCOCO",
    socialCoverage: "NONE",
    position: { ...emptyPosition(2027), hasCurrentDeclaration: true },
  });

  assert.equal(gennaio.year, 2027);
  assert.equal(gennaio.rulesVersion, "2027");
});

test("un anno senza regole non produce un numero", () => {
  assert.throws(
    () =>
      computeCompensationPayout({
        grossAmount: 1200,
        paidAt: "2028-01-31",
        relationshipType: "SPORT_COCOCO",
        socialCoverage: "NONE",
        position: emptyPosition(2028),
      }),
    /non configurate per l'anno 2028/,
  );
});

test("il 2027 calcola, ma dichiara che le sue aliquote non sono validate", () => {
  const result = computeCompensationPayout({
    grossAmount: 7000,
    paidAt: "2027-03-31",
    relationshipType: "SPORT_COCOCO",
    socialCoverage: "NONE",
    position: { ...emptyPosition(2027), hasCurrentDeclaration: true },
  });

  assert.equal(result.totalContribution, 270.3);
  assert.equal(result.definitive, false);
  assert.ok(
    result.warnings.some((w) => w.code === "RULES_PENDING_VALIDATION"),
  );
});

// --- spiegazione e etichette --------------------------------------------------

test("il calcolo si spiega riga per riga", () => {
  const result = eroga(1200, {
    position: { clubGrossPaid: 4000, externalDeclared: 2000, declaredAt: "2026-07-01" },
  });

  const keys = result.explanation.map((line) => line.key);
  for (const expected of [
    "gross",
    "priorClubGross",
    "priorExternal",
    "progressive",
    "socialFranchise",
    "taxableSocialGross",
    "reductionFactor",
    "socialBase",
    "socialRate",
    "employeeContribution",
    "employerContribution",
    "fiscalFranchise",
    "taxableFiscal",
    "fiscalTreatment",
    "netSocial",
    "clubCost",
  ]) {
    assert.ok(keys.includes(expected), `manca la riga ${expected}`);
  }

  const progressive = result.explanation.find((l) => l.key === "progressive");
  assert.equal(progressive.amount, 7200);
});

test("il netto non si chiama definitivo quando non lo e", () => {
  const sotto = eroga(4000);
  const sopra = eroga(18000);
  const piva = eroga(4000, { relationshipType: "SELF_EMPLOYED_VAT" });

  assert.equal(netAmountLabel(sotto), "Netto da corrispondere");
  assert.equal(
    netAmountLabel(sopra),
    "Netto previdenziale (ritenuta fiscale esclusa)",
  );
  assert.equal(netAmountLabel(piva), "Importo da corrispondere");
});

// --- snapshot fiscale ---------------------------------------------------------

test("lo snapshot congela regole, soglie, dichiarato e progressivi", () => {
  const pos = position({ clubGrossPaid: 4000, externalDeclared: 2000, declaredAt: "2026-07-01" });
  const result = computeCompensationPayout({
    grossAmount: 1200,
    paidAt: "2026-09-30",
    relationshipType: "SPORT_COCOCO",
    socialCoverage: "NONE",
    position: pos,
  });

  const snapshot = buildPayoutFiscalSnapshot(result, pos, new Date("2026-09-30T10:00:00Z"));

  assert.equal(snapshot.rulesVersion, "2026");
  assert.equal(snapshot.year, 2026);
  assert.equal(snapshot.thresholds.social, 5000);
  assert.equal(snapshot.thresholds.fiscal, 15000);
  assert.equal(snapshot.rates.socialRate, 0.2703);
  assert.equal(snapshot.rates.reductionFactor, 0.5);
  assert.equal(snapshot.rates.f24Causale, "CXX");
  assert.equal(snapshot.externalDeclaredAmount, 2000);
  assert.equal(snapshot.externalDeclaredAt, "2026-07-01");
  assert.equal(snapshot.clubYtdAmount, 4000);
  assert.equal(snapshot.progressiveAfter, 7200);
  assert.equal(snapshot.computedAt, "2026-09-30T10:00:00.000Z");
  assert.ok(snapshot.sources.socialFranchise.length > 0);
  assert.ok(snapshot.pendingRules.length >= 3);
});

// --- validazione degli input ---------------------------------------------------

test("un importo non positivo non si eroga", () => {
  assert.throws(() => eroga(0), /maggiore di zero/);
  assert.throws(() => eroga(-100), /maggiore di zero/);
});

test("una data non valida non si eroga", () => {
  assert.throws(
    () =>
      computeCompensationPayout({
        grossAmount: 100,
        paidAt: "non una data",
        relationshipType: "SPORT_COCOCO",
        socialCoverage: "NONE",
        position: emptyPosition(2026),
      }),
    /Data di erogazione non valida/,
  );
});

/**
 * **Le note sono testo italiano, e i numeri dentro devono sembrarlo.**
 *
 * `toFixed(2)` produceva «Residua dopo questa erogazione: 8200.00» dentro una
 * frase altrimenti italiana, con il punto al posto della virgola.
 * Quella nota compare nel dialogo di erogazione, sotto gli occhi di una
 * segreteria. Il collaudo a schermo l'ha vista; nessun test la guardava.
 */
test("gli importi dentro le note sono scritti in italiano", () => {
  const result = eroga(1200, {
    position: { clubGrossPaid: 3600, externalDeclared: 2000, declaredAt: "2026-08-20" },
  });

  /*
    L'italiano di CLDR **non raggruppa le migliaia sotto le cinque cifre**:
    8200 si scrive «8200,00» e 15000 si scrive «15.000,00». Non e una svista
    del formattatore, e la regola tipografica italiana — e un test che
    pretendesse «8.200,00» chiederebbe al prodotto di scrivere male.
  */
  const fiscale = result.explanation.find((line) => line.key === "fiscalFranchise");
  assert.match(fiscale.note, /8200,00 euro/);
  assert.ok(
    !fiscale.note.includes("8200.00"),
    "nessun punto decimale dentro una frase italiana",
  );

  const sottoSoglia = eroga(1000);
  const previdenziale = sottoSoglia.explanation.find(
    (line) => line.key === "socialFranchise",
  );
  assert.match(previdenziale.note, /4000,00 euro/);
});

test("anche l'avviso di soglia fiscale superata parla italiano", () => {
  const result = eroga(18000);
  const avviso = result.warnings.find(
    (warning) => warning.code === "FISCAL_THRESHOLD_CROSSED",
  );

  assert.match(avviso.message, /3000,00 euro/);
  assert.ok(!avviso.message.includes("3000.00"));
});
