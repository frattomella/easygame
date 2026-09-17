import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import fs from "node:fs";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Isolamento finanziario fra stagioni (ADR-0196).
 *
 * Il club crea la stagione nuova e ci trova i movimenti della vecchia. Due
 * cause, due chiusure:
 *
 * 1. la prima nota si apriva su «Tutte le stagioni» — ora si apre sulla
 *    stagione attiva, quando il club ne ha una salvata;
 * 2. un movimento manuale nasceva senza stagione e si attribuiva per data —
 *    che con due stagioni sovrapposte lo metteva in entrambe. Ora porta la
 *    stagione della richiesta (`x-active-season-id`), se e una stagione del
 *    club; una stagione dichiarata che il club non ha si rifiuta; una
 *    stagione di contesto sconosciuta o sintetizzata non marca niente.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const CASSA = "cccccccc-0000-4000-8000-000000000001";
const BANCA = "cccccccc-0000-4000-8000-000000000002";
const UTENTE = "11111111-0000-4000-8000-000000000aaa";

const scope = () => ({
  userId: UTENTE,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

const seed = () => ({
  club: [
    {
      id: CLUB,
      slug: "club-a",
      name: "Club A",
      transactions: [],
      transfers: [],
      settings: {
        activeSeasonId: "s-nuova",
        seasons: [
          { id: "s-nuova", label: "2026/27", startDate: "2026-09-01", endDate: "2027-08-31", status: "active" },
          { id: "s-vecchia", label: "2026/2027", startDate: "2026-07-01", endDate: "2027-06-30", status: "archived" },
        ],
      },
    },
  ],
  financialAccount: [
    { id: CASSA, organization_id: CLUB, name: "Cassa", kind: "CASH", is_archived: false },
    { id: BANCA, organization_id: CLUB, name: "Banca", kind: "BANK", is_archived: false },
  ],
  fiscalOperationType: [
    { id: "ft-1", organization_id: CLUB, code: "affitto_impianto", label: "Affitto impianto", activity_scope: "institutional", is_active: true },
  ],
  accountingEntry: [],
});

let accounting;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  accounting = await import("../../src/lib/server/accounting.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import("../../src/lib/server/prisma.ts"));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const movimento = (over = {}) => ({
  entryDate: "2026-09-15T00:00:00.000Z",
  direction: "OUT",
  amount: 150,
  financialAccountId: CASSA,
  operationTypeCode: "affitto_impianto",
  description: "Affitto palestra settembre",
  ...over,
});

test("un movimento registrato nella stagione attiva porta quella stagione anche senza dichiararla", async () => {
  const riga = await accounting.createAccountingEntry(movimento({ activeSeasonId: "s-nuova" }), scope());
  assert.equal(riga.season_id, "s-nuova");
});

test("la stagione dichiarata vince sul contesto", async () => {
  const riga = await accounting.createAccountingEntry(
    movimento({ seasonId: "s-vecchia", activeSeasonId: "s-nuova" }),
    scope(),
  );
  assert.equal(riga.season_id, "s-vecchia");
});

test("una stagione dichiarata che il club non ha si rifiuta", async () => {
  await assert.rejects(
    accounting.createAccountingEntry(movimento({ seasonId: "s-inventata" }), scope()),
    /non e fra quelle configurate/,
  );
  assert.equal(fake.rows("accountingEntry").length, 0);
});

test("una stagione di contesto sconosciuta (segnalibro vecchio) ricade sull'attiva, come il risolutore canonico (ADR-0197 §2)", async () => {
  const riga = await accounting.createAccountingEntry(movimento({ activeSeasonId: "segnalibro-vecchio" }), scope());
  assert.equal(riga.season_id, "s-nuova");
});

test("senza nessun contesto (chiamante interno) la riga resta senza stagione", async () => {
  const riga = await accounting.createAccountingEntry(movimento({}), scope());
  assert.equal(riga.season_id, null);
});

test("la stagione sintetizzata di un club senza stagioni non marca niente", async () => {
  fake.rows("club")[0].settings = {};
  const riga = await accounting.createAccountingEntry(movimento({ activeSeasonId: "season-2026-2027" }), scope());
  assert.equal(riga.season_id, null);
});

test("il giroconto porta la stagione della richiesta su entrambe le gambe", async () => {
  const esito = await accounting.createInternalTransfer(
    { entryDate: "2026-09-20T00:00:00.000Z", amount: 500, fromAccountId: CASSA, toAccountId: BANCA, activeSeasonId: "s-nuova" },
    scope(),
  );
  assert.deepEqual(
    esito.entries.map((riga) => riga.season_id),
    ["s-nuova", "s-nuova"],
  );
});

test("con due stagioni sovrapposte il movimento marcato compare solo nella sua", async () => {
  await accounting.createAccountingEntry(movimento({ activeSeasonId: "s-nuova" }), scope());
  const PIENI = { manage: true, reverse: true, reconcile: true };

  const nuova = await accounting.listAccountingEntries({ seasonId: "s-nuova" }, scope(), PIENI);
  const vecchia = await accounting.listAccountingEntries({ seasonId: "s-vecchia" }, scope(), PIENI);

  assert.equal(nuova.total, 1);
  /* 15 settembre 2026 cade nella finestra di entrambe: senza marchio la riga sarebbe apparsa anche qui. */
  assert.equal(vecchia.total, 0);
});

test("la rotta passa la stagione della richiesta al dominio, per movimento e giroconto", () => {
  const rotta = fs.readFileSync("src/app/api/v1/accounting/entries/route.ts", "utf8");
  assert.equal((rotta.match(/activeSeasonId: request\.headers\.get\("x-active-season-id"\)/g) || []).length, 2);
});

test("la prima nota si apre sulla stagione attiva del club, non su «Tutte»", () => {
  const pagina = fs.readFileSync("src/app/movements/page.tsx", "utf8");
  assert.match(pagina, /seasonPerimeterReady/);
  assert.match(pagina, /!seasonState\.isFallback && seasonState\.activeSeasonId/);
  /* La lettura aspetta il perimetro: niente elenco su «tutte» seguito da uno su «una». */
  assert.match(pagina, /if \(!activeClubId \|\| !canOpen \|\| !seasonPerimeterReady\) return;/);
});
