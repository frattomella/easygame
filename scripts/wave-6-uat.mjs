/**
 * **Il collaudo della Wave 6, contro un database vero.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs scripts/wave-6-uat.mjs
 *
 * ---
 *
 * ## Perche esiste, accanto a quattromila test
 *
 * Perche i difetti da cui questa Wave e cominciata **non erano visibili da
 * nessuno dei quattro gate**: 3.966 test verdi, typecheck e lint puliti, build
 * completa — e «Paga ora» era spento **sempre**, la segreteria non poteva
 * confermare un appuntamento, il ruolo `athlete` era modellato end-to-end e
 * irraggiungibile.
 *
 * Sono difetti **fra il clic e la rete**, o dentro una funzione esportata che
 * nessuno chiama. Un test unitario che sostituisce il trasporto non li vede
 * per costruzione: e proprio il trasporto il pezzo rotto.
 *
 * La domanda che ogni prova di questo file si pone non e «il servizio
 * risponde», ma **«una persona ci arriva»**.
 *
 * ## Come ci arriva, tecnicamente
 *
 * Tre livelli, scelti uno per uno in base a **dove** stava il difetto:
 *
 *  1. **i servizi** (`src/lib/server/**`) per cio che vive nel dominio;
 *  2. **i route handler veri**, importati come moduli e invocati con una
 *     `Request` che porta una sessione vera in archivio: e l'unico modo di
 *     provare W6-11, dove il difetto era *l'ordine di due guardie dentro la
 *     rotta* e nessuna funzione di dominio lo conteneva;
 *  3. **il dominio del browser** (`src/lib/simplified-db.ts`) con `fetch`
 *     dirottato sui route handler: la foto profilo (W6-05) si riesumava in un
 *     `??` che sta nel client, e chiamare l'API da sola non lo avrebbe mai
 *     toccato. Qui il collaudo percorre davvero clic → client → rotta → riga.
 *
 * ## L'ambiente
 *
 * Due club veri. Club A: due sedi, tre categorie, due gruppi operativi, una
 * stagione attiva e una archiviata. Club B: mono-sede. Un genitore con **tre
 * figli** — due nel club A in categorie e sedi diverse, uno nel club B — un
 * allenatore con due gruppi, la segreteria, un atleta che ricevera un account,
 * e un tutore **senza riga in `organization_users`**, che e la categoria di
 * persone per cui la ricevuta non si scaricava.
 *
 * Copre U-01…U-24. I ruoli personalizzati stanno in
 * `wave-6-roles-probe.mjs` (U-25…U-30), i confini in
 * `wave-6-security-probe.mjs` (U-31…U-38).
 *
 * ## La regola di questo file
 *
 * **La sonda misura, non corregge.** Dove trova un difetto lo dichiara `FAIL`
 * con il valore osservato accanto, e non tocca una riga del codice di
 * produzione. Dove una prova non puo essere verde per una **scelta deliberata**
 * del prodotto, e `DEVIA`, con il motivo scritto.
 *
 * I due club vengono cancellati in `finally`. E la semina **comincia**
 * cancellando i residui di un'esecuzione interrotta: nella Wave 5 un residuo
 * faceva contare sei figli dove ne aspettava tre.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID, createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("Rifiuto: serve EASYGAME_DB_ENV=development.");
  process.exit(1);
}

const NL = String.fromCharCode(10);
const prisma = new PrismaClient();

/** L'import di un file `.ts` per percorso assoluto: le cartelle `[id]` non sono URL. */
const carica = (rel) => import(pathToFileURL(path.resolve(rel)).href);

/* ----------------------------------------------------------- il verdetto */

const esiti = [];
const deviazioni = [];

const prova = (titolo, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ titolo, ok, atteso, trovato, nota });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(66)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        nota: ${nota}`);
};

/**
 * La deviazione dichiarata: ne un successo ne un difetto.
 *
 * Registrarla come `FAIL` renderebbe questa sonda impossibile da portare a
 * verde, e una sonda che non puo essere verde e una sonda in cui una
 * regressione vera si confonde con il rumore. Registrarla come `PASS`
 * nasconderebbe una scelta che merita di essere riletta.
 */
const devia = (titolo, motivo) => {
  deviazioni.push({ titolo, motivo });
  console.log(`  DEVIA ${titolo.padEnd(66)} scelta dichiarata`);
  console.log(`        ${motivo}`);
};

/** Una chiamata che deve fallire, e **il modo** in cui deve fallire. */
const respinta = async (titolo, azione, atteso = /Accesso negato/) => {
  try {
    await azione();
    prova(titolo, "respinta", "riuscita");
  } catch (errore) {
    const messaggio = String(errore?.message || errore);
    prova(
      titolo,
      "respinta",
      atteso.test(messaggio) ? "respinta" : "respinta-altro",
      messaggio.slice(0, 140),
    );
  }
};

/* ------------------------------------------------------- gli attori ----- */

const CLUB_A = randomUUID();
const CLUB_B = randomUUID();

const SEDE_1 = "sede-uat6-nord";
const SEDE_2 = "sede-uat6-sud";
const CAT_U12 = "cat-uat6-u12";
const CAT_U15 = "cat-uat6-u15";
const CAT_PRIMA = "cat-uat6-prima";
const GRUPPO_1 = `group:${CAT_U12}:${SEDE_1}`;
const GRUPPO_2 = `group:${CAT_U15}:${SEDE_2}`;

const FIGLIO_1 = randomUUID();
const FIGLIO_2 = randomUUID();
const FIGLIO_3 = randomUUID();
const ESTRANEO = randomUUID();
/** Il figlio del tutore senza tessera: e lo scenario W6-11. */
const FIGLIO_TUTELATO = randomUUID();
/** L'atleta che ricevera un account EasyGame (W6-25…W6-27). */
const ATLETA_ACCOUNT = randomUUID();
/**
 * L'atleta su cui si prova la foto profilo.
 *
 * **E separato dai tre figli di proposito.** Salvare una scheda dal dominio
 * del browser riscrive le appartenenze di categoria (vedi U-05), e usare qui
 * uno dei figli avrebbe alterato l'ambiente della prova U-08 sulle
 * appartenenze multiple: due prove che si sporcano a vicenda misurano il
 * proprio ordine di esecuzione, non il prodotto.
 */
const ATLETA_FOTO = randomUUID();

/** Un atleta per stato, piu tre righe con grafie legacy in archivio. */
const PER_STATO = {
  active: randomUUID(),
  suspended: randomUUID(),
  loan: randomUUID(),
  inactive: randomUUID(),
};
const LEGACY = {
  activate: randomUUID(),
  Attivo: randomUUID(),
  "in prestito": randomUUID(),
};

let PRESIDENTE_A = null;
let PRESIDENTE_B = null;
let SEGRETERIA = null;
let GENITORE = null;
let MISTER = null;
let TUTORE = null;

/* I moduli sotto misura. */
let risorse;
let eventi;
let documenti;
let appuntamenti;
let cruscottoFamiglia;
let contiAtleta;
let accessRoles;
let pagamenti;
let registroLavoro;
let lavoroSportivo;
let bandi;
let configFiscale;
let proiezione;

/* --------------------------------------------------------- il trasporto */

/**
 * **Il dirottamento di `fetch` sui route handler veri.**
 *
 * `src/lib/simplified-db.ts` e il dominio che gira **nel browser**: parla con
 * `/api/v1/...` attraverso `src/lib/api/client.ts`. Il difetto W6-05 — la foto
 * che risorgeva — stava in tre `??` di quel file, cioe **prima** della rete:
 * chiamare l'API da sola non lo avrebbe mai eseguito, e chiamare la sola
 * funzione client senza rete non avrebbe mai scritto una riga da rileggere.
 *
 * Qui la rete c'e, ed e vera fino alla riga: la richiesta viene consegnata al
 * route handler di Next importato come modulo, con una sessione **in
 * archivio**. Non c'e nessun finto: c'e solo un cavo piu corto.
 */
let SESSIONE = null;
let CLUB_ATTIVO = null;
let RUOLO_ATTIVO = null;
let rotte = null;

const preparaTrasporto = async () => {
  rotte = {
    elenco: await carica("src/app/api/v1/[resource]/route.ts"),
    riga: await carica("src/app/api/v1/[resource]/[id]/route.ts"),
    documento: await carica("src/app/api/v1/documents/[kind]/[id]/route.ts"),
    bacheca: await carica("src/app/api/parent-dashboard/[athleteId]/board/route.ts"),
  };

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), "http://collaudo.invalid");
    const metodo = String(init.method || "GET").toUpperCase();
    const headers = new Headers(init.headers || {});
    if (SESSIONE) headers.set("authorization", `Bearer ${SESSIONE}`);
    if (CLUB_ATTIVO) headers.set("x-active-club-id", CLUB_ATTIVO);
    if (RUOLO_ATTIVO) headers.set("x-active-access-role", RUOLO_ATTIVO);
    const richiesta = new Request(url.toString(), { ...init, headers });

    const segmenti = url.pathname.replace(/^\/api\/v1\//, "").split("/");

    /* `documents` ha tre segmenti e non e una risorsa del registro generico. */
    if (segmenti[0] === "documents" && segmenti.length === 3) {
      return rotte.documento.GET(richiesta, {
        params: { kind: segmenti[1], id: segmenti[2] },
      });
    }

    if (segmenti.length === 1) {
      const fn = rotte.elenco[metodo];
      if (!fn) throw new Error(`Nessun handler ${metodo} per /${segmenti[0]}`);
      return fn(richiesta, { params: { resource: segmenti[0] } });
    }

    const fn = rotte.riga[metodo];
    if (!fn) throw new Error(`Nessun handler ${metodo} per /${url.pathname}`);
    return fn(richiesta, {
      params: { resource: segmenti[0], id: segmenti[1] },
    });
  };
};

const comeUtente = async (utente, clubId, ruolo) => {
  const auth = await carica("src/lib/server/auth.ts");
  const sessione = await auth.createSessionForUser(utente);
  SESSIONE = sessione.access_token;
  CLUB_ATTIVO = clubId;
  RUOLO_ATTIVO = ruolo;
  return SESSIONE;
};

/* ------------------------------------------------------------- lo scope */

const scope = (organizationId, activeRole, userId) => ({
  userId,
  activeOrganizationId: organizationId,
  activeRole,
  activeMembershipId: null,
  allowedOrganizationIds: [organizationId],
  accessScopes: [],
});

const utente = async (email, nome, cognome = "Collaudo") => {
  const trovato = await prisma.user.findUnique({ where: { email } });
  if (trovato) return trovato;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      first_name: nome,
      last_name: cognome,
      password_hash: "$2b$10$uat6",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const atleta = (id, organizationId, nome, extra = {}) => ({
  id,
  organization_id: organizationId,
  first_name: nome,
  last_name: "Collaudo",
  status: "active",
  data: {},
  updated_at: new Date(),
  ...extra,
});

const tutoreDi = (persona, linked = true) => ({
  guardians: [
    {
      name: `${persona.first_name} ${persona.last_name}`,
      email: persona.email,
      ...(linked ? { linkedUserId: persona.id } : {}),
    },
  ],
});

/* -------------------------------------------------------------- semina */

const semina = async () => {
  await pulisciResidui();

  PRESIDENTE_A = await utente("uat6-presidente-a@example.invalid", "Anna");
  PRESIDENTE_B = await utente("uat6-presidente-b@example.invalid", "Bruno");
  SEGRETERIA = await utente("uat6-segreteria@example.invalid", "Elena");
  GENITORE = await utente("uat6-genitore@example.invalid", "Carla");
  MISTER = await utente("uat6-mister@example.invalid", "Dario");
  TUTORE = await utente("uat6-tutore@example.invalid", "Franca");

  const stagioni = {
    seasons: [
      {
        id: "2025-26",
        label: "2025/26",
        startDate: "2025-07-01",
        endDate: "2026-06-30",
        status: "archived",
      },
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
      id: CLUB_A,
      slug: `uat6-a-${Date.now()}`,
      name: "ASD Collaudo Sei A",
      creator_id: PRESIDENTE_A.id,
      settings: stagioni,
      categories: [
        { id: CAT_U12, name: "Under 12" },
        { id: CAT_U15, name: "Under 15" },
        { id: CAT_PRIMA, name: "Prima squadra" },
      ],
      club_sites: [
        { id: SEDE_1, name: "Sede Nord", active: true },
        { id: SEDE_2, name: "Sede Sud", active: true },
      ],
      category_groups: [
        { id: GRUPPO_1, categoryId: CAT_U12, siteId: SEDE_1 },
        { id: GRUPPO_2, categoryId: CAT_U15, siteId: SEDE_2 },
      ],
      trainers: [
        {
          id: "trainer-uat6",
          first_name: "Dario",
          last_name: "Collaudo",
          email: MISTER.email,
          linkedUserId: MISTER.id,
          categories: [CAT_U12, CAT_U15],
          groups: [GRUPPO_1, GRUPPO_2],
        },
      ],
      staff_members: [],
      structures: [],
      trainings: [],
      matches: [],
      appointments: [],
      opening_hours: [
        { day: "Sabato", open: "09:00", close: "13:00", closed: false },
      ],
      updated_at: new Date(),
    },
  });

  await prisma.club.create({
    data: {
      id: CLUB_B,
      slug: `uat6-b-${Date.now()}`,
      name: "ASD Collaudo Sei B",
      creator_id: PRESIDENTE_B.id,
      settings: stagioni,
      categories: [{ id: CAT_U12, name: "Under 12" }],
      club_sites: [],
      trainers: [],
      trainings: [],
      matches: [],
      appointments: [],
      updated_at: new Date(),
    },
  });

  await prisma.organizationUser.createMany({
    data: [
      {
        id: randomUUID(),
        organization_id: CLUB_A,
        user_id: GENITORE.id,
        role: "parent",
        is_primary: true,
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB_B,
        user_id: GENITORE.id,
        role: "parent",
        is_primary: false,
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB_A,
        user_id: MISTER.id,
        role: "trainer",
        is_primary: true,
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB_A,
        user_id: SEGRETERIA.id,
        role: "staff",
        is_primary: true,
        updated_at: new Date(),
      },
    ],
  });

  /*
    **Il tutore di FIGLIO_TUTELATO non ha nessuna tessera, di proposito.**

    E la categoria di persone che W6-11 riguarda: un club registra un tutore
    scrivendogli nome ed email sulla scheda del minore, e quella persona non
    compare in `organization_users`. Per lei `allowedOrganizationIds` e vuoto,
    `activeOrganizationId` resta nullo, e `assertActiveClub` — che nella rotta
    della ricevuta girava **prima** del ramo del legame — rispondeva «Accesso
    negato» prima che il legame venisse anche solo valutato.
  */

  await prisma.athlete.createMany({
    data: [
      atleta(FIGLIO_1, CLUB_A, "Marco", {
        category_id: CAT_U12,
        category_name: "Under 12",
        data: tutoreDi(GENITORE, true),
      }),
      atleta(FIGLIO_2, CLUB_A, "Luca", {
        category_id: CAT_U15,
        category_name: "Under 15",
        data: tutoreDi(GENITORE, false),
      }),
      atleta(FIGLIO_3, CLUB_B, "Sara", {
        category_id: CAT_U12,
        category_name: "Under 12",
        data: tutoreDi(GENITORE, true),
      }),
      atleta(ESTRANEO, CLUB_A, "Giulia", {
        last_name: "Altrui",
        category_id: CAT_PRIMA,
        category_name: "Prima squadra",
      }),
      atleta(FIGLIO_TUTELATO, CLUB_A, "Nina", {
        /*
          Il legame che sopravvive all'assenza di tessera e `athletes.user_id`:
          e l'unico che `getParentLinkedAthletes` puo riconoscere senza
          passare dai club di appartenenza del tutore.
        */
        user_id: TUTORE.id,
        category_id: CAT_U12,
        category_name: "Under 12",
        data: tutoreDi(TUTORE, true),
      }),
      atleta(ATLETA_ACCOUNT, CLUB_A, "Paolo", {
        category_id: CAT_U15,
        category_name: "Under 15",
      }),
      atleta(ATLETA_FOTO, CLUB_A, "Foto", {
        category_id: CAT_U12,
        category_name: "Under 12",
      }),
      /* Un atleta per stato: e la base delle prove U-01…U-03. */
      atleta(PER_STATO.active, CLUB_A, "Stato-Attivo", {
        status: "active",
        category_id: CAT_PRIMA,
      }),
      atleta(PER_STATO.suspended, CLUB_A, "Stato-Sospeso", {
        status: "suspended",
        category_id: CAT_PRIMA,
      }),
      atleta(PER_STATO.loan, CLUB_A, "Stato-Prestito", {
        status: "loan",
        category_id: CAT_PRIMA,
      }),
      atleta(PER_STATO.inactive, CLUB_A, "Stato-Disattivato", {
        status: "inactive",
        category_id: CAT_PRIMA,
      }),
      /*
        Le tre grafie che l'archivio contiene davvero: `activate` e il nome di
        un'azione finito in una colonna di stato (W6-03), «Attivo» e l'italiano
        di una vecchia schermata, «in prestito» e l'italiano del quarto stato.
      */
      atleta(LEGACY.activate, CLUB_A, "Legacy-Activate", {
        status: "activate",
        category_id: CAT_PRIMA,
      }),
      atleta(LEGACY.Attivo, CLUB_A, "Legacy-Attivo", {
        status: "Attivo",
        category_id: CAT_PRIMA,
      }),
      atleta(LEGACY["in prestito"], CLUB_A, "Legacy-Prestito", {
        status: "in prestito",
        category_id: CAT_PRIMA,
      }),
    ],
  });

  await prisma.athleteCategoryMembership.createMany({
    data: [
      {
        id: randomUUID(),
        organization_id: CLUB_A,
        athlete_id: FIGLIO_1,
        category_id: CAT_U12,
        category_name: "Under 12",
        is_primary: true,
        site_id: SEDE_1,
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB_A,
        athlete_id: FIGLIO_2,
        category_id: CAT_U15,
        category_name: "Under 15",
        is_primary: true,
        site_id: SEDE_2,
        updated_at: new Date(),
      },
      /*
        **La seconda appartenenza di Luca**: si allena con l'Under 15 e gioca
        con la prima squadra. E il caso W6-14, dove il calendario della
        famiglia perdeva meta degli impegni.
      */
      {
        id: randomUUID(),
        organization_id: CLUB_A,
        athlete_id: FIGLIO_2,
        category_id: CAT_PRIMA,
        category_name: "Prima squadra",
        is_primary: false,
        site_id: SEDE_1,
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB_B,
        athlete_id: FIGLIO_3,
        category_id: CAT_U12,
        category_name: "Under 12",
        is_primary: true,
        updated_at: new Date(),
      },
      /* Due appartenenze e una sede, per misurare cosa ne resta dopo un salvataggio. */
      {
        id: randomUUID(),
        organization_id: CLUB_A,
        athlete_id: ATLETA_FOTO,
        category_id: CAT_U12,
        category_name: "Under 12",
        is_primary: true,
        site_id: SEDE_1,
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB_A,
        athlete_id: ATLETA_FOTO,
        category_id: CAT_PRIMA,
        category_name: "Prima squadra",
        is_primary: false,
        site_id: SEDE_2,
        updated_at: new Date(),
      },
    ],
  });

  /* Il catalogo delle causali: senza, W4-R7 non ha niente da classificare. */
  await configFiscale.listOperationTypes(CLUB_A);
};

const pulisciResidui = async () => {
  /*
    **Il collaudo comincia da un archivio pulito, anche se l'esecuzione
    precedente e stata interrotta.**

    Un residuo non e neutrale: il genitore di collaudo si riconosce per
    indirizzo verificato e per `linkedUserId`, quindi i figli di una semina
    rimasta in piedi si sommerebbero a quelli nuovi, e la prova «tre figli»
    ne conterebbe sei. E successo nella Wave 5, ed e il motivo per cui questa
    funzione gira **prima** della semina e non solo dopo il collaudo.
  */
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "uat6-" } },
    select: { id: true },
  });
  const ids = residui.map((riga) => riga.id);
  if (!ids.length) return;

  for (const id of ids) {
    /*
      Gli appuntamenti prima del club: la riprogrammazione crea una riga che
      cita quella che sostituisce, e quella chiave esterna e `NO ACTION` di
      proposito.
    */
    await prisma.appointment.deleteMany({
      where: { organization_id: id, parent_appointment_id: { not: null } },
    });
    await prisma.appointment.deleteMany({ where: { organization_id: id } });
  }
  /* L'audit non ha chiave esterna verso il club: deve sopravvivere a cio che racconta. */
  await prisma.auditLog
    .deleteMany({ where: { organization_id: { in: ids } } })
    .catch(() => {});
  await prisma.club.deleteMany({ where: { id: { in: ids } } });
};

const pulisci = async () => {
  for (const id of [CLUB_A, CLUB_B]) {
    await prisma.appointment.deleteMany({
      where: { organization_id: id, parent_appointment_id: { not: null } },
    });
    await prisma.appointment.deleteMany({ where: { organization_id: id } });
  }
  await prisma.auditLog
    .deleteMany({ where: { organization_id: { in: [CLUB_A, CLUB_B] } } })
    .catch(() => {});
  for (const id of [CLUB_A, CLUB_B]) {
    await prisma.club.delete({ where: { id } }).catch((errore) => {
      console.error(`Pulizia non riuscita, il club ${id} e rimasto: ${errore?.message}`);
    });
  }
};

/* ==================================================================== */
/*  U-01…U-03 — i quattro stati atleta                                  */
/* ==================================================================== */

const u01 = async () => {
  console.log(`${NL}U-01 / U-02 / U-03 — i quattro stati atleta`);
  const stato = await carica("src/lib/athletes/status.ts");
  const scopeA = scope(CLUB_A, "owner", PRESIDENTE_A.id);

  const perStato = async (chiave) => {
    const parametri = new URLSearchParams({ organization_id: CLUB_A });
    if (chiave) parametri.set("status", chiave);
    const pagina = await risorse.listResourcePage("athletes", parametri, scopeA);
    return pagina.records.map((riga) => riga.id);
  };

  /*
    **Esattamente il suo**, e non «almeno il suo»: un filtro che restituisce
    anche gli altri e indistinguibile da un filtro che non ha filtrato, ed e
    la forma con cui W6-02 si manifestava — il flash di tutti gli stati prima
    che il filtro client girasse.

    Gli atleti di stato sono in `cat-uat6-prima` e sono gli unici quattro con
    quello stato, quindi il confronto e su insiemi chiusi.
  */
  for (const chiave of stato.ATHLETE_STATUSES) {
    const trovati = await perStato(chiave);
    const attesi = new Set([PER_STATO[chiave]]);
    /* Le tre righe legacy appartengono a due degli stati: si sommano li. */
    if (chiave === "active") {
      attesi.add(LEGACY.activate);
      attesi.add(LEGACY.Attivo);
      /* Ogni atleta seminato senza stato esplicito nasce `active`. */
      for (const id of [
        FIGLIO_1,
        FIGLIO_2,
        ESTRANEO,
        FIGLIO_TUTELATO,
        ATLETA_ACCOUNT,
        ATLETA_FOTO,
      ]) {
        attesi.add(id);
      }
    }
    if (chiave === "loan") attesi.add(LEGACY["in prestito"]);

    prova(
      `U-01 il filtro «${chiave}» restituisce esattamente il suo insieme`,
      [...attesi].sort(),
      trovati.sort(),
    );
  }

  const tutti = await perStato(null);
  prova(
    "U-01 «tutti» li restituisce tutti",
    13,
    tutti.length,
    "tredici atleti nel club A: sei di scenario, quattro di stato, tre legacy",
  );

  /*
    **Il caso segnalato dal cliente** (W6-01): cambiare filtro piu volte di
    seguito svuotava l'elenco. La causa era una guardia sulla paginazione che
    spegneva la ricarica e faceva girare i filtri successivi in memoria
    sull'array gia filtrato. Qui si cambia filtro **otto volte di seguito**
    sulla stessa sessione, e si guarda che nessun passaggio si svuoti.
  */
  const sequenza = [
    "active",
    "suspended",
    "loan",
    "inactive",
    "active",
    null,
    "suspended",
    "active",
  ];
  const conteggi = [];
  for (const chiave of sequenza) {
    conteggi.push((await perStato(chiave)).length);
  }
  prova(
    "U-02 otto cambi di filtro di seguito, e nessuno svuota l'elenco",
    true,
    conteggi.every((n) => n > 0),
    `conteggi=${conteggi.join(",")}`,
  );
  prova(
    "U-02 lo stesso filtro chiesto due volte da lo stesso numero",
    [conteggi[0], conteggi[0], conteggi[1]],
    [conteggi[4], conteggi[7], conteggi[6]],
    "se il secondo passaggio filtrasse sul residuo del primo, sarebbe minore",
  );

  /*
    U-03. Le grafie che l'archivio contiene: la migrazione corregge cio che
    c'e, il filtro deve trovare anche cio che arrivera.
  */
  const attivi = await perStato("active");
  const prestito = await perStato("loan");
  prova(
    "U-03 «activate» e «Attivo» sono trovati dal filtro «attivi»",
    [true, true],
    [attivi.includes(LEGACY.activate), attivi.includes(LEGACY.Attivo)],
    "W6-03: quegli atleti sparivano da ogni filtro, «Attivi» compreso",
  );
  prova(
    "U-03 «in prestito» e trovato dal filtro «loan»",
    true,
    prestito.includes(LEGACY["in prestito"]),
  );
  prova(
    "U-03 il vocabolario conosce quattro stati, non tre",
    ["active", "suspended", "loan", "inactive"],
    [...stato.ATHLETE_STATUSES],
  );
};

/* ==================================================================== */
/*  U-04 / U-05 — la foto profilo                                       */
/* ==================================================================== */

const FOTO_A = "data:image/png;base64,QUFBQQ==";
const FOTO_B = "data:image/png;base64,QkJCQg==";

const leggiFoto = async (id) => {
  const riga = await prisma.athlete.findUnique({ where: { id } });
  return {
    avatar_url: riga?.avatar_url ?? null,
    "data.avatar": riga?.data?.avatar ?? null,
  };
};

const u04 = async () => {
  console.log(`${NL}U-04 / U-05 — la foto profilo`);
  const db = await carica("src/lib/simplified-db.ts");
  await comeUtente(PRESIDENTE_A, CLUB_A, "owner");

  /*
    Il percorso e quello vero: la funzione del browser, la rotta di Next, la
    riga. Il difetto W6-05 stava nel primo dei tre, e nessuna prova che parta
    dalla rotta lo avrebbe eseguito.
  */
  await db.updateClubAthlete(CLUB_A, ATLETA_FOTO, { avatar: FOTO_A });
  prova(
    "U-04 la foto caricata sta in entrambe le copie",
    { avatar_url: FOTO_A, "data.avatar": FOTO_A },
    await leggiFoto(ATLETA_FOTO),
  );

  await db.updateClubAthlete(CLUB_A, ATLETA_FOTO, { avatar: null });
  prova(
    "U-04 rimossa, e riletta dal database, non c'e piu",
    { avatar_url: null, "data.avatar": null },
    await leggiFoto(ATLETA_FOTO),
    "W6-05: `??` leggeva `null` come «non fornito» e riesumava la foto",
  );

  await db.updateClubAthlete(CLUB_A, ATLETA_FOTO, { avatar: FOTO_A });
  await db.updateClubAthlete(CLUB_A, ATLETA_FOTO, { avatar: FOTO_B });
  prova(
    "U-05 la seconda foto sostituisce la prima",
    { avatar_url: FOTO_B, "data.avatar": FOTO_B },
    await leggiFoto(ATLETA_FOTO),
  );

  await db.updateClubAthlete(CLUB_A, ATLETA_FOTO, { avatar: null });
  prova(
    "U-05 e dopo due caricamenti la rimozione toglie entrambe le copie",
    { avatar_url: null, "data.avatar": null },
    await leggiFoto(ATLETA_FOTO),
  );

  /*
    Il controspecchio: un aggiornamento che **non nomina** la foto non deve
    toglierla. Senza questa prova, un client che azzerasse tutto passerebbe
    per una correzione.
  */
  await db.updateClubAthlete(CLUB_A, ATLETA_FOTO, { avatar: FOTO_A });
  await db.updateClubAthlete(CLUB_A, ATLETA_FOTO, { jerseyNumber: "10" });
  prova(
    "U-05 un aggiornamento che non nomina la foto non la cancella",
    { avatar_url: FOTO_A, "data.avatar": FOTO_A },
    await leggiFoto(ATLETA_FOTO),
  );

  /*
    **E cio che il salvataggio tocca senza che nessuno glielo abbia chiesto.**

    `updateClubAthlete` chiude sempre con `replaceAthleteMemberships`, che
    riscrive le appartenenze **ricostruendole dal payload**. Salvare la foto —
    o il numero di maglia, o qualunque altro campo — passa quindi da li anche
    quando le categorie non sono state nominate. Questa prova misura cosa ne
    resta: e la stessa classe di W6-05, dove un salvataggio parziale
    riscriveva un campo che nessuno aveva dichiarato.
  */
  const appartenenze = await prisma.athleteCategoryMembership.findMany({
    where: { athlete_id: ATLETA_FOTO },
    orderBy: { is_primary: "desc" },
  });
  prova(
    "U-05 salvare la foto non tocca le appartenenze di categoria",
    /*
      Le due appartenenze si confrontano **ordinate**, perche l'ordine con cui
      tornano dal database non e parte di cio che si sta misurando: la domanda
      e se ci sono ancora tutte e due, con le loro sedi.
    */
    [
      { category_id: CAT_PRIMA, site_id: SEDE_2 },
      { category_id: CAT_U12, site_id: SEDE_1 },
    ].sort((a, b) => a.category_id.localeCompare(b.category_id)),
    appartenenze
      .map((riga) => ({ category_id: riga.category_id, site_id: riga.site_id }))
      .sort((a, b) => a.category_id.localeCompare(b.category_id)),
  );

  await db.updateClubAthlete(CLUB_A, ATLETA_FOTO, { avatar: null });
};

/* ==================================================================== */
/*  U-06 / U-07 / U-08 — la famiglia con tre figli                      */
/* ==================================================================== */

const u06 = async () => {
  console.log(`${NL}U-06 / U-07 / U-08 — la famiglia con tre figli`);

  const figli = await cruscottoFamiglia.listParentChildren(GENITORE.id);
  prova(
    "U-06 il genitore sceglie fra tre figli, e li vede prima di sceglierne uno",
    [FIGLIO_1, FIGLIO_2, FIGLIO_3].sort(),
    figli.map((riga) => riga.id).sort(),
    "W6-12: non esisteva nessuna schermata di scelta, l'ingresso portava al primo",
  );
  prova(
    "U-06 l'elenco dice club e categoria, e niente di clinico o economico",
    true,
    figli.every(
      (riga) =>
        riga.clubId &&
        "categoryName" in riga &&
        !("data" in riga) &&
        !("payments" in riga),
    ),
  );

  const collegati = await cruscottoFamiglia.getParentLinkedAthletes(GENITORE.id);
  prova(
    "U-06 il figlio legato solo per email verificata resta raggiungibile",
    true,
    collegati.some((riga) => riga.id === FIGLIO_2),
  );
  prova(
    "U-06 e l'atleta di un'altra famiglia no",
    false,
    await cruscottoFamiglia.canParentAccessAthlete(GENITORE.id, ESTRANEO),
  );

  /* Il figlio scelto governa **tutto**: si semina un fatto per ogni area. */
  const scopeStaff = scope(CLUB_A, "staff", SEGRETERIA.id);
  /*
    Una notifica nomina l'atleta in `data.athleteId`; una notifica che non
    nomina nessuno parla del **club**, e resta visibile su entrambi i figli.
    Nasconderla scegliendo un figlio sarebbe una perdita, non un filtro.
  */
  await prisma.notification.createMany({
    data: [
      {
        id: randomUUID(),
        organization_id: CLUB_A,
        user_id: GENITORE.id,
        title: "Avviso per Marco",
        message: "Riguarda il primo figlio",
        type: "info",
        data: { athleteId: FIGLIO_1 },
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB_A,
        user_id: GENITORE.id,
        title: "Avviso per Luca",
        message: "Riguarda il secondo figlio",
        type: "info",
        data: { athleteId: FIGLIO_2 },
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB_A,
        user_id: GENITORE.id,
        title: "Avviso di club",
        message: "Non nomina nessun figlio",
        type: "info",
        data: {},
        updated_at: new Date(),
      },
    ],
  });

  const perMarco = await cruscottoFamiglia.getParentDashboardData(
    GENITORE.id,
    FIGLIO_1,
  );
  const perLuca = await cruscottoFamiglia.getParentDashboardData(
    GENITORE.id,
    FIGLIO_2,
  );

  prova(
    "U-07 la scheda scelta e quella del figlio scelto",
    [FIGLIO_1, FIGLIO_2],
    [perMarco.athlete.id, perLuca.athlete.id],
  );
  prova(
    "U-07 le notifiche sono del figlio scelto, non della famiglia",
    [
      ["Avviso di club", "Avviso per Marco"],
      ["Avviso di club", "Avviso per Luca"],
    ],
    [
      perMarco.notifications.map((riga) => riga.title).sort(),
      perLuca.notifications.map((riga) => riga.title).sort(),
    ],
    "W6-13: notifiche, bacheca e prenotazioni non erano filtrate per figlio",
  );
  prova(
    "U-07 le prenotazioni di struttura non passano da un figlio all'altro",
    [true, true],
    [
      perMarco.structures.bookings.every(
        (riga) => !riga.athleteId || riga.athleteId === FIGLIO_1,
      ),
      perLuca.structures.bookings.every(
        (riga) => !riga.athleteId || riga.athleteId === FIGLIO_2,
      ),
    ],
  );

  /* La bacheca passa da una rotta a se: si interroga la rotta vera. */
  await comeUtente(GENITORE, CLUB_A, "parent");
  const rispostaBacheca = await rotte.bacheca.GET(
    new Request(`http://collaudo.invalid/api/parent-dashboard/${FIGLIO_1}/board`, {
      headers: {
        authorization: `Bearer ${SESSIONE}`,
        "x-active-club-id": CLUB_A,
      },
    }),
    { params: { athleteId: FIGLIO_1 } },
  );
  prova(
    "U-07 la bacheca del figlio risponde, e risponde per lui",
    200,
    rispostaBacheca.status,
    "W6-13: la bacheca non era filtrata per figlio",
  );

  /* U-08 — appartenenze multiple. */
  const scopeA = scope(CLUB_A, "owner", PRESIDENTE_A.id);
  await eventi.createClubEvent(scopeA, "training", {
    id: "uat6-t-u15",
    date: "2026-09-08",
    time: "18:00",
    endTime: "19:30",
    title: "Allenamento Under 15",
    categoryId: CAT_U15,
    siteId: SEDE_2,
    groupIds: [GRUPPO_2],
  });
  await eventi.createClubEvent(scopeA, "match", {
    id: "uat6-g-prima",
    date: "2026-09-09",
    time: "20:30",
    title: "Gara prima squadra",
    categoryId: CAT_PRIMA,
    siteId: SEDE_1,
    opponent: "Rivali",
  });

  const lucaDopo = await cruscottoFamiglia.getParentDashboardData(
    GENITORE.id,
    FIGLIO_2,
  );
  const suoi = [
    ...lucaDopo.trainings.all.map((riga) => String(riga.id)),
    ...lucaDopo.matches.all.map((riga) => String(riga.id)),
  ];
  prova(
    "U-08 l'atleta in due categorie vede gli impegni di entrambe",
    [true, true],
    [suoi.includes("uat6-t-u15"), suoi.includes("uat6-g-prima")],
    "W6-14: la query famiglia non caricava athlete_category_memberships",
  );

  const marcoDopo = await cruscottoFamiglia.getParentDashboardData(
    GENITORE.id,
    FIGLIO_1,
  );
  const suoiMarco = [
    ...marcoDopo.trainings.all.map((riga) => String(riga.id)),
    ...marcoDopo.matches.all.map((riga) => String(riga.id)),
  ];
  prova(
    "U-08 e il fratello dell'altra categoria non li vede",
    [false, false],
    [suoiMarco.includes("uat6-t-u15"), suoiMarco.includes("uat6-g-prima")],
    "il controspecchio: senza, «vede tutto» passerebbe per «vede entrambe»",
  );

  /* U-09 sta qui perche legge lo stesso payload. */
  prova(
    "U-09 la stagione attiva del club arriva alla famiglia",
    ["2026-27", "2026/27"],
    [marcoDopo.club.activeSeasonId, marcoDopo.club.activeSeasonLabel],
    "W6-09: il contesto famiglia azzerava l'etichetta calcolata dall'AuthProvider",
  );
  prova(
    "U-09 e `settings` non esce nel browser della famiglia",
    false,
    "settings" in marcoDopo.club,
  );

  void scopeStaff;
  return { marcoDopo, lucaDopo };
};

/* ==================================================================== */
/*  U-10 — la rata pagabile                                             */
/* ==================================================================== */

const u10 = async () => {
  console.log(`${NL}U-10 — la rata pagabile`);

  const casi = [
    { titolo: "aperta", riga: { statusKey: "pending", status: "Da incassare", amount: 120 }, atteso: true },
    { titolo: "saldata", riga: { statusKey: "paid", status: "Pagato", amount: 120 }, atteso: false },
    { titolo: "annullata", riga: { statusKey: "cancelled", status: "Annullato", amount: 120 }, atteso: false },
    { titolo: "di importo zero", riga: { statusKey: "pending", status: "Da incassare", amount: 0 }, atteso: false },
  ];

  for (const caso of casi) {
    prova(
      `U-10 la rata ${caso.titolo} ${caso.atteso ? "si paga" : "non si paga"}`,
      caso.atteso,
      pagamenti.isPayableAthletePayment(caso.riga),
    );
  }

  /*
    **Il difetto vero era il vocabolario** (W6-08): la schermata confrontava
    `rata.status` — che e l'etichetta *italiana* — con quattro token inglesi.
    Nessuno poteva mai corrispondere, e «Paga ora» era spento **sempre**, anche
    per una famiglia con tre rate aperte. Qui si prova che il predicato legga
    il campo macchina, e che la scorciatoia sull'etichetta italiana regga.
  */
  prova(
    "U-10 il predicato legge `statusKey`, non l'etichetta italiana",
    true,
    pagamenti.isPayableAthletePayment({
      statusKey: "pending",
      status: "Parzialmente pagato",
      amount: 50,
    }),
  );
  prova(
    "U-10 e su un payload vecchio senza `statusKey` ripiega sull'etichetta",
    [true, false],
    [
      pagamenti.isPayableAthletePayment({ status: "Da incassare", amount: 50 }),
      pagamenti.isPayableAthletePayment({ status: "Pagato", amount: 50 }),
    ],
  );

  /* E la rata deve arrivare alla famiglia con il campo macchina addosso. */
  await prisma.athletePayment.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB_A,
      athlete_id: FIGLIO_1,
      description: "Quota di iscrizione",
      amount: 150,
      due_date: new Date("2026-10-15"),
      status: "pending",
      updated_at: new Date(),
    },
  });
  const cruscotto = await cruscottoFamiglia.getParentDashboardData(
    GENITORE.id,
    FIGLIO_1,
  );
  const pagabili = cruscotto.payments.items.filter(
    pagamenti.isPayableAthletePayment,
  );
  prova(
    "U-10 la famiglia riceve almeno una rata pagabile, con `statusKey`",
    true,
    pagabili.length > 0 && Boolean(pagabili[0].statusKey),
    `pagabili=${pagabili.length} su ${cruscotto.payments.items.length}`,
  );
};

/* ==================================================================== */
/*  U-11 — la ricevuta del tutore senza tessera                         */
/* ==================================================================== */

const u11 = async () => {
  console.log(`${NL}U-11 — la ricevuta scaricabile da un tutore senza tessera`);

  const ricevuta = await prisma.receipt.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB_A,
      athlete_id: FIGLIO_TUTELATO,
      receipt_number: `UAT6-${Date.now()}`,
      issue_date: new Date("2026-09-01"),
      amount: 150,
      data: { payerName: "Franca Collaudo" },
      description: "Quota di iscrizione",
      updated_at: new Date(),
    },
  });

  /*
    **Il tutore non ha nessuna tessera**, ed e il punto: si verifica prima che
    l'archivio dica davvero cio che questa prova presuppone. Una prova che
    passasse perche il tutore *aveva* una tessera non proverebbe niente.
  */
  const tessere = await prisma.organizationUser.count({
    where: { user_id: TUTORE.id },
  });
  prova(
    "U-11 il tutore non ha nessuna riga in organization_users",
    0,
    tessere,
    "e la condizione che rendeva la ricevuta non scaricabile",
  );

  await comeUtente(TUTORE, CLUB_A, null);
  const risposta = await fetch(`/api/v1/documents/receipt/${ricevuta.id}`);
  const corpo = await risposta.text();
  prova(
    "U-11 la ricevuta si scarica, e il documento porta il suo numero",
    [200, true],
    [risposta.status, corpo.includes(ricevuta.receipt_number)],
    "W6-11: `assertActiveClub` girava prima del ramo del legame",
  );

  /*
    Il controspecchio, senza cui un `200` per tutti passerebbe per una
    correzione: la ricevuta di un figlio **non suo** resta chiusa.
  */
  const altrui = await prisma.receipt.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB_A,
      athlete_id: ESTRANEO,
      receipt_number: `UAT6-ALTRUI-${Date.now()}`,
      issue_date: new Date("2026-09-01"),
      amount: 90,
      data: { payerName: "Altra famiglia" },
      description: "Quota",
      updated_at: new Date(),
    },
  });
  const negata = await fetch(`/api/v1/documents/receipt/${altrui.id}`);
  prova(
    "U-11 e la ricevuta di un atleta non suo resta chiusa",
    true,
    negata.status === 403 || negata.status === 404,
    `stato=${negata.status}`,
  );
};

/* ==================================================================== */
/*  U-12 / U-13 — il certificato medico                                 */
/* ==================================================================== */

const u12 = async () => {
  console.log(`${NL}U-12 / U-13 — il certificato medico`);
  const giorni = (n) => new Date(Date.now() + n * 86_400_000);

  const scriviCertificato = async (athleteId, scadenza) =>
    prisma.medicalCertificate.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB_A,
        athlete_id: athleteId,
        type: "competitive",
        issue_date: giorni(-30),
        expiry_date: scadenza,
        status: "valid",
        updated_at: new Date(),
      },
    });

  const statoFamiglia = async (athleteId) => {
    const dati = await cruscottoFamiglia.getParentDashboardData(
      GENITORE.id,
      athleteId,
    );
    return { stato: dati.health.status, scadenza: dati.health.expiryDate };
  };

  /* 1) mancante: nessun certificato. */
  prova(
    "U-12 senza certificato lo stato e «mancante»",
    "missing",
    (await statoFamiglia(FIGLIO_1)).stato,
  );

  /* 2) valido: scadenza lontana. */
  await scriviCertificato(FIGLIO_1, giorni(200));
  prova(
    "U-12 con una scadenza lontana e «valido»",
    "valid",
    (await statoFamiglia(FIGLIO_1)).stato,
  );

  /* 3) scaduto. */
  await prisma.medicalCertificate.deleteMany({ where: { athlete_id: FIGLIO_2 } });
  await scriviCertificato(FIGLIO_2, giorni(-10));
  prova(
    "U-12 con una scadenza passata e «scaduto»",
    "expired",
    (await statoFamiglia(FIGLIO_2)).stato,
  );

  /* 4) in scadenza: dentro la finestra di preavviso del dominio. */
  await prisma.medicalCertificate.deleteMany({ where: { athlete_id: FIGLIO_3 } });
  await prisma.medicalCertificate.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB_B,
      athlete_id: FIGLIO_3,
      type: "competitive",
      issue_date: giorni(-300),
      expiry_date: giorni(10),
      status: "valid",
      updated_at: new Date(),
    },
  });
  prova(
    "U-12 dentro la finestra di preavviso e «in scadenza»",
    "expiring",
    (await statoFamiglia(FIGLIO_3)).stato,
    "W6-16: nell'area famiglia questo stato non esisteva affatto",
  );

  /*
    **U-13 — la data che governa.** L'elenco e ordinato per scadenza
    *crescente*: `certificates[0]` e il piu vecchio, tipicamente gia scaduto.
    La Home accostava «Certificato valido» a quella data. Qui si aggiunge un
    certificato vecchio accanto a uno nuovo e si guarda quale data esce.
  */
  await scriviCertificato(FIGLIO_1, giorni(-400));
  const dopo = await statoFamiglia(FIGLIO_1);
  const atteso = giorni(200).toISOString().slice(0, 10);
  prova(
    "U-13 con due certificati governa il piu recente, non il piu vecchio",
    ["valid", atteso],
    [dopo.stato, String(dopo.scadenza || "").slice(0, 10)],
    "W6-17: la Home accostava «valido» alla scadenza del certificato piu vecchio",
  );
};

/* ==================================================================== */
/*  U-14 / U-15 / U-16 — le tre aree documentali                        */
/* ==================================================================== */

const u14 = async () => {
  console.log(`${NL}U-14 / U-15 / U-16 — i documenti, dalla richiesta all'archivio`);
  const scopeStaff = scope(CLUB_A, "staff", SEGRETERIA.id);

  const richiesta = await documenti.createDocumentRequest(scopeStaff, {
    subjectKind: "athlete",
    subjectId: FIGLIO_1,
    documentKind: "identity_document",
    title: "Documento d'identita del minore",
    required: true,
    dueDate: "2026-10-31",
  });
  const idRichiesta = richiesta.requestId || richiesta.id;

  /*
    **La famiglia legge il fascicolo vero, non l'array JSON dell'anagrafica**
    (W6-37). Prima, una richiesta creata qui dalla segreteria non le arrivava:
    le quattro rotte della Wave 5 erano corrette e nessuno le chiamava.
  */
  const prima = await cruscottoFamiglia.getParentDashboardData(
    GENITORE.id,
    FIGLIO_1,
  );
  const daFare = prima.documents.required.find(
    (voce) => voce.requestId === idRichiesta,
  );
  prova(
    "U-14 la richiesta della segreteria arriva alla famiglia, con la scadenza",
    [true, "2026-10-31"],
    [Boolean(daFare), String(daFare?.dueDate || "").slice(0, 10)],
    "W6-37: la famiglia leggeva solo athletes.data.sharedDocuments",
  );
  prova(
    "U-14 e non compare gia nell'archivio: le due aree non si ripetono",
    false,
    prima.documents.uploaded.some((voce) => voce.requestId === idRichiesta),
    "W6-40: «richieste» e «archivio» erano la stessa lista frullata due volte",
  );

  /* U-15 — la famiglia carica, e la coda del club lo vede. */
  const scopeGenitore = await documenti.resolveLinkedFamilyScope(
    GENITORE.id,
    FIGLIO_1,
  );
  const deposito = await documenti.submitDocument(scopeGenitore, {
    requestId: idRichiesta,
    source: "parent",
    file: {
      fileName: "identita.pdf",
      mimeType: "application/pdf",
      content: Buffer.from("%PDF-1.4 collaudo wave 6"),
    },
  });
  const idDeposito = deposito.submissions?.[0]?.id || deposito.id;

  const coda = await documenti.listDocumentReviewQueue(scopeStaff, {
    organizationId: CLUB_A,
  });
  const inCoda = coda.find((riga) => riga.requestId === idRichiesta);
  prova(
    "U-15 il deposito compare nella coda «da verificare» del club",
    [true, "Marco Collaudo"],
    [Boolean(inCoda), inCoda?.subjectName ?? null],
    "W6-39: listPendingDocumentSubmissions esisteva e zero componenti la chiamavano",
  );
  prova(
    "U-15 la coda porta l'indirizzo del file, non i byte",
    true,
    typeof inCoda?.fileUrl === "string" && inCoda.fileUrl.length > 0,
  );

  /* U-16 — approvazione: sparisce dal «da fare» e compare nell'archivio. */
  await documenti.decideDocumentSubmission(scopeStaff, idDeposito, {
    decision: "approved",
  });

  const dopo = await cruscottoFamiglia.getParentDashboardData(
    GENITORE.id,
    FIGLIO_1,
  );
  prova(
    "U-16 approvato, sparisce dal «da fare» e compare nell'archivio",
    [false, true],
    [
      dopo.documents.required.some((voce) => voce.requestId === idRichiesta),
      dopo.documents.uploaded.some((voce) => voce.requestId === idRichiesta),
    ],
  );

  const codaDopo = await documenti.listDocumentReviewQueue(scopeStaff, {
    organizationId: CLUB_A,
  });
  prova(
    "U-16 e la coda del club non lo chiede piu",
    false,
    codaDopo.some(
      (riga) => riga.requestId === idRichiesta && riga.state === "under_review",
    ),
  );

  await respinta(
    "U-16 un allenatore non decide su un documento",
    () =>
      documenti.decideDocumentSubmission(
        scope(CLUB_A, "trainer", MISTER.id),
        idDeposito,
        { decision: "rejected" },
      ),
  );
};

/* ==================================================================== */
/*  U-17 / U-18 / U-19 — l'appuntamento                                 */
/* ==================================================================== */

const u17 = async () => {
  console.log(`${NL}U-17 / U-18 / U-19 — l'appuntamento, dallo slot alla chiusura`);
  const scopeStaff = scope(CLUB_A, "staff", SEGRETERIA.id);

  /*
    Gli slot si configurano **dal servizio che la UI nuova chiama** (W6-53):
    fino alla Wave 6 quattro rotte e quattro funzioni di dominio non avevano
    nessuna superficie, e ogni club era in configurazione «ripiego» sugli
    orari di apertura senza saperlo.
  */
  const slot = await appuntamenti.createAppointmentSlot(
    scopeStaff,
    {
      siteId: SEDE_1,
      weekday: 3,
      startTime: "15:00",
      endTime: "18:00",
      durationMinutes: 30,
    },
    { userId: SEGRETERIA.id },
  );
  prova("U-17 lo slot e configurato e appartiene al club", CLUB_A, slot.organization_id);
  prova(
    "U-17 e la capienza non e piu un campo dello slot",
    false,
    "capacity" in slot,
    "W6-56: `capacity` era inerte con 1 e bugiarda con valori maggiori",
  );

  const configurati = await appuntamenti.listAppointmentSlots(scopeStaff);
  prova(
    "U-17 la segreteria rilegge la disponibilita che ha configurato",
    true,
    configurati.some((riga) => riga.id === slot.id),
  );

  const contesto = await appuntamenti.resolveFamilyAppointmentContext(
    GENITORE.id,
    FIGLIO_1,
  );
  const liberi = await appuntamenti.listFamilyFreeSlots(contesto, {
    from: "2026-09-07",
    to: "2026-09-21",
    now: new Date("2026-09-02T08:00:00.000Z"),
  });
  prova(
    "U-17 la famiglia sceglie fra gli slot liberi, e la fonte e dichiarata",
    true,
    liberi.length > 0 && liberi.some((riga) => riga.source === "slot"),
    `slot=${liberi.length} fonti=${[...new Set(liberi.map((r) => r.source))].join(",")}`,
  );
  /*
    W6-57: gli slot uscivano **con lo spread**, cioe con l'identificativo
    interno dell'operatore e con il contatore di quante altre famiglie hanno
    gia prenotato quell'ora.

    La misura si prende **dove la famiglia guarda** — il payload dell'area
    genitore, che e la stessa proiezione della rotta degli appuntamenti — e non
    sulla funzione di dominio: quella restituisce il modello intero di
    proposito, ed e la proiezione a dichiarare cosa puo uscire. Misurarla sul
    dominio direbbe «difetto» dove c'e una separazione voluta.
  */
  const versoLaFamiglia = await cruscottoFamiglia.getParentDashboardData(
    GENITORE.id,
    FIGLIO_1,
  );
  const offerti = versoLaFamiglia.appointments.availableSlots;
  prova(
    "U-17 e cio che arriva alla famiglia non porta identificativi interni",
    [true, false, false, false],
    [
      offerti.length > 0,
      offerti.some((riga) => "assignedToUserId" in riga),
      offerti.some((riga) => "capacity" in riga),
      offerti.some((riga) => "taken" in riga),
    ],
    `slot offerti=${offerti.length}`,
  );

  const scelto = liberi.find((riga) => riga.source === "slot") || liberi[0];
  const richiesta = await appuntamenti.requestFamilyAppointment(contesto, {
    startsAt: scelto.startsAt,
    reason: "Colloquio con la segreteria",
    slotId: scelto.slotId ?? null,
  });
  const idAppuntamento = richiesta.id || richiesta.appointment?.id;
  prova(
    "U-18 la richiesta della famiglia nasce «richiesta»",
    "requested",
    (await prisma.appointment.findUnique({ where: { id: idAppuntamento } }))?.status,
  );

  await appuntamenti.confirmAppointment(scopeStaff, idAppuntamento, {}, {
    userId: SEGRETERIA.id,
  });
  prova(
    "U-18 la segreteria conferma, e lo stato lo dice",
    "confirmed",
    (await prisma.appointment.findUnique({ where: { id: idAppuntamento } }))?.status,
    "W6-51: la schermata confrontava nomi di azione con nomi di stato: sempre falsi",
  );

  const riprogrammato = await appuntamenti.rescheduleAppointment(
    scopeStaff,
    idAppuntamento,
    {
      startsAt: new Date("2026-09-16T14:30:00.000Z"),
      reason: "Colloquio con la segreteria",
      outsideAvailability: true,
    },
    { userId: SEGRETERIA.id },
  );
  const nuovoId = riprogrammato.created?.id;
  prova(
    "U-19 la riprogrammazione crea una riga e chiude la vecchia",
    ["rescheduled", idAppuntamento],
    [
      (await prisma.appointment.findUnique({ where: { id: idAppuntamento } }))?.status,
      (await prisma.appointment.findUnique({ where: { id: nuovoId } }))
        ?.parent_appointment_id ?? null,
    ],
  );

  /*
    La riga nata dalla riprogrammazione nasce «richiesta»: e la regola del
    dominio, perche spostare un appuntamento e proporre un orario nuovo, non
    imporlo. Si conferma, e solo allora si chiude.
  */
  await appuntamenti.confirmAppointment(scopeStaff, nuovoId, {}, {
    userId: SEGRETERIA.id,
  });
  await appuntamenti.closeAppointment(scopeStaff, nuovoId, "completed", {}, {
    userId: SEGRETERIA.id,
  });
  prova(
    "U-19 e la segreteria puo chiuderlo «completato»",
    "completed",
    (await prisma.appointment.findUnique({ where: { id: nuovoId } }))?.status,
    "W6-52: la rotta esisteva e il client no",
  );

  const notifiche = await prisma.notification.count({
    where: { organization_id: CLUB_A, user_id: GENITORE.id },
  });
  prova(
    "U-19 la famiglia riceve notizia di cio che le succede",
    true,
    notifiche > 1,
    `notifiche=${notifiche}`,
  );
};

/* ==================================================================== */
/*  U-20 / U-21 / U-22 — l'account atleta                               */
/* ==================================================================== */

const u20 = async () => {
  console.log(`${NL}U-20 / U-21 / U-22 — l'account dell'atleta`);
  const scopeStaff = {
    ...scope(CLUB_A, "club_manager", PRESIDENTE_A.id),
    actorEmail: PRESIDENTE_A.email,
  };
  const auth = await carica("src/lib/server/auth.ts");

  const stato0 = await contiAtleta.readAthleteAccountState(
    scopeStaff,
    ATLETA_ACCOUNT,
  );
  prova("U-20 l'atleta parte senza accesso", "none", stato0.status);

  const invito = await contiAtleta.sendAthleteAccountInvite(scopeStaff, {
    athleteId: ATLETA_ACCOUNT,
    email: "uat6-atleta@example.invalid",
  });
  const stato1 = await contiAtleta.readAthleteAccountState(
    scopeStaff,
    ATLETA_ACCOUNT,
  );
  prova(
    "U-20 l'invito parte, e lo stato diventa «invitato»",
    ["invited", true],
    [stato1.status, Boolean(invito.inviteId)],
    "W6-26: «Invia credenziali» mostrava solo un errore, in tre schede",
  );
  prova(
    "U-20 e il token non esce da nessuna risposta",
    false,
    JSON.stringify(invito).toLowerCase().includes("token"),
  );

  /*
    **Il token in chiaro non esiste fuori dall'email**, ed e il punto del
    dominio. Per riscattarlo il collaudo fa cio che fa il test di dominio: si
    sceglie un token noto e se ne scrive l'impronta sulla riga. Non e un
    aggiramento della difesa — l'impronta e la stessa funzione — e l'unico
    modo onesto di provare il riscatto senza far uscire il token da dove non
    deve uscire.
  */
  const token = randomBytes(32).toString("hex");
  await prisma.athleteAccountInvite.update({
    where: { id: invito.inviteId },
    data: {
      token_hash: createHash("sha256").update(token).digest("hex"),
    },
  });

  const accettato = await contiAtleta.acceptAthleteAccountInvite(token);
  prova(
    "U-21 l'accettazione scrive il legame verso l'atleta",
    [ATLETA_ACCOUNT, CLUB_A],
    [accettato.athleteId, accettato.organizationId],
    "W6-25: nessun percorso scriveva athletes.user_id: lo slegava, non lo legava mai",
  );

  const riga = await prisma.athlete.findUnique({ where: { id: ATLETA_ACCOUNT } });
  const scopeAtleta = await auth.resolveOrganizationScopeForUser(riga.user_id);
  prova(
    "U-21 il ruolo `athlete` e raggiungibile: la sessione lo risolve davvero",
    ["athlete", CLUB_A],
    [scopeAtleta.activeRole, scopeAtleta.activeOrganizationId],
  );
  prova(
    "U-21 e la sua area gli e aperta, mentre la gestione no",
    [true, false],
    [
      accessRoles.canAccessPath("athlete", "/athlete-dashboard"),
      accessRoles.canAccessPath("athlete", "/athletes"),
    ],
  );

  const panoramica = await contiAtleta.readAthleteAreaOverview(riga.user_id);
  prova(
    "U-21 e la sua area risponde con la sua scheda",
    [ATLETA_ACCOUNT, CLUB_A],
    [panoramica?.me?.id ?? null, panoramica?.club?.id ?? null],
  );
  /*
    La stagione arriva anche qui? L'area atleta proietta `club.seasonId` e
    `club.seasonLabel` da `getParentDashboardData`, che i due campi li chiama
    `activeSeasonId` e `activeSeasonLabel` (vedi U-09). E la stessa forma di
    difetto di W6-09: due nomi per lo stesso dato, e uno dei due schermi resta
    vuoto.
  */
  prova(
    "U-21 e la stagione attiva arriva anche all'area atleta",
    "2026/27",
    panoramica?.club?.seasonLabel ?? null,
  );

  await contiAtleta.revokeAthleteAccess(scopeStaff, {
    athleteId: ATLETA_ACCOUNT,
    reason: "Collaudo",
  });
  const dopoRevoca = await prisma.athlete.findUnique({
    where: { id: ATLETA_ACCOUNT },
  });
  const scopeDopo = await auth.resolveOrganizationScopeForUser(riga.user_id);
  prova(
    "U-22 la revoca toglie il legame e la tessera",
    [null, null],
    [dopoRevoca.user_id, scopeDopo.activeRole],
  );
  prova(
    "U-22 e lo stato torna «nessun accesso»",
    "none",
    (await contiAtleta.readAthleteAccountState(scopeStaff, ATLETA_ACCOUNT)).status,
  );
};

/* ==================================================================== */
/*  U-23 — il perimetro dell'allenatore                                 */
/* ==================================================================== */

const u23 = async () => {
  console.log(`${NL}U-23 — il perimetro dell'allenatore`);
  const scopeA = scope(CLUB_A, "owner", PRESIDENTE_A.id);
  const scopeMister = scope(CLUB_A, "trainer", MISTER.id);

  /* Un evento della prima squadra: fuori dai due gruppi del mister. */
  const fuori = await eventi.createClubEvent(scopeA, "training", {
    id: "uat6-t-fuori",
    date: "2026-09-10",
    time: "19:00",
    title: "Allenamento prima squadra",
    categoryId: CAT_PRIMA,
    siteId: SEDE_1,
  });
  const idFuori = fuori.id || fuori.event?.id;

  const suoi = await eventi.listClubEvents(scopeMister);
  prova(
    "U-23 l'elenco dell'allenatore non contiene l'evento fuori perimetro",
    false,
    suoi.some((riga) => riga.id === idFuori || riga.legacy_id === "uat6-t-fuori"),
  );

  const primaAudit = await prisma.auditLog.count({
    where: { organization_id: CLUB_A, outcome: "denied" },
  });

  await respinta(
    "U-23 un atto su un evento fuori dal proprio gruppo e respinto",
    () =>
      eventi.updateClubEvent(scopeMister, idFuori, {
        title: "Rinominato dall'allenatore",
      }),
  );

  const dopoAudit = await prisma.auditLog.count({
    where: { organization_id: CLUB_A, outcome: "denied" },
  });
  prova(
    "U-23 e il diniego lascia una riga di audit",
    true,
    dopoAudit > primaAudit,
    `dinieghi prima=${primaAudit} dopo=${dopoAudit}`,
  );

  /*
    Il controspecchio: dentro il proprio gruppo l'allenatore **riesce**. Senza,
    un `403` per tutto passerebbe per un perimetro.
  */
  const dentro = await eventi.listClubEvents(scopeMister, { categoryId: CAT_U15 });
  prova(
    "U-23 e dentro il proprio gruppo continua a vedere e a operare",
    true,
    dentro.length > 0,
    `eventi nel perimetro=${dentro.length}`,
  );
};

/* ==================================================================== */
/*  U-24 — W4-R7: la causale del denaro che esce                        */
/* ==================================================================== */

const u24 = async () => {
  console.log(`${NL}U-24 — W4-R7, il denaro che esce con la sua causale`);
  const scopeLavoro = {
    userId: PRESIDENTE_A.id,
    activeOrganizationId: CLUB_A,
    activeRole: "owner",
    allowedOrganizationIds: [CLUB_A],
  };

  const persona = await lavoroSportivo.createSportWorkPerson(
    {
      organizationId: CLUB_A,
      firstName: "Dario",
      lastName: "Compenso",
      socialCoverage: "NONE",
    },
    scopeLavoro,
  );
  const rapporto = await lavoroSportivo.createRelationship(
    {
      personId: persona.id,
      relationshipType: "AMATEUR_SPORT_WORKER",
      role: "Allenatore",
      startDate: "2026-07-01",
      contractAmount: 3000,
    },
    scopeLavoro,
  );
  /*
    Il rapporto nasce in bozza e l'attivazione e un atto a se, con le sue
    verifiche: qui interessa la **causale del movimento**, non il percorso di
    attivazione, che ha il suo collaudo nella Wave 4. Si attiva la riga.
  */
  await prisma.sportWorkRelationship.update({
    where: { id: rapporto.id },
    data: { status: "ACTIVE" },
  });

  const esito = await registroLavoro.recordCompensationPayout(
    {
      relationshipId: rapporto.id,
      amount: 500,
      paidAt: new Date("2026-09-01"),
      acknowledgeWarnings: true,
      idempotencyKey: `uat6-compenso-${Date.now()}`,
    },
    scopeLavoro,
  );

  prova(
    "U-24 il compenso esce dal registro con la sua causale",
    ["compenso_sportivo", true],
    [
      esito.transaction.operation_type_code,
      Boolean(esito.transaction.operation_type_label_snapshot),
    ],
    "W4-R7: la vista proiettava NULL e 'unspecified' scritti nel SQL",
  );

  /*
    **L'etichetta e quella congelata.** La causale e configurazione mutabile:
    se il club la rinomina domani, i movimenti di ieri devono continuare a
    dire cio che dicevano. Qui la si rinomina e si rilegge la proiezione.
  */
  const etichettaOriginale = esito.transaction.operation_type_label_snapshot;
  await prisma.fiscalOperationType.updateMany({
    where: { organization_id: CLUB_A, code: "compenso_sportivo" },
    data: { label: "RINOMINATA DAL CLUB" },
  });

  const righe = await prisma.sportWorkOutboundTransaction.findMany({
    where: { organization_id: CLUB_A },
  });
  const proiettate = proiezione.projectSportWorkPayouts(righe);
  prova(
    "U-24 e l'etichetta proiettata e quella congelata, non quella corrente",
    etichettaOriginale,
    proiettate[0]?.operationTypeLabel ?? null,
  );

  /* La liquidazione di un bando: l'altra strada con cui il denaro esce. */
  const programma = await bandi.createFundingProgram(
    {
      organizationId: CLUB_A,
      name: "Bando di collaudo",
      funderName: "Comune di Collaudo",
      status: "active",
      validFrom: "2026-07-01",
      validTo: "2027-06-30",
      athletePlafond: 1000,
      periodAmount: 100,
      periodFrequency: "monthly",
      requirementUnit: "hours",
      requirementMin: 1,
      unmetBehavior: "none",
    },
    scopeLavoro,
  );

  /*
    Una liquidazione dice **a quali periodi** si riferisce: senza, il credito
    verso l'ente si chiuderebbe senza che nessuna riga sappia di essere stata
    pagata. Il maturato si semina direttamente, perche cio che questa prova
    misura e la causale del movimento, non il motore dei maturati — quello ha
    il suo collaudo nella Wave 4.
  */
  const iscrizione = await prisma.fundingEnrollment.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB_A,
      program_id: programma.id,
      athlete_id: FIGLIO_1,
      assigned_amount: 500,
      status: "active",
      enrolled_at: new Date("2026-07-01"),
      updated_at: new Date(),
    },
  });
  const maturato = await prisma.fundingAccrual.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB_A,
      enrollment_id: iscrizione.id,
      period_index: 1,
      period_start: new Date("2026-07-01"),
      period_end: new Date("2026-07-31"),
      period_label: "Luglio 2026",
      requirement_min: 1,
      requirement_unit: "hours",
      measured_value: 10,
      requirement_met: true,
      eligible_amount: 250,
      accrued_amount: 250,
      status: "accrued",
      accrual_origin: "manual_confirmation",
      computed_at: new Date(),
      updated_at: new Date(),
    },
  });

  const liquidazione = await bandi.createFundingSettlement(
    {
      programId: programma.id,
      amount: 250,
      settledAt: new Date("2026-09-01"),
      reference: "Bonifico di collaudo",
      lines: [{ accrualId: maturato.id, amount: 250 }],
    },
    scopeLavoro,
  );

  const rigaLiquidazione =
    liquidazione?.settlement || liquidazione?.row || liquidazione;
  prova(
    "U-24 anche la liquidazione di un bando porta la sua causale",
    ["liquidazione_contributo", true],
    [
      rigaLiquidazione?.operation_type_code ?? null,
      Boolean(rigaLiquidazione?.operation_type_label_snapshot),
    ],
  );

  /*
    E la difesa che rende la causale un dato e non un'etichetta: una causale
    **in entrata** su un movimento in uscita falserebbe il rendiconto in due
    punti, e il difetto sopravvivrebbe silenzioso fino al primo bilancio.
  */
  const secondoMaturato = await prisma.fundingAccrual.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB_A,
      enrollment_id: iscrizione.id,
      period_index: 2,
      period_start: new Date("2026-08-01"),
      period_end: new Date("2026-08-31"),
      period_label: "Agosto 2026",
      requirement_min: 1,
      requirement_unit: "hours",
      measured_value: 10,
      requirement_met: true,
      eligible_amount: 10,
      accrued_amount: 10,
      status: "accrued",
      accrual_origin: "manual_confirmation",
      computed_at: new Date(),
      updated_at: new Date(),
    },
  });

  /*
    **Questo controllo aspettava il difetto, e va detto.**

    Chiedeva che una causale **in entrata** su una liquidazione fosse
    rifiutata, e passava — perche la liquidazione era classificata come
    un'uscita. Ma una liquidazione e denaro che **arriva** dall'ente: lo dicono
    lo schema, la proiezione del registro e la vista SQL, tutti e tre leggendo
    il segno dell'importo. La sonda misurava quindi la coerenza fra due errori.

    L'invariante vera e simmetrica: **una causale che contraddice il verso del
    fatto viene rifiutata**, nei due sensi. Si prova cosi.
  */
  await respinta(
    "U-24 una causale in uscita su una liquidazione viene rifiutata",
    () =>
      bandi.createFundingSettlement(
        {
          programId: programma.id,
          amount: 10,
          settledAt: new Date("2026-09-01"),
          operationTypeCode: "compenso_sportivo",
          lines: [{ accrualId: secondoMaturato.id, amount: 10 }],
        },
        scopeLavoro,
      ),
    /uscite|in uscita/i,
  );
};

/* ------------------------------------------------------------- il giro */

try {
  risorse = await carica("src/lib/server/resources.ts");
  eventi = await carica("src/lib/server/events.ts");
  documenti = await carica("src/lib/server/document-requests.ts");
  appuntamenti = await carica("src/lib/server/appointments.ts");
  cruscottoFamiglia = await carica("src/lib/server/parent-dashboard.ts");
  contiAtleta = await carica("src/lib/server/athlete-accounts.ts");
  accessRoles = await carica("src/lib/access-roles.ts");
  pagamenti = await carica("src/lib/athlete-payment-utils.ts");
  registroLavoro = await carica("src/lib/server/sport-work-ledger.ts");
  lavoroSportivo = await carica("src/lib/server/sport-work.ts");
  bandi = await carica("src/lib/server/funding.ts");
  configFiscale = await carica("src/lib/server/fiscal-config.ts");
  proiezione = await carica("src/lib/accounting/projection.ts");

  await preparaTrasporto();

  console.log(`${NL}Semina dei due club di collaudo ${CLUB_A} / ${CLUB_B}...`);
  await semina();

  await u01();
  await u04();
  await u06();
  await u10();
  await u11();
  await u12();
  await u14();
  await u17();
  await u20();
  await u23();
  await u24();

  const falliti = esiti.filter((e) => !e.ok);
  if (deviazioni.length) {
    console.log(
      `${NL}${deviazioni.length} deviazioni dichiarate (non sono ne successi ne difetti):`,
    );
    for (const d of deviazioni) console.log(`  - ${d.titolo.trim()}`);
  }
  console.log(
    `${NL}${esiti.length - falliti.length}/${esiti.length} controlli passati.`,
  );
  if (falliti.length) {
    console.log(`${NL}FALLITI:`);
    for (const e of falliti) {
      console.log(
        `  ${e.titolo.trim()}${NL}    atteso  ${JSON.stringify(e.atteso)}${NL}    trovato ${JSON.stringify(e.trovato)}${e.nota ? `${NL}    nota    ${e.nota}` : ""}`,
      );
    }
    process.exitCode = 1;
  }
} catch (errore) {
  console.error(
    `${NL}Collaudo interrotto:${NL}${String(errore?.stack || errore?.message)
      .split(NL)
      .slice(0, 30)
      .join(NL)}`,
  );
  process.exitCode = 1;
} finally {
  await pulisci();
  await prisma.$disconnect();
}
