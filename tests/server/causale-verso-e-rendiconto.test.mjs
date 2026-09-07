import assert from "node:assert/strict";
import test, { before } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Tre scrittori della stessa colonna, e una regola sola.**
 *
 * ADR-0106: una causale che **contraddice il verso del fatto** e un errore, non
 * un avviso, e vale nei due sensi. Il vaglio esisteva, era corretto, e lo
 * attraversavano i due percorsi **dedotti** — lavoro sportivo e contributi.
 * Non lo attraversavano i due in cui la causale la sceglie una persona: la
 * prima nota (l'unica schermata in cui si **digita**) e l'incasso di una
 * famiglia.
 *
 * Misurato prima della correzione: 735 EUR in **entrata** accettati con causale
 * «Compenso sportivo», e un'uscita accettata con «Quota associativa». I totali
 * per verso restano giusti, la **voce** no — «gonfia una voce dal lato sbagliato
 * e sposta il movimento sotto un capitolo che non gli appartiene».
 *
 * **Perche il gate non lo vedeva.** Le righe di catalogo seminate in
 * `accounting-entries.test.mjs` non portano **nessun** `direction_hint`: un
 * vaglio, se anche ci fosse stato, non sarebbe mai scattato contro quel
 * fixture. E la stessa forma che ADR-0106 racconta nel proprio post-mortem — il
 * test che descrive il mondo in cui il difetto e invisibile — e per questo qui
 * il seme lo porta, ed e la prima cosa che si legge.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const CONTO = "bbbbbbbb-0000-4000-8000-000000000002";
const ATLETA = "cccccccc-0000-4000-8000-000000000003";
const OPERATORE = "dddddddd-0000-4000-8000-000000000004";

let contabilita;
let incassi;
let setPrismaClientForTests;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  contabilita = await import("../../src/lib/server/accounting.ts");
  incassi = await import("../../src/lib/server/payment-transactions.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

/* Il seme porta il `direction_hint`: e cio che mancava. */
const seme = () => ({
  user: [{ id: OPERATORE, email: "segreteria@asd.invalid" }],
  club: [{ id: CLUB, name: "ASD Prova" }],
  organizationUser: [
    { id: "m1", organization_id: CLUB, user_id: OPERATORE, role: "owner" },
  ],
  fiscalOperationType: [
    {
      id: "ot-quota",
      organization_id: CLUB,
      code: "quota_associativa",
      label: "Quota associativa",
      direction_hint: "IN",
      activity_scope: "institutional",
      is_active: true,
    },
    {
      id: "ot-compenso",
      organization_id: CLUB,
      code: "compenso_sportivo",
      label: "Compenso sportivo",
      direction_hint: "OUT",
      activity_scope: "institutional",
      is_active: true,
    },
    {
      id: "ot-spenta",
      organization_id: CLUB,
      code: "causale_spenta",
      label: "Causale spenta",
      direction_hint: "IN",
      activity_scope: "institutional",
      is_active: false,
    },
  ],
  financialAccount: [
    { id: CONTO, organization_id: CLUB, name: "Cassa", is_active: true },
  ],
  athlete: [
    {
      id: ATLETA,
      organization_id: CLUB,
      first_name: "Elia",
      last_name: "Prova",
      status: "active",
    },
  ],
  accountingEntry: [],
  paymentTransaction: [],
  auditLog: [],
});

const scope = {
  userId: OPERATORE,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  activeMembershipId: "m1",
  allowedOrganizationIds: [CLUB],
  accessScopes: [],
  actorEmail: "segreteria@asd.invalid",
};

const monta = () => {
  const fake = createFakePrisma(seme());
  setPrismaClientForTests(fake.client);
  return fake;
};

const prova = (chiamata) =>
  chiamata.then(() => "accettato").catch((errore) => String(errore?.message || errore));

test("un movimento in entrata rifiuta una causale prevista per le uscite", async () => {
  monta();

  const esito = await prova(
    contabilita.createAccountingEntry(
      {
        organizationId: CLUB,
        direction: "IN",
        amount: 735,
        financialAccountId: CONTO,
        operationTypeCode: "compenso_sportivo",
        entryDate: "2026-03-01",
        description: "Incasso",
      },
      scope,
    ),
  );

  assert.notEqual(
    esito,
    "accettato",
    "prima: 735 EUR di entrata archiviati sotto un capitolo di uscita",
  );
  assert.match(esito, /prevista per le uscite/i);
});

test("e un movimento in uscita rifiuta una causale prevista per le entrate", async () => {
  monta();

  const esito = await prova(
    contabilita.createAccountingEntry(
      {
        organizationId: CLUB,
        direction: "OUT",
        amount: 735,
        financialAccountId: CONTO,
        operationTypeCode: "quota_associativa",
        entryDate: "2026-03-01",
        description: "Pagamento",
      },
      scope,
    ),
  );

  assert.notEqual(esito, "accettato", "la regola vale nei due sensi");
  assert.match(esito, /prevista per le entrate/i);
});

test("una causale coerente con il verso passa", async () => {
  monta();

  const esito = await prova(
    contabilita.createAccountingEntry(
      {
        organizationId: CLUB,
        direction: "IN",
        amount: 120,
        financialAccountId: CONTO,
        operationTypeCode: "quota_associativa",
        entryDate: "2026-03-01",
        description: "Quota",
      },
      scope,
    ),
  );

  assert.equal(
    esito,
    "accettato",
    "il verso opposto — chiudere di troppo — sarebbe lo stesso difetto",
  );
});

test("l'incasso di una famiglia chiede la stessa regola", async () => {
  monta();

  const esito = await prova(
    incassi.createPaymentTransaction(
      {
        organizationId: CLUB,
        athleteId: ATLETA,
        amount: 122,
        paymentMethod: "cash",
        operationTypeCode: "compenso_sportivo",
      },
      scope,
    ),
  );

  assert.notEqual(
    esito,
    "accettato",
    "prima: 122 EUR incassati da una famiglia sotto «Compenso sportivo»",
  );
  assert.match(esito, /prevista per le uscite/i);
});

test("e rifiuta anche una causale disattivata", async () => {
  monta();

  const esito = await prova(
    incassi.createPaymentTransaction(
      {
        organizationId: CLUB,
        athleteId: ATLETA,
        amount: 122,
        paymentMethod: "cash",
        operationTypeCode: "causale_spenta",
      },
      scope,
    ),
  );

  assert.notEqual(
    esito,
    "accettato",
    "gli altri due scrittori la rifiutavano gia: una colonna, una regola",
  );
});
