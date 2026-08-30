/**
 * **Il collaudo economico della Wave 4, contro un database vero.**
 *
 *     node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *       scripts/wave-4-uat.mjs
 *
 * ---
 *
 * ## Perche esiste, accanto a tremila test
 *
 * I test unitari girano su un doppio di Prisma, e questa Wave ha gia dimostrato
 * — piu di una volta — che un doppio non conosce i `CHECK` di Postgres, non
 * conosce gli indici unici parziali e non conosce le viste. Un incasso da zero
 * passava nei doppi e il database lo rifiutava; uno storno di liquidazione con
 * importo positivo pure.
 *
 * Qui i sette scenari del §30 vengono eseguiti **attraverso i servizi**, sul
 * database di sviluppo, e a ogni passo si legge cio che il registro, i saldi e
 * il rendiconto dicono davvero. Nessuna asserzione guarda una risposta HTTP:
 * si contano le righe.
 *
 * ## Cosa prova, in una riga
 *
 * Che le quattro superfici — il ledger del dominio, la prima nota, i saldi dei
 * conti e il rendiconto — raccontino **lo stesso denaro**. Non che i numeri
 * siano belli: che siano lo stesso numero.
 *
 * Club dedicato, cancellato alla fine.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("Rifiuto: serve EASYGAME_DB_ENV=development.");
  process.exit(1);
}

const NL = String.fromCharCode(10);
const prisma = new PrismaClient();

const CLUB = randomUUID();
const CASSA = randomUUID();
const BANCA = randomUUID();
const ATLETA = randomUUID();
const PERSONA = randomUUID();
const SPONSOR = "sponsor-uat-1";
const RATA = randomUUID();

const d = (s) => new Date(s);

const scope = () => ({
  userId: UTENTE?.id ?? null,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

const PIENI = { manage: true, reverse: true, reconcile: true };

let UTENTE = null;
let accounting;
let conti;
let incassi;
let sponsors;
let funding;
let report;

/* ------------------------------------------------------------ il verdetto */

const esiti = [];

const prova = (titolo, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ titolo, ok, atteso, trovato, nota });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(58)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
};

const euro = (cents) => Math.round(Number(cents) || 0);

/** Il registro, letto come lo legge la pagina. */
const registro = async (filtri = {}) =>
  accounting.listAccountingEntries({ limit: 500, ...filtri }, scope(), PIENI);

/** Il saldo di un conto, derivato. */
const saldo = async (accountId) => {
  const saldi = await conti.listFinancialAccountBalances(scope(), {
    accountIds: [accountId],
  });
  return euro(saldi[0]?.balanceCents);
};

/* ---------------------------------------------------------------- semina */

const semina = async () => {
  UTENTE = await prisma.user.findFirst();
  if (!UTENTE) throw new Error("Nessun utente nel database di sviluppo");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `uat-wave4-${Date.now()}`,
      name: "ASD Collaudo Wave 4",
      creator_id: UTENTE.id,
      transactions: [],
      transfers: [],
      sponsors: [
        {
          id: SPONSOR,
          name: "Rossi Impianti SRL",
          type: "sponsor",
          vatNumber: "12345678903",
          contract: { agreedAmountCents: 500000 },
        },
      ],
      settings: {
        seasons: [
          {
            id: "2026-27",
            label: "2026/27",
            startDate: "2026-07-01",
            endDate: "2027-06-30",
            status: "active",
          },
        ],
      },
    },
  });

  /* L'aggregato JSON e la tabella devono partire allineati. */
  await prisma.clubResourceItem.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      resource_type: "sponsors",
      name: "Rossi Impianti SRL",
      payload: {
        id: SPONSOR,
        name: "Rossi Impianti SRL",
        type: "sponsor",
        vatNumber: "12345678903",
        contract: { agreedAmountCents: 500000 },
      },
      created_at: new Date(),
      updated_at: new Date(),
    },
  });

  await prisma.financialAccount.createMany({
    data: [
      { id: CASSA, organization_id: CLUB, name: "Cassa", kind: "CASH", updated_at: new Date() },
      { id: BANCA, organization_id: CLUB, name: "Banca", kind: "BANK", updated_at: new Date() },
    ],
  });

  await prisma.fiscalOperationType.createMany({
    data: [
      {
        id: randomUUID(),
        organization_id: CLUB,
        code: "quota_attivita",
        label: "Quota attivita",
        activity_scope: "institutional",
        reporting_bucket: "Quote sportive",
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB,
        code: "sponsorizzazione",
        label: "Sponsorizzazione",
        activity_scope: "commercial",
        reporting_bucket: "Sponsorizzazioni",
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB,
        code: "versamento_contributi",
        label: "Versamento contributi",
        activity_scope: "institutional",
        reporting_bucket: "Lavoro sportivo",
        updated_at: new Date(),
      },
    ],
  });

  await prisma.athlete.create({
    data: {
      id: ATLETA,
      organization_id: CLUB,
      first_name: "Anna",
      last_name: "Rossi",
      updated_at: new Date(),
    },
  });

  await prisma.athletePayment.create({
    data: {
      id: RATA,
      organization_id: CLUB,
      athlete_id: ATLETA,
      amount: 600,
      due_date: d("2026-10-31T00:00:00Z"),
      status: "pending",
      description: "Quota stagionale",
      updated_at: new Date(),
    },
  });

  await prisma.sportWorkPerson.create({
    data: {
      id: PERSONA,
      organization_id: CLUB,
      first_name: "Luca",
      last_name: "Bianchi",
      updated_at: new Date(),
    },
  });
};

/* ================================================================ scenari */

/** 1 — la quota: 600 dovuti, 200 + 400 incassati, poi uno storno. */
const scenarioQuote = async () => {
  console.log(`${NL}1. QUOTA 600 -> INCASSO 200 -> INCASSO 400 -> STORNO`);

  const primo = await incassi.createPaymentTransaction(
    {
      paymentId: RATA,
      amount: 200,
      paidAt: "2026-10-01T10:00:00Z",
      paymentMethod: "Contanti",
      financialAccountId: CASSA,
      operationTypeCode: "quota_attivita",
    },
    scope(),
  );

  await incassi.createPaymentTransaction(
    {
      paymentId: RATA,
      amount: 400,
      paidAt: "2026-10-15T10:00:00Z",
      paymentMethod: "Bonifico",
      financialAccountId: BANCA,
      operationTypeCode: "quota_attivita",
    },
    scope(),
  );

  const rataPagata = await prisma.athletePayment.findUnique({ where: { id: RATA } });
  prova("la rata risulta saldata", "paid", rataPagata.status);

  prova("cassa dopo il primo incasso", 20000, await saldo(CASSA));
  prova("banca dopo il secondo incasso", 40000, await saldo(BANCA));

  const dopoDue = await registro();
  prova(
    "la prima nota mostra i due incassi",
    2,
    dopoDue.entries.filter((r) => r.sourceDomain === "ATHLETE_PAYMENT").length,
  );
  prova(
    "e l'ambito e quello dichiarato dalla causale, congelato",
    ["institutional", "institutional"],
    dopoDue.entries
      .filter((r) => r.sourceDomain === "ATHLETE_PAYMENT")
      .map((r) => r.activityScope),
  );

  /* Lo storno del primo incasso. */
  await incassi.reversePaymentTransaction(
    { transactionId: primo.transaction.id, reason: "Incasso registrato due volte" },
    scope(),
  );

  prova("cassa dopo lo storno", 0, await saldo(CASSA));

  const dopoStorno = await registro();
  prova(
    "la prima nota tiene entrambe le gambe: l'originale e lo storno",
    { incassi: 2, storni: 1 },
    {
      incassi: dopoStorno.entries.filter((r) => r.sourceDomain === "ATHLETE_PAYMENT").length,
      storni: dopoStorno.entries.filter(
        (r) => r.sourceDomain === "REVERSAL" && r.sourceId,
      ).length,
    },
  );

  const rendiconto = await report.buildAccountingReport(
    { organizationId: CLUB, fiscalYear: 2026 },
    scope(),
  );
  prova(
    "il rendiconto conta solo l'incasso vivo",
    40000,
    euro(rendiconto.cash.collectedCents),
  );
  prova(
    "e dichiara quante righe ha escluso perche neutralizzate",
    2,
    rendiconto.cash.neutralizedCount,
  );

  const rataDopo = await prisma.athletePayment.findUnique({ where: { id: RATA } });
  prova(
    "e la rata torna scoperta per 200",
    "partially_paid",
    rataDopo.status,
  );
};

/** 2 — cassa e banca: un versamento non e una nuova entrata. */
const scenarioGiroconto = async () => {
  console.log(`${NL}2. INCASSO IN CONTANTI -> VERSAMENTO IN BANCA`);

  const prima = await report.buildAccountingReport(
    { organizationId: CLUB, fiscalYear: 2026 },
    scope(),
  );

  await incassi.createPaymentTransaction(
    {
      organizationId: CLUB,
      athleteId: ATLETA,
      amount: 300,
      paidAt: "2026-11-01T10:00:00Z",
      paymentMethod: "Contanti",
      financialAccountId: CASSA,
      operationTypeCode: "quota_attivita",
    },
    scope(),
  );

  prova("cassa dopo l'incasso in contanti", 30000, await saldo(CASSA));

  await accounting.createInternalTransfer(
    {
      entryDate: "2026-11-02T10:00:00Z",
      amount: 300,
      fromAccountId: CASSA,
      toAccountId: BANCA,
      description: "Versamento in banca",
    },
    scope(),
  );

  prova("cassa dopo il versamento", 0, await saldo(CASSA));
  prova("banca dopo il versamento", 70000, await saldo(BANCA));

  const dopo = await report.buildAccountingReport(
    { organizationId: CLUB, fiscalYear: 2026 },
    scope(),
  );

  prova(
    "il versamento non crea una nuova entrata economica",
    euro(prima.cash.collectedCents) + 30000,
    euro(dopo.cash.collectedCents),
  );
  prova(
    "ne una nuova uscita economica",
    euro(prima.cash.paidCents),
    euro(dopo.cash.paidCents),
  );
  prova(
    "le due gambe si vedono, e sono contate a parte",
    { in: 30000, out: 30000, gambe: 2 },
    {
      in: euro(dopo.cash.transferInCents),
      out: euro(dopo.cash.transferOutCents),
      gambe: dopo.cash.transferCount,
    },
  );
};

/** 3 — dieci quote in contanti, un versamento cumulativo. */
const scenarioCumulativo = async () => {
  console.log(`${NL}3. DIECI QUOTE IN CONTANTI -> UN VERSAMENTO CUMULATIVO`);

  const prima = await report.buildAccountingReport(
    { organizationId: CLUB, fiscalYear: 2026 },
    scope(),
  );

  for (let i = 0; i < 10; i += 1) {
    await incassi.createPaymentTransaction(
      {
        organizationId: CLUB,
        athleteId: ATLETA,
        amount: 50,
        paidAt: `2026-11-${String(10 + i).padStart(2, "0")}T10:00:00Z`,
        paymentMethod: "Contanti",
        financialAccountId: CASSA,
        operationTypeCode: "quota_attivita",
      },
      scope(),
    );
  }

  prova("cassa dopo dieci quote da 50", 50000, await saldo(CASSA));

  await accounting.createInternalTransfer(
    {
      entryDate: "2026-11-25T10:00:00Z",
      amount: 500,
      fromAccountId: CASSA,
      toAccountId: BANCA,
      description: "Versamento cumulativo di dieci quote",
    },
    scope(),
  );

  const dopo = await report.buildAccountingReport(
    { organizationId: CLUB, fiscalYear: 2026 },
    scope(),
  );

  prova("cassa svuotata dal versamento", 0, await saldo(CASSA));
  prova(
    "il ricavo cresce di 500, non di 1.000",
    euro(prima.cash.collectedCents) + 50000,
    euro(dopo.cash.collectedCents),
  );

  const righe = await registro();
  prova(
    "e le quote restano righe distinte, non una",
    13,
    righe.entries.filter((r) => r.sourceDomain === "ATHLETE_PAYMENT").length,
  );
};

/** 4 — il contributo: maturare non e incassare. */
const scenarioFunding = async () => {
  console.log(`${NL}4. CONTRIBUTO: MATURAZIONE -> LIQUIDAZIONE -> STORNO`);

  const programma = await funding.createFundingProgram(
    {
      name: "Voucher sport 2026",
      funderName: "Regione",
      periodAmount: 100,
      athletePlafond: 400,
      validFrom: "2026-07-01",
      validTo: "2027-06-30",
      /* Con un comportamento a soglia il requisito minimo e obbligatorio. */
      unmetBehavior: "full",
      requirementMin: 1,
      requirementMetric: "attendance",
      periodFrequency: "months",
    },
    scope(),
  );

  /*
    L'iscrizione e la maturazione si seminano direttamente: il percorso che le
    produce — presenze, periodi, conferme — appartiene al dominio dei bandi ed
    e gia collaudato altrove. Qui interessa il **passo dopo**: che maturare non
    sia incassare, e che il bonifico dica quali crediti chiude.
  */
  const iscrizione = await prisma.fundingEnrollment.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      program_id: programma.id,
      athlete_id: ATLETA,
      assigned_amount: 800,
      enrolled_at: d("2026-09-01T00:00:00Z"),
      updated_at: new Date(),
    },
  });

  const maturazione = await prisma.fundingAccrual.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      enrollment_id: iscrizione.id,
      period_index: 1,
      period_start: d("2026-09-01T00:00:00Z"),
      period_end: d("2026-09-30T00:00:00Z"),
      period_label: "Settembre 2026",
      requirement_min: 1,
      requirement_unit: "attendance",
      measured_value: 4,
      requirement_met: true,
      eligible_amount: 800,
      estimated_amount: 800,
      accrued_amount: 800,
      status: "reported",
      reported_at: d("2026-10-05T00:00:00Z"),
      computed_at: new Date(),
      updated_at: new Date(),
    },
  });

  const primaDelBonifico = await saldo(BANCA);

  prova(
    "la maturazione non e liquidita: il saldo non si muove",
    primaDelBonifico,
    await saldo(BANCA),
  );

  const liquidazione = await funding.createFundingSettlement(
    {
      programId: programma.id,
      amount: 800,
      settledAt: "2026-12-01T10:00:00Z",
      financialAccountId: BANCA,
      method: "Bonifico",
      reference: "Mandato 4471",
      lines: [{ accrualId: maturazione.id, amount: 800 }],
    },
    scope(),
  );

  prova(
    "il bonifico dell'ente entra nel saldo",
    primaDelBonifico + 80000,
    await saldo(BANCA),
  );

  const conLiquidazione = await registro();
  prova(
    "e compare in prima nota come entrata",
    { righe: 1, verso: "IN" },
    {
      righe: conLiquidazione.entries.filter(
        (r) => r.sourceDomain === "FUNDING_SETTLEMENT",
      ).length,
      verso:
        conLiquidazione.entries.find((r) => r.sourceDomain === "FUNDING_SETTLEMENT")
          ?.direction || null,
    },
  );

  await funding.reverseFundingSettlement(
    { settlementId: liquidazione.id, reason: "Bonifico registrato per errore" },
    scope(),
  );

  prova(
    "lo storno riporta il saldo dov'era",
    primaDelBonifico,
    await saldo(BANCA),
  );

  const conStorno = await registro();
  prova(
    "e la prima nota mostra le due gambe",
    { liquidazioni: 1, storni: 1 },
    {
      liquidazioni: conStorno.entries.filter(
        (r) => r.sourceDomain === "FUNDING_SETTLEMENT",
      ).length,
      storni: conStorno.entries.filter(
        (r) => r.sourceDomain === "REVERSAL" && r.id.startsWith("funding-settlement:"),
      ).length,
    },
  );
};

/** 5 — lo sponsor: 5.000 dovuti, 2.000 incassati, 3.000 residui. */
const scenarioSponsor = async () => {
  console.log(`${NL}5. SPONSOR: 5.000 DOVUTI -> 2.000 INCASSATI -> 3.000 RESIDUI`);

  const primaInBanca = await saldo(BANCA);

  await sponsors.recordSponsorCollection(
    {
      sponsorId: SPONSOR,
      amount: 2000,
      paidAt: "2026-12-10T10:00:00Z",
      paymentMethod: "Bonifico",
      financialAccountId: BANCA,
      operationTypeCode: "sponsorizzazione",
    },
    scope(),
  );

  const { credit } = await sponsors.getSponsorCredit(SPONSOR, scope());

  prova(
    "le tre cifre dello sponsor",
    { dovuto: 500000, incassato: 200000, residuo: 300000 },
    {
      dovuto: euro(credit.dueCents),
      incassato: euro(credit.collectedCents),
      residuo: euro(credit.outstandingCents),
    },
  );

  prova(
    "e i 2.000 sono entrati in banca davvero",
    primaInBanca + 200000,
    await saldo(BANCA),
  );

  const righe = await registro({ search: "rossi impianti" });
  prova(
    "la prima nota porta 2.000, non 5.000",
    { righe: 1, importo: 200000 },
    {
      righe: righe.entries.length,
      importo: euro(righe.entries[0]?.amountCents),
    },
  );
  prova(
    "e la classifica come commerciale, che e cio che la causale dichiara",
    "commercial",
    righe.entries[0]?.activityScope || null,
  );
};

/** 6 — l'anno fiscale e la stagione sono due assi. */
const scenarioAssi = async () => {
  console.log(`${NL}6. ANNO FISCALE E STAGIONE: DUE DOMANDE DIVERSE`);

  /* Un movimento nel 2027, dentro la stessa stagione 2026/27. */
  await accounting.createAccountingEntry(
    {
      entryDate: "2027-02-10T10:00:00Z",
      direction: "OUT",
      amount: 120,
      financialAccountId: BANCA,
      operationTypeCode: "quota_attivita",
      description: "Affitto palestra febbraio",
      seasonId: "2026-27",
    },
    scope(),
  );

  const f2026 = await registro({ fiscalYear: 2026 });
  const f2027 = await registro({ fiscalYear: 2027 });
  const stagione = await registro({ seasonId: "2026-27" });

  prova(
    "l'anno fiscale 2027 vede solo il 2027",
    true,
    f2027.entries.every((r) => r.fiscalYear === 2027) && f2027.total > 0,
  );
  prova(
    "l'anno fiscale 2026 non lo vede",
    false,
    f2026.entries.some((r) => r.fiscalYear === 2027),
  );
  prova(
    "la stagione 2026/27 li comprende entrambi",
    true,
    stagione.total >= f2026.total + f2027.total,
    `stagione ${stagione.total}, 2026 ${f2026.total}, 2027 ${f2027.total}`,
  );
};

/** 7 — le quattro superfici raccontano lo stesso denaro. */
const scenarioQuadratura = async () => {
  console.log(`${NL}7. LA QUADRATURA: SALDO CONTO = MOVIMENTI + APERTURA`);

  const saldi = await conti.listFinancialAccountBalances(scope());

  for (const conto of saldi) {
    const righe = await registro({
      financialAccountId: conto.accountId,
      includeLegacy: false,
    });

    /*
      Le righe neutralizzate — stornate, e gli storni — sommano zero e vanno
      escluse, esattamente come fa `deriveAccountBalanceCents`.
    */
    const netto = righe.entries
      .filter((r) => !r.reversedAt && r.sourceDomain !== "REVERSAL")
      .reduce(
        (somma, r) => somma + (r.direction === "IN" ? r.amountCents : -r.amountCents),
        0,
      );

    prova(
      `saldo ${conto.accountId.slice(0, 8)} = movimenti netti + apertura`,
      euro(conto.balanceCents),
      euro(netto + (conto.openingBalanceCents || 0)),
    );
  }

  /* E il rendiconto deve raccontare le stesse righe della prima nota. */
  const rendiconto = await report.buildAccountingReport(
    { organizationId: CLUB },
    scope(),
  );
  const tutte = await registro({});

  prova(
    "il rendiconto e l'elenco contano le stesse righe",
    tutte.total,
    rendiconto.lineCount,
  );
  prova(
    "e il rendiconto non e troncato",
    false,
    Boolean(rendiconto.truncated),
  );

  /* Il non classificato si dichiara, non si nasconde. */
  const scope_ = rendiconto.breakdown.byActivityScope;
  prova(
    "la classificazione dichiara quante righe nessuno ha classificato",
    true,
    typeof scope_.unspecifiedLineCount === "number" &&
      scope_.groups.length === 3,
    `non classificate: ${scope_.unspecifiedLineCount} su ${tutte.total}`,
  );
};

/* -------------------------------------------------------------- pulizia */

const pulisci = async () => {
  await prisma.club.delete({ where: { id: CLUB } }).catch((error) => {
    console.error(`Pulizia non riuscita, il club ${CLUB} e rimasto: ${error?.message}`);
  });
};

try {
  accounting = await import("../src/lib/server/accounting.ts");
  conti = await import("../src/lib/server/financial-accounts.ts");
  incassi = await import("../src/lib/server/payment-transactions.ts");
  sponsors = await import("../src/lib/server/sponsors.ts");
  funding = await import("../src/lib/server/funding.ts");
  report = await import("../src/lib/server/accounting-reports.ts");

  console.log(`${NL}Semina del club di collaudo ${CLUB}...`);
  await semina();

  await scenarioQuote();
  await scenarioGiroconto();
  await scenarioCumulativo();
  await scenarioFunding();
  await scenarioSponsor();
  await scenarioAssi();
  await scenarioQuadratura();

  const falliti = esiti.filter((e) => !e.ok);
  console.log(
    `${NL}${esiti.length - falliti.length}/${esiti.length} controlli passati.`,
  );
  if (falliti.length) {
    console.log(`${NL}FALLITI:`);
    for (const e of falliti) {
      console.log(
        `  ${e.titolo}${NL}    atteso  ${JSON.stringify(e.atteso)}${NL}    trovato ${JSON.stringify(e.trovato)}${e.nota ? `${NL}    nota    ${e.nota}` : ""}`,
      );
    }
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    `${NL}Collaudo interrotto:${NL}${String(error?.message).split(NL).slice(0, 40).join(NL)}`,
  );
  process.exitCode = 1;
} finally {
  await pulisci();
  await prisma.$disconnect();
}
