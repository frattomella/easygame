import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Le date di nascita impossibili, sul confine dell'API (RC FIX 3).
 *
 * **Il difetto che questi test chiudono.** L'anteprima dell'import rifiutava
 * gia il 31 febbraio, il 29 febbraio di un anno non bisestile e una nascita
 * nel futuro. La stessa scheda salvata dalla pagina Atleti — o da un modulo di
 * iscrizione compilato da una famiglia, che finisce nella stessa rotta — non
 * passava di li: arrivava a `createResource`, che si limitava a
 * `new Date(valore)`.
 *
 * E qui la contro-intuizione che rendeva il difetto invisibile: in JavaScript
 * `new Date("2026-02-31")` **non** e una data invalida, e il 3 marzo 2026. Il
 * record veniva accettato con una data diversa da quella scritta, senza un
 * errore da nessuna parte. Il test che segna il confine e il primo: non basta
 * che la scrittura fallisca, deve fallire **invece** di salvare un altro
 * giorno.
 *
 * Questi test esercitano le funzioni vere di `src/lib/server/resources.ts` con
 * un doppio del client Prisma: e il percorso che usa l'applicazione, non una
 * riscrittura della regola.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ATLETA = "11111111-0000-4000-8000-000000000001";
const ATLETA_LEGACY = "22222222-0000-4000-8000-000000000002";

const scope = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

let resources;
let setPrismaClientForTests;
let fake;

const seed = () => ({
  athlete: [
    {
      id: ATLETA,
      organization_id: CLUB,
      first_name: "Anna",
      last_name: "Rossi",
      birth_date: new Date("2012-04-18T00:00:00.000Z"),
      data: {},
    },
    /*
      Una scheda entrata prima di questo controllo, con una nascita nel
      futuro. Serve a provare che la regola nuova non la rende immodificabile.
    */
    {
      id: ATLETA_LEGACY,
      organization_id: CLUB,
      first_name: "Bruno",
      last_name: "Verdi",
      birth_date: new Date("2030-01-01T00:00:00.000Z"),
      data: {},
    },
  ],
  club: [{ id: CLUB, slug: "club-a", name: "Club A" }],
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

const creaAtleta = (birthDate) =>
  resources.createResource(
    "athletes",
    {
      organization_id: CLUB,
      first_name: "Carla",
      last_name: "Bianchi",
      birth_date: birthDate,
      status: "active",
    },
    "create",
    scope(),
  );

const rifiuta = async (birthDate, atteso) => {
  await assert.rejects(
    creaAtleta(birthDate),
    (error) => {
      assert.match(String(error.message), atteso, `"${birthDate}": messaggio inatteso "${error.message}"`);
      return true;
    },
    `"${birthDate}": doveva essere rifiutata`,
  );

  assert.equal(
    fake.calls.filter(
      (call) => call.delegate === "athlete" && call.method === "create",
    ).length,
    0,
    `"${birthDate}": non deve arrivare nessuna scrittura al database`,
  );
};

/* -------------------------------------------- giorni che non esistono */

test("il 31 febbraio e rifiutato, non spostato al 3 marzo", async () => {
  await rifiuta("2026-02-31", /data di nascita inesistente/i);
});

test("il 31 aprile e rifiutato", async () => {
  await rifiuta("2026-04-31", /data di nascita inesistente/i);
});

test("il 29 febbraio di un anno non bisestile e rifiutato", async () => {
  await rifiuta("2025-02-29", /data di nascita inesistente/i);
});

test("il 29 febbraio di un anno bisestile e accettato", async () => {
  const created = await creaAtleta("2024-02-29");
  assert.equal(
    new Date(created.birth_date).toISOString().slice(0, 10),
    "2024-02-29",
  );
});

test("lo stesso giorno scritto all'italiana e rifiutato allo stesso modo", async () => {
  await rifiuta("31/02/2026", /data di nascita inesistente/i);
});

/* ------------------------------------------------ date fuori dal possibile */

test("una data di nascita nel futuro e rifiutata", async () => {
  await rifiuta("2099-05-01", /data di nascita nel futuro/i);
});

test("una data palesemente fuori range e rifiutata", async () => {
  await rifiuta("1500-01-01", /data di nascita non plausibile/i);
});

test("un testo che non e una data e rifiutato", async () => {
  await rifiuta("non una data", /data di nascita non riconosciuta/i);
});

/* ------------------------------------------------------ cosa deve passare */

test("una data valida viene salvata esattamente com'e stata scritta", async () => {
  const created = await creaAtleta("2012-03-12");

  assert.equal(
    new Date(created.birth_date).toISOString().slice(0, 10),
    "2012-03-12",
    "il giorno salvato deve essere quello scritto",
  );
});

test("una data con l'ora attaccata resta lo stesso giorno", async () => {
  const created = await creaAtleta("2012-03-12T00:00:00.000Z");

  assert.equal(
    new Date(created.birth_date).toISOString().slice(0, 10),
    "2012-03-12",
  );
});

test("una scheda senza data di nascita si crea come prima", async () => {
  const created = await resources.createResource(
    "athletes",
    {
      organization_id: CLUB,
      first_name: "Dora",
      last_name: "Neri",
      status: "active",
    },
    "create",
    scope(),
  );

  assert.ok(created?.id);
});

/* ------------------------------------------------------- aggiornamento */

test("l'aggiornamento rifiuta una data impossibile come la creazione", async () => {
  await assert.rejects(
    resources.updateResource(
      "athletes",
      ATLETA,
      { birth_date: "2026-02-31" },
      scope(),
    ),
    /data di nascita inesistente/i,
  );
});

test("una data valida si aggiorna", async () => {
  const updated = await resources.updateResource(
    "athletes",
    ATLETA,
    { birth_date: "2011-12-01" },
    scope(),
  );

  assert.equal(
    new Date(updated.birth_date).toISOString().slice(0, 10),
    "2011-12-01",
  );
});

test("una scheda gia in archivio con una data impossibile resta correggibile", async () => {
  /*
    Bruno ha una nascita nel 2030, entrata prima del controllo. Salvare il suo
    cognome rimanda indietro la stessa data: se la regola nuova la rifiutasse,
    l'unico effetto sarebbe rendere quella scheda immodificabile — e chi ha
    piu bisogno di correggerla non potrebbe.
  */
  const updated = await resources.updateResource(
    "athletes",
    ATLETA_LEGACY,
    { last_name: "Verdi Rossi", birth_date: "2030-01-01" },
    scope(),
  );

  assert.equal(updated.last_name, "Verdi Rossi");
});

test("ma la stessa scheda non puo passare a una data ancora peggiore", async () => {
  await assert.rejects(
    resources.updateResource(
      "athletes",
      ATLETA_LEGACY,
      { birth_date: "2031-02-31" },
      scope(),
    ),
    /data di nascita inesistente/i,
  );
});
