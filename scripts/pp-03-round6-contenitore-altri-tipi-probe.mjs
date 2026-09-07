/**
 * **PP-03 round 6 — §15.3 dal lato che il round 5 non ha battuto: le ALTRE
 * risorse di club dentro `club_resource_items`.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/pp-03-round6-contenitore-altri-tipi-probe.mjs
 *
 * La correzione smista per `resource_type` e rimanda al vaglio dell'allenatore
 * **solo** i tipi che stanno in `TRAINER_DASHBOARD_FILTERED_RESOURCES`. Gli
 * altri passano «come prima». La domanda di questa sonda e: **cosa passa**?
 * Per ogni tipo si misura la porta **per nome** e la porta **per contenitore**,
 * e si confrontano: se la seconda consegna quello che la prima nega, la porta
 * accanto e ancora aperta.
 *
 * `PASS` = le due porte rispondono allo stesso modo (o entrambe negano).
 * `FAIL` = il contenitore consegna quello che il nome nega.
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
  headers.set("x-active-club-id", identita?.club || CLUB);
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

const identita = async (riga, ruolo) => {
  const auth = await carica("src/lib/server/auth.ts");
  const sessione = await auth.createSessionForUser(riga);
  return { token: sessione.access_token, ruolo, club: CLUB };
};

/* ------------------------------------------------------------- gli attori */

const CLUB = randomUUID();
const CAT_A = "cat-r6r-alfa";
const CAT_B = "cat-r6r-beta";

let CAPO_U = null;
let MISTER_U = null;
let CAPO = null;
let MISTER = null;

/* Un marcatore per tipo: si cerca la stringa nella risposta. */
const TIPI = [
  ["trainers", "SEGRETO-TRAINERS-R6R"],
  ["staff_members", "SEGRETO-STAFF-R6R"],
  ["discounts", "SEGRETO-SCONTI-R6R"],
  ["procure", "SEGRETO-PROCURE-R6R"],
  ["sponsors", "SEGRETO-SPONSOR-R6R"],
  ["transactions", "SEGRETO-MOVIMENTI-R6R"],
  ["transfers", "SEGRETO-GIROCONTI-R6R"],
  ["expected_income", "SEGRETO-ATTESI-R6R"],
  ["payment_plans", "SEGRETO-PIANI-R6R"],
  ["members", "SEGRETO-SOCI-R6R"],
  ["bank_accounts", "SEGRETO-IBAN-R6R"],
  ["access_tokens", "SEGRETO-GETTONI-R6R"],
  ["document_templates", "SEGRETO-MODELLI-R6R"],
  ["clothing_inventory", "SEGRETO-MAGAZZINO-R6R"],
  ["opening_hours", "SEGRETO-ORARI-R6R"],
];

const utente = async (email, nome) => {
  const trovato = await prisma.user.findUnique({ where: { email } });
  if (trovato) return trovato;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      first_name: nome,
      last_name: "R6r",
      password_hash: "$2b$10$pp03r6r",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const semina = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp03r6r-" } },
    select: { id: true },
  });
  if (residui.length) {
    const ids = residui.map((r) => r.id);
    await prisma.auditLog.deleteMany({ where: { organization_id: { in: ids } } }).catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }

  CAPO_U = await utente("pp03r6r-capo@example.invalid", "Anna");
  MISTER_U = await utente("pp03r6r-mister@example.invalid", "Aldo");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `pp03r6r-${Date.now()}`,
      name: "ASD R6r",
      creator_id: CAPO_U.id,
      settings: {
        seasons: [
          { id: "2026-27", label: "2026/27", startDate: "2026-07-01", endDate: "2027-06-30", status: "active" },
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
          id: "t-aldo",
          first_name: "Aldo",
          last_name: "R6r",
          email: MISTER_U.email,
          linkedUserId: MISTER_U.id,
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

  for (const [riga, ruolo] of [
    [CAPO_U, "owner"],
    [MISTER_U, "trainer"],
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

  /* Una riga per tipo, con il marcatore dentro `payload`. */
  for (const [tipo, marcatore] of TIPI) {
    await prisma.clubResourceItem.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        resource_type: tipo,
        name: `${tipo}-r6r`,
        payload: { id: `${tipo}-r6r`, name: marcatore, note: marcatore },
        updated_at: new Date(),
      },
    });
  }

  /*
    **Le grafie del tipo.** Il vaglio si accende su
    `canonicalResourceName(record.resource_type)`: se una riga porta il tipo
    in una grafia che quella funzione non riconduce, il vaglio non la vede.
  */
  for (const grafia of ["Secretariat_Notes", " secretariat_notes ", "SECRETARIAT_NOTES", "secretariat_note"]) {
    await prisma.clubResourceItem.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        resource_type: grafia,
        name: `grafia-${grafia.trim().toLowerCase()}`,
        payload: {
          id: `grafia-${grafia.trim()}`,
          title: `SEGRETO-GRAFIA-${grafia.trim().toUpperCase().replace(/s/g, "")}-R6R`,
          body: "famiglia morosa",
          targetType: "management",
          date: new Date().toISOString(),
        },
        updated_at: new Date(),
      },
    });
  }

  /*
    Tre note di segreteria: una destinata a tutti gli allenatori (deve
    arrivare), due interne (non devono). Serve per il **verso opposto**.
  */
  await prisma.clubResourceItem.createMany({
    data: [
      {
        id: randomUUID(),
        organization_id: CLUB,
        resource_type: "secretariat_notes",
        name: "nota-per-tutti",
        payload: {
          id: "nota-per-tutti",
          title: "NOTA-LEGITTIMA-R6R",
          body: "riunione tecnica",
          targetType: "all_trainers",
          date: new Date().toISOString(),
        },
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB,
        resource_type: "secretariat_notes",
        name: "nota-interna",
        payload: {
          id: "nota-interna",
          title: "SEGRETO-NOTA-INTERNA-R6R",
          body: "famiglia morosa",
          targetType: "management",
          date: new Date().toISOString(),
        },
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB,
        resource_type: "secretariat_notes",
        name: "nota-disciplinare",
        payload: {
          id: "nota-disciplinare",
          title: "SEGRETO-DISCIPLINARE-R6R",
          body: "procedimento verso un collega",
          targetType: "custom",
          targetTrainerIds: ["t-nessuno"],
          date: new Date().toISOString(),
        },
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

const contiene = (risposta, ago) => JSON.stringify(risposta.corpo ?? null).includes(ago);

/* ------------------------------------------------------------------- A - */

const dueParte = async () => {
  console.log("\nA — per ogni tipo: la porta per nome e la porta per contenitore");

  for (const [tipo, marcatore] of TIPI) {
    const perNome = await invia(MISTER, `/api/v1/${tipo}?club_id=${CLUB}`);
    const perContenitore = await invia(
      MISTER,
      `/api/v1/club_resource_items?club_id=${CLUB}&resource_type=${tipo}`,
    );
    const daNome = perNome.stato < 400 && contiene(perNome, marcatore);
    const daContenitore = perContenitore.stato < 400 && contiene(perContenitore, marcatore);
    prova(
      `A · ${tipo}: il contenitore non da piu del nome`,
      false,
      daContenitore && !daNome,
      `nome ${perNome.stato}/${daNome} · contenitore ${perContenitore.stato}/${daContenitore}`,
    );
    info(`A · ${tipo} stati`, { nome: perNome.stato, daNome, contenitore: perContenitore.stato, daContenitore, righe: (perContenitore.corpo?.data || []).length });
  }
};

/* ------------------------------------------------------------------- B - */

const senzaFiltro = async () => {
  console.log("\nB — il contenitore senza `resource_type`, e la riga per identificativo");

  const tutto = await invia(MISTER, `/api/v1/club_resource_items?club_id=${CLUB}&limit=500`);
  const usciti = TIPI.filter(([, m]) => contiene(tutto, m)).map(([t]) => t);
  info("B-01 tipi che escono dal contenitore senza filtro", {
    stato: tutto.stato,
    righe: (tutto.corpo?.data || []).length,
    tipi: usciti,
  });
  prova(
    "B-02 · la nota interna non esce dal contenitore senza filtro",
    false,
    contiene(tutto, "SEGRETO-NOTA-INTERNA-R6R") || contiene(tutto, "SEGRETO-DISCIPLINARE-R6R"),
    `stato ${tutto.stato}`,
  );

  /* la riga per identificativo, per ogni tipo che ha marcatore */
  for (const [tipo, marcatore] of TIPI) {
    const riga = await prisma.clubResourceItem.findFirst({
      where: { organization_id: CLUB, resource_type: tipo },
    });
    if (!riga) continue;
    const perNome = await invia(MISTER, `/api/v1/${tipo}/${tipo}-r6r?club_id=${CLUB}`);
    const perId = await invia(MISTER, `/api/v1/club_resource_items/${riga.id}?club_id=${CLUB}`);
    const daNome = perNome.stato < 400 && contiene(perNome, marcatore);
    const daId = perId.stato < 400 && contiene(perId, marcatore);
    prova(
      `B · ${tipo}: la lettura per identificativo non da piu del nome`,
      false,
      daId && !daNome,
      `nome ${perNome.stato}/${daNome} · id ${perId.stato}/${daId}`,
    );
  }

  const interna = await prisma.clubResourceItem.findFirst({
    where: { organization_id: CLUB, name: "nota-interna" },
  });
  const letturaInterna = await invia(MISTER, `/api/v1/club_resource_items/${interna.id}?club_id=${CLUB}`);
  prova(
    "B-03 · la nota interna per identificativo",
    false,
    letturaInterna.stato < 400 && contiene(letturaInterna, "SEGRETO-NOTA-INTERNA-R6R"),
    `stato ${letturaInterna.stato}`,
  );
};

/* ------------------------------------------------------------------- C - */

const proiezioniEPagine = async () => {
  console.log("\nC — ?fields=, ?view=, paginazione e meta.total");

  const conFields = await invia(
    MISTER,
    `/api/v1/club_resource_items?club_id=${CLUB}&resource_type=secretariat_notes&fields=id,payload`,
  );
  prova(
    "C-01 · ?fields=id,payload non riporta la nota interna",
    false,
    contiene(conFields, "SEGRETO-NOTA-INTERNA-R6R") || contiene(conFields, "SEGRETO-DISCIPLINARE-R6R"),
    `stato ${conFields.stato}`,
  );

  const conFieldsSenzaTipo = await invia(
    MISTER,
    `/api/v1/club_resource_items?club_id=${CLUB}&fields=id,payload&limit=500`,
  );
  prova(
    "C-02 · ?fields= senza resource_type non riporta la nota interna",
    false,
    contiene(conFieldsSenzaTipo, "SEGRETO-NOTA-INTERNA-R6R") ||
      contiene(conFieldsSenzaTipo, "SEGRETO-DISCIPLINARE-R6R"),
    `stato ${conFieldsSenzaTipo.stato}`,
  );

  const conView = await invia(
    MISTER,
    `/api/v1/club_resource_items?club_id=${CLUB}&resource_type=secretariat_notes&view=summary`,
  );
  prova(
    "C-03 · ?view=summary non riporta la nota interna",
    false,
    contiene(conView, "SEGRETO-NOTA-INTERNA-R6R") || contiene(conView, "SEGRETO-DISCIPLINARE-R6R"),
    `stato ${conView.stato}`,
  );

  const pagina = await invia(
    MISTER,
    `/api/v1/club_resource_items?club_id=${CLUB}&resource_type=secretariat_notes&limit=10&offset=0`,
  );
  const righe = (pagina.corpo?.data || []).length;
  const totale = pagina.corpo?.meta?.total ?? null;
  prova("C-04 · meta.total sul contenitore filtrato", 1, totale, `righe ${righe}`);
  prova("C-05 · righe consegnate", 1, righe);

  /* la paginazione che salta la prima pagina: la seconda non deve rivelare */
  const secondaPagina = await invia(
    MISTER,
    `/api/v1/club_resource_items?club_id=${CLUB}&resource_type=secretariat_notes&limit=1&offset=1`,
  );
  prova(
    "C-06 · la seconda pagina non porta la nota interna",
    false,
    contiene(secondaPagina, "SEGRETO-NOTA-INTERNA-R6R") ||
      contiene(secondaPagina, "SEGRETO-DISCIPLINARE-R6R"),
    `stato ${secondaPagina.stato}; righe ${(secondaPagina.corpo?.data || []).length}`,
  );

  /* il conteggio dal nome, per confronto */
  const perNome = await invia(MISTER, `/api/v1/secretariat_notes?club_id=${CLUB}&limit=10&offset=0`);
  info("C-07 la porta per nome", {
    stato: perNome.stato,
    righe: (perNome.corpo?.data || []).length,
    total: perNome.corpo?.meta?.total ?? null,
  });
};

/* ------------------------------------------------------------------- D - */

const scrittureDalContenitore = async () => {
  console.log("\nD — le scritture dal contenitore");

  const interna = await prisma.clubResourceItem.findFirst({
    where: { organization_id: CLUB, name: "nota-interna" },
  });

  const patch = await invia(MISTER, `/api/v1/club_resource_items/${interna.id}`, {
    method: "PATCH",
    body: JSON.stringify({ payload: { id: "nota-interna", title: "RISCRITTA-R6R" } }),
  });
  const dopoPatch = await prisma.clubResourceItem.findUnique({ where: { id: interna.id } });
  prova(
    "D-01 · PATCH della nota interna dal contenitore",
    true,
    patch.stato >= 400 && !JSON.stringify(dopoPatch?.payload).includes("RISCRITTA"),
    `stato ${patch.stato} ${JSON.stringify(patch.corpo?.error?.message ?? null)}`,
  );

  const cancella = await invia(MISTER, `/api/v1/club_resource_items/${interna.id}`, {
    method: "DELETE",
  });
  const esiste = await prisma.clubResourceItem.count({ where: { id: interna.id } });
  prova(
    "D-02 · DELETE della nota interna dal contenitore",
    true,
    cancella.stato >= 400 && esiste === 1,
    `stato ${cancella.stato}`,
  );

  const crea = await invia(MISTER, "/api/v1/club_resource_items", {
    method: "POST",
    body: JSON.stringify({
      organization_id: CLUB,
      resource_type: "access_tokens",
      resource_id: "gettone-forgiato-r6r",
      payload: { id: "gettone-forgiato-r6r", value: "FORGIATO-R6R" },
    }),
  });
  const creata = await prisma.clubResourceItem.count({
    where: { organization_id: CLUB, name: "gettone-forgiato-r6r" },
  });
  prova(
    "D-03 · POST di un access_token dal contenitore",
    true,
    crea.stato >= 400 && creata === 0,
    `stato ${crea.stato} ${JSON.stringify(crea.corpo?.error?.message ?? null)}`,
  );
};

/* ------------------------------------------------------------------- E - */

const versoOpposto = async () => {
  console.log("\nE — il verso opposto: la nota legittima e il controllo positivo");

  const perNome = await invia(MISTER, `/api/v1/secretariat_notes?club_id=${CLUB}`);
  prova(
    "E-01 · la nota legittima arriva dalla porta per nome",
    true,
    contiene(perNome, "NOTA-LEGITTIMA-R6R"),
    `stato ${perNome.stato}; righe ${(perNome.corpo?.data || []).length}`,
  );

  const perContenitore = await invia(
    MISTER,
    `/api/v1/club_resource_items?club_id=${CLUB}&resource_type=secretariat_notes`,
  );
  prova(
    "E-02 · e anche dalla porta per contenitore",
    true,
    contiene(perContenitore, "NOTA-LEGITTIMA-R6R"),
    `stato ${perContenitore.stato}; righe ${(perContenitore.corpo?.data || []).length}`,
  );

  const senzaTipo = await invia(MISTER, `/api/v1/club_resource_items?club_id=${CLUB}&limit=500`);
  prova(
    "E-03 · e anche dal contenitore senza filtro",
    true,
    contiene(senzaTipo, "NOTA-LEGITTIMA-R6R"),
    `stato ${senzaTipo.stato}`,
  );

  const legittima = await prisma.clubResourceItem.findFirst({
    where: { organization_id: CLUB, name: "nota-per-tutti" },
  });
  const perId = await invia(MISTER, `/api/v1/club_resource_items/${legittima.id}?club_id=${CLUB}`);
  prova(
    "E-04 · e anche per identificativo",
    true,
    perId.stato < 400 && contiene(perId, "NOTA-LEGITTIMA-R6R"),
    `stato ${perId.stato}`,
  );

  /* alla direzione deve arrivare tutto */
  const direzione = await invia(CAPO, `/api/v1/club_resource_items?club_id=${CLUB}&limit=500`);
  const tutte = ["NOTA-LEGITTIMA-R6R", "SEGRETO-NOTA-INTERNA-R6R", "SEGRETO-DISCIPLINARE-R6R"];
  prova(
    "E-05 · alla direzione arriva tutto dal contenitore",
    true,
    tutte.every((m) => contiene(direzione, m)),
    `stato ${direzione.stato}; righe ${(direzione.corpo?.data || []).length}`,
  );

  const direzionePerNome = await invia(CAPO, `/api/v1/secretariat_notes?club_id=${CLUB}`);
  prova(
    "E-06 · e anche dalla porta per nome",
    true,
    tutte.every((m) => contiene(direzionePerNome, m)),
    `stato ${direzionePerNome.stato}`,
  );
};

/* ------------------------------------------------------------------- G - */

const grafieDelTipo = async () => {
  console.log("\nG — il tipo della riga scritto in grafie diverse");

  const tutto = await invia(MISTER, `/api/v1/club_resource_items?club_id=${CLUB}&limit=500`);
  const testo = JSON.stringify(tutto.corpo ?? null);
  const fuggite = ["SEGRETO-GRAFIA-SECRETARIAT_NOTES-R6R", "SEGRETO-GRAFIA-SECRETARIAT_NOTE-R6R"].filter(
    (m) => testo.includes(m),
  );
  prova("G-01 · nessuna grafia del tipo fa uscire la nota interna", [], fuggite,
    `stato ${tutto.stato}; righe ${(tutto.corpo?.data || []).length}`);

  for (const grafia of ["Secretariat_Notes", "%20secretariat_notes%20", "SECRETARIAT_NOTES", "secretariat_note"]) {
    const r = await invia(MISTER, `/api/v1/club_resource_items?club_id=${CLUB}&resource_type=${grafia}&limit=500`);
    const t = JSON.stringify(r.corpo ?? null);
    prova(
      `G · ?resource_type=${grafia} non porta note interne`,
      false,
      t.includes("SEGRETO-GRAFIA") || t.includes("SEGRETO-NOTA-INTERNA-R6R") || t.includes("SEGRETO-DISCIPLINARE-R6R"),
      `stato ${r.stato}; righe ${(r.corpo?.data || []).length}`,
    );
  }

  /* e per identificativo */
  const righeGrafia = await prisma.clubResourceItem.findMany({
    where: { organization_id: CLUB, name: { startsWith: "grafia-" } },
  });
  for (const riga of righeGrafia) {
    const r = await invia(MISTER, `/api/v1/club_resource_items/${riga.id}?club_id=${CLUB}`);
    prova(
      `G-id · ${riga.resource_type.trim()} per identificativo`,
      false,
      r.stato < 400 && JSON.stringify(r.corpo ?? null).includes("SEGRETO-GRAFIA"),
      `stato ${r.stato}`,
    );
  }
};

/* ------------------------------------------------------------------- F - */

const enumerazione = async () => {
  console.log("\nF — si possono enumerare gli identificativi delle righe negate?");

  const soloId = await invia(MISTER, `/api/v1/club_resource_items?club_id=${CLUB}&fields=id,resource_type&limit=500`);
  const idVisti = (soloId.corpo?.data || []).map((r) => r?.id).filter(Boolean);
  const tutteLeRighe = await prisma.clubResourceItem.count({ where: { organization_id: CLUB } });
  info("F-01 identificativi visibili al trainer", {
    stato: soloId.stato,
    visti: idVisti.length,
    inArchivio: tutteLeRighe,
    total: soloId.corpo?.meta?.total ?? null,
  });
  prova(
    "F-02 · meta.total non rivela quante righe negate esistono",
    true,
    (soloId.corpo?.meta?.total ?? idVisti.length) === idVisti.length,
    `total ${soloId.corpo?.meta?.total ?? null} vs visti ${idVisti.length} su ${tutteLeRighe}`,
  );

  const perTipo = await invia(
    MISTER,
    `/api/v1/club_resource_items?club_id=${CLUB}&resource_type=discounts&fields=id&limit=500`,
  );
  prova(
    "F-03 · ?resource_type=discounts&fields=id non elenca identificativi",
    0,
    (perTipo.corpo?.data || []).length,
    `stato ${perTipo.stato}; total ${perTipo.corpo?.meta?.total ?? null}`,
  );
};

/* ==================================================================== */

const main = async () => {
  await semina();
  CAPO = await identita(CAPO_U, "owner");
  MISTER = await identita(MISTER_U, "trainer");

  await dueParte();
  await senzaFiltro();
  await proiezioniEPagine();
  await scrittureDalContenitore();
  await versoOpposto();
  await grafieDelTipo();
  await enumerazione();

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
