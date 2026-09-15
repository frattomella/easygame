# Parita funzionale Web V1 → Web V2 — Wave D ed E (revisione QA indipendente)

Data: 2026-09-15 · Branch: `feat/web-redesign` (HEAD `01d9748`; Wave D `84866d2`, Wave E `cb3caf2`) · Baseline V1: `768ef05`.

Metodo: per ogni rotta ho letto l'audit (`docs/redesign/audit/wave-d-*.md`, `wave-e-*.md`), estratto dalla V1 (`git show 768ef05:<file>`) l'inventario meccanico — endpoint (`apiRequest`, `/api/v1/…`, funzioni di `simplified-db`, `supabase.from`), predicati (`can…`, chiavi `"<dominio>.<azione>"`), query param (`searchParams.get`), conferme (`confirm(`, `alert(`, `prompt(`), chiavi `localStorage` — e l'ho confrontato con la stessa estrazione sulla V2 (`src/app/<rotta>/page.tsx` + `src/components/<dominio>/v2/*`), poi ho cercato nella V2 una per una le capacita elencate dall'audit (campi, validazioni, toast, azioni di riga e di massa, export, stati, flussi distruttivi, parametri). Il giudizio e sul sorgente; nessuna prova a schermo, nessun server, nessuna build. Ho eseguito un solo strumento oltre a `grep`/`git`: `eslint` con la sola regola `no-unused-vars` sui 171 file V2 delle due ondate (zero segnalazioni).

Legenda: ✅ presente · ⚠️ equivalente (forma diversa, stessa capacita) · ❌ mancante · OK / REGRESSIONE / DUBBIO come esito di rotta.

## 1. Tabella riassuntiva

| # | Rotta | Ondata | Esito | Note |
| --- | --- | --- | --- | --- |
| 1 | `/matches` | D | **OK** | la modifica passa a `updateEvent` (la V1 scriveva una proiezione rifiutata con 403); «Invia promemoria» GAP dichiarato |
| 2 | `/calendar` | D | **OK** | in piu: vista mese, `?date=`, «Apri» con la data |
| 3 | `/soci`, `/soci/new`, `/soci/[id]`, `/soci/[id]/edit` | D | **OK** | predicato `canManageMembershipRegister` applicato anche all'elenco (V1: solo alla card eventi) — stesso perimetro del server, vedi D1 |
| 4 | `/structures`, `/structures/[id]` | D | **OK** | «Prenotabile dalle famiglie» ora modificabile dalla scheda (V1: irraggiungibile); salvataggio per sezione invece del draft unico |
| 5 | `/registration-management` | D | **OK** | cancello client `canManageClubConfigurationAsActor` = perimetro server della risorsa `clubs`, vedi D2 |
| 6 | `/sponsors`, `/sponsors/[id]` | D | **OK** | predicati `accounting.read/manage/reverse` ricostruiti dal server (V1: nessuno); storno cablato (V1: cestino che rifiutava) |
| 7 | `/documenti` | E | **OK** | stesso cancello (`documents.review` + `documents.read_dossier`, ripiego per ruolo di club) |
| 8 | `/modulistica` | E | **OK** | editor `DocumentEditor`, `FormBuilder`, `BulkGenerationDialog`, `SubmissionReviewDialog` riusati; una `disabled` residua, vedi V1 |
| 9 | `/consensi` | E | **OK** | tre predicati identici |
| 10 | `/secretariat` | E | **OK** | «Atleta collegato» (campo morto V1) GAP dichiarato |
| 11 | `/appuntamenti` | E | **OK** | `isManagementAccessRole` come V1; undici chiavi del corpo presenti |
| 12 | `/communications` (+ `bacheca`, `automazioni`) | E | **OK** | anteprima obbligatoria, `communication_id` in `sessionStorage`, ripresa a lotti: tutto presente |
| 13 | `/notifications` | E | **OK** | stessa lettura (`simplified_notifications`, `user_id.is.null`, 50 righe), bus locale |
| 14 | `/hub` | E | **OK** | i tre gesti finti della V1 (Acquista, feedback, proposta) sono GAP dichiarati |
| 15 | `/audit` | E | **OK** | sette parametri server identici, pager 50, 403 → stato «restricted»; nessun export aggiunto |
| 16 | `/sport-work` (+ 5 sotto-rotte) | E | **OK** | `window.prompt` della cessazione → `reason-dialog`; F24/CU con intestazioni italiane |
| 17 | `/organization` | E | **OK** | autosave per sezione, `?tab=` con alias, nove sezioni |
| 18 | `/settings` | E | **OK** | scheda Sicurezza finta → GAP dichiarato |
| 19 | `/dashboard/access-management` | E | **OK** | `isOwnerActor`, `roleHasPermission(…,"audit.read")` identici |
| 20 | `/permissions` | E | **OK** | 25 leve, 3 preset, un solo scrittore |
| 21 | `/account` | E | **OK** | otto endpoint `auth/*` + `POST /api/v1/clubs`; `window.confirm` → dialogo |
| 22 | `/clothing` | E | **OK** | sei aree in `?area=`, predicati `canAccessClubResource` come il server |

**Nessuna rotta in REGRESSIONE.** Non ho trovato una capacita V1 (dato, azione, campo, validazione, endpoint, parametro URL, predicato) che manchi nella V2 senza essere dichiarata GAP con un motivo valido. Restano tre **DUBBI** di perimetro (D1–D3) — predicati client aggiunti dove la V1 non ne aveva, tutti coincidenti con cio che il server gia rifiutava — e alcune osservazioni §10.5 di peso basso (V1–V6).

## 2. Checklist per rotta

Per ogni rotta: file V1 (a `768ef05`) e V2, poi le aree dell'audit con l'esito. Dove non indico una riga, il riferimento e il file intero (la capacita e distribuita).

### 2.1 `/matches`

V1: `src/app/matches/page.tsx` (2.647), `src/components/forms/{AddMatchForm,MultipleAddMatchForm}.tsx`, `src/components/matches/MatchConvocationsList.tsx` · V2: `src/app/matches/page.tsx`, `src/components/matches/v2/{match-page-model.ts,match-grid.tsx,DayMatches.tsx,MatchWeekRail.tsx,MatchFormDrawer.tsx,MultipleMatchesDrawer.tsx,ConvocationsDrawer.tsx,matches-context-controls.tsx}`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| Lettura: `getClubData("matches")` + `listEvents({kind:"match", include_cancelled:"1"})`, categorie, allenatori, `getClubSettings`, strutture, atleti, sedi, gruppi | ✅ | `page.tsx` (stessi import da `@/lib/events/client` e `simplified-db`) |
| Stato derivato In programma · Conclusa · Annullata; convocazioni Salvate/In corso/Mancanti | ✅ | `match-page-model.ts:107`, viste «Prossime · Senza convocazioni · Concluse» (`match-grid.tsx:29,57`) |
| Settimana (7 celle, oggi, selezione) · Gare del giorno · Tutte le gare · Prossime · Storico con ricerca | ⚠️ | `MatchWeekRail.tsx`, `DayMatches.tsx`, `DataGrid` con viste/filtri/ricerca (una griglia sola invece di quattro elenchi: regola 7) |
| Filtro categoria globale · `?action=new` · toggle Card/Tabella | ✅/⚠️ | `page.tsx:264-267`; il toggle non persistito diventa la griglia + il rail |
| `AddMatchForm`: Titolo, Data, Orario (+90' su `onBlur` e al salvataggio), Gruppi (`TrainingGroupSelector`), Avversario, In casa/Trasferta, Struttura consigliata (`resolveRecommendedStructures`), Campo, Numero gara, Allenatori proposti, `EventRsvpFields`, Note | ✅ | `MatchFormDrawer.tsx` (`suggerisciIntervalloGara`, `resolveRecommendedStructures`, `fromEventRsvpPayload`; test `gara-conflitto-disponibilita`, `match-group-ids`, `struttura-consigliata-cross-site-superfici` ripuntati) |
| Creazione: una riga per categoria, cross-site (`isCrossSiteEvent` + conferma a promessa), conflitti allenatore/categoria (3 ore) | ✅ | `page.tsx:401-448` (`findScheduleConflicts`, `describeScheduleConflicts`, `useConfirm`); annullare la conferma **risolve** la promessa (difetto V1 chiuso, `page.tsx:239-241`) |
| Modifica: `updateEvent(id, data, version)` con RSVP e `groupIds` | ✅ | `page.tsx:618`; conflitto ottimistico «modificato da qualcun altro» ricarica (test `gara-elimina-annulla-canonico`) |
| Creazione multipla: Categorie, Allenatori, Note comuni, N voci (Data, Orario, Avversario, Luogo, Numero) | ✅ | `MultipleMatchesDrawer.tsx:250-363` |
| Convocazioni: rilettura righe (`listEventParticipants`), rosa per gruppo/categoria, atleta extra, `Convoca: {nome}`, badge partecipazione, avviso certificato + toast, salvataggio `saveEventConvocations` | ✅ | `ConvocationsDrawer.tsx:62-103,212`; in piu le risposte RSVP (`:193`) |
| Annulla (`cancelEvent`) · Elimina (`deleteEventIfEmpty`) · **Ripristina** (`restoreEvent`, D-AUD-W D-2) | ✅ | `ConfirmDialog`/`DangerConfirmDialog` in `page.tsx`; zero `window.confirm` |
| Scadenza convocazioni (`matchConvocationDeadlineDays` 0–30, `saveClubSettings`) | ✅ | `page.tsx` (5 occorrenze) |
| Statistiche convocazioni: filtro stato (default `active`), Gare/Assenze mai calcolate | ⚠️ | `match-grid.tsx:385-460` (`matchesPlayed: null` → `—`, D-AUD-W D-4); `initialFilters={{ stato: "active" }}` (`page.tsx:1251`) al posto di `localStorage["matchSettings_athleteStatusFilter"]` |
| `MatchCertificateWarningBadge` (condiviso) | ✅ | riusato in `DayMatches`, `match-grid` |
| Permessi | ✅ | nessun predicato in V1, nessuno inventato (`canManageMatch` di stato) |

Esito: **OK**.

### 2.2 `/calendar`

V1: `src/app/calendar/page.tsx` (449) · V2: `src/app/calendar/page.tsx`, `src/components/calendar/v2/{MonthGrid.tsx,calendar-model.ts}`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| `listEvents({kind, from, to, include_cancelled:"1"})`, `club_sites`, `category_groups`, `buildCategoryGroups` | ✅ | `page.tsx:133-142` |
| Filtri Dal/Al (default oggi/+30) · Tipo · Sede · Categoria · Gruppo | ✅ | `page.tsx:68-71,227-280` |
| Riga: titolo, orario, categoria, sede, «Conferma richiesta», «Capienza», stato Annullato/Concluso/Archiviato/In programma | ✅ | `page.tsx:373-416`, `calendar-model.ts:41-61` |
| «Apri» → `/matches` / `/training` | ⚠️ | ora con `?date=` (D-AUD-W D-6) |
| Vuoto «Nessun evento nell'intervallo scelto con questi filtri.» + Vai agli allenamenti / Vai alle gare | ✅ | `page.tsx:430-439` |
| In piu: vista Mese/Elenco, `?date=`, scheletro | ⚠️ | `MonthGrid.tsx` (`overflow-x-auto`), `page.tsx:89-90,316-321` |

Esito: **OK**.

### 2.3 `/soci`, `/soci/new`, `/soci/[id]`, `/soci/[id]/edit`

V1: `src/app/soci/{page,new/page,[id]/page}.tsx`, `src/app/soci/[id]/membership-register-panel.tsx`, `src/components/club/ClubPersonDetailHeader.tsx` · V2: le stesse rotte + `src/app/soci/[id]/edit/page.tsx` (nuova), `src/components/soci/v2/{member-model.ts,member-form-model.ts,member-form.tsx,member-section-drawer.tsx,membership-register-section.tsx,membership-event-drawer.tsx,set-member-type-drawer.tsx,delete-member-dialog.tsx}`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| Lettura `supabase.from("clubs").select("members")` + `fetchMembershipRegister` (se `canReadMembershipRegister`) | ✅ | `page.tsx:81-82,124` |
| Selezione + Attiva · Disattiva · Tipo socio (una `updateMemberProfile` per riga, `prune`, toast `k su n`) | ✅ | `page.tsx:438-445`, `set-member-type-drawer.tsx`; nessuna eliminazione di massa (test `bulk-selection-surfaces`) |
| Export PDF/CSV (`exportPeoplePdf`/`exportPeopleCsv`, entita `members`, ambiti) | ✅ | `page.tsx` (`export={{ onExport …}}`) |
| Nuovo socio: `DocumentExtractionField`, `PersonIdentityFields`, Email, `PhoneField`, Tipo, `PersonResidenceFields`, `ClothingSizesFields`, Ammissione (data, delibera, estremi obbligatori, note); `admitNewMember`; nessun numero tessera | ✅ | `member-form.tsx`, `member-form-model.ts` (test `membership-register-ownership`, `anagrafiche-coverage`, `trainer-card`, `lettura-documento-unica` ripuntati) |
| Scheda: tre card (personali, contatti, taglie) + Dati associativi (Numero tessera storico in sola lettura, Data/Scadenza iscrizione, Scheda) + `ClubPersonAccessCard` + Libro soci | ✅ | `[id]/page.tsx:364-381,375` |
| Libro: posizione derivata, «Registra un evento» solo se `canManageMembershipRegister` e transizione possibile (`canApplyMembershipEvent`), storico «Registrato il … a nome di …» | ✅ | `membership-register-section.tsx:34-71`, `membership-event-drawer.tsx` |
| Modifica per sezione (personal · contacts · clothing · membership) → `updateMemberProfile`; «Numero Tessera» morto non piu offerto | ✅ | `member-section-drawer.tsx`; `/soci/[id]/edit` modulo intero |
| Elimina (server rifiuta se nel libro) | ✅ | `delete-member-dialog.tsx:9,38` (`DangerConfirmDialog`) |
| `?clubId=` in entrata e nei link | ✅ | `withClubId(…)` (`page.tsx:429-430`) |
| Permessi | ⚠️ | vedi **D1** |

Esito: **OK** (con D1).

### 2.4 `/structures`, `/structures/[id]`

V1: `src/app/structures/{page,[id]/page}.tsx`, `src/components/structures/Structure*.tsx` (6), `src/components/sites/club-sites-section.tsx` · V2: le due rotte + `src/components/structures/v2/{structure-model.ts,structure-drawer.tsx,sites-drawer.tsx,booking-model.ts,booking-drawer.tsx,bookings-calendar.tsx,rent-payment-drawer.tsx,delete-structure-dialog.tsx,use-structures-club-id.ts}`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| `getClubStructures` + `club_sites`; `saveClubStructures` unica scrittura; sedi con `updateClubData("club_sites")` | ✅ | `page.tsx:125-163`, `sites-drawer.tsx` |
| Elenco: nome, visibilita, indirizzo, campi, prenotazioni, affittabile, tipo; filtro sede solo multi-sede (`SiteContextControl`, `filterStructuresBySite`) | ✅ | `page.tsx:171,412` (test `multisite-ux` ripuntato) |
| Sedi: nome unico («Esiste gia una sede con questo nome»), citta, indirizzo, note, Sede attiva, elimina bloccata se ha strutture (**assente**, non disabilitata) | ✅ | `sites-drawer.tsx:90-167,244` |
| Creazione: Nome (obbligatorio), Indirizzo, Sede, quattro interruttori (pubblica, visibile, **prenotabile dalle famiglie**, affittabile) → poi la scheda | ✅ | `structure-drawer.tsx:185` (test `wave6-superfici-6a` W6-54 ripuntato) |
| Scheda: Informazioni (tipologia, referente, telefono, email, note), Campi (proprieta, in affitto, prenotabile, visibile, fasce per giorno), Tariffe (durata/prezzo), Contratto (canone, frequenza, giorno, inizio/fine, note) + pagamenti (data, descrizione, importo, Pagato/In attesa/Scaduto), Prenotazioni (calendario mese + modulo con campo, titolo, inizio/fine, stato, prenotante, importo, stato pagamento, note; tre validazioni; `hasBookingConflict`), Note | ✅ | `[id]/page.tsx` (`RecordAreaSwitcher`, `:398-645`), `structure-drawer.tsx`, `booking-model.ts:110-151`, `bookings-calendar.tsx`, `rent-payment-drawer.tsx` |
| Fabbrica del campo senza `price: 0` (W6-55) | ✅ | `structure-model.ts` (`export const newField`); `price: 0` resta solo in «Aggiungi tariffa» (`structure-drawer.tsx:588`), come la V1 |
| Elimina struttura: conferma che **nomina** allenamenti e gare che la usano | ⚠️ | `delete-structure-dialog.tsx:45-46` (legge `clubs.trainings`/`clubs.matches` in sola lettura) — piu della V1 |
| `?clubId=` in entrata e in «Torna alle strutture» | ✅ | `use-structures-club-id.ts`, `[id]/page.tsx` |
| Salva unico della scheda (draft) | ⚠️ | ogni sezione salva da se (`saveStructure`, `[id]/page.tsx:140`): chiude il rischio «prenotazione della famiglia sovrascritta» segnalato dall'audit |
| Permessi | ✅ | nessun predicato in V1, nessuno inventato |

Esito: **OK**.

### 2.5 `/registration-management`

V1: `src/app/registration-management/page.tsx` (3.333) · V2: `page.tsx` + `src/components/registration-management/v2/{plan-form-model.ts,payment-plan-drawer.tsx,payment-method-drawer.tsx,discount-drawer.tsx,registration-grids.tsx}`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| Quattro schede Piani · Metodi · Sconti · Voucher e contributi (`FundingProgramsPanel` condiviso) | ✅ | `page.tsx` (`SegmentedControl`, `?tab=` nuovo) |
| Piano: Nome, Descrizione, servizi (nome, tipo, prezzo, descrizione, opzionale, incluso), rate (nome, tipo importo, valore, giorni), pro-rata (abilita, metodo, override, date; frase dinamica con `fallbackPeriod: seasonPeriod`), anteprima, sconti applicabili, note; `generateInstallmentPreview` blocca al primo avviso | ✅ | `payment-plan-drawer.tsx`, `plan-form-model.ts` (test `payment-proration` ripuntato) |
| Metodo (nome obbligatorio, dettagli, attivo) → `saveClubSettings({paymentMethods})`; provider online in sola lettura (`PAYMENT_PROVIDER_ORDER`, `paymentStatusLabel`, «Predisposto», Disponibile) + «Apri Pagamenti» → `/organization?tab=pagamenti` | ✅ | `payment-method-drawer.tsx`, `page.tsx:694` (`router.push` al posto di `window.location.href`) |
| Sconto (titolo, tipo, valore, attivo; «Compila tutti i campi») | ✅ | `discount-drawer.tsx` |
| Cancellazioni piano/metodo/sconto con `useConfirm({tone:"danger", consequences})` | ✅ | `page.tsx:348-352,425-428,487-490` |
| Stagione attiva: solo dichiarata («Gestisci le stagioni» → `?tab=stagioni`) | ✅ | `page.tsx:612` |
| Scheda kit irraggiungibile (duplicato di `/clothing`) rimossa con i quattro caricamenti | ✅ | `getClubAthletes(` sparito dalla pagina (test `iscrizioni-v2-parita`) |
| Permessi | ⚠️ | vedi **D2** |

Esito: **OK** (con D2).

### 2.6 `/sponsors`, `/sponsors/[id]`

V1: `src/app/sponsors/{page,[id]/page}.tsx` · V2: le due rotte + `src/components/sponsors/v2/{sponsor-model.ts,sponsor-drawer.tsx,contract-drawer.tsx,collection-drawer.tsx,collections-grid.tsx,document-drawer.tsx,storno-incasso-dialog.tsx,delete-sponsor-dialog.tsx,use-sponsor-club-id.ts}`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| Anagrafica da `supabase.from("clubs").select("sponsors, settings")`; credito da `fetchSponsorsWithCredit` / `fetchSponsorCredit` (solo con `accounting.read`) | ✅ | `page.tsx:142-188`, `[id]/page.tsx:127-167` |
| Sponsor · Fornitori · Incassi (`?tab=incassi`), ricerca su nome/email/P.IVA, Residuo (Non disponibile · Nessun contratto · importo) | ✅ | `page.tsx:111`, `sponsor-model.ts` |
| Modulo sponsor: Nome*, Tipologia*, Email*, Telefono, P.IVA*, Codice fiscale, PEC, SDI, IBAN, Sede (indirizzo, citta, provincia, CAP, regione, nazione «Italia»); «Compila tutti i campi obbligatori» | ✅ | `sponsor-drawer.tsx` (+ logo, che la V1 nascondeva) |
| Incasso: Sponsor*, Data, Importo*, Descrizione*, Metodo (scelte del club o testo libero) → `recordSponsorCollection` | ✅ | `collection-drawer.tsx:143-221` |
| Scheda: Anagrafica (ruolo, CF, telefoni, email, P.A.), Sede (7 campi), Finanza (Dovuto/Incassato/Residuo mai sommati, periodo, riferimento, note; contratto con notazione italiana e `sanitizeSponsorContract`), Dati finanziari (P.IVA, PEC, SDI, IBAN), Pagamenti, Documenti (titolo, descrizione, nome file) | ✅ | `[id]/page.tsx:478-598`, `contract-drawer.tsx`, `document-drawer.tsx` |
| «Stornato» dichiarato sulla riga + importo barrato | ✅ | `collections-grid.tsx` (`row.reversed`, `line-through`), `MONEY_STATUS.reversed` (test `causali-e-storni-in-superficie`) |
| Storno cablato: `POST /api/v1/payment-transactions/:id {action:"reverse", reason}` | ⚠️ | `storno-incasso-dialog.tsx` — la V1 mostrava un cestino che rispondeva con un toast di rifiuto; ora la regola del dominio ha una porta |
| Elimina sponsor/documento con dialogo | ✅ | `delete-sponsor-dialog.tsx`, `ConfirmDialog` |
| `?clubId=` | ✅ | `use-sponsor-club-id.ts` (la scheda ora ha anche il ripiego sul club attivo) |
| Permessi | ⚠️ | vedi **D3** |

Esito: **OK** (con D3).

### 2.7 `/documenti`

V1: `src/app/documenti/page.tsx`, `src/components/documents/document-review-inbox.tsx` · V2: `page.tsx` + `src/components/documents/v2/{review-queue-model.ts,document-decision-drawer.tsx}`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| `GET /api/v1/document-submissions?view=queue`; decisione `POST …/{submissionId \|\| id}` `{decision, note}` | ✅ | `page.tsx:94-136` |
| Sette pastiglie con conteggio (`REVIEW_QUEUE_FILTERS`, `countReviewQueue`), ricerca (`searchReviewQueue`), Ricarica | ✅ | `page.tsx:347`, viste della griglia |
| Apri (`openClientFileUrl`, mai `<a href>`) · Approva · Rifiuta (`reviewQueueActions`) | ✅ | `review-queue-model.ts`, `page.tsx` |
| Rifiuto = integrazione: «Motivo, obbligatorio» / «Nota, facoltativa», «Il motivo del rifiuto e obbligatorio» | ✅ | `document-decision-drawer.tsx` (test `pp-02-superfici` ripuntato) |
| Cancello `canReview` (`documents.review` + `documents.read_dossier`, `parseCustomRoleValue` con zero chiavi → decide la rotta) | ✅ | `page.tsx:72-84` |
| Stati: caricamento, errore distinto dal vuoto (`state="error"`, `onRetry`), «Motivo» sul rifiutato | ✅ | `page.tsx:235-242,322,368-370` |

Esito: **OK**.

### 2.8 `/modulistica`

V1: `src/app/modulistica/page.tsx` (2.103), `src/components/forms/forms-dashboard.tsx` · V2: `page.tsx` + `src/components/modulistica/v2/{modulistica-model.ts,templates-grid.tsx,catalog-grid.tsx,generated-grid.tsx,online-forms-section.tsx,new-template-drawer.tsx,generate-document-drawer.tsx,filled-preview-drawer.tsx,template-dialogs.tsx,template-editor-view.tsx,template-state.tsx}`. Riusati cosi come sono: `DocumentEditor`, `FormBuilder`, `BulkGenerationDialog`, `SubmissionReviewDialog`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| Cancelli: `canManageDocumentTemplates`, `canReadDocumentTemplates`, `canReadClubForms`; `canOpenPage`; schede ricavate dai permessi (`tabs.push`) | ✅ | `page.tsx:119-121` (test `modulistica-schede-e-stati`) |
| Modelli: stato Bozza/Attivo/Ritirato, versione, «Modifiche non pubblicate», conteggio prodotti; Genera documento / Stampa il modulo vuoto (`canProduceFilled`), Genera per piu atleti (`canGenerateInBulk`), Modifica, Pubblica, Ritira/Riattiva, Elimina (bloccato se ha prodotto: pulsante **assente**) | ✅ | `templates-grid.tsx:210`, `template-dialogs.tsx` (test `modulistica-template-lifecycle`) |
| Lotto a meta: `readStoredBatch`, `pendingSubjects`, Riprendi/Scarta | ✅ | `page.tsx` (test `modulistica-bulk-generation`) |
| Catalogo (solo `canManage`): classe, `editorialOwner`, `lastReviewedAt`, Adotta | ✅ | `catalog-grid.tsx` |
| Moduli online: elenco (archiviati in vista), Da esaminare con filtri stato, Modelli consigliati (`DISTRIBUTABLE_FORM_CATALOG`); Duplica/Archivia/Ripristina/Elimina; Esamina → `SubmissionReviewDialog` | ✅ | `online-forms-section.tsx:89,343-345,448,484,656` |
| Editor: Di chi parla, Pubblica (con `issues[]` → «Ho capito»), versioni pubblicate, `DocumentEditor readOnly={!canManage}` | ✅ | `template-editor-view.tsx` |
| Genera: vuoto (`openBundleWindow` prima dell'`await`, `renderBlankTemplateForPdf`), compilato (`previewFilledDocument` → anteprima con `missing`/`unresolved`/`warnings` → `generateDocuments`) | ✅ | `page.tsx`, `filled-preview-drawer.tsx` (test `document-placeholder-catalog`) |
| Generati: modello, versione, soggetto, data, stato (sei), Apri `?format=html` | ✅ | `generated-grid.tsx` |
| `?action=new` | ✅ | `page.tsx` |
| «Mostra archiviati» (rilettura server) | ⚠️ | letti sempre con `includeArchived: true`, nascosti dalla vista «In uso» (`online-forms-section.tsx:82-89`) |

Esito: **OK** (una `disabled`, vedi V1).

### 2.9 `/consensi`

V1: `src/app/consensi/page.tsx` · V2: `page.tsx` + `src/components/consensi/v2/{consensi-model.ts,consent-drawers.tsx}`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| Tre letture (`?include_retired=1`, `/{id}/records?limit=50`, `/states?subject_kind&subject_id`) e quattro scritture (crea, `/versions {body_text}`, `PATCH {status}`, `/records {…, source:"manual"}`) | ✅ | `page.tsx:170,255` e dintorni |
| Predicati `canReadConsentRecords` / `canManageConsentDefinitions` / `canRecordConsentDecision`; «Accesso negato» senza lettura | ✅ | `page.tsx:84-86` |
| Definisci (chiave normalizzata, titolo, descrizione, «Segnala chi non lo ha dato»; «Chiave e titolo sono obbligatori»), Pubblica testo («Il testo del consenso non puo essere vuoto»), Ritira/Riattiva, Il soggetto (tipo, id, nome, nota), Accetta/Rifiuta/Revoca | ✅ | `consent-drawers.tsx`, `page.tsx` |
| Stati Bozza/Attivo/Ritirato, Accettato/Rifiutato/Revocato/Manca, «versione precedente» | ✅ | `consensi-model.ts` |
| Errore decisioni con Riprova | ✅ | `page.tsx:746-748` (`onRetry`) |
| In piu: conferma su Ritira/Revoca (`useConfirm`) | ⚠️ | `page.tsx:211,243` |

Esito: **OK**.

### 2.10 `/secretariat`

V1: `src/app/secretariat/page.tsx` (2.392) · V2: `page.tsx` + `src/components/secretariat/v2/{secretariat-model.ts,agenda-rail.tsx,secretariat-grids.tsx,appointment-inspector.tsx,new-appointment-drawer.tsx,note-drawer.tsx,opening-hours-panel.tsx,suggest-input.tsx}`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| Sette letture (`listClubAppointments` con `x-active-club-id`, `secretariat_notes`, `opening_hours`, staff, atleti + tutori, allenatori, soci) | ✅ | `page.tsx` (stesso import da `simplified-db`) |
| Orari: sette giorni × mattina/pomeriggio × (inizio, fine, staff per nome) → `updateClubDataArray("opening_hours")` | ✅ | `opening-hours-panel.tsx` (`parseTimeRange`/`buildTimeRange`, `morningStaff`/`afternoonStaff`) |
| Appuntamenti: settimana/giorno, dettaglio con Conferma/Rifiuta/Sposta/Concluso/Assente/Annulla (`actions || []`, `version`), nota della decisione, riprogrammazione con **rilettura completa** | ✅ | `appointment-inspector.tsx`, `page.tsx:295` (test `wave6-superfici-6a` W6-51 e `segreteria-appuntamenti-e-disponibilita`) |
| Nuovo appuntamento: Data (min oggi), Titolo, Orario a slot di 30' dagli orari di apertura, Nominativo con suggerimenti (atleti, tutori, staff, allenatori), Descrizione; `outsideAvailability: true`, `idempotencyKey`, `internalNotes: "Nominativo: …"` | ✅ | `new-appointment-drawer.tsx`, `suggest-input.tsx` |
| Note: contenuto (obbligatorio), scadenza, destinazione (5 tipi), destinatario (obbligatorio per 3 tipi), notifica, giornata intera/orario; forma letterale `` const note = { id: `note-${Date.now()}`, content: `` | ✅ | `note-drawer.tsx`, `page.tsx` (test `pp-03-bacheca-e-compensi-allenatore`) |
| «Configura la disponibilita» → `/appuntamenti` | ✅ | due `href="/appuntamenti"` |
| `?area=`, `?action=new` | ⚠️ | nuovi |
| Permessi | ✅ | nessun predicato (come la V1 e la matrice) |

Esito: **OK** (GAP «Atleta collegato», §4).

### 2.11 `/appuntamenti`

V1: `src/app/appuntamenti/page.tsx` · V2: `page.tsx` + `src/components/appuntamenti/v2/{slot-model.ts,slots-grid.tsx,slot-drawer.tsx}`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| `puoConfigurare = isManagementAccessRole(activeClub?.role)`; senza, nessuna lettura | ✅ | `page.tsx:73` |
| Cinque letture (slot, sedi, staff, allenatori, `appointments/config`); `estraiOperatori` (solo con account) | ✅ | `page.tsx` |
| Come riceviamo: «Le famiglie possono prenotare» (salva subito), avviso `!familyCanRequestAppointment`, motivi con «Le famiglie possono chiederlo», Rimuovi, Aggiungi | ✅ | `page.tsx` (`salvaConfigurazione(` ×4; test `pp-02-superfici`) |
| Fascia: undici chiavi (`siteId, assignedToUserId, weekday, specificDate, startTime, endTime, durationMinutes, validFrom, validUntil, active, notes`), nessuna `capacity`; Disattiva/Riattiva rimanda **tutta** la riga | ✅ | `slot-drawer.tsx`, `page.tsx` (test `segreteria-appuntamenti-e-disponibilita`) |
| Stati Chiusura / Disattivata come spec locali, «Sede rimossa», «Operatore non piu in organico», «solo dal desk» | ✅ | `slot-model.ts:130-145` |
| Elimina fascia: `useConfirm({tone:"danger", consequences})` | ✅ | `page.tsx:226-231` |
| «Gli appuntamenti gia presi si lavorano dalla Segreteria» | ✅ | link `/secretariat` |

Esito: **OK**.

### 2.12 `/communications`, `/communications/bacheca`, `/communications/automazioni`

V1: le tre `page.tsx` · V2: le tre `page.tsx` + `src/components/communications/v2/{communications-nav.tsx,audience-model.ts,audience-picker.tsx,communication-preview.tsx,communication-status.ts,announcement-model.ts,announcement-drawer.tsx,announcement-inspector.tsx,automation-model.ts,automation-rule-panel.tsx}`. `audience-events.ts` resta condiviso.

| Area | Esito | Evidenza |
| --- | --- | --- |
| Massiva: 9 criteri (`CRITERI_OFFERTI`), selezione con i tre testi di vuoto, Oggetto/Messaggio con segnaposto, «Parti da un testo», «Vedi chi raggiungo» (`preview: true`), «Manda a N» (`canSend`, `blockedReason`), «Continua: restano N», `communication_id` in `sessionStorage` (`easygame_communication_id`), esito per destinatario (`sent/skipped/failed`), esclusi con `AUDIENCE_EXCLUSION_LABELS` | ✅ | `page.tsx`, `communication-preview.tsx`, `audience-picker.tsx` (test `communications-event-audience` ripuntato sulla composizione) |
| Bacheca: quattro scaffali con conteggi, `readCount/audienceCount`, `publishAt`; Nuovo avviso (titolo, testo, 6 criteri, esce il/scade il, «Salva come bozza»); Pubblica (`draft`) / Ritira (`current|scheduled`) | ✅ | `bacheca/page.tsx:263-264`, `announcement-drawer.tsx`, `announcement-model.ts:42-44` (predicati **di stato**, non di permesso) |
| Automazioni: cinque regole, Accesa/Spenta, anticipi (`parseOffsets`, `MAX_AUTOMATION_OFFSETS`), pubblico, consegna (disabilitata se `family` come V1), categorie documenti (`SUGGESTED_ATTACHMENT_CATEGORIES`, solo `supportsCategoryFilter`), oggetto, testo, anteprima con `unresolved`, «Predefiniti», Salva per regola, «Esegui adesso» | ✅ | `automazioni/page.tsx`, `automation-rule-panel.tsx:103,152-158` |
| In piu: conferma su invio massivo e su «Esegui adesso» (`useConfirm`), guardia `dirty` | ⚠️ | `page.tsx:188`, `automazioni/page.tsx:101` |
| Permessi | ✅ | nessun predicato in V1 (prefisso admin-only), nessuno inventato |

Esito: **OK**.

### 2.13 `/notifications`

V1: `src/app/notifications/page.tsx` · V2: `page.tsx` + `src/components/notifications/v2/{notification-data.ts,notification-grid.tsx}`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| `simplified_notifications` `.or("user_id.eq.{id},user_id.is.null")`, `created_at desc`, 50 righe, finestra sei giorni, bus `channel("notifications")` | ✅ | `notification-data.ts:82-83` e dintorni |
| Ricerca, Tutte · Non lette · Certificati · Allenamenti · Registrazioni | ✅ | viste della griglia |
| Segna come letta / Segna tutte come lette | ✅ | `page.tsx` |

Esito: **OK**.

### 2.14 `/hub`

V1: `src/app/hub/page.tsx` (607) · V2: `page.tsx` + `src/components/hub/v2/{hub-content.ts,hub-sections.tsx}`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| Marketplace (4), Novita (3), Tutorial (4), FAQ (5), Feedback, Proposte con **tutti i testi** e il link `cedisoft.it/contatti` | ✅ | `hub-content.ts`, `hub-sections.tsx:97,178` |
| «Acquista», «Invia feedback», «Invia proposta» | ❌ dichiarato | GAP (§4): in V1 erano inerti o fingevano un invio |
| Gradiente hero, glass, emoji, «!» | ✅ rimossi | zero occorrenze nei file V2 |

Esito: **OK**.

### 2.15 `/audit`

V1: `src/app/audit/page.tsx` (senza guscio) · V2: `page.tsx` + `src/components/audit/v2/{audit-model.ts,audit-grid.tsx,audit-inspector.tsx}`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| `GET /api/v1/audit?area&outcome&actor_email&resource&from&to&denied&limit=50&offset` | ✅ | `page.tsx:102-118`, `audit-grid.tsx:40-50` (test `wave6-superfici-6g`) |
| 403 → «restricted» con la chiave `audit.read`; errore distinto; pager Precedenti/Successive | ✅ | `page.tsx:79`, `audit-grid.tsx:188` (`AuditPager`) |
| Riga: esito Riuscita/Fallita/Negata, azione, istante, attore + ruolo (`getAccessRoleLabel`), risorsa, ip, metadati (ora nell'ispettore) | ✅ | `audit-grid.tsx:93-160`, `audit-inspector.tsx` |
| Nessun export (la V1 non lo aveva) | ✅ | nessun `export=` sulla griglia |
| Guscio montato (`Sidebar`/`Header`) | ⚠️ | difetto V1 chiuso |

Esito: **OK**.

### 2.16 `/sport-work` (+ `relationships`, `relationships/[id]`, `compensations`, `deadlines`, `obligations`)

V1: sei `page.tsx` sottili + `src/components/sport-work/{SportWorkShell,SportWorkDashboardPanel,RelationshipsPanel,RelationshipDetail,CompensationPlanEditor,PayoutDialog,SportWorkDocumentsPanel,CompensationsPanel,DeadlinesPanel,ObligationsPanel}.tsx` · V2: le sei pagine + `src/components/sport-work/v2/{sport-work-shell.tsx,sport-work-model.ts,sport-work-status.ts,sport-work-forms.ts,use-sport-work-role.ts,relationship-drawer.tsx,plan-section.tsx,plan-drawer.tsx,installments-grid.tsx,payouts-grid.tsx,payout-drawer.tsx,reason-dialog.tsx,position-section.tsx,declaration-drawer.tsx,documents-section.tsx,bonus-drawer.tsx,expense-drawer.tsx,invoice-drawer.tsx}` + `SportWorkStat.tsx` (estratto, condiviso con `PersonCompensationTab`).

| Area | Esito | Evidenza |
| --- | --- | --- |
| Guscio: cinque destinazioni, `?clubId=` propagato, cancello `sport_work.read` | ✅ | `sport-work-shell.tsx:24-78`, `use-sport-work-role.ts:21-32` (test `pp-01-superfici` §L ripuntato) |
| Cruscotto: 12 numeri in tre gruppi, adempimenti prossimi (8), «Aggiorna maturato e agenda» → `POST /scheduler` | ✅ | `page.tsx` (`missingDeclarations`, `expiringContracts`, `peopleOverSocialThreshold`) |
| Rapporti: elenco, ricerca, filtro stato; Nuovo rapporto (persona censita con `SearchableSelect` / nuova con nome, cognome, CF, email, copertura previdenziale; ruolo, tipo con `RELATIONSHIP_TYPE_HINTS`, inizio obbligatorio, fine, importo, periodicita, ore settimanali, note) | ✅ | `relationship-drawer.tsx`, `sport-work-forms.ts` |
| Scheda: transizioni (`listRelationshipTransitions`), blocchi di attivazione, quattro numeri (`summarizePlanProgress`), aree Compensi/Posizione/Registro/Documenti/Anagrafica; Stato RASD **con etichetta** (V1: codice grezzo) | ✅ | `relationships/[id]/page.tsx:190` |
| Piano (`EQUAL_INSTALMENTS`/`MONTHLY`, anteprima `generatePlanItems`, anni solari `splitPlanByScheduledYear`, «Rifai il piano» bloccato con denaro) | ✅ | `plan-drawer.tsx`, `plan-section.tsx` |
| Erogazione: `payouts/prepare` (ricalcolo su data e blur), causali (`operation-types`, solo uscita), `explanation`, `netSocial`/`clubCost`, avvisi hard con presa visione (`acknowledgeWarnings`), `allowOverpayment`, `idempotencyKey`, `duplicate` | ✅ | `payout-drawer.tsx` |
| Storno con motivo · Cessazione con motivo (`window.prompt` → dialogo) | ✅ | `reason-dialog.tsx` («La cessazione richiede un motivo», «Lo storno richiede un motivo») |
| Posizione (anno, progressivo, soglie, drift) + Autocertificazione (`declarations`) | ✅ | `position-section.tsx`, `declaration-drawer.tsx` (le V1 `PersonPositionCard`/`DeclarationDialog` restano per `PersonCompensationTab`) |
| Documenti: categorie rapporto/persona, Allega (CONTRACT → `PATCH {contractAttachmentId, signatureState:"SIGNED"}`), Elimina | ✅ | `documents-section.tsx` |
| Compensi: cinque schede (scadenze, registro, premi, rimborsi con Presenta/Approva/Liquida, fatture P.IVA con Paga), tre moduli | ✅ | `compensations/page.tsx`, `bonus-drawer.tsx`, `expense-drawer.tsx`, `invoice-drawer.tsx` |
| Scadenze: tre gruppi per `daysUntil` + le voci oltre i trenta giorni (difetto V1 chiuso) | ✅ | `deadlines/page.tsx` |
| Adempimenti: Agenda/F24/CU/Storico, Riallinea, Assolto, CSV `f24-{year}.csv` / `cu-{year}.csv` (via `exportGridCsv`, intestazioni italiane) | ✅ | `obligations/page.tsx` |
| Predicati `canManage`/`canPay`/`canFiscal` (stesse quattro chiavi); i pulsanti senza permesso ora **assenti** (V1: visibili con 403) | ✅ | `use-sport-work-role.ts:29-32`, le sei pagine |

Esito: **OK**.

### 2.17 `/organization`

V1: `src/app/organization/page.tsx` (2.700), `payment-methods-config.tsx` (orfano), `src/components/organization/{season-manager,club-signature-panel}.tsx`, `src/components/fiscal/{FiscalProfilePanel,OperationTypesPanel}.tsx`, `src/components/club/capability-gate.tsx` · V2: `page.tsx` + `src/components/organization/v2/{club-model.ts,club-profile-sections.tsx,club-federations-section.tsx,season-manager.tsx,club-signature-panel.tsx,fiscal-profile-panel.tsx,operation-types-panel.tsx,capability-gate.tsx}`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| Autosave per sezione (`AUTOSAVE_SECTIONS`, `blockingRef`, `createCoalescingSaver`, `saveClubProfileSection`, `syncClubIdentityLocally`), un solo `SaveStatus` | ✅ | `page.tsx` (test `club-profile-autosave`) |
| Nove sezioni; `?tab=` con alias `stagione|payments|billing` | ✅ | `club-model.ts:109-116`, `page.tsx:67,330-335` |
| Generale (logo, nome, tipologie multiple con custom, anno, sport con ricerca e custom, indirizzo, `AssistedAddressFields`), Fiscali (`TAX_REGIMES_LIST` + custom, sede legale, rappresentante con `AssistedFiscalCodeField enableCompute={false}`, firma e timbro), Bancari, Contatti (`PhoneField`), Federazione (`ITALIAN_FEDERATIONS`), Social | ✅ | `club-profile-sections.tsx`, `club-federations-section.tsx` (test `anagrafiche-coverage` ripuntato) |
| Stagioni: overview, avviso atleti senza squadra, Nuova stagione a quattro passi (periodo, riporto con tipi/globali/mai riportati, tesserati, riepilogo), Riporta dati con anteprima (`preview: true`), Attiva/Archivia con `ConfirmDialog`, `rememberActiveSeason(season.id, season.label, clubId)` | ✅ | `v2/season-manager.tsx` (test `seasons-tab`, `club-onboarding-season`) |
| Firma: `canManageClubConfigurationAsActor` + `canManage` dalla rotta | ✅ | `v2/club-signature-panel.tsx:55,65` |
| Profilo fiscale (forma, regime, speciali, dieci campi, REA, bollo) · Causali (`permissions.canManage` dalla rotta, classificazione tri-stato, Salva/Disattiva/Elimina con conferma) | ✅ | `v2/fiscal-profile-panel.tsx`, `v2/operation-types-panel.tsx:28` |
| Pagamenti (`CapabilityGate` + `ClubPaymentSettings`) · Account e fatturazione (`ClubBillingSettings readOnly`) | ✅ | `page.tsx:31` (pannelli `src/components/payments/*` riusati) |
| Orfano `payment-methods-config.tsx` rimosso | ✅ | `git diff --stat` (−750), presidiato da `club-v2-parita.test.mjs:195` |

Esito: **OK**.

### 2.18 `/settings`

V1: `src/app/settings/page.tsx` (626) · V2: `page.tsx` + `src/components/settings/v2/{settings-model.ts,settings-sections.tsx}`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| `getClubSettings` → notifiche (4) e sistema (lingua, formato data, backup); `saveClubSettings` per sezione | ✅ | `page.tsx` (`saveNotificationSettings`, `saveSystemSettings`) |
| `document.documentElement.lang`, `app-language`, evento `language-change` | ✅ | `page.tsx:137-138` |
| Ricarica della pagina quando la lingua ≠ `it` | ❌ dichiarato | GAP (§4): nessuna traduzione esiste |
| Scheda Sicurezza (password/PIN finti) | ❌ dichiarato | GAP (§4); la sezione resta come rimando (`settings-sections.tsx:127-137`) |
| Scheletro, `StickyActionBar` con `dirty` | ⚠️ | `page.tsx:157-163` |

Esito: **OK**.

### 2.19 `/dashboard/access-management`

V1: `src/app/dashboard/access-management/page.tsx` (967) · V2: `page.tsx` + `src/components/access-management/v2/{access-model.ts,role-drawer.tsx,role-inspector.tsx,assignment-drawer.tsx,access-dialogs.tsx}`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| `GET /api/v1/club-roles/assignments`; `POST/PATCH/DELETE /club-roles[/{id}]`; `POST /assignments`; `DELETE /assignments/{id}` | ✅ | `page.tsx` |
| `sonoProprietario = isOwnerActor(ruoloAttivo)` → Clona/Nuovo/Modifica/Elimina ruolo **assenti** altrimenti; `roleHasPermission(ruoloAttivo, "audit.read")` → link `/audit` | ✅ | `page.tsx:104-105,470,587` (test `wave6-superfici-6g`) |
| Ruolo: nome, base (`CUSTOM_ROLE_BASE_ROLES`, bloccata in modifica), descrizione, caselle da `listGrantablePermissions` con `isDirectionPermission`; preset Segreteria/Direttore Sportivo con le chiavi verificate | ✅ | `role-drawer.tsx`, `access-model.ts` |
| Assegnazione: ruolo (standard + ruoli attivi del club), sedi, categorie; «Nessuna voce scelta significa tutto il club» | ✅ | `assignment-drawer.tsx:24,152` |
| Revoca / Cancella ruolo con `DangerConfirmDialog`/`ConfirmDialog` | ✅ | `access-dialogs.tsx` |
| Nessun predicato client su assegna/revoca (come V1) | ✅ | — |

Esito: **OK**.

### 2.20 `/permissions`

V1: `src/components/permissions/trainer-permissions-page.tsx` (530) · V2: `src/components/permissions/v2/{trainer-permissions-model.ts,trainer-permissions-page.tsx}`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| `getClubSettings` → `resolveTrainerDashboardPermissions`; `saveClubSettings(buildTrainerDashboardPermissionPayload(...))` | ✅ | `v2/trainer-permissions-page.tsx` |
| 10 + 5 + 10 leve (`NAV_OPTIONS`, `WIDGET_OPTIONS`, `ACTION_OPTIONS`) con le descrizioni; `key: "manageTrainingStatus"` dice «creare» | ✅ | `trainer-permissions-model.ts` (test `permessi-navigazione-allenatore`, `pp-03-calendario-allenatore-raggiungibile`) |
| Tre preset (Sola consultazione, Operativita controllata, Accesso completo) | ✅ | `trainer-permissions-model.ts` |
| Salva, «Nessun club attivo selezionato», scheletro, `StickyActionBar` | ✅ | `v2/trainer-permissions-page.tsx` |
| Nome «Permessi allenatore» = voce della barra | ✅ | `:129,134` (test `pp-01-superfici` §M) |

Esito: **OK**.

### 2.21 `/account`

V1: `src/components/account/{account-home-screen,account-profile-dialog,account-create-club-dialog,account-redeem-access-dialog}.tsx` · V2: `src/components/account/v2/{account-model.ts,account-home-screen.tsx,account-profile-drawer.tsx,account-create-club-drawer.tsx,account-redeem-access-drawer.tsx}`; `create-club-redirect.tsx` aggiornato.

| Area | Esito | Evidenza |
| --- | --- | --- |
| `memberships/activate`, `memberships/delete`, `verify/{channel}/send|confirm` (`RESEND_TOO_SOON`), `password/forgot`, `access/redeem`, `POST /api/v1/clubs`, `supabase.auth.updateUser` | ✅ | `v2/account-home-screen.tsx`, i tre cassetti |
| `?openCreateClub=1`, `?profile=1`; `/create-club` → `/account?openCreateClub=1` | ✅ | `:596,605`; `create-club-redirect.tsx` |
| Due pannelli (proprieta con `clubSlotLimit`, accessi), «Aperto», ruolo, stagione, profili collegati (`data-testid="profili-collegati"`), ricerca ≥5 club, `PanelSkeleton`, `PanelEmptyState`, errore bloccante/non bloccante con Riprova | ✅ | `v2/account-home-screen.tsx` (test `account-onboarding-and-admin`, `profili-collegati-account`, `avvisi-recapito-non-verificato`) |
| Profilo: avatar, nome, cognome, email, cellulare, password attuale/nuova/conferma; «Le password non coincidono»; nessuna credenziale in `localStorage` | ✅ | `v2/account-profile-drawer.tsx` (test `credenziali-fuori-dal-browser`) |
| Crea club: sei schede (`CREATE_CLUB_TABS`), `CREATE_CLUB_REQUIRED_FIELDS` → scheda del primo mancante, `AssistedAddressFields`, `CLUB_TYPE_PRESETS`, `FEDERATION_PRESETS`, dati fiscali/bancari/contatti/social; logo (V1: `hidden`) | ✅ | `v2/account-create-club-drawer.tsx:141` (test `club-create-dialog`) |
| Token: `access-token`, «Inserisci il token condiviso dal club» | ✅ | `v2/account-redeem-access-drawer.tsx` |
| Elimina accesso: `window.confirm` → `ConfirmDialog` | ✅ | `v2/account-home-screen.tsx:80` (solo in commento) |

Esito: **OK**.

### 2.22 `/clothing`

V1: `src/app/clothing/page.tsx` (4.428), `src/components/clothing/kit-delivery-dialog.tsx` · V2: `page.tsx` + `src/components/clothing/v2/{clothing-model.ts,catalog-grids.tsx,inventory-grid.tsx,assignments-grid.tsx,supplier-orders-grid.tsx,numbering-area.tsx,item-drawer.tsx,kit-drawer.tsx,stock-drawer.tsx,group-drawer.tsx,assignment-drawer.tsx,assignment-edit-drawer.tsx,kit-delivery-drawer.tsx,delete-assignment-dialog.tsx}`.

| Area | Esito | Evidenza |
| --- | --- | --- |
| Nove letture via `simplified-db`; scritture `updateClubData` per colonna; creazione via `POST /api/clothing/assignments` | ✅ | `page.tsx` |
| Sei aree Kit · Articoli · Magazzino · Assegnazioni · Ordini fornitore · Numerazioni in `?area=`; `?action=new` | ✅ | `page.tsx:262-271` |
| Kit (nome, descrizione, numerazione, gruppo, componenti; nessuna stagione ne compatibilita) · Articolo (14 campi, `id="item-size-source"`, `requiresNumber` ↔ `numberMode`) · Stock (unita/quantita, 7 stati) | ✅ | `kit-drawer.tsx`, `item-drawer.tsx`, `stock-drawer.tsx` (test `clothing-delivery-ux` ripuntato) |
| Assegnazione: atleta con «Taglie suggerite», origine, tipo, kit/articolo, stato iniziale (disabilitato se fornitore, come V1), gruppo, numero condiviso con occupati, componenti (stock compatibile / taglia-colore-variante-numero), riepilogo; taglia proposta mai scritta in anagrafica | ✅ | `assignment-drawer.tsx` (`proposedSizeByItemId`, `size: sizeDescription.size`) |
| Assegna dallo stock (precompila), Consegne del kit (quattro stati, taglia, quantita, data, note; `getKitDeliveryProgress`; non muove il magazzino), Modifica (atleta, stato, data, note), Cambia stato, Elimina (`DangerConfirmDialog` che conta lo stock liberato) | ✅ | `page.tsx:740,755,805`, `kit-delivery-drawer.tsx`, `assignment-edit-drawer.tsx`, `delete-assignment-dialog.tsx` |
| Ordini fornitore: righe per articolo, filtro fornitore, selezione, PDF completo/selezionati/singolo (`printSupplierOrderPdf`) | ✅ | `supplier-orders-grid.tsx`, `page.tsx` |
| Numerazioni: riepiloghi (`getJerseyGroupSummaries`), numero manuale su blur/Invio («Numero fuori intervallo»), Random («Nessun numero disponibile»), Rimuovi, gruppo (nome, stagione, min/max, categorie, sedi multi-sede, «Includi le categorie compatibili») | ✅ | `numbering-area.tsx:215-221`, `group-drawer.tsx` |
| Predicati `canAccessClubResource(role, "<risorsa>", "update|create")` (quelli del server; V1 nessuno) | ✅ | `page.tsx:112-118` |
| Paginazione «Mostra altri 25» per gruppo | ⚠️ | la griglia degli atleti del gruppo ha la propria paginazione e ricerca (`numbering-area.tsx:337-346`) |

Esito: **OK**.

## 3. REGRESSIONI DA CHIUDERE

Nessuna. Non c'e una capacita V1 persa senza GAP dichiarato. Per completezza, i tre punti che meritano una decisione del lead (non sono regressioni: sono predicati client **aggiunti** dove la V1 non ne aveva; la regola 10 dice «non si inventano», qui sono copiati dal server):

| # | Gravita | Cosa | Dove | V1 (`768ef05`) | Cosa fare |
| --- | --- | --- | --- | --- | --- |
| D1 | Bassa | L'elenco soci nasconde «Aggiungi socio», Modifica/Elimina di riga e le tre azioni di massa a chi non passa `canManageMembershipRegister(role)` (direzione). Un `collaborator`/`staff` prima **vedeva** i pulsanti e riceveva 403 con il messaggio del libro soci | `src/app/soci/page.tsx:81,429-440,499,542`; `src/app/soci/[id]/page.tsx:68,226-227,364-374` | `src/app/soci/page.tsx` (nessun predicato); il predicato esisteva ed era usato solo da `membership-register-panel.tsx:71` | Accettare: e lo stesso modulo (`src/lib/members/permissions.ts`) che il server applica in `updateMemberProfile`/`removeMemberProfile`/`admitNewMember` (audit §7). Verificare a schermo con una segreteria che l'elenco si legga e non mostri comandi |
| D2 | Bassa | `/registration-management` mostra piani, metodi e sconti solo a `canManageClubConfigurationAsActor`; agli altri un `AlertBlock` e i contributi | `src/app/registration-management/page.tsx:193,304,585-645` | nessun predicato: `getClubData` inghiottiva il 403 e la pagina appariva vuota | Accettare: la risorsa `clubs` e in `MANAGEMENT_ADMIN_ONLY_RESOURCES` (`src/lib/access-roles.ts:350-380`) e `collaborator`/`staff` ricevono `false` da `canAccessClubResource` (`:958`). Il cancello dice il perche invece di mostrare un vuoto finto |
| D3 | Bassa | `/sponsors` e la scheda condizionano credito/incassi a `accounting.read`, registrazione e contratto a `accounting.manage`, storno a `accounting.reverse \|\| canManageClubConfigurationAsActor` | `src/app/sponsors/page.tsx:98-111,142,565-693`; `src/app/sponsors/[id]/page.tsx:96-98,127,208-223,354-598` | nessun predicato; «Non disponibile» in ogni Residuo per chi non aveva `accounting.read` | Accettare: le tre chiavi sono quelle delle rotte `/api/v1/sponsorships*` e `/api/v1/payment-transactions/:id` (audit §A.7). Verificare a schermo con `staff` (read+manage, niente reverse): niente «Storna» |

## 4. GAP DICHIARATI (volontari, con motivo)

| Rotta | Cosa manca rispetto alla V1 | Perche e accettabile |
| --- | --- | --- |
| `/matches` | «Invia Promemoria» nelle convocazioni | Solo un toast, nessuna API (D-AUD-W D-5) |
| `/matches` | Toggle «Controllo Conflitti di Programmazione» e «Gestione Campi di Casa» | Erano dentro `{false && …}`: irraggiungibili; il controllo resta sempre attivo (D-AUD-W D-3) |
| `/matches` | Percentuale presenze «0%» nelle statistiche convocazioni | Mai calcolata: ora `—` (D-AUD-W D-4) |
| `/matches` | Emoji e maiuscole nel messaggio di conflitto | Brief: niente emoji; le informazioni restano (`describeScheduleConflicts`) |
| `/structures` | Editor inline di pagamenti/campi (righe 1119–1675 V1) e modale «Aggiungi Pagamento» | Codice morto (`{false ? …}`), audit §1 |
| `/registration-management` | Scheda «kit» senza trigger + quattro letture | Duplicato irraggiungibile di `/clothing` |
| `/registration-management` | Campo «Stato» del pagamento sponsor (Completato/In attesa), «Conto Corrente», «In uscita» | Non inviati al server / ignorati (audit sponsor §A.3, §B.3) |
| `/sponsors` | `isEditMode`/«Salva modifiche» nell'elenco, pulsante Download documento | Irraggiungibile / senza handler (audit §A.13, §B.13) |
| `/secretariat` | «Atleta collegato (opzionale)» nel nuovo appuntamento | Raccolto e mai inviato (`createClubAppointment` non riceve `athleteId`); collegarlo cambierebbe notifiche e perimetro: WP (`new-appointment-drawer.tsx:15`) |
| `/secretariat` | Toast «info» a ogni cambio settimana | Rumore senza informazione |
| `/hub` | «Acquista», «Invia feedback», «Invia proposta» | Inerte / finti (toast senza richiesta); resta il link di contatto (`hub-sections.tsx:91-97,188`) |
| `/settings` | Scheda Sicurezza (password/PIN) e ricarica per lingua ≠ `it` | Nessuna password o PIN veniva cambiato; nessuna traduzione esiste (audit «Difetti V1») |
| `/sport-work/obligations` | Intestazioni CSV = chiavi grezze dell'API | Sostituite dalle etichette italiane della griglia |
| `/sport-work/relationships/[id]` | Stato RASD come codice grezzo | Ora etichetta (`RASD_STATUS_SPEC`) |
| `/organization` | Carosello ‹ › delle schede sotto `md` | Sostituito dal rail/`SegmentedControl` del sistema |
| `/account` | Riquadri informativi `hidden`, immagine hero | Codice nascosto; ambiente 3 senza hero |
| `/clothing` | Tre viste a card `hidden`, «Assegna»/«Rimuovi» disabilitati | Codice morto; regola 13 (assente, non disabilitato) |
| `/modulistica` | «Mostra archiviati» come rilettura server | Letti sempre e nascosti dalla vista (equivalente) |

Capacita **in piu** (da verificare a schermo, non gap): Ripristina gara; `?date=` e vista mese del calendario; scheda socio con `/soci/[id]/edit`; conferma di eliminazione struttura che nomina allenamenti e gare; storno incasso sponsor; conferme su Ritira/Revoca consenso, invio massivo, «Esegui adesso», eliminazione documento/causale/federazione; guardia `dirty` sui cassetti; `?tab=`/`?area=`/`?action=new` su iscrizioni, sponsor, segreteria, modulistica, abbigliamento, lavoro sportivo; risposte RSVP nel cassetto convocazioni; export CSV dalle griglie che lo espongono; guscio sul registro attivita; scheletri.

## 5. Violazioni §10.5 (con file:riga)

Nessuna di gravita media o alta. Zero `window.confirm`/`alert(`/`prompt(`, zero `bg-gradient-to`, zero emoji, zero `!` nei testi, zero `#hex` (l'unico e dentro l'HTML del documento generato, `modulistica-model.ts:233`, che va in un PDF: eccezione dichiarata in KB 10), zero import `@/lib/server/**` dai file client, `localStorage` solo per `activeClub`/logo/lingua (nessuna credenziale). In dettaglio:

| # | Regola | Dove | Cosa | Peso |
| --- | --- | --- | --- | --- |
| V1 | 13 (assente, non disabilitato) | `src/components/modulistica/v2/template-editor-view.tsx:67` | `Select` «Di chi parla» con `disabled={!canManage}`; il resto della schermata e in sola lettura via `readOnly` dell'editor. Preferire un valore in lettura (`DetailCard`) quando `!canManage` | Basso |
| V2 | 14 (ogni elenco e il DataGrid) | `src/app/structures/[id]/page.tsx:492` | `<table>` a mano per le fasce settimanali di un campo (7 righe fisse, dentro `overflow-x-auto`). E una definizione, non un elenco: tollerabile, ma e l'unica `<table>` nelle due ondate | Basso |
| V3 | 2 (un gradiente per schermata) | `src/app/soci/page.tsx:500,543`, `src/app/structures/page.tsx:436,469`, `src/app/sponsors/page.tsx:625,673`, `src/app/secretariat/page.tsx:509-513,616,649`, `src/app/registration-management/page.tsx:589-597,676-779`, `src/app/sport-work/compensations/page.tsx:360-368,453-535`, `src/app/sport-work/relationships/page.tsx:246,277`, `src/app/consensi/page.tsx:575,608`, `src/app/dashboard/access-management/page.tsx:471,574`, `src/app/appuntamenti/page.tsx:291,348`, `src/app/communications/bacheca/page.tsx:302,335` | Quando l'elenco e vuoto compaiono **due** `variant="primary"`: quello della `PageHeader` e quello dell'`EmptyStateCard` (`primary:`). Stesso pattern gia presente nelle Wave A–C (`src/app/staff/page.tsx:568,600`): e delle fondamenta, non di queste ondate. Da decidere una volta (per esempio `variant="secondary"` nello stato vuoto, o nascondere il primario di testata quando l'elenco e vuoto) | Basso, trasversale |
| V4 | 6 (tre livelli di inchiostro) | 22 occorrenze `text-[rgba(11,26,58,.5)]` / `.55` (es. `src/app/consensi/page.tsx:295,446`, `src/components/matches/v2/match-grid.tsx:223`, `src/components/audit/v2/audit-grid.tsx:139`) e bordi `[rgba(37,99,235,.28|.32)]` (`account-home-screen.tsx:192`, `role-drawer.tsx:169`) | Colori scritti in linea invece di un token `egw-*`. Il 50/55 % non e uno dei tre livelli (100/62/42). Precedente nelle fondamenta: `DataGrid.tsx:257,408,482`. Candidato a un token `text-egw-ink-50` o all'uso di `text-egw-ink-62` | Basso, trasversale |
| V5 | 1 / primitive V1 | `src/components/sport-work/SportWorkStat.tsx:4` | File **nuovo** (A) fuori da `v2/` che importa `@/components/ui/card`: e l'estrazione della card V1 per `PersonCompensationTab` (schede persona, non migrate). Corretto per il brief (non si riscrive il condiviso), ma va segnato in [16] come residuo da chiudere con le schede persona | Basso |
| V6 | 13 | `src/app/sport-work/relationships/page.tsx`, `src/app/secretariat/page.tsx:509-513` | `disabled={loading}`/`disabled={saving}` su primari e «Annulla»: sono stati di attesa, non permessi. Conformi | — |

Controlli superati: `grid-cols-7` solo nei calendari (`MonthGrid.tsx:84,91`, `MatchWeekRail.tsx:172,177`, `bookings-calendar.tsx:77`), tutti dentro `overflow-x-auto` o con `min-w-[320px]`; ogni altra griglia `grid-cols-N` ha il breakpoint; `min-w-[760px]`/`[420px]` solo dentro contenitori scorrevoli; le distruttive su record passano da `DangerConfirmDialog` o `useConfirm({tone:"danger", consequences})` (`appuntamenti/page.tsx:226-231`, `registration-management/page.tsx:348-352`, `delete-member-dialog.tsx`, `delete-structure-dialog.tsx`, `delete-sponsor-dialog.tsx`, `delete-assignment-dialog.tsx`, `access-dialogs.tsx`, `template-dialogs.tsx`); i cassetti hanno `dirty` (soci, strutture, modulistica, comunicazioni, abbigliamento, ruoli, impostazioni, permessi, account).

## 6. Codice morto

| Cosa | Stato |
| --- | --- |
| Componenti V1 delle rotte D/E | **Rimossi**: `AddMatchForm`, `MultipleAddMatchForm`, `MatchConvocationsList`, `membership-register-panel`, `ClubPersonDetailHeader`, sei `Structure*Section`/`StructureDetailPage`, `club-sites-section`, `document-review-inbox`, `forms-dashboard`, dieci pannelli `sport-work/*`, `season-manager`, `club-signature-panel`, `FiscalProfilePanel`, `OperationTypesPanel`, `payment-methods-config` (orfano), `trainer-permissions-page`, quattro `account/*`, `kit-delivery-dialog`, `CategoryAthletesDialog`, `notifications-dropdown` (R3 del rapporto A–C) — 27 file, nessun importatore residuo (`grep -rln` su ogni nome) |
| Orfani residui in `src/components/<dominio>/*.tsx` (non-v2) delle due ondate | `src/components/forms/AddTrainerForm.tsx` e `src/components/forms/ChangePlanForm.tsx`: **nessun importatore**, ma erano gia orfani a `768ef05` (fuori dal perimetro D/E; da togliere in un `chore/`) |
| Duplicati V1/V2 vivi in parallelo | Nessuno nelle rotte migrate. Coesistenze **dichiarate** per componenti condivisi con aree non migrate: `MatchConvocations` (trainer) ↔ `ConvocationsDrawer` (club); `PersonPositionCard`+`DeclarationDialog` (schede persona) ↔ `position-section`+`declaration-drawer`; `SportWorkStat` (schede persona) — tutte citate negli audit come «non si riscrive» |
| Import inutilizzati | `eslint --rule @typescript-eslint/no-unused-vars` sui 171 file V2 (34 pagine + 137 componenti): **zero** segnalazioni |
| Residui `ui/*` nei file V2 | Solo `SportWorkStat.tsx:4` (`ui/card`, V5) |
| `getReviewQueueStateClassName` in `src/lib/documents/review-queue.ts` | Non piu usato dalla UI; resta perche esportato e testato dal dominio (audit documenti §13). Da segnare in [16] |

## 7. Test

Copertura: **21 file di parita** per le 22 voci (gare e calendario condividono `tests/ui/wave-d-gare-calendario-parita.test.mjs`), 5.345 righe, 249 `test(`: `abbigliamento`, `account`, `appuntamenti`, `club`, `comunicazioni`, `consensi`, `documenti`, `hub`, `impostazioni`, `iscrizioni`, `lavoro-sportivo`, `modulistica`, `notifiche`, `permessi-allenatore`, `registro-attivita`, `ruoli-e-accessi`, `segreteria`, `soci`, `sponsor`, `strutture` (`tests/ui/*-v2-parita.test.mjs`). Nessuna rotta scoperta.

Test storici ripuntati (`git diff 768ef05 -- tests/ui/<file>`), letti uno per uno. Nessun test svuotato, nessun `skip`/`todo`, nessuna regex allargata a `.*`/`[\s\S]*` (grep sulle righe aggiunte). Intento mantenuto, e in piu casi rafforzato:

| Test | Cosa e cambiato | Intento |
| --- | --- | --- |
| `clothing-delivery-ux` | letture spostate sui sette file `clothing/v2/*`; il divieto di scrivere le taglie in anagrafica ora vale su **tre** file; `compatibleCategoryIds` cercato in quattro | mantenuto, esteso |
| `modulistica-template-lifecycle` | `PAGE` = pagina + nove file V2; `DialogFooter` impilati → «nessun `Dialog` V1»; il menu di riga → `rowLabel` della griglia; «Elimina» bloccato → **assente** (`Non puoi eliminare «`) | mantenuto; cade solo l'asserzione sull'icona `MoreVertical` (ora disegnata dal `DataGrid`) |
| `modulistica-schede-e-stati` | `forms-dashboard` → `online-forms-section`; `LoadFailure`/«Riprova» → `state={gridStateOf(...)}` + `errorMessage` | mantenuto (errore ≠ vuoto, tre valori) |
| `gara-elimina-annulla-canonico` | il «limite noto» (`updateClubData` in `handleEditMatch`) diventa il suo contrario: `updateEvent(eventId, updateData, selectedMatch.version ?? null)`, `doesNotMatch(/updateClubData/)`, «modificato da qualcun altro» | ribaltato nel verso che il test stesso chiedeva |
| `gara-conflitto-disponibilita`, `match-group-ids`, `struttura-consigliata-cross-site-superfici`, `date-only-timezone-shift` | `AddMatchForm` → `MatchFormDrawer` (+ `MultipleMatchesDrawer`); `onBlur={proposeEnd}`, `composeTime`, «una fine gia scritta non si tocca» | mantenuto, esteso |
| `causali-e-storni-in-superficie` | `payment.reversed` + «Stornato» nelle due pagine → `<SponsorCollectionsGrid` in entrambe + `row.reversed`/`line-through` nella griglia + `MONEY_STATUS.reversed` = STORNATO | mantenuto (la parola e del sistema) |
| `payment-reminder-contract` | `max-h-[90vh]` → `Drawer` + `min-h-0 flex-1 overflow-y-auto` nelle fondamenta; `useListSelection`/`BulkSelectionToolbar` → `selectedIds`/`bulkActions` + `canSendReminders ? [` (assente senza permesso) | mantenuto |
| `multisite-ux` | `club-sites-section` → `sites-drawer` (`structureCount > 0 ? null :` = assente); `SiteFilter` **o** `SiteContextControl` + `doesNotMatch(/<select … site/)` | mantenuto, piu stretto |
| `wave6-superfici-6g` | pagina + modello + dialoghi letti insieme; `AlertDialog` → `ConfirmDialog` + `DangerConfirmDialog` + i due dialoghi montati; il predicato `audit.read` cercato **nella pagina** | mantenuto |
| `wave6-superfici-6a` | W6-54 su `structure-drawer.tsx`; W6-55 sulla fabbrica unica `structure-model.ts`; tooltip della barra V2 | mantenuto |
| `responsive-invariants` | +30 file V2 in `TOUCHED`; le `TabsList` di iscrizioni/modulistica → `SegmentedControl … overflow-x-auto`; `/medical` → viste della griglia; intestazioni → `PageHeader`; modulistica **senza** `MobileTopBar` | mantenuto, esteso |
| `membership-register-ownership`, `anagrafiche-coverage`, `bulk-selection-surfaces`, `rc-fix-2-accessibility`, `tesseramento-modifica-e-allegato`, `cancellazione-dati-personali-superficie`, `communications-event-audience`, `forms-builder`, `seasons-tab`, `navigazione-sotto-1024-e-768`, `pp-01-superfici`, `pp-02-superfici`, `permessi-navigazione-allenatore`, `modulistica-bulk-generation`, `categoria-omonima-superfici`, `lettura-documento-unica`, `trainer-card`, `credenziali-fuori-dal-browser`, `account-onboarding-and-admin`, `avvisi-recapito-non-verificato`, `club-create-dialog`, `club-signature-contract`, `topbar-club-vs-platform`, `payment-proration`, `document-placeholder-catalog`, `profili-collegati-account` | ripuntati ai file V2 (elenco `DOPPIA_BARRA_NOTA` ridotto di `modulistica`, `soci`, `structures`; `forms-dashboard.tsx` **deve non esistere**) | mantenuto |

Due allentamenti minimi, da segnalare e basta: `pp-02-superfici` cerca `buildFormFromCatalog(entry).fields` invece di `…fields.map(` e `Usa modello` senza virgolette (la capacita c'e, `online-forms-section.tsx:656`); `seasons-tab` accetta `egw-num|eg-tabular`.

Non eseguiti: `npm test`, `typecheck`, `lint`, `build` (fuori mandato).

## 8. Sintesi

| Voce | Conteggio |
| --- | --- |
| Rotte esaminate | 22 voci (34 `page.tsx`), 171 file V2 (~29.900 righe), 27 file V1 rimossi |
| Regressioni funzionali (capacita V1 perse senza GAP) | **0** |
| Dubbi di perimetro (predicati client aggiunti, coincidenti col server) | 3 (D1 soci, D2 iscrizioni, D3 sponsor) — tutti da accettare, con verifica a schermo per `staff`/`collaborator` |
| GAP dichiarati con motivo valido | 18 (§4) |
| Violazioni §10.5 | 0 medie/alte; 5 basse (V1 una `disabled`, V2 una `<table>` di definizione, V3 doppio primario nello stato vuoto — trasversale e pre-esistente, V4 colori `rgba` in linea — trasversale, V5 `ui/card` in `SportWorkStat`) |
| `window.confirm`/`alert`/`prompt`, `bg-gradient-to`, emoji, `!`, `#hex` nuovi, import server da client, credenziali in `localStorage` | 0 |
| Codice morto | 2 orfani pre-esistenti fuori perimetro (`AddTrainerForm`, `ChangePlanForm`); 0 duplicati V1/V2 nelle rotte migrate; 0 import inutilizzati |
| Test di parita | 21 file / 249 test; 0 test storici indeboliti; 2 regex leggermente piu larghe (senza perdita di intento) |

Per il lead, in ordine: (1) decidere D1–D3 (proposta: accettare, sono i predicati del server) e verificare a schermo con un ruolo `staff` soci, iscrizioni, sponsor; (2) decidere una volta il pattern del doppio primario nello stato vuoto (V3) e i colori `rgba` in linea (V4), entrambi nelle fondamenta; (3) togliere in un `chore/` i due orfani pre-esistenti e annotare in [16] `SportWorkStat` (`ui/card`) e `getReviewQueueStateClassName`.
