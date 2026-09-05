/**
 * **Le due falle del terzo round di revisione ostile, misurate sulle rotte
 * vere** (PP-03 §9).
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/pp-03-notifiche-e-clinico-probe.mjs
 *
 * Non sono asserzioni sul sorgente: ogni prova costruisce una `Request`, la
 * consegna al route handler vero, e rilegge PostgreSQL dopo. Un service test
 * verde puo convivere con una rotta rotta, e queste due lo erano.
 *
 * - **R3-01** — la notifica indirizzata a un altro si leggeva, si riscriveva e
 *   si **cancellava** conoscendone l'identificativo: `applyRecipientScope`
 *   chiudeva l'elenco, `assertRecordAccess` guardava solo il club.
 * - **R3-02** — il contenuto clinico dentro `medical_certificates.data` usciva
 *   a chi ha soltanto `clinical.status_read`, se il nome del campo non era
 *   nell'elenco dei vietati. Su una colonna JSON libera quell'elenco non puo
 *   essere completo.
 *
 * Verifica per mutazione: togliendo il ramo `RECIPIENT_SCOPED_RESOURCES` da
 * `assertRecordAccess` tornano rosse N-02..N-06; rimettendo l'elenco di
 * vietati al posto di `onlyNonClinicalCertificateData` tornano rosse C-01..C-03.
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

/* ------------------------------------------------- le rotte vere, scoperte */

const RADICE = path.resolve("src/app/api/v1");

const scopri = (dir = RADICE, prefisso = []) => {
  const trovate = [];
  for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
    if (voce.isDirectory()) {
      trovate.push(...scopri(path.join(dir, voce.name), [...prefisso, voce.name]));
    } else if (voce.name === "route.ts") {
      trovate.push({ segmenti: prefisso, file: path.join(dir, voce.name) });
    }
  }
  return trovate;
};

/*
  Le rotte con meno segmenti dinamici vincono: `/events/[id]` deve battere
  `/[resource]/[id]` quando entrambe combaciano.
*/
const ROTTE = scopri().sort(
  (a, b) =>
    a.segmenti.filter((s) => s.startsWith("[")).length -
    b.segmenti.filter((s) => s.startsWith("[")).length,
);

const abbina = (percorso) => {
  const segmenti = percorso.replace(/^\/api\/v1\//, "").split("/").filter(Boolean);
  for (const rotta of ROTTE) {
    if (rotta.segmenti.length !== segmenti.length) continue;
    const params = {};
    let combacia = true;
    for (let i = 0; i < segmenti.length; i += 1) {
      const atteso = rotta.segmenti[i];
      if (atteso.startsWith("[")) params[atteso.slice(1, -1)] = segmenti[i];
      else if (atteso !== segmenti[i]) {
        combacia = false;
        break;
      }
    }
    if (combacia) return { rotta, params };
  }
  return null;
};

let SESSIONE = null;
let RUOLO = null;
let CLUB_ATTIVO = null;
const moduli = new Map();

const chiama = async (percorso, init = {}) => {
  const url = new URL(percorso, "http://collaudo.invalid");
  const metodo = String(init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers || {});
  if (SESSIONE) headers.set("authorization", `Bearer ${SESSIONE}`);
  if (CLUB_ATTIVO) headers.set("x-active-club-id", CLUB_ATTIVO);
  if (RUOLO) headers.set("x-active-access-role", RUOLO);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const abbinata = abbina(url.pathname);
  if (!abbinata) throw new Error(`nessuna rotta per ${url.pathname}`);
  if (!moduli.has(abbinata.rotta.file)) {
    moduli.set(
      abbinata.rotta.file,
      await import(pathToFileURL(abbinata.rotta.file).href),
    );
  }

  const risposta = await moduli.get(abbinata.rotta.file)[metodo](
    new Request(url.toString(), { ...init, headers }),
    { params: abbinata.params },
  );

  return { stato: risposta.status, corpo: await risposta.json().catch(() => null) };
};

/* ------------------------------------------------------------- il verbale */

let passate = 0;
const fallite = [];

const prova = (id, condizione, descrizione, osservato) => {
  if (condizione) {
    passate += 1;
    console.log(`  ok   ${id}  ${descrizione}`);
  } else {
    fallite.push(id);
    console.log(`  FAIL ${id}  ${descrizione}`);
    if (osservato !== undefined) {
      console.log(`         osservato: ${JSON.stringify(osservato).slice(0, 400)}`);
    }
  }
};

/* --------------------------------------------------------------- il club */

const auth = await import(
  pathToFileURL(path.resolve("src/lib/server/auth.ts")).href,
);

const utente = async (email) => {
  const esistente = await prisma.user.findUnique({ where: { email } });
  if (esistente) return esistente;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      first_name: "Collaudo",
      last_name: email.split("@")[0],
      password_hash: "x",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const CLUB = randomUUID();
const ATLETA = randomUUID();

const presidente = await utente("pp03-nc-presidente@example.invalid");
const mister = await utente("pp03-nc-mister@example.invalid");
const genitore = await utente("pp03-nc-genitore@example.invalid");

await prisma.club.deleteMany({ where: { slug: { startsWith: "pp03-nc-" } } });

await prisma.club.create({
  data: {
    id: CLUB,
    slug: `pp03-nc-${Date.now()}`,
    name: "Collaudo notifiche e clinico",
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
    categories: [{ id: "c1", name: "Under 12" }],
    club_sites: [{ id: "s1", name: "Sede Nord", active: true }],
    category_groups: [],
    structures: [],
    trainers: [
      {
        id: "t1",
        first_name: "Gianfranco",
        last_name: "Allenatore",
        email: mister.email,
        linkedUserId: mister.id,
        categories: ["c1"],
        groups: [],
      },
    ],
    staff_members: [],
    trainings: [],
    matches: [],
    updated_at: new Date(),
  },
});

for (const [chi, ruolo] of [
  [presidente, "owner"],
  [mister, "trainer"],
  [genitore, "parent"],
]) {
  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: chi.id,
      role: ruolo,
      is_primary: true,
      updated_at: new Date(),
    },
  });
}

await prisma.athlete.create({
  data: {
    id: ATLETA,
    organization_id: CLUB,
    first_name: "Minore",
    last_name: "Collaudo",
    status: "active",
    category_id: "c1",
    category_name: "Under 12",
    data: {},
    updated_at: new Date(),
  },
});

await prisma.athleteCategoryMembership.create({
  data: {
    id: randomUUID(),
    organization_id: CLUB,
    athlete_id: ATLETA,
    category_id: "c1",
    site_id: "s1",
    updated_at: new Date(),
  },
});

try {
  /* ================================================ N — la notifica altrui */

  console.log("\nN — la notifica indirizzata a un altro (R3-01)\n");

  const SEGRETO = "INSOLUTO 480,00 EUR — famiglia Collaudo";

  const altrui = await prisma.notification.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: genitore.id,
      title: "Rate scadute",
      message: SEGRETO,
      type: "payment",
      data: { amount: 480, athleteId: ATLETA },
      updated_at: new Date(),
    },
  });

  const diTutti = await prisma.notification.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: null,
      title: "Palestra chiusa",
      message: "Impianto chiuso per manutenzione",
      type: "info",
      updated_at: new Date(),
    },
  });

  const propria = await prisma.notification.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: mister.id,
      title: "Convocazioni da completare",
      message: "Mancano le convocazioni di sabato",
      type: "info",
      updated_at: new Date(),
    },
  });

  SESSIONE = (await auth.createSessionForUser(mister)).access_token;
  RUOLO = "trainer";
  CLUB_ATTIVO = CLUB;

  const elenco = await chiama(`/api/v1/notifications?club_id=${CLUB}`);
  prova(
    "N-01",
    elenco.stato === 200 && !JSON.stringify(elenco.corpo).includes(SEGRETO),
    "l'elenco non porta la notifica di un altro (regressione: era gia chiuso)",
    elenco,
  );

  const perId = await chiama(`/api/v1/notifications/${altrui.id}`);
  prova(
    "N-02",
    perId.stato >= 400 && !JSON.stringify(perId.corpo).includes(SEGRETO),
    "la riga di un altro non si legge per identificativo",
    perId,
  );

  const perAlias = await chiama(`/api/v1/simplified_notifications/${altrui.id}`);
  prova(
    "N-03",
    perAlias.stato >= 400 && !JSON.stringify(perAlias.corpo).includes(SEGRETO),
    "ne dall'alias `simplified_notifications`",
    perAlias,
  );

  const riscrittura = await chiama(`/api/v1/notifications/${altrui.id}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "manomessa" }),
  });
  const dopoPatch = await prisma.notification.findUnique({
    where: { id: altrui.id },
  });
  prova(
    "N-04",
    riscrittura.stato >= 400 && dopoPatch?.title === "Rate scadute",
    "non si riscrive il titolo della notifica di un altro",
    { stato: riscrittura.stato, titolo: dopoPatch?.title },
  );

  const cancellazione = await chiama(`/api/v1/notifications/${altrui.id}`, {
    method: "DELETE",
  });
  const dopoDelete = await prisma.notification.findUnique({
    where: { id: altrui.id },
  });
  prova(
    "N-05",
    cancellazione.stato >= 400 && dopoDelete !== null,
    "non si cancella la notifica di un altro — una lettura si chiude, una riga cancellata non torna",
    { stato: cancellazione.stato, esiste: dopoDelete !== null },
  );

  /*
    Il verso opposto: la correzione non deve chiudere cio che era legittimo.
    Una notifica «di tutti» (`user_id` nullo) e la propria restano leggibili.
  */
  const dituttiLetta = await chiama(`/api/v1/notifications/${diTutti.id}`);
  prova(
    "N-06",
    dituttiLetta.stato === 200,
    "la notifica di tutti (`user_id` nullo) resta leggibile",
    dituttiLetta,
  );

  const propriaLetta = await chiama(`/api/v1/notifications/${propria.id}`);
  prova(
    "N-07",
    propriaLetta.stato === 200,
    "la propria notifica resta leggibile",
    propriaLetta,
  );

  const propriaSegnata = await chiama(`/api/v1/notifications/${propria.id}`, {
    method: "PATCH",
    body: JSON.stringify({ read: true }),
  });
  prova(
    "N-08",
    propriaSegnata.stato === 200,
    "la propria notifica si segna ancora come letta",
    propriaSegnata,
  );

  /* ================================================= C — il clinico in `data` */

  console.log("\nC — il contenuto clinico dentro `data` (R3-02)\n");

  SESSIONE = (await auth.createSessionForUser(presidente)).access_token;
  RUOLO = "owner";

  /*
    I nomi sono deliberatamente **fuori** da qualunque elenco di vietati: e il
    punto della prova. Se domani qualcuno li aggiungesse all'elenco invece di
    difendere per ammissione, questa prova tornerebbe verde per la ragione
    sbagliata — per questo ce n'e uno inventato sul momento.
  */
  const creazione = await chiama("/api/v1/medical_certificates", {
    method: "POST",
    body: JSON.stringify({
      athlete_id: ATLETA,
      organization_id: CLUB,
      type: "competitive",
      status: "valid",
      expiry_date: "2027-06-30",
      data: {
        source: "upload",
        diagnosi: "DIAG-SEGRETA",
        referto: "REF-SEGRETO",
        terapia: "TER-SEGRETA",
        campoInventatoDaUnClub: "INVENTATO-SEGRETO",
      },
    }),
  });

  prova(
    "C-00",
    creazione.stato === 200 || creazione.stato === 201,
    "il proprietario registra il certificato con il suo contenuto",
    creazione,
  );

  const inArchivio = await prisma.medicalCertificate.findFirst({
    where: { organization_id: CLUB },
  });
  prova(
    "C-00b",
    JSON.stringify(inArchivio?.data || {}).includes("DIAG-SEGRETA"),
    "il contenuto e davvero in archivio (altrimenti la prova non prova niente)",
    inArchivio?.data,
  );

  SESSIONE = (await auth.createSessionForUser(mister)).access_token;
  RUOLO = "trainer";

  const SEGRETI = [
    "DIAG-SEGRETA",
    "REF-SEGRETO",
    "TER-SEGRETA",
    "INVENTATO-SEGRETO",
  ];

  const lista = await chiama(`/api/v1/medical_certificates?club_id=${CLUB}`);
  const testoLista = JSON.stringify(lista.corpo);
  prova(
    "C-01",
    lista.stato === 200 && !SEGRETI.some((s) => testoLista.includes(s)),
    "dall'elenco dei certificati non esce nessun contenuto clinico",
    testoLista.slice(0, 400),
  );

  const riga = await chiama(`/api/v1/medical_certificates/${inArchivio.id}`);
  const testoRiga = JSON.stringify(riga.corpo);
  prova(
    "C-02",
    !SEGRETI.some((s) => testoRiga.includes(s)),
    "ne dalla riga letta per identificativo",
    testoRiga.slice(0, 400),
  );

  const scheda = await chiama(`/api/v1/athletes/${ATLETA}`);
  const testoScheda = JSON.stringify(scheda.corpo);
  prova(
    "C-03",
    !SEGRETI.some((s) => testoScheda.includes(s)),
    "ne dalla scheda dell'atleta, che porta i certificati con se",
    testoScheda.slice(0, 400),
  );

  /*
    Il verso opposto, che e la ragione per cui `clinical.status_read` esiste:
    lo **stato** e la **scadenza** devono continuare a uscire, altrimenti la
    correzione avrebbe risposto alla domanda «puo scendere in campo?» con il
    silenzio.
  */
  prova(
    "C-04",
    testoLista.includes('"status":"valid"') && testoLista.includes("2027-06-30"),
    "stato e data di scadenza restano: e cio che l'allenatore deve vedere",
    testoLista.slice(0, 400),
  );

  prova(
    "C-05",
    testoLista.includes('"source":"upload"'),
    "`data.source` resta: dice da dove arriva la riga, non cosa dice il medico",
    testoLista.slice(0, 400),
  );

  /* --------------------------------------------------------------- verdetto */

  console.log("");
  console.log(
    `  ${passate}/${passate + fallite.length} prove passate` +
      (fallite.length ? `  — fallite: ${fallite.join(", ")}` : ""),
  );
  console.log("");
  if (fallite.length) process.exitCode = 1;
} finally {
  await prisma.auditLog.deleteMany({ where: { organization_id: CLUB } }).catch(() => {});
  await prisma.club.delete({ where: { id: CLUB } }).catch(() => {});
  await prisma.$disconnect();
}
