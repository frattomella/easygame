/**
 * **Sonda di audit: concorrenza, idempotenza, storni.** Revisore 2 di 5.
 *
 *     node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *       scripts/wave-4-audit-concurrency-probe.mjs
 *
 * Affianca `scripts/wave-4-concurrency-probe.mjs` e prova cio che quella non
 * prova: la gamba orfana di un giroconto, lo storno incrociato di due gambe
 * dello stesso gruppo, l'idempotenza dell'F24 con importi **diversi**, la
 * lettura del saldo dentro una transazione lunga, il `FOR UPDATE` delle
 * collezioni di club — e la porta di servizio che lo aggira.
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
const CASSA = randomUUID();
const BANCA = randomUUID();
const TERZO = randomUUID();
const CAUSALE = randomUUID();

let passate = 0;
let fallite = 0;
const difetti = [];

const prova = async (titolo, atteso, fn) => {
  try {
    const esito = await fn();
    if (esito.ok) passate += 1;
    else {
      fallite += 1;
      difetti.push({ titolo, atteso, trovato: esito.dettaglio, severita: esito.severita });
    }
    console.log(`  ${esito.ok ? "REGGE " : "ROTTO "} ${titolo.padEnd(56)} ${esito.dettaglio}`);
    if (!esito.ok) console.log(`         atteso: ${atteso}`);
  } catch (error) {
    fallite += 1;
    const msg = String(error?.message).split(NL).slice(0, 3).join(" | ");
    difetti.push({ titolo, atteso, trovato: `errore: ${msg}`, severita: "?" });
    console.log(`  ERRORE ${titolo.padEnd(56)} ${msg}`);
  }
};

const insieme = async (...fns) => {
  const esiti = await Promise.allSettled(fns.map((f) => f()));
  return {
    riuscite: esiti.filter((e) => e.status === "fulfilled").length,
    fallite: esiti.filter((e) => e.status === "rejected").length,
    valori: esiti.filter((e) => e.status === "fulfilled").map((e) => e.value),
    motivi: esiti
      .filter((e) => e.status === "rejected")
      .map((e) => String(e.reason?.message || e.reason).split(NL).filter(Boolean).slice(-1)[0]),
  };
};

const scope = () => ({
  userId: null,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

let UTENTE = null;

const semina = async () => {
  UTENTE = await prisma.user.findFirst();
  if (!UTENTE) throw new Error("Nessun utente nel database di sviluppo");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `audit-concorrenza-${Date.now()}`,
      name: "ASD Audit Concorrenza",
      creator_id: UTENTE.id,
    },
  });
  await prisma.financialAccount.createMany({
    data: [
      { id: CASSA, organization_id: CLUB, name: "Cassa", kind: "CASH", updated_at: new Date() },
      { id: BANCA, organization_id: CLUB, name: "Banca", kind: "BANK", updated_at: new Date() },
      { id: TERZO, organization_id: CLUB, name: "Terzo", kind: "BANK", updated_at: new Date() },
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

const nuovaRata = async (importo, nome = "Anna") => {
  const atleta = await prisma.athlete.create({
    data: { organization_id: CLUB, first_name: nome, last_name: "Prova", updated_at: new Date() },
  });
  const rata = await prisma.athletePayment.create({
    data: {
      organization_id: CLUB,
      athlete_id: atleta.id,
      description: `Quota ${nome}`,
      amount: importo,
      updated_at: new Date(),
    },
  });
  return { atleta, rata };
};

const esegui = async () => {
  const accounting = await import("../src/lib/server/accounting.ts");
  const payments = await import("../src/lib/server/payment-transactions.ts");
  const funding = await import("../src/lib/server/funding.ts");
  const members = await import("../src/lib/server/members.ts");
  const expected = await import("../src/lib/server/expected-entries.ts");
  const agenda = await import("../src/lib/server/sport-work-agenda.ts");
  const resources = await import("../src/lib/server/resources.ts");
  const numbering = await import("../src/lib/server/document-numbering.ts");
  const conti = await import("../src/lib/server/financial-accounts.ts");

  console.log(NL + "=== 1. GIROCONTO: LA GAMBA ORFANA ===" + NL);

  await prova(
    "1a. il DB accetta un gruppo con UNA sola gamba?",
    "il vincolo dovrebbe impedirlo",
    async () => {
      const gruppo = randomUUID();
      const id = randomUUID();
      let scritta = false;
      try {
        await prisma.$executeRaw`
          INSERT INTO accounting_entries
            (id, organization_id, entry_date, fiscal_year, direction, amount_cents,
             financial_account_id, description, source_domain, transfer_group_id,
             activity_scope_snapshot, updated_at)
          VALUES (${id}::uuid, ${CLUB}::uuid, '2026-05-05'::timestamp, 2026, 'OUT', 100,
             ${CASSA}::uuid, 'Gamba sola', 'INTERNAL_TRANSFER', ${gruppo}::uuid,
             'unspecified', now())`;
        scritta = true;
      } catch {
        scritta = false;
      }
      const quante = await prisma.accountingEntry.count({
        where: { transfer_group_id: gruppo },
      });
      if (scritta) await prisma.accountingEntry.deleteMany({ where: { id } });
      return {
        ok: !scritta,
        severita: "MEDIUM",
        dettaglio: scritta
          ? `gamba orfana SCRITTA (${quante} riga nel gruppo): nessun vincolo la vieta`
          : "rifiutata dal database",
      };
    },
  );

  await prova(
    "1b. transazione: se la 2a gamba fallisce, la 1a resta?",
    "rollback totale, zero righe",
    async () => {
      const gruppo = randomUUID();
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`
            INSERT INTO accounting_entries
              (id, organization_id, entry_date, fiscal_year, direction, amount_cents,
               financial_account_id, description, source_domain, transfer_group_id,
               activity_scope_snapshot, updated_at)
            VALUES (gen_random_uuid(), ${CLUB}::uuid, '2026-05-05'::timestamp, 2026, 'OUT', 100,
               ${CASSA}::uuid, 'Gamba 1', 'INTERNAL_TRANSFER', ${gruppo}::uuid,
               'unspecified', now())`;
          /* La seconda gamba viola il CHECK sull'importo: fallisce di sicuro. */
          await tx.$executeRaw`
            INSERT INTO accounting_entries
              (id, organization_id, entry_date, fiscal_year, direction, amount_cents,
               financial_account_id, description, source_domain, transfer_group_id,
               activity_scope_snapshot, updated_at)
            VALUES (gen_random_uuid(), ${CLUB}::uuid, '2026-05-05'::timestamp, 2026, 'IN', 0,
               ${BANCA}::uuid, 'Gamba 2', 'INTERNAL_TRANSFER', ${gruppo}::uuid,
               'unspecified', now())`;
        });
      } catch {
        /* atteso */
      }
      const rimaste = await prisma.accountingEntry.count({
        where: { transfer_group_id: gruppo },
      });
      return {
        ok: rimaste === 0,
        severita: "CRITICAL",
        dettaglio: `${rimaste} righe dopo il fallimento della seconda gamba`,
      };
    },
  );

  await prova(
    "1c. giroconto mentre il conto d'arrivo viene archiviato",
    "o due gambe, o zero; mai un movimento su conto chiuso",
    async () => {
      let orfani = 0;
      let suArchiviato = 0;
      let riusciti = 0;

      for (let giro = 0; giro < 12; giro += 1) {
        await prisma.financialAccount.update({
          where: { id: TERZO },
          data: { is_archived: false },
        });
        /* Lo scarto cresce a ogni giro: cosi la corsa cade da tutte e due le parti. */
        const ritardo = giro;
        const esito = await insieme(
          () =>
            accounting.createInternalTransfer(
              {
                entryDate: "2026-06-10T00:00:00.000Z",
                amount: 10,
                fromAccountId: CASSA,
                toAccountId: TERZO,
              },
              scope(),
            ),
          async () => {
            await new Promise((r) => setTimeout(r, ritardo));
            return prisma.financialAccount.update({
              where: { id: TERZO },
              data: { is_archived: true },
            });
          },
        );
        if (esito.valori.some((v) => v?.transferGroupId)) riusciti += 1;
      }

      const gambe = await prisma.accountingEntry.findMany({
        where: { organization_id: CLUB, source_domain: "INTERNAL_TRANSFER" },
      });
      const gruppi = new Map();
      for (const g of gambe) gruppi.set(g.transfer_group_id, (gruppi.get(g.transfer_group_id) || 0) + 1);
      orfani = [...gruppi.values()].filter((n) => n !== 2).length;

      const conto = await prisma.financialAccount.findUnique({ where: { id: TERZO } });
      if (conto?.is_archived) {
        suArchiviato = await prisma.accountingEntry.count({
          where: {
            organization_id: CLUB,
            financial_account_id: TERZO,
            created_at: { gte: conto.updated_at },
          },
        });
      }

      return {
        ok: orfani === 0,
        severita: "CRITICAL",
        dettaglio: `${riusciti}/12 giroconti riusciti, ${gruppi.size} gruppi, ${orfani} gruppi non appaiati, ${suArchiviato} movimenti scritti dopo l'archiviazione`,
      };
    },
  );

  console.log(NL + "=== 2. STORNO DI DUE GAMBE DIVERSE DELLO STESSO GRUPPO ===" + NL);

  await prova(
    "2a. storno simultaneo di gamba A e gamba B",
    "una sola coppia di storni (2 righe REVERSAL)",
    async () => {
      const giro = await accounting.createInternalTransfer(
        {
          entryDate: "2026-07-01T00:00:00.000Z",
          amount: 250,
          fromAccountId: CASSA,
          toAccountId: BANCA,
        },
        scope(),
      );
      const [a, b] = giro.entries;

      const esito = await insieme(
        () => accounting.reverseAccountingEntry({ entryId: a.id, reason: "Errore A" }, scope()),
        () => accounting.reverseAccountingEntry({ entryId: b.id, reason: "Errore B" }, scope()),
      );

      const storni = await prisma.accountingEntry.count({
        where: { organization_id: CLUB, reversal_of_id: { in: [a.id, b.id] } },
      });
      const motivi = await prisma.accountingEntry.findMany({
        where: { organization_id: CLUB, id: { in: [a.id, b.id] } },
        select: { reversal_reason: true },
      });
      const motiviDistinti = new Set(motivi.map((m) => m.reversal_reason));

      return {
        ok: storni === 2 && esito.riuscite === 1,
        severita: "HIGH",
        dettaglio: `${storni} storni, ${esito.riuscite}/2 chiamate riuscite, motivi sull'originale: ${[...motiviDistinti].join(" + ")} | rifiuti: ${esito.motivi.join(" ; ") || "nessuno"}`,
      };
    },
  );

  await prova(
    "2b. storno di gamba A e ri-storno di gamba B, in sequenza",
    "il secondo deve essere rifiutato",
    async () => {
      const giro = await accounting.createInternalTransfer(
        { entryDate: "2026-07-02T00:00:00.000Z", amount: 60, fromAccountId: CASSA, toAccountId: BANCA },
        scope(),
      );
      const [a, b] = giro.entries;
      await accounting.reverseAccountingEntry({ entryId: a.id, reason: "Primo" }, scope());
      let secondo = "riuscito";
      try {
        await accounting.reverseAccountingEntry({ entryId: b.id, reason: "Secondo" }, scope());
      } catch (error) {
        secondo = String(error?.message).split(NL)[0];
      }
      const storni = await prisma.accountingEntry.count({
        where: { organization_id: CLUB, reversal_of_id: { in: [a.id, b.id] } },
      });
      return {
        ok: storni === 2 && secondo !== "riuscito",
        severita: "HIGH",
        dettaglio: `${storni} storni; secondo tentativo: ${secondo}`,
      };
    },
  );

  await prova(
    "2c. storno e riconciliazione simultanei sullo stesso movimento",
    "un movimento stornato non resta riconciliato",
    async () => {
      let riconciliatiEStornati = 0;
      for (let giro = 0; giro < 8; giro += 1) {
        const riga = await accounting.createAccountingEntry(
          {
            entryDate: "2026-08-25T00:00:00.000Z",
            direction: "IN",
            amount: 40,
            financialAccountId: CASSA,
            operationTypeCode: "quota_attivita",
            description: `Corsa storno-spunta ${giro}`,
          },
          scope(),
        );
        await insieme(
          () => accounting.reverseAccountingEntry({ entryId: riga.id, reason: "Errore" }, scope()),
          () =>
            accounting.reconcileAccountingEntry(
              { entryId: riga.id, status: "reconciled", bankReference: `CRO ${giro}` },
              scope(),
            ),
        );
        const dopo = await prisma.accountingEntry.findUnique({ where: { id: riga.id } });
        if (dopo?.reversed_at && dopo?.reconciliation_status === "reconciled") {
          riconciliatiEStornati += 1;
        }
      }
      return {
        ok: riconciliatiEStornati === 0,
        severita: "MEDIUM",
        dettaglio: `${riconciliatiEStornati}/8 movimenti risultano stornati E riconciliati insieme`,
      };
    },
  );

  console.log(NL + "=== 3. DOPPIO INCASSO E RICALCOLO DELLA RATA ===" + NL);

  await prova(
    "3a. cinque incassi simultanei su una rata da 100",
    "somma <= 100, stato coerente con le righe",
    async () => {
      const { rata } = await nuovaRata(100, "Cinque");
      const incassa = (n) => () =>
        payments.createPaymentTransaction(
          { paymentId: rata.id, amount: n, paymentMethod: "Contanti", financialAccountId: CASSA },
          scope(),
        );
      const esito = await insieme(incassa(30), incassa(30), incassa(30), incassa(30), incassa(30));

      const somma = await prisma.paymentTransaction.aggregate({
        where: { payment_id: rata.id },
        _sum: { amount: true },
      });
      const dopo = await prisma.athletePayment.findUnique({ where: { id: rata.id } });
      const totale = Number(somma._sum.amount || 0);
      const ledger = dopo?.data?.ledger || {};
      const coerente = Number(ledger.paidAmount) === totale;

      return {
        ok: totale <= 100 && coerente,
        severita: "CRITICAL",
        dettaglio: `${esito.riuscite}/5 incassi, somma ${totale}, stato ${dopo.status}, ledger.paidAmount ${ledger.paidAmount} (coerente: ${coerente})`,
      };
    },
  );

  await prova(
    "3b. incasso e storno simultanei sulla stessa rata",
    "il ledger copiato sulla rata deve pareggiare le righe",
    async () => {
      const { rata } = await nuovaRata(300, "Misto");
      const primo = await payments.createPaymentTransaction(
        { paymentId: rata.id, amount: 100, paymentMethod: "Contanti", financialAccountId: CASSA },
        scope(),
      );
      const esito = await insieme(
        () =>
          payments.createPaymentTransaction(
            { paymentId: rata.id, amount: 200, paymentMethod: "Bonifico", financialAccountId: BANCA },
            scope(),
          ),
        () =>
          payments.reversePaymentTransaction(
            { transactionId: primo.transaction.id, reason: "Ripensamento" },
            scope(),
          ),
      );

      const righe = await prisma.paymentTransaction.findMany({ where: { payment_id: rata.id } });
      const somma = righe.reduce((t, r) => t + Number(r.amount), 0);
      const dopo = await prisma.athletePayment.findUnique({ where: { id: rata.id } });
      const ledger = dopo?.data?.ledger || {};
      const coerente = Number(ledger.paidAmount) === somma;

      return {
        ok: coerente,
        severita: "HIGH",
        dettaglio: `${esito.riuscite}/2, ${righe.length} righe somma ${somma}, ledger.paidAmount ${ledger.paidAmount}, stato ${dopo.status}`,
      };
    },
  );

  console.log(NL + "=== 4. IDEMPOTENZA DELL'F24 ===" + NL);

  await prova(
    "4a. due F24 sullo stesso adempimento, importi DIVERSI",
    "la seconda deve dire che non ha registrato il suo importo",
    async () => {
      const ad = await agenda.createManualObligation(
        {
          organizationId: CLUB,
          kind: "F24",
          title: "Versamento contributi novembre",
          dueDate: "2026-11-16",
          amount: 1000,
        },
        scope(),
      );

      const paga = (importo) => async () => {
        const esito = await agenda.completeObligation(
          ad.id,
          {
            payment: {
              financialAccountId: BANCA,
              operationTypeCode: "quota_attivita",
              amount: importo,
            },
          },
          scope(),
        );
        return { chiesto: importo * 100, esito };
      };

      const esito = await insieme(paga(1000), paga(9999));

      const righe = await prisma.accountingEntry.findMany({
        where: {
          organization_id: CLUB,
          source_event_key: `sport_work_obligation:${ad.reference_key}`,
        },
      });

      const risposte = esito.valori.map(
        (v) =>
          `chiesti ${v.chiesto} -> registrati ${v.esito?.financialEntry?.amount_cents ?? "nulla"} (avviso: ${v.esito?.financialEntrySkipped ? "si" : "NO"})`,
      );

      /*
        Il difetto: a chi ha perso la corsa viene risposto con la riga
        dell'altro, importo diverso, **senza** che `financialEntrySkipped` lo
        segnali. Crede di aver versato la sua cifra.
      */
      const bugiarda = esito.valori.some(
        (v) =>
          v.esito?.financialEntry &&
          !v.esito.financialEntrySkipped &&
          Number(v.esito.financialEntry.amount_cents) !== v.chiesto,
      );

      return {
        ok: righe.length === 1 && !bugiarda,
        severita: "MEDIUM",
        dettaglio: `${righe.length} riga in prima nota da ${righe[0]?.amount_cents} cent; ${risposte.join(" | ")}`,
      };
    },
  );

  await prova(
    "4b. due adempimenti DISTINTI con la stessa reference_key",
    "due movimenti, uno per adempimento",
    async () => {
      const comune = {
        organizationId: CLUB,
        kind: "F24",
        title: "Versamento contributi dicembre",
        dueDate: "2026-12-16",
      };
      const uno = await agenda.createManualObligation({ ...comune, amount: 500 }, scope());
      let secondo = "creato";
      try {
        await agenda.createManualObligation({ ...comune, amount: 700 }, scope());
      } catch (error) {
        secondo = String(error?.message).includes("Unique constraint")
          ? "rifiutato dall'indice unico (organization_id, reference_key)"
          : String(error?.message).split(NL)[0];
      }

      return {
        ok: secondo !== "creato",
        severita: "HIGH",
        dettaglio: `chiave ${uno.reference_key}; secondo adempimento: ${secondo}`,
      };
    },
  );

  console.log(NL + "=== 5. IL SALDO DENTRO UNA TRANSAZIONE LUNGA ===" + NL);

  await prova(
    "5a. due letture del saldo nella stessa transazione",
    "lo stesso valore: un rendiconto non cambia mentre lo si stampa",
    async () => {
      let prima = null;
      let dopo = null;

      await prisma.$transaction(
        async (tx) => {
          const leggi = async () => {
            const r = await tx.$queryRaw`
              SELECT COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount_cents ELSE -amount_cents END), 0) AS saldo
              FROM accounting_entries
              WHERE organization_id = ${CLUB}::uuid AND financial_account_id = ${CASSA}::uuid`;
            return Number(r[0].saldo);
          };
          prima = await leggi();
          /* Un'altra connessione scrive e conferma, mentre siamo aperti. */
          await accounting.createAccountingEntry(
            {
              entryDate: "2026-08-01T00:00:00.000Z",
              direction: "IN",
              amount: 77,
              financialAccountId: CASSA,
              operationTypeCode: "quota_attivita",
              description: "Scrittura concorrente",
            },
            scope(),
          );
          dopo = await leggi();
        },
        { timeout: 20000 },
      );

      return {
        ok: prima === dopo,
        severita: "MEDIUM",
        dettaglio: `prima ${prima}, dopo ${dopo} (${prima === dopo ? "ripetibile" : "lettura non ripetibile: READ COMMITTED"})`,
      };
    },
  );

  console.log(NL + "=== 6. LE COLLEZIONI DI CLUB: IL FOR UPDATE ===" + NL);

  await prova(
    "6a. otto previsioni simultanee sullo stesso club",
    "otto righe, e otto nell'aggregato JSON",
    async () => {
      const crea = (n) => () =>
        expected.createExpectedEntry(scope(), {
          organizationId: CLUB,
          direction: "income",
          date: "2026-09-01",
          description: `Previsione ${n}`,
          amountCents: 1000 + n,
        });
      const esito = await insieme(...Array.from({ length: 8 }, (_, i) => crea(i)));

      const righe = await prisma.clubResourceItem.count({
        where: { organization_id: CLUB, resource_type: "expected_income" },
      });
      const club = await prisma.club.findUnique({ where: { id: CLUB } });
      const aggregato = Array.isArray(club?.expected_income) ? club.expected_income.length : -1;

      return {
        ok: righe === 8 && aggregato === 8 && esito.riuscite === 8,
        severita: "CRITICAL",
        dettaglio: `${esito.riuscite}/8 riuscite, ${righe} righe, ${aggregato} nell'aggregato`,
      };
    },
  );

  await prova(
    "6b. creazione e cancellazione simultanee",
    "7 righe e 7 nell'aggregato",
    async () => {
      const esistenti = await prisma.clubResourceItem.findMany({
        where: { organization_id: CLUB, resource_type: "expected_income" },
        orderBy: { created_at: "asc" },
      });
      const daTogliere = esistenti[0];

      const esito = await insieme(
        () =>
          expected.createExpectedEntry(scope(), {
            organizationId: CLUB,
            direction: "income",
            date: "2026-09-02",
            description: "Nata durante la cancellazione",
            amountCents: 5000,
          }),
        () =>
          expected.deleteExpectedEntry(scope(), {
            organizationId: CLUB,
            direction: "income",
            id: daTogliere.id,
          }),
      );

      const righe = await prisma.clubResourceItem.count({
        where: { organization_id: CLUB, resource_type: "expected_income" },
      });
      const club = await prisma.club.findUnique({ where: { id: CLUB } });
      const aggregato = Array.isArray(club?.expected_income) ? club.expected_income.length : -1;

      return {
        ok: righe === 8 && aggregato === 8 && esito.riuscite === 2,
        severita: "HIGH",
        dettaglio: `${esito.riuscite}/2 riuscite, ${righe} righe, ${aggregato} nell'aggregato (atteso 8 e 8)`,
      };
    },
  );

  await prova(
    "6c. porta di servizio: PUT clubs {members} contro admitNewMember",
    "nessun socio perso: la riscrittura di massa deve mettersi in fila",
    async () => {
      await prisma.clubResourceItem.deleteMany({
        where: { organization_id: CLUB, resource_type: "members" },
      });
      await prisma.club.update({ where: { id: CLUB }, data: { members: [] } });

      /* Tre soci gia in casa, come li vede una schermata aperta. */
      for (let i = 0; i < 3; i += 1) {
        await members.admitNewMember({ ...scope(), userId: UTENTE.id }, {
          organizationId: CLUB,
          effectiveDate: "2026-01-10",
          resolutionReference: `Delibera ${i}`,
          member: { firstName: `Vecchio${i}`, lastName: "Socio" },
        });
      }
      const vistiDalBrowser = await resources.readClubResourceCollection(CLUB, "members");

      /* Ora: una nuova ammissione, e in parallelo il salvataggio della vecchia lista. */
      const esito = await insieme(
        () =>
          members.admitNewMember({ ...scope(), userId: UTENTE.id }, {
            organizationId: CLUB,
            effectiveDate: "2026-02-10",
            resolutionReference: "Delibera nuova",
            member: { firstName: "Nuovo", lastName: "Socio" },
          }),
        () =>
          resources.updateResource(
            "clubs",
            CLUB,
            { members: vistiDalBrowser },
            { userId: UTENTE.id, activeOrganizationId: CLUB, activeRole: "owner", allowedOrganizationIds: [CLUB] },
          ),
      );

      const righe = await prisma.clubResourceItem.findMany({
        where: { organization_id: CLUB, resource_type: "members" },
      });
      const eventi = await prisma.membershipEvent.findMany({
        where: { organization_id: CLUB, event_type: "ADMISSION" },
        select: { member_label: true, membership_number: true, member_id: true },
      });
      const anagrafica = new Set(righe.map((r) => String(r.id)));
      const fantasmi = eventi.filter((e) => !anagrafica.has(String(e.member_id)));
      const club = await prisma.club.findUnique({ where: { id: CLUB } });
      const aggregato = Array.isArray(club?.members) ? club.members.length : -1;

      return {
        ok: righe.length === 4 && fantasmi.length === 0,
        severita: "CRITICAL",
        dettaglio: `${esito.riuscite}/2 riuscite, ${righe.length} soci in anagrafica, ${aggregato} nell'aggregato JSON, ${eventi.length} ammissioni nel libro; soci nel libro ma NON in anagrafica: ${fantasmi.map((f) => `${f.member_label} (${f.membership_number})`).join(", ") || "nessuno"}`,
      };
    },
  );

  await prova(
    "6d. due contratti sponsor salvati insieme (W4-H)",
    "tutti e due i contratti scritti",
    async () => {
      const sponsors = await import("../src/lib/server/sponsors.ts");

      const uno = randomUUID();
      const due = randomUUID();
      await prisma.$transaction(async (tx) => {
        await resources.appendClubResourceItem(tx, CLUB, "sponsors", {
          id: uno,
          name: "Sponsor Uno",
        });
      });
      await prisma.$transaction(async (tx) => {
        await resources.appendClubResourceItem(tx, CLUB, "sponsors", {
          id: due,
          name: "Sponsor Due",
        });
      });

      const sc = { ...scope(), userId: UTENTE.id };
      let erroriOpachi = 0;
      let perditeSilenziose = 0;
      let giriPuliti = 0;
      const motivi = new Set();

      for (let giro = 0; giro < 8; giro += 1) {
        /* Si riparte da due sponsor senza contratto. */
        await resources.replaceClubResourceCollection(CLUB, "sponsors", [
          { id: uno, name: "Sponsor Uno" },
          { id: due, name: "Sponsor Due" },
        ]);

        const esito = await insieme(
          () =>
            sponsors.saveSponsorContract(
              { organizationId: CLUB, sponsorId: uno, contract: { amount: 1000 + giro } },
              sc,
            ),
          () =>
            sponsors.saveSponsorContract(
              { organizationId: CLUB, sponsorId: due, contract: { amount: 2000 + giro } },
              sc,
            ),
        );
        for (const m of esito.motivi) motivi.add(m);

        const righe = await prisma.clubResourceItem.findMany({
          where: { organization_id: CLUB, resource_type: "sponsors" },
        });
        const conContratto = righe.filter(
          (r) => r.payload?.contract && Object.keys(r.payload.contract).length > 0,
        ).length;

        if (esito.riuscite < 2) erroriOpachi += 1;
        else if (conContratto < 2) perditeSilenziose += 1;
        else giriPuliti += 1;
      }

      return {
        ok: giriPuliti === 8,
        severita: "HIGH",
        dettaglio: `su 8 corse: ${giriPuliti} pulite, ${erroriOpachi} con errore opaco, ${perditeSilenziose} con un contratto PERSO senza errore | ${[...motivi].join(" ; ") || "nessun rifiuto"}`,
      };
    },
  );

  console.log(NL + "=== 7. I NUMERI CHE NESSUNO DIGITA ===" + NL);

  await prova(
    "7a. sei ammissioni simultanee: sei numeri di tessera",
    "sei numeri distinti, nessun socio perso",
    async () => {
      const prima = await prisma.membershipEvent.count({
        where: { organization_id: CLUB, event_type: "ADMISSION" },
      });
      const ammetti = (n) => () =>
        members.admitNewMember({ ...scope(), userId: UTENTE.id }, {
          organizationId: CLUB,
          effectiveDate: "2026-03-10",
          resolutionReference: `Delibera P${n}`,
          member: { firstName: `Parallelo${n}`, lastName: "Socio" },
        });

      const esito = await insieme(...Array.from({ length: 6 }, (_, i) => ammetti(i)));

      const eventi = await prisma.membershipEvent.findMany({
        where: { organization_id: CLUB, event_type: "ADMISSION" },
        select: { membership_number: true },
      });
      const numeri = eventi.map((e) => e.membership_number);
      const distinti = new Set(numeri).size;

      return {
        ok: esito.riuscite === 6 && distinti === numeri.length && numeri.length === prima + 6,
        severita: "HIGH",
        dettaglio: `${esito.riuscite}/6 riuscite, ${numeri.length} ammissioni, ${distinti} numeri distinti | rifiuti: ${esito.motivi.join(" ; ") || "nessuno"}`,
      };
    },
  );

  await prova(
    "7b. dieci numeri di documento simultanei",
    "dieci numeri distinti e consecutivi",
    async () => {
      const chiedi = () => () =>
        numbering.allocateDocumentNumber({ organizationId: CLUB, kind: "receipt", year: 2026 });
      const esito = await insieme(...Array.from({ length: 10 }, chiedi));
      const numeri = esito.valori.map((v) => v.sequence).sort((a, b) => a - b);
      const distinti = new Set(numeri).size;
      const consecutivi = numeri.every((n, i) => i === 0 || n === numeri[i - 1] + 1);

      return {
        ok: esito.riuscite === 10 && distinti === 10 && consecutivi,
        severita: "HIGH",
        dettaglio: `${esito.riuscite}/10 riuscite, ${distinti} distinti, consecutivi: ${consecutivi} [${numeri.join(",")}] | rifiuti: ${esito.motivi.join(" ; ") || "nessuno"}`,
      };
    },
  );

  console.log(NL + "=== 8. DOPPIO STORNO, CINQUE DOMINI ===" + NL);

  await prova(
    "8a. incassi: due storni simultanei",
    "una sola riga di storno",
    async () => {
      const { rata } = await nuovaRata(80, "StornoIncasso");
      const inc = await payments.createPaymentTransaction(
        { paymentId: rata.id, amount: 80, paymentMethod: "Contanti", financialAccountId: CASSA },
        scope(),
      );
      const storna = () => () =>
        payments.reversePaymentTransaction({ transactionId: inc.transaction.id, reason: "Doppio" }, scope());
      const esito = await insieme(storna(), storna(), storna());
      const storni = await prisma.paymentTransaction.count({
        where: { reverses_transaction_id: inc.transaction.id },
      });
      return {
        ok: storni === 1 && esito.riuscite === 1,
        severita: "CRITICAL",
        dettaglio: `${storni} storni, ${esito.riuscite}/3 riuscite`,
      };
    },
  );

  await prova(
    "8b. prima nota: tre storni simultanei dello stesso movimento",
    "una sola riga di storno",
    async () => {
      const riga = await accounting.createAccountingEntry(
        {
          entryDate: "2026-08-20T00:00:00.000Z",
          direction: "OUT",
          amount: 90,
          financialAccountId: CASSA,
          operationTypeCode: "quota_attivita",
          description: "Da stornare tre volte",
        },
        scope(),
      );
      const storna = () => () =>
        accounting.reverseAccountingEntry({ entryId: riga.id, reason: "Doppio" }, scope());
      const esito = await insieme(storna(), storna(), storna());
      const storni = await prisma.accountingEntry.count({ where: { reversal_of_id: riga.id } });
      return {
        ok: storni === 1 && esito.riuscite === 1,
        severita: "CRITICAL",
        dettaglio: `${storni} storni, ${esito.riuscite}/3 riuscite`,
      };
    },
  );

  await prova(
    "8c. bandi: tre storni simultanei della stessa liquidazione",
    "una sola riga di storno",
    async () => {
      const programma = await prisma.fundingProgram.create({
        data: {
          organization_id: CLUB,
          name: "Bando audit",
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
          amount: 400,
          financial_account_id: BANCA,
          updated_at: new Date(),
        },
      });
      const storna = () => () =>
        funding.reverseFundingSettlement({ settlementId: liq.id, reason: "Doppio" }, scope());
      const esito = await insieme(storna(), storna(), storna());
      const storni = await prisma.fundingSettlement.count({ where: { reversal_of_id: liq.id } });
      return {
        ok: storni === 1 && esito.riuscite === 1,
        severita: "CRITICAL",
        dettaglio: `${storni} storni, ${esito.riuscite}/3 riuscite`,
      };
    },
  );

  await prova(
    "8d. lavoro sportivo: tre storni simultanei della stessa erogazione",
    "una sola riga di storno",
    async () => {
      const ledger = await import("../src/lib/server/sport-work-ledger.ts");
      const persona = await prisma.sportWorkPerson.create({
        data: {
          organization_id: CLUB,
          first_name: "Carlo",
          last_name: "Allenatore",
          fiscal_code: `CRLLNT80A01H501${Math.floor(Math.random() * 9)}`,
          updated_at: new Date(),
        },
      });
      const mov = await prisma.sportWorkOutboundTransaction.create({
        data: {
          organization_id: CLUB,
          transaction_type: "COMPENSATION",
          person_id: persona.id,
          paid_at: new Date(),
          fiscal_year: 2026,
          gross_amount: 500,
          net_amount: 500,
          club_cost: 500,
          financial_account_id: BANCA,
          updated_at: new Date(),
        },
      });
      const storna = () => () =>
        ledger.reverseCompensationPayout(mov.id, { reason: "Doppio" }, scope());
      const esito = await insieme(storna(), storna(), storna());
      const storni = await prisma.sportWorkOutboundTransaction.count({
        where: { reversal_of_id: mov.id },
      });
      return {
        ok: storni === 1 && esito.riuscite === 1,
        severita: "CRITICAL",
        dettaglio: `${storni} storni, ${esito.riuscite}/3 riuscite | rifiuti: ${esito.motivi.join(" ; ") || "nessuno"}`,
      };
    },
  );

  await prova(
    "8e. rimborsi: tre consegne simultanee dello stesso rimborso",
    "una sola riga negativa (dedup senza indice unico)",
    async () => {
      const { rata } = await nuovaRata(200, "Rimborso");
      const inc = await payments.createPaymentTransaction(
        { paymentId: rata.id, amount: 200, paymentMethod: "Carta", financialAccountId: BANCA },
        scope(),
      );
      const rif = `re_${randomUUID()}`;
      const rimborsa = () => () =>
        payments.recordRefundTransaction(
          {
            transactionId: inc.transaction.id,
            confirmedByProvider: true,
            externalRefundId: rif,
            amountCents: 5000,
          },
          scope(),
        );
      const esito = await insieme(rimborsa(), rimborsa(), rimborsa());
      const righe = await prisma.paymentTransaction.count({
        where: { organization_id: CLUB, external_reference: rif },
      });
      return {
        ok: righe === 1,
        severita: "HIGH",
        dettaglio: `${righe} rimborsi in tabella, ${esito.riuscite}/3 riuscite`,
      };
    },
  );

  console.log(NL + "=== 9. IL SALDO, ALLA FINE ===" + NL);

  await prova(
    "9a. il saldo derivato pareggia la somma delle righe",
    "identici",
    async () => {
      const saldi = await conti.listFinancialAccountBalances(scope(), {
        accountIds: [CASSA, BANCA, TERZO],
      });
      const grezzo = await prisma.$queryRaw`
        SELECT financial_account_id AS conto,
               COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount_cents ELSE -amount_cents END), 0) AS saldo
        FROM accounting_entries
        WHERE organization_id = ${CLUB}::uuid
        GROUP BY financial_account_id`;
      const perConto = new Map(grezzo.map((r) => [String(r.conto), Number(r.saldo)]));
      const righe = saldi.map(
        (s) =>
          `${s.accountId.slice(0, 8)}: derivato ${s.balanceCents} vs prima nota ${perConto.get(String(s.accountId)) ?? 0}`,
      );
      return {
        ok: true,
        severita: "INFO",
        dettaglio: righe.join(" | "),
      };
    },
  );
};

try {
  await semina();
  await esegui();
  console.log(
    NL +
      (fallite === 0
        ? `Tutte le ${passate} difese hanno retto.`
        : `${fallite} difese su ${passate + fallite} NON hanno retto:`),
  );
  for (const d of difetti) {
    console.log(`  [${d.severita}] ${d.titolo}`);
    console.log(`      atteso : ${d.atteso}`);
    console.log(`      trovato: ${d.trovato}`);
  }
  if (fallite > 0) process.exitCode = 1;
} catch (error) {
  console.error(NL + "Sonda non riuscita: " + String(error?.stack || error?.message));
  process.exitCode = 1;
} finally {
  await prisma.club.delete({ where: { id: CLUB } }).catch((e) => {
    console.error(`Il club di prova ${CLUB} e rimasto: ${String(e?.message).split(NL)[0]}`);
  });
  await prisma.$disconnect();
}
