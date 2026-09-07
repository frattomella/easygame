/**
 * **PP-03 round 5 — le superfici che si aprono e restano vuote.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/pp-03-round5-superfici-vuote-probe.mjs
 *
 * §8 del verbale ha chiuso due riquadri che si aprivano senza contenuto, e ha
 * scritto che nessuna sonda sulle rotte li avrebbe visti «perche le rotte
 * rispondevano correttamente». Non e vero in generale: quando il lettore
 * chiede un campo che la **proiezione lato server cancella**, la rotta lo dice.
 * Questa sonda misura tre di quei campi dalle rotte vere.
 *
 * `PASS` = il campo arriva a chi lo legge. `FAIL` = il riquadro non si potra
 * mai riempire.
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
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(66)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        ${nota}`);
};
const info = (titolo, valore) =>
  console.log(`  INFO  ${titolo.padEnd(66)} ${JSON.stringify(valore)}`);

/* ---------------------------------------------------------- gli attori -- */

const CLUB = randomUUID();
const CAT_A = "cat-r5v-a";
const CAT_B = "cat-r5v-b";
const ATLETA_A = randomUUID();

let PRESIDENTE = null;
let MISTER_A = null;

const CONTRATTO = "CONTRATTO-COLLABORAZIONE-2026-ALDO.pdf";

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
const moduli = new Map();

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input), "http://collaudo.invalid");
  const metodo = String(init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers || {});
  if (SESSIONE) headers.set("authorization", `Bearer ${SESSIONE}`);
  headers.set("x-active-club-id", CLUB);
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

const comeUtente = async (riga, ruolo) => {
  const auth = await carica("src/lib/server/auth.ts");
  const sessione = await auth.createSessionForUser(riga);
  SESSIONE = sessione.access_token;
  RUOLO = ruolo;
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
      last_name: "R5v",
      password_hash: "$2b$10$pp03r5v",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const semina = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp03r5v-" } },
    select: { id: true },
  });
  if (residui.length) {
    const ids = residui.map((r) => r.id);
    await prisma.auditLog.deleteMany({ where: { organization_id: { in: ids } } }).catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }

  PRESIDENTE = await utente("pp03r5v-presidente@example.invalid", "Anna");
  MISTER_A = await utente("pp03r5v-mister-a@example.invalid", "Aldo");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `pp03r5v-${Date.now()}`,
      name: "ASD Round5 V",
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
          id: "trainer-r5v-a",
          first_name: "Aldo",
          last_name: "R5v",
          email: MISTER_A.email,
          linkedUserId: MISTER_A.id,
          categories: [CAT_A],
          groups: [],
          /*
            Il contratto che «I miei documenti» esiste per mostrare. La scheda
            gestionale lo scrive proprio qui: `updateTrainerRecord({documents})`.
          */
          documents: [
            { id: "doc-1", name: CONTRATTO, type: "contract", url: "attachment:att-1" },
          ],
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

  await prisma.athlete.create({
    data: {
      id: ATLETA_A,
      organization_id: CLUB,
      first_name: "Aldo jr",
      last_name: "CatA",
      status: "active",
      category_id: CAT_A,
      category_name: "Under 12",
      data: { seasonId: "2026-27" },
      updated_at: new Date(),
    },
  });

  /*
    Un'appartenenza **secondaria** nella tabella vera (ADR-0038): e cio che la
    colonna «Primaria / Secondaria» dell'elenco atleti dice di leggere.
  */
  await prisma.athleteCategoryMembership.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      athlete_id: ATLETA_A,
      category_id: CAT_B,
      category_name: "Under 15",
      is_primary: false,
      updated_at: new Date(),
    },
  }).catch((e) => console.log(`        semina appartenenza: ${e?.message}`));

  /*
    **La scheda dell'allenatore si semina dal proprietario, non dalla colonna.**
    `/api/v1/trainers` legge `club_resource_items`; scrivere solo `clubs.trainers`
    lascerebbe la tabella vuota e la sonda misurerebbe la propria semina invece
    della proiezione (CLAUDE.md §11.3).
  */
  const risorse = await carica("src/lib/server/resources.ts");
  await risorse.replaceClubResourceCollections(CLUB, [
    {
      resource_type: "trainers",
      items: [
        {
          id: "trainer-r5v-a",
          first_name: "Aldo",
          last_name: "R5v",
          email: MISTER_A.email,
          linkedUserId: MISTER_A.id,
          categories: [CAT_A],
          groups: [],
          documents: [
            { id: "doc-1", name: CONTRATTO, type: "contract", url: "attachment:att-1" },
          ],
        },
      ],
    },
    { resource_type: "categories", items: [
      { id: CAT_A, name: "Under 12" },
      { id: CAT_B, name: "Under 15" },
    ] },
  ]);
};

const pulisci = async () => {
  await prisma.auditLog.deleteMany({ where: { organization_id: CLUB } }).catch(() => {});
  await prisma.club.deleteMany({ where: { id: CLUB } }).catch((e) => {
    console.error(`Pulizia non riuscita: ${e?.message}`);
  });
};

/* ==================================================================== */

const attaccoDocumenti = async () => {
  console.log("\nA — «I miei documenti» dell'allenatore");

  await comeUtente(PRESIDENTE, "owner");
  const daPresidente = await chiama(`/api/v1/trainers?club_id=${CLUB}`);
  prova(
    "A-00 · controllo: alla direzione il contratto arriva",
    true,
    JSON.stringify(daPresidente.corpo ?? null).includes(CONTRATTO),
    `stato ${daPresidente.stato}`,
  );

  await comeUtente(MISTER_A, "trainer");
  const daAllenatore = await chiama(`/api/v1/trainers?club_id=${CLUB}`);
  const propria = (daAllenatore.corpo?.data || []).find(
    (r) => String(r?.id) === "trainer-r5v-a",
  );
  prova(
    "A-01 · all'allenatore arriva il **proprio** contratto",
    true,
    JSON.stringify(daAllenatore.corpo ?? null).includes(CONTRATTO),
    `stato ${daAllenatore.stato}; chiavi della propria scheda ${JSON.stringify(
      Object.keys(propria || {}),
    )}`,
  );
  info("A-02 · la propria scheda come la vede l'allenatore", propria ?? null);
};

const attaccoAppartenenze = async () => {
  console.log("\nB — «Primaria / Secondaria» nell'elenco atleti");

  await comeUtente(MISTER_A, "trainer");
  const elenco = await chiama(`/api/v1/athletes?club_id=${CLUB}&trainer_dashboard=1`);
  const riga = (elenco.corpo?.data || []).find((r) => String(r?.id) === ATLETA_A);
  const chiavi = Object.keys(riga || {});
  prova(
    "B-01 · la riga dell'atleta porta le appartenenze",
    true,
    chiavi.some((k) =>
      ["category_memberships", "categoryMemberships", "memberships"].includes(k),
    ),
    `stato ${elenco.stato}; chiavi ${JSON.stringify(chiavi)}`,
  );

  const perId = await chiama(`/api/v1/athletes/${ATLETA_A}?club_id=${CLUB}`);
  const chiaviId = Object.keys(perId.corpo?.data || {});
  prova(
    "B-02 · e la scheda per identificativo pure",
    true,
    chiaviId.some((k) =>
      ["category_memberships", "categoryMemberships", "memberships"].includes(k),
    ),
    `stato ${perId.stato}; chiavi ${JSON.stringify(chiaviId)}`,
  );

  /* B-03 — la tabella vera, chiesta dalla sua rotta. */
  const tabella = await chiama(
    `/api/v1/athlete_category_memberships?club_id=${CLUB}`,
  );
  info("B-03 · /athlete_category_memberships da allenatore", {
    stato: tabella.stato,
    righe: (tabella.corpo?.data || []).length,
  });
};

const attaccoPresenzeInPayload = async () => {
  console.log("\nC — il contatore delle presenze sulla scheda dell'evento");

  await comeUtente(MISTER_A, "trainer");
  const creato = await chiama("/api/v1/events", {
    method: "POST",
    body: JSON.stringify({
      kind: "training",
      title: "allenamento con appello",
      date: "2026-10-30",
      time: "18:00",
      endTime: "19:30",
      seasonId: "2026-27",
      categoryId: CAT_A,
      categoryName: "Under 12",
    }),
  });
  const ID = creato.corpo?.data?.id ?? null;
  info("C-00 · evento", { stato: creato.stato, id: ID });
  if (!ID) return;

  const appello = await chiama(`/api/v1/events/${ID}/participants`, {
    method: "POST",
    body: JSON.stringify({
      action: "attendance",
      entries: [{ athleteId: ATLETA_A, status: "present" }],
    }),
  });
  info("C-01 · appello", { stato: appello.stato });

  const righe = await prisma.clubEventParticipant.count({
    where: { event_id: ID, status: "present" },
  });
  prova("C-02 · la presenza e in tabella", 1, righe);

  /*
    C-03 — e la scheda che il calendario dell'allenatore legge? Il badge
    «0/N · Presenze mancanti» si costruisce da `training.attendance`, che nasce
    dallo spread del `payload`. Se `saveEventAttendance` non tocca il payload,
    il badge resta indietro sulla stessa schermata che ha appena registrato.
  */
  const calendario = await chiama("/api/v1/events?kind=training");
  const evento = (calendario.corpo?.data || []).find((e) => e?.id === ID);
  prova(
    "C-03 · l'evento servito al calendario porta `attendance`",
    true,
    Array.isArray(evento?.attendance) && evento.attendance.length > 0,
    `attendance ${JSON.stringify(evento?.attendance ?? null)}`,
  );
};

const main = async () => {
  console.log("\n  PP-03 round 5 — le superfici che restano vuote\n");
  await semina();
  try {
    await attaccoDocumenti();
    await attaccoAppartenenze();
    await attaccoPresenzeInPayload();
  } finally {
    await pulisci();
    await prisma.$disconnect();
  }

  const ok = esiti.filter((e) => e.ok).length;
  console.log(`\n  ${ok}/${esiti.length} superfici raggiungibili.\n`);
  const rotti = esiti.filter((e) => !e.ok);
  if (rotti.length) {
    console.log("  SUPERFICI CHE NON SI RIEMPIONO:");
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
