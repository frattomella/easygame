/**
 * Collaudo a runtime del **passaggio di stagione**, sull'applicazione vera.
 *
 * **Perche esiste, visto che i test sono verdi.** Perche i test di dominio
 * girano su un doppio di Prisma e su uno scope costruito a mano: provano le
 * regole, non il prodotto. Il difetto G-01 e nato proprio cosi — il riporto
 * funzionava, e non portava le persone; nessun test lo vedeva perche nessun
 * test chiedeva delle persone. Questo script parla HTTP con l'applicazione in
 * ascolto, con un cookie di sessione vero, e passa dalle stesse rotte del
 * browser.
 *
 * Copre gli scenari 1-8, 14-22 e 33-35 del §10 di
 * `docs/knowledge-base/31-wave-1-planning.md`.
 *
 *     node scripts/season-rollover-uat.mjs --base=http://127.0.0.1:3010
 *     node scripts/season-rollover-uat.mjs --athletes=200
 *     node scripts/season-rollover-uat.mjs --keep     # non ripulisce
 *
 * **Scrive**, e scrive parecchio: crea un club QA con due sedi, tre categorie,
 * sei gruppi, duecento atleti e le loro appartenenze. Si rifiuta di partire se
 * `EASYGAME_DB_ENV` non e `development`. Tutto cio che crea porta il prefisso
 * `UAT-SR`, cosi si riconosce e si ripulisce; il club QA viene distrutto alla
 * fine, e i due club preesistenti del database di sviluppo non vengono toccati
 * ne in lettura ne in scrittura.
 */

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const BASE =
  (args.find((arg) => arg.startsWith("--base=")) || "").split("=")[1] ||
  "http://127.0.0.1:3010";
const KEEP = args.includes("--keep");
const ATHLETES = Number(
  (args.find((arg) => arg.startsWith("--athletes=")) || "").split("=")[1] || 200,
);
const CONFIRMED = Number(
  (args.find((arg) => arg.startsWith("--confirmed=")) || "").split("=")[1] || 180,
);

const DB_ENV = String(process.env.EASYGAME_DB_ENV || "").trim();
if (DB_ENV !== "development") {
  console.error(
    `Rifiuto di scrivere: EASYGAME_DB_ENV vale "${DB_ENV || "(vuoto)"}", non "development".`,
  );
  process.exit(1);
}

const prisma = new PrismaClient();

/* ------------------------------------------------------------ esiti */

const results = [];
let currentGroup = "";

const group = (name) => {
  currentGroup = name;
  console.log(`\n── ${name}`);
};

const check = (name, condition, detail = "") => {
  const ok = Boolean(condition);
  results.push({ group: currentGroup, name, ok, detail });
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
};

const measures = [];
const measure = (name, ms, detail = "") => {
  measures.push({ name, ms, detail });
  console.log(`   ····  ${name}: ${ms} ms${detail ? ` — ${detail}` : ""}`);
};

/* ------------------------------------------------------------ trasporto */

const call = async (token, path, options = {}) => {
  const started = Date.now();
  const response = await fetch(`${BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      ...(token ? { cookie: `easygame_session=${token}` } : {}),
      ...(options.clubId ? { "x-active-club-id": options.clubId } : {}),
      ...(options.role ? { "x-active-access-role": options.role } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  const raw = await response.text();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }

  return {
    status: response.status,
    data: payload?.data,
    error: payload?.error,
    bytes: raw.length,
    ms: Date.now() - started,
  };
};

const createSession = async (userId) => {
  const token = `uat-sr-${randomUUID()}`;
  await prisma.session.create({
    data: {
      token,
      user_id: userId,
      expires_at: new Date(Date.now() + 6 * 3600_000),
    },
  });
  return token;
};

/* ------------------------------------------------------------ dataset QA */

const makeClub = async (label) => {
  const stamp = Date.now().toString(36);
  const email = `uat-sr-${label}-${stamp}@easygame.test`;

  const user = await prisma.user.create({
    data: {
      email,
      password_hash: "uat-sr-non-una-password",
      first_name: "UAT-SR",
      last_name: label.toUpperCase(),
    },
  });

  const club = await prisma.club.create({
    data: {
      name: `UAT-SR Club ${label} ${stamp}`,
      slug: `uat-sr-club-${label}-${stamp}`,
      creator_id: user.id,
      settings: {},
    },
  });

  await prisma.organizationUser.create({
    data: { organization_id: club.id, user_id: user.id, role: "owner" },
  });

  return { club, user };
};

const seedAthletes = async (clubId, categoryIds, siteIds, total) => {
  const athletes = [];
  for (let index = 0; index < total; index += 1) {
    athletes.push({
      id: randomUUID(),
      organization_id: clubId,
      first_name: `Atleta${String(index + 1).padStart(3, "0")}`,
      last_name: `UAT-SR ${["Rossi", "Bianchi", "Nicolò", "D'Angelo"][index % 4]}`,
      status: "active",
    });
  }
  await prisma.athlete.createMany({ data: athletes });

  const memberships = athletes.map((athlete, index) => ({
    id: randomUUID(),
    organization_id: clubId,
    athlete_id: athlete.id,
    category_id: categoryIds[index % categoryIds.length],
    category_name: null,
    site_id: siteIds[index % siteIds.length],
    is_primary: true,
  }));
  await prisma.athleteCategoryMembership.createMany({ data: memberships });

  // La colonna storica parte allineata, come su un club vero.
  for (const categoryId of categoryIds) {
    const ids = memberships
      .filter((membership) => membership.category_id === categoryId)
      .map((membership) => membership.athlete_id);
    await prisma.athlete.updateMany({
      where: { organization_id: clubId, id: { in: ids } },
      data: { category_id: categoryId },
    });
  }

  return { athletes, memberships };
};

const cleanup = async (clubIds) => {
  for (const clubId of clubIds) {
    if (!clubId) continue;
    await prisma.athleteCategoryMembership.deleteMany({
      where: { organization_id: clubId },
    });
    await prisma.athlete.deleteMany({ where: { organization_id: clubId } });
    await prisma.clubResourceItem.deleteMany({
      where: { organization_id: clubId },
    });
    await prisma.auditLog.deleteMany({ where: { organization_id: clubId } });
    await prisma.organizationUser.deleteMany({
      where: { organization_id: clubId },
    });
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { creator_id: true },
    });
    await prisma.club.delete({ where: { id: clubId } }).catch(() => {});
    if (club?.creator_id) {
      await prisma.session.deleteMany({ where: { user_id: club.creator_id } });
      await prisma.user.delete({ where: { id: club.creator_id } }).catch(() => {});
    }
  }
  await prisma.session.deleteMany({ where: { token: { startsWith: "uat-sr-" } } });
};

/* ------------------------------------------------------------ scenari */

const run = async () => {
  // Un giro interrotto lascia il suo club QA: si toglie prima di contare, o il
  // conteggio finale direbbe che la pulizia non ha funzionato.
  const residui = await prisma.club.findMany({
    where: { name: { startsWith: "UAT-SR Club" } },
    select: { id: true },
  });
  if (residui.length) {
    console.log(`Rimuovo ${residui.length} club QA di un giro precedente`);
    await cleanup(residui.map((row) => row.id));
  }

  const preesistenti = await prisma.club.count();
  const atletiPreesistenti = await prisma.athlete.count();

  const { club: clubA, user: ownerA } = await makeClub("a");
  const { club: clubB } = await makeClub("b");

  const tokenA = await createSession(ownerA.id);
  const ownerB = await prisma.organizationUser.findFirst({
    where: { organization_id: clubB.id, role: "owner" },
  });
  const tokenB = await createSession(ownerB.user_id);

  const A = (path, options = {}) =>
    call(tokenA, path, { clubId: clubA.id, role: "owner", ...options });
  const AasTrainer = (path, options = {}) =>
    call(tokenA, path, { clubId: clubA.id, role: "trainer", ...options });
  const B = (path, options = {}) =>
    call(tokenB, path, { clubId: clubB.id, role: "owner", ...options });

  console.log(`Collaudo su ${BASE}`);
  console.log(`Club QA A: ${clubA.name} (${clubA.id})`);
  console.log(`Club QA B: ${clubB.name} (${clubB.id})`);

  /* ============================================ 0. la stagione di partenza */

  group("0 — Dataset QA: due sedi, tre categorie, sei gruppi, atleti");

  const seasonA = await A("/api/v1/seasons", {
    method: "POST",
    body: {
      label: "UAT-SR 2026/2027",
      startDate: "2026-07-01",
      endDate: "2027-06-30",
      activate: true,
    },
  });
  check(
    "la prima stagione si crea e diventa attiva",
    seasonA.status === 200 && seasonA.data?.season?.id,
    `HTTP ${seasonA.status} ${seasonA.error?.message || ""}`,
  );
  const seasonAId = seasonA.data?.season?.id;

  const sites = [];
  for (const name of ["UAT-SR Sede Nord", "UAT-SR Sede Sud"]) {
    const created = await A("/api/v1/club_sites", {
      method: "POST",
      body: { name, city: "Bologna" },
    });
    sites.push(created.data?.id);
  }
  check("due sedi create", sites.filter(Boolean).length === 2, sites.join(", "));

  const categories = [];
  for (const name of ["UAT-SR Under 12", "UAT-SR Under 14", "UAT-SR Under 16"]) {
    const created = await A("/api/v1/categories", {
      method: "POST",
      body: { name, seasonId: seasonAId },
    });
    categories.push(created.data?.id);
  }
  check(
    "tre categorie create nella stagione attiva",
    categories.filter(Boolean).length === 3,
    categories.join(", "),
  );

  let groups = 0;
  const gruppiFalliti = [];
  for (const categoryId of categories) {
    for (const siteId of sites) {
      const created = await A("/api/v1/category_groups", {
        method: "POST",
        body: {
          name: `UAT-SR ${categoryId.slice(0, 4)}-${siteId.slice(0, 4)}`,
          categoryId,
          siteId,
          seasonId: seasonAId,
        },
      });
      if (created.status === 200 || created.status === 201) {
        groups += 1;
      } else {
        gruppiFalliti.push(`HTTP ${created.status}: ${created.error?.message || ""}`);
      }
    }
  }
  check("sei gruppi operativi creati", groups === 6, gruppiFalliti.join(" · ") || `${groups}`);

  const seeded = await seedAthletes(clubA.id, categories, sites, ATHLETES);
  check(
    `${ATHLETES} atleti con appartenenza e sede`,
    seeded.athletes.length === ATHLETES,
    `${seeded.memberships.length} appartenenze`,
  );

  /* ============================================ elenco di riconferma */

  group("1 — L'elenco di riconferma");

  const roster = await A(`/api/v1/seasons/${seasonAId}/roster`);
  check(
    "l'elenco di riconferma risponde e nomina tutti i tesserati",
    roster.status === 200 && roster.data?.total === ATHLETES,
    `HTTP ${roster.status}, total ${roster.data?.total}`,
  );
  check(
    "ogni tesserato porta la sua squadra e la sua sede",
    (roster.data?.athletes || []).every(
      (athlete) =>
        athlete.memberships.length > 0 &&
        athlete.memberships[0].categoryName &&
        athlete.memberships[0].siteId,
    ),
  );
  measure(
    `elenco di riconferma con ${ATHLETES} righe`,
    roster.ms,
    `${Math.round(roster.bytes / 1024)} kB`,
  );

  const rosterIds = (roster.data?.athletes || []).map((a) => a.athleteId);
  const confermati = rosterIds.slice(0, CONFIRMED);
  const esclusi = rosterIds.slice(CONFIRMED);

  /* ============================================ 2. il riporto */

  group(`2 — Il riporto: ${CONFIRMED} riconfermati, ${esclusi.length} no`);

  const started = Date.now();
  const seasonB = await A("/api/v1/seasons", {
    method: "POST",
    body: {
      label: "UAT-SR 2027/2028",
      startDate: "2027-07-01",
      endDate: "2028-06-30",
      activate: true,
      rollover: {
        sourceSeasonId: seasonAId,
        types: [
          "categories",
          "category_groups",
          "discounts",
          "payment_plans",
          "jersey_groups",
          "athlete_memberships",
        ],
        athleteIds: confermati,
      },
    },
  });
  const rolloverMs = Date.now() - started;

  check(
    "la stagione nuova si crea con il riporto",
    seasonB.status === 200 && seasonB.data?.rollover,
    `HTTP ${seasonB.status} ${seasonB.error?.message || ""}`,
  );
  const seasonBId = seasonB.data?.season?.id;
  const summary = seasonB.data?.rollover;
  measure(`riporto con ${ATHLETES} tesserati`, rolloverMs);

  check(
    "il riepilogo dichiara i tesserati proposti",
    summary?.athletes?.proposed === ATHLETES,
    `proposti ${summary?.athletes?.proposed}`,
  );
  check(
    "il riepilogo dichiara i riconfermati",
    summary?.athletes?.confirmed === CONFIRMED,
    `riconfermati ${summary?.athletes?.confirmed}`,
  );
  check(
    "il riepilogo dichiara chi resta fuori",
    summary?.athletes?.notConfirmed === ATHLETES - CONFIRMED,
    `non riconfermati ${summary?.athletes?.notConfirmed}`,
  );
  check(
    "le appartenenze create sono quelle dei riconfermati",
    summary?.athletes?.created === CONFIRMED,
    `create ${summary?.athletes?.created}`,
  );
  check(
    "il riepilogo elenca i tesserati fra i tipi riportati",
    (summary?.entries || []).some((entry) => entry.type === "athlete_memberships"),
  );

  /* ============================================ 3. la verifica sulle righe */

  group("3 — Le righe: mappatura, sede, storico");

  const catB = await prisma.clubResourceItem.findMany({
    where: { organization_id: clubA.id, resource_type: "categories" },
  });
  const nuoveCategorie = catB.filter(
    (row) => row.payload?.seasonId === seasonBId,
  );
  check(
    "tre categorie nuove nella stagione B",
    nuoveCategorie.length === 3,
    `${nuoveCategorie.length}`,
  );

  const mappa = new Map(
    nuoveCategorie.map((row) => [row.payload?.rolloverSourceId, row.payload?.id]),
  );
  check(
    "ogni categoria nuova cita quella di origine",
    categories.every((id) => mappa.has(id)),
  );

  const nuoveAppartenenze = await prisma.athleteCategoryMembership.findMany({
    where: {
      organization_id: clubA.id,
      category_id: { in: [...mappa.values()] },
    },
  });
  check(
    `${CONFIRMED} appartenenze nella stagione nuova`,
    nuoveAppartenenze.length === CONFIRMED,
    `${nuoveAppartenenze.length}`,
  );

  const originali = new Map(
    seeded.memberships.map((membership) => [membership.athlete_id, membership]),
  );
  const sbagliati = nuoveAppartenenze.filter((riga) => {
    const origine = originali.get(riga.athlete_id);
    return (
      !origine ||
      mappa.get(origine.category_id) !== riga.category_id ||
      origine.site_id !== riga.site_id
    );
  });
  check(
    "nessun tesserato finisce nella squadra sbagliata, e la sede non cambia",
    sbagliati.length === 0,
    `${sbagliati.length} righe fuori posto`,
  );

  const esclusiConNuova = nuoveAppartenenze.filter((riga) =>
    esclusi.includes(riga.athlete_id),
  );
  check(
    "chi non e stato riconfermato non compare nella stagione nuova",
    esclusiConNuova.length === 0,
    `${esclusiConNuova.length}`,
  );

  const storiche = await prisma.athleteCategoryMembership.findMany({
    where: { organization_id: clubA.id, category_id: { in: categories } },
  });
  check(
    "lo storico e intatto: nessuna appartenenza di origine cancellata",
    storiche.length === ATHLETES,
    `${storiche.length} su ${ATHLETES}`,
  );
  const storicheRimappate = storiche.filter(
    (riga) => originali.get(riga.athlete_id)?.category_id !== riga.category_id,
  );
  check(
    "nessuna appartenenza di origine e stata rimappata",
    storicheRimappate.length === 0,
  );

  const primariePerAtleta = await prisma.athleteCategoryMembership.groupBy({
    by: ["athlete_id"],
    where: { organization_id: clubA.id, is_primary: true },
    _count: { _all: true },
  });
  const doppiePrimarie = primariePerAtleta.filter(
    (riga) => riga._count._all > 1,
  );
  check(
    "nessun atleta ha due appartenenze primarie",
    doppiePrimarie.length === 0,
    `${doppiePrimarie.length}`,
  );

  const schedaAllineata = await prisma.athlete.count({
    where: {
      organization_id: clubA.id,
      id: { in: confermati },
      category_id: { in: [...mappa.values()] },
    },
  });
  check(
    "la scheda dei riconfermati cita la categoria della stagione nuova",
    schedaAllineata === CONFIRMED,
    `${schedaAllineata} su ${CONFIRMED}`,
  );
  const schedaEsclusi = await prisma.athlete.count({
    where: {
      organization_id: clubA.id,
      id: { in: esclusi },
      category_id: { in: categories },
    },
  });
  check(
    "la scheda di chi resta fuori non viene riscritta",
    schedaEsclusi === esclusi.length,
    `${schedaEsclusi} su ${esclusi.length}`,
  );

  /* ============================================ 4. l'elenco atleti filtrato */

  group("4 — Il controllo che al §1 del planning rispondeva zero");

  let trovatiPerCategoria = 0;
  for (const nuovaCategoria of mappa.values()) {
    const list = await A(
      `/api/v1/athletes?category_id=${encodeURIComponent(nuovaCategoria)}&limit=500`,
    );
    const rows = Array.isArray(list.data) ? list.data : list.data?.items || [];
    trovatiPerCategoria += rows.length;
  }
  check(
    "l'elenco atleti filtrato per la categoria nuova risponde con i tesserati",
    trovatiPerCategoria === CONFIRMED,
    `${trovatiPerCategoria} su ${CONFIRMED}`,
  );

  const overview = await A("/api/v1/seasons");
  check(
    "il riepilogo stagioni conta gli atleti senza squadra",
    overview.data?.athletesWithoutTeam === ATHLETES - CONFIRMED,
    `${overview.data?.athletesWithoutTeam}`,
  );
  measure("riepilogo stagioni", overview.ms);

  /* ============================================ 5. idempotenza */

  group("5 — Rieseguire il riporto, e due riporti insieme");

  const secondo = await A(`/api/v1/seasons/${seasonBId}/rollover`, {
    method: "POST",
    body: {
      sourceSeasonId: seasonAId,
      types: ["categories", "category_groups", "athlete_memberships"],
      athleteIds: confermati,
    },
  });
  check(
    "il secondo riporto non crea niente",
    secondo.status === 200 && secondo.data?.athletes?.created === 0,
    `create ${secondo.data?.athletes?.created}, gia presenti ${secondo.data?.athletes?.alreadyPresent}`,
  );

  const dopoSecondo = await prisma.athleteCategoryMembership.count({
    where: {
      organization_id: clubA.id,
      category_id: { in: [...mappa.values()] },
    },
  });
  check(
    "nessun duplicato dopo il secondo riporto",
    dopoSecondo === CONFIRMED,
    `${dopoSecondo}`,
  );

  const seasonC = await A("/api/v1/seasons", {
    method: "POST",
    body: {
      label: "UAT-SR 2028/2029",
      startDate: "2028-07-01",
      endDate: "2029-06-30",
    },
  });
  const seasonCId = seasonC.data?.season?.id;

  const [par1, par2] = await Promise.all([
    A(`/api/v1/seasons/${seasonCId}/rollover`, {
      method: "POST",
      body: {
        sourceSeasonId: seasonAId,
        types: ["categories", "athlete_memberships"],
        athleteIds: confermati,
      },
    }),
    A(`/api/v1/seasons/${seasonCId}/rollover`, {
      method: "POST",
      body: {
        sourceSeasonId: seasonAId,
        types: ["categories", "athlete_memberships"],
        athleteIds: confermati,
      },
    }),
  ]);

  const catC = await prisma.clubResourceItem.findMany({
    where: { organization_id: clubA.id, resource_type: "categories" },
  });
  const categorieC = catC.filter((row) => row.payload?.seasonId === seasonCId);
  const appartenenzeC = await prisma.athleteCategoryMembership.count({
    where: {
      organization_id: clubA.id,
      category_id: { in: categorieC.map((row) => row.payload?.id) },
    },
  });
  check(
    "due riporti simultanei non duplicano le categorie",
    categorieC.length === 3,
    `${categorieC.length}`,
  );
  check(
    "due riporti simultanei non duplicano le appartenenze",
    appartenenzeC <= CONFIRMED,
    `${appartenenzeC} (atteso al massimo ${CONFIRMED}); HTTP ${par1.status}/${par2.status}`,
  );
  for (const [indice, esito] of [par1, par2].entries()) {
    if (esito.status === 200) continue;
    check(
      `il riporto simultaneo ${indice + 1} che perde la corsa dice di riprovare`,
      esito.status === 409 &&
        /riprova/i.test(String(esito.error?.message || "")) &&
        !/prisma|invocation|P20\d\d/i.test(String(esito.error?.message || "")),
      `HTTP ${esito.status}: ${esito.error?.message || "(nessun messaggio)"}`,
    );
  }

  /* ============================================ 5-bis. la regressione */

  group("5-bis — Il riporto della sola configurazione, come prima");

  const appartenenzePrima = await prisma.athleteCategoryMembership.count({
    where: { organization_id: clubA.id },
  });

  const soloConfigurazione = await A("/api/v1/seasons", {
    method: "POST",
    body: {
      label: "UAT-SR 2029/2030",
      startDate: "2029-07-01",
      endDate: "2030-06-30",
      rollover: {
        sourceSeasonId: seasonAId,
        types: ["categories", "category_groups"],
      },
    },
  });

  check(
    "riportare la sola configurazione continua a funzionare",
    soloConfigurazione.status === 200 &&
      soloConfigurazione.data?.rollover?.createdTotal >= 3,
    `HTTP ${soloConfigurazione.status}, ${soloConfigurazione.data?.rollover?.createdTotal} elementi`,
  );
  check(
    "e dichiara comunque i tesserati, invece di tacere",
    soloConfigurazione.data?.rollover?.athletes?.requested === false &&
      soloConfigurazione.data?.rollover?.athletes?.proposed === ATHLETES &&
      soloConfigurazione.data?.rollover?.athletes?.carried === 0,
    JSON.stringify(soloConfigurazione.data?.rollover?.athletes || {}),
  );
  check(
    "senza il tipo «tesserati» non si scrive nemmeno un'appartenenza",
    (await prisma.athleteCategoryMembership.count({
      where: { organization_id: clubA.id },
    })) === appartenenzePrima,
    `${appartenenzePrima} prima`,
  );

  /* ============================================ 6. tornare indietro */

  group("6 — Riattivare la stagione di origine");

  const riattiva = await A(`/api/v1/seasons/${seasonAId}`, {
    method: "PATCH",
    body: { action: "activate" },
  });
  check("la stagione di origine si riattiva", riattiva.status === 200);

  let trovatiOrigine = 0;
  for (const categoryId of categories) {
    const list = await A(
      `/api/v1/athletes?category_id=${encodeURIComponent(categoryId)}&limit=500`,
    );
    const rows = Array.isArray(list.data) ? list.data : list.data?.items || [];
    trovatiOrigine += rows.length;
  }
  check(
    "tornando alla stagione di origine i tesserati sono ancora tutti li",
    trovatiOrigine === ATHLETES,
    `${trovatiOrigine} su ${ATHLETES}`,
  );

  /* ============================================ 7. permessi e confine */

  group("7 — Permessi, confine di club, tracce");

  const anonimo = await call(null, "/api/v1/seasons");
  check("senza sessione si risponde 401", anonimo.status === 401, `HTTP ${anonimo.status}`);

  const daAllenatore = await AasTrainer("/api/v1/seasons", {
    method: "POST",
    body: { label: "UAT-SR abusiva", startDate: "2030-07-01", endDate: "2031-06-30" },
  });
  check(
    "un allenatore non crea una stagione",
    daAllenatore.status === 403,
    `HTTP ${daAllenatore.status}`,
  );
  check(
    "il diniego dice «Accesso negato», non un messaggio dell'ORM",
    String(daAllenatore.error?.message || "").includes("Accesso negato"),
    daAllenatore.error?.message,
  );

  const dinieghi = await prisma.auditLog.findMany({
    where: {
      organization_id: clubA.id,
      action: "resource.access.denied",
      resource: "seasons",
    },
  });
  check(
    "il diniego finisce in audit_logs con il nome del permesso",
    dinieghi.length > 0 && dinieghi.some((row) => row.metadata?.permission === "seasons.change"),
    `${dinieghi.length} tracce`,
  );

  const crossTenant = await call(tokenB, "/api/v1/seasons", {
    clubId: clubA.id,
    role: "owner",
    method: "POST",
    body: {
      label: "UAT-SR intrusione",
      startDate: "2030-07-01",
      endDate: "2031-06-30",
      rollover: { sourceSeasonId: seasonAId, types: ["categories"] },
    },
  });
  const stagioniDiB = await prisma.club.findUnique({
    where: { id: clubB.id },
    select: { settings: true },
  });
  check(
    "il club B non riesce a riportare dentro il club A",
    crossTenant.status !== 200 ||
      !String(JSON.stringify(stagioniDiB?.settings || {})).includes("UAT-SR 2026"),
    `HTTP ${crossTenant.status}`,
  );

  const appartenenzeDiB = await prisma.athleteCategoryMembership.count({
    where: { organization_id: clubB.id },
  });
  check(
    "nessuna appartenenza e finita nel club B",
    appartenenzeDiB === 0,
    `${appartenenzeDiB}`,
  );

  const rosterAltrui = await B(`/api/v1/seasons/${seasonAId}/roster`);
  check(
    "l'elenco di riconferma di un'altra organizzazione non si legge",
    rosterAltrui.status !== 200 || (rosterAltrui.data?.total || 0) === 0,
    `HTTP ${rosterAltrui.status}, total ${rosterAltrui.data?.total}`,
  );

  /* ============================================ 8. le validazioni nuove */

  group("8 — Le due bugie che il riporto non dice piu");

  const senzaCategorie = await A(`/api/v1/seasons/${seasonBId}/rollover`, {
    method: "POST",
    body: { sourceSeasonId: seasonAId, types: ["athlete_memberships"] },
  });
  check(
    "riportare i tesserati senza le categorie viene rifiutato",
    senzaCategorie.status === 400,
    `HTTP ${senzaCategorie.status}: ${senzaCategorie.error?.message || ""}`,
  );

  const stagioniPrima = (await A("/api/v1/seasons")).data?.seasons?.length || 0;
  const richiestaIncoerente = await A("/api/v1/seasons", {
    method: "POST",
    body: {
      label: "UAT-SR stagione fantasma",
      startDate: "2033-07-01",
      endDate: "2034-06-30",
      activate: true,
      rollover: {
        sourceSeasonId: seasonAId,
        types: ["athlete_memberships"],
      },
    },
  });
  const stagioniDopo = (await A("/api/v1/seasons")).data?.seasons?.length || 0;

  check(
    "un riporto incoerente viene rifiutato prima di creare la stagione",
    richiestaIncoerente.status === 400,
    `HTTP ${richiestaIncoerente.status}: ${richiestaIncoerente.error?.message || ""}`,
  );
  check(
    "e non lascia una stagione vuota e attiva dietro di se",
    stagioniDopo === stagioniPrima,
    `${stagioniPrima} stagioni prima, ${stagioniDopo} dopo`,
  );

  const senzaTipi = await A("/api/v1/seasons", {
    method: "POST",
    body: {
      label: "UAT-SR riporto muto",
      startDate: "2031-07-01",
      endDate: "2032-06-30",
      rollover: { sourceSeasonId: seasonAId },
    },
  });
  check(
    "chiedere un riporto senza dire cosa non risponde piu 200 in silenzio",
    senzaTipi.status === 400,
    `HTTP ${senzaTipi.status}: ${senzaTipi.error?.message || ""}`,
  );

  /* ============================================ pulizia */

  if (!KEEP) {
    group("9 — Pulizia");
    await cleanup([clubA.id, clubB.id]);
    const clubResidui = await prisma.club.count();
    const atletiResidui = await prisma.athlete.count();
    check(
      "il database di sviluppo torna al numero di club di partenza",
      clubResidui === preesistenti,
      `${clubResidui} club (partenza ${preesistenti})`,
    );
    check(
      "nessun atleta QA residuo",
      atletiResidui === atletiPreesistenti,
      `${atletiResidui} atleti (partenza ${atletiPreesistenti})`,
    );
  } else {
    console.log("\n(--keep: i club QA restano nel database di sviluppo)");
  }

  /* ============================================ esito */

  const failed = results.filter((row) => !row.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} controlli superati`,
  );
  if (measures.length) {
    console.log("\nMisure:");
    for (const row of measures) {
      console.log(`  ${row.name}: ${row.ms} ms${row.detail ? ` (${row.detail})` : ""}`);
    }
  }
  if (failed.length) {
    console.log("\nFalliti:");
    for (const row of failed) {
      console.log(`  [${row.group}] ${row.name}${row.detail ? ` — ${row.detail}` : ""}`);
    }
  }

  return failed.length;
};

run()
  .then(async (failed) => {
    await prisma.$disconnect();
    process.exit(failed ? 1 : 0);
  })
  .catch(async (error) => {
    console.error("\nCollaudo interrotto:", error);
    await prisma.$disconnect();
    process.exit(2);
  });
