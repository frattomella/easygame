import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **W4-G — l'export contabile, dalla sessione al file.**
 *
 * Il tracciato e le colonne sono provati dal modulo puro
 * (`tests/lib/accounting-export.test.mjs`). Qui si prova cio che solo la rotta
 * e il servizio possono sbagliare:
 *
 * 1. **il permesso.** `accounting.export` la segreteria non ce l'ha, e il
 *    diniego dice **il motivo** e lascia una traccia: un export e la
 *    fotografia completa dei conti della societa che lascia l'applicazione
 *    dentro un file (scenario 38 applicato all'export);
 * 2. **il confine multi-tenant** — scenario 35: il file non contiene **nessuna
 *    riga** di un altro club;
 * 3. **la paginazione.** `listAccountingEntries` serve al massimo 500 righe
 *    per chiamata: un export che non sfogliasse consegnerebbe un file corto
 *    senza dirlo (scenario 41 con milleduecento movimenti);
 * 4. **il file parziale non esce.** Oltre il tetto si risponde un errore che
 *    dice cosa restringere, e non un CSV a cui mancano righe: aperto in un
 *    foglio di calcolo, non si distingue da uno completo;
 * 5. **numero del documento e IVA** arrivano dal documento collegato, letto
 *    **nel club del movimento**.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-00000000e001";
const ALTRO = "bbbbbbbb-0000-4000-8000-00000000e002";
const CASSA = "cccccccc-0000-4000-8000-00000000e0c1";
const GESTORE = "dddddddd-0000-4000-8000-00000000e004";
const SEGRETERIA = "eeeeeeee-0000-4000-8000-00000000e005";
const STAFF = "eeeeeeee-0000-4000-8000-00000000e006";
const TOKEN_GESTORE = "token-gestore-export";
const TOKEN_SEGRETERIA = "token-segreteria-export";
const TOKEN_STAFF = "token-staff-export";

const URL_EXPORT = "http://localhost/api/v1/accounting/export";

let rotta;
let servizio;
let setPrismaClientForTests;
let fake;

const utente = (id, email, role) => ({
  id,
  email,
  role,
  first_name: "Nome",
  last_name: "Cognome",
  created_at: new Date("2026-01-01T00:00:00.000Z"),
  updated_at: new Date("2026-01-01T00:00:00.000Z"),
  email_verified_at: new Date("2026-01-01T00:00:00.000Z"),
});

const sessione = (id, token, userId, email, role) => ({
  id,
  token,
  user_id: userId,
  expires_at: new Date(Date.now() + 3_600_000),
  user: utente(userId, email, role),
});

const appartenenza = (id, userId, role) => ({
  id,
  user_id: userId,
  organization_id: CLUB,
  role,
  is_primary: true,
  created_at: new Date("2026-01-01T00:00:00.000Z"),
});

const movimento = (id, over = {}) => ({
  id,
  organization_id: CLUB,
  entry_date: new Date("2026-09-15T10:00:00.000Z"),
  fiscal_year: 2026,
  season_id: null,
  direction: "IN",
  amount_cents: 12_345,
  currency: "EUR",
  financial_account_id: CASSA,
  /* Il doppio di Prisma non risolve le relazioni: il nome del conto sta qui. */
  financial_account: { id: CASSA, name: "Cassa" },
  operation_type_code: "quota_attivita",
  operation_type_label_snapshot: "Quota attivita",
  activity_scope_snapshot: "institutional",
  description: "Quota di settembre",
  notes: null,
  payment_method: "Contanti",
  counterparty_kind: "ATHLETE",
  counterparty_id: "atleta-1",
  counterparty_label: "Mario Rossi",
  source_domain: "MANUAL",
  document_kind: null,
  document_id: null,
  site_id: null,
  reconciliation_status: "unreconciled",
  transfer_group_id: null,
  reversal_of_id: null,
  reversed_at: null,
  created_at: new Date("2026-09-15T10:00:00.000Z"),
  ...over,
});

const seed = () => ({
  session: [
    sessione("s1", TOKEN_GESTORE, GESTORE, "gestore@example.invalid", "club_manager"),
    sessione(
      "s2",
      TOKEN_SEGRETERIA,
      SEGRETERIA,
      "segreteria@example.invalid",
      "collaborator",
    ),
    sessione("s3", TOKEN_STAFF, STAFF, "staff@example.invalid", "staff"),
  ],
  organizationUser: [
    appartenenza("ou-1", GESTORE, "club_manager"),
    appartenenza("ou-2", SEGRETERIA, "collaborator"),
    appartenenza("ou-3", STAFF, "staff"),
  ],
  club: [
    { id: CLUB, name: "ASD Alfa", transactions: [], transfers: [], settings: {} },
    { id: ALTRO, name: "ASD Beta", transactions: [], transfers: [], settings: {} },
  ],
  financialAccount: [
    {
      id: CASSA,
      organization_id: CLUB,
      name: "Cassa",
      kind: "CASH",
      is_archived: false,
      opening_balance_cents: 0,
    },
  ],
  fiscalOperationType: [
    {
      id: "ft-1",
      organization_id: CLUB,
      code: "quota_attivita",
      label: "Quota attivita",
      /*
        La causale **adesso** e commerciale. I movimenti sotto sono stati
        registrati quando era istituzionale, e il loro snapshot lo dice: il
        file deve riportare lo snapshot.
      */
      activity_scope: "commercial",
      is_active: true,
    },
  ],
  accountingEntry: [
    movimento("m-1"),
    movimento("m-2", {
      direction: "OUT",
      amount_cents: 4_550,
      description: "Affitto; palestra",
      notes: "Pagato allo sportello\r\nRicevuta consegnata a mano",
      counterparty_kind: "SUPPLIER",
      counterparty_label: "Palestra Comunale",
    }),
    /* Il movimento di un altro club: scenario 35. */
    movimento("m-altrui", {
      organization_id: ALTRO,
      amount_cents: 999_999,
      description: "Movimento del club B",
      financial_account: null,
      financial_account_id: null,
    }),
  ],
  invoice: [],
  receipt: [],
  paymentTransaction: [],
  sportWorkOutboundTransaction: [],
  fundingSettlement: [],
  auditLog: [],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  rotta = await import("../../src/app/api/v1/accounting/export/route.ts");
  servizio = await import("../../src/lib/server/accounting-export.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const richiesta = (url, options = {}) =>
  new Request(url, {
    method: "GET",
    headers: {
      ...(options.token ? { cookie: `easygame_session=${options.token}` } : {}),
      ...(options.clubId ? { "x-active-club-id": options.clubId } : {}),
      ...(options.role ? { "x-active-access-role": options.role } : {}),
    },
  });

const comeGestore = (extra = {}) => ({
  token: TOKEN_GESTORE,
  clubId: CLUB,
  role: "club_manager",
  ...extra,
});
const comeSegreteria = (extra = {}) => ({
  token: TOKEN_SEGRETERIA,
  clubId: CLUB,
  role: "collaborator",
  ...extra,
});
const comeStaff = (extra = {}) => ({
  token: TOKEN_STAFF,
  clubId: CLUB,
  role: "staff",
  ...extra,
});

const esporta = async (query = "", chi = comeGestore()) => {
  const risposta = await rotta.GET(
    richiesta(`${URL_EXPORT}${query}`, chi),
  );
  const testo = await risposta.text();
  return { risposta, testo };
};

/* Le righe del CSV, tolti il BOM e l'intestazione. Le celle non contengono
   ritorni a capo nei casi in cui questo aiutante viene usato. */
const righeDati = (testo) =>
  testo
    .replace(/^﻿/, "")
    .split("\r\n")
    .slice(1)
    .filter(Boolean);

/* ================================================== sessione e permessi === */

test("senza sessione l'export risponde 401, non un file", async () => {
  const { risposta, testo } = await esporta("", {});

  assert.equal(risposta.status, 401);
  assert.match(risposta.headers.get("content-type") || "", /json/);
  assert.match(JSON.parse(testo).error.message, /Accesso negato/);
});

test("la segreteria non esporta la contabilita, e il diniego dice il motivo", async () => {
  const { risposta, testo } = await esporta("", comeSegreteria());

  assert.equal(risposta.status, 403);
  const payload = JSON.parse(testo);
  assert.match(payload.error.message, /Accesso negato/);
  assert.match(
    payload.error.message,
    /esportare la contabilita/i,
    "un 403 senza motivo manda a cercare un errore nei dati",
  );

  const traccia = fake
    .rows("auditLog")
    .find((row) => row.action === "resource.access.denied");
  assert.ok(traccia, "un tentativo di export negato si traccia");
  assert.equal(traccia.metadata.permission, "accounting.export");
});

test("nemmeno lo staff esporta la contabilita", async () => {
  const { risposta, testo } = await esporta("", comeStaff());

  assert.equal(risposta.status, 403);
  assert.match(JSON.parse(testo).error.message, /Accesso negato/);
});

test("il servizio verifica il permesso anche se chiamato fuori dalla rotta", async () => {
  await assert.rejects(
    servizio.buildAccountingExport(
      {},
      {
        userId: SEGRETERIA,
        activeOrganizationId: CLUB,
        activeRole: "collaborator",
        allowedOrganizationIds: [CLUB],
      },
    ),
    /Accesso negato/,
  );
});

/* ============================================== la risposta e un file === */

test("il gestore riceve un CSV, con un nome parlante e senza cache condivisa", async () => {
  const { risposta, testo } = await esporta("?fiscal_year=2026");

  assert.equal(risposta.status, 200);
  assert.match(risposta.headers.get("content-type") || "", /text\/csv; charset=utf-8/);
  assert.match(
    risposta.headers.get("content-disposition") || "",
    /attachment; filename="prima-nota-2026-\d{4}-\d{2}-\d{2}\.csv"/,
  );
  assert.match(risposta.headers.get("cache-control") || "", /no-store/);

  assert.ok(testo.startsWith("﻿"), "il corpo deve portare il BOM");
  assert.ok(testo.includes("\r\n"), "la fine riga deve essere CRLF");
  assert.ok(testo.split("\r\n")[0].includes(";"), "il separatore deve essere il punto e virgola");
});

test("il file non promette di essere un documento", async () => {
  const { risposta, testo } = await esporta();
  const disposizione = risposta.headers.get("content-disposition") || "";

  for (const parola of ["ufficiale", "conforme", "a norma", "per il deposito"]) {
    assert.ok(
      !testo.toLowerCase().includes(parola),
      `il file rivendica «${parola}»`,
    );
    assert.ok(!disposizione.toLowerCase().includes(parola));
  }
});

/* ================================================ scenario 35: il confine === */

test("l'export non contiene una riga di un altro club", async () => {
  const { testo } = await esporta();

  assert.ok(
    !testo.includes("Movimento del club B"),
    "una riga di un altro club e finita nel file",
  );
  assert.ok(!testo.includes("999999") && !testo.includes("9999,99"));
  assert.equal(righeDati(testo).length, 2);
});

/* ======================================== scenario 41: nessuna riga persa === */

test("milleduecento movimenti escono tutti: l'export sfoglia oltre le 500 righe per pagina", async () => {
  const righe = fake.rows("accountingEntry");
  for (let indice = 0; indice < 1200; indice += 1) {
    righe.push(
      movimento(`m-massa-${indice}`, {
        description: `Movimento numero ${indice}`,
        amount_cents: 1_000 + indice,
      }),
    );
  }

  const { testo } = await esporta("?fiscal_year=2026");
  const dati = righeDati(testo);

  /* I 1200 di massa piu i due del seed che appartengono al club. */
  assert.equal(dati.length, 1202);
  assert.ok(testo.includes("Movimento numero 0"));
  assert.ok(
    testo.includes("Movimento numero 1199"),
    "l'ultima riga dell'ultima pagina non e stata letta",
  );
});

test("oltre il tetto non esce un file corto: esce un errore che dice cosa restringere", async () => {
  const righe = fake.rows("accountingEntry");
  for (let indice = 0; indice < 600; indice += 1) {
    righe.push(movimento(`m-troppi-${indice}`));
  }

  await assert.rejects(
    servizio.buildAccountingExport(
      { maxPages: 1 },
      {
        userId: GESTORE,
        activeOrganizationId: CLUB,
        activeRole: "club_manager",
        allowedOrganizationIds: [CLUB],
      },
    ),
    (errore) => {
      assert.match(errore.message, /restringere il periodo o l'anno fiscale/);
      assert.ok(
        !errore.message.includes("Accesso negato"),
        "un filtro troppo largo non e un problema di permessi",
      );
      return true;
    },
  );
});

/* ============================================ le colonne che contano === */

test("entrata e uscita restano in due colonne, e la classificazione e quella congelata", async () => {
  const { testo } = await esporta();
  const [intestazione] = testo.replace(/^﻿/, "").split("\r\n");
  const colonne = intestazione.split(";");

  const iEntrata = colonne.indexOf("Entrata");
  const iUscita = colonne.indexOf("Uscita");
  const iClasse = colonne.indexOf("Classificazione");
  assert.ok(iEntrata >= 0 && iUscita >= 0 && iEntrata !== iUscita);

  const entrata = righeDati(testo)
    .map((riga) => riga.split(";"))
    .find((celle) => celle[iEntrata] === "123,45");

  assert.ok(entrata, "il movimento in entrata non ha la sua colonna valorizzata");
  assert.equal(entrata[iUscita], "", "l'uscita di una riga di entrata non esiste");
  assert.equal(
    entrata[iClasse],
    "Istituzionale",
    "la causale oggi e commerciale: il file deve riportare cio che era congelato sulla riga",
  );
});

test("anno fiscale e stato di riconciliazione sono nel file", async () => {
  const { testo } = await esporta();
  const colonne = testo.replace(/^﻿/, "").split("\r\n")[0].split(";");

  assert.ok(colonne.includes("Anno fiscale"));
  assert.ok(colonne.includes("Riconciliazione"));
  assert.ok(testo.includes("Da riconciliare"));
  assert.ok(testo.includes("2026"));
});

test("una nota con un ritorno a capo non aggiunge una riga al file", async () => {
  const { testo } = await esporta();

  assert.equal(
    righeDati(testo).length,
    2,
    "la nota su due righe ha spezzato il file",
  );
  assert.ok(
    testo.includes('"Pagato allo sportello\r\nRicevuta consegnata a mano"'),
    "il ritorno a capo dentro la cella non e stato virgolettato",
  );
});

/* ================================== il numero del documento e l'IVA === */

test("numero e IVA arrivano dal documento collegato", async () => {
  fake.rows("invoice").push({
    id: "11111111-0000-4000-8000-0000000f0001",
    organization_id: CLUB,
    invoice_number: "2026/12",
    taxable_amount_cents: 100_000,
    vat_amount_cents: 22_000,
  });
  fake.rows("accountingEntry").push(
    movimento("m-con-fattura", {
      description: "Sponsorizzazione",
      document_kind: "invoice",
      document_id: "11111111-0000-4000-8000-0000000f0001",
    }),
  );

  const { testo } = await esporta();
  const colonne = testo.replace(/^﻿/, "").split("\r\n")[0].split(";");
  const riga = righeDati(testo)
    .map((r) => r.split(";"))
    .find((celle) => celle[colonne.indexOf("Descrizione")] === "Sponsorizzazione");

  assert.ok(riga, "la riga con la fattura non e nel file");
  assert.equal(riga[colonne.indexOf("Numero documento")], "2026/12");
  assert.equal(riga[colonne.indexOf("Documento")], "Fattura");
  assert.equal(riga[colonne.indexOf("Imponibile IVA")], "1000");
  assert.equal(riga[colonne.indexOf("IVA")], "220");
});

test("il documento di un altro club non entra nel file, nemmeno come numero", async () => {
  fake.rows("invoice").push({
    id: "22222222-0000-4000-8000-0000000f0002",
    organization_id: ALTRO,
    invoice_number: "SEGRETO/1",
    taxable_amount_cents: 500_000,
    vat_amount_cents: 110_000,
  });
  fake.rows("accountingEntry").push(
    movimento("m-doc-altrui", {
      description: "Movimento con documento altrui",
      document_kind: "invoice",
      document_id: "22222222-0000-4000-8000-0000000f0002",
    }),
  );

  const { testo } = await esporta();

  assert.ok(testo.includes("Movimento con documento altrui"));
  assert.ok(
    !testo.includes("SEGRETO/1"),
    "il numero di un documento di un altro club e uscito nel file",
  );
});

/* ============================================================ l'audit === */

test("l'export si traccia: chi, quando, quante righe e con quale filtro", async () => {
  await esporta("?fiscal_year=2026");

  const traccia = fake
    .rows("auditLog")
    .find((row) => row.action === "accounting.export.generated");

  assert.ok(traccia, "un export che non lascia traccia non si puo ricostruire");
  assert.equal(traccia.actor_user_id, GESTORE);
  assert.equal(traccia.organization_id, CLUB);
  assert.equal(traccia.metadata.rowCount, 2);
  assert.equal(traccia.metadata.filters.fiscalYear, 2026);
});

/* ============================================ la trappola dell'anno === */

test("senza anno fiscale il file non esce vuoto", async () => {
  /*
    `Number(null)` vale `0` ed e un intero: un filtro scritto a mano avrebbe
    interrogato `fiscal_year = 0` e consegnato un file con la sola
    intestazione a chiunque non scelga un anno.
  */
  const { testo } = await esporta();
  assert.equal(righeDati(testo).length, 2);
});
