/**
 * **PP-03 round 4 — il perimetro dell'evento, attaccato dalle grafie.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/pp-03-round4-perimetro-eventi-probe.mjs
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
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(72)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        ${nota}`);
};

/* ---------------------------------------------------------- gli attori -- */

const CLUB = randomUUID();
const CAT_A = "cat-r4-a";
const CAT_B = "cat-r4-b";
const CAT_C = "cat-r4-c";
const GRUPPO_A = "grp-r4-a";
const GRUPPO_B = "grp-r4-b";
const SEDE_1 = "sede-r4-nord";
const SEDE_2 = "sede-r4-sud";

let PRESIDENTE = null;
let MISTER_A = null; // categoria A, gruppo A
let MISTER_B = null; // categoria B
let MISTER_G = null; // solo gruppo A, nessuna categoria

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
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
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
      last_name: "Round4",
      password_hash: "$2b$10$pp03r4",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const semina = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp03r4-" } },
    select: { id: true },
  });
  if (residui.length) {
    const ids = residui.map((r) => r.id);
    await prisma.auditLog.deleteMany({ where: { organization_id: { in: ids } } }).catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }

  PRESIDENTE = await utente("pp03r4-presidente@example.invalid", "Anna");
  MISTER_A = await utente("pp03r4-mister-a@example.invalid", "Aldo");
  MISTER_B = await utente("pp03r4-mister-b@example.invalid", "Bruno");
  MISTER_G = await utente("pp03r4-mister-g@example.invalid", "Gino");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `pp03r4-${Date.now()}`,
      name: "ASD Round4",
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
        /*
          La categoria C si chiama **come l'identificativo** di A: e il caso
          che il verbale nomina e non misura.
        */
        { id: CAT_C, name: CAT_A },
      ],
      club_sites: [
        { id: SEDE_1, name: "Sede Nord", active: true },
        { id: SEDE_2, name: "Sede Sud", active: true },
      ],
      category_groups: [
        { id: GRUPPO_A, name: "Gruppo A", categoryId: CAT_A },
        { id: GRUPPO_B, name: "Gruppo B", categoryId: CAT_B },
      ],
      structures: [],
      trainers: [
        {
          id: "trainer-r4-a",
          first_name: "Aldo",
          last_name: "Round4",
          email: MISTER_A.email,
          linkedUserId: MISTER_A.id,
          categories: [CAT_A],
          groups: [GRUPPO_A],
        },
        {
          id: "trainer-r4-b",
          first_name: "Bruno",
          last_name: "Round4",
          email: MISTER_B.email,
          linkedUserId: MISTER_B.id,
          categories: [CAT_B],
          groups: [GRUPPO_B],
        },
        {
          id: "trainer-r4-g",
          first_name: "Gino",
          last_name: "Round4",
          email: MISTER_G.email,
          linkedUserId: MISTER_G.id,
          categories: [],
          groups: [GRUPPO_A],
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
    [MISTER_G, "trainer"],
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
};

const pulisci = async () => {
  await prisma.auditLog.deleteMany({ where: { organization_id: CLUB } }).catch(() => {});
  await prisma.club.deleteMany({ where: { id: CLUB } }).catch((e) => {
    console.error(`Pulizia non riuscita: ${e?.message}`);
  });
};

/* ==================================================================== */

const crea = (corpo) =>
  chiama("/api/v1/events", { method: "POST", body: JSON.stringify(corpo) });

const baseAllenamento = (extra) => ({
  kind: "training",
  title: "Allenamento sonda",
  date: "2026-10-12",
  time: "18:00",
  endTime: "19:30",
  seasonId: "2026-27",
  ...extra,
});

const categoriaSuArchivio = async (id) => {
  const riga = await prisma.clubEvent.findUnique({
    where: { id },
    select: { category_id: true, category_ids: true, group_ids: true, site_id: true },
  });
  return riga;
};

const attaccoGrafie = async () => {
  console.log("\nA — le grafie della categoria (§11.2)");
  await comeUtente(MISTER_A, "trainer");

  /* Controllo di sanita: la categoria propria passa. */
  const legittimo = await crea(
    baseAllenamento({ categoryId: CAT_A, categoryName: "Under 12" }),
  );
  prova("A-00 · controllo: la propria categoria crea", 200, legittimo.stato,
    JSON.stringify(legittimo.corpo?.error ?? null));

  /* A-01 — `categoryName` porta l'identificativo proprio, `categoryId` e altrui. */
  const nomeFinto = await crea(
    baseAllenamento({
      categoryId: CAT_B,
      categoryName: CAT_A,
      title: "ATTACCO nome=idProprio",
      time: "20:00",
      endTime: "21:00",
    }),
  );
  prova(
    "A-01 · categoryId altrui + categoryName = proprio id",
    403,
    nomeFinto.stato,
    `messaggio ${JSON.stringify(nomeFinto.corpo?.error?.message ?? null)}`,
  );
  if (nomeFinto.stato === 200) {
    const riga = await categoriaSuArchivio(nomeFinto.corpo?.data?.id);
    console.log(`        riga scritta: ${JSON.stringify(riga)}`);
  }

  /* A-02 — maiuscole/minuscole sull'identificativo proprio. */
  const maiuscole = await crea(
    baseAllenamento({
      categoryId: CAT_B,
      categoryName: CAT_A.toUpperCase(),
      title: "ATTACCO nome=ID-MAIUSCOLO",
      time: "21:00",
      endTime: "22:00",
    }),
  );
  prova(
    "A-02 · categoryName = proprio id in MAIUSCOLO",
    403,
    maiuscole.stato,
    JSON.stringify(maiuscole.corpo?.error?.message ?? null),
  );

  /* A-03 — la categoria C si chiama come l'id di A: la sua identita non e di A. */
  const omonima = await crea(
    baseAllenamento({
      categoryId: CAT_C,
      categoryName: CAT_A,
      title: "ATTACCO categoria omonima",
      time: "08:00",
      endTime: "09:00",
    }),
  );
  prova(
    "A-03 · categoria C (nome == id di A) creata da A",
    403,
    omonima.stato,
    JSON.stringify(omonima.corpo?.error?.message ?? null),
  );

  /* A-04 — `categories` altrui, nome proprio in primaria. */
  const multiple = await crea(
    baseAllenamento({
      categoryId: CAT_A,
      categoryName: "Under 12",
      categories: [CAT_A, CAT_B],
      title: "ATTACCO congiunto con B",
      time: "09:30",
      endTime: "10:30",
    }),
  );
  prova(
    "A-04 · congiunto A+B creato da A (scrittura = tutte dentro)",
    403,
    multiple.stato,
    JSON.stringify(multiple.corpo?.error?.message ?? null),
  );

  /* A-05 — spazi in coda sull'identificativo proprio. */
  const spazi = await crea(
    baseAllenamento({
      categoryId: CAT_B,
      categoryName: ` ${CAT_A} `,
      title: "ATTACCO nome con spazi",
      time: "11:00",
      endTime: "12:00",
    }),
  );
  prova(
    "A-05 · categoryName = ' proprio id ' (spazi)",
    403,
    spazi.stato,
    JSON.stringify(spazi.corpo?.error?.message ?? null),
  );
};

const attaccoGruppi = async () => {
  console.log("\nB — il ramo dei gruppi che esce prima delle categorie");
  await comeUtente(MISTER_A, "trainer");

  /* B-01 — gruppo proprio + categoria altrui: il ramo gruppi esce per primo. */
  const gruppoProprio = await crea(
    baseAllenamento({
      categoryId: CAT_B,
      categoryName: "Under 15",
      groupIds: [GRUPPO_A],
      title: "ATTACCO gruppo mio + categoria di B",
      time: "13:00",
      endTime: "14:00",
    }),
  );
  prova(
    "B-01 · groupIds proprio + categoryId altrui",
    403,
    gruppoProprio.stato,
    JSON.stringify(gruppoProprio.corpo?.error?.message ?? null),
  );
  if (gruppoProprio.stato === 200) {
    const riga = await categoriaSuArchivio(gruppoProprio.corpo?.data?.id);
    console.log(`        riga scritta: ${JSON.stringify(riga)}`);
  }

  /* B-02 — allenatore con solo gruppi e nessuna categoria: evento senza gruppi. */
  await comeUtente(MISTER_G, "trainer");
  const soloGruppi = await crea(
    baseAllenamento({
      categoryId: CAT_B,
      categoryName: "Under 15",
      title: "ATTACCO da allenatore solo-gruppi",
      time: "15:00",
      endTime: "16:00",
    }),
  );
  prova(
    "B-02 · allenatore con soli gruppi crea su categoria altrui",
    403,
    soloGruppi.stato,
    JSON.stringify(soloGruppi.corpo?.error?.message ?? null),
  );

  /* B-03 — evento con gruppo altrui, ma il creatore non ha gruppi propri validi. */
  await comeUtente(MISTER_A, "trainer");
  const gruppoAltrui = await crea(
    baseAllenamento({
      categoryId: CAT_A,
      categoryName: "Under 12",
      groupIds: [GRUPPO_B],
      title: "ATTACCO gruppo di B su categoria mia",
      time: "16:30",
      endTime: "17:30",
    }),
  );
  prova(
    "B-03 · groupIds del collega su categoria propria",
    403,
    gruppoAltrui.stato,
    JSON.stringify(gruppoAltrui.corpo?.error?.message ?? null),
  );
};

const attaccoAltriCampi = async () => {
  console.log("\nC — gli altri campi che il modulo nuovo manda");
  await comeUtente(MISTER_A, "trainer");

  /* C-01 — categoria vuota: evento di nessuno. */
  const senzaCategoria = await crea(
    baseAllenamento({
      title: "ATTACCO senza categoria",
      time: "06:00",
      endTime: "07:00",
    }),
  );
  prova(
    "C-01 · evento senza nessuna categoria",
    403,
    senzaCategoria.stato,
    JSON.stringify(senzaCategoria.corpo?.error?.message ?? null),
  );

  /* C-02 — category_ids con stringa vuota + propria: `every` su vuoti. */
  const vuoti = await crea(
    baseAllenamento({
      categoryId: CAT_A,
      categoryName: "Under 12",
      categories: [CAT_A, "", "   ", CAT_B],
      title: "ATTACCO categorie con vuoti",
      time: "07:15",
      endTime: "08:00",
    }),
  );
  prova(
    "C-02 · categories = [propria, '', '   ', altrui]",
    403,
    vuoti.stato,
    JSON.stringify(vuoti.corpo?.error?.message ?? null),
  );

  /* C-03 — trainer_ids: assegnare l'evento a un collega. */
  const conAltroAllenatore = await crea(
    baseAllenamento({
      categoryId: CAT_A,
      categoryName: "Under 12",
      trainerIds: ["trainer-r4-b"],
      title: "evento con trainer altrui",
      time: "05:00",
      endTime: "05:45",
    }),
  );
  console.log(
    `  INFO  C-03 trainer_ids del collega -> stato ${conAltroAllenatore.stato}`,
  );

  /* C-04 — status iniziale «completed» per saltare la macchina a stati. */
  const statoIniziale = await crea(
    baseAllenamento({
      categoryId: CAT_A,
      categoryName: "Under 12",
      status: "completed",
      title: "evento nato concluso",
      time: "04:00",
      endTime: "04:45",
    }),
  );
  console.log(
    `  INFO  C-04 status:"completed" alla creazione -> stato ${statoIniziale.stato}` +
      (statoIniziale.stato === 200
        ? ` status archiviato ${JSON.stringify(statoIniziale.corpo?.data?.row?.status ?? null)}`
        : ""),
  );

  /* C-05 — site_id fuori dal perimetro del profilo (nessun club_access_scope). */
  const sedeAltrui = await crea(
    baseAllenamento({
      categoryId: CAT_A,
      categoryName: "Under 12",
      siteId: SEDE_2,
      title: "evento in sede sud",
      time: "03:00",
      endTime: "03:45",
    }),
  );
  console.log(`  INFO  C-05 siteId di un'altra sede -> stato ${sedeAltrui.stato}`);

  /* C-06 — structure_id/field_id inventati, di nessuna sede del club. */
  const strutturaFinta = await crea(
    baseAllenamento({
      categoryId: CAT_A,
      categoryName: "Under 12",
      structureId: "struttura-inesistente",
      fieldId: "campo-inesistente",
      title: "evento su struttura inventata",
      time: "02:00",
      endTime: "02:45",
    }),
  );
  console.log(
    `  INFO  C-06 structureId/fieldId inesistenti -> stato ${strutturaFinta.stato}`,
  );

  /* C-07 — rsvpRequired: l'allenatore apre l'RSVP alle famiglie. */
  const rsvp = await crea(
    baseAllenamento({
      categoryId: CAT_A,
      categoryName: "Under 12",
      rsvpRequired: true,
      rsvpDeadline: "2026-10-11T18:00:00.000Z",
      title: "evento con RSVP aperto",
      time: "01:00",
      endTime: "01:45",
    }),
  );
  console.log(
    `  INFO  C-07 rsvpRequired:true -> stato ${rsvp.stato}` +
      (rsvp.stato === 200
        ? ` rsvp ${JSON.stringify(rsvp.corpo?.data?.row?.rsvp_required ?? null)}`
        : ""),
  );

  /* C-08 — batch: la creazione in blocco passa dallo stesso vaglio? */
  const blocco = await crea({
    kind: "training",
    events: [
      baseAllenamento({ categoryId: CAT_A, categoryName: "Under 12", time: "22:00", endTime: "22:45" }),
      baseAllenamento({ categoryId: CAT_B, categoryName: "Under 15", time: "23:00", endTime: "23:45" }),
    ],
  });
  prova(
    "C-08 · batch con un evento della categoria altrui",
    403,
    blocco.stato,
    JSON.stringify(blocco.corpo?.error?.message ?? null),
  );
};

const attaccoModifica = async () => {
  console.log("\nD — la modifica, il blocco ottimistico e la cancellazione");

  /* Un evento di B, creato dal presidente. */
  await comeUtente(PRESIDENTE, "owner");
  const diB = await crea(
    baseAllenamento({
      categoryId: CAT_B,
      categoryName: "Under 15",
      title: "allenamento di Bruno",
      date: "2026-10-19",
      time: "18:00",
      endTime: "19:00",
    }),
  );
  const EVT_B = diB.corpo?.data?.id;
  console.log(`  INFO  evento di B: ${EVT_B} (stato ${diB.stato})`);

  await comeUtente(MISTER_A, "trainer");

  /* D-01 — PATCH sull'evento di B, cambiando il nome per farlo combaciare. */
  const patchNome = await chiama(`/api/v1/events/${EVT_B}`, {
    method: "PATCH",
    body: JSON.stringify({ categoryName: CAT_A, title: "RUBATO" }),
  });
  prova(
    "D-01 · PATCH evento altrui con categoryName = proprio id",
    403,
    patchNome.stato,
    JSON.stringify(patchNome.corpo?.error?.message ?? null),
  );

  /* D-02 — PATCH aggiungendo il proprio gruppo all'evento di B. */
  const patchGruppo = await chiama(`/api/v1/events/${EVT_B}`, {
    method: "PATCH",
    body: JSON.stringify({ groupIds: [GRUPPO_A], title: "RUBATO GRUPPO" }),
  });
  prova(
    "D-02 · PATCH evento altrui aggiungendo il proprio gruppo",
    403,
    patchGruppo.stato,
    JSON.stringify(patchGruppo.corpo?.error?.message ?? null),
  );

  /* D-03 — DELETE dell'evento di B. */
  const cancella = await chiama(`/api/v1/events/${EVT_B}`, { method: "DELETE" });
  prova(
    "D-03 · DELETE evento altrui",
    403,
    cancella.stato,
    JSON.stringify(cancella.corpo?.error?.message ?? null),
  );

  /* D-04 — blocco ottimistico: version sbagliata sul proprio evento. */
  const mio = await crea(
    baseAllenamento({
      categoryId: CAT_A,
      categoryName: "Under 12",
      title: "mio, per la versione",
      date: "2026-10-20",
      time: "18:00",
      endTime: "19:00",
    }),
  );
  const EVT_A = mio.corpo?.data?.id;
  const versione = mio.corpo?.data?.row?.version ?? null;
  const versioneVecchia = await chiama(`/api/v1/events/${EVT_A}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "cambio con versione vecchia", version: 0 }),
  });
  prova(
    "D-04 · PATCH con version vecchia deve dare 409",
    409,
    versioneVecchia.stato,
    `versione corrente ${versione} · ${JSON.stringify(versioneVecchia.corpo?.error?.message ?? null)}`,
  );

  /* D-05 — version omessa: il blocco ottimistico si aggira non nominandolo? */
  const senzaVersione = await chiama(`/api/v1/events/${EVT_A}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "cambio senza versione" }),
  });
  console.log(
    `  INFO  D-05 PATCH senza version -> stato ${senzaVersione.stato}`,
  );

  /* D-06 — spostare il proprio evento sulla categoria di B. */
  const sposta = await chiama(`/api/v1/events/${EVT_A}`, {
    method: "PATCH",
    body: JSON.stringify({ categoryId: CAT_B, categoryName: "Under 15" }),
  });
  prova(
    "D-06 · spostare il proprio evento nella categoria di B",
    403,
    sposta.stato,
    JSON.stringify(sposta.corpo?.error?.message ?? null),
  );

  /* D-07 — spostarlo su B tenendo il proprio id come nome. */
  const spostaConNome = await chiama(`/api/v1/events/${EVT_A}`, {
    method: "PATCH",
    body: JSON.stringify({ categoryId: CAT_B, categoryName: CAT_A }),
  });
  prova(
    "D-07 · spostare su B con categoryName = proprio id",
    403,
    spostaConNome.stato,
    JSON.stringify(spostaConNome.corpo?.error?.message ?? null),
  );
  if (spostaConNome.stato === 200) {
    console.log(`        riga: ${JSON.stringify(await categoriaSuArchivio(EVT_A))}`);
  }
};

const attaccoLettura = async () => {
  console.log("\nE — cosa vede B degli eventi che A ha piazzato");
  await comeUtente(MISTER_B, "trainer");
  const elenco = await chiama("/api/v1/events?kind=all");
  const titoli = (elenco.corpo?.data || []).map((e) => e.title);
  console.log(`  INFO  B vede ${titoli.length} eventi: ${JSON.stringify(titoli)}`);
  const intrusi = titoli.filter((t) => String(t).startsWith("ATTACCO"));
  prova(
    "E-01 · nessun evento marcato ATTACCO nel calendario di B",
    [],
    intrusi,
    "un evento creato da A e comparso nel calendario di B",
  );
};

/* ==================================================================== */

const main = async () => {
  console.log("\n  PP-03 round 4 — perimetro dell'evento\n");
  await semina();
  try {
    await attaccoGrafie();
    await attaccoGruppi();
    await attaccoAltriCampi();
    await attaccoModifica();
    await attaccoLettura();
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
