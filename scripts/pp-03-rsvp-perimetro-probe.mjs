/**
 * Attacco ostile PP-03 — RSVP: il perimetro dell'allenatore su un evento
 * congiunto A+B, sul canale RSVP.
 *
 *   EASYGAME_DB_ENV=development node --experimental-strip-types \
 *     --import ./tests/helpers/register-hooks.mjs \
 *     scripts/pp-03-rsvp-perimetro-probe.mjs
 *
 * La sonda ufficiale (A-02/A-04) ha gia dimostrato che GET /events/:id
 * /participants NON porta l'atleta della categoria A all'allenatore di B su un
 * evento congiunto. Questa sonda apre la **seconda porta sullo stesso dato**:
 * GET /api/v1/rsvp?training_id=<evento congiunto>, che passa da
 * `readEventRsvpSummary`. Il chiamante applica il perimetro all'EVENTO
 * (`assertTrainerCanSeeEvent`), ma l'elenco degli attesi lo calcola
 * `resolveExpectedAthletes`, che filtra sulle categorie DELL'EVENTO — A e B —
 * e non sul perimetro di chi guarda.
 *
 * Ipotesi d'attacco: l'allenatore di B, sull'evento congiunto A+B, legge lo
 * stato RSVP e la NOTA LIBERA della famiglia dell'atleta di categoria A.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("Rifiuto: serve EASYGAME_DB_ENV=development.");
  process.exit(1);
}

const NL = String.fromCharCode(10);
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
  if (nota) console.log(`        ${nota}`);
};

const CLUB = randomUUID();
const SEDE_1 = "sede-nord";
const CAT_A = "cat-a";
const CAT_B = "cat-b";
const CAT_C = "cat-c";
const ATLETA_A = randomUUID();
const ATLETA_B = randomUUID();

let PRESIDENTE = null;
let MISTER_A = null;
let MISTER_B = null;
let eventi = null;
let EVENTO_AB = null;
let EVENTO_C = null;

let SESSIONE = null;
let CLUB_ATTIVO = null;
let RUOLO_ATTIVO = null;
let rotte = null;

const scope = (activeRole, userId, org = CLUB) => ({
  userId,
  activeOrganizationId: org,
  activeRole,
  activeMembershipId: null,
  allowedOrganizationIds: [org],
  accessScopes: [],
});

const utente = async (email, nome) => {
  const trovato = await prisma.user.findUnique({ where: { email } });
  if (trovato) return trovato;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      first_name: nome,
      last_name: "Collaudo",
      password_hash: "$2b$10$pp03rsvp",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const preparaTrasporto = async () => {
  rotte = { rsvp: await carica("src/app/api/v1/rsvp/route.ts") };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), "http://collaudo.invalid");
    const metodo = String(init.method || "GET").toUpperCase();
    const headers = new Headers(init.headers || {});
    if (SESSIONE) headers.set("authorization", `Bearer ${SESSIONE}`);
    if (CLUB_ATTIVO) headers.set("x-active-club-id", CLUB_ATTIVO);
    if (RUOLO_ATTIVO) headers.set("x-active-access-role", RUOLO_ATTIVO);
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const richiesta = new Request(url.toString(), { ...init, headers });
    const segmenti = url.pathname.replace(/^\/api\/v1\//, "").split("/");
    if (segmenti[0] === "rsvp") return rotte.rsvp[metodo](richiesta);
    throw new Error(`Nessun handler per ${url.pathname}`);
  };
};

const comeUtente = async (utenteRiga, ruolo) => {
  const auth = await carica("src/lib/server/auth.ts");
  const sessione = await auth.createSessionForUser(utenteRiga);
  SESSIONE = sessione.access_token;
  CLUB_ATTIVO = CLUB;
  RUOLO_ATTIVO = ruolo;
};

const chiama = async (percorso, init) => {
  const risposta = await globalThis.fetch(percorso, init);
  const corpo = await risposta.json().catch(() => null);
  return { stato: risposta.status, corpo };
};

const pulisciResidui = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp03-rsvp-" } },
    select: { id: true },
  });
  const ids = residui.map((r) => r.id);
  if (!ids.length) return;
  await prisma.auditLog.deleteMany({ where: { organization_id: { in: ids } } }).catch(() => {});
  await prisma.club.deleteMany({ where: { id: { in: ids } } });
};

const semina = async () => {
  await pulisciResidui();
  PRESIDENTE = await utente("pp03-rsvp-pres@example.invalid", "Anna");
  MISTER_A = await utente("pp03-rsvp-a@example.invalid", "Aldo");
  MISTER_B = await utente("pp03-rsvp-b@example.invalid", "Bruno");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `pp03-rsvp-${Date.now()}`,
      name: "ASD RSVP",
      creator_id: PRESIDENTE.id,
      settings: {
        seasons: [
          { id: "2026-27", label: "2026/27", startDate: "2026-07-01", endDate: "2027-06-30", status: "active" },
        ],
      },
      categories: [
        { id: CAT_A, name: "Under 12" },
        { id: CAT_B, name: "Under 15" },
        { id: CAT_C, name: "Prima squadra" },
      ],
      club_sites: [{ id: SEDE_1, name: "Sede Nord", active: true }],
      category_groups: [],
      structures: [],
      trainers: [
        { id: "tr-a", first_name: "Aldo", last_name: "Collaudo", email: MISTER_A.email, linkedUserId: MISTER_A.id, categories: [CAT_A], groups: [] },
        { id: "tr-b", first_name: "Bruno", last_name: "Collaudo", email: MISTER_B.email, linkedUserId: MISTER_B.id, categories: [CAT_B], groups: [] },
      ],
      staff_members: [],
      trainings: [],
      matches: [],
      updated_at: new Date(),
    },
  });

  for (const [u, ruolo] of [[MISTER_A, "trainer"], [MISTER_B, "trainer"], [PRESIDENTE, "owner"]]) {
    await prisma.organizationUser.create({
      data: { id: randomUUID(), organization_id: CLUB, user_id: u.id, role: ruolo, is_primary: true, updated_at: new Date() },
    });
  }

  await prisma.athlete.createMany({
    data: [
      { id: ATLETA_A, organization_id: CLUB, first_name: "Anna", last_name: "DiA", status: "active", category_id: CAT_A, category_name: "Under 12", data: {}, updated_at: new Date() },
      { id: ATLETA_B, organization_id: CLUB, first_name: "Bruna", last_name: "DiB", status: "active", category_id: CAT_B, category_name: "Under 15", data: {}, updated_at: new Date() },
    ],
  });
  await prisma.athleteCategoryMembership.createMany({
    data: [
      { id: randomUUID(), organization_id: CLUB, athlete_id: ATLETA_A, category_id: CAT_A, site_id: SEDE_1, updated_at: new Date() },
      { id: randomUUID(), organization_id: CLUB, athlete_id: ATLETA_B, category_id: CAT_B, site_id: SEDE_1, updated_at: new Date() },
    ],
  });

  eventi = await carica("src/lib/server/events.ts");
  await preparaTrasporto();

  const owner = scope("owner", PRESIDENTE.id);
  const giorno = (d) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

  EVENTO_AB = await eventi.createClubEvent(owner, "training", {
    id: `ab-${Date.now()}`,
    title: "Allenamento congiunto A+B",
    date: giorno(3),
    time: "18:00",
    endTime: "19:30",
    categoryId: CAT_A,
    categories: [CAT_A, CAT_B],
    siteId: SEDE_1,
    rsvpRequired: true,
  });

  EVENTO_C = await eventi.createClubEvent(owner, "training", {
    id: `c-${Date.now()}`,
    title: "Allenamento C",
    date: giorno(4),
    time: "18:00",
    endTime: "19:30",
    categoryId: CAT_C,
    categories: [CAT_C],
    siteId: SEDE_1,
    rsvpRequired: true,
  });

  /* Seminiamo le risposte RSVP direttamente sulla riga partecipante, con
     NOTE LIBERE riconoscibili: e cio che una famiglia scriverebbe. */
  for (const [athleteId, stato, nota] of [
    [ATLETA_A, "yes", "NOTA-FAMIGLIA-A: arriva in ritardo, allergia arachidi"],
    [ATLETA_B, "no", "NOTA-FAMIGLIA-B: assente per infortunio"],
  ]) {
    await prisma.clubEventParticipant.upsert({
      where: {
        organization_id_event_id_athlete_id: {
          organization_id: CLUB,
          event_id: EVENTO_AB.id,
          athlete_id: athleteId,
        },
      },
      update: { rsvp_status: stato, rsvp_note: nota, rsvp_at: new Date(), rsvp_by_user_id: PRESIDENTE.id },
      create: {
        organization_id: CLUB,
        event_id: EVENTO_AB.id,
        legacy_training_id: EVENTO_AB.legacy_id,
        athlete_id: athleteId,
        status: "pending",
        rsvp_status: stato,
        rsvp_note: nota,
        rsvp_at: new Date(),
        rsvp_by_user_id: PRESIDENTE.id,
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

const main = async () => {
  console.log("Sonda ostile PP-03 — RSVP, perimetro su evento congiunto");
  try {
    await semina();

    // Riferimento: l'owner vede entrambi (deve).
    await comeUtente(PRESIDENTE, "owner");
    const owner = await chiama(`/api/v1/rsvp?training_id=${EVENTO_AB.legacy_id}`);
    const ownerAtleti = (owner.corpo?.data?.athletes || []).map((r) => r.athleteId);
    console.log(`  [rif] owner vede atleti: ${JSON.stringify(ownerAtleti)} (stato ${owner.stato})`);

    // L'attacco: l'allenatore di B sull'evento congiunto.
    await comeUtente(MISTER_B, "trainer");
    const b = await chiama(`/api/v1/rsvp?training_id=${EVENTO_AB.legacy_id}`);
    const testo = JSON.stringify(b.corpo?.data || {});
    const atletiVisti = (b.corpo?.data?.athletes || []).map((r) => ({ id: r.athleteId, note: r.note, state: r.state }));

    prova("RSVP-01 · l'allenatore di B vede l'evento congiunto (deve)", 200, b.stato);
    prova(
      "RSVP-02 · il riepilogo NON contiene l'atleta di categoria A",
      false,
      atletiVisti.some((a) => a.id === ATLETA_A),
      `atleti nel riepilogo: ${JSON.stringify(atletiVisti)}`,
    );
    prova(
      "RSVP-03 · la NOTA LIBERA della famiglia A non esce",
      false,
      testo.includes("NOTA-FAMIGLIA-A"),
    );
    prova(
      "RSVP-04 · l'atleta di categoria B c'e (deve)",
      true,
      atletiVisti.some((a) => a.id === ATLETA_B),
    );

    // Evento di categoria C: fuori perimetro per intero -> deve essere 403.
    const c = await chiama(`/api/v1/rsvp?training_id=${EVENTO_C.legacy_id}`);
    prova("RSVP-05 · l'evento di categoria C e negato all'allenatore di B", 403, c.stato,
      `corpo: ${JSON.stringify(c.corpo?.error)}`);
  } catch (errore) {
    console.error(`${NL}Sonda interrotta: ${errore?.stack || errore}`);
    esiti.push({ titolo: "esecuzione", ok: false });
  } finally {
    await pulisci();
    await prisma.$disconnect();
  }

  const passati = esiti.filter((e) => e.ok).length;
  console.log(`${NL}${passati} / ${esiti.length}`);
  const falliti = esiti.filter((e) => !e.ok);
  if (falliti.length) {
    console.log(`${NL}Attacchi RIUSCITI (difetti):`);
    for (const e of falliti) console.log(`  - ${e.titolo}`);
  }
  process.exit(falliti.length ? 1 : 0);
};

main();
