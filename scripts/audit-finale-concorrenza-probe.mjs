/**
 * **Audit finale — le corse che producono due volte lo stesso fatto.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/audit-finale-concorrenza-probe.mjs
 *
 * Tre domande, tutte della stessa forma: **fra la lettura che decide e la
 * scrittura che consuma, qualcun altro ha fatto in tempo?**
 *
 *   A — il gettone di accesso monouso, riscattato da due persone insieme;
 *   B — l'incasso manuale registrato due volte dallo stesso doppio clic;
 *   C — l'evento annullato mentre l'appello e in volo (`D-INT-13b`).
 *
 * `PASS` = la corsa e chiusa. `FAIL` = due volte lo stesso fatto.
 * I club di collaudo vengono cancellati in `finally`.
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
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(62)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        ${nota}`);
};
const info = (titolo, valore) =>
  console.log(`  INFO  ${titolo.padEnd(62)} ${JSON.stringify(valore)}`);

/* --------------------------------------------------------- il trasporto - */

const CLUB = randomUUID();

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

const identita = async (riga, ruolo, club) => {
  const auth = await carica("src/lib/server/auth.ts");
  const sessione = await auth.createSessionForUser(riga);
  return { token: sessione.access_token, ruolo, club };
};

/* ------------------------------------------------------------- la semina */

let PRESIDENTE = null;
let PADRE = null;
let MADRE = null;
const ATLETA = randomUUID();

const utente = async (email, nome) => {
  const trovato = await prisma.user.findUnique({ where: { email } });
  if (trovato) return trovato;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      first_name: nome,
      last_name: "Corsa",
      password_hash: "$2b$10$auditcorsa",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const semina = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "auditcorsa-" } },
    select: { id: true },
  });
  if (residui.length) {
    const ids = residui.map((r) => r.id);
    await prisma.auditLog.deleteMany({ where: { organization_id: { in: ids } } }).catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }

  /*
    Utenti nuovi a ogni esecuzione: il limitatore del riscatto conta per
    utente, e riusare le stesse due caselle farebbe misurare alla sonda il
    proprio numero di esecuzioni invece della corsa.
  */
  const marchio = Date.now().toString(36);
  PRESIDENTE = await utente(`auditcorsa-presidente-${marchio}@example.invalid`, "Anna");
  PADRE = await utente(`auditcorsa-padre-${marchio}@example.invalid`, "Padre");
  MADRE = await utente(`auditcorsa-madre-${marchio}@example.invalid`, "Madre");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `auditcorsa-${Date.now()}`,
      name: "ASD Corsa",
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
      categories: [{ id: "cat-corsa", name: "Under 12" }],
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

  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: PRESIDENTE.id,
      role: "owner",
      is_primary: true,
      updated_at: new Date(),
    },
  });

  await prisma.athlete.create({
    data: {
      id: ATLETA,
      organization_id: CLUB,
      first_name: "Figlio",
      last_name: "Corsa",
      status: "active",
      category_id: "cat-corsa",
      category_name: "Under 12",
      data: { seasonId: "2026-27" },
      updated_at: new Date(),
    },
  });
};

const pulisci = async () => {
  await prisma.auditLog.deleteMany({ where: { organization_id: CLUB } }).catch(() => {});
  await prisma.club.deleteMany({ where: { id: CLUB } }).catch((e) => {
    console.error(`Pulizia non riuscita: ${e?.message}`);
  });
};

/* ==================================================================== A == */

/**
 * **Il gettone monouso, riscattato in due.**
 *
 * Il club manda il codice su un gruppo di famiglia; padre e madre lo aprono
 * nello stesso minuto. Fra il vaglio «gettone attivo?» e l'`update` che lo
 * marca `redeemed` passano una quindicina di query: la domanda e se in quella
 * finestra ci stanno due riscatti.
 */
const gettoneInDue = async () => {
  console.log("\nA — il gettone monouso riscattato da due persone insieme");

  const CODICE = `CORSA${Date.now()}`;
  await prisma.clubResourceItem.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      resource_type: "access_tokens",
      name: CODICE,
      status: "active",
      payload: {
        token_type: "club_access",
        minted_by_role: "owner",
        role: "collaborator",
        one_time: true,
      },
      updated_at: new Date(),
    },
  });

  const uno = await identita(PADRE, null, null);
  const due = await identita(MADRE, null, null);

  const [a, b] = await Promise.all([
    invia(uno, "/api/v1/auth/access/redeem", {
      method: "POST",
      body: JSON.stringify({ token: CODICE }),
    }),
    invia(due, "/api/v1/auth/access/redeem", {
      method: "POST",
      body: JSON.stringify({ token: CODICE }),
    }),
  ]);

  const tessere = await prisma.organizationUser.findMany({
    where: {
      organization_id: CLUB,
      user_id: { in: [PADRE.id, MADRE.id] },
    },
    select: { user_id: true, role: true },
  });
  const riga = await prisma.clubResourceItem.findFirst({
    where: { organization_id: CLUB, name: CODICE },
    select: { status: true, payload: true },
  });

  info("A-00 · due riscatti simultanei", {
    stati: [a.stato, b.stato].sort((x, y) => x - y),
    messaggi: [a.corpo?.error?.message ?? null, b.corpo?.error?.message ?? null],
    stato: riga?.status ?? null,
    conteggio: riga?.payload?.redemption_count ?? null,
  });

  prova(
    "A-01 · un gettone monouso conia una tessera sola",
    1,
    tessere.length,
    `tessere ${JSON.stringify(tessere)}`,
  );

  prova(
    "A-02 · uno dei due riscatti e rifiutato",
    1,
    [a.stato, b.stato].filter((s) => s !== 200).length,
    "se rispondono 200 tutti e due, il codice monouso e stato usato due volte",
  );

  prova(
    "A-03 · il registro dice che e stato riscattato una volta sola",
    { stato: "redeemed", conteggio: 1 },
    { stato: riga?.status ?? null, conteggio: Number(riga?.payload?.redemption_count ?? 0) },
    "un conteggio che dice 1 mentre le tessere sono due nega l'incidente a chi indaga",
  );

  /*
    **A-04 — e un gettone bruciato da una richiesta poi fallita si disfa.**

    Il claim atomico chiude la corsa e sposta un rischio: da quel punto restano
    otto scritture e un rifiuto **legittimo** di dominio, nessuno dei quali era
    in transazione con il consumo. Un gettone consumato per una richiesta che
    il dominio ha poi rifiutato e un accesso che nessuno puo piu dare.

    Questa prova misura il **ramo che si puo raggiungere da fuori**: un gettone
    che nomina una scheda inesistente viene rifiutato **prima** del claim, e il
    gettone resta riscattabile. E il controspecchio del claim — che non deve
    consumare niente su una richiesta che non arriva a scrivere.

    Il ripristino vero e proprio — il consumo disfatto da un fallimento **dopo**
    il claim — non e raggiungibile da una richiesta HTTP ben formata: i rifiuti
    che restano a valle sono il soffitto del perimetro e i guasti di archivio,
    e nessuno dei due si provoca dall'esterno senza truccare il dominio. Lo
    tiene il `catch` del gestore (`ripristinaGettone`), ed e dichiarato li:
    questa sonda **non** lo dimostra, e dirlo vale piu di un verde che non lo
    prova.
  */
  const CODICE2 = `CORSAB${Date.now()}`;
  await prisma.clubResourceItem.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      resource_type: "access_tokens",
      name: CODICE2,
      status: "active",
      payload: {
        token_type: "club_access",
        minted_by_role: "owner",
        role: "trainer",
        one_time: true,
        trainer_id: randomUUID(),
      },
      updated_at: new Date(),
    },
  });

  const terzo = await identita(
    await utente(`auditcorsa-terzo-${Date.now().toString(36)}@example.invalid`, "Terzo"),
    null,
    null,
  );
  const fallito = await invia(terzo, "/api/v1/auth/access/redeem", {
    method: "POST",
    body: JSON.stringify({ token: CODICE2 }),
  });
  const rigaDopo = await prisma.clubResourceItem.findFirst({
    where: { organization_id: CLUB, name: CODICE2 },
    select: { status: true },
  });
  info("A-04 · riscatto che fallisce dopo il claim", {
    stato: fallito.stato,
    statoGettone: rigaDopo?.status ?? null,
  });
  prova(
    "A-04 · un rifiuto prima del claim non consuma il gettone",
    { rifiutato: true, statoGettone: "active" },
    {
      rifiutato: fallito.stato >= 400,
      statoGettone: rigaDopo?.status ?? null,
    },
    "un gettone consumato per una richiesta fallita e un accesso che nessuno puo piu dare",
  );
};

/* ==================================================================== B == */

/**
 * **L'incasso manuale registrato due volte.**
 *
 * La segreteria registra 50 su una rata da 130, il clic parte due volte per
 * rete lenta. Il blocco di riga sulla rata chiude il **sovraincasso**; la
 * domanda qui e diversa, ed e la duplicazione dentro la capienza.
 */
const incassoDueVolte = async () => {
  console.log("\nB — lo stesso incasso registrato due volte");

  const CAPO = await identita(PRESIDENTE, "owner", CLUB);

  const rata = await prisma.athletePayment.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      athlete_id: ATLETA,
      amount: 130,
      status: "pending",
      due_date: new Date("2026-10-31"),
      description: "Quota sonda",
      updated_at: new Date(),
    },
  });

  const corpo = JSON.stringify({
    payment_id: rata.id,
    amount: 50,
    payment_method: "cash",
    paid_at: "2026-09-07",
    idempotency_key: `manual:${randomUUID()}`,
  });

  const [x, y] = await Promise.all([
    invia(CAPO, "/api/v1/payment-transactions", { method: "POST", body: corpo }),
    invia(CAPO, "/api/v1/payment-transactions", { method: "POST", body: corpo }),
  ]);

  const righe = await prisma.paymentTransaction.findMany({
    where: { organization_id: CLUB, payment_id: rata.id },
    select: { amount: true, source: true, reversed_at: true },
  });
  const incassato = righe.reduce((somma, r) => somma + Number(r.amount || 0), 0);

  info("B-00 · due invii dello stesso incasso", {
    stati: [x.stato, y.stato].sort((a, b) => a - b),
    messaggi: [x.corpo?.error?.message ?? null, y.corpo?.error?.message ?? null],
    righe: righe.length,
    incassato,
  });

  prova(
    "B-02 · e il secondo invio non e una creazione: 201 e 200",
    [200, 201],
    [x.stato, y.stato].sort((a, b) => a - b),
    "un 201 sul duplicato rimetterebbe nel registro di audit i due incassi che la chiave toglie dall'archivio",
  );

  prova(
    "B-01 · lo stesso incasso non entra due volte",
    { righe: 1, incassato: 50 },
    { righe: righe.length, incassato },
    "due righe da 50 accreditano 100 per un versamento da 50",
  );
};

/* ==================================================================== C == */

/**
 * **L'appello mentre l'evento viene annullato** (`D-INT-13b`).
 *
 * La stessa domanda di `pp-03-round5` `B-03`, tenuta qui perche il verdetto di
 * questa passata la nomina: cio che non deve essere possibile e **scrivere su
 * un evento gia annullato**. Che l'annullamento vinca o perda la corsa e una
 * questione di ordine; che passi una scrittura sul gia annullato non lo e.
 */
const appelloInCorsa = async () => {
  console.log("\nC — l'appello mentre l'evento viene annullato");

  const CAPO = await identita(PRESIDENTE, "owner", CLUB);
  const d = new Date();
  const giorno = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const creato = await invia(CAPO, "/api/v1/events", {
    method: "POST",
    body: JSON.stringify({
      kind: "training",
      title: "Allenamento della corsa",
      date: giorno,
      time: "20:00",
      endTime: "21:30",
      seasonId: "2026-27",
      categoryId: "cat-corsa",
      categoryName: "Under 12",
      allowOverlap: true,
    }),
  });
  const ID = creato.corpo?.data?.id ?? null;
  if (!ID) {
    prova("C-00 · l'evento nasce", true, false, JSON.stringify(creato));
    return;
  }

  const prima = await prisma.clubEvent.findUnique({ where: { id: ID } });
  const [appello, annulla] = await Promise.all([
    invia(CAPO, `/api/v1/events/${ID}/participants`, {
      method: "POST",
      body: JSON.stringify({
        action: "attendance",
        entries: [{ athleteId: ATLETA, status: "present" }],
      }),
    }),
    invia(CAPO, `/api/v1/events/${ID}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled", version: prima.version }),
    }),
  ]);

  const dopo = await prisma.clubEvent.findUnique({ where: { id: ID } });
  const presenze = await prisma.clubEventParticipant.findMany({
    where: { event_id: ID },
    select: { athlete_id: true, status: true },
  });

  info("C-00 · appello e annullamento simultanei", {
    appello: appello.stato,
    annullamento: annulla.stato,
    stato: dopo?.status ?? null,
    presenze,
  });

  /*
    **L'invariante non e «l'annullamento vince», ed e importante dirlo.**

    Con il blocco di riga restano due ordini, ed entrambi sono coerenti:
    l'annullamento arriva prima e l'appello viene rifiutato; oppure l'appello
    arriva prima, e l'evento **era aperto** quando e stato registrato. Il
    secondo e la storia vera, ed e quella che ADR-0098 vuole conservare — un
    evento con una storia si annulla, non si cancella, e annullarlo non
    riscrive cio che e successo prima.

    Cio che non deve piu essere possibile e la terza: **scrivere su un evento
    gia annullato**. Si misura sequenzialmente, in `C-02` e `C-03`, dove non
    c'e nessun ordine da indovinare.

    Resta da provare che la riga eventualmente rimasta sia **inerte**: e la
    meta `D-AUD-10` della stessa domanda, e senza di essa chiudere `D-INT-13b`
    vorrebbe dire spostare il difetto dalla scrittura al conteggio.
  */
  const misura = await carica("src/lib/funding/attendance-measure.ts");
  const clubDopo = await prisma.club.findUnique({
    where: { id: CLUB },
    select: { trainings: true },
  });
  const misurato = misura.measureAttendanceByPeriod({
    periods: [
      { index: 0, label: "tutto", start: "2020-01-01", end: "2030-12-31" },
    ],
    trainings: Array.isArray(clubDopo?.trainings) ? clubDopo.trainings : [],
    attendance: presenze.map((riga) => ({
      athlete_id: riga.athlete_id,
      training_id: ID,
      status: riga.status,
    })),
    requirementUnit: "sessions",
  });
  info("C-01 · la misura dei contributi sull'evento annullato", misurato);
  prova(
    "C-01 · una presenza su un evento annullato non alimenta la misura",
    0,
    Number(misurato?.[0]?.sessions ?? -1),
    `stato ${dopo?.status}; presenze ${JSON.stringify(presenze)}`,
  );

  /* Sequenziale, quindi deterministico: dopo l'annullamento non si scrive. */
  const dopoAnnullamento = await invia(CAPO, `/api/v1/events/${ID}/participants`, {
    method: "POST",
    body: JSON.stringify({
      action: "attendance",
      entries: [{ athleteId: ATLETA, status: "present" }],
    }),
  });
  prova(
    "C-02 · su un evento annullato un nuovo appello e rifiutato",
    true,
    dopoAnnullamento.stato >= 400,
    `stato ${dopoAnnullamento.stato} — ${JSON.stringify(dopoAnnullamento.corpo?.error?.message ?? null)}`,
  );

  const convocazione = await invia(CAPO, `/api/v1/events/${ID}/participants`, {
    method: "POST",
    body: JSON.stringify({
      action: "convoke",
      entries: [{ athleteId: ATLETA, status: "convocated" }],
    }),
  });
  prova(
    "C-03 · su un evento annullato una convocazione e rifiutata",
    true,
    convocazione.stato >= 400,
    `stato ${convocazione.stato} — ${JSON.stringify(convocazione.corpo?.error?.message ?? null)}`,
  );
};

/* ==================================================================== */

console.log("\n  AUDIT FINALE — concorrenza e idempotenza\n");
try {
  await semina();
  await gettoneInDue();
  await incassoDueVolte();
  await appelloInCorsa();
} finally {
  await pulisci();
  await prisma.$disconnect();
}

const passati = esiti.filter((e) => e.ok).length;
console.log(`\n  ${passati}/${esiti.length} chiuse.\n`);
if (passati < esiti.length) {
  console.log("  CORSE APERTE:");
  for (const e of esiti.filter((x) => !x.ok)) {
    console.log(`   - ${e.titolo}${e.nota ? `  [${e.nota}]` : ""}`);
  }
  process.exitCode = 1;
}
