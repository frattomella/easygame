/**
 * **La liquidazione di un periodo, misurata su Postgres vero** (N15).
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/n15-liquidazione-postgres-probe.mjs
 *
 * ---
 *
 * ## Perche esiste
 *
 * Perche cinque delle promesse di N15 vivono **nell'archivio**, e il doppio di
 * Prisma non ne conosce nessuna: non ha indici unici parziali, non isola le
 * transazioni, non emula la concorrenza — le sue `$transaction` sono la
 * funzione chiamata subito — e soprattutto **non ha viste**. Il movimento
 * bancario di una liquidazione e una riga di `accounting_ledger_lines`, che e
 * una vista SQL con sei rami: in memoria non esiste affatto.
 *
 * ## Cosa misura
 *
 * | | |
 * |---|---|
 * | A-01…A-05 | la liquidazione **e** il movimento: stessa transazione, conto, verso, causale, e il nome dice atleta e periodo |
 * | A-06 | e nessuna riga nasce in `accounting_entries`: non e una seconda contabilita |
 * | B-01…B-03 | l'accredito parziale, e il residuo che si ricalcola dalle righe |
 * | C-01 | **atomicita**: un errore a meta non lascia ne testata ne movimento |
 * | D-01…D-02 | **idempotenza**: due invii con la stessa chiave, un accredito solo — e l'indice unico che lo fa valere |
 * | E-01…E-03 | **concorrenza vera**: due operatori sull'ultimo residuo, e nessun sovra-incasso |
 * | F-01…F-03 | lo storno: movimento inverso, netto a zero, e il periodo che torna fra i crediti |
 * | G-01…G-02 | **riconciliazione**: Σ liquidazioni nette = Σ movimenti netti originati dai bandi |
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
const centesimi = (valore) => Math.round(Number(valore || 0) * 100);

const pulisci = async () => {
  await prisma.$executeRawUnsafe(
    `DELETE FROM clubs WHERE slug LIKE 'sonda-n15-%'`,
  );
};

const semina = async () => {
  await prisma.user.create({
    data: {
      id: UTENTE,
      email: `sonda-n15-${Date.now()}@example.invalid`,
      password_hash: "sonda-non-e-una-credenziale",
    },
  });

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `sonda-n15-${Date.now()}`,
      name: "Sonda N15",
      categories: [],
      creator: { connect: { id: UTENTE } },
    },
  });

  await prisma.athlete.create({
    data: {
      id: ATLETA,
      organization_id: CLUB,
      first_name: "Mario",
      last_name: "Rossi",
      status: "active",
      data: {},
    },
  });

  const conto = await prisma.financialAccount.create({
    data: {
      organization_id: CLUB,
      name: "Banca della sonda",
      kind: "BANK",
      opening_balance_cents: 0,
    },
  });

  /*
    La causale del bonifico. Senza, `resolveInboundClassification` degrada a
    «vuota» — e il comportamento giusto per un club che non ha configurato le
    voci di rendiconto — e la sonda misurerebbe quell'assenza invece della
    classificazione.
  */
  await prisma.fiscalOperationType.create({
    data: {
      organization_id: CLUB,
      code: "liquidazione_contributo",
      label: "Liquidazione di contributo o voucher",
      activity_scope: "unspecified",
      direction_hint: "IN",
      updated_at: new Date(),
    },
  });

  const programma = await prisma.fundingProgram.create({
    data: {
      organization_id: CLUB,
      name: "Voucher sonda N15",
      funder_name: "Regione",
      status: "active",
      valid_from: new Date("2026-01-01"),
      valid_to: new Date("2026-12-31"),
      athlete_plafond: 600,
      period_amount: 100,
      period_frequency: "monthly",
      requirement_unit: "hours",
      requirement_min: 8,
      unmet_behavior: "none",
      accrual_source: "easygame_attendance",
    },
  });

  const adesione = await prisma.fundingEnrollment.create({
    data: {
      organization_id: CLUB,
      program_id: programma.id,
      athlete_id: ATLETA,
      assigned_amount: 600,
      status: "active",
      enrolled_at: new Date("2026-01-01"),
    },
  });

  const periodo = async (indice, etichetta) =>
    prisma.fundingAccrual.create({
      data: {
        organization_id: CLUB,
        enrollment_id: adesione.id,
        period_index: indice,
        period_start: new Date("2026-10-01"),
        period_end: new Date("2026-10-31"),
        period_label: etichetta,
        requirement_min: 8,
        requirement_unit: "hours",
        measured_value: 12,
        requirement_met: true,
        eligible_amount: 100,
        estimated_amount: 100,
        accrued_amount: 100,
        unaccrued_amount: 0,
        status: "accrued",
        accrual_origin: "easygame_attendance",
        computed_at: new Date(),
        data: { attendanceMeasured: true },
      },
    });

  return {
    conto,
    programma,
    adesione,
    ottobre: await periodo(9, "ottobre 2026"),
    novembre: await periodo(10, "novembre 2026"),
    dicembre: await periodo(11, "dicembre 2026"),
    gennaio: await periodo(0, "gennaio 2026"),
  };
};

const main = async () => {
  console.log("\nSonda N15 — la liquidazione di un periodo, su Postgres vero\n");

  await pulisci();
  const { conto, programma, ottobre, novembre, dicembre, gennaio } =
    await semina();

  const funding = await import("../src/lib/server/funding.ts");

  const scope = {
    userId: UTENTE,
    activeOrganizationId: CLUB,
    activeRole: "owner",
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

  const registro = () =>
    prisma.accountingLedgerLine.findMany({
      where: { organization_id: CLUB },
      orderBy: [{ entry_date: "asc" }],
    });

  /* ================================== A · la liquidazione E il movimento */

  const primaDelMovimento = await registro();
  prova("A-00 il registro parte vuoto", 0, primaDelMovimento.length);

  const accredito = await funding.settleFundingPeriod(
    {
      accrualId: ottobre.id,
      financialAccountId: conto.id,
      settledAt: "2026-11-05",
      reference: "TRN-000123",
      method: "Bonifico",
    },
    scope,
  );

  const righe = await registro();
  prova(
    "A-01 una liquidazione produce esattamente un movimento nel registro",
    1,
    righe.length,
    "il movimento e la proiezione della liquidazione, non una seconda riga",
  );

  const movimento = righe[0];
  prova(
    "A-02 con il verso, l'importo e il conto giusti",
    { verso: "IN", centesimi: 10000, conto: conto.id },
    {
      verso: movimento.direction,
      centesimi: Number(movimento.amount_cents),
      conto: movimento.financial_account_id,
    },
  );
  prova(
    "A-03 la causale e quella in entrata, congelata sulla riga",
    "liquidazione_contributo",
    movimento.operation_type_code,
  );
  prova(
    "A-04 e il movimento e riconducibile alla liquidazione",
    { dominio: "FUNDING_SETTLEMENT", sorgente: accredito.id },
    { dominio: movimento.source_domain, sorgente: movimento.source_id },
  );
  prova(
    "A-05 il nome dice ente, atleta e periodo",
    "Incasso voucher Voucher sonda N15 — Mario Rossi — ottobre 2026",
    movimento.description,
    "in un estratto conto «Liquidazione - <bando>» e quaranta righe identiche",
  );

  prova(
    "A-06 e nessuna riga nasce in prima nota: non e una seconda contabilita",
    0,
    await prisma.accountingEntry.count({ where: { organization_id: CLUB } }),
  );

  const legami = await prisma.fundingSettlement.findUnique({
    where: { id: accredito.id },
    include: { lines: true },
  });
  prova(
    "A-07 i legami strutturali ci sono tutti",
    {
      club: true,
      programma: true,
      conto: true,
      beneficiario: true,
      periodo: true,
    },
    {
      club: legami.organization_id === CLUB,
      programma: legami.program_id === programma.id,
      conto: legami.financial_account_id === conto.id,
      beneficiario: legami.beneficiary_athlete_id === ATLETA,
      periodo: legami.lines[0]?.accrual_id === ottobre.id,
    },
  );

  const saldo = await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount_cents ELSE -amount_cents END), 0)::bigint AS saldo
       FROM accounting_ledger_lines WHERE organization_id = $1::uuid`,
    CLUB,
  );
  prova(
    "A-08 e il denaro compare nel saldo del club",
    10000,
    Number(saldo[0].saldo),
  );

  /* ================================== B · l'accredito parziale */

  await funding.settleFundingPeriod(
    {
      accrualId: novembre.id,
      amount: 60,
      financialAccountId: conto.id,
      settledAt: "2026-12-05",
      reference: "TRN-000200",
    },
    scope,
  );

  const novembreDopo = await prisma.fundingAccrual.findUnique({
    where: { id: novembre.id },
  });
  prova(
    "B-01 con 60 su 100 il periodo resta fra i crediti verso l'ente",
    "reported",
    novembreDopo.status,
  );

  const residuoNovembre = await prisma.fundingSettlementLine.aggregate({
    where: { accrual_id: novembre.id },
    _sum: { amount: true },
  });
  prova(
    "B-02 e il liquidato si legge dalle righe",
    60,
    Number(residuoNovembre._sum.amount || 0),
  );

  await funding.settleFundingPeriod(
    {
      accrualId: novembre.id,
      financialAccountId: conto.id,
      settledAt: "2026-12-20",
      reference: "TRN-000201",
    },
    scope,
  );

  const novembreChiuso = await prisma.fundingAccrual.findUnique({
    where: { id: novembre.id },
  });
  const totaleNovembre = await prisma.fundingSettlementLine.aggregate({
    where: { accrual_id: novembre.id },
    _sum: { amount: true },
  });
  /* I movimenti di **questo** periodo: il club ne ha gia uno per ottobre. */
  const movimentiDiNovembre = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS quanti
       FROM accounting_ledger_lines l
       JOIN funding_settlement_lines fsl ON fsl.settlement_id = l.source_id::uuid
      WHERE l.organization_id = $1::uuid
        AND l.source_domain = 'FUNDING_SETTLEMENT'
        AND fsl.accrual_id = $2::uuid`,
    CLUB,
    novembre.id,
  );

  prova(
    "B-03 il secondo accredito chiude il periodo, e sono due movimenti",
    { stato: "settled", totale: 100, movimenti: 2 },
    {
      stato: novembreChiuso.status,
      totale: Number(totaleNovembre._sum.amount || 0),
      movimenti: Number(movimentiDiNovembre[0].quanti),
    },
    "il secondo accredito propone il residuo, non il maturato",
  );

  /* ================================== C · atomicita su errore a meta */

  /*
    Si rompe la scrittura **dentro** la transazione: il conto e valido, la
    capienza c'e, e la riga di ripartizione punta a un periodo che nel
    frattempo non esiste piu. La chiave esterna la rifiuta, e cio che deve
    restare e **niente**: ne testata, ne movimento, ne stato cambiato.
  */
  const periodoFantasma = randomUUID();
  const prima = {
    liquidazioni: await prisma.fundingSettlement.count({
      where: { organization_id: CLUB },
    }),
    movimenti: await prisma.accountingLedgerLine.count({
      where: { organization_id: CLUB },
    }),
  };

  let erroreAtomicita = null;
  try {
    await funding.createFundingSettlement(
      {
        programId: programma.id,
        amount: 100,
        financialAccountId: conto.id,
        settledAt: "2026-12-31",
        lines: [
          { accrualId: dicembre.id, amount: 50 },
          { accrualId: periodoFantasma, amount: 50 },
        ],
      },
      scope,
    );
  } catch (errore) {
    erroreAtomicita = messaggio(errore);
  }

  const dopo = {
    liquidazioni: await prisma.fundingSettlement.count({
      where: { organization_id: CLUB },
    }),
    movimenti: await prisma.accountingLedgerLine.count({
      where: { organization_id: CLUB },
    }),
  };

  prova(
    "C-01 un errore a meta non lascia ne liquidazione ne movimento",
    prima,
    dopo,
    `l'operazione e fallita con «${String(erroreAtomicita).slice(0, 60)}»`,
  );
  prova(
    "C-02 e il periodo toccato non ha cambiato stato",
    "accrued",
    (await prisma.fundingAccrual.findUnique({ where: { id: dicembre.id } }))
      .status,
  );

  /* ================================== D · idempotenza */

  const chiave = `sonda-${randomUUID()}`;

  const uno = await funding.settleFundingPeriod(
    {
      accrualId: dicembre.id,
      amount: 40,
      financialAccountId: conto.id,
      settledAt: "2027-01-10",
      idempotencyKey: chiave,
    },
    scope,
  );
  const due = await funding.settleFundingPeriod(
    {
      accrualId: dicembre.id,
      amount: 40,
      financialAccountId: conto.id,
      settledAt: "2027-01-10",
      idempotencyKey: chiave,
    },
    scope,
  );

  prova(
    "D-01 lo stesso invio, due volte, e un accredito solo",
    { stessaRiga: true, totale: 40 },
    {
      stessaRiga: uno.id === due.id,
      totale: Number(
        (
          await prisma.fundingSettlementLine.aggregate({
            where: { accrual_id: dicembre.id },
            _sum: { amount: true },
          })
        )._sum.amount || 0,
      ),
    },
  );

  /* E l'indice unico e la difesa vera: la lettura da sola ha una finestra. */
  let indiceRegge = false;
  try {
    await prisma.fundingSettlement.create({
      data: {
        organization_id: CLUB,
        program_id: programma.id,
        settled_at: new Date("2027-01-11"),
        amount: 10,
        idempotency_key: chiave,
      },
    });
  } catch (errore) {
    indiceRegge = /Unique constraint failed|duplicate key/.test(
      messaggio(errore),
    );
  }
  prova(
    "D-02 e l'archivio rifiuta una seconda riga con la stessa chiave",
    true,
    indiceRegge,
    "una lettura prima della scrittura e una lettura vecchia",
  );

  /* ================================== E · concorrenza vera */

  const totaleGennaio = () =>
    prisma.fundingSettlementLine
      .aggregate({ where: { accrual_id: gennaio.id }, _sum: { amount: true } })
      .then((r) => Number(r._sum.amount || 0));

  const concorrenti = await Promise.allSettled([
    funding.settleFundingPeriod(
      {
        accrualId: gennaio.id,
        amount: 100,
        financialAccountId: conto.id,
        settledAt: "2027-02-01",
        idempotencyKey: `conc-a-${randomUUID()}`,
      },
      scope,
    ),
    funding.settleFundingPeriod(
      {
        accrualId: gennaio.id,
        amount: 100,
        financialAccountId: conto.id,
        settledAt: "2027-02-01",
        idempotencyKey: `conc-b-${randomUUID()}`,
      },
      scope,
    ),
  ]);

  const riuscite = concorrenti.filter((r) => r.status === "fulfilled").length;
  prova(
    "E-01 due operatori sull'ultimo residuo: una sola operazione passa",
    1,
    riuscite,
  );
  prova(
    "E-02 e non si liquidano 200 su 100 maturati",
    100,
    await totaleGennaio(),
  );

  /*
    **Il blocco, misurato sul meccanismo e non sull'esito.** L'esito qui sopra
    puo reggere anche per caso; il perche si misura con due connessioni vere
    sulla stessa riga di periodo — la seconda deve **aspettare**.
  */
  const { PrismaClient: SecondoClient } = await import("@prisma/client");
  const altro = new SecondoClient();
  let secondaHaAtteso = false;

  try {
    let sblocca = null;
    const finita = new Promise((resolve) => (sblocca = resolve));

    const primaTx = prisma.$transaction(async (client) => {
      await client.$queryRawUnsafe(
        `SELECT id FROM funding_accruals WHERE id = $1::uuid FOR UPDATE`,
        gennaio.id,
      );
      await finita;
    });

    await new Promise((r) => setTimeout(r, 250));

    let presa = false;
    const seconda = altro
      .$transaction(async (client) => {
        await client.$queryRawUnsafe(
          `SELECT id FROM funding_accruals WHERE id = $1::uuid FOR UPDATE`,
          gennaio.id,
        );
        presa = true;
      })
      .catch(() => {});

    await new Promise((r) => setTimeout(r, 400));
    secondaHaAtteso = presa === false;

    sblocca();
    await primaTx;
    await seconda;
  } finally {
    await altro.$disconnect();
  }

  prova(
    "E-03 il blocco sul periodo fa aspettare la seconda transazione",
    true,
    secondaHaAtteso,
    "e il meccanismo che impedisce a due accrediti di leggere la stessa capienza",
  );

  /* ================================== F · lo storno */

  const daStornare = await prisma.fundingSettlement.findFirst({
    where: { organization_id: CLUB, reversal_of_id: null, reversed_at: null },
    orderBy: [{ created_at: "asc" }],
  });

  const movimentiPrimaDelloStorno = await prisma.accountingLedgerLine.count({
    where: { organization_id: CLUB },
  });

  await funding.reverseFundingSettlement(
    { settlementId: daStornare.id, reason: "Sonda N15: accredito errato" },
    scope,
  );

  const movimentiDopo = await prisma.accountingLedgerLine.findMany({
    where: { organization_id: CLUB, source_domain: "REVERSAL" },
  });

  prova(
    "F-01 lo storno produce un movimento inverso, e l'originale resta",
    {
      movimenti: movimentiPrimaDelloStorno + 1,
      storni: 1,
      verso: "OUT",
    },
    {
      movimenti: await prisma.accountingLedgerLine.count({
        where: { organization_id: CLUB },
      }),
      storni: movimentiDopo.length,
      verso: movimentiDopo[0]?.direction ?? null,
    },
  );

  prova(
    "F-02 il movimento inverso porta lo stesso conto e un nome riconoscibile",
    { conto: conto.id, nome: true },
    {
      conto: movimentiDopo[0]?.financial_account_id ?? null,
      nome: /^Storno incasso voucher/.test(
        String(movimentiDopo[0]?.description || ""),
      ),
    },
  );

  const periodoStornato = await prisma.fundingAccrual.findUnique({
    where: {
      id: (
        await prisma.fundingSettlementLine.findFirst({
          where: { settlement_id: daStornare.id },
        })
      ).accrual_id,
    },
  });
  prova(
    "F-03 e il periodo torna fra i crediti verso l'ente",
    "reported",
    periodoStornato.status,
  );

  /* ================================== G · la riconciliazione */

  /*
    **L'invariante che il mandato chiede.** La somma netta delle liquidazioni
    deve coincidere con la somma netta dei movimenti che ne nascono. Non e una
    tautologia: le due grandezze vivono in due posti diversi — una tabella e una
    vista con sei rami — e il giorno in cui qualcuno filtrasse il ramo dei bandi
    con una condizione in piu, le due divergerebbero in silenzio.
  */
  const netteLiquidazioni = await prisma.fundingSettlement.aggregate({
    where: { organization_id: CLUB },
    _sum: { amount: true },
  });

  const netteRegistro = await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount_cents ELSE -amount_cents END), 0)::bigint AS netto
       FROM accounting_ledger_lines
      WHERE organization_id = $1::uuid
        AND source_domain IN ('FUNDING_SETTLEMENT', 'REVERSAL')`,
    CLUB,
  );

  prova(
    "G-01 somma netta delle liquidazioni = somma netta dei movimenti da bandi",
    centesimi(netteLiquidazioni._sum.amount),
    Number(netteRegistro[0].netto),
  );

  const netteRighe = await prisma.fundingSettlementLine.aggregate({
    where: { organization_id: CLUB },
    _sum: { amount: true },
  });
  prova(
    "G-02 e la ripartizione per periodo quadra con le testate",
    centesimi(netteLiquidazioni._sum.amount),
    centesimi(netteRighe._sum.amount),
    "un totale che non si puo attribuire a nessuno e cio che le righe esistono per impedire",
  );

  const famiglia = await prisma.paymentTransaction.count({
    where: { organization_id: CLUB },
  });
  prova(
    "G-03 in tutta la sonda non e nato nessun pagamento della famiglia",
    0,
    famiglia,
    "un contributo pubblico non e un pagamento dell'atleta",
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
