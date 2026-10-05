import assert from "node:assert/strict";
import test, { before, beforeEach, after } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Il modulo contatti avvisa il club** (D-WS-13).
 *
 * Prima una richiesta arrivava solo nella casella del gestionale, e nessuno lo
 * sapeva finche non la apriva. Ora, con l'SMTP configurato, parte un'email
 * all'indirizzo del sito o del club. Senza SMTP, o se l'invio fallisce, la
 * richiesta resta salvata comunque: l'avviso non e la richiesta.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-00000000000a";
const SITE = "11111111-0000-4000-8000-0000000000a1";

let inquiries;
let email;
let setPrisma;
let fake;
let sent;

const seed = (identityEmail = "sito@fortitudo.test") => ({
  club: [{ id: CLUB, name: "Fortitudo", contact_email: "club@fortitudo.test" }],
  websiteSite: [{ id: SITE, organization_id: CLUB, settings: { identity: { email: identityEmail } } }],
  websiteInquiry: [],
});

const input = () => ({ name: "Anna Rossi", email: "anna@test.invalid", message: "Vorrei <b>informazioni</b> sui corsi", topic: "Iscrizioni", consent: true, startedAt: 0 });
const target = { siteId: SITE, organizationId: CLUB };

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  ({ __setPrismaClientForTests: setPrisma } = await import("../../src/lib/server/prisma.ts"));
  inquiries = await import("../../src/lib/server/website/inquiries.ts");
  email = await import("../../src/lib/server/email/email-service.ts");
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrisma(fake.client);
  sent = [];
  email.__setEmailProviderForTests({ id: "test", verify: async () => {}, send: async (message) => { sent.push(message); } });
});

after(() => email.__setEmailProviderForTests(undefined));

test("una richiesta nuova manda l'avviso all'indirizzo del sito, con il testo protetto", async () => {
  const result = await inquiries.submitInquiry(target, input());
  assert.equal(result.stored, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "sito@fortitudo.test");
  assert.match(sent[0].subject, /Iscrizioni/);
  assert.ok(!sent[0].html.includes("<b>"), "il messaggio del visitatore non entra come HTML");
  assert.match(sent[0].text, /anna@test\.invalid/);
});

test("senza indirizzo del sito si usa quello del club", async () => {
  fake = createFakePrisma(seed(""));
  setPrisma(fake.client);
  await inquiries.submitInquiry(target, input());
  assert.equal(sent[0].to, "club@fortitudo.test");
});

test("senza SMTP, o con un invio che fallisce, la richiesta resta salvata", async () => {
  email.__setEmailProviderForTests(null);
  assert.equal((await inquiries.submitInquiry(target, input())).stored, true);
  email.__setEmailProviderForTests({ id: "test", verify: async () => {}, send: async () => { throw new Error("SMTP giu"); } });
  assert.equal((await inquiries.submitInquiry(target, input())).stored, true);
  assert.equal(fake.rows("websiteInquiry").length, 2);
});

test("un robot (campo esca) non scrive e non avvisa", async () => {
  const result = await inquiries.submitInquiry(target, { ...input(), website: "http://spam" });
  assert.equal(result.stored, false);
  assert.equal(sent.length, 0);
});
