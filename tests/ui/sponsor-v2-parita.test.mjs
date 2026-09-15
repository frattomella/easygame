import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  canReverseCollection,
  collectionDescription,
  collectionStatusSpec,
  computeSponsorAlerts,
  contractLifecycle,
  contractStatusSpec,
  creditStatusSpec,
  emptySponsorDraft,
  matchesSponsorSearch,
  resolveSponsorArea,
  sponsorDraftFrom,
  sponsorPayload,
  sumCollectionsInPeriodCents,
  validateSponsorDraft,
} from "@/components/sponsors/v2/sponsor-model";
import { MONEY_STATUS } from "@/lib/web/status";

/**
 * Parita delle pagine `/sponsors` e `/sponsors/[id]` V2 con l'audit V1
 * (`docs/redesign/audit/wave-d-sponsor.md`).
 *
 * Il redesign cambia forma, non capacita: ogni campo, etichetta, toast,
 * endpoint e funzione di `simplified-db` che l'audit elenca deve restare nel
 * sorgente V2. Un test statico non prova che funzioni — lo fa il lead a
 * schermo — ma impedisce che una capacita sparisca per distrazione. La regola
 * di dominio piu facile da perdere e una sola: **un incasso non si cancella,
 * si storna**, e le tre cifre dovuto / incassato / residuo non si sommano.
 */
const read = (relative) => readFileSync(path.join(process.cwd(), relative), "utf8");
const V2 = "src/components/sponsors/v2";
const sources = {
  list: read("src/app/sponsors/page.tsx"),
  record: read("src/app/sponsors/[id]/page.tsx"),
  drawer: read(`${V2}/sponsor-drawer.tsx`),
  contract: read(`${V2}/contract-drawer.tsx`),
  collection: read(`${V2}/collection-drawer.tsx`),
  storno: read(`${V2}/storno-incasso-dialog.tsx`),
  grid: read(`${V2}/collections-grid.tsx`),
  del: read(`${V2}/delete-sponsor-dialog.tsx`),
  document: read(`${V2}/document-drawer.tsx`),
  model: read(`${V2}/sponsor-model.ts`),
  clubId: read("src/components/web/hooks/use-route-club-id.ts"),
};
const everything = Object.values(sources).join("\n");
const code = everything.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ------------------------------------------------------------ l'elenco */

test("/sponsors: intestazione di pagina con un solo gradiente, i numeri e il registro degli incassi", () => {
  assert.match(sources.list, /<PageHeader/);
  assert.match(sources.list, /eyebrow="Cassa e amministrazione"/);
  assert.match(sources.list, /title="Sponsor e fornitori"/);
  assert.match(sources.list, /Nuovo sponsor/);
  assert.equal((sources.list.match(/variant="primary"/g) || []).length, 3, "il primario di pagina, quello dello stato vuoto e «Vai alla Dashboard»: nessun altro gradiente");
  for (const stat of ['label="sponsor attivi"', 'label="contratti in scadenza"', 'label="scaduti"', "label={`incassato ${season.label}`}"]) {
    assert.ok(sources.list.includes(stat), `manca il numero di intestazione ${stat}`);
  }
  // le tre schede V1: Sponsor e Fornitori sono il filtro Tipologia, Pagamenti e il segmento Incassi
  assert.match(sources.list, /id: "kind",\s*label: "Tipologia",\s*type: "select",\s*pinned: true/);
  assert.match(sources.list, /\{ value: "sponsor", label: "Sponsor" \}/);
  assert.match(sources.list, /\{ value: "fornitore", label: "Fornitori" \}/);
  assert.match(sources.list, /<SegmentedControl<ListTab>/);
  assert.match(sources.list, /\{ value: "incassi", label: "Incassi" \}/);
  assert.match(sources.list, /searchParams\?\.get\("tab"\) === "incassi"/, "il registro e raggiungibile con ?tab=incassi");
});

test("/sponsors: la griglia porta identita con logo, tipologia, contratto, scadenza, incassato, residuo e credito", () => {
  assert.match(sources.list, /module="sponsor"/);
  for (const column of ['id: "identity"', 'id: "kind"', 'id: "contractAmount"', 'id: "contractEnd"', 'id: "collected"', 'id: "outstanding"', 'id: "credit"', 'id: "contacts"']) {
    assert.ok(sources.list.includes(column), `manca la colonna ${column}`);
  }
  for (const hidden of ['id: "vatNumber"', 'id: "fiscalCode"', 'id: "city"', 'id: "pec"']) {
    assert.ok(sources.list.includes(hidden), `manca la colonna nascosta ${hidden}`);
  }
  assert.match(sources.list, /avatarSrc=\{row\.record\.logo \|\| null\}/, "il logo dell'elenco V1 resta sulla cella d'identita");
  assert.match(sources.list, /Nessun contratto/, "il residuo senza contratto lo dice, come nella V1");
  assert.match(sources.list, /Non disponibile/, "il residuo non letto lo dichiara, invece di ricadere su un calcolo locale");
  assert.match(sources.list, /formatDaysLabel\(row\.lifecycle\.days\)/, "IN SCADENZA porta i giorni");
  assert.match(sources.list, /search=\{search\}/);
  assert.match(sources.list, /matchesSponsorSearch\(row\.record, query\)/);
  assert.match(sources.list, /defaultSort=\{\{ columnId: "identity", direction: "asc" \}\}/);
});

test("/sponsors: viste Attivi · Contratti in scadenza (ambra) · Scaduti (rosso), filtri contratto e credito", () => {
  assert.match(sources.list, /id: "active", label: "Attivi", filters: \{ contract: "active" \}, builtIn: true/);
  assert.match(sources.list, /id: "expiring", label: "Contratti in scadenza", filters: \{ contract: "expiring" \}, builtIn: true, tone: "amber"/);
  assert.match(sources.list, /id: "expired", label: "Scaduti", filters: \{ contract: "expired" \}, builtIn: true, tone: "red"/);
  assert.match(sources.list, /id: "contract",\s*label: "Contratto"/);
  assert.match(sources.list, /id: "credit",\s*label: "Credito"/);
  assert.match(sources.list, /requestedViewId=\{requestedViewId\}/, "i contatori dell'intestazione attivano la vista");
});

test("/sponsors: azioni di riga Apri · Modifica · Registra incasso · Elimina, con i modali del sistema", () => {
  assert.match(sources.list, /label: "Apri", icon: <ChevronRight \/>, primary: true/);
  assert.match(sources.list, /label: "Modifica", icon: <Pencil \/>/);
  assert.match(sources.list, /label: "Registra incasso", icon: <Euro \/>/);
  assert.match(sources.list, /label: "Elimina", icon: <Trash2 \/>, tone: "danger"/);
  assert.match(sources.list, /<SponsorDrawer/);
  assert.match(sources.list, /<CollectionDrawer/);
  assert.match(sources.list, /<DeleteSponsorDialog/);
  assert.match(sources.list, /<StornoIncassoDialog/);
  assert.doesNotMatch(code, /window\.confirm|[^.\w]confirm\(|window\.prompt/, "nessuna conferma nativa");
  assert.doesNotMatch(code, /bg-gradient-to-r from-blue-600|bg-clip-text|animate-spin/, "niente titoli in gradiente ne spinner");
});

test("/sponsors: stesse letture e scritture della V1, nessun fetch diretto", () => {
  assert.match(sources.list, /supabase\.from\("clubs"\)\.select\("sponsors, settings"\)\.eq\("id", clubId\)\.maybeSingle\(\)/);
  assert.match(sources.list, /fetchSponsorsWithCredit\(\{ clubId \}\)/);
  assert.match(sources.list, /riga\.collections\.map/, "gli incassi arrivano con il residuo che spiegano");
  assert.match(sources.list, /addClubData\(clubId, "sponsors", \{ \.\.\.sponsorPayload\(draft\), id: newSponsorId\(\), created_at: now, updated_at: now \}\)/);
  assert.match(sources.list, /updateClubDataItem\(clubId, "sponsors", editing\.id, sponsorPayload\(draft\)\)/);
  assert.match(sources.list, /deleteClubDataItem\(clubId, "sponsors", deleting\.id\)/);
  assert.match(sources.list, /recordSponsorCollection\(\{/);
  assert.doesNotMatch(code, /[^a-zA-Z]fetch\(/, "tutto passa da apiRequest, simplified-db e @/lib/sponsors/client");
  assert.doesNotMatch(everything, /"sponsor_payments"/, "la vecchia collezione JSON non si legge e non si scrive");
  assert.match(sources.model, /`sponsor-\$\{Date\.now\(\)\}-\$\{Math\.random\(\)\.toString\(36\)\.slice\(2, 11\)\}`/, "stesso identificativo della V1");
});

test("/sponsors: i toast della V1 restano parola per parola", () => {
  for (const toast of [
    "Errore nel caricamento dei dati",
    "Sponsor aggiornato con successo",
    "Sponsor aggiunto con successo",
    "Errore nel salvare lo sponsor",
    "Sponsor eliminato con successo",
    "Errore nell'eliminare lo sponsor",
    "Pagamento registrato con successo",
    "Errore nel salvare il pagamento",
    "Nessun club selezionato. Vai alla dashboard per selezionare un club.",
    "Incasso stornato: resta visibile nello storico",
  ]) {
    assert.ok(sources.list.includes(toast), `manca il toast «${toast}»`);
  }
  assert.match(sources.list, /title="Nessun club selezionato"/);
  assert.match(sources.list, /Per gestire sponsor e fornitori, devi prima selezionare un club\./);
  assert.match(sources.list, /Vai alla Dashboard/);
  assert.match(sources.drawer, /Compila tutti i campi obbligatori/);
  assert.match(sources.collection, /Compila tutti i campi obbligatori/);
});

/* --------------------------------------------------------------- il modulo */

test("il cassetto dello sponsor porta tutti i campi delle due pagine V1, in quattro sezioni", () => {
  for (const field of [
    "sponsor-name",
    "sponsor-type",
    "sponsor-pa",
    "sponsor-email",
    "sponsor-pec",
    "sponsor-phone",
    "sponsor-phone-secondary",
    "sponsor-vat",
    "sponsor-fiscal-code",
    "sponsor-sdi",
    "sponsor-iban",
    "sponsor-address",
    "sponsor-street-number",
    "sponsor-city",
    "sponsor-province",
    "sponsor-postal-code",
    "sponsor-region",
    "sponsor-country",
  ]) {
    assert.ok(sources.drawer.includes(`\${idPrefix}-${field.replace("sponsor-", "")}`), `manca il campo ${field}`);
  }
  assert.match(sources.drawer, /<LogoUpload/, "il logo, che la V1 nascondeva in un div.hidden, e raggiungibile");
  assert.match(sources.drawer, /width=\{section \? "default" : "wide"\}/, "720 per il modulo intero, 480 per una sezione");
  assert.match(sources.drawer, /dirty=\{dirty\}/);
  assert.match(sources.drawer, /Crea partner/);
  assert.match(sources.drawer, /Salva modifiche/);
  for (const placeholder of ["Es. Partner Italia SRL", "amministrazione@azienda.it", "+39 333 1234567", "IT01234567890", "RSSMRA80A01H501U", "partner@pec.it", "ABC1234", "IT60X0542811101000000123456", "Milano", "Lombardia"]) {
    assert.ok(sources.drawer.includes(placeholder), `manca il segnaposto «${placeholder}»`);
  }
});

test("la validazione e quella della V1: nome, email e partita IVA, solo per la sezione mostrata", () => {
  const draft = emptySponsorDraft();
  assert.deepEqual(
    validateSponsorDraft(draft).map((e) => e.field),
    ["name", "email", "vatNumber"],
  );
  assert.deepEqual(validateSponsorDraft(draft, ["address"]), []);
  assert.deepEqual(validateSponsorDraft({ ...draft, name: "ACME" }, ["identity"]), []);
  assert.equal(emptySponsorDraft().country, "Italia");
  assert.equal(emptySponsorDraft("fornitore").type, "fornitore");
});

test("sponsor e fornitore restano lo stesso record con `type`, e i flag della scheda V1 non divergono piu", () => {
  const record = { id: "s1", name: "ACME", type: "fornitore", isPublicAdministration: true, phoneSecondary: "02", streetNumber: "10", logo: "data:x" };
  const draft = sponsorDraftFrom(record);
  assert.equal(draft.type, "fornitore");
  assert.equal(draft.isPublicAdministration, true);
  assert.equal(draft.phoneSecondary, "02");
  assert.equal(draft.streetNumber, "10");
  assert.equal(draft.logo, "data:x");
  const payload = sponsorPayload({ ...draft, type: "sponsor" });
  assert.equal(payload.isSponsor, true);
  assert.equal(payload.isSupplier, false);
  // un record vecchio con il solo flag della scheda
  assert.equal(sponsorDraftFrom({ id: "s2", isSupplier: true }).type, "fornitore");
  assert.equal(sponsorDraftFrom({ id: "s3", isSupplier: true, isSponsor: true }).type, "sponsor");
  // la ricerca V1: nome, email, P.IVA
  assert.ok(matchesSponsorSearch({ id: "s", name: "Partner Italia", email: "a@b.it", vatNumber: "IT123" }, "it123"));
  assert.ok(matchesSponsorSearch({ id: "s", name: "Partner Italia" }, "partner"));
  assert.ok(!matchesSponsorSearch({ id: "s", name: "Partner Italia" }, "acme"));
});

/* --------------------------------------------------------------- il credito */

test("lo stato del contratto e una parola del sistema: NON REGISTRATO · ATTIVO · IN SCADENZA · SCADUTO", () => {
  const today = new Date(2026, 8, 15);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const inDays = (n) => iso(new Date(2026, 8, 15 + n));
  assert.equal(contractStatusSpec(contractLifecycle(null, today)).label, "NON REGISTRATO");
  assert.equal(contractStatusSpec(contractLifecycle({ agreedAmountCents: 100, startDate: null, endDate: null, documentReference: "", notes: "" }, today)).label, "ATTIVO");
  assert.equal(contractLifecycle({ agreedAmountCents: 100, startDate: null, endDate: inDays(10), documentReference: "", notes: "" }, today).state, "expiring");
  assert.equal(contractLifecycle({ agreedAmountCents: 100, startDate: null, endDate: inDays(10), documentReference: "", notes: "" }, today).days, 10);
  assert.equal(contractStatusSpec(contractLifecycle({ agreedAmountCents: 100, startDate: null, endDate: inDays(60), documentReference: "", notes: "" }, today)).label, "ATTIVO");
  assert.equal(contractStatusSpec(contractLifecycle({ agreedAmountCents: 100, startDate: null, endDate: inDays(-1), documentReference: "", notes: "" }, today)).label, "SCADUTO");
});

test("il credito e una parola del sistema e le tre cifre non si sommano", () => {
  const live = { state: "active", days: null };
  assert.equal(creditStatusSpec(null, live), null);
  assert.equal(creditStatusSpec({ dueCents: 0, collectedCents: 0, outstandingCents: 0, hasContract: false, isSettled: false }, live), null);
  assert.equal(creditStatusSpec({ dueCents: 5000, collectedCents: 0, outstandingCents: 5000, hasContract: true, isSettled: false }, live), MONEY_STATUS.pending);
  assert.equal(creditStatusSpec({ dueCents: 5000, collectedCents: 2000, outstandingCents: 3000, hasContract: true, isSettled: false }, live), MONEY_STATUS.partial);
  assert.equal(creditStatusSpec({ dueCents: 5000, collectedCents: 5000, outstandingCents: 0, hasContract: true, isSettled: true }, live), MONEY_STATUS.paid);
  assert.equal(creditStatusSpec({ dueCents: 5000, collectedCents: 2000, outstandingCents: 3000, hasContract: true, isSettled: false }, { state: "expired", days: -3 }), MONEY_STATUS.overdue);
  // la scheda mostra le tre cifre accanto, in un contenitore tratteggiato
  assert.match(sources.record, /<SummaryCard\s+dashed/);
  assert.match(sources.record, /label: "Dovuto · pattuito dal contratto, non e cassa"/);
  assert.match(sources.record, /label: "Incassato · somma degli incassi registrati"/);
  assert.match(sources.record, /"Residuo · dovuto meno incassato" : "Residuo · nessun contratto registrato"/);
  assert.match(sources.record, /creditFromServer \|\| resolveSponsorCredit\(\{ contract, collections \}\)/, "il ripiego locale resta per il primo istante");
});

test("gli avvisi della scheda: contratto in scadenza, scaduto, residuo da incassare", () => {
  const money = (c) => `${c / 100} €`;
  const credit = { dueCents: 5000, collectedCents: 2000, outstandingCents: 3000, hasContract: true, isSettled: false };
  assert.deepEqual(
    computeSponsorAlerts(credit, { state: "expiring", days: 1 }, money).map((a) => [a.id, a.severity]),
    [["contract-expiring", "warning"], ["outstanding", "warning"]],
  );
  assert.equal(computeSponsorAlerts(credit, { state: "expiring", days: 1 }, money)[0].text, "Il contratto scade fra 1 giorno");
  assert.deepEqual(
    computeSponsorAlerts(credit, { state: "expired", days: -5 }, money).map((a) => [a.id, a.severity]),
    [["contract-expired", "danger"], ["outstanding", "danger"]],
  );
  assert.deepEqual(computeSponsorAlerts({ ...credit, outstandingCents: 0, isSettled: true }, { state: "active", days: null }, money), []);
  assert.match(sources.record, /<RecordAlertStrip/);
});

/* --------------------------------------------------------------- gli incassi */

test("un incasso non si cancella: si storna, dallo stesso endpoint del registro rate, con il motivo obbligatorio", () => {
  for (const source of [sources.list, sources.record]) {
    assert.match(source, /apiRequest\(`\/api\/v1\/payment-transactions\/\$\{encodeURIComponent\(reversing\.id\)\}`, \{\s*method: "POST",\s*body: \{ action: "reverse", reason \},/);
  }
  assert.match(sources.storno, /disabled=\{!reason\.trim\(\) \|\| saving\}/, "il pulsante resta spento finche il motivo non c'e");
  assert.match(sources.storno, /tone="danger"/);
  assert.match(sources.storno, /strict/);
  assert.match(sources.storno, /Storna l'incasso/);
  assert.doesNotMatch(everything, /action: "delete"|deleteClubDataItem\([^)]*"payment_transactions"/, "nessun DELETE di un incasso");
  assert.match(sources.grid, /hidden: \(row\) => !canReverseCollection\(row\)/);
  assert.ok(canReverseCollection({ id: "t", amountCents: 100, paidAt: null, paymentMethod: "", notes: "", reversed: false, counterpartyLabel: "" }));
  assert.ok(!canReverseCollection({ id: "t", amountCents: 100, paidAt: null, paymentMethod: "", notes: "", reversed: true, counterpartyLabel: "" }));
  assert.ok(!canReverseCollection({ id: "t", amountCents: -100, paidAt: null, paymentMethod: "", notes: "", reversed: false, counterpartyLabel: "" }));
  assert.equal(collectionStatusSpec({ reversed: true }).label, "STORNATO");
  assert.equal(collectionStatusSpec({ reversed: false }).label, "INCASSATO");
  assert.equal(collectionDescription({ notes: "", counterpartyLabel: "ACME" }), "ACME");
  assert.equal(collectionDescription({ notes: "", counterpartyLabel: "" }), "Incasso");
});

test("il cassetto dell'incasso manda cio che la rotta accetta: importo, data, metodo, conto, causale, note", () => {
  assert.match(sources.collection, /useCausaliIncasso\(\)/, "le causali dal gancio condiviso");
  assert.match(sources.collection, /useContiIncasso\(\)/, "i conti dal gancio condiviso");
  assert.match(sources.collection, /SPONSORSHIP_OPERATION_TYPE_CODE/, "la causale di sponsorizzazione si propone");
  for (const field of ["incasso-sponsor", "incasso-descrizione", "incasso-importo", "incasso-data", "incasso-metodo", "incasso-conto", "incasso-causale", "incasso-note"]) {
    assert.ok(sources.collection.includes(`id="${field}"`), `manca il campo ${field}`);
  }
  assert.match(sources.collection, /notes: \[draft\.description\.trim\(\), draft\.notes\.trim\(\)\]\.filter\(Boolean\)\.join\(" - "\) \|\| null/, "descrizione e note si compongono come nella scheda V1");
  const collectionCode = sources.collection.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(collectionCode, /value="uscita"|In uscita/, "«Uscita» non e un'opzione: il gestore registra sempre un incasso");
  assert.match(sources.collection, /Seleziona un partner/);
  assert.match(sources.collection, /Es\. Saldo sponsorizzazione stagione 2026/);
  for (const source of [sources.list, sources.record]) {
    assert.match(source, /financialAccountId: submission\.financialAccountId,\s*operationTypeCode: submission\.operationTypeCode,/);
  }
  assert.match(sources.list, /getClubPaymentMethodChoices\(clubSettings\)/, "i metodi configurati dal club, come nel registro rate");
});

test("«incassato stagione» conta gli incassi vivi del periodo", () => {
  const rows = [
    { id: "a", amountCents: 1000, paidAt: "2026-09-01", reversed: false },
    { id: "b", amountCents: 500, paidAt: "2026-09-02", reversed: true },
    { id: "c", amountCents: 700, paidAt: "2026-06-30", reversed: false },
    { id: "d", amountCents: 300, paidAt: "2027-06-30T10:00:00.000Z", reversed: false },
    { id: "e", amountCents: 900, paidAt: null, reversed: false },
  ];
  assert.equal(sumCollectionsInPeriodCents(rows, "2026-07-01", "2027-06-30"), 1300);
  assert.equal(sumCollectionsInPeriodCents(rows, null, null), 2000);
});

/* ---------------------------------------------------------------- la scheda */

test("/sponsors/[id]: intestazione di scheda con le aree, le distruttive solo nel ···, il nome nel breadcrumb", () => {
  assert.match(sources.record, /<RecordHeader/);
  assert.match(sources.record, /<RecordAreaSwitcher/);
  assert.match(sources.record, /useBreadcrumbLabel\(displayName\)/);
  assert.match(sources.record, /identity=\{\{ name: sponsorName\(sponsor\), round: true, avatarSrc: sponsor\.logo \|\| null \}\}/, "il logo, che la scheda V1 non mappava, compare");
  assert.match(sources.record, /\{ id: "edit", label: "Modifica", icon: <Pencil \/>/);
  assert.match(sources.record, /\{ id: "collect", label: "Registra incasso", icon: <Euro \/>, hidden: !canManageCredit/);
  assert.match(sources.record, /\{ id: "delete", label: "Elimina", icon: <Trash2 \/>, tone: "danger", overflow: true/);
  assert.match(sources.record, /P\.A\./, "il badge P.A. resta");
  assert.match(sources.model, /\{ value: "anagrafica", label: "Anagrafica" \}/);
  assert.match(sources.model, /\{ value: "contratto", label: "Contratto" \}/);
  assert.match(sources.model, /\{ value: "incassi", label: "Incassi" \}/);
  assert.match(sources.model, /\{ value: "documenti", label: "Documenti" \}/);
  assert.equal(resolveSponsorArea("finanza"), "contratto");
  assert.equal(resolveSponsorArea("archivio"), "documenti");
  assert.equal(resolveSponsorArea("pagamenti"), "incassi");
  assert.equal(resolveSponsorArea(null), "anagrafica");
  assert.match(sources.record, /<CollapsedSection id="sede" recordType="sponsor" title="Sede"/);
});

test("/sponsors/[id]: le sezioni della scheda V1 con le stesse etichette, e le scritture della V1", () => {
  for (const label of ["Nome / Ragione sociale", "Tipologia", "Pubblica amministrazione", "Codice fiscale", "Email", "PEC", "Telefono", "Telefono secondario", "Partita IVA", "Codice SDI", "IBAN", "Indirizzo", "Comune", "CAP", "Provincia", "Regione", "Paese", "Importo pattuito", "Periodo", "Riferimento del contratto", "Note"]) {
    assert.ok(sources.record.includes(`label: "${label}"`), `manca il campo «${label}»`);
  }
  assert.match(sources.record, /supabase\.from\("clubs"\)\.select\("sponsors, settings"\)\.eq\("id", clubId\)\.maybeSingle\(\)/);
  assert.match(sources.record, /fetchSponsorCredit\(sponsorId, \{ clubId \}\)/);
  assert.match(sources.record, /updateClubDataItem\(clubId, "sponsors", sponsorId, payload\)/);
  assert.match(sources.record, /updateClubDataItem\(clubId, "sponsors", sponsorId, \{ documents: next \}\)/);
  assert.match(sources.record, /deleteClubDataItem\(clubId, "sponsors", sponsorId\)/);
  assert.match(sources.record, /saveSponsorContract\(\{ clubId, sponsorId, contract: next \}\)/);
  assert.match(sources.record, /router\.push\(withClubId\("\/sponsors", clubId\)\)/);
  for (const toast of [
    "ID del club mancante. Torna alla lista sponsor.",
    "ID dello sponsor mancante",
    "Errore nel caricamento dei dati del club: ${clubError.message}",
    "Club non trovato. Verifica l'ID del club.",
    "Sponsor/Fornitore non trovato",
    "Errore nel caricamento dei dati dello sponsor",
    "Modifiche salvate con successo",
    "Errore nel salvataggio delle modifiche",
    "Sponsor/Fornitore eliminato con successo",
    "Errore nell'eliminazione dello sponsor",
    "Contratto salvato",
    "Errore nel salvataggio del contratto",
    "Pagamento registrato con successo",
    "Errore nella registrazione del pagamento",
    "Documento aggiunto con successo",
    "Errore nell'aggiunta del documento",
    "Documento eliminato con successo",
    "Errore nell'eliminazione del documento",
    "Torna alla lista sponsor",
    "Nessun documento registrato",
  ]) {
    assert.ok(sources.record.includes(toast), `manca «${toast}»`);
  }
  assert.match(sources.document, /Inserisci un titolo per il documento/);
  assert.match(sources.document, /Seleziona file/);
  assert.match(sources.model, /`doc-\$\{Date\.now\(\)\}-\$\{Math\.random\(\)\.toString\(36\)\.slice\(2, 11\)\}`/, "stesso identificativo dei documenti V1");
  assert.match(sources.contract, /sanitizeSponsorContract\(\{/);
  assert.match(sources.contract, /toSponsorCents\(draft\.agreedAmount\)/, "la notazione italiana degli importi");
  for (const id of ["contract-amount", "contract-reference", "contract-start", "contract-end", "contract-notes"]) {
    assert.ok(sources.contract.includes(`id="${id}"`), `manca il campo ${id}`);
  }
});

/* ------------------------------------------------------------- i permessi */

test("i permessi sono quelli delle rotte: accounting.read · accounting.manage · reverse o direzione", () => {
  for (const source of [sources.list, sources.record]) {
    assert.match(source, /hasAccountingPermission\(activeRole, "accounting\.read"\)/);
    assert.match(source, /hasAccountingPermission\(activeRole, "accounting\.manage"\)/);
    assert.match(source, /canManageClubConfigurationAsActor\(activeRole\) \|\| hasAccountingPermission\(activeRole, "accounting\.reverse"\)/);
    assert.match(source, /onReverse=\{canReverse \? \(row\) => setReversing\(row\) : undefined\}/, "permesso negato = azione assente");
  }
  assert.match(sources.list, /canManageCredit && sponsors\.length \? \(/);
  assert.doesNotMatch(code, /disabled=\{!can/, "mai un pulsante disabilitato per un permesso");
});

/* ------------------------------------------------------------ la forma */

test("le due pagine restano usabili a 375 px: guscio unico, nessuna griglia fissa a due colonne", () => {
  for (const source of [sources.list, sources.record]) {
    assert.match(source, /className="flex min-w-0 flex-1 flex-col overflow-hidden"/);
    assert.match(source, /bg-egw-page/);
    assert.doesNotMatch(source, /<Tabs|<Table|<Dialog|<Card[ >]|SharedPageHeader/, "niente componenti V1 di pagina");
    assert.doesNotMatch(source, /className="[^"\n]*(?<![a-z]:)grid-cols-2/, "una griglia a due colonne senza breakpoint");
  }
  assert.match(sources.record, /grid-cols-1 gap-x-6 gap-y-\[18px\] sm:grid-cols-2 lg:grid-cols-3/);
  assert.match(sources.clubId, /localStorage\.getItem\("activeClub"\)/, "il ripiego dell'elenco V1 vale anche per la scheda");
});
