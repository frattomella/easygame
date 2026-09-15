import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { exportGridCsv } from "../../src/lib/web/export-grid-csv.ts";

/**
 * L'esportazione CSV di una griglia e una funzione sola: le colonne visibili,
 * il valore di esportazione (o d'ordinamento), il nome del file dal titolo o
 * gia deciso.
 */
const captured = [];
globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ click() { captured.push(this); } }) };
globalThis.URL = { createObjectURL: (blob) => blob, revokeObjectURL() {} };
globalThis.Blob = class { constructor(parts) { this.text = parts.map((part) => (typeof part === "string" ? part : "")).join(""); } };

test("il CSV porta le colonne visibili con exportValue o sortValue e il file prende il nome dal titolo", () => {
  captured.length = 0;
  exportGridCsv(
    {
      kind: "csv", scope: "filtered",
      rows: [{ id: "1", name: "Rossi", amount: 12 }],
      columns: [
        { id: "name", header: "Nome", exportValue: (r) => r.name },
        { id: "amount", header: "Importo", sortValue: (r) => r.amount },
      ],
    },
    "Piani di pagamento",
  );
  assert.equal(captured.length, 1);
  assert.match(captured[0].download, /^piani-di-pagamento-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.match(captured[0].href.text, /Nome;Importo|Nome,Importo/);
  assert.match(captured[0].href.text, /Rossi/);
});

test("un nome che finisce in .csv e gia il nome del file", () => {
  captured.length = 0;
  exportGridCsv({ kind: "csv", scope: "filtered", rows: [], columns: [{ id: "a", header: "A" }] }, "f24-2026.csv");
  assert.equal(captured[0].download, "f24-2026.csv");
});

test("nessuna pagina riscrive l'esportazione in casa", () => {
  const files = [
    "src/app/registration-management/page.tsx",
    "src/app/sport-work/relationships/page.tsx",
    "src/app/sport-work/compensations/page.tsx",
    "src/app/sport-work/deadlines/page.tsx",
    "src/app/sport-work/obligations/page.tsx",
    "src/components/sport-work/v2/installments-grid.tsx",
    "src/components/sport-work/v2/payouts-grid.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /toCsv\(/, file);
    assert.match(source, /from "@\/lib\/web\/export-grid-csv"/, file);
  }
});
