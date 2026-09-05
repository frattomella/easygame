/**
 * **PP-03 round 3 (c) — le conferme.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/pp-03-round3-conferme-probe.mjs
 *
 * Tre domande che decidono la gravita di quanto misurato in (b):
 *
 * 1. la notifica di un altro si raggiunge **per identificativo** anche
 *    attraverso l'alias `simplified_notifications`, e anche fra club diversi?
 *    E cosa contiene una notifica vera (non una di collaudo)?
 * 2. i nomi liberi dentro `athletes.data` li scrive davvero il prodotto dalla
 *    **rotta vera**, o solo questa sonda direttamente in archivio?
 * 3. con una pagina piu stretta del perimetro, cosa riceve l'allenatore?
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
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
  esiti.push({ titolo, ok, nota });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(70)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        ${nota}`);
};

const CLUB = randomUUID();
const ALTRO = randomUUID();
const CAT_A = "cat-r3c-a";
const CAT_B = "cat-r3c-b";
const SEDE_1 = "sede-r3c-nord";

const ATLETI_A = Array.from({ length: 3 }, () => randomUUID());
const ATLETI_B = Array.from({ length: 12 }, () => randomUUID());

let PRESIDENTE = null;
let MISTER_A = null;
let GENITORE = null;
let ESTRANEO = null;
let NOTIFICA_GENITORE = null;
let NOTIFICA_ALTRO_CLUB = null;

const SEGRETO_ECONOMICO = "INSOLUTO 480,00 EUR — famiglia Rossi, tre rate scadute";

/* ----------------------------------------------------------- trasporto */

const RADICE = path.resolve("src/app/api/v1");
const scopriRotte = (dir = RADICE, prefisso = []) => {
  const trovate = [];
  for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
    if (voce.isDirectory()) {
      trovate.push(...scopriRotte(path.join(dir, voce.name), [...prefisso, voce.name]));
    } else if (voce.name === "route.ts") {
      trovate.push({ segmenti: prefisso, file: path.join(dir, voce.name) });
    }
  }
  return trovate;
};
const ROTTE = scopriRotte().sort(
  (a, b) =>
    a.segmenti.filter((s) => s.startsWith("[")).length -
    b.segmenti.filter((s) => s.startsWith("[")).length,
);
const abbina = (percorso) => {
  const segmenti = percorso.replace(/^\/api\/v1\//, "").split("/").filter(Boolean);
  for (const rotta of ROTTE) {
    if (rotta.segmenti.length !== segmenti.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < segmenti.length; i += 1) {
      const atteso = rotta.segmenti[i];
      if (atteso.startsWith("[")) params[atteso.slice(1, -1)] = segmenti[i];
      else if (atteso !== segmenti[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { rotta, params };
  }
  return null;
};

let SESSIONE = null;
let RUOLO = null;
let CLUB_ATTIVO = CLUB;
const moduli = new Map();

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input), "http://collaudo.invalid");
  const metodo = String(init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers || {});
  if (SESSIONE) headers.set("authorization", `Bearer ${SESSIONE}`);
  if (CLUB_ATTIVO) headers.set("x-active-club-id", CLUB_ATTIVO);
  if (RUOLO) headers.set("x-active-access-role", RUOLO);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const richiesta = new Request(url.toString(), { ...init, headers });
  const abbinata = abbina(url.pathname);
  if (!abbinata) throw new Error(`NESSUNA-ROTTA ${url.pathname}`);
  if (!moduli.has(abbinata.rotta.file)) {
    moduli.set(abbinata.rotta.file, await import(pathToFileURL(abbinata.rotta.file).href));
  }
  const fn = moduli.get(abbinata.rotta.file)[metodo];
  if (!fn) throw new Error(`NESSUN-HANDLER ${metodo} ${url.pathname}`);
  return fn(richiesta, { params: abbinata.params });
};

const chiama = async (percorso, init) => {
  try {
    const risposta = await globalThis.fetch(percorso, init);
    const corpo = await risposta.json().catch(() => null);
    return { stato: risposta.status, corpo };
  } catch (errore) {
    return { stato: -1, corpo: { error: { message: String(errore?.message) } } };
  }
};

const comeUtente = async (riga, ruolo, club = CLUB) => {
  const auth = await carica("src/lib/server/auth.ts");
  SESSIONE = (await auth.createSessionForUser(riga)).access_token;
  RUOLO = ruolo;
  CLUB_ATTIVO = club;
};

const utente = async (email, nome) => {
  const trovato = await prisma.user.findUnique({ where: { email } });
  if (trovato) return trovato;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      first_name: nome,
      last_name: "R3c",
      password_hash: "$2b$10$pp03r3c",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const semina = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp03r3c-" } },
    select: { id: true },
  });
  if (residui.length) {
    const ids = residui.map((r) => r.id);
    await prisma.auditLog.deleteMany({ where: { organization_id: { in: ids } } }).catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }

  PRESIDENTE = await utente("pp03r3c-presidente@example.invalid", "Anna");
  MISTER_A = await utente("pp03r3c-mister-a@example.invalid", "Aldo");
  GENITORE = await utente("pp03r3c-genitore@example.invalid", "Gina");
  ESTRANEO = await utente("pp03r3c-estraneo@example.invalid", "Elia");

  const settings = {
    seasons: [
      { id: "2026-27", label: "2026/27", startDate: "2026-07-01", endDate: "2027-06-30", status: "active" },
    ],
  };

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `pp03r3c-${Date.now()}`,
      name: "ASD Round3c",
      creator_id: PRESIDENTE.id,
      settings,
      categories: [
        { id: CAT_A, name: "Under 12" },
        { id: CAT_B, name: "Under 15" },
      ],
      club_sites: [{ id: SEDE_1, name: "Sede Nord", active: true }],
      category_groups: [],
      structures: [],
      trainers: [
        {
          id: "trainer-r3c-a",
          first_name: "Aldo",
          last_name: "R3c",
          email: MISTER_A.email,
          linkedUserId: MISTER_A.id,
          categories: [CAT_A],
          groups: [],
        },
      ],
      staff_members: [],
      trainings: [],
      matches: [],
      appointments: [],
      updated_at: new Date(),
    },
  });

  await prisma.club.create({
    data: {
      id: ALTRO,
      slug: `pp03r3c-altro-${Date.now()}`,
      name: "ASD Estranea R3c",
      creator_id: ESTRANEO.id,
      settings,
      categories: [],
      updated_at: new Date(),
    },
  });

  for (const [riga, ruolo, club] of [
    [MISTER_A, "trainer", CLUB],
    [PRESIDENTE, "owner", CLUB],
    [GENITORE, "parent", CLUB],
    [ESTRANEO, "owner", ALTRO],
  ]) {
    await prisma.organizationUser.create({
      data: {
        id: randomUUID(),
        organization_id: club,
        user_id: riga.id,
        role: ruolo,
        is_primary: true,
        updated_at: new Date(),
      },
    });
  }

  await prisma.athlete.createMany({
    data: [
      ...ATLETI_A.map((id, i) => ({
        id,
        organization_id: CLUB,
        first_name: `AtletaA${i}`,
        last_name: "Zulu",
        status: "active",
        category_id: CAT_A,
        category_name: "Under 12",
        data: {},
        created_at: new Date(Date.now() + 900000 + i),
        updated_at: new Date(),
      })),
      ...ATLETI_B.map((id, i) => ({
        id,
        organization_id: CLUB,
        first_name: `AtletaB${i}`,
        last_name: "Alfa",
        status: "active",
        category_id: CAT_B,
        category_name: "Under 15",
        data: {},
        created_at: new Date(Date.now() + i),
        updated_at: new Date(),
      })),
    ],
  });

  await prisma.athleteCategoryMembership.createMany({
    data: [
      ...ATLETI_A.map((id) => ({
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: id,
        category_id: CAT_A,
        site_id: SEDE_1,
        updated_at: new Date(),
      })),
      ...ATLETI_B.map((id) => ({
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: id,
        category_id: CAT_B,
        site_id: SEDE_1,
        updated_at: new Date(),
      })),
    ],
  });

  NOTIFICA_GENITORE = await prisma.notification.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: GENITORE.id,
      title: "Rate scadute",
      message: SEGRETO_ECONOMICO,
      type: "payment",
      data: { amount: 480, athleteId: ATLETI_B[0] },
      updated_at: new Date(),
    },
  });

  NOTIFICA_ALTRO_CLUB = await prisma.notification.create({
    data: {
      id: randomUUID(),
      organization_id: ALTRO,
      user_id: ESTRANEO.id,
      title: "Di un altro club",
      message: "riservata al club estraneo",
      type: "info",
      updated_at: new Date(),
    },
  });
};

const pulisci = async () => {
  await prisma.auditLog
    .deleteMany({ where: { organization_id: { in: [CLUB, ALTRO] } } })
    .catch(() => {});
  await prisma.club.deleteMany({ where: { id: { in: [CLUB, ALTRO] } } }).catch((e) => {
    console.error(`Pulizia non riuscita: ${e?.message}`);
  });
};

/* ==================================================================== */

const attaccoNotificaGenitore = async () => {
  console.log("\nN — la notifica economica di una famiglia, per identificativo");
  await comeUtente(MISTER_A, "trainer");

  const elenco = await chiama(`/api/v1/notifications?club_id=${CLUB}`);
  const titoli = (elenco.corpo?.data || []).map((r) => r.title);
  prova(
    "N-01 · l'elenco non porta la notifica del genitore",
    false,
    titoli.includes("Rate scadute"),
    `stato ${elenco.stato} titoli ${JSON.stringify(titoli)}`,
  );

  const perId = await chiama(`/api/v1/notifications/${NOTIFICA_GENITORE.id}`);
  prova(
    "N-02 · GET /notifications/:id della famiglia negato",
    true,
    perId.stato !== 200,
    `stato ${perId.stato} corpo ${JSON.stringify(perId.corpo).slice(0, 220)}`,
  );
  prova(
    "N-03 · l'importo insoluto della famiglia non esce",
    false,
    JSON.stringify(perId.corpo).includes(SEGRETO_ECONOMICO),
  );

  const alias = await chiama(`/api/v1/simplified_notifications/${NOTIFICA_GENITORE.id}`);
  prova(
    "N-04 · idem dall'alias simplified_notifications",
    true,
    alias.stato !== 200,
    `stato ${alias.stato}`,
  );

  const fuori = await chiama(`/api/v1/notifications/${NOTIFICA_ALTRO_CLUB.id}`);
  prova(
    "N-05 · la notifica di un altro club e negata",
    true,
    fuori.stato !== 200,
    `stato ${fuori.stato}`,
  );

  const cancella = await chiama(`/api/v1/notifications/${NOTIFICA_GENITORE.id}`, {
    method: "DELETE",
  });
  prova(
    "N-06 · DELETE della notifica della famiglia negato",
    true,
    cancella.stato !== 200,
    `stato ${cancella.stato}`,
  );
  const rimasta = await prisma.notification.findUnique({
    where: { id: NOTIFICA_GENITORE.id },
  });
  prova("N-07 · la notifica della famiglia e ancora in archivio", true, Boolean(rimasta));
};

const attaccoDatoLiberoDallaRotta = async () => {
  console.log("\nO — i nomi liberi scritti dalla rotta vera, non dall'archivio");
  await comeUtente(PRESIDENTE, "owner");

  const scrittura = await chiama(`/api/v1/athletes/${ATLETI_A[0]}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        diagnosi: "DIAGNOSI-DA-ROTTA-cardiopatia",
        referto: "REFERTO-DA-ROTTA",
        allergies: "NOTO-allergia",
      },
    }),
  });
  prova(
    "O-01 · il proprietario scrive nomi liberi in athletes.data",
    200,
    scrittura.stato,
    JSON.stringify(scrittura.corpo?.error || "").slice(0, 200),
  );

  const riletto = await prisma.athlete.findUnique({ where: { id: ATLETI_A[0] } });
  prova(
    "O-02 · l'archivio ha accettato la chiave libera",
    true,
    JSON.stringify(riletto?.data || {}).includes("DIAGNOSI-DA-ROTTA-cardiopatia"),
    `data=${JSON.stringify(riletto?.data).slice(0, 200)}`,
  );

  await comeUtente(MISTER_A, "trainer");
  const letto = await chiama(`/api/v1/athletes/${ATLETI_A[0]}`);
  const testo = JSON.stringify(letto.corpo);
  prova(
    "O-03 · l'allenatore NON legge la chiave libera",
    false,
    testo.includes("DIAGNOSI-DA-ROTTA-cardiopatia") || testo.includes("REFERTO-DA-ROTTA"),
    `stato ${letto.stato} corpo ${testo.slice(0, 300)}`,
  );
  prova(
    "O-04 · l'allenatore NON legge la chiave nota",
    false,
    testo.includes("NOTO-allergia"),
  );
};

const attaccoPaginaStretta = async () => {
  console.log("\nP — la pagina piu stretta del perimetro");
  await comeUtente(MISTER_A, "trainer");

  for (const limite of [1, 2, 5]) {
    const r = await chiama(`/api/v1/athletes?club_id=${CLUB}&limit=${limite}&offset=0`);
    const righe = (r.corpo?.data || []).length;
    const meta = r.corpo?.meta || null;
    prova(
      `P-01 · limit=${limite}: la prima pagina non e vuota`,
      true,
      righe > 0,
      `righe ${righe}, meta ${JSON.stringify(meta)} — 3 atleti nel perimetro, 15 nel club`,
    );
    prova(
      `P-02 · limit=${limite}: meta.total e il perimetro, non il club`,
      3,
      meta?.total ?? null,
      `meta ${JSON.stringify(meta)}`,
    );
  }

  /* Quante righe si raccolgono percorrendo tutte le pagine? */
  const raccolte = new Set();
  for (let offset = 0; offset < 20; offset += 2) {
    const r = await chiama(`/api/v1/athletes?club_id=${CLUB}&limit=2&offset=${offset}`);
    for (const riga of r.corpo?.data || []) raccolte.add(riga.id);
  }
  prova(
    "P-03 · percorrendo tutte le pagine si ritrovano i tre atleti",
    3,
    raccolte.size,
    `raccolti ${raccolte.size} su 3 — se e minore, la paginazione nasconde gli atleti a chi li allena`,
  );
};

const main = async () => {
  console.log("\n  PP-03 round 3 (c) — le conferme\n");
  await semina();
  try {
    await attaccoNotificaGenitore();
    await attaccoDatoLiberoDallaRotta();
    await attaccoPaginaStretta();
  } finally {
    await pulisci();
  }
  const falliti = esiti.filter((e) => !e.ok);
  console.log(`\n  ${esiti.length - falliti.length}/${esiti.length} corretti.`);
  if (falliti.length) {
    console.log("\n  ESITI NEGATIVI:");
    for (const f of falliti) console.log(`   - ${f.titolo}${f.nota ? `  [${f.nota}]` : ""}`);
    process.exitCode = 2;
  }
};

main()
  .catch((errore) => {
    console.error(errore);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
