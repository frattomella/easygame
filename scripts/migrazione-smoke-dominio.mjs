/**
 * **Lo smoke di dominio dopo la migrazione: le porte, non le tabelle.**
 *
 *     node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *       scripts/migrazione-smoke-dominio.mjs
 *
 * ---
 *
 * ## Che cosa aggiunge a cio che c'e gia
 *
 * `scripts/staging-smoke.mjs` chiede all'applicazione distribuita se risponde:
 * la radice, il login, il registro, e le quattro porte periodiche chiuse a chi
 * non ha il segreto. E il livello del **trasporto**.
 *
 * `scripts/migrazione-finestra-check.mjs` conta le righe prima e dopo. E il
 * livello dell'**archivio**.
 *
 * Fra i due manca il livello che conta di piu, e il Passo 6 del runbook lo
 * descriveva a parole — «un genitore apre l'area famiglia e vede i propri figli,
 * e **solo** quelli» — lasciando a qualcuno il compito di percorrerlo a mano
 * dopo una migrazione, cioe nel momento in cui si ha meno tempo e piu fretta.
 *
 * Qui quelle cinque frasi diventano cinque prove che girano. **Non scrivono
 * niente**: costruiscono un club di collaudo, lo interrogano dalle rotte vere, e
 * lo cancellano. Gira sul database di sviluppo, dopo aver applicato le cinque
 * migrazioni a un clone — che e il modo in cui una prova generale si fa senza
 * toccare il pilota.
 *
 * ## Perche un club di collaudo e non i dati veri
 *
 * Perche le cinque frasi del Passo 6 parlano di **relazioni** — questo genitore,
 * quel figlio, l'altra famiglia — e su dati veri servirebbero le credenziali di
 * persone vere. Il club di collaudo riproduce la forma: due famiglie, un
 * minore per parte, un atleta con accesso proprio. Se il travaso ha spostato
 * l'autorita nel modo sbagliato, e qui che si vede.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error(
    "Rifiuto: serve EASYGAME_DB_ENV=development. Questa sonda semina un club di collaudo.",
  );
  process.exit(1);
}

const prisma = new PrismaClient();
const carica = (rel) => import(pathToFileURL(path.resolve(rel)).href);

const esiti = [];
const prova = (titolo, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ titolo, ok, nota });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(62)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        ${nota}`);
};

/* --------------------------------------------------------- il trasporto - */

const CLUB = randomUUID();
const CAT = "cat-smoke";

const RADICE = path.resolve("src/app/api");
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
  const segmenti = percorso.replace(/^\/api\//, "").split("/").filter(Boolean);
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

globalThis.fetch = async (input) => {
  throw new Error(`FETCH-ESTERNO ${String(input)}`);
};

/* ------------------------------------------------------------- la semina */

let PRESIDENTE = null;
let MADRE_ROSSI = null;
let MADRE_BIANCHI = null;
let RAGAZZO = null;
const FIGLIO_ROSSI = randomUUID();
const FIGLIO_BIANCHI = randomUUID();
const ATLETA_CON_ACCESSO = randomUUID();

const utente = async (email, nome) =>
  prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      first_name: nome,
      last_name: "Smoke",
      password_hash: "$2b$10$smoke",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });

const semina = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "smoke-migr-" } },
    select: { id: true },
  });
  if (residui.length) {
    const ids = residui.map((r) => r.id);
    await prisma.auditLog.deleteMany({ where: { organization_id: { in: ids } } }).catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.user.deleteMany({ where: { email: { endsWith: "@smoke-migr.invalid" } } });

  const m = Date.now().toString(36);
  PRESIDENTE = await utente(`presidente-${m}@smoke-migr.invalid`, "Anna");
  MADRE_ROSSI = await utente(`rossi-${m}@smoke-migr.invalid`, "Rosa");
  MADRE_BIANCHI = await utente(`bianchi-${m}@smoke-migr.invalid`, "Bianca");
  RAGAZZO = await utente(`ragazzo-${m}@smoke-migr.invalid`, "Elia");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `smoke-migr-${m}`,
      name: "ASD Smoke Migrazione",
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
      categories: [{ id: CAT, name: "Under 12" }],
      club_sites: [],
      category_groups: [],
      structures: [],
      trainers: [],
      staff_members: [],
      trainings: [],
      matches: [],
      appointments: [],
      updated_at: new Date(),
    },
  });

  for (const [riga, ruolo] of [
    [PRESIDENTE, "owner"],
    [MADRE_ROSSI, "parent"],
    [MADRE_BIANCHI, "parent"],
    [RAGAZZO, "athlete"],
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

  const atleta = (id, nome, userId) => ({
    id,
    organization_id: CLUB,
    first_name: nome,
    last_name: "Smoke",
    status: "active",
    category_id: CAT,
    category_name: "Under 12",
    birth_date: new Date("2013-05-05"),
    user_id: userId ?? null,
    data: { seasonId: "2026-27" },
    updated_at: new Date(),
  });

  await prisma.athlete.createMany({
    data: [
      atleta(FIGLIO_ROSSI, "Luca"),
      atleta(FIGLIO_BIANCHI, "Sara"),
      atleta(ATLETA_CON_ACCESSO, "Elia", RAGAZZO.id),
    ],
  });

  /*
    I due tutori, scritti dal **proprietario del dominio**: l'archivio rifiuta
    ogni scrittura su `athlete_guardians` fuori da una transazione che dichiari
    `easygame.guardian_writer`, ed e la difesa che la migrazione 3 installa.
    Seminare dal modulo e anche il modo di provarla: se il vaglio non fosse
    vivo, questa semina passerebbe da qualunque parte.
  */
  const tutori = await carica("src/lib/server/athlete-guardians.ts");
  for (const [figlio, madre, cognome] of [
    [FIGLIO_ROSSI, MADRE_ROSSI, "Rossi"],
    [FIGLIO_BIANCHI, MADRE_BIANCHI, "Bianchi"],
  ]) {
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: figlio,
      rows: [
        {
          id: `g-${cognome}`,
          firstName: "Madre",
          lastName: cognome,
          email: madre.email,
          relationship: "madre",
        },
      ],
      canGrantAccess: true,
    });
    await tutori.linkGuardianAccount(prisma, {
      athleteId: figlio,
      userId: madre.id,
      email: madre.email,
    });
  }
};

const pulisci = async () => {
  await prisma.auditLog.deleteMany({ where: { organization_id: CLUB } }).catch(() => {});
  await prisma.club.deleteMany({ where: { id: CLUB } }).catch((e) => {
    console.error(`Pulizia non riuscita: ${e?.message}`);
  });
  await prisma.user
    .deleteMany({ where: { email: { endsWith: "@smoke-migr.invalid" } } })
    .catch(() => {});
};

/* ==================================================================== */

const main = async () => {
  const auth = await carica("src/lib/server/auth.ts");
  const sessione = async (riga, ruolo) => ({
    token: (await auth.createSessionForUser(riga)).access_token,
    ruolo,
    club: CLUB,
  });

  const rossi = await sessione(MADRE_ROSSI, "parent");
  const bianchi = await sessione(MADRE_BIANCHI, "parent");
  const elia = await sessione(RAGAZZO, "athlete");

  /* 1 — un genitore vede i propri figli. */
  const suo = await invia(rossi, `/api/parent-dashboard/${FIGLIO_ROSSI}`);
  prova(
    "S-1 · il genitore apre la scheda del proprio figlio",
    200,
    suo.stato,
    "e la prova che il travaso ha portato l'autorita nelle righe",
  );

  /* 2 — e **solo** quelli. */
  const altrui = await invia(rossi, `/api/parent-dashboard/${FIGLIO_BIANCHI}`);
  prova(
    "S-2 · e non quella del minore di un'altra famiglia",
    403,
    altrui.stato,
    "un travaso che fonde due identita si vede qui, non nei conteggi",
  );
  prova(
    "S-2b · e non ne lascia uscire il nome",
    false,
    JSON.stringify(altrui.corpo ?? "").includes("Sara"),
  );

  /* 3 — l'atleta con accesso proprio apre la sua area, non il cruscotto. */
  const areaPropria = await invia(elia, "/api/v1/athlete-accounts/me");
  prova(
    "S-3 · l'atleta con accesso proprio apre la propria area",
    200,
    areaPropria.stato,
  );
  const cruscottoDiSe = await invia(elia, `/api/parent-dashboard/${ATLETA_CON_ACCESSO}`);
  prova(
    "S-3b · e non il cruscotto della famiglia, che porta di piu",
    403,
    cruscottoDiSe.stato,
    "il ragazzo non e tutore di se stesso (ADR-0122)",
  );

  /* 4 — la revoca chiude, e la riga lo dice. */
  const tutori = await carica("src/lib/server/athlete-guardians.ts");
  const riga =
    (await tutori.findGuardianRow(prisma, FIGLIO_ROSSI, MADRE_ROSSI.email)) ||
    (await tutori.findGuardianRow(prisma, FIGLIO_ROSSI, MADRE_ROSSI.id));
  prova("S-4 · il tutore e una riga, e la si trova", true, Boolean(riga?.id));

  if (riga?.id) {
    await tutori.revokeGuardianRow(prisma, {
      athleteId: FIGLIO_ROSSI,
      guardianRowId: riga.id,
      organizationId: CLUB,
    });
    const dopoRevoca = await invia(rossi, `/api/parent-dashboard/${FIGLIO_ROSSI}`);
    prova(
      "S-4b · dopo la revoca il cruscotto e chiuso",
      403,
      dopoRevoca.stato,
      "la revoca e un fatto sulla riga, e vale subito",
    );
  }

  /* 5 — e la seconda famiglia non e stata toccata. */
  const bianchiSuo = await invia(bianchi, `/api/parent-dashboard/${FIGLIO_BIANCHI}`);
  prova(
    "S-5 · la revoca di una famiglia non tocca l'altra",
    200,
    bianchiSuo.stato,
    "e il controspecchio: una revoca che chiude troppo e un guasto quanto una che non chiude",
  );
};

/* ==================================================================== */

console.log("\n  Smoke di dominio dopo la migrazione — i ruoli che PP-02 tocca\n");
try {
  await semina();
  await main();
} finally {
  await pulisci();
  await prisma.$disconnect();
}

const passati = esiti.filter((e) => e.ok).length;
console.log(`\n  ${passati}/${esiti.length} verificati.\n`);
if (passati < esiti.length) {
  console.log("  NON DICHIARARE RIUSCITA LA MIGRAZIONE:");
  for (const e of esiti.filter((x) => !x.ok)) {
    console.log(`   - ${e.titolo}${e.nota ? `  [${e.nota}]` : ""}`);
  }
  process.exitCode = 1;
}
