import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **W4-B — la prima nota.**
 *
 * Gli scenari sono quelli del §37 del piano, scritti **prima** del codice e non
 * riscrivibili da chi implementa.
 *
 * La cosa che questi test difendono piu di ogni altra e il principio della
 * Wave: la prima nota **possiede** il movimento manuale e il giroconto, e
 * **legge** tutto il resto. Un incasso o un compenso scritti qui sarebbero la
 * seconda contabilita.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const ALTRO = "bbbbbbbb-0000-4000-8000-000000000002";
const CASSA = "cccccccc-0000-4000-8000-00000000c001";
const BANCA = "cccccccc-0000-4000-8000-00000000c002";
const CASSA_ALTRUI = "cccccccc-0000-4000-8000-00000000c999";
const UTENTE = "11111111-0000-4000-8000-000000000aaa";

const scope = () => ({
  userId: UTENTE,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

const scopeAltrui = () => ({
  userId: "22222222-0000-4000-8000-000000000bbb",
  activeOrganizationId: ALTRO,
  activeRole: "owner",
  allowedOrganizationIds: [ALTRO],
});

const PIENI = { manage: true, reverse: true, reconcile: true };

let accounting;
let setPrismaClientForTests;
let fake;

const seed = () => ({
  club: [
    {
      id: CLUB,
      slug: "club-a",
      name: "Club A",
      transactions: [],
      transfers: [],
      settings: {
        seasons: [
          {
            id: "2026-27",
            label: "2026/27",
            startDate: "2026-07-01",
            endDate: "2027-06-30",
            status: "active",
          },
          {
            id: "2025-26",
            label: "2025/26",
            startDate: "2025-07-01",
            endDate: "2026-06-30",
            status: "archived",
          },
        ],
      },
    },
    { id: ALTRO, slug: "club-b", name: "Club B", transactions: [], transfers: [] },
  ],
  financialAccount: [
    { id: CASSA, organization_id: CLUB, name: "Cassa", kind: "CASH", is_archived: false },
    { id: BANCA, organization_id: CLUB, name: "Banca", kind: "BANK", is_archived: false },
    {
      id: CASSA_ALTRUI,
      organization_id: ALTRO,
      name: "Cassa",
      kind: "CASH",
      is_archived: false,
    },
  ],
  fiscalOperationType: [
    {
      id: "ft-1",
      organization_id: CLUB,
      code: "affitto_impianto",
      label: "Affitto impianto",
      activity_scope: "institutional",
      is_active: true,
    },
    {
      id: "ft-2",
      organization_id: CLUB,
      code: "quota_attivita",
      label: "Quota attivita",
      activity_scope: "unspecified",
      is_active: true,
    },
    {
      id: "ft-3",
      organization_id: CLUB,
      code: "ritirata",
      label: "Voce ritirata",
      activity_scope: "unspecified",
      is_active: false,
    },
    {
      id: "ft-altrui",
      organization_id: ALTRO,
      code: "solo_loro",
      label: "Solo loro",
      activity_scope: "commercial",
      is_active: true,
    },
  ],
  accountingEntry: [],
  paymentTransaction: [],
  sportWorkOutboundTransaction: [],
  fundingSettlement: [],
  auditLog: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  accounting = await import("../../src/lib/server/accounting.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const righe = () => fake.rows("accountingEntry");

const movimento = (over = {}) => ({
  entryDate: "2026-09-15T00:00:00.000Z",
  direction: "OUT",
  amount: 150,
  financialAccountId: CASSA,
  operationTypeCode: "affitto_impianto",
  description: "Affitto palestra settembre",
  ...over,
});

/* ==================================================== il movimento manuale */

test("un movimento manuale nasce con data, conto, causale e autore", async () => {
  const riga = await accounting.createAccountingEntry(movimento(), scope());

  assert.equal(riga.direction, "OUT");
  assert.equal(riga.amount_cents, 15000);
  assert.equal(riga.financial_account_id, CASSA);
  assert.equal(riga.operation_type_code, "affitto_impianto");
  assert.equal(riga.created_by, UTENTE, "prima un movimento non sapeva chi l'aveva scritto");
});

test("l'anno fiscale si deriva dalla data, e non arriva dal client", async () => {
  const riga = await accounting.createAccountingEntry(
    movimento({ entryDate: "2027-01-08T00:00:00.000Z" }),
    scope(),
  );

  assert.equal(riga.fiscal_year, 2027);
});

test("la classificazione della causale si congela sulla riga", async () => {
  /*
    La causale e configurazione **mutabile**: se domani il club ne corregge la
    natura, tutti i movimenti passati cambierebbero natura retroattivamente. E
    lo stesso motivo per cui il lavoro sportivo congela contributi e aliquote.
  */
  const riga = await accounting.createAccountingEntry(movimento(), scope());

  assert.equal(riga.activity_scope_snapshot, "institutional");
  assert.equal(riga.operation_type_label_snapshot, "Affitto impianto");

  fake.rows("fiscalOperationType")[0].activity_scope = "commercial";

  assert.equal(
    righe()[0].activity_scope_snapshot,
    "institutional",
    "cambiare la causale non riscrive il passato",
  );
});

test("un movimento senza causale si rifiuta, e dice perche", async () => {
  await assert.rejects(
    () => accounting.createAccountingEntry(movimento({ operationTypeCode: "" }), scope()),
    /senza causale nasce gia sbagliato/i,
  );
  assert.equal(righe().length, 0);
});

test("una causale disattivata non si usa piu per registrare", async () => {
  await assert.rejects(
    () => accounting.createAccountingEntry(movimento({ operationTypeCode: "ritirata" }), scope()),
    /disattivata/i,
  );
});

test("una causale che il club non ha configurato si rifiuta", async () => {
  await assert.rejects(
    () => accounting.createAccountingEntry(movimento({ operationTypeCode: "inventata" }), scope()),
    /non trovata fra quelle configurate/i,
  );
});

test("l'importo e sempre positivo: il segno lo dice il verso", async () => {
  await assert.rejects(
    () => accounting.createAccountingEntry(movimento({ amount: -150 }), scope()),
    /maggiore di zero|segno lo dice il verso/i,
  );
});

test("un movimento su un conto archiviato si rifiuta", async () => {
  fake.rows("financialAccount")[0].is_archived = true;

  await assert.rejects(
    () => accounting.createAccountingEntry(movimento(), scope()),
    /archiviato/i,
  );
});

/* ======================================================= il giroconto */

test("un giroconto nasce come due gambe, con lo stesso gruppo", async () => {
  const esito = await accounting.createInternalTransfer(
    {
      entryDate: "2026-09-20T00:00:00.000Z",
      amount: 500,
      fromAccountId: CASSA,
      toAccountId: BANCA,
    },
    scope(),
  );

  assert.equal(esito.entries.length, 2);
  const [uscita, entrata] = esito.entries;
  assert.equal(uscita.direction, "OUT");
  assert.equal(uscita.financial_account_id, CASSA);
  assert.equal(entrata.direction, "IN");
  assert.equal(entrata.financial_account_id, BANCA);
  assert.equal(uscita.transfer_group_id, entrata.transfer_group_id);
});

test("500 euro spostati non sono 500 euro guadagnati", async () => {
  /*
    Il vecchio modello aveva un terzo verso, e ogni consumatore doveva
    ricordarsi di escluderlo dai totali. Qui la liquidita totale non cambia
    perche le due gambe si compensano, non perche qualcuno si ricorda di
    saltarle.
  */
  await accounting.createInternalTransfer(
    { entryDate: "2026-09-20T00:00:00.000Z", amount: 500, fromAccountId: CASSA, toAccountId: BANCA },
    scope(),
  );

  const saldo = (conto) =>
    righe()
      .filter((r) => r.financial_account_id === conto)
      .reduce((s, r) => s + (r.direction === "IN" ? r.amount_cents : -r.amount_cents), 0);

  assert.equal(saldo(CASSA), -50000);
  assert.equal(saldo(BANCA), 50000);
  assert.equal(saldo(CASSA) + saldo(BANCA), 0, "la liquidita totale non si muove");
});

test("un giroconto fra un conto e se stesso non sposta niente: si rifiuta", async () => {
  await assert.rejects(
    () =>
      accounting.createInternalTransfer(
        { entryDate: "2026-09-20T00:00:00.000Z", amount: 500, fromAccountId: CASSA, toAccountId: CASSA },
        scope(),
      ),
    /se stesso/i,
  );
});

test("il giroconto e una transazione sola: se una gamba fallisce non resta l'altra", async () => {
  /*
    Oggi sono due chiamate HTTP separate, e un giroconto a meta lascia denaro
    sparito: uscito da un conto e mai arrivato nell'altro.
  */
  await assert.rejects(
    () =>
      accounting.createInternalTransfer(
        {
          entryDate: "2026-09-20T00:00:00.000Z",
          amount: 500,
          fromAccountId: CASSA,
          toAccountId: CASSA_ALTRUI,
        },
        scope(),
      ),
    /Conto finanziario non trovato/i,
  );

  assert.equal(righe().length, 0, "nessuna gamba deve essere sopravvissuta");
});

/* ============================================================ lo storno */

test("un movimento si storna: nasce la riga opposta e l'originale resta", async () => {
  const originale = await accounting.createAccountingEntry(movimento(), scope());

  const [storno] = await accounting.reverseAccountingEntry(
    { entryId: originale.id, reason: "Registrato due volte" },
    scope(),
  );

  assert.equal(storno.direction, "IN", "l'opposto di un'uscita");
  assert.equal(storno.amount_cents, 15000);
  assert.equal(storno.reversal_of_id, originale.id);
  assert.equal(storno.source_domain, "REVERSAL");

  const rimasto = righe().find((r) => r.id === originale.id);
  assert.ok(rimasto, "il denaro non si cancella");
  assert.equal(rimasto.reversal_reason, "Registrato due volte");
});

test("lo storno eredita la causale e la classificazione congelata", async () => {
  /*
    Uno storno classificato diversamente sposterebbe denaro da una voce di
    rendiconto a un'altra senza che nessuno lo abbia deciso.
  */
  const originale = await accounting.createAccountingEntry(movimento(), scope());
  const [storno] = await accounting.reverseAccountingEntry(
    { entryId: originale.id, reason: "Errore" },
    scope(),
  );

  assert.equal(storno.operation_type_code, "affitto_impianto");
  assert.equal(storno.activity_scope_snapshot, "institutional");
});

test("uno storno non si storna", async () => {
  const originale = await accounting.createAccountingEntry(movimento(), scope());
  const [storno] = await accounting.reverseAccountingEntry(
    { entryId: originale.id, reason: "Errore" },
    scope(),
  );

  await assert.rejects(
    () => accounting.reverseAccountingEntry({ entryId: storno.id, reason: "Ancora" }, scope()),
    /storno non si storna/i,
  );
});

test("niente doppio storno dello stesso movimento", async () => {
  const originale = await accounting.createAccountingEntry(movimento(), scope());
  await accounting.reverseAccountingEntry({ entryId: originale.id, reason: "Errore" }, scope());

  await assert.rejects(
    () => accounting.reverseAccountingEntry({ entryId: originale.id, reason: "Di nuovo" }, scope()),
    /gia stato stornato/i,
  );

  assert.equal(righe().filter((r) => r.reversal_of_id === originale.id).length, 1);
});

test("uno storno senza motivo si rifiuta", async () => {
  const originale = await accounting.createAccountingEntry(movimento(), scope());

  await assert.rejects(
    () => accounting.reverseAccountingEntry({ entryId: originale.id, reason: "   " }, scope()),
    /deve dire perche/i,
  );
});

test("un giroconto si storna intero: entrambe le gambe insieme", async () => {
  /*
    Stornarne una sola lascerebbe il denaro sparito fra due conti, che e
    esattamente cio che il giroconto atomico esiste per impedire.
  */
  const esito = await accounting.createInternalTransfer(
    { entryDate: "2026-09-20T00:00:00.000Z", amount: 500, fromAccountId: CASSA, toAccountId: BANCA },
    scope(),
  );

  const storni = await accounting.reverseAccountingEntry(
    { entryId: esito.entries[0].id, reason: "Giroconto sbagliato" },
    scope(),
  );

  assert.equal(storni.length, 2, "due gambe, due storni");
  assert.equal(
    righe().filter((r) => r.reversed_at).length,
    2,
    "entrambe le gambe risultano stornate",
  );
});

/* ================================================== la riconciliazione */

test("un movimento si spunta contro l'estratto conto", async () => {
  const riga = await accounting.createAccountingEntry(movimento(), scope());

  const spuntato = await accounting.reconcileAccountingEntry(
    {
      entryId: riga.id,
      status: "reconciled",
      valueDate: "2026-09-17T00:00:00.000Z",
      bankReference: "CRO 998877",
    },
    scope(),
  );

  assert.equal(spuntato.reconciliation_status, "reconciled");
  assert.equal(spuntato.bank_reference, "CRO 998877");
  assert.equal(spuntato.reconciled_by, UTENTE);
});

test("un movimento stornato non si riconcilia", async () => {
  const riga = await accounting.createAccountingEntry(movimento(), scope());
  await accounting.reverseAccountingEntry({ entryId: riga.id, reason: "Errore" }, scope());

  await assert.rejects(
    () => accounting.reconcileAccountingEntry({ entryId: riga.id, status: "reconciled" }, scope()),
    /non e mai arrivato in banca/i,
  );
});

test("uno stato di riconciliazione fuori catalogo si rifiuta", async () => {
  const riga = await accounting.createAccountingEntry(movimento(), scope());

  await assert.rejects(
    () => accounting.reconcileAccountingEntry({ entryId: riga.id, status: "forse" }, scope()),
    /sconosciuto/i,
  );
});

/* ========================================================= multi-tenant */

test("il conto di un altro club come bersaglio: rifiutato", async () => {
  await assert.rejects(
    () =>
      accounting.createAccountingEntry(movimento({ financialAccountId: CASSA_ALTRUI }), scope()),
    /Conto finanziario non trovato/i,
  );
  assert.equal(righe().length, 0);
});

test("la causale di un altro club: rifiutata", async () => {
  await assert.rejects(
    () => accounting.createAccountingEntry(movimento({ operationTypeCode: "solo_loro" }), scope()),
    /non trovata fra quelle configurate/i,
  );
});

test("il movimento di un altro club non si storna e non si riconcilia", async () => {
  const riga = await accounting.createAccountingEntry(movimento(), scope());

  await assert.rejects(
    () => accounting.reverseAccountingEntry({ entryId: riga.id, reason: "x" }, scopeAltrui()),
    /Accesso negato/,
  );
  await assert.rejects(
    () =>
      accounting.reconcileAccountingEntry(
        { entryId: riga.id, status: "reconciled" },
        scopeAltrui(),
      ),
    /Accesso negato/,
  );
});

test("l'elenco di un club non contiene una riga di un altro", async () => {
  await accounting.createAccountingEntry(movimento(), scope());

  const esito = await accounting.listAccountingEntries({}, scopeAltrui(), PIENI);

  assert.equal(esito.entries.length, 0);
});

/* ================================================== elenco e filtri */

test("l'elenco unisce righe proprie e righe proiettate", async () => {
  await accounting.createAccountingEntry(movimento(), scope());
  fake.rows("paymentTransaction").push({
    id: "inc-1",
    organization_id: CLUB,
    paid_at: new Date("2026-09-10T00:00:00Z"),
    amount: 200,
    payment_method: "Contanti",
    athlete_id: null,
    financial_account_id: CASSA,
  });

  const esito = await accounting.listAccountingEntries({}, scope(), PIENI);

  assert.equal(esito.total, 2);
  assert.deepEqual(
    esito.entries.map((r) => r.sourceDomain).sort(),
    ["ATHLETE_PAYMENT", "MANUAL"],
  );
});

test("una riga proiettata resta in sola lettura anche per il proprietario", async () => {
  fake.rows("paymentTransaction").push({
    id: "inc-1",
    organization_id: CLUB,
    paid_at: new Date("2026-09-10T00:00:00Z"),
    amount: 200,
    payment_method: "Contanti",
    financial_account_id: CASSA,
  });

  const esito = await accounting.listAccountingEntries({}, scope(), PIENI);
  const proiettata = esito.entries.find((r) => r.sourceDomain === "ATHLETE_PAYMENT");

  assert.equal(proiettata.canEdit, false);
  assert.equal(proiettata.canDelete, false);
  assert.equal(
    proiettata.canReverse,
    false,
    "un incasso si storna dove gli incassi si registrano",
  );
});

test("il filtro senza anno non risponde elenco vuoto", async () => {
  /*
    La trappola del §14: `searchParams.get()` restituisce `null` quando il
    parametro manca, `Number(null)` vale `0`, ed e un intero. Un filtro scritto
    a mano avrebbe filtrato `fiscal_year = 0`, cioe elenco vuoto per chiunque
    non chieda un anno.
  */
  await accounting.createAccountingEntry(movimento(), scope());

  for (const valore of [null, undefined, "", "  "]) {
    const esito = await accounting.listAccountingEntries(
      { fiscalYear: valore },
      scope(),
      PIENI,
    );
    assert.equal(esito.total, 1, `con fiscalYear = ${JSON.stringify(valore)}`);
  }
});

test("anno fiscale e stagione sono due assi: 2026 prende solo i suoi", async () => {
  await accounting.createAccountingEntry(
    movimento({ entryDate: "2026-09-15T00:00:00.000Z", seasonId: "2026-27" }),
    scope(),
  );
  await accounting.createAccountingEntry(
    movimento({ entryDate: "2027-01-08T00:00:00.000Z", seasonId: "2026-27" }),
    scope(),
  );

  const fiscale = await accounting.listAccountingEntries({ fiscalYear: 2026 }, scope(), PIENI);
  const stagione = await accounting.listAccountingEntries(
    { seasonId: "2026-27" },
    scope(),
    PIENI,
  );

  assert.equal(fiscale.total, 1, "il riepilogo fiscale 2026 prende solo settembre");
  assert.equal(stagione.total, 2, "la stagione li prende entrambi");
});

test("i filtri per conto, verso e causale restringono l'elenco", async () => {
  await accounting.createAccountingEntry(movimento(), scope());
  await accounting.createAccountingEntry(
    movimento({
      direction: "IN",
      financialAccountId: BANCA,
      operationTypeCode: "quota_attivita",
      description: "Contributo comunale",
    }),
    scope(),
  );

  assert.equal(
    (await accounting.listAccountingEntries({ financialAccountId: BANCA }, scope(), PIENI)).total,
    1,
  );
  assert.equal(
    (await accounting.listAccountingEntries({ direction: "OUT" }, scope(), PIENI)).total,
    1,
  );
  assert.equal(
    (
      await accounting.listAccountingEntries(
        { operationTypeCode: "quota_attivita" },
        scope(),
        PIENI,
      )
    ).total,
    1,
  );
});

/* ========================================== i movimenti storici del blob */

test("i movimenti storici restano visibili, in sola lettura", async () => {
  /*
    Non sono stati travasati in tabella: travasarli avrebbe richiesto di
    **inventare** per ognuno un conto e una causale che nessuno ha mai
    dichiarato. Compaiono, e non si cancellano piu da un `confirm()` del
    browser — che era il difetto D-3.
  */
  fake.rows("club")[0].transactions = [
    {
      id: "vecchio-1",
      date: "2025-11-03T00:00:00.000Z",
      amount: 250,
      type: "income",
      description: "Incasso torneo di Natale",
    },
  ];

  const esito = await accounting.listAccountingEntries({}, scope(), PIENI);
  const storico = esito.entries.find((r) => r.id.startsWith("legacy-transaction:"));

  assert.ok(storico, "la storia non si perde");
  assert.equal(storico.amountCents, 25000);
  assert.equal(storico.canDelete, false);
  assert.equal(storico.canEdit, false);
});

test("un movimento storico non ha conto: il suo effetto e gia nel saldo di apertura", async () => {
  /*
    `opening_balance_cents` e cio che il vecchio blob dichiarava il giorno della
    migrazione, ed e **la somma di quei movimenti**. Attribuirli a una cassa li
    conterebbe due volte.
  */
  fake.rows("club")[0].transactions = [
    { id: "vecchio-1", date: "2025-11-03T00:00:00.000Z", amount: 250, type: "income" },
  ];

  const esito = await accounting.listAccountingEntries({}, scope(), PIENI);
  const storico = esito.entries.find((r) => r.id.startsWith("legacy-transaction:"));

  assert.equal(storico.financialAccountId, null);
  assert.equal(
    storico.activityScope,
    "unspecified",
    "e la verita: nessuno l'ha mai classificato",
  );
});

/* ================================================================ audit */

test("l'audit porta l'id del movimento, non quello del club", async () => {
  /*
    Prima un movimento manuale finiva in `resource.updated` su `clubs` con l'id
    **del club**: chi leggeva l'audit sapeva che qualcuno aveva modificato
    qualcosa, senza sapere cosa.
  */
  const riga = await accounting.createAccountingEntry(movimento(), scope());

  const traccia = fake
    .rows("auditLog")
    .find((r) => r.action === "accounting.entry.recorded");

  assert.ok(traccia);
  assert.equal(traccia.resource_id, riga.id);
  assert.equal(traccia.actor_user_id, UTENTE);
});

test("storno e riconciliazione lasciano la loro traccia", async () => {
  const riga = await accounting.createAccountingEntry(movimento(), scope());
  await accounting.reverseAccountingEntry({ entryId: riga.id, reason: "Errore" }, scope());

  const azioni = fake.rows("auditLog").map((r) => r.action);
  assert.ok(azioni.includes("accounting.entry.reversed"));
});

/* ================================= la stagione, anche sulle proiezioni */

test("il filtro per stagione prende anche le righe proiettate", async () => {
  /*
    Difetto trovato dalla lane del rendiconto. Il filtro scendeva nel `where` di
    Prisma, che vale **solo per le righe proprie**: le proiezioni — incassi,
    compensi, liquidazioni — non hanno una colonna `season_id` e non possono
    averla, quindi passavano tutte. Un riepilogo filtrato per stagione mostrava
    gli incassi di **ogni** stagione.

    Una riga che non dichiara una stagione appartiene a quella nel cui periodo
    cade: e la stessa forma con cui l'anno fiscale si deriva dalla data.
  */
  fake.rows("paymentTransaction").push(
    {
      id: "inc-dentro",
      organization_id: CLUB,
      paid_at: new Date("2026-09-10T00:00:00Z"),
      amount: 200,
      payment_method: "Contanti",
      financial_account_id: CASSA,
    },
    {
      id: "inc-fuori",
      organization_id: CLUB,
      paid_at: new Date("2025-09-10T00:00:00Z"),
      amount: 300,
      payment_method: "Contanti",
      financial_account_id: CASSA,
    },
  );

  const esito = await accounting.listAccountingEntries(
    { seasonId: "2026-27" },
    scope(),
    PIENI,
  );

  assert.deepEqual(
    esito.entries.map((r) => r.sourceId),
    ["inc-dentro"],
    "l'incasso della stagione precedente non deve comparire",
  );
});

test("l'ultimo giorno della stagione ci sta dentro", async () => {
  /*
    Una stagione che finisce il 30 giugno contiene il 30 giugno. Senza
    l'ultimo istante del giorno, un incasso di quella mattina cadrebbe fuori da
    entrambe le stagioni.
  */
  fake.rows("paymentTransaction").push({
    id: "inc-ultimo",
    organization_id: CLUB,
    paid_at: new Date("2027-06-30T09:00:00Z"),
    amount: 100,
    payment_method: "Contanti",
    financial_account_id: CASSA,
  });

  const esito = await accounting.listAccountingEntries(
    { seasonId: "2026-27" },
    scope(),
    PIENI,
  );

  assert.equal(esito.total, 1);
});

test("una riga propria che dichiara la stagione risponde con quella", async () => {
  /*
    Un movimento registrato in una stagione e retrodatato a un'altra deve
    restare dove l'operatore l'ha messo: la dichiarazione vince sulla data.
  */
  await accounting.createAccountingEntry(
    movimento({ entryDate: "2026-03-10T00:00:00.000Z", seasonId: "2026-27" }),
    scope(),
  );

  const dichiarata = await accounting.listAccountingEntries(
    { seasonId: "2026-27" },
    scope(),
    PIENI,
  );
  const perData = await accounting.listAccountingEntries(
    { seasonId: "2025-26" },
    scope(),
    PIENI,
  );

  assert.equal(dichiarata.total, 1, "vale la stagione dichiarata");
  assert.equal(perData.total, 0, "e non quella in cui la data cadrebbe");
});

test("una stagione che il club non ha configurato da elenco vuoto, non un errore", async () => {
  await accounting.createAccountingEntry(movimento(), scope());

  const esito = await accounting.listAccountingEntries(
    { seasonId: "1999-2000" },
    scope(),
    PIENI,
  );

  assert.equal(esito.total, 0);
});

test("senza stagioni configurate il filtro non fa sparire il denaro", async () => {
  /*
    Un club che non ha ancora configurato le stagioni non permette di attribuire
    per data una riga che la stagione non la dichiara. Rispondere elenco vuoto
    farebbe sparire denaro vero per una configurazione mancante: vale la sola
    regola che il dato sostiene — chi dichiara la stagione risponde con quella.
  */
  fake.rows("club")[0].settings = {};

  await accounting.createAccountingEntry(
    movimento({ seasonId: "2026-27" }),
    scope(),
  );
  await accounting.createAccountingEntry(
    movimento({ seasonId: "2025-26", description: "Altra stagione" }),
    scope(),
  );

  const esito = await accounting.listAccountingEntries(
    { seasonId: "2026-27" },
    scope(),
    PIENI,
  );

  assert.equal(esito.total, 1);
  assert.equal(esito.entries[0].seasonId, "2026-27");
});

/* ================================ la correzione, e cio che non corregge */

test("si correggono descrizione, note, metodo e controparte", async () => {
  const riga = await accounting.createAccountingEntry(movimento(), scope());

  const corretto = await accounting.updateAccountingEntry(
    {
      entryId: riga.id,
      description: "Affitto palestra settembre (rettificato)",
      notes: "Ricevuta 12/A",
      paymentMethod: "Bonifico",
      counterpartyKind: "SUPPLIER",
      counterpartyLabel: "Palestra Comunale",
    },
    scope(),
  );

  assert.match(corretto.description, /rettificato/);
  assert.equal(corretto.payment_method, "Bonifico");
  assert.equal(corretto.counterparty_kind, "SUPPLIER");
});

test("data, verso, importo e conto non si correggono: sono il fatto", async () => {
  /*
    Se uno di essi e sbagliato, il movimento registrato non e mai avvenuto
    cosi, e la risposta e uno storno. Poterli riscrivere vorrebbe dire far
    diventare un movimento da 10.000 EUR uno da 10 senza che nessuno se ne
    accorga: e il difetto D-3 rientrato dalla finestra.
  */
  const riga = await accounting.createAccountingEntry(movimento(), scope());

  await accounting.updateAccountingEntry(
    {
      entryId: riga.id,
      // Campi che la firma non accetta: restano fuori anche se un client li manda.
      description: "Solo la descrizione",
    },
    scope(),
  );

  const dopo = righe().find((r) => r.id === riga.id);
  assert.equal(dopo.amount_cents, 15000);
  assert.equal(dopo.direction, "OUT");
  assert.equal(dopo.financial_account_id, CASSA);
  assert.equal(
    new Date(dopo.entry_date).toISOString(),
    "2026-09-15T00:00:00.000Z",
  );
});

test("riclassificare una riga ricongela l'ambito, e lascia traccia di prima e dopo", async () => {
  /*
    Il congelamento impedisce che modificare una causale **nel catalogo**
    riscriva la natura di mille movimenti passati, in silenzio. Riclassificare
    **una** riga e l'opposto: una decisione di una persona, con un autore.
  */
  const riga = await accounting.createAccountingEntry(movimento(), scope());
  assert.equal(riga.activity_scope_snapshot, "institutional");

  const corretto = await accounting.updateAccountingEntry(
    { entryId: riga.id, operationTypeCode: "quota_attivita" },
    scope(),
  );

  assert.equal(corretto.operation_type_code, "quota_attivita");
  assert.equal(corretto.activity_scope_snapshot, "unspecified");

  const traccia = fake
    .rows("auditLog")
    .find((r) => r.action === "accounting.entry.updated");
  assert.equal(traccia.metadata.causalePrima, "affitto_impianto");
  assert.equal(traccia.metadata.ambitoPrima, "institutional");
  assert.equal(traccia.metadata.causaleDopo, "quota_attivita");
});

test("una riga stornata non si corregge", async () => {
  const riga = await accounting.createAccountingEntry(movimento(), scope());
  await accounting.reverseAccountingEntry({ entryId: riga.id, reason: "Errore" }, scope());

  await assert.rejects(
    () => accounting.updateAccountingEntry({ entryId: riga.id, notes: "x" }, scope()),
    /non si corregge/i,
  );
});

test("uno storno e un giroconto non si correggono", async () => {
  const riga = await accounting.createAccountingEntry(movimento(), scope());
  const [storno] = await accounting.reverseAccountingEntry(
    { entryId: riga.id, reason: "Errore" },
    scope(),
  );
  const giro = await accounting.createInternalTransfer(
    { entryDate: "2026-09-20T00:00:00.000Z", amount: 500, fromAccountId: CASSA, toAccountId: BANCA },
    scope(),
  );

  await assert.rejects(
    () => accounting.updateAccountingEntry({ entryId: storno.id, notes: "x" }, scope()),
    /storno non si corregge/i,
  );
  await assert.rejects(
    () =>
      accounting.updateAccountingEntry({ entryId: giro.entries[0].id, notes: "x" }, scope()),
    /una gamba per volta/i,
  );
});

test("una causale di un altro club non si usa per riclassificare", async () => {
  const riga = await accounting.createAccountingEntry(movimento(), scope());

  await assert.rejects(
    () =>
      accounting.updateAccountingEntry(
        { entryId: riga.id, operationTypeCode: "solo_loro" },
        scope(),
      ),
    /non trovata fra quelle configurate/i,
  );
});

test("il movimento di un altro club non si corregge", async () => {
  const riga = await accounting.createAccountingEntry(movimento(), scope());

  await assert.rejects(
    () => accounting.updateAccountingEntry({ entryId: riga.id, notes: "x" }, scopeAltrui()),
    /Accesso negato/,
  );
});

/* ================================ il documento collegato alla riga */

test("un incasso proiettato porta il numero della sua ricevuta", async () => {
  /*
    Prima le colonne documento restavano vuote su ogni riga proiettata, e
    l'export doveva rileggerle da capo: lo stesso dato chiesto due volte.
  */
  fake.rows("paymentTransaction").push({
    id: "inc-doc",
    organization_id: CLUB,
    paid_at: new Date("2026-09-10T00:00:00Z"),
    amount: 200,
    payment_method: "Contanti",
    financial_account_id: CASSA,
    receipts: [{ id: "ric-1", receipt_number: "2026/000012", cancelled_at: null }],
    transaction_invoices: [],
  });

  const esito = await accounting.listAccountingEntries({}, scope(), PIENI);
  const riga = esito.entries.find((r) => r.sourceId === "inc-doc");

  assert.equal(riga.documentKind, "receipt");
  assert.equal(riga.documentNumber, "2026/000012");
});

test("la fattura vince sulla ricevuta quando ci sono entrambe", async () => {
  /*
    E il documento con la numerazione fiscale propria, ed e quello che un
    commercialista cerca.
  */
  fake.rows("paymentTransaction").push({
    id: "inc-due",
    organization_id: CLUB,
    paid_at: new Date("2026-09-10T00:00:00Z"),
    amount: 200,
    payment_method: "Bonifico",
    financial_account_id: BANCA,
    receipts: [{ id: "ric-2", receipt_number: "2026/000013", cancelled_at: null }],
    transaction_invoices: [
      { id: "fat-1", invoice_number: "FT-2026-0007", cancelled_at: null },
    ],
  });

  const esito = await accounting.listAccountingEntries({}, scope(), PIENI);
  const riga = esito.entries.find((r) => r.sourceId === "inc-due");

  assert.equal(riga.documentKind, "invoice");
  assert.equal(riga.documentNumber, "FT-2026-0007");
});

test("un documento annullato non si mostra", async () => {
  /*
    Dire che un incasso porta un numero ritirato e peggio che non dirne nessuno.
  */
  fake.rows("paymentTransaction").push({
    id: "inc-annullato",
    organization_id: CLUB,
    paid_at: new Date("2026-09-10T00:00:00Z"),
    amount: 200,
    payment_method: "Contanti",
    financial_account_id: CASSA,
    receipts: [
      {
        id: "ric-3",
        receipt_number: "2026/000014",
        cancelled_at: new Date("2026-09-12T00:00:00Z"),
      },
    ],
    transaction_invoices: [],
  });

  const esito = await accounting.listAccountingEntries({}, scope(), PIENI);
  const riga = esito.entries.find((r) => r.sourceId === "inc-annullato");

  assert.equal(riga.documentNumber, null);
  assert.equal(riga.documentKind, null);
});

test("uno storno concorrente impedisce la riconciliazione, anche se la lettura era gia passata", async () => {
  /*
    **Trovato dall'audit.** La guardia stava **prima** della scrittura: lanciando
    storno e riconciliazione insieme, la riconciliazione leggeva la riga prima
    che lo storno confermasse, la trovava non stornata, e scriveva. Otto
    movimenti su otto finivano con `reversed_at` valorizzato **e**
    `reconciliation_status = 'reconciled'` — lo stato che il messaggio d'errore
    dichiara impossibile.

    Il rimedio non e un lock: e la condizione **dentro** l'`UPDATE`. Qui si
    simula la corsa marcando la riga come stornata fra la lettura e la
    scrittura, che e esattamente cio che l'altra transazione faceva.
  */
  const riga = await accounting.createAccountingEntry(movimento(), scope());

  const originale = righe().find((r) => r.id === riga.id);
  originale.reversed_at = new Date("2026-09-16T00:00:00Z");

  await assert.rejects(
    () =>
      accounting.reconcileAccountingEntry(
        { entryId: riga.id, status: "reconciled" },
        scope(),
      ),
    /non si riconcilia/i,
  );

  /*
    Il valore predefinito lo mette il database (`@default("unreconciled")`), non
    il servizio: qui basta e conta che **non** sia diventato «riconciliato».
  */
  assert.notEqual(
    righe().find((r) => r.id === riga.id).reconciliation_status,
    "reconciled",
    "la riga non deve risultare riconciliata",
  );
});
