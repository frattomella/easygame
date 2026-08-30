import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { projectLegacyClubMovements } from "./src/lib/accounting/ledger-view.ts";

const prisma = new PrismaClient();
const CLUB = randomUUID();
const N = String.fromCharCode(10);

const CASI = [
  ["baseline", { id: "a", date: "2026-03-09", amount: 10 }],
  ["31 febbraio", { id: "b", date: "2026-02-31", amount: 10 }],
  ["data con coda", { id: "c", date: "2026-03-01xyz", amount: 10 }],
  ["importo italiano", { id: "d", date: "2026-03-09", amount: "1.234,56" }],
  ["importo enorme 999999999999", { id: "e", date: "2026-03-09", amount: 999999999999 }],
  ["1e15", { id: "f", date: "2026-03-09", amount: 1e15 }],
  ['"Infinity"', { id: "g", date: "2026-03-09", amount: "Infinity" }],
  ['"NaN"', { id: "h", date: "2026-03-09", amount: "NaN" }],
  ["negativo", { id: "i", date: "2026-03-09", amount: -42.5 }],
  ['"1e3"', { id: "j", date: "2026-03-09", amount: "1e3" }],
  ['"0x10"', { id: "k", date: "2026-03-09", amount: "0x10" }],
  ["true", { id: "l", date: "2026-03-09", amount: true }],
  ["array [5]", { id: "m", date: "2026-03-09", amount: [5] }],
  ["oggetto", { id: "n", date: "2026-03-09", amount: { v: 5 } }],
  ["null", { id: "o", date: "2026-03-09", amount: null }],
  ["senza amount", { id: "p", date: "2026-03-09" }],
  ["senza data", { id: "q", amount: 10 }],
  ['date "now"', { id: "r", date: "now", amount: 10 }],
  ['date "infinity"', { id: "s", date: "infinity", amount: 10 }],
  ['date "today"', { id: "t", date: "today", amount: 10 }],
  ['date "epoch"', { id: "u", date: "epoch", amount: 10 }],
  ["date array", { id: "v", date: ["2026-03-09"], amount: 10 }],
  ["solo created_at", { id: "w", date: null, created_at: "2026-04-01", amount: 10 }],
  ["date sporca + created_at buono", { id: "x", date: "garbage", created_at: "2026-04-01", amount: 10 }],
  ["offset +02:00", { id: "y", date: "2026-03-09T12:00:00+02:00", amount: 10 }],
  ["spazi", { id: "z", date: "2026-03-09", amount: "  12  " }],
  ["slash date 09/03/2026", { id: "B", date: "09/03/2026", amount: 10 }],
  ["mezzo centesimo 0.004", { id: "C", date: "2026-03-09", amount: 0.004 }],
  ["anno 1", { id: "E", date: "0001-01-01", amount: 10 }],
  ["anno 300000", { id: "F", date: "300000-01-01", amount: 10 }],
  ['"1,5"', { id: "G", date: "2026-03-09", amount: "1,5" }],
  ['" 1e400"', { id: "H", date: "2026-03-09", amount: " 1e400" }],
  ["-1e15", { id: "I", date: "2026-03-09", amount: -1e15 }],
  ["arrot 1.005", { id: "J", date: "2026-03-09", amount: 1.005 }],
  ["arrot -1.005", { id: "K", date: "2026-03-09", amount: -1.005 }],
  ["arrot 2.675", { id: "L", date: "2026-03-09", amount: 2.675 }],
];

const norm = (v) => (v instanceof Date ? v.toISOString() : v === null || v === undefined ? null : v);

const main = async () => {
  const u = await prisma.user.findFirst();
  await prisma.club.create({
    data: { id: CLUB, slug: "probe-" + CLUB.slice(0, 8), name: "Probe blob",
            creator_id: u.id, updated_at: new Date(), transactions: [], transfers: [] },
  });

  const righe = [];
  for (const [nome, caso] of CASI) {
    await prisma.club.update({ where: { id: CLUB }, data: { transactions: [caso] } });
    let dSql, dTs;
    try {
      const r = await prisma.accountingLedgerLine.findMany({ where: { organization_id: CLUB } });
      dSql = r.length === 0 ? "scartata" : r.map((x) => norm(x.entry_date) + " " + x.direction + " " + x.amount_cents).join(";");
    } catch (e) { dSql = "CADE: " + String(e?.message || e).split(N).filter((l)=>/error/i.test(l)).slice(0,1).join("").trim(); }
    try {
      const r = projectLegacyClubMovements({ id: CLUB, transactions: [caso], transfers: [] });
      dTs = r.length === 0 ? "scartata" : r.map((x) => norm(x.entry_date) + " " + x.direction + " " + x.amount_cents).join(";");
    } catch (e) { dTs = "CADE: " + String(e?.message || e).slice(0, 50); }
    righe.push({ nome, dSql, dTs, ok: dSql === dTs });
  }

  for (const r of righe) {
    console.log((r.ok ? "  ok    " : "DIVERGE") + " | " + r.nome + N + "          SQL: " + r.dSql + N + "          TS : " + r.dTs);
  }
  console.log(N + "Divergenze: " + righe.filter((r) => !r.ok).length + " su " + righe.length);

  console.log(N + "=== id duplicati nel blob ===");
  await prisma.club.update({ where: { id: CLUB }, data: {
    transactions: [{ id: "SAME", date: "2026-05-01", amount: 1 }, { id: "SAME", date: "2026-05-01", amount: 2 }, { id: "SAME", date: "2026-05-01", amount: 3 }],
    transfers: [{ id: "SAME", date: "2026-05-01", amount: 4 }, { id: "SAME", date: "2026-05-01", amount: 5 }] } });
  const dup = await prisma.accountingLedgerLine.findMany({ where: { organization_id: CLUB } });
  const ids = dup.map((r) => r.id);
  console.log("  id vista: " + JSON.stringify(ids) + "  -> unici " + new Set(ids).size + "/" + ids.length);
  const tsDup = projectLegacyClubMovements(await prisma.club.findUnique({ where: { id: CLUB } }));
  console.log("  id TS   : " + JSON.stringify(tsDup.map((r) => r.id)));

  console.log(N + "=== paginazione, 50 righe stessa data, pagine da 7 ===");
  const grande = Array.from({ length: 50 }, (_, i) => ({ id: "x" + (i % 3), date: "2026-06-01", amount: 1 + (i % 5), description: "r" + i }));
  await prisma.club.update({ where: { id: CLUB }, data: { transactions: grande, transfers: [] } });
  const viste = [];
  for (let skip = 0; skip < 56; skip += 7) {
    const p = await prisma.accountingLedgerLine.findMany({ where: { organization_id: CLUB }, orderBy: [{ entry_date: "desc" }, { id: "asc" }], skip, take: 7 });
    viste.push(...p.map((r) => r.id));
  }
  const tot = await prisma.accountingLedgerLine.count({ where: { organization_id: CLUB } });
  console.log("  raccolte " + viste.length + ", uniche " + new Set(viste).size + ", totale vista " + tot);

  console.log(N + "=== blob da 50.000 elementi ===");
  const enorme = Array.from({ length: 50000 }, (_, i) => ({ id: "b" + i, date: "2026-07-01", amount: 1, description: "m" + i }));
  await prisma.club.update({ where: { id: CLUB }, data: { transactions: enorme } });
  const t0 = Date.now();
  const c50 = await prisma.accountingLedgerLine.count({ where: { organization_id: CLUB } });
  console.log("  " + c50 + " righe in " + (Date.now() - t0) + " ms");

  console.log(N + "=== JSON non array ===");
  for (const [etichetta, v] of [["oggetto", "'{\"a\":1}'"], ["stringa", "'\"s\"'"], ["numero", "'42'"], ["json null", "'null'"], ["colonna NULL", "NULL"]]) {
    await prisma.$executeRawUnsafe("UPDATE clubs SET transactions = " + (v === "NULL" ? "NULL" : v + "::jsonb") + ", transfers = " + (v === "NULL" ? "NULL" : v + "::jsonb") + " WHERE id = '" + CLUB + "'::uuid");
    try {
      const c = await prisma.accountingLedgerLine.count({ where: { organization_id: CLUB } });
      const club = await prisma.club.findUnique({ where: { id: CLUB } });
      const t = projectLegacyClubMovements(club).length;
      console.log("  " + etichetta + ": SQL " + c + " righe, TS " + t + " righe");
    } catch (e) { console.log("  " + etichetta + ": CADE " + String(e?.message).slice(0, 80)); }
  }
};

try { await main(); } catch (e) { console.error("SONDA CADUTA: " + (e?.message || e)); process.exitCode = 1; }
finally { await prisma.club.delete({ where: { id: CLUB } }).catch((e) => console.error("pulizia: " + e?.message)); await prisma.$disconnect(); }
