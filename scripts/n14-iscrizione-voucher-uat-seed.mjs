/**
 * **Il club di collaudo per la UAT a schermo della scheda «Iscrizione»** (N14).
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/n14-iscrizione-voucher-uat-seed.mjs
 *
 * ---
 *
 * ## Perche esiste
 *
 * Le sonde di N12/N13 attaccano il servizio e non aprono nessuna schermata. La
 * verifica chiesta dal mandato — i sette numeri, i pulsanti raggiungibili, e la
 * responsivita a **375 / 768 / 1280 / 1440 px** — si fa con un browser e una
 * sessione vera, e per averla serve un atleta con dentro **esattamente** lo
 * scenario 1 del mandato:
 *
 * ```
 * Quota 600 · Voucher 500 · 3 rate da 200
 * Coperture   150 + 200 + 150
 * Famiglia     50 +   0 +  50
 * ```
 *
 * Con un versamento di 50 sulla prima rata, cosi il riepilogo mostra tutti e
 * sette i numeri diversi da zero tranne il liquidato — che e proprio il caso
 * in cui la scheda deve dire «previsto 500, maturato 100, liquidato 0» senza
 * confonderli (scenario 6).
 *
 * ## I tre atleti
 *
 * | Atleta | A cosa serve |
 * |---|---|
 * | **Anna** | lo scenario 1 completo: piano, voucher, coperture, un incasso |
 * | **Bruno** | un voucher assegnato e **nessuna copertura**: il caso in cui «Annulla assegnazione» deve esserci (scenario 2) |
 * | **Carla** | un piano **senza** voucher: il riepilogo deve ridursi a quattro numeri |
 *
 * E il programma di Anna non ha requisito di frequenza: e il caso C di N10/N11,
 * quello in cui la scheda non deve scrivere «Requisito 0 ore».
 *
 * ## L'utenza
 *
 * | Ruolo | Email | Password |
 * |---|---|---|
 * | Proprietario | `n14-uat-presidente@example.invalid` | `CollaudoN14!` |
 *
 * Rieseguirlo **rifa da capo** il proprio club (slug `n14-uat`) e lascia stare
 * tutto il resto del database.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("Rifiuto: serve EASYGAME_DB_ENV=development.");
  process.exit(1);
}

const prisma = new PrismaClient();

const SLUG = "n14-uat";
const PASSWORD = "CollaudoN14!";
const CLUB = "11111111-1111-4111-8111-111111111111";
const ANNA = "22222222-2222-4222-8222-222222222221";
const BRUNO = "22222222-2222-4222-8222-222222222222";
const CARLA = "22222222-2222-4222-8222-222222222223";

const giorno = (delta) => {
  const data = new Date();
  data.setHours(12, 0, 0, 0);
  data.setDate(data.getDate() + delta);
  return data;
};

const utente = async (email, first_name, last_name) => {
  const password_hash = await bcrypt.hash(PASSWORD, 10);
  const esistente = await prisma.user.findUnique({ where: { email } });

  if (esistente) {
    return prisma.user.update({
      where: { id: esistente.id },
      data: {
        password_hash,
        first_name,
        last_name,
        email_verified_at: new Date(),
      },
    });
  }

  return prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      first_name,
      last_name,
      password_hash,
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const main = async () => {
  /* Si rifa da capo: un collaudo che parte da uno stato ignoto non e un collaudo. */
  await prisma.club.deleteMany({ where: { slug: SLUG } });

  const presidente = await utente(
    "n14-uat-presidente@example.invalid",
    "Paola",
    "Presidente",
  );

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: SLUG,
      name: "ASD Collaudo Voucher",
      categories: [
        { id: "cat-n14-u15", name: "Under 15", ageGroup: "U15" },
      ],
      creator: { connect: { id: presidente.id } },
    },
  });

  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: presidente.id,
      role: "owner",
      is_primary: true,
      updated_at: new Date(),
    },
  });

  const atleta = (id, first_name, last_name) =>
    prisma.athlete.create({
      data: {
        id,
        organization_id: CLUB,
        first_name,
        last_name,
        status: "active",
        data: {
          categoryId: "cat-n14-u15",
          category: "Under 15",
          enrollmentStatus: true,
          enrollmentDate: giorno(-60).toISOString(),
        },
      },
    });

  await atleta(ANNA, "Anna", "Coperta");
  await atleta(BRUNO, "Bruno", "Assegnato");
  await atleta(CARLA, "Carla", "Senzavoucher");

  /*
    **Il bando senza requisito di frequenza** (caso C di N10/N11): la scheda non
    deve scrivere «Requisito 0 ore» ne «con almeno 0 ore».
  */
  const programma = await prisma.fundingProgram.create({
    data: {
      organization_id: CLUB,
      name: "Voucher Sport e Salute 2026",
      funder_name: "Regione",
      status: "active",
      valid_from: giorno(-120),
      valid_to: giorno(180),
      athlete_plafond: 800,
      period_amount: 100,
      period_frequency: "monthly",
      requirement_unit: "hours",
      requirement_min: 0,
      unmet_behavior: "none",
      accrual_source: "easygame_attendance",
    },
  });

  /* E un secondo bando **con** requisito, per vedere anche il caso A. */
  const conRequisito = await prisma.fundingProgram.create({
    data: {
      organization_id: CLUB,
      name: "Contributo Comunale 2026",
      funder_name: "Comune",
      status: "active",
      valid_from: giorno(-120),
      valid_to: giorno(180),
      athlete_plafond: 400,
      period_amount: 50,
      period_frequency: "monthly",
      requirement_unit: "hours",
      requirement_min: 10,
      unmet_behavior: "none",
      accrual_source: "external_confirmation",
    },
  });

  const adesioneAnna = await prisma.fundingEnrollment.create({
    data: {
      organization_id: CLUB,
      program_id: programma.id,
      athlete_id: ANNA,
      voucher_code: "RL-2026-0042",
      assigned_amount: 500,
      status: "active",
      enrolled_at: giorno(-60),
    },
  });

  const adesioneBruno = await prisma.fundingEnrollment.create({
    data: {
      organization_id: CLUB,
      program_id: conRequisito.id,
      athlete_id: BRUNO,
      voucher_code: "CM-2026-0007",
      assigned_amount: 300,
      status: "active",
      enrolled_at: giorno(-30),
    },
  });

  /* Le tre rate da 200 dello scenario 1, piu il piano di Carla. */
  const rata = (athlete_id, numero, giorni) =>
    prisma.athletePayment.create({
      data: {
        organization_id: CLUB,
        athlete_id,
        description: `Rata ${numero} — quota annuale`,
        amount: 200,
        due_date: giorno(giorni),
        status: "pending",
        data: {},
      },
    });

  const rate = [
    await rata(ANNA, 1, -30),
    await rata(ANNA, 2, 15),
    await rata(ANNA, 3, 60),
  ];

  await rata(CARLA, 1, -10);
  await rata(CARLA, 2, 45);
  await rata(CARLA, 3, 90);

  /* Coperture 150 / 200 / 150, che fanno 500: l'intero voucher di Anna. */
  const coperture = [150, 200, 150];
  for (let indice = 0; indice < rate.length; indice += 1) {
    await prisma.paymentCoverageAllocation.create({
      data: {
        organization_id: CLUB,
        payment_id: rate[indice].id,
        enrollment_id: adesioneAnna.id,
        athlete_id: ANNA,
        amount: coperture[indice],
        created_by: presidente.id,
        data: {},
      },
    });
  }

  /*
    **Un solo periodo maturato su cinque.** Serve allo scenario 6: la scheda
    deve poter dire «previsto 500 · maturato 100 · liquidato 0» senza che i tre
    numeri si confondano.
  */
  await prisma.fundingAccrual.create({
    data: {
      organization_id: CLUB,
      enrollment_id: adesioneAnna.id,
      period_index: 0,
      period_start: giorno(-120),
      period_end: giorno(-91),
      period_label: "primo periodo",
      requirement_min: 0,
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
      data: { reason: "Requisito raggiunto", attendanceMeasured: true },
    },
  });

  /*
    **Il versamento di 50 sulla prima rata** (scenario 7): la famiglia paga la
    sua quota mentre il voucher non e ancora maturato per intero, e i due fatti
    non devono contarsi a vicenda.
  */
  await prisma.paymentTransaction.create({
    data: {
      organization_id: CLUB,
      payment_id: rate[0].id,
      athlete_id: ANNA,
      amount: 50,
      payment_method: "cash",
      source: "MANUAL",
      paid_at: giorno(-25),
      created_by: presidente.id,
      data: {},
    },
  });

  console.log("\nClub di collaudo N14 seminato.\n");
  console.log(`  URL locale     http://127.0.0.1:3001`);
  console.log(`  Utenza         n14-uat-presidente@example.invalid / ${PASSWORD}`);
  console.log(`  Club           ${CLUB}`);
  console.log(`  Anna  (scenario 1, 6, 7)   /athletes/${ANNA}`);
  console.log(`  Bruno (scenario 2: annullabile)  /athletes/${BRUNO}`);
  console.log(`  Carla (piano senza voucher)      /athletes/${CARLA}`);
  console.log(`  Adesione Anna  ${adesioneAnna.id}`);
  console.log(`  Adesione Bruno ${adesioneBruno.id}\n`);
};

main()
  .catch((errore) => {
    console.error("Semina non riuscita:", errore);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
