/**
 * **Il collaudo di PP-04, contro un database vero e contro le rotte vere.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs scripts/pp-04-atleta-probe.mjs
 *
 * ---
 *
 * ## Perche esiste
 *
 * Perche l'area atleta e stata dichiarata completa da una Wave e ritoccata da
 * PP-01, con le sue sonde verdi, e nessuna di quelle sonde ha mai **chiamato la
 * rotta con una sessione di un atleta vero**. Le lezioni di PP-01 e PP-02, in
 * fila:
 *
 * - un test di servizio puo essere verde mentre la rotta e rotta;
 * - un produttore corretto non implica un consumatore corretto;
 * - un finto Prisma diverge da PostgreSQL proprio dove conta — array, unicita
 *   parziale, transazioni, consumo atomico di un token;
 * - una revoca puo valere sulla **riga** e non sull'**identita**.
 *
 * Ogni prova qui sotto percorre `DB -> dominio -> rotta -> proiezione` con una
 * sessione in archivio, e domanda **cosa riceve quella persona**, non se la
 * funzione ritorna.
 *
 * ## Gli attori
 *
 * Un club con due sedi e tre categorie. **Due atleti**, A e B, in categorie
 * diverse: A e il soggetto, B e cio che A non deve mai vedere. Un tutore di B.
 * Un allenamento su **due** categorie (A e B insieme), per misurare il
 * multi-categoria di PP-01 dal lato dell'atleta. Presenze, documenti, notifiche
 * e una convocazione.
 *
 * ## La regola
 *
 * **La sonda misura, non corregge.** Il club viene cancellato in `finally`, e
 * la semina comincia togliendo i residui di un'esecuzione interrotta.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID, createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("Rifiuto: serve EASYGAME_DB_ENV=development.");
  process.exit(1);
}

const prisma = new PrismaClient();
const carica = (rel) => import(pathToFileURL(path.resolve(rel)).href);

/* ----------------------------------------------------------- il verdetto */

const esiti = [];

const prova = (titolo, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ titolo, ok });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(74)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        nota: ${nota}`);
};

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
      messaggio.slice(0, 220),
    );
  }
};

/* ------------------------------------------------------- gli attori ----- */

const CLUB = randomUUID();
const SEDE_1 = "sede-pp04-nord";
const SEDE_2 = "sede-pp04-sud";
const CAT_A = "cat-pp04-a";
const CAT_B = "cat-pp04-b";
const CAT_C = "cat-pp04-c";

const ATLETA_A = randomUUID();
const ATLETA_B = randomUUID();
const ATLETA_C = randomUUID();

let PRESIDENTE = null;
let UTENTE_A = null;
let UTENTE_B = null;
let TUTORE_B = null;

let dominio = null;
let eventi = null;

const scopeGestione = (userId = PRESIDENTE?.id) => ({
  userId,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
  accessScopes: [],
  actorEmail: PRESIDENTE?.email,
});

const utente = async (email, nome, verificato = true) => {
  const trovato = await prisma.user.findUnique({ where: { email } });
  if (trovato) return trovato;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      first_name: nome,
      last_name: "Collaudo",
      password_hash: "$2b$10$pp04",
      role: "user",
      email_verified_at: verificato ? new Date() : null,
      updated_at: new Date(),
    },
  });
};

/* --------------------------------------------------------- il trasporto */

/**
 * Le rotte vere, chiamate come moduli, con una sessione **in archivio**.
 *
 * Non c'e nessun finto: c'e solo un cavo piu corto. Ogni handler riceve una
 * `Request` con l'intestazione `authorization` che `requireAuthenticatedUser`
 * legge davvero, e risponde con la `NextResponse` che il browser riceverebbe.
 */
let rotte = null;

const preparaRotte = async () => {
  rotte = {
    me: await carica("src/app/api/v1/athlete-accounts/me/route.ts"),
    accountAtleta: await carica(
      "src/app/api/v1/athlete-accounts/[athleteId]/route.ts",
    ),
    accetta: await carica("src/app/api/v1/athlete-accounts/accept/route.ts"),
    bacheca: await carica(
      "src/app/api/parent-dashboard/[athleteId]/board/route.ts",
    ),
    profiloAtleta: await carica(
      "src/app/api/v1/auth/athlete-profile/[athleteId]/route.ts",
    ),
    rsvp: await carica("src/app/api/v1/rsvp/route.ts"),
    famiglia: await carica("src/app/api/parent-dashboard/[athleteId]/route.ts"),
    notifiche: await carica(
      "src/app/api/parent-dashboard/[athleteId]/notifications/route.ts",
    ),
    consensi: await carica(
      "src/app/api/parent-dashboard/[athleteId]/consents/route.ts",
    ),
    tessere: await carica("src/app/api/v1/auth/memberships/route.ts"),
    risorsaElenco: await carica("src/app/api/v1/[resource]/route.ts"),
    risorsaRiga: await carica("src/app/api/v1/[resource]/[id]/route.ts"),
  };
};

const richiesta = (url, { method = "GET", token, club, ruolo, body } = {}) => {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (club) headers.set("x-active-club-id", club);
  if (ruolo) headers.set("x-active-access-role", ruolo);
  return new Request(new URL(url, "http://collaudo.invalid").toString(), {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
};

const leggi = async (risposta) => {
  const testo = await risposta.text();
  let corpo = null;
  try {
    corpo = testo ? JSON.parse(testo) : null;
  } catch {
    corpo = testo;
  }
  return { status: risposta.status, corpo };
};

const sessionePer = async (utenteRiga) => {
  const auth = await carica("src/lib/server/auth.ts");
  const sessione = await auth.createSessionForUser(utenteRiga);
  return sessione.access_token;
};

/* ---------------------------------------------------------- la semina -- */

const pulisciResidui = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp04-" } },
    select: { id: true },
  });
  const ids = residui.map((riga) => riga.id);
  if (ids.length) {
    await prisma.auditLog
      .deleteMany({ where: { organization_id: { in: ids } } })
      .catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.user
    .deleteMany({ where: { email: { endsWith: "@pp04.invalid" } } })
    .catch(() => {});
};

const semina = async () => {
  await pulisciResidui();

  PRESIDENTE = await utente("presidente@pp04.invalid", "Anna");
  UTENTE_A = await utente("atleta-a@pp04.invalid", "Aldo");
  UTENTE_B = await utente("atleta-b@pp04.invalid", "Bruno");
  TUTORE_B = await utente("tutore-b@pp04.invalid", "Bianca");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `pp04-${Date.now()}`,
      name: "ASD Collaudo PP-04",
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
      structures: [],
      trainers: [],
      staff_members: [],
      trainings: [],
      matches: [],
      appointments: [],
      updated_at: new Date(),
    },
  });

  /*
    **A e in due categorie**: la primaria e A, la seconda e C. E la
    configurazione con cui PP-01 ha misurato che un evento della seconda
    categoria spariva dal calendario di chi ci gioca.
  */
  await prisma.athlete.create({
    data: {
      id: ATLETA_A,
      organization_id: CLUB,
      first_name: "Aldo",
      last_name: "Atleta",
      status: "active",
      category_id: CAT_A,
      category_name: "Under 12",
      birth_date: new Date("2012-03-04"),
      data: { email: "aldo.contatto@pp04.invalid", phone: "3330000001" },
      updated_at: new Date(),
    },
  });
  await prisma.athleteCategoryMembership.createMany({
    data: [
      {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: ATLETA_A,
        category_id: CAT_A,
        site_id: SEDE_1,
        is_primary: true,
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: ATLETA_A,
        category_id: CAT_C,
        site_id: SEDE_1,
        is_primary: false,
        updated_at: new Date(),
      },
    ],
  });

  await prisma.athlete.create({
    data: {
      id: ATLETA_B,
      organization_id: CLUB,
      first_name: "Bruno",
      last_name: "Atleta",
      status: "active",
      category_id: CAT_B,
      category_name: "Under 15",
      birth_date: new Date("2011-05-06"),
      data: {
        email: "bruno.contatto@pp04.invalid",
        allergies: "SEGRETO-CLINICO-B",
        medical_notes: "NOTA-MEDICA-B",
        guardians: [
          {
            id: "tutore-b-1",
            first_name: "Bianca",
            last_name: "Tutrice",
            email: TUTORE_B.email,
            linked_user_id: TUTORE_B.id,
            relationship: "madre",
          },
        ],
      },
      updated_at: new Date(),
    },
  });

  /* C: fratello di B, stesso tutore. Serve al sibling leakage. */
  await prisma.athlete.create({
    data: {
      id: ATLETA_C,
      organization_id: CLUB,
      first_name: "Carla",
      last_name: "Atleta",
      status: "active",
      category_id: CAT_B,
      category_name: "Under 15",
      data: {
        guardians: [
          {
            id: "tutore-b-1",
            first_name: "Bianca",
            last_name: "Tutrice",
            email: TUTORE_B.email,
            linked_user_id: TUTORE_B.id,
          },
        ],
      },
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

  dominio = await carica("src/lib/server/athlete-accounts.ts");
  eventi = await carica("src/lib/server/events.ts");
  await preparaRotte();
};

const pulisci = async () => {
  await prisma.auditLog
    .deleteMany({ where: { organization_id: CLUB } })
    .catch(() => {});
  await prisma.club.deleteMany({ where: { id: CLUB } }).catch((errore) => {
    console.error(`Pulizia non riuscita: ${errore?.message}`);
  });
  await prisma.user
    .deleteMany({ where: { email: { endsWith: "@pp04.invalid" } } })
    .catch(() => {});
};

/* ==================================================================== */
/*  P-01…P-08 — l'invito, il token, il riscatto                          */
/* ==================================================================== */

let TOKEN_A = null;

/**
 * Il token in chiaro non esce da nessuna funzione: per riscattarlo va
 * ricostruito. Lo si fa **al contrario**, cioe si emette l'invito con un token
 * scelto qui e si scrive a mano la sola impronta — che e esattamente cio che
 * il dominio archivia. Cosi la prova di riscatto usa la rotta pubblica vera.
 */
const invitaConTokenNoto = async (athleteId, email, tokenChiaro, opzioni = {}) => {
  const utenteInvitato = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      id: randomUUID(),
      email,
      first_name: "Invitato",
      last_name: "Collaudo",
      password_hash: "$2b$10$pp04",
      role: "user",
      email_verified_at: null,
      updated_at: new Date(),
    },
  });

  return prisma.athleteAccountInvite.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      athlete_id: athleteId,
      user_id: utenteInvitato.id,
      email,
      token_hash: createHash("sha256").update(tokenChiaro).digest("hex"),
      status: opzioni.status || "sent",
      expires_at:
        opzioni.expiresAt ||
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      sent_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const proveInvito = async () => {
  console.log("\n— L'invito, il token, il riscatto —");

  /* P-01: nessuna password in nessun ramo della risposta d'invito. */
  const esito = await dominio.sendAthleteAccountInvite(scopeGestione(), {
    athleteId: ATLETA_A,
    email: UTENTE_A.email,
    /* Aldo e nato nel 2012: da ADR-0116 serve la dichiarazione. Vedi P-60. */
    acknowledgeMinor: true,
  });
  const serializzato = JSON.stringify(esito);
  prova(
    "P-01 la risposta all'invito non porta ne token ne password",
    true,
    !/token|password/i.test(serializzato),
    serializzato,
  );

  /* P-02: in archivio vive solo l'impronta. */
  const riga = await prisma.athleteAccountInvite.findUnique({
    where: { id: esito.inviteId },
  });
  prova(
    "P-02 in archivio c'e solo un'impronta di 64 esadecimali",
    true,
    /^[0-9a-f]{64}$/.test(String(riga.token_hash)),
  );

  /* P-03: due inviti vivi non esistono — lo impedisce l'indice parziale. */
  await respinta(
    "P-03 un secondo invito vivo lo rifiuta il database",
    () =>
      dominio.sendAthleteAccountInvite(scopeGestione(), {
        athleteId: ATLETA_A,
        email: "altro@pp04.invalid",
        acknowledgeMinor: true,
      }),
    /gia un invito in corso/i,
  );

  /* Si chiude l'invito reale e se ne emette uno con token noto. */
  await prisma.athleteAccountInvite.update({
    where: { id: esito.inviteId },
    data: { status: "revoked", revoked_at: new Date() },
  });

  TOKEN_A = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  await invitaConTokenNoto(ATLETA_A, UTENTE_A.email, TOKEN_A);

  /* P-04: un token inventato riceve la stessa risposta di uno scaduto. */
  const inventato = await leggi(
    await rotte.accetta.POST(
      richiesta("/api/v1/athlete-accounts/accept", {
        method: "POST",
        body: { token: "0".repeat(64) },
      }),
    ),
  );
  prova("P-04 un token inventato: 400", 400, inventato.status);
  prova(
    "P-04b e il messaggio non dice quale forma di token esiste",
    "Invito non valido, gia usato o scaduto",
    inventato.corpo?.error?.message,
  );

  /* P-05: il riscatto vero scrive il legame e la tessera. */
  const riscatto = await leggi(
    await rotte.accetta.POST(
      richiesta("/api/v1/athlete-accounts/accept", {
        method: "POST",
        body: { token: TOKEN_A },
      }),
    ),
  );
  prova("P-05 il riscatto riesce", 200, riscatto.status);
  const dopoRiscatto = await prisma.athlete.findUnique({
    where: { id: ATLETA_A },
    select: { user_id: true },
  });
  prova(
    "P-05b `athletes.user_id` punta all'utenza invitata",
    true,
    Boolean(dopoRiscatto.user_id),
  );
  const tessera = await prisma.organizationUser.findFirst({
    where: { organization_id: CLUB, user_id: dopoRiscatto.user_id },
    select: { role: true },
  });
  prova("P-05c e la tessera e `athlete`", "athlete", tessera?.role);

  /* P-06: **replay**. Lo stesso token, una seconda volta. */
  const replay = await leggi(
    await rotte.accetta.POST(
      richiesta("/api/v1/athlete-accounts/accept", {
        method: "POST",
        body: { token: TOKEN_A },
      }),
    ),
  );
  prova("P-06 il riuso dello stesso token: 400", 400, replay.status);

  /* P-07: un token **scaduto** non apre, e la riga passa a `expired`. */
  const tokenScaduto = randomUUID().replace(/-/g, "").repeat(2);
  const invitoScaduto = await invitaConTokenNoto(
    ATLETA_B,
    "scaduto@pp04.invalid",
    tokenScaduto,
    { expiresAt: new Date(Date.now() - 60_000) },
  );
  const scaduto = await leggi(
    await rotte.accetta.POST(
      richiesta("/api/v1/athlete-accounts/accept", {
        method: "POST",
        body: { token: tokenScaduto },
      }),
    ),
  );
  prova("P-07 un token scaduto: 400", 400, scaduto.status);
  const rigaScaduta = await prisma.athleteAccountInvite.findUnique({
    where: { id: invitoScaduto.id },
    select: { status: true },
  });
  prova("P-07b e la riga si marca `expired`", "expired", rigaScaduta?.status);

  /* P-08: un token **revocato** non apre. */
  const tokenRevocato = randomUUID().replace(/-/g, "").repeat(2);
  await invitaConTokenNoto(ATLETA_B, "revocato@pp04.invalid", tokenRevocato, {
    status: "revoked",
  });
  const revocato = await leggi(
    await rotte.accetta.POST(
      richiesta("/api/v1/athlete-accounts/accept", {
        method: "POST",
        body: { token: tokenRevocato },
      }),
    ),
  );
  prova("P-08 un token revocato: 400", 400, revocato.status);
};

/* ==================================================================== */
/*  P-10…P-25 — l'area, e cio che non deve contenere                     */
/* ==================================================================== */

let SESSIONE_A = null;

const collegaB = async () => {
  const tokenB = randomUUID().replace(/-/g, "").repeat(2);
  await invitaConTokenNoto(ATLETA_B, UTENTE_B.email, tokenB);
  await rotte.accetta.POST(
    richiesta("/api/v1/athlete-accounts/accept", {
      method: "POST",
      body: { token: tokenB },
    }),
  );
  /* La tessera del tutore, che non e un atleta. */
  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: TUTORE_B.id,
      role: "parent",
      is_primary: true,
      updated_at: new Date(),
    },
  });
};

const seminaAttivita = async () => {
  /*
    Un allenamento su **due** categorie: la primaria e A, la seconda e C, che e
    la seconda categoria dell'atleta A. E la forma di PP-01.
  */
  const giorno = (fra) =>
    new Date(Date.now() + fra * 86400_000).toISOString().slice(0, 10);

  await eventi.createClubEvent(scopeGestione(), "training", {
    title: "Allenamento congiunto",
    date: giorno(3),
    time: "18:00",
    endTime: "19:30",
    categoryId: CAT_C,
    categoryName: "Prima squadra",
    categoryIds: [CAT_C],
    siteId: SEDE_1,
  });

  /* Un allenamento della sola categoria B: e di Bruno, non di Aldo. */
  await eventi.createClubEvent(scopeGestione(), "training", {
    title: "Allenamento riservato Under 15",
    date: giorno(4),
    time: "18:00",
    endTime: "19:30",
    categoryId: CAT_B,
    categoryName: "Under 15",
    categoryIds: [CAT_B],
    siteId: SEDE_1,
  });

  /* Le presenze: una di A, una di B. */
  const eventiClub = await prisma.clubEvent.findMany({
    where: { organization_id: CLUB },
    select: { id: true, title: true },
  });
  const congiunto = eventiClub.find((e) => e.title.includes("congiunto"));
  const riservato = eventiClub.find((e) => e.title.includes("riservato"));

  await prisma.clubEventParticipant.createMany({
    data: [
      {
        id: randomUUID(),
        organization_id: CLUB,
        event_id: congiunto.id,
        athlete_id: ATLETA_A,
        status: "present",
        notes: "nota-di-aldo",
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB,
        event_id: riservato.id,
        athlete_id: ATLETA_B,
        status: "absent",
        notes: "SEGRETO-PRESENZA-B",
        updated_at: new Date(),
      },
    ],
  });

  /* Notifiche: una per l'utenza di A, una per quella di B. */
  await prisma.notification.createMany({
    data: [
      {
        id: randomUUID(),
        organization_id: CLUB,
        user_id: (
          await prisma.athlete.findUnique({
            where: { id: ATLETA_A },
            select: { user_id: true },
          })
        ).user_id,
        title: "Avviso per Aldo",
        message: "visibile",
        type: "info",
        read: false,
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB,
        user_id: UTENTE_B.id,
        title: "SEGRETO-NOTIFICA-B",
        message: "non deve comparire",
        type: "info",
        read: false,
        updated_at: new Date(),
      },
    ],
  });
};

const proveArea = async () => {
  console.log("\n— L'area dell'atleta, e cio che non deve contenere —");

  const utenteA = await prisma.athlete.findUnique({
    where: { id: ATLETA_A },
    select: { user_id: true },
  });
  SESSIONE_A = await sessionePer(
    await prisma.user.findUnique({ where: { id: utenteA.user_id } }),
  );

  const area = await leggi(
    await rotte.me.GET(
      richiesta("/api/v1/athlete-accounts/me", {
        token: SESSIONE_A,
        club: CLUB,
        ruolo: "athlete",
      }),
    ),
  );
  prova("P-10 l'area risponde 200", 200, area.status);
  const dati = area.corpo?.data || {};
  prova("P-10b ed e la scheda di Aldo", ATLETA_A, dati.me?.id);

  const testo = JSON.stringify(dati);

  /* P-11: nessun segreto di B, in nessun ramo della risposta. */
  for (const segreto of [
    "SEGRETO-CLINICO-B",
    "NOTA-MEDICA-B",
    "SEGRETO-PRESENZA-B",
    "SEGRETO-NOTIFICA-B",
    "Bruno",
    TUTORE_B.email,
  ]) {
    prova(
      `P-11 «${segreto}» non compare nell'area di Aldo`,
      false,
      testo.includes(segreto),
    );
  }

  /* P-12: nessun denaro, nessun tutore, nessuna credenziale. */
  for (const chiave of [
    "password_hash",
    "guardians",
    "payments",
    "receipts",
    "invoices",
    "fileUrl",
    "access_code",
  ]) {
    prova(`P-12 la chiave «${chiave}» non esce`, false, testo.includes(chiave));
  }

  /* P-13: del certificato esce lo stato, non il contenuto. */
  prova(
    "P-13 il certificato porta stato ed etichetta e nient'altro",
    ["status", "statusLabel", "expiryDate"],
    Object.keys(dati.health || {}).sort((a, b) =>
      ["status", "statusLabel", "expiryDate"].indexOf(a) -
      ["status", "statusLabel", "expiryDate"].indexOf(b),
    ),
  );

  /* P-14: le due categorie di Aldo ci sono entrambe. */
  prova(
    "P-14 l'area conosce entrambe le categorie di Aldo",
    2,
    (dati.categories || []).length,
    JSON.stringify(dati.categories),
  );

  /* P-15: l'allenamento della **seconda** categoria compare. */
  const titoli = (dati.trainings?.upcoming || []).map((e) => e.title);
  prova(
    "P-15 l'allenamento della seconda categoria compare nel calendario",
    true,
    titoli.some((t) => String(t).includes("congiunto")),
    JSON.stringify(titoli),
  );

  /* P-16: l'allenamento della sola categoria di Bruno **non** compare. */
  prova(
    "P-16 l'allenamento riservato a Under 15 non compare",
    false,
    titoli.some((t) => String(t).includes("riservato")),
    JSON.stringify(titoli),
  );

  /* P-17: la presenza che si vede e la propria. */
  const presenze = dati.attendance?.items || [];
  prova(
    "P-17 fra le presenze non c'e nessuna riga di Bruno",
    false,
    JSON.stringify(presenze).includes("SEGRETO-PRESENZA-B"),
  );

  /*
    P-19 — **Le categorie dell'evento arrivano fino allo schermo.**

    ADR-0111 ha messo tutte le categorie in colonna, ma l'area atleta proiettava
    la sola `categoryName`, cioe l'etichetta della **primaria**. Sull'atleta
    della seconda categoria quella etichetta e il nome di una squadra che non e
    la sua. La riga della schermata incrocia `categories` con le proprie: qui si
    verifica che l'incrocio abbia di che lavorare.
  */
  const congiunto = (dati.trainings?.upcoming || []).find((evento) =>
    String(evento.title || "").includes("congiunto"),
  );
  prova(
    "P-19 l'evento porta l'elenco delle sue categorie, non solo la primaria",
    true,
    Array.isArray(congiunto?.categories) && congiunto.categories.includes(CAT_C),
    JSON.stringify(congiunto?.categories),
  );
  prova(
    "P-19b e una di quelle categorie e una squadra di Aldo",
    true,
    (dati.categories || []).some((categoria) =>
      (congiunto?.categories || []).includes(categoria.id),
    ),
  );

  /* P-18: le notifiche sono quelle indirizzate a lui. */
  const notifiche = (dati.notifications || []).map((n) => n.title);
  prova(
    "P-18 la notifica di Bruno non arriva ad Aldo",
    false,
    notifiche.includes("SEGRETO-NOTIFICA-B"),
    JSON.stringify(notifiche),
  );
};

/* ==================================================================== */
/*  P-30…P-45 — l'attacco                                                */
/* ==================================================================== */

const proveAttacco = async () => {
  console.log("\n— L'attacco: Aldo contro tutto il resto —");

  const comeAldo = (url, opzioni = {}) =>
    richiesta(url, {
      token: SESSIONE_A,
      club: CLUB,
      ruolo: "athlete",
      ...opzioni,
    });

  /* P-30: la bacheca di un altro atleta. */
  const bachecaB = await leggi(
    await rotte.bacheca.GET(comeAldo(`/api/parent-dashboard/${ATLETA_B}/board`), {
      params: { athleteId: ATLETA_B },
    }),
  );
  prova("P-30 la bacheca di Bruno: 403", 403, bachecaB.status);

  /* P-30b: la propria bacheca invece risponde. */
  const bachecaA = await leggi(
    await rotte.bacheca.GET(comeAldo(`/api/parent-dashboard/${ATLETA_A}/board`), {
      params: { athleteId: ATLETA_A },
    }),
  );
  prova("P-30b la propria bacheca: 200", 200, bachecaA.status);

  /* P-31: la scheda clinica di un altro atleta. */
  const profiloB = await leggi(
    await rotte.profiloAtleta.GET(
      comeAldo(`/api/v1/auth/athlete-profile/${ATLETA_B}`),
      { params: { athleteId: ATLETA_B } },
    ),
  );
  prova("P-31 il profilo di Bruno: 403", 403, profiloB.status);

  /* P-32: un identificativo inventato. */
  const inventato = await leggi(
    await rotte.profiloAtleta.GET(
      comeAldo(`/api/v1/auth/athlete-profile/${randomUUID()}`),
      { params: { athleteId: randomUUID() } },
    ),
  );
  prova(
    "P-32 un identificativo inventato non apre niente",
    true,
    inventato.status >= 400,
    String(inventato.status),
  );

  /* P-33: rispondere a una convocazione al posto di un altro. */
  const eventoB = await prisma.clubEvent.findFirst({
    where: { organization_id: CLUB, title: { contains: "riservato" } },
    select: { id: true },
  });
  const rsvpAltrui = await leggi(
    await rotte.rsvp.POST(
      comeAldo("/api/v1/rsvp", {
        method: "POST",
        body: {
          athlete_id: ATLETA_B,
          training_id: eventoB.id,
          status: "yes",
        },
      }),
    ),
  );
  prova(
    "P-33 rispondere al posto di Bruno viene rifiutato",
    true,
    rsvpAltrui.status >= 400,
    JSON.stringify(rsvpAltrui.corpo?.error?.message || rsvpAltrui.status),
  );

  /* P-34: l'elenco atleti dalla rotta generica. */
  const elenco = await leggi(
    await rotte.risorsaElenco.GET(comeAldo("/api/v1/athletes"), {
      params: { resource: "athletes" },
    }),
  );
  prova(
    "P-34 la rotta generica degli atleti e chiusa all'atleta",
    true,
    elenco.status >= 400,
    String(elenco.status),
  );

  /* P-35: la riga di un altro atleta dalla rotta generica. */
  const riga = await leggi(
    await rotte.risorsaRiga.GET(comeAldo(`/api/v1/athletes/${ATLETA_B}`), {
      params: { resource: "athletes", id: ATLETA_B },
    }),
  );
  prova(
    "P-35 la riga di Bruno dalla rotta generica e chiusa",
    true,
    riga.status >= 400,
    String(riga.status),
  );

  /* P-36: gestire il proprio accesso — o quello di un altro. */
  const gestioneAltrui = await leggi(
    await rotte.accountAtleta.GET(
      comeAldo(`/api/v1/athlete-accounts/${ATLETA_B}`),
      { params: { athleteId: ATLETA_B } },
    ),
  );
  prova(
    "P-36 un atleta non gestisce l'accesso di un altro: 403",
    403,
    gestioneAltrui.status,
  );

  const gestioneProprio = await leggi(
    await rotte.accountAtleta.DELETE(
      comeAldo(`/api/v1/athlete-accounts/${ATLETA_A}`, { method: "DELETE" }),
      { params: { athleteId: ATLETA_A } },
    ),
  );
  prova(
    "P-36b e nemmeno il proprio: revocarsi da se e negato",
    403,
    gestioneProprio.status,
  );

  /* P-37: scrivere un campo protetto passando dalla propria rotta. */
  const scrittura = await leggi(
    await rotte.me.PATCH(
      comeAldo("/api/v1/athlete-accounts/me", {
        method: "PATCH",
        body: {
          phone: "3339999999",
          first_name: "Falsificato",
          last_name: "Falsificato",
          fiscal_code: "XXXXXX00X00X000X",
          status: "inactive",
          jersey_number: "99",
          user_id: UTENTE_B.id,
          organization_id: randomUUID(),
          athleteId: ATLETA_B,
        },
      }),
    ),
  );
  prova("P-37 la scrittura dei recapiti riesce", 200, scrittura.status);
  prova(
    "P-37b e ha toccato solo il telefono",
    ["phone"],
    scrittura.corpo?.data?.updated,
  );

  const dopo = await prisma.athlete.findUnique({
    where: { id: ATLETA_A },
    select: { first_name: true, status: true, user_id: true, data: true },
  });
  prova("P-37c il nome non e cambiato", "Aldo", dopo.first_name);
  prova("P-37d lo stato non e cambiato", "active", dopo.status);
  prova(
    "P-37e il legame non e stato dirottato su un'altra utenza",
    false,
    dopo.user_id === UTENTE_B.id,
  );
  prova(
    "P-37f e la scheda di Bruno non e stata toccata",
    false,
    JSON.stringify(
      (
        await prisma.athlete.findUnique({
          where: { id: ATLETA_B },
          select: { data: true },
        })
      ).data,
    ).includes("3339999999"),
  );

  /* P-38: il codice fiscale scritto dentro `data` non passa. */
  prova(
    "P-38 `fiscal_code` non e finito in `athletes.data`",
    false,
    JSON.stringify(dopo.data).includes("XXXXXX00X00X000X"),
  );
};

/* ==================================================================== */
/*  P-40…P-48 — il tutore, il fratello, la carta, l'avviso               */
/* ==================================================================== */

const proveFamiglia = async () => {
  console.log("\n— Il tutore, il fratello, la carta, l'avviso —");

  /*
    **Aldo diventa anche tutore di Carla.** E la configurazione che il mandato
    chiama sibling leakage: un solo essere umano, due legami di natura diversa.
    L'area atleta deve restare **la sua**, non diventare quella di famiglia.
  */
  const carla = await prisma.athlete.findUnique({
    where: { id: ATLETA_C },
    select: { data: true },
  });
  await prisma.athlete.update({
    where: { id: ATLETA_C },
    data: {
      data: {
        ...carla.data,
        guardians: [
          ...(carla.data.guardians || []),
          {
            id: "tutore-aldo",
            first_name: "Aldo",
            last_name: "Atleta",
            email: UTENTE_A.email,
            linked_user_id: UTENTE_A.id,
          },
        ],
      },
    },
  });

  const area = await leggi(
    await rotte.me.GET(
      richiesta("/api/v1/athlete-accounts/me", {
        token: SESSIONE_A,
        club: CLUB,
        ruolo: "athlete",
      }),
    ),
  );
  prova(
    "P-40 essere tutore di un'altra scheda non cambia di chi e l'area",
    ATLETA_A,
    area.corpo?.data?.me?.id,
    "un atleta e se stesso, non i propri fratelli",
  );
  prova(
    "P-40b e di Carla non compare niente",
    false,
    JSON.stringify(area.corpo?.data || {}).includes("Carla"),
  );

  /* P-41: il tutore di Bruno non ha un'area atleta. */
  const sessioneTutore = await sessionePer(TUTORE_B);
  const areaTutore = await leggi(
    await rotte.me.GET(
      richiesta("/api/v1/athlete-accounts/me", {
        token: sessioneTutore,
        club: CLUB,
        ruolo: "parent",
      }),
    ),
  );
  prova(
    "P-41 un tutore non riceve un'area atleta: 403",
    403,
    areaTutore.status,
    "il legame di tutela apre l'area famiglia, non questa",
  );

  /*
    P-42 — **La carta.** Un documento sulla scheda di Bruno, uno su quella di
    Aldo, e un allegato con dei byte veri. Dell'uno l'atleta deve vedere che
    esiste; dell'altro nemmeno l'esistenza; dei byte, mai un indirizzo.
  */
  const allegato = await prisma.attachment
    .create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        owner_type: "athletes",
        owner_id: ATLETA_A,
        category: "identity_document",
        file_name: "carta-identita-aldo.pdf",
        mime_type: "application/pdf",
        size_bytes: 12,
        checksum: "pp04-checksum",
        storage_driver: "database",
        storage_key: `pp04/${randomUUID()}`,
        updated_at: new Date(),
      },
    })
    .catch((errore) => {
      console.log(`        (allegato non seminato: ${errore?.message})`);
      return null;
    });

  const areaConCarte = await leggi(
    await rotte.me.GET(
      richiesta("/api/v1/athlete-accounts/me", {
        token: SESSIONE_A,
        club: CLUB,
        ruolo: "athlete",
      }),
    ),
  );
  const testoCarte = JSON.stringify(areaConCarte.corpo?.data?.documents || []);
  prova(
    "P-42 dai documenti non esce nessun indirizzo di file",
    false,
    /https?:|\/api\/|storage_key|storageKey|fileUrl|attachments\//.test(
      testoCarte,
    ),
    testoCarte.slice(0, 200),
  );
  if (allegato) {
    prova(
      "P-42b e nemmeno la chiave d'archivio dei byte",
      false,
      testoCarte.includes(allegato.storage_key),
    );
  }

  /*
    P-43 — **L'avviso indirizzato a un altro.** La consegna nomina il
    destinatario: la bacheca legge le consegne, non ricalcola il pubblico.
  */
  const avviso = await prisma.clubResourceItem.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      resource_type: "announcements",
      payload: {
        id: randomUUID(),
        title: "SEGRETO-AVVISO-B",
        body: "solo per la Under 15",
        status: "published",
        publishedAt: new Date().toISOString(),
      },
      updated_at: new Date(),
    },
  });
  await prisma.communicationDelivery.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      source_kind: "board",
      source_id: avviso.id,
      channel: "board",
      recipient_user_id: UTENTE_B.id,
      athlete_ids: [ATLETA_B],
      status: "sent",
      dedup_key: `pp04-${randomUUID()}`,
      recipient_key: UTENTE_B.id,
      updated_at: new Date(),
    },
  });

  const bachecaAldo = await leggi(
    await rotte.bacheca.GET(
      richiesta(`/api/parent-dashboard/${ATLETA_A}/board`, {
        token: SESSIONE_A,
        club: CLUB,
        ruolo: "athlete",
      }),
      { params: { athleteId: ATLETA_A } },
    ),
  );
  prova(
    "P-43 l'avviso consegnato a Bruno non compare nella bacheca di Aldo",
    false,
    JSON.stringify(bachecaAldo.corpo?.data || []).includes("SEGRETO-AVVISO-B"),
  );

  /*
    P-44 — **Il ruolo personalizzato che entra in casa propria.**

    La guardia di percorso chiede `normalizeAccessRole(role) === "athlete"`, e
    la rotta chiede il legame. Se le due domande non danno la stessa risposta,
    un atleta con un ruolo di club **non entra nella propria area**: e la forma
    speculare del difetto di P-52, e si vede solo provandola.
  */
  const accessRoles = await carica("src/lib/access-roles.ts");

  /*
    **`athlete` non e un ruolo clonabile**: `CUSTOM_ROLE_BASE_ROLES` elenca
    `club_manager`, `collaborator`, `staff`, `trainer` e basta. Un club non puo
    quindi costruire un «Atleta Under 12» con permessi ristretti. Non e un
    difetto di sicurezza — e un limite di prodotto, e va scritto perche la
    domanda «perche non posso?» arriva dalla segreteria, non dal codice.
  */
  prova(
    "P-44 `athlete` non e fra i ruoli clonabili: un atleta ristretto non si puo creare",
    "",
    accessRoles.buildCustomRoleSlug("athlete", "Atleta Under 12"),
  );

  /*
    P-45 — **Il cambio di ruolo, che non e una revoca e cancella lo stesso.**

    `grantClubAccess` applica «un ruolo alla volta per persona e per club»:
    assegnare un ruolo nuovo **cancella** le altre tessere con
    `organizationUser.delete` e `reason: "replaced_by_new_role"`. Quel ramo non
    chiama nessuno sweep — `unlinkDirectAthleteProfile` sta solo dentro
    `revokeClubAccess` e dentro `memberships/delete`.

    Quindi: la segreteria cambia a un atleta il ruolo da «Atleta» a
    «Collaboratore»; la tessera `athlete` sparisce, `athletes.user_id` resta, e
    la persona **appartiene ancora al club**. E la forma di P-52 che il
    controllo di sola appartenenza non intercetta.
  */
  await prisma.athlete.update({
    where: { id: ATLETA_A },
    data: { user_id: UTENTE_A.id },
  });
  await prisma.organizationUser.deleteMany({
    where: { organization_id: CLUB, user_id: UTENTE_A.id },
  });
  const tesseraAtleta = await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: UTENTE_A.id,
      role: "athlete",
      is_primary: true,
      updated_at: new Date(),
    },
  });

  const ruoliClub = await carica("src/lib/server/club-roles.ts");
  await ruoliClub.assignClubRole(
    {
      userId: PRESIDENTE.id,
      activeOrganizationId: CLUB,
      activeRole: "owner",
      allowedOrganizationIds: [CLUB],
      actorEmail: PRESIDENTE.email,
    },
    { userId: UTENTE_A.id, role: "collaborator" },
  );

  prova(
    "P-45a la tessera di atleta e stata sostituita",
    true,
    (await prisma.organizationUser.findUnique({
      where: { id: tesseraAtleta.id },
    })) === null,
  );
  prova(
    "P-45b e la persona appartiene ancora al club",
    true,
    (await prisma.organizationUser.findFirst({
      where: { organization_id: CLUB, user_id: UTENTE_A.id },
    })) !== null,
  );

  const sessioneDopoCambio = await sessionePer(
    await prisma.user.findUnique({ where: { id: UTENTE_A.id } }),
  );
  const areaDopoCambio = await leggi(
    await rotte.me.GET(
      richiesta("/api/v1/athlete-accounts/me", {
        token: sessioneDopoCambio,
        club: CLUB,
        ruolo: "collaborator",
      }),
    ),
  );
  prova(
    "P-45 cambiato il ruolo, l'area atleta non si apre piu: 403",
    403,
    areaDopoCambio.status,
    "un legame non e una tessera: chi non e piu un atleta non ha un'area atleta",
  );

  /*
    P-46 — **E l'atleta vero continua a entrare.** Un controllo nuovo si misura
    due volte: che chiuda cio che deve, e che **non chiuda altro**. Senza questa
    riga, «403 sempre» supererebbe P-45 e P-52 a pieni voti.
  */
  await prisma.organizationUser.deleteMany({
    where: { organization_id: CLUB, user_id: UTENTE_A.id },
  });
  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: UTENTE_A.id,
      role: "athlete",
      is_primary: true,
      updated_at: new Date(),
    },
  });

  const sessioneRipristinata = await sessionePer(
    await prisma.user.findUnique({ where: { id: UTENTE_A.id } }),
  );
  const areaRipristinata = await leggi(
    await rotte.me.GET(
      richiesta("/api/v1/athlete-accounts/me", {
        token: sessioneRipristinata,
        club: CLUB,
        ruolo: "athlete",
      }),
    ),
  );
  prova(
    "P-46 rimessa la tessera di atleta, l'area torna ad aprirsi: 200",
    200,
    areaRipristinata.status,
  );
  SESSIONE_A = sessioneRipristinata;
};

/* ==================================================================== */
/*  P-50…P-58 — la revoca vale sull'identita                             */
/* ==================================================================== */

const proveRevoca = async () => {
  console.log("\n— La revoca —");

  /* P-50: la revoca completa chiude l'area **con la stessa sessione**. */
  await dominio.revokeAthleteAccess(scopeGestione(), { athleteId: ATLETA_A });

  const dopoRevoca = await leggi(
    await rotte.me.GET(
      richiesta("/api/v1/athlete-accounts/me", {
        token: SESSIONE_A,
        club: CLUB,
        ruolo: "athlete",
      }),
    ),
  );
  prova(
    "P-50 dopo la revoca la stessa sessione non apre piu l'area: 403",
    403,
    dopoRevoca.status,
  );

  const tesseraDopo = await prisma.organizationUser.findFirst({
    where: { organization_id: CLUB, user_id: UTENTE_A.id, role: "athlete" },
  });
  prova("P-50b e la tessera e sparita", true, tesseraDopo === null);

  /* P-51: e nemmeno la bacheca. */
  const bachecaDopo = await leggi(
    await rotte.bacheca.GET(
      richiesta(`/api/parent-dashboard/${ATLETA_A}/board`, {
        token: SESSIONE_A,
        club: CLUB,
        ruolo: "athlete",
      }),
      { params: { athleteId: ATLETA_A } },
    ),
  );
  prova("P-51 e nemmeno la bacheca: 403", 403, bachecaDopo.status);

  /*
    P-52 — **La revoca della tessera dalla Gestione Accessi.**

    E la strada che PP-02 ha trovato rotta altrove: la revoca vale sulla
    **riga** che si e guardata, e non sull'**identita**. Qui si revoca una
    tessera il cui slug non e la parola `athlete` — che e cio che un ruolo
    personalizzato produce — e si domanda se il legame sopravvive.
  */
  const tokenRi = randomUUID().replace(/-/g, "").repeat(2);
  await invitaConTokenNoto(ATLETA_A, UTENTE_A.email, tokenRi);
  await rotte.accetta.POST(
    richiesta("/api/v1/athlete-accounts/accept", {
      method: "POST",
      body: { token: tokenRi },
    }),
  );

  const tesseraRi = await prisma.organizationUser.findFirst({
    where: { organization_id: CLUB, user_id: UTENTE_A.id, role: "athlete" },
  });
  /* Le si da lo slug di un ruolo personalizzato, come farebbe ADR-0102. */
  await prisma.organizationUser.update({
    where: { id: tesseraRi.id },
    data: { role: "atleta-under-12" },
  });

  const ruoliClub = await carica("src/lib/server/club-roles.ts");
  await ruoliClub.revokeClubAccess(
    {
      userId: PRESIDENTE.id,
      activeOrganizationId: CLUB,
      activeRole: "owner",
      allowedOrganizationIds: [CLUB],
      actorEmail: PRESIDENTE.email,
    },
    tesseraRi.id,
  );

  const tesseraSuperstite = await prisma.organizationUser.findFirst({
    where: { organization_id: CLUB, user_id: UTENTE_A.id },
  });
  prova(
    "P-52a la tessera e stata davvero revocata",
    true,
    tesseraSuperstite === null,
  );

  const legameSuperstite = await prisma.athlete.findUnique({
    where: { id: ATLETA_A },
    select: { user_id: true },
  });

  const sessioneRi = await sessionePer(
    await prisma.user.findUnique({ where: { id: UTENTE_A.id } }),
  );
  const areaDopoTessera = await leggi(
    await rotte.me.GET(
      richiesta("/api/v1/athlete-accounts/me", {
        token: sessioneRi,
        club: CLUB,
        ruolo: "athlete",
      }),
    ),
  );

  console.log(
    `        legame superstite: ${JSON.stringify(legameSuperstite.user_id)}`,
  );
  prova(
    "P-52 revocata la tessera, l'area non si apre piu: 403",
    403,
    areaDopoTessera.status,
    "una revoca deve valere sull'identita, non sulla riga che si e guardata",
  );

  /*
    P-53 — **La revoca dell'accesso atleta toglie anche la tessera che porta
    lo slug di un ruolo personalizzato.**

    Il verso opposto di P-52: li si revocava la tessera e restava il legame,
    qui si revoca l'accesso e restava la tessera. Le due meta dello stesso
    difetto — una revoca che guarda una parola invece di una persona.
  */
  await prisma.athlete.update({
    where: { id: ATLETA_A },
    data: { user_id: UTENTE_A.id },
  });
  const tesseraPersonalizzata = await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: UTENTE_A.id,
      role: "atleta",
      is_primary: true,
      updated_at: new Date(),
    },
  });

  await dominio.revokeAthleteAccess(scopeGestione(), { athleteId: ATLETA_A });

  const superstite = await prisma.organizationUser.findUnique({
    where: { id: tesseraPersonalizzata.id },
  });
  prova(
    "P-53 la revoca toglie anche la tessera con lo slug italiano",
    true,
    superstite === null,
    "`role: \"athlete\"` toglieva solo la riga scritta con quella parola",
  );

  /*
    P-54 — **Il ruolo personalizzato, che il finto Prisma non sa rappresentare.**

    Il legame `organization_users.custom_role_id -> club_roles.base_role` e una
    relazione: il finto lo ignora e restituisce la riga cruda, quindi un test
    con la fixture proverebbe il ramo di ripiego e non questo. Qui c'e una riga
    vera, con la sua chiave esterna.
  */
  await prisma.athlete.update({
    where: { id: ATLETA_A },
    data: { user_id: UTENTE_A.id },
  });
  const ruoloClub = await prisma.clubRole.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      slug: "atleta-under-12",
      name: "Atleta Under 12",
      base_role: "athlete",
      is_active: true,
      updated_at: new Date(),
    },
  });
  const tesseraCustom = await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: UTENTE_A.id,
      role: "atleta-under-12",
      custom_role_id: ruoloClub.id,
      is_primary: true,
      updated_at: new Date(),
    },
  });

  await dominio.revokeAthleteAccess(scopeGestione(), { athleteId: ATLETA_A });

  prova(
    "P-54 la revoca toglie anche la tessera di un ruolo personalizzato su `athlete`",
    true,
    (await prisma.organizationUser.findUnique({
      where: { id: tesseraCustom.id },
    })) === null,
  );

  /* P-55: e una tessera che **non** e un atleta resta dov'e. */
  await prisma.athlete.update({
    where: { id: ATLETA_A },
    data: { user_id: UTENTE_A.id },
  });
  const tesseraGenitore = await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: UTENTE_A.id,
      role: "parent",
      is_primary: true,
      updated_at: new Date(),
    },
  });
  await dominio.revokeAthleteAccess(scopeGestione(), { athleteId: ATLETA_A });
  prova(
    "P-55 la tessera di genitore sopravvive alla revoca dell'accesso atleta",
    true,
    (await prisma.organizationUser.findUnique({
      where: { id: tesseraGenitore.id },
    })) !== null,
    "un allargamento va misurato due volte: che faccia cio che deve, e che non faccia altro",
  );
};

/* ==================================================================== */
/*  P-60…P-66 — il minore, dalla rotta vera                              */
/* ==================================================================== */

/**
 * **La conferma sulla responsabilita genitoriale, misurata sulla rotta**
 * (ADR-0116).
 *
 * Il test a fake Prisma — `tests/server/pp-04-minori.test.mjs` — misura il
 * dominio. Qui si chiama `POST /api/v1/athlete-accounts/:id` con una sessione
 * vera di chi ha il permesso, perche la lezione di PP-01 e che un servizio
 * verde non implica una rotta corretta: il campo puo non essere letto dal
 * corpo, o esserlo come truthy.
 *
 * Il club di questa sonda e gia stato cancellato dalle prove sulla revoca?
 * No: `pulisci()` gira nel `finally` di `main`, e questa sezione ci arriva
 * prima. Ma le prove sulla revoca hanno lasciato Aldo **senza tessera**, e la
 * sonda semina qui i propri atleti invece di riusare i loro stati.
 */
const proveMinore = async () => {
  console.log("\n— Il minore, e la decisione che nessuna policy scrive —");

  const SESSIONE_GESTIONE = await sessionePer(PRESIDENTE);
  const comePresidente = (url, opzioni = {}) =>
    richiesta(url, {
      token: SESSIONE_GESTIONE,
      club: CLUB,
      ruolo: "owner",
      ...opzioni,
    });

  const nuovoAtleta = async (nome, birthDate) => {
    const id = randomUUID();
    await prisma.athlete.create({
      data: {
        id,
        organization_id: CLUB,
        first_name: nome,
        last_name: "Minori",
        status: "active",
        category_id: CAT_A,
        category_name: "Under 12",
        birth_date: birthDate,
        data: {},
        updated_at: new Date(),
      },
    });
    return id;
  };

  const anniFa = (anni) => {
    const data = new Date();
    data.setFullYear(data.getFullYear() - anni);
    return data;
  };

  const MINORENNE = await nuovoAtleta("Nina", anniFa(12));
  const SENZA_DATA = await nuovoAtleta("Ignoto", null);
  const ADULTO = await nuovoAtleta("Adulto", anniFa(25));

  /* P-60: la rotta rifiuta l'invito a un minore senza la dichiarazione. */
  const senzaConferma = await leggi(
    await rotte.accountAtleta.POST(
      comePresidente(`/api/v1/athlete-accounts/${MINORENNE}`, {
        method: "POST",
        body: { email: "nina@pp04.invalid" },
      }),
      { params: { athleteId: MINORENNE } },
    ),
  );
  prova("P-60 invitare un minore senza conferma: 400", 400, senzaConferma.status);
  prova(
    "P-60b e non resta nessun invito in archivio",
    0,
    await prisma.athleteAccountInvite.count({
      where: { athlete_id: MINORENNE },
    }),
  );
  prova(
    "P-60c ne nessuna utenza nata dal gesto rifiutato",
    0,
    await prisma.user.count({ where: { email: "nina@pp04.invalid" } }),
  );

  /*
    P-61: **il truthy**. `"false"` e una stringa non vuota, quindi truthy: e la
    forma esatta con cui una casella mal serializzata autorizzerebbe da sola.
  */
  for (const finta of ["true", "false", 1, "on"]) {
    const truthy = await leggi(
      await rotte.accountAtleta.POST(
        comePresidente(`/api/v1/athlete-accounts/${MINORENNE}`, {
          method: "POST",
          body: { email: "nina@pp04.invalid", acknowledgeMinor: finta },
        }),
        { params: { athleteId: MINORENNE } },
      ),
    );
    prova(
      `P-61 \`acknowledgeMinor: ${JSON.stringify(finta)}\` non e una dichiarazione: 400`,
      400,
      truthy.status,
    );
  }

  /* P-62: con la dichiarazione vera l'invito parte. */
  const conConferma = await leggi(
    await rotte.accountAtleta.POST(
      comePresidente(`/api/v1/athlete-accounts/${MINORENNE}`, {
        method: "POST",
        body: { email: "nina@pp04.invalid", acknowledgeMinor: true },
      }),
      { params: { athleteId: MINORENNE } },
    ),
  );
  prova("P-62 con la dichiarazione l'invito parte: 201", 201, conConferma.status);
  prova(
    "P-62b e la risposta non porta ne token ne password",
    true,
    !/token|password/i.test(JSON.stringify(conConferma.corpo)),
  );

  /* P-63: la dichiarazione e nell'audit, con il nome di chi l'ha fatta. */
  const rigaAudit = await prisma.auditLog.findFirst({
    where: {
      organization_id: CLUB,
      resource: "athlete_account_invites",
    },
    orderBy: { created_at: "desc" },
  });
  prova(
    "P-63 l'audit registra che il soggetto era un minore",
    true,
    rigaAudit?.metadata?.minor === true,
    JSON.stringify(rigaAudit?.metadata),
  );
  prova(
    "P-63b e che la responsabilita genitoriale e stata dichiarata",
    true,
    rigaAudit?.metadata?.guardian_acknowledged === true,
  );
  prova(
    "P-63c accanto a chi l'ha fatta",
    PRESIDENTE.id,
    rigaAudit?.actor_user_id,
  );

  /* P-64: un'anagrafica senza data di nascita si tratta come minore. */
  const senzaData = await leggi(
    await rotte.accountAtleta.POST(
      comePresidente(`/api/v1/athlete-accounts/${SENZA_DATA}`, {
        method: "POST",
        body: { email: "ignoto@pp04.invalid" },
      }),
      { params: { athleteId: SENZA_DATA } },
    ),
  );
  prova(
    "P-64 nessuna data di nascita si tratta come minore: 400",
    400,
    senzaData.status,
  );

  /* P-65: **la guardia non fa troppo.** Il maggiorenne non deve dichiarare. */
  const adulto = await leggi(
    await rotte.accountAtleta.POST(
      comePresidente(`/api/v1/athlete-accounts/${ADULTO}`, {
        method: "POST",
        body: { email: "adulto@pp04.invalid" },
      }),
      { params: { athleteId: ADULTO } },
    ),
  );
  prova(
    "P-65 il maggiorenne non deve dichiarare niente: 201",
    201,
    adulto.status,
  );

  const auditAdulto = await prisma.auditLog.findFirst({
    where: { organization_id: CLUB, resource: "athlete_account_invites" },
    orderBy: { created_at: "desc" },
  });
  prova(
    "P-65b e l'audit non gli attribuisce una responsabilita genitoriale",
    null,
    auditAdulto?.metadata?.guardian_acknowledged ?? null,
  );

  /* P-66: lo stato che il pannello legge porta `isMinor`, non la data. */
  const stato = await leggi(
    await rotte.accountAtleta.GET(
      comePresidente(`/api/v1/athlete-accounts/${MINORENNE}`),
      { params: { athleteId: MINORENNE } },
    ),
  );
  prova("P-66 lo stato risponde 200", 200, stato.status);
  prova("P-66b e dichiara il minore", true, stato.corpo?.data?.isMinor);
  prova(
    "P-66c senza far uscire la data di nascita",
    false,
    /birth_?[Dd]ate/.test(JSON.stringify(stato.corpo)),
  );
};

/* ==================================================================== */
/*  P-70…P-78 — il ramo del tutore non e una seconda strada (ADR-0122)   */
/* ==================================================================== */

/**
 * **Il Critical che il primo giro aveva spostato invece di chiudere.**
 *
 * ADR-0117 ha chiuso il ramo diretto sulla tessera viva; ADR-0118 lo ha chiuso
 * sulle rotte del cruscotto di famiglia. Nessuno dei due guardava
 * `isGuardianLinkedToUser`, che accetta `guardians[].email` come ripiego di
 * `linkedUserEmail`.
 *
 * Quella coincidenza il prodotto **la produce da se**: la segreteria scrive la
 * casella dei genitori nel tutore, e su quella stessa casella invita il
 * ragazzo. Da li `athleteBelongsToParent` usciva dal ramo del tutore, dove non
 * c'e ne `ancoraAtleta` ne `allowSelfAthleteLink`, e il cruscotto tornava a
 * consegnare quote, ricevute, codice fiscale del tutore, diagnosi e indirizzo
 * del file del certificato — anche a chi nel club non aveva piu niente.
 *
 * La sezione semina **la coincidenza**, non un caso limite: un club, un
 * dodicenne, la casella di famiglia in tutti e due i posti.
 */
const proveRamoTutore = async () => {
  console.log("\n— Il ramo del tutore (ADR-0122) —");

  const ATLETA_D = randomUUID();
  const CASA = "casa-dominici@pp04.invalid";
  const UTENTE_D = await utente(CASA, "Dodo");
  /*
    Il tutore **vero**: un'altra persona, con un'altra casella, e con la
    tessera `parent` che il riscatto del token genitore scrive insieme al
    legame. Modellarlo senza tessera non sarebbe piu severo, sarebbe **falso**:
    `getParentLinkedAthletes` cerca gli atleti candidati nei club in cui la
    persona ha una tessera o di cui e fondatrice, e senza nessuna delle due
    l'elenco esce vuoto per una ragione che non c'entra con questa sezione
    (annotato come PP04-D7).
  */
  const TUTORE_D = await utente("tutore-d@pp04.invalid", "Delia");
  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: TUTORE_D.id,
      role: "parent",
      is_primary: true,
      updated_at: new Date(),
    },
  });

  await prisma.athlete.create({
    data: {
      id: ATLETA_D,
      organization_id: CLUB,
      first_name: "Dodo",
      last_name: "Dominici",
      status: "active",
      category_id: CAT_A,
      category_name: "Under 12",
      birth_date: new Date("2013-04-04"),
      data: {
        email: CASA,
        allergies: "SEGRETO-D-ALLERGIA",
        medical_notes: "SEGRETO-D-NOTA-MEDICA",
        guardians: [
          {
            id: "g-casa",
            first_name: "Delia",
            last_name: "Dominici",
            /* La casella di famiglia, scritta due volte. */
            email: CASA,
            fiscal_code: "SEGRETO-D-CF-TUTORE",
          },
          {
            id: "g-delia",
            first_name: "Delia",
            last_name: "Dominici",
            email: TUTORE_D.email,
          },
        ],
      },
      updated_at: new Date(),
    },
  });
  /*
    **Il legame nasce dal riscatto vero, non da una `update`** (ADR-0123).

    `acceptAthleteAccountInvite` e l'**unico** scrittore di
    `athletes.user_id` in tutto il repository — gli altri tre punti lo
    azzerano — e scrive nella stessa transazione il legame, la tessera
    `athlete` e la chiusura dell'invito. Seminare quello stato a mano
    modellerebbe un archivio che il prodotto non produce, e nasconderebbe
    proprio il fatto durevole su cui la guardia di ADR-0123 poggia: la riga
    dell'invito **accettato**, che ne la revoca ne lo scollegamento cancellano.
  */
  const gettoneD = randomUUID().replace(/-/g, "").repeat(2);
  await prisma.athleteAccountInvite.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      athlete_id: ATLETA_D,
      user_id: UTENTE_D.id,
      email: CASA,
      token_hash: createHash("sha256").update(gettoneD).digest("hex"),
      status: "sent",
      expires_at: new Date(Date.now() + 30 * 864e5),
      sent_at: new Date(),
      updated_at: new Date(),
    },
  });
  await dominio.acceptAthleteAccountInvite(gettoneD);

  const quota = await prisma.athletePayment.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      athlete_id: ATLETA_D,
      description: "SEGRETO-D-QUOTA",
      amount: 320,
      status: "pending",
      due_date: new Date(Date.now() + 864e5),
      updated_at: new Date(),
    },
  });
  await prisma.receipt.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      athlete_id: ATLETA_D,
      payment_id: quota.id,
      receipt_number: "SEGRETO-D-RICEVUTA",
      description: "quota",
      amount: 320,
      issue_date: new Date(),
      updated_at: new Date(),
    },
  });
  await prisma.medicalCertificate.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      athlete_id: ATLETA_D,
      type: "agonistico",
      status: "valid",
      issue_date: new Date(),
      expiry_date: new Date(Date.now() + 200 * 864e5),
      file_url: "/api/v1/attachments/SEGRETO-D-FILE-CERT",
      notes: "SEGRETO-D-DIAGNOSI",
      updated_at: new Date(),
    },
  });
  await prisma.notification.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: UTENTE_D.id,
      title: "Avviso per Dodo",
      message: "visibile",
      type: "info",
      read: false,
      updated_at: new Date(),
    },
  });

  const SEGRETI = [
    "SEGRETO-D-QUOTA",
    "SEGRETO-D-RICEVUTA",
    "SEGRETO-D-CF-TUTORE",
    "SEGRETO-D-DIAGNOSI",
    "SEGRETO-D-FILE-CERT",
    "SEGRETO-D-NOTA-MEDICA",
    "SEGRETO-D-ALLERGIA",
  ];
  const nessunSegreto = (risposta) =>
    SEGRETI.filter((segreto) =>
      JSON.stringify(risposta.corpo ?? "").includes(segreto),
    );

  const sessioneD = await sessionePer(
    await prisma.user.findUnique({ where: { id: UTENTE_D.id } }),
  );
  const comeD = (url, extra) =>
    richiesta(url, { token: sessioneD, club: CLUB, ruolo: "athlete", ...extra });
  const suD = { params: { athleteId: ATLETA_D } };

  /*
    P-70 — **La prova che senza il fix e rossa.** L'utenza dell'atleta apre il
    cruscotto della **propria** scheda, e la casella coincide con quella del
    tutore. Prima di ADR-0122: 200, con tutto dentro.
  */
  const cruscotto = await leggi(
    await rotte.famiglia.GET(comeD(`/api/parent-dashboard/${ATLETA_D}`), suD),
  );
  prova(
    "P-70 la casella di famiglia coincidente non apre il cruscotto: 403",
    403,
    cruscotto.status,
    "il ramo del tutore accettava `guardians[].email` e scavalcava le due guardie",
  );
  prova(
    "P-70b e nel corpo non resta nessuno dei sette segreti",
    [],
    nessunSegreto(cruscotto),
  );

  /* P-71: e nemmeno le scritture che il cruscotto porta con se. */
  const segnaLetta = await leggi(
    await rotte.notifiche.PATCH(
      comeD(`/api/parent-dashboard/${ATLETA_D}/notifications`, {
        method: "PATCH",
        body: { all: true },
      }),
      suD,
    ),
  );
  prova(
    "P-71 ne la scrittura sulle notifiche della famiglia: 403",
    403,
    segnaLetta.status,
  );

  /* P-72: ne i consensi, che sono decisioni di chi ha la responsabilita. */
  const consensi = await leggi(
    await rotte.consensi.GET(
      comeD(`/api/parent-dashboard/${ATLETA_D}/consents`),
      suD,
    ),
  );
  prova("P-72 ne i consensi della famiglia: 403", 403, consensi.status);

  /*
    P-73 — **E l'area atleta si apre lo stesso.** Senza questa riga «403
    sempre» supererebbe P-70, P-71 e P-72 a pieni voti: il fix e la
    **distinzione**, non la chiusura.
  */
  const area = await leggi(
    await rotte.me.GET(comeD("/api/v1/athlete-accounts/me")),
  );
  prova("P-73 la propria area resta aperta: 200", 200, area.status);
  prova(
    "P-73b e non contiene nessuno dei sette segreti",
    [],
    nessunSegreto(area),
  );
  const bacheca = await leggi(
    await rotte.bacheca.GET(
      comeD(`/api/parent-dashboard/${ATLETA_D}/board`),
      suD,
    ),
  );
  prova("P-73c e la bacheca risponde: 200", 200, bacheca.status);

  /*
    P-74 — **Le tessere: `linked_athlete_ids` del ruolo atleta.**

    E la ragione per cui `GET /api/v1/auth/memberships` dichiara il ramo
    diretto. Senza, l'elenco esce vuoto e `getAccessRedirectPath("athlete", …)`
    rimanda su `/account` chi era dov'era autorizzato a stare.
  */
  const tessere = await leggi(
    await rotte.tessere.GET(comeD("/api/v1/auth/memberships")),
  );
  const rigaAtleta = (
    Array.isArray(tessere.corpo?.data) ? tessere.corpo.data : []
  ).find((riga) => riga.organization_id === CLUB && riga.role === "athlete");
  prova(
    "P-74 la tessera di atleta porta la propria scheda in `linked_athlete_ids`",
    [ATLETA_D],
    rigaAtleta?.linked_athlete_ids ?? null,
    "senza, il rientro nell'area atleta finisce su /account",
  );

  /*
    P-75 — **Il punto in cui il Critical era stato spostato**: tolta ogni
    tessera, il legame resta e la casella resta fra i tutori. Prima di
    ADR-0122 questa era la porta che riapriva tutto a un ex atleta.
  */
  await prisma.organizationUser.deleteMany({
    where: { organization_id: CLUB, user_id: UTENTE_D.id },
  });
  const areaEx = await leggi(
    await rotte.me.GET(comeD("/api/v1/athlete-accounts/me")),
  );
  prova("P-75 l'ex atleta non apre piu la propria area: 403", 403, areaEx.status);
  const cruscottoEx = await leggi(
    await rotte.famiglia.GET(comeD(`/api/parent-dashboard/${ATLETA_D}`), suD),
  );
  prova(
    "P-75b e nemmeno il cruscotto, che era la porta rimasta aperta: 403",
    403,
    cruscottoEx.status,
  );
  prova(
    "P-75c con zero segreti nel corpo",
    [],
    nessunSegreto(cruscottoEx),
  );

  /*
    P-76 — **Il tutore vero entra, e non e un atleta di nessuno.**

    Delia e una persona diversa: sulla riga di Dodo `user_id` non punta a lei, il
    ramo diretto non la riguarda, e il ramo del tutore vale come prima — per
    email, che e come un club registra un tutore prima che ne redima uno
    proprio, e con la tessera `parent` che le da un club di appartenenza.
    Questo e il controllo sul **non fare troppo**.
  */
  const sessioneTutore = await sessionePer(
    await prisma.user.findUnique({ where: { id: TUTORE_D.id } }),
  );
  const cruscottoTutore = await leggi(
    await rotte.famiglia.GET(
      richiesta(`/api/parent-dashboard/${ATLETA_D}`, {
        token: sessioneTutore,
        club: CLUB,
        ruolo: "parent",
      }),
      suD,
    ),
  );
  prova(
    "P-76 il tutore vero, che e un'altra persona, entra come prima: 200",
    200,
    cruscottoTutore.status,
  );
  prova(
    "P-76b e ci trova cio per cui l'area e stata scritta",
    true,
    JSON.stringify(cruscottoTutore.corpo ?? "").includes("SEGRETO-D-QUOTA"),
  );

  /* ================================================================== *
   *  P-77…P-79 — la revoca non deve riaprire la porta che chiude
   *              (ADR-0123)
   * ================================================================== */

  /*
    **Il gesto che toglie l'accesso era il gesto che lo riapriva.**

    ADR-0122 aveva scritto la guardia su `athletes.user_id`. Lo scollegamento
    e la revoca azzerano proprio quel campo: da li in poi la stessa persona
    tornava a passare dal ramo del tutore, dove la coincidenza della casella
    vale come legame. Un terzo giro di revisione ostile lo ha misurato —
    `/api/v1/athlete-accounts/me` 403 e `/api/parent-dashboard/<la stessa
    scheda>` 200, con dentro tutto.

    Si semina una scheda per gesto, con lo stesso stato di partenza: la
    casella di famiglia scritta due volte e il legame nato da un riscatto
    vero.
  */
  const seminaConCasa = async (nome, cognome, nascita) => {
    const id = randomUUID();
    const casella = `casa-${nome.toLowerCase()}@pp04.invalid`;
    const persona = await utente(casella, nome);
    await prisma.athlete.create({
      data: {
        id,
        organization_id: CLUB,
        first_name: nome,
        last_name: cognome,
        status: "active",
        category_id: CAT_A,
        category_name: "Under 12",
        birth_date: new Date(nascita),
        data: {
          email: casella,
          allergies: "SEGRETO-D-ALLERGIA",
          medical_notes: "SEGRETO-D-NOTA-MEDICA",
          guardians: [
            {
              id: "g-casa",
              first_name: "Genitore",
              last_name: cognome,
              email: casella,
              fiscal_code: "SEGRETO-D-CF-TUTORE",
            },
          ],
        },
        updated_at: new Date(),
      },
    });
    await prisma.athletePayment.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: id,
        description: "SEGRETO-D-QUOTA",
        amount: 100,
        status: "pending",
        due_date: new Date(Date.now() + 864e5),
        updated_at: new Date(),
      },
    });
    await prisma.medicalCertificate.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: id,
        type: "agonistico",
        status: "valid",
        issue_date: new Date(),
        expiry_date: new Date(Date.now() + 200 * 864e5),
        file_url: "/api/v1/attachments/SEGRETO-D-FILE-CERT",
        notes: "SEGRETO-D-DIAGNOSI",
        updated_at: new Date(),
      },
    });
    const gettone = randomUUID().replace(/-/g, "").repeat(2);
    await prisma.athleteAccountInvite.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: id,
        user_id: persona.id,
        email: casella,
        token_hash: createHash("sha256").update(gettone).digest("hex"),
        status: "sent",
        expires_at: new Date(Date.now() + 30 * 864e5),
        sent_at: new Date(),
        updated_at: new Date(),
      },
    });
    await dominio.acceptAthleteAccountInvite(gettone);
    const sessione = await sessionePer(
      await prisma.user.findUnique({ where: { id: persona.id } }),
    );
    return { id, persona, sessione, params: { params: { athleteId: id } } };
  };

  const apreIlCruscotto = async (scheda, token = scheda.sessione, ruolo = "athlete") =>
    leggi(
      await rotte.famiglia.GET(
        richiesta(`/api/parent-dashboard/${scheda.id}`, {
          token,
          club: CLUB,
          ruolo,
        }),
        scheda.params,
      ),
    );
  const apreLaSuaArea = async (scheda) =>
    leggi(
      await rotte.me.GET(
        richiesta("/api/v1/athlete-accounts/me", {
          token: scheda.sessione,
          club: CLUB,
          ruolo: "athlete",
        }),
      ),
    );

  /* P-77 — lo **scollegamento**: la tessera resta viva, il legame no. */
  const scollegata = await seminaConCasa("Enzo", "Esposito", "2012-06-06");
  prova(
    "P-77a prima dello scollegamento la sua area si apre",
    200,
    (await apreLaSuaArea(scollegata)).status,
  );
  await dominio.unlinkAthleteAccount(scopeGestione(), {
    athleteId: scollegata.id,
  });
  prova(
    "P-77b lo scollegamento ha azzerato athletes.user_id",
    null,
    (
      await prisma.athlete.findUnique({
        where: { id: scollegata.id },
        select: { user_id: true },
      })
    ).user_id,
  );
  prova(
    "P-77c e l'area atleta si chiude: 403",
    403,
    (await apreLaSuaArea(scollegata)).status,
  );
  const cruscottoScollegato = await apreIlCruscotto(scollegata);
  prova(
    "P-77 e il cruscotto si chiude con lei: 403",
    403,
    cruscottoScollegato.status,
    "era la porta che lo scollegamento apriva: /me 403 e questa 200",
  );
  prova(
    "P-77d con zero segreti nel corpo",
    [],
    nessunSegreto(cruscottoScollegato),
  );

  /* P-78 — la **revoca**, con una tessera residua che tiene la persona nel club. */
  const revocata = await seminaConCasa("Fabio", "Ferri", "2011-07-07");
  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: revocata.persona.id,
      role: "parent",
      is_primary: false,
      updated_at: new Date(),
    },
  });
  await dominio.revokeAthleteAccess(scopeGestione(), { athleteId: revocata.id });
  prova(
    "P-78a la revoca toglie la tessera di atleta e lascia l'altra",
    ["parent"],
    (
      await prisma.organizationUser.findMany({
        where: { organization_id: CLUB, user_id: revocata.persona.id },
        select: { role: true },
      })
    ).map((riga) => riga.role),
  );
  prova(
    "P-78b l'area atleta si chiude: 403",
    403,
    (await apreLaSuaArea(revocata)).status,
  );
  const cruscottoRevocato = await apreIlCruscotto(revocata);
  prova(
    "P-78 e il cruscotto non riapre dal ramo del tutore: 403",
    403,
    cruscottoRevocato.status,
    "la tessera residua la teneva fra i candidati, e la casella la faceva passare",
  );
  prova(
    "P-78c con zero segreti nel corpo",
    [],
    nessunSegreto(cruscottoRevocato),
  );

  /*
    P-79 — **la guardia non fa troppo, di nuovo.** Il tutore di Fabio, che e
    un'altra persona, entra come prima: revocare l'accesso dell'atleta non e
    revocare quello della sua famiglia (ADR-0116, terza domanda aperta).
  */
  const precedente = (
    await prisma.athlete.findUnique({
      where: { id: revocata.id },
      select: { data: true },
    })
  ).data;
  await prisma.athlete.update({
    where: { id: revocata.id },
    data: {
      data: {
        ...precedente,
        guardians: [
          {
            id: "g-delia",
            first_name: "Delia",
            last_name: "Ferri",
            email: TUTORE_D.email,
            fiscal_code: "SEGRETO-D-CF-TUTORE",
          },
        ],
      },
    },
  });
  prova(
    "P-79 il tutore entra sulla scheda di un ex atleta revocato: 200",
    200,
    (await apreIlCruscotto(revocata, sessioneTutore, "parent")).status,
    "revocare l'accesso dell'atleta non revoca quello della sua famiglia",
  );
};

/* ==================================================================== *
 *  P-80…P-87 — un'identita, due cappelli (ADR-0124)
 * ==================================================================== */

/**
 * **Il verso opposto dei tre round precedenti.**
 *
 * ADR-0122 e ADR-0123 hanno chiuso il ramo del tutore a chi e, o e stato,
 * l'account di quella scheda. Un quarto giro di revisione ostile ha misurato
 * cosa succede quando quella persona **e davvero** il tutore: il flusso che
 * ADR-0122 descrive come normale — il minore invitato sulla casella di
 * famiglia — non crea l'account del minore, crea il secondo cappello
 * dell'account del genitore, perche `risolviUtenza` trova l'utenza che
 * quell'indirizzo ha gia. Il padre perdeva il figlio dal proprio cruscotto, e
 * ne la revoca ne lo scollegamento glielo restituivano.
 *
 * Qui si misurano le due meta della correzione: la porta che non si apre piu
 * (l'invito rifiutato) e il tutore provato che passa lo stesso.
 */
const proveDueCappelli = async () => {
  console.log("\n— Un'identita, due cappelli (ADR-0124) —");

  const ATLETA_E = randomUUID();
  const CASA_E = "casa-esposito@pp04.invalid";
  const PROPRIA_E = "enrico-esposito@pp04.invalid";
  const UTENTE_CASA = await utente(CASA_E, "Elena");

  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: UTENTE_CASA.id,
      role: "parent",
      is_primary: true,
      updated_at: new Date(),
    },
  });

  await prisma.athlete.create({
    data: {
      id: ATLETA_E,
      organization_id: CLUB,
      first_name: "Enrico",
      last_name: "Esposito",
      status: "active",
      category_id: CAT_A,
      category_name: "Under 12",
      birth_date: new Date("2013-05-05"),
      data: {
        email: PROPRIA_E,
        guardians: [
          {
            id: "g-elena",
            first_name: "Elena",
            last_name: "Esposito",
            /* La casella di famiglia: e il recapito del tutore, e basta. */
            email: CASA_E,
            fiscal_code: "SEGRETO-E-CF-TUTORE",
          },
        ],
      },
      updated_at: new Date(),
    },
  });

  await prisma.athletePayment.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      athlete_id: ATLETA_E,
      description: "SEGRETO-E-QUOTA",
      amount: 210,
      status: "pending",
      due_date: new Date(Date.now() + 864e5),
      updated_at: new Date(),
    },
  });

  const sessioneCasa = await sessionePer(
    await prisma.user.findUnique({ where: { id: UTENTE_CASA.id } }),
  );
  const suE = { params: { athleteId: ATLETA_E } };
  const cruscottoDiElena = async () =>
    leggi(
      await rotte.famiglia.GET(
        richiesta(`/api/parent-dashboard/${ATLETA_E}`, {
          token: sessioneCasa,
          club: CLUB,
          ruolo: "parent",
        }),
        suE,
      ),
    );

  prova(
    "P-80 il tutore vede il figlio prima di qualunque invito: 200",
    200,
    (await cruscottoDiElena()).status,
  );

  /*
    P-81 — **La porta che non si apre piu.** Invitare l'atleta sulla casella
    che e gia il recapito di un tutore di questa scheda manderebbe il link di
    riscatto al tutore e farebbe nascere l'accesso sulla **sua** utenza. Si
    rifiuta, e il rifiuto non e un errore di autorizzazione: non porta
    «Accesso negato», quindi la rotta generica lo mappa su 400.
  */
  await respinta(
    "P-81 l'invito sulla casella di un tutore della stessa scheda e respinto",
    () =>
      dominio.sendAthleteAccountInvite(scopeGestione(), {
        athleteId: ATLETA_E,
        email: CASA_E,
        acknowledgeMinor: true,
      }),
    /recapito di un tutore/i,
  );
  {
    let messaggio = "";
    try {
      await dominio.sendAthleteAccountInvite(scopeGestione(), {
        athleteId: ATLETA_E,
        email: CASA_E,
        acknowledgeMinor: true,
      });
    } catch (errore) {
      messaggio = String(errore?.message || errore);
    }
    prova(
      "P-81b e non e un 403: il messaggio non porta «Accesso negato»",
      false,
      messaggio.includes("Accesso negato"),
      "il ruolo puo compiere l'azione: e l'indirizzo a essere sbagliato",
    );
  }

  /*
    P-82 — **E la guardia non fa troppo.** Un indirizzo dell'atleta, che non e
    il recapito di nessun tutore, passa come prima: il fix e la distinzione,
    non la chiusura.
  */
  const invito = await dominio.sendAthleteAccountInvite(scopeGestione(), {
    athleteId: ATLETA_E,
    email: PROPRIA_E,
    acknowledgeMinor: true,
  });
  prova(
    "P-82 l'invito su una casella dell'atleta passa come prima",
    true,
    Boolean(invito?.email === PROPRIA_E),
  );
  /* E il cambio di indirizzo passa dalla stessa guardia, perche delega. */
  await respinta(
    "P-82b anche il cambio di indirizzo verso la casella del tutore e respinto",
    () =>
      dominio.changeAthleteAccountEmail(scopeGestione(), {
        athleteId: ATLETA_E,
        email: CASA_E,
        acknowledgeMinor: true,
      }),
    /recapito di un tutore/i,
  );

  /*
    P-83…P-86 — **Il legame che resta, e il tutore provato.**

    La guardia di P-81 chiude la strada dal lato dell'accesso atleta. Non
    chiude l'altra: il club puo collegare l'utenza del tutore **dopo** che
    l'accesso dell'atleta esiste gia, e allora la coincidenza c'e lo stesso.
    Da qui in avanti si semina proprio quella sequenza, e si misura che il
    tutore **provato** — `linkedUserId`, non la casella — continua a vedere
    il figlio, prima e dopo i due gesti che tolgono l'accesso.
  */
  /*
    P-82b ha revocato l'invito vivo prima di delegare (`chiudiInvitoVivo`), che
    e cio che deve fare: se ne manda un altro sulla casella dell'atleta.
  */
  await dominio.sendAthleteAccountInvite(scopeGestione(), {
    athleteId: ATLETA_E,
    email: PROPRIA_E,
    acknowledgeMinor: true,
  });

  const gettoneE = randomUUID().replace(/-/g, "").repeat(2);
  await prisma.athleteAccountInvite.updateMany({
    where: { organization_id: CLUB, athlete_id: ATLETA_E, status: "sent" },
    data: {
      token_hash: createHash("sha256").update(gettoneE).digest("hex"),
      user_id: UTENTE_CASA.id,
    },
  });
  await dominio.acceptAthleteAccountInvite(gettoneE);

  const primaDelLegame = await cruscottoDiElena();
  prova(
    "P-83 finche il tutore vale solo per la casella, il ramo diretto vince: 403",
    403,
    primaDelLegame.status,
    "e ADR-0122/0123: la coincidenza di casella non e una decisione",
  );

  const rigaE = await prisma.athlete.findUnique({
    where: { id: ATLETA_E },
    select: { data: true },
  });
  await prisma.athlete.update({
    where: { id: ATLETA_E },
    data: {
      data: {
        ...rigaE.data,
        guardians: [
          {
            ...rigaE.data.guardians[0],
            /* Il club collega l'utenza del tutore: e un atto, ed e registrato. */
            linkedUserId: UTENTE_CASA.id,
          },
        ],
      },
    },
  });

  prova(
    "P-84 il tutore PROVATO rivede il figlio, malgrado i due cappelli: 200",
    200,
    (await cruscottoDiElena()).status,
    "senza ADR-0124 il genitore perdeva il figlio dal proprio cruscotto",
  );
  prova(
    "P-84b e ci trova cio per cui l'area e stata scritta",
    true,
    JSON.stringify((await cruscottoDiElena()).corpo ?? "").includes(
      "SEGRETO-E-QUOTA",
    ),
  );

  await dominio.revokeAthleteAccess(scopeGestione(), { athleteId: ATLETA_E });
  prova(
    "P-85 dopo la REVOCA il tutore provato vede ancora il figlio: 200",
    200,
    (await cruscottoDiElena()).status,
    "il gesto che toglie l'accesso dell'atleta non toglie la famiglia al tutore",
  );

  await prisma.athlete.update({
    where: { id: ATLETA_E },
    data: { user_id: UTENTE_CASA.id },
  });
  await dominio.unlinkAthleteAccount(scopeGestione(), { athleteId: ATLETA_E });
  prova(
    "P-86 e dopo lo SCOLLEGAMENTO: 200",
    200,
    (await cruscottoDiElena()).status,
  );

  /*
    P-87 — **Il controllo che regge il Critical.** La distinzione e tutta
    `linkedUserId`. Tolto quello e lasciata la sola casella, la stessa
    identita — che resta l'account accettato di quella scheda — torna al
    cancello, ed e esattamente l'ex atleta di ADR-0122/0123.
  */
  const rigaE2 = await prisma.athlete.findUnique({
    where: { id: ATLETA_E },
    select: { data: true },
  });
  await prisma.athlete.update({
    where: { id: ATLETA_E },
    data: {
      data: {
        ...rigaE2.data,
        guardians: [{ ...rigaE2.data.guardians[0], linkedUserId: null }],
      },
    },
  });
  const senzaProva = await cruscottoDiElena();
  prova(
    "P-87 senza `linkedUserId` la stessa identita torna fuori: 403",
    403,
    senzaProva.status,
  );
  prova(
    "P-87b e il segreto della famiglia non esce",
    false,
    JSON.stringify(senzaProva.corpo ?? "").includes("SEGRETO-E-QUOTA"),
  );
};

/* ==================================================================== */

const main = async () => {
  console.log("PP-04 — collaudo dell'area atleta contro un database vero\n");
  try {
    await semina();
    await proveInvito();
    await collegaB();
    await seminaAttivita();
    await proveArea();
    await proveAttacco();
    await proveFamiglia();
    await proveRevoca();
    await proveMinore();
    await proveRamoTutore();
    await proveDueCappelli();
  } finally {
    await pulisci();
    await prisma.$disconnect();
  }

  const falliti = esiti.filter((e) => !e.ok);
  console.log(
    `\n${esiti.length - falliti.length} / ${esiti.length} prove superate`,
  );
  if (falliti.length) {
    console.log("\nFallite:");
    falliti.forEach((e) => console.log(`  - ${e.titolo}`));
    process.exitCode = 1;
  }
};

main().catch(async (errore) => {
  console.error(errore);
  await pulisci().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
