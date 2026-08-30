import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * I **documenti fiscali**: snapshot, serie, immutabilita, annullamento.
 *
 * Il difetto che lo snapshot chiude era silenzioso e grave: una ricevuta si
 * ristampava leggendo l'anagrafica **di oggi**. Bastava che una famiglia
 * traslocasse perche la ricevuta gia consegnata mesi prima diventasse un
 * documento diverso da quello che quella famiglia aveva in mano — due
 * documenti con lo stesso numero.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "bbbbbbbb-0000-4000-8000-000000000002";
const RATA = "cccccccc-0000-4000-8000-000000000003";
const ATLETA = "dddddddd-0000-4000-8000-000000000004";

let documents;
let setPrismaClientForTests;
let fake;

before(async () => {
  documents = await import("../../src/lib/server/fiscal-documents.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const scope = (organizationId = CLUB) => ({
  userId: "utente-1",
  activeOrganizationId: organizationId,
  activeRole: "owner",
  allowedOrganizationIds: [organizationId],
});

const TUTORE = {
  guardians: [
    {
      name: "Anna",
      surname: "Rossi",
      fiscalCode: "RSSNNA80A41H501K",
      address: "Via Milano 4",
      city: "Roma",
      postalCode: "00185",
      province: "RM",
    },
  ],
};

const seed = (athleteData = TUTORE) => ({
  club: [
    {
      id: CLUB,
      name: "ASD Alfa",
      business_name: "Associazione Sportiva Dilettantistica Alfa",
      vat_number: "12345678903",
      legal_address: "Via Roma 1",
      legal_city: "Roma",
      legal_postal_code: "00100",
      legal_province: "RM",
      legal_country: "Italia",
    },
    { id: ALTRO_CLUB, name: "ASD Beta" },
  ],
  athlete: [
    {
      id: ATLETA,
      organization_id: CLUB,
      first_name: "Mario",
      last_name: "Rossi",
      data: athleteData,
    },
  ],
  athletePayment: [
    {
      id: RATA,
      organization_id: CLUB,
      athlete_id: ATLETA,
      amount: 130,
      status: "paid",
      description: "Rata unica",
      data: {},
    },
  ],
  paymentTransaction: [
    {
      id: "incasso-1",
      organization_id: CLUB,
      athlete_id: ATLETA,
      payment_id: RATA,
      amount: 130,
      paid_at: new Date("2026-08-26T10:00:00.000Z"),
      payment_method: "Bonifico",
      source: "MANUAL",
      data: {},
    },
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const ricevuta = () =>
  documents.issueReceiptForTransaction({ transactionId: "incasso-1" }, scope());

/* ---------------------------------------------------------- lo snapshot */

test("il documento emesso porta con se la fotografia dei dati", async () => {
  const emessa = await ricevuta();

  assert.equal(emessa.snapshot.recipient.name, "Anna Rossi");
  assert.equal(emessa.snapshot.recipient.fiscalCode, "RSSNNA80A41H501K");
  assert.equal(emessa.snapshot.recipient.address, "Via Milano 4");
  assert.equal(
    emessa.snapshot.issuer.name,
    "Associazione Sportiva Dilettantistica Alfa",
  );
  assert.equal(emessa.snapshot.amounts.totalCents, 13000);
});

test("il documento non cambia perche l'atleta trasloca", async () => {
  const emessa = await ricevuta();
  const indirizzoOriginale = emessa.snapshot.recipient.address;

  /* La famiglia si trasferisce dopo l'emissione. */
  const atleta = fake.rows("athlete").find((row) => row.id === ATLETA);
  atleta.data = {
    guardians: [{ ...TUTORE.guardians[0], address: "Via Nuova 99" }],
  };

  const riletto = fake.rows("receipt")[0];

  assert.equal(
    riletto.snapshot.recipient.address,
    indirizzoOriginale,
    "sarebbe un documento diverso da quello consegnato",
  );
});

test("lo snapshot dice anche chi ha emesso", async () => {
  const emessa = await ricevuta();

  assert.equal(emessa.snapshot.issuedByUserId, "utente-1");
  assert.equal(emessa.issued_by, "utente-1");
});

/* -------------------------------------------------------- la numerazione */

test("la ricevuta prende un numero dal registro delle ricevute", async () => {
  const emessa = await ricevuta();

  assert.equal(emessa.receipt_number, "R-2026-0001");
  assert.equal(emessa.series, "");
  assert.equal(emessa.sequence, 1);
  assert.equal(emessa.document_year, 2026);
});

test("una serie configurata entra nel numero", async () => {
  fake.rows("documentSeries").push({
    id: "serie-1",
    organization_id: CLUB,
    kind: "receipt",
    code: "SPO",
    label: "Sponsorizzazioni",
    prefix: "R",
    is_default: true,
    is_active: true,
  });

  const emessa = await ricevuta();

  assert.equal(emessa.receipt_number, "R-SPO-2026-0001");
  assert.equal(emessa.series, "SPO");
});

test("due serie hanno due progressioni indipendenti", async () => {
  fake.rows("documentNumberSequence").push(
    {
      id: "seq-1",
      organization_id: CLUB,
      kind: "receipt",
      series: "",
      year: 2026,
      last_number: 41,
    },
    {
      id: "seq-2",
      organization_id: CLUB,
      kind: "receipt",
      series: "SPO",
      year: 2026,
      last_number: 6,
    },
  );

  const senzaSerie = await documents.issueReceiptForTransaction(
    { transactionId: "incasso-1" },
    scope(),
  );

  assert.equal(senzaSerie.receipt_number, "R-2026-0042");
  assert.equal(
    fake.rows("documentNumberSequence").find((row) => row.series === "SPO")
      .last_number,
    6,
    "un registro mescolato non si riconcilia piu",
  );
});

test("la numerazione appartiene a un club: due societa hanno entrambe la loro prima", async () => {
  fake.rows("documentNumberSequence").push({
    id: "seq-altro",
    organization_id: ALTRO_CLUB,
    kind: "receipt",
    series: "",
    year: 2026,
    last_number: 87,
  });

  const emessa = await ricevuta();

  assert.equal(emessa.receipt_number, "R-2026-0001");
});

/* ---------------------------------------------------------- idempotenza */

test("emettere due volte restituisce la stessa ricevuta", async () => {
  const prima = await ricevuta();
  const seconda = await ricevuta();

  assert.equal(prima.id, seconda.id);
  assert.equal(
    fake.rows("receipt").length,
    1,
    "chiederla due volte non consuma un numero",
  );
});

/* ---------------------------------------------- incasso != documento */

test("un incasso stornato non produce un documento", async () => {
  fake.rows("paymentTransaction")[0].reversed_at = new Date();

  await assert.rejects(() => ricevuta(), /stornato non produce/i);
});

test("un rimborso non produce una ricevuta", async () => {
  fake.rows("paymentTransaction").push({
    id: "rimborso-1",
    organization_id: CLUB,
    athlete_id: ATLETA,
    payment_id: RATA,
    amount: -30,
    paid_at: new Date("2026-08-27T10:00:00.000Z"),
    payment_method: "online",
    source: "STRIPE",
    data: { kind: "refund" },
  });

  await assert.rejects(
    () =>
      documents.issueReceiptForTransaction(
        { transactionId: "rimborso-1" },
        scope(),
      ),
    /si rettifica il documento originale/i,
  );
});

/* ---------------------------------------------------------- multi-tenant */

test("il documento di un club non si emette da un altro club", async () => {
  await assert.rejects(
    () =>
      documents.issueReceiptForTransaction(
        { transactionId: "incasso-1" },
        scope(ALTRO_CLUB),
      ),
    /Accesso negato/,
  );
});

test("il documento di un club non si annulla da un altro club", async () => {
  const emessa = await ricevuta();

  await assert.rejects(
    () =>
      documents.cancelDocument(
        {
          kind: "receipt",
          documentId: emessa.id,
          reason: "prova di accesso incrociato",
        },
        scope(ALTRO_CLUB),
      ),
    /Accesso negato/,
  );

  /*
    `null`, non `undefined`: una riga letta da Postgres porta sempre la
    colonna, e da quando l emissione azzera esplicitamente i campi
    dell annullamento — perche puo riempire una riga orfana che li portava — il
    doppio dice la stessa cosa che direbbe il database. Il valore atteso qui
    descriveva la fixture, non la realta.
  */
  assert.equal(fake.rows("receipt")[0].cancelled_at, null);
});

/* --------------------------------------------------------- annullamento */

test("annullare marca il documento e conserva il motivo", async () => {
  const emessa = await ricevuta();

  const annullata = await documents.cancelDocument(
    {
      kind: "receipt",
      documentId: emessa.id,
      reason: "Importo errato: si riemette",
    },
    scope(),
  );

  assert.equal(annullata.status, "cancelled");
  assert.ok(annullata.cancelled_at);
  assert.equal(annullata.cancellation_reason, "Importo errato: si riemette");
  assert.equal(annullata.cancelled_by, "utente-1");
});

test("annullare non libera il numero", async () => {
  const emessa = await ricevuta();

  await documents.cancelDocument(
    { kind: "receipt", documentId: emessa.id, reason: "annullata" },
    scope(),
  );

  assert.equal(
    fake.rows("documentNumberSequence")[0].last_number,
    1,
    "un buco nella numerazione e spiegabile, lo stesso numero su due documenti no",
  );
});

test("un annullamento senza motivo non si accetta", async () => {
  const emessa = await ricevuta();

  await assert.rejects(
    () =>
      documents.cancelDocument(
        { kind: "receipt", documentId: emessa.id, reason: "" },
        scope(),
      ),
    /senza motivo/i,
  );
});

test("un documento gia annullato non si annulla due volte", async () => {
  const emessa = await ricevuta();

  await documents.cancelDocument(
    { kind: "receipt", documentId: emessa.id, reason: "prima volta" },
    scope(),
  );

  await assert.rejects(
    () =>
      documents.cancelDocument(
        { kind: "receipt", documentId: emessa.id, reason: "seconda volta" },
        scope(),
      ),
    /gia stato annullato/i,
  );
});

/* --------------------------------------------------------- immutabilita */

test("un documento emesso non cambia numero, data ne importo", () => {
  const emesso = {
    status: "issued",
    receipt_number: "R-2026-0001",
    issue_date: "2026-08-26",
    amount: 130,
  };

  assert.throws(
    () => documents.assertDocumentMutable(emesso, { amount: 100 }),
    /non si modifica/i,
  );

  assert.throws(
    () =>
      documents.assertDocumentMutable(emesso, { receipt_number: "R-2026-0002" }),
    /receipt_number/,
  );
});

test("rimandare indietro lo stesso valore non e una modifica", () => {
  const emesso = { status: "issued", amount: 130, receipt_number: "R-2026-0001" };

  assert.doesNotThrow(() =>
    documents.assertDocumentMutable(emesso, {
      amount: 130,
      receipt_number: "R-2026-0001",
      file_url: "/documenti/r-2026-0001.pdf",
    }),
  );
});

test("una bozza si modifica: l'immutabilita comincia con l'emissione", () => {
  assert.doesNotThrow(() =>
    documents.assertDocumentMutable({ status: "draft", amount: 130 }, { amount: 100 }),
  );
});

/* --------------------------------------------------- cosa si propone */

test("la decisione documentale si legge prima di emettere", async () => {
  const esito = await documents.describeDocumentDecision(
    { transactionId: "incasso-1" },
    scope(),
  );

  assert.ok(esito.decision.suggested);
  assert.equal(esito.recipient.name, "Anna Rossi");
  assert.equal(esito.recipient.source, "guardian");
});

/* ============== il documento dirottato, e quello annullato per sempre === */

test("una riga senza numero non passa per una ricevuta gia emessa", async () => {
  /*
    **Il dirottamento che una revisione ostile ha eseguito.**

    Il controllo di idempotenza era «esiste una riga con questo
    `transaction_id`?». Un collaboratore — che una ricevuta non potrebbe
    emetterla, perche la rotta di emissione chiede `canManageClubConfiguration`
    — creava dal registro generico una riga `receipts` con il `transaction_id`
    di un incasso vero, importo un centesimo e la causale che voleva.
    L'emissione trovava quella riga e restituiva **quella**: senza numero,
    senza snapshot. E poiche il collegamento era unico, quell'incasso non
    poteva piu essere documentato. Mai.

    La creazione dal registro generico e chiusa; questo controllo resta stretto
    comunque, perche una difesa sola prima o poi si dimentica. Si riconosce
    come gia emessa solo una riga che porta un **numero**, che nasce dalla
    sequenza e non si digita.
  */
  const risorse = await import("../../src/lib/server/resources.ts");

  /* La prima difesa: la riga non nasce. */
  await assert.rejects(
    () =>
      risorse.createResource(
        "receipts",
        {
          organization_id: CLUB,
          athlete_id: ATLETA,
          transaction_id: "incasso-1",
          issue_date: "2026-05-01",
          amount: 0.01,
          description: "FINTA",
          status: "sent",
        },
        "create",
        scope(),
      ),
    /si emette dal suo incasso/,
  );

  assert.equal(
    fake.rows("receipt").length,
    0,
    "nessuna riga forgiata in tabella",
  );

  /*
    La seconda: anche se una riga senza numero esistesse — importata, o scritta
    da una versione futura — non passerebbe per un documento gia emesso. Qui la
    si semina direttamente in tabella, che e l'unico modo rimasto di ottenerla.
  */
  fake.rows("receipt").push({
    id: "ricevuta-finta",
    organization_id: CLUB,
    athlete_id: ATLETA,
    /*
      Senza `transaction_id`: con esso l'indice unico parziale del database
      rifiuterebbe la ricevuta vera, ed e cio che deve fare. Cio che si prova
      qui e la seconda difesa: che una riga **senza numero** non venga scambiata
      per un documento emesso.
    */
    transaction_id: null,
    receipt_number: null,
    status: "sent",
    amount: 0.01,
    description: "FINTA",
    issue_date: new Date("2026-05-01T00:00:00.000Z"),
    cancelled_at: null,
  });

  const emessa = await ricevuta();

  assert.notEqual(emessa.id, "ricevuta-finta", "la riga forgiata non e un documento");
  assert.ok(emessa.receipt_number, "la ricevuta vera porta un numero");
  assert.equal(emessa.amount, 130);
  assert.ok(emessa.snapshot, "e porta la fotografia dei dati");
});

test("dopo l'annullamento, l'incasso torna documentabile", async () => {
  /*
    `cancelDocument` lascia il collegamento all'incasso dov'e — e giusto: il
    documento annullato deve continuare a dire a cosa si riferiva. Ma il
    controllo di idempotenza non filtrava sull'annullamento, e restituiva la
    ricevuta morta **dichiarando successo**: la famiglia riceveva un foglio
    ritirato, e la prima nota — che i documenti annullati li esclude di
    proposito — mostrava l'incasso senza numero.

    E la stessa forma dell'idempotenza della prima nota: la procedura
    consigliata era resa impossibile dal controllo che la consigliava.
  */
  const prima = await ricevuta();
  assert.ok(prima.receipt_number);

  await documents.cancelDocument(
    { kind: "receipt", documentId: prima.id, reason: "Emessa alla persona sbagliata" },
    scope(),
  );

  const seconda = await ricevuta();

  assert.notEqual(seconda.id, prima.id, "e un documento nuovo, non quello ritirato");
  assert.ok(seconda.receipt_number, "con un numero suo");
  assert.notEqual(
    seconda.receipt_number,
    prima.receipt_number,
    "il numero ritirato non torna disponibile (ADR-0044)",
  );

  const annullata = fake.rows("receipt").find((riga) => riga.id === prima.id);
  assert.ok(annullata.cancelled_at, "l'originale resta, annullato");
});

test("una seconda emissione sullo stesso incasso resta idempotente", async () => {
  /* Il controllo inverso: stretto non vuol dire che emetta due volte. */
  const prima = await ricevuta();
  const seconda = await ricevuta();

  assert.equal(seconda.id, prima.id);
  assert.equal(
    fake.rows("receipt").filter((riga) => riga.transaction_id === "incasso-1").length,
    1,
  );
});

/* ------------------------- la riga viva ma senza numero, e la sequenza */

/**
 * **Un posto occupato da un documento che non esiste.**
 *
 * `receipts_transaction_unico` e unico fra le ricevute **vive** di un incasso,
 * e il controllo di idempotenza ignora — giustamente — quelle senza numero,
 * perche una ricevuta senza numero non e stata emessa. Le due regole insieme
 * lasciavano uno stato senza uscita: una riga viva e non numerata non veniva
 * riconosciuta, e la `INSERT` che seguiva si infrangeva sull'indice.
 *
 * E si infrangeva **dopo** l'allocazione: ogni tentativo bruciava un numero e
 * la sequenza avanzava sul nulla, mentre l'incasso restava per sempre non
 * documentabile.
 */
test("una ricevuta viva e senza numero si riempie, non si duplica", async () => {
  fake.rows("receipt").push({
    id: "ricevuta-orfana",
    organization_id: CLUB,
    transaction_id: "incasso-1",
    receipt_number: null,
    cancelled_at: null,
    amount: 130,
  });

  const emessa = await ricevuta();

  assert.equal(emessa.id, "ricevuta-orfana", "e la stessa riga, riempita");
  assert.ok(emessa.receipt_number, "e adesso ha un numero");
  assert.equal(
    fake.rows("receipt").filter((r) => r.transaction_id === "incasso-1").length,
    1,
    "una sola ricevuta viva per quell'incasso",
  );
});

/**
 * La guardia che il commento della fattura dichiarava e il codice non aveva:
 * il lato ricevuta filtrava sul numero, il lato fattura no. Una fattura senza
 * numero non e stata emessa, e riconoscerla come tale restituirebbe un
 * documento che non esiste dichiarando successo.
 */
test("una fattura viva e senza numero si riempie, e non ne blocca l'emissione", async () => {
  fake.rows("invoice").push({
    id: "fattura-orfana",
    organization_id: CLUB,
    transaction_id: "incasso-1",
    invoice_number: null,
    cancelled_at: null,
    amount: 130,
  });

  const emessa = await documents.issueInvoiceForTransaction(
    { transactionId: "incasso-1" },
    scope(),
  );

  assert.equal(emessa.id, "fattura-orfana", "il posto vuoto si riempie");
  assert.ok(emessa.invoice_number, "e adesso porta un numero");
  assert.equal(
    fake.rows("invoice").filter((r) => r.transaction_id === "incasso-1").length,
    1,
    "una sola fattura viva per quell'incasso",
  );
});
