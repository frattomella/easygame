import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **I documenti personali di chi lavora nel club non li legge un collega**
 * (D-AUD-3).
 *
 * ---
 *
 * ## Il difetto misurato
 *
 * Un allegato eredita i permessi da cio a cui e attaccato, e
 * `attachment-permissions.ts` lo dice in testa con l'esempio giusto: «il
 * contratto di un collaboratore, se si legge il lavoro sportivo».
 *
 * La tabella pero mappava `trainer -> trainers`, e `trainers` un allenatore la
 * **legge**. Il perimetro degli allegati parlava solo di atleti, e una risorsa
 * che dichiara `keys: []` e raggiungibile da ogni ruolo personalizzato. Tre
 * cose ciascuna ragionevole, che insieme aprivano:
 *
 *     GET /api/v1/attachments?owner_type=trainer   -> l'indice
 *     GET /api/v1/attachments/<id>                 -> i byte
 *
 * cioe contratti e documenti d'identita di **ogni collega**, a un allenatore
 * qualunque. Contraddice due decisioni che il prodotto afferma altrove:
 * `CAMPI_PERSONA_VISIBILI_ALL_ALLENATORE`, che a un allenatore toglie codice
 * fiscale e indirizzo di un collega, e la riserva di `sport_work` alla
 * direzione «perche dice quanto guadagna una persona». Il contratto lo dice.
 *
 * ## Le due strade che restano
 *
 * Chi amministra il lavoro sportivo, e **la persona stessa** sulla propria
 * scheda. La seconda non e una concessione: il pannello documenti
 * dell'allenatore esiste per questo, e chiuderla spegnerebbe una funzione
 * invece di chiudere una porta.
 */

const CLUB = "aaaaaaaa-df00-4000-8000-00000000000a";
const MISTER_A = "cccccccc-df00-4000-8000-000000000001";
const MISTER_B = "cccccccc-df00-4000-8000-000000000002";
const PRESIDENTE = "cccccccc-df00-4000-8000-0000000000ff";

const DOC_A = "11111111-df00-4000-8000-00000000000a";
const DOC_B = "11111111-df00-4000-8000-00000000000b";

let allegati;
let setPrismaClientForTests;
let fake;

const scopeDi = (userId, activeRole) => ({
  userId,
  activeOrganizationId: CLUB,
  activeRole,
  allowedOrganizationIds: [CLUB],
  accessScopes: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  allegati = await import("../../src/lib/server/attachments.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const contratto = (id, schedaId, nome) => ({
  id,
  organization_id: CLUB,
  owner_type: "trainer",
  owner_id: schedaId,
  category: "contratto",
  file_name: nome,
  mime_type: "application/pdf",
  size_bytes: 12,
  checksum: "x",
  storage_driver: "database",
  storage_key: null,
  created_by: null,
  created_at: new Date("2026-01-01"),
  updated_at: new Date("2026-01-01"),
});

const seed = () => ({
  user: [
    { id: MISTER_A, email: "mister-a@club.it" },
    { id: MISTER_B, email: "mister-b@club.it" },
    { id: PRESIDENTE, email: "presidente@club.it" },
  ],
  club: [
    {
      id: CLUB,
      name: "Club",
      creator_id: PRESIDENTE,
      categories: [],
      club_sites: [],
      category_groups: [],
      trainers: [],
      staff_members: [],
    },
  ],
  clubResourceItem: [
    {
      id: "22222222-df00-4000-8000-00000000000a",
      organization_id: CLUB,
      resource_type: "trainers",
      payload: {
        id: "scheda-a",
        email: "mister-a@club.it",
        linkedUserId: MISTER_A,
      },
    },
    {
      id: "22222222-df00-4000-8000-00000000000b",
      organization_id: CLUB,
      resource_type: "trainers",
      payload: {
        id: "scheda-b",
        email: "mister-b@club.it",
        linkedUserId: MISTER_B,
      },
    },
  ],
  athlete: [],
  athleteCategoryMembership: [],
  attachment: [
    contratto(DOC_A, "scheda-a", "contratto-a.pdf"),
    contratto(DOC_B, "scheda-b", "contratto-b.pdf"),
  ],
  attachmentBlob: [
    { attachment_id: DOC_A, content: Buffer.from("CONTRATTO-A") },
    { attachment_id: DOC_B, content: Buffer.from("CONTRATTO-B") },
  ],
  auditLog: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

/* ==================================================================== *
 *  1. I byte
 * ==================================================================== */

test("un allenatore non scarica il contratto di un collega", async () => {
  const esito = await allegati
    .readAttachment(DOC_B, scopeDi(MISTER_A, "trainer"))
    .then(() => "riuscito")
    .catch((errore) => String(errore?.message || errore));

  assert.match(
    String(esito),
    /Accesso negato/,
    "prima: 200 e i byte del contratto di un altro allenatore",
  );
});

test("ma scarica il proprio", async () => {
  /*
    **Il controspecchio.** Senza questa riga la correzione passerebbe anche
    chiudendo tutto, e avrebbe spento il pannello documenti dell'allenatore
    invece di chiudere una porta.
  */
  const esito = await allegati.readAttachment(
    DOC_A,
    scopeDi(MISTER_A, "trainer"),
  );

  assert.equal(esito?.content?.toString(), "CONTRATTO-A");
});

test("e la direzione li vede tutti e due: e la risorsa da cui ereditano", async () => {
  for (const id of [DOC_A, DOC_B]) {
    const esito = await allegati.readAttachment(
      id,
      scopeDi(PRESIDENTE, "owner"),
    );
    assert.ok(esito?.content, `la direzione deve leggere ${id}`);
  }
});

/* ==================================================================== *
 *  2. L'elenco, che e la porta di servizio dei byte
 * ==================================================================== */

test("l'elenco non nomina i documenti dei colleghi", async () => {
  /*
    I byte erano la meta del difetto. L'altra meta e l'indice: un nome di file
    nomina la persona, e la riga porta l'identificativo con cui poi si chiedono
    i byte — la chiave d'ingresso di tutte le altre porte.
  */
  const elenco = await allegati.listAttachments(
    { organizationId: CLUB, ownerType: "trainer" },
    scopeDi(MISTER_A, "trainer"),
  );

  assert.deepEqual(
    elenco.map((riga) => riga.id),
    [DOC_A],
    "prima: l'indice di ogni contratto del club",
  );
});

test("e chi amministra il lavoro sportivo li vede tutti", async () => {
  const elenco = await allegati.listAttachments(
    { organizationId: CLUB, ownerType: "trainer" },
    scopeDi(PRESIDENTE, "owner"),
  );

  assert.equal(elenco.length, 2);
});

test("una riga fuori perimetro sparisce dall'elenco, non lo fa fallire", async () => {
  /*
    Il verso conta: un allenatore che apre il proprio pannello deve vedere i
    propri documenti, non un errore perche nel club ne esistono altri.
  */
  const elenco = await allegati.listAttachments(
    { organizationId: CLUB, ownerType: "trainer" },
    scopeDi(MISTER_B, "trainer"),
  );

  assert.deepEqual(
    elenco.map((riga) => riga.id),
    [DOC_B],
  );
});

/* ==================================================================== *
 *  3. Il deposito, che era la sesta porta
 * ==================================================================== */

test("un collega non deposita un documento nel fascicolo di un altro", async () => {
  /*
    **La porta che il primo giro aveva lasciato aperta**, trovata da una
    revisione indipendente sulla remediation stessa.

    Il perimetro era stato messo sulle cinque porte che leggono e su quella che
    cancella, e non sul **deposito**. Una segreteria — che legge `trainers`
    legittimamente, e da li ricava gli identificativi dei colleghi — poteva
    metterci dentro un «contratto», e poi non poterlo piu ne rileggere ne
    togliere: il proprietario del club se lo trovava nel pannello del lavoro
    sportivo senza poterlo attribuire a nessuno.
  */
  const esito = await allegati
    .createAttachment(
      {
        ownerType: "trainer",
        ownerId: "scheda-b",
        category: "contratto",
        fileName: "finto.pdf",
        mimeType: "application/pdf",
        content: Buffer.from("FINTO"),
      },
      scopeDi(MISTER_A, "trainer"),
    )
    .then(() => "riuscito")
    .catch((errore) => String(errore?.message || errore));

  assert.match(String(esito), /Accesso negato/);
});

test("ma deposita nel proprio", async () => {
  const esito = await allegati.createAttachment(
    {
      ownerType: "trainer",
      ownerId: "scheda-a",
      category: "contratto",
      fileName: "mio.pdf",
      mimeType: "application/pdf",
      content: Buffer.from("MIO"),
    },
    scopeDi(MISTER_A, "trainer"),
  );

  assert.ok(esito?.id, "il pannello documenti dell'allenatore deve continuare a funzionare");
});

test("un errore dell'archivio non fa sparire una riga dall'elenco", async () => {
  /*
    **«Non e tuo» e «l'archivio non risponde» non sono la stessa cosa.**

    Il `catch` nudo le confondeva: un errore su una riga faceva sparire in
    silenzio il documento **proprio** dell'allenatore dal suo pannello, con un
    200 e nessun log. Chi guarda vede un pannello vuoto e crede che il file sia
    andato perduto.
  */
  /*
    Il doppio e un Proxy: si avvolge invece di copiarlo, o le sue trappole
    spariscono e il test misura un oggetto vuoto.
  */
  const rotto = new Proxy(fake.client, {
    get(target, prop, receiver) {
      if (prop === "clubResourceItem") {
        return {
          findFirst: async () => {
            throw new Error("connessione interrotta");
          },
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  setPrismaClientForTests(rotto);

  const esito = await allegati
    .listAttachments(
      { organizationId: CLUB, ownerType: "trainer" },
      scopeDi(MISTER_A, "trainer"),
    )
    .then(() => "elenco restituito")
    .catch((errore) => String(errore?.message || errore));

  assert.match(
    String(esito),
    /connessione interrotta/,
    "un elenco che mente sul proprio contenuto e peggio di uno che fallisce",
  );
});
