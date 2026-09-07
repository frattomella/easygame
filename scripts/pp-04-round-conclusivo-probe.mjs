/**
 * **Round ostile conclusivo di PP-04.** Contro PostgreSQL vero e le rotte vere.
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs <questo file>
 *
 * Guarda dove i quattro round precedenti non hanno guardato: la superficie
 * introdotta da ADR-0122/0123/0124, cioe la meno battuta, piu le classi che il
 * mandato elenca e che la sonda di lane copre solo di lato.
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

const esiti = [];
const prova = (titolo, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ titolo, ok });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(72)} ${JSON.stringify(trovato)}` +
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
      messaggio.slice(0, 200),
    );
  }
};

/* ------------------------------------------------------------- attori -- */

const CLUB = randomUUID();
const CLUB2 = randomUUID();
const CAT_A = "r5-cat-a";
const CAT_B = "r5-cat-b";
const SEDE = "r5-sede";
const X = randomUUID(); // atleta con account proprio
const Y = randomUUID(); // atleta con tutore
const Z = randomUUID(); // fratello di Y
const W = randomUUID(); // atleta dell'altro club

let PRES = null;
let PRES2 = null;
let UX = null;
let GEN = null;
let ESTRANEO = null;
let STAFF = null;
let dominio = null;
let rotte = null;

const scopeGestione = (userId, club = CLUB, ruolo = "owner") => ({
  userId,
  activeOrganizationId: club,
  activeRole: ruolo,
  allowedOrganizationIds: [club],
  accessScopes: [],
  actorEmail: "presidente@pp04r5.invalid",
});

const utente = async (email, nome, verificato = true) => {
  const trovato = await prisma.user.findUnique({ where: { email } });
  if (trovato) return trovato;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      first_name: nome,
      last_name: "R5",
      password_hash: "$2b$10$pp04r5",
      role: "user",
      email_verified_at: verificato ? new Date() : null,
      updated_at: new Date(),
    },
  });
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

const sessionePer = async (riga) => {
  const auth = await carica("src/lib/server/auth.ts");
  return (await auth.createSessionForUser(riga)).access_token;
};

/* I segreti che non devono uscire. Si cercano nel corpo, non nei campi. */
const SEGRETI = [
  "SEGRETO-CLINICO-Y",
  "NOTA-MEDICA-Y",
  "CF-TUTORE-Y",
  "SEGRETO-CLINICO-X",
  "GETTONE-TUTORE-Y",
];
const fughe = (corpo) => {
  const testo = JSON.stringify(corpo ?? null);
  return SEGRETI.filter((s) => testo.includes(s));
};

/* ------------------------------------------------------------- semina -- */

const pulisciResidui = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp04r5-" } },
    select: { id: true },
  });
  const ids = residui.map((r) => r.id);
  if (ids.length) {
    await prisma.auditLog
      .deleteMany({ where: { organization_id: { in: ids } } })
      .catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.user
    .deleteMany({ where: { email: { endsWith: "@pp04r5.invalid" } } })
    .catch(() => {});
};

const clubBase = (id, slug, creator) => ({
  id,
  slug,
  name: `ASD ${slug}`,
  creator_id: creator,
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
  ],
  club_sites: [{ id: SEDE, name: "Sede", active: true }],
  structures: [],
  trainers: [],
  staff_members: [],
  trainings: [],
  matches: [],
  appointments: [],
  updated_at: new Date(),
});

const semina = async () => {
  await pulisciResidui();

  PRES = await utente("presidente@pp04r5.invalid", "Anna");
  PRES2 = await utente("presidente2@pp04r5.invalid", "Aldo");
  UX = await utente("x@pp04r5.invalid", "Ics");
  GEN = await utente("genitore@pp04r5.invalid", "Gina");
  ESTRANEO = await utente("estraneo@pp04r5.invalid", "Enea");
  STAFF = await utente("staff@pp04r5.invalid", "Sara");

  await prisma.club.create({
    data: clubBase(CLUB, `pp04r5-${Date.now()}`, PRES.id),
  });
  await prisma.club.create({
    data: clubBase(CLUB2, `pp04r5-b-${Date.now()}`, PRES2.id),
  });

  await prisma.athlete.create({
    data: {
      id: X,
      organization_id: CLUB,
      first_name: "Ics",
      last_name: "Atleta",
      status: "active",
      category_id: CAT_A,
      category_name: "Under 12",
      birth_date: new Date("2013-01-01"),
      data: {
        email: "x.contatto@pp04r5.invalid",
        allergies: "SEGRETO-CLINICO-X",
        guardians: [
          {
            id: "tut-x",
            first_name: "Papa",
            last_name: "Di Ics",
            /* Nessun legame: solo il recapito. E il vettore di ADR-0122. */
            email: "papa.ics@pp04r5.invalid",
            relationship: "padre",
          },
        ],
      },
      updated_at: new Date(),
    },
  });
  await prisma.athleteCategoryMembership.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      athlete_id: X,
      category_id: CAT_A,
      site_id: SEDE,
      is_primary: true,
      updated_at: new Date(),
    },
  });

  const tutoreY = {
    id: "tut-y",
    first_name: "Gina",
    last_name: "Tutrice",
    email: GEN.email,
    linked_user_id: GEN.id,
    relationship: "madre",
    fiscal_code: "CF-TUTORE-Y",
    /*
      Il nome vero del campo, quello che `redeem/route.ts` scrive e che
      `GUARDIAN_CREDENTIAL_FIELDS` sorveglia: chi lo raccoglie si lega come
      tutore, quindi e una credenziale a tutti gli effetti.
    */
    parentAccessTokenValue: "GETTONE-TUTORE-Y",
  };

  await prisma.athlete.create({
    data: {
      id: Y,
      organization_id: CLUB,
      first_name: "Ipsilon",
      last_name: "Atleta",
      status: "active",
      category_id: CAT_B,
      category_name: "Under 15",
      birth_date: new Date("2012-02-02"),
      data: {
        email: "y.contatto@pp04r5.invalid",
        allergies: "SEGRETO-CLINICO-Y",
        medical_notes: "NOTA-MEDICA-Y",
        guardians: [tutoreY],
      },
      updated_at: new Date(),
    },
  });
  await prisma.athleteCategoryMembership.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      athlete_id: Y,
      category_id: CAT_B,
      site_id: SEDE,
      is_primary: true,
      updated_at: new Date(),
    },
  });

  await prisma.athlete.create({
    data: {
      id: Z,
      organization_id: CLUB,
      first_name: "Zeta",
      last_name: "Atleta",
      status: "active",
      category_id: CAT_B,
      category_name: "Under 15",
      data: { guardians: [tutoreY] },
      updated_at: new Date(),
    },
  });

  await prisma.athlete.create({
    data: {
      id: W,
      organization_id: CLUB2,
      first_name: "Doppia",
      last_name: "Vu",
      status: "active",
      category_id: CAT_A,
      data: { allergies: "SEGRETO-CLINICO-W" },
      updated_at: new Date(),
    },
  });

  for (const [club, user, role] of [
    [CLUB, PRES.id, "owner"],
    [CLUB2, PRES2.id, "owner"],
    [CLUB, GEN.id, "parent"],
    [CLUB, STAFF.id, "club_manager"],
  ]) {
    await prisma.organizationUser.create({
      data: {
        id: randomUUID(),
        organization_id: club,
        user_id: user,
        role,
        is_primary: true,
        updated_at: new Date(),
      },
    });
  }

  dominio = await carica("src/lib/server/athlete-accounts.ts");
  rotte = {
    me: await carica("src/app/api/v1/athlete-accounts/me/route.ts"),
    conto: await carica("src/app/api/v1/athlete-accounts/[athleteId]/route.ts"),
    email: await carica(
      "src/app/api/v1/athlete-accounts/[athleteId]/email/route.ts",
    ),
    accetta: await carica("src/app/api/v1/athlete-accounts/accept/route.ts"),
    bacheca: await carica(
      "src/app/api/parent-dashboard/[athleteId]/board/route.ts",
    ),
    famiglia: await carica("src/app/api/parent-dashboard/[athleteId]/route.ts"),
    notifiche: await carica(
      "src/app/api/parent-dashboard/[athleteId]/notifications/route.ts",
    ),
    consensi: await carica(
      "src/app/api/parent-dashboard/[athleteId]/consents/route.ts",
    ),
    appuntamenti: await carica(
      "src/app/api/parent-dashboard/[athleteId]/appointments/route.ts",
    ),
    docFamiglia: await carica(
      "src/app/api/parent-dashboard/[athleteId]/documents/route.ts",
    ),
    strutture: await carica(
      "src/app/api/parent-dashboard/[athleteId]/structures/route.ts",
    ),
    profilo: await carica(
      "src/app/api/v1/auth/athlete-profile/[athleteId]/route.ts",
    ),
    documenti: await carica(
      "src/app/api/athletes/[athleteId]/documents/route.ts",
    ),
    tessere: await carica("src/app/api/v1/auth/memberships/route.ts"),
  };
};

const pulisci = async () => {
  await prisma.auditLog
    .deleteMany({ where: { organization_id: { in: [CLUB, CLUB2] } } })
    .catch(() => {});
  await prisma.club
    .deleteMany({ where: { id: { in: [CLUB, CLUB2] } } })
    .catch((e) => console.error(`Pulizia non riuscita: ${e?.message}`));
  await prisma.user
    .deleteMany({ where: { email: { endsWith: "@pp04r5.invalid" } } })
    .catch(() => {});
};

const invitaConTokenNoto = async (athleteId, email, tokenChiaro, opz = {}) => {
  const u = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      id: randomUUID(),
      email,
      first_name: "Invitato",
      last_name: "R5",
      password_hash: "$2b$10$pp04r5",
      role: "user",
      email_verified_at: null,
      updated_at: new Date(),
    },
  });
  return prisma.athleteAccountInvite.create({
    data: {
      id: randomUUID(),
      organization_id: opz.club || CLUB,
      athlete_id: athleteId,
      user_id: opz.userId || u.id,
      email,
      token_hash: createHash("sha256").update(tokenChiaro).digest("hex"),
      status: opz.status || "sent",
      expires_at: opz.expiresAt || new Date(Date.now() + 30 * 86400000),
      sent_at: new Date(),
      updated_at: new Date(),
    },
  });
};

/* ==================================================================== */
/*  R-01…  Il rifiuto di ADR-0124, cercato dove non guarda                */
/* ==================================================================== */

const proveRifiutoInvito = async () => {
  console.log("\n— ADR-0124: il rifiuto dell'indirizzo di un tutore —");

  /* R-01: maiuscole e spazi. La segreteria scrive come le pare. */
  await respinta(
    "R-01 l'indirizzo del tutore con maiuscole e spazi resta respinto",
    () =>
      dominio.sendAthleteAccountInvite(scopeGestione(PRES.id), {
        athleteId: X,
        email: "  Papa.Ics@PP04R5.Invalid  ",
        acknowledgeMinor: true,
      }),
    /gia il recapito di un tutore/i,
  );

  /* R-02: il recapito scritto come array — `firstText` lo appiattisce. */
  await prisma.athlete.update({
    where: { id: X },
    data: {
      data: {
        email: "x.contatto@pp04r5.invalid",
        allergies: "SEGRETO-CLINICO-X",
        guardians: [
          {
            id: "tut-x",
            first_name: "Papa",
            email: ["papa.ics@pp04r5.invalid"],
          },
        ],
      },
    },
  });
  await respinta(
    "R-02 il recapito del tutore scritto come array resta respinto",
    () =>
      dominio.sendAthleteAccountInvite(scopeGestione(PRES.id), {
        athleteId: X,
        email: "papa.ics@pp04r5.invalid",
        acknowledgeMinor: true,
      }),
    /gia il recapito di un tutore/i,
  );

  /* R-03: il tutore nei contenitori storici `parent1` / `parent2`. */
  await prisma.athlete.update({
    where: { id: X },
    data: {
      data: {
        email: "x.contatto@pp04r5.invalid",
        allergies: "SEGRETO-CLINICO-X",
        parent1: { name: "Papa", email: "papa.ics@pp04r5.invalid" },
      },
    },
  });
  await respinta(
    "R-03 il tutore nel contenitore storico parent1 resta respinto",
    () =>
      dominio.sendAthleteAccountInvite(scopeGestione(PRES.id), {
        athleteId: X,
        email: "papa.ics@pp04r5.invalid",
        acknowledgeMinor: true,
      }),
    /gia il recapito di un tutore/i,
  );

  /* R-04: legato per id, con un indirizzo diverso da quello dell'utenza. */
  const papa = await utente("papa.ics@pp04r5.invalid", "Papa");
  await prisma.athlete.update({
    where: { id: X },
    data: {
      data: {
        email: "x.contatto@pp04r5.invalid",
        allergies: "SEGRETO-CLINICO-X",
        guardians: [
          {
            id: "tut-x",
            first_name: "Papa",
            /* Il recapito e vecchio: l'utenza ha cambiato indirizzo. */
            email: "vecchio.papa@pp04r5.invalid",
            linked_user_id: papa.id,
          },
        ],
      },
    },
  });
  await respinta(
    "R-04 l'utenza gia legata come tutore resta respinta anche da un altro indirizzo",
    () =>
      dominio.sendAthleteAccountInvite(scopeGestione(PRES.id), {
        athleteId: X,
        email: papa.email,
        acknowledgeMinor: true,
      }),
    /gia collegata come tutore/i,
  );

  /* R-05: e non lascia residui — nessuna utenza nata dal gesto rifiutato. */
  const invitiX = await prisma.athleteAccountInvite.count({
    where: { athlete_id: X },
  });
  prova("R-05 nessun invito e sopravvissuto ai quattro rifiuti", 0, invitiX);

  /* R-06: il cambio di indirizzo per delega, con il rifiuto in mezzo, non
     lascia l'atleta con un invito vivo verso il tutore. */
  await dominio.sendAthleteAccountInvite(scopeGestione(PRES.id), {
    athleteId: X,
    email: "x.proprio@pp04r5.invalid",
    acknowledgeMinor: true,
  });
  await respinta(
    "R-06 il cambio verso la casella del tutore e respinto per delega",
    () =>
      dominio.changeAthleteAccountEmail(scopeGestione(PRES.id), {
        athleteId: X,
        email: papa.email,
        acknowledgeMinor: true,
      }),
    /gia collegata come tutore/i,
  );
  const viviDopo = await prisma.athleteAccountInvite.findMany({
    where: { athlete_id: X },
    select: { status: true, email: true },
  });
  prova(
    "R-06b dopo il rifiuto non resta nessun invito vivo verso il tutore",
    [],
    viviDopo.filter((r) => r.status === "sent" && r.email === papa.email),
  );
};

/* ==================================================================== */
/*  R-10…  Il token: furto, replay, scadenza, riuso, revoca               */
/* ==================================================================== */

const proveToken = async () => {
  console.log("\n— Il token di collegamento —");

  await prisma.athleteAccountInvite.deleteMany({ where: { athlete_id: X } });
  await prisma.athlete.update({ where: { id: X }, data: { user_id: null } });

  /* R-10: il furto non trasferisce la scheda. Il riscatto lega l'utenza
     **invitata**, non chi presenta il token. */
  const TOK = `r5-${randomUUID()}`;
  const invito = await invitaConTokenNoto(X, "x.proprio@pp04r5.invalid", TOK);
  const sessioneLadro = await sessionePer(ESTRANEO);
  const esito = await leggi(
    await rotte.accetta.POST(
      richiesta("/api/v1/athlete-accounts/accept", {
        method: "POST",
        token: sessioneLadro,
        body: { token: TOK },
      }),
    ),
  );
  const dopo = await prisma.athlete.findUnique({
    where: { id: X },
    select: { user_id: true },
  });
  prova("R-10 il riscatto con il token rubato risponde", 200, esito.status);
  prova(
    "R-10b ma la scheda finisce all'utenza invitata, non al ladro",
    true,
    dopo.user_id === invito.user_id && dopo.user_id !== ESTRANEO.id,
  );
  prova(
    "R-10c e la risposta non rimanda indietro il token in chiaro",
    false,
    JSON.stringify(esito.corpo).includes(TOK),
  );
  prova(
    "R-10d ne una credenziale: solo la bandierina del reset",
    [
      "athleteId",
      "athleteName",
      "clubName",
      "email",
      "organizationId",
      "passwordSetupSent",
    ],
    Object.keys(esito.corpo?.data || {}).sort(),
  );

  /* R-11: replay. */
  const replay = await leggi(
    await rotte.accetta.POST(
      richiesta("/api/v1/athlete-accounts/accept", {
        method: "POST",
        body: { token: TOK },
      }),
    ),
  );
  prova("R-11 il replay dello stesso token e respinto", 400, replay.status);

  /* R-12: scaduto. */
  await prisma.athleteAccountInvite.deleteMany({ where: { athlete_id: Z } });
  const TOK_SCADUTO = `r5-${randomUUID()}`;
  await invitaConTokenNoto(Z, "z.scaduto@pp04r5.invalid", TOK_SCADUTO, {
    expiresAt: new Date(Date.now() - 3600_000),
  });
  const scaduto = await leggi(
    await rotte.accetta.POST(
      richiesta("/api/v1/athlete-accounts/accept", {
        method: "POST",
        body: { token: TOK_SCADUTO },
      }),
    ),
  );
  const rigaScaduta = await prisma.athleteAccountInvite.findFirst({
    where: { athlete_id: Z },
    select: { status: true },
  });
  prova("R-12 il token scaduto e respinto", 400, scaduto.status);
  prova("R-12b e la riga si marca scaduta", "expired", rigaScaduta?.status);
  const zDopo = await prisma.athlete.findUnique({
    where: { id: Z },
    select: { user_id: true },
  });
  prova("R-12c e nessun legame e stato scritto", null, zDopo.user_id);

  /* R-13: revocato mentre il token era ancora vivo. */
  await prisma.athleteAccountInvite.deleteMany({ where: { athlete_id: Z } });
  const TOK_REV = `r5-${randomUUID()}`;
  await invitaConTokenNoto(Z, "z.revoca@pp04r5.invalid", TOK_REV);
  await dominio.revokeAthleteAccess(scopeGestione(PRES.id), { athleteId: Z });
  const revocato = await leggi(
    await rotte.accetta.POST(
      richiesta("/api/v1/athlete-accounts/accept", {
        method: "POST",
        body: { token: TOK_REV },
      }),
    ),
  );
  prova(
    "R-13 il token di un invito revocato mentre era vivo e morto",
    400,
    revocato.status,
  );

  /* R-14: il reinvio uccide il token precedente. */
  await prisma.athleteAccountInvite.deleteMany({ where: { athlete_id: Z } });
  const TOK_VECCHIO = `r5-${randomUUID()}`;
  await invitaConTokenNoto(Z, "z.vecchio@pp04r5.invalid", TOK_VECCHIO);
  await dominio.resendAthleteAccountInvite(scopeGestione(PRES.id), {
    athleteId: Z,
  });
  const vecchio = await leggi(
    await rotte.accetta.POST(
      richiesta("/api/v1/athlete-accounts/accept", {
        method: "POST",
        body: { token: TOK_VECCHIO },
      }),
    ),
  );
  prova("R-14 il reinvio uccide il token precedente", 400, vecchio.status);

  /* R-15: il cambio di indirizzo uccide il token mandato al vecchio. */
  await prisma.athleteAccountInvite.deleteMany({ where: { athlete_id: Z } });
  const TOK_SBAGLIATO = `r5-${randomUUID()}`;
  await invitaConTokenNoto(Z, "z.sbagliato@pp04r5.invalid", TOK_SBAGLIATO);
  await dominio.changeAthleteAccountEmail(scopeGestione(PRES.id), {
    athleteId: Z,
    email: "z.giusto@pp04r5.invalid",
    acknowledgeMinor: true,
  });
  const sbagliato = await leggi(
    await rotte.accetta.POST(
      richiesta("/api/v1/athlete-accounts/accept", {
        method: "POST",
        body: { token: TOK_SBAGLIATO },
      }),
    ),
  );
  prova(
    "R-15 il cambio di indirizzo uccide il token della casella sbagliata",
    400,
    sbagliato.status,
  );

  /* R-16: un token vivo non puo rubare una scheda gia collegata a un altro. */
  await prisma.athleteAccountInvite.deleteMany({ where: { athlete_id: Z } });
  const TOK_LADRO = `r5-${randomUUID()}`;
  await invitaConTokenNoto(Z, "z.ladro@pp04r5.invalid", TOK_LADRO);
  await prisma.athlete.update({
    where: { id: Z },
    data: { user_id: ESTRANEO.id },
  });
  const ruba = await leggi(
    await rotte.accetta.POST(
      richiesta("/api/v1/athlete-accounts/accept", {
        method: "POST",
        body: { token: TOK_LADRO },
      }),
    ),
  );
  const zRimasto = await prisma.athlete.findUnique({
    where: { id: Z },
    select: { user_id: true },
  });
  prova("R-16 il token vecchio non ruba una scheda gia collegata", 400, ruba.status);
  prova("R-16b e il legame precedente e intatto", ESTRANEO.id, zRimasto.user_id);
  await prisma.athlete.update({ where: { id: Z }, data: { user_id: null } });
  await prisma.athleteAccountInvite.deleteMany({ where: { athlete_id: Z } });
};

/* ==================================================================== */
/*  R-20…  X contro Y: IDOR su tutte le porte dell'area                   */
/* ==================================================================== */

const proveIdor = async () => {
  console.log("\n— Un atleta contro un altro atleta —");

  const sx = await sessionePer(UX);
  const sg = await sessionePer(GEN);
  const se = await sessionePer(ESTRANEO);

  const chiama = async (nome, ctx, opz = {}) => {
    const mod = rotte[nome];
    const metodo = opz.method || "GET";
    const fn = mod[metodo];
    return leggi(await fn(richiesta(opz.url || "/x", opz), ctx));
  };

  const porte = [
    ["famiglia", "GET", "il cruscotto della famiglia"],
    ["bacheca", "GET", "la bacheca"],
    ["consensi", "GET", "i consensi"],
    ["appuntamenti", "GET", "gli appuntamenti"],
    ["docFamiglia", "GET", "i documenti della famiglia"],
    ["strutture", "POST", "le strutture (scrittura)"],
    ["notifiche", "PATCH", "le notifiche (scrittura)"],
  ];

  for (const [nome, metodo, etichetta] of porte) {
    const r = await chiama(nome, { params: { athleteId: Y } }, {
      method: metodo,
      token: sx,
      body: metodo === "GET" ? undefined : { ids: [] },
    });
    prova(
      `R-20 X su Y — ${etichetta}`.padEnd(60),
      403,
      r.status,
      JSON.stringify(r.corpo).slice(0, 160),
    );
    prova(`R-20b senza fughe — ${etichetta}`, [], fughe(r.corpo));
  }

  /* R-21: il profilo clinico per identificativo. */
  const profY = await chiama("profilo", { params: { athleteId: Y } }, {
    token: sx,
  });
  prova("R-21 X non legge il profilo clinico di Y", 403, profY.status);
  prova("R-21b senza fughe", [], fughe(profY.corpo));

  /* R-22: il fascicolo documentale. */
  const docY = await chiama("documenti", { params: { athleteId: Y } }, {
    token: sx,
    club: CLUB,
  });
  prova("R-22 X non legge il fascicolo di Y", 403, docY.status);

  /* R-23: identificativi forgiati. */
  for (const [etichetta, id] of [
    ["vuoto", ""],
    ["inesistente", randomUUID()],
    ["l'id del club", CLUB],
    ["l'id di un'utenza", GEN.id],
    ["un atleta di un altro club", W],
  ]) {
    const r = await chiama("famiglia", { params: { athleteId: id } }, {
      token: sx,
    });
    prova(
      `R-23 identificativo forgiato (${etichetta}) non apre`,
      true,
      r.status === 403 || r.status === 404,
      `status ${r.status}`,
    );
  }

  /* R-24: l'estraneo, che nel club non e nessuno. */
  const estr = await chiama("famiglia", { params: { athleteId: Y } }, {
    token: se,
  });
  prova("R-24 l'estraneo non apre il cruscotto di Y", 403, estr.status);
  const estrMe = await leggi(
    await rotte.me.GET(richiesta("/api/v1/athlete-accounts/me", { token: se })),
  );
  prova("R-24b ne l'area atleta", 403, estrMe.status);

  /* R-25: sibling leakage — il tutore di Y e Z non vede X. */
  const genX = await chiama("famiglia", { params: { athleteId: X } }, {
    token: sg,
  });
  prova("R-25 il tutore di Y e Z non apre la scheda di X", 403, genX.status);
  prova("R-25b e non ne esce il clinico di X", [], fughe(genX.corpo));

  /* R-26: e apre invece i suoi due figli. */
  for (const [id, nome] of [
    [Y, "Y"],
    [Z, "Z"],
  ]) {
    const r = await chiama("famiglia", { params: { athleteId: id } }, {
      token: sg,
    });
    prova(`R-26 il tutore apre ${nome}`, 200, r.status);
  }

  /* R-27: il gettone del tutore non esce dal cruscotto della famiglia. */
  const cruscotto = await chiama("famiglia", { params: { athleteId: Y } }, {
    token: sg,
  });
  prova(
    "R-27 il gettone di collegamento del tutore non esce dal cruscotto",
    false,
    JSON.stringify(cruscotto.corpo).includes("GETTONE-TUTORE-Y"),
  );

  /* R-28: ne dal profilo clinico letto dal tutore stesso. */
  const profTutore = await chiama("profilo", { params: { athleteId: Y } }, {
    token: sg,
  });
  prova(
    "R-28 ne dal profilo clinico",
    false,
    JSON.stringify(profTutore.corpo).includes("GETTONE-TUTORE-Y"),
  );
};

/* ==================================================================== */
/*  R-30…  L'area atleta: cosa vede X di se stesso, e cosa no             */
/* ==================================================================== */

const proveAreaAtleta = async () => {
  console.log("\n— L'area dell'atleta —");

  await prisma.athlete.update({ where: { id: X }, data: { user_id: UX.id } });
  await prisma.organizationUser.upsert({
    where: {
      organization_id_user_id_role: {
        organization_id: CLUB,
        user_id: UX.id,
        role: "athlete",
      },
    },
    update: {},
    create: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: UX.id,
      role: "athlete",
      is_primary: true,
      updated_at: new Date(),
    },
  }).catch(async () => {
    await prisma.organizationUser.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        user_id: UX.id,
        role: "athlete",
        is_primary: true,
        updated_at: new Date(),
      },
    });
  });

  const sx = await sessionePer(UX);
  const mia = await leggi(
    await rotte.me.GET(richiesta("/api/v1/athlete-accounts/me", { token: sx })),
  );
  prova("R-30 X apre la propria area", 200, mia.status);
  prova(
    "R-30b e nella proiezione non c'e nessun gettone di tutore",
    false,
    /accessToken|access_token|token_hash/i.test(JSON.stringify(mia.corpo)),
  );
  prova("R-30c ne segreti di Y", [], fughe(mia.corpo).filter((s) => s.includes("-Y")));

  /* R-31: la scrittura dei recapiti e un elenco chiuso. */
  await leggi(
    await rotte.me.PATCH(
      richiesta("/api/v1/athlete-accounts/me", {
        method: "PATCH",
        token: sx,
        body: {
          phone: "3331112222",
          /* Il tentativo: farsi tutore provato di se stessi. */
          guardians: [{ id: "auto", linked_user_id: UX.id }],
          status: "inactive",
          category_id: CAT_B,
          allergies: "RISCRITTO",
        },
      }),
    ),
  );
  const xDopo = await prisma.athlete.findUnique({
    where: { id: X },
    select: { data: true, status: true, category_id: true },
  });
  const dati = xDopo.data || {};
  prova("R-31 il recapito consentito e stato scritto", "3331112222", dati.phone);
  prova(
    "R-31b ma X non si e scritto fra i tutori di se stesso",
    true,
    !Array.isArray(dati.guardians) ||
      !dati.guardians.some(
        (g) => String(g?.linked_user_id || g?.linkedUserId || "") === UX.id,
      ),
  );
  prova("R-31c ne ha cambiato lo stato", "active", xDopo.status);
  prova("R-31d ne la categoria", CAT_A, xDopo.category_id);
  prova("R-31e ne il dato clinico", "SEGRETO-CLINICO-X", dati.allergies);

  /* R-32: la bacheca dell'atleta e la sua, non quella di un altro. */
  const bacY = await leggi(
    await rotte.bacheca.GET(
      richiesta("/x", { token: sx }),
      { params: { athleteId: Y } },
    ),
  );
  prova("R-32 la bacheca di Y resta chiusa a X", 403, bacY.status);
};

/* ==================================================================== */
/*  R-40…  La consegna di un annuncio: IDOR sulla scrittura «letto»       */
/* ==================================================================== */

const proveConsegne = async () => {
  console.log("\n— La bacheca, e la consegna di un altro —");

  const consegna = await prisma.communicationDelivery.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      source_kind: "board",
      source_id: randomUUID(),
      dedup_key: `r5-${randomUUID()}`,
      recipient_key: `user:${GEN.id}`,
      recipient_user_id: GEN.id,
      recipient_email: GEN.email,
      athlete_ids: [Y],
      channel: "board",
      status: "sent",
      subject: "Avviso per la famiglia di Y",
      created_at: new Date(),
      updated_at: new Date(),
    },
  });

  const sx = await sessionePer(UX);
  const r = await leggi(
    await rotte.bacheca.POST(
      richiesta("/x", { method: "POST", token: sx, body: { deliveryId: consegna.id } }),
      { params: { athleteId: X } },
    ),
  );
  const rimasta = await prisma.communicationDelivery.findUnique({
    where: { id: consegna.id },
    select: { read_at: true },
  });
  prova(
    "R-40 X non segna letta la consegna indirizzata al tutore di Y",
    true,
    rimasta?.read_at == null,
    `status ${r.status} ${JSON.stringify(r.corpo).slice(0, 140)}`,
  );

  const lette = await leggi(
    await rotte.bacheca.GET(richiesta("/x", { token: sx }), {
      params: { athleteId: X },
    }),
  );
  prova(
    "R-40b e non legge l'annuncio consegnato alla famiglia di Y",
    false,
    JSON.stringify(lette.corpo).includes("Avviso per la famiglia di Y"),
  );

  /*
    **Il controllo positivo.** Senza, «nessuno l'ha segnata letta» si
    spiegherebbe anche con una consegna seminata male, e la prova non
    proverebbe niente.
  */
  const sg = await sessionePer(GEN);
  const suo = await leggi(
    await rotte.bacheca.POST(
      richiesta("/x", {
        method: "POST",
        token: sg,
        body: { deliveryId: consegna.id },
      }),
      { params: { athleteId: Y } },
    ),
  );
  const letta = await prisma.communicationDelivery.findUnique({
    where: { id: consegna.id },
    select: { read_at: true },
  });
  prova(
    "R-40c il destinatario vero invece la segna letta",
    true,
    suo.status === 200 && letta?.read_at != null,
    JSON.stringify(suo.corpo).slice(0, 140),
  );
};

/* ==================================================================== */
/*  R-50…  Il perimetro sulle rotte dell'accesso, e i ruoli               */
/* ==================================================================== */

const provePerimetroERuoli = async () => {
  console.log("\n— Perimetro di categoria e ruoli sull'accesso —");

  const tessera = await prisma.organizationUser.findFirst({
    where: { organization_id: CLUB, user_id: STAFF.id },
    select: { id: true },
  });
  await prisma.clubAccessScope.deleteMany({
    where: { organization_user_id: tessera.id },
  });
  await prisma.clubAccessScope.create({
    data: {
      id: randomUUID(),
      organization_user_id: tessera.id,
      scope_kind: "category",
      scope_value: CAT_A,
    },
  });

  const ss = await sessionePer(STAFF);

  /* R-50: la gestione recintata su CAT_A non legge lo stato di Y (CAT_B). */
  const statoY = await leggi(
    await rotte.conto.GET(
      richiesta("/x", { token: ss, club: CLUB, ruolo: "club_manager" }),
      { params: { athleteId: Y } },
    ),
  );
  prova("R-50 lo stato dell'accesso di Y e fuori perimetro", 403, statoY.status);

  /* R-51: e non lo puo invitare. */
  const invitaY = await leggi(
    await rotte.conto.POST(
      richiesta("/x", {
        method: "POST",
        token: ss,
        club: CLUB,
        ruolo: "club_manager",
        body: { email: "fuori@pp04r5.invalid", acknowledgeMinor: true },
      }),
      { params: { athleteId: Y } },
    ),
  );
  prova("R-51 ne lo puo invitare", 403, invitaY.status);

  /* R-52: ne revocare. */
  const revocaY = await leggi(
    await rotte.conto.DELETE(
      richiesta("/x", {
        method: "DELETE",
        token: ss,
        club: CLUB,
        ruolo: "club_manager",
      }),
      { params: { athleteId: Y } },
    ),
  );
  prova("R-52 ne revocare", 403, revocaY.status);

  /* R-53: dentro il perimetro invece legge. */
  const statoX = await leggi(
    await rotte.conto.GET(
      richiesta("/x", { token: ss, club: CLUB, ruolo: "club_manager" }),
      { params: { athleteId: X } },
    ),
  );
  prova("R-53 dentro il perimetro lo stato si legge", 200, statoX.status);

  /* R-54: il club dichiarato dal client non e il club a cui si appartiene. */
  const altroClub = await leggi(
    await rotte.conto.GET(
      richiesta("/x", { token: ss, club: CLUB2, ruolo: "owner" }),
      { params: { athleteId: W } },
    ),
  );
  prova(
    "R-54 dichiarare un club altrui non apre l'atleta di quel club",
    403,
    altroClub.status,
  );

  /* R-55: l'atleta non puo gestire l'accesso di se stesso. */
  const sx = await sessionePer(UX);
  const autoRevoca = await leggi(
    await rotte.conto.DELETE(
      richiesta("/x", { method: "DELETE", token: sx, club: CLUB, ruolo: "athlete" }),
      { params: { athleteId: X } },
    ),
  );
  prova("R-55 l'atleta non revoca (ne gestisce) il proprio accesso", 403, autoRevoca.status);

  /* R-56: ne il tutore quello del figlio. */
  const sg = await sessionePer(GEN);
  const tutoreInvita = await leggi(
    await rotte.conto.POST(
      richiesta("/x", {
        method: "POST",
        token: sg,
        club: CLUB,
        ruolo: "parent",
        body: { email: "gina2@pp04r5.invalid", acknowledgeMinor: true },
      }),
      { params: { athleteId: Y } },
    ),
  );
  prova("R-56 ne il tutore invita per conto del figlio", 403, tutoreInvita.status);

  await prisma.clubAccessScope.deleteMany({
    where: { organization_user_id: tessera.id },
  });
};

/* ==================================================================== */
/*  R-60…  La revoca vale subito, e sull'identita                         */
/* ==================================================================== */

const proveRevoca = async () => {
  console.log("\n— La revoca: subito, e sull'identita —");

  const sx = await sessionePer(UX);
  const prima = await leggi(
    await rotte.me.GET(richiesta("/api/v1/athlete-accounts/me", { token: sx })),
  );
  prova("R-60 prima della revoca l'area e aperta", 200, prima.status);

  await dominio.revokeAthleteAccess(scopeGestione(PRES.id), { athleteId: X });

  /* La **stessa** sessione, non una nuova: la revoca non aspetta il logout. */
  const dopo = await leggi(
    await rotte.me.GET(richiesta("/api/v1/athlete-accounts/me", { token: sx })),
  );
  prova("R-60b la stessa sessione, subito dopo, e chiusa", 403, dopo.status);

  const cruscotto = await leggi(
    await rotte.famiglia.GET(richiesta("/x", { token: sx }), {
      params: { athleteId: X },
    }),
  );
  prova("R-60c e il cruscotto non riapre dall'altro lato", 403, cruscotto.status);
  prova("R-60d senza fughe", [], fughe(cruscotto.corpo));

  const profilo = await leggi(
    await rotte.profilo.GET(richiesta("/x", { token: sx }), {
      params: { athleteId: X },
    }),
  );
  prova(
    "R-60e ne il profilo clinico per identificativo",
    403,
    profilo.status,
    JSON.stringify(profilo.corpo).slice(0, 160),
  );

  const bacheca = await leggi(
    await rotte.bacheca.GET(richiesta("/x", { token: sx }), {
      params: { athleteId: X },
    }),
  );
  prova("R-60f ne la bacheca", 403, bacheca.status);

  const tessere = await leggi(
    await rotte.tessere.GET(
      richiesta("/api/v1/auth/memberships", { token: sx }),
    ),
  );
  prova(
    "R-60g e nessuna tessera dichiara ancora un legame con la scheda",
    false,
    JSON.stringify(tessere.corpo).includes(X),
  );
};

/* ==================================================================== */
/*  R-70…  I due cappelli, presi dal verso che ADR-0124 non chiude        */
/* ==================================================================== */

/**
 * ADR-0124 impedisce di **creare** la coincidenza dall'invito. Ammette pero,
 * nel proprio corpo, che il club puo legare l'utenza del tutore **dopo** che
 * l'accesso esiste — e che negli archivi la coincidenza e gia nata. Questo
 * blocco misura cosa succede in quello stato, che e l'unico rimasto aperto.
 */
const proveDueCappelli = async () => {
  console.log("\n— I due cappelli, dopo che l'accesso esiste —");

  /* Si riparte da capo su X: accesso attivo, tessera atleta. */
  await prisma.athleteAccountInvite.deleteMany({ where: { athlete_id: X } });
  await prisma.athlete.update({
    where: { id: X },
    data: {
      user_id: UX.id,
      data: {
        email: "x.contatto@pp04r5.invalid",
        allergies: "SEGRETO-CLINICO-X",
        guardians: [
          {
            id: "tut-x",
            first_name: "Papa",
            /* Solo il recapito, e per giunta **coincidente** con l'atleta. */
            email: UX.email,
          },
        ],
      },
    },
  });
  await prisma.organizationUser.deleteMany({
    where: { organization_id: CLUB, user_id: UX.id },
  });
  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: UX.id,
      role: "athlete",
      is_primary: true,
      updated_at: new Date(),
    },
  });

  const sx = await sessionePer(UX);

  /* R-70: la coincidenza nata DOPO l'invito non riapre il ramo del tutore. */
  const cruscotto = await leggi(
    await rotte.famiglia.GET(richiesta("/x", { token: sx }), {
      params: { athleteId: X },
    }),
  );
  prova(
    "R-70 la casella coincidente scritta DOPO non apre il cruscotto",
    403,
    cruscotto.status,
  );

  /* R-71: e l'area atleta invece resta aperta. */
  const area = await leggi(
    await rotte.me.GET(richiesta("/api/v1/athlete-accounts/me", { token: sx })),
  );
  prova("R-71 e l'area atleta resta aperta", 200, area.status);

  /* R-72: con `linkedUserId` — cioe una decisione registrata — il ramo del
     tutore si riapre. E il ripristino di ADR-0124, misurato dal verso in cui
     lo stato nasce dopo l'accesso. */
  await prisma.athlete.update({
    where: { id: X },
    data: {
      data: {
        email: "x.contatto@pp04r5.invalid",
        allergies: "SEGRETO-CLINICO-X",
        guardians: [
          { id: "tut-x", first_name: "Papa", email: UX.email, linked_user_id: UX.id },
        ],
      },
    },
  });
  const conLegame = await leggi(
    await rotte.famiglia.GET(richiesta("/x", { token: sx }), {
      params: { athleteId: X },
    }),
  );
  prova(
    "R-72 con il legame provato il cruscotto si apre (ADR-0124)",
    200,
    conLegame.status,
  );

  /* R-73: **e la revoca deve valere lo stesso.** Il ramo del tutore
     cortocircuita `ancoraAtleta`: se dopo una revoca completa la porta
     restasse aperta, la revoca varrebbe su una porta e non sull'altra. */
  await dominio.revokeAthleteAccess(scopeGestione(PRES.id), { athleteId: X });
  const tessereRimaste = await prisma.organizationUser.findMany({
    where: { organization_id: CLUB, user_id: UX.id },
    select: { role: true },
  });
  prova("R-73 dopo la revoca non resta nessuna tessera", [], tessereRimaste);

  const dopoRevoca = await leggi(
    await rotte.famiglia.GET(richiesta("/x", { token: sx }), {
      params: { athleteId: X },
    }),
  );
  prova(
    "R-73b e il cruscotto si chiude anche dal ramo del tutore",
    403,
    dopoRevoca.status,
  );
  prova("R-73c senza fughe", [], fughe(dopoRevoca.corpo));

  const areaDopo = await leggi(
    await rotte.me.GET(richiesta("/api/v1/athlete-accounts/me", { token: sx })),
  );
  prova("R-73d e l'area atleta con lei", 403, areaDopo.status);

  /* R-74: e nemmeno la scrittura dei recapiti sopravvive alla revoca. */
  const scrittura = await leggi(
    await rotte.me.PATCH(
      richiesta("/api/v1/athlete-accounts/me", {
        method: "PATCH",
        token: sx,
        body: { phone: "3339999999" },
      }),
    ),
  );
  const xOra = await prisma.athlete.findUnique({
    where: { id: X },
    select: { data: true },
  });
  prova("R-74 la scrittura dei recapiti e chiusa dopo la revoca", 403, scrittura.status);
  prova(
    "R-74b e il numero non e cambiato",
    true,
    (xOra.data || {}).phone !== "3339999999",
  );
};

/* ==================================================================== */
/*  R-80…  Il legame che sopravvive allo sweep (PP04-D9), dal lato letto  */
/* ==================================================================== */

/**
 * PP04-D9 dice che `unlinkDirectAthleteProfile` riconosce lo **slug**: una
 * tessera con l'alias `giocatrice` revocata da Gestione Accessi lascia
 * `athletes.user_id` in piedi. Il debito registra la conseguenza sul pannello
 * («mente», vicolo cieco). Qui si misura la conseguenza sulle **letture**: chi
 * non e piu nel club, cosa continua a leggere?
 */
const proveLegameSuperstite = async () => {
  console.log("\n— Il legame che sopravvive alla revoca di tessera —");

  const clubRoles = await carica("src/lib/server/club-roles.ts");

  /*
    Si riparte da uno stato **pulito**: nessun tutore sulla scheda, cosi che
    cio che si misura sia il solo legame superstite e non la coincidenza del
    blocco precedente.
  */
  await prisma.athlete.update({
    where: { id: X },
    data: {
      user_id: UX.id,
      data: {
        email: "x.contatto@pp04r5.invalid",
        allergies: "SEGRETO-CLINICO-X",
      },
    },
  });
  await prisma.organizationUser.deleteMany({
    where: { organization_id: CLUB, user_id: UX.id },
  });
  const tessera = await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: UX.id,
      /* Alias legittimo di `athlete` secondo `ROLE_ALIASES`. */
      role: "giocatrice",
      is_primary: true,
      updated_at: new Date(),
    },
  });

  /* Il gesto vero della segreteria: Gestione Accessi -> Revoca. */
  await clubRoles.revokeClubAccess(scopeGestione(PRES.id), tessera.id);

  const superstite = await prisma.athlete.findUnique({
    where: { id: X },
    select: { user_id: true },
  });
  const tessereOra = await prisma.organizationUser.count({
    where: { organization_id: CLUB, user_id: UX.id },
  });
  console.log(
    `  stato: tessere residue ${tessereOra}, athletes.user_id ${superstite.user_id ? "ancora scritto" : "azzerato"}`,
  );

  const sx = await sessionePer(UX);

  /* R-80: l'area atleta e chiusa comunque — e la chiusura a valle di ADR-0117. */
  const area = await leggi(
    await rotte.me.GET(richiesta("/api/v1/athlete-accounts/me", { token: sx })),
  );
  prova("R-80 l'area atleta e chiusa anche con il legame superstite", 403, area.status);

  /* R-81: e il cruscotto della famiglia con lei. */
  const cruscotto = await leggi(
    await rotte.famiglia.GET(richiesta("/x", { token: sx }), {
      params: { athleteId: X },
    }),
  );
  prova("R-81 e il cruscotto della famiglia", 403, cruscotto.status);

  /* R-82: **la porta che nessuno ha guardato.** `athlete-profile` decide
     `directAthleteAccess` sul solo `athletes.user_id`, senza chiedersi se la
     persona sia ancora nel club: e la domanda che ADR-0117 ha imposto agli
     altri due lettori. */
  const profilo = await leggi(
    await rotte.profilo.GET(richiesta("/x", { token: sx }), {
      params: { athleteId: X },
    }),
  );
  prova(
    "R-82 ne il fascicolo clinico per identificativo",
    403,
    profilo.status,
    JSON.stringify(profilo.corpo).slice(0, 200),
  );
  prova("R-82b senza fughe cliniche", [], fughe(profilo.corpo));

  /* R-83: ne la scrittura dei recapiti. */
  const scrittura = await leggi(
    await rotte.me.PATCH(
      richiesta("/api/v1/athlete-accounts/me", {
        method: "PATCH",
        token: sx,
        body: { phone: "3337777777" },
      }),
    ),
  );
  prova("R-83 ne la scrittura dei propri recapiti", 403, scrittura.status);

  /*
    **E il campo non porta sempre l'atleta.** PP04-D6: `athletes.user_id` ha
    avuto per anni una seconda lettura — «l'utenza a cui questa scheda
    appartiene» — e ADR-0124 descrive il flusso, normale, in cui ci finisce
    l'identita di un **genitore**. Se il lettore si fida del solo campo, cio
    che esce non e piu il fascicolo di chi lo legge: e quello di un altro.
  */
  await prisma.athlete.update({
    where: { id: Y },
    data: { user_id: ESTRANEO.id },
  });
  const se = await sessionePer(ESTRANEO);
  const altrui = await leggi(
    await rotte.profilo.GET(richiesta("/x", { token: se }), {
      params: { athleteId: Y },
    }),
  );
  prova(
    "R-84 un legame ereditato non apre il fascicolo di un'altra persona",
    403,
    altrui.status,
  );
  prova("R-84b senza fughe cliniche di Y", [], fughe(altrui.corpo));
  await prisma.athlete.update({ where: { id: Y }, data: { user_id: null } });

  /*
    Il controllo positivo: chi e ancora l'atleta di quel club **deve** leggere
    il proprio fascicolo, con il contenuto clinico. Senza questa riga il fix
    potrebbe essere «negare sempre», che non e un fix.
  */
  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: UX.id,
      role: "athlete",
      is_primary: true,
      updated_at: new Date(),
    },
  });
  const proprio = await leggi(
    await rotte.profilo.GET(richiesta("/x", { token: sx }), {
      params: { athleteId: X },
    }),
  );
  prova("R-85 l'atleta in carica legge il proprio fascicolo", 200, proprio.status);
  prova(
    "R-85b con il contenuto clinico, che per legame non si taglia",
    true,
    JSON.stringify(proprio.corpo).includes("SEGRETO-CLINICO-X"),
  );
};

/* ==================================================================== */
/*  R-90…  Convocazioni, consensi, denaro: le porte laterali              */
/* ==================================================================== */

const provePorteLaterali = async () => {
  console.log("\n— Convocazioni, consensi, denaro —");

  /* Si rimette X in piedi con un accesso pulito. */
  await prisma.athlete.update({ where: { id: X }, data: { user_id: UX.id } });
  await prisma.organizationUser.deleteMany({
    where: { organization_id: CLUB, user_id: UX.id },
  });
  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: UX.id,
      role: "athlete",
      is_primary: true,
      updated_at: new Date(),
    },
  });
  await prisma.athlete.update({
    where: { id: X },
    data: {
      data: {
        email: "x.contatto@pp04r5.invalid",
        allergies: "SEGRETO-CLINICO-X",
      },
    },
  });

  const sx = await sessionePer(UX);
  const rsvp = await carica("src/app/api/v1/rsvp/route.ts");
  const checkout = await carica(
    "src/app/api/parent-dashboard/[athleteId]/checkout/route.ts",
  );

  /* R-90: X risponde alla convocazione di Y. */
  const rispostaAltrui = await leggi(
    await rsvp.POST(
      richiesta("/api/v1/rsvp", {
        method: "POST",
        token: sx,
        club: CLUB,
        body: {
          organization_id: CLUB,
          athlete_id: Y,
          training_id: randomUUID(),
          status: "yes",
        },
      }),
    ),
  );
  prova(
    "R-90 X non risponde alla convocazione di Y",
    true,
    rispostaAltrui.status === 403 || rispostaAltrui.status === 404,
    `status ${rispostaAltrui.status} ${JSON.stringify(rispostaAltrui.corpo).slice(0, 140)}`,
  );

  /* R-91: il ruolo dichiarato nell'intestazione non e un ruolo. */
  const fintoOwner = await leggi(
    await rotte.conto.GET(
      richiesta("/x", { token: sx, club: CLUB, ruolo: "owner" }),
      { params: { athleteId: Y } },
    ),
  );
  prova(
    "R-91 dichiararsi owner nell'intestazione non apre l'accesso di Y",
    403,
    fintoOwner.status,
  );

  /* R-92: e nemmeno il proprio. */
  const fintoOwnerSuDiSe = await leggi(
    await rotte.conto.GET(
      richiesta("/x", { token: sx, club: CLUB, ruolo: "owner" }),
      { params: { athleteId: X } },
    ),
  );
  prova("R-92 ne il proprio", 403, fintoOwnerSuDiSe.status);

  /* R-93: il denaro. L'area atleta non ha un checkout, e ADR-0118 dice
     perche: da li uscirebbero quote e tutori a un soggetto tipicamente
     minorenne. La porta deve restare chiusa al legame diretto. */
  const paga = await leggi(
    await checkout.POST(
      richiesta("/x", {
        method: "POST",
        token: sx,
        body: { installmentId: randomUUID() },
      }),
      { params: { athleteId: X } },
    ),
  );
  prova(
    "R-93 il checkout resta chiuso al legame diretto",
    403,
    paga.status,
    JSON.stringify(paga.corpo).slice(0, 140),
  );

  /* R-94: i consensi si firmano da chi ha la responsabilita, non dal minore. */
  const consenso = await leggi(
    await rotte.consensi.POST(
      richiesta("/x", {
        method: "POST",
        token: sx,
        body: { consentId: "privacy", granted: true },
      }),
      { params: { athleteId: X } },
    ),
  );
  prova(
    "R-94 il minore non firma i propri consensi",
    403,
    consenso.status,
    JSON.stringify(consenso.corpo).slice(0, 140),
  );

  /* R-95: e il fratello resta fuori dal cruscotto scelto. */
  await prisma.athlete.update({
    where: { id: Z },
    data: {
      data: {
        guardians: [{ id: "tut-y", email: GEN.email, linked_user_id: GEN.id }],
        allergies: "SEGRETO-CLINICO-Z",
      },
    },
  });
  const sg = await sessionePer(GEN);
  const suY = await leggi(
    await rotte.famiglia.GET(richiesta("/x", { token: sg }), {
      params: { athleteId: Y },
    }),
  );
  prova(
    "R-95 il cruscotto di Y non porta il clinico del fratello Z",
    false,
    JSON.stringify(suY.corpo).includes("SEGRETO-CLINICO-Z"),
  );
};

/* ==================================================================== */
/*  R-96…  Due schede, una sola utenza                                    */
/* ==================================================================== */

/**
 * `sendAthleteAccountInvite` dichiara di chiudere questa porta: «l'indirizzo
 * non puo essere quello di un altro atleta gia collegato… altrimenti
 * `findDirectAthleteIdForUser` aprirebbe all'uno la scheda dell'altro».
 *
 * La guardia guarda pero `athletes.user_id`, che **il riscatto scrive**. Fra i
 * due inviti quel campo e ancora vuoto, e la casella di famiglia unica per due
 * fratelli e la sequenza piu normale che una segreteria possa fare.
 */
const proveDueSchedeUnaUtenza = async () => {
  console.log("\n— Due schede, una sola utenza —");

  await prisma.athleteAccountInvite.deleteMany({
    where: { athlete_id: { in: [X, Z] } },
  });
  await prisma.athlete.updateMany({
    where: { id: { in: [X, Z] } },
    data: { user_id: null },
  });
  await prisma.organizationUser.deleteMany({
    where: { organization_id: CLUB, user_id: UX.id },
  });

  const CASELLA = "famiglia.unica@pp04r5.invalid";
  const TOK_X = `r5-${randomUUID()}`;
  const TOK_Z = `r5-${randomUUID()}`;

  /* I due inviti nascono **prima** di qualunque riscatto. */
  await dominio.sendAthleteAccountInvite(scopeGestione(PRES.id), {
    athleteId: X,
    email: CASELLA,
    acknowledgeMinor: true,
  });
  const secondo = await dominio
    .sendAthleteAccountInvite(scopeGestione(PRES.id), {
      athleteId: Z,
      email: CASELLA,
      acknowledgeMinor: true,
    })
    .then(() => "riuscito")
    .catch((e) => String(e?.message || e));

  console.log(`  nota: il secondo invito -> ${secondo.slice(0, 90)}`);

  /* Si riscattano entrambi, nell'ordine in cui arriverebbero le due mail. */
  const invitoX = await prisma.athleteAccountInvite.findFirst({
    where: { athlete_id: X, status: "sent" },
  });
  const invitoZ = await prisma.athleteAccountInvite.findFirst({
    where: { athlete_id: Z, status: "sent" },
  });

  for (const [invito, token] of [
    [invitoX, TOK_X],
    [invitoZ, TOK_Z],
  ]) {
    if (!invito) continue;
    await prisma.athleteAccountInvite.update({
      where: { id: invito.id },
      data: { token_hash: createHash("sha256").update(token).digest("hex") },
    });
    await leggi(
      await rotte.accetta.POST(
        richiesta("/api/v1/athlete-accounts/accept", {
          method: "POST",
          body: { token },
        }),
      ),
    );
  }

  const schede = await prisma.athlete.findMany({
    where: { organization_id: CLUB, user_id: { not: null } },
    select: { id: true, user_id: true },
  });
  const perUtenza = new Map();
  for (const scheda of schede) {
    perUtenza.set(scheda.user_id, (perUtenza.get(scheda.user_id) || 0) + 1);
  }
  const massimo = Math.max(0, ...perUtenza.values());

  prova(
    "R-96 nessuna utenza finisce a essere l'account di due schede",
    true,
    massimo <= 1,
    `schede collegate: ${JSON.stringify(schede)}`,
  );

  /*
    E la porta che il ramo diretto **apre davvero** e la bacheca: e la sola
    rotta del cruscotto che dichiara `allowSelfAthleteLink: true`, quindi e li
    che «essere quella scheda» diventa una lettura. Con due schede sulla stessa
    utenza, quell'unica identita le apriva entrambe.
  */
  const utenza = await prisma.user.findUnique({ where: { email: CASELLA } });
  if (utenza) {
    const su = await sessionePer(utenza);
    const bacheche = [];
    for (const id of [X, Z]) {
      const r = await leggi(
        await rotte.bacheca.GET(richiesta("/x", { token: su }), {
          params: { athleteId: id },
        }),
      );
      bacheche.push(r.status);
    }
    prova(
      "R-96b e quella casella apre la bacheca di una scheda sola",
      1,
      bacheche.filter((s) => s === 200).length,
      `X ${bacheche[0]} · Z ${bacheche[1]}`,
    );
  }

  /*
    R-96c: e il rifiuto arriva **quando c'e ancora una persona a cui dirlo**.
    Chiuderlo solo al riscatto lascerebbe la segreteria a leggere «Accesso
    inviato» e il secondo ragazzo con un link che non funzionera mai.
  */
  prova(
    "R-96c il secondo invito sulla stessa casella e respinto alla partenza",
    true,
    /gia un invito in corso sulla scheda di un altro atleta/i.test(secondo),
    secondo.slice(0, 160),
  );
};

/* ==================================================================== */
/*  R-97…  Lo scollegamento, e la scheda ceduta a un altro                */
/* ==================================================================== */

/**
 * **`eLaPersonaStessa` fa due lavori opposti con una condizione sola.**
 *
 * ADR-0123 l'ha resa **durevole** — l'invito accettato, che ne la revoca ne
 * lo scollegamento cancellano — perche serviva come **esclusione** dal ramo
 * del tutore: senza durata, il gesto che toglieva l'accesso lo riapriva piu
 * largo di prima.
 *
 * Ma la stessa condizione e anche l'**ammissione** alle superfici proprie
 * dell'atleta, e quelle vogliono il legame **vivo**: la bacheca e l'RSVP
 * passano da `allowSelfAthleteLink: true`, e li «essere stato» non e «essere».
 *
 * Lo scollegamento azzera `athletes.user_id` e **lascia la tessera** — e la
 * sua ragione d'essere, distinta dalla revoca. Dopo di lui l'invito accettato
 * resta e la tessera resta: il ramo diretto continua a dire di si.
 */
const proveScollegamento = async () => {
  console.log("\n— Lo scollegamento, la bacheca, e la scheda ceduta —");

  /* Stato pulito: X invitata e riscattata davvero, con la tessera che nasce. */
  await prisma.athleteAccountInvite.deleteMany({ where: { athlete_id: X } });
  await prisma.athlete.update({
    where: { id: X },
    data: {
      user_id: null,
      data: { email: "x.contatto@pp04r5.invalid", allergies: "SEGRETO-CLINICO-X" },
    },
  });
  await prisma.organizationUser.deleteMany({
    where: { organization_id: CLUB, user_id: UX.id },
  });

  const TOK = `r5-${randomUUID()}`;
  await invitaConTokenNoto(X, UX.email, TOK, { userId: UX.id });
  await leggi(
    await rotte.accetta.POST(
      richiesta("/api/v1/athlete-accounts/accept", {
        method: "POST",
        body: { token: TOK },
      }),
    ),
  );

  const sx = await sessionePer(UX);
  const bacheca = async (id, token) =>
    (
      await leggi(
        await rotte.bacheca.GET(richiesta("/x", { token }), {
          params: { athleteId: id },
        }),
      )
    ).status;
  const area = async (token) =>
    (
      await leggi(
        await rotte.me.GET(
          richiesta("/api/v1/athlete-accounts/me", { token }),
        ),
      )
    ).status;

  prova("R-97 in regola: l'area atleta si apre", 200, await area(sx));
  prova("R-97b e la bacheca con lei", 200, await bacheca(X, sx));

  /* Lo scollegamento: l'area si chiude. La bacheca? */
  await dominio.unlinkAthleteAccount(scopeGestione(PRES.id), { athleteId: X });
  prova("R-98 dopo lo scollegamento l'area atleta si chiude", 403, await area(sx));
  prova(
    "R-98b e la bacheca si chiude con lei: le due porte devono concordare",
    403,
    await bacheca(X, sx),
  );

  const segnaLetto = await leggi(
    await rotte.bacheca.POST(
      richiesta("/x", {
        method: "POST",
        token: sx,
        body: { deliveryId: randomUUID() },
      }),
      { params: { athleteId: X } },
    ),
  );
  prova(
    "R-98c e nemmeno la scrittura «l'ho letto» passa",
    403,
    segnaLetto.status,
  );

  /*
    **Il caso che pesa: la scheda passa a un'altra persona.** Dopo lo
    scollegamento il club invita un altro indirizzo — e il motivo per cui lo
    scollegamento esiste. Se la prima utenza continua a leggere, non sta
    leggendo la propria bacheca: sta leggendo quella di qualcun altro.
  */
  const TOK2 = `r5-${randomUUID()}`;
  await invitaConTokenNoto(X, "x.nuovo@pp04r5.invalid", TOK2);
  await leggi(
    await rotte.accetta.POST(
      richiesta("/api/v1/athlete-accounts/accept", {
        method: "POST",
        body: { token: TOK2 },
      }),
    ),
  );
  const nuovo = await prisma.user.findUnique({
    where: { email: "x.nuovo@pp04r5.invalid" },
  });
  const sn = await sessionePer(nuovo);

  prova("R-99 la scheda e ora del nuovo titolare", 200, await area(sn));
  prova("R-99b che ne apre la bacheca", 200, await bacheca(X, sn));
  prova(
    "R-99c e la vecchia utenza non legge la bacheca di una scheda che non e piu sua",
    403,
    await bacheca(X, sx),
  );

  /*
    E non c'e nessun gesto sul pannello di quella scheda che chiuda fuori la
    vecchia utenza: `revokeAthleteAccess` toglie le tessere di chi e collegato
    **adesso**, cioe del nuovo titolare. Se la porta si chiude, si deve
    chiudere da se.
  */
  await dominio.revokeAthleteAccess(scopeGestione(PRES.id), { athleteId: X });
  prova(
    "R-99d e resta chiusa dopo una revoca che colpisce il nuovo titolare",
    403,
    await bacheca(X, sx),
  );
};

/* ==================================================================== */

const main = async () => {
  try {
    await semina();
    await proveRifiutoInvito();
    await proveToken();
    await proveIdor();
    await proveAreaAtleta();
    await proveConsegne();
    await provePerimetroERuoli();
    await proveRevoca();
    await proveDueCappelli();
    await proveLegameSuperstite();
    await provePorteLaterali();
    await proveDueSchedeUnaUtenza();
    await proveScollegamento();
  } finally {
    await pulisci();
    await prisma.$disconnect();
  }

  const ok = esiti.filter((e) => e.ok).length;
  console.log(`\n${ok} / ${esiti.length} prove superate`);
  if (ok !== esiti.length) {
    console.log("\nFALLITE:");
    for (const e of esiti.filter((x) => !x.ok)) console.log(`  - ${e.titolo}`);
    process.exit(1);
  }
};

main().catch(async (errore) => {
  console.error(errore);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
