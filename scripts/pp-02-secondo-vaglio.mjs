/**
 * **Il secondo vaglio: quattro reperti di una revisione indipendente.**
 *
 * ---
 *
 * ## Da dove vengono
 *
 * Dopo il vaglio strutturale — sette reperti, tutti chiusi — una **seconda**
 * revisione indipendente ha attaccato lo stesso pacchetto senza conoscerlo, e
 * ne ha trovati altri cinque. Nessuno dentro `athlete-guardians.ts`: tutti sul
 * **bordo**, dove il modulo proprietario incontra chi lo chiama.
 *
 * E la stessa forma dei sette di prima, ed e la lezione che questo pacchetto
 * continua a ripetere: un dominio con un proprietario unico non e messo in
 * sicurezza dal proprietario. Lo e dai suoi confini.
 *
 * Il quinto — la revoca che non chiudeva l'area famiglia quando la tessera non
 * era `parent` — vive in `pp-02-totalita-ruoli.mjs` (T-13/T-15), perche li c'e
 * il dominio delle quaranta grafie di ruolo su cui va misurato. Qui stanno gli
 * altri quattro.
 *
 * ## La regola di questo file
 *
 * Ogni reperto ha il suo **controllo**: la stessa misura su un caso in cui la
 * proprieta deve valere al contrario. Un'asserzione che non sa diventare rossa
 * non e una prova, ed e esattamente il modo in cui 268 sonde verdi hanno
 * convissuto per settimane con cinque difetti aperti.
 *
 * La sonda misura, non corregge. Il club viene cancellato in `finally`.
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
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(74)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        nota: ${nota}`);
};

const CLUB = randomUUID();
const CLUB_B = randomUUID();
const PRESIDENTE = randomUUID();
const PRESIDENTE_B = randomUUID();
const MADRE = randomUUID();
const PADRE = randomUUID();

const coda = `${CLUB.slice(0, 8)}@secondo.local`;
const email = (chi) => `${chi}-${coda}`;
const EMAIL_FAMIGLIA = email("famiglia");

const scopeOwner = {
  userId: PRESIDENTE,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  activeMembershipId: null,
  allowedOrganizationIds: [CLUB],
  accessScopes: [],
};

const utente = (id, indirizzo, nome) => ({
  id,
  email: indirizzo,
  email_verified_at: new Date(),
  first_name: nome,
  last_name: "Secondo",
  password_hash: "$2b$10$secondo",
  role: "user",
});

const atletaIn = async (club, nome, data = {}) => {
  const id = randomUUID();
  await prisma.athlete.create({
    data: {
      id,
      organization_id: club,
      first_name: nome,
      last_name: "Secondo",
      status: "active",
      data,
      updated_at: new Date(),
    },
  });
  return id;
};

const datiDi = async (id) =>
  (
    await prisma.athlete.findUnique({
      where: { id },
      select: { data: true },
    })
  )?.data || {};

const main = async () => {
  const tutori = await carica("src/lib/server/athlete-guardians.ts");
  const risorse = await carica("src/lib/server/resources.ts");
  const promemoria = await carica("src/lib/server/medical-certificate-reminders.ts");

  await prisma.user.createMany({
    data: [
      utente(PRESIDENTE, email("presidente"), "Presidente"),
      utente(PRESIDENTE_B, email("presidenteb"), "PresidenteB"),
      utente(MADRE, EMAIL_FAMIGLIA, "Madre"),
      utente(PADRE, email("padre"), "Padre"),
    ],
  });
  await prisma.club.createMany({
    data: [
      {
        id: CLUB,
        name: "Secondo vaglio A",
        slug: `secondo-a-${CLUB.slice(0, 8)}`,
        creator_id: PRESIDENTE,
      },
      {
        id: CLUB_B,
        name: "Secondo vaglio B",
        slug: `secondo-b-${CLUB.slice(0, 8)}`,
        creator_id: PRESIDENTE_B,
      },
    ],
  });
  await prisma.organizationUser.createMany({
    data: [MADRE, PADRE].map((user_id) => ({
      id: randomUUID(),
      organization_id: CLUB,
      user_id,
      role: "parent",
    })),
  });

  /* ================================================================== 1 */
  console.log("\n  1 — i due registri di difesa e il salvataggio ordinario\n");

  /*
    **Il caso ordinario di ADR-0114**: madre collegata — la sua riga e chiavata
    sull'**utenza** — e un secondo genitore che porta lo **stesso indirizzo di
    famiglia**. Revocata la madre, il marchio sta sulla sua riga; ma la riga
    del padre porta quell'indirizzo, e i tre canali di notifica risolvono
    l'utenza **dall'indirizzo**. Cio che li tiene fuori e il registro delle
    identita revocate, che la proiezione ricava dalle righe.

    Il difetto: la rotta generica toglieva da cio che riceve tutte e tre le
    chiavi, la proiezione le riscriveva tutte e tre, e poi la `update` finale
    ne riportava indietro **una sola**. I due registri sparivano a **ogni**
    salvataggio di **qualunque** scheda, e la persona revocata tornava fra i
    destinatari dei promemoria sulla scadenza del certificato medico del minore
    e del sollecito di pagamento con il link.
  */
  const FIGLIO = await atletaIn(CLUB, "Figlio", {
    guardians: [
      { id: "g-madre", name: "Madre", email: EMAIL_FAMIGLIA, linkedUserId: MADRE },
      { id: "g-padre", name: "Padre", email: EMAIL_FAMIGLIA },
      /*
        Un terzo tutore con un **indirizzo suo**, che serve solo al controllo
        1f: nella coppia qui sopra l'unica utenza risolvibile e quella della
        madre, quindi senza di lui «nessun destinatario» e «il destinatario
        giusto e escluso» darebbero la stessa misura.
      */
      { id: "g-zio", name: "Zio", email: email("padre") },
    ],
  });
  await travasaTutori(prisma, [CLUB]);

  /*
    La revoca nomina **l'utenza**, non l'indirizzo: e cio che fa la Gestione
    accessi quando esclude una persona. La riga del padre porta lo stesso
    indirizzo e non viene toccata — ed e giusto, e un'altra persona.
  */
  await tutori.revokeGuardianAccessInClub(prisma, {
    organizationId: CLUB,
    userId: MADRE,
  });

  const righeFiglio = await prisma.athleteGuardian.findMany({
    where: { athlete_id: FIGLIO },
    orderBy: { position: "asc" },
  });
  prova(
    "1a SEMINA — tre righe, e solo quella della madre e revocata",
    [3, true, false, false],
    [
      righeFiglio.length,
      Boolean(righeFiglio[0]?.revoked_at),
      Boolean(righeFiglio[1]?.revoked_at),
      Boolean(righeFiglio[2]?.revoked_at),
    ],
    "senza due persone su un solo indirizzo il difetto non si vede",
  );

  const registroPrima = (await datiDi(FIGLIO)).revokedGuardianIdentities;
  prova(
    "1b SEMINA — il registro nomina l'identita revocata",
    true,
    Array.isArray(registroPrima) && registroPrima.includes(MADRE),
    "senza questo il resto della sezione misurerebbe un registro che non c'era",
  );

  const destinatari = async () =>
    (
      await promemoria.resolveGuardianRecipientIds(
        await prisma.athlete.findUnique({ where: { id: FIGLIO } }),
        { organizationId: CLUB },
      )
    )
      .map(String)
      .sort();

  prova(
    "1c SEMINA — e la madre revocata non e fra i destinatari",
    false,
    (await destinatari()).includes(MADRE),
    "e qui che serve il registro: l'indirizzo di famiglia e ancora sulla riga del padre",
  );

  /*
    Un salvataggio ordinario: la scheda rimanda cio che ha letto — che e cio
    che il prodotto fa a ogni modifica, anche solo di un numero di maglia.
  */
  const dati = await datiDi(FIGLIO);
  await risorse.updateResource(
    "athletes",
    FIGLIO,
    { first_name: "Figlio", data: { ...dati, jersey: "7" } },
    scopeOwner,
  );

  const registroDopo = (await datiDi(FIGLIO)).revokedGuardianIdentities;
  prova(
    "1d il registro delle revoche sopravvive al salvataggio",
    true,
    Array.isArray(registroDopo) && registroDopo.includes(MADRE),
    "prima: la update finale riportava indietro solo `guardians`, e i due registri sparivano",
  );

  prova(
    "1e e la madre revocata resta fuori dai destinatari",
    false,
    (await destinatari()).includes(MADRE),
    "prima: tornava a ricevere gli avvisi sulla salute del minore e il sollecito con il link",
  );

  /*
    **Il controllo**: il registro e una **proiezione**, non un archivio. Chi non
    e revocato non ci finisce, e il padre — che non lo e — resta destinatario.
    Senza questa meta, un registro che elencasse tutti passerebbe 1c e 1d.
  */
  prova(
    "1f CONTROLLO chi non e revocato riceve",
    true,
    (await destinatari()).includes(PADRE),
    "senza questa meta, un registro che escludesse tutti passerebbe 1c e 1e",
  );

  /* ================================================================== 2 */
  console.log("\n  2 — un salvataggio che non nomina i tutori non li tocca\n");

  /*
    `readGuardianInputFromCard(undefined)` restituisce `[]`, che e **vero**: un
    `PATCH` che portasse `data` senza la chiave `guardians` veniva percio letto
    come «questa scheda non ha piu tutori», e il modulo proprietario cancellava
    ogni riga non revocata.

    Non serviva malizia: `ATHLETE_SUMMARY_OMITTED_DATA_KEYS` **omette apposta**
    `guardians` dalla lettura riassuntiva, quindi qualunque codice che rilegga
    una scheda in forma breve e la risalvi innescava la cancellazione. Nessun
    permesso la governava — `canGrantAccess` governa solo la crescita — e
    nessuna riga di audit la registrava.
  */
  const SORELLA = await atletaIn(CLUB, "Sorella");
  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: SORELLA,
    rows: [{ firstName: "Madre", lastName: "Secondo", email: EMAIL_FAMIGLIA }],
    canGrantAccess: true,
  });

  const quante = async (id) =>
    prisma.athleteGuardian.count({ where: { athlete_id: id } });

  prova("2a SEMINA — la riga esiste", 1, await quante(SORELLA));

  await risorse.updateResource(
    "athletes",
    SORELLA,
    { data: { note: "una modifica che non parla di tutori" } },
    scopeOwner,
  );

  prova(
    "2b un salvataggio che non nomina i tutori non li cancella",
    1,
    await quante(SORELLA),
    "prima: bastava un PATCH con `data` e senza `guardians` per svuotare la famiglia",
  );

  /*
    **Il controllo**: chi **dice** di non avere piu tutori li perde davvero. La
    correzione distingue «non ne parlo» da «non ce ne sono»; senza questa meta,
    ignorare sempre la chiave passerebbe 2b e romperebbe la rimozione.
  */
  await risorse.updateResource(
    "athletes",
    SORELLA,
    { data: { guardians: [] } },
    scopeOwner,
  );

  prova(
    "2c CONTROLLO un salvataggio che dice `guardians: []` li toglie",
    0,
    await quante(SORELLA),
  );

  /* ================================================================== 3 */
  console.log("\n  3 — la revoca chiude ogni invito che il riscatto accetta\n");

  /*
    Lo sweep dei gettoni pretendeva un carico con `token_type` esattamente
    `parent_access`. Il riscatto era molto piu largo: accetta anche la grafia
    in cammello, e **deduce** il ruolo di genitore dalla sola presenza di
    `athlete_id` + `guardian_id`, senza chiedere alcun `token_type`.

    Un invito coniato senza quella chiave sopravviveva percio a **ogni** revoca:
    la riga chiusa, l'utenza staccata, l'audit in ordine — e il gettone ancora
    `active`. Chi lo aveva in tasca rientrava nel fascicolo del minore.

    Le due letture sono ora una funzione sola, `eCaricoDiTutore`: allargare la
    porta del riscatto allarga anche la revoca.
  */
  const NIPOTE = await atletaIn(CLUB, "Nipote");
  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: NIPOTE,
    rows: [{ firstName: "Padre", lastName: "Secondo", email: email("padre") }],
    canGrantAccess: true,
  });
  const rigaNipote = (
    await prisma.athleteGuardian.findMany({ where: { athlete_id: NIPOTE } })
  )[0];

  const gettone = async (club, carico) => {
    const id = randomUUID();
    await prisma.clubResourceItem.create({
      data: {
        id,
        organization_id: club,
        resource_type: "access_tokens",
        payload: carico,
        status: "active",
        updated_at: new Date(),
      },
    });
    return id;
  };

  const SENZA_TIPO = await gettone(CLUB, {
    athlete_id: NIPOTE,
    guardian_id: rigaNipote.id,
    one_time: true,
  });
  const CON_TIPO = await gettone(CLUB, {
    token_type: "parent_access",
    athlete_id: NIPOTE,
    guardian_id: rigaNipote.id,
    one_time: true,
  });

  prova(
    "3a SEMINA — il carico senza `token_type` e comunque un invito di tutore",
    true,
    tutori.eCaricoDiTutore({ athlete_id: NIPOTE, guardian_id: rigaNipote.id }),
    "e cio che il riscatto ne fa: da questi due campi deduce il ruolo di genitore",
  );

  await tutori.revokeGuardianAccessInClub(prisma, {
    organizationId: CLUB,
    userId: null,
    email: email("padre"),
  });

  const stato = async (id) =>
    (await prisma.clubResourceItem.findUnique({ where: { id } }))?.status;

  prova(
    "3b l'invito senza `token_type` risulta revocato",
    "revoked",
    await stato(SENZA_TIPO),
    "prima: restava `active`, e nessuna revoca poteva chiuderlo",
  );

  /*
    **Il controllo**: quello che il vaglio vecchio gia vedeva resta chiuso — la
    correzione ha allargato la lettura, non l'ha spostata.
  */
  prova(
    "3c CONTROLLO l'invito con `token_type` resta revocato",
    "revoked",
    await stato(CON_TIPO),
  );

  /*
    **Il secondo controllo**: un carico che il riscatto **non** legge come
    invito di tutore non viene chiuso da una revoca di tutore. Senza questa
    meta, uno sweep che revocasse ogni gettone passerebbe 3b.
  */
  const ALTRO = await gettone(CLUB, {
    token_type: "staff_invite",
    role: "trainer",
    athlete_id: NIPOTE,
    guardian_id: rigaNipote.id,
  });
  await tutori.revokeGuardianAccessInClub(prisma, {
    organizationId: CLUB,
    userId: null,
    email: email("padre"),
  });
  prova(
    "3d CONTROLLO un invito che non apre l'area famiglia non viene chiuso",
    "active",
    await stato(ALTRO),
  );

  /* ================================================================== 4 */
  console.log("\n  4 — una revoca non esce dal proprio club\n");

  /*
    La lettura dei gettoni non portava filtro di club: leggeva
    `club_resource_items` **di tutti** i club a ogni scrittura di tutore. Due
    conseguenze — una scansione senza tetto su un percorso caldo, e una revoca
    nel club A che poteva portare a `revoked` la riga del club B, perche
    `gettoneDiQuestaRiga` combacia anche su `legacy_id`, che viene dal blob e
    non e unico fra club.
  */
  const FIGLIO_B = await atletaIn(CLUB_B, "FiglioB");
  const LEGACY = `tutore-condiviso-${CLUB.slice(0, 8)}`;

  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_B,
    rows: [
      {
        legacyId: LEGACY,
        firstName: "Padre",
        lastName: "Secondo",
        email: email("padre"),
      },
    ],
    canGrantAccess: true,
  });

  const GETTONE_B = await gettone(CLUB_B, {
    token_type: "parent_access",
    athlete_id: FIGLIO_B,
    guardian_id: LEGACY,
  });
  const GETTONE_A = await gettone(CLUB, {
    token_type: "parent_access",
    athlete_id: FIGLIO_B,
    guardian_id: LEGACY,
  });

  await tutori.revokeGuardianAccessInClub(prisma, {
    organizationId: CLUB,
    userId: null,
    email: email("padre"),
  });

  prova(
    "4a la riga del club B non viene toccata da una revoca nel club A",
    "active",
    await stato(GETTONE_B),
    "prima: la lettura dei gettoni non aveva filtro di club",
  );

  /*
    **Il controllo**: dentro il proprio club la revoca continua a chiudere. Un
    filtro sbagliato che non trovasse piu niente passerebbe 4a.
  */
  prova(
    "4b CONTROLLO dentro il proprio club il gettone si chiude",
    "revoked",
    await stato(GETTONE_A),
  );

  console.log(
    `\n      Quattro reperti, sei controlli. Il quinto — la revoca di una`,
  );
  console.log(
    `      tessera non-parent — sta in pp-02-totalita-ruoli (T-13/T-15).\n`,
  );
};

try {
  await main();
} finally {
  for (const club of [CLUB, CLUB_B]) {
    await prisma
      .$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL "easygame.guardian_writer" = 'on'`);
        await tx.athleteGuardian.deleteMany({ where: { organization_id: club } });
      })
      .catch(() => {});
    await prisma.clubResourceItem
      .deleteMany({ where: { organization_id: club } })
      .catch(() => {});
    await prisma.athlete.deleteMany({ where: { organization_id: club } }).catch(() => {});
    await prisma.organizationUser
      .deleteMany({ where: { organization_id: club } })
      .catch(() => {});
    await prisma.auditLog.deleteMany({ where: { organization_id: club } }).catch(() => {});
    await prisma.club.deleteMany({ where: { id: club } }).catch(() => {});
  }
  await prisma.user
    .deleteMany({ where: { email: { endsWith: `-${coda}` } } })
    .catch(() => {});
  await prisma.$disconnect();
}

const ko = esiti.filter((e) => !e.ok).length;
console.log(`Esito: ${esiti.length - ko}/${esiti.length}`);
process.exit(ko ? 1 : 0);
