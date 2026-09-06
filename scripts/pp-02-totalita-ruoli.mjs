/**
 * **Il test di totalita del ruolo, contro un database vero.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs scripts/pp-02-totalita-ruoli.mjs
 *
 * ---
 *
 * ## Perche esiste
 *
 * Non per provare un caso in piu. Per rendere **impossibile una classe**.
 *
 * La RCA di PP-02 (KB 44, §3 «Causa B») ha isolato la forma che tornava tre
 * round di fila: una difesa vera, corretta, provata — che copre *un valore su
 * N* di un'enumerazione ricopiata a mano, e un'altra enumerazione da qualche
 * altra parte con cui deve restare d'accordo senza che nulla lo verifichi.
 * Al round 28 gli sweep della revoca conoscevano **quattro** grafie di ruolo
 * su ventidue: la tessera spariva, l'audit registrava, e il genitore apriva
 * ancora il fascicolo del minore.
 *
 * La regola che questo file applica:
 *
 * > Ogni enumerazione che governa una difesa deve avere una prova che
 * > **enumera il dominio canonico** e fallisce quando compare un valore non
 * > coperto. Non una prova che elenca i valori a cui l'autore ha pensato: una
 * > prova che *deriva* i valori dalla fonte unica e li esercita tutti.
 *
 * Percio qui non c'e nessun elenco di ruoli. C'e `ACCESS_ROLE_ALIASES` — le
 * chiavi di `ROLE_ALIASES`, esportate da `access-roles.ts` — piu le forme
 * `custom:<base>:<nome>` derivate da `CUSTOM_ROLE_BASE_ROLES`. Chi domani
 * aggiunge un alias estende la prova **senza toccare questo file**; se la
 * difesa non lo copre, il file diventa rosso da solo.
 *
 * ## Che cosa misura
 *
 * La porta e quella vera: `revokeClubAccess`, la stessa che preme il
 * proprietario dalla Gestione accessi. Per **ogni** valore del dominio si
 * semina una persona che porta contemporaneamente quattro legami — tutore di
 * un minore, atleta con `athletes.user_id`, scheda allenatore, scheda staff —
 * e dopo la revoca si chiede quali sono caduti.
 *
 * Due proprieta, non una:
 *
 *   * **totalita** — il legame della famiglia canonica del ruolo cade, per
 *     tutti i valori del dominio. E cio che il round 28 ha visto rompersi.
 *   * **specificita** — gli altri tre **non** cadono. Senza questa meta, una
 *     «correzione» che scollega tutto passerebbe la prima, e revocare la
 *     tessera di allenatore a un padre gli toglierebbe l'accesso ai figli.
 *
 * ## La regola di questo file
 *
 * La sonda misura, non corregge. Il club viene cancellato in `finally`, e la
 * semina comincia cancellando i residui di un'esecuzione interrotta.
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

let saveGuardianRegistry;
let linkGuardianAccount;

const esiti = [];
const prova = (titolo, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ titolo, ok });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(78)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        nota: ${nota}`);
};

const CLUB = randomUUID();
const SLUG = `pp02tot-${Date.now()}`;

/** Le quattro famiglie di legame, e la domanda che le distingue. */
const FAMIGLIE = ["parent", "athlete", "trainer", "management"];

let ruoli;
let cruscotto;
let PRESIDENTE;

/** Il dominio: derivato, mai scritto a mano. */
let DOMINIO = [];

const famigliaDi = (valore) => {
  const canonico = ruoli.normalizeAccessRole(valore);
  if (canonico === "parent") return "parent";
  if (canonico === "athlete") return "athlete";
  if (canonico === "trainer") return "trainer";
  if (ruoli.isManagementAccessRole(valore)) return "management";
  return null;
};

const pulisciResidui = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp02tot-" } },
    select: { id: true },
  });
  const ids = residui.map((r) => r.id);
  if (ids.length) {
    await prisma.auditLog
      .deleteMany({ where: { organization_id: { in: ids } } })
      .catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.user.deleteMany({
    where: { email: { startsWith: "pp02tot-" } },
  });
};

/* ------------------------------------------------------------------ semina */

const soggetti = new Map();

const semina = async () => {
  await pulisciResidui();

  PRESIDENTE = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: "pp02tot-presidente@example.invalid",
      first_name: "Paola",
      last_name: "Totalita",
      password_hash: "$2b$10$pp02tot",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: SLUG,
      name: "ASD Totalita",
      creator_id: PRESIDENTE.id,
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
      categories: [{ id: "cat-tot", name: "Under 12" }],
      club_sites: [{ id: "sede-tot", name: "Sede", active: true }],
      trainers: [],
      staff_members: [],
      trainings: [],
      matches: [],
      appointments: [],
      updated_at: new Date(),
    },
  });

  const trainersJson = [];
  const staffJson = [];

  for (const [indice, valore] of DOMINIO.entries()) {
    const utente = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: `pp02tot-${indice}@example.invalid`,
        first_name: `Soggetto${indice}`,
        last_name: "Totalita",
        password_hash: "$2b$10$pp02tot",
        role: "user",
        email_verified_at: new Date(),
        updated_at: new Date(),
      },
    });

    const tessera = await prisma.organizationUser.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        user_id: utente.id,
        role: valore,
        is_primary: true,
        updated_at: new Date(),
      },
    });

    /* Legame 1 — tutore di un minore. */
    const figlio = randomUUID();
    await prisma.athlete.create({
      data: {
        id: figlio,
        organization_id: CLUB,
        first_name: `Figlio${indice}`,
        last_name: "Totalita",
        birth_date: new Date(Date.UTC(2014, 4, 12)),
        status: "active",
        category_id: "cat-tot",
        category_name: "Under 12",
        data: {
          guardians: [
            {
              id: `guardian-${utente.id}`,
              name: utente.first_name,
              surname: utente.last_name,
              relationship: "Genitore",
              email: utente.email,
              linkedUserId: utente.id,
            },
          ],
        },
        updated_at: new Date(),
      },
    });

    /*
      Il legame del tutore e una **riga**, non un elemento del blob
      (PP-02 / WP-C): la scrive il modulo proprietario, che e l'unico a cui
      l'archivio permetta di scriverla. Seminare solo dentro `data` lascerebbe
      la semina incompleta, e la sonda misurerebbe una revoca che non aveva
      niente da revocare.
    */
    await saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: figlio,
      rows: [
        {
          legacyId: `guardian-${utente.id}`,
          firstName: utente.first_name,
          lastName: utente.last_name,
          relationship: "Genitore",
          email: utente.email,
        },
      ],
      canGrantAccess: true,
    });

    /*
      Il legame **dichiarato** — l'utenza sulla riga — lo scrive il riscatto di
      un invito, e qui si riproduce quell'atto invece di scrivere il campo:
      `saveGuardianRegistry` non tocca `user_id`, ed e voluto («un legame con
      una famiglia non si crea scrivendo l'anagrafica»).
    */
    await linkGuardianAccount(prisma, {
      athleteId: figlio,
      identityKeys: [utente.email],
      userId: utente.id,
      email: utente.email,
    });

    /* Legame 2 — la propria scheda atleta. */
    const scheda = randomUUID();
    await prisma.athlete.create({
      data: {
        id: scheda,
        organization_id: CLUB,
        first_name: `Atleta${indice}`,
        last_name: "Totalita",
        birth_date: new Date(Date.UTC(2006, 4, 12)),
        status: "active",
        category_id: "cat-tot",
        category_name: "Under 12",
        user_id: utente.id,
        data: {},
        updated_at: new Date(),
      },
    });

    /*
      Legami 3 e 4 — scheda allenatore e scheda staff, nelle **due**
      rappresentazioni: la riga di `club_resource_items` e la proiezione JSON
      su `clubs`. Lo sweep deve ripulirle entrambe, e sono due funzioni
      diverse a farlo.
    */
    const profiloTrainer = {
      id: `trainer-${indice}`,
      name: utente.first_name,
      surname: utente.last_name,
      role: "Allenatore",
      email: utente.email,
      linkedUserId: utente.id,
    };
    const profiloStaff = {
      id: `staff-${indice}`,
      name: utente.first_name,
      surname: utente.last_name,
      role: "Segreteria",
      email: utente.email,
      linkedUserId: utente.id,
    };
    trainersJson.push(profiloTrainer);
    staffJson.push(profiloStaff);

    /*
      `club_resource_items` non ha una colonna per l'identificativo logico:
      l'id della scheda vive **dentro** il payload, e la riga ha un uuid suo.
      Le asserzioni rileggono percio per uuid di riga, non per id di scheda.
    */
    const rigaTrainer = randomUUID();
    const rigaStaff = randomUUID();
    await prisma.clubResourceItem.createMany({
      data: [
        {
          id: rigaTrainer,
          organization_id: CLUB,
          resource_type: "trainers",
          payload: profiloTrainer,
          updated_at: new Date(),
        },
        {
          id: rigaStaff,
          organization_id: CLUB,
          resource_type: "staff_members",
          payload: profiloStaff,
          updated_at: new Date(),
        },
      ],
    });

    soggetti.set(valore, {
      valore,
      indice,
      utente,
      tesseraId: tessera.id,
      figlio,
      scheda,
      trainerItemId: profiloTrainer.id,
      staffItemId: profiloStaff.id,
      rigaTrainer,
      rigaStaff,
    });
  }

  await prisma.club.update({
    where: { id: CLUB },
    data: { trainers: trainersJson, staff_members: staffJson },
  });
};

/* ------------------------------------------------------------- osservazione */

const legatoNelJson = async (colonna, itemId) => {
  const club = await prisma.club.findUnique({
    where: { id: CLUB },
    select: { trainers: true, staff_members: true },
  });
  const righe = Array.isArray(club?.[colonna]) ? club[colonna] : [];
  const riga = righe.find((r) => r?.id === itemId);
  return Boolean(riga?.linkedUserId);
};

const legatoNellaRiga = async (rigaId) => {
  const riga = await prisma.clubResourceItem.findUnique({
    where: { id: rigaId },
    select: { payload: true },
  });
  return Boolean(riga?.payload?.linkedUserId);
};

/** I quattro legami, letti dalle porte che li mostrano davvero. */
const stato = async (s) => ({
  parent: await cruscotto.canParentAccessAthlete(s.utente.id, s.figlio),
  athlete: Boolean(
    (
      await prisma.athlete.findUnique({
        where: { id: s.scheda },
        select: { user_id: true },
      })
    )?.user_id,
  ),
  trainer:
    (await legatoNellaRiga(s.rigaTrainer)) ||
    (await legatoNelJson("trainers", s.trainerItemId)),
  management:
    (await legatoNellaRiga(s.rigaStaff)) ||
    (await legatoNelJson("staff_members", s.staffItemId)),
});

/* -------------------------------------------------------------------- corpo */

const main = async () => {
  ruoli = await carica("src/lib/access-roles.ts");
  cruscotto = await carica("src/lib/server/parent-dashboard.ts");
  const accessi = await carica("src/lib/server/club-roles.ts");
  ({ saveGuardianRegistry, linkGuardianAccount } = await carica(
    "src/lib/server/athlete-guardians.ts",
  ));

  DOMINIO = [
    ...ruoli.ACCESS_ROLE_ALIASES,
    ...ruoli.CUSTOM_ROLE_BASE_ROLES.map(
      (base) => `custom:${base}:collaudo-totalita`,
    ),
  ];

  console.log("\n§0 — il dominio, derivato dalla fonte unica\n");
  prova(
    "T-00 il dominio non e vuoto e viene da `access-roles.ts`",
    true,
    DOMINIO.length >= 36,
    `dominio: ${DOMINIO.length} valori`,
  );

  prova("T-01 ogni valore del dominio ha un ruolo canonico", [],
    DOMINIO.filter((v) => !ruoli.normalizeAccessRole(v)));

  prova("T-02 ogni valore del dominio ricade in una delle quattro famiglie", [],
    DOMINIO.filter((v) => !famigliaDi(v)));

  await semina();

  const scope = {
    userId: PRESIDENTE.id,
    activeOrganizationId: CLUB,
    activeRole: "owner",
    activeMembershipId: null,
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

  console.log(
    `\n§1 — totalita e specificita della revoca, su ${DOMINIO.length} grafie\n`,
  );

  const falliti = { totalita: [], specificita: [], revoca: [] };

  for (const valore of DOMINIO) {
    const s = soggetti.get(valore);
    const famiglia = famigliaDi(valore);
    const prima = await stato(s);

    /*
      La semina deve partire con tutti e quattro i legami accesi: se uno e gia
      spento, l'osservazione dopo la revoca non significherebbe niente — ed e
      esattamente il modo in cui una sonda diventa vacua senza accorgersene.
    */
    if (!FAMIGLIE.every((f) => prima[f] === true)) {
      falliti.revoca.push({ valore, motivo: "semina incompleta", prima });
      continue;
    }

    try {
      await accessi.revokeClubAccess(scope, s.tesseraId);
    } catch (errore) {
      falliti.revoca.push({ valore, motivo: String(errore?.message || errore) });
      continue;
    }

    const dopo = await stato(s);

    if (dopo[famiglia] !== false) {
      falliti.totalita.push({ valore, famiglia, dopo });
    }
    for (const altra of FAMIGLIE) {
      if (altra === famiglia) continue;
      if (dopo[altra] !== true) {
        falliti.specificita.push({ valore, famiglia, rotta: altra });
      }
    }
  }

  prova("T-10 la revoca riesce per ogni grafia del dominio", [], falliti.revoca);
  prova(
    "T-11 TOTALITA — il legame della famiglia canonica cade, per ogni grafia",
    [],
    falliti.totalita,
    "una grafia qui dentro e una revoca che lascia il profilo collegato",
  );
  prova(
    "T-12 SPECIFICITA — gli altri tre legami restano, per ogni grafia",
    [],
    falliti.specificita,
    "una grafia qui dentro e una revoca che scollega piu di quanto le compete",
  );

  /*
    La misura della varieta, non un'asserzione sul prodotto: quante grafie del
    dominio il vocabolario del round 28 non conteneva. E il numero che spiega
    perche 266 sonde verdi convivevano con la revoca rotta.
  */
  const vecchioVocabolario = new Set([
    "trainer", "allenatore", "coach",
    "parent", "genitore", "guardian", "tutore",
    "athlete", "atleta", "player",
    "admin", "manager", "gestore", "staff", "member", "socio",
    "collaborator", "collaboratore",
  ]);
  const invisibili = DOMINIO.filter((v) => !vecchioVocabolario.has(v));
  console.log(
    `\n§2 — cio che il vocabolario del round 28 non vedeva: ${invisibili.length} grafie su ${DOMINIO.length}`,
  );
  console.log(`      ${invisibili.join(", ")}\n`);
};

try {
  await main();
} finally {
  await prisma.auditLog
    .deleteMany({ where: { organization_id: CLUB } })
    .catch(() => {});
  await prisma.club.deleteMany({ where: { id: CLUB } }).catch(() => {});
  await prisma.user
    .deleteMany({ where: { email: { startsWith: "pp02tot-" } } })
    .catch(() => {});
  await prisma.$disconnect();
}

const ko = esiti.filter((e) => !e.ok).length;
console.log(`\nEsito: ${esiti.length - ko}/${esiti.length}`);
process.exit(ko ? 1 : 0);
