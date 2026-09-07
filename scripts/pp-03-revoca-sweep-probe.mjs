/**
 * **La revoca che non slega: sonda su PostgreSQL vero.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs scripts/pp-03-revoca-sweep-probe.mjs
 *
 * ---
 *
 * ## Cosa misura
 *
 * `revokeClubAccess` cancella la tessera e poi chiama quattro scope
 * (`profile-account-links.ts`) perche nessun riferimento a quell'utenza
 * sopravviva nel club. I quattro decidevano se toccare qualcosa confrontando
 * `organization_users.role` con insiemi di stringhe scritti a mano. Due cose
 * quel confronto non le sapeva:
 *
 * 1. **Un ruolo personalizzato porta uno slug** (ADR-0102): in colonna c'e
 *    `custom:trainer:preparatori`, e nessun insieme lo conteneva. La tessera
 *    spariva, la scheda restava «Account collegato».
 * 2. **Gli alias canonici vivono in `access-roles.ts`**, e le copie locali ne
 *    avevano perse per strada: `tutor`, `giocatore`, `allenatrice`,
 *    `segreteria`, `amministratore`, `membro`.
 *
 * Questa sonda usa il **dominio vero** (`createClubRole`, `assignClubRole`,
 * `revokeClubAccess`) contro il database della lane, e guarda le colonne dopo:
 * `clubs.trainers[].linkedUserId`, `club_resource_items.payload.linkedUserId`,
 * `athletes.data.guardians[].linkedUserId`, `athletes.user_id`.
 *
 * `PASS` significa «dopo la revoca non e rimasto niente collegato».
 *
 * Il file non tocca una riga di produzione e cancella il proprio club in
 * `finally`.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { travasaTutori } from "./helpers/travaso-tutori.mjs";
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
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(74)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        nota: ${nota}`);
};

const CLUB = randomUUID();
const CAT_A = "cat-pp03r-a";

let PRESIDENTE = null;
let ruoli = null;

const scopeProprietario = () => ({
  userId: PRESIDENTE.id,
  activeOrganizationId: CLUB,
  activeRole: "owner",
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
      last_name: "Collaudo",
      password_hash: "$2b$10$pp03",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const pulisciResidui = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp03r-" } },
    select: { id: true },
  });
  const ids = residui.map((riga) => riga.id);
  if (!ids.length) return;
  await prisma.auditLog
    .deleteMany({ where: { organization_id: { in: ids } } })
    .catch(() => {});
  await prisma.club.deleteMany({ where: { id: { in: ids } } });
};

/**
 * Una tessera qualunque, presa dal database dopo l'assegnazione: `revokeClubAccess`
 * vuole l'identificativo della riga, non il ruolo.
 */
const tesseraDi = async (userId) => {
  const riga = await prisma.organizationUser.findFirst({
    where: { organization_id: CLUB, user_id: userId },
  });
  if (!riga) throw new Error(`Nessuna tessera per ${userId}`);
  return riga;
};

const semina = async () => {
  await pulisciResidui();

  PRESIDENTE = await utente("pp03r-presidente@example.invalid", "Anna");
  const misterCustom = await utente("pp03r-mister-custom@example.invalid", "Aldo");
  const misterAlias = await utente("pp03r-mister-alias@example.invalid", "Alba");
  const segreteria = await utente("pp03r-segreteria@example.invalid", "Sara");
  const genitore = await utente("pp03r-genitore@example.invalid", "Gino");
  const atleta = await utente("pp03r-atleta@example.invalid", "Ada");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `pp03r-${Date.now()}`,
      name: "ASD Collaudo Revoca PP-03",
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
      categories: [{ id: CAT_A, name: "Under 12" }],
      club_sites: [],
      category_groups: [],
      structures: [],
      trainers: [
        {
          id: "trainer-pp03r-custom",
          first_name: "Aldo",
          last_name: "Collaudo",
          email: misterCustom.email,
          linkedUserId: misterCustom.id,
          categories: [CAT_A],
          groups: [],
        },
        {
          id: "trainer-pp03r-alias",
          first_name: "Alba",
          last_name: "Collaudo",
          email: misterAlias.email,
          linkedUserId: misterAlias.id,
          categories: [CAT_A],
          groups: [],
        },
      ],
      staff_members: [
        {
          id: "staff-pp03r-segreteria",
          first_name: "Sara",
          last_name: "Collaudo",
          email: segreteria.email,
          linkedUserId: segreteria.id,
          role: "Segreteria",
        },
      ],
      matches: [],
      trainings: [],
    },
  });

  /* Le stesse schede anche in `club_resource_items`: e li che vivono davvero. */
  await prisma.clubResourceItem.createMany({
    data: [
      {
        id: randomUUID(),
        organization_id: CLUB,
        resource_type: "trainers",
        payload: {
          id: "trainer-pp03r-custom",
          first_name: "Aldo",
          email: misterCustom.email,
          linkedUserId: misterCustom.id,
          categories: [CAT_A],
        },
      },
      {
        id: randomUUID(),
        organization_id: CLUB,
        resource_type: "trainers",
        payload: {
          id: "trainer-pp03r-alias",
          first_name: "Alba",
          email: misterAlias.email,
          linkedUserId: misterAlias.id,
          categories: [CAT_A],
        },
      },
      {
        id: randomUUID(),
        organization_id: CLUB,
        resource_type: "staff_members",
        payload: {
          id: "staff-pp03r-segreteria",
          first_name: "Sara",
          email: segreteria.email,
          linkedUserId: segreteria.id,
          role: "Segreteria",
        },
      },
    ],
  });

  await prisma.athlete.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      first_name: "Ada",
      last_name: "Collaudo",
      user_id: atleta.id,
      category_id: CAT_A,
      data: {
        guardians: [
          {
            first_name: "Gino",
            last_name: "Collaudo",
            email: genitore.email,
            linkedUserId: genitore.id,
          },
        ],
      },
    },
  });

  /* Il proprietario: la sua tessera serve a far passare le guardie. */
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

  /*
    **I tutori seminati diventano righe** (integrazione, WP-C).

    Questa sonda e precedente al passaggio dell’autorita: seminava i tutori
    dentro `athletes.data.guardians[]`, che fino a WP-B era l’archivio e dopo
    WP-C e una **proiezione**. Senza questa riga la sonda misura un club
    **senza tutori** — e dice che l’area famiglia non si apre, che e vero e
    non e il difetto che sta cercando.

    Il travaso e lo stesso `INSERT ... SELECT` della migrazione vera,
    ristretto ai club di questa sonda: si misura lo stato in cui il prodotto
    si trovera, non uno stato costruito a mano piu ordinato del vero.
  */
  await travasaTutori(prisma, [CLUB]);

  return { misterCustom, misterAlias, segreteria, genitore, atleta };
};

/* ---------------------------------------------------------------- prove */

const esegui = async () => {
  const attori = await semina();
  ruoli = await carica("src/lib/server/club-roles.ts");

  /* --- 1. ruolo personalizzato basato su `trainer` (ADR-0102) ---------- */

  await ruoli.createClubRole(scopeProprietario(), {
    name: "Preparatori",
    baseRole: "trainer",
    permissions: ["events.read"],
  });

  await ruoli.assignClubRole(scopeProprietario(), {
    userId: attori.misterCustom.id,
    role: "custom:trainer:preparatori",
  });

  const tesseraCustom = await tesseraDi(attori.misterCustom.id);
  prova(
    "R-00 · la tessera personalizzata porta lo slug, non il ruolo base",
    "custom:trainer:preparatori",
    tesseraCustom.role,
  );

  await ruoli.revokeClubAccess(scopeProprietario(), tesseraCustom.id);

  const clubDopoCustom = await prisma.club.findUnique({
    where: { id: CLUB },
    select: { trainers: true },
  });
  const schedaCustom = clubDopoCustom.trainers.find(
    (riga) => riga.id === "trainer-pp03r-custom",
  );
  prova(
    "R-01 · revocata la tessera personalizzata, `clubs.trainers` non e piu collegata",
    null,
    schedaCustom?.linkedUserId ?? null,
    "lo sweep confrontava lo slug con [\"trainer\",\"allenatore\",\"coach\"]",
  );

  const risorsaCustom = await prisma.clubResourceItem.findFirst({
    where: { organization_id: CLUB, resource_type: "trainers" },
    orderBy: { created_at: "asc" },
  });
  const risorseTrainer = await prisma.clubResourceItem.findMany({
    where: { organization_id: CLUB, resource_type: "trainers" },
  });
  const rigaCustom = risorseTrainer.find(
    (riga) => riga.payload?.id === "trainer-pp03r-custom",
  );
  prova(
    "R-02 · e non lo e nemmeno la riga in `club_resource_items`",
    null,
    rigaCustom?.payload?.linkedUserId ?? null,
    `letta ${risorsaCustom?.id}`,
  );

  const rigaAltra = risorseTrainer.find(
    (riga) => riga.payload?.id === "trainer-pp03r-alias",
  );
  prova(
    "R-03 · la scheda dell'altro allenatore non e stata toccata",
    attori.misterAlias.id,
    rigaAltra?.payload?.linkedUserId ?? null,
    "lo sweep deve slegare l'utenza revocata, non svuotare la collezione",
  );

  /* --- 2. un alias canonico che gli insiemi locali non avevano --------- */

  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: attori.misterAlias.id,
      role: "allenatrice",
      updated_at: new Date(),
    },
  });
  const tesseraAlias = await tesseraDi(attori.misterAlias.id);
  await ruoli.revokeClubAccess(scopeProprietario(), tesseraAlias.id);

  const dopoAlias = await prisma.clubResourceItem.findMany({
    where: { organization_id: CLUB, resource_type: "trainers" },
  });
  prova(
    "R-04 · l'alias `allenatrice` e un allenatore come gli altri",
    null,
    dopoAlias.find((riga) => riga.payload?.id === "trainer-pp03r-alias")?.payload
      ?.linkedUserId ?? null,
    "l'insieme locale conteneva `allenatore` ma non `allenatrice`",
  );

  /* --- 3. ruolo personalizzato gestionale ------------------------------ */

  await ruoli.createClubRole(scopeProprietario(), {
    name: "Segreteria iscrizioni",
    baseRole: "staff",
    permissions: ["members.register.read"],
  });
  await ruoli.assignClubRole(scopeProprietario(), {
    userId: attori.segreteria.id,
    role: "custom:staff:segreteria-iscrizioni",
  });
  const tesseraStaff = await tesseraDi(attori.segreteria.id);
  await ruoli.revokeClubAccess(scopeProprietario(), tesseraStaff.id);

  const dopoStaff = await prisma.clubResourceItem.findFirst({
    where: { organization_id: CLUB, resource_type: "staff_members" },
  });
  prova(
    "R-05 · anche un ruolo personalizzato gestionale slega la sua scheda",
    null,
    dopoStaff?.payload?.linkedUserId ?? null,
  );

  const clubDopoStaff = await prisma.club.findUnique({
    where: { id: CLUB },
    select: { staff_members: true },
  });
  prova(
    "R-06 · e la proiezione JSON `clubs.staff_members` con essa",
    null,
    clubDopoStaff.staff_members[0]?.linkedUserId ?? null,
  );

  /* --- 4. genitore, alias `tutor` -------------------------------------- */

  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: attori.genitore.id,
      role: "tutor",
      updated_at: new Date(),
    },
  });
  const tesseraGenitore = await tesseraDi(attori.genitore.id);
  await ruoli.revokeClubAccess(scopeProprietario(), tesseraGenitore.id);

  const atletaDopoGenitore = await prisma.athlete.findFirst({
    where: { organization_id: CLUB },
  });
  prova(
    "R-07 · l'alias `tutor` slega il tutore da `athletes.data.guardians[]`",
    null,
    atletaDopoGenitore.data?.guardians?.[0]?.linkedUserId ?? null,
    "l'insieme locale conteneva `tutore` ma non `tutor`",
  );

  /* --- 5. atleta, alias `giocatore` ------------------------------------ */

  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: attori.atleta.id,
      role: "giocatore",
      updated_at: new Date(),
    },
  });
  const tesseraAtleta = await tesseraDi(attori.atleta.id);
  await ruoli.revokeClubAccess(scopeProprietario(), tesseraAtleta.id);

  const atletaDopo = await prisma.athlete.findFirst({
    where: { organization_id: CLUB },
  });
  prova(
    "R-08 · l'alias `giocatore` slega `athletes.user_id`",
    null,
    atletaDopo.user_id ?? null,
    "l'insieme locale conteneva `athlete`, `atleta`, `player` e non `giocatore`",
  );
};

const main = async () => {
  console.log("");
  console.log("  PP-03 · la revoca deve slegare, anche quando il ruolo e personalizzato");
  console.log("  ---------------------------------------------------------------------");
  try {
    await esegui();
  } finally {
    await prisma.auditLog
      .deleteMany({ where: { organization_id: CLUB } })
      .catch(() => {});
    await prisma.club.deleteMany({ where: { id: CLUB } }).catch(() => {});
    await prisma.$disconnect();
  }

  const rossi = esiti.filter((riga) => !riga.ok);
  console.log("");
  console.log(`  ${esiti.length - rossi.length}/${esiti.length} prove superate`);
  if (rossi.length) process.exitCode = 1;
};

main().catch(async (errore) => {
  console.error(errore);
  await prisma.club.deleteMany({ where: { id: CLUB } }).catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
