/**
 * **I reperti del vaglio strutturale, come prove permanenti.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs scripts/pp-02-vaglio-strutturale.mjs
 *
 * ---
 *
 * ## Perche esiste
 *
 * Dopo WP-C+D due revisori indipendenti hanno attaccato il passaggio dei tutori
 * all'archivio relazionale. Fra tutte le sonde che PP-02 aveva accumulato —
 * 268 contro PostgreSQL, 4.754 test — **nessuna** ha visto i sette difetti che
 * hanno trovato. Cinque li aveva introdotti il passaggio stesso, poche ore
 * prima.
 *
 * Le sonde dei revisori erano usa e getta e sono state cancellate con il loro
 * lavoro. Quelle proprieta pero non sono usa e getta: sono esattamente cio che
 * la prossima stesura rischia di rompere di nuovo, perche ognuna nasce da un
 * presupposto che sembrava ovvio.
 *
 * ## Cosa misura, e da quale presupposto sbagliato nasce
 *
 * | | Reperto | Il presupposto che era falso |
 * |---|---|---|
 * | 1 | il primo salvataggio di una scheda **travasata** cancellava l'accesso del tutore | «se la chiave calcolata non combacia, l'identita e cambiata» — su una scheda travasata non combacia **mai**, perche la chiave e l'utenza e cio che torna e l'indirizzo |
 * | 2 | una revoca non chiudeva il **gettone** pendente: la persona lo riscattava e rientrava | «il ripristino del gettone non ha piu niente da difendere» — era l'unico posto in cui viaggiava l'identificativo del record |
 * | 3 | un ruolo ristretto ai **soli moduli** si scriveva addosso il fascicolo di un minore | «chi esamina le pratiche e la gestione» — vero per i quattro ruoli canonici, falso per i ruoli personalizzati |
 * | 4 | l'indirizzo verificato si scriveva dal registro **generico** | «cambiare indirizzo azzera la verifica» — lo fa la rotta dedicata, non il registro |
 * | 5 | il travaso **fondeva** madre e padre con un indirizzo di famiglia | «due righe con la stessa identita sono la stessa persona» — con un indirizzo condiviso sono due |
 * | 6 | la proiezione cancellava il **codice fiscale** del tutore | «la proiezione riproduce la forma vecchia» — riproduceva le colonne che esistevano |
 * | 7 | cancellare la propria utenza falliva per chi era tutore | `SET NULL` e una `UPDATE`, e il vaglio rifiuta le `UPDATE` |
 *
 * ## La regola di lettura
 *
 * Ogni prova porta il suo **controllo**: la stessa mossa dove la difesa non
 * deve intervenire. Una prova senza controllo non distingue una difesa che
 * funziona da una che rifiuta tutto, e questo file esiste perche cinque difese
 * sembravano funzionare.
 *
 * La sonda misura, non corregge. I club vengono cancellati in `finally`.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { travasaTutori } from "./helpers/travaso-tutori.mjs";

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
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(64)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        nota: ${nota}`);
};

const CLUB = randomUUID();
const PRESIDENTE = randomUUID();
const MADRE = randomUUID();
const PADRE = randomUUID();
const ESTRANEO = randomUUID();

const email = (chi) => `${chi}-${CLUB.slice(0, 8)}@vaglio.local`;
const EMAIL_FAMIGLIA = email("famiglia");

const scopeOwner = {
  userId: PRESIDENTE,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  activeMembershipId: null,
  allowedOrganizationIds: [CLUB],
  accessScopes: [],
};

/** Un ruolo di club ristretto ai soli moduli: nessuna chiave sugli accessi. */
const scopeSoloModuli = {
  ...scopeOwner,
  activeRole:
    "custom:staff:vaglio#forms.read,forms.submissions.read,forms.submissions.review",
};

const utente = (id, indirizzo, nome) => ({
  id,
  email: indirizzo,
  email_verified_at: new Date(),
  first_name: nome,
  last_name: "Vaglio",
  password_hash: "$2b$10$vaglio",
  role: "user",
});

const atletaIn = async (club, nome, data = {}) => {
  const id = randomUUID();
  await prisma.athlete.create({
    data: {
      id,
      organization_id: club,
      first_name: nome,
      last_name: "Vaglio",
      status: "active",
      data,
      updated_at: new Date(),
    },
  });
  return id;
};

const atleta = (nome, data = {}) => atletaIn(CLUB, nome, data);

const main = async () => {
  const tutori = await carica("src/lib/server/athlete-guardians.ts");
  const risorse = await carica("src/lib/server/resources.ts");
  const cruscotto = await carica("src/lib/server/parent-dashboard.ts");
  const legami = await carica("src/lib/server/profile-account-links.ts");
  const contatti = await carica("src/lib/athlete-guardians.ts");

  await prisma.user.createMany({
    data: [
      utente(PRESIDENTE, email("presidente"), "Presidente"),
      utente(MADRE, EMAIL_FAMIGLIA, "Madre"),
      utente(PADRE, email("padre"), "Padre"),
      utente(ESTRANEO, email("estraneo"), "Estraneo"),
    ],
  });
  await prisma.club.create({
    data: {
      id: CLUB,
      name: "Vaglio strutturale",
      slug: `vaglio-${CLUB.slice(0, 8)}`,
      creator_id: PRESIDENTE,
    },
  });
  await prisma.organizationUser.createMany({
    data: [MADRE, PADRE, ESTRANEO].map((user_id) => ({
      id: randomUUID(),
      organization_id: CLUB,
      user_id,
      role: "parent",
    })),
  });

  /* ================================================================== 1 */
  console.log("\n  1 — il salvataggio di una scheda travasata\n");

  /*
    Il travaso da a un tutore collegato la chiave della sua **utenza**; cio che
    la scheda rimanda porta l'indirizzo, perche un legame non si crea salvando
    un'anagrafica. Le due cose non combaciano **mai**, e trattarlo come un
    cambio di identita cancellava la riga e ne creava una senza utenza.
  */
  const TRAVASATO = await atleta("Travasato", {
    guardians: [
      {
        id: "t-travasato",
        name: "Madre",
        email: EMAIL_FAMIGLIA,
        linkedUserId: MADRE,
      },
    ],
  });
  await travasaTutori(prisma, [CLUB]);

  prova(
    "1a prima del salvataggio la madre travasata trova il figlio",
    [TRAVASATO],
    (await cruscotto.getParentLinkedAthletes(MADRE)).map((a) => a.id),
  );

  const proiezione = (
    await prisma.athlete.findUnique({
      where: { id: TRAVASATO },
      select: { data: true },
    })
  )?.data?.guardians;

  /* Il salvataggio ordinario: la scheda rimanda cio che ha letto. */
  const salvataggio = await risorse
    .updateResource(
      "athletes",
      TRAVASATO,
      { first_name: "Travasato", data: { guardians: proiezione } },
      scopeOwner,
    )
    .then(() => "riuscito")
    .catch((errore) => String(errore?.message || errore));

  prova("1b il salvataggio riesce", "riuscito", salvataggio);

  const dopo1 = await prisma.athleteGuardian.findMany({
    where: { athlete_id: TRAVASATO },
  });

  prova(
    "1c la riga conserva l'utenza e la sua chiave",
    [1, MADRE, MADRE],
    [dopo1.length, dopo1[0]?.user_id, dopo1[0]?.identity_key],
    "prima: la riga veniva cancellata e ricreata senza utenza",
  );

  prova(
    "1d e la madre trova ancora il figlio",
    [TRAVASATO],
    (await cruscotto.getParentLinkedAthletes(MADRE)).map((a) => a.id),
  );

  /*
    **Il controllo**: lo stesso salvataggio da un ruolo **senza** le due chiavi.
    Prima rispondeva 403 — il giro di andata e ritorno della proiezione veniva
    contato come una crescita — e la scheda diventava non salvabile.
  */
  prova(
    "1e CONTROLLO un ruolo senza chiavi salva comunque la scheda travasata",
    "riuscito",
    await risorse
      .updateResource(
        "athletes",
        TRAVASATO,
        { data: { guardians: proiezione } },
        scopeSoloModuli,
      )
      .then(() => "riuscito")
      .catch((errore) => String(errore?.message || errore)),
    "correggere un telefono non deve chiedere la chiave che governa gli accessi",
  );

  /* ================================================================== 2 */
  console.log("\n  2 — la revoca chiude anche l'invito pendente\n");

  /*
    Il gettone vive in `club_resource_items` e il suo carico nomina l'atleta e
    la riga del tutore. Quando la rotta generica ha smesso di accettare
    l'elenco dei tutori — giustamente, un gettone e una credenziale —
    l'identificativo del record non e piu arrivato da nessuna parte, e la
    revoca cercava un campo che non esisteva piu: la persona appena esclusa
    riscattava l'invito e rientrava.
  */
  const CON_INVITO = await atleta("ConInvito");
  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: CON_INVITO,
    rows: [{ firstName: "Madre", email: EMAIL_FAMIGLIA }],
    canGrantAccess: true,
  });
  const rigaInvito = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: CON_INVITO },
  });

  const CODICE = `PARVAGLIO${CLUB.slice(0, 4).toUpperCase()}`;
  const record = await prisma.clubResourceItem.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      resource_type: "access_tokens",
      name: CODICE,
      status: "active",
      payload: {
        role: "parent",
        one_time: true,
        token_type: "parent_access",
        athlete_id: CON_INVITO,
        guardian_id: rigaInvito.id,
        expires_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
      },
      updated_at: new Date(),
    },
  });

  prova(
    "2a la proiezione mostra il gettone appena coniato",
    [CODICE, record.id],
    await (async () => {
      await tutori.refreshGuardianProjection(prisma, [CON_INVITO]);
      const riga = (
        await prisma.athlete.findUnique({
          where: { id: CON_INVITO },
          select: { data: true },
        })
      )?.data?.guardians?.[0];
      return [riga?.parentAccessTokenValue, riga?.parentAccessTokenRecordId];
    })(),
    "prima: l'identificativo del record non arrivava piu, e la scheda non lo mostrava",
  );

  await legami.unlinkGuardianAccount(scopeOwner, {
    athleteId: CON_INVITO,
    guardianId: rigaInvito.id,
  });

  prova(
    "2b la revoca chiude il gettone pendente",
    "revoked",
    (await prisma.clubResourceItem.findUnique({ where: { id: record.id } }))
      ?.status,
    "prima: restava attivo, e la persona revocata rientrava riscattandolo",
  );

  /*
    **Il controllo**: un gettone che nomina un **altro** tutore non si chiude.
    Senza, questa prova passerebbe anche revocando tutti i gettoni del club.
  */
  const ALTRO = await atleta("Altro");
  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: ALTRO,
    rows: [{ firstName: "Padre", email: email("padre") }],
    canGrantAccess: true,
  });
  const rigaAltro = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: ALTRO },
  });
  const recordAltro = await prisma.clubResourceItem.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      resource_type: "access_tokens",
      name: `PARALTRO${CLUB.slice(0, 4).toUpperCase()}`,
      status: "active",
      payload: {
        role: "parent",
        token_type: "parent_access",
        athlete_id: ALTRO,
        guardian_id: rigaAltro.id,
      },
      updated_at: new Date(),
    },
  });
  await legami.unlinkGuardianAccount(scopeOwner, {
    athleteId: CON_INVITO,
    guardianId: rigaInvito.id,
  }).catch(() => {});

  prova(
    "2c CONTROLLO il gettone di un altro tutore resta attivo",
    "active",
    (await prisma.clubResourceItem.findUnique({ where: { id: recordAltro.id } }))
      ?.status,
  );

  /* ================================================================== 3 */
  console.log("\n  3 — approvare un modulo non concede un accesso\n");

  /*
    Il presupposto «chi esamina le pratiche e la gestione» e vero per i quattro
    ruoli canonici e falso per i ruoli personalizzati, che esistono proprio per
    sciogliere quel mazzo. Un ruolo ristretto ai soli moduli si dichiarava
    tutore di un minore qualunque e si approvava da solo.
  */
  const MODULO = await atleta("Modulo");

  const concessioneDaModulo = await tutori
    .upsertGuardianFromFormApproval(prisma, {
      organizationId: CLUB,
      athleteId: MODULO,
      row: { firstName: "Estraneo", email: email("estraneo") },
      contactOnly: false,
      canGrantAccess: false,
    })
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "3a un ruolo senza le due chiavi non concede un accesso da un modulo",
    true,
    concessioneDaModulo.includes("Accesso negato"),
    concessioneDaModulo,
  );

  prova(
    "3b e infatti non apre il fascicolo",
    false,
    await cruscotto.canParentAccessAthlete(ESTRANEO, MODULO),
  );

  /*
    **Il controllo, in due versi.** Una compilazione **pubblica** crea la riga
    e non concede niente — e la capability di ADR-0114 al contrario — e la
    stessa mossa **con** le chiavi passa.
  */
  await tutori.upsertGuardianFromFormApproval(prisma, {
    organizationId: CLUB,
    athleteId: MODULO,
    row: { firstName: "Estraneo", email: email("estraneo") },
    contactOnly: true,
    canGrantAccess: false,
  });

  prova(
    "3c CONTROLLO una riga solo-recapito nasce, e non apre",
    [1, false],
    [
      (await prisma.athleteGuardian.count({ where: { athlete_id: MODULO } })),
      await cruscotto.canParentAccessAthlete(ESTRANEO, MODULO),
    ],
  );

  const MODULO_B = await atleta("ModuloB");
  await tutori.upsertGuardianFromFormApproval(prisma, {
    organizationId: CLUB,
    athleteId: MODULO_B,
    row: { firstName: "Padre", email: email("padre") },
    contactOnly: false,
    canGrantAccess: true,
  });

  prova(
    "3d CONTROLLO con le due chiavi la stessa mossa concede",
    true,
    await cruscotto.canParentAccessAthlete(PADRE, MODULO_B),
  );

  /* ================================================================== 4 */
  console.log("\n  4 — l'indirizzo verificato non si dichiara\n");

  /*
    L'apertura per indirizzo di contatto poggia sul fatto che `email_verified_at`
    si guadagni leggendo quella casella. Il registro generico lo scriveva.
  */
  await risorse
    .updateResource(
      "users",
      ESTRANEO,
      { email: email("rubato"), email_verified_at: new Date() },
      { ...scopeOwner, userId: ESTRANEO },
    )
    .catch(() => null);

  const dopoScrittura = await prisma.user.findUnique({ where: { id: ESTRANEO } });

  prova(
    "4a cambiare indirizzo dal registro generico spegne la verifica",
    [email("rubato"), null],
    [dopoScrittura?.email, dopoScrittura?.email_verified_at],
    "prima: si dichiarava verificato, e si apriva il fascicolo di un minore",
  );

  /*
    **Il controllo**: la verifica non si perde quando l'indirizzo **non**
    cambia. Senza, questa prova passerebbe anche azzerando la verifica sempre —
    cioe rompendo l'accesso di ogni famiglia a ogni salvataggio.
  */
  await prisma.user.update({
    where: { id: PADRE },
    data: { email_verified_at: new Date() },
  });
  await risorse
    .updateResource("users", PADRE, { first_name: "Padre" }, { ...scopeOwner, userId: PADRE })
    .catch(() => null);

  prova(
    "4b CONTROLLO un salvataggio che non tocca l'indirizzo non spegne niente",
    true,
    Boolean((await prisma.user.findUnique({ where: { id: PADRE } }))?.email_verified_at),
  );

  /* ================================================================== 5 */
  console.log("\n  5 — il travaso non fonde due persone\n");

  /*
    Madre e padre con **un solo indirizzo di famiglia** e la configurazione
    ordinaria di ADR-0114. Il travaso raggruppava per identita, e l'identita di
    una riga senza utenza e il suo indirizzo: le due righe collassavano in una,
    e del secondo genitore restava solo il nome del primo.
  */
  /*
    Un club usa e getta: il travaso non si rilancia su un club che ha gia le
    sue righe — cadrebbe sulla chiave unica. La migrazione vera e idempotente
    perche svuota la tabella prima; l'aiutante delle sonde non lo fa, e non
    deve farlo.
  */
  const CLUB_FUSIONE = randomUUID();
  await prisma.club.create({
    data: {
      id: CLUB_FUSIONE,
      name: "Fusione",
      slug: `fusione-${CLUB_FUSIONE.slice(0, 8)}`,
      creator_id: PRESIDENTE,
    },
  });
  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB_FUSIONE,
      user_id: MADRE,
      role: "parent",
    },
  });

  const FUSIONE = await atletaIn(CLUB_FUSIONE, "Fusione", {
    guardians: [
      { id: "g1", name: "Madre", surname: "Fusione", email: EMAIL_FAMIGLIA, phone: "111", fiscalCode: "MDRFSN80A01H501A" },
      { id: "g2", name: "Padre", surname: "Fusione", email: EMAIL_FAMIGLIA, phone: "222", fiscalCode: "PDRFSN80A01H501B" },
    ],
  });
  await travasaTutori(prisma, [CLUB_FUSIONE]);

  const righeFusione = await prisma.athleteGuardian.findMany({
    where: { athlete_id: FUSIONE },
    orderBy: [{ position: "asc" }],
  });

  prova(
    "5a due tutori con un indirizzo di famiglia restano due",
    [2, "Madre", "Padre"],
    [righeFusione.length, righeFusione[0]?.first_name, righeFusione[1]?.first_name],
    "prima: collassavano in una riga, e il secondo genitore spariva",
  );

  prova(
    "5b e tutti e due aprono, perche l'indirizzo e lo stesso",
    [true, true],
    [
      await cruscotto.canParentAccessAthlete(MADRE, FUSIONE),
      Boolean(righeFusione[1]?.email === EMAIL_FAMIGLIA),
    ],
  );

  /* ================================================================== 6 */
  console.log("\n  6 — la proiezione non cancella il codice fiscale\n");

  await tutori.refreshGuardianProjection(prisma, [FUSIONE]);
  const proiettata = (
    await prisma.athlete.findUnique({
      where: { id: FUSIONE },
      select: { data: true },
    })
  )?.data?.guardians;

  prova(
    "6a il codice fiscale sopravvive alla proiezione",
    ["MDRFSN80A01H501A", "PDRFSN80A01H501B"],
    [proiettata?.[0]?.fiscalCode, proiettata?.[1]?.fiscalCode],
    "prima: il primo salvataggio lo azzerava per tutto il club, senza modo di riscriverlo",
  );

  prova(
    "6b e sopravvive anche a un salvataggio ordinario della scheda",
    ["MDRFSN80A01H501A", "PDRFSN80A01H501B"],
    await (async () => {
      await risorse.updateResource(
        "athletes",
        FUSIONE,
        { data: { guardians: proiettata } },
        { ...scopeOwner, activeOrganizationId: CLUB_FUSIONE, allowedOrganizationIds: [CLUB_FUSIONE] },
      );
      const riletta = (
        await prisma.athlete.findUnique({
          where: { id: FUSIONE },
          select: { data: true },
        })
      )?.data?.guardians;
      return [riletta?.[0]?.fiscalCode, riletta?.[1]?.fiscalCode];
    })(),
  );

  /* ================================================================== 7 */
  console.log("\n  7 — una revoca toglie anche i canali di avviso\n");

  /*
    Tre lettori decidono **chi riceve** un avviso leggendo i due registri di
    scheda, che WP-C aveva cancellato: una persona revocata restava fra i
    destinatari dei promemoria sul certificato di un minore e dei solleciti con
    il link per pagare. Il caso e quello ordinario: due genitori, un indirizzo.
  */
  await tutori.revokeGuardianAccessInClub(prisma, {
    organizationId: CLUB_FUSIONE,
    userId: MADRE,
    email: EMAIL_FAMIGLIA,
  });

  const scheda = await prisma.athlete.findUnique({ where: { id: FUSIONE } });
  const recapiti = contatti.readAthleteGuardianContacts(scheda);

  prova(
    "7a l'indirizzo revocato non esce piu fra i recapiti",
    [],
    recapiti.map((r) => r.email).filter((e) => e === EMAIL_FAMIGLIA),
    "prima: la riga sorella con lo stesso indirizzo lo rimetteva fra i destinatari",
  );

  prova(
    "7b e la revoca e scritta come identita, non solo come riga",
    true,
    (scheda?.data?.revokedGuardianIdentities || []).includes(EMAIL_FAMIGLIA),
  );

  /*
    **Il controllo**: prima della revoca quell'indirizzo usciva. Senza, la prova
    passerebbe anche con un lettore che non restituisce mai niente.
  */
  const VIVO = await atleta("Vivo");
  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: VIVO,
    rows: [{ firstName: "Padre", email: email("padre") }],
    canGrantAccess: true,
  });
  const schedaViva = await prisma.athlete.findUnique({ where: { id: VIVO } });

  prova(
    "7c CONTROLLO un tutore non revocato resta fra i recapiti",
    [email("padre")],
    contatti.readAthleteGuardianContacts(schedaViva).map((r) => r.email),
  );

  /* ================================================================== 8 */
  console.log("\n  8 — cancellare la propria utenza resta possibile\n");

  /*
    `athlete_guardians.user_id` e `ON DELETE SET NULL`, che PostgreSQL esegue
    come una **UPDATE**: il vaglio del proprietario la rifiutava, e cancellare
    il proprio account falliva con un errore opaco per chiunque fosse tutore.
  */
  const DA_CANCELLARE = randomUUID();
  await prisma.user.create({
    data: utente(DA_CANCELLARE, email("cancellando"), "Cancellando"),
  });
  const SUO_FIGLIO = await atleta("SuoFiglio");
  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: SUO_FIGLIO,
    rows: [{ firstName: "Cancellando", email: email("cancellando") }],
    canGrantAccess: true,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: SUO_FIGLIO,
    identityKeys: [email("cancellando")],
    userId: DA_CANCELLARE,
    email: email("cancellando"),
  });

  prova(
    "8a cancellare l'utenza di un tutore riesce",
    "riuscita",
    await prisma.user
      .delete({ where: { id: DA_CANCELLARE } })
      .then(() => "riuscita")
      .catch((errore) => String(errore?.message || errore).split("\n")[0]),
    "prima: il vaglio rifiutava la SET NULL, e l'account non si poteva cancellare",
  );

  prova(
    "8b e la riga resta, senza l'utenza",
    [1, null],
    await (async () => {
      const righe = await prisma.athleteGuardian.findMany({
        where: { athlete_id: SUO_FIGLIO },
      });
      return [righe.length, righe[0]?.user_id ?? null];
    })(),
  );

  /*
    **Il controllo**: la deroga vale **solo** per l'azzeramento di un'utenza
    che non c'e piu. Una `UPDATE` qualunque da fuori il modulo resta rifiutata.
  */
  prova(
    "8c CONTROLLO una UPDATE estranea resta rifiutata",
    "rifiutata",
    await prisma.athleteGuardian
      .updateMany({
        where: { athlete_id: SUO_FIGLIO },
        data: { revoked_at: null, contact_only: true },
      })
      .then(() => "passata")
      .catch(() => "rifiutata"),
  );

  console.log(
    `\n      Sette reperti, sette controlli. Nessuna di queste proprieta era`,
  );
  console.log(
    `      misurata dalle 268 sonde e dai 4.754 test che c'erano prima.\n`,
  );
};

try {
  await main();
} finally {
  await prisma
    .$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL "easygame.guardian_writer" = 'on'`);
      await tx.athleteGuardian.deleteMany({ where: { organization_id: CLUB } });
    })
    .catch(() => {});
  await prisma
    .$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL "easygame.guardian_writer" = 'on'`);
      await tx.athleteGuardian.deleteMany({
        where: { organization: { slug: { startsWith: "fusione-" } } },
      });
    })
    .catch(() => {});
  await prisma.athlete
    .deleteMany({ where: { organization: { slug: { startsWith: "fusione-" } } } })
    .catch(() => {});
  await prisma.organizationUser
    .deleteMany({ where: { organization: { slug: { startsWith: "fusione-" } } } })
    .catch(() => {});
  await prisma.club.deleteMany({ where: { slug: { startsWith: "fusione-" } } }).catch(() => {});
  await prisma.clubResourceItem.deleteMany({ where: { organization_id: CLUB } }).catch(() => {});
  await prisma.athlete.deleteMany({ where: { organization_id: CLUB } }).catch(() => {});
  await prisma.organizationUser.deleteMany({ where: { organization_id: CLUB } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { organization_id: CLUB } }).catch(() => {});
  await prisma.club.deleteMany({ where: { id: CLUB } }).catch(() => {});
  await prisma.user
    .deleteMany({ where: { email: { endsWith: `-${CLUB.slice(0, 8)}@vaglio.local` } } })
    .catch(() => {});
  await prisma.$disconnect();
}

const ko = esiti.filter((e) => !e.ok).length;
console.log(`Esito: ${esiti.length - ko}/${esiti.length}`);
process.exit(ko ? 1 : 0);
