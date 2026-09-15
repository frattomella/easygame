# Wave A — Audit di parità: Allenatori e Staff

> Documento di **inventario funzionale** dell'implementazione V1 attuale, sul
> branch `feat/web-redesign`. Nessuna proposta di design: questo è il
> contratto di parità che un redesign deve rispettare. Sola lettura, nessun
> file applicativo è stato modificato per produrlo.
>
> Rotte coperte: `/trainers`, `/trainers/new`, `/trainers/[id]`,
> `/trainers/[id]/edit`, `/staff`, `/staff/new`, `/staff/[id]`,
> `/staff/[id]/edit`, i componenti di `src/components/trainer/**` e
> `src/components/staff/**` effettivamente usati da queste rotte, le librerie
> `src/lib/trainer-*.ts` e `src/lib/staff-directory.ts`, gli endpoint API
> correlati e i test che li coprono.
>
> Metodo: lettura integrale riga-per-riga dei file elencati nel prompt di
> lavoro (inclusa `src/app/trainers/[id]/page.tsx`, 3040 righe), più grep
> mirato per gli endpoint API, i call site client e i test. Dove una parte non
> è stata verificata al 100% è segnalato esplicitamente in fondo a ciascuna
> sezione.

---

## Indice

1. [`/trainers` — elenco allenatori](#trainers--elenco-allenatori)
2. [`/trainers/new` — nuovo allenatore](#trainersnew--nuovo-allenatore)
3. [`/trainers/[id]` — scheda allenatore](#trainersid--scheda-allenatore)
4. [`/trainers/[id]/edit`](#trainersidedit)
5. [`/staff` — elenco staff](#staff--elenco-staff)
6. [`/staff/new` — nuovo membro staff](#staffnew--nuovo-membro-staff)
7. [`/staff/[id]` — scheda membro staff](#staffid--scheda-membro-staff)
8. [`/staff/[id]/edit`](#staffidedit)
9. [Endpoint API correlati](#endpoint-api-correlati)
10. [Test correlati](#test-correlati)
11. [Inventario componenti e librerie](#inventario-componenti-e-librerie)
12. [Sintesi finale (10 righe)](#sintesi-finale)

---

## `/trainers` — elenco allenatori

File: `src/app/trainers/page.tsx` (988 righe, letto per intero). Layout:
`Sidebar` (nascosta `<md`) + `Header title="Allenatori"` +
`DashboardPageContainer`, altezza fissa `h-[100dvh]` con scroll confinato in
`<main>`.

### 1. Dati mostrati

Interfaccia `Trainer`: `id, name, firstName?, lastName?, email, phone,
categories[], groupIds?, salary, avatar?, status?, specialization?,
hire_date?`.

Sorgente: `getClubTrainers(clubId)` (da `@/lib/simplified-db`, fonde
`clubs.trainers`, `club_resource_items` di tipo `trainers` e i membri di
`clubs.staff_members` con ruolo `trainer`/`allenatore`) + una query separata
`supabase.from("clubs").select("categories, club_sites, category_groups")`
per costruire i gruppi operativi (`buildCategoryGroups`).

**Vista tabella unica** (non ci sono viste card/tabella alternative per
questa rotta — a differenza di `/staff`). Colonne, tutte con visibilità
commutabile tranne "Azioni":
- **Allenatore** (avatar/`EntityIcon type="trainer"` + nome + email in
  piccolo sotto)
- **Email**
- **Telefono**
- **Categorie** (badge blu multipli: gruppo operativo se dichiarato,
  altrimenti categoria — vedi `trainerAssignmentLabels`)
- **Stato** (badge verde "Attivo" / ambra "Sospeso")
- **Azioni** (sempre visibile, non nascondibile)

Ordinamento fisso per cognome (`sortPeopleByLastName`), non configurabile.

### 2. Azioni

Header pagina (`SharedPageHeader title="Allenatori" subtitle="Gestisci staff
tecnico, categorie assegnate e stato operativo degli allenatori del club."`):
- Campo di ricerca (`Input placeholder="Cerca allenatori..."`, icona
  `Search`).
- Dropdown **"Esporta PDF"** (icona `FileDown`, disabilitato senza righe
  esportabili) — voci per ambito (`Esporta selezionati/filtrati/tutti (N)`).
- Dropdown **"Esporta CSV"** (icona `FileSpreadsheet`) — stessa logica.
- Gruppo di 3 bottoni filtro stato: **"Attivi"** (`Eye`, verde),
  **"Sospesi"** (`UserX`, ambra), **"Tutti"** (`EyeOff`, blu).
- Dropdown **"Personalizza Colonne"** (icona `Settings2`) — 5
  `DropdownMenuCheckboxItem`: Nome, Email, Telefono, Categorie, Stato. Stato
  React locale, **non persistito** (nessuna chiave `localStorage`).
- Bottone primario **"Nuovo Allenatore"** (icona `Plus`, blu) →
  `/trainers/new?clubId=` (o senza query se `clubId` assente).

Per riga: bottone icona **Modifica** (`Edit`, outline) →
`/trainers/{id}?clubId=`; bottone icona **Elimina** (`Trash2`, destructive).

### 3. Form

Nessun form nella pagina elenco.

### 4. Filtri / ricerca / ordinamento / raggruppamento

- Ricerca testuale libera su nome, email, telefono, nomi categoria
  (case-insensitive, `normalizedSearchQuery`).
- Filtro stato a 3 valori: `active` (default) / `suspended` / `all`.
- Nessun filtro per categoria/gruppo dedicato (solo ricerca testuale li
  intercetta).
- Ordinamento fisso per cognome, non configurabile.
- Nessuna vista salvata; nessuna chiave `localStorage` per colonne/filtri.

### 5. Selezione multipla / azioni di massa

`useListSelection()` + `BulkSelectionToolbar` (`nouns={{one:"allenatore",
many:"allenatori"}}`), compare solo con righe selezionate. Azioni:
- **"Attiva"** (`Eye` verde) → stato `active` su tutta la selezione, toast
  `"{N} allenatori attivati"`.
- **"Sospendi"** (`UserX` ambra) → stato `suspended`, toast `"{N} allenatori
  sospesi"`.
- Dropdown **"Assegna a un gruppo"** (se il club ha gruppi operativi non
  impliciti) o **"Assegna a una categoria"** (club a sede unica) — label
  interna `"Si aggiunge ai gruppi/categorie già seguiti"` (l'assegnazione
  **aggiunge**, non sostituisce) → toast `"{N} allenatori assegnati a
  {nome}"`.
- **"Esporta PDF"** / **"Esporta CSV"** (ambito `"selected"`).

Meccanica (`applyToSelection`): una scrittura per allenatore selezionato
(`updateClubDataItem` su `"trainers"`, con fallback su `"staff_members"` se
il record vive lì); conta i falliti e mostra `"{N} allenatori su {M} non sono
stati aggiornati"` se `> 0`; ricarica sempre l'elenco da `getClubTrainers`
dopo l'operazione. Guardia `bulkBusy` disabilita i controlli durante
l'esecuzione.

### 6. Export / import

- **PDF**: `exportPeoplePdf({entity:"trainers", ...})` — stesso motore
  dell'elenco Atleti/Staff. `visibleColumns: null` (le colonne export **non**
  seguono le colonne visibili in tabella — incoerenza nota rispetto a
  Staff/Soci, segnalata nel codice come fuori scope). Errore `"empty"` →
  toast `"Nessun elemento da esportare"`; popup bloccato → `"Consenti i
  popup per generare il PDF"`; successo → `"PDF pronto: si apre la finestra
  di stampa"`.
- **CSV**: `exportPeopleCsv(...)`, stesse colonne del PDF. Errore → `"Nessun
  elemento da esportare"`; successo → `"CSV scaricato"`.
- Colonna "Categorie" nell'export usa la stessa etichetta gruppo/categoria
  della tabella (`trainerAssignmentLabels`), per non divergere tra vista e
  file.
- Nessun import.

### 7. Permessi / ruoli

**Nessun controllo di ruolo/permesso lato client in questa pagina** (nessuna
occorrenza di `role ===`, `hasPermission`, `can(...)`, chiave di capability).
L'autorizzazione reale vive lato server (vedi [Endpoint
API](#endpoint-api-correlati)): per il ruolo `trainer`, la risorsa `trainers`
è solo in lettura; `collaborator`/`staff` hanno lettura/scrittura piena.

### 8. Stati

- **Loading**: `AppLoadingScreen compact title="EasyGame" subtitle="Caricamento
  lista allenatori..."`.
- **Empty assoluto**: icona `Users`, titolo `"Nessun allenatore trovato"`,
  testo `"Modifica i filtri oppure aggiungi un nuovo allenatore."`, bottone
  `"Aggiungi Allenatore"`. **Nota**: lo stesso messaggio/bottone compare anche
  quando l'elenco è vuoto per via del filtro (non c'è un messaggio
  filtered-empty distinto come in `/staff`).
- **Error**: toast `"Errore nel caricamento degli allenatori"` (fetch
  fallita), elenco svuotato.

### 9. Flussi distruttivi

**Elimina allenatore**: `confirm("Sei sicuro di voler eliminare questo
allenatore?")` (dialogo nativo del browser, non un `AlertDialog` di design
system) → `deleteClubTrainer(clubId, trainerId)`. Se `!result.removed` →
toast errore `"Allenatore non trovato tra i dati del club"`. Successo: **si
rilegge sempre l'elenco intero da `getClubTrainers`** (non un filtro locale),
perché la fonte è l'unione di tre collezioni; toast `"Allenatore eliminato"`.
Errore → `"Impossibile eliminare l'allenatore"`.

### 10. Navigazione

In ingresso: nessun query param oltre al club (`activeClub` via
`AuthProvider` o `localStorage`). In uscita: `/trainers/new`,
`/trainers/{id}?clubId=`.

---

## `/trainers/new` — nuovo allenatore

File: `src/app/trainers/new/page.tsx` (545 righe, letto per intero).
Wrappato in `<Suspense>` (usa `useSearchParams`). Titolo
`"Nuovo Allenatore"`, sottotitolo `"Crea una nuova anagrafica allenatore per
il club selezionato."`. Bottone `ArrowLeft` (ghost, rotondo) →
`/trainers?clubId=` (o `/trainers`).

### Risoluzione clubId
Ordine: query param `clubId` (se non `"null"`) → `activeClub.id` dal context
→ `localStorage.activeClub`.

### Caricamento categorie
`supabase.from("clubs").select("categories").eq("id", clubId).single()` —
solo le categorie (niente gruppi/sedi in questa pagina, a differenza
dell'elenco).

### 3. Form (unico, id `new-trainer-form`)

**Card "Anagrafica"** (icona `User`):
- `DocumentExtractionField` — OCR client-side su documento d'identità,
  `onApply` fa merge dei campi estratti.
- `PersonIdentityFields` (blocco condiviso, 6 campi nell'ordine canonico):
  **Nome*** e **Cognome*** (obbligatori, `required={{firstName:true,
  lastName:true}}`), Data di nascita, Luogo di nascita (assistito, ricerca
  ISTAT → porta il codice catastale), Sesso, Codice Fiscale (con calcolo
  assistito quando i dati bastano).

**Card "Contatti"** (icona `Mail`):
- **Email** (input type=email, placeholder `"Es.
  marco.bianchi@easygame.it"`, non marcata obbligatoria singolarmente).
- **Telefono** (`PhoneField`).
- `PersonResidenceFields` (indirizzo/città/CAP assistiti, ricerca comune
  ISTAT).

**Card "Taglie vestiario"** (icona `User`): `ClothingSizesFields` (Profilo
taglie dedotto da sesso+età, Taglia maglia, Taglia pantalone, Numero
scarpe). Nessun numero di maglia.

**Card "Inquadramento"** (icona `Calendar`):
- **Data inizio** (date, default `todayLocalDateOnly()`).
- **Compenso mensile** (number, icona `Euro`, min 0, step 0.01, placeholder
  `"Es. 1500"`).
- **Categorie allenate** — pulsanti pillola multi-selezione (toggle) sulle
  categorie del club; se nessuna categoria esiste nel club: banner ambra
  `"Nessuna categoria disponibile. Puoi comunque creare l'allenatore e
  assegnargli le categorie in un secondo momento."`; riepilogo badge delle
  categorie scelte o `"Nessuna categoria selezionata."`.
- **Note professionali** (`Textarea`, 4 righe, placeholder `"Inserisci una
  breve presentazione o eventuali note sull'allenatore..."`).

**Azioni**: bottone submit **"Salva Allenatore"** (icona `Save`, testo
`"Salvataggio..."` mentre salva) in header, disabilitato senza `clubId` o
durante il salvataggio.

### Validazione (client, in `handleSave`)
1. `clubId` mancante → toast `"Club attivo non trovato. Seleziona prima un
   club."`.
2. Nome o cognome vuoti → `"Nome e cognome sono obbligatori"`.
3. Né email né telefono → `"Inserisci almeno un contatto tra email e
   telefono"`.

Nessun controllo asincrono di unicità email/codice fiscale.

### Submit
Costruisce un oggetto allenatore completo lato client (id
`trainer-<timestamp>-<random>`, `role:"trainer"`, `status:"active"`,
`payments:[]`, `contracts:[]`, `birthYear` derivato dalla data intera) e
chiama `addClubData(clubId, "trainers", newTrainer)`. Successo: toast
`"Allenatore creato con successo"`, redirect a `/trainers/{id}?clubId=`.
Errore: toast col messaggio dell'eccezione o `"Errore durante la creazione
dell'allenatore"`.

### Permessi / Stati
Nessun gate di ruolo lato client. Nessuno stato loading/empty/error a pagina
intera oltre al banner `"Seleziona prima un club..."` quando `clubId` manca e
al testo del bottone submit.

---

## `/trainers/[id]` — scheda allenatore

File: `src/app/trainers/[id]/page.tsx` (**3040 righe, lette per intero**).
Layout: `Sidebar` + `Header title="Dettaglio Allenatore"` dentro
`DashboardPageContainer className="max-w-7xl"`.

### Header e caricamento

- Query param letto: solo `clubId` (nessun `tab=` — il tab iniziale è sempre
  `anagrafica`, non sincronizzato con l'URL).
- `AvatarUpload` in testa: cambia subito lo stato locale, poi (se
  `clubId`/`trainerId` presenti) scrive `{avatar}` su `trainers` via
  `updateClubDataItem` importato dinamicamente; toast `"Foto profilo
  aggiornata"` / `"Errore nel salvataggio della foto"`.
- Nome allenatore in gradiente blu→viola, badge categorie assegnate.
- Unico bottone header: **"Elimina"** (destructive, `Trash2`).
- Caricamento: `supabase.from("clubs").select("categories, trainers,
  staff_members, club_sites, category_groups")`; l'allenatore si cerca prima
  in `trainers[]`, poi in `staff_members[]` filtrato per
  `role in {"trainer","allenatore"}`. Errori distinti per: query fallita,
  club non trovato, id mancante, allenatore non trovato.
- Un secondo `useEffect` (`refreshAccessControlData`) recupera in parallelo i
  dati dell'account collegato (token, utente, tessera) — vedi tab "Accesso
  Account".

### 1. Dati mostrati / 11. Tabs (profilo)

7 `TabsTrigger` (`grid-cols-2 md:grid-cols-7`), ordine visivo: **Anagrafica**
(`User`, tab di default) · **Pagamenti** (`DollarSign`) · **Accesso Account**
(`Link2`) · **Dati Societari** (`Briefcase`) · **Dati Medici** (`Heart`) ·
**Presenze** (`Activity`) · **Lavoro e compensi** (`Briefcase`).

#### Tab Anagrafica
Tre card in sola lettura, ciascuna con bottone icona **Edit** che apre la
modale generica di sezione:
- **"Informazioni Personali"**: Nome, Cognome, Età, Data di Nascita,
  Nazionalità, Luogo di Nascita, Sesso, Formazione Scolastica, Codice
  Fiscale, Note. Vuoto → `"-"`.
- **"Documento di Identità"**: Tipo di Documento, Numero Documento, Data di
  Rilascio, Scadenza del Documento, Scadenza Permesso di Soggiorno.
- **"Contatti e Residenza"**: Email, Telefono, Indirizzo, Città, CAP
  (**questi campi non mostrano `"-"` da vuoti**, a differenza delle altre due
  card — incoerenza minore da preservare o correggere consapevolmente).

#### Tab Pagamenti
Banner ambra fisso: *"Questo registro è un promemoria, non una contabilità
dei compensi. Non conosce il rapporto di lavoro, i contributi, l'anno
fiscale né lo storno. Il modulo che li governa è «Lavoro e compensi», nella
scheda accanto."*

- **Card "Informazioni Bancarie"** (Edit): IBAN, Stipendio Mensile.
- **Card "Registro Pagamenti"**: ricerca per mese (`Input
  placeholder="Cerca pagamento..."`), bottone **"Aggiungi Pagamento"** →
  dialog `AddTrainerPaymentForm` (campi: Mese*, Importo €*, Stato
  Pagato/In Attesa, Data Pagamento se "Pagato"). Tabella: Mese, Importo, Data
  Pagamento, Stato (`Pagato`/`In Attesa`), Azioni. Empty:
  `"Nessun pagamento registrato per questo allenatore"`.
  - Se `pending`: bottone **"Registra Pagamento"**.
  - Se pagato: bottoni **"Ricevuta"** e **"Fattura"** (generano file `.txt`
    client-side con nome via `buildAttachmentFileName`; la fattura riporta
    `"Operazione fuori campo IVA ai sensi dell'art. 5 DPR 633/72"`).
  - Sempre: **"Cambia Stato"** e icona **Elimina** (`Trash2`).

#### Tab Accesso Account
Card collassabile "Accesso account allenatore" con badge di stato (6 stati,
vedi tabella sotto), 4 riquadri (Token attuale, Stato token, Scadenza,
Ultimo collegamento), box descrittivo, e bottoni: **"Genera Token"/"Rigenera
Token"**, **"Copia Token"**, **"Scollega Account"** e **"Scollega tutti gli
account"** (bottone duplicato — stesso handler/stessa condizione di
disabilitazione del precedente, nessuna logica "tutti" distinta). Card
"Account Collegato" con: Nome, Email, Telefono, ID account, Ruolo nel club,
date di membership/account/token.

| Stato | Etichetta | Descrizione |
|---|---|---|
| `linkedUserId` presente | Account collegato | "Questo allenatore ha già collegato il proprio account EasyGame al club." |
| stato `revoked`/`unlinked`/`disconnected` | Scollegato | "Il collegamento precedente è stato revocato dal club..." |
| stato `redeemed` | Token usato | "Il token è stato già riscattato e l'accesso è attivo." |
| stato `expired`/scaduto | Token scaduto | "Rigenera un nuovo token se l'allenatore deve ancora collegare il suo account." |
| token+record presenti | Token attivo | "Condividi questo token temporaneo all'allenatore..." |
| default | Non collegato | "Genera un token temporaneo da condividere..." |

#### Tab Dati Societari
- **"Informazioni Societarie"** (Edit): Tesserato (SÌ/NO), Numero di
  Tesseramento, Data di Tesseramento, Data di Inizio, Categorie Assegnate.
  **Il campo "Ruolo" non esiste più** (rimosso perché duplicava sempre
  "Allenatore" — confermato anche dal test `trainer-card.test.mjs`).
- Card tratteggiata che rimanda alla tab "Accesso Account".
- `TrainerDocumentsPanel` (griglia documenti, vedi Componenti).
- **"Taglie vestiario"** (Edit): `ClothingSizesSummary` in sola lettura.

#### Tab Dati Medici
- **"Visita Medica"** (nessun Edit — salvataggio immediato on-change):
  select Tipologia (`Agonistica`/`Non Agonistica`), Data di scadenza,
  `CertificateAttachmentField` per il certificato.
- **"Attestati"** (Edit): BLSD / Primo Soccorso / Antincendio, ciascuno
  badge SÌ/NO + allegato specifico se SÌ.
- **"Anagrafica Sanitaria"** (Edit): Tessera Sanitaria, Assicurazione,
  Patologie e Malattie, Allergie/Preferenze Alimentari.

#### Tab Presenze
4 card statistiche (Presenze/Assenze/Nessuna Risposta/Tasso di Presenza) più
tabella "Report Presenze Allenamenti" (Data, Ora, Titolo, Categoria, Luogo,
Presenza). **Attenzione parità**: `trainingSessions` è inizializzato vuoto e
**non viene mai popolato** da alcuna fetch in questo file — in produzione
questa tab è sempre a zero/vuota. Empty: `"Nessun allenamento registrato"`.

#### Tab Lavoro e compensi
Delegata interamente a `<PersonCompensationTab originType="trainer"
originId={trainerId} .../>` (componente condiviso `sport-work`, fuori dal
perimetro di lettura riga-per-riga di questo audit — solo la firma delle
prop è verificata). Distinzione esplicita nel codice: qui vive il rapporto
di lavoro vero (piano, erogazioni, soglie); "Pagamenti" resta un promemoria
storico.

### 5. Bulk/selezione
Non applicabile (pagina di dettaglio, nessuna selezione multipla).

### 6. Export/import
Nessuno in questa pagina (le ricevute/fatture testuali generate nella tab
Pagamenti non sono un vero export strutturato, sono file `.txt` ad hoc).

### 7. Permessi / ruoli
**Nessun controllo di ruolo/permesso lato client nel file.** Il vecchio
meccanismo di PIN pagamenti club è stato rimosso (`showPaymentsTab` è sempre
`true`); i commenti in codice chiariscono che la protezione reale è demandata
alla matrice permessi lato server/route, non a un PIN condiviso.

### 9. Flussi distruttivi
1. **Elimina allenatore** — `confirm(...)` nativo → `deleteStaffMember` →
   toast successo/errore, redirect a `/trainers`.
2. **AlertDialog "Eliminare il compenso?"** → `deleteTrainerPayment`.
3. **AlertDialog "Cambiare lo stato del compenso?"** → toggle
   pagato↔in attesa.
4. **AlertDialog "Scollegare questo account?"** → `DELETE
   /api/v1/trainer-accounts/{trainerId}`; azzera stato locale, toast
   `"Account scollegato dal profilo allenatore"`.
5. **`confirm()`** dentro rigenerazione token se già attivo un token non
   collegato.
6. **`confirm()`** dentro `TrainerDocumentsPanel` per l'eliminazione di un
   documento.
7. Conferma inline a due passi (non modale) dentro `CertificateAttachmentField`
   ("Elimina" → "Conferma eliminazione"/"Annulla").

### 8. Stati
- Loading iniziale: spinner senza testo.
- Allenatore non trovato: header `"Allenatore Non Trovato"`, bottone
  `"Torna alla lista allenatori"`.
- Toast esaustivi elencati nello scratchpad di dettaglio: copre copy, upload,
  pagamenti, token, scollegamento, salvataggio sezione, eliminazione.
- **Nota anomalia**: `handleSendMessage`/`messages`/`newMessage` sono codice
  morto — nessuna UI in questo file monta un box messaggi che li richiami.

### 10. Navigazione
In ingresso: `clubId` da query o da `localStorage`. In uscita: `/trainers`
(dopo elimina o da stato non-trovato).

### Componenti/librerie chiave usati qui
`AvatarUpload`, `Tabs`, `AlertDialog*`, `AddTrainerPaymentForm`,
`CertificateAttachmentField`, `TrainerDocumentsPanel`,
`PersonIdentityFields`, `PersonResidenceFields`, `PhoneField`,
`CapitalizedInput`, `ClothingSizesFields`/`ClothingSizesSummary`,
`PersonCompensationTab`, `Select`, `Switch`, `Badge` — dettagli campo per
campo nella sezione [Inventario componenti](#inventario-componenti-e-librerie).

---

## `/trainers/[id]/edit`

File: `src/app/trainers/[id]/edit/page.tsx` (28 righe). **Non è più una
pagina**: server component che fa `redirect()` immediato a
`/trainers/{id}?clubId=` (o senza query). Esiste solo perché un vecchio
indirizzo potrebbe essere in un segnalibro. Confermato anche dal test
`trainer-card.test.mjs` ("la modifica dell'allenatore non ha una seconda
pagina che degrada i dati").

---

## `/staff` — elenco staff

File: `src/app/staff/page.tsx` (953 righe, letto per intero). Layout
`Sidebar` + `Header title="Staff"` + `DashboardPageContainer` (una sola
chrome montata — un doppio ramo responsive ridondante è stato rimosso, RC
Fix 1 punto 11).

### 1. Dati mostrati

Interfaccia `StaffMember`: `id, name, fullName?, surname?, email, phone,
role, department, status, hire_date?, hireDate?, avatar`. Sorgente:
`supabase.from("clubs").select("staff_members, settings")`; `departments =
resolveStaffDepartments(settings, members)` (fonte vera
`settings.staffDepartments`, più reparti "orfani" dedotti dai membri).
Ordinamento: `sortPeopleByLastName`.

**Vista Tabella** (`StaffTable`, default): Nome (`EntityIcon type="staff"`),
Ruolo, Reparto (badge colorato, nascosta `<lg`), Email (`<md` nascosta),
Telefono (`<md` nascosta), Stato (`<md` nascosta), Data Assunzione (`<md`
nascosta), Azioni (sempre visibile). **A 375px e 768px molte colonne
spariscono automaticamente**; il Reparto compare solo da ≥1024px.

**Vista Card** (griglia 1/2/3 colonne responsive): checkbox selezione,
icona, nome, ruolo come sottotitolo, badge stato (Attivo/Non Attivo),
badge reparto (`member.department || "Non assegnato"`), righe
email/telefono/data assunzione con placeholder se assenti (`"Email non
disponibile"` ecc.), pulsanti Modifica/Elimina, click sulla card intera →
naviga alla scheda.

### 2. Azioni

Header: `SharedPageHeader title="Staff" subtitle="Gestisci il personale
amministrativo e tecnico"`, poi in ordine:
1. Select **"Filtra reparto"** (placeholder omonimo; `Tutti i reparti` +
   una voce per reparto).
2. Bottone **"Reparti"** (outline, `Building`) → dialog `DepartmentManagement`.
3. Dropdown **"Esporta PDF"** (`FileDown`).
4. Dropdown **"Esporta CSV"** (`FileSpreadsheet`).
5. Bottone icona **Tabella** (`Table`, title `"Visualizzazione Tabella"`).
6. Bottone icona **Card** (`LayoutGrid`, title `"Visualizzazione Card"`).
7. Dropdown **"Personalizza Colonne"** (solo se `viewMode==="table"`) — 7
   voci: Nome, Ruolo, Reparto, Email, Telefono, Stato, Data Assunzione. Stato
   React, non persistito.
8. Bottone primario **"Aggiungi Membro"** → `/staff/new?clubId=`.

Per riga/card: **Modifica** → `/staff/{id}?clubId=`; **Elimina** →
`confirm(...)` nativo → `handleDelete`.

### 3. Form
Nessuno nella pagina elenco (solo il Select filtro e il dialog Reparti).

### 4. Filtri / ricerca / ordinamento
- Filtro singolo per **reparto** (`departmentFilter`, default `"all"`).
- **Nessuna ricerca testuale** in questa pagina (differenza rispetto a
  `/trainers`, che invece ha un campo di ricerca).
- Ordinamento fisso per cognome, non configurabile.
- Nessuna vista salvata; nessuna chiave `localStorage` dedicata.

### 5. Selezione multipla / azioni di massa
`useListSelection()` + `BulkSelectionToolbar` (`nouns={{one:"membro dello
staff", many:"membri dello staff"}}`). Azioni:
- **"Attiva"** (`UserCheck` verde) → toast `"{N} membri dello staff
  attivati"`.
- **"Disattiva"** (`UserX` ambra) → toast `"{N} membri dello staff
  disattivati"`.
- Dropdown **"Sposta in un reparto"** (solo se esistono reparti; label
  `"Il reparto è uno solo: sostituisce"` — **qui, a differenza
  dell'assegnazione categorie allenatori, il reparto sostituisce, non si
  aggiunge**) → toast `"{N} membri dello staff spostati in {nome}"`.
- **"Esporta PDF"** / **"Esporta CSV"** (ambito `"selected"`).

Meccanica: **una sola** `UPDATE` su `clubs.staff_members` per l'intero
batch (commento esplicito: "non è un'ottimizzazione, è ciò che rende
l'operazione indivisibile"). Errore → rollback stato locale + toast
`"Operazione non riuscita"`. Nessuna cancellazione di massa (confermato dal
test `bulk-selection-surfaces.test.mjs`).

### 6. Export / import
- **PDF/CSV**: `exportPeoplePdf`/`exportPeopleCsv({entity:"staff", ...})`.
  Colonne extra per `staff`: Ruolo, Reparto, Data assunzione, Stato (oltre
  alle colonne comuni Cognome/Nome/Email/Telefono/Codice fiscale/Taglie).
  Titolo PDF `"Elenco Staff"`. Toast: `"Nessun elemento da esportare"`,
  `"Consenti i popup per generare il PDF"`, `"PDF pronto: si apre la
  finestra di stampa"` (PDF); `"Nessun elemento da esportare"`, `"CSV
  scaricato"` (CSV).
- Nessun import.

### 7. Permessi / ruoli
**Nessun controllo di permesso esplicito su questa pagina** — nessun gate
di ruolo lato client sull'intera route `/staff`.

### 8. Stati
- **Loading**: nessuno spinner esplicito dedicato.
- **Empty assoluto**: icona `Users`, `"Nessun membro dello staff"`, `"Inizia
  aggiungendo il primo membro del tuo staff"`, bottone `"Aggiungi Membro"`.
- **Filtered-empty** (filtro reparto senza risultati): `"Nessun risultato
  trovato"`, `"Prova a modificare i filtri di ricerca"`, **senza** bottone
  "Aggiungi Membro" (differenza rispetto all'empty assoluto).
- **Error**: nessun banner; solo `console.error`; l'eliminazione fallita
  ricarica l'elenco da capo.
- **Restricted**: non esiste.

### 9. Flussi distruttivi
- **Elimina membro** (icona `Trash2`, conferma nativa dentro `StaffTable`
  stesso oppure nella card): aggiornamento ottimistico → `UPDATE
  clubs.staff_members` → rollback su errore. **Nessun toast** di
  conferma/errore per questa azione specifica (diversamente dalle azioni di
  massa) — solo `console.error`.
- **Elimina reparto** (dentro `DepartmentManagement`): **nessuna conferma**
  — click diretto sull'icona `Trash2` → azzera `department:""` su tutti i
  membri che lo usavano, poi persiste.

### 10. Navigazione
In uscita: `/staff/new`, `/staff/{id}?clubId=`. Reparti persistiti in
`clubs.settings.staffDepartments` tramite rilettura-e-riscrittura della sola
chiave (non sovrascrive `seasons`/`activeSeasonId`).

---

## `/staff/new` — nuovo membro staff

File: `src/app/staff/new/page.tsx` (650 righe). `<Suspense>`. Titolo
`"Nuovo Membro dello Staff"`, sottotitolo `"Compila i dati per aggiungere un
nuovo membro"`. Bottone `ArrowLeft` → `router.back()`.

### Risoluzione clubId
Query param → `activeClub.id` → `localStorage.activeClub` →
`localStorage["activeClub_"+userId]`.

### Caricamento reparti/ruoli
`resolveStaffDepartments(settings, members)` +
`collectStaffRoles(members)` (predefiniti + ruoli realmente in uso, così un
ruolo scritto a mano ricompare in tendina).

### 3. Form

**Card "Anagrafica"**: `DocumentExtractionField` (OCR) + `PersonIdentityFields`
(**Nome***, **Cognome***, Data di nascita, Luogo di nascita assistito,
Sesso — solo M/F, Codice fiscale con calcolo assistito) +
**Nazionalità** (input libero, default `"Italiana"`).

**Card "Taglie vestiario"**: `ClothingSizesFields` (nessun numero di
maglia).

**Card "Contatti"**: **Email*** (placeholder `email@esempio.com`),
**Telefono*** (`PhoneField`, nota `"* Almeno un contatto è obbligatorio"`),
`PersonResidenceFields` (Indirizzo, CAP, Comune assistito, Provincia,
Regione, Paese default `Italia`).

**Card "Documento di Identità"**: Tipo Documento (select: `Carta
d'Identità`/`Patente`/`Passaporto`), Numero Documento, Scadenza Documento.

**Card "Dati Societari"**:
- **Ruolo*** (select: `STAFF_ROLES` + ruoli in uso + **"Altro..."** →
  input libero).
- **Dipartimento** (select: reparti esistenti + **"Altro..."** → input
  libero).
- **Data Assunzione** (date).
- **Stato** (select: `Attivo`/`Inattivo`/**`In congedo`** — **questo terzo
  stato esiste solo in creazione**; altrove nell'app lo stato staff è
  trattato in pratica come binario Attivo/Non Attivo).

**Card "Note"**: `Textarea` libera, 4 righe.

**Azioni fondo form**: **"Annulla"** (`router.back()`), **"Salva Membro"**
(submit, testo `"Salvataggio..."` mentre salva).

### Validazione (client, in `handleSubmit`)
1. `clubId` mancante → `"ID del club mancante. Impossibile salvare."`
2. Nome vuoto → `"Il nome è obbligatorio"`
3. Cognome vuoto → `"Il cognome è obbligatorio"`
4. Né email né telefono → `"È necessario inserire almeno un contatto (email
   o telefono)"`
5. Ruolo vuoto → `"Il ruolo è obbligatorio"`

(Validazione **duplicata** più in profondità in `addStaffMember` di
`simplified-db.ts`, che aggiunge anche un controllo di formato email via
regex.)

### Submit
`addStaffMember(clubId, {...})` seguito da `ensureStaffDepartment(clubId,
department)` (persiste un reparto "Altro" appena creato). Successo: toast
`"Membro dello staff aggiunto con successo"`, redirect a
`/staff?clubId=`. Errore: toast col messaggio o generico.

### Permessi / Stati
Nessun gate di ruolo. Nessuno stato loading/empty/error a pagina intera
oltre al testo del bottone submit.

---

## `/staff/[id]` — scheda membro staff

File: `src/app/staff/[id]/page.tsx` (1062 righe). Header:
`ClubPersonDetailHeader` (nome completo, `iconType="staff"`, badge ruolo +
badge reparto se presente). Azione header: **"Elimina"** (destructive).

> Nota storica dal codice (W6-D05): il vecchio bottone **"Invia
> Credenziali"** è stato rimosso (non chiamava nessuna rotta, mostrava solo
> un toast) — sostituito dalla sezione "Accesso EasyGame" descritta sotto.

### Caricamento
`supabase.from("clubs").select("staff_members, settings")`, con **retry
automatico** (max 3, backoff 1s×n) sugli errori di rete. `getStaffIdentity`
normalizza nome/cognome/nome-completo con fallback fino a `"Nome non
disponibile"`.

### 11. Tabs (profilo)
4 tab (`grid-cols-2 md:grid-cols-4`): **Anagrafica** (`User`) · **Dati
Societari** (`Briefcase`) · **Documenti** (`IdCard`) · **Lavoro e compensi**
(`Briefcase`).

#### Tab Anagrafica
- **"Informazioni Personali"** (Edit): Nome, Cognome, Età, Data di Nascita,
  Nazionalità, Luogo di Nascita, Sesso, Formazione Scolastica, Codice
  Fiscale, Note (vuoto → `"-"`).
- **"Contatti e Residenza"** (Edit): Email, Telefono, Indirizzo, Città, CAP.

#### Tab Dati Societari
- **"Informazioni Societarie"** (Edit per Ruolo/Stato/Data Assunzione):
  Ruolo (testo semplice); **Reparto — select inline che scrive
  immediatamente** (`handleDepartmentChange`, **non** apre la modale,
  diversamente da tutti gli altri campi di questa scheda), opzioni `Non
  assegnato` + reparti disponibili, nota `"I reparti disponibili arrivano
  dalla gestione reparti dello staff."`; Stato (badge binario
  Attivo/Inattivo — **"In congedo" non è rappresentato qui**, pur esistendo
  in creazione); Data di Assunzione.
- **"Taglie vestiario"** (Edit): `ClothingSizesSummary` sola lettura.
- **`ClubPersonAccessCard`** — sezione **"Accesso EasyGame"**:
  - **Visibile solo** se il ruolo attivo passa
    `canManageClubConfigurationAsActor` — altrimenti la card **non compare
    affatto** (nessun placeholder).
  - `GET /api/v1/club-roles/assignments`, cerca un assignment con la stessa
    email (case-insensitive) della scheda staff.
  - Stati: caricamento (`"Verifica dell'accesso in corso..."`), errore
    (messaggio), email mancante (`"Questa scheda non ha un'email: senza,
    non si può dire se la persona abbia già un accesso. Aggiungila nei
    contatti."`), **accesso attivo** (badge ruolo + eventuale
    `"Proprietario"`, testo `"Un'utenza del club usa {email}..."`),
    **nessun accesso** (`"Nessuna utenza del club usa {email}. Un membro
    dello staff senza account non riceve un invito da qui: deve prima
    esistere come utenza del club..."`).
  - Bottone **"Apri Ruoli e accessi"** → `/dashboard/access-management`.
  - **Nessun invito/credenziale inviabile da qui.**

#### Tab Documenti
Una card **"Documento di Identità"** (Edit): Tipo di Documento, Numero
Documento, Data di Rilascio, Scadenza del Documento, Scadenza Permesso di
Soggiorno. **Nessun'altra gestione documentale** (contratti/certificati) in
questa tab — a differenza della scheda allenatore, che ha un pannello
documenti dedicato multi-tipo.

#### Tab Lavoro e compensi
`<PersonCompensationTab originType="staff_member" originId={staffId} .../>`
— stesso componente condiviso usato dalla scheda allenatore (letto solo
parzialmente, fuori perimetro puntuale di questo audit).

### Modale unica di modifica sezione
Overlay `fixed inset-0`, chiusura su click esterno o X, titolo
`"Modifica Informazioni"`. Contenuto per `editingSection`:
- `personal`: `PersonIdentityFields` (senza `required` qui) + Età,
  Nazionalità, Formazione Scolastica, Note.
- `contacts`: Email, `PhoneField` (senza asterisco), `PersonResidenceFields`.
- `company`: Ruolo (select + "Altro..."), Reparto (select), **Stato — `<select>`
  HTML nativo, non il componente design-system**, solo 2 opzioni
  Attivo/Inattivo (manca "In congedo" anche qui), Data di Assunzione.
- `clothing`: `ClothingSizesFields` editabile.
- `document`: i 5 campi documento.

Footer: **"Annulla"**, **"Salva Modifiche"** →
`updateClubDataItem(clubId,"staff_members",staffId,payload)` +
`ensureStaffDepartment`. Toast `"Modifiche salvate con successo"` /
`"Errore nel salvataggio delle modifiche"`.

### Cambio reparto inline (fuori modale)
`handleDepartmentChange`: aggiornamento ottimistico → `UPDATE
clubs.staff_members` → **poi** `ensureStaffDepartment` (mai riscrittura
diretta di `settings`). Errore → rollback + toast `"Errore
nell'aggiornamento del reparto"`; successo → `"Reparto aggiornato con
successo"`. Guardia `isSavingDepartment`.

### 9. Flussi distruttivi
**Elimina membro**: `confirm("Sei sicuro di voler eliminare questo membro
dello staff?")` → `deleteStaffMember(clubId, staffId)` → toast
`"Membro dello staff eliminato con successo"` → redirect a
`/staff?clubId=`. Errore → `"Errore nell'eliminazione del membro dello
staff"`.

### 8. Stati
- **Loading**: spinner centrato, header `"Dettaglio Membro Staff"`.
- **Error/non trovato**: header `"Membro Staff Non Trovato"`, testo
  `"Membro dello staff non trovato"`, bottone `"Torna alla lista staff"`.
  Toast specifici per causa: `"ID del membro dello staff mancante"`,
  `"Errore nel caricamento dei dati del club: {msg}"`, `"Club non trovato.
  Verifica l'ID del club."`, `"Membro dello staff non trovato"`, `"Errore nel
  caricamento dei dati del membro dello staff"`.
- **Restricted**: nessun gate sull'intera pagina; solo `ClubPersonAccessCard`
  si nasconde per ruoli non gestionali.

### 10. Navigazione
In uscita: `/staff?clubId=`, `/dashboard/access-management`.

---

## `/staff/[id]/edit`

File: `src/app/staff/[id]/edit/page.tsx` (19 righe). Redirect immediato a
`/staff/{id}?clubId=` (o senza query), stesso pattern di
`/trainers/[id]/edit`. Nessun form separato: la modifica avviene tutta nelle
modali per sezione di `/staff/[id]`.

---

## Endpoint API correlati

**Non esiste una famiglia di rotte dedicata `/api/v1/staff` o
`/api/v1/departments`.** Allenatori e staff sono voci di `club_resource`
(`trainers`, `staff_members`) servite dalle rotte **generiche**
`/api/v1/[resource]` e `/api/v1/[resource]/[id]`, sostenute dalle colonne
JSON `clubs.trainers`/`clubs.staff_members` più righe specchio in
`club_resource_items`. Hanno rotte **dedicate** solo: lo scollegamento
account allenatore, le preferenze/avvisi della dashboard allenatore, e (in
comune con ogni altro tipo di attore) il riscatto generico del token
d'accesso. `trainer_payments` è un vero modello Prisma ma raggiunto solo
tramite la stessa macchina generica, ed è riservato a owner/club_manager.

### `GET|POST /api/v1/[resource]` e `GET|PATCH|DELETE /api/v1/[resource]/[id]`
File: `src/app/api/v1/[resource]/route.ts`,
`src/app/api/v1/[resource]/[id]/route.ts`.

- Unico percorso di scrittura in pratica per `trainers`/`staff_members`
  (`club_resource`, boundary `club`) e per `trainer_payments` (`model`,
  delegate `trainerPayment`, boundary `club`). Gli item `club_resource`
  sono specchiati tra l'array JSON e `club_resource_items`
  (`syncClubAggregateField` dopo ogni scrittura).
- Autorizzazione: `requireAuthenticatedUser` →
  `resolveOrganizationScopeForUser` → `assertClubResourceAccess(role,
  resource, azione)` → `canAccessClubResource` (`src/lib/access-roles.ts`):
  - `owner`/`club_manager`: accesso pieno tranne
    `MANAGEMENT_ADMIN_ONLY_RESOURCES` (che **include** `trainer_payments`
    ma **non** `trainers`/`staff_members`).
  - `collaborator`/`staff`: lettura/scrittura piena su
    `trainers`/`staff_members` (`MANAGEMENT_OPEN_RESOURCES`); **negati** su
    `trainer_payments`.
  - `trainer`: **solo lettura** su `trainers`/`staff_members`
    (`TRAINER_READ_RESOURCES`, non in `TRAINER_WRITE_RESOURCES`); nessun
    accesso a `trainer_payments`.
  - Ruoli personalizzati ristretti non raggiungono mai
    `MANAGEMENT_ADMIN_ONLY_RESOURCES`.
- Stringa di diniego: `"Accesso negato per il ruolo attivo"` (contiene
  `Accesso negato`, mappata a 403).
- Scope: `organization_id` sempre filtrato server-side, mai fidato dal
  client.
- **Redazione in output** (`serializeRecord` in `resources.ts`): un
  `trainer` che legge la scheda di un collega vede solo un elenco
  allow-listato di campi (niente IBAN, codice fiscale, token, documenti); se
  è la propria scheda, anche `documents`/`contracts`. Chi non può leggere
  `access_tokens` (non owner/club_manager canonico) non vede mai token/IBAN/
  codice fiscale in chiaro, anche da ruolo collaborator/staff/custom
  (correzione di un bug precedente, W6-D17).
- **Effetto collaterale sulla cancellazione**: eliminare una riga
  `trainers`/`staff_members` chiama anche `eraseProfileInvites(...)` per
  ripulire inviti EasyGame pendenti legati a quell'id.

### `DELETE /api/v1/trainer-accounts/:trainerId`
File: `src/app/api/v1/trainer-accounts/[trainerId]/route.ts` +
`shared.ts`.

- Scollega l'utenza EasyGame **solo dalla scheda di questo allenatore**
  (`unlinkTrainerAccount` in `src/lib/server/profile-account-links.ts`); non
  tocca la tessera `organization_users` (quella si revoca da Gestione
  Accessi). Query param opzionale `?reason=`.
- Permesso reale (`accounts.trainer.manage`) applicato **dentro** la
  funzione di dominio, non nella rotta.
- Diniego: `"Accesso negato: sessione assente"` (401 senza sessione); ogni
  altro diniego di dominio contiene `"Accesso negato"` (403).
- Filtro club sempre nella query stessa, mai dopo (chiude una fuga
  cross-club per omonimia d'id, vedi test `pp-03-scollegamento-allenatore`).
- Registrata come `trainer_accounts.unlink`, `mobile_ready: false`.

### `GET|POST /api/v1/trainer/operational-alerts`
File: `src/app/api/v1/trainer/operational-alerts/route.ts`. Avvisi
operativi calcolati **interamente server-side**
(`computeTrainerOperationalAlerts`/`syncTrainerOperationalAlerts`) — il
corpo della richiesta non viene letto. Gate: `isTrainerAccessRole`. Diniego:
`"Accesso negato: area allenatore"`.

### `GET /api/v1/trainer/preferences`
File: `src/app/api/v1/trainer/preferences/route.ts`. Sostituto sicuro per
ruolo trainer degli 8 letture che prima passavano da `GET
/api/v1/clubs?fields=...` (che risponde 403 al trainer). Ritorna solo:
`permissions`, `clinical.{statusRead,read}`, `matchConvocationDeadlineDays`,
`weeklySchedule`, `structures`, `openingHours`. Stesso gate/diniego di
`operational-alerts`.

### `POST /api/v1/auth/access/redeem`
File: `src/app/api/v1/auth/access/redeem/route.ts` (condivisa con
genitori/atleti). Quando il payload del token porta `trainer_id`,
`loadTrainerAccessTarget` cerca la riga `trainers`/`staff_members` in
`club_resource_items` per UUID **o** per id logico
(`trainer-<timestamp>-<random>` generato client-side in
`trainers/new/page.tsx`), **sempre filtrato anche per `organization_id` del
token** (corregge una fuga cross-club storica). Messaggi di dominio propri
(non il pattern generico "Accesso negato"): `"Questo allenatore è già
collegato a un altro account EasyGame"`, `"La scheda allenatore collegata a
questo token non è stata trovata"`.

**Nota**: non esiste una rotta dedicata "genera token di accesso
allenatore" — il valore del token vive come campo sul record
trainer/staff e si scrive come qualunque altro campo via `PATCH
/api/v1/trainers/:id`; la generazione avviene lato client (vedi
`handleGenerateAccessToken` in `[id]/page.tsx`). Il punto esatto in cui il
valore del token viene coniato non è stato tracciato riga per riga (fuori
perimetro puntuale).

### Chiamate lato client rilevanti (`apiRequest`)
- `src/app/trainers/[id]/page.tsx`: `GET /api/v1/access_tokens/{id}`, `GET
  /api/v1/users/{linkedUserId}`, `GET
  /api/v1/organization_users?organization_id=&user_id=&role=trainer`,
  `PATCH /api/v1/access_tokens/{id}`, `POST /api/v1/access_tokens`, `DELETE
  /api/v1/trainer-accounts/{trainerId}`.
- `src/components/trainer/trainer-dashboard-context.tsx` (area
  trainer-dashboard, non le rotte di gestione): `GET /api/v1/trainers`,
  `GET /api/v1/staff_members`, `GET
  /api/v1/athletes?trainer_dashboard=1`, `GET /api/v1/trainer/preferences`,
  `POST /api/v1/trainer/operational-alerts`.
- `src/lib/simplified-db.ts`: `DELETE /api/v1/trainers/{id}` (fallback in
  `deleteClubTrainer` quando l'allenatore non è nei campi JSON ma solo in
  `club_resource_items`).
- Le pagine `/staff/*` **non** chiamano mai `apiRequest`/`fetch` con un path
  letterale `trainer`/`staff`/`department`: passano tutte da
  `simplified-db.ts` (`addStaffMember`, `updateStaffMember`,
  `deleteStaffMember`) e da `src/lib/api/staff-departments.ts`
  (`saveStaffDepartments`, `ensureStaffDepartment`,
  `deleteStaffDepartment`), che a loro volta passano dal generico
  `GET/PATCH /api/v1/clubs`.

### Funzioni chiave di `src/lib/simplified-db.ts` (4196 righe)
- **Pagamenti allenatore** (operano **direttamente** su `payments[]` dentro
  l'oggetto allenatore in `clubs.trainers`, via Supabase diretto — **non**
  passano da `apiRequest` né dal modello Prisma `trainer_payments`):
  `addTrainerPayment`, `getTrainerPayments`, `updateTrainerPayment`,
  `deleteTrainerPayment`. **Tre sistemi paralleli** convivono per "quanto
  guadagna un allenatore/staff": questo registro JSON legacy, il modello
  Prisma `trainer_payments` (admin-only), e il nuovo registro
  `sport-work` — nessuna migrazione automatica tra loro (vedi test
  `sport-work-legacy-migration`).
- **Staff**: `addStaffMember` (department default `"Amministrazione"`,
  status default `"active"`, avatar Dicebear se assente), `getClubStaff`,
  `updateStaffMember`, `deleteStaffMember`.
- **Trainer/categorie**: `getClubTrainers` (fonde `trainers`,
  `club_resource_items`, e `staff_members` filtrato da
  `isTrainerLikeStaffMember`), `deleteClubTrainer` (rimuove da entrambe le
  collezioni JSON, con fallback sulla risorsa `club_resource_items`),
  `getClubCategories`.
- Nessuna funzione `Department` esportata: i reparti sono un dominio a
  parte (`staff-directory.ts` + `staff-departments.ts`).

### Registry (`docs/api-registry.md`, `src/lib/api/registry.ts`)
`trainers`/`staff_members` compaiono tra le risorse-club aggregate generiche
(CRUD standard a 5 rotte); `trainer_payments` è elencato separatamente come
risorsa-modello. Voci dedicate: `trainer_accounts.unlink` (DELETE),
`trainer.operational_alerts` (GET|POST), `trainer.preferences` (GET) — tutte
`mobile_ready: false`. Nessuna voce `department` in nessuno dei due
registry: i reparti sono pura logica di dominio client-side/`settings`.

---

## Test correlati

### Allenatori
- **`tests/lib/trainer-delete.test.mjs`** — copre `deleteClubTrainer`:
  rimozione dal JSON, non-contagio su omonimie, doppia rimozione
  trainer+staff_members condivisa, id vuoto rifiutato, fallback sulla
  risorsa club quando non trovato nei campi JSON.
- **`tests/lib/trainer-documents.test.mjs`** — modello documenti allenatore:
  lettura legacy (`contracts`), fallback e ordinamento, riconoscimento tipo
  da testo libero, stato derivato (scaduto/in scadenza/valido/senza file),
  upsert non duplica, nome download, **conferma che le vecchie pagine
  `/trainers/:id/contracts` non esistono più**.
- **`tests/ui/trainer-card.test.mjs`** — audit sorgente della scheda:
  **"Ruolo" non è più nei dati societari**; data di inizio modificabile e
  scritta su entrambe le chiavi (`startDate`/`hireDate`); nessuna seconda
  pagina di modifica; creazione chiede data di nascita e sesso (non il solo
  anno); documenti non portano fuori dalla scheda; numero di tessera **non**
  obbligatorio (verificato anche su staff/soci).
- **`tests/server/trainer-area.test.mjs`**, **`perimetro-allenatore.test.mjs`**,
  **`perimetro-appartenenze-allenatore.test.mjs`**,
  **`pp-03-scollegamento-allenatore.test.mjs`**,
  **`pp-03-allegati-perimetro-allenatore.test.mjs`**,
  **`profile-account-links.test.mjs`**,
  **`profili-collegati-account.test.mjs`** — perimetro categoria/gruppo,
  isolamento cross-club sullo scollegamento account, separazione
  concettuale "scollegare l'account" vs "revocare la tessera" (ADR-0110),
  esposizione minimale del profilo collegato in `/api/v1/auth/memberships`.
- **`tests/lib/dashboard-allenatore.test.mjs`** — logica pura area
  dashboard (avvisi, redazione clinica, permessi navigazione) — non le
  rotte di gestione, ma condivide componenti/lib.
- **`tests/lib/sport-work-legacy-migration.test.mjs`** — classificazione
  dei vecchi pagamenti allenatore/staff per la migrazione manuale nel nuovo
  registro compensi (mai automatica).

### Staff
- **`tests/lib/staff-directory.test.mjs`** — copertura esaustiva del
  dominio reparti/ruoli: ruoli predefiniti includono le cariche sociali;
  "Altro" è un comando non un ruolo; id reparto derivato dal nome; lettura/
  normalizzazione/ordinamento da `settings`; recupero reparto orfano dai
  membri; upsert per nome, rifiuta nome vuoto; ricerca case/spazi-insensitive;
  conteggio per reparto; **verifica statica** che ogni schermata che salva un
  membro persista il reparto e **non riscriva mai l'intero blob
  `settings`**; modello definito in un solo posto.
- **`tests/server/allegati-documenti-staff.test.mjs`** — isolamento
  fascicolo documentale tra colleghi (lettura, elenco, upload), visibilità
  piena per direzione/amministrazione lavoro sportivo.

### Condivisi (allenatori + staff + soci)
- **`tests/ui/bulk-selection-surfaces.test.mjs`** — copre esplicitamente
  `app/staff/page.tsx` come uno dei tre elenchi con selezione condivisa;
  verifica checkbox "seleziona tutti visibili" in `StaffTable`; export dagli
  ambiti condivisi; **conferma che nessun elenco di persone (incl. staff)
  ha bulk-delete**; test dedicato sull'assegnazione di massa
  allenatori/sedi.
- **`tests/lib/person-export.test.mjs`**, **`tests/lib/csv-export.test.mjs`**
  — motore export condiviso: colonne per entità (`trainers` include
  `categories`, `staff` include `department`), colonne nascoste in elenco
  non finiscono nel PDF, colonne senza interruttore restano sempre, formati
  numerici/CSV italiani, guardia anti CSV-injection, nome file con data.
- **`tests/lib/sport-work-permissions.test.mjs`**,
  **`tests/server/sport-work-routes.test.mjs`** — matrice permessi del
  modulo compensi: trainer/staff/collaborator negati su lettura/scrittura
  altrui, solo `sport_work.read_own` per sé stessi.
- **`tests/lib/document-permissions.test.mjs`** — generazione documenti/
  modelli: collaborator/staff/trainer negati sulla gestione modelli;
  trainer negato sulla generazione di documenti con importi/dati sanitari.
- **`tests/server/allegati-permesso.test.mjs`** — matrice permessi per
  `owner_type` di allegato, incluso `sport_work_person` (segreteria/
  collaboratore non toccano gli allegati del lavoro sportivo).

Non letti per intero (fuori priorità per questo audit, segnalati per un
passaggio successivo se servisse): i file generici del motore compensi
(`sport-work-ledger/service/agenda/scheduler/movements/obligations/position/
engine`), `tests/lib/ruoli-personalizzati.test.mjs` e affini sui ruoli
personalizzati generali.

---

## Inventario componenti e librerie

### Componenti usati dalle rotte di gestione

| Componente | File | Ruolo | Removal candidate / shared |
|---|---|---|---|
| `TrainerDocumentsPanel` | `src/components/trainer/trainer-documents-panel.tsx` (516 righe) | Unico componente di `components/trainer/**` usato dalle rotte di gestione (solo da `[id]/page.tsx`). Griglia documenti (Tipo/Nome file/Caricato/Scadenza/Stato/Azioni), dialog "Nuovo documento" (Tipo, Titolo facoltativo, Scadenza facoltativa, File obbligatorio ≤10MB), azioni Visualizza/Scarica sempre, Sostituisci/Elimina se `canWrite`. Passa sempre da Attachment Core. | **Page-specific della scheda allenatore** — nessun uso in `/staff` (che ha solo un campo documento d'identità, non un pannello) |
| `StaffTable` | `src/components/staff/StaffTable.tsx` (273 righe) | Tabella riusabile con/senza selezione; righe cliccabili; colonne responsive (`hidden md/lg:table-cell`); conferma nativa integrata sull'eliminazione; prop `onToggleStatus` **definita ma mai cablata** (no-op dal chiamante) | **Domain component condiviso** dell'elenco staff — da portare nel redesign |
| `DepartmentManagement` | `src/components/staff/DepartmentManagement.tsx` (258 righe) | Dialog CRUD reparti (nome*, descrizione, colore tra 5), elimina **senza conferma**, id derivato dal nome (mai timestamp) | **Domain component condiviso** — logica reparti da preservare |
| `AddTrainerPaymentForm` | `src/components/forms/AddTrainerPaymentForm.tsx` | Dialog "Aggiungi Pagamento Stipendio" (Mese*, Importo €*, Stato, Data Pagamento condizionale) | Page-specific della tab Pagamenti allenatore |
| `CertificateAttachmentField` | `src/components/forms/certificate-attachment-field.tsx` | Campo allegato generico riusato 4 volte (visita medica, BLSD, primo soccorso, antincendio); conferma eliminazione a due passi | Shared — usato anche altrove nel dominio persone |
| `ClubPersonAccessCard` | `src/components/club/club-person-access-card.tsx` | Sezione "Accesso EasyGame" (solo su `/staff/[id]`, non su `/trainers/[id]`, che ha invece la tab "Accesso Account" con token) — verifica via email se esiste già un'utenza | Shared domain component |
| `ClubPersonDetailHeader` | `src/components/club/ClubPersonDetailHeader.tsx` | Header scheda staff (nome, icona, badge ruolo/reparto) | Shared |
| `PersonCompensationTab` | `src/components/sport-work/PersonCompensationTab.tsx` | Tab "Lavoro e compensi" condivisa da allenatori e staff (e atleti/soci) — dominio proprietario `sport-work` | Shared, **non toccare senza coordinarsi con il dominio lavoro sportivo** |
| `PersonIdentityFields`, `PersonResidenceFields`, `PhoneField`, `CapitalizedInput`, `ClothingSizesFields`/`ClothingSizesSummary`, `DocumentExtractionField` | `src/components/forms/*` | Blocchi anagrafica/residenza/telefono/taglie/OCR condivisi da atleti/allenatori/staff | Shared domain forms — **must keep** |
| `Tabs`, `AlertDialog*`, `Select`, `Switch`, `Badge`, `DropdownMenu*`, `BulkSelectionToolbar`, `SelectAllCheckbox`/`SelectRowCheckbox` | `src/components/ui/*` | Primitive di design system | Shared UI kit |

### Componenti NON usati dalle rotte di gestione (area trainer-dashboard — fuori scope Wave A)
`AttendanceSheet`, `MatchConvocations`, `ResponsiveMatchesCalendar`,
`TrainerSidebar`, `TrainerWeeklyMatchesWidget`, `TrainingRsvpSummary`,
`TrainingScheduleAutomationPanel`, `trainer-appointments-dashboard-page`,
`trainer-athlete-profile-page`, `trainer-athletes-dashboard-page`,
`trainer-board-dashboard-page`, `trainer-categories-dashboard-page`,
`trainer-compensation-dashboard-page`, `trainer-dashboard-club-shell`,
`trainer-dashboard-context`, `trainer-dashboard-home-v2-page`,
`trainer-dashboard-shared`, `trainer-documents-dashboard-page`,
`trainer-event-editor-dialog`, `trainer-matches-dashboard-page`,
`trainer-trainings-dashboard-page`, `trainer-weekly-schedule-panel` — tutti
in `src/components/trainer/**`, nessuno importato da `/trainers/*`. Sono la
vista che il coach ha di sé stesso, non la scheda gestita da segreteria/
admin: **fuori perimetro di questo audit**.

### Librerie di dominio

| File | Ruolo | Uso da rotte di gestione |
|---|---|---|
| `src/lib/trainer-utils.ts` | Normalizzazione categorie/gruppi allenatore, fusione multi-fonte (`normalizeTrainerList`), nome visualizzato, `getTrainerGroupIds` (vuoto = non dichiarato, non "nessun gruppo") | Usato da `/trainers` (elenco) e `/trainers/[id]` |
| `src/lib/trainer-documents.ts` | Modello puro documenti allenatore (5 tipi, stato derivato, upsert/remove) | Usato da `/trainers/[id]` e `TrainerDocumentsPanel` |
| `src/lib/staff-directory.ts` | Modello unico reparti/ruoli staff (`STAFF_ROLES` 14 voci, colori, id da nome, merge orfani) | Usato da tutte e 3 le pagine `/staff/*` + `DepartmentManagement` |
| `src/lib/api/staff-departments.ts` | Persistenza reparti su `settings` (rilettura-e-riscrittura mirata) | Usato da tutte e 3 le pagine `/staff/*` |
| `src/lib/club-sites.ts` (funzioni citate) | Gruppi operativi per sede/categoria | Usato da `/trainers` (elenco) e `/trainers/[id]` |
| `src/lib/medical-visits.ts` | Tipi visita medica (default `Non Agonistica` per staff/allenatori, vs `Agonistica` per atleti) | Usato da `/trainers/[id]` |
| `src/lib/person-identity.ts` | Ordine canonico 6 campi identità + mapping legacy | Usato da tutte le rotte con anagrafica |
| `src/lib/sorting.ts` | `paymentDateOf`/`sortByDateDesc` per l'elenco pagamenti | Usato da `/trainers/[id]` |
| `src/lib/trainer-club-items.ts`, `src/lib/trainer-clinical-view.ts`, `src/lib/trainer-operational-alerts.ts`, `src/lib/trainer-dashboard-permissions.ts` | Dominio trainer-dashboard/coach-portal | **Non usati** dalle rotte di gestione — fuori scope Wave A |
| `src/lib/members/client.ts`, `model.ts`, `permissions.ts` | Dominio "libro soci" (membership register) | **Non usati** da `/staff` — dominio distinto, non serve equivalente nel redesign staff |

---

## Sintesi finale

1. `/trainers/[id]` ha **7 tab**, non solo anagrafica: Pagamenti (promemoria,
   non contabilità), Accesso Account (token+account collegato), Dati
   Societari, Dati Medici (visita + 3 attestati), Presenze (**mai
   popolata**, sempre vuota in produzione), Lavoro e compensi (delegata a
   `PersonCompensationTab`).
2. La tab "Presenze" dell'allenatore è **collegata a zero fonti dati**
   (`trainingSessions` mai popolato) — un redesign che la ricostruisce
   fedelmente riprodurrebbe una tab morta; va deciso consapevolmente.
3. `handleSendMessage`/stato messaggi in `[id]/page.tsx` sono **codice morto
   raggiungibile da nessuna UI** — non tradurli in nulla nel redesign senza
   verificare prima se serve davvero.
4. I due bottoni "Scollega Account" / "Scollega tutti gli account" nella tab
   Accesso Account condividono **lo stesso handler**: nessuna differenza
   funzionale reale oggi.
5. L'assegnazione di massa per allenatori **aggiunge** categorie/gruppi
   (mai sostituisce); l'assegnazione di massa reparto per staff
   **sostituisce** (il reparto è uno solo) — comportamenti opposti da non
   confondere nel redesign.
6. `/staff` ha viste Tabella **e** Card (`viewMode`), `/trainers` ha **solo**
   tabella — non sono simmetriche oggi.
7. Lo stato "In congedo" per lo staff esiste **solo** nel form di creazione
   (`/staff/new`); ovunque altro (elenco, scheda, modale modifica) è
   trattato come binario Attivo/Non Attivo — un valore raggiungibile ma
   "intrappolato".
8. Il campo **Reparto** nella scheda `/staff/[id]` si salva **subito**
   (select inline), diversamente da ogni altro campo della stessa scheda che
   passa dalla modale "Salva Modifiche" — un'incoerenza UX da preservare o
   correggere consapevolmente.
9. Esistono **tre sistemi paralleli** per "quanto guadagna un allenatore/
   staff": il registro pagamenti JSON legacy (`trainer_payments[]` dentro il
   record), il modello Prisma `trainer_payments` (admin-only, quasi
   irraggiungibile dalla UI), e il nuovo registro `sport-work` — nessuna
   migrazione automatica tra loro.
10. Nessuna delle 8 pagine ha un gate di ruolo/permesso lato client visibile
    a schermo (eccetto `ClubPersonAccessCard`, che si nasconde del tutto
    senza placeholder): l'intera autorizzazione reale vive server-side sulle
    rotte `/api/v1/[resource]` — un redesign che aggiunge feedback UI ai
    permessi deve leggerli da lì, non inventarli lato client.

---

*Documento generato per la Wave A del redesign (Allenatori/Staff). Fonti:
lettura integrale di `src/app/trainers/**`, `src/app/staff/**`,
`src/components/trainer/trainer-documents-panel.tsx`,
`src/components/staff/**`, `src/lib/trainer-*.ts`,
`src/lib/staff-directory.ts`; grep mirato su `src/app/api/v1/**`,
`src/lib/simplified-db.ts`, `src/lib/api/registry.ts`, `docs/api-registry.md`
e `tests/**`. Alcune parti (es. `PersonCompensationTab.tsx`, il punto esatto
di generazione del token di accesso, `management-area-layout`) non sono
state lette riga-per-riga perché fuori dal perimetro di file assegnato a
questo audit — segnalato nel testo dove rilevante.*
