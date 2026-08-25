import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * Il contratto degli allegati, lato modello (Blocco 8, WP-15).
 *
 * Quello che questi test difendono e una promessa sola: **un allegato caricato
 * prima del Blocco 8 continua a funzionare**. La forma nuova (un riferimento
 * `attachment:<id>`) e quella vecchia (un data URL dentro il record) devono
 * passare dalla stessa funzione e uscirne classificate, senza che nessun
 * pulsante debba sapere quale delle due ha in mano.
 */

let mod;

before(async () => {
  mod = await import("../../src/lib/attachments.ts");
});

test("un riferimento si costruisce e si rilegge", () => {
  const id = "2f1c0000-0000-4000-8000-000000000001";
  const reference = mod.buildAttachmentReference(id);

  assert.equal(reference, `attachment:${id}`);
  assert.equal(mod.parseAttachmentReference(reference), id);
  assert.equal(mod.isAttachmentReference(reference), true);
});

test("anche l'URL dell'endpoint vale come riferimento", () => {
  const id = "2f1c0000-0000-4000-8000-000000000002";
  assert.equal(
    mod.parseAttachmentReference(`/api/v1/attachments/${id}`),
    id,
  );
  assert.equal(
    mod.parseAttachmentReference(`/api/v1/attachments/${id}?download=x.pdf`),
    id,
  );
});

test("un data URL legacy non viene scambiato per un riferimento", () => {
  const legacy = "data:application/pdf;base64,JVBERi0xLjQK";
  assert.equal(mod.parseAttachmentReference(legacy), "");
  assert.equal(mod.isAttachmentReference(legacy), false);
});

test("resolveAttachmentSource classifica le quattro forme", () => {
  const id = "2f1c0000-0000-4000-8000-000000000003";

  assert.equal(mod.resolveAttachmentSource("").kind, "empty");
  assert.equal(mod.resolveAttachmentSource(null).kind, "empty");

  const reference = mod.resolveAttachmentSource(`attachment:${id}`);
  assert.equal(reference.kind, "reference");
  assert.equal(reference.id, id);
  assert.equal(reference.href, `/api/v1/attachments/${id}`);

  const legacy = mod.resolveAttachmentSource(
    "data:image/png;base64,iVBORw0KGgo=",
  );
  assert.equal(legacy.kind, "legacy-inline");
  assert.equal(legacy.mimeType, "image/png");

  const remote = mod.resolveAttachmentSource("https://esempio.it/f.pdf");
  assert.equal(remote.kind, "remote");
  assert.equal(remote.href, "https://esempio.it/f.pdf");
});

test("hasAttachment e vero per legacy e per riferimento, falso per vuoto", () => {
  assert.equal(mod.hasAttachment("data:application/pdf;base64,AAAA"), true);
  assert.equal(
    mod.hasAttachment("attachment:2f1c0000-0000-4000-8000-000000000004"),
    true,
  );
  assert.equal(mod.hasAttachment("   "), false);
});

test("l'URL di download porta il nome leggibile", () => {
  const id = "2f1c0000-0000-4000-8000-000000000005";
  assert.equal(
    mod.buildAttachmentUrl(id, { download: "BLSD_Rossi_Mario_2026-08-25.pdf" }),
    `/api/v1/attachments/${id}?download=BLSD_Rossi_Mario_2026-08-25.pdf`,
  );
});

test("la validazione rifiuta cio che non e un documento", () => {
  const eseguibile = mod.validateAttachmentInput({
    mimeType: "application/x-msdownload",
    sizeBytes: 1024,
    fileName: "setup.exe",
  });
  assert.equal(eseguibile.ok, false);
  assert.match(eseguibile.message, /non ammesso/i);

  const vuoto = mod.validateAttachmentInput({
    mimeType: "application/pdf",
    sizeBytes: 0,
  });
  assert.equal(vuoto.ok, false);

  const troppoGrande = mod.validateAttachmentInput({
    mimeType: "application/pdf",
    sizeBytes: mod.MAX_ATTACHMENT_BYTES + 1,
  });
  assert.equal(troppoGrande.ok, false);
  assert.match(troppoGrande.message, /limite/i);

  const buono = mod.validateAttachmentInput({
    mimeType: "application/pdf",
    sizeBytes: 512_000,
    fileName: "certificato.pdf",
  });
  assert.equal(buono.ok, true);
});

test("il MIME viene normalizzato, non copiato", () => {
  const result = mod.validateAttachmentInput({
    mimeType: "  APPLICATION/PDF  ",
    sizeBytes: 100,
  });
  assert.equal(result.ok, true);
  assert.equal(result.mimeType, "application/pdf");
});

test("solo i tipi dichiarati sono proprietari validi di un allegato", () => {
  assert.equal(mod.isAttachmentOwnerType("athlete"), true);
  assert.equal(mod.isAttachmentOwnerType("TRAINER"), true);
  assert.equal(mod.isAttachmentOwnerType("qualcosa"), false);
  assert.equal(mod.isAttachmentOwnerType(""), false);
});
