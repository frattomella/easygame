/**
 * **Il test di totalita del corpo della richiesta, contro un database vero.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs scripts/pp-02-totalita-corpo.mjs
 *
 * ---
 *
 * ## Perche esiste
 *
 * E la seconda meta della regola di KB 44 §4, sull'altra enumerazione: non i
 * ruoli, ma **i verbi**. La rotta generica leggeva il corpo in due modi, uno
 * per `POST`/`upsert` e uno per `PATCH`, e i due dovevano restare d'accordo
 * senza che nulla lo verificasse (reperto R-3).
 *
 * Su `athletes` — una scheda che ha una colonna chiamata `data` — la
 * divergenza si vedeva: un `PATCH` con il corpo **non incartato**, cioe la
 * forma che il `POST` della stessa rotta accetta, rispondeva **200 senza
 * scrivere il campo chiesto**.
 *
 * ## Che cosa misura
 *
 * Le porte vere: `POST /api/v1/<risorsa>` e `PATCH /api/v1/<risorsa>/<id>`,
 * con una sessione vera, contro PostgreSQL.
 *
 *   * **totalita** — la stessa forma di corpo, sui due verbi, produce lo
 *     stesso verdetto; e cio che il round 28 ha visto divergere;
 *   * **niente 200 muto** — una richiesta di scrittura che, dopo la
 *     risoluzione, non porta nessun campo da scrivere e un 400, non un 200
 *     che somiglia a un successo.
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
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(74)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        nota: ${nota}`);
};

const CLUB = randomUUID();
const SLUG = `pp02corpo-${Date.now()}`;

let PRESIDENTE = null;
let SESSIONE = null;
let rotte = null;

const pulisciResidui = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp02corpo-" } },
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
    where: { email: { startsWith: "pp02corpo-" } },
  });
};

const semina = async () => {
  await pulisciResidui();

  PRESIDENTE = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: "pp02corpo-presidente@example.invalid",
      first_name: "Paola",
      last_name: "Corpo",
      password_hash: "$2b$10$pp02corpo",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: SLUG,
      name: "ASD Corpo",
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
      categories: [{ id: "cat-corpo", name: "Under 12" }],
      club_sites: [{ id: "sede-corpo", name: "Sede", active: true }],
      trainers: [],
      staff_members: [],
      trainings: [],
      matches: [],
      appointments: [],
      updated_at: new Date(),
    },
  });

  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: PRESIDENTE.id,
      role: "owner",
      is_primary: true,
      updated_at: new Date(),
    },
  });
};

/** Il trasporto verso i route handler veri, con una sessione vera. */
const preparaTrasporto = async () => {
  rotte = {
    elenco: await carica("src/app/api/v1/[resource]/route.ts"),
    riga: await carica("src/app/api/v1/[resource]/[id]/route.ts"),
  };
};

const chiama = async (metodo, percorso, corpo) => {
  const url = new URL(percorso, "http://collaudo.invalid");
  const headers = new Headers({
    "content-type": "application/json",
    authorization: `Bearer ${SESSIONE}`,
    "x-active-club-id": CLUB,
    "x-active-access-role": "owner",
  });
  const richiesta = new Request(url.toString(), {
    method: metodo,
    headers,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });

  const segmenti = url.pathname.replace(/^\/api\/v1\//, "").split("/");
  const risposta =
    segmenti.length === 1
      ? await rotte.elenco[metodo](richiesta, {
          params: { resource: segmenti[0] },
        })
      : await rotte.riga[metodo](richiesta, {
          params: { resource: segmenti[0], id: segmenti[1] },
        });

  return { stato: risposta.status, corpo: await risposta.json() };
};

/* -------------------------------------------------------------------- corpo */

const main = async () => {
  await semina();
  const auth = await carica("src/lib/server/auth.ts");
  SESSIONE = (await auth.createSessionForUser(PRESIDENTE)).access_token;
  await preparaTrasporto();

  console.log("\n§1 — la stessa lettura del corpo sui tre verbi\n");

  /*
    Il caso che il round 28 ha trovato: `athletes` ha una colonna `data`, e un
    corpo NON incartato che la porta accanto a un campo del dominio veniva
    scambiato per un involucro. Il campo del dominio cadeva.
  */
  const creata = await chiama("POST", "/api/v1/athletes", {
    id: randomUUID(),
    first_name: "Nudo",
    last_name: "Corpo",
    status: "active",
    data: { nota: "prima" },
  });
  prova("C-01 il POST accetta il corpo non incartato", 200, creata.stato);

  const atletaId = creata.corpo?.data?.id;
  prova("C-02 il POST ha scritto il campo del dominio", "Nudo", creata.corpo?.data?.first_name);

  /* La forma che rispondeva 200 senza scrivere. */
  const patchNudo = await chiama("PATCH", `/api/v1/athletes/${atletaId}`, {
    first_name: "Vestito",
    data: { nota: "dopo" },
  });
  prova("C-03 il PATCH non incartato risponde 200", 200, patchNudo.stato);

  const dopoNudo = await prisma.athlete.findUnique({
    where: { id: atletaId },
    select: { first_name: true, data: true },
  });
  prova(
    "C-04 TOTALITA — e il PATCH non incartato ha davvero scritto",
    ["Vestito", "dopo"],
    [dopoNudo?.first_name, dopoNudo?.data?.nota],
    "prima della correzione qui usciva 200 con `first_name` ancora «Nudo»",
  );

  /* L'involucro vero continua a funzionare: la correzione non lo rompe. */
  const patchIncartato = await chiama("PATCH", `/api/v1/athletes/${atletaId}`, {
    data: { first_name: "Incartato", last_name: "Corpo", status: "active" },
  });
  prova("C-05 il PATCH incartato risponde 200", 200, patchIncartato.stato);
  const dopoIncartato = await prisma.athlete.findUnique({
    where: { id: atletaId },
    select: { first_name: true },
  });
  prova(
    "C-06 e l'involucro resta un involucro",
    "Incartato",
    dopoIncartato?.first_name,
  );

  console.log("\n§2 — niente 200 muto\n");

  const vuoto = await chiama("PATCH", `/api/v1/athletes/${atletaId}`, {});
  prova(
    "C-10 un PATCH senza campi da scrivere e 400, non 200",
    400,
    vuoto.stato,
    "un 200 qui vuol dire: chi ha chiamato crede di aver salvato",
  );

  const involucroVuoto = await chiama("PATCH", `/api/v1/athletes/${atletaId}`, {
    data: {},
  });
  prova(
    "C-11 e nemmeno un involucro vuoto passa per un salvataggio",
    400,
    involucroVuoto.stato,
  );

  const postVuoto = await chiama("POST", "/api/v1/athletes", {});
  prova("C-12 lo stesso verdetto sul POST", 400, postVuoto.stato);

  console.log("\n§3 — lo stesso verdetto, risorsa per risorsa\n");

  /*
    La totalita sull'asse delle risorse. Il dominio non e scritto qui: e
    `RESOURCE_CONFIG`. Per ogni risorsa che la rotta generica lascia creare,
    si scrive con un corpo **non incartato** dal `POST` e poi si riscrive con
    un corpo **non incartato** dal `PATCH`, e si rilegge dalla porta `GET`.

    Confrontare due volte lo stesso lettore non proverebbe niente — sarebbe
    una sonda vacua. Qui si misurano le **due porte**: e la divergenza fra i
    due verbi che il reperto R-3 descriveva, e solo il comportamento la vede.

    Una risorsa che il dominio rifiuta di creare non viene contata fra i
    successi: finisce nell'elenco delle **non esercitate**, che si stampa. Un
    buco di copertura fa parte del verbale, non del silenzio.
  */
  const risorse = await carica("src/lib/server/resources.ts");
  const aperte = Object.keys(risorse.RESOURCE_CONFIG).filter(
    (nome) => !risorse.isClosedResource(nome),
  );

  const esercitate = [];
  const nonEsercitate = [];
  const mute = [];

  for (const risorsa of aperte) {
    const id = randomUUID();
    const creazione = await chiama("POST", `/api/v1/${risorsa}`, {
      id,
      name: "Corpo Prima",
      data: { nota: "prima" },
    });
    if (creazione.stato !== 200) {
      nonEsercitate.push({
        risorsa,
        stato: creazione.stato,
        motivo: String(creazione.corpo?.error?.message || "").slice(0, 64),
      });
      continue;
    }

    const idCreato = creazione.corpo?.data?.id || id;
    const modifica = await chiama("PATCH", `/api/v1/${risorsa}/${idCreato}`, {
      name: "Corpo Dopo",
      data: { nota: "dopo" },
    });
    if (modifica.stato !== 200) {
      nonEsercitate.push({
        risorsa,
        stato: modifica.stato,
        motivo: String(modifica.corpo?.error?.message || "").slice(0, 64),
      });
      continue;
    }

    const riletta = await chiama("GET", `/api/v1/${risorsa}/${idCreato}`);
    const nome = riletta.corpo?.data?.name;
    esercitate.push(risorsa);

    /*
      Il cuore: il `PATCH` ha risposto 200. Se il nome e rimasto quello del
      `POST`, quel 200 era muto — la forma esatta di R-3.
    */
    if (nome !== "Corpo Dopo") mute.push({ risorsa, nome: nome ?? null });
  }

  prova(
    `C-20 TOTALITA — nessun 200 muto sul PATCH non incartato (${esercitate.length} risorse)`,
    [],
    mute,
    "una risorsa qui dentro risponde 200 e non scrive quello che le e stato chiesto",
  );

  console.log(`
      risorse aperte dichiarate da RESOURCE_CONFIG : ${aperte.length}`);
  console.log(`      esercitate dai due verbi                    : ${esercitate.length}`);
  console.log(`      non esercitate (il dominio le rifiuta)      : ${nonEsercitate.length}`);
  for (const riga of nonEsercitate) {
    console.log(`        - ${riga.risorsa.padEnd(26)} ${riga.stato}  ${riga.motivo}`);
  }
  console.log("");
};

try {
  await main();
} finally {
  await prisma.auditLog
    .deleteMany({ where: { organization_id: CLUB } })
    .catch(() => {});
  await prisma.club.deleteMany({ where: { id: CLUB } }).catch(() => {});
  await prisma.user
    .deleteMany({ where: { email: { startsWith: "pp02corpo-" } } })
    .catch(() => {});
  await prisma.$disconnect();
}

const ko = esiti.filter((e) => !e.ok).length;
console.log(`\nEsito: ${esiti.length - ko}/${esiti.length}`);
process.exit(ko ? 1 : 0);
