import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  BONUS_STATUS_SPEC,
  DECLARATION_STATUS_SPEC,
  INSTALLMENT_STATUS_SPEC,
  OBLIGATION_STATUS_SPEC,
  RASD_STATUS_SPEC,
  REIMBURSEMENT_STATUS_SPEC,
  RELATIONSHIP_STATUS_SPEC,
  VAT_INVOICE_STATUS_SPEC,
  specOf,
} from "@/components/sport-work/v2/sport-work-status";
import {
  buildDeadlineEntries,
  deadlineBucketOf,
  dueLabel,
  monthLabel,
  relationshipHref,
  withClubId,
} from "@/components/sport-work/v2/sport-work-model";
import {
  emptyBonusDraft,
  emptyExpenseDraft,
  emptyInvoiceDraft,
  emptyPersonDraft,
  emptyPlanForm,
  emptyRelationshipDraft,
  planFormToConfig,
  validateBonusDraft,
  validateExpenseDraft,
  validateInvoiceDraft,
  validateRelationshipDraft,
} from "@/components/sport-work/v2/sport-work-forms";
import { MONEY_STATUS, PERSON_STATUS, STATUS_UNKNOWN } from "@/lib/web/status";
import {
  INSTALLMENT_STATUSES,
  OBLIGATION_STATUSES,
  RASD_STATUSES,
  REIMBURSEMENT_STATUSES,
  RELATIONSHIP_STATUSES,
} from "@/lib/sport-work/model";

/**
 * Parita del modulo «Lavoro sportivo» Web V2 con l'audit V1
 * (`docs/redesign/audit/wave-e-lavoro-sportivo.md`).
 *
 * Il redesign cambia forma, non capacita: ogni etichetta, azione, campo,
 * endpoint e chiave di permesso che l'audit elenca deve restare nel sorgente
 * V2. Un test statico non prova che funzioni — lo fa il lead a schermo — ma
 * impedisce che una capacita sparisca per distrazione.
 */
const read = (relative) => readFileSync(path.join(process.cwd(), relative), "utf8");
const V2 = "src/components/sport-work/v2";
const sources = {
  dashboard: read("src/app/sport-work/page.tsx"),
  relationships: read("src/app/sport-work/relationships/page.tsx"),
  detail: read("src/app/sport-work/relationships/[id]/page.tsx"),
  compensations: read("src/app/sport-work/compensations/page.tsx"),
  deadlines: read("src/app/sport-work/deadlines/page.tsx"),
  obligations: read("src/app/sport-work/obligations/page.tsx"),
  shell: read(`${V2}/sport-work-shell.tsx`),
  role: read(`${V2}/use-sport-work-role.ts`),
  status: read(`${V2}/sport-work-status.ts`),
  model: read(`${V2}/sport-work-model.ts`),
  relationshipDrawer: read(`${V2}/relationship-drawer.tsx`),
  payoutDrawer: read(`${V2}/payout-drawer.tsx`),
  planDrawer: read(`${V2}/plan-drawer.tsx`),
  planSection: read(`${V2}/plan-section.tsx`),
  position: read(`${V2}/position-section.tsx`),
  declaration: read(`${V2}/declaration-drawer.tsx`),
  documents: read(`${V2}/documents-section.tsx`),
  installments: read(`${V2}/installments-grid.tsx`),
  payouts: read(`${V2}/payouts-grid.tsx`),
  reason: read(`${V2}/reason-dialog.tsx`),
  bonus: read(`${V2}/bonus-drawer.tsx`),
  expense: read(`${V2}/expense-drawer.tsx`),
  invoice: read(`${V2}/invoice-drawer.tsx`),
  forms: read(`${V2}/sport-work-forms.ts`),
};
const senzaCommenti = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const everything = Object.values(sources).join("\n");
const codice = senzaCommenti(everything);
const pages = [sources.dashboard, sources.relationships, sources.detail, sources.compensations, sources.deadlines, sources.obligations];

/* ------------------------------------------------------------- il guscio */

test("guscio: le cinque sezioni restano indirizzi veri, con clubId, e la guardia sport_work.read", () => {
  for (const href of ["/sport-work", "/sport-work/relationships", "/sport-work/compensations", "/sport-work/deadlines", "/sport-work/obligations"]) {
    assert.ok(sources.shell.includes(`href: "${href}"`), `${href} deve restare nella navigazione del modulo`);
  }
  assert.match(sources.shell, /SPORT_WORK_SECTIONS.map/);
  assert.match(sources.shell, /pathname\.startsWith\(section\.href\)/);
  assert.match(sources.shell, /<SegmentedControl<SportWorkSectionId>/);
  assert.match(sources.shell, /router\.push\(withClubId\(section\.href, clubId\)\)/);
  assert.match(sources.shell, /Questa sezione non è per il ruolo attivo/);
  assert.match(sources.shell, /li vedono il proprietario e il club manager/);
  assert.match(sources.role, /hasSportWorkPermission\(role, "sport_work\.read"\)/);
  assert.match(sources.role, /"sport_work\.manage"/);
  assert.match(sources.role, /"sport_work\.pay"/);
  assert.match(sources.role, /"sport_work\.fiscal"/);
  assert.match(sources.role, /readStoredActiveClub\(\)\?\.role/, "il ruolo si legge come nella V1");
  assert.equal(withClubId("/sport-work/deadlines", "c1"), "/sport-work/deadlines?clubId=c1");
  assert.equal(withClubId("/sport-work/deadlines?view=overdue", "c1"), "/sport-work/deadlines?view=overdue&clubId=c1");
  assert.equal(relationshipHref("r1", null), "/sport-work/relationships/r1");
  for (const page of pages) {
    assert.match(page, /<SportWorkShell/);
    assert.match(page, /<Suspense fallback=\{null\}>/);
  }
});

test("guscio: nessuna primitiva V1, nessun fetch diretto, nessun window.confirm/prompt", () => {
  assert.doesNotMatch(everything, /@\/components\/ui\/(card|badge|button|dialog|input|label|select|tabs|textarea|checkbox)"/);
  assert.doesNotMatch(everything, /fetch\(/);
  assert.doesNotMatch(codice, /window\.(confirm|prompt|alert)/);
  assert.doesNotMatch(everything, /bg-gradient-to-/);
  assert.doesNotMatch(codice, /SharedPageHeader|SportWorkStat|sport-work-format/);
  assert.doesNotMatch(everything, /!\s*["»]/, "niente punti esclamativi nei testi");
});

/* ----------------------------------------------------------- /sport-work */

test("/sport-work: i dodici numeri della V1, il giro a mano solo per chi puo, gli adempimenti prossimi", () => {
  const s = sources.dashboard;
  assert.match(s, /"\/api\/v1\/sport-work\/dashboard"/);
  assert.match(s, /"\/api\/v1\/sport-work\/obligations\?status=DUE"/);
  assert.match(s, /"\/api\/v1\/sport-work\/scheduler", \{ method: "POST" \}/);
  assert.match(s, /canManage \? \(\s*<Button[\s\S]*?>\s*Aggiorna maturato e agenda/);
  assert.match(s, /Agenda aggiornata: \$\{data\?\.obligations\?\.created \?\? 0\} adempimenti nuovi/);
  for (const label of ['label="Programmato"', 'label="Maturato"', 'label="Pagato"', 'label="Costo per il club"', 'label="Da pagare"', 'label="Scaduti"', 'label="Contratti in scadenza"', 'label="Autocertificazioni mancanti"', 'label="Compensi erogati"', 'label="Contributi lavoratore"', 'label="Contributi club"', 'label="Oltre le soglie"']) {
    assert.ok(s.includes(label), `manca il numero ${label}`);
  }
  assert.match(s, /scadenze oltre il termine/);
  assert.match(s, /rapporti attivi/);
  assert.match(s, /Persone oltre i 5\.000 previdenziali \/ i 15\.000 fiscali/);
  // ogni conteggio porta alla pagina che lo risolve
  assert.match(s, /withClubId\("\/sport-work\/deadlines\?view=overdue", clubId\)/);
  assert.match(s, /withClubId\("\/sport-work\/relationships\?view=expiring", clubId\)/);
  assert.match(s, /withClubId\("\/sport-work\/obligations\?view=self-declaration", clubId\)/);
  assert.match(s, /Adempimenti prossimi/);
  assert.match(s, /Vedi tutti/);
  assert.match(s, /\.slice\(0, 8\)/);
  assert.match(s, /Non lo trasmette: al RASD, a UNILAV/);
  assert.match(s, /module="sport-work-dashboard"/);
  assert.equal(monthLabel("2026-09"), "settembre 2026");
});

/* ----------------------------------------------- /sport-work/relationships */

test("/sport-work/relationships: griglia, ricerca e filtro di stato della V1, nuovo rapporto solo per sport_work.manage", () => {
  const s = sources.relationships;
  assert.match(s, /"\/api\/v1\/sport-work\/relationships"/);
  assert.match(s, /"\/api\/v1\/sport-work\/people"/);
  assert.match(s, /module="sport-work-relationships"/);
  assert.match(s, /placeholder: "Cerca per nome o ruolo"/);
  assert.match(s, /Persona non trovata/);
  for (const column of ['id: "identity"', 'id: "status"', 'id: "role"', 'id: "type"', 'id: "start"', 'id: "end"', 'id: "amount"']) {
    assert.ok(s.includes(column), `manca la colonna ${column}`);
  }
  assert.match(s, /id: "status",\s*label: "Stato",\s*type: "multi",\s*pinned: true/);
  assert.match(s, /canManage \? \(\s*<Button variant="primary" icon=\{<Plus \/>\}[\s\S]*?>\s*Nuovo rapporto/);
  assert.equal((s.match(/variant="primary"/g) || []).length, 2, "il primario di pagina e quello dello stato vuoto");
  assert.match(s, /<RelationshipDrawer/);
  assert.match(s, /onCreated=\{\(id\) => router\.push\(relationshipHref\(id, clubId\)\)\}/);
  assert.match(s, /kinds: \["csv"\]/);
});

test("cassetto «Nuovo rapporto»: i due modi, i campi e le due scritture della V1", () => {
  const s = sources.relationshipDrawer;
  assert.match(s, /width="wide"/);
  assert.match(s, /Persona già censita/);
  assert.match(s, /Nuova persona/);
  assert.match(s, /"\/api\/v1\/sport-work\/people", \{ method: "POST", body: person \}/);
  assert.match(s, /"\/api\/v1\/sport-work\/relationships", \{ method: "POST", body: \{ \.\.\.form, personId \} \}/);
  assert.match(s, /Rapporto creato in bozza/);
  assert.match(s, /Creazione della persona non riuscita/);
  assert.match(s, /Creazione del rapporto non riuscita/);
  for (const field of ["sw-person", "sw-first", "sw-last", "sw-cf", "sw-email", "sw-coverage", "sw-role", "sw-type", "sw-start", "sw-end", "sw-amount", "sw-frequency", "sw-hours", "sw-notes"]) {
    assert.ok(s.includes(`\${idPrefix}-${field.slice(3)}`), `manca il campo ${field}`);
  }
  assert.match(s, /RELATIONSHIP_TYPE_HINTS\[form\.relationshipType\]/, "il tipo si sceglie con la sua conseguenza accanto");
  assert.match(s, /SOCIAL_COVERAGE_LABELS/);
  assert.match(s, /Decide l'aliquota\. La dichiara il lavoratore: EasyGame non la deduce dal ruolo\./);
  assert.match(s, /Oltre 24 ore la presunzione di autonomia non opera più/);
  assert.match(s, /Il rapporto nasce in bozza\. Si attiva dalla sua scheda, quando ci sono contratto e anagrafica\./);
  assert.match(s, /dirty=\{dirty\}/);
  assert.match(s, /<SearchableSelect/, "sopra otto persone la tendina si cerca");
  // le regole del client
  const person = emptyPersonDraft();
  const form = emptyRelationshipDraft();
  assert.equal(form.role, "COACH");
  assert.equal(form.relationshipType, "SPORT_COCOCO");
  assert.equal(form.compensationFrequency, "SEASONAL");
  assert.equal(person.socialCoverage, "NONE");
  assert.equal(person.originType, "trainer");
  assert.ok(validateRelationshipDraft("existing", person, form).some((e) => e.label === "La data di inizio del rapporto è obbligatoria"));
  assert.ok(validateRelationshipDraft("existing", person, form).some((e) => e.label === "Seleziona una persona o creane una nuova"));
  assert.ok(validateRelationshipDraft("new", person, { ...form, startDate: "2026-09-01" }).some((e) => e.field === "firstName"));
  assert.ok(validateRelationshipDraft("new", { ...person, firstName: "A", lastName: "B", fiscalCode: "XX" }, { ...form, startDate: "2026-09-01" }).some((e) => e.field === "fiscalCode"));
  assert.deepEqual(validateRelationshipDraft("existing", person, { ...form, personId: "p", startDate: "2026-09-01" }), []);
  assert.ok(validateRelationshipDraft("existing", person, { ...form, personId: "p", startDate: "2026-09-01", endDate: "2026-08-01" }).some((e) => e.field === "endDate"));
});

/* ------------------------------------------ /sport-work/relationships/[id] */

test("scheda del rapporto: intestazione, transizioni, blocchi di attivazione, quattro aree con deep link", () => {
  const s = sources.detail;
  assert.match(s, /\?view=detail`/);
  assert.match(s, /<RecordHeader/);
  assert.match(s, /<RecordAreaSwitcher/);
  assert.match(s, /<RecordAlertStrip/);
  assert.match(s, /useBreadcrumbLabel\(personName\)/);
  assert.match(s, /listRelationshipTransitions\(status\)/);
  assert.match(s, /TRANSITION_VERBS\[next\]/);
  assert.match(s, /overflow: next === "TERMINATED"/, "cessare e distruttivo: solo nel menu");
  assert.match(s, /hidden: !canManage/);
  assert.match(s, /\/status`, \{ method: "POST", body: \{ status, reason \} \}/);
  assert.match(s, /Rapporto \$\{RELATIONSHIP_STATUS_LABELS\[status\]\.toLowerCase\(\)\}/);
  assert.match(s, /Cambio di stato non riuscito/);
  assert.match(s, /Per attivare questo rapporto:/);
  assert.match(s, /Allega il contratto/);
  for (const area of ['value: "compensi"', 'value: "posizione"', 'value: "registro"', 'value: "documenti"']) assert.ok(s.includes(area), `manca l'area ${area}`);
  assert.match(s, /value === "documenti" \|\| value === "anagrafica"/, "i vecchi nomi restano link validi");
  assert.match(s, /query\.set\("tab", next\)/);
  for (const label of ['label="Programmato"', 'label="Maturato"', 'label="Erogato"', 'label="Maturato non erogato"']) assert.ok(s.includes(label), `manca ${label}`);
  assert.match(s, /Il debito della società verso questa persona/);
  assert.match(s, /<PlanSection/);
  assert.match(s, /<InstallmentsGrid/);
  assert.match(s, /<PositionSection/);
  assert.match(s, /<PayoutsGrid/);
  assert.match(s, /<DocumentsSection/);
  assert.match(s, /<PayoutDrawer/);
  assert.match(s, /<PlanDrawer/);
  // anagrafica in sola lettura, con lo stato RASD come parola
  for (const label of ['label: "Codice fiscale"', 'label: "Email"', 'label: "Telefono"', 'label: "Data di nascita"', 'label: "Partita IVA"', 'label: "IBAN"', 'label: "Importo pattuito"', 'label: "Ore settimanali"', 'label: "Stato RASD"']) {
    assert.ok(s.includes(label), `manca il campo ${label}`);
  }
  assert.match(s, /specOf\(RASD_STATUS_SPEC, relationship\.rasd_status\)/);
  // cessazione e storno chiedono il motivo in una conferma del sistema
  assert.equal((s.match(/<ReasonDialog/g) || []).length, 2);
  assert.match(s, /emptyError="La cessazione richiede un motivo"/);
  assert.match(s, /emptyError="Lo storno richiede un motivo"/);
  assert.match(s, /\/reverse`, \{ method: "POST", body: \{ reason \} \}/);
  assert.match(s, /Erogazione stornata/);
  assert.match(s, /Storno non riuscito/);
  assert.match(s, /Tutti i rapporti/);
  assert.match(sources.reason, /<ConfirmDialog/);
  assert.match(sources.reason, /required error=\{error\}/);
});

test("piano compensi: anteprima con il modulo del server, riepilogo per anno, rifare solo senza denaro", () => {
  const s = sources.planDrawer;
  assert.match(s, /generatePlanItems\(planFormToConfig\(form\)/);
  assert.match(s, /splitPlanByScheduledYear\(preview\.items\)/);
  assert.match(s, /planTotal\(preview\.items\)/);
  assert.match(s, /\/plan`, \{\s*method: "PUT",\s*body: \{ \.\.\.form, \.\.\.planFormToConfig\(form\) \}/);
  assert.match(s, /Piano compensi salvato/);
  assert.match(s, /Salvataggio del piano non riuscito/);
  assert.match(s, /COMPENSATION_PLAN_KINDS\.filter\(\(kind\) => kind !== "CUSTOM"\)/);
  for (const id of ["plan-kind", "plan-total", "plan-count", "plan-first", "plan-monthly", "plan-start", "plan-end", "plan-day"]) assert.ok(s.includes(`id="${id}"`), `manca ${id}`);
  assert.match(s, /Questo piano attraversa \$\{perYear\.length\} anni solari/);
  assert.match(s, /Le scadenze nascono programmate\. Maturano quando il loro periodo è trascorso/);
  assert.match(s, /disabled=\{preview\.items\.length === 0\}/);
  assert.match(sources.planSection, /paidSomething/);
  assert.match(sources.planSection, /canManage && !paidSomething \?/);
  assert.match(sources.planSection, /Rifai il piano/);
  assert.match(sources.planSection, /Crea il piano/);
  assert.match(sources.planSection, /Alcune scadenze hanno già ricevuto denaro: rifare il piano cancellerebbe righe collegate a movimenti del registro/);
  const form = emptyPlanForm();
  assert.equal(form.installmentCount, "10");
  assert.deepEqual(planFormToConfig({ ...form, totalAmount: "1200,50", installmentCount: "3", firstDueDate: "2026-10-31" }), {
    kind: "EQUAL_INSTALMENTS",
    totalAmount: 1200.5,
    installmentCount: 3,
    firstDueDate: "2026-10-31",
  });
  assert.deepEqual(planFormToConfig({ ...form, kind: "MONTHLY", monthlyAmount: "300", startMonth: "2026-09", endMonth: "2027-06", dueDayOfMonth: "" }), {
    kind: "MONTHLY",
    monthlyAmount: 300,
    startMonth: "2026-09",
    endMonth: "2027-06",
    dueDayOfMonth: null,
  });
});

test("erogazione: prima si propone, gli avvisi duri chiedono la spunta, la chiave nasce all'apertura", () => {
  const s = sources.payoutDrawer;
  assert.match(s, /"\/api\/v1\/sport-work\/payouts\/prepare"/);
  assert.match(s, /"\/api\/v1\/sport-work\/payouts", \{/);
  assert.match(s, /"\/api\/v1\/fiscal\/operation-types"/);
  assert.match(s, /voce\?\.directionHint !== "IN" && voce\?\.isActive !== false/);
  assert.match(s, /idempotencyKey\.current = newIdempotencyKey\(\)/);
  assert.match(s, /idempotencyKey: idempotencyKey\.current/);
  assert.match(s, /acknowledgeWarnings: hardWarnings\.length > 0 \? acknowledged : true/);
  assert.match(s, /allowOverpayment/);
  assert.match(s, /operationTypeCode: operationTypeCode \|\| undefined/);
  assert.match(s, /const blocked = hardWarnings\.length > 0 && !acknowledged/);
  assert.match(s, /disabled=\{!proposal \|\| blocked\}/);
  for (const id of ["payout-amount", "payout-date", "payout-method", "payout-reference", "payout-causale", "payout-notes"]) assert.ok(s.includes(`id="${id}"`), `manca ${id}`);
  assert.match(s, /onBlur=\{\(\) => void loadProposal\(\)\}/, "l'importo ricalcola al blur, non a ogni battitura");
  assert.match(s, /L'anno di questa data decide le regole applicate, non la stagione\./);
  assert.match(s, /Compenso sportivo \(predefinita\)/);
  assert.match(s, /Come nasce questo numero/);
  assert.match(s, /Regole \{proposal\.computation\.rulesVersion\}/);
  assert.match(s, /Costo per il club/);
  assert.match(s, /Trattamento fiscale da verificare: la ritenuta non è compresa in questo importo\./);
  assert.match(s, /Ho letto gli avvisi e procedo comunque\. Questa scelta viene registrata con il mio nome e la data\./);
  assert.match(s, /Consenti di erogare più del residuo della scadenza\./);
  assert.match(s, /Erogazione registrata/);
  assert.match(s, /Questa erogazione era già stata registrata: nessun doppio pagamento/);
  assert.match(s, /Erogazione non registrata/);
  assert.match(s, /Calcolo della proposta non riuscito/);
  assert.match(s, /formatPercent\(\(line\.amount \?\? 0\) \* 100, 2\)/, "le aliquote arrivano come frazione");
});

test("posizione e autocertificazione: le righe della V1, l'anno di regole, lo scostamento, lo storico", () => {
  const p = sources.position;
  assert.match(p, /\/position\?year=\$\{year\}`/);
  assert.match(p, /CONFIGURED_RULE_YEARS/);
  for (const label of ["Compensi erogati dal club", "Compensi esterni dichiarati", "Progressivo", "Soglia previdenziale", "Imponibile previdenziale", "Contributi a carico del lavoratore", "Contributi a carico del club", "Soglia fiscale", "Imponibile fiscale eccedente"]) {
    assert.ok(p.includes(`label: "${label}"`), `manca la riga ${label}`);
  }
  assert.match(p, /Nessuna autocertificazione per il \$\{position\.year\}/);
  assert.match(p, /Le soglie sono del lavoratore, non del committente/);
  assert.match(p, /I contributi calcolati non coincidono con quelli che si calcolerebbero oggi/);
  assert.match(p, /La differenza va portata al consulente\./);
  assert.match(p, /Dichiarazione ricevuta dopo alcune erogazioni/);
  assert.match(p, /Trattamento fiscale da verificare: EasyGame non calcola la ritenuta/);
  assert.match(p, /canManage \? \(\s*<Button[\s\S]*?>\s*Autocertificazione/);
  assert.match(p, /Errore nella lettura della posizione/);
  const d = sources.declaration;
  assert.match(d, /"\/api\/v1\/sport-work\/declarations", \{/);
  assert.match(d, /\/api\/v1\/sport-work\/declarations\?person_id=/);
  assert.match(d, /body: \{ personId, fiscalYear: year, externalAmount: amount, declarationDate, hasOtherCoverage, notes \}/);
  assert.match(d, /Indica l'importo dichiarato: zero è una dichiarazione, il campo vuoto no/);
  assert.match(d, /Il lavoratore dichiara di avere altra copertura previdenziale\./);
  assert.match(d, /Autocertificazione registrata/);
  assert.match(d, /Dichiarazioni già acquisite/);
  assert.match(d, /specOf\(DECLARATION_STATUS_SPEC, row\.status\)/);
  for (const id of ["decl-year", "decl-date", "decl-amount", "decl-notes"]) assert.ok(d.includes(`id="${id}"`), `manca ${id}`);
});

test("documenti: Attachment Core con due proprietari, il contratto sblocca l'attivazione, eliminazione con conferma", () => {
  const s = sources.documents;
  assert.match(s, /listAttachmentsFor\(SPORT_WORK_ATTACHMENT_OWNERS\.relationship, relationshipId\)/);
  assert.match(s, /listAttachmentsFor\(SPORT_WORK_ATTACHMENT_OWNERS\.person, personId\)/);
  assert.match(s, /uploadAttachment\(\{/);
  assert.match(s, /body: \{ contractAttachmentId: result\.attachment\.id, signatureState: "SIGNED" \}/);
  assert.match(s, /Documento caricato, ma il collegamento al rapporto non è riuscito/);
  assert.match(s, /deleteAttachmentById\(doc\.id\)/);
  assert.match(s, /tone: "danger"/, "eliminare un documento chiede conferma: la V1 non lo faceva");
  assert.match(s, /accept=\{ATTACHMENT_ACCEPT_ATTRIBUTE\}/);
  assert.match(s, /buildAttachmentUrl\(doc\.id, \{ download: doc\.fileName \}\)/);
  assert.match(s, /Documenti del rapporto/);
  assert.match(s, /Documenti della persona/);
  assert.match(s, /Allegando il contratto il rapporto lo registra come proprio e passa a «firmato»/);
  assert.match(s, /aria-label=\{`Elimina \$\{doc\.fileName\}`\}/);
  assert.match(s, /canManage \?/);
});

/* ------------------------------------------- /sport-work/compensations */

test("/sport-work/compensations: cinque aree con deep link, le scritture per riga e i tre cassetti", () => {
  const s = sources.compensations;
  for (const endpoint of ["/api/v1/sport-work/installments", "/api/v1/sport-work/payouts", "/api/v1/sport-work/bonuses", "/api/v1/sport-work/reimbursements", "/api/v1/sport-work/vat-invoices", "/api/v1/sport-work/people", "/api/v1/sport-work/relationships"]) {
    assert.ok(s.includes(`"${endpoint}"`), `manca la lettura ${endpoint}`);
  }
  for (const tab of ['value: "scadenze"', 'value: "registro"', 'value: "premi"', 'value: "rimborsi"', 'value: "fatture"']) assert.ok(s.includes(tab), `manca l'area ${tab}`);
  assert.match(s, /query\.set\("tab", next\)/);
  assert.match(s, /\/bonuses\/\$\{encodeURIComponent\(row\.id\)\}\/pay`, \{\}, "Premio erogato"/);
  assert.match(s, /\{ status: "SUBMITTED" \}, "Rimborso presentato", "PATCH"/);
  assert.match(s, /\{ status: "APPROVED" \}, "Rimborso approvato", "PATCH"/);
  assert.match(s, /\/reimbursements\/\$\{encodeURIComponent\(row\.id\)\}\/pay`, \{\}, "Rimborso liquidato"/);
  assert.match(s, /\/vat-invoices\/\$\{encodeURIComponent\(row\.id\)\}\/pay`, \{\}, "Fattura pagata"/);
  assert.match(s, /hidden: \(row\) => !canPay \|\| row\.status === "PAID"/);
  assert.match(s, /hidden: \(row\) => !canManage \|\| row\.status !== "DRAFT"/);
  assert.match(s, /hidden: \(row\) => !canManage \|\| row\.status !== "SUBMITTED"/);
  assert.match(s, /hidden: \(row\) => !canPay \|\| row\.status !== "APPROVED"/);
  assert.match(s, /relationship_type === "SELF_EMPLOYED_VAT"/);
  assert.match(s, /tab === "fatture" && canManage && vatRelationships\.length > 0/);
  assert.match(s, /Nessun rapporto con partita IVA/);
  for (const label of ["Nuovo premio", "Nuovo rimborso", "Nuova fattura", "Eroga", "Presenta", "Approva", "Liquida", "Paga"]) assert.ok(s.includes(`"${label}"`) || s.includes(`>${label}<`) || s.includes(`${label}\n`), `manca il verbo ${label}`);
  assert.match(s, /useConfirm\(\)/, "le uscite di denaro chiedono conferma");
  for (const drawer of ["<PayoutDrawer", "<BonusDrawer", "<ExpenseDrawer", "<InvoiceDrawer"]) assert.ok(s.includes(drawer), `manca ${drawer}`);
  assert.match(s, /Programmato, maturato ed erogato sono tre numeri diversi/);
  assert.match(s, /La fonte canonica del denaro uscito\. Movimenti lo aggrega, non lo duplica\./);
  assert.match(s, /Operazione non riuscita/);
});

test("griglie condivise: scadenze con tre grandezze e residuo; registro append-only con storno", () => {
  const i = sources.installments;
  for (const column of ['id: "label"', 'id: "due"', 'id: "status"', 'id: "gross"', 'id: "accrued"', 'id: "paid"', 'id: "remaining"']) assert.ok(i.includes(column), `manca ${column}`);
  assert.match(i, /Number\(row\.remaining_amount\) > 0 && !row\.cancelled/, "Eroga solo con residuo e non annullata");
  assert.match(i, /hidden: \(row\) => !canPay \|\| !installmentIsPayable\(row\)/);
  const p = sources.payouts;
  for (const column of ['id: "type"', 'id: "paidAt"', 'id: "status"', 'id: "gross"', 'id: "employee"', 'id: "employer"', 'id: "fiscal"']) assert.ok(p.includes(column), `manca ${column}`);
  assert.match(p, /!row\.reversed_at && row\.transaction_type === "COMPENSATION_PAYMENT"/, "si storna solo un compenso non ancora stornato");
  assert.match(p, /FISCAL_TO_VERIFY_SPEC/);
  assert.match(p, /regole \$\{row\.rules_version\}/);
  assert.match(p, /anno fiscale \$\{row\.fiscal_year\}/);
});

test("cassetti premio, rimborso, fattura: i campi e le regole", () => {
  const b = sources.bonus;
  for (const id of ["bonus-person", "bonus-reason", "bonus-competition", "bonus-amount", "bonus-date", "bonus-treatment"]) assert.ok(b.includes(`id="${id}"`), `manca ${id}`);
  assert.match(b, /"\/api\/v1\/sport-work\/bonuses", \{ method: "POST", body: draft \}/);
  assert.match(b, /Premio registrato/);
  assert.match(b, /Premio playoff/);
  assert.equal(emptyBonusDraft().fiscalTreatment, "TO_VERIFY");
  assert.ok(validateBonusDraft(emptyBonusDraft()).some((e) => e.field === "personId"));
  assert.deepEqual(validateBonusDraft({ ...emptyBonusDraft(), personId: "p", reason: "Playoff", amount: "100" }), []);
  const e = sources.expense;
  for (const id of ["exp-person", "exp-category", "exp-amount", "exp-description", "exp-date"]) assert.ok(e.includes(`id="${id}"`), `manca ${id}`);
  assert.match(e, /"\/api\/v1\/sport-work\/reimbursements", \{ method: "POST", body: draft \}/);
  assert.match(e, /Rimborso registrato/);
  assert.match(e, /Trasferta Bologna/);
  assert.equal(emptyExpenseDraft().category, "TRAVEL");
  assert.deepEqual(validateExpenseDraft({ ...emptyExpenseDraft(), personId: "p", description: "Trasferta", amount: "42" }), []);
  const v = sources.invoice;
  for (const id of ["inv-relationship", "inv-number", "inv-date", "inv-taxable", "inv-vat", "inv-withholding", "inv-total", "inv-due"]) assert.ok(v.includes(`id="${id}"`), `manca ${id}`);
  assert.match(v, /"\/api\/v1\/sport-work\/vat-invoices", \{ method: "POST", body: draft \}/);
  assert.match(v, /Fattura registrata/);
  assert.match(v, /Trascrivi gli importi dal documento: EasyGame non li ricalcola\./);
  assert.ok(validateInvoiceDraft(emptyInvoiceDraft()).some((e2) => e2.field === "relationshipId"));
  assert.deepEqual(validateInvoiceDraft({ ...emptyInvoiceDraft(), relationshipId: "r", documentNumber: "12", totalAmount: "1000" }), []);
});

/* ----------------------------------------------- /sport-work/deadlines */

test("/sport-work/deadlines: compensi e adempimenti insieme, tre cassetti piu il quarto che la V1 taceva", () => {
  const s = sources.deadlines;
  assert.match(s, /"\/api\/v1\/sport-work\/installments"/);
  assert.match(s, /"\/api\/v1\/sport-work\/obligations\?status=DUE"/);
  assert.match(s, /"\/api\/v1\/sport-work\/people"/);
  assert.match(s, /"\/api\/v1\/sport-work\/relationships"/);
  assert.match(s, /buildDeadlineEntries\(/);
  assert.match(s, /groupBy=\{groupBy\}/);
  assert.match(s, /defaultGrouped/);
  for (const label of ['label="In ritardo"', 'label="Entro sette giorni"', 'label="Entro trenta giorni"']) assert.ok(s.includes(label), `manca il numero ${label}`);
  assert.match(s, /hidden: \(row\) => !canPay \|\| !row\.payable \|\| !row\.installmentId/);
  assert.match(s, /<PayoutDrawer/);
  assert.match(s, /id: "month", label: "Entro trenta giorni", filters: \{ bucket: \["overdue", "week", "month"\] \}, builtIn: true, isDefault: true/);
  assert.match(s, /id: "overdue", label: "In ritardo"/);
  // il modello puro
  const today = new Date(2026, 8, 15);
  assert.equal(deadlineBucketOf("2026-09-10", today), "overdue");
  assert.equal(deadlineBucketOf("2026-09-15", today), "week");
  assert.equal(deadlineBucketOf("2026-09-22", today), "week");
  assert.equal(deadlineBucketOf("2026-09-23", today), "month");
  assert.equal(deadlineBucketOf("2026-10-15", today), "month");
  assert.equal(deadlineBucketOf("2026-10-16", today), "later");
  assert.equal(dueLabel("2026-09-12", today), "scaduta da 3 giorni");
  assert.equal(dueLabel("2026-09-14", today), "scaduta da 1 giorno");
  assert.equal(dueLabel("2026-09-15", today), "scade oggi");
  assert.equal(dueLabel("2026-09-16", today), "scade domani");
  assert.equal(dueLabel("2026-09-25", today), "fra 10 giorni");
  const entries = buildDeadlineEntries(
    {
      installments: [
        { id: "i1", relationship_id: "r1", label: "Rata 1", due_date: "2026-09-10", gross_amount: 100, accrued_amount: 100, paid_amount: 40, remaining_amount: 60, status: "PARTIALLY_PAID", cancelled: false },
        { id: "i2", relationship_id: "r1", label: "Rata 2", due_date: "2026-09-10", gross_amount: 100, accrued_amount: 0, paid_amount: 0, remaining_amount: 100, status: "SCHEDULED", cancelled: true },
        { id: "i3", relationship_id: "r1", label: "Rata 3", due_date: "2026-12-10", gross_amount: 100, accrued_amount: 0, paid_amount: 100, remaining_amount: 0, status: "PAID", cancelled: false },
      ],
      obligations: [{ id: "o1", kind: "F24", title: "F24 settembre", due_date: "2026-10-14", status: "DUE", amount: null }],
      people: [{ id: "p1", full_name: "Marco Ferretti" }],
      relationships: [{ id: "r1", person_id: "p1", role: "COACH", relationship_type: "SPORT_COCOCO", status: "ACTIVE", start_date: null, end_date: null, contract_amount: null }],
    },
    today,
  );
  assert.deepEqual(
    entries.map((e) => [e.id, e.title, e.bucket, e.amount, e.payable]),
    [
      ["installment-i1", "Marco Ferretti", "overdue", 60, true],
      ["obligation-o1", "F24 settembre", "month", null, false],
    ],
    "solo le rate con residuo e non annullate; gli adempimenti senza importo",
  );
  assert.equal(entries[0].subtitle, "Rata 1 · residuo 60,00 €");
});

/* --------------------------------------------- /sport-work/obligations */

test("/sport-work/obligations: agenda, F24, CU, storico; assolto con conferma; dataset solo con sport_work.fiscal", () => {
  const s = sources.obligations;
  assert.match(s, /"\/api\/v1\/sport-work\/obligations"/);
  assert.match(s, /\/api\/v1\/sport-work\/datasets\?kind=f24&year=\$\{year\}/);
  assert.match(s, /\/api\/v1\/sport-work\/datasets\?kind=cu&year=\$\{year\}/);
  assert.match(s, /"\/api\/v1\/sport-work\/obligations\/sync", \{ method: "POST" \}/);
  assert.match(s, /\/complete`, \{ method: "POST", body: \{\} \}/);
  for (const tab of ['value: "agenda"', 'value: "f24"', 'value: "cu"', 'value: "storico"']) assert.ok(s.includes(tab), `manca l'area ${tab}`);
  assert.match(s, /row\.status === "DUE"/);
  assert.match(s, /row\.status !== "DUE"/);
  assert.match(s, /Agenda riallineata: \$\{data\?\.created \?\? 0\} nuovi, \$\{data\?\.updated \?\? 0\} aggiornati, \$\{data\?\.closed \?\? 0\} non più dovuti\./);
  assert.match(s, /Adempimento marcato come assolto/);
  assert.match(s, /hidden: \(\) => !canManage/);
  assert.match(s, /tab === "agenda" && canManage \?/);
  assert.match(s, /const datasetState = !canFiscal \? "restricted" : gridState/, "senza il permesso fiscale la griglia dice che non si vede");
  assert.match(s, /Non trasmette niente\./);
  assert.match(s, /«Assolto» significa che una persona lo ha fatto/);
  assert.match(s, /un adempimento assolto non si riapre/);
  for (const header of ['header: "Periodo"', 'header: "Causale"', 'header: "Lavoratore"', 'header: "Club"', 'header: "Totale"', 'header: "Versamento entro"']) assert.ok(s.includes(header), `manca la colonna F24 ${header}`);
  for (const header of ['header: "Persona"', 'header: "Codice fiscale"', 'header: "Lordo"', 'header: "Esterni"', 'header: "Progressivo"', 'header: "Imponibile fiscale"', 'header: "Nota"']) assert.ok(s.includes(header), `manca la colonna CU ${header}`);
  assert.match(s, /`f24-\$\{year\}\.csv`/);
  assert.match(s, /`cu-\$\{year\}\.csv`/);
  assert.match(s, /Nessun contributo maturato nel \$\{year\}/);
  assert.match(s, /Nessun compenso erogato nel \$\{year\}/);
  assert.match(s, /paymentReversed \? "versamento stornato"/, "la marcatura dei versamenti stornati, che la V1 riceveva e non mostrava");
  assert.match(s, /id: "self-declaration"/);
});

/* --------------------------------------------------------------- stati */

test("stati: ogni valore del dominio ha una parola; le parole del sistema si riusano, le altre sono spec locali", () => {
  for (const status of RELATIONSHIP_STATUSES) assert.ok(RELATIONSHIP_STATUS_SPEC[status].label, status);
  for (const status of INSTALLMENT_STATUSES) assert.ok(INSTALLMENT_STATUS_SPEC[status].label, status);
  for (const status of OBLIGATION_STATUSES) assert.ok(OBLIGATION_STATUS_SPEC[status].label, status);
  for (const status of REIMBURSEMENT_STATUSES) assert.ok(REIMBURSEMENT_STATUS_SPEC[status].label, status);
  for (const status of RASD_STATUSES) assert.ok(RASD_STATUS_SPEC[status].label, status);
  assert.equal(RELATIONSHIP_STATUS_SPEC.ACTIVE, PERSON_STATUS.active);
  assert.equal(RELATIONSHIP_STATUS_SPEC.DRAFT, PERSON_STATUS.draft);
  assert.equal(RELATIONSHIP_STATUS_SPEC.SUSPENDED, PERSON_STATUS.suspended);
  assert.equal(INSTALLMENT_STATUS_SPEC.PAID, MONEY_STATUS.paid_out, "un compenso pagato non e un incasso");
  assert.equal(INSTALLMENT_STATUS_SPEC.OVERDUE, MONEY_STATUS.overdue);
  assert.equal(INSTALLMENT_STATUS_SPEC.CANCELLED, MONEY_STATUS.cancelled);
  assert.equal(INSTALLMENT_STATUS_SPEC.PARTIALLY_PAID, MONEY_STATUS.partial);
  assert.equal(BONUS_STATUS_SPEC.PAID, MONEY_STATUS.paid_out);
  assert.equal(VAT_INVOICE_STATUS_SPEC.PAID, MONEY_STATUS.paid_out);
  assert.equal(VAT_INVOICE_STATUS_SPEC.PENDING, MONEY_STATUS.pending);
  assert.deepEqual(RELATIONSHIP_STATUS_SPEC.TERMINATED, { label: "CESSATO", weight: "quiet", hue: "neutral" });
  assert.deepEqual(INSTALLMENT_STATUS_SPEC.ACCRUED, { label: "MATURATA", weight: "solid", hue: "blue" });
  assert.deepEqual(OBLIGATION_STATUS_SPEC.DUE, { label: "DOVUTO", weight: "solid", hue: "amber" });
  assert.deepEqual(OBLIGATION_STATUS_SPEC.COMPLETED, { label: "ASSOLTO", weight: "solid", hue: "green" });
  assert.deepEqual(DECLARATION_STATUS_SPEC.SUPERSEDED, { label: "SOSTITUITA", weight: "quiet", hue: "neutral" });
  assert.equal(specOf(RELATIONSHIP_STATUS_SPEC, "nonsense"), STATUS_UNKNOWN);
  assert.equal(specOf(RELATIONSHIP_STATUS_SPEC, "active"), PERSON_STATUS.active);
  // nessun colore di stato riscritto nei componenti: le pillole vengono dalle spec
  assert.doesNotMatch(everything, /border-emerald-|bg-amber-50|text-rose-600|bg-slate-100/);
});

/* -------------------------------------------------------------- V1 tolta */

test("la V1 delle sei rotte non esiste piu; i componenti condivisi con le schede persona restano", () => {
  for (const gone of ["SportWorkShell", "SportWorkDashboardPanel", "RelationshipsPanel", "RelationshipDetail", "CompensationPlanEditor", "PayoutDialog", "SportWorkDocumentsPanel", "CompensationsPanel", "DeadlinesPanel", "ObligationsPanel"]) {
    assert.equal(existsSync(path.join(process.cwd(), "src/components/sport-work", `${gone}.tsx`)), false, `${gone}.tsx doveva sparire`);
  }
  for (const kept of ["PersonCompensationTab", "PersonPositionCard", "DeclarationDialog", "SportWorkStat"]) {
    assert.ok(existsSync(path.join(process.cwd(), "src/components/sport-work", `${kept}.tsx`)), `${kept}.tsx serve alle schede persona`);
  }
  assert.match(read("src/components/sport-work/PersonCompensationTab.tsx"), /from "\.\/SportWorkStat"/);
});
