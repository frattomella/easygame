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
    Con il ramo diretto **dichiarato** la risposta resta si, ed e giusta: la
    tessera di atleta e viva, quindi quella persona e ancora un atleta di quel
    club. Cio che e cambiato e da **quale** ramo passa — il proprio, non quello
    del tutore — e il proprio ramo non consegna il payload della famiglia:
    delle quattro superfici che lo dichiarano, l'area atleta risolve prima il
    profilo da `athletes.user_id` e con il legame scollegato risponde 403.
  */
  assert.equal(
    await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA, COME_ATLETA),
    true,
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
