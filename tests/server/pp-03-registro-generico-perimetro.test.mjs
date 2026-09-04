import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Due porte per lo stesso dato, e una sola sorvegliata** (PP-03 §7).
 *
 * E la forma di difetto piu frequente di questo repository, e due revisioni
 * ostili l'hanno ritrovata su altre due porte del **registro generico**, dopo
 * che il dominio degli eventi era gia stato chiuso.
 *
 * - `GET /api/v1/club_event_participants` serve le stesse righe che
 *   `listEventParticipants` filtra. Il vaglio qui si fermava all'**evento**:
 *   su un allenamento congiunto A+B uscivano stato di presenza, stato di
 *   convocazione e la **nota in testo libero** su un minore che l'elenco
 *   atleti dello stesso allenatore non gli mostra.
 * - `GET /api/v1/medical_certificates` non aveva **nessun** perimetro
 *   dell'allenatore, in nessuna forma: le due risorse stavano in
 *   `TRAINER_READ_RESOURCES` e non fra quelle filtrate. `clinical.status_read`
 *   risponde a «puo scendere in campo?» — dei **propri** atleti — e da li
 *   usciva lo stato sanitario di minori di un'altra squadra, con
 *   l'identificativo della riga, che e la chiave per bussare alle porte
 *   successive.
 *
 * Il terzo caso e una divergenza di nomi: la decisione di filtrare guardava il
 * nome **canonico** della risorsa e un ramo confrontava quello **grezzo**,
 * quindi `training_attendance` — l'alias storico della stessa tabella —
 * rispondeva **zero righe** dove `club_event_participants` ne rispondeva
 * cinque. Falliva chiuso, quindi non era una fuga: era la stessa schermata
 * che, a seconda del nome usato, mostrava tutto o niente.
 */

const CLUB = "aaaaaaaa-d100-4000-8000-00000000000a";
const MISTER_B = "11111111-d100-4000-8000-00000000000b";

const CAT_A = "cat-a";
const CAT_B = "cat-b";

const EVENTO_AB = "eeeeeeee-d100-4000-8000-000000000001";

const ATLETA_A = "bbbbbbbb-d100-4000-8000-00000000000a";
const ATLETA_B = "bbbbbbbb-d100-4000-8000-00000000000b";

let risorse;
let setPrismaClientForTests;
let fake;

const scopeAllenatore = () => ({
  userId: MISTER_B,
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
  user: [{ id: MISTER_B, email: "b@club.it" }],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      categories: [
        { id: CAT_A, name: "Under 12" },
        { id: CAT_B, name: "Under 15" },
      ],
      trainers: [
        {
          id: "trainer-b",
          email: "b@club.it",
          linkedUserId: MISTER_B,
          categories: [CAT_B],
        },
      ],
      staff_members: [],
    },
  ],
  clubEvent: [
    {
      id: EVENTO_AB,
      organization_id: CLUB,
      kind: "training",
      legacy_id: EVENTO_AB,
      title: "Congiunto A+B",
      status: "scheduled",
      category_id: CAT_A,
      category_ids: [CAT_A, CAT_B],
      starts_at: new Date("2026-09-10T18:00:00.000Z"),
      payload: { id: EVENTO_AB },
    },
  ],
  athlete: [
    {
      id: ATLETA_A,
      organization_id: CLUB,
      first_name: "Anna",
      last_name: "A",
      status: "active",
      category_id: CAT_A,
      data: {},
    },
    {
      id: ATLETA_B,
      organization_id: CLUB,
      first_name: "Bruno",
      last_name: "B",
      status: "active",
      category_id: CAT_B,
      data: {},
    },
  ],
  clubEventParticipant: [
    {
      id: "riga-a",
      organization_id: CLUB,
      event_id: EVENTO_AB,
      legacy_training_id: EVENTO_AB,
      athlete_id: ATLETA_A,
      attendance_status: "absent",
      convocation_status: "excluded",
      attendance_notes:
        "SEGRETO-A: la madre ha chiamato per il tribunale dei minori",
    },
    {
      id: "riga-b",
      organization_id: CLUB,
      event_id: EVENTO_AB,
      legacy_training_id: EVENTO_AB,
      athlete_id: ATLETA_B,
      attendance_status: "present",
      convocation_status: "convocated",
      attendance_notes: null,
    },
  ],
  medicalCertificate: [
    {
      id: "cert-a",
      organization_id: CLUB,
      athlete_id: ATLETA_A,
      status: "valid",
      expiry_date: new Date("2027-01-31T00:00:00.000Z"),
    },
    {
      id: "cert-b",
      organization_id: CLUB,
      athlete_id: ATLETA_B,
      status: "valid",
      expiry_date: new Date("2027-02-28T00:00:00.000Z"),
    },
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const elenco = async (risorsa) => {
  const { records } = await risorse.listResourcePage(
    risorsa,
    new URLSearchParams({ organization_id: CLUB }),
    scopeAllenatore(),
  );
  return records;
};

test("PP-03 · il registro generico non porta la partecipazione di un atleta fuori perimetro", async () => {
  const righe = await elenco("club_event_participants");

  assert.deepEqual(
    righe.map((riga) => riga.athlete_id),
    [ATLETA_B],
    "l'evento congiunto e ammesso, e con lui uscivano tutti i suoi partecipanti",
  );
  assert.equal(
    JSON.stringify(righe).includes("SEGRETO-A"),
    false,
    "la nota in testo libero su un minore fuori perimetro e uscita",
  );
});

test("PP-03 · l'alias storico della stessa tabella risponde come il nome canonico", async () => {
  /*
    `training_attendance` e `club_event_participants` sono la stessa tabella.
    Prima una rispondeva con le righe e l'altra con zero, perche un ramo
    confrontava il nome grezzo e la decisione di filtrare quello canonico.
  */
  const perAlias = await elenco("training_attendance");
  const perCanonico = await elenco("club_event_participants");

  assert.deepEqual(
    perAlias.map((riga) => riga.athlete_id),
    perCanonico.map((riga) => riga.athlete_id),
  );
  assert.equal(perAlias.length, 1);
});

test("PP-03 · lo stato del certificato e dei propri atleti", async () => {
  const righe = await elenco("medical_certificates");

  assert.deepEqual(
    righe.map((riga) => riga.athlete_id),
    [ATLETA_B],
    "usciva lo stato sanitario di un minore di un'altra squadra",
  );
});

test("PP-03 · la direzione continua a vedere tutto", async () => {
  /*
    Il verso opposto: il recinto dell'allenatore non restringe chi allenatore
    non e. Se questo test diventasse rosso, la correzione avrebbe tolto alla
    segreteria il proprio lavoro.
  */
  const scopeDirezione = {
    userId: "11111111-d100-4000-8000-0000000000ff",
    activeOrganizationId: CLUB,
    activeRole: "owner",
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

  for (const risorsa of ["club_event_participants", "medical_certificates"]) {
    const { records } = await risorse.listResourcePage(
      risorsa,
      new URLSearchParams({ organization_id: CLUB }),
      scopeDirezione,
    );
    assert.equal(records.length, 2, `${risorsa}: la direzione vede meno di prima`);
  }
});
