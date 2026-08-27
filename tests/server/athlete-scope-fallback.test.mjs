import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * `/athletes/<id>` senza `?clubId=` (RC Fix 2, punto 17).
 *
 * **Il difetto.** La scheda atleta leggeva il club **solo** dal parametro
 * nell'URL. Senza quel parametro rispondeva «ID del club mancante» e non
 * caricava niente, anche con un club attivo in sessione: bastava un link
 * copiato, un preferito salvato prima che il parametro esistesse, o un
 * ritorno indietro dal browser.
 *
 * **Perche il difetto era solo del client.** La rotta non ha mai letto
 * `clubId` dalla query: risolve lo scope dalla sessione
 * (`resolveOrganizationScopeForUser`) e filtra da li. Il parametro nell'URL
 * serve alle pagine per sapere *cosa mostrare*, non al server per decidere
 * *cosa si puo vedere* — e questa distinzione e cio che rende sicuro il
 * ripiego sul club attivo.
 *
 * **Cosa questi test proteggono.** Che la lettura di un atleta continui a
 * funzionare senza alcun `organization_id` in ingresso, e che aggiungerne uno
 * possa solo **restringere**: un club altrui non apre niente. Se un giorno
 * qualcuno facesse dipendere la lettura da un identificativo che arriva dal
 * client, il secondo test cadrebbe.
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-00000000aa01";
const CLUB_B = "bbbbbbbb-0000-4000-8000-00000000bb02";
const ATHLETE_A = "11111111-0000-4000-8000-00000000aa11";
const ATHLETE_B = "22222222-0000-4000-8000-00000000bb22";

/** Un utente con un solo club attivo, come chi apre un link senza parametri. */
const scopeA = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB_A,
  allowedOrganizationIds: [CLUB_A],
});

let resources;
let setPrismaClientForTests;
let fake;

const seed = () => ({
  athlete: [
    {
      id: ATHLETE_A,
      organization_id: CLUB_A,
      first_name: "Anna",
      last_name: "Rossi",
    },
    {
      id: ATHLETE_B,
      organization_id: CLUB_B,
      first_name: "Bruno",
      last_name: "Verdi",
    },
  ],
  club: [
    { id: CLUB_A, slug: "club-a", name: "Club A" },
    { id: CLUB_B, slug: "club-b", name: "Club B" },
  ],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  resources = await import("../../src/lib/server/resources.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

test("un atleta si legge senza che il client dica a che club appartiene", async () => {
  const athlete = await resources.getResourceById(
    "simplified_athletes",
    ATHLETE_A,
    scopeA(),
  );

  assert.ok(athlete, "la scheda deve aprirsi con il solo club attivo in sessione");
  assert.equal(athlete.id, ATHLETE_A);
});

test("il club attivo non apre l'atleta di un altro club", async () => {
  await assert.rejects(
    resources.getResourceById("simplified_athletes", ATHLETE_B, scopeA()),
    (error) => {
      assert.match(String(error.message), /Accesso negato|non trovata/);
      return true;
    },
    "il ripiego sul club attivo non deve diventare una porta su tutti i club",
  );
});

test("senza alcun club attivo non si legge niente", async () => {
  await assert.rejects(
    resources.getResourceById("simplified_athletes", ATHLETE_A, {
      userId: "user-x",
      activeOrganizationId: null,
      allowedOrganizationIds: [],
    }),
    (error) => {
      assert.match(
        String(error.message),
        /Accesso negato|Nessun club attivo|non trovata/,
      );
      return true;
    },
  );
});

/**
 * La rotta non legge il club dal client, e non deve iniziare a farlo.
 *
 * E la meta che nessun test a runtime puo cogliere: si puo verificare che
 * oggi lo scope venga dalla sessione, non che domani qualcuno non aggiunga
 * `searchParams.get("clubId")` accanto.
 */
test("la rotta di dettaglio risolve lo scope dalla sessione, non dalla query", () => {
  const route = readFileSync(
    path.join(
      process.cwd(),
      "src",
      "app",
      "api",
      "v1",
      "[resource]",
      "[id]",
      "route.ts",
    ),
    "utf8",
  );

  assert.match(
    route,
    /resolveOrganizationScopeForUser\(/,
    "lo scope deve venire dalla sessione",
  );
  assert.equal(
    /searchParams.*clubId|get\("clubId"\)/.test(route),
    false,
    "nessun identificativo di club puo arrivare dalla query su questa rotta",
  );
});

/**
 * E la scheda, dal canto suo, non deve tornare a pretendere il parametro.
 */
test("la scheda atleta non pretende piu il clubId nell'URL", () => {
  const page = readFileSync(
    path.join(process.cwd(), "src", "app", "athletes", "[id]", "page.tsx"),
    "utf8",
  );

  assert.match(
    page,
    /resolveActiveClubId\(/,
    "il club si risolve con la funzione condivisa, non con una copia locale",
  );
  assert.equal(
    /ID del club mancante/.test(page),
    false,
    "l'assenza del parametro non deve piu impedire di aprire la scheda",
  );
});
