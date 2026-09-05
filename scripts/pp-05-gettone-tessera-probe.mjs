/**
 * **Il gettone di un ruolo personalizzato arriva davvero al browser.**
 *
 *     EASYGAME_DB_ENV=development \
 *       node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/pp-05-gettone-tessera-probe.mjs
 *
 * Chiude la dependency che PP-03 ha registrato verso PP-05
 * (`deps/PP-03-DEPENDENCIES.md`, 2026-09-04). Le due rotte
 * `/api/v1/auth/memberships` e `/api/v1/auth/memberships/activate` sono di
 * PP-05 nel contratto di ownership parallelo, quindi la correzione sta qui.
 *
 * ## Perche serve una sonda e non bastano i test
 *
 * La catena da percorrere e `club_role_permissions -> risolviTessere -> rotta
 * -> valore che il browser salva -> roleHasPermission`. Il pezzo centrale
 * legge **tre tabelle** (`organization_users`, `club_roles`,
 * `club_role_permissions`) e ne pretende la coerenza — ruolo attivo, dello
 * stesso club, con lo slug che corrisponde. Un doppio in memoria puo
 * rappresentarlo, ma allora la sonda misurerebbe il doppio: qui la misura e
 * contro PostgreSQL, con le righe vere.
 *
 * - **G1** — `GET /auth/memberships` emette il **gettone** per una tessera
 *   personalizzata, non lo slug nudo;
 * - **G2** — quel valore, dato a `roleHasPermission`, accende le chiavi
 *   concesse e **solo** quelle: e la proprieta per cui la dependency esiste;
 * - **G3** — `POST /auth/memberships/activate` emette lo stesso gettone;
 * - **G4** — controspecchio: una tessera **canonica** resta al proprio nome, e
 *   il gettone non compare dove non serve;
 * - **G5** — il gettone **non concede niente in piu**: rimandato al server come
 *   `x-active-access-role` con chiavi aggiunte a mano, il risolutore ne tiene
 *   lo slug e ricostruisce le chiavi dall'archivio.
 *
 * **La sonda misura, non corregge.** Scrive righe proprie con identificativi
 * casuali e le cancella alla fine.
 */

import { PrismaClient } from "@prisma/client";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("Rifiuto: serve EASYGAME_DB_ENV=development.");
  process.exit(1);
}

const prisma = new PrismaClient({ log: [] });
const carica = (rel) => import(pathToFileURL(path.resolve(rel)).href);

const esiti = [];
const segna = (nome, ok, dettaglio) => {
  esiti.push({ nome, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${nome} :: ${dettaglio}`);
};

const marchio = randomBytes(4).toString("hex");
const creati = { utenti: [], club: [] };

/** Le due chiavi: una concessa al ruolo di club, una no. */
const CHIAVE_CONCESSA = "documents.review";
const CHIAVE_NEGATA = "accounts.athlete.manage";

const main = async () => {
  const { hashPassword, createSessionForUser } = await carica(
    "src/lib/server/auth.ts",
  );
  const { parseCustomRoleValue } = await carica("src/lib/access-roles.ts");
  const { roleHasPermission } = await carica("src/lib/permissions/catalog.ts");
  const elenco = (await carica("src/app/api/v1/auth/memberships/route.ts")).GET;
  const attiva = (
    await carica("src/app/api/v1/auth/memberships/activate/route.ts")
  ).POST;

  const utente = await prisma.user.create({
    data: {
      email: `gettone-${marchio}@example.invalid`,
      password_hash: await hashPassword("PasswordDiProva!2026"),
      role: "user",
      email_verified_at: new Date(),
    },
  });
  creati.utenti.push(utente.id);

  /*
    Il proprietario dei due club e **un altro**: se fosse la persona sotto
    misura, le righe di proprieta entrerebbero nell'elenco e il ruolo attivo
    potrebbe risolversi in `owner`, cioe la sonda misurerebbe un caso diverso
    da quello che dichiara.
  */
  const proprietario = await prisma.user.create({
    data: {
      email: `gettone-owner-${marchio}@example.invalid`,
      password_hash: await hashPassword("PasswordDiProva!2026"),
      role: "user",
    },
  });
  creati.utenti.push(proprietario.id);

  const club = await prisma.club.create({
    data: {
      name: `Sonda gettone ${marchio}`,
      slug: `sonda-gettone-${marchio}`,
      creator_id: proprietario.id,
    },
  });
  creati.club.push(club.id);

  /*
    Un ruolo di club basato su `club_manager` con **una sola** chiave concessa:
    il restringimento e la ragione per cui il gettone porta le chiavi, e una
    sola chiave rende visibile la differenza fra «ristretto» e «ruolo base».
  */
  const ruolo = await prisma.clubRole.create({
    data: {
      organization_id: club.id,
      slug: `custom:club_manager:sonda-${marchio}`,
      name: `Sonda ${marchio}`,
      base_role: "club_manager",
      is_active: true,
      permissions: { create: [{ permission_key: CHIAVE_CONCESSA }] },
    },
  });

  const tessera = await prisma.organizationUser.create({
    data: {
      organization_id: club.id,
      user_id: utente.id,
      role: ruolo.slug,
      custom_role_id: ruolo.id,
      is_primary: true,
    },
  });

  /* Una seconda tessera, canonica, in un secondo club: il controspecchio. */
  const clubCanonico = await prisma.club.create({
    data: {
      name: `Sonda canonica ${marchio}`,
      slug: `sonda-canonica-${marchio}`,
      creator_id: proprietario.id,
    },
  });
  creati.club.push(clubCanonico.id);
  await prisma.organizationUser.create({
    data: {
      organization_id: clubCanonico.id,
      user_id: utente.id,
      role: "trainer",
      is_primary: false,
    },
  });

  const sessione = await createSessionForUser(utente);
  const conSessione = (url, corpo) =>
    new Request(url, {
      method: corpo ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        cookie: `easygame_session=${sessione.access_token}`,
      },
      ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    });

  /* ------------------------------------------------------------------ G1 */
  const risposta = await (
    await elenco(conSessione("http://easygame.local/api/v1/auth/memberships"))
  ).json();
  const righe = risposta?.data?.memberships || risposta?.data || [];
  const rigaPersonalizzata = (Array.isArray(righe) ? righe : []).find(
    (r) => r.organization_id === club.id && r.access_kind === "membership",
  );
  const rigaCanonica = (Array.isArray(righe) ? righe : []).find(
    (r) => r.organization_id === clubCanonico.id && r.access_kind === "membership",
  );

  const gettone = String(rigaPersonalizzata?.role || "");
  const riferimento = parseCustomRoleValue(gettone);
  segna(
    "G1 — l'elenco delle tessere emette il gettone, non lo slug nudo",
    gettone.includes("#") && riferimento?.permissions.length === 1,
    `role = ${gettone || "(assente)"}`,
  );

  /* ------------------------------------------------------------------ G2 */
  const accende = roleHasPermission(gettone, CHIAVE_CONCESSA);
  const spegne = roleHasPermission(gettone, CHIAVE_NEGATA);
  const conLoSlugNudo = roleHasPermission(ruolo.slug, CHIAVE_CONCESSA);
  segna(
    "G2 — il valore emesso accende le chiavi concesse e solo quelle",
    accende === true && spegne === false && conLoSlugNudo === false,
    `concessa=${accende} · negata=${spegne} · con lo slug nudo (la forma di prima)=${conLoSlugNudo}`,
  );

  /* ------------------------------------------------------------------ G3 */
  const attivata = await (
    await attiva(
      conSessione("http://easygame.local/api/v1/auth/memberships/activate", {
        organization_id: club.id,
        membership_id: tessera.id,
      }),
    )
  ).json();
  const gettoneAttivazione = String(attivata?.data?.role || "");
  /*
    `gettoneAttivazione === gettone` da solo **non basta**: se le due rotte
    tornassero entrambe allo slug nudo la riga sarebbe verde e non avrebbe
    misurato niente. Si chiede anche che il valore accenda la chiave concessa,
    che e la proprieta per cui la dependency esiste.
  */
  segna(
    "G3 — l'attivazione emette lo stesso gettone, e anche quello accende le chiavi",
    gettoneAttivazione === gettone &&
      roleHasPermission(gettoneAttivazione, CHIAVE_CONCESSA) === true &&
      roleHasPermission(gettoneAttivazione, CHIAVE_NEGATA) === false &&
      attivata?.data?.resolved_role === "club_manager",
    `role = ${gettoneAttivazione || "(assente)"} · concessa = ${roleHasPermission(
      gettoneAttivazione,
      CHIAVE_CONCESSA,
    )} · resolved_role = ${attivata?.data?.resolved_role}`,
  );

  /* ------------------------------------------------------------------ G4 */
  segna(
    "G4 — controspecchio: una tessera canonica resta al proprio nome",
    rigaCanonica?.role === "trainer",
    `role = ${rigaCanonica?.role}`,
  );

  /* ------------------------------------------------------------------ G5 */
  const { resolveOrganizationScopeForUser } = await carica(
    "src/lib/server/auth.ts",
  );
  const contraffatto = `${ruolo.slug}#${CHIAVE_CONCESSA},${CHIAVE_NEGATA}`;
  const scope = await resolveOrganizationScopeForUser(utente.id, {
    preferredOrganizationId: club.id,
    preferredRole: contraffatto,
  });
  const chiaviRisolte = parseCustomRoleValue(String(scope?.activeRole || ""));
  segna(
    "G5 — un gettone contraffatto non aggiunge nessuna chiave",
    roleHasPermission(scope?.activeRole, CHIAVE_NEGATA) === false &&
      chiaviRisolte?.permissions.length === 1,
    `activeRole = ${scope?.activeRole} · chiave aggiunta a mano concessa = ${roleHasPermission(
      scope?.activeRole,
      CHIAVE_NEGATA,
    )}`,
  );
};

const pulisci = async () => {
  await prisma.session.deleteMany({ where: { user_id: { in: creati.utenti } } });
  await prisma.organizationUser.deleteMany({
    where: { user_id: { in: creati.utenti } },
  });
  await prisma.club.deleteMany({ where: { id: { in: creati.club } } });
  await prisma.user.deleteMany({ where: { id: { in: creati.utenti } } });
};

main()
  .catch((error) => {
    console.error("Sonda interrotta:", error?.stack || error?.message || error);
    esiti.push({ nome: "esecuzione", ok: false });
  })
  .finally(async () => {
    await pulisci().catch((error) =>
      console.error("Pulizia incompleta:", error?.message || error),
    );
    await prisma.$disconnect();
    const verdi = esiti.filter((e) => e.ok).length;
    console.log(`\nSonda gettone tessera: ${verdi}/${esiti.length} verdi.`);
    process.exit(verdi === esiti.length ? 0 : 1);
  });
