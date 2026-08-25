import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Il peso della lista Atleti (Blocco 8, punto E).
 *
 * Il Blocco 8 ha portato gli allegati fuori dai record. La lista di 200 atleti
 * e stata rimisurata subito dopo, e pesava ancora **23,7 MB**: il difetto era
 * altrove. `view=summary` (WP-31) toglieva tutti gli allegati **tranne
 * l'avatar**, che la lista mostra — 90 kB di base64 a testa, dentro il JSON
 * che il browser deve scaricare tutto prima di disegnare la prima riga.
 *
 * Questi test difendono le due proprieta che hanno chiuso il problema:
 * nessun binario nella risposta della lista, e nessuna foto persa per strada.
 *
 * La misura vera si rifa con
 * `node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs
 * scripts/measure-athletes-payload.mjs`.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ATHLETE = "11111111-0000-4000-8000-000000000001";

const scope = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB,
  allowedOrganizationIds: [CLUB],
});

let resources;
let setPrismaClientForTests;
let fake;

const bigDataUrl = (mime) => `data:${mime};base64,${"A".repeat(120_000)}`;

const seed = () => ({
  athlete: [
    {
      id: ATHLETE,
      organization_id: CLUB,
      first_name: "Anna",
      last_name: "Rossi",
      status: "active",
      avatar_url: null,
      data: {
        avatar: bigDataUrl("image/jpeg"),
        medicalCertExpiry: "2027-03-01",
        phone: "+39 333 1234567",
        documents: [
          { id: "d1", fileName: "doc.pdf", fileUrl: bigDataUrl("application/pdf") },
        ],
        certificateFiles: { blsd: bigDataUrl("application/pdf") },
        identityDocuments: [{ id: "i1", fileUrl: bigDataUrl("application/pdf") }],
      },
    },
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

const listSummary = () =>
  resources.listResource(
    "athletes",
    new URLSearchParams("view=summary"),
    scope(),
  );

test("nessun data URL sopravvive nella risposta della lista", async () => {
  const records = await listSummary();
  const serialized = JSON.stringify(records);

  assert.equal(
    /data:[a-z]+\/[a-z0-9.+-]+;base64/i.test(serialized),
    false,
    "un binario nella lista e il difetto che WP-31 ed E hanno chiuso",
  );
});

test("la lista di un atleta con sei allegati sta in pochi kB", async () => {
  const records = await listSummary();
  const bytes = Buffer.byteLength(JSON.stringify(records), "utf8");

  assert.ok(
    bytes < 4096,
    `la riga di un atleta pesa ${bytes} byte: gli allegati sono tornati dentro`,
  );
});

test("la foto non sparisce: diventa un indirizzo", async () => {
  const [record] = await listSummary();

  assert.equal(
    record.data.avatar,
    `/api/v1/athletes/${ATHLETE}/avatar`,
    "la lista deve continuare a mostrare i volti",
  );

  // `avatar_url` era gia vuoto: non si inventa un indirizzo per una foto che
  // non c'e in quella colonna. Il client legge `avatar_url || data.avatar`.
  assert.equal(record.avatar_url, null);
});

test("anche la colonna avatar_url diventa un indirizzo quando contiene un binario", async () => {
  fake.rows("athlete")[0].avatar_url = bigDataUrl("image/png");

  const [record] = await listSummary();
  assert.equal(record.avatar_url, `/api/v1/athletes/${ATHLETE}/avatar`);
});

test("una foto gia servita da un URL non viene toccata", async () => {
  fake.rows("athlete")[0].avatar_url = "https://cdn.esempio.it/foto/anna.jpg";
  fake.rows("athlete")[0].data.avatar = "https://cdn.esempio.it/foto/anna.jpg";

  const [record] = await listSummary();

  assert.equal(record.avatar_url, "https://cdn.esempio.it/foto/anna.jpg");
  assert.equal(record.data.avatar, "https://cdn.esempio.it/foto/anna.jpg");
});

test("un riferimento ad allegato resta un riferimento", async () => {
  const reference = "attachment:22222222-0000-4000-8000-000000000002";
  fake.rows("athlete")[0].data.avatar = reference;

  const [record] = await listSummary();
  assert.equal(record.data.avatar, reference);
});

test("un atleta senza foto non ne riceve una finta", async () => {
  fake.rows("athlete")[0].data.avatar = "";

  const [record] = await listSummary();
  assert.equal(record.data.avatar, "");
  assert.equal(record.avatar_url, null);
});

test("il dettaglio continua a ricevere tutto: la proiezione e solo della lista", async () => {
  const records = await resources.listResource(
    "athletes",
    new URLSearchParams(""),
    scope(),
  );

  assert.ok(
    String(records[0].data.avatar).startsWith("data:"),
    "senza view=summary il record e integro",
  );
  assert.equal(records[0].data.documents.length, 1);
});
