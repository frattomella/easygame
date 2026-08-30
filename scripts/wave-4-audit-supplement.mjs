/**
 * Supplemento all'audit di concorrenza (revisore 2). Prove mirate su cio che
 * la sonda principale non separa:
 *
 *  S1. l'F24 corretto in SEQUENZA (nessuna corsa): l'importo si aggiorna?
 *  S2. due rimborsi DIVERSI e simultanei, insieme oltre l'incasso
 *  S3. cancellazione e riscrittura di massa simultanee: la riga risorge?
 *  S4. append e riscrittura di massa: la riga nuova sparisce in silenzio?
 *
 * Club dedicato, cancellato alla fine.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("Rifiuto: serve EASYGAME_DB_ENV=development.");
  process.exit(1);
}

const prisma = new PrismaClient();
const NL = String.fromCharCode(10);

const CLUB = randomUUID();
const BANCA = randomUUID();
const CAUSALE = randomUUID();
let UTENTE = null;

const scope = () => ({
  userId: UTENTE?.id ?? null,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

const insieme = async (...fns) => {
  const esiti = await Promise.allSettled(fns.map((f) => f()));
  return {
    riuscite: esiti.filter((e) => e.status === "fulfilled").length,
    valori: esiti.filter((e) => e.status === "fulfilled").map((e) => e.value),
    motivi: esiti
      .filter((e) => e.status === "rejected")
      .map((e) => String(e.reason?.message || e.reason).split(NL).filter(Boolean).slice(-1)[0]),
  };
};

const esiti = [];
const prova = async (titolo, atteso, fn) => {
  try {
    const r = await fn();
    esiti.push({ titolo, ok: r.ok, dettaglio: r.dettaglio, atteso, severita: r.severita });
    console.log(`  ${r.ok ? "REGGE " : "ROTTO "} ${titolo.padEnd(52)} ${r.dettaglio}`);
    if (!r.ok) console.log(`         atteso: ${atteso}`);
  } catch (error) {
    const msg = String(error?.message).split(NL).slice(0, 2).join(" | ");
    esiti.push({ titolo, ok: false, dettaglio: `errore: ${msg}`, atteso, severita: "?" });
    console.log(`  ERRORE ${titolo.padEnd(52)} ${msg}`);
  }
};

const semina = async () => {
  UTENTE = await prisma.user.findFirst();
  if (!UTENTE) throw new Error("Nessun utente nel database di sviluppo");
  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `audit-supplemento-${Date.now()}`,
      name: "ASD Audit Supplemento",
      creator_id: UTENTE.id,
    },
  });
  await prisma.financialAccount.create({
    data: { id: BANCA, organization_id: CLUB, name: "Banca", kind: "BANK", updated_at: new Date() },
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

const nuovaRata = async (importo, nome) => {
  const atleta = await prisma.athlete.create({
    data: { organization_id: CLUB, first_name: nome, last_name: "Prova", updated_at: new Date() },
  });
  return prisma.athletePayment.create({
    data: {
      organization_id: CLUB,
      athlete_id: atleta.id,
      description: `Quota ${nome}`,
      amount: importo,
      updated_at: new Date(),
    },
  });
};

const esegui = async () => {
  const agenda = await import("../src/lib/server/sport-work-agenda.ts");
  const payments = await import("../src/lib/server/payment-transactions.ts");
  const resources = await import("../src/lib/server/resources.ts");

  console.log(NL + "=== S1. F24: LA CORREZIONE IN SEQUENZA ===" + NL);

  await prova(
    "S1. stesso adempimento, assolto due volte con importi diversi",
    "o l'importo si aggiorna, o la risposta dichiara che non l'ha fatto",
    async () => {
      const ad = await agenda.createManualObligation(
        {
          organizationId: CLUB,
          kind: "F24",
          title: "Contributi ottobre",
          dueDate: "2026-10-16",
          amount: 1000,
        },
        scope(),
      );

      /* Primo assolvimento: 1.000,00 euro. */
      const primo = await agenda.completeObligation(
        ad.id,
        { payment: { financialAccountId: BANCA, operationTypeCode: "quota_attivita", amount: 1000 } },
        scope(),
      );

      /* La segretaria si accorge dell'errore e ricorregge: 9.999,00 euro. */
      const secondo = await agenda.completeObligation(
        ad.id,
        { payment: { financialAccountId: BANCA, operationTypeCode: "quota_attivita", amount: 9999 } },
        scope(),
      );

      const righe = await prisma.accountingEntry.findMany({
        where: {
          organization_id: CLUB,
          source_event_key: `sport_work_obligation:${ad.reference_key}`,
        },
      });

      const inBanca = righe.reduce((t, r) => t + Number(r.amount_cents), 0);
      const aggiornato = Number(righe[0]?.amount_cents) === 999900;
      const dichiarato = Boolean(secondo?.financialEntrySkipped);

      return {
        ok: aggiornato || dichiarato,
        severita: "HIGH",
        dettaglio:
          `${righe.length} riga, prima nota ${inBanca} cent (chiesti 999900); ` +
          `1a risposta ${primo?.financialEntry?.amount_cents} cent; ` +
          `2a risposta ${secondo?.financialEntry?.amount_cents} cent, avviso: ${dichiarato ? "si" : "NESSUNO"}`,
      };
    },
  );

  console.log(NL + "=== S2. DUE RIMBORSI DIVERSI, INSIEME OLTRE L'INCASSO ===" + NL);

  await prova(
    "S2. due rimborsi da 60 su un incasso da 100, simultanei",
    "uno dei due deve essere rifiutato: il totale non puo superare 100",
    async () => {
      const rata = await nuovaRata(100, "Capiente");
      const inc = await payments.createPaymentTransaction(
        { paymentId: rata.id, amount: 100, paymentMethod: "Carta", financialAccountId: BANCA },
        scope(),
      );

      const rimborsa = (rif) => () =>
        payments.recordRefundTransaction(
          {
            transactionId: inc.transaction.id,
            confirmedByProvider: true,
            externalRefundId: rif,
            amountCents: 6000,
          },
          scope(),
        );

      const esito = await insieme(rimborsa(`re_a_${randomUUID()}`), rimborsa(`re_b_${randomUUID()}`));

      const righe = await prisma.paymentTransaction.findMany({
        where: { organization_id: CLUB, payment_id: rata.id },
        select: { amount: true },
      });
      const netto = righe.reduce((t, r) => t + Number(r.amount), 0);
      const rimborsato = righe
        .filter((r) => Number(r.amount) < 0)
        .reduce((t, r) => t + Math.abs(Number(r.amount)), 0);

      return {
        ok: esito.riuscite === 1 && rimborsato <= 100,
        severita: "CRITICAL",
        dettaglio: `${esito.riuscite}/2 riuscite, rimborsato ${rimborsato} su 100, netto ${netto} | rifiuti: ${esito.motivi.join(" ; ") || "nessuno"}`,
      };
    },
  );

  console.log(NL + "=== S3/S4. LA RISCRITTURA DI MASSA CONTRO LA RIGA SINGOLA ===" + NL);

  await prova(
    "S3. cancellazione e riscrittura di massa simultanee",
    "la riga cancellata non deve risorgere",
    async () => {
      await prisma.clubResourceItem.deleteMany({
        where: { organization_id: CLUB, resource_type: "discounts" },
      });
      const ids = [randomUUID(), randomUUID(), randomUUID()];
      for (const id of ids) {
        await prisma.$transaction((tx) =>
          resources.appendClubResourceItem(tx, CLUB, "discounts", { id, name: `Sconto ${id.slice(0, 4)}` }),
        );
      }
      /* Cio che il browser ha in mano: tutte e tre. */
      const vistiDalBrowser = await resources.readClubResourceCollection(CLUB, "discounts");

      const esito = await insieme(
        () =>
          prisma.$transaction((tx) => resources.removeClubResourceItem(tx, CLUB, "discounts", ids[0])),
        () =>
          resources.updateResource(
            "clubs",
            CLUB,
            { discounts: vistiDalBrowser },
            scope(),
          ),
      );

      const righe = await prisma.clubResourceItem.findMany({
        where: { organization_id: CLUB, resource_type: "discounts" },
      });
      const risorta = righe.some((r) => String(r.id) === ids[0] || String(r.payload?.id) === ids[0]);

      return {
        ok: !risorta && righe.length === 2,
        severita: "HIGH",
        dettaglio: `${esito.riuscite}/2 riuscite, ${righe.length} righe (attese 2), cancellata risorta: ${risorta ? "SI" : "no"} | rifiuti: ${esito.motivi.join(" ; ") || "nessuno"}`,
      };
    },
  );

  await prova(
    "S4. append e riscrittura di massa simultanee",
    "la riga appena aggiunta non deve sparire in silenzio",
    async () => {
      await prisma.clubResourceItem.deleteMany({
        where: { organization_id: CLUB, resource_type: "expected_expenses" },
      });
      for (let i = 0; i < 3; i += 1) {
        await prisma.$transaction((tx) =>
          resources.appendClubResourceItem(tx, CLUB, "expected_expenses", {
            id: randomUUID(),
            name: `Uscita ${i}`,
          }),
        );
      }
      const vistiDalBrowser = await resources.readClubResourceCollection(CLUB, "expected_expenses");
      const nuovo = randomUUID();

      const esito = await insieme(
        () =>
          prisma.$transaction((tx) =>
            resources.appendClubResourceItem(tx, CLUB, "expected_expenses", {
              id: nuovo,
              name: "Uscita NUOVA",
            }),
          ),
        () =>
          resources.updateResource(
            "clubs",
            CLUB,
            { expected_expenses: vistiDalBrowser },
            scope(),
          ),
      );

      const righe = await prisma.clubResourceItem.findMany({
        where: { organization_id: CLUB, resource_type: "expected_expenses" },
      });
      const persa = !righe.some((r) => String(r.id) === nuovo || String(r.payload?.id) === nuovo);

      return {
        ok: !persa && righe.length === 4,
        severita: "HIGH",
        dettaglio: `${esito.riuscite}/2 riuscite, ${righe.length} righe (attese 4), riga nuova PERSA senza errore: ${persa ? "SI" : "no"} | rifiuti: ${esito.motivi.join(" ; ") || "nessuno"}`,
      };
    },
  );
};

const pulisci = async () => {
  /* Ordine: figli prima, club per ultimo. */
  await prisma.$executeRawUnsafe(
    `DELETE FROM payment_transactions WHERE organization_id = '${CLUB}'::uuid`,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM payments WHERE organization_id = '${CLUB}'::uuid`);
  await prisma.$executeRawUnsafe(`DELETE FROM athletes WHERE organization_id = '${CLUB}'::uuid`);
  await prisma.$executeRawUnsafe(
    `DELETE FROM accounting_entries WHERE organization_id = '${CLUB}'::uuid`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM sport_work_obligations WHERE organization_id = '${CLUB}'::uuid`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM club_resource_items WHERE organization_id = '${CLUB}'::uuid`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM financial_accounts WHERE organization_id = '${CLUB}'::uuid`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM fiscal_operation_types WHERE organization_id = '${CLUB}'::uuid`,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM audit_logs WHERE organization_id = '${CLUB}'::uuid`);
  await prisma.$executeRawUnsafe(`DELETE FROM clubs WHERE id = '${CLUB}'::uuid`);
};

const main = async () => {
  await semina();
  try {
    await esegui();
  } finally {
    await pulisci();
    await prisma.$disconnect();
  }

  const rotte = esiti.filter((e) => !e.ok);
  console.log(NL + `${rotte.length} difese su ${esiti.length} NON hanno retto:`);
  for (const r of rotte) {
    console.log(`  [${r.severita}] ${r.titolo}`);
    console.log(`      atteso : ${r.atteso}`);
    console.log(`      trovato: ${r.dettaglio}`);
  }
};

main().catch(async (error) => {
  console.error(error);
  try {
    await pulisci();
  } catch {}
  await prisma.$disconnect();
  process.exit(1);
});
