/**
 * **Quanto costa aprire le superfici della Wave 6, in interrogazioni.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs scripts/wave-6-performance.mjs
 *
 * ---
 *
 * ## Perche si contano le interrogazioni e non i millisecondi
 *
 * Il §27 del mandato chiede di misurare otto superfici «senza N+1». Il tempo
 * assoluto non risponde a quella domanda: su un database locale con un
 * migliaio di righe un N+1 da duecento interrogazioni **e veloce**, e lo
 * stesso codice su Neon da Vercel — dove ogni interrogazione paga un giro di
 * rete — non lo e. Il numero che si porta dietro l'ambiente e il **conteggio**,
 * e cresce con i dati esattamente come cresce il difetto.
 *
 * Per questo ogni superficie viene misurata **due volte, a due taglie**. Non e
 * il valore assoluto a dire se c'e un N+1: e il rapporto fra le due misure.
 * Un conteggio che raddoppia raddoppiando gli atleti e un N+1 anche se sono
 * dodici interrogazioni; un conteggio che resta fermo a quaranta non lo e.
 *
 * La colonna `per riga` dice quanto e cresciuto il costo per ogni riga in piu:
 * vicino a zero significa che la superficie ha un costo **fisso**, che e cio
 * che si vuole.
 *
 * ## Le taglie
 *
 * Quelle del mandato — 200 atleti, 100 eventi, 500 notifiche — e una taglia
 * piccola con cui confrontarle. La taglia piccola non e un caso realistico: e
 * il termine di paragone senza il quale il numero grande non significa niente.
 *
 * ## Cosa non misura
 *
 * Il tempo di rendering nel browser, che non vive qui, e la latenza vera, che
 * dipende dalla distanza fra Vercel e Neon. I millisecondi stampati servono
 * solo a far notare una superficie fuori scala: **non** sono una previsione di
 * produzione.
 *
 * ## La regola
 *
 * Come le sonde della Wave: **misura, non corregge**. Semina un club sintetico
 * e lo cancella in `finally`.
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
const carica = (rel) => import(pathToFileURL(path.resolve(rel)).href);

/* --------------------------------------------------- il client che conta */

/*
  Il conteggio non si fa con un contatore attorno alle chiamate: si fa con
  l'evento `query` di Prisma, che si accende **una volta per interrogazione
  davvero mandata al database**. E l'unico punto che non si puo aggirare
  scrivendo il codice in un altro modo, ed e la ragione per cui questo numero
  vale mentre un contatore a mano varrebbe fino al prossimo refactoring.
*/
const prisma = new PrismaClient({
  log: [{ emit: "event", level: "query" }],
});

let interrogazioni = 0;
prisma.$on("query", () => {
  interrogazioni += 1;
});

/*
  **Venticinque interrogazioni non sono un numero, finche non si sa se sono
  in fila.**

  Su Neon da Vercel ogni interrogazione paga un giro di rete: venticinque in
  parallelo costano un giro, venticinque in fila ne costano venticinque. E la
  differenza fra una pagina che si apre e una che si aspetta, e il conteggio
  da solo non la vede.

  Il modo di vederla senza un cronometro in produzione e **iniettare la
  latenza**: si rimisura la stessa superficie con un ritardo fisso davanti a
  ogni interrogazione, e il tempo in piu diviso il ritardo da il numero di
  attese in fila. Due chiamate parallele aspettano insieme e contano una; due
  in fila contano due.

  E la stessa tecnica di `measure-dashboard-performance.mjs`, che l'aveva
  introdotta perche «ventinove richieste» non spiegava perche la dashboard
  sembrasse lenta: erano dieci attese in fila.
*/
const LATENZA_MS = 20;
let latenzaAttiva = false;

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

const prismaLento = prisma.$extends({
  query: {
    async $allOperations({ args, query }) {
      if (latenzaAttiva) await attendi(LATENZA_MS);
      return query(args);
    },
  },
});

/* ------------------------------------------------------------- le taglie */

const TAGLIE = [
  { nome: "piccola", atleti: 20, eventi: 10, notifiche: 50 },
  { nome: "mandato", atleti: 200, eventi: 100, notifiche: 500 },
];

/* --------------------------------------------------------- la misurazione */

const misure = new Map();

const cronometra = async (azione) => {
  interrogazioni = 0;
  const inizio = process.hrtime.bigint();
  let righe = null;
  let errore = null;
  try {
    righe = await azione();
  } catch (e) {
    errore = e;
  }
  return {
    ms: Number(process.hrtime.bigint() - inizio) / 1e6,
    q: interrogazioni,
    righe,
    errore,
  };
};

const misura = async (superficie, taglia, azione) => {
  const veloce = await cronometra(azione);

  latenzaAttiva = true;
  const lento = await cronometra(azione);
  latenzaAttiva = false;

  /*
    I giri si arrotondano per eccesso: mezzo giro non esiste, e arrotondare
    per difetto nasconderebbe l'ultima attesa.
  */
  const giri = veloce.errore
    ? null
    : Math.max(1, Math.round((lento.ms - veloce.ms) / LATENZA_MS));

  if (!misure.has(superficie)) misure.set(superficie, {});
  misure.get(superficie)[taglia.nome] = {
    q: veloce.q,
    ms: veloce.ms,
    giri,
    righe: Array.isArray(veloce.righe)
      ? veloce.righe.length
      : (veloce.righe?.length ?? null),
    errore: veloce.errore ? veloce.errore.message.split(NL)[0] : null,
  };
};

/* ------------------------------------------------------------- la semina */

const CLUB = randomUUID();
const SEDE = randomUUID();
const CAT = randomUUID();
const GRUPPO = randomUUID();
const PREFISSO = "perf6";

let PRESIDENTE;
let GENITORE;
let MISTER;
let ATLETA_FIGLIO;

const utente = async (email, nome) =>
  prisma.user.create({
    data: {
      email,
      first_name: nome,
      last_name: "Misura",
      password_hash: "non-usato",
      email_verified_at: new Date(),
    },
  });

const pulisciResidui = async () => {
  const club = await prisma.club.findMany({
    where: { slug: { startsWith: `${PREFISSO}-` } },
    select: { id: true },
  });
  for (const { id } of club) {
    await prisma.club.delete({ where: { id } }).catch(() => {});
  }
  await prisma.user
    .deleteMany({ where: { email: { startsWith: `${PREFISSO}-` } } })
    .catch(() => {});
};

const seminaBase = async () => {
  await pulisciResidui();

  PRESIDENTE = await utente(`${PREFISSO}-presidente@example.invalid`, "Pia");
  GENITORE = await utente(`${PREFISSO}-genitore@example.invalid`, "Gino");
  MISTER = await utente(`${PREFISSO}-mister@example.invalid`, "Mario");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `${PREFISSO}-${Date.now()}`,
      name: "ASD Misura Sei",
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
      categories: [{ id: CAT, name: "Under 14" }],
      club_sites: [{ id: SEDE, name: "Sede Unica", active: true }],
      category_groups: [{ id: GRUPPO, categoryId: CAT, siteId: SEDE }],
      trainers: [
        {
          id: "trainer-perf6",
          first_name: "Mario",
          last_name: "Misura",
          email: MISTER.email,
          linkedUserId: MISTER.id,
          categories: [CAT],
          groups: [GRUPPO],
        },
      ],
      staff_members: [],
      structures: [],
      trainings: [],
      matches: [],
      appointments: [],
      updated_at: new Date(),
    },
  });

  await prisma.organizationUser.createMany({
    data: [
      { organization_id: CLUB, user_id: PRESIDENTE.id, role: "owner" },
      { organization_id: CLUB, user_id: MISTER.id, role: "trainer" },
      { organization_id: CLUB, user_id: GENITORE.id, role: "parent" },
    ],
  });
};

/*
  La taglia si cambia **aggiungendo**, non riseminando: cosi la misura grande
  gira sullo stesso club della piccola e nessuna differenza puo essere
  attribuita a un club diverso.
*/
let atletiCreati = 0;
let eventiCreati = 0;
let notificheCreate = 0;

/*
  La coda documentale e la matrice degli accessi hanno bisogno di righe loro:
  una superficie misurata su un insieme vuoto restituisce «costo fisso» sempre,
  e sarebbe un verde che non ha guardato niente.
*/
let richiesteCreate = 0;

const seminaAccessi = async () => {
  const ruolo = await prisma.clubRole.create({
    data: {
      organization_id: CLUB,
      slug: "segreteria-misura",
      name: "Segreteria Misura",
      base_role: "collaborator",
      created_by: PRESIDENTE.id,
    },
  });
  await prisma.clubRolePermission.createMany({
    data: ["documents.read_dossier", "athletes.read"].map((permission_key) => ({
      role_id: ruolo.id,
      permission_key,
    })),
  });
  const tessera = await prisma.organizationUser.findFirst({
    where: { organization_id: CLUB, user_id: MISTER.id },
    select: { id: true },
  });
  if (tessera) {
    await prisma.clubAccessScope.create({
      data: {
        organization_user_id: tessera.id,
        scope_kind: "site",
        scope_value: SEDE,
      },
    });
  }
};

const portaATaglia = async (taglia) => {
  const nuoviAtleti = [];
  for (let i = atletiCreati; i < taglia.atleti; i += 1) {
    nuoviAtleti.push({
      id: randomUUID(),
      organization_id: CLUB,
      first_name: `Atleta${i}`,
      last_name: `Misura${i}`,
      birth_date: new Date("2012-05-14T00:00:00.000Z"),
      status: "active",
      category_id: CAT,
      category_name: "Under 14",
      data: {
        guardians: [{ name: "Gino", email: GENITORE.email }],
        medicalCertExpiry: "2027-03-01",
      },
      updated_at: new Date(),
    });
  }
  if (nuoviAtleti.length) {
    await prisma.athlete.createMany({ data: nuoviAtleti });
    await prisma.athleteCategoryMembership.createMany({
      data: nuoviAtleti.map((a) => ({
        organization_id: CLUB,
        athlete_id: a.id,
        category_id: CAT,
        category_name: "Under 14",
        site_id: SEDE,
        is_primary: true,
      })),
    });
    if (!ATLETA_FIGLIO) {
      ATLETA_FIGLIO = nuoviAtleti[0].id;
      await prisma.athlete.update({
        where: { id: ATLETA_FIGLIO },
        data: { user_id: GENITORE.id },
      });
    }
    atletiCreati = taglia.atleti;
  }

  const nuoviEventi = [];
  for (let i = eventiCreati; i < taglia.eventi; i += 1) {
    nuoviEventi.push({
      id: randomUUID(),
      organization_id: CLUB,
      kind: i % 3 === 0 ? "match" : "training",
      title: `Evento ${i}`,
      starts_at: new Date(Date.UTC(2026, 9, 1 + (i % 28), 18, 0)),
      site_id: SEDE,
      category_id: CAT,
      group_ids: [GRUPPO],
      status: "scheduled",
      updated_at: new Date(),
    });
  }
  if (nuoviEventi.length) {
    await prisma.clubEvent.createMany({ data: nuoviEventi });
    eventiCreati = taglia.eventi;
  }

  const nuoveNotifiche = [];
  for (let i = notificheCreate; i < taglia.notifiche; i += 1) {
    nuoveNotifiche.push({
      id: randomUUID(),
      organization_id: CLUB,
      /*
        Meta alla famiglia e meta alla direzione: la superficie di club e
        quella della famiglia leggono due insiemi diversi, e seminarne uno
        solo avrebbe fatto misurare zero righe all'altra — cioe niente.
      */
      user_id: i % 2 === 0 ? GENITORE.id : PRESIDENTE.id,
      title: `Avviso ${i}`,
      message: "Testo di misura",
      type: "info",
      read: i % 4 === 0,
      data: { athleteId: ATLETA_FIGLIO },
    });
  }
  if (nuoveNotifiche.length) {
    await prisma.notification.createMany({ data: nuoveNotifiche });
    notificheCreate = taglia.notifiche;
  }

  /*
    Una richiesta documentale per atleta: e il caso reale — il certificato
    medico si chiede a tutti — ed e anche quello che fa emergere un N+1, se
    la coda rileggesse il soggetto una riga alla volta.
  */
  const atleti = await prisma.athlete.findMany({
    where: { organization_id: CLUB },
    select: { id: true },
    skip: richiesteCreate,
  });
  if (atleti.length) {
    await prisma.documentRequest.createMany({
      data: atleti.map((a) => ({
        organization_id: CLUB,
        subject_kind: "athlete",
        subject_id: a.id,
        document_kind: "medical_certificate",
        title: "Certificato medico",
        required: true,
        created_by: PRESIDENTE.id,
      })),
    });
    richiesteCreate += atleti.length;
  }
};

/* ------------------------------------------------------- le otto superfici */

const scopeGestione = () => ({
  userId: PRESIDENTE.id,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
  accessScopes: [],
});

const giro = async (taglia) => {
  const resources = await carica("src/lib/server/resources.ts");
  const cruscottoFamiglia = await carica("src/lib/server/parent-dashboard.ts");
  const eventi = await carica("src/lib/server/events.ts");
  const documenti = await carica("src/lib/server/document-requests.ts");
  const ruoli = await carica("src/lib/server/club-roles.ts");

  await misura("Home famiglia", taglia, () =>
    cruscottoFamiglia.getParentDashboardData(GENITORE.id, ATLETA_FIGLIO),
  );

  /*
    Il genitore e tutore di **ogni** atleta seminato. Non e un caso realistico:
    e il caso peggiore, ed e il motivo per cui e utile — se questa superficie
    rileggesse un figlio alla volta, qui si vedrebbe.
  */
  await misura("Elenco figli (caso peggiore)", taglia, () =>
    cruscottoFamiglia.listParentChildren(GENITORE.id),
  );

  await misura("Elenco atleti (una pagina)", taglia, async () => {
    const r = await resources.listResourcePage(
      "athletes",
      new URLSearchParams("limit=25&offset=0"),
      scopeGestione(),
    );
    return r.records;
  });

  await misura("Elenco atleti (tutti)", taglia, async () => {
    const r = await resources.listResourcePage(
      "athletes",
      new URLSearchParams(""),
      scopeGestione(),
    );
    return r.records;
  });

  await misura("Calendario eventi", taglia, () =>
    eventi.listClubEvents(scopeGestione(), new URLSearchParams("")),
  );

  await misura("Notifiche della famiglia", taglia, async () => {
    const r = await resources.listResourcePage(
      "notifications",
      new URLSearchParams(""),
      scopeGestione(),
    );
    return r.records;
  });

  await misura("Coda documentale", taglia, () =>
    documenti.listDocumentRequests(scopeGestione(), new URLSearchParams("")),
  );

  await misura("Matrice Gestione Accessi", taglia, async () => {
    const elenco = await ruoli.listClubRoles(scopeGestione());
    await ruoli.listClubAccessAssignments(scopeGestione());
    return elenco;
  });
};

/* ---------------------------------------------------------------- il referto */

const pad = (testo, larghezza) => String(testo).padEnd(larghezza);
const padSx = (testo, larghezza) => String(testo).padStart(larghezza);

const referto = () => {
  const piccola = TAGLIE[0];
  const grande = TAGLIE[1];
  const crescitaRighe = grande.atleti - piccola.atleti;

  console.log(`${NL}${"=".repeat(96)}`);
  console.log(
    `Interrogazioni al database per superficie — ${piccola.atleti} atleti contro ${grande.atleti}`,
  );
  console.log("=".repeat(96));
  console.log(
    `${pad("superficie", 30)}${padSx("q piccola", 11)}${padSx("q mandato", 11)}` +
      `${padSx("delta", 8)}${padSx("per riga", 9)}${padSx("giri", 7)}${padSx("righe", 8)}${padSx("ms", 7)}  esito`,
  );
  console.log("-".repeat(96));

  const sospetti = [];
  const attese = [];

  for (const [superficie, valori] of misure) {
    const p = valori[piccola.nome];
    const g = valori[grande.nome];
    if (!p || !g) continue;

    if (g.errore) {
      console.log(`${pad(superficie, 30)}${padSx("—", 11)}  ERRORE: ${g.errore}`);
      sospetti.push([superficie, `non misurabile: ${g.errore}`]);
      continue;
    }

    const delta = g.q - p.q;
    const perRiga = delta / crescitaRighe;

    /*
      La soglia non e un numero magico: e la definizione di N+1. Un costo per
      riga sopra un centesimo di interrogazione vuol dire che ogni cento righe
      in piu ne compare almeno una in piu — cioe che il costo **dipende dai
      dati**. Sotto, la superficie ha un costo fisso.
    */
    const sospetto = perRiga > 0.01;
    const esito = sospetto ? "N+1 SOSPETTO" : "costo fisso";
    if (sospetto) {
      sospetti.push([
        superficie,
        `${p.q} → ${g.q} interrogazioni (+${delta}) su ${crescitaRighe} righe in piu`,
      ]);
    }

    console.log(
      `${pad(superficie, 30)}${padSx(p.q, 11)}${padSx(g.q, 11)}` +
        `${padSx(delta >= 0 ? `+${delta}` : delta, 8)}${padSx(perRiga.toFixed(3), 9)}` +
        `${padSx(g.giri ?? "—", 7)}${padSx(g.righe ?? "—", 8)}${padSx(g.ms.toFixed(0), 7)}  ${esito}`,
    );

    /*
      Un giro di rete e un'attesa in fila. Sopra la decina, la superficie
      aspetta piu di quanto lavori: non e un difetto di crescita — il costo
      resta fisso — ma e cio che una persona sente quando la pagina si apre.
    */
    if ((g.giri ?? 0) > 10) {
      attese.push([superficie, g.giri, g.q]);
    }
  }

  console.log("-".repeat(96));

  const riepilogoAttese = () => {
    if (!attese.length) {
      console.log(
        `${NL}E nessuna aspetta piu di dieci giri di rete: le letture partono insieme.`,
      );
      return;
    }
    console.log(
      `${NL}Superfici che aspettano in fila (il costo e fisso, ma si sente):`,
    );
    for (const [superficie, giri, q] of attese) {
      console.log(
        `  - ${superficie}: ${giri} giri per ${q} interrogazioni` +
          ` (a 25 ms di andata e ritorno sono ~${giri * 25} ms di sola attesa)`,
      );
    }
  };

  if (!sospetti.length) {
    console.log(
      `${NL}Nessuna superficie cresce con i dati: il costo di ogni apertura e fisso.`,
    );
    riepilogoAttese();
    return 0;
  }

  console.log(`${NL}Superfici il cui costo cresce con i dati:`);
  for (const [superficie, motivo] of sospetti) {
    console.log(`  - ${superficie}: ${motivo}`);
  }
  console.log(
    `${NL}Un conteggio che cresce con le righe paga un giro di rete per riga` +
      ` su Neon.${NL}Va guardato prima del deploy, non dopo.`,
  );
  riepilogoAttese();
  return 1;
};

/* ------------------------------------------------------------------- il giro */

let uscita = 0;

try {
  const { __setPrismaClientForTests } = await carica("src/lib/server/prisma.ts");
  __setPrismaClientForTests(prismaLento);

  console.log("Semina del club di misura...");
  await seminaBase();
  await seminaAccessi();

  for (const taglia of TAGLIE) {
    console.log(
      `Taglia «${taglia.nome}»: ${taglia.atleti} atleti, ${taglia.eventi} eventi,` +
        ` ${taglia.notifiche} notifiche...`,
    );
    await portaATaglia(taglia);
    /*
      Un giro a vuoto prima di misurare: la prima chiamata di ogni modulo paga
      l'import e la preparazione delle istruzioni, e quel costo non e la
      superficie. Misurarlo dentro il conteggio farebbe sembrare piu care le
      superfici che capitano per prime.
    */
    await giro({ nome: "riscaldamento" });
    await giro(taglia);
  }

  uscita = referto();
} catch (errore) {
  console.error(`${NL}La misura si e interrotta: ${errore.message}`);
  console.error(errore.stack);
  uscita = 1;
} finally {
  await pulisciResidui();
  await prisma.$disconnect();
}

process.exit(uscita);
