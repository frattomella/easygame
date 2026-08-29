import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Le **previsioni** a runtime (Wave 4, W4-B1).
 *
 * La lane precedente ha tolto la scheda «Previsti» insieme all'aggregatore nel
 * browser su cui si reggeva. I dati sono rimasti; l'interfaccia no. Rimetterla
 * significa rimettere anche la sua scrittura — e la sua scrittura era il difetto
 * che questa Wave chiude ovunque.
 *
 * Sei cose vanno dimostrate, non affermate:
 *
 * 1. **una previsione non e cassa**: non entra in nessun totale di cassa, non
 *    tocca nessun saldo e non produce nessuna riga in `accounting_entries`;
 * 2. **la creazione e del server e non riscrive la colonna JSON intera**: una
 *    riga in `club_resource_items`, aggregato ricalcolato dalla tabella,
 *    nessuna cancellazione di massa. Era il difetto di `addClubData`;
 * 3. **due creazioni ravvicinate non si cancellano a vicenda**: e il caso reale
 *    — due segreterie nello stesso minuto — che il read-modify-write dal
 *    browser perdeva in silenzio;
 * 4. **la cancellazione toglie una riga sola** e lascia intatte le altre;
 * 5. **l'isolamento multi-tenant**: dal club sbagliato si legge «Accesso
 *    negato», e senza dichiarare il club non si trova niente dell'altro;
 * 6. **i permessi**, per tutti e sette i ruoli canonici. Una previsione e lavoro
 *    di segreteria: `accounting.read` per vederla, `accounting.manage` per
 *    scriverla.
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";

const UTENTE_A = "11111111-0000-4000-8000-00000000000a";
const UTENTE_B = "22222222-0000-4000-8000-00000000000b";

const scopeA = (role = "owner") => ({
  userId: UTENTE_A,
  activeOrganizationId: CLUB_A,
  activeRole: role,
  allowedOrganizationIds: [CLUB_A],
});

const scopeB = (role = "owner") => ({
  userId: UTENTE_B,
  activeOrganizationId: CLUB_B,
  activeRole: role,
  allowedOrganizationIds: [CLUB_B],
});

let previsioni;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  previsioni = await import("../../src/lib/server/expected-entries.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const previsioneInColonna = (organizationId, resourceType, id, payload) => ({
  id: `riga-${id}`,
  organization_id: organizationId,
  resource_type: resourceType,
  name: null,
  status: null,
  date: new Date(payload.date),
  created_at: new Date("2026-01-01T00:00:00.000Z"),
  updated_at: new Date("2026-01-01T00:00:00.000Z"),
  payload: { id, ...payload },
});

const ENTRATA_A = previsioneInColonna(CLUB_A, "expected_income", "prev-in-1", {
  date: "2026-04-10",
  description: "Quote aprile da incassare",
  category: "Quote",
  amount: 820,
  reference: "APR-2026-PENDING",
});

const USCITA_A = previsioneInColonna(CLUB_A, "expected_expenses", "prev-out-1", {
  date: "2026-05-02",
  description: "Affitto palestra maggio",
  amount: 300.5,
});

const ENTRATA_B = previsioneInColonna(CLUB_B, "expected_income", "prev-in-b", {
  date: "2026-04-11",
  description: "Sponsor Beta",
  amount: 1000,
});

const seed = () => ({
  club: [
    {
      id: CLUB_A,
      name: "ASD Alfa",
      settings: {},
      expected_income: [],
      expected_expenses: [],
    },
    {
      id: CLUB_B,
      name: "ASD Beta",
      settings: {},
      expected_income: [],
      expected_expenses: [],
    },
  ],
  clubResourceItem: [
    { ...ENTRATA_A, payload: { ...ENTRATA_A.payload } },
    { ...USCITA_A, payload: { ...USCITA_A.payload } },
    { ...ENTRATA_B, payload: { ...ENTRATA_B.payload } },
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const crea = (scope = scopeA(), extra = {}) =>
  previsioni.createExpectedEntry(scope, {
    direction: "income",
    date: "2026-06-01",
    description: "Contributo comunale atteso",
    amountCents: 45_000,
    ...extra,
  });

const righeDi = (clubId, resourceType) =>
  fake
    .rows("clubResourceItem")
    .filter(
      (riga) =>
        riga.organization_id === clubId && riga.resource_type === resourceType,
    );

/* ================================================================= lettura */

test("le previsioni si leggono dalle due sole colonne che le contengono", async () => {
  const esito = await previsioni.listExpectedEntries(scopeA());

  assert.equal(esito.entries.length, 2);
  assert.deepEqual(
    esito.entries.map((riga) => riga.direction),
    ["expense", "income"],
    "dalla piu recente: una previsione e una cronologia di attese",
  );

  const entrata = esito.entries.find((riga) => riga.direction === "income");
  assert.equal(entrata.description, "Quote aprile da incassare");
  assert.equal(entrata.amountCents, 82_000);
  assert.equal(entrata.category, "Quote");

  const uscita = esito.entries.find((riga) => riga.direction === "expense");
  assert.equal(
    uscita.amountCents,
    30_050,
    "300,50 EUR non deve perdere un centesimo passando per il virgola mobile",
  );

  assert.equal(esito.totals.expectedIncomeCents, 82_000);
  assert.equal(esito.totals.expectedExpenseCents, 30_050);
  assert.equal(esito.totals.expectedNetCents, 51_950);
});

test("nessuna delle due letture tocca fornitori: quelle erano morte", async () => {
  await previsioni.listExpectedEntries(scopeA());

  const tipiLetti = fake.calls
    .filter((chiamata) => chiamata.delegate === "clubResourceItem")
    .map((chiamata) => chiamata.args?.where?.resource_type)
    .filter(Boolean);

  assert.deepEqual(
    [...new Set(tipiLetti)].sort(),
    ["expected_expenses", "expected_income"],
    "le previsioni stanno in due collezioni, e la lettura non ne apre altre",
  );
});

/* ============================================ una previsione non e cassa */

test("una previsione non entra in nessun totale di cassa e non tocca nessun saldo", async () => {
  const esito = await previsioni.listExpectedEntries(scopeA());

  /*
    Il contratto lo dicono i **nomi**: se un giorno comparisse un campo di
    cassa qui dentro, la superficie lo affiancherebbe a un saldo senza che
    nessuno se ne accorga. E il difetto D-2.
  */
  assert.deepEqual(
    Object.keys(esito.totals).sort(),
    ["expectedExpenseCents", "expectedIncomeCents", "expectedNetCents"],
    "nessun totale di cassa esce dalle previsioni",
  );
  for (const chiave of Object.keys(esito.totals)) {
    assert.match(
      chiave,
      /^expected/,
      `${chiave}: un totale di previsioni deve dichiararsi previsione nel nome`,
    );
  }
  for (const riga of esito.entries) {
    assert.equal(
      "collectedAmount" in riga || "cashEvidence" in riga || "balance" in riga,
      false,
      "una previsione non porta nessuna evidenza di cassa",
    );
  }

  await crea();

  /*
    E il fatto: creare una previsione non scrive niente nel registro contabile
    e non tocca nessun conto. Se un giorno qualcuno la portasse in prima nota,
    questa riga fallirebbe.
  */
  assert.equal(fake.rows("accountingEntry").length, 0);
  assert.equal(fake.rows("financialAccount").length, 0);
  assert.equal(fake.rows("paymentTransaction").length, 0);

  const domini = new Set(fake.calls.map((chiamata) => chiamata.delegate));
  for (const proibito of [
    "accountingEntry",
    "financialAccount",
    "paymentTransaction",
    "payment",
  ]) {
    assert.equal(
      domini.has(proibito),
      false,
      `una previsione non deve nemmeno interrogare ${proibito}`,
    );
  }
});

/* ============================================== la scrittura e del server */

test("creare una previsione aggiunge una riga e non riscrive la colonna intera", async () => {
  const creata = await crea();

  assert.equal(creata.direction, "income");
  assert.equal(creata.amountCents, 45_000);
  assert.equal(creata.description, "Contributo comunale atteso");

  const righe = righeDi(CLUB_A, "expected_income");
  assert.equal(righe.length, 2, "la previsione che c'era gia non e stata riscritta");
  assert.ok(
    righe.some((riga) => riga.payload?.id === "prev-in-1"),
    "la previsione preesistente non e sparita: e il difetto che questa lane chiude",
  );

  /*
    L'importo si conserva in **euro** perche la colonna ne e piena da anni: una
    riga nuova in centesimi accanto a mille in euro darebbe totali sbagliati
    per sempre.
  */
  const nuova = righe.find((riga) => riga.payload?.id !== "prev-in-1");
  assert.equal(nuova.payload.amount, 450);
  assert.equal(
    "status" in nuova.payload,
    false,
    "una previsione non ha uno stato: dichiararla «pagata» era il modo di farla sembrare cassa",
  );

  assert.equal(
    fake.calls.some(
      (chiamata) =>
        chiamata.delegate === "clubResourceItem" &&
        ["deleteMany", "updateMany"].includes(chiamata.method),
    ),
    false,
    "aggiungere una previsione non cancella e riscrive la collezione",
  );

  const club = fake.rows("club").find((riga) => riga.id === CLUB_A);
  assert.equal(
    club.expected_income.length,
    2,
    "l'aggregato JSON si ricalcola dalla tabella, che e la fonte",
  );
  assert.equal(
    club.expected_expenses.length,
    0,
    "scrivere un'entrata prevista non tocca la collezione delle uscite",
  );
});

test("due creazioni ravvicinate non si cancellano a vicenda", async () => {
  const [prima, seconda] = await Promise.all([
    crea(scopeA(), { description: "Bando regionale" }),
    crea(scopeA(), { description: "Torneo di primavera", direction: "expense" }),
  ]);

  assert.notEqual(prima.id, seconda.id);

  assert.equal(righeDi(CLUB_A, "expected_income").length, 2);
  assert.equal(righeDi(CLUB_A, "expected_expenses").length, 2);

  const esito = await previsioni.listExpectedEntries(scopeA());
  const descrizioni = esito.entries.map((riga) => riga.description);
  assert.ok(descrizioni.includes("Bando regionale"));
  assert.ok(
    descrizioni.includes("Torneo di primavera"),
    "la seconda scrittura non deve cancellare la prima: era il difetto di addClubData",
  );
  assert.equal(esito.entries.length, 4);
});

test("una previsione senza descrizione, senza data o senza importo non nasce", async () => {
  await assert.rejects(() => crea(scopeA(), { description: "  " }), /descrizione/i);
  await assert.rejects(() => crea(scopeA(), { date: "" }), /data/i);
  await assert.rejects(() => crea(scopeA(), { amountCents: 0 }), /maggiore di zero/i);
  await assert.rejects(() => crea(scopeA(), { amountCents: -100 }), /maggiore di zero/i);
  await assert.rejects(() => crea(scopeA(), { direction: "boh" }), /verso/i);

  assert.equal(righeDi(CLUB_A, "expected_income").length, 1);
});

/* ========================================================= cancellazione */

test("togliere una previsione toglie una riga sola, e lascia le altre", async () => {
  await crea();

  const rimossa = await previsioni.deleteExpectedEntry(scopeA(), {
    direction: "income",
    id: "prev-in-1",
  });

  assert.equal(rimossa.description, "Quote aprile da incassare");

  const righe = righeDi(CLUB_A, "expected_income");
  assert.equal(righe.length, 1);
  assert.equal(
    righe.some((riga) => riga.payload?.id === "prev-in-1"),
    false,
  );

  assert.equal(
    righeDi(CLUB_A, "expected_expenses").length,
    1,
    "togliere un'entrata prevista non tocca le uscite previste",
  );

  const club = fake.rows("club").find((riga) => riga.id === CLUB_A);
  assert.equal(club.expected_income.length, 1);

  assert.equal(
    fake.calls.some(
      (chiamata) =>
        chiamata.delegate === "clubResourceItem" &&
        chiamata.method === "deleteMany",
    ),
    false,
    "cancellare una previsione non svuota e riscrive la collezione",
  );

  await assert.rejects(
    () =>
      previsioni.deleteExpectedEntry(scopeA(), {
        direction: "income",
        id: "prev-in-1",
      }),
    /non trovata/i,
  );
});

/* ----------------------------------------------------------- multi-tenant */

test("la previsione di un altro club: «Accesso negato», e nessun dato", async () => {
  await assert.rejects(
    () => previsioni.listExpectedEntries(scopeB(), { organizationId: CLUB_A }),
    /Accesso negato/,
  );

  await assert.rejects(
    () => crea(scopeB(), { organizationId: CLUB_A }),
    /Accesso negato/,
  );

  await assert.rejects(
    () =>
      previsioni.deleteExpectedEntry(scopeB(), {
        organizationId: CLUB_A,
        direction: "income",
        id: "prev-in-1",
      }),
    /Accesso negato/,
  );

  /*
    Senza dichiarare il club si opera sul proprio: li quella previsione non
    esiste, e non viene restituita nessuna riga dell'altro club.
  */
  await assert.rejects(
    () =>
      previsioni.deleteExpectedEntry(scopeB(), {
        direction: "income",
        id: "prev-in-1",
      }),
    /non trovata/i,
  );

  const elencoB = await previsioni.listExpectedEntries(scopeB());
  assert.deepEqual(
    elencoB.entries.map((riga) => riga.description),
    ["Sponsor Beta"],
  );

  assert.equal(righeDi(CLUB_A, "expected_income").length, 1);
});

/* --------------------------------------------------------------- permessi */

test("i sette ruoli canonici: la segreteria registra, l'allenatore non vede", async () => {
  const possono = ["owner", "club_manager", "collaborator", "staff"];
  const nonPossono = ["trainer", "parent", "athlete"];

  for (const ruolo of nonPossono) {
    await assert.rejects(
      () => previsioni.listExpectedEntries(scopeA(ruolo)),
      /Accesso negato/,
      `${ruolo} non deve poter leggere le previsioni`,
    );
    await assert.rejects(
      () => crea(scopeA(ruolo)),
      /Accesso negato/,
      `${ruolo} non deve poter registrare una previsione`,
    );
    await assert.rejects(
      () =>
        previsioni.deleteExpectedEntry(scopeA(ruolo), {
          direction: "income",
          id: "prev-in-1",
        }),
      /Accesso negato/,
      `${ruolo} non deve poter togliere una previsione`,
    );
  }

  assert.equal(righeDi(CLUB_A, "expected_income").length, 1);

  for (const ruolo of possono) {
    const esito = await previsioni.listExpectedEntries(scopeA(ruolo));
    assert.ok(esito.entries.length > 0, `${ruolo} deve poter leggere`);
    assert.equal(
      esito.canManage,
      true,
      `${ruolo} registra movimenti, e una previsione e lo stesso lavoro`,
    );

    const creata = await crea(scopeA(ruolo), { description: `Voce di ${ruolo}` });
    await previsioni.deleteExpectedEntry(scopeA(ruolo), {
      direction: "income",
      id: creata.id,
    });
  }

  assert.equal(
    righeDi(CLUB_A, "expected_income").length,
    1,
    "creato e tolto: si torna alla previsione di partenza",
  );
});

test("il permesso di scrivere viaggia con le righe, non lo ricalcola la pagina", async () => {
  /*
    E la lezione W3-14: due porte che decidono la stessa cosa in due posti
    finiscono per rispondere diversamente. Oggi nessun ruolo legge senza poter
    scrivere, e il campo esiste perche il giorno in cui succedera la superficie
    non debba dedurlo dal ruolo.
  */
  const esito = await previsioni.listExpectedEntries(scopeA("staff"));
  assert.equal(typeof esito.canManage, "boolean");
});

/* ------------------------------------------------------------------ audit */

test("creare e togliere una previsione lasciano una traccia sul club giusto", async () => {
  const creata = await crea();
  await previsioni.deleteExpectedEntry(scopeA(), {
    direction: "income",
    id: creata.id,
  });

  const tracce = fake.rows("auditLog");
  const creazione = tracce.find((riga) => riga.action === "resource.created");
  const rimozione = tracce.find((riga) => riga.action === "resource.deleted");

  assert.ok(creazione, "una previsione registrata lascia una riga");
  assert.equal(creazione.organization_id, CLUB_A);
  assert.equal(creazione.resource, "expected_income");
  assert.equal(creazione.metadata.importoCentesimi, 45_000);

  assert.ok(rimozione, "una previsione tolta lascia una riga");
  assert.equal(rimozione.organization_id, CLUB_A);
  assert.equal(rimozione.metadata.verso, "income");
});
