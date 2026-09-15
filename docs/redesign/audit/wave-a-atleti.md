# Wave A — Audit di parità: dominio Atleti

**Scopo.** Inventario funzionale esaustivo dell'implementazione V1 attuale delle rotte
`/athletes`, `/athletes/new`, `/athletes/[id]`, `/athletes/[id]/edit`, sul branch
`feat/web-redesign`. Serve da **contratto di parità** per il redesign: non propone
alcuna soluzione di design, non modifica codice. Ogni sezione elenca dati, azioni,
form, filtri, permessi, stati ed endpoint con le etichette italiane esatte trovate nel
codice.

**Metodo.** Lettura integrale di `src/app/athletes/page.tsx` (3.205 righe),
`src/app/athletes/new/page.tsx` (252 righe), `src/app/athletes/[id]/page.tsx` (7.364
righe, letto per intero in blocchi sequenziali) e `src/app/athletes/[id]/edit/page.tsx`
(35 righe), più ogni componente e modulo `lib` importato da queste pagine (verificato
sugli import reali, non presunto), la sezione atleti di `src/lib/api/registry.ts`, le
rotte sotto `src/app/api/**` che li servono, e i test sotto `tests/**` che li
riguardano.

**Nota di scope.** Alcuni file elencati nell'incarico originale risultano **non
importati** dalle pagine sotto audit, e vengono segnalati esplicitamente sotto invece
di essere descritti come se fossero in uso (per evitare falsi positivi di parità):
`src/lib/person-export.ts` (usato da soci/staff/allenatori, non da `/athletes`),
`src/lib/athlete-enrollment-summary.ts` e `src/lib/athlete-participation-utils.ts`
(usati dall'area famiglia, non da `/athletes/[id]`), `src/lib/athletes/status.ts`
(usato dall'elenco, non dalla scheda), `src/components/athlete/**` (area
self-service dell'atleta, un albero di rotte diverso).

---

## 0. Mappa dei file per rotta

| Rotta | File pagina | Componenti diretti | Lib diretti |
|---|---|---|---|
| `/athletes` | `src/app/athletes/page.tsx` | `AthleteImportDialog` | `list-selection.ts` (solo `describeSelection`), `people-pdf-export.ts`, `csv.ts`, `athlete-import.ts`, `athlete-name-utils.ts`, `athlete-category-memberships.ts`, `athletes/status.ts`, `category-utils.ts`, `categories/display.ts`, `club-sites.ts`, `simplified-db.ts`, `supabase.ts` |
| `/athletes/new` | `src/app/athletes/new/page.tsx` | `AthleteCreateForm` (+ `person-identity-fields.tsx`, `assisted-anagrafica.tsx`, `phone-field.tsx`, `capitalized-input.tsx`, `clothing-sizes-fields.tsx`, `document-extraction-field.tsx`) | `category-utils.ts`, `person-identity.ts`, `club-federations.ts`, `simplified-db.ts` |
| `/athletes/[id]/edit` | `src/app/athletes/[id]/edit/page.tsx` | — (redirect puro) | — |
| `/athletes/[id]` | `src/app/athletes/[id]/page.tsx` | `athlete-profile-header.tsx`, `athlete-profile-tabs.tsx`, `athlete-account-section.tsx`, `athlete-data-subject-section.tsx`, `athlete-categories-panel.tsx`, `athlete-certificates-panel.tsx`, `athlete-registrations-panel.tsx`, `athlete-registration-dialog.tsx`, `athlete-payment-dialogs.tsx`, `AthleteEnrollmentTab.tsx`, `AthleteCategoryAnalyticsSection.tsx`, `PersonCompensationTab.tsx` | `athlete-profile-tabs.ts`, `athlete-profile-fields.ts`, `athlete-profile-utils.ts`, `athlete-guardians.ts`, `athlete-payment-utils.ts`, `athlete-category-memberships.ts`, `athlete-category-analytics.ts`, `athletes/registration-edits.ts`, `simplified-db.ts` |
| `/athletes/[id]/profile` | `src/app/athletes/[id]/profile/page.tsx` + `layout.tsx` | — (redirect puro, vedi §1) | — |

Vocabolario condiviso trasversale: `src/lib/athletes/status.ts` — quattro stati
canonici `active`/`suspended`/`loan`/`inactive`, etichette singolari **Attivo /
Sospeso / In prestito / Disattivato**, plurali **Attivi / Sospesi / In prestito /
Disattivati**; usato **solo** dall'elenco, non dalla scheda (vedi §5.16).

---

## 1. Rotte che sono redirect puri (non pagine)

### `/athletes/[id]/edit`
`src/app/athletes/[id]/edit/page.tsx` (35 righe) non renderizza nulla: fa
`redirect(clubId ? "/athletes/{id}?clubId={clubId}" : "/athletes/{id}")`. Il
commento nel codice spiega che prima conteneva un form di 600 righe **irraggiungibile**
(nessun link, nessun `router.push` in tutto il repo puntava qui), costruito su dati
d'esempio inventati. Non è stato rimosso con un 404 per non rompere segnalibri/email
vecchie: rimanda dove la modifica avviene davvero.

### `/athletes/[id]/profile`
`src/app/athletes/[id]/profile/page.tsx` è anch'essa un redirect puro (con
`AccessAreaGuard` nel `layout.tsx`). Risolve il ruolo (`normalizeAccessRole`) e:
- ruolo `athlete` → `router.replace("/athlete-dashboard")`;
- ogni altro ruolo → `router.replace("/athletes/{id}?clubId={activeClub.id}")` (o
  `/athletes` se manca l'id).

Anche qui il motivo è documentato nel codice: la vecchia pagina montava la sidebar
gestionale del club (Pagamenti, Movimenti, Impostazioni, Lavoro sportivo, ecc.) per un
pubblico — l'atleta stesso — che non può accedere a nessuna di quelle voci.

**Implicazione per il redesign**: nessuna delle due rotte ha superficie propria da
replicare; contano solo come redirect (stato "loading" con spinner centrato, vedi
§5.3).

---

## 2. Rotta `/athletes` — Elenco atleti

File: `E:\Download\easygame\src\app\athletes\page.tsx` (3.205 righe, client
component `AthletesPage`).

### 2.1 Dati mostrati

Una **riga per appartenenza a categoria**, non per persona: un atleta con due
categorie compare due volte (per scelta, ADR-0055/P0-1). Sorgente righe:
`getClubAthletesPage(clubId, {view:"summary", limit:200})`
(`src/lib/simplified-db.ts:304`) → `GET /api/v1/simplified_athletes` (voce generica
`simplified_athletes.list` nel registry) + fetch separato di
`athlete_category_memberships` per gli id restituiti. Categorie e sedi si leggono
direttamente via Supabase client (`categories`, `clubs.club_sites`/`category_groups`),
non via `/api/v1`.

Colonne (attivabili/disattivabili da **"Personalizza colonne"**, persistite per
club in `localStorage["athleteColumns_{clubId}"]`):

| Colonna | Default | Contenuto |
|---|---|---|
| **Atleta** | sempre visibile | avatar + nome (`getAthleteDisplayName`), click → `/athletes/[id]`; se appartenenza secondaria: sottotesto "Categoria primaria: {label}" + badge **Secondaria** |
| **Categoria** | off | `categoryLabel`; badge **Primaria** se membership primaria |
| **Età** | off, e **disabilitata/nascosta** anche nel dialogo "Personalizza colonne" (checkbox con `className="hidden"`, forzata a `false` al caricamento) | `{età} anni` |
| **Anno di Nascita** | on | anno o `-` |
| **Stato** | on | icona (verde/colore per tono) + `ATHLETE_STATUS_LABELS[stato]` |
| **Certificato Medico** | on | icona (rossa se scaduto) + data (`it-IT`) o `-` |
| **Iscrizione** | off | spunta verde / X rossa da `registrationComplete` |
| **Numero Maglia** | off | `jerseyNumber` o `-` |
| **Azioni** | sempre visibile | menu a tendina per riga |

Intestazioni di gruppo (una Card per gruppo operativo categoria×sede): "{label}
({n})", collassabile, con pulsante **Report**.

Conteggi:
- non paginato: `"{intestazione stato}: {n}"` per ciascuno dei 4 stati, uniti da
  `" | "`, deduplicati per persona;
- paginato (archivio > 200): un'unica intestazione `"{intestazione filtro}:
  {listMeta.total}"` dal server;
- riga di avanzamento in paginazione: `"{n} di {totale} atleti"` (+ "· caricamento…").

### 2.2 Azioni

Menu "⋮" per riga (`aria-label="Azioni per {nome}"`):
- **Visualizza Profilo** → `/athletes/{id}?clubId={clubId}`
- **Sospendi** / **Disattiva** (se attivo) / **Attiva** (se non attivo) →
  `updateAthleteStatus` → `updateClubAthlete` (scrittura Supabase diretta, non
  `/api/v1`); toast `Atleta: stato aggiornato a "{etichetta}"` o errore
  **"Errore nell'aggiornamento dello stato dell'atleta"**
- **Elimina** (rosso) → apre conferma (§2.9)

Barra strumenti:
- Ricerca, placeholder **"Cerca per nome o cognome"**, `aria-label="Cerca atleti"`
- Filtro stato a pillole: **Attivi**, **Sospesi**, **In prestito**, **Disattivati**,
  **Tutti**
- `SiteFilter` ("Sede") — solo se club multi-sede
- `CategoryGroupFilter` ("Gruppo") — categoria×sede
- **"Altre azioni"** ⋮: "Personalizza colonne", "Report categorie" →
  `/reports?report=categories`; separatore; "Esporta PDF", "Esporta CSV"
  (disabilitati se nulla di filtrato/selezionato); "Importa atleti"
- **"Nuovo atleta"** → `/athletes/new?clubId=…`

Pulsante **Report** sull'intestazione di gruppo → `/reports?report=categories&categoryId=…`
(disabilitato per il bucket "senza categoria" o senza `categoryId`).

Barra di selezione (visibile con ≥2 selezionati): "{n} atleti selezionati" +
**Attiva**, **Inattiva**, **Sospendi**, **Cambia categoria** (disabilitato senza
categorie), **Elimina** (rosso), **Cancella selezione**.

Menu **"Azioni su tutti"**: **Rendi tutti attivi**, **Rendi tutti inattivi**,
**Sospendi tutti**, separatore, **Elimina tutti** — ciascuna apre
`apriAzioneMassiva({scope:"all", action})`.

Footer paginazione: **"Carica altri atleti"** / "Caricamento…"
(`data-testid="carica-altri-atleti"`).

Stati vuoti: **"Vai alla Dashboard"** → `/dashboard`; **"Aggiungi Primo Atleta"** →
`/athletes/new?clubId=…`.

> Nota di codice morto: esiste una seconda Card "Modifiche in blocco" (~180 righe,
> `className="hidden"`) mai mostrata, che duplica la barra di selezione live — da
> non replicare nel redesign.

### 2.3 Form / dialoghi

**a) Dialogo import** — `AthleteImportDialog`
(`src/components/forms/AthleteImportDialog.tsx`, import dinamico `ssr:false`).
Titolo **"Importa atleti"**, descrizione "CSV, XLS, XLSX o XML. Le colonne vengono
riconosciute in automatico e ogni riga è verificata prima di scrivere." Flusso a
4 passi `upload → review → running → done`:
- *Upload*: pannello drag&drop, "**Scegli il file da importare**" / "La prima riga
  deve contenere i nomi delle colonne.", pulsante **"Seleziona file"**/"Lettura in
  corso"; accetta `.csv,.xls,.xlsx,.xml`.
- *Review*: nome file + formato rilevato, **"Cambia file"**; 3 tile riepilogo
  **Righe lette / Importabili / Da scartare**; pannello **"Mappatura colonne"** con
  10 campi mappabili (Cognome, Nome, Nominativo completo, Data di nascita, Anno di
  nascita, Categoria, Sesso, Codice fiscale, Email, Telefono), default "Non
  assegnata"; tabella anteprima (max 50 righe, checkbox "Solo righe con problemi")
  con esito per riga: Scartata / Importata con avviso / Pronta.
- *Running*: barra di avanzamento, "Scrittura in corso: {done} di {total} atleti.",
  "Non chiudere la pagina…".
- *Done*: tile Importati / Scartati in anteprima / Errori in scrittura; elenco righe
  fallite "Riga {n}: {etichetta} — {motivo}".
- Pulsanti: Annulla / **"Importa {n} atleti"** (disabilitato se 0 importabili); a
  fine importazione: "Importa un altro file" / "Chiudi".

Validazione (`src/lib/athlete-import.ts`, 792 righe): obbligatori Nome/Cognome/Data
di nascita; riconoscimento automatico header (sinonimi italiani, incl. "Nascita",
"Nato il/Nata il"); delimitatore CSV auto-rilevato (`;`,`,`,`\t`,`|`); date future
rifiutate ("Data di nascita nel futuro"), anni implausibili rifiutati; codice fiscale
validato (`isWellFormedCodiceFiscale`); email per regex; duplicati rilevati sia nel
file sia contro gli atleti esistenti (identità = cognome+nome+nascita normalizzati)
→ "Atleta già presente nel club" / "Riga duplicata nel file"; categoria risolta per
anno di nascita o creata ("La categoria "…" verrà creata"). Scrittura a scaglioni da
50 (`ATHLETE_IMPORT_CHUNK`) con ripiego riga-per-riga se lo scaglione fallisce.

**b) Dialogo "Personalizza Colonne"** — checkbox: "Nome Atleta (obbligatorio)"
(disabilitato, sempre spuntato), "Categoria", "Età" (nascosta via CSS, mai
selezionabile), "Anno di Nascita", "Stato", "Certificato Medico", "Iscrizione
Completata", "Numero Maglia". Footer: **"Salva Preferenze"** (chiude soltanto; lo
stato vive già in `visibleColumns`/localStorage).

**c) Dialogo "Cambia categoria agli atleti selezionati"** — campo **"Nuova
categoria"** (select, richiesto); se multi-sede: campo **"Sede"** (default "Lascia
la sede attuale"). Footer: Annulla / **"Continua"** (disabilitato finché non si
sceglie una categoria) → apre la conferma di massa.

**d) Conferma azione di massa** (`ConfirmDialog`) — titolo **"Conferma operazione in
blocco"**; testo generato da `getBulkActionDescription()` (vedi §2.5); conferma **"Sì,
conferma"**, annulla **"No, annulla"**; `type="warning"` per l'eliminazione, altrimenti
`"question"`.

**e) Conferma eliminazione singola** (`ConfirmDialog`, `type="error"`) — titolo
**"Eliminare questo atleta?"**; corpo: *"Stai per eliminare {nome}. L'operazione non
si annulla: la scheda e le appartenenze alle categorie vengono rimosse. Le rate e i
movimenti già registrati restano in contabilità. Se questa persona ha file, consensi,
richieste o consegne documentali, l'eliminazione non parte: apri la sua scheda e usa
la sezione «Dati personali»."*; conferma **"Elimina atleta"**, annulla **"Annulla"**.

### 2.4 Filtri / ricerca / ordinamento / raggruppamento / viste

- **Ricerca**: sotto soglia (≤200 in archivio) confronto client-side su
  nome/etichetta categoria; sopra soglia inviata al server come `search` con debounce
  250ms.
- **Filtro stato** (default `"active"`): `active|suspended|loan|inactive|all`.
- **Filtro sede** (solo multi-sede): guida sia la query server (`site_id`) sia il
  match client.
- **Filtro gruppo**: categoria×sede, ricalcolato al cambio sede (si azzera se il
  gruppo scelto non è più valido).
- **Ordinamento**: server `order_by=last_name&order=asc`; client riordina di nuovo
  con `compareAthletesByLastName` a ogni caricamento/append.
- **Raggruppamento**: per categoria+sede, collassabile (stato non persistito, si
  azzera ad ogni sessione/render).
- **Chiavi localStorage**: `athleteColumns_{clubId}` (colonne visibili, con
  migrazione `columnSchemaVersion: 2`); `activeClub_{userId}` e `activeClub` (letti,
  non scritti, per il fallback del club attivo).
- **Query param gestiti**: `clubId`/`organization_id`/`organizationId` (risoluzione
  club); `action=new` → redirect a `/athletes/new?clubId=…`; `action=import` → apre
  il dialogo import e rimuove il parametro dall'URL (`router.replace`).
- **Paginazione**: non classica prev/next. `ATHLETE_PAGE_SIZE = 200`; sotto soglia
  tutto arriva in una richiesta e filtri/ordinamento/raggruppamento sono client-side;
  sopra soglia un `IntersectionObserver` (sentinella 1px, `rootMargin:"200px"`) più
  un pulsante manuale accodano altre pagine; un gettone di lettura crescente scarta
  risposte in transito superate.

### 2.5 Azioni di massa / selezione

Stato selezione: `Set<string>` locale (`selectedAthleteIds`), **non** tramite
`src/lib/list-selection.ts` (che pure esiste ed è usato altrove — es.
`src/components/ui/list-selection.tsx`, `BulkGenerationDialog`, `person-export.ts`):
questa pagina importa da quel modulo **solo** `describeSelection` (per l'etichetta
export).

Azioni: `activate`, `deactivate`, `suspend`, `delete`, `changeCategory`. Ambito:
`"selected"` o `"all"`.

Risoluzione bersagli (`apriAzioneMassiva` → `risolviBersagliMassivi`): per
`"selected"` deduplica gli id scelti; per `"all"` interroga **tutte** le pagine
server rimanenti che rispettano i filtri correnti (non solo la pagina caricata),
deduplicando per persona. Se la risoluzione fallisce: **"Non è stato possibile
determinare gli atleti da aggiornare. Riprova."**; se vuota: **"Nessun atleta da
aggiornare"**. I bersagli risolti sono congelati prima di aprire la conferma.

Testi di conferma (scope "gli atleti selezionati" o "tutti gli atleti registrati"):
- delete: *"Stai per eliminare {n} atleta/i tra {scope}. Questa azione non può
  essere annullata. Gli atleti che hanno file, consensi, richieste o consegne
  documentali non vengono eliminati: vanno trattati uno per uno dalla sezione «Dati
  personali» della loro scheda. Al termine viene detto quanti sono stati eliminati e
  quanti no. Vuoi continuare?"*
- changeCategory: *"Stai per spostare {n} atleta/i tra {scope} nella categoria
  {nome}. Confermi l'operazione?"*
- activate/deactivate/suspend: *"Stai per {rendere attivi|disattivare|sospendere}
  {n} atleta/i tra {scope}. Confermi l'operazione?"*

Esecuzione: **delete** itera `deleteClubAthlete` uno per uno (non un'unica
chiamata batch), tollera fallimenti parziali, riporta successi/fallimenti separati
(toast finale "{n} atleta/i eliminato/i con successo", con dettaglio se bloccati
dalla guardia dati personali). **changeCategory**/**status**: iterano
`updateClubAthlete` per id. Selezione sempre svuotata a fine operazione e
`refreshAthletesData()` richiamato.

### 2.6 Export / import

**PDF**: `exportAthletesPdf()` — se c'è una selezione esporta **esattamente** quella
(ignorando i filtri), altrimenti tutto l'insieme filtrato (interrogando le pagine
server rimanenti). Colonne = colonne visibili correnti. Chiama `printPeoplePdf`
(`src/lib/people-pdf-export.ts`) — apre una finestra, tabella stampabile A4
orizzontale, `window.print()` automatico dopo 250ms. Titolo **"Elenco Atleti"**,
etichetta conteggio **"Atleti esportati"**. Guardie: **"Nessun atleta da
esportare"**, **"Consenti i popup per generare il PDF"**; successo **"PDF pronto: si
apre la finestra di stampa"**.

**CSV**: `exportAthletesCsv()` — stessa raccolta righe/colonne, serializzata con
`src/lib/csv.ts` (`toCsv`, `downloadCsv`, `csvFileName("Elenco Atleti")`); successo
**"CSV scaricato"**. **`src/lib/person-export.ts` non è usato da questa pagina**
(serve invece a soci/staff/allenatori) — solo `people-pdf-export.ts` e `csv.ts`.

**Import**: vedi §2.3a.

### 2.7 Permessi / ruoli

**Nessun controllo `can…`/`hasPermission`/`PERMISSIONS.*` esiste in questa
pagina.** Le uniche condizioni sono guidate dai dati (`!activeClub`,
`!filteredAthletes.length`, ecc.). Coerente con il catalogo permessi:
`src/lib/permissions/catalog.ts` dichiara esplicitamente
`athletes: { keys: [], reason: "nessuna chiave di catalogo governa l'elenco atleti:
lo governano il ruolo e il perimetro" }` — l'accesso è governato dal **ruolo** e dal
**perimetro di sede/categoria** (access-scope), non da una chiave di permesso
dedicata. Il debito è dichiarato in `16-technical-debt.md`.

### 2.8 Stati

- **Caricamento**: `AppLoadingScreen` compatto, "Caricamento lista atleti..."
- **Nessun club selezionato**: "**Club non selezionato**" / "Seleziona un club per
  visualizzare e gestire gli atleti" / pulsante "Vai alla Dashboard"
- **Vuoto (nessun filtro)**: "**Nessun atleta presente**" / "Inizia aggiungendo il
  primo atleta al tuo club" / "Aggiungi Primo Atleta"
- **Vuoto con filtro attivo**: `"{intestazione stato}: nessuno in elenco"` /
  "Prova a cambiare il filtro per vedere altri atleti" (nessun CTA)
- **Errore caricamento**: toast **"Errore nel caricamento dei dati"** (solo
  console, nessun banner inline)
- **Restricted**: nessuno osservato (nessun gate di permesso su questa pagina)

### 2.9 Flussi distruttivi

- **Eliminazione singola**: conferma (§2.3e) → `deleteClubAthlete` (Supabase
  diretto). Guardia server `assertPersonalDataDisposed` blocca l'eliminazione se
  l'atleta ha ancora file/consensi/richieste/depositi; il messaggio di errore viene
  riscritto lato client per rimandare alla sezione «Dati personali» della scheda.
- **Eliminazione di massa**: vedi §2.5 — ogni elemento tentato singolarmente, esito
  riportato per intero.
- Nessun archivio/soft-delete oltre le transizioni di stato reversibili
  (sospendi/disattiva).

### 2.10 Navigazione

- **In uscita**: `/athletes/new?clubId=…`, `/athletes/{id}?clubId=…`,
  `/reports?report=categories[&categoryId=…]`, `/dashboard`.
- **In entrata / deep link**: `?clubId=`/`?organization_id=`/`?organizationId=`,
  `?action=new`, `?action=import` (con pulizia URL via `router.replace`).

### 2.11 Test collegati

- `tests/ui/elenco-atleti-continuo.test.mjs` — niente "Precedente/Successiva";
  append dedupe per id; risposte superate scartate; sentinella
  `IntersectionObserver` + pulsante manuale coesistono; reset a pagina 1 al cambio
  filtro.
- `tests/ui/elenco-atleti-filtro.test.mjs` — il totale archivio viene dal
  caricamento iniziale non filtrato; il filtro stato si applica anche
  client-side; nessuno stato scrive un nome di azione (`"activate"`) in colonna
  stato; conferma distruttiva usa `ConfirmDialog`, non `window.confirm`.
- `tests/ui/azioni-massive-atleti.test.mjs` — il bersaglio non è "la pagina
  caricata"; i bersagli sono risolti una volta e viaggiano con l'azione pendente;
  deduplica per persona; ambito "all" richiede l'intero insieme filtrato; se i
  bersagli non si possono contare la conferma non si apre.
- `tests/ui/athletes-counters.test.mjs` — con paginazione i conteggi vengono dal
  server; sotto soglia dai dati caricati; deduplica per persona.
- `tests/ui/cancellazione-dati-personali-percorsi.test.mjs` — il riconoscitore del
  messaggio "dati personali" vive in un solo posto; l'eliminazione di massa tenta
  ogni atleta indipendentemente e riporta il parziale.
- `tests/ui/cancellazione-dati-personali-superficie.test.mjs` — copre la sezione
  **Dati personali** della **scheda** (permessi `data_subject.export`/`.erase`);
  incluso solo perché l'elenco ne riusa i messaggi di errore.
- `tests/lib/stato-atleta.test.mjs` — i 4 stati canonici; `"activate"` è un alias,
  non uno stato; azioni di massa hanno vocabolario proprio; valori sconosciuti
  normalizzano ad `active`; modulo puro (zero import server/DB).
- `tests/lib/athlete-import.test.mjs`, `-hardcheck.test.mjs`,
  `-plausibility.test.mjs` — parsing CSV/XML, date implausibili, sinonimi header,
  duplicati, import a scaglioni con ripiego riga-per-riga.
- `tests/server/athlete-list-pagination.test.mjs` — filtro categoria copre sia la
  colonna legacy sia le appartenenze; filtro sede include chi non ha sede
  dichiarata; ricerca+filtro in AND; confine multi-tenant tenuto; una pagina alla
  volta (non l'intero archivio).
- `tests/server/athlete-list-payload.test.mjs` — nessun base64 nella risposta
  d'elenco (foto → URL); il dettaglio resta completo (la proiezione è solo di
  lista).

### 2.12 Component inventory

**Specifici della pagina**: `src/components/forms/AthleteImportDialog.tsx` (605
righe, dialogo import a 4 step); tabella, dialogo colonne, dialogo cambio categoria
e conferme sono definiti inline in `page.tsx` (non estratti in componenti propri).

**Condivisi/riusati altrove** (non vanno rimossi con la migrazione di questa sola
pagina): `Sidebar`, `Header` (42/45 pagine), `DashboardPageContainer`,
`SharedPageHeader`, `SiteFilter`/`CategoryGroupFilter` (riusati da Categorie,
Movimenti, Strutture, Allenamenti), `EntityIcon`, primitive `src/components/ui/*`.

**Moduli lib e riuso**:
- `list-selection.ts` — condiviso, ma qui si usa solo `describeSelection`
- `people-pdf-export.ts`, `csv.ts` — condivisi con soci/staff/allenatori
- `athlete-import.ts` — usato solo da `AthleteImportDialog` (e i suoi test)
- `athlete-name-utils.ts`, `athlete-category-memberships.ts`, `athletes/status.ts`,
  `category-utils.ts`, `categories/display.ts`, `club-sites.ts` — dominio condiviso
- `simplified-db.ts` — layer dati condiviso (`getClubAthletesPage`,
  `addClubAthlete`, `addClubAthletesBatch`, `updateClubAthlete`,
  `deleteClubAthlete`)

**Non usati da questa rotta** (nonostante vivano sotto `src/components/athletes/**`
o siano adiacenti — verificati per grep, segnalati per evitare falsi positivi):
`AthleteCategoryAnalyticsSection.tsx` (solo profilo/trainer),
`athlete-data-subject-section.tsx` (il **componente** è solo di profilo; l'elenco
importa solo due funzioni di testo pure da quel file), `person-export.ts`,
`athlete-participation-utils.ts`, `athlete-category-analytics.ts`.

---

## 3. Rotta `/athletes/new` — Nuovo atleta

File: `src/app/athletes/new/page.tsx` (252 righe) + `src/components/forms/AthleteCreateForm.tsx`
(859 righe). **Una pagina, non una finestra** (ADR-0057), stesso guscio di
allenatori e soci.

### 3.1 Dati mostrati / precondizioni

- Se `!clubId`: Card ambra — *"Seleziona prima un club dalla tua area account, poi
  torna qui per iscrivere il nuovo atleta."*
- Titolo pagina **"Nuovo Atleta"**, sottotitolo *"Obbligatori nome, cognome e data di
  nascita. Il resto si può compilare ora o dopo."*

### 3.2 Azioni

- Icona `ArrowLeft`, `aria-label="Torna agli atleti"` → `/athletes?clubId=…` (o
  `/athletes`)
- **"Salva Atleta"** (header, gradient blu→viola) — `type="submit"
  form="athlete-create-form"`, disabilitato se `!clubId`
- **"Annulla"** (nel form) → stesso back
- **"Salva atleta"** (nel form, minuscolo) — label **"Salvataggio…"** mentre salva

### 3.3 Form — `AthleteCreateForm`

**Un'unica pagina scorrevole con fisarmonica** (`Accordion type="multiple"`), non
uno stepper. Sopra la fisarmonica: estrazione da documento + blocco identità sempre
visibile + categoria.

**Estrazione da documento** (`DocumentExtractionField`, in cima): "Compila dal
documento"; accetta JPG/PNG/WEBP/HEIC (e PDF con foto) fino a `MAX_DOCUMENT_SCAN_BYTES`;
due trigger — **"Carica documento"** (sempre) e **"Scatta una foto"** (solo su
dispositivi touch); OCR **nel browser**; checklist "Dati letti — scegli cosa
applicare:" con campi già compilati deselezionati di default e avviso "Lettura
incerta" per bassa confidenza; **"Applica N campo/i"**. Errori: *"Non sono riuscito a
leggere il file."*, *"Ho letto il documento ma non sono riuscito a ricavare campi
affidabili. Prova con una foto più nitida, o compila a mano."*, *"Impossibile
analizzare il documento. Prova con una foto più nitida o con luce migliore."*

**Campi sempre visibili**:

| Campo | Tipo | Obbligatorio | Note |
|---|---|---|---|
| Nome | testo (`CapitalizedInput`) | **sì** | capitalizza al blur |
| Cognome | testo | **sì** | idem |
| Data di nascita | date | **sì** | normalizzata `YYYY-MM-DD` |
| Luogo di nascita | autocomplete comune ISTAT | no | selezionando un comune imposta anche il codice Belfiore; link "Nato all'estero o in un comune soppresso? Inserisci il codice catastale" apre un campo manuale 4 caratteri, maiuscolo, validato (`isValidBelfioreCode`) |
| Sesso | select M/F | no | "Maschio"/"Femmina" |
| Codice fiscale | testo, 16 caratteri, maiuscolo | no | assistito (vedi sotto) |
| Categoria | select | no | "Automatica per anno di nascita" (default) + categorie club; se vuoto, `findCategoryForBirthDate` suggerisce e mostra "Categoria suggerita in automatico: {nome}" |
| Altre categorie | checkbox grid | no | esclude la primaria; renderizzato solo se ci sono opzioni |

**Assistente codice fiscale**: pulsante **"Calcola"** (appare solo a campo vuoto e
dati sufficienti); se il valore inserito non coincide col calcolato: stato
"mismatch" con **"Sostituisci con {atteso}"** → **"Conferma la sostituzione"** /
**"Tieni quello inserito"**; malformato → errore rosso; valido → spunta verde;
mancano dati → *"Per calcolarlo servono ancora: {…}."*

**Sezioni della fisarmonica** (tutte chiuse di default):
1. **Altri dati anagrafici** — Nazionalità (default "Italiana")
2. **Contatti** — Email; Telefono (`PhoneField`, prefisso Paese + numero) con
   avvisi *"Numero non plausibile: controlla le cifre."* / *"Numero senza prefisso
   internazionale: scegline uno per completarlo."*
3. **Residenza** — Via o piazza, Numero, CAP (solo cifre, max 5), Comune
   (autocomplete, può auto-compilare provincia/regione/CAP se vuoti), Provincia
   (select), Regione, Paese (default "Italia"); pulsante **"Completa i campi
   mancanti"** quando disponibile
4. **Dati sanitari** — Scadenza certificato medico, Gruppo sanguigno, Allergie,
   Contatto di emergenza, Telefono di emergenza
5. **Taglie** (`value="squadra"` nel codice, etichetta "Taglie") — Profilo taglie
   (auto da sesso+nascita, sovrascrivibile), Taglia maglia, Taglia pantalone,
   Numero scarpe. **Il numero di maglia non si raccoglie qui** (ADR-0057, verificato
   da test: `/jerseyNumber/` assente in questo file)
6. **Genitori e tutori** — righe ripetibili (parte da 1 vuota): identità completa
   (Nome, Cognome, Data di nascita, Luogo di nascita, Sesso, Codice fiscale),
   Parentela (select: Padre/Madre/Tutore Legale/Nonno/Nonna/Altro), Telefono, Email.
   **"Togli"** (solo se >1 riga), **"Aggiungi genitore/tutore"**. Righe vuote
   scartate al salvataggio (`guardianHasContent`)
7. **Tesseramento** — Federazione o ente (select; "Nessun tesseramento" default;
   avviso ambra se il club non ha federazioni), Numero tessera (**mai
   obbligatorio**, suffisso "(non obbligatorio)"), Stato (In corso/Attivo/Scaduto),
   Data di rilascio, Scadenza. Senza una federazione risolta non si produce alcun
   tesseramento
8. **Note** — textarea

### 3.4 Flusso dati

Validazione client: *"Nome, cognome e data di nascita sono obbligatori"*. Payload
dal form alla pagina include tutti i campi sopra dentro `data: {…}` + `guardians`
filtrati + `registrations` (0 o 1 elemento). La pagina risolve la categoria
(primaria+secondarie) e chiama `addClubAthlete(clubId, payload)`
(`src/lib/simplified-db.ts:1121`) — **scrittura diretta su Supabase**
(`simplified_athletes.insert`), non una chiamata `/api/v1`. Le appartenenze
categoria si scrivono con `replaceAthleteMemberships`.

### 3.5 Permessi

**Nessun controllo di ruolo/permesso** in tutta la rotta (grep negativo su
`hasPermission|can[A-Z]|permission|role`); i link "Nuovo Atleta" da Header/menu
mobile/elenco sono incondizionati.

### 3.6 Stati

- Nessun club: Card ambra (vedi §3.1)
- Errore validazione: toast **"Nome, cognome e data di nascita sono obbligatori"**
- Errore pagina: **"Club o utente non trovato"** (`!clubId||!user`)
- Errore salvataggio: **"Errore durante la creazione dell'atleta"** (doppia
  guardia: sia nel form sia nella pagina)
- Successo: **"Atleta {nome} {cognome} iscritto con successo"**
- Salvataggio in corso: pulsanti disabilitati, label "Salvataggio…"

### 3.7 Navigazione

- Back/Annulla → `/athletes?clubId=…` (o `/athletes`)
- Dopo il salvataggio → `/athletes/{id_nuovo}` (non torna all'elenco: va dritto
  alla scheda appena creata)
- Query param letto: solo `clubId` (con fallback `activeClub` → `localStorage`)

### 3.8 Test collegati

- `tests/ui/athlete-create-form.test.mjs` (276 righe) — obbligatori invariati;
  tutte le 8 sezioni fisarmonica presenti; componenti condivisi riusati (non
  reimplementati); nessun campo perso fra creazione e scheda (parità dei campi
  `data`); `jerseyNumber` assente per costruzione; pagina vera, non un Modal;
  "Numero tessera" mai obbligatorio; categorie secondarie escludono la primaria.
- `tests/ui/person-identity-order.test.mjs` — ordine canonico dei 6 campi identità
  condiviso con la scheda tutore.
- `tests/lib/tesseramento-ente-del-club.test.mjs` — la federazione deve appartenere
  al club.
- `tests/lib/athlete-import*.test.mjs` — percorso **separato** (bulk CSV), non
  condiviso col form di creazione singola.

### 3.9 Nota architetturale

`AthleteCreateForm` **non importa** `athlete-import.ts`: creazione singola e import
massivo sono due percorsi indipendenti che convergono solo sullo scrittore di basso
livello (`addClubAthlete`/`addClubAthletesBatch`).

---

## 4. Rotta `/athletes/[id]` — Scheda atleta

File: `src/app/athletes/[id]/page.tsx` (7.364 righe — la pagina più grande del
repository, ~340 KB). `tests/ui/athlete-profile-integration-audit.test.mjs` impone
un **tetto** di 8.480 righe come guardia anti-crescita, e verifica che nessuna delle
nove aree funzionali sia montata due volte dopo l'integrazione di tre workstream
paralleli (Pagamenti V2, multi-sede, Modulistica V2).

### 4.1 Query param gestiti

- `clubId` — URL vince se presente, altrimenti club attivo di sessione (mai
  allargato, solo ristretto — verificato anche server-side)
- `tab` — `resolveAthleteProfileTab(requestedTab)`: un valore sconosciuto ricade
  silenziosamente su `generale` (nessuno stato di errore); non risincronizzato
  nell'URL quando si cambia tab a mano
- `PersonCompensationTab` legge **autonomamente** il proprio `clubId` dai
  searchParams per costruire il link a `/sport-work/relationships/:id`

### 4.2 Stati di pagina

- **Caricamento**: `Sidebar` + `Header title="Profilo Atleta"` + spinner centrato
  (nessuno skeleton per sezione)
- **Non trovato / errore fetch**: toast *"Atleta non trovato o errore di
  connessione. Riprova."* → schermata dedicata, titolo **"Atleta non trovato"**,
  pulsante **"Torna alla lista atleti"**
- **ID mancante**: toast *"ID dell'atleta mancante"* → stessa schermata "non
  trovato"
- **Nessuno stato "Accesso negato" a livello di pagina intera** — il gate è per
  sezione (vedi §4.13)
- **Errore generico di caricamento dati**: toast *"Errore nel caricamento dei dati
  dell'atleta"*

### 4.3 Intestazione (fuori dalle tab) — `athlete-profile-header.tsx`

- **Avatar**: upload quadrato, persiste via `updateClubAthlete`; toast **"Foto
  profilo aggiornata"** / **"Errore nel salvataggio della foto"**
- **Nome e cognome**, intestazione con gradiente
- **Badge categoria**: uno per appartenenza — primaria (badge blu pieno +
  "• Primaria"), secondaria (badge outline + "• Secondaria")
- **"Accesso EasyGame"** (icona chiave) — visibile solo se ha il permesso
  `accounts.athlete.manage` (owner/club_manager/collaborator/staff); apre il
  dialogo (§4.4)
- **"Elimina"** (rosso, `Trash2`) — sempre visibile (gate lato server, non qui)

**Eliminazione atleta** (distruttivo): `ConfirmDialog type="error"`, titolo
**"Eliminare questo atleta?"**, corpo: *"Stai per eliminare {nome}. L'operazione non
si annulla: la scheda e le appartenenze alle categorie vengono rimosse. Le rate e i
movimenti già registrati restano in contabilità. Se questa persona ha file,
consensi, richieste o consegne documentali, l'eliminazione non parte: quei dati
resterebbero in archivio slegati da tutto, e vanno trattati dalla sezione «Dati
personali» di questa scheda."*, conferma **"Elimina atleta"**. Successo: **"Atleta
eliminato con successo"** → torna a `/athletes`. Fallimento per dati personali
vivi: messaggio riscritto con rimando a «Dati personali».

### 4.4 Dialogo "Accesso EasyGame" — `athlete-account-section.tsx`

Titolo **"Accesso EasyGame"**, descrizione *"L'atleta riceve un link personale e
sceglie da sé la propria password. EasyGame non manda mai una password per email, e
nessuno del club la può vedere."* Gate: `accounts.athlete.manage`. Dati:
`GET /api/v1/athlete-accounts/:athleteId`.

Stati (badge): **Accesso attivo** (verde), **Invito inviato** (secondario),
**Accesso revocato** (distruttivo, con banner rosso *"Questo atleta aveva un
accesso a EasyGame e non ce l'ha più. Se deve rientrare, mandagli un invito nuovo:
il vecchio link non funziona."*), **Nessun account** (outline).

Azioni per stato:
- Attivo: **"Scollega account"** (`DELETE .../link`), **"Revoca l'accesso"**
  (`DELETE .../:id`)
- Invitato: **"Reinvia l'invito"** (`POST .../resend`), **"Cambia indirizzo e
  reinvia"** (`POST .../email`), **"Revoca l'invito"** (`DELETE .../:id`)
- Nessuno/revocato: **"Invita l'atleta"** / **"Invita di nuovo"** (`POST
  /api/v1/athlete-accounts/:athleteId`, `{email, acknowledgeMinor}`)

**Gate minorenne**: se `isMinor` (vero anche senza data di nascita), checkbox
obbligatoria: *"Questo atleta risulta minorenne, o non ha una data di nascita in
anagrafica. Confermo che chi ne ha la responsabilità genitoriale ha autorizzato
l'apertura di un accesso EasyGame a suo nome."* — i pulsanti che mutano restano
disabilitati finché non è spuntata.

Storico "Cosa è successo": eventi invito/accettazione/revoca/scadenza con
email+timestamp. Campo: **"Indirizzo email dell'atleta"**.

### 4.5 Tab — elenco esatto

Da `src/lib/athlete-profile-tabs.ts`:

| `value` | Etichetta esatta | Icona |
|---|---|---|
| `generale` | **Generale** | User |
| `contatti` | **Contatti** | Phone |
| `sanitari` | **Dati Sanitari** | Heart |
| `pagamenti` | **Iscrizione** | DollarSign |
| `abbigliamento` | **Abbigliamento** | Shirt |
| `documenti` | **Documenti** | FileText |
| `analitiche` | **Analitiche** | BarChart3 |
| `lavoro` | **Lavoro e compensi** | Briefcase |

Nota: il valore interno della tab pagamenti è `pagamenti` ma l'etichetta è
**"Iscrizione"** (commento nel codice: "ISCRIZIONE E PAGAMENTI TAB"). Default:
`generale`. Nessuno stato di errore per `?tab=` sconosciuto: ricade su `generale`.

### 4.6 Tab **Generale**

**Card "Informazioni Generali"** (sola lettura + matita di modifica): Nome, Cognome,
Codice Fiscale, Data di Nascita, Nazionalità, Comune, Sesso, Categorie di
Appartenenza (badge Primaria/Secondaria), Note.

**Dialogo "Modifica Informazioni Generali"**: blocco identità condiviso
(`PersonIdentityFields`), Nazionalità, `AthleteCategoriesPanel` (categoria primaria
select, Sede — solo multi-sede, con nota *"Dove svolge la categoria primaria. Senza
sede resta visibile con qualunque filtro."* —, categorie secondarie checkbox), Note.
Footer: Annulla / Salva.

**Card "Tesseramento"** — `AthleteRegistrationsPanel`: colonne Federazione/Ente,
Numero, Scadenza, Stato (badge: In corso=verde, Scaduto=rosso, altro=giallo),
Allegato (Visualizza/Scarica se presente), Azioni (matita/cestino). Avviso ambra se
il club non ha federazioni: *"Nessuna federazione o ente registrato nel club.
Aggiungili nella pagina Club, scheda «Federazione», prima di registrare un
tesseramento."* Vuoto: *"Nessun tesseramento registrato"*. Pulsante **"Aggiungi
Tesseramento"**.

**Dialogo tesseramento** (`AthleteRegistrationDialog`) — titolo "Nuovo
Tesseramento"/"Modifica Tesseramento". Campi: **Federazione/Ente*** (obbligatorio,
deve appartenere al club — *"Questa federazione non è fra quelle configurate dal
club"*), Numero Tessera (facoltativo per scelta), Data Emissione, Data Scadenza,
Stato (In corso/In rinnovo/Scaduto), Note, Allegato (sostituibile mantenendo lo
stesso id). Footer: Annulla / "Salva modifiche"/"Salva Tesseramento". Eliminazione
**senza conferma** (cestino diretto) — toast "Tesseramento eliminato".

**Sezione "Dati personali" (GDPR)** — `AthleteDataSubjectSection`, in fondo alla
tab, `id="dati-personali"`. Gate: `data_subject.export` e/o `data_subject.erase`
(entrambe riservate a owner/club_manager). Pulsanti: **"Mostra cosa contiene"** /
**"Aggiorna il riepilogo"** (`GET /api/v1/data-subject/:id`), **"Esporta i dati"**
(gate export, scarica `dati-personali-{id}.json`), **"Cancella i dati personali"**
(gate erase, disabilitato finché non caricato l'inventario). Inventario con badge
per riga: **"Viene cancellato"**, **"Resta, senza più nominare la persona"**,
**"Resta intero: obbligo di conservazione"**. Avviso se contenuto clinico omesso
dall'export: *"Il file scaricato non contiene il contenuto clinico (note,
patologie, farmaci): serve il permesso di lettura del dato sanitario."*

**Conferma cancellazione** (`AlertDialog`): titolo **"Cancellare i dati di
{soggetto}?"**, corpo *"L'operazione non si annulla."* + conteggi
cancellati/anonimizzati/conservati; se minorenne, checkbox obbligatoria di conferma
lettura; campo facoltativo "Motivo (facoltativo, resta nel registro)"; conferma
**"Cancella definitivamente"** → `DELETE /api/v1/data-subject/:id`. Successo →
torna a `/athletes`.

### 4.7 Tab **Contatti**

**Card "Contatto Atleta"**: Telefono, Email (matita di modifica).

**Card "Contatto Genitore o Tutore Legale"** — pulsante **"Aggiungi"**. Per
genitore: Nome, Cognome, Parentela, Codice Fiscale, Data di Nascita, Telefono,
Email; azioni matita/X (**eliminazione immediata, senza conferma**, toast "Tutore
eliminato"). Vuoto: *"Nessun genitore o tutore registrato"*.

**Sotto-pannello accesso genitore** per ciascun tutore (da
`getGuardianAccessStatus`/`getGuardianTokenTiming`): badge **Account collegato**
(verde), **Token attivo** (blu), **Token scaduto** (ambra), **Solo recapito**
(ambra), **Account non collegato** (grigio).
- Se collegato: **"Scollega account"** → conferma *"Scollegare l'account da questo
  genitore?"* / **"Scollega"** / corpo: *"Il genitore resta nella scheda atleta, ma
  perde l'accesso all'area famiglia: non vedrà più calendario, pagamenti e documenti
  del minore finché non gli viene consegnato un nuovo token."* →
  `DELETE /api/v1/guardian-accounts/:athleteId/:guardianId`
- Se non collegato: **"Genera token"** / **"Rigenera token"** (con conferma se
  esiste già un token vivo non collegato: *"Esiste già un token attivo per questo
  genitore. Rigenerandolo, quello consegnato in precedenza smette di funzionare."*).
  Token formattato `PARA-B12C-D34`, copiato automaticamente negli appunti; validità
  72h (`PARENT_TOKEN_EXPIRY_HOURS`); toast **"Token genitore generato. Il token è
  collegato solo a questo genitore."**; pulsante **"Copia token"**; barra/etichetta
  di conto alla rovescia.

**Dialogo aggiungi/modifica tutore**: estrazione documento (OCR), identità
(obbligatori Nome+Cognome), Parentela (Padre/Madre/Tutore Legale/Nonno/Nonna/Altro),
Telefono, Email. Validazione: *"Nome e cognome sono obbligatori"*.

**Card "Indirizzo"**: Indirizzo, N. Civico, Comune, CAP, Paese, Regione, Provincia
(matita di modifica, campi assistiti indirizzo).

### 4.8 Tab **Dati Sanitari**

**"Certificati Medici"** (`AthleteCertificatesPanel`) — colonne Tipo, Emissione,
Scadenza, Stato (badge Valido/In scadenza/Scaduto), Azioni. Righe "mancanti/virtuali"
non hanno Modifica/Elimina. Pulsante **"Aggiungi certificato medico"** →
`AddCertificateForm`. **Eliminazione con conferma** (`AlertDialog`): *"Eliminare il
certificato medico?"* / *"Il certificato verrà rimosso dalla scheda sanitaria
dell'atleta. L'operazione non può essere annullata."* / **"Elimina"**. Nota
architetturale: aggiunta/modifica passano da Supabase diretto
(`medical_certificates`), l'eliminazione da `DELETE /api/v1/medical_certificates/:id`
— due percorsi diversi nello stesso pannello.

**Card "Visite Mediche"** — tabella Titolo/Descrizione/Tipologia/Esito/Pagamento/
Luogo/Data/Azioni. **"Aggiungi Visita"**: Titolo* e Data* obbligatori, Tipologia
(Agonistica/Non agonistica/Controllo), Pagamento (atleta/club/famiglia), Esito,
Luogo, Descrizione, Allegato. Validazione *"Titolo e data della visita sono
obbligatori"*. **Eliminazione con conferma**: *"Eliminare la visita medica?"*.
Vuoto: *"Nessuna visita medica registrata"*.

**Card "Attestati"** — tre interruttori: **BLSD**, **Primo Soccorso**,
**Antincendio**; ognuno mostra un campo allegato certificato quando attivo (persiste
subito il file). Il semplice interruttore non ha un salvataggio dedicato immediato
(solo il file lo ha).

**Card "Anagrafica Sanitaria"** — Gruppo Sanguigno (select A+/A-/B+/B-/AB+/AB-/0+/0-),
Allergie, Malattie Croniche, Farmaci, Contatto di emergenza, Telefono di emergenza.

Nessun gate di permesso client-side osservato su questa tab (le chiavi
`clinical.read`/`clinical.manage` esistono nel catalogo ma non sono referenziate
direttamente in `page.tsx` — applicate lato server sulle API sottostanti).

### 4.9 Tab **Iscrizione** (`pagamenti`) — `AthleteEnrollmentTab`

Sei sezioni ordinate (ADR-0056):

1. **Riepilogo iscrizione** — titolo = nome piano, o "Quota senza piano"/"Nessun
   piano assegnato"; badge stato (`NESSUN PIANO`/`DA PAGARE`/`PARZIALMENTE PAGATO`/…);
   fino a 7 righe importo (Quota totale, Copertura voucher prevista, Voucher
   maturato, Voucher liquidato, Voucher da ricevere, A carico della famiglia,
   Pagato dalla famiglia, Residuo famiglia); nota *"La copertura di un voucher non è
   un incasso: riduce quanto la famiglia deve, e in cassa entra solo quando l'ente
   versa."*; banner rosso rate scadute; pulsanti **"Registra pagamento"** e
   **"Paga online"** (se disponibile); interruttore **"Iscrizione attiva"**/**"non
   attiva"**; campo **Data iscrizione**.
2. **"Prossima rata"** — scadenza/importo/stato + **"Registra pagamento"**, o
   *"Pagamenti completati"*, o *"Nessun piano di pagamento assegnato…"*.
3. **"Piano di pagamento"** (collassabile, auto-espansa se ci sono anomalie) —
   **"Aggiungi voce"**; helper *"Lo stato di una rata si ricava dagli incassi
   registrati: non si imposta a mano."*; lista rate (`InstallmentLedgerList`) con
   gestione copertura voucher, registra/storna incasso, genera ricevuta/fattura,
   paga online, rimborso, modifica/elimina. **Eliminare vs annullare**: se già
   pagata parzialmente non si cancella, si annulla.
4. **"Composizione della quota"** (collassabile) — **"Modifica piano e rate"**;
   `EnrollmentPaymentBreakdown`; editor piano/sconto/servizi opzionali; **Note
   iscrizione**; **"Salva dati iscrizione"**.
5. **"Voucher e contributi"** — `AthleteFundingSummary`, con nota esplicativa sul
   fatto che un voucher assegnato non è denaro incassato.
6. **"Documenti e ricevute"** (collassabile) — **"Compila modulo"**, **"Aggiungi"**;
   sotto-sezione **Ricevute e fatture** (da `/api/v1/receipts`/`/invoices`,
   **"Visualizza"**; vuoto: *"Nessun documento fiscale emesso. Si emettono dal
   dettaglio di un incasso, nella sezione «Rate»."*); sotto-sezione **Documenti di
   iscrizione** (Eye/Download/Trash; vuoto *"Nessun documento di iscrizione
   caricato."*).

**Dialoghi montati**: `CoverageDialog` (copertura voucher), `PayOnlineDialog`,
`DocumentDecisionDialog` (anteprima emissione fiscale), `RefundDialog`,
`RegisterPaymentDialog` (registrazione incasso: metodo, causale, conto).

**Dialogo "Conferma piano/abbonamento"**: Data inizio abbonamento* (default =
data iscrizione), Importo personalizzato (solo se il piano lo consente), servizi
obbligatori/opzionali, totali (Servizi, Pro-rata, Sconti, Totale finale), avvisi
pro-rata/installment; **Continua** disabilitato se ci sono avvisi bloccanti →
apre **"Creare i pagamenti?"** (tabella rate da creare) → **"Conferma e crea
pagamenti"** → toast **"Piano assegnato e pagamenti in attesa creati
correttamente"**.

**Dialogo "Modifica pagamento"** (`AthletePaymentDialogs`) — Descrizione, Importo,
Scadenza, box stato in sola lettura ("si aggiorna da solo…"), Metodo, Note.
Modificabili **solo** le rate in attesa (non pagate) — *"Solo i pagamenti in attesa
possono essere modificati"*. Conferme distinte per titolo: **"Modificare il
pagamento?"** / **"Eliminare il pagamento in attesa?"** / **"Annullare il pagamento
saldato?"** → `PATCH /api/athlete-payments/:id {action, updates, reason}`.

**"Aggiungi Pagamento"** (voce manuale, sempre `status:"pending"` — ADR-0036): Data*,
Descrizione*, Tipo* (Quota/Iscrizione/Abbigliamento/Trasferta/Altro), Importo* →
`POST /api/v1/simplified_payments`.

### 4.10 Tab **Abbigliamento**

**Card "Taglie"** — Profilo Taglie (BAMBINO/BAMBINA/UOMO/DONNA, azzera le altre
select al cambio), Taglia Maglietta, Taglia Pantaloni, Taglia Scarpe; **"Salva
taglie"**. Tile **Numero maglia** (numero, badge gruppo, badge "Duplicato" se
conflitto, badge "Random: N" se suggerito) → apre dialogo numero maglia.

**Card "Numeri assegnati"** — griglia per gruppo (numero, badge origine
Kit/Manuale, badge Duplicato). Vuoto: *"Nessun numero assegnato a gruppi
numerazione."*

**Card "Assegnazioni kit"** — colonne Data/Kit-Articoli/Dettagli/Origine
(Magazzino/Fornitore/Manuale)/Stato (Riservato/Assegnato/Pronto/Consegnato/Da
ordinare/Ordinato/In produzione/Ricevuto/Non disponibile/Annullato)/Azioni
(**"Consegnato"**, **"Annulla"**). **"+ Nuova assegnazione"**. Vuoto: *"Nessuna
assegnazione registrata"*.

**Dialogo "Nuova assegnazione"** — radio Kit completo / Componenti singoli;
`CustomKitComponentsBuilder`; Note; **Conferma** (disabilitato senza scelta).

**Dialogo "Numero maglia"** — Gruppo numerazione (select; senza gruppi: *"Crea
prima un gruppo numerazione dalla pagina Abbigliamento."*), Numero (max 3 cifre) +
pulsante **"Random"**. Verifica unicità nel gruppo, conflitto → *"Numero non
disponibile"* col motivo. Scrive sia sull'assegnazione del gruppo sia (fallback
legacy) su `athlete.jerseyNumber`.

Nessun gate di permesso client-side osservato su questa tab.

### 4.11 Tab **Documenti**

**Card "Documenti condivisi con parent"** — **"Aggiorna"**; pannello **"Richiedi
documento"** (Titolo*, Tipo, Data, Note per il parent → **"Richiedi al parent"**,
validazione *"Inserisci il titolo del documento richiesto"*); pannello **"Carica
documento club"** (Titolo, Tipo, File, Descrizione → **"Condividi con parent"**,
validazione *"Seleziona un file da condividere"*); pannello **"Compila un modulo"**
→ `CompileFormDialog` (stessa istanza/percorso della coda pubblica). Lista
documenti con badge stato/tipo, uploader, motivo rifiuto se presente. Azioni per
riga: Visualizza/Scarica, **Approva**/**Rifiuta** (rifiuto via `window.prompt` —
**unico punto del file che usa ancora un prompt nativo invece di ConfirmDialog**;
validazione *"Il motivo del rifiuto è obbligatorio"*), **Sollecita**, elimina. Vuoto:
*"Nessun documento condiviso o richiesto."*

**Card "Documento di Identità"** — Tipo Documento, Numero Documento, Rilascio,
Scadenza, Scadenza Permesso di Soggiorno (matita di modifica: select Carta
d'identità/Passaporto/Patente + date).

**Card "Allegati Documento di Identità"** — tabella Nome/Tipo/Data
Caricamento/Azioni. **"Aggiungi Allegato"**: Nome Documento*, Tipo, Note, File* —
validazione *"Nome documento e file sono obbligatori"*. **Eliminazione senza
conferma**. Vuoto: *"Nessun allegato documento caricato"*.

**Card "Altri Documenti"** — tabella. **"Aggiungi Documento"**: Nome Documento*,
Tipo Documento* (Certificato Medico/Documento Identità/Tesserino/Liberatoria/
Privacy/Altro), File (opzionale) — validazione *"Compila tutti i campi
obbligatori"*. **Eliminazione senza conferma**. Vuoto: *"Nessun documento
caricato"*.

Nessun gate di tab osservato oltre quanto applicato dalle singole API.

### 4.12 Tab **Analitiche** — `AthleteCategoryAnalyticsSection`

Dati calcolati client-side (`calculateAthleteCategoryAnalytics`) da allenamenti e
gare già caricati. Per ogni categoria (primaria per prima): badge
Primaria/Secondaria, 4 tile (**Presenze/Allenamenti**, **Convocazioni/Gare**, **%
Presenza**, **% Convocazione** — "-" a denominatore zero), liste **"Ultimi
allenamenti"**/**"Ultime gare"** (max 5, con badge stato colorato). Vuoto (nessuna
categoria): *"Nessuna categoria disponibile per calcolare le analitiche."* Card
**"Eventi non classificati"** (solo se presenti): *"Eventi con presenza o
convocazione dell'atleta ma senza categoria ricostruibile. Non sono sommati alle
statistiche per categoria."* (max 8 elementi). Nessun filtro/ricerca/ordinamento in
questa tab; nessun gate di permesso nel componente. **Riusata** dalla vista
sola-lettura dell'allenatore (`trainer-athlete-profile-page.tsx`).

### 4.13 Tab **Lavoro e compensi** — `PersonCompensationTab` (`originType="athlete"`)

Carica `GET /api/v1/sport-work/people` (match per `origin_type/origin_id`); se
trovato, `GET /api/v1/sport-work/relationships?person_id=…` e
`GET /api/v1/sport-work/installments`.

- **Accesso negato** (chiamata persone fallita per ruolo): Card *"I compensi non
  sono visibili con il ruolo attivo"* / *"Questa sezione la vedono il proprietario e
  il club manager."*
- **Non ancora censito**: *"Questa persona non è ancora censita nel modulo
  compensi"* + spiegazione; **"Censisci nel modulo compensi"** (gate
  `sport_work.manage`, disabilitato senza nome/cognome) → `POST
  /api/v1/sport-work/people`. Errore: **"Censimento non riuscito"**; successo:
  **"Persona censita nel modulo compensi"**.
- **Censito**: 4 tile (Programmato/Maturato/Erogato/Maturato non erogato); Card
  "Rapporti" (ruolo+tipo, date, badge stato, click → `/sport-work/relationships/:id`);
  `PersonPositionCard` (posizione fiscale, gate `canManage` interno). Vuoto:
  *"Nessun rapporto di lavoro sportivo per questa persona."*

Componente **condiviso** verbatim con le schede allenatore e staff (cambia solo
`originType`).

### 4.14 Permessi/ruoli referenziati direttamente in questa rotta

| Chiave | Ruoli | Cosa governa |
|---|---|---|
| `accounts.athlete.manage` | owner, club_manager, collaborator, staff | Pulsante header "Accesso EasyGame" + intero pannello |
| `data_subject.export` | owner, club_manager | Pulsante "Esporta i dati" |
| `data_subject.erase` | owner, club_manager | Pulsante + conferma "Cancella i dati personali" |
| `sport_work.manage` | (verifica `hasSportWorkPermission`) | Pulsante "Censisci nel modulo compensi" |
| (implicito) accesso al registro sport-work | — | Intera tab Lavoro e compensi (stato negato se la lista persone risponde 403) |

Nessun altro gate di ruolo trovato in `page.tsx` per: pannello tesseramento,
CRUD certificati medici, CRUD tutori, azioni abbigliamento/numero maglia, azioni
documenti condivisi, modifica/aggiunta pagamenti — presumibilmente autorizzati
lato server dalle rispettive API sulla base di appartenenza/ruolo generico.

### 4.15 API toccate da questa rotta (cross-referenziate col registry)

| Percorso | Metodi | Voce registry | Chiamato da |
|---|---|---|---|
| `/api/v1/athlete-accounts/:athleteId` | GET/POST/DELETE | `athlete_accounts.state` | `athlete-account-section.tsx` |
| `/api/v1/athlete-accounts/:athleteId/resend` | POST | `athlete_accounts.resend` | idem |
| `/api/v1/athlete-accounts/:athleteId/email` | POST | `athlete_accounts.email` | idem |
| `/api/v1/athlete-accounts/:athleteId/link` | DELETE | `athlete_accounts.unlink` | idem |
| `/api/v1/guardian-accounts/:athleteId/:guardianId` | DELETE | `guardian_accounts.unlink` | `page.tsx` |
| `/api/v1/access_tokens[/:id]` | POST/PATCH | (risorsa generica) | `page.tsx` (token genitore) |
| `/api/v1/data-subject/:subjectId[/export]` | GET/DELETE | `data_subject.read`/`.export` | `athlete-data-subject-section.tsx` |
| `/api/athletes/:athleteId/documents[/:documentId/file]` | GET/POST/PATCH/DELETE | `athletes.documents`/`.document_file` | `page.tsx` |
| `/api/athlete-payments/:paymentId` | PATCH | `athlete_payments.item` | `page.tsx` |
| `/api/v1/simplified_payments` | POST | (generica) | `page.tsx` |
| `/api/v1/medical_certificates/:id` | DELETE | (generica) | `page.tsx` |
| `/api/v1/sport-work/people`, `/relationships`, `/installments` | GET/POST | — | `PersonCompensationTab` |
| `/api/v1/receipts`, `/api/v1/invoices` | GET | — | `AthleteEnrollmentTab` |
| `/api/v1/documents/:kind/:id` | GET (nuova scheda) | — | `AthleteEnrollmentTab` |

Più accesso non-`apiRequest` via `simplified-db.ts` (`getAthlete`,
`getAthleteCertificates`, `getAthletePayments`, `getClub`, `getClubCategories`,
`getClubTrainings`, `getClubData` per vari resource key, `updateClubAthlete`,
`deleteClubAthlete`, `updateAthlete`, `syncAthleteEnrollmentInstallmentPayments`) e
scrittura Supabase diretta per `medical_certificates` (insert/update, non
eliminazione).

### 4.16 Test collegati

- `tests/ui/athlete-profile-integration-audit.test.mjs` — le 9 aree funzionali
  montate una sola volta; nessun import duplicato; la pagina **non** ricalcola lo
  stato del ledger rate (deve leggerlo dal dominio, ADR-0036); tetto di 8.480 righe;
  voucher e rate mai nella stessa `<Section>`.
- `tests/lib/athlete-profile-extraction.test.mjs` (361 righe) — `athlete-guardians.ts`
  e `athlete-profile-fields.ts`: formato/leggibilità token, precedenza stati accesso
  tutore (collegato > revocato > scaduto > attivo > non collegato), calcolo età,
  coercizione booleana, fabbriche form vuoti.
- `tests/lib/enrollment-tab-model.test.mjs` + `tests/ui/enrollment-tab.test.mjs` —
  modello ledger iscrizione e comportamento del componente (badge stato,
  espansione sezioni, separazione copertura/incasso).
- `tests/server/profile-account-links.test.mjs` /
  `tests/server/profili-collegati-account.test.mjs` — scollegamento account
  genitore/allenatore lato server.

### 4.17 Osservazioni trasversali (fatti, non raccomandazioni)

- `src/lib/athlete-enrollment-summary.ts` e `src/lib/athlete-participation-utils.ts`
  **non sono importati** da questa pagina: serve invece l'area famiglia. La tab
  Analitiche usa `athlete-category-analytics.ts`.
- `src/lib/athletes/status.ts` (i 4 stati) **non è referenziato** in questa rotta:
  nessun badge di stato atleta compare sulla scheda — quel vocabolario vive solo
  nell'elenco.
- `src/components/athlete/**` (area self-service dell'atleta) **non è importato**
  da questa rotta — è un altro albero di pagine (`/athlete-dashboard`).
- Unico punto del file con `window.prompt` nativo invece di `ConfirmDialog`/dialogo
  applicativo: il rifiuto di un documento condiviso col parent (§4.11).
- Certificati medici: creazione/modifica passano da Supabase diretto, eliminazione
  passa da `/api/v1` — due percorsi diversi nello stesso pannello.

---

## 5. Superficie API trasversale (sintesi cross-route)

`src/lib/api/registry.ts` (1.843 righe) genera automaticamente 5 voci per ogni nome
in `resourceNames` (list/create/detail/update/delete su `/api/v1/{resource}`),
incluse **`athletes`**, **`athlete_category_memberships`** e
**`simplified_athletes`** — servite dalla rotta generica
`src/app/api/v1/[resource]/route.ts` (+ `[id]/route.ts`). **Non esiste** un
`/api/v1/athletes/route.ts` dedicato: la lista/creazione/dettaglio degli atleti passa
sempre dal catch-all generico, oppure — per `AthleteCreateForm`/`addClubAthlete` —
da una scrittura diretta su Supabase che **bypassa interamente `/api/v1`**.

Voci esplicite (nome → percorso → uso):
`athletes.avatar` (`GET /api/v1/athletes/:id/avatar`), `athlete_accounts.state`/
`.resend`/`.email`/`.accept`/`.me`/`.unlink`, `guardian_accounts.unlink`,
`athletes.documents`/`.document_file`, `athlete_payments.item`,
`family.enrollment_requests`/`.enrollment_renewal`/`.online_forms`,
`parent.dashboard`/`.appointments`/`.documents`/`.document_file`/`.structures`/
`.board`/`.consents`/`.checkout`.

Parametri di query notevoli su `athletes`/`simplified_athletes` (da
`09-api-conventions.md`): `?page=`/`?offset=`, `?q=`/`?search=`, `?order_by=`+`?order=`,
`?category_id=` (categoria storica **o** appartenenza), `?site_id=` (sede vuota =
"non dichiarata", resta visibile ovunque), `?view=summary` (proiezione leggera: la
lista scende da ~25 MB a ~2 MB togliendo le collezioni di allegati da `data`, **tranne**
`avatar`/`avatar_url`; il dettaglio resta sempre completo).

`GET /api/v1/athlete-accounts/:athleteId` porta **quattro** stati:
`none|invited|active|revoked`. `acknowledgeMinor` deve essere **esattamente**
`true` (booleano, non stringa) quando l'atleta è minorenne o senza data di nascita;
rifiuto con **400** (non 403), messaggio senza "Accesso negato" perché il ruolo può
compiere l'azione — manca solo la dichiarazione.

---

## 6. Permessi trasversali (dominio Atleti)

Da `src/lib/permissions/catalog.ts`:
- **`athletes`, `simplified_athletes`, `athlete_category_memberships` non hanno
  chiavi di catalogo**: l'accesso all'elenco/scheda è governato dal **ruolo** e dal
  **perimetro di sede/categoria** (access-scope), non da un permesso dedicato — è un
  debito dichiarato, non un'omissione silenziosa.
- `accounts.athlete.manage` — invitare/reinviare/revocare l'accesso EasyGame di un
  atleta (owner/club_manager/collaborator/staff).
- `clinical.read` / `clinical.manage` — contenuto clinico (allergie, patologie,
  farmaci, gruppo sanguigno, file certificato) vs. gestione/registrazione;
  riservate a `GESTIONE`; non referenziate direttamente in `page.tsx` (applicate
  lato server).
- `data_subject.export` / `data_subject.erase` — lette **separatamente**: chi ha
  solo l'export vede mezzo pannello "Dati personali".
- `sport_work.manage` / `.read` / `.read_own` / `.pay` / `.fiscal` — cinque
  permessi dedicati per la tab "Lavoro e compensi" (matrice propria, non passa dal
  catalogo generico).

Vocabolario di stato condiviso: 4 stati canonici (`active/suspended/loan/inactive`),
alias riconosciuti in lettura ma mai scritti (incluso il valore-difetto
storicamente errato `"activate"`), normalizzazione sempre verso uno dei 4 in
scrittura.

---

## 7. Component inventory complessivo (le tre rotte)

**Specifici delle rotte atleti** (candidati a essere sostituiti/rimossi dopo la
migrazione, se il redesign non li riusa altrove):
- `src/components/forms/AthleteImportDialog.tsx`
- `src/components/forms/AthleteCreateForm.tsx`
- `src/components/athletes/profile/athlete-profile-header.tsx`
- `src/components/athletes/profile/athlete-profile-tabs.tsx`
- `src/components/athletes/profile/athlete-account-section.tsx`
- `src/components/athletes/profile/athlete-categories-panel.tsx`
- `src/components/athletes/profile/athlete-certificates-panel.tsx`
- `src/components/athletes/profile/athlete-registrations-panel.tsx`
- `src/components/athletes/profile/athlete-registration-dialog.tsx`
- `src/components/athletes/profile/athlete-payment-dialogs.tsx`
- `src/components/athletes/enrollment/AthleteEnrollmentTab.tsx`
- `src/lib/athlete-import.ts`, `src/lib/athlete-profile-tabs.ts`,
  `src/lib/athlete-profile-fields.ts`, `src/lib/athletes/registration-edits.ts`

**Logica di dominio condivisa** (da mantenere, riusata fuori dal perimetro di
queste tre rotte):
- `src/components/athletes/profile/athlete-data-subject-section.tsx` (anche
  nell'elenco, come funzioni pure)
- `src/components/athletes/AthleteCategoryAnalyticsSection.tsx` (anche vista
  allenatore)
- `src/components/sport-work/PersonCompensationTab.tsx` (anche allenatori/staff)
- `src/lib/athlete-guardians.ts`, `src/lib/athlete-payment-utils.ts`,
  `src/lib/athlete-category-memberships.ts`, `src/lib/athlete-category-analytics.ts`,
  `src/lib/athlete-profile-utils.ts`, `src/lib/category-utils.ts`,
  `src/lib/athletes/status.ts` (solo elenco), `src/lib/list-selection.ts`,
  `src/lib/people-pdf-export.ts`, `src/lib/csv.ts`, `src/lib/simplified-db.ts`

**Non usati dalle rotte atleti nonostante l'adiacenza** (da non includere per
errore nel perimetro di migrazione): `src/lib/person-export.ts` (soci/staff/
allenatori), `src/lib/athlete-enrollment-summary.ts` e
`src/lib/athlete-participation-utils.ts` (area famiglia), `src/components/athlete/**`
(area self-service `/athlete-dashboard`), `viewAthleteTechnicalSheet`/"Riepilogo
Tecnico" (`src/components/trainer/trainer-athlete-profile-page.tsx` — vista
allenatore, rotta diversa).

---

## 8. Riepilogo — le 10 capacità più facili da perdere in un redesign

1. **Una riga per appartenenza a categoria nell'elenco, non per persona**: un
   atleta con due categorie compare due volte, e i conteggi "totali" devono
   deduplicare per id persona altrimenti sballano (già successo in produzione:
   "Atleti Attivi: 200" su 212 reali).
2. **Il tab "Iscrizione" ha `value="pagamenti"` ma l'etichetta è "Iscrizione"** —
   e uno stato di rata non si imposta mai a mano, si ricava dagli incassi
   registrati (ADR-0036); un voucher è una copertura, mai un incasso.
3. **`?view=summary` sull'elenco toglie tutti gli allegati tranne l'avatar** dal
   campo `data` (25 MB → 2 MB); il dettaglio (`GET /api/v1/athletes/:id`) resta
   sempre completo — un redesign che duplicasse i campi pesanti nella lista
   reintrodurrebbe il problema misurato e chiuso.
4. **La creazione atleta è una pagina intera (non un modal/wizard)**, con tre soli
   campi obbligatori (Nome, Cognome, Data di nascita) e tutto il resto in una
   fisarmonica chiusa di default; il numero di maglia **non** si raccoglie qui per
   scelta esplicita (ADR-0057).
5. **L'eliminazione di un atleta (singola o di massa) può fallire per dati
   personali vivi** (file, consensi, richieste, depositi) — il messaggio deve
   sempre rimandare alla sezione «Dati personali», non essere generico; l'azione di
   massa deve riportare successi/fallimenti parziali, mai bloccarsi al primo errore.
6. **`athletes`/`simplified_athletes` non hanno una chiave di permesso propria**:
   l'accesso è governato da ruolo + perimetro sede/categoria, non da un
   `can…`/permission key — un redesign che cercasse "il permesso per vedere gli
   atleti" non lo troverà, ed è voluto (debito dichiarato).
7. **Quattro stati atleta, non tre**: attivo/sospeso/in prestito/disattivato, con
   un vocabolario unico condiviso (`athletes/status.ts`) — e le azioni di massa
   hanno un vocabolario **separato** dagli stati stessi (`activate/suspend/loan/
   deactivate`) perché scrivere il nome dell'azione come stato è il bug storico che
   ha già fatto sparire atleti da ogni filtro.
8. **L'export (PDF/CSV) rispetta la selezione quando esiste, altrimenti tutto il
   filtrato** — mai l'intersezione fra selezione e filtro; e le colonne esportate
   rispecchiano sempre le colonne visibili in tabella, mai un set fisso.
9. **La scheda atleta non ha un badge di stato** (attivo/sospeso/…): quel
   vocabolario vive solo nell'elenco. E la tab Analitiche/Lavoro-e-compensi sono
   condivise **verbatim** con le viste allenatore/staff (stesso componente,
   `originType` diverso) — non vanno riscritte due volte.
10. **`/athletes/[id]/edit` e `/athletes/[id]/profile` sono redirect puri**, non
    pagine con superficie propria — il secondo biforca per ruolo
    (`athlete` → `/athlete-dashboard`, tutti gli altri → la scheda vera). Un
    redesign deve preservare questi due redirect esattamente, non provare a dar
    loro un contenuto.
