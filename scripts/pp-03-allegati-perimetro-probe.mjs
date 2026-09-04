/**
 * Attacco ostile PP-03 — documenti/allegati: il perimetro di CATEGORIA
 * dell'allenatore base sul fascicolo e sui byte.
 *
 *   EASYGAME_DB_ENV=development node --experimental-strip-types \
 *     --import ./tests/helpers/register-hooks.mjs \
 *     scripts/pp-03-allegati-perimetro-probe.mjs
 *
 * Ipotesi: l'elenco atleti (resources.ts, perimetro da clubs.trainers) nega a
 * MISTER_A l'atleta di categoria B. Ma il fascicolo documentale
 * (getDocumentDossier) e gli allegati (readAttachment) applicano il perimetro
 * via `athleteIdsWithinAccessScope`, che legge SOLO `scope.accessScopes` (le
 * righe di ruolo personalizzato) e NON `clubs.trainers.categories`. Per un
 * allenatore base senza righe di scope, quel perimetro e "tutto il club".
 *
 * Attesa dell'attaccante: MISTER_A (solo categoria A) legge il fascicolo e
 * scarica un documento NON clinico dell'atleta di categoria B.
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
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(70)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (nota) console.log(`        ${nota}`);
};

const CLUB = randomUUID();
const SEDE_1 = "sede-nord";
const CAT_A = "cat-a";
const CAT_B = "cat-b";
const ATLETA_A = randomUUID();
const ATLETA_B = randomUUID();

let PRESIDENTE = null;
let MISTER_A = null;
let attachments = null;

let SESSIONE = null;
let CLUB_ATTIVO = null;
let RUOLO_ATTIVO = null;
let rotte = null;

const scope = (activeRole, userId, accessScopes = [], org = CLUB) => ({
  userId,
  activeOrganizationId: org,
  activeRole,
  activeMembershipId: null,
  allowedOrganizationIds: [org],
  accessScopes,
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
      password_hash: "$2b$10$pp03doc",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const preparaTrasporto = async () => {
  rotte = {
    docList: await carica("src/app/api/athletes/[athleteId]/documents/route.ts"),
    attById: await carica("src/app/api/v1/attachments/[id]/route.ts"),
    athletes: await carica("src/app/api/v1/[resource]/route.ts"),
    athleteById: await carica("src/app/api/v1/[resource]/[id]/route.ts"),
  };
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
    const p = url.pathname;
    // /api/athletes/:athleteId/documents
    let m = p.match(/^\/api\/athletes\/([^/]+)\/documents$/);
    if (m) return rotte.docList[metodo](richiesta, { params: { athleteId: m[1] } });
    // /api/v1/attachments/:id
    m = p.match(/^\/api\/v1\/attachments\/([^/]+)$/);
    if (m) return rotte.attById[metodo](richiesta, { params: { id: m[1] } });
    // /api/v1/:resource/:id
    m = p.match(/^\/api\/v1\/([^/]+)\/([^/]+)$/);
    if (m) return rotte.athleteById[metodo](richiesta, { params: { resource: m[1], id: m[2] } });
    // /api/v1/:resource
    m = p.match(/^\/api\/v1\/([^/]+)$/);
    if (m) return rotte.athletes[metodo](richiesta, { params: { resource: m[1] } });
    throw new Error(`Nessun handler per ${p}`);
  };
};

const comeUtente = async (utenteRiga, ruolo, accessRole) => {
  const auth = await carica("src/lib/server/auth.ts");
  const sessione = await auth.createSessionForUser(utenteRiga);
  SESSIONE = sessione.access_token;
  CLUB_ATTIVO = CLUB;
  RUOLO_ATTIVO = accessRole || ruolo;
};

const chiama = async (percorso, init) => {
  const risposta = await globalThis.fetch(percorso, init);
  const testo = await risposta.text();
  let corpo = null;
  try { corpo = JSON.parse(testo); } catch { corpo = { raw: testo.slice(0, 120) }; }
  return { stato: risposta.status, corpo, contentType: risposta.headers.get("content-type") };
};

const pulisciResidui = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp03-doc-" } },
    select: { id: true },
  });
  const ids = residui.map((r) => r.id);
  if (!ids.length) return;
  await prisma.auditLog.deleteMany({ where: { organization_id: { in: ids } } }).catch(() => {});
  await prisma.club.deleteMany({ where: { id: { in: ids } } });
};

let ATT_B_NON_CLINICO = null;
let ATT_B_CLINICO = null;

const semina = async () => {
  await pulisciResidui();
  PRESIDENTE = await utente("pp03-doc-pres@example.invalid", "Anna");
  MISTER_A = await utente("pp03-doc-a@example.invalid", "Aldo");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `pp03-doc-${Date.now()}`,
      name: "ASD DOC",
      creator_id: PRESIDENTE.id,
      settings: {
        seasons: [
          { id: "2026-27", label: "2026/27", startDate: "2026-07-01", endDate: "2027-06-30", status: "active" },
        ],
      },
      categories: [
        { id: CAT_A, name: "Under 12" },
        { id: CAT_B, name: "Under 15" },
      ],
      club_sites: [{ id: SEDE_1, name: "Sede Nord", active: true }],
      category_groups: [],
      structures: [],
      trainers: [
        { id: "tr-a", first_name: "Aldo", last_name: "Collaudo", email: MISTER_A.email, linkedUserId: MISTER_A.id, categories: [CAT_A], groups: [] },
      ],
      staff_members: [],
      trainings: [],
      matches: [],
      updated_at: new Date(),
    },
  });

  for (const [u, ruolo] of [[MISTER_A, "trainer"], [PRESIDENTE, "owner"]]) {
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

  attachments = await carica("src/lib/server/attachments.ts");
  const ownerScope = scope("owner", PRESIDENTE.id);

  // Un documento NON clinico dell'atleta B (carta d'identita).
  const a1 = await attachments.createAttachment(
    {
      organizationId: CLUB,
      ownerType: "athlete",
      ownerId: ATLETA_B,
      category: "documento-identita",
      fileName: "carta-identita-bruna.pdf",
      mimeType: "application/pdf",
      content: Buffer.from("SEGRETO-CARTA-IDENTITA-B", "utf8"),
    },
    ownerScope,
  );
  ATT_B_NON_CLINICO = a1.id;

  // Un documento clinico dell'atleta B (certificato medico).
  const a2 = await attachments.createAttachment(
    {
      organizationId: CLUB,
      ownerType: "athlete",
      ownerId: ATLETA_B,
      category: "certificato_medico",
      fileName: "certificato-bruna.pdf",
      mimeType: "application/pdf",
      content: Buffer.from("SEGRETO-CERTIFICATO-MEDICO-B", "utf8"),
    },
    ownerScope,
  );
  ATT_B_CLINICO = a2.id;

  await preparaTrasporto();
};

const pulisci = async () => {
  await prisma.auditLog.deleteMany({ where: { organization_id: CLUB } }).catch(() => {});
  await prisma.attachment.deleteMany({ where: { organization_id: CLUB } }).catch(() => {});
  await prisma.club.deleteMany({ where: { id: CLUB } }).catch((e) => {
    console.error(`Pulizia non riuscita: ${e?.message}`);
  });
};

const main = async () => {
  console.log("Sonda ostile PP-03 — documenti/allegati, perimetro di categoria");
  try {
    await semina();
    await comeUtente(MISTER_A, "trainer");

    // Sanity: l'elenco atleti NON porta l'atleta B (perimetro resources.ts).
    const elenco = await chiama("/api/v1/athletes");
    const ids = (elenco.corpo?.data || []).map((r) => r.id);
    prova("SANITY · l'elenco atleti non porta l'atleta di categoria B", false, ids.includes(ATLETA_B),
      `ids: ${JSON.stringify(ids)}`);

    // Attacco 1: il fascicolo documentale dell'atleta B.
    const dossier = await chiama(`/api/athletes/${ATLETA_B}/documents`);
    const docTesto = JSON.stringify(dossier.corpo?.data || dossier.corpo);
    prova("DOC-01 · il fascicolo dell'atleta B e negato all'allenatore di A",
      true, dossier.stato === 403,
      `stato ${dossier.stato} · corpo ${docTesto.slice(0, 160)}`);

    // Attacco 2: i byte del documento NON clinico dell'atleta B.
    const nonClin = await chiama(`/api/v1/attachments/${ATT_B_NON_CLINICO}`);
    const uscito = typeof nonClin.corpo?.raw === "string" ? nonClin.corpo.raw : JSON.stringify(nonClin.corpo);
    prova("DOC-02 · i byte del documento NON clinico dell'atleta B sono negati",
      true, nonClin.stato === 403 || nonClin.stato === 404,
      `stato ${nonClin.stato} · content-type ${nonClin.contentType} · uscito ${String(uscito).slice(0, 80)}`);

    // Attacco 3: i byte del certificato medico dell'atleta B (deve essere negato per clinical.read).
    const clin = await chiama(`/api/v1/attachments/${ATT_B_CLINICO}`);
    prova("DOC-03 · i byte del certificato medico dell'atleta B sono negati",
      true, clin.stato === 403 || clin.stato === 404,
      `stato ${clin.stato}`);
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
    console.log(`${NL}Attacchi RIUSCITI o anomalie (difetti):`);
    for (const e of falliti) console.log(`  - ${e.titolo}`);
  }
  process.exit(falliti.length ? 1 : 0);
};

main();
