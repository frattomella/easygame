/**
 * **PP-03 round 5 — `club_resource_items`, la seconda porta sulle stesse righe.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/pp-03-round5-registro-secondaporta-probe.mjs
 *
 * §1 del verbale ha chiuso `GET /api/v1/secretariat_notes` mettendo la risorsa
 * in `TRAINER_DASHBOARD_FILTERED_RESOURCES`. Quel filtro si accende su
 * `canonicalResourceName(resource)`, e le note **non vivono in una tabella
 * propria**: sono righe di `club_resource_items` con `resource_type =
 * "secretariat_notes"`. Il contenitore sta in `TRAINER_READ_RESOURCES` e il suo
 * nome canonico e `club_resource_items`, che nel filtro non c'e.
 *
 * `PASS` = attacco respinto. `FAIL` = attacco riuscito.
 * Il club di collaudo viene cancellato in `finally`.
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
const info = (titolo, valore) =>
  console.log(`  INFO  ${titolo.padEnd(70)} ${JSON.stringify(valore)}`);

/* ---------------------------------------------------------- gli attori -- */

const CLUB = randomUUID();
const CAT_A = "cat-r5-a";
const CAT_B = "cat-r5-b";

let PRESIDENTE = null;
let MISTER_A = null;
let MISTER_B = null;

const SEGRETI = {
  "nota.interna": "MOROSITA-FAMIGLIA-ROSSI-TRE-MESI",
  "nota.per.bruno": "RISERVATO-A-BRUNO-COLLOQUIO-DISCIPLINARE",
  "nota.per.tutti": "CHIUSURA-PALESTRA-25-APRILE",
  "iban.collega": "IT60X0542811101000000999999",
  "telefono.collega": "+39 333 2220002",
  "nota.collega": "CONTENZIOSO-APERTO-CON-IL-CLUB",
};

const cerca = (corpo) => {
  const testo = JSON.stringify(corpo ?? null);
  return Object.entries(SEGRETI)
    .filter(([, v]) => testo.includes(v))
    .map(([k]) => k);
};

/* --------------------------------------------------------- il trasporto - */

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
      if (atteso.startsWith("[")) params[atteso.slice(1, -1)] = decodeURIComponent(segmenti[i]);
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
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const richiesta = new Request(url.toString(), { ...init, headers });
  const abbinata = abbina(url.pathname);
  if (!abbinata) throw new Error(`NESSUNA-ROTTA ${url.pathname}`);
  const chiave = abbinata.rotta.file;
  if (!moduli.has(chiave)) moduli.set(chiave, await import(pathToFileURL(chiave).href));
  const fn = moduli.get(chiave)[metodo];
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

const comeUtente = async (utenteRiga, ruolo, club = CLUB) => {
  const auth = await carica("src/lib/server/auth.ts");
  const sessione = await auth.createSessionForUser(utenteRiga);
  SESSIONE = sessione.access_token;
  RUOLO = ruolo;
  CLUB_ATTIVO = club;
};

/* ------------------------------------------------------------- la semina */

const utente = async (email, nome) => {
  const trovato = await prisma.user.findUnique({ where: { email } });
  if (trovato) return trovato;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      first_name: nome,
      last_name: "R5",
      password_hash: "$2b$10$pp03r5",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const semina = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp03r5a-" } },
    select: { id: true },
  });
  if (residui.length) {
    const ids = residui.map((r) => r.id);
    await prisma.auditLog.deleteMany({ where: { organization_id: { in: ids } } }).catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }

  PRESIDENTE = await utente("pp03r5a-presidente@example.invalid", "Anna");
  MISTER_A = await utente("pp03r5a-mister-a@example.invalid", "Aldo");
  MISTER_B = await utente("pp03r5a-mister-b@example.invalid", "Bruno");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `pp03r5a-${Date.now()}`,
      name: "ASD Round5 A",
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
      categories: [
        { id: CAT_A, name: "Under 12" },
        { id: CAT_B, name: "Under 15" },
      ],
      club_sites: [],
      category_groups: [],
      structures: [],
      trainers: [
        {
          id: "trainer-r5-a",
          first_name: "Aldo",
          last_name: "R5",
          email: MISTER_A.email,
          linkedUserId: MISTER_A.id,
          categories: [CAT_A],
          groups: [],
        },
        {
          id: "trainer-r5-b",
          first_name: "Bruno",
          last_name: "R5",
          email: MISTER_B.email,
          linkedUserId: MISTER_B.id,
          categories: [CAT_B],
          groups: [],
          iban: SEGRETI["iban.collega"],
          phone: SEGRETI["telefono.collega"],
          notes: SEGRETI["nota.collega"],
        },
      ],
      staff_members: [],
      trainings: [],
      matches: [],
      appointments: [],
      updated_at: new Date(),
    },
  });

  for (const [riga, ruolo] of [
    [MISTER_A, "trainer"],
    [MISTER_B, "trainer"],
    [PRESIDENTE, "owner"],
  ]) {
    await prisma.organizationUser.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        user_id: riga.id,
        role: ruolo,
        is_primary: true,
        updated_at: new Date(),
      },
    });
  }
};

const pulisci = async () => {
  await prisma.auditLog.deleteMany({ where: { organization_id: CLUB } }).catch(() => {});
  await prisma.club.deleteMany({ where: { id: CLUB } }).catch((e) => {
    console.error(`Pulizia non riuscita: ${e?.message}`);
  });
};

/* ==================================================================== */

/*
  Le note si seminano dalla **rotta vera** come presidente: scrivere la colonna
  del club a mano lascerebbe `club_resource_items` disallineato, e la sonda
  misurerebbe il proprio errore di semina invece del difetto.
*/
const seminaNote = async () => {
  await comeUtente(PRESIDENTE, "owner");
  for (const nota of [
    {
      id: "nota-interna-r5",
      content: SEGRETI["nota.interna"],
      targetType: "club_dashboard",
    },
    {
      id: "nota-per-bruno-r5",
      content: SEGRETI["nota.per.bruno"],
      targetType: "trainer",
      targetId: "trainer-r5-b",
    },
    {
      id: "nota-per-tutti-r5",
      content: SEGRETI["nota.per.tutti"],
      targetType: "all_trainers",
    },
  ]) {
    const esito = await chiama("/api/v1/secretariat_notes", {
      method: "POST",
      body: JSON.stringify({ data: { ...nota, date: new Date().toISOString() } }),
    });
    if (esito.stato >= 400) {
      console.log(
        `        semina nota ${nota.id}: stato ${esito.stato} ${JSON.stringify(esito.corpo?.error)}`,
      );
    }
  }
};

const attaccoNote = async () => {
  console.log("\nA — la nota di segreteria dalla porta accanto");
  await comeUtente(MISTER_A, "trainer");

  /* A-00 — controllo di sanita: la porta per nome e chiusa (regressione §1). */
  const perNome = await chiama(`/api/v1/secretariat_notes?club_id=${CLUB}`);
  prova(
    "A-00 · regressione §1 — /secretariat_notes non porta le note altrui",
    ["nota.per.tutti"],
    cerca(perNome.corpo),
    `stato ${perNome.stato}`,
  );

  /* A-01 — la stessa riga, chiesta per contenitore. */
  const perTipo = await chiama(
    `/api/v1/club_resource_items?club_id=${CLUB}&resource_type=secretariat_notes`,
  );
  prova(
    "A-01 · /club_resource_items?resource_type=secretariat_notes",
    ["nota.per.tutti"],
    cerca(perTipo.corpo),
    `stato ${perTipo.stato}; righe ${(perTipo.corpo?.data || []).length}`,
  );

  /* A-02 — senza nominare il tipo: il mazzo intero. */
  const senzaTipo = await chiama(`/api/v1/club_resource_items?club_id=${CLUB}`);
  prova(
    "A-02 · /club_resource_items senza resource_type",
    ["nota.per.tutti"],
    cerca(senzaTipo.corpo),
    `stato ${senzaTipo.stato}; tipi ${JSON.stringify(
      Array.from(new Set((senzaTipo.corpo?.data || []).map((r) => r?.resource_type))),
    )}`,
  );

  /* A-03 — la riga singola per identificativo. */
  const riga = await prisma.clubResourceItem.findFirst({
    where: { organization_id: CLUB, resource_type: "secretariat_notes" },
    orderBy: { created_at: "asc" },
  });
  const interna = await prisma.clubResourceItem.findFirst({
    where: {
      organization_id: CLUB,
      resource_type: "secretariat_notes",
      payload: { path: ["id"], equals: "nota-interna-r5" },
    },
  });
  info("A-03 · righe seminate", {
    trovate: await prisma.clubResourceItem.count({
      where: { organization_id: CLUB, resource_type: "secretariat_notes" },
    }),
    interna: interna?.id ?? null,
    prima: riga?.id ?? null,
  });

  if (interna) {
    const perId = await chiama(
      `/api/v1/club_resource_items/${interna.id}?club_id=${CLUB}`,
    );
    prova(
      "A-04 · /club_resource_items/<id della nota interna>",
      [],
      cerca(perId.corpo),
      `stato ${perId.stato}`,
    );
    const perIdNome = await chiama(
      `/api/v1/secretariat_notes/${interna.id}?club_id=${CLUB}`,
    );
    prova(
      "A-05 · /secretariat_notes/<id della nota interna>",
      [],
      cerca(perIdNome.corpo),
      `stato ${perIdNome.stato}`,
    );
  }

  /*
    A-06 — l'alias con la maiuscola. Non e una porta in piu: la rotta non lo
    riconosce affatto. Si misura perche §7.4 ha gia trovato un ramo che
    confrontava il nome **grezzo** mentre la decisione guardava il canonico, e
    una grafia che passa dove l'altra non passa e la forma di quel difetto.
  */
  const maiuscolo = await chiama(
    `/api/v1/Club_Resource_Items?club_id=${CLUB}&resource_type=secretariat_notes`,
  );
  prova(
    "A-06 · /Club_Resource_Items (maiuscole) non e una porta in piu",
    true,
    maiuscolo.stato >= 400 ||
      JSON.stringify(cerca(maiuscolo.corpo)) === JSON.stringify(["nota.per.tutti"]),
    `stato ${maiuscolo.stato} trovato ${JSON.stringify(cerca(maiuscolo.corpo))}`,
  );
};

const attaccoConteggio = async () => {
  console.log("\nD — il conteggio delle note, dalle due porte");
  await comeUtente(MISTER_A, "trainer");

  const perNome = await chiama(
    `/api/v1/secretariat_notes?club_id=${CLUB}&limit=5&offset=0`,
  );
  prova(
    "D-01 · meta.total di /secretariat_notes conta il perimetro",
    1,
    perNome.corpo?.meta?.total ?? null,
    `righe ${(perNome.corpo?.data || []).length}`,
  );

  const perTipo = await chiama(
    `/api/v1/club_resource_items?club_id=${CLUB}&resource_type=secretariat_notes&limit=5&offset=0`,
  );
  prova(
    "D-02 · meta.total di /club_resource_items conta il perimetro",
    1,
    perTipo.corpo?.meta?.total ?? null,
    `righe ${(perTipo.corpo?.data || []).length}`,
  );
};

const attaccoColleghi = async () => {
  console.log("\nB — l'anagrafica del collega dalla porta accanto");
  await comeUtente(MISTER_A, "trainer");

  const perNome = await chiama(`/api/v1/trainers?club_id=${CLUB}`);
  prova(
    "B-01 · regressione — /trainers non porta IBAN, telefono, note",
    [],
    cerca(perNome.corpo),
    `stato ${perNome.stato}`,
  );

  const perTipo = await chiama(
    `/api/v1/club_resource_items?club_id=${CLUB}&resource_type=trainers`,
  );
  prova(
    "B-02 · /club_resource_items?resource_type=trainers",
    [],
    cerca(perTipo.corpo),
    `stato ${perTipo.stato}; righe ${(perTipo.corpo?.data || []).length}`,
  );

  /*
    B-03 guarda **solo** i segreti dell'anagrafica: le note escono dalla stessa
    risposta, e sono il rilievo di A-02 — contarle due volte lo gonfierebbe.
  */
  const senzaTipo = await chiama(`/api/v1/club_resource_items?club_id=${CLUB}`);
  prova(
    "B-03 · /club_resource_items senza resource_type (anagrafica)",
    [],
    cerca(senzaTipo.corpo).filter((chiave) =>
      ["iban.collega", "telefono.collega", "nota.collega"].includes(chiave),
    ),
    `stato ${senzaTipo.stato}`,
  );
};

const attaccoScrittura = async () => {
  console.log("\nC — e la scrittura, dalla stessa porta");
  await comeUtente(MISTER_A, "trainer");

  const interna = await prisma.clubResourceItem.findFirst({
    where: {
      organization_id: CLUB,
      resource_type: "secretariat_notes",
      payload: { path: ["id"], equals: "nota-interna-r5" },
    },
  });
  if (!interna) {
    info("C-00 · nota interna non trovata: sezione saltata", null);
    return;
  }

  const patch = await chiama(
    `/api/v1/club_resource_items/${interna.id}?club_id=${CLUB}`,
    { method: "PATCH", body: JSON.stringify({ name: "RISCRITTA DALL'ALLENATORE" }) },
  );
  prova(
    "C-01 · PATCH sulla nota interna dal registro generico",
    true,
    patch.stato === 403 || patch.stato === 404,
    `stato ${patch.stato} ${JSON.stringify(patch.corpo?.error?.message ?? null)}`,
  );

  const del = await chiama(
    `/api/v1/club_resource_items/${interna.id}?club_id=${CLUB}`,
    { method: "DELETE" },
  );
  prova(
    "C-02 · DELETE sulla nota interna dal registro generico",
    true,
    del.stato === 403 || del.stato === 404,
    `stato ${del.stato} ${JSON.stringify(del.corpo?.error?.message ?? null)}`,
  );

  const sopravvive = await prisma.clubResourceItem.count({
    where: { id: interna.id },
  });
  prova("C-03 · la nota interna e ancora in archivio", 1, sopravvive);
};

const main = async () => {
  console.log("\n  PP-03 round 5 — il registro generico come seconda porta\n");
  await semina();
  try {
    await seminaNote();
    await attaccoNote();
    await attaccoConteggio();
    await attaccoColleghi();
    await attaccoScrittura();
  } finally {
    await pulisci();
    await prisma.$disconnect();
  }

  const ok = esiti.filter((e) => e.ok).length;
  console.log(`\n  ${ok}/${esiti.length} respinti.\n`);
  const rotti = esiti.filter((e) => !e.ok);
  if (rotti.length) {
    console.log("  ATTACCHI RIUSCITI:");
    for (const e of rotti) console.log(`   - ${e.titolo}  [${e.nota}]`);
    console.log("");
  }
};

main().catch(async (errore) => {
  console.error(errore);
  await pulisci();
  await prisma.$disconnect();
  process.exit(1);
});
