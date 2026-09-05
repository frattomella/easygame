/**
 * **PP-03 round 3 — le superfici che i round 1 e 2 non hanno percorso.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/pp-03-round3-superfici-probe.mjs
 *
 * I round precedenti hanno attaccato eventi, presenze e allegati. Qui si
 * attacca il resto: lavoro sportivo (compensi), comunicazioni e bacheca,
 * documenti, appuntamenti, dato sanitario, anagrafica dei colleghi, e la
 * falsificazione del gettone di ruolo.
 *
 * La sonda **non corregge**: `PASS` significa «l'attacco e stato respinto».
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

/* ------------------------------------------------------------ verdetto -- */

const esiti = [];
const prova = (titolo, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ titolo, ok, nota });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(74)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        ${nota}`);
};

/* ---------------------------------------------------------- gli attori -- */

const CLUB = randomUUID();
const ALTRO = randomUUID();
const CAT_A = "cat-r3-a";
const CAT_B = "cat-r3-b";
const SEDE_1 = "sede-r3-nord";
const SEDE_2 = "sede-r3-sud";

const ATLETA_A = randomUUID();
const ATLETA_B = randomUUID();
const ATLETA_ALTRO = randomUUID();

const CERT_A = randomUUID();
const CERT_B = randomUUID();

const PERSONA_A = randomUUID();
const PERSONA_B = randomUUID();
let RAPPORTO_A = null;
let RAPPORTO_B = null;

let APPUNTAMENTO_B = null;
let SLOT = null;
let RICHIESTA_DOC = null;
let ANNUNCIO = null;

let PRESIDENTE = null;
let MISTER_A = null;
let MISTER_B = null;

/** Le stringhe che NON devono mai comparire in una risposta all'allenatore A. */
const SEGRETI = {
  "athletes.data.medicalNotes": "riservato: non deve uscire verso l allenatore",
  "athletes.data.allergies": "Arachidi shock anafilattico",
  "athletes.data.bloodType": "AB-NEGATIVO-SEGRETO",
  "medical_certificates.notes": "diagnosi: cardiopatia congenita in osservazione",
  "trainers[B].iban": "IT60X0542811101000000999999",
  "trainers[B].notes": "contenzioso aperto con il collega, non divulgare",
  "sport_work_person[B].iban": "IT99K0300203280000000777777",
  "sport_work_person[B].notes": "compenso rinegoziato, riservato alla direzione",
  "appointment.internal_notes": "la famiglia non paga da tre mesi, valutare sospensione",
  "announcement.criteria": "SOLO-DIREZIONE-CRITERIO-INTERNO",
  "document_request.description": "copia del referto specialistico del minore",
};

const cercaSegreti = (corpo) => {
  const testo = JSON.stringify(corpo ?? null);
  return Object.entries(SEGRETI)
    .filter(([, valore]) => testo.includes(valore))
    .map(([chiave]) => chiave);
};

/* --------------------------------------------------------- il trasporto - */

const RADICE = path.resolve("src/app/api/v1");

/** Tutte le rotte vere sotto `/api/v1`, con i loro segmenti dinamici. */
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

const preparaTrasporto = () => {
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
    if (!moduli.has(chiave)) {
      moduli.set(chiave, await import(pathToFileURL(chiave).href));
    }
    const modulo = moduli.get(chiave);
    const fn = modulo[metodo];
    if (!fn) throw new Error(`NESSUN-HANDLER ${metodo} ${url.pathname}`);
    return fn(richiesta, { params: abbinata.params });
  };
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
      last_name: "Round3",
      password_hash: "$2b$10$pp03r3",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const semina = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp03r3-" } },
    select: { id: true },
  });
  if (residui.length) {
    const ids = residui.map((r) => r.id);
    await prisma.auditLog.deleteMany({ where: { organization_id: { in: ids } } }).catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }

  PRESIDENTE = await utente("pp03r3-presidente@example.invalid", "Anna");
  MISTER_A = await utente("pp03r3-mister-a@example.invalid", "Aldo");
  MISTER_B = await utente("pp03r3-mister-b@example.invalid", "Bruno");

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
      slug: `pp03r3-${Date.now()}`,
      name: "ASD Round3",
      creator_id: PRESIDENTE.id,
      settings,
      categories: [
        { id: CAT_A, name: "Under 12" },
        { id: CAT_B, name: "Under 15" },
      ],
      club_sites: [
        { id: SEDE_1, name: "Sede Nord", active: true },
        { id: SEDE_2, name: "Sede Sud", active: true },
      ],
      category_groups: [],
      structures: [],
      trainers: [
        {
          id: "trainer-r3-a",
          first_name: "Aldo",
          last_name: "Round3",
          email: MISTER_A.email,
          linkedUserId: MISTER_A.id,
          categories: [CAT_A],
          groups: [],
          phone: "+39 333 1110001",
          iban: "IT60X0542811101000000123456",
          notes: "nota su Aldo",
        },
        {
          id: "trainer-r3-b",
          first_name: "Bruno",
          last_name: "Round3",
          email: MISTER_B.email,
          linkedUserId: MISTER_B.id,
          categories: [CAT_B],
          groups: [],
          phone: "+39 333 2220002",
          iban: SEGRETI["trainers[B].iban"],
          notes: SEGRETI["trainers[B].notes"],
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
      slug: `pp03r3-altro-${Date.now()}`,
      name: "ASD Estranea Round3",
      creator_id: PRESIDENTE.id,
      settings,
      categories: [{ id: CAT_A, name: "Under 12" }],
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

  const clinico = {
    allergies: SEGRETI["athletes.data.allergies"],
    bloodType: SEGRETI["athletes.data.bloodType"],
    chronicDiseases: "Asma grave",
    medications: "Salbutamolo",
    medicalNotes: SEGRETI["athletes.data.medicalNotes"],
  };

  await prisma.athlete.createMany({
    data: [
      {
        id: ATLETA_A,
        organization_id: CLUB,
        first_name: "Anna",
        last_name: "CategoriaA",
        status: "active",
        category_id: CAT_A,
        category_name: "Under 12",
        data: { ...clinico, taxCode: "AAABBB00A00A000A" },
        updated_at: new Date(),
      },
      {
        id: ATLETA_B,
        organization_id: CLUB,
        first_name: "Bruna",
        last_name: "CategoriaB",
        status: "active",
        category_id: CAT_B,
        category_name: "Under 15",
        data: { ...clinico, taxCode: "BBBCCC00A00A000B" },
        updated_at: new Date(),
      },
      {
        id: ATLETA_ALTRO,
        organization_id: ALTRO,
        first_name: "Dora",
        last_name: "AltroClub",
        status: "active",
        category_id: CAT_A,
        category_name: "Under 12",
        data: { ...clinico },
        updated_at: new Date(),
      },
    ],
  });

  await prisma.athleteCategoryMembership.createMany({
    data: [
      {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: ATLETA_A,
        category_id: CAT_A,
        site_id: SEDE_1,
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: ATLETA_B,
        category_id: CAT_B,
        site_id: SEDE_2,
        updated_at: new Date(),
      },
    ],
  });

  await prisma.medicalCertificate.createMany({
    data: [
      {
        id: CERT_A,
        organization_id: CLUB,
        athlete_id: ATLETA_A,
        type: "competitive",
        issue_date: new Date("2026-01-10"),
        expiry_date: new Date("2027-01-09"),
        status: "valid",
        notes: SEGRETI["medical_certificates.notes"],
        data: { diagnosis: SEGRETI["medical_certificates.notes"] },
        updated_at: new Date(),
      },
      {
        id: CERT_B,
        organization_id: CLUB,
        athlete_id: ATLETA_B,
        type: "competitive",
        issue_date: new Date("2026-01-10"),
        expiry_date: new Date("2027-01-09"),
        status: "valid",
        notes: SEGRETI["medical_certificates.notes"],
        data: { diagnosis: SEGRETI["medical_certificates.notes"] },
        updated_at: new Date(),
      },
    ],
  });

  /* ------------------------------------------- il registro del lavoro --- */

  await prisma.sportWorkPerson.createMany({
    data: [
      {
        id: PERSONA_A,
        organization_id: CLUB,
        origin_type: "trainer",
        origin_id: "trainer-r3-a",
        first_name: "Aldo",
        last_name: "Round3",
        email: MISTER_A.email,
        iban: "IT11A0300203280000000111111",
        notes: "nota su Aldo, sua",
        updated_at: new Date(),
      },
      {
        id: PERSONA_B,
        organization_id: CLUB,
        origin_type: "trainer",
        origin_id: "trainer-r3-b",
        first_name: "Bruno",
        last_name: "Round3",
        email: MISTER_B.email,
        iban: SEGRETI["sport_work_person[B].iban"],
        notes: SEGRETI["sport_work_person[B].notes"],
        updated_at: new Date(),
      },
    ],
  });

  RAPPORTO_A = await prisma.sportWorkRelationship.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      person_id: PERSONA_A,
      role: "COACH",
      relationship_type: "SPORT_COCOCO",
      start_date: new Date("2026-07-01"),
      status: "ACTIVE",
      contract_amount: 1000,
      updated_at: new Date(),
    },
  });

  RAPPORTO_B = await prisma.sportWorkRelationship.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      person_id: PERSONA_B,
      role: "COACH",
      relationship_type: "SPORT_COCOCO",
      start_date: new Date("2026-07-01"),
      status: "ACTIVE",
      contract_amount: 99999,
      notes: SEGRETI["sport_work_person[B].notes"],
      updated_at: new Date(),
    },
  });

  /* ------------------------------------------------- gli appuntamenti --- */

  SLOT = await prisma.appointmentSlot.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      site_id: SEDE_1,
      weekday: 2,
      start_time: "17:00",
      end_time: "19:00",
      duration_minutes: 30,
      active: true,
      updated_at: new Date(),
    },
  });

  APPUNTAMENTO_B = await prisma.appointment.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      site_id: SEDE_1,
      starts_at: new Date(Date.now() + 5 * 86_400_000),
      ends_at: new Date(Date.now() + 5 * 86_400_000 + 1_800_000),
      status: "requested",
      athlete_id: ATLETA_B,
      assigned_to_user_id: MISTER_B.id,
      reason: "colloquio con la famiglia di Bruna",
      internal_notes: SEGRETI["appointment.internal_notes"],
      updated_at: new Date(),
    },
  });

  /* ------------------------------------------------ documenti e note ---- */

  RICHIESTA_DOC = await prisma.documentRequest.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      subject_kind: "athlete",
      subject_id: ATLETA_B,
      document_kind: "medical_certificate",
      title: "Referto specialistico",
      description: SEGRETI["document_request.description"],
      required: true,
      status: "open",
      updated_at: new Date(),
    },
  });

  ANNUNCIO = await prisma.clubResourceItem.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      resource_type: "announcements",
      name: "Avviso riservato alla direzione",
      status: "draft",
      payload: {
        title: "Avviso riservato",
        body: "corpo dell avviso",
        status: "draft",
        criteria: { kind: "custom", label: SEGRETI["announcement.criteria"] },
        authorUserId: PRESIDENTE.id,
      },
      updated_at: new Date(),
    },
  });

  /* Tre note di segreteria: interna, per Bruno, per tutti. */
  for (const nota of [
    { name: "Nota interna", payload: { audience: "secretariat", text: "insoluto famiglia Bruna" } },
    {
      name: "Nota per Bruno",
      payload: { audience: "trainer", trainerId: "trainer-r3-b", text: "parla con la famiglia" },
    },
    { name: "Nota per tutti", payload: { audience: "all", text: "riunione tecnica" } },
  ]) {
    await prisma.clubResourceItem.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        resource_type: "secretariat_notes",
        name: nota.name,
        payload: nota.payload,
        updated_at: new Date(),
      },
    });
  }

  await prisma.notification.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: MISTER_B.id,
      title: "Notifica privata di Bruno",
      message: "questa e solo di Bruno",
      type: "info",
      updated_at: new Date(),
    },
  });

  preparaTrasporto();
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
/*  A — Lavoro sportivo: i compensi di un altro                         */
/* ==================================================================== */

const attaccoLavoroSportivo = async () => {
  console.log("\nA — lavoro sportivo e compensi");
  await comeUtente(MISTER_A, "trainer");

  const miei = await chiama("/api/v1/sport-work/me");
  prova("A-01 · GET /sport-work/me risponde 200", 200, miei.stato);
  prova(
    "A-02 · /sport-work/me e la persona giusta",
    PERSONA_A,
    miei.corpo?.data?.personId ?? null,
  );
  prova(
    "A-03 · /sport-work/me non porta i segreti del collega",
    [],
    cercaSegreti(miei.corpo),
  );
  prova(
    "A-04 · /sport-work/me non porta il contratto del collega",
    false,
    JSON.stringify(miei.corpo).includes("99999"),
  );

  for (const [titolo, percorso] of [
    ["person_id in query", `/api/v1/sport-work/me?person_id=${PERSONA_B}`],
    ["personId in query", `/api/v1/sport-work/me?personId=${PERSONA_B}`],
    ["worker_id in query", `/api/v1/sport-work/me?worker_id=${PERSONA_B}`],
  ]) {
    const r = await chiama(percorso);
    prova(
      `A-05 · ${titolo} non cambia la persona`,
      true,
      r.stato !== 200 || r.corpo?.data?.personId === PERSONA_A,
      `stato ${r.stato} personId ${r.corpo?.data?.personId}`,
    );
  }

  const rotteDirezione = [
    ["GET", "/api/v1/sport-work/people"],
    ["GET", `/api/v1/sport-work/people/${PERSONA_B}`],
    ["GET", "/api/v1/sport-work/dashboard"],
    ["GET", "/api/v1/sport-work/relationships"],
    ["GET", "/api/v1/sport-work/installments"],
    ["GET", "/api/v1/sport-work/payouts"],
    ["GET", "/api/v1/sport-work/obligations"],
    ["GET", "/api/v1/sport-work/declarations"],
    ["GET", "/api/v1/sport-work/bonuses"],
    ["GET", "/api/v1/sport-work/reimbursements"],
    ["GET", "/api/v1/sport-work/vat-invoices"],
    ["GET", "/api/v1/sport-work/datasets"],
    ["GET", "/api/v1/sport-work/scheduler"],
  ];
  for (const [metodo, percorso] of rotteDirezione) {
    const r = await chiama(percorso, { method: metodo });
    prova(
      `A-06 · ${metodo} ${percorso.replace("/api/v1/sport-work", "")} negato`,
      true,
      r.stato === 403 || r.stato === 404,
      `stato ${r.stato} corpo ${JSON.stringify(r.corpo).slice(0, 180)}`,
    );
  }

  const prepara = await chiama("/api/v1/sport-work/payouts/prepare", {
    method: "POST",
    body: JSON.stringify({ personId: PERSONA_B, installmentIds: [] }),
  });
  prova("A-07 · POST /payouts/prepare negato", 403, prepara.stato);

  const modifica = await chiama(`/api/v1/sport-work/people/${PERSONA_A}`, {
    method: "PATCH",
    body: JSON.stringify({ iban: "IT00X0000000000000000000000" }),
  });
  prova("A-08 · PATCH sulla propria scheda del registro negato", 403, modifica.stato);

  for (const risorsa of ["sport_work", "trainer_payments", "sport_work_people"]) {
    const r = await chiama(`/api/v1/${risorsa}`);
    prova(
      `A-09 · registro generico /${risorsa} negato`,
      true,
      r.stato === 403 || r.stato === 400,
      `stato ${r.stato} ${JSON.stringify(r.corpo).slice(0, 140)}`,
    );
  }

  const allegati = await chiama(
    `/api/v1/attachments?owner_type=sport_work_person&owner_id=${PERSONA_B}&club_id=${CLUB}`,
  );
  prova(
    "A-10 · allegati del registro compensi del collega negati",
    true,
    allegati.stato === 403 || (allegati.corpo?.data || []).length === 0,
    `stato ${allegati.stato}`,
  );
};

/* ==================================================================== */
/*  B — Dato sanitario e anagrafica atleti                              */
/* ==================================================================== */

const attaccoSanitario = async () => {
  console.log("\nB — dato sanitario e anagrafica");
  await comeUtente(MISTER_A, "trainer");

  for (const risorsa of ["athletes", "simplified_athletes"]) {
    const r = await chiama(`/api/v1/${risorsa}?club_id=${CLUB}`);
    const ids = (r.corpo?.data || []).map((x) => x.id);
    prova(`B-01 · GET /${risorsa} non porta l'atleta di B`, false, ids.includes(ATLETA_B));
    prova(`B-02 · GET /${risorsa} non porta clinico`, [], cercaSegreti(r.corpo));
  }

  const perId = await chiama(`/api/v1/athletes/${ATLETA_B}`);
  prova(
    "B-03 · GET /athletes/:id dell'atleta di B negato",
    true,
    perId.stato === 403 || perId.stato === 404 || perId.corpo?.data === null,
    `stato ${perId.stato} ${JSON.stringify(perId.corpo).slice(0, 160)}`,
  );

  const proprio = await chiama(`/api/v1/athletes/${ATLETA_A}`);
  prova(
    "B-04 · GET /athletes/:id del proprio atleta senza clinico",
    [],
    cercaSegreti(proprio.corpo),
  );

  for (const risorsa of ["medical_certificates", "simplified_certificates"]) {
    const r = await chiama(`/api/v1/${risorsa}?club_id=${CLUB}`);
    const ids = (r.corpo?.data || []).map((x) => x.athlete_id);
    prova(
      `B-05 · GET /${risorsa} non porta il certificato di B`,
      false,
      ids.includes(ATLETA_B),
      `stato ${r.stato} atleti ${JSON.stringify(ids)}`,
    );
    prova(`B-06 · GET /${risorsa} non porta la diagnosi`, [], cercaSegreti(r.corpo));
  }

  const certAltrui = await chiama(`/api/v1/medical_certificates/${CERT_B}`);
  prova(
    "B-07 · GET /medical_certificates/:id di B negato",
    true,
    certAltrui.stato === 403 || certAltrui.corpo?.data === null,
    `stato ${certAltrui.stato} ${JSON.stringify(certAltrui.corpo).slice(0, 160)}`,
  );

  const certProprio = await chiama(`/api/v1/medical_certificates/${CERT_A}`);
  prova(
    "B-08 · GET /medical_certificates/:id proprio senza diagnosi",
    [],
    cercaSegreti(certProprio.corpo),
  );

  /* Cross-tenant: l'atleta di un club di cui non e membro. */
  const altrui = await chiama(`/api/v1/athletes/${ATLETA_ALTRO}`);
  prova(
    "B-09 · GET /athletes/:id di un altro club negato",
    true,
    altrui.stato === 403 || altrui.corpo?.data === null,
    `stato ${altrui.stato}`,
  );

  /* La rotta generica sull'alias storico delle presenze. */
  for (const risorsa of ["club_event_participants", "training_attendance"]) {
    const r = await chiama(`/api/v1/${risorsa}?club_id=${CLUB}`);
    prova(
      `B-10 · GET /${risorsa} risponde senza errore`,
      200,
      r.stato,
      JSON.stringify(r.corpo).slice(0, 140),
    );
  }
};

/* ==================================================================== */
/*  C — Anagrafica dei colleghi                                         */
/* ==================================================================== */

const attaccoColleghi = async () => {
  console.log("\nC — anagrafica dei colleghi");
  await comeUtente(MISTER_A, "trainer");

  const trainers = await chiama(`/api/v1/trainers?club_id=${CLUB}`);
  prova(
    "C-01 · GET /trainers non porta IBAN e note del collega",
    [],
    cercaSegreti(trainers.corpo),
    `stato ${trainers.stato} corpo ${JSON.stringify(trainers.corpo).slice(0, 400)}`,
  );

  const staff = await chiama(`/api/v1/staff_members?club_id=${CLUB}`);
  prova("C-02 · GET /staff_members non porta segreti", [], cercaSegreti(staff.corpo));

  const clubs = await chiama(`/api/v1/clubs?club_id=${CLUB}`);
  prova(
    "C-03 · GET /clubs negato all'allenatore",
    true,
    clubs.stato === 403,
    `stato ${clubs.stato}`,
  );

  const perId = await chiama(`/api/v1/clubs/${CLUB}`);
  prova("C-04 · GET /clubs/:id negato", true, perId.stato === 403, `stato ${perId.stato}`);
};

/* ==================================================================== */
/*  D — Bacheca, comunicazioni, notifiche                               */
/* ==================================================================== */

const attaccoComunicazioni = async () => {
  console.log("\nD — bacheca, comunicazioni, notifiche");
  await comeUtente(MISTER_A, "trainer");

  const bacheca = await chiama("/api/v1/announcements");
  prova(
    "D-01 · GET /announcements (gestione) negato",
    403,
    bacheca.stato,
    JSON.stringify(bacheca.corpo).slice(0, 200),
  );

  const mie = await chiama("/api/v1/announcements?mine=1");
  prova("D-02 · GET /announcements?mine=1 non porta i criteri", [], cercaSegreti(mie.corpo));

  const crea = await chiama("/api/v1/announcements", {
    method: "POST",
    body: JSON.stringify({ title: "Da un allenatore", body: "test", criteria: { kind: "all" } }),
  });
  prova("D-03 · POST /announcements negato", 403, crea.stato);

  const modifica = await chiama(`/api/v1/announcements/${ANNUNCIO.id}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "manomesso", body: "x" }),
  });
  prova(
    "D-04 · PATCH /announcements/:id negato",
    true,
    modifica.stato === 403 || modifica.stato === 405 || modifica.stato === -1,
    `stato ${modifica.stato} ${JSON.stringify(modifica.corpo).slice(0, 160)}`,
  );

  const anteprima = await chiama("/api/v1/communications", {
    method: "POST",
    body: JSON.stringify({
      preview: true,
      criteria: { kind: "all" },
      template: { subject: "x", body: "y" },
    }),
  });
  prova(
    "D-05 · POST /communications anteprima su tutto il club negata",
    403,
    anteprima.stato,
    JSON.stringify(anteprima.corpo).slice(0, 200),
  );

  const invio = await chiama("/api/v1/communications", {
    method: "POST",
    body: JSON.stringify({
      criteria: { kind: "category", categoryId: CAT_B },
      template: { subject: "x", body: "y" },
    }),
  });
  prova("D-06 · POST /communications invio ad altra categoria negato", 403, invio.stato);

  /* Le righe della bacheca dalla porta di servizio del registro generico. */
  for (const percorso of [
    `/api/v1/club_resource_items?club_id=${CLUB}&resource_type=announcements`,
    `/api/v1/club_resource_items/${ANNUNCIO.id}`,
  ]) {
    const r = await chiama(percorso);
    prova(
      `D-07 · ${percorso.split("?")[0]} non porta i criteri dell'annuncio`,
      [],
      cercaSegreti(r.corpo),
      `stato ${r.stato} ${JSON.stringify(r.corpo).slice(0, 200)}`,
    );
  }

  const note = await chiama(`/api/v1/secretariat_notes?club_id=${CLUB}`);
  const nomiNote = (note.corpo?.data || []).map((x) => x.name);
  prova(
    "D-08 · /secretariat_notes non porta la nota interna",
    false,
    nomiNote.includes("Nota interna"),
    `stato ${note.stato} note ${JSON.stringify(nomiNote)}`,
  );
  prova(
    "D-09 · /secretariat_notes non porta la nota di Bruno",
    false,
    nomiNote.includes("Nota per Bruno"),
    `note ${JSON.stringify(nomiNote)}`,
  );

  const notifiche = await chiama(`/api/v1/notifications?club_id=${CLUB}`);
  const titoli = (notifiche.corpo?.data || []).map((x) => x.title);
  prova(
    "D-10 · /notifications non porta la notifica privata di Bruno",
    false,
    titoli.includes("Notifica privata di Bruno"),
    `stato ${notifiche.stato} titoli ${JSON.stringify(titoli)}`,
  );
};

/* ==================================================================== */
/*  E — Appuntamenti                                                    */
/* ==================================================================== */

const attaccoAppuntamenti = async () => {
  console.log("\nE — appuntamenti");
  await comeUtente(MISTER_A, "trainer");

  const elenco = await chiama(`/api/v1/appointments?club_id=${CLUB}`);
  const ids = (elenco.corpo?.data || []).map((x) => x.id);
  prova(
    "E-01 · GET /appointments non porta quello di Bruno",
    false,
    ids.includes(APPUNTAMENTO_B.id),
    `stato ${elenco.stato} ids ${JSON.stringify(ids)}`,
  );
  prova("E-02 · GET /appointments non porta le note interne", [], cercaSegreti(elenco.corpo));

  const perId = await chiama(`/api/v1/appointments/${APPUNTAMENTO_B.id}`);
  prova(
    "E-03 · GET /appointments/:id di Bruno negato",
    true,
    perId.stato === 403 || perId.stato === 404,
    `stato ${perId.stato} ${JSON.stringify(perId.corpo).slice(0, 200)}`,
  );

  const annulla = await chiama(`/api/v1/appointments/${APPUNTAMENTO_B.id}`, {
    method: "POST",
    body: JSON.stringify({ action: "cancel", note: "annullato da un estraneo" }),
  });
  prova("E-04 · POST cancel sull'appuntamento di Bruno negato", 403, annulla.stato);

  const conferma = await chiama(`/api/v1/appointments/${APPUNTAMENTO_B.id}`, {
    method: "POST",
    body: JSON.stringify({ action: "confirm", assigned_to: MISTER_A.id }),
  });
  prova("E-05 · POST confirm con riassegnazione a se negato", 403, conferma.stato);

  const creaSlot = await chiama("/api/v1/appointment-slots", {
    method: "POST",
    body: JSON.stringify({ weekday: 3, start_time: "09:00", end_time: "10:00" }),
  });
  prova("E-06 · POST /appointment-slots negato", 403, creaSlot.stato);

  const cancellaSlot = await chiama(`/api/v1/appointment-slots/${SLOT.id}`, {
    method: "DELETE",
  });
  prova("E-07 · DELETE /appointment-slots/:id negato", 403, cancellaSlot.stato);

  const creaApp = await chiama("/api/v1/appointments", {
    method: "POST",
    body: JSON.stringify({
      athlete_id: ATLETA_B,
      starts_at: new Date(Date.now() + 9 * 86_400_000).toISOString(),
      reason: "creato da un allenatore",
      assigned_to: MISTER_A.id,
    }),
  });
  prova("E-08 · POST /appointments negato", 403, creaApp.stato);

  const slots = await chiama("/api/v1/appointment-slots");
  prova(
    "E-09 · GET /appointment-slots (configurazione del club) — misura",
    true,
    slots.stato === 403,
    `stato ${slots.stato}: l'allenatore legge la configurazione di ricevimento del club`,
  );
};

/* ==================================================================== */
/*  F — Documenti                                                       */
/* ==================================================================== */

const attaccoDocumenti = async () => {
  console.log("\nF — documenti");
  await comeUtente(MISTER_A, "trainer");

  const percorsi = [
    `/api/v1/document-requests?club_id=${CLUB}`,
    `/api/v1/document-requests?club_id=${CLUB}&subject_kind=athlete&subject_id=${ATLETA_B}`,
    `/api/v1/document-requests/${RICHIESTA_DOC.id}`,
    "/api/v1/documents/templates",
    "/api/v1/documents/generated",
    "/api/v1/documents/catalog",
    "/api/v1/documents/filled",
    `/api/v1/document_templates?club_id=${CLUB}`,
    `/api/v1/document_submissions?club_id=${CLUB}`,
  ];
  for (const percorso of percorsi) {
    const r = await chiama(percorso);
    const fuga = cercaSegreti(r.corpo);
    prova(
      `F-01 · ${percorso.split("?")[0]} chiuso o senza segreti`,
      true,
      (r.stato === 403 || r.stato === 400 || r.stato === 404 || r.stato === -1 ||
        (r.corpo?.data || []).length === 0) && fuga.length === 0,
      `stato ${r.stato} fuga ${JSON.stringify(fuga)} corpo ${JSON.stringify(r.corpo).slice(0, 200)}`,
    );
  }

  const deposito = await chiama("/api/v1/document-submissions", {
    method: "POST",
    body: JSON.stringify({
      request_id: RICHIESTA_DOC.id,
      source: "club",
      attachment_id: randomUUID(),
    }),
  });
  prova(
    "F-02 · POST /document-submissions negato",
    true,
    deposito.stato === 403 || deposito.stato === 400 || deposito.stato === -1,
    `stato ${deposito.stato} ${JSON.stringify(deposito.corpo).slice(0, 200)}`,
  );

  const allegatiAtleta = await chiama(
    `/api/v1/attachments?owner_type=athlete&owner_id=${ATLETA_B}&club_id=${CLUB}`,
  );
  prova(
    "F-03 · allegati dell'atleta di un'altra squadra negati",
    true,
    allegatiAtleta.stato === 403 || (allegatiAtleta.corpo?.data || []).length === 0,
    `stato ${allegatiAtleta.stato}`,
  );

  const audit = await chiama(`/api/v1/audit?club_id=${CLUB}`);
  prova("F-04 · GET /audit negato all'allenatore", true, audit.stato === 403, `stato ${audit.stato}`);
};

/* ==================================================================== */
/*  G — Falsificazione del ruolo attivo                                 */
/* ==================================================================== */

const attaccoRuolo = async () => {
  console.log("\nG — falsificazione del gettone di ruolo");

  const gettoni = [
    "owner",
    "club_manager",
    "staff",
    "custom:owner:direzione|clinical.read,sport_work.read,board.publish",
    "custom:club_manager:segreteria|clinical.read,sport_work.read",
    "custom:trainer:mio|clinical.read,sport_work.read,board.publish,appointments.read",
  ];

  for (const gettone of gettoni) {
    await comeUtente(MISTER_A, gettone);
    const atleti = await chiama(`/api/v1/athletes?club_id=${CLUB}`);
    const ids = (atleti.corpo?.data || []).map((x) => x.id);
    prova(
      `G-01 · gettone «${gettone.slice(0, 34)}» non allarga gli atleti`,
      false,
      ids.includes(ATLETA_B),
      `stato ${atleti.stato} ids ${JSON.stringify(ids)}`,
    );
    prova(
      `G-02 · gettone «${gettone.slice(0, 34)}» non fa uscire il clinico`,
      [],
      cercaSegreti(atleti.corpo),
    );

    const compensi = await chiama("/api/v1/sport-work/people");
    prova(
      `G-03 · gettone «${gettone.slice(0, 34)}» non apre il registro compensi`,
      true,
      compensi.stato !== 200,
      `stato ${compensi.stato} ${JSON.stringify(compensi.corpo).slice(0, 160)}`,
    );
  }

  /* Il club di cui non e membro. */
  await comeUtente(MISTER_A, "trainer", ALTRO);
  const fuori = await chiama(`/api/v1/athletes?club_id=${ALTRO}`);
  const idsFuori = (fuori.corpo?.data || []).map((x) => x.id);
  prova(
    "G-04 · club di cui non e membro: nessun atleta",
    false,
    idsFuori.includes(ATLETA_ALTRO),
    `stato ${fuori.stato} ids ${JSON.stringify(idsFuori)}`,
  );
  CLUB_ATTIVO = CLUB;
};

/* ==================================================================== */

const main = async () => {
  console.log("\n  PP-03 round 3 — le superfici non percorse\n");
  await semina();
  try {
    await attaccoLavoroSportivo();
    await attaccoSanitario();
    await attaccoColleghi();
    await attaccoComunicazioni();
    await attaccoAppuntamenti();
    await attaccoDocumenti();
    await attaccoRuolo();
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
