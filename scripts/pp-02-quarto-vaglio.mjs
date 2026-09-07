/**
 * **Quarto vaglio ostile su PP-02.**
 *
 * Misura affermazioni scritte nei commenti del pacchetto. Non corregge niente:
 * misura, e cancella i club che semina.
 *
 *  §1  athlete-guardians.ts:64-67 — «Un salvataggio d'anagrafica non concede
 *      accessi. [...] non puo far CRESCERE l'insieme delle identita che aprono
 *      il fascicolo [...] a meno che chi scrive non porti la chiave che governa
 *      proprio questo.»
 *
 *  §2  athlete-guardians.ts:1276-1283 — la revoca non tocca le righe raggiunte
 *      dal solo indirizzo quando sulla scheda esiste una riga «provatamente
 *      sua». Lo stato costruito e: due righe della STESSA persona.
 *
 *  §3  refreshGuardianProjection / loadParentAccessTarget — la ricomposizione
 *      per posizione e cio che ne consegue sulle porte.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { travasaTutori } from "./helpers/travaso-tutori.mjs";

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
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(74)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (nota) console.log(`        ${nota}`);
};

const CLUB = randomUUID();
const PRESIDENTE = randomUUID();
const SEGRETARIA = randomUUID();
const ESTRANEO = randomUUID();
const MADRE = randomUUID();
const PADRE = randomUUID();
const ZIO_A = randomUUID();
const ZIO_B = randomUUID();
const ZIO_C = randomUUID();
const ZIA = randomUUID();

const coda = `${CLUB.slice(0, 8)}@quarto.local`;
const email = (chi) => `${chi}-${coda}`;
const FAMIGLIA = email("famiglia");

const utente = (id, indirizzo, nome) => ({
  id,
  email: indirizzo,
  email_verified_at: new Date(),
  first_name: nome,
  last_name: "Quarto",
  password_hash: "$2b$10$quarto",
  role: "user",
});

const atleta = async (nome, data = {}) => {
  const id = randomUUID();
  await prisma.athlete.create({
    data: {
      id,
      organization_id: CLUB,
      first_name: nome,
      last_name: "Quarto",
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
  prisma.athleteGuardian.findMany({
    where: { athlete_id: athleteId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });

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
  return { stato: risposta.status, corpo: await risposta.json() };
};

const riscatta = async (userId, codice) => {
  const auth = await carica("src/lib/server/auth.ts");
  const riga = await prisma.user.findUnique({ where: { id: userId } });
  const sessione = await auth.createSessionForUser(riga);
  const risposta = await rotte.riscatto.POST(
    new Request("http://collaudo.invalid/api/v1/auth/access/redeem", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sessione.access_token}`,
        "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
      },
      body: JSON.stringify({ token: codice }),
    }),
  );
  return { stato: risposta.status, corpo: await risposta.json() };
};

const main = async () => {
  const tutori = await carica("src/lib/server/athlete-guardians.ts");
  const cruscotto = await carica("src/lib/server/parent-dashboard.ts");
  const legami = await carica("src/lib/server/profile-account-links.ts");
  const auth = await carica("src/lib/server/auth.ts");
  const catalogo = await carica("src/lib/permissions/catalog.ts");
  const ruoli = await carica("src/lib/access-roles.ts");
  const rotteFamiglia = await carica("src/app/api/v1/family/children/route.ts");
  const rotteCruscotto = await carica("src/app/api/parent-dashboard/[athleteId]/route.ts");
  rotte = {
    elenco: await carica("src/app/api/v1/[resource]/route.ts"),
    riga: await carica("src/app/api/v1/[resource]/[id]/route.ts"),
    riscatto: await carica("src/app/api/v1/auth/access/redeem/route.ts"),
  };

  await prisma.user.createMany({
    data: [
      utente(PRESIDENTE, email("presidente"), "Presidente"),
      utente(SEGRETARIA, email("segretaria"), "Segretaria"),
      utente(ESTRANEO, email("estraneo"), "Estraneo"),
      /*
        ADR-0127, configurazione ordinaria: l'indirizzo della madre **e**
        l'indirizzo di famiglia. E cio che la revoca riceve come `userEmail`.
      */
      utente(MADRE, FAMIGLIA, "Madre"),
      utente(PADRE, email("padre"), "Padre"),
      utente(ZIO_A, email("zioa"), "ZioA"),
      utente(ZIO_B, email("ziob"), "ZioB"),
      utente(ZIO_C, email("zioc"), "ZioC"),
      utente(ZIA, email("zia"), "Zia"),
    ],
  });
  await prisma.club.create({
    data: {
      id: CLUB,
      name: `Quarto ${CLUB.slice(0, 6)}`,
      slug: `quarto-${CLUB.slice(0, 8)}`,
      creator_id: PRESIDENTE,
      updated_at: new Date(),
    },
  });

  /* «Segreteria», ruolo di club su base staff, SENZA accounts.athlete.manage. */
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
  await tessera(ESTRANEO, "member");

  const sessioneSeg = (
    await auth.createSessionForUser(
      await prisma.user.findUnique({ where: { id: SEGRETARIA } }),
    )
  ).access_token;

  /* Le schede storiche di §2 e §3, e il travaso: una volta sola per il club. */
  const FIGLIO_DUE = await atleta('FiglioDue', {
    guardians: [
      { id: 'g-madre', name: 'Madre', relationship: 'madre', linkedUserId: MADRE, email: FAMIGLIA },
      { id: 'g-madre-bis', name: 'Madre', relationship: 'madre', email: FAMIGLIA },
    ],
  });
  const FIGLIO_DUE_C = await atleta('FiglioDueControllo', {
    guardians: [{ id: 'c-padre', name: 'Padre', linkedUserId: PADRE, email: email('padre') }],
  });
  const FIGLIO_TRE = await atleta('FiglioTre', {
    guardians: [
      {
        id: 'g-coppia',
        name: 'Genitori',
        email: email('famiglia3'),
        linkedUserIds: [ZIO_A, ZIO_B],
      },
    ],
  });
  /*
    Un'ALTRA famiglia, un altro atleta: la zia ha il proprio account e la
    segreteria le ha scritto lo stesso indirizzo che la madre di FiglioDue usa
    come proprio (ADR-0127: un indirizzo di famiglia solo). La zia non ha nulla
    a che vedere con la revoca della madre.
  */
  const FIGLIO_CINQUE = await atleta("FiglioCinque", {
    guardians: [{ id: "z-1", name: "Zia", email: FAMIGLIA, linkedUserId: ZIA }],
  });
  const FIGLIO_TRE_C = await atleta("FiglioTreControllo", {
    guardians: [
      { id: "gc-1", name: "ZioC", email: email("zioc"), linkedUserId: ZIO_C },
      { id: "gc-2", name: "ZioD", email: email("ziod") },
    ],
  });
  await travasaTutori(prisma, [CLUB]);

  /* ================================================================== *
   * §1 — «un salvataggio d'anagrafica non fa CRESCERE le identita che aprono»
   * ================================================================== */
  console.log("\n§1 — la crescita per MODIFICA di una riga che gia esiste\n");
  {
    const figlio = await atleta("FiglioUno", {
      allergies: ["arachidi"],
      medicalNotes: "asma da sforzo, broncodilatatore in borsa",
    });

    /* Il club scrive un tutore che apre niente: nome e telefono, nessun indirizzo. */
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: figlio,
      rows: [
        { firstName: "Nonna", lastName: "Quarto", phone: "3330000000", legacyId: "g-nonna" },
      ],
      canGrantAccess: true,
    });

    prova(
      "1a controllo — prima, l'estraneo non vede nessun figlio",
      0,
      (await cruscotto.getParentLinkedAthletes(ESTRANEO)).length,
    );
    prova(
      "1b controllo — il ruolo attivo NON puo concedere accessi",
      [false, false],
      [
        catalogo.roleHasPermission(ruoli.encodeCustomRoleToken(SLUG, []), "accounts.athlete.manage"),
        catalogo.roleHasPermission(ruoli.encodeCustomRoleToken(SLUG, []), "clinical.read"),
      ],
    );

    const rigaProiettata = ((await datiDi(figlio)).guardians || [])[0];

    /* Un solo campo cambia: l'indirizzo. La riga e la stessa, per `id`. */
    const esito = await chiama(
      "PATCH",
      `/api/v1/athletes/${figlio}`,
      { last_name: "Quarto", data: { guardians: [{ ...rigaProiettata, email: email("estraneo") }] } },
      sessioneSeg,
      SLUG,
    );
    prova(
      "1c REPERTO il PATCH che sposta il legame su un'utenza e respinto",
      403,
      esito.stato,
      "riusare l'id di una riga esistente scavalcava il vaglio sulla concessione",
    );

    const dopo = await righeDi(figlio);
    prova(
      "1d REPERTO la riga esistente NON ha preso l'indirizzo dell'estraneo",
      true,
      dopo[0]?.email !== email("estraneo"),
    );

    /*
      **Il controllo che dice che non ho solo chiuso tutto.**

      Negare **ogni** crescita e gia stato provato una volta, e il prezzo
      misurato era che una «Segreteria» modellata come ruolo di club non
      potesse piu correggere un refuso nell'indirizzo di un tutore: il lavoro
      di tutti i giorni. Cio che concede non e scrivere un indirizzo, e
      scriverne uno che **corrisponde a un'utenza** — quindi lo stesso identico
      `PATCH`, dallo stesso ruolo ristretto, verso un indirizzo che non e di
      nessuno, deve riuscire.
    */
    const refuso = await chiama(
      "PATCH",
      `/api/v1/athletes/${figlio}`,
      {
        last_name: "Quarto",
        data: {
          guardians: [
            { ...rigaProiettata, email: `refuso-${CLUB.slice(0, 8)}@quarto.local` },
          ],
        },
      },
      sessioneSeg,
      SLUG,
    );
    prova(
      "1d-bis CONTROLLO lo stesso ruolo corregge un refuso di indirizzo",
      200,
      refuso.stato,
      "se questa e rossa la correzione ha chiuso il lavoro di tutti i giorni",
    );

    const apertura = await cruscotto.getParentLinkedAthletes(ESTRANEO);
    prova(
      "1e REPERTO — l'estraneo apre adesso l'area famiglia del minore",
      0,
      apertura.length,
      apertura.length
        ? `aperto: ${apertura.map((a) => `${a.first_name} ${a.last_name}`).join(", ")}`
        : "",
    );

    /* E dalla rotta vera dell'area famiglia: cosa gli arriva davvero? */
    const sessioneEstraneo = (
      await auth.createSessionForUser(
        await prisma.user.findUnique({ where: { id: ESTRANEO } }),
      )
    ).access_token;
    const elenco = await rotteFamiglia.GET(
      new Request("http://collaudo.invalid/api/v1/family/children", {
        headers: { authorization: `Bearer ${sessioneEstraneo}` },
      }),
    );
    const figliVisti = (await elenco.json())?.data?.children || [];
    prova(
      "1e-bis GET /api/v1/family/children elenca il minore all'estraneo",
      0,
      figliVisti.length,
      `figli: ${JSON.stringify(figliVisti.map((f) => f.name))}`,
    );

    const cruscottoRisp = await rotteCruscotto.GET(
      new Request(`http://collaudo.invalid/api/parent-dashboard/${figlio}`, {
        headers: { authorization: `Bearer ${sessioneEstraneo}` },
      }),
      { params: { athleteId: figlio } },
    );
    const corpoCruscotto = await cruscottoRisp.json();
    prova(
      "1e-ter REPERTO — e il cruscotto famiglia gli consegna il DATO CLINICO",
      [null, null],
      [
        corpoCruscotto?.data?.health?.allergies ?? null,
        corpoCruscotto?.data?.health?.notes ?? null,
      ],
      `stato HTTP ${cruscottoRisp.status}`,
    );

    /* CONTROLLO DI DISCRIMINAZIONE: la stessa identita su una riga NUOVA. */
    const esitoNuova = await chiama(
      "PATCH",
      `/api/v1/athletes/${figlio}`,
      {
        last_name: "Quarto",
        data: {
          guardians: [
            { ...rigaProiettata, email: email("estraneo") },
            { name: "Zio", email: email("padre") },
          ],
        },
      },
      sessioneSeg,
      SLUG,
    );
    prova(
      "1f controllo — la stessa concessione su una riga NUOVA e negata (403)",
      403,
      esitoNuova.stato,
    );
  }

  /* ================================================================== *
   * §2 — due righe della STESSA persona, e il gettone che sopravvive
   * ================================================================== */
  console.log("\n§2 — la revoca e la riga «provatamente sua»\n");
  {
    /*
      Lo stato lo produce il TRAVASO, non una scrittura a mano: una scheda in cui
      la madre compare due volte — una riga collegata e una di solo recapito con
      lo stesso indirizzo di famiglia. E il caso ordinario di ADR-0127 visto da
      una scheda in cui la segreteria ha scritto la stessa persona due volte.
    */
    const figlio = FIGLIO_DUE;

    const prima = await righeDi(figlio);
    prova(
      "2a controllo — due righe, una collegata all'utenza e una di solo indirizzo",
      [2, 1, 1],
      [
        prima.length,
        prima.filter((r) => r.user_id === MADRE).length,
        prima.filter((r) => !r.user_id && r.email === FAMIGLIA).length,
      ],
      `chiavi: ${JSON.stringify(prima.map((r) => r.identity_key))}`,
    );

    /* Il club conia un invito PER LA SECONDA RIGA, dalla forma che il prodotto conia. */
    const seconda = prima.find((r) => !r.user_id);
    const CODICE = `QUARTOA${CLUB.slice(0, 5).toUpperCase()}`;
    await prisma.clubResourceItem.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        resource_type: "access_tokens",
        name: CODICE,
        status: "active",
        payload: {
          athlete_id: figlio,
          guardian_id: seconda.id,
          role: "parent",
          one_time: true,
          minted_by_role: "owner",
          minted_by_user_id: PRESIDENTE,
        },
        updated_at: new Date(),
      },
    });

    /* La revoca della tessera della madre, dalla porta vera. */
    const tesseraMadre = await tessera(MADRE, "parent");
    await prisma.$transaction(async (tx) => {
      await legami.unlinkParentGuardians(tx, CLUB, MADRE, FAMIGLIA, "parent", tesseraMadre);
    });
    await prisma.organizationUser.delete({ where: { id: tesseraMadre } });

    const dopo = await righeDi(figlio);
    prova(
      "2b REPERTO — dopo la revoca resta viva una riga di quella persona",
      0,
      dopo.filter((r) => !r.revoked_at).length,
      `vive: ${JSON.stringify(dopo.filter((r) => !r.revoked_at).map((r) => ({ k: r.identity_key, e: r.email })))}`,
    );

    const gettone = await prisma.clubResourceItem.findFirst({ where: { name: CODICE } });
    prova(
      "2c REPERTO — e il gettone che nomina quella riga NON e stato revocato",
      "revoked",
      String(gettone?.status),
    );

    /* La persona appena revocata riscatta il gettone che aveva in tasca. */
    const esito = await riscatta(MADRE, CODICE);
    prova(
      "2d REPERTO — la persona revocata rientra riscattando quel gettone",
      false,
      esito.stato === 200,
      `stato ${esito.stato} — ${JSON.stringify(esito.corpo?.error?.message || "ok")}`,
    );

    const riapre = await cruscotto.getParentLinkedAthletes(MADRE);
    prova(
      "2e REPERTO — e l'area famiglia del minore si riapre",
      0,
      riapre.length,
      riapre.length ? `aperto: ${riapre.map((a) => a.first_name).join(", ")}` : "",
    );

    /*
      CONTROLLO DI DISCRIMINAZIONE: la stessa scena con UNA sola riga. Il
      gettone deve essere revocato e il riscatto deve fallire.
    */
    const figlioC = FIGLIO_DUE_C;
    const unica = (await righeDi(figlioC))[0];
    const CODICE_C = `QUARTOB${CLUB.slice(0, 5).toUpperCase()}`;
    await prisma.clubResourceItem.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        resource_type: "access_tokens",
        name: CODICE_C,
        status: "active",
        payload: {
          athlete_id: figlioC,
          guardian_id: unica.id,
          role: "parent",
          one_time: true,
          minted_by_role: "owner",
          minted_by_user_id: PRESIDENTE,
        },
        updated_at: new Date(),
      },
    });
    const tesseraPadre = await tessera(PADRE, "parent");
    await prisma.$transaction(async (tx) => {
      await legami.unlinkParentGuardians(tx, CLUB, PADRE, email("padre"), "parent", tesseraPadre);
    });
    await prisma.organizationUser.delete({ where: { id: tesseraPadre } });
    const gettoneC = await prisma.clubResourceItem.findFirst({ where: { name: CODICE_C } });
    prova(
      "2f controllo — con UNA riga sola il gettone viene revocato",
      "revoked",
      String(gettoneC?.status),
    );
    const esitoC = await riscatta(PADRE, CODICE_C);
    prova(
      "2g controllo — e il riscatto fallisce",
      false,
      esitoC.stato === 200,
      `stato ${esitoC.stato}`,
    );
  }

  /* ================================================================== *
   * §3 — la ricomposizione per posizione
   * ================================================================== */
  console.log("\n§3 — due righe su una posizione: cio che sparisce dalla scheda\n");
  {
    /*
      La forma che il travaso produce da solo: **una** voce del blob che nomina
      due utenze. Le due righe nascono con la stessa `position` e lo stesso
      `legacy_id`.
    */
    const figlio = FIGLIO_TRE;

    const righe = await righeDi(figlio);
    console.log("        DEBUG righe:", JSON.stringify(righe.map(r=>({id:r.id.slice(0,8),k:r.identity_key,u:r.user_id,e:r.email,p:r.position}))));
    prova(
      "3a controllo — il travaso ha fatto due righe con la stessa posizione",
      [2, 1],
      [righe.length, new Set(righe.map((r) => r.position)).size],
    );

    await tutori.refreshGuardianProjection(prisma, [figlio]);
    const proiettati = (await datiDi(figlio)).guardians || [];
    /*
      **Il contratto e cambiato, e va detto perche.**

      Il primo rimedio a questo reperto fu smettere di fondere le righe con un
      legame vivo, cosi che la scheda le mostrasse tutte. Il vaglio successivo
      ha misurato il prezzo: al primo salvataggio la proiezione passava da due
      voci a tre e **ogni lettore posizionale slittava di uno** — fra questi il
      destinatario fiscale di una ricevuta, cioe il codice fiscale che una
      famiglia porta in detrazione.

      La fusione e percio tornata com'era, e il buco si chiude dall'altro lato:
      la scheda mostra **una voce**, e revocarla revoca **tutte** le righe che
      le stanno dietro. Se una porta mostra una cosa sola, toglierla deve
      toglierla tutta — ed e la 3h a misurarlo.
    */
    prova(
      "3b la proiezione pubblica UNA voce per posizione",
      1,
      proiettati.length,
      `pubblicata: ${JSON.stringify(proiettati.map((g) => g.id))}`,
    );

    const nascosta = righe.find((r) => !proiettati.some((g) => g.id === r.id));
    prova(
      "3c SEMINA — e una riga sta dietro quella voce, non accanto",
      true,
      Boolean(nascosta),
      "senza una riga dietro la voce, 3h non misurerebbe niente",
    );

    if (nascosta) {
      /* Chi e la persona che la riga nascosta collega? */
      prova(
        "3d SEMINA — la riga dietro la voce porta un'utenza viva",
        nascosta.user_id,
        nascosta.user_id,
        `utenza: ${nascosta.user_id === ZIO_A ? "ZIO_A" : nascosta.user_id === ZIO_B ? "ZIO_B" : nascosta.user_id}`,
      );

      /* «Scollega account» dalla scheda: puo nominarla? */
      const trovata = await tutori.findGuardianRow(prisma, figlio, proiettati[0]?.id);
      prova(
        "3e REPERTO — la porta della scheda non puo nominare la riga nascosta",
        false,
        trovata?.id === nascosta.id,
        `«Scollega account» sull'unica voce pubblicata colpisce ${trovata?.id === nascosta.id ? "la nascosta" : "l'altra"}`,
      );

      /* E un invito che nomina la riga nascosta si riscatta? */
      const CODICE = `QUARTOC${CLUB.slice(0, 5).toUpperCase()}`;
      await prisma.clubResourceItem.create({
        data: {
          id: randomUUID(),
          organization_id: CLUB,
          resource_type: "access_tokens",
          name: CODICE,
          status: "active",
          payload: {
            athlete_id: figlio,
            guardian_id: nascosta.id,
            role: "parent",
            one_time: true,
            minted_by_role: "owner",
            minted_by_user_id: PRESIDENTE,
          },
          updated_at: new Date(),
        },
      });
      /* La persona nascosta ha accesso all'area famiglia del minore? */
      prova(
        '3g SEMINA — e quella persona apre davvero l area famiglia',
        1,
        (await cruscotto.getParentLinkedAthletes(nascosta.user_id)).length,
      );

      /* «Scollega account» dalla scheda, dalla porta vera, sull'unica voce che la scheda mostra. */
      const scope = {
        userId: PRESIDENTE,
        activeOrganizationId: CLUB,
        activeRole: 'owner',
        activeMembershipId: null,
        allowedOrganizationIds: [CLUB],
        accessScopes: [],
      };
      await legami
        .unlinkGuardianAccount(scope, { athleteId: figlio, guardianId: proiettati[0].id })
        .catch((e) => console.log('        scollega:', e.message.slice(0, 80)));
      prova(
        '3h PROPRIETA — «Scollega account» chiude ogni riga dietro la voce',
        0,
        (await cruscotto.getParentLinkedAthletes(nascosta.user_id)).length,
      );

      /*
        **E chiude anche gli inviti che nominano le righe dietro la voce.**

        Allargare la revoca all'intera voce senza allargare cio che la
        accompagna lasciava `active` il gettone che nomina la riga nascosta:
        una revoca riuscita con la sua strada di ritorno ancora aperta, che e
        la forma di difetto che questo pacchetto ha gia chiuso due volte.
        `linkGuardianAccount` azzera `revoked_at` e riscrive l'utenza, quindi
        chi ha quel codice in tasca rientra nel fascicolo del minore.
      */
      const gettoneNascosto = await prisma.clubResourceItem.findFirst({
        where: { organization_id: CLUB, resource_type: 'access_tokens', name: CODICE },
        select: { status: true },
      });
      prova(
        '3h-bis PROPRIETA — e l invito che nomina la riga dietro la voce e chiuso',
        'revoked',
        gettoneNascosto?.status ?? null,
        'una revoca che lascia vivo il suo invito e una revoca che si puo annullare',
      );

      const esito = await riscatta(ESTRANEO, CODICE);
      prova(
        /*
          Prima misurava D51 — un invito che nomina la riga dietro la voce
          rispondeva 404, perche il riscatto cerca il bersaglio nella
          proiezione, che quella riga non la pubblica. Da quando la revoca
          chiude i gettoni di **tutte** le righe della voce, qui il gettone
          arriva gia `revoked` e la risposta e 410: il rifiuto giusto, per la
          ragione giusta. D51 resta aperto ma questa fixture non lo misura
          piu — servirebbe un invito **vivo** che nomini una riga nascosta.
        */
        "3f l'invito chiuso dalla revoca e rifiutato come tale",
        410,
        esito.stato,
        `${JSON.stringify(esito.corpo?.error?.message || "ok")}`,
      );
    }
  }

  /* ================================================================== *
   * §5 — la revoca esce dalla scheda: un'ALTRA famiglia, lo stesso indirizzo
   * ================================================================== */
  console.log("\n§5 — la zia di un altro atleta, revocata insieme alla madre\n");
  {
    const righe = await righeDi(FIGLIO_CINQUE);
    prova(
      "5a REPERTO — la riga della zia (altro atleta, altra famiglia) e ancora viva",
      [1, 0],
      [righe.length, righe.filter((r) => r.revoked_at).length],
      `indirizzo condiviso: ${FAMIGLIA}`,
    );
    prova(
      "5b REPERTO — e la zia apre ancora l'area famiglia del proprio nipote",
      1,
      (await cruscotto.getParentLinkedAthletes(ZIA)).length,
    );
    const dati = await datiDi(FIGLIO_CINQUE);
    prova(
      "5c REPERTO — l'indirizzo della zia non e finito fra le identita revocate",
      false,
      (dati.revokedGuardianIdentities || []).includes(FAMIGLIA),
      `registro: ${JSON.stringify(dati.revokedGuardianIdentities || [])}`,
    );
  }

  /* CONTROLLO §3 — le stesse due persone su DUE posizioni distinte. */
  console.log("\n§3 controllo — due posizioni distinte\n");
  {
    const figlio = FIGLIO_TRE_C;
    const righe = await righeDi(figlio);
    prova(
      "3i controllo — due righe su due posizioni",
      [2, 2],
      [righe.length, new Set(righe.map((r) => r.position)).size],
    );
    await tutori.refreshGuardianProjection(prisma, [figlio]);
    const proiettati = (await datiDi(figlio)).guardians || [];
    prova("3j controllo — la proiezione le pubblica tutte e due", 2, proiettati.length);

    const scope = {
      userId: PRESIDENTE,
      activeOrganizationId: CLUB,
      activeRole: "owner",
      activeMembershipId: null,
      allowedOrganizationIds: [CLUB],
      accessScopes: [],
    };
    const bersaglio = righe.find((r) => r.user_id);
    prova(
      "3k controllo — prima, quella persona apre l'area famiglia",
      1,
      (await cruscotto.getParentLinkedAthletes(bersaglio.user_id)).length,
    );
    await legami
      .unlinkGuardianAccount(scope, { athleteId: figlio, guardianId: bersaglio.id })
      .catch((e) => console.log("        scollega:", e.message.slice(0, 90)));
    prova(
      "3l controllo — e «Scollega account» la chiude davvero",
      0,
      (await cruscotto.getParentLinkedAthletes(bersaglio.user_id)).length,
    );
  }

  /* ================================================================== *
   * §4 — la rotta generica e i diritti dell'interessato
   * ================================================================== */
  console.log("\n§4 — l'elenco vuoto, l'elenco malformato e il riepilogo GDPR\n");
  {
    const soggetti = await carica("src/lib/server/data-subject.ts");
    const figlio = await atleta("FiglioQuattro", { birthDate: "2015-04-01" });
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: figlio,
      rows: [
        { firstName: "Nonno", lastName: "Quarto", phone: "3331111111", legacyId: "q-1" },
      ],
      canGrantAccess: true,
    });

    const sessioneOwner = (
      await auth.createSessionForUser(
        await prisma.user.findUnique({ where: { id: PRESIDENTE } }),
      )
    ).access_token;

    /* Un elenco malformato: si ignora, non si distrugge. */
    await chiama(
      "PATCH",
      `/api/v1/athletes/${figlio}`,
      { last_name: "Quarto", data: { guardians: null } },
      sessioneOwner,
      "owner",
    );
    prova(
      "4a controllo — `guardians: null` non cancella l'anagrafica dei tutori",
      1,
      (await righeDi(figlio)).length,
    );

    /* Un elenco VUOTO e una dichiarazione: si toglie tutto. */
    await chiama(
      "PATCH",
      `/api/v1/athletes/${figlio}`,
      { last_name: "Quarto", data: { guardians: [] } },
      sessioneOwner,
      "owner",
    );
    prova(
      "4b controllo — `guardians: []` toglie davvero i tutori (percorso legittimo)",
      0,
      (await righeDi(figlio)).length,
    );

    /* Ora il riepilogo GDPR. */
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: figlio,
      rows: [
        {
          firstName: "Madre",
          lastName: "Quarto",
          email: email("madregdpr"),
          phone: "3332222222",
          legacyId: "q-2",
          extra: { fiscalCode: "RSSMRA80A41H501U", address: "Via Roma 1" },
        },
      ],
      canGrantAccess: true,
    });

    const scope = {
      userId: PRESIDENTE,
      activeOrganizationId: CLUB,
      allowedOrganizationIds: [CLUB],
      activeRole: "owner",
      accessScopes: [],
    };

    const riepilogo = await soggetti.previewDataSubjectErasure(scope, {
      organizationId: CLUB,
      subjectKind: "athlete",
      subjectId: figlio,
    });
    const nominaTutori = riepilogo.slices.some((s) =>
      String(s.table).includes("guardian"),
    );
    prova(
      "4c REPERTO — il riepilogo di cio che verra distrutto nomina i tutori",
      true,
      nominaTutori,
      `tabelle: ${riepilogo.slices.map((s) => s.table).join(", ").slice(0, 160)}`,
    );

    /*
      E il gettone e l'impronta del riepilogo: se l'inventario cambia, la
      cancellazione non deve partire. Si aggiunge un tutore DOPO il riepilogo.
    */
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: figlio,
      rows: [
        { firstName: "Madre", lastName: "Quarto", email: email("madregdpr"), legacyId: "q-2" },
        { firstName: "Padre", lastName: "Quarto", phone: "3333333333", legacyId: "q-3" },
      ],
      canGrantAccess: true,
    });

    let esitoCancellazione = "riuscita";
    try {
      await soggetti.eraseDataSubject(scope, {
        organizationId: CLUB,
        subjectKind: "athlete",
        subjectId: figlio,
        confirmationToken: riepilogo.confirmationToken,
        acknowledgeMinor: true,
        reason: "vaglio",
      });
    } catch (errore) {
      esitoCancellazione = String(errore?.message || "").slice(0, 70);
    }
    prova(
      "4d REPERTO — un tutore aggiunto dopo il riepilogo invalida il gettone",
      false,
      esitoCancellazione === "riuscita",
      `esito: ${esitoCancellazione}`,
    );
    /*
      **Il controllo che dice che il gettone non e diventato un muro.**

      La prima stesura chiedeva qui che le righe fossero distrutte, ma la
      chiedeva **dopo** una cancellazione che 4d pretende fallita: passava solo
      finche il gettone non copriva i tutori, cioe finche il difetto c'era.

      La proprieta giusta e in due tempi: con il gettone vecchio si rifiuta
      (4d), con un riepilogo **rifatto** si cancella (4e). Senza la seconda
      meta, un inventario che rifiutasse sempre passerebbe 4d.
    */
    const riepilogoFresco = await soggetti.previewDataSubjectErasure(scope, {
      organizationId: CLUB,
      subjectKind: "athlete",
      subjectId: figlio,
    });
    let esitoSecondo = "riuscita";
    try {
      await soggetti.eraseDataSubject(scope, {
        organizationId: CLUB,
        subjectKind: "athlete",
        subjectId: figlio,
        confirmationToken: riepilogoFresco.confirmationToken,
        acknowledgeMinor: true,
        reason: "vaglio",
      });
    } catch (errore) {
      esitoSecondo = String(errore?.message || "").slice(0, 70);
    }
    prova(
      "4e CONTROLLO con il riepilogo rifatto la cancellazione passa",
      "riuscita",
      esitoSecondo,
    );
    prova(
      "4f — e le righe dei tutori sono state distrutte",
      0,
      (await righeDi(figlio)).length,
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
    where: {
      id: { in: [PRESIDENTE, SEGRETARIA, ESTRANEO, MADRE, PADRE, ZIO_A, ZIO_B, ZIO_C, ZIA] },
    },
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
