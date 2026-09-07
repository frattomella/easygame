import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **`club_resource_items` e la seconda porta sulle stesse righe** (PP-03 §15.3).
 *
 * Le note di segreteria non hanno una tabella propria: sono righe di
 * `club_resource_items`, e il registro le serve in due modi — per **nome**
 * (`/api/v1/secretariat_notes`) e per **contenitore**
 * (`/api/v1/club_resource_items`). §1 aveva chiuso il primo mettendo
 * `secretariat_notes` fra le risorse che il perimetro dell'allenatore filtra.
 * Il secondo arrivava al filtro col nome del contenitore, che in
 * quell'insieme non c'e.
 *
 * Misurato dal quinto round, con tre note nel club:
 *
 *     GET /secretariat_notes                                  1 riga
 *     GET /club_resource_items?resource_type=secretariat_notes 3 righe
 *     GET /club_resource_items/<id della nota interna>         200
 *     meta.total sulla seconda porta                           3
 *
 * Uscivano il promemoria interno della direzione sulla morosita di una famiglia
 * e la nota nominale su un procedimento disciplinare verso un collega.
 *
 * E la **quarta** volta che `resources.ts` sbaglia nella stessa direzione — la
 * correzione va nell'elenco, la porta accanto resta aperta — ed e la porta che
 * il file aveva **gia nominato**: `serializeRecord` ci faceva passare la
 * proiezione, e non il perimetro.
 *
 * La seconda meta di questo file misura la trappola della correzione: la riga
 * grezza tiene i propri campi dentro `payload`, e il vaglio e scritto sulla
 * forma piatta. Filtrare la forma sbagliata non fa uscire niente — fa sparire
 * anche la nota legittima.
 */

const CLUB = "bbbbbbbb-4000-4000-8000-00000000000b";
const ALTRO_CLUB = "cccccccc-4000-4000-8000-00000000000c";
const ALLENATORE = "33333333-4000-4000-8000-000000000ccc";
const PROPRIETARIO = "44444444-4000-4000-8000-000000000ddd";

const NOTA_PER_TUTTI = "nota-per-tutti-gli-allenatori";
const NOTA_INTERNA = "nota-interna-della-direzione";
const NOTA_PER_UN_ALTRO = "nota-per-un-altro-allenatore";

const SEGRETO_INTERNO = "MOROSITA-FAMIGLIA-TRE-MESI";
const SEGRETO_ALTRUI = "PROCEDIMENTO-DISCIPLINARE-COLLEGA";

const scopeAllenatore = () => ({
  userId: ALLENATORE,
  activeOrganizationId: CLUB,
  activeRole: "trainer",
  allowedOrganizationIds: [CLUB],
});

const scopeProprietario = () => ({
  userId: PROPRIETARIO,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

let risorse;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  risorse = await import("../../src/lib/server/resources.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

/*
  Le righe stanno in archivio **come ci stanno davvero**: i campi della nota
  dentro `payload`. Semplificarli qui vorrebbe dire misurare una forma che il
  database non produce, ed e esattamente l'errore che la correzione ha rischiato.
*/
const seed = () => ({
  user: [
    { id: ALLENATORE, email: "mister@club.it", role: "user" },
    { id: PROPRIETARIO, email: "presidente@club.it", role: "user" },
  ],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      categories: [{ id: "under-15", name: "Under 15" }],
      trainers: [
        {
          id: "trainer-1",
          name: "Mister",
          email: "mister@club.it",
          linkedUserId: ALLENATORE,
          categories: ["under-15"],
        },
        {
          id: "trainer-2",
          name: "Collega",
          email: "collega@club.it",
          categories: ["under-15"],
        },
      ],
    },
    { id: ALTRO_CLUB, slug: "altro", name: "Altro club" },
  ],
  clubResourceItem: [
    {
      id: NOTA_PER_TUTTI,
      organization_id: CLUB,
      resource_type: "secretariat_notes",
      name: "Chiusura palestra",
      status: "open",
      payload: {
        targetType: "all_trainers",
        content: "La palestra resta chiusa lunedi",
      },
    },
    {
      id: NOTA_INTERNA,
      organization_id: CLUB,
      resource_type: "secretariat_notes",
      name: "Promemoria interno",
      status: "open",
      payload: {
        targetType: "club_dashboard",
        content: SEGRETO_INTERNO,
      },
    },
    {
      id: NOTA_PER_UN_ALTRO,
      organization_id: CLUB,
      resource_type: "secretariat_notes",
      name: "Colloquio",
      status: "open",
      payload: {
        targetType: "trainer",
        targetId: "trainer-2",
        content: SEGRETO_ALTRUI,
      },
    },
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const contenuti = (records) =>
  records.map((riga) => String(riga?.content ?? riga?.payload?.content ?? ""));

/* ------------------------------------------------- la porta per nome, chiusa */

test("PP-03 §15.3 · regressione: la porta per nome resta chiusa", async () => {
  const { records } = await risorse.listResourcePage(
    "secretariat_notes",
    new URLSearchParams({ organization_id: CLUB }),
    scopeAllenatore(),
  );

  const testo = JSON.stringify(records);
  assert.ok(!testo.includes(SEGRETO_INTERNO));
  assert.ok(!testo.includes(SEGRETO_ALTRUI));
  assert.equal(records.length, 1, "la nota a tutti gli allenatori resta");
});

/* ------------------------------------------- la porta per contenitore, ora */

test("PP-03 §15.3 · il contenitore non e una porta di servizio sulle stesse righe", async () => {
  const { records } = await risorse.listResourcePage(
    "club_resource_items",
    new URLSearchParams({
      organization_id: CLUB,
      resource_type: "secretariat_notes",
    }),
    scopeAllenatore(),
  );

  const testo = JSON.stringify(records);
  assert.ok(
    !testo.includes(SEGRETO_INTERNO),
    "il promemoria interno della direzione usciva dal contenitore",
  );
  assert.ok(
    !testo.includes(SEGRETO_ALTRUI),
    "la nota indirizzata a un collega usciva dal contenitore",
  );
});

test("PP-03 §15.3 · e non lo e nemmeno senza `resource_type`", async () => {
  const { records } = await risorse.listResourcePage(
    "club_resource_items",
    new URLSearchParams({ organization_id: CLUB }),
    scopeAllenatore(),
  );

  const testo = JSON.stringify(records);
  assert.ok(!testo.includes(SEGRETO_INTERNO));
  assert.ok(!testo.includes(SEGRETO_ALTRUI));
});

test("PP-03 §15.3 · la riga per identificativo, dal contenitore", async () => {
  await assert.rejects(
    () =>
      risorse.getResourceById(
        "club_resource_items",
        NOTA_INTERNA,
        scopeAllenatore(),
      ),
    /Accesso negato/,
    "un filtro di elenco si aggira chiedendo la riga per identificativo",
  );
});

/* ------------------------------------ il verso opposto, che e meta del lavoro */

test("PP-03 §15.3 · la nota legittima esce ancora, dalle due porte", async () => {
  /*
    La trappola della correzione, e la ragione per cui questa prova esiste. La
    riga grezza tiene i propri campi dentro `payload`, e `isReminderVisibleToTrainer`
    e scritta sulla forma **piatta**, quella che esce dalla rotta. Filtrare la
    forma sbagliata nega tutto: non un dato che esce, una nota legittima che
    sparisce — e una prova che guardasse solo i segreti direbbe «chiuso».
  */
  const perNome = await risorse.listResourcePage(
    "secretariat_notes",
    new URLSearchParams({ organization_id: CLUB }),
    scopeAllenatore(),
  );
  const perContenitore = await risorse.listResourcePage(
    "club_resource_items",
    new URLSearchParams({
      organization_id: CLUB,
      resource_type: "secretariat_notes",
    }),
    scopeAllenatore(),
  );

  assert.ok(
    contenuti(perNome.records).some((testo) => testo.includes("palestra")),
    "la nota a tutti gli allenatori deve arrivare per nome",
  );
  assert.ok(
    contenuti(perContenitore.records).some((testo) => testo.includes("palestra")),
    "e deve arrivare anche dal contenitore: le due porte servono le stesse righe",
  );
});

test("PP-03 §15.3 · alla direzione il contenitore continua a portare tutto", async () => {
  const { records } = await risorse.listResourcePage(
    "club_resource_items",
    new URLSearchParams({
      organization_id: CLUB,
      resource_type: "secretariat_notes",
    }),
    scopeProprietario(),
  );

  const testo = JSON.stringify(records);
  assert.ok(
    testo.includes(SEGRETO_INTERNO),
    "il promemoria interno e scritto dalla direzione per la direzione",
  );
  assert.equal(records.length, 3);
});
