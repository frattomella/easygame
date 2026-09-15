# Parita funzionale Web V1 → Web V2 — revisione QA indipendente

Data: 2026-09-15 · Branch: `feat/web-redesign` (HEAD `4f1b3c9`; revisione iniziata su `bafdcb4`) · Baseline V1: `768ef05` (staging Fortitudo).

Metodo: per ogni rotta ho estratto dalla V1 (`git show 768ef05:<file>`) l'inventario concreto — etichette e pulsanti, campi dei moduli, chiamate API (`apiRequest`, `supabase.from`, `/api/v1/…`, funzioni di `simplified-db`), predicati di permesso (`can…`, chiavi `"<dominio>.<azione>"`), query param (`searchParams.get`), toast, testi di conferma — e ho cercato ognuno nella V2 (`grep -rn … src/`). Una stringa presente nella V1 e assente nella V2 e giustificata come codice morto, rietichettatura canonica (`src/lib/web/status.ts`) o regressione. Il giudizio si basa sul sorgente, non su una prova a schermo.

Legenda: ✅ presente · ⚠️ equivalente (forma diversa, stessa capacita) · ❌ mancante.

## 1. Tabella riassuntiva

| # | Rotta | Stato | Note |
| --- | --- | --- | --- |
| 1 | `/dashboard` (+ `/dashboard/[dashboardId]`) | **VERIFICATA** | metriche rietichettate; «Certificati scaduti» come delta |
| 2 | `/athletes`, `/athletes/new` | **VERIFICATA** | preferenza colonne su chiave nuova (R4) |
| 3 | `/athletes/[id]` | **VERIFICATA** | 8 tab → 4 aree con alias `?tab=`; 46/46 gestori, 58/58 toast |
| 4 | `/trainers*` | **VERIFICATA** | tab Presenze e messaggi rimossi: erano senza dati |
| 5 | `/staff*` | **VERIFICATA** | `/staff/[id]/edit` ora modulo intero |
| 6 | `/training` | **CON GAP** | 6 `window.confirm` nel programma settimanale condiviso (R1) |
| 7 | `/categories` | **CON GAP** | «Vedi atleti» → elenco non filtrato, pre-esistente (R2) |
| 8 | `/medical` | **VERIFICATA** | in piu: promemoria in blocco, CSV |
| 9 | `/movements` (+ `/payments`) | **VERIFICATA** | 8 predicati di permesso identici |
| 10 | `/reports` | **VERIFICATA** | — |
| 11 | `/procura` | **VERIFICATA** | — |
| 12 | Guscio | **VERIFICATA** | orfano `notifications-dropdown.tsx` (R3) |

Nessuna rotta in **REGRESSIONE**: nessuna capacita V1 (dato, azione, campo, permesso, deep link) manca nella V2. I due «CON GAP» sono una contraddizione del contratto (R1) e un flusso peggiorato ma gia difettoso nella V1 (R2).

## 2. Checklist per rotta

### 2.1 `/dashboard` (e `/dashboard/[dashboardId]`)

V1: `src/app/dashboard/page.tsx`, `src/app/dashboard/[dashboardId]/page.tsx`, `src/components/dashboard/{MetricsOverview,CertificationAlerts,UpcomingTrainings,RecentActivity,onboarding-resume-card}.tsx` · V2: `src/components/dashboard/v2/**` (`ClubDashboard`, `DashboardKpiBar`, `CertificateAlertCards`, `TodayTrainingsPanel`, `DayRail`, `today-trainings.ts`).

| Area | Esito | Evidenza |
| --- | --- | --- |
| Dati: una lettura `loadClubDashboardOverview` → metriche, avvisi certificati, gare/appuntamenti/note | ✅ | `ClubDashboard.tsx:115-135`, stesse `buildDashboardMetrics`/`buildCertificateAlerts`/`select…` |
| Dati: allenamenti di oggi + presenze salvate (`supabase.from("training_attendance")`) | ✅ | `today-trainings.ts:252-253` (lettura a richiesta, come V1) |
| Metriche: Atleti Totali · Categorie Attive · Certificati in Scadenza · Certificati Scaduti | ⚠️ | `DashboardKpiBar.tsx:29-70`: «Atleti attivi» (il conteggio V1 era gia filtrato su `status === "active"`, `club-overview.ts:283` — etichetta piu onesta), «Categorie attive», «Allenamenti» (nuova card, il dato esisteva in `metrics.upcomingTrainings`), «Certificati in scadenza» con delta «N scaduti» invece di una quarta card |
| Azione: «Invia Promemoria» → `POST /api/medical-certificate-reminders` con `athleteId`, `certificateId`, `organizationId` | ✅ | `CertificateAlertCards.tsx:61-86`, stessi esiti (inviato / gia presente / nessun nuovo) via `showToast` |
| Navigazione: avviso → `/athletes/[id]?clubId=…#sanitari` | ✅ | `CertificateAlertCards.tsx:53-55` (aggiunge `&tab=sanitari`, coerente con la scheda V2) |
| Navigazione: «Vedi tutti» → `/medical`; card metriche → `/athletes` `/categories` `/medical` | ✅ | `CertificateAlertCards.tsx:151`, `DashboardKpiBar.tsx:34-70` (+ `/training`) |
| Navigazione: presenze → `/training?focus=attendance&trainingId=&date=&clubId=` | ✅ | `today-trainings.ts:274-281` (`formatLocalDateOnly` corregge il giorno civile) |
| Navigazione: Gare → `/matches`, Appuntamenti/Promemoria → `/secretariat` | ✅ | `DayRail.tsx:100,139,163` |
| Stati: vuoti («Nessun allenamento programmato per oggi», «Nessun avviso sui certificati», «Nessuna gara…», «Nessun appuntamento…», «Nessun promemoria attivo», «Nessun dato di presenza disponibile»), loading a scheletro, errore con «Riprova» | ✅ | `TodayTrainingsPanel.tsx:119,177`, `ClubDashboard.tsx:206-229`, `DayRail.tsx:101,140,164`; lo stato d'errore con retry e nuovo |
| `MatchCertificateWarningBadge` sulle gare | ✅ | `DayRail.tsx:10,116` |
| `OnboardingResumeCard` («Riprendi la configurazione iniziale» / «Salta per ora», `GET /api/v1/clubs`, `canResumeOnboarding`) | ✅ | `ClubDashboard.tsx:200`, `onboarding-resume-card.tsx` (invariato nella logica) |
| Query param `?clubId=` / `?organizationId=` + sync `localStorage.activeClub` + evento `club-updated` | ✅ | `ClubDashboard.tsx:59-84` |
| Rotta legacy `/dashboard/[dashboardId]` (raggiunta dal completamento invito) | ⚠️ | `src/app/dashboard/[dashboardId]/page.tsx` disegna la stessa `ClubDashboard`; le tre card «di Oggi» V1 sono sostituite dalle stesse liste «prossime» dell'indice; `RecentActivity` era montato con `activities={[]}` (sempre vuoto: codice morto) |
| Componenti V1 rimossi: `SetupGuide`, `AccessCodeGenerator`, `NewDashboard`, `RecentActivity` | ✅ | nessun import in `768ef05` (i primi tre) o dati sempre vuoti (l'ultimo); nessun import residuo in V2 |
| Permessi | ✅ | la V1 non aveva predicati sulla dashboard; la V2 non ne inventa |

Esito: **VERIFICATA**.

### 2.2 `/athletes` e `/athletes/new`

V1: `src/app/athletes/page.tsx` (3.205 righe), `src/app/athletes/new/page.tsx`, `src/components/forms/{AthleteCreateForm,AthleteImportDialog}.tsx` · V2: stessi percorsi + `src/components/athletes/v2/{athlete-grid-model.ts,athletes-grid-columns.tsx,athletes-context-controls.tsx,bulk-category-drawer.tsx}`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| Dati: `getClubAthletesPage` / `addClubAthlete` / `addClubAthletesBatch` / `updateClubAthlete` / `deleteClubAthlete` da `simplified-db`; `supabase.from("categories").upsert` per la categoria automatica | ✅ | `src/app/athletes/page.tsx:57-63,889`; stesse funzioni della V1 |
| Colonne: Atleta · Categoria · Anno di Nascita · Stato · Certificato Medico · Iscrizione · Numero Maglia | ✅ | `athletes-grid-columns.tsx:63-195` (sentence case, ordine ed etichette CSV della V1 conservate); «Età» era nascosta e non selezionabile nella V1 (`768ef05:…/athletes/page.tsx:2995` `className="hidden"`, `age: false` forzato a `:538`) |
| «Personalizza Colonne» + preferenza per club in `localStorage.athleteColumns_<clubId>` | ⚠️ | il pannello colonne e quello del `DataGrid` (`DataGrid.tsx:559-660`), persistito da `useGridState` con chiavi `egw.<modulo>.*`; la vecchia chiave non viene migrata (preferenze da reimpostare una volta) |
| Filtri: ricerca «Cerca per nome o cognome», stato (Attivi / Sospesi / In prestito / Inattivi / Tutti), Sede, Gruppo | ✅ | `athlete-grid-model.ts:85-134` (viste + filtro Stato, Categoria, Certificato medico, Iscrizione completata: piu della V1), `athletes-context-controls.tsx:37-95` (Sede/Gruppo con le stesse regole `isMultiSiteClub` / ≥2 gruppi), banda «Archivio grande» con `SegmentedControl` stato server-side (`page.tsx:1936-1960`) |
| Raggruppamento per categoria con intestazione e link «report categorie» | ✅ | `page.tsx:1795-1814` (`GroupDef`, `/reports?report=categories&categoryId=`) |
| Azioni primarie: «Nuovo atleta», «Importa atleti», export PDF/CSV, «Report categorie» | ✅ | `page.tsx:2063-2117`; export dal `DataGrid` (`export.kinds`) con scope selezione/filtrato (`page.tsx:1286-1354`), toast «PDF pronto…», «CSV scaricato», «Consenti i popup…», «Nessun atleta da esportare» |
| Azioni di riga: apri scheda · Sospendi · Disattiva · Attiva (condizionate allo stato) · Elimina | ✅ | `page.tsx:1849-1885` |
| Azioni di massa: Attiva · Sospendi · Disattiva · Cambia categoria (con Sede «Lascia la sede attuale») · Elimina; scope «selezionati» / «tutti gli atleti registrati» | ✅ | `page.tsx:1888-1930`, `bulk-category-drawer.tsx:104-141`; `loan` esisteva solo come etichetta (`getBulkActionLabel`) e non come azione anche nella V1 |
| Distruttive: «Eliminare questo atleta?» e «Conferma operazione in blocco» con il testo lungo sugli atleti con file/consensi che non si eliminano | ✅ | `DangerConfirmDialog`/`ConfirmDialog` (`page.tsx:97`), testo `page.tsx:1484-1500`; la V1 (W6-07) usava gia il dialogo applicativo, non `confirm()` |
| Toast: «Errore nel caricamento dei dati», «Club non trovato», «Atleta … eliminato con successo», «Nessun atleta da aggiornare», «Nessun atleta disponibile per questa operazione», «Eliminazione atleti in corso…» | ✅ | `page.tsx:600,1026,1085,1463,1515,1522` |
| Stati: vuoto («Nessun atleta presente»), caricamento, errore | ✅ | `page.tsx:2092-2117` (vuoto con «Nuovo atleta»/«Importa atleti»), scheletro del `DataGrid` |
| Deep link `?action=new`, `?clubId=`/`?organizationId=`/`?organization_id=` | ✅ | `page.tsx:493-495,778-786` |
| `/athletes/new`: `?clubId=`, ritorno all'elenco, redirect alla scheda salvata | ✅ | `src/app/athletes/new/page.tsx:56,119,195`; «Nuovo Atleta» → «Nuovo atleta» (sentence case) |
| `AthleteCreateForm`: tutti i campi V1 (anagrafica, residenza, contatti, telefono/telefono di emergenza, dati sanitari, allergie, gruppo sanguigno, taglie, note, tesseramento con stato/numero/ente/date, categoria automatica, altre categorie, genitori e tutori con ruoli Madre/Padre/Nonno/Nonna/Tutore Legale/Altro) | ✅ | tutte le 29 etichette V1 trovate in `src/components/forms/AthleteCreateForm.tsx` (grep per etichetta); validazione «Nome, cognome e data di nascita sono obbligatori» `:360`; errore «Errore durante la creazione dell'atleta» `:451` |
| `AthleteCreateForm`: guardia sulle modifiche non salvate | ✅ | nuova: `DirtyGuardDialog` `:23,1007`, indicatore «Modifiche non salvate» `:981` |
| `AthleteImportDialog`: caricamento file, mappatura colonne («Non assegnata»), anteprima («Pronta»), toast «Nessuna riga importabile…», «Chiudi» | ✅ | ora `Drawer` (`AthleteImportDialog.tsx:24,359-472,630`); tutte le stringhe V1 presenti |
| Permessi | ✅ | la V1 non aveva predicati `can…` sull'elenco; la V2 nemmeno |

Esito: **VERIFICATA** (una sola nota: la preferenza colonne cambia chiave di storage).

### 2.3 `/athletes/[id]` — scheda atleta

V1: `src/app/athletes/[id]/page.tsx` (7.364 righe, campionata via grep) + `src/components/athletes/profile/{athlete-profile-header,athlete-profile-tabs}.tsx` · V2: `src/app/athletes/[id]/page.tsx` (4.663 righe) + `src/components/athletes/profile/v2/**` (13 file) + `src/lib/athlete-profile-tabs.ts` (aree + sezioni + mappa dei vecchi tab).

| Area | Esito | Evidenza |
| --- | --- | --- |
| Dati/API: `/api/athletes`, `/api/athlete-payments`, `/api/v1/simplified_payments`, `/api/v1/medical_certificates/<id>`, `/api/v1/guardian-accounts/<id>`, `/api/v1/access_tokens`, `/api/attachments`, `/api/v1/athlete-accounts/<id>[/link|/resend|/email]`, `supabase` | ✅ | stessi endpoint in `src/app/athletes/[id]/page.tsx` e nei componenti condivisi (`athlete-account-section.tsx`); nessun `fetch` diretto aggiunto |
| Gestori: 46 `handle…/open…/save…/delete…/upload…/share…/reject…` della V1 | ✅ | tutti e 46 presenti nella V2 (`comm -23` fra le due liste: vuoto); 48 in V2 |
| Toast: 58 stringhe V1 | ✅ | 55 identiche; 3 rietichettate «parent» → «famiglia» («Documento richiesto alla famiglia», «Documento condiviso con la famiglia» `page.tsx:2349,2394`) e «è obbligatorio» con accento (`:2415`) |
| Tab V1 (Generale · Contatti · Dati Sanitari · Iscrizione · Abbigliamento · Documenti · Analitiche · Lavoro e compensi) → 4 aree V2 (Profilo · Attività sportiva · Amministrazione · Documenti e sanità) | ⚠️ | `src/lib/athlete-profile-tabs.ts:57-126`: `ATHLETE_PROFILE_TABS` conservati come alias; ogni vecchio `?tab=` mappa su area + sezione (`:113-126`), quindi i deep link `?tab=sanitari`, `?tab=pagamenti`, `?tab=documenti`… restano validi; `?clubId=` letto a `page.tsx:230` |
| Intestazione: foto profilo (`AvatarUpload` → «Aggiungi/Cambia foto profilo», rimozione), categoria, stato, azioni | ✅ | `AthleteRecordHeader.tsx:137-177`, `handleAvatarChange` `page.tsx:1217` |
| Anagrafica, contatti, residenza, famiglia (`PersonIdentityFields`, `AssistedAddressFields`, `PhoneField`, `DocumentExtractionField`, `CapitalizedInput`) | ✅ | tutti in `AthleteProfileDrawers.tsx` (modifica in cassetto) |
| Categorie (`AthleteCategoriesPanel`), numeri di maglia (`canAssignNumber`, «Numero (max 3 cifre)»), assegnazioni kit con Origine | ⚠️ | `AthleteProfileDrawers.tsx`, `page.tsx:89-100,309-312`; la tabella kit V1 (Data · Kit/Articoli · Dettagli · Origine · Stato · Azioni) e una lista con meta «Da assegnazione kit / Manuale» (`AthleteActivitySections.tsx:251-264`); il limite a 3 cifre resta imposto dal codice (`page.tsx:3317` `digitsOnly.slice(0, 3)`) ma non e piu scritto in etichetta |
| Iscrizione: piano, conferma piano con servizi obbligatori/opzionali, anteprima rate (Rata · Descrizione · Importo · Scadenza · Stato iniziale), creazione pagamenti, modifica/aggiunta pagamento (Quota/Iscrizione/Abbigliamento/Trasferta/Altro), `EnrollmentPaymentBreakdown`, `AthleteEnrollmentTab` | ✅ | `AthleteAdministrationParts.tsx:186-371` (`AthletePlanConfirmationDrawer`: sezioni Periodo · Servizi (Obbligatori/Opzionali) · Totali · Anteprima pagamenti; `CreatePaymentsConfirmDialog` «Creare i pagamenti?»), `athlete-payment-dialogs.tsx:79-247` |
| Tesseramenti (`AthleteRegistrationsPanel` con `canManage`, `AthleteRegistrationDialog`: Federazione/Ente · Numero tessera · Data emissione · Data scadenza · Stato · Note · allegato) | ✅ | `athlete-registrations-panel.tsx` (`canManage` conservato), `athlete-registration-dialog.tsx:101-144` |
| Lavoro e compensi (`PersonCompensationTab`) | ✅ | importato e montato nell'area Amministrazione |
| Sanità: certificati (`AthleteCertificatesPanel`, `AddCertificateForm`, `CertificateAttachmentField`, elimina via `/api/v1/medical_certificates/<id>`), visite mediche («Nuova visita», allegato visita), anagrafica sanitaria (gruppo sanguigno, allergie, malattie croniche) | ✅ | `AthleteHealthSections.tsx`, `athlete-certificates-panel.tsx` |
| Documenti: identità (tipo, numero, rilascio, scadenza, permesso di soggiorno), allegati identità, altri documenti (Nome documento · Tipo documento · File), condivisi con la famiglia (richiedi / condividi / approva / rifiuta con motivo), «Compila modulo» (`CompileFormDialog`) | ✅ | `AthleteDocumentDrawers.tsx`, `AthleteDocumentSections.tsx`; rifiuto con motivo in `Field label="Motivo del rifiuto"` (`page.tsx:6008`) — la V1 usava `window.prompt` (`768ef05:…:7348` commento) |
| Accesso EasyGame dell'atleta (`athlete-account-section.tsx`: collega, reinvia, cambia email, scollega) | ✅ | stessi 4 endpoint; solo l'aspetto e cambiato |
| Dati personali (`athlete-data-subject-section.tsx`: export, cancellazione con inventario Cancellate/Anonimizzate/Conservate, «Minorenne») | ✅ | `Modal` con «Cancella definitivamente» / «Annulla» (`:495-545`), inventario conservato |
| Distruttive: elimina certificato, elimina documento, elimina pagamento, cancellazione dati | ✅ | `AlertDialog` V1 → `DangerConfirmDialog`/`Modal` V2; nessun `window.confirm` residuo (i 3 `confirm(` V1 erano commenti) |
| Permessi | ✅ | la pagina V1 non aveva predicati propri (solo `useAuth().activeClub`); `canManage` dei tesseramenti conservato |
| Componenti V1 rimossi: `athlete-profile-header.tsx`, `athlete-profile-tabs.tsx` | ✅ | nessun import residuo (`grep -rn` vuoto) |

Esito: **VERIFICATA** (raccomandata una prova a schermo delle quattro aree a 375 px, vista la mole).

### 2.4 `/trainers`, `/trainers/new`, `/trainers/[id]` (+ `/trainers/[id]/edit`)

V1: `src/app/trainers/page.tsx` (988), `src/app/trainers/[id]/page.tsx` (3.040), `src/app/trainers/new/page.tsx` (545), `src/components/trainer/trainer-documents-panel.tsx`, `src/components/forms/AddTrainerPaymentForm.tsx` · V2: stessi percorsi (1.068 / 1.197 / 462) + `src/components/trainer/v2/{trainer-record-model.ts,trainer-section-drawer,trainer-access-panel,trainer-payments-panel}.tsx`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| Dati: `simplified-db` (`getClubStaff…`, `deleteStaffMember`, `updateTrainer…`), `supabase`, `/api/v1/organization_users`, `/api/v1/users/<id>`, `/api/v1/trainer-accounts/<id>`, `/api/v1/access_tokens[/<id>]`, `person-export`, `trainer-documents`, `medical-visits` | ✅ | stessi import e stessi endpoint in `src/app/trainers/[id]/page.tsx`, `trainer-access-panel.tsx`; `AddTrainerPaymentForm` inglobato in `trainer-payments-panel.tsx` («Aggiungi pagamento stipendio», Data pagamento, Mese di riferimento, Importo, Stato pagamento) |
| Elenco: ricerca «Cerca allenatori…», stato Attivi/Sospesi/Tutti, «Personalizza Colonne»/«Colonne Visibili», Sede, export PDF/CSV con scope, «Nuovo Allenatore» | ✅ | `src/app/trainers/page.tsx:517-530` (export), `:652-724` (viste, filtri Stato/Categoria/Sede/Accesso EasyGame), `:876` «Nuovo allenatore», `DataGrid` `:883` |
| Elenco: azioni di massa Attiva · Sospendi · Assegna a gruppo/categoria; azione di riga Elimina | ✅ | `page.tsx:794-836` (+ Esporta PDF/CSV in blocco), riga `:744-790` (Apri scheda · Modifica · Sospendi · Attiva · Scollega accesso · Elimina) |
| Elenco: `confirm("Sei sicuro di voler eliminare questo allenatore?")` | ✅ | sostituito da `DangerConfirmDialog` (`page.tsx:39-40`); il `confirm(` V1 (`768ef05:…/trainers/page.tsx:211`) sparisce |
| Scheda: 7 tab V1 (Anagrafica · Pagamenti · Accesso Account · Dati Societari · Dati Medici · Presenze · Lavoro e compensi) → 4 aree (Profilo · Club e accesso · Documenti e sanità · Lavoro e compensi) con mappa dei vecchi `?tab=` | ⚠️ | `trainer-record-model.ts:197-214`; **«Presenze» rimossa**: `trainingSessions` era uno `useState([])` mai alimentato (`768ef05:…/trainers/[id]/page.tsx:546-571`), quindi Presente/Assente/Nessuna Risposta/Tasso di Presenza mostravano sempre 0 — codice morto, non regressione |
| Scheda: «messaggi» all'allenatore («Inserisci un messaggio», «Messaggio inviato») | ⚠️ | rimosso: nella V1 era solo stato locale (`setMessages([...messages, message])` `:1022`), nessuna scrittura o lettura dal server — finto, non una capacita |
| Scheda: anagrafica (`PersonIdentityFields`, contatti e residenza, formazione scolastica, taglie), categorie assegnate, tesseramento (data, numero), documento d'identità (tipo, numero, rilascio, scadenza, permesso di soggiorno), tessera sanitaria, primo soccorso, anagrafica sanitaria (allergie, patologie), visite mediche, documenti (`canWrite` ×6, Visualizza/Scarica/Sostituisci/Elimina), registro pagamenti («Cerca pagamento…»), stipendio mensile, lavoro e compensi (`PersonCompensationTab`) | ✅ | tutte le etichette V1 trovate in sentence case in `src/app/trainers/[id]/page.tsx`, `trainer-section-drawer.tsx`, `trainer-documents-panel.tsx` (che ora usa `DangerConfirmDialog` `:10,450` al posto di `window.confirm`) |
| Scheda: accesso EasyGame («Genera token», «Genera prima un token di accesso», scollega con «Scollegare questo account?», stati Collegato/Invitato/Senza accesso/Token usato/scaduto/attivo) | ✅ | `trainer-access-panel.tsx:157-170` (`ConfirmDialog`), `trainer-record-model.ts:70-159` |
| Scheda: PIN sui pagamenti | ✅ | gia rimosso nella V1 (`768ef05:…:1147-1158`, `showPaymentsTab=true`); `canAccessPath` decide l'ingresso nell'area, invariato |
| Scheda: elimina allenatore («Allenatore eliminato con successo», ritorno a `/trainers`), «Eliminare il compenso?» | ✅ | `page.tsx:636-637,1170-1180` (`ConfirmDialog` + `DangerConfirmDialog`), `trainer-payments-panel.tsx:10` |
| `/trainers/new`: nome/cognome obbligatori, email o telefono, categorie allenate, compenso mensile, data inizio, note professionali, taglie, `?clubId=` | ✅ | `src/app/trainers/new/page.tsx:179-180` (`ValidationSummary` «Nome», «Cognome» al posto del toast «Nome e cognome sono obbligatori»), `:297`, stessi campi |
| `/trainers/[id]/edit` → redirect alla scheda con `?clubId` | ✅ | invariato |
| Deep link `?clubId=` su elenco/scheda/nuovo; `?tab=` legacy | ✅ | `page.tsx:106-107`, `trainer-record-model.ts:205-214` |
| Permessi | ✅ | `canWrite` (documenti) conservato; nessun altro predicato nella V1 |

Esito: **VERIFICATA** (due rimozioni dichiarate: tab Presenze e messaggi, entrambe senza dati nella V1).

### 2.5 `/staff`, `/staff/new`, `/staff/[id]`, `/staff/[id]/edit`

V1: `src/app/staff/page.tsx` (953), `src/app/staff/[id]/page.tsx` (1.062), `src/app/staff/new/page.tsx` (650), `src/app/staff/[id]/edit/page.tsx` (redirect), `src/components/staff/{StaffTable,DepartmentManagement}.tsx` · V2: stessi percorsi (638 / 469 / 145 / 206) + `src/components/staff/v2/**` (9 file).

| Area | Esito | Evidenza |
| --- | --- | --- |
| Dati: `supabase` (staff su `clubs`), `simplified-db` (`deleteStaffMember`, `updateClubDataItem`), `/api/staff-departments` (`resolveStaffDepartments`, `ensureStaffDepartment`), `person-export` | ✅ | `src/app/staff/[id]/edit/page.tsx:17-20`, `src/app/staff/page.tsx:21`, `departments-drawer.tsx` |
| Elenco: vista tabella + vista card, «Personalizza Colonne», filtro reparto («Filtra reparto», «Tutti i reparti»), stato, ricerca | ⚠️ | una sola `DataGrid` (`page.tsx:50-51` commento: le informazioni della card sono colonne); filtri Reparto/Stato/Ruolo/Accesso EasyGame `:441-477`, viste Attivi/Non attivi/Senza reparto `:66-68` |
| Elenco: azioni di riga (Apri · Modifica · Elimina), di massa (Attiva · Disattiva · Sposta in un reparto · Esporta PDF/CSV) | ✅ | `page.tsx:493-507`; `move-department-drawer.tsx` |
| Elenco: `confirm("Sei sicuro di voler eliminare questo membro dello staff?")` | ✅ | `DeleteStaffDialog` (`delete-staff-dialog.tsx`, «Eliminare <nome>?»); nessun `confirm(` residuo |
| Reparti: «Gestione Reparti» (nome, descrizione, colore, elimina) con toast «Inserisci un nome per il reparto», «Il reparto … esiste già», «Reparto … creato con successo» | ✅ | `departments-drawer.tsx:77-97,148,253-259` («Gestisci reparti», `DangerConfirmDialog` per l'eliminazione) |
| Scheda: sezioni Informazioni personali · Contatti e residenza · Documento di identità (tipo, numero, rilascio, scadenza, permesso di soggiorno, carta d'identità, codice fiscale) · Ruolo nel club (ruolo, reparto, data di assunzione) · Formazione scolastica · Taglie · Note; modifica per sezione in modale | ✅ | `staff-section-drawer.tsx` (cassetto per sezione), `staff-form.tsx`; tutte le etichette in sentence case |
| Scheda: «Accesso EasyGame» (`ClubPersonAccessCard`, `canManageClubConfigurationAsActor`) | ✅ | `src/app/staff/[id]/page.tsx` (2 occorrenze) |
| `/staff/[id]/edit` | ⚠️ | nella V1 era un redirect alla scheda; nella V2 e un modulo intero (`StaffForm`) con zona pericolosa in fondo — capacita **in piu**, stesse scritture `updateClubDataItem` + `ensureStaffDepartment` |
| `/staff/new`: Nome, Cognome, Email/Telefono, Ruolo («Inserisci il ruolo»), Reparto (+ «personalizzato»), toast «Il nome/cognome/ruolo è obbligatorio» | ✅ | `staff-form-model.ts:108-115` (`ValidationSummary` con le stesse tre frasi + «almeno un contatto»), `staff-form.tsx` |
| Deep link `?clubId=` su elenco, scheda, nuovo, modifica | ✅ | `use-staff-club-id.ts` (`useStaffClubId`, `withClubId`) |
| Permessi | ⚠️ | la V1 non aveva predicati nell'elenco; la V2 aggiunge la colonna «Accesso EasyGame» letta da `GET /api/v1/club-roles/assignments` **solo** se `canManageClubConfigurationAsActor` (`use-staff-access-emails.ts:32`), lo stesso predicato e la stessa rotta della `ClubPersonAccessCard` V1 (`club-person-access-card.tsx:110`): non allenta nulla, e assente per gli altri |

Esito: **VERIFICATA**.

### 2.6 `/training`

V1: `src/app/training/page.tsx` (2.946), `src/components/forms/{AddTrainingForm,EditTrainingForm}.tsx` · V2: `src/app/training/page.tsx` (2.196), stessi form + `src/components/training/v2/{AttendanceDrawer,DaySessions,WeekRail,training-grid,training-page-model}.ts*`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| Dati: `getClubTrainings/getClubTrainers/getClubWeeklySchedule/getClubData/getClubStructures/cleanupOrphanScheduledTrainings/saveTrainingAttendance/getClubAthletes` (`simplified-db`), `GET /api/v1/events?kind=training&include_cancelled=1`, `/api/v1/events/[id]`, `listEventParticipants`, `readRecordedAttendance` | ✅ | `src/app/training/page.tsx:40-47,875`; stesso set di import |
| Permessi: `canRecordTrainingAttendance` (5 usi V1, piu `canManageAttendance`/`canTakeAttendance` derivati localmente) | ✅ | 10 usi in V2 (`page.tsx:1331,1738,1959`, `training-grid.tsx:264`, `training-page-model.ts:171,211`); `src/lib/training-utils.ts:1299` invariato |
| Viste: «Vista Giornaliera», «Calendario Storico Allenamenti» (mese con prev/next), «Programma Settimanale» | ✅ | `SegmentedControl` Vista giorno / Vista settimana (`page.tsx:1836-1842`), `WeekRail.tsx:143-197` (griglia mensile «Mese precedente/successivo», «Vai a oggi»), `CollapsedSection` «Programma settimanale» con `WeeklyTrainingSchedule` identico (`page.tsx:1982-2000`) |
| Elenco: `DataGrid` con viste Da registrare / Annullati, filtri Categoria · Allenatore · Presenze · Stato (In programma / In corso / Completati / Annullati) · Sede | ✅ | `training-grid.tsx:14-123` (la V1 non aveva una griglia: e in piu) |
| Azioni: nuovo allenamento, modifica, annulla, ripristina, elimina, presenze | ✅ | `training-grid.tsx:260-292`, `DaySessions.tsx` |
| Conferme (pagina): `window.confirm("Vuoi davvero annullare questo allenamento?")`, `window.confirm("Vuoi ripristinare questo allenamento annullato?")`, «Eliminare l'allenamento?», sovrapposizione orari | ✅ | `page.tsx:2097-2182`: 3 `ConfirmDialog` (annulla, ripristina, sovrapposizione) + 2 `DangerConfirmDialog` (elimina, orfani); i 4 `window.confirm` V1 spariscono (restano solo in commenti) |
| Presenze: `AttendanceSheet` modale → `AttendanceDrawer`, salvataggio con «Presenze salvate con successo» | ⚠️ | `AttendanceDrawer.tsx`, toast «Presenze salvate · n/m» (`page.tsx:1369`) — stesso esito, testo piu informativo |
| Deep link `?focus=attendance&trainingId=&date=` | ✅ | `page.tsx` (`searchParams.get("focus"/"trainingId"/"date")`, apertura a `:1331`) |
| `AddTrainingForm`: Titolo · Data · Ora inizio · Ora fine · gruppi (`TrainingGroupSelector`) · Allenatori · Luogo → «Struttura» · Campo della struttura · RSVP (`EventRsvpFields`); validazione «Compila tutti i campi obbligatori», «Seleziona almeno un allenatore» | ✅ | `AddTrainingForm.tsx:369-371,467` (`ValidationSummary` per campo al posto del toast unico); «Seleziona almeno un allenatore» presente |
| `AddTrainingForm` modalita `isAppointment` (Nome Richiedente, Nome Atleta, Descrizione) | ✅ | rimossa: nessun chiamante passava `isAppointment` in `768ef05` (`git grep`: solo la definizione) — codice morto |
| `EditTrainingForm`: Titolo · Data · Orario inizio/fine · Campo · Allenatori | ✅ | `EditTrainingForm.tsx` stesse etichette |
| Toast: «Errore durante l'eliminazione», «Errore nel caricamento…» | ✅ | presenti |
| Stati: giorno vuoto, caricamento a scheletro, categoria mancante (`missingCategoryPanel`) | ✅ | `page.tsx:1904` |

Esito: **CON GAP** — il pannello condiviso `WeeklyTrainingSchedulePanel.tsx` (montato a `page.tsx:1991`) conserva sei `window.confirm` (conflitto orario, sede incrociata, rimozione): vedi R1.

### 2.7 `/categories`

V1: `src/app/categories/page.tsx` (1.590), `src/components/forms/CategoryEditorDialog.tsx` (672), `src/components/categories/CategoryDetailsDialog.tsx`, `src/components/dialogs/CategoryAthletesDialog.tsx` · V2: `src/app/categories/page.tsx` (1.587) + `src/components/categories/v2/{category-editor-drawer,category-grid-columns,category-inspector-drawer}.tsx`, `category-grid-model.ts`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| Dati: `supabase.from("categories")`, `updateClubAthlete`, `apiRequest` su `/api/v1/categories/<id>` e `/api/v1/athlete_category_memberships/<id>`, lettura club `trainers, weekly_schedule, settings, club_sites, category_groups, structures` | ✅ | identico set (grep V1 = grep V2) |
| Elenco: card in griglia 1/2/3 colonne, «Cerca categorie…», `SiteFilter` «Mostra le categorie svolte a» (solo multi-sede) | ⚠️ | `DataGrid` (`page.tsx:1494`), contesto di sede conservato (`:473`, commento `:95-96` ADR-0038) con etichetta diversa |
| Menu «Filtri» V1 (Filtro per sport / per età / per numero atleti / Filtri resettati) | ✅ | rimosso: nella V1 ognuna delle 4 voci faceva **solo** `showToast("info", …)` (`768ef05:…/categories/page.tsx:1212-1233`) senza filtrare — finto; la V2 ha filtri reali della griglia (`category-grid-model.ts`) |
| Azioni di riga: Apri · Modifica · Cambia sedi / Assegna sedi · Vedi atleti · Report · Sposta in su/giù (`canReorder` solo senza ricerca/filtri) · Elimina | ✅ | `page.tsx:1261-1318`; il riordino e nuovo, coerente con `sortOrder` gia esistente (`:1079` V1) |
| «Vedi atleti» → `CategoryAthletesDialog` («Cerca atleti…», avatar, «Vai all'elenco» → `/athletes?category=<id>`) | ⚠️ | la V2 salta la modale e va direttamente a `/athletes?category=<id>` (`page.tsx:1232`, `category-inspector-drawer.tsx:80`). **Nota pre-esistente**: `/athletes` non legge `?category=` ne in V1 ne in V2 (nessun `searchParams.get("category")`), quindi il link apre l'elenco non filtrato in entrambe le versioni |
| Dettaglio (`CategoryDetailsDialog`: Informazioni Generali, Nome/Sport/Anni di nascita/Atleti iscritti/Allenatori/Allenamenti settimanali/Atleti collegati) | ✅ | `category-inspector-drawer.tsx:103-137` (+ Sedi, Gruppi archiviati, Categorie compatibili, Ordine del club) |
| Editor (`CategoryEditorDialog` → `category-editor-drawer.tsx`): Nome categoria · Descrizione · Colore · Anno di nascita dal/al («Solo l'anno iniziale») · Sedi in cui è attiva · Categorie compatibili · Allenatori assegnati · «Assegnazione rapida allenatori» · riallineamento atleti («Lascia come sono» / «Riallineali adesso») | ✅ | `category-editor-drawer.tsx:497,599,634`, etichette `label=` ; validazioni «Il nome categoria e' obbligatorio», «Inserisci un anno di nascita valido», «L'anno di nascita finale non e' valido» presenti (grep) |
| Distruttive: «Conferma eliminazione» con i tre paragrafi sulle conseguenze | ✅ | `DangerConfirmDialog` con `consequences[]` e `typedConfirmation` (`page.tsx:1554-1581`) — piu forte della V1 |
| Deep link `?categoryId=` verso `/reports?report=categories&categoryId=` | ✅ | `page.tsx:1235` |
| Permessi | ✅ | nessun predicato nella V1; `canReorder`/`canSelect` V2 sono condizioni di UI, non di ruolo |
| Componenti V1 rimossi: `CategoryEditorDialog`, `CategoryDetailsDialog`, `CategoryAthletesDialog` | ✅ | nessun import residuo |

Esito: **CON GAP** — «Vedi atleti» arriva a un elenco non filtrato (R2); tutto il resto a parita.

### 2.8 `/medical`

V1: `src/app/medical/page.tsx` (844), `src/components/forms/AddCertificateForm.tsx` (587) · V2: `src/app/medical/page.tsx` (811), stesso form (in `Drawer`) + `src/components/medical/v2/{certificate-grid-columns.tsx,certificate-grid-model.ts,reminder-bulk-drawer.tsx}`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| Dati: `supabase` (atleti + certificati), `getClubCategories` (+ `getClubData` per le sedi), `/api/v1/assets`, `/api/v1/attachments/`, `POST /api/medical-certificate-reminders` | ✅ | stessi endpoint; `/api/medical-certificate-reminders` 4 usi V2 (riga + massa) |
| Filtri: tab Tutti/Validi/In scadenza/Scaduti (+ mancanti), «Tutte le categorie», «Cerca atleti…» | ✅ | `certificate-grid-model.ts:313-365` (Stato · Categoria · Sede · Tipo certificato · Scadenza), ricerca `page.tsx:524` |
| Card certificato: link alla scheda `/athletes/<id>?clubId=&tab=sanitari#sanitari`, «Emesso il» / «Scade il», visualizza/scarica allegato, «Invia promemoria», registra/aggiorna certificato | ✅ | azioni di riga `page.tsx:538-577` (Apri scheda · Registra certificato · Aggiorna certificato · Invia promemoria · Visualizza allegato · Scarica allegato); date in colonne |
| Azione di massa «Invia promemoria» (con cassetto di riepilogo) | ⚠️ | nuova in V2 (`page.tsx:584-587`, `reminder-bulk-drawer.tsx`): la V1 inviava solo uno per volta — capacita in piu |
| Esportazione | ⚠️ | la V1 non ne aveva; la V2 aggiunge CSV (`from "@/lib/csv"`) |
| `AddCertificateForm`: Atleta («Cerca atleta…») · Tipo di Certificato · Data di Emissione · Data di Scadenza · allegato | ✅ | etichette identiche (grep: nessuna differenza); modale → `Drawer` |
| Deep link `?action=new` (dalla Dashboard), `?clubId=` | ✅ | `page.tsx:150-174` (`params.delete("action")` dopo l'apertura, come V1) |
| Stato vuoto → «Nuovo atleta» (`/athletes?action=new`) | ✅ | `page.tsx:748` |
| Permessi | ✅ | nessun predicato nella V1; nessuno inventato |

Esito: **VERIFICATA**.

### 2.9 `/movements` (+ `/payments` → redirect)

V1: `src/app/movements/page.tsx`, `src/components/accounting/{AccountingEntries,AccountingFilters,AccountingEntryDialogs,AccountingSummary,ExpectedEntries}.tsx`, `accounting-view.ts`, `src/components/payments/PaymentReminderDialog.tsx` (3.988 righe in tutto) · V2: stessi file meno `AccountingEntries`/`AccountingFilters` + `src/components/accounting/v2/{context-controls,prima-nota-grid,rate-grid}.tsx` (3.991 righe).

| Area | Esito | Evidenza |
| --- | --- | --- |
| Dati/API: `GET/POST /api/v1/accounting/entries`, `/entries/<id>/reverse`, `/entries/<id>/reconcile`, `/api/v1/accounting/reports`, `/api/v1/accounting/accounts`, `/api/v1/accounting/expected[/<id>]`, `/api/v1/fiscal/operation-types`, `POST /api/payment-reminders`, `getClub/getClubAthletes/getClubData` | ✅ | identico set (grep V1 = grep V2) |
| Permessi: `canOpenAccounting`, `canManage` («accounting.manage»), `canReverse`, `canReconcile`, `canSendReminders`, `canSend`, `canManageClubConfigurationAsActor` | ✅ | tutti presenti con conteggi uguali o superiori (`canOpen` 18→20, `canReverse` 3→2 e `canReconcile` 3→2: la terza occorrenza V1 era la prop passata a `AccountingEntries`, ora inline nelle azioni di riga `prima-nota-grid.tsx:362-371`) |
| Tab: Prima nota · Rate e solleciti · Previsti | ✅ | `page.tsx:161-166`; nuovo `?tab=` (`:262,301`) e `?action=new` → tab rate (`:313-319`) |
| Prima nota filtri: ricerca «Descrizione, controparte, causale, riferimento bancario», Verso (Entrate e uscite / Solo entrate / Solo uscite), Tutte le causali, Tutte le origini, Tutti i conti, Qualsiasi stato (riconciliazione), Tutti gli anni | ✅ | `prima-nota-grid.tsx:129-184` (Periodo · Conto · Causale · Verso · Origine · Riconciliazione · Sede), viste Solo entrate / Solo uscite / Da riconciliare (`page.tsx:174-178`); anno fiscale e stagione come `ContextControl` (`context-controls.tsx:46` «Tutti gli anni») |
| Prima nota azioni: Registra movimento, Giroconto, Riconcilia, Storna | ✅ | `page.tsx:796-799`, `prima-nota-grid.tsx:362-371` |
| Dialoghi: Registra un movimento (Data · Verso · Causale · Conto · Importo · Descrizione · Controparte · Metodo di pagamento · Riferimento bancario · Data valuta · Sede · Note), Registra un giroconto (Dal conto · Al conto), Storna il movimento (Data dello storno · Motivo), Spunta contro l'estratto conto (Stato) | ✅ | `AccountingEntryDialogs.tsx` (etichette senza i suffissi «(EUR)», «(facoltative)», «(facoltativa)»: `CurrencyInput` e helper li rendono impliciti); stessi placeholder |
| Riepilogo (`AccountingSummary`): totali da `/reports`, link «Riepilogo gestionale completo» → `/reports`, «Compensi» → `/sport-work/compensations`, disclaimer | ✅ | `AccountingSummary.tsx:42,252-255` |
| Rate e solleciti: stato derivato (`resolveLedgerState`), filtro stato (Aperte / Scadute / In attesa / Parziali / Pagate), selezione «le rate aperte in elenco», «Sollecita» (di massa), «Apri il registro incassi» | ✅ | `rate-grid.tsx:80-96`, `page.tsx:717-733,888` (`rateBulkActions`) |
| `PaymentReminderDialog` («Sollecita le quote non pagate», calcolo destinatari, canali) | ✅ | modale → `Drawer`; `POST /api/payment-reminders` invariato; contratto verificato da `tests/ui/payment-reminder-contract.test.mjs` (aggiornato) |
| Previsti (`ExpectedEntries`): Registra previsione (Entrata/Uscita prevista), elimina con `ConfirmDialog` distruttivo, `canManage` | ✅ | `ExpectedEntries.tsx:53` (`DataGrid`), `canManage` conservato |
| `/payments` → `/movements` | ✅ | `src/app/payments/page.tsx` invariato |
| `window.confirm` | ✅ | nessuno ne in V1 ne in V2 (le due occorrenze V1 erano commenti) |

Esito: **VERIFICATA**.

### 2.10 `/reports`

V1: `src/app/reports/{page,management-summary,accounting-export-button}.tsx` (1.920) · V2: stessi file (2.279) + `src/components/reports/v2/{activity-report-panels,management-group-grid,report-context-controls,report-stat-tile}.tsx`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| Dati/API: `getClub/getClubAthletes/getClubData`, `/api/v1/accounting/reports`, `/api/v1/accounting/accounts`, `/api/v1/fiscal/operation-types`, `/api/v1/accounting/export?…` | ✅ | identico set |
| Permessi: `canOpenAccounting` (×2), `"accounting.export"` sul pulsante di esportazione | ✅ | identici (`accounting-export-button.tsx` diff: solo un'icona) |
| Report attivita: filtri Categoria («Tutte le categorie») e periodo («Intero periodo»); tabella categoria per atleta; sezioni Presenze (Allenamenti · Presenze registrate · Presenze mancanti), Gare (Gare · Convocazioni · Gare senza convocazioni), Pagamenti (Totale dovuto · Pagato · In attesa · Scaduto) | ✅ | `activity-report-panels.tsx:53-374` (`DataGrid` «Report categoria per atleta», `ReportStatTile`), `report-context-controls.tsx` |
| Riepilogo gestionale (`management-summary.tsx`): Dal/Al, Anno fiscale, Stagione sportiva, Conto, Causale, Sede, Verso; gruppi Entrate · Uscite · Saldo · Righe | ✅ | `management-summary.tsx:534-595`, `management-group-grid.tsx:50-64` |
| Esportazione contabile (`AccountingExportButton`) | ✅ | invariata nella logica |
| Deep link `?report=categories`, `?categoryId=`, `?clubId=` | ✅ | `page.tsx:131-132,186-191` (la V1 leggeva solo `categoryId`/`clubId`; `report` e nuovo e serve al link da Atleti/Categorie) |
| Stati: caricamento a scheletro («Caricamento report reali…» → `ReportStatTile loading`), vuoti («Nessuna presenza reale da mostrare», «Nessuna gara reale nel filtro», «Nessun dato categoria») | ✅ | `activity-report-panels.tsx:248-327` |

Esito: **VERIFICATA**.

### 2.11 `/procura`

V1: `src/app/procura/page.tsx` (1.691) · V2: `src/app/procura/page.tsx` (507) + `src/components/procura/v2/{procura-drawer,procura-inspector,delete-procura-dialog}.tsx`, `procura-model.ts`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| Dati: `getClubData/addClubData/updateClubDataItem/deleteClubDataItem/getClubAthletes` (`simplified-db`) | ✅ | `page.tsx` stesso import |
| Elenco «Procure Registrate» con ricerca | ✅ | `DataGrid` (`page.tsx:13`), viste Senza contatti / Con pagamenti (`:50-51`), filtri Contatti / Associazioni (`:352-367`), export CSV (colonne con `exportValue`) — piu della V1 |
| Modulo procura: Nome Procura * · Indirizzo Sede Procura (Via/Piazza, CAP, Città, Provincia, Paese) · Contatti Procuratori (Nome, Cognome, Email, Telefono) · Note | ✅ | `procura-drawer.tsx:178` («Contatti procuratori»), etichette `label=` in sentence case; `DrawerSection` «Sezioni della procura» |
| Associazioni: Tipo Persona · Persona («Seleziona…») · Costo (€) · Note Associazione; «Seleziona una persona» | ✅ | `procura-inspector.tsx:180` («Seleziona una persona da associare»), `:1105-1109` (Nuova/Modifica associazione, Note associazione) |
| Pagamenti: «Nuovo Pagamento» (Data · Importo (€) · Descrizione · Tipo), «Storico Pagamenti» | ✅ | `procura-inspector.tsx:247,464,499` |
| Distruttive: `confirm("Sei sicuro di voler eliminare questa procura?")`, `confirm("Sei sicuro di voler eliminare questa associazione?")` | ✅ | `delete-procura-dialog.tsx` (`DangerConfirmDialog`, elenca associazioni/costi/note che se ne vanno) e `ConfirmDialog` tono danger (`procura-inspector.tsx:389-397`); il `confirm(` residuo in V2 e un commento (`:517`) |
| Stati: «Nessuna procura trovata», «Nessun pagamento registrato» | ✅ | presenti |
| Deep link `?clubId=` | ✅ | risolto come nella V1 (club attivo) |
| Permessi | ✅ | nessun predicato nella V1; nessuno inventato |

Esito: **VERIFICATA**.

### 2.12 Guscio (Sidebar, Header, barra mobile)

V1: `src/components/dashboard/Sidebar.tsx` (595), `src/components/dashboard/Header.tsx` (725), `src/components/ui/notifications-dropdown.tsx`, `src/components/layout/MobileTopBar.tsx` · V2: `src/components/web/shell/{Sidebar,Topbar,ShellProvider,NotificationDrawer,QuickActionsDrawer}.tsx`, `navigation.ts`; `dashboard/Sidebar.tsx` e `dashboard/Header.tsx` sono porte (10 e 19 righe).

| Area | Esito | Evidenza |
| --- | --- | --- |
| Voci di navigazione: 33 `href` V1 tutti presenti (Dashboard, Report, Atleti, Allenatori, Staff, Soci, Categorie, Certificati, Procure, Calendario, Allenamenti, Gare, Strutture, Iscrizioni, Modulistica, Consensi, Segreteria, Documenti, Notifiche, Comunicazioni, Movimenti, Sponsor, Lavoro sportivo, Abbigliamento, Club, Impostazioni, Permessi allenatore, Ruoli e accessi, Registro attività) | ✅ | `navigation.ts:78-151`; `tests/web/shell-navigation.test.mjs` «nessuna destinazione della barra V1 e sparita» |
| Gruppi: PANORAMICA · PERSONE · ATTIVITÀ SPORTIVA · SEGRETERIA · CONTABILITÀ · LAVORO SPORTIVO · MAGAZZINO · CONFIGURAZIONE (8) → Panoramica · Persone · Attività sportiva · Segreteria · Cassa e amministrazione · Impostazioni (6) | ⚠️ | riorganizzazione dichiarata dalla guideline 06; «Movimenti» → «Prima nota», «Certificati Medici» → «Certificati medici» (etichette canoniche) |
| Voci nuove: «EasyGame HUB» (`/hub`), «Appuntamenti» (`/appuntamenti`) | ⚠️ | `navigation.ts:82,118`; `/appuntamenti` esisteva gia come rotta in `768ef05` (`git ls-tree`) senza voce in barra; `src/app/hub` esiste. Non sono regressioni; da verificare che `/hub` sia raggiungibile per i ruoli previsti da `canAccessPath` |
| Visibilita per ruolo: V1 nascondeva solo «Movimenti» (`canOpenAccounting`) e `Header` reindirizzava con `canAccessPath`; V2 filtra **ogni** voce con `canAccessPath` + `visible` (`canOpenAccounting` per Prima nota) e il `Topbar` reindirizza ancora | ✅ | `navigation.ts:155-167`, `Topbar.tsx:75`; stretto, non allentato (regola 10: assente, mai disabilitato) |
| Azioni rapide: Nuovo atleta · Registra certificato medico · Nuovo allenamento · Nuova gara · Registra pagamento, filtrate con `canAccessPath` | ✅ | `navigation.ts:265-269` (stessi `href` con `?action=new`), `QuickActionsDrawer.tsx`; le destinazioni leggono `action` (`/training:556`, `/medical:160`, `/matches:309`, `/movements:313`) |
| Topbar: identita club (`clubIdentity`), stagione → `/organization?tab=stagioni`, ricerca, campanello, menu account (Profilo `/account?profile=1`, Account `/account`, «Esci» → `signOut`), variante `sky` solo per la Dashboard | ✅ | `Topbar.tsx:91-93,350-365` |
| Notifiche: lettura `simplified_notifications`, segna letta (`update({ read: true })`), «Segna tutte come lette» | ✅ | `NotificationDrawer.tsx:119-155,189`; `src/components/ui/notifications-dropdown.tsx` resta nel repo **senza importatori** (orfano da rimuovere) |
| Breadcrumb con nome del record (`useBreadcrumbLabel`) | ⚠️ | nuovo (`ShellProvider.tsx`) |
| Barra mobile sotto 1024 px (`MobileTopBar`) | ✅ | invariata (+6 righe); `tests/ui/navigazione-sotto-1024-e-768.test.mjs` aggiornato |
| «Chiudi sidebar» / «Torna indietro» | ✅ | «Comprimi/Espandi la barra laterale» (`web/shell/Sidebar.tsx:103`), stato persistito con `readPreference/writePreference` |

Esito: **VERIFICATA** (un orfano da rimuovere: `notifications-dropdown.tsx`).

## 3. REGRESSIONI DA CHIUDERE

Nessuna capacita della V1 risulta persa (dati, azioni, moduli, permessi, deep link). Restano quattro punti che contraddicono il contratto o lasciano residui, in ordine di gravita:

| # | Gravita | Cosa | Dove | Cosa fare |
| --- | --- | --- | --- | --- |
| R1 | **Media** | Sei `window.confirm` vivi dentro una rotta migrata: il programma settimanale di `/training` chiede conferma di conflitto orario / sede incrociata / rimozione con il dialogo del browser (regola: «niente `window.confirm`», guideline 10 §10.5 punto 9) | `src/components/dashboard/WeeklyTrainingSchedulePanel.tsx:715,720,778,792,825,1693`, montato da `src/app/training/page.tsx:141-143,1991` | Componente condiviso non riscritto (giusto, per il brief), ma va avvolto: le conferme passano a `ConfirmDialog`/`DangerConfirmDialog` senza toccare la logica di generazione |
| R2 | Bassa | Pulsante «Vedi atleti» delle categorie porta a `/athletes?category=<id>` ma l'elenco atleti **non legge** `category` (ne in V1 ne in V2): il link apre l'elenco senza filtro | `src/app/categories/page.tsx:1232`, `src/components/categories/v2/category-inspector-drawer.tsx:80`; `src/app/athletes/page.tsx` legge solo `clubId`/`organizationId`/`organization_id`/`action` | Pre-esistente, ma la V1 mostrava prima una modale con l'elenco (`CategoryAthletesDialog`), quindi la persona **vedeva** gli atleti; ora arriva a un elenco non filtrato. Far leggere `?category=` al `DataGrid` degli atleti come filtro iniziale |
| R3 | Bassa | Componente V1 orfano lasciato nel repo: `notifications-dropdown.tsx` non ha piu importatori dopo `NotificationDrawer` | `src/components/ui/notifications-dropdown.tsx` (nessun `import` in `src/`) | Rimuovere nella stessa ondata (il brief chiede di togliere la V1 a parita raggiunta) |
| R4 | Bassa | Preferenze colonne dell'elenco atleti non migrate: la V1 le salvava in `localStorage.athleteColumns_<clubId>` (con `columnSchemaVersion: 2`), la V2 legge `egw.<modulo>.*` via `useGridState` | `768ef05:src/app/athletes/page.tsx:527`, `src/components/web/datagrid/useGridState.ts:20` | Accettabile (un solo reset per utente); se si vuole evitare, una lettura una tantum della vecchia chiave |

## 4. GAP DICHIARATI (volontari, con motivo)

| Rotta | Cosa manca rispetto alla V1 | Perche e accettabile |
| --- | --- | --- |
| `/dashboard/[dashboardId]` | Le tre card «Appuntamenti di Oggi / Gare di Oggi / Promemoria Attivi» e `RecentActivity` | La rotta disegna la stessa Dashboard V2; `RecentActivity` riceveva `activities={[]}` (sempre vuoto); `SetupGuide`, `AccessCodeGenerator`, `NewDashboard` non erano importati da nessuno |
| `/dashboard` | Card «Certificati Scaduti» come quarta metrica | Il numero vive come delta rosso «N scaduti» sulla card «Certificati in scadenza» (`DashboardKpiBar.tsx:63-66`) |
| `/trainers/[id]` | Tab «Presenze» (Presente / Assente / Nessuna Risposta / Tasso di Presenza) | `trainingSessions` era `useState([])` mai alimentato (`768ef05:…/trainers/[id]/page.tsx:546-571`): mostrava sempre 0 |
| `/trainers/[id]` | Invio «messaggi» all'allenatore | Solo stato locale (`setMessages([...])`), nessuna scrittura: finto |
| `/training` | Modalita `isAppointment` di `AddTrainingForm` (Nome Richiedente, Nome Atleta, Descrizione) | Nessun chiamante la passava in `768ef05` |
| `/categories` | Menu «Filtri» (per sport / età / numero atleti / reset) | Ogni voce faceva solo `showToast("info", …)` senza filtrare (`768ef05:…/categories/page.tsx:1212-1233`); la griglia V2 ha filtri veri |
| `/categories` | `CategoryAthletesDialog` (elenco atleti in modale) | Sostituito dal link diretto — vedi R2 |
| `/staff` | Vista a card alternativa alla tabella | Una sola `DataGrid` (regola 7); le informazioni della card sono colonne |
| `/movements` | Suffissi «(EUR)», «(facoltative)», «(facoltativa)» nelle etichette dei dialoghi | `CurrencyInput` e `helper` del `Field` li rendono impliciti |
| Guscio | Otto gruppi in maiuscolo → sei gruppi in sentence case; «Movimenti» → «Prima nota», «Certificati Medici» → «Certificati medici» | Guideline 06 e `src/lib/web/status.ts`; nessuna destinazione persa (`tests/web/shell-navigation.test.mjs`) |

Capacita **in piu** rispetto alla V1 (non gap, ma da verificare a schermo): griglia allenamenti con viste/filtri (`/training`), riordino categorie (`/categories`), promemoria certificati in blocco + CSV (`/medical`), `/staff/[id]/edit` come modulo intero, colonna «Accesso EasyGame» nello staff (dietro `canManageClubConfigurationAsActor`), export CSV procure, guardia `dirty` sui cassetti, breadcrumb con nome del record, stato d'errore con «Riprova» sulla Dashboard.

## 5. Verifiche trasversali

| Controllo | Esito | Evidenza |
| --- | --- | --- |
| `window.confirm` / `window.prompt` / `alert(` nei file migrati | ⚠️ | zero nelle 12 rotte e in `src/components/web/**`; sei in `WeeklyTrainingSchedulePanel.tsx` (condiviso, montato da `/training`) → R1. I `confirm(` V1 di atleti, allenatori, staff, procure, allenamenti sono spariti (restano solo in commenti) |
| `from-blue-600 to-purple-600` | ✅ | zero nei file migrati; 6 residui in rotte **non** in questa ondata (`clothing`, `secretariat`, `sponsors`, `sponsors/[id]`, `club/ClubPersonDetailHeader`, `trainer-dashboard-home-v2-page`) |
| Ogni elenco migrato usa `<DataGrid` | ✅ | 13 file: atleti, allenatori, staff, allenamenti, categorie, certificati, prima nota + rate + previsti, report (atleti per categoria, riepilogo per gruppo), procure, documenti e pagamenti dell'allenatore; nessun `<table` residuo nei file migrati. Le liste **dentro una scheda** (certificati e tesseramenti dell'atleta) usano le primitive di record (`record-primitives.tsx`), non la griglia: coerente con il pattern scheda |
| Distruttive con `DangerConfirmDialog`/`ConfirmDialog` | ✅ | 21 file; nessun `ui/alert-dialog` o `ui/dialog` residuo nei file migrati |
| Predicati di permesso per rotta non ridotti | ✅ | confronto per conteggio: dashboard 0→0, atleti 0→0, scheda atleta (`canManage` tesseramenti) =, allenatori (`canWrite` ×6, `canAccessPath`) =, staff 0→+1 (stesso predicato della card V1), allenamenti `canRecordTrainingAttendance` 5→10, categorie 0→0, certificati 0→0, prima nota (`canOpenAccounting`, `canManage`, `canReverse`, `canReconcile`, `canSendReminders`, `canSend`, `canManageClubConfigurationAsActor`, `"accounting.manage"`) =, report (`canOpenAccounting`, `"accounting.export"`) =, procure 0→0, guscio (`canAccessPath` 3→6, `canOpenAccounting` 1→4) |
| Nessun `fetch("/api` aggiunto in file client | ✅ | grep sui 156 file cambiati: zero |
| Nessun `@/lib/server/**` importato da file client | ✅ | grep sui file cambiati: zero |
| Deep link | ✅ | `?action=new` (atleti, certificati, allenamenti, gare, prima nota→rate), `?tab=` (scheda atleta con alias dei vecchi tab, scheda allenatore, prima nota), `?clubId=` (14 letture, le due della dashboard confluite in `ClubDashboard.tsx:61`), `?focus=attendance&trainingId=&date=`, `?categoryId=` e `?report=categories` (report), `#sanitari` (+ `tab=sanitari`) |
| Emoji / esadecimali nuovi nei componenti V2 | ✅ | nessuna emoji nei `v2/**` e in `web/**` |
| Test statici di parita per rotta | ✅ | `tests/ui/{dashboard,atleti,scheda-atleta,allenatori,staff,allenamenti,categorie,certificati,prima-nota,reports,procura}-v2-*.test.mjs` + `tests/web/{shell-navigation,status,format}.test.mjs` |

## 6. Gate

Eseguiti una volta sul tree di lavoro (HEAD `bafdcb4` all'avvio; il commit successivo `4f1b3c9` tocca solo `src/components/web/page/PageHeader.tsx`, 3 righe):

| Gate | Esito |
| --- | --- |
| `npm run typecheck` | exit 0, nessun output |
| `npm test` | **5.972** test, 5.972 pass, 0 fail, 0 skipped (erano 4.564 al 2026-09-03 secondo `CLAUDE.md`) |
| `npx next lint` | 0 errori, **33** warning (baseline V1 a `768ef05`: 34 warning, 0 errori — misurato con un worktree temporaneo, poi rimosso). Tra i warning nuovi: `src/components/web/forms/Field.tsx:275,378` (`aria-invalid` su `role=button`, jsx-a11y) e `DataGrid.tsx:108` (`react-hooks/exhaustive-deps`), compensati da warning V1 spariti con i file rimossi |
| `npm run build` | non eseguito (il brief lo riserva al lead: `.next` condiviso) |
