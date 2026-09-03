/**
 * **Il collaudo di PP-01, contro un database vero.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs scripts/pp-01-uat.mjs
 *
 * ---
 *
 * ## Perche esiste, accanto a quattromilacinquecento test
 *
 * Perche i difetti da cui PP-01 e cominciato erano **tutti invisibili ai
 * quattro gate**: 4.583 test verdi, typecheck e lint puliti, build completa — e
 * un allenamento di tre categorie ne mostrava una, un allenamento concluso non
 * si poteva correggere, la conferma di un conflitto non usciva dal browser, e
 * l'elenco atleti stampava «In Prestito» sui disattivati.
 *
 * Alcuni di quei difetti erano gia stati «chiusi» dalla Wave 6, con le loro
 * sonde verdi. Non era falso: le sonde misuravano il **dominio**, e il dominio
 * era giusto. Il difetto stava fra il dominio e la persona — in un'etichetta
 * JSX, in una conferma che non veniva spedita, in una funzione che tornava al
 * primo riscontro.
 *
 * La domanda che ogni prova di questo file si pone e percio la stessa della
 * sonda della Wave 6, e vale la pena riscriverla: non «il servizio risponde»,
 * ma **«cio che la persona vede e cio che c'e in archivio»**.
 *
 * ## L'ambiente
 *
 * Un club, tre categorie su due sedi, un allenatore della **sola seconda**
 * categoria, quattro atleti — uno per stato — e una struttura con **due campi**,
 * che e la configurazione su cui il difetto del conflitto si vedeva. Il club
 * viene cancellato in `finally`, e la semina **comincia** cancellando i residui
 * di un'esecuzione interrotta.
 *
 * ## La regola di questo file
 *
 * **La sonda misura, non corregge.** Dove trova un difetto lo dichiara `FAIL`
 * con il valore osservato accanto, e non tocca una riga del codice di
 * produzione.
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

/** L'import di un file `.ts` per percorso assoluto: le cartelle `[id]` non sono URL. */
const carica = (rel) => import(pathToFileURL(path.resolve(rel)).href);

/* ----------------------------------------------------------- il verdetto */

const esiti = [];

const prova = (titolo, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ titolo, ok });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(72)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        nota: ${nota}`);
};

/** Una chiamata che deve fallire, e **il modo** in cui deve fallire. */
const respinta = async (titolo, azione, atteso) => {
  try {
    await azione();
    prova(titolo, "respinta", "riuscita");
  } catch (errore) {
    const messaggio = String(errore?.message || errore);
    prova(
      titolo,
      "respinta",
      atteso.test(messaggio) ? "respinta" : "respinta-altro",
      messaggio.slice(0, 200),
    );
  }
};

/* ------------------------------------------------------- gli attori ----- */

const CLUB = randomUUID();
const SEDE_1 = "sede-pp01-nord";
const SEDE_2 = "sede-pp01-sud";
const CAT_A = "cat-pp01-a";
const CAT_B = "cat-pp01-b";
const CAT_C = "cat-pp01-c";
const GRUPPO_A = `group:${CAT_A}:${SEDE_1}`;
const STRUTTURA = "struttura-pp01";
const CAMPO_1 = "campo-pp01-uno";
const CAMPO_2 = "campo-pp01-due";

const ATLETI = {
  active: randomUUID(),
  suspended: randomUUID(),
  loan: randomUUID(),
  inactive: randomUUID(),
};

let PRESIDENTE = null;
let MISTER = null;

let eventi;
let risorse;

const scope = (activeRole, userId, accessScopes = []) => ({
  userId,
  activeOrganizationId: CLUB,
  activeRole,
  activeMembershipId: null,
  allowedOrganizationIds: [CLUB],
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
      password_hash: "$2b$10$pp01",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

/* --------------------------------------------------------- il trasporto */

/**
 * **Il dirottamento di `fetch` sui route handler veri.**
 *
 * `src/lib/simplified-db.ts` e il dominio che gira **nel browser**: parla con
 * `/api/v1/...` attraverso `src/lib/api/client.ts`. Il difetto della foto che
 * risorgeva stava **prima** della rete, dentro quel file: chiamare l'API da
 * sola non lo avrebbe mai eseguito, e chiamare la sola funzione client senza
 * rete non avrebbe mai scritto una riga da rileggere.
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

const pulisciResidui = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp01-" } },
    select: { id: true },
  });
  const ids = residui.map((riga) => riga.id);
  if (!ids.length) return;
  await prisma.auditLog
    .deleteMany({ where: { organization_id: { in: ids } } })
    .catch(() => {});
  await prisma.club.deleteMany({ where: { id: { in: ids } } });
};

const semina = async () => {
  await pulisciResidui();

  PRESIDENTE = await utente("pp01-presidente@example.invalid", "Anna");
  MISTER = await utente("pp01-mister@example.invalid", "Dario");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `pp01-${Date.now()}`,
      name: "ASD Collaudo PP-01",
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
        { id: CAT_C, name: "Prima squadra" },
      ],
      club_sites: [
        { id: SEDE_1, name: "Sede Nord", active: true },
        { id: SEDE_2, name: "Sede Sud", active: true },
      ],
      category_groups: [{ id: GRUPPO_A, categoryId: CAT_A, siteId: SEDE_1 }],
      /*
        Una struttura con **due campi**: e la configurazione su cui il difetto
        del conflitto si vedeva — il client confrontava il campo, il server
        ricadeva sulla struttura, e i due non davano mai la stessa risposta.
      */
      structures: [
        {
          id: STRUTTURA,
          name: "Palazzetto",
          siteId: SEDE_1,
          fields: [
            { id: CAMPO_1, name: "Campo 1" },
            { id: CAMPO_2, name: "Campo 2" },
          ],
        },
      ],
      trainers: [
        {
          id: "trainer-pp01",
          first_name: "Dario",
          last_name: "Collaudo",
          email: MISTER.email,
          linkedUserId: MISTER.id,
          /* **Solo la categoria B**: e la seconda categoria dell'allenamento. */
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

  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: MISTER.id,
      role: "trainer",
      is_primary: true,
      updated_at: new Date(),
    },
  });

  await prisma.athlete.createMany({
    data: Object.entries(ATLETI).map(([stato, id]) => ({
      id,
      organization_id: CLUB,
      first_name: `Stato-${stato}`,
      last_name: "Collaudo",
      status: stato,
      category_id: CAT_A,
      category_name: "Under 12",
      data: {},
      updated_at: new Date(),
    })),
  });

  eventi = await carica("src/lib/server/events.ts");
  risorse = await carica("src/lib/server/resources.ts");
  await preparaTrasporto();
};

const pulisci = async () => {
  await prisma.auditLog
    .deleteMany({ where: { organization_id: CLUB } })
    .catch(() => {});
  /*
    `deleteMany` e non `delete`: la pulizia gira nel `finally` e di nuovo nel
    ramo d'errore, e la seconda volta non deve lamentarsi che il club non c'e
    piu — cio che conta e che non ci sia.
  */
  const tolti = await prisma.club
    .deleteMany({ where: { id: CLUB } })
    .catch((errore) => {
      console.error(`Pulizia non riuscita: ${errore?.message}`);
      return { count: -1 };
    });
  if (tolti.count === -1) {
    console.error(`Il club ${CLUB} e rimasto in archivio.`);
  }
};

/* ==================================================================== */
/*  P-01…P-08 — §A, le tre categorie che diventavano una                */
/* ==================================================================== */

let EVENTO_TRE = null;

const pA = async () => {
  console.log(`${NL}P-01…P-08 — §A · un allenamento di tre categorie`);
  const owner = scope("owner", PRESIDENTE.id);
  const modello = await carica("src/lib/events/model.ts");
  const utils = await carica("src/lib/training-utils.ts");

  const riga = await eventi.createClubEvent(owner, "training", {
    id: `pp01-tre-${Date.now()}`,
    title: "Allenamento congiunto",
    date: "2026-09-10",
    time: "18:00",
    endTime: "19:30",
    categories: [CAT_A, CAT_B, CAT_C],
    categoryId: CAT_A,
    category: "Under 12, Under 15, Prima squadra",
    structureId: STRUTTURA,
    fieldId: CAMPO_1,
    siteId: SEDE_1,
  });
  EVENTO_TRE = riga.id;

  prova(
    "P-01 la riga porta tutte e tre le categorie, la primaria per prima",
    [CAT_A, CAT_B, CAT_C],
    riga.category_ids,
  );

  /* Il fatto centrale: si conclude, si rilegge dall'archivio, e sono ancora tre. */
  await eventi.updateClubEvent(owner, EVENTO_TRE, { status: "completed" });
  const riletta = await prisma.clubEvent.findUnique({
    where: { id: EVENTO_TRE },
  });

  prova(
    "P-02 concluso e riletto dal database, sono ancora tre",
    ["completed", [CAT_A, CAT_B, CAT_C]],
    [riletta.status, riletta.category_ids],
    "e il difetto segnalato: dopo la conclusione ne restava una",
  );

  prova(
    "P-03 la forma storica che le schermate leggono ne porta tre",
    [CAT_A, CAT_B, CAT_C],
    modello.toEventLegacyShape(riletta).categories,
  );

  const catalogo = [
    { id: CAT_A, name: "Under 12" },
    { id: CAT_B, name: "Under 15" },
    { id: CAT_C, name: "Prima squadra" },
  ];
  prova(
    "P-04 e l'etichetta che la pagina disegna le nomina tutte e tre",
    "Under 12, Under 15, Prima squadra",
    utils.getTrainingCategoryLabel(
      modello.toEventLegacyShape(riletta),
      catalogo,
    ),
    "qui stava il difetto: la funzione tornava al primo riscontro",
  );

  /* Il calendario filtrato per la **seconda** categoria deve trovarlo. */
  for (const [nome, categoria] of [
    ["primaria", CAT_A],
    ["seconda", CAT_B],
    ["terza", CAT_C],
  ]) {
    const elenco = await eventi.listClubEvents(owner, {
      kind: "training",
      categoryId: categoria,
      status: "completed",
    });
    prova(
      `P-05 il filtro per la categoria ${nome} trova l'allenamento`,
      true,
      elenco.some((row) => row.id === EVENTO_TRE),
    );
  }

  /*
    L'allenatore della **sola** categoria B: prima era fuori perimetro sul
    proprio stesso allenamento, perche il perimetro guardava la sola primaria.
  */
  const suo = scope("trainer", MISTER.id);
  const elencoAllenatore = await eventi.listClubEvents(suo, {
    kind: "training",
    status: "completed",
  });
  prova(
    "P-06 l'allenatore della seconda categoria lo vede nel proprio calendario",
    true,
    elencoAllenatore.some((row) => row.id === EVENTO_TRE),
  );

  /* E un ruolo di club recintato sulla terza categoria: stessa regola. */
  const recintato = scope("club_manager", PRESIDENTE.id, [
    { kind: "category", value: CAT_C },
  ]);
  const elencoRecintato = await eventi.listClubEvents(recintato, {
    kind: "training",
    status: "completed",
  });
  prova(
    "P-07 e un ruolo recintato sulla terza categoria lo vede",
    true,
    elencoRecintato.some((row) => row.id === EVENTO_TRE),
  );

  /*
    **Il confine che l'allargamento non sposta** (ADR-0111).

    Ammettere l'evento non ammette le **persone**: ogni atleta convocato passa
    da `assertAtletiDentroIlPerimetro`, che e una guardia diversa e piu
    stretta. La prova sta qui e non fra i test perche quella guardia esprime il
    perimetro con un filtro **di relazione** su `athlete_category_memberships`,
    e il doppio di Prisma non lo implementa: li l'atleta risulterebbe ammesso e
    il presidio proverebbe il contrario di cio che deve provare.

    L'atleta e della categoria A; il ruolo e recintato sulla C, cioe la terza
    categoria dell'evento — la stessa che gli ha fatto **vedere** l'evento.
  */
  await respinta(
    "P-08 ma non gli lascia convocare un atleta fuori dal proprio perimetro",
    () =>
      eventi.saveEventConvocations(recintato, EVENTO_TRE, [
        { athleteId: ATLETI.active, status: "convocated" },
      ]),
    /Accesso negato/,
  );
};

/* ==================================================================== */
/*  P-09…P-14 — §B, modificare un allenamento concluso                  */
/* ==================================================================== */

const pB = async () => {
  console.log(`${NL}P-09…P-14 — §B · modificare un allenamento concluso`);
  const owner = scope("owner", PRESIDENTE.id);

  /* Senza storia, un evento concluso si modifica per intero. */
  await eventi.updateClubEvent(owner, EVENTO_TRE, {
    title: "Congiunto — rinviato di mezz'ora",
    time: "18:30",
  });
  let riga = await prisma.clubEvent.findUnique({ where: { id: EVENTO_TRE } });
  prova(
    "P-09 senza presenze si cambia tutto, e lo stato non torna indietro da solo",
    ["Congiunto — rinviato di mezz'ora", "completed"],
    [riga.title, riga.status],
    "prima la modifica riportava l'evento «in programma», in silenzio",
  );

  /* Adesso l'evento ha una storia. */
  await eventi.saveEventAttendance(owner, EVENTO_TRE, [
    { athleteId: ATLETI.active, status: "present" },
  ]);

  await eventi.updateClubEvent(owner, EVENTO_TRE, {
    title: "Congiunto — con nota",
    notes: "Sessione ridotta per pioggia",
  });
  riga = await prisma.clubEvent.findUnique({ where: { id: EVENTO_TRE } });
  const presenze = await prisma.clubEventParticipant.findMany({
    where: { event_id: EVENTO_TRE },
  });
  prova(
    "P-10 con una storia, titolo e note restano modificabili",
    ["Congiunto — con nota", "Sessione ridotta per pioggia"],
    [riga.title, riga.notes],
  );
  prova(
    "P-11 e la presenza gia registrata non si perde",
    [1, "present"],
    [presenze.length, presenze[0]?.status],
  );

  await respinta(
    "P-12 con una storia, spostare il giorno viene rifiutato",
    () => eventi.updateClubEvent(owner, EVENTO_TRE, { date: "2026-09-17" }),
    /ha gia una storia/,
  );

  await respinta(
    "P-12 e cambiare le categorie pure",
    () => eventi.updateClubEvent(owner, EVENTO_TRE, { categories: [CAT_A] }),
    /ha gia una storia/,
  );

  riga = await prisma.clubEvent.findUnique({ where: { id: EVENTO_TRE } });
  prova(
    "P-13 e dopo i due rifiuti l'evento e rimasto com'era",
    ["2026-09-10", [CAT_A, CAT_B, CAT_C]],
    [riga.starts_at.toISOString().slice(0, 10), riga.category_ids],
  );

  /*
    **Annullare resta possibile**: e la strada che ADR-0098 lascia aperta a un
    evento con una storia, ed e la ragione per cui il congelamento non vale sui
    cambi di stato.

    Il giro passa da «in programma» perche il vocabolario delle transizioni non
    prevede `completed -> cancelled` (`assertEventTransition`, ADR-0098): e una
    regola precedente a PP-01 e questa sonda la registra, non la aggira.
  */
  await eventi.updateClubEvent(owner, EVENTO_TRE, { status: "scheduled" });
  await eventi.updateClubEvent(owner, EVENTO_TRE, { status: "cancelled" });
  riga = await prisma.clubEvent.findUnique({ where: { id: EVENTO_TRE } });
  prova(
    "P-14 annullare un evento con una storia resta possibile",
    "cancelled",
    riga.status,
  );
  await eventi.updateClubEvent(owner, EVENTO_TRE, { status: "scheduled" });
};

/* ==================================================================== */
/*  P-15…P-16 — §B, la convocazione che si riapriva da sola             */
/* ==================================================================== */

const pConvocazioni = async () => {
  console.log(`${NL}P-15…P-16 — §B · la convocazione chiusa resta chiusa`);
  const owner = scope("owner", PRESIDENTE.id);

  const gara = await eventi.createClubEvent(owner, "match", {
    id: `pp01-gara-${Date.now()}`,
    title: "Amichevole",
    date: "2026-09-12",
    time: "15:00",
    categoryId: CAT_A,
    categories: [CAT_A],
    siteId: SEDE_1,
    opponent: "Altra squadra",
  });

  await eventi.saveEventConvocations(owner, gara.id, [
    { athleteId: ATLETI.active, status: "convoked" },
  ]);
  let riga = await prisma.clubEvent.findUnique({ where: { id: gara.id } });
  prova("P-15 la convocazione si chiude", "completed", riga.convocation_status);

  await eventi.updateClubEvent(owner, gara.id, { title: "Amichevole (casa)" });
  riga = await prisma.clubEvent.findUnique({ where: { id: gara.id } });
  prova(
    "P-16 e modificare il titolo non la riapre",
    ["Amichevole (casa)", "completed"],
    [riga.title, riga.convocation_status],
    "prima la fusione ripartiva dal payload, dove `convocation_status` non c'e mai stato",
  );
};

/* ==================================================================== */
/*  P-17…P-21 — §C, il conflitto di campo e orario                      */
/* ==================================================================== */

const pC = async () => {
  console.log(`${NL}P-17…P-21 — §C · il conflitto di campo e orario`);
  const owner = scope("owner", PRESIDENTE.id);

  const base = {
    date: "2026-10-01",
    time: "18:00",
    endTime: "19:30",
    categories: [CAT_A],
    categoryId: CAT_A,
    siteId: SEDE_1,
    structureId: STRUTTURA,
  };

  const primo = await eventi.createClubEvent(owner, "training", {
    ...base,
    id: `pp01-conf-1-${Date.now()}`,
    title: "Primo",
    fieldId: CAMPO_1,
  });
  prova("P-17 il primo allenamento nasce", true, Boolean(primo.id));

  /*
    **Due campi diversi della stessa struttura non sono un conflitto.** Prima lo
    erano, perche il modulo non mandava `fieldId` e il server ricadeva sulla
    struttura: il client non mostrava nessun avviso e il salvataggio falliva.
  */
  const altroCampo = await eventi.createClubEvent(owner, "training", {
    ...base,
    id: `pp01-conf-2-${Date.now()}`,
    title: "Sull'altro campo",
    fieldId: CAMPO_2,
  });
  prova(
    "P-18 lo stesso orario su un altro campo della stessa struttura passa",
    true,
    Boolean(altroCampo.id),
  );

  await respinta(
    "P-19 senza conferma, lo stesso campo alla stessa ora e rifiutato",
    () =>
      eventi.createClubEvent(owner, "training", {
        ...base,
        id: `pp01-conf-3-${Date.now()}`,
        title: "Sovrapposto",
        fieldId: CAMPO_1,
      }),
    /gia occupato/,
  );

  const sovrapposto = await eventi.createClubEvent(owner, "training", {
    ...base,
    id: `pp01-conf-4-${Date.now()}`,
    title: "Sovrapposto, confermato",
    fieldId: CAMPO_1,
    allowOverlap: true,
  });
  prova(
    "P-20 con la conferma, l'allenamento sovrapposto viene creato",
    true,
    Boolean(sovrapposto.id),
    "e il difetto segnalato: la conferma restava nel browser e il server rifiutava lo stesso",
  );

  const riga = await prisma.clubEvent.findUnique({
    where: { id: sovrapposto.id },
  });
  prova(
    "P-21 e la conferma non resta scritta dentro l'evento",
    false,
    Object.prototype.hasOwnProperty.call(riga.payload || {}, "allowOverlap"),
    "e un'istruzione della richiesta, non una proprieta dell'allenamento",
  );
};

/* ==================================================================== */
/*  P-22…P-23 — §D, i quattro stati atleta                              */
/* ==================================================================== */

const pD = async () => {
  console.log(`${NL}P-22…P-23 — §D · i quattro stati atleta`);
  const owner = scope("owner", PRESIDENTE.id);
  const stato = await carica("src/lib/athletes/status.ts");

  for (const chiave of stato.ATHLETE_STATUSES) {
    const parametri = new URLSearchParams({ organization_id: CLUB });
    parametri.set("status", chiave);
    const pagina = await risorse.listResourcePage("athletes", parametri, owner);
    prova(
      `P-22 il filtro «${chiave}» restituisce esattamente il suo atleta`,
      [ATLETI[chiave]],
      pagina.records.map((riga) => riga.id),
    );
  }

  /*
    **L'etichetta, che e dove il difetto e sopravvissuto alla Wave 6.** Il
    filtro era giusto; la cella dell'elenco stampava «In Prestito» per
    `inactive` e «Sospeso» per `loan`, cioe i due stati scambiati.
  */
  prova(
    "P-23 il vocabolario nomina i quattro stati senza scambiarne due",
    ["Attivo", "Sospeso", "In prestito", "Disattivato"],
    stato.ATHLETE_STATUSES.map((chiave) => stato.ATHLETE_STATUS_LABELS[chiave]),
  );
};

/* ==================================================================== */
/*  P-24…P-25 — §E, la foto che risorgeva                               */
/* ==================================================================== */

const pE = async () => {
  console.log(`${NL}P-24…P-25 — §E · la foto profilo`);
  const db = await carica("src/lib/simplified-db.ts");
  await comeUtente(PRESIDENTE, "owner");
  const FOTO = "data:image/png;base64,UFAwMQ==";

  const leggi = async () => {
    const riga = await prisma.athlete.findUnique({
      where: { id: ATLETI.active },
    });
    return {
      avatar_url: riga?.avatar_url ?? null,
      dato: riga?.data?.avatar ?? null,
    };
  };

  await db.updateClubAthlete(CLUB, ATLETI.active, { avatar: FOTO });
  prova(
    "P-24 la foto caricata sta in entrambe le copie",
    { avatar_url: FOTO, dato: FOTO },
    await leggi(),
  );

  await db.updateClubAthlete(CLUB, ATLETI.active, { avatar: null });
  prova(
    "P-25 rimossa e riletta dal database, non c'e piu",
    { avatar_url: null, dato: null },
    await leggi(),
    "W6-05: il `??` leggeva `null` come «non fornito» e riesumava la foto",
  );
};

/* ==================================================================== */

const main = async () => {
  console.log("PP-01 — collaudo su database di sviluppo");
  await semina();
  try {
    await pA();
    await pB();
    await pConvocazioni();
    await pC();
    await pD();
    await pE();
  } finally {
    await pulisci();
    await prisma.$disconnect();
  }

  const passati = esiti.filter((esito) => esito.ok).length;
  console.log(`${NL}${passati}/${esiti.length} controlli passati.`);
  if (passati !== esiti.length) process.exitCode = 1;
};

main().catch(async (errore) => {
  console.error(errore);
  await pulisci().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exitCode = 1;
});
