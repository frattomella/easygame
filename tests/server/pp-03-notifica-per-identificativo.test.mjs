import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **La notifica indirizzata a un altro, letta per identificativo** (PP-03 §9.1).
 *
 * `applyRecipientScope` chiude l'elenco: da `GET /api/v1/notifications` escono
 * la propria e quelle di tutti. Ma la riga singola non passava di li.
 * `getResourceById`, `updateResource` e `deleteResource` chiamano
 * `assertRecordAccess`, che guardava soltanto il **club**: con l'identificativo
 * in mano, un qualunque membro leggeva, riscriveva e **cancellava** la notifica
 * di un altro — compreso il riepilogo economico di una famiglia in arretrato.
 *
 * E la terza volta che questo file sbaglia nella stessa direzione — la
 * correzione va nell'elenco e la porta accanto resta aperta — ed e per questo
 * che le prove qui sotto coprono **tutti e tre i verbi**, non solo la lettura:
 * una lettura si chiude, una riga cancellata non torna.
 */

const CLUB = "cccccccc-d100-4000-8000-00000000000c";
const MISTER = "11111111-d100-4000-8000-000000000001";
const GENITORE = "22222222-d100-4000-8000-000000000002";

const SEGRETO = "INSOLUTO 480,00 EUR — famiglia Collaudo";

const NOTIFICA_ALTRUI = "aaaaaaaa-d100-4000-8000-000000000001";
const NOTIFICA_DI_TUTTI = "aaaaaaaa-d100-4000-8000-000000000002";
const NOTIFICA_PROPRIA = "aaaaaaaa-d100-4000-8000-000000000003";

let risorse;
let setPrismaClientForTests;
let fake;

const scopeAllenatore = () => ({
  userId: MISTER,
  activeOrganizationId: CLUB,
  activeRole: "trainer",
  allowedOrganizationIds: [CLUB],
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
  user: [
    { id: MISTER, email: "mister@club.it" },
    { id: GENITORE, email: "genitore@club.it" },
  ],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      categories: [{ id: "cat-a", name: "Under 12" }],
      trainers: [
        {
          id: "trainer-1",
          email: "mister@club.it",
          linkedUserId: MISTER,
          categories: ["cat-a"],
        },
      ],
      staff_members: [],
    },
  ],
  notification: [
    {
      id: NOTIFICA_ALTRUI,
      organization_id: CLUB,
      user_id: GENITORE,
      title: "Rate scadute",
      message: SEGRETO,
      type: "payment",
      read: false,
    },
    {
      id: NOTIFICA_DI_TUTTI,
      organization_id: CLUB,
      user_id: null,
      title: "Palestra chiusa",
      message: "Impianto chiuso per manutenzione",
      type: "info",
      read: false,
    },
    {
      id: NOTIFICA_PROPRIA,
      organization_id: CLUB,
      user_id: MISTER,
      title: "Convocazioni da completare",
      message: "Mancano le convocazioni di sabato",
      type: "info",
      read: false,
    },
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const negato = async (azione, cosa) => {
  await assert.rejects(
    azione,
    (errore) => /Accesso negato/.test(String(errore?.message)),
    cosa,
  );
};

test("PP-03 §9.1 · la notifica di un altro non si legge per identificativo", async () => {
  await negato(
    risorse.getResourceById("notifications", NOTIFICA_ALTRUI, scopeAllenatore()),
    "il riepilogo economico di una famiglia usciva a chiunque conoscesse l'identificativo",
  );
});

test("PP-03 §9.1 · nemmeno dall'alias `simplified_notifications`", async () => {
  /*
    Due nomi per la stessa tabella. Una guardia scritta su un nome solo e la
    forma di difetto che questo repository ha gia collezionato: qui i due nomi
    stanno nello stesso insieme, e questa prova lo tiene vero.
  */
  await negato(
    risorse.getResourceById(
      "simplified_notifications",
      NOTIFICA_ALTRUI,
      scopeAllenatore(),
    ),
    "l'alias e la stessa tabella, e rispondeva diversamente",
  );
});

test("PP-03 §9.1 · la notifica di un altro non si riscrive", async () => {
  await negato(
    risorse.updateResource(
      "notifications",
      NOTIFICA_ALTRUI,
      { title: "manomessa" },
      scopeAllenatore(),
    ),
    "il PATCH generico riscriveva il testo indirizzato a un altro",
  );

  const dopo = fake.rows("notification").find(
    (riga) => riga.id === NOTIFICA_ALTRUI,
  );
  assert.equal(dopo.title, "Rate scadute", "e la riga era davvero cambiata");
});

test("PP-03 §9.1 · la notifica di un altro non si cancella", async () => {
  await negato(
    risorse.deleteResource("notifications", NOTIFICA_ALTRUI, scopeAllenatore()),
    "una lettura si chiude, una riga cancellata non torna",
  );

  assert.ok(
    fake.rows("notification").some((riga) => riga.id === NOTIFICA_ALTRUI),
    "la riga e sparita dall'archivio",
  );
});

/* ------------------------------------------------------ il verso opposto */

test("PP-03 §9.1 · la propria notifica e quella di tutti restano leggibili", async () => {
  const propria = await risorse.getResourceById(
    "notifications",
    NOTIFICA_PROPRIA,
    scopeAllenatore(),
  );
  assert.equal(propria.id, NOTIFICA_PROPRIA);

  /*
    `user_id` nullo vuol dire «di tutti», ed e il valore che il prodotto usa
    per gli avvisi di club: una guardia che lo trattasse come «di nessuno»
    spegnerebbe le notifiche generali invece di proteggere quelle personali.
  */
  const diTutti = await risorse.getResourceById(
    "notifications",
    NOTIFICA_DI_TUTTI,
    scopeAllenatore(),
  );
  assert.equal(diTutti.id, NOTIFICA_DI_TUTTI);
});

test("PP-03 §9.1 · la propria notifica si segna ancora come letta", async () => {
  await risorse.updateResource(
    "notifications",
    NOTIFICA_PROPRIA,
    { read: true },
    scopeAllenatore(),
  );

  const dopo = fake.rows("notification").find(
    (riga) => riga.id === NOTIFICA_PROPRIA,
  );
  assert.equal(dopo.read, true, "la correzione ha chiuso anche il caso legittimo");
});
