import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **«Niccolo con l'accento» si cerca da tutte e due le parti.**
 *
 * Il Full Club UAT ha trovato che un'atleta salvata in forma **decomposta**
 * (`o` piu accento combinante) non si trovava cercando `Niccolò`, e si trovava
 * cercando `Niccolo`. La correzione ha normalizzato a NFC cio che si
 * **scrive** — nome, cognome, luogo di nascita, genitori.
 *
 * Restava aperta l'altra meta: la **chiave di ricerca**. Una `ILIKE` confronta
 * byte, e una chiave in forma decomposta non trova un nome in forma composta,
 * esattamente come prima ma a parti invertite. E la forma decomposta non e un
 * caso di laboratorio: e quella che arriva incollando da un Finder, da un
 * foglio esportato su macOS o da certi metodi di inserimento.
 *
 * NFC su una chiave di ricerca non e una trasformazione distruttiva — e la
 * forma canonica, e su un testo gia composto non cambia un byte — e non tocca
 * il dato salvato: e una normalizzazione del **confronto**.
 *
 * I due percorsi di ricerca vanno coperti entrambi, perche un club piccolo non
 * passa mai dal primo: sopra la soglia di paginazione cerca il database,
 * sotto cerca il browser.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";

/**
 * `Niccolo` con l'accento, in forma **decomposta**: la `o` e l'accento
 * combinante come due punti di codice distinti.
 *
 * Costruita dai punti di codice e non incollata, perche un editor che
 * normalizza il file renderebbe questo test vuoto senza che nessuno se ne
 * accorga.
 */
const NFD = `Niccol${String.fromCharCode(0x6f, 0x300)}`;
/** La stessa parola in forma composta, quella che sta nel database. */
const NFC = NFD.normalize("NFC");

const scope = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB,
  allowedOrganizationIds: [CLUB],
});

let resources;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  resources = await import("../../src/lib/server/resources.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma({
    club: [{ id: CLUB, slug: "club-a", name: "ASD Alfa", settings: {} }],
    athlete: [
      {
        id: "athlete-1",
        organization_id: CLUB,
        first_name: NFC,
        last_name: "Bianchi",
        status: "active",
        data: {},
      },
    ],
  });
  setPrismaClientForTests(fake.client);
});

test("le due forme sono davvero diverse: il test non e vuoto", () => {
  assert.notEqual(NFD, NFC, "se fossero uguali questo file non proverebbe nulla");
  assert.equal(NFD.length, 8, "otto punti di codice: la o e il suo accento sono separati");
  assert.equal(NFC.length, 7, "sette, una volta composti");
});

test("una chiave in forma decomposta arriva al database in forma composta", async () => {
  await resources.listResourcePage(
    "athletes",
    new URLSearchParams({ q: NFD }),
    scope(),
  );

  const where = fake.lastCall("athlete", "findMany").args.where;
  assert.equal(
    where.AND[0].OR[0].first_name.contains,
    NFC,
    "la chiave si normalizza come i nomi salvati",
  );
});

test("una chiave gia composta non viene toccata", async () => {
  await resources.listResourcePage(
    "athletes",
    new URLSearchParams({ q: NFC }),
    scope(),
  );

  const where = fake.lastCall("athlete", "findMany").args.where;
  assert.equal(where.AND[0].OR[0].first_name.contains, NFC);
});

test("la normalizzazione non allenta il confine del club", async () => {
  await resources.listResourcePage(
    "athletes",
    new URLSearchParams({ q: NFD }),
    scope(),
  );

  const where = fake.lastCall("athlete", "findMany").args.where;
  assert.equal(where.organization_id, CLUB);
});

/**
 * Sotto la soglia di paginazione la ricerca la fa il browser, sulla lista gia
 * caricata: e il caso della maggioranza dei club, e la correzione lato server
 * non lo tocca.
 */
test("anche la ricerca nel browser normalizza la chiave", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/app/athletes/page.tsx"),
    "utf8",
  );

  assert.match(
    source,
    /const normalizedQuery = searchQuery\.normalize\("NFC"\)\.toLowerCase\(\);/,
  );
  assert.doesNotMatch(
    source,
    /includes\(searchQuery\.toLowerCase\(\)\)/,
    "nessun confronto deve usare la chiave grezza",
  );
});

/**
 * E cio che si **salva** resta normalizzato: le due meta della correzione
 * devono restare insieme, o la ricerca torna a non trovare.
 */
test("i nomi si salvano in forma composta", async () => {
  const { normalizeAnagraficaText } = await import(
    "../../src/lib/server/anagrafica.ts"
  );

  const payload = { first_name: NFD, last_name: "Bianchi", data: {} };
  normalizeAnagraficaText("athletes", payload);

  assert.equal(payload.first_name, NFC);
  assert.equal(payload.first_name.length, 7);
});
