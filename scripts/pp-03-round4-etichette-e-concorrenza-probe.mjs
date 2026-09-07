/**
 * **PP-03 round 4 — le etichette del catalogo (§10.2), la concorrenza,
 * e il perimetro dell'appuntamento per l'allenatore.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/pp-03-round4-etichette-e-concorrenza-probe.mjs
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
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(68)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        ${nota}`);
};
const info = (t, v) => console.log(`  INFO  ${t.padEnd(68)} ${JSON.stringify(v)}`);

const CLUB = randomUUID();
const CAT_A = "cat-r4c-a";
const CAT_B = "cat-r4c-b";

let PRESIDENTE = null;
let MISTER_A = null;
let MISTER_B = null;
const ATLETA_A = randomUUID();
const ATLETA_B = randomUUID();

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
/* La sessione e esplicita per richiesta: serve per le prove di concorrenza. */
const inviaCome = async (attore, percorso, init = {}) => {
  const url = new URL(String(percorso), "http://collaudo.invalid");
  const metodo = String(init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers || {});
  headers.set("authorization", `Bearer ${attore.token}`);
  headers.set("x-active-club-id", attore.club || CLUB);
  headers.set("x-active-access-role", attore.ruolo);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const richiesta = new Request(url.toString(), { ...init, headers });
  const abbinata = abbina(url.pathname);
  if (!abbinata) throw new Error(`NESSUNA-ROTTA ${url.pathname}`);
  const chiave = abbinata.rotta.file;
  if (!moduli.has(chiave)) moduli.set(chiave, await import(pathToFileURL(chiave).href));
  const fn = moduli.get(chiave)[metodo];
  if (!fn) throw new Error(`NESSUN-HANDLER ${metodo} ${url.pathname}`);
  try {
    const risposta = await fn(richiesta, { params: abbinata.params });
    const corpo = await risposta.json().catch(() => null);
    return { stato: risposta.status, corpo };
  } catch (errore) {
    return { stato: -1, corpo: { error: { message: String(errore?.message) } } };
  }
};
globalThis.fetch = async (input, init = {}) => {
  throw new Error(`fetch non atteso verso ${String(input)}`);
};

const attore = async (riga, ruolo, club = CLUB) => {
  const auth = await carica("src/lib/server/auth.ts");
  const sessione = await auth.createSessionForUser(riga);
  return { token: sessione.access_token, ruolo, club, id: riga.id };
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
      last_name: "R4c",
      password_hash: "$2b$10$pp03r4c",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const semina = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp03r4c-" } },
    select: { id: true },
  });
  if (residui.length) {
    const ids = residui.map((r) => r.id);
    await prisma.auditLog.deleteMany({ where: { organization_id: { in: ids } } }).catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }

  PRESIDENTE = await utente("pp03r4c-presidente@example.invalid", "Anna");
  MISTER_A = await utente("pp03r4c-mister-a@example.invalid", "Aldo");
  MISTER_B = await utente("pp03r4c-mister-b@example.invalid", "Bruno");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `pp03r4c-${Date.now()}`,
      name: "ASD Round4c",
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
          id: "trainer-r4c-a",
          first_name: "Aldo",
          last_name: "R4c",
          email: MISTER_A.email,
          linkedUserId: MISTER_A.id,
          categories: [CAT_A],
          groups: [],
        },
        {
          id: "trainer-r4c-b",
          first_name: "Bruno",
          last_name: "R4c",
          email: MISTER_B.email,
          linkedUserId: MISTER_B.id,
          /* Bruno tiene **entrambe** le categorie: il congiunto e suo. */
          categories: [CAT_A, CAT_B],
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

  await prisma.athlete.createMany({
    data: [
      {
        id: ATLETA_A,
        organization_id: CLUB,
        first_name: "Anna",
        last_name: "CatA",
        status: "active",
        category_id: CAT_A,
        category_name: "Under 12",
        data: {},
        updated_at: new Date(),
      },
      {
        id: ATLETA_B,
        organization_id: CLUB,
        first_name: "Bruna",
        last_name: "CatB",
        status: "active",
        category_id: CAT_B,
        category_name: "Under 15",
        data: {},
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
/*  A — appointments.manage: l'etichetta e la guardia                   */
/* ==================================================================== */

const attaccoAppuntamenti = async () => {
  console.log("\nA — appointments.manage: cio che l'etichetta promette");
  const capo = await attore(PRESIDENTE, "owner");
  const aldo = await attore(MISTER_A, "trainer");

  /* Un appuntamento sull'atleta di Aldo, fuori dagli slot. */
  const suo = await inviaCome(capo, "/api/v1/appointments", {
    method: "POST",
    body: JSON.stringify({
      reason: "colloquio con la famiglia",
      starts_at: "2026-11-10T10:00:00.000Z",
      duration_minutes: 30,
      athlete_id: ATLETA_A,
      outside_availability: true,
    }),
  });
  const APP_A = suo.corpo?.data?.id ?? null;
  info("A-00 · appuntamento sull'atleta di Aldo", { stato: suo.stato, id: APP_A });

  /* E uno sull'atleta di Bruno. */
  const altrui = await inviaCome(capo, "/api/v1/appointments", {
    method: "POST",
    body: JSON.stringify({
      reason: "colloquio riservato",
      starts_at: "2026-11-10T11:00:00.000Z",
      duration_minutes: 30,
      athlete_id: ATLETA_B,
      internal_notes: "SEGRETO-INTERNO-DELLA-SEGRETERIA",
      outside_availability: true,
    }),
  });
  const APP_B = altrui.corpo?.data?.id ?? null;
  info("A-00b · appuntamento sull'atleta di Bruno", { stato: altrui.stato, id: APP_B });

  if (!APP_A) return;

  /* A-01 — l'allenatore conferma un appuntamento del proprio atleta. */
  const conferma = await inviaCome(aldo, `/api/v1/appointments/${APP_A}`, {
    method: "POST",
    body: JSON.stringify({ action: "confirm", note: "ok" }),
  });
  info("A-01 · trainer conferma l'appuntamento del proprio atleta", {
    stato: conferma.stato,
    errore: conferma.corpo?.error?.message ?? null,
  });

  /* A-02 — e riprogramma. */
  const riprogramma = await inviaCome(aldo, `/api/v1/appointments/${APP_A}`, {
    method: "POST",
    body: JSON.stringify({
      action: "reschedule",
      starts_at: "2026-11-12T10:00:00.000Z",
      outside_availability: true,
      reason: "spostato",
    }),
  });
  info("A-02 · trainer riprogramma", {
    stato: riprogramma.stato,
    errore: riprogramma.corpo?.error?.message ?? null,
  });

  if (APP_B) {
    /* A-03 — sull'appuntamento dell'atleta di Bruno: deve negare. */
    const fuori = await inviaCome(aldo, `/api/v1/appointments/${APP_B}`, {
      method: "POST",
      body: JSON.stringify({ action: "cancel", note: "sonda" }),
    });
    prova(
      "A-03 · trainer annulla l'appuntamento di un atleta fuori perimetro",
      403,
      fuori.stato,
      JSON.stringify(fuori.corpo?.error?.message ?? null),
    );

    /* A-04 — e lo legge? `internal_notes` e testo della segreteria. */
    const lettura = await inviaCome(aldo, `/api/v1/appointments/${APP_B}`);
    const testo = JSON.stringify(lettura.corpo ?? null);
    prova(
      "A-04 · internal_notes dell'appuntamento fuori perimetro non esce",
      false,
      testo.includes("SEGRETO-INTERNO-DELLA-SEGRETERIA"),
      `stato ${lettura.stato}`,
    );

    /* A-05 — dall'elenco. */
    const elenco = await inviaCome(aldo, `/api/v1/appointments?club_id=${CLUB}`);
    const testoElenco = JSON.stringify(elenco.corpo ?? null);
    prova(
      "A-05 · internal_notes non esce nemmeno dall'elenco",
      false,
      testoElenco.includes("SEGRETO-INTERNO-DELLA-SEGRETERIA"),
      `stato ${elenco.stato} righe ${elenco.corpo?.data?.length ?? "n/d"}`,
    );
  }

  /* A-06 — la disponibilita del club: l'etichetta dice che NON la configura. */
  const slot = await inviaCome(aldo, "/api/v1/appointment-slots", {
    method: "POST",
    body: JSON.stringify({
      weekday: 1,
      start_time: "09:00",
      end_time: "10:00",
      capacity: 1,
    }),
  });
  prova(
    "A-06 · trainer non configura la disponibilita del club",
    true,
    slot.stato >= 400,
    `stato ${slot.stato} · ${JSON.stringify(slot.corpo?.error?.message ?? null)}`,
  );
};

/* ==================================================================== */
/*  B — concorrenza                                                     */
/* ==================================================================== */

const attaccoConcorrenza = async () => {
  console.log("\nB — due che salvano insieme");
  const capo = await attore(PRESIDENTE, "owner");
  const aldo = await attore(MISTER_A, "trainer");
  const bruno = await attore(MISTER_B, "trainer");

  /* Un allenamento congiunto A+B: Bruno lo puo scrivere, Aldo no. */
  const congiunto = await inviaCome(capo, "/api/v1/events", {
    method: "POST",
    body: JSON.stringify({
      kind: "training",
      title: "congiunto",
      date: "2026-11-20",
      time: "18:00",
      endTime: "19:00",
      categoryId: CAT_A,
      categoryName: "Under 12",
      categories: [CAT_A, CAT_B],
    }),
  });
  const EVT = congiunto.corpo?.data?.id ?? null;
  const versione = congiunto.corpo?.data?.row?.version ?? null;
  info("B-00 · evento congiunto", { stato: congiunto.stato, id: EVT, versione });
  if (!EVT) return;

  /* B-01 — due PATCH con la **stessa** versione attesa, in parallelo. */
  const [uno, due] = await Promise.all([
    inviaCome(bruno, `/api/v1/events/${EVT}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "scritto da Bruno", version: versione }),
    }),
    inviaCome(capo, `/api/v1/events/${EVT}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "scritto dal presidente", version: versione }),
    }),
  ]);
  const stati = [uno.stato, due.stato].sort();
  prova(
    "B-01 · due PATCH con la stessa versione: uno solo passa",
    [200, 409],
    stati,
    `${JSON.stringify(uno.corpo?.error?.message ?? null)} / ${JSON.stringify(due.corpo?.error?.message ?? null)}`,
  );
  const riga = await prisma.clubEvent.findUnique({
    where: { id: EVT },
    select: { title: true, version: true },
  });
  info("B-01b · riga dopo le due scritture", riga);

  /*
    B-02 — appello e convocazione simultanei sullo stesso evento.

    **La rotta era sbagliata, e la sonda si fermava qui.** Chiamava
    `POST /api/v1/events/<id>`, che non ha nessun handler: gli atti sui
    partecipanti stanno su `/events/<id>/participants`, e le voci sono
    `athleteId` / `status`, non `athlete_id` / `athlete_ids`. La sonda moriva
    con `NESSUN-HANDLER` prima di misurare qualunque cosa, e restava rossa
    per un difetto **suo**: e il reperto che l'audit finale ha riclassificato
    da difetto di prodotto a difetto di sonda. Round 5 era stato scritto
    apposta per eseguire cio che questa sezione impostava e non eseguiva.
  */
  const [appello, convocazione] = await Promise.all([
    inviaCome(bruno, `/api/v1/events/${EVT}/participants`, {
      method: "POST",
      body: JSON.stringify({
        action: "attendance",
        entries: [{ athleteId: ATLETA_A, status: "present" }],
      }),
    }),
    inviaCome(bruno, `/api/v1/events/${EVT}/participants`, {
      method: "POST",
      body: JSON.stringify({
        action: "convoke",
        entries: [
          { athleteId: ATLETA_A, status: "convocated" },
          { athleteId: ATLETA_B, status: "convocated" },
        ],
      }),
    }),
  ]);
  info("B-02 · appello e convocazione simultanei", {
    appello: appello.stato,
    convocazione: convocazione.stato,
  });
  const partecipanti = await prisma.clubEventParticipant.findMany({
    where: { event_id: EVT },
    select: { athlete_id: true, status: true, convocation_status: true, rsvp_status: true },
  });
  info("B-02b · righe di partecipazione", partecipanti);

  /* B-03 — Aldo (una sola delle due categorie) non scrive il congiunto. */
  const aldoScrive = await inviaCome(aldo, `/api/v1/events/${EVT}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "scritto da Aldo" }),
  });
  prova(
    "B-03 · l'allenatore di una sola categoria non scrive il congiunto",
    403,
    aldoScrive.stato,
    JSON.stringify(aldoScrive.corpo?.error?.message ?? null),
  );

  /* B-04 — ma con `categoryName` = il proprio id? (la falla di §11.2) */
  const aldoConGrafia = await inviaCome(aldo, `/api/v1/events/${EVT}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "grafia", categoryName: CAT_A }),
  });
  prova(
    "B-04 · nemmeno con categoryName = proprio id",
    403,
    aldoConGrafia.stato,
    JSON.stringify(aldoConGrafia.corpo?.error?.message ?? null),
  );
};

/* ==================================================================== */

const main = async () => {
  console.log("\n  PP-03 round 4 — etichette e concorrenza\n");
  await semina();
  try {
    await attaccoAppuntamenti();
    await attaccoConcorrenza();
  } finally {
    await pulisci();
  }

  const falliti = esiti.filter((e) => !e.ok);
  console.log(`\n  ${esiti.length - falliti.length}/${esiti.length} respinti.`);
  if (falliti.length) {
    console.log("\n  ATTACCHI RIUSCITI:");
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
