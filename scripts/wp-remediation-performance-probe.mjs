/**
 * **Weekly Program & Training Automation — performance a scala realistica**
 * (WP-20).
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/wp-remediation-performance-probe.mjs
 *
 * Un club con 20 categorie, 50 voci di programma settimanale su 3 strutture
 * (piu campi ciascuna), generazione automatica (21 giorni) e "Genera fino a"
 * a 90 giorni. Misura query, durata, eventi creati, conflitti — non accetta
 * di scoprirlo in produzione.
 *
 * Il file non tocca una riga di produzione: crea un club suo e lo cancella
 * in `finally`.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("Rifiuto: serve EASYGAME_DB_ENV=development.");
  process.exit(1);
}

const prisma = new PrismaClient({
  log: [{ emit: "event", level: "query" }],
});

let contaQuery = 0;
prisma.$on("query", () => {
  contaQuery += 1;
});

const carica = (rel) => import(pathToFileURL(path.resolve(rel)).href);

/*
  `training-automation.ts`/`events.ts` parlano con il client esportato da
  `src/lib/server/prisma.ts`, non con quello di questo script: senza questo
  scambio il conteggio delle query misurerebbe un client che nessuno usa
  davvero, e leggerebbe sempre zero.
*/
const { __setPrismaClientForTests } = await carica("src/lib/server/prisma.ts");
__setPrismaClientForTests(prisma);

const CLUB = randomUUID();
let PRESIDENTE = null;

const GIORNI = [
  "Lunedì",
  "Martedì",
  "Mercoledì",
  "Giovedì",
  "Venerdì",
  "Sabato",
  "Domenica",
];

const pulisciResidui = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "wpperf-" } },
    select: { id: true },
  });
  const ids = residui.map((riga) => riga.id);
  if (!ids.length) return;
  await prisma.auditLog
    .deleteMany({ where: { organization_id: { in: ids } } })
    .catch(() => {});
  await prisma.club.deleteMany({ where: { id: { in: ids } } });
};

const semina = async () => {
  await pulisciResidui();

  PRESIDENTE = await prisma.user.upsert({
    where: { email: "wpperf-presidente@collaudo.local" },
    update: {},
    create: {
      id: randomUUID(),
      email: "wpperf-presidente@collaudo.local",
      first_name: "Presidente",
      last_name: "Collaudo",
      password_hash: "$2b$10$wpperf",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });

  // 20 categorie.
  const categorie = Array.from({ length: 20 }, (_, i) => ({
    id: `cat-${i + 1}`,
    name: `Categoria ${i + 1}`,
  }));

  // 3 strutture, 4 campi ciascuna: 12 risorse in tutto.
  const strutture = Array.from({ length: 3 }, (_, s) => ({
    id: `struttura-${s + 1}`,
    name: `Struttura ${s + 1}`,
    fields: Array.from({ length: 4 }, (_, f) => ({
      id: `struttura-${s + 1}-campo-${f + 1}`,
      name: `Campo ${f + 1}`,
    })),
  }));

  // 50 voci di programma: distribuite su tutti i giorni, categorie, campi.
  const weeklySchedule = Array.from({ length: 50 }, (_, i) => {
    const struttura = strutture[i % strutture.length];
    const campo = struttura.fields[i % struttura.fields.length];
    const oraBase = 16 + (i % 6); // 16..21
    return {
      id: `slot-${i + 1}`,
      day: GIORNI[i % GIORNI.length],
      startTime: `${String(oraBase).padStart(2, "0")}:00`,
      endTime: `${String(oraBase + 1).padStart(2, "0")}:30`,
      categoryId: categorie[i % categorie.length].id,
      trainerIds: [PRESIDENTE.id],
      structureId: struttura.id,
      locationId: campo.id,
      location: campo.name,
    };
  });

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: "wpperf-club",
      name: "Club performance",
      creator_id: PRESIDENTE.id,
      categories: categorie,
      structures: strutture,
      trainers: [{ id: PRESIDENTE.id, name: "Mister", linkedUserId: PRESIDENTE.id }],
      weekly_schedule: weeklySchedule,
      trainings: [],
      settings: { trainingAutomation: { enabled: true, generateDaysAhead: 21 } },
      updated_at: new Date(),
    },
  });
  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: PRESIDENTE.id,
      role: "owner",
      is_primary: false,
      updated_at: new Date(),
    },
  });
};

const misura = async (etichetta, azione) => {
  const queryPrima = contaQuery;
  const inizio = performance.now();
  const risultato = await azione();
  const durataMs = Math.round(performance.now() - inizio);
  const query = contaQuery - queryPrima;
  console.log(
    `  ${etichetta.padEnd(46)} ${String(durataMs).padStart(6)} ms   ${String(query).padStart(4)} query   creati=${risultato.generatedCount ?? "-"}  conflitti=${risultato.conflicts?.length ?? "-"}  esistenti=${risultato.existingCount ?? "-"}  esclusi=${risultato.excludedCount ?? "-"}`,
  );
  return { risultato, durataMs, query };
};

const main = async () => {
  console.log("");
  console.log("  Weekly Program & Training Automation — performance (WP-20)");
  console.log("  20 categorie, 50 voci di programma, 3 strutture x 4 campi");
  console.log("  ------------------------------------------------------------");

  try {
    await semina();
    const automazione = await carica("src/lib/server/training-automation.ts");

    const { durataMs: msRolling, query: qRolling } = await misura(
      "Generazione automatica (rolling, 21 giorni)",
      () => automazione.runTrainingAutomationForClub(CLUB, { force: true }),
    );

    const untilDate = new Date();
    untilDate.setDate(untilDate.getDate() + 90);
    const { durataMs: msFinoA90, query: qFinoA90 } = await misura(
      "«Genera fino a» 90 giorni (anteprima)",
      () =>
        automazione.runTrainingAutomationForClub(CLUB, {
          force: true,
          untilDate: untilDate.toISOString().slice(0, 10),
          preview: true,
        }),
    );

    const { durataMs: msFinoA90Reale } = await misura(
      "«Genera fino a» 90 giorni (esecuzione reale)",
      () =>
        automazione.runTrainingAutomationForClub(CLUB, {
          force: true,
          untilDate: untilDate.toISOString().slice(0, 10),
        }),
    );

    const righeFinali = await prisma.clubEvent.count({
      where: { organization_id: CLUB, kind: "training" },
    });

    console.log("");
    console.log(`  Righe finali in club_events: ${righeFinali}`);
    console.log("");
    console.log("  Soglie di riferimento (non un limite duro, un campanello):");
    console.log(
      `  - rolling 21gg:  ${qRolling} query, ${msRolling} ms  ${qRolling > 200 || msRolling > 5000 ? "⚠ oltre la soglia attesa" : "entro la soglia attesa"}`,
    );
    console.log(
      `  - fino a 90gg:   ${qFinoA90} query, ${msFinoA90} ms (anteprima), ${msFinoA90Reale} ms (esecuzione)  ${qFinoA90 > 400 || msFinoA90 > 10000 ? "⚠ oltre la soglia attesa" : "entro la soglia attesa"}`,
    );

    if (qRolling > 200 || msRolling > 5000 || qFinoA90 > 400 || msFinoA90 > 10000) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.auditLog
      .deleteMany({ where: { organization_id: CLUB } })
      .catch(() => {});
    await prisma.club.deleteMany({ where: { id: CLUB } }).catch(() => {});
    await prisma.$disconnect();
  }
};

main().catch(async (errore) => {
  console.error(errore);
  await prisma.club.deleteMany({ where: { id: CLUB } }).catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
