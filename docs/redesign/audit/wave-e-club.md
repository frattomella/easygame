# Wave E — Audit di parità: Club (`/organization`)

> Inventario funzionale dell'implementazione V1 sul branch `feat/web-redesign`,
> scritto **prima** della migrazione al Web V2 (Addendum del brief). È il
> contratto di parità: niente sparisce. Nessuna proposta di design.
>
> Rotta coperta: `/organization` (con `?tab=` e `?clubId=`). File letti per
> intero: `src/app/organization/page.tsx` (1847 righe),
> `src/app/organization/payment-methods-config.tsx` (750, **orfano**),
> `src/app/organization/layout.tsx`, `src/components/organization/season-manager.tsx`
> (1240), `src/components/organization/club-signature-panel.tsx` (279),
> `src/components/fiscal/FiscalProfilePanel.tsx` (387),
> `src/components/fiscal/OperationTypesPanel.tsx` (721),
> `src/components/club/capability-gate.tsx` (218), `src/lib/club-profile.ts`,
> `src/lib/api/seasons.ts`, `src/lib/api/club-signature.ts`, i pannelli di
> `src/components/payments/` che la pagina monta, e i test che la citano.

---

## Indice

1. [Guscio, intestazione e schede](#guscio-intestazione-e-schede)
2. [Sorgente dati e autosave](#sorgente-dati-e-autosave)
3. [Le nove schede, campo per campo](#le-nove-schede-campo-per-campo)
4. [Stagioni (`SeasonManager`)](#stagioni-seasonmanager)
5. [Firma e timbro (`ClubSignaturePanel`)](#firma-e-timbro-clubsignaturepanel)
6. [Profilo fiscale (`FiscalProfilePanel`)](#profilo-fiscale-fiscalprofilepanel)
7. [Causali (`OperationTypesPanel`)](#causali-operationtypespanel)
8. [Pagamenti e fatturazione (pannelli condivisi)](#pagamenti-e-fatturazione-pannelli-condivisi)
9. [Permessi](#permessi)
10. [Stati, flussi distruttivi, navigazione](#stati-flussi-distruttivi-navigazione)
11. [Test collegati](#test-collegati)
12. [Inventario componenti](#inventario-componenti)
13. [Cosa non esiste in V1](#cosa-non-esiste-in-v1)

---

## Guscio, intestazione e schede

`src/app/organization/layout.tsx`: `AccessAreaGuard` + `ToastProvider`.
`page.tsx`: guscio unico `Sidebar` + `Header title="Club"` + `main` +
`DashboardPageContainer` (il contenitore con `flex min-w-0 flex-1 flex-col
overflow-hidden`, presidiato da `responsive-invariants`). `SharedPageHeader
title="Club" subtitle="Gestisci struttura, ruoli e informazioni del tuo
club."` con, nelle azioni, **un solo** `<SaveStatus state savedAt message>`.

### 11. Schede

Nove `Tabs` (Radix, una montata per volta): `generale` «Generale» · `fiscali`
«Dati Fiscali» · `bancari` «Dati Bancari» · `contatti` «Contatti» ·
`federazione` «Federazione» · `stagioni` «Stagioni» · `pagamenti» «Pagamenti»
· `fatturazione` «Account e Fatturazione» · `social` «Social». Sotto `md` la
barra è un carosello (frecce ‹ › + etichetta corrente); da `md` in su una
`TabsList` scorrevole.

### 10. Navigazione e parametri

- `?tab=`: `stagioni|stagione` → Stagioni; `pagamenti|payments` → Pagamenti;
  `fatturazione|billing` → Account e Fatturazione. Altri valori ignorati
  (resta «Generale»). Il parametro si **legge**, non si riscrive.
- `?clubId=` → prima scelta del club; altrimenti `localStorage.activeClub.id`.
  Senza club: la pagina resta vuota (nessun caricamento).
- Link in entrata: `Sidebar` V2 («Stagioni del club» →
  `/organization?tab=stagioni`), `Topbar` (chip stagione → stesso link),
  `/registration-management` («Gestisci le stagioni» → `?tab=stagioni`;
  «Vai ai pagamenti» → `?tab=pagamenti`).
- Link in uscita: «Assegnali» → `/athletes` (avviso atleti senza squadra).

## Sorgente dati e autosave

### 1. Dati mostrati

`getClub(activeClubId)` (`simplified-db`) → `clubSnapshot`. Ogni campo del
modulo si legge da una **colonna** con ripiego su `settings.*` (l'ordine di
lettura è in `loadClubData`, righe 389–529): `name`, `type|settings.type`,
`founding_year|settings.foundingYear`, `address, city, postal_code, region,
province, country ("Italia")`, `business_name|settings.businessName`,
`pec|settings.pec|settings.companyPec`, `vat_number`, `fiscal_code`,
`tax_regime|settings.tax_regime`, `ateco_code|settings.atecoCode`,
`sdi_code`, `legal_*` (6), `representative_name|surname|fiscal_code`,
`bank_name`, `iban`, `contact1_name|settings.contact1Name`, `phone1 |
settings.contact1Phone | contact_phone | settings.phone`, `email1 |
settings.contact1Email | contact_email | settings.email`, `contact2_*`,
`facebook|instagram|twitter|youtube|website` (colonna o settings), `types`
(colonna, poi `settings.types`, poi `[type]`; `dilettante`→«Dilettante»,
`professionista`→«Professionista»; un valore fuori lista accende l'input
«tipologia custom»), `email|settings.email|email1` → Email società,
`pec|settings.pec|settings.companyPec` → PEC, `tax_regime` (in lista → preset;
altrimenti preset «Altro» + input custom), `sports[]|[sport]`, `logo_url`,
`federations|settings.federations`, `settings.paymentSettings`
(`normalizePaymentSettings`), `readSubscriptionSettingsSource(settings)`
(`normalizeSubscriptionSettings`), `settings.extraServices`
(`normalizeExtraServices`). Logo iniziale anche da
`localStorage["organization-logo"]`.

### Autosave (`src/lib/club-profile.ts`)

`clubProfileDraft` (memo) raccoglie tutti i campi; `AUTOSAVE_SECTIONS` =
`generale, contatti, social, fiscali, bancari, federazione, pagamenti`
(`stagioni` e `fatturazione` **no**). Effetto su ogni cambio del draft (non
sulla scheda aperta): per ogni sezione calcola `clubProfileSectionSnapshot`;
se diversa dall'ultima scritta, `validateClubProfileSection` — un problema
**blocca** quella sezione e va in `saveError`/`saveState="error"`
(`blockingRef`), le altre si scrivono comunque. Debounce 1000 ms
(`CLUB_AUTOSAVE_DEBOUNCE_MS`), scrittura serializzata e accorpata con
`createCoalescingSaver` (`persistClubSections`), una `saveClubProfileSection`
per sezione sporca (`PATCH /api/v1/clubs/:id` con `settings_patch`, WP-36).
Dopo «generale» riuscita: `syncClubIdentityLocally(name, logoUrl)` →
`localStorage.activeClub.name/logo_url`, `organization-name`,
`organization-logo`, evento `club-updated`. Semina delle impronte solo dopo
il primo `clubSnapshot` (`seededClubIdRef`); cambio `clubId` azzera runner e
semina. Stati: `idle|saving|saved|error` + `savedAt` + messaggio.

Validazioni (testo esatto, in `validateClubProfileSection`):
- generale: «Il nome del club e obbligatorio.» · «Il CAP ha cinque cifre.»
- fiscali: «La partita IVA ha undici cifre.» · «Il codice fiscale della
  societa ha undici cifre o sedici caratteri.» · «Il codice fiscale del legale
  rappresentante non e valido.» · «Il CAP della sede legale ha cinque cifre.»
- bancari: «L'IBAN non e ancora completo: due lettere di paese, due cifre di
  controllo e almeno undici caratteri.»
- pagamenti: `validatePaymentSettingsForSave`.
- errore di rete: `error.message` o «Non salvato: riprova a modificare».

### 5 / 6. Azioni di massa, export/import

Nessuna. Nessun export, nessun import.

## Le nove schede, campo per campo

### 3. Moduli (tutti in autosave, nessun pulsante «Salva»)

**Generale** (card «Informazioni Generali»)
- Logo: `LogoUpload currentLogo onLogoChange name aspectRatio="square"` +
  «Trascina o clicca per caricare il logo». Il logo va anche in
  `localStorage["organization-logo"]`.
- Nome (`CapitalizedInput`, `name`) — obbligatorio (vedi validazione).
- Tipologia: chip rimovibili dei valori scelti + `Select` su
  `CLUB_TYPES_LIST = [Dilettante, Professionista, Altro]` (placeholder
  «Seleziona una tipologia»); «Altro» apre input «Inserisci tipologia» +
  pulsante «Aggiungi». Multi-valore, senza duplicati. Default `["Dilettante"]`.
- Anno di Fondazione (`Input type=number`).
- Sport: chip rimovibili + combobox «Aggiungi sport» con ricerca «Cerca
  sport...» su `SPORTS_LIST` (25 voci, ultima «Altro»; «Nessuno sport
  trovato»); il clic aggiunge/toglie; «Altro» mostra input «Inserisci nome
  sport» + «Aggiungi».
- Indirizzo (`CapitalizedInput`).
- `AssistedAddressFields idPrefix="club-operational"` → `postalCode, city,
  province, region, country`.

**Dati Fiscali**
- Card «Anagrafica»: Ragione Sociale (`CapitalizedInput`), P.IVA, Codice
  Fiscale, Regime Fiscale (`Select` su `TAX_REGIMES_LIST = [Ordinario,
  398/1991 (ASD/SSD), Forfettario (L.190/2014), Regime dei minimi, Altro]`,
  default «398/1991 (ASD/SSD)»; «Altro» → input «Regime fiscale custom»
  placeholder «Scrivi il tuo regime fiscale»), Codice ATECO, Codice SDI
  (placeholder «Codice per fatturazione elettronica»).
- Card «Sede Legale»: Indirizzo (`CapitalizedInput`) +
  `AssistedAddressFields idPrefix="club-legal"` (mappati su `legal*`).
- Card «Legale Rappresentante»: Nome, Cognome (`CapitalizedInput`),
  `AssistedFiscalCodeField id="representativeFiscalCode" enableCompute={false}`
  con `person={{firstName, lastName}}`.
- `ClubSignaturePanel clubId` (vedi §5).

**Dati Bancari**: IBAN (`Input`), Nome Banca (`CapitalizedInput`).

**Contatti**
- Card «Dati Società»: Email Società (`type=email`, placeholder
  `email@societa.it`, icona Mail), PEC (`type=email`, `pec@pec.it`).
- Card «Contatto 1» / «Contatto 2»: Nome Contatto (`CapitalizedInput`,
  placeholder «Nome e Cognome»), `PhoneField label="Telefono"`, Email
  (`type=email`).

**Federazione** (card «Federazioni e Affiliazioni» + pulsante «Aggiungi»)
- Tabella inline: Federazione/Ente (`Select` su `ITALIAN_FEDERATIONS`, 29
  voci, ultima «Altro»; «Altro» svuota il nome; se il nome non è in lista
  compare `Input` «Inserisci nome manualmente»), Codice Affiliazione
  (placeholder «Es. 123456»), Data Affiliazione (`type=date`), Azioni
  (cestino, **senza conferma**). Vuoto: «Nessuna affiliazione registrata».
- `addFederation` → `{ id: fed-<ts>, name: "", registrationNumber: "",
  affiliationDate: todayLocalDateOnly() }`.
- Persistenza: `settings.federations` (sezione `federazione`).

**Stagioni**: `<SeasonManager onActiveSeasonChange={(season) =>
rememberActiveSeason(season.id, season.label, clubId)} />` (§4).

**Pagamenti**: `<CapabilityGate feature="online_payments">` →
`<ClubPaymentSettings value={paymentSettings} onChange organizationId>`
(§8). I metodi manuali **non** stanno qui.

**Account e Fatturazione**: `<ClubBillingSettings subscription extraServices
readOnly />` + `<FiscalProfilePanel organizationId>` + `<OperationTypesPanel
organizationId>`.

**Social** (card «Social Media e Web»): Facebook, Instagram, X (Twitter),
YouTube, Sito Web (placeholder `https://...`).

### 2. Azioni di pagina

Nessuna azione primaria. Solo l'indicatore `SaveStatus`. I pulsanti vivono
nelle schede: «Aggiungi» (federazione), «Nuova stagione», «Attiva», «Riporta
dati», «Archivia», «Carica/Sostituisci/Rimuovi» (firma), «Salva profilo
fiscale», «Salva/Disattiva/Riattiva/Elimina/Aggiungi» (causali), «Collega il
conto…», «Aggiorna» (conto di incasso).

## Stagioni (`SeasonManager`)

Solo `@/lib/api/seasons`: `fetchSeasonsOverview()` (GET
`/api/v1/seasons`), `createSeason`, `updateSeasonStatus(id,
"activate"|"archive")`, `runSeasonRollover({targetSeasonId, sourceSeasonId,
types, athleteIds, preview?})`, `fetchSeasonRoster(seasonId)`.

### 1. Dati

`overview`: `seasons[] {id,label,startDate,endDate,status}`,
`activeSeasonId`, `counts[seasonId][type]`, `rolloverTypes[] {key, label,
description, defaultSelected}`, `globalTypes[]`, `neverCopiedTypes[]`,
`athletesWithoutTeam`. Testo: «La stagione attiva e il perimetro dei dati che
vedi in tutta l'applicazione. Le stagioni archiviate restano consultabili: per
rileggerle basta attivarle di nuovo.»

Avviso ambra se `athletesWithoutTeam > 0`: «**N** atleti non appartengono a
nessuna squadra della stagione attiva.» + «Assegnali» → `/athletes`.

Riga stagione: etichetta + badge stato (`SEASON_STATUS_LABELS`: Futura ·
Attiva · Archiviata), «gg/mm/aaaa — gg/mm/aaaa», «N voci di configurazione
stagionale» (somma dei `counts`). Azioni: **Attiva** (disabilitato se già
attiva, etichetta «Stagione attiva»), **Riporta dati** (disabilitato se
archiviata), **Archivia** (disabilitato se archiviata o attiva). Tutti
disabilitati con `busy`.

Card «Ultimo riporto» (dopo un riporto o una creazione con riporto): «Da X a
Y: N elementi creati, M non creati.» · riquadro tesserati «**carried**
tesserati riportati su proposed proposti[, notConfirmed non riconfermati][,
alreadyPresent gia presenti][, unmappable senza squadra di destinazione].»
(+ «I tesserati non erano fra i tipi scelti.» se `!requested`) · elenco
`entries` «label — created creati / skipped saltati».

### 3. Procedura «Nuova stagione» (Dialog, 4 passi)

- **periodo**: Nome (placeholder «Es. 2027/2028», facoltativo), Inizio
  (`date`), Fine (`date`), checkbox «Rendila subito la stagione attiva» +
  «Senza questa scelta la stagione nasce «futura»…». Avanti: entrambe le
  date, altrimenti toast «Indica la data di inizio e la data di fine»; fine >
  inizio altrimenti «La data di fine deve essere successiva a quella di
  inizio».
- **riporto**: Stagione di origine (`Select` fra tutte, «label — Stato»,
  default `activeSeasonId`), checkbox per ogni `rolloverTypes` (label +
  conteggio dalla sorgente + description; default `defaultSelected`), due
  riquadri «Restano disponibili senza copia» (`globalTypes`… «Sono dati
  globali del club: valgono per tutte le stagioni.») e «Non vengono mai
  riportati» (`neverCopiedTypes`… «Appartengono alla stagione in cui sono
  nati.»). Avanti → se `athlete_memberships` è fra i tipi va a **tesserati**,
  altrimenti a **riepilogo**.
- **tesserati** (`RosterConfirmation`): carica il roster della sorgente,
  **tutti proposti**; «N riconfermati su M · K restano fuori»; pulsanti
  «Tutti»/«Nessuno»; ricerca «Cerca per nome o squadra»; elenco checkbox con
  badge delle categorie («· principale»); vuoto «Nessun tesserato da
  riconfermare» + spiegazione; ricerca vuota «Nessun tesserato corrisponde
  alla ricerca.»; nota «Chi resta fuori non viene cancellato…». Se il roster
  **non si è caricato** (`rosterFallito`): avviso ambra + «Riprova», Avanti
  disabilitato.
- **riepilogo**: «Verra creata la stagione **nome|senza nome** dal … al …, in
  stato **attiva|futura**.», «Dalla stagione X verranno copiati:» + elenco
  tipo/conteggio + «Ogni elemento copiato e un record nuovo…» oppure «Non
  verra copiato nulla: la stagione nasce vuota.»; riquadro Tesserati
  («N riconfermati entrano… K restano fuori» oppure «**Nessun tesserato verra
  riportato.**…»). Pulsante «Crea stagione».
- Esito: `createSeason({label?, startDate, endDate, activate, rollover:
  {sourceSeasonId, types, athleteIds} | null})`; chiusura, `lastSummary`,
  ricarico, se `activate` → `onActiveSeasonChange(active)`; toast «Stagione X
  creata: N elementi riportati, M tesserati» / «Stagione X creata»; errore →
  messaggio o «Errore nella creazione della stagione».

### 3b. «Riporta dati in X» (Dialog)

Descrizione «Gli elementi gia presenti non vengono duplicati: puoi rieseguire
il riporto senza conseguenze.» Sorgente (`Select`, esclusa la destinazione;
cambio → ricarica roster e azzera anteprima), tipi (come sopra), «Chi
rinnova» (`RosterConfirmation`, solo se tesserati), anteprima («Verranno
creati N elementi» + entries «created nuovi / skipped gia presenti» +
«Tesserati: confirmed riconfermati su proposed proposti, notConfirmed restano
fuori.»). Footer: «Calcola anteprima» (`preview: true`; senza sorgente o
tipi → toast «Scegli la stagione di origine e almeno un tipo di dato») e
«Conferma riporto» (disabilitato senza anteprima o con `createdTotal === 0`).
Esito: toast «Riportati N elementi e M tesserati in Y»; errore «Errore
durante il riporto» / «Errore nel calcolo del riporto».

### 9. Conferme

`ConfirmDialog` «Cambiare stagione attiva?» — «Tutta l'applicazione passera a
X. Nessun dato viene spostato: cambia solo il perimetro di cio che vedi.» —
«Attiva stagione». `ConfirmDialog` «Archiviare X?» — «I dati restano
consultabili e non vengono modificati. Una stagione archiviata non puo
ricevere riporti finche non la riattivi.» — «Archivia». Toast: «Stagione
attiva impostata su X» / «Stagione X archiviata»; errori «Errore nel cambio
stagione» / «Errore nell'archiviazione».

### 8. Stati

Loading `ListSkeleton rows={3}`; errore overview → toast «Errore nel
caricamento delle stagioni» (elenco vuoto); roster loading `ListSkeleton
rows={4}`; roster errore → toast «Errore nel caricamento dei tesserati» +
stato `rosterFallito`.

## Firma e timbro (`ClubSignaturePanel`)

`loadClubSignatures(id)` (GET `/api/v1/clubs/:id/signature`),
`uploadClubSignature(id, kind, file, name)` (PUT), `removeClubSignature`
(DELETE). Due slot `CLUB_SIGNATURE_KINDS` (`signature`, `stamp`) con
`CLUB_SIGNATURE_LABELS`; anteprima `<img src={buildClubSignatureUrl(id,
kind, checksum)}>`; testo vuoto `EMPTY_HINT` («Nessuna firma caricata: i
documenti stampati lasceranno lo spazio per firmarli a mano.» / «Nessun
timbro caricato: i documenti stampati usciranno senza timbro della
societa.»); aiuto «PNG, JPEG o WebP, fino a 2 MB. Meglio su sfondo
trasparente o bianco: finisce dentro un documento.»; introduzione «Compaiono
sui documenti che la societa stampa: ricevute, attestati, moduli. Non sono
pubblici — li vede solo chi appartiene al club.»

Permesso: `canManage` = `canManageClubConfigurationAsActor(readStoredActiveClub()?.role)`
subito, poi `state.canManage` dalla rotta. Senza: nessun pulsante + «Solo il
proprietario e il gestore del club possono caricare o rimuovere firma e
timbro.» Azioni: «Carica»/«Sostituisci» (input file nascosto,
`CLUB_SIGNATURE_ACCEPT_ATTRIBUTE`, disabilitato senza `id`; senza id toast
«Salva prima la scheda del club»), «Rimuovi» → conferma inline «Conferma
rimozione» / «Annulla». Toast «<Etichetta>: immagine salvata» / «: immagine
rimossa» / «: <errore>» / «: rimozione non riuscita».

## Profilo fiscale (`FiscalProfilePanel`)

GET `/api/v1/fiscal/profile?organization_id=` → `{profile, missing:
{forInvoicing[], forEInvoicing[]}, vocabularies: {legalForms[{key,label,
description}], taxRegimes[{code,label}], specialRegimes[{key,label}]}}`.
PUT `/api/v1/fiscal/profile` body `{...draft, organization_id}` → toast
«Profilo fiscale aggiornato» + ricarico; errore «Salvataggio non riuscito».
Loading: «Caricamento profilo fiscale…»; errore lettura: toast «Errore nella
lettura del profilo fiscale» e pannello assente.

Avviso «Cosa manca» (se manca qualcosa): «Per emettere una **fattura**: …» o
«Il profilo e sufficiente per emettere fatture.»; «Per preparare la
**fattura elettronica**: …»; «Un profilo incompleto non blocca le ricevute:
quelle si emettono con i dati che ci sono.»

Campi: card «Natura del soggetto» — Forma giuridica (`Select`
`legalForms`, default `altro`, descrizione sotto), Regime fiscale (`Select`
`taxRegimes`, placeholder «Non dichiarato», nota «Non viene proposto: un
regime fiscale scelto da un software e un regime fiscale che nessuno ha
letto.»), Regimi speciali dichiarati (pulsanti a scelta multipla
`specialRegimes`). Card «Dati fiscali» — `TEXT_FIELDS`: Ragione sociale,
Codice fiscale, Partita IVA («Undici cifre»), Indirizzo della sede fiscale,
Comune, CAP, Provincia («Due lettere»), PEC, Codice destinatario («Sette
caratteri»). Card «Registro Imprese» (badge «solo se iscritti») — Ufficio
REA, Numero REA. Card «Imposta di bollo» — switch «Applica il bollo sopra la
soglia» (+ spiegazione), Soglia (centesimi, default 7745), Importo
(centesimi, default 200). Pulsante «Salva profilo fiscale» + nota «I
documenti gia emessi non cambiano: portano con se i dati del giorno in cui
sono stati emessi.» Nessun permesso client: il server decide.

## Causali (`OperationTypesPanel`)

GET `/api/v1/fiscal/operation-types?organization_id=` → `{operationTypes[],
permissions: {canManage}, vocabularies: {documentRoutes, activityScopes,
directionHints}}`. PUT stesso endpoint (body: `organization_id, code, label,
documentRoute, activityScope, directionHint, reportingBucket,
defaultDescription, deductible, isMembershipFee, vatRate, vatNature,
isActive, notes`) → toast «Causale «X» aggiornata»; creazione PUT `{code,
label, directionHint}` con `code` derivato dall'etichetta (slug ≤60, se vuoto
toast «Il nome della causale deve contenere delle lettere») → «Causale «X»
creata: ora va classificata» e apre la scheda. DELETE
`?code=&action=delete&organization_id=` → toast success/info con
`data.message`; errore «Operazione non riuscita».

Vista: intro «La causale dice **cosa** e un movimento…»; avviso «N causali su
M non sono classificate» (+ spiegazione) quando `!dichiarata` (=
`activityScope === "unspecified" && deductible === null && isMembershipFee
=== null`); avviso «Sola lettura» se `!canManage`; toggle «Mostra anche le
disattivate»/«Nascondi le disattivate» + «N causali in elenco». Ogni causale
è una scheda chiudibile: nome, codice, badge Entrata/Uscita
(`directionHint`), «Classificata»/«Da classificare», «Predefinita»
(`isSystem`), «Disattivata» (`!isActive`). Aperta: Nome, Verso suggerito
(`Select`: «Entrambi i versi» + `directionHints`; nota «E una proposta: il
verso lo decide il movimento.»), Documento da emettere (`documentRoutes`),
Ambito di attivita (`activityScopes`), Detraibile (730) (tri-stato «Non
dichiarato/Si/No»), Quota associativa (tri-stato; «Distingue la quota
associativa da quella sportiva.»), Voce di rendiconto (placeholder «Es.
Quote atleti»; «Il nome lo decidete voi…»), Descrizione predefinita; «Classificazione
dichiarata il gg/mm/aaaa.» o «Nessuna classificazione dichiarata…».
Azioni (solo `canManage`): «Salva», «Disattiva»/«Riattiva» (PUT con
`isActive` invertito), «Elimina» (solo `!isSystem`, **senza conferma**).
Blocco «Aggiungi una causale» (solo `canManage`): Nome (placeholder «Es.
Affitto della palestra»), Verso (`directionHints`, default `IN`),
«Aggiungi» (disabilitato senza nome) + «Nasce senza classificazione…».
Loading «Caricamento delle causali…»; errore lettura toast «Errore nella
lettura delle causali».

## Pagamenti e fatturazione (pannelli condivisi)

Vivono in `src/components/payments/` (fuori dal perimetro di questa
migrazione, usati solo da questa pagina ma non assegnati): si **riusano**.
- `CapabilityGate feature="online_payments"` (`src/components/club/capability-gate.tsx`,
  usato **solo** qui): `useClubCapabilities` legge una volta
  `/api/v1/entitlements?organization_id=` (cache per club); mentre carica
  il contenuto resta visibile; negato → riquadro `verdict.label|«Funzione non
  disponibile»` + `verdict.message|«Questa funzione non e attiva per la tua
  societa.»` (`fallback="explain"`) o nulla (`"hide"`).
- `ClubPaymentSettings`: switch «Accetta pagamenti online» (`enabled`,
  badge Attivi/Sospesi), «Valuta EUR», `ClubPaymentAccountPanel` (stato
  conto Stripe, requisiti, commissione, «Collega il conto con…» / «Completa la
  configurazione su…» / «Gestisci account…» / «Aggiorna»), avviso «Dati
  carta non salvati», tabella `PaymentMethodEnablementTable` (metodi
  disponibili in Gestione Iscrizioni) + contatore «Metodi online pronti per
  le iscrizioni». Le modifiche passano da `setPaymentSettings` → autosave
  sezione `pagamenti`.
- `ClubBillingSettings readOnly`: `ClubSubscriptionPanel` (Piano, Stato,
  Ciclo, Rinnovo, servizi inclusi, «Gestisci abbonamento» disabilitato) +
  `HubExtraServicesPanel` (servizi extra con stato e prezzo).

## Permessi

- Rotta in `MANAGEMENT_ADMIN_ONLY_PATH_PREFIXES` (`/organization`): solo
  `owner` e `club_manager` (`AccessAreaGuard`).
- Firma: `canManageClubConfigurationAsActor(role)` client + `canManage` dalla
  rotta (scrive solo la direzione; legge il club).
- Causali: `permissions.canManage` **dalla rotta** (mai dedotto dal ruolo).
- Pagamenti online: entitlement `online_payments` (`CapabilityGate`).
- Piano e servizi extra: sola lettura per tutti (D37).
- Nessun altro predicato client sulla pagina.

## Stati, flussi distruttivi, navigazione

### 8. Stati di pagina

- Prima del mount: `null`. Senza club: modulo vuoto (nessun avviso).
- Errore di lettura del club: `console.error`, modulo vuoto.
- Salvataggio: `SaveStatus` (`Salvataggio...`, `Salvato · hh:mm`, errore
  con messaggio; a riposo niente).

### 9. Flussi distruttivi

- Elimina federazione: nessuna conferma (autosave).
- Rimuovi firma/timbro: conferma inline a due pulsanti.
- Elimina causale (non di sistema): nessuna conferma; il server può
  rispondere con «disattivata invece che eliminata» (`deleted: false`).
- Archivia stagione: `ConfirmDialog` (vedi §4).

## Test collegati

- `tests/lib/club-profile-autosave.test.mjs` — legge `page.tsx`: `for (const
  section of AUTOSAVE_SECTIONS)`, niente `isAutosaveClubSection(activeTab)`,
  niente «Salva Modifiche»/`window.location.reload`/`updateClub`, `blockingRef`
  e il ramo `if (blockingRef.current) { setSaveError… setSaveState("error")`,
  **un solo** `<SaveStatus`, nessun «Salva modifiche|Salva sezione|Salva
  tutto» né badge «si salvano da sole».
- `tests/lib/club-onboarding-season.test.mjs` — `page.tsx` contiene
  `rememberActiveSeason(season.id, season.label, clubId)` e non
  `syncActiveSeasonLocally`.
- `tests/server/entitlements-ownership.test.mjs` — `<ClubBillingSettings …
  readOnly`, nessun `onSubscriptionChange=|onExtraServicesChange=`, nessun
  `subscription: normalized|extraServices: normalized`.
- `tests/ui/anagrafiche-coverage.test.mjs` — `<PhoneField` in `page.tsx`;
  nessun `<Input … value={…phone}`; `<AssistedFiscalCodeField`,
  `enableCompute={false}`, `<CapitalizedInput`.
- `tests/ui/responsive-invariants.test.mjs` — `page.tsx`, `season-manager.tsx`,
  `club-signature-panel.tsx` fra i file toccati (niente `grid-cols-2|3`
  senza breakpoint); il guscio `flex min-w-0 flex-1 flex-col overflow-hidden`.
- `tests/ui/seasons-tab.test.mjs` — `<SeasonManager` importato da
  `@/components/organization/season-manager`; nessuna logica di stagione in
  `page.tsx`; il manager usa `@/lib/api/seasons`, nessun `fetch(`, nessun
  `@/lib/server/`, nessun `simplified-db`, nessun font, `eg-tabular`,
  `ConfirmDialog`, «Cambiare stagione attiva?», «Archiviare », niente
  `createCoalescingSaver`, «riepilogo», «verranno copiati», «Restano
  disponibili senza copia», «Non vengono mai riportati», `preview: true`,
  `flex-col…lg:flex-row`, `grid-cols-1…md:grid-cols-2`, nessun `w-[###px]`.
- `tests/ui/club-signature-contract.test.mjs` — `club-signature-panel.tsx`
  senza `fetch("/api` e con `@/lib/api/club-signature`.
- `tests/ui/stripe-branding.test.mjs` — `ClubPaymentSettings.tsx` e
  `ClubPaymentAccountPanel.tsx` (pannelli condivisi, non toccati).

## Inventario componenti

Pagina: `Sidebar, Header, DashboardPageContainer, dashboardMainClassName,
SharedPageHeader, Card*, Button, Input, Label, Tabs*, Select*, Table*,
Badge, LogoUpload, SaveStatus, CapitalizedInput, PhoneField,
AssistedAddressFields, AssistedFiscalCodeField, SeasonManager,
ClubSignaturePanel, ClubBillingSettings, FiscalProfilePanel,
OperationTypesPanel, CapabilityGate, ClubPaymentSettings`; lib:
`rememberActiveSeason, createCoalescingSaver, club-profile (5 export),
readSubscriptionSettingsSource, todayLocalDateOnly, payment-config-utils
(3), simplified-db.getClub`; icone lucide (13, molte inutilizzate).

Specifici della rotta (da sostituire): `season-manager.tsx`,
`club-signature-panel.tsx`, `FiscalProfilePanel.tsx`,
`OperationTypesPanel.tsx`, `capability-gate.tsx` (solo qui),
`payment-methods-config.tsx` (**orfano**: nessun import in `src/` né in
`tests/`).

Condivisi (si riusano): `LogoUpload` (account, sponsor), `CapitalizedInput`,
`PhoneField`, `AssistedAddressFields`, `AssistedFiscalCodeField`,
`SaveStatus` (form-builder), `ClubPaymentSettings`, `ClubBillingSettings` e
i pannelli di `src/components/payments/`.

## Cosa non esiste in V1

- Nessun pulsante «Salva» di pagina (autosave), nessun export, nessuna
  ricerca, nessun filtro sulle federazioni, nessuna conferma sulla
  cancellazione di federazione e causale, nessun permesso client sulla
  scheda (solo il guard di rotta).
- `payment-methods-config.tsx` non è raggiungibile da nessuna schermata.
- `?tab=` non viene riscritto quando si cambia scheda.
