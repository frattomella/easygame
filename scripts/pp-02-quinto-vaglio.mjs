/**
 * **Quinto vaglio ostile su PP-02.** Misura, non corregge.
 *
 *  §A  athlete-guardians.ts:58-59 / 435 — «La revoca e un fatto sulla riga
 *      (`revoked_at`), e si toglie solo riscattando un invito» / «una riga
 *      revocata non si toglie e non si riapre».
 *      La sonda chiede se un salvataggio d'anagrafica senza nessuna chiave
 *      possa ANNULLARE L'EFFETTO di una revoca gia scritta.
 *
 *  §B  athlete-guardians.ts:1849-1875 — `perPosizione`: «si fondono percio
 *      solo le righe che un accesso non lo aprono». Cosa ne fanno i tre
 *      lettori posizionali.
 *
 *  §C  data-subject.ts:569-580 — la fetta `athlete_guardians` del riepilogo
 *      contro cio che `eraseGuardiansForAthlete` cancella davvero.
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
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(72)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (nota) console.log(`        ${nota}`);
};

const CLUB = randomUUID();
const PRESIDENTE = randomUUID();
const SEGRETARIA = randomUUID();
const MADRE = randomUUID();
const PADRE = randomUUID();
const ZIA = randomUUID();
const ZIO_A = randomUUID();
const ZIO_B = randomUUID();

const coda = `${CLUB.slice(0, 8)}@quinto.local`;
const email = (chi) => `${chi}-${coda}`;
const FAMIGLIA = email("famiglia");

const utente = (id, indirizzo, nome) => ({
  id,
  email: indirizzo,
  email_verified_at: new Date(),
  first_name: nome,
  last_name: "Quinto",
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
      last_name: "Quinto",
      status: "active",
      data,
      updated_at: new Date(),
    },
  });
  return id;
};

const tessera = async (userId, ruolo, clubRoleId = null) =>
  prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
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

const main = async () => {
  const tutori = await carica("src/lib/server/athlete-guardians.ts");
  const cruscotto = await carica("src/lib/server/parent-dashboard.ts");
  const legami = await carica("src/lib/server/profile-account-links.ts");
  const auth = await carica("src/lib/server/auth.ts");
  const catalogo = await carica("src/lib/permissions/catalog.ts");
  const ruoli = await carica("src/lib/access-roles.ts");
  rotte = {
    elenco: await carica("src/app/api/v1/[resource]/route.ts"),
    riga: await carica("src/app/api/v1/[resource]/[id]/route.ts"),
  };

  await prisma.user.createMany({
    data: [
      utente(PRESIDENTE, email("presidente"), "Presidente"),
      utente(SEGRETARIA, email("segretaria"), "Segretaria"),
      /* ADR-0127: l'indirizzo della madre E l'indirizzo di famiglia. */
      utente(MADRE, FAMIGLIA, "Madre"),
      utente(PADRE, email("padre"), "Padre"),
      utente(ZIA, email("zia"), "Zia"),
      utente(ZIO_A, email("zioa"), "ZioA"),
      utente(ZIO_B, email("ziob"), "ZioB"),
    ],
  });
  await prisma.club.create({
    data: {
      id: CLUB,
      name: `Quinto ${CLUB.slice(0, 6)}`,
      slug: `quinto-${CLUB.slice(0, 8)}`,
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
  await tessera(MADRE, "member");
  await tessera(PADRE, "member");
  await tessera(ZIA, "member");

  const sessioneSeg = (
    await auth.createSessionForUser(
      await prisma.user.findUnique({ where: { id: SEGRETARIA } }),
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

  /*
    Configurazione ordinaria di ADR-0127, la stessa che il commento di
    `findGuardianLinks` descrive: madre e padre, **un indirizzo solo**.
    La riga della madre e chiavata sull'indirizzo (la segreteria l'ha
    scritta a mano); quella del padre sull'utenza (ha riscattato).
  */
  const FIGLIO_A = await atleta("FiglioA", {
    allergies: ["arachidi"],
    medicalNotes: "asma da sforzo",
    guardians: [
      { id: "a-madre", name: "Madre", relationship: "madre", email: FAMIGLIA },
      {
        id: "a-padre",
        name: "Padre",
        relationship: "padre",
        linkedUserId: PADRE,
        email: FAMIGLIA,
      },
    ],
  });
  const FIGLIO_B = await atleta("FiglioB", {
    guardians: [
      { id: "b-nonno", name: "Nonno", email: email("nonno") },
      { id: "b-padre", name: "Padre", linkedUserId: PADRE, email: email("padre") },
    ],
  });
  const FIGLIO_D = await atleta("FiglioD", {
    guardians: [
      { id: "d-zia", name: "Zia", email: email("zia") },
      { id: "d-nonno", name: "Nonno", email: email("nonno2") },
    ],
  });
  /*
    Una scheda TRAVASATA la cui prima voce del blob dichiarava DUE utenze: e
    la forma che produce due righe sulla stessa posizione, e quella che il
    commento di `perPosizione` dice di non fondere piu.
  */
  const FIGLIO_J = await atleta("FiglioJ", {
    billingGuardianIndex: 1,
    guardians: [
      {
        id: "j-1",
        name: "Coppia",
        surname: "Uno",
        email: email("coppia"),
        linkedUserIds: [ZIO_A, ZIO_B],
        fiscalCode: "CPPUNO00A01H501A",
      },
      {
        id: "j-2",
        name: "Chi",
        surname: "Paga",
        email: email("padre"),
        fiscalCode: "CHIPGA00A01H501B",
      },
    ],
  });
  await travasaTutori(prisma, [CLUB]);

  /* ================================================================== *
   * §A — la revoca si annulla ri-chiavando la riga revocata
   * ================================================================== */
  console.log("\n§A — «una riga revocata non si riapre»: la si ri-chiavia\n");
  {
    const figlio = FIGLIO_A;
    const righe = await righeDi(figlio);
    const rigaMadre = righe.find((r) => r.identity_key === FAMIGLIA);
    const rigaPadre = righe.find((r) => r.user_id === PADRE);
    prova(
      "A0 setup — due righe, una chiavata sull'indirizzo e una sull'utenza",
      [2, true, true],
      [righe.length, Boolean(rigaMadre), Boolean(rigaPadre)],
    );

    prova(
      "A1 controllo — prima della revoca la madre apre l'area famiglia",
      1,
      (await cruscotto.getParentLinkedAthletes(MADRE)).length,
    );

    /* Revoca dalla porta vera. */
    await legami.unlinkGuardianAccount(scopeOwner, {
      athleteId: figlio,
      guardianId: rigaMadre.id,
      reason: "vaglio",
    });

    prova(
      "A2 controllo — dopo «Scollega account» la madre NON apre piu niente",
      0,
      (await cruscotto.getParentLinkedAthletes(MADRE)).length,
      "la difende `revocateDiQuestaPersona`: la riga del padre porta lo stesso indirizzo",
    );
    const registroPrima = (await datiDi(figlio)).revokedGuardianIdentities || [];
    prova(
      "A3 controllo — e l'indirizzo e nel registro delle identita revocate",
      true,
      registroPrima.includes(FAMIGLIA),
      JSON.stringify(registroPrima),
    );

    prova(
      "A4 controllo — il ruolo che attacca NON puo concedere accessi",
      [false, false],
      [
        catalogo.roleHasPermission(
          ruoli.encodeCustomRoleToken(SLUG, []),
          "accounts.athlete.manage",
        ),
        catalogo.roleHasPermission(ruoli.encodeCustomRoleToken(SLUG, []), "clinical.read"),
      ],
    );

    /*
      L'attacco: un PATCH ordinario della scheda. La proiezione pubblica anche
      le righe revocate, con il loro `id`; si rimanda tutto com'e, cambiando
      **un solo campo** — l'indirizzo della riga REVOCATA — verso un indirizzo
      che non e di nessuno.
    */
    const proiettati = (await datiDi(figlio)).guardians || [];
    const ESCA = `esca-${CLUB.slice(0, 8)}@quinto.local`;
    const corpo = proiettati.map((voce) =>
      voce.id === rigaMadre.id ? { ...voce, email: ESCA } : voce,
    );

    const esito = await chiama(
      "PATCH",
      `/api/v1/athletes/${figlio}`,
      { last_name: "Quinto", data: { guardians: corpo } },
      sessioneSeg,
      SLUG,
    );
    console.log(`        PATCH -> ${esito.stato}`);

    const dopo = await righeDi(figlio);
    const madreDopo = dopo.find((r) => r.id === rigaMadre.id);
    console.log(
      `        riga revocata: identity_key=${madreDopo?.identity_key} email=${madreDopo?.email} revoked=${Boolean(madreDopo?.revoked_at)}`,
    );

    prova(
      "A5 REPERTO — la riga revocata NON e stata ri-chiavata dal salvataggio",
      FAMIGLIA,
      madreDopo?.identity_key ?? null,
    );
    prova(
      "A6 REPERTO — la madre revocata NON e rientrata nell'area famiglia",
      0,
      (await cruscotto.getParentLinkedAthletes(MADRE)).length,
    );
    const registroDopo = (await datiDi(figlio)).revokedGuardianIdentities || [];
    prova(
      "A7 REPERTO — l'indirizzo revocato e ancora nel registro delle revoche",
      true,
      registroDopo.includes(FAMIGLIA),
      `${JSON.stringify(registroDopo)} — i solleciti e i promemoria lo leggono`,
    );
  }

  /* ================================================================== *
   * §A-bis — lo stesso meccanismo nel verso opposto: chiudere un innocente
   * ================================================================== */
  console.log("\n§A-bis — ri-chiavare una riga revocata SULL'indirizzo di un altro\n");
  {
    const figlio = FIGLIO_B;
    const righe = await righeDi(figlio);
    const rigaNonno = righe.find((r) => r.identity_key === email("nonno"));

    prova(
      "B1 controllo — il padre apre l'area famiglia del proprio figlio",
      1,
      (await cruscotto.getParentLinkedAthletes(PADRE)).filter(
        (a) => a.id === figlio,
      ).length,
    );

    await legami.unlinkGuardianAccount(scopeOwner, {
      athleteId: figlio,
      guardianId: rigaNonno.id,
      reason: "vaglio",
    });

    /* Ora la riga revocata del nonno prende l'indirizzo del padre. */
    const proiettati = (await datiDi(figlio)).guardians || [];
    const corpo = proiettati.map((voce) =>
      voce.id === rigaNonno.id ? { ...voce, email: email("padre") } : voce,
    );
    const esito = await chiama(
      "PATCH",
      `/api/v1/athletes/${figlio}`,
      { last_name: "Quinto", data: { guardians: corpo } },
      sessioneSeg,
      SLUG,
    );
    console.log(`        PATCH -> ${esito.stato}`);

    prova(
      "B2 REPERTO — il padre apre ancora l'area famiglia del proprio figlio",
      1,
      (await cruscotto.getParentLinkedAthletes(PADRE)).filter(
        (a) => a.id === figlio,
      ).length,
      "una revoca altrui non deve poter essere spostata addosso a lui",
    );
  }

  /* ================================================================== *
   * §B-bis — la stessa mossa contro chi entra SOLO per indirizzo (ADR-0127)
   * ================================================================== */
  console.log("\n§B-bis — chiudere l'accesso di un tutore mai riscattato\n");
  {
    const figlio = FIGLIO_D;
    const righe = await righeDi(figlio);
    const rigaZia = righe.find((r) => r.identity_key === email("zia"));
    const rigaNonno = righe.find((r) => r.identity_key === email("nonno2"));

    prova(
      "D1 controllo — la zia (solo indirizzo, ADR-0127) apre l'area famiglia",
      1,
      (await cruscotto.getParentLinkedAthletes(ZIA)).filter((a) => a.id === figlio)
        .length,
    );

    await legami.unlinkGuardianAccount(scopeOwner, {
      athleteId: figlio,
      guardianId: rigaNonno.id,
      reason: "vaglio",
    });
    prova(
      "D2 controllo — la revoca del nonno non tocca la zia",
      1,
      (await cruscotto.getParentLinkedAthletes(ZIA)).filter((a) => a.id === figlio)
        .length,
    );

    /* La riga REVOCATA del nonno prende l'indirizzo della zia. */
    const proiettati = (await datiDi(figlio)).guardians || [];
    const corpo = proiettati.map((voce) =>
      voce.id === rigaNonno.id ? { ...voce, email: email("zia") } : voce,
    );
    const esito = await chiama(
      "PATCH",
      `/api/v1/athletes/${figlio}`,
      { last_name: "Quinto", data: { guardians: corpo } },
      sessioneSeg,
      SLUG,
    );
    console.log(`        PATCH -> ${esito.stato}`);
    prova(
      "D3 REPERTO — la zia apre ancora l'area famiglia del nipote",
      1,
      (await cruscotto.getParentLinkedAthletes(ZIA)).filter((a) => a.id === figlio)
        .length,
      "e la sua riga e intatta: nessuna schermata di revoca l'ha toccata",
    );
    prova(
      "D4 REPERTO — la sua riga NON risulta revocata",
      [true, false],
      await righeDi(figlio).then((r) => {
        const z = r.find((x) => x.id === rigaZia.id);
        return [Boolean(z), Boolean(z?.revoked_at)];
      }),
    );
  }

  /* ================================================================== *
   * §J — `perPosizione`: la voce in piu e i tre lettori posizionali
   * ================================================================== */
  console.log("\n§J — i tre lettori che prendono i tutori PER POSTO\n");
  {
    const fiscale = await carica("src/lib/documents/fiscal-recipient.ts");
    const segnaposto = await carica("src/lib/server/document-placeholders.ts");
    const figlio = FIGLIO_J;

    const righe = await righeDi(figlio);
    prova(
      "J0 setup — tre righe, due sulla stessa posizione",
      [3, 2],
      [righe.length, new Set(righe.map((r) => r.position)).size],
      `posizioni: ${JSON.stringify(righe.map((r) => [r.position, r.user_id ? "utenza" : "-", r.identity_key.slice(0, 12)]))}`,
    );

    /*
      Il travaso NON riscrive `athletes.data`: la proiezione nasce al primo
      salvataggio della scheda. E quello il momento in cui i lettori
      posizionali cominciano a leggere l elenco ricomposto.
    */
    await tutori.refreshGuardianProjection(prisma, [figlio]);
    const dati = await datiDi(figlio);
    const proiettati = dati.guardians || [];
    console.log(
      `        proiezione: ${JSON.stringify(proiettati.map((g) => `${g.name} ${g.surname}`))}`,
    );

    /*
      Il blob aveva DUE voci, e `billingGuardianIndex: 1` nominava la seconda —
      «Chi Paga», quella con il codice fiscale su cui la famiglia porta la
      detrazione. La proiezione deve continuare a nominare lei.
    */
    const scheda = await prisma.athlete.findUnique({ where: { id: figlio } });
    const destinatario = fiscale.resolveFiscalRecipient(scheda);
    prova(
      "J1 REPERTO — il destinatario fiscale e ancora «Chi Paga»",
      "CHIPGA00A01H501B",
      destinatario.fiscalCode || null,
      `intestatario: ${destinatario.name}`,
    );

    const valori = segnaposto.buildPlaceholderValues({
      club: await prisma.club.findUnique({ where: { id: CLUB } }),
      athlete: scheda,
      season: null,
      charges: [],
      transactions: [],
      now: new Date(),
      attendance: { sessions: 0, hours: 0 },
    });
    if (valori) {
      prova(
        "J2 REPERTO — {{parent.2.*}} nomina ancora «Chi Paga»",
        "Chi",
        (valori["parent.2.first_name"]?.text ?? valori["parent.2.first_name"]) || null,
      );
    } else {
      console.log("        (segnaposto: export non trovato, sezione non misurata)");
    }
  }

  /* ================================================================== *
   * §K — il vaglio dell'approvazione di modulo si accende su richiesta
   * ================================================================== */
  console.log("\n§K — `upsertGuardianFromFormApproval`: chi non chiede, passa\n");
  {
    const figlio = await atleta("FiglioK");
    let esito = "riuscita";
    try {
      await tutori.upsertGuardianFromFormApproval(prisma, {
        organizationId: CLUB,
        athleteId: figlio,
        /* La zia HA un'utenza in questo club: e una concessione. */
        row: { firstName: "Zia", email: email("zia") },
        contactOnly: false,
        /* `canGrantAccess` NON passato: il vaglio confronta con `=== false`. */
      });
    } catch (errore) {
      esito = String(errore?.message || "").slice(0, 40);
    }
    prova(
      "K1 REPERTO — senza la chiave dichiarata, la porta non concede",
      "Accesso negato: il legame fra un tutore ",
      esito,
      "il parametro e opzionale e il vaglio e `=== false`: chi lo omette passa",
    );
    prova(
      "K2 REPERTO — e la zia non ha preso il fascicolo del minore",
      0,
      (await cruscotto.getParentLinkedAthletes(ZIA)).filter((a) => a.id === figlio)
        .length,
    );
  }

  /* ================================================================== *
   * §C — il riepilogo GDPR contro cio che la cancellazione cancella
   * ================================================================== */
  console.log("\n§C — la fetta athlete_guardians del riepilogo\n");
  {
    const soggetti = await carica("src/lib/server/data-subject.ts");
    const figlio = await atleta("FiglioC", { birthDate: "2015-04-01" });
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: figlio,
      rows: [
        { firstName: "Uno", email: email("c1"), legacyId: "c-1" },
        { firstName: "Due", email: email("c2"), legacyId: "c-2" },
        { firstName: "Tre", phone: "3330000000", legacyId: "c-3" },
      ],
      canGrantAccess: true,
    });
    const righe = await righeDi(figlio);
    await legami.unlinkGuardianAccount(scopeOwner, {
      athleteId: figlio,
      guardianId: righe[0].id,
      reason: "vaglio",
    });

    const riepilogo = await soggetti.previewDataSubjectErasure(scopeOwner, {
      subjectKind: "athlete",
      subjectId: figlio,
    });
    const fetta = riepilogo.slices.find((s) => s.table === "athlete_guardians");
    prova(
      "C1 — il riepilogo conta anche la riga revocata",
      3,
      Number(fetta?.count ?? -1),
      `righe in archivio: ${(await righeDi(figlio)).length}`,
    );
    prova("C1b — ed e dichiarata come «si cancella»", "delete", fetta?.disposal ?? null);
  }

  /* =================================================================== L */
  console.log("\n  L — la difesa che vive nell'archivio non e andata alla deriva\n");

  /*
    **Una difesa che vive nel database puo cambiare senza che il codice cambi.**

    Il vaglio che rifiuta ogni scrittura fuori dal modulo proprietario e una
    funzione PostgreSQL, non una riga di TypeScript: nessuna revisione del
    codice la vede, e `git diff` non la mostra. Misurato: un ambiente di
    sviluppo ha passato mezza giornata con la **versione precedente** della
    funzione — era stata riapplicata prendendo il file di una migrazione piu
    vecchia — e la sola cosa che se ne e accorta e stata una sonda che provava
    a cancellare un account. Tutte le altre erano verdi.

    Qui si confronta la funzione **viva** con quella che la migrazione piu
    recente dichiara. Non il testo intero, che PostgreSQL riscrive a modo suo:
    le condizioni che deve contenere, estratte dal file. Se un giorno la
    migrazione ne aggiunge una quarta, questa sonda la pretende senza che
    nessuno debba ricordarsene.
  */
  {
    const { readdirSync, readFileSync: leggi } = await import("node:fs");
    const radice = "prisma/migrations";
    const FIRMA =
      'CREATE OR REPLACE FUNCTION "easygame_athlete_guardians_solo_il_proprietario"';

    const fileMigrazione = readdirSync(radice)
      .filter((nome) => /^\d{14}_/.test(nome))
      .sort()
      .reverse()
      .map((nome) => `${radice}/${nome}/migration.sql`)
      .find((percorso) => {
        try {
          return leggi(percorso, "utf8").includes(FIRMA);
        } catch {
          return false;
        }
      });

    const testo = fileMigrazione ? leggi(fileMigrazione, "utf8") : "";
    const inizio = testo.indexOf(FIRMA);
    const blocco = testo.slice(inizio, testo.indexOf("$$;", inizio));

    /* Le condizioni sono le righe che cominciano per IF o AND: la forma. */
    const condizioni = blocco
      .split("\n")
      .map((riga) => riga.trim())
      .filter((riga) => /^(IF|AND)\s/.test(riga))
      .map((riga) => riga.replace(/\s+/g, " "));

    const [{ def }] = await prisma.$queryRawUnsafe(
      `SELECT pg_get_functiondef(oid) AS def FROM pg_proc
        WHERE proname = 'easygame_athlete_guardians_solo_il_proprietario'`,
    );
    const viva = String(def || "").replace(/\s+/g, " ");

    prova(
      "L1 SEMINA — la migrazione dichiara delle condizioni da confrontare",
      true,
      condizioni.length >= 3,
      `trovate ${condizioni.length} condizioni in ${fileMigrazione}`,
    );
    prova(
      "L2 la funzione viva porta ogni condizione che la migrazione dichiara",
      [],
      condizioni.filter((riga) => !viva.includes(riga)),
      "l'archivio e andato alla deriva dalla migrazione: la difesa non e quella committata",
    );

    /*
      **E soprattutto: la difesa MORDE.**

      L2 confronta un testo, e un testo non e un atto. Misurato da una
      revisione indipendente: con `ALTER TABLE ... DISABLE TRIGGER` la
      funzione resta identica e L2 resta **verde**, mentre una scrittura fuori
      dal modulo proprietario passa; e lo stesso con una funzione che porti
      **tutte** le condizioni dichiarate e il `RAISE EXCEPTION` sostituito da
      un `RETURN`.

      E la terza volta che una sonda di questo pacchetto cerca un **nome**
      invece di un **atto** — ed e tanto piu grave qui, perche questa sonda era
      stata scritta apposta per accorgersi di una deriva dell'archivio. Il
      confronto testuale dice *quale* condizione manca, e serve a diagnosticare;
      cio che dice se la difesa c'e e il tentativo di scrivere.
    */
    /*
      **La riga deve esistere**, o non si sta misurando niente: il vaglio e un
      trigger di riga, e una `updateMany` che non ne tocca nessuna riesce da
      se. La prima stesura di L3 scriveva su un atleta inesistente ed era
      **verde con il vaglio spento** — la stessa forma di errore che stava
      misurando.
    */
    const cavia = await atleta("CaviaVaglio");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: cavia,
      rows: [{ firstName: "Cavia", lastName: "Vaglio", email: email("cavia") }],
      canGrantAccess: true,
    });

    const scrivi = (client) =>
      client.athleteGuardian.updateMany({
        where: { athlete_id: cavia },
        data: { relationship: "vaglio" },
      });

    prova(
      "L3 SEMINA — c'e una riga da scrivere, o L3 non misura niente",
      1,
      await prisma.athleteGuardian.count({ where: { athlete_id: cavia } }),
    );

    const scritturaFuori = await scrivi(prisma)
      .then((esito) => (esito.count ? "passata" : "nessuna riga toccata"))
      .catch((errore) =>
        /fuori dal modulo proprietario/i.test(String(errore?.message || errore))
          ? "respinta"
          : `altro errore: ${String(errore?.message || errore).slice(0, 60)}`,
      );

    prova(
      "L3 una scrittura fuori dal modulo proprietario e RESPINTA dall'archivio",
      "respinta",
      scritturaFuori,
      "il vaglio e spento o non solleva: L2 da sola non se ne accorgerebbe",
    );

    /*
      **Il controllo**: la stessa scrittura, dentro una transazione che si
      dichiara, passa. Senza questa meta, un archivio che rifiutasse **tutto**
      — o una tabella sparita — passerebbe L3.
    */
    const scritturaDentro = await prisma
      .$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL "easygame.guardian_writer" = 'on'`);
        return scrivi(tx);
      })
      .then((esito) => (esito.count ? "passata" : "nessuna riga toccata"))
      .catch((errore) => `respinta: ${String(errore?.message || errore).slice(0, 60)}`);

    prova(
      "L4 CONTROLLO la stessa scrittura, dichiarandosi, passa",
      "passata",
      scritturaDentro,
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
    where: { id: { in: [PRESIDENTE, SEGRETARIA, MADRE, PADRE, ZIA, ZIO_A, ZIO_B] } },
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
