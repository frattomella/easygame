/**
 * **Sesto vaglio ostile su PP-02.** Misura, non corregge.
 *
 * Le frasi che questa sonda cerca di falsificare, scritte in testa perche
 * sopravvivano a un'interruzione — come ha fatto il revisore perso, la cui
 * sonda a meta ha prodotto il commit 0236bf3.
 *
 *  §A  athlete-guardians.ts:1953-1975 — «La fusione torna percio com'era, e il
 *      buco si chiude dall'altro lato: `revokeGuardianRow` non revoca una riga
 *      ma la voce». E athlete-guardians.ts:1740 (`proiettaRiga`) — «La
 *      proiezione riproduce la forma vecchia per intero, righe revocate
 *      comprese e con i loro marchi: e la condizione perche i lettori storici
 *      si comportino esattamente come prima».
 *      Ipotesi D53: le posizioni delle righe revocate non si rinumerano, due
 *      righe condividono una posizione, e `perPosizione` le fonde con «chi
 *      chiude vince». Un tutore VIVO comparirebbe come revocato, e la riga
 *      viva sparirebbe dalla scheda.
 *
 *  §B  athlete-guardians.ts:900-912 — «Una riga revocata non si toglie da qui
 *      [...] Una riga `contact_only` invece si puo togliere — non apre
 *      niente». Il rovescio taciuto: una riga VIVA e non nominata si toglie
 *      sempre, senza revoca e senza audit.
 *      Ipotesi D52: dopo la fusione di §A la scheda non nomina piu la riga
 *      viva nascosta, e il salvataggio ordinario successivo la distrugge.
 *
 *  §C  athlete-guardians.ts:1240-1250 — «Si revoca la voce, non la riga [...]
 *      tutte le righe che la scheda mostra come una sola. Se la porta mostra
 *      una cosa sola, toglierla deve toglierla tutta.»
 *      Il verso opposto: la voce fusa di §A porta l'identificativo della riga
 *      REVOCATA. Che cosa fa «Scollega account» su una voce cosi, e che cosa
 *      fa la revoca della tessera.
 *
 *  §D  scripts/pp-02-quinto-vaglio.mjs:656 — «L2 la funzione viva porta ogni
 *      condizione che la migrazione dichiara [...] l'archivio e andato alla
 *      deriva dalla migrazione: la difesa non e quella committata».
 *      La sonda cerca un TESTO, non un ATTO. E vacua rispetto agli stati in
 *      cui il testo c'e e la difesa non c'e?
 *
 *  §E  athlete-guardians.ts:960-985 / form-submissions.ts:2179 — «Un ruolo di
 *      club ristretto ai soli moduli [...] compilava un modulo interno
 *      dichiarandosi tutore di un minore qualunque, lo approvava, e da quel
 *      momento apriva il fascicolo sanitario. [...] `canGrantAccess`
 *      obbligatorio». Percorsa dalla rotta HTTP vera.
 *
 *  §G  prisma/migrations/.../migration.sql — la deroga dell'utenza
 *      cancellata: «Si passa solo se l'utenza non c'e piu davvero, e solo per
 *      togliere quel riferimento: ogni altro campo deve restare com'era». Il
 *      vaglio fissa QUATTRO colonne su dodici. Le altre otto — fra cui
 *      `position` (che decide che cosa revoca la revoca) e `legacy_id` (che
 *      decide quale gettone nomina la riga) — sono libere.
 *
 * ---
 *
 * **Esito al 2026-09-06.** §A, §B e §C sono ROSSE; §E e §G sono verdi e
 * discriminano. §A ha DUE rami, decisi da `id asc` a pari posizione e pari
 * istante di creazione: entrambi difettosi, e si alternano fra un'esecuzione
 * e l'altra — la riga «ramo del pareggio» dice quale e uscito.
 *
 * **Non misurato in questa tornata** (dichiarato come lacuna, non come
 * verde): `revokeGuardianAccessInClub` / `diUnAltraPersona` con una persona
 * che ha due utenze; il rollover di stagione incrociato con la revoca; le
 * revoche concorrenti; il riscatto cross-club e il replay; `simplified_athletes`;
 * i diritti dell'interessato da un capo all'altro.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { travasaTutori } from "./helpers/travaso-tutori.mjs";

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
const CLUB_B = randomUUID();
const PRESIDENTE = randomUUID();
const SEGRETARIA = randomUUID();
const MODULISTA = randomUUID();
const MADRE = randomUUID();
const PADRE = randomUUID();
const ZIA = randomUUID();

const coda = `${CLUB.slice(0, 8)}@sesto.local`;
const email = (chi) => `${chi}-${coda}`;

const utente = (id, indirizzo, nome) => ({
  id,
  email: indirizzo,
  email_verified_at: new Date(),
  first_name: nome,
  last_name: "Sesto",
  password_hash: "$2b$10$sesto",
  role: "user",
});

const atleta = async (nome, data = {}, club = CLUB) => {
  const id = randomUUID();
  await prisma.athlete.create({
    data: {
      id,
      organization_id: club,
      first_name: nome,
      last_name: "Sesto",
      status: "active",
      data,
      updated_at: new Date(),
    },
  });
  return id;
};

const tessera = async (userId, ruolo, clubRoleId = null, club = CLUB) =>
  prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: club,
      user_id: userId,
      role: ruolo,
      custom_role_id: clubRoleId,
      is_primary: true,
      updated_at: new Date(),
    },
  });

const righeDi = async (athleteId) =>
  prisma.athleteGuardian.findMany({
    where: { athlete_id: athleteId },
    orderBy: [{ position: "asc" }, { created_at: "asc" }, { id: "asc" }],
  });

const datiDi = async (id) =>
  (await prisma.athlete.findUnique({ where: { id }, select: { data: true } }))
    ?.data || {};

let rotte = null;
const chiama = async (metodo, percorso, corpo, sessione, ruoloAttivo, club = CLUB) => {
  const url = new URL(percorso, "http://collaudo.invalid");
  const headers = new Headers({
    "content-type": "application/json",
    authorization: `Bearer ${sessione}`,
    "x-active-club-id": club,
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
  let corpoRisposta = null;
  try {
    corpoRisposta = await risposta.json();
  } catch {
    corpoRisposta = null;
  }
  return { stato: risposta.status, corpo: corpoRisposta };
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
  let corpo = null;
  try {
    corpo = await risposta.json();
  } catch {
    corpo = null;
  }
  return { stato: risposta.status, corpo };
};

/** «Scollega account» dalla rotta HTTP vera. */
const scollega = async (sessione, ruoloAttivo, athleteId, guardianId) => {
  const risposta = await rotte.scollega.DELETE(
    new Request(
      `http://collaudo.invalid/api/v1/guardian-accounts/${athleteId}/${guardianId}?reason=sesto`,
      {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${sessione}`,
          "x-active-club-id": CLUB,
          "x-active-access-role": ruoloAttivo,
          "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
        },
      },
    ),
    { params: { athleteId, guardianId } },
  );
  let corpo = null;
  try {
    corpo = await risposta.json();
  } catch {
    corpo = null;
  }
  return { stato: risposta.status, corpo };
};

const main = async () => {
  const tutori = await carica("src/lib/server/athlete-guardians.ts");
  const cruscotto = await carica("src/lib/server/parent-dashboard.ts");
  const legami = await carica("src/lib/server/profile-account-links.ts");
  const auth = await carica("src/lib/server/auth.ts");
  rotte = {
    elenco: await carica("src/app/api/v1/[resource]/route.ts"),
    riga: await carica("src/app/api/v1/[resource]/[id]/route.ts"),
    riscatto: await carica("src/app/api/v1/auth/access/redeem/route.ts"),
    scollega: await carica("src/app/api/v1/guardian-accounts/[athleteId]/[guardianId]/route.ts"),
    moduli: await carica("src/app/api/v1/forms/submissions/[id]/route.ts"),
  };

  await prisma.user.createMany({
    data: [
      utente(PRESIDENTE, email("presidente"), "Presidente"),
      utente(SEGRETARIA, email("segretaria"), "Segretaria"),
      utente(MODULISTA, email("modulista"), "Modulista"),
      utente(MADRE, email("madre"), "Madre"),
      utente(PADRE, email("padre"), "Padre"),
      utente(ZIA, email("zia"), "Zia"),
    ],
  });
  for (const [id, nome] of [
    [CLUB, "Sesto"],
    [CLUB_B, "SestoB"],
  ]) {
    await prisma.club.create({
      data: {
        id,
        name: `${nome} ${id.slice(0, 6)}`,
        slug: `${nome.toLowerCase()}-${id.slice(0, 8)}`,
        creator_id: PRESIDENTE,
        updated_at: new Date(),
      },
    });
  }

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
  await tessera(MADRE, "member");
  await tessera(PADRE, "member");
  await tessera(ZIA, "member");

  const sessione = async (id) =>
    (
      await auth.createSessionForUser(
        await prisma.user.findUnique({ where: { id } }),
      )
    ).access_token;

  const sessPresidente = await sessione(PRESIDENTE);
  const sessSegretaria = await sessione(SEGRETARIA);

  const scopeOwner = {
    userId: PRESIDENTE,
    activeOrganizationId: CLUB,
    activeRole: "owner",
    activeMembershipId: null,
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

  /* ================================================================== *
   * §A — D53: due righe sulla stessa posizione, e la fusione mente
   * ================================================================== */
  console.log("\n§A — D53: la posizione di una riga revocata non si rinumera\n");
  const FIGLIO_A = await atleta("FiglioA", {
    allergies: ["arachidi"],
    guardians: [
      { id: "a-madre", name: "Madre", relationship: "madre", email: email("madre") },
      {
        id: "a-padre",
        name: "Padre",
        relationship: "padre",
        email: email("padre"),
        linkedUserId: PADRE,
      },
    ],
  });
  /*
    Una persona SOLA su DUE voci del blob: la segreteria l'ha scritta due
    volte, una collegata e una di solo recapito con lo stesso indirizzo. Il
    travaso ne fa due righe con due chiavi e due POSIZIONI diverse.
  */
  const FIGLIO_E = await atleta("FiglioE", {
    guardians: [
      {
        id: "e-madre",
        name: "Madre",
        relationship: "madre",
        linkedUserId: MADRE,
        email: email("madre"),
      },
      { id: "e-madre-bis", name: "Madre", relationship: "madre", email: email("madre") },
    ],
  });
  const FIGLIO_H = await atleta("FiglioH", {});
  const FIGLIO_I = await atleta("FiglioI", {});

  /* Il controllo di §C: la stessa persona su UNA riga sola. */
  const FIGLIO_F = await atleta("FiglioF", {
    guardians: [
      { id: "f-zia", name: "Zia", relationship: "zia", linkedUserId: ZIA, email: email("zia") },
    ],
  });
  const FIGLIO_C = await atleta("FiglioC", {
    guardians: [
      { id: "c-padre", name: "PadreC", email: email("padre"), linkedUserId: PADRE },
      { id: "c-zia", name: "ZiaC", email: email("zia") },
    ],
  });
  await travasaTutori(prisma, [CLUB, CLUB_B]);
  {
    /*
      **Un salvataggio del tutto ordinario, prima di qualunque revoca.**

      Il travaso numera da 1; il salvataggio dell'anagrafica numera dall'indice
      dell'array, cioe da 0. Questa e la prima cosa che la segreteria fa su
      qualunque scheda travasata, e da qui in poi le posizioni sono 0-based —
      lo stato ordinario del prodotto.
    */
    await chiama(
      "PATCH",
      `/api/v1/athletes/${FIGLIO_A}`,
      { last_name: "Sesto", data: { guardians: (await datiDi(FIGLIO_A)).guardians } },
      sessPresidente,
      "owner",
    );

    const righe = await righeDi(FIGLIO_A);
    const rigaMadre = righe.find((r) => r.identity_key === email("madre"));
    const rigaPadre = righe.find((r) => r.user_id === PADRE);
    prova(
      "A0 SEMINA — due righe vive, posizioni 0 e 1, il padre con l'utenza",
      [2, 0, 1, true],
      [righe.length, rigaMadre?.position, rigaPadre?.position, Boolean(rigaPadre)],
    );
    const apre = async (chi, figlio) =>
      (await cruscotto.getParentLinkedAthletes(chi)).filter((a) => a.id === figlio)
        .length;
    prova(
      "A1 controllo — tutti e due aprono l'area famiglia di FiglioA",
      [1, 1],
      [await apre(MADRE, FIGLIO_A), await apre(PADRE, FIGLIO_A)],
    );

    /* La segreteria revoca la madre dalla porta vera. */
    await legami.unlinkGuardianAccount(scopeOwner, {
      athleteId: FIGLIO_A,
      guardianId: rigaMadre.id,
      reason: "sesto",
    });
    prova(
      "A2 controllo — la madre e fuori, il padre e dentro",
      [0, 1],
      [await apre(MADRE, FIGLIO_A), await apre(PADRE, FIGLIO_A)],
    );

    /*
      **L'atto ordinario.** La segreteria toglie dalla scheda la voce della
      persona revocata — e il gesto naturale: quella persona non e piu un
      tutore — e salva. Nessuna chiave di concessione: il ruolo di club ha
      zero caselle.
    */
    const proiettati = (await datiDi(FIGLIO_A)).guardians || [];
    const corpo = proiettati.filter((voce) => !voce.accessRevokedAt);
    const esito = await chiama(
      "PATCH",
      `/api/v1/athletes/${FIGLIO_A}`,
      { last_name: "Sesto", data: { guardians: corpo } },
      sessSegretaria,
      SLUG,
    );
    console.log(
      `        PATCH (${corpo.length} voci su ${proiettati.length}) -> ${esito.stato}`,
    );

    const dopo = await righeDi(FIGLIO_A);
    console.log(
      "        righe:",
      dopo
        .map(
          (r) =>
            `${r.first_name}@pos${r.position}${r.revoked_at ? " REVOCATA" : " viva"}`,
        )
        .join(", "),
    );

    const posizioni = dopo.map((r) => Number(r.position));
    prova(
      "A3 REPERTO — due righe NON condividono una posizione",
      new Set(posizioni).size,
      posizioni.length,
      "D53: la riga revocata tiene la sua posizione, la viva prende l'indice dell'array",
    );

    const voci = (await datiDi(FIGLIO_A)).guardians || [];
    console.log(
      "        proiezione:",
      JSON.stringify(
        voci.map((v) => ({
          id: String(v.id).slice(0, 8),
          name: v.name,
          revocata: Boolean(v.accessRevokedAt),
          linkedUserId: v.linkedUserId ? String(v.linkedUserId).slice(0, 8) : null,
        })),
      ),
    );

    const padreVivo = (await righeDi(FIGLIO_A)).find(
      (r) => r.user_id === PADRE && !r.revoked_at,
    );
    prova(
      "A4 controllo — la riga del padre e viva in archivio",
      true,
      Boolean(padreVivo),
    );
    prova(
      "A5 controllo — e il padre apre ancora l'area famiglia del minore",
      1,
      await apre(PADRE, FIGLIO_A),
    );
    /*
      **Quale delle due righe vince e un lancio di moneta su un UUID.**
      `ORDINE_STABILE` e (position, created_at, id): il travaso scrive le due
      righe nella stessa istruzione, quindi a pari posizione e pari istante
      decide `id asc`. I due rami sono tutti e due difettosi:
        - vince la REVOCATA → la voce porta il suo identificativo, e il
          salvataggio ordinario successivo cancella la riga viva (§B, D52);
        - vince la VIVA → la voce porta il suo identificativo ma il marchio
          della revocata, e il tutore resta dentro con ogni schermata che lo
          dichiara chiuso, per sempre (D53).
    */
    const primaDelPari = dopo.filter(
      (r) => Number(r.position) === Number(dopo[0].position),
    );
    console.log(
      `        ramo del pareggio: vince ${
        primaDelPari.length > 1
          ? String(voci[0]?.id) === String(primaDelPari[0].id) &&
            primaDelPari[0].revoked_at
            ? "la REVOCATA (si perde la riga viva al prossimo salvataggio)"
            : "la VIVA (la scheda dichiara revocato un tutore che non lo e)"
          : "(nessun pareggio)"
      }`,
    );

    prova(
      "A5-bis REPERTO — la scheda pubblica una voce per ogni riga",
      dopo.length,
      voci.length,
      "due righe, una voce sola: una delle due e invisibile a ogni schermata",
    );

    const vocePadre = voci.find(
      (v) => String(v.id) === String(padreVivo?.id) || v.name === "Padre",
    );
    prova(
      "A6 REPERTO — la scheda pubblica una voce per il tutore VIVO",
      true,
      Boolean(vocePadre),
      "se manca: l'unico tutore vivo del minore e invisibile a ogni schermata",
    );
    /*
      La domanda che vale in tutti e due i rami del pareggio su `id asc`: la
      scheda pubblica una voce VIVA per il tutore che in archivio e vivo? Se
      no, per ogni schermata quel tutore e chiuso — e non lo e.
    */
    prova(
      "A7 REPERTO — il tutore VIVO ha una voce viva sulla scheda",
      true,
      voci.some(
        (v) => !v.accessRevokedAt && String(v.linkedUserId || "") === PADRE,
      ),
      "la schermata dice chiuso, l'archivio dice aperto: l'operatore crede di avere messo in sicurezza il minore",
    );
    prova(
      "A8 REPERTO — il registro delle revoche non nomina il tutore vivo",
      false,
      ((await datiDi(FIGLIO_A)).revokedGuardianIdentities || []).includes(
        email("padre"),
      ),
      "i solleciti e i promemoria del certificato lo leggono per decidere chi avvisare",
    );
  }

  /* ================================================================== *
   * §B — D52: il salvataggio successivo distrugge la riga nascosta
   * ================================================================== */
  console.log("\n§B — D52: cio che la scheda non nomina, il salvataggio toglie\n");
  {
    const primaB = await righeDi(FIGLIO_A);
    const vivePrima = primaB.filter((r) => !r.revoked_at).length;

    /* Un salvataggio del tutto ordinario: si rimanda cio che si e letto. */
    const proiettati = (await datiDi(FIGLIO_A)).guardians || [];
    const esito = await chiama(
      "PATCH",
      `/api/v1/athletes/${FIGLIO_A}`,
      { phone: "3330000000", data: { guardians: proiettati } },
      sessSegretaria,
      SLUG,
    );
    console.log(`        PATCH andata-e-ritorno -> ${esito.stato}`);

    const dopoB = await righeDi(FIGLIO_A);
    console.log(
      "        righe:",
      dopoB
        .map((r) => `${r.first_name}@pos${r.position}${r.revoked_at ? " REV" : ""}`)
        .join(", ") || "(nessuna)",
    );

    prova(
      "B1 REPERTO — nessuna riga viva sparisce da un'andata e ritorno",
      vivePrima,
      dopoB.filter((r) => !r.revoked_at).length,
      "un salvataggio che rimanda cio che ha letto non deve togliere niente",
    );
    prova(
      "B2 REPERTO — il padre apre ancora l'area famiglia di FiglioA",
      1,
      (await cruscotto.getParentLinkedAthletes(PADRE)).filter(
        (a) => a.id === FIGLIO_A,
      ).length,
      "se 0: accesso perso senza una revoca, senza una schermata e senza audit",
    );
  }

  /* ================================================================== *
   * §A-controllo — LA STESSA SEQUENZA senza collisione: la sonda sa essere
   * verde. Se questa fosse rossa, A3/A6/A7/B1/B2 non misurerebbero niente.
   * ================================================================== */
  console.log("\n§A-controllo — stessa sequenza, revocata in ULTIMA posizione\n");
  {
    await chiama(
      "PATCH",
      `/api/v1/athletes/${FIGLIO_C}`,
      { last_name: "Sesto", data: { guardians: (await datiDi(FIGLIO_C)).guardians } },
      sessPresidente,
      "owner",
    );
    const righe = await righeDi(FIGLIO_C);
    const rigaZia = righe.find((r) => r.identity_key === email("zia"));
    prova(
      "C0 SEMINA — la zia e in ULTIMA posizione",
      1,
      Number(rigaZia?.position),
    );

    await legami.unlinkGuardianAccount(scopeOwner, {
      athleteId: FIGLIO_C,
      guardianId: rigaZia.id,
      reason: "sesto",
    });

    const proiettati = (await datiDi(FIGLIO_C)).guardians || [];
    await chiama(
      "PATCH",
      `/api/v1/athletes/${FIGLIO_C}`,
      {
        last_name: "Sesto",
        data: { guardians: proiettati.filter((v) => !v.accessRevokedAt) },
      },
      sessSegretaria,
      SLUG,
    );

    const dopo = await righeDi(FIGLIO_C);
    const posizioni = dopo.map((r) => Number(r.position));
    const voci = (await datiDi(FIGLIO_C)).guardians || [];
    prova(
      "C1 DISCRIMINA — senza collisione A3 e verde",
      new Set(posizioni).size,
      posizioni.length,
    );
    prova(
      "C2 DISCRIMINA — senza collisione A6/A7 sono verdi",
      [true, []],
      [
        voci.some((v) => v.name === "PadreC" && !v.accessRevokedAt),
        voci.filter((v) => v.accessRevokedAt && v.linkedUserId).map((v) => v.name),
      ],
    );

    /* E l'andata e ritorno di §B non toglie niente. */
    const vivePrima = dopo.filter((r) => !r.revoked_at).length;
    await chiama(
      "PATCH",
      `/api/v1/athletes/${FIGLIO_C}`,
      { phone: "3331111111", data: { guardians: (await datiDi(FIGLIO_C)).guardians } },
      sessSegretaria,
      SLUG,
    );
    prova(
      "C3 DISCRIMINA — senza collisione B1/B2 sono verdi",
      [vivePrima, 1],
      [
        (await righeDi(FIGLIO_C)).filter((r) => !r.revoked_at).length,
        (await cruscotto.getParentLinkedAthletes(PADRE)).filter(
          (a) => a.id === FIGLIO_C,
        ).length,
      ],
    );
  }

  /* ================================================================== *
   * §C — «Scollega account» chiude la VOCE. Una persona sta su due voci.
   * ================================================================== */
  console.log("\n§C — la revoca per posizione e la persona su due posizioni\n");
  {
    const righe = await righeDi(FIGLIO_E);
    const collegata = righe.find((r) => r.user_id === MADRE);
    const seconda = righe.find((r) => !r.user_id && r.email === email("madre"));
    prova(
      "E0 SEMINA — due righe della STESSA persona, su DUE posizioni",
      [2, true, true, false],
      [
        righe.length,
        Boolean(collegata),
        Boolean(seconda),
        Number(collegata?.position) === Number(seconda?.position),
      ],
      `posizioni ${collegata?.position} e ${seconda?.position}`,
    );

    /* Il club conia un invito per la SECONDA riga, nella forma che il prodotto conia. */
    const CODICE = `SESTOE${CLUB.slice(0, 6).toUpperCase()}`;
    await prisma.clubResourceItem.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        resource_type: "access_tokens",
        name: CODICE,
        status: "active",
        payload: {
          athlete_id: FIGLIO_E,
          guardian_id: seconda.id,
          role: "parent",
          one_time: true,
          minted_by_role: "owner",
          minted_by_user_id: PRESIDENTE,
        },
        updated_at: new Date(),
      },
    });

    prova(
      "E1 controllo — prima della revoca la madre apre l'area famiglia",
      1,
      (await cruscotto.getParentLinkedAthletes(MADRE)).filter(
        (a) => a.id === FIGLIO_E,
      ).length,
    );

    /* La porta vera: «Scollega account» dalla rotta HTTP, come proprietario. */
    const scollegamento = await scollega(sessPresidente, "owner", FIGLIO_E, collegata.id);
    prova(
      "E1-bis controllo — la rotta di scollegamento risponde 200",
      200,
      scollegamento.stato,
    );

    prova(
      "E2 controllo — dopo la revoca la madre NON apre piu l'area famiglia",
      0,
      (await cruscotto.getParentLinkedAthletes(MADRE)).filter(
        (a) => a.id === FIGLIO_E,
      ).length,
      "`findGuardianLinks` chiude la PERSONA su questa scheda, non la riga",
    );

    const gettone = await prisma.clubResourceItem.findFirst({
      where: { name: CODICE },
    });
    prova(
      "E3 REPERTO — il gettone che nomina l'altra riga della stessa persona e chiuso",
      "revoked",
      String(gettone?.status),
      "la lettura dice «revocata su questa scheda»; lo sweep dei gettoni guarda la sola posizione",
    );

    const esito = await riscatta(MADRE, CODICE);
    prova(
      "E4 REPERTO — il riscatto di quel gettone NON riesce",
      false,
      esito.stato === 200,
      `stato ${esito.stato} — ${JSON.stringify(esito.corpo?.error?.message || "ok")}`,
    );
    prova(
      "E5 REPERTO — e l'area famiglia del minore NON si riapre",
      0,
      (await cruscotto.getParentLinkedAthletes(MADRE)).filter(
        (a) => a.id === FIGLIO_E,
      ).length,
      "una revoca che lascia viva la propria strada di ritorno",
    );

    /*
      CONTROLLO DI DISCRIMINAZIONE: la stessa scena con la persona su UNA
      riga sola. Lo sweep deve chiudere il gettone e il riscatto deve fallire.
    */
    const unica = (await righeDi(FIGLIO_F))[0];
    const CODICE_F = `SESTOF${CLUB.slice(0, 6).toUpperCase()}`;
    await prisma.clubResourceItem.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        resource_type: "access_tokens",
        name: CODICE_F,
        status: "active",
        payload: {
          athlete_id: FIGLIO_F,
          guardian_id: unica.id,
          role: "parent",
          one_time: true,
          minted_by_role: "owner",
          minted_by_user_id: PRESIDENTE,
        },
        updated_at: new Date(),
      },
    });
    await legami.unlinkGuardianAccount(scopeOwner, {
      athleteId: FIGLIO_F,
      guardianId: unica.id,
      reason: "sesto",
    });
    const gettoneF = await prisma.clubResourceItem.findFirst({
      where: { name: CODICE_F },
    });
    const esitoF = await riscatta(ZIA, CODICE_F);
    prova(
      "E6 DISCRIMINA — con UNA riga sola il gettone e chiuso e il riscatto fallisce",
      ["revoked", false, 0],
      [
        String(gettoneF?.status),
        esitoF.stato === 200,
        (await cruscotto.getParentLinkedAthletes(ZIA)).filter(
          (a) => a.id === FIGLIO_F,
        ).length,
      ],
      `stato riscatto ${esitoF.stato}`,
    );
  }

  /* ================================================================== *
   * §G — la deroga del riferimento a un'utenza cancellata
   * ================================================================== */
  console.log("\n§G — «ogni altro campo deve restare com'era»\n");
  {
    /*
      La migrazione motiva la deroga cosi: «Si passa solo se l'utenza non c'e
      piu davvero, e solo per togliere quel riferimento: ogni altro campo deve
      restare com'era, altrimenti sarebbe una scrittura travestita.»

      Il vaglio pero fissa **quattro** colonne: `identity_key`, `email`,
      `revoked_at`, `contact_only`. La domanda e cosa succede alle altre.
    */
    const FANTASMA = randomUUID();
    await prisma.user.create({
      data: utente(FANTASMA, email("fantasma"), "Fantasma"),
    });
    const FIGLIO_G = await atleta("FiglioG", {});
    const rigaG = randomUUID();
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL "easygame.guardian_writer" = 'on'`);
      await tx.$executeRawUnsafe(
        `INSERT INTO "athlete_guardians"
           ("id","organization_id","athlete_id","identity_key","user_id","email",
            "first_name","position","legacy_id","created_at","updated_at")
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5::uuid,$6,'Fantasma',7,'legacy-vero',now(),now())`,
        rigaG,
        CLUB,
        FIGLIO_G,
        FANTASMA,
        FANTASMA,
        email("fantasma"),
      );
    });
    await prisma.user.delete({ where: { id: FANTASMA } });

    const prima = await prisma.athleteGuardian.findUnique({ where: { id: rigaG } });
    prova(
      "G0 SEMINA — la cascata ha azzerato il riferimento, il resto e intatto",
      [null, 7, "legacy-vero"],
      [prima?.user_id, Number(prima?.position), prima?.legacy_id],
    );

    /*
      Il vaglio della deroga fissa quattro colonne e ne lascia libere otto —
      fra cui `position`, che decide che cosa revoca `revokeGuardianRow` e che
      cosa fonde la proiezione, e `legacy_id`, che decide **quale gettone
      nomina questa riga**. Uno scrittore fuori dal modulo che riuscisse a
      soddisfare la premessa passerebbe con tutte e otto.

      La premessa pero non e ricostruibile a riposo: il vincolo esterno
      rifiuta un `user_id` che non nomini nessuno, quindi `OLD.user_id IS NOT
      NULL AND NOT EXISTS(users)` vale solo dentro la cascata generata da
      PostgreSQL, che scrive quella colonna e nessun'altra. Cio che tiene
      stretta la deroga e il **vincolo esterno**, non l'elenco delle colonne —
      e il commento della migrazione non lo dice.
    */
    let premessa = "RICOSTRUIBILE";
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL "easygame.guardian_writer" = 'on'`);
        await tx.$executeRawUnsafe(
          `UPDATE "athlete_guardians" SET "user_id" = $2::uuid WHERE "id" = $1::uuid`,
          rigaG,
          FANTASMA,
        );
      });
    } catch (errore) {
      premessa = String(errore?.message || "").includes("foreign key")
        ? "IRRAGGIUNGIBILE (vincolo esterno)"
        : `ALTRO: ${String(errore?.message).slice(0, 60)}`;
    }
    prova(
      "G1 — la premessa della deroga non e ricostruibile a riposo",
      "IRRAGGIUNGIBILE (vincolo esterno)",
      premessa,
      "le otto colonne che il vaglio non fissa restano irraggiungibili: le chiude la chiave esterna, non l'elenco",
    );

    /* Controllo: con l'utenza VIVA la stessa istruzione fuori dal modulo cade. */
    await prisma.user.create({
      data: utente(FANTASMA, email("fantasma"), "Fantasma"),
    });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL "easygame.guardian_writer" = 'on'`);
      await tx.$executeRawUnsafe(
        `UPDATE "athlete_guardians" SET "user_id" = $2::uuid WHERE "id" = $1::uuid`,
        rigaG,
        FANTASMA,
      );
    });
    let esitoViva = "RESPINTA";
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "athlete_guardians" SET "user_id" = NULL, "position" = 0 WHERE "id" = $1::uuid`,
        rigaG,
      );
      esitoViva = "PASSATA";
    } catch {
      esitoViva = "RESPINTA";
    }
    prova(
      "G2 DISCRIMINA — con l'utenza VIVA la stessa istruzione e respinta",
      "RESPINTA",
      esitoViva,
      "il vaglio non e sempre-permissivo: la deroga chiede che l'utenza non ci sia piu",
    );

    /* E la cascata vera, con tutte le altre colonne, passa e non le tocca. */
    await prisma.user.delete({ where: { id: FANTASMA } }).catch(() => {});
    const finaleG = await prisma.athleteGuardian.findUnique({ where: { id: rigaG } });
    prova(
      "G3 — la cascata passa e lascia intatte le colonne non fissate",
      [null, 7, "legacy-vero", "Fantasma"],
      [
        finaleG?.user_id,
        Number(finaleG?.position),
        finaleG?.legacy_id,
        finaleG?.first_name,
      ],
    );
  }

  /* ================================================================== *
   * §E — l'approvazione di un modulo, dalla rotta HTTP vera
   * ================================================================== */
  console.log("\n§E — un ruolo ristretto ai soli moduli approva un tutore\n");
  {
    const moduli = await carica("src/lib/server/forms.ts");
    const scopeModuli = {
      userId: PRESIDENTE,
      activeOrganizationId: CLUB,
      activeRole: "owner",
      activeMembershipId: null,
      allowedOrganizationIds: [CLUB],
      accessScopes: [],
    };
    const modello = await moduli.createFormTemplate(scopeModuli, {
      organizationId: CLUB,
    });
    await moduli.updateFormTemplateDraft(scopeModuli, modello.id, {
      title: "Genitore Sesto",
      description: "",
      fields: [
        {
          id: "g_nome",
          type: "short_text",
          label: "Nome",
          required: true,
          binding: "guardian.name",
        },
        {
          id: "g_email",
          type: "email",
          label: "Email",
          required: true,
          binding: "guardian.email",
        },
      ],
    });
    await moduli.publishFormTemplate(scopeModuli, modello.id);
    const versione = await prisma.formTemplateVersion.findFirst({
      where: { template_id: modello.id },
      orderBy: { version: "desc" },
      select: { id: true },
    });

    /* Il ruolo ristretto: SOLO le due chiavi dei moduli. */
    const ruoloModuli = await prisma.clubRole.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        slug: "custom:staff:moduli",
        name: "Moduli",
        base_role: "staff",
        is_active: true,
        updated_at: new Date(),
      },
    });
    await prisma.clubRolePermission.createMany({
      data: ["forms.submissions.read", "forms.submissions.review"].map((k) => ({
        id: randomUUID(),
        role_id: ruoloModuli.id,
        permission_key: k,
      })),
    });
    await tessera(MODULISTA, "custom:staff:moduli", ruoloModuli.id);
    const sessModulista = await sessione(MODULISTA);

    const approva = async (figlio, indirizzo, sessioneUso, ruoloUso) => {
      const compilazione = await prisma.formSubmission.create({
        data: {
          organization_id: CLUB,
          template_id: modello.id,
          version_id: versione.id,
          kind: "profile_update",
          status: "pending",
          source: "internal",
          subjects: [],
          answers: { g_nome: "Intrusa", g_email: indirizzo },
          files: [],
          respondent_name: "Sonda Sesto",
        },
      });
      const risposta = await rotte.moduli.POST(
        new Request(
          `http://collaudo.invalid/api/v1/forms/submissions/${compilazione.id}`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${sessioneUso}`,
              "x-active-club-id": CLUB,
              "x-active-access-role": ruoloUso,
              "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
            },
            body: JSON.stringify({
              action: "approve",
              subjects: [
                { subject: "athlete", recordId: figlio },
                { subject: "guardian", recordId: null },
              ],
            }),
          },
        ),
        { params: { id: compilazione.id } },
      );
      let corpo = null;
      try {
        corpo = await risposta.json();
      } catch {
        corpo = null;
      }
      return { stato: risposta.status, corpo };
    };

    const esito = await approva(FIGLIO_H, email("zia"), sessModulista, "custom:staff:moduli");
    console.log(
      `        approvazione (soli moduli) -> ${esito.stato} ${JSON.stringify(
        esito.corpo?.error?.message || esito.corpo?.data?.applied || "",
      ).slice(0, 160)}`,
    );

    prova(
      "H1 REPERTO — un ruolo ristretto ai soli moduli non apre l'area famiglia",
      0,
      (await cruscotto.getParentLinkedAthletes(ZIA)).filter(
        (a) => a.id === FIGLIO_H,
      ).length,
      "il gate `canGrantAccess` di `upsertGuardianFromFormApproval`, percorso dalla rotta vera",
    );
    prova(
      "H2 REPERTO — e non lascia in archivio una riga viva che apra",
      [],
      (await righeDi(FIGLIO_H))
        .filter((r) => !r.revoked_at && !r.contact_only && r.email === email("zia"))
        .map((r) => r.identity_key),
    );

    /* DISCRIMINAZIONE: con le due chiavi (il proprietario) deve riuscire. */
    const esitoOwner = await approva(
      FIGLIO_I,
      email("zia"),
      sessPresidente,
      "owner",
    );
    prova(
      "H3 DISCRIMINA — con le due chiavi l'approvazione riesce e apre",
      [200, 1],
      [
        esitoOwner.stato,
        (await cruscotto.getParentLinkedAthletes(ZIA)).filter(
          (a) => a.id === FIGLIO_I,
        ).length,
      ],
      `${JSON.stringify(esitoOwner.corpo?.error?.message || "").slice(0, 120)}`,
    );
  }

  /* ================================================================== *
   * §D — la sonda L2 cerca un TESTO. La difesa e un ATTO.
   * ================================================================== */
  console.log("\n§D — L2 e vacua? La difesa spenta con il testo intatto\n");
  {
    const { readdirSync, readFileSync: leggi } = await import("node:fs");
    const FIRMA =
      'CREATE OR REPLACE FUNCTION "easygame_athlete_guardians_solo_il_proprietario"';
    const fileMigrazione = readdirSync("prisma/migrations")
      .filter((nome) => /^\d{14}_/.test(nome))
      .sort()
      .reverse()
      .map((nome) => `prisma/migrations/${nome}/migration.sql`)
      .find((p) => {
        try {
          return leggi(p, "utf8").includes(FIRMA);
        } catch {
          return false;
        }
      });
    const testoMigrazione = leggi(fileMigrazione, "utf8");
    const inizio = testoMigrazione.indexOf(FIRMA);
    const bloccoMigrazione = testoMigrazione.slice(
      inizio,
      testoMigrazione.indexOf("$$;", inizio) + 3,
    );
    const condizioni = bloccoMigrazione
      .split("\n")
      .map((r) => r.trim())
      .filter((r) => /^(IF|AND)\s/.test(r))
      .map((r) => r.replace(/\s+/g, " "));

    const L2 = async () => {
      const [{ def }] = await prisma.$queryRawUnsafe(
        `SELECT pg_get_functiondef(oid) AS def FROM pg_proc
          WHERE proname = 'easygame_athlete_guardians_solo_il_proprietario'`,
      );
      const viva = String(def || "").replace(/\s+/g, " ");
      return condizioni.filter((r) => !viva.includes(r));
    };

    /* Una scrittura fuori dal modulo proprietario: passa o non passa? */
    const scritturaFuori = async () => {
      const id = randomUUID();
      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "athlete_guardians"
             ("id","organization_id","athlete_id","identity_key","position","created_at","updated_at")
           VALUES ($1::uuid,$2::uuid,$3::uuid,$4,99,now(),now())`,
          id,
          CLUB,
          FIGLIO_E,
          `fuori-${id}`,
        );
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL "easygame.guardian_writer" = 'on'`);
          await tx.$executeRawUnsafe(
            `DELETE FROM "athlete_guardians" WHERE "id" = $1::uuid`,
            id,
          );
        });
        return "PASSATA";
      } catch (errore) {
        return String(errore?.message || "").includes("fuori dal modulo proprietario")
          ? "RESPINTA"
          : `ERRORE ALTRO: ${String(errore?.message).slice(0, 80)}`;
      }
    };

    prova(
      "D0 SEMINA — a difesa accesa L2 e verde e la scrittura fuori e respinta",
      [[], "RESPINTA"],
      [await L2(), await scritturaFuori()],
    );

    /* Stato 1: il trigger spento. Il testo della funzione non cambia. */
    let ripristinato = false;
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "athlete_guardians" DISABLE TRIGGER "athlete_guardians_solo_il_proprietario"`,
      );
      const [{ tgenabled }] = await prisma.$queryRawUnsafe(
        `SELECT tgenabled FROM pg_trigger WHERE NOT tgisinternal
          AND tgrelid = 'athlete_guardians'::regclass`,
      );
      prova(
        /*
          **Ri-specificata dopo la correzione.**

          Il reperto era che l'unica sonda di deriva confrontava un **testo**:
          con il vaglio spento restava verde. La correzione non ha reso L2 piu
          furba — un confronto testuale non puo accorgersi di un trigger spento
          — ma le ha messo accanto **L3**, che tenta la scrittura e pretende
          che sia respinta.

          Qui si asserisce percio la coppia: con la difesa spenta, L2 resta
          verde (e il suo limite, e va detto) **e** la scrittura fuori passa,
          che e cio che L3 misura e fa fallire. Se un giorno la scrittura fuori
          venisse respinta anche a trigger spento, questa riga diventerebbe
          rossa e vorrebbe dire che non si sta piu misurando la difesa vera.
        */
        "D1 con il trigger SPENTO L2 resta verde e la scrittura fuori PASSA",
        [true, "PASSATA"],
        [(await L2()).length === 0 && String(tgenabled) === "D", await scritturaFuori()],
        `tgenabled=${tgenabled}, L2 mancanti=${JSON.stringify(await L2())}` +
          ` — la scrittura fuori: ${await scritturaFuori()}`,
      );
    } finally {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "athlete_guardians" ENABLE TRIGGER "athlete_guardians_solo_il_proprietario"`,
      );
      ripristinato = true;
    }

    /*
      Stato 2: la funzione riscritta con **tutte** le condizioni che la
      migrazione dichiara, e senza il `RAISE`. E la deriva piu probabile di
      tutte: una modifica che aggiunge un ramo e sposta l'eccezione.
    */
    const senzaRaise = bloccoMigrazione.replace(
      /RAISE EXCEPTION[\s\S]*?USING ERRCODE = 'insufficient_privilege';/,
      "RETURN COALESCE(NEW, OLD);",
    );
    try {
      await prisma.$executeRawUnsafe(senzaRaise);
      prova(
        /* Come D1: L2 non lo vede, L3 si. */
        "D2 senza il RAISE L2 resta verde e la scrittura fuori PASSA",
        [true, "PASSATA"],
        [(await L2()).length === 0, await scritturaFuori()],
        `L2 mancanti=${JSON.stringify(await L2())} — la scrittura fuori: ${await scritturaFuori()}`,
      );
    } finally {
      /* Si riapplica la funzione della migrazione PIU RECENTE che la contiene. */
      await prisma.$executeRawUnsafe(bloccoMigrazione);
    }

    const [{ tgenabled: finale }] = await prisma.$queryRawUnsafe(
      `SELECT tgenabled FROM pg_trigger WHERE NOT tgisinternal
        AND tgrelid = 'athlete_guardians'::regclass`,
    );
    prova(
      "D3 RIPRISTINO — trigger acceso, L2 verde, scrittura fuori respinta",
      ["O", [], "RESPINTA", true],
      [String(finale), await L2(), await scritturaFuori(), ripristinato],
      `funzione riapplicata da ${fileMigrazione}`,
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
      `DELETE FROM "athlete_guardians" WHERE "organization_id" = ANY($1::uuid[])`,
      [CLUB, CLUB_B],
    );
  });
  await prisma.athlete.deleteMany({
    where: { organization_id: { in: [CLUB, CLUB_B] } },
  });
  await prisma.organizationUser.deleteMany({ where: { organization_id: { in: [CLUB, CLUB_B] } } });
  await prisma.formSubmission.deleteMany({ where: { organization_id: CLUB } });
  await prisma.formTemplateVersion.deleteMany({
    where: { form_templates: { organization_id: CLUB } },
  }).catch(() => {});
  await prisma.formTemplate.deleteMany({ where: { organization_id: CLUB } }).catch(() => {});
  await prisma.clubResourceItem.deleteMany({ where: { organization_id: CLUB } });
  await prisma.clubRolePermission.deleteMany({
    where: { club_roles: { organization_id: CLUB } },
  }).catch(() => {});
  await prisma.clubRole.deleteMany({ where: { organization_id: CLUB } });
  await prisma.club.deleteMany({ where: { id: { in: [CLUB, CLUB_B] } } });
  await prisma.user.deleteMany({
    where: {
      id: { in: [PRESIDENTE, SEGRETARIA, MODULISTA, MADRE, PADRE, ZIA] },
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
