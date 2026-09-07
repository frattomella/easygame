/**
 * **Audit finale — i report leggono la stessa verita dell'app operativa.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/audit-finale-report-canonici-probe.mjs
 *
 * `D-AUD-9` dice che i report di club contano le convocazioni dalle grafie del
 * payload della gara, che dopo ADR-0099 **nessuno scrive piu**. Questa sonda
 * non lo legge: lo **misura**, e lo misura dalla parte da cui il numero esce.
 *
 * Il giro e quello vero di `/reports`:
 *
 *   1. il presidente crea un allenamento e una gara dalla rotta degli eventi;
 *   2. registra l'appello e la convocazione dalle **rotte canoniche**, cioe le
 *      stesse che usano la bacheca e il registro presenze;
 *   3. la sonda rilegge cio che la pagina `/reports` rilegge — le righe di
 *      `training_attendance` (che e `club_event_participants`) e le due
 *      proiezioni `clubs.trainings` / `clubs.matches` — e ci fa girare sopra
 *      i **calcolatori veri** di `club-report-utils`.
 *
 * `PASS` = il report dice cio che e successo. `FAIL` = il report mente.
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
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(64)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        ${nota}`);
};
const info = (titolo, valore) =>
  console.log(`  INFO  ${titolo.padEnd(64)} ${JSON.stringify(valore)}`);

/* ---------------------------------------------------------- gli attori -- */

const CLUB = randomUUID();
const CAT = "cat-rep-a";
const STAGIONE = "2026-27";

let PRESIDENTE = null;
const ATLETA_1 = randomUUID();
const ATLETA_2 = randomUUID();

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

const moduli = new Map();

const invia = async (identita, percorso, init = {}) => {
  const url = new URL(String(percorso), "http://collaudo.invalid");
  const metodo = String(init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers || {});
  if (identita?.token) headers.set("authorization", `Bearer ${identita.token}`);
  headers.set("x-active-club-id", identita?.club || CLUB);
  if (identita?.ruolo) headers.set("x-active-access-role", identita.ruolo);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const richiesta = new Request(url.toString(), { ...init, headers });
  const abbinata = abbina(url.pathname);
  if (!abbinata) return { stato: -1, corpo: { error: { message: `NESSUNA-ROTTA ${url.pathname}` } } };
  const chiave = abbinata.rotta.file;
  if (!moduli.has(chiave)) moduli.set(chiave, await import(pathToFileURL(chiave).href));
  const fn = moduli.get(chiave)[metodo];
  if (!fn) return { stato: -1, corpo: { error: { message: `NESSUN-HANDLER ${metodo} ${url.pathname}` } } };
  try {
    const risposta = await fn(richiesta, { params: abbinata.params });
    const corpo = await risposta.json().catch(() => null);
    return { stato: risposta.status, corpo };
  } catch (errore) {
    return { stato: -1, corpo: { error: { message: String(errore?.message) } } };
  }
};

globalThis.fetch = async (input) => {
  throw new Error(`FETCH-ESTERNO ${String(input)}`);
};

const identita = async (riga, ruolo, club = CLUB) => {
  const auth = await carica("src/lib/server/auth.ts");
  const sessione = await auth.createSessionForUser(riga);
  return { token: sessione.access_token, ruolo, club };
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
      last_name: "Rep",
      password_hash: "$2b$10$auditrep",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const semina = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "auditrep-" } },
    select: { id: true },
  });
  if (residui.length) {
    const ids = residui.map((r) => r.id);
    await prisma.auditLog.deleteMany({ where: { organization_id: { in: ids } } }).catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }

  PRESIDENTE = await utente("auditrep-presidente@example.invalid", "Anna");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `auditrep-${Date.now()}`,
      name: "ASD Report Canonici",
      creator_id: PRESIDENTE.id,
      settings: {
        seasons: [
          {
            id: STAGIONE,
            label: "2026/27",
            startDate: "2026-07-01",
            endDate: "2027-06-30",
            status: "active",
          },
        ],
      },
      categories: [{ id: CAT, name: "Under 12" }],
      club_sites: [],
      category_groups: [],
      structures: [],
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

  await prisma.athlete.createMany({
    data: [
      {
        id: ATLETA_1,
        organization_id: CLUB,
        first_name: "Uno",
        last_name: "Rep",
        status: "active",
        category_id: CAT,
        category_name: "Under 12",
        data: { seasonId: STAGIONE },
        updated_at: new Date(),
      },
      {
        id: ATLETA_2,
        organization_id: CLUB,
        first_name: "Due",
        last_name: "Rep",
        status: "active",
        category_id: CAT,
        category_name: "Under 12",
        data: { seasonId: STAGIONE },
        updated_at: new Date(),
      },
    ],
  });
};

const pulisci = async () => {
  await prisma.auditLog.deleteMany({ where: { organization_id: CLUB } }).catch(() => {});
  await prisma.club.deleteMany({ where: { id: CLUB } }).catch((e) => {
    console.error(`Pulizia non riuscita: ${e?.message}`);
  });
};

/* ==================================================================== */

const oggi = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const main = async () => {
  const CAPO = await identita(PRESIDENTE, "owner");
  const GIORNO = oggi();

  /* 1 — un allenamento e una gara, dalla rotta degli eventi. */
  const allenamento = await invia(CAPO, "/api/v1/events", {
    method: "POST",
    body: JSON.stringify({
      kind: "training",
      title: "Allenamento del rendiconto",
      date: GIORNO,
      time: "18:00",
      endTime: "19:30",
      seasonId: STAGIONE,
      categoryId: CAT,
      categoryName: "Under 12",
      allowOverlap: true,
    }),
  });
  const gara = await invia(CAPO, "/api/v1/events", {
    method: "POST",
    body: JSON.stringify({
      kind: "match",
      title: "Gara del rendiconto",
      date: GIORNO,
      time: "15:00",
      endTime: "17:00",
      seasonId: STAGIONE,
      categoryId: CAT,
      categoryName: "Under 12",
      opponent: "Avversaria",
      allowOverlap: true,
    }),
  });
  const ID_ALL = allenamento.corpo?.data?.id ?? null;
  const ID_GARA = gara.corpo?.data?.id ?? null;
  info("00 · eventi creati", { allenamento: allenamento.stato, gara: gara.stato });
  if (!ID_ALL || !ID_GARA) {
    prova("00 · i due eventi nascono", true, false, JSON.stringify({ allenamento, gara }));
    return;
  }

  /* 2 — appello e convocazione dalle rotte canoniche. */
  const appello = await invia(CAPO, `/api/v1/events/${ID_ALL}/participants`, {
    method: "POST",
    body: JSON.stringify({
      action: "attendance",
      entries: [
        { athleteId: ATLETA_1, status: "present" },
        { athleteId: ATLETA_2, status: "absent" },
      ],
    }),
  });
  const convocazione = await invia(CAPO, `/api/v1/events/${ID_GARA}/participants`, {
    method: "POST",
    body: JSON.stringify({
      action: "convoke",
      entries: [
        { athleteId: ATLETA_1, status: "convocated" },
        { athleteId: ATLETA_2, status: "excluded" },
      ],
    }),
  });
  info("01 · scritture canoniche", {
    appello: appello.stato,
    convocazione: convocazione.stato,
  });
  prova("01 · l'appello e la convocazione passano", [200, 200], [appello.stato, convocazione.stato]);

  const righe = await prisma.clubEventParticipant.findMany({
    where: { organization_id: CLUB },
    select: {
      event_id: true,
      athlete_id: true,
      status: true,
      convocation_status: true,
      legacy_training_id: true,
    },
    orderBy: [{ event_id: "asc" }, { athlete_id: "asc" }],
  });
  info("02 · righe canoniche in archivio", righe.length);

  /* 3 — cio che la pagina /reports rilegge davvero. */
  const clubRiga = await prisma.club.findUnique({
    where: { id: CLUB },
    select: { trainings: true, matches: true },
  });
  const trainings = Array.isArray(clubRiga?.trainings) ? clubRiga.trainings : [];
  const matches = Array.isArray(clubRiga?.matches) ? clubRiga.matches : [];
  info("03 · proiezioni del club", {
    trainings: trainings.length,
    matches: matches.length,
    idGara: matches[0]?.id ?? null,
    eventIdGara: matches[0]?.eventId ?? null,
    righeGara: righe.filter((r) => r.event_id === ID_GARA),
  });

  const lettura = await invia(
    CAPO,
    `/api/v1/training_attendance?organization_id=${CLUB}&limit=500`,
  );
  const presenze = Array.isArray(lettura.corpo?.data) ? lettura.corpo.data : [];
  info("04 · GET /training_attendance", {
    stato: lettura.stato,
    righe: presenze.length,
    prima: presenze[0]
      ? Object.keys(presenze[0]).filter((k) =>
          /id$|status/.test(k),
        )
      : null,
  });

  const athletes = await prisma.athlete.findMany({
    where: { organization_id: CLUB },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      category_id: true,
      category_name: true,
      status: true,
    },
  });

  const utils = await carica("src/lib/club-report-utils.ts");
  const categorie = await carica("src/lib/category-utils.ts");
  const opzioni = categorie.buildClubCategoryOptions({
    categories: [{ id: CAT, name: "Under 12" }],
  });

  const reportPresenze = utils.calculateAttendanceReport({
    athletes,
    trainings,
    attendanceRecords: presenze,
    categories: opzioni,
    selectedCategoryId: "all",
    period: "all",
  });
  info("05 · report presenze", reportPresenze);

  const reportConvocazioni = utils.calculateMatchConvocationReport({
    matches,
    attendanceRecords: presenze,
    categories: opzioni,
    selectedCategoryId: "all",
    period: "all",
  });
  info("06 · report convocazioni", reportConvocazioni);

  /* 4 — il verdetto. */
  prova(
    "R-01 · il report presenze conta l'appello registrato",
    { registrate: 2, presenti: 1, assenti: 1 },
    {
      registrate: reportPresenze.registeredAttendances,
      presenti: reportPresenze.presentAttendances,
      assenti: reportPresenze.absentAttendances,
    },
    "l'appello e stato scritto dalle rotte canoniche su club_event_participants",
  );

  prova(
    "R-02 · il report convocazioni conta la convocazione registrata",
    { gareConRosa: 1, convocazioni: 1, atletiDistinti: 1 },
    {
      gareConRosa: reportConvocazioni.matchesWithConvocations,
      convocazioni: reportConvocazioni.totalConvocations,
      atletiDistinti: reportConvocazioni.uniqueAthletesConvocated,
    },
    "la rosa e stata scritta da saveEventConvocations su convocation_status",
  );

  prova(
    "R-03 · il rendiconto porta gli identificativi degli atleti convocati",
    [ATLETA_1].sort(),
    Array.isArray(reportConvocazioni.convocatedAthleteIds)
      ? [...reportConvocazioni.convocatedAthleteIds].sort()
      : null,
    "un conteggio non basta: il rendiconto vuole sapere chi",
  );

  /* 5 — un evento annullato non entra nel rendiconto. */
  const rigaGara = await prisma.clubEvent.findUnique({ where: { id: ID_GARA } });
  const annulla = await invia(CAPO, `/api/v1/events/${ID_GARA}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "cancelled", version: rigaGara.version }),
  });
  info("07 · gara annullata", annulla.stato);

  const clubDopo = await prisma.club.findUnique({
    where: { id: CLUB },
    select: { matches: true },
  });
  const matchesDopo = Array.isArray(clubDopo?.matches) ? clubDopo.matches : [];
  const reportDopo = utils.calculateMatchConvocationReport({
    matches: matchesDopo,
    attendanceRecords: presenze,
    categories: opzioni,
    selectedCategoryId: "all",
    period: "all",
  });
  info("08 · report convocazioni dopo l'annullamento", reportDopo);
  prova(
    "R-04 · una gara annullata non pesa sul rendiconto delle convocazioni",
    { gare: 0, convocazioni: 0 },
    { gare: reportDopo.totalMatches, convocazioni: reportDopo.totalConvocations },
    "annullata: non ha avuto luogo, e non ha avuto una rosa",
  );
};

/* ==================================================================== */

console.log("\n  AUDIT FINALE — i report leggono la verita canonica\n");
try {
  await semina();
  await main();
} finally {
  await pulisci();
  await prisma.$disconnect();
}

const passati = esiti.filter((e) => e.ok).length;
console.log(`\n  ${passati}/${esiti.length} verificati.\n`);
if (passati < esiti.length) {
  console.log("  FALLITI:");
  for (const e of esiti.filter((x) => !x.ok)) {
    console.log(`   - ${e.titolo}${e.nota ? `  [${e.nota}]` : ""}`);
  }
  process.exitCode = 1;
}
