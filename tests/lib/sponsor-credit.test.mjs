import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * Il **credito di uno sponsor**: dovuto, incassato, residuo.
 *
 * Il difetto che questi test presidiano non e un calcolo sbagliato: e un
 * calcolo salvato. Un contratto da 5.000 firmato a settembre non e denaro
 * entrato, e un residuo scritto in archivio divergerebbe dagli incassi il primo
 * giorno in cui qualcuno storna. Qui si verifica che le tre cifre restino
 * **tre**, che si ricavino a ogni lettura, e che il pattuito non entri mai in
 * prima nota al posto dell'incassato.
 */

let sponsors;

before(async () => {
  sponsors = await import("../../src/lib/sponsors/model.ts");
});

const CONTRATTO_5000 = {
  agreedAmount: "5000",
  startDate: "2026-09-01",
  endDate: "2027-06-30",
  documentReference: "Scrittura privata 12/2026",
  notes: "Due tranche",
};

const sponsorConContratto = (extra = {}) => ({
  id: "sponsor-1",
  name: "Rossi Impianti SRL",
  type: "sponsor",
  vatNumber: "12345678903",
  contract: CONTRATTO_5000,
  ...extra,
});

const incasso = (id, importo, extra = {}) => ({
  id,
  amount: importo,
  paid_at: "2026-10-01T10:00:00.000Z",
  payment_method: "Bonifico",
  counterparty_kind: "SPONSOR",
  counterparty_id: "sponsor-1",
  counterparty_label: "Rossi Impianti SRL",
  ...extra,
});

/* ------------------------------------------------------- lo scenario del piano */

test("contratto 5.000 e incasso 2.000: il residuo e 3.000", () => {
  const sponsor = sponsors.normalizeSponsor(sponsorConContratto());
  const credito = sponsors.resolveSponsorCredit({
    contract: sponsor.contract,
    collections: sponsors.normalizeSponsorCollections([
      incasso("incasso-1", 2000),
    ]),
  });

  assert.equal(credito.dueCents, 500000);
  assert.equal(credito.collectedCents, 200000);
  assert.equal(credito.outstandingCents, 300000);
  assert.equal(credito.isSettled, false);
});

test("in prima nota entra l'incassato, non il pattuito", () => {
  const collections = sponsors.normalizeSponsorCollections([
    incasso("incasso-1", 2000),
  ]);

  /*
    Cio che la prima nota vede sono gli incassi, uno per uno. Il contratto non
    e fra questi e non deve esserlo: un impegno non e un movimento di cassa, e
    proiettarlo produrrebbe 5.000 euro di entrate che nessuno ha ricevuto.
  */
  assert.deepEqual(
    collections.map((riga) => riga.amountCents),
    [200000],
  );
});

test("il credito non incassato non e cassa", () => {
  const credito = sponsors.resolveSponsorCredit({
    contract: sponsors.normalizeSponsorContract(CONTRATTO_5000),
    collections: [],
  });

  assert.equal(credito.dueCents, 500000);
  assert.equal(
    credito.collectedCents,
    0,
    "un contratto firmato e un impegno, non un incasso",
  );
  assert.equal(credito.outstandingCents, 500000);
});

test("il secondo incasso salda il contratto", () => {
  const credito = sponsors.resolveSponsorCredit({
    contract: sponsors.normalizeSponsorContract(CONTRATTO_5000),
    collections: sponsors.normalizeSponsorCollections([
      incasso("incasso-1", 2000),
      incasso("incasso-2", 3000),
    ]),
  });

  assert.equal(credito.collectedCents, 500000);
  assert.equal(credito.outstandingCents, 0);
  assert.equal(credito.isSettled, true);
});

test("un incasso stornato non salda niente", () => {
  const credito = sponsors.resolveSponsorCredit({
    contract: sponsors.normalizeSponsorContract(CONTRATTO_5000),
    collections: sponsors.normalizeSponsorCollections([
      incasso("incasso-1", 2000, { reversed_at: "2026-11-02T09:00:00.000Z" }),
      incasso("storno-1", -2000, { reverses_transaction_id: "incasso-1" }),
    ]),
  });

  assert.equal(credito.collectedCents, 0);
  assert.equal(credito.outstandingCents, 500000);
});

test("un versamento oltre il pattuito lascia il residuo negativo, e si vede", () => {
  const credito = sponsors.resolveSponsorCredit({
    contract: sponsors.normalizeSponsorContract(CONTRATTO_5000),
    collections: sponsors.normalizeSponsorCollections([
      incasso("incasso-1", 6000),
    ]),
  });

  assert.equal(
    credito.outstandingCents,
    -100000,
    "bloccare il residuo a zero nasconderebbe l'unica cosa da decidere",
  );
  assert.equal(credito.isSettled, true);
});

test("senza contratto non c'e niente da saldare", () => {
  const credito = sponsors.resolveSponsorCredit({
    contract: sponsors.normalizeSponsorContract(null),
    collections: sponsors.normalizeSponsorCollections([
      incasso("incasso-1", 500),
    ]),
  });

  assert.equal(credito.hasContract, false);
  assert.equal(credito.dueCents, 0);
  assert.equal(credito.collectedCents, 50000);
  assert.equal(credito.isSettled, false);
});

/* --------------------------------------------------------------- il contratto */

test("il contratto accetta la virgola decimale e la data italiana gia normalizzata", () => {
  const contratto = sponsors.normalizeSponsorContract({
    agreedAmount: "1.234,50",
    startDate: "2026-09-01",
  });

  assert.equal(contratto.agreedAmountCents, 123450);
  assert.equal(
    contratto.startDate,
    "2026-09-01",
    "una data gia in forma ISO non passa da new Date: sposterebbe il giorno",
  );
});

test("un periodo che finisce prima di cominciare viene rifiutato", () => {
  assert.throws(
    () =>
      sponsors.sanitizeSponsorContract({
        agreedAmount: "1000",
        startDate: "2027-01-01",
        endDate: "2026-12-31",
      }),
    /fine del periodo precede l'inizio/,
  );
});

test("un importo pattuito negativo viene rifiutato", () => {
  assert.throws(
    () => sponsors.sanitizeSponsorContract({ agreedAmountCents: -100 }),
    /non puo essere negativo/,
  );
});

test("salvare il contratto non salva il residuo, e non perde cio che non conosce", () => {
  const salvato = sponsors.applySponsorContract(
    { id: "sponsor-1", name: "Rossi", logo: "data:image/png;base64,xxx", iban: "IT60X" },
    sponsors.sanitizeSponsorContract(CONTRATTO_5000),
  );

  assert.equal(salvato.logo, "data:image/png;base64,xxx");
  assert.equal(salvato.iban, "IT60X");
  assert.deepEqual(Object.keys(salvato.contract).sort(), [
    "agreedAmountCents",
    "documentReference",
    "endDate",
    "notes",
    "startDate",
  ]);
});

/* -------------------------------------------------------------- la controparte */

test("l'etichetta della controparte e quella del momento, e non cambia dopo", () => {
  const prima = sponsors.normalizeSponsor(sponsorConContratto());
  const incassoRegistrato = sponsors.buildSponsorCollectionInput({
    organizationId: "club-1",
    sponsor: prima,
    amount: 2000,
    paymentMethod: "Bonifico",
  });

  const dopoIlCambioNome = sponsors.normalizeSponsor(
    sponsorConContratto({ name: "Bianchi Impianti SPA" }),
  );

  assert.equal(incassoRegistrato.counterpartyLabel, "Rossi Impianti SRL");
  assert.equal(
    sponsors.sponsorCounterpartyLabel(dopoIlCambioNome),
    "Bianchi Impianti SPA",
  );
  assert.equal(
    incassoRegistrato.counterpartyLabel,
    "Rossi Impianti SRL",
    "la riga deve poter dire a chi si riferiva anche dopo la rinomina",
  );
  assert.equal(incassoRegistrato.counterpartyId, "sponsor-1");
});

test("un fornitore e una controparte SUPPLIER, uno sponsor una SPONSOR", () => {
  assert.equal(
    sponsors.sponsorCounterpartyKind(
      sponsors.normalizeSponsor({ id: "x", name: "Alfa", type: "fornitore" }),
    ),
    "SUPPLIER",
  );
  assert.equal(
    sponsors.sponsorCounterpartyKind(
      sponsors.normalizeSponsor({ id: "x", name: "Alfa", type: "sponsor" }),
    ),
    "SPONSOR",
  );
});

/* ------------------------------------------------------ l'incasso da registrare */

test("l'incasso sponsor non ha atleta e non ha rata", () => {
  const preparato = sponsors.buildSponsorCollectionInput({
    organizationId: "club-1",
    sponsor: sponsors.normalizeSponsor(sponsorConContratto()),
    amount: "2.000,00",
    paidAt: "2026-10-01",
    paymentMethod: "Bonifico",
    notes: "Prima tranche",
  });

  assert.equal(preparato.athleteId, null);
  assert.equal(preparato.paymentId, null);
  assert.equal(preparato.amount, 2000);
  assert.equal(preparato.counterpartyKind, "SPONSOR");
  assert.equal(
    preparato.operationTypeCode,
    "sponsorizzazione",
    "e l'unica entrata dichiaratamente commerciale del catalogo",
  );
});

test("un incasso senza importo o senza metodo si rifiuta, dicendo perche", () => {
  const sponsor = sponsors.normalizeSponsor(sponsorConContratto());

  assert.throws(
    () =>
      sponsors.buildSponsorCollectionInput({
        organizationId: "club-1",
        sponsor,
        amount: 0,
        paymentMethod: "Bonifico",
      }),
    /maggiore di zero/,
  );

  assert.throws(
    () =>
      sponsors.buildSponsorCollectionInput({
        organizationId: "club-1",
        sponsor,
        amount: 100,
        paymentMethod: "",
      }),
    /metodo di pagamento/,
  );
});

/* ------------------------------------------------------------------ lo storico */

test("nella vecchia collezione un'uscita non e un incasso", () => {
  const righe = sponsors.normalizeLegacySponsorCollections(
    [
      { id: "a", sponsorId: "sponsor-1", amount: 1000, type: "entrata" },
      { id: "b", sponsorId: "sponsor-1", amount: 400, type: "uscita" },
      { id: "c", sponsorId: "sponsor-2", amount: 900, type: "entrata" },
    ],
    "sponsor-1",
  );

  assert.deepEqual(
    righe.map((riga) => riga.id),
    ["a"],
  );
});
