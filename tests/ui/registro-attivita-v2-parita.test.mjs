import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  AUDIT_OUTCOME_LABELS,
  AUDIT_OUTCOME_STATUS,
  auditAreaOf,
  auditOutcomeLabel,
  auditOutcomeSpec,
  metadataEntries,
} from "@/components/audit/v2/audit-model";

/**
 * Parita della pagina Registro attività V2 con l'audit V1
 * (`docs/redesign/audit/wave-e-registro-attivita.md`).
 *
 * I sette filtri della V1 arrivano al server con gli stessi parametri, la
 * paginazione e quella del servizio (50), un 403 si racconta, i metadati si
 * leggono per intero nell'ispettore. La pagina monta il guscio che alla V1
 * mancava.
 */
const read = (relative) => readFileSync(path.join(process.cwd(), relative), "utf8");
const sources = {
  page: read("src/app/audit/page.tsx"),
  grid: read("src/components/audit/v2/audit-grid.tsx"),
  inspector: read("src/components/audit/v2/audit-inspector.tsx"),
  model: read("src/components/audit/v2/audit-model.ts"),
};
const everything = Object.values(sources).join("\n");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("/audit: il guscio c'e (la V1 non lo montava), l'elenco e la griglia", () => {
  assert.match(sources.page, /<Sidebar \/>/);
  assert.match(sources.page, /<Header title="Registro attività" \/>/);
  assert.match(sources.page, /<PageHeader/);
  assert.match(sources.page, /module="registro-attivita"/);
  assert.match(sources.page, /Chi ha fatto cosa in questo club, e cosa è stato negato\./);
  assert.doesNotMatch(senzaCommenti(everything), /@\/components\/ui\/(card|badge|button|input|label)|window\.confirm|[^\w]fetch\(/);
});

test("/audit: i sette filtri della V1 arrivano al server con gli stessi parametri", () => {
  assert.match(sources.page, /apiRequest<\{ items: AuditEvent\[\]; total: number; areas: string\[\] \}>\(`\/api\/v1\/audit\?\$\{query\}`\)/);
  for (const parametro of ["area", "outcome", "actor_email", "resource", "from", "to", "denied"]) {
    assert.ok(sources.page.includes(`parametri.set("${parametro}"`), `il filtro ${parametro} deve essere mandato al server`);
  }
  assert.ok(sources.page.includes('parametri.set("to", `${applicati.to}T23:59:59`)'), "«Al» include la giornata intera, come la V1");
  assert.match(sources.page, /AUDIT_PAGE_SIZE/);
  assert.match(sources.grid, /AUDIT_PAGE_SIZE = 50/);
  // La griglia mostra i filtri, il server li applica
  assert.match(sources.grid, /const serverSide = \(\) => true;/);
  for (const filtro of ['label: "Area"', 'label: "Esito"', 'label: "Periodo"', 'label: "Solo dinieghi"']) {
    assert.ok(sources.grid.includes(filtro), `manca il filtro ${filtro}`);
  }
  assert.match(sources.page, /onFiltersChange=\{handleGridFilters\}/);
  assert.match(sources.page, /label="Chi \(indirizzo\)"/);
  assert.match(sources.page, /label="Risorsa"/);
  assert.match(sources.page, /placeholder="parte dell'indirizzo"/);
  assert.match(sources.page, /placeholder="athletes, payments…"/);
  assert.match(sources.grid, /label: "Negate", filters: \{ \[AUDIT_FILTER_IDS\.denied\]: true \}, builtIn: true, tone: "red"/);
});

test("/audit: la paginazione e quella del servizio, con «Precedenti» e «Successive»", () => {
  assert.match(sources.page, /<AuditPager offset=\{offset\} limit=\{AUDIT_PAGE_SIZE\}/);
  assert.match(sources.page, /serverTotal=\{totale\}/);
  assert.match(sources.page, /hideFooter/);
  assert.match(sources.grid, /Precedenti/);
  assert.match(sources.grid, /Successive/);
  assert.match(sources.grid, /onPageChange\(Math\.max\(0, offset - limit\)\)/);
});

test("/audit: un 403 si racconta con la chiave, non come elenco vuoto", () => {
  assert.match(sources.page, /risposta\.error\.status === 403/);
  assert.match(sources.page, /audit\.read/);
  assert.match(sources.page, /Il ruolo attivo non può leggere il registro/);
  assert.match(sources.page, /Lo concede il proprietario dalla gestione accessi\./);
  assert.match(sources.page, /negato \? \(/);
});

test("/audit: esito, azione, chi, risorsa, IP e metadati restano; l'ispettore li mostra tutti", () => {
  for (const column of ['id: "when"', 'id: "outcome"', 'id: "action"', 'id: "actor"', 'id: "resource"', 'id: "metadata"', 'id: "ip"']) {
    assert.ok(sources.grid.includes(column), `manca la colonna ${column}`);
  }
  assert.match(sources.grid, /getAccessRoleLabel\(row\.actor_role\)/);
  assert.match(sources.grid, /<CellChips items=\{metadataEntries\(row\.metadata\)/);
  assert.match(sources.inspector, /metadataEntries\(event\.metadata\)/);
  assert.match(sources.inspector, /width="narrow"/);
  assert.deepEqual(Object.values(AUDIT_OUTCOME_LABELS), ["Riuscite", "Fallite", "Negate"]);
  assert.equal(auditOutcomeSpec("success"), AUDIT_OUTCOME_STATUS.success);
  assert.equal(auditOutcomeSpec("denied").weight, "urgent");
  assert.equal(auditOutcomeLabel("failure"), "FALLITA");
  assert.equal(auditOutcomeSpec("strano").label, "STRANO", "un esito sconosciuto mostra il valore grezzo, come la V1");
  assert.deepEqual(metadataEntries({ permesso: "audit.read", righe: 3, dettaglio: { a: 1 } }), [
    { key: "permesso", value: "audit.read" },
    { key: "righe", value: "3" },
    { key: "dettaglio", value: '{"a":1}' },
  ]);
  assert.equal(auditAreaOf("payment.reminder.sent"), "payment");
});
