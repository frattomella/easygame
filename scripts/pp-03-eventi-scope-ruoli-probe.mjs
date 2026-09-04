/**
 * **Seconda revisione ostile di PP-03 — eventi, presenze, scope, ruoli.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/pp-03-eventi-scope-ruoli-probe.mjs
 *
 * Schema copiato da `scripts/pp-03-security-probe.mjs`: dirottamento di
 * `fetch` sui route handler veri, sessioni vere, database vero, pulizia in
 * `finally`. Nessuna riga di produzione viene toccata.
 *
 * `PASS` = l'attacco e stato respinto. `FAIL` = l'attacco e riuscito.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("Rifiuto: serve EASYGAME_DB_ENV=development.");
  process.exit(1);
}

const NL = String.fromCharCode(10);
const prisma = new PrismaClient();
const carica = (rel) => import(pathToFileURL(path.resolve(rel)).href);

/* ----------------------------------------------------------- il verdetto */

const esiti = [];

const prova = (titolo, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ titolo, ok, nota });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(82)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (nota) console.log(`        nota: ${nota}`);
};

const osserva = (titolo, valore) => {
  console.log(`  ....  ${titolo.padEnd(82)} ${JSON.stringify(valore)}`);
};

/* -------------------------------------------------------- gli attori --- */

const CLUB = randomUUID();
const ALTRO_CLUB = randomUUID();
const SEDE_1 = "sede-pp03o2-nord";
const SEDE_2 = "sede-pp03o2-sud";
const CAT_A = "cat-pp03o2-a";
const CAT_B = "cat-pp03o2-b";
const CAT_C = "cat-pp03o2-c";

const ATLETA_A = randomUUID();
const ATLETA_B = randomUUID();
const ATLETA_C = randomUUID();
const ATLETA_SENZA = randomUUID();
const ATLETA_ALTRO_CLUB = randomUUID();

let PRESIDENTE = null;
let MISTER_A = null;
let MISTER_B = null;
let MISTER_S = null;
let COLLAB = null;
let COLLAB2 = null;
let UTENTE_CUSTOM = null;
let UTENTE_ORFANO = null;

const MEMBERSHIP = {};

let eventi;
let risorse;
let auth;

const scope = (activeRole, userId, accessScopes = [], org = CLUB) => ({
  userId,
  activeOrganizationId: org,
  activeRole,
  activeMembershipId: null,
  allowedOrganizationIds: [org],
  accessScopes,
});

const utente = async (email, nome) => {
  const trovato = await prisma.user.findUnique({ where: { email } });
  if (trovato) return trovato;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      first_name: nome,
      last_name: "Ostile2",
      password_hash: "$2b$10$pp03o2",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

/* --------------------------------------------------------- il trasporto */

let SESSIONE = null;
let CLUB_ATTIVO = null;
let RUOLO_ATTIVO = null;
let rotte = null;

const preparaTrasporto = async () => {
  rotte = {
    elenco: await carica("src/app/api/v1/[resource]/route.ts"),
    riga: await carica("src/app/api/v1/[resource]/[id]/route.ts"),
    partecipanti: await carica("src/app/api/v1/events/[id]/participants/route.ts"),
    evento: await carica("src/app/api/v1/events/[id]/route.ts"),
    eventiElenco: await carica("src/app/api/v1/events/route.ts"),
  };

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), "http://collaudo.invalid");
    const metodo = String(init.method || "GET").toUpperCase();
    const headers = new Headers(init.headers || {});
    if (SESSIONE) headers.set("authorization", `Bearer ${SESSIONE}`);
    if (CLUB_ATTIVO) headers.set("x-active-club-id", CLUB_ATTIVO);
    if (RUOLO_ATTIVO) headers.set("x-active-access-role", RUOLO_ATTIVO);
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const richiesta = new Request(url.toString(), { ...init, headers });
    const segmenti = url.pathname.replace(/^\/api\/v1\//, "").split("/");

    if (segmenti[0] === "events" && segmenti[2] === "participants") {
      return rotte.partecipanti[metodo](richiesta, { params: { id: segmenti[1] } });
    }
    if (segmenti[0] === "events" && segmenti.length === 2) {
      return rotte.evento[metodo](richiesta, { params: { id: segmenti[1] } });
    }
    if (segmenti[0] === "events" && segmenti.length === 1) {
      return rotte.eventiElenco[metodo](richiesta);
    }

    if (segmenti.length === 1) {
      const fn = rotte.elenco[metodo];
      if (!fn) throw new Error(`Nessun handler ${metodo} per /${segmenti[0]}`);
      return fn(richiesta, { params: { resource: segmenti[0] } });
    }

    const fn = rotte.riga[metodo];
    if (!fn) throw new Error(`Nessun handler ${metodo} per ${url.pathname}`);
    return fn(richiesta, { params: { resource: segmenti[0], id: segmenti[1] } });
  };
};

const comeUtente = async (utenteRiga, ruolo, club = CLUB) => {
  const sessione = await auth.createSessionForUser(utenteRiga);
  SESSIONE = sessione.access_token;
  CLUB_ATTIVO = club;
  RUOLO_ATTIVO = ruolo;
};

const chiama = async (percorso, init) => {
  const risposta = await globalThis.fetch(percorso, init);
  const corpo = await risposta.json().catch(() => null);
  return { stato: risposta.status, corpo };
};

/* ------------------------------------------------------------ la semina */

const pulisciResidui = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp03o2-" } },
    select: { id: true },
  });
  const ids = residui.map((riga) => riga.id);
  if (!ids.length) return;
  await prisma.auditLog.deleteMany({ where: { organization_id: { in: ids } } }).catch(() => {});
  await prisma.club.deleteMany({ where: { id: { in: ids } } });
};

const semina = async () => {
  await pulisciResidui();

  PRESIDENTE = await utente("pp03o2-presidente@example.invalid", "Anna");
  MISTER_A = await utente("pp03o2-mister-a@example.invalid", "Aldo");
  MISTER_B = await utente("pp03o2-mister-b@example.invalid", "Bruno");
  MISTER_S = await utente("pp03o2-mister-s@example.invalid", "Sergio");
  COLLAB = await utente("pp03o2-collab@example.invalid", "Clara");
  COLLAB2 = await utente("pp03o2-collab2@example.invalid", "Carlo");
  UTENTE_CUSTOM = await utente("pp03o2-custom@example.invalid", "Cesare");
  UTENTE_ORFANO = await utente("pp03o2-orfano@example.invalid", "Orfeo");

  const impostazioniClub = {
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
      slug: `pp03o2-${Date.now()}`,
      name: "ASD Ostile2 PP-03",
      creator_id: PRESIDENTE.id,
      settings: impostazioniClub,
      categories: [
        { id: CAT_A, name: "Under 12" },
        { id: CAT_B, name: "Under 15" },
        { id: CAT_C, name: "Prima squadra" },
      ],
      club_sites: [
        { id: SEDE_1, name: "Sede Nord", active: true },
        { id: SEDE_2, name: "Sede Sud", active: true },
      ],
      category_groups: [],
      structures: [],
      trainers: [
        {
          id: "trainer-pp03o2-a",
          first_name: "Aldo",
          last_name: "Ostile2",
          email: MISTER_A.email,
          linkedUserId: MISTER_A.id,
          categories: [CAT_A],
          groups: [],
        },
        {
          id: "trainer-pp03o2-b",
          first_name: "Bruno",
          last_name: "Ostile2",
          email: MISTER_B.email,
          linkedUserId: MISTER_B.id,
          categories: [CAT_B],
          groups: [],
        },
        {
          id: "trainer-pp03o2-s",
          first_name: "Sergio",
          last_name: "Ostile2",
          email: MISTER_S.email,
          linkedUserId: MISTER_S.id,
          categories: [CAT_A, CAT_B],
          groups: [],
        },
        {
          id: "trainer-pp03o2-cu",
          first_name: "Cesare",
          last_name: "Ostile2",
          email: UTENTE_CUSTOM.email,
          linkedUserId: UTENTE_CUSTOM.id,
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
      id: ALTRO_CLUB,
      slug: `pp03o2-altro-${Date.now()}`,
      name: "ASD Estranea Ostile2",
      creator_id: PRESIDENTE.id,
      settings: impostazioniClub,
      categories: [{ id: CAT_A, name: "Under 12" }],
      updated_at: new Date(),
    },
  });

  for (const [utenteRiga, ruolo, chiave] of [
    [PRESIDENTE, "owner", "presidente"],
    [MISTER_A, "trainer", "a"],
    [MISTER_B, "trainer", "b"],
    [MISTER_S, "trainer", "s"],
    [COLLAB, "collaborator", "collab"],
    [COLLAB2, "collaborator", "collab2"],
    [UTENTE_CUSTOM, "trainer", "custom-provvisorio"],
  ]) {
    const riga = await prisma.organizationUser.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        user_id: utenteRiga.id,
        role: ruolo,
        is_primary: true,
        updated_at: new Date(),
      },
    });
    MEMBERSHIP[chiave] = riga.id;
  }

  /* Il perimetro di sede su Sergio: sede Nord soltanto. */
  await prisma.clubAccessScope.create({
    data: {
      id: randomUUID(),
      organization_user_id: MEMBERSHIP.s,
      scope_kind: "site",
      scope_value: SEDE_1,
    },
  });

  /* Il perimetro di sede su Carlo (collaboratore): sede Nord soltanto. */
  await prisma.clubAccessScope.create({
    data: {
      id: randomUUID(),
      organization_user_id: MEMBERSHIP.collab2,
      scope_kind: "site",
      scope_value: SEDE_1,
    },
  });

  const clinico = {
    allergies: "Arachidi - shock anafilattico",
    bloodType: "AB-",
    medicalNotes: "Segue terapia dal 2024",
  };

  await prisma.athlete.createMany({
    data: [
      {
        id: ATLETA_A,
        organization_id: CLUB,
        first_name: "Anna",
        last_name: "DiCategoriaA",
        status: "active",
        category_id: CAT_A,
        category_name: "Under 12",
        data: { ...clinico },
        updated_at: new Date(),
      },
      {
        id: ATLETA_B,
        organization_id: CLUB,
        first_name: "Bruna",
        last_name: "DiCategoriaB",
        status: "active",
        category_id: CAT_B,
        category_name: "Under 15",
        data: { ...clinico },
        updated_at: new Date(),
      },
      {
        id: ATLETA_C,
        organization_id: CLUB,
        first_name: "Carla",
        last_name: "DiCategoriaC",
        status: "active",
        category_id: CAT_C,
        category_name: "Prima squadra",
        data: { ...clinico },
        updated_at: new Date(),
      },
      {
        id: ATLETA_SENZA,
        organization_id: CLUB,
        first_name: "Sara",
        last_name: "SenzaSede",
        status: "active",
        category_id: null,
        category_name: null,
        data: { ...clinico },
        updated_at: new Date(),
      },
      {
        id: ATLETA_ALTRO_CLUB,
        organization_id: ALTRO_CLUB,
        first_name: "Dora",
        last_name: "DiUnAltroClub",
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
      {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: ATLETA_C,
        category_id: CAT_C,
        site_id: SEDE_1,
        updated_at: new Date(),
      },
    ],
  });

  /* Un certificato medico dell'atleta della categoria B, con contenuto. */
  await prisma.medicalCertificate.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      athlete_id: ATLETA_B,
      type: "competitive",
      status: "valid",
      issue_date: new Date(),
      expiry_date: new Date(Date.now() + 200 * 86_400_000),
      notes: "SEGRETO-CLINICO-B: soffio cardiaco, controllo semestrale",
      data: { doctor: "Dott. Riservato", diagnosis: "SEGRETO-CLINICO-B" },
      updated_at: new Date(),
    },
  });

  eventi = await carica("src/lib/server/events.ts");
  risorse = await carica("src/lib/server/resources.ts");
  auth = await carica("src/lib/server/auth.ts");
  await preparaTrasporto();
};

const pulisci = async () => {
  await prisma.auditLog
    .deleteMany({ where: { organization_id: { in: [CLUB, ALTRO_CLUB] } } })
    .catch(() => {});
  const tolti = await prisma.club
    .deleteMany({ where: { id: { in: [CLUB, ALTRO_CLUB] } } })
    .catch((errore) => {
      console.error(`Pulizia non riuscita: ${errore?.message}`);
      return { count: -1 };
    });
  if (tolti.count === -1) console.error("I club di collaudo sono rimasti in archivio.");
  /* Le utenze restano: sono riusabili e non portano dato di club. */
};

/* ==================================================================== */
/*  Gli eventi                                                          */
/* ==================================================================== */

const giorno = (delta) =>
  new Date(Date.now() + delta * 86_400_000).toISOString().slice(0, 10);

let EVENTO_AB = null;
let EVENTO_C = null;
let EVENTO_CONCLUSO = null;
let EVENTO_ANNULLATO = null;
let EVENTO_SENZA_SEDE = null;
const CONGIUNTI = {};

const creaEvento = async (chiave, dati) => {
  const owner = scope("owner", PRESIDENTE.id);
  return eventi.createClubEvent(owner, "training", {
    id: `pp03o2-${chiave}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    time: "18:00",
    endTime: "19:30",
    ...dati,
  });
};

const preparaEventi = async () => {
  const owner = scope("owner", PRESIDENTE.id);

  EVENTO_AB = await creaEvento("ab", {
    title: "Allenamento congiunto A+B",
    date: giorno(3),
    categoryId: CAT_A,
    categories: [CAT_A, CAT_B],
    siteId: SEDE_1,
  });

  EVENTO_C = await creaEvento("c", {
    title: "Allenamento Prima squadra",
    date: giorno(4),
    categoryId: CAT_C,
    categories: [CAT_C],
    siteId: SEDE_1,
  });

  EVENTO_CONCLUSO = await creaEvento("concluso", {
    title: "Allenamento concluso A",
    date: giorno(-2),
    categoryId: CAT_A,
    categories: [CAT_A],
    siteId: SEDE_1,
  });

  EVENTO_ANNULLATO = await creaEvento("annullato", {
    title: "Allenamento B annullato",
    date: giorno(5),
    categoryId: CAT_B,
    categories: [CAT_B],
    siteId: SEDE_2,
    allowOverlap: true,
  });

  EVENTO_SENZA_SEDE = await creaEvento("senzasede", {
    title: "Allenamento A senza sede",
    date: giorno(6),
    categoryId: CAT_A,
    categories: [CAT_A],
  });

  /* Cinque eventi congiunti A+B **senza partecipanti**, uno per attacco. */
  for (const chiave of ["togliA", "aggiungiC", "cancella", "annulla", "spostaSede"]) {
    CONGIUNTI[chiave] = await creaEvento(chiave, {
      title: `Congiunto ${chiave}`,
      date: giorno(10 + Object.keys(CONGIUNTI).length),
      categoryId: CAT_A,
      categories: [CAT_A, CAT_B],
      siteId: SEDE_1,
      allowOverlap: true,
    });
  }

  /* L'evento annullato lo annulla il presidente. */
  await eventi.updateClubEvent(owner, EVENTO_ANNULLATO.id, { status: "cancelled" }, {
    userId: PRESIDENTE.id,
    email: PRESIDENTE.email,
  });

  /* Presenze e convocazioni sull'evento congiunto, dal presidente. */
  await eventi.saveEventAttendance(
    owner,
    EVENTO_AB.id,
    [
      { athleteId: ATLETA_A, status: "present", notes: "SEGRETO-NOTA-A: colloquio con la madre" },
      { athleteId: ATLETA_B, status: "present" },
    ],
    { userId: PRESIDENTE.id, email: PRESIDENTE.email },
  );

  await eventi.saveEventConvocations(
    owner,
    EVENTO_AB.id,
    [
      { athleteId: ATLETA_A, status: "convocated" },
      { athleteId: ATLETA_B, status: "convocated" },
    ],
    { userId: PRESIDENTE.id, email: PRESIDENTE.email },
  );

  await eventi.saveEventAttendance(
    owner,
    EVENTO_CONCLUSO.id,
    [{ athleteId: ATLETA_A, status: "present" }],
    { userId: PRESIDENTE.id, email: PRESIDENTE.email },
  );
};

const statoConvocazione = async (eventoId, atletaId) => {
  const riga = await prisma.clubEventParticipant.findFirst({
    where: { event_id: eventoId, athlete_id: atletaId },
    select: { convocation_status: true, status: true, notes: true },
  });
  return riga;
};

/* ==================================================================== */
/*  A — La convocazione con un elenco NON vuoto                         */
/* ==================================================================== */

const attaccoConvocazione = async () => {
  console.log(`${NL}A — la convocazione con un elenco non vuoto`);
  await comeUtente(MISTER_B, "trainer");

  const convoca = (evento, entries) =>
    chiama(`/api/v1/events/${evento}/participants`, {
      method: "POST",
      body: JSON.stringify({ data: { action: "convoke", entries } }),
    });

  const a1 = await convoca(EVENTO_AB.id, [
    { athleteId: ATLETA_A, status: "convocated" },
  ]);
  prova(
    "A-01 · convocare per nome un atleta fuori perimetro e respinto",
    403,
    a1.stato,
    JSON.stringify(a1.corpo?.error?.message || "").slice(0, 140),
  );

  const a2 = await convoca(EVENTO_AB.id, [
    { athleteId: ATLETA_B, status: "convocated" },
  ]);
  const dopoA2 = await statoConvocazione(EVENTO_AB.id, ATLETA_A);
  prova("A-02a · convocare il proprio atleta riesce (deve)", 200, a2.stato);
  prova(
    "A-02b · un elenco che nomina solo i propri non cancella la convocazione altrui",
    "convocated",
    dopoA2?.convocation_status,
  );

  const a3 = await convoca(EVENTO_AB.id, [
    { athleteId: ATLETA_ALTRO_CLUB, status: "convocated" },
  ]);
  prova(
    "A-03 · convocare un atleta di un altro club e respinto",
    403,
    a3.stato,
    JSON.stringify(a3.corpo?.error?.message || "").slice(0, 140),
  );

  const inventato = randomUUID();
  const a4 = await convoca(EVENTO_AB.id, [
    { athleteId: inventato, status: "convocated" },
  ]);
  const rigaInventata = await prisma.clubEventParticipant.findFirst({
    where: { event_id: EVENTO_AB.id, athlete_id: inventato },
  });
  prova(
    "A-04a · convocare un identificativo inventato e respinto",
    403,
    a4.stato,
  );
  prova("A-04b · e non lascia nessuna riga fantasma", true, rigaInventata === null);

  const a5 = await convoca(EVENTO_AB.id, [
    { athleteId: "non-e-un-uuid", status: "convocated" },
  ]);
  prova(
    "A-05a · un `athlete_id` non-uuid non produce un 500",
    true,
    a5.stato === 400 || a5.stato === 403,
    `stato ${a5.stato}`,
  );
  const messaggio5 = String(a5.corpo?.error?.message || "");
  prova(
    "A-05b · il messaggio d'errore non espone l'interno di Prisma",
    false,
    /prisma|invocation|Argument|\bmodel\b/i.test(messaggio5),
    messaggio5.slice(0, 200),
  );

  const a6 = await convoca(EVENTO_AB.id, [
    { athleteId: ATLETA_B, status: "convocated" },
    { athleteId: ATLETA_B, status: "excluded" },
  ]);
  prova(
    "A-06 · un elenco con duplicati non rompe la scrittura",
    true,
    a6.stato === 200,
    `stato ${a6.stato}`,
  );

  const a7 = await convoca(EVENTO_AB.id, [
    { athleteId: ATLETA_B, status: "convocated" },
    { athleteId: ATLETA_A, status: "excluded" },
  ]);
  const dopoA7 = await statoConvocazione(EVENTO_AB.id, ATLETA_A);
  prova("A-07a · un elenco misto (proprio + altrui) e respinto", 403, a7.stato);
  prova(
    "A-07b · e non scrive niente sull'atleta altrui",
    "convocated",
    dopoA7?.convocation_status,
  );

  /* `null` e la stringa vuota: la normalizzazione li scarta e l'elenco
     diventa vuoto — cioe la strada della ripulitura. */
  const a8 = await convoca(EVENTO_AB.id, [
    { athleteId: null, status: "convocated" },
    { athleteId: "", status: "convocated" },
  ]);
  const dopoA8 = await statoConvocazione(EVENTO_AB.id, ATLETA_A);
  prova(
    "A-08 · un elenco di sole voci nulle non cancella la convocazione altrui",
    "convocated",
    dopoA8?.convocation_status,
    `stato ${a8.stato}`,
  );

  /* Ripristino: il proprio atleta torna convocato per le prove successive. */
  await convoca(EVENTO_AB.id, [{ athleteId: ATLETA_B, status: "convocated" }]);
};

/* ==================================================================== */
/*  B — Le presenze                                                     */
/* ==================================================================== */

const attaccoPresenze = async () => {
  console.log(`${NL}B — le presenze`);

  const appello = (evento, entries) =>
    chiama(`/api/v1/events/${evento}/participants`, {
      method: "POST",
      body: JSON.stringify({ data: { action: "attendance", entries } }),
    });

  await comeUtente(MISTER_B, "trainer");

  const b1 = await appello(EVENTO_ANNULLATO.id, [
    { athleteId: ATLETA_B, status: "present" },
  ]);
  const rigaB1 = await statoConvocazione(EVENTO_ANNULLATO.id, ATLETA_B);
  prova(
    "B-01 · l'appello su un evento ANNULLATO e respinto",
    true,
    b1.stato >= 400,
    `stato ${b1.stato}; riga scritta: ${JSON.stringify(rigaB1)}`,
  );

  await comeUtente(MISTER_A, "trainer");

  const b2 = await appello(EVENTO_CONCLUSO.id, [
    { athleteId: ATLETA_A, status: "absent" },
  ]);
  osserva("B-02 · l'appello su un evento concluso (stato)", b2.stato);

  const b3 = await appello(EVENTO_CONCLUSO.id, [
    { athleteId: ATLETA_A, status: "PRESENTE-SEMPRE-<script>" },
  ]);
  const rigaB3 = await statoConvocazione(EVENTO_CONCLUSO.id, ATLETA_A);
  prova(
    "B-03 · uno stato di presenza fuori vocabolario e respinto",
    true,
    b3.stato >= 400,
    `stato ${b3.stato}; valore in archivio: ${JSON.stringify(rigaB3?.status)}`,
  );
  /* Ripristino */
  await appello(EVENTO_CONCLUSO.id, [{ athleteId: ATLETA_A, status: "present" }]);

  const b4 = await appello(EVENTO_C.id, [
    { athleteId: ATLETA_A, status: "present" },
  ]);
  prova(
    "B-04 · l'appello su un evento fuori perimetro (con atleta dentro) e respinto",
    403,
    b4.stato,
  );

  /* --- le due porte: il registro generico --- */
  const partecipanteA = await prisma.clubEventParticipant.findFirst({
    where: { event_id: EVENTO_AB.id, athlete_id: ATLETA_A },
    select: { id: true },
  });

  for (const [chi, ruolo, utenteRiga] of [
    ["allenatore", "trainer", MISTER_A],
    ["presidente", "owner", PRESIDENTE],
  ]) {
    await comeUtente(utenteRiga, ruolo);

    const post = await chiama("/api/v1/training_attendance", {
      method: "POST",
      body: JSON.stringify({
        data: {
          organization_id: CLUB,
          event_id: EVENTO_AB.id,
          athlete_id: ATLETA_A,
          status: "absent",
        },
      }),
    });
    prova(
      `B-05 · POST /training_attendance dal registro generico (${chi}) e respinto`,
      true,
      post.stato >= 400,
      `stato ${post.stato} ${JSON.stringify(post.corpo?.error?.message || "").slice(0, 120)}`,
    );

    const patch = await chiama(`/api/v1/club_event_participants/${partecipanteA.id}`, {
      method: "PATCH",
      body: JSON.stringify({ data: { status: "absent", rsvp_status: "no", convocation_status: "excluded" } }),
    });
    prova(
      `B-06 · PATCH /club_event_participants/:id dal registro generico (${chi}) e respinto`,
      true,
      patch.stato >= 400,
      `stato ${patch.stato} ${JSON.stringify(patch.corpo?.error?.message || "").slice(0, 120)}`,
    );

    const patchAlias = await chiama(`/api/v1/training_attendance/${partecipanteA.id}`, {
      method: "PATCH",
      body: JSON.stringify({ data: { status: "absent" } }),
    });
    prova(
      `B-07 · PATCH sull'alias /training_attendance/:id (${chi}) e respinto`,
      true,
      patchAlias.stato >= 400,
      `stato ${patchAlias.stato}`,
    );

    const del = await chiama(`/api/v1/club_event_participants/${partecipanteA.id}`, {
      method: "DELETE",
    });
    prova(
      `B-08 · DELETE /club_event_participants/:id (${chi}) e respinto`,
      true,
      del.stato >= 400,
      `stato ${del.stato}`,
    );
  }

  /* --- la lettura dalla porta accanto --- */
  await comeUtente(MISTER_B, "trainer");

  const domenio = await chiama(`/api/v1/events/${EVENTO_AB.id}/participants`);
  const daDominio = (domenio.corpo?.data || []).map((r) => r.athlete_id);

  const generico = await chiama("/api/v1/club_event_participants");
  const daGenerico = (generico.corpo?.data || []).map((r) => r.athlete_id);

  prova(
    "B-09 · GET /events/:id/participants non porta l'atleta fuori perimetro",
    false,
    daDominio.includes(ATLETA_A),
  );
  prova(
    "B-10 · GET /club_event_participants (registro generico) non porta l'atleta fuori perimetro",
    false,
    daGenerico.includes(ATLETA_A),
    `stato ${generico.stato}; atleti restituiti: ${JSON.stringify(daGenerico)}`,
  );
  prova(
    "B-11 · e non porta la nota in chiaro su un minore fuori perimetro",
    false,
    JSON.stringify(generico.corpo?.data || []).includes("SEGRETO-NOTA-A"),
  );

  const alias = await chiama("/api/v1/training_attendance");
  const daAlias = (alias.corpo?.data || []).map((r) => r.athlete_id);
  prova(
    "B-12 · GET /training_attendance (alias) non porta l'atleta fuori perimetro",
    false,
    daAlias.includes(ATLETA_A),
    `stato ${alias.stato}; atleti restituiti: ${JSON.stringify(daAlias)}`,
  );

  const perEvento = await chiama(
    `/api/v1/club_event_participants?event_id=${EVENTO_C.id}`,
  );
  osserva(
    "B-13 · /club_event_participants?event_id=<evento cat C> (righe)",
    (perEvento.corpo?.data || []).length,
  );
};

/* ==================================================================== */
/*  C — I confini multi-categoria (ADR-0111 / ADR-0112)                 */
/* ==================================================================== */

const attaccoMultiCategoria = async () => {
  console.log(`${NL}C — i confini di un evento multi-categoria`);
  await comeUtente(MISTER_B, "trainer");

  const patch = (evento, corpo) =>
    chiama(`/api/v1/events/${evento}`, {
      method: "PATCH",
      body: JSON.stringify({ data: corpo }),
    });

  /* C-01 — togliere la categoria dell'altro allenatore. */
  const c1 = await patch(CONGIUNTI.togliA.id, { categories: [CAT_B] });
  const dopoC1 = await prisma.clubEvent.findUnique({
    where: { id: CONGIUNTI.togliA.id },
    select: { category_ids: true, category_id: true },
  });
  prova(
    "C-01 · l'allenatore di B non puo togliere la categoria A da un evento congiunto",
    true,
    c1.stato >= 400,
    `stato ${c1.stato}; categorie in archivio: ${JSON.stringify(dopoC1)}`,
  );

  /* C-02 — aggiungere una categoria a cui non e ammesso. */
  const c2 = await patch(CONGIUNTI.aggiungiC.id, {
    categories: [CAT_A, CAT_B, CAT_C],
  });
  const dopoC2 = await prisma.clubEvent.findUnique({
    where: { id: CONGIUNTI.aggiungiC.id },
    select: { category_ids: true },
  });
  prova(
    "C-02 · l'allenatore di B non puo aggiungere la categoria C a un evento",
    false,
    (dopoC2?.category_ids || []).includes(CAT_C),
    `stato ${c2.stato}; categorie in archivio: ${JSON.stringify(dopoC2?.category_ids)}`,
  );

  /* C-03 — creare un evento della sola categoria altrui. */
  const c3 = await chiama("/api/v1/events", {
    method: "POST",
    body: JSON.stringify({
      data: {
        kind: "training",
        title: "Creato per la squadra di un altro",
        date: giorno(20),
        time: "18:00",
        endTime: "19:30",
        categoryId: CAT_C,
        categories: [CAT_C],
        siteId: SEDE_1,
        allowOverlap: true,
      },
    }),
  });
  prova(
    "C-03 · l'allenatore di B non crea un evento della sola categoria C",
    403,
    c3.stato,
    JSON.stringify(c3.corpo?.error?.message || "").slice(0, 140),
  );

  /* C-04 — creare un evento che nomina la propria categoria *e* quella altrui. */
  const c4 = await chiama("/api/v1/events", {
    method: "POST",
    body: JSON.stringify({
      data: {
        kind: "training",
        title: "Creato B+C dall'allenatore di B",
        date: giorno(21),
        time: "18:00",
        endTime: "19:30",
        categoryId: CAT_B,
        categories: [CAT_B, CAT_C],
        siteId: SEDE_1,
        allowOverlap: true,
      },
    }),
  });
  const creatoC4 = await prisma.clubEvent.findFirst({
    where: { organization_id: CLUB, title: "Creato B+C dall'allenatore di B" },
    select: { id: true, category_ids: true },
  });
  prova(
    "C-04 · l'allenatore di B non crea un evento che nomina anche la categoria C",
    true,
    c4.stato >= 400,
    `stato ${c4.stato}; riga creata: ${JSON.stringify(creatoC4)}`,
  );

  /* C-05 — cancellare un evento congiunto senza storia. */
  const c5 = await chiama(`/api/v1/events/${CONGIUNTI.cancella.id}`, {
    method: "DELETE",
  });
  const restaC5 = await prisma.clubEvent.findUnique({
    where: { id: CONGIUNTI.cancella.id },
    select: { id: true },
  });
  prova(
    "C-05 · l'allenatore di B non cancella un evento congiunto (che e anche di A)",
    true,
    restaC5 !== null,
    `stato ${c5.stato}`,
  );

  /* C-06 — annullare un evento congiunto. */
  const c6 = await patch(CONGIUNTI.annulla.id, { status: "cancelled" });
  const dopoC6 = await prisma.clubEvent.findUnique({
    where: { id: CONGIUNTI.annulla.id },
    select: { status: true },
  });
  prova(
    "C-06 · l'allenatore di B non annulla un evento congiunto (che e anche di A)",
    "scheduled",
    dopoC6?.status,
    `stato ${c6.stato}`,
  );

  /* C-07 — spostare l'evento congiunto in un'altra sede. */
  const c7 = await patch(CONGIUNTI.spostaSede.id, { siteId: SEDE_2 });
  const dopoC7 = await prisma.clubEvent.findUnique({
    where: { id: CONGIUNTI.spostaSede.id },
    select: { site_id: true },
  });
  osserva(
    "C-07 · spostare la sede di un evento congiunto senza storia",
    { stato: c7.stato, sede: dopoC7?.site_id },
  );

  /* C-08 — l'evento congiunto CON storia: i campi congelati. */
  const c8 = await patch(EVENTO_AB.id, { categories: [CAT_B] });
  const dopoC8 = await prisma.clubEvent.findUnique({
    where: { id: EVENTO_AB.id },
    select: { category_ids: true },
  });
  prova(
    "C-08 · su un evento con storia le categorie restano congelate",
    true,
    (dopoC8?.category_ids || []).includes(CAT_A),
    `stato ${c8.stato}`,
  );
};

/* ==================================================================== */
/*  D — Il perimetro di sede e categoria                                */
/* ==================================================================== */

const attaccoScope = async () => {
  console.log(`${NL}D — il perimetro di sede e categoria (club_access_scopes)`);

  const elencoAtleti = async (utenteRiga, ruolo) => {
    await comeUtente(utenteRiga, ruolo);
    const risposta = await chiama("/api/v1/athletes");
    return {
      stato: risposta.stato,
      ids: (risposta.corpo?.data || []).map((r) => r.id),
    };
  };

  /* D-01 — zero righe = tutto il club, mai «nessun accesso». */
  const clara = await elencoAtleti(COLLAB, "collaborator");
  prova(
    "D-01 · zero righe di scope = tutto il club (non «nessun accesso»)",
    true,
    clara.ids.includes(ATLETA_A) &&
      clara.ids.includes(ATLETA_B) &&
      clara.ids.includes(ATLETA_C),
    `ids: ${JSON.stringify(clara.ids)}`,
  );

  /* D-02 — una riga di sede restringe davvero. */
  const carlo = await elencoAtleti(COLLAB2, "collaborator");
  prova(
    "D-02a · recintato sulla sede Nord non vede l'atleta della sede Sud",
    false,
    carlo.ids.includes(ATLETA_B),
    `ids: ${JSON.stringify(carlo.ids)}`,
  );
  prova(
    "D-02b · recintato sulla sede Nord vede gli atleti della sede Nord",
    true,
    carlo.ids.includes(ATLETA_A) && carlo.ids.includes(ATLETA_C),
  );
  prova(
    "D-02c · l'atleta senza nessuna appartenenza non passa un perimetro di sede",
    false,
    carlo.ids.includes(ATLETA_SENZA),
    "una riga che non porta il valore dell'asse ristretto non passa (ADR-0103)",
  );

  /* D-03 — i due assi in AND: sede Nord + categoria C. */
  await prisma.clubAccessScope.create({
    data: {
      id: randomUUID(),
      organization_user_id: MEMBERSHIP.collab2,
      scope_kind: "category",
      scope_value: CAT_C,
    },
  });
  const carloAnd = await elencoAtleti(COLLAB2, "collaborator");
  prova(
    "D-03a · sede Nord AND categoria C: non vede l'atleta della categoria A",
    false,
    carloAnd.ids.includes(ATLETA_A),
    `ids: ${JSON.stringify(carloAnd.ids)}`,
  );
  prova(
    "D-03b · sede Nord AND categoria C: vede l'atleta della categoria C",
    true,
    carloAnd.ids.includes(ATLETA_C),
  );

  /* D-04 — l'OR dentro un asse. */
  await prisma.clubAccessScope.create({
    data: {
      id: randomUUID(),
      organization_user_id: MEMBERSHIP.collab2,
      scope_kind: "category",
      scope_value: CAT_A,
    },
  });
  const carloOr = await elencoAtleti(COLLAB2, "collaborator");
  prova(
    "D-04 · due categorie sullo stesso asse sono in OR",
    true,
    carloOr.ids.includes(ATLETA_A) && carloOr.ids.includes(ATLETA_C),
    `ids: ${JSON.stringify(carloOr.ids)}`,
  );
  prova(
    "D-04b · e la sede resta in AND: l'atleta della sede Sud non passa",
    false,
    carloOr.ids.includes(ATLETA_B),
  );

  /* Si torna alla sola sede per non sporcare le prove seguenti. */
  await prisma.clubAccessScope.deleteMany({
    where: { organization_user_id: MEMBERSHIP.collab2, scope_kind: "category" },
  });

  /* D-05 — i due recinti dell'allenatore si sommano. Sergio: profilo A+B,
     scope sede Nord. L'atleta B sta in sede Sud. */
  const sergio = await elencoAtleti(MISTER_S, "trainer");
  prova(
    "D-05a · i due recinti si sommano: la scheda dice A+B, la sede dice Nord",
    false,
    sergio.ids.includes(ATLETA_B),
    `ids: ${JSON.stringify(sergio.ids)}`,
  );
  prova(
    "D-05b · e l'atleta della categoria A in sede Nord passa",
    true,
    sergio.ids.includes(ATLETA_A),
  );

  /* D-06 — un evento SENZA sede, letto da chi ha un perimetro di sede. */
  await comeUtente(MISTER_S, "trainer");
  const senzaSede = await chiama(`/api/v1/events/${EVENTO_SENZA_SEDE.id}`);
  prova(
    "D-06 · un evento senza sede e negato a chi e recintato su una sede",
    403,
    senzaSede.stato,
    JSON.stringify(senzaSede.corpo?.error?.message || "").slice(0, 140),
  );

  /* D-07 — e non compare nell'elenco. */
  const calendarioSergio = await chiama("/api/v1/events?kind=training");
  const idsCalendario = (calendarioSergio.corpo?.data || []).map(
    (e) => e?.row?.id || e?.id,
  );
  prova(
    "D-07 · e non compare nemmeno nel calendario",
    false,
    idsCalendario.includes(EVENTO_SENZA_SEDE.id),
    `eventi: ${idsCalendario.length}`,
  );

  /* D-08 — l'evento congiunto A+B in sede Nord: Sergio ci arriva. */
  const congiunto = await chiama(`/api/v1/events/${EVENTO_AB.id}`);
  prova("D-08 · l'evento congiunto in sede Nord e leggibile (deve)", 200, congiunto.stato);
  const partecipantiSergio = (congiunto.corpo?.data?.participants || []).map(
    (r) => r.athlete_id,
  );
  prova(
    "D-08b · ma non porta l'atleta della sede Sud dentro quell'evento",
    false,
    partecipantiSergio.includes(ATLETA_B),
    `partecipanti: ${JSON.stringify(partecipantiSergio)}`,
  );

  /* D-09 — la convocazione oltre il proprio recinto di sede. */
  const convocaSergio = await chiama(
    `/api/v1/events/${EVENTO_AB.id}/participants`,
    {
      method: "POST",
      body: JSON.stringify({
        data: {
          action: "convoke",
          entries: [{ athleteId: ATLETA_B, status: "convocated" }],
        },
      }),
    },
  );
  prova(
    "D-09 · convocare un atleta fuori dal proprio perimetro di sede e respinto",
    403,
    convocaSergio.stato,
  );

  /* D-10 — il registro generico sulle partecipazioni, per chi ha un perimetro
     di sede: e la seconda porta sullo stesso dato. */
  const genericoSergio = await chiama("/api/v1/club_event_participants");
  const idsGenerico = (genericoSergio.corpo?.data || []).map((r) => r.athlete_id);
  prova(
    "D-10 · /club_event_participants non porta l'atleta della sede vietata",
    false,
    idsGenerico.includes(ATLETA_B),
    `stato ${genericoSergio.stato}; ids: ${JSON.stringify(idsGenerico)}`,
  );
};

/* ==================================================================== */
/*  E — La scalata con un ruolo personalizzato (ADR-0102)               */
/* ==================================================================== */

let RUOLO_CUSTOM = null;

const attaccoRuoloPersonalizzato = async () => {
  console.log(`${NL}E — il ruolo personalizzato`);
  const ruoli = await carica("src/lib/server/club-roles.ts");
  const catalogo = await carica("src/lib/permissions/catalog.ts");
  const ownerScope = {
    ...scope("owner", PRESIDENTE.id),
    userEmail: PRESIDENTE.email,
  };

  /* E-01 — una chiave che il ruolo base non ha. */
  let e1 = "riuscito";
  try {
    await ruoli.createClubRole(ownerScope, {
      name: "Mister contabile",
      baseRole: "trainer",
      permissions: ["accounting.read"],
    });
  } catch (errore) {
    e1 = String(errore?.message || "").slice(0, 160);
  }
  prova(
    "E-01 · creare un ruolo su `trainer` con una chiave di contabilita fallisce",
    true,
    e1 !== "riuscito",
    e1,
  );

  /* E-02 — un ruolo legittimo, e la sua assegnazione. */
  RUOLO_CUSTOM = await ruoli.createClubRole(ownerScope, {
    name: "Mister ristretto",
    baseRole: "trainer",
    permissions: ["events.read", "events.attendance"],
  });
  osserva("E-02 · ruolo creato", { slug: RUOLO_CUSTOM.slug, id: RUOLO_CUSTOM.id });

  /* La tessera provvisoria si sostituisce con quella personalizzata. */
  await prisma.organizationUser.delete({
    where: { id: MEMBERSHIP["custom-provvisorio"] },
  });
  await ruoli.assignClubRole(ownerScope, {
    userId: UTENTE_CUSTOM.id,
    role: RUOLO_CUSTOM.slug,
    isPrimary: true,
  });

  /* E-03 — una chiave fuori tetto scritta a mano in archivio. */
  await prisma.clubRolePermission.createMany({
    data: [
      { id: randomUUID(), role_id: RUOLO_CUSTOM.id, permission_key: "accounting.read" },
      { id: randomUUID(), role_id: RUOLO_CUSTOM.id, permission_key: "data_subject.erase" },
      { id: randomUUID(), role_id: RUOLO_CUSTOM.id, permission_key: "clinical.read" },
    ],
    skipDuplicates: true,
  });

  const scopeCustom = await auth.resolveOrganizationScopeForUser(
    UTENTE_CUSTOM.id,
    CLUB,
    null,
  );
  osserva("E-03 · ruolo attivo risolto", String(scopeCustom.activeRole).slice(0, 120));

  prova(
    "E-03a · `roleHasPermission` rifiuta la chiave fuori tetto (contabilita)",
    false,
    catalogo.roleHasPermission(scopeCustom.activeRole, "accounting.read"),
  );
  prova(
    "E-03b · `roleHasPermission` rifiuta la cancellazione dei dati di una persona",
    false,
    catalogo.roleHasPermission(scopeCustom.activeRole, "data_subject.erase"),
  );
  prova(
    "E-03c · `roleHasPermission` rifiuta il contenuto clinico",
    false,
    catalogo.roleHasPermission(scopeCustom.activeRole, "clinical.read"),
  );

  await comeUtente(UTENTE_CUSTOM, scopeCustom.activeRole);
  const pagamenti = await chiama("/api/v1/payments");
  prova(
    "E-03d · e la rotta della contabilita risponde negato",
    true,
    pagamenti.stato >= 400,
    `stato ${pagamenti.stato}`,
  );

  /* E-04 — lo slug grezzo nell'header, da chi quella tessera non ce l'ha. */
  await comeUtente(MISTER_A, RUOLO_CUSTOM.slug);
  const rubato = await chiama("/api/v1/athletes");
  prova(
    "E-04 · lo slug di un ruolo altrui nell'header non concede niente",
    true,
    rubato.stato >= 400 || (rubato.corpo?.data || []).length === 0,
    `stato ${rubato.stato}; righe ${(rubato.corpo?.data || []).length}`,
  );

  /* E-05 — lo slug grezzo, senza chiavi, da chi la tessera ce l'ha:
     non deve diventare il ruolo base. */
  const scopeSlugGrezzo = await auth.resolveOrganizationScopeForUser(
    UTENTE_CUSTOM.id,
    CLUB,
    RUOLO_CUSTOM.slug,
  );
  prova(
    "E-05 · lo slug grezzo non degrada al ruolo base `trainer`",
    false,
    scopeSlugGrezzo.activeRole === "trainer",
    `ruolo risolto: ${String(scopeSlugGrezzo.activeRole).slice(0, 90)}`,
  );

  /* E-06 — l'header `owner` da un allenatore. */
  const scopeOwnerFinto = await auth.resolveOrganizationScopeForUser(
    MISTER_A.id,
    CLUB,
    "owner",
  );
  prova(
    "E-06 · un allenatore che manda `owner` nell'header non diventa owner",
    false,
    scopeOwnerFinto.activeRole === "owner",
    `ruolo risolto: ${JSON.stringify(scopeOwnerFinto.activeRole)}`,
  );

  /* E-07 — una riga `organization_users` con lo slug e SENZA custom_role_id. */
  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: UTENTE_ORFANO.id,
      role: RUOLO_CUSTOM.slug,
      is_primary: true,
      updated_at: new Date(),
    },
  });
  const scopeOrfano = await auth.resolveOrganizationScopeForUser(
    UTENTE_ORFANO.id,
    CLUB,
    null,
  );
  prova(
    "E-07a · uno slug senza `custom_role_id` non da nessun club attivo",
    null,
    scopeOrfano.activeOrganizationId,
    `ruolo: ${JSON.stringify(scopeOrfano.activeRole)}`,
  );
  await comeUtente(UTENTE_ORFANO, RUOLO_CUSTOM.slug);
  const orfano = await chiama("/api/v1/athletes");
  prova(
    "E-07b · e non legge l'anagrafica degli atleti",
    true,
    orfano.stato >= 400 || (orfano.corpo?.data || []).length === 0,
    `stato ${orfano.stato}; righe ${(orfano.corpo?.data || []).length}`,
  );

  /* E-08 — il perimetro dell'allenatore vale anche per un ruolo su `trainer`. */
  await comeUtente(UTENTE_CUSTOM, scopeCustom.activeRole);
  const convocaCustom = await chiama(
    `/api/v1/events/${EVENTO_AB.id}/participants`,
    {
      method: "POST",
      body: JSON.stringify({
        data: {
          action: "attendance",
          entries: [{ athleteId: ATLETA_B, status: "present" }],
        },
      }),
    },
  );
  prova(
    "E-08 · un ruolo personalizzato su `trainer` resta dentro il perimetro della scheda",
    403,
    convocaCustom.stato,
    JSON.stringify(convocaCustom.corpo?.error?.message || "").slice(0, 120),
  );

  /* E-09 — un ruolo personalizzato senza la chiave `events.convoke`. */
  const convocaSenzaChiave = await chiama(
    `/api/v1/events/${EVENTO_AB.id}/participants`,
    {
      method: "POST",
      body: JSON.stringify({
        data: {
          action: "convoke",
          entries: [{ athleteId: ATLETA_A, status: "convocated" }],
        },
      }),
    },
  );
  prova(
    "E-09 · senza la chiave `events.convoke` la convocazione e respinta",
    403,
    convocaSenzaChiave.stato,
    JSON.stringify(convocaSenzaChiave.corpo?.error?.message || "").slice(0, 120),
  );

  /* E-10 — `updateClubRole` non deve poter aggiungere una chiave fuori tetto. */
  let e10 = "riuscito";
  try {
    await ruoli.updateClubRole(ownerScope, RUOLO_CUSTOM.id, {
      permissions: ["events.read", "sport_work.pay"],
    });
  } catch (errore) {
    e10 = String(errore?.message || "").slice(0, 140);
  }
  prova(
    "E-10 · aggiungere una chiave fuori tetto con `updateClubRole` fallisce",
    true,
    e10 !== "riuscito",
    e10,
  );
};

/* ==================================================================== */
/*  F — Le proiezioni `clubs.trainings` e `clubs.matches` (ADR-0098)    */
/* ==================================================================== */

const attaccoProiezioni = async () => {
  console.log(`${NL}F — le proiezioni clubs.trainings / clubs.matches`);

  await comeUtente(MISTER_A, "trainer");

  const lettura = await chiama("/api/v1/clubs");
  prova(
    "F-01 · l'allenatore non legge /api/v1/clubs",
    true,
    lettura.stato >= 400 || (lettura.corpo?.data || []).length === 0,
    `stato ${lettura.stato}; righe ${(lettura.corpo?.data || []).length}`,
  );
  prova(
    "F-01b · e la risposta non contiene il calendario della categoria C",
    false,
    JSON.stringify(lettura.corpo || {}).includes("Allenamento Prima squadra"),
  );

  const perId = await chiama(`/api/v1/clubs/${CLUB}`);
  prova(
    "F-02 · ne lo legge per identificativo",
    true,
    perId.stato >= 400 || !JSON.stringify(perId.corpo || {}).includes("Allenamento Prima squadra"),
    `stato ${perId.stato}`,
  );

  const scritturaAllenatore = await chiama(`/api/v1/clubs/${CLUB}`, {
    method: "PATCH",
    body: JSON.stringify({ data: { trainings: [] } }),
  });
  prova(
    "F-03 · l'allenatore non scrive la proiezione da PATCH /clubs/:id",
    true,
    scritturaAllenatore.stato >= 400,
    `stato ${scritturaAllenatore.stato}`,
  );

  const risorseGeneriche = await chiama("/api/v1/trainings");
  prova(
    "F-04 · non esiste una porta /api/v1/trainings che serva la proiezione",
    true,
    risorseGeneriche.stato >= 400 ||
      !JSON.stringify(risorseGeneriche.corpo || {}).includes("Allenamento Prima squadra"),
    `stato ${risorseGeneriche.stato}`,
  );

  await comeUtente(PRESIDENTE, "owner");
  const scritturaOwner = await chiama(`/api/v1/clubs/${CLUB}`, {
    method: "PATCH",
    body: JSON.stringify({ data: { trainings: [] } }),
  });
  const proiezione = await prisma.club.findUnique({
    where: { id: CLUB },
    select: { trainings: true },
  });
  prova(
    "F-05 · nemmeno il presidente riscrive la proiezione dal club",
    true,
    scritturaOwner.stato >= 400 &&
      Array.isArray(proiezione?.trainings) &&
      proiezione.trainings.length > 0,
    `stato ${scritturaOwner.stato}; eventi nella proiezione: ${(proiezione?.trainings || []).length}`,
  );

  /* F-06 — la porta accanto in lettura: il calendario filtrato per l'allenatore. */
  await comeUtente(MISTER_A, "trainer");
  const calendario = await chiama("/api/v1/events?kind=training");
  const titoli = (calendario.corpo?.data || []).map((e) => e?.title);
  prova(
    "F-06 · il calendario dell'allenatore non porta l'evento della categoria C",
    false,
    titoli.includes("Allenamento Prima squadra"),
    `titoli: ${JSON.stringify(titoli)}`,
  );

  const daRegistro = await chiama("/api/v1/club_events");
  const titoliRegistro = (daRegistro.corpo?.data || []).map((e) => e?.title);
  prova(
    "F-07 · e nemmeno il registro generico /club_events lo porta",
    false,
    titoliRegistro.includes("Allenamento Prima squadra"),
    `stato ${daRegistro.stato}; titoli: ${JSON.stringify(titoliRegistro)}`,
  );
};

/* ==================================================================== */
/*  G — Squadre, gruppi e la porta accanto sui dati dell'atleta         */
/* ==================================================================== */

const attaccoGruppi = async () => {
  console.log(`${NL}G — squadre, gruppi e i dati dell'atleta`);
  await comeUtente(MISTER_A, "trainer");

  const gruppi = await chiama("/api/v1/category_groups");
  prova(
    "G-01 · /category_groups e negato all'allenatore",
    true,
    gruppi.stato >= 400,
    `stato ${gruppi.stato}`,
  );

  const categorie = await chiama("/api/v1/categories");
  const nomi = JSON.stringify(categorie.corpo?.data || []);
  osserva("G-02 · /categories (stato)", categorie.stato);
  prova(
    "G-02 · /categories non porta le squadre fuori dal perimetro",
    false,
    nomi.includes(CAT_C),
    `risposta: ${nomi.slice(0, 200)}`,
  );

  const appartenenze = await chiama("/api/v1/athlete_category_memberships");
  const idsApp = (appartenenze.corpo?.data || []).map((r) => r.athlete_id);
  prova(
    "G-03 · /athlete_category_memberships non porta gli atleti fuori perimetro",
    true,
    !idsApp.includes(ATLETA_B) && !idsApp.includes(ATLETA_C),
    `stato ${appartenenze.stato}; ids: ${JSON.stringify(idsApp)}`,
  );

  const certificati = await chiama("/api/v1/medical_certificates");
  const testo = JSON.stringify(certificati.corpo?.data || []);
  prova(
    "G-04a · /medical_certificates non porta il certificato di un atleta fuori perimetro",
    false,
    testo.includes(ATLETA_B),
    `stato ${certificati.stato}; righe ${(certificati.corpo?.data || []).length}`,
  );
  prova(
    "G-04b · e non porta il contenuto clinico in chiaro",
    false,
    testo.includes("SEGRETO-CLINICO-B"),
  );

  const semplificati = await chiama("/api/v1/simplified_certificates");
  const testoSemplificato = JSON.stringify(semplificati.corpo?.data || []);
  prova(
    "G-05 · /simplified_certificates non porta il contenuto clinico fuori perimetro",
    false,
    testoSemplificato.includes("SEGRETO-CLINICO-B"),
    `stato ${semplificati.stato}`,
  );

  /* G-06 — la scheda di un gruppo/categoria fuori perimetro chiesta per id. */
  const perId = await chiama(`/api/v1/categories/${CAT_C}`);
  osserva("G-06 · /categories/<categoria non mia>", {
    stato: perId.stato,
    corpo: JSON.stringify(perId.corpo?.data || null).slice(0, 120),
  });
};

/* ==================================================================== */

const main = async () => {
  console.log("Seconda revisione ostile PP-03 — eventi, presenze, scope, ruoli");
  try {
    await semina();
    await preparaEventi();
    await attaccoConvocazione();
    await attaccoPresenze();
    await attaccoMultiCategoria();
    await attaccoScope();
    await attaccoRuoloPersonalizzato();
    await attaccoProiezioni();
    await attaccoGruppi();
  } catch (errore) {
    console.error(`${NL}La sonda si e interrotta: ${errore?.stack || errore}`);
    esiti.push({ titolo: "esecuzione completa", ok: false });
  } finally {
    await pulisci();
    await prisma.$disconnect();
  }

  const passati = esiti.filter((e) => e.ok).length;
  console.log(`${NL}${passati} / ${esiti.length}`);
  const falliti = esiti.filter((e) => !e.ok);
  if (falliti.length) {
    console.log(`${NL}Attacchi RIUSCITI (difetti):`);
    for (const e of falliti) console.log(`  - ${e.titolo}${e.nota ? `  [${e.nota}]` : ""}`);
  }
  process.exit(falliti.length ? 1 : 0);
};

main();
