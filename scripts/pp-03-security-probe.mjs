/**
 * **L'attacco a PP-03, contro un database vero e le rotte vere.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs scripts/pp-03-security-probe.mjs
 *
 * ---
 *
 * ## Perche esiste
 *
 * Le revisioni di PP-01 e PP-02 hanno dimostrato quattro cose, e questa sonda
 * e costruita su tutte e quattro:
 *
 * 1. **Un test di dominio verde non dice niente sulla rotta.** Il perimetro di
 *    `events.ts` era misurato da `tests/server/perimetro-allenatore.test.mjs`,
 *    che verifica che ogni funzione pubblica chiami una delle due funzioni di
 *    perimetro. `listEventParticipants` la chiama — **sull'evento**. Le persone
 *    dentro l'evento non le guarda nessuno, e il test resta verde.
 * 2. **Un produttore corretto non implica un consumatore corretto**, e
 *    viceversa: il filtro che vive **solo** nel browser e una decorazione.
 * 3. **Un doppio di Prisma diverge da PostgreSQL** su `hasSome`, sugli array e
 *    sull'unicita. Qui il database e vero.
 * 4. **Due porte per lo stesso dato, e una sola sorvegliata.** E la forma piu
 *    frequente: il registro generico filtra `club_event_participants`, il
 *    dominio degli eventi serve gli stessi record e non filtra.
 *
 * ## La regola di questo file
 *
 * **La sonda attacca, non corregge.** Ogni prova e scritta dalla parte
 * dell'attaccante: `PASS` significa «l'attacco e stato respinto». Il file non
 * tocca una riga del codice di produzione, e cancella il proprio club in
 * `finally`.
 *
 * ## Lo scenario
 *
 * Un club, due sedi, tre categorie. **Due allenatori**, ognuno di una sola
 * categoria: e la configurazione minima in cui «gruppo A verso gruppo B» e una
 * domanda sensata. Un evento su **due categorie** (A e B), che dopo ADR-0111
 * ammette entrambi gli allenatori — ed e esattamente li che il confine fra
 * «vedo l'evento» e «vedo le persone dell'evento» diventa osservabile.
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
  esiti.push({ titolo, ok });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(76)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        nota: ${nota}`);
};

/** Un attacco che deve essere **respinto**, e il modo in cui deve esserlo. */
const respinto = async (titolo, azione, atteso = /Accesso negato/) => {
  try {
    const esito = await azione();
    prova(titolo, "respinto", "riuscito", `ha restituito ${JSON.stringify(esito)?.slice(0, 200)}`);
  } catch (errore) {
    const messaggio = String(errore?.message || errore);
    prova(
      titolo,
      "respinto",
      atteso.test(messaggio) ? "respinto" : "respinto-altro",
      messaggio.slice(0, 200),
    );
  }
};

/* -------------------------------------------------------- gli attori --- */

const CLUB = randomUUID();
const ALTRO_CLUB = randomUUID();
const SEDE_1 = "sede-pp03-nord";
const SEDE_2 = "sede-pp03-sud";
const CAT_A = "cat-pp03-a";
const CAT_B = "cat-pp03-b";
const CAT_C = "cat-pp03-c";

const ATLETA_A = randomUUID();
const ATLETA_B = randomUUID();
const ATLETA_C = randomUUID();
const ATLETA_ALTRO_CLUB = randomUUID();

let PRESIDENTE = null;
let MISTER_A = null;
let MISTER_B = null;

let eventi;
let risorse;

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
      last_name: "Collaudo",
      password_hash: "$2b$10$pp03",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

/* --------------------------------------------------------- il trasporto */

/**
 * **Il dirottamento di `fetch` sui route handler veri**, sullo schema di
 * `scripts/pp-01-uat.mjs`, esteso alle rotte annidate del dominio eventi e
 * alle rotte proprie dell'allenatore: `/events/:id/participants`,
 * `/trainer/preferences`, `/trainer/operational-alerts`, `/sport-work/me`.
 *
 * Non c'e nessun finto: c'e solo un cavo piu corto. La sessione e in archivio,
 * lo scope lo risolve `resolveOrganizationScopeForUser` come in produzione.
 */
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
    preferenze: await carica("src/app/api/v1/trainer/preferences/route.ts"),
    avvisi: await carica("src/app/api/v1/trainer/operational-alerts/route.ts"),
    compensi: await carica("src/app/api/v1/sport-work/me/route.ts"),
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
      const fn = rotte.partecipanti[metodo];
      return fn(richiesta, { params: { id: segmenti[1] } });
    }
    if (segmenti[0] === "events" && segmenti.length === 2) {
      const fn = rotte.evento[metodo];
      return fn(richiesta, { params: { id: segmenti[1] } });
    }
    if (segmenti[0] === "trainer" && segmenti[1] === "preferences") {
      return rotte.preferenze[metodo](richiesta);
    }
    if (segmenti[0] === "trainer" && segmenti[1] === "operational-alerts") {
      return rotte.avvisi[metodo](richiesta);
    }
    if (segmenti[0] === "sport-work" && segmenti[1] === "me") {
      return rotte.compensi[metodo](richiesta);
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

const comeUtente = async (utenteRiga, ruolo) => {
  const auth = await carica("src/lib/server/auth.ts");
  const sessione = await auth.createSessionForUser(utenteRiga);
  SESSIONE = sessione.access_token;
  CLUB_ATTIVO = CLUB;
  RUOLO_ATTIVO = ruolo;
};

/** Una chiamata HTTP vera, con il suo stato e il suo corpo. */
const chiama = async (percorso, init) => {
  const risposta = await globalThis.fetch(percorso, init);
  const corpo = await risposta.json().catch(() => null);
  return { stato: risposta.status, corpo };
};

/* ------------------------------------------------------------ la semina */

const pulisciResidui = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp03-" } },
    select: { id: true },
  });
  const ids = residui.map((riga) => riga.id);
  if (!ids.length) return;
  await prisma.auditLog.deleteMany({ where: { organization_id: { in: ids } } }).catch(() => {});
  await prisma.club.deleteMany({ where: { id: { in: ids } } });
};

const semina = async () => {
  await pulisciResidui();

  PRESIDENTE = await utente("pp03-presidente@example.invalid", "Anna");
  MISTER_A = await utente("pp03-mister-a@example.invalid", "Aldo");
  MISTER_B = await utente("pp03-mister-b@example.invalid", "Bruno");

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
      slug: `pp03-${Date.now()}`,
      name: "ASD Collaudo PP-03",
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
          id: "trainer-pp03-a",
          first_name: "Aldo",
          last_name: "Collaudo",
          email: MISTER_A.email,
          linkedUserId: MISTER_A.id,
          categories: [CAT_A],
          groups: [],
          /*
            I due campi che l'attacco «anagrafica dei colleghi» cerca: un
            recapito privato e una nota interna sul rapporto di lavoro.
          */
          phone: "+39 333 1110001",
          iban: "IT60X0542811101000000123456",
          notes: "Compenso rinegoziato a marzo, riservato",
        },
        {
          id: "trainer-pp03-b",
          first_name: "Bruno",
          last_name: "Collaudo",
          email: MISTER_B.email,
          linkedUserId: MISTER_B.id,
          categories: [CAT_B],
          groups: [],
          phone: "+39 333 2220002",
          iban: "IT60X0542811101000000999999",
          notes: "Contenzioso aperto, non divulgare",
        },
      ],
      staff_members: [],
      trainings: [],
      matches: [],
      appointments: [],
      /*
        Tre note di segreteria, che sono i tre casi di `reminder-targeting.ts`:
        una interna alla segreteria, una indirizzata a **un** allenatore, una a
        tutti. Solo la terza e per Aldo.
      */
      updated_at: new Date(),
    },
  });

  /* Un secondo club, per l'attacco cross-tenant. */
  await prisma.club.create({
    data: {
      id: ALTRO_CLUB,
      slug: `pp03-altro-${Date.now()}`,
      name: "ASD Estranea PP-03",
      creator_id: PRESIDENTE.id,
      settings: impostazioniClub,
      categories: [{ id: CAT_A, name: "Under 12" }],
      updated_at: new Date(),
    },
  });

  for (const [utenteRiga, ruolo] of [
    [MISTER_A, "trainer"],
    [MISTER_B, "trainer"],
    [PRESIDENTE, "owner"],
  ]) {
    await prisma.organizationUser.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        user_id: utenteRiga.id,
        role: ruolo,
        is_primary: true,
        updated_at: new Date(),
      },
    });
  }

  /*
    Gli atleti portano il dato clinico **vero** dentro `data`: e cio che la
    proiezione deve togliere all'allenatore. Un atleta per categoria, piu uno
    in un altro club.
  */
  const clinico = {
    allergies: "Arachidi - shock anafilattico",
    bloodType: "AB-",
    chronicDiseases: "Asma grave",
    medications: "Salbutamolo",
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
        data: { ...clinico, taxCode: "AAABBB00A00A000A", phone: "+39 340 0000001" },
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
        data: { ...clinico, taxCode: "BBBCCC00A00A000B", phone: "+39 340 0000002" },
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

  eventi = await carica("src/lib/server/events.ts");
  risorse = await carica("src/lib/server/resources.ts");
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
  if (tolti.count === -1) console.error(`I club di collaudo sono rimasti in archivio.`);
};

/* ==================================================================== */
/*  Gli eventi su cui si attacca                                        */
/* ==================================================================== */

let EVENTO_AB = null;
let EVENTO_C = null;
let EVENTO_CONCLUSO = null;

const preparaEventi = async () => {
  const owner = scope("owner", PRESIDENTE.id);
  const giorno = (delta) =>
    new Date(Date.now() + delta * 86_400_000).toISOString().slice(0, 10);

  /* Un allenamento su **due** categorie: A e B. Dopo ADR-0111 entrambi gli
     allenatori sono ammessi all'evento. */
  EVENTO_AB = await eventi.createClubEvent(owner, "training", {
    id: `pp03-ab-${Date.now()}`,
    title: "Allenamento congiunto A+B",
    date: giorno(3),
    time: "18:00",
    endTime: "19:30",
    categoryId: CAT_A,
    categories: [CAT_A, CAT_B],
    siteId: SEDE_1,
  });

  /* Un allenamento della sola categoria C: nessuno dei due mister lo tocca. */
  EVENTO_C = await eventi.createClubEvent(owner, "training", {
    id: `pp03-c-${Date.now()}`,
    title: "Allenamento Prima squadra",
    date: giorno(4),
    time: "18:00",
    endTime: "19:30",
    categoryId: CAT_C,
    categories: [CAT_C],
    siteId: SEDE_1,
  });

  /* Un allenamento gia passato, con l'appello **gia fatto**: e il caso in cui
     ADR-0112 congela i campi che hanno lasciato una traccia. */
  EVENTO_CONCLUSO = await eventi.createClubEvent(owner, "training", {
    id: `pp03-concluso-${Date.now()}`,
    title: "Allenamento concluso A",
    date: giorno(-2),
    time: "18:00",
    endTime: "19:30",
    categoryId: CAT_A,
    categories: [CAT_A],
    siteId: SEDE_1,
  });

  /* Il presidente registra le presenze sull'evento congiunto: **un atleta per
     categoria**. E il dato che l'allenatore di B non deve poter leggere per
     intero. */
  await eventi.saveEventAttendance(
    owner,
    EVENTO_AB.id,
    [
      { athleteId: ATLETA_A, status: "present" },
      { athleteId: ATLETA_B, status: "present" },
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

/* ==================================================================== */
/*  A — Il perimetro sulle persone dentro un evento condiviso           */
/* ==================================================================== */

const attaccoPartecipanti = async () => {
  console.log(`${NL}A — le persone dentro un evento condiviso`);
  await comeUtente(MISTER_B, "trainer");

  /*
    L'evento e legittimamente visibile a Bruno: ADR-0111 ammette un evento se
    **almeno una** delle sue categorie sta nel perimetro, e B c'e. La domanda
    non e se veda l'evento — deve vederlo. La domanda e **chi ci sta dentro**.
  */
  const evento = await chiama(`/api/v1/events/${EVENTO_AB.id}`);
  prova("A-01 · l'allenatore di B vede l'evento congiunto (deve)", 200, evento.stato);

  const partecipanti = await chiama(`/api/v1/events/${EVENTO_AB.id}/participants`);
  const atleti = (partecipanti.corpo?.data || []).map((riga) => riga.athlete_id);

  prova(
    "A-02 · GET /participants non porta l'atleta della categoria A",
    false,
    atleti.includes(ATLETA_A),
    `partecipanti restituiti: ${JSON.stringify(atleti)}`,
  );
  prova(
    "A-03 · GET /participants porta l'atleta della categoria B (deve)",
    true,
    atleti.includes(ATLETA_B),
  );

  /* La seconda porta sullo stesso dato: il dettaglio dell'evento. */
  const inclusi = (evento.corpo?.data?.participants || []).map((riga) => riga.athlete_id);
  prova(
    "A-04 · GET /events/:id non annida l'atleta fuori perimetro",
    false,
    inclusi.includes(ATLETA_A),
    `partecipanti annidati: ${JSON.stringify(inclusi)}`,
  );

  /* La scrittura era gia sorvegliata: si verifica che lo resti. */
  const manomissione = await chiama(`/api/v1/events/${EVENTO_AB.id}/participants`, {
    method: "POST",
    body: JSON.stringify({
      data: { action: "attendance", entries: [{ athleteId: ATLETA_A, status: "absent" }] },
    }),
  });
  prova(
    "A-05 · POST appello sull'atleta fuori perimetro e respinto",
    403,
    manomissione.stato,
    JSON.stringify(manomissione.corpo?.error),
  );

  /* Un evento di una categoria che non e sua: fuori perimetro per intero. */
  const fuori = await chiama(`/api/v1/events/${EVENTO_C.id}/participants`);
  prova("A-06 · l'evento della categoria C e negato", 403, fuori.stato);

  /*
    **La convocazione svuotata.** `saveEventConvocations` riporta a «indeciso»
    chi **non** compare nell'elenco ricevuto (`notIn`). Un elenco vuoto — o
    fatto di sole voci che la normalizzazione scarta — nomina nessuno, e
    `notIn: []` in SQL non esclude niente: la ripulitura passa su **tutti** i
    partecipanti dell'evento. Il vaglio sulle persone, che guarda cio che
    l'elenco nomina, su un elenco vuoto non ha niente da guardare.

    E una scrittura distruttiva sul dato di minori fuori dal perimetro di chi
    la esegue, e non richiede nemmeno di conoscerne l'identificativo.
  */
  const presidente = scope("owner", PRESIDENTE.id);
  await eventi.saveEventConvocations(
    presidente,
    EVENTO_AB.id,
    [
      { athleteId: ATLETA_A, status: "convocated" },
      { athleteId: ATLETA_B, status: "convocated" },
    ],
    { userId: PRESIDENTE.id, email: PRESIDENTE.email },
  );

  const svuota = await chiama(`/api/v1/events/${EVENTO_AB.id}/participants`, {
    method: "POST",
    body: JSON.stringify({ data: { action: "convoke", entries: [] } }),
  });

  const dopo = await prisma.clubEventParticipant.findFirst({
    where: { event_id: EVENTO_AB.id, athlete_id: ATLETA_A },
    select: { convocation_status: true },
  });

  prova(
    "A-07 · una convocazione vuota non cancella quella dell'atleta fuori perimetro",
    "convocated",
    dopo?.convocation_status,
    `stato della richiesta: ${svuota.stato}`,
  );
};

/* ==================================================================== */
/*  B — Gli atleti: elenco, riga singola, dato clinico                  */
/* ==================================================================== */

const attaccoAtleti = async () => {
  console.log(`${NL}B — gli atleti e il dato clinico`);
  await comeUtente(MISTER_A, "trainer");

  const elenco = await chiama("/api/v1/athletes");
  const righe = elenco.corpo?.data || [];
  const ids = righe.map((riga) => riga.id);

  prova("B-01 · l'elenco porta l'atleta della propria categoria", true, ids.includes(ATLETA_A));
  prova("B-02 · l'elenco non porta l'atleta della categoria B", false, ids.includes(ATLETA_B));
  prova("B-03 · l'elenco non porta l'atleta della categoria C", false, ids.includes(ATLETA_C));

  /* Manipolazione dell'identificativo: la riga chiesta per nome. */
  const perId = await chiama(`/api/v1/athletes/${ATLETA_B}`);
  prova(
    "B-04 · l'atleta di un altro gruppo chiesto per id e negato",
    true,
    perId.stato === 403 || perId.stato === 404,
    `stato ${perId.stato}`,
  );

  const altroClub = await chiama(`/api/v1/athletes/${ATLETA_ALTRO_CLUB}`);
  prova(
    "B-05 · l'atleta di un altro club chiesto per id e negato",
    true,
    altroClub.stato === 403 || altroClub.stato === 404,
    `stato ${altroClub.stato}`,
  );

  /* Il dato clinico: **non** deve essere nella risposta, in nessun ramo. */
  const mio = righe.find((riga) => riga.id === ATLETA_A);
  const serializzato = JSON.stringify(mio || {});
  prova("B-06 · nessuna allergia nella risposta", false, serializzato.includes("Arachidi"));
  prova("B-07 · nessun gruppo sanguigno nella risposta", false, serializzato.includes("AB-"));
  prova("B-08 · nessuna patologia nella risposta", false, serializzato.includes("Asma"));
  prova("B-09 · nessun farmaco nella risposta", false, serializzato.includes("Salbutamolo"));
  prova("B-10 · nessuna nota clinica nella risposta", false, serializzato.includes("terapia dal 2024"));
};

/* ==================================================================== */
/*  C — Le note di segreteria                                           */
/* ==================================================================== */

const attaccoNote = async () => {
  console.log(`${NL}C — le note di segreteria`);

  /*
    Le note si seminano dalla **rotta vera** come presidente, non scrivendo la
    colonna del club: scriverla a mano lascia `club_resource_items` disallineato
    (CLAUDE.md §11.3) e la lettura non troverebbe niente — cioe la sonda
    misurerebbe il proprio errore di semina invece del difetto.
  */
  await comeUtente(PRESIDENTE, "owner");
  for (const nota of [
    {
      id: "nota-interna",
      content: "MOROSITA: la famiglia dell'atleta B non paga da tre mesi",
      targetType: "club_dashboard",
    },
    {
      id: "nota-per-bruno",
      content: "RISERVATO A BRUNO: colloquio disciplinare con il presidente",
      targetType: "trainer",
      targetId: "trainer-pp03-b",
    },
    {
      id: "nota-per-tutti",
      content: "Chiusura palestra il 25 aprile",
      targetType: "all_trainers",
    },
  ]) {
    const esito = await chiama("/api/v1/secretariat_notes", {
      method: "POST",
      body: JSON.stringify({ data: { ...nota, date: new Date().toISOString() } }),
    });
    if (esito.stato >= 400) {
      console.log(`        semina nota ${nota.id}: stato ${esito.stato} ${JSON.stringify(esito.corpo?.error)}`);
    }
  }

  await comeUtente(MISTER_A, "trainer");

  const risposta = await chiama("/api/v1/secretariat_notes");
  const note = risposta.corpo?.data || [];
  const testo = JSON.stringify(note);

  prova(
    "C-01 · la nota interna della segreteria non esce",
    false,
    testo.includes("MOROSITA"),
    `note restituite: ${note.map((n) => n?.id).join(", ")}`,
  );
  prova(
    "C-02 · la nota indirizzata a un altro allenatore non esce",
    false,
    testo.includes("RISERVATO A BRUNO"),
  );
  prova(
    "C-03 · la nota per tutti gli allenatori esce (deve)",
    true,
    testo.includes("Chiusura palestra"),
  );
};

/* ==================================================================== */
/*  D — L'anagrafica dei colleghi                                       */
/* ==================================================================== */

const attaccoColleghi = async () => {
  console.log(`${NL}D — l'anagrafica dei colleghi`);
  await comeUtente(MISTER_A, "trainer");

  const risposta = await chiama("/api/v1/trainers");
  const testo = JSON.stringify(risposta.corpo?.data || []);

  prova("D-01 · nessun IBAN di collega nella risposta", false, testo.includes("IT60X0542811101000000999999"));
  prova("D-02 · nessuna nota riservata di collega", false, testo.includes("Contenzioso aperto"));
  prova("D-03 · nessun recapito telefonico di collega", false, testo.includes("+39 333 2220002"));
  prova("D-04 · nessun IBAN proprio nella risposta", false, testo.includes("IT60X0542811101000000123456"));
};

/* ==================================================================== */
/*  E — I compensi                                                      */
/* ==================================================================== */

const attaccoCompensi = async () => {
  console.log(`${NL}E — i compensi`);
  await comeUtente(MISTER_A, "trainer");

  const proprio = await chiama("/api/v1/sport-work/me");
  prova("E-01 · la posizione propria risponde", true, proprio.stato === 200, `stato ${proprio.stato}`);

  /* Non esiste un parametro da cambiare: si prova comunque a inventarne uno. */
  const altrui = await chiama("/api/v1/sport-work/me?person_id=trainer-pp03-b");
  const testo = JSON.stringify(altrui.corpo?.data || {});
  prova(
    "E-02 · un `person_id` inventato non porta la posizione di un altro",
    false,
    testo.includes("trainer-pp03-b"),
  );

  /* Il registro generale del lavoro sportivo non e dell'allenatore. */
  const registro = await chiama("/api/v1/sport_work_people");
  prova(
    "E-03 · il registro generale del lavoro sportivo e negato",
    true,
    registro.stato === 403 || registro.stato === 400,
    `stato ${registro.stato}`,
  );
};

/* ==================================================================== */
/*  F — Il ruolo personalizzato e il perimetro di sede                  */
/* ==================================================================== */

const attaccoRuoloPersonalizzato = async () => {
  console.log(`${NL}F — ruolo personalizzato e perimetro di sede`);

  /*
    Un ruolo personalizzato costruito **sull'allenatore** senza nessuna chiave:
    il soffitto di ADR-0102 dice che non puo fare piu del ruolo base, e le
    chiavi concesse dicono che non puo fare piu di quelle. Zero chiavi = zero
    permessi di catalogo, ma il perimetro delle risorse resta quello del ruolo
    base. Si misura cio che davvero esce.
  */
  const catalogo = await carica("src/lib/permissions/catalog.ts");
  const salute = await carica("src/lib/health/permissions.ts");

  const ruoloVuoto = "custom:trainer:vuoto";
  prova(
    "F-01 · un ruolo personalizzato senza chiavi non legge lo stato clinico",
    false,
    salute.hasHealthPermission(ruoloVuoto, "clinical.status_read"),
  );
  prova(
    "F-02 · un ruolo personalizzato senza chiavi non legge il contenuto clinico",
    false,
    salute.hasHealthPermission(ruoloVuoto, "clinical.read"),
  );

  const ruoloConStato = "custom:trainer:stato#clinical.status_read";
  prova(
    "F-03 · un ruolo personalizzato con la chiave legge lo stato",
    true,
    salute.hasHealthPermission(ruoloConStato, "clinical.status_read"),
  );
  prova(
    "F-04 · ma non guadagna il contenuto clinico che il ruolo base non ha",
    false,
    salute.hasHealthPermission("custom:trainer:tutto#clinical.read", "clinical.read"),
  );

  /* Il soffitto vale anche verso l'alto: un `custom:trainer` non diventa owner. */
  prova(
    "F-05 · un ruolo personalizzato su allenatore non guadagna la contabilita",
    false,
    catalogo.roleHasPermission("custom:trainer:x#accounting.read", "accounting.read"),
  );

  /* Il perimetro di sede: Aldo recintato sulla **sede 2**, dove il suo atleta
     non c'e. La categoria e la sede sono in AND (ADR-0103). */
  const conPerimetro = scope("trainer", MISTER_A.id, [{ kind: "site", value: SEDE_2 }]);
  const elenco = await risorse.listResourcePage(
    "athletes",
    new URLSearchParams(),
    conPerimetro,
  );
  const ids = (elenco?.records || []).map((r) => r.id);
  prova(
    "F-06 · recintato sulla sede sbagliata, l'allenatore non vede il proprio atleta",
    false,
    ids.includes(ATLETA_A),
    `ids: ${JSON.stringify(ids)}`,
  );
};

/* ==================================================================== */
/*  G — L'allenamento concluso                                          */
/* ==================================================================== */

const attaccoConcluso = async () => {
  console.log(`${NL}G — l'allenamento concluso`);
  const mister = scope("trainer", MISTER_A.id);

  /* ADR-0112: con una traccia di partecipazione, l'istante e congelato. */
  await respinto(
    "G-01 · spostare la data di un allenamento con l'appello fatto e respinto",
    () =>
      eventi.updateClubEvent(mister, EVENTO_CONCLUSO.id, {
        date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
        time: "20:00",
      }),
    /congelat|non (si )?(puo|pu.)|Accesso negato/i,
  );

  await respinto(
    "G-02 · cambiare la categoria di un allenamento con l'appello fatto e respinto",
    () => eventi.updateClubEvent(mister, EVENTO_CONCLUSO.id, { categories: [CAT_A, CAT_B] }),
    /congelat|non (si )?(puo|pu.)|Accesso negato/i,
  );

  /* Ma il titolo e le note restano correggibili: e il punto di ADR-0112. */
  try {
    const corretto = await eventi.updateClubEvent(mister, EVENTO_CONCLUSO.id, {
      title: "Allenamento concluso A (corretto)",
    });
    prova(
      "G-03 · il titolo di un allenamento concluso resta correggibile",
      "Allenamento concluso A (corretto)",
      corretto?.title || corretto?.payload?.title,
    );
  } catch (errore) {
    prova("G-03 · il titolo di un allenamento concluso resta correggibile", "riuscito", "respinto", String(errore?.message));
  }
};

/* ==================================================================== */

const main = async () => {
  console.log("Sonda di sicurezza PP-03 — allenatore, contro il database vero");
  try {
    await semina();
    await preparaEventi();
    await attaccoPartecipanti();
    await attaccoAtleti();
    await attaccoNote();
    await attaccoColleghi();
    await attaccoCompensi();
    await attaccoRuoloPersonalizzato();
    await attaccoConcluso();
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
    for (const e of falliti) console.log(`  - ${e.titolo}`);
  }
  process.exit(falliti.length ? 1 : 0);
};

main();
