/**
 * **PP-03 round 4 — destinatario (§9.1), `data` clinico (§9.2), conteggio
 * (§10.1), revoca, ruolo personalizzato, etichette del catalogo (§10.2).**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/pp-03-round4-destinatario-clinico-conteggio-probe.mjs
 *
 * `PASS` = attacco respinto. `FAIL` = attacco riuscito.
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
const info = (t, v) => console.log(`  INFO  ${t.padEnd(70)} ${JSON.stringify(v)}`);

/* ---------------------------------------------------------- gli attori -- */

const CLUB = randomUUID();
const ALTRO = randomUUID();
const CAT_A = "cat-r4b-a";
const CAT_B = "cat-r4b-b";

let PRESIDENTE = null;
let MISTER_A = null;
let MISTER_B = null;
let GENITORE = null;
let ATLETA_UTENTE = null;
let ESTRANEO = null;

const ATLETI_A = [];
const ATLETA_B = randomUUID();
const NOTIFICA_ALTRUI = randomUUID();
const NOTIFICA_SOCIETA = randomUUID();
const CERT_A = randomUUID();
const CERT_B = randomUUID();

const SEGRETI = {
  "notifica.altrui": "ARRETRATO-DELLA-FAMIGLIA-ROSSI-1200-EURO",
  "cert.data.source.annidato": "DIAGNOSI-ANNIDATA-CARDIOPATIA",
  "cert.data.array": "REFERTO-IN-ARRAY-SOFFIO-SISTOLICO",
  "athlete.data.annidato": "ALLERGIA-ANNIDATA-ARACHIDI",
  "athlete.data.array": "PATOLOGIA-IN-ARRAY-EPILESSIA",
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
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
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
      last_name: "R4b",
      password_hash: "$2b$10$pp03r4b",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const clinicoAnnidato = {
  /* Nessuna di queste chiavi sta nell'elenco dei vietati di `athletes.data`. */
  schedaSanitaria: { allergies: SEGRETI["athlete.data.annidato"] },
  anamnesi: [{ patologia: SEGRETI["athlete.data.array"] }],
};

const semina = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp03r4b-" } },
    select: { id: true },
  });
  if (residui.length) {
    const ids = residui.map((r) => r.id);
    await prisma.auditLog.deleteMany({ where: { organization_id: { in: ids } } }).catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }

  PRESIDENTE = await utente("pp03r4b-presidente@example.invalid", "Anna");
  MISTER_A = await utente("pp03r4b-mister-a@example.invalid", "Aldo");
  MISTER_B = await utente("pp03r4b-mister-b@example.invalid", "Bruno");
  GENITORE = await utente("pp03r4b-genitore@example.invalid", "Piera");
  ATLETA_UTENTE = await utente("pp03r4b-atleta@example.invalid", "Ugo");
  ESTRANEO = await utente("pp03r4b-estraneo@example.invalid", "Zeno");

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
      slug: `pp03r4b-${Date.now()}`,
      name: "ASD Round4b",
      creator_id: PRESIDENTE.id,
      settings,
      categories: [
        { id: CAT_A, name: "Under 12" },
        { id: CAT_B, name: "Under 15" },
      ],
      club_sites: [],
      category_groups: [],
      structures: [],
      trainers: [
        {
          id: "trainer-r4b-a",
          first_name: "Aldo",
          last_name: "R4b",
          email: MISTER_A.email,
          linkedUserId: MISTER_A.id,
          categories: [CAT_A],
          groups: [],
        },
        {
          id: "trainer-r4b-b",
          first_name: "Bruno",
          last_name: "R4b",
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
      slug: `pp03r4b-altro-${Date.now()}`,
      name: "ASD Estranea R4b",
      creator_id: ESTRANEO.id,
      settings,
      categories: [{ id: CAT_A, name: "Under 12" }],
      updated_at: new Date(),
    },
  });

  for (const [riga, ruolo, club] of [
    [MISTER_A, "trainer", CLUB],
    [MISTER_B, "trainer", CLUB],
    [PRESIDENTE, "owner", CLUB],
    [GENITORE, "parent", CLUB],
    [ATLETA_UTENTE, "athlete", CLUB],
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

  /* Sette atleti in A e uno in B: il conteggio del perimetro si misura. */
  const righe = [];
  for (let i = 0; i < 7; i += 1) {
    const id = randomUUID();
    ATLETI_A.push(id);
    righe.push({
      id,
      organization_id: CLUB,
      first_name: `Atleta${i}`,
      last_name: "CategoriaA",
      status: "active",
      category_id: CAT_A,
      category_name: "Under 12",
      data: { ...clinicoAnnidato, seasonId: "2026-27" },
      updated_at: new Date(),
    });
  }
  righe.push({
    id: ATLETA_B,
    organization_id: CLUB,
    first_name: "Bruna",
    last_name: "CategoriaB",
    status: "active",
    category_id: CAT_B,
    category_name: "Under 15",
    data: { ...clinicoAnnidato, seasonId: "2026-27" },
    updated_at: new Date(),
  });
  await prisma.athlete.createMany({ data: righe });

  await prisma.medicalCertificate.createMany({
    data: [
      {
        id: CERT_A,
        organization_id: CLUB,
        athlete_id: ATLETI_A[0],
        type: "competitive",
        issue_date: new Date("2026-01-10"),
        expiry_date: new Date("2027-01-09"),
        status: "valid",
        /*
          `source` e l'unica chiave ammessa dentro `data`. Qui il suo **valore**
          e un oggetto, e l'elenco di ammessi guarda la chiave e non il valore.
        */
        data: {
          source: { diagnosi: SEGRETI["cert.data.source.annidato"] },
        },
        updated_at: new Date(),
      },
      {
        id: CERT_B,
        organization_id: CLUB,
        athlete_id: ATLETI_A[1],
        type: "competitive",
        issue_date: new Date("2026-01-10"),
        expiry_date: new Date("2027-01-09"),
        status: "valid",
        data: { source: [SEGRETI["cert.data.array"]] },
        updated_at: new Date(),
      },
    ],
  });

  /* Una notifica indirizzata al collega, e una «di societa». */
  await prisma.notification.createMany({
    data: [
      {
        id: NOTIFICA_ALTRUI,
        organization_id: CLUB,
        user_id: MISTER_B.id,
        title: "Riepilogo economico",
        message: SEGRETI["notifica.altrui"],
        type: "payment",
        updated_at: new Date(),
      },
      {
        id: NOTIFICA_SOCIETA,
        organization_id: CLUB,
        user_id: null,
        title: "Avviso di societa",
        message: "chiusura per festivita",
        type: "info",
        updated_at: new Date(),
      },
    ],
  });
};

const pulisci = async () => {
  await prisma.auditLog.deleteMany({ where: { organization_id: { in: [CLUB, ALTRO] } } }).catch(() => {});
  await prisma.club.deleteMany({ where: { id: { in: [CLUB, ALTRO] } } }).catch((e) => {
    console.error(`Pulizia non riuscita: ${e?.message}`);
  });
};

/* ==================================================================== */
/*  A — il destinatario (§9.1)                                          */
/* ==================================================================== */

const attaccoDestinatario = async () => {
  console.log("\nA — il destinatario di una notifica");

  const ruoli = [
    [MISTER_A, "trainer"],
    [GENITORE, "parent"],
    [ATLETA_UTENTE, "athlete"],
    [PRESIDENTE, "owner"],
  ];

  for (const [riga, ruolo] of ruoli) {
    await comeUtente(riga, ruolo);

    const perId = await chiama(`/api/v1/notifications/${NOTIFICA_ALTRUI}`);
    prova(
      `A-01/${ruolo} · GET notifications/:id del collega`,
      true,
      perId.stato === 403 || cerca(perId.corpo).length === 0,
      `stato ${perId.stato} · fughe ${JSON.stringify(cerca(perId.corpo))}`,
    );

    const perAlias = await chiama(`/api/v1/simplified_notifications/${NOTIFICA_ALTRUI}`);
    prova(
      `A-02/${ruolo} · GET simplified_notifications/:id (alias)`,
      true,
      perAlias.stato === 403 || cerca(perAlias.corpo).length === 0,
      `stato ${perAlias.stato} · fughe ${JSON.stringify(cerca(perAlias.corpo))}`,
    );

    const elenco = await chiama(`/api/v1/notifications?club_id=${CLUB}`);
    prova(
      `A-03/${ruolo} · elenco notifiche`,
      [],
      cerca(elenco.corpo),
      `stato ${elenco.stato}`,
    );

    const perQuery = await chiama(
      `/api/v1/notifications?club_id=${CLUB}&user_id=${MISTER_B.id}`,
    );
    prova(
      `A-04/${ruolo} · elenco con user_id del collega`,
      true,
      perQuery.stato === 403 || cerca(perQuery.corpo).length === 0,
      `stato ${perQuery.stato}`,
    );

    const patch = await chiama(`/api/v1/notifications/${NOTIFICA_ALTRUI}`, {
      method: "PATCH",
      body: JSON.stringify({ read: true }),
    });
    prova(
      `A-05/${ruolo} · PATCH notifica del collega`,
      403,
      patch.stato,
      JSON.stringify(patch.corpo?.error?.message ?? null),
    );
  }

  /* A-06 — la maiuscola nel nome della risorsa aggira l'insieme? */
  await comeUtente(MISTER_A, "trainer");
  const maiuscola = await chiama(`/api/v1/Notifications/${NOTIFICA_ALTRUI}`);
  prova(
    "A-06 · GET /api/v1/Notifications/:id (maiuscola)",
    true,
    maiuscola.stato >= 400 || cerca(maiuscola.corpo).length === 0,
    `stato ${maiuscola.stato} · ${JSON.stringify(cerca(maiuscola.corpo))}`,
  );

  /* A-07 — creazione come oracolo: a chi si puo scrivere? */
  const versoEstraneo = await chiama("/api/v1/notifications", {
    method: "POST",
    body: JSON.stringify({
      user_id: ESTRANEO.id,
      title: "sonda",
      message: "sonda",
      type: "info",
    }),
  });
  prova(
    "A-07 · POST notifica a un utente di un altro club",
    403,
    versoEstraneo.stato,
    JSON.stringify(versoEstraneo.corpo?.error?.message ?? null),
  );

  const versoTutti = await chiama("/api/v1/notifications", {
    method: "POST",
    body: JSON.stringify({ title: "sonda", message: "sonda", type: "info" }),
  });
  prova(
    "A-08 · POST notifica senza destinatario (= di tutti)",
    403,
    versoTutti.stato,
    JSON.stringify(versoTutti.corpo?.error?.message ?? null),
  );

  const versoCollega = await chiama("/api/v1/notifications", {
    method: "POST",
    body: JSON.stringify({
      user_id: MISTER_B.id,
      title: "sonda",
      message: "testo arbitrario da un allenatore",
      type: "info",
    }),
  });
  info(
    "A-09 · POST notifica a un collega dello stesso club (allenatore)",
    versoCollega.stato,
  );

  /* A-10 — DELETE della notifica altrui. */
  const cancella = await chiama(`/api/v1/notifications/${NOTIFICA_ALTRUI}`, {
    method: "DELETE",
  });
  prova(
    "A-10 · DELETE notifica del collega",
    403,
    cancella.stato,
    JSON.stringify(cancella.corpo?.error?.message ?? null),
  );

  /* A-11 — dal club estraneo, con l'identificativo in mano. */
  await comeUtente(ESTRANEO, "owner", ALTRO);
  const daFuori = await chiama(`/api/v1/notifications/${NOTIFICA_ALTRUI}`);
  prova(
    "A-11 · owner di un altro club legge la notifica",
    true,
    daFuori.stato === 403 || cerca(daFuori.corpo).length === 0,
    `stato ${daFuori.stato} · ${JSON.stringify(cerca(daFuori.corpo))}`,
  );

  /* A-12 — la notifica «di societa» resta leggibile a tutti: e voluto? */
  await comeUtente(MISTER_A, "trainer");
  const societa = await chiama(`/api/v1/notifications/${NOTIFICA_SOCIETA}`);
  info("A-12 · notifica di societa (user_id null) leggibile", societa.stato);
};

/* ==================================================================== */
/*  B — il contenuto clinico dentro `data` (§9.2)                       */
/* ==================================================================== */

const attaccoClinico = async () => {
  console.log("\nB — il clinico annidato dentro `data`");
  await comeUtente(MISTER_A, "trainer");

  const porte = [
    ["B-01", `/api/v1/medical_certificates?club_id=${CLUB}`],
    ["B-02", `/api/v1/medical_certificates/${CERT_A}`],
    ["B-03", `/api/v1/simplified_certificates?club_id=${CLUB}`],
    ["B-04", `/api/v1/athletes?club_id=${CLUB}`],
    ["B-05", `/api/v1/athletes/${ATLETI_A[0]}`],
    ["B-06", `/api/v1/simplified_athletes?club_id=${CLUB}`],
    ["B-07", `/api/v1/athletes?club_id=${CLUB}&view=summary`],
  ];

  for (const [id, percorso] of porte) {
    const risposta = await chiama(percorso);
    prova(
      `${id} · ${percorso.replace(/\?.*$/, "")} senza clinico annidato`,
      [],
      cerca(risposta.corpo),
      `stato ${risposta.stato}`,
    );
  }

  /* B-08 — l'export dei diritti dell'interessato. */
  const export1 = await chiama(
    `/api/v1/data-subject?athlete_id=${ATLETI_A[0]}&club_id=${CLUB}`,
  );
  info("B-08 · GET /data-subject stato", export1.stato);
  if (export1.stato === 200) {
    prova("B-08 · export senza clinico annidato", [], cerca(export1.corpo));
  }

  /* B-09 — la scheda allenatore, se esiste una rotta di dominio. */
  const allerte = await chiama("/api/v1/trainer/operational-alerts");
  prova(
    "B-09 · /trainer/operational-alerts senza clinico annidato",
    [],
    cerca(allerte.corpo),
    `stato ${allerte.stato}`,
  );
};

/* ==================================================================== */
/*  C — il conteggio e la paginazione (§10.1)                           */
/* ==================================================================== */

const attaccoConteggio = async () => {
  console.log("\nC — meta.total e la paginazione sotto perimetro");
  await comeUtente(MISTER_A, "trainer");

  const risorse = [
    "athletes",
    "simplified_athletes",
    "medical_certificates",
    "club_events",
    "club_event_participants",
    "athlete_category_memberships",
    "secretariat_notes",
    "notifications",
  ];

  for (const risorsa of risorse) {
    const pagina = await chiama(
      `/api/v1/${risorsa}?club_id=${CLUB}&limit=3&offset=0`,
    );
    const meta = pagina.corpo?.meta ?? null;
    const quante = Array.isArray(pagina.corpo?.data) ? pagina.corpo.data.length : null;
    info(`C-01/${risorsa} · meta`, { stato: pagina.stato, meta, righe: quante });
  }

  /* C-02 — il conteggio degli atleti deve valere il perimetro (7, non 8). */
  const conta = await chiama(`/api/v1/athletes?club_id=${CLUB}&limit=3&offset=0`);
  prova(
    "C-02 · meta.total su athletes = perimetro (7)",
    7,
    conta.corpo?.meta?.total ?? null,
    "il club ne ha 8: uno e della categoria di Bruno",
  );

  /* C-03 — percorrere tutte le pagine: nessuna riga persa ne ripetuta. */
  const visti = [];
  for (let offset = 0; offset < 12; offset += 2) {
    const p = await chiama(
      `/api/v1/athletes?club_id=${CLUB}&limit=2&offset=${offset}`,
    );
    for (const riga of p.corpo?.data ?? []) visti.push(riga.id);
  }
  const unici = Array.from(new Set(visti));
  prova(
    "C-03 · pagine da 2: 7 righe uniche, nessun doppione",
    { righe: 7, unici: 7 },
    { righe: visti.length, unici: unici.length },
  );
  prova(
    "C-03b · nessun atleta fuori perimetro nelle pagine",
    false,
    unici.includes(ATLETA_B),
  );

  /* C-04 — stagione + perimetro + paginazione insieme. */
  const conStagione = await chiama(
    `/api/v1/athletes?club_id=${CLUB}&limit=3&offset=0&season_id=2026-27`,
  );
  info("C-04 · con season_id", {
    stato: conStagione.stato,
    meta: conStagione.corpo?.meta ?? null,
  });

  /* C-05 — hasMore che offre pagine vuote. */
  const ultima = await chiama(`/api/v1/athletes?club_id=${CLUB}&limit=3&offset=6`);
  info("C-05 · ultima pagina", {
    righe: ultima.corpo?.data?.length ?? null,
    meta: ultima.corpo?.meta ?? null,
  });
};

/* ==================================================================== */
/*  D — l'allenatore revocato                                           */
/* ==================================================================== */

const attaccoRevoca = async () => {
  console.log("\nD — l'allenatore revocato");
  await comeUtente(MISTER_A, "trainer");

  /* La tessera se ne va, ma la sessione resta in mano a chi l'aveva. */
  await prisma.organizationUser.deleteMany({
    where: { organization_id: CLUB, user_id: MISTER_A.id },
  });

  const superfici = [
    ["D-01", "GET", "/api/v1/events?kind=all"],
    ["D-02", "GET", `/api/v1/athletes?club_id=${CLUB}`],
    ["D-03", "GET", `/api/v1/medical_certificates?club_id=${CLUB}`],
    ["D-04", "GET", `/api/v1/notifications?club_id=${CLUB}`],
    ["D-05", "GET", "/api/v1/trainer/operational-alerts"],
    ["D-06", "GET", `/api/v1/appointments?club_id=${CLUB}`],
    ["D-07", "GET", "/api/v1/sport-work/me"],
  ];

  for (const [id, metodo, percorso] of superfici) {
    const r = await chiama(percorso, { method: metodo });
    const righe = Array.isArray(r.corpo?.data) ? r.corpo.data.length : "n/d";
    prova(
      `${id} · ${percorso.replace(/\?.*$/, "")} dopo la revoca`,
      true,
      r.stato === 401 || r.stato === 403 || righe === 0,
      `stato ${r.stato} righe ${righe}`,
    );
  }

  const creaDopoRevoca = await chiama("/api/v1/events", {
    method: "POST",
    body: JSON.stringify({
      kind: "training",
      title: "dopo la revoca",
      date: "2026-11-02",
      time: "18:00",
      endTime: "19:00",
      categoryId: CAT_A,
      categoryName: "Under 12",
    }),
  });
  prova(
    "D-08 · POST /events dopo la revoca",
    403,
    creaDopoRevoca.stato,
    JSON.stringify(creaDopoRevoca.corpo?.error?.message ?? null),
  );

  /* La tessera torna, per non falsare le prove successive. */
  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: MISTER_A.id,
      role: "trainer",
      is_primary: true,
      updated_at: new Date(),
    },
  });
};

/* ==================================================================== */
/*  E — il ruolo personalizzato, sottoinsieme e non soprainsieme        */
/* ==================================================================== */

const attaccoRuoloPersonalizzato = async () => {
  console.log("\nE — il ruolo personalizzato sulle superfici nuove");

  /* Un gettone che promette piu del ruolo base. */
  await comeUtente(MISTER_A, "trainer");
  SESSIONE = SESSIONE; // invariato
  RUOLO = "custom:trainer:super#events.manage,clinical.read,communications.send,athletes.manage";

  const clinico = await chiama(`/api/v1/athletes/${ATLETI_A[0]}`);
  prova(
    "E-01 · gettone con clinical.read su base trainer non apre il clinico",
    [],
    cerca(clinico.corpo),
    `stato ${clinico.stato}`,
  );

  const permessi = await carica("src/lib/permissions/catalog.ts");
  prova(
    "E-02 · roleHasPermission(gettone, clinical.read) = false",
    false,
    permessi.roleHasPermission(RUOLO, "clinical.read"),
  );
  prova(
    "E-03 · roleHasPermission(gettone, communications.send) = false",
    false,
    permessi.roleHasPermission(RUOLO, "communications.send"),
  );

  /* Un gettone ristretto: solo events.read. Non deve poter creare. */
  RUOLO = "custom:trainer:solo-lettura#events.read";
  const creaRistretto = await chiama("/api/v1/events", {
    method: "POST",
    body: JSON.stringify({
      kind: "training",
      title: "da ruolo ristretto",
      date: "2026-11-03",
      time: "18:00",
      endTime: "19:00",
      categoryId: CAT_A,
      categoryName: "Under 12",
    }),
  });
  prova(
    "E-04 · gettone con solo events.read non crea un evento",
    403,
    creaRistretto.stato,
    JSON.stringify(creaRistretto.corpo?.error?.message ?? null),
  );

  const leggeRistretto = await chiama("/api/v1/events?kind=all");
  info("E-05 · gettone events.read legge il calendario", leggeRistretto.stato);

  RUOLO = "trainer";
};

/* ==================================================================== */
/*  F — le etichette del catalogo contro le guardie (§10.2)             */
/* ==================================================================== */

const attaccoEtichette = async () => {
  console.log("\nF — cio che il catalogo promette all'allenatore");
  await comeUtente(MISTER_A, "trainer");

  /* F-01 — appointments.manage: «confermare, rifiutare, riprogrammare, annullare». */
  await comeUtente(PRESIDENTE, "owner");
  const nuovo = await chiama("/api/v1/appointments", {
    method: "POST",
    body: JSON.stringify({
      title: "colloquio",
      starts_at: "2026-11-10T10:00:00.000Z",
      duration_minutes: 30,
      athlete_id: ATLETI_A[0],
    }),
  });
  const APP = nuovo.corpo?.data?.id ?? null;
  info("F-00 · appuntamento creato dal presidente", { stato: nuovo.stato, id: APP });

  if (APP) {
    await comeUtente(MISTER_A, "trainer");
    for (const azione of ["confirm", "reject", "cancel"]) {
      const r = await chiama(`/api/v1/appointments/${APP}`, {
        method: "POST",
        body: JSON.stringify({ action: azione, note: "sonda" }),
      });
      info(`F-01/${azione} · l'allenatore lo esegue`, {
        stato: r.stato,
        errore: r.corpo?.error?.message ?? null,
      });
    }
    const lettura = await chiama(`/api/v1/appointments/${APP}`);
    info("F-02 · GET appointments/:id da allenatore", lettura.stato);
  }

  /* F-03 — rsvp.read: «vedere le risposte delle famiglie a un evento». */
  await comeUtente(PRESIDENTE, "owner");
  const evento = await chiama("/api/v1/events", {
    method: "POST",
    body: JSON.stringify({
      kind: "training",
      title: "con rsvp",
      date: "2026-11-11",
      time: "18:00",
      endTime: "19:00",
      categoryId: CAT_A,
      categoryName: "Under 12",
      rsvpRequired: true,
    }),
  });
  const EVT = evento.corpo?.data?.id ?? null;
  await comeUtente(MISTER_A, "trainer");
  const riepilogo = await chiama(`/api/v1/rsvp?training_id=${EVT}`);
  info("F-03 · GET /rsvp?training_id da allenatore", {
    stato: riepilogo.stato,
    errore: riepilogo.corpo?.error?.message ?? null,
  });

  /* F-04 — sport_work.read_own. */
  const compensi = await chiama("/api/v1/sport-work/me");
  info("F-04 · GET /sport-work/me da allenatore", compensi.stato);

  /* F-05 — appointments.read_own. */
  const miei = await chiama(`/api/v1/appointments?club_id=${CLUB}`);
  info("F-05 · GET /appointments da allenatore", {
    stato: miei.stato,
    righe: Array.isArray(miei.corpo?.data) ? miei.corpo.data.length : null,
  });
};

/* ==================================================================== */

const main = async () => {
  console.log("\n  PP-03 round 4 — destinatario, clinico, conteggio\n");
  await semina();
  try {
    await attaccoDestinatario();
    await attaccoClinico();
    await attaccoConteggio();
    await attaccoRevoca();
    await attaccoRuoloPersonalizzato();
    await attaccoEtichette();
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
