/**
 * **La maturazione manuale e l'annullamento di un voucher, su Postgres vero**
 * (N12, N13).
 *
 *     node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *       scripts/n12-n13-maturazione-postgres-probe.mjs
 *
 * ---
 *
 * ## Perche esiste
 *
 * Perche il doppio di Prisma non ha chiavi esterne, non ha `CHECK`, non isola
 * le transazioni e non emula la concorrenza: le sue `$transaction` sono la
 * funzione chiamata subito, e ogni `SELECT … FOR UPDATE` restituisce `[]`. Tre
 * delle proprieta che N12 e N13 promettono vivono **esattamente** li:
 *
 * * il tetto per adesione sotto **concorrenza vera** — due decisioni su due
 *   periodi diversi che leggono la stessa somma;
 * * l'unico `(enrollment_id, period_index)`, che e cio che rende idempotente la
 *   materializzazione di un periodo previsto;
 * * la chiave esterna `RESTRICT` sulle coperture, che e il difetto C1 e la
 *   ragione per cui un'adesione con coperture si **revoca** invece di essere
 *   cancellata.
 *
 * Nessuna prova in memoria puo vederle. Da qui la regola gia scritta per la
 * sonda N7: **cio che vive nell'archivio si misura sull'archivio.**
 *
 * ## Cosa misura
 *
 * | | |
 * |---|---|
 * | C-01…C-03 | la decisione manuale scrive un maturato e **niente cassa** |
 * | C-04 | il periodo previsto si materializza, dichiarando di non portare una misura |
 * | C-05…C-06 | doppio invio: una riga sola, una transizione sola (scenario 11) |
 * | C-07 | l'unico `(enrollment_id, period_index)` regge in archivio |
 * | C-08 | due decisioni concorrenti non superano l'assegnato (scenario 12) |
 * | C-09 | il blocco sull'adesione fa **aspettare** la seconda transazione |
 * | C-10 | `expectedStatus` respinge chi guardava un altro stato |
 * | C-11…C-12 | un ricalcolo non riscrive una decisione, e la restituisce solo su richiesta |
 * | D-01…D-04 | l'annullamento: revoca con coperture, storno delle promesse, quota famiglia intera |
 * | D-05…D-06 | con del liquidato l'annullamento semplice **fallisce**, e non lascia niente a meta |
 *
 * La sonda **misura, non corregge**: un difetto esce come `FAIL` e nessuna riga
 * di produzione viene toccata. Il club di prova viene cancellato in `finally`,
 * e la semina comincia togliendo i residui di una corsa interrotta.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error(
    "Rifiuto: serve EASYGAME_DB_ENV=development. Questa sonda scrive sul database.",
  );
  process.exit(1);
}

const prisma = new PrismaClient();

const esiti = [];
const prova = (titolo, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ titolo, ok });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(74)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}${nota ? ` · ${nota}` : ""}`),
  );
};

const CLUB = randomUUID();
const ATLETA = randomUUID();
const UTENTE = randomUUID();

const messaggio = (errore) => String(errore?.message || errore);

const pulisci = async () => {
  await prisma.$executeRawUnsafe(
    `DELETE FROM clubs WHERE slug LIKE 'sonda-n12-%'`,
  );
};

const programmaBase = (nome) => ({
  organization_id: CLUB,
  name: nome,
  funder_name: "Ente",
  status: "active",
  valid_from: new Date("2026-09-01"),
  valid_to: new Date("2027-06-30"),
  athlete_plafond: 600,
  period_amount: 50,
  period_frequency: "monthly",
  requirement_unit: "hours",
  requirement_min: 8,
  unmet_behavior: "none",
  accrual_source: "easygame_attendance",
});

const semina = async () => {
  await prisma.user.create({
    data: {
      id: UTENTE,
      email: `sonda-n12-${Date.now()}@example.invalid`,
      password_hash: "sonda-non-e-una-credenziale",
    },
  });

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `sonda-n12-${Date.now()}`,
      name: "Sonda N12",
      categories: [],
      creator: { connect: { id: UTENTE } },
    },
  });

  await prisma.athlete.create({
    data: {
      id: ATLETA,
      organization_id: CLUB,
      first_name: "Sonda",
      last_name: "Maturazione",
      status: "active",
      data: {},
    },
  });

  const programma = await prisma.fundingProgram.create({
    data: programmaBase("Voucher sonda N12"),
  });

  /* Assegnato 150 su mensilita da 50: tre periodi, e il quarto non ha niente. */
  const adesione = await prisma.fundingEnrollment.create({
    data: {
      organization_id: CLUB,
      program_id: programma.id,
      athlete_id: ATLETA,
      assigned_amount: 150,
      status: "active",
      enrolled_at: new Date("2026-09-01"),
    },
  });

  const rata = await prisma.athletePayment.create({
    data: {
      organization_id: CLUB,
      athlete_id: ATLETA,
      description: "Rata unica",
      amount: 600,
      status: "pending",
      data: {},
    },
  });

  return { programma, adesione, rata };
};

const main = async () => {
  console.log("\nSonda N12/N13 — maturazione manuale e annullamento, su Postgres vero\n");

  await pulisci();
  const { adesione, rata } = await semina();

  const funding = await import("../src/lib/server/funding.ts");
  const coverage = await import("../src/lib/server/payment-coverage.ts");
  const coverageLedger = await import("../src/lib/payments/coverage-ledger.ts");

  const scope = {
    userId: UTENTE,
    activeOrganizationId: CLUB,
    activeRole: "owner",
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

  const contaCassa = async () => ({
    movimenti: await prisma.paymentTransaction.count({
      where: { organization_id: CLUB },
    }),
    liquidazioni: await prisma.fundingSettlement.count({
      where: { organization_id: CLUB },
    }),
    righeLiquidazione: await prisma.fundingSettlementLine.count({
      where: { organization_id: CLUB },
    }),
    coperture: await prisma.paymentCoverageAllocation.count({
      where: { organization_id: CLUB },
    }),
  });

  const cassaPrima = await contaCassa();

  /* =================================================== N12 · la decisione */

  const decisione = await funding.decideAccrualPeriod(
    { enrollmentId: adesione.id, periodIndex: 0, decision: "accrued" },
    scope,
  );

  prova("C-01 la decisione scrive un maturato", "accrued", decisione.accrual.status);
  prova("C-02 e vale la mensilita del bando", 50, Number(decisione.accrual.accrued_amount));

  const cassaDopo = await contaCassa();
  prova(
    "C-03 e non tocca la cassa: nessun incasso, nessuna liquidazione, nessuna copertura",
    cassaPrima,
    cassaDopo,
    "un maturato e un credito verso un ente (ADR-0037)",
  );

  const materializzata = await prisma.fundingAccrual.findFirst({
    where: { enrollment_id: adesione.id, period_index: 0 },
  });
  prova(
    "C-04 la riga nasce dichiarando di non portare una misura",
    { misurata: false, manuale: true, ore: 0 },
    {
      misurata: Boolean(materializzata?.data?.attendanceMeasured),
      manuale: Boolean(materializzata?.data?.manualDecision),
      ore: Number(materializzata?.measured_value ?? -1),
    },
    "N10: `measured_value` a zero non deve leggersi come «zero ore fatte»",
  );

  /* ----------------------------------------- idempotenza (scenario 11) */

  const ripetuta = await funding.decideAccrualPeriod(
    { enrollmentId: adesione.id, periodIndex: 0, decision: "accrued" },
    scope,
  );
  prova("C-05 il doppio clic non scrive una seconda volta", true, ripetuta.unchanged);

  const righeP0 = await prisma.fundingAccrual.count({
    where: { enrollment_id: adesione.id, period_index: 0 },
  });
  prova("C-06 e la riga resta una sola", 1, righeP0);

  /* --------------------------------- l'unico (enrollment_id, period_index) */

  let unicoRegge = false;
  try {
    await prisma.fundingAccrual.create({
      data: {
        organization_id: CLUB,
        enrollment_id: adesione.id,
        period_index: 0,
        period_start: new Date("2026-09-01"),
        period_end: new Date("2026-09-30"),
        period_label: "duplicato",
        requirement_min: 8,
        requirement_unit: "hours",
        eligible_amount: 50,
        status: "accrued",
        computed_at: new Date(),
        data: {},
      },
    });
  } catch (errore) {
    unicoRegge = /Unique constraint failed|duplicate key/.test(messaggio(errore));
  }
  prova(
    "C-07 l'archivio rifiuta un secondo periodo con lo stesso indice",
    true,
    unicoRegge,
    "e cio che rende idempotente la materializzazione di un periodo previsto",
  );

  /* -------------------------- il tetto sotto concorrenza vera (scenario 12) */

  const concorrenti = await Promise.allSettled([
    funding.decideAccrualPeriod(
      { enrollmentId: adesione.id, periodIndex: 1, decision: "accrued" },
      scope,
    ),
    funding.decideAccrualPeriod(
      { enrollmentId: adesione.id, periodIndex: 2, decision: "accrued" },
      scope,
    ),
    funding.decideAccrualPeriod(
      { enrollmentId: adesione.id, periodIndex: 3, decision: "accrued" },
      scope,
    ),
  ]);

  const sommaMaturata = await prisma.fundingAccrual.aggregate({
    where: { enrollment_id: adesione.id },
    _sum: { accrued_amount: true },
  });
  const maturatoTotale = Number(sommaMaturata._sum.accrued_amount || 0);

  prova(
    "C-08 tre decisioni concorrenti non superano l'importo assegnato",
    true,
    maturatoTotale <= 150,
    `maturati ${maturatoTotale} su un assegnato di 150 (${concorrenti.filter((r) => r.status === "fulfilled").length} riuscite)`,
  );

  /*
    **Il blocco, misurato sul meccanismo e non sull'esito.** L'esito qui sopra
    puo reggere anche per caso — le tre chiamate potrebbero non sovrapporsi
    davvero in questo ambiente. Il *perche* si misura con due connessioni vere
    sulla stessa riga di adesione: la seconda deve **aspettare**.
  */
  const { PrismaClient: SecondoClient } = await import("@prisma/client");
  const altro = new SecondoClient();
  let secondaHaAtteso = false;

  try {
    let sblocca = null;
    const finita = new Promise((resolve) => (sblocca = resolve));

    const prima = prisma.$transaction(async (client) => {
      await client.$queryRawUnsafe(
        `SELECT id FROM funding_enrollments WHERE id = $1::uuid FOR UPDATE`,
        adesione.id,
      );
      await finita;
    });

    await new Promise((r) => setTimeout(r, 250));

    let presa = false;
    const seconda = altro
      .$transaction(async (client) => {
        await client.$queryRawUnsafe(
          `SELECT id FROM funding_enrollments WHERE id = $1::uuid FOR UPDATE`,
          adesione.id,
        );
        presa = true;
      })
      .catch(() => {});

    await new Promise((r) => setTimeout(r, 400));
    secondaHaAtteso = presa === false;

    sblocca();
    await prima;
    await seconda;
  } finally {
    await altro.$disconnect();
  }

  prova(
    "C-09 il blocco sull'adesione fa aspettare la seconda transazione",
    true,
    secondaHaAtteso,
    "e il meccanismo che impedisce a due decisioni di leggere la stessa somma vecchia",
  );

  /* ------------------------------------------------ lo stato atteso */

  let respinta = false;
  try {
    await funding.decideAccrualPeriod(
      {
        enrollmentId: adesione.id,
        periodIndex: 0,
        decision: "not_accrued",
        expectedStatus: "planned",
      },
      scope,
    );
  } catch (errore) {
    respinta = /cambiato mentre lo stavi guardando/.test(messaggio(errore));
  }
  prova(
    "C-10 chi guardava un altro stato viene respinto, non sovrascrive",
    true,
    respinta,
  );

  /* ------------------------------------------- la decisione dura */

  const ricalcolo = await funding.recomputeEnrollmentAccruals(adesione.id, scope);
  prova(
    "C-11 il ricalcolo non riscrive i periodi decisi a mano, e lo dichiara",
    true,
    ricalcolo.skippedManualPeriods > 0,
    `${ricalcolo.skippedManualPeriods} periodi lasciati dov'erano`,
  );

  const dopoRicalcolo = await prisma.fundingAccrual.findFirst({
    where: { enrollment_id: adesione.id, period_index: 0 },
  });
  prova(
    "C-12 e la decisione e ancora li",
    { stato: "accrued", importo: 50 },
    {
      stato: String(dopoRicalcolo?.status),
      importo: Number(dopoRicalcolo?.accrued_amount),
    },
  );

  /* =============================================== N13 · l'annullamento */

  await coverage.allocateCoverage(
    { paymentId: rata.id, enrollmentId: adesione.id, amount: 150 },
    scope,
  );

  const quadroPrima = coverageLedger.resolveInstallmentCoverage({
    dueAmount: 600,
    allocations: await prisma.paymentCoverageAllocation.findMany({
      where: { payment_id: rata.id },
    }),
    enrollmentCoverage: { [adesione.id]: 150 },
    enrollmentFunding: {
      [adesione.id]: { accruedAmount: maturatoTotale, settledAmount: 0 },
    },
  });
  prova(
    "D-01 con il voucher la famiglia deve 450 dei 600",
    450,
    quadroPrima.familyDueAmount,
  );

  const rimozione = await funding.removeFundingEnrollment(
    adesione.id,
    { reason: "Sonda N13" },
    scope,
  );

  prova(
    "D-02 con delle coperture promesse l'adesione si revoca, non si cancella",
    "revoked",
    rimozione.outcome,
    "la chiave esterna delle coperture e RESTRICT: cancellarla sarebbe un errore di vincolo",
  );

  const adesioneDopo = await prisma.fundingEnrollment.findUnique({
    where: { id: adesione.id },
  });
  prova("D-03 e resta leggibile, chiusa", "closed", adesioneDopo?.status ?? null);

  const quadroDopo = coverageLedger.resolveInstallmentCoverage({
    dueAmount: 600,
    allocations: await prisma.paymentCoverageAllocation.findMany({
      where: { payment_id: rata.id },
    }),
    enrollmentCoverage: { [adesione.id]: 0 },
    enrollmentFunding: {
      [adesione.id]: { accruedAmount: maturatoTotale, settledAmount: 0 },
    },
  });
  prova(
    "D-04 e la famiglia torna a dovere l'intera quota",
    { copertura: 0, famiglia: 600 },
    {
      copertura: quadroDopo.plannedCoverage,
      famiglia: quadroDopo.familyDueAmount,
    },
  );

  /* ------------------------------------ il caso C: con del liquidato */

  const programmaLiq = await prisma.fundingProgram.create({
    data: programmaBase("Voucher sonda liquidato"),
  });

  const adesioneLiq = await prisma.fundingEnrollment.create({
    data: {
      organization_id: CLUB,
      program_id: programmaLiq.id,
      athlete_id: ATLETA,
      assigned_amount: 150,
      status: "active",
      enrolled_at: new Date("2026-09-01"),
    },
  });

  const maturatoLiq = await funding.decideAccrualPeriod(
    { enrollmentId: adesioneLiq.id, periodIndex: 0, decision: "accrued" },
    scope,
  );

  const liquidazione = await prisma.fundingSettlement.create({
    data: {
      organization_id: CLUB,
      program_id: programmaLiq.id,
      settled_at: new Date("2027-01-15"),
      amount: 50,
      reference: "Sonda",
    },
  });
  await prisma.fundingSettlementLine.create({
    data: {
      organization_id: CLUB,
      settlement_id: liquidazione.id,
      accrual_id: maturatoLiq.accrual.id,
      amount: 50,
    },
  });

  let rifiutoLiquidato = null;
  try {
    await funding.removeFundingEnrollment(adesioneLiq.id, {}, scope);
  } catch (errore) {
    rifiutoLiquidato = messaggio(errore);
  }

  prova(
    "D-05 con del denaro gia versato l'annullamento semplice fallisce",
    true,
    /gia liquidato/.test(String(rifiutoLiquidato)),
    "stornare le coperture mentre il club tiene il denaro dell'ente chiede due volte lo stesso importo",
  );

  const adesioneLiqDopo = await prisma.fundingEnrollment.findUnique({
    where: { id: adesioneLiq.id },
  });
  prova(
    "D-06 e il rifiuto non lascia l'adesione a meta strada",
    "active",
    adesioneLiqDopo?.status ?? null,
  );

  const chiusa = await funding.removeFundingEnrollment(
    adesioneLiq.id,
    { acknowledgeSettled: true, reason: "Sonda: chiusura consapevole" },
    scope,
  );
  prova(
    "D-07 con il consenso esplicito si chiude, e la liquidazione resta",
    { esito: "revoked", righe: 1 },
    {
      esito: chiusa.outcome,
      righe: await prisma.fundingSettlementLine.count({
        where: { settlement_id: liquidazione.id },
      }),
    },
  );

  /* ------------- F1 · liquidare, stornare, ricalcolare, poi annullare */

  /*
    **Il reperto F1 della revisione ostile contabile, su Postgres vero.**

    Lo storno di una liquidazione porta la somma delle righe a zero, ma le righe
    restano — e `funding_settlement_lines_accrual_id_fkey` e `RESTRICT`.
    Decidere sull'importo invece che sull'esistenza faceva prendere il ramo
    «cancella», e la cancellazione dei maturati falliva **dopo** che le
    coperture erano state stornate e committate.

    E la prova che nessun doppio in memoria puo dare: la chiave esterna la fa
    valere l'archivio.
  */
  const programmaF1 = await prisma.fundingProgram.create({
    data: programmaBase("Voucher sonda F1"),
  });

  const adesioneF1 = await prisma.fundingEnrollment.create({
    data: {
      organization_id: CLUB,
      program_id: programmaF1.id,
      athlete_id: ATLETA,
      assigned_amount: 150,
      status: "active",
      enrolled_at: new Date("2026-09-01"),
    },
  });

  const maturatoF1 = await funding.decideAccrualPeriod(
    { enrollmentId: adesioneF1.id, periodIndex: 0, decision: "accrued" },
    scope,
  );

  const liquidazioneF1 = await prisma.fundingSettlement.create({
    data: {
      organization_id: CLUB,
      program_id: programmaF1.id,
      settled_at: new Date("2027-01-15"),
      amount: 50,
      reference: "Sonda F1",
    },
  });
  await prisma.fundingSettlementLine.create({
    data: {
      organization_id: CLUB,
      settlement_id: liquidazioneF1.id,
      accrual_id: maturatoF1.accrual.id,
      amount: 50,
    },
  });

  await funding.reverseFundingSettlement(
    { settlementId: liquidazioneF1.id, reason: "Sonda F1: storno" },
    scope,
  );

  /*
    **E poi si toglie anche l'ultimo appiglio.** Dopo lo storno il periodo torna
    `reported`, e «dichiarato all'ente» basta da solo a mandare l'adesione sul
    ramo che revoca. Il difetto si vede solo quando **anche** quello sparisce, e
    sparisce con un gesto ordinario: una decisione manuale rimette il periodo a
    «maturato» e azzera la rendicontazione. A quel punto non resta niente
    tranne le righe di liquidazione, che sommano zero.
  */
  await funding.decideAccrualPeriod(
    { enrollmentId: adesioneF1.id, periodIndex: 0, decision: "accrued" },
    scope,
  );

  const dopoLaDecisione = await prisma.fundingAccrual.findFirst({
    where: { enrollment_id: adesioneF1.id, period_index: 0 },
  });
  prova(
    "F1-00 il periodo non e piu ne liquidato ne rendicontato",
    { stato: "accrued", rendicontato: null },
    {
      stato: String(dopoLaDecisione?.status),
      rendicontato: dopoLaDecisione?.reported_at ?? null,
    },
  );

  const sommaRighe = await prisma.fundingSettlementLine.aggregate({
    where: { accrual_id: maturatoF1.accrual.id },
    _sum: { amount: true },
  });
  prova(
    "F1-01 dopo lo storno la somma delle righe e zero, ma le righe ci sono",
    { somma: 0, righe: 2 },
    {
      somma: Number(sommaRighe._sum.amount || 0),
      righe: await prisma.fundingSettlementLine.count({
        where: { accrual_id: maturatoF1.accrual.id },
      }),
    },
  );

  let erroreF1 = null;
  let esitoF1 = null;
  try {
    esitoF1 = await funding.removeFundingEnrollment(
      adesioneF1.id,
      { reason: "Sonda F1" },
      scope,
    );
  } catch (errore) {
    erroreF1 = messaggio(errore);
  }

  prova(
    "F1-02 togliere l'adesione non finisce in un errore di vincolo",
    null,
    erroreF1,
    "la chiave esterna sulle righe di liquidazione e RESTRICT",
  );
  prova(
    "F1-03 e l'adesione si revoca invece di essere cancellata",
    "revoked",
    esitoF1?.outcome ?? null,
  );
  prova(
    "F1-04 i maturati restano: erano agganciati alle righe",
    1,
    await prisma.fundingAccrual.count({
      where: { enrollment_id: adesioneF1.id },
    }),
  );

  /* --------------- F1 · il tetto non si riapre ricalcolando */

  const programmaTetto = await prisma.fundingProgram.create({
    data: {
      ...programmaBase("Voucher sonda tetto"),
      unmet_behavior: "full",
      valid_from: new Date("2026-01-01"),
      valid_to: new Date("2026-12-31"),
    },
  });

  const adesioneTetto = await prisma.fundingEnrollment.create({
    data: {
      organization_id: CLUB,
      program_id: programmaTetto.id,
      athlete_id: ATLETA,
      assigned_amount: 150,
      status: "active",
      enrolled_at: new Date("2026-01-01"),
    },
  });

  for (const indice of [9, 10, 11]) {
    await funding.decideAccrualPeriod(
      { enrollmentId: adesioneTetto.id, periodIndex: indice, decision: "accrued" },
      scope,
    );
  }

  await funding.recomputeEnrollmentAccruals(adesioneTetto.id, scope, {
    until: "2026-03-31",
  });

  const dopoTetto = await prisma.fundingAccrual.aggregate({
    where: { enrollment_id: adesioneTetto.id },
    _sum: { accrued_amount: true },
  });
  prova(
    "F1-05 un ricalcolo non riapre il tetto consumato da periodi fuori finestra",
    true,
    Number(dopoTetto._sum.accrued_amount || 0) <= 150,
    `maturati ${Number(dopoTetto._sum.accrued_amount || 0)} su un assegnato di 150`,
  );

  /* ------------------------------------------ la riconciliazione finale */

  const cassaFinale = await contaCassa();
  prova(
    "E-01 in tutta la sonda non e nato nessun incasso della famiglia",
    0,
    cassaFinale.movimenti,
    "nessuna maturazione, nessun annullamento e nessuna revoca produce cassa",
  );
};

main()
  .catch((errore) => {
    console.error("\nLa sonda si e interrotta:", errore);
    esiti.push({ titolo: "esecuzione", ok: false });
  })
  .finally(async () => {
    try {
      await pulisci();
      await prisma.user.deleteMany({ where: { id: UTENTE } });
    } catch (errore) {
      console.error("Pulizia non riuscita:", messaggio(errore));
    }
    await prisma.$disconnect();

    const ko = esiti.filter((esito) => !esito.ok);
    console.log(`\nEsito: ${esiti.length - ko.length}/${esiti.length}`);
    if (ko.length) {
      console.log("Falliti:");
      for (const esito of ko) console.log(`  - ${esito.titolo}`);
    }
    process.exit(ko.length ? 1 : 0);
  });
