import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  ASSIGNMENT_ACTION_STATUSES,
  ASSIGNMENT_STATUS,
  BULK_STOCK_STATUS,
  CATALOG_STATUS,
  CLOTHING_AREAS,
  INVENTORY_STATUS,
  ITEM_STATE_STATUS,
  KIT_DELIVERY_STATUS,
  assignmentFormFromStock,
  buildSupplierOrderRows,
  dateInputValue,
  emptyAssignmentForm,
  emptyItemForm,
  emptyKitForm,
  emptyNumberingGroup,
  emptyStockForm,
  inventoryStatusSpec,
  isClothingArea,
  isStockAssignable,
  isSupplierAssignment,
  itemFormFrom,
  splitCsv,
  stockFormFrom,
  supplierLabel,
} from "@/components/clothing/v2/clothing-model";
import { assignmentStatusLabels, inventoryStatusLabels, normalizeClothingAssignment } from "@/lib/clothing-inventory-utils";
import { CLOTHING_ITEM_STATE_LABELS, KIT_DELIVERY_STATE_LABELS } from "@/lib/clothing-delivery";

/**
 * Parita della pagina Abbigliamento V2 con l'audit V1
 * (`docs/redesign/audit/wave-e-abbigliamento.md`).
 *
 * Il redesign cambia forma, non capacita: ogni etichetta, azione, campo ed
 * endpoint che l'audit elenca deve restare nel sorgente V2. Un test statico
 * non prova che funzioni — lo fa il lead a schermo — ma impedisce che una
 * capacita sparisca per distrazione.
 */
const read = (relative) => readFileSync(path.join(process.cwd(), relative), "utf8");
const V2 = "src/components/clothing/v2";
const sources = {
  page: read("src/app/clothing/page.tsx"),
  model: read(`${V2}/clothing-model.ts`),
  item: read(`${V2}/item-drawer.tsx`),
  kit: read(`${V2}/kit-drawer.tsx`),
  stock: read(`${V2}/stock-drawer.tsx`),
  group: read(`${V2}/group-drawer.tsx`),
  assignment: read(`${V2}/assignment-drawer.tsx`),
  assignmentEdit: read(`${V2}/assignment-edit-drawer.tsx`),
  delivery: read(`${V2}/kit-delivery-drawer.tsx`),
  del: read(`${V2}/delete-assignment-dialog.tsx`),
  catalog: read(`${V2}/catalog-grids.tsx`),
  inventory: read(`${V2}/inventory-grid.tsx`),
  assignments: read(`${V2}/assignments-grid.tsx`),
  orders: read(`${V2}/supplier-orders-grid.tsx`),
  numbering: read(`${V2}/numbering-area.tsx`),
};
const everything = Object.values(sources).join("\n");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ── Rimozione V1 ─────────────────────────────────────────────────────── */
test("la V1 e stata rimossa: nessun dialogo, nessuna tabella, nessun confirm", () => {
  assert.equal(existsSync(path.join(process.cwd(), "src/components/clothing/kit-delivery-dialog.tsx")), false, "il dialogo V1 delle consegne e sostituito dal cassetto");
  const code = senzaCommenti(everything);
  assert.doesNotMatch(code, /window\.confirm|\bconfirm\(/, "niente confirm nativo");
  assert.doesNotMatch(code, /@\/components\/ui\/(dialog|table|tabs|card|badge|command|popover|dropdown-menu|collapsible|select|input|label|textarea|button)"/, "solo le fondamenta di components/web");
  assert.doesNotMatch(code, /bg-gradient-to-|from-blue-600|bg-slate-50|text-slate-|border-emerald|bg-amber-50/, "nessun colore fuori dal sistema");
  assert.doesNotMatch(code, /className="hidden"/, "le tre viste a card morte della V1 non tornano");
  assert.doesNotMatch(sources.page, /<Tabs|TabsContent|MetricCard/, "le schede sono aree, non Tabs");
});

/* ── Guscio, aree, deep link ──────────────────────────────────────────── */
test("guscio V2 e sei aree in `?area=`", () => {
  assert.match(sources.page, /h-\[100dvh\] bg-egw-page/);
  assert.match(sources.page, /<Header title="Abbigliamento" \/>/);
  assert.match(sources.page, /<PageHeader/);
  assert.match(sources.page, /title="Abbigliamento e magazzino"/);
  assert.match(sources.page, /SegmentedControl<ClothingArea>/);
  assert.match(sources.page, /searchParams\.get\("area"\)/);
  assert.match(sources.page, /params\.set\("area", next\)/);
  assert.deepEqual(
    CLOTHING_AREAS.map((area) => area.value),
    ["kit", "articoli", "magazzino", "assegnazioni", "ordini", "numerazioni"],
  );
  assert.deepEqual(
    CLOTHING_AREAS.map((area) => area.label),
    ["Kit", "Articoli", "Magazzino", "Assegnazioni", "Ordini fornitore", "Numerazioni"],
  );
  assert.equal(isClothingArea("ordini"), true);
  assert.equal(isClothingArea("kit "), false);
  assert.match(sources.page, /searchParams\.get\("action"\) !== "new"/, "le azioni rapide aprono «Nuova assegnazione»");
});

test("le quattro metriche della V1 sono HeaderStat che portano all'area", () => {
  for (const label of ['label="articoli"', 'label="unità disponibili"', 'label="quantità disponibili"', 'label="ordini fornitore"']) {
    assert.ok(sources.page.includes(label), `manca la metrica ${label}`);
  }
  assert.match(sources.page, /inventorySummary/);
  assert.match(sources.page, /stock\.stockType === "single_unit" && stock\.status === "available"/);
  assert.match(sources.page, /total \+ \(stock\.quantityAvailable \|\| 0\)/);
});

/* ── Letture e scritture: stessi endpoint della V1 ────────────────────── */
test("le nove letture e le scritture per colonna sono quelle della V1", () => {
  for (const type of ["clothing_products", "clothing_kits", "clothing_inventory", "kit_assignments", "jersey_groups", "jersey_assignments", "categories", "club_sites"]) {
    assert.ok(sources.page.includes(`getClubData(activeClub.id, "${type}")`), `manca la lettura di ${type}`);
  }
  assert.match(sources.page, /getClubAthletes\(activeClub\.id\)/);
  assert.match(sources.page, /updateClubData\(activeClub\.id, field, value\)/);
  for (const write of ['saveClubJson("clothing_products"', 'saveClubJson("clothing_kits"', 'saveClubJson("clothing_inventory"', 'saveClubJson("jersey_groups"', 'saveClubJson("kit_assignments"', 'saveClubJson("jersey_assignments"']) {
    assert.ok(sources.page.includes(write), `manca la scrittura ${write}`);
  }
  assert.match(sources.page, /apiRequest<[\s\S]*?>\("\/api\/clothing\/assignments", \{\s*method: "POST"/, "la creazione passa dal server");
  assert.doesNotMatch(senzaCommenti(everything), /\bfetch\(/, "nessun fetch diretto");
  assert.doesNotMatch(everything, /@\/lib\/server\//, "nessun import del server da un componente client");
});

/* ── Permessi: gli stessi del server, elemento assente ────────────────── */
test("i predicati sono canAccessClubResource sulle sei risorse e nascondono, non disabilitano", () => {
  for (const resource of ["clothing_products", "clothing_kits", "clothing_inventory", "kit_assignments", "jersey_groups", "jersey_assignments"]) {
    assert.ok(new RegExp(`canAccessClubResource\\(role, "${resource}"`).test(sources.page), `manca il predicato su ${resource}`);
  }
  assert.match(sources.page, /canAccessClubResource\(role, "kit_assignments", "create"\)/, "la creazione e la stessa porta del server");
  for (const grid of ["catalog", "inventory", "assignments", "numbering"]) {
    assert.match(sources[grid], /hidden: \(\)? ?=> !canManage|hidden: \(row\) => !canManage/, `${grid}: le azioni negate sono assenti`);
  }
  assert.doesNotMatch(senzaCommenti(sources.inventory), /disabled=\{/, "«Assegna» non si disabilita: compare solo sullo stock assegnabile");
  assert.equal(isStockAssignable({ id: "u", stockType: "single_unit", itemId: "i", status: "reserved" }), false);
  assert.equal(isStockAssignable({ id: "b", stockType: "bulk_quantity", itemId: "i", quantityAvailable: 3 }), true);
});

/* ── Kit ──────────────────────────────────────────────────────────────── */
test("area Kit: griglia, modulo e validazioni", () => {
  assert.match(sources.catalog, /module="abbigliamento-kit"/);
  for (const header of ['header: "Nome kit"', 'header: "Componenti"', 'header: "Numerazione"', 'header: "Stato"']) assert.ok(sources.catalog.includes(header), header);
  assert.match(sources.catalog, /Nessun kit configurato/);
  assert.match(sources.kit, /label="Nome kit"/);
  assert.match(sources.kit, /label="Descrizione"/);
  assert.match(sources.kit, /label="Modalità numero"/);
  assert.match(sources.kit, /label="Gruppo numerazione"/);
  assert.match(sources.kit, /label="Articoli del kit"/);
  assert.match(sources.kit, /Nome kit obbligatorio/);
  assert.match(sources.kit, /Seleziona almeno un componente/);
  assert.match(sources.kit, /defaultSizeSource: "athlete", requiresNumberOverride: null, sharedKitNumber: true/, "ogni spunta aggiunge il componente come in V1");
  assert.match(sources.page, /numberingGroupId: form\.numberingGroupId \|\| null/);
  assert.match(sources.page, /Kit aggiornato\./);
  assert.deepEqual(emptyKitForm(), { name: "", description: "", numberingGroupId: "", numberMode: "shared_by_kit", components: [] });
});

/* ── Articoli ─────────────────────────────────────────────────────────── */
test("area Articoli: griglia, tredici campi e regole del numero", () => {
  assert.match(sources.catalog, /module="abbigliamento-articoli"/);
  for (const header of ['header: "Nome"', 'header: "Tipo"', 'header: "Codice"', 'header: "Taglie"', 'header: "Colori"', 'header: "Varianti"', 'header: "Requisiti"', 'header: "Stato"']) assert.ok(sources.catalog.includes(header), header);
  assert.match(sources.catalog, /Nessun articolo configurato/);
  for (const label of ['label="Nome"', 'label="Tipo"', 'label="Codice"', 'label="Descrizione"', 'label="Taglie"', 'label="Colori"', 'label="Varianti"', "Richiede taglia", "Richiede colore", "Richiede numero", 'label="Modalità numero"', 'label="Modalità stock"', `label="Taglia dall'anagrafica"`]) {
    assert.ok(sources.item.includes(label), `manca il campo ${label}`);
  }
  assert.match(sources.item, /numberMode: event\.target\.checked \? "per_item" : "none"/);
  assert.match(sources.item, /requiresNumber: value !== "none"/);
  assert.match(sources.item, /non modifica l'anagrafica/);
  assert.match(sources.page, /numberMode: form\.requiresNumber \? form\.numberMode : "none"/);
  assert.match(sources.page, /type: form\.type\.trim\(\) \|\| "articolo"/);
  assert.match(sources.page, /Nome articolo obbligatorio/);
  assert.match(sources.page, /Articolo aggiornato\./);
  assert.deepEqual(splitCsv(" S, M ,, L "), ["S", "M", "L"]);
  const form = emptyItemForm();
  assert.equal(form.type, "articolo");
  assert.equal(form.requiresSize, true);
  assert.equal(form.stockMode, "both");
  assert.equal(form.sizeSource, "none");
  const back = itemFormFrom({ id: "i1", name: "Maglia", type: "maglia", sizes: ["S", "M"], colors: [], variants: ["home"], requiresSize: true, requiresColor: false, requiresNumber: true, numberMode: "per_item", stockMode: "single_unit", sizeSource: "shirt", active: true });
  assert.equal(back.sizes, "S, M");
  assert.equal(back.variants, "home");
});

/* ── Magazzino ────────────────────────────────────────────────────────── */
test("area Magazzino: griglia, viste, «Assegna» precompilato e modulo stock", () => {
  assert.match(sources.inventory, /module="abbigliamento-magazzino"/);
  for (const header of ['header: "Articolo"', 'header: "Tipo stock"', 'header: "Taglia"', 'header: "Colore"', 'header: "Variante"', 'header: "Numero"', 'header: "Disponibile"', 'header: "Riservato"', 'header: "Assegnato"', 'header: "Stato"', 'header: "Atleta assegnato"']) {
    assert.ok(sources.inventory.includes(header), header);
  }
  assert.match(sources.inventory, /label: "Unità singole"/);
  assert.match(sources.inventory, /label: "Quantità"/);
  assert.match(sources.inventory, /Nessun magazzino registrato/);
  assert.match(sources.inventory, /label: "Assegna"/);
  assert.match(sources.inventory, /label: "Modifica"/);
  assert.match(sources.page, /assignmentFormFromStock\(stock\)/);
  const preset = assignmentFormFromStock({ id: "u1", stockType: "single_unit", itemId: "i1", size: "M", color: "blu", variant: "", number: 7, numberingGroupId: "g1", status: "available" });
  assert.equal(preset.targetType, "item");
  assert.equal(preset.itemId, "i1");
  assert.equal(preset.source, "inventory");
  assert.equal(preset.status, "reserved");
  assert.equal(preset.athleteId, "", "l'atleta si sceglie nel modulo");
  assert.deepEqual(preset.components.i1, { itemId: "i1", inventoryStockId: "u1", size: "M", color: "blu", variant: "", number: 7, numberingGroupId: "g1" });
  for (const label of ['label="Tipo magazzino"', 'label="Articolo"', 'label="Taglia"', 'label="Colore"', 'label="Variante"', 'label="Numero"', 'label="Gruppo numerazione"', 'label="Stato"', 'label="Quantità disponibile"', 'label="Note"']) {
    assert.ok(sources.stock.includes(label), `manca il campo ${label}`);
  }
  assert.match(sources.stock, /Seleziona un articolo/);
  assert.match(sources.page, /quantityReserved: existing\?\.quantityReserved \|\| 0/, "in modifica si conservano riservato/assegnato/atleta");
  assert.match(sources.page, /Magazzino aggiornato\./);
  assert.match(sources.page, /Aggiungi quantità/);
  assert.match(sources.page, /Aggiungi unità/);
  assert.equal(emptyStockForm().quantityAvailable, "1");
  assert.equal(stockFormFrom({ id: "u", stockType: "single_unit", itemId: "i", number: 0 }).number, "0");
  assert.equal(inventoryStatusSpec({ stockType: "bulk_quantity" }), BULK_STOCK_STATUS);
  assert.equal(inventoryStatusSpec({ stockType: "single_unit", status: "lost" }).label, "SMARRITO");
});

/* ── Assegnazioni ─────────────────────────────────────────────────────── */
test("area Assegnazioni: griglia, quattro azioni di riga, cassetto di creazione", () => {
  assert.match(sources.assignments, /module="abbigliamento-assegnazioni"/);
  for (const header of ['header: "Atleta"', 'header: "Data"', 'header: "Categoria"', 'header: "Kit/Articoli"', 'header: "Origine"', 'header: "Stato"', 'header: "Numero"']) assert.ok(sources.assignments.includes(header), header);
  assert.match(sources.page, /assignment\.assigneeType === "athlete"/);
  assert.match(sources.assignments, /defaultSort=\{\{ columnId: "date", direction: "desc" \}\}/);
  for (const action of ['label: "Consegne del kit"', 'label: "Modifica assegnazione"', 'label: "Cambia stato"', 'label: "Elimina assegnazione"']) assert.ok(sources.assignments.includes(action), action);
  assert.match(sources.assignments, /hidden: \(row\) => !canManage \|\| !row\.items\.length/, "«Consegne» solo con articoli");
  assert.match(sources.assignments, /Nessuna assegnazione registrata/);

  for (const label of ['label="Atleta"', 'label="Origine"', 'label="Tipo"', 'label="Kit"', 'label="Articolo"', 'label="Stato iniziale"', 'label="Gruppo numerazione"', 'label="Numero condiviso kit"', 'label="Note"', 'label="Stock compatibile"', 'label="Taglia"', 'label="Colore"', 'label="Variante"', 'label="Numero"']) {
    assert.ok(sources.assignment.includes(label), `manca il campo ${label}`);
  }
  for (const option of ["Da magazzino", "Da ordinare/personalizzare", "Kit completo", "Singolo articolo", "Riservato", "Assegnato", "Consegnato"]) assert.ok(sources.assignment.includes(option), option);
  assert.match(sources.assignment, /status: value === "supplier_order" \? "to_order"/, "origine fornitore → da ordinare");
  assert.match(sources.assignment, /kit\.active/, "si assegnano i kit attivi");
  assert.match(sources.assignment, /item\.active/, "si assegnano gli articoli attivi");
  assert.match(sources.assignment, /Taglie suggerite/);
  assert.match(sources.assignment, /Nessuno stock disponibile compatibile/);
  assert.match(sources.assignment, /occupato/);
  assert.match(sources.assignment, /Seleziona un atleta/);
  assert.match(sources.assignment, /Seleziona kit o articolo/);
  assert.match(sources.assignment, /Conferma assegnazione/);
  assert.match(sources.assignment, /getAvailableInventoryForItem|getAvailableNumbersForGroup|canAssignNumber/);
  assert.match(sources.page, /Assegnazione creata/);
  const form = emptyAssignmentForm();
  assert.equal(form.targetType, "kit");
  assert.equal(form.source, "inventory");
  assert.equal(form.status, "reserved");
});

test("modifica, cambio di stato e consegne dell'assegnazione", () => {
  for (const label of ['label="Atleta"', 'label="Stato"', 'label="Data assegnazione"', 'label="Note"']) assert.ok(sources.assignmentEdit.includes(label), label);
  assert.match(sources.assignmentEdit, /Salva modifiche/);
  assert.match(sources.assignmentEdit, /Aggiorna stato/);
  assert.deepEqual(ASSIGNMENT_ACTION_STATUSES, ["reserved", "assigned", "delivered", "cancelled"]);
  assert.match(sources.page, /assignment\.status !== form\.status\s*\? updateClothingAssignmentStatus/, "il cambio di stato muove il magazzino");
  assert.match(sources.page, /items: entry\.items\.map\(\(item\) => \(\{ \.\.\.item, status: form\.status \}\)\)/);
  assert.match(sources.page, /T12:00:00\.000Z/);
  assert.match(sources.page, /Assegnazione aggiornata\./);
  assert.match(sources.page, /Stato aggiornato\./);
  assert.match(sources.page, /Consegne aggiornate/);
  assert.match(sources.delivery, /Salva consegne/);
  assert.match(sources.delivery, /setAssignmentItemState/);
  assert.equal(dateInputValue("2026-03-01T23:30:00.000Z").length, 10);
  assert.equal(dateInputValue(""), "");
});

test("eliminazione: DangerConfirmDialog e lo stock torna disponibile", () => {
  assert.match(sources.del, /DangerConfirmDialog/);
  assert.match(sources.del, /Eliminare questa assegnazione e liberare lo stock collegato\?/);
  assert.match(sources.del, /I numeri di maglia legati a questa assegnazione vengono liberati/);
  assert.match(sources.page, /status: "available" as InventoryUnitStatus, athleteId: null, assignmentId: null/);
  assert.match(sources.page, /quantityAvailable: Math\.max\(0, Number\(stock\.quantityAvailable \|\| 0\)\) \+ quantity/);
  assert.match(sources.page, /entry\.assignmentId !== assignment\.id/);
  assert.match(sources.page, /Assegnazione rimossa\./);
});

/* ── Ordini fornitore ─────────────────────────────────────────────────── */
test("area Ordini fornitore: righe derivate, filtro fornitore, tre ambiti PDF", () => {
  assert.match(sources.orders, /module="abbigliamento-ordini"/);
  for (const header of ['header: "Articolo"', 'header: "Tipo"', 'header: "Taglia"', 'header: "Colore"', 'header: "Variante"', 'header: "Numero"', 'header: "Quantità"', 'header: "Fornitore"', 'header: "Note"', 'header: "Stato"', 'header: "Atleta"']) {
    assert.ok(sources.orders.includes(header), header);
  }
  assert.match(sources.orders, /"Ordine completo"/);
  assert.match(sources.orders, /"Articoli selezionati"/);
  assert.match(sources.orders, /"Articolo singolo"/);
  assert.match(sources.orders, /kinds: \["pdf"\]/, "la V1 non aveva CSV: non si inventa");
  assert.match(sources.orders, /label: "Esporta selezionati PDF"/);
  assert.match(sources.orders, /id: "supplier",[\s\S]*?pinned: true/);
  assert.match(sources.orders, /Nessun ordine fornitore/);
  assert.match(sources.page, /printSupplierOrderPdf\(\{/);
  assert.match(sources.page, /supplierLabel: supplierFilter \|\| undefined/);
  assert.match(sources.page, /Non ci sono righe da esportare\./);
  assert.match(sources.page, /Consenti i popup per generare la stampa PDF\./);
  assert.match(sources.page, /si apre la finestra di stampa dell'ordine fornitore\./);

  const supplier = normalizeClothingAssignment({ id: "a1", athleteId: "x", source: "supplier_order", status: "to_order", createdAt: "2026-01-01", supplier: "Kappa", items: [{ id: "r1", itemId: "i1", name: "Maglia", quantity: 2, status: "to_order" }] });
  const inventoryOne = normalizeClothingAssignment({ id: "a2", athleteId: "x", source: "inventory", status: "reserved", createdAt: "2026-01-02", items: [] });
  assert.equal(isSupplierAssignment(supplier), true);
  assert.equal(isSupplierAssignment(inventoryOne), false);
  const rows = buildSupplierOrderRows({ assignments: [supplier], athletesById: new Map(), itemById: new Map(), stockById: new Map() });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "a1:r1");
  assert.equal(rows[0].quantity, 2);
  assert.equal(rows[0].supplier, "Kappa");
  assert.equal(rows[0].status, "Da ordinare");
  assert.equal(supplierLabel(inventoryOne, { id: "r", itemId: "i", name: "n", source: "inventory", quantity: 1, status: "reserved" }), "Non indicato");
});

/* ── Numerazioni ──────────────────────────────────────────────────────── */
test("area Numerazioni: gruppi con riepilogo, atleti con numero manuale, random, rimuovi, modulo gruppo", () => {
  assert.match(sources.numbering, /module="abbigliamento-numerazioni"/);
  assert.match(sources.numbering, /module="abbigliamento-numerazione-atleti"/);
  for (const header of ['header: "Gruppo"', 'header: "Categorie"', 'header: "Atleti"', 'header: "Numeri usati"', 'header: "Senza numero"', 'header: "Duplicati"', 'header: "Atleta"', 'header: "Numeri"', 'header: "Numero manuale"']) {
    assert.ok(sources.numbering.includes(header), header);
  }
  assert.match(sources.numbering, /Numeri duplicati:/);
  assert.match(sources.numbering, /Tutte le categorie/);
  assert.match(sources.numbering, /Fuori gruppo/);
  assert.match(sources.numbering, /CATEGORY_ELIGIBILITY_LABELS\[row\.membership\]/);
  assert.match(sources.numbering, /record\.source === "jersey_assignment" && !record\.assignmentId/, "il record manuale non e quello di un kit");
  assert.match(sources.numbering, /onBlur=/);
  assert.match(sources.numbering, /event\.key === "Enter"/);
  assert.match(sources.numbering, /label: "Numero casuale"[\s\S]*?hidden: \(row\) => !canManage \|\| row\.hasNumber/);
  assert.match(sources.numbering, /label: "Rimuovi numero manuale"[\s\S]*?hidden: \(row\) => !canManage \|\| !manualRecordOf\(row\)/);
  assert.match(sources.numbering, /Nessun gruppo numerazione configurato/);
  assert.match(sources.numbering, /Nessun atleta collegato al gruppo/);
  assert.match(sources.page, /Numero fuori intervallo \$\{group\.minNumber\}-\$\{group\.maxNumber\}/);
  assert.match(sources.page, /Gruppo numerazione non trovato/);
  assert.match(sources.page, /`jersey:\$\{athleteId\}:\$\{groupId\}`/);
  assert.match(sources.page, /Nessun numero disponibile/);
  assert.match(sources.page, /Numero rimosso\./);
  assert.match(sources.page, /Numero salvato\./);

  for (const label of ['label="Nome gruppo"', 'label="Stagione"', 'label="Numero minimo"', 'label="Numero massimo"', 'label="Categorie"', 'label="Sedi del gruppo"', "Includi le categorie compatibili"]) {
    assert.ok(sources.group.includes(label), `manca il campo ${label}`);
  }
  assert.match(sources.group, /isMultiSiteClub\(sites\)/, "le sedi solo per il club multi-sede");
  assert.match(sources.group, /Nessuna sede selezionata significa «tutte»/);
  assert.match(sources.group, /Nome gruppo obbligatorio/);
  assert.match(sources.group, /Intervallo numeri non valido/);
  assert.match(sources.page, /Gruppo numerazione aggiornato\./);
  const group = emptyNumberingGroup();
  assert.equal(group.minNumber, 0);
  assert.equal(group.maxNumber, 99);
  assert.equal(group.includeCompatibleCategories, false);
  assert.deepEqual(group.siteIds, []);
});

/* ── Stati: una parola, dal sistema o dalla spec locale ───────────────── */
test("ogni etichetta di stato della V1 ha una StatusSpec", () => {
  for (const [key, label] of Object.entries(assignmentStatusLabels)) {
    assert.equal(ASSIGNMENT_STATUS[key].label, label.toUpperCase(), key);
  }
  for (const [key, label] of Object.entries(inventoryStatusLabels)) {
    assert.equal(INVENTORY_STATUS[key].label, label.toUpperCase(), key);
  }
  for (const [key, label] of Object.entries(KIT_DELIVERY_STATE_LABELS)) {
    assert.equal(KIT_DELIVERY_STATUS[key].label, label.toUpperCase(), key);
  }
  for (const [key, label] of Object.entries(CLOTHING_ITEM_STATE_LABELS)) {
    assert.equal(ITEM_STATE_STATUS[key].label, label.toUpperCase(), key);
  }
  assert.equal(CATALOG_STATUS.active.label, "ATTIVO");
  assert.equal(CATALOG_STATUS.inactive.label, "NON ATTIVO");
  for (const spec of [...Object.values(ASSIGNMENT_STATUS), ...Object.values(INVENTORY_STATUS), BULK_STOCK_STATUS]) {
    assert.ok(["quiet", "outline", "solid", "urgent"].includes(spec.weight));
    assert.ok(["neutral", "green", "amber", "red", "blue", "orange"].includes(spec.hue));
  }
  assert.doesNotMatch(senzaCommenti(everything), /<Badge/, "lo stato e una StatusPill");
});

/* ── Regole di forma del sistema ──────────────────────────────────────── */
test("cassetti per creare e modificare, un solo modale, niente emoji ne punti esclamativi", () => {
  for (const drawer of ["item", "kit", "stock", "group", "assignment", "assignmentEdit", "delivery"]) {
    assert.match(sources[drawer], /<Drawer\b/, `${drawer} e un cassetto`);
    assert.match(sources[drawer], /dirty=\{/, `${drawer} accende la guardia`);
    assert.match(sources[drawer], /FieldSizeProvider size="sm"/, `${drawer} usa i campi da cassetto`);
  }
  assert.match(sources.item, /width="wide"/);
  assert.match(sources.assignment, /width="wide"/);
  assert.match(sources.stock, /width="wide"/);
  assert.doesNotMatch(senzaCommenti(everything), /[a-zà-ü]!(?=["'`<»\s])|[\u{1F300}-\u{1FAFF}]/iu, "niente punti esclamativi ne emoji nei testi");
  const grids = senzaCommenti([sources.catalog, sources.inventory, sources.assignments, sources.orders, sources.numbering].join("\n"));
  assert.doesNotMatch(grids, /<table|<Table/, "ogni elenco e il DataGrid");
  assert.doesNotMatch(senzaCommenti(everything), /(?<![a-z:-])grid-cols-[234]\b/, "nessuna griglia a colonne fisse senza breakpoint");
});
