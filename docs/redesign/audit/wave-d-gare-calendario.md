# Wave D — Audit di parità: `/matches` (Gare) e `/calendar` (Calendario)

**Scopo.** Inventario funzionale esaustivo della V1 delle rotte `/matches` e
`/calendar` sul branch `feat/web-redesign`, scritto **prima** della migrazione al
Web V2 (brief, Addendum Wave D). È il contratto di parità: niente sparisce. Le
stringhe italiane sono riportate testualmente dal codice.

**Metodo.** Lettura integrale di `src/app/matches/page.tsx` (2.647 righe, letta in
sei blocchi), `src/app/calendar/page.tsx` (449 righe), `src/components/forms/
AddMatchForm.tsx` (782), `src/components/forms/MultipleAddMatchForm.tsx` (426),
`src/components/trainer/MatchConvocations.tsx` (801), `src/components/matches/
MatchConvocationsList.tsx` (172), `src/components/matches/
MatchCertificateWarningBadge.tsx` (66), `src/components/events/
event-rsvp-fields.tsx`, `src/lib/match-location.ts`, `src/lib/
match-certificate-warnings.ts` (firme), `src/lib/matches/match-time-suggestion.ts`,
`src/lib/events/client.ts`, `src/lib/events/model.ts` (colonne, forma storica,
RSVP), `src/lib/server/events.ts` (fusione PATCH, scrittore convocazioni),
`src/app/api/v1/rsvp/route.ts` (parametri), la sezione `/training` dell'audit di
Wave B (convenzioni del dominio eventi) e i test sotto `tests/**` che nominano
questi file.

**Convenzioni del dominio eventi che valgono anche qui** (Wave B §3, ADR-0098,
ADR-0086/0099): l'evento ha **un** scrittore (`src/lib/server/events.ts` via
`/api/v1/events*`); `clubs.matches` è una **proiezione in sola lettura** (ogni
`updateClubData(..., "matches")` è rifiutato dal server con 403); la convocazione è
una colonna di `club_event_participants` con il proprio scrittore
(`saveEventConvocations` → `POST /api/v1/events/:id/participants` `{action:
"convoke"}`), la presenza un'altra, la risposta della famiglia una terza
(`/api/v1/rsvp`); nessuna scrittura incrociata; un evento con righe di
partecipazione **si annulla, non si cancella**; la `version` viaggia per il lock
ottimistico e un 409 dice «modificato da qualcun altro».

---

## 0. Mappa dei file

| Rotta | File pagina | Componenti diretti | Lib diretti |
|---|---|---|---|
| `/matches` | `src/app/matches/page.tsx` | `AddMatchForm` (crea **e** modifica), `MultipleAddMatchForm`, `MatchConvocations` (`src/components/trainer/`, **condiviso** con `trainer-matches-dashboard-page.tsx`), `MatchConvocationsList`, `MatchCertificateWarningBadge` (**condiviso**: `DayRail.tsx`, quattro schermate trainer), `ConfirmDialog` di `ui/dialog`, `EventRsvpFields` (dentro il form) | `events/client.ts` (`createEvent`, `cancelEvent`, `deleteEventIfEmpty`, `listEvents`, `listEventParticipants`, `saveEventConvocations`), `simplified-db.ts` (`getClubData`, `updateClubData`, `getClubAthletes`, `getClubCategories`, `getClubStructures`, `getClubTrainers`, `getClubSettings`, `saveClubSettings`), `category-utils.ts`, `date-only.ts`, `club-sites.ts`, `athlete-category-memberships.ts`, `training-location-options.ts`, `match-location.ts`, `match-certificate-warnings.ts`, `athlete-participation-utils.ts`, `athlete-name-utils.ts`, `categories/display.ts` |
| `/calendar` | `src/app/calendar/page.tsx` | — (solo `ui/*`) | `events/client.ts` (`listEvents`), `simplified-db.ts` (`getClubData`, `getClubStructures`), `club-sites.ts`, `date-only.ts`, `categories/display.ts` |

Guardie: entrambe le rotte hanno `layout.tsx` → `management-area-layout`
(`AccessAreaGuard`); sono in `MANAGEMENT_PATH_PREFIXES` (`access-roles.ts` righe
247 e 269) e nel `middleware.ts`. Ruoli base: owner, club_manager, collaborator,
staff (+ ruoli personalizzati ristretti). Trainer/parent/athlete non le aprono
(usano `/trainer-dashboard`, `/parent-view/[id]/calendar`,
`/athlete-dashboard`).

Chi punta a `/matches`: la barra (`navigation.ts` «Gare»), le azioni rapide
«Nuova gara» → `/matches?action=new` (`navigation.ts` 268, `MobileTopBar` 70,
`mobile-header` 77), il rail «Prossime gare» della Dashboard (`DayRail.tsx`
`href="/matches"`), e il calendario unico («Apri» → `/matches`). A `/calendar`:
la barra («Calendario»), `MobileTopBar`.

---

## 1. `/matches` — Gare e Partite

### 1.1 Dati mostrati

Header: `Header title="Gare e Partite"`; `SharedPageHeader title="Gare e
Partite" subtitle="Organizza e monitora gare, partite e convocazioni."`
(in caricamento: `"Caricamento calendario gare..."`).

**Lettura.** `getClubData(clubId, "matches")` (la proiezione storica) →
`transformedMatches` con `date: new Date(match.date)`, `status:
getEffectiveMatchStatus(...)`, e `convocated_count` preso da
`listEvents({kind:"match", include_cancelled:"1"})` (rotta canonica, `GET
/api/v1/events?kind=match&include_cancelled=1`) indicizzato per `eventId` **e**
`id` — «il conteggio lo fa il server» (P0-6). Poi in sequenza: categorie,
allenatori, `getClubSettings` (→ `matchConvocationDeadlineDays`, clamp 0–30,
default 2), strutture (→ `buildTrainingLocationOptions` → `homeLocations`),
atleti, `club_sites`, `category_groups`. Fallimento: toast `"Errore nel
caricamento dei dati"`.

**Forma della gara** (`interface Match`): `id, title, date (Date), time
("HH:MM - HH:MM" in un solo campo testuale), category, categoryId, opponent,
location, trainers: string[] (nomi), notes?, categoryColor, status, convocationsStatus?
("pending"|"completed"|"none"), convocatedAthletes?, [k]: any` — più le chiavi della
forma storica (`eventId`, `version`, `isHome`, `structureId`, `structureName`,
`fieldId`, `fieldName`, `locationId`, `matchNumber`, `groupIds`, `rsvpRequired`,
`rsvpDeadline`, `capacity`, `siteId`, `convocationEntries`, `convocated_count`).

**Stato derivato** (`getEffectiveMatchStatus`): `cancelled` per
`cancelled|annullata|annullato`; altrimenti `completed` se il confine
(`getMatchBoundaryDate`: il **secondo** orario del campo `time` se c'è, altrimenti
il primo, altrimenti 23:59:59 del giorno) è nel passato, o se lo stato salvato è
`completed|complete|conclusa|concluso|passata`; altrimenti `upcoming`.
Badge (`getStatusBadge`): **"In Programma"** (blu) · **"Conclusa"** (verde) ·
**"Annullata"** (rossa).

**Card gara** («Gare del Giorno», vista card): titolo, badge categoria
(`match.categoryColor`), orario (`Clock`), **"vs {opponent}"** (`Trophy`),
`formatMatchLocationLabel(match)` (`MapPin`: `"{structureName} - {fieldName}"`, o
`location` con `/` → ` - `, o `"Luogo da definire"`), **"Allenatori:
{trainers.join(", ")}"**, note in riquadro grigio se presenti, indicatore
convocazioni (`getConvocationStatusIcon`: `completed` → spunta verde
**"Convocazioni salvate"**, `pending` → orologio ambra **"Convocazioni in
corso"**, altrimenti niente), `MatchCertificateWarningBadge` (ambra, **"{n}
convocati con certificato non valido"** / **"1 convocato con certificato non
valido"**, tooltip con `"{nome}: certificato mancante|scaduto|non valido"`),
badge di stato, badge ambra **"Convocazioni Mancanti"** (`AlertTriangle`) se
`upcoming` e `convocationsStatus === "none"`, **"N. Gara: {matchNumber}"** se
presente.

**Calendario Settimanale** (card): 7 celle lun→dom (`getStartOfWeek`), giorno
con weekday corto + numero, nome mese sulla prima cella, cella di oggi
evidenziata, cella selezionata con anello; per giorno le gare (filtrate per
categoria) come chip **"{ora inizio} - {opponent}"** + categoria + badge
certificati compatto + `FileCheck` verde se `convocationsStatus === "completed"`;
**"Nessuna gara"** in corsivo se vuoto. Click cella → `setDate`.

**Tabella «Tutte le gare»** (vista tabella, `renderMatchesDataGrid`, `<table>`
a mano, `min-w-[980px]`): colonne **N. gara** (`matchNumber` o indice+1), **Data**
(`toLocaleDateString("it-IT")`), **Orario**, **Avversario**, **Luogo**
(`formatMatchLocationLabel`), **Categoria** (badge), **Stato** (badge),
**Convocazioni** (`"{convocatedCount} convocati"` + `"Completate"|"In
corso"|"Mancanti"`), **Certificati** (badge compatto), **Azioni** («Convoca» se
`upcoming`, «Apri»). Riga cliccabile → modifica. Ordinamento: prima le
`upcoming` per data crescente, poi le altre per data decrescente. Vuoto:
**"Nessuna gara trovata"** / **"Cambia filtro categoria o aggiungi una nuova
gara."**

**Prossime Gare** (card): le `upcoming` con data ≥ oggi, filtrate per
categoria, ordinate per data, **prime 5**, stessa card (titolo, data lunga
`weekday day month`, categoria, orario, avversario, luogo, allenatori,
indicatore convocazioni, badge certificati). Vuoto: **"Nessuna gara in
programma"**.

**Storico Gare** (card, `max-h-96` scroll): ricerca **"Cerca gare passate..."**
(su titolo/avversario/categoria) + select categoria; le `completed`, data
decrescente; card con titolo, data lunga con anno, categoria + badge
**"Conclusa"**, orario, avversario, luogo, badge certificati. Vuoto:
**"Nessuna gara nello storico"**.

**Tab «Convocazioni»** («Gestione Convocazioni»): legenda `Attivo` (verde) ·
`Sospeso` (rosso) · `In Prestito` (arancio), select **"Filtra per stato"**
(`Tutti gli atleti` · `Solo attivi` · `Solo sospesi` · `Solo in prestito`,
persistito in `localStorage["matchSettings_athleteStatusFilter"]`, default
`active`), e `MatchConvocationsList` con una tab per categoria
(`categoryDisplay.label`) e tabella **Atleta · Stato · Gare Disputate · Assenze ·
Percentuale Presenze** (barra). **Nota:** `matchesPlayed` e `matchesAbsent` sono
**sempre 0** (hard-coded nella pagina): la percentuale è sempre 0%. Vuoto:
**"Nessuna categoria o atleta registrato"** / **"Aggiungi categorie e atleti per
visualizzare le statistiche"**. Titolo interno **"Statistiche Convocazioni"**.

**Scadenza convocazioni** (card blu, in fondo): **"Scadenza convocazioni"** /
**"Avvisa gli allenatori quando una gara si avvicina e mancano le
convocazioni."**, **"Convocare entro"** `[n]` **"giorni prima"** (input number
0–30) + **"Salva"** (→ `saveClubSettings(clubId, {matchConvocationDeadlineDays})`;
toast **"Impostazioni convocazioni salvate"** / **"Errore nel salvataggio delle
impostazioni gare"**; pulsante **"Salvataggio..."** durante). Una copia identica
della card è renderizzata con `className="hidden"` più in alto (codice morto).

**Codice morto** in pagina: la card **"Impostazioni Gare"** dentro `{false &&
(...)}` (toggle **"Controllo Conflitti di Programmazione"** →
`scheduleConflictsEnabled`, persistito in
`localStorage["matchSettings_scheduleConflicts"]`, default `true`; e **"Gestione
Campi di Casa"** con `homeFields` locali mai salvati); una seconda select
categoria in `div.hidden`; `getMatchDates`, `Calendar` di `ui`, `Home`,
`Switch`, `Checkbox`, `Input` importati e mai/quasi mai usati. **Il flag
`scheduleConflictsEnabled` è ancora letto** da `checkScheduleConflicts`: la UI per
spegnerlo è irraggiungibile, quindi il controllo è di fatto sempre attivo salvo
un valore `false` scritto in passato nel `localStorage`.

### 1.2 Azioni

| Controllo | Effetto | API |
|---|---|---|
| Select categoria (in testa, `"Tutte le categorie"`) | `selectedCategory`: filtra giornata, settimana, tabella, prossime | — |
| **"Nuova Gara"** (blu) | apre `AddMatchForm` | — |
| **"Calendario"** (verde) | apre `MultipleAddMatchForm` («Aggiungi Multiple Gare») | — |
| **"Settimana Precedente"** / **"Oggi"** / **"Settimana Successiva"** | `setDate(±7)` / oggi | — |
| Click cella settimana | `setDate(giorno)` | — |
| Tab **"Gare del Giorno"** / **"Convocazioni"** | cambia pannello | — |
| Toggle **"Card"** / **"Tabella"** | `matchesViewMode` (non persistito) | — |
| **"Convocazioni"** (card, verde) / **"Convoca"** (tabella) — solo se `upcoming` | `handleOpenConvocations`: **rilegge la rosa dalle righe** (`listEventParticipants(match.id)` → `convocation_status === "convocated"` → `rosaConvocata`), poi apre `MatchConvocations`; errore toast **"Errore nel caricamento delle convocazioni"** | `GET /api/v1/events/:id/participants` |
| **"Modifica"** (card, blu, solo `upcoming`) / **"Apri"** (tabella, sempre) / click riga | apre `AddMatchForm` in `editMode` con `initialData` | — |
| Kebab → **"Annulla Gara"** (ambra, solo `upcoming`) | `window.confirm("Sei sicuro di voler annullare questa gara?")` → `handleCancelMatch(eventId\|\|id)` → `cancelEvent(id, version)`; aggiorna `status: "cancelled"` e `version`; toast **"Gara annullata"** / messaggio reale o `GENERIC_MATCH_CANCEL_ERROR` | `PATCH /api/v1/events/:id` `{status:"cancelled", version}` |
| Kebab → **"Elimina"** (rosso, sempre) | `window.confirm("Sei sicuro di voler eliminare questa gara?")` → `handleDeleteMatch` → `deleteEventIfEmpty(id)`; toast **"Gara eliminata con successo"** / messaggio reale o `GENERIC_MATCH_DELETE_ERROR` | `DELETE /api/v1/events/:id` (riesce solo senza righe di partecipazione) |
| Scadenza convocazioni → **"Salva"** | `saveClubSettings` | `PATCH` impostazioni club via `simplified-db` |

**Non esiste «Ripristina»** in V1 per una gara annullata (esiste per gli
allenamenti; `restoreEvent` è nel client eventi).

### 1.3 Moduli

**`AddMatchForm`** (Dialog `max-w-4xl`, titolo **"Aggiungi Nuova Gara"** /
**"Modifica Gara"**). Campi, nell'ordine:
- **Titolo** (`title`, testo, placeholder "Es. Partita Under 14 vs Juventus",
  facoltativo: default `"Partita {categoria} vs {opponent}"` in pagina).
- **Data** (Popover + `Calendar`, `formData.date: Date` a mezzanotte locale,
  default `selectedDate || new Date()`).
- **Orario** (`time`, testo libero, placeholder "Es. 16:30 - 18:00", aiuto
  **"Scrivi solo l'inizio (es. 19:00) e la fine viene proposta in automatico —
  resta modificabile."**): `onBlur` e all'invio `suggerisciIntervalloGara` —
  un solo `HH:MM` diventa `"HH:MM - HH:MM+90'"` (`DURATA_GARA_SUGGERITA_MINUTI`
  = 90, fix `ac8312a`: la fine è **sempre esplicita** nel dato che parte).
- **Gruppi** (`TrainingGroupSelector`, condiviso, `idPrefix="add-match-group"`):
  `groupIds`; le `categoryIds` si **derivano** (`categoryIdsFromGroups`); senza
  `groups` ricade su un gruppo sintetico `group:{categoryId}` per categoria. Se
  non ci sono categorie: **"Nessuna categoria registrata. Crea prima una
  categoria."** (ambra) e Salva disabilitato.
- **Avversario** (`opponent`, obbligatorio, placeholder "Es. Juventus Academy").
- **Sede gara** (`venueMode` select: **"In casa"** / **"Trasferta"**).
- In casa: **Struttura** (select, `"Seleziona struttura..."`, opzioni da
  `resolveRecommendedStructures(structureOptions, selectedGroupSiteId)` con
  suffisso **" · Consigliata (stessa sede)"** e ordinate prima; auto-selezione
  della prima consigliata/prima struttura) e **Campo** (select `"Seleziona
  campo..."`, filtrato per struttura, auto-selezione del primo; `location` =
  `label|name` del campo).
- Trasferta: **Campo / luogo trasferta** (`manualLocation`, testo, placeholder
  "Es. Campo Avversario, Via Roma 123"; `location = manualLocation`).
- **Numero di Gara** (`matchNumber`, testo, placeholder "Es. 12345").
- **Allenatori** (checkbox in riquadro scroll; **"Associato"** sui proposti da
  `getAssociatedTrainerIds(trainers, categoryIds, categoryOptions)`, che si
  aggiungono/rimuovono al cambiare delle categorie tenendo le scelte manuali;
  aiuto **"Gli allenatori collegati alle categorie selezionate vengono proposti
  automaticamente. Puoi modificarli manualmente."**; vuoto **"Nessun allenatore
  disponibile."**).
- `EventRsvpFields` (`idPrefix="add-match"`): **"Chiedi conferma alle
  famiglie"** (checkbox + aiuto "Le famiglie ricevono la convocazione e
  rispondono «ci sono» o «non ci sono». Senza questa spunta l'evento non chiede
  niente a nessuno."), **"Rispondere entro"** (`datetime-local`, disabilitato
  senza spunta), **"Capienza"** (number ≥0, placeholder "Nessun limite"). In
  modifica parte da `fromEventRsvpPayload(initialData)`.
- **Note** (`notes`, textarea, placeholder "Es. Portare divisa da trasferta").
- Footer: **"Annulla"** / **"Aggiungi Gara"** | **"Salva Modifiche"** |
  **"Salvataggio..."**.

Validazione (con `alert()` nativo): nessuna categoria → "Nessuna categoria
registrata. Crea prima una categoria."; nessuna categoria selezionata →
"Seleziona almeno una categoria"; in casa senza struttura/campo → "Seleziona
struttura e campo per la gara in casa"; avversario/luogo/orario mancanti →
"Compila tutti i campi obbligatori". Payload di `onSubmit`: `{...formData, time
(normalizzato), rsvpRequired, rsvpDeadline (ISO), capacity (number|null),
location (risolto), isHome}`. **Il form si chiude solo se `onSubmit` non torna
`false`** (bug UAT «creazione nuova gara fallisce»); in creazione fa il reset,
in modifica no. `handleClose` fa reset + chiude.

**Effetti in pagina — creazione** (`handleAddMatch` → `proceedWithMatchCreation`):
1. `categoryIds` vuoto → toast **"Seleziona almeno una categoria per la gara"**.
2. Se non `away`: conferma cross-site (`isCrossSiteEvent(sedeDelGruppo,
   sedeDellaStruttura)`, sede struttura da `resolveSelectedHomeLocation`) con
   `ConfirmDialog` a promessa (`richiediConferma`): titolo **"La struttura
   appartiene a un'altra sede"**, **"Conferma comunque"**, testo `La categoria e
   a «{sede}», la struttura scelta e a «{sede}». Puoi salvarla lo stesso: e una
   proprieta di questa gara, non cambia la sede della categoria ne sposta
   nessun atleta.`
3. `checkScheduleConflicts` (se abilitato): stesso giorno, non annullate,
   sovrapposizione oraria con durata presunta **3 ore** se manca la fine;
   conflitti per **allenatore in comune** e per **categoria in comune** → dialog
   **"Conflitto di Programmazione"** con messaggio multiriga (`⚠️ CONFLITTI DI
   PROGRAMMAZIONE RILEVATI`, `👨‍🏫 ALLENATORI GIÀ IMPEGNATI:`, `🏆 CATEGORIE
   GIÀ IMPEGNATE:`, `• {titolo} Orario: {time}`, `ℹ️ INFORMAZIONI: ... durata di
   3 ore ... disabilitare questo controllo nelle impostazioni`, `❓ Desideri
   procedere comunque con la creazione della gara?`), **"Procedi Comunque"** /
   **"Annulla"**. **Difetto V1:** annullare non risolve mai la promessa (il
   form resta bloccato in "Salvataggio...").
4. **Una riga per categoria** selezionata: `createEvent("match", {title
   (default "Partita {cat} vs {opponent}"), date: formatLocalDateOnly(date)
   (fix `768ef05`), time, category, categoryId, groupIds (solo i gruppi di
   quella categoria), opponent, location, isHome, structureId, structureName,
   fieldId, fieldName, locationId: fieldId, trainers (nomi), notes, matchNumber,
   categoryColor, status: effettivo, convocationsStatus: "none",
   convocatedAthletes: [], convocationEntries: [], rsvpRequired, rsvpDeadline,
   capacity, siteId})` → `POST /api/v1/events`. Toast **"Gare per {categorie}
   aggiunte con successo"**; errore: messaggio del server se «leggibile»
   (`isReadableBusinessErrorMessage`: ≤300 caratteri, una riga, non un nome di
   eccezione, non uno stack) altrimenti `GENERIC_MATCH_SAVE_ERROR` = "Errore
   nell'aggiunta della gara. Riprova o contatta l'assistenza se il problema
   persiste."

**Effetti in pagina — modifica** (`handleEditMatch`): costruisce
`updatedMatchData` (una sola categoria: `categoryIds[0]`; stessi campi; `status`
ricalcolato; **non** riscrive `groupIds` né i campi RSVP) e poi **scrive la
proiezione** `updateClubData(clubId, "matches", ...)`. **Difetto V1 documentato**
(`tests/ui/gara-elimina-annulla-canonico.test.mjs`, «limite noto»): il server
rifiuta con 403 → in V1 la modifica di una gara **non funziona** (toast
"Errore nella modifica della gara"). Il percorso corretto è `updateEvent(id,
data, version)` (`PATCH /api/v1/events/:id`), come fanno `/training` e
`trainer-event-editor-dialog`.

**`MultipleAddMatchForm`** (Dialog, **"Aggiungi Multiple Gare"**): **Categorie**
(checkbox), **Allenatori** (checkbox), **Note (comuni a tutte le gare)**; N
voci con **Data** (Popover+Calendar), **Orario** (testo "Es. 16:30 - 18:00"),
**Avversario**, **Luogo** (select dei campi di casa `🏠 {nome}` o, se vuoto, input
libero "Es. Campo Avversario, Via Roma 123"), **Numero di Gara**; **"Aggiungi
Partita"**/rimuovi voce; validazione con `alert()` ("Seleziona almeno una
categoria", "Compila tutti i campi obbligatori per la partita {i}"); `onSubmit`
→ per ogni voce `handleAddMatch({title: "Partita vs {opponent}", categoryIds,
trainerIds, notes, opponent, location, date, time, matchNumber})` (senza
`groupIds`/struttura/venueMode: il cross-site non scatta; l'orario **non** passa
da `suggerisciIntervalloGara`), poi toast **"{n} gare aggiunte con successo"**
(prima che le promesse si risolvano).

**`MatchConvocations`** (Dialog `max-w-4xl`, **"Convocazioni"** / "Seleziona gli
atleti convocati per la gara e salva le modifiche."): riquadro con titolo,
**Data:** (lunga), **Orario:**, **Categoria:**, **Avversario:**, **Luogo:**,
**Note gara:** se presenti; **"Atleti convocati ({n} convocati)"**; **"Salva"**
(blu) in modalità modifica, altrimenti **"Modifica"** + **"Invia Promemoria"**
(→ solo toast **"Promemoria inviato agli atleti convocati"**, **nessuna
API**); **"Aggiungi atleta extra"** ("Cerca atleta del club..." su
`clubAthletes`, max 6 suggerimenti, badge partecipazione o "Aggiungi", "Nessun
atleta disponibile con questo filtro."); righe atleta cliccabili con `Checkbox
aria-label="Convoca: {nome}"`, badge partecipazione (`Primaria`/`Secondaria`/
`Extra categoria`), badge ambra **"Attenzione"** + etichetta
`getMedicalCertificateAvailabilityLabel` (certificato mancante/scaduto/in
scadenza) sotto, "Categoria primaria: {nome}" se non primaria, "Gare giocate:
{n}" / "Assenze: {n}" (sempre 0), badge **"Convocato"** (blu) / **"Non
convocato"**. Toast `info` **"Attenzione: {certificato ...}"** alla spunta di un
atleta con certificato non valido. Salvataggio: `onSave({matchId,
convocatedAthletes, convocationEntries[{athleteId, isExtraCategory,
isManualExtra, categoryMembershipType, medicalCertificateAvailability,
medicalCertificateWarning}]})`, poi toast **"Convocazioni salvate con
successo"** e, se ci sono certificati mancanti/scaduti, toast `info` con
`"{nome}: {etichetta}"` uniti da ` • `. Rosa: `athletes` = gruppo operativo
della gara (`readTrainingGroupIds` → `getAthleteGroupIds`) o, senza gruppi, la
categoria (`athleteMatchesAnyCategory` con catalogo, D-INT-2) + gli atleti
salvati fuori rosa; `savedConvocations = rosaConvocata` (righe) con ripiego a
`convocatedAthletes` del payload. **Non mostra** le risposte RSVP delle
famiglie (il riepilogo `TrainingRsvpSummary` esiste solo nell'appello
allenamento; `GET /api/v1/rsvp?training_id=` accetta l'id di qualunque evento).

**Salvataggio convocazioni in pagina** (`handleSaveConvocations`):
`saveEventConvocations(matchId, entries.map → {athleteId, status:
"convocated", isExtraCategory})` → `POST /api/v1/events/:id/participants
{action:"convoke"}`; aggiorna `rosaConvocata`, `convocated_count`,
`convocationsStatus: "completed"`; toast **"Convocazioni salvate
correttamente"** / **"Errore nel salvataggio delle convocazioni"**. Il server
segna `convocation_status: "completed"` sull'evento e incrementa `version`.

### 1.4 Filtri, ricerca, ordinamento, viste

- Filtro categoria globale (`matchMatchesSelectedCategory`: `categoryId ===`,
  o nome/id uguali a `match.category`).
- Storico: ricerca testuale + categoria propria.
- Tab Convocazioni: filtro stato atleta (persistito).
- Vista card/tabella (non persistita). Nessuna preferenza `egw.*`.
- Ordinamento tabella: upcoming per data asc, poi passate per data desc.
- Query param: solo `?action=new` (letto da `window.location.search`, apre il
  form, rimosso con `history.replaceState`). **Nessun `?date=`**, nessun
  `matchId`/`focus`.

### 1.5 Azioni di massa

Nessuna selezione multipla. La sola «massa» è la creazione multipla
(`MultipleAddMatchForm`).

### 1.6 Esportazioni e importazioni

Nessuna. Nessun CSV/PDF/stampa.

### 1.7 Permessi

- Rotta: `management-area-layout` (`MANAGEMENT_ROLES`: owner, club_manager,
  collaborator, staff + ruoli personalizzati derivati), perimetro sede/categoria
  applicato **dal server**.
- Client: nessun `can…` esplicito. Le azioni sono condizionate solo dallo stato
  derivato (`canManageMatch = status === "upcoming"` per Convocazioni/Modifica/
  Annulla; Elimina e «Apri» sempre).
- Server: `events.read`/`events.manage` in `src/lib/server/events.ts`; la
  convocazione richiede il permesso del dominio (audit
  `eventConvocationsSaved`); `rsvp.read` per il riepilogo; ogni rifiuto contiene
  `Accesso negato` → 403.

### 1.8 Stati (testo)

- Caricamento: sottotitolo **"Caricamento calendario gare..."**; nessuno
  scheletro.
- Vuoto giornata: **"Nessuna gara programmata per questa data"** / **"Seleziona
  un'altra data o aggiungi una nuova gara"**; settimana: **"Nessuna gara"**;
  tabella: **"Nessuna gara trovata"**; prossime: **"Nessuna gara in
  programma"**; storico: **"Nessuna gara nello storico"**; convocazioni:
  **"Nessuna categoria o atleta registrato"**.
- Errore caricamento: toast **"Errore nel caricamento dei dati"**.
- Stati gara: **In Programma** · **Conclusa** · **Annullata**; convocazioni:
  **Convocazioni salvate** · **Convocazioni in corso** · **Convocazioni
  Mancanti**; tabella: **Completate** · **In corso** · **Mancanti**.
- Conflitto ottimistico: non gestito (nessun `loadData` su «modificato da
  qualcun altro»; il `version` viaggia solo su annulla).

### 1.9 Flussi distruttivi

| Azione | Conferma V1 | Reversibile |
|---|---|---|
| Annulla gara | `window.confirm` nativo | sì (server: `restoreEvent`), ma **nessun pulsante** in V1 |
| Elimina | `window.confirm` nativo | no; il server rifiuta se ha righe |
| Conflitto di programmazione | `ConfirmDialog` di `ui` (promessa non risolta su annulla) | — |
| Cross-site | `ConfirmDialog` di `ui` a promessa | — |

### 1.10 Navigazione e parametri

- Entrata: `/matches`, `/matches?action=new`. Nessun link in uscita dalla pagina
  (oltre al guscio).

### 1.11 Schede e sezioni

Una pagina sola: testata → filtro categoria + 2 pulsanti → Calendario
Settimanale → Tabs (Gare del Giorno [toggle Card/Tabella → Gare del {giorno} +
Prossime Gare + Storico Gare | Tutte le gare] · Convocazioni) → Scadenza
convocazioni. Nessuna scheda di dettaglio gara (`/matches/[id]` non esiste).

### 1.12 Test collegati

- `tests/server/convocazioni-rilettura.test.mjs` — `matches/page.tsx` contiene
  `listEventParticipants(` e `rosaConvocata`; `handleSaveConvocations` usa
  `saveEventConvocations(` e non `updateClubData(activeClub.id, "matches"`.
- `tests/ui/gara-elimina-annulla-canonico.test.mjs` — import di `cancelEvent`
  e `deleteEventIfEmpty`; corpi di `handleDeleteMatch`/`handleCancelMatch`
  (`deleteEventIfEmpty(matchId)`, `cancelEvent(matchId,`, niente
  `updateClubData`, `getReadableMatchErrorMessage(error, GENERIC_…)`); **"limite
  noto"**: asserisce che `handleEditMatch` scriva ancora
  `updateClubData(activeClub.id, "matches", updatedMatches)` e chiede di
  aggiornare il test quando viene migrato.
- `tests/ui/gara-conflitto-disponibilita.test.mjs` — `AddMatchForm` importa
  `match-time-suggestion`, `onBlur` con `suggerisciIntervalloGara(prev.time)`,
  `const time = suggerisciIntervalloGara(formData.time)` prima di `await
  onSubmit(` e `time,` nel payload; `proceedWithMatchCreation` usa
  `getReadableMatchErrorMessage(error)` nel catch.
- `tests/ui/match-group-ids.test.mjs` — `AddMatchForm` usa
  `TrainingGroupSelector`, `groupIds: [] as string[]`,
  `categoryIdsFromGroups(groupOptions, groupIds)`, niente
  `handleCategoryChange`; la pagina manda `groupIds: groupIdsForThisCategory` e
  passa `groups={matchGroupOptions}`.
- `tests/ui/date-only-timezone-shift.test.mjs` — la pagina importa
  `formatLocalDateOnly` e usa `formatLocalDateOnly(matchData.date)`, mai
  `matchData.date.toISOString()`; `calendar/page.tsx` usa
  `todayLocalDateOnly()` e `formatLocalDateOnly(`.
- `tests/ui/struttura-consigliata-cross-site-superfici.test.mjs` — `AddMatchForm`
  usa `resolveRecommendedStructures`; la pagina richiede la conferma cross-site
  non per le trasferte; nessun import di `src/lib/server/**`.
- `tests/ui/categoria-omonima-superfici.test.mjs` — la pagina usa
  `categoryDisplay.label(` e `buildCategoryGroups({`; il calendario usa
  `categoryDisplay.label(voce.id)` e `groups: gruppi`.
- `tests/ui/responsive-invariants.test.mjs` (riga 516) — legge la pagina gare
  per un invariante responsive.
- `tests/ui/bacheca-allenatore-impegni.test.mjs` — `MatchConvocations.tsx`
  contiene `Convoca: ` (componente condiviso col trainer: **non si tocca**).
- `tests/ui/pp-03-calendario-allenatore-raggiungibile.test.mjs` — cita
  `AddMatchForm` in commento.
- `tests/server/gara-elimina-annulla-canonico.test.mjs`,
  `tests/server/gara-orario-intervallo-singolo.test.mjs`,
  `tests/server/date-only-timezone-shift.test.mjs`, `tests/lib/date-only.test.mjs`
  — test di dominio, citano la pagina solo nei commenti.

### 1.13 Inventario componenti

| Componente | Uso | Condiviso? |
|---|---|---|
| `AddMatchForm` | crea/modifica | no (solo `/matches`) → sostituibile |
| `MultipleAddMatchForm` | creazione multipla | no → sostituibile |
| `MatchConvocations` | convocazioni | **sì** (`trainer-matches-dashboard-page`) → non si riscrive; la pagina V2 ne monta una forma V2 propria con lo stesso contratto |
| `MatchConvocationsList` | statistiche per categoria | no → sostituibile |
| `MatchCertificateWarningBadge` | avviso certificati | **sì** (DayRail, trainer) → si riusa |
| `EventRsvpFields` | RSVP nel form | **sì** (allenamenti, trainer) → si riusa o si ricompone con gli stessi convertitori |
| `TrainingGroupSelector` | gruppi | **sì** → si riusa |
| `ui/*` (Card, Badge, Tabs, Select, Dialog, Calendar, DropdownMenu, Switch, Checkbox, Input) | chrome V1 | da rimuovere dalla pagina |

---

## 2. `/calendar` — Calendario unico

### 2.1 Dati mostrati

`Header title="Calendario"`; `SharedPageHeader title="Calendario"
subtitle="Allenamenti e gare insieme, con i filtri che servono a leggere una
settimana."`. Lettura: `listEvents({kind: tipo, from: "{da}T00:00:00.000Z", to:
"{a}T23:59:59.999Z", include_cancelled: "1"})` (`GET /api/v1/events`),
`getClubData("categories")`, `getClubData("club_sites")`, `getClubStructures`
(caricate e **ignorate**, `void strutture`), `getClubData("category_groups")` →
`buildCategoryGroups`. Ricarica a ogni cambio di `tipo`/`da`/`a`. Errore: toast
`errore.message || "Impossibile caricare il calendario"`.

Elenco raggruppato per giorno (`perGiorno`, ordinato; righe per `time`):
intestazione **`{weekday} {dd} {month} {yyyy}`** (`formattaGiorno`, UTC), card
per evento con icona `Trophy` (ambra, gara) / `Users` (blu, allenamento),
titolo (`title` o **"Gara contro {opponent|avversario}"** / **"Allenamento"**),
riga `"{time}–{end_time} · {category} · {sede} · {location}"`, badge
**"Conferma richiesta"** (viola) se `rsvpRequired`, **"Capienza {n}"** se
`capacity`, badge stato (`etichettaStato`: `cancelled` → **"Annullato"**
rosso, `completed` → **"Concluso"**, `archived` → **"Archiviato"** ambra,
altrimenti **"In programma"** verde) e pulsante **"Apri"** → `Link` a
`/matches` o `/training` (**senza** parametri: non apre l'evento).

### 2.2 Azioni

Solo i filtri e «Apri». Nessuna creazione, modifica, annullamento.

### 2.3 Moduli

Nessuno.

### 2.4 Filtri e viste

Card filtri (6 colonne): **Dal** (date, default `todayLocalDateOnly()`), **Al**
(date, default oggi+30 via `formatLocalDateOnly`), **Tipo** (`Tutto` ·
`Allenamenti` · `Gare` → parametro `kind` server), **Sede** (`Tutte le sedi` +
sedi, client su `siteId`), **Categoria** (`Tutte` + `categoryDisplay.label`,
client su `categoryId` o `category`), **Gruppo** (`Tutti` + gruppi, client su
`groupIds`). Nessun ordinamento configurabile, nessuna ricerca, nessuna vista
salvata, **nessun `?date=`** né altro query param. Nessuna griglia mensile.

### 2.5 Azioni di massa — nessuna. 2.6 Esportazioni — nessuna.

### 2.7 Permessi

Rotta in `MANAGEMENT_PATH_PREFIXES` (`/calendar`, riga 247) con
`management-area-layout`. Il perimetro per sede/categoria e il `kind` li applica
`listClubEvents` sul server.

### 2.8 Stati

- Caricamento: **"Caricamento del calendario…"**.
- Vuoto: **"Nessun evento nell'intervallo scelto con questi filtri."** +
  **"Vai agli allenamenti"** / **"Vai alle gare"**.
- Stati riga: **Annullato** · **Concluso** · **Archiviato** · **In programma**.

### 2.9 Flussi distruttivi — nessuno.

### 2.10 Navigazione

Entrata `/calendar` (barra, `MobileTopBar`). Uscita: `/training`, `/matches`.

### 2.11 Schede — una sezione sola (filtri + elenco).

### 2.12 Test collegati

- `tests/ui/date-only-timezone-shift.test.mjs` (`todayLocalDateOnly()`,
  `formatLocalDateOnly(`, niente `new Date().toISOString().slice(0, 10)`).
- `tests/ui/categoria-omonima-superfici.test.mjs`
  (`categoryDisplay.label(voce.id)`, `groups: gruppi`).

### 2.13 Inventario componenti

Solo `ui/*` (Card, Badge, Button, Label) e `lucide`. Nessun componente di dominio.

---

## 3. Decisioni di migrazione registrate (D-AUD-Wave D)

- **D-AUD-W D-1** — La modifica di una gara passa a `updateEvent(id, data,
  version)` (`PATCH /api/v1/events/:id`): la V1 scriveva una proiezione che il
  server rifiuta (403), cioè non funzionava. Il test «limite noto» viene
  aggiornato nel verso che esso stesso indica. I campi RSVP e i `groupIds`
  entrano nella modifica (la V1 li perdeva).
- **D-AUD-W D-2** — `Ripristina` per una gara annullata: il dominio lo offre
  (`restoreEvent`), `/training` lo ha; la V2 lo espone con la stessa
  `ConfirmDialog` della seduta. Non allenta alcun permesso (stesso `PATCH`).
- **D-AUD-W D-3** — Il controllo conflitti (allenatore/categoria, 3 ore) resta
  sempre attivo: il toggle per spegnerlo era codice morto (`{false && …}`). Il
  messaggio perde emoji e maiuscole (brief: niente emoji), non le informazioni.
- **D-AUD-W D-4** — Le «statistiche convocazioni» (sempre 0/0/0% in V1) restano
  come elenco della rosa convocabile per categoria con il filtro di stato;
  i numeri mai calcolati si mostrano come `—`, non come uno zero finto.
- **D-AUD-W D-5** — «Invia Promemoria» (solo toast, nessuna API) **non** viene
  ricostruito: un pulsante che finge un invio è un difetto, non una capacità.
  Segnalato come GAP consapevole nel rapporto.
- **D-AUD-W D-6** — `/calendar` acquista `?date=` (mese/giorno di partenza) e
  una vista mensile; i filtri e la lettura restano identici. «Apri» porta a
  `/matches?date=YYYY-MM-DD` e `/training?date=YYYY-MM-DD` (parametro che
  `/training` legge già).
