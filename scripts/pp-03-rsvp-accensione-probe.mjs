/**
 * **PP-03 §11.3 — l'allenatore accende l'RSVP, e la riga in archivio lo dice.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/pp-03-rsvp-accensione-probe.mjs
 *
 * La prova statica in `tests/ui/pp-03-calendario-allenatore-raggiungibile.test.mjs`
 * dice che il modulo dell'allenatore monta `EventRsvpFields`. Non dice che il
 * valore **arriva in archivio**: fra la casella e la colonna ci sono
 * `toEventRsvpPayload`, `createEvent`, `POST /api/v1/events` e `events.ts`.
 * Questa sonda percorre quel tratto sulle rotte vere, con la sessione di un
 * allenatore vero, e va a rileggere le colonne.
 *
 * `PASS` = comportamento corretto. Il club di collaudo si cancella in `finally`.
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

/* --------------------------------------------------------- il trasporto - */

const RADICE = path.resolve("src/app/api/v1");
const scopriRotte = (dir = RADICE, prefisso = []) => {
  const trovate = [];
  for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
    if (voce.isDirectory()) {
      trovate.push(
        ...scopriRotte(path.join(dir, voce.name), [...prefisso, voce.name]),
      );
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
  const segmenti = percorso
    .replace(/^\/api\/v1\//, "")
    .split("/")
    .filter(Boolean);
  for (const rotta of ROTTE) {
    if (rotta.segmenti.length !== segmenti.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < segmenti.length; i += 1) {
      const atteso = rotta.segmenti[i];
      if (atteso.startsWith("["))
        params[atteso.slice(1, -1)] = decodeURIComponent(segmenti[i]);
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
let CLUB_ATTIVO = null;
const moduli = new Map();

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input), "http://pp03.invalid");
  const metodo = String(init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers || {});
  if (SESSIONE) headers.set("authorization", `Bearer ${SESSIONE}`);
  if (CLUB_ATTIVO) headers.set("x-active-club-id", CLUB_ATTIVO);
  if (RUOLO) headers.set("x-active-access-role", RUOLO);
  if (init.body && !headers.has("content-type"))
    headers.set("content-type", "application/json");
  const richiesta = new Request(url.toString(), { ...init, headers });
  const abbinata = abbina(url.pathname);
  if (!abbinata) throw new Error(`nessuna rotta per ${url.pathname}`);
  if (!moduli.has(abbinata.rotta.file))
    moduli.set(
      abbinata.rotta.file,
      await import(pathToFileURL(abbinata.rotta.file).href),
    );
  return moduli.get(abbinata.rotta.file)[metodo](richiesta, {
    params: abbinata.params,
  });
};

const chiama = async (percorso, init) => {
  try {
    const risposta = await globalThis.fetch(percorso, init);
    return {
      stato: risposta.status,
      corpo: await risposta.json().catch(() => null),
    };
  } catch (errore) {
    return { stato: -1, corpo: { error: { message: String(errore?.message) } } };
  }
};

/* ------------------------------------------------------------ il club --- */

const CLUB = randomUUID();
const CAT = "cat-rsvp-u15";
const SEDE = "sede-rsvp";
const auth = await carica("src/lib/server/auth.ts");
const modello = await carica("src/lib/events/model.ts");

const presidente = await prisma.user.upsert({
  where: { email: "pp03-rsvp-pres@example.invalid" },
  update: {},
  create: {
    id: randomUUID(),
    email: "pp03-rsvp-pres@example.invalid",
    first_name: "Presidente",
    last_name: "Rsvp",
    password_hash: "x",
    role: "user",
    email_verified_at: new Date(),
    updated_at: new Date(),
  },
});
const mister = await prisma.user.upsert({
  where: { email: "pp03-rsvp-mister@example.invalid" },
  update: {},
  create: {
    id: randomUUID(),
    email: "pp03-rsvp-mister@example.invalid",
    first_name: "Mister",
    last_name: "Rsvp",
    password_hash: "x",
    role: "user",
    email_verified_at: new Date(),
    updated_at: new Date(),
  },
});

await prisma.club.deleteMany({ where: { slug: { startsWith: "pp03-rsvp-" } } });
await prisma.club.create({
  data: {
    id: CLUB,
    slug: `pp03-rsvp-${Date.now()}`,
    name: "Collaudo RSVP",
    creator_id: presidente.id,
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
    categories: [{ id: CAT, name: "Under 15" }],
    club_sites: [{ id: SEDE, name: "Palestra Nord", active: true }],
    category_groups: [],
    structures: [],
    trainers: [
      {
        id: "t-rsvp",
        first_name: "Mister",
        last_name: "Rsvp",
        email: mister.email,
        linkedUserId: mister.id,
        categories: [CAT],
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
for (const [utente, ruolo] of [
  [presidente, "owner"],
  [mister, "trainer"],
])
  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: utente.id,
      role: ruolo,
      is_primary: true,
      updated_at: new Date(),
    },
  });

const fraGiorni = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

try {
  SESSIONE = (await auth.createSessionForUser(mister)).access_token;
  RUOLO = "trainer";
  CLUB_ATTIVO = CLUB;

  /*
    Il payload e **quello che il modulo compone**: `toEventRsvpPayload` sui
    valori della casella. Scriverlo a mano qui misurerebbe la rotta e non il
    tratto che il difetto riguardava.
  */
  const daCasella = modello.toEventRsvpPayload({
    rsvpRequired: true,
    rsvpDeadline: `${fraGiorni(12)}T18:00`,
    capacity: "14",
  });

  const creata = await chiama("/api/v1/events", {
    method: "POST",
    body: JSON.stringify({
      kind: "match",
      title: "Amichevole con RSVP",
      date: fraGiorni(14),
      time: "10:30",
      endTime: "12:00",
      categoryId: CAT,
      categories: [CAT],
      siteId: SEDE,
      opponent: "Avversaria",
      homeAway: "home",
      ...daCasella,
    }),
  });
  prova("R-01 · l'allenatore crea la gara con la conferma chiesta", 200, creata.stato);

  const id = creata.corpo?.data?.id;
  const riga = id
    ? await prisma.clubEvent.findUnique({ where: { id } })
    : null;
  prova(
    "R-02 · in archivio `rsvp_required` e vero",
    true,
    riga?.rsvp_required ?? null,
    "fra la casella e la colonna ci sono il convertitore, il client, la rotta e events.ts",
  );
  prova(
    "R-03 · la scadenza e arrivata",
    true,
    Boolean(riga?.rsvp_deadline),
  );
  prova("R-04 · la capienza e un numero", 14, riga?.capacity ?? null);
  prova(
    "R-05 · la riga porta il `created_by` dell'allenatore",
    mister.id,
    riga?.created_by ?? null,
  );

  /*
    Il verso opposto: la casella spenta non deve scrivere la scadenza, altrimenti
    resta uno stato in cui nessuno sa cosa succede al passaggio della data.
  */
  const senza = modello.toEventRsvpPayload({
    rsvpRequired: false,
    rsvpDeadline: `${fraGiorni(12)}T18:00`,
    capacity: "",
  });
  const seconda = await chiama("/api/v1/events", {
    method: "POST",
    body: JSON.stringify({
      kind: "training",
      title: "Allenamento senza conferma",
      date: fraGiorni(15),
      time: "18:00",
      endTime: "19:30",
      categoryId: CAT,
      categories: [CAT],
      siteId: SEDE,
      ...senza,
    }),
  });
  prova("R-06 · l'allenamento senza conferma si crea", 200, seconda.stato);
  const rigaSenza = seconda.corpo?.data?.id
    ? await prisma.clubEvent.findUnique({ where: { id: seconda.corpo.data.id } })
    : null;
  prova(
    "R-07 · la scadenza senza la richiesta non e stata scritta",
    [false, null],
    [rigaSenza?.rsvp_required ?? null, rigaSenza?.rsvp_deadline ?? null],
  );

  /*
    E la rilettura: il modulo si riapre su un evento esistente e deve ritrovare
    i tre valori, altrimenti una modifica qualsiasi li spegnerebbe.
  */
  const riletto = await chiama(`/api/v1/events/${id}`);
  const tornati = modello.fromEventRsvpPayload(riletto.corpo?.data ?? {});
  prova(
    "R-08 · riaprendo il modulo la casella e ancora accesa, con capienza",
    [true, "14"],
    [tornati.rsvpRequired, tornati.capacity],
    "`fromEventRsvpPayload` deve riconoscere la grafia che la rotta emette",
  );

  const modificata = await chiama(`/api/v1/events/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      time: "11:00",
      ...modello.toEventRsvpPayload({ ...tornati, capacity: "18" }),
    }),
  });
  prova("R-09 · e la modifica dell'allenatore passa", 200, modificata.stato);
  const dopo = await prisma.clubEvent.findUnique({ where: { id } });
  prova(
    "R-10 · la capienza nuova e in archivio, la richiesta e rimasta accesa",
    [18, true],
    [dopo?.capacity ?? null, dopo?.rsvp_required ?? null],
  );
} finally {
  await prisma.auditLog.deleteMany({ where: { organization_id: CLUB } }).catch(() => {});
  await prisma.clubEvent.deleteMany({ where: { organization_id: CLUB } }).catch(() => {});
  await prisma.organizationUser.deleteMany({ where: { organization_id: CLUB } }).catch(() => {});
  await prisma.club.delete({ where: { id: CLUB } }).catch((e) => console.error("pulizia", e.message));
  await prisma.$disconnect();
}

const rossi = esiti.filter((e) => !e.ok);
console.log(
  `\n  ${esiti.length - rossi.length}/${esiti.length} — ${rossi.length === 0 ? "tutto verde" : `${rossi.length} rosse`}`,
);
process.exit(rossi.length === 0 ? 0 : 1);
