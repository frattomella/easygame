import assert from "node:assert/strict";
import test from "node:test";

import {
  announcementShelf,
  isAnnouncementDueForPublication,
  isAnnouncementVisible,
  normalizeAnnouncementDraft,
  readAnnouncement,
  sortAnnouncements,
} from "../../src/lib/announcements/model.ts";

/**
 * La bacheca: il dominio (W2-D, G-08).
 *
 * **Cio che si prova qui e la finestra di validita**, perche e la sola cosa
 * che distingue un annuncio da una notifica: un avviso ha un momento in cui
 * esce e uno in cui smette di contare, e sbagliarne uno dei due significa o
 * non mostrarlo mai o mostrarlo per sempre.
 */

const ORA = new Date("2026-10-05T10:00:00Z");

const annuncio = (overrides = {}) => ({
  id: "ann-1",
  title: "Campo chiuso domenica",
  body: "Il campo restera chiuso.",
  status: "published",
  publishAt: null,
  expiresAt: null,
  publishedAt: "2026-10-01T09:00:00.000Z",
  criteria: [{ kind: "all_families" }],
  attachmentIds: [],
  authorUserId: null,
  createdAt: null,
  updatedAt: null,
  ...overrides,
});

// --- la bozza --------------------------------------------------------------

test("un annuncio senza titolo o senza testo non si pubblica", () => {
  assert.throws(
    () => normalizeAnnouncementDraft({ body: "x", criteria: [{ kind: "all_families" }] }),
    /titolo/,
  );
  assert.throws(
    () => normalizeAnnouncementDraft({ title: "x", criteria: [{ kind: "all_families" }] }),
    /testo/,
  );
});

test("un annuncio senza destinatari non si pubblica", () => {
  assert.throws(
    () => normalizeAnnouncementDraft({ title: "x", body: "y", criteria: [] }),
    /destinatari/,
  );
});

test("una scadenza prima della pubblicazione fa fallire invece di sparire", () => {
  assert.throws(
    () =>
      normalizeAnnouncementDraft({
        title: "x",
        body: "y",
        criteria: [{ kind: "all_families" }],
        publishAt: "2026-10-10T00:00:00Z",
        expiresAt: "2026-10-01T00:00:00Z",
      }),
    /dopo la pubblicazione/,
  );
});

test("gli allegati si deduplicano e le date si normalizzano in ISO", () => {
  const bozza = normalizeAnnouncementDraft({
    title: "Torneo",
    body: "Modulo allegato",
    criteria: [{ kind: "category_ids", values: ["u14"] }],
    attachmentIds: ["a", "a", "b", ""],
    publishAt: "2026-10-10",
  });

  assert.deepEqual(bozza.attachmentIds, ["a", "b"]);
  assert.equal(bozza.publishAt, "2026-10-10T00:00:00.000Z");
  assert.equal(bozza.expiresAt, null);
});

// --- la finestra di validita ----------------------------------------------

test("una bozza non e mai visibile, nemmeno se la data e passata", () => {
  assert.equal(
    isAnnouncementVisible(
      annuncio({ status: "draft", publishAt: "2026-01-01T00:00:00Z" }),
      ORA,
    ),
    false,
  );
});

test("un annuncio programmato per domani non e ancora visibile", () => {
  assert.equal(
    isAnnouncementVisible(annuncio({ publishAt: "2026-10-06T08:00:00Z" }), ORA),
    false,
  );
});

test("un annuncio scaduto non e visibile ma non e cancellato", () => {
  const scaduto = annuncio({ expiresAt: "2026-10-04T00:00:00Z" });

  assert.equal(isAnnouncementVisible(scaduto, ORA), false);
  assert.equal(announcementShelf(scaduto, ORA), "expired");
});

test("un annuncio senza scadenza resta visibile", () => {
  assert.equal(isAnnouncementVisible(annuncio(), ORA), true);
  assert.equal(announcementShelf(annuncio(), ORA), "current");
});

// --- la pubblicazione programmata -----------------------------------------

test("una bozza con data passata e matura per il giro notturno", () => {
  assert.equal(
    isAnnouncementDueForPublication(
      annuncio({ status: "draft", publishAt: "2026-10-05T08:00:00Z" }),
      ORA,
    ),
    true,
  );
});

test("una bozza con data futura non e matura", () => {
  assert.equal(
    isAnnouncementDueForPublication(
      annuncio({ status: "draft", publishAt: "2026-10-06T08:00:00Z" }),
      ORA,
    ),
    false,
  );
});

test("un annuncio gia pubblicato non e mai maturo: la seconda esecuzione non ripubblica", () => {
  assert.equal(
    isAnnouncementDueForPublication(
      annuncio({ status: "published", publishAt: "2026-10-05T08:00:00Z" }),
      ORA,
    ),
    false,
  );
});

test("una bozza senza data non parte da sola", () => {
  assert.equal(
    isAnnouncementDueForPublication(annuncio({ status: "draft" }), ORA),
    false,
  );
});

// --- la lettura ------------------------------------------------------------

test("la riga di archivio si legge in entrambe le grafie", () => {
  const letto = readAnnouncement({
    id: "ann-9",
    name: "Titolo dalla colonna",
    status: "published",
    date: new Date("2026-10-02T00:00:00Z"),
    payload: { body: "corpo" },
    created_at: new Date("2026-10-01T00:00:00Z"),
  });

  assert.equal(letto.title, "Titolo dalla colonna");
  assert.equal(letto.body, "corpo");
  assert.equal(letto.publishAt, "2026-10-02T00:00:00.000Z");
});

test("la bacheca si legge dal piu recente", () => {
  const ordinati = sortAnnouncements([
    annuncio({ id: "vecchio", publishedAt: "2026-09-01T00:00:00.000Z" }),
    annuncio({ id: "nuovo", publishedAt: "2026-10-01T00:00:00.000Z" }),
  ]);

  assert.deepEqual(
    ordinati.map((row) => row.id),
    ["nuovo", "vecchio"],
  );
});
