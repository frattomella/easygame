import assert from "node:assert/strict";
import test, { before } from "node:test";
import { readFileSync } from "node:fs";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

let canParentAccessAthlete;
let clearLinkedFields;
let unlinkGuardianAccount;
let linkGuardianAccount;
let saveGuardianRegistry;
let setPrismaClientForTests;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  ({ canParentAccessAthlete } = await import(
    "../../src/lib/server/parent-dashboard.ts"
  ));
  ({ clearLinkedFields, unlinkGuardianAccount } = await import(
    "../../src/lib/server/profile-account-links.ts"
  ));
  ({ linkGuardianAccount, saveGuardianRegistry } = await import(
    "../../src/lib/server/athlete-guardians.ts"
  ));
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

/**
 * **Le due proprieta piu gravi del pacchetto, dentro `npm test`.**
 *
 * Il settimo round ha chiuso due difetti di accesso — «Scollega account» che
 * non revocava, e un atleta che era tutore di se stesso — e le loro prove
 * vivevano **solo** in `scripts/pp-02-uat.mjs`, che gira contro un database
 * vero e **non e raccolto dalla discovery**: non e un `*.test.mjs` e non sta in
 * `package.json`. L'ottavo round lo ha misurato in una riga:
 *
 *     grep -rn "accessRevokedAt|allowSelfAthleteLink" tests/  →  0
 *
 * Cioe: si potevano revertire entrambe le correzioni e la suite restava verde.
 * CLAUDE.md §4 chiede che ogni commit che tocca accesso ai dati porti un test,
 * e quelle due righe erano il commit che ne aveva piu bisogno.
 *
 * Le sonde contro PostgreSQL restano — provano la **strada**, dalla rotta —
 * ma la rete di sicurezza che gira a ogni commit deve conoscere queste due
 * proprieta.
 */

const CLUB = "11111111-0000-4000-8000-000000000001";
const ANNA = "22222222-0000-4000-8000-000000000002";
const RAGAZZO = "33333333-0000-4000-8000-000000000003";
const FIGLIO = "44444444-0000-4000-8000-000000000004";

const BRUNO = "55555555-0000-4000-8000-000000000005";
const PRESIDENTE = "66666666-0000-4000-8000-000000000006";

const EMAIL_ANNA = "anna@famiglia.invalid";
/*
  **Un solo indirizzo per due genitori**: e la configurazione ordinaria di una
  famiglia, non un caso limite, ed e quella su cui il quattordicesimo round ha
  misurato che revocare la madre revocava anche il padre.
*/
const EMAIL_FAMIGLIA = "famiglia@rossi.invalid";

const seme = (guardiano) => ({
  user: [
    { id: ANNA, email: EMAIL_ANNA, email_verified_at: new Date() },
    { id: BRUNO, email: "bruno@famiglia.invalid", email_verified_at: new Date() },
    {
      id: PRESIDENTE,
      email: "presidente@asd.invalid",
      email_verified_at: new Date(),
    },
    {
      id: RAGAZZO,
      email: "ragazzo@famiglia.invalid",
      email_verified_at: new Date(),
    },
  ],
  club: [{ id: CLUB, name: "ASD Prova" }],
  organizationUser: [
    { id: "m1", organization_id: CLUB, user_id: ANNA, role: "parent" },
    { id: "m3", organization_id: CLUB, user_id: BRUNO, role: "parent" },
    { id: "m4", organization_id: CLUB, user_id: PRESIDENTE, role: "owner" },
    { id: "m2", organization_id: CLUB, user_id: RAGAZZO, role: "athlete" },
  ],
  athlete: [
    {
      id: FIGLIO,
      organization_id: CLUB,
      first_name: "Elia",
      last_name: "Prova",
      status: "active",
      user_id: RAGAZZO,
      data: { guardians: [guardiano] },
    },
  ],
});

const conRighe = (...guardiani) => {
  const base = seme(guardiani[0]);
  base.athlete[0].data = { guardians: guardiani };
  const fake = createFakePrisma(base);
  setPrismaClientForTests(fake.client);
  return fake;
};

const conSeme = (guardiano) => {
  const fake = createFakePrisma(seme(guardiano));
  setPrismaClientForTests(fake.client);
  return fake;
};

/* ------------------------------------------------- la revoca che revoca */

test("l'indirizzo di contatto, da solo, e un legame", async () => {
  /*
    E la decisione ADR-0127: la segreteria scrive l'indirizzo, la famiglia si
    registra con quello, e dentro un club dove ha gia una tessera il legame
    vale. Questa prova esiste per il verso opposto — perche la correzione della
    revoca **non deve** capovolgerla.
  */
  conSeme({ id: "t1", name: "Anna", email: EMAIL_ANNA });

  assert.equal(await canParentAccessAthlete(ANNA, FIGLIO), true);
});

test("dopo la revoca l'indirizzo di contatto non basta piu", async () => {
  /*
    Il difetto: `clearLinkedFields` azzera gli identificativi e **non**
    l'indirizzo di contatto, che al club serve per scrivere alla persona. Il
    vaglio dell'accesso quell'indirizzo lo accettava, quindi «Scollega account»
    rispondeva 200, la scheda diceva «Account non collegato», e chi era stato
    scollegato continuava a leggere calendario, rate, ricevute, documenti e i
    byte del certificato medico del minore.
  */
  const { next } = clearLinkedFields(
    { id: "t1", name: "Anna", email: EMAIL_ANNA, linkedUserId: ANNA },
    ANNA,
    EMAIL_ANNA,
  );

  assert.equal(next.linkedUserId, null, "l'identificativo si azzera");
  assert.equal(next.email, EMAIL_ANNA, "l'indirizzo resta: al club serve");
  assert.ok(next.accessRevokedAt, "e resta scritto che l'accesso e stato tolto");

  conSeme(next);
  assert.equal(await canParentAccessAthlete(ANNA, FIGLIO), false);
});

test("ci si ricollega riscattando, non sopravvivendo alla revoca", async () => {
  /*
    **Qui la regola e cambiata, di proposito** (PP-02 / WP-C).

    Prima un legame **dichiarato** apriva anche con il marchio addosso: il
    marchio negava il solo ripiego sull'indirizzo. Reggeva perche lo sweep
    della revoca **azzerava** i campi del legame — ed e proprio quello sweep
    che il reperto R-2 dimostra fallire sotto concorrenza. Cioe: quando la
    revoca non riusciva del tutto, l'accesso restava aperto, e la difesa
    che avrebbe dovuto chiuderlo era scritta per non intervenire.

    Adesso la revoca e un fatto sulla riga e vale su **tutti e due** i
    percorsi. Cio che la regola vecchia teneva aperto — potersi ricollegare —
    resta aperto, e passa dall'atto che lo dichiara: riscattare un invito, che
    e tracciato e revocabile.

    La divergenza e misurata anche contro PostgreSQL, in
    `scripts/pp-02-travaso-equivalente.mjs`, dove e l'unico caso in cui il
    predicato vecchio e la tabella non coincidono — e la sonda pretende
    esattamente questo verso.
  */
  conSeme({
    id: "t1",
    name: "Anna",
    email: EMAIL_ANNA,
    linkedUserId: ANNA,
    accessRevokedAt: new Date().toISOString(),
  });

  assert.equal(
    await canParentAccessAthlete(ANNA, FIGLIO),
    false,
    "una riga revocata non apre, nemmeno con il legame dichiarato ancora scritto",
  );

  await linkGuardianAccount(null, {
    athleteId: FIGLIO,
    identityKeys: [ANNA],
    userId: ANNA,
    email: EMAIL_ANNA,
  });

  assert.equal(
    await canParentAccessAthlete(ANNA, FIGLIO),
    true,
    "e il riscatto la riapre, che e la strada dichiarata",
  );
});

/* --------------------------------------- un atleta non e tutore di se */

test("per le rotte della famiglia un atleta non e tutore di se stesso", async () => {
  /*
    `athleteBelongsToParent` rispondeva vero quando chi chiede **e** l'atleta,
    e da li passava tutta l'area famiglia: recapiti dei tutori — dati di terzi
    — riga `data` grezza, allergie e note mediche, rate, ricevute, fatture; e
    dai documenti i byte del certificato. E poteva revocare il consenso alle
    immagini dato dal genitore.
  */
  conSeme({ id: "t1", name: "Anna", email: EMAIL_ANNA, linkedUserId: ANNA });

  assert.equal(await canParentAccessAthlete(RAGAZZO, FIGLIO), false);
});

test("ma chi lo chiede esplicitamente lo ottiene: e l'area del ragazzo", async () => {
  /*
    Due soli posti lo chiedono, e sono quelli che ne hanno diritto: l'area
    atleta, che da questi dati costruisce la propria proiezione ristretta, e
    l'RSVP, dove un sedicenne conferma la propria presenza e il ruolo con cui
    risponde e gia derivato da quel fatto.
  */
  conSeme({ id: "t1", name: "Anna", email: EMAIL_ANNA, linkedUserId: ANNA });

  assert.equal(
    await canParentAccessAthlete(RAGAZZO, FIGLIO, { allowSelfAthleteLink: true }),
    true,
  );
});

test("e il tutore vero resta tale in tutti e due i casi", async () => {
  conSeme({ id: "t1", name: "Anna", email: EMAIL_ANNA, linkedUserId: ANNA });

  assert.equal(await canParentAccessAthlete(ANNA, FIGLIO), true);
  assert.equal(
    await canParentAccessAthlete(ANNA, FIGLIO, { allowSelfAthleteLink: true }),
    true,
  );
});

/* ==================================================================== */
/*  La revoca vale per l'identita, non per la riga                       */
/* ==================================================================== */

test("una riga sorella con lo stesso indirizzo non riapre l'accesso", async () => {
  /*
    Il marchio stava sulla **riga**, e l'accesso si concede a un'**identita**.
    Bastava quindi aggiungere una riga nuova con lo stesso indirizzo e un `id`
    diverso — a mano, oppure lasciando che lo facesse il dominio dei moduli,
    che all'approvazione di un'iscrizione in cui la persona si dichiara tutore
    fa `guardians.push(...)` di un oggetto nuovo.

    L'elenco delle identita revocate vive sull'atleta e non ha un `id` da
    cambiare.
  */
  const righe = seme({ id: "t-vecchio", name: "Anna", email: EMAIL_ANNA });
  righe.athlete[0].data = {
    guardians: [
      { id: "t-vecchio", name: "Anna", email: EMAIL_ANNA },
      { id: "t-nuovo", name: "Anna", email: EMAIL_ANNA },
    ],
    revokedGuardianIdentities: [EMAIL_ANNA],
  };
  setPrismaClientForTests(createFakePrisma(righe).client);

  assert.equal(await canParentAccessAthlete(ANNA, FIGLIO), false);
});

test("un legame dichiarato riapre, perche e cosi che ci si ricollega", async () => {
  const righe = seme({ id: "t", name: "Anna", email: EMAIL_ANNA });
  righe.athlete[0].data = {
    guardians: [{ id: "t", name: "Anna", linkedUserId: ANNA }],
    revokedGuardianIdentities: [],
  };
  setPrismaClientForTests(createFakePrisma(righe).client);

  assert.equal(await canParentAccessAthlete(ANNA, FIGLIO), true);
});

/* ==================================================================== */
/*  Un indirizzo dichiarato da uno sconosciuto non e una credenziale     */
/* ==================================================================== */

test("una riga tutore nata da un modulo pubblico non apre l'area famiglia", async () => {
  /*
    ADR-0127 fa valere l'indirizzo di contatto come legame, e poggia su un
    presupposto: che lo abbia scritto **il club**. Un modulo pubblico lo
    compila chiunque, senza sessione.

    Bastava conoscere lo slug — il link che il club diffonde — e il nome di un
    minore tesserato: si dichiarava il proprio indirizzo nei campi `guardian.*`,
    la segreteria vedeva il minore fra i duplicati proposti, approvava, e da
    quel momento l'area famiglia di quel bambino era aperta a chi si registrava
    con quell'indirizzo.

    Approvare una pratica e un'operazione di anagrafica: non deve poter
    concedere un accesso, e chi la compie non ha modo di sapere che quella riga
    sarebbe una chiave.
  */
  const righe = seme({ id: "t", name: "Sconosciuto", email: EMAIL_ANNA });
  righe.athlete[0].data = {
    guardians: [
      { id: "t", name: "Sconosciuto", email: EMAIL_ANNA, contactOnly: true },
    ],
  };
  setPrismaClientForTests(createFakePrisma(righe).client);

  assert.equal(await canParentAccessAthlete(ANNA, FIGLIO), false);
});

test("ma un invito riscattato apre lo stesso, anche su quella riga", async () => {
  /*
    Il segno toglie il **ripiego** sull'indirizzo, non la possibilita di
    diventare tutore: si entra con un invito, che e la strada che ha il suo
    gate e che scrive un legame dichiarato.
  */
  const righe = seme({ id: "t", name: "Nuovo tutore", email: EMAIL_ANNA });
  righe.athlete[0].data = {
    guardians: [
      {
        id: "t",
        name: "Nuovo tutore",
        email: EMAIL_ANNA,
        contactOnly: true,
        linkedUserId: ANNA,
      },
    ],
  };
  setPrismaClientForTests(createFakePrisma(righe).client);

  assert.equal(await canParentAccessAthlete(ANNA, FIGLIO), true);
});

test("il rinnovo che la famiglia invia non le toglie l'accesso", async () => {
  /*
    `contactOnly` nasce per lo sconosciuto che compila un modulo pubblico. Il
    criterio era pero `source !== "internal"`, cioe l'etichetta del
    **trasporto**: `submitRenewalForm` — la strada con cui una famiglia
    **autenticata** rinnova dall'area famiglia, dopo che il legame e stato
    dimostrato — salva anch'essa `source: "public"`.

    Il genitore rinnovava, la segreteria approvava, e al caricamento dopo lui
    trovava «Accesso negato». Colpiva esattamente le famiglie che entrano nel
    modo che ADR-0127 prevede: quelle che non hanno riscattato un gettone.

    Cio che distingue lo sconosciuto e che la sua compilazione **non ha un
    autore dimostrato**.
  */
  const righe = seme({ id: "t", name: "Anna", email: EMAIL_ANNA });
  righe.athlete[0].data = {
    guardians: [{ id: "t", name: "Anna", email: EMAIL_ANNA }],
  };
  setPrismaClientForTests(createFakePrisma(righe).client);

  assert.equal(
    await canParentAccessAthlete(ANNA, FIGLIO),
    true,
    "una riga senza marchio, scritta dalla segreteria, vale come sempre",
  );
});

test("il criterio del marchio e chi ha scritto l'indirizzo, non chi ha compilato", () => {
  /*
    **Tre stesure, e le prime due si vedono solo insieme.**

    `contactOnly` marca la riga tutore nata da una compilazione di cui il club
    non e l'autore, perche ADR-0127 fa valere l'indirizzo come **chiave** e
    quella regola poggia sul presupposto che lo scriva la segreteria.

    - `source !== "internal"`, applicato anche al ramo che **aggiorna**,
      declassava il genitore che rinnovava: al caricamento dopo trovava
      «Accesso negato» sul proprio figlio;
    - `!submitted_by` curava quel sintomo e ne apriva uno peggiore.
      `submitRenewalForm` scrive `submittedBy: userId`, quindi **ogni riga
      nuova nata da un rinnovo usciva senza marchio**: un tutore legittimo
      dichiarava un terzo con un indirizzo qualunque, la segreteria leggeva
      «Genitore aggiunto» e approvava, e quell'indirizzo apriva allergie,
      farmaci, i byte del certificato, rate e ricevute.

    La domanda giusta e **chi ha scritto quell'indirizzo**, e l'unica
    compilazione di cui «il club» e la risposta e quella interna. Il ripiego
    che la prima stesura aveva rotto resta intatto perche il criterio vale
    **solo sulla riga che nasce**: quella del genitore che rinnova esiste gia.

    La prova end-to-end — rinnovo, approvazione, e l'accesso del terzo — vive
    in `scripts/pp-02-uat.mjs` (`W-29`), che percorre le rotte vere contro
    PostgreSQL. Qui si tiene fermo il **criterio**, che e la riga che le tre
    stesure hanno cambiato.
  */
  const sorgente = readFileSync(
    new URL("../../src/lib/server/form-submissions.ts", import.meta.url),
    "utf8",
  );

  assert.ok(
    sorgente.includes(
      'const compilataDalClub = asText(row.source) === "internal";',
    ),
    "il criterio e chi ha scritto l'indirizzo",
  );
  assert.ok(
    sorgente.includes("contactOnly: !compilataDalClub,"),
    "e il criterio arriva al modulo proprietario cosi com'e",
  );
  assert.ok(
    !sorgente.includes("const senzaAutore ="),
    "il criterio dell'autore dimostrato non deve sopravvivere accanto al nuovo",
  );

  /*
    **«Solo sulla riga che nasce» non e piu una condizione: e una proprieta.**

    Era `if (!compilataDalClub && rigaNuova)`, dove `rigaNuova` si deduceva
    dalla **posizione** — un indice dentro l'array — e sbagliare quella
    deduzione voleva dire mettere il marchio a un tutore che la segreteria
    aveva scritto mesi prima, o non metterlo a uno sconosciuto.

    Adesso lo decide la `upsert` sulla chiave `(athlete_id, identity_key)`: il
    segno sta nel ramo che **crea** e non in quello che aggiorna, quindi la
    condizione non si puo sbagliare perche non si scrive.
  */
  const proprietario = readFileSync(
    new URL("../../src/lib/server/athlete-guardians.ts", import.meta.url),
    "utf8",
  );
  /*
    Si misura sulla porzione di file fra `create:` e `update:`, che e la
    domanda vera — non sulla forma esatta delle graffe, che cambia appena si
    aggiunge un campo.
  */
  const upsert = proprietario.slice(
    proprietario.indexOf("export const upsertGuardianFromFormApproval"),
  );
  const ramoCrea = upsert.slice(
    upsert.indexOf("create: {"),
    upsert.indexOf("update: {"),
  );
  const ramoAggiorna = upsert.slice(
    upsert.indexOf("update: {"),
    upsert.indexOf("update: {") + 400,
  );

  assert.ok(
    ramoCrea.includes("contact_only: contactOnly,"),
    "il segno si mette nel ramo che crea",
  );
  assert.ok(
    !ramoAggiorna.includes("contact_only"),
    "e non in quello che aggiorna: declasserebbe un tutore scritto dal club",
  );
});

/* --------------------------------- il quattordicesimo round ------------- */

test("il marchio di una riga non chiude l'altro genitore allo stesso indirizzo", async () => {
  /*
    **La regressione piu cara del pacchetto, e l'ha aperta una correzione.**

    Per raggiungere una seconda riga **della stessa persona** — un secondo
    invito riscattato, che scavalcava la revoca — la ripulitura filtrava con
    `isLinkedToTarget`, che combacia **anche sul solo indirizzo**. Su madre e
    padre con un unico indirizzo di famiglia, revocare la madre azzerava il
    legame dichiarato **del padre** e gli scriveva addosso il marchio: al
    caricamento successivo trovava «Accesso negato», e nessuno aveva premuto
    quel pulsante.

    Qui si tiene fermo il confine giusto: la riga sorella e la stessa
    **persona**, non lo stesso recapito.
  */
  const fake = conRighe(
    { id: "madre", name: "Anna", email: EMAIL_FAMIGLIA, linkedUserId: ANNA },
    { id: "padre", name: "Bruno", email: EMAIL_FAMIGLIA, linkedUserId: BRUNO },
  );

  assert.equal(await canParentAccessAthlete(BRUNO, FIGLIO), true, "prima");

  await unlinkGuardianAccount(
    {
      userId: PRESIDENTE,
      activeOrganizationId: CLUB,
      activeRole: "owner",
      activeMembershipId: null,
      allowedOrganizationIds: [CLUB],
      accessScopes: [],
    },
    /*
      L'identificativo e quello della **riga**, che e cio che la scheda riceve
      dalla proiezione. La chiave sintetica `"madre"` era un id del blob, e
      cambiava persona appena si cancellava una riga.
    */
    {
      athleteId: FIGLIO,
      guardianId: fake
        .rows("athleteGuardian")
        .find((r) => r.athlete_id === FIGLIO && r.user_id === ANNA).id,
    },
  );

  assert.equal(
    await canParentAccessAthlete(ANNA, FIGLIO),
    false,
    "la madre e stata revocata",
  );
  assert.equal(
    await canParentAccessAthlete(BRUNO, FIGLIO),
    true,
    "e il padre no: la riga sorella e la stessa persona, non lo stesso recapito",
  );
});

test("aggiungere un tutore che esiste come utenza chiede le due chiavi", async () => {
  /*
    **La stessa regola, misurata dove adesso vive** (PP-02 / WP-C).

    Prima era una guardia della rotta generica, che confrontava l'insieme delle
    identita **prima** e **dopo** dentro il blob. Quel confronto ha pagato tre
    stesure: comprimeva le grafie dell'identificativo con `firstText`, quindi
    una riga `{ linkedUserId: <gia dentro>, user_id: <un terzo> }` non faceva
    crescere niente e nessun permesso veniva chiesto — mentre
    `resolveFamilyRecipients` quel terzo lo raccoglieva e gli mandava le
    notifiche documentali sul minore.

    Adesso non c'e un insieme da confrontare: le identita sono le chiavi delle
    righe, e una riga nuova o c'e o non c'e. La regola resta la stessa, e sta
    nel modulo proprietario — **un'identita nuova concede solo se appartiene a
    qualcuno**, e allora servono le due chiavi insieme.
  */
  const fake = conSeme({ id: "t1", name: "Anna", email: EMAIL_ANNA });

  await assert.rejects(
    () =>
      saveGuardianRegistry(null, {
        organizationId: CLUB,
        athleteId: FIGLIO,
        rows: [
          { firstName: "Anna", email: EMAIL_ANNA },
          /* Bruno **esiste** come utenza: aggiungerlo e una concessione. */
          { firstName: "Bruno", email: "bruno@famiglia.invalid" },
        ],
        canGrantAccess: false,
      }),
    /Accesso negato/,
    "senza le due chiavi non si aggiunge un tutore che apre",
  );

  assert.equal(
    fake.rows("athleteGuardian").filter((r) => r.athlete_id === FIGLIO).length,
    1,
    "e il rifiuto non lascia meta salvataggio: la riga nuova non nasce",
  );
});

test("correggere un indirizzo che non appartiene a nessuno resta possibile", async () => {
  /*
    **Il prezzo che le stesure precedenti avevano pagato, e che non si ripaga.**

    Negare ogni **crescita** dell'insieme e gia stato provato: correggere un
    refuso nell'email di un tutore cambia l'insieme, quindi veniva rifiutato, e
    una «Segreteria» modellata come ruolo di club non poteva piu fare il lavoro
    di tutti i giorni.

    Cio che concede accesso non e scrivere un indirizzo: e scriverne uno che
    **corrisponde a un'utenza**. Un indirizzo che non e di nessuno non apre
    niente, e passa.
  */
  const fake = conSeme({ id: "t1", name: "Anna", email: EMAIL_ANNA });

  await saveGuardianRegistry(null, {
    organizationId: CLUB,
    athleteId: FIGLIO,
    rows: [{ firstName: "Anna", email: "anna@refuso.invalid" }],
    canGrantAccess: false,
  });

  const righe = fake
    .rows("athleteGuardian")
    .filter((r) => r.athlete_id === FIGLIO);

  assert.equal(righe.length, 1);
  assert.equal(
    righe[0].email,
    "anna@refuso.invalid",
    "l'indirizzo corretto e quello nuovo",
  );
});
