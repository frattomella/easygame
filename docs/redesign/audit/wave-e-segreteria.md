# Wave E — Audit di parità: Segreteria

> Inventario funzionale dell'implementazione V1 sul branch `feat/web-redesign`,
> scritto **prima** della migrazione al Web V2 (Addendum del brief). È il
> contratto di parità: niente sparisce. Nessuna proposta di design.
>
> Rotta coperta: `/secretariat` (`src/app/secretariat/page.tsx`, 2392 righe,
> tutto inline: nessun componente specifico in `src/components/`). Il
> trasporto `src/lib/api/appointments-client.ts` (condiviso con l'area
> allenatore), `src/lib/reminder-targeting.ts` (condiviso con la bacheca
> dell'allenatore e la Dashboard), `src/lib/simplified-db.ts` per
> `secretariat_notes` e `opening_hours`; il servizio
> `src/lib/server/appointments.ts` letto solo per capire **cosa il server
> accetta e rifiuta**; i test collegati.
>
> Metodo: lettura integrale della pagina, del trasporto, del modello
> `src/lib/appointments/{model,projection,config}.ts`, del catalogo dei
> permessi; grep sui test.

---

## Indice

1. [Dati mostrati](#1-dati-mostrati)
2. [Azioni](#2-azioni)
3. [Moduli](#3-moduli)
4. [Filtri e viste](#4-filtri-e-viste)
5. [Azioni di massa](#5-azioni-di-massa)
6. [Esportazioni e importazioni](#6-esportazioni-e-importazioni)
7. [Permessi](#7-permessi)
8. [Stati](#8-stati)
9. [Flussi distruttivi](#9-flussi-distruttivi)
10. [Navigazione e parametri](#10-navigazione-e-parametri)
11. [Schede e sezioni](#11-schede-e-sezioni)
12. [Test collegati](#12-test-collegati)
13. [Inventario componenti](#13-inventario-componenti)
14. [Cosa non esiste in V1 e difetti trovati](#14-cosa-non-esiste-in-v1-e-difetti-trovati)
15. [Sintesi](#15-sintesi)

---

## Guscio e caricamento

`Sidebar` + `Header title="Segreteria"` + `DashboardPageContainer`,
`SharedPageHeader title="Segreteria" subtitle="Gestisci comunicazioni,
documenti e attività di segreteria."` (piu un blocco `hidden` con il vecchio
titolo in gradiente). Layout `bg-gray-50 dark:bg-gray-900`.

Caricamento in un solo `useEffect` su `user && activeClub`, sette letture in
`Promise.all`:

| Lettura | Sorgente | Uso |
|---|---|---|
| `listClubAppointments({ "x-active-club-id": clubId })` | `GET /api/v1/appointments` | coda appuntamenti (proiezione `toClubAppointment`, `date`/`time` gia nel fuso del club: **non** si riconvertono) |
| `getClubData(clubId, "secretariat_notes")` | `clubs.secretariat_notes` (via `readClubFields`) | note e promemoria |
| `getClubData(clubId, "opening_hours")` | `clubs.opening_hours` (array con **un** elemento) | orari di apertura |
| `getClubStaff(clubId)` | `clubs.staff_members` | operatori per gli orari, destinatari `staff_member`, nominativi |
| `getClubAthletes(clubId)` | atleti | nominativi (atleta + i suoi `data.guardians[]`), «Atleta collegato» |
| `getClubTrainers(clubId)` | allenatori | destinatari `trainer`, nominativi |
| `getClubData(clubId, "members")` | `clubs.members` | destinatari `member` |

Normalizzazioni: note → `date = new Date(note.date)`, `expiryDate = new
Date(...)|undefined`, `notificationEnabled || false`, `isAllDay !== false`,
`notificationTime || ""`, `targetType = note.targetType || note.target_type ||
"club_dashboard"`, `targetId` e `targetLabel` dalle grafie storiche
(`trainerId`, `staffMemberId`, `memberId`, `trainerName`…). Staff →
`{id, name || "Nome non disponibile"}`. Atleti → `{id, label = first_name +
last_name, guardians}`, scartati senza id o nome. Allenatori → `{id, label =
name || firstName+lastName}`. Soci → `{id, label = fullName || name ||
firstName+lastName}`. Nominativi (`personOptions`) = atleti (`athlete-{id}`,
con `athleteLabel`) + tutori (`guardian-{athleteId}-{guardianId|index}`, label
`name surname`, `athleteLabel`) + staff (`staff-{id}`) + allenatori
(`trainer-{id}`), **deduplicati per etichetta** (case-insensitive, vince il
primo). `openingHours = openingHoursData[0]` se esiste.

Errore di caricamento: `console.error` + toast `"Errore nel caricamento dei
dati della segreteria"`; la pagina resta con i dati vuoti. Stato loading:
testo `"Caricamento dati segreteria..."` sotto l'intestazione.

`date` (giorno della coda) e `appointmentDate` (data del nuovo appuntamento)
si inizializzano a `new Date()` in un secondo effetto (evita mismatch di
idratazione).

## 1. Dati mostrati

### Scheda «Orari di Apertura» (default)

Card «Orari di Apertura Segreteria»: sette righe (Lunedì … Domenica), ognuna
con **Mattina** (ora inizio, ora fine, `select` staff) e **Pomeriggio**
(idem). I valori vivono in `openingHours[day] = { morning: "HH:MM-HH:MM",
afternoon: "HH:MM-HH:MM", morningStaff: "<nome>", afternoonStaff: "<nome>" }`
(`parseTimeRange` / `buildTimeRange`). Lo staff si salva **per nome**, non
per id. Griglia `grid-cols-3` **senza breakpoint** (a 375 px trabocca).

### Scheda «Appuntamenti»

- Blocco informativo: «Quando la societa riceve — giorni, orari, durata del
  colloquio, sede e operatore — si dichiara nella disponibilita. Senza fasce
  dichiarate si ricade sull'orario di apertura.» + pulsante **Configura la
  disponibilita** → `/appuntamenti` (test `segreteria-appuntamenti-e-
  disponibilita` pretende `href="/appuntamenti"` nella pagina).
- Card «Appuntamenti del {date: weekday long, day, month long, year}».
- «Calendario Settimanale»: `‹ Settimana precedente` / mese-anno **di oggi**
  (non della settimana mostrata: difetto) / `Settimana successiva ›`; i due
  pulsanti spostano `date` di ±7 giorni e mostrano un toast `info`
  («Settimana precedente» / «Settimana successiva»). Griglia 7 colonne
  (`<style>` inline: `.column-calendar`, 80px min su mobile con scroll
  orizzontale) lunedì→domenica calcolata da `date` (`getDay()` con lunedì =
  1; **la domenica cade nella settimana successiva**: `getDate() - getDay() +
  1` con `getDay() = 0` → martedi… difetto). Intestazione «{gg short}:
  {numero}»; in ogni cella un chip blu per appuntamento (`{time} — {title}`),
  clic → apre il dialogo di dettaglio (azzerando `nuovaData`, `nuovaOra`,
  `decisione`).
- Modulo «nuovo appuntamento» (vedi §3).
- Sotto una riga: elenco degli appuntamenti del giorno `date`
  (`filteredAppointments`: confronto giorno/mese/anno di `new Date(app.date)`)
  — per ciascuno `title`, «Orario: {time}», `status_label`, `notes`; icona
  cestino → **annulla** (`cancel`) senza conferma e senza guardare
  `actions` (su una riga chiusa il server rifiuta e il messaggio va a toast).
  Vuoto: «Nessun appuntamento per questa data».
- **Non c'e modo di scegliere un giorno diverso da «oggi ± 7n»**: la lista
  del giorno segue solo la navigazione a settimane.

### Dialogo «Dettagli Appuntamento» (`Dialog`)

Titolo `title || "Dettagli Appuntamento"`. Griglia `grid-cols-2` (senza
breakpoint): **Data** (`new Date(date)` in it-IT lungo), **Orario** (`time`).
Poi **Stato** (`status_label`), **Motivo** (`notes`, se presente — etichetta
impropria: il motivo e `reason`/`title`), **Nota della decisione**
(`decision_note`, se presente). Se `actions.length > 0`: campo **Nota**
(`Textarea` rows 2, placeholder «Il motivo, se rifiuti o annulli: la famiglia
lo legge») + riga «Su «Concluso» e «Assente» la nota resta interna: la
famiglia non la vede e non riceve nessun avviso.» Se `actions` include
`reschedule`: blocco «Sposta l'appuntamento» con **Nuovo giorno** (`date`),
**Nuovo orario** (`time`), riga «L'orario deve cadere su uno slot libero:
configura le fasce dalla disponibilita appuntamenti» (link `/appuntamenti`),
pulsante **Conferma lo spostamento** (disabilitato se `decidendo || !nuovaData
|| !nuovaOra`). Piede (`flex-wrap`): **Conferma** (se `actions` ∋ `confirm`,
primario), **Rifiuta** (`reject`), **Concluso** (`complete`), **Assente**
(`no-show`), **Annulla l'appuntamento** (`cancel`, chiude il dialogo subito),
**Chiudi**. Ogni pulsante di decisione e `disabled={decidendo}`.

`internal_notes` (dove la creazione dal desk scrive «Nominativo: …») **non e
mostrato da nessuna parte**.

### Scheda «Note e Promemoria»

Card «Note e Promemoria»: modulo di creazione (§3) e sotto l'elenco delle note
(ordine di inserimento). Per ogni nota in lettura: `content`
(`whitespace-pre-wrap`), «Creata: {date}» (`formatDate`: `d MMM yyyy`),
`getReminderTargetSummary(note)` («Promemoria interno dashboard club» /
«Destinatari: tutti gli allenatori» / «Destinatario: {label|allenatore
specifico|membro staff|socio}»), «Scade: {expiryDate}{ alle HH:MM se
!isAllDay && notificationTime}» (ambra), «🔔 Notifica attiva» (blu) se
`notificationEnabled`. Azioni: matita → modifica inline, cestino → elimina
senza conferma. Vuoto: «Nessuna nota presente».

## 2. Azioni

| Dove | Azione | Effetto |
|---|---|---|
| Orari | **Salva Orari** | `updateClubDataArray(clubId, "opening_hours", [openingHours])` → toast «Orari di apertura salvati con successo» / «Errore nel salvare gli orari di apertura» |
| Appuntamenti | **Configura la disponibilita** | link `/appuntamenti` |
| Appuntamenti | Settimana precedente / successiva | `date ± 7` + toast info |
| Appuntamenti | clic su chip nel calendario | apre il dialogo di dettaglio |
| Appuntamenti | **Aggiungi Appuntamento** | `createClubAppointment` (§3) |
| Appuntamenti | cestino nella lista del giorno | `cancelClubAppointment(id, {note: decisione, version})` → toast «Appuntamento annullato: la famiglia lo vedra»; la riga resta con stato `cancelled_by_club` |
| Dialogo | **Conferma** / **Rifiuta** | `confirmClubAppointment` / `rejectClubAppointment(id, {note, version})` → riga sostituita, `selectedAppointment` aggiornato, `decisione` azzerata, toast «Appuntamento confermato: la famiglia riceve la notifica» / «Richiesta rifiutata: alla famiglia arriva il motivo»; errore → messaggio del server o «Non riesco a rispondere adesso» |
| Dialogo | **Conferma lo spostamento** | `rescheduleClubAppointment(id, {date, time, note, version})` → **rilettura completa** (`listClubAppointments`: ADR-0101, la riga vecchia e chiusa e quella nuova non esiste nell'elenco), dialogo chiuso, toast «Appuntamento spostato: la famiglia riceve il nuovo orario»; validazione «Indica il nuovo giorno e il nuovo orario»; errore → messaggio o «Non riesco a spostarlo adesso» |
| Dialogo | **Concluso** / **Assente** | `closeClubAppointment(id, {outcome: "complete"\|"no-show", note, version})` → riga sostituita, toast «Appuntamento concluso» / «Assenza registrata: resta una nota interna»; errore → messaggio o «Non riesco a chiuderlo adesso» |
| Dialogo | **Annulla l'appuntamento** | `cancelClubAppointment` (come sopra) e chiude il dialogo |
| Dialogo | **Chiudi** | chiude |
| Note | **Aggiungi Nota** | `addClubData(clubId, "secretariat_notes", note)` (§3) |
| Note | matita | modifica inline (§3) |
| Note | **Salva** (modifica) | `updateClubDataArray(clubId, "secretariat_notes", updatedNotes)` (**riscrive l'intera colonna**) → toast «Nota aggiornata con successo» / «Errore nell'aggiornare la nota» |
| Note | **Annulla** (modifica) | esce dalla modifica |
| Note | cestino | `deleteClubDataItem(clubId, "secretariat_notes", id)` → toast «Nota eliminata con successo» / «Errore nell'eliminare la nota» |

Ogni scrittura degli appuntamenti porta l'intestazione `x-active-club-id` e
la `version` della riga (controllo ottimistico: un 409 arriva a toast). I
pulsanti di decisione sono disabilitati durante `decidendo`.

## 3. Moduli

### Orari di apertura (per giorno)

| Campo | Tipo | Valore iniziale | Validazione |
|---|---|---|---|
| `{day}-morning-start`, `{day}-morning-end` | `time` | `""` | nessuna (una sola estremita produce `"HH:MM-"` o `"-HH:MM"`) |
| `morningStaff` | `select` su `staffMembers` (valore = **nome**), «Seleziona staff»; senza staff: «Nessun membro dello staff trovato - Aggiungi staff dalla pagina Staff» | `""` | nessuna |
| `{day}-afternoon-start/end`, `afternoonStaff` | idem | | |

Salvataggio in blocco con **Salva Orari** (una scrittura). Nessuna guardia
sulle modifiche non salvate.

### Nuovo appuntamento (dal desk)

| Campo | Tipo | Iniziale | Validazione |
|---|---|---|---|
| **Data \*** | `date`, `min = oggi` | oggi | obbligatoria |
| **Titolo \*** | testo, placeholder «Titolo appuntamento» | `""` | obbligatorio |
| **Orario \*** | `select` con `optgroup` Mattina/Pomeriggio: slot ogni **30 minuti** ricavati dagli **orari di apertura** del giorno (`buildAppointmentSlots`), «Seleziona orario». Senza data: avviso giallo «Seleziona prima una data per vedere gli orari disponibili». Senza orari per quel giorno: avviso rosso «⚠️ Nessun orario di apertura configurato per {giorno}. Configura gli orari nella sezione "Orari di Apertura" o seleziona un altro giorno.» | `""` | obbligatorio |
| **Nominativo \*** | testo con `datalist` (`personOptions`; opzioni con `label = "{nome} • collegato a {atleta}"` per tutori/atleti), placeholder «Cerca atleta, genitore, tutore, staff o allenatore»; nota «La ricerca include atleti, tutori, genitori, staff e allenatori registrati nel club.»; se il testo coincide con un'opzione che ha `athleteLabel` e «Atleta» e vuoto, lo compila | `""` | obbligatorio |
| **Atleta collegato (opzionale)** | testo con `datalist` (`athleteOptions`) | `""` | — |
| **Descrizione (opzionale)** | `Textarea` rows 3, «Dettagli appuntamento» | `""` | — |

Validazione client: `!activeClub` → «Nessun club attivo trovato. Ricarica la
pagina.»; data/titolo/orario/nominativo mancanti → «Inserisci data, titolo,
orario e nominativo per l'appuntamento».

Invio: `createClubAppointment({ date: formatLocalDateOnly(appointmentDate),
time, reason: title, notes: description, internalNotes: "Nominativo: {person}",
outsideAvailability: true, idempotencyKey: "desk-{clubId}-{date}-{time}-{title}"
}, headers)` → `POST /api/v1/appointments`. **`athlete` non viene inviato**
(campo morto, vedi §14). **`confirmed` non viene inviato**: l'appuntamento
del desk nasce `requested` e va confermato a mano (comportamento V1, si
conserva). Successo → riga aggiunta in coda, modulo azzerato (la data resta),
toast «Appuntamento aggiunto con successo»; errore → messaggio del dominio
(per es. «quell'orario e appena stato preso») o «Errore nel salvare
l'appuntamento».

Server (`createAppointment`): `appointments.request`; `outsideAvailability`
richiede `appointments.manage`; `reason` obbligatorio; giorno/orario validi;
`athleteId` (se mandato) dentro il perimetro; idempotenza per chiave.

### Nuova nota / modifica nota

| Campo | Tipo | Iniziale (nuova) | Validazione |
|---|---|---|---|
| **Nuova Nota** (`content`) | `Textarea` rows 3, «Scrivi una nota o un promemoria...» | `""` | obbligatoria: «Inserisci il contenuto della nota» |
| **Data di Scadenza (opzionale)** (`expiryDate`) | `date`, `min = oggi` (solo in creazione) | `undefined` | — (salvata come `Date` da `new Date("YYYY-MM-DD")`, letta con `toISOString().split("T")[0]`) |
| **Destinazione promemoria** (`targetType`) | `select`: Interno dashboard club (`club_dashboard`) · Tutti gli allenatori (`all_trainers`) · Allenatore specifico (`trainer`) · Membro staff specifico (`staff_member`) · Socio specifico (`member`) | `club_dashboard` | cambiare tipo azzera `targetId` |
| **Seleziona destinatario** (`targetId`) | `select` (solo per `trainer`/`staff_member`/`member`) su `trainerOptions` / `staffMembers` / `memberOptions`, «Seleziona...» | `""` | obbligatorio per i tre tipi: «Seleziona il destinatario del promemoria» |
| **Ricevi notifica alla scadenza** (`notificationEnabled`) | checkbox | `false` | — |
| tipo di notifica (`isAllDay`) | radio, solo se notifica attiva: «Promemoria per l'intera giornata (notifica alle 08:00)» / «Orario specifico (notifica 30 min prima)» | `true` | — |
| **Orario** (`notificationTime`) | `time`, solo se `!isAllDay` | `""` | — |

Record scritto: `{ id: "note-{Date.now()}", content, date: new Date(),
expiryDate, notificationEnabled, isAllDay, notificationTime: isAllDay ?
"08:00" : time, targetType, targetId, targetLabel }` (`targetLabel` dall'opzione
scelta; vuoti per `club_dashboard`/`all_trainers`). Il test
`pp-03-bacheca-e-compensi-allenatore` pretende la forma letterale
``const note = { id: `note-${Date.now()}`, content: …`` (il primo campo dopo
`id` deve essere `content`, perche la bacheca dell'allenatore legge
`reminder?.content`). Successo → toast «Nota aggiunta con successo», modulo
azzerato; errore → «Errore nel salvare la nota». In modifica gli stessi
campi (senza `min` sulla scadenza), senza validazione sul contenuto vuoto.

## 4. Filtri e viste

Nessun filtro, nessuna ricerca, nessun ordinamento. Gli appuntamenti si
vedono per **settimana** (calendario) e per **giorno** (lista); le note tutte
insieme. Nessuna vista salvata.

## 5. Azioni di massa

Nessuna.

## 6. Esportazioni e importazioni

Nessuna.

## 7. Permessi

- Rotta in `MANAGEMENT_PATH_PREFIXES` (`/secretariat`), guscio
  `management-area-layout` → `AccessAreaGuard`: raggiungibile dai quattro
  ruoli di gestione (`owner`, `club_manager`, `collaborator`, `staff`).
- **Nessun predicato client** sulla pagina. Server: `secretariat_notes`,
  `opening_hours`, `staff_members`, `members`, `trainers`, `athletes` sono in
  `MANAGEMENT_OPEN_RESOURCES` (lettura e scrittura per tutti e quattro i
  ruoli canonici); `secretariat_notes` e anche in lettura per il trainer (la
  bacheca). Appuntamenti: `appointments.read` (coda intera) e
  `appointments.manage` (conferma, rifiuto, spostamento, annullo, chiusura,
  inserimento fuori slot) = `GESTIONE` (gli stessi quattro ruoli).
  `appointments.request` per la creazione = `GESTIONE`.
- Un **ruolo personalizzato** (`custom:<base>:<slug>`) puo non avere le
  chiavi: il client ha solo lo slug e non puo deciderlo (vedi
  `src/app/documenti/page.tsx`); il server risponde 403 con «Accesso negato».
  La V2 **non aggiunge predicati** (rule 10: non si inventano): tutti i ruoli
  canonici che passano la guardia hanno ogni chiave, e per i ruoli
  personalizzati vale la risposta della rotta.
- Le transizioni disponibili le decide il dominio: `appointment.actions`
  (nomi delle azioni: `confirm`, `reject`, `reschedule`, `cancel`, `complete`,
  `no-show`) — la pagina **non** confronta `transitions` (stati) con nomi di
  azione (W6-51, test `wave6-superfici-6a`).

## 8. Stati

- Loading: «Caricamento dati segreteria...».
- Errore di caricamento: toast, dati vuoti.
- Appuntamento: `status` fra gli otto di `APPOINTMENT_STATUSES` con
  `status_label` (`APPOINTMENT_STATUS_LABELS`): `requested` «In attesa di
  risposta», `confirmed` «Confermato», `rejected` «Rifiutato», `rescheduled`
  «Riprogrammato», `cancelled_by_family` «Annullato dalla famiglia»,
  `cancelled_by_club` «Annullato dalla segreteria», `completed` «Concluso»,
  `no_show` «Assente». La V1 lo mostra come **testo**, mai come badge.
- Vuoti: «Nessun appuntamento per questa data», «Nessuna nota presente».
- Orario del nuovo appuntamento: «Seleziona prima una data…», «Nessun orario
  di apertura configurato per {giorno}…».
- Nota: «Scade: …» (ambra), «Notifica attiva» (blu).
- `decidendo` disabilita i pulsanti del dialogo.

`src/lib/web/status.ts` **non ha** nessuno degli otto stati
dell'appuntamento: `ACTIVITY_STATUS` copre `completed`/`cancelled`; mancano
«In attesa di risposta», «Confermato», «Rifiutato», «Riprogrammato», «Annullato
dalla famiglia», «Annullato dalla segreteria», «Assente» (vedi rapporto §3).

## 9. Flussi distruttivi

- **Annulla appuntamento** (`cancel`): dalla lista del giorno (cestino) e dal
  dialogo. **Nessuna conferma**. Non e una cancellazione: la riga resta con
  `cancelled_by_club` e la famiglia legge la nota (`decision_note`). E
  irreversibile (stato terminale).
- **Rifiuta** (`reject`): nessuna conferma, irreversibile, la famiglia riceve
  il motivo.
- **Elimina nota**: `deleteClubDataItem`, **nessuna conferma**, irreversibile
  (la nota sparisce dalla colonna).
- Concluso/Assente: chiusure terminali senza conferma.

## 10. Navigazione e parametri

In entrata: nessun parametro letto (`?tab=`, `?area=`, `?action=` non
esistono). In uscita: `/appuntamenti` (due link). La Dashboard V2
(`DayRail.tsx`) porta a `/secretariat` sia per «Appuntamenti» sia per
«Promemoria». `MobileTopBar` e `mobile-header` hanno la voce «Segreteria».

## 11. Schede e sezioni

`Tabs defaultValue="opening-hours"` con `TabsList grid-cols-3`: **Orari di
Apertura** (icona Clock) · **Appuntamenti** (CalendarDays) · **Note e
Promemoria** (FileText). Nessun parametro URL, nessuna persistenza.

## 12. Test collegati

- `tests/ui/segreteria-appuntamenti-e-disponibilita.test.mjs` — legge
  `src/app/secretariat/page.tsx`: `href="/appuntamenti"`; import di
  `rescheduleClubAppointment` e `closeClubAppointment`;
  `.includes("reschedule")`, `.includes("complete")`, `.includes("no-show")`;
  il corpo fra `const riprogrammaAppuntamento` e `const chiudiAppuntamento`
  deve contenere `listClubAppointments` e `version: appuntamento.version`.
- `tests/ui/wave6-superfici-6a.test.mjs` — `.actions || []).includes("confirm"|
  "reject"|"cancel")` (o `.actions || []).some`); mai
  `transitions || []).includes("confirm")`; mai `AZIONE_PER_ARRIVO`.
- `tests/ui/pp-03-bacheca-e-compensi-allenatore.test.mjs` — la forma
  ``const note = { id: `note-${Date.now()}`, content:``.
- `tests/auth/route-guards.test.mjs`, `tests/web/shell-navigation.test.mjs`,
  `tests/ui/dashboard-v2-parity.test.mjs` — solo il percorso `/secretariat`.
- `tests/ui/responsive-invariants.test.mjs` — **non** elenca la pagina (le
  griglie `grid-cols-3`/`grid-cols-2` senza breakpoint della V1 sono difetti
  non presidiati).

## 13. Inventario componenti

Tutto inline in `page.tsx`. Import: `Sidebar, Header, DashboardPageContainer,
dashboardMainClassName, SharedPageHeader, Card*, Button, Input, Label,
Tabs*, Calendar (**non usato**), Textarea, Checkbox (**non usato**), Dialog*,
Link`; icone `Clock, CalendarDays, FileText, Plus, Trash2, Edit, Check,
ChevronLeft, ChevronRight` (`Eye`, `ChevronDown` **non usati**); lib
`getClubData, addClubData, deleteClubDataItem, getClubStaff,
updateClubDataArray, getClubAthletes, getClubTrainers`,
`getReminderTargetSummary`, `ReminderTargetType`, `formatLocalDateOnly,
todayLocalDateOnly`, i sette verbi di `appointments-client`. Funzioni locali:
`parseTimeRange`, `buildTimeRange`, `buildAppointmentSlots`,
`intestazioniClub`. Nessun componente specifico da rimuovere fuori dalla
pagina; i componenti `ui/*` sono condivisi e restano.

## 14. Cosa non esiste in V1 e difetti trovati

- **Campo morto «Atleta collegato»**: raccolto e mai inviato
  (`createClubAppointment` non riceve `athleteId`). Il dominio lo accetta ma
  collegarlo cambierebbe il comportamento (notifica ai tutori, perimetro):
  in V2 e un **GAP dichiarato**, candidato a un WP.
- **`internal_notes` invisibile**: il nominativo del desk finisce li e nessuna
  schermata lo rilegge.
- **Nessuna conferma** su rifiuto, annullo, chiusura ed eliminazione nota.
- **Domenica** nella settimana sbagliata; **mese** dell'intestazione sempre
  quello di oggi; **nessun modo di scegliere il giorno** della lista.
- **Toast «info»** a ogni cambio settimana.
- Etichetta «Motivo» sul campo `notes` (il motivo e `reason`).
- Modifica nota **riscrive tutta la colonna** (`updateClubDataArray`);
  creazione ed eliminazione passano da `addClubData`/`deleteClubDataItem`
  (una riga). Si conserva: e il solo scrittore disponibile per la modifica.
- Lo staff negli orari e salvato per **nome**.
- Nessun predicato client sui permessi (coerente con la matrice: tutti i
  ruoli canonici di gestione hanno tutto).

## 15. Sintesi

1. Una pagina, tre schede, tre domini: orari di apertura (`clubs.opening_hours`,
   una riga), appuntamenti (tabella con macchina a stati, `/api/v1/appointments`,
   sette verbi), note e promemoria (`clubs.secretariat_notes`, lette dalla
   bacheca dell'allenatore e dalla Dashboard).
2. Gli appuntamenti si lavorano da un dialogo con le sei mosse decise dal
   dominio (`actions`), una nota che diventa `decision_note` o
   `internal_notes` secondo la mossa, e lo spostamento che rilegge tutto
   (ADR-0101).
3. Il nuovo appuntamento del desk usa gli slot di 30 minuti degli orari di
   apertura, nasce `requested`, scrive il nominativo in `internal_notes`.
4. Le note hanno cinque destinazioni, una scadenza e una notifica (giornata
   intera alle 08:00 o orario con 30 minuti di anticipo).
5. Niente filtri, viste, export, azioni di massa, conferme, parametri URL.
