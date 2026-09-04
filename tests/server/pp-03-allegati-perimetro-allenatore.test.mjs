import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Il recinto dell'allenatore arriva anche agli allegati** (PP-03).
 *
 * Gli allegati sono la **fine** di ogni catena: chi ottiene un identificativo
 * — da un elenco, da una coda, da un fascicolo — arriva ai byte. Il perimetro
 * c'era, e guardava una cosa sola: `club_access_scopes`, cioe le righe di un
 * ruolo con perimetro dichiarato.
 *
 * Un allenatore ordinario **non ha nessuna di quelle righe**: il suo recinto
 * vive nella scheda dentro `clubs.trainers`. Per quel taglio il suo perimetro
 * era assente, e «assente» vale «tutto il club» (ADR-0103). L'ironia misurata
 * da una revisione ostile: un allenatore con ruolo **personalizzato** e uno
 * scope di categoria era protetto; quello **base** no. La difesa c'era e si
 * accendeva sulla persona sbagliata.
 *
 * Misurato contro PostgreSQL e le rotte vere in
 * `scripts/pp-03-allegati-perimetro-probe.mjs`: la carta d'identita di un
 * minore di un'altra categoria usciva con 200 e `content-type application/pdf`.
 */

const CLUB = "aaaaaaaa-ae00-4000-8000-00000000000a";
const MISTER_A = "cccccccc-ae00-4000-8000-000000000001";
const ATLETA_A = "bbbbbbbb-ae00-4000-8000-00000000000a";
const ATLETA_B = "bbbbbbbb-ae00-4000-8000-00000000000b";

let allegati;
let setPrismaClientForTests;
let fake;

const scopeAllenatore = () => ({
  userId: MISTER_A,
  activeOrganizationId: CLUB,
  activeRole: "trainer",
  allowedOrganizationIds: [CLUB],
  accessScopes: [],
});

const scopeDirezione = () => ({
  userId: "cccccccc-ae00-4000-8000-0000000000ff",
  activeOrganizationId: CLUB,
  activeRole: "owner",
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

const allegato = (id, atleta, nome) => ({
  id,
  organization_id: CLUB,
  owner_type: "athlete",
  owner_id: atleta,
  category: "documento-identita",
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
  user: [{ id: MISTER_A, email: "mister-a@club.it" }],
  club: [
    {
      id: CLUB,
      name: "Club",
      creator_id: "cccccccc-ae00-4000-8000-0000000000ff",
      categories: [
        { id: "cat-a", name: "Under 15" },
        { id: "cat-b", name: "Under 17" },
      ],
      club_sites: [],
      category_groups: [],
      trainers: [
        {
          id: "trainer-a",
          email: "mister-a@club.it",
          linkedUserId: MISTER_A,
          categories: ["cat-a"],
          groups: [],
        },
      ],
      staff_members: [],
    },
  ],
  athlete: [
    {
      id: ATLETA_A,
      organization_id: CLUB,
      first_name: "Anna",
      last_name: "A",
      category_id: "cat-a",
      data: {},
      category_memberships: [],
    },
    {
      id: ATLETA_B,
      organization_id: CLUB,
      first_name: "Bruno",
      last_name: "B",
      category_id: "cat-b",
      data: {},
      category_memberships: [],
    },
  ],
  athleteCategoryMembership: [],
  attachment: [
    allegato("11111111-ae00-4000-8000-00000000000a", ATLETA_A, "identita-a.pdf"),
    allegato("11111111-ae00-4000-8000-00000000000b", ATLETA_B, "identita-b.pdf"),
  ],
  attachmentBlob: [
    {
      attachment_id: "11111111-ae00-4000-8000-00000000000a",
      content: Buffer.from("SEGRETO-A"),
    },
    {
      attachment_id: "11111111-ae00-4000-8000-00000000000b",
      content: Buffer.from("SEGRETO-B"),
    },
  ],
  auditLog: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

test("PP-03 · l'elenco allegati non porta il documento di un atleta fuori dal perimetro", async () => {
  const righe = await allegati.listAttachments(
    { organizationId: CLUB },
    scopeAllenatore(),
  );

  assert.deepEqual(
    righe.map((riga) => riga.ownerId).sort(),
    [ATLETA_A],
    "l'elenco porta l'owner_id di un atleta fuori categoria: la chiave d'ingresso di ogni altra porta",
  );
});

test("PP-03 · la direzione continua a vedere tutti gli allegati", async () => {
  /*
    Il verso opposto: il recinto dell'allenatore non deve restringere chi
    allenatore non e. `athleteIdsWithinTrainerPerimeter` torna `null` per loro,
    e `null` non e l'insieme vuoto.
  */
  const righe = await allegati.listAttachments(
    { organizationId: CLUB },
    scopeDirezione(),
  );

  assert.equal(righe.length, 2);
});

test("PP-03 · i byte di un allegato fuori perimetro sono negati", async () => {
  await assert.rejects(
    () =>
      allegati.readAttachment(
        "11111111-ae00-4000-8000-00000000000b",
        scopeAllenatore(),
      ),
    /Accesso negato/,
    "i byte del documento di un minore di un'altra categoria sono usciti",
  );

  /* Il proprio resta leggibile: la difesa non deve rompere il caso legittimo. */
  const suo = await allegati.readAttachment(
    "11111111-ae00-4000-8000-00000000000a",
    scopeAllenatore(),
  );
  assert.equal(suo?.metadata.fileName, "identita-a.pdf");
});
