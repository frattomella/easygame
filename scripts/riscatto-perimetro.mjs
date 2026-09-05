/**
 * **Il riscatto di un gettone: che cosa consegna davvero.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs scripts/riscatto-perimetro.mjs
 *
 * ---
 *
 * ## Il difetto che misura
 *
 * Le due strade del riscatto creano una tessera e **non scrivono nessuna riga
 * di perimetro**. Per ADR-0103 zero righe non significa «nessun accesso»:
 * significa **tutto il club**. Quindi un gettone coniato da un gestore
 * recintato sulla sede A consegna un accesso che vede anche la sede B, e un
 * atleta collegato al proprio profilo esce con il perimetro piu largo che il
 * modello preveda.
 *
 * La stessa lezione era gia stata imparata sull'altro lato:
 * `accessScopeContains` esiste perche «un `club_manager` recintato sulla sede
 * Nord concedeva a una seconda utenza un `club_manager` **senza perimetro**, e
 * da quel momento leggeva tutto il club per interposta persona». Quella regola
 * vale sulla Gestione accessi e **non** sul riscatto.
 *
 * ## Le invarianti che questa sonda difende
 *
 *   * **A** — zero righe non deve diventare «tutto il club» quando il gettone
 *     nasce da un contesto ristretto;
 *   * **B** — il riscatto non concede un perimetro piu largo di quello che
 *     l'emittente aveva, ne di quello del profilo di origine;
 *   * **C** — un gettone legato a un profilo preciso non si riscatta per un
 *     altro profilo, non si riusa oltre la cardinalita prevista, non vale in
 *     un altro club;
 *   * **D** — un gettone multiuso ha una semantica dichiarata e limitata: non
 *     e illimitato per il fatto che non nomina un profilo;
 *   * **E** — ruoli personalizzati e alias passano dal risolutore canonico;
 *   * **F** — dopo il riscatto lo stato e utilizzabile subito, senza passare
 *     dalla Gestione accessi.
 *
 * La sonda misura, non corregge. I club sono cancellati in `finally`.
 */

import { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("Rifiuto: serve EASYGAME_DB_ENV=development.");
  process.exit(1);
}

const prisma = new PrismaClient();
const carica = (rel) => import(pathToFileURL(path.resolve(rel)).href);
const hashToken = (token) => createHash("sha256").update(token).digest("hex");

const esiti = [];
const prova = (titolo, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ titolo, ok });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(70)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        nota: ${nota}`);
};

const CLUB = randomUUID();
const ALTRO_CLUB = randomUUID();
const SEDE_A = "sede-riscatto-a";
const SEDE_B = "sede-riscatto-b";
/* Due categorie con lo **stesso nome** in due sedi diverse: e il caso che il
   perimetro deve saper distinguere per identificativo, mai per etichetta. */
const CAT_PA = "cat-riscatto-pulcini-a";
const CAT_PB = "cat-riscatto-pulcini-b";

const ATLETA = randomUUID();
const ATLETA_ALTRA_SEDE = randomUUID();

let PRESIDENTE = null;
let GESTORE_RECINTATO = null;
let U_ATLETA = null;
let U_ALLENATORE = null;
let U_GENITORE = null;
let U_ESTRANEO = null;
let U_TUTORE = null;
let U_ESTRANEO2 = null;

const utente = async (email, nome, verificata = true) =>
  prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      first_name: nome,
      last_name: "Riscatto",
      password_hash: "$2b$10$riscatto",
      role: "user",
      email_verified_at: verificata ? new Date() : null,
      updated_at: new Date(),
    },
  });

const pulisciResidui = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "riscatto-" } },
    select: { id: true },
  });
  const ids = residui.map((r) => r.id);
  if (ids.length) {
    await prisma.auditLog
      .deleteMany({ where: { organization_id: { in: ids } } })
      .catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.user.deleteMany({
    where: { email: { startsWith: "riscatto-" } },
  });
};

const semina = async () => {
  await pulisciResidui();

  PRESIDENTE = await utente("riscatto-presidente@example.invalid", "Paola");
  GESTORE_RECINTATO = await utente("riscatto-gestore@example.invalid", "Gino");
  U_ATLETA = await utente("riscatto-atleta@example.invalid", "Aldo", false);
  U_ALLENATORE = await utente("riscatto-allenatore@example.invalid", "Mario");
  U_GENITORE = await utente("riscatto-genitore@example.invalid", "Anna");
  U_ESTRANEO = await utente("riscatto-estraneo@example.invalid", "Elena");
  U_TUTORE = await utente("riscatto-tutore@example.invalid", "Teresa");
  U_ESTRANEO2 = await utente("riscatto-estraneo2@example.invalid", "Enzo");

  const club = (id, slug, nome) => ({
    id,
    slug,
    name: nome,
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
      { id: CAT_PA, name: "Pulcini" },
      { id: CAT_PB, name: "Pulcini" },
    ],
    club_sites: [
      { id: SEDE_A, name: "Scauri", active: true },
      { id: SEDE_B, name: "Santi Cosma", active: true },
    ],
    trainers: [
      {
        id: "trainer-riscatto",
        name: "Mario",
        surname: "Riscatto",
        email: U_ALLENATORE.email,
        categories: [CAT_PA],
      },
    ],
    staff_members: [],
    trainings: [],
    matches: [],
    appointments: [],
    updated_at: new Date(),
  });

  await prisma.club.create({ data: club(CLUB, `riscatto-${Date.now()}`, "ASD Riscatto") });
  await prisma.club.create({
    data: {
      ...club(ALTRO_CLUB, `riscatto-altro-${Date.now()}`, "ASD Altrove"),
      trainers: [],
    },
  });

  /* Il gestore e **recintato sulla sede A**: e l'emittente dei gettoni. */
  const tesseraGestore = await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: GESTORE_RECINTATO.id,
      role: "club_manager",
      is_primary: true,
      updated_at: new Date(),
    },
  });
  await prisma.clubAccessScope.create({
    data: {
      id: randomUUID(),
      organization_user_id: tesseraGestore.id,
      scope_kind: "site",
      scope_value: SEDE_A,
    },
  });

  /*
    La scheda allenatore vive in **due** rappresentazioni, e il riscatto cerca
    la riga: la proiezione JSON su `clubs.trainers` da sola non basta.
  */
  await prisma.clubResourceItem.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      resource_type: "trainers",
      name: "Mario Riscatto",
      payload: {
        id: "trainer-riscatto",
        name: "Mario",
        surname: "Riscatto",
        email: U_ALLENATORE.email,
        categories: [CAT_PA],
      },
      updated_at: new Date(),
    },
  });

  await prisma.athlete.create({
    data: {
      id: ATLETA,
      organization_id: CLUB,
      first_name: "Aldo",
      last_name: "Riscatto",
      birth_date: new Date(Date.UTC(2012, 4, 12)),
      status: "active",
      category_id: CAT_PA,
      category_name: "Pulcini",
      data: {
        guardians: [
          {
            id: "guardian-riscatto",
            name: "Anna",
            surname: "Riscatto",
            relationship: "Madre",
            email: U_GENITORE.email,
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
      athlete_id: ATLETA,
      category_id: CAT_PA,
      site_id: SEDE_A,
      is_primary: true,
      updated_at: new Date(),
    },
  });

  /* Un atleta dell'**altra** sede: serve a misurare che il perimetro chiuda. */
  await prisma.athlete.create({
    data: {
      id: ATLETA_ALTRA_SEDE,
      organization_id: CLUB,
      first_name: "Bruno",
      last_name: "Altrove",
      birth_date: new Date(Date.UTC(2012, 4, 12)),
      status: "active",
      category_id: CAT_PB,
      category_name: "Pulcini",
      data: {},
      updated_at: new Date(),
    },
  });
  await prisma.athleteCategoryMembership.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      athlete_id: ATLETA_ALTRA_SEDE,
      category_id: CAT_PB,
      site_id: SEDE_B,
      is_primary: true,
      updated_at: new Date(),
    },
  });
};

/* ------------------------------------------------------------- osservazione */

const perimetroDi = async (userId, organizationId = CLUB) => {
  const tessera = await prisma.organizationUser.findFirst({
    where: { organization_id: organizationId, user_id: userId },
    select: { id: true, role: true },
  });
  if (!tessera) return null;
  const righe = await prisma.clubAccessScope.findMany({
    where: { organization_user_id: tessera.id },
    select: { scope_kind: true, scope_value: true },
    orderBy: [{ scope_kind: "asc" }, { scope_value: "asc" }],
  });
  return {
    role: tessera.role,
    scopes: righe.map((r) => ({ kind: r.scope_kind, value: r.scope_value })),
  };
};

/** Il gettone dell'atleta, seminato come lo scrive `sendAthleteAccountInvite`. */
const invitoAtleta = async (token, opzioni = {}) =>
  prisma.athleteAccountInvite.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      athlete_id: opzioni.athleteId || ATLETA,
      user_id: U_ATLETA.id,
      email: U_ATLETA.email,
      token_hash: hashToken(token),
      status: opzioni.status || "sent",
      expires_at:
        opzioni.expiresAt || new Date(Date.now() + 72 * 60 * 60 * 1000),
      sent_at: new Date(),
      created_by: GESTORE_RECINTATO.id,
    },
  });

/** Un gettone della rotta generica, come lo conia `access_tokens`. */
const gettone = async (codice, payload, organizationId = CLUB) =>
  prisma.clubResourceItem.create({
    data: {
      id: randomUUID(),
      organization_id: organizationId,
      resource_type: "access_tokens",
      name: codice,
      status: "active",
      payload,
      updated_at: new Date(),
    },
  });

let rottaRiscatto = null;
const riscatta = async (utenteRiga, codice) => {
  const auth = await carica("src/lib/server/auth.ts");
  const sessione = await auth.createSessionForUser(utenteRiga);
  const risposta = await rottaRiscatto.POST(
    new Request("http://collaudo.invalid/api/v1/auth/access/redeem", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sessione.access_token}`,
        /*
          Un indirizzo diverso per ogni chiamata: la rotta ha un tetto di
          tentativi **per IP**, ed e giusto che ce l abbia. Senza questo la
          sonda misurerebbe il proprio rumore invece del prodotto — le ultime
          asserzioni tornerebbero 429 e sembrerebbero difetti.
        */
        "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 250) + 1}`,
      },
      body: JSON.stringify({ token: codice }),
    }),
  );
  return { stato: risposta.status, corpo: await risposta.json() };
};

/* -------------------------------------------------------------------- corpo */

const main = async () => {
  await semina();

  const conti = await carica("src/lib/server/athlete-accounts.ts");
  const perimetro = await carica("src/lib/roles/access-scope.ts");
  rottaRiscatto = await carica("src/app/api/v1/auth/access/redeem/route.ts");

  console.log("\n§1 — il gettone dell'atleta\n");

  await invitoAtleta("ATL-TOKEN-001");
  let esitoA = "accettato";
  try {
    await conti.acceptAthleteAccountInvite("ATL-TOKEN-001");
  } catch (errore) {
    esitoA = String(errore?.message || errore);
  }
  prova("R-01 il riscatto riesce", "accettato", esitoA);

  const scheda = await prisma.athlete.findUnique({
    where: { id: ATLETA },
    select: { user_id: true },
  });
  prova("R-02 la scheda atleta e collegata a quell'utenza", U_ATLETA.id, scheda?.user_id);

  const dopoAtleta = await perimetroDi(U_ATLETA.id);
  prova("R-03 la tessera nasce con il ruolo canonico", "athlete", dopoAtleta?.role);

  prova(
    "R-04 INVARIANTE A — il perimetro deriva dalle appartenenze dell'atleta",
    [
      { kind: "category", value: CAT_PA },
      { kind: "site", value: SEDE_A },
    ],
    dopoAtleta?.scopes,
    "zero righe qui significa TUTTO IL CLUB (ADR-0103), non «nessun accesso»",
  );

  prova(
    "R-05 INVARIANTE A — e la sede che non gli compete resta chiusa",
    false,
    perimetro.accessScopeAllows(dopoAtleta?.scopes, {
      siteId: SEDE_B,
      categoryId: CAT_PB,
    }),
  );

  prova(
    "R-06 mentre la propria resta aperta",
    true,
    perimetro.accessScopeAllows(dopoAtleta?.scopes, {
      siteId: SEDE_A,
      categoryId: CAT_PA,
    }),
  );

  /* Replay, scaduto, revocato: la stessa risposta per tutti e tre. */
  let replay = "accettato";
  try {
    await conti.acceptAthleteAccountInvite("ATL-TOKEN-001");
  } catch (errore) {
    replay = "rifiutato";
  }
  prova("R-07 INVARIANTE C — un gettone gia riscattato non si riusa", "rifiutato", replay);

  await invitoAtleta("ATL-TOKEN-SCADUTO", {
    expiresAt: new Date(Date.now() - 60_000),
  });
  let scaduto = "accettato";
  try {
    await conti.acceptAthleteAccountInvite("ATL-TOKEN-SCADUTO");
  } catch (errore) {
    scaduto = "rifiutato";
  }
  prova("R-08 un gettone scaduto non si riscatta", "rifiutato", scaduto);

  await invitoAtleta("ATL-TOKEN-REVOCATO", { status: "revoked" });
  let revocato = "accettato";
  try {
    await conti.acceptAthleteAccountInvite("ATL-TOKEN-REVOCATO");
  } catch (errore) {
    revocato = "rifiutato";
  }
  prova("R-09 ne uno revocato", "rifiutato", revocato);

  console.log("\n§2 — il gettone dell'allenatore, coniato da un gestore recintato\n");

  /*
    L'emittente vede **la sola sede A**. Il gettone porta la sua firma di
    ruolo (`minted_by_role`) da quando la Wave 6 ha chiuso il soffitto del
    ruolo; il suo **perimetro** non lo porta, ed e il buco che si misura qui.
  */
  await gettone("TRNTOKEN001", {
    role: "trainer",
    trainer_id: "trainer-riscatto",
    one_time: true,
    minted_by_role: "club_manager",
    minted_by_user_id: GESTORE_RECINTATO.id,
  });

  const esitoT = await riscatta(U_ALLENATORE, "TRNTOKEN001");
  prova("R-20 il riscatto dell'allenatore riesce", 200, esitoT.stato);

  const dopoAllenatore = await perimetroDi(U_ALLENATORE.id);
  prova("R-21 con il ruolo canonico", "trainer", dopoAllenatore?.role);

  prova(
    "R-22 INVARIANTE B — il perimetro non e piu largo di quello dell'emittente",
    true,
    perimetro.accessScopeContains(
      [{ kind: "site", value: SEDE_A }],
      dopoAllenatore?.scopes || [],
    ),
    "un emittente recintato sulla sede A non puo consegnare un accesso a tutto il club",
  );

  prova(
    "R-23 INVARIANTE B — e la sede B resta chiusa",
    false,
    perimetro.accessScopeAllows(dopoAllenatore?.scopes, {
      siteId: SEDE_B,
      categoryId: CAT_PB,
    }),
  );

  /* La scheda e collegata: e la meta «immediatamente utilizzabile». */
  const clubDopo = await prisma.club.findUnique({
    where: { id: CLUB },
    select: { trainers: true },
  });
  const schedaAllenatore = (clubDopo?.trainers || []).find(
    (r) => r?.id === "trainer-riscatto",
  );
  prova(
    "R-24 INVARIANTE F — la scheda allenatore risulta collegata subito",
    U_ALLENATORE.id,
    schedaAllenatore?.linkedUserId || null,
  );

  /* Cardinalita: un gettone legato a un profilo non serve un secondo utente. */
  const secondo = await riscatta(U_ESTRANEO, "TRNTOKEN001");
  prova(
    "R-25 INVARIANTE C — un secondo utente non riscatta lo stesso gettone",
    true,
    secondo.stato >= 400,
  );

  console.log("\n§3 — il gettone multiuso senza profilo\n");

  /*
    `one_time: false` e nessun `trainer_id`/`athlete_id`/`guardian_id`: non c'e
    `alreadyLinkedUserId` che lo fermi, e lo stato resta `active`. Oggi lo
    riscattano utenti illimitati.
  */
  await gettone("MULTITOKEN001", {
    role: "member",
    one_time: false,
    minted_by_role: "club_manager",
    minted_by_user_id: GESTORE_RECINTATO.id,
  });

  const primoMulti = await riscatta(U_GENITORE, "MULTITOKEN001");
  const secondoMulti = await riscatta(U_ESTRANEO, "MULTITOKEN001");

  /*
    Due asserzioni separate, e la prima serve a non far passare la seconda a
    vuoto: se il gettone non fosse riscattabile affatto, «il secondo utente e
    respinto» sarebbe vero senza dire niente.
  */
  prova(
    "R-29 il primo riscatto di un gettone multiuso riesce",
    200,
    primoMulti.stato,
  );

  prova(
    "R-30 INVARIANTE D — ma un secondo utente non lo riscatta",
    true,
    secondoMulti.stato >= 400,
    "senza legame a un profilo e senza cardinalita dichiarata, lo riscattano utenti illimitati",
  );

  const perimetroMulti = await perimetroDi(U_ESTRANEO.id);
  if (perimetroMulti) {
    prova(
      "R-31 INVARIANTE A — e se entra, non entra con tutto il club",
      false,
      perimetro.accessScopeAllows(perimetroMulti.scopes, {
        siteId: SEDE_B,
        categoryId: CAT_PB,
      }),
    );
  } else {
    prova("R-31 INVARIANTE A — e se entra, non entra con tutto il club", true, true);
  }

  console.log("\n§4 — cio che gia regge, e non deve rompersi\n");

  await gettone("CUSTOMTOKEN001", {
    role: "custom:trainer:vice",
    one_time: true,
    minted_by_role: "owner",
  });
  const custom = await riscatta(U_ESTRANEO, "CUSTOMTOKEN001");
  prova(
    "R-40 INVARIANTE E — un ruolo personalizzato non si concede con un gettone",
    403,
    custom.stato,
  );

  /* Un gettone di un altro club non entra in questo. */
  await gettone(
    "CROSSTOKEN001",
    { role: "trainer", one_time: true, minted_by_role: "owner" },
    ALTRO_CLUB,
  );
  const cross = await riscatta(U_ESTRANEO, "CROSSTOKEN001");
  const tesseraCross = await prisma.organizationUser.findFirst({
    where: { organization_id: CLUB, user_id: U_ESTRANEO.id, role: "trainer" },
  });
  prova(
    "R-41 INVARIANTE C — un gettone di un altro club non tessera in questo",
    null,
    tesseraCross,
    `stato: ${cross.stato}`,
  );

  console.log("\n§5 — il gettone del tutore, e il conio vero\n");

  await gettone("TUTTOKEN001", {
    token_type: "parent_access",
    athlete_id: ATLETA,
    guardian_id: "guardian-riscatto",
    one_time: true,
    minted_by_role: "club_manager",
    minted_by_user_id: GESTORE_RECINTATO.id,
  });

  const esitoG = await riscatta(U_TUTORE, "TUTTOKEN001");
  prova("R-50 il riscatto del tutore riesce", 200, esitoG.stato);

  const schedaConTutore = await prisma.athlete.findUnique({
    where: { id: ATLETA },
    select: { data: true },
  });
  const rigaTutore = (schedaConTutore?.data?.guardians || []).find(
    (r) => r?.id === "guardian-riscatto",
  );
  prova(
    "R-51 e collega esattamente quella riga tutore",
    U_TUTORE.id,
    rigaTutore?.linkedUserId || null,
  );

  const dopoTutore = await perimetroDi(U_TUTORE.id);
  prova("R-52 con il ruolo canonico", "parent", dopoTutore?.role);

  prova(
    "R-53 INVARIANTE B — e il perimetro del minore, dentro quello dell'emittente",
    true,
    perimetro.accessScopeContains(
      [{ kind: "site", value: SEDE_A }],
      dopoTutore?.scopes || [],
    ),
  );

  prova(
    "R-54 INVARIANTE A — la sede B resta chiusa anche al tutore",
    false,
    perimetro.accessScopeAllows(dopoTutore?.scopes, {
      siteId: SEDE_B,
      categoryId: CAT_PB,
    }),
  );

  /*
    **Il conio vero.** Fin qui i gettoni sono stati seminati a mano, cioe senza
    la firma del perimetro: si e misurato il ripiego. Qui il gettone nasce dalla
    porta che lo conia davvero, con lo scope del gestore recintato, e si chiede
    che la firma ci sia e che il riscatto la onori.
  */
  const risorse = await carica("src/lib/server/resources.ts");
  const scopeGestore = {
    userId: GESTORE_RECINTATO.id,
    activeOrganizationId: CLUB,
    activeRole: "club_manager",
    allowedOrganizationIds: [CLUB],
    accessScopes: [{ kind: "site", value: SEDE_A }],
  };

  await risorse.createResource(
    "access_tokens",
    {
      organization_id: CLUB,
      name: "CONIATO001",
      status: "active",
      payload: { role: "trainer", one_time: true },
    },
    "create",
    scopeGestore,
  );

  const coniato = await prisma.clubResourceItem.findFirst({
    where: { organization_id: CLUB, resource_type: "access_tokens", name: "CONIATO001" },
    select: { payload: true },
  });
  prova(
    "R-60 il conio timbra il perimetro dell'emittente sul gettone",
    [{ kind: "site", value: SEDE_A }],
    coniato?.payload?.minted_by_scopes || null,
    "senza la firma il riscatto non puo sapere che chi ha coniato vedeva una sede sola",
  );

  const esitoConiato = await riscatta(U_ESTRANEO2, "CONIATO001");
  prova("R-61 e il gettone coniato si riscatta", 200, esitoConiato.stato);

  const dopoConiato = await perimetroDi(U_ESTRANEO2.id);
  prova(
    "R-62 INVARIANTE B — consegnando il perimetro firmato, non tutto il club",
    [{ kind: "site", value: SEDE_A }],
    dopoConiato?.scopes,
  );

  console.log("\n§6 — concorrenza e profilo sbagliato\n");

  /*
    Due riscatti simultanei dello stesso invito: uno solo deve entrare. E la
    domanda che una sonda sequenziale non pone, e la sola in cui la protezione
    contro il replay puo cedere.
  */
  await invitoAtleta("ATLTOKENGARA", { athleteId: ATLETA_ALTRA_SEDE });
  const gara = await Promise.allSettled([
    conti.acceptAthleteAccountInvite("ATLTOKENGARA"),
    conti.acceptAthleteAccountInvite("ATLTOKENGARA"),
  ]);
  const riusciti = gara.filter((r) => r.status === "fulfilled").length;
  prova(
    "R-70 due riscatti simultanei dello stesso invito: ne entra uno solo",
    1,
    riusciti,
  );

  const tessereGara = await prisma.organizationUser.count({
    where: { organization_id: CLUB, user_id: U_ATLETA.id, role: "athlete" },
  });
  prova("R-71 e la tessera resta una sola", 1, tessereGara);

  /*
    Un gettone legato all'allenatore non deve poter collegare un **altro**
    profilo: l'identificativo del profilo vive nel gettone, non nel corpo della
    richiesta, quindi la sostituzione non e nemmeno esprimibile. La sonda lo
    dichiara perche e un'invariante, non perche il codice oggi la violi.
  */
  await gettone("TRNTOKEN002", {
    role: "trainer",
    trainer_id: "trainer-inesistente",
    one_time: true,
    minted_by_role: "owner",
  });
  const profiloAssente = await riscatta(U_ESTRANEO2, "TRNTOKEN002");
  prova(
    "R-72 INVARIANTE C — un gettone che nomina un profilo inesistente non tessera",
    404,
    profiloAssente.stato,
  );
};

try {
  await main();
} finally {
  for (const id of [CLUB, ALTRO_CLUB]) {
    await prisma.auditLog
      .deleteMany({ where: { organization_id: id } })
      .catch(() => {});
    await prisma.club.deleteMany({ where: { id } }).catch(() => {});
  }
  await prisma.user
    .deleteMany({ where: { email: { startsWith: "riscatto-" } } })
    .catch(() => {});
  await prisma.$disconnect();
}

const ko = esiti.filter((e) => !e.ok).length;
console.log(`\nEsito: ${esiti.length - ko}/${esiti.length}`);
process.exit(ko ? 1 : 0);
