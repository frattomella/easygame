/**
 * **Le sette prove di concorrenza della Wave 4.**
 *
 *     node scripts/wave-4-concurrency-probe.mjs
 *
 * **Perche una sonda e non dei test.** I test del repository girano su un
 * doppio di Prisma, che e sequenziale per costruzione: non puo dimostrare che
 * due richieste simultanee non producano due righe, perche nel doppio non
 * esistono due richieste simultanee. Un vincolo unico parziale o un
 * `SELECT ... FOR UPDATE` si provano **solo** contro Postgres.
 *
 * **E il controllo e sul database, non sulla risposta HTTP.** Un servizio che
 * risponde `409` alla seconda chiamata e rassicurante e non prova niente: cio
 * che conta e quante righe ci sono dopo. Ogni prova conta le righe.
 *
 * Le sette, come le chiede il brief:
 *
 * 1. doppio incasso sulla stessa rata;
 * 2. doppio storno dello stesso incasso;
 * 3. doppia liquidazione di un bando, e doppio storno della stessa;
 * 4. doppia proiezione dello stesso evento sorgente (l'idempotenza dell'F24);
 * 5. giroconto concorrente;
 * 6. saldo letto **mentre** si scrive;
 * 7. riconciliazione doppia;
 * 8. storno e rimborso dello stesso incasso, nei due ordini e insieme.
 *
 * Come per la misura delle prestazioni: club dedicato, e se ne va alla fine.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error(
    "Rifiuto: EASYGAME_DB_ENV vale " +
      JSON.stringify(process.env.EASYGAME_DB_ENV || null) +
      ', e questa sonda scrive. Serve "development".',
  );
  process.exit(1);
}

const prisma = new PrismaClient();
const NEWLINE = String.fromCharCode(10);

const CLUB = randomUUID();
const CASSA = randomUUID();
const BANCA = randomUUID();
const CAUSALE = randomUUID();

let passate = 0;
let fallite = 0;

const prova = async (titolo, atteso, fn) => {
  try {
    const esito = await fn();
    const ok = esito.ok;
    if (ok) passate += 1;
    else fallite += 1;
    console.log(
      `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(52)} ${esito.dettaglio}`,
    );
    if (!ok) console.log(`        atteso: ${atteso}`);
  } catch (error) {
    fallite += 1;
    console.log(`  FAIL  ${titolo.padEnd(52)} errore: ${String(error?.message).split(NEWLINE)[0]}`);
  }
};

/** Esegue due operazioni **davvero** insieme, e riporta quante ne sono riuscite. */
const insieme = async (a, b) => {
  const esiti = await Promise.allSettled([a(), b()]);
  return {
    riuscite: esiti.filter((e) => e.status === "fulfilled").length,
    fallite: esiti.filter((e) => e.status === "rejected").length,
    motivi: esiti
      .filter((e) => e.status === "rejected")
      .map((e) => String(e.reason?.message || e.reason).split(NEWLINE)[0]),
  };
};

const scope = () => ({
  userId: null,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

const semina = async () => {
  const utente = await prisma.user.findFirst();
  if (!utente) throw new Error("Nessun utente nel database di sviluppo");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `sonda-concorrenza-${Date.now()}`,
      name: "ASD Sonda Concorrenza",
      creator_id: utente.id,
    },
  });
  await prisma.financialAccount.createMany({
    data: [
      { id: CASSA, organization_id: CLUB, name: "Cassa", kind: "CASH", updated_at: new Date() },
      { id: BANCA, organization_id: CLUB, name: "Banca", kind: "BANK", updated_at: new Date() },
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
};

const esegui = async () => {
  const payments = await import("../src/lib/server/payment-transactions.ts");
  const accounting = await import("../src/lib/server/accounting.ts");
  const funding = await import("../src/lib/server/funding.ts");

  console.log(NEWLINE + "Le prove di concorrenza:" + NEWLINE);

  /* ------------------------------------------------ 1. doppio incasso */
  await prova(
    "1. doppio incasso sulla stessa rata",
    "due righe, nessuna persa, saldo corretto",
    async () => {
      const atleta = await prisma.athlete.create({
        data: { organization_id: CLUB, first_name: "Anna", last_name: "Rossi", updated_at: new Date() },
      });
      const rata = await prisma.athletePayment.create({
        data: {
          organization_id: CLUB,
          athlete_id: atleta.id,
          description: "Quota - Rata 1",
          amount: 600,
          updated_at: new Date(),
        },
      });

      const incassa = (importo) => () =>
        payments.createPaymentTransaction(
          {
            paymentId: rata.id,
            amount: importo,
            paymentMethod: "Contanti",
            financialAccountId: CASSA,
          },
          scope(),
        );

      await insieme(incassa(200), incassa(400));

      const righe = await prisma.paymentTransaction.count({ where: { payment_id: rata.id } });
      const somma = await prisma.paymentTransaction.aggregate({
        where: { payment_id: rata.id },
        _sum: { amount: true },
      });
      const dopo = await prisma.athletePayment.findUnique({ where: { id: rata.id } });

      return {
        ok: righe === 2 && Number(somma._sum.amount) === 600 && dopo.status === "paid",
        dettaglio: `${righe} incassi, somma ${somma._sum.amount}, rata ${dopo.status}`,
      };
    },
  );

  /* ------------------------------------------------- 2. doppio storno */
  await prova(
    "2. doppio storno dello stesso incasso",
    "uno solo riesce, il secondo dice perche",
    async () => {
      const atleta = await prisma.athlete.create({
        data: { organization_id: CLUB, first_name: "Bruno", last_name: "Verdi", updated_at: new Date() },
      });
      const rata = await prisma.athletePayment.create({
        data: {
          organization_id: CLUB,
          athlete_id: atleta.id,
          description: "Quota - Rata 2",
          amount: 300,
          updated_at: new Date(),
        },
      });
      const creato = await payments.createPaymentTransaction(
        { paymentId: rata.id, amount: 300, paymentMethod: "Contanti", financialAccountId: CASSA },
        scope(),
      );

      const storna = () => () =>
        payments.reversePaymentTransaction(
          { transactionId: creato.transaction.id, reason: "Doppio invio" },
          scope(),
        );

      const esito = await insieme(storna(), storna());
      const storni = await prisma.paymentTransaction.count({
        where: { reverses_transaction_id: creato.transaction.id },
      });

      return {
        ok: storni === 1 && esito.riuscite === 1,
        dettaglio: `${storni} storni in tabella, ${esito.riuscite}/2 riuscite`,
      };
    },
  );

  /* ------------------------------------- 3. doppia liquidazione e storno */
  await prova(
    "3. doppio storno della stessa liquidazione",
    "uno solo riesce",
    async () => {
      const programma = await prisma.fundingProgram.create({
        data: {
          organization_id: CLUB,
          name: "Bando sonda",
          funder_name: "Ente",
          period_amount: 100,
          athlete_plafond: 400,
          valid_from: new Date("2026-01-01T00:00:00Z"),
          valid_to: new Date("2027-12-31T00:00:00Z"),
          updated_at: new Date(),
        },
      });
      const liq = await prisma.fundingSettlement.create({
        data: {
          organization_id: CLUB,
          program_id: programma.id,
          settled_at: new Date(),
          amount: 500,
          financial_account_id: BANCA,
          updated_at: new Date(),
        },
      });

      const storna = () => () =>
        funding.reverseFundingSettlement(
          { settlementId: liq.id, reason: "Doppio invio" },
          scope(),
        );

      const esito = await insieme(storna(), storna());
      const storni = await prisma.fundingSettlement.count({
        where: { reversal_of_id: liq.id },
      });

      return {
        ok: storni === 1 && esito.riuscite === 1,
        dettaglio: `${storni} storni in tabella, ${esito.riuscite}/2 riuscite`,
      };
    },
  );

  /* ---------------------- 4. doppia proiezione dello stesso evento */
  await prova(
    "4. stesso evento sorgente registrato due volte",
    "una sola riga: l'indice unico parziale la difende",
    async () => {
      const chiave = `sonda:${randomUUID()}`;
      const scrivi = () => () =>
        accounting.createAccountingEntry(
          {
            entryDate: "2026-11-16T00:00:00.000Z",
            direction: "OUT",
            amount: 316,
            financialAccountId: BANCA,
            operationTypeCode: "quota_attivita",
            description: "Versamento contributi",
          },
          scope(),
          { sourceEventKey: chiave },
        );

      const esito = await insieme(scrivi(), scrivi());
      const righe = await prisma.accountingEntry.count({
        where: { organization_id: CLUB, source_event_key: chiave },
      });

      return {
        ok: righe === 1,
        dettaglio: `${righe} righe per la stessa chiave, ${esito.riuscite}/2 riuscite`,
      };
    },
  );

  /* ------------------------------------- 5. giroconto concorrente */
  await prova(
    "5. due giroconti simultanei sugli stessi conti",
    "quattro gambe, due gruppi, nessuna gamba orfana",
    async () => {
      const gira = () => () =>
        accounting.createInternalTransfer(
          {
            entryDate: "2026-09-20T00:00:00.000Z",
            amount: 500,
            fromAccountId: CASSA,
            toAccountId: BANCA,
          },
          scope(),
        );

      await insieme(gira(), gira());

      const gambe = await prisma.accountingEntry.findMany({
        where: { organization_id: CLUB, source_domain: "INTERNAL_TRANSFER" },
      });
      const gruppi = new Map();
      for (const gamba of gambe) {
        gruppi.set(gamba.transfer_group_id, (gruppi.get(gamba.transfer_group_id) || 0) + 1);
      }
      const tutteAccoppiate = [...gruppi.values()].every((n) => n === 2);

      return {
        ok: gambe.length === 4 && gruppi.size === 2 && tutteAccoppiate,
        dettaglio: `${gambe.length} gambe in ${gruppi.size} gruppi, accoppiate: ${tutteAccoppiate}`,
      };
    },
  );

  /* ----------------------------------- 6. saldo letto durante la scrittura */
  await prova(
    "6. saldo letto mentre si scrive",
    "un valore coerente, mai a meta",
    async () => {
      const { listFinancialAccountBalances } = await import(
        "../src/lib/server/financial-accounts.ts"
      );

      const prima = await listFinancialAccountBalances(scope(), { accountIds: [CASSA] });

      const scritture = Array.from({ length: 10 }, (_, i) => () =>
        accounting.createAccountingEntry(
          {
            entryDate: "2026-10-01T00:00:00.000Z",
            direction: "IN",
            amount: 10,
            financialAccountId: CASSA,
            operationTypeCode: "quota_attivita",
            description: `Concorrente ${i}`,
          },
          scope(),
        ),
      );
      const letture = Array.from({ length: 10 }, () => () =>
        listFinancialAccountBalances(scope(), { accountIds: [CASSA] }),
      );

      const esiti = await Promise.allSettled(
        [...scritture, ...letture].map((fn) => fn()),
      );
      const scritte = esiti.slice(0, 10).filter((e) => e.status === "fulfilled").length;

      const dopo = await listFinancialAccountBalances(scope(), { accountIds: [CASSA] });
      const atteso = prima[0].balanceCents + scritte * 1000;

      /*
        Ogni lettura concorrente deve essere un valore **possibile** — cioe
        compreso fra il saldo di partenza e quello finale — e mai un numero
        fuori scala, che sarebbe una somma raccolta a meta.
      */
      const intermedie = esiti
        .slice(10)
        .filter((e) => e.status === "fulfilled")
        .map((e) => e.value[0].balanceCents);
      const tutteCoerenti = intermedie.every(
        (v) => v >= prima[0].balanceCents && v <= atteso,
      );

      return {
        ok: dopo[0].balanceCents === atteso && tutteCoerenti,
        dettaglio: `saldo finale ${dopo[0].balanceCents} (atteso ${atteso}), ${intermedie.length} letture tutte coerenti: ${tutteCoerenti}`,
      };
    },
  );

  /* --------------------------- 8. storno e rimborso, nei due ordini */
  await prova(
    "8. storno e rimborso dello stesso incasso",
    "uno solo dei due passa, in qualunque ordine",
    async () => {
      const atleta = await prisma.athlete.create({
        data: { organization_id: CLUB, first_name: "Chiara", last_name: "Neri", updated_at: new Date() },
      });

      /*
        **La guardia copriva una direzione sola.** `reversePaymentTransaction`
        rifiutava di stornare cio che era gia stato rimborsato; al contrario
        non c'era niente. Si poteva stornare prima e rimborsare dopo, **senza
        nessuna simultaneita**, e il registro accettava entrambi: cento euro
        incassati, cento stornati — cioe «non e mai avvenuto» — e trenta
        restituiti su un incasso che il registro dichiara inesistente.

        Ed e il caso peggiore fra quelli possibili, perche il saldo derivato e
        la prima nota **concordano**: leggono le stesse righe vive. Nessuna
        riconciliazione fra le due letture puo vederlo. Il denaro manca e
        basta.
      */
      const perso = [];
      for (const ordine of ["storno-prima", "rimborso-prima", "insieme"]) {
        const rata = await prisma.athletePayment.create({
          data: {
            organization_id: CLUB,
            athlete_id: atleta.id,
            description: `Quota - ${ordine}`,
            amount: 100,
            updated_at: new Date(),
          },
        });
        const creato = await payments.createPaymentTransaction(
          { paymentId: rata.id, amount: 100, paymentMethod: "Carta", financialAccountId: CASSA },
          scope(),
        );

        const storna = () =>
          payments.reversePaymentTransaction(
            { transactionId: creato.transaction.id, reason: "Errore di cassa" },
            scope(),
          );
        const rimborsa = () =>
          payments.recordRefundTransaction(
            {
              transactionId: creato.transaction.id,
              amountCents: 3000,
              externalRefundId: `re_${ordine}`,
            },
            scope(),
          );

        if (ordine === "insieme") {
          await insieme(storna, rimborsa);
        } else {
          const primo = ordine === "storno-prima" ? storna : rimborsa;
          const secondo = ordine === "storno-prima" ? rimborsa : storna;
          await primo().catch(() => {});
          await secondo().catch(() => {});
        }

        const righe = await prisma.paymentTransaction.findMany({
          where: { payment_id: rata.id },
        });
        /*
          La cassa reale: 100 entrati, meno il rimborso se e stato eseguito.
          Il registro deve raccontare o «zero, non e mai avvenuto» (storno) o
          «settanta» (rimborso), mai meno trenta.
        */
        const rimborsato = righe.some(
          (r) => Number(r.amount) < 0 && !r.reverses_transaction_id,
        );
        const stornato = righe.some((r) => r.reverses_transaction_id);
        if (rimborsato && stornato) perso.push(ordine);
      }

      return {
        ok: perso.length === 0,
        dettaglio:
          perso.length === 0
            ? "3 ordini su 3: mai storno e rimborso insieme"
            : `storno e rimborso entrambi accettati in: ${perso.join(", ")}`,
      };
    },
  );

  /* ------------------------------------- 7. riconciliazione doppia */
  await prova(
    "7. riconciliazione doppia dello stesso movimento",
    "uno stato solo, nessuna riga in piu",
    async () => {
      const riga = await accounting.createAccountingEntry(
        {
          entryDate: "2026-09-15T00:00:00.000Z",
          direction: "OUT",
          amount: 150,
          financialAccountId: CASSA,
          operationTypeCode: "quota_attivita",
          description: "Da riconciliare",
        },
        scope(),
      );

      const spunta = () => () =>
        accounting.reconcileAccountingEntry(
          { entryId: riga.id, status: "reconciled", bankReference: "CRO 1" },
          scope(),
        );

      await insieme(spunta(), spunta());

      const dopo = await prisma.accountingEntry.findUnique({ where: { id: riga.id } });
      const quante = await prisma.accountingEntry.count({
        where: { organization_id: CLUB, description: "Da riconciliare" },
      });

      return {
        ok: dopo.reconciliation_status === "reconciled" && quante === 1,
        dettaglio: `stato ${dopo.reconciliation_status}, ${quante} riga`,
      };
    },
  );
};

try {
  await semina();
  await esegui();
  console.log(
    NEWLINE +
      (fallite === 0
        ? `Tutte le ${passate} prove di concorrenza sono passate.`
        : `${fallite} prove su ${passate + fallite} sono fallite.`),
  );
  if (fallite > 0) process.exitCode = 1;
} catch (error) {
  console.error(NEWLINE + "Sonda non riuscita: " + String(error?.message).split(NEWLINE)[0]);
  process.exitCode = 1;
} finally {
  await prisma.club.delete({ where: { id: CLUB } }).catch(() => {
    console.error(`Il club di prova ${CLUB} e rimasto: va cancellato a mano.`);
  });
  await prisma.$disconnect();
}
