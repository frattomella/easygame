import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **D-1 — il denaro non si cancella, nemmeno dalla porta di servizio.**
 *
 * Il dominio degli incassi dichiara «non esiste un `DELETE`, ed e una scelta»:
 * un incasso si storna, e restano visibili l'originale e la riga opposta. La
 * scelta era vera su una porta e falsa sull'altra.
 *
 * Tre fatti, veri insieme, componevano il difetto:
 *
 * 1. `payment_transactions.payment_id -> payments.id` e **`ON DELETE CASCADE`**
 *    (migrazione `20260826090000_payment_transactions`, riga 68);
 * 2. `deleteResource` del CRUD generico chiamava `delegate.delete()` **senza**
 *    la guardia di registro che protegge gli altri verbi;
 * 3. `payments` e il suo alias `simplified_payments` non erano fra le risorse
 *    riservate, quindi `collaborator` e `staff` superavano il controllo di
 *    accesso.
 *
 * Risultato: `DELETE /api/v1/simplified_payments/:id` cancellava fisicamente la
 * rata e, a cascata, **tutti i suoi incassi, storni e rimborsi** — per un ruolo
 * che non ha il permesso di registrarne uno.
 *
 * Questi test sono stati scritti **prima** della correzione, e allora
 * fallivano. Provano le due meta della chiusura: il ruolo che non passa, e la
 * rata con storia economica che non si cancella nemmeno per il proprietario.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const RATA_CON_STORIA = "11111111-0000-4000-8000-00000000000a";
const RATA_SCOPERTA = "11111111-0000-4000-8000-00000000000b";
const RATA_CON_RICEVUTA = "11111111-0000-4000-8000-00000000000c";
const ATLETA = "99999999-0000-4000-8000-000000000009";

const scope = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB,
  allowedOrganizationIds: [CLUB],
});

let resources;
let accessRoles;
let setPrismaClientForTests;
let fake;

const rata = (id, overrides = {}) => ({
  id,
  organization_id: CLUB,
  athlete_id: ATLETA,
  description: "Quota annuale - Rata 1",
  amount: 600,
  due_date: new Date("2026-09-30T00:00:00Z"),
  paid_at: null,
  status: "pending",
  method: null,
  reference: null,
  notes: null,
  data: null,
  ...overrides,
});

const seed = () => ({
  club: [{ id: CLUB, slug: "club-a", name: "Club A" }],
  athlete: [{ id: ATLETA, organization_id: CLUB, first_name: "Anna", last_name: "Rossi" }],
  athletePayment: [
    rata(RATA_CON_STORIA, {
      status: "partially_paid",
      data: {
        ledger: { dueAmount: 600, paidAmount: 200, residualAmount: 400, state: "partial" },
      },
    }),
    rata(RATA_SCOPERTA),
    rata(RATA_CON_RICEVUTA),
  ],
  paymentTransaction: [
    {
      id: "aaaa1111-0000-4000-8000-00000000aaaa",
      organization_id: CLUB,
      athlete_id: ATLETA,
      payment_id: RATA_CON_STORIA,
      amount: 200,
      paid_at: new Date("2026-09-01T10:00:00Z"),
      payment_method: "Contanti",
      source: "MANUAL",
      reversed_at: null,
      reverses_transaction_id: null,
    },
  ],
  receipt: [
    {
      id: "cccc1111-0000-4000-8000-00000000cccc",
      organization_id: CLUB,
      payment_id: RATA_CON_RICEVUTA,
      transaction_id: null,
      document_number: "2026/000012",
      cancelled_at: null,
    },
  ],
  invoice: [],
  auditLog: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  resources = await import("../../src/lib/server/resources.ts");
  accessRoles = await import("../../src/lib/access-roles.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const rate = () => fake.rows("athletePayment");

/* ------------------------------------------------------ il ruolo non passa */

test("collaborator e staff non possono cancellare una rata", () => {
  for (const ruolo of ["collaborator", "staff"]) {
    for (const risorsa of ["payments", "simplified_payments"]) {
      assert.equal(
        accessRoles.canAccessClubResource(ruolo, risorsa, "delete"),
        false,
        `${ruolo} non deve poter cancellare ${risorsa}`,
      );
    }
  }
});

test("nemmeno gli incassi: la cancellazione e riservata anche li", () => {
  for (const ruolo of ["collaborator", "staff"]) {
    assert.equal(
      accessRoles.canAccessClubResource(ruolo, "payment_transactions", "delete"),
      false,
    );
  }
});

test("trainer non tocca le rate in nessun verbo", () => {
  for (const azione of ["read", "create", "update", "delete"]) {
    assert.equal(accessRoles.canAccessClubResource("trainer", "payments", azione), false);
  }
});

test("collaborator e staff continuano a leggere e registrare le rate", () => {
  for (const ruolo of ["collaborator", "staff"]) {
    for (const azione of ["read", "create", "update"]) {
      assert.equal(
        accessRoles.canAccessClubResource(ruolo, "payments", azione),
        true,
        `la segreteria deve poter ${azione} una rata`,
      );
    }
  }
});

test("owner e club_manager restano gli unici a poter cancellare", () => {
  for (const ruolo of ["owner", "club_manager"]) {
    assert.equal(accessRoles.canAccessClubResource(ruolo, "payments", "delete"), true);
  }
});

/* --------------------------------- la rata con storia non si cancella mai */

test("una rata con un incasso non si cancella, nemmeno per il proprietario", async () => {
  await assert.rejects(
    () => resources.deleteResource("simplified_payments", RATA_CON_STORIA, scope()),
    /storia economica|non si cancella|storna/i,
  );

  assert.ok(
    rate().some((riga) => riga.id === RATA_CON_STORIA),
    "la rata deve restare",
  );
  assert.equal(
    fake.rows("paymentTransaction").length,
    1,
    "l'incasso non deve sparire a cascata",
  );
});

test("vale anche per l'alias `payments`, che e la stessa tabella", async () => {
  await assert.rejects(
    () => resources.deleteResource("payments", RATA_CON_STORIA, scope()),
    /storia economica|non si cancella|storna/i,
  );
});

test("una rata con una ricevuta emessa non si cancella", async () => {
  await assert.rejects(
    () => resources.deleteResource("payments", RATA_CON_RICEVUTA, scope()),
    /storia economica|documento|non si cancella/i,
  );

  assert.ok(rate().some((riga) => riga.id === RATA_CON_RICEVUTA));
});

test("una rata mai incassata resta cancellabile: il piano si corregge", async () => {
  await resources.deleteResource("payments", RATA_SCOPERTA, scope());

  assert.equal(
    rate().some((riga) => riga.id === RATA_SCOPERTA),
    false,
    "una rata senza denaro non e un fatto contabile",
  );
});

/* --------------------------------------------------------- multi-tenant */

test("la rata di un altro club non si cancella e non si legge", async () => {
  const altroClub = () => ({
    userId: "user-b",
    activeOrganizationId: "bbbbbbbb-0000-4000-8000-000000000002",
    allowedOrganizationIds: ["bbbbbbbb-0000-4000-8000-000000000002"],
  });

  await assert.rejects(
    () => resources.deleteResource("payments", RATA_SCOPERTA, altroClub()),
    /Accesso negato|non trovat/i,
  );

  assert.ok(rate().some((riga) => riga.id === RATA_SCOPERTA));
});
