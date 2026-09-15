# Wave D — Audit di parita funzionale: Sponsor (`/sponsors`, `/sponsors/[id]`)

**Ambito:** `/sponsors` (elenco sponsor e fornitori, con il registro degli
incassi) e `/sponsors/[id]` (scheda). Gruppo sidebar del redesign: «Cassa e
amministrazione» → voce **Sponsor** (`src/components/web/shell/navigation.ts`,
`id: "sponsors"`, icona `Handshake`, nessun predicato di visibilita).

**Metodo:** lettura integrale di `src/app/sponsors/page.tsx` (1.617 righe),
`src/app/sponsors/[id]/page.tsx` (1.514 righe), `src/app/sponsors/layout.tsx`,
`src/lib/sponsors/{client,model}.ts`, `src/lib/server/sponsors.ts`, le rotte
`src/app/api/v1/sponsorships/**` e `src/app/api/v1/payment-transactions/[id]/route.ts`,
la matrice `src/lib/accounting/permissions.ts`, `src/lib/access-roles.ts`
(risorsa `sponsors`) e i test in `tests/**`. Le etichette italiane sono
riportate **esatte** come compaiono nel codice.

**Nota preliminare — dove vivono i dati.** L'anagrafica di uno sponsor e un
elemento dell'array JSON `clubs.sponsors` (CRUD generico `/api/v1/sponsors`
via `simplified-db`: `getClubData`, `addClubData`, `updateClubData`,
`updateClubDataItem`, `deleteClubDataItem`). Il **contratto** vive sullo
stesso elemento (`contract: { agreedAmountCents, startDate, endDate,
documentReference, notes }`) ma si salva dalla rotta dedicata
`PUT /api/v1/sponsorships/:id`. Gli **incassi** sono righe di
`payment_transactions` con `counterparty_kind = SPONSOR|SUPPLIER` scritte da
`POST /api/v1/sponsorships/:id/collections`; la vecchia collezione JSON
`sponsor_payments` e **congelata** (si legge, non si scrive). Le tre cifre —
dovuto / incassato / residuo — le calcola il server
(`GET /api/v1/sponsorships`, `GET /api/v1/sponsorships/:id`) e nessuna delle
due pagine le ricalcola. Lo **storno** di un incasso sponsor non ha un
pulsante funzionante in nessuna delle due pagine: entrambe mostrano un
cestino che risponde con un toast di errore «Un incasso non si cancella: si
storna …» (vedi §A.9 e §B.9). L'endpoint che storna una riga di
`payment_transactions` esiste ed e usato dal registro delle rate:
`POST /api/v1/payment-transactions/:id { action: "reverse", reason }`.

---

## A. `/sponsors` — Gestione Sponsor e Fornitori

**File:** `src/app/sponsors/page.tsx` (client component, `SponsorsPage`).
Layout: `src/app/sponsors/layout.tsx` → ri-esporta
`@/components/auth/management-area-layout` (`AccessAreaGuard`).

**Chrome:** `Header title="Gestione Sponsor"`; `SharedPageHeader
title="Gestione Sponsor e Fornitori" subtitle="Gestisci sponsor, partner e
fornitori della societa."`; un `div.hidden` ripete titolo in gradiente e
pulsante (codice morto). Nessuna card KPI.

**Club attivo:** letto da `?clubId=` dell'URL, altrimenti da
`localStorage.activeClub` (JSON con `id`). Se manca entrambi → schermata
**«Nessun Club Selezionato»** / «Per gestire sponsor e fornitori, devi prima
selezionare un club.» + pulsante **«Vai alla Dashboard»** (`window.location.href
= "/dashboard"`). Il codice per rileggere il club e ripetuto **quattro volte**
(in `handleAddSponsor`, `handleAddPayment`, `handleDeleteSponsor`,
`handleDeletePayment`) con lo stesso toast «Nessun club selezionato. Vai alla
dashboard per selezionare un club.».

### A.1 Data shown

Tre schede (`Tabs`, stato `activeTab` default `"sponsors"`, non in URL):
**«Sponsor»** (icona Building) · **«Fornitori»** (Building) · **«Pagamenti»**
(Euro).

**Scheda «Sponsor» — card «Elenco Sponsor»**, con campo di ricerca
`placeholder="Cerca..."` (ricerca su `name`, `email`, `vatNumber`, case
insensitive; ordinamento `sortByName` sul nome). Righe: `sponsors` filtrati con
`type === "sponsor"`. Colonne (`<th>` esatti): **Nome** (logo `sponsor.logo`
in riquadro 40px o `EntityIcon type="sponsor" shape="square"` + `name ||
"N/A"`) · **Email** (`|| "N/A"`) · **Telefono** (`|| "N/A"`) · **P.IVA**
(`vatNumber || "N/A"`) · **Residuo** (allineato a destra: `Non disponibile` se
il server non ha risposto per quello sponsor; `Nessun contratto` se
`!credit.hasContract`; altrimenti `formatAmount(outstandingCents)` in ambra se
> 0) · **Azioni**. Stati: «Caricamento...» (riga colSpan 6) · «Nessuno
sponsor trovato.».

**Scheda «Fornitori» — card «Elenco Fornitori»**, stessa ricerca; righe con
`type === "fornitore"`. Colonne: **Nome** (solo testo, senza logo) · **Email**
· **Telefono** · **P.IVA** · **Azioni**. **Nessuna colonna Residuo** per i
fornitori. Vuoto: «Nessun fornitore trovato.».

**Scheda «Pagamenti» — card «Registro Pagamenti»** + pulsante **«Nuovo
Pagamento»**. Righe: tutte le `collections` di tutti gli sponsor, dalla
risposta di `fetchSponsorsWithCredit` (`riga.collections`, ognuna con
`sponsorId`). Colonne: **Data** (`paidAt` con `toLocaleDateString("it-IT",
{year, month:"short", day})`, «—» se assente) · **Sponsor/Fornitore** (nome
risolto da `sponsors`, `"N/A"`) · **Descrizione** (`notes || paymentMethod ||
"N/A"`) · **Tipo** (pillola: **«Stornato»** grigia se `payment.reversed`,
altrimenti **«Entrata»** verde) · **Importo** (`+ €` / `- €` per
`amountCents < 0`, due decimali, barrato e grigio se stornato, altrimenti
verde) · **Stato** (pillola fissa **«Registrato»** blu) · **Azioni** (cestino).
Vuoto: «Nessun pagamento registrato.».

**Fonti:** `getClubData(clubId, "sponsors")` (anagrafica) e
`fetchSponsorsWithCredit({ clubId })` → `GET /api/v1/sponsorships?organization_id=`
(credito + incassi). Se la seconda fallisce: `creditiDalServer = Map()`,
`payments = []`, `erroreCrediti = true` — **`erroreCrediti` non e mai
renderizzato** (dead state): l'utente vede «Non disponibile» in ogni Residuo.

### A.2 Actions

| Etichetta | Dove | Comportamento | Chiamata |
|---|---|---|---|
| **«Nuovo Sponsor/Fornitore»** (Plus) | `SharedPageHeader` | `resetNewSponsor()`, preimposta `type` = `fornitore` se la scheda attiva e «Fornitori», apre `Dialog` | nessuna |
| Icona occhio `title="Visualizza Profilo"` | riga Sponsor/Fornitori | `router.push(\`/sponsors/${id}?clubId=${clubId}\`)` | nessuna |
| Icona cestino (rosso) | riga Sponsor/Fornitori | `handleDeleteSponsor(id)`: `confirm("Sei sicuro di voler eliminare questo sponsor?")` nativo | `deleteClubDataItem(clubId, "sponsors", id)`; poi filtra `payments` locali (non riscrive nulla) |
| **«Nuovo Pagamento»** (Plus) | scheda Pagamenti | `resetNewPayment()` + apre `Dialog` | nessuna |
| Icona cestino | riga Pagamenti | `handleDeletePayment`: `confirm("Sei sicuro di voler eliminare questo pagamento?")` poi **solo un toast di errore** «Un incasso non si cancella: si storna dalla scheda dello sponsor, cosi che il registro conservi cio che e stato registrato e perche e stato annullato.» | nessuna |
| **«Annulla»** / **«Crea partner»** (o **«Salva modifiche»** in `isEditMode`) | footer dialog sponsor | chiude / `handleAddSponsor()` | `addClubData(clubId, "sponsors", …)` oppure, in edit, `updateClubData(clubId, "sponsors", updatedSponsors)` (riscrive **l'intera collezione**) |
| **«Annulla»** / **«Registra pagamento»** | footer dialog pagamento | chiude / `handleAddPayment()` | `recordSponsorCollection({...})` → `POST /api/v1/sponsorships/:id/collections`; poi `loadSponsorsAndPayments()` |

**`isEditMode` e irraggiungibile**: nessun pulsante «Modifica» esiste nelle
tabelle; `setIsEditMode(true)` non compare mai. Il ramo edit del dialog e
la stringa «Salva modifiche» sono codice morto. La modifica dell'anagrafica
avviene solo dalla scheda (§B).

### A.3 Forms

**Dialog «Nuovo Sponsor» / «Nuovo Fornitore»** (titolo `Nuovo
${getSponsorTypeLabel(type)}`; `Modifica …` nel ramo morto). `max-w-4xl`.
Un `div.hidden` contiene `LogoUpload` (logo base64 in `newSponsor.logo`) e
il riquadro «Campi obbligatori» (Nome o ragione sociale · Email di riferimento
· Partita IVA o identificativo fiscale): **il caricamento del logo e
irraggiungibile** (nascosto), pur essendo mostrato nella colonna Nome se
presente.

Campi (griglia 2 colonne), tutti `Input` testo salvo indicato:

| Etichetta | `name` | Tipo | Placeholder | Obbligatorio |
|---|---|---|---|---|
| Nome / Ragione sociale * | `name` | text | Es. Partner Italia SRL | si |
| Tipologia * | `type` | `<select>` Sponsor / Fornitore (`SPONSOR_TYPE_OPTIONS`) | — | si (default `sponsor`) |
| Email * | `email` | email | amministrazione@azienda.it | si |
| Telefono | `phone` | text | +39 333 1234567 | no |
| Partita IVA * | `vatNumber` | text | IT01234567890 | si |
| Codice fiscale | `fiscalCode` | text | RSSMRA80A01H501U | no |
| PEC | `pec` | text | partner@pec.it | no |
| Codice SDI | `sdi` | text | ABC1234 | no |
| IBAN | `iban` | text | IT60X0542811101000000123456 | no |

Riquadro **«Sede e localizzazione»**: Indirizzo (`address`, Via Roma 10,
col-span 2) · Città (`city`, Milano) · Provincia (`province`, MI) · CAP
(`postalCode`, 20100) · Regione (`region`, Lombardia) · Nazione (`country`,
default `"Italia"`, col-span 2).

Validazione (`handleAddSponsor`): `name`, `email`, `vatNumber` non vuoti
dopo `trim()`, altrimenti toast **«Compila tutti i campi obbligatori»**.
Nessuna validazione di formato. Record salvato: tutti i campi del draft +
`id: \`sponsor-${Date.now()}-${random}\``, `created_at`, `updated_at`. Toast:
**«Sponsor aggiunto con successo»** / **«Sponsor aggiornato con successo»** /
**«Errore nel salvare lo sponsor»**.

**Dialog «Nuovo pagamento sponsor»** (`max-w-2xl`, intestazione in gradiente
scuro — da rimuovere). Campi:

| Etichetta | `name` | Tipo | Obbligatorio |
|---|---|---|---|
| Sponsor / Fornitore * | `sponsorId` | `<select>` «Seleziona un partner» + tutti gli `sponsors` | si |
| Data * | `date` | date, default `todayLocalDateOnly()` | no (se vuota → `paidAt: null`) |
| Importo * | `amount` | number min 0 step 0.01, placeholder 0.00 | si, `parseFloat > 0` |
| Tipo movimento | `type` | `<select>` **solo «Entrata»** (l'opzione «Uscita» e stata tolta: test `una tendina non offre un movimento che il gestore non registra`) | — |
| Stato | `status` | `<select>` Completato / In attesa | **non inviato** al server |
| Descrizione * | `description` | text, placeholder «Es. Saldo sponsorizzazione stagione 2026» | si |

Invio: `recordSponsorCollection({ clubId, sponsorId, amount, paidAt: date ||
null, paymentMethod: "Bonifico" (hardcoded), notes: description })`. Nessun
conto, nessuna causale. Toast: **«Compila tutti i campi obbligatori»** ·
**«Pagamento registrato con successo»** · errore = `error.message` o
**«Errore nel salvare il pagamento»**.

### A.4 Filters / search / sort / grouping / views

- Ricerca testuale (`searchQuery`, unico stato condiviso dalle due schede)
  su nome, email, P.IVA.
- «Viste»: le tre schede (Sponsor / Fornitori / Pagamenti) — la
  distinzione per `type`.
- Ordinamento fisso per nome (`sortByName`). Nessun ordinamento per colonna,
  nessun raggruppamento, nessuna paginazione, nessuna densita.

### A.5 Bulk actions / selection

Nessuna.

### A.6 Exports / imports

Nessuna (ne CSV ne stampa).

### A.7 Permissions / role gates

**Nella pagina: nessun predicato.** Tutto e gestito dalle rotte:

| Operazione | Rotta | Predicato server (chiave esatta) |
|---|---|---|
| Area `/sponsors` | `AccessAreaGuard` + `MANAGEMENT_PATH_PREFIXES` | ruoli gestionali (owner, club_manager, staff, collaborator) |
| Leggere / creare / modificare / eliminare l'anagrafica | `/api/v1/sponsors` (CRUD generico) | `canAccessClubResource(role, "sponsors", action)`: `sponsors` e in `MANAGEMENT_OPEN_RESOURCES`, **non** in `MANAGEMENT_ADMIN_ONLY_DELETE_RESOURCES` → tutti i ruoli gestionali, anche in delete |
| Leggere credito e incassi | `GET /api/v1/sponsorships[/:id]` | `assertAccountingPermission(role, "accounting.read")` |
| Salvare il contratto | `PUT /api/v1/sponsorships/:id` | `accounting.manage` |
| Registrare un incasso | `POST /api/v1/sponsorships/:id/collections` | `accounting.manage` |
| Stornare un incasso | `POST /api/v1/payment-transactions/:id {action:"reverse"}` | `canManageClubConfigurationAsActor(role) \|\| hasAccountingPermission(role, "accounting.reverse")` — la segreteria (staff, collaborator) **non** ce l'ha |

Matrice `PERMESSI_PER_RUOLO` (`src/lib/accounting/permissions.ts`): owner e
club_manager hanno tutto; staff e collaborator hanno `read`, `manage`,
`reconcile`; i ruoli personalizzati passano da `narrowDomainPermission`.
Un ruolo senza `accounting.read` vede l'elenco con «Non disponibile» in ogni
Residuo (il 403 e ingoiato).

### A.8 States

- «Caricamento...» nelle tre tabelle (`loading`), nessuno scheletro.
- Vuoti: «Nessuno sponsor trovato.» · «Nessun fornitore trovato.» · «Nessun
  pagamento registrato.».
- Errore di lettura anagrafica: toast **«Errore nel caricamento dei dati»**,
  elenchi vuoti. Errore di lettura credito: silenzioso (vedi §A.1).
- Club mancante: schermata «Nessun Club Selezionato».
- Testi delle pillole: «Stornato» / «Entrata» / «Registrato».

### A.9 Destructive flows

- **Elimina sponsor/fornitore**: `confirm()` nativo «Sei sicuro di voler
  eliminare questo sponsor?» → `deleteClubDataItem`. Cosa se ne va:
  anagrafica, contratto, documenti (tutti sullo stesso elemento JSON). Cosa
  **resta**: gli incassi in `payment_transactions` con l'etichetta della
  controparte congelata (commento nel sorgente: «Gli incassi di uno sponsor
  cancellato restano nel registro»). Toast: «Sponsor eliminato con successo» /
  «Errore nell'eliminare lo sponsor».
- **Elimina pagamento**: `confirm()` nativo poi **rifiuto con toast** (vedi
  §A.2). Non esiste uno storno in questa pagina.

### A.10 Navigation

- Ingresso: `/sponsors` (+ `?clubId=` facoltativo).
- Uscita: `/sponsors/:id?clubId=` (occhio), `/dashboard` (club mancante).
- Nessun deep link alle schede (`activeTab` non e in URL).

### A.11 Related tests

- `tests/ui/causali-e-storni-in-superficie.test.mjs`:
  - «uno storno si dichiara in tutte e due le schermate di uno sponsor»:
    entrambe le pagine devono contenere `payment.reversed` e «Stornato»;
  - «l'elenco degli sponsor legge gli incassi dalla stessa fonte del
    residuo»: niente `getClubData(…"sponsor_payments")`, niente
    `deleteClubDataItem(…"sponsor_payments")`, deve comparire `riga.collections`;
  - «una tendina non offre un movimento che il gestore non registra»: nessun
    `<option value="uscita">` in `src/app/sponsors/page.tsx`.
- `tests/ui/responsive-invariants.test.mjs` «il guscio del club non cresce
  con il proprio contenuto»: `app/sponsors/page.tsx` deve contenere
  `className="flex min-w-0 flex-1 flex-col overflow-hidden"` e non il doppio
  ramo `lg:hidden`.
- `tests/lib/sponsor-credit.test.mjs`, `tests/lib/fiscal-recipient-counterparty.test.mjs`:
  dominio puro (`src/lib/sponsors/model.ts`), non toccano le pagine.

### A.12 Component inventory

`Sidebar`, `Header`, `DashboardPageContainer`, `dashboardMainClassName`,
`SharedPageHeader`, `Card*`, `Button`, `Input`, `Label`, `Tabs*`, `Table*`,
`Dialog*`, `LogoUpload` (nascosto), `EntityIcon`, icone lucide
(`Building, CreditCard, Mail, MapPin, Phone, Plus, Search, Trash2, Edit,
FileText, Euro, Eye` — meta non usate), `useToast`, `useRouter`,
`simplified-db` (`addClubData, getClubData, updateClubData,
deleteClubDataItem`), `sortByName`, `todayLocalDateOnly`,
`@/lib/sponsors/client` (`fetchSponsorsWithCredit, recordSponsorCollection`),
`@/lib/sponsors/model` (`fromSponsorCents`, tipi; `normalizeSponsorContract`
e `resolveSponsorCredit` importati e non usati).

### A.13 Codice morto e incoerenze da segnalare

- `isEditMode` / «Salva modifiche» irraggiungibili; `selectedSponsor` mai
  impostato; `formatDate` definita e usata solo nei pagamenti; `erroreCrediti`
  mai letto; `div.hidden` con titolo in gradiente e `LogoUpload`;
  `getSponsorPayments` mai usato; `normalizeSponsorContract`,
  `resolveSponsorCredit`, `SPONSOR_TYPE_OPTIONS.label` per il titolo.
- Il campo «Stato» (Completato / In attesa) del pagamento non viene inviato.
- Il metodo di pagamento e sempre «Bonifico».
- I fornitori non hanno la colonna Residuo pur avendo lo stesso modello di
  contratto.

---

## B. `/sponsors/[id]` — Dettaglio Sponsor/Fornitore

**File:** `src/app/sponsors/[id]/page.tsx` (client component,
`SponsorDetailsPage`). Stesso layout di `/sponsors`.

**Chrome:** `Header title="Dettaglio Sponsor/Fornitore"` (o «Sponsor/Fornitore
Non Trovato»). Intestazione: logo (`sponsor.logo`, **mai valorizzato**: il
mapping in `setSponsor` non copia `logo`) o `EntityIcon size="lg"`, nome in
`h1` con gradiente blu→viola, badge **«Sponsor»** (blu) se `isSponsor`,
**«Fornitore»** (verde) se `isSupplier`, **«P.A.»** (outline) se
`isPublicAdministration`; a destra pulsante **«Elimina»** (destructive, unico
pulsante — nessun «Modifica» in testa).

**Club:** **solo** da `?clubId=` (se manca / «null» / vuoto → toast «ID del
club mancante. Torna alla lista sponsor.» e pagina «Sponsor/Fornitore non
trovato»). Nessun ripiego su localStorage o sul club attivo.

**Lettura:** `supabase.from("clubs").select("sponsors").eq("id",
clubId).maybeSingle()` → `GET /api/v1/clubs?id=&fields=sponsors`; trova
l'elemento con `id === sponsorId`; mappa i campi (`name || "Nome non
disponibile"`, `fiscalCode`, `phone`, `phoneSecondary`, `email`,
`isPublicAdministration`, `isSponsor = type === "sponsor" || isSponsor`,
`isSupplier = type === "fornitore" || isSupplier`, `address`, `streetNumber`,
`city`, `postalCode`, `country || "Italia"`, `region`, `province`, `vatNumber`,
`pec`, `sdi`, `iban`, `type || "sponsor"`); `contract =
normalizeSponsorContract(sponsorData.contract)`; `documents =
sponsorData.documents || []`; poi `ricaricaIncassi()` →
`fetchSponsorCredit(sponsorId, { clubId })` → `GET /api/v1/sponsorships/:id`
→ `creditoDalServer` + `payments` (mappati: `description = notes ||
counterpartyLabel || "Incasso"`, `amount = |amountCents|/100`, `type =
amountCents < 0 ? "uscita" : "entrata"`, `date = paidAt`, `paymentMethod`,
`notes`, `reversed`). Toast di errore: «Errore nel caricamento dei dati del
club: {msg}» · «Club non trovato. Verifica l'ID del club.» ·
«Sponsor/Fornitore non trovato» · «Errore nel caricamento dei dati dello
sponsor» · «ID dello sponsor mancante».

### B.1 Data shown

Tre schede (`Tabs defaultValue="anagrafica"`, non in URL): **«Anagrafica»**
(Building) · **«Finanza»** (CreditCard) · **«Archivio»** (FileText).

**Anagrafica**
- Card **«Dati Anagrafici»** (matita → `handleEditSection("anagrafica")`):
  «Ruolo» (Sponsor: SÌ/NO, Fornitore: SÌ/NO come badge) · «Nome/Ragione
  Sociale *» · «Codice Fiscale» · «Telefono (Primario)» (icona) · «Telefono
  (Secondario)» · «Email» (icona) · «Pubblica Amministrazione» (badge SÌ/NO).
  Valori mancanti: «-».
- Card **«Sede»** (matita → `"sede"`): «Indirizzo» (icona MapPin) · «Numero
  Civico» · «Comune» · «CAP» · «Paese» · «Regione» · «Provincia».

**Finanza**
- Card **«Contratto e credito»**, pulsante **«Modifica»** o **«Registra
  contratto»** (se `!credit.hasContract`) → editor in linea. Tre riquadri
  affiancati (mai sommati): **«Dovuto»** (`formatAmount(dueCents)`, sotto
  «Pattuito dal contratto. Non e cassa.») · **«Incassato»** (verde, «Somma
  degli incassi registrati.») · **«Residuo»** (ambra se > 0; sotto «Dovuto
  meno incassato.» o «Nessun contratto registrato.»). Poi, in lettura:
  «Periodo» (`{dal} → {al}`, «—» per un estremo mancante, «-» se entrambi
  assenti) · «Riferimento del contratto» · «Note» (`whitespace-pre-line`).
- Card **«Dati Finanziari»** (matita → `"finanza"`): «Partita IVA» · «PEC» ·
  «SDI (Fatturazione Elettronica)» · «IBAN» (monospace).
- Card **«Pagamenti»** + pulsante **«Nuovo Pagamento»**. Colonne: **Data** ·
  **Causale** (`description`) · **Tipo** (`Ban` + «Stornato» grigio se
  `reversed`; `TrendingUp` + «Entrata» verde; `TrendingDown` + «Uscita» rosso)
  · **Importo** (`+€`/`-€` due decimali; barrato se stornato) · **Metodo** ·
  **Azioni** (cestino). Vuoto: «Nessun pagamento registrato». Sotto la
  tabella: «Un incasso non si cancella: si storna dalla pagina Movimenti, cosi
  la correzione resta leggibile.»

**Archivio**
- Card **«Documenti e Contratti»** + pulsante **«Nuovo Documento»**. Colonne:
  **Titolo** · **Descrizione** (`|| "-"`) · **Data Creazione** · **Azioni**
  (icona Download **senza `onClick`** — non fa nulla; cestino). Vuoto:
  «Nessun documento registrato».

### B.2 Actions

| Etichetta | Dove | Comportamento | Chiamata |
|---|---|---|---|
| **«Elimina»** (Trash2) | intestazione | `confirm("Sei sicuro di voler eliminare questo sponsor/fornitore?")` | `deleteClubDataItem(clubId, "sponsors", sponsorId)`; toast «Sponsor/Fornitore eliminato con successo» / «Errore nell'eliminazione dello sponsor»; `router.push(\`/sponsors?clubId=${clubId}\`)` |
| Matita (3 card) | Dati Anagrafici / Sede / Dati Finanziari | `handleEditSection(section)`: copia `sponsor` in `editFormData`, apre la modale «Modifica Informazioni» | nessuna |
| **«Annulla»** / **«Salva Modifiche»** | modale | chiude / `handleSaveSection()` | `updateClubDataItem(clubId, "sponsors", sponsorId, editFormData)` (fonde sull'elemento); toast «Modifiche salvate con successo» / «Errore nel salvataggio delle modifiche» |
| **«Modifica»** / **«Registra contratto»** | card Contratto | `openContractEditor()` (draft da `contract`) | nessuna |
| **«Annulla»** / **«Salva contratto»** | editor contratto | `handleSaveContract()` | `saveSponsorContract({ clubId, sponsorId, contract })` → `PUT /api/v1/sponsorships/:id`; toast «Contratto salvato» / `error.message` / «Errore nel salvataggio del contratto» / «Contratto non valido» |
| **«Nuovo Pagamento»** | card Pagamenti | apre dialog «Crea Nuovo Pagamento» | nessuna |
| **«Annulla»** / **«Registra Pagamento»** | dialog pagamento | `handleAddPayment()` | `recordSponsorCollection({ clubId, sponsorId, amount, paidAt, paymentMethod, notes: [description, notes].join(" - ") })`; poi `ricaricaIncassi()`; toast «Pagamento registrato con successo» / `error.message` / «Errore nella registrazione del pagamento» |
| Cestino su un pagamento | riga Pagamenti | `handleDeletePayment`: **solo toast di errore** «Un incasso non si cancella: si storna dalla pagina Movimenti, cosi la correzione resta leggibile.» | nessuna |
| **«Nuovo Documento»** | card Documenti | apre dialog «Aggiungi Documento» | nessuna |
| **«Annulla»** / **«Aggiungi Documento»** | dialog documento | `handleAddDocument()` | `updateClubDataItem(clubId, "sponsors", sponsorId, { ...sponsor, documents })`; toast «Inserisci un titolo per il documento» / «Documento aggiunto con successo» / «Errore nell'aggiunta del documento» |
| Download | riga documento | **nessun handler** | — |
| Cestino documento | riga documento | `confirm("Sei sicuro di voler eliminare questo documento?")` | `updateClubDataItem(… { ...sponsor, documents: filtrati })`; toast «Documento eliminato con successo» / «Errore nell'eliminazione del documento» |

### B.3 Forms

**Modale «Modifica Informazioni»** (overlay fatto a mano, chiude al clic sul
velo, X in alto). Contenuto per sezione:

- `anagrafica`: `Switch` **Sponsor** (`isSponsor`) · `Switch` **Fornitore**
  (`isSupplier`) · **Nome/Ragione Sociale *** (`name`) · **Codice Fiscale**
  (`fiscalCode`) · **Telefono (Primario)** (`phone`) · **Telefono
  (Secondario)** (`phoneSecondary`) · **Email** (`email`, type email) ·
  `Switch` **Pubblica Amministrazione** (`isPublicAdministration`).
- `sede`: **Indirizzo** (`address`) · **Numero Civico** (`streetNumber`) ·
  **Comune** (`city`) · **CAP** (`postalCode`) · **Paese** (`country`) ·
  **Regione** (`region`) · **Provincia** (`province`).
- `finanza`: **Partita IVA** (`vatNumber`) · **PEC** (`pec`) · **SDI
  (Fatturazione Elettronica)** (`sdi`) · **IBAN** (`iban`).

**Nessuna validazione** (l'asterisco su «Nome/Ragione Sociale» e solo
grafico). Payload: l'intero `editFormData` (l'oggetto mappato, **senza**
`logo`, `contract`, `documents`, che `updateClubDataItem` conserva perche
fonde). **Incoerenza**: i due `Switch` scrivono `isSponsor`/`isSupplier` ma
non `type`: l'elenco continua a classificare per `type`.

**Editor contratto** (in linea nella card): **Importo pattuito (€)**
(`inputMode="decimal"`, notazione italiana via `toSponsorCents`) ·
**Riferimento del contratto** · **Dal** (date) · **Al** (date) · **Note**
(textarea). Validazione `sanitizeSponsorContract` → toast «Contratto non
valido: L'importo pattuito non puo essere negativo; La fine del periodo
precede l'inizio».

**Dialog «Crea Nuovo Pagamento»** (`sm:max-w-[600px]`): **Causale ***
(`description`) · **Importo (€) *** (number → `parseFloat || 0`) · **Tipo ***
(`<select>` **In entrata** / **In uscita** — **«In uscita» e un'opzione
ignorata**: il server registra sempre un incasso positivo) · **Data ***
(default oggi) · **Metodo di pagamento *** (testo libero) · **Conto Corrente**
(`bankAccount`, **non inviato**) · **Note** (textarea). Validazione:
`description`, `amount`, `paymentMethod` non vuoti → «Compila tutti i campi
obbligatori». Nessun conto finanziario, nessuna causale del catalogo.

**Dialog «Aggiungi Documento»**: **Titolo *** · **Descrizione** (textarea) ·
**Allega documento** (pulsante «Seleziona file» / nome del file; input file
nascosto). **Il file non viene caricato**: si salva solo `fileName`
(`id: doc-…`, `title`, `description`, `fileName`, `created_at`).

### B.4 Filters / search / sort / grouping / views

Nessun filtro ne ricerca. Le tre schede sono le «viste». Pagamenti e
documenti in ordine di arrivo.

### B.5 Bulk actions / selection

Nessuna.

### B.6 Exports / imports

Nessuna (il pulsante Download dei documenti non ha handler).

### B.7 Permissions / role gates

**Nella pagina: nessun predicato.** Stesse rotte e chiavi di §A.7:
anagrafica e documenti via CRUD generico (`sponsors`, aperto ai gestionali);
contratto e incasso `accounting.manage`; credito `accounting.read`; storno
(non cablato) `accounting.reverse` o proprietario/gestore.

### B.8 States

- Caricamento: spinner a pagina intera (`animate-spin`).
- Non trovato: «Sponsor/Fornitore non trovato» + **«Torna alla lista
  sponsor»** (`/sponsors?clubId=`).
- Vuoti: «Nessun pagamento registrato» · «Nessun documento registrato».
- Testi di riga: «Stornato» / «Entrata» / «Uscita»; badge «SÌ» / «NO».

### B.9 Destructive flows

- **Elimina sponsor**: `confirm()` nativo → `deleteClubDataItem` → torna
  all'elenco. Gli incassi restano nel registro.
- **Elimina documento**: `confirm()` nativo → riscrive `documents`.
- **Pagamento**: **non si elimina** (toast). Lo storno non e cablato; la
  regola del dominio (ADR-0036, D-3): un incasso si storna con
  `POST /api/v1/payment-transactions/:id { action: "reverse", reason }`
  (motivo obbligatorio lato pagina nel registro rate; il server ripiega su
  «Storno registrato dalla segreteria»), nasce la riga opposta, l'originale
  resta con `reversed_at`.

### B.10 Navigation

- Ingresso: `/sponsors/:id?clubId=` (obbligatorio).
- Uscita: `/sponsors?clubId=` (Elimina, Non trovato).
- Nessun deep link alle schede.

### B.11 Related tests

- `tests/ui/causali-e-storni-in-superficie.test.mjs` «uno storno si dichiara
  in tutte e due le schermate di uno sponsor» (vedi A.11).
- Nessun test statico specifico per `[id]/page.tsx` oltre a quello.

### B.12 Component inventory

`Sidebar`, `Header`, `DashboardPageContainer`, `Card*`, `Button`, `Input`,
`Label`, `Textarea`, `Badge`, `Tabs*`, `Switch`, `LogoUpload` (importato, non
usato), `EntityIcon`, `Table*`, `Dialog*`, icone lucide (molte inutilizzate:
`Mail, Phone, MapPin, X, Download, Upload, Euro, Calendar, Ban, TrendingUp,
TrendingDown`), `useParams/useRouter/useSearchParams`, `useToast`,
`supabase` (adapter fetch), `@/lib/sponsors/client`
(`fetchSponsorCredit, recordSponsorCollection, saveSponsorContract`),
`@/lib/sponsors/model` (`EMPTY_SPONSOR_CONTRACT, fromSponsorCents,
normalizeLegacySponsorCollections, normalizeSponsorContract,
resolveSponsorCredit, sanitizeSponsorContract, toSponsorCents`),
`simplified-db` (`updateClubDataItem, deleteClubDataItem` via import
dinamico), `todayLocalDateOnly`.

### B.13 Codice morto e incoerenze da segnalare

- `logo` mai mappato → mai mostrato nella scheda.
- Download documento senza handler; file mai caricato.
- «In uscita» nella tendina del pagamento e «Conto Corrente» ignorati.
- `Switch` Sponsor/Fornitore disallineati da `type`.
- Nessun ripiego per il club (solo `?clubId=`), a differenza dell'elenco.
- Spinner a pagina intera.

---

## Sintesi — capacita facili da perdere nel redesign

1. Le **tre cifre** dovuto / incassato / residuo arrivano dal server e non si
   sommano mai; il residuo negativo si mostra (sponsor che versa piu del
   pattuito).
2. **Sponsor e fornitore** sono lo stesso record con `type`; i fornitori non
   avevano il residuo in elenco ma hanno lo stesso contratto.
3. Il **registro degli incassi** trasversale (scheda «Pagamenti» dell'elenco)
   con «Nuovo Pagamento» che chiede lo sponsor.
4. «**Stornato**» dichiarato sulla riga (`reversed`) e importo barrato; lo
   storno vero non era cablato — la regola e «mai cancellare un incasso».
5. Il **contratto** con la notazione italiana degli importi e la validazione
   a elenco.
6. **Codice fiscale accanto alla P.IVA**, PEC, SDI, IBAN: la fattura allo
   sponsor ne ha bisogno.
7. `phoneSecondary`, `streetNumber`, `region`, `isPublicAdministration`:
   campi solo della scheda.
8. **Documenti**: titolo, descrizione, nome del file (nessun caricamento).
9. Il **logo** (base64 in `logo`) mostrato nell'elenco.
10. `?clubId=` nei link fra elenco e scheda.
