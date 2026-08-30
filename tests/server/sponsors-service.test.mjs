import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Il servizio degli sponsor: contratto, credito, controparte, confini.
 *
 * Tre cose si verificano qui e non altrove.
 *
 * 1. **Il residuo non e in archivio.** Si ricava da contratto e incassi a ogni
 *    lettura, e nessuna scrittura lo salva. Un residuo salvato divergerebbe
 *    dagli incassi il primo giorno in cui qualcuno storna.
 * 2. **La controparte e congelata.** L'etichetta sulla riga e il nome del
 *    momento: se lo sponsor viene rinominato, la riga di sei mesi fa deve
 *    continuare a dire a chi si riferiva.
 * 3. **Il confine e il club.** Uno sponsor di un altro club non si legge, non
 *    si modifica e non si incassa: «Accesso negato», mai i dati.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO_CLUB = "bbbbbbbb-0000-4000-8000-000000000002";
const SPONSOR = "sponsor-1";
const SPONSOR_ALTRUI = "sponsor-9";

let sponsors;
let setPrismaClientForTests;
let fake;

before(async () => {
  sponsors = await import("../../src/lib/server/sponsors.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const scope = (organizationId = CLUB, role = "owner") => ({
  userId: "11111111-0000-4000-8000-00000000000a",
  activeOrganizationId: organizationId,
  activeRole: role,
  allowedOrganizationIds: [organizationId],
});

const risorsa = (organization_id, resource_type, payload) => ({
  id: payload.id,
  organization_id,
  resource_type,
  name: payload.name || null,
  status: null,
  date: null,
  payload,
  created_at: new Date("2026-08-01T00:00:00.000Z"),
  updated_at: new Date("2026-08-01T00:00:00.000Z"),
});

const CONTRATTO = {
  agreedAmountCents: 500000,
  startDate: "2026-09-01",
  endDate: "2027-06-30",
  documentReference: "Scrittura privata 12/2026",
  notes: "Due tranche",
};

const seed = (transactions = []) => ({
  /*
    La riga del club serve davvero: riscrivere una collezione riallinea
    `club_resource_items` **e** la colonna JSON aggregata, e senza il club la
    seconda meta della scrittura fallirebbe — che e proprio l'invariante che
    `resources.ts` esiste per tenere.
  */
  club: [
    { id: CLUB, name: "ASD Alfa", sponsors: [] },
    { id: ALTRO_CLUB, name: "ASD Beta", sponsors: [] },
  ],
  clubResourceItem: [
    risorsa(CLUB, "sponsors", {
      id: SPONSOR,
      name: "Rossi Impianti SRL",
      type: "sponsor",
      vatNumber: "12345678903",
      logo: "data:image/png;base64,xxx",
      iban: "IT60X0542811101000000123456",
      contract: CONTRATTO,
    }),
    risorsa(ALTRO_CLUB, "sponsors", {
      id: SPONSOR_ALTRUI,
      name: "Beta Sport SRL",
      type: "sponsor",
      contract: { agreedAmountCents: 100000 },
    }),
  ],
  paymentTransaction: transactions,
});

const incasso = (id, importo, extra = {}) => ({
  id,
  organization_id: CLUB,
  athlete_id: null,
  payment_id: null,
  amount: importo,
  paid_at: new Date("2026-10-01T10:00:00.000Z"),
  payment_method: "Bonifico",
  source: "MANUAL",
  counterparty_kind: "SPONSOR",
  counterparty_id: SPONSOR,
  counterparty_label: "Rossi Impianti SRL",
  data: {},
  ...extra,
});

const prepara = (transactions = []) => {
  fake = createFakePrisma(seed(transactions));
  setPrismaClientForTests(fake.client);
};

beforeEach(() => prepara());

/* ------------------------------------------------------- lo scenario del piano */

test("contratto 5.000 e incasso 2.000: dovuto, incassato e residuo, mai sommati", async () => {
  prepara([incasso("incasso-1", 2000)]);

  const { credit } = await sponsors.getSponsorCredit(SPONSOR, scope());

  assert.equal(credit.dueCents, 500000);
  assert.equal(credit.collectedCents, 200000);
  assert.equal(credit.outstandingCents, 300000);
  assert.equal(credit.isSettled, false);
});

test("il secondo incasso salda il contratto", async () => {
  prepara([incasso("incasso-1", 2000), incasso("incasso-2", 3000)]);

  const { credit } = await sponsors.getSponsorCredit(SPONSOR, scope());

  assert.equal(credit.collectedCents, 500000);
  assert.equal(credit.outstandingCents, 0);
  assert.equal(credit.isSettled, true);
});

test("il credito non incassato non e cassa", async () => {
  const { credit } = await sponsors.getSponsorCredit(SPONSOR, scope());

  assert.equal(credit.dueCents, 500000);
  assert.equal(credit.collectedCents, 0);
});

test("gli incassi di un altro sponsor non entrano nel credito", async () => {
  prepara([
    incasso("incasso-1", 2000),
    incasso("incasso-2", 900, { counterparty_id: "sponsor-2" }),
  ]);

  const { credit } = await sponsors.getSponsorCredit(SPONSOR, scope());

  assert.equal(credit.collectedCents, 200000);
});

/* ------------------------------------------------------------- il contratto */

test("salvare il contratto non perde logo e iban, e non scrive nessun residuo", async () => {
  await sponsors.saveSponsorContract(
    {
      sponsorId: SPONSOR,
      contract: { agreedAmount: "7500", documentReference: "Rinnovo 2027" },
    },
    scope(),
  );

  const riga = fake
    .rows("clubResourceItem")
    .find((item) => item.payload?.id === SPONSOR);

  assert.equal(riga.payload.logo, "data:image/png;base64,xxx");
  assert.equal(riga.payload.iban, "IT60X0542811101000000123456");
  assert.equal(riga.payload.contract.agreedAmountCents, 750000);
  assert.equal(riga.payload.contract.documentReference, "Rinnovo 2027");
  assert.deepEqual(
    Object.keys(riga.payload.contract).filter((key) =>
      /residu|outstanding|collected/i.test(key),
    ),
    [],
    "il residuo si ricava, non si salva",
  );
});

test("un contratto malformato viene rifiutato prima di toccare l'archivio", async () => {
  await assert.rejects(
    () =>
      sponsors.saveSponsorContract(
        {
          sponsorId: SPONSOR,
          contract: { startDate: "2027-01-01", endDate: "2026-01-01" },
        },
        scope(),
      ),
    /fine del periodo precede l'inizio/,
  );

  const riga = fake
    .rows("clubResourceItem")
    .find((item) => item.payload?.id === SPONSOR);

  assert.equal(riga.payload.contract.agreedAmountCents, 500000);
});

/* -------------------------------------------------------------- la controparte */

test("l'incasso preparato porta la controparte congelata", async () => {
  const preparato = await sponsors.prepareSponsorCollection(
    {
      sponsorId: SPONSOR,
      amount: "2.000,00",
      paidAt: "2026-10-01",
      paymentMethod: "Bonifico",
    },
    scope(),
  );

  assert.equal(preparato.organizationId, CLUB);
  assert.equal(preparato.athleteId, null);
  assert.equal(preparato.paymentId, null);
  assert.equal(preparato.amount, 2000);
  assert.equal(preparato.counterpartyKind, "SPONSOR");
  assert.equal(preparato.counterpartyId, SPONSOR);
  assert.equal(preparato.counterpartyLabel, "Rossi Impianti SRL");
  assert.equal(preparato.operationTypeCode, "sponsorizzazione");
});

test("rinominare lo sponsor non riscrive l'etichetta degli incassi gia registrati", async () => {
  prepara([incasso("incasso-1", 2000)]);

  const riga = fake.rows("clubResourceItem").find((item) => item.payload?.id === SPONSOR);
  riga.payload = { ...riga.payload, name: "Bianchi Impianti SPA" };

  const [registrato] = fake.rows("paymentTransaction");
  const preparatoOggi = await sponsors.prepareSponsorCollection(
    { sponsorId: SPONSOR, amount: 500, paymentMethod: "Contanti" },
    scope(),
  );

  assert.equal(
    registrato.counterparty_label,
    "Rossi Impianti SRL",
    "la riga deve dire a chi si riferiva, non a chi si riferirebbe oggi",
  );
  assert.equal(preparatoOggi.counterpartyLabel, "Bianchi Impianti SPA");
});

/* ------------------------------------------------------------ il multi-tenant */

test("lo sponsor di un altro club non si legge: Accesso negato, mai i dati", async () => {
  await assert.rejects(
    () => sponsors.getSponsorCredit(SPONSOR_ALTRUI, scope()),
    /Accesso negato/,
  );
});

test("lo sponsor di un altro club non si modifica", async () => {
  await assert.rejects(
    () =>
      sponsors.saveSponsorContract(
        { sponsorId: SPONSOR_ALTRUI, contract: { agreedAmount: "1" } },
        scope(),
      ),
    /Accesso negato/,
  );
});

test("un club indicato a mano fuori dal perimetro viene rifiutato", async () => {
  await assert.rejects(
    () =>
      sponsors.listSponsors({ organizationId: ALTRO_CLUB }, scope()),
    /Accesso negato/,
  );
});

test("l'elenco con il credito contiene solo gli sponsor del club", async () => {
  prepara([incasso("incasso-1", 2000)]);

  const righe = await sponsors.listSponsorsWithCredit({}, scope());

  assert.deepEqual(
    righe.map((riga) => riga.sponsor.id),
    [SPONSOR],
  );
  assert.equal(righe[0].credit.outstandingCents, 300000);
});

/* ----------------------------------------------------------------- i permessi */

const RUOLI_CHE_VEDONO = ["owner", "club_manager", "collaborator", "staff"];
const RUOLI_CHE_NON_VEDONO = ["trainer", "parent", "athlete"];

for (const ruolo of RUOLI_CHE_VEDONO) {
  test(`${ruolo} vede il credito di uno sponsor`, async () => {
    const { credit } = await sponsors.getSponsorCredit(
      SPONSOR,
      scope(CLUB, ruolo),
    );
    assert.equal(credit.dueCents, 500000);
  });

  test(`${ruolo} puo registrare il contratto`, async () => {
    const aggiornato = await sponsors.saveSponsorContract(
      { sponsorId: SPONSOR, contract: { agreedAmount: "1000" } },
      scope(CLUB, ruolo),
    );
    assert.equal(aggiornato.contract.agreedAmountCents, 100000);
  });
}

for (const ruolo of RUOLI_CHE_NON_VEDONO) {
  test(`${ruolo} non vede il credito, e il messaggio dice cosa ha negato`, async () => {
    await assert.rejects(
      () => sponsors.getSponsorCredit(SPONSOR, scope(CLUB, ruolo)),
      /Accesso negato: il ruolo attivo non puo vedere la prima nota/,
    );
  });

  test(`${ruolo} non registra il contratto`, async () => {
    await assert.rejects(
      () =>
        sponsors.saveSponsorContract(
          { sponsorId: SPONSOR, contract: { agreedAmount: "1" } },
          scope(CLUB, ruolo),
        ),
      /Accesso negato/,
    );
  });
}

/* ============================= l'incasso arriva davvero nel registro === */

/*
  **L'anello che mancava, e cosa costava.**

  `prepareSponsorCollection` produceva l'incasso gia pronto e si fermava li,
  «per la dipendenza verso W4-C». La dipendenza era chiusa da tempo, e la
  conseguenza non era teorica: la schermata degli sponsor continuava a scrivere
  nella collezione JSON annidata sulla scheda, e il denaro di uno sponsor **non
  arrivava mai in prima nota**.

  Il §12 del piano chiede che un contratto da 5.000 con 2.000 incassati produca
  2.000 di entrata nel registro. Ne produceva zero: il residuo dello sponsor era
  giusto, il rendiconto del club no.
*/

test("l'incasso di uno sponsor diventa una riga del registro degli incassi", async () => {
  const esito = await sponsors.recordSponsorCollection(
    {
      sponsorId: SPONSOR,
      amount: 2000,
      paidAt: "2026-10-01T10:00:00.000Z",
      paymentMethod: "Bonifico",
      notes: "Prima tranche",
    },
    scope(),
  );

  const righe = fake.rows("paymentTransaction");
  assert.equal(righe.length, 1, "l'incasso e una riga di payment_transactions");

  const riga = righe[0];
  assert.equal(riga.organization_id, CLUB);
  assert.equal(riga.amount, 2000);
  assert.equal(riga.athlete_id, null, "un incasso di sponsorizzazione non ha un atleta");
  assert.equal(riga.counterparty_kind, "SPONSOR");
  assert.equal(riga.counterparty_id, SPONSOR);
  assert.equal(
    riga.counterparty_label,
    "Rossi Impianti SRL",
    "l'etichetta e congelata: la riga deve dire a chi si riferiva anche dopo una rinomina",
  );
  assert.ok(esito, "il servizio restituisce l'esito del registro");

  /* E nessuna riga e finita nella vecchia collezione JSON. */
  assert.equal(
    fake.rows("clubResourceItem").filter((r) => r.resource_type === "sponsor_payments")
      .length,
    0,
  );
});

test("dopo l'incasso il residuo scende, e le due letture concordano", async () => {
  await sponsors.recordSponsorCollection(
    {
      sponsorId: SPONSOR,
      amount: 2000,
      paidAt: "2026-10-01T10:00:00.000Z",
      paymentMethod: "Bonifico",
    },
    scope(),
  );

  const { credit } = await sponsors.getSponsorCredit(SPONSOR, scope());
  assert.equal(credit.dueCents, 500000);
  assert.equal(credit.collectedCents, 200000);
  assert.equal(credit.outstandingCents, 300000);
});

test("l'incasso di uno sponsor di un altro club non si registra", async () => {
  await assert.rejects(
    () =>
      sponsors.recordSponsorCollection(
        { sponsorId: SPONSOR_ALTRUI, amount: 2000, paymentMethod: "Bonifico" },
        scope(),
      ),
    /Accesso negato/,
  );

  assert.equal(fake.rows("paymentTransaction").length, 0);
});

test("il contratto si salva senza riscrivere gli altri sponsor", async () => {
  /*
    `saveSponsorContract` riscriveva l'intera collezione: due contratti salvati
    insieme si infrangevano su un conflitto di chiave primaria in
    `club_resource_items`, tutte e otto le volte, con un messaggio che a chi lo
    riceveva non diceva niente. Adesso tocca una riga sola.
  */
  fake.rows("clubResourceItem").push(
    risorsa(CLUB, "sponsors", {
      id: "sponsor-2",
      name: "Bianchi Sport",
      type: "sponsor",
      contract: { agreedAmountCents: 100000 },
    }),
  );

  await sponsors.saveSponsorContract(
    { sponsorId: SPONSOR, contract: { ...CONTRATTO, agreedAmountCents: 700000 } },
    scope(),
  );

  const righe = fake
    .rows("clubResourceItem")
    .filter((r) => r.resource_type === "sponsors" && r.organization_id === CLUB);

  assert.equal(righe.length, 2, "nessuna riga cancellata e ricreata");

  const toccato = righe.find((r) => r.payload.id === SPONSOR);
  const altro = righe.find((r) => r.payload.id === "sponsor-2");

  assert.equal(toccato.payload.contract.agreedAmountCents, 700000);
  assert.equal(
    altro.payload.contract.agreedAmountCents,
    100000,
    "l'altro contratto non e stato toccato",
  );
  assert.equal(
    toccato.payload.iban,
    "IT60X0542811101000000123456",
    "i campi che il contratto non nomina restano",
  );
});
