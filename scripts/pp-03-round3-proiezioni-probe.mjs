/**
 * **PP-03 round 3 (b) — proiezioni, paginazione, notifiche, dato clinico.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/pp-03-round3-proiezioni-probe.mjs
 *
 * Le quattro domande che la prima sonda del round non ha fatto:
 *
 * 1. il taglio del dato clinico e una **lista di divieti** su una colonna JSON
 *    libera: cosa esce se il club scrive con nomi che la lista non conosce;
 * 2. la paginazione decide in `listResourcePage` **prima** che il perimetro
 *    dell'allenatore tagli le righe: il conteggio e la pagina che ne escono;
 * 3. `notifications` e l'unica risorsa che un allenatore puo **scrivere** dal
 *    registro generico: fin dove arriva quella scrittura;
 * 4. le rotte di scrittura del lavoro sportivo che la prima sonda non ha
 *    toccato.
 *
 * `PASS` = attacco respinto o comportamento corretto.
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
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(72)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        ${nota}`);
};

/* --------------------------------------------------------------- attori */

const CLUB = randomUUID();
const ALTRO = randomUUID();
const CAT_A = "cat-r3b-a";
const CAT_B = "cat-r3b-b";
const SEDE_1 = "sede-r3b-nord";

const ATLETI_A = Array.from({ length: 3 }, () => randomUUID());
const ATLETI_B = Array.from({ length: 12 }, () => randomUUID());
let CERT_A = null;

let PRESIDENTE = null;
let MISTER_A = null;
let MISTER_B = null;
let ESTRANEO = null;
let NOTIFICA_DI_B = null;

/* Le parole che il club scrive **con i propri nomi di campo**. */
const CLINICO_LIBERO = {
  diagnosi: "DIAGNOSI-SEGRETA-cardiopatia",
  referto: "REFERTO-SEGRETO-ecocardiogramma",
  terapia: "TERAPIA-SEGRETA-betabloccante",
  anamnesi: "ANAMNESI-SEGRETA-familiarita",
  noteDelMedico: "NOTE-MEDICO-SEGRETE",
};
const PAROLE = Object.values(CLINICO_LIBERO);
const fughe = (corpo) => {
  const testo = JSON.stringify(corpo ?? null);
  return PAROLE.filter((p) => testo.includes(p));
};

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
      last_name: "R3b",
      password_hash: "$2b$10$pp03r3b",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

/* ------------------------------------------------------------- semina - */

const semina = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp03r3b-" } },
    select: { id: true },
  });
  if (residui.length) {
    const ids = residui.map((r) => r.id);
    await prisma.auditLog.deleteMany({ where: { organization_id: { in: ids } } }).catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }

  PRESIDENTE = await utente("pp03r3b-presidente@example.invalid", "Anna");
  MISTER_A = await utente("pp03r3b-mister-a@example.invalid", "Aldo");
  MISTER_B = await utente("pp03r3b-mister-b@example.invalid", "Bruno");
  ESTRANEO = await utente("pp03r3b-estraneo@example.invalid", "Elia");

  const settings = {
    seasons: [
      {
        id: "2026-27",
        label: "2026/27",
        startDate: "2026-07-01",
        endDate: "2027-06-30",
        status: "active",
      },
    ],
  };

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `pp03r3b-${Date.now()}`,
      name: "ASD Round3b",
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
          id: "trainer-r3b-a",
          first_name: "Aldo",
          last_name: "R3b",
          email: MISTER_A.email,
          linkedUserId: MISTER_A.id,
          categories: [CAT_A],
          groups: [],
        },
        {
          id: "trainer-r3b-b",
          first_name: "Bruno",
          last_name: "R3b",
          email: MISTER_B.email,
          linkedUserId: MISTER_B.id,
          categories: [CAT_B],
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
      slug: `pp03r3b-altro-${Date.now()}`,
      name: "ASD Estranea R3b",
      creator_id: ESTRANEO.id,
      settings,
      categories: [],
      updated_at: new Date(),
    },
  });

  for (const [riga, ruolo, club] of [
    [MISTER_A, "trainer", CLUB],
    [MISTER_B, "trainer", CLUB],
    [PRESIDENTE, "owner", CLUB],
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

  /*
    Tre atleti di A e **dodici** di B: con `limit=5` la prima pagina del
    database non contiene nemmeno un atleta di Aldo, ed e il caso in cui la
    paginazione e il perimetro si contraddicono.
  */
  const righe = [
    ...ATLETI_A.map((id, i) => ({
      id,
      organization_id: CLUB,
      first_name: `AtletaA${i}`,
      last_name: "Zulu",
      status: "active",
      category_id: CAT_A,
      category_name: "Under 12",
      data: { ...CLINICO_LIBERO, allergies: "NASCOSTA-lista-nota" },
      created_at: new Date(Date.now() + 100000 + i),
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
      data: { ...CLINICO_LIBERO },
      created_at: new Date(Date.now() + i),
      updated_at: new Date(),
    })),
  ];
  await prisma.athlete.createMany({ data: righe });

  await prisma.athleteCategoryMembership.createMany({
    data: righe.map((r) => ({
      id: randomUUID(),
      organization_id: CLUB,
      athlete_id: r.id,
      category_id: r.category_id,
      site_id: SEDE_1,
      updated_at: new Date(),
    })),
  });

  CERT_A = await prisma.medicalCertificate.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      athlete_id: ATLETI_A[0],
      type: "competitive",
      issue_date: new Date("2026-01-10"),
      expiry_date: new Date("2027-01-09"),
      status: "valid",
      notes: "nota di primo livello",
      data: { ...CLINICO_LIBERO },
      updated_at: new Date(),
    },
  });

  NOTIFICA_DI_B = await prisma.notification.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: MISTER_B.id,
      title: "Solo per Bruno",
      message: "riservata",
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

const attaccoClinicoLibero = async () => {
  console.log("\nH — il dato clinico scritto con i nomi del club");
  await comeUtente(MISTER_A, "trainer");

  const propri = await chiama(`/api/v1/athletes?club_id=${CLUB}`);
  prova(
    "H-01 · /athletes: il clinico a nomi liberi non esce",
    [],
    fughe(propri.corpo),
    `stato ${propri.stato} — la lista dei divieti copre solo i nomi che conosce`,
  );
  prova(
    "H-02 · /athletes: il clinico a nomi noti non esce",
    false,
    JSON.stringify(propri.corpo).includes("NASCOSTA-lista-nota"),
  );

  const dettaglio = await chiama(`/api/v1/athletes/${ATLETI_A[0]}`);
  prova("H-03 · /athletes/:id: il clinico a nomi liberi non esce", [], fughe(dettaglio.corpo));

  const certificati = await chiama(`/api/v1/medical_certificates?club_id=${CLUB}`);
  prova(
    "H-04 · /medical_certificates: il clinico a nomi liberi non esce",
    [],
    fughe(certificati.corpo),
    `stato ${certificati.stato} corpo ${JSON.stringify(certificati.corpo).slice(0, 300)}`,
  );

  const cert = await chiama(`/api/v1/medical_certificates/${CERT_A.id}`);
  prova("H-05 · /medical_certificates/:id: idem per identificativo", [], fughe(cert.corpo));

  /* Il profilo atleta, l'altra porta sullo stesso certificato. */
  const profilo = await chiama(`/api/v1/auth/athlete-profile/${ATLETI_A[0]}`);
  prova(
    "H-06 · /auth/athlete-profile/:id chiuso o senza clinico libero",
    true,
    profilo.stato !== 200 || fughe(profilo.corpo).length === 0,
    `stato ${profilo.stato} fughe ${JSON.stringify(fughe(profilo.corpo))}`,
  );
};

const attaccoPaginazione = async () => {
  console.log("\nI — paginazione e conteggio contro il perimetro");
  await comeUtente(MISTER_A, "trainer");

  const intera = await chiama(`/api/v1/athletes?club_id=${CLUB}`);
  const suoi = (intera.corpo?.data || []).length;
  prova("I-01 · senza pagina l'allenatore vede i suoi tre atleti", 3, suoi);

  const pagina = await chiama(`/api/v1/athletes?club_id=${CLUB}&limit=5&offset=0`);
  const righe = (pagina.corpo?.data || []).length;
  const meta = pagina.corpo?.meta || null;

  prova(
    "I-02 · meta.total non dichiara gli atleti fuori perimetro",
    3,
    meta?.total ?? null,
    `meta=${JSON.stringify(meta)} — delegate.count() gira sul club intero, il perimetro taglia dopo`,
  );
  prova(
    "I-03 · la prima pagina non e vuota per chi ha tre atleti",
    true,
    righe > 0,
    `righe restituite ${righe} su limit=5, meta=${JSON.stringify(meta)}`,
  );

  const ultima = await chiama(`/api/v1/athletes?club_id=${CLUB}&limit=5&offset=10`);
  prova(
    "I-04 · nessuna pagina restituisce righe fuori perimetro",
    true,
    (ultima.corpo?.data || []).every((r) => ATLETI_A.includes(r.id)),
    `ids ${JSON.stringify((ultima.corpo?.data || []).map((r) => r.id))}`,
  );

  const certificati = await chiama(
    `/api/v1/medical_certificates?club_id=${CLUB}&limit=5&offset=0`,
  );
  prova(
    "I-05 · anche i certificati impaginati restano nel perimetro",
    true,
    (certificati.corpo?.data || []).every((r) => ATLETI_A.includes(r.athlete_id)),
    `${JSON.stringify((certificati.corpo?.data || []).map((r) => r.athlete_id))}`,
  );
};

const attaccoNotifiche = async () => {
  console.log("\nL — la scrittura che l'allenatore ha davvero");
  await comeUtente(MISTER_A, "trainer");

  const aTutti = await chiama("/api/v1/notifications", {
    method: "POST",
    body: JSON.stringify({ user_id: null, title: "A tutti", message: "x", type: "info" }),
  });
  prova("L-01 · notifica «di societa» negata", true, aTutti.stato !== 200, `stato ${aTutti.stato}`);

  const senzaCampo = await chiama("/api/v1/notifications", {
    method: "POST",
    body: JSON.stringify({ title: "Senza destinatario", message: "x", type: "info" }),
  });
  prova(
    "L-02 · notifica senza destinatario negata",
    true,
    senzaCampo.stato !== 200,
    `stato ${senzaCampo.stato}`,
  );

  const fuoriClub = await chiama("/api/v1/notifications", {
    method: "POST",
    body: JSON.stringify({
      user_id: ESTRANEO.id,
      title: "Verso un altro club",
      message: "x",
      type: "info",
    }),
  });
  prova(
    "L-03 · notifica a un utente di un altro club negata",
    true,
    fuoriClub.stato !== 200,
    `stato ${fuoriClub.stato}`,
  );

  const alPresidente = await chiama("/api/v1/notifications", {
    method: "POST",
    body: JSON.stringify({
      user_id: PRESIDENTE.id,
      title: "Messaggio arbitrario dall'allenatore",
      message: "testo scelto da chi non ha communications.send",
      type: "warning",
    }),
  });
  prova(
    "L-04 · notifica arbitraria a un membro del club — misura",
    true,
    alPresidente.stato !== 200,
    `stato ${alPresidente.stato}: l'allenatore recapita testo libero (e una email) a un altro membro`,
  );

  const leggi = await chiama(`/api/v1/notifications/${NOTIFICA_DI_B.id}`);
  prova(
    "L-05 · GET /notifications/:id di Bruno negato",
    true,
    leggi.stato !== 200 || leggi.corpo?.data === null,
    `stato ${leggi.stato} corpo ${JSON.stringify(leggi.corpo).slice(0, 160)}`,
  );

  const modifica = await chiama(`/api/v1/notifications/${NOTIFICA_DI_B.id}`, {
    method: "PATCH",
    body: JSON.stringify({ read: true, title: "manomessa" }),
  });
  prova(
    "L-06 · PATCH /notifications/:id di Bruno negato",
    true,
    modifica.stato !== 200,
    `stato ${modifica.stato} corpo ${JSON.stringify(modifica.corpo).slice(0, 200)}`,
  );

  const cancella = await chiama(`/api/v1/notifications/${NOTIFICA_DI_B.id}`, {
    method: "DELETE",
  });
  prova(
    "L-07 · DELETE /notifications/:id di Bruno negato",
    true,
    cancella.stato !== 200,
    `stato ${cancella.stato} corpo ${JSON.stringify(cancella.corpo).slice(0, 200)}`,
  );

  const rimasta = await prisma.notification.findUnique({
    where: { id: NOTIFICA_DI_B.id },
  });
  prova("L-08 · la notifica di Bruno e ancora in archivio", true, Boolean(rimasta));
  prova(
    "L-09 · il titolo della notifica di Bruno non e cambiato",
    "Solo per Bruno",
    rimasta?.title ?? null,
  );
};

const attaccoScritture = async () => {
  console.log("\nM — le scritture di dominio non toccate dalla prima sonda");
  await comeUtente(MISTER_A, "trainer");

  const casi = [
    ["POST", "/api/v1/sport-work/scheduler", {}],
    ["POST", "/api/v1/sport-work/people", { firstName: "X", lastName: "Y" }],
    ["POST", "/api/v1/sport-work/relationships", { personId: randomUUID() }],
    ["POST", "/api/v1/sport-work/declarations", { personId: randomUUID() }],
    ["POST", "/api/v1/sport-work/obligations/sync", {}],
    ["POST", "/api/v1/document-requests", {
      subject_kind: "athlete",
      subject_id: ATLETI_B[0],
      document_kind: "identity_document",
      title: "Documento",
    }],
    ["POST", "/api/v1/appointment-slots", { weekday: 1, start_time: "09:00", end_time: "10:00" }],
    ["POST", "/api/v1/club-roles", { name: "Super", baseRole: "owner", permissions: [] }],
    ["POST", "/api/v1/athletes", {
      first_name: "Intruso",
      last_name: "Creato",
      category_id: CAT_A,
      organization_id: CLUB,
    }],
    ["POST", "/api/v1/medical_certificates", {
      athlete_id: ATLETI_A[0],
      type: "competitive",
      status: "valid",
      organization_id: CLUB,
    }],
    ["POST", "/api/v1/secretariat_notes", { name: "Nota scritta da un allenatore", payload: {} }],
    ["POST", "/api/v1/trainers", { first_name: "Falso", last_name: "Mister" }],
    ["POST", "/api/v1/organization_users", {
      organization_id: CLUB,
      user_id: null,
      role: "owner",
    }],
  ];

  for (const [metodo, percorso, corpo] of casi) {
    const r = await chiama(percorso, { method: metodo, body: JSON.stringify(corpo) });
    prova(
      `M-01 · ${metodo} ${percorso.replace("/api/v1", "")} negato`,
      true,
      r.stato !== 200,
      `stato ${r.stato} ${JSON.stringify(r.corpo).slice(0, 180)}`,
    );
  }

  const modificaAtleta = await chiama(`/api/v1/athletes/${ATLETI_A[0]}`, {
    method: "PATCH",
    body: JSON.stringify({ last_name: "Manomesso" }),
  });
  prova(
    "M-02 · PATCH /athletes/:id del proprio atleta negato",
    true,
    modificaAtleta.stato !== 200,
    `stato ${modificaAtleta.stato}`,
  );

  const cancellaAtleta = await chiama(`/api/v1/athletes/${ATLETI_A[0]}`, { method: "DELETE" });
  prova(
    "M-03 · DELETE /athletes/:id negato",
    true,
    cancellaAtleta.stato !== 200,
    `stato ${cancellaAtleta.stato}`,
  );

  const ancora = await prisma.athlete.findUnique({ where: { id: ATLETI_A[0] } });
  prova("M-04 · l'atleta e ancora in archivio con il suo cognome", "Zulu", ancora?.last_name ?? null);
};

/* ==================================================================== */

const main = async () => {
  console.log("\n  PP-03 round 3 (b) — proiezioni, paginazione, scritture\n");
  await semina();
  try {
    await attaccoClinicoLibero();
    await attaccoPaginazione();
    await attaccoNotifiche();
    await attaccoScritture();
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
