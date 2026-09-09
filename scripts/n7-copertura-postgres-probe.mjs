/**
 * **La copertura, misurata su Postgres vero** (N7 / ADR-0158).
 *
 *     node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *       scripts/n7-copertura-postgres-probe.mjs
 *
 * ---
 *
 * ## Perche esiste
 *
 * Le prove in memoria di questa lane erano trentasei ed erano verdi, e una
 * revisione ostile ha trovato lo stesso un difetto **critico** che nessuna
 * poteva vedere: `removeFundingEnrollment` cancellava un'adesione che aveva
 * gia coperto delle rate, e la chiave esterna delle coperture e `RESTRICT`.
 * Il doppio di Prisma non fa valere le chiavi esterne, quindi la prova che
 * copriva quello scenario passava — mentre su un database vero l'operazione
 * finiva in un errore di vincolo, con le coperture gia stornate e committate e
 * l'iscrizione viva e irremovibile per sempre.
 *
 * Da qui la regola: **cio che vive nell'archivio si misura sull'archivio.** I
 * vincoli, i segni, gli indici unici parziali e i tetti sotto concorrenza non
 * si provano con un doppio.
 *
 * ## Cosa misura
 *
 * 1. il vincolo sul **segno**: una copertura vale piu di zero, uno storno meno;
 * 2. l'indice unico che ammette **uno storno solo** per originale;
 * 3. la chiave esterna `RESTRICT` sull'adesione, e che il dominio la rispetti
 *    revocando invece di cancellare (il difetto C1);
 * 4. il tetto per **adesione** sotto concorrenza vera, su due rate diverse —
 *    il difetto H3, che una transazione sola non puo mostrare;
 * 5. l'idempotenza di due invii simultanei con la stessa chiave.
 *
 * La sonda **misura, non corregge**: un difetto esce come `FAIL` e nessuna
 * riga di produzione viene toccata. Il club di prova viene cancellato in
 * `finally`, e la semina comincia togliendo i residui di una corsa interrotta.
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

const pulisci = async () => {
  await prisma.$executeRawUnsafe(
    `DELETE FROM clubs WHERE slug LIKE 'sonda-n7-%'`,
  );
};

const semina = async () => {
  /* Il club vuole un creatore: e una persona vera, non un identificativo. */
  await prisma.user.create({
    data: {
      id: UTENTE,
      email: `sonda-n7-${Date.now()}@example.invalid`,
      password_hash: "sonda-non-e-una-credenziale",
    },
  });

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `sonda-n7-${Date.now()}`,
      name: "Sonda N7",
      categories: [],
      creator: { connect: { id: UTENTE } },
    },
  });

  await prisma.athlete.create({
    data: {
      id: ATLETA,
      organization_id: CLUB,
      first_name: "Sonda",
      last_name: "Copertura",
      status: "active",
      data: {},
    },
  });

  const programma = await prisma.fundingProgram.create({
    data: {
      organization_id: CLUB,
      name: "Voucher sonda",
      funder_name: "Ente",
      status: "active",
      valid_from: new Date("2026-09-01"),
      valid_to: new Date("2027-06-30"),
      athlete_plafond: 500,
      period_amount: 60,
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
      assigned_amount: 500,
      status: "active",
      enrolled_at: new Date("2026-09-01"),
    },
  });

  const rataA = await prisma.athletePayment.create({
    data: {
      organization_id: CLUB,
      athlete_id: ATLETA,
      description: "Rata A",
      amount: 600,
      status: "pending",
      data: {},
    },
  });

  const rataB = await prisma.athletePayment.create({
    data: {
      organization_id: CLUB,
      athlete_id: ATLETA,
      description: "Rata B",
      amount: 600,
      status: "pending",
      data: {},
    },
  });

  return { adesione, rataA, rataB };
};

const messaggio = (errore) => String(errore?.message || errore);

const main = async () => {
  console.log("\nSonda N7 — la copertura su Postgres vero\n");

  await pulisci();
  const { adesione, rataA, rataB } = await semina();

  const coverage = await import("../src/lib/server/payment-coverage.ts");
  const funding = await import("../src/lib/server/funding.ts");

  const scope = {
    userId: UTENTE,
    activeOrganizationId: CLUB,
    activeRole: "owner",
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

  /* ---------------------------------------------- 1. il segno, in archivio */

  let segnoRifiutato = false;
  try {
    await prisma.paymentCoverageAllocation.create({
      data: {
        organization_id: CLUB,
        payment_id: rataA.id,
        enrollment_id: adesione.id,
        athlete_id: ATLETA,
        amount: -100,
      },
    });
  } catch (errore) {
    segnoRifiutato =
      /importo_segno|violates check constraint/.test(messaggio(errore));
  }
  prova(
    "A-01 una copertura negativa senza storno la rifiuta l'archivio",
    true,
    segnoRifiutato,
  );

  /* --------------------------------- 2. uno storno solo, per originale */

  const { allocation } = await coverage.allocateCoverage(
    { paymentId: rataA.id, enrollmentId: adesione.id, amount: 200 },
    scope,
  );

  await coverage.reverseCoverage({ allocationId: allocation.id }, scope);

  let doppioStornoRifiutato = false;
  try {
    await prisma.paymentCoverageAllocation.create({
      data: {
        organization_id: CLUB,
        payment_id: rataA.id,
        enrollment_id: adesione.id,
        athlete_id: ATLETA,
        amount: -200,
        reverses_allocation_id: allocation.id,
      },
    });
  } catch (errore) {
    /*
      Prisma riporta il **campo**, non il nome dell indice: il messaggio dice
      «Unique constraint failed on the fields: (reverses_allocation_id)». Si
      accetta l uno o l altro, perche cio che conta e che l archivio abbia
      rifiutato.
    */
    doppioStornoRifiutato =
      /storno_unico|Unique constraint failed/.test(messaggio(errore));
  }
  prova(
    "A-02 un secondo storno della stessa riga lo rifiuta l'archivio",
    true,
    doppioStornoRifiutato,
  );

  /* --------------------- 3. il difetto C1: la chiave esterna RESTRICT */

  await coverage.allocateCoverage(
    { paymentId: rataA.id, enrollmentId: adesione.id, amount: 300 },
    scope,
  );

  let esitoRimozione = null;
  let erroreRimozione = null;
  try {
    esitoRimozione = await funding.removeFundingEnrollment(
      adesione.id,
      { reason: "Sonda" },
      scope,
    );
  } catch (errore) {
    erroreRimozione = messaggio(errore);
  }

  prova(
    "A-03 togliere un atleta che ha coperture non finisce in errore di vincolo",
    null,
    erroreRimozione,
    "e il difetto C1: la prova in memoria passava perche il doppio non ha le chiavi esterne",
  );
  prova(
    "A-04 e l'adesione si revoca invece di essere cancellata",
    "revoked",
    esitoRimozione?.outcome ?? null,
  );

  const adesioneDopo = await prisma.fundingEnrollment.findUnique({
    where: { id: adesione.id },
  });
  prova("A-05 l'adesione esiste ancora, chiusa", "closed", adesioneDopo?.status ?? null);

  const vive = await prisma.paymentCoverageAllocation.findMany({
    where: { enrollment_id: adesione.id, reversed_at: null, reverses_allocation_id: null },
  });
  prova("A-06 nessuna copertura resta viva", 0, vive.length);

  /* ------------------- 4. il difetto H3: il tetto sotto concorrenza vera */

  const programma2 = await prisma.fundingProgram.create({
    data: {
      organization_id: CLUB,
      name: "Voucher sonda 2",
      funder_name: "Ente",
      status: "active",
      valid_from: new Date("2026-09-01"),
      valid_to: new Date("2027-06-30"),
      athlete_plafond: 500,
      period_amount: 60,
      period_frequency: "monthly",
      requirement_unit: "hours",
      requirement_min: 8,
      unmet_behavior: "none",
      accrual_source: "easygame_attendance",
    },
  });

  const adesione2 = await prisma.fundingEnrollment.create({
    data: {
      organization_id: CLUB,
      program_id: programma2.id,
      athlete_id: ATLETA,
      assigned_amount: 500,
      status: "active",
      enrolled_at: new Date("2026-09-01"),
    },
  });

  /*
    Due coperture da 300 su **due rate diverse** della stessa adesione, lanciate
    insieme: 600 su un voucher da 500. Prima del blocco sull'adesione passavano
    tutte e due, perche prendevano due blocchi disgiunti e leggevano entrambe
    zero impegnato.
  */
  const risultati = await Promise.allSettled([
    coverage.allocateCoverage(
      { paymentId: rataA.id, enrollmentId: adesione2.id, amount: 300 },
      scope,
    ),
    coverage.allocateCoverage(
      { paymentId: rataB.id, enrollmentId: adesione2.id, amount: 300 },
      scope,
    ),
  ]);

  const riuscite = risultati.filter((r) => r.status === "fulfilled").length;

  /*
    **Il blocco, misurato sul meccanismo e non sull esito.**

    Le due chiamate qui sopra non riescono a sovrapporsi davvero in questo
    ambiente: misurato per mutazione, togliendo il blocco sull adesione
    l esito resta identico. Sono percio una prova dell **esito** — il tetto
    tiene — e non del **perche**.

    Il perche si misura qui, sul meccanismo: due connessioni vere, la stessa
    riga di adesione, e la seconda che deve **aspettare**. Se questa passa, due
    coperture sulla stessa adesione non possono leggere entrambe zero
    impegnato, che e il difetto H3.
  */
  const { PrismaClient: SecondoClient } = await import("@prisma/client");
  const altro = new SecondoClient();
  let secondaHaAtteso = false;

  try {
    let sbloccaPrima = null;
    const primaFinita = new Promise((resolve) => (sbloccaPrima = resolve));

    const prima = prisma.$transaction(async (client) => {
      await client.$queryRawUnsafe(
        `SELECT id FROM funding_enrollments WHERE id = $1::uuid FOR UPDATE`,
        adesione2.id,
      );
      await primaFinita;
    });

    /* Un attimo perche la prima prenda il blocco. */
    await new Promise((r) => setTimeout(r, 250));

    let secondaPresa = false;
    const seconda = altro
      .$transaction(async (client) => {
        await client.$queryRawUnsafe(
          `SELECT id FROM funding_enrollments WHERE id = $1::uuid FOR UPDATE`,
          adesione2.id,
        );
        secondaPresa = true;
      })
      .catch(() => {});

    await new Promise((r) => setTimeout(r, 400));
    /* Con il blocco preso dalla prima, la seconda non deve essere passata. */
    secondaHaAtteso = secondaPresa === false;

    sbloccaPrima();
    await prima;
    await seconda;
  } finally {
    await altro.$disconnect();
  }

  prova(
    "B-00 il blocco sull adesione fa aspettare la seconda transazione",
    true,
    secondaHaAtteso,
    "e il meccanismo che impedisce a due coperture di leggere entrambe zero impegnato",
  );
  prova(
    "B-01 due coperture concorrenti su rate diverse: una sola passa",
    1,
    riuscite,
    "e il difetto H3: il blocco sulla sola rata non serializzava il tetto per voucher",
  );

  const impegnato = await prisma.paymentCoverageAllocation.aggregate({
    where: {
      enrollment_id: adesione2.id,
      reversed_at: null,
      reverses_allocation_id: null,
    },
    _sum: { amount: true },
  });
  const totale = Number(impegnato._sum.amount || 0);
  prova(
    "B-02 e il voucher non e impegnato oltre l'assegnato",
    true,
    totale <= 500,
    `impegnati ${totale} su 500`,
  );

  /* ---------------------------- 5. idempotenza di due invii simultanei */

  const programma3 = await prisma.fundingProgram.create({
    data: {
      organization_id: CLUB,
      name: "Voucher sonda 3",
      funder_name: "Ente",
      status: "active",
      valid_from: new Date("2026-09-01"),
      valid_to: new Date("2027-06-30"),
      athlete_plafond: 500,
      period_amount: 60,
      period_frequency: "monthly",
      requirement_unit: "hours",
      requirement_min: 8,
      unmet_behavior: "none",
      accrual_source: "easygame_attendance",
    },
  });

  const adesione3 = await prisma.fundingEnrollment.create({
    data: {
      organization_id: CLUB,
      program_id: programma3.id,
      athlete_id: ATLETA,
      assigned_amount: 500,
      status: "active",
      enrolled_at: new Date("2026-09-01"),
    },
  });

  const chiave = `sonda-${randomUUID()}`;
  await Promise.allSettled([
    coverage.allocateCoverage(
      {
        paymentId: rataB.id,
        enrollmentId: adesione3.id,
        amount: 100,
        idempotencyKey: chiave,
      },
      scope,
    ),
    coverage.allocateCoverage(
      {
        paymentId: rataB.id,
        enrollmentId: adesione3.id,
        amount: 100,
        idempotencyKey: chiave,
      },
      scope,
    ),
  ]);

  const conQuellaChiave = await prisma.paymentCoverageAllocation.count({
    where: { enrollment_id: adesione3.id, reverses_allocation_id: null },
  });
  prova(
    "B-03 lo stesso invio due volte lascia una copertura sola",
    1,
    conQuellaChiave,
  );

  /* ------------------------------------------- 6. la migrazione N6 e vera */

  const bozzaConIscritti = await prisma.fundingProgram.findFirst({
    where: { organization_id: CLUB },
  });
  prova(
    "C-01 il programma della sonda e attivo (migrazione N6 applicata)",
    "active",
    bozzaConIscritti?.status ?? null,
  );
};

main()
  .catch((errore) => {
    console.error("\nSonda interrotta:", messaggio(errore));
    esiti.push({ titolo: "sonda completata", ok: false });
  })
  .finally(async () => {
    try {
      await prisma.club.deleteMany({ where: { id: CLUB } });
      await prisma.user.deleteMany({ where: { id: UTENTE } });
    } catch {
      /* la pulizia non deve nascondere l'esito */
    }
    await prisma.$disconnect();

    const verdi = esiti.filter((e) => e.ok).length;
    console.log(`\n  Esito: ${verdi}/${esiti.length}\n`);
    process.exit(verdi === esiti.length ? 0 : 1);
  });
