/**
 * **PP-03 round 5 — concorrenza, revoca in corsa, e cosa apre la grafia falsa.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/pp-03-round5-concorrenza-e-grafie-probe.mjs
 *
 * Due domande che il round 4 aveva impostato e non ha eseguito — la sua sezione
 * di concorrenza chiamava `POST /api/v1/events/<id>`, che non ha handler: gli
 * atti sui partecipanti stanno su `/events/<id>/participants` — piu la
 * domanda che segue alla falla delle grafie: **cosa si apre**, oltre alla
 * riga scritta nella categoria di un altro?
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
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(66)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        ${nota}`);
};
const info = (titolo, valore) =>
  console.log(`  INFO  ${titolo.padEnd(66)} ${JSON.stringify(valore)}`);

/* ---------------------------------------------------------- gli attori -- */

const CLUB = randomUUID();
const CAT_A = "cat-r5c-a";
const CAT_B = "cat-r5c-b";

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

/*
  **Qui la sessione e un parametro, non una variabile globale.** Le sonde
  precedenti impostavano `SESSIONE` e poi chiamavano: con due richieste in
  parallelo la seconda sovrascriverebbe l'identita della prima, e la sonda
  misurerebbe se stessa.
*/
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

/*
  Le rotte usano `globalThis.fetch` solo se qualcosa dentro il server lo fa;
  qui non serve, perche si invocano gli handler direttamente. Lo si lascia
  comunque puntato a un errore parlante, per non mandare una richiesta vera.
*/
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
      last_name: "R5c",
      password_hash: "$2b$10$pp03r5c",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const semina = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp03r5c-" } },
    select: { id: true },
  });
  if (residui.length) {
    const ids = residui.map((r) => r.id);
    await prisma.auditLog.deleteMany({ where: { organization_id: { in: ids } } }).catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }

  PRESIDENTE = await utente("pp03r5c-presidente@example.invalid", "Anna");
  MISTER_A = await utente("pp03r5c-mister-a@example.invalid", "Aldo");
  MISTER_B = await utente("pp03r5c-mister-b@example.invalid", "Bruno");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `pp03r5c-${Date.now()}`,
      name: "ASD Round5 C",
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
          id: "trainer-r5c-a",
          first_name: "Aldo",
          last_name: "R5c",
          email: MISTER_A.email,
          linkedUserId: MISTER_A.id,
          categories: [CAT_A],
          groups: [],
        },
        {
          id: "trainer-r5c-b",
          first_name: "Bruno",
          last_name: "R5c",
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
        first_name: "Aldo jr",
        last_name: "CatA",
        status: "active",
        category_id: CAT_A,
        category_name: "Under 12",
        data: { seasonId: "2026-27" },
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
        data: { seasonId: "2026-27" },
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

let ALDO = null;
let BRUNO = null;
let CAPO = null;

const base = (extra) => ({
  kind: "training",
  title: "Sonda R5c",
  date: "2026-10-24",
  time: "18:00",
  endTime: "19:30",
  seasonId: "2026-27",
  allowOverlap: true,
  ...extra,
});

const crea = (chi, corpo) =>
  invia(chi, "/api/v1/events", { method: "POST", body: JSON.stringify(corpo) });

/* ------------------------------------------------------------------- A - */

const attaccoGrafiaApre = async () => {
  console.log("\nA — cosa apre l'evento scritto con la grafia falsa");

  /*
    Aldo crea un evento la cui **categoria in colonna** e quella di Bruno,
    facendolo passare per proprio con `categoryName` uguale al proprio
    identificativo di categoria. E la falla che il round 4 ha misurato e non
    ha consegnato; qui si misura cosa ci si fa.
  */
  const forgiato = await crea(
    ALDO,
    base({
      categoryId: CAT_B,
      categoryName: CAT_A,
      title: "FORGIATO da Aldo nella categoria di Bruno",
    }),
  );
  const ID = forgiato.corpo?.data?.id ?? null;
  const rigaForgiata = ID
    ? await prisma.clubEvent.findUnique({ where: { id: ID } })
    : null;
  prova(
    "A-01 · l'evento con categoryName falso non nasce nella categoria di B",
    true,
    forgiato.stato >= 400 || String(rigaForgiata?.category_id ?? "") !== CAT_B,
    `stato ${forgiato.stato} categoria ${JSON.stringify(rigaForgiata?.category_id ?? null)}`,
  );
  if (!ID) return null;

  /* A-02 — l'appello sull'atleta di Bruno, dall'evento forgiato. */
  const appello = await invia(ALDO, `/api/v1/events/${ID}/participants`, {
    method: "POST",
    body: JSON.stringify({
      action: "attendance",
      entries: [{ athleteId: ATLETA_B, status: "present" }],
    }),
  });
  const presenzaB = await prisma.clubEventParticipant.count({
    where: { event_id: ID, athlete_id: ATLETA_B },
  });
  prova(
    "A-02 · nessuna presenza scritta sull'atleta di Bruno",
    0,
    presenzaB,
    `stato ${appello.stato} ${JSON.stringify(appello.corpo?.error?.message ?? null)}`,
  );

  /* A-03 — la convocazione dell'atleta di Bruno. */
  const convoca = await invia(ALDO, `/api/v1/events/${ID}/participants`, {
    method: "POST",
    body: JSON.stringify({ action: "convoke", athleteIds: [ATLETA_B] }),
  });
  const convocatoB = await prisma.clubEventParticipant.count({
    where: { event_id: ID, athlete_id: ATLETA_B },
  });
  prova(
    "A-03 · nessuna convocazione sull'atleta di Bruno",
    0,
    convocatoB,
    `stato ${convoca.stato} ${JSON.stringify(convoca.corpo?.error?.message ?? null)}`,
  );

  /* A-04 — i partecipanti dell'evento forgiato, letti da Aldo. */
  const lettura = await invia(ALDO, `/api/v1/events/${ID}`);
  const testo = JSON.stringify(lettura.corpo ?? null);
  prova(
    "A-04 · la lettura dell'evento forgiato non porta Bruna",
    false,
    testo.includes("Bruna") || testo.includes(ATLETA_B),
    `stato ${lettura.stato}`,
  );

  /* A-05 — l'evento forgiato compare nel calendario di Bruno. */
  const calendarioB = await invia(BRUNO, "/api/v1/events");
  const titoli = (calendarioB.corpo?.data || []).map((e) => e?.title);
  prova(
    "A-05 · l'evento forgiato non compare nel calendario di Bruno",
    false,
    titoli.some((t) => String(t || "").includes("FORGIATO")),
    `titoli ${JSON.stringify(titoli)}`,
  );

  /*
    A-06 — l'RSVP acceso da Aldo sull'evento forgiato arriva alla famiglia di
    Bruno? E la domanda che il mandato pone sulla casella appena montata: non
    «esce un dato», ma «entra un invito da chi non e il loro allenatore».
  */
  const acceso = await invia(ALDO, `/api/v1/events/${ID}`, {
    method: "PATCH",
    body: JSON.stringify({ rsvpRequired: true, capacity: 12 }),
  });
  const inviti = await invia(CAPO, `/api/v1/rsvp?athlete_id=${ATLETA_B}&club_id=${CLUB}`);
  const testoInviti = JSON.stringify(inviti.corpo ?? null);
  prova(
    "A-06 · nessun invito RSVP all'atleta di Bruno da un evento forgiato",
    false,
    testoInviti.includes("FORGIATO"),
    `accensione ${acceso.stato}; inviti ${inviti.stato}`,
  );

  /* A-07 — e Bruno lo puo togliere? (chi subisce deve poter rimediare) */
  const rimuove = await invia(BRUNO, `/api/v1/events/${ID}`, { method: "DELETE" });
  info("A-07 · Bruno cancella l'evento che Aldo gli ha messo in calendario", {
    stato: rimuove.stato,
    errore: String(rimuove.corpo?.error?.message ?? "").slice(0, 120),
  });

  return ID;
};

/* ------------------------------------------------------------------- B - */

const attaccoConcorrenza = async () => {
  console.log("\nB — due scritture nello stesso istante");

  const congiunto = await crea(
    CAPO,
    base({
      categoryId: CAT_A,
      categoryName: "Under 12",
      categories: [CAT_A, CAT_B],
      time: "20:00",
      endTime: "21:30",
      title: "congiunto per la concorrenza",
    }),
  );
  const ID = congiunto.corpo?.data?.id ?? null;
  const versione = congiunto.corpo?.data?.row?.version ?? null;
  info("B-00 · congiunto", { stato: congiunto.stato, id: ID, versione });
  if (!ID) return;

  /* B-01 — due PATCH con la stessa versione attesa. */
  const [uno, due] = await Promise.all([
    invia(CAPO, `/api/v1/events/${ID}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "scritto dal presidente", version: versione }),
    }),
    invia(BRUNO, `/api/v1/events/${ID}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "scritto da Bruno", version: versione }),
    }),
  ]);
  info("B-01 · due PATCH con la stessa versione", {
    presidente: uno.stato,
    bruno: due.stato,
  });
  prova(
    "B-01 · Bruno (una sola categoria) non scrive il congiunto",
    403,
    due.stato,
    JSON.stringify(due.corpo?.error?.message ?? null),
  );

  /* B-02 — due PATCH del presidente con la stessa versione. */
  const rigaOra = await prisma.clubEvent.findUnique({ where: { id: ID } });
  const [x, y] = await Promise.all([
    invia(CAPO, `/api/v1/events/${ID}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "corsa 1", version: rigaOra.version }),
    }),
    invia(CAPO, `/api/v1/events/${ID}`, {
      method: "PATCH",
      body: JSON.stringify({ notes: "corsa 2", version: rigaOra.version }),
    }),
  ]);
  prova(
    "B-02 · due scritture con la stessa versione: una sola passa",
    [200, 409],
    [x.stato, y.stato].sort((a, b) => a - b),
    `${JSON.stringify(x.corpo?.error?.message ?? null)} / ${JSON.stringify(y.corpo?.error?.message ?? null)}`,
  );

  /* B-03 — appello e annullamento in corsa. */
  const rigaPrima = await prisma.clubEvent.findUnique({ where: { id: ID } });
  const [appello, annulla] = await Promise.all([
    invia(BRUNO, `/api/v1/events/${ID}/participants`, {
      method: "POST",
      body: JSON.stringify({
        action: "attendance",
        entries: [{ athleteId: ATLETA_B, status: "present" }],
      }),
    }),
    invia(CAPO, `/api/v1/events/${ID}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled", version: rigaPrima.version }),
    }),
  ]);
  const dopo = await prisma.clubEvent.findUnique({ where: { id: ID } });
  const presenze = await prisma.clubEventParticipant.findMany({
    where: { event_id: ID },
    select: { athlete_id: true, status: true, convocation_status: true },
  });
  info("B-03 · appello e annullamento simultanei", {
    appello: appello.stato,
    annullamento: annulla.stato,
    statoEvento: dopo?.status ?? null,
    presenze,
  });
  prova(
    "B-03 · nessuna presenza su un evento che risulta annullato",
    true,
    dopo?.status !== "cancelled" || !presenze.some((p) => p.status === "present"),
    `stato evento ${dopo?.status}; presenze ${JSON.stringify(presenze)}`,
  );

  /*
    B-04 — due appelli simultanei sullo stesso atleta, valori opposti, su un
    evento **nuovo**: quello di B-03 e ormai annullato, e la guardia di §7.3
    respingerebbe entrambi facendo misurare alla sonda il proprio ordine.
  */
  const fresco = await crea(
    CAPO,
    base({
      categoryId: CAT_A,
      categoryName: "Under 12",
      time: "06:00",
      endTime: "07:00",
      title: "evento per i due appelli",
    }),
  );
  const ID2 = fresco.corpo?.data?.id ?? null;
  info("B-04a · evento nuovo", { stato: fresco.stato, id: ID2 });
  if (!ID2) return;

  const [p1, p2] = await Promise.all([
    invia(CAPO, `/api/v1/events/${ID2}/participants`, {
      method: "POST",
      body: JSON.stringify({
        action: "attendance",
        entries: [{ athleteId: ATLETA_A, status: "present" }],
      }),
    }),
    invia(CAPO, `/api/v1/events/${ID2}/participants`, {
      method: "POST",
      body: JSON.stringify({
        action: "attendance",
        entries: [{ athleteId: ATLETA_A, status: "absent" }],
      }),
    }),
  ]);
  const righe = await prisma.clubEventParticipant.findMany({
    where: { event_id: ID2, athlete_id: ATLETA_A },
    select: { id: true, status: true },
  });
  prova(
    "B-04 · due appelli simultanei lasciano una riga sola",
    1,
    righe.length,
    `stati ${p1.stato}/${p2.stato}; righe ${JSON.stringify(righe)}`,
  );
};

/* ------------------------------------------------------------------- C - */

const attaccoRevocaInCorsa = async () => {
  console.log("\nC — la revoca mentre la scrittura e in volo");

  const evento = await crea(
    ALDO,
    base({
      categoryId: CAT_A,
      categoryName: "Under 12",
      time: "07:00",
      endTime: "08:00",
      title: "prima della revoca",
    }),
  );
  const ID = evento.corpo?.data?.id ?? null;
  info("C-00 · evento di Aldo", { stato: evento.stato, id: ID });
  if (!ID) return;

  const tessera = await prisma.organizationUser.findFirst({
    where: { organization_id: CLUB, user_id: MISTER_A.id },
  });

  const [scrittura] = await Promise.all([
    invia(ALDO, `/api/v1/events/${ID}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "durante la revoca" }),
    }),
    prisma.organizationUser.delete({ where: { id: tessera.id } }),
  ]);
  info("C-01 · PATCH mentre la tessera viene revocata", { stato: scrittura.stato });

  /* C-02 — dopo la revoca, con la sessione ancora valida. */
  const dopo = await invia(ALDO, `/api/v1/events/${ID}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "dopo la revoca" }),
  });
  prova(
    "C-02 · dopo la revoca la scrittura e negata",
    true,
    dopo.stato >= 400,
    `stato ${dopo.stato} ${JSON.stringify(dopo.corpo?.error?.message ?? null)}`,
  );

  const lettura = await invia(ALDO, "/api/v1/events");
  prova(
    "C-03 · dopo la revoca il calendario e negato o vuoto",
    true,
    lettura.stato >= 400 || (lettura.corpo?.data || []).length === 0,
    `stato ${lettura.stato} righe ${(lettura.corpo?.data || []).length}`,
  );

  const atleti = await invia(ALDO, `/api/v1/athletes?club_id=${CLUB}`);
  prova(
    "C-04 · dopo la revoca l'elenco atleti e negato o vuoto",
    true,
    atleti.stato >= 400 || (atleti.corpo?.data || []).length === 0,
    `stato ${atleti.stato} righe ${(atleti.corpo?.data || []).length}`,
  );
};

const main = async () => {
  console.log("\n  PP-03 round 5 — concorrenza, revoca e grafie\n");
  await semina();
  ALDO = await identita(MISTER_A, "trainer");
  BRUNO = await identita(MISTER_B, "trainer");
  CAPO = await identita(PRESIDENTE, "owner");
  try {
    await attaccoGrafiaApre();
    await attaccoConcorrenza();
    await attaccoRevocaInCorsa();
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
