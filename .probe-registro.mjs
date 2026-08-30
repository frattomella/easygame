/* SONDA OSTILE TEMPORANEA — da cancellare. Non fa parte del repository. */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { buildLedgerView } from "./src/lib/accounting/ledger-view.ts";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("serve EASYGAME_DB_ENV=development");
  process.exit(1);
}

const prisma = new PrismaClient();
const CLUB = randomUUID();

/* ---- 70+ valori ostili per data e importo del blob storico -------------- */
const DATE_OSTILI = [
  "2026-03-09T12:00",
  "2026-03-09T12:00:00",
  "2026-03-09 12:00",
  "2026-03-09 12:00:00",
  "2026-03-09 12:00:00Z",
  "2026-03-09 12:00Z",
  "2026-03-09 12:00:00+02:00",
  "2026-03-09T12:00+0200",
  "2026-03-09T12:00:00+0200",
  "2026-03-09T12:00:00-0500",
  "2026-03-09T12:00:00.123456789Z",
  "2026-03-09T12:00:00.5",
  "2026-03-09T12:00:00.5Z",
  "2026-12-31T23:00:00-05:00",
  "2026-01-01T00:30:00+02:00",
  "2026-12-31T23:30:00",
  "2027-01-01T00:30:00",
  "2026-02-29",
  "2026-02-30",
  "2026-00-10",
  "2026-13-01",
  "2026-03-00",
  "2026-03-32",
  "0000-01-01",
  "0001-01-01",
  "9999-12-31T23:59:59.999Z",
  "2026-03-09T24:00",
  "2026-03-09T24:00:00",
  "2026-03-09T23:59:60",
  "2026-03-09T12:60",
  "2026-03-09T25:00",
  " 2026-03-09 ",
  "2026-03-09\t",
  "2026-03-09T12:00:00+14:00",
  "2026-03-09T12:00:00-12:00",
  "2026-03-09T12:00:00+23:59",
  "2026-03-09T12:00:00+99:99",
  "2026-03-29T02:30:00",
  "2026-10-25T02:30:00",
  "2026-03-29T02:30",
  "2026-03-09t12:00:00z",
  "2026-03-09T12:00:00z",
  "2026-03-09T12:00:00 Z",
  "2026-03-09T12:00:00.000000Z",
  "2026-03-09T12:00:00.Z",
  "2026-03-09T12:00:00.0000000001Z",
  "2026-03-09",
  "2026-03-09T00:00",
];

const IMPORTI_OSTILI = [
  21474836.47,
  21474836.475,
  21474836.48,
  -21474836.47,
  -21474836.48,
  "21474836.47",
  " 21474836.47 ",
  "0x10",
  "0b101",
  "0o17",
  "0X1F",
  "inf",
  "-inf",
  "Inf",
  "infinity",
  "nan",
  "NAN",
  "1_000",
  "+5",
  "5.",
  ".5",
  "5e",
  "1e309",
  "1e-400",
  "  12  ",
  "12\n",
  "",
  "   ",
  "1,5",
  "1.234,56",
  "1 234",
  "12abc",
  "abc",
  "1e3",
  "1E3",
  0.005,
  -0.005,
  0.004999999,
  -0.004999999,
  0.0049,
  1e-10,
  -1e-10,
  1e15,
  -1e15,
  "9007199254740993",
  "21474836.4749999999",
  "21474836.4750001",
  "2147483647e-2",
  "2147483648e-2",
  { a: 1 },
  [5],
  true,
  false,
  null,
];

const transactions = [];
DATE_OSTILI.forEach((v, i) => {
  transactions.push({ id: `D${i}`, date: v, amount: 10 + i, description: `data ${i}` });
});
IMPORTI_OSTILI.forEach((v, i) => {
  transactions.push({
    id: `A${i}`,
    date: "2026-05-01T00:00:00.000Z",
    amount: v,
    description: `importo ${i}`,
  });
});
/* ripiego su created_at con date ostili */
DATE_OSTILI.slice(0, 10).forEach((v, i) => {
  transactions.push({ id: `C${i}`, created_at: v, amount: 33, description: `created ${i}` });
});
/* JSON annidato profondo + descrizioni enormi */
let nested = { x: 1 };
for (let i = 0; i < 20; i += 1) nested = { n: nested };
transactions.push({
  id: "NEST",
  date: "2026-05-02T00:00:00.000Z",
  amount: 5,
  description: "x".repeat(200000),
  extra: nested,
});
transactions.push({
  id: "NESTDATE",
  date: nested,
  amount: 5,
  description: "data annidata",
});
/* elemento del blob che non e un oggetto */
transactions.push(42);
transactions.push("stringa");
transactions.push(null);
transactions.push([1, 2, 3]);

const transfers = [
  { id: "T0", date: "2026-03-09T12:00", amount: 100, description: "giro no offset" },
  { id: "T1", date: "2026-05-01T00:00:00.000Z", amount: "0x10", description: "giro esadecimale" },
  { id: "T2", date: "2026-05-01T00:00:00.000Z", amount: 21474836.48, description: "giro fuori scala" },
];

const CAMPI = [
  "row_kind", "organization_id", "entry_date", "fiscal_year", "season_id",
  "direction", "amount_cents", "currency", "financial_account_id",
  "financial_account_name", "operation_type_code", "operation_type_label",
  "activity_scope", "description", "notes", "payment_method",
  "counterparty_kind", "counterparty_id", "counterparty_label", "source_domain",
  "source_id", "document_kind", "document_id", "document_number", "site_id",
  "reconciliation_status", "value_date", "bank_reference", "transfer_group_id",
  "reversal_of_id", "reversed_at", "reversal_reason", "created_by", "search_text",
];

const norm = (v) => {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") return v;
  return String(v);
};

const etichetta = (id) => {
  const i = Number(id.replace(/\D/g, ""));
  if (id.startsWith("legacy-transaction:")) {
    const riga = transactions[i];
    if (riga && typeof riga === "object" && riga.id)
      return `${riga.id} date=${JSON.stringify(riga.date ?? riga.created_at)} amount=${JSON.stringify(riga.amount)}`;
  }
  return id;
};

try {
  const utente = await prisma.user.findFirst();
  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `probe-ostile-${Date.now()}`,
      name: "Probe ostile",
      creator_id: utente.id,
      transactions,
      transfers,
    },
  });

  const t0 = Date.now();
  const sql = await prisma.accountingLedgerLine.findMany({
    where: { organization_id: CLUB },
    orderBy: [{ entry_date: "desc" }, { id: "asc" }],
  });
  const msSql = Date.now() - t0;

  const club = await prisma.club.findUnique({ where: { id: CLUB } });
  const ts = buildLedgerView({ clubs: [club] });

  const idSql = new Set(sql.map((r) => r.id));
  const idTs = new Set(ts.map((r) => r.id));
  const diff = [];
  for (const id of idSql) if (!idTs.has(id)) diff.push({ id, campo: "PRESENZA", sql: "presente", ts: "assente" });
  for (const id of idTs) if (!idSql.has(id)) diff.push({ id, campo: "PRESENZA", sql: "assente", ts: "presente" });
  const perId = new Map(ts.map((r) => [r.id, r]));
  for (const r of sql) {
    const a = perId.get(r.id);
    if (!a) continue;
    for (const c of CAMPI) {
      const x = norm(r[c]);
      const y = norm(a[c]);
      if (x !== y) diff.push({ id: r.id, campo: c, sql: x, ts: y });
    }
  }

  console.log(`righe SQL=${sql.length} TS=${ts.length} (lettura vista ${msSql} ms)`);
  console.log(`DIVERGENZE: ${diff.length}`);
  const perRiga = new Map();
  for (const d of diff) {
    if (!perRiga.has(d.id)) perRiga.set(d.id, []);
    perRiga.get(d.id).push(d);
  }
  for (const [id, ds] of perRiga) {
    console.log(`\n### ${etichetta(id)}  [${id}]`);
    for (const d of ds) console.log(`   ${d.campo}: SQL=${JSON.stringify(d.sql)}  TS=${JSON.stringify(d.ts)}`);
  }
} catch (e) {
  console.error("SONDA FALLITA:", e?.message?.slice(0, 3000));
  process.exitCode = 1;
} finally {
  await prisma.club.delete({ where: { id: CLUB } }).catch((e) => console.error("pulizia:", e.message));
  await prisma.$disconnect();
}
