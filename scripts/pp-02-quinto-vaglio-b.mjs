/**
 * **Quinto vaglio ostile su PP-02 — le zone d'ombra dichiarate.**
 *
 *  §E  `simplified_athletes` dalla rotta HTTP vera: la stessa porta, lo stesso
 *      vaglio?
 *  §F  concorrenza vera, in parallelo: due revoche di tessera della stessa
 *      persona (una `parent`, una ruolo di club) — il ramo `parent` di
 *      `unlinkParentGuardians` salta il blocco consultivo.
 *  §G  revoca x salvataggio dell'anagrafica in parallelo (PP02-D34).
 *  §H  DELETE generico dell'atleta: la cascata contro il vaglio dell'archivio.
 *  §I  riscatto: replay dello stesso gettone.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

/*
  **Questa sonda scrive, quindi dichiara dove.**

  `scripts/db-guard.mjs` copre gli **script npm**; una sonda lanciata a mano
  copiando la riga dalla propria docstring non passa di li. Diciotto sonde di
  questo repository scrivevano su Postgres senza chiedere niente a nessuno:
  bastava una shell con `DATABASE_URL` puntata a un ambiente condiviso — che e
  lo stato ordinario di chi ha appena letto un dato su staging — e la prima
  `create` partiva su dati veri.

  Non e uno scenario di fantasia: e la stessa mossa che apre la finestra di
  migrazione. Trovato preparando la prova di rollback.

  L'etichetta da sola non basta e la guardia lo sa: `db-guard` confronta anche
  l'**host**. Qui si tiene il vaglio minimo — una sonda gira solo sul database
  di sviluppo — perche e la condizione che questa famiglia di script ha sempre
  dichiarato in prosa senza mai verificare.
*/
if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error(
    "Rifiuto: serve EASYGAME_DB_ENV=development. Questa sonda scrive sul database.",
  );
  process.exit(1);
}


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
const PRESIDENTE = randomUUID();
const SEGRETARIA = randomUUID();
const MADRE = randomUUID();
const ESTRANEO = randomUUID();

const coda = `${CLUB.slice(0, 8)}@quintob.local`;
const email = (chi) => `${chi}-${coda}`;

const utente = (id, indirizzo, nome) => ({
  id,
  email: indirizzo,
  email_verified_at: new Date(),
  first_name: nome,
  last_name: "QuintoB",
  password_hash: "$2b$10$quinto",
  role: "user",
});

const atleta = async (nome, data = {}) => {
  const id = randomUUID();
  await prisma.athlete.create({
    data: {
      id,
      organization_id: CLUB,
      first_name: nome,
      last_name: "QuintoB",
      status: "active",
      data,
      updated_at: new Date(),
    },
  });
  return id;
};

const tessera = async (userId, ruolo, clubRoleId = null, primaria = true) => {
  const id = randomUUID();
  await prisma.organizationUser.create({
    data: {
      id,
      organization_id: CLUB,
      user_id: userId,
      role: ruolo,
      custom_role_id: clubRoleId,
      is_primary: primaria,
      updated_at: new Date(),
    },
  });
  return id;
};

const righeDi = async (athleteId) =>
  prisma.athleteGuardian.findMany({ where: { athlete_id: athleteId } });

const datiDi = async (id) =>
  (await prisma.athlete.findUnique({ where: { id }, select: { data: true } }))
    ?.data || {};

let rotte = null;
const chiama = async (metodo, percorso, corpo, sessione, ruoloAttivo) => {
  const url = new URL(percorso, "http://collaudo.invalid");
  const headers = new Headers({
    "content-type": "application/json",
    authorization: `Bearer ${sessione}`,
    "x-active-club-id": CLUB,
    "x-active-access-role": ruoloAttivo,
    "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
  });
  const richiesta = new Request(url.toString(), {
    method: metodo,
    headers,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const segmenti = url.pathname.replace(/^\/api\/v1\//, "").split("/");
  const risposta =
    segmenti.length === 1
      ? await rotte.elenco[metodo](richiesta, { params: { resource: segmenti[0] } })
      : await rotte.riga[metodo](richiesta, {
          params: { resource: segmenti[0], id: segmenti[1] },
        });
  return { stato: risposta.status, corpo: await risposta.json().catch(() => null) };
};

const main = async () => {
  const tutori = await carica("src/lib/server/athlete-guardians.ts");
  const cruscotto = await carica("src/lib/server/parent-dashboard.ts");
  const ruoliClub = await carica("src/lib/server/club-roles.ts");
  const auth = await carica("src/lib/server/auth.ts");
  rotte = {
    elenco: await carica("src/app/api/v1/[resource]/route.ts"),
    riga: await carica("src/app/api/v1/[resource]/[id]/route.ts"),
    riscatto: await carica("src/app/api/v1/auth/access/redeem/route.ts"),
  };

  await prisma.user.createMany({
    data: [
      utente(PRESIDENTE, email("presidente"), "Presidente"),
      utente(SEGRETARIA, email("segretaria"), "Segretaria"),
      utente(MADRE, email("madre"), "Madre"),
      utente(ESTRANEO, email("estraneo"), "Estraneo"),
    ],
  });
  await prisma.club.create({
    data: {
      id: CLUB,
      name: `QuintoB ${CLUB.slice(0, 6)}`,
      slug: `quintob-${CLUB.slice(0, 8)}`,
      creator_id: PRESIDENTE,
      updated_at: new Date(),
    },
  });

  const SLUG = "custom:staff:segreteria";
  const ruoloClub = await prisma.clubRole.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      slug: SLUG,
      name: "Segreteria",
      base_role: "staff",
      is_active: true,
      updated_at: new Date(),
    },
  });

  await tessera(PRESIDENTE, "owner");
  await tessera(SEGRETARIA, SLUG, ruoloClub.id);

  const sessioneSeg = (
    await auth.createSessionForUser(
      await prisma.user.findUnique({ where: { id: SEGRETARIA } }),
    )
  ).access_token;
  const sessionePres = (
    await auth.createSessionForUser(
      await prisma.user.findUnique({ where: { id: PRESIDENTE } }),
    )
  ).access_token;

  const scopeOwner = {
    userId: PRESIDENTE,
    activeOrganizationId: CLUB,
    activeRole: "owner",
    activeMembershipId: null,
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

  /* ================================================================== *
   * §E — la stessa porta da `simplified_athletes`
   * ================================================================== */
  console.log("\n§E — `simplified_athletes`: stessa risorsa, stesso vaglio?\n");
  {
    const figlio = await atleta("FiglioE");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: figlio,
      rows: [{ firstName: "Nonna", phone: "3330000000", legacyId: "e-nonna" }],
      canGrantAccess: true,
    });
    const proiettata = ((await datiDi(figlio)).guardians || [])[0];

    const esito = await chiama(
      "PATCH",
      `/api/v1/simplified_athletes/${figlio}`,
      {
        last_name: "QuintoB",
        data: { guardians: [{ ...proiettata, email: email("estraneo") }] },
      },
      sessioneSeg,
      SLUG,
    );
    prova(
      "E1 — la crescita del legame e respinta anche da simplified_athletes",
      403,
      esito.stato,
    );
    prova(
      "E2 — e l'estraneo non ha preso il fascicolo",
      0,
      (await cruscotto.getParentLinkedAthletes(ESTRANEO)).length,
    );
  }

  /* ================================================================== *
   * §F — due revoche di tessera IN PARALLELO, una `parent` e una no
   * ================================================================== */
  console.log("\n§F — due revoche in parallelo: parent x ruolo di club\n");
  {
    const figlio = await atleta("FiglioF");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: figlio,
      rows: [{ firstName: "Madre", email: email("madre"), legacyId: "f-madre" }],
      canGrantAccess: true,
    });
    const riga = (await righeDi(figlio))[0];
    await tutori.linkGuardianAccount(prisma, {
      athleteId: figlio,
      guardianRowId: riga.id,
      userId: MADRE,
      email: email("madre"),
    });

    const M1 = await tessera(MADRE, "parent", null, true);
    const M2 = await tessera(MADRE, SLUG, ruoloClub.id, false);

    prova(
      "F1 controllo — la madre apre l'area famiglia",
      1,
      (await cruscotto.getParentLinkedAthletes(MADRE)).length,
    );

    const esiti2 = await Promise.allSettled([
      ruoliClub.revokeClubAccess(scopeOwner, M1),
      ruoliClub.revokeClubAccess(scopeOwner, M2),
    ]);
    console.log(
      `        esiti: ${esiti2
        .map((e) => (e.status === "fulfilled" ? "ok" : String(e.reason?.message).slice(0, 40)))
        .join(" | ")}`,
    );

    prova(
      "F2 REPERTO — nessuna tessera resta nel club",
      0,
      await prisma.organizationUser.count({
        where: { organization_id: CLUB, user_id: MADRE },
      }),
    );
    const dopo = (await righeDi(figlio))[0];
    prova(
      "F3 REPERTO — la riga del tutore e revocata e senza utenza",
      [true, null],
      [Boolean(dopo?.revoked_at), dopo?.user_id ?? null],
    );
    prova(
      "F4 REPERTO — e l'area famiglia e chiusa",
      0,
      (await cruscotto.getParentLinkedAthletes(MADRE)).length,
    );
  }

  /* ================================================================== *
   * §G — revoca x salvataggio dell'anagrafica, in parallelo
   * ================================================================== */
  console.log("\n§G — revoca x salvataggio dell'anagrafica, in parallelo\n");
  {
    const figli = [];
    for (let i = 0; i < 6; i += 1) {
      const id = await atleta(`FiglioG${i}`);
      await tutori.saveGuardianRegistry(prisma, {
        organizationId: CLUB,
        athleteId: id,
        rows: [{ firstName: "Estraneo", email: email("estraneo"), legacyId: `g-${i}` }],
        canGrantAccess: true,
      });
      const riga = (await righeDi(id))[0];
      await tutori.linkGuardianAccount(prisma, {
        athleteId: id,
        guardianRowId: riga.id,
        userId: ESTRANEO,
        email: email("estraneo"),
      });
      figli.push(id);
    }
    const M = await tessera(ESTRANEO, "parent", null, true);

    prova(
      "G1 controllo — l'estraneo e tutore di sei schede",
      6,
      (await cruscotto.getParentLinkedAthletes(ESTRANEO)).length,
    );

    const salvataggi = figli.map(async (id) => {
      const proiettati = (await datiDi(id)).guardians || [];
      return chiama(
        "PATCH",
        `/api/v1/athletes/${id}`,
        { last_name: `Salvato-${id.slice(0, 4)}`, data: { guardians: proiettati } },
        sessionePres,
        "owner",
      );
    });

    const [revoca, ...resto] = await Promise.allSettled([
      ruoliClub.revokeClubAccess(scopeOwner, M),
      ...salvataggi,
    ]);
    console.log(
      `        revoca: ${revoca.status === "fulfilled" ? "ok" : String(revoca.reason?.message).slice(0, 60)}`,
    );
    console.log(
      `        salvataggi: ${resto
        .map((e) =>
          e.status === "fulfilled" ? e.value.stato : String(e.reason?.message).slice(0, 30),
        )
        .join(",")}`,
    );

    prova(
      "G2 REPERTO — dopo la revoca l'estraneo non apre nessuna scheda",
      0,
      (await cruscotto.getParentLinkedAthletes(ESTRANEO)).length,
    );
    const vive = await prisma.athleteGuardian.count({
      where: { athlete_id: { in: figli }, revoked_at: null },
    });
    prova("G3 REPERTO — nessuna riga del tutore e rimasta viva", 0, vive);
  }

  /* ================================================================== *
   * §H — DELETE generico dell'atleta contro il vaglio dell'archivio
   * ================================================================== */
  console.log("\n§H — DELETE generico dell'atleta: la cascata e il vaglio\n");
  {
    const figlio = await atleta("FiglioH");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: figlio,
      rows: [{ firstName: "Nonna", email: email("nonna"), legacyId: "h-1" }],
      canGrantAccess: true,
    });
    prova("H1 setup — una riga tutore", 1, (await righeDi(figlio)).length);

    const esito = await chiama(
      "DELETE",
      `/api/v1/athletes/${figlio}`,
      undefined,
      sessionePres,
      "owner",
    );
    console.log(
      `        DELETE -> ${esito.stato} ${JSON.stringify(esito.corpo?.error?.message || "").slice(0, 110)}`,
    );
    prova(
      "H2 — DELETE riuscito, scheda sparita, righe tutore sparite con lei",
      [200, 0, 0],
      [
        esito.stato,
        await prisma.athlete.count({ where: { id: figlio } }),
        (await righeDi(figlio)).length,
      ],
    );
  }

  /* ================================================================== *
   * §I — riscatto: replay dello stesso gettone
   * ================================================================== */
  console.log("\n§I — riscatto: replay\n");
  {
    const figlio = await atleta("FiglioI");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: figlio,
      rows: [{ firstName: "Estraneo", email: email("estraneo"), legacyId: "i-1" }],
      canGrantAccess: true,
    });
    const riga = (await righeDi(figlio))[0];
    const CODICE = `PP02${CLUB.slice(0, 8).replace(/-/g, "").toUpperCase()}`;
    await prisma.clubResourceItem.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        resource_type: "access_tokens",
        name: CODICE,
        status: "active",
        payload: {
          athlete_id: figlio,
          guardian_id: riga.id,
          role: "parent",
          one_time: true,
          minted_by_role: "owner",
          minted_by_user_id: PRESIDENTE,
        },
        updated_at: new Date(),
      },
    });

    const riscatta = async (userId) => {
      const sessione = await auth.createSessionForUser(
        await prisma.user.findUnique({ where: { id: userId } }),
      );
      const risposta = await rotte.riscatto.POST(
        new Request("http://collaudo.invalid/api/v1/auth/access/redeem", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${sessione.access_token}`,
            "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
          },
          body: JSON.stringify({ token: CODICE }),
        }),
      );
      const corpo = await risposta.json().catch(() => null);
      if (risposta.status !== 200) console.log(`        riscatto ${risposta.status}: ${JSON.stringify(corpo?.error?.message || corpo).slice(0,140)}`);
      return risposta.status;
    };

    prova("I1 controllo — il primo riscatto riesce", 200, await riscatta(ESTRANEO));
    prova(
      "I2 REPERTO — il secondo riscatto dello stesso gettone e respinto",
      true,
      (await riscatta(MADRE)) >= 400,
    );
    const righe = await righeDi(figlio);
    prova(
      "I3 REPERTO — una sola riga porta un'utenza",
      1,
      righe.filter((r) => r.user_id).length,
      `utenze: ${JSON.stringify(righe.map((r) => r.user_id))}`,
    );
  }

  console.log(
    `\nEsito: ${esiti.filter((e) => e.ok).length}/${esiti.length} PASS, ${esiti.filter((e) => !e.ok).length} FAIL\n`,
  );
};

const pulisci = async () => {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL "easygame.guardian_writer" = 'on'`);
    await tx.$executeRawUnsafe(
      `DELETE FROM "athlete_guardians" WHERE "organization_id" = $1::uuid`,
      CLUB,
    );
  });
  await prisma.athlete.deleteMany({ where: { organization_id: CLUB } });
  await prisma.club.deleteMany({ where: { id: CLUB } });
  await prisma.user.deleteMany({
    where: { id: { in: [PRESIDENTE, SEGRETARIA, MADRE, ESTRANEO] } },
  });
};

main()
  .catch((errore) => {
    console.error("\nERRORE:", errore);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pulisci().catch((e) => console.error("pulizia:", e?.message));
    await prisma.$disconnect();
  });
