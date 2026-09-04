import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **La porta di servizio dell'area atleta** (PP-04, ADR-0117 e ADR-0118).
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
      data: {},
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
});

const monta = (tessera) => {
  fake = createFakePrisma(seed(tessera));
  setPrismaClientForTests(fake.client);
};

beforeEach(() => monta("athlete"));

/* ==================================================================== *
 *  1. Il ramo diretto pretende una tessera di atleta viva
 * ==================================================================== */

test("con la tessera di atleta il legame diretto vale, e le due porte concordano", async () => {
  assert.equal(
    await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA),
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
    await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA),
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
      await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA),
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
      await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA),
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

test("il valore predefinito resta permissivo: l'area atleta legge da questo dominio", async () => {
  /*
    `readAthleteAreaOverview` chiama `getParentDashboardData` e poi ne proietta
    l'elenco chiuso. Se il predefinito fosse restrittivo, l'area atleta si
    spegnerebbe: la chiusura e delle **rotte** del cruscotto, non del dominio.
  */
  assert.equal(
    await famiglia.canParentAccessAthlete(UTENTE_ATLETA, ATLETA),
    true,
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
