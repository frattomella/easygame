/**
 * **Audit finale — le porte di servizio e gli atti sul gia annullato.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/audit-finale-scritture-probe.mjs
 *
 * Due domande sulla stessa regola — «un dominio ha un punto d'ingresso unico,
 * e un evento non operativo non riceve piu atti»:
 *
 *   A — il registro generico accetta un allenamento scritto a mano, che nasce
 *       senza riga in `club_events` e che tre schermate mostrano lo stesso?
 *   B — un evento **annullato** si puo ancora spostare di data, di campo o di
 *       squadra, e la proiezione lo riscrive?
 *   C — una famiglia puo ancora rispondere a un evento **archiviato**, che
 *       nessuno puo piu riaprire?
 *
 * `PASS` = la porta e chiusa. `FAIL` = e aperta.
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
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(60)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        ${nota}`);
};
const info = (titolo, valore) =>
  console.log(`  INFO  ${titolo.padEnd(60)} ${JSON.stringify(valore)}`);

/* --------------------------------------------------------- il trasporto - */

const CLUB = randomUUID();
const CAT = "cat-scrit";
const STAGIONE = "2026-27";

/*
  **Le rotte non stanno tutte sotto `/api/v1`.** `PATCH /api/athlete-payments/:id`
  vive un livello piu su, ed e la ragione per cui una correzione di confine
  fatta «in quindici moduli» a suo tempo l'aveva saltata: la ricerca si era
  fermata al secondo segmento. Una sonda che scoprisse solo `v1` ripeterebbe
  quell'errore, e direbbe «nessuna rotta» proprio alla porta scoperta.
*/
const RADICE = path.resolve("src/app/api");
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
  const segmenti = percorso.replace(/^\/api\//, "").split("/").filter(Boolean);
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

/* ------------------------------------------------------------- la semina */

let PRESIDENTE = null;
let RECINTATO = null;
const ATLETA = randomUUID();
const ATLETA_SUD = randomUUID();
const RATA_NORD = randomUUID();
const RATA_SUD = randomUUID();
const SEDE_NORD = "sede-nord";
const SEDE_SUD = "sede-sud";

const utente = async (email, nome) => {
  const trovato = await prisma.user.findUnique({ where: { email } });
  if (trovato) return trovato;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      first_name: nome,
      last_name: "Scritture",
      password_hash: "$2b$10$auditscr",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const semina = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "auditscr-" } },
    select: { id: true },
  });
  if (residui.length) {
    const ids = residui.map((r) => r.id);
    await prisma.auditLog.deleteMany({ where: { organization_id: { in: ids } } }).catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }

  const marchio = Date.now().toString(36);
  PRESIDENTE = await utente(
    `auditscr-presidente-${marchio}@example.invalid`,
    "Anna",
  );
  RECINTATO = await utente(
    `auditscr-recintato-${marchio}@example.invalid`,
    "Nord",
  );

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `auditscr-${marchio}`,
      name: "ASD Scritture",
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
      club_sites: [
        { id: SEDE_NORD, name: "Nord" },
        { id: SEDE_SUD, name: "Sud" },
      ],
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

  /*
    **Il recintato, e il recinto.** Un `club_manager` con una riga di
    `club_access_scopes` sulla sola sede Nord: e il ruolo che il perimetro puo
    restringere e che la matrice dei permessi lascia scrivere sulle rate.
  */
  const tesseraRecintata = await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: RECINTATO.id,
      role: "club_manager",
      is_primary: true,
      updated_at: new Date(),
    },
  });
  await prisma.clubAccessScope.create({
    data: {
      id: randomUUID(),
      organization_user_id: tesseraRecintata.id,
      scope_kind: "site",
      scope_value: SEDE_NORD,
    },
  });

  await prisma.athlete.createMany({
    data: [
      {
        id: ATLETA,
        organization_id: CLUB,
        first_name: "Uno",
        last_name: "Nord",
        status: "active",
        category_id: CAT,
        category_name: "Under 12",
        data: { seasonId: STAGIONE },
        updated_at: new Date(),
      },
      {
        id: ATLETA_SUD,
        organization_id: CLUB,
        first_name: "Due",
        last_name: "Sud",
        status: "active",
        category_id: CAT,
        category_name: "Under 12",
        data: { seasonId: STAGIONE },
        updated_at: new Date(),
      },
    ],
  });

  /* Il perimetro di sede si calcola sulle appartenenze, non sulla scheda. */
  await prisma.athleteCategoryMembership.createMany({
    data: [
      {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: ATLETA,
        category_id: CAT,
        category_name: "Under 12",
        is_primary: true,
        site_id: SEDE_NORD,
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: ATLETA_SUD,
        category_id: CAT,
        category_name: "Under 12",
        is_primary: true,
        site_id: SEDE_SUD,
        updated_at: new Date(),
      },
    ],
  });

  await prisma.athletePayment.createMany({
    data: [
      {
        id: RATA_NORD,
        organization_id: CLUB,
        athlete_id: ATLETA,
        amount: 100,
        status: "pending",
        due_date: new Date("2026-10-31"),
        description: "Quota Nord",
        updated_at: new Date(),
      },
      {
        id: RATA_SUD,
        organization_id: CLUB,
        athlete_id: ATLETA_SUD,
        amount: 200,
        status: "pending",
        due_date: new Date("2026-10-31"),
        description: "Quota Sud",
        updated_at: new Date(),
      },
    ],
  });

  /* Un incasso per parte: la prima nota deve poterne nascondere uno. */
  await prisma.paymentTransaction.createMany({
    data: [
      {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: ATLETA,
        payment_id: RATA_NORD,
        amount: 10,
        paid_at: new Date("2026-09-01"),
        payment_method: "cash",
        source: "MANUAL",
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: ATLETA_SUD,
        payment_id: RATA_SUD,
        amount: 20,
        paid_at: new Date("2026-09-01"),
        payment_method: "cash",
        source: "MANUAL",
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

const main = async () => {
  const auth = await carica("src/lib/server/auth.ts");
  const sessione = await auth.createSessionForUser(PRESIDENTE);
  const CAPO = { token: sessione.access_token, ruolo: "owner", club: CLUB };

  /* --------------------------------------------------------------- A -- */
  console.log("\nA — il registro generico come seconda porta sugli allenamenti");

  const scrittoAMano = await invia(CAPO, "/api/v1/club_resource_items", {
    method: "POST",
    body: JSON.stringify({
      organization_id: CLUB,
      resource_type: "trainings",
      name: "Allenamento dalla porta di servizio",
      payload: {
        id: "porta-di-servizio",
        date: "2026-11-04",
        time: "18:00",
        endTime: "19:30",
        categoryId: CAT,
        category: "Under 12",
      },
    }),
  });
  info("A-00 · POST club_resource_items resource_type=trainings", {
    stato: scrittoAMano.stato,
    messaggio: scrittoAMano.corpo?.error?.message ?? null,
  });
  prova(
    "A-01 · un allenamento non si scrive dal registro generico",
    true,
    scrittoAMano.stato >= 400,
    "una riga cosi non ha un club_events: appello e convocazioni rispondono «Evento non trovato»",
  );

  const gemello = await invia(CAPO, "/api/v1/club_resource_items", {
    method: "POST",
    body: JSON.stringify({
      organization_id: CLUB,
      resource_type: "matches",
      name: "Gara dalla porta di servizio",
      payload: { id: "gara-di-servizio", date: "2026-11-05", time: "15:00" },
    }),
  });
  prova(
    "A-02 · e nemmeno una gara",
    true,
    gemello.stato >= 400,
    `stato ${gemello.stato} — ${JSON.stringify(gemello.corpo?.error?.message ?? null)}`,
  );

  /*
    **E il controspecchio, che qui conta quanto la regola.**

    La prima stesura di questa correzione aveva messo `trainings` fra i tipi
    che il registro generico non serve **affatto**, e chiudeva tre porte invece
    di una: `getClubTrainings` fonde tre fonti e una e questa, il seme
    dimostrativo scrive proprio cosi, e le righe fantasma gia in archivio
    sarebbero diventate insieme invisibili e **non cancellabili** — cioe la
    correzione avrebbe chiuso la porta lasciando dentro i fantasmi che quella
    porta ha prodotto.

    La porta da chiudere era una: la scrittura.
  */
  const fantasma = randomUUID();
  await prisma.clubResourceItem.create({
    data: {
      id: fantasma,
      organization_id: CLUB,
      resource_type: "trainings",
      name: "Fantasma gia in archivio",
      status: "active",
      payload: { id: "fantasma", date: "2026-11-04" },
      updated_at: new Date(),
    },
  });

  const letta = await invia(
    CAPO,
    `/api/v1/club_resource_items?organization_id=${CLUB}&resource_type=trainings`,
  );
  const righeLette = Array.isArray(letta.corpo?.data) ? letta.corpo.data : [];
  info("A-03 · lettura delle righe storiche", {
    stato: letta.stato,
    righe: righeLette.length,
  });
  prova(
    "A-03 · le righe storiche restano leggibili",
    { stato: 200, almenoUna: true },
    { stato: letta.stato, almenoUna: righeLette.length >= 1 },
    "tre schermate le fondono: toglierle dalla lettura le fa sparire in silenzio",
  );

  const bonifica = await invia(
    CAPO,
    `/api/v1/club_resource_items/${fantasma}`,
    { method: "DELETE" },
  );
  const restaFantasma = await prisma.clubResourceItem.findUnique({
    where: { id: fantasma },
    select: { id: true },
  });
  info("A-04 · bonifica di una riga fantasma", {
    stato: bonifica.stato,
    messaggio: bonifica.corpo?.error?.message ?? null,
  });
  prova(
    "A-04 · e restano cancellabili, o i fantasmi non escono piu",
    { rifiutato: false, esiste: false },
    { rifiutato: bonifica.stato >= 400, esiste: Boolean(restaFantasma) },
  );

  /* --------------------------------------------------------------- B -- */
  console.log("\nB — gli atti su un evento annullato");

  const creato = await invia(CAPO, "/api/v1/events", {
    method: "POST",
    body: JSON.stringify({
      kind: "training",
      title: "Allenamento da annullare",
      date: "2026-11-06",
      time: "18:00",
      endTime: "19:30",
      seasonId: STAGIONE,
      categoryId: CAT,
      categoryName: "Under 12",
      allowOverlap: true,
    }),
  });
  const ID = creato.corpo?.data?.id ?? null;
  if (!ID) {
    prova("B-00 · l'evento nasce", true, false, JSON.stringify(creato));
    return;
  }

  const prima = await prisma.clubEvent.findUnique({ where: { id: ID } });
  const annulla = await invia(CAPO, `/api/v1/events/${ID}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "cancelled", version: prima.version }),
  });
  info("B-00 · annullamento", annulla.stato);

  const annullato = await prisma.clubEvent.findUnique({ where: { id: ID } });
  const spostato = await invia(CAPO, `/api/v1/events/${ID}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "cancelled",
      date: "2027-01-20",
      time: "21:00",
      version: annullato.version,
    }),
  });
  const dopo = await prisma.clubEvent.findUnique({ where: { id: ID } });
  info("B-01 · spostamento di un annullato", {
    stato: spostato.stato,
    messaggio: spostato.corpo?.error?.message ?? null,
    inizio: dopo?.starts_at?.toISOString?.() ?? null,
  });
  prova(
    "B-01 · un evento annullato non si sposta di data",
    true,
    spostato.stato >= 400 ||
      dopo?.starts_at?.toISOString?.() === annullato?.starts_at?.toISOString?.(),
    "annullato e non operativo: prima si riapre, poi si sposta",
  );

  const riaperto = await invia(CAPO, `/api/v1/events/${ID}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "scheduled", version: dopo.version }),
  });
  const riapertoRiga = await prisma.clubEvent.findUnique({ where: { id: ID } });
  info("B-02 · ripristino", {
    stato: riaperto.stato,
    statoEvento: riapertoRiga?.status ?? null,
  });
  prova(
    "B-02 · e il ripristino resta possibile",
    { stato: 200, statoEvento: "scheduled" },
    { stato: riaperto.stato, statoEvento: riapertoRiga?.status ?? null },
    "chiudere gli atti su un annullato non deve chiudere la strada che lo riapre",
  );

  /* --------------------------------------------------------------- C -- */
  console.log("\nC — la risposta della famiglia su un evento archiviato");

  const rsvp = await carica("src/lib/rsvp/model.ts");
  const config = { required: true, deadline: null, closed: false };

  prova(
    "C-01 · su un evento archiviato non si risponde",
    false,
    rsvp.canAnswerRsvp({ config, eventStatus: "archived" }).allowed,
    "archived e terminale: nessuno lo riapre, nessuno lo annulla, nessuno ci fa l'appello",
  );
  prova(
    "C-02 · su un evento annullato non si risponde, come prima",
    false,
    rsvp.canAnswerRsvp({ config, eventStatus: "cancelled" }).allowed,
  );
  prova(
    "C-03 · su un evento in programma si risponde",
    true,
    rsvp.canAnswerRsvp({ config, eventStatus: "scheduled" }).allowed,
  );

  /* --------------------------------------------------------------- D -- */
  console.log("\nD — la prima nota e le rate fuori dal perimetro di sede");

  const sessioneRecintato = await auth.createSessionForUser(RECINTATO);
  const FENCED = {
    token: sessioneRecintato.access_token,
    ruolo: "club_manager",
    club: CLUB,
  };

  const libro = await invia(
    FENCED,
    `/api/v1/payment-transactions?organization_id=${CLUB}`,
  );
  const righeLibro = Array.isArray(libro.corpo?.data) ? libro.corpo.data : [];
  const atletiNelLibro = Array.from(
    new Set(righeLibro.map((r) => String(r?.athleteId || r?.athlete_id || ""))),
  ).filter(Boolean);
  info("D-00 · la prima nota vista da un ruolo recintato sulla sede Nord", {
    stato: libro.stato,
    righe: righeLibro.length,
    atleti: atletiNelLibro,
  });
  prova(
    "D-01 · la prima nota non porta gli incassi di un'altra sede",
    [ATLETA],
    atletiNelLibro,
    "da qui escono gli identificativi che aprono la porta accanto",
  );

  const tocca = await invia(FENCED, `/api/athlete-payments/${RATA_SUD}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "update", updates: { amount: 1 } }),
  });
  const rataDopo = await prisma.athletePayment.findUnique({
    where: { id: RATA_SUD },
    select: { amount: true },
  });
  info("D-02 · PATCH sulla rata di un atleta della sede Sud", {
    stato: tocca.stato,
    messaggio: tocca.corpo?.error?.message ?? null,
    importo: Number(rataDopo?.amount ?? 0),
  });
  prova(
    "D-02 · una rata fuori perimetro non si riscrive",
    { rifiutato: true, importo: 200 },
    { rifiutato: tocca.stato >= 400, importo: Number(rataDopo?.amount ?? 0) },
  );

  const cancella = await invia(FENCED, `/api/athlete-payments/${RATA_SUD}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "delete" }),
  });
  const esisteAncora = await prisma.athletePayment.findUnique({
    where: { id: RATA_SUD },
    select: { id: true },
  });
  prova(
    "D-03 · e non si cancella, che porterebbe via anche gli incassi",
    { rifiutato: true, esiste: true },
    { rifiutato: cancella.stato >= 400, esiste: Boolean(esisteAncora) },
  );

  const propria = await invia(FENCED, `/api/athlete-payments/${RATA_NORD}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "update", updates: { amount: 90 } }),
  });
  const rataNord = await prisma.athletePayment.findUnique({
    where: { id: RATA_NORD },
    select: { amount: true },
  });
  info("D-04 · e la propria?", {
    stato: propria.stato,
    importo: Number(rataNord?.amount ?? 0),
  });
  prova(
    "D-04 · la rata della propria sede resta scrivibile",
    { stato: 200, importo: 90 },
    { stato: propria.stato, importo: Number(rataNord?.amount ?? 0) },
    "un perimetro che chiude anche la propria sede non e un perimetro",
  );
};

/* ==================================================================== */

console.log("\n  AUDIT FINALE — porte di servizio e atti sul non operativo\n");
try {
  await semina();
  await main();
} finally {
  await pulisci();
  await prisma.$disconnect();
}

const passati = esiti.filter((e) => e.ok).length;
console.log(`\n  ${passati}/${esiti.length} chiuse.\n`);
if (passati < esiti.length) {
  console.log("  PORTE APERTE:");
  for (const e of esiti.filter((x) => !x.ok)) {
    console.log(`   - ${e.titolo}${e.nota ? `  [${e.nota}]` : ""}`);
  }
  process.exitCode = 1;
}
