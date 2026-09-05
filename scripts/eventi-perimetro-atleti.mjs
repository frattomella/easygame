/**
 * **Il perimetro degli atleti su convocazione e presenza, misurato dalle porte
 * vere.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs scripts/eventi-perimetro-atleti.mjs
 *
 * ---
 *
 * ## Il difetto che misura
 *
 * `saveEventConvocations` e `saveEventAttendance` verificano l'evento — che
 * appartenga al club attivo, che stia nel perimetro dell'allenatore, che il
 * ruolo abbia il permesso — e **non verificano gli atleti**.
 *
 * L'unica guardia sul lato atleta, `assertAtletiDentroIlPerimetro`, esce
 * subito quando il ruolo attivo non dichiara un perimetro di sede o categoria:
 *
 *     if (!buildAthleteAccessScopeConditions(scope)) return;
 *
 * Un `trainer` ordinario, un `owner`, la segreteria — nessuno di loro ha righe
 * di perimetro — quindi per **tutti** loro nessun controllo sull'atleta viene
 * eseguito. E `club_event_participants.athlete_id` non ha nemmeno una chiave
 * esterna: e una colonna di testo libero.
 *
 * La conseguenza non e un errore di visualizzazione. E una **scrittura
 * cross-tenant**: la riga di un atleta di un altro club finisce dentro
 * `club_event_participants` di questo club. Convocare fa partire l'invito alla
 * famiglia di quel minore; la presenza e il dato su cui si rendicontano i
 * contributi pubblici (`src/lib/server/funding.ts`).
 *
 * ## Che cosa chiede
 *
 * Cinque atleti, un evento solo:
 *
 *   * A1 — dentro il club, dentro la categoria dell'evento: **passa**;
 *   * A2 — dentro il club, categoria **non** dell'evento: passa, ed e voluto
 *     (la convocazione fuori categoria esiste, e `isExtraCategory` la dichiara);
 *   * A3 — dentro il club, tesseramento non attivo: passa, ed e voluto (lo
 *     stato del tesseramento non e il perimetro del club);
 *   * B1 — **atleta di un altro club**: deve essere **rifiutato**;
 *   * X — un identificativo che non nomina nessun atleta: deve essere
 *     **rifiutato**.
 *
 * Le prime tre sono li per dire che cosa la correzione **non** deve rompere:
 * una guardia che rifiuta anche A2 o A3 non e piu stretta, e sbagliata.
 *
 * La sonda misura, non corregge. I due club sono cancellati in `finally`.
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
const CAT_EVENTO = "cat-perimetro-a";
const CAT_ALTRA = "cat-perimetro-b";

const A1 = randomUUID();
const A2 = randomUUID();
const A3 = randomUUID();
const B1 = randomUUID();
const INESISTENTE = randomUUID();

let PRESIDENTE = null;
let ALLENATORE = null;

const utente = async (email, nome) =>
  prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      first_name: nome,
      last_name: "Perimetro",
      password_hash: "$2b$10$perimetro",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });

const club = async (id, slug, nome, creatore) =>
  prisma.club.create({
    data: {
      id,
      slug,
      name: nome,
      creator_id: creatore,
      settings: {
        seasons: [
          {
            id: "2026-27",
            label: "2026/27",
            startDate: "2026-07-01",
            endDate: "2027-06-30",
            status: "active",
          },
        ],
      },
      categories: [
        { id: CAT_EVENTO, name: "Under 12" },
        { id: CAT_ALTRA, name: "Under 15" },
      ],
      club_sites: [{ id: "sede-perimetro", name: "Sede", active: true }],
      trainers: [],
      staff_members: [],
      trainings: [],
      matches: [],
      appointments: [],
      updated_at: new Date(),
    },
  });

const atleta = async (id, organizationId, nome, categoria, stato = "active") =>
  prisma.athlete.create({
    data: {
      id,
      organization_id: organizationId,
      first_name: nome,
      last_name: "Perimetro",
      birth_date: new Date(Date.UTC(2013, 4, 12)),
      status: stato,
      category_id: categoria,
      category_name: categoria === CAT_EVENTO ? "Under 12" : "Under 15",
      data: {},
      updated_at: new Date(),
    },
  });

const pulisciResidui = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "perimetro-" } },
    select: { id: true },
  });
  const ids = residui.map((r) => r.id);
  if (ids.length) {
    await prisma.clubEventParticipant
      .deleteMany({ where: { organization_id: { in: ids } } })
      .catch(() => {});
    await prisma.auditLog
      .deleteMany({ where: { organization_id: { in: ids } } })
      .catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.user.deleteMany({
    where: { email: { startsWith: "perimetro-" } },
  });
};

const semina = async () => {
  await pulisciResidui();

  PRESIDENTE = await utente("perimetro-presidente@example.invalid", "Paola");
  ALLENATORE = await utente("perimetro-allenatore@example.invalid", "Mario");

  await club(CLUB, `perimetro-${Date.now()}`, "ASD Perimetro", PRESIDENTE.id);
  await club(
    ALTRO_CLUB,
    `perimetro-altro-${Date.now()}`,
    "ASD Altrove",
    PRESIDENTE.id,
  );

  /*
    **Un allenatore ordinario, senza righe di perimetro.** E la configurazione
    normale, ed e esattamente quella in cui la guardia esistente esce subito.
  */
  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: ALLENATORE.id,
      role: "trainer",
      is_primary: true,
      updated_at: new Date(),
    },
  });

  /*
    E la sua **scheda** allenatore, collegata: `assertTrainerEventPerimeter`
    parte da li, non dalla tessera. Nessuna categoria dichiarata sulla scheda,
    che e la configurazione in cui il perimetro non restringe niente — cioe
    quella in cui la guardia sul lato atleta esce subito.
  */
  await prisma.club.update({
    where: { id: CLUB },
    data: {
      trainers: [
        {
          id: "trainer-perimetro",
          name: ALLENATORE.first_name,
          surname: ALLENATORE.last_name,
          email: ALLENATORE.email,
          linkedUserId: ALLENATORE.id,
          categories: [CAT_EVENTO],
        },
      ],
    },
  });

  await atleta(A1, CLUB, "Dentro", CAT_EVENTO);
  await atleta(A2, CLUB, "AltraCategoria", CAT_ALTRA);
  await atleta(A3, CLUB, "NonAttivo", CAT_EVENTO, "inactive");
  await atleta(B1, ALTRO_CLUB, "AltroClub", CAT_EVENTO);
};

const scopeAllenatore = () => ({
  userId: ALLENATORE.id,
  activeOrganizationId: CLUB,
  activeRole: "trainer",
  activeMembershipId: null,
  allowedOrganizationIds: [CLUB],
  accessScopes: [],
});

/** Una chiamata che deve fallire, e **il modo** in cui deve fallire. */
const esito = async (azione) => {
  try {
    await azione();
    return "accettata";
  } catch (errore) {
    const messaggio = String(errore?.message || errore);
    if (process.env.PERIMETRO_DEBUG) console.log("        [dbg] " + messaggio.slice(0, 140));
    return messaggio.includes("Accesso negato") ? "negata" : `errore: ${messaggio.slice(0, 60)}`;
  }
};

const righeDi = async (athleteId) =>
  prisma.clubEventParticipant.count({
    where: { organization_id: CLUB, athlete_id: athleteId },
  });

const main = async () => {
  await semina();

  const eventi = await carica("src/lib/server/events.ts");
  const scopeClub = {
    userId: PRESIDENTE.id,
    activeOrganizationId: CLUB,
    activeRole: "owner",
    activeMembershipId: null,
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

  const evento = await eventi.createClubEvent(scopeClub, "training", {
    id: `perimetro-training-${Date.now()}`,
    title: "Allenamento",
    date: "2026-09-10",
    time: "18:00",
    endTime: "19:30",
    categories: [CAT_EVENTO],
    categoryId: CAT_EVENTO,
  });

  console.log("\n§1 — la convocazione, dalla porta dell'allenatore\n");

  const convoca = (athleteId) => () =>
    eventi.saveEventConvocations(
      scopeAllenatore(),
      evento.id,
      [{ athleteId, status: "convocated" }],
      { userId: ALLENATORE.id },
    );

  prova("E-01 un atleta del club, nella categoria dell'evento", "accettata", await esito(convoca(A1)));
  prova("E-02 un atleta del club, altra categoria (fuori categoria e lecito)", "accettata", await esito(convoca(A2)));
  prova("E-03 un atleta del club con tesseramento non attivo", "accettata", await esito(convoca(A3)));
  prova(
    "E-04 CRITICO — un atleta di un ALTRO club",
    "negata",
    await esito(convoca(B1)),
    "una riga scritta qui e una scrittura cross-tenant, e fa partire l'invito alla famiglia di quel minore",
  );
  prova(
    "E-05 un identificativo che non nomina nessun atleta",
    "negata",
    await esito(convoca(INESISTENTE)),
    "`club_event_participants.athlete_id` non ha una chiave esterna: e testo libero",
  );

  prova(
    "E-06 e nessuna riga dell'altro club e finita in archivio",
    0,
    await righeDi(B1),
  );
  prova("E-07 ne una riga che non nomina nessuno", 0, await righeDi(INESISTENTE));

  console.log("\n§2 — la presenza, dalla stessa porta\n");

  const segna = (athleteId) => () =>
    eventi.saveEventAttendance(
      scopeAllenatore(),
      evento.id,
      [{ athleteId, status: "present" }],
      { userId: ALLENATORE.id },
    );

  prova("E-10 un atleta del club", "accettata", await esito(segna(A1)));
  prova(
    "E-11 CRITICO — la presenza di un atleta di un ALTRO club",
    "negata",
    await esito(segna(B1)),
    "la presenza e il dato su cui si rendicontano i contributi pubblici",
  );
  prova("E-12 e nemmeno da qui la riga entra", 0, await righeDi(B1));

  console.log("\n§3 — la porta resta usabile\n");

  /*
    La meta che dice se la correzione e giusta e non solo stretta: un elenco
    ordinario di tre atleti del club deve continuare a passare in un colpo solo.
  */
  const insieme = await esito(() =>
    eventi.saveEventConvocations(
      scopeAllenatore(),
      evento.id,
      [
        { athleteId: A1, status: "convocated" },
        { athleteId: A2, status: "convocated", isExtraCategory: true },
        { athleteId: A3, status: "convocated" },
      ],
      { userId: ALLENATORE.id },
    ),
  );
  prova("E-20 tre atleti del club, in una chiamata sola", "accettata", insieme);
  prova(
    "E-21 e le tre righe ci sono",
    [1, 1, 1],
    [await righeDi(A1), await righeDi(A2), await righeDi(A3)],
  );

  /*
    E un elenco misto non passa **a meta**: se uno solo e fuori, non deve
    entrare nessuno. Una guardia che filtra invece di rifiutare scriverebbe i
    buoni e tacerebbe sui cattivi.
  */
  const misto = await esito(() =>
    eventi.saveEventConvocations(
      scopeAllenatore(),
      evento.id,
      [
        { athleteId: A1, status: "convocated" },
        { athleteId: B1, status: "convocated" },
      ],
      { userId: ALLENATORE.id },
    ),
  );
  prova("E-22 un elenco misto e rifiutato per intero", "negata", misto);
  prova("E-23 e non ha scritto la meta buona", 0, await righeDi(B1));
};

try {
  await main();
} finally {
  for (const id of [CLUB, ALTRO_CLUB]) {
    await prisma.clubEventParticipant
      .deleteMany({ where: { organization_id: id } })
      .catch(() => {});
    await prisma.auditLog
      .deleteMany({ where: { organization_id: id } })
      .catch(() => {});
    await prisma.club.deleteMany({ where: { id } }).catch(() => {});
  }
  await prisma.user
    .deleteMany({ where: { email: { startsWith: "perimetro-" } } })
    .catch(() => {});
  await prisma.$disconnect();
}

const ko = esiti.filter((e) => !e.ok).length;
console.log(`\nEsito: ${esiti.length - ko}/${esiti.length}`);
process.exit(ko ? 1 : 0);
