/* Throwaway adversarial probe — Reviewer 5. Read-only against the kept benchmark club. */
import { PrismaClient } from "@prisma/client";

const CLUB = process.env.PROBE_CLUB;
if (!CLUB) { console.error("PROBE_CLUB mancante"); process.exit(1); }
const prisma = new PrismaClient();

const scope = {
  userId: null,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
};
const PIENI = { manage: true, reverse: true, reconcile: true };
const NULLI = { manage: false, reverse: false, reconcile: false };

const { listAccountingEntries, readAllAccountingLines } = await import("./src/lib/server/accounting.ts");
const { buildAccountingReport, readAccrualSummary } = await import("./src/lib/server/accounting-reports.ts");
const { buildAccountingExport } = await import("./src/lib/server/accounting-export.ts");
const { listOperationTypes } = await import("./src/lib/server/fiscal-config.ts");
const { listFinancialAccountBalances } = await import("./src/lib/server/financial-accounts.ts");

const risultati = [];
const misura = async (etichetta, giri, fn) => {
  const campioni = [];
  let extra = "";
  for (let i = 0; i < giri; i++) {
    const t0 = process.hrtime.bigint();
    let out;
    try { out = await fn(); }
    catch (e) { console.log(`  ${etichetta.padEnd(52)} ERRORE: ${String(e?.message).slice(0, 90)}`); return; }
    campioni.push(Number(process.hrtime.bigint() - t0) / 1e6);
    if (i === 0 && out) {
      if (Array.isArray(out?.lines)) extra = `lines=${out.lines.length} total=${out.total} trunc=${out.truncated}`;
      else if (Array.isArray(out?.entries)) extra = `entries=${out.entries.length} total=${out.total}`;
      else if (out?.lineCount !== undefined) extra = `lineCount=${out.lineCount} trunc=${out.truncated}`;
      else if (Array.isArray(out)) extra = `n=${out.length}`;
      else if (out?.rows) extra = `rows=${out.rows.length ?? "?"}`;
      else if (typeof out === "object") extra = Object.keys(out).slice(0, 3).join(",");
    }
  }
  campioni.sort((a, b) => a - b);
  const mediana = campioni[Math.floor(campioni.length / 2)];
  risultati.push({ etichetta, mediana, min: campioni[0], max: campioni[campioni.length - 1], extra });
  console.log(`  ${etichetta.padEnd(52)} med ${mediana.toFixed(0).padStart(6)} ms  (min ${campioni[0].toFixed(0)} / max ${campioni[campioni.length - 1].toFixed(0)})  ${extra}`);
};

console.log("\n--- SCOMPOSIZIONE DEL RENDICONTO (fiscalYear 2026) ---");
await misura("buildAccountingReport (intero)", 5, () => buildAccountingReport({ organizationId: CLUB, fiscalYear: 2026 }, scope));
await misura("  readAllAccountingLines (le righe)", 5, () => readAllAccountingLines({ organizationId: CLUB, fiscalYear: 2026 }, scope, NULLI));
await misura("  readAccrualSummary (la competenza)", 5, () => readAccrualSummary(CLUB));
await misura("  listOperationTypes", 5, () => listOperationTypes(CLUB, { seed: false }));
await misura("  listFinancialAccountBalances", 5, () => listFinancialAccountBalances(scope));

console.log("\n--- IL RENDICONTO CON compareWith (due letture integrali) ---");
await misura("buildAccountingReport + compareWith", 3, () =>
  buildAccountingReport({ organizationId: CLUB, fiscalYear: 2026, compareWith: { fiscalYear: 2025 } }, scope));

console.log("\n--- RENDICONTO SENZA FILTRO (tutto il registro, 35.000 righe) ---");
await misura("buildAccountingReport (nessun filtro)", 3, () => buildAccountingReport({ organizationId: CLUB }, scope));
await misura("readAllAccountingLines (nessun filtro)", 3, () => readAllAccountingLines({ organizationId: CLUB }, scope, NULLI));

console.log("\n--- EXPORT ---");
await misura("buildAccountingExport (fiscalYear 2026)", 3, () => buildAccountingExport({ organizationId: CLUB, fiscalYear: 2026 }, scope));
await misura("buildAccountingExport (nessun filtro)", 3, () => buildAccountingExport({ organizationId: CLUB }, scope));

console.log("\n--- PRIMA NOTA: paginazione e ricerca ---");
await misura("pagina 1", 5, () => listAccountingEntries({ limit: 50 }, scope, PIENI));
await misura("offset 17.500", 5, () => listAccountingEntries({ limit: 50, offset: 17500 }, scope, PIENI));
await misura("offset 34.950 (ultima pagina)", 5, () => listAccountingEntries({ limit: 50, offset: 34950 }, scope, PIENI));
await misura("ricerca che non trova niente", 5, () => listAccountingEntries({ search: "zzzznessuno", limit: 50 }, scope, PIENI));
await misura("ricerca che trova TUTTO ('o')", 5, () => listAccountingEntries({ search: "o", limit: 50 }, scope, PIENI));
await misura("limit 500 (il massimo)", 5, () => listAccountingEntries({ limit: 500 }, scope, PIENI));
await misura("filtro stagione inesistente", 5, () => listAccountingEntries({ seasonId: "nessuna-stagione", limit: 50 }, scope, PIENI));

await prisma.$disconnect();
