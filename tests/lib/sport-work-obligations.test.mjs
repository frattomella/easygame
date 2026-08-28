import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCuDataset,
  buildF24Dataset,
  deriveObligations,
} from "../../src/lib/sport-work/obligations.ts";

/**
 * L'agenda degli adempimenti e i dataset che ne escono.
 *
 * Tre cose vanno dimostrate.
 *
 * 1. **La derivazione e idempotente.** Rieseguirla ogni notte non deve creare
 *    una seconda riga per la stessa scadenza: un promemoria duplicato e il
 *    modo piu rapido per far disattivare le notifiche.
 * 2. **Ogni adempimento ha un termine calcolato dalle regole dell'anno**, non
 *    da una costante nascosta.
 * 3. **EasyGame produce l'input dell'adempimento, non l'adempimento.** I
 *    testi lo dicono, perche e li che una segreteria lo legge.
 */

const NOW = new Date("2026-10-05T00:00:00Z");

const rapporto = (overrides = {}) => ({
  id: "rel-1",
  person_id: "per-1",
  person_name: "Marco Rossi",
  relationship_type: "SPORT_COCOCO",
  status: "ACTIVE",
  start_date: "2026-09-01",
  end_date: "2027-06-30",
  ...overrides,
});

const erogazione = (overrides = {}) => ({
  id: "pay-1",
  person_id: "per-1",
  relationship_id: "rel-1",
  transaction_type: "COMPENSATION_PAYMENT",
  paid_at: "2026-09-30T00:00:00.000Z",
  fiscal_year: 2026,
  gross_amount: 6000,
  employee_contribution: 45.05,
  employer_contribution: 90.1,
  reversed_at: null,
  ...overrides,
});

const derive = (overrides = {}) =>
  deriveObligations({
    relationships: [rapporto()],
    payouts: [],
    declarations: [],
    now: NOW,
    ...overrides,
  });

const byKind = (rows, kind) => rows.filter((row) => row.kind === kind);

// --- idempotenza -----------------------------------------------------------------

test("due derivazioni sugli stessi dati producono le stesse chiavi", () => {
  const input = {
    relationships: [rapporto()],
    payouts: [erogazione()],
    declarations: [],
    now: NOW,
  };

  const first = deriveObligations(input).map((row) => row.referenceKey);
  const second = deriveObligations(input).map((row) => row.referenceKey);

  assert.deepEqual(first, second);
  assert.equal(new Set(first).size, first.length, "nessuna chiave duplicata");
});

test("due erogazioni nello stesso mese generano un solo F24", () => {
  const rows = derive({
    payouts: [
      erogazione({ id: "a", paid_at: "2026-09-10T00:00:00.000Z" }),
      erogazione({ id: "b", paid_at: "2026-09-30T00:00:00.000Z" }),
    ],
  });

  const f24 = byKind(rows, "F24");
  assert.equal(f24.length, 1);
  assert.equal(f24[0].referenceKey, "f24:2026-09");
  assert.equal(f24[0].amount, 270.3);
  assert.match(f24[0].description, /2 erogazioni/);
});

// --- termini ----------------------------------------------------------------------

test("la comunicazione al RASD scade il 30 del mese successivo all'inizio", () => {
  const [rasd] = byKind(derive(), "RASD_COMMUNICATION");
  assert.equal(rasd.dueDate, "2026-10-30");
  assert.match(rasd.description, /non trasmette|la trasmette una persona/);
});

test("l'F24 scade il 16 del mese successivo all'erogazione", () => {
  const [f24] = byKind(derive({ payouts: [erogazione()] }), "F24");
  assert.equal(f24.dueDate, "2026-10-16");
});

test("un'erogazione di dicembre porta l'F24 a gennaio dell'anno dopo", () => {
  const [f24] = byKind(
    derive({
      payouts: [
        erogazione({ paid_at: "2026-12-20T00:00:00.000Z" }),
      ],
    }),
    "F24",
  );
  assert.equal(f24.referenceKey, "f24:2026-12");
  assert.equal(f24.dueDate, "2027-01-16");
});

test("il contratto in scadenza compare solo entro il preavviso", () => {
  const lontano = derive({
    relationships: [rapporto({ end_date: "2027-06-30" })],
  });
  assert.equal(byKind(lontano, "CONTRACT_EXPIRY").length, 0);

  const vicino = derive({
    relationships: [rapporto({ end_date: "2026-10-20" })],
  });
  assert.equal(byKind(vicino, "CONTRACT_EXPIRY").length, 1);
  assert.equal(byKind(vicino, "CONTRACT_EXPIRY")[0].title, "Contratto in scadenza");
});

test("un contratto gia scaduto chiede rinnovo o cessazione", () => {
  const [scaduto] = byKind(
    derive({ relationships: [rapporto({ end_date: "2026-09-15" })] }),
    "CONTRACT_EXPIRY",
  );
  assert.match(scaduto.title, /scaduto/);
  assert.match(scaduto.description, /e scaduto il 2026-09-15/);
});

test("la CU si prepara entro il 16 marzo dell'anno successivo", () => {
  const [cu] = byKind(derive({ payouts: [erogazione()] }), "CU_PREPARATION");
  assert.equal(cu.referenceKey, "cu:per-1:2026");
  assert.equal(cu.dueDate, "2027-03-16");
  assert.equal(cu.amount, 6000);
  assert.match(cu.description, /la trasmette il consulente/);
});

// --- autocertificazione -------------------------------------------------------------

test("un rapporto senza autocertificazione dell'anno genera l'adempimento", () => {
  const rows = byKind(derive(), "SELF_DECLARATION");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].referenceKey, "selfdecl:per-1:2026");
});

test("con l'autocertificazione l'adempimento sparisce", () => {
  const rows = byKind(
    derive({
      declarations: [
        { person_id: "per-1", fiscal_year: 2026, status: "ACTIVE" },
      ],
    }),
    "SELF_DECLARATION",
  );
  assert.equal(rows.length, 0);
});

test("un'autocertificazione sostituita non vale come presente", () => {
  const rows = byKind(
    derive({
      declarations: [
        { person_id: "per-1", fiscal_year: 2026, status: "SUPERSEDED" },
      ],
    }),
    "SELF_DECLARATION",
  );
  assert.equal(rows.length, 1);
});

// --- perimetro ------------------------------------------------------------------------

test("un rapporto in bozza non genera adempimenti", () => {
  const rows = derive({ relationships: [rapporto({ status: "DRAFT" })] });
  assert.equal(byKind(rows, "RASD_COMMUNICATION").length, 0);
  assert.equal(byKind(rows, "SELF_DECLARATION").length, 0);
});

test("un rapporto con P.IVA non genera la comunicazione al RASD", () => {
  const rows = derive({
    relationships: [rapporto({ relationship_type: "SELF_EMPLOYED_VAT" })],
  });
  assert.equal(byKind(rows, "RASD_COMMUNICATION").length, 0);
  assert.equal(byKind(rows, "SELF_DECLARATION").length, 0);
});

test("un'erogazione senza contributi non genera un F24", () => {
  const rows = derive({
    payouts: [
      erogazione({ employee_contribution: 0, employer_contribution: 0 }),
    ],
  });
  assert.equal(byKind(rows, "F24").length, 0);
});

test("un'erogazione stornata non genera adempimenti", () => {
  const rows = derive({
    payouts: [erogazione({ reversed_at: "2026-10-01T00:00:00.000Z" })],
  });
  assert.equal(byKind(rows, "F24").length, 0);
  assert.equal(byKind(rows, "CU_PREPARATION").length, 0);
});

test("l'agenda esce ordinata per scadenza", () => {
  const rows = derive({ payouts: [erogazione()] });
  const dates = rows.map((row) => row.dueDate);
  assert.deepEqual(dates, [...dates].sort());
});

// --- dataset F24 -------------------------------------------------------------------------

test("l'F24 si raggruppa per periodo e causale", () => {
  const rows = buildF24Dataset([
    erogazione({ id: "a", f24_causale: "CXX", rules_version: "2026" }),
    erogazione({
      id: "b",
      f24_causale: "C10",
      employee_contribution: 40,
      employer_contribution: 80,
      rules_version: "2026",
    }),
    erogazione({
      id: "c",
      paid_at: "2026-10-31T00:00:00.000Z",
      f24_causale: "CXX",
      rules_version: "2026",
    }),
  ]);

  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((row) => `${row.period}/${row.causale}`),
    ["2026-09/C10", "2026-09/CXX", "2026-10/CXX"],
  );
  assert.equal(rows[1].total, 135.15);
  assert.equal(rows[1].dueDate, "2026-10-16");
  assert.equal(rows[2].dueDate, "2026-11-16");
});

// --- dataset CU --------------------------------------------------------------------------

test("la CU aggrega per persona e dichiara cosa manca", () => {
  const rows = buildCuDataset({
    year: 2026,
    people: [
      { id: "per-1", name: "Marco Rossi", fiscal_code: "RSSMRC90A01H501A" },
      { id: "per-2", name: "Anna Bianchi", fiscal_code: null },
    ],
    payouts: [
      erogazione({ id: "a", gross_amount: 6000, taxable_fiscal: 0 }),
      erogazione({
        id: "b",
        person_id: "per-2",
        gross_amount: 18000,
        taxable_fiscal: 3000,
      }),
    ],
    declarations: [
      {
        person_id: "per-1",
        fiscal_year: 2026,
        external_amount: 2000,
        status: "ACTIVE",
      },
    ],
  });

  assert.equal(rows.length, 2);

  const anna = rows.find((row) => row.personId === "per-2");
  assert.equal(anna.grossPaid, 18000);
  assert.equal(anna.taxableFiscal, 3000);
  assert.equal(anna.needsAttention, true);
  assert.match(anna.attentionReason, /Nessuna autocertificazione/);

  const marco = rows.find((row) => row.personId === "per-1");
  assert.equal(marco.externalDeclared, 2000);
  assert.equal(marco.progressive, 8000);
  assert.equal(marco.needsAttention, false);
});

test("chi non ha ricevuto nulla nell'anno non entra nella CU", () => {
  const rows = buildCuDataset({
    year: 2027,
    people: [{ id: "per-1", name: "Marco Rossi" }],
    payouts: [erogazione()],
    declarations: [],
  });
  assert.equal(rows.length, 0);
});
