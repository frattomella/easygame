/**
 * **Weekly Program & Training Automation — sonda su PostgreSQL vero, per le
 * proprieta che un doppio in memoria non puo misurare.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/wp-remediation-postgres-probe.mjs
 *
 * ---
 *
 * Copre tre proprieta introdotte in questo mandato che `tests/helpers/
 * fake-prisma.mjs` non puo garantire, perche sono proprieta del database:
 *
 * - **stagione** (WP-13): il filtro e in memoria, ma la lettura di
 *   `clubs.settings` e reale, e la sonda verifica che l'evento generato
 *   porti `season_id` sulla riga vera;
 * - **conflitto** (WP-07): la query di sovrapposizione e reale, contro
 *   righe vere in `club_events`;
 * - **conflitto sotto concorrenza reale**: due chiamate **simultanee** a
 *   `runTrainingAutomationForClub` sullo stesso club vergine, con due
 *   voci del programma che si sovrappongono sullo stesso campo. Il
 *   controllo intra-blocco (`rilevaConflittiSovrapposizione`) confronta
 *   ogni candidato **anche contro le altre righe dello stesso blocco**, e
 *   ogni chiamata processa l'intero programma in un colpo solo: la sonda
 *   misura se questo tiene anche quando due esecuzioni vere partono
 *   insieme, non solo quando le si chiama una alla volta.
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

const prisma = new PrismaClient();
const carica = (rel) => import(pathToFileURL(path.resolve(rel)).href);

const esiti = [];
const prova = (titolo, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ titolo, ok });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(72)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        nota: ${nota}`);
};

const CLUB_STAGIONE = randomUUID();
const CLUB_CONFLITTO = randomUUID();
const CLUB_CONCORRENZA = randomUUID();

let PRESIDENTE = null;
let automazione = null;
let eventi = null;

const pulisciResidui = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "wpprobe-" } },
    select: { id: true },
  });
  const ids = residui.map((riga) => riga.id);
  if (!ids.length) return;
  await prisma.auditLog
    .deleteMany({ where: { organization_id: { in: ids } } })
    .catch(() => {});
  await prisma.club.deleteMany({ where: { id: { in: ids } } });
};

const slot = ({ id, day, time, endTime, categoryId, fieldId }) => ({
  id,
  day,
  startTime: time,
  endTime,
  categoryId,
  trainerIds: [PRESIDENTE.id],
  structureId: "struttura-1",
  locationId: fieldId,
  location: fieldId,
});

const oggi = new Date();
const GIORNI = [
  "Domenica",
  "Lunedì",
  "Martedì",
  "Mercoledì",
  "Giovedì",
  "Venerdì",
  "Sabato",
];
// Un giorno della settimana sicuramente dentro la finestra di 21 giorni.
const GIORNO_TEST = GIORNI[(oggi.getDay() + 3) % 7];

const semina = async () => {
  await pulisciResidui();

  PRESIDENTE = await prisma.user.upsert({
    where: { email: "wpprobe-presidente@collaudo.local" },
    update: {},
    create: {
      id: randomUUID(),
      email: "wpprobe-presidente@collaudo.local",
      first_name: "Presidente",
      last_name: "Collaudo",
      password_hash: "$2b$10$wpprobe",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });

  const strutture = [
    {
      id: "struttura-1",
      name: "Palestra",
      fields: [{ id: "campo-unico", name: "Campo unico" }],
    },
  ];
  const categorie = [{ id: "u15", name: "Under 15" }];

  /* ---- club per la prova di stagione ---- */
  const oldSeasonId = "stagione-vecchia";
  const newSeasonId = "stagione-attiva";
  await prisma.club.create({
    data: {
      id: CLUB_STAGIONE,
      slug: "wpprobe-stagione",
      name: "Club stagione",
      creator_id: PRESIDENTE.id,
      categories: categorie,
      structures: strutture,
      trainers: [{ id: "trainer-1", name: "Mister", linkedUserId: PRESIDENTE.id }],
      weekly_schedule: [
        {
          ...slot({
            id: "slot-vecchia",
            day: GIORNO_TEST,
            time: "17:00",
            endTime: "18:00",
            categoryId: "u15",
            fieldId: "campo-unico",
          }),
          seasonId: oldSeasonId,
        },
        {
          ...slot({
            id: "slot-attuale",
            day: GIORNO_TEST,
            time: "19:00",
            endTime: "20:00",
            categoryId: "u15",
            fieldId: "campo-unico",
          }),
          seasonId: newSeasonId,
        },
      ],
      trainings: [],
      settings: {
        seasons: [
          {
            id: oldSeasonId,
            label: "2025/2026",
            startDate: "2025-07-01",
            endDate: "2026-06-30",
            status: "archived",
            createdAt: "2025-06-01T00:00:00.000Z",
          },
          {
            id: newSeasonId,
            label: "2026/2027",
            startDate: "2026-07-01",
            endDate: "2027-06-30",
            status: "active",
            createdAt: "2026-06-01T00:00:00.000Z",
          },
        ],
        activeSeasonId: newSeasonId,
        trainingAutomation: { enabled: true, generateDaysAhead: 21 },
      },
      updated_at: new Date(),
    },
  });
  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB_STAGIONE,
      user_id: PRESIDENTE.id,
      role: "owner",
      is_primary: false,
      updated_at: new Date(),
    },
  });

  /* ---- club per la prova di conflitto singolo ---- */
  await prisma.club.create({
    data: {
      id: CLUB_CONFLITTO,
      slug: "wpprobe-conflitto",
      name: "Club conflitto",
      creator_id: PRESIDENTE.id,
      categories: categorie,
      structures: strutture,
      trainers: [{ id: "trainer-1", name: "Mister", linkedUserId: PRESIDENTE.id }],
      weekly_schedule: [
        slot({
          id: "slot-conflitto",
          day: GIORNO_TEST,
          time: "18:00",
          endTime: "19:30",
          categoryId: "u15",
          fieldId: "campo-unico",
        }),
      ],
      trainings: [],
      settings: { trainingAutomation: { enabled: true, generateDaysAhead: 21 } },
      updated_at: new Date(),
    },
  });
  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB_CONFLITTO,
      user_id: PRESIDENTE.id,
      role: "owner",
      is_primary: false,
      updated_at: new Date(),
    },
  });

  /* ---- club per la prova di concorrenza reale su un conflitto ---- */
  await prisma.club.create({
    data: {
      id: CLUB_CONCORRENZA,
      slug: "wpprobe-concorrenza",
      name: "Club concorrenza",
      creator_id: PRESIDENTE.id,
      categories: categorie,
      structures: strutture,
      trainers: [{ id: "trainer-1", name: "Mister", linkedUserId: PRESIDENTE.id }],
      // Due squadre, stesso campo, orari che si accavallano: un conflitto
      // che ogni singola esecuzione deve gia vedere da sola.
      weekly_schedule: [
        slot({
          id: "slot-a",
          day: GIORNO_TEST,
          time: "18:00",
          endTime: "19:30",
          categoryId: "u15",
          fieldId: "campo-unico",
        }),
        slot({
          id: "slot-b",
          day: GIORNO_TEST,
          time: "19:00",
          endTime: "20:30",
          categoryId: "u15",
          fieldId: "campo-unico",
        }),
      ],
      trainings: [],
      settings: { trainingAutomation: { enabled: true, generateDaysAhead: 21 } },
      updated_at: new Date(),
    },
  });
  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB_CONCORRENZA,
      user_id: PRESIDENTE.id,
      role: "owner",
      is_primary: false,
      updated_at: new Date(),
    },
  });
};

const esegui = async () => {
  automazione = await carica("src/lib/server/training-automation.ts");
  eventi = await carica("src/lib/server/events.ts");
  void eventi;

  /* ================================================================== S */
  console.log("\n  S — la generazione rispetta la stagione attiva (WP-13)\n");

  const risultatoStagione = await automazione.runTrainingAutomationForClub(
    CLUB_STAGIONE,
    { force: true },
  );
  prova(
    "S1 solo la fascia della stagione attiva genera",
    ["19:00"],
    Array.from(new Set(risultatoStagione.generatedTrainings.map((t) => t.time))).sort(),
  );

  const righeStagione = await prisma.clubEvent.findMany({
    where: { organization_id: CLUB_STAGIONE, kind: "training" },
  });
  prova(
    "S2 le righe vere in club_events portano season_id della stagione attiva",
    true,
    righeStagione.length > 0 && righeStagione.every((r) => r.season_id === "stagione-attiva"),
  );

  /* ================================================================== N */
  console.log("\n  N — un candidato in conflitto con una riga vera non si crea (WP-07)\n");

  // Riga "vera" gia in calendario, creata a mano (fuori dall'automazione),
  // sullo stesso campo, in un orario che si sovrappone alla fascia generata.
  const scopeUmano = {
    userId: PRESIDENTE.id,
    activeOrganizationId: CLUB_CONFLITTO,
    activeRole: "owner",
    allowedOrganizationIds: [CLUB_CONFLITTO],
    accessScopes: [],
  };

  // +3 giorni: stesso scarto usato per calcolare GIORNO_TEST da "oggi", cosi
  // questa data cade davvero sul weekday della fascia generata.
  const primaData = new Date();
  primaData.setDate(primaData.getDate() + 3);
  const eventoEsistente = await eventi.createClubEvent(
    scopeUmano,
    "training",
    {
      title: "Amichevole gia fissata",
      date: primaData.toISOString().slice(0, 10),
      time: "18:30",
      endTime: "19:00",
      categoryId: "u15",
      structureId: "struttura-1",
      locationId: "campo-unico",
    },
    { userId: PRESIDENTE.id },
  );
  prova("N0 la riga di conflitto esiste davvero", true, Boolean(eventoEsistente?.id));

  const risultatoConflitto = await automazione.runTrainingAutomationForClub(
    CLUB_CONFLITTO,
    { force: true },
  );
  prova(
    "N1 la generazione riporta almeno un conflitto",
    true,
    risultatoConflitto.conflicts.length > 0,
  );

  const righeConflitto = await prisma.clubEvent.findMany({
    where: {
      organization_id: CLUB_CONFLITTO,
      kind: "training",
      legacy_id: { startsWith: "auto:" },
    },
  });
  // Lo slot settimanale genera piu occorrenze nella finestra di 21 giorni;
  // solo quella sulla data della riga esistente si sovrappone davvero. Le
  // altre non sono in conflitto e devono essere state create normalmente.
  prova(
    "N2 solo le occorrenze davvero sovrapposte sono escluse, le altre si creano",
    risultatoConflitto.generatedTrainings.length - risultatoConflitto.conflicts.length,
    righeConflitto.length,
    "il conflitto e un'esclusione mirata, non un blocco dell'intera generazione",
  );
  prova(
    "N3 nessuna riga creata cade sulla data della riga gia esistente",
    false,
    righeConflitto.some(
      (r) => r.starts_at.toISOString().slice(0, 10) === primaData.toISOString().slice(0, 10),
    ),
  );

  /* ================================================================== R */
  console.log(
    "\n  R — due esecuzioni simultanee vere sullo stesso conflitto (concorrenza reale)\n",
  );

  const [esitoA, esitoB] = await Promise.all([
    automazione.runTrainingAutomationForClub(CLUB_CONCORRENZA, { force: true }),
    automazione.runTrainingAutomationForClub(CLUB_CONCORRENZA, { force: true }),
  ]);

  const righeConcorrenza = await prisma.clubEvent.findMany({
    where: { organization_id: CLUB_CONCORRENZA, kind: "training" },
    orderBy: { starts_at: "asc" },
  });

  // Per ogni giorno generato, le due fasce (slot-a, slot-b) si sovrappongono:
  // deve esistere al piu una riga attiva per giorno su quel campo, mai due.
  const perGiorno = new Map();
  for (const riga of righeConcorrenza) {
    const giorno = riga.starts_at.toISOString().slice(0, 10);
    perGiorno.set(giorno, (perGiorno.get(giorno) || 0) + 1);
  }
  const giorniConDoppione = [...perGiorno.entries()].filter(([, n]) => n > 1);

  prova(
    "R1 nessun giorno ha due fasce attive sullo stesso campo",
    [],
    giorniConDoppione,
    "il controllo intra-blocco confronta ogni candidato anche contro le altre righe dello stesso blocco: ogni chiamata processa l'intero programma in un colpo solo",
  );

  prova(
    "R2 entrambe le esecuzioni concorrenti hanno riportato dei conflitti",
    true,
    esitoA.conflicts.length > 0 && esitoB.conflicts.length > 0,
  );

  prova(
    "R3 nessuna riga generata risulta duplicata per identificativo storico",
    righeConcorrenza.length,
    new Set(righeConcorrenza.map((r) => r.legacy_id)).size,
  );
};

const main = async () => {
  console.log("");
  console.log("  Weekly Program & Training Automation — sonda PostgreSQL");
  console.log("  ---------------------------------------------------------");
  try {
    await semina();
    await esegui();
  } finally {
    for (const id of [CLUB_STAGIONE, CLUB_CONFLITTO, CLUB_CONCORRENZA]) {
      await prisma.auditLog
        .deleteMany({ where: { organization_id: id } })
        .catch(() => {});
      await prisma.club.deleteMany({ where: { id } }).catch(() => {});
    }
    await prisma.$disconnect();
  }

  const rossi = esiti.filter((riga) => !riga.ok);
  console.log("");
  console.log(`  ${esiti.length - rossi.length}/${esiti.length} prove superate`);
  if (rossi.length) {
    console.log("  ROSSE: " + rossi.map((riga) => riga.titolo.split(" ")[0]).join(", "));
    process.exitCode = 1;
  }
};

main().catch(async (errore) => {
  console.error(errore);
  for (const id of [CLUB_STAGIONE, CLUB_CONFLITTO, CLUB_CONCORRENZA]) {
    await prisma.club.deleteMany({ where: { id } }).catch(() => {});
  }
  await prisma.$disconnect();
  process.exit(1);
});
