import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Firma e timbro del presidente, a runtime (W1-E).
 *
 * Quattro cose vanno dimostrate, non affermate:
 *
 * 1. **il file passa da Attachment Core.** L'allegato nasce con
 *    `owner_type: "club"` e nel record del club finisce un **riferimento**,
 *    non un data URL. E il difetto che WP-15 chiude, e il logo del club
 *    (`clubs.logo_url`, ancora base64) e la prova che si ripete da solo se
 *    nessuno lo verifica;
 * 2. **sostituire non lascia rifiuti.** Caricare una firma nuova toglie di
 *    mezzo la precedente: due firme per un club sono una firma e una che
 *    nessuno sa piu perche c'e;
 * 3. **l'isolamento multi-tenant.** La firma di un altro club non si legge,
 *    non si scrive e non si cancella, e il messaggio contiene «Accesso
 *    negato», che e la stringa da cui il route handler ricava il 403;
 * 4. **i limiti sono piu stretti di quelli degli allegati.** Un PDF non e una
 *    firma, e 5 MB dentro un documento HTML non sono una firma: entrambi
 *    passerebbero il controllo di Attachment Core.
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

const png = (text) => Buffer.from(`\x89PNG\r\n\x1a\n${text}`);

const attachmentRow = (id, organizationId, category) => ({
  id,
  organization_id: organizationId,
  owner_type: "club",
  owner_id: organizationId,
  category,
  file_name: "firma.png",
  mime_type: "image/png",
  size_bytes: 12,
  checksum: `checksum-${id}`,
  storage_driver: "database",
  storage_key: null,
  created_by: null,
  created_at: new Date("2026-08-25T10:00:00Z"),
  updated_at: new Date("2026-08-25T10:00:00Z"),
});

const seed = () => ({
  club: [
    {
      id: CLUB_A,
      slug: "club-a",
      name: "Club A",
      settings: {
        companyEmail: "a@example.com",
        presidentSignature: `attachment:${ATT_A}`,
      },
    },
    {
      id: CLUB_B,
      slug: "club-b",
      name: "Club B",
      settings: { presidentSignature: `attachment:${ATT_B}` },
    },
  ],
  attachment: [
    attachmentRow(ATT_A, CLUB_A, "president_signature"),
    attachmentRow(ATT_B, CLUB_B, "president_signature"),
  ],
  attachmentBlob: [
    { attachment_id: ATT_A, content: png("firma A") },
    { attachment_id: ATT_B, content: png("firma B") },
  ],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  service = await import("../../src/lib/server/club-signature.ts");
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

const settingsOf = (clubId) =>
  fake.rows("club").find((row) => row.id === clubId)?.settings || {};

/* --------------------------------------------------------------- scrittura */

test("salvare il timbro crea un allegato del club e ne scrive il riferimento", async () => {
  const saved = await service.saveClubSignature(
    {
      organizationId: CLUB_A,
      kind: "stamp",
      fileName: "timbro.png",
      mimeType: "image/png",
      content: png("timbro A"),
    },
    scopeA(),
  );

  const created = fake
    .rows("attachment")
    .find((row) => row.category === "president_stamp");

  assert.ok(created, "l'allegato deve esistere");
  assert.equal(created.owner_type, "club");
  assert.equal(created.owner_id, CLUB_A);
  assert.equal(created.organization_id, CLUB_A);
  assert.equal(created.mime_type, "image/png");

  const settings = settingsOf(CLUB_A);
  assert.equal(settings.presidentStamp, `attachment:${created.id}`);
  assert.equal(saved.reference, `attachment:${created.id}`);

  // La chiave delle altre schede non viene portata via dalla scrittura.
  assert.equal(settings.companyEmail, "a@example.com");
  assert.equal(settings.presidentSignature, `attachment:${ATT_A}`);
});

test("il riferimento nelle impostazioni non e mai un data URL", async () => {
  await service.saveClubSignature(
    {
      organizationId: CLUB_A,
      kind: "stamp",
      fileName: "timbro.png",
      mimeType: "image/png",
      content: png("timbro A"),
    },
    scopeA(),
  );

  const settings = settingsOf(CLUB_A);
  for (const key of ["presidentSignature", "presidentStamp"]) {
    assert.match(String(settings[key]), /^attachment:/);
    assert.doesNotMatch(String(settings[key]), /^data:/);
  }
});

test("sostituire la firma rimuove l'allegato precedente", async () => {
  await service.saveClubSignature(
    {
      organizationId: CLUB_A,
      kind: "signature",
      fileName: "firma-nuova.png",
      mimeType: "image/png",
      content: png("firma nuova"),
    },
    scopeA(),
  );

  const remaining = fake
    .rows("attachment")
    .filter((row) => row.organization_id === CLUB_A);

  assert.equal(remaining.length, 1, "una sola firma per club");
  assert.notEqual(remaining[0].id, ATT_A);
  assert.equal(
    settingsOf(CLUB_A).presidentSignature,
    `attachment:${remaining[0].id}`,
  );
  assert.equal(
    fake.rows("attachmentBlob").some((row) => row.attachment_id === ATT_A),
    false,
    "anche i byte del vecchio allegato vanno via",
  );
});

/* ------------------------------------------------------- isolamento tenant */

test("la firma di un altro club non si legge", async () => {
  await rejects(
    service.getClubSignature(CLUB_B, "signature", scopeA()),
    /Accesso negato/,
  );
  await rejects(
    service.readClubSignatureImage(CLUB_B, "signature", scopeA()),
    /Accesso negato/,
  );
});

test("la firma di un altro club non si scrive ne si cancella", async () => {
  await rejects(
    service.saveClubSignature(
      {
        organizationId: CLUB_B,
        kind: "signature",
        fileName: "intrusa.png",
        mimeType: "image/png",
        content: png("intrusa"),
      },
      scopeA(),
    ),
    /Accesso negato/,
  );

  await rejects(
    service.deleteClubSignature(CLUB_B, "signature", scopeA()),
    /Accesso negato/,
  );

  assert.equal(settingsOf(CLUB_B).presidentSignature, `attachment:${ATT_B}`);
  assert.equal(
    fake.rows("attachment").some((row) => row.id === ATT_B),
    true,
  );
});

/* ----------------------------------------------------------------- limiti */

test("un PDF non e una firma", async () => {
  await rejects(
    service.saveClubSignature(
      {
        organizationId: CLUB_A,
        kind: "signature",
        fileName: "firma.pdf",
        mimeType: "application/pdf",
        content: Buffer.from("%PDF-1.4"),
      },
      scopeA(),
    ),
    /non ammesso/i,
  );

  // Attachment Core accetterebbe il PDF: la stretta e nostra, e deve restare.
  assert.equal(settingsOf(CLUB_A).presidentSignature, `attachment:${ATT_A}`);
});

test("un'immagine oltre il limite dedicato viene rifiutata", async () => {
  await rejects(
    service.saveClubSignature(
      {
        organizationId: CLUB_A,
        kind: "signature",
        fileName: "enorme.png",
        mimeType: "image/png",
        // Sotto i 10 MB di Attachment Core, sopra i 2 MB di una firma.
        content: Buffer.alloc(3 * 1024 * 1024, 1),
      },
      scopeA(),
    ),
    /supera il limite/i,
  );

  assert.equal(
    fake.rows("attachment").filter((row) => row.organization_id === CLUB_A)
      .length,
    1,
  );
});

test("un tipo che non e ne firma ne timbro viene rifiutato", async () => {
  await rejects(
    service.getClubSignature(CLUB_A, "logo", scopeA()),
    /signature.*stamp/is,
  );
});

/* ------------------------------------------------------------- eliminazione */

test("cancellare toglie il riferimento e l'allegato", async () => {
  const removed = await service.deleteClubSignature(
    CLUB_A,
    "signature",
    scopeA(),
  );

  assert.equal(removed, true);
  assert.equal(settingsOf(CLUB_A).presidentSignature, "");
  assert.equal(
    fake.rows("attachment").some((row) => row.id === ATT_A),
    false,
  );
  assert.equal(
    fake.rows("attachmentBlob").some((row) => row.attachment_id === ATT_A),
    false,
  );
});

test("cancellare quello che non c'e non e un errore", async () => {
  assert.equal(
    await service.deleteClubSignature(CLUB_A, "stamp", scopeA()),
    false,
  );
});

/* -------------------------------------------- contratto del generatore doc */

test("readClubSignatureImage consegna i byte e il data URL da incorporare", async () => {
  const image = await service.readClubSignatureImage(
    CLUB_B,
    "signature",
    scopeB(),
  );

  assert.ok(image, "la firma del proprio club si legge");
  assert.equal(image.metadata.mimeType, "image/png");
  assert.equal(image.content.toString(), png("firma B").toString());
  assert.equal(
    image.dataUrl,
    `data:image/png;base64,${png("firma B").toString("base64")}`,
  );
});

test("un club senza firma restituisce null, non un errore", async () => {
  assert.equal(await service.getClubSignature(CLUB_A, "stamp", scopeA()), null);
  assert.equal(
    await service.readClubSignatureImage(CLUB_A, "stamp", scopeA()),
    null,
  );
});
