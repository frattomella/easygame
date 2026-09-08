import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **N2 — la guardia sull'ente vive sul server, non nella tendina.**
 *
 * La scheda offriva le federazioni configurate dal club, ma la difesa finiva
 * li: `athletes.data.registrations[]` si scrive dalla rotta generica, e quella
 * la domanda «questo ente e uno dei tuoi?» non la poneva. Una richiesta
 * costruita a mano — o la stessa scheda con lo stato sbagliato — poteva legare
 * un atleta a un ente di un altro club, o a uno inventato.
 *
 * Una difesa che vive solo nel browser e un suggerimento.
 */

const CLUB = "aaaaaaaa-f200-4000-8000-00000000000a";
const ALTRO_CLUB = "aaaaaaaa-f200-4000-8000-00000000000b";
const SEGRETERIA = "11111111-f200-4000-8000-00000000000a";
const ATLETA = "bbbbbbbb-f200-4000-8000-00000000000a";

let risorse;
let setPrismaClientForTests;
let fake;

const scope = (organizationId = CLUB) => ({
  userId: SEGRETERIA,
  activeOrganizationId: organizationId,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB, ALTRO_CLUB],
  accessScopes: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  risorse = await import("../../src/lib/server/resources.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const seed = () => ({
  user: [{ id: SEGRETERIA, email: "segreteria@club.it" }],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      categories: [],
      settings: {
        federations: [
          { id: "fed-1", name: "FIP", registrationNumber: "12345" },
          { id: "fed-2", name: "CSEN" },
        ],
      },
    },
    {
      id: ALTRO_CLUB,
      slug: "altro",
      name: "Altro",
      categories: [],
      settings: {
        federations: [{ id: "fed-altrove", name: "FIGC" }],
      },
    },
  ],
  athlete: [
    {
      id: ATLETA,
      organization_id: CLUB,
      first_name: "Sara",
      last_name: "Bianchi",
      status: "active",
      data: {},
    },
  ],
  auditLog: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const tesseramento = (overrides = {}) => ({
  id: "reg-1",
  federationId: "fed-1",
  federation: "FIP",
  number: "",
  status: "In corso",
  issueDate: "2026-09-01",
  expiryDate: "2027-06-30",
  notes: "",
  fileName: "",
  fileUrl: "",
  ...overrides,
});

/* ------------------------------------------------------------------ */
/* Cio che passa                                                       */
/* ------------------------------------------------------------------ */

test("un ente del club passa", async () => {
  const aggiornato = await risorse.updateResource(
    "athletes",
    ATLETA,
    { data: { registrations: [tesseramento()] } },
    scope(),
  );

  assert.equal(aggiornato.data.registrations.length, 1);
  assert.equal(aggiornato.data.registrations[0].federationId, "fed-1");
});

test("un tesseramento storico senza identificativo passa", async () => {
  /*
    E il dato scritto prima che l'identificativo esistesse. Rifiutarlo
    impedirebbe di salvare la scheda di ogni atleta gia tesserato finche
    qualcuno non bonifica a mano — cioe romperebbe il pilota per chiudere una
    porta che quel dato non apre.
  */
  const aggiornato = await risorse.updateResource(
    "athletes",
    ATLETA,
    {
      data: {
        registrations: [{ id: "reg-vecchio", federation: "Una vecchia sigla" }],
      },
    },
    scope(),
  );

  assert.equal(aggiornato.data.registrations.length, 1);
});

test("una scrittura che non parla di tesseramenti non paga niente", async () => {
  const aggiornato = await risorse.updateResource(
    "athletes",
    ATLETA,
    { data: { notes: "Corretto il cognome" } },
    scope(),
  );

  assert.equal(aggiornato.data.notes, "Corretto il cognome");
});

/* ------------------------------------------------------------------ */
/* Cio che non passa                                                   */
/* ------------------------------------------------------------------ */

test("un ente inventato viene rifiutato", async () => {
  await assert.rejects(
    () =>
      risorse.updateResource(
        "athletes",
        ATLETA,
        { data: { registrations: [tesseramento({ federationId: "fed-999" })] } },
        scope(),
      ),
    /Accesso negato/,
  );
});

test("un ente di un altro club viene rifiutato", async () => {
  /*
    E la forma piu insidiosa, e la sola che l'identificativo inventato non
    copre: `fed-altrove` **esiste davvero**, e chi la manda e in tutti e due i
    club. Il vaglio deve guardare le federazioni del club della **riga**, non
    quelle di un club qualsiasi di chi scrive.

    Il club attivo e percio quello **giusto** (`CLUB`): se fosse `ALTRO_CLUB` a
    rifiutare sarebbe il confine di tenancy, e questa prova misurerebbe una
    difesa diversa da quella che nomina — restando verde anche togliendo il
    vaglio sull'ente. Misurato: cosi com'e diventa rossa.
  */
  await assert.rejects(
    () =>
      risorse.updateResource(
        "athletes",
        ATLETA,
        {
          data: {
            registrations: [tesseramento({ federationId: "fed-altrove" })],
          },
        },
        scope(CLUB),
      ),
    /Accesso negato/,
  );
});

test("basta un ente estraneo fra tanti buoni per fermare tutto", async () => {
  await assert.rejects(
    () =>
      risorse.updateResource(
        "athletes",
        ATLETA,
        {
          data: {
            registrations: [
              tesseramento({ id: "reg-1", federationId: "fed-1" }),
              tesseramento({ id: "reg-2", federationId: "fed-2" }),
              tesseramento({ id: "reg-3", federationId: "fed-999" }),
            ],
          },
        },
        scope(),
      ),
    /Accesso negato/,
    "una scrittura parziale lascerebbe la scheda a meta",
  );
});

test("l'etichetta da sola non basta a fingere un legame", async () => {
  /*
    `federation: "FIGC"` con `federationId: "fed-altrove"`: la scritta e
    plausibile, il legame no. A decidere e l'identificativo.
  */
  await assert.rejects(
    () =>
      risorse.updateResource(
        "athletes",
        ATLETA,
        {
          data: {
            registrations: [
              tesseramento({ federationId: "fed-altrove", federation: "FIP" }),
            ],
          },
        },
        scope(),
      ),
    /Accesso negato/,
  );
});

/* ------------------------------------------------------------------ */
/* Anche in creazione                                                  */
/* ------------------------------------------------------------------ */

test("la guardia vale anche alla creazione di un atleta", async () => {
  await assert.rejects(
    () =>
      risorse.createResource(
        "athletes",
        {
          organization_id: CLUB,
          first_name: "Nuovo",
          last_name: "Atleta",
          data: { registrations: [tesseramento({ federationId: "fed-999" })] },
        },
        "create",
        scope(),
      ),
    /Accesso negato/,
    "chiudere solo la modifica lascerebbe aperta la porta gemella (ADR-0154)",
  );
});

test("e alla creazione un ente del club passa", async () => {
  const creato = await risorse.createResource(
    "athletes",
    {
      organization_id: CLUB,
      first_name: "Nuovo",
      last_name: "Atleta",
      data: { registrations: [tesseramento()] },
    },
    "create",
    scope(),
  );

  assert.equal(creato.data.registrations[0].federationId, "fed-1");
});
