/**
 * **La vista e la sua dichiarazione dicono la stessa cosa?**
 *
 *     node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *       scripts/wave-4-registro-riconciliazione.mjs
 *
 * ---
 *
 * ## Perche questa sonda esiste
 *
 * Il registro di prima nota e scritto **due volte**:
 *
 * | Dove | Cosa fa |
 * |---|---|
 * | `prisma/migrations/20260830090000_wave4_registro_unico` | lo **esegue**, in SQL, ed e cio che la produzione usa |
 * | `src/lib/accounting/ledger-view.ts` | lo **dichiara**, in TypeScript, ed e cio che i test leggono |
 *
 * Due scritture della stessa regola sono due contabilita, a meno che qualcuno
 * provi che coincidono. Questo script e quel qualcuno, e lo fa nell'unico modo
 * che conta: contro **Postgres vero**, riga per riga, campo per campo.
 *
 * Senza, i tremila test verdi proverebbero soltanto che la dichiarazione e
 * coerente con se stessa — ed e esattamente il modo in cui questa Wave ha gia
 * nascosto, piu di una volta, difetti che il database avrebbe rifiutato.
 *
 * ## Cosa semina, e cosa cerca
 *
 * Un club dedicato con almeno un caso per ogni ramo della vista, e in
 * particolare quelli dove le due scritture potrebbero divergere: uno storno,
 * un rimborso, un compenso a netto zero, una liquidazione stornata, un
 * movimento storico nel blob, un documento annullato, un importo con la
 * frazione a mezzo centesimo.
 *
 * Il club viene cancellato alla fine.
 *
 * **Gira solo su un database di sviluppo.**
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { buildLedgerView } from "../src/lib/accounting/ledger-view.ts";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("Rifiuto: serve EASYGAME_DB_ENV=development.");
  process.exit(1);
}

const NL = String.fromCharCode(10);
const prisma = new PrismaClient();

const CLUB = randomUUID();
const CASSA = randomUUID();
const BANCA = randomUUID();
const CAUSALE = randomUUID();
const ATLETA = randomUUID();
const PERSONA = randomUUID();
const PROGRAMMA = randomUUID();
const INCASSO = randomUUID();
const RIMBORSO = randomUUID();
const STORNATO = randomUUID();
const STORNO = randomUUID();
const RICEVUTA = randomUUID();
const RICEVUTA_ANNULLATA = randomUUID();
const INCASSO_ANNULLATO = randomUUID();
const COMPENSO = randomUUID();
const COMPENSO_ZERO = randomUUID();
const LIQUIDAZIONE = randomUUID();
const STORNO_LIQUIDAZIONE = randomUUID();
const MOVIMENTO = randomUUID();
const GIROCONTO_A = randomUUID();
const GIROCONTO_B = randomUUID();
const GRUPPO = randomUUID();

const d = (s) => new Date(s);

const semina = async () => {
  const utente = await prisma.user.findFirst();
  if (!utente) throw new Error("Nessun utente nel database di sviluppo");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `riconciliazione-registro-${Date.now()}`,
      name: "ASD Riconciliazione Registro",
      creator_id: utente.id,
      /* Il blob storico: due movimenti e un giroconto. */
      transactions: [
        {
          id: "st-1",
          date: "2026-03-01T00:00:00.000Z",
          amount: 123.45,
          type: "income",
          description: "Storico in entrata",
          paymentMethod: "Contanti",
        },
        {
          id: "st-2",
          date: "2026-03-02T00:00:00.000Z",
          amount: 77.7,
          type: "expense",
          title: "Storico in uscita",
        },
        /* Senza data: non deve comparire da nessuna delle due parti. */
        { id: "st-3", amount: 10, type: "income", description: "Senza data" },
        /* Importo zero: idem. */
        { id: "st-4", date: "2026-03-03T00:00:00.000Z", amount: 0, description: "Zero" },
        /*
          **Le righe sporche, che erano il difetto piu grave della Wave.**

          Una revisione ostile ha mostrato che un solo `amount` in notazione
          italiana, o una data che non esiste, faceva fallire **l'intera query**
          della vista: da quel momento, per quel club, non funzionavano piu
          prima nota, rendiconto, export e saldi. Il gemello in TypeScript
          degradava con grazia, quindi le due scritture della stessa regola non
          coincidevano — e questa sonda non lo vedeva, perche non seminava
          niente di sporco.

          Adesso lo semina. Nessuna di queste righe deve comparire, e nessuna
          deve far cadere la lettura.
        */
        { id: "sp-1", date: "2026-03-05T00:00:00.000Z", amount: "1.234,56", description: "Importo italiano" },
        { id: "sp-2", date: "2026-02-31", amount: 10, description: "Trentuno febbraio" },
        { id: "sp-3", date: "2026-03-01xyz", amount: 10, description: "Data con la coda" },
        { id: "sp-4", date: {}, amount: 10, description: "Data che e un oggetto" },
        { id: "sp-5", date: "2026-03-06T00:00:00.000Z", amount: null, description: "Importo assente" },
        /*
          **Due righe con lo stesso `id`.** Producevano due righe del registro
          con lo stesso identificativo, e l'ordine del registro lo usa come
          criterio di spareggio: la pagina 2 poteva ripetere righe della 1.
        */
        { id: "st-1", date: "2026-03-07T00:00:00.000Z", amount: 11, description: "Id ripetuto" },
        /*
          Solo `created_at`: la dichiarazione la leggeva, l'SQL no, e la riga
          spariva da una lettura e non dall'altra.
        */
        { id: "sp-6", created_at: "2026-03-08T00:00:00.000Z", amount: 7.77, description: "Solo created_at" },
        /*
          **I casi che facevano cadere la vista un centesimo piu in la.**

          I due `try-cast` intercettavano il fallimento della conversione, non
          il `::int` che veniva dopo: oltre 21.474.836,47 euro i centesimi non
          entrano in un intero e Postgres alza, portandosi via l'intera query.
          NaN e gli infiniti passano volentieri per `double precision` e
          muoiono allo stesso modo, e `'infinity'` come data moriva sull'anno.
        */
        { id: "sc-1", date: "2026-03-09T00:00:00.000Z", amount: 999999999999, description: "Fuori scala" },
        { id: "sc-2", date: "2026-03-09T00:00:00.000Z", amount: 1e15, description: "Fuori scala grande" },
        { id: "sc-3", date: "2026-03-09T00:00:00.000Z", amount: -1e15, description: "Fuori scala negativo" },
        { id: "sc-4", date: "2026-03-09T00:00:00.000Z", amount: "Infinity", description: "Infinito" },
        { id: "sc-5", date: "2026-03-09T00:00:00.000Z", amount: "NaN", description: "Non un numero" },
        { id: "sc-6", date: "2026-03-09T00:00:00.000Z", amount: " 1e400", description: "Overflow di testo" },
        { id: "sc-7", date: "infinity", amount: 10, description: "Data infinita" },
        /*
          **Cio che le due letture leggevano diverso.** Postgres risolve le
          parole del tempo e legge `09/03/2026` come il 3 settembre; JavaScript
          non le risolve e lo legge come il 9 marzo. Un giorno di scarto a
          cavallo di dicembre e un anno fiscale sbagliato.
        */
        { id: "sc-8", date: "now", amount: 10, description: "La parola adesso" },
        { id: "sc-9", date: "today", amount: 10, description: "La parola oggi" },
        { id: "sc-10", date: "epoch", amount: 10, description: "La parola epoca" },
        { id: "sc-11", date: "09/03/2026", amount: 10, description: "Data all'americana" },
        { id: "sc-12", date: "2026-03-09T12:00:00+02:00", amount: 13, description: "Data con fuso" },
        /*
          `COALESCE` sceglieva fra i due valori **grezzi**: una data sporca ma
          presente vinceva su un `created_at` buono, e la riga usciva da una
          lettura e non dall'altra.
        */
        { id: "sc-13", date: "sporca", created_at: "2026-04-01T00:00:00.000Z", amount: 21, description: "Ripiego sul created_at" },
        /* Un booleano vale 1 per JavaScript e non e un numero per Postgres. */
        { id: "sc-14", date: "2026-03-09T00:00:00.000Z", amount: true, description: "Importo booleano" },
        { id: "sc-15", date: "2026-03-09T00:00:00.000Z", amount: [5], description: "Importo in lista" },
      ],
      transfers: [
        {
          id: "gt-1",
          date: "2026-03-04T00:00:00.000Z",
          amount: 500,
          description: "Giroconto storico",
        },
      ],
      settings: {
        seasons: [
          {
            id: "2026-27",
            label: "2026/27",
            startDate: "2026-07-01",
            endDate: "2027-06-30",
            status: "active",
          },
        ],
      },
    },
  });

  await prisma.financialAccount.createMany({
    data: [
      { id: CASSA, organization_id: CLUB, name: "Cassa", kind: "CASH", updated_at: new Date() },
      { id: BANCA, organization_id: CLUB, name: "Banca", kind: "BANK", updated_at: new Date() },
    ],
  });

  await prisma.fiscalOperationType.create({
    data: {
      id: CAUSALE,
      organization_id: CLUB,
      code: "quota_attivita",
      label: "Quota attivita",
      activity_scope: "institutional",
      updated_at: new Date(),
    },
  });

  await prisma.athlete.create({
    data: {
      id: ATLETA,
      organization_id: CLUB,
      first_name: "Anna",
      last_name: "Rossi",
      updated_at: new Date(),
    },
  });

  await prisma.paymentTransaction.createMany({
    data: [
      {
        id: INCASSO,
        organization_id: CLUB,
        athlete_id: ATLETA,
        /* Mezzo centesimo: e dove l'arrotondamento dei due linguaggi diverge. */
        amount: 200.005,
        paid_at: d("2026-09-10T00:00:00Z"),
        payment_method: "Contanti",
        financial_account_id: CASSA,
        operation_type_code: "quota_attivita",
        activity_scope_snapshot: "institutional",
        updated_at: new Date(),
      },
      {
        id: RIMBORSO,
        organization_id: CLUB,
        athlete_id: ATLETA,
        amount: -50,
        paid_at: d("2026-09-11T00:00:00Z"),
        payment_method: "Bonifico",
        financial_account_id: BANCA,
        updated_at: new Date(),
      },
      {
        id: STORNATO,
        organization_id: CLUB,
        athlete_id: ATLETA,
        amount: 100,
        paid_at: d("2026-09-12T00:00:00Z"),
        payment_method: "Contanti",
        financial_account_id: CASSA,
        reversed_at: d("2026-09-13T00:00:00Z"),
        updated_at: new Date(),
      },
      {
        id: STORNO,
        organization_id: CLUB,
        athlete_id: ATLETA,
        amount: -100,
        paid_at: d("2026-09-13T00:00:00Z"),
        payment_method: "Contanti",
        financial_account_id: CASSA,
        reverses_transaction_id: STORNATO,
        updated_at: new Date(),
      },
      {
        id: INCASSO_ANNULLATO,
        organization_id: CLUB,
        athlete_id: ATLETA,
        amount: 60,
        paid_at: d("2026-09-14T00:00:00Z"),
        payment_method: "Contanti",
        financial_account_id: CASSA,
        updated_at: new Date(),
      },
      /*
        **Un incasso da zero non esiste**, e non per scelta di questa sonda: il
        database lo rifiuta con `payment_transactions_amount_check`. La prima
        stesura di questo script ne seminava uno, per provare che entrambe le
        letture lo scartano, e Postgres ha risposto prima che la prova
        cominciasse.
        Vale la pena scriverlo: il ramo «importo zero» delle due proiezioni e
        irraggiungibile per gli incassi, e resta esercitato solo dove un
        importo nullo e davvero possibile — il blob storico, che vincoli non ne
        ha, e il netto di un compenso interamente trattenuto.
      */
    ],
  });

  await prisma.receipt.createMany({
    data: [
      {
        id: RICEVUTA,
        organization_id: CLUB,
        athlete_id: ATLETA,
        transaction_id: INCASSO,
        receipt_number: "2026/000001",
        issue_date: d("2026-09-10T00:00:00Z"),
        amount: 200,
        description: "Quota attivita",
        updated_at: new Date(),
      },
      {
        id: RICEVUTA_ANNULLATA,
        organization_id: CLUB,
        athlete_id: ATLETA,
        transaction_id: INCASSO_ANNULLATO,
        receipt_number: "2026/000002",
        issue_date: d("2026-09-14T00:00:00Z"),
        amount: 60,
        description: "Quota attivita",
        cancelled_at: d("2026-09-15T00:00:00Z"),
        updated_at: new Date(),
      },
    ],
  });

  await prisma.sportWorkPerson.create({
    data: {
      id: PERSONA,
      organization_id: CLUB,
      first_name: "Luca",
      last_name: "Bianchi",
      updated_at: new Date(),
    },
  });

  await prisma.sportWorkOutboundTransaction.createMany({
    data: [
      {
        id: COMPENSO,
        organization_id: CLUB,
        person_id: PERSONA,
        transaction_type: "COMPENSATION_PAYMENT",
        paid_at: d("2026-09-16T00:00:00Z"),
        fiscal_year: 2026,
        gross_amount: 1000,
        net_amount: 760,
        club_cost: 1240,
        financial_account_id: BANCA,
        payment_method: "Bonifico",
        reference: "CRO 12345",
        updated_at: new Date(),
      },
      /*
        Netto zero: dal conto verso la persona non e uscito niente, e la riga
        non deve comparire. E il difetto D-D, e la vista deve ripeterlo.
      */
      {
        id: COMPENSO_ZERO,
        organization_id: CLUB,
        person_id: PERSONA,
        transaction_type: "COMPENSATION_PAYMENT",
        paid_at: d("2026-09-17T00:00:00Z"),
        fiscal_year: 2026,
        gross_amount: 500,
        net_amount: 0,
        club_cost: 500,
        financial_account_id: BANCA,
        updated_at: new Date(),
      },
    ],
  });

  await prisma.fundingProgram.create({
    data: {
      id: PROGRAMMA,
      organization_id: CLUB,
      name: "Voucher sport",
      funder_name: "Regione",
      period_amount: 100,
      athlete_plafond: 400,
      valid_from: d("2026-07-01T00:00:00Z"),
      valid_to: d("2027-06-30T00:00:00Z"),
      updated_at: new Date(),
    },
  });

  await prisma.fundingSettlement.createMany({
    data: [
      {
        id: LIQUIDAZIONE,
        organization_id: CLUB,
        program_id: PROGRAMMA,
        settled_at: d("2026-09-18T00:00:00Z"),
        amount: 800,
        financial_account_id: BANCA,
        method: "Bonifico",
        notes: "Prima tranche",
        reversed_at: d("2026-09-19T00:00:00Z"),
        updated_at: new Date(),
      },
      {
        id: STORNO_LIQUIDAZIONE,
        organization_id: CLUB,
        program_id: PROGRAMMA,
        settled_at: d("2026-09-19T00:00:00Z"),
        /*
          **Negativo, e il database lo pretende.** Il vincolo
          `funding_settlements_amount_check` impone importo positivo a una
          liquidazione e importo negativo a uno storno. E la forma che la Wave
          ha dovuto adottare dopo che una prima stesura, con lo storno
          positivo, passava nei doppi e falliva sul database vero.
        */
        amount: -800,
        financial_account_id: BANCA,
        reversal_of_id: LIQUIDAZIONE,
        updated_at: new Date(),
      },
    ],
  });

  await prisma.accountingEntry.createMany({
    data: [
      {
        id: MOVIMENTO,
        organization_id: CLUB,
        entry_date: d("2026-09-20T00:00:00Z"),
        fiscal_year: 2026,
        season_id: "2026-27",
        direction: "OUT",
        amount_cents: 48000,
        financial_account_id: CASSA,
        operation_type_id: CAUSALE,
        operation_type_code: "quota_attivita",
        operation_type_label_snapshot: "Quota attivita",
        activity_scope_snapshot: "institutional",
        description: "Affitto palestra",
        notes: "settembre",
        payment_method: "Contanti",
        counterparty_kind: "SUPPLIER",
        counterparty_label: "Comune di Prova",
        source_domain: "MANUAL",
        document_kind: "receipt",
        document_id: RICEVUTA,
        reconciliation_status: "reconciled",
        value_date: d("2026-09-21T00:00:00Z"),
        bank_reference: "EC-99",
        updated_at: new Date(),
      },
      {
        id: GIROCONTO_A,
        organization_id: CLUB,
        entry_date: d("2026-09-22T00:00:00Z"),
        fiscal_year: 2026,
        direction: "OUT",
        amount_cents: 50000,
        financial_account_id: CASSA,
        description: "Versamento in banca",
        source_domain: "INTERNAL_TRANSFER",
        transfer_group_id: GRUPPO,
        updated_at: new Date(),
      },
      {
        id: GIROCONTO_B,
        organization_id: CLUB,
        entry_date: d("2026-09-22T00:00:00Z"),
        fiscal_year: 2026,
        direction: "IN",
        amount_cents: 50000,
        financial_account_id: BANCA,
        description: "Versamento in banca",
        source_domain: "INTERNAL_TRANSFER",
        transfer_group_id: GRUPPO,
        updated_at: new Date(),
      },
    ],
  });
};

/* ------------------------------------------------------------ il confronto */

/** I campi confrontati, e sono tutti quelli che la vista dichiara. */
const CAMPI = [
  "row_kind",
  "organization_id",
  "entry_date",
  "fiscal_year",
  "season_id",
  "direction",
  "amount_cents",
  "currency",
  "financial_account_id",
  "financial_account_name",
  "operation_type_code",
  "operation_type_label",
  "activity_scope",
  "description",
  "notes",
  "payment_method",
  "counterparty_kind",
  "counterparty_id",
  "counterparty_label",
  "source_domain",
  "source_id",
  "document_kind",
  "document_id",
  "document_number",
  "site_id",
  "reconciliation_status",
  "value_date",
  "bank_reference",
  "transfer_group_id",
  "reversal_of_id",
  "reversed_at",
  "reversal_reason",
  "created_by",
  "created_at",
  "search_text",
];

/**
 * `created_at` non si confronta: il database lo assegna lui con
 * `CURRENT_TIMESTAMP`, e la dichiarazione in TypeScript lo legge dalla riga
 * che il database ha appena scritto. Confrontarli proverebbe che l'orologio
 * funziona, non che la regola coincide.
 */
const NON_CONFRONTATI = new Set(["created_at"]);

const normalizza = (valore) => {
  if (valore === undefined || valore === null) return null;
  if (valore instanceof Date) return valore.toISOString();
  if (typeof valore === "number") return valore;
  return String(valore);
};

const leggiDichiarazione = async () => {
  const [entries, incassi, compensi, liquidazioni, club, conti, causali, atleti, persone, programmi, fatture, ricevute] =
    await Promise.all([
      prisma.accountingEntry.findMany({ where: { organization_id: CLUB } }),
      prisma.paymentTransaction.findMany({ where: { organization_id: CLUB } }),
      prisma.sportWorkOutboundTransaction.findMany({ where: { organization_id: CLUB } }),
      prisma.fundingSettlement.findMany({ where: { organization_id: CLUB } }),
      prisma.club.findUnique({ where: { id: CLUB } }),
      prisma.financialAccount.findMany({ where: { organization_id: CLUB } }),
      prisma.fiscalOperationType.findMany({ where: { organization_id: CLUB } }),
      prisma.athlete.findMany({ where: { organization_id: CLUB } }),
      prisma.sportWorkPerson.findMany({ where: { organization_id: CLUB } }),
      prisma.fundingProgram.findMany({ where: { organization_id: CLUB } }),
      prisma.invoice.findMany({ where: { organization_id: CLUB } }),
      prisma.receipt.findMany({ where: { organization_id: CLUB } }),
    ]);

  const perId = (righe) => new Map(righe.map((r) => [r.id, r]));
  const contiPerId = perId(conti);
  const causaliPerId = perId(causali);
  const causaliPerCodice = new Map(causali.map((c) => [c.code, c]));
  const atletiPerId = perId(atleti);
  const personePerId = perId(persone);
  const programmiPerId = perId(programmi);
  const nome = (p) => (p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() || null : null);

  const numeroDocumento = (kind, id) => {
    if (!id) return null;
    const tipo = String(kind || "").toLowerCase();
    if (tipo === "invoice" || tipo === "fattura") {
      return fatture.find((f) => f.id === id)?.invoice_number || null;
    }
    if (tipo === "receipt" || tipo === "ricevuta") {
      return ricevute.find((r) => r.id === id)?.receipt_number || null;
    }
    return null;
  };

  return buildLedgerView({
    entries: entries.map((row) => ({
      ...row,
      _accountName: contiPerId.get(row.financial_account_id)?.name || null,
      _operationTypeLabel: causaliPerId.get(row.operation_type_id)?.label || null,
      _documentNumber: numeroDocumento(row.document_kind, row.document_id),
    })),
    paymentTransactions: incassi.map((row) => {
      const fattura = fatture.find((f) => f.transaction_id === row.id && !f.cancelled_at);
      const ricevuta = ricevute.find((r) => r.transaction_id === row.id && !r.cancelled_at);
      const documento = fattura || ricevuta;
      const causale = causaliPerCodice.get(row.operation_type_code);
      return {
        ...row,
        _athleteName: nome(atletiPerId.get(row.athlete_id)),
        _accountName: contiPerId.get(row.financial_account_id)?.name || null,
        _operationTypeLabel: causale?.label || null,
        _activityScope: causale?.activity_scope || null,
        _documentKind: documento ? (fattura ? "invoice" : "receipt") : null,
        _documentId: documento?.id || null,
        _documentNumber: fattura?.invoice_number || ricevuta?.receipt_number || null,
      };
    }),
    sportWorkPayouts: compensi.map((row) => ({
      ...row,
      _personName: nome(personePerId.get(row.person_id)),
      _accountName: contiPerId.get(row.financial_account_id)?.name || null,
    })),
    fundingSettlements: liquidazioni.map((row) => ({
      ...row,
      _programName: programmiPerId.get(row.program_id)?.name || null,
      _accountName: contiPerId.get(row.financial_account_id)?.name || null,
    })),
    clubs: [club],
  });
};

const confronta = async () => {
  const sql = await prisma.accountingLedgerLine.findMany({
    where: { organization_id: CLUB },
    orderBy: [{ entry_date: "desc" }, { id: "asc" }],
  });
  const ts = await leggiDichiarazione();

  const differenze = [];

  const idSql = new Set(sql.map((r) => r.id));
  const idTs = new Set(ts.map((r) => r.id));

  for (const id of idSql) {
    if (!idTs.has(id)) differenze.push({ id, campo: "-", sql: "presente", ts: "assente" });
  }
  for (const id of idTs) {
    if (!idSql.has(id)) differenze.push({ id, campo: "-", sql: "assente", ts: "presente" });
  }

  const tsPerId = new Map(ts.map((r) => [r.id, r]));
  for (const riga of sql) {
    const altra = tsPerId.get(riga.id);
    if (!altra) continue;
    for (const campo of CAMPI) {
      if (NON_CONFRONTATI.has(campo)) continue;
      const a = normalizza(riga[campo]);
      const b = normalizza(altra[campo]);
      if (a !== b) differenze.push({ id: riga.id, campo, sql: a, ts: b });
    }
  }

  /* L'ordine: le due letture devono restituire le righe nella stessa sequenza. */
  const ordineSql = sql.map((r) => r.id).join("|");
  const ordineTs = ts.map((r) => r.id).join("|");
  const ordineUguale = ordineSql === ordineTs;

  return { sql, ts, differenze, ordineUguale };
};

const pulisci = async () => {
  await prisma.club.delete({ where: { id: CLUB } }).catch((error) => {
    console.error(`Pulizia non riuscita, il club ${CLUB} e rimasto: ${error?.message}`);
  });
};

try {
  console.log(`${NL}Semina del club di prova ${CLUB}...`);
  await semina();

  console.log("Confronto fra la vista SQL e la dichiarazione in TypeScript...");
  const { sql, ts, differenze, ordineUguale } = await confronta();

  console.log(`  righe dalla vista SQL       : ${sql.length}`);
  console.log(`  righe dalla dichiarazione TS: ${ts.length}`);
  console.log(`  ordine identico             : ${ordineUguale ? "si" : "NO"}`);

  if (!differenze.length && ordineUguale) {
    console.log(
      `${NL}RICONCILIATO: le due letture del registro coincidono, riga per riga e campo per campo.`,
    );
  } else {
    console.log(`${NL}DIVERGENZE (${differenze.length}):`);
    for (const diff of differenze.slice(0, 60)) {
      console.log(
        `  ${diff.id}${NL}    campo ${diff.campo}${NL}    SQL: ${JSON.stringify(diff.sql)}${NL}    TS : ${JSON.stringify(diff.ts)}`,
      );
    }
    if (differenze.length > 60) console.log(`  ... e altre ${differenze.length - 60}`);
    if (!ordineUguale) console.log(`${NL}  L'ORDINE delle righe non coincide.`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`${NL}Sonda non riuscita:${NL}${String(error?.message).split(NL).slice(0, 60).join(NL)}`);
  process.exitCode = 1;
} finally {
  await pulisci();
  await prisma.$disconnect();
}
