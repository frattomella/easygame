import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **Iscrizioni — parita fra la V1 e il Web V2.**
 *
 * L'audit (`docs/redesign/audit/wave-d-iscrizioni.md`) elenca cio che
 * `/registration-management` faceva: piani di pagamento con ogni campo del
 * modulo, metodi manuali e provider online, sconti, programmi di contributo.
 * Questa prova statica cerca ognuna di quelle capacita nel sorgente V2 —
 * etichette, campi, endpoint, messaggi — cosi che una capacita non sparisca
 * senza che nessuno se ne accorga. Non sostituisce l'apertura della pagina.
 */
const SRC = path.join(process.cwd(), "src");
const read = (relative) => readFileSync(path.join(SRC, ...relative.split("/")), "utf8");
const senzaCommenti = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const page = read("app/registration-management/page.tsx");
const model = read("components/registration-management/v2/plan-form-model.ts");
const planDrawer = read("components/registration-management/v2/payment-plan-drawer.tsx");
const methodDrawer = read("components/registration-management/v2/payment-method-drawer.tsx");
const discountDrawer = read("components/registration-management/v2/discount-drawer.tsx");
const grids = read("components/registration-management/v2/registration-grids.tsx");

test("la pagina e il pattern 10 del Web V2: intestazione, numeri, contesto, un primario per scheda, quattro schede in URL", () => {
  assert.match(page, /<PageHeader/);
  assert.match(page, /eyebrow="Segreteria"/);
  assert.match(page, /title="Iscrizioni"/);
  assert.match(page, /<HeaderStat value=\{activePlans\} label="Piani attivi"/);
  assert.match(page, /label="Metodi attivi"/);
  assert.match(page, /label="Metodi online"/);
  assert.match(page, /label="Sconti attivi"/);
  assert.match(page, /<ContextControl icon=\{<Trophy \/>\}>/, "la stagione attiva e un controllo di contesto");
  assert.match(page, /router\.push\("\/organization\?tab=stagioni"\)/, "e porta dove la stagione si cambia");
  assert.match(page, /<SegmentedControl<RegistrationTab>/);
  for (const label of ["Piani e listini", "Metodi di pagamento", "Sconti e promozioni", "Contributi e bandi"]) {
    assert.match(page, new RegExp(`label: "${label}"`), `scheda «${label}»`);
  }
  assert.match(page, /searchParams\.get\("tab"\)/, "la scheda sopravvive al reload");
  assert.match(page, /searchParams\.get\("action"\) !== "new"/, "`?action=new` apre il modulo di creazione");
  // Un primario per schermata: quello della scheda corrente.
  assert.match(page, /tab === "piani" \? \([\s\S]{0,200}Nuovo piano/);
  assert.match(page, /tab === "metodi" \? \([\s\S]{0,200}Nuovo metodo/);
  assert.match(page, /tab === "sconti" \? \([\s\S]{0,200}Nuovo sconto/);
});

test("niente chrome V1 in pagina, niente confirm() del browser, niente ricarica intera", () => {
  const pulita = senzaCommenti(page);
  assert.doesNotMatch(pulita, /window\.confirm|[^a-zA-Z]confirm\(\s*"/);
  assert.doesNotMatch(pulita, /window\.location\.href/, "«Apri Pagamenti» naviga con il router, non ricarica");
  assert.doesNotMatch(page, /SharedPageHeader|@\/components\/ui\/card|@\/components\/ui\/tabs|@\/components\/ui\/dialog|@\/components\/ui\/table|@\/components\/ui\/badge/);
  assert.doesNotMatch(page, /bg-gradient-to-r|from-blue-600|bg-blue-600/);
  assert.doesNotMatch(pulita, /clothing_kits|kit_assignments|CustomKitComponentsBuilder/, "la scheda kit irraggiungibile non torna: vive in /clothing");
  assert.match(page, /useConfirm\(\)/);
  assert.match(page, /tone: "danger"/, "cancellare configurazione e distruttivo: DangerConfirmDialog con le conseguenze");
  assert.match(page, /router\.push\("\/organization\?tab=pagamenti"\)/);
});

test("le tre griglie sono il DataGrid, con viste, filtri, ricerca ed esportazione", () => {
  assert.match(page, /<DataGrid<PlanRow>[\s\S]{0,120}module="iscrizioni-piani"/);
  assert.match(page, /<DataGrid<MethodRow>[\s\S]{0,120}module="iscrizioni-metodi"/);
  assert.match(page, /<DataGrid<DiscountRow>[\s\S]{0,120}module="iscrizioni-sconti"/);
  assert.match(page, /<DataGrid<ProviderRow>[\s\S]{0,120}module="iscrizioni-provider"/);
  assert.match(grids, /export const PLAN_VIEWS/);
  assert.match(grids, /export const PLAN_FILTERS/);
  assert.match(grids, /export const METHOD_VIEWS/);
  assert.match(grids, /export const DISCOUNT_VIEWS/);
  assert.match(page, /exportGridCsv\(request, "Piani di pagamento"\)/);
  assert.match(page, /exportGridCsv\(request, "Metodi di pagamento"\)/);
  assert.match(page, /exportGridCsv\(request, "Sconti e promozioni"\)/);
  assert.match(grids, /normalizePaymentPlan\(raw\)/, "i numeri di un piano li da normalizePaymentPlan, come nelle card della V1");
});

test("la card del piano della V1 e tutta nella riga: servizi, totale, rate, prima scadenza, pro-rata, stato", () => {
  for (const header of ['header: "Piano"', 'header: "Servizi"', 'header: "Totale servizi"', 'header: "Rate"', 'header: "Prima scadenza"', 'header: "Pro-rata"', 'header: "Sconti applicabili"', 'header: "Stato"']) {
    assert.match(grids, new RegExp(header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), header);
  }
  assert.match(grids, /Dopo \$\{row\.plan\.installments\[0\]\?\.dueAfterDays \?\? 0\} giorni/);
  assert.match(grids, /"Mesi" : "Giorni"/);
  assert.match(grids, /Nessuna descrizione/);
  assert.match(grids, /configurationStatus\(row\.plan\.active\)/, "lo stato e una pillola, non una riga colorata");
  assert.match(grids, /PERSON_STATUS\.active : PERSON_STATUS\.inactive/, "ATTIVO · DISATTIVATO nelle parole del sistema");
});

test("il modulo del piano ha ogni campo della V1 e gli stessi calcoli", () => {
  assert.match(planDrawer, /width="wide"/, "piu di otto campi e due elenchi: cassetto da 720");
  assert.match(planDrawer, /dirty=\{dirty\}/, "guardia sulle modifiche non salvate");
  for (const label of [
    'label="Nome piano"',
    "Totale automatico",
    "Somma dei servizi inclusi nel piano.",
    'label="Descrizione"',
    'eyebrow="Servizi inclusi"',
    'label="Nome servizio"',
    'label="Tipo"',
    'label="Prezzo"',
    'label="Descrizione servizio"',
    "Opzionale per atleta",
    "Incluso nel totale",
    "Aggiungi servizio",
    'aria-label="Rimuovi servizio"',
    'eyebrow="Rate e scadenze"',
    "Le scadenze sono relative alla data inizio iscrizione dell'atleta.",
    'label="Nome rata"',
    'label="Tipo importo"',
    'label="Valore"',
    'label="Scadenza dopo giorni"',
    "Aggiungi rata",
    'aria-label="Rimuovi rata"',
    'eyebrow="Calcolo quota stagionale"',
    "Abilita calcolo proporzionale",
    'label="Metodo"',
    'label="Permetti override manuale"',
    "Modifica importo in scheda atleta",
    'label="Inizio periodo/stagione"',
    'label="Fine periodo/stagione"',
    'eyebrow="Anteprima"',
    "Esempio calcolato con data inizio oggi e rate arrotondate a multipli di 5 euro.",
    "Totale servizi",
    "Totale esempio",
    'eyebrow="Sconti applicabili"',
    "Se non selezioni nulla, tutti gli sconti restano applicabili a questo piano.",
    "Nessuno sconto configurato.",
    'label="Note interne"',
    "Es. Stagione completa",
    "Es. Allenamenti stagione",
    "Es. Prima rata",
    "Note operative opzionali",
  ]) {
    assert.match(planDrawer, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), label);
  }
  assert.match(planDrawer, /PAYMENT_PLAN_SERVICE_TYPES/);
  assert.match(planDrawer, /value: "percentage", label: "Percentuale"/);
  assert.match(planDrawer, /value: "fixed", label: "Importo fisso"/);
  assert.match(planDrawer, /value: "remaining", label: "Saldo restante"/);
  assert.match(planDrawer, /value: "days", label: "Per giorni"/);
  assert.match(planDrawer, /value: "months", label: "Per mesi"/);
  assert.match(planDrawer, /installment\.amountType === "remaining"/, "il valore e disabilitato sul saldo restante");
  assert.match(planDrawer, /installmentPreview\.warnings\[0\]/, "l'avviso sulle rate resta in linea");
  assert.match(planDrawer, /prorationPreview\.warning/);
  assert.match(planDrawer, /Dopo \{installment\.dueAfterDays\} giorni/);
  assert.match(planDrawer, /<InsetBlock dashed>/, "l'anteprima economica e nel riquadro tratteggiato");

  // I calcoli e il record sono quelli della V1, spostati nel modello puro.
  assert.match(model, /calculatePlanTotal\(draft\)/);
  assert.match(model, /startDate: todayLocalDateOnly\(\)/);
  assert.match(model, /fallbackPeriod: seasonPeriod/);
  assert.match(model, /generateInstallmentPreview\(draft, prorationPreview\.total/);
  assert.match(model, /Inserisci nome piano e almeno un servizio/);
  assert.match(model, /label: index === 0 \? "Pagamento unico" : `Rata \$\{index \+ 1\}`/);
  assert.match(model, /amountType: index === 0 \? "percentage" : "remaining"/);
  assert.match(model, /dueAfterDays: index \* 30/);
  assert.match(model, /type: "allenamenti"/);
  assert.match(model, /if \(field === "enabled" && value === false\) next\.method = "none"/);
  assert.match(model, /paymentSchedule: normalizedDraft\.installments/);
  assert.match(model, /id: editing\?\.id \|\| `plan_\$\{Date\.now\(\)\}`/);
  assert.match(model, /Se lasci vuote le date uso il periodo della stagione attiva/);
  assert.match(model, /Il piano ha un periodo proprio: la stagione attiva non viene usata\./);
});

test("il metodo manuale e lo sconto hanno i loro campi e le loro validazioni", () => {
  assert.match(methodDrawer, /width="default"/);
  assert.match(methodDrawer, /label="Nome metodo"/);
  assert.match(methodDrawer, /Es\. Bonifico Bancario/);
  assert.match(methodDrawer, /label="Dettagli"/);
  assert.match(methodDrawer, /Metodo attivo/);
  assert.match(methodDrawer, /Inserisci un nome per il metodo di pagamento/);

  assert.match(discountDrawer, /width="default"/);
  assert.match(discountDrawer, /label="Titolo"/);
  assert.match(discountDrawer, /Es\. Sconto Famiglia/);
  assert.match(discountDrawer, /label="Tipo di sconto"/);
  assert.match(discountDrawer, /value: "percentage", label: "Percentuale \(%\)"/);
  assert.match(discountDrawer, /value: "fixed", label: "Importo fisso \(€\)"/);
  assert.match(discountDrawer, /"Percentuale \(%\)" : "Importo \(€\)"/);
  assert.match(discountDrawer, /isPercentage \? "1" : "0\.01"/);
  assert.match(discountDrawer, /Sconto attivo/);
  assert.match(discountDrawer, /draft\.value <= 0/);
  assert.match(discountDrawer, /Compila tutti i campi/);
});

test("le scritture sono le stesse funzioni e le stesse risorse della V1, con i suoi messaggi", () => {
  assert.match(page, /getClubData\(activeClubId, "payment_plans"\)/);
  assert.match(page, /getClubData\(activeClubId, "discounts"\)/);
  assert.match(page, /getClubSettings\(activeClubId\)/);
  assert.match(page, /addClubData\(activeClubId, "payment_plans", planToSave\)/);
  assert.match(page, /updateClubDataItem\(activeClubId, "payment_plans", editing\.id, planToSave\)/);
  assert.match(page, /deleteClubDataItem\(activeClubId, "payment_plans", row\.id\)/);
  assert.match(page, /addClubData\(activeClubId, "discounts", discountToSave\)/);
  assert.match(page, /updateClubDataItem\(activeClubId, "discounts", editing\.id, discountToSave\)/);
  assert.match(page, /deleteClubDataItem\(activeClubId, "discounts", row\.id\)/);
  assert.match(page, /saveClubSettings\(activeClubId, \{[\s\S]{0,80}paymentMethods: serializeClubPaymentMethodsForSettings/);
  assert.match(page, /normalizeClubPaymentMethod/);
  assert.match(page, /id: editing\?\.id \|\| `discount_\$\{Date\.now\(\)\}`/);
  /*
    Dopo ogni scrittura si rilegge con la stessa funzione dell'apertura: la
    colonna intera restituita dalla scrittura non e filtrata per stagione.
  */
  assert.match(page, /await updateClubDataItem\(activeClubId, "payment_plans"[\s\S]{0,120}await loadPlans\(\)/);
  assert.match(page, /await deleteClubDataItem\(activeClubId, "discounts"[\s\S]{0,80}await loadDiscounts\(\)/);
  for (const message of [
    "Piano di pagamento aggiornato con successo",
    "Nuovo piano di pagamento aggiunto con successo",
    "Errore nel salvataggio del piano di pagamento",
    "Piano di pagamento eliminato con successo",
    "Errore nell'eliminazione del piano di pagamento",
    "Metodo di pagamento aggiornato con successo",
    "Nuovo metodo di pagamento aggiunto con successo",
    "Errore nel salvataggio del metodo di pagamento",
    "Metodo di pagamento eliminato con successo",
    "Errore nell'eliminazione del metodo di pagamento",
    "Sconto aggiornato con successo",
    "Sconto aggiunto con successo",
    "Errore nel salvataggio dello sconto",
    "Sconto eliminato con successo",
    "Errore nell'eliminazione dello sconto",
    "Errore nel caricamento dei dati",
    "Club non trovato",
  ]) {
    assert.match(page, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), message);
  }
});

test("i provider online si leggono con le stesse quattro colonne e gli stessi stati", () => {
  assert.match(page, /PAYMENT_PROVIDER_ORDER\.map/);
  assert.match(page, /PAYMENT_PROVIDER_REGISTRY\[provider\]/);
  assert.match(page, /getAvailableRegistrationPaymentMethods\(clubPaymentSettings\)/);
  assert.match(page, /Nessun metodo di pagamento online configurato/);
  assert.match(page, /Apri Pagamenti/);
  for (const header of ['header: "Metodo"', 'header: "Provider"', 'header: "Disponibile"']) {
    assert.match(grids, new RegExp(header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), header);
  }
  assert.match(grids, /paymentStatusLabel\(status\)/);
  assert.match(grids, /spec\("ABILITATO", "solid", "green"\)/);
  assert.match(grids, /spec\("DISABILITATO", "quiet", "neutral"\)/);
  assert.match(grids, /spec\("DISPONIBILE", "solid", "green"\)/);
  assert.match(grids, /spec\("NON DISPONIBILE", "quiet", "neutral"\)/);
  assert.match(grids, /Predisposto/);
  assert.match(grids, /row\.config\.publicLabel \|\| row\.definition\.label/);
});

test("i contributi restano il componente condiviso, montato e non riscritto", () => {
  assert.match(page, /<FundingProgramsPanel \/>/);
  assert.doesNotMatch(page, /\/api\/v1\/funding/, "la pagina non parla con le rotte dei bandi: lo fa il pannello");
  assert.match(page, /Un voucher assegnato non e denaro incassato/);
});

test("il permesso e uno solo, coincide con la risorsa `clubs`, e il diniego e assente non disabilitato", () => {
  assert.match(page, /canManageClubConfigurationAsActor\(activeClub\?\.role\)/);
  assert.doesNotMatch(senzaCommenti(page), /disabled=\{!canConfigure\}/);
  assert.match(page, /canConfigure\s*\?\s*\[[\s\S]{0,400}\]\s*:\s*\[\]/, "le azioni di riga non compaiono a chi non puo");
  assert.match(page, /!canConfigure \? "restricted"/, "chi non legge la risorsa vede il diniego della griglia, non un elenco vuoto");
  assert.match(page, /Piani, metodi e sconti sono riservati alla direzione/);
  assert.match(page, /if \(!activeClubId \|\| !user \|\| !canConfigure\)/, "nessuna lettura che tornerebbe 403");
});

test("le griglie hanno i loro stati vuoti con il primo verbo", () => {
  assert.match(page, /Nessun piano di pagamento configurato\./);
  assert.match(page, /Crea il primo piano/);
  assert.match(page, /Nessun metodo di pagamento configurato\./);
  assert.match(page, /Crea il primo metodo/);
  assert.match(page, /Nessuno sconto configurato\./);
  assert.match(page, /Crea il primo sconto/);
});

test("nessuna griglia resta a due colonne a 375 px nei cassetti", () => {
  for (const [name, source] of [["payment-plan-drawer", planDrawer], ["payment-method-drawer", methodDrawer], ["discount-drawer", discountDrawer]]) {
    const offending = source.split(/\r?\n/).filter((line) => /(?<![a-z:])grid-cols-[23]\b/.test(line));
    assert.deepEqual(offending, [], `${name}: una griglia senza breakpoint vale anche a 375 px`);
  }
});
