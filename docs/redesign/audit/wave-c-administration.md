# Wave C — Audit di parita funzionale: Amministrazione (Cassa e amministrazione)

**Ambito:** `/movements` (Prima nota / Movimenti), `/reports`, `/procura`, e un
inventario sintetico di `/payments` (che redirige a `/movements`), cosi come
raggruppati nella sidebar del redesign sotto «Cassa e amministrazione».

**Metodo:** lettura integrale dei file di route, dei componenti che importano,
delle librerie di dominio (`src/lib/accounting/**`, `src/lib/fiscal/**`,
`src/lib/payments/**`, `src/lib/funding/**`, `src/lib/club-report-utils.ts`,
`src/lib/club-financial-summary.ts`), della matrice permessi
(`src/lib/accounting/permissions.ts`, `src/lib/permissions/catalog.ts`), del
registro API (`src/lib/api/registry.ts`) e dei test in `tests/**`. Nessun file
applicativo e stato modificato. Le etichette italiane sono riportate **esatte**
come compaiono nel codice.

**Nota preliminare — `/payments` e un redirect.** `src/app/payments/page.tsx`
(5 righe) chiama `redirect("/movements")`; `src/app/payments/layout.tsx`
ri-esporta lo stesso `management-area-layout` di `/movements`. La superficie
«Quote e rate» descritta nel Work Package vive interamente dentro la scheda
**«Rate e solleciti»** di `/movements`, che monta gli stessi componenti di
dominio (`src/components/payments/**`) usati anche nella scheda Iscrizione
dell'atleta. `/payments` resta comunque un'area di gestione protetta a se
(elencata sia in `MANAGEMENT_PATH_PREFIXES` di `src/lib/access-roles.ts` sia
nel prefisso "richiede sessione" di `src/middleware.ts`), quindi non e un file
morto lato routing/permessi, solo lato contenuto.

---

## A. `/movements` (Prima nota / Movimenti)

**File:** `E:\Download\easygame\src\app\movements\page.tsx` (898 righe, client
component, `export default function MovementsPage`).

**Intestazione pagina** (Header): titolo `"Movimenti"`. Intestazione di
sezione (`SharedPageHeader`): titolo **"Prima nota"**, sottotitolo *"Entrate,
uscite e giroconti della societa, con la loro causale e il conto su cui il
denaro si e mosso. Incassi, compensi e contributi restano ai loro domini e qui
si leggono."*

**Tre schede** (`Tabs`, stato `tab`, default `"prima-nota"`, **non persistito**
in URL/localStorage — si azzera al reload):
- `TabsTrigger value="prima-nota"` → **"Prima nota"**
- `TabsTrigger value="rate"` → **"Rate e solleciti"**
- `TabsTrigger value="previsti"` → **"Previsti"**

### A.1 Data shown

**Permission gate di pagina.** `canOpen = canOpenAccounting(activeRole)`
(richiede `accounting.read`). Se falso, la pagina rende solo: titolo "Prima
nota", sottotitolo "Registro dei movimenti finanziari della societa."; box
ambra: **"La prima nota non e accessibile"** / *"Il ruolo attivo su questo
club non puo vedere la prima nota e il riepilogo gestionale. Chiedi al
proprietario o al gestore della societa di attribuirti il permesso."*

**Scheda «Prima nota»:**

1. **`AccountingSummary`** (`src/components/accounting/AccountingSummary.tsx`)
   — due «grandezze» tenute deliberatamente separate (mai sommate in
   un'unica riga):
   - **"Situazione finanziaria"** (hint: *"denaro davvero movimentato, per
     cassa"*):
     - **"Liquidita totale"** (card blu) — somma di
       `report.accountBalances[].balanceCents`, hint *"Saldo derivato dai
       movimenti, mai digitato."*
     - una card per conto finanziario: nome + `kindLabel`, saldo (rosso se
       negativo)
     - vuoto: *"Nessun conto finanziario configurato. Senza un conto un
       movimento non puo dire dove il denaro si e mosso."*
     - ristretto (`accountBalances === null`, manca `accounting.accounts_read`):
       icona lucchetto, **"I saldi dei conti non sono visibili"** / *"Vedere i
       conti correnti e i loro saldi e riservato a proprietario e gestore,
       come gli estremi bancari. La prima nota qui sotto resta completa:
       quello che manca e il saldo, non i movimenti."*
     - 3 KPI: **"Entrate del periodo"** (verde, `cash.collectedCents`),
       **"Uscite del periodo"** (rosso, `cash.paidCents`), **"Differenza di
       cassa"** (`cash.netCents`, hint *"N gambe di giroconto escluse:
       cambiano conto, non cassa."* o *"Giroconti e storni esclusi."*)
     - nota condizionale se i filtri restringono oltre cio che il riepilogo
       supporta: *"L'elenco e ristretto anche per origine, stato di
       riconciliazione o ricerca: i totali qui sopra seguono solo il periodo,
       il conto, la causale, la sede e il verso."*
     - nota condizionale se `report.truncated`: *"La lettura si e fermata
       prima della fine dell'insieme: restringi il periodo perche i totali lo
       coprano tutto."*
   - **"Situazione economica"** (bordo tratteggiato; hint: *"crediti e debiti:
     maturati, non ancora denaro — e riguardano il club intero, non il
     periodo filtrato"*):
     - **"Crediti verso le famiglie"** (`accrual.familyReceivablesCents`,
       include conteggio/importo scaduti, *"Fonte: il registro delle
       rate."*)
     - **"Contributi da ricevere"** (`accrual.fundingPendingCents`, *"Fonte:
       i bandi."*)
     - **"Compensi da pagare"** (`accrual.sportWorkAccruedUnpaidCents`,
       *"Fonte: il lavoro sportivo."*)
     - link: **"Riepilogo gestionale completo"** → `/reports`; **"Compensi"**
       → `/sport-work/compensations`
   - piè di pagina: `report.disclaimer` (dal server). Caricamento:
     *"Calcolo del riepilogo..."*; fallito: *"Riepilogo non disponibile: la
     lettura non e riuscita."*
   - Fonte: `GET /api/v1/accounting/reports?<buildReportQuery(filters)>`.

2. **`AccountingFilters`** — v. §A.4.

3. **`AccountingEntries`** (tabella/registro). Fonte:
   `GET /api/v1/accounting/entries?<buildEntriesQuery(filters,{limit,offset})>`.
   - caricamento: *"Lettura della prima nota..."*
   - vuoto (post-filtro): *"Nessun movimento con questi filtri."*
   - errore: **"La prima nota non e stata letta"** + messaggio del server
   - colonne desktop: Data, Descrizione (+ controparte + note in sottoriga),
     Causale, Conto, Importo (con segno ↑/↓), Stato (badge), Azioni
   - mobile (`<md`): una card per riga con intestazione Data/Descrizione,
     lista definizioni Conto/Causale/Controparte, badge, note, azioni
   - badge per riga: etichetta origine (`sourceLabel`), etichetta
     riconciliazione se non "non riconciliato" (**"Riconciliato"** /
     **"Contestato"**), **"Stornato"** se `reversedAt`, badge di ambito
     (**"Da classificare"** ambra se `unspecified`, altrimenti
     Istituzionale/Commerciale)
   - importo: verde per entrata, rosso per uscita, barrato+grigio se stornato
   - paginazione: **"Movimenti da {primo} a {ultimo} di {total}"**,
     **"Precedenti"** / **"Successivi"** (disabilitati ai limiti o durante il
     salvataggio)

**Scheda «Rate e solleciti»:**
Testo introduttivo: *"Le rate dovute dalle famiglie. Non sono denaro
incassato: lo diventano quando un incasso viene registrato, e allora
compaiono in prima nota come proiezione del loro dominio."*
- tabella (desktop) / card (mobile): checkbox, **Scadenza**, **Atleta**,
  **Descrizione**, **Dovuto**, **Incassato**, **Stato** (badge da
  `buildStatusLabels`: **"IN ATTESA"**, **"PARZIALMENTE PAGATA"**,
  **"PAGATA"**, **"SCADUTA"**, combinabili es. "PARZIALMENTE PAGATA" +
  "SCADUTA")
- caricamento: *"Lettura delle rate..."*; vuoto: *"Nessuna rata registrata
  per questo club."*
- fonte dati: `supabase.from("payments").select("*").eq("organization_id",
  activeClubId)` + `getClubAthletes(...,{view:"summary"})` +
  `getClub(activeClubId)` (tre letture, solo alla prima apertura della
  scheda, cache via `installmentsLoaded`)
- campi derivati per riga: `dueAmount` (`toPaymentAmount`), `paidAmount`
  (`readChargeCollectedAmount`), `state` (`resolveLedgerState`), `overdue`
  (stato ≠ pagata e scadenza passata) — tutti da
  `src/lib/payments/installment-ledger.ts`
- il click su una riga apre inline un pannello `AthletePaymentLedger`
  (ambito singola rata, `showTotals={false}`) per registrare un incasso;
  `onLedgerChanged` ricarica sia le rate sia la prima nota/riepilogo (un
  incasso vi compare come proiezione)

**Scheda «Previsti»:** montata solo quando attiva (`tab === "previsti"`),
delega a `ExpectedEntries` (v. §A.3/§A.6).

**"Situazione finanziaria" vs "Situazione economica":** entrambe le
intestazioni compaiono **verbatim** in `AccountingSummary.tsx` — un layout a
due livelli deliberato (cassa/liquidita contro crediti/debiti), separato da un
bordo tratteggiato, con nota condivisa che i due numeri non vanno mai sommati
(regola strutturale: nessuna funzione in `src/lib/accounting/reporting.ts`
produce un totale combinato). Un terzo concetto correlato, **"Situazione
previsionale"**, compare nella scheda «Previsti» (`ExpectedEntries.tsx`),
anch'esso tenuto fuori dalle prime due sezioni.

### A.2 Actions

| Etichetta | Dove | Condizione | Effetto / endpoint |
|---|---|---|---|
| **"Registra movimento"** (icona Plus) | Header pagina | `canManage && tab==="prima-nota"` | Apre `RecordEntryDialog` → `POST /api/v1/accounting/entries` |
| **"Giroconto"** (icona ArrowLeftRight) | Header pagina | idem | Apre `TransferDialog` → `POST /api/v1/accounting/entries?kind=transfer` |
| **"Azzera filtri"** (icona X) | `AccountingFilters` | solo se `hasActiveFilters(filters)` | reset locale, nessuna richiesta |
| **"Riconcilia"** (icona CheckCircle2) | Riga, `AccountingEntries` | `line.canReconcile` | Apre `ReconcileEntryDialog` → `POST /api/v1/accounting/entries/:id/reconcile` |
| **"Storna"** (icona Undo2) | Riga | `line.canReverse` | Apre `ReverseEntryDialog` → `POST /api/v1/accounting/entries/:id/reverse` |
| **"Precedenti" / "Successivi"** | Paginazione | limiti/non-busy | `setOffset` client-side |
| **"Sollecita"** (icona Mail) | Toolbar bulk, scheda Rate | `canSendReminders` (via `canManageClubConfigurationAsActor`) e selezione non vuota | Apre `PaymentReminderDialog` |
| **"Nuova previsione"** (icona Plus) | Header `ExpectedEntries` | `canManage` (dalla risposta `/expected`) | Apre `NewExpectedDialog` → `POST /api/v1/accounting/expected` |
| **"Togli"** (icona X) | Riga `ExpectedEntries` | `canManage` | Apre `RemoveExpectedDialog` → `DELETE /api/v1/accounting/expected/:id?direction=income|expense` |
| **"Riepilogo gestionale completo"** | `AccountingSummary` | sempre (quando i saldi sono mostrati) | → `/reports` |
| **"Compensi"** | `AccountingSummary` | sempre | → `/sport-work/compensations` |

Nessun pulsante di export/stampa esiste su questa rotta (v. §A.6 — gap).

### A.3 Forms

Tutti in `src/components/accounting/AccountingEntryDialogs.tsx` (movimento /
giroconto / storno / riconciliazione) e
`src/components/accounting/ExpectedEntries.tsx` (previsione crea/rimuovi).
**Non esiste** una dialog di creazione/modifica conto finanziario su questa
rotta ne altrove nel client (v. §A.12 — gap).

**3.1 `RecordEntryDialog` — "Registra un movimento"**
Descrizione: *"Un fatto di cassa che nessun altro evento ha generato:
l'affitto della palestra, una spesa in contanti, un rimborso spese. Gli
incassi delle quote si registrano sulla scheda dell'atleta e compaiono qui da
soli."*

| Campo | Controllo | Obbligatorio | Default | Note |
|---|---|---|---|---|
| Data (`movimento-data`) | date | si | oggi | |
| Verso (`movimento-verso`) | Select Entrata/Uscita | si | "IN" | pilota le causali visibili |
| Importo (EUR) (`movimento-importo`) | number, min 0, step 0.01, placeholder "0,00" | si (>0) | vuoto | accetta virgola decimale |
| Conto (`movimento-conto`) | Select, placeholder "Dove si e mosso il denaro" | si | auto-selezionato se un solo conto | |
| Causale (`movimento-causale`) | Select, placeholder "Scegli una causale" | si | vuoto | v. risoluzione causale sotto; hint: *"Obbligatoria, e scelta da un elenco... Le causali si configurano nel profilo fiscale del club."* — si azzera se il codice selezionato sparisce dalla lista filtrata al cambio verso |
| Descrizione (`movimento-descrizione`) | text, placeholder "Cosa e successo" | si (non vuota) | vuoto | |
| Controparte (facoltativa) (`movimento-controparte`) | text, placeholder "Chi sta dall'altra parte" | no | vuoto | |
| Metodo di pagamento (facoltativo) (`movimento-metodo`) | text, placeholder "Contanti, bonifico, POS" | no | vuoto | |
| Sede (facoltativa) (`movimento-sede`) | `SiteSelect`, etichetta vuota "Tutte le sedi" | no | vuoto | solo club multi-sede (ADR-0038) |
| Note (facoltative) (`movimento-note`) | Textarea rows=2 | no | vuoto | |

Submit: **"Registra"** (→ "Registrazione..."), disabilitato finche non completo.
Payload → `POST /api/v1/accounting/entries`. Toast: **"Movimento
registrato"**.

**3.2 `TransferDialog` — "Registra un giroconto"**
Descrizione: *"Denaro che cambia conto senza entrare ne uscire dal club... Non
compare fra le entrate ne fra le uscite del periodo, e la liquidita totale non
cambia."*

| Campo | Controllo | Obbligatorio |
|---|---|---|
| Data (`giroconto-data`) | date, default oggi | si |
| Importo (EUR) (`giroconto-importo`) | number, min 0, step 0.01 | si (>0) |
| Dal conto (`giroconto-da`) | Select, placeholder "Conto di partenza" | si |
| Al conto (`giroconto-a`) | Select, placeholder "Conto di arrivo", esclude il conto gia scelto come "Dal conto" | si, deve differire dal conto di partenza |
| Descrizione (facoltativa) (`giroconto-descrizione`) | text, placeholder "Versamento incassi di settembre" | no |
| Sede (facoltativa) (`giroconto-sede`) | `SiteSelect` | no, solo multi-sede |
| Note (facoltative) (`giroconto-note`) | textarea rows=2 | no |

Submit: **"Registra giroconto"** (→ "Registrazione..."). Payload →
`POST /api/v1/accounting/entries?kind=transfer` (una transazione, due gambe).
Toast: **"Giroconto registrato"**.

**3.3 `ReverseEntryDialog` — "Storna il movimento"**
Descrizione: *"Il denaro non si cancella. Lo storno lascia visibili entrambe le
righe, l'originale e la sua correzione, con il motivo scritto sopra."*
Anteprima: descrizione, data/importo/conto (o "conto non attribuito"); se
`line.transferGroupId` e' impostato, nota aggiuntiva: *"E la gamba di un
giroconto: lo storno riguarda entrambe le gambe, altrimenti le due meta
divergono e il denaro sparisce fra due conti."*

| Campo | Controllo | Obbligatorio |
|---|---|---|
| Motivo dello storno (`storno-motivo`) | Textarea rows=3, placeholder "Perche questo movimento va corretto" | si (non vuoto) |
| Data dello storno (`storno-data`) | date, default oggi | no |

Submit: **"Storna"** (variante distruttiva, → "Storno..."). Payload
`{reason, entry_date}` → `POST /api/v1/accounting/entries/:id/reverse`.
Toast: **"Movimento stornato"**. Annulla: **"Annulla"**.

**3.4 `ReconcileEntryDialog` — "Spunta contro l'estratto conto"**
Descrizione: *"Riconciliare non cambia nessun numero: dice che l'estratto
conto conferma il movimento..."*

| Campo | Controllo | Default |
|---|---|---|
| Stato (`riconcilia-stato`) | Select: "Da riconciliare"/"Riconciliato"/"Contestato" | stato corrente, o "Riconciliato" se attualmente "Da riconciliare" |
| Data valuta (facoltativa) (`riconcilia-valuta`) | date | valore esistente o vuoto |
| Riferimento bancario (facoltativo) (`riconcilia-riferimento`) | text, placeholder "CRO, numero distinta" | valore esistente |

Submit: **"Salva"** (→ "Salvataggio...", nessun campo obbligatorio oltre il
salvataggio in corso). Payload → `POST /api/v1/accounting/entries/:id/reconcile`.
Toast: **"Riconciliazione aggiornata"**.

**3.5 `NewExpectedDialog` (scheda «Previsti») — "Nuova previsione"**
Descrizione: *"Una previsione e un impegno atteso, non un movimento: non entra
in prima nota, non tocca nessun saldo e non conta come denaro incassato..."*

| Campo | Controllo | Obbligatorio |
|---|---|---|
| Verso (`previsione-verso`) | Select "Entrata prevista"/"Uscita prevista" | default entrata |
| Data attesa (`previsione-data`) | date, default oggi | |
| Descrizione (`previsione-descrizione`) | text, placeholder "Quote di aprile ancora da incassare" | si |
| Importo previsto (`previsione-importo`) | text `inputMode="decimal"`, placeholder "820,00" | si, > 0 (migliaia "." e decimali ",") |
| Voce (facoltativa) (`previsione-categoria`) | text, placeholder "Quote" | no |
| Riferimento (facoltativo) (`previsione-riferimento`) | text, placeholder "Delibera, preventivo, contratto" | no |

Submit: **"Registra previsione"** (→ "Salvataggio..."). Payload →
`POST /api/v1/accounting/expected`. Toast: **"Previsione registrata"**.

**3.6 `RemoveExpectedDialog` — "Togliere questa previsione?"**
Corpo: **"{DIRECTION_LABEL} di {importo} — {descrizione}."** + *"Non sparisce
nessun movimento e nessun saldo cambia: una previsione non e mai stata
denaro. Se l'incasso o il pagamento e gia avvenuto, resta registrato in prima
nota."* Conferma: **"Togli la previsione"** (distruttivo, →
"Rimozione..."). `DELETE /api/v1/accounting/expected/:id?direction=income|expense`.
Toast: **"Previsione rimossa"**. **Unico** vero flusso di cancellazione con
conferma sull'intera rotta (una previsione non e mai stata un fatto contabile).

**Allegati:** nessuna UI di upload/visualizzazione allegati esiste su
`/movements` o suoi componenti. Il modello `AccountingLine` porta
`documentKind`/`documentId`/`documentNumber` come citazione di un
documento gia emesso altrove, mai come punto di caricamento file.

**Risoluzione/restrizione della causale (operation type):**
- Lista lato client da `GET /api/v1/fiscal/operation-types`, filtrata per il
  dialog da `operationTypesForDirection`: solo tipi `isActive` con
  `directionHint` nullo (valido per entrambi i versi) o coincidente con il
  verso selezionato.
- Risoluzione/validazione lato server in `src/lib/server/fiscal-config.ts`
  (`resolveClassification` → `resolveOutboundClassification`/
  `resolveInboundClassification`):
  - nessun codice scelto e nessun fallback → non classificato
    (`operation_type_code: null`, `activity_scope_snapshot: "unspecified"`)
  - fallback presente ma irrisolvibile e nulla scelto esplicitamente →
    procede non classificato (non blocca)
  - codice scelto esplicitamente che non esiste → **errore**: *"Causale
    contabile non trovata: {code}. Configurala fra le causali del club prima
    di usarla."*
  - `directionHint` in contrasto col verso del movimento → **errore**: *"La
    causale «{label}» e prevista per {le entrate|le uscite}: su un movimento
    in {entrata|uscita} falserebbe il rendiconto in due punti."*
  - tipo disattivato e scelto esplicitamente → **errore**: *"La causale
    «{label}» e disattivata: riattivala, oppure scegline un'altra."*
  - a successo, `operation_type_label_snapshot` e `activity_scope_snapshot`
    si **congelano** sulla riga (mai riletti dal vivo in seguito)
- Su un movimento manuale la causale e **obbligatoria** (bottone disabilitato
  lato client + `assertAccountingEntryInvariants` lato server: *"Un movimento
  senza causale nasce gia sbagliato..."*). Uno storno eredita la causale
  della riga che compensa e non richiede una nuova scelta.
- La schermata di gestione causali (crea/modifica/disattiva/classifica) e
  `src/components/fiscal/OperationTypesPanel.tsx`, **non montata su
  `/movements`** — solo su `src/app/organization/page.tsx`. Da `/movements` si
  puo solo **scegliere** una causale, mai crearla/modificarla; il testo del
  dialog rimanda esplicitamente altrove.

### A.4 Filters / search / sort / grouping / views

`AccountingFilters` (`src/components/accounting/AccountingFilters.tsx`), stato
`AccountingFilterState` (`src/components/accounting/accounting-view.ts`),
tutti i campi default `""` (`emptyFilters`). **Nessuna persistenza**
(localStorage/sessionStorage/URL) — i filtri vivono solo in stato React e si
azzerano al reload o al remount della scheda.

| Filtro | Controllo | Etichetta | Placeholder "tutti" | Parametro (entries) | Nel riepilogo? |
|---|---|---|---|---|---|
| from | date | "Dal" | — | `from` | si |
| to | date | "Al" | — | `to` | si |
| fiscalYear | Select (anno corrente + 4 precedenti) | "Anno fiscale" | "Tutti gli anni" | `fiscal_year` | si |
| financialAccountId | Select | "Conto" | "Tutti i conti" | `financial_account_id` | si |
| operationTypeCode | Select | "Causale" | "Tutte le causali" | `operation_type_code` | si |
| direction | Select | "Verso" | "Entrate e uscite" ("Solo entrate"/"Solo uscite") | `direction` | si |
| sourceDomain | Select | "Origine" | "Tutte le origini" | `source_domain` | no (non noto al riepilogo) |
| reconciliationStatus | Select | "Riconciliazione" | "Qualsiasi stato" | `reconciliation_status` | no |
| siteId | `SiteFilter` (solo multi-sede) | (etichetta propria) | — | `site_id` | si |
| search | text con icona lente | "Ricerca" | placeholder "Descrizione, controparte, causale, riferimento bancario" | `q` | no |

- `hasReportUnawareFilter(filters)` segnala quando `sourceDomain`/
  `reconciliationStatus`/`search` sono attivi → nota ambra nel riepilogo
- ogni cambio filtro azzera `offset`
- **"Azzera filtri"** compare solo se `hasActiveFilters(filters)`
- nessun controllo di ordinamento in UI — righe sempre "per data
  decrescente, poi id" lato server
- nessuna UI di raggruppamento su `/movements` (il raggruppamento per
  causale/conto/mese/origine esiste in `src/lib/accounting/reporting.ts` ma e
  consumato da `/reports`)
- paginazione: `PAGE_SIZE = 100` fisso, **"Precedenti"/"Successivi"**

### A.5 Bulk actions / selection

Solo sulla scheda «Rate e solleciti», via `useListSelection()` +
`BulkSelectionToolbar` + `SelectAllCheckbox`/`SelectRowCheckbox`:
- righe selezionabili = rate sollecitabili (`row.state !== "paid"`), potate
  automaticamente quando la lista sottostante cambia
- etichette toolbar: `{ one: "rata", many: "rate" }`
- azione: **"Sollecita"** (icona Mail), abilitata solo con selezione non
  vuota e `canSendReminders`; apre `PaymentReminderDialog` con
  `chargeIds={selectedReminderIds}`; `onSent` svuota la selezione e ricarica
- nessuna azione bulk sul registro «Prima nota» stesso (nessuna selezione
  multipla/riconciliazione bulk/export li)

### A.6 Exports / imports

**Nessun controllo di export e cablato su `/movements`** o suoi componenti.
Esiste il modulo e la rotta completi:
- `src/lib/accounting/export.ts` — costruisce il CSV
  (`ACCOUNTING_EXPORT_COLUMNS`, titolo "Prima nota"): colonne **Data, Numero
  documento, Codice causale, Causale, Descrizione, Entrata, Uscita, Conto,
  Metodo, Controparte, Tipo controparte, Documento, Classificazione,
  Imponibile IVA, IVA, Origine, Anno fiscale, Stagione, Sede,
  Riconciliazione, Stornato il, Note**. Entrata/Uscita separate, mai un
  importo con segno; delimitatore `;`, CRLF, BOM, virgola decimale.
- Rotta `GET /api/v1/accounting/export`, permesso `accounting.export` (che la
  segreteria non ha).
- L'unico punto in cui questo e realmente esposto nel client e
  `src/app/reports/accounting-export-button.tsx` +
  `src/app/reports/management-summary.tsx`, cioe **la pagina `/reports`, non
  `/movements`**. **Gap di parita da segnalare esplicitamente**: oggi non
  esiste alcun pulsante di export sulla Prima Nota.
- Nessuna funzione di import (CSV/XLSX) su questa rotta.

### A.7 Permissions / role gates

Matrice centrale: `src/lib/accounting/permissions.ts` (condivisa da pagina e
rotte API, per disegno anti-divergenza).

`AccountingPermission`: `accounting.read`, `accounting.manage`,
`accounting.reconcile`, `accounting.reverse`, `accounting.export`,
`accounting.accounts_read`, `accounting.accounts_manage`,
`accounting.causes_manage`.

| Ruolo | read | manage | reconcile | reverse | export | accounts_read | accounts_manage | causes_manage |
|---|---|---|---|---|---|---|---|---|
| owner / club_manager (AMMINISTRAZIONE) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| collaborator / staff (SEGRETERIA) | ✓ | ✓ | ✓ | — | — | — | — | — |
| trainer / parent / athlete | — | — | — | — | — | — | — | — |

- `canOpenAccounting(role)` → `accounting.read` — gate dell'intera pagina.
- `canManage = hasAccountingPermission(role, "accounting.manage")` — gate dei
  bottoni "Registra movimento"/"Giroconto".
- La visibilita dei saldi **non** si ri-deriva lato client da un permesso:
  la pagina si fida di `report.accountBalances === null` dal server (che
  gia' applica `accounting.accounts_read`) — per evitare la doppia
  valutazione che diverge (nota di codice "W3-14").
- Flag di riga `canReverse`/`canReconcile`/`canEdit`/`canDelete` arrivano dal
  server per riga (`src/lib/accounting/ledger-view.ts`), mai ricalcolati
  lato client: `canEdit = propria && manage && !stornata && !eStorno &&
  !giroconto`; `canReverse = propria && reverse && !stornata && !eStorno`;
  `canReconcile = propria && reconcile && !stornata`; `canDelete` sempre
  `false`. Righe proiettate/legacy hanno tutto `false`.
- `canSendReminders = canManageClubConfigurationAsActor(activeClub?.role)`
  (helper diverso, da `src/lib/access-roles.ts`) — stesso permesso che la
  rotta reminder impone.
- `assertAccountingPermission` genera **"Accesso negato: il ruolo attivo non
  puo {azione negata, minuscolo}"** (mai un "Accesso negato" nudo).

Voci nel catalogo permessi (`src/lib/permissions/catalog.ts`, dominio
`accounting`): `accounting.read` — "Leggere la prima nota e i movimenti del
club" (GESTIONE); `accounting.manage` — "Registrare e modificare un
movimento" (GESTIONE); `accounting.reconcile` — "Riconciliare un movimento
con un incasso" (GESTIONE); `accounting.reverse` — "Stornare un movimento
gia registrato" (DIREZIONE); `accounting.export` — "Esportare la
contabilita del club" (DIREZIONE); `accounting.accounts_read` — "Vedere i
conti correnti del club e i loro saldi" (DIREZIONE); `accounting.accounts_manage`
— "Aprire, modificare e chiudere un conto corrente" (DIREZIONE);
`accounting.causes_manage` — "Configurare le causali contabili del club"
(DIREZIONE). Risorse generiche legacy instradate su `accounting.read`:
`payments`, `simplified_payments`, `payment_plans`, `transactions`,
`transfers`, `invoices`, `receipts`, `expected_income`, `expected_expenses`,
`discounts`, `sponsor_payments`.

### A.8 States

| Superficie | Caricamento | Vuoto/filtrato-vuoto | Errore | Ristretto |
|---|---|---|---|---|
| Intera pagina | — | — | — | **"La prima nota non e accessibile"** |
| Riepilogo | "Calcolo del riepilogo..." | n/d | "Riepilogo non disponibile: la lettura non e riuscita." | "I saldi dei conti non sono visibili" |
| Registro | "Lettura della prima nota..." | "Nessun movimento con questi filtri." | "La prima nota non e stata letta" + msg server | — |
| Scheda Rate | "Lettura delle rate..." | "Nessuna rata registrata per questo club." | (nessuno — errori inghiottiti a `[]`) | — |
| Scheda Previsti | "Lettura delle previsioni..." | "Nessuna previsione registrata per questo club." | "Le previsioni non sono state lette" + msg server | azioni assenti se `!canManage` |
| Saldi conti | n/d | "Nessun conto finanziario configurato..." | n/d | v. sopra |

Indicatore globale di salvataggio: `busy` disabilita filtri/bottoni; ogni
dialog cambia etichetta ("Registrazione...", "Storno...", "Salvataggio...",
"Rimozione..."). Ogni fallimento di scrittura mostra
`showToast("error", response.error.message)` — il messaggio di dominio grezzo,
mai riscritto in generico (scelta di design esplicita).

### A.9 Destructive flows

- **Nessuna cancellazione di un movimento registrato**, in nessun punto.
  `canDelete` e hard-coded `false` ovunque. Regola di fondo: "Il denaro non si
  cancella: si storna" — applicata sia in UI (nessun bottone) sia in API
  (`entries/[id]/route.ts` esporta solo `PATCH`; nessun `DELETE` su
  `entries/route.ts` ne su `entries/[id]/route.ts`).
- **Storno** (unico percorso di correzione): `ReverseEntryDialog` →
  `POST /api/v1/accounting/entries/:id/reverse`, permesso `accounting.reverse`
  (segreteria/staff/collaboratore non ce l'hanno — solo owner/club_manager).
  UI di conferma: titolo "Storna il movimento", motivo obbligatorio, bottone
  distruttivo "Storna". Il server crea la riga di segno opposto e marca
  l'originale con `reversed_at`/`reversal_reason`; entrambe restano visibili.
  Lo storno di un giroconto riguarda **entrambe le gambe** (avviso esplicito
  nel dialog).
- La **riconciliazione** e esplicitamente non distruttiva/non modifica
  numeri — il testo lo dichiara verbatim.
- L'unica vera cancellazione dell'intera rotta e per le **previsioni**
  (fatti non ancora accaduti, non fatti contabili): `RemoveExpectedDialog` →
  `DELETE /api/v1/accounting/expected/:id?direction=income|expense`, permesso
  `accounting.manage`. Il testo di conferma distingue esplicitamente questo
  da una cancellazione di registro.
- La cancellazione di un **conto finanziario** non esiste ne client ne
  server: `PATCH /api/v1/accounting/accounts/:id` supporta solo
  rinomina/archiviazione; nessuna rotta `DELETE`.
- Coperto dai test: `tests/server/accounting-generic-crud-closed.test.mjs`
  (il CRUD generico su `club_resource_items` non puo creare/cancellare/
  modificare righe contabili), `tests/ui/accounting-movements-surface.test.mjs`
  (controllo statico: nessun pattern `confirm()`/delete reintrodotto).

### A.10 Navigation

- Ingresso: voce di navigazione laterale verso `/movements` (titolo header
  "Movimenti").
- Uscite da `AccountingSummary`: **"Riepilogo gestionale completo"** →
  `/reports`; **"Compensi"** → `/sport-work/compensations`.
- **Nessun query param di deep link** e letto/scritto da questa pagina
  (niente `?action=new`; aprire "Registra movimento"/"Giroconto" richiede
  sempre un click, non c'e supporto per atterrare con un dialog gia aperto).
- La scheda selezionata (`tab`) **non** si riflette nell'URL — un refresh
  torna sempre a "Prima nota".
- `AthletePaymentLedger` si apre inline (non una rotta separata) al click su
  una rata; `openLedgerId` la mostra/nasconde, nessuno stato in URL.

### A.11 Related tests

**UI/contratto statico** (`tests/ui/`): `accounting-movements-surface.test.mjs`
(niente aggregatore a 17 chiamate, niente letture morte
suppliers/supplier_payments, niente `confirm()`-based delete, uso della
matrice permessi condivisa e delle sole tre rotte nuove);
`accounting-expected-surface.test.mjs` (la scheda "Previsti" resta separata
dalla cassa, le scritture passano dal server); `accounting-export-surface.test.mjs`
(il bottone export solo per `accounting.export`, nessun `fetch` diretto,
nessuna dicitura "documento ufficiale" — verificato su `/reports`, non su
`/movements`); `causali-e-storni-in-superficie.test.mjs` (ogni superficie che
monta il dialog incassi passa la lista causali); `payment-reminder-contract.test.mjs`
(un solo percorso di invio solleciti, nessun `fetch` diretto che lo bypassi).

**Dominio puro** (`tests/lib/`): `accounting-invariants.test.mjs`
(`assertAccountingEntryInvariants`: verso IN/OUT, importo intero positivo in
centesimi, causale obbligatoria su MANUAL, regole di collegamento
giroconto/storno); `accounting-permissions.test.mjs` (matrice completa dei
ruoli); `accounting-projection.test.mjs` (proiezioni pagamenti/lavoro
sportivo/contributi con segno e classificazione corretti, etichette
congelate); `accounting-reporting.test.mjs` (cassa e competenza mai
mescolate, gambe giroconto escluse, righe non classificate dichiarate);
`accounting-export.test.mjs` (formattazione CSV); `movements-cash-ledger.test.mjs`
/ `movements-cash-vs-due.test.mjs` (rata vs cassa: non pagato/parziale/pagato/
stornato/rimborsato non gonfiano mai "Entrate"); `causale-in-uscita.test.mjs`
(causali in uscita seminate, etichette congelate, regole di deduzione).

**Server/rotta** (`tests/server/`): `accounting-entries.test.mjs` (invarianti
creazione movimento manuale); `accounting-expected-entries.test.mjs` (CRUD
previsioni isolato da cassa/saldi); `accounting-export.test.mjs` (gating
permessi, isolamento multi-club, paginazione oltre 500 righe);
`accounting-reports.test.mjs` (nome/disclaimer riepilogo, separazione
cassa/competenza); `accounting-config-routes.test.mjs` (matrice auth/permessi
su `/accounting/accounts`); `accounting-generic-crud-closed.test.mjs` (CRUD
generico non puo creare/cancellare/modificare righe contabili, giroconti o
previsioni); `accounting-active-club-boundary.test.mjs` (isolamento
cross-club); `financial-accounts.test.mjs` (correttezza saldo derivato);
`fiscal-operation-types.test.mjs` (seeding causali, flag tri-stato).

### A.12 Component inventory

| File | Ruolo | Specifico pagina o condiviso |
|---|---|---|
| `src/app/movements/page.tsx` | Rotta/pagina, orchestratore, schede | specifico |
| `src/components/accounting/AccountingSummary.tsx` | Dashboard KPI finanziario+economico | condiviso in teoria, oggi importato solo qui |
| `src/components/accounting/AccountingFilters.tsx` | Barra filtri del registro | solo movements |
| `src/components/accounting/AccountingEntries.tsx` | Tabella/card registro + azioni riga | solo movements |
| `src/components/accounting/ExpectedEntries.tsx` | Scheda "Previsti": elenco + crea/rimuovi | solo movements |
| `src/components/accounting/AccountingEntryDialogs.tsx` | 4 dialog: Registra/Giroconto/Storna/Riconcilia | solo movements |
| `src/components/accounting/accounting-view.ts` | Helper puri di vista (formattazione, query, causali per verso) | solo movements (usato dai componenti sopra) |
| `src/components/payments/AthletePaymentLedger.tsx` | Registro incassi/rate per atleta | condiviso: anche in `AthleteEnrollmentTab.tsx` |
| `src/components/payments/PaymentReminderDialog.tsx` | Dialog bulk sollecito email | solo movements |
| `src/components/ui/list-selection.tsx` | Primitive di selezione bulk | condiviso, trasversale |
| `src/components/sites/site-filter.tsx` | Filtro/selettore sede (regola ADR-0038) | condiviso |
| `src/lib/accounting/model.ts` | Modello di dominio (versi, origini, tipi conto, riconciliazione, invarianti) | condiviso (anche server) |
| `src/lib/accounting/permissions.ts` | Matrice permessi | condiviso (pagina + rotte API) |
| `src/lib/accounting/ledger-view.ts` | Mappatura riga → `AccountingLine` incl. `canEdit`/`canReverse`/`canReconcile` | server/condiviso |
| `src/lib/accounting/projection.ts` | Proietta righe pagamenti/lavoro sportivo/contributi in `AccountingLine` | server/condiviso |
| `src/lib/accounting/reporting.ts` | Aggregazione riepilogo gestionale | condiviso con `/reports` |
| `src/lib/accounting/export.ts` | Costruzione colonne/righe export CSV | condiviso con il bottone export di `/reports` (non cablato su `/movements`) |
| `src/components/fiscal/OperationTypesPanel.tsx` | Gestione causali (crea/modifica/classifica/disattiva) | **non usato da `/movements`** — solo `/organization` |
| `src/components/fiscal/FiscalProfilePanel.tsx` | Profilo fiscale del club | **non usato da `/movements`** — solo `/organization` |
| `src/lib/fiscal/operation-types.ts` | Modello/seed causali, congelamento classificazione | condiviso, consumato indirettamente via API |
| `src/lib/club-financial-summary.ts` | Aggregatore legacy dei movimenti club | **non usato da `/movements`** — solo `/reports` |

**Gap espliciti da segnalare per il redesign:**
- nessuna UI di creazione/modifica/archiviazione conto finanziario esiste da
  nessuna parte nel client (l'API la supporta, nessuna schermata la chiama);
- nessun export/print su `/movements` stesso (esiste solo su `/reports`);
- nessuna UI di allegati sulla prima nota.

---

## B. `/reports`

**File:** `E:\Download\easygame\src\app\reports\page.tsx` (777 righe),
`accounting-export-button.tsx`, `management-summary.tsx`, `layout.tsx`, oltre
a `src/lib/club-report-utils.ts` (649 righe) e le librerie che importa
(`src/lib/accounting/permissions.ts`, `reporting.ts`, `model.ts`,
`src/lib/csv.ts`, `src/lib/api/client.ts`, `src/lib/club-sites.ts`,
`src/lib/club-seasons.ts`, `src/lib/club-financial-summary.ts`,
`src/lib/category-utils.ts`, `src/lib/category-athlete-stats.ts`,
`src/lib/simplified-db.ts`, `src/components/auth/management-area-layout.tsx`,
`src/components/auth/access-area-guard.tsx`).

Due superfici distinte impilate verticalmente sotto un'unica URL: i
**report di attivita del club** (in alto, `page.tsx`) e il **Riepilogo
gestionale** (in basso, `management-summary.tsx`).

### B.1 Data shown

**Intestazione pagina:** header title **"Report"**.

**Riga KPI in testa** (`page.tsx`, sempre visibile) — 4 `MetricCard`:

| Titolo | Valore | Descrizione | Fonte |
|---|---|---|---|
| **"Atleti nel filtro"** | `athleteCount` | nome categoria o "Tutte le categorie reali del club" | `categoryReport.rows` |
| **"Allenamenti"** | `categoryReport.totalTrainings` | "Allenamenti nel filtro" | `calculateCategoryReport` |
| **"Gare"** | `categoryReport.totalMatches` | "Gare nel filtro" | `calculateCategoryReport` |
| **"Pagato atleti"** | `formatCurrency(paymentReport.totalPaid)` | "Denaro incassato, annullati esclusi" | `calculatePaymentReport` |

**"Report categoria per atleta"** (sempre renderizzata) — tabella
`CategoryAthleteTable`, colonne esatte: **Atleta** (Cognome Nome),
**Categoria**, **Convocazioni / gare** (`n/n`), **Presenze / allenamenti**
(`n/n`), **Senza risposta** (`n/n` o `"—"` se nessuna richiesta), **%
convocazione** (badge), **% presenza** (badge). Fonte:
`calculateCategoryAthleteStats` per categoria via `calculateCategoryReport`.
Vuoto: icona Users, **"Nessun dato categoria"** / *"Il report si popola
quando esistono categorie salvate nel club e atleti associati."*

**"Report presenze"** (icona CalendarDays, blu) — 3 KPI quando ci sono dati:
**"Allenamenti"** (`totalTrainings`), **"Presenze registrate"**
(`presentAttendances/expectedAttendances`, "N% presenze"), **"Presenze
mancanti"** (`missingAttendances`, "N assenze registrate"). Fonte:
`calculateAttendanceReport` (esclude allenamenti annullati). Vuoto: icona
CalendarDays, **"Nessuna presenza reale da mostrare"** / *"Quando verranno
salvati allenamenti e presenze, questa sezione mostrera totali e percentuali
reali."*

**"Report gare e convocazioni"** (icona Trophy, ambra) — 3 KPI quando
`totalMatches>0`: **"Gare"**, **"Convocazioni"** ("N atleti convocati"),
**"Gare senza convocazioni"** ("N% gare compilate"). Fonte:
`calculateMatchConvocationReport` (legge da `training_attendance`/
`club_event_participants.convocation_status`, esclude gare annullate). Vuoto:
icona Trophy, **"Nessuna gara reale nel filtro"** / *"Le convocazioni
appariranno qui quando saranno salvate gare associate alle categorie."*

**"Report pagamenti atleti"** (icona CreditCard, smeraldo) — 4 KPI quando
`hasPayments`: **"Totale dovuto"** ("Pagamenti atleti non annullati"),
**"Pagato"** (con dettaglio rate saldate/parziali), **"In attesa"** (residuo
su N rate), **"Scaduto"** (residuo su N rate). Fonte:
`calculatePaymentReport(movements, period)` — filtra `direction==="income" &&
source==="athlete"`, esclude pagamenti annullati, somma `collectedAmount`
(cassa reale, non l'importo dovuto). Vuoto: icona CreditCard, **"Nessun
pagamento atleta reale"** / *"Questa sezione rimane vuota finche non esistono
pagamenti salvati nel database."*

**Stato vuoto globale "Nessuna categoria salvata"** sopra la griglia KPI
quando `categoryOptions.length === 0`: *"Il filtro categorie mostrera le
categorie reali appena saranno presenti in Club.categories o nelle
associazioni atleta-categoria."*

**Riepilogo gestionale** (`management-summary.tsx`) — titolo card
**"Riepilogo gestionale"** (`MANAGEMENT_REPORT_TITLE`). Disclaimer (sotto il
titolo e ripetuto in fondo): *"Riepilogo interno per cassa e competenza,
calcolato sui dati registrati in EasyGame. Non sostituisce il rendiconto che
la societa deposita o conserva, non e un bilancio e non e stato verificato
da un professionista."* Gate: `canOpenAccounting(role)` — se assente, la
sezione **non renderizza nulla** (nemmeno una card vuota). Fonte:
`GET /api/v1/accounting/reports?<query>`.

- **"Cassa e banca — grandezze finanziarie"**: 4 card — **"Saldo cassa e
  banca"** (o **"Non visibile"** con nota *"I saldi dei conti richiedono un
  permesso che il ruolo attivo non ha. Nessun numero al posto del diniego."*
  se `accounting.accounts_read` manca); **"Incassato nel periodo"**;
  **"Pagato nel periodo"**; **"Giroconti nel periodo"** (nota: *"Denaro
  spostato fra conti della societa... Non e ne un incasso ne un pagamento: la
  liquidita totale non cambia..."*). Ogni `KpiCard` porta anche una riga
  "proprietario" (path del modulo server che possiede il numero, es.
  `src/lib/server/financial-accounts.ts`).
- **"Crediti e debiti — grandezze economiche"**: intro *"Non si sommano ai
  numeri di cassa e non dipendono dal periodo scelto..."*. Card: **"Crediti
  verso le famiglie"**; (condizionale, solo se >0) **"Versato in piu dalle
  famiglie"** (*"Denaro che il club tiene per conto delle famiglie: non e un
  ricavo e non e un credito..."*); **"Insoluti"** ("N rate scadute e non
  saldate. Sono un sottoinsieme dei crediti, non una voce che vi si
  aggiunge."); **"Contributi da ricevere"**; **"Compensi da pagare"**.
- **"Istituzionale e commerciale"**: descrizione *"La classificazione arriva
  dalla causale ed e congelata sul movimento..."*. Griglia a 3: **"Istituzionale"**,
  **"Commerciale"**, **"Non classificato"** (ambra), ciascuna con importo
  entrata/uscita/righe. Se ci sono non classificati, box ambra con la quota
  percentuale di righe e di denaro non classificato; altrimenti box verde
  **"Tutti i movimenti del filtro hanno una classificazione."**
- **"Confronto con l'anno {N}"** (solo se richiesto): descrizione *"Cassa
  contro cassa. Crediti e debiti non entrano in questo confronto..."*. 3
  riquadri: **"Incassato"**, **"Pagato"**, **"Saldo dei movimenti"**, ognuno
  con valore corrente, valore del periodo di confronto e variazione
  percentuale (o "nessuna base di confronto").
- **5 tabelle di raggruppamento** (`GroupTable`, colonne: etichetta,
  **"Entrate"**, **"Uscite"**, **"Saldo"**, **"Righe"**; vuoto: *"Nessun
  movimento nel filtro selezionato."*): **"Per causale"**, **"Per voce di
  rendiconto"**, **"Per conto — movimento del periodo"**, **"Per mese"**
  (nomi mese italiani, o "Senza data"), **"Per origine"** (etichette da
  `SOURCE_DOMAIN_LABELS`: "Movimento manuale", "Giroconto", "Storno",
  "Incasso quota", "Liquidazione contributo", "Compenso lavoro sportivo",
  "Incasso sponsor", "Rimborso").
- Badge **"Promemoria"** + disclaimer ripetuto in fondo.

### B.2 Actions

| Etichetta | Dove | Effetto |
|---|---|---|
| Select "Categoria" | Header azioni | filtro client-side |
| Select "Periodo" | Header azioni | filtro client-side |
| **"Azzera i filtri"** (icona RefreshCw) | `management-summary.tsx` | reset di tutti gli 8 filtri del riepilogo |
| **"Esporta in CSV"** | `accounting-export-button.tsx` | `GET /api/v1/accounting/export?<query>` via `apiDownload`, download client-side |
| Select di filtro (Dal/Al/Anno fiscale/Stagione/Conto/Causale/Sede/Verso/Classificazione/Confronta) | `management-summary.tsx` | ri-esegue `GET /api/v1/accounting/reports` |

Nessun altro bottone/link/menu: nessuna paginazione, nessun drill-down riga
per riga, nessun "vedi dettaglio".

### B.3 Forms

Nessun form/dialog a se stante — la "form" e la barra filtri inline del
Riepilogo gestionale (nessun bottone di submit, ogni cambio si applica da
solo):
- **Dal** / **Al** — `input type="date"`, default vuoto (nessun limite)
- **Anno fiscale** — Select, placeholder **"Tutti gli anni"**, opzioni: anno
  successivo, corrente, e 3 precedenti
- **Stagione sportiva** — Select, placeholder **"Tutte le stagioni"**, da
  `normalizeClubSeasons`
- **Conto** — Select, placeholder **"Tutti i conti"**, da
  `GET /api/v1/accounting/accounts`
- **Causale** — Select, placeholder **"Tutte le causali"**, da
  `GET /api/v1/fiscal/operation-types`
- **Sede** — Select, placeholder **"Tutte le sedi"** — **solo se
  `isMultiSiteClub(sites)`** (ADR-0038)
- **Verso** — Select, placeholder **"Entrate e uscite"** ("Solo entrate"/"Solo
  uscite")
- **Classificazione** — Select, placeholder **"Tutte"** (Istituzionale/
  Commerciale/Non classificato)
- **Confronta con l'anno** — Select, placeholder **"Nessun confronto"**

Validazione: nessuna oltre il nativo `type=date`; selezioni vuote sono
normalizzate a `""` e omesse dalla querystring (per non far leggere
`fiscal_year=` come `0` lato server). **Nessun dialog/modal** ovunque su
`/reports`.

### B.4 Filters / search / sort / grouping / views

**Filtri report in testa (`page.tsx`):**
- **Categoria** — "Tutte le categorie" (default) + opzioni da
  `getClubCategoryOptions`. Letto da query param URL `categoryId` all'avvio;
  se la categoria scompare, si azzera silenziosamente.
- **Periodo** — `PERIOD_OPTIONS` esatte: `{value:"all", label:"Intero
  periodo"}` (default), `{value:"last30", label:"Ultimo mese"}`,
  `{value:"last90", label:"Ultimi 3 mesi"}`. Influenza categoria/presenze/
  gare/pagamenti, **non** eredita nel riepilogo gestionale sottostante (che
  ha filtri propri indipendenti — commento esplicito nel codice).

**Filtri riepilogo gestionale:** 10 in tutto (v. §B.3), **nessuna
persistenza** (localStorage/sessionStorage/URL), azzerati al reload o da
"Azzera i filtri".

**Persistenza di stato:** `localStorage` letto (non scritto qui) per
`activeClub`/`activeClub_<userId>`; query URL letti: `clubId`, `categoryId`.
Nessun controllo di ordinamento/raggruppamento interattivo (il
raggruppamento del riepilogo e fisso, ordinato per valore assoluto
decrescente salvo "Per mese" che e cronologico ascendente). Nessuna casella
di ricerca su `/reports`.

### B.5 Bulk actions / selection

Nessuna. Nessuna checkbox, nessuna selezione riga, nessuna azione multipla.

### B.6 Exports / imports

**`AccountingExportButton`** — unico export della pagina, dentro la toolbar
filtri del riepilogo gestionale:
- non renderizza nulla se manca `clubId` o `accounting.export` — nessuno
  stato "disabilitato", il controllo semplicemente non esiste
- etichetta: **"Esporta in CSV"** (outline, icona Download); durante il
  download: **"Preparazione del file..."** (disabilitato)
- query = gli stessi filtri del riepilogo, con `compareFiscalYear` sempre
  rimosso esplicitamente (l'export non porta mai un anno di confronto)
- nome file: quello proposto dal server (`Content-Disposition`), altrimenti
  fallback client **"prima-nota.csv"**
- formato CSV (`src/lib/csv.ts`, unico proprietario nell'app): delimitatore
  `;`, CRLF, celle quotate se contengono `;`/`"`/ritorni a capo, difesa da
  formula-injection (prefisso `'` su valori che iniziano con
  `=`/`@`/tab/`\r`, o su `+`/`-` solo se assomigliano a una formula — un
  numero di telefono `+39 333…` resta intatto), numeri con virgola
  decimale, BOM UTF-8 sempre presente
- colonne dichiarate (da `src/lib/api/registry.ts`): data, documento,
  causale, descrizione, entrata e uscita in due colonne, conto, metodo,
  controparte, classificazione congelata, IVA, origine, anno fiscale,
  riconciliazione
- errore: messaggio del server **verbatim**, o fallback **"Export non
  riuscito"**
- **nessun export** esiste per i report di attivita in testa alla pagina
  (presenze/gare/categorie/pagamenti) — solo il riepilogo gestionale ha un
  export, dietro `accounting.export`
- nessuna funzione di import ovunque su `/reports`

### B.7 Permissions / role gates

Due sistemi di permesso indipendenti:

**a) Accesso di rotta:** `src/app/reports/layout.tsx` → `ManagementAreaLayout`
→ `AccessAreaGuard` (`canAccessPath(role, pathname, {linkedAthleteIds})` da
`src/lib/access-roles.ts`); mostra solo uno spinner mentre risolve, poi
redirige chi non e autorizzato.

**b) Permessi di dominio contabile** (`src/lib/accounting/permissions.ts`,
stessa matrice di §A.7): `accounting.read` gate dell'intero Riepilogo
gestionale; `accounting.export` gate del bottone "Esporta in CSV";
`accounting.accounts_read` gate della cifra reale in "Saldo cassa e banca"
(altrimenti "Non visibile"). owner/club_manager hanno tutto;
collaborator/staff hanno solo read/manage/reconcile (niente export, niente
saldi); trainer/parent/athlete non hanno accesso contabile.

I **report di attivita del club** in testa alla pagina **non hanno un gate
di permesso esplicito nel componente**: renderizzano per chiunque raggiunga
`/reports` tramite l'`AccessAreaGuard`; i dati tornano semplicemente vuoti se
le chiamate sottostanti sono negate per quel ruolo.

### B.8 States

- **Caricamento iniziale pagina:** loader a pagina intera —
  `AppLoadingScreen subtitle="Caricamento report reali..."`.
- **Nessun club attivo:** toast errore **"Nessun club attivo trovato"**,
  stato report azzerato a vuoto.
- **Stati vuoti** (v. §B.1): "Nessuna categoria salvata" / "Nessun dato
  categoria" / "Nessuna presenza reale da mostrare" / "Nessuna gara reale nel
  filtro" / "Nessun pagamento atleta reale" — le stesse coincidono con lo
  stato "filtrato-vuoto" (nessun messaggio distinto per "zero risultati per
  questo filtro").
- **Riepilogo in caricamento:** testo inline **"Ricalcolo del riepilogo..."**
  (i dati precedenti restano visibili finche non sono sostituiti).
- **Conteggio righe:** **"{n} movimenti considerati"**, con **" · {n}
  esclusi perche stornati"** se >0.
- **Errore riepilogo:** box ambra col messaggio del server o fallback
  **"Riepilogo non disponibile"**.
- **Avviso di troncamento** (box ambra): normale — **"Questi totali non
  coprono tutto il periodo."** + dettaglio; di confronto — **"Il confronto
  non copre tutto il periodo precedente."** + dettaglio.
- **Ristretto (`accounting.read` assente):** l'intera sezione Riepilogo
  gestionale rende `null` — nulla, nemmeno un messaggio di diniego.
- **Saldi ristretti (`accounts_read` assente):** **"Non visibile"** + nota
  (mai "0,00 EUR").
- **Export in corso:** **"Preparazione del file..."**, disabilitato.
- **Errore export:** messaggio server grezzo o **"Export non riuscito"**.

### B.9 Destructive flows

Nessuno. Nessuna azione di cancellazione/storno/annullamento esiste su
`/reports` — e una superficie di sola lettura + export.

### B.10 Navigation

- **Ingresso:** navigazione laterale standard; accetta query param opzionali
  `clubId` (fallback club attivo) e `categoryId` (preseleziona il filtro
  Categoria).
- **Uscita:** **nessun link in uscita** trovato in nessuno dei quattro file
  (nessun "vai al profilo atleta", nessun "vai a movimenti") — pagina
  terminale a parte la chrome condivisa Sidebar/Header.

### B.11 Related tests

`tests/lib/reports-period-filter.test.mjs` (il filtro Periodo si applica al
report pagamenti, finestre diverse per "Ultimo mese"/"Ultimi 3 mesi");
`tests/lib/report-convocazioni-canoniche.test.mjs` (convocazioni lette da
righe canoniche, non da campi legacy, gare annullate escluse);
`tests/lib/reports-cash-invariant.test.mjs` (le cifre di cassa del report
pagamenti coincidono con la verita di `/movements`, gestiscono stornati/
parziali/legacy/annullati); `tests/lib/attendance-report-performance.test.mjs`
(scala linearmente, non quadraticamente, con il numero di atleti);
`tests/lib/accounting-reporting.test.mjs` (cassa/competenza mai mescolate,
gambe giroconto escluse, righe non classificate dichiarate, guardia sul bug
`fiscal_year=0`, guardia sulle parole vietate "ufficiale"/"conforme"/"a
norma"/"per il deposito"); `tests/lib/accounting-export.test.mjs` (formato
CSV); `tests/server/accounting-reports.test.mjs` (titolo/disclaimer,
separazione cassa/competenza, gating permessi — "l'allenatore non vede il
riepilogo gestionale", "la segreteria vede il riepilogo, e i saldi le
restano null — non zero", isolamento multi-tenant); `tests/ui/accounting-export-surface.test.mjs`
(bottone export solo per `accounting.export`, nessun `fetch` diretto, query
export rispecchia i filtri a schermo, nessuna dicitura da documento
ufficiale); `tests/ui/responsive-invariants.test.mjs` (include
`app/reports/page.tsx`: nessun `grid-cols-2` senza breakpoint, sicuro a
375px); `tests/auth/route-guards.test.mjs` (guardia di rotta generale,
copre `AccessAreaGuard`/`canAccessPath` usati da `layout.tsx`).

### B.12 Component inventory

| File | Ruolo | Specifico pagina o condiviso |
|---|---|---|
| `src/app/reports/page.tsx` | Pagina principale; definisce `MetricCard`, `EmptyState`, `CategoryAthleteTable`, `AttendanceSection`, `MatchSection`, `PaymentSection` | specifico |
| `src/app/reports/management-summary.tsx` | `ManagementSummary` + `KpiCard`/`GroupTable` locali | specifico (importato solo da `page.tsx`) |
| `src/app/reports/accounting-export-button.tsx` | `AccountingExportButton` | specifico, un livello sotto |
| `src/app/reports/layout.tsx` | Re-export di `ManagementAreaLayout` | wiring specifico, componente sottostante condiviso |
| `src/components/dashboard/Header`, `Sidebar`, `dashboard-page-container`, `shared-page-header` | Chrome di pagina | condivisi (35-45 importatori) |
| `src/components/ui/app-loading-screen`, `badge`, `card`, `select`, `toast-notification`, `input`, `button` | Primitive UI | condivisi, trasversali |
| `src/components/auth/management-area-layout.tsx`, `access-area-guard.tsx` | Layout/guardia di area di gestione | condivisi con altre rotte di gestione |
| `src/lib/club-report-utils.ts` | `calculateAttendanceReport`, `calculateCategoryReport`, `calculateMatchConvocationReport`, `calculatePaymentReport`, `getClubCategoryOptions`, `isAthletePaymentMovement` | condiviso (motore di questa pagina) |
| `src/lib/club-financial-summary.ts` | `loadClubFinancialSources`, `aggregateClubPayments` | condiviso |
| `src/lib/simplified-db.ts` | `getClub`, `getClubAthletes`, `getClubData` | condiviso, trasversale |
| `src/lib/category-utils.ts`, `category-athlete-stats.ts` | Opzioni categoria, motore statistiche per-atleta | condivisi |
| `src/lib/accounting/permissions.ts`, `reporting.ts`, `model.ts` | Permessi, aggregazione riepilogo, modello di dominio | condivisi con `/movements` |
| `src/lib/club-sites.ts`, `club-seasons.ts` | Multi-sede (ADR-0038), stagioni | condivisi |
| `src/lib/csv.ts` | `downloadCsv` | condiviso, usato dall'export button |
| `src/lib/api/client.ts` | `apiRequest`, `apiDownload` | condiviso, trasversale |

**Endpoint API toccati da `/reports`:** `GET /api/v1/accounting/accounts?organization_id=` (filtro Conto), `GET /api/v1/fiscal/operation-types?organization_id=` (filtro Causale), `GET /api/v1/accounting/reports?<query>` (riepilogo gestionale), `GET /api/v1/accounting/export?<query>` (export CSV). Letture indirette non-REST via `simplified-db.ts`/Supabase diretto: `getClub`, `getClubAthletes`, `getClubData("trainings"|"matches"|"categories")`, lettura diretta `training_attendance`, `loadClubFinancialSources`.

---

## C. `/procura`

**File:** `E:\Download\easygame\src\app\procura\page.tsx` (1.691 righe, letto
integralmente in blocchi 0-400/400-800/800-1200/1200-1691). Layout:
`E:\Download\easygame\src\app\procura\layout.tsx` → ri-esporta
`@/components/auth/management-area-layout`.

**Cosa significa davvero «procura» qui (dal codice, non per assunzione).**
Nonostante viva nel gruppo sidebar «PERSONE» insieme ad Atleti/Allenatori/
Staff/Soci, **`/procura` non ha nulla a che fare con `athlete_guardians` o
il consenso dei tutori**. Non esiste ne `src/components/procura/**` ne
`src/components/contacts/**` in questo repository. La funzionalita e un
**record CRM legacy in forma libera**, salvato come blob JSON nella colonna
`clubs.procure`, e il codice stesso documenta che il termine italiano
«procura» e sovraccarico:

`src/lib/sport-work/legacy-migration.ts` (righe 16-19): *«"Procura" copre
quattro fattispecie con regimi diversi — agente sportivo, delega, mandato al
pagamento, rapporto economico — e la voce non dichiara quale sia.»*

Coerentemente, il test `tests/lib/sport-work-legacy-migration.test.mjs:117`
si chiama **"una procura resta dov'e: la parola significa quattro cose"** e
verifica che `classifyProcura()` (dal modulo sport-work) classifichi sempre
le righe di `clubs.procure` come da rivedere a mano, **mai** migrate in
automatico nel nuovo modello agente/mandato di `/sport-work` (che ha un
proprio tipo documento `MANDATE: "Mandato o procura"` in
`src/lib/sport-work/model.ts:651`, concetto diverso e non collegato). In
sintesi: il target del redesign e uno **schermo CRUD client-only su una
colonna JSON ad array**, non un modulo contatti/agenti con un dominio
server dedicato.

### C.1 Data shown

**Elenco principale — card "Procure Registrate".** Colonne tabella (testo
esatto degli `<th>`): **"Nome Procura"** (nome in grassetto + sottotesto
`address?.city || "N/A"`); **"Contatti"** (Badge **"{n} contatti"**);
**"Atleti"** (Badge, numero grezzo); **"Allenatori"** (Badge, numero
grezzo); **"Azioni"** (icone Modifica/Elimina). Intestazione card: titolo
**"Procure Registrate"**, descrizione **"{n} procure totali"**. Riga vuota
(colSpan 5): icona `Scale` (opacita 50%) + **"Nessuna procura trovata"**. Il
click sulla riga seleziona la procura (evidenziata `bg-blue-50`). Fonte:
`getClubData(activeClub.id, "procure")`.

**Pannello di dettaglio — card "{nome procura}"** (solo se una riga e
selezionata). Header: nome + bottone **"Modifica Informazioni"**. Tre
scheda (`Tabs defaultValue="info"`): **Informazioni**, **Pagamenti**,
**Associazioni**.

- **Informazioni:** **"Indirizzo Sede"** (icona MapPin) → via, poi CAP
  Città (Provincia), poi Paese, riga per riga; **"Contatti Procuratori"** →
  card per contatto con Nome Cognome, telefono (icona Phone), email (icona
  Mail); vuoto: **"Nessun contatto registrato"**.
- **Pagamenti:** intestazione **"Storico Pagamenti"** + bottone **"Nuovo
  Pagamento"**. Ogni card: nome persona (risolto da atleti/allenatori per
  `personId`, fallback **"Sconosciuto"**), data (`toLocaleDateString("it-IT")`),
  descrizione opzionale, importo **"€{importo.toFixed(2)}"** verde
  (`TrendingUp`) per entrata o rosso (`TrendingDown`) per uscita, Badge
  **"Entrata"** (default) / **"Uscita"** (destructive). Vuoto: icona Euro +
  **"Nessun pagamento registrato"**.
- **Associazioni:** intestazione **"Atleti e Allenatori Associati"** +
  bottone **"Aggiungi Associazione"**. Sotto-sezioni **"Atleti"** /
  **"Allenatori"** (h4): card con nome persona (fallback "Sconosciuto"),
  **"Costo: €{costo.toFixed(2) || "0.00"}"**, nota opzionale in corsivo
  **"Note: {note}"**; icone azione: nota adesiva (gialla se ci sono note,
  grigia altrimenti, `title="Aggiungi/Modifica Note"`), Modifica, Elimina.
  Vuoto: **"Nessun atleta associato"** / **"Nessun allenatore associato"**.

**Chrome di pagina:** `Header title="Gestione Procure"` (diverso dal titolo
in pagina!); `SharedPageHeader title="Procura" subtitle="Gestisci le procure
e i relativi documenti associati ai tesserati."` — **la sottotitolo promette
"documenti associati" ma non esiste alcuna funzione documenti/upload in
questo file**: nessuna scheda "Documenti", nessun file input, nessuna
gestione allegati. Gap di contenuto reale da segnalare (copy non aggiornato,
o funzione documenti tolta senza aggiornare il testo). Nessuna card KPI/
statistica sulla pagina.

### C.2 Actions

Nessuna chiamata `fetch`/`apiRequest` diretta dentro `page.tsx` (verificato a
grep) — tutto passa da `src/lib/simplified-db.ts`.

| Etichetta | Dove | Comportamento | Chiamata sottostante |
|---|---|---|---|
| **"Nuova Procura"** (Plus) | Header elenco | Reset form, apre dialog creazione | nessuna (solo dialog) |
| **"Modifica Informazioni"** (Edit) | Header pannello dettaglio | Apre dialog precompilato via `editProcura()` | nessuna |
| Icona Modifica riga | Riga tabella | `editProcura(procura)` | nessuna |
| Icona Elimina riga (Trash2) | Riga tabella | `deleteProcura(procura.id)` | `deleteClubDataItem(clubId,"procure",id)` |
| **"Aggiungi Contatto"** (UserPlus) | Dentro dialog procura | Apre dialog contatto annidato | nessuna |
| Icona Modifica contatto | Card contatto nel dialog | Precompila e riapre il dialog contatto | nessuna |
| Icona Elimina contatto (Trash2) | Card contatto nel dialog | `deleteContactFromProcura(id)` — rimuove solo dal draft in memoria, **non persistito finche non si salva il dialog esterno** | nessuna |
| **"Annulla"/"Aggiungi"/"Aggiorna"** (dialog contatto) | Footer dialog contatto | chiude / `addContactToProcura()` (solo locale) | nessuna |
| **"Annulla"/"Aggiorna"/"Salva"** (dialog procura) | Footer dialog procura | chiude / `saveProcura()` (persiste l'intera procura inclusi i contatti annidati) | `addClubData` o `updateClubDataItem` |
| **"Nuovo Pagamento"** | Scheda Pagamenti | Apre dialog pagamento, reset form | nessuna |
| **"Salva"** (dialog pagamento) | Dialog pagamento | `addPayment()` | `updateClubDataItem` (riscrive l'intera procura con l'array `payments` aggiornato) |
| **"Aggiungi Associazione"** | Scheda Associazioni | Apre dialog associazione | nessuna |
| **"Salva"/"Aggiorna"** (dialog associazione) | Dialog associazione | `addAssociation()` (delega a `updateAssociation()` se in modifica) | `updateClubDataItem` |
| Icona Modifica associazione | Card associazione | `editAssociation(assoc, type)`, blocca il Select "Tipo" (`disabled`) | nessuna |
| Icona Elimina associazione (Trash2) | Card associazione | `deleteAssociation(personId, type)` — `confirm()` nativo | `updateSelectedProcura` → `updateClubDataItem` |
| Icona Note (StickyNote) | Card associazione | Apre dialog note, precompila `notes` esistenti | nessuna |
| **"Salva Note"** (Save) | Dialog note | `saveAssociationNotes()` | `updateSelectedProcura` → `updateClubDataItem` |

Nessun link di navigazione esterno dalla pagina (nessun `<Link>`/`router.push`
oltre alla chrome globale Sidebar/Header/nav mobile).

### C.3 Forms

**Dialog "Nuova Procura" / "Modifica Procura"** (titolo cambia in base al
modo):

| Campo | Etichetta | Tipo | Obbligatorio | Placeholder | Note |
|---|---|---|---|---|---|
| name | **"Nome Procura *"** | text | si (bloccato client-side: *"Inserisci il nome della procura"*) | "Es. Studio Legale Rossi" | |
| address.street | (gruppo "Indirizzo Sede Procura") | text | no | "Via/Piazza" | |
| address.city | idem | text | no | "Città" | griglia 2 col con provincia |
| address.province | idem | text | no | "Provincia" | |
| address.postalCode | idem | text | no | "CAP" | griglia 2 col con paese |
| address.country | idem | text | no | "Paese" | default `"Italia"` su form nuovo |
| contacts | **"Contatti Procuratori"** (con bottone annidato "Aggiungi Contatto") | lista ripetibile, gestita da dialog annidato | no | — | vuoto: **"Nessun contatto aggiunto"** |

Footer: **"Annulla"**, **"Aggiorna"/"Salva"** → `saveProcura()`. Errori
(toast esatti): nome mancante → **"Inserisci il nome della procura"**;
nessun club attivo → **"Club non trovato"**; generico →
`error.message` o **"Errore nel salvataggio della procura"**. Successo:
**"Procura aggiornata con successo"** (modifica) / **"Nuova procura aggiunta
con successo"** (creazione). ID generato client-side
`procura_${Date.now()}` — **diverso** dallo schema che genererebbe
`addClubData` stesso (`${dataType}-${Date.now()}-${random}`), ma l'id
fornito dalla pagina prevale.

**Dialog "Nuovo Contatto" / "Modifica Contatto"** (annidato):

| Campo | Etichetta | Tipo | Obbligatorio | Placeholder |
|---|---|---|---|---|
| firstName | **"Nome *"** | text | si (bloccato: *"Inserisci nome e cognome del contatto"*) | "Nome" |
| lastName | **"Cognome *"** | text | si (stesso controllo) | "Cognome" |
| phone | **"Telefono"** | text | no | "+39 123 456 7890" |
| email | **"Email"** | `type="email"` | no | "email@example.com" |

Footer: **"Annulla"**, **"Aggiungi"/"Aggiorna"** → `addContactToProcura()`
(solo in memoria, persistito solo al salvataggio del dialog esterno). ID
`contact_${Date.now()}`. **Nessuna gestione allegati/documenti in nessun
dialog della pagina.**

**Dialog "Nuovo Pagamento"** (nessuna variante di modifica — i pagamenti si
possono solo aggiungere, mai modificare o eliminare):

| Campo | Etichetta | Tipo | Obbligatorio | Default | Opzioni |
|---|---|---|---|---|---|
| personType | **"Tipo Persona"** | Select | implicito | `"athlete"` | **Atleta**/**Allenatore** (cambia anche azzera `personId`) |
| personId | **"Persona"** | Select, placeholder **"Seleziona..."** | si (*"Compila tutti i campi obbligatori"*) | vuoto | **solo** atleti/allenatori gia associati a questa procura |
| date | **"Data"** | date | implicito | `todayLocalDateOnly()` | |
| amount | **"Importo (€)"** | number | si (stesso controllo) | 0 | placeholder "0.00" |
| type | **"Tipo"** | Select | implicito | `"entrata"` | **Entrata**/**Uscita** |
| description | **"Descrizione"** | Textarea | no | vuoto | placeholder "Descrizione del pagamento" |

Footer: **"Annulla"**, **"Salva"** → `addPayment()`. Successo: **"Pagamento
aggiunto con successo"**. Errore: **"Errore nell'aggiunta del pagamento"**.
ID `payment_${Date.now()}` (nessuna protezione da collisione oltre il
timestamp).

**Dialog "Nuova Associazione" / "Modifica Associazione":**

| Campo | Etichetta | Tipo | Obbligatorio | Default | Note |
|---|---|---|---|---|---|
| personType | **"Tipo"** | Select | implicito | `"athlete"` | **disabilitato in modifica** |
| personId | **"Persona"** | Select, placeholder **"Seleziona..."** | si (*"Seleziona una persona da associare"*) | vuoto | **tutti** gli atleti/allenatori del club (non filtrati sui non-associati — possibili duplicati, nessun de-dup) |
| cost | **"Costo (€)"** | number | implicito (0 ok) | 0 | placeholder "0.00" |

Footer: **"Annulla"** (azzera anche lo stato di modifica), **"Salva"/"Aggiorna"**
→ `addAssociation()` (delega a `updateAssociation()` se in modifica).
Successo (solo creazione): **"Associazione aggiunta con successo"**.
Errore: **"Errore nell'aggiunta dell'associazione"**. Chiudere il dialog
cliccando fuori (`onOpenChange(false)`) azzera il form — percorso diverso da
un click esplicito su "Annulla", stesso stato finale. **Modificare
un'associazione permette anche di cambiare la persona a cui punta**
(`personId` resta pienamente editabile).

**Dialog "Note Associazione":** campo unico **"Note"** (Textarea, 5 righe,
placeholder "Inserisci note per questa associazione..."). Footer:
**"Annulla"**, **"Salva Note"** → `saveAssociationNotes()`. Nessuna
validazione; nessun toast dedicato (usa il generico **"Modifiche salvate con
successo"** di `updateSelectedProcura`).

### C.4 Filters / search / sort / grouping / views

Un solo campo di ricerca (`searchQuery`): filtro case-insensitive per
sottostringa **solo sul nome** (`p.name.toLowerCase().includes(...)`) —
nessun filtro per citta, contatti o associazioni. Nessun ordinamento
predefinito (ordine di ritorno dell'array JSON). Nessuna persistenza
(URL/localStorage) per ricerca o selezione — `searchQuery` e
`selectedProcura` sono `useState` puri, azzerati al reload. Nessuna vista
lista/griglia alternativa, nessun raggruppamento.

### C.5 Bulk actions / selection

Nessuna. Solo selezione a riga singola (`selectedProcura`) per pilotare il
pannello di dettaglio; nessuna checkbox, nessuna selezione multipla, nessun
export/delete bulk.

### C.6 Exports / imports

Nessuno. Nessun export CSV/PDF/XLSX e nessuna funzione di import su questa
pagina.

### C.7 Permissions / role gates

**Nessuna chiave di permesso dedicata a "procura"** in
`src/lib/permissions/catalog.ts` (nessun risultato per "procura"/"contact"/
"agent"). L'accesso e gated solo a livello di **area/rotta**:
- `layout.tsx` → `ManagementAreaLayout` → monta `AccessAreaGuard`.
- `getPathAccessArea("/procura")` → `"management"` perche `/procura` e
  elencata in `MANAGEMENT_PATH_PREFIXES` (`src/lib/access-roles.ts:316`).
- `canAccessPath` richiede quindi un ruolo in
  `MANAGEMENT_ROLES = {owner, club_manager, collaborator, staff}`; `/procura`
  **non** e in `MANAGEMENT_ADMIN_ONLY_PATH_PREFIXES`, quindi tutti e
  quattro i ruoli (inclusi ruoli personalizzati basati su essi) possono
  aprirla — **non esiste un interruttore per-funzione piu fine** che un
  proprietario possa usare per nasconderla, ad esempio, a un
  `collaborator`.
- Presente ridondantemente anche nell'allowlist di
  `src/middleware.ts:89` (`"/procura"`) e in
  `tests/auth/route-guards.test.mjs:31` (`MANAGEMENT_ROUTE_DIRS`).

Nessuna logica di permesso a livello di riga/proprieta dentro la pagina
stessa (nessun controllo "solo le mie procure").

### C.8 States

- **Caricamento:** lo stato `loading` esiste (`setLoading(true/false)`
  attorno al fetch) ma **nessuna UI di caricamento/spinner risulta
  renderizzata condizionalmente su di esso** — la pagina rende comunque
  l'intera struttura, e la tabella con array `procure` ancora vuoto cade
  nello stato "vuoto" sotto finche i dati non arrivano (probabile lacuna/bug
  latente, non un vero stato di caricamento visibile).
- **Vuoto (nessuna procura, o filtro a zero risultati):** stessa identica
  riga — icona `Scale` (opacita 50%) + **"Nessuna procura trovata"** — sia
  a zero procure sia a ricerca senza risultati (nessun testo distinto per
  "nessun risultato per questo filtro").
- **Errore (fallimento caricamento dati):** toast **"Errore nel caricamento
  dei dati"**. I sotto-fetch singoli (procure/atleti/allenatori) falliscono
  silenziosamente a array vuoti con solo `console.warn` (*"Procure not
  found, using empty array"*, ecc.) — **nessuno stato di errore visibile
  all'utente** per fallimenti parziali.
- **Ristretto:** gestito interamente da `AccessAreaGuard` upstream — un
  ruolo non ammesso viene reindirizzato prima che la pagina monti; nessun
  messaggio "accesso negato" in pagina.
- **Pannello dettaglio vuoto:** non renderizzato affatto finche
  `selectedProcura` non e impostato — nessun placeholder "seleziona una
  procura".

### C.9 Destructive flows

**Nessuno storno/revoca-solo-documento**: le cancellazioni sono **rimozioni
dure reali** dall'array JSON, diverso da pattern altrove nell'app che
prevedono lo storno.

| Azione | Conferma | Meccanismo | Chiamata API |
|---|---|---|---|
| Elimina procura | `confirm("Sei sicuro di voler eliminare questa procura?")` nativo | `deleteProcura` → `deleteClubDataItem(clubId,"procure",id)` | legge e riscrive l'intera colonna `procure` — elemento espulso del tutto, nessun tombstone |
| Elimina associazione | `confirm("Sei sicuro di voler eliminare questa associazione?")` nativo | filtro locale + `updateSelectedProcura` | stesso meccanismo di riscrittura |
| Elimina contatto (nel dialog procura) | **nessuna conferma** — click immediato su Trash2 | `deleteContactFromProcura` (solo draft in memoria), permanente solo al salvataggio del dialog esterno | nessuna finche non si salva |
| Elimina pagamento | **non possibile** — nessuna azione di modifica/eliminazione per un pagamento gia aggiunto | — | — |

**Endpoint esatti** (tracciati via `getClubData`/`addClubData`/
`updateClubDataItem`/`deleteClubDataItem` in `src/lib/simplified-db.ts`):
- Lettura: `GET /api/v1/clubs?id={clubId}&fields=procure`
- Scrittura: `PATCH /api/v1/clubs/{clubId}?fields=id` con corpo
  `{ data: { procure: <array completo> } }`

Ogni mutazione (crea/modifica/elimina procura, aggiungi pagamento, crea/
modifica/elimina associazione, salva note) fa un **read-modify-write
dell'intera colonna JSON `procure`** — non esiste un endpoint PATCH/DELETE
per singolo elemento; "elimina" e implementato come "riscrivi l'array senza
quell'elemento". Non e il pattern "niente DELETE, solo storno" con
semantica di dominio — e una sovrascrittura tecnica dell'intera colonna, e
il dato rimosso e realmente perso (nessun flag di soft-delete, nessuna
traccia audit lato client).

### C.10 Navigation

**Ingressi:** Sidebar desktop (`src/components/dashboard/Sidebar.tsx:95`),
gruppo **"PERSONE"**: `{ id: "procura", label: "Procure", href: "/procura",
icon: Scale }`. Top bar mobile (`src/components/layout/MobileTopBar.tsx:113`):
`{ href: "/procura", label: "Procura", icon: Shield }` — **nota: mismatch di
etichetta** (mobile singolare "Procura", desktop plurale "Procure") e
**icona diversa** (`Scale` desktop vs `Shield` mobile). Header mobile
(`src/components/ui/mobile-header.tsx:150`): stessa etichetta "Procura",
icona `Shield`.

**Uscite:** nessuna — la pagina non ha link verso altre rotte, nessun
parametro di deep-link, nessuna chiamata `router.push`.

**Collegamento incrociato di dati (non di navigazione):** i pagamenti
inseriti qui (`selectedProcura.payments`) sono aggregati da
`src/lib/club-financial-summary.ts` come una delle sorgenti
`ClubMovementSource` (`"procura"`), con etichetta italiana **"Procura"** e
descrizione di fallback **"Pagamento procura"**,
`_sourceTable: "procure.payments"`. Cio significa che quanto salvato nella
scheda "Pagamenti" di `/procura` compare probabilmente anche nelle vedute
consolidate Pagamenti/Movimenti altrove nell'app — un redesign deve
preservare questa forma (`procura_id`, `procura_name`, `procura_email`,
`procura_phone` sono i nomi di campo letti da quell'aggregatore).

### C.11 Related tests

`tests/auth/route-guards.test.mjs` — verifica che ogni directory in
`MANAGEMENT_ROUTE_DIRS` (inclusa `"procura"`) abbia un layout che monta
`AccessAreaGuard`/`management-area-layout`; non e logica di business
specifica di procura, solo copertura del guard di rotta.
`tests/lib/sport-work-legacy-migration.test.mjs:117` ("una procura resta
dov'e: la parola significa quattro cose") — verifica che `classifyProcura()`
restituisca sempre un esito "da classificare"/solo-legacy per le righe di
`clubs.procure` e non le migri mai automaticamente nel nuovo modello
agente/mandato di sport-work, anche quando la riga sembra avere pagamenti.
Confema l'intento di prodotto: questo schermo legacy non va ripiegato in
`/sport-work` senza una decisione umana per record. **Nessun test a livello
di componente o e2e esiste specificamente per `src/app/procura/page.tsx`.**

### C.12 Component inventory

| File | Ruolo | Specifico pagina o condiviso |
|---|---|---|
| `src/app/procura/page.tsx` | L'intera funzionalita (elenco, dettaglio, 5 dialog) | specifico |
| `src/app/procura/layout.tsx` | Monta il guard di area di gestione | specifico, delega al layout condiviso |
| `src/components/auth/management-area-layout.tsx` | Avvolge i figli in `AccessAreaGuard` | condiviso (ogni rotta di gestione) |
| `src/components/auth/access-area-guard.tsx` | Guardia di rotta per ruolo/area, redirect | condiviso, trasversale |
| `src/components/dashboard/Sidebar.tsx` | Nav desktop incl. voce "Procure" | condiviso |
| `src/components/dashboard/Header.tsx` | Barra superiore, riceve `title="Gestione Procure"` | condiviso |
| `src/components/dashboard/dashboard-page-container.tsx` | Scaffold layout pagina | condiviso |
| `src/components/dashboard/shared-page-header.tsx` | Blocco titolo/sottotitolo in pagina | condiviso |
| `src/components/ui/card.tsx`, `button.tsx`, `input.tsx`, `label.tsx`, `textarea.tsx`, `toast-notification.tsx`, `tabs.tsx`, `dialog.tsx`, `select.tsx`, `badge.tsx` | Primitive UI | condivise, trasversali |
| `src/components/providers/AuthProvider.tsx` | Fornisce `activeClub`, `user` | condiviso, contesto auth app-wide |
| `src/lib/date-only.ts` (`todayLocalDateOnly`) | Data "oggi" timezone-safe per il default data pagamento | condiviso |
| `src/lib/simplified-db.ts` (`getClubData`, `addClubData`, `updateClubDataItem`, `deleteClubDataItem`, `getClubAthletes`) | CRUD generico su colonna JSON per-club, dietro `/api/v1/clubs` | condiviso, usato anche da altri moduli "simplified" legacy |

Nessun componente sotto questa pagina e esclusivo di procura a parte
`page.tsx`/`layout.tsx` — tutto il resto e UI/infrastruttura generica
riusata in tutta l'app. Le icone `FileText`, `User` e `Search` sono
importate ma **risultano inutilizzate nel JSX renderizzato** — da segnalare
come import morti da pulire, e conferma ulteriore che non esiste alcuna UI
di documenti (`FileText`) nonostante il sottotitolo di pagina li citi.

---

## D. `/payments` — «Quote e rate» (inventario sintetico)

**Rotta:** `src/app/payments/page.tsx` (5 righe) chiama `redirect("/movements")`;
`src/app/payments/layout.tsx` ri-esporta `management-area-layout`. La
superficie reale vive in `src/app/movements/page.tsx`, scheda **"Rate e
solleciti"** (v. §A). `/payments` resta comunque in `MANAGEMENT_PATH_PREFIXES`
(`src/lib/access-roles.ts:314`) e nel prefisso "richiede sessione" di
`src/middleware.ts:86`, ma **non** in `MANAGEMENT_ADMIN_ONLY_PATH_PREFIXES`.

### D.1 Data shown

Tab bar della pagina ospite: **"Prima nota"** · **"Rate e solleciti"** ·
**"Previsti"**. Tabella "Rate e solleciti": checkbox, **Scadenza**,
**Atleta**, **Descrizione**, **Dovuto**, **Incassato**, **Stato**. Badge di
stato (`src/lib/payments/installment-ledger.ts`): **"IN ATTESA"**,
**"PARZIALMENTE PAGATA"**, **"PAGATA"**, **"SCADUTA"** (combinabili).

Dettaglio per rata (`InstallmentLedgerList.tsx`): etichetta, badge di stato,
**"Scadenza {data}"** / "Scadenza non definita", barra di progresso, **"{pagato}
/ {dovuto} pagati"**, **"Residuo {importo}"** (ambra se >0, smeraldo se 0);
se coperta da voucher: **"su {dueAmount} di quota"** + box copertura:
*"Coperta da voucher per {plannedCoverage} · a carico della famiglia
{familyDueAmount}"*, *"Maturato {accrued} · liquidato dall'ente {settled}"*,
*"La copertura non e un incasso: entra in cassa solo quando l'ente versa."*

Righe transazione: **Data**, **Importo**, **Metodo**, **Note**, **Azioni**;
storni/rimborsi mostrano **"Storno — {motivo}"**, **"Rimborso — {note}"**,
**"Stornato il {data} — {motivo}"**, badge **"Rimborso in elaborazione"**.

Totali atleta (`AthletePaymentLedger.tsx`): titolo **"Pagamenti della
famiglia"**; riquadri **"Totale rate"**, **"Incassato"**, **"Residuo"** (con
"N rate scadute per {importo}" se presente); nota: *"Voucher e contributi
degli enti sono contati a parte: un contributo maturato e un credito, non
denaro incassato."*

Voucher/contributi (`AthleteFundingSummary.tsx`, `FundingProgramDetail.tsx`):
**"Massimale programma"**, **"Assegnato al club"**, **"Impegnato sulle
rate"**, **"Previsione EasyGame"**, **"Maturato"**, **"Rendicontato"**,
**"Liquidato"**, **"Voucher da ricevere"**, **"Residuo"**. Badge stato
programma: **"BOZZA"**, **"ATTIVO"**, **"CHIUSO"**. Badge iscrizione:
**"ATTIVA"**, **"SOSPESA"**, **"CHIUSA"/"REVOCATO"**. Stati periodo
(`FundingPeriodsTable.tsx`): **"PREVISTO"**, **"NON MATURATO"**, **"DA
CONFERMARE"**, **"MATURATO"**, **"RENDICONTATO"**, **"LIQUIDATO"**, più badge
**"DECISO DALLA SOCIETA"** per le decisioni manuali.

### D.2 Actions

Scheda Prima nota: **"Registra movimento"**, **"Giroconto"**, riga **"Storna"**
/ riconcilia (v. §A.2).

Scheda Rate e solleciti: **"Sollecita"** (bulk, disabilitato senza selezione)
→ `PaymentReminderDialog` → anteprima poi `POST /api/v1/payment-reminders`.
Click riga → apre `AthletePaymentLedger` inline.

Dentro `AthletePaymentLedger`/`InstallmentLedgerList` (montato anche nella
scheda Iscrizione): **"Copri con un voucher"/"Copertura"** →
`POST /api/v1/payment-coverage` (allocazione/`action:"reverse"`); **"Paga
online"** → `POST /api/payments/create-checkout-session`; **"Registra
pagamento"** → `POST /api/v1/payment-transactions`; **"Ricevuta"/"Fattura"**
→ anteprima `GET /api/v1/payment-transactions/:id/document-decision`, conferma
`POST /api/v1/payment-transactions/:id {action:"issue-receipt"|"issue-invoice"}`;
**"Rimborsa"** (solo se `refund.refundable`) →
`POST /api/v1/payment-transactions/:id {action:"refund",...}`; **"Storna"**
per transazione → `window.prompt` motivo →
`POST /api/v1/payment-transactions/:id {action:"reverse", reason}`.

Voucher/contributi (montati in Gestione Iscrizioni e nella scheda atleta, non
direttamente sotto `/movements`): **"Nuovo programma"** →
`POST /api/v1/funding/programs`; **"Attiva"/"Chiudi"** →
`POST /api/v1/funding/programs/:id/transition`; **"Iscrivi atleti"/"Assegna un
voucher"** → `POST /api/v1/funding/enrollments`; **"Togli"/"Revoca"** →
`DELETE /api/v1/funding/enrollments/:id`; **"Ricalcola dalle presenze"** →
`POST /api/v1/funding/accruals {action:"recompute"}`; **"Segna come
maturato"/"Segna come non maturato"/"Torna al calcolo automatico"** →
`{action:"decide"}`; **"Registra la conferma dell'ente"** →
`{action:"confirm"}`; **"Registra liquidazione"** →
`POST /api/v1/funding/settlements`; **"Storna"** liquidazione →
`POST /api/v1/funding/settlements/:id/reverse`.

### D.3 Forms

**`RegisterPaymentDialog`** ("Registra pagamento"): "Importo (EUR) *", "Data
incasso *", "Causale" (facoltativa, default "Non classificato"), "Conto"
(facoltativo, preseleziona il primo conto attivo), "Metodo di pagamento *"
(solo scelte configurate dal club, mai testo libero), "Note". Validazione
condivisa client/server (`validatePaymentTransactionInput`): importo > 0,
metodo obbligatorio, importo non oltre il residuo salvo
`allowOverpayment`. Chiave di idempotenza generata client-side per apertura
dialog.

**`PayOnlineDialog`** ("Paga online"): "Importo da pagare (EUR) *", massimo =
residuo (rigoroso, nessun sovrapprezzo online).

**`RefundDialog`** ("Rimborsa"): "Importo da rimborsare (EUR) *"
(precompilato al rimborsabile), "Motivo" (catalogo fisso, va a Stripe), "Note
interne" (testo libero, resta in EasyGame).

**`CoverageDialog`** ("Copertura da voucher"): "Programma" (solo iscrizioni
attive), "Importo coperto".

**`FundingProgramsPanel` — "Nuovo programma di contributo"**: "Nome *", "Ente
finanziatore *", "Valido dal/al *", "Massimale del programma per atleta (EUR)
*", "Importo per periodo (EUR) *", "Frequenza del periodo *" (Mensile/Ogni N
giorni + "Giorni per periodo *" condizionale), "Fonte della maturazione *"
(radio, `external_api` disabilitato "non ancora disponibile"), "Unita del
requisito *", "Requisito minimo per periodo", "Se il requisito non e
raggiunto *" (tre opzioni), "Numero massimo di periodi", "Note".

**`EnrollAthletesDialog`**: doppia modalita (programma→atleti multipli o
atleta→un programma), per atleta "Assegnato al club" (default plafond) +
"Codice voucher" (opzionale).

**`ConfirmAccrualDialog`** ("Conferma maturazione"): "Importo riconosciuto
(EUR)" (precompilato), "Data della conferma", "Riferimento esterno", "Nota".

**`SettleAccrualDialog`** ("Registra liquidazione"): "Importo liquidato"
(precompilato), "Data accredito", "Conto del club *" (gated da
`canChooseAccount` lato server), "Riferimento bancario (TRN, CRO)"
(opzionale), "Note".

### D.4 Filters / search / sort

Scheda Prima nota: `AccountingFilters` (v. §A.4). Scheda Rate e solleciti:
**nessun filtro/ricerca/ordinamento in UI** — elenco completo, ordinato per
`sortByDateDesc` al caricamento; transazioni dentro un registro ordinate
cronologicamente ascendenti (convenzione UX esplicita, diversa dalle
cronologie discendenti altrove). `FundingProgramDetail`: casella **"Cerca per
cognome o codice voucher"** + Select stato ("Tutti gli stati"/"Attive"/
"Sospese"/"Chiuse").

### D.5 Exports

Nessuno trovato direttamente sulla superficie Rate/Pagamenti (il permesso
`accounting.export` esiste per il dominio Prima Nota in generale, ma nessun
bottone export e cablato in `movements/page.tsx`).

### D.6 Permissions / role gates

Gate di pagina: `canOpenAccounting(activeRole)`; `hasAccountingPermission(...,
"accounting.manage")` per Registra/Giroconto. Solleciti:
`canManageClubConfigurationAsActor(activeClub?.role)`. Gestione rate
(registra/storna/rimborsa/documenti): `allowManagement` con fallback allo
stesso helper — l'autorizzazione reale e lato server (403). Voucher: chiave
di scrittura unica `funding.manage` (ruoli DIREZIONE); la lettura si appoggia
su `accounting.read`; i componenti preferiscono i flag dichiarati dal server
(`canManage`/`canSettle`/`canChooseAccount`/`canReverseSettlement`) a ipotesi
locali (i ruoli personalizzati portano un token che un predicato locale non
puo risolvere). Voci legacy nel registro permessi (`simplified_payments`,
`payments`, `payment_plans`, `transactions`, `transfers`) tutte
`{keys:["accounting.read"]}`.

### D.7 States

Diniego pagina: **"La prima nota non e accessibile"** + spiegazione (v. §A.8).
Errore lettura: **"La prima nota non e stata letta"** + messaggio server.
Rate in caricamento: **"Lettura delle rate..."**; vuoto: **"Nessuna rata
registrata per questo club."** Registro atleta in caricamento: **"Lettura
degli incassi..."**; vuoto: **"Nessuna rata generata per questo atleta."**;
nessuna transazione: **"Nessun incasso registrato su questa rata."** Voucher:
vuoto programma **"Nessun programma configurato..."**, nessuna iscrizione
**"Nessun atleta iscritto..."**, nessun voucher assegnato **"Nessun voucher
assegnato a questo atleta: la quota resta interamente a carico della
famiglia."** Sollecito: **"Calcolo dei destinatari…"**; SMTP non configurato:
**"L'invio email non e configurato: nessun messaggio partirebbe davvero.
Configura SMTP in Impostazioni."** Pagamento online in verifica: badge
**"Pagamento in verifica"**.

### D.8 Destructive flows / storno

Confermato: lo stato di una rata **non si imposta mai**, si deriva
(`resolveLedgerState`/`resolveInstallmentLedger`). Storno di un incasso:
unico ingresso `reverseTransaction` → `window.prompt("Motivo dello storno
(resta nello storico):", "Incasso registrato per errore")` →
`POST /api/v1/payment-transactions/:id {action:"reverse", reason}` — la riga
originale resta marcata, si aggiunge la riga di compensazione, nulla si
cancella. Il server impedisce di stornare uno storno o una transazione gia
stornata. Il **rimborso** e esplicitamente diverso dallo storno ("lo storno
dice «questo incasso non e mai avvenuto»... il rimborso dice «il denaro e
tornato indietro»"), disponibile solo per incassi online, e non si riflette
subito: mostra **"Rimborso in elaborazione"** finche il webhook firmato non
lo conferma — la scrittura la fa il webhook, non la risposta HTTP.
`payment-transactions.ts` e dichiaratamente **l'unico** punto che registra o
storna un movimento di denaro di un atleta. Lato voucher: storno copertura
(`POST /api/v1/payment-coverage {action:"reverse"}`), storno liquidazione
(`POST /api/v1/funding/settlements/:id/reverse`, motivo obbligatorio via
prompt), rimozione iscrizione che diventa una **revoca non distruttiva**
(stato→chiuso) una volta che qualcosa e stato rendicontato/liquidato, con
consenso esplicito a checkbox.

### D.9 Navigation

`/payments` → `redirect("/movements")` (client-side). Documenti aperti in
nuova scheda: `window.open("/api/v1/documents/{receipt|invoice}/{id}",
"_blank", "noopener,noreferrer")`. Checkout online tramite URL esterno
Stripe-hosted, con URL di ritorno che preservano `?clubId=...`; lo stato
"in verifica" sopravvive al round-trip via `sessionStorage` (non stato app,
perche la pagina ricarica interamente al ritorno). Nessun parametro
query/deep-link per la scheda Rate in se (la selezione scheda e stato
locale, non un parametro URL).

### D.10 Related tests (elenco)

`tests/ui/accounting-movements-surface.test.mjs`, `tests/lib/installment-ledger.test.mjs`,
`tests/server/payment-transactions.test.mjs`, `tests/server/payment-transaction-race.test.mjs`,
`tests/ui/payment-registration-flow.test.mjs`, `tests/ui/refund-flow.test.mjs`,
`tests/ui/pay-online-flow.test.mjs`, `tests/ui/funding-flow.test.mjs`,
`tests/ui/copertura-voucher-superficie.test.mjs` — coprono rispettivamente:
niente aggregazione lato browser, derivazione pura dello stato rata,
isolamento multi-club e concorrenza sui blocchi riga, un solo componente
"Registra pagamento" condiviso fra scheda atleta e Movimenti, rimborsabilita
mai inventata in UI e scrittura solo dal webhook, "Paga online" mai inventato
localmente e mai oltre il residuo, separazione netta fra dominio pagamenti e
dominio voucher/contributi (nessuna scrittura incrociata), validazione
condivisa client/server sulla copertura voucher.

### D.11 Component inventory

`src/components/payments/**` (condiviso fra Movimenti e la scheda Iscrizione
dell'atleta): `AthletePaymentLedger.tsx`, `use-athlete-payment-ledger.ts`,
`InstallmentLedgerList.tsx`, `RegisterPaymentDialog.tsx`, `PayOnlineDialog.tsx`,
`RefundDialog.tsx`, `CoverageDialog.tsx`, `DocumentDecisionDialog.tsx`,
`PaymentReminderDialog.tsx` (montato da `movements/page.tsx`),
`use-causali-incasso.ts`, `use-conti-incasso.ts`, `EnrollmentPaymentBreakdown.tsx`
(scheda Iscrizione, non sotto `/movements`). Fuori ambito ma presenti nella
cartella: `ClubPaymentAccountPanel.tsx`, `ClubPaymentSettings.tsx`,
`ClubBillingSettings.tsx`, `ClubSubscriptionPanel.tsx`,
`HubExtraServicesPanel.tsx`, `PaymentMethodEnablementTable.tsx`,
`PublicPaymentLinkPage.tsx` (Impostazioni/Organizzazione).

`src/components/funding/**` (montato in Gestione Iscrizioni e nella scheda
atleta, collegato funzionalmente via `CoverageDialog`):
`FundingProgramsPanel.tsx`, `FundingProgramDetail.tsx`,
`AthleteFundingSummary.tsx`, `FundingPeriodsTable.tsx`,
`ConfirmAccrualDialog.tsx`, `SettleAccrualDialog.tsx`, `EnrollAthletesDialog.tsx`.

Librerie di dominio: `src/lib/payments/installment-ledger.ts` (derivazione
registro, pura), `src/lib/payments/refunds.ts`, `src/lib/payments/coverage-ledger.ts`,
`src/lib/payments/checkout-return.ts`, `src/lib/funding/funding-model.ts`,
`src/lib/funding/permissions.ts`, `src/lib/server/payment-transactions.ts`
(unico scrittore di `payment_transactions`), `src/lib/server/funding.ts`.

---

## Sintesi — 10 capacita facilmente perse in un redesign

1. **`/payments` non ha una sua UI**: e un redirect verso la scheda "Rate e
   solleciti" di `/movements`. Un redesign che tratti `/payments` come pagina
   a se rischia di duplicare o disallineare quella superficie.
2. **"Situazione finanziaria" e "Situazione economica" sono due grandezze
   che il codice impedisce strutturalmente di sommare** — nessuna funzione
   produce un totale unico; un redesign che le unifichi in un solo numero
   romperebbe un invariante esplicito (§28).
3. **Non esiste alcuna UI per creare/modificare/archiviare un conto
   finanziario** in nessuna pagina raggiungibile dal client, pur avendo
   l'API completa (`accounting.accounts_manage`) — gap reale, non solo di
   superficie.
4. **L'export CSV della contabilita vive solo su `/reports`**, non su
   `/movements`, nonostante l'export descriva esattamente i dati della prima
   nota — facile aspettarsi (erroneamente) un bottone export anche li.
5. **Le causali (operation types) si scelgono su `/movements` ma si
   configurano solo su `/organization`** (`OperationTypesPanel`) — nessun
   CRUD causali raggiungibile da Movimenti/Report.
6. **Non esiste un vero DELETE per un movimento contabile**: solo storno.
   L'unica cancellazione reale sull'intera area e per le **previsioni**
   (non ancora accadute) — la distinzione va preservata nel linguaggio UI.
7. **Il rimborso non e uno storno**: sono due flussi visivamente e
   semanticamente distinti, e il rimborso si scrive solo quando arriva il
   webhook del PSP, non alla risposta HTTP — uno stato "in elaborazione"
   intermedio va preservato.
8. **Un voucher copre una rata, non la paga**: la compensazione da
   contributo e una "promessa" (`payment_coverage_allocations`), separata
   dagli incassi reali — la UI tiene sempre le due economie in riquadri
   distinti con la dicitura esplicita di chi possiede il numero.
9. **Nessun filtro/ricerca/ordinamento esiste sulla scheda "Rate e
   solleciti"** (a differenza della Prima Nota, che ne ha molti) — non va
   dato per scontato un parallelismo di funzionalita fra le due schede.
10. **«Procura» e un termine con quattro significati diversi, e la pagina
    `/procura` e un CRUD legacy in forma libera su una colonna JSON**
    (`clubs.procure`), non un dominio con scrittore dedicato: ogni
    mutazione (procura, pagamento, associazione, nota) fa un
    read-modify-write dell'intera colonna, "elimina" e una rimozione dura
    senza tombstone, i contatti annidati non sono persistiti finche non si
    salva il dialog esterno, e il sottotitolo di pagina promette "documenti
    associati" che **non esistono da nessuna parte** nell'implementazione —
    un redesign deve trattarla come modulo separato dal nuovo dominio
    "Lavoro sportivo" (che pero non deve riassorbirla senza una
    classificazione umana per record, per esplicita regola di prodotto).
