/**
 * **PP-03 round 6 — §15.1 e §15.2: il registro delle grafie e i due assi.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/pp-03-round6-grafie-e-assi-probe.mjs
 *
 * Due club distinti, perche il registro deve essere **diverso** fra il caso
 * ordinato e quello ambiguo: uno con `clubs.categories` pulito, uno con nomi
 * che sono identificativi di altre categorie e nomi ripetuti.
 *
 * `PASS` = comportamento corretto (attacco respinto **o** atto legittimo
 * riuscito, secondo la riga). `FAIL` = difetto.
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
const info = (titolo, valore) =>
  console.log(`  INFO  ${titolo.padEnd(72)} ${JSON.stringify(valore)}`);

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
const invia = async (identita, percorso, init = {}) => {
  const url = new URL(String(percorso), "http://collaudo.invalid");
  const metodo = String(init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers || {});
  if (identita?.token) headers.set("authorization", `Bearer ${identita.token}`);
  if (identita?.club) headers.set("x-active-club-id", identita.club);
  if (identita?.ruolo) headers.set("x-active-access-role", identita.ruolo);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
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

globalThis.fetch = async (input) => {
  throw new Error(`FETCH-ESTERNO ${String(input)}`);
};

const identita = async (riga, ruolo, club) => {
  const auth = await carica("src/lib/server/auth.ts");
  const sessione = await auth.createSessionForUser(riga);
  return { token: sessione.access_token, ruolo, club };
};

/* ------------------------------------------------------------- gli attori */

const CLUB_A = randomUUID(); /* registro ordinato */
const CLUB_B = randomUUID(); /* registro ambiguo */

const CAT_A = "cat-r6g-alfa";
const CAT_B = "cat-r6g-beta";
const GRP_A = "grp-r6g-alfa";
const GRP_B = "grp-r6g-beta";

let ALDO_U = null;
let BRUNO_U = null;
let CARLO_U = null; /* allenatore SENZA gruppi dichiarati, categoria alfa */
let CAPO_U = null;

let ALDO = null;
let BRUNO = null;
let CARLO = null;
let CAPO = null;
let ALDO_B = null;
let BRUNO_B = null;

const STAGIONE = {
  id: "2026-27",
  label: "2026/27",
  startDate: "2026-07-01",
  endDate: "2027-06-30",
  status: "active",
};

const utente = async (email, nome) => {
  const trovato = await prisma.user.findUnique({ where: { email } });
  if (trovato) return trovato;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      first_name: nome,
      last_name: "R6g",
      password_hash: "$2b$10$pp03r6g",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const semina = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp03r6g-" } },
    select: { id: true },
  });
  if (residui.length) {
    const ids = residui.map((r) => r.id);
    await prisma.auditLog.deleteMany({ where: { organization_id: { in: ids } } }).catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }

  CAPO_U = await utente("pp03r6g-capo@example.invalid", "Anna");
  ALDO_U = await utente("pp03r6g-aldo@example.invalid", "Aldo");
  BRUNO_U = await utente("pp03r6g-bruno@example.invalid", "Bruno");
  CARLO_U = await utente("pp03r6g-carlo@example.invalid", "Carlo");

  /* ------- club A: registro ordinato, e i gruppi ci sono ------- */
  await prisma.club.create({
    data: {
      id: CLUB_A,
      slug: `pp03r6g-a-${Date.now()}`,
      name: "ASD R6g Ordinato",
      creator_id: CAPO_U.id,
      settings: { seasons: [STAGIONE] },
      categories: [
        { id: CAT_A, name: "Under 12" },
        { id: CAT_B, name: "Under 15" },
      ],
      club_sites: [{ id: "sede-r6g", name: "Sede" }],
      category_groups: [
        { id: GRP_A, categoryId: CAT_A, siteId: "sede-r6g", name: "Under 12 · Sede" },
        { id: GRP_B, categoryId: CAT_B, siteId: "sede-r6g", name: "Under 15 · Sede" },
      ],
      structures: [],
      trainers: [
        {
          id: "t-aldo",
          first_name: "Aldo",
          last_name: "R6g",
          email: ALDO_U.email,
          linkedUserId: ALDO_U.id,
          categories: ["Under 12"] /* il perimetro dichiarato per NOME */,
          groups: [GRP_A],
        },
        {
          id: "t-bruno",
          first_name: "Bruno",
          last_name: "R6g",
          email: BRUNO_U.email,
          linkedUserId: BRUNO_U.id,
          categories: [CAT_B],
          groups: [GRP_B],
        },
        {
          id: "t-carlo",
          first_name: "Carlo",
          last_name: "R6g",
          email: CARLO_U.email,
          linkedUserId: CARLO_U.id,
          categories: [CAT_A],
          groups: [] /* NESSUN gruppo dichiarato */,
        },
      ],
      staff_members: [],
      trainings: [],
      matches: [],
      appointments: [],
      updated_at: new Date(),
    },
  });

  /* ------- club B: registro ambiguo ------- */
  await prisma.club.create({
    data: {
      id: CLUB_B,
      slug: `pp03r6g-b-${Date.now()}`,
      name: "ASD R6g Ambiguo",
      creator_id: CAPO_U.id,
      settings: { seasons: [STAGIONE] },
      categories: [
        /* il NOME della prima e l'IDENTIFICATIVO della seconda */
        { id: "amb-uno", name: "amb-due" },
        { id: "amb-due", name: "Allievi" },
        /* due categorie con lo stesso nome, in grafie diverse */
        { id: "amb-tre", name: "Esordienti" },
        { id: "amb-quattro", name: "  ESORDIENTI " },
      ],
      club_sites: [],
      category_groups: [],
      structures: [],
      trainers: [
        {
          id: "tb-aldo",
          first_name: "Aldo",
          last_name: "R6g",
          email: ALDO_U.email,
          linkedUserId: ALDO_U.id,
          categories: ["amb-due"] /* e un identificativo, ed e anche un nome */,
          groups: [],
        },
        {
          id: "tb-bruno",
          first_name: "Bruno",
          last_name: "R6g",
          email: BRUNO_U.email,
          linkedUserId: BRUNO_U.id,
          categories: ["Esordienti"] /* nome ripetuto su due categorie */,
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

  for (const [club, righe] of [
    [CLUB_A, [[CAPO_U, "owner"], [ALDO_U, "trainer"], [BRUNO_U, "trainer"], [CARLO_U, "trainer"]]],
    [CLUB_B, [[CAPO_U, "owner"], [ALDO_U, "trainer"], [BRUNO_U, "trainer"]]],
  ]) {
    for (const [riga, ruolo] of righe) {
      await prisma.organizationUser.create({
        data: {
          id: randomUUID(),
          organization_id: club,
          user_id: riga.id,
          role: ruolo,
          is_primary: club === CLUB_A,
          updated_at: new Date(),
        },
      });
    }
  }
};

const pulisci = async () => {
  for (const club of [CLUB_A, CLUB_B]) {
    await prisma.auditLog.deleteMany({ where: { organization_id: club } }).catch(() => {});
    await prisma.club.deleteMany({ where: { id: club } }).catch((e) => {
      console.error(`Pulizia non riuscita ${club}: ${e?.message}`);
    });
  }
};

/* ==================================================================== */

let contatore = 0;
const base = (extra) => ({
  kind: "training",
  title: `R6g ${(contatore += 1)}`,
  date: "2026-10-24",
  time: `${String(6 + (contatore % 12)).padStart(2, "0")}:00`,
  endTime: `${String(7 + (contatore % 12)).padStart(2, "0")}:00`,
  seasonId: "2026-27",
  allowOverlap: true,
  ...extra,
});

const crea = (chi, corpo) =>
  invia(chi, "/api/v1/events", { method: "POST", body: JSON.stringify(corpo) });

const rigaDi = async (risposta) => {
  const id = risposta.corpo?.data?.id ?? null;
  return id ? prisma.clubEvent.findUnique({ where: { id } }) : null;
};

/* ------------------------------------------------------------------- A - */

const grafieDelRegistro = async () => {
  console.log("\nA — le grafie della categoria, registro ordinato (club A)");

  /* Il perimetro di Aldo e dichiarato per NOME: deve poter scrivere per id. */
  const propria = await crea(ALDO, base({ categoryId: CAT_A, categoryName: "Under 12" }));
  prova("A-01 · perimetro per nome, evento per identificativo (legittimo)", 200, propria.stato,
    JSON.stringify(propria.corpo?.error?.message ?? null));

  const maiuscolo = await crea(ALDO, base({ categoryId: CAT_A.toUpperCase() }));
  prova("A-02 · propria categoria in MAIUSCOLO (legittimo)", 200, maiuscolo.stato,
    JSON.stringify(maiuscolo.corpo?.error?.message ?? null));

  const spazi = await crea(ALDO, base({ categoryId: `  ${CAT_A}  ` }));
  prova("A-03 · propria categoria con spazi (legittimo)", 200, spazi.stato,
    JSON.stringify(spazi.corpo?.error?.message ?? null));

  const altruiSpazi = await crea(ALDO, base({ categoryId: `  ${CAT_B}  ` }));
  prova("A-04 · categoria altrui con spazi", 403, altruiSpazi.stato);

  const altruiMaiuscolo = await crea(ALDO, base({ categoryId: CAT_B.toUpperCase() }));
  prova("A-05 · categoria altrui in MAIUSCOLO", 403, altruiMaiuscolo.stato);

  /* categoryId vuoto, categoryName scelto ad arte */
  const vuotoNomeAltrui = await crea(ALDO, base({ categoryId: "", categoryName: CAT_B }));
  const rigaVN = await rigaDi(vuotoNomeAltrui);
  prova(
    "A-06 · categoryId vuoto + categoryName = identificativo altrui",
    true,
    vuotoNomeAltrui.stato >= 400 || String(rigaVN?.category_id ?? "") !== CAT_B,
    `stato ${vuotoNomeAltrui.stato} categoria ${JSON.stringify(rigaVN?.category_id ?? null)} nome ${JSON.stringify(rigaVN?.category_name ?? null)}`,
  );
  if (rigaVN) {
    const calendarioB = await invia(BRUNO, "/api/v1/events?kind=all");
    const titoli = (calendarioB.corpo?.data || []).map((e) => e?.title);
    prova(
      "A-06b · e non compare nel calendario di Bruno",
      false,
      titoli.includes(rigaVN.title),
      JSON.stringify(titoli),
    );
  }

  const spaziNomeAltrui = await crea(ALDO, base({ categoryId: "   ", categoryName: CAT_B }));
  const rigaSN = await rigaDi(spaziNomeAltrui);
  prova(
    "A-07 · categoryId di soli spazi + categoryName = identificativo altrui",
    true,
    spaziNomeAltrui.stato >= 400 || String(rigaSN?.category_id ?? "").trim() !== CAT_B,
    `stato ${spaziNomeAltrui.stato} categoria ${JSON.stringify(rigaSN?.category_id ?? null)}`,
  );

  const vuotoNomeAltruiNome = await crea(ALDO, base({ categoryId: "", categoryName: "Under 15" }));
  prova("A-08 · categoryId vuoto + categoryName = NOME della categoria altrui", 403, vuotoNomeAltruiNome.stato,
    JSON.stringify(vuotoNomeAltruiNome.corpo?.error?.message ?? null));

  /* categories[] secondarie */
  const secondarie = await crea(ALDO, base({ categoryId: CAT_A, categories: [CAT_A, CAT_B] }));
  prova("A-09 · categories secondarie con quella altrui", 403, secondarie.stato);

  const secondarieNome = await crea(ALDO, base({ categoryId: CAT_A, categories: [CAT_A, "Under 15"] }));
  prova("A-10 · categories secondarie col NOME di quella altrui", 403, secondarieNome.stato);

  /* creazione in blocco */
  const blocco = await invia(ALDO, "/api/v1/events", {
    method: "POST",
    body: JSON.stringify({
      events: [
        base({ categoryId: CAT_A }),
        base({ categoryId: "", categoryName: CAT_B, title: "BLOCCO-FORGIATO" }),
      ],
    }),
  });
  const forgiataInBlocco = await prisma.clubEvent.count({
    where: { organization_id: CLUB_A, title: "BLOCCO-FORGIATO" },
  });
  prova("A-11 · il blocco non scrive l'evento con la grafia forgiata", 0, forgiataInBlocco,
    `stato ${blocco.stato}`);

  /* PATCH che svuota category_id lasciando categoryName */
  const mio = await crea(ALDO, base({ categoryId: CAT_A, title: "MIO-DA-SPOSTARE" }));
  const MIO = mio.corpo?.data?.id ?? null;
  if (MIO) {
    const svuota = await invia(ALDO, `/api/v1/events/${MIO}`, {
      method: "PATCH",
      body: JSON.stringify({ categoryId: "", categoryName: "Under 15" }),
    });
    const dopo = await prisma.clubEvent.findUnique({ where: { id: MIO } });
    prova(
      "A-12 · PATCH che svuota category_id e mette il nome altrui",
      true,
      svuota.stato >= 400 || String(dopo?.category_name ?? "") !== "Under 15",
      `stato ${svuota.stato} id ${JSON.stringify(dopo?.category_id ?? null)} nome ${JSON.stringify(dopo?.category_name ?? null)}`,
    );
    const calendarioB2 = await invia(BRUNO, "/api/v1/events?kind=all");
    prova(
      "A-12b · e l'evento non entra nel calendario di Bruno",
      false,
      (calendarioB2.corpo?.data || []).some((e) => e?.title === "MIO-DA-SPOSTARE"),
    );
  }

  /*
    **E l'evento che l'identificativo non ce l'ha mai avuto.** §15.1 dice che
    il nome parla quando l'identificativo tace: un evento di soli gruppi non ha
    category_id, e il nome lo sceglie chi chiama.
  */
  const soloGruppo = await crea(ALDO, base({ groupIds: [GRP_A], title: "SENZA-ID-DA-NOMINARE" }));
  const SG = soloGruppo.corpo?.data?.id ?? null;
  info("A-14pre evento di soli gruppi", { stato: soloGruppo.stato, id: Boolean(SG) });
  if (SG) {
    const nomina = await invia(ALDO, `/api/v1/events/${SG}`, {
      method: "PATCH",
      body: JSON.stringify({ categoryName: "Under 15" }),
    });
    const dopo = await prisma.clubEvent.findUnique({ where: { id: SG } });
    info("A-14 PATCH che mette solo il nome della categoria altrui", {
      stato: nomina.stato,
      id: dopo?.category_id ?? null,
      nome: dopo?.category_name ?? null,
      gruppi: dopo?.group_ids ?? null,
    });
    const calB = await invia(BRUNO, "/api/v1/events?kind=all");
    prova(
      "A-14b · l'evento cosi nominato non entra nel calendario di Bruno",
      false,
      (calB.corpo?.data || []).some((e) => e?.title === "SENZA-ID-DA-NOMINARE"),
      JSON.stringify((calB.corpo?.data || []).map((e) => e?.title)),
    );
    /* e Bruno lo puo scrivere? sarebbe l'evento di Aldo in mano a Bruno */
    const bScrive = await invia(BRUNO, `/api/v1/events/${SG}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "PRESO-DA-BRUNO" }),
    });
    prova("A-14c · e Bruno non lo puo modificare", 403, bScrive.stato,
      JSON.stringify(bScrive.corpo?.error?.message ?? null));
  }

  /* controllo positivo: Aldo modifica il proprio evento */
  if (MIO) {
    const legittimo = await invia(ALDO, `/api/v1/events/${MIO}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "MIO-RINOMINATO" }),
    });
    prova("A-13 · Aldo modifica il proprio evento (legittimo)", 200, legittimo.stato,
      JSON.stringify(legittimo.corpo?.error?.message ?? null));
  }
};

/* ------------------------------------------------------------------- B - */

const registroAmbiguo = async () => {
  console.log("\nB — il registro ambiguo (club B)");

  /*
    Aldo ha nel perimetro `amb-due`, che e l'identificativo della seconda
    categoria **ed** e il nome della prima. Non deve raggiungere `amb-uno`.
  */
  const versoUno = await crea(ALDO_B, base({ categoryId: "amb-uno" }));
  prova("B-01 · non raggiunge la categoria che si chiama come il proprio id", 403, versoUno.stato,
    JSON.stringify(versoUno.corpo?.error?.message ?? null));

  const versoDue = await crea(ALDO_B, base({ categoryId: "amb-due" }));
  prova("B-02 · raggiunge la propria (legittimo)", 200, versoDue.stato,
    JSON.stringify(versoDue.corpo?.error?.message ?? null));

  /*
    Bruno ha nel perimetro il NOME `Esordienti`, che appartiene a due
    categorie: deve fallire chiuso su entrambe.
  */
  const tre = await crea(BRUNO_B, base({ categoryId: "amb-tre" }));
  const quattro = await crea(BRUNO_B, base({ categoryId: "amb-quattro" }));
  prova("B-03 · nome ripetuto: non apre amb-tre", 403, tre.stato);
  prova("B-04 · nome ripetuto: non apre amb-quattro", 403, quattro.stato);

  /* e il verso opposto: il perimetro che nomina una categoria ASSENTE */
  await prisma.club.update({
    where: { id: CLUB_B },
    data: {
      trainers: [
        {
          id: "tb-aldo",
          first_name: "Aldo",
          last_name: "R6g",
          email: ALDO_U.email,
          linkedUserId: ALDO_U.id,
          categories: ["categoria-cancellata"],
          groups: [],
        },
      ],
    },
  });
  const assente = await crea(ALDO_B, base({ categoryId: "categoria-cancellata" }));
  info("B-05 perimetro su categoria assente dal registro", {
    stato: assente.stato,
    errore: String(assente.corpo?.error?.message ?? "").slice(0, 90),
  });
  const versoDueDopo = await crea(ALDO_B, base({ categoryId: "amb-due" }));
  prova("B-06 · con quel perimetro non raggiunge piu amb-due", 403, versoDueDopo.stato);
};

/* ------------------------------------------------------------------- C - */

const dueAssi = async () => {
  console.log("\nC — i due assi in AND (club A)");

  /* Aldo ha gruppo GRP_A e categoria Under 12. */
  const soliGruppiPropri = await crea(ALDO, base({ groupIds: [GRP_A] }));
  prova("C-01 · evento di soli gruppi propri (legittimo)", 200, soliGruppiPropri.stato,
    JSON.stringify(soliGruppiPropri.corpo?.error?.message ?? null));

  const soleCategoriePropri = await crea(ALDO, base({ categoryId: CAT_A }));
  prova("C-02 · evento di sole categorie proprie (legittimo)", 200, soleCategoriePropri.stato);

  const entrambiPropri = await crea(ALDO, base({ groupIds: [GRP_A], categoryId: CAT_A }));
  prova("C-03 · evento con gruppo e categoria propri (legittimo)", 200, entrambiPropri.stato);

  const gruppoProprioCategoriaAltrui = await crea(ALDO, base({ groupIds: [GRP_A], categoryId: CAT_B }));
  prova("C-04 · gruppo proprio + categoria altrui", 403, gruppoProprioCategoriaAltrui.stato);

  const gruppoAltruiCategoriaPropria = await crea(ALDO, base({ groupIds: [GRP_B], categoryId: CAT_A }));
  prova("C-05 · gruppo altrui + categoria propria", 403, gruppoAltruiCategoriaPropria.stato);

  const gruppiMisti = await crea(ALDO, base({ groupIds: [GRP_A, GRP_B], categoryId: CAT_A }));
  prova("C-06 · gruppi misti + categoria propria", 403, gruppiMisti.stato);

  const soliGruppiAltrui = await crea(ALDO, base({ groupIds: [GRP_B] }));
  prova("C-07 · evento di soli gruppi altrui", 403, soliGruppiAltrui.stato);

  const nulla = await crea(ALDO, base({}));
  prova("C-08 · evento senza nessun asse", 403, nulla.stato);

  /*
    **Carlo non ha gruppi dichiarati.** Il ramo dei gruppi restituisce `null`
    quando *il perimetro* non ne ha, non solo quando l'evento non ne ha: cosa
    succede a un evento che dichiara il gruppo di Bruno e la categoria di
    Carlo?
  */
  const carloGruppoAltrui = await crea(
    CARLO,
    base({ groupIds: [GRP_B], categoryId: CAT_A, title: "CARLO-NEL-GRUPPO-DI-BRUNO" }),
  );
  const rigaCarlo = await rigaDi(carloGruppoAltrui);
  prova(
    "C-09 · allenatore SENZA gruppi non tagga l'evento col gruppo di un altro",
    true,
    carloGruppoAltrui.stato >= 400 ||
      !JSON.stringify(rigaCarlo?.group_ids ?? []).includes(GRP_B),
    `stato ${carloGruppoAltrui.stato} gruppi ${JSON.stringify(rigaCarlo?.group_ids ?? null)}`,
  );
  if (rigaCarlo) {
    const calendarioB = await invia(BRUNO, "/api/v1/events?kind=all");
    const titoli = (calendarioB.corpo?.data || []).map((e) => e?.title);
    prova(
      "C-09b · e l'evento non entra nel calendario di Bruno",
      false,
      titoli.includes("CARLO-NEL-GRUPPO-DI-BRUNO"),
      JSON.stringify(titoli),
    );
  }

  const carloProprio = await crea(CARLO, base({ categoryId: CAT_A }));
  prova("C-10 · Carlo scrive il proprio evento di categoria (legittimo)", 200, carloProprio.stato,
    JSON.stringify(carloProprio.corpo?.error?.message ?? null));

  const carloSoliGruppi = await crea(CARLO, base({ groupIds: [GRP_A] }));
  info("C-11 Carlo (senza gruppi) crea un evento di soli gruppi", {
    stato: carloSoliGruppi.stato,
    errore: String(carloSoliGruppi.corpo?.error?.message ?? "").slice(0, 90),
  });

  /* PATCH che aggiunge il gruppo altrui al proprio evento */
  const mio = await crea(ALDO, base({ categoryId: CAT_A, title: "ALDO-DA-TAGGARE" }));
  const MIO = mio.corpo?.data?.id ?? null;
  if (MIO) {
    const tagga = await invia(ALDO, `/api/v1/events/${MIO}`, {
      method: "PATCH",
      body: JSON.stringify({ groupIds: [GRP_B] }),
    });
    const dopo = await prisma.clubEvent.findUnique({ where: { id: MIO } });
    prova(
      "C-12 · PATCH che aggiunge il gruppo altrui al proprio evento",
      true,
      tagga.stato >= 400 || !JSON.stringify(dopo?.group_ids ?? []).includes(GRP_B),
      `stato ${tagga.stato} gruppi ${JSON.stringify(dopo?.group_ids ?? null)}`,
    );
  }
};

/* ------------------------------------------------------------------- D - */

const lettura = async () => {
  console.log("\nD — la lettura, che ADR-0055 lascia al gruppo");

  const suoi = await invia(ALDO, "/api/v1/events?kind=all");
  const titoli = (suoi.corpo?.data || []).map((e) => e?.title);
  info("D-01 quanti eventi legge Aldo", { stato: suoi.stato, quanti: titoli.length });
  prova("D-02 · Aldo legge almeno i propri eventi", true, titoli.length > 0);

  const diBruno = await invia(BRUNO, "/api/v1/events?kind=all");
  const titoliB = (diBruno.corpo?.data || []).map((e) => e?.title);
  info("D-03 quanti eventi legge Bruno", { stato: diBruno.stato, quanti: titoliB.length });
};

/* ==================================================================== */

const main = async () => {
  await semina();
  CAPO = await identita(CAPO_U, "owner", CLUB_A);
  ALDO = await identita(ALDO_U, "trainer", CLUB_A);
  BRUNO = await identita(BRUNO_U, "trainer", CLUB_A);
  CARLO = await identita(CARLO_U, "trainer", CLUB_A);
  ALDO_B = await identita(ALDO_U, "trainer", CLUB_B);
  BRUNO_B = await identita(BRUNO_U, "trainer", CLUB_B);

  await grafieDelRegistro();
  await dueAssi();
  await registroAmbiguo();
  await lettura();

  const rossi = esiti.filter((e) => !e.ok);
  console.log(`\n  ${esiti.length - rossi.length}/${esiti.length} verdi.`);
  if (rossi.length) {
    console.log("\n  ROSSI:");
    for (const r of rossi) console.log(`   - ${r.titolo}`);
  }
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pulisci();
    await prisma.$disconnect();
  });
