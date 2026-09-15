# Wave E — Audit di parità: Abbigliamento e magazzino

> Inventario funzionale dell'implementazione V1 sul branch `feat/web-redesign`,
> scritto **prima** della migrazione al Web V2 (Addendum del brief). È il
> contratto di parità: niente sparisce. Nessuna proposta di design.
>
> Rotta coperta: `/clothing` (nessuna sotto-rotta). File:
> `src/app/clothing/page.tsx` (4428 righe, una sola pagina a sei schede),
> `src/app/clothing/layout.tsx` (porta verso `management-area-layout`),
> `src/components/clothing/kit-delivery-dialog.tsx` (327). Librerie del
> dominio lette per capire cosa la pagina accetta e rifiuta:
> `src/lib/clothing-inventory-utils.ts` (modello, normalizzazione,
> serializzazione, disponibilità, numeri, `createClothingAssignment`,
> `updateClothingAssignmentStatus`, etichette), `src/lib/clothing-delivery.ts`
> (stato per articolo, stato del kit derivato, taglia proposta),
> `src/lib/jersey-numbering-utils.ts` (riepiloghi dei gruppi),
> `src/lib/clothing-supplier-order-pdf.ts` (stampa ordine), l'endpoint
> `src/app/api/clothing/assignments/route.ts`; i test collegati.
>
> Metodo: lettura integrale della pagina e del dialogo, delle librerie
> importate e dei test che li citano (`grep -rl` su `tests/`).

---

## Indice

1. [Guscio, intestazione e metriche](#guscio-intestazione-e-metriche)
2. [Letture e scritture (dati)](#letture-e-scritture-dati)
3. [Scheda Kit](#scheda-kit)
4. [Scheda Articoli](#scheda-articoli)
5. [Scheda Magazzino](#scheda-magazzino)
6. [Scheda Assegnazioni](#scheda-assegnazioni)
7. [Scheda Ordini fornitore](#scheda-ordini-fornitore)
8. [Scheda Numerazioni](#scheda-numerazioni)
9. [Dialogo Consegne del kit](#dialogo-consegne-del-kit)
10. [Permessi](#permessi)
11. [Stati ed etichette](#stati-ed-etichette)
12. [Navigazione e parametri](#navigazione-e-parametri)
13. [Test collegati](#test-collegati)
14. [Inventario componenti](#inventario-componenti)
15. [Difetti della V1 (GAP dichiarabili)](#difetti-della-v1)
16. [Sintesi](#sintesi)

---

## Guscio, intestazione e metriche

`Sidebar` + `Header title="Abbigliamento"` + `main` (`dashboardMainClassName`)
+ `DashboardPageContainer`, radice `flex h-[100dvh] bg-slate-50`.

Intestazione fatta in casa: `h1` **in gradiente** («Abbigliamento e
magazzino», `bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text`) +
paragrafo «Gestisci kit, unità fisiche, quantità generiche, numeri e richieste
al fornitore.» + a destra il pulsante primario **Nuova assegnazione**
(`Plus`, blu) che apre il dialogo omonimo (§6).

**Quattro `MetricCard`** (`grid md:grid-cols-4`): **Articoli**
(`state.items.length`, icona `Shirt`), **Unità disponibili** (unità singole
con `status === "available"`, `Boxes`), **Quantità disponibili** (somma di
`quantityAvailable` su tutto il magazzino, `PackagePlus`), **Ordini
fornitore** (`supplierAssignments.length`, `Truck`). Non sono cliccabili.

**Loading**: la pagina si monta subito con gli elenchi vuoti; mentre carica
mostra un pill fisso in basso «Caricamento magazzino...» (`AlertCircle`).
**Errore di caricamento**: toast «Errore» / `error.message` || «Impossibile
caricare abbigliamento»; gli elenchi restano vuoti (indistinguibili
dall'empty).

### 11. Schede

`Tabs defaultValue="kit"`, `TabsList grid-cols-2 lg:grid-cols-6`, sei
trigger in quest'ordine: **Kit · Articoli · Magazzino · Assegnazioni ·
Ordini fornitore · Numerazioni**. **Nessun parametro URL**: la scheda non
sopravvive a un ricaricamento e non ha deep link.

---

## Letture e scritture (dati)

`loadData` (su `activeClub.id` + `user`), un `Promise.all` di nove letture
via `simplified-db` (import dinamico):

| Lettura | Funzione | Colonna `clubs` |
|---|---|---|
| Articoli | `getClubData(id, "clothing_products")` | `clothing_products` |
| Kit | `getClubData(id, "clothing_kits")` | `clothing_kits` |
| Magazzino | `getClubData(id, "clothing_inventory")` | `clothing_inventory` |
| Assegnazioni | `getClubData(id, "kit_assignments")` | `kit_assignments` (stagionale) |
| Gruppi numerazione | `getClubData(id, "jersey_groups")` | `jersey_groups` |
| Numeri di maglia | `getClubData(id, "jersey_assignments")` | `jersey_assignments` |
| Categorie | `getClubData(id, "categories")` | `categories` |
| Sedi | `getClubData(id, "club_sites")` | `club_sites` |
| Atleti | `getClubAthletes(id)` | `athletes` |

Normalizzazione: `normalizeClubClothingState({products, kits, inventory,
assignments, jerseyGroups, jerseyAssignments})` → `ClothingState {items,
kits, inventory, assignments, numberingGroups, jerseyAssignments}`; atleti
ordinati con `compareAthletesByLastName`; `normalizeClubSites`;
`buildClubCategoryOptions({clubCategories, athletes})`.

**Scritture.** Tutte tranne una passano da `saveClubJson(field, value)` =
`updateClubData(activeClub.id, field, value)` (`simplified-db`, che
riscrive la colonna intera e, per `kit_assignments`, applica la stagione
attiva). L'eccezione è la **creazione di un'assegnazione**: `apiRequest
("/api/clothing/assignments", { method: "POST", body })` — il server
(`canAccessClubResource(role, "kit_assignments", "create")`, atleta del
club, `createClothingAssignment`, `replaceClubResourceCollections` su
magazzino + assegnazioni + numeri in una transazione) restituisce
`{assignment, inventory, assignments, jerseyAssignments}` e la pagina
ricompone lo stato con `normalizeClubClothingState`.

| Azione | Colonne scritte |
|---|---|
| Salva articolo | `clothing_products` |
| Salva kit | `clothing_kits` |
| Salva stock | `clothing_inventory` |
| Salva gruppo | `jersey_groups` |
| Crea assegnazione | (server) `clothing_inventory`, `kit_assignments`, `jersey_assignments` |
| Salva consegne | `kit_assignments` |
| Cambia stato assegnazione | `kit_assignments`, `clothing_inventory` (via `updateClothingAssignmentStatus`) |
| Modifica assegnazione | `kit_assignments`, `clothing_inventory`, `jersey_assignments` |
| Elimina assegnazione | `kit_assignments`, `clothing_inventory`, `jersey_assignments` |
| Numero manuale / random / rimuovi | `jersey_assignments` |

Le scritture in sequenza (tre `saveClubJson` di fila) **non sono
atomiche**: se la seconda fallisce, la prima resta scritta. Difetto V1 non
in scope.

Identificativi: `newId(prefix)` = `crypto.randomUUID()` (o
`${prefix}-${Date.now()}`), prefissi `item`, `kit`, `unit`/`bulk`,
`group`; numero manuale `jersey:${athleteId}:${groupId}`.

---

## Scheda Kit

Card «Kit» / «Kit composti da più componenti.»; pulsante **+ Kit** (apre il
dialogo con `emptyKitForm`).

### 1. Dati mostrati

Tabella (`Table` ui): **Nome kit** (+ riga `description || "Nessuna
descrizione"`), **Componenti** (nomi dei componenti `component.name ||
itemById.get(itemId)?.name || itemId`, separati da virgola, `"-"` se vuoto),
**Numerazione** («Numero condiviso» / «Numero per articolo» / «Senza
numero» da `numberMode`), **Stato** (`Badge outline` «Attivo» / «Non
attivo» da `kit.active`), **Azioni** (**Modifica**). Ordine alfabetico
fisso (`sortByName`). Una vista a card più vecchia è ancora renderizzata con
`className="hidden"` (codice morto).

### 2. Azioni

**+ Kit**, **Modifica** (per riga: precompila `KitForm`). Nessuna
eliminazione, nessuna disattivazione (il salvataggio forza `active: true`).

### 3. Form «Kit» (dialogo, `max-h-[90vh]`)

| Campo | Controllo | Valore iniziale | Validazione |
|---|---|---|---|
| Nome kit | `Input` (solo placeholder) | `""` | obbligatorio → «Nome kit obbligatorio» |
| Descrizione | `Textarea` | `""` | — |
| Numerazione | `Select`: Nessun numero (`none`) · Numero condiviso (`shared_by_kit`) · Numero per articolo (`per_item`) | `shared_by_kit` | — |
| Gruppo numerazione | `Select` sui gruppi ordinati (placeholder «Gruppo numerazione») | `""` | facoltativo → `null` |
| Componenti | elenco di checkbox su **tutti** gli articoli (`sortedCatalogItems`), badge «incluso»; ogni spunta aggiunge `{itemId, name, required: true, defaultSizeSource: "athlete", requiresNumberOverride: null, sharedKitNumber: true}` | `[]` | almeno uno → «Seleziona almeno un componente» |

**Non c'è** stagione (tolta: `clothing_kits` non è stagionale) né
compatibilità di categoria (fissato da `clothing-delivery-ux.test.mjs`).

Salvataggio: `nextKit = {id: id || newId("kit"), name.trim(),
description.trim(), numberingGroupId || null, numberMode, components,
active: true}` → sostituisce o accoda → `saveClubJson("clothing_kits",
next.map(serializeClothingKit))` → toast «Salvato · Kit aggiornato.» /
«Errore · {msg || Impossibile salvare kit}». Pulsanti **Annulla** / **Salva**.

### 4. Filtri / ricerca

Ricerca condivisa con la scheda Articoli (`catalogSearch`, campo però
presente **solo** nella scheda Articoli): su nome, descrizione, nomi dei
componenti. Nessun filtro, nessuna vista.

### 5–6. Massa / export

Nessuna selezione, nessuna azione di massa, nessuna esportazione.

### 8. Stati

Vuoto: riga «Nessun kit configurato.» (`colSpan=6`).

---

## Scheda Articoli

Card «Articoli» / «Catalogo configurabile con taglie, colori e numeri.»;
pulsante **+ Articolo** (`emptyItemForm`). Campo di ricerca «Cerca articolo,
codice, taglia...» (`max-w-md`).

### 1. Dati mostrati

Tabella: **Nome**, **Tipo**, **Codice**, **Taglie** (`join(", ")`),
**Colori**, **Varianti**, **Requisiti** (badge `taglia` / `colore` /
`numero` per `requiresSize|Color|Number`), **Stato** (`Badge outline`
«Attivo» / «Non attivo»), **Azioni** (**Modifica**). Alfabetico fisso.
Vista a card morta (`hidden`).

### 2. Azioni

**+ Articolo**, **Modifica**. Nessuna eliminazione né disattivazione (il
salvataggio forza `active: true`).

### 3. Form «Articolo» (dialogo, `max-h-[90vh]`)

| Campo | Controllo | Valore iniziale | Validazione / effetto |
|---|---|---|---|
| Nome | `Input` placeholder «Nome» | `""` | obbligatorio → «Nome articolo obbligatorio» |
| Tipo | `Input` «Tipo» | `"articolo"` | vuoto → `"articolo"`. Serve al ripiego della taglia (`resolveItemSizeSource`: scarpe / pantaloni / maglia dal testo) |
| Codice | `Input` «Codice» | `""` | — |
| Descrizione | `Textarea` | `""` | — |
| Taglie | `Input` «Taglie separate da virgola» | `""` | `splitCsv` |
| Colori | `Input` «Colori separati da virgola» | `""` | `splitCsv` |
| Varianti | `Input` «Varianti separate da virgola» | `""` | `splitCsv` |
| Richiede taglia | checkbox | `true` | — |
| Richiede colore | checkbox | `false` | — |
| Richiede numero | checkbox | `false` | spuntare → `numberMode = "per_item"`, togliere → `"none"` |
| Modalità numero | `Select`: Nessun numero · Condiviso nel kit · Numero per articolo | `"none"` | scegliere ≠ none → `requiresNumber = true`; al salvataggio `numberMode = requiresNumber ? numberMode : "none"` |
| Modalità stock | `Select`: Unità singola · Quantità generica · Entrambi | `"both"` | — |
| Taglia dall'anagrafica | `Select id="item-size-source"`: Deduci dal tipo (`none`) · Taglia maglia (`shirt`) · Taglia pantaloni (`pants`) · Numero di scarpe (`shoes`); nota «Quale taglia proporre in assegnazione. La proposta si puo sempre sovrascrivere e non modifica l'anagrafica.» | `"none"` | — |

Salvataggio: `saveClubJson("clothing_products", next.map(serializeClothingItem))`,
toast «Salvato · Articolo aggiornato.» / «Errore · … Impossibile salvare
articolo». **Annulla** / **Salva**.

### 4. Ricerca

`catalogSearch` su nome, tipo, codice, taglie, colori, varianti. Nessun
filtro né vista.

### 8. Stati

Vuoto: «Nessun articolo configurato.»

---

## Scheda Magazzino

Card «Magazzino» / «Unità fisiche numerate e quantità generiche.». In
testa: `Select` filtro **Tutto · Unità singole · Quantità**
(`inventoryFilter`), pulsante **+ Unità** (outline: apre il dialogo con
`stockType: "single_unit"`), pulsante **+ Quantità** (primario blu:
`"bulk_quantity"`). Campo di ricerca «Cerca articolo, taglia, colore,
atleta...».

### 1. Dati mostrati

Tabella: **Articolo** (nome `|| stock.itemId`, sotto il tipo), **Tipo
stock** («Quantita» / «Unita singola»), **Taglia**, **Colore**, **Variante**,
**Numero**, **Disponibile** (`quantityAvailable || 0`), **Riservato**,
**Assegnato**, **Stato** (badge: «Quantita» per il bulk, altrimenti
`inventoryStatusLabels[status]`), **Atleta assegnato** (nome o `-`),
**Azioni**. Ordine di inserimento. Vista a card morta (`hidden`).

### 2. Azioni per riga

- **Assegna** — `disabled` se unità non `available` o quantità ≤ 0. Apre
  «Nuova assegnazione» precompilata: `targetType: "item"`, `itemId`,
  `source: "inventory"`, `status: "reserved"`, `numberingGroupId`,
  `components[itemId] = {inventoryStockId, size, color, variant, number,
  numberingGroupId}` (**senza** atleta: va scelto nel dialogo).
- **Modifica** — precompila `StockForm`.

Nessuna eliminazione di stock.

### 3. Form «Aggiungi magazzino» / «Modifica magazzino»

| Campo | Controllo | Iniziale | Note |
|---|---|---|---|
| Tipo magazzino | `Select`: Unità singola · Quantità generica | dal pulsante | cambia i campi sotto |
| Articolo | `Select` su `sortedCatalogItems` | `""` | obbligatorio → «Seleziona un articolo» |
| Taglia · Colore · Variante | tre `Input` liberi (placeholder) | `""` | testo libero, **non** vincolati alle liste dell'articolo |
| (solo unità) Numero | `Input number` | `""` | `""` → `null` |
| (solo unità) Gruppo | `Select` gruppi | `""` | → `null` |
| (solo unità) Stato | `Select` su `inventoryStatusLabels` (7 voci) | `available` | per il bulk sempre `available` |
| (solo quantità) Quantità disponibile | `Input number min=0` | `"1"` | `Math.max(0, Number)` |
| Note | `Textarea` | `""` | — |

In modifica conserva `quantityReserved`, `quantityAssigned`, `athleteId`,
`assignmentId` dell'esistente. `saveClubJson("clothing_inventory", …)`,
toast «Salvato · Magazzino aggiornato.» / «Impossibile salvare stock».

### 4. Filtri / ricerca

Filtro tipo stock (select) + ricerca su nome/tipo/codice articolo, taglia,
colore, variante, numero, note, nome dell'atleta assegnato.

### 8. Stati

Vuoto (anche filtrato): «Nessun magazzino registrato.»

---

## Scheda Assegnazioni

Card «Assegnazioni» / «Kit e articoli assegnati, riservati o da ordinare.»;
ricerca «Cerca atleta, categoria, articolo...» (`assignmentSearch`,
**condivisa** con la ricerca atleta nel dialogo di creazione: lo stesso
stato React).

### 1. Dati mostrati

Solo `assigneeType === "athlete"`, ordinate per `createdAt` decrescente.
Tabella `min-w-[1120px]`: **Data** (`toLocaleDateString("it-IT")`, `-`),
**Atleta** (`getAthleteDisplayName || id`), **Categoria**
(`category_name | data.categoryName | data.category | category | "Senza
categoria"`), **Kit/Articoli** (`kitName || "Articoli"` + un badge per
`item.name`), **Origine** (Magazzino / Fornitore / Manuale), **Stato**
(`KitDeliveryStateBadge` se ha articoli — etichetta del kit derivato +
riga `2/4 consegnati · 1 non disponibile` — altrimenti badge
`assignmentStatusLabels[status]`), **Numero** (un badge per articolo:
`n.{label}` o «Senza numero», da `getAssignmentNumberLabel`), **Azioni**.

### 2. Azioni per riga (icone `ghost h-8 w-8`)

- **Consegne del kit** (`PackageCheck`, `disabled` senza articoli) → apre
  `KitDeliveryDialog` (§9).
- **Modifica assegnazione** (`Pencil`) → dialogo «Modifica assegnazione».
- **Cambia stato** (`RefreshCw`, dropdown): Riservato · Assegnato ·
  Consegnato · Annullato (`assignmentActionStatuses`), la voce corrente
  `disabled` → `updateAssignmentStatus` (§ sotto).
- **Elimina assegnazione** (`Trash2`, rosso) → `window.confirm("Eliminare
  questa assegnazione e liberare lo stock collegato?")`.

### 3a. Form «Nuova assegnazione» (dialogo `max-w-5xl max-h-[92vh]`)

Stato `AssignmentForm` = `{athleteId: "", targetType: "kit", kitId: "",
itemId: "", source: "inventory", status: "reserved", numberingGroupId: "",
sharedNumber: "", components: {}, notes: ""}`. Aprendo dal primario si
azzera anche `assignmentSearch`.

| Campo | Controllo | Effetti |
|---|---|---|
| Atleta | combobox `Popover`+`Command` con ricerca «Cerca atleta o categoria...», righe nome + categoria, «Nessun atleta trovato.» | scelta → azzera `kitId`, `itemId`, `sharedNumber`, `components`. Sotto: «Taglie suggerite: {shirt / pants / shoe / …}» o «nessuna taglia salvata» |
| Origine | `Select`: Da magazzino (`inventory`) · Da ordinare/personalizzare (`supplier_order`) | `supplier_order` → `status = "to_order"` |
| Tipo | `Select`: Kit completo · Singolo articolo | azzera kit/articolo/componenti |
| Kit *(se tipo=kit)* | `Select` sui kit **attivi** | eredita `numberingGroupId` del kit; azzera componenti |
| Articolo *(se tipo=item)* | `Select` sugli articoli attivi | azzera componenti |
| Stato iniziale | `Select`: Riservato · Assegnato · Consegnato; **disabled** se origine fornitore | — |
| Gruppo numerazione | `Select` gruppi | — |
| Numero condiviso kit *(solo `kit.numberMode === "shared_by_kit"`)* | `Select` su `getAvailableNumbersForGroup({groupId, state, athleteId})`, voci occupate `disabled` con «{n} occupato da {atleta}» | — |
| Note | `Input` | — |

**Componenti** (uno per articolo del kit, o l'articolo singolo;
«Seleziona un kit o un articolo.» se nessuno): per ogni articolo un blocco
con nome, «Numero richiesto» / «Senza numero», badge rosso con
`canAssignNumber().reason` se il numero scelto non va. Poi:
- se origine **magazzino**: `Select` **Stock compatibile** su
  `getAvailableInventoryForItem({item, inventory, size:
  sizeDescription.size, color, variant})` (etichetta `stockLabel`); scegliere
  copia taglia/colore/variante/numero/gruppo dallo stock. Se vuoto: «Nessuno
  stock disponibile compatibile. Usa “Da ordinare” per creare una richiesta
  fornitore.»
- se origine **fornitore**: **Taglia** (`Select` su `item.sizes` o
  `["Unica"]`, valore `sizeDescription.size` = scelta o proposta
  dall'anagrafica; nota «Proposta dall'anagrafica: M» oppure «Anagrafica: M —
  assegnata a mano, l'anagrafica non cambia»), **Colore** (`item.colors` o
  `["Standard"]`), **Variante** (`item.variants` o `["Standard"]`),
  **Numero** (solo se `requiresNumber` e il kit non è `shared_by_kit`;
  `Select` sui numeri disponibili del gruppo del componente o del form).

La proposta di taglia è `proposedSizeByItemId` (`useMemo`:
`proposeSizeForItem({sizes: getAthleteClothingProfile(atleta).sizes, item})`
per ogni articolo) e **non scrive mai l'anagrafica**
(`clothing-delivery-ux.test.mjs`).

**Riepilogo** (`InsetBlock` grigio): «{atleta | Nessun atleta} - {kit |
articolo | nessun articolo} - {da magazzino | da ordinare}».

Pulsanti **Annulla** / **Conferma assegnazione**. Validazione client:
`activeClub` → «Club non trovato»; `athleteId` → «Seleziona un atleta»;
componenti vuoti → «Seleziona kit o articolo». Il payload `components` è
`{...draft, itemId, size: draft.size || proposedSizeByItemId[item.id] || ""}`.
Server (`createClothingAssignment`): rifiuta magazzino non disponibile
(«Unità di magazzino non disponibile», «Quantità non disponibile»), numeri
occupati/fuori intervallo, ecc. Successo → toast «Assegnazione creata ·
Stock, numeri e ordini aggiornati.», form azzerato, dialogo chiuso.

### 3b. Form «Modifica assegnazione» (dialogo `max-w-2xl`)

| Campo | Controllo | Iniziale |
|---|---|---|
| Atleta | `Select` su tutti gli atleti («{nome} - {categoria}») | `assignment.athleteId` (obbligatorio → «Seleziona un atleta») |
| Stato | `Select` sui 4 `assignmentActionStatuses` | `assignment.status` |
| Data assegnazione | `Input date` | `createdAt` in `yyyy-mm-dd` (via `toISOString`, quindi UTC) |
| Note | `Textarea` | `assignment.notes` |

Salvataggio (`saveAssignmentEdit`): se lo stato cambia passa da
`updateClothingAssignmentStatus` (muove il magazzino); poi riscrive
l'assegnazione (`athleteId`, `assigneeId`, `status`, `notes.trim()`,
`createdAt = new Date(`${date}T12:00:00.000Z`)`, `updatedAt`, e **tutti**
gli articoli allo stesso `status`), il magazzino collegato (`athleteId`
sulle unità singole), i numeri di maglia collegati (`athleteId`); tre
`saveClubJson`. Toast «Salvato · Assegnazione aggiornata.» / «Impossibile
aggiornare assegnazione». **Annulla** / **Salva modifiche**.

### Cambia stato (`updateAssignmentStatus`)

`updateClothingAssignmentStatus({assignmentId, nextStatus, state})` →
`saveClubJson("kit_assignments")` + `saveClubJson("clothing_inventory")` →
toast «Aggiornato · Stato aggiornato.» / «Impossibile aggiornare stato».
Nessuna conferma.

### 9. Flusso distruttivo: Elimina assegnazione

`window.confirm` → magazzino collegato liberato (unità → `available`,
`athleteId/assignmentId = null`; bulk → `quantityAvailable += q`,
`quantityReserved -= q`, `quantityAssigned -= q`, `assignmentId = null`),
assegnazione tolta, numeri di maglia con quell'`assignmentId` tolti,
righe ordine selezionate con quel prefisso tolte dalla selezione; tre
`saveClubJson`. Toast «Eliminata · Assegnazione rimossa.» / «Impossibile
eliminare assegnazione».

### 4. Ricerca

Su nome atleta, categoria, nome kit, nomi articoli, `status` (chiave
inglese grezza). Nessun filtro né vista.

### 8. Stati

Vuoto: «Nessuna assegnazione reale salvata.»

---

## Scheda Ordini fornitore

Card «Ordini fornitore» / «Richieste da produrre o personalizzare, derivate
dalle assegnazioni da ordinare.». Controlli: ricerca «Cerca articolo, atleta,
note...», `Select` **Fornitore** («Tutti i fornitori» + `supplierOptions`
derivate dalle righe), **Esporta ordine PDF** (outline, `disabled` senza
righe filtrate → ambito «Ordine completo»), **Esporta selezionati PDF**
(primario, `disabled` senza selezione → «Articoli selezionati»). Badge
«{n} righe» e «{n} selezionate».

### 1. Dati mostrati

Righe = **una per articolo** delle assegnazioni con `source ===
"supplier_order"` **oppure** `status ∈ supplierOrderStatuses` (to_order,
ordered, in_production, received, delivered, cancelled), ordinate per
`createdAt` desc. Id riga `${assignment.id}:${item.id || index}`. Colonne:
casella (`aria-label="Seleziona tutti gli articoli filtrati"` /
`Seleziona {itemName}`), **Articolo** (+ «{atleta} - {categoria}»),
**Tipo** (`catalogItem.type || item.stockType || "-"`), **Taglia**,
**Colore**, **Variante** (con ripiego sui campi dell'assegnazione),
**Numero** (badge `n.{label}` / «Senza numero»), **Quantità**
(`max(1, quantity)`), **Fornitore** (`supplierLabel`: prima voce non vuota
fra `supplier|supplierName|fornitore|data.supplier|data.fornitore`
dell'articolo, dell'assegnazione (`raw`) e dell'articolo di catalogo
(`raw`), altrimenti «Non indicato»), **Note** (`item.notes || assignment.notes`),
**Stato** (`assignmentStatusLabels[item.status] || [assignment.status]`,
badge colorato da `statusBadgeClass(assignment.status)`), **Atleta**,
**Azioni esportazione** (**PDF** → «Articolo singolo»).

### 5. Selezione / massa

Selezione per riga e «tutte le filtrate» (toggle sulle righe filtrate;
`allFilteredSupplierRowsSelected`). Unica azione di massa: **Esporta
selezionati PDF**. La selezione **sopravvive** al cambio di filtro e di
ricerca (`selectedSupplierRows` si calcola su tutte le righe).

### 6. Esportazione

`printSupplierOrderPdf({clubName: activeClub.name || "EasyGame",
clubLogoUrl: logo_url | logoUrl, rows, supplierLabel: filtro ≠ all ? filtro
: undefined, scopeLabel})` (apre una finestra di stampa). Toast: «Nessun
articolo · Non ci sono righe da esportare.» (destructive) / «Popup bloccato ·
Consenti i popup per generare la stampa PDF.» / «PDF pronto · Si apre la
finestra di stampa dell'ordine fornitore.». Nessun CSV, nessun import.

### 4. Filtri / ricerca

Filtro fornitore; ricerca su itemName, itemType, size, color, variant,
numberLabel, supplier, notes, status (etichetta italiana), athleteName,
categoryName.

### 8. Stati

Vuoto: «Nessun ordine fornitore reale.»

---

## Scheda Numerazioni

Card «Gruppi numerazione» / «I numeri sono unici solo dentro il gruppo.»;
pulsante **+ Gruppo** (`emptyNumberingGroup`).

### 1. Dati mostrati

Un `Collapsible` per gruppo (ordine alfabetico, **chiusi di default**),
da `getJerseyGroupSummaries({groups, state, athletes, categories})`:
- testata: nome, riga «{min}-{max}{ - stagione} - {n} atleta/i»; badge
  «{usedNumbers.length} numeri», «{missingRows.length} senza numero»,
  «{duplicateNumbers.length} duplicati» (ambra, solo se > 0); pulsante
  **Modifica** (precompila il form con l'oggetto gruppo).
- corpo: chip delle categorie (nomi da `categoryOptions`, o «Tutte le
  categorie»), chip «Categorie compatibili incluse» (se
  `includeCompatibleCategories`); avviso ambra «Numeri duplicati: 7, 10»
  (se ce ne sono); ricerca «Cerca atleta o categoria» (per gruppo, azzera
  il limite); tabella `min-w-[780px]`: **Atleta**, **Categoria** (+ badge
  `CATEGORY_ELIGIBILITY_LABELS[membership]` per `secondary`/`compatible`,
  «Fuori gruppo» per `external`), **Numeri** (badge per numero, ambra se
  duplicato; «Senza numero»), **Manuale** (`Input number min max
  defaultValue={manualRecord.number}`, salva su **blur** o Invio se il valore
  cambia), **Azioni** (**Random** solo se `!row.hasNumber`; **Rimuovi**
  `disabled` se non c'è un record manuale). Paginazione «Mostra altri
  {min(nascosti, 25)}» a lotti di `GROUP_ROWS_PAGE_SIZE = 25`, contatore
  «{visibili} di {filtrate} atleti».

Il **record manuale** è il `jerseyAssignment` con `source ===
"jersey_assignment"` e senza `assignmentId` (i numeri che arrivano dalle
assegnazioni kit non si modificano da qui).

### 2. Azioni

- **Numero manuale** (`saveManualJerseyNumber`): `""` → rimuove; altrimenti
  intero nell'intervallo del gruppo (→ «Numero fuori intervallo {min}-{max}»;
  gruppo assente → «Gruppo numerazione non trovato»); sostituisce il record
  manuale `jersey:${athleteId}:${groupId}`; `saveClubJson("jersey_assignments")`;
  toast «Numero salvato» / «Numero rimosso» · «Numerazione maglia aggiornata.».
  **Nessun controllo di occupazione** (un numero già usato si salva e compare
  come duplicato).
- **Random**: pesca in `summary.availableNumbers`; se vuoto toast «Nessun
  numero disponibile · Tutti i numeri del gruppo sono gia utilizzati o
  riservati.».
- **Rimuovi**: `value: null`.
- **Modifica** (gruppo). Nessuna eliminazione di gruppo.

### 3. Form «Gruppo numerazione» (dialogo)

| Campo | Controllo | Iniziale | Validazione |
|---|---|---|---|
| Nome gruppo | `Input` | `""` | obbligatorio → «Nome gruppo obbligatorio» |
| Stagione | `Input` testo libero | `""` | — (etichetta informativa, non filtra) |
| Min · Max | due `Input number` | `0` · `99` | `min > max` → «Intervallo numeri non valido» |
| Categorie | elenco di checkbox su `categoryOptions` («Nessuna categoria configurata.») | `[]` | vuoto = tutte |
| Sedi del gruppo *(solo `isMultiSiteClub(sites)`)* | checkbox su `getActiveClubSites`; nota «Nessuna sede selezionata significa «tutte». Serve a numerare separatamente la stessa categoria svolta in due sedi.» | `[]` | — |
| Includi le categorie compatibili | checkbox + testo «Aggiunge gli atleti che le categorie del gruppo dichiarano compatibili nella scheda Categorie. L'eleggibilita non cambia la categoria dell'atleta.» | `false` | — |

`reservedNumbers` e `assignedNumbers` restano quelli del record (non
editabili). `saveClubJson("jersey_groups", …)`, toast «Salvato · Gruppo
numerazione aggiornato.» / «Impossibile salvare gruppo». **Annulla** / **Salva**.

### 8. Stati

Nessun gruppo: «Nessun gruppo numerazione configurato.»; tabella vuota:
«Nessun atleta collegato al gruppo.» / «Nessun atleta corrisponde alla
ricerca.».

---

## Dialogo Consegne del kit

`src/components/clothing/kit-delivery-dialog.tsx`: `KitDeliveryDialog` +
`KitDeliveryStateBadge` (usati **solo** da `/clothing`).

Titolo «Consegne · {atleta}»; blocco con badge dello stato del kit
(`KIT_DELIVERY_STATE_LABELS`: Da preparare / Parziale / Completato),
`progress.label`, «{kitName || Articoli singoli} — lo stato del kit si
ricava dagli articoli e non si sceglie a mano.». Per ogni articolo una
scheda impilata (usabile a 375: nessun `grid-cols-2/3`):

| Campo | Controllo |
|---|---|
| Stato | `Select` sui quattro `ITEM_STATES` (`to_prepare` Da preparare · `ready` Pronto · `delivered` Consegnato · `unavailable` Non disponibile); cambio → `setAssignmentItemState` (imposta `status`, `delivered`, `deliveredAt = now` se consegnato, ricalcola lo stato del kit) |
| Taglia assegnata | `Input` con placeholder = taglia proposta; nota «Prevista da anagrafica: M» / «Anagrafica: M — l'anagrafica non cambia» |
| Quantita | `Input number min=1` |
| Data consegna | `Input date`, `disabled` se non consegnato; valore `deliveredAt` o oggi |
| Note | `Input` placeholder «Es. taglia esaurita dal fornitore» |

Pulsanti **Annulla** / **Salva consegne** → `onSave(draft)` =
`saveKitDeliveries`: riscrive solo `kit_assignments` (**non** passa da
`updateClothingAssignmentStatus`, quindi non muove il magazzino) → toast
«Consegne aggiornate · Lo stato del kit e stato ricalcolato dagli articoli.»
/ «Impossibile salvare le consegne».

---

## Permessi

- Rotta in `MANAGEMENT_PATHS` (`/clothing`, `access-roles.ts`) e nel
  `middleware`; guscio `management-area-layout` → `AccessAreaGuard`:
  raggiungibile dai ruoli di gestione (owner, club_manager, collaborator,
  staff e ruoli personalizzati che raggiungono le risorse).
- Risorse `clothing_products`, `clothing_kits`, `clothing_inventory`,
  `kit_assignments`, `jersey_groups`, `jersey_assignments` sono in
  `MANAGEMENT_OPEN_RESOURCES`: letture e scritture via `simplified-db`
  passano da `resources.ts`, che applica `canAccessClubResource`.
  Nessuna è admin-only né admin-only-delete. Il trainer **non** le raggiunge.
- `POST /api/clothing/assignments`: `canAccessClubResource(role,
  "kit_assignments", "create")` → 403 «Accesso negato: l'assegnazione del
  materiale la registra chi lavora nel club»; atleta non del club → 403.
- **Nessun predicato client** nella pagina: tutti i pulsanti si vedono a
  chiunque entri. Non esiste una chiave di catalogo dedicata (le tre
  risorse `clothing_*` sono censite in `permissions/catalog.ts` con `keys:
  []`, «materiale sportivo, nessun dato personale»). Per la V2 il predicato
  da usare è lo stesso del server: `canAccessClubResource(role,
  "<risorsa>", "create"|"update"|"delete")`.

## Stati ed etichette

- **Assegnazione** (`assignmentStatusLabels`): reserved «Riservato»,
  assigned «Assegnato», ready «Pronto», delivered «Consegnato», to_order
  «Da ordinare», ordered «Ordinato», in_production «In produzione», received
  «Ricevuto», unavailable «Non disponibile», cancelled «Annullato». Colori
  V1 (`statusBadgeClass`): verde delivered/received; ambra to_order/ordered/
  in_production; rosso cancelled/damaged/lost; blu il resto.
- **Kit derivato** (`KIT_DELIVERY_STATE_LABELS`): to_prepare «Da
  preparare», partial «Parziale», completed «Completato»; con la riga
  `{delivered}/{total} consegnati · {n} non disponibile/i`.
- **Articolo assegnato** (`CLOTHING_ITEM_STATE_LABELS`): «Da preparare»,
  «Pronto», «Consegnato», «Non disponibile».
- **Magazzino** (`inventoryStatusLabels`): available «Disponibile», reserved
  «Riservato», assigned «Assegnato», delivered «Consegnato», unavailable «Non
  disponibile», lost «Smarrito», damaged «Danneggiato»; il bulk mostra
  «Quantita».
- **Catalogo / kit**: «Attivo» / «Non attivo».
- **Appartenenza al gruppo** (`CATEGORY_ELIGIBILITY_LABELS` per
  `secondary`/`compatible`; «Fuori gruppo» per `external`).
- **Origine**: Magazzino / Fornitore / Manuale.

In `src/lib/web/status.ts` esistono solo `ANNULLATO` (money), `PARZIALE`
(money), `COMPLETATO` (activity), `ATTIVO`/`DISATTIVATO` (persona): mancano
tutte le parole del magazzino e delle consegne (vedi rapporto).

## Navigazione e parametri

In entrata: `/clothing` (dalla barra laterale «Abbigliamento», voce
`clothing` in `web/shell/navigation.ts`). **Nessun parametro letto**, nessun
deep link a una scheda. In uscita: nessun link (la pagina non porta alla
scheda atleta né alle categorie).

## Test collegati

- `tests/ui/clothing-delivery-ux.test.mjs` — **l'unico** statico sui
  sorgenti della rotta (`app/clothing/page.tsx`,
  `components/clothing/kit-delivery-dialog.tsx`): proposta di taglia
  (`const proposedSizeByItemId = useMemo`, `value={sizeDescription.size}`,
  `size: draft.size || proposedSizeByItemId[item.id] || ""`, `size:
  sizeDescription.size,`), nessuna scrittura dell'anagrafica taglie,
  `<KitDeliveryStateBadge` in elenco e `getKitDeliveryProgress(assignment)`
  nel dialogo, `saveKitDeliveries` che non chiama
  `updateClothingAssignmentStatus`, i quattro `ITEM_STATES` e i campi «Taglia
  assegnata», «Quantita», «Data consegna», «Note», niente `grid-cols-2/3`
  nel dialogo, nessuna stagione nel form kit (sezione fra `<TabsContent
  value="kit"` e `"magazzino"`), niente `season: kitForm.season`, niente
  `compatibleCategoryIds` su `itemForm`/`kitForm`, niente «Categorie
  compatibili» / «Categoria non compatibile», presenza di
  `groupForm.includeCompatibleCategories` e «Categorie compatibili incluse»,
  `sizeSource: itemForm.sizeSource,` e `id="item-size-source"`. **Va
  ripuntato** ai file V2 mantenendone l'intento.
- Globali che camminano `src/app/**` e includono la pagina:
  `app-shell-layout.test.mjs` (`h-[100dvh]`, niente `min-h-screen`),
  `brand-and-chrome.test.mjs`, `topbar-club-vs-platform.test.mjs`,
  `date-only-timezone-shift.test.mjs` (niente `new Date().toISOString().slice(0,10)`),
  `navigazione-sotto-1024-e-768.test.mjs`.
- `tests/web/shell-navigation.test.mjs`, `tests/auth/route-guards.test.mjs`:
  `/clothing` fra le destinazioni protette.
- Dominio (non toccato): `tests/lib/clothing-catalog-model.test.mjs`,
  `clothing-delivery.test.mjs`, `jersey-numbering-multisite.test.mjs`,
  `multisite-performance.test.mjs`, `numbering-group-persistence.test.mjs`,
  `tests/server/clothing-assignments-resources.test.mjs`.
- `tests/ui/iscrizioni-v2-parita.test.mjs`: «la scheda kit irraggiungibile
  non torna: vive in /clothing».

## Inventario componenti

Importati dalla pagina: `Header, Sidebar, DashboardPageContainer,
dashboardMainClassName, Badge, Button, Card*, Command*, Dialog*,
DropdownMenu*, Input, Label, Popover*, Select*, Collapsible*, Tabs*,
Table*, Textarea, useAuth, useToast (ui/use-toast), apiRequest`; lib:
`clothing-inventory-utils` (`assignmentStatusLabels, canAssignNumber,
getAssignmentNumberLabel, getAthleteClothingProfile,
getAvailableNumbersForGroup, getAvailableInventoryForItem,
inventoryStatusLabels, normalizeClubClothingState, serialize*,
supplierOrderStatuses, updateClothingAssignmentStatus` + tipi),
`clothing-supplier-order-pdf` (`printSupplierOrderPdf`),
`jersey-numbering-utils` (`getJerseyGroupSummaries`),
`category-compatibility` (`CATEGORY_ELIGIBILITY_LABELS`),
`athlete-name-utils` (`compareAthletesByLastName, getAthleteDisplayName`),
`sorting` (`sortByName`), `category-utils` (`buildClubCategoryOptions`),
`club-sites` (`getActiveClubSites, isMultiSiteClub, normalizeClubSites`),
`clothing-delivery` (`describeAssignedSize, proposeSizeForItem`),
`components/clothing/kit-delivery-dialog`; icone lucide.

**Specifici della rotta** (si rimuovono dopo la parità): `MetricCard`,
`statusBadgeClass`, `stockLabel`, `supplierLabel`, `firstText`,
`formatDate`, `dateInputValue`, `athleteLabel`, `getAthleteCategoryLabel`,
`renderCategoryCheckboxes`, `renderAssignmentComponent`, le cinque
`Dialog` inline, i due `window.confirm`/`confirm`, le tre viste a card
`hidden`, `kit-delivery-dialog.tsx` (nessun altro importatore).
**Condivisi** (restano): tutte le librerie sopra; `ClothingSizesFields` non è
usato da questa rotta (vive nelle anagrafiche).

## Difetti della V1

1. **Titolo in gradiente**, `bg-slate-50`, badge colorati senza sistema di
   stato: sostituiti dal sistema.
2. **`window.confirm`** su Elimina assegnazione.
3. **Stato di caricamento** come pill fisso; **errore** non distinguibile
   dal vuoto.
4. **Nessun predicato client** sui pulsanti: chi non può scrivere vede
   comunque tutto e riceve l'errore dopo il clic.
5. **Codice morto**: tre viste a card `hidden`, `Collapsible` con
   `CollapsibleContent` aperto solo a mano.
6. `dateInputValue` usa `toISOString().slice(0, 10)` su una data esistente
   (spostamento di fuso sulla data di assegnazione in modifica). Non è il
   pattern «oggi» vietato dal test, ma la V2 usa `parseDateInput`/formattazione
   locale.
7. `assignmentSearch` è **lo stesso stato** per la ricerca in elenco e per
   la ricerca atleta nel dialogo: aprire il dialogo azzera la ricerca
   dell'elenco.
8. Nessuna scheda sopravvive al ricaricamento (nessun `?area=`).
9. Le tre scritture consecutive non sono atomiche (fuori scope: dominio).
10. **Assegna** e **Rimuovi** disabilitati invece che assenti (V2: assenti).

## Sintesi

1. Una rotta, sei schede, un dominio in sei colonne JSON di `clubs`
   (`clothing_products`, `clothing_kits`, `clothing_inventory`,
   `kit_assignments`, `jersey_groups`, `jersey_assignments`) più atleti,
   categorie e sedi; tutte le letture/scritture da `simplified-db`
   (`getClubData`/`getClubAthletes`/`updateClubData`) tranne la creazione di
   un'assegnazione (`POST /api/clothing/assignments` via `apiRequest`).
2. Cinque moduli (articolo, kit, stock, gruppo, assegnazione) + due moduli
   sull'assegnazione esistente (modifica; consegne per articolo) + un
   cambio di stato a menu; un flusso distruttivo (elimina assegnazione).
3. Un'esportazione: **ordine fornitore PDF** in tre ambiti (completo,
   selezionati, singolo articolo), con selezione multipla solo in quella
   scheda. Nessun CSV, nessun import.
4. Numerazioni: gruppi con riepilogo derivato, numero manuale inline
   (blur/Invio), random, rimozione; ricerca e paginazione per gruppo.
5. Permessi: perimetro di gestione via `canAccessClubResource` sulle sei
   risorse; nessuna chiave di catalogo dedicata; server 403 sulla
   creazione senza `kit_assignments:create`.
6. Etichette: quattro dizionari (assegnazione, kit derivato, articolo
   assegnato, magazzino) nessuno dei quali vive in `lib/web/status.ts`.
