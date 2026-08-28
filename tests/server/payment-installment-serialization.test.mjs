import assert from "node:assert/strict";
import test, { before, beforeEach, afterEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Chi altro decide sullo stato economico di una rata.**
 *
 * ADR-0067 ha messo in fila le tre operazioni che muovono denaro — incasso,
 * storno, rimborso — bloccando la riga della rata dentro la transazione. La
 * seconda revisione indipendente ha trovato che le operazioni erano
 * **quattro**: `PATCH /api/athlete-payments/:id` cambia l'importo di una rata,
 * e cambiare l'importo cambia il residuo, quindi cambia lo stato. Quella rotta
 * leggeva la rata fuori da qualunque transazione, decideva sulla copia vecchia
 * e chiamava il ricalcolo fuori dal blocco.
 *
 * Le conseguenze, tutte e tre riprodotte qui sotto:
 *
 * 1. il guardiano «i pagamenti gia pagati non si modificano» girava sulla
 *    lettura vecchia: un incasso arrivato nel frattempo lasciava passare la
 *    modifica dell'importo di una rata **appena saldata**;
 * 2. i tre rami riscrivono `data` per intero a partire dalla copia letta
 *    fuori: il `data.ledger` scritto dal ricalcolo di un incasso appena
 *    committato spariva sotto di essa;
 * 3. il messaggio del driver usciva intero verso il browser.
 *
 * E due proprieta del servizio degli incassi che la prima revisione aveva
 * lasciato coperte solo da una lettura del sorgente: la capienza calcolata
 * sulla rata **riletta dentro la transazione**, e la deduplica del rimborso
 * che non e l'indice unico a fare.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const RATA = "11111111-0000-4000-8000-00000000000a";
const ATLETA = "99999999-0000-4000-8000-000000000009";
const UTENTE = "eeeeeeee-0000-4000-8000-000000000005";
const TOKEN = "token-di-sessione";

const scope = () => ({
  userId: UTENTE,
  activeOrganizationId: CLUB,
  allowedOrganizationIds: [CLUB],
});

let service;
let route;
let setPrismaClientForTests;
let fake;

const seed = () => ({
  session: [
    {
      id: "sess-1",
      token: TOKEN,
      user_id: UTENTE,
      expires_at: new Date(Date.now() + 3600_000),
      /* La fake-prisma non risolve `include`: la relazione si semina annidata. */
      user: {
        id: UTENTE,
        email: "gestore@example.invalid",
        role: "club_manager",
        first_name: "Gestore",
        last_name: "Di Prova",
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        updated_at: new Date("2026-01-01T00:00:00.000Z"),
        email_verified_at: new Date("2026-01-01T00:00:00.000Z"),
      },
    },
  ],
  organizationUser: [
    {
      id: "ou-1",
      user_id: UTENTE,
      organization_id: CLUB,
      role: "club_manager",
      is_primary: true,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  club: [{ id: CLUB, slug: "club-a", name: "ASD Alfa", settings: {} }],
  athlete: [
    { id: ATLETA, organization_id: CLUB, first_name: "Anna", last_name: "Rossi" },
  ],
  athletePayment: [
    {
      id: RATA,
      organization_id: CLUB,
      athlete_id: ATLETA,
      description: "Quota annuale - Rata 1",
      amount: 130,
      due_date: new Date("2027-01-15T00:00:00Z"),
      paid_at: null,
      status: "pending",
      method: null,
      reference: null,
      notes: null,
      data: {},
      created_at: new Date("2026-08-01T10:00:00Z"),
      updated_at: new Date("2026-08-01T10:00:00Z"),
    },
  ],
  paymentTransaction: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  service = await import("../../src/lib/server/payment-transactions.ts");
  route = await import(
    "../../src/app/api/athlete-payments/[paymentId]/route.ts"
  );
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

afterEach(() => {
  setPrismaClientForTests(null);
});

/**
 * Cio che accade **fra la lettura del chiamante e la sua scrittura**.
 *
 * La corsa vera non si riproduce con un doppio che non ha concorrenza: si
 * riproduce cio che la corsa fa. Il lavoro passato qui viene eseguito appena
 * si apre la prima transazione interattiva, cioe dopo che il chiamante ha gia
 * deciso e prima che scriva.
 */
const nelFrattempo = (lavoro) => {
  const originale = fake.client.$transaction.bind(fake.client);
  let gia = false;
  fake.client.$transaction = async (input) => {
    if (!gia && typeof input === "function") {
      gia = true;
      lavoro();
    }
    return originale(input);
  };
};

const incasso = (amount, extra = {}) => ({
  id: `incasso-${Math.abs(amount)}-${extra.external_reference || "x"}`,
  organization_id: CLUB,
  athlete_id: ATLETA,
  payment_id: RATA,
  amount,
  paid_at: new Date("2026-08-28T09:59:59.000Z"),
  payment_method: "Contanti",
  notes: null,
  source: "MANUAL",
  external_reference: null,
  external_payment_id: null,
  created_by: null,
  reversed_at: null,
  reverses_transaction_id: null,
  data: {},
  created_at: new Date("2026-08-28T09:59:59.000Z"),
  updated_at: new Date("2026-08-28T09:59:59.000Z"),
  ...extra,
});

const patch = (body, paymentId = RATA) =>
  route.PATCH(
    new Request(`http://localhost/api/athlete-payments/${paymentId}`, {
      method: "PATCH",
      headers: new Headers({
        "content-type": "application/json",
        authorization: `Bearer ${TOKEN}`,
        "x-active-club-id": CLUB,
      }),
      body: JSON.stringify(body),
    }),
    { params: { paymentId } },
  );

/* ---------------------------------------------- la rotta che cambia l'importo */

/**
 * Il caso che il difetto lasciava passare: la rata viene saldata mentre la
 * richiesta di modifica e in volo. Con il controllo sulla lettura vecchia
 * l'importo di una rata **saldata** cambiava — e una rata da 130 incassata per
 * intero diventava una rata da 500 con 130 sopra, cioe scoperta di 370 che
 * nessuno doveva.
 */
test("una rata saldata nel frattempo non si lascia piu cambiare l'importo", async () => {
  nelFrattempo(() => {
    fake.rows("paymentTransaction").push(incasso(130));
    const rata = fake.rows("athletePayment").find((row) => row.id === RATA);
    rata.status = "paid";
    rata.paid_at = new Date("2026-08-28T09:59:59.000Z");
  });

  const response = await patch({ action: "update", updates: { amount: 500 } });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.match(payload.error.message, /gia pagati non possono essere modificati/);

  const rata = fake.rows("athletePayment").find((row) => row.id === RATA);
  assert.equal(rata.amount, 130, "l'importo della rata saldata non e cambiato");
});

/**
 * Il ricalcolo di un incasso appena committato scrive `data.ledger` sulla
 * rata. Il ramo di modifica riscrive `data` per intero: preso dalla copia
 * letta fuori dalla transazione, quel ledger spariva.
 */
test("la modifica non cancella il ledger scritto da un incasso concorrente", async () => {
  nelFrattempo(() => {
    const rata = fake.rows("athletePayment").find((row) => row.id === RATA);
    rata.data = {
      ledger: {
        dueAmount: 130,
        paidAmount: 50,
        residualAmount: 80,
        state: "partial",
        transactionCount: 1,
        updatedAt: "2026-08-28T09:59:59.000Z",
      },
    };
    fake.rows("paymentTransaction").push(incasso(50));
  });

  const response = await patch({ action: "update", updates: { amount: 100 } });
  assert.equal(response.status, 200);

  const rata = fake.rows("athletePayment").find((row) => row.id === RATA);
  assert.ok(rata.data.ledger, "il ledger dell'incasso concorrente non e sparito");
  assert.equal(
    rata.data.ledger.dueAmount,
    100,
    "ed e stato ricalcolato sul nuovo importo, dentro la stessa transazione",
  );
  assert.equal(rata.data.ledger.paidAmount, 50);
  assert.equal(rata.status, "partially_paid");
  assert.equal(
    Array.isArray(rata.data.audit) && rata.data.audit.length,
    1,
    "e la traccia della modifica resta",
  );
});

/**
 * Il blocco di riga, e che venga preso **prima** di scrivere: e cio che mette
 * questa rotta nella stessa fila delle tre operazioni che muovono denaro.
 */
test("la rotta blocca la riga della rata prima di riscriverla", async () => {
  const eseguiti = [];
  fake.client.$queryRaw = async (strings, ...values) => {
    eseguiti.push({ sql: strings.join("?"), values, at: fake.calls.length });
    return [];
  };

  const response = await patch({ action: "update", updates: { amount: 100 } });
  assert.equal(response.status, 200);

  assert.equal(eseguiti.length, 1, "un blocco di riga, uno solo");
  assert.match(eseguiti[0].sql, /SELECT id FROM payments WHERE id = /);
  assert.match(eseguiti[0].sql, /FOR UPDATE/);
  assert.deepEqual(eseguiti[0].values, [RATA]);

  const scrittura = fake.calls.findIndex(
    (call) => call.delegate === "athletePayment" && call.method === "update",
  );
  assert.ok(
    scrittura > eseguiti[0].at,
    "la scrittura viene dopo il blocco, non prima",
  );
});

/** Annullare una rata passa dalla stessa fila, e conserva quel che c'era. */
test("l'annullamento non perde il ledger di un incasso concorrente", async () => {
  nelFrattempo(() => {
    const rata = fake.rows("athletePayment").find((row) => row.id === RATA);
    rata.data = { ledger: { dueAmount: 130, paidAmount: 20, state: "partial" } };
  });

  const response = await patch({ action: "cancel", reason: "Iscrizione ritirata" });
  assert.equal(response.status, 200);

  const rata = fake.rows("athletePayment").find((row) => row.id === RATA);
  assert.equal(rata.status, "cancelled");
  assert.equal(rata.data.excludedFromTotals, true);
  assert.equal(rata.data.cancellationReason, "Iscrizione ritirata");
  assert.ok(rata.data.ledger, "il ledger concorrente non e sparito");
});

/**
 * Nessun messaggio del driver esce da questa rotta. Un `paymentId` che non e
 * un UUID faceva rispondere con l'invocazione Prisma per intero: nome del
 * modello, operazione, codice Postgres.
 */
test("un errore del driver non arriva al browser", async () => {
  const errore = new Error(
    'Invalid `prisma.athletePayment.findUnique()` invocation:\n\nPostgresError { code: "22P02", message: "invalid input syntax for type uuid: \\"non-un-uuid\\"" }',
  );

  const delegate = fake.client.athletePayment;
  const originale = delegate.findUnique;
  delegate.findUnique = async () => {
    throw errore;
  };

  try {
    const response = await patch(
      { action: "update", updates: { amount: 100 } },
      "non-un-uuid",
    );
    const payload = await response.json();

    assert.equal(response.status, 500);
    assert.equal(payload.error.message, "Errore aggiornamento pagamento");
    const testo = JSON.stringify(payload);
    for (const traccia of ["prisma.", "PostgresError", "22P02", "uuid"]) {
      assert.equal(
        testo.includes(traccia),
        false,
        `«${traccia}» non deve uscire dal server`,
      );
    }
  } finally {
    delegate.findUnique = originale;
  }
});

/** Un'azione inventata si ferma prima di aprire una transazione. */
test("un'azione sconosciuta non apre nemmeno una transazione", async () => {
  const response = await patch({ action: "svuota" });

  assert.equal(response.status, 400);
  assert.equal(
    fake.calls.filter((call) => call.method === "update").length,
    0,
    "nessuna scrittura per un'azione che non esiste",
  );
});

/* --------------------------------------------- il servizio degli incassi */

/**
 * Il residuo e una sottrazione fra **due** numeri: quanto e dovuto e quanto e
 * stato incassato. La correzione di ADR-0067 rileggeva dentro la transazione
 * solo il secondo. Con la rata portata da 130 a 40 mentre l'incasso e in volo
 * — la segreteria che corregge il piano, o la sostituzione del piano di
 * pagamento — il controllo diceva ancora di si a 130.
 */
test("la capienza si calcola sulla rata riletta dentro la transazione", async () => {
  nelFrattempo(() => {
    /*
      La riga si **sostituisce**, non si modifica: il doppio restituisce
      l'oggetto vero dell'archivio, e mutarlo aggiornerebbe anche la copia che
      il chiamante ha letto prima della transazione — cioe proprio la lettura
      vecchia che questo test deve dimostrare inutilizzabile.
    */
    const righe = fake.rows("athletePayment");
    const posizione = righe.findIndex((row) => row.id === RATA);
    righe[posizione] = { ...righe[posizione], amount: 40 };
  });

  await assert.rejects(
    service.createPaymentTransaction(
      {
        paymentId: RATA,
        amount: 130,
        paymentMethod: "Contanti",
        paidAt: "2026-08-28T10:00:00.000Z",
      },
      scope(),
    ),
    (error) => {
      assert.match(String(error.message), /supera il residuo della rata/);
      return true;
    },
  );

  assert.equal(
    fake.rows("paymentTransaction").length,
    0,
    "su una rata che nel frattempo vale 40 non si incassano 130",
  );
});

/**
 * Incasso e storno sulla stessa rata, nello stesso istante: lo storno deve
 * ricalcolare lo stato sul registro **completo**, non su quello che aveva
 * letto prima.
 */
test("uno storno concorrente a un incasso lascia la rata coerente", async () => {
  const primo = await service.createPaymentTransaction(
    {
      paymentId: RATA,
      amount: 130,
      paymentMethod: "Contanti",
      paidAt: "2026-08-28T10:00:00.000Z",
    },
    scope(),
  );

  const rataDopoIncasso = fake
    .rows("athletePayment")
    .find((row) => row.id === RATA);
  assert.equal(rataDopoIncasso.status, "paid");

  nelFrattempo(() => {
    fake.rows("paymentTransaction").push(incasso(50));
  });

  const result = await service.reversePaymentTransaction(
    { transactionId: primo.transaction.id },
    scope(),
  );

  const rata = fake.rows("athletePayment").find((row) => row.id === RATA);
  assert.equal(
    rata.status,
    "partially_paid",
    "130 incassati, 130 stornati, 50 arrivati nel frattempo: la rata e parziale",
  );
  assert.equal(rata.data.ledger.paidAmount, 50);
  assert.equal(rata.data.ledger.residualAmount, 80);
  assert.equal(result.charge.status, "partially_paid");
});

/* ------------------------------------------------------------- rimborsi */

const REFUND_CLUB_SEED = () => ({
  ...seed(),
  paymentTransaction: [
    incasso(130, {
      id: "incasso-online",
      source: "STRIPE",
      external_payment_id: "pi_test_1",
      payment_method: "Carta",
    }),
  ],
});

/**
 * La deduplica del rimborso, **provata invece che letta**.
 *
 * Stripe consegna lo stesso rimborso piu volte, e i due eventi arrivano a
 * sette millesimi di distanza. Il controllo rifatto dentro la transazione
 * deve rispondere «gia registrato» — non lasciare che sia l'indice unico
 * parziale a farlo esplodere con un `P2002`, che il chiamante dovrebbe poi
 * riconoscere dal codice d'errore.
 */
test("un rimborso gemello arrivato nel frattempo si riconosce, non esplode", async () => {
  fake = createFakePrisma(REFUND_CLUB_SEED());
  setPrismaClientForTests(fake.client);

  nelFrattempo(() => {
    fake.rows("paymentTransaction").push(
      incasso(-30, {
        id: "rimborso-gemello",
        external_reference: "re_test_1",
        external_payment_id: "pi_test_1",
        data: { kind: "refund", refundOfTransactionId: "incasso-online" },
      }),
    );
  });

  const result = await service.recordRefundTransaction({
    transactionId: "incasso-online",
    amountCents: 3000,
    externalRefundId: "re_test_1",
    confirmedByProvider: true,
  });

  assert.equal(result.duplicate, true, "riconosciuto, non riscritto");
  assert.equal(result.transaction.id, "rimborso-gemello");
  assert.equal(
    fake.rows("paymentTransaction").filter((row) => row.amount < 0).length,
    1,
    "un rimborso solo per un rimborso solo",
  );
});

/**
 * La capienza del rimborso guarda **questo** incasso.
 *
 * Scritta come `external_payment_id: original.external_payment_id ||
 * undefined`, su un incasso senza identificativo del provider il filtro
 * spariva — Prisma ignora `undefined` — e la somma diventava «quanto e stato
 * rimborsato in tutto il club»: un rimborso vecchio su un altro atleta
 * bastava a far rifiutare un rimborso legittimo.
 */
test("i rimborsi di un altro movimento non tolgono capienza a questo", async () => {
  fake = createFakePrisma({
    ...seed(),
    paymentTransaction: [
      incasso(130, { id: "incasso-manuale", external_payment_id: null }),
      incasso(-120, {
        id: "rimborso-di-un-altro",
        external_reference: "re_altro",
        external_payment_id: null,
        data: { kind: "refund", refundOfTransactionId: "un-altro-incasso" },
      }),
    ],
  });
  setPrismaClientForTests(fake.client);

  const result = await service.recordRefundTransaction({
    transactionId: "incasso-manuale",
    amountCents: 3000,
    externalRefundId: "re_test_2",
    confirmedByProvider: true,
  });

  assert.equal(result.duplicate, false);
  assert.equal(result.transaction.amount, -30);
});
