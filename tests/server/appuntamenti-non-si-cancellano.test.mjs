import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **D-1 — le richieste di appuntamento delle famiglie si cancellavano da sole.**
 *
 * Il difetto non aveva un colpevole visibile, perche i due scrittori erano
 * entrambi corretti presi da soli:
 *
 * 1. `POST /api/parent-dashboard/:id/appointments` scrive la richiesta della
 *    famiglia **solo** in `clubs.appointments`, con un `prisma.club.update`
 *    diretto. Non tocca `club_resource_items`;
 * 2. il CRUD generico su `/api/v1/appointments` scrive invece
 *    `club_resource_items`, e poi chiama `syncClubAggregateField`, che
 *    **rigenera `clubs.appointments` da zero** a partire da quelle righe.
 *
 * Conseguenza: la prima volta che la segreteria operava un appuntamento dal
 * registro generico, tutte le richieste delle famiglie sparivano. Nessun
 * errore, nessun audit, nessuna traccia.
 *
 * Questo file esiste perche fallisca se la porta si riapre.
 */

const CLUB = "aaaaaaaa-5000-4000-8000-00000000000a";
const SEGRETARIA = "11111111-5000-4000-8000-000000000aaa";

const scopeSegreteria = () => ({
  userId: SEGRETARIA,
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

/** La richiesta di una famiglia, come la scrive davvero la rotta del genitore. */
const richiestaDellaFamiglia = {
  id: "parent-appointment-1700000000000",
  title: "Colloquio con la segreteria",
  reason: "Colloquio con la segreteria",
  date: "2026-09-20",
  time: "17:30",
  status: "pending",
  source: "parent_dashboard",
  organization_id: CLUB,
  athlete_id: "atleta-1",
  athlete_name: "Marco Rossi",
  person: "Anna Rossi",
  requested_by_user_id: "22222222-5000-4000-8000-000000000bbb",
};

const seed = () => ({
  user: [{ id: SEGRETARIA, email: "segreteria@club.it", role: "user" }],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      /*
        Nel database reale questa e la sola traccia della richiesta: nessuna
        riga corrispondente in `club_resource_items`.
      */
      appointments: [richiestaDellaFamiglia],
    },
  ],
  clubResourceItem: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const negato = /Accesso negato/;

test("gli appuntamenti non si scrivono dal registro generico", () => {
  assert.equal(
    risorse.isClosedResource("appointments"),
    true,
    "la rigenerazione dell'aggregato cancellerebbe le richieste delle famiglie",
  );
});

test("creare un appuntamento dal registro generico e respinto", async () => {
  await assert.rejects(
    () =>
      risorse.createResource(
        "appointments",
        {
          organization_id: CLUB,
          title: "Appuntamento della segreteria",
          date: "2026-09-21",
        },
        scopeSegreteria(),
      ),
    negato,
  );
});

test("la richiesta della famiglia sopravvive a un'operazione della segreteria", async () => {
  /*
    La segreteria salva **altre** collezioni del club tutti i giorni. Nessuna
    di quelle operazioni deve toccare `clubs.appointments`: e la prova che la
    chiusura non ha solo spostato il difetto su un'altra collezione.
  */
  await risorse.updateResource(
    "clubs",
    CLUB,
    { categories: [{ id: "u10", name: "Under 10" }] },
    scopeSegreteria(),
  );

  const club = fake.rows("club").find((riga) => riga.id === CLUB);
  const appuntamenti = Array.isArray(club.appointments) ? club.appointments : [];

  assert.equal(
    appuntamenti.length,
    1,
    "la richiesta della famiglia e ancora li",
  );
  assert.equal(appuntamenti[0].id, richiestaDellaFamiglia.id);
  assert.equal(appuntamenti[0].status, "pending");
});

test("la segreteria salva gli appuntamenti dal verso sicuro, e non ne perde", async () => {
  /*
    `PATCH /api/v1/clubs` rilegge l'array intero e poi lo riscrive: e il verso
    in cui la sincronizzazione **parte** dal campo JSON invece di rigenerarlo.
    La segreteria che conferma la richiesta di una famiglia passa di qui.
  */
  const confermata = { ...richiestaDellaFamiglia, status: "confirmed" };
  await risorse.updateResource(
    "clubs",
    CLUB,
    { appointments: [confermata] },
    scopeSegreteria(),
  );

  const club = fake.rows("club").find((riga) => riga.id === CLUB);
  assert.equal(club.appointments.length, 1);
  assert.equal(club.appointments[0].status, "confirmed");
});
