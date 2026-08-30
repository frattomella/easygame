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
 *     node scripts/measure-accounting-performance.mjs --grande
 *     node scripts/measure-accounting-performance.mjs --grande --keep
 *
 * **Le due taglie, e perche ce ne vogliono due.** La taglia piccola e il club
 * medio del piano: 200 atleti, 2.000 incassi, 1.200 movimenti. Ha dato numeri
 * rassicuranti, e ha nascosto un difetto di forma — la prima nota rileggeva
 * **tutto** il registro a ogni pagina, e il rendiconto la chiamava quaranta
 * volte. Su 3.400 righe non si vede; su 35.000 il rendiconto ci mette due
 * minuti.
 *
 * La taglia **grande** e quella: circa 35.000 righe di prima nota, sotto il
 * tetto dichiarato di 40.000. E la misura che conta, ed e quella da rifare
 * dopo ogni intervento sulla lettura.
 *
 * **Il dataset e il suo, e se ne va.** Lo script crea un club dedicato, lo
 * riempie, misura e **lo cancella**, salvo `--keep`. Non tocca nessun altro
 * club: ogni scrittura porta il suo `organization_id`, e la cancellazione
 * finale segue le foreign key `ON DELETE CASCADE` partendo dal club.
 *
 * **Gira solo su un database di sviluppo.** La guardia e esplicita e non
 * negoziabile: `EASYGAME_DB_ENV` deve valere `development`. Uno script che
 * scrive trentacinquemila righe non deve poter partire per sbaglio altrove.
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
const GRANDE = process.argv.includes("--grande");
const prisma = new PrismaClient();

/* ------------------------------------------------------- i due dataset */

/**
 * Le due taglie.
 *
 * La colonna `righe` e la somma di cio che la prima nota deve **guardare**:
 * movimenti propri, incassi, compensi, liquidazioni e movimenti storici. E il
 * numero che conta, perche e quello che una lettura sbagliata attraversa
 * tutto.
 */
const TAGLIE = {
  piccola: {
    nome: "media (il club del §38)",
    atleti: 200,
    incassi: 2000,
    movimenti: 1200,
    compensi: 180,
    liquidazioni: 24,
    storici: 0,
    persone: 15,
    sponsor: 10,
  },
  grande: {
    nome: "grande (~35.000 righe, sotto il tetto di 40.000)",
    atleti: 800,
    incassi: 12000,
    movimenti: 20000,
    compensi: 1500,
    liquidazioni: 500,
    storici: 1000,
    persone: 60,
    sponsor: 30,
  },
};

const T = GRANDE ? TAGLIE.grande : TAGLIE.piccola;
const RIGHE_TOTALI =
  T.incassi + T.movimenti + T.compensi + T.liquidazioni + T.storici;

const CLUB = randomUUID();
const CASSA = randomUUID();
const BANCA = randomUUID();
const TRANSITO = randomUUID();
const CAUSALE = randomUUID();
const CAUSALE_B = randomUUID();

/* Le date si distribuiscono in modo deterministico: due esecuzioni misurano lo
   stesso dataset, altrimenti il confronto fra prima e dopo non vale niente. */
const dataN = (n) => {
  const inizio = Date.UTC(2025, 6, 1);
  const fine = Date.UTC(2027, 5, 30);
  return new Date(inizio + ((fine - inizio) * ((n * 7919) % 10000)) / 10000);
};

/** A blocchi: `createMany` con ventimila righe in un colpo sfianca il driver. */
const aBlocchi = async (delegate, righe, blocco = 2000) => {
  for (let i = 0; i < righe.length; i += blocco) {
    await delegate.createMany({ data: righe.slice(i, i + blocco) });
  }
};

const misure = [];

/**
 * Quante volte si misura, e perche non una sola.
 *
 * Una revisione ostile ha rifatto queste misure e ha ottenuto numeri diversi —
 * il riepilogo oltre soglia dove qui risultava dentro. Aveva ragione su tre
 * cose, e sono corrette qui:
 *
 * 1. **manca(va) un `ANALYZE`.** Dopo aver scritto trentacinquemila righe le
 *    statistiche del pianificatore dicono ancora «una riga», e Postgres sceglie
 *    piani su stime che non hanno niente a che vedere con il dataset. La prima
 *    misura pagava quel piano sbagliato;
 * 2. **un campione solo** non e una misura: la prima esecuzione paga le cache
 *    fredde, la compilazione dei prepared statement e la prima connessione;
 * 3. **un filtro solo.** Il riepilogo con l'anno fiscale vede meta delle righe;
 *    quello che la pagina chiede quando nessuno sceglie un anno le vede tutte,
 *    ed e lo scenario piu pesante.
 *
 * Si riporta la **mediana**, e accanto il minimo e il massimo: una mediana da
 * sola nasconde una coda, e la coda e cio che un club vede il lunedi mattina.
 */
const RIPETIZIONI = 5;

const cronometra = async (etichetta, soglia, fn) => {
  const tempi = [];
  let errore = null;

  /* Un giro a vuoto: scalda le cache e non entra nella misura. */
  try {
    await fn();
  } catch (error) {
    errore = error;
  }

  if (!errore) {
    for (let giro = 0; giro < RIPETIZIONI; giro += 1) {
      const t0 = process.hrtime.bigint();
      try {
        await fn();
      } catch (error) {
        errore = error;
        break;
      }
      tempi.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
  }

  tempi.sort((a, b) => a - b);
  const ms = tempi.length ? tempi[Math.floor(tempi.length / 2)] : 0;
  const min = tempi.length ? tempi[0] : 0;
  const max = tempi.length ? tempi[tempi.length - 1] : 0;

  const verdetto = errore ? "ERRORE" : max <= soglia ? "OK  " : "OLTRE";
  console.log(
    `  ${verdetto} ${etichetta.padEnd(46)} ${ms.toFixed(0).padStart(7)} ms` +
      ` (min ${min.toFixed(0)}, max ${max.toFixed(0)})   (soglia ${soglia} ms)` +
      (errore ? `   ${String(errore.message).split(NEWLINE)[0].slice(0, 80)}` : ""),
  );

  /*
    Il verdetto guarda il **massimo**, non la mediana: una soglia rispettata a
    meta delle esecuzioni non e una soglia rispettata.
  */
  const riga = { etichetta, soglia, ms, min, max, entro: !errore && max <= soglia, errore: Boolean(errore) };
  misure.push(riga);
  return riga;
};

const semina = async () => {
  console.log(
    `${NEWLINE}Semina del dataset ${T.nome} (club di prova ${CLUB})...`,
  );

  const utente = await prisma.user.findFirst();
  if (!utente) throw new Error("Nessun utente nel database di sviluppo: impossibile creare un club");

  /*
    I movimenti storici vivono nel blob `clubs.transactions`, e la prima nota
    li proietta in sola lettura. Entrano nel conteggio delle righe perche una
    lettura che li ricostruisce tutti a ogni pagina li paga tutti.
  */
  const storici = Array.from({ length: T.storici }, (_, i) => ({
    id: `storico-${i}`,
    date: dataN(i + 30000).toISOString(),
    amount: 20 + (i % 50),
    type: i % 3 === 0 ? "expense" : "income",
    description: `Movimento storico ${i}`,
  }));

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `misura-contabilita-${Date.now()}`,
      name: "ASD Misura Contabilita",
      creator_id: utente.id,
      transactions: storici,
      transfers: [],
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

  await prisma.fiscalOperationType.createMany({
    data: [
      {
        id: CAUSALE,
        organization_id: CLUB,
        code: "quota_attivita",
        label: "Quota attivita",
        activity_scope: "institutional",
        reporting_bucket: "Quote associative e sportive",
        updated_at: new Date(),
      },
      {
        id: CAUSALE_B,
        organization_id: CLUB,
        code: "affitto_palestra",
        label: "Affitto palestra",
        activity_scope: "institutional",
        reporting_bucket: "Impianti",
        updated_at: new Date(),
      },
    ],
  });

  const atleti = Array.from({ length: T.atleti }, (_, i) => ({
    id: randomUUID(),
    organization_id: CLUB,
    first_name: `Nome${i}`,
    last_name: `Cognome${i}`,
    updated_at: new Date(),
  }));
  await aBlocchi(prisma.athlete, atleti);

  await aBlocchi(
    prisma.paymentTransaction,
    Array.from({ length: T.incassi }, (_, i) => ({
      id: randomUUID(),
      organization_id: CLUB,
      athlete_id: atleti[i % T.atleti].id,
      amount: 50 + (i % 40) * 5,
      paid_at: dataN(i),
      payment_method: i % 3 === 0 ? "Contanti" : "Bonifico",
      source: "MANUAL",
      financial_account_id: i % 3 === 0 ? CASSA : BANCA,
      operation_type_code: "quota_attivita",
      activity_scope_snapshot: "institutional",
      updated_at: new Date(),
    })),
  );

  await aBlocchi(
    prisma.accountingEntry,
    Array.from({ length: T.movimenti }, (_, i) => {
      const quando = dataN(i + 5000);
      return {
        id: randomUUID(),
        organization_id: CLUB,
        entry_date: quando,
        fiscal_year: quando.getUTCFullYear(),
        direction: i % 4 === 0 ? "IN" : "OUT",
        amount_cents: 1000 + (i % 500) * 13,
        financial_account_id: i % 2 === 0 ? CASSA : BANCA,
        operation_type_id: i % 7 === 0 ? CAUSALE_B : CAUSALE,
        operation_type_code: i % 7 === 0 ? "affitto_palestra" : "quota_attivita",
        operation_type_label_snapshot: i % 7 === 0 ? "Affitto palestra" : "Quota attivita",
        activity_scope_snapshot: "institutional",
        description: `Movimento di prova ${i}`,
        source_domain: "MANUAL",
        reconciliation_status: i % 5 === 0 ? "reconciled" : "unreconciled",
        updated_at: new Date(),
      };
    }),
  );

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
  await aBlocchi(
    prisma.fundingSettlement,
    Array.from({ length: T.liquidazioni }, (_, i) => ({
      id: randomUUID(),
      organization_id: CLUB,
      program_id: programma,
      settled_at: dataN(i + 9000),
      amount: 500 + i * 2,
      financial_account_id: BANCA,
      updated_at: new Date(),
    })),
  );

  const persone = Array.from({ length: T.persone }, (_, i) => ({
    id: randomUUID(),
    organization_id: CLUB,
    first_name: `Allenatore${i}`,
    last_name: `Rossi${i}`,
    updated_at: new Date(),
  }));
  await aBlocchi(prisma.sportWorkPerson, persone);
  await aBlocchi(
    prisma.sportWorkOutboundTransaction,
    Array.from({ length: T.compensi }, (_, i) => {
      const quando = dataN(i + 12000);
      return {
        id: randomUUID(),
        organization_id: CLUB,
        person_id: persone[i % T.persone].id,
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
  );

  await prisma.club.update({
    where: { id: CLUB },
    data: {
      sponsors: Array.from({ length: T.sponsor }, (_, i) => ({
        id: `sponsor-${i}`,
        name: `Sponsor ${i}`,
        contract: { agreedAmountCents: 500000 + i * 10000 },
      })),
    },
  });

  /*
    **`ANALYZE` prima di misurare.** Dopo trentacinquemila scritture le
    statistiche del pianificatore dicono ancora «una riga»: senza, si misura un
    piano scelto su stime che non descrivono il dataset, e il numero che ne esce
    non e ne il caso vero ne un caso peggiore riproducibile.
  */
  await prisma.$executeRawUnsafe("ANALYZE");

  console.log(
    `  ${T.atleti} atleti - ${T.incassi} incassi - ${T.movimenti} movimenti - ` +
      `${T.liquidazioni} liquidazioni - ${T.compensi} compensi - ${T.storici} storici` +
      `${NEWLINE}  righe di prima nota: ~${RIGHE_TOTALI.toLocaleString("it-IT")}` +
      `${NEWLINE}  statistiche aggiornate con ANALYZE`,
  );
};

/* ------------------------------------------------------------ le misure */

const misura = async () => {
  const { listAccountingEntries } = await import("../src/lib/server/accounting.ts");
  const { listFinancialAccountBalances } = await import(
    "../src/lib/server/financial-accounts.ts"
  );
  const { buildAccountingReport } = await import("../src/lib/server/accounting-reports.ts");
  const { buildAccountingExport } = await import("../src/lib/server/accounting-export.ts");

  const scope = {
    userId: null,
    activeOrganizationId: CLUB,
    activeRole: "owner",
    allowedOrganizationIds: [CLUB],
  };
  const PIENI = { manage: true, reverse: true, reconcile: true };
  const ultimo = Math.max(0, RIGHE_TOTALI - 50);
  const mezzo = Math.floor(RIGHE_TOTALI / 2);

  console.log(`${NEWLINE}Misure (§38 del piano, e i dieci scenari del riesame):${NEWLINE}`);

  /* 1-3 — la prima nota si sfoglia: la prima pagina non e un caso speciale. */
  await cronometra("1. prima nota, prima pagina", 800, () =>
    listAccountingEntries({ limit: 50 }, scope, PIENI),
  );
  await cronometra("2. prima nota, pagina intermedia", 800, () =>
    listAccountingEntries({ limit: 50, offset: mezzo }, scope, PIENI),
  );
  await cronometra("3. prima nota, ultima pagina", 800, () =>
    listAccountingEntries({ limit: 50, offset: ultimo }, scope, PIENI),
  );

  /* 4-7 — i filtri, uno per volta: e cosi che si usano. */
  await cronometra("4. filtro anno fiscale", 800, () =>
    listAccountingEntries({ fiscalYear: 2026, limit: 50 }, scope, PIENI),
  );
  await cronometra("5. filtro conto", 800, () =>
    listAccountingEntries({ financialAccountId: CASSA, limit: 50 }, scope, PIENI),
  );
  await cronometra("6. filtro causale", 800, () =>
    listAccountingEntries({ operationTypeCode: "affitto_palestra", limit: 50 }, scope, PIENI),
  );
  await cronometra("7. ricerca testuale", 800, () =>
    listAccountingEntries({ search: "prova 1234", limit: 50 }, scope, PIENI),
  );

  /* 8-9 — il rendiconto e i saldi. */
  await cronometra("8. rendiconto annuale", 2000, () =>
    buildAccountingReport({ organizationId: CLUB, fiscalYear: 2026 }, scope),
  );
  /*
    **Il caso piu pesante, che il collaudo non misurava.** L'anno fiscale
    dimezza le righe; quando nessuno sceglie un anno — che e cio che la pagina
    chiede aprendosi — il riepilogo le vede tutte.
  */
  await cronometra("8b. rendiconto senza filtri", 2000, () =>
    buildAccountingReport({ organizationId: CLUB }, scope),
  );
  await cronometra("9. saldi di tutti i conti", 1000, () =>
    listFinancialAccountBalances(scope),
  );

  /* 10 — l'export, che e la prova del nove: deve vedere ogni riga. */
  await cronometra("10. export annuale completo", 5000, () =>
    buildAccountingExport({ organizationId: CLUB, fiscalYear: 2026 }, scope),
  );
};

const pulisci = async () => {
  if (KEEP) {
    console.log(`${NEWLINE}Dataset conservato: club ${CLUB}. Cancellalo a mano quando hai finito.`);
    return;
  }
  console.log(`${NEWLINE}Pulizia del dataset di prova...`);
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
  await misura();
  const oltre = misure.filter((e) => !e.entro).length;
  console.log(
    oltre === 0
      ? `${NEWLINE}Tutte le misure sono entro le soglie del piano.`
      : `${NEWLINE}${oltre} misure su ${misure.length} sono oltre la soglia.`,
  );
  console.log(
    NEWLINE +
      "RIEPILOGO" +
      NEWLINE +
      misure
        .map(
          (m) =>
            `  ${m.etichetta.padEnd(46)} ${m.ms.toFixed(0).padStart(7)} ms` +
            ` (min ${m.min.toFixed(0)}, max ${m.max.toFixed(0)}, soglia ${m.soglia})`,
        )
        .join(NEWLINE),
  );
} catch (error) {
  console.error(NEWLINE + "Misura non riuscita:" + NEWLINE + breve(error));
  process.exitCode = 1;
} finally {
  await pulisci().catch((error) => {
    console.error("Pulizia non riuscita:", error?.message);
    console.error(`Il club di prova ${CLUB} e rimasto: va cancellato a mano.`);
  });
  await prisma.$disconnect();
}
