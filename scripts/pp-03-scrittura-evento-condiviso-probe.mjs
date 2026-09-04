/**
 * **Supplemento alla seconda revisione ostile di PP-03.**
 *
 * Approfondisce cinque ritrovamenti della sonda principale:
 *  S — l'evento congiunto rubato per intero (categoria primaria compresa)
 *  T — l'appello su un evento annullato / archiviato, e la convocazione
 *  U — cosa esce davvero da /club_event_participants a un allenatore
 *  V — cosa esce davvero da /medical_certificates a un allenatore
 *  W — i campi «sempre modificabili» su un evento di un altro
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/pp-03-scrittura-evento-condiviso-probe.mjs
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
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(80)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (nota) console.log(`        nota: ${nota}`);
};
const osserva = (titolo, valore) =>
  console.log(`  ....  ${titolo.padEnd(80)} ${JSON.stringify(valore)}`);

const CLUB = randomUUID();
const SEDE_1 = "sede-pp03o2s-nord";
const SEDE_2 = "sede-pp03o2s-sud";
const CAT_A = "cat-pp03o2s-a";
const CAT_B = "cat-pp03o2s-b";
const CAT_C = "cat-pp03o2s-c";
const ATLETA_A = randomUUID();
const ATLETA_B = randomUUID();

let PRESIDENTE = null;
let MISTER_A = null;
let MISTER_B = null;
let eventi = null;
let auth = null;

const scope = (activeRole, userId) => ({
  userId,
  activeOrganizationId: CLUB,
  activeRole,
  activeMembershipId: null,
  allowedOrganizationIds: [CLUB],
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
      last_name: "Ostile2",
      password_hash: "$2b$10$pp03o2",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

let SESSIONE = null;
let RUOLO_ATTIVO = null;
let rotte = null;

const preparaTrasporto = async () => {
  rotte = {
    elenco: await carica("src/app/api/v1/[resource]/route.ts"),
    riga: await carica("src/app/api/v1/[resource]/[id]/route.ts"),
    partecipanti: await carica("src/app/api/v1/events/[id]/participants/route.ts"),
    evento: await carica("src/app/api/v1/events/[id]/route.ts"),
    eventiElenco: await carica("src/app/api/v1/events/route.ts"),
  };

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), "http://collaudo.invalid");
    const metodo = String(init.method || "GET").toUpperCase();
    const headers = new Headers(init.headers || {});
    if (SESSIONE) headers.set("authorization", `Bearer ${SESSIONE}`);
    headers.set("x-active-club-id", CLUB);
    if (RUOLO_ATTIVO) headers.set("x-active-access-role", RUOLO_ATTIVO);
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const richiesta = new Request(url.toString(), { ...init, headers });
    const segmenti = url.pathname.replace(/^\/api\/v1\//, "").split("/");

    if (segmenti[0] === "events" && segmenti[2] === "participants") {
      return rotte.partecipanti[metodo](richiesta, { params: { id: segmenti[1] } });
    }
    if (segmenti[0] === "events" && segmenti.length === 2) {
      return rotte.evento[metodo](richiesta, { params: { id: segmenti[1] } });
    }
    if (segmenti[0] === "events") return rotte.eventiElenco[metodo](richiesta);
    if (segmenti.length === 1) {
      return rotte.elenco[metodo](richiesta, { params: { resource: segmenti[0] } });
    }
    return rotte.riga[metodo](richiesta, {
      params: { resource: segmenti[0], id: segmenti[1] },
    });
  };
};

const comeUtente = async (utenteRiga, ruolo) => {
  const sessione = await auth.createSessionForUser(utenteRiga);
  SESSIONE = sessione.access_token;
  RUOLO_ATTIVO = ruolo;
};

const chiama = async (percorso, init) => {
  const risposta = await globalThis.fetch(percorso, init);
  const corpo = await risposta.json().catch(() => null);
  return { stato: risposta.status, corpo };
};

const giorno = (delta) =>
  new Date(Date.now() + delta * 86_400_000).toISOString().slice(0, 10);

const semina = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp03o2s-" } },
    select: { id: true },
  });
  if (residui.length) {
    const ids = residui.map((r) => r.id);
    await prisma.auditLog.deleteMany({ where: { organization_id: { in: ids } } }).catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }

  PRESIDENTE = await utente("pp03o2s-presidente@example.invalid", "Anna");
  MISTER_A = await utente("pp03o2s-mister-a@example.invalid", "Aldo");
  MISTER_B = await utente("pp03o2s-mister-b@example.invalid", "Bruno");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `pp03o2s-${Date.now()}`,
      name: "ASD Supplemento PP-03",
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
      category_groups: [],
      structures: [],
      trainers: [
        {
          id: "trainer-s-a",
          first_name: "Aldo",
          last_name: "Ostile2",
          email: MISTER_A.email,
          linkedUserId: MISTER_A.id,
          categories: [CAT_A],
          groups: [],
        },
        {
          id: "trainer-s-b",
          first_name: "Bruno",
          last_name: "Ostile2",
          email: MISTER_B.email,
          linkedUserId: MISTER_B.id,
          categories: [CAT_B],
          groups: [],
        },
      ],
      staff_members: [],
      trainings: [],
      matches: [],
      updated_at: new Date(),
    },
  });

  for (const [u, ruolo] of [
    [PRESIDENTE, "owner"],
    [MISTER_A, "trainer"],
    [MISTER_B, "trainer"],
  ]) {
    await prisma.organizationUser.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        user_id: u.id,
        role: ruolo,
        is_primary: true,
        updated_at: new Date(),
      },
    });
  }

  await prisma.athlete.createMany({
    data: [
      {
        id: ATLETA_A,
        organization_id: CLUB,
        first_name: "Anna",
        last_name: "CategoriaA",
        status: "active",
        category_id: CAT_A,
        category_name: "Under 12",
        data: { allergies: "Arachidi" },
        updated_at: new Date(),
      },
      {
        id: ATLETA_B,
        organization_id: CLUB,
        first_name: "Bruna",
        last_name: "CategoriaB",
        status: "active",
        category_id: CAT_B,
        category_name: "Under 15",
        data: {},
        updated_at: new Date(),
      },
    ],
  });

  await prisma.athleteCategoryMembership.createMany({
    data: [
      {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: ATLETA_A,
        category_id: CAT_A,
        site_id: SEDE_1,
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: ATLETA_B,
        category_id: CAT_B,
        site_id: SEDE_2,
        updated_at: new Date(),
      },
    ],
  });

  await prisma.medicalCertificate.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      athlete_id: ATLETA_A,
      type: "competitive",
      status: "valid",
      issue_date: new Date(),
      expiry_date: new Date(Date.now() + 200 * 86_400_000),
      notes: "SEGRETO-A: soffio cardiaco",
      data: { doctor: "Dott. Riservato", diagnosis: "SEGRETO-A" },
      updated_at: new Date(),
    },
  });

  eventi = await carica("src/lib/server/events.ts");
  auth = await carica("src/lib/server/auth.ts");
  await preparaTrasporto();
};

const pulisci = async () => {
  await prisma.auditLog.deleteMany({ where: { organization_id: CLUB } }).catch(() => {});
  await prisma.club.deleteMany({ where: { id: CLUB } }).catch((e) => {
    console.error(`Pulizia non riuscita: ${e?.message}`);
  });
};

const creaCongiunto = async (titolo, delta) =>
  eventi.createClubEvent(
    scope("owner", PRESIDENTE.id),
    "training",
    {
      id: `pp03o2s-${titolo}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: titolo,
      date: giorno(delta),
      time: "18:00",
      endTime: "19:30",
      categoryId: CAT_A,
      categories: [CAT_A, CAT_B],
      siteId: SEDE_1,
      trainerIds: ["trainer-s-a", "trainer-s-b"],
      allowOverlap: true,
    },
    { userId: PRESIDENTE.id, email: PRESIDENTE.email },
  );

/* =================================================================== */

const attacchi = async () => {
  const patch = (id, corpo) =>
    chiama(`/api/v1/events/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ data: corpo }),
    });

  /* ---------------- S — l'evento congiunto rubato ------------------ */
  console.log(`${NL}S — l'evento congiunto rubato all'altro allenatore`);
  const rubato = await creaCongiunto("Congiunto da rubare", 3);
  await comeUtente(MISTER_B, "trainer");

  const s1 = await patch(rubato.id, { categoryId: CAT_B, categories: [CAT_B] });
  const dopoS1 = await prisma.clubEvent.findUnique({
    where: { id: rubato.id },
    select: { category_id: true, category_ids: true },
  });
  prova(
    "S-01 · l'allenatore di B non toglie la categoria A dall'evento congiunto",
    true,
    (dopoS1?.category_ids || []).includes(CAT_A),
    `stato ${s1.stato}; in archivio: ${JSON.stringify(dopoS1)}`,
  );

  await comeUtente(MISTER_A, "trainer");
  const visto = await chiama(`/api/v1/events/${rubato.id}`);
  prova(
    "S-02 · e l'allenatore di A continua a vedere il proprio allenamento",
    200,
    visto.stato,
    JSON.stringify(visto.corpo?.error?.message || "").slice(0, 120),
  );

  const calendarioA = await chiama("/api/v1/events?kind=training");
  const titoliA = (calendarioA.corpo?.data || []).map((e) => e?.title);
  prova(
    "S-03 · e l'allenamento resta nel suo calendario",
    true,
    titoliA.includes("Congiunto da rubare"),
    `titoli: ${JSON.stringify(titoliA)}`,
  );

  /* La categoria primaria spostata su una squadra di cui B non e allenatore. */
  const promosso = await creaCongiunto("Congiunto promosso a C", 4);
  await comeUtente(MISTER_B, "trainer");
  const s4 = await patch(promosso.id, {
    categoryId: CAT_C,
    categories: [CAT_B, CAT_C],
  });
  const dopoS4 = await prisma.clubEvent.findUnique({
    where: { id: promosso.id },
    select: { category_id: true, category_ids: true },
  });
  prova(
    "S-04 · l'allenatore di B non sposta la categoria primaria su C",
    false,
    dopoS4?.category_id === CAT_C,
    `stato ${s4.stato}; in archivio: ${JSON.stringify(dopoS4)}`,
  );

  /* ---------------- T — appello e convocazione su eventi chiusi ---- */
  console.log(`${NL}T — l'appello e la convocazione su eventi chiusi`);
  const annullato = await creaCongiunto("Congiunto annullato", 5);
  await eventi.updateClubEvent(
    scope("owner", PRESIDENTE.id),
    annullato.id,
    { status: "cancelled" },
    { userId: PRESIDENTE.id, email: PRESIDENTE.email },
  );

  await comeUtente(MISTER_B, "trainer");
  const t1 = await chiama(`/api/v1/events/${annullato.id}/participants`, {
    method: "POST",
    body: JSON.stringify({
      data: { action: "attendance", entries: [{ athleteId: ATLETA_B, status: "present" }] },
    }),
  });
  const rigaT1 = await prisma.clubEventParticipant.findFirst({
    where: { event_id: annullato.id, athlete_id: ATLETA_B },
    select: { status: true },
  });
  prova(
    "T-01 · l'appello su un evento ANNULLATO e respinto",
    true,
    t1.stato >= 400,
    `stato ${t1.stato}; presenza scritta: ${JSON.stringify(rigaT1)}`,
  );

  const t2 = await chiama(`/api/v1/events/${annullato.id}/participants`, {
    method: "POST",
    body: JSON.stringify({
      data: { action: "convoke", entries: [{ athleteId: ATLETA_B, status: "convocated" }] },
    }),
  });
  const rigaT2 = await prisma.clubEventParticipant.findFirst({
    where: { event_id: annullato.id, athlete_id: ATLETA_B },
    select: { convocation_status: true },
  });
  prova(
    "T-02 · la convocazione su un evento ANNULLATO e respinta",
    true,
    t2.stato >= 400,
    `stato ${t2.stato}; convocazione scritta: ${JSON.stringify(rigaT2)}`,
  );

  /* Un evento archiviato: la forma piu chiusa che la macchina a stati conosce. */
  const archiviato = await creaCongiunto("Congiunto archiviato", 6);
  await prisma.clubEvent.update({
    where: { id: archiviato.id },
    data: { status: "archived" },
  });
  const t3 = await chiama(`/api/v1/events/${archiviato.id}/participants`, {
    method: "POST",
    body: JSON.stringify({
      data: { action: "attendance", entries: [{ athleteId: ATLETA_B, status: "present" }] },
    }),
  });
  const rigaT3 = await prisma.clubEventParticipant.findFirst({
    where: { event_id: archiviato.id, athlete_id: ATLETA_B },
    select: { status: true },
  });
  prova(
    "T-03 · l'appello su un evento ARCHIVIATO e respinto",
    true,
    t3.stato >= 400,
    `stato ${t3.stato}; presenza scritta: ${JSON.stringify(rigaT3)}`,
  );

  /* Lo stato di presenza fuori vocabolario, e cosa ne fa la rendicontazione. */
  const vivo = await creaCongiunto("Congiunto vivo", 7);
  const t4 = await chiama(`/api/v1/events/${vivo.id}/participants`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        action: "attendance",
        entries: [{ athleteId: ATLETA_B, status: "Presente" }],
      },
    }),
  });
  const rigaT4 = await prisma.clubEventParticipant.findFirst({
    where: { event_id: vivo.id, athlete_id: ATLETA_B },
    select: { status: true },
  });
  prova(
    "T-04 · uno stato di presenza in italiano e respinto (o normalizzato)",
    true,
    t4.stato >= 400 || rigaT4?.status === "present",
    `stato ${t4.stato}; in archivio: ${JSON.stringify(rigaT4?.status)}`,
  );

  /* ---------------- U — la porta accanto sui partecipanti ---------- */
  console.log(`${NL}U — cosa esce da /club_event_participants`);
  const conStoria = await creaCongiunto("Congiunto con storia", 8);
  await eventi.saveEventAttendance(
    scope("owner", PRESIDENTE.id),
    conStoria.id,
    [
      {
        athleteId: ATLETA_A,
        status: "absent",
        notes: "SEGRETO-NOTA-A: la madre ha chiamato per il tribunale dei minori",
      },
      { athleteId: ATLETA_B, status: "present" },
    ],
    { userId: PRESIDENTE.id, email: PRESIDENTE.email },
  );
  await eventi.saveEventConvocations(
    scope("owner", PRESIDENTE.id),
    conStoria.id,
    [{ athleteId: ATLETA_A, status: "excluded" }],
    { userId: PRESIDENTE.id, email: PRESIDENTE.email },
  );

  await comeUtente(MISTER_B, "trainer");
  const dominio = await chiama(`/api/v1/events/${conStoria.id}/participants`);
  const generico = await chiama(
    `/api/v1/club_event_participants?event_id=${conStoria.id}`,
  );

  const daDominio = (dominio.corpo?.data || []).map((r) => r.athlete_id);
  const righeGeneriche = generico.corpo?.data || [];
  const daGenerico = righeGeneriche.map((r) => r.athlete_id);

  osserva("U-00 · dominio vs registro generico", {
    dominio: daDominio.length,
    generico: righeGeneriche.length,
  });
  prova(
    "U-01 · il registro generico non porta la riga dell'atleta fuori perimetro",
    false,
    daGenerico.includes(ATLETA_A),
    `righe: ${JSON.stringify(righeGeneriche.map((r) => ({ a: r.athlete_id, s: r.status, c: r.convocation_status, n: r.notes })))}`,
  );
  prova(
    "U-02 · e non porta la nota in chiaro su quel minore",
    false,
    JSON.stringify(righeGeneriche).includes("SEGRETO-NOTA-A"),
  );
  prova(
    "U-03 · e non porta lo stato di convocazione di quel minore",
    false,
    righeGeneriche.some(
      (r) => r.athlete_id === ATLETA_A && r.convocation_status === "excluded",
    ),
  );

  /* La stessa riga chiesta per identificativo. */
  const rigaA = await prisma.clubEventParticipant.findFirst({
    where: { event_id: conStoria.id, athlete_id: ATLETA_A },
    select: { id: true },
  });
  const perId = await chiama(`/api/v1/club_event_participants/${rigaA.id}`);
  prova(
    "U-04 · ne la stessa riga chiesta per identificativo",
    true,
    perId.stato >= 400 ||
      !JSON.stringify(perId.corpo || {}).includes("SEGRETO-NOTA-A"),
    `stato ${perId.stato}; corpo: ${JSON.stringify(perId.corpo?.data || null).slice(0, 200)}`,
  );

  /* ---------------- V — i certificati medici ----------------------- */
  console.log(`${NL}V — i certificati medici dalla porta generica`);
  await comeUtente(MISTER_B, "trainer");
  const certificati = await chiama("/api/v1/medical_certificates");
  const righeCert = certificati.corpo?.data || [];
  prova(
    "V-01 · l'allenatore di B non riceve il certificato dell'atleta della categoria A",
    false,
    righeCert.some((r) => r.athlete_id === ATLETA_A),
    `stato ${certificati.stato}; righe ${righeCert.length}`,
  );
  prova(
    "V-02 · e non riceve la diagnosi in chiaro",
    false,
    JSON.stringify(righeCert).includes("SEGRETO-A"),
    JSON.stringify(righeCert).slice(0, 1200),
  );

  const certPerId = righeCert[0]?.id
    ? await chiama(`/api/v1/medical_certificates/${righeCert[0].id}`)
    : { stato: null, corpo: null };
  osserva("V-03 · la stessa riga per identificativo", {
    stato: certPerId.stato,
    contieneDiagnosi: JSON.stringify(certPerId.corpo || {}).includes("SEGRETO-A"),
  });

  /* ---------------- W — i campi sempre modificabili ---------------- */
  console.log(`${NL}W — i campi «sempre modificabili» su un evento di un altro`);
  const conStoriaTrainer = await prisma.clubEvent.findUnique({
    where: { id: conStoria.id },
    select: { trainer_ids: true, title: true },
  });
  osserva("W-00 · allenatori dichiarati sull'evento", conStoriaTrainer?.trainer_ids);

  const w1 = await patch(conStoria.id, { trainerIds: ["trainer-s-b"] });
  const dopoW1 = await prisma.clubEvent.findUnique({
    where: { id: conStoria.id },
    select: { trainer_ids: true },
  });
  prova(
    "W-01 · l'allenatore di B non toglie l'allenatore di A dall'evento congiunto",
    true,
    (dopoW1?.trainer_ids || []).includes("trainer-s-a"),
    `stato ${w1.stato}; in archivio: ${JSON.stringify(dopoW1?.trainer_ids)}`,
  );

  const w2 = await patch(conStoria.id, {
    title: "ALLENAMENTO ANNULLATO — non venite",
  });
  const dopoW2 = await prisma.clubEvent.findUnique({
    where: { id: conStoria.id },
    select: { title: true },
  });
  osserva("W-02 · il titolo di un evento congiunto con storia", {
    stato: w2.stato,
    titolo: dopoW2?.title,
  });
};

const main = async () => {
  console.log("Supplemento ostile PP-03");
  try {
    await semina();
    await attacchi();
  } catch (errore) {
    console.error(`${NL}Interrotto: ${errore?.stack || errore}`);
    esiti.push({ titolo: "esecuzione completa", ok: false });
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
