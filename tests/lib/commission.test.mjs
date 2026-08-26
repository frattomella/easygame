import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * Le **condizioni commerciali della piattaforma**: quale regola vale, quanto
 * vale, e perche il passato non cambia.
 *
 * Il difetto che questi test presidiano e concreto: fino al Blocco D la
 * percentuale viveva in un campo che il club poteva scrivere, e non esisteva
 * traccia di quale fosse in vigore il giorno di un incasso. Cambiare il
 * listino riscriveva la lettura del passato.
 */

let commission;
let fees;

before(async () => {
  commission = await import("../../src/lib/payments/commission.ts");
  fees = await import("../../src/lib/payments/platform-fees.ts");
});

const REGOLA = (over = {}) => ({
  id: "r1",
  organizationId: null,
  percent: 1,
  fixedCents: 0,
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  note: null,
  ...over,
});

/* ------------------------------------------------------------ risoluzione */

test("senza nessuna regola si usa il valore di riserva, e lo si dichiara", () => {
  const risolta = commission.resolveCommission({ rules: [] });

  assert.equal(risolta.percent, commission.FALLBACK_COMMISSION_PERCENT);
  assert.equal(risolta.origin, "fallback");
  assert.equal(risolta.ruleId, null);
});

test("la commissione standard vale per un club senza condizione dedicata", () => {
  const risolta = commission.resolveCommission({
    rules: [REGOLA({ percent: 1.5 })],
    organizationId: "club-a",
    at: "2026-06-01T00:00:00.000Z",
  });

  assert.equal(risolta.percent, 1.5);
  assert.equal(risolta.origin, "platform");
});

test("l'override di un club vince sulla condizione standard", () => {
  const risolta = commission.resolveCommission({
    rules: [
      REGOLA({ id: "std", percent: 1 }),
      REGOLA({ id: "ovr", organizationId: "club-a", percent: 0.75 }),
    ],
    organizationId: "club-a",
    at: "2026-06-01T00:00:00.000Z",
  });

  assert.equal(risolta.percent, 0.75);
  assert.equal(risolta.origin, "club");
  assert.equal(risolta.ruleId, "ovr");
});

test("l'override di un club non tocca gli altri club", () => {
  const rules = [
    REGOLA({ id: "std", percent: 1 }),
    REGOLA({ id: "ovr", organizationId: "fortitudo", percent: 0.75 }),
  ];

  assert.equal(
    commission.resolveCommission({ rules, organizationId: "club-x" }).percent,
    1,
  );
  assert.equal(
    commission.resolveCommission({ rules, organizationId: "fortitudo" }).percent,
    0.75,
  );
});

test("una regola futura non vale prima della sua decorrenza", () => {
  const rules = [
    REGOLA({ id: "vecchia", percent: 1, effectiveFrom: "2026-01-01T00:00:00.000Z" }),
    REGOLA({ id: "nuova", percent: 1.5, effectiveFrom: "2026-09-01T00:00:00.000Z" }),
  ];

  assert.equal(
    commission.resolveCommission({ rules, at: "2026-08-15T00:00:00.000Z" }).percent,
    1,
    "il 15 agosto vale ancora l'1%",
  );

  assert.equal(
    commission.resolveCommission({ rules, at: "2026-09-02T00:00:00.000Z" }).percent,
    1.5,
  );
});

test("la lettura del passato usa la regola di allora, non quella di oggi", () => {
  /*
    E la domanda che si fa chi riconcilia sei mesi di movimenti: «quale
    percentuale valeva quel giorno?». La risposta non puo essere quella
    corrente.
  */
  const rules = [
    REGOLA({ id: "a", percent: 1, effectiveFrom: "2026-01-01T00:00:00.000Z" }),
    REGOLA({ id: "b", percent: 1.5, effectiveFrom: "2026-07-01T00:00:00.000Z" }),
  ];

  assert.equal(
    commission.resolveCommission({ rules, at: "2026-03-10T00:00:00.000Z" }).percent,
    1,
  );
});

test("a parita di decorrenza l'override del club precede lo standard", () => {
  const risolta = commission.resolveCommission({
    rules: [
      REGOLA({ id: "std", percent: 1 }),
      REGOLA({ id: "ovr", organizationId: "club-a", percent: 0.5 }),
    ],
    organizationId: "club-a",
  });

  assert.equal(
    risolta.percent,
    0.5,
    "quale delle due vinca non deve dipendere dall'ordine del database",
  );
});

test("una percentuale assurda viene tagliata invece di arrivare al PSP", () => {
  const risolta = commission.resolveCommission({
    rules: [REGOLA({ percent: 250 })],
  });

  assert.equal(risolta.percent, 100);
});

/* ------------------------------------------------------------ il calcolo */

test("commissione dell'1% su 130 €: 1,30 alla piattaforma, 128,70 al club", () => {
  const congelata = commission.freezeSettlement({
    grossAmountCents: 13000,
    commission: commission.resolveCommission({ rules: [REGOLA({ percent: 1 })] }),
  });

  assert.equal(congelata.grossAmountCents, 13000);
  assert.equal(congelata.platformFeeCents, 130);
  assert.equal(congelata.netAmountCents, 12870);
  assert.equal(congelata.appliedFeePercent, 1);
});

test("la quota fissa si applica anche quando la percentuale e zero", () => {
  /*
    Era un difetto: `calculatePlatformFee` usciva subito su `percent <= 0` e la
    quota fissa spariva in silenzio. «Nessuna percentuale, 50 centesimi a
    transazione» e una condizione commerciale legittima.
  */
  const risultato = fees.calculatePlatformFee({
    amountCents: 13000,
    percent: 0,
    fixedCents: 50,
  });

  assert.equal(risultato.platformFeeCents, 50);
  assert.equal(risultato.clubNetAmountCents, 12950);
});

test("la commissione non puo superare l'incasso", () => {
  const risultato = fees.calculatePlatformFee({
    amountCents: 100,
    percent: 50,
    fixedCents: 900,
  });

  assert.equal(risultato.platformFeeCents, 100);
  assert.equal(risultato.clubNetAmountCents, 0);
});

test("la fee del PSP, quando si conosce, scende dal netto del club", () => {
  const congelata = commission.freezeSettlement({
    grossAmountCents: 13000,
    commission: commission.resolveCommission({ rules: [REGOLA({ percent: 1 })] }),
    providerFeeCents: 219,
  });

  assert.equal(congelata.platformFeeCents, 130);
  assert.equal(congelata.providerFeeCents, 219);
  assert.equal(congelata.netAmountCents, 13000 - 130 - 219);
});

test("quando la fee del PSP non si conosce resta nulla, non zero", () => {
  const congelata = commission.freezeSettlement({
    grossAmountCents: 13000,
    commission: commission.resolveCommission({ rules: [REGOLA()] }),
  });

  assert.equal(
    congelata.providerFeeCents,
    null,
    "«non lo so» e «e zero» sono due affermazioni diverse",
  );
});

/* ------------------------------------------------------------- rimborsi */

test("un rimborso parziale restituisce la quota proporzionale di commissione", () => {
  const originale = commission.freezeSettlement({
    grossAmountCents: 13000,
    commission: commission.resolveCommission({ rules: [REGOLA({ percent: 1 })] }),
  });

  const storno = commission.reverseSettlement({
    original: originale,
    refundedAmountCents: 3000,
  });

  assert.equal(storno.grossAmountCents, -3000);
  assert.equal(storno.platformFeeCents, -30, "30 su 130 e il 23%: 30 centesimi");
});

test("un rimborso totale restituisce esattamente quel che era stato trattenuto", () => {
  const originale = commission.freezeSettlement({
    grossAmountCents: 3333,
    commission: commission.resolveCommission({ rules: [REGOLA({ percent: 1 })] }),
  });

  const storno = commission.reverseSettlement({
    original: originale,
    refundedAmountCents: 3333,
  });

  assert.equal(
    storno.platformFeeCents,
    -originale.platformFeeCents,
    "un centesimo di arrotondamento fra incassato e restituito e una telefonata",
  );
});

test("un rimborso proporzionale non usa la condizione di oggi", () => {
  /*
    Il denaro da restituire e quello che era stato trattenuto **allora**. La
    regola nel frattempo puo essere cambiata, e ricalcolare produrrebbe un
    rimborso diverso da quel che il club aveva pagato.
  */
  const storno = commission.reverseSettlement({
    original: {
      grossAmountCents: 10000,
      platformFeeCents: 250,
      providerFeeCents: null,
      appliedFeePercent: 2.5,
      appliedFeeFixedCents: 0,
      commissionRuleId: "vecchia",
    },
    refundedAmountCents: 10000,
  });

  assert.equal(storno.platformFeeCents, -250);
  assert.equal(storno.appliedFeePercent, 2.5);
  assert.equal(storno.commissionRuleId, "vecchia");
});

test("un rimborso non puo superare l'incasso", () => {
  const storno = commission.reverseSettlement({
    original: {
      grossAmountCents: 5000,
      platformFeeCents: 50,
      providerFeeCents: null,
      appliedFeePercent: 1,
      appliedFeeFixedCents: 0,
      commissionRuleId: null,
    },
    refundedAmountCents: 999999,
  });

  assert.equal(storno.grossAmountCents, -5000);
});

/* ---------------------------------------------------------------- forma */

test("la percentuale si scrive all'italiana", () => {
  assert.equal(commission.formatCommissionPercent(1), "1,00%");
  assert.equal(commission.formatCommissionPercent(0.75), "0,75%");
});
