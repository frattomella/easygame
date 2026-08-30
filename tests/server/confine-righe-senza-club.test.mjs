import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Le tre porte che il confine dichiarato non chiudeva.**
 *
 * `assertOgniRisorsaDichiaraIlConfine` impedisce a `resources.ts` di caricarsi
 * se una risorsa resta senza etichetta. Verifica che l'etichetta ci **sia**,
 * non che lo schema la sappia sostenere — e una revisione di conferma ha
 * trovato tre casi in cui l'etichetta diceva il vero e il confine passava
 * comunque:
 *
 * 1. **una riga di club senza club.** `Notification.organization_id` e
 *    nullabile, `resolveRecordOrganizationId` restituiva `null`, e
 *    `ensureOrganizationAccess` con `null` usciva **senza negare**. La stessa
 *    forma del difetto di `users`, una colonna piu stretta;
 * 2. **il club risolto dalla sessione e il club su cui si agisce, diversi.**
 *    Il checkout leggeva l'intestazione per risolvere lo scope e il corpo per
 *    scegliere il club, e poi verificava il **corpo** contro se stesso;
 * 3. **una rotta che sceglie le colonne a mano**, e percio non passa da
 *    `serializeRecord`: di ogni club dell'utente usciva l'intero
 *    `clubs.settings`, attivo o no.
 */

const MIO = "aaaaaaaa-5555-4000-8000-00000000000a";
const ALTRUI = "bbbbbbbb-5555-4000-8000-00000000000b";
const IO = "11111111-5555-4000-8000-000000000aaa";
const NOTIFICA_SENZA_CLUB = "99999999-5555-4000-8000-000000000fff";

const scopeAttaccante = () => ({
  userId: IO,
  activeOrganizationId: MIO,
  activeRole: "owner",
  allowedOrganizationIds: [MIO, ALTRUI],
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

const seed = () => ({
  user: [{ id: IO, email: "io@example.it", role: "user" }],
  club: [
    { id: MIO, slug: "mio", name: "Il mio club", creator_id: IO },
    { id: ALTRUI, slug: "altrui", name: "Club altrui" },
  ],
  notification: [
    {
      id: NOTIFICA_SENZA_CLUB,
      organization_id: null,
      title: "riservata",
      message: "segreto",
    },
    {
      id: "88888888-5555-4000-8000-000000000eee",
      organization_id: MIO,
      title: "mia",
      message: "visibile",
    },
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const negato = /Accesso negato/;

test("una notifica senza club non si legge, non si scrive, non si cancella", async () => {
  for (const azione of [
    () => risorse.getResourceById("notifications", NOTIFICA_SENZA_CLUB, scopeAttaccante()),
    () =>
      risorse.updateResource(
        "notifications",
        NOTIFICA_SENZA_CLUB,
        { title: "presa" },
        scopeAttaccante(),
      ),
    () => risorse.deleteResource("notifications", NOTIFICA_SENZA_CLUB, scopeAttaccante()),
  ]) {
    await assert.rejects(azione, negato);
  }

  const riga = fake
    .rows("notification")
    .find((r) => r.id === NOTIFICA_SENZA_CLUB);
  assert.equal(riga.title, "riservata", "e resta com'era");
});

test("una notifica del club attivo continua a leggersi", async () => {
  const record = await risorse.getResourceById(
    "notifications",
    "88888888-5555-4000-8000-000000000eee",
    scopeAttaccante(),
  );
  assert.equal(record.title, "mia");
});
