import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import { readFileSync } from "node:fs";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Il club si filtra nella query, non dopo** (PP-03).
 *
 * `caricaAllenatoreDelClubAttivo` — la lettura dietro
 * `DELETE /api/v1/trainer-accounts/:trainerId` — cercava l'allenatore in
 * **tutto** l'archivio e controllava il club solo dopo, su cio che aveva gia
 * trovato. Chiudeva, e non bastava:
 *
 * 1. `payload.path=["id"]` **non e unico**. L'identificativo logico di un
 *    allenatore (`trainer-<istante>-<casuale>`) puo ripetersi fra due club, e
 *    `findFirst` ne sceglie uno qualsiasi. Quando sceglieva quello dell'altro
 *    club, l'operatore si sentiva rispondere «Accesso negato» su un allenatore
 *    **proprio**: non una perdita di dato, ma una funzione che smette di
 *    funzionare, e in un modo che nessuno sa spiegare.
 * 2. La coppia «non trovato» / «accesso negato» diceva a chi provava se un
 *    identificativo esiste in **qualche** club.
 *
 * E la regola di CLAUDE.md §8, letteralmente: mai una query club-scoped senza
 * filtro `organization_id`.
 */

const CLUB = "aaaaaaaa-8c00-4000-8000-00000000000a";
const ALTRO_CLUB = "bbbbbbbb-8c00-4000-8000-00000000000b";
const DIREZIONE = "11111111-8c00-4000-8000-000000000aaa";
const UTENTE_COLLEGATO = "22222222-8c00-4000-8000-000000000bbb";

/** Lo **stesso** identificativo logico in due club diversi. */
const ID_LOGICO = "trainer-1756900000000-abc";

let collegamenti;
let setPrismaClientForTests;
let fake;

const scope = () => ({
  userId: DIREZIONE,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
  accessScopes: [],
  actorEmail: "direzione@club.it",
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  collegamenti = await import("../../src/lib/server/profile-account-links.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const seed = () => ({
  user: [
    { id: DIREZIONE, email: "direzione@club.it" },
    { id: UTENTE_COLLEGATO, email: "mister@club.it" },
  ],
  club: [
    { id: CLUB, slug: "club", name: "Club", creator_id: DIREZIONE },
    { id: ALTRO_CLUB, slug: "altro", name: "Altro", creator_id: DIREZIONE },
  ],
  clubResourceItem: [
    /*
      **L'altro club per primo.** `findFirst` senza filtro restituisce l'ordine
      dell'archivio: mettere l'estraneo davanti e cio che rende il test una
      prova e non una coincidenza.
    */
    {
      id: "99999999-8c00-4000-8000-0000000000ff",
      organization_id: ALTRO_CLUB,
      resource_type: "trainers",
      payload: { id: ID_LOGICO, name: "Omonimo di un altro club" },
    },
    {
      id: "88888888-8c00-4000-8000-0000000000ee",
      organization_id: CLUB,
      resource_type: "trainers",
      payload: {
        id: ID_LOGICO,
        name: "Il nostro mister",
        linkedUserId: UTENTE_COLLEGATO,
      },
    },
  ],
  auditLog: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

test("PP-03 · un identificativo omonimo in un altro club non nasconde il proprio allenatore", async () => {
  const esito = await collegamenti.unlinkTrainerAccount(scope(), {
    trainerId: ID_LOGICO,
    reason: "collaudo",
  });

  assert.equal(
    esito.unlinkedUserId,
    UTENTE_COLLEGATO,
    "e stata letta la scheda dell'altro club: la funzione nega su un allenatore proprio",
  );

  const nostro = fake
    .rows("clubResourceItem")
    .find((riga) => riga.organization_id === CLUB);
  assert.equal(
    nostro.payload.linkedUserId ?? null,
    null,
    "lo scollegamento non ha toccato la riga giusta",
  );

  const estraneo = fake
    .rows("clubResourceItem")
    .find((riga) => riga.organization_id === ALTRO_CLUB);
  assert.equal(
    estraneo.payload.name,
    "Omonimo di un altro club",
    "la riga dell'altro club e stata toccata",
  );
});

test("PP-03 · un allenatore che esiste solo in un altro club risulta non trovato", async () => {
  /*
    Il verso opposto: chi prova un identificativo altrui deve ricevere la
    stessa risposta che riceverebbe per un identificativo **inventato**.
    Distinguere le due cose e l'oracolo di esistenza.
  */
  fake.rows("clubResourceItem").splice(1, 1);

  await assert.rejects(
    () => collegamenti.unlinkTrainerAccount(scope(), { trainerId: ID_LOGICO }),
    /non trovat/i,
  );

  await assert.rejects(
    () =>
      collegamenti.unlinkTrainerAccount(scope(), {
        trainerId: "trainer-mai-esistito",
      }),
    /non trovat/i,
  );
});

test("PP-03 · la lettura filtra il club nella query, non dopo", () => {
  /*
    La forma dell'istruzione, non solo il suo esito: un `findFirst` senza
    `organization_id` che torna a passare renderebbe di nuovo l'ordine
    dell'archivio parte della risposta, e i due test qui sopra potrebbero
    restare verdi per fortuna.
  */
  const sorgente = readFileSync(
    new URL("../../src/lib/server/profile-account-links.ts", import.meta.url),
    "utf8",
  );

  const inizio = sorgente.indexOf("const caricaAllenatoreDelClubAttivo");
  assert.ok(inizio > -1, "la lettura dell'allenatore non esiste piu");
  const corpo = sorgente.slice(inizio, sorgente.indexOf("\n};", inizio));

  const letture = corpo.match(/prisma\.clubResourceItem\.findFirst\(\{[\s\S]*?\}\)/g) || [];
  assert.ok(letture.length >= 2, "attese due letture, trovate " + letture.length);

  for (const lettura of letture) {
    assert.match(
      lettura,
      /organization_id:/,
      "una lettura di risorsa di club senza filtro organization_id (CLAUDE.md §8)",
    );
  }
});
