/**
 * Quanto costa la contabilita, su un club vero e grande?
 *
 * **Perche contro il database e non contro dei doppi.** Le soglie del §38 del
 * piano — prima nota sotto gli 800 ms, saldo di un conto sotto i 200 ms —
 * riguardano **gli indici**. Un doppio di `fetch` misurerebbe quante richieste
 * partono, che e la domanda della Wave 3; qui la domanda e se
 * `(organization_id, entry_date)` regge, e a quella risponde solo Postgres.
 *
 *     node scripts/measure-accounting-performance.mjs
 *     node scripts/measure-accounting-performance.mjs --keep
 *
 * **Il dataset e il suo, e se ne va.** Lo script crea un club dedicato, lo
 * riempie, misura e **lo cancella**, salvo `--keep`. Non tocca nessun altro
 * club: ogni scrittura porta il suo `organization_id`, e la cancellazione
 * finale segue le foreign key `ON DELETE CASCADE` partendo dal club.
 *
 * **Gira solo su un database di sviluppo.** La guardia e esplicita e non
 * negoziabile: `EASYGAME_DB_ENV` deve valere `development`. Uno script che
 * scrive duemila incassi non deve poter partire per sbaglio altrove.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

/* --------------------------------------------------------- la guardia */

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error(
    "Rifiuto: EASYGAME_DB_ENV vale " +
      JSON.stringify(process.env.EASYGAME_DB_ENV || null) +
      ', e questo script scrive migliaia di righe. Serve "development".',
  );
  process.exit(1);
}

const NEWLINE = String.fromCharCode(10);
const KEEP = process.argv.includes("--keep");
const prisma = new PrismaClient();

/* ------------------------------------------------------- il dataset §38 */

const ATLETI = 200;
const INCASSI = 2000;
const MOVIMENTI = 1200;
const SPONSOR = 10;
const RAPPORTI = 15;

const CLUB = randomUUID();
const CASSA = randomUUID();
const BANCA = randomUUID();
const TRANSITO = randomUUID();
const CAUSALE = randomUUID();

/** Due stagioni, come chiede il piano: 2025/26 e 2026/27. */
const dataFra = (da, a) =>
  new Date(da.getTime() + Math.floor(((a - da) / 1) * ((Math.abs(Math.sin(da.getTime())) * 1e6) % 1)));

/* Le date si distribuiscono in modo deterministico: due esecuzioni misurano lo
   stesso dataset, altrimenti il confronto fra prima e dopo non vale niente. */
const dataN = (n) => {
  const inizio = Date.UTC(2025, 6, 1);
  const fine = Date.UTC(2027, 5, 30);
  return new Date(inizio + ((fine - inizio) * ((n * 7919) % 10000)) / 10000);
};

const cronometra = async (etichetta, soglia, fn) => {
  const t0 = process.hrtime.bigint();
  const esito = await fn();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const verdetto = ms <= soglia ? "OK  " : "OLTRE";
  console.log(
    `  ${verdetto} ${etichetta.padEnd(42)} ${ms.toFixed(0).padStart(6)} ms   (soglia ${soglia} ms)`,
  );
  return { ms, esito, entro: ms <= soglia };
};

const semina = async () => {
  console.log(`\nSemina del dataset (club di prova ${CLUB})...`);

  const utente = await prisma.user.findFirst();
  if (!utente) throw new Error("Nessun utente nel database di sviluppo: impossibile creare un club");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `misura-contabilita-${Date.now()}`,
      name: "ASD Misura Contabilita",
      creator_id: utente.id,
      settings: {
        seasons: [
          { id: "2025-26", label: "2025/26", startDate: "2025-07-01", endDate: "2026-06-30", status: "archived" },
          { id: "2026-27", label: "2026/27", startDate: "2026-07-01", endDate: "2027-06-30", status: "active" },
        ],
      },
    },
  });

  await prisma.financialAccount.createMany({
    data: [
      { id: CASSA, organization_id: CLUB, name: "Cassa", kind: "CASH", updated_at: new Date() },
      { id: BANCA, organization_id: CLUB, name: "Banca", kind: "BANK", updated_at: new Date() },
      { id: TRANSITO, organization_id: CLUB, name: "Transito", kind: "CLEARING", updated_at: new Date() },
    ],
  });

  await prisma.fiscalOperationType.create({
    data: {
      id: CAUSALE,
      organization_id: CLUB,
      code: "quota_attivita",
      label: "Quota attivita",
      activity_scope: "institutional",
      updated_at: new Date(),
    },
  });

  const atleti = Array.from({ length: ATLETI }, (_, i) => ({
    id: randomUUID(),
    organization_id: CLUB,
    first_name: `Nome${i}`,
    last_name: `Cognome${i}`,
    updated_at: new Date(),
  }));
  await prisma.athlete.createMany({ data: atleti });

  await prisma.paymentTransaction.createMany({
    data: Array.from({ length: INCASSI }, (_, i) => ({
      id: randomUUID(),
      organization_id: CLUB,
      athlete_id: atleti[i % ATLETI].id,
      amount: 50 + (i % 40) * 5,
      paid_at: dataN(i),
      payment_method: i % 3 === 0 ? "Contanti" : "Bonifico",
      source: "MANUAL",
      financial_account_id: i % 3 === 0 ? CASSA : BANCA,
      operation_type_code: "quota_attivita",
      activity_scope_snapshot: "institutional",
      updated_at: new Date(),
    })),
  });

  await prisma.accountingEntry.createMany({
    data: Array.from({ length: MOVIMENTI }, (_, i) => {
      const quando = dataN(i + 5000);
      return {
        id: randomUUID(),
        organization_id: CLUB,
        entry_date: quando,
        fiscal_year: quando.getUTCFullYear(),
        direction: i % 4 === 0 ? "IN" : "OUT",
        amount_cents: 1000 + (i % 500) * 13,
        financial_account_id: i % 2 === 0 ? CASSA : BANCA,
        operation_type_id: CAUSALE,
        operation_type_code: "quota_attivita",
        activity_scope_snapshot: "institutional",
        description: `Movimento di prova ${i}`,
        source_domain: "MANUAL",
        reconciliation_status: i % 5 === 0 ? "reconciled" : "unreconciled",
        updated_at: new Date(),
      };
    }),
  });

  const programma = randomUUID();
  await prisma.fundingProgram.create({
    data: {
      id: programma,
      organization_id: CLUB,
      name: "Voucher di prova",
      funder_name: "Ente di prova",
      period_amount: 100,
      athlete_plafond: 400,
      valid_from: new Date("2025-07-01T00:00:00Z"),
      valid_to: new Date("2027-06-30T00:00:00Z"),
      updated_at: new Date(),
    },
  });
  await prisma.fundingSettlement.createMany({
    data: Array.from({ length: 24 }, (_, i) => ({
      id: randomUUID(),
      organization_id: CLUB,
      program_id: programma,
      settled_at: dataN(i + 9000),
      amount: 500 + i * 20,
      financial_account_id: BANCA,
      updated_at: new Date(),
    })),
  });

  const persone = Array.from({ length: RAPPORTI }, (_, i) => ({
    id: randomUUID(),
    organization_id: CLUB,
    first_name: `Allenatore${i}`,
    last_name: `Rossi${i}`,
    updated_at: new Date(),
  }));
  await prisma.sportWorkPerson.createMany({ data: persone });
  await prisma.sportWorkOutboundTransaction.createMany({
    data: Array.from({ length: 180 }, (_, i) => {
      const quando = dataN(i + 12000);
      return {
        id: randomUUID(),
        organization_id: CLUB,
        person_id: persone[i % RAPPORTI].id,
        transaction_type: "COMPENSATION_PAYMENT",
        paid_at: quando,
        fiscal_year: quando.getUTCFullYear(),
        gross_amount: 400 + (i % 10) * 25,
        net_amount: 370 + (i % 10) * 23,
        club_cost: 480 + (i % 10) * 30,
        financial_account_id: BANCA,
        updated_at: new Date(),
      };
    }),
  });

  await prisma.club.update({
    where: { id: CLUB },
    data: {
      sponsors: Array.from({ length: SPONSOR }, (_, i) => ({
        id: `sponsor-${i}`,
        name: `Sponsor ${i}`,
        contract: { agreedAmountCents: 500000 + i * 10000 },
      })),
    },
  });

  console.log(
    `  ${ATLETI} atleti - ${INCASSI} incassi - ${MOVIMENTI} movimenti - ` +
      `24 liquidazioni - 180 compensi - ${SPONSOR} sponsor - 3 conti - 2 stagioni`,
  );
};

const misura = async () => {
  const { listAccountingEntries } = await import("../src/lib/server/accounting.ts");
  const { listFinancialAccountBalances } = await import(
    "../src/lib/server/financial-accounts.ts"
  );
  const { buildAccountingReport } = await import("../src/lib/server/accounting-reports.ts");

  const scope = {
    userId: null,
    activeOrganizationId: CLUB,
    activeRole: "owner",
    allowedOrganizationIds: [CLUB],
  };
  const PIENI = { manage: true, reverse: true, reconcile: true };

  console.log("\nMisure (§38 del piano):\n");
  const esiti = [];

  esiti.push(
    await cronometra("prima nota, prima pagina", 800, () =>
      listAccountingEntries({ limit: 50 }, scope, PIENI),
    ),
  );
  esiti.push(
    await cronometra("prima nota, filtro conto e anno", 500, () =>
      listAccountingEntries(
        { financialAccountId: CASSA, fiscalYear: 2026, limit: 50 },
        scope,
        PIENI,
      ),
    ),
  );
  esiti.push(
    await cronometra("saldo di un conto", 200, () =>
      listFinancialAccountBalances(scope, { accountIds: [CASSA] }),
    ),
  );
  esiti.push(
    await cronometra("saldi di tutti i conti", 1000, () =>
      listFinancialAccountBalances(scope),
    ),
  );
  esiti.push(
    await cronometra("riepilogo gestionale di un anno", 2000, () =>
      buildAccountingReport({ organizationId: CLUB, fiscalYear: 2026 }, scope),
    ),
  );
  esiti.push(
    await cronometra("export: tutte le righe dell'anno", 5000, () =>
      listAccountingEntries({ fiscalYear: 2026, limit: 500 }, scope, PIENI),
    ),
  );

  return esiti;
};

const pulisci = async () => {
  if (KEEP) {
    console.log(`\nDataset conservato: club ${CLUB}. Cancellalo a mano quando hai finito.`);
    return;
  }
  console.log("\nPulizia del dataset di prova...");
  await prisma.club.delete({ where: { id: CLUB } });
  console.log("  fatto: il club di prova e le sue righe non ci sono piu");
};

/*
  Il messaggio di Prisma porta con se mezzo runtime quando viene stampato per
  intero: qui servono le prime righe, che dicono cosa manca.
*/
const breve = (error) =>
  String(error?.message || error).split(NEWLINE).slice(0, 22).join(NEWLINE);

try {
  await semina();
  const esiti = await misura();
  const oltre = esiti.filter((e) => !e.entro).length;
  console.log(
    oltre === 0
      ? "\nTutte le misure sono entro le soglie del piano."
      : `\n${oltre} misure su ${esiti.length} sono oltre la soglia.`,
  );
} catch (error) {
  /*
    Il messaggio di Prisma porta con se mezzo runtime quando viene stampato per
    intero: qui servono le prime righe, che dicono cosa manca.
  */
  console.error(NEWLINE + "Misura non riuscita:" + NEWLINE + breve(error));
  process.exitCode = 1;
} finally {
  await pulisci().catch((error) => {
    console.error("Pulizia non riuscita:", error?.message);
    console.error(`Il club di prova ${CLUB} e rimasto: va cancellato a mano.`);
  });
  await prisma.$disconnect();
}
