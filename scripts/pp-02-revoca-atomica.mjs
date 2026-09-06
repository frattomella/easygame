/**
 * **La revoca deve vedere anche la scheda che acquista il tutore mentre gira.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs scripts/pp-02-revoca-atomica.mjs
 *
 * ---
 *
 * ## Che cosa misura, e perche non e cio che sembra
 *
 * La prima stesura di questa sonda misurava un'altra proprieta — «mentre la
 * revoca gira si vedono tutti i figli o nessuno» — e passava. Passava per una
 * ragione vera: lo sweep gira dentro una transazione, quindi chi **legge**
 * vede lo stato di prima o quello di dopo, mai una via di mezzo. Quella
 * proprieta regge gia, e tenerla verde qui non direbbe niente.
 *
 * Il reperto R-2 e una corsa **fra due scritture**, non una questione di
 * visibilita in lettura. PP02-D34 lo dice: «scegliere le schede fuori dal
 * blocco fa sfuggire quella che acquista il tutore mentre la revoca gira». Lo
 * sweep sceglie **prima** l'elenco degli atleti e poi lo percorre: una scheda a
 * cui la segreteria aggiunge quel tutore **dopo** che l'elenco e stato scelto
 * non e in quell'elenco, e la revoca la salta. La tessera sparisce, l'audit
 * registra, e su quella scheda il tutore entra.
 *
 * ## Perche la misura di W-79 non bastava
 *
 * La KB dichiarava questa finestra chiusa, e la sonda che lo diceva provava
 * **una** taglia di club e **uno** sfasamento — un istante in cui la finestra
 * non si apre. La RCA (KB 44 §3) chiama questo per nome: «la copertura e alta,
 * la varieta e bassa».
 *
 * Qui lo sfasamento non si indovina: si **percorre**. La revoca viene
 * cronometrata una volta, e poi la scrittura concorrente viene inserita a
 * frazioni diverse della sua durata. Se esiste un istante in cui la finestra si
 * apre, un giro lo trova.
 *
 * ## La porta
 *
 * La scrittura concorrente passa da `updateResource`, cioe dal salvataggio
 * ordinario dell'anagrafica: e il gesto che la segreteria fa davvero mentre un
 * proprietario, in un'altra scheda, revoca un accesso.
 *
 * La sonda misura, non corregge. Il club viene cancellato in `finally`.
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
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(66)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        nota: ${nota}`);
};

const CLUB = randomUUID();
/** Tanti da far durare una scansione: la finestra e lunga quanto lei. */
const FIGLI_DI_FONDO = 60;
/** Le frazioni della durata della revoca in cui si prova a infilarsi. */
const SFASAMENTI = [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85];

let PRESIDENTE = null;
let TUTORE = null;
let schedeTardive = [];

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

const utente = async (email, nome) =>
  prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      first_name: nome,
      last_name: "Corsa",
      password_hash: "$2b$10$corsa",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });

const pulisciResidui = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "corsa-" } },
    select: { id: true },
  });
  const ids = residui.map((r) => r.id);
  if (ids.length) {
    await prisma.auditLog
      .deleteMany({ where: { organization_id: { in: ids } } })
      .catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.user.deleteMany({ where: { email: { startsWith: "corsa-" } } });
};

const rigaTutore = () => ({
  id: `guardian-${TUTORE.id}`,
  name: TUTORE.first_name,
  surname: TUTORE.last_name,
  relationship: "Madre",
  email: TUTORE.email,
  linkedUserId: TUTORE.id,
});

const creaAtleta = async (nome, conTutore) => {
  const id = randomUUID();
  await prisma.athlete.create({
    data: {
      id,
      organization_id: CLUB,
      first_name: nome,
      last_name: "Corsa",
      birth_date: new Date(Date.UTC(2013, 4, 12)),
      status: "active",
      category_id: "cat-corsa",
      category_name: "Under 12",
      data: conTutore ? { guardians: [rigaTutore()] } : {},
      updated_at: new Date(),
    },
  });
  return id;
};

const semina = async () => {
  await pulisciResidui();

  PRESIDENTE = await utente("corsa-presidente@example.invalid", "Paola");
  TUTORE = await utente("corsa-tutore@example.invalid", "Teresa");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `corsa-${Date.now()}`,
      name: "ASD Corsa",
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
      categories: [{ id: "cat-corsa", name: "Under 12" }],
      club_sites: [{ id: "sede-corsa", name: "Sede", active: true }],
      trainers: [],
      staff_members: [],
      trainings: [],
      matches: [],
      appointments: [],
      updated_at: new Date(),
    },
  });

  for (let i = 0; i < FIGLI_DI_FONDO; i += 1) {
    await creaAtleta(`Fondo${i}`, true);
  }

  /* Una scheda «tardiva» per ogni sfasamento: nasce senza il tutore. */
  schedeTardive = [];
  for (let i = 0; i < SFASAMENTI.length; i += 1) {
    schedeTardive.push(await creaAtleta(`Tardiva${i}`, false));
  }
};

/** La tessera del tutore, ricreata prima di ogni giro. */
const concediTessera = async () => {
  await prisma.organizationUser.deleteMany({
    where: { organization_id: CLUB, user_id: TUTORE.id },
  });
  return prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: TUTORE.id,
      role: "parent",
      is_primary: true,
      updated_at: new Date(),
    },
  });
};

/** Toglie il tutore da una scheda, per rimetterla com'era prima del giro. */
const ripulisciScheda = async (athleteId) => {
  await prisma.athlete.update({
    where: { id: athleteId },
    data: { data: {} },
  });
};

/* -------------------------------------------------------------------- corpo */

const main = async () => {
  await semina();

  const cruscotto = await carica("src/lib/server/parent-dashboard.ts");
  const accessi = await carica("src/lib/server/club-roles.ts");
  const risorse = await carica("src/lib/server/resources.ts");

  const scope = {
    userId: PRESIDENTE.id,
    activeOrganizationId: CLUB,
    activeRole: "owner",
    activeMembershipId: null,
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

  console.log(
    `\n§1 — quanto dura una revoca su ${FIGLI_DI_FONDO} schede con lo stesso tutore\n`,
  );

  const tesseraProva = await concediTessera();
  const inizio = Date.now();
  await accessi.revokeClubAccess(scope, tesseraProva.id);
  const durata = Date.now() - inizio;
  console.log(`      durata misurata: ${durata} ms`);
  console.log(
    `      la finestra, se esiste, e lunga quanto questa scansione\n`,
  );

  prova("C-01 la revoca di prova riesce", true, durata > 0);

  console.log(
    `\n§2 — la scheda che acquista il tutore mentre la revoca gira\n`,
  );

  const sfuggite = [];

  for (const [indice, frazione] of SFASAMENTI.entries()) {
    const scheda = schedeTardive[indice];
    await ripulisciScheda(scheda);
    const tessera = await concediTessera();

    const ritardo = Math.max(0, Math.round(durata * frazione));

    /*
      Le due porte partono insieme e la seconda aspetta la sua frazione. Non e
      un `sleep` prima di chiamare: la revoca sta gia girando, ed e li che la
      finestra o si apre o non si apre.
    */
    const revoca = accessi.revokeClubAccess(scope, tessera.id);
    const scrittura = (async () => {
      await attendi(ritardo);
      /*
        La porta ordinaria: il salvataggio dell'anagrafica dalla segreteria.
        Se questa scrittura fallisce per un conflitto e un esito legittimo — la
        revoca ha vinto — e la scheda resta senza tutore.
      */
      try {
        await risorse.updateResource(
          "athletes",
          scheda,
          { data: { guardians: [rigaTutore()] } },
          scope,
          {},
        );
        return "scritta";
      } catch (errore) {
        return `respinta: ${String(errore?.message || errore).slice(0, 50)}`;
      }
    })();

    const [, esitoScrittura] = await Promise.all([revoca, scrittura]);

    const vede = await cruscotto.canParentAccessAthlete(TUTORE.id, scheda);
    const percentuale = `${Math.round(frazione * 100)}%`.padStart(4);

    console.log(
      `      sfasamento ${percentuale} (${String(ritardo).padStart(4)} ms)  ` +
        `scrittura: ${esitoScrittura.padEnd(22)}  il tutore la vede: ${vede}`,
    );

    if (vede) sfuggite.push({ sfasamento: percentuale, ritardo });
  }

  console.log("");

  prova(
    "C-10 R-2 — nessuna scheda sfugge alla revoca, a nessuno sfasamento",
    [],
    sfuggite,
    "una riga qui dentro e una scheda su cui il tutore revocato entra ancora: la tessera e sparita, l'audit ha registrato, e il fascicolo del minore e aperto",
  );

  console.log(
    `\n§3 — la varieta e la misura: ${SFASAMENTI.length} sfasamenti su una finestra di ${durata} ms\n`,
  );
  console.log(
    `      W-79 ne provava **uno**, su una taglia di club sola. Questa sonda`,
  );
  console.log(
    `      percorre la finestra: se un istante buono esiste, un giro lo trova.\n`,
  );
};

try {
  await main();
} finally {
  await prisma.auditLog
    .deleteMany({ where: { organization_id: CLUB } })
    .catch(() => {});
  await prisma.club.deleteMany({ where: { id: CLUB } }).catch(() => {});
  await prisma.user
    .deleteMany({ where: { email: { startsWith: "corsa-" } } })
    .catch(() => {});
  await prisma.$disconnect();
}

const ko = esiti.filter((e) => !e.ok).length;
console.log(`\nEsito: ${esiti.length - ko}/${esiti.length}`);
process.exit(ko ? 1 : 0);
