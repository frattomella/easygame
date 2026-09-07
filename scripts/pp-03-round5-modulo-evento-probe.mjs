/**
 * **PP-03 round 5 — i campi che il modulo dell'allenatore non disegna.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/pp-03-round5-modulo-evento-probe.mjs
 *
 * `TrainerEventEditorDialog` (§11) manda dieci campi. La rotta ne accetta
 * trenta, e `toEventColumns` li legge tutti: `status`, `capacity`,
 * `rsvpDeadline`, `id` (che diventa `legacy_id`), `trainers`, `siteId`,
 * `events` (il blocco), `version`. Nessun round ha misurato cosa succede
 * quando l'allenatore manda cio che il modulo non disegna.
 *
 * `PASS` = attacco respinto o innocuo. `FAIL` = attacco riuscito.
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
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(66)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        ${nota}`);
};
const info = (titolo, valore) =>
  console.log(`  INFO  ${titolo.padEnd(66)} ${JSON.stringify(valore)}`);

/* ---------------------------------------------------------- gli attori -- */

const CLUB = randomUUID();
const ALTRO = randomUUID();
const CAT_A = "cat-r5m-a";
const CAT_B = "cat-r5m-b";
const SEDE_1 = "sede-r5m-nord";
const SEDE_2 = "sede-r5m-sud";

let PRESIDENTE = null;
let MISTER_A = null;
let MISTER_B = null;
let ESTRANEO = null;

const ATLETI_A = [];
const ATLETA_B = randomUUID();

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
      last_name: "R5m",
      password_hash: "$2b$10$pp03r5m",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const semina = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp03r5m-" } },
    select: { id: true },
  });
  if (residui.length) {
    const ids = residui.map((r) => r.id);
    await prisma.auditLog.deleteMany({ where: { organization_id: { in: ids } } }).catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }

  PRESIDENTE = await utente("pp03r5m-presidente@example.invalid", "Anna");
  MISTER_A = await utente("pp03r5m-mister-a@example.invalid", "Aldo");
  MISTER_B = await utente("pp03r5m-mister-b@example.invalid", "Bruno");
  ESTRANEO = await utente("pp03r5m-estraneo@example.invalid", "Zeno");

  const settings = {
    seasons: [
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
      id: CLUB,
      slug: `pp03r5m-${Date.now()}`,
      name: "ASD Round5 M",
      creator_id: PRESIDENTE.id,
      settings,
      categories: [
        { id: CAT_A, name: "Under 12" },
        { id: CAT_B, name: "Under 15" },
      ],
      club_sites: [
        { id: SEDE_1, name: "Sede Nord", active: true },
        { id: SEDE_2, name: "Sede Sud", active: true },
      ],
      category_groups: [],
      structures: [],
      trainers: [
        {
          id: "trainer-r5m-a",
          first_name: "Aldo",
          last_name: "R5m",
          email: MISTER_A.email,
          linkedUserId: MISTER_A.id,
          categories: [CAT_A],
          groups: [],
        },
        {
          id: "trainer-r5m-b",
          first_name: "Bruno",
          last_name: "R5m",
          email: MISTER_B.email,
          linkedUserId: MISTER_B.id,
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

  await prisma.club.create({
    data: {
      id: ALTRO,
      slug: `pp03r5m-altro-${Date.now()}`,
      name: "ASD Estranea R5m",
      creator_id: ESTRANEO.id,
      settings,
      categories: [{ id: CAT_A, name: "Under 12" }],
      updated_at: new Date(),
    },
  });

  for (const [riga, ruolo, club] of [
    [MISTER_A, "trainer", CLUB],
    [MISTER_B, "trainer", CLUB],
    [PRESIDENTE, "owner", CLUB],
    [ESTRANEO, "owner", ALTRO],
  ]) {
    await prisma.organizationUser.create({
      data: {
        id: randomUUID(),
        organization_id: club,
        user_id: riga.id,
        role: ruolo,
        is_primary: true,
        updated_at: new Date(),
      },
    });
  }

  const righe = [];
  for (let i = 0; i < 3; i += 1) {
    const id = randomUUID();
    ATLETI_A.push(id);
    righe.push({
      id,
      organization_id: CLUB,
      first_name: `Atleta${i}`,
      last_name: "CatA",
      status: "active",
      category_id: CAT_A,
      category_name: "Under 12",
      data: { seasonId: "2026-27" },
      updated_at: new Date(),
    });
  }
  righe.push({
    id: ATLETA_B,
    organization_id: CLUB,
    first_name: "Bruna",
    last_name: "CatB",
    status: "active",
    category_id: CAT_B,
    category_name: "Under 15",
    data: { seasonId: "2026-27" },
    updated_at: new Date(),
  });
  await prisma.athlete.createMany({ data: righe });
};

const pulisci = async () => {
  for (const id of [CLUB, ALTRO]) {
    await prisma.auditLog.deleteMany({ where: { organization_id: id } }).catch(() => {});
    await prisma.club.deleteMany({ where: { id } }).catch((e) => {
      console.error(`Pulizia non riuscita: ${e?.message}`);
    });
  }
};

/* ==================================================================== */

const crea = (corpo) =>
  chiama("/api/v1/events", { method: "POST", body: JSON.stringify(corpo) });

let orario = 8;
const base = (extra) => {
  orario = orario >= 22 ? 8 : orario + 1;
  return {
    kind: "training",
    title: "Sonda R5",
    date: "2026-10-20",
    time: `${String(orario).padStart(2, "0")}:00`,
    endTime: `${String(orario).padStart(2, "0")}:45`,
    seasonId: "2026-27",
    categoryId: CAT_A,
    categoryName: "Under 12",
    ...extra,
  };
};

const riga = (id) =>
  prisma.clubEvent.findUnique({ where: { id } }).catch(() => null);

const attaccoIniezione = async () => {
  console.log("\nA — i campi che il modulo non disegna");
  await comeUtente(MISTER_A, "trainer");

  /* A-00 — controllo di sanita. */
  const sano = await crea(base({}));
  prova("A-00 · controllo: la propria categoria crea", 200, sano.stato,
    JSON.stringify(sano.corpo?.error ?? null));

  /* A-01 — `created_by` / `createdBy` dal corpo. */
  const autore = await crea(
    base({ createdBy: MISTER_B.id, created_by: MISTER_B.id, title: "autore falso" }),
  );
  const rigaAutore = autore.corpo?.data?.id ? await riga(autore.corpo.data.id) : null;
  prova(
    "A-01 · created_by resta chi ha davvero creato",
    MISTER_A.id,
    rigaAutore?.created_by ?? null,
    `stato ${autore.stato}`,
  );

  /* A-02 — `organizationId` dal corpo. */
  const club = await crea(
    base({ organizationId: ALTRO, organization_id: ALTRO, title: "club falso" }),
  );
  const rigaClub = club.corpo?.data?.id ? await riga(club.corpo.data.id) : null;
  prova(
    "A-02 · organization_id resta il club attivo",
    CLUB,
    rigaClub?.organization_id ?? null,
    `stato ${club.stato}`,
  );

  /* A-03 — `status` alla creazione: un evento che nasce gia concluso. */
  const concluso = await crea(
    base({ status: "completed", date: "2026-08-01", title: "nasce concluso" }),
  );
  const rigaConclusa = concluso.corpo?.data?.id ? await riga(concluso.corpo.data.id) : null;
  prova(
    "A-03 · status alla creazione non e scelto dal client",
    "scheduled",
    rigaConclusa?.status ?? null,
    `stato ${concluso.stato}`,
  );

  /* A-03b — e se nasce annullato, la macchina a stati lo lascia risorgere? */
  const annullato = await crea(
    base({ status: "cancelled", title: "nasce annullato" }),
  );
  const rigaAnnullata = annullato.corpo?.data?.id
    ? await riga(annullato.corpo.data.id)
    : null;
  info("A-03b · status:'cancelled' alla creazione", {
    stato: annullato.stato,
    archiviato: rigaAnnullata?.status ?? null,
  });
  if (rigaAnnullata?.status === "cancelled") {
    const risorto = await chiama(`/api/v1/events/${rigaAnnullata.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "scheduled" }),
    });
    info("A-03c · e da cancelled si torna a scheduled?", risorto.stato);
  }

  /* A-04 — `capacity`: negativa, zero, enorme, testuale. */
  for (const [id, valore, atteso] of [
    ["A-04a", -5, null],
    ["A-04b", 0, null],
    ["A-04c", 2147483648, "errore-o-null"],
    ["A-04d", 1e18, "errore-o-null"],
  ]) {
    const esito = await crea(
      base({ capacity: valore, rsvpRequired: true, title: `capienza ${valore}` }),
    );
    const r = esito.corpo?.data?.id ? await riga(esito.corpo.data.id) : null;
    if (atteso === null) {
      prova(`${id} · capacity=${valore} non entra in colonna`, null, r?.capacity ?? null,
        `stato ${esito.stato}`);
    } else {
      const messaggio = String(esito.corpo?.error?.message ?? "");
      const perde = /prisma|invocation|\bmodel\b|clubEvent|argument/i.test(messaggio);
      prova(
        `${id} · capacity=${valore} non fa uscire l'errore del driver`,
        false,
        perde,
        `stato ${esito.stato} messaggio ${JSON.stringify(messaggio.slice(0, 160))}`,
      );
    }
  }

  /* A-05 — `rsvpDeadline` dopo l'evento, e nel passato. */
  const dopo = await crea(
    base({
      rsvpRequired: true,
      rsvpDeadline: "2027-12-31T23:59:00.000Z",
      title: "scadenza dopo l'evento",
    }),
  );
  const rigaDopo = dopo.corpo?.data?.id ? await riga(dopo.corpo.data.id) : null;
  prova(
    "A-05 · scadenza RSVP successiva all'evento",
    true,
    !(rigaDopo && rigaDopo.rsvp_deadline && rigaDopo.rsvp_deadline > rigaDopo.starts_at),
    `stato ${dopo.stato} scadenza ${rigaDopo?.rsvp_deadline?.toISOString?.() ?? null}` +
      ` evento ${rigaDopo?.starts_at?.toISOString?.() ?? null}`,
  );

  const passato = await crea(
    base({
      rsvpRequired: true,
      rsvpDeadline: "1970-01-01T00:00:00.000Z",
      title: "scadenza nel passato",
    }),
  );
  const rigaPassato = passato.corpo?.data?.id ? await riga(passato.corpo.data.id) : null;
  info("A-05b · scadenza RSVP nel 1970", {
    stato: passato.stato,
    scadenza: rigaPassato?.rsvp_deadline?.toISOString?.() ?? null,
  });

  /* A-06 — `id` dal corpo: diventa `legacy_id`, e `findClubEvent` lo usa. */
  const evB = await (async () => {
    await comeUtente(MISTER_B, "trainer");
    const esito = await crea(
      base({ categoryId: CAT_B, categoryName: "Under 15", title: "allenamento di Bruno" }),
    );
    await comeUtente(MISTER_A, "trainer");
    return esito;
  })();
  const idB = evB.corpo?.data?.id ?? null;
  const rigaB = idB ? await riga(idB) : null;
  const legacyB = rigaB?.legacy_id ?? null;
  info("A-06 · evento di Bruno", { stato: evB.stato, id: idB, legacy: legacyB });

  const collisione = await crea(
    base({ id: legacyB || "training-r5m-collisione", title: "collisione di legacy_id" }),
  );
  const rigaCollisione = collisione.corpo?.data?.id
    ? await riga(collisione.corpo.data.id)
    : null;
  prova(
    "A-06 · un allenatore non sceglie il legacy_id di un altro evento",
    true,
    collisione.stato >= 400 ||
      !legacyB ||
      String(rigaCollisione?.legacy_id ?? "") !== String(legacyB),
    `stato ${collisione.stato} legacy scritto ${JSON.stringify(rigaCollisione?.legacy_id ?? null)}`,
  );

  /* A-07 — `trainers`: assegnare l'evento a un collega. */
  const colleghi = await crea(
    base({ trainers: ["trainer-r5m-b"], title: "assegnato al collega" }),
  );
  const rigaColleghi = colleghi.corpo?.data?.id ? await riga(colleghi.corpo.data.id) : null;
  info("A-07 · trainer_ids del collega sul proprio evento", {
    stato: colleghi.stato,
    trainer_ids: rigaColleghi?.trainer_ids ?? null,
  });

  /* A-08 — `siteId` inesistente e di un'altra sede. */
  for (const [id, sede] of [
    ["A-08a", SEDE_2],
    ["A-08b", "sede-che-non-esiste"],
    ["A-08c", CLUB],
  ]) {
    const esito = await crea(base({ siteId: sede, title: `sede ${sede}` }));
    const r = esito.corpo?.data?.id ? await riga(esito.corpo.data.id) : null;
    info(`${id} · siteId=${sede}`, { stato: esito.stato, scritto: r?.site_id ?? null });
  }

  /* A-09 — `categories` con doppioni, vuoti e valori non stringa. */
  const doppioni = await crea(
    base({ categories: [CAT_A, CAT_A, "", "   ", null], title: "categorie con doppioni" }),
  );
  const rigaDoppioni = doppioni.corpo?.data?.id ? await riga(doppioni.corpo.data.id) : null;
  prova(
    "A-09 · categories con doppioni si riduce a una",
    [CAT_A],
    rigaDoppioni?.category_ids ?? null,
    `stato ${doppioni.stato}`,
  );

  const vuote = await crea(base({ categories: [], title: "categorie vuote" }));
  const rigaVuote = vuote.corpo?.data?.id ? await riga(vuote.corpo.data.id) : null;
  info("A-09b · categories: []", {
    stato: vuote.stato,
    scritte: rigaVuote?.category_ids ?? null,
  });
};

const attaccoBlocco = async () => {
  console.log("\nB — la creazione in blocco, che il modulo non offre");
  await comeUtente(MISTER_A, "trainer");

  const prima = await prisma.clubEvent.count({ where: { organization_id: CLUB } });

  const molti = Array.from({ length: 400 }, (_, i) => ({
    title: `blocco ${i}`,
    date: "2026-11-02",
    time: `${String(6 + (i % 16)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}`,
    endTime: `${String(6 + (i % 16)).padStart(2, "0")}:${String((i % 59) + 1).padStart(2, "0")}`,
    seasonId: "2026-27",
    categoryId: CAT_A,
    categoryName: "Under 12",
    allowOverlap: true,
  }));

  const esito = await chiama("/api/v1/events", {
    method: "POST",
    body: JSON.stringify({ kind: "training", events: molti, allowOverlap: true }),
  });
  const dopo = await prisma.clubEvent.count({ where: { organization_id: CLUB } });
  info("B-01 · blocco da 400 eventi da un allenatore", {
    stato: esito.stato,
    creati: dopo - prima,
    errore: String(esito.corpo?.error?.message ?? "").slice(0, 120),
  });
  prova(
    "B-01 · esiste un tetto alla creazione in blocco",
    true,
    dopo - prima < 400,
    `creati ${dopo - prima}`,
  );

  /* B-02 — un blocco misto: una riga propria e una altrui. */
  const misto = await chiama("/api/v1/events", {
    method: "POST",
    body: JSON.stringify({
      kind: "training",
      allowOverlap: true,
      events: [
        {
          title: "blocco mio",
          date: "2026-11-03",
          time: "10:00",
          endTime: "11:00",
          seasonId: "2026-27",
          categoryId: CAT_A,
          categoryName: "Under 12",
        },
        {
          title: "blocco altrui",
          date: "2026-11-03",
          time: "12:00",
          endTime: "13:00",
          seasonId: "2026-27",
          categoryId: CAT_B,
          categoryName: CAT_A,
        },
      ],
    }),
  });
  prova(
    "B-02 · blocco misto con la grafia falsa e respinto",
    403,
    misto.stato,
    JSON.stringify(misto.corpo?.error?.message ?? null),
  );
};

const attaccoRsvp = async () => {
  console.log("\nC — la casella RSVP appena montata nel modulo");
  await comeUtente(MISTER_A, "trainer");

  /* C-01 — l'RSVP su un evento della categoria altrui, con la grafia falsa. */
  const altrui = await crea(
    base({
      categoryId: CAT_B,
      categoryName: CAT_A,
      rsvpRequired: true,
      capacity: 10,
      rsvpDeadline: "2026-10-18T12:00:00.000Z",
      title: "RSVP acceso sulla squadra di Bruno",
    }),
  );
  const rigaAltrui = altrui.corpo?.data?.id ? await riga(altrui.corpo.data.id) : null;
  prova(
    "C-01 · l'allenatore non accende l'RSVP sulla squadra di un altro",
    true,
    altrui.stato >= 400 || String(rigaAltrui?.category_id ?? "") !== CAT_B,
    `stato ${altrui.stato} categoria scritta ${JSON.stringify(rigaAltrui?.category_id ?? null)}` +
      ` rsvp ${JSON.stringify(rigaAltrui?.rsvp_required ?? null)}`,
  );

  /* C-02 — e se ci riesce, il riepilogo RSVP porta le famiglie di B? */
  if (rigaAltrui?.id) {
    const sommario = await chiama(
      `/api/v1/rsvp?training_id=${rigaAltrui.id}&club_id=${CLUB}`,
    );
    const testo = JSON.stringify(sommario.corpo ?? null);
    prova(
      "C-02 · il riepilogo non porta l'atleta di Bruno",
      false,
      testo.includes(ATLETA_B) || testo.includes("Bruna"),
      `stato ${sommario.stato}`,
    );
  }

  /* C-03 — accendere l'RSVP su un evento congiunto creato dalla direzione. */
  await comeUtente(PRESIDENTE, "owner");
  const congiunto = await crea(
    base({
      categoryId: CAT_A,
      categoryName: "Under 12",
      categories: [CAT_A, CAT_B],
      title: "congiunto della direzione",
    }),
  );
  const idCongiunto = congiunto.corpo?.data?.id ?? null;
  info("C-03 · congiunto creato dal presidente", {
    stato: congiunto.stato,
    id: idCongiunto,
  });

  if (idCongiunto) {
    await comeUtente(MISTER_A, "trainer");
    const accende = await chiama(`/api/v1/events/${idCongiunto}`, {
      method: "PATCH",
      body: JSON.stringify({ rsvpRequired: true, capacity: 8 }),
    });
    const rigaCongiunta = await riga(idCongiunto);
    prova(
      "C-03 · RSVP acceso su un congiunto dall'allenatore di una sola squadra",
      403,
      accende.stato,
      `rsvp in colonna ${JSON.stringify(rigaCongiunta?.rsvp_required ?? null)}`,
    );

    const sommario = await chiama(
      `/api/v1/rsvp?training_id=${idCongiunto}&club_id=${CLUB}`,
    );
    const testo = JSON.stringify(sommario.corpo ?? null);
    prova(
      "C-04 · regressione §6.1 — il riepilogo del congiunto non porta B",
      false,
      testo.includes(ATLETA_B) || testo.includes("Bruna"),
      `stato ${sommario.stato}`,
    );
  }
};

const attaccoAppello = async () => {
  console.log("\nD — l'appello su cio che l'allenatore ha creato");
  await comeUtente(MISTER_A, "trainer");

  /* D-01 — un evento nel passato, e l'appello sopra. */
  const passato = await crea(
    base({ date: "2020-01-15", title: "allenamento nel 2020" }),
  );
  info("D-01 · evento datato 2020", { stato: passato.stato, id: passato.corpo?.data?.id ?? null });

  const idPassato = passato.corpo?.data?.id ?? null;
  if (idPassato) {
    const appello = await chiama(`/api/v1/events/${idPassato}/participants`, {
      method: "POST",
      body: JSON.stringify({
        action: "attendance",
        entries: ATLETI_A.map((id) => ({ athleteId: id, status: "present" })),
      }),
    });
    info("D-01b · appello su un evento del 2020", { stato: appello.stato });
    const conteggio = await prisma.clubEventParticipant.count({
      where: { organization_id: CLUB, event_id: idPassato, status: "present" },
    });
    info("D-01c · presenze scritte su un evento mai avvenuto", conteggio);
  }

  /* D-02 — un evento del 2099. */
  const futuro = await crea(base({ date: "2099-12-31", title: "allenamento nel 2099" }));
  info("D-02 · evento datato 2099", { stato: futuro.stato });
};

/* ------------------------------------------------------------------- E - */

const attaccoGate = async () => {
  console.log("\nE — la casella che il club spegne, e il server non legge");

  /*
    §11 monta il modulo nuovo dietro `permissions.actions.manageTrainingStatus`
    e ne **allarga l'etichetta** ai quattro verbi. La chiave vive in
    `clubs.settings`, la legge `GET /api/v1/trainer/preferences`, e la applica
    **il browser**. Qui la si spegne e si chiede alla rotta se se ne accorge.
  */
  const club = await prisma.club.findUnique({
    where: { id: CLUB },
    select: { settings: true },
  });
  const settings =
    club?.settings && typeof club.settings === "object" ? club.settings : {};
  await prisma.club.update({
    where: { id: CLUB },
    data: {
      settings: {
        ...settings,
        trainerDashboardPermissions: {
          actions: { manageTrainingStatus: false, manageAttendance: false },
        },
      },
    },
  });

  await comeUtente(MISTER_A, "trainer");
  const lette = await chiama(`/api/v1/trainer/preferences?club_id=${CLUB}`);
  info("E-00 · la chiave letta dalla rotta delle preferenze", {
    stato: lette.stato,
    manageTrainingStatus:
      lette.corpo?.data?.permissions?.actions?.manageTrainingStatus ?? null,
    manageAttendance:
      lette.corpo?.data?.permissions?.actions?.manageAttendance ?? null,
  });

  const creato = await crea(base({ title: "creato a casella spenta" }));
  prova(
    "E-01 · a casella spenta, POST /events e negato",
    true,
    creato.stato >= 400,
    `stato ${creato.stato}`,
  );

  const ID = creato.corpo?.data?.id ?? null;
  if (!ID) return;

  const modificato = await chiama(`/api/v1/events/${ID}`, {
    method: "PATCH",
    body: JSON.stringify({ time: "21:00" }),
  });
  prova(
    "E-02 · a casella spenta, PATCH /events/:id e negato",
    true,
    modificato.stato >= 400,
    `stato ${modificato.stato}`,
  );

  /*
    L'appello si misura **prima** dell'annullamento: su un evento gia annullato
    risponderebbe 400 per la guardia di §7.3, e la sonda misurerebbe quella
    invece della casella.
  */
  const appello = await chiama(`/api/v1/events/${ID}/participants`, {
    method: "POST",
    body: JSON.stringify({
      action: "attendance",
      entries: [{ athleteId: ATLETI_A[0], status: "present" }],
    }),
  });
  prova(
    "E-03 · a casella `manageAttendance` spenta, l'appello e negato",
    true,
    appello.stato >= 400,
    `stato ${appello.stato} ${JSON.stringify(appello.corpo?.error?.message ?? null)}`,
  );

  const annullato = await chiama(`/api/v1/events/${ID}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "cancelled" }),
  });
  prova(
    "E-04 · a casella spenta, l'annullamento e negato",
    true,
    annullato.stato >= 400,
    `stato ${annullato.stato}`,
  );

  const cancellato = await chiama(`/api/v1/events/${ID}`, { method: "DELETE" });
  prova(
    "E-05 · a casella spenta, DELETE /events/:id e negato",
    true,
    cancellato.stato >= 400,
    `stato ${cancellato.stato}`,
  );
};

const main = async () => {
  console.log("\n  PP-03 round 5 — i campi che il modulo non disegna\n");
  await semina();
  try {
    await attaccoIniezione();
    await attaccoBlocco();
    await attaccoRsvp();
    await attaccoAppello();
    await attaccoGate();
  } finally {
    await pulisci();
    await prisma.$disconnect();
  }

  const ok = esiti.filter((e) => e.ok).length;
  console.log(`\n  ${ok}/${esiti.length} respinti.\n`);
  const rotti = esiti.filter((e) => !e.ok);
  if (rotti.length) {
    console.log("  ATTACCHI RIUSCITI:");
    for (const e of rotti) console.log(`   - ${e.titolo}  [${e.nota}]`);
    console.log("");
  }
};

main().catch(async (errore) => {
  console.error(errore);
  await pulisci();
  await prisma.$disconnect();
  process.exit(1);
});
