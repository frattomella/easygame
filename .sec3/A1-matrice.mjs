/**
 * SEC-3 / round ostile su PP-04. Sonda A1: la matrice delle rotte di famiglia,
 * percorsa da cinque identita diverse, contro PostgreSQL vero.
 *
 *   EASYGAME_DB_ENV=development node --experimental-strip-types \
 *     --import ./tests/helpers/register-hooks.mjs .sec3/A1-matrice.mjs
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("serve EASYGAME_DB_ENV=development");
  process.exit(1);
}

const prisma = new PrismaClient();
const carica = (rel) => import(pathToFileURL(path.resolve(rel)).href);

const esiti = [];
const prova = (t, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ t, ok });
  console.log(
    "  " + (ok ? "PASS" : "FAIL") + "  " + t.padEnd(62) + " " +
      JSON.stringify(trovato) +
      (ok ? "" : "  atteso " + JSON.stringify(atteso)) +
      (nota ? "  | " + nota : ""),
  );
};

const CLUB = randomUUID();
const CAT_A = "sec3-cat-a";
const CAT_B = "sec3-cat-b";
const A_ALFA = randomUUID();
const A_BETA = randomUUID();
const A_SGAN = randomUUID();
const A_EX = randomUUID();

const U = {};
let rotte = null;
let dominio = null;

const richiesta = (url, opts = {}) => {
  const { method = "GET", token, club, ruolo, body } = opts;
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("authorization", "Bearer " + token);
  if (club) headers.set("x-active-club-id", club);
  if (ruolo) headers.set("x-active-access-role", ruolo);
  return new Request(new URL(url, "http://sec3.invalid").toString(), {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
};

const leggi = async (r) => {
  const testo = await r.text();
  let corpo = null;
  try {
    corpo = testo ? JSON.parse(testo) : null;
  } catch {
    corpo = testo;
  }
  return { status: r.status, corpo, testo };
};

const sessionePer = async (u) => {
  const auth = await carica("src/lib/server/auth.ts");
  return (await auth.createSessionForUser(u)).access_token;
};

const utente = (email, nome, verificato = true) =>
  prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      id: randomUUID(),
      email,
      first_name: nome,
      last_name: "Sec3",
      password_hash: "$2b$10$sec3",
      role: "user",
      email_verified_at: verificato ? new Date() : null,
      updated_at: new Date(),
    },
  });

const pulisciResidui = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "sec3-" } },
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
    .deleteMany({ where: { email: { endsWith: "@sec3.invalid" } } })
    .catch(() => {});
};

const anagrafica = (extra) => ({
  fiscal_code: "ATLETA00A00A000A",
  allergies: "ALLERGIA-SEGRETA",
  medical_notes: "NOTA-MEDICA-SEGRETA",
  ...extra,
});

const semina = async () => {
  await pulisciResidui();
  U.pres = await utente("pres@sec3.invalid", "Presidente");
  U.alfa = await utente("alfa@sec3.invalid", "Alfa");
  U.beta = await utente("beta@sec3.invalid", "Beta");
  U.tutore = await utente("tutore@sec3.invalid", "Tutore");
  U.sgan = await utente("sgan@sec3.invalid", "Sganciato");
  U.ex = await utente("ex@sec3.invalid", "Ex");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: "sec3-" + Date.now(),
      name: "ASD Sec3",
      creator_id: U.pres.id,
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
      club_sites: [{ id: "sec3-sede", name: "Sede", active: true }],
      structures: [],
      trainers: [],
      staff_members: [],
      trainings: [],
      matches: [],
      appointments: [],
      updated_at: new Date(),
    },
  });

  const creaAtleta = (id, nome, userId, categoria, guardians, nascita) =>
    prisma.athlete.create({
      data: {
        id,
        organization_id: CLUB,
        first_name: nome,
        last_name: "Atleta",
        status: "active",
        category_id: categoria,
        category_name: categoria === CAT_A ? "Under 12" : "Under 15",
        birth_date: new Date(nascita),
        user_id: userId,
        data: anagrafica({ guardians }),
        updated_at: new Date(),
      },
    });

  await creaAtleta(A_ALFA, "Alfa", U.alfa.id, CAT_A, [
    {
      id: "g-alfa",
      first_name: "Alfa",
      last_name: "Contatto",
      email: U.alfa.email,
      fiscal_code: "TUTALF00A00A000A",
    },
  ], "2012-01-01");

  await creaAtleta(A_BETA, "Beta", U.beta.id, CAT_B, [
    {
      id: "g-beta",
      first_name: "Tuta",
      last_name: "Tutrice",
      email: U.tutore.email,
      linked_user_id: U.tutore.id,
      fiscal_code: "TUTBET00A00A000A",
    },
  ], "2011-01-01");

  await creaAtleta(A_SGAN, "Sgan", U.sgan.id, CAT_A, [
    {
      id: "g-sgan",
      first_name: "Sgan",
      last_name: "Contatto",
      email: U.sgan.email,
      fiscal_code: "TUTSGA00A00A000A",
    },
  ], "2010-01-01");

  await creaAtleta(A_EX, "Ex", U.ex.id, CAT_A, [
    {
      id: "g-ex",
      first_name: "Ex",
      last_name: "Contatto",
      email: U.ex.email,
      fiscal_code: "TUTEXX00A00A000A",
    },
  ], "2009-01-01");

  const tessera = (userId, role) =>
    prisma.organizationUser.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        user_id: userId,
        role,
        is_primary: true,
        updated_at: new Date(),
      },
    });
  await tessera(U.pres.id, "owner");
  await tessera(U.alfa.id, "athlete");
  await tessera(U.beta.id, "athlete");
  await tessera(U.sgan.id, "athlete");
  await tessera(U.ex.id, "athlete");
  await tessera(U.tutore.id, "parent");

  for (const a of [A_ALFA, A_BETA, A_SGAN, A_EX]) {
    await prisma.athletePayment.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: a,
        amount: 337.77,
        due_date: new Date("2026-10-01"),
        status: "pending",
        description: "QUOTA-SEGRETA",
        updated_at: new Date(),
      },
    });
    await prisma.medicalCertificate.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: a,
        type: "competitive",
        issue_date: new Date("2026-01-01"),
        expiry_date: new Date("2027-01-01"),
        status: "valid",
        notes: "DIAGNOSI-SEGRETA",
        file_url: "https://archivio.invalid/FILE-SEGRETO.pdf",
        updated_at: new Date(),
      },
    });
  }

  dominio = await carica("src/lib/server/athlete-accounts.ts");
  rotte = {
    famiglia: await carica("src/app/api/parent-dashboard/[athleteId]/route.ts"),
    bacheca: await carica("src/app/api/parent-dashboard/[athleteId]/board/route.ts"),
    consensi: await carica("src/app/api/parent-dashboard/[athleteId]/consents/route.ts"),
    notifiche: await carica("src/app/api/parent-dashboard/[athleteId]/notifications/route.ts"),
    strutture: await carica("src/app/api/parent-dashboard/[athleteId]/structures/route.ts"),
    checkout: await carica("src/app/api/parent-dashboard/[athleteId]/checkout/route.ts"),
    documenti: await carica("src/app/api/parent-dashboard/[athleteId]/documents/route.ts"),
    documentoFile: await carica("src/app/api/parent-dashboard/[athleteId]/documents/[assetId]/route.ts"),
    appuntamenti: await carica("src/app/api/parent-dashboard/[athleteId]/appointments/route.ts"),
    me: await carica("src/app/api/v1/athlete-accounts/me/route.ts"),
    tessere: await carica("src/app/api/v1/auth/memberships/route.ts"),
    figli: await carica("src/app/api/v1/family/children/route.ts"),
    iscrizioni: await carica("src/app/api/v1/family/enrollment-requests/route.ts"),
  };
};

const pulisci = async () => {
  await prisma.auditLog
    .deleteMany({ where: { organization_id: CLUB } })
    .catch(() => {});
  await prisma.club
    .deleteMany({ where: { id: CLUB } })
    .catch((e) => console.error("pulizia:", e && e.message));
  await prisma.user
    .deleteMany({ where: { email: { endsWith: "@sec3.invalid" } } })
    .catch(() => {});
};

const SEGRETI = [
  "QUOTA-SEGRETA",
  "DIAGNOSI-SEGRETA",
  "FILE-SEGRETO",
  "ALLERGIA-SEGRETA",
  "NOTA-MEDICA-SEGRETA",
  "TUTALF00A00A000A",
  "TUTBET00A00A000A",
  "TUTSGA00A00A000A",
  "TUTEXX00A00A000A",
];
const segretiIn = (testo) =>
  SEGRETI.filter((s) => String(testo || "").includes(s));

const matrice = async (etichetta, token, atletaId, attesoStatus) => {
  const opz = { token, club: CLUB };
  const ctx = { params: { athleteId: atletaId } };
  const futuro = new Date(Date.now() + 7 * 86400000).toISOString();
  const chiamate = [
    ["GET   /:id", () => rotte.famiglia.GET(richiesta("/api/parent-dashboard/" + atletaId, opz), ctx)],
    ["GET   /:id/board", () => rotte.bacheca.GET(richiesta("/x", opz), ctx)],
    ["GET   /:id/consents", () => rotte.consensi.GET(richiesta("/x", opz), ctx)],
    ["POST  /:id/consents", () => rotte.consensi.POST(richiesta("/x", { ...opz, method: "POST", body: { consentId: "marketing", granted: true } }), ctx)],
    ["PATCH /:id/notifications", () => rotte.notifiche.PATCH(richiesta("/x", { ...opz, method: "PATCH", body: { markAllRead: true } }), ctx)],
    ["POST  /:id/structures", () => rotte.strutture.POST(richiesta("/x", { ...opz, method: "POST", body: { structureId: "s", fieldId: "f", start: futuro, end: futuro } }), ctx)],
    ["POST  /:id/checkout", () => rotte.checkout.POST(richiesta("/x", { ...opz, method: "POST", body: { paymentIds: [] } }), ctx)],
    ["GET   /:id/documents", () => rotte.documenti.GET(richiesta("/x", opz), ctx)],
    ["GET   /:id/documents/:a", () => rotte.documentoFile.GET(richiesta("/x", opz), { params: { athleteId: atletaId, assetId: randomUUID() } })],
    ["GET   /:id/appointments", () => rotte.appuntamenti.GET(richiesta("/x", opz), ctx)],
  ];

  console.log("\n— " + etichetta + " —");
  for (const [nome, fn] of chiamate) {
    let r;
    try {
      r = await leggi(await fn());
    } catch (e) {
      r = { status: "throw", testo: String(e && e.message), corpo: null };
    }
    const trovati = segretiIn(r.testo);
    const messaggio = String((r.corpo && r.corpo.error && r.corpo.error.message) || "").slice(0, 60);
    prova(etichetta + " " + nome, attesoStatus, r.status, messaggio);
    if (trovati.length && attesoStatus !== 200) {
      esiti.push({ t: etichetta + " " + nome + " PERDITA", ok: false });
      console.log("     !!! PERDITA: " + trovati.join(", "));
    }
    if (trovati.length && attesoStatus === 200) {
      console.log("     (atteso, ramo tutore) consegna: " + trovati.join(", "));
    }
  }
};

const scopeOwner = () => ({
  userId: U.pres.id,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
  accessScopes: [],
  actorEmail: U.pres.email,
});

const main = async () => {
  await semina();

  const tokAlfa = await sessionePer(U.alfa);
  const tokTutore = await sessionePer(U.tutore);
  const tokSgan = await sessionePer(U.sgan);

  console.log("\n===== BLOCCO 1 — l'atleta in regola, sulla propria scheda (ADR-0122) =====");
  await matrice("A1 atleta/se", tokAlfa, A_ALFA, 403);

  console.log("\n===== BLOCCO 2 — l'atleta sulla scheda di un altro =====");
  await matrice("A2 atleta/altro", tokAlfa, A_BETA, 403);

  console.log("\n===== BLOCCO 3 — il tutore vero: nessuna regressione =====");
  await matrice("A3 tutore/figlio", tokTutore, A_BETA, 200);

  console.log("\n===== BLOCCO 4 — scheda SCOLLEGATA, tessera atleta ancora viva =====");
  await dominio.unlinkAthleteAccount(scopeOwner(), { athleteId: A_SGAN });
  const dopo = await prisma.athlete.findUnique({
    where: { id: A_SGAN },
    select: { user_id: true },
  });
  prova("B4-0 unlink ha azzerato athletes.user_id", null, dopo.user_id);
  const tessSgan = await prisma.organizationUser.findFirst({
    where: { organization_id: CLUB, user_id: U.sgan.id },
    select: { role: true },
  });
  prova("B4-1 la tessera athlete resta viva", "athlete", tessSgan && tessSgan.role);
  const meSgan = await leggi(
    await rotte.me.GET(richiesta("/api/v1/athlete-accounts/me", { token: tokSgan, club: CLUB })),
  );
  prova("B4-2 la porta d'ingresso /me e chiusa", 403, meSgan.status);
  await matrice("B4 scollegato/propria", tokSgan, A_SGAN, 403);

  console.log("\n===== BLOCCO 5 — la proiezione di /me =====");
  const meAlfa = await leggi(
    await rotte.me.GET(richiesta("/api/v1/athlete-accounts/me", { token: tokAlfa, club: CLUB })),
  );
  prova("B5-0 /me risponde all'atleta in regola", 200, meAlfa.status);
  prova("B5-1 /me non porta denaro, clinico o tutori", [], segretiIn(meAlfa.testo));

  console.log("\n===== BLOCCO 6 — figli e pratiche d'iscrizione =====");
  const figliAlfa = await leggi(
    await rotte.figli.GET(richiesta("/api/v1/family/children", { token: tokAlfa, club: CLUB })),
  );
  prova(
    "B6-0 /family/children per l'atleta e vuoto",
    0,
    Array.isArray(figliAlfa.corpo && figliAlfa.corpo.data) ? figliAlfa.corpo.data.length : figliAlfa.status,
  );
  const figliTut = await leggi(
    await rotte.figli.GET(richiesta("/api/v1/family/children", { token: tokTutore, club: CLUB })),
  );
  prova(
    "B6-1 /family/children per il tutore ha il figlio",
    1,
    Array.isArray(figliTut.corpo && figliTut.corpo.data) ? figliTut.corpo.data.length : figliTut.status,
  );
  const iscrAlfa = await leggi(
    await rotte.iscrizioni.GET(richiesta("/api/v1/family/enrollment-requests?athleteId=" + A_ALFA, { token: tokAlfa, club: CLUB })),
  );
  prova("B6-2 enrollment-requests per l'atleta su se stesso", 403, iscrAlfa.status,
    String((iscrAlfa.corpo && iscrAlfa.corpo.error && iscrAlfa.corpo.error.message) || "").slice(0, 60));
  const iscrTut = await leggi(
    await rotte.iscrizioni.GET(richiesta("/api/v1/family/enrollment-requests?athleteId=" + A_BETA, { token: tokTutore, club: CLUB })),
  );
  prova("B6-3 enrollment-requests per il tutore", 200, iscrTut.status,
    String((iscrTut.corpo && iscrTut.corpo.error && iscrTut.corpo.error.message) || "").slice(0, 60));

  console.log("\n===== BLOCCO 7 — memberships: linked_athlete_ids =====");
  const tess = await leggi(
    await rotte.tessere.GET(richiesta("/api/v1/auth/memberships", { token: tokAlfa, club: CLUB })),
  );
  const righeAlfa = ((tess.corpo && tess.corpo.data) || []).filter((r) => r.role === "athlete");
  prova("B7-0 l'atleta si ritrova in linked_athlete_ids", [A_ALFA], righeAlfa[0] && righeAlfa[0].linked_athlete_ids);
  const tessSganR = await leggi(
    await rotte.tessere.GET(richiesta("/api/v1/auth/memberships", { token: tokSgan, club: CLUB })),
  );
  const righeSgan = ((tessSganR.corpo && tessSganR.corpo.data) || []).filter((r) => r.role === "athlete");
  prova("B7-1 lo scollegato non ha linked_athlete_ids", [], righeSgan[0] && righeSgan[0].linked_athlete_ids);
};

main()
  .catch((e) => {
    console.error("\nESPLOSA:", e);
    esiti.push({ t: "sonda", ok: false });
  })
  .finally(async () => {
    await pulisci();
    await prisma.$disconnect();
    const ko = esiti.filter((e) => !e.ok);
    console.log("\n===== " + (esiti.length - ko.length) + "/" + esiti.length + " verdi =====");
    if (ko.length) {
      console.log("ROSSE:");
      ko.forEach((e) => console.log("  - " + e.t));
    }
  });
