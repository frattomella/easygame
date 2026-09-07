/**
 * **L'automazione degli allenamenti scrive dal dominio, con un attore di
 * sistema. Sonda su PostgreSQL vero.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/critical-automazione-sistema-probe.mjs
 *
 * ---
 *
 * ## Il Critical che chiude
 *
 * `training-automation.ts` scriveva `clubs.trainings` a mano. Quella colonna e
 * una proiezione in sola lettura con uno scrittore solo (ADR-0098), e la
 * generazione era l'unica porta che quella difesa la aggirava. Due
 * conseguenze, e la seconda peggiore della prima:
 *
 * 1. cio che generava **non aveva una riga** in `club_events`, quindi appello,
 *    convocazioni e RSVP rispondevano «Evento non trovato»: un allenamento che
 *    si vede e su cui non si puo fare niente;
 * 2. la prima proiezione successiva — il primo evento che qualcuno salvasse —
 *    lo **cancellava**, perche `projectEventsToClubColumn` riscrive la colonna
 *    per intero dalle righe. Senza errore e senza audit.
 *
 * ## Perche una sonda e non solo dei test
 *
 * Tre delle dodici prove non sono esprimibili con un doppio in memoria:
 *
 * * **E** e **F** (idempotenza e concorrenza) poggiano sulla chiave unica
 *   `(organization_id, kind, legacy_id)` e su `skipDuplicates`, che sono
 *   proprieta del **database**. Un doppio esegue una chiamata alla volta e non
 *   ha i lock di riga di Postgres: misurerebbe il codice, non la difesa;
 * * **D** pretende che una proiezione vera giri su righe vere.
 *
 * `PASS` significa «la proprieta regge sull'archivio, non nel racconto».
 *
 * Il file non tocca una riga di produzione: crea due club suoi e li cancella
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

const CLUB = randomUUID();
const ALTRO_CLUB = randomUUID();
const CLUB_CONCORRENZA = randomUUID();
const SEDE_NORD = randomUUID();
const SEDE_SUD = randomUUID();
const CAT_NORD = randomUUID();
const CAT_SUD = randomUUID();
const ATLETA = randomUUID();

let PRESIDENTE = null;
let automazione = null;
let eventi = null;
let sistema = null;

const scopeUmano = (club = CLUB) => ({
  userId: PRESIDENTE.id,
  activeOrganizationId: club,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB, ALTRO_CLUB],
  accessScopes: [],
});

/* Il calendario copre tutti e sette i giorni: la finestra e sempre colpita. */
const GIORNI = [
  "Lunedì",
  "Martedì",
  "Mercoledì",
  "Giovedì",
  "Venerdì",
  "Sabato",
  "Domenica",
];

const calendario = (categoryId, siteLabel) =>
  GIORNI.map((giorno, indice) => ({
    id: `slot-${siteLabel}-${indice}`,
    day: giorno,
    startTime: siteLabel === "nord" ? "18:00" : "20:00",
    endTime: siteLabel === "nord" ? "19:30" : "21:30",
    categoryId,
    trainerIds: [PRESIDENTE.id],
    structureId: "struttura-1",
    locationId: `campo-${siteLabel}`,
    location: `Campo ${siteLabel}`,
  }));

const pulisciResidui = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "critsys-" } },
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
    where: { email: "critsys-presidente@collaudo.local" },
    update: {},
    create: {
      id: randomUUID(),
      email: "critsys-presidente@collaudo.local",
      first_name: "Presidente",
      last_name: "Collaudo",
      password_hash: "$2b$10$critsys",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });

  /*
    **Due categorie con lo stesso nome su due sedi diverse.**

    E la configurazione del pilota, ed e la prova K: la generazione non deve
    fonderle. Il nome uguale e voluto.
  */
  const categorie = [
    { id: CAT_NORD, name: "Under 15", siteId: SEDE_NORD },
    { id: CAT_SUD, name: "Under 15", siteId: SEDE_SUD },
  ];

  const strutture = [
    {
      id: "struttura-1",
      name: "Palestra",
      fields: [
        { id: "campo-nord", name: "Campo nord" },
        { id: "campo-sud", name: "Campo sud" },
      ],
    },
  ];

  for (const [id, slug] of [
    [CLUB, "critsys-a"],
    [ALTRO_CLUB, "critsys-b"],
    [CLUB_CONCORRENZA, "critsys-c"],
  ]) {
    await prisma.club.create({
      data: {
        id,
        slug,
        name: `Club ${slug}`,
        creator_id: PRESIDENTE.id,
        categories: categorie,
        structures: strutture,
        club_sites: [
          { id: SEDE_NORD, name: "Nord" },
          { id: SEDE_SUD, name: "Sud" },
        ],
        trainers: [
          { id: "trainer-1", name: "Mister", linkedUserId: PRESIDENTE.id },
        ],
        weekly_schedule: [
          ...calendario(CAT_NORD, "nord"),
          ...calendario(CAT_SUD, "sud"),
        ],
        trainings: [],
        settings: {
          trainingAutomation: { enabled: true, generateDaysAhead: 7 },
        },
        updated_at: new Date(),
      },
    });

    await prisma.organizationUser.create({
      data: {
        id: randomUUID(),
        organization_id: id,
        user_id: PRESIDENTE.id,
        role: "owner",
        is_primary: id === CLUB,
        updated_at: new Date(),
      },
    });
  }

  await prisma.athlete.create({
    data: {
      id: ATLETA,
      organization_id: CLUB,
      first_name: "Atleta",
      last_name: "Nord",
      category_id: CAT_NORD,
      category_name: "Under 15",
      status: "active",
      data: {},
      updated_at: new Date(),
    },
  });
};

const allenamentiInRiga = (club = CLUB) =>
  prisma.clubEvent.findMany({
    where: { organization_id: club, kind: "training" },
    orderBy: { starts_at: "asc" },
  });

const proiezione = async (club = CLUB) => {
  const riga = await prisma.club.findUnique({
    where: { id: club },
    select: { trainings: true },
  });
  return Array.isArray(riga?.trainings) ? riga.trainings : [];
};

const esegui = async () => {
  automazione = await carica("src/lib/server/training-automation.ts");
  eventi = await carica("src/lib/server/events.ts");
  sistema = await carica("src/lib/server/system-actor.ts");

  /* ================================================================== A */
  console.log("\n  A — il cron genera, e cio che genera e un evento\n");

  const primo = await automazione.runTrainingAutomationForClub(CLUB, {
    force: true,
  });
  prova("A  il cron ha generato allenamenti", true, primo.generatedCount > 0);

  /* ================================================================== B */
  const righe = await allenamentiInRiga();
  prova(
    "B  ogni allenamento generato ha una riga in `club_events`",
    primo.generatedCount,
    righe.length,
    "prima: zero righe, e l'appello rispondeva «Evento non trovato»",
  );

  prova(
    "B2 e porta un identificativo storico deterministico, non un sorteggio",
    true,
    righe.every((riga) => String(riga.legacy_id || "").startsWith("auto:")),
  );

  /* ================================================================== C */
  const colonna = await proiezione();
  prova(
    "C  la proiezione storica e coerente con le righe",
    righe.length,
    colonna.length,
  );

  /* ================================================================== L */
  console.log("\n  L — chi ha agito\n");

  const audit = await prisma.auditLog.findFirst({
    where: { organization_id: CLUB, resource: "club_events" },
    orderBy: { created_at: "desc" },
  });
  prova(
    "L  l'audit dice SISTEMA, e non nomina nessuna persona",
    { ruolo: sistema.SYSTEM_ACTOR_ROLE, utente: null, email: null },
    {
      ruolo: audit?.actor_role ?? null,
      utente: audit?.actor_user_id ?? null,
      email: audit?.actor_email ?? null,
    },
    "un registro che attribuisce a una persona cio che non ha fatto e peggio di uno assente",
  );

  /* ================================================================== E */
  console.log("\n  E, F — ripetere non duplica\n");

  await automazione.runTrainingAutomationForClub(CLUB, { force: true });
  const dopoSecondo = await allenamentiInRiga();
  prova(
    "E  una seconda esecuzione non duplica niente",
    righe.length,
    dopoSecondo.length,
    "con un identificativo casuale la chiave unica non riconosceva la fascia",
  );

  /* ================================================================== F */
  /*
    **La concorrenza si misura su un club vergine, o non si misura.**

    Prima questa prova girava su `CLUB`, dove le fasce erano gia state create
    dalle esecuzioni A ed E: le tre chiamate simultanee trovavano la proiezione
    gia piena, `existingKeys` le filtrava tutte, e nessuna arrivava a scrivere.
    Verde, e vuota — misurava che tre esecuzioni che non fanno niente non
    duplicano niente.

    `CLUB_CONCORRENZA` non ha mai generato: qui le tre partono insieme, leggono
    tutte e tre una proiezione vuota, e provano tutte e tre a creare **le
    stesse** fasce. A tenerle in fila non puo essere la deduplica in memoria —
    nessuna delle tre vede le altre — ma solo la chiave unica
    `(organization_id, kind, legacy_id)`, che e la difesa che questa prova
    esiste per misurare.
  */
  const [conc] = await Promise.all([
    automazione.runTrainingAutomationForClub(CLUB_CONCORRENZA, { force: true }),
    automazione.runTrainingAutomationForClub(CLUB_CONCORRENZA, { force: true }),
    automazione.runTrainingAutomationForClub(CLUB_CONCORRENZA, { force: true }),
  ]);
  void conc;

  prova(
    "F  tre esecuzioni simultanee su un club vergine: una fascia, una riga",
    righe.length,
    (await allenamentiInRiga(CLUB_CONCORRENZA)).length,
    "la deduplica in memoria non vede l'altra esecuzione: la vede la chiave unica",
  );
  prova(
    "F2 e la proiezione del club vergine e coerente",
    (await allenamentiInRiga(CLUB_CONCORRENZA)).length,
    (await proiezione(CLUB_CONCORRENZA)).length,
  );

  const dopoConcorrenza = await allenamentiInRiga();

  /* ================================================================== K */
  console.log("\n  K — due sedi, un nome solo\n");

  const perCategoria = new Set(
    dopoConcorrenza.map((riga) => String(riga.category_id || "")),
  );
  prova(
    "K  le due «Under 15» restano due categorie distinte",
    true,
    perCategoria.has(CAT_NORD) && perCategoria.has(CAT_SUD),
    "prima di ADR-0155 il nome uguale le fondeva",
  );

  /* ================================================================== D */
  console.log("\n  D — il salvataggio successivo non cancella niente\n");

  await eventi.createClubEvent(scopeUmano(), "match", {
    id: `gara-${randomUUID()}`,
    date: "2026-12-20",
    time: "15:00",
    title: "Gara di collaudo",
    categoryId: CAT_NORD,
    siteId: SEDE_NORD,
  });

  const dopoGara = await allenamentiInRiga();
  const colonnaDopoGara = await proiezione();
  prova(
    "D  gli allenamenti generati sopravvivono al salvataggio di un evento",
    { righe: dopoConcorrenza.length, colonna: dopoConcorrenza.length },
    { righe: dopoGara.length, colonna: colonnaDopoGara.length },
    "prima: la proiezione li cancellava tutti, senza errore e senza audit",
  );

  /* ================================================================== G */
  console.log("\n  G — un contesto di sistema vale per il suo club\n");

  const contestoDiA = sistema.createSystemExecutionContext({
    organizationId: CLUB,
    job: "collaudo",
    capabilities: ["training_automation.generate"],
  });

  const primaAltroClub = (await allenamentiInRiga(ALTRO_CLUB)).length;
  const esitoCrossClub = await eventi
    .createClubEventsBatch(
      {
        activeOrganizationId: ALTRO_CLUB,
        activeRole: null,
        allowedOrganizationIds: [ALTRO_CLUB],
        system: contestoDiA,
      },
      "training",
      [
        {
          id: "intruso",
          date: "2026-12-21",
          time: "10:00",
          title: "Intruso",
          categoryId: CAT_NORD,
        },
      ],
    )
    .then(() => "riuscito")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "G  il contesto del club A non scrive nel club B",
    true,
    /Accesso negato/.test(esitoCrossClub),
    `risposta: ${esitoCrossClub}`,
  );
  prova(
    "G2 e infatti nel club B non e comparso niente",
    primaAltroClub,
    (await allenamentiInRiga(ALTRO_CLUB)).length,
  );

  const esitoSenzaCapacita = await eventi
    .createClubEventsBatch(
      {
        activeOrganizationId: CLUB,
        activeRole: null,
        allowedOrganizationIds: [CLUB],
        system: {
          kind: "system",
          organizationId: CLUB,
          job: "finto",
          capabilities: new Set(),
        },
      },
      "training",
      [{ id: "senza-capacita", date: "2026-12-22", time: "10:00", title: "X" }],
    )
    .then(() => "riuscito")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "G3 un contesto senza capacita non e «il sistema puo tutto»",
    true,
    /Accesso negato/.test(esitoSenzaCapacita),
    `risposta: ${esitoSenzaCapacita}`,
  );

  /* ================================================================== H */
  console.log("\n  H, I, J — un allenamento generato e un allenamento\n");

  const bersaglio = dopoGara[0];

  await eventi.updateClubEvent(scopeUmano(), bersaglio.id, {
    title: "Titolo cambiato a mano",
  });
  const dopoModifica = await prisma.clubEvent.findUnique({
    where: { id: bersaglio.id },
  });
  prova(
    "H  si modifica come un allenamento qualunque",
    "Titolo cambiato a mano",
    dopoModifica?.title ?? null,
  );

  /* ================================================================== J */
  const esitoAppello = await eventi
    .saveEventAttendance(scopeUmano(), bersaglio.id, [
      { athleteId: ATLETA, status: "present" },
    ])
    .then(() => "riuscito")
    .catch((errore) => String(errore?.message || errore));
  prova(
    "J  l'appello si registra sopra",
    "riuscito",
    esitoAppello,
    "prima: «Evento non trovato», perche la riga non esisteva",
  );

  const presenze = await prisma.clubEventParticipant.count({
    where: { event_id: bersaglio.id },
  });
  prova("J2 e la presenza e in archivio", 1, presenze);

  /* ================================================================== I */
  /*
    **Annullare e cancellare sono due gesti, e il dominio li distingue gia.**

    Un evento che ha una storia — presenze, convocazioni, risposte delle
    famiglie — non si cancella: si **annulla**, cosi la storia resta. Il
    bersaglio qui sopra ha appena preso l'appello, quindi la porta giusta e
    quella. E la prova che il generato si comporta come tutti gli altri:
    riceve lo stesso rifiuto e accetta la stessa alternativa.
  */
  const esitoCancellazioneConStoria = await eventi
    .deleteClubEvent(scopeUmano(), bersaglio.id)
    .then(() => "riuscito")
    .catch((errore) => String(errore?.message || errore));
  prova(
    "I  con una storia addosso si rifiuta la cancellazione, come per gli altri",
    true,
    /si annulla, non si cancella/.test(esitoCancellazioneConStoria),
    `risposta: ${esitoCancellazioneConStoria}`,
  );

  const esitoAnnullamento = await eventi
    .updateClubEvent(scopeUmano(), bersaglio.id, { status: "cancelled" })
    .then(() => "riuscito")
    .catch((errore) => String(errore?.message || errore));
  prova("I2 e si annulla", "riuscito", esitoAnnullamento);

  const annullato = await prisma.clubEvent.findUnique({
    where: { id: bersaglio.id },
  });
  prova("I3 lo stato e quello annullato", "cancelled", annullato?.status ?? null);

  /* E uno senza storia si cancella davvero, righe e proiezione insieme. */
  const senzaStoria = dopoGara[1];
  const primaDellaCancellazione = (await allenamentiInRiga()).length;
  const esitoCancellazione = await eventi
    .deleteClubEvent(scopeUmano(), senzaStoria.id)
    .then(() => "riuscito")
    .catch((errore) => String(errore?.message || errore));
  prova("I4 senza storia si cancella", "riuscito", esitoCancellazione);

  const righeFinali = await allenamentiInRiga();
  const colonnaFinale = await proiezione();
  prova(
    "I5 e la proiezione lo perde insieme alla riga",
    { righe: primaDellaCancellazione - 1, coerente: true },
    { righe: righeFinali.length, coerente: righeFinali.length === colonnaFinale.length },
  );
};

const main = async () => {
  console.log("");
  console.log("  Critical · l'automazione scrive dal dominio, con un attore di sistema");
  console.log("  --------------------------------------------------------------------");
  try {
    await semina();
    await esegui();
  } finally {
    for (const id of [CLUB, ALTRO_CLUB, CLUB_CONCORRENZA]) {
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
  for (const id of [CLUB, ALTRO_CLUB, CLUB_CONCORRENZA]) {
    await prisma.club.deleteMany({ where: { id } }).catch(() => {});
  }
  await prisma.$disconnect();
  process.exit(1);
});
