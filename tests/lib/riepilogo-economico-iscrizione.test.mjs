import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * **I sette numeri della scheda «Iscrizione»** (N14, area A).
 *
 * ---
 *
 * ## Cosa deve restare vero
 *
 * Il collaudo reale ha trovato una scheda che mostrava tre numeri — quota,
 * pagato, residuo — tutti **lordi**, e un riquadro dei voucher piu sotto che
 * parlava d'altro. Chi la apriva per sapere quanto chiedere alla famiglia
 * leggeva 600 su una quota di cui l'ente ne portava 500.
 *
 * I sette numeri servono a questo, e valgono solo se **quadrano**:
 *
 * ```
 * quota totale        = copertura prevista + a carico della famiglia
 * a carico famiglia   = pagato dalla famiglia + residuo
 * ```
 *
 * ## La distinzione che nessun test qui deve poter perdere
 *
 * ```
 * Debito ≠ Copertura ≠ Maturazione ≠ Liquidazione ≠ Pagamento famiglia
 * ```
 *
 * Nessuna delle tre grandezze dell'ente entra mai in `familyPaidAmount`: quel
 * numero viene **soltanto** dai movimenti. E la difesa di ADR-0037, e ADR-0158
 * non l'ha allentata.
 */

let coverage;
let ledger;

before(async () => {
  coverage = await import("../../src/lib/payments/coverage-ledger.ts");
  ledger = await import("../../src/lib/payments/installment-ledger.ts");
});

const ADESIONE = "adesione-1";
const ATLETA = "atleta-1";

const allocazione = (paymentId, amount, extra = {}) => ({
  id: `cop-${paymentId}-${amount}`,
  payment_id: paymentId,
  enrollment_id: ADESIONE,
  athlete_id: ATLETA,
  amount,
  ...extra,
});

const incasso = (paymentId, amount) => ({
  id: `mov-${paymentId}-${amount}`,
  payment_id: paymentId,
  amount,
  status: "completed",
});

/**
 * Il piano dello scenario 1 del mandato: 600 di quota, 500 di voucher, tre rate
 * da 200 coperte per 150 / 200 / 150.
 */
const scenarioUno = ({ statoBando, incassi = [] }) => {
  const rate = [
    { id: "rata-1", amount: 200, copertura: 150 },
    { id: "rata-2", amount: 200, copertura: 200 },
    { id: "rata-3", amount: 200, copertura: 150 },
  ];

  const allocazioni = rate.map((rata) =>
    allocazione(rata.id, rata.copertura),
  );

  const perAdesione = { [ADESIONE]: 500 };

  const coverageByInstallment = {};
  const installments = [];

  for (const rata of rate) {
    const movimenti = incassi.filter((riga) => riga.payment_id === rata.id);

    const quadro = coverage.resolveInstallmentCoverage({
      dueAmount: rata.amount,
      transactions: ledger.normalizePaymentTransactions(movimenti),
      allocations: allocazioni.filter(
        (riga) => riga.payment_id === rata.id,
      ),
      enrollmentCoverage: perAdesione,
      enrollmentFunding: { [ADESIONE]: statoBando },
    });

    coverageByInstallment[rata.id] = quadro;
    installments.push({
      installmentId: rata.id,
      dueAmount: rata.amount,
      paidAmount: quadro.familyPaidAmount,
    });
  }

  return coverage.summarizePlanCoverage({
    installments,
    coverageByInstallment,
  });
};

/* ------------------------------------------------------------ scenario 1 */

test("scenario 1 · 600 di quota, 500 di voucher, 100 alla famiglia", () => {
  const riepilogo = scenarioUno({
    statoBando: { accruedAmount: 0, settledAmount: 0 },
  });

  assert.equal(riepilogo.dueAmount, 600);
  assert.equal(riepilogo.plannedCoverage, 500);
  assert.equal(riepilogo.familyDueAmount, 100);
  assert.equal(riepilogo.familyPaidAmount, 0);
  assert.equal(riepilogo.familyResidualAmount, 100);
  assert.equal(riepilogo.coveredInstallmentCount, 3);
});

test("scenario 1 · le quote per rata sono 50, 0 e 50", () => {
  /*
    La rata centrale e coperta per intero: la famiglia non deve niente su
    quella, ed e il caso in cui la scheda diceva «Residuo 200,00» sopra una riga
    che diceva «Residuo 0,00».
  */
  const perRata = [
    { dueAmount: 200, copertura: 150, atteso: 50 },
    { dueAmount: 200, copertura: 200, atteso: 0 },
    { dueAmount: 200, copertura: 150, atteso: 50 },
  ];

  for (const caso of perRata) {
    const quadro = coverage.resolveInstallmentCoverage({
      dueAmount: caso.dueAmount,
      allocations: [allocazione("rata-x", caso.copertura)],
      enrollmentCoverage: { [ADESIONE]: 500 },
      enrollmentFunding: {
        [ADESIONE]: { accruedAmount: 0, settledAmount: 0 },
      },
    });

    assert.equal(quadro.familyDueAmount, caso.atteso);
    assert.equal(
      quadro.dueAmount,
      caso.dueAmount,
      "il debito non cambia mai: cambia chi lo porta",
    );
  }
});

test("scenario 1 · l'invariante regge: quota = copertura + quota famiglia", () => {
  const riepilogo = scenarioUno({
    statoBando: { accruedAmount: 220, settledAmount: 60 },
  });

  assert.equal(
    riepilogo.plannedCoverage + riepilogo.familyDueAmount,
    riepilogo.dueAmount,
  );
});

/* ------------------------------------------------------------ scenario 6 */

test("scenario 6 · 500 previsto, 100 maturato, 0 liquidato restano tre numeri", () => {
  const riepilogo = scenarioUno({
    statoBando: { accruedAmount: 100, settledAmount: 0 },
  });

  assert.equal(riepilogo.plannedCoverage, 500, "la promessa");
  assert.equal(riepilogo.accruedCoverage, 100, "cio che l'atleta ha guadagnato");
  assert.equal(riepilogo.settledCoverage, 0, "cio che l'ente ha versato");

  assert.notEqual(
    riepilogo.plannedCoverage,
    riepilogo.accruedCoverage,
    "prevista e maturata non sono la stessa grandezza",
  );
  assert.equal(
    riepilogo.familyDueAmount,
    100,
    "e la quota della famiglia dipende dalla promessa, non dal maturato",
  );
});

test("scenario 6 · un maturato che cresce non tocca cio che la famiglia deve", () => {
  /*
    **E la proprieta piu importante del riepilogo.** Se la quota famiglia
    seguisse il maturato, ogni mese di allenamento cambierebbe l'importo della
    rata gia emessa — e la famiglia riceverebbe un bollettino diverso ogni
    trenta giorni.
  */
  const quote = [0, 100, 250, 500].map(
    (accruedAmount) =>
      scenarioUno({ statoBando: { accruedAmount, settledAmount: 0 } })
        .familyDueAmount,
  );

  assert.deepEqual(quote, [100, 100, 100, 100]);
});

/* ------------------------------------------------------------ scenario 7 */

test("scenario 7 · la famiglia versa 50 mentre il voucher non e maturato", () => {
  const riepilogo = scenarioUno({
    statoBando: { accruedAmount: 0, settledAmount: 0 },
    incassi: [incasso("rata-1", 50)],
  });

  assert.equal(riepilogo.familyPaidAmount, 50);
  assert.equal(riepilogo.familyResidualAmount, 50);
  assert.equal(
    riepilogo.accruedCoverage,
    0,
    "il versamento della famiglia non fa maturare niente",
  );
  assert.equal(
    riepilogo.plannedCoverage,
    500,
    "e non consuma la copertura promessa",
  );
});

test("scenario 7 · nessuna grandezza dell'ente entra nel pagato dalla famiglia", () => {
  /*
    Il controspecchio, e vale al contrario: si fa maturare **e** liquidare
    l'intero voucher, senza che la famiglia versi un centesimo. Se il maturato
    trapelasse nella cassa, `familyPaidAmount` salirebbe da solo.
  */
  const riepilogo = scenarioUno({
    statoBando: { accruedAmount: 500, settledAmount: 500 },
  });

  assert.equal(riepilogo.accruedCoverage, 500);
  assert.equal(riepilogo.settledCoverage, 500);
  assert.equal(
    riepilogo.familyPaidAmount,
    0,
    "l'ente ha versato 500 e la famiglia non ha pagato niente: sono due casse",
  );
  assert.equal(riepilogo.familyResidualAmount, 100);
});

/* -------------------------------------------------- gli stati del piano */

test("piano senza voucher: i sette numeri si riducono onestamente a quattro", () => {
  const riepilogo = coverage.summarizePlanCoverage({
    installments: [
      { installmentId: "rata-1", dueAmount: 300, paidAmount: 100 },
      { installmentId: "rata-2", dueAmount: 300, paidAmount: 0 },
    ],
    coverageByInstallment: {},
  });

  assert.equal(riepilogo.dueAmount, 600);
  assert.equal(riepilogo.plannedCoverage, 0);
  assert.equal(riepilogo.familyDueAmount, 600, "tutto a carico della famiglia");
  assert.equal(riepilogo.familyPaidAmount, 100);
  assert.equal(riepilogo.familyResidualAmount, 500);
  assert.equal(riepilogo.coveredInstallmentCount, 0);
});

test("una rata non coperta resta nel totale", () => {
  /*
    `coverageByInstallment` porta **solo** le rate coperte. Trattare l'assenza
    come «rata da zero» farebbe sparire dal riepilogo tutte le rate che la
    famiglia paga per intero — cioe, su un piano misto, quasi tutte.
  */
  const riepilogo = coverage.summarizePlanCoverage({
    installments: [
      { installmentId: "coperta", dueAmount: 200, paidAmount: 0 },
      { installmentId: "scoperta", dueAmount: 400, paidAmount: 40 },
    ],
    coverageByInstallment: {
      coperta: coverage.resolveInstallmentCoverage({
        dueAmount: 200,
        allocations: [allocazione("coperta", 150)],
        enrollmentCoverage: { [ADESIONE]: 150 },
        enrollmentFunding: {
          [ADESIONE]: { accruedAmount: 0, settledAmount: 0 },
        },
      }),
    },
  });

  assert.equal(riepilogo.dueAmount, 600);
  assert.equal(riepilogo.familyDueAmount, 450);
  assert.equal(riepilogo.familyPaidAmount, 40);
  assert.equal(riepilogo.familyResidualAmount, 410);
});

test("nessun piano: sette zeri, nessun NaN", () => {
  const riepilogo = coverage.summarizePlanCoverage({});

  for (const [chiave, valore] of Object.entries(riepilogo)) {
    assert.equal(
      Number.isFinite(valore),
      true,
      `${chiave} deve restare un numero anche senza rate`,
    );
    assert.equal(valore, 0);
  }
});

test("un voucher stornato smette di ridurre la quota della famiglia", () => {
  /*
    Scenario 8 del mandato, visto dal riepilogo: dopo l'annullamento la famiglia
    torna a dovere l'intera quota. Le righe restano — lo storico non si riscrive
    — ma la coppia originale/storno non conta piu.
  */
  const originale = allocazione("rata-1", 500, {
    reversed_at: "2026-02-01T00:00:00.000Z",
  });
  const storno = {
    ...allocazione("rata-1", -500),
    id: "cop-storno",
    reverses_allocation_id: originale.id,
  };

  const quadro = coverage.resolveInstallmentCoverage({
    dueAmount: 600,
    allocations: [originale, storno],
    enrollmentCoverage: { [ADESIONE]: 0 },
    enrollmentFunding: { [ADESIONE]: { accruedAmount: 0, settledAmount: 0 } },
  });

  const riepilogo = coverage.summarizePlanCoverage({
    installments: [{ installmentId: "rata-1", dueAmount: 600, paidAmount: 0 }],
    coverageByInstallment: { "rata-1": quadro },
  });

  assert.equal(riepilogo.plannedCoverage, 0);
  assert.equal(riepilogo.familyDueAmount, 600, "la quota torna intera");
  assert.equal(riepilogo.coveredInstallmentCount, 0);
});

test("una famiglia che ha versato piu del dovuto non produce un residuo negativo", () => {
  const riepilogo = coverage.summarizePlanCoverage({
    installments: [{ installmentId: "rata-1", dueAmount: 100, paidAmount: 150 }],
    coverageByInstallment: {},
  });

  assert.equal(riepilogo.familyPaidAmount, 150);
  assert.equal(
    riepilogo.familyResidualAmount,
    0,
    "un credito e un fatto della rata, non un residuo da sottrarre alle altre",
  );
});

/* ------------------------------- i reperti della revisione ostile contabile */

test("F2 · una rata saldata prima del registro non risulta da pagare", () => {
  /*
    **Il reperto F2.**

    Esiste una classe di rate saldate prima del registro degli incassi: lo
    dichiarano con `status = "paid"` e **nessun movimento**. `familyPaidAmount`
    somma i movimenti, quindi su una di quelle — coperta da un voucher — la
    copertura diceva «versato zero», e la scheda chiedeva di nuovo alla famiglia
    una rata che due righe piu sotto risultava saldata.

    Il registro conosce tutte e due le forme, e non contiene mai un centesimo
    dell'ente: vince il registro.
  */
  const rataVecchia = ledger.resolveInstallmentLedger({
    charge: {
      id: "rata-vecchia",
      amount: 300,
      status: "paid",
      paid_at: "2026-01-10T00:00:00.000Z",
    },
    transactions: [],
  });

  assert.equal(rataVecchia.paidAmount, 300, "il registro la sa gia saldata");

  const quadro = coverage.resolveInstallmentCoverage({
    dueAmount: 300,
    transactions: [],
    allocations: [allocazione("rata-vecchia", 100)],
    enrollmentCoverage: { [ADESIONE]: 100 },
    enrollmentFunding: { [ADESIONE]: { accruedAmount: 0, settledAmount: 0 } },
  });

  const quotaFamiglia = coverage.withFamilyShare(rataVecchia, quadro);

  assert.equal(quotaFamiglia.dueAmount, 200, "l'ente ne porta 100");
  assert.equal(
    quotaFamiglia.paidAmount,
    300,
    "e la famiglia aveva gia versato: non le si chiede di nuovo",
  );
  assert.equal(quotaFamiglia.residualAmount, 0);
  assert.equal(quotaFamiglia.state, "paid");
  assert.deepEqual(quotaFamiglia.statusLabels, ["PAGATA"]);

  const riepilogo = coverage.summarizePlanCoverage({
    installments: [quotaFamiglia],
    coverageByInstallment: { "rata-vecchia": quadro },
  });
  assert.equal(riepilogo.familyPaidAmount, 300);
  assert.equal(riepilogo.familyResidualAmount, 0);
});

test("F3 · una rata scaduta e interamente coperta non e un ritardo di nessuno", () => {
  const rata = ledger.resolveInstallmentLedger({
    charge: {
      id: "rata-scaduta",
      amount: 200,
      due_date: "2020-01-31T00:00:00.000Z",
      status: "pending",
    },
    transactions: [],
  });

  assert.equal(rata.overdue, true, "lorda e in ritardo");

  const quadro = coverage.resolveInstallmentCoverage({
    dueAmount: 200,
    allocations: [allocazione("rata-scaduta", 200)],
    enrollmentCoverage: { [ADESIONE]: 200 },
    enrollmentFunding: { [ADESIONE]: { accruedAmount: 0, settledAmount: 0 } },
  });

  const quotaFamiglia = coverage.withFamilyShare(rata, quadro);

  assert.equal(quotaFamiglia.overdue, false, "la famiglia non deve niente");
  assert.equal(quotaFamiglia.state, "paid");
  assert.deepEqual(quotaFamiglia.statusLabels, ["PAGATA"]);

  const totali = ledger.summarizeLedgers([quotaFamiglia]);
  assert.equal(totali.overdueCount, 0, "e il conteggio non la annuncia in rosso");
  assert.equal(totali.overdueAmount, 0);
});

test("F4 · l'invariante regge anche su una rata ridotta dopo la copertura", () => {
  /*
    Una rata da 100 coperta per 100, poi corretta a 60. La promessa resta 100 —
    e un fatto — ma la copertura che **agisce** su quel debito e 60: sommare la
    promessa faceva uscire «quota 60, copertura 100, famiglia 0», tre numeri
    che non stanno insieme.
  */
  const quadro = coverage.resolveInstallmentCoverage({
    dueAmount: 60,
    allocations: [allocazione("rata-ridotta", 100)],
    enrollmentCoverage: { [ADESIONE]: 100 },
    enrollmentFunding: { [ADESIONE]: { accruedAmount: 0, settledAmount: 0 } },
  });

  assert.equal(quadro.plannedCoverage, 100, "la promessa resta un fatto");
  assert.equal(quadro.appliedCoverage, 60, "ma agisce solo fino al debito");

  const riepilogo = coverage.summarizePlanCoverage({
    installments: [{ installmentId: "rata-ridotta", dueAmount: 60, paidAmount: 0 }],
    coverageByInstallment: { "rata-ridotta": quadro },
  });

  assert.equal(riepilogo.dueAmount, 60);
  assert.equal(riepilogo.plannedCoverage, 60);
  assert.equal(riepilogo.familyDueAmount, 0);
  assert.equal(
    riepilogo.plannedCoverage + riepilogo.familyDueAmount,
    riepilogo.dueAmount,
    "quota totale = copertura + quota famiglia, sempre",
  );
});

test("l'invariante regge su ogni combinazione provata", () => {
  const casi = [
    { due: 200, coperto: 150, versato: 0 },
    { due: 200, coperto: 200, versato: 0 },
    { due: 200, coperto: 0, versato: 200 },
    { due: 200, coperto: 250, versato: 10 },
    { due: 0, coperto: 0, versato: 0 },
    { due: 33.33, coperto: 11.11, versato: 7.77 },
  ];

  for (const caso of casi) {
    const quadro = coverage.resolveInstallmentCoverage({
      dueAmount: caso.due,
      transactions: caso.versato
        ? ledger.normalizePaymentTransactions([incasso("r", caso.versato)])
        : [],
      allocations: caso.coperto ? [allocazione("r", caso.coperto)] : [],
      enrollmentCoverage: { [ADESIONE]: caso.coperto },
      enrollmentFunding: { [ADESIONE]: { accruedAmount: 0, settledAmount: 0 } },
    });

    const riepilogo = coverage.summarizePlanCoverage({
      installments: [
        { installmentId: "r", dueAmount: caso.due, paidAmount: caso.versato },
      ],
      coverageByInstallment: caso.coperto ? { r: quadro } : {},
    });

    assert.equal(
      Math.round((riepilogo.plannedCoverage + riepilogo.familyDueAmount) * 100),
      Math.round(riepilogo.dueAmount * 100),
      `quota ≠ copertura + famiglia su ${JSON.stringify(caso)}`,
    );

    for (const [chiave, valore] of Object.entries(riepilogo)) {
      assert.equal(
        Number.isFinite(valore),
        true,
        `${chiave} non e finito su ${JSON.stringify(caso)}`,
      );
      assert.ok(valore >= 0, `${chiave} negativo su ${JSON.stringify(caso)}`);
    }
  }
});

test("F6 · il maturato si ripartisce sulle sole rate vive", () => {
  /*
    **Il reperto F6.** Il maturato di un'adesione si ripartisce in proporzione
    alla copertura promessa, e il denominatore comprendeva le rate **annullate**
    da una rigenerazione del piano: un voucher da 300 impegnato su una rata
    vecchia e su una nuova dava un denominatore di 600, e il maturato per intero
    usciva dimezzato.

    Il denominatore giusto e la copertura sulle sole rate vive.
  */
  const perRataViva = coverage.resolveInstallmentCoverage({
    dueAmount: 300,
    allocations: [allocazione("rata-nuova", 300)],
    /* Denominatore sbagliato: comprende la copertura della rata annullata. */
    enrollmentCoverage: { [ADESIONE]: 600 },
    enrollmentFunding: { [ADESIONE]: { accruedAmount: 300, settledAmount: 0 } },
  });
  assert.equal(perRataViva.accruedCoverage, 150, "e cio che si vedeva prima");

  const corretto = coverage.resolveInstallmentCoverage({
    dueAmount: 300,
    allocations: [allocazione("rata-nuova", 300)],
    enrollmentCoverage: { [ADESIONE]: 300 },
    enrollmentFunding: { [ADESIONE]: { accruedAmount: 300, settledAmount: 0 } },
  });
  assert.equal(
    corretto.accruedCoverage,
    300,
    "un voucher maturato per intero copre per intero cio che ha promesso",
  );
});
