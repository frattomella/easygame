import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **La porta di servizio dell'area atleta** (PP-04, ADR-0117, ADR-0118 e
 * ADR-0122).
 *
 * ---
 *
 * ## Il difetto, e perche era invisibile
 *
 * ADR-0114 ha chiuso `findAthleteProfileForUser`: l'area atleta non si apre
 * piu sul solo `athletes.user_id`, perche quel legame puo sopravvivere alla
 * tessera. La lane lo ha misurato, documentato e presidiato.
 *
 * **Lo stesso campo ha pero un secondo lettore**, `athleteBelongsToParent` in
 * `parent-dashboard.ts`, e quello non se la faceva, quella domanda. Una
 * revisione ostile ha misurato la coppia: con **zero tessere** nel club,
 * `GET /api/v1/athlete-accounts/me` rispondeva 403 e
 * `GET /api/parent-dashboard/<la stessa scheda>` rispondeva 200 — con dentro
 * strettamente **di piu** dell'area atleta: quote e ricevute, anagrafica dei
 * tutori, contenuto clinico. E un `PATCH .../notifications` scriveva.
 *
 * La porta d'ingresso era chiusa e quella di servizio dava su una stanza piu
 * grande. E la stessa lezione di PP-02 — «una revoca vale sull'identita, non
 * sulla riga che si e guardata» — applicata a **una sola delle due rotte che
 * leggono quel campo**.
 *
 * ## E il secondo difetto, sull'atleta in regola
 *
 * L'elenco chiuso `CAMPI_AREA_ATLETA` tiene fuori denaro, tutori e contenuto
 * clinico «non per dimenticanza»: e vero, e vale **sulla proiezione**. Non
 * valeva sulla rotta. Un atleta perfettamente in regola apriva
 * `/api/parent-dashboard/<la propria scheda>` e riceveva il payload intero.
 *
 * ## Cosa presidia questo file
 *
 * 1. il ramo diretto pretende una tessera di atleta **viva**;
 * 2. il ramo del **tutore** non e stato toccato — un tutore resta dentro;
 * 3. `allowSelfAthleteLink: false` chiude il ramo diretto senza toccare il
 *    tutore, ed e cio che le rotte del cruscotto di famiglia passano;
 * 4. la funzione che risponde alla domanda e **una sola** per i due lettori.
 */

const CLUB = "aaaaaaaa-7c00-4000-8000-00000000000a";
const UTENTE_ATLETA = "55555555-7c00-4000-8000-000000000eee";
const TUTORE = "66666666-7c00-4000-8000-000000000fff";
const ATLETA = "aaaa1111-7c00-4000-8000-00000000aaaa";
const FIGLIO = "bbbb2222-7c00-4000-8000-00000000bbbb";

let famiglia;
let accessi;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  famiglia = await import("../../src/lib/server/parent-dashboard.ts");
  accessi = await import("../../src/lib/server/athlete-accounts.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

/**
 * `tessera` e il ruolo che l'utenza dell'atleta ha nel club, o `null` per
 * «nessuna tessera»: e la variabile che l'intero file muove.
 */
const seed = (tessera = "athlete") => ({
  user: [
    {
      id: UTENTE_ATLETA,
      email: "aldo@atleti.it",
      email_verified_at: new Date(),
    },
    { id: TUTORE, email: "tutore@famiglia.it", email_verified_at: new Date() },
  ],
  club: [{ id: CLUB, slug: "club", name: "Polisportiva Test" }],
  organizationUser: [
    ...(tessera
      ? [
          {
            id: "ou-atleta",
            organization_id: CLUB,
            user_id: UTENTE_ATLETA,
            role: tessera,
          },
        ]
      : []),
    {
      id: "ou-tutore",
      organization_id: CLUB,
      user_id: TUTORE,
      role: "parent",
    },
  ],
  athlete: [
    {
      id: ATLETA,
      organization_id: CLUB,
      user_id: UTENTE_ATLETA,
      first_name: "Aldo",
      last_name: "Atleta",
      status: "active",
      /*
        **La casella di famiglia e scritta due volte, e nella vita vera lo e
        quasi sempre** (ADR-0122).

        La segreteria scrive l'indirizzo dei genitori nel tutore, e su quello
        stesso indirizzo invita il ragazzo: `guardians[].email` finisce cosi a
        coincidere con l'indirizzo dell'utenza dell'atleta. E la precondizione
        che il prodotto **produce da se**, ed e su di essa che il primo fix del
        Critical si era spostato invece di chiuderlo.
      */
      data: {
        guardians: [
          {
            id: "tutore-di-aldo",
            name: "Mamma",
            surname: "Atleta",
            relationship: "Madre",
            email: "aldo@atleti.it",
          },
        ],
      },
    },
    {
      id: FIGLIO,
      organization_id: CLUB,
      user_id: null,
      first_name: "Nina",
      last_name: "Piccoli",
      status: "active",
      data: {
        guardians: [
          {
            id: "tutore-1",
            name: "Bianca",
            surname: "Piccoli",
            relationship: "Madre",
            linkedUserId: TUTORE,
          },
        ],
      },
    },
  ],
  clubRole: [],
  /*
    **Il legame nasce da un riscatto, e la riga resta** (ADR-0123).

    `acceptAthleteAccountInvite` e l'unico scrittore di `athletes.user_id` in
    tutto il repository: gli altri tre punti lo azzerano. Modellare il legame
    senza la riga dell'invito accettato descriverebbe un archivio che il
    prodotto non produce — ed e proprio quella riga il fatto durevole su cui la
    guardia poggia quando la revoca cancella il campo.
  */
  athleteAccountInvite: [
    {
      id: "inv-aldo",
      organization_id: CLUB,
      athlete_id: ATLETA,
      user_id: UTENTE_ATLETA,
      email: "aldo@atleti.it",
      token_hash: "a".repeat(64),
      status: "accepted",
      accepted_at: new Date(),
      revoked_at: null,
      expires_at: new Date(Date.now() + 864e5),
      sent_at: new Date(),
    },
  ],
});

const monta = (tessera) => {
  fake = createFakePrisma(seed(tessera));
  setPrismaClientForTests(fake.client);
};

beforeEach(() => monta("athlete"));

/* ==================================================================== *
 *  1. Il ramo diretto pretende una tessera di atleta viva
 * ==================================================================== */

/** Il legame diretto va **chiesto**: e il predefinito restrittivo di ADR-0122. */
const COME_ATLETA = { allowSelfAthleteLink: true };

test("con la tessera di atleta il legame diretto vale, e le due porte concordano", async () => {
  assert.equal(
    await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA, COME_ATLETA),
    true,
  );
  const profilo = await accessi.findAthleteProfileForUser(UTENTE_ATLETA);
  assert.equal(profilo?.id, ATLETA, "e la porta d'ingresso e aperta");
});

test("senza nessuna tessera le due porte si chiudono insieme", async () => {
  monta(null);

  assert.equal(
    await accessi.findAthleteProfileForUser(UTENTE_ATLETA),
    null,
    "la porta d'ingresso (ADR-0114)",
  );
  assert.equal(
    await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA, COME_ATLETA),
    false,
    "e la porta di servizio (ADR-0117): era questa a restare aperta",
  );
});

test("cambiato il ruolo, il legame diretto non vale piu: ne di qua ne di la", async () => {
  /*
    E il caso P-45: `assignClubRole` sostituisce la tessera e non chiama
    nessuno sweep, quindi `athletes.user_id` resta. La persona appartiene
    ancora al club — quindi il ramo «club in cui ho una membership» del
    candidato la trova — ma non e piu un atleta.
  */
  for (const ruolo of ["staff", "trainer", "parent", "club_manager"]) {
    monta(ruolo);

    assert.equal(
      await accessi.findAthleteProfileForUser(UTENTE_ATLETA),
      null,
      `${ruolo} non e un atleta`,
    );
    assert.equal(
      await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA, COME_ATLETA),
      false,
      `${ruolo} non deve aprire il cruscotto sulla scheda che ha lasciato`,
    );
  }
});

test("lo slug italiano e un alias, non un ruolo diverso", async () => {
  /*
    La domanda passa da `normalizeAccessRole`, che e il vocabolario unico:
    `giocatore` e `atleta` sono `athlete`. Un secondo elenco di slug qui
    dentro sarebbe il difetto di partenza con un nome nuovo.
  */
  for (const slug of ["atleta", "giocatore", "player"]) {
    monta(slug);
    assert.equal(
      await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA, COME_ATLETA),
      true,
      `${slug} e un atleta`,
    );
  }
});

/* ==================================================================== *
 *  2. La guardia non fa troppo: il tutore resta dentro
 * ==================================================================== */

test("il tutore entra sulla scheda del figlio, e non ha bisogno di essere un atleta", async () => {
  assert.equal(await famiglia.canParentAccessAthlete(TUTORE, FIGLIO), true);

  /* E resta dentro anche quando il ramo diretto e chiuso per tutti. */
  monta(null);
  assert.equal(await famiglia.canParentAccessAthlete(TUTORE, FIGLIO), true);
});

test("un tutore non diventa per cio stesso la famiglia di un altro atleta", async () => {
  assert.equal(await famiglia.canParentAccessAthlete(TUTORE, ATLETA), false);
  assert.equal(
    await famiglia.canParentAccessAthlete(UTENTE_ATLETA, FIGLIO),
    false,
  );
});

/* ==================================================================== *
 *  3. `allowSelfAthleteLink: false` — il cruscotto lo apre un tutore
 * ==================================================================== */

test("il cruscotto di famiglia non si apre sul legame diretto, nemmeno per l'atleta in regola", async () => {
  /*
    L'atleta ha la sua tessera, e in regola, e la sua area gliela apre
    l'elenco chiuso di `CAMPI_AREA_ATLETA`. Da questa rotta uscirebbe invece
    il payload intero: quote, ricevute, anagrafica dei tutori, diagnosi e
    indirizzo del file del certificato.
  */
  assert.equal(
    await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA, {
      allowSelfAthleteLink: false,
    }),
    false,
  );

  assert.equal(
    await famiglia.getParentDashboardData(UTENTE_ATLETA, ATLETA, {
      allowSelfAthleteLink: false,
    }),
    null,
    "e la rotta riceve `null`, che e il suo 403",
  );
});

test("ma la stessa opzione non tocca il tutore: la famiglia entra come prima", async () => {
  assert.equal(
    await famiglia.canParentAccessAthlete(TUTORE, FIGLIO, {
      allowSelfAthleteLink: false,
    }),
    true,
  );
});

test("il valore predefinito e restrittivo: il ramo diretto va chiesto (ADR-0122)", async () => {
  /*
    **Il verso conta piu del valore.**

    Il primo giro aveva lasciato il predefinito permissivo e faceva dichiarare
    `false` alle cinque rotte del cruscotto. Con quella forma la difesa vale
    finche ognuno si ricorda: la rotta che se ne dimentica apre il payload
    intero, e non lo dice a nessuno.

    Adesso e il contrario, e questa e la riga che lo presidia: chi non chiede
    niente **non** entra sul legame diretto. Sono quattro i chiamanti che lo
    chiedono, ognuno con il suo commento accanto.
  */
  assert.equal(
    await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA),
    false,
  );
  assert.equal(
    await famiglia.getParentDashboardData(UTENTE_ATLETA, ATLETA),
    null,
    "e la rotta che non dichiara niente riceve `null`, che e il suo 403",
  );

  /* E chi lo chiede entra: la chiusura non spegne l'area atleta. */
  assert.equal(
    await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA, COME_ATLETA),
    true,
  );
});

/* ==================================================================== *
 *  3-bis. Il Critical vero: il ramo del tutore non e una seconda strada
 * ==================================================================== */

test("la casella di famiglia coincidente non riapre il cruscotto all'atleta", async () => {
  /*
    **Qui il primo fix aveva soltanto spostato il Critical.**

    ADR-0117 aveva chiuso il ramo diretto sulla tessera viva, e ADR-0118 lo
    aveva chiuso sulle rotte di famiglia. Nessuno dei due guardava
    `isGuardianLinkedToUser`, che accetta `guardians[].email` come ripiego di
    `linkedUserEmail`: e la casella su cui la segreteria invita il minore e la
    stessa che ha scritto nel tutore. Con quella coincidenza —
    che il flusso dell'invito **produce da se** — l'utenza dell'atleta usciva
    dal ramo del tutore e non incontrava piu ne `ancoraAtleta` ne
    `allowSelfAthleteLink`.

    Chi porta `athletes.user_id` **e** quella scheda, non la sua famiglia.
  */
  assert.equal(
    await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA),
    false,
    "il cruscotto pretende una tutela, e l'atleta non e il tutore di se stesso",
  );
  assert.equal(
    await famiglia.getParentDashboardData(UTENTE_ATLETA, ATLETA),
    null,
  );
});

test("e non la riapre nemmeno all'ex atleta senza piu nessuna tessera", async () => {
  monta(null);

  /*
    Il caso che la revisione ha misurato contro PostgreSQL: revocata la
    tessera, `/api/v1/athlete-accounts/me` rispondeva 403 e
    `/api/parent-dashboard/<la stessa scheda>` rispondeva 200 — quote,
    codice fiscale del tutore, diagnosi, indirizzo del file del certificato.
  */
  assert.equal(await accessi.findAthleteProfileForUser(UTENTE_ATLETA), null);
  assert.equal(
    await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA, COME_ATLETA),
    false,
    "nemmeno dichiarando il ramo diretto: la tessera non c'e piu",
  );
  assert.equal(
    await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA),
    false,
  );
});

test("ma un tutore vero con la stessa casella resta dentro: la guardia non fa troppo", async () => {
  /*
    **Il controllo sul non fare troppo, e qui e il piu importante di tutti.**

    Il tutore vero e un'**altra persona**: sulla sua riga `athletes.user_id`
    non punta a lui, quindi il ramo diretto non lo riguarda e il ramo del
    tutore vale come prima — anche quando la scheda porta il suo indirizzo
    invece di `linkedUserId`, che e il modo normale in cui un club registra
    un tutore prima che questo ne redima uno proprio.
  */
  fake = createFakePrisma({
    ...seed("athlete"),
    athlete: [
      {
        id: FIGLIO,
        organization_id: CLUB,
        user_id: null,
        first_name: "Nina",
        last_name: "Piccoli",
        status: "active",
        data: {
          guardians: [
            { id: "g1", name: "Bianca", email: "tutore@famiglia.it" },
          ],
        },
      },
    ],
  });
  setPrismaClientForTests(fake.client);

  assert.equal(
    await famiglia.canParentAccessAthlete(TUTORE, FIGLIO),
    true,
    "per email, senza tessera di atleta e senza dichiarare niente",
  );
});

/* ==================================================================== *
 *  4. Una funzione sola per i due lettori
 * ==================================================================== */

test("le due porte chiamano la stessa funzione, non due elenchi che divergono", async () => {
  const { readFileSync } = await import("node:fs");
  const path = await import("node:path");
  const radice = path.join(process.cwd(), "src", "lib", "server");

  for (const file of ["athlete-accounts.ts", "parent-dashboard.ts"]) {
    const sorgente = readFileSync(path.join(radice, file), "utf8");
    assert.ok(
      sorgente.includes("clubsWhereStillAthlete"),
      `${file} deve porre la domanda al modulo che la possiede`,
    );
  }

  /*
    E il modulo non ne contiene un secondo: la risoluzione del ruolo passa da
    `normalizeAccessRole` e da nient'altro.
  */
  const modulo = readFileSync(
    path.join(radice, "athlete-membership.ts"),
    "utf8",
  );
  assert.ok(modulo.includes("normalizeAccessRole"));
  assert.equal(
    /ATHLETE_ROLES|\["athlete",\s*"atleta"/.test(modulo),
    false,
    "nessun elenco di slug: il difetto e un elenco di slug",
  );
});

/* ==================================================================== *
 *  5. Chi dichiara il ramo diretto e un elenco corto, e si vede
 * ==================================================================== */

test("solo quattro chiamanti aprono il ramo diretto, e sono quelli dichiarati", async () => {
  /*
    **Il predefinito restrittivo vale quanto e corto l'elenco delle deroghe**
    (ADR-0122).

    Un `allowSelfAthleteLink: true` in piu e una rotta che consegna all'atleta
    il payload della famiglia: qui non si chiede se sia giusto — si chiede che
    **compaia in questa riga**, cioe che qualcuno lo abbia scritto di
    proposito. Una deroga nuova fa diventare rosso questo controllo, che e
    esattamente il momento in cui va discussa.
  */
  const { readFileSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");

  const ATTESI = [
    "src/lib/server/athlete-accounts.ts",
    "src/lib/server/rsvp.ts",
    "src/app/api/parent-dashboard/[athleteId]/board/route.ts",
    "src/app/api/v1/auth/memberships/route.ts",
  ];

  /*
    `git grep` invece di una scansione a mano: cerca nell'albero tracciato e
    non nei `node_modules`, e non ha bisogno di sapere come e fatto `src/`.
  */
  const uscita = execFileSync(
    "git",
    ["grep", "-l", "allowSelfAthleteLink: true", "--", "src"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  const trovati = uscita
    .split("\n")
    .map((riga) => riga.trim().replace(/\\/g, "/"))
    .filter(Boolean)
    .sort();

  assert.deepEqual(
    trovati,
    [...ATTESI].sort(),
    "chi apre il ramo diretto deve essere solo l'area atleta e cio che la serve",
  );

  /* E ognuno porta accanto la ragione: un `true` muto e un `true` dimenticato. */
  for (const file of ATTESI) {
    const sorgente = readFileSync(file, "utf8");
    const posizione = sorgente.indexOf("allowSelfAthleteLink: true");
    const contesto = sorgente.slice(Math.max(0, posizione - 900), posizione);
    assert.ok(
      contesto.includes("ADR-0122"),
      `${file} deve dire perche apre il ramo diretto`,
    );
  }
});

/* ==================================================================== *
 *  6. La revoca non riapre la porta che chiude (ADR-0123)
 * ==================================================================== */

test("scollegato l'account, il cruscotto non si riapre dal ramo del tutore", async () => {
  /*
    **Il gesto che toglie l'accesso era il gesto che lo riapriva.**

    ADR-0122 aveva scritto la guardia su `athletes.user_id`, che e proprio il
    campo che `unlinkAthleteAccount` e `revokeAthleteAccess` azzerano: da li in
    poi la stessa persona tornava a passare dal ramo del tutore, dove la
    coincidenza della casella vale come legame. Un terzo giro di revisione
    ostile lo ha misurato contro PostgreSQL — l'area atleta 403 e il cruscotto
    della famiglia 200, sulla stessa scheda appena scollegata.

    L'identita durevole la porta l'invito **accettato**, che ne la revoca ne lo
    scollegamento cancellano.
  */
  const semi = seed("athlete");
  semi.athlete[0].user_id = null; // lo scollegamento ha gia azzerato il legame
  fake = createFakePrisma(semi);
  setPrismaClientForTests(fake.client);

  assert.equal(
    await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA),
    false,
    "il cruscotto della famiglia: era questa la porta che lo scollegamento apriva",
  );
  assert.equal(
    await famiglia.getParentDashboardData(UTENTE_ATLETA, ATLETA),
    null,
    "e la rotta riceve `null`, che e il suo 403",
  );

  /*
    **Qui questo test diceva `true`, e la ragione scritta accanto era sbagliata**
    (ADR-0125).

    Diceva: «con il ramo diretto dichiarato la risposta resta si, ed e giusta,
    perche delle quattro superfici che lo dichiarano l'area atleta risolve
    prima il profilo da `athletes.user_id`». Vero per **una** delle quattro. La
    bacheca e l'RSVP non risolvono nessun profilo: chiedono direttamente qui, e
    con il legame scollegato ricevevano si. Misurato contro PostgreSQL — dopo
    «Scollega account», `GET .../board` **200** e `POST .../board` **200**.

    Il ragionamento generalizzava da un chiamante a quattro, ed e la stessa
    forma dell'errore che questa lane ha gia pagato tre volte: chiudere una
    porta e dedurne che il difetto e chiuso.

    L'ammissione al proprio ramo vuole il legame **vivo**. L'esclusione dal
    ramo del tutore resta durevole, ed e l'asserzione qui sopra.
  */
  assert.equal(
    await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA, COME_ATLETA),
    false,
    "scollegato il legame, nemmeno il proprio ramo lo fa entrare",
  );
  assert.equal(
    await accessi.findAthleteProfileForUser(UTENTE_ATLETA),
    null,
    "e la porta dell'area atleta resta chiusa, perche il legame non c'e piu",
  );
});

test("revocato l'accesso, una tessera residua non basta a rientrare", async () => {
  /*
    La condizione di raggiungibilita misurata dalla revisione: **una tessera
    qualunque** nel club tiene la persona fra i candidati di
    `getParentLinkedAthletes`. Chi non ne ha piu nessuna era gia fuori, e non
    per la guardia: per la clausola `OR` della ricerca.
  */
  const semi = seed(null);
  semi.athlete[0].user_id = null;
  semi.organizationUser.push({
    id: "ou-residua",
    organization_id: CLUB,
    user_id: UTENTE_ATLETA,
    role: "trainer",
  });
  fake = createFakePrisma(semi);
  setPrismaClientForTests(fake.client);

  assert.equal(
    await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA, COME_ATLETA),
    false,
  );
  assert.equal(
    await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA),
    false,
  );
});

test("ma un invito mai riscattato non toglie niente a nessuno", async () => {
  /*
    **Il controllo sul non fare troppo.**

    Si contano solo gli inviti **accettati**. Un invito mandato per errore
    all'indirizzo di un tutore, e mai riscattato, non deve chiudergli l'area
    della propria famiglia: nessuno e mai diventato quella scheda.
  */
  const semi = seed("athlete");
  semi.athleteAccountInvite = [
    {
      id: "inv-sbagliato",
      organization_id: CLUB,
      athlete_id: FIGLIO,
      user_id: TUTORE,
      email: "tutore@famiglia.it",
      token_hash: "b".repeat(64),
      status: "sent",
      accepted_at: null,
      revoked_at: null,
      expires_at: new Date(Date.now() + 864e5),
      sent_at: new Date(),
    },
  ];
  fake = createFakePrisma(semi);
  setPrismaClientForTests(fake.client);

  assert.equal(
    await famiglia.canParentAccessAthlete(TUTORE, FIGLIO),
    true,
    "il tutore entra: l'invito e partito, non e stato riscattato",
  );
});

test("la domanda sull'identita vive nel modulo che la possiede, non copiata", async () => {
  const { readFileSync } = await import("node:fs");
  const path = await import("node:path");
  const modulo = readFileSync(
    path.join(process.cwd(), "src", "lib", "server", "athlete-membership.ts"),
    "utf8",
  );
  assert.ok(
    modulo.includes("athleteCardsEverOwnedByUser"),
    "sta accanto a clubsWhereStillAthlete, che risponde all'altra meta della domanda",
  );
  assert.ok(
    modulo.includes("accepted_at"),
    "e conta gli inviti accettati, non quelli soltanto partiti",
  );

  const famigliaSrc = readFileSync(
    path.join(process.cwd(), "src", "lib", "server", "parent-dashboard.ts"),
    "utf8",
  );
  assert.ok(
    famigliaSrc.includes("athleteCardsEverOwnedByUser"),
    "e il lettore la chiama invece di rifarla",
  );
});

/* ==================================================================== *
 *  5. Un'identita, due cappelli (ADR-0124)
 * ==================================================================== */

/*
  **Il verso opposto dei tre round precedenti.**

  ADR-0122 e ADR-0123 hanno chiuso il ramo del tutore a chi e, o e stato,
  l'account di quella scheda. Un quarto round ha misurato cosa succede quando
  quella persona **e davvero il tutore**: il flusso che ADR-0122 descrive come
  normale — il minore invitato sulla casella di famiglia — non crea l'account
  del minore, perche `risolviUtenza` trova l'utenza che quell'indirizzo ha
  gia. Crea il secondo cappello dell'account del genitore, e il genitore
  spariva dal proprio cruscotto. Ne la revoca ne lo scollegamento glielo
  restituivano: l'invito accettato di ADR-0123 resta in archivio per sempre.

  La distinzione e `linkedUserId` — una decisione registrata — contro
  `guardians[].email`, che e una coincidenza di recapito.
*/

/** La stessa utenza e l'account della scheda **e** un tutore provato di essa. */
const dueCappelli = (tessera = "parent") => {
  const semi = seed(tessera);
  semi.athlete[0].data.guardians[0].linkedUserId = UTENTE_ATLETA;
  return semi;
};

test("il tutore PROVATO passa anche quando e l'account della scheda", async () => {
  fake = createFakePrisma(dueCappelli());
  setPrismaClientForTests(fake.client);

  assert.equal(
    await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA),
    true,
    "senza ADR-0124 il genitore perdeva il figlio dal proprio cruscotto",
  );
});

test("e continua a passare dopo la revoca, che azzera il legame", async () => {
  /*
    E il punto che fa piu male senza il fix: `revokeAthleteAccess` e
    `unlinkAthleteAccount` azzerano `athletes.user_id`, ma l'invito accettato
    resta, quindi `schedeProprie` continua a contenere la scheda. Il gesto che
    avrebbe dovuto rimediare non rimediava, e il figlio spariva per sempre.
  */
  const semi = dueCappelli();
  semi.athlete[0].user_id = null;
  fake = createFakePrisma(semi);
  setPrismaClientForTests(fake.client);

  assert.equal(
    await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA),
    true,
  );
});

test("ma la sola casella coincidente non basta: e il Critical di ADR-0122", async () => {
  /*
    **Il controllo che regge le tre decisioni precedenti.** Il seme base ha gia
    `guardians[].email` uguale all'indirizzo dell'utenza dell'atleta, e non ha
    `linkedUserId`. Se ADR-0124 avesse guardato `isGuardianLinkedToUser`
    invece di `isGuardianLinkedById`, questa riga tornerebbe `true` e il
    Critical sarebbe riaperto.
  */
  const semi = seed(null);
  semi.athlete[0].user_id = null;
  semi.organizationUser.push({
    id: "ou-residua",
    organization_id: CLUB,
    user_id: UTENTE_ATLETA,
    role: "trainer",
  });
  fake = createFakePrisma(semi);
  setPrismaClientForTests(fake.client);

  assert.equal(
    await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA),
    false,
    "una coincidenza di recapito non e una decisione di nessuno",
  );
});

test("e la distinzione e scritta come tale: `linkedUserId`, non la casella", async () => {
  const { readFileSync } = await import("node:fs");
  const path = await import("node:path");
  const sorgente = readFileSync(
    path.join(process.cwd(), "src", "lib", "server", "parent-dashboard.ts"),
    "utf8",
  );
  assert.ok(
    sorgente.includes("isGuardianLinkedById"),
    "esiste un predicato che guarda solo il legame deciso",
  );
  const corpo = sorgente.slice(
    sorgente.indexOf("const isGuardianLinkedById"),
    sorgente.indexOf("const isGuardianLinkedToUser"),
  );
  assert.ok(
    !corpo.includes("guardian.email"),
    "e non ricade sulla casella di contatto: e li che vive il Critical",
  );
});

/* ==================================================================== *
 *  6. La porta che non si apre piu (ADR-0124)
 * ==================================================================== */

test("l'invito sulla casella di un tutore della stessa scheda e respinto", async () => {
  fake = createFakePrisma(seed("athlete"));
  setPrismaClientForTests(fake.client);

  const scope = {
    userId: TUTORE,
    activeOrganizationId: CLUB,
    activeRole: "owner",
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

  await assert.rejects(
    () =>
      accessi.sendAthleteAccountInvite(scope, {
        /*
          La scheda di Nina porta un tutore legato per `linkedUserId`, e
          l'indirizzo qui sotto e quello di **quella** utenza: `risolviUtenza`
          la trova invece di crearne una, ed e la meta della guardia che
          guarda l'identita risolta e non la casella scritta.
        */
        athleteId: FIGLIO,
        email: "tutore@famiglia.it",
        acknowledgeMinor: true,
      }),
    (errore) => {
      /*
        La scheda di Nina ha un tutore legato per `linkedUserId`: invitare
        l'atleta su quell'identita farebbe nascere l'accesso sull'utenza del
        tutore. Il rifiuto **non** e un errore di autorizzazione — il ruolo puo
        compiere l'azione — quindi non porta «Accesso negato» e la rotta
        generica lo mappa su 400, come per ADR-0116.
      */
      assert.ok(
        /tutore/i.test(errore.message),
        `messaggio inatteso: ${errore.message}`,
      );
      assert.ok(
        !errore.message.includes("Accesso negato"),
        "un 403 direbbe che il ruolo non puo: e falso",
      );
      return true;
    },
  );
});

/* ==================================================================== *
 *  8. La terza porta (ADR-0125)
 * ==================================================================== */

/**
 * **ADR-0117 ha contato due lettori di `athletes.user_id`, ed erano tre.**
 *
 * Il round conclusivo di PP-04 ha misurato il terzo contro PostgreSQL, con il
 * gesto vero della segreteria — Gestione Accessi -> Revoca su una tessera con
 * l'alias `giocatrice`, cioe la forma di PP04-D9. Con **zero tessere** nel
 * club, `/api/v1/athlete-accounts/me` rispondeva 403, il cruscotto di famiglia
 * 403, e `GET /api/v1/auth/athlete-profile/<la stessa scheda>` **200**, con
 * allergie, note mediche, certificati interi e il codice fiscale del tutore.
 *
 * E il campo non porta sempre l'atleta: PP04-D6 registra la sua seconda
 * lettura storica, e ADR-0124 descrive il flusso — normale — in cui ci finisce
 * l'identita di un **genitore**. Cio che usciva non era il fascicolo di chi lo
 * leggeva: era quello di un altro.
 *
 * Riproduzione: `scripts/pp-04-round-conclusivo-probe.mjs`, R-82 e R-84.
 */
test("il fascicolo clinico per identificativo pone la stessa domanda", async () => {
  const { readFileSync } = await import("node:fs");
  const path = await import("node:path");

  const rotta = readFileSync(
    path.join(
      process.cwd(),
      "src",
      "app",
      "api",
      "v1",
      "auth",
      "athlete-profile",
      "[athleteId]",
      "route.ts",
    ),
    "utf8",
  );

  assert.ok(
    rotta.includes("clubsWhereStillAthlete"),
    "il terzo lettore deve chiamare il modulo che possiede la domanda",
  );

  /*
    E la deve chiamare **dentro** `directAthleteAccess`: importarla e non
    usarla dove decide sarebbe la forma peggiore, perche il controllo
    strutturale qui sopra resterebbe verde.
  */
  const posizione = rotta.indexOf("const directAthleteAccess");
  assert.ok(posizione >= 0);
  const decisione = rotta.slice(posizione, posizione + 400);
  assert.ok(
    decisione.includes("clubsWhereStillAthlete"),
    "la domanda va posta dove si decide, non altrove nel file",
  );
});

test("e i lettori di quel campo sono tre, non uno in piu", async () => {
  /*
    **Enumerare le porte e il difetto ricorrente di questo repository**, e la
    difesa non e enumerarle meglio: e far diventare rosso il momento in cui ne
    nasce una quarta. Chi confronta `athletes.user_id` con l'utenza della
    sessione sta decidendo un accesso, e deve chiedersi se la tessera vive
    ancora.
  */
  const { execFileSync } = await import("node:child_process");
  const { readFileSync } = await import("node:fs");

  const uscita = execFileSync(
    "git",
    ["grep", "-l", "-F", "user_id === session.db.user_id", "--", "src"],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  const trovati = uscita
    .split("\n")
    .map((riga) => riga.trim().replace(/\\/g, "/"))
    .filter(Boolean);

  assert.ok(trovati.length > 0, "il confronto esiste: la sonda lo ha misurato");

  for (const file of trovati) {
    const sorgente = readFileSync(file, "utf8");
    assert.ok(
      sorgente.includes("clubsWhereStillAthlete"),
      `${file} decide sul legame senza chiedere se la tessera vive ancora`,
    );
  }
});

test("la domanda risponde di no quando la tessera non e piu di atleta", async () => {
  const membership = await import("../../src/lib/server/athlete-membership.ts");

  /* Con la tessera di atleta: si, ed e cio che tiene aperto il caso legittimo. */
  assert.equal(
    (await membership.clubsWhereStillAthlete(UTENTE_ATLETA, [CLUB])).has(CLUB),
    true,
  );

  /*
    Con una tessera qualunque **che non e** di atleta: no. E il caso che il
    terzo lettore lasciava passare, ed e anche quello che distingue «non e piu
    nel club» da «e nel club con un altro cappello» — per il fascicolo clinico
    la risposta e la stessa, perche il ramo del legame non ha perimetro.
  */
  monta("parent");
  assert.equal(
    (await membership.clubsWhereStillAthlete(UTENTE_ATLETA, [CLUB])).has(CLUB),
    false,
  );

  /* Senza nessuna tessera: no. */
  monta(null);
  assert.equal(
    (await membership.clubsWhereStillAthlete(UTENTE_ATLETA, [CLUB])).has(CLUB),
    false,
  );

  /* E l'alias italiano resta un atleta: la guardia non fa troppo. */
  monta("giocatrice");
  assert.equal(
    (await membership.clubsWhereStillAthlete(UTENTE_ATLETA, [CLUB])).has(CLUB),
    true,
  );
});

/* ==================================================================== *
 *  9. Una casella, un atleta (ADR-0125)
 * ==================================================================== */

/**
 * **La guardia c'era, e arrivava sempre troppo presto.**
 *
 * `sendAthleteAccountInvite` dichiara di impedire che «due atleti finiscano
 * sulla stessa utenza», e lo chiede a `athletes.user_id` — che pero lo scrive
 * il **riscatto**. Fra due inviti quel campo e vuoto, e la sequenza che lo
 * svuota e la piu normale che una segreteria possa fare: due fratelli, una
 * casella di famiglia sola, i due inviti mandati prima che qualcuno clicchi.
 *
 * Misurato contro PostgreSQL (`scripts/pp-04-round-conclusivo-probe.mjs`,
 * R-96): entrambi gli inviti passavano, entrambi si riscattavano, due schede
 * portavano la stessa `user_id`, e quell'unica identita apriva la bacheca di
 * **tutte e due** — `GET /api/parent-dashboard/<X>/board` 200 e
 * `GET /api/parent-dashboard/<Z>/board` 200.
 */
test("un secondo invito sulla stessa casella e respinto alla partenza", async () => {
  const scope = {
    userId: TUTORE,
    activeOrganizationId: CLUB,
    activeRole: "owner",
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

  /*
    Nel seme, `aldo@atleti.it` e gia l'utenza collegata alla scheda di Aldo con
    un invito **accettato**. Si aggiunge un invito ancora **vivo** su quella
    stessa utenza, che e lo stato che il difetto produceva.
  */
  for (const riga of fake.rows("athlete")) {
    if (riga.id === ATLETA) riga.user_id = null;
  }
  fake.rows("athleteAccountInvite").splice(
    0,
    fake.rows("athleteAccountInvite").length,
    {
      id: "inv-vivo",
      organization_id: CLUB,
      athlete_id: ATLETA,
      user_id: UTENTE_ATLETA,
      email: "aldo@atleti.it",
      token_hash: "b".repeat(64),
      status: "sent",
      accepted_at: null,
      revoked_at: null,
      expires_at: new Date(Date.now() + 864e5),
      sent_at: new Date(),
    },
  );

  await assert.rejects(
    () =>
      accessi.sendAthleteAccountInvite(scope, {
        athleteId: FIGLIO,
        email: "aldo@atleti.it",
        acknowledgeMinor: true,
      }),
    (errore) => {
      assert.ok(
        /invito in corso sulla scheda di un altro atleta/i.test(errore.message),
        `messaggio inatteso: ${errore.message}`,
      );
      /*
        Non e un errore di autorizzazione: il ruolo puo invitare, e l'indirizzo
        a essere sbagliato. La rotta generica lo mappa su 400.
      */
      assert.ok(!errore.message.includes("Accesso negato"));
      return true;
    },
  );
});

test("e il riscatto rifiuta comunque, perche e lui che scrive", async () => {
  /*
    **La decisione la prende chi scrive.** La guardia sull'invito puo essere
    corsa, e gli archivi gia esistenti possono portare due inviti vivi nati
    prima di questo fix: l'invariante regge solo se la pone anche il punto che
    scrive `athletes.user_id`, dentro la transazione che lo scrive.
  */
  const { createHash } = await import("node:crypto");
  const token = "token-in-chiaro-del-collaudo";

  fake.rows("athleteAccountInvite").splice(
    0,
    fake.rows("athleteAccountInvite").length,
    {
      id: "inv-secondo",
      organization_id: CLUB,
      athlete_id: FIGLIO,
      user_id: UTENTE_ATLETA,
      email: "aldo@atleti.it",
      token_hash: createHash("sha256").update(token).digest("hex"),
      status: "sent",
      accepted_at: null,
      revoked_at: null,
      expires_at: new Date(Date.now() + 864e5),
      sent_at: new Date(),
    },
  );

  /* Aldo e gia l'account della propria scheda: e lo stato del seme. */
  assert.equal(
    fake.rows("athlete").find((riga) => riga.id === ATLETA)?.user_id,
    UTENTE_ATLETA,
  );

  await assert.rejects(
    () => accessi.acceptAthleteAccountInvite(token),
    (errore) => {
      assert.ok(
        /accesso della scheda di un altro atleta/i.test(errore.message),
        `messaggio inatteso: ${errore.message}`,
      );
      return true;
    },
  );

  /* E la seconda scheda non ha preso nessun legame. */
  assert.equal(
    fake.rows("athlete").find((riga) => riga.id === FIGLIO)?.user_id ?? null,
    null,
  );
});

/* ==================================================================== *
 *  10. Esclusione durevole, ammissione viva (ADR-0125)
 * ==================================================================== */

/**
 * **La stessa condizione faceva due lavori opposti.**
 *
 * ADR-0123 ha reso `eLaPersonaStessa` **durevole** perche serve come
 * esclusione: senza durata, revoca e scollegamento riaprivano il ramo del
 * tutore. Ma quella condizione e anche l'**ammissione** alle superfici proprie
 * dell'atleta — bacheca e RSVP, cioe `allowSelfAthleteLink: true` — e li vuole
 * il legame **vivo**, perche e esattamente cio che lo scollegamento toglie.
 *
 * Misurato contro PostgreSQL (`scripts/pp-04-round-conclusivo-probe.mjs`,
 * R-98/R-99): dopo «Scollega account» l'area atleta rispondeva 403 e la
 * bacheca **200**, con la scrittura «l'ho letto» inclusa. E il seguito e il
 * caso che pesa: scollegata la scheda e invitata **un'altra persona** — che e
 * il motivo per cui lo scollegamento esiste — la vecchia utenza continuava a
 * leggere la bacheca di una scheda che non era piu sua, e **nessun gesto sul
 * pannello la chiudeva fuori**.
 */
test("scollegato l'account, la porta dell'atleta si chiude con quella d'ingresso", async () => {
  /* In regola: le due porte concordano sul si. */
  assert.equal(
    await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA, COME_ATLETA),
    true,
  );

  /*
    Lo scollegamento azzera `athletes.user_id` e **lascia la tessera**: e la
    sua ragione d'essere, distinta dalla revoca. L'invito accettato resta, per
    costruzione (ADR-0123).
  */
  for (const riga of fake.rows("athlete")) {
    if (riga.id === ATLETA) riga.user_id = null;
  }

  assert.equal(
    await accessi.findAthleteProfileForUser(UTENTE_ATLETA),
    null,
    "la porta d'ingresso si chiude",
  );
  assert.equal(
    await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA, COME_ATLETA),
    false,
    "e quella dell'atleta con lei: era questa a restare aperta",
  );
});

test("e la scheda ceduta a un altro non resta leggibile a chi l'aveva", async () => {
  const NUOVO = "77777777-7c00-4000-8000-000000000abc";
  fake.rows("user").push({
    id: NUOVO,
    email: "nuovo@atleti.it",
    email_verified_at: new Date(),
  });
  fake.rows("organizationUser").push({
    id: "ou-nuovo",
    organization_id: CLUB,
    user_id: NUOVO,
    role: "athlete",
  });

  /* Il club scollega e affida la scheda a un'altra persona. */
  for (const riga of fake.rows("athlete")) {
    if (riga.id === ATLETA) riga.user_id = NUOVO;
  }
  fake.rows("athleteAccountInvite").push({
    id: "inv-nuovo",
    organization_id: CLUB,
    athlete_id: ATLETA,
    user_id: NUOVO,
    email: "nuovo@atleti.it",
    token_hash: "c".repeat(64),
    status: "accepted",
    accepted_at: new Date(),
    revoked_at: null,
    expires_at: new Date(Date.now() + 864e5),
    sent_at: new Date(),
  });

  assert.equal(
    await famiglia.canParentAccessAthlete(NUOVO, ATLETA, COME_ATLETA),
    true,
    "il nuovo titolare entra",
  );

  /*
    E la vecchia utenza no — malgrado conservi la propria tessera `athlete`,
    che lo scollegamento per disegno non toglie, e malgrado l'invito accettato
    che ADR-0123 usa come identita durevole. Quella durata serve a **tenerla
    fuori** dal ramo del tutore, non a farla entrare dal proprio.
  */
  assert.equal(
    await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA, COME_ATLETA),
    false,
  );

  /*
    E non rientra nemmeno dal ramo del tutore, dove la casella coincidente
    varrebbe come legame: e il Critical di ADR-0122, che l'esclusione durevole
    continua a reggere.
  */
  assert.equal(
    await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA),
    false,
  );
});
