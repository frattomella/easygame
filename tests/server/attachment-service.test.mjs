import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Il servizio allegati, a runtime (Blocco 8, WP-15).
 *
 * Due cose vanno dimostrate, non affermate:
 *
 * 1. **l'isolamento multi-tenant**. Un allegato e un file: se il confine
 *    perde, esce un certificato medico. Ogni operazione — leggere i metadati,
 *    leggere i byte, sostituire, cancellare, elencare — viene provata dal
 *    club sbagliato e deve fallire con «Accesso negato», che e la stringa da
 *    cui il route handler ricava il 403;
 * 2. **i byte non stanno nella riga dei metadati**. E il difetto che WP-15
 *    esiste per chiudere: se un giorno qualcuno aggiungesse il contenuto al
 *    `select`, elencare gli allegati tornerebbe a costare quanto scaricarli.
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";
const ATT_A = "11111111-0000-4000-8000-00000000000a";
const ATT_B = "22222222-0000-4000-8000-00000000000b";

const scopeA = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB_A,
  allowedOrganizationIds: [CLUB_A],
});

const scopeB = () => ({
  userId: "user-b",
  activeOrganizationId: CLUB_B,
  allowedOrganizationIds: [CLUB_B],
});

let service;
let setPrismaClientForTests;
let fake;

const row = (id, organizationId) => ({
  id,
  organization_id: organizationId,
  owner_type: "athlete",
  owner_id: `atleta-${id}`,
  category: "certificato-medico",
  file_name: "certificato.pdf",
  mime_type: "application/pdf",
  size_bytes: 1234,
  checksum: "abc",
  storage_driver: "database",
  storage_key: null,
  created_by: null,
  created_at: new Date("2026-08-25T10:00:00Z"),
  updated_at: new Date("2026-08-25T10:00:00Z"),
});

const seed = () => ({
  attachment: [row(ATT_A, CLUB_A), row(ATT_B, CLUB_B)],
  attachmentBlob: [
    { attachment_id: ATT_A, content: Buffer.from("club A") },
    { attachment_id: ATT_B, content: Buffer.from("club B") },
  ],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  service = await import("../../src/lib/server/attachments.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const rejects = (promise, pattern) =>
  assert.rejects(promise, (error) => {
    assert.match(String(error.message), pattern);
    return true;
  });

/* ------------------------------------------------------- isolamento tenant */

test("i metadati di un altro club non si leggono", async () => {
  await rejects(
    service.getAttachmentMetadata(ATT_B, scopeA()),
    /Accesso negato/,
  );
});

test("i byte di un altro club non si leggono", async () => {
  await rejects(service.readAttachment(ATT_B, scopeA()), /Accesso negato/);
});

test("un allegato di un altro club non si sostituisce", async () => {
  await rejects(
    service.replaceAttachmentContent(
      ATT_B,
      {
        fileName: "nuovo.pdf",
        mimeType: "application/pdf",
        content: Buffer.from("intruso"),
      },
      scopeA(),
    ),
    /Accesso negato/,
  );

  const blob = fake.rows("attachmentBlob").find((r) => r.attachment_id === ATT_B);
  assert.equal(blob.content.toString(), "club B");
});

test("un allegato di un altro club non si cancella", async () => {
  await rejects(service.deleteAttachment(ATT_B, scopeA()), /Accesso negato/);
  assert.equal(fake.rows("attachment").length, 2);
});

test("l'elenco e sempre filtrato sul club dello scope", async () => {
  const listed = await service.listAttachments({}, scopeA());
  assert.deepEqual(
    listed.map((item) => item.id),
    [ATT_A],
  );

  const call = fake.lastCall("attachment", "findMany");
  assert.equal(call.args.where.organization_id, CLUB_A);
});

test("chiedere l'elenco di un altro club e un accesso negato", async () => {
  await rejects(
    service.listAttachments({ organizationId: CLUB_B }, scopeA()),
    /Accesso negato/,
  );
});

test("un caricamento non puo dichiarare il club di qualcun altro", async () => {
  await rejects(
    service.createAttachment(
      {
        organizationId: CLUB_B,
        ownerType: "athlete",
        ownerId: "atleta-x",
        category: "documento",
        fileName: "doc.pdf",
        mimeType: "application/pdf",
        content: Buffer.from("x"),
      },
      scopeA(),
    ),
    /Accesso negato/,
  );
});

/* ------------------------------------------------- i byte fuori dai metadati */

test("leggere i metadati non tocca mai la colonna del contenuto", async () => {
  await service.listAttachments({}, scopeA());
  await service.getAttachmentMetadata(ATT_A, scopeA());

  const selects = fake.calls
    .filter((call) => call.delegate === "attachment")
    .map((call) => call.args?.select)
    .filter(Boolean);

  assert.ok(selects.length >= 2);
  for (const select of selects) {
    assert.equal("content" in select, false);
    assert.equal("blob" in select, false);
  }
});

test("il contenuto si legge da una tabella separata, e solo quando serve", async () => {
  const result = await service.readAttachment(ATT_A, scopeA());
  assert.equal(result.content.toString(), "club A");

  const blobCall = fake.lastCall("attachmentBlob", "findUnique");
  assert.ok(blobCall, "il contenuto deve arrivare da attachment_blobs");
});

/* ---------------------------------------------------------------- scrittura */

test("un caricamento scrive metadati e byte, con checksum e dimensione", async () => {
  const content = Buffer.from("un certificato");

  const metadata = await service.createAttachment(
    {
      ownerType: "athlete",
      ownerId: "atleta-1",
      category: "certificato-medico",
      fileName: "cert.pdf",
      mimeType: "application/pdf",
      content,
    },
    scopeA(),
  );

  assert.equal(metadata.organizationId, CLUB_A);
  assert.equal(metadata.sizeBytes, content.length);
  assert.equal(metadata.reference, `attachment:${metadata.id}`);
  assert.match(metadata.checksum, /^[0-9a-f]{64}$/);

  const stored = fake
    .rows("attachmentBlob")
    .find((r) => r.attachment_id === metadata.id);
  assert.equal(stored.content.toString(), "un certificato");
});

test("un tipo non ammesso non viene mai scritto", async () => {
  await rejects(
    service.createAttachment(
      {
        ownerType: "athlete",
        ownerId: "atleta-1",
        category: "documento",
        fileName: "setup.exe",
        mimeType: "application/x-msdownload",
        content: Buffer.from("MZ"),
      },
      scopeA(),
    ),
    /non ammesso/i,
  );

  assert.equal(fake.rows("attachment").length, 2);
});

test("un proprietario sconosciuto viene rifiutato", async () => {
  await rejects(
    service.createAttachment(
      {
        ownerType: "sconosciuto",
        ownerId: "x",
        category: "documento",
        fileName: "a.pdf",
        mimeType: "application/pdf",
        content: Buffer.from("a"),
      },
      scopeA(),
    ),
    /non ammesso/i,
  );
});

test("la sostituzione mantiene l'id: il riferimento salvato resta valido", async () => {
  const metadata = await service.replaceAttachmentContent(
    ATT_A,
    {
      fileName: "aggiornato.pdf",
      mimeType: "application/pdf",
      content: Buffer.from("versione nuova"),
    },
    scopeA(),
  );

  assert.equal(metadata.id, ATT_A);
  assert.equal(metadata.reference, `attachment:${ATT_A}`);
  assert.equal(metadata.fileName, "aggiornato.pdf");

  const blob = fake.rows("attachmentBlob").find((r) => r.attachment_id === ATT_A);
  assert.equal(blob.content.toString(), "versione nuova");
});

test("cancellare rimuove sia i metadati sia i byte", async () => {
  assert.equal(await service.deleteAttachment(ATT_A, scopeA()), true);

  assert.equal(
    fake.rows("attachment").some((r) => r.id === ATT_A),
    false,
  );
  assert.equal(
    fake.rows("attachmentBlob").some((r) => r.attachment_id === ATT_A),
    false,
  );
});

test("cancellare un allegato che non esiste non e un errore", async () => {
  assert.equal(
    await service.deleteAttachment("00000000-0000-4000-8000-000000000000", scopeA()),
    false,
  );
});

/* ------------------------------------------------------- migrazione legacy */

test("un data URL legacy diventa un allegato senza perdere i byte", async () => {
  const original = Buffer.from("%PDF-1.4 contenuto");
  const dataUrl = `data:application/pdf;base64,${original.toString("base64")}`;

  const metadata = await service.importLegacyDataUrl(
    dataUrl,
    {
      ownerType: "athlete",
      ownerId: "atleta-legacy",
      category: "certificato-medico",
      fileName: "vecchio.pdf",
    },
    scopeA(),
  );

  assert.ok(metadata);
  assert.equal(metadata.sizeBytes, original.length);

  const blob = fake
    .rows("attachmentBlob")
    .find((r) => r.attachment_id === metadata.id);
  assert.equal(blob.content.toString(), original.toString());
});

test("un valore che non e un data URL non viene importato", async () => {
  assert.equal(
    await service.importLegacyDataUrl("https://esempio.it/f.pdf", {
      ownerType: "athlete",
      ownerId: "x",
      category: "documento",
    }),
    null,
  );
});

/* --------------------------------------------------------- driver di storage */

test("il servizio non dipende dal driver: un driver esterno lo sostituisce", async () => {
  const altrove = new Map();
  service.registerStorageDriver({
    name: "test-remoto",
    async put(id, content) {
      altrove.set(id, content);
      return { storageKey: `remoto/${id}` };
    },
    async get(id) {
      return altrove.get(id) || null;
    },
    async remove(id) {
      altrove.delete(id);
    },
  });

  service.setActiveStorageDriver("test-remoto");
  try {
    const metadata = await service.createAttachment(
      {
        ownerType: "athlete",
        ownerId: "atleta-2",
        category: "documento",
        fileName: "d.pdf",
        mimeType: "application/pdf",
        content: Buffer.from("altrove"),
      },
      scopeA(),
    );

    // Nessun blob in database: i byte sono andati dove dice il driver.
    assert.equal(
      fake.rows("attachmentBlob").some((r) => r.attachment_id === metadata.id),
      false,
    );
    assert.equal(altrove.get(metadata.id).toString(), "altrove");

    const read = await service.readAttachment(metadata.id, scopeA());
    assert.equal(read.content.toString(), "altrove");
  } finally {
    service.setActiveStorageDriver("database");
  }
});

test("un allegato scritto con il driver database resta leggibile dopo il cambio", async () => {
  service.registerStorageDriver({
    name: "test-vuoto",
    async put() {
      return { storageKey: null };
    },
    async get() {
      return null;
    },
    async remove() {},
  });

  service.setActiveStorageDriver("test-vuoto");
  try {
    const read = await service.readAttachment(ATT_A, scopeA());
    assert.equal(read.content.toString(), "club A");
  } finally {
    service.setActiveStorageDriver("database");
  }
});
