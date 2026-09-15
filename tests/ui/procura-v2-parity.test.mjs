import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  amountInputValue,
  countAssociations,
  emptyProcuraDraft,
  formatAddressLines,
  formatAssociationCost,
  matchesProcuraSearch,
  parseAmountInput,
  paymentsBalance,
  procuraDraftFrom,
  resolvePersonName,
} from "@/components/procura/v2/procura-model";

/**
 * Parita della pagina `/procura` V2 con l'audit V1
 * (`docs/redesign/audit/wave-c-administration.md`, sezione C).
 *
 * Il redesign cambia forma, non capacita: ogni etichetta, campo, toast e
 * funzione di `simplified-db` che l'audit elenca deve restare nel sorgente
 * V2. Un test statico non prova che funzioni — lo fa il lead a schermo — ma
 * impedisce che una capacita sparisca per distrazione. La forma salvata in
 * `clubs.procure` e letta anche da `club-financial-summary.ts`: cambiarla
 * romperebbe i movimenti consolidati.
 */
const read = (relative) => readFileSync(path.join(process.cwd(), relative), "utf8");
const V2 = "src/components/procura/v2";
const sources = {
  page: read("src/app/procura/page.tsx"),
  drawer: read(`${V2}/procura-drawer.tsx`),
  inspector: read(`${V2}/procura-inspector.tsx`),
  del: read(`${V2}/delete-procura-dialog.tsx`),
  model: read(`${V2}/procura-model.ts`),
};
const everything = Object.values(sources).join("\n");
const code = everything.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ------------------------------------------------------------ la pagina */

test("/procura: intestazione di pagina con una sola azione primaria, senza la promessa dei documenti", () => {
  assert.match(sources.page, /<PageHeader/);
  assert.match(sources.page, /eyebrow="Persone"/);
  assert.match(sources.page, /title="Procure"/);
  assert.equal((sources.page.match(/variant="primary"/g) || []).length, 2, "il primario di pagina e quello dello stato vuoto: nessun altro gradiente");
  assert.match(sources.page, /Nuova procura/);
  assert.doesNotMatch(sources.page, /documenti associati/, "la V1 prometteva documenti che non esistono");
  assert.match(sources.page, /recapiti, atleti e allenatori associati, movimenti registrati/);
  for (const stat of ['"procura" : "procure"', '"contatto" : "contatti"', 'label="atleti associati"', 'label="allenatori associati"']) {
    assert.ok(sources.page.includes(stat), `manca il numero di intestazione ${stat}`);
  }
});

test("/procura: la griglia porta le colonne della tabella V1 (nome + citta, contatti, atleti, allenatori)", () => {
  assert.match(sources.page, /module="procure"/);
  for (const column of ['id: "identity"', 'id: "contacts"', 'id: "athletes"', 'id: "trainers"', 'id: "payments"']) {
    assert.ok(sources.page.includes(column), `manca la colonna ${column}`);
  }
  assert.match(sources.page, /<IdentityCell name=\{String\(row\.name \|\| ""\)\} meta=\{procuraMeta\(row\)\}/, "la citta resta sotto il nome, come nella V1");
  for (const hidden of ['id: "city"', 'id: "balance"']) {
    assert.ok(sources.page.includes(hidden), `manca la colonna nascosta ${hidden}`);
  }
  assert.match(sources.page, /search=\{search\}/);
  assert.match(sources.page, /matchesProcuraSearch\(row, query\)/);
  assert.match(sources.page, /defaultSort=\{\{ columnId: "identity", direction: "asc" \}\}/);
});

test("/procura: azioni di riga Apri · Modifica · Elimina, con l'ispettore al posto del pannello di dettaglio", () => {
  assert.match(sources.page, /label: "Apri", icon: <ChevronRight \/>, primary: true/);
  assert.match(sources.page, /label: "Modifica", icon: <Pencil \/>/);
  assert.match(sources.page, /label: "Elimina", icon: <Trash2 \/>, tone: "danger"/);
  assert.match(sources.page, /onOpenRow=\{openInspector\}/);
  assert.match(sources.page, /onInspectRow=\{openInspector\}/);
  assert.match(sources.page, /activeRowId=\{inspectorOpen \? selectedId : null\}/);
  assert.match(sources.page, /<ProcuraInspector/);
  assert.match(sources.page, /<ProcuraDrawer/);
  assert.match(sources.page, /<DeleteProcuraDialog/);
  assert.doesNotMatch(code, /window\.confirm|[^.\w]confirm\(/, "nessuna conferma nativa");
});

test("/procura: stati vuoto, caricamento ed errore (la V1 non aveva ne scheletro ne errore visibile)", () => {
  assert.match(sources.page, /title: "Nessuna procura in archivio"/);
  assert.match(sources.page, /state=\{gridState\}/);
  assert.match(sources.page, /loading \? "loading" : loadError \? "error" : "ready"/);
  assert.match(sources.page, /onRetry=\{reload\}/);
  assert.match(sources.page, /errorMessage=\{loadError\}/);
  assert.match(sources.page, /showToast\("error", "Errore nel caricamento dei dati"\)/);
});

test("/procura: stesse letture e scritture della V1 via simplified-db, nessun fetch diretto", () => {
  assert.match(sources.page, /getClubData\(clubId, "procure"\)/);
  assert.match(sources.page, /getClubAthletes\(clubId\)/);
  assert.match(sources.page, /getClubData\(clubId, "trainers"\)/);
  assert.match(sources.page, /addClubData\(clubId, "procure", procuraToSave\)/);
  assert.match(sources.page, /updateClubDataItem\(clubId, "procure", editing\.id, procuraToSave\)/);
  assert.match(sources.page, /deleteClubDataItem\(clubId, "procure", deleting\.id\)/);
  assert.match(sources.page, /updateClubDataItem\(clubId, "procure", procura\.id, updatedProcura\)/);
  assert.match(sources.page, /updateClubDataItem\(clubId, "procure", updatedProcura\.id, updatedProcura\)/);
  assert.doesNotMatch(code, /fetch\(|apiRequest\(/, "tutto passa da simplified-db");
  // stessa forma salvata della V1
  assert.match(sources.page, /id: editing\?\.id \|\| `procura_\$\{Date\.now\(\)\}`/);
  assert.match(sources.page, /createdAt: editing\?\.createdAt \|\| new Date\(\)\.toISOString\(\)/);
  assert.match(sources.page, /updatedAt: new Date\(\)\.toISOString\(\)/);
});

test("/procura: i toast della V1 restano parola per parola", () => {
  for (const toast of [
    "Club non trovato",
    "Procura aggiornata con successo",
    "Nuova procura aggiunta con successo",
    "Errore nel salvataggio della procura",
    "Procura eliminata con successo",
    "Errore nell'eliminazione della procura",
    "Pagamento aggiunto con successo",
    "Errore nell'aggiunta del pagamento",
    "Associazione aggiunta con successo",
    "Errore nell'aggiunta dell'associazione",
    "Modifiche salvate con successo",
    "Errore nel salvataggio delle modifiche",
  ]) {
    assert.ok(sources.page.includes(toast), `manca il toast «${toast}»`);
  }
  assert.match(sources.page, /error instanceof Error \? error\.message : "Errore nel salvataggio della procura"/);
  for (const toast of ["Inserisci il nome della procura", "Inserisci nome e cognome del contatto"]) {
    assert.ok(sources.drawer.includes(toast), `manca la validazione «${toast}»`);
  }
  for (const toast of ["Compila tutti i campi obbligatori", "Seleziona una persona da associare"]) {
    assert.ok(sources.inspector.includes(toast), `manca la validazione «${toast}»`);
  }
});

/* ------------------------------------------------------------ il cassetto */

test("/procura: il cassetto da 720 ha i campi del dialog V1 e i contatti in riga, senza un secondo cassetto", () => {
  assert.match(sources.drawer, /width="wide"/);
  assert.match(sources.drawer, /"Modifica procura" : "Nuova procura"/);
  assert.match(sources.drawer, /label="Nome procura"/);
  assert.match(sources.drawer, /placeholder="Es. Studio Legale Rossi"/);
  assert.match(sources.drawer, /<FieldGroup eyebrow="Indirizzo sede procura"/);
  for (const placeholder of ['"Via/Piazza"', '"Città"', '"Provincia"', '"CAP"', '"Paese"']) {
    assert.ok(sources.drawer.includes(`placeholder=${placeholder}`), `manca il campo indirizzo ${placeholder}`);
  }
  assert.match(sources.model, /country: "Italia"/, "il paese parte da Italia");
  assert.match(sources.drawer, /Contatti procuratori/);
  assert.match(sources.drawer, /Nessun contatto aggiunto/);
  assert.match(sources.drawer, /Aggiungi contatto/);
  for (const placeholder of ['"Nome"', '"Cognome"', '"+39 123 456 7890"', '"email@example.com"']) {
    assert.ok(sources.drawer.includes(`placeholder=${placeholder}`), `manca il campo contatto ${placeholder}`);
  }
  assert.match(sources.drawer, /\{editing \? "Aggiorna" : "Aggiungi"\}/);
  assert.match(sources.drawer, /\{editing \? "Aggiorna" : "Salva"\}/);
  assert.match(sources.drawer, /`contact_\$\{Date\.now\(\)\}`/);
  assert.equal((sources.drawer.match(/<Drawer\b(?!Section)/g) || []).length, 1, "un cassetto solo: i contatti si compilano in riga");
  assert.match(sources.drawer, /dirty=\{dirty\}/);
});

/* ------------------------------------------------------------ l'ispettore */

test("/procura: l'ispettore riproduce le tre schede del pannello V1", () => {
  assert.match(sources.inspector, /<SegmentedControl/);
  for (const label of ['label: "Informazioni"', 'label: "Pagamenti"', 'label: "Associazioni"']) {
    assert.ok(sources.inspector.includes(label), `manca la scheda ${label}`);
  }
  assert.match(sources.inspector, /Modifica informazioni/);
  assert.match(sources.inspector, /onBack=\{mode\.kind === "view" \? undefined : backToView\}/, "il modulo sostituisce il corpo con la freccia indietro");
  assert.equal((sources.inspector.match(/<Drawer\b(?!Section)/g) || []).length, 1, "un cassetto solo");
  // Informazioni
  assert.match(sources.inspector, /Indirizzo sede/);
  assert.match(sources.inspector, /Nessun contatto registrato/);
  // Pagamenti
  assert.match(sources.inspector, /Storico pagamenti/);
  assert.match(sources.inspector, /Nuovo pagamento/);
  assert.match(sources.inspector, /Nessun pagamento registrato/);
  assert.match(sources.inspector, /\{outbound \? "Uscita" : "Entrata"\}/);
  assert.match(sources.inspector, /formatMoney\(/);
  assert.match(sources.inspector, /formatDateShort\(row\.date\)/);
  // Associazioni
  assert.match(sources.inspector, /Atleti e allenatori associati/);
  assert.match(sources.inspector, /Aggiungi associazione/);
  assert.match(sources.inspector, /Nessun atleta associato/);
  assert.match(sources.inspector, /Nessun allenatore associato/);
  assert.match(sources.inspector, /Costo: /);
  assert.match(sources.inspector, /Note: \{row\.notes\}/);
  assert.match(sources.inspector, /title="Aggiungi\/Modifica Note"/);
  assert.match(sources.inspector, /Sei sicuro di voler eliminare questa associazione\?/);
  assert.match(sources.inspector, /<ConfirmDialog/);
});

test("/procura: il modulo pagamento ha i campi della V1, solo persone gia associate, forma salvata identica", () => {
  for (const label of ['label="Tipo persona"', 'label="Persona"', 'label="Data"', 'label="Importo (€)"', 'label="Tipo"', 'label="Descrizione"']) {
    assert.ok(sources.inspector.includes(label), `manca il campo ${label}`);
  }
  assert.match(sources.inspector, /placeholder="Descrizione del pagamento"/);
  assert.match(sources.inspector, /associationsOf\(procura, values\.personType\)\.map/, "solo atleti/allenatori gia associati");
  assert.match(sources.inspector, /personType: value as PersonType, personId: ""/, "cambiare tipo azzera la persona");
  assert.match(sources.inspector, /date: todayLocalDateOnly\(\)/);
  assert.match(sources.inspector, /type: "entrata"/);
  assert.match(sources.inspector, /`payment_\$\{Date\.now\(\)\}`/);
  assert.match(sources.inspector, /personId: payment\.personId,\s*personType: payment\.personType,\s*date: payment\.date,\s*amount,\s*type: payment\.type,\s*description: payment\.description/);
  assert.match(sources.model, /PERSON_TYPE_OPTIONS/);
  assert.match(sources.model, /label: "Atleta"/);
  assert.match(sources.model, /label: "Allenatore"/);
  assert.match(sources.model, /label: "Entrata"/);
  assert.match(sources.model, /label: "Uscita"/);
});

test("/procura: il modulo associazione (tipo bloccato in modifica, persona modificabile, costo) e le note", () => {
  assert.match(sources.inspector, /label="Tipo"/);
  assert.match(sources.inspector, /disabled=\{editing\}/, "il tipo e disabilitato in modifica, come nella V1");
  assert.match(sources.inspector, /label="Costo \(€\)"/);
  assert.match(sources.inspector, /<SearchableSelect/);
  assert.match(sources.inspector, /values\.personType === "athlete" \? people\.athletes : people\.trainers/, "tutti gli atleti/allenatori del club");
  assert.match(sources.inspector, /notes: "",\s*addedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(sources.inspector, /\{ \.\.\.row, cost, personId: association\.personId \}/, "in modifica cambiano costo e persona");
  assert.match(sources.inspector, /\{mode\.editing \? "Aggiorna" : "Salva"\}/);
  assert.match(sources.inspector, /"Modifica associazione" : "Nuova associazione"/);
  assert.match(sources.inspector, /Note associazione/);
  assert.match(sources.inspector, /placeholder="Inserisci note per questa associazione\.\.\."/);
  assert.match(sources.inspector, /rows=\{5\}/);
  assert.match(sources.inspector, /Salva note/);
  assert.match(sources.inspector, /\{ \.\.\.row, notes \}/);
});

test("/procura: l'eliminazione passa dal modale distruttivo con la frase della V1", () => {
  assert.match(sources.del, /<DangerConfirmDialog/);
  assert.match(sources.del, /Sei sicuro di voler eliminare questa procura\?/);
  assert.match(sources.del, /confirmLabel="Elimina"/);
  assert.match(sources.del, /consequences=\{\[/);
  assert.doesNotMatch(sources.del, /typedConfirmation/, "un record solo: niente conferma scritta");
});

test("/procura: nessun import morto, nessuna primitiva V1, nessun ripiego in sport-work", () => {
  for (const dead of ["FileText", " Search,", " User,", "@/components/ui/card", "@/components/ui/dialog", "@/components/ui/tabs", "@/components/ui/select", "SharedPageHeader"]) {
    assert.ok(!sources.page.includes(dead), `la V2 non deve importare ${dead}`);
  }
  assert.doesNotMatch(code, /sport-work|classifyProcura|athlete_guardians/, "una procura resta dov'e");
  assert.doesNotMatch(everything, /bg-gradient-to-r|backdrop-blur|bg-blue-600|text-muted-foreground/);
});

/* ------------------------------------------------------------ il modello */

test("procura-model: bozza vuota e bozza da una procura esistente conservano la forma V1", () => {
  assert.deepEqual(emptyProcuraDraft(), {
    name: "",
    address: { street: "", city: "", province: "", postalCode: "", country: "Italia" },
    contacts: [],
    athletes: [],
    trainers: [],
    payments: [],
  });
  const draft = procuraDraftFrom({ id: "p1", name: "Studio Rossi", address: { city: "Roma" }, athletes: [{ personId: "a1", personType: "athlete", cost: 10 }] });
  assert.equal(draft.address.country, "Italia");
  assert.equal(draft.address.city, "Roma");
  assert.equal(draft.contacts.length, 0);
  assert.equal(draft.athletes.length, 1, "le associazioni viaggiano con la bozza e si risalvano intatte");
});

test("procura-model: indirizzo, nomi, importi e ricerca", () => {
  assert.deepEqual(formatAddressLines({ street: "Via Roma 1", postalCode: "00100", city: "Roma", province: "RM", country: "Italia" }), ["Via Roma 1", "00100 Roma (RM)", "Italia"]);
  assert.deepEqual(formatAddressLines(null), []);
  const people = { athletes: [{ id: "a1", name: "Marco Ferretti", firstName: "Marco", lastName: "Ferretti", type: "athlete" }], trainers: [] };
  assert.equal(resolvePersonName(people, "athlete", "a1"), "Marco Ferretti");
  assert.equal(resolvePersonName(people, "trainer", "a1"), "Sconosciuto");
  assert.equal(formatAssociationCost(undefined), "0,00 €");
  assert.equal(formatAssociationCost(120), "120,00 €");
  assert.equal(parseAmountInput("120,50"), 120.5);
  assert.equal(parseAmountInput("abc"), 0);
  assert.equal(amountInputValue(120.5), "120,5");
  assert.equal(amountInputValue(0), "");
  const procura = { id: "p1", name: "Studio Rossi", address: { city: "Roma" }, contacts: [{ id: "c1", firstName: "Anna", lastName: "Bianchi", phone: "", email: "anna@x.it" }], payments: [{ id: "x", amount: 100, type: "entrata" }, { id: "y", amount: 30, type: "uscita" }] };
  assert.ok(matchesProcuraSearch(procura, "rossi"), "nome (V1)");
  assert.ok(matchesProcuraSearch(procura, "ROMA"), "citta (esteso)");
  assert.ok(matchesProcuraSearch(procura, "bianchi"), "contatto (esteso)");
  assert.ok(!matchesProcuraSearch(procura, "verdi"));
  assert.equal(paymentsBalance(procura), 70);
  assert.deepEqual(countAssociations([procura, { id: "p2", name: "B", athletes: [{ personId: "a", personType: "athlete", cost: 0 }], trainers: [{ personId: "t", personType: "trainer", cost: 0 }] }]), { contacts: 1, athletes: 1, trainers: 1 });
});
