import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * **Cio che nessuno ha dichiarato non deve sembrare dichiarato.**
 *
 * Il §5.2 del piano della Wave 4 ha trovato un motore fiscale completo che non
 * raggiungeva nessun dato: `operation_type_code` era sempre `null` sugli
 * incassi, la catena ricadeva su `DEFAULT_OPERATION_TYPE_BY_ORIGIN`, e da quel
 * punto in poi **ogni** documento risultava «quota attivita» — con la stessa
 * faccia che avrebbe avuto se qualcuno l'avesse scelto. `activity_scope`, la
 * colonna che distingue istituzionale da commerciale, non toccava una sola riga
 * reale.
 *
 * Questi test provano la meta pura del rimedio: la provenienza della causale
 * viaggia accanto alla causale, la classificazione si congela, e cio che manca
 * si legge **NON CLASSIFICATO** invece di somigliare a una scelta.
 *
 * ADR-0073: il motore propone e spiega; cio che non e validato non produce un
 * numero definitivo.
 */

let operations;
let engine;
let profileLib;
let snapshotLib;
let vatLib;

before(async () => {
  operations = await import("../../src/lib/fiscal/operation-types.ts");
  engine = await import("../../src/lib/fiscal/engine.ts");
  profileLib = await import("../../src/lib/fiscal/fiscal-profile.ts");
  snapshotLib = await import("../../src/lib/documents/document-snapshot.ts");
  vatLib = await import("../../src/lib/fiscal/vat.ts");
});

const PROFILO = () =>
  profileLib.normalizeFiscalProfile({
    legalForm: "asd",
    legalName: "ASD Alfa",
    vatNumber: "12345678903",
    taxRegimeCode: "RF01",
    address: "Via Roma 1",
    city: "Roma",
    postalCode: "00100",
    province: "RM",
  });

const INTESTATARIO = {
  name: "Anna Rossi",
  fiscalCode: "RSSNNA80A41H501K",
  address: "Via Milano 4",
  city: "Roma",
  postalCode: "00185",
  province: "RM",
};

const tipo = (code, overrides = {}) =>
  operations.normalizeOperationType({
    ...operations.OPERATION_TYPE_SEEDS.find((seed) => seed.code === code),
    ...overrides,
  });

/* ------------------------------- la classificazione congelata, e chi l'ha detta */

test("una causale dichiarata e commerciale porta il suo ambito", () => {
  const congelata = operations.freezeClassification(
    tipo("vendita_abbigliamento"),
    "declared",
  );

  assert.equal(congelata.declared, true);
  assert.equal(congelata.activityScope, "commercial");
  assert.equal(congelata.label, "Attivita commerciale");
});

test("la stessa causale, solo proposta, non porta nessun ambito", () => {
  const congelata = operations.freezeClassification(
    tipo("vendita_abbigliamento"),
    "proposed",
  );

  assert.equal(congelata.declared, false);
  assert.equal(
    congelata.activityScope,
    "unspecified",
    "un ambito proposto sommato in un rendiconto e un numero che nessuno ha deciso",
  );
  assert.equal(congelata.label, operations.UNCLASSIFIED_LABEL);
  assert.equal(
    congelata.operationTypeCode,
    "vendita_abbigliamento",
    "il codice proposto resta leggibile: serve a capire cosa il motore stava proponendo",
  );
});

test("una causale dichiarata ma senza ambito resta non classificata", () => {
  /*
    Sette voci del seme su nove nascono `unspecified`, e non e una svista: dire
    «la quota associativa e istituzionale» sarebbe vero nella maggior parte dei
    casi e falso in abbastanza casi da produrre danni.
  */
  const congelata = operations.freezeClassification(
    tipo("quota_attivita"),
    "declared",
  );

  assert.equal(congelata.declared, false);
  assert.equal(congelata.label, operations.UNCLASSIFIED_LABEL);
});

test("senza nessuna causale non si inventa niente", () => {
  const congelata = operations.freezeClassification(null, "absent");

  assert.equal(congelata.operationTypeCode, null);
  assert.equal(congelata.activityScope, "unspecified");
  assert.equal(congelata.deductible, null);
  assert.equal(congelata.isMembershipFee, null);
});

test("i flag del 730 non passano da una proposta", () => {
  const causale = tipo("quota_associativa", {
    deductible: true,
    is_membership_fee: true,
  });

  assert.equal(
    operations.freezeClassification(causale, "declared").deductible,
    true,
  );
  assert.equal(
    operations.freezeClassification(causale, "proposed").deductible,
    null,
    "un flag detraibile proposto da un software e un flag che nessuno ha letto",
  );
});

/* -------------------------------- il motore propone, e dice che sta proponendo */

test("una causale proposta produce comunque una decisione utile", () => {
  const decisione = engine.decideDocument({
    profile: PROFILO(),
    operationType: tipo("sponsorizzazione"),
    operationTypeSource: "proposed",
    recipient: { ...INTESTATARIO, name: "Rossi S.r.l.", vatNumber: "12345678903" },
  });

  assert.deepEqual(
    decisione.allowed,
    ["invoice"],
    "togliere la proposta peggiorerebbe il prodotto: serve a scegliere il documento giusto",
  );
});

test("ma dichiara che nessuno l'ha classificata, e lo scrive nel motivo", () => {
  const decisione = engine.decideDocument({
    profile: PROFILO(),
    operationType: tipo("quota_attivita"),
    operationTypeSource: "proposed",
    recipient: INTESTATARIO,
  });

  assert.equal(decisione.needsConfiguration, true);
  assert.equal(decisione.classification.declared, false);
  assert.match(decisione.reason, /NON CLASSIFICATO/);
});

test("una causale scelta da una persona non porta quell'avvertenza", () => {
  const decisione = engine.decideDocument({
    profile: PROFILO(),
    operationType: tipo("vendita_abbigliamento"),
    operationTypeSource: "declared",
    recipient: INTESTATARIO,
  });

  assert.equal(decisione.classification.declared, true);
  assert.doesNotMatch(decisione.reason, /NON CLASSIFICATO/);
});

test("chi non dichiara una provenienza sta passando una scelta esplicita", () => {
  /* Retrocompatibilita: il contratto precedente non aveva questo campo. */
  const decisione = engine.decideDocument({
    profile: PROFILO(),
    operationType: tipo("sponsorizzazione"),
    recipient: { ...INTESTATARIO, name: "Rossi S.r.l.", vatNumber: "12345678903" },
  });

  assert.equal(decisione.classification.source, "declared");
  assert.equal(decisione.classification.activityScope, "commercial");
});

/* ------------------------------------------- imponibile e imposta: il dato */

test("senza aliquota dichiarata imponibile e imposta restano vuoti", () => {
  const split = vatLib.splitVatFromTotal({ totalCents: 13000, vatRate: null });

  assert.equal(split.taxableAmountCents, null);
  assert.equal(split.vatAmountCents, null);
  assert.equal(split.declared, false);
});

test("aliquota zero dichiarata non e la stessa cosa di aliquota assente", () => {
  const split = vatLib.splitVatFromTotal({ totalCents: 13000, vatRate: 0 });

  assert.equal(split.declared, true);
  assert.equal(split.taxableAmountCents, 13000);
  assert.equal(split.vatAmountCents, 0);
});

test("l'importo incassato e lordo: imponibile e imposta lo ricompongono", () => {
  const split = vatLib.splitVatFromTotal({ totalCents: 12200, vatRate: 22 });

  assert.equal(split.taxableAmountCents, 10000);
  assert.equal(split.vatAmountCents, 2200);
  assert.equal(
    split.taxableAmountCents + split.vatAmountCents,
    12200,
    "due arrotondamenti indipendenti perderebbero un centesimo",
  );
});

test("i due addendi risommano al totale anche sugli importi scomodi", () => {
  for (const totalCents of [1, 333, 4999, 100003, 987654]) {
    const split = vatLib.splitVatFromTotal({ totalCents, vatRate: 22 });
    assert.equal(split.taxableAmountCents + split.vatAmountCents, totalCents);
  }
});

/* --------------------------------------- lo snapshot congela cio che serve */

test("lo snapshot porta imponibile, imposta e classificazione", () => {
  const split = vatLib.splitVatFromTotal({ totalCents: 12200, vatRate: 22 });

  const snapshot = snapshotLib.buildDocumentSnapshot({
    profile: PROFILO(),
    organizationName: "ASD Alfa",
    recipient: { name: "Rossi S.r.l.", source: "counterparty" },
    issuedAt: new Date("2026-08-29T10:00:00.000Z"),
    description: "Sponsorizzazione",
    totalCents: 12200,
    vatRate: 22,
    taxableAmountCents: split.taxableAmountCents,
    vatAmountCents: split.vatAmountCents,
    classification: operations.freezeClassification(
      tipo("sponsorizzazione"),
      "declared",
    ),
  });

  assert.equal(snapshot.amounts.taxableAmountCents, 10000);
  assert.equal(snapshot.amounts.vatAmountCents, 2200);
  assert.equal(snapshot.classification.activityScope, "commercial");
  assert.equal(snapshot.classification.declared, true);
});

test("uno snapshot senza classificazione lo dichiara, non ne inventa una", () => {
  const snapshot = snapshotLib.buildDocumentSnapshot({
    profile: PROFILO(),
    organizationName: "ASD Alfa",
    recipient: { name: "Anna Rossi", source: "guardian" },
    issuedAt: new Date("2026-08-29T10:00:00.000Z"),
    description: "Quota",
    totalCents: 13000,
  });

  assert.equal(snapshot.classification.declared, false);
  assert.equal(snapshot.classification.activityScope, "unspecified");
  assert.equal(snapshot.classification.label, operations.UNCLASSIFIED_LABEL);
  assert.equal(snapshot.amounts.taxableAmountCents, null);
});

/* ------------------------------------------------ il numero non lo digita il client */

test("un numero digitato dal client viene riconosciuto come tale", () => {
  assert.equal(
    snapshotLib.clientAssignedDocumentNumberField("invoices", {
      invoice_number: "FT-2026-0001",
    }),
    "invoice_number",
  );

  assert.equal(
    snapshotLib.clientAssignedDocumentNumberField("receipts", {
      receipt_number: "R-2026-0007",
    }),
    "receipt_number",
  );
});

test("un corpo che non porta il numero non ha niente da rifiutare", () => {
  assert.equal(
    snapshotLib.clientAssignedDocumentNumberField("invoices", { amount: 100 }),
    null,
  );
  assert.equal(
    snapshotLib.clientAssignedDocumentNumberField("invoices", {
      invoice_number: "   ",
    }),
    null,
  );
  assert.equal(
    snapshotLib.clientAssignedDocumentNumberField("athletes", {
      invoice_number: "FT-1",
    }),
    null,
    "la regola vale sui documenti, non su ogni risorsa",
  );
});

/* -------------------------------------- imponibile e imposta sono immutabili */

test("imponibile e imposta di un documento emesso non si riscrivono", () => {
  const emesso = {
    status: "issued",
    amount: 122,
    taxable_amount_cents: 10000,
    vat_amount_cents: 2200,
  };

  assert.throws(
    () =>
      snapshotLib.assertDocumentMutable(emesso, { taxable_amount_cents: 12200 }),
    /taxable_amount_cents/,
  );
});

test("un documento non ancora emesso resta modificabile", () => {
  assert.doesNotThrow(() =>
    snapshotLib.assertDocumentMutable(
      { status: "draft", amount: 100 },
      { amount: 120 },
    ),
  );
});
